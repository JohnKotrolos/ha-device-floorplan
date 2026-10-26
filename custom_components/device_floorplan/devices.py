"""Device listing, classification, linking and the per-plan payload."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)

from .const import DOMAIN
from .store import FloorplanData

_LOGGER = logging.getLogger(__name__)

BLE_INTEGRATIONS = {
    "bluetooth", "bthome", "xiaomi_ble", "govee_ble", "inkbird", "sensorpush",
    "switchbot", "ibeacon", "private_ble_device", "oralb", "bluemaestro",
    "qingping", "thermobeacon", "yalexs_ble", "led_ble", "ld2410_ble",
    "thermopro", "moat", "mopeka", "kegtron", "rapt_ble", "airthings_ble",
    "bermuda", "nespresso",
}
# Devices that are software/cloud entries rather than things on a wall.
VIRTUAL_INTEGRATIONS = {
    "browser_mod", "spoolman", "places", "ha_mcp_tools", "cardata",
    "template", "group", "sun", "met", "workday", "google_travel_time",
    "waze_travel_time", "local_todo", "local_calendar", "remote_calendar",
    "caldav", "systemmonitor", "backup", "hassio", "cloud", "mcp_server",
    "openweathermap", "google_translate", "radio_browser", "shopping_list",
    "proxmoxve", "llama_conversation", "openai_conversation",
    "google_generative_ai_conversation", "anthropic", "ollama", "wyoming",
    "google_air_quality", "tod", "history_stats", "utility_meter", "hacs",
    "icloud", "glances", "xiaozhi_mcp", "bermuda_global",
}
# Always software, even when they bring lights or media players (browser_mod: one device per
# browser, with a "screen" light and a media player; a new one appears for every new browser).
ALWAYS_VIRTUAL = {"browser_mod", "hacs", "ha_mcp_tools", "mcp_server", "spoolman", "places"}
NETWORK_INTEGRATIONS = {
    "esphome", "shelly", "tuya", "tuya_local", "tasmota", "wled", "tplink",
    "cast", "sonos", "fritz", "mobile_app", "xiaomi_miio", "xiaomi_miot",
    "homekit_controller", "unifi", "hue", "nanoleaf", "yeelight", "broadlink",
    "samsungtv", "androidtv", "androidtv_remote", "apple_tv", "lg_thinq",
    "home_connect", "reolink", "onvif", "dlna_dmr", "webostv", "bosch_shc",
    "nuki", "elgato", "tado", "netatmo", "ring", "doorbird", "wiz",
    "synology_dsm", "bambu_lab", "nut", "fully_kiosk", "tapo", "wemo",
    "fritzbox", "roku", "kodi", "plex", "jellyfin", "frigate", "octoprint",
    "moonraker", "upnp", "xiaomi_aqara",
}

# Boxes that are computers rather than smart-home gadgets (own type in the list).
COMPUTER_INTEGRATIONS = {
    "synology_dsm", "qnap", "qnap_qsw", "unraid", "truenas", "bambu_lab", "octoprint",
    "moonraker", "prusalink", "nut", "apcupsd", "asuswrt_pc", "pi_hole", "adguard",
    "elkm1_pc", "remote_rpi_gpio", "rpi_power",
}

# Entities that never go on a plan on their own (search "entities without a device").
_LOOSE_EXCLUDE = {
    "automation", "script", "scene", "zone", "person", "device_tracker", "sun", "update",
    "tts", "stt", "conversation", "wake_word", "assist_satellite", "ai_task", "notify",
    "image", "todo", "calendar", "weather", "event", "persistent_notification", "group",
}

# Entity kinds that are real appliances: a device with one is never "virtual", and an
# entity of this kind without a device (SmartIR AC, IR fan…) is listed like a device.
PHYSICAL_DOMAINS = {
    "climate", "light", "cover", "fan", "lock", "vacuum", "media_player", "water_heater",
    "humidifier", "valve", "lawn_mower", "switch", "siren", "camera", "alarm_control_panel",
}
_LOOSE_GROUP = {
    "light": "lights", "switch": "plugs_switches", "climate": "climate", "fan": "climate",
    "water_heater": "climate", "humidifier": "climate", "cover": "covers", "valve": "covers",
    "lock": "security", "alarm_control_panel": "security", "siren": "security",
    "camera": "cameras", "media_player": "media", "vacuum": "appliances",
    "lawn_mower": "appliances",
}

# Roles the card uses to pick entities per overlay.
_ROLE_DC = {
    "temperature": "temperature", "humidity": "humidity", "battery": "battery",
    "signal_strength": "signal", "power": "power", "energy": "energy",
    "illuminance": "illuminance", "carbon_dioxide": "co2", "pm25": "pm25",
}

# Connection kinds, in display order.
CONNECTIONS = ("zigbee", "zwave", "matter", "network", "bluetooth")

_GROUP_BY_DOMAIN = (
    ("climate", "climate"),
    ("fan", "climate"),
    ("water_heater", "climate"),
    ("humidifier", "climate"),
    ("cover", "covers"),
    ("valve", "covers"),
    ("lock", "security"),
    ("alarm_control_panel", "security"),
    ("siren", "security"),
    ("camera", "cameras"),
    ("media_player", "media"),
    ("vacuum", "appliances"),
    ("lawn_mower", "appliances"),
)

# Which entity represents a device (icon, state, more-info).
# #122: what defines a device comes first (an AC with a dozen feature switches is a climate).
_MAIN_DOMAINS = (
    "climate", "cover", "lock", "vacuum", "media_player", "alarm_control_panel",
    "water_heater", "humidifier", "lawn_mower", "valve", "fan",
    "light", "switch", "camera", "siren", "binary_sensor", "sensor", "event",
    "number", "select", "button", "update",
)
_GOOD_BINARY = {"door", "window", "opening", "garage_door", "motion", "occupancy", "presence", "moisture", "smoke", "gas"}
_WEAK_SENSOR = {"battery", "signal_strength", "voltage", "timestamp", "date", "duration"}


def _pairs(items) -> list[tuple[str, str]]:
    """(type, value) pairs; tolerates legacy 3-tuples in identifiers."""
    out: list[tuple[str, str]] = []
    for item in items or ():
        if len(item) >= 2:
            out.append((str(item[0]), str(item[1])))
        elif item:
            out.append((str(item[0]), ""))
    return out


def device_ieee(device: dr.DeviceEntry) -> str | None:
    """Zigbee IEEE in 0x-prefixed hex form (as used by zigbee2mqtt / most cards)."""
    raw = None
    for ctype, value in _pairs(device.connections):
        if ctype == dr.CONNECTION_ZIGBEE:
            raw = value
    if raw is None:
        for domain, value in _pairs(device.identifiers):
            if domain == "zha":
                raw = value
    if raw is None:
        return None
    raw = str(raw).lower()
    if raw.startswith("0x"):
        return raw
    return "0x" + raw.replace(":", "")


def entity_roles(hass: HomeAssistant, entity_ids: list[str]) -> dict[str, str]:
    """First entity per role (temperature, humidity, battery, signal, power, …)."""
    ent_reg = er.async_get(hass)
    roles: dict[str, str] = {}
    for eid in entity_ids:
        ent = ent_reg.async_get(eid)
        state = hass.states.get(eid)
        dc = None
        if ent is not None:
            dc = ent.device_class or ent.original_device_class
        if dc is None and state is not None:
            dc = state.attributes.get("device_class")
        role = _ROLE_DC.get(dc or "")
        low = eid.lower()
        if role is None and eid.startswith("sensor.") and (
            low.endswith(("_linkquality", "_lqi", "_rssi")) or "signal" in low
        ):
            role = "signal"
        if role and role not in roles:
            roles[role] = eid
    return roles


def _own_connection(device: dr.DeviceEntry) -> bool:
    """The device talks to HA itself (MAC, Zigbee, Bluetooth, Matter, Z-Wave id)."""
    if _pairs(device.connections):
        return True
    ids = {domain for domain, _ in _pairs(device.identifiers)}
    return bool(ids & {"zha", "matter", "zwave_js", "deconz"})


def find_parts(
    hass: HomeAssistant,
    data: FloorplanData,
    entries: dict[str, dr.DeviceEntry],
    skip: set[str],
) -> dict[str, str]:
    """child id -> root parent id for devices that are parts of another one.

    A part is "connected via" a device of the same integration, has no connection
    of its own and is named after its parent (P2S…_AMS_1, cloudy (Drive 1)). Hubs
    and bridges don't qualify: their children have own radios or own names.
    The user can override per device (device_opts part = "own" / "part").
    """
    parent_of: dict[str, str] = {}
    for device in entries.values():
        if device.id in skip:
            continue
        pid = device.via_device_id
        parent = entries.get(pid) if pid else None
        if parent is None:
            continue
        override = data.device_opts.get(device.id, {}).get("part")
        if override == "own":
            continue
        if override != "part":
            if set(device.config_entries or ()) .isdisjoint(parent.config_entries or ()):
                continue
            if _own_connection(device):
                continue
            name = (device.name_by_user or device.name or "").lower()
            pnames = [
                (parent.name_by_user or "").lower(),
                (parent.name or "").lower(),
                (parent.model or "").lower(),
            ]
            if not any(n and len(n) >= 3 and name.startswith(n) and name != n for n in pnames):
                continue
        parent_of[device.id] = parent.id
    # Resolve chains to the top-most parent.
    roots: dict[str, str] = {}
    for child in parent_of:
        root = parent_of[child]
        seen = {child}
        while root in parent_of and root not in seen:
            seen.add(root)
            root = parent_of[root]
        roots[child] = root
    return roots


def entity_name(hass: HomeAssistant, entity_id: str) -> str:
    state = hass.states.get(entity_id)
    if state is not None and state.attributes.get("friendly_name"):
        return str(state.attributes["friendly_name"])
    ent = er.async_get(hass).async_get(entity_id)
    if ent is not None:
        return ent.name or ent.original_name or entity_id
    return entity_id


def is_plan_device(device: dr.DeviceEntry) -> bool:
    """The device Device Floorplan creates for each plan."""
    return any(domain == DOMAIN for domain, _ in _pairs(device.identifiers))


def replacement_entity(hass: HomeAssistant, entity_id: str) -> str | None:
    """#106: the entity that replaced a hidden one via "Show as" (switch_as_x), if any."""
    ent_reg = er.async_get(hass)
    for entry in hass.config_entries.async_entries("switch_as_x"):
        if (entry.options or {}).get("entity_id") != entity_id:
            continue
        for e in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
            return e.entity_id
    return None


