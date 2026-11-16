# How devices behave

Every device on your plan follows the same few rules. This page puts them in one place.

## Category

Each device belongs to one category. The category decides where it is listed in the Floorplan Editor (Type filter, "Group by type"). Device Floorplan picks it from what the device mainly is; one stray entity doesn't decide.

If a device lands in the wrong category, open it in the Floorplan Editor and pick another under **Category**. For a light, plug or fan this also sets what it is on the card: a Light glows and is in Lights; a Switch or a Fan shows its icon while on.

| Category | Typical members | Tap (default) |
|---|---|---|
| Lights | lamps, bulbs, LED strips, light groups | switch on / off |
| Switches & plugs | plugs, relays, wall switches | switch on / off |
| Climate | AC, thermostat, radiator valve, water heater, (de)humidifier, fan, air purifier | details |
| Covers | shutters, blinds, curtains, awnings | details |
| Doors & windows | contact sensors; garage doors, gates | details |
| Motion & presence | motion, presence, occupancy, vibration | details |
| Security | locks, alarm panels, doorbells | details |
| Safety | smoke, CO, gas, leak detectors, sirens | details |
| Cameras | anything with a camera | the picture |
| Media & screens | TV, speakers, receivers, wall tablets | details |
| Appliances | washer, dryer, dishwasher, oven, coffee machine, 3D printer | details |
| Moving things | robot vacuums, lawn mowers, cars (phones and watches feed a person instead) | details |
| Sensors | temperature, humidity, air quality, light level | readings with history |
| Energy | inverters, home batteries, EV chargers, energy meters | details |
| Water & garden | valves, irrigation, soil and plant sensors | details |
| Buttons & remotes, Network & repeaters, Computers & servers, Helpers, Other | | details |

You can change the tap of any device per overlay in the card's **Edit markers**, and the default per kind in the card settings.

## Tap and hold

- **Tap** does the device's tap action.
- **Hold** opens its details.
- A tap on a device that is **unavailable** says so and does nothing.
- After a tap, the device **pulses** until it answers (slow devices such as IR air conditioners and shutters), for at most 8 seconds.

## Devices drawn in your plan: touch areas

If your plan picture already shows the device (a TV, an AC), give it a **touch area** in the Floorplan Editor: open the device, **Add a touch area**, and drag the orange corner so the box covers the drawn device. In Live you can then tap it where it is drawn, also when it is off. Where two touch areas overlap, the smaller one wins.

The card setting **Touch areas show** decides whether you see them: a short flash when you tap an empty spot on the plan (default), a faint outline, or nothing.

## Device pictures

Instead of an icon, a device can stand on the plan as a top-down **picture**: one from the built-in library, or your own transparent PNG or WebP (max 2 MB). Open the device in the Floorplan Editor, pick it under **Picture**, then set its size and turn.

In Live the picture is where you tap, also when the device is off. Its look follows the device's state:

| State | Look (default) |
|---|---|
| On | full picture |
| Off | faint picture |
| Unavailable | dotted outline |

You can change each of these per device (full picture, faint picture, outline, dotted outline, hidden), tint the picture with a colour (its shading stays), and move the outline a little inside the picture with **Outline inset**.

## When a device is off

Live shows what is on or happening. Things that are off are hidden, or faint if you choose so in the card settings. Per device you can override this in **Edit markers → Live → When it is off**: hidden, or faint so it can be tapped on again.
