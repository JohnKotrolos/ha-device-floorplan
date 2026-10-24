# Floors and plans

Each plan is one picture: usually a floor of your home, or a free **view** (garden, a single room, a network overview).

## Plan types

| This plan is | Level | Devices offered |
|---|---|---|
| A Home Assistant floor | Follows the floor's level in HA | Devices whose area is on that floor |
| A floor, by level number | The number you choose | All devices |
| Not a floor (a view) | – | All devices; a device can also be on other plans |

A device can be on **one floor plan** at a time. If you place it on another floor, *Move to this floor* moves it. Views allow duplicates.

## The floor menu

The **⋮** inside a floor tab (always visible on the selected tab, on hover for the others):

![The floor menu](/screens/floor-menu.webp){.shot}

- **Floor settings**: name, what the plan is, image type, image, and the guide.
- **Rename**.
- **Replace image**: a new picture keeps all positions (they are stored as percentages of the image).
- **Export…**: CSV, JSON backup or PNG. See [Export and import](/using/export).
- **Move left / right**: for views. Floors are ordered by level.
- **Delete…**: removes the plan, its image and its positions, plus its device and entities in Home Assistant. Your devices themselves are not touched.

A small dot on a tab means that floor has new devices waiting.

## The app menu

The **⋮** on the far right of the header: **Show intro**, **Show/Hide step-by-step guide**, and **Choose devices again…** (reopens *What should go on your plan?*).
