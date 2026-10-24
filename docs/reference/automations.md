# Actions, events and blueprint

## Action: `device_floorplan.get_positions`

Returns the devices, room pins and scale of one plan (the same content as the plan's sensor attributes).

```yaml
action: device_floorplan.get_positions
data:
  plan: ground_floor      # plan id or name
response_variable: plan
```

Example: notify which devices are still approximate.

```yaml
- action: device_floorplan.get_positions
  data:
    plan: ground_floor
  response_variable: plan
- action: notify.mobile_app_my_phone
  data:
    message: >
      Still approximate:
      {{ plan.devices.values() | selectattr('approx') | map(attribute='name') | join(', ') }}
```

## Action: `device_floorplan.show_overlay`

Switches every [dashboard card](card.md) with this **Card ID** to an overlay, on every screen showing it.

```yaml
action: device_floorplan.show_overlay
data:
  card_id: hall          # the Card ID set in the card editor
  overlay: security      # plan, live, lights, comfort, security, network, health, custom1…, or reset
```

See [Switch the overlay from other cards](card.md#switch-the-overlay-from-other-cards) for buttons and chips.

## Event: `device_floorplan_new_device`

Fired for every new physical device, after a short wait (pairing often adds several devices, and the area is often set a moment later).

| Field | Description |
|---|---|
| `device_id`, `name` | The new device |
| `area_id`, `area_name` | Its area, if any |
| `plan_id` | Plan it was auto-placed on, or `null` |
| `auto_placed` | `true` if it was placed next to its room automatically |

```yaml
triggers:
  - trigger: event
    event_type: device_floorplan_new_device
actions:
  - action: notify.mobile_app_my_phone
    data:
      message: "New device {{ trigger.event.data.name }} – place it on the floorplan"
```

## Blueprint

The repository includes `blueprints/automation/device_floorplan/notify_new_device.yaml`: **Notify my phone when a new device needs placing**. Import it in **Settings → Automations & scenes → Blueprints**.
