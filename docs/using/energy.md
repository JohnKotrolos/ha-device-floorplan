# Energy

The **Energy** overlay shows what your devices used today, on the plan. It reads Home Assistant's own Energy settings (*Settings → Dashboards → Energy*), so there is nothing extra to set up.

## What you need

- Devices under **Individual devices** in Home Assistant's Energy settings (a metering plug, an appliance with its own energy sensor…). Each one shows its kWh on the plan.
- Rooms with a shape on your plan (step 2 · Mark rooms) to shade them by what they used.
- For the flow lines: the **Electrical panel** on the plan (see below).

## On the card

- Every device shows its energy for the chosen time; rooms are shaded, darker = more.
- Devices you haven't placed show as one chip per room (tap for the list).
- The **day scrubber** under the plan goes from *Today* hour by hour to *Now* (live watts).
- **Flow lines** (Layers): from every device to the electrical panel, and from solar or battery when you have them, in Home Assistant's energy colours. The panel shows the total.

## Why don't I see a device?

The plan only draws what used energy in the time you picked:

- **At *Now*, every device using power is drawn**, even 1 W of standby. To keep standby off the plan, set a minimum in the card editor's Energy settings: *Now: show devices from (W)*, e.g. 5 W.
- **A device at 0 W** (the dishwasher when it's off) has no chip and no line at *Now*. Drag the scrubber back to when it ran.
- **A device you haven't placed** shows in its room's chip. Without a room in Home Assistant, or when the room isn't marked on this plan, it's counted under *Not on this plan* in the summary.

The panel can show more than the devices together. A real house meter measures everything, including what no plug measures (lights, the oven, the fridge). The difference is your unmeasured use.

## Energy points

The flow lines start at your energy points: **Electrical panel**, **Solar** and **Battery**. Place them in the Floorplan Editor, step 3: they sit at the top of *Devices to place* until they're on the plan.

- When Home Assistant's Energy names a real meter, inverter or battery, you place that device (its own icon and name, like any device).
- Without one, you place a point you set (dashed, like phantoms). A real one added later can **Replace** it.
- Solar and Battery only show when Home Assistant's Energy has them.

The electrical panel shows Home Assistant's **grid** total (all grid meters together), or, without a grid meter, the total of the devices on the plan.

## Several meters in one board

Some boards have more than one meter: one per phase, or day and night. Add them all under **Grid** in Home Assistant's Energy settings. The Editor then lists all of them:

1. Place the first one: it's your **Electrical panel**.
2. Click **Bond to the panel** on each of the others. They sit together at the board as one marker.

The bond only seats the meters together. What counts as the house grid comes from Home Assistant's Energy settings (*Grid*), never from the bond, so the total is always Home Assistant's grid total. The meters stay full devices: their Wi-Fi or Zigbee in Network, their battery in Health, all their entities.

A meter for one circuit or one appliance (the oven line, an AC) belongs under **Individual devices**, not *Grid*. Otherwise it's counted twice: once in the total and once as a device. Home Assistant has the same rule.

## House meter, sub-meters and plugs

Many homes have a mix: one meter for the whole house, a sub-meter for some circuits (a floor, the kitchen), and a few metering plugs. Tell Home Assistant how they belong together: in the Energy settings, open a plug and set its **Upstream device** to the sub-meter it sits behind. Device Floorplan follows the same setting:

- **Plugs** show their own device's use. Their line runs into their sub-meter.
- **Sub-meters** show what they measured: their plugs plus everything on that circuit without a plug (lights, the oven…). Their line runs to the electrical panel.
- **The electrical panel** shows the whole house. With a real house meter, that's Home Assistant's grid total. With a point you set, it's the total of the top-level devices: each sub-meter counts once and its plugs aren't counted again.

Room shading and the totals under the plan count everything once, as Home Assistant does. If a plug's sub-meter isn't on this plan, the plug's line goes straight to the panel. Without *Upstream device*, a plug counts as its own top-level device.

