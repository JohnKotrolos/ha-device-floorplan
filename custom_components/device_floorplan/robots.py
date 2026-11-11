"""0.10: robot vacuums. Remembers when each room was last cleaned, from where the robot is while it cleans.

Works with any map integration that reports the robot's position (vacuum_position…) or its current
room: the position goes through the plan's alignment (m) into the room shapes drawn in the Editor.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from math import hypot
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_CALL_SERVICE, EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)

from .const import SIGNAL_PLAN_UPDATED

POS_KEYS = ("vacuum_position", "robot_position", "position")
ROOM_KEYS = ("vacuum_room", "current_segment", "current_room")
MAP_KEYS = ("map_name", "selected_map", "current_map", "active_map", "map_id")
REFRESH = 60  # seconds between two "still cleaning this room" updates
PATH_KEYS = ("path", "vacuum_path", "cleaned_path")
SWATH = 0.22  # metres cleaned beside the path, when the robot doesn't report the area it cleaned
COUNTS = 0.6  # a room counts as cleaned when the robot did at least this share of what it usually does there
PACE = 7  # days between cleanings, unless set per plan or room
# The robot's "area cleaned in this run" sensor (not its lifetime total).
AREA_RE = re.compile(r"(clean(ed|ing)?_?area|statistics_area|current_area|area_cleaned)")
END_STATES = ("docked", "idle", "returning", "charging", "off")


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


def _lines(v: Any, out: list | None = None, d: int = 0) -> list[list[tuple[float, float]]]:
    """Every polyline in a path attribute, whatever its nesting (same rule as the card)."""
    out = [] if out is None else out
    if d > 6 or not isinstance(v, (list, dict)):
        return out
    if isinstance(v, dict):
        for w in v.values():
            _lines(w, out, d + 1)
        return out
    pts = [_pt(p) for p in v]
    if len(v) > 1 and all(pts):
        out.append(pts)
    elif len(v) > 3 and len(v) % 2 == 0 and all(isinstance(n, (int, float)) for n in v):
        out.append([(float(v[i]), float(v[i + 1])) for i in range(0, len(v), 2)])
    else:
        for w in v:
            _lines(w, out, d + 1)
    return out


def _rooms(attrs: dict[str, Any]) -> list[dict[str, Any]]:
    """Rooms of a map attribute as boxes {x0, y0, x1, y1, area?} (robot units; area in m²)."""
    rooms = attrs.get("rooms") or attrs.get("segments")
    items = rooms.values() if isinstance(rooms, dict) else rooms if isinstance(rooms, list) else []
    out = []
    for r in items:
        if not isinstance(r, dict):
            continue
        b = r.get("box") if isinstance(r.get("box"), list) else [r.get("x0"), r.get("y0"), r.get("x1"), r.get("y1")]
        try:
            x0, y0, x1, y1 = (float(v) for v in b)
            area = float(r["area"]) if r.get("area") else None
        except (TypeError, ValueError):
            continue
        out.append({"x0": min(x0, x1), "y0": min(y0, y1), "x1": max(x0, x1), "y1": max(y0, y1), "area": area})
    return out


def pace_of(plan: dict[str, Any], area: str) -> float:
    """Days between cleanings for a room (0 = never due)."""
    v = (plan.get("pace") or {}).get(area)
    if v is None:
        v = plan.get("pace_default", PACE)
    try:
        return max(0.0, float(v))
    except (TypeError, ValueError):
        return PACE


def due_rooms(plan: dict[str, Any], now: datetime | None = None) -> list[str]:
    """Rooms a robot cleaned before and that are due again (for automations: "clean what is due")."""
    if not plan.get("robots"):
        return []
    now = now or datetime.now(timezone.utc)
    hidden = set(plan.get("hidden_rooms") or [])
    out = []
    for area, c in (plan.get("cleaned") or {}).items():
        days = pace_of(plan, area)
        if area in hidden or not days or not c.get("t"):
            continue
        try:
            age = (now - datetime.fromisoformat(c["t"])).total_seconds() / 86400
        except (TypeError, ValueError):
            continue
        if age >= days:
            out.append(area)
    return sorted(out)


class RobotWatcher:
    """Follows every robot on every plan and stamps the room it cleans, with how much of it."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, data: Any) -> None:
        self.hass = hass
        self.entry = entry
        self.data = data
        self._unsub: CALLBACK_TYPE | None = None
        self._watched: tuple[str, ...] = ()
        # The room each robot is in right now, per plan: {(plan, vacuum): {"area", "start", "last"}}.
        self._visit: dict[tuple[str, str], dict[str, Any]] = {}
        # This run, per plan and robot: {"rooms": {area: m²}, "visited", "ref": {area: robot's room size}, "base": m², "cur": area}.
        self._run: dict[tuple[str, str], dict[str, Any]] = {}
        # Rooms asked with vacuum.clean_area, for robots that don't say where they are.
        self._asked: dict[str, list[str]] = {}
        self._due: dict[str, list[str]] = {}
        self._ended: set[str] = set()

    @callback
    def async_start(self) -> None:
        for plan in self.data.plans.values():
            plan.pop("now", None)  # a run cut by a restart: nothing is being cleaned now
        self.entry.async_on_unload(async_dispatcher_connect(self.hass, SIGNAL_PLAN_UPDATED, self._resubscribe))
        self.entry.async_on_unload(self._stop)
        self.entry.async_on_unload(self.hass.bus.async_listen(EVENT_CALL_SERVICE, self._service))
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._tick, timedelta(minutes=10)))
        if self.hass.is_running:
            self._resubscribe()
        else:
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, self._resubscribe)

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
    def _tick(self, _now: Any = None) -> None:
        """Rooms become due with time alone: refresh the plan sensor when its due list changes."""
        for plan_id, plan in self.data.plans.items():
            due = due_rooms(plan)
            if plan_id in self._due and due != self._due[plan_id]:
                async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)
            self._due[plan_id] = due

    @callback
    def _service(self, event: Event) -> None:
        d = event.data
        if d.get("domain") != "vacuum" or d.get("service") != "clean_area":
            return
        sd = d.get("service_data") or {}
        areas = sd.get("cleaning_area_id") or []
        eids = sd.get("entity_id") or []
        areas = [areas] if isinstance(areas, str) else list(areas)
        for eid in [eids] if isinstance(eids, str) else eids:
            self._asked[eid] = [str(a) for a in areas]

    @callback
    def _changed(self, event: Event) -> None:
        eid = event.data["entity_id"]
        for plan_id, plan in self.data.plans.items():
            for vac, r in (plan.get("robots") or {}).items():
                if eid in (vac, r.get("source")):
                    self._stamp(plan_id, plan, vac, r)
        for vac in self._ended:
            self._asked.pop(vac, None)
        self._ended.clear()

    def _area_now(self, vac: str) -> float | None:
        """The robot's "cleaned in this run" sensor, in m² (None when it has none)."""
        reg = er.async_get(self.hass)
        ent = reg.async_get(vac)
        if not ent or not ent.device_id:
            return None
        for e in er.async_entries_for_device(reg, ent.device_id):
            if e.domain != "sensor" or "total" in e.entity_id or not AREA_RE.search(f"{e.entity_id} {e.original_name or ''} {e.translation_key or ''}".lower()):
                continue
            st = self.hass.states.get(e.entity_id)
            try:
                v = float(st.state) if st else None
            except ValueError:
                continue
            if v is None:
                continue
            unit = str(st.attributes.get("unit_of_measurement") or "")
            return v / 10000 if unit.startswith("cm") else v / 1e6 if unit.startswith("mm") else v
        return None

    def _path_area(self, plan: dict[str, Any], m: list, attrs: dict[str, Any], area: str) -> float | None:
        """m² the robot covered in a room this run, from its path: length inside the room × SWATH."""
        path = next((attrs[k] for k in PATH_KEYS if attrs.get(k)), None)
        poly = (plan.get("shapes") or {}).get(area)
        if not path or not poly or len(poly) < 3:
            return None
        s = self.data.scale(plan)
        w, h = plan.get("width") or 0, plan.get("height") or 0
        # Metres per plan % when the plan is measured, else robot units taken as mm.
        mx = w * s["x"] / 100 if s["x"] and w else None
        my = h * s["y"] / 100 if s["y"] and h else None
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        box = (min(xs), min(ys), max(xs), max(ys))
        length = 0.0
        for line in _lines(path):
            prev = None
            for rx, ry in line:
                x = m[0] * rx + m[1] * ry + m[2]
                y = m[3] * rx + m[4] * ry + m[5]
                inside = box[0] <= x <= box[2] and box[1] <= y <= box[3] and _inside(x, y, poly)
                if inside and prev:
                    length += hypot((x - prev[0]) * mx, (y - prev[1]) * my) if mx and my else hypot(rx - prev[2], ry - prev[3]) / 1000
                prev = (x, y, rx, ry) if inside else None
        return length * SWATH

    @callback
    def _stamp(self, plan_id: str, plan: dict[str, Any], vac: str, r: dict[str, Any]) -> None:
        vs = self.hass.states.get(vac)
        state = vs.state if vs else "unavailable"
        if state != "cleaning":
            self._close(plan_id, plan, vac)
            if state in END_STATES:
                self._end_run(plan_id, plan, vac)
            return
        ms = self.hass.states.get(r["source"]) if r.get("source") else None
        attrs = {**vs.attributes, **(ms.attributes if ms else {})}
        if not map_match(r.get("map"), attrs):
            return
        run = self._run.setdefault((plan_id, vac), {"rooms": {}, "visited": set(), "ref": {}, "base": None, "cur": None, "seen": False, "w": None})
        total = self._area_now(vac)
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
        # Area cleaned since the last update goes to the room the robot was in.
        if total is not None:
            if run["base"] is not None and run["cur"] and total >= run["base"]:
                run["rooms"][run["cur"]] = run["rooms"].get(run["cur"], 0.0) + total - run["base"]
            run["base"] = total
        run["cur"] = area
        if not area:
            return
        run["seen"] = True
        run["visited"].add(area)
        # The robot's own size of the room it is in (Valetudo and others report room areas in m²).
        if pos:
            own = [rr.get("area") for rr in _rooms(attrs) if rr.get("area") and rr["x0"] <= pos[0] <= rr["x1"] and rr["y0"] <= pos[1] <= rr["y1"]]
            if own:
                run["ref"][area] = max(run["ref"].get(area, 0), min(own))
        if total is None and isinstance(m, list) and len(m) == 6:
            cov = self._path_area(plan, m, attrs, area)
            if cov is not None:
                run["rooms"][area] = cov
        now = datetime.now(timezone.utc)
        v = self._visit.get((plan_id, vac))
        if v and v["area"] == area:
            v["last"] = now
        else:
            self._close(plan_id, plan, vac)
            self._visit[(plan_id, vac)] = {"area": area, "start": now, "last": now}
        # Being cleaned now (with progress): it only counts as cleaned when the run ends (_end_run).
        cur = (plan.setdefault("now", {}).get(area) or {})
        if cur.get("by") == vac and run["w"] and (now - run["w"]).total_seconds() < REFRESH / 4:
            return
        run["w"] = now
        plan["now"][area] = {"t": now.isoformat(timespec="seconds"), "by": vac, **self._cover(plan, area, run["rooms"].get(area), run["ref"].get(area))}
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)

    @staticmethod
    def _ref(plan: dict[str, Any], area: str, own: float | None = None) -> float | None:
        """How big the room is for the robot: its own room size, else what it learned it usually cleans there."""
        if own:
            return own
        ref = (plan.get("room_area") or {}).get(area) or {}
        return ref.get("a") if ref.get("a") and ref.get("n", 0) >= 1 else None

    @classmethod
    def _cover(cls, plan: dict[str, Any], area: str, m2: float | None, own: float | None = None) -> dict[str, Any]:
        """m² cleaned in a room this run, and its share of the room."""
        if m2 is None:
            return {}
        out: dict[str, Any] = {"m2": round(m2, 1)}
        ref = cls._ref(plan, area, own)
        if ref:
            out["pct"] = min(100, round(m2 / ref * 100))
        return out

    @callback
    def _end_run(self, plan_id: str, plan: dict[str, Any], vac: str) -> None:
        """Back at the dock: rooms only partly done don't count as cleaned; learn how big each room is."""
        run = self._run.pop((plan_id, vac), None)
        asked = self._asked.get(vac)
        if run is not None:
            self._ended.add(vac)
        changed = False
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        cleaned = plan.setdefault("cleaned", {})
        cur = plan.get("now") or {}
        for area in [a for a, x in cur.items() if x.get("by") == vac]:
            cur.pop(area)
            changed = True
        if run and run["seen"]:
            learned = plan.setdefault("room_area", {})
            for area in run["visited"]:
                m2 = run["rooms"].get(area)
                ref = self._ref(plan, area, run["ref"].get(area))
                # A quick pass doesn't count: the room keeps its last real cleaning. (Unknown: it counts.)
                if m2 is None or not ref or m2 / ref >= COUNTS:
                    cleaned[area] = {"t": now, "by": vac, **self._cover(plan, area, m2, run["ref"].get(area))}
                changed = True
            for area, m2 in run["rooms"].items():
                ref = learned.get(area) or {}
                if m2 > 0.5:
                    # The most the robot usually cleans there, slowly forgetting (furniture moves).
                    a = max(m2, (ref.get("a") or 0) * 0.97)
                    learned[area] = {"a": round(a, 2), "n": min(ref.get("n", 0) + 1, 99)}
                changed = True
        elif asked and run is not None:
            # The robot doesn't say where it is: the rooms it was asked to clean.
            areas = {a for a in (self.data.plans[plan_id].get("shapes") or {})}
            for area in asked:
                if area in areas:
                    cleaned[area] = {"t": now, "by": vac}
                    changed = True
        if changed:
            self.data.touch()
            async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)

    @callback
    def _close(self, plan_id: str, plan: dict[str, Any], vac: str) -> None:
        """The robot left a room (or stopped): log the visit, so the card can tell how often and how long."""
        v = self._visit.pop((plan_id, vac), None)
        if not v:
            return
        secs = (v["last"] - v["start"]).total_seconds()
        if secs < 20:
            return
        log = plan.setdefault("clean_log", {}).setdefault(v["area"], [])
        log.append({"s": v["start"].isoformat(timespec="seconds"), "e": v["last"].isoformat(timespec="seconds"), "by": vac})
        del log[:-12]
        self.data.touch()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)
