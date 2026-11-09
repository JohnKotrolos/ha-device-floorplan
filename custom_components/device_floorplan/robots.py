"""0.10: robot vacuums. Remembers when each room was last cleaned, from where the robot is while it cleans.

Works with any map integration that reports the robot's position (vacuum_position…) or its current
room: the position goes through the plan's alignment (m) into the room shapes drawn in the Editor.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event

from .const import SIGNAL_PLAN_UPDATED

POS_KEYS = ("vacuum_position", "robot_position", "position")
ROOM_KEYS = ("vacuum_room", "current_segment", "current_room")
MAP_KEYS = ("map_name", "selected_map", "current_map", "active_map", "map_id")
REFRESH = 60  # seconds between two "still cleaning this room" updates


def _pt(v: Any) -> tuple[float, float] | None:
    try:
        if isinstance(v, dict):
            return float(v["x"]), float(v["y"])
        if isinstance(v, (list, tuple)) and len(v) in (2, 3):
            return float(v[0]), float(v[1])
    except (KeyError, TypeError, ValueError):
        pass
    return None


def room_ids(attrs: dict[str, Any]) -> set[str]:
    rooms = attrs.get("rooms") or attrs.get("segments")
    if isinstance(rooms, dict):
        return {str(k) for k in rooms}
    if isinstance(rooms, list):
        out = set()
        for i, r in enumerate(rooms):
            if isinstance(r, dict):
                out.add(str(r.get("id", r.get("segment_id", r.get("room_id", i)))))
        return out
    return set()


def map_name(attrs: dict[str, Any]) -> str | None:
    for k in MAP_KEYS:
        v = attrs.get(k)
        if v not in (None, "") and not isinstance(v, (dict, list)):
            return str(v)
    return None


def map_match(saved: dict[str, Any] | None, attrs: dict[str, Any]) -> bool:
    """Is the robot on the map this plan was aligned with? (Robots that do several floors.)"""
    if not saved:
        return True
    name = map_name(attrs)
    if saved.get("name") and name:
        return saved["name"] == name
    want = set(saved.get("rooms") or [])
    have = room_ids(attrs)
    if not want or not have:
        return True
    return len(want & have) * 2 >= max(len(want), 1)


def _inside(x: float, y: float, poly: list) -> bool:
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i][0], poly[i][1]
        xj, yj = poly[j][0], poly[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            hit = not hit
        j = i
    return hit


class RobotWatcher:
    """Follows every robot on every plan and stamps the room it cleans."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, data: Any) -> None:
        self.hass = hass
        self.entry = entry
        self.data = data
        self._unsub: CALLBACK_TYPE | None = None
        self._watched: tuple[str, ...] = ()

    @callback
    def async_start(self) -> None:
        self.entry.async_on_unload(async_dispatcher_connect(self.hass, SIGNAL_PLAN_UPDATED, self._resubscribe))
        self.entry.async_on_unload(self._stop)
        if self.hass.is_running:
            self._resubscribe()
        else:
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, lambda _e: self._resubscribe())

    @callback
    def _stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def _resubscribe(self, _plan_id: str | None = None) -> None:
        ents: set[str] = set()
        for plan in self.data.plans.values():
            for eid, r in (plan.get("robots") or {}).items():
                ents.add(eid)
                if r.get("source"):
                    ents.add(r["source"])
        watched = tuple(sorted(ents))
        if watched == self._watched:
            return
        self._stop()
        self._watched = watched
        if watched:
            self._unsub = async_track_state_change_event(self.hass, list(watched), self._changed)

    @callback
    def _changed(self, event: Event) -> None:
        eid = event.data["entity_id"]
        for plan_id, plan in self.data.plans.items():
            for vac, r in (plan.get("robots") or {}).items():
                if eid in (vac, r.get("source")):
                    self._stamp(plan_id, plan, vac, r)

    @callback
    def _stamp(self, plan_id: str, plan: dict[str, Any], vac: str, r: dict[str, Any]) -> None:
        vs = self.hass.states.get(vac)
        if not vs or vs.state != "cleaning":
            return
        ms = self.hass.states.get(r["source"]) if r.get("source") else None
        attrs = {**vs.attributes, **(ms.attributes if ms else {})}
        if not map_match(r.get("map"), attrs):
            return
        area = None
        # HA's own room mapping (2026.3+) first, else where the robot is on the plan's room shapes.
        room = next((attrs[k] for k in ROOM_KEYS if attrs.get(k) not in (None, "") and not isinstance(attrs[k], (dict, list))), None)
        if room is not None:
            ent = er.async_get(self.hass).async_get(vac)
            mapping = ((ent.options.get("vacuum") or {}).get("area_mapping") if ent else None) or {}
            area = next((a for a, segs in mapping.items() if str(room) in [str(s) for s in segs or []]), None)
        m = r.get("m")
        pos = next((p for p in (_pt(attrs.get(k)) for k in POS_KEYS) if p), None)
        if not area and pos and isinstance(m, list) and len(m) == 6:
            x = m[0] * pos[0] + m[1] * pos[1] + m[2]
            y = m[3] * pos[0] + m[4] * pos[1] + m[5]
            hidden = set(plan.get("hidden_rooms") or [])
            area = next((a for a, poly in (plan.get("shapes") or {}).items() if a not in hidden and len(poly) >= 3 and _inside(x, y, poly)), None)
        if not area:
            return
        cleaned = plan.setdefault("cleaned", {})
        now = datetime.now(timezone.utc)
        prev = cleaned.get(area) or {}
        try:
            age = (now - datetime.fromisoformat(prev["t"])).total_seconds() if prev.get("t") else None
        except (TypeError, ValueError):
            age = None
        if prev.get("by") == vac and age is not None and age < REFRESH:
            return
        cleaned[area] = {"t": now.isoformat(timespec="seconds"), "by": vac}
        self.data.touch()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)
