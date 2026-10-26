# Changelog

## 0.6.0

**Markers done right.** One device is one marker per overlay, you choose what it shows, and everything about markers is edited on the plan.

**Dashboard card**

- **One marker per device per overlay**: a presence sensor with many zones is one marker in Security (its other sensors in the popup).
- **Leading entity + Also show**: per overlay, which entity leads (icon, colour, on/off, tap) and any extra readings as small lines under it (*Printing · 1 h 20 min left · AMS 38 %*).
- **Marker Editor**: **✎ Edit markers** in the overlay button bar (dashboard edit mode, panel and masonry dashboards; saves right away), or **Edit card → Edit markers** (every dashboard). Pick an overlay, click a marker, change it for that overlay; ✕ on the selected marker hides it; the list shows *Hidden here* (↩ Show), *On this overlay* and *Not in this overlay* (+ Add in your own overlays). People are edited there too. The device list left the card editor.
- **One look per kind**: ACs and thermostats are a climate chip everywhere (compact in Live and your own overlays, full in Comfort); readings, batteries and round markers look the same in every overlay.
- **Custom overlays**: kinds in an order you choose; the first match leads, every other ticked kind becomes an extra line (batteries finally show). Or **Only devices I add**.
- **Light colours**: markers of lights that are on take the bulb's real colour; **Glow only** option for Live and custom overlays.
- **Lights stay in their room** when the room has a shape: overlapping shapes are one open space, a gap between shapes is a wall.
- **Shutters darken the room by day**: a shaped room gets darker the more of its shutters or blinds are closed (Day & night option, on by default).
- **Air flow for ACs**: while cooling or heating, air flows from the AC into the room (blue cool, orange heat), set in the Editor (direction, reach, spread); radiators get a warm glow while heating.
- Phantoms count ACs' and thermostats' own temperature and humidity.

**Floorplan Editor**

- **Room shapes** in Mark rooms (optional): four corners, + for more, snapping, Alt for free angles; lights stay inside.
- **Light colour** for plain lamps: Auto, a warm ↔ cool slider, or any colour.
- **Split spots**: each has its own light shape and colour and **Acts as** (light, switch, fan); a wall switch never turns into a lamp; a relay shown as a light in Home Assistant moves its spot automatically.
- **Phantoms**: choose which sensors of each member count.
- Ready popup: **Done**, and a hint to add a floor to an existing card.
- "The card uses only this entity" is gone: the card decides per overlay.

**Guide**: card reference (one marker rule, Edit markers, custom overlays), room shapes, light colours, split and phantom pages. Best on PC and tablets; phones work but aren't optimised yet.

## 0.5.1

**Names in the Editor, looks on the card.** The Floorplan Editor is the home (where things are, what belongs together); the dashboard card decides how each marker looks and what it shows.

**Floorplan Editor**

