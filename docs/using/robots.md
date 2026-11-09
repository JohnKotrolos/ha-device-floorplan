# Robot vacuums

Device Floorplan shows your robot vacuum on the plan while it cleans, draws its path, and remembers when each room was cleaned. The **Cleaning** overlay shows all of it.

## What you need

- A robot vacuum in Home Assistant (any `vacuum` entity).
- For the live position and path: a **map integration** that reports where the robot is, for example Xiaomi Cloud Map Extractor, Dreame Vacuum, Roborock Custom Map or AnyVac. **Valetudo** robots work out of the box over MQTT: Device Floorplan finds Valetudo's map camera and makes a map sensor for it (`sensor.<camera>_floorplan`) on the robot's device.
- Rooms with a shape on your plan (step 2 · Mark rooms).

A robot without a map works too: place it on the plan like any device. The card shows it there (that spot is its dock), and rooms you start from the card count as cleaned when it docks.

## Line the robot's map up with your plan

In the Floorplan Editor, open the plan's ⋮ menu → **Robot vacuum…**, then **+ Add a robot…**.

1. **Map of …**: the map entity of the robot. The one on the robot's own device is suggested first.
2. **Auto-align from rooms**: matches the robot's rooms with your Rooms by name, or by Home Assistant's room mapping (**Map vacuum segments to areas** in the robot's settings, Home Assistant 2026.3+). The robot's room numbers are shown next to their names.
3. Fine-tune by hand: drag the map, drag the sides of its frame to stretch or squeeze it, drag a corner to resize it, turn it or mirror it. **⤢ Fit to plan** brings a map that is far too big or small back inside your plan. The **Map picture** slider shows the robot's own map underneath.
4. **How often to clean**: one pace for all rooms (default every 7 days) and, where it differs, per room, or *Never due*.
5. **Save**.

The robot's own map is never changed: this only tells the card where to put the robot on your plan. A robot that cleans several floors is aligned on each plan; the card shows it on the floor whose map it is using.

## The Cleaning overlay

- **The robot** at its live position, with its direction; its dock. The marker's colour is its state (cleaning, returning, paused, error, docked). With two or more robots on a floor each robot has its own colour (marker, path and buttons).
- **Path of the last run** (a layer).
- **Last cleaned** (a layer): rooms in **green** right after cleaning, fading out; **amber** when they are due again; **blue** while a robot is cleaning them, with *cleaning · 40%*. A legend under the plan explains the colours, with a strength slider (the card's default strength is under *Overlays → Cleaning* in the card editor).
- **Robot buttons** under the plan: Start / Pause / Continue / Dock (option: off), plus your own [overlay actions](/reference/card#overlay-actions).
- **Tap the robot**: battery, last cleaning, settings (suction, water, mode), consumables (low ones highlighted), dock and station problems, and the buttons.
- **Tap a room**: when it was cleaned and by which robot, how much of it (m² and %), how often in the last 7 days, how long it usually takes, when it is due, and **Clean now** (Home Assistant 2026.3+, with the room mapping).

## When does a room count as cleaned?

While the robot is in a room, the room shows its progress. When the run ends (the robot is back at its dock), a room counts as cleaned only if the robot did **at least 60%** of it; a quick pass on the way to another room keeps the room's last real cleaning.

- **How much was cleaned** comes from the robot's own "cleaned area" sensor, else from its path (length inside the room × the brush width).
- **How big the room is** for the robot: its own room size when the map reports one (Valetudo does), else what it usually cleans there (learned from earlier runs, slowly adjusting when furniture moves).

Everything is stored in Home Assistant, not in the browser.

## Automations

The plan's sensor has a `due` attribute: the rooms that are due. See [Actions, events and blueprint](/reference/automations#clean-what-is-due).
