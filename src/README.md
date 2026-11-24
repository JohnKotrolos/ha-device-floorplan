# Frontend sources

The two files Home Assistant loads (`custom_components/device_floorplan/frontend/device-floorplan-card.js`
and `device-floorplan-panel.js`) are joined from these parts, in file-name order:

- `src/card/`: the card, its Card Editor and the chip card.
- `src/panel/`: the Floorplan Editor.

Edit the parts, then run `node tools/build.mjs`. The joined files are committed, so HACS installs work
without a build. CI runs `node tools/build.mjs --check` and fails when a joined file is out of date.

A class is split as its core file (`class X { … }`) followed by parts that add methods with
`Object.assign(X.prototype, { … })`.

## Translations (0.14, L1: the card)

Texts the card shows are written as `dfT("key")` / `dfT("key", { n })`, with the words in `src/i18n/<lang>.json`
(`en.json` is the source; `el.json` Greek, `de.json` German). The language is each user's Home Assistant language;
a text missing in a language falls back to English. A plural is `{ "one": "…", "other": "…" }`, picked by `n`.
`tools/build.mjs` joins `src/i18n` into each bundle that uses `dfT(`. `node tools/i18n.mjs` checks that every
`dfT("…")` key is in `en.json` and lists what other languages miss.

To translate: copy `en.json` to `<lang>.json` (the Home Assistant language code), translate the values, keep the
`{placeholders}`, and send a pull request.
