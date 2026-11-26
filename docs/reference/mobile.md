# Mobile card

**Device Floorplan (mobile)** is a whole dashboard for your phone, made only from what you placed in the Floorplan: plans are floors, plan rooms are rooms, and your placed devices, bonds and entities are the devices. Nothing to set up.

::: warning Test build
New in 0.13.9.13 (dev builds), reworked in 0.13.9.14–0.13.9.16. The look and the details may still change.
:::

## Add it

- **The easy way**: in the Floorplan Editor, **⋮** → **Create a new mobile dashboard…**. Everything is filled in (name *Mobile*, the icon `dfp:mobile`, the Floorplan card whose settings it uses): press **Create** and it is in your sidebar. Then, in the Home Assistant app on your phone, choose it as the dashboard the app opens with (Settings → Companion app). **⋮** → **Create a new dashboard…** does the same for a desktop dashboard with all your floorplans.
- **A dashboard of its own, by hand**: Settings → Dashboards → **Add dashboard** → **Device Floorplan (mobile)**; as its icon use `dfp:mobile`. If your Home Assistant does not list it, add a new dashboard from scratch, open its raw configuration and use:
  ```yaml
  strategy:
    type: custom:device-floorplan-mobile
  ```
- **Or as a card** (best in a *Panel* view): **Add card** → **Device Floorplan (mobile)**.

**Settings**: on the mobile dashboard, **Edit dashboard** opens them (Settings from, Layout, Room order, Home sections, Household, Hide the top bar); on the card, its card editor. `debug: true` (raw configuration) shows how long each step takes, on the screen and in the browser console.

**Floors**: the plans you gave a **level** in the Floorplan Editor (plans without a level are views and stay out); to choose others, list them in `plans`. **People**: everyone in Home Assistant; where they are comes from your Floorplan card's people settings.

It takes its people settings, room names, look and **overlay settings** from the first Floorplan card on your dashboards, so it shows exactly what your main card shows: a device you hid from an overlay there is hidden here too, and the room groups follow the categories you gave your devices in the Floorplan Editor. The mobile card has no overlay settings of its own: change them once in the main card. Turn **Use the settings of my Floorplan card** off to use the defaults.

## Portrait

| Where | What |
|---|---|
| **Home** | What is happening now (Home is never a plan; the plan on it shows its floor's name): a small live plan, one chip per overlay with something to say (lights on, open doors, low batteries…) and the outside temperature, your rooms (most active first), cameras and people. |
| **Bottom bar** | **☰** opens Home Assistant's menu (when its top bar is hidden), **Home** goes to a place (the floors, then that floor's rooms), the round button on the right opens **Overlays**, **Devices** and **People**. |
| **Room page** | The room's name, its temperature and humidity (the average of all its readings, air conditioners included) and a small floor picture with the room marked. Under it the room cut out of the real plan, with only its own devices; **Hide** folds it away. Then the room's devices by what they are: **Lights**, **Comfort**, **Security**, **Appliances & media**, **Other**, with switches and brightness sliders. **›** on a group opens the plan in that overlay. |
| **Devices** | Every device, by room, with a search. |
| **People** | Who is home and in which room (tap: that room). |

**Home** (portrait): small pills above the plan say what is on (outside / inside, air, lights, offline, batteries); the plan shows the main floor (‹ › or swipe for the others; tap a room to open it); red pills under it are what needs a look; then **Rooms** (each tile with one badge per overlay: open, lights on, climate running, power, offline…), **Home control** (one tile per overlay; a tap opens its controls: e.g. Lights with your scenes from the Floorplan card and a switch per room) and **Cameras**. Each section has a small button to show its tiles as a row or a grid.

**Air quality**: PM2.5, PM10, CO₂, VOC index, AQI and NO₂ sensors give each room an "Air good / moderate / poor" (PM2.5 ≤ 15 / ≤ 35 µg/m³, CO₂ < 800 / < 1200 ppm, VOC index < 150 / < 250, AQI ≤ 50 / ≤ 100).

**Portrait is for quick actions**: its plans always show Live, with each room's temperature · humidity. A room page shows the room centred in a band a third of the screen high, the rest of the floor dimmed around it; ‹ › on the band go to the previous / next room, the small arrow under the header folds the band away, and each group (Lights, Comfort…) folds with a tap on its header. Switching something in the list makes it light up on the plan for a moment. Details (every overlay in full) are in landscape.

On a whole floor (Home, a floor's rooms, an overlay's plan) a tap opens the room you tap, and a swipe left or right goes to the next floor; devices are not tapped there. On a room's plan, a swipe goes to the next room (in the same order as the Rooms list) and a tap on a device opens its details.

## Landscape: the house explorer

Turn the phone sideways. The plan fills the screen; the overlays are on the right, the navigation in a slim strip on the left, beside the plan (never over it).

- **Left strip**: ☰ (Home Assistant's menu, when its top bar is hidden), one button per floor by its level (2, 1, 0…), and **⌂ Home**: the building, all levels stacked (when there are several levels). Swipe on the plan for the next floor.
- **The plan**: the whole floor. Tap a device to use it. Tap an empty spot of a room to **choose** it: the room is outlined and a chip shows its name and values; tap the room again, outside any room or the chip's ✕ to clear it.
- **Right side**: the overlays (they set what the plan shows) and Home Replay on the plan's round button.

Turning the phone keeps the place: a room page becomes its floor with that room chosen; a chosen room becomes its room page when you turn back; a floor stays that floor; Home stays Home. The room view itself is the portrait room page.

## Options

| Option | Values | Default |
|---|---|---|
| `room_order` | `active` (most active first), `alpha`, `plan` | `active` |
| `default_overlay` | the overlay the plans open in | `live` |
| `layout` | `auto` (sideways on a phone = house explorer), `portrait`, `landscape` | `auto` |
| `hide_header` | `true` / `false` | `true` |
| `copy_settings` | `true` / `false` | `true` |
| `plans` | a list of plan ids to show | the plans with a level |
| `people` | a list of person entities to show | every person |

## Full screen

On phones the mobile card hides Home Assistant's top bar on its own dashboard while it is open (option **Hide Home Assistant's top bar on phones**, on by default); **☰** in the bottom bar opens Home Assistant's menu. To edit the dashboard, add `?edit=1` to its address (or turn the option off on a computer: the bar is only hidden on phone-sized screens). If a Home Assistant update changes its page, the bar simply shows again.

Other ways to a full screen:

- **iPhone / iPad**: the Companion app has its own **kiosk mode** (Companion app settings).
- **Any device**: the HACS frontend plugin **kiosk-mode**, set on this dashboard only:
  ```yaml
  kiosk_mode:
    hide_header: true
  ```
