# Split devices

**One device, more than one place: the device sits where its hardware is, what it switches sits where it acts.**

A relay behind the wall switch that powers the ceiling lamp. A wall panel with two relays: one for the WC light, one for the corridor light. A smart plug in the socket, its lamp across the room.

## The rule

- The **device** stays where its hardware is (the wall, the socket). Network and Health show it there: that's where the radio and the battery are.
- Anything it **switches** (a light, switch, cover, fan or climate entity) can get its own spot **where it acts**.
- Each entity shows in **exactly one place** on the card: at its own spot if it has one, otherwise at the device.

## Make one

1. Place the device where the hardware is.
2. In its card choose **📍 Split: it controls something elsewhere**. Its switchable entities are listed (a hint says so when it has two or more).
3. Press **Place where it acts** next to one and click on the plan (the lamp on the ceiling).
4. A dashed line joins the device and the spot while you select either. **✕** brings the entity back to the device.
5. Click the spot: it has its own **Light on the plan** (shape, size, colour), independent of the device and of the other channels. A relay that switches a lamp: set **Acts as: Light** and the card treats it as a lamp (bulb icon, Lights overlay, glow).

Even better, if you like: in Home Assistant open the relay's entity → ⚙ → **Show as → Light**. Device Floorplan moves the spot to the new light by itself, and every other dashboard sees a light too. The device at its hardware spot stays what it is (a wall switch never turns into a lamp).

Searching for an entity also helps: a row says *Relay 2 · part of this device · can sit where it acts*.

## On the card

| Overlay | Shows |
|---|---|
| Live, Lights, Security, custom | Each placed entity as its own marker (its own icon and name; tap switches that entity) |
| Network, Health | The device only, at its hardware spot |

The device itself shows only what's left (sensors, signal, battery), and nothing in Live if nothing is left. Hover a relay's marker: *Through Wall panel · Wi-Fi*. If the device goes offline, its placed entities show as unavailable.

## Lights behind a wall switch

A wall switch with light channels (Aqara, Sonoff, Shelly…) is one device in Home Assistant, and its lights belong to it. In the Editor:

1. Place the **switch** where it is on the wall. The *Type → Lights* filter shows it too, because it has a light.
2. Open its card → **📍 Split: it controls something elsewhere** → **Place where it acts** for each light (the lamp over the coffee table, the ceiling light).
3. Click each light spot to give it its shape and colour.

The lights then glow where the lamps are, and the switch stays a switch on the wall.

## Buttons and remotes are not split devices

A wireless button or remote (Aqara, Hue Dimmer, IKEA, Matter buttons…) has no switch in Home Assistant: it only sends **events** (*pressed once*, *pressed twice*), and an automation turns the lights on. Home Assistant doesn't know which lamp it controls, so there is nothing to split:

- place the **button where it physically is** (the wall, the coffee table): Network and Health show it there (battery, signal);
- place the **lights where they are**: they are normal lights on the card (Live, Lights, glow).

Split devices are only for devices that switch something themselves (a relay, a wall switch with light channels, a panel with relays).

## Examples

- **Relay behind the wall switch**: device at the wall, its light on the ceiling.
- **Wall panel with two relays**: the panel on the corridor wall, *Relay 1* in the WC, *Relay 2* in the corridor: three places, one device.
- **Plug and lamp**: either split it (plug at the socket, the lamp spot where the lamp is), or simply place the plug at the lamp: easier, only the Network view is slightly off.

::: tip Updated from 0.5.0
The older "box is somewhere else" spot was converted automatically: the device moved to the box spot, and its main entity got a spot where the device was. Nothing moves on your dashboards.
:::
