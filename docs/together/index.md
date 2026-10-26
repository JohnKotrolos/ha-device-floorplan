# Bonds, phantoms & split devices

Real homes don't map one-to-one onto Home Assistant devices. Three Device Floorplan features fix that, and one question tells you which one you need: **where does the thing sit?**

| It is… | Use | Example |
|---|---|---|
| **Several devices on one spot** that are really one thing | [Bond](/together/bonds) | Three bulbs in one ceiling fixture |
| **One answer from devices anywhere**, with no spot of its own | [Phantom](/together/phantoms) | "Any window open?", the average of two thermometers |
| **One device acting in two places** | [Split device](/together/split) | A relay behind the wall switch that powers the ceiling lamp |

All three live in the **Floorplan Editor** and exist only in Device Floorplan: nothing is created or changed in Home Assistant, and the devices' entities stay normal entities that any other card can use.

## Names in the Editor, looks on the card

**The Floorplan Editor decides what is true about your home. The card decides how a dashboard shows it.**

| Floorplan Editor (once, for every card) | Dashboard card (per card) |
|---|---|
| Where devices are, which belong together, phantoms, split spots, light shapes, room pins, names of bonds and phantoms | Overlays, buttons, icons, what each marker shows, taps, how combined values are shown, people |

So icons are never set in the Editor: change them on the card, where the wallpanel and the phone can even differ. See [Edit markers on the plan](/reference/card#edit-markers-on-the-plan).

## Finding them in the Editor

The **Layers** menu on the plan has **Bonds** and **Phantoms**, to show or hide them like rooms and measurements. The small **ⓘ** next to *Bond*, *Phantom* and *Split device* in the device cards opens a short explanation (they hide together with the step-by-step guide).
