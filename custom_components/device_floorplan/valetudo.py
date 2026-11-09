"""0.10: Valetudo robots. Valetudo sends its map to HA as an MQTT camera whose PNG carries the map data
(zTXt chunk "ValetudoMap", zlib JSON). This turns it into a map sensor like other map integrations have:
vacuum_position, charger_position, path and rooms, in mm.
"""

from __future__ import annotations

import json
import logging
import struct
import zlib
from datetime import timedelta
from typing import Any

from homeassistant.components.camera import async_get_image
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

KEY = b"ValetudoMap\0"
POLL = timedelta(seconds=3)
SCAN = timedelta(seconds=60)
MAX_PATH = 4000  # points kept of the robot's path


def map_json(png: bytes) -> dict[str, Any] | None:
    """The Valetudo map inside a PNG, or None when it is another picture."""
    if not png or png[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    i = 8
    while i + 8 <= len(png):
        (n,) = struct.unpack(">I", png[i : i + 4])
        kind = png[i + 4 : i + 8]
        body = png[i + 8 : i + 8 + n]
        if kind == b"zTXt" and body.startswith(KEY):
            try:
                return json.loads(zlib.decompress(body[len(KEY) + 1 :]))
            except (zlib.error, ValueError):
                return None
        if kind == b"IEND":
            break
        i += 12 + n
    return None


def map_attrs(vm: dict[str, Any]) -> dict[str, Any]:
    """Valetudo map (cm, layers in pixels) → the attributes the floorplan reads (mm)."""
    px = float(vm.get("pixelSize") or 5) * 10  # mm per pixel
    out: dict[str, Any] = {"map_source": "valetudo"}
    rooms: dict[str, Any] = {}
    for layer in vm.get("layers") or []:
        meta = layer.get("metaData") or {}
        dim = layer.get("dimensions") or {}
        if layer.get("type") != "segment" or "x" not in dim or "y" not in dim:
            continue
        sid = str(meta.get("segmentId", len(rooms)))
        room = {
            "name": meta.get("name") or f"Room {sid}",
            "x0": round(dim["x"]["min"] * px),
            "y0": round(dim["y"]["min"] * px),
            "x1": round((dim["x"]["max"] + 1) * px),
            "y1": round((dim["y"]["max"] + 1) * px),
        }
        area = meta.get("area") or (dim.get("pixelCount") or 0) * px * px / 100  # cm²
        if area:
            room["area"] = round(float(area) / 10000, 1)  # m²
        rooms[sid] = room
    out["rooms"] = rooms
    paths = []
    for ent in vm.get("entities") or []:
        pts = ent.get("points") or []
        kind = ent.get("type")
        if len(pts) < 2:
            continue
        if kind == "robot_position":
            angle = (ent.get("metaData") or {}).get("angle")
            out["vacuum_position"] = {"x": round(pts[0] * 10), "y": round(pts[1] * 10)}
            if isinstance(angle, (int, float)):
                out["vacuum_position"]["a"] = round(angle - 90)  # Valetudo: 0 = up, clockwise
        elif kind == "charger_location":
            out["charger_position"] = {"x": round(pts[0] * 10), "y": round(pts[1] * 10)}
        elif kind == "path":
            paths.append([round(v * 10) for v in pts])
    total = sum(len(p) for p in paths) // 2
    if total > MAX_PATH:
        step = -(-total // MAX_PATH)
        paths = [[v for k in range(0, len(p) - 1, 2 * step) for v in (p[k], p[k + 1])] for p in paths]
    out["path"] = paths
    return out


def _read(png: bytes) -> dict[str, Any] | None:
    vm = map_json(png)
    return map_attrs(vm) if vm else None


@callback
def async_setup_valetudo(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
    """Find Valetudo map cameras (MQTT) now and then, and give each one a map sensor."""
    known: set[str] = set()
    busy = False

    async def scan(_now: Any = None) -> None:
        nonlocal busy
        if busy:
            return
        busy = True
        try:
            reg = er.async_get(hass)
            for ent in list(reg.entities.values()):
                if ent.domain != "camera" or ent.platform != "mqtt" or ent.id in known or ent.disabled_by:
                    continue
                try:
                    img = await async_get_image(hass, ent.entity_id, timeout=5)
                except Exception:  # noqa: BLE001 - no picture yet: try again next scan
                    continue
                if map_json(img.content) is None:
                    continue
                known.add(ent.id)
                add([ValetudoMapSensor(hass, ent)])
        finally:
            busy = False

    entry.async_on_unload(async_track_time_interval(hass, scan, SCAN))
    if hass.is_running:
        hass.async_create_task(scan())
    else:
        entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, lambda _e: hass.async_create_task(scan())))


class ValetudoMapSensor(SensorEntity):
    """State = number of rooms; attributes = robot, dock, path and rooms in mm."""

    _attr_should_poll = False
    _attr_icon = "mdi:map"
    _attr_has_entity_name = False
    _unrecorded_attributes = frozenset({"vacuum_position", "charger_position", "path", "rooms", "map_source", "camera"})

    def __init__(self, hass: HomeAssistant, cam: er.RegistryEntry) -> None:
        self._cam = cam.entity_id
        self._last: bytes | None = None
        self._attr_unique_id = f"{DOMAIN}_valetudo_{cam.id}"
        obj = cam.entity_id.split(".", 1)[1]
        self.entity_id = f"sensor.{obj}_floorplan"
        self._attr_name = f"{cam.name or cam.original_name or obj} (floorplan)"
        dev = dr.async_get(hass).async_get(cam.device_id) if cam.device_id else None
        if dev:
            # Shown with the robot's other entities.
            self._attr_device_info = DeviceInfo(identifiers=dev.identifiers, connections=dev.connections)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_track_time_interval(self.hass, self._poll, POLL))
        await self._poll()

    async def _poll(self, _now: Any = None) -> None:
        try:
            img = (await async_get_image(self.hass, self._cam, timeout=5)).content
        except Exception:  # noqa: BLE001 - camera gone or no picture: keep the last map
            return
        if img == self._last:
            return
        self._last = img
        attrs = await self.hass.async_add_executor_job(_read, img)
        if attrs is None:
            return
        attrs["camera"] = self._cam
        self._attr_native_value = len(attrs["rooms"])
        self._attr_extra_state_attributes = attrs
        self.async_write_ha_state()