def migrate_replaced(hass: HomeAssistant, data: FloorplanData) -> None:
    """Move entity spots whose entity is now shown as another one (switch → light)."""
    ent_reg = er.async_get(hass)
    changed = False
    for plan in data.plans.values():
        pos_all = plan.get("positions", {})
        for key in list(pos_all):
            if not key.startswith("entity:"):
                continue
            ent = ent_reg.async_get(key[7:])
            if ent is None or ent.hidden_by is None:
                continue
            new = replacement_entity(hass, key[7:])
            if new and f"entity:{new}" not in pos_all:
                pos_all[f"entity:{new}"] = pos_all.pop(key)
                changed = True
    if changed:
        data._save()  # noqa: SLF001


def default_main_entity(hass: HomeAssistant, data: FloorplanData, device_id: str) -> str | None:
    """The user's choice, else the best-ranked entity of the device."""
    chosen = data.main_entity.get(device_id)
    ent_reg = er.async_get(hass)
    entities = [e for e in er.async_entries_for_device(ent_reg, device_id) if e.disabled_by is None]
    if chosen and (chosen in {e.entity_id for e in entities} or hass.states.get(chosen) is not None):
        return chosen  # also an entity of another device or a helper ("Other entity…")
    ranked = sorted(entities, key=_entity_rank)
    return ranked[0].entity_id if ranked else None


