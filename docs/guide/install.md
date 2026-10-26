# Install

## Requirements

- Home Assistant 2025.1 or newer.
- You set up your plans in the **Floorplan Editor** in the sidebar. The dashboard card works for everyone in your home.

::: tip Before you start
- **Devices in areas (rooms)**: Auto-place and the room filters use them. [Areas in Home Assistant](https://www.home-assistant.io/docs/organizing/areas/)
- **Areas on floors**: each floor plan then offers only its own devices. [Floors in Home Assistant](https://www.home-assistant.io/docs/organizing/floors/)

Neither is needed to place devices by hand.
:::

### Requirements by feature

Everything works with Home Assistant alone; a few extras need a data source.

| Feature | Needs |
|---|---|
| Auto-place, room filters | Devices assigned to areas |
| One plan per floor | Areas assigned to floors |
| Interactive Zigbee map (roles, links, link quality) | ZHA. With Zigbee2MQTT you get each device's signal from its *linkquality* sensor. |
| Signal in popups (dBm, %, LQI) | The device's signal sensor enabled |
| People in their rooms | A room sensor per person (Bermuda, ESPresense, a template…) |
| Lights stay in their room, night only inside the home, shutters darken a room | [Room shapes](/using/rooms) |
| Night look following the sun | The Sun integration (otherwise fixed times are used) |
| Real light colours | Bulbs that report their colour; plain lamps get a colour in the Editor |
| AC air flow | A climate entity on the device |
| Bars for doors, windows and shutters | A door / window contact or a cover, and the [opening drawn](/using/openings) |

## With HACS (custom repository)

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JohnKotrolos&repository=ha-device-floorplan&category=integration)

One click opens Device Floorplan in HACS on your Home Assistant: press **Download**, then restart. Or add it by hand:

1. In HACS, open the ⋮ menu → **Custom repositories**.
2. Add this repository's URL with type **Integration**:

   ```
   https://github.com/JohnKotrolos/ha-device-floorplan
   ```
3. Find **Device Floorplan** in HACS and download it.
4. Restart Home Assistant.

## Manually

1. Download the latest release from the [Releases page](https://github.com/JohnKotrolos/ha-device-floorplan/releases) and unzip it.
2. Copy the folder `custom_components/device_floorplan` into your Home Assistant `config/custom_components/` folder.
3. Restart Home Assistant.

::: tip Updating
Replace the `device_floorplan` folder with the new one and restart. Your plans, positions and images are kept: they live in `.storage/device_floorplan` and `config/device_floorplan/`, not in the integration folder.
:::

## Add the integration

[![Open your Home Assistant instance and start setting up Device Floorplan.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=device_floorplan)

Or by hand:

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
