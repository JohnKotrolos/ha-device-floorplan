# 2 · Mark rooms

Room pins tell Device Floorplan where each Home Assistant area is on the plan. Auto-place uses them to put every device in the right room.

## Place the rooms

The right column lists **Rooms on this floor**: the Home Assistant areas on this floor that have devices.

- **Drag** a room onto the plan: you drag a small pin, and its tip lands exactly under the pointer. Drop it in the middle of that room, or
- **click** a room, then click on the plan. With *then next* ticked, the next room is picked automatically. Press **Esc** to stop.

![All rooms on the plan](/screens/rooms-done.webp){.shot}

Drag a pin to adjust it. **✕** takes a pin off the plan. When all rooms are placed, **Done, place devices →** appears.

## Rooms that are not on this plan

A balcony on another floor, a garage in a separate building… The eye on each room shows whether it is on this plan: an open eye means visible. Press it to **hide** the room:

- its devices leave the device list, the counts and Auto-place;
- they wait in a collapsed **Hidden rooms** group at the bottom of the list, where you can still place one as an exception;
- a hidden room shows a crossed eye; press it to bring the room back.

If the room already has devices on the plan, you're asked whether to keep them or take them off too:

![Hiding a room with placed devices](/screens/hide-room.webp){.shot}

Hidden rooms are stored in Home Assistant per plan, and undo works.

## No rooms?

Rooms come from Home Assistant areas. If none of your devices has an area yet, give them one in Home Assistant, or skip this step and place devices by hand.