def device_mac(device: dr.DeviceEntry) -> str | None:
    for ctype, value in _pairs(device.connections):
        if ctype in (dr.CONNECTION_NETWORK_MAC, dr.CONNECTION_BLUETOOTH):
            return str(value).lower()
    return None


def _integrations(hass: HomeAssistant, device: dr.DeviceEntry) -> list[str]:
    out: list[str] = []
    single = getattr(device, "config_entry_id", None)
    if single is not None:
        entry_ids = [single]
    else:
        primary = getattr(device, "primary_config_entry", None)
        entry_ids = list(getattr(device, "config_entries", ()) or ())
        if primary in entry_ids:
            entry_ids.remove(primary)
            entry_ids.insert(0, primary)
    for entry_id in entry_ids:
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry and entry.domain not in out:
            out.append(entry.domain)
    return out


def _connections(
    device: dr.DeviceEntry, integrations: list[str], domains: set[str] | None = None
) -> tuple[list[str], bool]:
    """All connection kinds of a device, and whether it is virtual/software."""
    ids = {domain for domain, _ in _pairs(device.identifiers)}
    conns = {ctype for ctype, _ in _pairs(device.connections)}
    ident_values = " ".join(v for _, v in _pairs(device.identifiers))
    found: set[str] = set()
    if (
        "zha" in ids
        or dr.CONNECTION_ZIGBEE in conns
        or "zigbee2mqtt" in ident_values
        or "deconz" in integrations
        or ("xiaomi_aqara" in integrations and "xiaomi_aqara" in ids and not conns)
    ):
        found.add("zigbee")
    if "zwave_js" in ids:
        found.add("zwave")
    if "matter" in ids or "thread" in integrations:
        found.add("matter")
    if dr.CONNECTION_NETWORK_MAC in conns or (
        not found and NETWORK_INTEGRATIONS.intersection(integrations)
    ):
        found.add("network")
    if dr.CONNECTION_BLUETOOTH in conns or BLE_INTEGRATIONS.intersection(integrations):
        found.add("bluetooth")
    virtual = bool(ALWAYS_VIRTUAL.intersection(integrations[:1])) or bool(
        not found
        and not (domains and domains & PHYSICAL_DOMAINS - {"switch"})
        and (
            VIRTUAL_INTEGRATIONS.intersection(integrations[:1])
            or (not integrations and VIRTUAL_INTEGRATIONS.intersection(ids))
            or device.entry_type == dr.DeviceEntryType.SERVICE
        )
    )
    return [c for c in CONNECTIONS if c in found], virtual


