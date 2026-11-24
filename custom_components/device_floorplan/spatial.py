"""0.13.9.5: the floorplan as plain facts, for automations and AI assistants.

One read-only model of the home, built from what the user already drew in the Floorplan Editor:
- rooms and how they connect, from the room shapes and Glue Rooms (overlapping rooms meet on one line;
  gaps stay walls): the length of the line two rooms share says what kind of connection it is;
- a door contact (or a drawn door) on a short shared line makes it a door;
- rooms a wall's thickness apart, with no shared line, share a wall; an edge with no room beyond is an outside wall;
- where each device stands in its room, in words;
- compass words only when the plan has a north set, always together with the neighbour facts.

Used by the actions (get_layout, locate, nearest, between) and by the AI tools in llm.py: one implementation.
"""

from __future__ import annotations

import heapq
from itertools import pairwise
from math import atan2, ceil, degrees, hypot, sqrt
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr

from .devices import build_plan_payload
from .store import FloorplanData

DIRS = ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
WALKABLE = ("open_space", "wide_passage", "passage", "door")
CONN_WORDS = {
    "open_space": "one open space",
    "wide_passage": "a wide passage",
    "passage": "a passage (door width)",
    "door": "a door",
}
_DOOR_DC = {"door", "garage_door", "opening"}
_COVER_DOOR_DC = {"door", "garage", "gate"}

Pt = tuple[float, float]


# ------------------------------------------------------------------ geometry
def _pip(p: Pt, poly: list[Pt]) -> bool:
    x, y = p
    inside = False
    j = len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _dseg(p: Pt, a: Pt, b: Pt) -> float:
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    ll = dx * dx + dy * dy
    t = 0.0 if ll == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / ll))
    return hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def _dpoly(p: Pt, poly: list[Pt]) -> float:
    return min(_dseg(p, poly[i - 1], poly[i]) for i in range(len(poly)))


def _area(poly: list[Pt]) -> float:
    return abs(sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly)))) / 2


def _centroid(poly: list[Pt]) -> Pt:
    a = cx = cy = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i - 1]
        x1, y1 = poly[i]
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-9:
        return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
    return cx / (3 * a), cy / (3 * a)


