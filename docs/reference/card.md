# Dashboard card

The easiest way to add the card is **I'm ready → Add to dashboard** in the Floorplan Editor. You can also add it like any other card: search for **Device Floorplan** in the card picker.

![The card on a dashboard](/screens/card.webp){.shot}

## On the dashboard: calm by design

The card shows your plan and its **overlay buttons**. That's all there is to do on the dashboard:

| Overlay | What it shows |
|---|---|
| **Plan** | The plan with your room names. |
| **Live** | Lights (glowing when on), switches and plugs, covers, climate with its temperature, motion (pulsing when detected), doors and windows (orange when open), locks, media, appliances. Closed doors and idle sensors are small and faint. |
| **Lights** | Only lights (and switches or plugs that run lights). Tap to switch; **All off** (asks first), **All on** and your own **light scenes** below the plan. |
| **Comfort** | Room temperature and humidity per sensor, as calm chips (*21.0 °C · 69.6 %*). ACs and thermostats get their own chip: a coloured edge and icon for the mode (heating, cooling, dry / fan, off), the room temperature and the target (*→ 24 °C*). |
| **Security** | Doors and windows, motion, locks, alarm panels, smoke / leak / gas sensors and cameras. Alerts are highlighted. |
| **Network** | How each device connects (Zigbee, Wi-Fi / LAN, Matter, Bluetooth, Z-Wave), at its box / radio spot when it has one. See [Network](#network). |
| **Health** | Battery levels (red when low) and devices that are offline. |
| *Your own* | [Custom overlays](#custom-overlays) you create in the card editor. |

Close markers spread out side by side so each stays readable; a thin line points to the real spot.

### Tapping

| Tap on | Does (default) |
|---|---|
| A light, switch, plug, fan or cover | Switches it on / off (bonded lamps: all of them) |
| A reading (temperature, humidity, battery) | Opens a popup: each reading with its value and the last 24 hours, temperature on top, humidity below |
| An AC or thermostat | Home Assistant's details with its controls |
| A device in Network | Its connection, role and signal (LQI / RSSI / dBm where known) |
| Anything else | Home Assistant's details (more-info) |

**Hold** (or right-click) always opens the details; for bonded devices it lists each one.

### Network

- **Icon** = connection: Zigbee, Wi-Fi / LAN, Matter, Bluetooth, Z-Wave. No values on the plan; the signal is in the device's popup.
- **Colour and shape** = role: coordinator (amber diamond), router / repeater (blue square), hub or bridge (blue square), end device (green), other devices (grey), unavailable (red).
- **Ring** = Zigbee link quality: 0–99 red, 100–149 orange, 150–199 yellow-green, 200–255 green. It comes straight from ZHA, you don't need to enable any LQI sensor.
- **Lines**: every Zigbee link between placed devices (ZHA), coloured by LQI, and dashed lines from devices to their hub or bridge (a Matter bridge, a hub): *through hub / bridge* in the legend.
- **Layers** button (at the end of the overlay buttons; in the legend row when the buttons are hidden): show one connection at a time (Zigbee, Wi-Fi, Matter…) or *Default*, turn lines and the legend on or off, and hide weak links with **Minimum LQI**. It never covers the plan.

Zigbee roles, LQI and links need ZHA and an admin user (that's what Home Assistant allows). Wi-Fi and other devices show their signal in the popup when their signal sensor is enabled in Home Assistant.

## In the card editor: everything adjustable

Open the dashboard's edit mode and edit the card. The sections, in order: **General** (plan, title, card ID) · **Overlay buttons on the card** · **Overlays** (each built-in overlay, Light scenes, Custom overlays) · **Rooms** · **Look and tap behaviour** · **Devices on the plan**.

- **Overlay buttons on the card**: which ones and in which order (drag), the one shown when the card opens, **where the buttons are** (below, above, left or right of the plan, or hidden) and their **style** (icons and labels, or icons only). **Overlay names** renames them.
- **Live**: which kinds of devices it shows, faint closed doors, values next to icons.
- **Lights**: switches and plugs that run lights, brightness of lamps that are on, lamps that are off (faint, normal or hidden), All off / All on buttons.
- **Comfort**: humidity, humidity-only devices, ACs and thermostats as climate chips.
- **Security**: also closed / idle, cameras.
- **Network**: connections shown by default, the Layers button, Zigbee links and their minimum LQI, hub links, legend, connection names next to icons, only weak signals.
- **Health**: low-battery threshold, only problems.
- **Tap behaviour** per kind: switch on/off, details, readings popup or nothing.
- **Look**: marker size, **markers** with icon and text or icon only, reading chips (dark glass, light, follow the theme), device names, title.
- **Card ID**: lets other cards switch this card's overlay (see below).
- **Custom overlays**, **Light scenes** and **Rooms** (below).
- **Devices on the plan**: each row shows the icons of the overlays the device appears in (faded = hidden by you). Open a device for its **icon**, **name**, **tap action** and **Shows in**: one switch per overlay it can appear in. Overlays it can't appear in, and overlays turned off on this card, aren't listed. Filter the list by overlay to tidy up one overlay at a time.

### Light scenes

Under **Light scenes**, **Add scene**: a name, an icon, the lights, and a brightness (0 = off). Or set the lights the way you want them and press **Save the lights' current state**: on / off, brightness and colour of each light are kept. You can also run a Home Assistant scene or script instead. The scene buttons appear in the Lights overlay; the active one is highlighted. Scenes are stored in the card only, nothing is created in Home Assistant.

### Rooms

Room names placed in the Floorplan Editor (step *Rooms*) show on the **Plan** overlay. Choose the overlays they appear in, the style (text, text on a chip, chip with the room's icon) and the size; rename single rooms under **Custom room names**, or hide them for the card.

### Custom overlays

Under **Custom overlays**, **Add overlay**: a button name, an icon and the **kinds** of devices it shows (lights, covers, doors and windows, temperature, battery…). Add single devices by hand in the device list (**Shows in → your overlay**). Custom overlays appear in the overlay buttons and can be switched from other cards like the built-in ones (by their ID, e.g. `custom1`).

## Switch the overlay from other cards

Use this when the card is part of your own dashboard, for example a wallpanel with a top row of chips (temperature, lights, openings, alarm): tapping a chip shows the matching overlay on the floorplan. Set the overlay buttons to **Hidden** if you only want to switch from outside.

Overlay names: `plan`, `live`, `lights`, `comfort`, `security`, `network`, `health`, your custom overlays' IDs (e.g. `custom1`), or `reset` (back to the card's default overlay).

### 1. The action (every screen)

Give the card a **Card ID** in the editor, e.g. `hall`. Then any button, chip, script or automation can call:

```yaml
action: device_floorplan.show_overlay
data:
  card_id: hall
  overlay: comfort
```

Every screen showing that card switches: the wallpanel and your phone together.

A **Tile** card in your top row:

```yaml
type: tile
entity: sensor.indoor_temperature
tap_action:
  action: perform-action
  perform_action: device_floorplan.show_overlay
  data:
    card_id: hall
    overlay: comfort
```

A **button** card:

```yaml
type: button
name: Lights
icon: mdi:lightbulb-group-outline
tap_action:
  action: perform-action
  perform_action: device_floorplan.show_overlay
  data: { card_id: hall, overlay: lights }
```

A **Mushroom chip** (HACS) works the same way: `tap_action` → `perform-action` with the data above.

An **automation** that shows Security on the wallpanel when the alarm is armed:

```yaml
triggers:
  - trigger: state
    entity_id: alarm_control_panel.home
    to: armed_away
actions:
  - action: device_floorplan.show_overlay
    data: { card_id: hall, overlay: security }
```

### 2. A link (this screen only)

Navigate to the dashboard with `?overlay=` in the address. Only the screen you tap on switches; nothing else is involved. It applies every time you tap, and the card removes `?overlay=` from the address afterwards:

```yaml
tap_action:
  action: navigate
  navigation_path: /wallpanel/home?overlay=network
```

With several floorplan cards on one view, add `&card=hall` so only that card switches.

## YAML

Everything the editor sets is plain YAML; only what differs from the defaults is stored.

```yaml
type: custom:device-floorplan-card
plan: ground_floor                 # required: the plan id
title: Home
overlays: [live, lights, comfort, security, custom1, plan]
default_overlay: live
overlay_names: { live: Home }
buttons: { position: left, style: icons }     # bottom | top | left | right | hidden
live: { show: [lights, motion, openings, climate] }
lights:
  brightness: true
  all_on: true
  scenes:
    - name: Movie night
      icon: mdi:movie-open-outline
      lights: [light.sofa, light.tv_strip]
      brightness: 20
    - name: Evening
      entity: scene.evening                     # or a Home Assistant scene / script
comfort: { humidity: true }
network: { connections: [zigbee, matter], min_lqi: 80, legend: true }
health: { low: 25, only_problems: true }
rooms: { show_in: [plan, comfort], style: pill, size: m, names: { kitchen: Kitchen & dining } }
custom_overlays:
  - { id: custom1, name: Downstairs, icon: mdi:stairs-down, kinds: [lights, covers] }
tap: { cover: more-info, reading: readings }
look: { size: 38, chips: auto, markers: icon, names: hover }
devices:
  <device_id>: { icon: mdi:ceiling-light, name: Dining, tap: toggle, hide_in: [security], add_to: [custom1] }
card_id: hall
```

Older configurations (`show_states`, `names`, `default_view`, `look.dock`, `look.values`) keep working.

Admins see a small **N new · Place them** button when new devices are waiting. Hide it with `hide_admin_hint: true`.