def _group(entities: list[er.RegistryEntry], integrations: list[str] | None = None) -> str:
    if integrations and COMPUTER_INTEGRATIONS.intersection(integrations[:1]):
        return "computers"
    primary: dict[str, list[er.RegistryEntry]] = {}
    has_battery = False
    for ent in entities:
        dc = ent.device_class or ent.original_device_class
        if ent.domain == "sensor" and dc == "battery":
            has_battery = True
        if ent.entity_category is not None:
            continue
        primary.setdefault(ent.domain, []).append(ent)

    # A lamp: lights and not much else (#84). A printer with a chamber light or a TV with a
    # backlight is not a lamp; it can still get a light shape in the Editor.
    sensors = len(primary.get("sensor", [])) + len(primary.get("binary_sensor", []))
    if "light" in primary and sensors <= 4 and not {"media_player", "camera", "vacuum", "climate", "fan"} & primary.keys():
        return "lights"
    for domain, group in _GROUP_BY_DOMAIN:
        if domain in primary:
            return group
    if "switch" in primary:
        return "plugs_switches"
    if "binary_sensor" in primary:
        dcs = {(e.device_class or e.original_device_class) for e in primary["binary_sensor"]}
        if dcs & {"door", "window", "opening", "garage_door"}:
            return "contacts"
        if dcs & {"motion", "occupancy", "presence", "moving"}:
            return "motion"
    if "event" in primary or "remote" in primary:
        return "buttons"
    if "sensor" in primary or "binary_sensor" in primary:
        return "sensors"
    if set(primary) <= {"button", "update"}:
        return "buttons" if has_battery else "network"
    return "other"


def _entity_rank(ent: er.RegistryEntry) -> tuple[int, int, str]:
    dc = ent.device_class or ent.original_device_class
    try:
        dom = _MAIN_DOMAINS.index(ent.domain)
    except ValueError:
        dom = len(_MAIN_DOMAINS)
    bonus = 0
    if ent.domain == "binary_sensor" and dc in _GOOD_BINARY:
        bonus = -1
    if ent.domain == "sensor" and dc in _WEAK_SENSOR:
        bonus = 2
    if ent.domain == "button" and ent.entity_id.endswith("_identify"):
        bonus = 3
    category = 0 if ent.entity_category is None else 10
    return (category, dom * 4 + bonus, ent.entity_id)