def _bbox(poly: list[Pt]) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def _compass(dx: float, dy: float, north: float) -> str:
    """Image coordinates (y down) to a compass word; north = where north points on the image, ° clockwise from up."""
    bearing = (degrees(atan2(dx, -dy)) - north) % 360
    return DIRS[int((bearing + 22.5) // 45) % 8]


def _norm(text: Any) -> str:
    return " ".join(str(text or "").casefold().replace("_", " ").split())


# ------------------------------------------------------------------ the model
class Home:
    """Every plan's rooms, connections and placed things, resolved once per question."""

    def __init__(self, hass: HomeAssistant, data: FloorplanData, exposed=None) -> None:
        self.hass = hass
        self.data = data
        self.exposed = exposed  # callable(entity_ids) -> bool, for AI assistants; None = everything
        self.area_reg = ar.async_get(hass)
        self.dev_reg = dr.async_get(hass)
        self.ent_reg = er.async_get(hass)
        self.plans: list[dict[str, Any]] = []
        self.rooms: dict[str, list[dict[str, Any]]] = {}  # area_id -> its room on each plan
        self.spots: list[dict[str, Any]] = []
        floor_reg = fr.async_get(hass)
        for plan in sorted(data.plans.values(), key=lambda p: (p.get("kind") != "floor", -(data.plan_level(p) or 0), p.get("sort", 0))):
            payload = build_plan_payload(hass, data, plan)
            floor = floor_reg.async_get_floor(plan["floor_id"]) if plan.get("floor_id") else None
            self.plans.append(self._plan(plan, payload, floor.name if floor else None))

    # -------------------------------------------------------------- one plan
    def _plan(self, plan: dict[str, Any], payload: dict[str, Any], floor_name: str | None) -> dict[str, Any]:
        w = plan.get("width") or 100
        h = plan.get("height") or 100
        sc = self.data.scale(plan)
        measured = bool(sc["x"] and sc["y"] and plan.get("image_type") == "top")
        sx, sy = (sc["x"] * w / 100, sc["y"] * h / 100) if measured else (w / 100, h / 100)

        def to(x: float, y: float) -> Pt:
            return float(x) * sx, float(y) * sy

        diag = hypot(100 * sx, 100 * sy) or 1.0
        tol = (
            {"touch": 0.10, "wall": 0.45, "step": 0.1, "edge": 0.6, "window": 1.0, "door": 0.7}
            if measured
            else {k: v * diag for k, v in {"touch": 0.005, "wall": 0.025, "step": 0.005, "edge": 0.04, "window": 0.06, "door": 0.04}.items()}
        )
        north = plan.get("north")
        P = {
            "id": plan["id"],
            "name": plan["name"],
            "floor": floor_name or plan["name"],
            "kind": plan.get("kind"),
            "level": self.data.plan_level(plan),
            "measured": measured,
            "north": float(north) if north is not None else None,
            "tol": tol,
            "rooms": {},
            "doors": [],
            "windows": [],
            "to": to,
        }
        # Rooms with a drawn shape (the only ones whose walls we know); pins alone give a room's place.
        for aid, a in payload["areas"].items():
            room = {"area_id": aid, "name": a["name"], "plan": P, "pin": to(a["x"], a["y"])}
            if a.get("shape") and len(a["shape"]) >= 3:
                poly = [to(p[0], p[1]) for p in a["shape"]]
                room.update(poly=poly, size=_area(poly), centre=_centroid(poly), box=_bbox(poly))
            else:
                room.update(poly=None, size=0.0, centre=room["pin"], box=None)
            P["rooms"][aid] = room
            self.rooms.setdefault(aid, []).append(room)
        # Placed things.
        for key, item in list(payload["devices"].items()) + [(f"entity:{k}", v) for k, v in payload["entities"].items()]:
            self._spot(P, key, item, to)
        self._analyse(P)
        return P

    def _dc(self, eid: str) -> str | None:
        ent = self.ent_reg.async_get(eid)
        if ent and (ent.device_class or ent.original_device_class):
            return ent.device_class or ent.original_device_class
        st = self.hass.states.get(eid)
        return st.attributes.get("device_class") if st else None

    def _spot(self, P: dict[str, Any], key: str, item: dict[str, Any], to) -> None:
        eids = [e for e in (item.get("entities") or []) if e]
        area_id = item.get("area_id")
        device_id = None if key.startswith("entity:") else key
        if key.startswith("entity:"):
            ent = self.ent_reg.async_get(key[7:])
            if ent:
                device_id = ent.device_id
                area_id = ent.area_id or (self.dev_reg.async_get(ent.device_id).area_id if ent.device_id and self.dev_reg.async_get(ent.device_id) else None)
        door = window = None
        as_ = item.get("as")
        for e in eids:
            dom, dc = e.split(".")[0], self._dc(e)
            if (dom == "binary_sensor" and dc in _DOOR_DC) or (dom == "cover" and dc in _COVER_DOOR_DC):
                door = door or e
            elif dom == "binary_sensor" and dc == "window":
                window = window or e
        if as_ == "door":
            door = door or item.get("main_entity")
        if as_ in ("window", "shutter"):
            window = window or item.get("main_entity")
        op = item.get("opening") or {}
        at = to(item["x"], item["y"])
        if all(k in op for k in ("x1", "y1", "x2", "y2")):
            a, b = to(op["x1"], op["y1"]), to(op["x2"], op["y2"])
            mark = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        else:
            mark = at
        spot = {
            "key": key,
            "device_id": device_id,
            "name": item.get("name") or key,
            "plan": P,
            "at": at,
            "box": to(item["box"]["x"], item["box"]["y"]) if item.get("box") else None,
            "approx": bool(item.get("approx")),
            "area_id": area_id,
            "category": item.get("category") or item.get("group"),
            "main": item.get("main_entity"),
            "entities": eids,
        }
        spot["room"] = self._room_at(P, at) or (P["rooms"].get(area_id) and area_id)
        self.spots.append(spot)
        if door:
            P["doors"].append({"at": mark, "entity": door})
        elif window:
            P["windows"].append({"at": mark, "entity": window})

    @staticmethod
    def _room_at(P: dict[str, Any], pt: Pt) -> str | None:
        hits = [r for r in P["rooms"].values() if r["poly"] and _pip(pt, r["poly"])]
        return min(hits, key=lambda r: r["size"])["area_id"] if hits else None

    # -------------------------------------------------------------- walls and openings
    def _analyse(self, P: dict[str, Any]) -> None:
        tol = P["tol"]
        shaped = [r for r in P["rooms"].values() if r["poly"]]
        for r in shaped:
            samples = []
            poly = r["poly"]
            for i in range(len(poly)):
                a, b = poly[i - 1], poly[i]
                ln = hypot(b[0] - a[0], b[1] - a[1])
                n = max(1, ceil(ln / tol["step"]))
                for k in range(n):
                    t = (k + 0.5) / n
                    samples.append({"p": (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), "w": ln / n, "cls": "outside", "to": None})
            r["samples"] = samples
            r["links"] = {}
        for i, A in enumerate(shaped):
            for B in shaped[i + 1 :]:
                ax0, ay0, ax1, ay1 = A["box"]
                bx0, by0, bx1, by1 = B["box"]
                g = tol["wall"]
                if ax0 > bx1 + g or bx0 > ax1 + g or ay0 > by1 + g or by0 > ay1 + g:
                    continue
                touch_a, near_a, pts = self._side(A, B, tol)
                touch_b, near_b, _ = self._side(B, A, tol)
                shared, wall = min(touch_a, touch_b), max(near_a, near_b)
                kind = self._kind(P, shared, A, B)
                if kind:
                    door = None
                    if kind in ("passage", "wide_passage"):
                        door = next((d for d in P["doors"] if any(hypot(d["at"][0] - q[0], d["at"][1] - q[1]) <= tol["door"] for q in pts)), None)
                        if door:
                            kind = "door"
                    link = {"type": kind, "length": shared, "door": door["entity"] if door else None, "pts": pts}
                elif wall >= (0.8 if P["measured"] else 0.25 * sqrt(min(A["size"], B["size"]) or 1)):
                    link = {"type": "shared_wall", "length": wall, "door": None, "pts": []}
                else:
                    continue
                A["links"][B["area_id"]] = link
                B["links"][A["area_id"]] = link
        # What each piece of wall looks onto (outside / opening to X / wall to X).
        for A in shaped:
            for s in A["samples"]:
                best = None
                px, py = s["p"]
                for B in shaped:
                    bx0, by0, bx1, by1 = B["box"]
                    if B is A or px < bx0 - tol["wall"] or px > bx1 + tol["wall"] or py < by0 - tol["wall"] or py > by1 + tol["wall"]:
                        continue
                    d = 0.0 if _pip(s["p"], B["poly"]) else _dpoly(s["p"], B["poly"])
                    if d <= tol["wall"] and (best is None or d < best[0]):
                        best = (d, B)
                if best:
                    d, B = best
                    link = A["links"].get(B["area_id"])
                    walk = link and link["type"] in WALKABLE and d <= tol["touch"]
                    s["cls"], s["to"] = ("open" if walk else "wall"), B["area_id"]

    @staticmethod
    def _side(A: dict[str, Any], B: dict[str, Any], tol: dict[str, float]) -> tuple[float, float, list[Pt]]:
        touch = near = 0.0
        pts: list[Pt] = []
        bx0, by0, bx1, by1 = B["box"]
        g = tol["wall"]
        for s in A["samples"]:
            p = s["p"]
            if p[0] < bx0 - g or p[0] > bx1 + g or p[1] < by0 - g or p[1] > by1 + g:
                continue
            d = 0.0 if _pip(p, B["poly"]) else _dpoly(p, B["poly"])
            if d <= tol["touch"]:
                touch += s["w"]
                pts.append(p)
            elif d <= tol["wall"]:
                near += s["w"]
        return touch, near, pts

    @staticmethod
    def _kind(P: dict[str, Any], shared: float, A: dict[str, Any], B: dict[str, Any]) -> str | None:
        """How two glued rooms connect, from the length of the line they share."""
        if P["measured"]:
            v, cuts = shared, (0.3, 1.4, 2.2)  # metres
        else:
            v, cuts = shared / (sqrt(min(A["size"], B["size"])) or 1), (0.1, 0.35, 0.6)  # part of the smaller room's side
        if v < cuts[0]:
            return None
        return "passage" if v < cuts[1] else "wide_passage" if v < cuts[2] else "open_space"

    # -------------------------------------------------------------- words
    def room_name(self, aid: str | None) -> str | None:
        if not aid:
            return None
        rooms = self.rooms.get(aid)
        if rooms:
            return rooms[0]["name"]
        area = self.area_reg.async_get_area(aid)
        return area.name if area else aid

    def _where_in_floor(self, room: dict[str, Any]) -> str | None:
        P = room["plan"]
        if P["north"] is None:
            return None
        polys = [r["poly"] for r in P["rooms"].values() if r["poly"]]
        if not polys:
            return None
        x0 = min(_bbox(p)[0] for p in polys)
        y0 = min(_bbox(p)[1] for p in polys)
        x1 = max(_bbox(p)[2] for p in polys)
        y1 = max(_bbox(p)[3] for p in polys)
        cx, cy = room["centre"]
        ox, oy = (cx - (x0 + x1) / 2) / (((x1 - x0) / 2) or 1), (cy - (y0 + y1) / 2) / (((y1 - y0) / 2) or 1)
        if hypot(ox, oy) < 0.33:
            return "in the middle of the floor"
        return f"on the {_compass(ox, oy, P['north'])} side of the floor"

    def _dir(self, a: dict[str, Any], b: dict[str, Any]) -> str | None:
        P = a["plan"]
        if P["north"] is None or b["plan"] is not P:
            return None
        return _compass(b["centre"][0] - a["centre"][0], b["centre"][1] - a["centre"][1], P["north"])

    def spot_words(self, spot: dict[str, Any], pt: Pt | None = None) -> str:
        """Where a thing stands in its room: by an outside wall / a window / the door to X, or in the middle."""
        P = spot["plan"]
        pt = pt or spot["at"]
        aid = self._room_at(P, pt) if pt is not spot["at"] else spot["room"]
        room = P["rooms"].get(aid) if aid else None
        if not room or not room["poly"]:
            return f"in {self.room_name(aid)}" if aid else "not inside a drawn room"
        tol = P["tol"]
        words: list[str] = []
        if any(w["entity"] not in spot["entities"] and hypot(w["at"][0] - pt[0], w["at"][1] - pt[1]) <= tol["window"] for w in P["windows"]):
            words.append("by a window")
        s = min(room["samples"], key=lambda q: hypot(q["p"][0] - pt[0], q["p"][1] - pt[1]))
        d = hypot(s["p"][0] - pt[0], s["p"][1] - pt[1])
        x0, y0, x1, y1 = room["box"]
        half = min(x1 - x0, y1 - y0) / 2 or 1
        middle = False
        if d <= tol["edge"]:
            if s["cls"] == "outside":
                words.append("by an outside wall")
            elif s["cls"] == "open":
                link = room["links"].get(s["to"]) or {}
                what = "door" if link.get("type") == "door" else "open side" if link.get("type") == "open_space" else "passage"
                words.append(f"by the {what} to {self.room_name(s['to'])}")
            else:
                words.append(f"by the wall to {self.room_name(s['to'])}")
        elif d >= 0.45 * half:
            middle = True
            words.append("in the middle of the room")
        if P["north"] is not None and not middle:
            ox, oy = (pt[0] - (x0 + x1) / 2) / (((x1 - x0) / 2) or 1), (pt[1] - (y0 + y1) / 2) / (((y1 - y0) / 2) or 1)
            if hypot(ox, oy) >= 0.33:
                words.append(f"in the {_compass(ox, oy, P['north'])} part of the room")
        return f"in {room['name']}" + (f", {', '.join(words)}" if words else "")

    # -------------------------------------------------------------- answers
    def visible(self, spot: dict[str, Any]) -> bool:
        return self.exposed is None or self.exposed(spot["entities"] or ([spot["main"]] if spot["main"] else []))

    def _state(self, eid: str | None) -> str | None:
        st = self.hass.states.get(eid) if eid else None
        return st.state if st else None

    def room_facts(self, room: dict[str, Any], with_devices: bool = False) -> dict[str, Any]:
        P = room["plan"]
        out: dict[str, Any] = {"room": room["name"], "area_id": room["area_id"], "floor": P["floor"]}
        if P["measured"] and room["size"]:
            out["size_m2"] = round(room["size"], 1)
        if (w := self._where_in_floor(room)) is not None:
            out["position"] = w
        if not room["poly"]:
            out["note"] = "The room has no drawn shape, so its walls and connections are unknown."
        else:
            out["has_outside_wall"] = any(s["cls"] == "outside" for s in room["samples"])
            conns, walls = [], []
            for other, link in sorted(room["links"].items(), key=lambda kv: self.room_name(kv[0]) or ""):
                B = P["rooms"][other]
                entry: dict[str, Any] = {"room": B["name"]}
                if (d := self._dir(room, B)) is not None:
                    entry["direction"] = d
                if link["type"] in WALKABLE:
                    entry["connection"] = CONN_WORDS[link["type"]]
                    if link["door"]:
                        entry["door_sensor"] = link["door"]
                        entry["door_state"] = self._state(link["door"])
                    if P["measured"]:
                        entry["opening_m"] = round(link["length"], 1)
                    conns.append(entry)
                else:
                    walls.append(entry)
            out["connects_to"] = conns
            if walls:
                out["shares_a_wall_with"] = walls  # close by, but no way through
        others = [r["plan"]["floor"] for r in self.rooms.get(room["area_id"], []) if r["plan"] is not P]
        if others:
            out["also_on"] = others  # the same room on another plan (stairs, a split floor)
        if with_devices:
            out["devices"] = [
                {"name": s["name"], "where": self.spot_words(s), **({"approximate": True} if s["approx"] else {})}
                for s in self.spots
                if s["plan"] is P and s["room"] == room["area_id"] and self.visible(s)
            ]
        return out

    def layout(self, floor: str | None = None, room: str | None = None) -> dict[str, Any]:
        if room:
            hits = self.find_rooms(room)
            if not hits:
                return {"error": f"No room called “{room}” on the floorplan.", "rooms": self.room_names()}
            return {"rooms": [self.room_facts(r, with_devices=True) for r in hits]}
        plans = self.plans
        if floor:
            n = _norm(floor)
            plans = [p for p in plans if n in (_norm(p["id"]), _norm(p["name"]), _norm(p["floor"]))] or [p for p in plans if n in _norm(p["name"]) or n in _norm(p["floor"])]
            if not plans:
                return {"error": f"No floor called “{floor}”.", "floors": [p["name"] for p in self.plans]}
        return {
            "floors": [
                {
                    "floor": P["floor"],
                    "plan": P["name"],
                    **({"level": P["level"]} if P["level"] is not None else {}),
                    "measured": P["measured"],
                    "compass": P["north"] is not None,
                    "rooms": [self.room_facts(r) for r in sorted(P["rooms"].values(), key=lambda r: r["name"])],
                }
                for P in plans
                if P["rooms"]
            ]
        }

    def room_names(self) -> list[str]:
        return sorted({rs[0]["name"] for rs in self.rooms.values()})

    def find_rooms(self, text: str) -> list[dict[str, Any]]:
        n = _norm(text)
        exact, part = [], []
        for aid, rs in self.rooms.items():
            area = self.area_reg.async_get_area(aid)
            names = {_norm(aid), _norm(rs[0]["name"])} | {_norm(a) for a in (getattr(area, "aliases", None) or [])}
            if n in names:
                exact += rs
            elif any(n in x or x in n for x in names if x):
                part += rs
        return exact or part

    def resolve(self, text: str | None, device_id: str | None = None) -> dict[str, Any] | None:
        """A thing to measure from: a placed device / entity (by name, id or entity id), a room, or "here"."""
        if not text or _norm(text) in ("here", "me", "this room", "this device"):
            if not device_id:
                return None
            spot = next((s for s in self.spots if s["device_id"] == device_id), None)
            if spot:
                return {"kind": "spot", "spot": spot, "name": spot["name"], "plan": spot["plan"], "at": spot["at"], "room": spot["room"]}
            dev = self.dev_reg.async_get(device_id)
            rooms = self.rooms.get(dev.area_id) if dev and dev.area_id else None
            return self._room_target(rooms[0]) if rooms else None
        t = text.strip()
        n = _norm(t)
        for s in self.spots:
            if t in (s["key"], s["device_id"], s["main"]) or t in s["entities"] or s["key"] == f"entity:{t}":
                return self._spot_target(s)
        exact = [s for s in self.spots if _norm(s["name"]) == n]
        if exact:
            return self._spot_target(exact[0])
        rooms = self.find_rooms(t)
        if rooms and any(_norm(r["name"]) == n for r in rooms):
            return self._room_target(rooms[0])
        part = [s for s in self.spots if n in _norm(s["name"])]
        if len(part) == 1:
            return self._spot_target(part[0])
        if rooms:
            return self._room_target(rooms[0])
        if part:
            return {"kind": "many", "names": sorted({s["name"] for s in part})[:10]}
        return None

    @staticmethod
    def _spot_target(s: dict[str, Any]) -> dict[str, Any]:
        return {"kind": "spot", "spot": s, "name": s["name"], "plan": s["plan"], "at": s["at"], "room": s["room"]}

    @staticmethod
    def _room_target(r: dict[str, Any]) -> dict[str, Any]:
        return {"kind": "room", "name": r["name"], "plan": r["plan"], "at": r["centre"], "room": r["area_id"]}

    def _miss(self, text: str | None, hit: dict[str, Any] | None) -> dict[str, Any] | None:
        if hit is None:
            return {"error": "Say which device or room (or ask from a voice device)." if not text else f"“{text}” is not on the floorplan."}
        if hit["kind"] == "many":
            return {"error": f"“{text}” matches several things.", "candidates": hit["names"]}
        if hit["kind"] == "spot" and not self.visible(hit["spot"]):
            return {"error": f"“{text}” is not shared with this assistant."}
        return None

    def locate(self, text: str, device_id: str | None = None) -> dict[str, Any]:
        hit = self.resolve(text, device_id)
        if (miss := self._miss(text, hit)) is not None:
            return miss
        if hit["kind"] == "room":
            return self.room_facts(self.rooms[hit["room"]][0], with_devices=True)
        s = hit["spot"]
        P = s["plan"]
        out: dict[str, Any] = {"name": s["name"], "floor": P["floor"], "room": self.room_name(s["room"]), "where": self.spot_words(s)}
        if s["approx"]:
            out["approximate"] = True
        if s["box"]:
            out["box_where"] = self.spot_words(s, s["box"])  # a split device: the switch / box, the other part elsewhere
        if s["room"] and s["area_id"] and s["room"] != s["area_id"]:
            out["home_assistant_area"] = self.room_name(s["area_id"])
        return out

    def _dist(self, P: dict[str, Any], a: Pt, b: Pt) -> float | None:
        return round(hypot(a[0] - b[0], a[1] - b[1]), 1) if P["measured"] else None

    def nearest(self, text: str | None, device_id: str | None = None, category: str | None = None, limit: int = 5) -> dict[str, Any]:
        hit = self.resolve(text, device_id)
        if (miss := self._miss(text, hit)) is not None:
            return miss
        P, at = hit["plan"], hit["at"]
        want = _norm(category).rstrip("s") if category else None
        found = []
        for s in self.spots:
            if s["plan"] is not P or (hit["kind"] == "spot" and s is hit["spot"]) or not self.visible(s):
                continue
            if want:
                tags = {_norm(s["category"]).rstrip("s"), _norm((s["main"] or "").split(".")[0]).rstrip("s")}
                if not any(want in t or t and t in want for t in tags):
                    continue
            d = hypot(s["at"][0] - at[0], s["at"][1] - at[1])
            found.append((d, s))
        found.sort(key=lambda x: x[0])
        return {
            "from": hit["name"],
            "floor": P["floor"],
            "nearest": [
                {"name": s["name"], "room": self.room_name(s["room"]), "same_room": s["room"] == hit["room"], **({"distance_m": round(d, 1)} if P["measured"] else {})}
                for d, s in found[: max(1, min(20, int(limit or 5)))]
            ],
            **({} if P["measured"] else {"note": "This floor is not measured, so the order is by plan distance and no metres are given."}),
        }

    def route(self, a: str, b: str) -> list[str] | None:
        """Rooms to walk through, over open spaces, passages and doors (also between floors through a room on both)."""
        if a == b:
            return [a]
        best = {a: 0.0}
        prev: dict[str, str] = {}
        heap = [(0.0, a)]
        while heap:
            d, u = heapq.heappop(heap)
            if u == b:
                break
            if d > best.get(u, 1e18):
                continue
            for r in self.rooms.get(u, []):
                for v, link in r["links"].items():
                    if link["type"] not in WALKABLE:
                        continue
                    nd = d + hypot(r["centre"][0] - r["plan"]["rooms"][v]["centre"][0], r["centre"][1] - r["plan"]["rooms"][v]["centre"][1]) + 1e-3
                    if nd < best.get(v, 1e18):
                        best[v], prev[v] = nd, u
                        heapq.heappush(heap, (nd, v))
        if b not in best:
            return None
        path = [b]
        while path[-1] != a:
            path.append(prev[path[-1]])
        return path[::-1]

    def between(self, a_text: str, b_text: str | None, device_id: str | None = None) -> dict[str, Any]:
        a = self.resolve(a_text, device_id)
        if (miss := self._miss(a_text, a)) is not None:
            return miss
        b = self.resolve(b_text, device_id)
        if (miss := self._miss(b_text, b)) is not None:
            return miss
        out: dict[str, Any] = {"from": a["name"], "to": b["name"], "from_room": self.room_name(a["room"]), "to_room": self.room_name(b["room"])}
        if a["room"] and b["room"]:
            path = self.route(a["room"], b["room"])
            if path is None:
                out["route"] = None
                out["note"] = "No way through is drawn between these rooms (rooms without a shape, or not glued)."
            else:
                out["route"] = [self.room_name(x) for x in path]
                steps = []
                for x, y in pairwise(path):
                    link = next((r["links"][y] for r in self.rooms.get(x, []) if y in r["links"]), None)
                    steps.append(f"{self.room_name(x)} → {self.room_name(y)}: " + (CONN_WORDS[link["type"]] if link else "the same room on another floor"))
                out["steps"] = steps
        P = a["plan"]
        if b["plan"] is not P:
            out["floors"] = [P["floor"], b["plan"]["floor"]]
            return out
        if (d := self._dist(P, a["at"], b["at"])) is not None:
            out["distance_m"] = d
        if P["north"] is not None and a["at"] != b["at"]:
            out["direction"] = f"{b['name']} is {_compass(b['at'][0] - a['at'][0], b['at'][1] - a['at'][1], P['north'])} of {a['name']}"
        # What a straight line between them crosses (for radio and "is there a wall between").
        n = 200
        tol = P["tol"]
        last = self._room_at(P, a["at"])
        gap = None  # where the line left every room (into a wall's thickness, or outdoors)
        crossed = []
        for k in range(1, n + 1):
            t = k / n
            p = (a["at"][0] + (b["at"][0] - a["at"][0]) * t, a["at"][1] + (b["at"][1] - a["at"][1]) * t)
            cur = self._room_at(P, p)
            if cur is None:
                gap = gap or p
                continue
            if cur != last and last is not None:
                if gap and _dpoly(gap, P["rooms"][cur]["poly"]) > tol["wall"] * 1.5:
                    crossed += [f"outside wall of {self.room_name(last)}", f"outside wall of {self.room_name(cur)}"]
                else:
                    link = P["rooms"][last]["links"].get(cur)
                    near = tol["touch"] * 3 + tol["step"] * 2
                    through = link and link["type"] in WALKABLE and any(hypot(q[0] - p[0], q[1] - p[1]) <= near for q in link["pts"])
                    crossed.append(f"{'opening' if through else 'wall'} between {self.room_name(last)} and {self.room_name(cur)}")
            elif last is None and k > 1:
                crossed.append(f"outside wall of {self.room_name(cur)}")
            last, gap = cur, None
        if gap and last is not None:
            crossed.append(f"outside wall of {self.room_name(last)}")
        out["straight_line_crosses"] = crossed
        out["walls_in_between"] = sum(1 for c in crossed if not c.startswith("opening"))
        return out



def summary(hass: HomeAssistant, data: FloorplanData) -> str:
    """One short line per plan with its rooms, for the assistant's instructions (cheap: no geometry)."""
    area_reg = ar.async_get(hass)
    parts = []
    for plan in data.plans.values():
        hidden = set(plan.get("hidden_rooms") or [])
        names = sorted(
            (a.name if (a := area_reg.async_get_area(aid)) else aid)
            for aid in (plan.get("anchors") or {})
            if not aid.startswith("__") and aid not in hidden
        )
        if names:
            parts.append(f"{plan['name']}: {', '.join(names)}")
    return "; ".join(parts)
