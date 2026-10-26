<p align="center"><img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/icon.png" width="96" alt="Device Floorplan icon"></p>

# Device Floorplan

[![Beta](https://img.shields.io/badge/status-beta-orange)](#beta)
[![HACS Custom](https://img.shields.io/badge/HACS-custom-41BDF5)](#install)
[![Docs](https://img.shields.io/badge/docs-guide-blue)](https://johnkotrolos.github.io/ha-device-floorplan/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/JohnKotrolos/ha-device-floorplan/blob/main/LICENSE)

Put your Home Assistant devices on **your own floorplan image** and watch your
home live: lights glowing in their real colour and staying in their room, the
plan darkening at night, AC air flow, people in their rooms, an interactive Zigbee map (ZHA) and
much more. Things that usually take custom cards, templates and lots of YAML,
done with clicks: upload your picture (or start from a sample plan), drag your
rooms onto it, press Auto-place and fine-tune by dragging.

<p align="center">
  <img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/screens/card-lights.webp" width="32%" alt="Lights overlay with scenes">
  <img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/screens/card-comfort.webp" width="32%" alt="Comfort overlay with climate chips">
  <img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/screens/card-network.webp" width="32%" alt="Network overlay with Zigbee links">
</p>

📖 **Full guide:** https://johnkotrolos.github.io/ha-device-floorplan/

## Beta

Device Floorplan is in **beta**. It runs every day in a real home with ~90
devices, but your setup is different from mine, and that's exactly where
your feedback helps. Please
[open an issue](https://github.com/JohnKotrolos/ha-device-floorplan/issues/new/choose)
for anything that breaks, confuses you or is missing. Screenshots help a lot.

Known limits today:

- The interactive Zigbee map (roles, links, link quality) needs **ZHA**.
- Room shapes are optional: without one, a room is a name pin and its light glow
  isn't stopped by walls.
- Best on PC (Editor) and tablets / wall panels (card); phones work but aren't
  optimised yet.
- People need a room sensor per person (Bermuda, ESPresense, a template…).

No floorplan yet? See
[Turn your sketch into a floorplan in 10 minutes](https://johnkotrolos.github.io/ha-device-floorplan/images/sketch).

## Features

- **Welcome intro** on the first visit (reopen it from ⋮ → Show intro).
- **Create a plan first**, then choose which kinds of devices belong on it
  (the rest is *skipped*: nothing changes in HA).
- **Floorplan image**: drop a file, pick an image that is already in Home
  Assistant (`config/www`, stays linked, a backup copy is kept), or start from
  one of seven bundled **sample plans**.
- Three guided steps:
  1. **Measure** (optional): one horizontal and one vertical measurement give
     the plan a real scale. Drag the ends to adjust, click a label to change
     the length or delete it.
  2. **Mark rooms**: drag your HA areas onto the plan. Rooms that are not on
     this plan can be hidden: their devices leave the list. Optionally give a
     room a **shape** (four corners, + for more): light then stays inside it.
     Overlapping shapes are one open space, a gap between them is a wall.
  3. **Place devices**: Auto-place, click-to-place (with "then next" queue) or
     drag. Auto-placed devices are *approximate* (dashed) until you drag or
     confirm them.
- **Layers**: the current step is shown in full, the others faded (and not
  clickable). The Layers button on the plan switches them off completely.
- The plan always fits the screen: zoom, scale and layers sit on the plan,
  the legend below always stays visible.
- **Floors**: each plan is an HA floor (or a level, or a free "view"). The ⋮ on
  a floor tab has settings, rename, replace image, export, move and delete.
- **“I'm ready”** appears as soon as the first device is placed: see what was
  created in HA, preview the live view and add it to a dashboard in one click.
- **Dashboard card** `custom:device-floorplan-card` with live overlays, several floors,
  a night look with glowing lights, people in their rooms, and a companion
  **chip card** for your top bar.
- **Export** a plan as CSV, JSON backup (re-importable, also on another HA) or
  PNG picture.
- **Search finds everything**: names, rooms, models, entity names and ids, also
  skipped devices and helpers without a device (which can be placed on their own).
- **One marker per device per overlay**, and you choose what it shows: the leading
  value, extra readings (with their own icons), a badge, the icon and the tap. Press
  the ✎ **Edit markers** pen on the card while editing the dashboard and click a marker.
- **Live** shows what is happening at home right now: things that are off stay
  hidden, lights that are on glow in their real colour.
- **Custom overlays**: pick the kinds of devices, in your order.
- **Bond · Phantom · Split device** ([guide](https://johnkotrolos.github.io/ha-device-floorplan/together/)):
  - **Bond**: several physical devices on one spot are one device (three bulbs in one
    lamp): one marker, switched together, values combined. Device Floorplan asks
    before it bonds; printers + AMS or NAS + drives are bonded automatically.
  - **Phantom**: one combined value from devices anywhere (room temperature from two
    thermometers, any window open), shown like a device; its devices stay where they are.
  - **Split device**: the device sits where its hardware is, each light or switch it
    controls can sit where it acts (a wall panel with two relays = three places).
- **Light shapes** (bulb, spot, strip, panel, wall lamp) and **light colours** (the
  bulb's real colour, or warm ↔ cool / any colour for plain lamps), with a *see it at
  night* preview.
- **AC air flow**: an animated flow in the direction the unit blows, coloured for
  cooling, heating or drying.
- **Day & night**: at night the plan darkens and lights glow; by day a room gets
  darker the more of its shutters are closed.
- HA's own icons and more-info dialog, integration
  logos in the device list, undo/redo, auto-save, keyboard shortcuts.
- **New devices**: placed next to their room automatically (optional), a
  notification tells you, and the `device_floorplan_new_device` event lets you
  build your own alerts (a blueprint for phone notifications is included).
  Devices removed from HA show as a `?` marker: remove them, or give the spot
  to another device.

## Install

**With HACS (recommended)**

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JohnKotrolos&repository=ha-device-floorplan&category=integration)

One click opens Device Floorplan in HACS on your Home Assistant. Or by hand:

1. HACS → ⋮ (top right) → **Custom repositories**.
2. Repository: `https://github.com/JohnKotrolos/ha-device-floorplan`, type
   **Integration** → Add.
3. Find **Device Floorplan** in HACS → **Download**.
4. Restart Home Assistant.

**Manually:** copy `custom_components/device_floorplan` from the
[latest release](https://github.com/JohnKotrolos/ha-device-floorplan/releases)
into your `config/custom_components/` folder and restart Home Assistant.

**Then:**

1. [![Open your Home Assistant instance and start setting up Device Floorplan.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=device_floorplan)
   or Settings → Devices & services → Add integration → **Device Floorplan**.
2. Open **Floorplan Editor** in the sidebar.

Options (Settings → Devices & services → Device Floorplan → Configure):
new-device notification and automatic placement, both on by default.

## What you get in Home Assistant

Each plan is a **device** (“Ground floor plan”) under Settings → Devices with:

- `image.device_floorplan_<plan>`: the plan picture, usable in any card.
- `sensor.device_floorplan_<plan>`: state = number of devices on the plan;
  attributes (kept out of the history database): `plan_id`, `image_url`,
  `image_fallback_url`, `image_width`, `image_height`, `kind`, `floor_id`,
  `level`, `image_type`, `metres_per_px_x/y`, `real_width_m`, `real_height_m`,
  `approx_count`, `devices`
  (`{device_id: {name, x, y, px, py, approx, z?, ieee?, mac?, via?, main_entity, entities, roles, conns, group, box?, light?, parts?}}`,
  x/y in % of the image; all entities of a device share its position),
  `entities` (helpers / entities without a device placed on their own), `bonds`, `phantoms`,
  `zigbee_devices` (the format of the Zigbee Floorplan Card) and `areas` (room pins).

`sensor.device_floorplan_new_devices`: devices added since setup that are not
placed or skipped yet.

Action:

```yaml
action: device_floorplan.get_positions
data:
  plan: ground_floor
response_variable: plan
```

### Privacy

A floorplan with device positions is a map of your home, so plan images are
**only served to logged-in users** (`/api/device_floorplan/image/…`, the
frontend uses signed URLs). They are stored in `config/device_floorplan/`.
Images you link from `config/www` stay public at `/local/…`, as everything in
that folder. Planner data lives in `.storage/device_floorplan`.

## Dashboard card

The easiest way: press **I'm ready → Add to dashboard** in the Floorplan Editor. The card shows
your plan and its overlay buttons: **Plan · Live · Lights · Comfort · Security · Network · Health**,
**People**, plus your own. Tap a light to switch it, a cover for its controls, a reading for its
last 24 hours; hold for the details. Several floors get a floor rail next to the plan. At night
the plan darkens and the lights that are on glow (follows the sun by default).
Everything else (floors, which overlays, where the buttons are, what each overlay shows, light
scenes, rooms, people, day & night, tap behaviour, look, per-device settings) is set in the card
editor. Other cards can switch the overlay with the action `device_floorplan.show_overlay`, or use
the **chip card** that glows for the active overlay. See [the card reference](https://johnkotrolos.github.io/ha-device-floorplan/reference/card).

```yaml
type: custom:device-floorplan-card
plans: [ground_floor, first_floor]
```

## Keyboard

| Key | Action |
|---|---|
| Esc | Stop placing / measuring, cancel a drag, close menus and panels |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y) | Undo, redo |
| Delete / Backspace | Remove the selected device (or the selected measurement) |
| Arrow keys (Shift = bigger steps) | Nudge the selected device |
| Shift while measuring | Don't snap the line straight |

Shortcuts don't fire while you type in a field.

## Related projects

- [Zigbee Floorplan Card](https://github.com/TheLarsinator/zigbee-floorplan-card):
  Zigbee mesh on a floorplan; `zigbee_devices` above can feed it.
- [Spatial Context](https://github.com/Greminn/ha-spatial-context): a full
  building model with traced walls and signal attenuation.
- [ha-floorplan](https://github.com/ExperienceLovelace/ha-floorplan): SVG-based
  interactive floorplans.

## Roadmap

Next: polishing from your feedback, people on several floors, light pools in more overlays. Later: motion zones that fade, doors and covers drawn, a coverage map,
Zigbee2MQTT topology. Ideas welcome as issues with the label *idea*. Full list:
[roadmap](https://johnkotrolos.github.io/ha-device-floorplan/help/roadmap).

## Changelog

- 0.6.0 – First public release (beta). See the [changelog](https://johnkotrolos.github.io/ha-device-floorplan/help/changelog).
