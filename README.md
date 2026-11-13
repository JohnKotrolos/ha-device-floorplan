<p align="center"><img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/icon.png" width="96" alt="Device Floorplan icon"></p>

# Device Floorplan

[![Release](https://img.shields.io/github/manifest-json/v/JohnKotrolos/ha-device-floorplan?filename=custom_components%2Fdevice_floorplan%2Fmanifest.json&label=release&color=4CAF50)](https://github.com/JohnKotrolos/ha-device-floorplan/releases)
[![Marketplace custom](https://img.shields.io/badge/Marketplace-custom-41BDF5)](#install)
[![Docs](https://img.shields.io/badge/docs-guide-blue)](https://johnkotrolos.github.io/ha-device-floorplan/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/JohnKotrolos/ha-device-floorplan/blob/main/LICENSE)

<p align="center">
  <img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/readme/hero.webp" width="100%" alt="Device Floorplan: Live, Cleaning, Comfort and Network overlays on one floorplan">
</p>

Put your Home Assistant devices on **your own floorplan** and see your home alive:
lights glowing in their real colour and staying inside their room, the AC blowing,
the TV glowing, the washer telling you it's done, **your robot vacuum cleaning room
by room**, people in their rooms, the Zigbee mesh drawn over your walls. No custom cards to combine, no templates, no YAML:
upload your picture (or start from a sample plan), drag your rooms onto it, press
**Auto-place** and fine-tune by dragging.

📖 **Full guide:** https://johnkotrolos.github.io/ha-device-floorplan/

🎮 **Live demo:** https://johnkotrolos.github.io/ha-device-floorplan/demo/

## What makes it different

### Your home, alive on the plan

- **Light that behaves like light**: every lamp glows in its real colour and brightness,
  shaped like the fixture (bulb, spot, strip, panel, wall lamp) and **stopped by walls**:
  it fills its room and spills only where rooms are open to each other.
- **Devices that show they are working**: the AC blows an animated air flow in its real
  direction (cooling, heating, drying), TVs glow while they play, washers, dryers and
  dishwashers show their progress and say **"Done · tap to unload"**.
- **Day & night**: at night the plan darkens and only what's on glows; by day daylight
  comes in through windows and shutters, and a room gets darker the more its shutters close.
- **Doors, windows and shutters as bars** on the walls: open, closed, how far a shutter is down.
- **Your robot vacuum, live**: it moves on your plan while it cleans and draws its path;
  every room shows when it was last cleaned, turns amber when it's due again, and
  **Clean now** sends the robot to just that room.
- **Motion** makes a room pulse, **people** appear in the room they are in.

### Overlays: one plan, many views

- **Live** (what's happening now), **Lights**, **Comfort** (a temperature and humidity
  **heatmap** that flows between open rooms), **Security**, **Network** and **Health**
  (batteries, offline devices), plus **your own overlays** with the device types you choose.
- **Cleaning**: works with Valetudo out of the box and with Xiaomi, Dreame, Roborock and
  other map integrations; a room counts as cleaned only when the robot really did it, and a
  `due` list on the plan sensor lets an automation clean what is due.
- **Network map**: the Zigbee mesh (ZHA) with roles, links and link quality, Wi-Fi and LAN
  from your router, and the devices on other floors as faint markers.
- **One marker per device per overlay**, and you decide what it shows: the leading value,
  extra readings, a badge, the icon, what a tap does.

### Made for dashboards and wall panels

- **The Overlay Bar**: next to the plan (above, below, left, right) or as a **Side Rail**
  over the full height of the card. Pill, tile or circle buttons, contrast that follows
  light and dark mode, and a status on each button (a dot, a count, a value, an icon that
  turns green while the printer prints).
- **Shortcuts** in the same bar: open a dashboard page, a popup on this browser only,
  run any action, reload the page. Overlay buttons can do something else on hold.
  The bar can be the **menu of your whole wall panel**.
- **Several floors** in one card, with a floor switcher; one frame for the whole house so
  floors line up and switching doesn't jump.
- The plan **fits the card exactly**: top-aligned in fixed-height cards, never stretched,
  with a live preview at your panel's real size in the card editor.
- A **chip card** for your top bar, and an action to switch overlays from other cards.

<table>
  <tr>
    <td align="center" width="33%">
      <a href="docs/public/readme/bar-bottom.webp"><img src="docs/public/readme/bar-bottom.webp" alt="Overlay Bar below the plan, circle buttons, Comfort heatmap"></a>
      <br><sub><b>Below the plan</b> · circles (Comfort heatmap)</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/public/readme/bar-top.webp"><img src="docs/public/readme/bar-top.webp" alt="Overlay Bar above the plan, pill buttons, Live"></a>
      <br><sub><b>Above the plan</b> · pill (Live)</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/public/readme/side-rail.webp"><img src="docs/public/readme/side-rail.webp" alt="Side Rail on the left, full card height"></a>
      <br><sub><b>Side Rail</b> · the wall panel's menu</sub>
    </td>
  </tr>
</table>

### Real homes are messy, so it handles them

- <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/legend/bond-badge-dark.webp"><img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/legend/bond-badge.webp" height="22" alt="Bond" align="top"></picture> **Bond**: three bulbs in one lamp are one device (one marker, switched together).
- <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/legend/phantom-dark.webp"><img src="https://raw.githubusercontent.com/JohnKotrolos/ha-device-floorplan/main/docs/public/legend/phantom.webp" height="22" alt="Phantom" align="top"></picture> **Phantom**: one value from devices anywhere (room temperature from two thermometers,
  "any window open"), shown like a device.
- **Split device**: a wall panel sits where it hangs, each relay where it acts.
- **ZHA groups** become bonds, **child devices** and main entities are understood.
- **Nothing is created or changed in Home Assistant**: no helpers, groups or template
  sensors; your devices stay exactly as they are.

## The Floorplan Editor

A sidebar panel that takes you from a picture to a live plan in three steps:

1. **Measure** (optional): one horizontal and one vertical line give the plan a real
   scale; it warns you when the picture looks stretched.
2. **Mark rooms**: drag your HA areas onto the plan and draw their shapes: drag corners
   or whole walls, let open rooms overlap, leave a gap for a wall. **Glue Rooms** then
   makes neighbouring rooms meet on one line.
3. **Place devices**: **Auto-place**, click-to-place or drag; **snap to wall** for
   switches and sensors.

Plus: a floorplan from a file, from `config/www` or from seven **sample plans**; a frame
around the plan; search across names, rooms, models and entities; undo/redo and
auto-save; export as CSV, JSON backup or PNG. **New devices** are placed next to their
room automatically and announced (event + blueprint included).

No floorplan yet? See
[Turn your sketch into a floorplan in 10 minutes](https://johnkotrolos.github.io/ha-device-floorplan/images/sketch).

## Good to know

- The interactive Zigbee map (roles, links, link quality) needs **ZHA**; Wi-Fi and LAN
  come from your router (FRITZ!Box and others).
- Room shapes are optional: without one, a room is a name pin and its light glow
  isn't stopped by walls.
- Made for PC (Editor) and tablets / wall panels (card); phones work too.
- People need a room sensor per person (Bermuda, ESPresense, a template…).

It runs every day in a real home with ~90 devices. Something not working, confusing or
missing in yours? Ask in [Discussions](https://github.com/JohnKotrolos/ha-device-floorplan/discussions)
or [report a bug](https://github.com/JohnKotrolos/ha-device-floorplan/issues/new/choose); screenshots help a lot.

## Install

Add it in one click:

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JohnKotrolos&repository=ha-device-floorplan&category=integration)

**From the Marketplace (Home Assistant 2026.11 and later, recommended)**

1. Settings → **Marketplace** → add a custom repository by its link:
   `https://github.com/JohnKotrolos/ha-device-floorplan` (the first time,
   Home Assistant asks you to sign in to GitHub, read-only).
2. Find **Device Floorplan** → install, accept the community notice.
3. Restart Home Assistant.

An install made with HACS moves to the Marketplace by itself.

**With HACS (Home Assistant before 2026.11):** HACS → ⋮ → **Custom repositories**
→ the link above, type **Integration** → find **Device Floorplan** → **Download**
→ restart Home Assistant.

**Manually:** copy `custom_components/device_floorplan` from the
[latest release](https://github.com/JohnKotrolos/ha-device-floorplan/releases)
into your `config/custom_components/` folder and restart Home Assistant.

## Quick start

From a picture to a live plan on your dashboard, in about 15 minutes:

1. **Add the integration**:
   [![Open your Home Assistant instance and start setting up Device Floorplan.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=device_floorplan)
   or Settings → Devices & services → Add integration → **Device Floorplan**.
2. **Create a plan**: open **Floorplan Editor** in the sidebar, create a plan for a floor
   and add its picture (a file, an image in `config/www`, or a sample plan). Frame it if
   it needs space around it.
3. **Measure** (optional): draw one horizontal and one vertical line of a known length.
4. **Mark rooms**: drag your areas onto the plan, press **Shape** and pull the corners or
   walls onto each room. Overlap where rooms are open to each other, leave a gap for a wall,
   then **Glue Rooms**.
5. **Place devices**: press **Auto-place**, then drag what needs to move. Dashed markers
   are guesses until you touch them.
6. **Add it to a dashboard**: **I'm ready → Add to dashboard**. Then open the card editor
   to choose the overlays, the Overlay Bar or Side Rail, shortcuts and floors.

More floors? Repeat steps 2–5 per floor; the card shows them all. Step by step with
pictures: [Your first plan](https://johnkotrolos.github.io/ha-device-floorplan/guide/first-plan).

## Dashboard card

```yaml
type: custom:device-floorplan-card
plans: [ground_floor, first_floor]
```

Everything else (floors, overlays, the Overlay Bar and its shortcuts, what each overlay
shows, light scenes, rooms, people, day & night, look, frame and per-device settings) is
set in the card editor. See [the card reference](https://johnkotrolos.github.io/ha-device-floorplan/reference/card).

## What you get in Home Assistant

Each plan is a **device** (“Ground floor plan”) with:

- `image.device_floorplan_<plan>`: the plan picture, usable in any card.
- `sensor.device_floorplan_<plan>`: the number of devices on the plan; its attributes
  carry every position (in % of the image), rooms, bonds, phantoms and the scale, and
  `zigbee_devices` in the format of the Zigbee Floorplan Card.
- `sensor.device_floorplan_new_devices`: devices added since setup that are not placed yet.
- The action `device_floorplan.get_positions` returns a plan's positions for your own
  automations.

### Privacy

A floorplan with device positions is a map of your home, so plan images are
**only served to logged-in users** (signed URLs). They are stored in
`config/device_floorplan/`. Images you link from `config/www` stay public at
`/local/…`, as everything in that folder. Planner data lives in `.storage/device_floorplan`.

## Reference

### Floorplan Editor

| Step / tool | What it does | Where |
|---|---|---|
| **Plans** | One plan per floor (linked to a Home Assistant floor) or a view (garden, one room…); floors listed highest first | Tabs at the top, ⋮ per plan |
| **Picture & frame** | A file, an image in `config/www` or a sample plan; space around it or a trimmed margin | Plan ⋮ → Floor settings |
| **Measure** | One horizontal and one vertical line of a known length give the scale | Step 1 |
| **Fix / Reset proportions** | Stretches a squeezed picture to its true shape (and back); nothing placed moves | Step 1, when the two lines disagree |
| **Mark rooms** | Drag your Home Assistant areas onto the plan; with a linked floor only its rooms (and unassigned ones) are listed | Step 2 |
| **Shape & Glue Rooms** | Pull corners and walls onto each room; overlapping rooms meet on one line | Step 2 |
| **Energy points** | Electrical panel and solar / battery: where the Energy overlay's flow lines start | Step 3, top of *Devices to place* |
| **Place devices** | **Auto-place**, then drag; dashed markers are guesses until you touch them | Step 3 |
| **Bonds** | Drag one device onto another: one marker for both (bulbs in one lamp, shutter + contact) | Step 3 |
| **Split** | A device that acts somewhere else (a relay in the box, the lamp it switches) | Device details |
| **Phantoms** | A marker for something without its own device, made of entities | Step 3 |
| **Light on the plan** | Bulb, spot, strip, panel or wall lamp, with its glow and colour (Auto = the bulb's own) | Device details |
| **Snap to wall, sizes** | Bars for shutters, doors and TVs; end handles to size them | Device details |
| **Undo / Redo, saving** | Every change saves by itself; *Not saved · Retry* when the connection dropped | Top bar |

### The card

| Part | What it is | How to use it |
|---|---|---|
| **Overlays** | Separate views of the same plan, each showing only what matters for one topic | Buttons on the Overlay Bar or Side Rail; choose and order them in the card editor |
| ↳ **Live** | What is happening now: lights on, open doors, motion, running appliances, people; a camera while it sees something; any device you add, while it's active | Tap to switch; something you turn off stays a few seconds to undo; Layers → Cameras |
| ↳ **Lights** | Every light with its glow, colour and brightness; light scenes | Tap to switch, hold for details |
| ↳ **Comfort** | Room temperatures as a heatmap, humidity, air conditioners with their air flow | Layers: heatmap, labels, climate devices |
| ↳ **Security** | Cameras, and only what needs attention (open, motion, unlocked, alarm, unavailable in red); *All secure* otherwise | Layers → All sensors; tap a camera for its live view |
| ↳ **Network** | Zigbee (ZHA), Wi-Fi and LAN devices, their roles, links and signal | Layers: connections, links, legend |
| ↳ **Health** | Batteries and devices that are offline | Low battery threshold in the card editor |
| ↳ **Energy** | Today's use per device and room from Home Assistant's Energy settings; a day scrubber from 00:00 to Now; flow lines from the electrical panel | Drag the scrubber; Layers: room shading, flow lines |
| ↳ **Cleaning** | Robot vacuums with their path, rooms by when they were last cleaned | Start, pause, dock; tap a room to clean it |
| **Layers** | Extra details per overlay, remembered per screen | The layers button |
| **Floors** | One card for all floors, stacked like the building | Floor buttons |
| **People** | Where household members are, by room | Card editor → People |
| **Edit markers** | Per floor: which devices show where, icons, names, tap actions, extra readings as label or badge | Card editor → floor tabs at the top |
| **General settings** | Whole card: look and chips, tap behaviour, night look, overlay buttons, frame | Card editor, lower sections |

<details>
<summary><b>Card configuration (YAML)</b></summary>

Everything below is set in the card editor; the YAML is only for reference.

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | string | **required** | `custom:device-floorplan-card` |
| `plans` | list | — | Plan ids, one per floor (or `plan` for one) |
| `overlays` | list | all available | Which overlay buttons, in this order |
| `default_overlay` | string | first | Overlay when the card opens |
| `remember_floor` | boolean | `true` | Each screen remembers its last floor |
| `look.size` | number | `34` | Marker size (px) |
| `look.markers` | string | `icon_text` | `icon_text` or `icon` |
| `look.chips` | string | `dark` | Info chips: `dark`, `light`, `auto` (theme) or `custom` |
| `look.chip_color` | [r, g, b] | — | With `chips: custom` |
| `look.chip_bg` | string | `normal` | `solid`, `normal`, `light`, `clear` |
| `look.chip_size` | string | `m` | `s`, `m`, `l`, `xl` (separate from the marker size) |
| `look.names` | string | `hover` | Device names: `hover`, `always`, `off` |
| `security.show_quiet` | boolean | `false` | All sensors by default, not only what needs attention |
| `energy.min_w` | number | `0` | In *Now*: devices from this many watts (a device at 0 W never shows) |
| `energy.flow` | boolean | `true` | Flow lines shown by default (viewers switch them under Layers) |
| `cleaning.opacity` | number | `60` | Strength of the "last cleaned" colours (%) |

</details>

### How the plan is built

Everything on the plan sits in one of five layers, each with its own rules:

| Layer (bottom → top) | What's in it | How it behaves |
|---|---|---|
| 1. **Plan** | The picture of your floor | Doesn't react to taps |
| 2. **Rooms** | Room shading (heatmap, energy, last cleaned), motion and presence glow, day/night effects, room names | Tap a room for its details |
| 3. **Markers** | Device icons, info chips (temperatures, energy…), camera dots | Spread out automatically so none overlap |
| 4. **Windows** | Camera pictures, appliance status ("Drying · 2 min", "Ready to unload") | Attached to their marker with a connecting line, placed after the markers; never pushed around by markers, they only avoid each other and the plan's edges |
| 5. **Popups and menus** | Info cards, device lists, the Layers menu | Above everything; tap outside or ✕ to close |

### Styling names (card-mod)

With [card-mod](https://github.com/thomasloven/lovelace-card-mod) you can style beyond the card editor.

| Name | Type | What it is |
|---|---|---|
| `ov-live`, `ov-lights`, `ov-comfort`, `ov-security`, `ov-network`, `ov-health`, `ov-energy`, `ov-cleaning` | class on `ha-card` | The overlay being shown (style one overlay only) |
| `.m` | class | A marker (icon) |
| `.chip` | class | An info chip (temperature, AC, battery, energy…) |
| `.room` | class | A room name |
| `.ovbar` | class | The Overlay Bar / Side Rail |
| `--dfc-size` | variable | Marker size |
| `--dfc-accent` | variable | Accent colour |
| `--dfc-chipbg`, `--dfc-chipfg`, `--dfc-chipborder` | variables | Chip background, text and border |
| `--dfc-chipsize` | variable | Chip text size |
| `--dfc-roomfg`, `--dfc-roomhalo` | variables | Room name colour and its halo |

```yaml
card_mod:
  style: |
    ha-card.ov-comfort .chip { --dfc-chipbg: rgba(0,0,0,.35); }
```

## Related projects

- [Zigbee Floorplan Card](https://github.com/TheLarsinator/zigbee-floorplan-card):
  Zigbee mesh on a floorplan; `zigbee_devices` above can feed it.
- [Spatial Context](https://github.com/Greminn/ha-spatial-context): a full
  building model with traced walls and signal attenuation.
- [ha-floorplan](https://github.com/ExperienceLovelace/ha-floorplan): SVG-based
  interactive floorplans.

## Roadmap and changes

Ideas welcome in [Discussions → Ideas](https://github.com/JohnKotrolos/ha-device-floorplan/discussions/categories/ideas). See the
[roadmap](https://johnkotrolos.github.io/ha-device-floorplan/help/roadmap) and the
[changelog](https://johnkotrolos.github.io/ha-device-floorplan/help/changelog).

## AI-assisted development

Device Floorplan is built with [Claude](https://claude.ai) as a pair programmer. Claude writes most of the code and these docs; Claude is credited as co-author on the commits. I set the direction and the design rules, test every build in my own home before it ships, and decide what goes out.

The test bed is a real apartment: 12 rooms on one floor, mapped in Home Assistant with hundreds of devices and about 2,500 sensors over Zigbee (ZHA), Wi-Fi, Shelly and Tuya Local: 12 lights, shutters, four AC units, presence and motion sensors, an alarm panel, cameras, appliances on smart plugs, a 3D printer, and an Android tablet as the wall panel. A second Home Assistant instance is used for clean installs, and robot vacuum support was tested against a Valetudo test robot.

Every change also passes automatic checks on GitHub: Home Assistant's own validation (hassfest), the HACS check, and the Ruff and ESLint code linters. The code was reviewed independently by a second AI, and its findings were checked and fixed in 0.11.

Bugs are still bugs, whoever typed them. [Issues](https://github.com/JohnKotrolos/ha-device-floorplan/issues), [ideas](https://github.com/JohnKotrolos/ha-device-floorplan/discussions/categories/ideas) and pull requests are welcome.
