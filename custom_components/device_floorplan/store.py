"""Persistent storage for plans, positions and planner state."""

from __future__ import annotations

from math import hypot
import os
from pathlib import Path
import shutil
import time
from typing import Any
from urllib.parse import unquote, urlparse

from homeassistant.components import persistent_notification
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    DOMAIN,
    IMAGES_DIR,
    IMAGES_URL,
    MAX_WWW_IMAGES,
    WWW_IMAGE_EXT,
    SIGNAL_DEVICES_CHANGED,
    SIGNAL_PLAN_ADDED,
    SIGNAL_PLAN_REMOVED,
    SIGNAL_PLAN_UPDATED,
    START_NOTIFICATION_ID,
    STORAGE_KEY,
    STORAGE_VERSION,
)

PLAN_KINDS = ("floor", "view")
IMAGE_KINDS = ("top", "angled")


class FloorplanData:
    """All planner data, kept in memory and persisted to .storage.

    {
      "plans": {"<plan_id>": {
          "id", "name", "kind": "floor"|"view", "floor_id", "level",
          "image_type": "top"|"angled",
          "image", "image_external", "image_backup", "image_version",
          "width", "height",
          "positions": {"<device_id>" | "entity:<entity_id>":
                        {"x", "y", "approx"?, "z"?, "box"?: {"x", "y"}}},   # percent
          "anchors": {"<area_id>": {"x", "y"}},                        # percent
          "refs": [{"ax", "ay", "bx", "by", "length", "dir"}],        # scale
          "hidden_rooms": ["<area_id>", ...],   # rooms not on this plan
          "bonds": {"<bond_id>": ["<device_id>", ...]},   # one marker, controlled together
      }},
      "skipped": {"<device_id>": true},       # not wanted on any plan
      "seen": ["<device_id>", ...],           # known to the planner
      "main_entity": {"<device_id>": "<entity_id>"},   # any entity ("Other entity…")
      "device_opts": {"<device_id>": {"only_main"?: true, "part"?: "own"|"part"}},
      "setup_done": bool,
    }
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.plans: dict[str, dict[str, Any]] = {}
        self.skipped: dict[str, bool] = {}
        self.seen: set[str] = set()
        self.main_entity: dict[str, str] = {}
        # Per device: {"only_main": bool, "part": "own" | "part"}
        self.device_opts: dict[str, dict[str, Any]] = {}
        self.setup_done = False
        self.images_path = Path(hass.config.path(IMAGES_DIR))

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.plans = data.get("plans", {})
        for plan in self.plans.values():
            self._defaults(plan)
        self.skipped = data.get("skipped", {})
        self.seen = set(data.get("seen", []))
        self.main_entity = data.get("main_entity", {})
        self.device_opts = data.get("device_opts", {})
        self.setup_done = bool(data.get("setup_done", False))

    @staticmethod
    def _defaults(plan: dict[str, Any]) -> None:
        plan.setdefault("kind", "floor")
        plan.setdefault("floor_id", None)
        plan.setdefault("level", None)
        plan.setdefault("image_type", "top")
        plan.setdefault("image", None)
        plan.setdefault("image_external", None)
        plan.setdefault("image_backup", None)
        plan.setdefault("image_version", 0)
        plan.setdefault("width", 0)
        plan.setdefault("height", 0)
        plan.setdefault("positions", {})
        plan.setdefault("anchors", {})
        plan.setdefault("refs", [])
        plan.setdefault("hidden_rooms", [])
        plan.setdefault("sort", 0)
        plan.setdefault("bonds", {})
        plan.setdefault("bond_meta", {})
        plan.setdefault("phantoms", {})
        plan.setdefault("shapes", {})

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(
            lambda: {
                "plans": self.plans,
                "skipped": self.skipped,
                "seen": sorted(self.seen),
                "main_entity": self.main_entity,
                "device_opts": self.device_opts,
                "setup_done": self.setup_done,
            },
            1,
        )

    # ------------------------------------------------------------------ plans
    @callback
    def find_plan(self, key: str) -> dict[str, Any] | None:
        """Find a plan by id or (case-insensitive) name."""
        if key in self.plans:
            return self.plans[key]
        low = key.strip().lower()
        for plan in self.plans.values():
            if plan["name"].lower() == low:
                return plan
        return None

    @callback
    def plan_level(self, plan: dict[str, Any]) -> int | None:
        """Level of a floor plan; follows the linked HA floor if there is one."""
        if plan.get("kind") != "floor":
            return None
        if plan.get("floor_id"):
            try:
                from homeassistant.helpers import floor_registry as fr

                floor = fr.async_get(self.hass).async_get_floor(plan["floor_id"])
                if floor is not None and floor.level is not None:
                    return floor.level
            except ImportError:  # pragma: no cover - very old HA
                pass
        return plan.get("level")

    @staticmethod
    def scale(plan: dict[str, Any]) -> dict[str, float | None]:
        """Metres per image pixel, horizontally and vertically."""
        width, height = plan.get("width") or 0, plan.get("height") or 0
        per_dir: dict[str, float] = {}
        if width and height:
            for ref in plan.get("refs", []):
                px = hypot((ref["bx"] - ref["ax"]) * width / 100, (ref["by"] - ref["ay"]) * height / 100)
                if px > 0 and ref.get("length", 0) > 0:
                    per_dir[ref.get("dir", "h")] = ref["length"] / px
        one = per_dir.get("h") or per_dir.get("v")
        return {"x": per_dir.get("h") or one, "y": per_dir.get("v") or one}

    @callback
    def plan_public(self, plan_id: str) -> dict[str, Any]:
        plan = self.plans[plan_id]
        return {
            "id": plan["id"],
            "name": plan["name"],
            "kind": plan["kind"],
            "floor_id": plan["floor_id"],
            "level": self.plan_level(plan),
            "image_type": plan["image_type"],
            "image_url": self.image_url(plan),
            "image_fallback_url": self.fallback_url(plan),
            "image_source": "ha" if plan.get("image_external") else ("upload" if plan.get("image") else None),
            "width": plan.get("width") or 0,
            "height": plan.get("height") or 0,
            "positions": plan["positions"],
            "anchors": plan["anchors"],
            "refs": plan["refs"],
            "hidden_rooms": plan.get("hidden_rooms", []),
            "sort": plan.get("sort", 0),
            "bonds": plan.get("bonds", {}),
            "bond_meta": plan.get("bond_meta", {}),
            "phantoms": plan.get("phantoms", {}),
            "anchors_centered": bool(plan.get("anchors_centered")),
            "shapes": plan.get("shapes", {}),
            "device_id": self.plan_device_id(plan_id),
            "image_entity": self.entity_id_for(plan_id, "image"),
            "sensor_entity": self.entity_id_for(plan_id, "sensor"),
        }

    @callback
    def plan_device_id(self, plan_id: str) -> str | None:
        """The HA device that represents this plan (created by its entities)."""
        from homeassistant.helpers import device_registry as dr

        device = dr.async_get(self.hass).async_get_device(identifiers={(DOMAIN, plan_id)})
        return device.id if device else None

    @callback
    def entity_id_for(self, plan_id: str, platform: str) -> str | None:
        from homeassistant.helpers import entity_registry as er

        unique = f"{DOMAIN}_{plan_id}" if platform == "sensor" else f"{DOMAIN}_{plan_id}_image"
        return er.async_get(self.hass).async_get_entity_id(platform, DOMAIN, unique)

    @callback
    def state_public(self) -> dict[str, Any]:
        return {
            "plans": [self.plan_public(pid) for pid in self.plans],
            "skipped": sorted(self.skipped),
            "seen": sorted(self.seen),
            "main_entity": self.main_entity,
            "device_opts": self.device_opts,
            "setup_done": self.setup_done,
        }

    @staticmethod
    def image_url(plan: dict[str, Any]) -> str | None:
        if plan.get("image_external"):
            return plan["image_external"]
        if not plan.get("image"):
            return None
        return f"{IMAGES_URL}/{plan['image']}?v={plan.get('image_version', 0)}"

    @staticmethod
    def fallback_url(plan: dict[str, Any]) -> str | None:
        """Backup copy of an image picked from HA, used if the original goes missing."""
        if not plan.get("image_external") or not plan.get("image_backup"):
            return None
        return f"{IMAGES_URL}/{plan['image_backup']}?v={plan.get('image_version', 0)}"

    def www_path(self, url: str | None) -> Path | None:
        """Disk path of a /local/... URL (inside config/www), or None."""
        if not url:
            return None
        path = unquote(urlparse(url).path)
        if not path.startswith("/local/"):
            return None
        www = Path(self.hass.config.path("www")).resolve()
        target = (www / path[len("/local/"):]).resolve()
        if www not in target.parents:
            return None
        return target

    def read_image(self, plan: dict[str, Any]) -> tuple[bytes, str] | None:
        """Bytes + content type of the plan image (blocking, run in executor)."""
        candidates: list[Path] = []
        if plan.get("image_external"):
            www = self.www_path(plan["image_external"])
            if www is not None:
                candidates.append(www)
            if plan.get("image_backup"):
                candidates.append(self.images_path / plan["image_backup"])
        elif plan.get("image"):
            candidates.append(self.images_path / plan["image"])
        for path in candidates:
            if path.is_file():
                ext = path.suffix.lower().lstrip(".")
                ctype = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(ext, "image/png")
                return path.read_bytes(), ctype
        return None

    def list_www_images(self) -> list[dict[str, Any]]:
        """Images in config/www that can be used as a plan (blocking)."""
        www = Path(self.hass.config.path("www"))
        found: list[dict[str, Any]] = []
        if not www.is_dir():
            return found
        for root, dirs, files in os.walk(www):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "community"]
            for name in files:
                if not name.lower().endswith(WWW_IMAGE_EXT) or name.startswith("."):
                    continue
                path = Path(root) / name
                try:
                    st = path.stat()
                except OSError:
                    continue
                if st.st_size > 15 * 1024 * 1024:
                    continue
                rel = path.relative_to(www).as_posix()
                found.append({"url": f"/local/{rel}", "name": rel, "size": st.st_size, "mtime": int(st.st_mtime)})
        found.sort(key=lambda f: -f["mtime"])
        return found[:MAX_WWW_IMAGES]

    @callback
    def create_plan(
        self,
        name: str,
        kind: str = "floor",
        floor_id: str | None = None,
        level: int | None = None,
        image_type: str = "top",
    ) -> dict[str, Any]:
        base = slugify(name) or "plan"
        plan_id = base
        i = 2
        while plan_id in self.plans:
            plan_id = f"{base}_{i}"
            i += 1
        plan = {
            "id": plan_id,
            "name": name.strip() or plan_id,
            "kind": kind if kind in PLAN_KINDS else "floor",
            "floor_id": floor_id,
            "level": level,
            "image_type": image_type if image_type in IMAGE_KINDS else "top",
        }
        self._defaults(plan)
        self.plans[plan_id] = plan
        self._save()
        persistent_notification.async_dismiss(self.hass, START_NOTIFICATION_ID)
        async_dispatcher_send(self.hass, SIGNAL_PLAN_ADDED, plan_id)
        return plan

    @callback
    def update_plan(self, plan_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        plan = self.plans[plan_id]
        if "name" in changes and changes["name"].strip():
            plan["name"] = changes["name"].strip()
        if changes.get("kind") in PLAN_KINDS:
            plan["kind"] = changes["kind"]
        if "floor_id" in changes:
            plan["floor_id"] = changes["floor_id"] or None
        if "level" in changes:
            plan["level"] = changes["level"]
        if changes.get("image_type") in IMAGE_KINDS:
            plan["image_type"] = changes["image_type"]
        if "positions" in changes:
            plan["positions"] = {
                key: _clean_pos(pos) for key, pos in changes["positions"].items()
            }
        if "anchors" in changes:
            plan["anchors"] = {
                key: {"x": round(float(p["x"]), 3), "y": round(float(p["y"]), 3)}
                for key, p in changes["anchors"].items()
            }
        if "shapes" in changes:
            # #111: room shapes, {area_id: [[x, y], ...]} in percent, 3..40 corners.
            shapes = {}
            for aid, pts in (changes["shapes"] or {}).items():
                if not isinstance(pts, list) or len(pts) < 3:
                    continue
                # A third value 1 = the edge from this corner to the next is open (no wall): light passes.
                shapes[str(aid)] = [
                    [round(min(100.0, max(0.0, float(p[0]))), 3), round(min(100.0, max(0.0, float(p[1]))), 3)] + ([1] if len(p) > 2 and p[2] else [])
                    for p in pts[:40]
                ]
            plan["shapes"] = shapes
        if "anchors_centered" in changes:
            plan["anchors_centered"] = bool(changes["anchors_centered"])
        if "sort" in changes:
            plan["sort"] = int(changes["sort"])
        if "hidden_rooms" in changes:
            plan["hidden_rooms"] = sorted({str(a) for a in changes["hidden_rooms"]})
        if "bonds" in changes:
            # Bonded devices: one marker, controlled together in the card (#40).
            plan["bonds"] = {
                str(k): [str(m) for m in v][:12]
                for k, v in changes["bonds"].items()
                if isinstance(v, list) and len(v) >= 2
            }
        if "bond_meta" in changes:
            # Name / icon / card behaviour of a bond (#56); only for bonds that exist.
            meta = {}
            for k, v in (changes["bond_meta"] or {}).items():
                if str(k) not in plan.get("bonds", {}) or not isinstance(v, dict):
                    continue
                m = {kk: str(vv)[:80] for kk, vv in v.items() if kk in ("name", "icon", "tap", "show") and vv}
                if m:
                    meta[str(k)] = m
            plan["bond_meta"] = meta
        if "phantoms" in changes:
            # Phantom devices (#60): a combined value from devices anywhere, own free spot.
            ph = {}
            for k, v in (changes["phantoms"] or {}).items():
                if not isinstance(v, dict):
                    continue
                entry = {
                    "name": str(v.get("name") or "Phantom")[:60],
                    "x": round(min(100.0, max(0.0, float(v.get("x", 50)))), 3),
                    "y": round(min(100.0, max(0.0, float(v.get("y", 50)))), 3),
                    "members": [str(m) for m in (v.get("members") or [])][:24],
                }
                for kk in ("icon", "value", "one"):
                    if v.get(kk):
                        entry[kk] = str(v[kk])[:80]
                uses = v.get("uses")
                if isinstance(uses, dict):
                    # #103: which entities of a member count (empty/missing = all its readings).
                    u = {str(m): [str(e) for e in es][:12] for m, es in uses.items() if isinstance(es, list) and es and str(m) in entry["members"]}
                    if u:
                        entry["uses"] = u
                ph[str(k)] = entry
            plan["phantoms"] = ph
        if "refs" in changes:
            plan["refs"] = [
                {
                    "ax": round(float(r["ax"]), 3),
                    "ay": round(float(r["ay"]), 3),
                    "bx": round(float(r["bx"]), 3),
                    "by": round(float(r["by"]), 3),
                    "length": float(r["length"]),
                    "dir": "v" if r.get("dir") == "v" else "h",
                }
                for r in changes["refs"][:2]
            ]
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)
        return plan

    @callback
    def place_device(self, plan_id: str, device_id: str, x: float, y: float, approx: bool) -> None:
        plan = self.plans[plan_id]
        plan["positions"][device_id] = _clean_pos({"x": x, "y": y, "approx": approx})
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)

    async def async_delete_plan(self, plan_id: str) -> None:
        plan = self.plans.pop(plan_id)
        self._save()
        for key in ("image", "image_backup"):
            if plan.get(key):
                await self.hass.async_add_executor_job(
                    self._remove_file, self.images_path / plan[key]
                )
        async_dispatcher_send(self.hass, SIGNAL_PLAN_REMOVED, plan_id)

    async def async_set_image(
        self, plan_id: str, body: bytes, ext: str, width: int, height: int
    ) -> None:
        plan = self.plans[plan_id]
        old = plan.get("image")
        filename = f"{plan_id}.{ext}"
        await self.hass.async_add_executor_job(self._write_file, filename, body)
        if old and old != filename:
            await self.hass.async_add_executor_job(
                self._remove_file, self.images_path / old
            )
        if plan.get("image_backup"):
            await self.hass.async_add_executor_job(
                self._remove_file, self.images_path / plan["image_backup"]
            )
        plan["image"] = filename
        plan["image_external"] = None
        plan["image_backup"] = None
        plan["image_version"] = int(time.time())
        if width > 0 and height > 0:
            plan["width"] = width
            plan["height"] = height
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)

    async def async_set_image_file(
        self, plan_id: str, src: Path, width: int, height: int
    ) -> None:
        """Copy a file from disk (a bundled sample plan) as the plan image."""
        body = await self.hass.async_add_executor_job(src.read_bytes)
        await self.async_set_image(plan_id, body, src.suffix.lower().lstrip("."), width, height)

    async def async_set_image_url(
        self, plan_id: str, url: str, width: int, height: int
    ) -> None:
        """Use an image that is already in HA (e.g. /local/plan.png).

        The plan keeps pointing at the original (so editing that file updates
        the plan) and a backup copy is stored, used if the original goes away.
        """
        plan = self.plans[plan_id]
        for key in ("image", "image_backup"):
            if plan.get(key):
                await self.hass.async_add_executor_job(
                    self._remove_file, self.images_path / plan[key]
                )
                plan[key] = None
        src = self.www_path(url)
        if src is not None:
            backup = f"{plan_id}_backup{src.suffix.lower()}"
            ok = await self.hass.async_add_executor_job(self._copy_file, src, backup)
            if ok:
                plan["image_backup"] = backup
        plan["image_external"] = url
        plan["image_version"] = int(time.time())
        plan["width"] = width
        plan["height"] = height
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)

    # ---------------------------------------------------------------- devices
    @callback
    def set_skipped(self, device_ids: list[str], skipped: bool) -> None:
        for device_id in device_ids:
            if skipped:
                self.skipped[device_id] = True
            else:
                self.skipped.pop(device_id, None)
            self.seen.add(device_id)
        self._save()
        self._all_plans_changed()

    @callback
    def mark_seen(self, device_ids: list[str]) -> None:
        self.seen.update(device_ids)
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_CHANGED)

    @callback
    @callback
    def migrate_split(self, main_of) -> bool:
        """0.5.1 (#91): box spot -> device spot, old device spot -> spot of its main entity."""
        changed = False
        for plan in self.plans.values():
            pos_all = plan.get("positions", {})
            for key in list(pos_all):
                pos = pos_all[key]
                box = pos.get("box") if isinstance(pos, dict) else None
                if not box or key.startswith("entity:"):
                    continue
                main = main_of(key)
                new = {k: v for k, v in pos.items() if k not in ("box", "light")}
                new["x"], new["y"] = box["x"], box["y"]
                pos_all[key] = new
                if main and f"entity:{main}" not in pos_all:
                    spot = {"x": pos["x"], "y": pos["y"], "of": key}
                    if pos.get("light"):
                        spot["light"] = pos["light"]
                    pos_all[f"entity:{main}"] = spot
                changed = True
        if changed:
            self._save()
        return changed

    def set_main_entity(self, device_id: str, entity_id: str | None) -> None:
        if entity_id:
            self.main_entity[device_id] = entity_id
        else:
            self.main_entity.pop(device_id, None)
        self._save()
        self._all_plans_changed()

    @callback
    def set_device_opts(self, device_id: str, changes: dict[str, Any]) -> None:
        opts = dict(self.device_opts.get(device_id, {}))
        if "only_main" in changes:
            if changes["only_main"]:
                opts["only_main"] = True
            else:
                opts.pop("only_main", None)
        if "part" in changes:
            if changes["part"] in ("own", "part"):
                opts["part"] = changes["part"]
            else:
                opts.pop("part", None)
        if opts:
            self.device_opts[device_id] = opts
        else:
            self.device_opts.pop(device_id, None)
        self._save()
        self._all_plans_changed()

    @callback
    def complete_setup(self, skip_ids: list[str], seen_ids: list[str]) -> None:
        self.skipped = {device_id: True for device_id in skip_ids}
        self.seen = set(seen_ids) | set(skip_ids)
        self.setup_done = True
        self._save()
        self._all_plans_changed()

    @callback
    def reset_setup(self) -> None:
        self.setup_done = False
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_CHANGED)

    @callback
    def _all_plans_changed(self) -> None:
        for plan_id in self.plans:
            async_dispatcher_send(self.hass, SIGNAL_PLAN_UPDATED, plan_id)
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_CHANGED)

    @callback
    def placed_anywhere(self, device_id: str) -> bool:  # also "entity:<id>" keys
        return any(device_id in plan["positions"] for plan in self.plans.values())

    # ------------------------------------------------------------------ files
    def _write_file(self, filename: str, body: bytes) -> None:
        self.images_path.mkdir(parents=True, exist_ok=True)
        tmp = self.images_path / f".{filename}.tmp"
        tmp.write_bytes(body)
        tmp.replace(self.images_path / filename)

    def _copy_file(self, src: Path, filename: str) -> bool:
        try:
            self.images_path.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, self.images_path / filename)
            return True
        except OSError:
            return False

    @staticmethod
    def _remove_file(path: Path) -> None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def _clean_pos(pos: dict[str, Any]) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "x": round(min(100.0, max(0.0, float(pos["x"]))), 3),
        "y": round(min(100.0, max(0.0, float(pos["y"]))), 3),
    }
    if pos.get("approx"):
        entry["approx"] = True
    if pos.get("z"):
        entry["z"] = int(pos["z"])
    light = pos.get("light")
    if isinstance(light, dict) and light.get("type") in ("bulb", "spot", "strip", "panel", "wall", "none"):
        # Light shape on the plan (#74), in percent of the image (x / y axes).
        clean: dict[str, Any] = {"type": light["type"]}
        for k in ("r", "x2", "y2", "w", "h", "a"):
            if light.get(k) is not None:
                clean[k] = round(float(light[k]), 3)
        col = light.get("color")
        if isinstance(col, str) and col and col != "auto":
            entry_col = col.strip()[:12]  # #112: "k:<kelvin>" or "#rrggbb"
            clean["color"] = entry_col
        entry["light"] = clean
    if pos.get("of"):
        entry["of"] = str(pos["of"])  # split device (#91): this entity acts here
    if pos.get("as") in ("light", "switch", "fan", "other", "door", "window", "shutter"):
        entry["as"] = pos["as"]  # #105: what a split spot acts as; 0.7.0: door / window / shutter
    op = pos.get("opening")
    if isinstance(op, dict) and all(op.get(k) is not None for k in ("x1", "y1", "x2", "y2")):
        # 0.7.0: the opening (door, window, shutter) drawn on the plan as a bar, in % of the image.
        entry["opening"] = {k: round(min(100.0, max(0.0, float(op[k]))), 3) for k in ("x1", "y1", "x2", "y2")}
        if op.get("swap"):
            entry["opening"]["swap"] = True  # 0.7.2: its twins sit on the other side
    elif isinstance(op, dict) and op.get("link"):
        # 0.7.2: shares the bar of another spot ("Next to"), on side 1 or -1.
        entry["opening"] = {"link": str(op["link"]), "side": -1 if op.get("side") == -1 else 1}
    air = pos.get("air")
    if isinstance(air, dict):
        # #115: AC air flow cone: a = direction (deg), r = reach (% of width), s = spread (deg); type none = off.
        if air.get("type") == "none":
            entry["air"] = {"type": "none"}
        else:
            entry["air"] = {k: round(float(air[k]), 2) for k in ("a", "r", "s") if air.get(k) is not None}
    box = pos.get("box")
    if box:
        entry["box"] = {
            "x": round(min(100.0, max(0.0, float(box["x"]))), 3),
            "y": round(min(100.0, max(0.0, float(box["y"]))), 3),
        }
    return entry