- **Split devices, generalised**: the device sits where its hardware is; each switchable entity (light, switch, cover, fan, climate) can get its own spot with **Place where it acts**. A wall panel with two relays is now three places. Dashed lines in the Editor, ✕ to bring an entity back. Old *box* spots are converted automatically, nothing moves.
- **No icons in the Editor**: icons are set on the card. Icons you set on bonds before are kept as the card's default.
- **What a marker shows moved to the card** (*The marker shows*, *The card uses only this entity* and the *Now:* line are gone from the device card; your old choices stay as the card's default).
- **Rooms**: all areas of the floor are listed, areas without devices under **Empty rooms**; **Create areas** and **How areas work ↗** when there are none. Room names are centred on their point everywhere (Mark rooms, Place devices, card); existing pins were moved once so names stay where you saw them.
- **Light shapes**: automatic only for lamps; anything else with a light (printer chamber, TV backlight) can opt in, starting at *None*, with a small 0.5 m spot.
- The open device or bond card **scrolls** inside the right column; automatic-bond rows are tidy (long names shortened, *Unbond* as a small button). *Includes its twin device* instead of a technical note with a MAC address.
- **Show / Hide guide** in one place, next to the step tabs.
- Search: an entity of a device says *part of this device · can sit where it acts*.

**Dashboard card**

- **Edit markers on the plan**: a **✎ Edit markers** button on the card while the dashboard is in edit mode (panel and masonry dashboards; saves straight to the dashboard), or **Edit markers on the plan** in the card editor (every dashboard). The card opens full-screen; click a marker: hide it in this overlay with one click, choose **what it shows** (per device or per overlay), icon, name, tap. The device list opens the same settings.
- **Reading chips** look like the climate chip's numbers: temperature large, *💧 humidity* small under it.
- **Phantoms look like any other marker or chip** in every overlay; no lines on the card, the popup lists the devices.
- **No ×N badge on bonds** on the card (it is one device); automatic bonds are listed as *Name (bonded)* in the card editor too.
- ACs without a humidity sensor no longer show *💧 0%*.
- Split devices: each entity shows in one place; Network and Health show the device; hover a relay for *Through ‹device› · Wi-Fi*.

**Chip card**

- **Bonds as a value**: *On*, *2 of 3 on*, or the average for sensors; tap can **switch the bond**.

**Guide**

- New section **Bonds, phantoms & split devices** with an overview and a page each, with examples. *Changed your mind? Get skipped devices back* on *3 · Place devices*.

## 0.5.0

**Bond · Phantom · Split device** – three ideas that make the plan fit real homes. See [Concepts](/together/).

- **Bonds of any kind, and deliberate**: drop a device onto another and it lands on the same spot; Device Floorplan then asks *Bond them – one device on the card* or *Keep separate – just the same spot* (no more hold-to-bond, it never bonds by itself). Same spot = grey count, click it for the list of devices there; bond = green ×N.
- **Bond card**: name (e.g. *Dining lights*), what the bond means on the card, members with their state, ✕ per member (it stays on the same spot), **Unbond all**, and under *More options* its icon, tap and what the marker shows (*2 of 3*). Hover shows the members one per line.
- **Parts are now automatic bonds** (*Bonded automatically*, **Unbond**; an unbonded device stays unbonded and keeps its spot).
- **Phantoms**: a combined value from devices anywhere (average temperature of a room, any window open, motion anywhere). Phantom button on the plan, drag placed devices onto it (they stay where they are), phantom card with *Combined devices* and *Value on the card* (average, lowest, highest, one device).
- **Split device**: the new name for *Box / radio is somewhere else*.
- **Light shapes**: every light gets a shape (bulb, spot, strip, panel, wall lamp, none) with handles on the plan; automatic bulb by default; **See it at night** preview (moon button); Layers → *Light shapes*.
- **Simpler device card**: the basics first, the rest under **More options ▾**; *Connected through…* for hubs and bridges; small **ⓘ** explanations (they hide with the guide).
- Approximate markers get an **amber glow**, visible on any ring colour. Layers menu: **Bonds**, **Phantoms**, **Light shapes**.
- JSON export / import now also carries split-device box spots, light shapes, bonds and phantoms.

**Dashboard card**

- **Several floors in one card**: floor tabs in the card editor, a **floor rail** right of the plan (never on top), swipe up / down, `floor:` in the action and `?floor=` in links.
- **Markers scale with the card**: no more huge markers in narrow columns or the editor preview.
- **Covers open their controls on tap**: open / stop / close and position; bonded covers each with *All*.
- **Climate chip v2**: *Cooling* / *Heating* / *Dry* / *Fan* / *Idle* / *Off* with the mode colour, *Set 24°*, room temperature large, humidity under it; condensed on narrow cards.
- **Network**: several connections at once, tap a role in the legend to hide it, **Refresh** with the update time (and every few minutes on its own), the **path** to the coordinator and **Connected devices** in the popup (also behind hubs and bridges).
- **Bonds and phantoms on the card**: bonds with their name and icon, combined values (lights *2/3*, sensors average / lowest / highest / one, lowest battery, offline if any); phantoms as an extra, inverted marker or chip with a popup of all their devices and a 24 h graph.
- **Day & night**: the plan darkens after sunset, gradually with the sun (warm dusk, soft blue dawn), or at fixed times, with the dark theme, always or never; lights that are on glow where they are, in their colour and brightness; per overlay, strength and style; quiet markers dimmed, active ones bright. **Light pools** in the Lights overlay also by day.
- **People**: each person at the room they are in, from up to two room sensors (Bermuda, ESPresense, template…), matched by area name, id or alias; low confidence faded; *Home* row for people at home in an unknown room.
- **Chip card** (`custom:device-floorplan-chip`): a chip for your top bar that switches the floorplan's overlay and **glows** while it shows; can show an entity's value or a phantom. See [Chip card](/reference/chip).

## 0.4.7 (beta-ready)

- **Typing in the card editor works everywhere**: text fields (title, card ID, overlay names, custom overlay and scene names, room names, device names) no longer lose focus while you type, so HA's keyboard shortcuts (e.g. Assist) don't pop up anymore.
- **Clearer card editor order**: General · Overlay buttons · Overlays (with Light scenes and Custom overlays) · Rooms · Look and tap behaviour · Devices on the plan. "Room names on the card" is now **Custom room names**.
- **Layers button moved off the plan**: it sits at the end of the overlay buttons (after a small divider), with its menu next to it; with the buttons hidden it's in the legend row under the plan. The legend explains the dashed line (*through hub / bridge*).
- **Links with `?overlay=` apply every time**, also when you tap the same chip twice; the address is cleaned up afterwards.
- **Lighter on wall tablets**: the card only redraws when something it shows changes (a power sensor ticking elsewhere no longer redraws the plan) and rests while the screen or tab is hidden.

## 0.4.6

- **Overlay buttons get their own section** in the card editor: below, above, left or right of the plan, or **hidden**, with icons and labels or icons only.
- **Switch overlays from other cards**: the new action `device_floorplan.show_overlay` (every screen showing the card), or a link with `?overlay=comfort`. Examples in the docs.
- **Markers on the plan** have their own setting (icon and text, or icon only), separate from the buttons.
- **New Lights overlay**: lamps glow when on, off lamps stay faint (or hidden), tap to switch, **All off** (asks first), **All on**, and your own **light scenes** (e.g. Movie night) defined in the card editor. Scenes stay in the card, nothing is created in Home Assistant.
- **Network overlay reworked**: every device shows only how it connects (Zigbee, Wi-Fi / LAN, Matter, Bluetooth, Z-Wave); colours and shapes show the role (coordinator, router, end device, hub, unavailable) and the ring the Zigbee link quality (from ZHA, no sensors needed). All Zigbee links coloured by LQI, dashed links to hubs and bridges (Matter bridges), legend, and a **Layers** button on the plan to switch connections and set a minimum LQI. Signal values only in the device's popup.
- **ACs and thermostats in Comfort** get their own chip: mode colour and icon, room temperature, target (*→ 24 °C*) or *Off*. Tapping opens HA's controls.
- Comfort chips no longer overlap when many are close; readings show at most one decimal (unless you set a precision in HA).
- **Rooms on the card**: room names from the Floorplan Editor, on the Plan overlay by default; text, chip or chip with icon, size, rename or hide per room.
- **Custom overlays**: your own buttons (e.g. *Downstairs*), showing the kinds of devices you pick plus single devices you add.
- **Device list in the card editor** shows on each row the overlays the device appears in; opening a device shows **Shows in** with a switch only for those overlays; filter the list by overlay.

## 0.4.5

- **New dashboard card.** The view is calm: your plan and one row of overlay buttons, **Plan · Live · Comfort · Security · Network · Health**.
  - **Live**: lights glow, motion pulses, open doors turn orange, thermostats show their temperature; closed doors and idle sensors stay small and faint.
  - **Comfort**: room temperature and humidity as calm chips; internal device temperatures left out.
  - **Security**, **Network** (signal per device, coloured; Zigbee links with ZHA) and **Health** (batteries, offline devices).
  - **Tap** a light or switch to switch it, a reading for a popup with the last 24 hours (temperature on top, humidity below); **hold** for the details.
  - Bonded lamps are one marker switched together; box / radio spots are used in Network and Health; helpers placed on their own appear too.
- **Card editor with everything adjustable**: overlay buttons (which, order, names, default), what each overlay shows, tap behaviour per kind, look (size, chip style, names, buttons), and per device its icon, name, tap action and the overlays it's hidden in.

## 0.4.4

- **Bond devices**: drag a light onto another and hold → one marker; on the card it switches them all together (*2 of 3 on*, hold to see each one). Lights, switches and covers. Nothing is created in Home Assistant.
- New **sidebar icon** (floorplan with pencil) and new **integration icon**.
- Climate and other appliances: cloud devices with a climate entity (e.g. hOn) are no longer treated as software; SmartIR and other device-less appliances with an area are listed like devices.
- *The marker shows* lists **all** entities of a device, grouped, with a filter box; "linked" only for entities from outside the device and gone when you switch back; *Now:* shows the current value.
- Filter chips show progress: *7 left*, or ✓ when everything of that kind is placed.
- Measuring: the second line starts with an estimate from the first; no more fake "3.40"; ✕ and Esc discard a line; saved lines can be edited while drawing; the length field is readable in dark mode.
- While searching, the plan follows the list (filters ignored); a device you just placed is never faded.
- Setup summary: just your physical devices and how many go on the list.

## 0.4.3

- After adding the integration: the setup screens and HA's "created" message say where to go (**Floorplan Editor** in the sidebar), and a notification links to it until the first plan exists.
- The sidebar entry is now called **Floorplan Editor**.
- **Search finds everything**: entity names and ids too; while searching, filters, skipped devices, hidden rooms and other floors are ignored.
- **Helpers and entities without a device** can be placed on their own (found by the search).
- **The marker shows → Other entity…**: any entity, also a helper; **The card uses only this entity**.
- **Box / radio is somewhere else**: an optional second spot for devices in two places (wall switch + ceiling lamp).
- **Parts**: printer + AMS, NAS + drives… become one device with one marker; *Show as its own device* to split.
- **Skip all from ‹integration›** in the device details.
- Each placed device exposes its `entities` and `roles` (temperature, humidity, battery, signal…) for the card.
- Zoomed in, dragging moves the plan in every step (Measure too); + / − zoom around what you're working on.
- Placing a device doesn't open its details any more: flash + "placed · Undo".
- Drag a marker (or room pin) back onto the list to take it off the plan; dropped elsewhere it snaps back.
- Filters: **All · None** in each filter, **✕** to clear one filter, Type before Connection everywhere.
- **▴** hides search and filters behind one summary line.
- "What should go on your plan?": *By type* first, then *By connection*; new **Other / cloud** connection (cloud integrations, wired buses, RF were always skipped before); *Wi-Fi / Ethernet*; the summary starts from your physical devices.
- New device type **Computers & servers** (NAS, printers, UPS…).
- Sticky **Create plan** / **Continue** button in long dialogs.
- Tip: positions matter, looks can be adjusted in the card.

## 0.4.2

- The plan is always centred and fully visible, in every step and whether the guide is shown or not; the legend stays below it.
- Mouse-wheel / trackpad zoom removed: use − / + / Fit, drag to move when zoomed in.
- The guide text no longer collapses on small screens.
- A new plan starts at step 1, Measure.
- Intro: step 3 mentions dragging from the list; a tip links to the built-in guide "Turn your sketch into a floorplan".
- "Try a sample plan" shows the samples first and has **← Back to the intro**; nothing is chosen for you.
- Dragging a room drags a small pin whose tip lands exactly under the pointer.
- The eye on rooms shows the current state (open = visible, crossed = hidden).
- Device list: green "✓ on plan" and amber "◌ approx" pills; placed rows dimmed.
- Devices outside the current filter stay on the plan, faded (Layers → Devices outside the filter).
- I'm ready: our own green tick, "add, move or remove" text; when the plan is already on a dashboard it says "up to date", shows what changed and offers "+ Add to another dashboard".
- Live view: LIVE badge, new text, ← Back.
- Add to dashboard: ← Back, a clear "Added" confirmation with Open dashboard; new views are titled with the floor name (no icon).
- New plans get short entity ids (`image.device_floorplan_<plan>`); existing ids are kept.
- Version shown next to the title and in the ⋮ menu.

## 0.4.1

- Integration icon (shown in Home Assistant 2026.3 and newer).
- Adding the integration no longer opens Home Assistant's "Name and assign" dialog for the plan devices; they are attached from the next restart.
- When plans from an earlier installation exist, setup says so and offers **Start fresh**. The setup text explains where to create the first plan.

## 0.4.0

- Welcome intro; create the plan first, then choose device kinds (no counts on the chips, clearer selected style).
- New image chooser: drop zone with preview, images already in Home Assistant (linked, with a backup copy), seven sample plans. The image type is asked after the image.
- Fixed: *Upload image* on a plan without an image did nothing.
- The editor always fits the window; zoom, scale and Layers sit on the plan.
- Layers: the current step in full, the others faded and not clickable; Layers menu.
- Editable measurements: drag the ends, move, change the length, delete; Measurements list; "replaced · Undo".
- Hidden rooms stored in Home Assistant; their devices leave the list and counts; asks what to do with devices already placed.
- Floor ⋮ menu (settings, rename, replace image, export, move, delete) and app ⋮ menu (intro, guide, choose devices again).
- **I'm ready** summary, live preview and **Add to dashboard** (new view, existing view or new dashboard).
- Dashboard card `custom:device-floorplan-card`.
- A device per plan with image and sensor entities.
- Export CSV / JSON / PNG; import JSON.
- Integration logos in the device list.
- Markers for devices removed from Home Assistant (remove or replace).
- Plan images are only shown to logged-in users.

## 0.3.0

First release as Device Floorplan: guided steps, floors, skipped devices, approximate positions, auto-save, undo/redo, new-device notifications.
