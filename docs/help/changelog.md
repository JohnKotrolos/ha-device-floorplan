# Changelog

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
