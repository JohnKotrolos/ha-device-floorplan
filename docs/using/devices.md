# 3 · Place devices

## The device list

**Devices to place** shows the devices on your list, grouped by room (or by type or connection). Each row has the integration's logo, the battery level when there is one, and ⓘ for Home Assistant's more-info dialog. Placed devices are dimmed and show a green **✓ on plan** pill (amber **◌ approx** while approximate), just like the rooms.

- **Search finds everything.** Type a name, room, model, manufacturer, an entity name or an entity id (paste `binary_sensor.dryer_running`). While you search, filters, skipped devices, hidden rooms and other floors are ignored: every match is shown with its status and the action right there. A device found through one of its entities shows *matches: …* under its name.
- **Type**, **Connection** and **Status** filters choose what you work on. In each filter, **All · None** at the top selects everything or nothing; the **✕** on an active filter clears just that one. *Clear filters* resets them all. Devices already on the plan that don't match stay visible, faded, so you can see how full a room is (switch them off under Layers → *Devices outside the filter*).
- The **▴** next to the title hides search and filters; one line then shows what is active (*Zigbee · 5 types · 38 shown*) and the list gets the room.
- **Group by** Room, Type or Connection.
- **Devices from all floors** shows devices of other floors too (only on floor plans).

## Three ways to place

| Way | How |
|---|---|
| **Auto-place** | Puts all devices shown in the list next to their room pin, marked *approximate*. It respects your filters. |
| **Click to place** | Click a device in the list, then click on the plan. With *then next* ticked, the next device is picked. |
| **Drag** | Drag a row from the list onto the plan, or drag a marker on the plan. |

Placing doesn't open the device's details, so the next device is right there: the new marker flashes and a message says *✓ … placed · Undo*.

**Taking a device off the plan:** drag its marker back onto the list (it lights up *Drop to remove from plan*). Dropped anywhere else outside the plan, the marker snaps back. Room pins work the same way in the Rooms step.

**Zoomed in?** Drag the plan to move around, in every step. A click (without moving) still places or measures. **+** and **−** zoom around the selected device or measuring point.

![After Auto-place](/screens/place-auto.webp){.shot}

## Approximate and confirmed

Auto-placed devices have a **dashed ring**: they are in the right room but not at the exact spot. Dragging a device, nudging it with the arrow keys, or pressing **Confirm position** makes it solid.

## Device details

Click a marker (or a placed device in the list) to open its details at the top of the list. For a device that isn't placed yet, click its row once to place it, a second time (or **Details** in the blue bar) for its details:

![A selected device](/screens/place-selected.webp){.shot}

- **Confirm position**, **Remove from plan**, **Skip this device**.
- **More info** and **Device page**.
- *The marker shows*: the entity used for the icon, the state and a tap in the card. All entities of the device are listed, grouped (with a filter box for devices with many entities); *Now:* shows the current value. Choose another entity of the device, or **Other entity…** for any entity in Home Assistant, a helper too (e.g. a *Dryer running* template next to the dryer's plug). **The card uses only this entity** hides the device's other entities from the card (no switching the plug from the dashboard).
- **📍 Box / radio is somewhere else**: for a device in two places, e.g. a wall switch that drives a ceiling lamp. Place the device where it does its job (the lamp); click this and then the wall to add a small ▣ spot for the box. The card's network and health views use that spot.
- **Skip all N not on the plan from ‹integration›**: one click for software-heavy integrations (NAS, router, cloud services). Undo is in the message.
- When devices share a spot: **Bring to front** / **Send to back**. Click a stacked marker (with a count) to fan the devices out.

## Bond devices

Several lamps above one table, two blinds on one window: **bond** them so they are one marker, switched together on the card. Drag one onto the other on the plan (or from the list) and **hold** for a moment until the ring turns green and says *Drop to bond*. A quick drop without holding only stacks them. Only the same kind bonds: lights with lights, switches/plugs together, covers together. The details show *Bonded with …* and **Unbond**. Bonding lives only in Device Floorplan and its card; nothing is added to Home Assistant.

## Helpers and entities without a device

Some real appliances have no device in Home Assistant, for example air conditioners from SmartIR or IR-controlled lamps and fans. When such an entity (climate, light, cover, fan, switch, lock, media player, vacuum…) has an area, it is **listed like a device**: in its room, under its type, and Auto-place works.

Template sensors and other helpers without a device are only found by the search; they appear under **Entities without a device**. Drag one onto the plan, or click it and then the plan: it gets its own marker and the card shows that entity at that spot. Once placed, it stays in the list.

## Statuses

| Status | Meaning |
|---|---|
| To place | On your list, not on the plan yet. |
| Approx | Auto-placed, dashed ring. |
| Placed | Confirmed position. |
| On another floor | Placed on another floor plan. *Move to this floor* moves it. |
| New | Added to Home Assistant since your last visit. |
| Skipped | Not wanted on any plan. Nothing changes in Home Assistant. |

With a filter or search active, **Skip the N not on the plan** skips all shown devices that aren't placed. Devices already on the plan are never skipped this way, and every skip can be undone.

## One dot per physical device

A device that is "connected via" another device and has no entities of its own (for example the Bluetooth side of an ESP32) is merged into it. The marker gets a double ring when a device has two connections.

**Parts.** Some integrations split one physical thing into several HA devices: a 3D printer with its AMS and external spool, a NAS with its drives, volume and Surveillance Station. A device counts as a *part* when it is connected via a device of the same integration, has no connection of its own and its name starts with the parent's name. Parts don't get their own row or marker: the parent shows *+2 parts*, and its details list them. Hubs and bridges are not affected (a Zigbee coordinator's or Hue bridge's devices have their own radio or their own name). If the guess is wrong, **Show as its own device** in the details splits a part off; *Make it a part again* undoes it.
