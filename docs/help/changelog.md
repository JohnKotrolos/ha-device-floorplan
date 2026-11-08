# Changelog

## 0.9.1

- **Contrast background for the Overlay Bar and Side Rail**: dark on a light theme, light on a dark theme, switching with Home Assistant's light / dark mode. The Side Rail's default; *Dark* stays available.

## 0.9.0

**A tidier Floorplan Editor, Rooms that meet on one line, one frame for the whole house, the Overlay Bar with shortcuts and the Side Rail, and ZHA groups as bonds.**

- **Editor layout**: the top row (with the Device Floorplan icon) runs the full width; the steps, guide and plan sit on the left; the right column starts right under the top row.
- **Selected device in its own card** at the top of the right column; *Devices to place* below it. It closes with ✕ or when you click an empty spot on the plan.
- **Groups start collapsed** (Room, Type, Connection), also after changing the grouping. They open while you search, when there is only one group, or when you open one.
- **✨ Auto-place** sits right next to the *Place devices* step (when there is something to place); **Type**, **Connection** and **Status** are bold.
- **Snap to wall**: the marker's centre moves onto the nearest edge of its Room (it stays on the wall line at every zoom); devices stacked on the same spot move together. A one-time move.
- **Glue Rooms together** ends step 2: draw Room shapes roughly, overlap where Rooms are open to each other, leave a gap for walls. While overlaps are left, the top bar shows **Glue Rooms · N overlaps** and *Place devices* waits. Overlapping Rooms then meet on one line (an edge the overlap covers completely moves onto the other Room's edge, otherwise both meet in the middle); gaps stay walls. Check the result, then *Looks good* or *Undo*; the right column lists what changes.
- **Frame the plan** (after adding an image, or the plan's ⋮ menu): drag four lines to add space around the plan or trim its margin; markers and Rooms never move. Cards use it, or set their own (**Frame and preview** in the card editor).
- **Float over the plan**: the overlay buttons can float over the plan (see-through bar or buttons only) instead of reserving space.
- **Preview** in the card editor: the whole card at a real screen size (wall panel, tablet, desktop, phone or custom).
- **Devices to place** explains the search and the Type / Connection / Status filters; the selected device card has one clean frame; line icons on the buttons.
- **Transparent background**: the image dialog recommends a plan with a transparent background, and says so when an uploaded image has a solid one.
- **ZHA groups** (devices since Home Assistant 2026.11): never on the Network map (no radio of their own); in the Editor a group's card lists its devices and offers **Bond them as one marker**.
- **Appliance progress**: washers and dryers with a progress sensor in % (Midea, SmartThings) show "45% done" when there is no time-left sensor.
- **Drag a wall of a Room shape**: grab an edge (not only a corner) and drag it; it moves straight out or in and its neighbouring edges stretch or shrink.
- **Glue highlights**: overlaps show as orange stripes on the plan (they pulse when you point at *Glue Rooms · N overlaps*); click a pair in the right column to centre the plan on it. After gluing, the moved edges light up green for a moment.
- **One frame for the whole house**: *Frame the plan* on the first floor frames the house. Later floors get no frame dialog: they take the same outer size, and once measured the same scale (1 m is just as long on every floor). **Align with …** shows the first floor faint underneath so you drag the picture into place (skipping keeps it centred); this also puts the network's other-floor markers in the right spot. A later floor that is larger grows the house frame for all floors.
- **Measure per direction**: horizontal and vertical scale are matched separately; when they differ by more than 5% the Measure step warns that the picture may be stretched.
- **The plan fits the card**: in a card with a fixed height (panel, sections grid, wall panels) the plan takes the free space left by title, buttons and legend, never stretched. Masonry cards are unchanged.
- **People overlay removed**: people show in **Live** (and in any overlay picked under *Also show people in*). Cards that opened on People open on Live.
- **Overlay Bar Reloaded**: the buttons sit in **one bar exactly as long as the plan with its frame**, right next to it; what doesn't fit scrolls, with a small chevron at the end. **Bar background** (theme, dark, transparent) and **buttons** (Pill, Tiles, Circles; S / M / L) are separate settings. A faint line separates card overlays, your own overlays and shortcuts. **Hold actions** on overlay buttons (any Home Assistant action, *Reload this page*, *Back to where you were*); **shortcuts** with tap and hold (pages, links, actions, a **browser_mod popup on this browser only**). A **status** on the icon that never changes the button's size: icon colour or dot with up to three rules (printing → green, error → red), or a badge (a count or a short value). **Automatic status** for Lights, Security, Health and Network is one switch, off by default.
- **Side Rail**: the Overlay Bar as a full-height strip at the card's left or right edge, plain icon buttons, dark by default. The editor calls it all the **Overlay Bar** now (where it is, its space, its background).
- **Plan at the top**: in a fixed-height card (also inside a stack or layout that sets the card's height) the plan sits at the top and the bar right next to it; the space left goes below (option: centred).

## 0.8.1

**Floors without losing space, overlays for the whole house, and a comfort colour for every room.**

- **Floor button**: the floor switch is now a round button right next to **Layers**, on its right, never on the plan, with the floor's level from Home Assistant as a small badge (0, 1, -1…). Tap it and a slim floor rail (▲ · floors · ▼) opens towards the plan; pick a floor and it folds back. The plan keeps its full width.
- **Card editor in two parts**: **Per floor**, framed with the floor tabs: the floor's **Markers** and **Rooms on this floor** (custom names, hidden Rooms). Then **Card settings (the whole house, all floors)**: overlays, Rooms look, People, Day & night, Look and tap. *Edit markers* opens on the floor you picked.
- **Network across floors**: a device whose router, coordinator, access point or hub is on another floor shows that device faded at its spot, with a normal line; hover it for its name and floor.
- **Network legend**: smaller and grouped, and it shows only what's drawn (no Wi-Fi or hub entries while only Zigbee is shown). Tap an LQI range (0–99, 100–149…) to hide or show its Zigbee links, like the roles. The Minimum LQI slider and the *Show* section are gone from the Layers menu; a long Layers menu now scrolls.
- **Comfort heatmap**: rooms are open to each other where their shapes touch or overlap (also a thin overlap), and a room without a thermometer (a hallway) gets a gradient from the rooms it opens into, also step by step, slightly faded as an estimate.
- **Appliances**: *Done* clears by itself after 30 minutes (per appliance: 30 min, 1 hour, or only when unloaded); hovering a drum, line or label shows "name · state · time".
- **Device before room**: the AC air flow can be tapped (details) and held, and hover names it; room-wide layers (the motion pulse) sit below the devices.
- **Bond names**: an unnamed bond has the same name on the card as in the Floorplan Editor ("Kitchen Spot ×3", else the first member).
- **Home Assistant 2026.11**:
  - **Child devices** (one outlet of a power strip, one channel of a switch) are part of their parent's marker; give a child a Room of its own in Home Assistant and it becomes its own marker (you can still choose per device).
  - **Main entity of the device**: the entity you mark as the device's main entity in Home Assistant leads its marker automatically.
  - **Green Power** battery-free Zigbee switches show as their own role in Network, without lines.
  - Names: friendly names are on their way out; the card and the Editor now take names from one place that falls back to device + entity name.
  - Install from the **Marketplace** (it replaced HACS): guide and README updated.
- **Edit markers**: works on the values from when it opened (nothing redraws while you edit); *Also show* starts from what the marker shows now, so adding a reading keeps the others. On the dashboard, the info card stays put while its values update.

## 0.8.0

**Comfort heatmap, appliances and a card that tells you more with a tap.**

- **Comfort heatmap**: every room with a shape is coloured from the temperatures on the plan (cool to warm), estimated between sensors, with a legend and a strength slider. Layers in Comfort: room names, heatmap, temperature labels, **climate devices** and AC air flow.
- **A room thermometer beats a built-in sensor**: an AC or thermostat bonded with a thermometer shows the room's temperature and humidity on its chip and in the heatmap. A unit's own (wrong) reading can be left out everywhere (*Count this unit's own temperature*).
- **Appliances** (washer, dryer, dishwasher): draw a drum or a line in the Editor and Live shows what the machine does (water, heat, spin, finished, error). Its label shows for a few minutes after a change, or *Always* / *Never*; **finished stays** ("Done · tap to unload", amber) until you tap *Unloaded*. The label and card follow *Leads in Live*.
- **Info card**: a tap on a bond, phantom or appliance opens a small card next to it: its state, the readings you picked under *Also show* (or all its members), buttons (Unloaded, press buttons, on/off for lamp groups) and *Open ›* for Home Assistant's details. Single devices keep their own tap action; a long press opens the details. Configuration and diagnostic entities are never listed or switched.
- **Hover and explore**: one tooltip for everything on the plan, "name · state". On a touch screen: hold, then slide your finger.
- **AC air flow from the real unit**: draw the AC as a line along the wall (two handles) and set its reach; the air leaves it as a trapezoid with the moving arcs. Auto / Heat-Cool have their own colour unless the unit reports what it's doing. In Live an AC shows only its air flow (temperatures are in Comfort).
- **TV glow**: a TV that is on lights the room from its screen line.
- **Layers for viewers**: each overlay's layers are switched by whoever looks at the card (kept in that browser). The Plan overlay is gone: room names are a layer in every overlay. The Layers button shares the row or column of the overlay buttons when it sits on their side; the overlay buttons use at most ~70% and scroll inside.
- **Edit markers**: devices in alphabetical order, settings open under the row you clicked, the selected marker is always drawn (faded when hidden here), its info card shows as a live preview, and choosing what leads takes it out of *Also show*.
- **Floorplan Editor**: trackpad pinch / Ctrl-⌘ + wheel zooms at the pointer, two-finger swipe pans, arrow keys pan (Shift = bigger steps), + / − zoom, 0 fits. Automatic bonds can get their own name on the plan.
- **Chip card**: tap and hold actions, icon glow while something is on, short value style ("3 on").
- **Fixes**: shutters as a white bar for the closed part; no "Nothing to show" text on an empty overlay; the plan image no longer blinks on updates.

## 0.7.3

- **Room pulse**: motion in a room with a shape shows as a soft breathing outline of the room (presence stays steady, it fades out after motion ends); open-plan neighbours stay clear. Card option *Live → Motion as*: pulse, icons or both.
- **Move whole shapes and bars**: in the Floorplan Editor, press and hold inside a room shape or the middle of a bar to move it as a whole.
- **Combine into one bar**: a shutter and a window contact of the same window can share one bar, driven by the shutter. Shutter closed but the contact open? The bar pulses orange-red.
- **Wi-Fi / LAN map**: with router device tracking (FRITZ!Box and others that report the access point), Network draws each device's link to its router or repeater, solid for cable, dotted for Wi-Fi, a colour per access point, with a count per access point in the legend and the details in the popup.
- **Network layers**: only the options that apply to the connections shown (no Zigbee links, LQI or Refresh with only Wi-Fi / LAN).
- **Card editor**: a switch to hide the *N new · Place them* button.
- **"On this spot" list** opens upwards near the bottom of the plan and stays inside it.
- **Markers near the edge**: extra lines, values and names of a marker close to the bottom, top or sides of the plan now open towards the inside, so they're no longer cut off.

## 0.7.2

- **Daylight that spreads**: closed shutters darken their room, and the rooms next to it too. Windows always let light in, shutters by how far they're open, doors don't count; a corridor or entrance without windows takes the average of the rooms it touches. Light passes where room shapes touch or overlap, never through a gap (a wall). One even layer: no extra darkness where shapes overlap, soft between rooms, crisp at walls.
- **Two sensors, one bar**: put a window sensor and a shutter on the same spot and draw the bar once; the other gets a twin bar beside it, same length, moving with it. **Switch side**, **Next to…** for sensors in different places, and bar ends snap to each other.

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
