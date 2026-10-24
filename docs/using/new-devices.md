# New and removed devices

## Devices you add later

When you pair a new device after setting up your plans, Device Floorplan notices it:

- In the planner it is tagged **New**, the list header shows *N new*, and the floor tab gets a dot. The **New** status filter shows only these.
- If it has an area with a room pin, it is **placed next to that room** automatically, marked *approximate* (option, on by default).
- A **Home Assistant notification** lists the new devices, about 10 minutes after the last one was added (pairing often adds several). It clears itself once they are placed or skipped (option, on by default).
- The event `device_floorplan_new_device` fires for every new device, and a blueprint can send a phone notification. See [Actions, events and blueprint](/reference/automations).
- On dashboards, admins see a small **N new devices · Place them** chip on the card.

Virtual devices (helpers, cloud services…) never count as new.

## Devices removed from Home Assistant

If a device on the plan disappears from Home Assistant (for example after re-pairing a Zigbee device, which creates a new device), its spot stays on the plan as a grey **?** marker.

Click it to:

- **Replace with…** another device: the new device takes over the exact spot, or
- **Remove from plan**.

The dashboard card simply doesn't show removed devices.
