"""Image upload endpoint and the authenticated image view.

Uploads are too large for a websocket message. Images are served only to
logged-in users (the frontend uses signed URLs for <img> tags), because a
floorplan with device positions is a map of someone's home.
"""

from __future__ import annotations

from http import HTTPStatus

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, IMAGE_TYPES, IMAGES_URL, MAX_IMAGE_BYTES, UPLOAD_URL

try:  # constant location differs between HA versions
    from homeassistant.components.http import KEY_HASS_USER
except ImportError:  # pragma: no cover
    KEY_HASS_USER = "hass_user"


class FloorplanUploadView(HomeAssistantView):
    """POST raw image bytes: /api/device_floorplan/upload?plan_id=..&width=..&height=.."""

    url = UPLOAD_URL
    name = "api:device_floorplan:upload"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        user = request.get(KEY_HASS_USER)
        if user is None or not user.is_admin:
            return self.json_message("Admin required", HTTPStatus.FORBIDDEN)

        data = self.hass.data.get(DOMAIN)
        if data is None:
            return self.json_message("Not set up", HTTPStatus.SERVICE_UNAVAILABLE)

        plan_id = request.query.get("plan_id", "")
        if plan_id not in data.plans:
            return self.json_message("Unknown plan", HTTPStatus.NOT_FOUND)

        ext = IMAGE_TYPES.get(request.content_type)
        if ext is None:
            return self.json_message(
                "Use a PNG, JPEG or WebP image", HTTPStatus.UNSUPPORTED_MEDIA_TYPE
            )

        if request.content_length and request.content_length > MAX_IMAGE_BYTES:
            return self.json_message("Image too large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        body = await request.read()
        if not body or len(body) > MAX_IMAGE_BYTES:
            return self.json_message("Empty or too large", HTTPStatus.BAD_REQUEST)

        try:
            width = int(request.query.get("width", "0"))
            height = int(request.query.get("height", "0"))
        except ValueError:
            width = height = 0

        await data.async_set_image(plan_id, body, ext, width, height)
        return self.json(data.plan_public(plan_id))


class FloorplanImageView(HomeAssistantView):
    """GET /api/device_floorplan/image/<file> (auth or signed URL required)."""

    url = IMAGES_URL + "/{filename}"
    name = "api:device_floorplan:image"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, filename: str) -> web.StreamResponse:
        data = self.hass.data.get(DOMAIN)
        if data is None:
            return self.json_message("Not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        if "/" in filename or "\\" in filename or filename.startswith("."):
            return self.json_message("Not found", HTTPStatus.NOT_FOUND)
        path = data.images_path / filename
        exists = await self.hass.async_add_executor_job(path.is_file)
        if not exists:
            return self.json_message("Not found", HTTPStatus.NOT_FOUND)
        return web.FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})
