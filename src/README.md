# Frontend sources

The two files Home Assistant loads (`custom_components/device_floorplan/frontend/device-floorplan-card.js`
and `device-floorplan-panel.js`) are joined from these parts, in file-name order:

- `src/card/`: the card, its Card Editor and the chip card.
- `src/panel/`: the Floorplan Editor.

Edit the parts, then run `node tools/build.mjs`. The joined files are committed, so HACS installs work
without a build. CI runs `node tools/build.mjs --check` and fails when a joined file is out of date.

A class is split as its core file (`class X { … }`) followed by parts that add methods with
`Object.assign(X.prototype, { … })`.
