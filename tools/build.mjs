// Joins the frontend source parts (src/card, src/panel) into the two files Home Assistant loads.
// `node tools/build.mjs` writes them; `node tools/build.mjs --check` fails if a joined file is out of date.
// 0.14 (L1): a bundle that uses dfT() also gets the translations (src/i18n: i18n.js and <lang>.json), after its first part.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "custom_components/device_floorplan/frontend");
const targets = { card: "device-floorplan-card.js", panel: "device-floorplan-panel.js" };
const check = process.argv.includes("--check");

const i18nDir = join(root, "src", "i18n");
const langs = readdirSync(i18nDir).filter((f) => f.endsWith(".json")).sort();
const table = Object.fromEntries(langs.map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(i18nDir, f), "utf8"))]));
const i18n = `\n// ---- translations (joined from src/i18n by tools/build.mjs: edit those files) ----\nconst DF_I18N = ${JSON.stringify(table)};\n${readFileSync(join(i18nDir, "i18n.js"), "utf8")}// ---- end of translations ----\n`;

let stale = 0;
for (const [dir, file] of Object.entries(targets)) {
  const parts = readdirSync(join(root, "src", dir)).filter((f) => f.endsWith(".js")).sort();
  const texts = parts.map((f) => readFileSync(join(root, "src", dir, f), "utf8"));
  if (texts.some((t) => t.includes("dfT("))) texts.splice(1, 0, i18n);
  const joined = texts.join("");
  const dest = join(out, file);
  if (check) {
    if (readFileSync(dest, "utf8") !== joined) {
      console.error(`${file} is out of date: run node tools/build.mjs`);
      stale++;
    }
  } else writeFileSync(dest, joined);
}
process.exit(stale ? 1 : 0);
