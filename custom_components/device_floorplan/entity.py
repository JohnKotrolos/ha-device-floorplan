"""The HA device that represents one plan (holds its sensor and image)."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN, NAME, PANEL_URL_PATH, VERSION
from .store import FloorplanData


def plan_device_name(plan: dict[str, Any]) -> str:
    name = plan["name"]
    return name if name.lower().endswith("plan") else f"{name} plan"


def plan_device_info(plan: dict[str, Any], hass: HomeAssistant | None = None) -> DeviceInfo | None:
    from .const import DATA_DEFER_DEVICES

    if hass is not None and hass.data.get(DATA_DEFER_DEVICES):
        return None
    return DeviceInfo(
        identifiers={(DOMAIN, plan["id"])},
        name=plan_device_name(plan),
        manufacturer=NAME,
        model="Floor plan" if plan.get("kind") == "floor" else "Plan (view)",
        sw_version=VERSION,
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=f"homeassistant://{PANEL_URL_PATH}",
    )


@callback
def sync_plan_device(hass: HomeAssistant, data: FloorplanData, plan_id: str) -> None:
    """Keep the device name in line with the plan name."""
    plan = data.plans.get(plan_id)
    if plan is None:
        return
    dev_reg = dr.async_get(hass)
    device = dev_reg.async_get_device(identifiers={(DOMAIN, plan_id)})
    if device is not None and device.name != plan_device_name(plan):
        dev_reg.async_update_device(device.id, name=plan_device_name(plan))
