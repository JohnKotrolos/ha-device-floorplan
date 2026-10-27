# Changelog

## 0.7.1

- **Softer shutter shading**: a room with closed shutters is less dark (about half at most, a little lighter again when it's open to another room), and where it's one open space with the next room (overlapping shapes) the shade fades smoothly across instead of stopping at a hard line. Real walls stay crisp.

## 0.7.0

**Doors, windows and shutters on the plan.** Draw where an opening is, and the card shows it as a bar: light blue while a door or window is open, a white outlined bar for an open shutter, filled as far as an electric shutter is closed. Closed shutters darken their room by day, now also manual ones with a contact sensor. [How it works](/using/openings)

- **Night look**: with a shape for every room, only the inside of the home darkens; walls and the outside keep their colour. Follow the sun now stays in daylight until sunset; the warm dusk tint is an option.
- **Live**: shutters show only while they move.
- **Backup (JSON)** now also keeps room shapes, split spots, *Acts as*, air flow and openings.
- **Fixes**: ACs with many feature switches (Haier, Midea, Tuya…) now pick the climate entity as their main one, so Live shows their climate chip; the chip card's phantom value counts like the card (*5 of 9 on*); Browser Mod sessions are no longer offered as new devices; card-mod styles on the floorplan card survive overlay switches.
- **Guide**: requirements by feature (Install page), doors, windows and shutters.

## 0.6.0 – first public release (beta)

Device Floorplan puts your Home Assistant devices on your own floorplan image and shows what's happening at home, live, on a dashboard card. Lights glowing in their room, night and day, air flow, people, interactive Zigbee map (ZHA): all set up with clicks, no coding.

**Floorplan Editor** (in the sidebar)

- Use the floorplan image you already have, an image from `config/www`, or one of seven sample plans.
- Three guided steps: **Measure** (optional), **Mark rooms** (drag your Home Assistant areas onto the plan, optionally draw a room shape), **Place devices** (Auto-place, click-to-place or drag).
- One plan per Home Assistant floor; export as CSV, JSON backup or PNG.
- **Bond** (several devices on one spot are one device), **Phantom** (one combined value from devices anywhere), **Split device** (each switch or light sits where it acts); no helpers or template sensors to create, nothing changes in Home Assistant.
- Light shapes and colours, AC air flow, new devices placed next to their room automatically.

**Dashboard card**

- Overlays: **Plan · Live · Lights · Comfort · Security · Network · Health · People**, plus your own.
- **Live** shows what's happening right now: lights that are on glow in their real colour, things that are off stay hidden.
- One marker per device per overlay; choose what it shows (leading value, extra readings, badge, icon, tap) with **✎ Edit markers** right on the plan.
- **Day & night**: at night the plan darkens and lights glow, staying inside their room when it has a shape; by day, closed shutters darken their room.
- Several floors in one card, people in their rooms, cover controls, climate chips, an interactive Zigbee map (ZHA) in Network, and a companion chip card.

Best on PC (Editor) and tablets / wall panels (card); phones work but aren't optimised yet. Feedback welcome as [GitHub issues](https://github.com/JohnKotrolos/ha-device-floorplan/issues).
