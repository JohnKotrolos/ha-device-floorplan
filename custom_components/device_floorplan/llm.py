"""0.13.9.5: floorplan tools for AI assistants (HA's llm platform).

Home Assistant asks every integration's llm.py for tools when it builds an LLM API for a request. We add four
read-only tools to the Assist API (and the MCP Server's version of it), only when the user switched on
"Share the floorplan with AI assistants" in the Floorplan Editor. The answers come from spatial.Home, the same
code the actions use. Devices count only when one of their entities is exposed to the assistant asking.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import llm

from .const import DOMAIN
from .spatial import Home, summary

try:  # 2026: the llm integration collects tools from integrations
    from homeassistant.components import llm as llm_platform
except ImportError:  # pragma: no cover - older Home Assistant: no tools
    llm_platform = None

PROMPT = (
    "This home has a floorplan (Device Floorplan). For where a device or room is, what is near something, "
    "which rooms connect (open space, passage, door) or share only a wall, and the way between rooms, "
    "use the floorplan tools instead of guessing. \"here\" is the device that heard the request. "
    "For left or right, only repeat the tools' \"on your left\" / \"on your right\" facts; never work them out yourself. "
    "Floors: {floors}."
)


def _result(data: dict[str, Any]) -> Any:
    tool_result = getattr(llm, "ToolResult", None)
    if tool_result is None:  # pragma: no cover - before 2026.10 a tool returned the dict itself
        return data
    return tool_result(data=data, error="error" in data)


def _home(hass: HomeAssistant, llm_context: llm.LLMContext) -> Home:
    exposed = None
    if llm_context.assistant:
        from homeassistant.components.homeassistant.exposed_entities import (
            async_should_expose,
        )

        def exposed(eids: list[str]) -> bool:
            return any(async_should_expose(hass, llm_context.assistant, e) for e in eids)

    return Home(hass, hass.data[DOMAIN], exposed)


class _FloorplanTool(llm.Tool):
    integration = DOMAIN
    if hasattr(llm, "ToolAnnotations"):
        annotations = llm.ToolAnnotations(read_only=True, destructive=False, idempotent=True, open_world=False)

    def answer(self, home: Home, args: dict[str, Any], device_id: str | None) -> dict[str, Any]:
        raise NotImplementedError

    async def async_call(self, hass: HomeAssistant, tool_input: llm.ToolInput, llm_context: llm.LLMContext) -> Any:
        if DOMAIN not in hass.data:
            return _result({"error": "The floorplan is not available."})
        return _result(self.answer(_home(hass, llm_context), tool_input.tool_args, llm_context.device_id))


class LayoutTool(_FloorplanTool):
    name = f"{DOMAIN}__layout"
    description = (
        "Use for questions about rooms: which rooms are next to or connect to a room (one open space, passage, door), "
        "which only share a wall, where a room is (compass when known), and what is in a room (give the room)."
    )
    parameters = vol.Schema({vol.Optional("floor"): str, vol.Optional("room"): str})

    def answer(self, home: Home, args: dict[str, Any], device_id: str | None) -> dict[str, Any]:
        return home.layout(args.get("floor"), args.get("room"))


class LocateTool(_FloorplanTool):
    name = f"{DOMAIN}__locate"
    description = "Where a device (name or entity id) or a room is: floor, room, and its spot in the room (by an outside wall, a window, a door, or in the middle)."
    parameters = vol.Schema({vol.Required("target"): str})

    def answer(self, home: Home, args: dict[str, Any], device_id: str | None) -> dict[str, Any]:
        return home.locate(args["target"], device_id)


class NearestTool(_FloorplanTool):
    name = f"{DOMAIN}__nearest"
    description = (
        "Devices nearest to a device, a room, or \"here\" (the device that heard the request, the default). "
        "Optional category, such as lights, climate, sensors, media."
    )
    parameters = vol.Schema({vol.Optional("target"): str, vol.Optional("category"): str, vol.Optional("limit"): int})

    def answer(self, home: Home, args: dict[str, Any], device_id: str | None) -> dict[str, Any]:
        return home.nearest(args.get("target"), device_id, args.get("category"), args.get("limit") or 5)


class BetweenTool(_FloorplanTool):
    name = f"{DOMAIN}__between"
    description = (
        "Between two devices or rooms (\"here\" allowed): the way through the rooms, the distance in metres when the "
        "floor is measured, the compass direction when known, and the walls or openings a straight line crosses."
    )
    parameters = vol.Schema({vol.Required("from"): str, vol.Optional("to"): str})

    def answer(self, home: Home, args: dict[str, Any], device_id: str | None) -> dict[str, Any]:
        return home.between(args["from"], args.get("to") or "here", device_id)


@callback
def async_get_tools(hass: HomeAssistant, llm_context: llm.LLMContext, api_id: str):
    """Our tools for the Assist API (and the MCP Server's Assist API), when the user shared the floorplan."""
    data = hass.data.get(DOMAIN)
    if llm_platform is None or data is None or not data.ai_share or "assist" not in api_id:
        return None
    floors = summary(hass, data) or "no rooms drawn yet"
    return llm_platform.LLMTools(
        tools=[LayoutTool(), LocateTool(), NearestTool(), BetweenTool()],
        prompt=PROMPT.format(floors=floors),
    )
