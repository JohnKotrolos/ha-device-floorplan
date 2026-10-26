"""Device Floorplan: put your Home Assistant devices on your own floorplan images.

One position (percent of the image) per device per plan, a sidebar planner to
place them quickly, one sensor per plan with all positions, and a
`device_floorplan.get_positions` action.
"""

from __future__ import annotations

from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, persistent_notification
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from . import websocket as ws_api
from .const import (
    CARD_URL,
    DATA_DEFER_DEVICES,
    DATA_REGISTERED,
    DOMAIN,
    NAME,
    PANEL_COMPONENT,
    PANEL_URL_PATH,
    SIDEBAR_TITLE,
    START_NOTIFICATION_ID,
    STATIC_URL,
    VERSION,
)
from .devices import build_plan_payload
from .http import FloorplanImageView, FloorplanUploadView
from .new_devices import NewDeviceWatcher
from .store import FloorplanData

PLATFORMS = [Platform.SENSOR, Platform.IMAGE]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SERVICE_GET_POSITIONS = "get_positions"
SERVICE_SHOW_OVERLAY = "show_overlay"
EVENT_SHOW_OVERLAY = f"{DOMAIN}_show_overlay"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    async def _get_positions(call: ServiceCall) -> ServiceResponse:
        data: FloorplanData | None = hass.data.get(DOMAIN)
        if data is None:
            raise ServiceValidationError(f"{NAME} is not set up")
        plan = data.find_plan(call.data["plan"])
        if plan is None:
            raise ServiceValidationError(f"Unknown plan: {call.data['plan']}")
        return build_plan_payload(hass, data, plan)

    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_POSITIONS,
        _get_positions,
        schema=vol.Schema({vol.Required("plan"): cv.string}),
        supports_response=SupportsResponse.ONLY,
    )

    async def _show_overlay(call: ServiceCall) -> None:
        # Cards with this card_id (on every screen) switch to the overlay (#47).
        hass.bus.async_fire(
            EVENT_SHOW_OVERLAY,
            {
                "card_id": call.data["card_id"],
                "overlay": call.data.get("overlay"),
                "floor": call.data.get("floor"),
            },
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_SHOW_OVERLAY,
        _show_overlay,
        schema=vol.Schema(
            vol.All(
                {
                    vol.Required("card_id"): cv.string,
                    vol.Optional("overlay"): cv.string,
                    vol.Optional("floor"): cv.string,
                },
                cv.has_at_least_one_key("overlay", "floor"),
            )
        ),
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = FloorplanData(hass)
    await data.async_load()
    from .devices import default_main_entity  # noqa: PLC0415
    data.migrate_split(lambda dev: default_main_entity(hass, data, dev))  # 0.5.1, #91
    from .devices import migrate_replaced  # noqa: PLC0415
    try:
        migrate_replaced(hass, data)  # 0.6.0, #106
    except Exception:  # noqa: BLE001
        pass
    await hass.async_add_executor_job(
        lambda: data.images_path.mkdir(parents=True, exist_ok=True)
    )
    hass.data[DOMAIN] = data

    # Static paths, the upload view and websocket commands cannot be
    # unregistered, so register them once per HA run.
    if not hass.data.get(DATA_REGISTERED):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
        )
        hass.http.register_view(FloorplanUploadView(hass))
        hass.http.register_view(FloorplanImageView(hass))
        # The dashboard card is loaded on every dashboard.
        frontend.add_extra_js_url(hass, f"{CARD_URL}?v={VERSION}")
        # Sidebar icon "dfp:floorplan-edit", loaded on every page so the sidebar has it at once.
        frontend.add_extra_js_url(hass, f"{STATIC_URL}/device-floorplan-icons.js?v={VERSION}")
        ws_api.async_register(hass)
        hass.data[DATA_REGISTERED] = True

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        sidebar_title=SIDEBAR_TITLE,
        sidebar_icon="dfp:floorplan-edit",
        module_url=f"{STATIC_URL}/device-floorplan-panel.js?v={VERSION}",
        require_admin=True,
        config={},
    )

    # Right after the config flow HA lists every device of the new entry in a
    # "Name and assign area" dialog. Plan devices don't belong in an area, so
    # attach them from the next start on (entities work the same meanwhile).
    fresh = bool(entry.data.get("fresh_setup"))
    if fresh:
        # Clear the flag before the update listener exists (it would reload).
        hass.config_entries.async_update_entry(entry, data={})
    if not data.plans:
        # Safety net for users who clicked through HA's dialogs: one link to the editor.
        # Dismissed when the first plan is created (store.create_plan).
        persistent_notification.async_create(
            hass,
            f"Open the **[Floorplan Editor](/{PANEL_URL_PATH})** in your sidebar to create your "
            "first plan: name it, add a floorplan image and put your devices on it.",
            f"{NAME} is ready",
            START_NOTIFICATION_ID,
        )
    NewDeviceWatcher(hass, entry, data).async_start()
    entry.async_on_unload(entry.add_update_listener(_options_updated))

    hass.data[DATA_DEFER_DEVICES] = fresh
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    finally:
        hass.data[DATA_DEFER_DEVICES] = False
    return True


async def _options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        hass.data.pop(DOMAIN, None)
    return unloaded
