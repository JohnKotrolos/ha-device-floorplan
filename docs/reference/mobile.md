# Mobile card

**Device Floorplan (mobile)** is a whole dashboard for your phone, made only from what you placed in the Floorplan: plans are floors, plan rooms are rooms, and your placed devices, bonds and entities are the devices. Nothing to set up.

::: warning Test build
New in 0.13.9.13 (dev builds). The look and the details may still change.
:::

## Add it

- **A dashboard of its own**: Settings → Dashboards → **Add dashboard** → **Device Floorplan (mobile)**. If your Home Assistant does not list it, add a new dashboard from scratch, open its raw configuration and use:
  ```yaml
  strategy:
    type: custom:device-floorplan-mobile
  ```
- **Or as a card** (best in a *Panel* view): **Add card** → **Device Floorplan (mobile)**.

It takes the people, room names, look and overlay settings of the first Floorplan card on your dashboards, so it looks like your main plan. Turn **Use the settings of my Floorplan card** off to use the defaults.

## Portrait

| Where | What |
|---|---|
| **Home** | What is happening now: a small live plan, one chip per overlay with something to say (lights on, open doors, low batteries…) and the outside temperature, your rooms (most active first), cameras and people. |
| **Home button** (bottom bar) | Go to a place: the floors (when there are several), then that floor's rooms. |
| **Room page** | The room's name, its temperature and humidity (the average of all its readings, air conditioners included) and a small floor picture with the room marked. Under it the room cut out of the real plan, with only its own devices; **Hide** folds it away. Then the room's devices by what they are: **Lights**, **Comfort**, **Security**, **Appliances & media**, **Other**, with switches and brightness sliders. **›** on a group opens the plan in that overlay. |
| **Overlays** | Every overlay with its one-line status, and **Home Replay**. A tap opens the floor's plan in that overlay (the full plan with Layers), with its list underneath. |
| **Devices** | Every device, by room, with a search. |
| **People** | Who is home and in which room (tap: that room). |

Swipe left or right on a room's plan for the next room (in the same order as the Rooms list); tap a device on it for its details.

## Landscape: the house explorer

Turn the phone sideways. The plan takes the left two thirds of the screen, edge to edge; on the right are the overlays for what you are looking at.

- **House** (when there are several floors): all floors as tilted plans, lit rooms in colour, people where they are. Tap a floor.
- **Floor**: the floor's plan. Tap a room. Swipe for the next floor.
- **Room**: the room cut out of the plan; tap devices. Swipe for the next room.
- **Back** goes one level out: room → floor → house.
- **Right side**: the overlay tabs (they also set what the plan shows); the chosen overlay in full, the others as one line each.
- The title and the switcher fade after a few seconds and come back on any touch.

Turning the phone keeps the place: a room stays that room, a floor becomes its Rooms list, the house becomes Home.

## Options

| Option | Values | Default |
|---|---|---|
| `room_order` | `active` (most active first), `alpha`, `plan` | `active` |
| `default_overlay` | the overlay the plans open in | `live` |
| `layout` | `auto` (sideways on a phone = house explorer), `portrait`, `landscape` | `auto` |
| `copy_settings` | `true` / `false` | `true` |
| `plans` | a list of plan ids to show | all plans |
| `people` | as in the Floorplan card | the Floorplan card's, else every person |

## Full screen

A card cannot hide Home Assistant's own top bar. For a full screen phone dashboard:

- **iPhone / iPad**: the Companion app has its own **kiosk mode** (Companion app settings).
- **Any device**: the HACS frontend plugin **kiosk-mode**, set on this dashboard only:
  ```yaml
  kiosk_mode:
    hide_header: true
  ```
