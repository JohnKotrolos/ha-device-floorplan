# Changelog

## 0.6.0 – first public release (beta)

Device Floorplan puts your Home Assistant devices on your own floorplan image and shows what's happening at home, live, on a dashboard card. Lights glowing in their room, night and day, air flow, people, interactive Zigbee map (ZHA): all set up with clicks, no coding.

**Floorplan Editor** (in the sidebar)

- Use the floorplan image you already have, an image from `config/www`, or one of seven sample plans.
- Three guided steps: **Measure** (optional), **Mark rooms** (drag your Home Assistant areas onto the plan, optionally draw a room shape), **Place devices** (Auto-place, click-to-place or drag).
- One plan per Home Assistant floor; export as CSV, JSON backup or PNG.
- **Bond** (several devices on one spot are one device), **Phantom** (one combined value from devices anywhere), **Split device** (each switch or light sits where it acts).
- Light shapes and colours, AC air flow, new devices placed next to their room automatically.

**Dashboard card**

- Overlays: **Plan · Live · Lights · Comfort · Security · Network · Health · People**, plus your own.
- **Live** shows what's happening right now: lights that are on glow in their real colour, things that are off stay hidden.
- One marker per device per overlay; choose what it shows (leading value, extra readings, badge, icon, tap) with **✎ Edit markers** right on the plan.
- **Day & night**: at night the plan darkens and lights glow, staying inside their room when it has a shape; by day, closed shutters darken their room.
- Several floors in one card, people in their rooms, cover controls, climate chips, an interactive Zigbee map (ZHA) in Network, and a companion chip card.

Best on PC (Editor) and tablets / wall panels (card); phones work but aren't optimised yet. Feedback welcome as [GitHub issues](https://github.com/JohnKotrolos/ha-device-floorplan/issues).
