# Entities and attributes

## One device per plan

Every plan is a device in **Settings → Devices** (for example *Ground floor plan*). It holds two entities and is removed together with the plan.

| Entity | What it is |
|---|---|
| `image.device_floorplan_<plan>` | The plan picture. Usable in any card that shows an image entity. Plans created before 0.4.2 keep their existing id. |
| `sensor.device_floorplan_<plan>` | State: number of devices and entities on the plan. Attributes: everything about the plan (below). |

The device's link opens the planner.

## Sensor attributes

The attributes are kept out of the history database, so large plans don't fill your recorder.

| Attribute | Description |
|---|---|
| `plan_id`, `plan_name` | Id and name of the plan |
| `kind`, `floor_id`, `level` | `floor` or `view`, linked HA floor, level |
| `image_type` | `top` or `angled` |
| `image_url`, `image_fallback_url` | Image URL (needs a login, see [Privacy](/reference/privacy)); backup copy for linked images |
| `image_width`, `image_height` | Image size in pixels |
| `metres_per_px_x`, `metres_per_px_y` | Scale, when measured |
| `real_width_m`, `real_height_m` | Size of the whole image in metres |
| `approx_count` | Devices still approximate |
| `devices` | `{device_id: {name, area_id, x, y, px, py, approx, z?, ieee?, mac?, main_entity, entities, roles, conns, group, box?, parts?, only_main?}}` with `x`/`y` in % of the image and `px`/`py` in pixels (details below) |
| `entities` | Entities without a device placed on their own: `{entity_id: {name, x, y, px, py, approx, main_entity, entities, roles}}` |
| `bonds` | Bonded devices: `{bond_id: {members, names, entities, domain, x, y, px, py}}`; each member in `devices` also has `bond: <bond_id>` |
| `zigbee_devices` | `{ieee: {x, y, name}}`, the format of the Zigbee Floorplan Card |
| `areas` | Room pins: `{area_id: {name, x, y, px, py}}` |

### Devices and their entities

All entities of a device share its position. The card (or your own template) picks what it needs:

```yaml
<device_id>:
  x: 30.5
  y: 22.0                       # where the device does its job – all its entities inherit this
  box: {x: 12.0, y: 40.0}       # optional: separate spot of the box / radio
  main_entity: light.coffee_table
  entities: [light.coffee_table, sensor.living_room_lights_power, sensor.living_room_lights_linkquality]
  roles: {power: sensor.living_room_lights_power, signal: sensor.living_room_lights_linkquality}
```

- `entities`: the device's enabled entities (and those of its parts), main entity first when it was chosen as *Other entity…*. With *The card uses only this entity* it is just `[main_entity]` and `only_main: true`.
- `roles`: the first entity per role (`temperature`, `humidity`, `battery`, `signal`, `power`, `energy`, `illuminance`, `co2`, `pm25`), so overlays don't need to search.
- `box`: only for devices in two places; `zigbee_devices` uses it as the radio's position.
- `parts`: names of the parts merged into this device (printer + AMS, NAS + drives).

### Example template

```jinja
{% set plan = state_attr('sensor.device_floorplan_ground_floor', 'devices') %}
{{ plan.values() | selectattr('approx') | map(attribute='name') | list }}
```

## New devices sensor

`sensor.device_floorplan_new_devices`: how many devices were added since setup and are still waiting to be placed or skipped. The `devices` attribute lists their names.