@callback
def list_devices(hass: HomeAssistant, data: FloorplanData) -> dict[str, Any]:
    """All physical devices (Bluetooth twins merged into their parent), areas, floors."""
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    area_reg = ar.async_get(hass)

    entries: dict[str, dr.DeviceEntry] = {}
    for item in dev_reg.devices:
        device = item if isinstance(item, dr.DeviceEntry) else dev_reg.async_get(item)
        if device is None or device.disabled_by is not None:
            continue
        if is_plan_device(device):
            continue  # our own "plan" devices never go on a plan
        entries[device.id] = device

    ents_by_device: dict[str, list[er.RegistryEntry]] = {}
    for device_id in entries:
        ents_by_device[device_id] = [
            e for e in er.async_entries_for_device(ent_reg, device_id) if e.disabled_by is None
        ]

    # Native linking: a device "connected via" a parent that has no entities of
    # its own is the same physical thing (e.g. an ESP32's Bluetooth side).
    merged_into: dict[str, str] = {}
    for device in entries.values():
        parent = device.via_device_id
        if parent and parent in entries and not ents_by_device[device.id]:
            merged_into[device.id] = parent
    # Parts of one physical thing (printer + AMS, NAS + drives): one row, one marker.
    part_of = find_parts(hass, data, entries, set(merged_into))
    for child, root in list(merged_into.items()):
        if root in part_of:
            merged_into[child] = part_of[root]

    out: dict[str, dict[str, Any]] = {}
    for device in entries.values():
        if device.id in merged_into or device.id in part_of:
            continue
        try:
            entities = ents_by_device[device.id]
            integrations = _integrations(hass, device)
            conns, virtual = _connections(device, integrations, {e.domain for e in entities})
            group = _group(entities, integrations)
        except Exception:  # noqa: BLE001 - never let one odd device break the editor
            _LOGGER.debug("Could not classify device %s", device.id, exc_info=True)
            entities, integrations, conns, virtual, group = [], [], [], False, "other"
        area = area_reg.async_get_area(device.area_id) if device.area_id else None

        part_ids = [c for c, r in part_of.items() if r == device.id]
        part_entities = [e for c in part_ids for e in ents_by_device.get(c, [])]
        ranked = sorted(entities, key=_entity_rank)
        main = data.main_entity.get(device.id)
        other_main = False
        if main not in {e.entity_id for e in entities}:
            if main and hass.states.get(main) is not None:
                other_main = True  # "Other entity…": a helper or another device's entity
            else:
                main = ranked[0].entity_id if ranked else None
        candidates = [
            {
                "entity_id": e.entity_id,
                "name": e.name or e.original_name or e.entity_id,
                "domain": e.domain,
                "dc": e.device_class or e.original_device_class,
            }
            for e in ranked + sorted(part_entities, key=_entity_rank)
            if e.entity_category is None and e.hidden_by is None
        ]
        if other_main and main:
            candidates.append({"entity_id": main, "name": entity_name(hass, main), "domain": main.split(".")[0], "other": True})
        # Everything searchable: entity ids and names of the device and its parts.
        search = " ".join(
            f"{e.entity_id} {e.name or e.original_name or ''}" for e in entities + part_entities
        ).lower()
        opts = data.device_opts.get(device.id, {})

        states = [hass.states.get(e.entity_id) for e in entities]
        live = [s for s in states if s is not None]
        unavailable = bool(live) and all(s.state in (STATE_UNAVAILABLE, STATE_UNKNOWN) for s in live)
        all_hidden = bool(entities) and all(e.hidden_by is not None for e in entities)
        battery = next(
            (
                e.entity_id
                for e in entities
                if e.domain == "sensor" and (e.device_class or e.original_device_class) == "battery"
            ),
            None,
        )

        out[device.id] = {
            "id": device.id,
            "name": device.name_by_user or device.name or device.id,
            "manufacturer": device.manufacturer,
            "model": device.model,
            "area_id": device.area_id,
            "area_name": area.name if area else None,
            "floor_id": getattr(area, "floor_id", None) if area else None,
            "integration": integrations[0] if integrations else None,
            "conns": conns or ([] if virtual else ["other"]),
            "virtual": virtual,
            "group": group,
            "ieee": device_ieee(device),
            "mac": device_mac(device),
            "main_entity": main,
            "entities": candidates,
            "entity_count": len(entities),
            "battery_entity": battery,
            "unavailable": unavailable,
            "all_hidden": all_hidden,
            "merged": [],
            "parts": [
                {"id": c, "name": entries[c].name_by_user or entries[c].name or c, "model": entries[c].model}
                for c in part_ids
            ],
            "search": search,
            "via": device.via_device_id,
            "only_main": bool(opts.get("only_main")),
            "labels": sorted(getattr(device, "labels", ()) or ()),
        }

    for child_id, parent_id in merged_into.items():
        parent = out.get(parent_id)
        child = entries[child_id]
        if parent is None:
            continue
        parent["merged"].append(child.name_by_user or child.name or child_id)
        try:
            conns, _virtual = _connections(child, _integrations(hass, child))
        except Exception:  # noqa: BLE001
            conns = []
        for conn in conns:
            if conn not in parent["conns"]:
                parent["conns"].append(conn)
        parent["conns"] = [c for c in CONNECTIONS if c in parent["conns"]] + [
            c for c in parent["conns"] if c not in CONNECTIONS
        ]
        if len(parent["conns"]) > 1 and "other" in parent["conns"]:
            parent["conns"].remove("other")

    # Devices that could be parts but were set to "show as its own device" keep a hint.
    for device in entries.values():
        if device.id in out and data.device_opts.get(device.id, {}).get("part") == "own":
            out[device.id]["part_override"] = "own"
    for child, root in part_of.items():
        if root in out and data.device_opts.get(child, {}).get("part") == "part":
            out[root].setdefault("forced_parts", []).append(child)

    devices = sorted(out.values(), key=lambda d: (d["area_name"] or "~", d["name"].lower()))
    areas = [
        {"area_id": a.id, "name": a.name, "floor_id": getattr(a, "floor_id", None)}
        for a in sorted(area_reg.async_list_areas(), key=lambda a: a.name.lower())
    ]
    floors: list[dict[str, Any]] = []
    try:
        from homeassistant.helpers import floor_registry as fr

        floors = [
            {"floor_id": f.floor_id, "name": f.name, "level": f.level, "icon": f.icon}
            for f in fr.async_get(hass).async_list_floors()
        ]
    except ImportError:  # pragma: no cover
        pass
    return {
        "devices": devices,
        "areas": areas,
        "floors": floors,
        "merged_into": merged_into,
        "part_of": part_of,
        "loose": loose_entities(hass),
    }


