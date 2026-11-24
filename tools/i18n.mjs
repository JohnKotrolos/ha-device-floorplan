// 0.14 (L1): checks the translations. Every dfT("key") in src must be in src/i18n/en.json (fails otherwise);
// other languages: lists missing and unused keys, and placeholders that differ from English (warnings only).
// Keys built at run time (dfT(`chip.n_${x}`)) can't be checked here: keep them few.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const i18nDir = join(root, "src", "i18n");
const load = (l) => JSON.parse(readFileSync(join(i18nDir, `${l}.json`), "utf8"));
const en = load("en");
const used = new Set();
for (const dir of ["card", "panel"]) {
  for (const f of readdirSync(join(root, "src", dir)).filter((x) => x.endsWith(".js"))) {
    for (const m of readFileSync(join(root, "src", dir, f), "utf8").matchAll(/dfT\("([^"]+)"/g)) used.add(m[1]);
  }
}
let fail = 0;
for (const k of used) if (!(k in en)) (console.error(`missing in en.json: ${k}`), fail++);
const ph = (v) => JSON.stringify([...String(typeof v === "object" ? v.other : v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
for (const f of readdirSync(i18nDir).filter((x) => x.endsWith(".json") && x !== "en.json")) {
  const l = f.replace(/\.json$/, "");
  const t = load(l);
  const miss = Object.keys(en).filter((k) => !(k in t));
  const extra = Object.keys(t).filter((k) => !(k in en));
  const bad = Object.keys(t).filter((k) => k in en && ph(t[k]) !== ph(en[k]));
  console.log(`${l}: ${Object.keys(en).length - miss.length}/${Object.keys(en).length} translated${miss.length ? `; missing: ${miss.join(", ")}` : ""}${extra.length ? `; unused: ${extra.join(", ")}` : ""}${bad.length ? `; placeholders differ: ${bad.join(", ")}` : ""}`);
}
const unused = Object.keys(en).filter((k) => !used.has(k));
if (unused.length) console.log(`en keys not found as dfT("…") (built at run time?): ${unused.join(", ")}`);
process.exit(fail ? 1 : 0);
