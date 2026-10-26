"""Websocket API used by the planner panel."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, TEMPLATES_DIR, VERSION
from .devices import build_plan_payload, list_devices
from .store import IMAGE_KINDS, PLAN_KINDS, FloorplanData

_PCT = vol.All(vol.Coerce(float), vol.Range(min=0, max=100))
_POSITION = {
    vol.Required("x"): _PCT,
    vol.Required("y"): _PCT,
    vol.Optional("approx"): cv.boolean,
    vol.Optional("z"): vol.Coerce(int),
    vol.Optional("box"): vol.Any(None, {vol.Required("x"): _PCT, vol.Required("y"): _PCT}),
    vol.Optional("light"): vol.Any(None, dict),
    vol.Optional("air"): vol.Any(None, dict),
    vol.Optional("of"): vol.Any(None, str),  # split device (#91): entity spot of this device
    vol.Optional("as"): vol.Any(None, vol.In(("light", "switch", "fan", "other", "door", "window", "shutter"))),
    vol.Optional("opening"): vol.Any(None, dict),
}
_ANCHOR = {vol.Required("x"): _PCT, vol.Required("y"): _PCT}
_REF = {
    vol.Required("ax"): _PCT,
    vol.Required("ay"): _PCT,
    vol.Required("bx"): _PCT,
    vol.Required("by"): _PCT,
    vol.Required("length"): vol.All(vol.Coerce(float), vol.Range(min=0.01, max=10000)),
    vol.Required("dir"): vol.In(("h", "v")),
}
_LEVEL = vol.Any(None, vol.All(vol.Coerce(int), vol.Range(min=-20, max=200)))


@callback
def async_register(hass: HomeAssistant) -> None:
    for handler in (
        ws_state,
        ws_devices,
        ws_payload,
        ws_plan_create,
        ws_plan_update,
        ws_plan_delete,
        ws_plan_image_url,
        ws_plan_image_template,
        ws_images_list,
        ws_skip,
        ws_seen,
        ws_main_entity,
        ws_device_opts,
        ws_setup_complete,
        ws_setup_reset,
        ws_overlay_subscribe,
    ):
        websocket_api.async_register_command(hass, handler)


def _data(hass: HomeAssistant, connection, msg) -> FloorplanData | None:
    data: FloorplanData | None = hass.data.get(DOMAIN)
    if data is None:
        connection.send_error(msg["id"], "not_loaded", "Device Floorplan is not set up")
    return data


def _plan_or_error(data: FloorplanData, connection, msg) -> bool:
    if msg["plan_id"] not in data.plans:
        connection.send_error(msg["id"], "not_found", f"Unknown plan {msg['plan_id']}")
        return False
    return True


@websocket_api.websocket_command({vol.Required("type"): "device_floorplan/state"})
@callback
def ws_state(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {**data.state_public(), "version": VERSION})


@websocket_api.websocket_command({vol.Required("type"): "device_floorplan/devices"})
@callback
def ws_devices(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], list_devices(hass, data))


@websocket_api.websocket_command(
    {vol.Required("type"): "device_floorplan/payload", vol.Required("plan_id"): cv.string}
)
@callback
def ws_payload(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Resolved positions of one plan (same content as the plan's sensor)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    plan = data.find_plan(msg["plan_id"])
    if plan is None:
        connection.send_error(msg["id"], "not_found", f"Unknown plan {msg['plan_id']}")
        return
    connection.send_result(msg["id"], build_plan_payload(hass, data, plan))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/plan/create",
        vol.Required("name"): vol.All(cv.string, vol.Length(min=1, max=60)),
        vol.Optional("kind", default="floor"): vol.In(PLAN_KINDS),
        vol.Optional("floor_id"): vol.Any(None, cv.string),
        vol.Optional("level"): _LEVEL,
        vol.Optional("image_type", default="top"): vol.In(IMAGE_KINDS),
    }
)
@callback
def ws_plan_create(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    plan = data.create_plan(
        msg["name"], msg["kind"], msg.get("floor_id"), msg.get("level"), msg["image_type"]
    )
    connection.send_result(msg["id"], data.plan_public(plan["id"]))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/plan/update",
        vol.Required("plan_id"): cv.string,
        vol.Optional("name"): vol.All(cv.string, vol.Length(min=1, max=60)),
        vol.Optional("kind"): vol.In(PLAN_KINDS),
        vol.Optional("floor_id"): vol.Any(None, cv.string),
        vol.Optional("level"): _LEVEL,
        vol.Optional("image_type"): vol.In(IMAGE_KINDS),
        vol.Optional("positions"): {cv.string: _POSITION},
        vol.Optional("bonds"): {cv.string: [cv.string]},
        vol.Optional("bond_meta"): {cv.string: dict},
        vol.Optional("phantoms"): {cv.string: dict},
        vol.Optional("anchors"): {cv.string: _ANCHOR},
        vol.Optional("refs"): [_REF],
        vol.Optional("hidden_rooms"): [cv.string],
        vol.Optional("sort"): vol.Coerce(int),
        vol.Optional("anchors_centered"): cv.boolean,
        vol.Optional("shapes"): {cv.string: [[vol.Coerce(float)]]},
    }
)
@callback
def ws_plan_update(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _plan_or_error(data, connection, msg):
        return
    changes = {k: v for k, v in msg.items() if k not in ("id", "type", "plan_id")}
    data.update_plan(msg["plan_id"], changes)
    connection.send_result(msg["id"], data.plan_public(msg["plan_id"]))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "device_floorplan/plan/delete", vol.Required("plan_id"): cv.string}
)
@websocket_api.async_response
async def ws_plan_delete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _plan_or_error(data, connection, msg):
        return
    await data.async_delete_plan(msg["plan_id"])
    connection.send_result(msg["id"], {"deleted": msg["plan_id"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/plan/image_url",
        vol.Required("plan_id"): cv.string,
        vol.Required("url"): vol.All(cv.string, vol.Match(r"^(/|https?://)")),
        vol.Required("width"): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Required("height"): vol.All(vol.Coerce(int), vol.Range(min=1)),
    }
)
@websocket_api.async_response
async def ws_plan_image_url(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _plan_or_error(data, connection, msg):
        return
    await data.async_set_image_url(msg["plan_id"], msg["url"], msg["width"], msg["height"])
    connection.send_result(msg["id"], data.plan_public(msg["plan_id"]))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/devices/skip",
        vol.Required("device_ids"): [cv.string],
        vol.Required("skipped"): cv.boolean,
    }
)
@callback
def ws_skip(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    data.set_skipped(msg["device_ids"], msg["skipped"])
    connection.send_result(msg["id"], {"skipped": sorted(data.skipped)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "device_floorplan/devices/seen", vol.Required("device_ids"): [cv.string]}
)
@callback
def ws_seen(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    data.mark_seen(msg["device_ids"])
    connection.send_result(msg["id"], {})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/devices/main_entity",
        vol.Required("device_id"): cv.string,
        vol.Required("entity_id"): vol.Any(None, cv.entity_id),
    }
)
@callback
def ws_main_entity(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    data.set_main_entity(msg["device_id"], msg["entity_id"])
    connection.send_result(msg["id"], {})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/devices/options",
        vol.Required("device_id"): cv.string,
        vol.Optional("only_main"): cv.boolean,
        vol.Optional("part"): vol.Any(None, vol.In(("own", "part"))),
    }
)
@callback
def ws_device_opts(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    changes = {k: msg[k] for k in ("only_main", "part") if k in msg}
    data.set_device_opts(msg["device_id"], changes)
    connection.send_result(msg["id"], {"device_opts": data.device_opts})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/setup/complete",
        vol.Required("skip_ids"): [cv.string],
        vol.Required("seen_ids"): [cv.string],
    }
)
@callback
def ws_setup_complete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    data.complete_setup(msg["skip_ids"], msg["seen_ids"])
    connection.send_result(msg["id"], data.state_public())


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "device_floorplan/setup/reset"})
@callback
def ws_setup_reset(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (data := _data(hass, connection, msg)) is None:
        return
    data.reset_setup()
    connection.send_result(msg["id"], data.state_public())


def _templates_dir() -> Path:
    return Path(__file__).parent / "frontend" / TEMPLATES_DIR


def _load_templates() -> dict[str, dict[str, Any]]:
    data = json.loads((_templates_dir() / "templates.json").read_text(encoding="utf-8"))
    return {t["id"]: t for t in data.get("templates", [])}


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "device_floorplan/plan/image_template",
        vol.Required("plan_id"): cv.string,
        vol.Required("template_id"): vol.All(cv.string, vol.Match(r"^[a-z0-9-]+$")),
    }
)
@websocket_api.async_response
async def ws_plan_image_template(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Use one of the bundled sample plans as the plan image (copied, so it can be replaced)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    if not _plan_or_error(data, connection, msg):
        return
    templates = await hass.async_add_executor_job(_load_templates)
    tpl = templates.get(msg["template_id"])
    if tpl is None:
        connection.send_error(msg["id"], "not_found", "Unknown sample plan")
        return
    src = _templates_dir() / Path(tpl["file"]).name
    await data.async_set_image_file(msg["plan_id"], src, tpl["width"], tpl["height"])
    connection.send_result(msg["id"], data.plan_public(msg["plan_id"]))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "device_floorplan/images/list"})
@websocket_api.async_response
async def ws_images_list(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Images already in Home Assistant (config/www, shown as /local/...)."""
    if (data := _data(hass, connection, msg)) is None:
        return
    images = await hass.async_add_executor_job(data.list_www_images)
    connection.send_result(msg["id"], {"images": images})


@websocket_api.websocket_command({vol.Required("type"): "device_floorplan/overlay/subscribe"})
@callback
def ws_overlay_subscribe(hass: HomeAssistant, connection, msg) -> None:
    """Cards listen here for the device_floorplan.show_overlay action (any user, #47)."""

    @callback
    def _forward(event) -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {
                    "card_id": event.data.get("card_id"),
                    "overlay": event.data.get("overlay"),
                    "floor": event.data.get("floor"),
                },
            )
        )

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        f"{DOMAIN}_show_overlay", _forward
    )
    connection.send_result(msg["id"])