def _loose_group(domain: str, device_class: str | None) -> str:
    if domain in _LOOSE_GROUP:
        return _LOOSE_GROUP[domain]
    if domain == "binary_sensor":
        if device_class in ("door", "window", "opening", "garage_door"):
            return "contacts"
        if device_class in ("motion", "occupancy", "presence", "moving"):
            return "motion"
    return "helpers"


@callback
def loose_entities(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Entities without a device (helpers, YAML templates): placeable on their own."""
    ent_reg = er.async_get(hass)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ent in ent_reg.entities.values():
        if ent.device_id or ent.disabled_by is not None or ent.platform == DOMAIN:
            continue
        if ent.domain in _LOOSE_EXCLUDE:
            continue
        seen.add(ent.entity_id)
        out.append(
            {
                "entity_id": ent.entity_id,
                "name": entity_name(hass, ent.entity_id),
                "domain": ent.domain,
                "platform": ent.platform,
                "area_id": ent.area_id,
                "group": _loose_group(ent.domain, ent.device_class or ent.original_device_class),
                # A real appliance without a device (SmartIR AC…) in a room: listed like a device.
                "physical": bool(ent.area_id and ent.domain in PHYSICAL_DOMAINS and ent.hidden_by is None),
            }
        )
    # YAML entities without a unique_id are not in the registry at all.
    for state in hass.states.async_all():
        eid = state.entity_id
        if eid in seen or ent_reg.async_get(eid) is not None:
            continue
        if state.domain in _LOOSE_EXCLUDE or eid.startswith(f"sensor.{DOMAIN}_"):
            continue
        out.append(
            {
                "entity_id": eid,
                "name": str(state.attributes.get("friendly_name") or eid),
                "domain": state.domain,
                "platform": None,
                "area_id": None,
                "group": _loose_group(state.domain, state.attributes.get("device_class")),
                "physical": False,
            }
        )
    out.sort(key=lambda e: e["name"].lower())
    return out[:3000]


@callback
def build_plan_payload(
    hass: HomeAssistant, data: FloorplanData, plan: dict[str, Any]
) -> dict[str, Any]:
    """Positions of one plan resolved against the registries (sensor attributes)."""
    dev_reg = dr.async_get(hass)
    area_reg = ar.async_get(hass)
    width = plan.get("width") or 0
    height = plan.get("height") or 0
    scale = data.scale(plan)

    def to_px(x: float, y: float) -> tuple[int | None, int | None]:
        if not width or not height:
            return None, None
        return round(x * width / 100), round(y * height / 100)

    ent_reg = er.async_get(hass)
    entries = {
        d.id: d for d in dev_reg.devices.values() if d.disabled_by is None and not is_plan_device(d)
    }
    part_of = find_parts(hass, data, entries, set())
    parts_by_root: dict[str, list[str]] = {}
    for child, root in part_of.items():
        parts_by_root.setdefault(root, []).append(child)

    devices: dict[str, Any] = {}
    entities_out: dict[str, Any] = {}
    zigbee: dict[str, Any] = {}
    for key, pos in plan.get("positions", {}).items():
        x, y = pos["x"], pos["y"]
        px, py = to_px(x, y)
        approx = bool(pos.get("approx"))
        if key.startswith("entity:"):
            # A helper / entity without a device, placed on its own.
            eid = key[7:]
            if hass.states.get(eid) is None and ent_reg.async_get(eid) is None:
                continue
            of = pos.get("of")
            if of and (data.skipped.get(of) or of not in plan.get("positions", {})):
                continue  # its device is no longer on this plan
            entities_out[eid] = {
                **({"of": of} if of else {}),
                **({"as": pos["as"]} if pos.get("as") else {}),
                "name": entity_name(hass, eid),
                "x": x, "y": y, "px": px, "py": py,
                "approx": approx,
                "main_entity": eid,
                "entities": [eid],
                "roles": entity_roles(hass, [eid]),
                **({"light": pos["light"]} if pos.get("light") else {}),
                **({"air": pos["air"]} if pos.get("air") else {}),
                **({"opening": pos["opening"]} if pos.get("opening") else {}),
            }
            continue
        if data.skipped.get(key) or key in part_of:
            continue
        device = entries.get(key) or dev_reg.async_get(key)
        if device is None:
            continue
        name = device.name_by_user or device.name or key
        entities = [e for e in er.async_entries_for_device(ent_reg, key) if e.disabled_by is None]
        integrations: list[str] = []
        try:
            integrations = _integrations(hass, device)
            conns, _virtual = _connections(device, integrations, {e.domain for e in entities})
            group = _group(entities, integrations)
        except Exception:  # noqa: BLE001
            conns, group = [], "other"
        main = default_main_entity(hass, data, key)
        part_ids = parts_by_root.get(key, [])
        all_ids = [e.entity_id for e in sorted(entities, key=_entity_rank)]
        for child in part_ids:
            all_ids += [
                e.entity_id
                for e in sorted(er.async_entries_for_device(ent_reg, child), key=_entity_rank)
                if e.disabled_by is None
            ]
        if main and main not in all_ids:
            all_ids.insert(0, main)  # "Other entity…"
        # Split device (#91): each entity shows in one place; its own spot wins.
        split = [e for e in all_ids if f"entity:{e}" in plan.get("positions", {}) and plan["positions"][f"entity:{e}"].get("of") == key]
        if split:
            all_ids = [e for e in all_ids if e not in split]
            if main in split:
                main = all_ids[0] if all_ids else None
        # 0.6.0: "the card uses only this entity" is gone; the card picks per overlay (#100).
        only_main = False
        ids = all_ids
        if split:
            # Entities placed elsewhere never shape the device itself (#106).
            try:
                group = _group([e for e in entities if e.entity_id not in split], integrations)
            except Exception:  # noqa: BLE001
                pass
        item: dict[str, Any] = {
            "name": name,
            "area_id": device.area_id,
            "x": x, "y": y, "px": px, "py": py,
            "approx": approx,
            "main_entity": main,
            "entities": ids,
            "roles": entity_roles(hass, ids),
            "conns": conns,
            "group": group,
        }
        if split:
            item["split"] = split
        if part_ids:
            item["parts"] = [entries[c].name_by_user or entries[c].name or c for c in part_ids]
        if only_main:
            item["only_main"] = True
        box = pos.get("box")
        if box:
            bpx, bpy = to_px(box["x"], box["y"])
            item["box"] = {"x": box["x"], "y": box["y"], "px": bpx, "py": bpy}
        if pos.get("z"):
            item["z"] = pos["z"]
        if pos.get("light"):
            item["light"] = pos["light"]
        if pos.get("air"):
            item["air"] = pos["air"]
        if pos.get("opening"):
            item["opening"] = pos["opening"]
        if pos.get("as"):
            item["as"] = pos["as"]
        ieee = device_ieee(device)
        mac = device_mac(device)
        if ieee:
            item["ieee"] = ieee
            # The radio sits where the box is, when the device has a separate box spot.
            rx, ry, rpx, rpy = (box["x"], box["y"], *to_px(box["x"], box["y"])) if box else (x, y, px, py)
            zigbee[ieee] = {
                "x": rpx if rpx is not None else rx,
                "y": rpy if rpy is not None else ry,
                "name": f"{name} • approx" if approx else name,
            }
        if mac:
            item["mac"] = mac
        if device.via_device_id:
            item["via"] = device.via_device_id  # hub / bridge (Network links, #49)
        devices[key] = item

    areas: dict[str, Any] = {}
    hidden_rooms = set(plan.get("hidden_rooms") or [])
    for area_id, pos in plan.get("anchors", {}).items():
        if area_id in hidden_rooms:
            continue
        area = area_reg.async_get_area(area_id)
        px, py = to_px(pos["x"], pos["y"])
        areas[area_id] = {
            "name": area.name if area else area_id,
            "icon": area.icon if area else None,
            # People (#67): a room sensor may report the name, the id or an alias.
            **({"aliases": sorted(area.aliases)} if area and getattr(area, "aliases", None) else {}),
            "x": pos["x"], "y": pos["y"], "px": px, "py": py,
            **({"shape": (plan.get("shapes") or {})[area_id]} if (plan.get("shapes") or {}).get(area_id) else {}),
        }

    # Bonds (#40): members share one position; the card shows one marker per bond.
    bonds: dict[str, Any] = {}
    for bond_id, members in (plan.get("bonds") or {}).items():
        placed = [m for m in members if m in devices or m.startswith("entity:") and m[7:] in entities_out]
        if len(placed) < 2:
            continue
        first = devices.get(placed[0]) or entities_out.get(placed[0][7:])
        mains = []
        for m in placed:
            item = devices.get(m) or entities_out.get(m[7:])
            item["bond"] = bond_id
            if item.get("main_entity"):
                mains.append(item["main_entity"])
        domain = mains[0].split(".")[0] if mains else None
        meta = (plan.get("bond_meta") or {}).get(bond_id, {})
        bonds[bond_id] = {
            **({"name": meta["name"]} if meta.get("name") else {}),
            **({"icon": meta["icon"]} if meta.get("icon") else {}),
            **({"tap": meta["tap"]} if meta.get("tap") else {}),
            **({"show": meta["show"]} if meta.get("show") else {}),
            "members": placed,
            "names": [(devices.get(m) or entities_out.get(m[7:]))["name"] for m in placed],
            "entities": mains,
            "domain": domain,
            "x": first["x"], "y": first["y"], "px": first["px"], "py": first["py"],
        }

    # Phantom devices (#60): members stay where they are; the phantom has its own free spot.
    phantoms: dict[str, Any] = {}
    for pid, ph in (plan.get("phantoms") or {}).items():
        members = [m for m in ph.get("members", []) if m in devices or (m.startswith("entity:") and m[7:] in entities_out)]
        px, py = to_px(ph.get("x", 50), ph.get("y", 50))
        ents: list[str] = []
        uses = ph.get("uses") or {}
        for m in members:
            item = devices.get(m) or entities_out.get(m[7:])
            mine = uses.get(m) or item.get("entities") or [item.get("main_entity")]
            ents += [e for e in mine if e and e not in ents]
        phantoms[pid] = {
            "name": ph.get("name") or "Phantom",
            "icon": ph.get("icon"),
            "x": ph.get("x", 50), "y": ph.get("y", 50), "px": px, "py": py,
            "members": members,
            "entities": ents,
            "value": ph.get("value") or "average",
            **({"one": ph["one"]} if ph.get("one") else {}),
        }

    real_w = round(width * scale["x"], 2) if scale["x"] and width else None
    real_h = round(height * scale["y"], 2) if scale["y"] and height else None
    return {
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "kind": plan.get("kind"),
        "floor_id": plan.get("floor_id"),
        "level": data.plan_level(plan),
        "image_type": plan.get("image_type"),
        "image_url": data.image_url(plan),
        "image_fallback_url": data.fallback_url(plan),
        "image_width": width,
        "image_height": height,
        "metres_per_px_x": round(scale["x"], 6) if scale["x"] else None,
        "metres_per_px_y": round(scale["y"], 6) if scale["y"] else None,
        "real_width_m": real_w,
        "real_height_m": real_h,
        "approx_count": sum(1 for d in devices.values() if d["approx"]),
        "devices": devices,
        "entities": entities_out,
        "bonds": bonds,
        "phantoms": phantoms,
        "zigbee_devices": zigbee,
        "areas": areas,
    }
