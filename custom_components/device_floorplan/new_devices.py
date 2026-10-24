"""Notice devices added to HA after the planner was set up.

When a new physical device shows up we wait a little (pairing usually adds
several devices in a row, and the area is often set a moment later), then:
  * optionally put it on the plan as "approximate" next to its room's pin,
  * fire `device_floorplan_new_device` for automations / the blueprint,
  * optionally raise one HA notification for the whole batch.
The notification is dismissed once every device in it was placed or skipped.
"""

from __future__ import annotations

from math import cos, sin
import logging
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_call_later

from .const import (
    CONF_AUTO_PLACE_NEW,
    CONF_NOTIFY_NEW,
    DEFAULT_AUTO_PLACE_NEW,
    DEFAULT_NOTIFY_NEW,
    EVENT_NEW_DEVICE,
    NAME,
    NEW_DEVICE_BATCH_SECONDS,
    NOTIFICATION_ID,
    PANEL_URL_PATH,
    SIGNAL_DEVICES_CHANGED,
)
from .devices import VIRTUAL_INTEGRATIONS, _connections, _integrations, is_plan_device
from .store import FloorplanData

_LOGGER = logging.getLogger(__name__)


class NewDeviceWatcher:
    """Collects new devices and handles them in batches."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, data: FloorplanData) -> None:
        self.hass = hass
        self.entry = entry
        self.data = data
        self.pending: set[str] = set()
        self.notified: set[str] = set()
        self._timer: CALLBACK_TYPE | None = None

    @callback
    def async_start(self) -> None:
        self.entry.async_on_unload(
            self.hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, self._registry_event)
        )
        self.entry.async_on_unload(
            async_dispatcher_connect(self.hass, SIGNAL_DEVICES_CHANGED, self._maybe_dismiss)
        )
        self.entry.async_on_unload(self._cancel)

    @callback
    def _cancel(self) -> None:
        if self._timer:
            self._timer()
            self._timer = None

    @callback
    def _registry_event(self, event: Event) -> None:
        if not self.data.setup_done:
            return
        action = event.data.get("action")
        device_id = event.data.get("device_id")
        if action == "remove":
            self.pending.discard(device_id)
            return
        if action not in ("create", "update") or not device_id:
            return
        if action == "update" and device_id not in self.pending:
            return
        if device_id in self.data.seen or self.data.skipped.get(device_id):
            return
        self.pending.add(device_id)
        self._cancel()
        self._timer = async_call_later(self.hass, NEW_DEVICE_BATCH_SECONDS, self._flush)

    @callback
    def _flush(self, _now: Any = None) -> None:
        self._timer = None
        dev_reg = dr.async_get(self.hass)
        ent_reg = er.async_get(self.hass)
        area_reg = ar.async_get(self.hass)
        options = self.entry.options
        auto_place = options.get(CONF_AUTO_PLACE_NEW, DEFAULT_AUTO_PLACE_NEW)
        notify = options.get(CONF_NOTIFY_NEW, DEFAULT_NOTIFY_NEW)

        batch: list[dict[str, Any]] = []
        for device_id in sorted(self.pending):
            device = dev_reg.async_get(device_id)
            if device is None or device.disabled_by is not None or is_plan_device(device):
                continue
            if device_id in self.data.seen or self.data.skipped.get(device_id):
                continue
            entities = er.async_entries_for_device(ent_reg, device_id)
            # Bluetooth twins etc. are merged into their parent: not "new".
            if device.via_device_id and not entities:
                continue
            integrations = _integrations(self.hass, device)
            conns, virtual = _connections(device, integrations)
            if virtual or VIRTUAL_INTEGRATIONS.intersection(integrations[:1]):
                continue
            area = area_reg.async_get_area(device.area_id) if device.area_id else None
            placed_on = self._auto_place(device) if auto_place else None
            name = device.name_by_user or device.name or device_id
            info = {
                "device_id": device_id,
                "name": name,
                "area_id": device.area_id,
                "area_name": area.name if area else None,
                "plan_id": placed_on,
                "auto_placed": placed_on is not None,
            }
            batch.append(info)
            self.hass.bus.async_fire(EVENT_NEW_DEVICE, info)
        self.pending.clear()

        if not batch or not notify:
            return
        self.notified.update(d["device_id"] for d in batch)
        self._notify(batch)

    @callback
    def _auto_place(self, device: dr.DeviceEntry) -> str | None:
        if not device.area_id:
            return None
        best = None
        for plan in self.data.plans.values():
            if device.area_id in plan.get("anchors", {}):
                if best is None or plan.get("kind") == "floor":
                    best = plan
        if best is None:
            return None
        anchor = best["anchors"][device.area_id]
        n = sum(1 for _ in best["positions"]) % 12 + 1
        angle = n * 2.4
        radius = 3 + (n % 4)
        x = min(98.0, max(2.0, anchor["x"] + cos(angle) * radius))
        y = min(98.0, max(2.0, anchor["y"] + sin(angle) * radius * 1.5))
        self.data.place_device(best["id"], device.id, x, y, approx=True)
        return best["id"]

    @callback
    def _notify(self, batch: list[dict[str, Any]]) -> None:
        open_ids = [d for d in self.notified if d not in self.data.seen and not self.data.skipped.get(d)]
        if not open_ids:
            return
        dev_reg = dr.async_get(self.hass)
        lines = []
        for device_id in open_ids[:10]:
            device = dev_reg.async_get(device_id)
            if device is None:
                continue
            info = next((b for b in batch if b["device_id"] == device_id), None)
            name = device.name_by_user or device.name or device_id
            if info and info["auto_placed"]:
                lines.append(f"- **{name}**: placed approximately near {info['area_name']}")
            elif info and info["area_name"]:
                lines.append(f"- **{name}** ({info['area_name']}): mark that room on a plan to place it")
            else:
                lines.append(f"- **{name}**: choose where it goes")
        more = len(open_ids) - len(lines)
        if more > 0:
            lines.append(f"- and {more} more")
        count = len(open_ids)
        title = f"{NAME}: {count} new device{'s' if count != 1 else ''}"
        message = (
            "\n".join(lines)
            + f"\n\n[Open the planner](/{PANEL_URL_PATH}?new=1) to fine-tune or skip them."
        )
        persistent_notification.async_create(self.hass, message, title, NOTIFICATION_ID)

    @callback
    def _maybe_dismiss(self) -> None:
        if not self.notified:
            return
        open_ids = [d for d in self.notified if d not in self.data.seen and not self.data.skipped.get(d)]
        if not open_ids:
            persistent_notification.async_dismiss(self.hass, NOTIFICATION_ID)
            self.notified.clear()
