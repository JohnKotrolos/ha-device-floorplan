# What is Device Floorplan?

Device Floorplan is a Home Assistant integration that puts your devices on **your own floorplan image**. It adds a planner to the sidebar where you place devices, and a dashboard card that shows them live.

![The Device Floorplan welcome screen](/screens/intro.webp){.shot}

## How it works

<div class="steps-grid">
  <figure><img src="/screens/create-plan.webp" alt=""><figcaption><b>01</b>Add your plan: upload a picture, pick one already in HA, or start from a sample.</figcaption></figure>
  <figure><img src="/screens/choose-devices.webp" alt=""><figcaption><b>02</b>Choose which kinds of devices belong on the plan. The usual ones are preselected.</figcaption></figure>
  <figure><img src="/screens/place-auto.webp" alt=""><figcaption><b>03</b>Mark the rooms, press Auto-place, then drag each device to where it really is.</figcaption></figure>
  <figure><img src="/screens/card.webp" alt=""><figcaption><b>04</b>Add the card to your dashboard and watch your home update live.</figcaption></figure>
</div>

## What makes it different

- **Image first.** You don't trace walls or build a 3D model. Any top-down picture works, and even an angled 3D render can be used.
- **Fast.** Room pins plus Auto-place put every device in the right room in one click. You only fine-tune.
- **Honest about accuracy.** Auto-placed devices are marked *approximate* (dashed ring) until you confirm or move them.
- **Part of Home Assistant.** Each plan is a device with an image and a sensor entity, so other cards and automations can use the positions.

## What it is not

- It doesn't draw your floorplan for you. If you don't have one, see [Turn your sketch into a floorplan in 10 minutes](/images/sketch).
- It doesn't model walls or signal strength. For that, look at [Spatial Context](https://github.com/Greminn/ha-spatial-context).

## Next

[Install Device Floorplan →](/guide/install)
