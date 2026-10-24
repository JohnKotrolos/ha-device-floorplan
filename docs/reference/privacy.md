# Privacy and stored data

A floorplan with device positions is a map of your home: where the cameras, door sensors and alarm are. Device Floorplan treats it that way.

## Everything stays in Home Assistant

No cloud service is used. The only external request is for integration logos in the device list (from Home Assistant's brands server, the same one Home Assistant itself uses); without internet, type icons are shown instead.

## Images need a login

Plan images are served at `/api/device_floorplan/image/…` **only to logged-in users**. The planner and the card use short-lived signed URLs. The `image.` entity uses Home Assistant's own protected image proxy.

Images you link from `config/www` are public at `/local/…`, like everything in that folder. Their backup copy is stored privately.

## Where data is stored

| What | Where |
|---|---|
| Plans, positions, room pins, measurements, hidden rooms, skipped devices | `.storage/device_floorplan` |
| Uploaded images, sample-plan copies, backups of linked images | `config/device_floorplan/` |
| Display preferences (layers, names, guide, zoom) | Your browser |

Both are included in Home Assistant backups.

## Exports

CSV, JSON and PNG exports show your layout and device locations. Share them carefully.

## Removing everything

Delete each plan (⋮ → Delete…), then remove the integration in **Settings → Devices & services**. To remove all traces, also delete `config/device_floorplan/` and `.storage/device_floorplan`.
