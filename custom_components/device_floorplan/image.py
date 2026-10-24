"""One image entity per plan: the floorplan picture itself, usable in any card."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.image import ImageEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_PLAN_ADDED, SIGNAL_PLAN_REMOVED, SIGNAL_PLAN_UPDATED
from .entity import plan_device_info
from .store import FloorplanData


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    data: FloorplanData = hass.data[DOMAIN]
    async_add_entities([PlanImage(hass, data, pid) for pid in list(data.plans)])

    @callback
    def _plan_added(plan_id: str) -> None:
        async_add_entities([PlanImage(hass, data, plan_id)])

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_PLAN_ADDED, _plan_added))


class PlanImage(ImageEntity):
    _attr_should_poll = False
    _attr_icon = "mdi:floor-plan"

    def __init__(self, hass: HomeAssistant, data: FloorplanData, plan_id: str) -> None:
        super().__init__(hass)
        self._data = data
        self._plan_id = plan_id
        plan = data.plans[plan_id]
        self._attr_unique_id = f"{DOMAIN}_{plan_id}_image"
        self._attr_has_entity_name = False
        self._attr_name = f"Device Floorplan {plan['name']}"
        # Suggested id for new plans: image.device_floorplan_<plan> (existing ids are kept).
        self.entity_id = f"image.{DOMAIN}_{plan_id}"
        self._attr_device_info = plan_device_info(plan, hass)
        self._version = plan.get("image_version", 0)
        self._attr_image_last_updated = self._stamp(self._version)
        self._attr_content_type = "image/png"

    @staticmethod
    def _stamp(version: int) -> datetime:
        return dt_util.utc_from_timestamp(version) if version else dt_util.utcnow()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PLAN_UPDATED, self._plan_updated)
        )
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_PLAN_REMOVED, self._plan_removed)
        )

    @callback
    def _plan_updated(self, plan_id: str) -> None:
        plan = self._data.plans.get(plan_id)
        if plan_id != self._plan_id or plan is None:
            return
        version = plan.get("image_version", 0)
        if version != self._version:
            self._version = version
            self._attr_image_last_updated = self._stamp(version)
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

    async def async_image(self) -> bytes | None:
        plan = self._data.plans.get(self._plan_id)
        if plan is None:
            return None
        result = await self.hass.async_add_executor_job(self._data.read_image, plan)
        if result is None:
            return None
        body, ctype = result
        self._attr_content_type = ctype
        return body
