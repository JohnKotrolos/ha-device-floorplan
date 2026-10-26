"""One sensor per plan (positions in attributes) and a "new devices" counter."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    SIGNAL_DEVICES_CHANGED,
    SIGNAL_PLAN_ADDED,
    SIGNAL_PLAN_REMOVED,
    SIGNAL_PLAN_UPDATED,
)
from .devices import build_plan_payload, list_devices
from .entity import plan_device_info, sync_plan_device
from .store import FloorplanData


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    data: FloorplanData = hass.data[DOMAIN]
    entities: list[SensorEntity] = [PlanSensor(data, pid) for pid in list(data.plans)]
    entities.append(NewDevicesSensor(data))
    async_add_entities(entities)

    @callback
    def _plan_added(plan_id: str) -> None:
        async_add_entities([PlanSensor(data, plan_id)])

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_PLAN_ADDED, _plan_added))


class PlanSensor(SensorEntity):
    """State = number of devices on the plan; attributes = the positions."""

    _attr_should_poll = False
    _attr_icon = "mdi:floor-plan"
    _attr_native_unit_of_measurement = "devices"
    # Positions can be large and change often: keep them out of the recorder.
    _unrecorded_attributes = frozenset(
        {
            "plan_id", "plan_name", "kind", "floor_id", "level", "image_type",
            "image_url", "image_fallback_url", "image_width", "image_height", "metres_per_px_x",
            "metres_per_px_y", "real_width_m", "real_height_m", "approx_count",
            "devices", "entities", "bonds", "phantoms", "zigbee_devices", "areas",
        }
    )

    def __init__(self, data: FloorplanData, plan_id: str) -> None:
        self._data = data
        self._plan_id = plan_id
        self._attr_unique_id = f"{DOMAIN}_{plan_id}"
        self._attr_has_entity_name = False
        self._attr_name = f"Device Floorplan {data.plans[plan_id]['name']}"
        self.entity_id = f"sensor.{DOMAIN}_{plan_id}"
        self._attr_device_info = plan_device_info(data.plans[plan_id], data.hass)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PLAN_UPDATED, self._plan_updated)
        )
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PLAN_REMOVED, self._plan_removed)
        )
        self.async_on_remove(
            self.hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, self._registry_updated)
        )
        self._refresh()

    @callback
    def _refresh(self) -> None:
        plan = self._data.plans.get(self._plan_id)
        if plan is None:
            return
        payload: dict[str, Any] = build_plan_payload(self.hass, self._data, plan)
        self._attr_native_value = len(payload["devices"]) + len(payload["entities"])
        self._attr_extra_state_attributes = payload

    @callback
    def _plan_updated(self, plan_id: str) -> None:
        if plan_id != self._plan_id:
            return
        sync_plan_device(self.hass, self._data, plan_id)
        self._refresh()
        self.async_write_ha_state()

    @callback
    def _registry_updated(self, _event: Event) -> None:
        self._refresh()
        self.async_write_ha_state()

    @callback
    def _plan_removed(self, plan_id: str) -> None:
        if plan_id != self._plan_id:
            return
        registry = er.async_get(self.hass)
        if self.registry_entry is not None:
            registry.async_remove(self.entity_id)
        else:
            self.hass.async_create_task(self.async_remove(force_remove=True))
        dev_reg = dr.async_get(self.hass)
        device = dev_reg.async_get_device(identifiers={(DOMAIN, plan_id)})
        if device is not None:
            dev_reg.async_remove_device(device.id)


class NewDevicesSensor(SensorEntity):
    """How many devices are new since setup and still waiting to be placed or skipped."""

    _attr_should_poll = False
    _attr_icon = "mdi:map-marker-plus"
    _attr_native_unit_of_measurement = "devices"
    _unrecorded_attributes = frozenset({"devices"})

    def __init__(self, data: FloorplanData) -> None:
        self._data = data
        self._attr_unique_id = f"{DOMAIN}_new_devices"
        self._attr_name = "Device Floorplan new devices"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_DEVICES_CHANGED, self._update)
        )
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PLAN_UPDATED, self._plan_update)
        )
        self.async_on_remove(
            self.hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, self._registry_updated)
        )
        self._refresh()

    @callback
    def _refresh(self) -> None:
        if not self._data.setup_done:
            self._attr_native_value = 0
            self._attr_extra_state_attributes = {"devices": []}
            return
        listing = list_devices(self.hass, self._data)
        new = [
            d["name"]
            for d in listing["devices"]
            if not d["virtual"]
            and d["id"] not in self._data.seen
            and not self._data.skipped.get(d["id"])
            and not self._data.placed_anywhere(d["id"])
        ]
        self._attr_native_value = len(new)
        self._attr_extra_state_attributes = {"devices": new[:50]}

    @callback
    def _update(self) -> None:
        self._refresh()
        self.async_write_ha_state()

    @callback
    def _plan_update(self, _plan_id: str) -> None:
        self._update()

    @callback
    def _registry_updated(self, _event: Event) -> None:
        self._update()
