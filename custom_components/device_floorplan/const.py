"""Constants for Device Floorplan."""

DOMAIN = "device_floorplan"
NAME = "Device Floorplan"
VERSION = "0.6.0"

STORAGE_KEY = DOMAIN
STORAGE_VERSION = 1

# Folder (inside the HA config dir) where uploaded floorplan images live.
IMAGES_DIR = "device_floorplan"

PANEL_URL_PATH = "device-floorplan"
PANEL_COMPONENT = "device-floorplan-panel"
STATIC_URL = "/device_floorplan_static"
# Plan images are served through an authenticated view (signed URLs), not a
# public static path: a floorplan with device positions is a map of the home.
IMAGES_URL = "/api/device_floorplan/image"
UPLOAD_URL = "/api/device_floorplan/upload"
CARD_URL = f"{STATIC_URL}/device-floorplan-card.js"

# Bundled sample plans (frontend/templates) and the HA "www" folder.
TEMPLATES_DIR = "templates"
WWW_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
MAX_WWW_IMAGES = 300

MAX_IMAGE_BYTES = 15 * 1024 * 1024
IMAGE_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

SIGNAL_PLAN_ADDED = f"{DOMAIN}_plan_added"
SIGNAL_PLAN_UPDATED = f"{DOMAIN}_plan_updated"
SIGNAL_PLAN_REMOVED = f"{DOMAIN}_plan_removed"
SIGNAL_DEVICES_CHANGED = f"{DOMAIN}_devices_changed"

DATA_REGISTERED = f"{DOMAIN}_static_registered"
DATA_DEFER_DEVICES = f"{DOMAIN}_defer_devices"

EVENT_NEW_DEVICE = f"{DOMAIN}_new_device"
NOTIFICATION_ID = f"{DOMAIN}_new_devices"

# Options
CONF_NOTIFY_NEW = "notify_new_devices"
CONF_AUTO_PLACE_NEW = "auto_place_new_devices"
DEFAULT_NOTIFY_NEW = True
DEFAULT_AUTO_PLACE_NEW = True

# Wait this long after the last new device before notifying (batches pairing).
NEW_DEVICE_BATCH_SECONDS = 600

# Sidebar entry of the editor (the integration itself keeps NAME).
SIDEBAR_TITLE = "Floorplan Editor"
START_NOTIFICATION_ID = f"{DOMAIN}_start"
