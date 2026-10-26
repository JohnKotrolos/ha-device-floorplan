# FAQ and troubleshooting

## I don't have a floorplan

Draw one with a pencil and turn it into a clean plan: [Turn your sketch into a floorplan in 10 minutes](/images/sketch). Or start with a [sample plan](/images/samples) and replace it later.

## A device is missing from the list

Type its name, or the entity id of one of its entities, in the search: the search finds every device, also skipped ones, devices in hidden rooms and on other floors, and entities without a device.

- It may be **skipped**: set the Status filter to *Skipped* and press **Add to plan** in its details, or use **⋮ → Choose devices again…** to bring back whole categories. See [Get skipped devices back](/using/devices#changed-your-mind-get-skipped-devices-back).
- Its area is on **another floor**: tick *Devices from all floors*.
- Its **room is hidden** on this plan: look in the *Hidden rooms* group at the bottom of the list.
- **Disabled** devices are never listed, and devices "connected via" another device without entities of their own are merged into that device.
- Reopen *What should go on your plan?* with **⋮ → Choose devices again…**.

## My printer / NAS shows up as one device

That's on purpose: its AMS, drives and the like are [bonded automatically](/together/bonds) (green ×N). Use **Unbond** in its card if one of them really stands somewhere else; it stays unbonded.

## I dropped a device on another one and now there's a question

Device Floorplan asks whether they are one thing (**Bond them**: one marker on the card, switched together) or just on the same spot (**Keep separate**). It never bonds by itself. See [Same spot or bond?](/using/devices#same-spot-or-bond)

## The plan gets dark in the evening

That's the card's **Day & night** look: it follows the sun by default and only in Plan, Live, Lights and People. Change it or turn it off in the card editor → **Day & night**. Without the Sun integration the fixed times (20:00–07:00) are used; add **Sun** under *Settings → Devices & services → Add integration* for a gradual change.

## A person isn't shown on the card

People appear only when they are **home** and their room sensor reports a room that has a pin on the plan (by name, area id or alias). At home without a known room they are in the **Home** row under the plan; away they are not shown. Check the room sensor's state in *Developer tools → States*.

## My air conditioners (SmartIR) or cloud appliances are missing

Entities without a device that are real appliances (climate, light, cover, fan…) are listed when they have an area: give them one in Home Assistant (entity settings → Area). Cloud appliances without a network address (e.g. hOn) count as *Other / cloud* under connection. You can always find anything by name or entity id in the search.

## Can I put a helper on the plan?

Yes. Search for it: helpers and templates without a device appear under *Entities without a device*; drag one onto the plan. Or, if it belongs to a device that is already on the plan, choose it there under *The marker shows → Other entity…*.

## Auto-place does nothing

Auto-place only places devices that are shown in the list, not yet placed, and whose room has a pin. Mark the rooms first (step 2), and check your filters.

## The card shows "Plan not found"

The `plan:` (or each entry of `plans:`) in the card must be the plan id (e.g. `ground_floor`), not the name. You find it in the sensor's `plan_id` attribute, or pick the floors in the card editor.

## The card says "Custom element doesn't exist"

Refresh the browser (the card is loaded when Home Assistant starts). If it persists, restart Home Assistant after updating the integration.

## "The original image was not found"

The plan is linked to an image in `config/www` that was moved or deleted. The backup copy is shown. Choose the image again with **⋮ → Replace image**.

## My Overview dashboard can't be used

When Home Assistant still generates your Overview automatically, cards can't be added to it. **Add to dashboard** then creates a new *Floorplan* dashboard. Or take control of your Overview first.

## Another card uses the plan's `image_url` and shows no picture

Plan images need a login since version 0.4. Point the other card at the plan's image entity (`image.device_floorplan_<plan>`), or at a copy of the image in `config/www` (`/local/…`).

## Measurements disagree

See [Horizontal and vertical disagree](/using/measure#horizontal-and-vertical-disagree).

## Something else

Open an issue on GitHub with your Home Assistant version, the Device Floorplan version and what you expected to happen. Screenshots help a lot.


## Does it work on phones?

Best on PC (the Floorplan Editor and card editing) and tablets or wall panels (the card). Phones work but aren't optimised yet.


## My wireless button doesn't show in Live

Buttons and remotes only send events to Home Assistant (an automation does the switching), so they have nothing to show in Live. They appear in **Network** and **Health** (battery). Place them where they are, and the lights they control where the lights are. See [Buttons and remotes](/together/split#buttons-and-remotes-are-not-split-devices).
