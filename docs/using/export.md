# Export and import

Open the floor's **⋮ → Export…** (or *Export…* in the I'm ready summary).

![Export](/screens/export.webp){.shot}

| Format | Contains | Good for |
|---|---|---|
| **CSV** | One row per device: name, device id, area, plan, connection, type, manufacturer, model, x/y in % of the image, x/y in metres (if measured), status | Spreadsheets, inventory, network planning |
| **JSON backup** | The whole plan: settings, image (embedded), measurements, room pins, hidden rooms and positions | Backups, moving to a new Home Assistant |
| **PNG** | The plan with the devices drawn on it and a legend | Printing, handing over to an electrician or installer |

::: warning Share carefully
These files show your home's layout and where your devices, sensors and cameras are.
:::

## Import a backup

In **+ New plan**, choose **Import a plan from a file (.json)**. A new plan is created with the image, measurements, rooms and positions.

Devices are matched by device id, then Zigbee IEEE address, then MAC address, then exact name, so a backup also works on another Home Assistant installation. The message afterwards tells you how many devices were matched. Rooms are matched by area id or name.

If the original floor already has a plan, the import gets the next free level; change it in Floor settings.
