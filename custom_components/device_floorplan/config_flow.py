"""Config flow (single entry) and options (new-device behaviour)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.storage import Store

from .const import (
    CONF_AUTO_PLACE_NEW,
    CONF_NOTIFY_NEW,
    DEFAULT_AUTO_PLACE_NEW,
    DEFAULT_NOTIFY_NEW,
    DOMAIN,
    IMAGES_DIR,
    NAME,
    STORAGE_KEY,
    STORAGE_VERSION,
)

CONF_START_FRESH = "start_fresh"


class DeviceFloorplanConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        # Plans survive removing the integration: say so, and offer a clean start.
        store: Store = Store(self.hass, STORAGE_VERSION, STORAGE_KEY)
        old = await store.async_load() or {}
        plans = [p.get("name", pid) for pid, p in (old.get("plans") or {}).items()]
        if user_input is not None:
            kept = bool(plans) and not user_input.get(CONF_START_FRESH)
            if plans and not kept:
                await store.async_remove()
                path = self.hass.config.path(IMAGES_DIR)
                await self.hass.async_add_executor_job(_clear_images, path)
            # Tell setup not to attach the plan devices yet, so HA doesn't open its
            # "Name and assign" dialog for them right after this flow.
            # The description is shown in HA's "created" dialog: point to the sidebar.
            return self.async_create_entry(
                title=NAME,
                data={"fresh_setup": True},
                description="kept" if kept else "fresh",
                description_placeholders={"count": str(len(plans))},
            )
        if not plans:
            return self.async_show_form(step_id="user")
        return self.async_show_form(
            step_id="existing",
            data_schema=vol.Schema({vol.Optional(CONF_START_FRESH, default=False): bool}),
            description_placeholders={"count": str(len(plans)), "plans": ", ".join(plans)},
        )

    async def async_step_existing(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self.async_step_user(user_input or {})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return DeviceFloorplanOptionsFlow()


class DeviceFloorplanOptionsFlow(OptionsFlow):
    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_NOTIFY_NEW,
                        default=options.get(CONF_NOTIFY_NEW, DEFAULT_NOTIFY_NEW),
                    ): bool,
                    vol.Required(
                        CONF_AUTO_PLACE_NEW,
                        default=options.get(CONF_AUTO_PLACE_NEW, DEFAULT_AUTO_PLACE_NEW),
                    ): bool,
                }
            ),
        )


def _clear_images(path: str) -> None:
    import shutil

    shutil.rmtree(path, ignore_errors=True)
