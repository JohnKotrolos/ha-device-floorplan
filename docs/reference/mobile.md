# Mobile card

**Device Floorplan (mobile)** is a whole dashboard for your phone, made only from what you placed in the Floorplan: plans are floors, plan rooms are rooms, and your placed devices, bonds and entities are the devices. Nothing to set up.

::: warning Test build
New in 0.13.9.13 (dev builds), reworked in 0.13.9.14 and 0.13.9.15. The look and the details may still change.
:::

## Add it

- **A dashboard of its own**: Settings → Dashboards → **Add dashboard** → **Device Floorplan (mobile)**. If your Home Assistant does not list it, add a new dashboard from scratch, open its raw configuration and use:
  ```yaml
  strategy:
    type: custom:device-floorplan-mobile
  ```
- **Or as a card** (best in a *Panel* view): **Add card** → **Device Floorplan (mobile)**.

**Floors**: the plans you gave a **level** in the Floorplan Editor (plans without a level are views and stay out); to choose others, list them in `plans`. **People**: everyone in Home Assistant; where they are comes from your Floorplan card's people settings.

It takes its people settings, room names, look and **overlay settings** from the first Floorplan card on your dashboards, so it shows exactly what your main card shows: a device you hid from an overlay there is hidden here too, and the room groups follow the categories you gave your devices in the Floorplan Editor. The mobile card has no overlay settings of its own: change them once in the main card. Turn **Use the settings of my Floorplan card** off to use the defaults.

## Portrait

| Where | What |
|---|---|
| **Home** | What is happening now (Home is never a plan; the plan on it shows its floor's name): a small live plan, one chip per overlay with something to say (lights on, open doors, low batteries…) and the outside temperature, your rooms (most active first), cameras and people. |
| **Bottom bar** | **☰** opens Home Assistant's menu (when its top bar is hidden), **Home** goes to a place (the floors, then that floor's rooms), the round button on the right opens **Overlays**, **Devices** and **People**. |
| **Room page** | The room's name, its temperature and humidity (the average of all its readings, air conditioners included) and a small floor picture with the room marked. Under it the room cut out of the real plan, with only its own devices; **Hide** folds it away. Then the room's devices by what they are: **Lights**, **Comfort**, **Security**, **Appliances & media**, **Other**, with switches and brightness sliders. **›** on a group opens the plan in that overlay. |
| **Overlays** | Every overlay with its one-line status, and **Home Replay**. A tap opens the floor's plan in that overlay (the full plan with Layers), with its list underneath. |
| **Devices** | Every device, by room, with a search. |
| **People** | Who is home and in which room (tap: that room). |

**Portrait is for quick actions**: its plans always show Live, with each room's temperature · humidity. A room page shows the room centred in a band a third of the screen high, the rest of the floor dimmed around it; ‹ › on the band go to the previous / next room, the small arrow under the header folds the band away, and each group (Lights, Comfort…) folds with a tap on its header. Switching something in the list makes it light up on the plan for a moment. Details (every overlay in full) are in landscape.

On a whole floor (Home, a floor's rooms, an overlay's plan) a tap opens the room you tap, and a swipe left or right goes to the next floor; devices are not tapped there. On a room's plan, a swipe goes to the next room (in the same order as the Rooms list) and a tap on a device opens its details.

## Landscape: the house explorer

Turn the phone sideways. The plan takes the left two thirds of the screen, edge to edge; on the right are the overlays for what you are looking at.

- **House** (when there are several levels): the building, all levels stacked, lit rooms in colour, people where they are. Tap a floor. Plans on the same level sit side by side; plans without a level are not part of the house.
- **Floor**: the floor's plan. Tap a room. Swipe for the next floor.
- **Room**: the room cut out of the plan; tap devices. Swipe for the next room.
- **Back** goes one level out: room → floor → house.
- **Right side**: the overlay tabs (they also set what the plan shows); the chosen overlay in full, the others as one line each.
- The title and the switcher fade after a few seconds and come back on any touch.

Turning the phone keeps what you see: Home becomes the floor it shows (Back: the House), a room stays that room, a floor becomes its Rooms list, the House becomes Home.

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
