# Doors, windows and shutters

Instead of a round marker on the wall, a door, window or shutter can show as a **bar along its opening**: you see at a glance what is open, without markers crowding the walls.

## Draw an opening

1. In **Place devices**, click the door or window sensor, or the shutter (a cover).
2. In its card, **🪟 Opening on the plan** → **Draw it on the plan**. A bar appears through the marker.
3. Drag its **two ends** to where the opening starts and ends. They snap straight along the wall; hold **Alt** for any angle. The bar doesn't have to touch the marker: put the sensor where it really is and the bar on the window.
4. Choose what it is: **Door**, **Window** or **Shutter**. Device Floorplan guesses from the device class and the name (*shutter*, *roller*, *blind*…); change it if it's wrong.

**Remove the bar** brings the marker back.

## On the card

| | Open | Closed |
|---|---|---|
| **Door / window** | Light blue bar | Nothing |
| **Shutter with a contact** (manual) | White outlined bar | Nothing; the room gets darker by day |
| **Electric shutter** (with a position) | White outline, filled as far as it's closed; the fill follows it while it moves | Full white, fading away after about 2 seconds; the room gets darker by day |

- Bars show in **Live** and **Security**. In Live the marker of a drawn opening steps aside: the bar is the signal. Tap a bar for its details and controls.
- **Shutters without a bar** show in Live only while they move; their position is in the popup and in the room's daylight.
- **Darker by day**: needs the room's [shape](./rooms.md). A room with 4 shutters, 2 of them closed, is half as dark as with all closed (card editor → Day & night → *Closed shutters darken their room by day*).
- A door and a shutter on the same opening each get their own bar.

::: tip A sensor that works the other way round
A contact that is *closed* when the door is open (or a doorbell that closes when it rings) is best turned around in Home Assistant: **Settings → Devices & services → Helpers → Create helper → Template → Template binary sensor** with this state:

```jinja
{{ is_state('binary_sensor.your_sensor', 'off') }}
```

Then put the helper on the plan; automations and history see it the right way too.
:::
