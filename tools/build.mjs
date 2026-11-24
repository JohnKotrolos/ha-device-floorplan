// Joins the frontend source parts (src/card, src/panel) into the two files Home Assistant loads.
// `node tools/build.mjs` writes them; `node tools/build.mjs --check` fails if a joined file is out of date.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "custom_components/device_floorplan/frontend");
const targets = { card: "device-floorplan-card.js", panel: "device-floorplan-panel.js" };
const check = process.argv.includes("--check");
let stale = 0;
for (const [dir, file] of Object.entries(targets)) {
  const parts = readdirSync(join(root, "src", dir)).filter((f) => f.endsWith(".js")).sort();
  const joined = parts.map((f) => readFileSync(join(root, "src", dir, f), "utf8")).join("");
  const dest = join(out, file);
  if (check) {
    if (readFileSync(dest, "utf8") !== joined) {
      console.error(`${file} is out of date: run node tools/build.mjs`);
      stale++;
    }
  } else writeFileSync(dest, joined);
}
process.exit(stale ? 1 : 0);
