# Install

## Requirements

- Home Assistant 2025.1 or newer.
- An administrator account (the planner is for admins; the dashboard card works for everyone).

## With HACS (custom repository)

1. In HACS, open the ⋮ menu → **Custom repositories**.
2. Add this repository's URL with type **Integration**.
3. Find **Device Floorplan** in HACS and download it.
4. Restart Home Assistant.

## Manually

1. Download the latest release and unzip it.
2. Copy the folder `custom_components/device_floorplan` into your Home Assistant `config/custom_components/` folder.
3. Restart Home Assistant.

::: tip Updating
Replace the `device_floorplan` folder with the new one and restart. Your plans, positions and images are kept: they live in `.storage/device_floorplan` and `config/device_floorplan/`, not in the integration folder.
:::

## Add the integration

1. Go to **Settings → Devices & services → Add integration**.
2. Search for **Device Floorplan** and confirm.
3. **Floorplan Editor** appears in the sidebar (the setup message and a notification point you there).

The dashboard card is registered automatically: there is no resource to add.

::: info Reinstalling
Plans are kept when you remove the integration. If you add it again, setup lists the plans it found and lets you keep them or **start fresh**.
:::

## Options

**Settings → Devices & services → Device Floorplan → Configure**:

| Option | Default | What it does |
|---|---|---|
| Show a notification when new devices are added | On | A Home Assistant notification lists new devices waiting to be placed. |
| Put new devices on the plan next to their room | On | New devices with an area are placed near their room pin, marked *approximate*. |

## Next

[Create your first plan →](/guide/first-plan)
