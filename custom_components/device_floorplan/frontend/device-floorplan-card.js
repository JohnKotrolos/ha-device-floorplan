/*
 * Device Floorplan – dashboard card (v0.13.9.19).
 *
 * The view is calm: the plan and the overlay buttons. Everything else (what
 * each overlay shows, icons, names, tap behaviour, rooms, scenes, custom
 * overlays, looks) is set in the card editor.
 *
 *   type: custom:device-floorplan-card
 *   plan: ground_floor            # plan id, or several floors:
 *   plans: [ground_floor, first_floor]
 *
 * Positions come from the plan sensor (sensor.device_floorplan_<plan>): a device's
 * entities share its position; a device's box/radio spot is used where the
 * hardware matters (Network, Health); helpers can be placed on their own;
 * bonded lights/switches/covers are one marker switched together.
 *
 * Other cards switch the overlay with the action device_floorplan.show_overlay
 * (card_id + overlay, every screen) or a link with ?overlay=<name>[&card=<card_id>].
 */

const CARD_VERSION = "0.14.2";
// 0.13.2: one tip per version for admins, closed per Home Assistant user (follows them across devices).
// A version without a tip: set it to null. "go" opens the Floorplan Editor.
const RELEASE_TIP = { v: "0.14", get text() { return dfT("tip.text"); }, get go() { return dfT("tip.go"); } };
const TIP_KEY = "device_floorplan_release_tip";
const PANEL_PATH = "/device-floorplan";

const OVERLAYS = {
  plan: { get label() { return dfT("ov.plan"); }, icon: "mdi:floor-plan" },
  live: { get label() { return dfT("ov.live"); }, icon: "mdi:home-lightbulb-outline" },
  lights: { get label() { return dfT("ov.lights"); }, icon: "mdi:lightbulb-group-outline" },
  comfort: { get label() { return dfT("ov.comfort"); }, icon: "mdi:thermometer" },
  security: { get label() { return dfT("ov.security"); }, icon: "mdi:shield-home-outline" },
  network: { get label() { return dfT("ov.network"); }, icon: "mdi:access-point-network" },
  health: { get label() { return dfT("ov.health"); }, icon: "mdi:battery-heart-variant" },
  energy: { get label() { return dfT("ov.energy"); }, icon: "mdi:lightning-bolt" },
  cleaning: { get label() { return dfT("ov.cleaning"); }, icon: "mdi:robot-vacuum" },
  people: { get label() { return dfT("ov.people"); }, icon: "mdi:account-group-outline" },
};
/** 0.11: overlays added by recent updates (offered once to cards that list their own overlays). */
const NEW_OVERLAYS = ["energy"];
const OVERLAY_ORDER = ["live", "lights", "comfort", "security", "network", "health"];

// 0.8.2 Overlay Bar Reloaded: a status on a bar button (icon colour, dot, count, short value, other icon).
const BAR_ON = ["on", "open", "opening", "playing", "home", "unlocked", "printing", "cleaning", "running", "heat", "cool", "heat_cool", "dry", "fan_only", "auto"];
const BAR_SHAPES = ["pill", "tiles", "circles"];
/** Entities of a status (groups expanded). */
function barEnts(hass, st) {
  const list = Array.isArray(st.entity) ? st.entity : st.entity ? [st.entity] : [];
  return list.flatMap((e) => {
    const s = hass.states[e];
    const g = s && s.attributes.entity_id;
    return Array.isArray(g) && g.length && !["person", "zone"].includes(domainOf(e)) ? g : [e];
  }).filter((e) => hass.states[e]);
}
/** Does an entity count as active? `when` = "on, open" or ">50" / "<20" (any of them); default: on / open / armed… */
function barActive(hass, e, when) {
  const s = hass.states[e];
  if (!s) return false;
  const toks = String(when || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!toks.length) return BAR_ON.includes(s.state) || /^armed/.test(s.state) || s.state === "triggered";
  return toks.some((t) => {
    const m = t.match(/^(>=|<=|>|<|!=)\s*(.+)$/);
    if (!m) return s.state === t;
    if (m[1] === "!=") return s.state !== m[2];
    const v = Number(s.state);
    const w = Number(m[2]);
    if (!Number.isFinite(v) || !Number.isFinite(w)) return false;
    return m[1] === ">" ? v > w : m[1] === "<" ? v < w : m[1] === ">=" ? v >= w : v <= w;
  });
}
/** A state in at most 4 characters, for a badge ("62%", "21.5" → "22", "on"). */
function barShort(st) {
  const v = st.state;
  if (!num(v)) return String(v).slice(0, 4);
  const n = Number(v);
  const unit = st.attributes.unit_of_measurement === "%" ? "%" : "";
  return `${Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10}${unit}`.slice(0, 4);
}
/** The look of a status: { color } (icon colour), { dot } or { badge, color? }. Never changes a button's size.
 *  Colour and dot: the first rule whose states match wins (e.g. printing → green, error → red). */
function barStatus(hass, st) {
  if (!st || !hass) return null;
  const ents = barEnts(hass, st);
  if (!ents.length) return null;
  const show = st.show || "dot";
  if (show === "count") {
    const n = ents.filter((e) => barActive(hass, e, st.when)).length;
    return n ? { badge: n > 99 ? "99+" : String(n), ...(st.color ? { color: st.color } : {}) } : null;
  }
  if (show === "value") {
    const s0 = hass.states[ents[0]];
    if (!live(s0) || (st.when && !barActive(hass, ents[0], st.when))) return null;
    return { badge: barShort(s0), ...(st.color ? { color: st.color } : {}) };
  }
  const rules = Array.isArray(st.rules) && st.rules.length ? st.rules : [{ when: st.when, color: st.color }];
  for (const r of rules) {
    if (!r || !ents.some((e) => barActive(hass, e, r.when))) continue;
    if (show === "dot") return { dot: r.color || "var(--error-color, #db4437)" };
    return { color: r.color || "#F2B84B" };
  }
  return null;
}

// What Live (and custom overlays) can show, by kind.
// 0.12.1: the names of the one category list (the keys stay, so saved choices keep working; a moved member
// follows its old switch: fans with Switches & plugs, robots with Appliances, garage doors with Covers).
const LIVE_KINDS = {
  lights: "Lights",
  switches: "Switches & plugs (and fans)",
  covers: "Covers (and garage doors, gates)",
  climate: "Climate",
  motion: "Motion & presence",
  openings: "Doors & windows",
  locks: "Security (locks, alarm)",
  media: "Media & screens",
  appliances: "Appliances and moving things (robots)",
  cameras: "Cameras",
  safety: "Safety (smoke, leak, gas, siren)",
};
const LIVE_DEFAULT = ["lights", "switches", "covers", "climate", "motion", "openings", "locks", "media", "appliances"];
const READING_KINDS = { temperature: "Temperature", humidity: "Humidity", battery: "Battery" };
const CUSTOM_KINDS = { ...LIVE_KINDS, ...READING_KINDS };
const NO_VALUE = new Set(["button", "input_button", "update", "event", "scene", "script"]); // 0.12.6: actions, no value to show
const READ_KIND = new Set(["temperature", "humidity", "battery", "sensor", "reading"]); // 0.12.6: kinds with a value, no switch

const TAP_KINDS = {
  light: "Lights",
  switch: "Switches, plugs & fans",
  cover: "Covers & blinds",
  climate: "Climate (ACs, thermostats)",
  lock: "Locks",
  reading: "Readings (temperature, humidity, battery)",
  other: "Everything else",
};
const TAP_DEFAULT = { light: "toggle", switch: "toggle", cover: "more-info", climate: "more-info", lock: "more-info", reading: "readings", other: "more-info" };
const TAP_OPTIONS = [
  { value: "toggle", label: "Switch on / off" },
  { value: "more-info", label: "Open details / controls (more-info)" },
  { value: "readings", label: "Readings popup with history" },
  { value: "navigate", label: "Open a dashboard" },
  { value: "popup", label: "Popup with a card (browser_mod)" },
  { value: "press", label: "Press a button" }, // 0.13.9.19 #63
  { value: "none", label: "Nothing" },
];
// 0.12.6: long press per kind / per device; "default" = details (a phantom: graphs; a bond of lamps: its info card).
const HOLD_OPTIONS = [
  { value: "default", label: "Details (default; a bond of lamps: its info card)" },
  { value: "info", label: "Info card" },
  { value: "toggle", label: "Switch on / off" },
  { value: "more-info", label: "Open details / controls (more-info)" },
  { value: "readings", label: "Readings popup with history" },
  { value: "none", label: "Nothing" },
];
const HOLD_DEFAULT = Object.fromEntries(Object.keys(TAP_KINDS).map((k) => [k, "default"]));
const CLEAN_AREA = 16384; // VacuumEntityFeature.CLEAN_AREA (HA 2026.3)

// Network (#49)
const CONNS = {
  zigbee: { label: "Zigbee", icon: "mdi:zigbee" },
  zwave: { label: "Z-Wave", icon: "mdi:z-wave" },
  matter: { label: "Matter", icon: "mdi:home-automation" },
  network: { label: "Wi-Fi / LAN", icon: "mdi:wifi" },
  bluetooth: { label: "Bluetooth", icon: "mdi:bluetooth" },
  radio: { get label() { return dfT("conn.radio"); }, icon: "mdi:signal" },
};
const CONN_ORDER = ["zigbee", "zwave", "matter", "network", "bluetooth", "radio"];
const ROLES = {
  coordinator: { get label() { return dfT("role.coordinator"); }, color: "#f5a623", shape: "diamond" },
  ap: { get label() { return dfT("role.ap"); }, color: "#f5a623", shape: "diamond" },
  btproxy: { get label() { return dfT("role.btproxy"); }, color: "#f5a623", shape: "diamond" }, // test12: Bluetooth's access point
  router: { get label() { return dfT("role.router"); }, color: "#3b82f6", shape: "square" },
  hub: { get label() { return dfT("role.hub"); }, color: "#3b82f6", shape: "square" },
  end: { get label() { return dfT("role.end"); }, color: "#43a047", shape: "round" },
  gp: { get label() { return dfT("role.gp"); }, color: "#9ccc65", shape: "round" }, // 0.8.1: HA 2026.11, no parent line
  device: { get label() { return dfT("role.device"); }, color: "#78909c", shape: "round" },
  unavailable: { get label() { return dfT("role.unavailable"); }, color: "#e53935", shape: "round" },
  unknown: { get label() { return dfT("role.unknown"); }, color: "#9e9e9e", shape: "round" },
};
const LQI_BANDS = [
  { min: 200, color: "#43a047", label: "200–255" },
  { min: 150, color: "#c0ca33", label: "150–199" },
  { min: 100, color: "#fb8c00", label: "100–149" },
  { min: 0, color: "#e53935", label: "0–99" },
];
// 0.7.3: Wi-Fi / LAN topology, one colour per access point.
const AP_COLORS = ["#29b6f6", "#ab47bc", "#26a69a", "#ffa726", "#ec407a", "#9ccc65"];
const DFC_BRAND = {}; // test11: brand marks asked from Home Assistant once per page
const lqiColor = (v) => (LQI_BANDS.find((b) => v >= b.min) || LQI_BANDS[3]).color;

const CLIMATE_MODES = {
  heat: { icon: "mdi:fire", color: "#ff7043" },
  cool: { icon: "mdi:snowflake", color: "#29b6f6" },
  heat_cool: { icon: "mdi:sun-snowflake-variant", color: "#7e57c2" },
  auto: { icon: "mdi:thermostat-auto", color: "#7e57c2" },
  dry: { icon: "mdi:water-percent", color: "#26a69a" },
  fan_only: { icon: "mdi:fan", color: "#26a69a" },
  off: { icon: "mdi:power", color: "#9e9e9e" },
};

// Climate chip v2: what the unit is doing (hvac_action) or its mode.
const CLIMATE_ACTION = {
  cooling: { get word() { return dfT("climate.cooling"); }, color: "#29b6f6" },
  heating: { get word() { return dfT("climate.heating"); }, color: "#ff7043" },
  drying: { get word() { return dfT("climate.drying"); }, color: "#26a69a" },
  fan: { get word() { return dfT("climate.fan"); }, color: "#26a69a" },
  idle: { get word() { return dfT("climate.idle"); }, color: "#90a4ae" },
  preheating: { get word() { return dfT("climate.preheating"); }, color: "#ff7043" },
  defrosting: { get word() { return dfT("climate.defrosting"); }, color: "#29b6f6" },
  off: { get word() { return dfT("climate.off"); }, color: "#9e9e9e" },
};
const CLIMATE_MODE_WORD = {
  get cool() { return dfT("climate.cooling"); },
  get heat() { return dfT("climate.heating"); },
  get dry() { return dfT("climate.dry"); },
  get fan_only() { return dfT("climate.fan"); },
  get heat_cool() { return dfT("climate.auto"); },
  get auto() { return dfT("climate.auto"); },
  get off() { return dfT("climate.off"); },
};
function climateIcon(eid, st) {
  if (domainOf(eid) === "water_heater") return "mdi:water-boiler";
  if (domainOf(eid) === "humidifier") return "mdi:air-humidifier";
  const modes = (st && st.attributes && st.attributes.hvac_modes) || [];
  if (modes.includes("cool") || modes.includes("dry") || modes.includes("fan_only")) return "mdi:air-conditioner";
  if (modes.length && modes.every((m) => m === "heat" || m === "off")) return "mdi:radiator";
  return "mdi:thermostat";
}
/** 0.8.1: the HA floor level as a number ("0", "1", "-1"); the name's first letters when no level. */
function floorLabel(level, name) {
  if (typeof level === "number" && Number.isFinite(level)) return String(level);
  return (name || "?").slice(0, 2);
}
/** 0.8.1: a bond's name, the Floorplan Editor's rule: its own name, else the members' common beginning ×N, else the first member. */
function bondName(b) {
  if (b.name) return b.name;
  const names = b.names || [];
  let p = names[0] || "";
  if (names.length > 1) {
    for (const n of names) while (p && !n.startsWith(p)) p = p.slice(0, -1);
    if (!names.every((n) => n.length === p.length || /[\s\-_·.,]/.test(n[p.length]))) p = (p.match(/^(.*[\s\-_·.,])/) || ["", ""])[1];
  } else p = "";
  p = p.replace(/[\s\-_·.,]+$/, "").trim();
  return p.length >= 3 ? `${p} ×${names.length}` : names[0] || dfT("bond");
}
/** 0.8.1: an entity's display name. HA 2026.11 plans to drop friendly_name: then device name + entity name from the
 *  registries (hass.devices / hass.entities), else the entity id. One place for every name on the card and in the Editor. */
function entName(hass, e) {
  const st = hass && hass.states && hass.states[e];
  const fn = st && st.attributes && st.attributes.friendly_name;
  if (fn) return fn;
  const re = hass && hass.entities && hass.entities[e];
  if (re) {
    const dv = re.device_id && hass.devices && hass.devices[re.device_id];
    const dn = dv && (dv.name_by_user || dv.name);
    const en = re.name || "";
    if (dn || en) return [dn, en].filter(Boolean).join(" ");
  }
  return e;
}
/** 0.8.2: screen sizes for the card editor's preview (CSS pixels). */
// 0.11.1 Home Replay
const RP_RANGES = [6, 12, 24, 48]; // hours
// test10: Energy is out again: it is hourly amounts, with its own hours under the plan (the last 24 hours).
const RP_SKIP = new Set(["plan", "energy"]); // test11: Network replays too (online / offline, signal where recorded)
const CAM_SIZES = { s: [120, 0.22], m: [160, 0.3], l: [240, 0.42] }; // max px, max share of the plan width
const rpClock = (t) => new Date(t).toLocaleTimeString(dfLocale(), { hour: "2-digit", minute: "2-digit" });
/** 0.11.1 test8: the replay timeline. One rule: it shows only what the overlay itself shows, in three forms
 *  with one meaning each: bars = how much happened in a slot, spans = how long something ran, a line = a measured
 *  value. Kinds (and colours): lt lights, dv devices, op doors / windows / shutters / locks / doorbell, mv motion,
 *  off a device went offline, bat a battery went low. */
const RP_COL = {
  lt: "var(--dfc-accent)", dv: "color-mix(in srgb, var(--dfc-accent) 55%, #9aa4ae)", op: "var(--warning-color, #f0a020)", mv: "#9aa4ae",
  off: "#9aa4ae", bat: "var(--warning-color, #f0a020)",
};
// Home Assistant's own Energy colours (the hour bars, the legend and the flow lines use the same).
const E_COL = { grid: "var(--energy-grid-consumption-color, #488fc2)", solar: "var(--energy-solar-color, #ff9800)", battery_out: "var(--energy-battery-out-color, #4db6ac)" };
const RP_ON = new Set(["on", "open", "opening", "unlocked", "playing", "detected"]);
// States in which a device is running (a span): the same words the card treats as busy elsewhere.
const RP_RUN = new Set(["on", "playing", "cleaning", "returning", "mowing", "heating", "cooling", "drying", "running", "printing", "washing", "spinning", "rinsing", "streaming", "recording"]);
/** The kind of a single event (a bar), or null. */
function rpKind(e, st) {
  const d = domainOf(e);
  const dc = st && st.attributes ? st.attributes.device_class : null;
  if (d === "light") return "lt";
  if (["switch", "fan", "media_player", "climate", "vacuum", "lawn_mower"].includes(d)) return "dv";
  if (["cover", "lock"].includes(d) || (d === "binary_sensor" && OPEN_DC.has(dc)) || (d === "event" && dc === "doorbell")) return "op";
  if (d === "binary_sensor" && MOTION_DC.has(dc)) return "mv";
  return null;
}
/** Is this row a "running" state? Climate counts only while it really heats / cools when it says so. */
function rpRunning(e, r) {
  const d = domainOf(e);
  if (d === "climate") {
    const act = r.a && r.a.hvac_action;
    if (act) return ["heating", "cooling", "drying", "fan"].includes(act);
    return !["off", "unavailable", "unknown"].includes(r.s);
  }
  if (d === "event") return false;
  return RP_RUN.has(String(r.s).toLowerCase());
}
/** start → stop intervals of one entity while running (clipped to [t0, t1]). */
function rpSpans(e, rows, t0, t1) {
  const out = [];
  let from = null;
  for (let i = 0; i < rows.length; i++) {
    const on = rpRunning(e, rows[i]);
    const t = Math.max(t0, rows[i].t);
    if (on && from == null) from = t;
    if (!on && from != null) {
      if (t > from) out.push([from, t]);
      from = null;
    }
  }
  if (from != null && t1 > from) out.push([from, t1]);
  return out;
}
/** The value of a row list at time t (last row at or before t). */
function rpAt(rows, t) {
  let lo = 0, hi = rows.length - 1, i = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m].t <= t) {
      i = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return i < 0 ? null : rows[i];
}

const lsGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch (_e) {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (_e) {
    /* private mode */
  }
};

const OPEN_DC = new Set(["door", "window", "opening", "garage_door"]);
const MOTION_DC = new Set(["motion", "occupancy", "presence", "moving"]);
// 0.12.1 (rule 5): "problem" and "sound" sensors are no safety alarms.
const SAFETY_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "safety", "tamper", "heat"]);
const TOGGLE_DOMAINS = new Set(["light", "switch", "fan", "input_boolean", "cover", "siren", "humidifier"]);

const cesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const live = (st) => !!st && st.state !== "unavailable" && st.state !== "unknown";
/** 0.12: a device is offline when its entities are "unavailable" (all of them). "unknown" is online without a
 *  reading (a sensor that hasn't reported), not offline. `mainOnly`: only the main entity counts (Replay: only its
 *  history is loaded). */
const devOffline = (hass, item, mainOnly = false) => {
  const off = (st) => !!st && st.state === "unavailable";
  const main = hass.states[item.main_entity];
  if (mainOnly) return off(main);
  const sts = (item.entities || []).map((e) => hass.states[e]).filter(Boolean);
  return sts.length ? sts.every(off) : off(main);
};
/** 0.13.1: the slot name of a camera's live video player. */
const vidSlot = (eid) => `dfcv-${String(eid).replace(/[^a-z0-9_]/gi, "_")}`;
/** Re-render a shadow root but keep what other cards put in it (card-mod's <card-mod> style). */
function setShadow(el, html) {
  const keep = [...el.shadowRoot.children].filter((n) => n.localName === "card-mod");
  const oldImg = el.shadowRoot.querySelector("img.plan");
  el.shadowRoot.innerHTML = html;
  for (const n of keep) el.shadowRoot.appendChild(n);
  // 0.7.5: the same plan image stays (no reload / blink on every redraw).
  const ni = el.shadowRoot.querySelector("img.plan");
  if (oldImg && ni && oldImg.getAttribute("src") === ni.getAttribute("src")) ni.replaceWith(oldImg);
  alignAnims(el.shadowRoot);
}
/** 0.13.9.1: a redraw makes new elements, and their animations would start again from 0 (a spinning fan jumps).
 *  Every endless animation is set to the page's clock instead: a redrawn element carries on exactly where the old
 *  one was (per-element delays, like the twinkle's, still apply). One-off animations are left alone. */
function alignAnims(root) {
  if (!root || typeof root.getAnimations !== "function") return;
  for (const an of root.getAnimations()) {
    try {
      if (an.startTime !== 0 && an.effect && an.effect.getTiming().iterations === Infinity) an.startTime = 0;
    } catch (_e) {
      /* not adjustable: leave it */
    }
  }
}
if (!window.__dfcAlignAnims) window.__dfcAlignAnims = alignAnims;
const num = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const domainOf = (eid) => (eid ? eid.split(".")[0] : "");
const ieeeKey = (i) => String(i || "").toLowerCase().replace(/^0x/, "").replace(/:/g, "");


// ---- translations (joined from src/i18n by tools/build.mjs: edit those files) ----
const DF_I18N = {"de":{"action":"Aktion","actions":"Aktionen","admin.new_place":"{n} neu · Platzieren","admin.new_short":"{n} neu","admin.new_title":{"one":"{n} neues Gerät · nur Admins sehen das","other":"{n} neue Geräte · nur Admins sehen das"},"alloff.n_on":{"one":"{n} Licht ist an.","other":"{n} Lichter sind an."},"alloff.none":"Gerade ist kein Licht an.","alloff.q":"Alle Lichter ausschalten?","appl.appliances":"Haushaltsgeräte","appl.done_unload":"Fertig · zum Ausräumen tippen","appl.door_open":"Tür offen","appl.drying":"Trocknet","appl.error":"Fehler","appl.finished":"Fertig","appl.idle":"Inaktiv","appl.min_elapsed":"seit {n} Min.","appl.min_left":"noch {n} Min.","appl.paused":"Pausiert","appl.pct_done":"{n}% erledigt","appl.run_coffee":"Brüht","appl.run_oven":"Gart","appl.run_printer":"Druckt","appl.running":"Läuft","appl.unavailable":"Status nicht verfügbar","appl.unloaded":"Ausgeräumt","bar.more":"Weitere Schaltflächen","bar.overlays":"Ansichten","bar.scroll_back":"Zurückscrollen","battery":"Batterie","bond":"Gruppe","cancel":"Abbrechen","card.choose_plan":"Wähle einen Plan (plan: <plan id>)","card.description":"Dein Grundriss mit Live-Ansichten: Live, Licht, Komfort, Sicherheit, Netzwerk, Zustand und deine eigenen.","card.plan_missing":"Plan „{p}“ nicht gefunden. Prüfe die Plan-ID oder öffne den Floorplan Editor in der Seitenleiste.","chip.n_of_on":"{n} von {t} an","chip.n_of_open":"{n} von {t} offen","chip.n_on":"{n} an","chip.n_open":"{n} offen","chip.off":"Aus","chip.on":"An","clean.cant_room":"Dein Roboter kann aus Home Assistant keinen einzelnen Raum reinigen (braucht seine Raumzuordnung, Home Assistant 2026.3+).","clean.clean_now":"Jetzt reinigen","clean.cleaned":"Gereinigt {t}.","clean.cleaned_by":"Gereinigt {t} von {by}.","clean.cleaning_l":"wird gereinigt","clean.cleaning_now":"Wird gerade gereinigt","clean.due":"Fällig","clean.every_d":"alle {n} T.","clean.in_d":"in {n} T.","clean.last7":"Letzte 7 Tage","clean.last_cleaned":"Zuletzt gereinigt","clean.last_time":"Beim letzten Mal gereinigt","clean.leg_fresh":"Frisch","clean.leg_now":"Jetzt","clean.map_hint":"Ordne diesen Raum in den Einstellungen des Roboters einem seiner Räume zu (Map vacuum segments to areas), um ihn von hier zu reinigen.","clean.never":"nie","clean.none_yet":"Hier wurde noch keine Reinigung erfasst.","clean.not_cleaned":"nicht gereinigt","clean.now":"jetzt","clean.now_with":"Jetzt mit {r} reinigen","clean.robot_usually":"Roboter reinigt meist","clean.usually_takes":"Dauert meist","climate.auto":"Auto","climate.cooling":"Kühlen","climate.defrosting":"Abtauen","climate.dry":"Entfeuchten","climate.drying":"Entfeuchten","climate.fan":"Lüfter","climate.heating":"Heizen","climate.idle":"Inaktiv","climate.off":"Aus","climate.preheating":"Vorheizen","close":"Schließen","conn.radio":"Funk","cover.all":"Alle","cover.close":"Schließen","cover.close_all":"Alle schließen","cover.open":"Öffnen","cover.open_all":"Alle öffnen","cover.position":"Position","cover.stop":"Stopp","cover.stop_all":"Alle stoppen","details":"Details","details_more":"Details ›","edit.hide_here":"Hier ausblenden (nur in dieser Ansicht)","energy.grid":"Netz","energy.last24":"Letzte 24 h","energy.loading":"Energie wird geladen…","energy.no_data":"Energiedaten nicht verfügbar","energy.none_yet":"Noch keine Geräte in den Energie-Einstellungen von Home Assistant. Füge sie unter Einstellungen → Dashboards → Energie hinzu, dann erscheinen sie hier.","energy.not_on_plan":"Nicht auf diesem Plan","energy.now_live":"Jetzt (live)","energy.on_plan":"Auf dem Plan","energy.panel":"Stromverteiler","energy.place_panel":"Platziere den Stromverteiler im Floorplan Editor (Schritt 3, Energiepunkte), um die Flusslinien zu sehen.","energy.rooms_darker":"Räume: dunkler = mehr Energie","energy.scrub":"Energie: die letzten 24 Stunden, Stunde für Stunde","energy.solar":"Solar","floor.change_a":"Etage {f}, Etage wechseln","floor.change_t":"{f}: Etage wechseln","floor.down":"Etage nach unten","floor.floors":"Etagen","floor.left":"Plan links","floor.right":"Plan rechts","floor.up":"Etage nach oben","graphs_more":"Verläufe ›","heat.estimated":"Geschätzt zwischen den Sensoren","heat.room_temp":"Raumtemperatur","heat.strength":"Stärke der Heatmap","hist.not_enough":"Noch nicht genug Verlauf","humidity":"Luftfeuchtigkeit","humidity_details":"Details zur Luftfeuchtigkeit","humidity_l":"Luftfeuchtigkeit","lay.air":"Luftstrom der Klimageräte","lay.all_sensors":"Alle Sensoren","lay.cams":"Kameras","lay.cams_not_replay":"Kameras (nicht im Replay)","lay.clim":"Klimageräte","lay.fill":"Raumschattierung","lay.flow":"Flusslinien","lay.heat":"Heatmap","lay.labels":"Temperaturanzeigen","lay.no_cam_replay":"Kein Kameravideo im Replay","lay.pall":"Ringe um alle Proxys","lay.path":"Reinigungsweg","lay.path_last":"Weg der letzten Reinigung","lay.pdist":"Abstand von Personen","lay.reset":"Zurück zu den Standards der Karte","lay.rooms":"Raumnamen","layers":"Ebenen","leg.colour_strength":"Farbstärke","mob.afternoon":"Guten Tag","mob.air_good":"Luft gut","mob.air_mod":"Luft mäßig","mob.air_poor":"Luft schlecht","mob.alarm_panel":"Alarmanlage","mob.alert":"Alarm","mob.all_closed":"Alles zu","mob.all_devices":"Alle Geräte","mob.all_fine":"Alles in Ordnung","mob.all_good":"Alles gut","mob.all_off":"Alles aus","mob.all_online":"Alles online","mob.appliances":"Haushaltsgeräte","mob.as_grid":"Als Raster zeigen","mob.as_row":"Als Reihe zeigen","mob.back":"Zurück","mob.battery":"Batterie {n}%","mob.brightness":"Helligkeit","mob.cameras":"Kameras","mob.card_desc":"Dein Zuhause auf dem Handy: Räume, Geräte und Ebenen aus dem Floorplan.","mob.card_name":"Device Floorplan (Handy)","mob.cfg_hide_header":"Obere Leiste von Home Assistant auf Handys ausblenden","mob.cfg_hide_help":"Nur auf diesem Dashboard und solange es offen ist; ☰ unten öffnet das Menü. Zum Bearbeiten ?edit=1 an die Adresse anhängen.","mob.cfg_layout":"Layout","mob.cfg_layout_help":"Automatisch: der Haus-Explorer, wenn das Handy quer gehalten wird.","mob.cfg_people":"Haushalt","mob.cfg_people_help":"Die Personen, die als zu Hause / weg zählen. Leer: alle in Home Assistant.","mob.cfg_room_order":"Reihenfolge der Räume","mob.cfg_sections":"Abschnitte der Startseite","mob.cfg_sections_help":"Welche Abschnitte die Startseite zeigt, in dieser Reihenfolge.","mob.cfg_source":"Einstellungen von","mob.cfg_source_auto":"Automatisch (die erste gefundene Floorplan-Karte)","mob.cfg_source_help":"Die Floorplan-Karte, deren Overlays, Geräte, Personen, Szenen und Aussehen die Mobilkarte übernimmt (nie ihr Layout).","mob.climate_to":"{s} auf {t}°","mob.control":"Steuerung","mob.details":"Details","mob.devices":"Geräte","mob.door":"Tür","mob.door_open":"Tür offen","mob.energy":"Energie","mob.evening":"Guten Abend","mob.floor_down":"Etage darunter","mob.floor_up":"Etage darüber","mob.floors":"Etagen","mob.g_appl":"Haushaltsgeräte","mob.g_comfort":"Komfort","mob.g_lights":"Licht","mob.g_media":"Medien","mob.g_other":"Sonstiges","mob.g_security":"Sicherheit","mob.hide":"Ausblenden","mob.hint_land":"Tippen Sie auf einen Raum, um ihn zu öffnen, oder auf ein Gerät, um es zu steuern","mob.hint_port":"Tippen Sie auf einen Raum, um ihn zu öffnen","mob.home":"Zuhause","mob.home_control":"Haussteuerung","mob.house_hint":"Tippe auf eine Etage, um sie zu öffnen","mob.k_of_n_home":"{k}/{n} zu Hause","mob.last":"Zuletzt","mob.last_run":"Zuletzt {t}","mob.layout_auto":"Automatisch","mob.layout_landscape":"Immer quer","mob.layout_portrait":"Immer hochkant","mob.lights_on":{"one":"{n} Licht an","other":"{n} Lichter an"},"mob.measured":"jetzt, aus den Geräten mit Leistungsmessung","mob.menu":"Home-Assistant-Menü","mob.morning":"Guten Morgen","mob.n_attention":{"one":"{n} braucht Aufmerksamkeit","other":"{n} brauchen Aufmerksamkeit"},"mob.n_devices":{"one":"{n} Gerät","other":"{n} Geräte"},"mob.n_floors":{"one":"{n} Etage","other":"{n} Etagen"},"mob.n_home":{"one":"{n} Person zu Hause","other":"{n} Personen zu Hause"},"mob.n_low":{"one":"{n} Batterie schwach","other":"{n} Batterien schwach"},"mob.n_offline":{"one":"{n} offline","other":"{n} offline"},"mob.n_on":{"one":"{n} an","other":"{n} an"},"mob.n_rooms":{"one":"{n} Raum","other":"{n} Räume"},"mob.n_shown":{"one":"{n} angezeigt","other":"{n} angezeigt"},"mob.n_warn":{"one":"{n} Warnung","other":"{n} Warnungen"},"mob.needs_look":"Braucht Aufmerksamkeit","mob.next_room":"Nächster Raum","mob.no_people":"Keine Personen","mob.no_plans":"Noch keine Pläne: zeichne einen im Floorplan Editor.","mob.no_room":"Kein Raum","mob.nothing":"Nichts hier","mob.now_n":{"one":"{n} Sache läuft","other":"{n} Sachen laufen"},"mob.offline":"Offline","mob.open":"Offen","mob.open_n":{"one":"{n} offen","other":"{n} offen"},"mob.openings":"Öffnungen","mob.order_active":"Aktivste zuerst","mob.order_alpha":"Alphabetisch","mob.order_plan":"Reihenfolge im Plan","mob.outside":"draußen","mob.people":"Personen","mob.power":"Leistung","mob.prev_room":"Vorheriger Raum","mob.program":"Programm","mob.quiet":"Ruhig","mob.rooms":"Räume","mob.search":"Geräte oder Räume suchen","mob.sec_appliances":"Haushaltsgeräte","mob.sec_cameras":"Kameras","mob.sec_control":"Haussteuerung","mob.sec_rooms":"Räume","mob.see_all":"Alle","mob.show_plan":"Plan zeigen","mob.shutters":"Rollläden","mob.status":"Status","mob.whole_home":"ganzes Zuhause","motion.clear":"Keine Bewegung","motion.detected":"Bewegung","n_devices":{"one":"{n} Gerät","other":"{n} Geräte"},"net.ap":"Zugangspunkt","net.cable":"Kabel","net.cable_lan":"Kabel (LAN)","net.connected_devices":"Verbundene Geräte ({n})","net.connected_here":"Hier verbunden","net.connection":"Verbindung","net.connections":"Verbindungen","net.default":"Standard","net.fair":"mittel","net.good":"gut","net.hub_links":"Verbindungen über Hub / Bridge","net.includes":"Enthält","net.legend":"Legende","net.link":"Verbindung","net.no_lqi":"Noch keine Verbindungsqualität bekannt (ZHA-Daten werden für Admins geladen).","net.no_signal":"Kein Signalwert: aktiviere den Signalsensor dieses Geräts in Home Assistant, um ihn hier zu sehen.","net.not_connected":"nicht verbunden","net.not_on_floor":"nicht auf dieser Etage","net.on_floor":"auf dieser Etage","net.path":"Weg","net.refresh":"Aktualisieren","net.rescan":"Zigbee-Netzwerk neu scannen","net.role":"Rolle","net.router":"Router","net.scanning":"Scannt…","net.show_hide":"Ein- / ausblenden","net.show_hide_range":"Verbindungen in diesem Bereich ein- / ausblenden","net.signal":"Signal","net.through":"Über {d}","net.through_k":"Über","net.via_hub":"über Hub / Bridge","net.weak":"schwach","net.wifi_links":"WLAN- / LAN-Verbindungen","net.wifi_net":"WLAN-Netz","net.zha_at":"Zigbee-Daten aktualisiert um {t}","net.zigbee_links":"Zigbee-Verbindungen","newov.add":"Zu dieser Karte hinzufügen","newov.energy":". Platziere dann deine Energiesensoren im Floorplan Editor (Schritt 3, Energiepunkte) für die Flusslinien.","newov.not_now":"Nicht jetzt","newov.text":"Neu: Ansicht {o}","offline":"Offline","open_more":"Öffnen ›","ov.cleaning":"Reinigung","ov.comfort":"Komfort","ov.custom":"Eigene","ov.energy":"Energie","ov.health":"Zustand","ov.lights":"Licht","ov.live":"Live","ov.network":"Netzwerk","ov.people":"Personen","ov.plan":"Plan","ov.security":"Sicherheit","people.home":"Zuhause","people.home_unknown":"zuhause, Raum unbekannt","people.not_sure":"unsicher","ph.average":"Durchschnitt","ph.highest":"höchster Wert","ph.lowest":"niedrigster Wert","ph.one":"ein Sensor","phantom":"Phantom","phantom.place_hint":"Platziere diese Geräte im Floorplan Editor auf dem Plan, um jedes einzeln zu sehen.","press.do":"Drücken","press.q":"„{b}“ drücken?","robot.area":"Fläche","robot.charging":"Lädt","robot.charging_l":"lädt","robot.cleaning":"Reinigt","robot.consumables":"Verschleißteile","robot.continue":"Fortsetzen","robot.dock":"Station","robot.docked":"In der Station","robot.error":"Fehler","robot.idle":"Inaktiv","robot.last_cleaning":"Letzte Reinigung","robot.pause":"Pause","robot.paused":"Pausiert","robot.returning":"Kehrt zurück","robot.settings":"Einstellungen","robot.start":"Start","robot.this_run":"Dieser Durchgang","robot.took":"Dauer","role.ap":"Router / Zugangspunkt","role.btproxy":"Bluetooth-Proxy","role.coordinator":"Koordinator","role.device":"Gerät","role.end":"Endgerät","role.gp":"Batterielos (Green Power)","role.hub":"Hub / Bridge","role.router":"Router / Repeater","role.unavailable":"Nicht verfügbar","role.unknown":"Unbekannt","rp.avg_temp":"Durchschnittliche Raumtemperatur ({u}), niedrigste–höchste","rp.back_now":"Zurück zu jetzt","rp.before":"Vor den geladenen {n} h: ihr Anfang wird gezeigt","rp.close":"Home Replay schließen","rp.day":"Tag","rp.future":"Diese Zeit liegt noch in der Zukunft: Jetzt wird gezeigt","rp.go":"Los","rp.goto":"Zu Tag und Uhrzeit springen","rp.name":"Home Replay","rp.next":"Nächstes Ereignis","rp.no_switch":"Replay: tippe auf ← Jetzt, um Geräte zu schalten","rp.now":"Jetzt","rp.overlay":"Ansicht für das Replay","rp.pause":"Pause","rp.play":"Abspielen","rp.prev":"Vorheriges Ereignis","rp.range":"Zeitraum","rp.short":"Replay","rp.speed":"Geschwindigkeit","rp.tap_goto":"Tippen, um zu Tag und Uhrzeit zu springen","rp.time":"Replay-Zeit","rp.time_input":"Uhrzeit (Sekunden optional)","rp.today":"Heute","rp.yesterday":"Gestern","save.cam_failed":"Die Kameraposition konnte nicht gespeichert werden.","scene.all_off":"Alle aus","scene.all_on":"Alle an","scene.bar":"Lichtszenen","scene.n":"Szene {n}","sec.all_closed":"Alles zu","sec.all_secure":"Alles sicher","sec.n_open":"{n} offen","shortcut":"Kurzbefehl","temperature":"Temperatur","temperature_details":"Details zur Temperatur","temperature_l":"Temperatur","this_device":"Dieses Gerät","time.ago":"vor {t}","time.just_now":"gerade eben","time.now":"jetzt","tip.close":"Tipp schließen","tip.go":"Ausprobieren","tip.new_in":"Neu in {v}","tip.text":"Weihnachtslichter & Bäume und ein Dashboard fürs Handy","toast.cleaning_started":"Reinigung gestartet","toast.no_shortcuts_editing":"Kurzbefehle laufen beim Bearbeiten nicht","toast.pressed":"Gedrückt · {b}","toast.preview_not_run":"Vorschau: „{b}“ läuft beim Bearbeiten nicht","toast.unavailable":"{d} ist nicht verfügbar","toast.would_open":"Würde öffnen: {u}","toast.would_press":"Würde drücken: {b}","turn_off":"Ausschalten","turn_on":"Einschalten","unavailable_l":"nicht verfügbar","unit.d":"{n} T.","unit.h":"{n} Std.","unit.min":"{n} Min.","yes":"ja"},"el":{"action":"Ενέργεια","actions":"Ενέργειες","admin.new_place":"{n} νέες · Τοποθέτησέ τες","admin.new_short":"{n} νέες","admin.new_title":{"one":"{n} νέα συσκευή · τη βλέπουν μόνο οι διαχειριστές","other":"{n} νέες συσκευές · τις βλέπουν μόνο οι διαχειριστές"},"alloff.n_on":{"one":"{n} φως είναι αναμμένο.","other":"{n} φώτα είναι αναμμένα."},"alloff.none":"Κανένα φως δεν είναι αναμμένο αυτή τη στιγμή.","alloff.q":"Να σβήσουν όλα τα φώτα;","appl.appliances":"Συσκευές","appl.done_unload":"Τελείωσε · πάτα όταν αδειάσει","appl.door_open":"Ανοιχτή πόρτα","appl.drying":"Στεγνώνει","appl.error":"Σφάλμα","appl.finished":"Τελείωσε","appl.idle":"Αδρανές","appl.min_elapsed":"{n} λεπ. από την έναρξη","appl.min_left":"απομένουν {n} λεπ.","appl.paused":"Σε παύση","appl.pct_done":"{n}% ολοκληρώθηκε","appl.run_coffee":"Παρασκευή","appl.run_oven":"Μαγείρεμα","appl.run_printer":"Εκτύπωση","appl.running":"Λειτουργεί","appl.unavailable":"Η κατάσταση δεν είναι διαθέσιμη","appl.unloaded":"Άδειασε","bar.more":"Περισσότερα κουμπιά","bar.overlays":"Επίπεδα","bar.scroll_back":"Κύλιση πίσω","battery":"Μπαταρία","bond":"Ομάδα","cancel":"Άκυρο","card.choose_plan":"Επίλεξε μια κάτοψη (plan: <plan id>)","card.description":"Η κάτοψή σου με ζωντανά επίπεδα: Ζωντανά, Φώτα, Άνεση, Ασφάλεια, Δίκτυο, Υγεία και τα δικά σου.","card.plan_missing":"Η κάτοψη “{p}” δεν βρέθηκε. Έλεγξε το plan id ή άνοιξε το Floorplan Editor από την πλαϊνή μπάρα.","chip.n_of_on":"{n} από {t} αναμμένα","chip.n_of_open":"{n} από {t} ανοιχτά","chip.n_on":"{n} αναμμένα","chip.n_open":"{n} ανοιχτά","chip.off":"Σβηστά","chip.on":"Αναμμένα","clean.cant_room":"Η σκούπα σου δεν μπορεί να καθαρίσει ένα μόνο δωμάτιο από το Home Assistant (χρειάζεται αντιστοίχιση δωματίων, Home Assistant 2026.3+).","clean.clean_now":"Καθάρισε τώρα","clean.cleaned":"Καθαρίστηκε {t}.","clean.cleaned_by":"Καθαρίστηκε {t} από {by}.","clean.cleaning_l":"καθαρίζεται","clean.cleaning_now":"Καθαρίζεται τώρα","clean.due":"Επόμενος","clean.every_d":"κάθε {n} ημ.","clean.in_d":"σε {n} ημ.","clean.last7":"Τελευταίες 7 ημέρες","clean.last_cleaned":"Τελευταίος καθαρισμός","clean.last_time":"Καθαρίστηκε την τελευταία φορά","clean.leg_fresh":"Πρόσφατα","clean.leg_now":"Τώρα","clean.map_hint":"Αντιστοίχισε αυτό το δωμάτιο με ένα από τα δωμάτια της σκούπας στις ρυθμίσεις της (Map vacuum segments to areas) για να το καθαρίζεις από εδώ.","clean.never":"ποτέ","clean.none_yet":"Δεν έχει καταγραφεί καθαρισμός εδώ ακόμα.","clean.not_cleaned":"δεν καθαρίστηκε","clean.now":"τώρα","clean.now_with":"Καθάρισε τώρα με {r}","clean.robot_usually":"Η σκούπα καθαρίζει συνήθως","clean.usually_takes":"Διαρκεί συνήθως","climate.auto":"Αυτόματο","climate.cooling":"Ψύξη","climate.defrosting":"Απόψυξη","climate.dry":"Αφύγρανση","climate.drying":"Αφύγρανση","climate.fan":"Ανεμιστήρας","climate.heating":"Θέρμανση","climate.idle":"Αδρανές","climate.off":"Κλειστό","climate.preheating":"Προθέρμανση","close":"Κλείσιμο","conn.radio":"Ασύρματο","cover.all":"Όλα","cover.close":"Κλείσιμο","cover.close_all":"Κλείσιμο όλων","cover.open":"Άνοιγμα","cover.open_all":"Άνοιγμα όλων","cover.position":"Θέση","cover.stop":"Στοπ","cover.stop_all":"Στοπ όλων","details":"Λεπτομέρειες","details_more":"Λεπτομέρειες ›","edit.hide_here":"Απόκρυψη εδώ (μόνο σε αυτό το επίπεδο)","energy.grid":"Δίκτυο ρεύματος","energy.last24":"Τελευταίες 24 ώρες","energy.loading":"Φόρτωση ενέργειας…","energy.no_data":"Τα δεδομένα ενέργειας δεν είναι διαθέσιμα","energy.none_yet":"Δεν υπάρχουν ακόμα συσκευές στις ρυθμίσεις Ενέργειας του Home Assistant. Πρόσθεσέ τες στις Ρυθμίσεις → Πίνακες εργαλείων → Ενέργεια και θα εμφανιστούν εδώ.","energy.not_on_plan":"Εκτός κάτοψης","energy.now_live":"Τώρα (ζωντανά)","energy.on_plan":"Στην κάτοψη","energy.panel":"Ηλεκτρικός πίνακας","energy.place_panel":"Τοποθέτησε τον Ηλεκτρικό πίνακα στο Floorplan Editor (Βήμα 3, Σημεία ενέργειας) για να δεις τις γραμμές ροής.","energy.rooms_darker":"Δωμάτια: πιο σκούρο = περισσότερη ενέργεια","energy.scrub":"Ενέργεια: οι τελευταίες 24 ώρες, ώρα με την ώρα","energy.solar":"Ηλιακά","floor.change_a":"Όροφος {f}, αλλαγή ορόφου","floor.change_t":"{f}: αλλαγή ορόφου","floor.down":"Όροφος κάτω","floor.floors":"Όροφοι","floor.left":"Κάτοψη αριστερά","floor.right":"Κάτοψη δεξιά","floor.up":"Όροφος πάνω","graphs_more":"Γραφήματα ›","heat.estimated":"Εκτίμηση ανάμεσα στους αισθητήρες","heat.room_temp":"Θερμοκρασία δωματίων","heat.strength":"Ένταση θερμικού χάρτη","hist.not_enough":"Δεν υπάρχει ακόμα αρκετό ιστορικό","humidity":"Υγρασία","humidity_details":"Λεπτομέρειες υγρασίας","humidity_l":"υγρασία","lay.air":"Ροή αέρα κλιματιστικών","lay.all_sensors":"Όλοι οι αισθητήρες","lay.cams":"Κάμερες","lay.cams_not_replay":"Κάμερες (όχι στην Αναπαραγωγή)","lay.clim":"Συσκευές κλιματισμού","lay.fill":"Σκίαση δωματίων","lay.flow":"Γραμμές ροής","lay.heat":"Θερμικός χάρτης","lay.labels":"Ετικέτες θερμοκρασίας","lay.no_cam_replay":"Χωρίς βίντεο κάμερας στην Αναπαραγωγή","lay.pall":"Κύκλοι γύρω από όλους τους proxies","lay.path":"Διαδρομή καθαρισμού","lay.path_last":"Διαδρομή του τελευταίου καθαρισμού","lay.pdist":"Απόσταση ατόμων","lay.reset":"Πίσω στις προεπιλογές της κάρτας","lay.rooms":"Ονόματα δωματίων","layers":"Στρώσεις","leg.colour_strength":"Ένταση χρώματος","mob.afternoon":"Καλό απόγευμα","mob.air_good":"Καλός αέρας","mob.air_mod":"Μέτριος αέρας","mob.air_poor":"Κακός αέρας","mob.alarm_panel":"Συναγερμός","mob.alert":"Συναγερμός","mob.all_closed":"Όλα κλειστά","mob.all_devices":"Όλες οι συσκευές","mob.all_fine":"Όλα εντάξει","mob.all_good":"Όλα εντάξει","mob.all_off":"Όλα σβηστά","mob.all_online":"Όλα συνδεδεμένα","mob.appliances":"Οικιακές συσκευές","mob.as_grid":"Εμφάνιση σε πλέγμα","mob.as_row":"Εμφάνιση σε σειρά","mob.back":"Πίσω","mob.battery":"Μπαταρία {n}%","mob.brightness":"Φωτεινότητα","mob.cameras":"Κάμερες","mob.card_desc":"Το σπίτι σας στο κινητό: δωμάτια, συσκευές και επικαλύψεις από το Floorplan.","mob.card_name":"Device Floorplan (κινητό)","mob.cfg_hide_header":"Απόκρυψη της πάνω μπάρας του Home Assistant στα κινητά","mob.cfg_hide_help":"Μόνο σε αυτόν τον πίνακα και όσο είναι ανοιχτός· το ☰ κάτω ανοίγει το μενού. Για επεξεργασία, προσθέστε ?edit=1 στη διεύθυνση.","mob.cfg_layout":"Διάταξη","mob.cfg_layout_help":"Αυτόματα: η εξερεύνηση του σπιτιού όταν γυρίζετε το κινητό οριζόντια.","mob.cfg_people":"Νοικοκυριό","mob.cfg_people_help":"Τα άτομα που μετράνε ως στο σπίτι / εκτός. Κενό: όλοι στο Home Assistant.","mob.cfg_room_order":"Σειρά δωματίων","mob.cfg_sections":"Ενότητες αρχικής σελίδας","mob.cfg_sections_help":"Ποιες ενότητες δείχνει η αρχική σελίδα, με αυτή τη σειρά.","mob.cfg_source":"Ρυθμίσεις από","mob.cfg_source_auto":"Αυτόματα (η πρώτη κάρτα Floorplan που βρέθηκε)","mob.cfg_source_help":"Η κάρτα Floorplan της οποίας τα overlays, τις συσκευές, τα άτομα, τις σκηνές και την εμφάνιση χρησιμοποιεί η κάρτα κινητού (ποτέ τη διάταξή της).","mob.climate_to":"{s} στους {t}°","mob.control":"Έλεγχος","mob.details":"Λεπτομέρειες","mob.devices":"Συσκευές","mob.door":"Πόρτα","mob.door_open":"Πόρτα ανοιχτή","mob.energy":"Ενέργεια","mob.evening":"Καλησπέρα","mob.floor_down":"Όροφος από κάτω","mob.floor_up":"Όροφος από πάνω","mob.floors":"Όροφοι","mob.g_appl":"Οικιακές συσκευές","mob.g_comfort":"Άνεση","mob.g_lights":"Φώτα","mob.g_media":"Πολυμέσα","mob.g_other":"Άλλα","mob.g_security":"Ασφάλεια","mob.hide":"Απόκρυψη","mob.hint_land":"Πατήστε ένα δωμάτιο για να το ανοίξετε ή μια συσκευή για να τη χειριστείτε","mob.hint_port":"Πατήστε ένα δωμάτιο για να το ανοίξετε","mob.home":"Αρχική","mob.home_control":"Έλεγχος σπιτιού","mob.house_hint":"Πατήστε έναν όροφο για να τον ανοίξετε","mob.k_of_n_home":"{k}/{n} στο σπίτι","mob.last":"Τελευταία λειτουργία","mob.last_run":"Τελευταία λειτουργία {t}","mob.layout_auto":"Αυτόματα","mob.layout_landscape":"Πάντα οριζόντια","mob.layout_portrait":"Πάντα κάθετα","mob.lights_on":{"one":"{n} φως αναμμένο","other":"{n} φώτα αναμμένα"},"mob.measured":"τώρα, από τις συσκευές με μέτρηση ισχύος","mob.menu":"Μενού Home Assistant","mob.morning":"Καλημέρα","mob.n_attention":{"one":"{n} θέλει προσοχή","other":"{n} θέλουν προσοχή"},"mob.n_devices":{"one":"{n} συσκευή","other":"{n} συσκευές"},"mob.n_floors":{"one":"{n} όροφος","other":"{n} όροφοι"},"mob.n_home":{"one":"{n} άτομο στο σπίτι","other":"{n} άτομα στο σπίτι"},"mob.n_low":{"one":"{n} χαμηλή μπαταρία","other":"{n} χαμηλές μπαταρίες"},"mob.n_offline":{"one":"{n} εκτός σύνδεσης","other":"{n} εκτός σύνδεσης"},"mob.n_on":{"one":"{n} ενεργό","other":"{n} ενεργά"},"mob.n_rooms":{"one":"{n} δωμάτιο","other":"{n} δωμάτια"},"mob.n_shown":{"one":"{n} εμφανίζεται","other":"{n} εμφανίζονται"},"mob.n_warn":{"one":"{n} προειδοποίηση","other":"{n} προειδοποιήσεις"},"mob.needs_look":"Θέλει προσοχή","mob.next_room":"Επόμενο δωμάτιο","mob.no_people":"Κανένα άτομο","mob.no_plans":"Δεν υπάρχουν χάρτες ακόμη: σχεδιάστε έναν στον Floorplan Editor.","mob.no_room":"Χωρίς δωμάτιο","mob.nothing":"Τίποτα εδώ","mob.now_n":{"one":"{n} πράγμα σε εξέλιξη","other":"{n} πράγματα σε εξέλιξη"},"mob.offline":"Εκτός σύνδεσης","mob.open":"Ανοιχτό","mob.open_n":{"one":"{n} ανοιχτό","other":"{n} ανοιχτά"},"mob.openings":"Ανοίγματα","mob.order_active":"Πιο ενεργά πρώτα","mob.order_alpha":"Αλφαβητικά","mob.order_plan":"Σειρά του χάρτη","mob.outside":"έξω","mob.people":"Άτομα","mob.power":"Ισχύς","mob.prev_room":"Προηγούμενο δωμάτιο","mob.program":"Πρόγραμμα","mob.quiet":"Ήσυχα","mob.rooms":"Δωμάτια","mob.search":"Αναζήτηση συσκευών ή δωματίων","mob.sec_appliances":"Οικιακές συσκευές","mob.sec_cameras":"Κάμερες","mob.sec_control":"Έλεγχος σπιτιού","mob.sec_rooms":"Δωμάτια","mob.see_all":"Όλα","mob.show_plan":"Εμφάνιση χάρτη","mob.shutters":"Ρολά","mob.status":"Κατάσταση","mob.whole_home":"όλο το σπίτι","motion.clear":"Καμία κίνηση","motion.detected":"Κίνηση","n_devices":{"one":"{n} συσκευή","other":"{n} συσκευές"},"net.ap":"Σημείο πρόσβασης","net.cable":"καλώδιο","net.cable_lan":"Καλώδιο (LAN)","net.connected_devices":"Συνδεδεμένες συσκευές ({n})","net.connected_here":"Συνδεδεμένες εδώ","net.connection":"Σύνδεση","net.connections":"Συνδέσεις","net.default":"Προεπιλογή","net.fair":"μέτριο","net.good":"καλό","net.hub_links":"Συνδέσεις μέσω hub / γέφυρας","net.includes":"Περιλαμβάνει","net.legend":"Υπόμνημα","net.link":"Σύνδεσμος","net.no_lqi":"Δεν είναι γνωστή ακόμα η ποιότητα σύνδεσης (τα δεδομένα ZHA φορτώνονται για διαχειριστές).","net.no_signal":"Χωρίς τιμή σήματος: ενεργοποίησε τον αισθητήρα σήματος της συσκευής στο Home Assistant για να το δεις εδώ.","net.not_connected":"δεν είναι συνδεδεμένο","net.not_on_floor":"όχι σε αυτόν τον όροφο","net.on_floor":"σε αυτόν τον όροφο","net.path":"Διαδρομή","net.refresh":"Ανανέωση","net.rescan":"Νέα σάρωση του δικτύου Zigbee","net.role":"Ρόλος","net.router":"Router","net.scanning":"Σάρωση…","net.show_hide":"Εμφάνιση / απόκρυψη","net.show_hide_range":"Εμφάνιση / απόκρυψη συνδέσεων σε αυτό το εύρος","net.signal":"Σήμα","net.through":"Μέσω {d}","net.through_k":"Μέσω","net.via_hub":"μέσω hub / γέφυρας","net.weak":"αδύναμο","net.wifi_links":"Συνδέσεις Wi-Fi / LAN","net.wifi_net":"Δίκτυο Wi-Fi","net.zha_at":"Τα δεδομένα Zigbee ενημερώθηκαν στις {t}","net.zigbee_links":"Συνδέσεις Zigbee","newov.add":"Προσθήκη σε αυτή την κάρτα","newov.energy":". Μετά τοποθέτησε τους αισθητήρες ενέργειας στο Floorplan Editor (Βήμα 3, Σημεία ενέργειας) για τις γραμμές ροής.","newov.not_now":"Όχι τώρα","newov.text":"Νέο: επίπεδο {o}","offline":"Εκτός σύνδεσης","open_more":"Άνοιγμα ›","ov.cleaning":"Καθαρισμός","ov.comfort":"Άνεση","ov.custom":"Προσαρμοσμένο","ov.energy":"Ενέργεια","ov.health":"Υγεία","ov.lights":"Φώτα","ov.live":"Ζωντανά","ov.network":"Δίκτυο","ov.people":"Άτομα","ov.plan":"Κάτοψη","ov.security":"Ασφάλεια","people.home":"Σπίτι","people.home_unknown":"στο σπίτι, άγνωστο δωμάτιο","people.not_sure":"όχι σίγουρο","ph.average":"μέσος όρος","ph.highest":"υψηλότερη","ph.lowest":"χαμηλότερη","ph.one":"ένας αισθητήρας","phantom":"Εικονική","phantom.place_hint":"Τοποθέτησε αυτές τις συσκευές στην κάτοψη στο Floorplan Editor για να βλέπεις την καθεμία χωριστά.","press.do":"Πάτημα","press.q":"Πάτημα «{b}»;","robot.area":"Επιφάνεια","robot.charging":"Φορτίζει","robot.charging_l":"φορτίζει","robot.cleaning":"Καθαρίζει","robot.consumables":"Αναλώσιμα","robot.continue":"Συνέχεια","robot.dock":"Βάση","robot.docked":"Στη βάση","robot.error":"Σφάλμα","robot.idle":"Αδρανής","robot.last_cleaning":"Τελευταίος καθαρισμός","robot.pause":"Παύση","robot.paused":"Σε παύση","robot.returning":"Επιστρέφει","robot.settings":"Ρυθμίσεις","robot.start":"Έναρξη","robot.this_run":"Αυτός ο κύκλος","robot.took":"Διάρκεια","role.ap":"Router / σημείο πρόσβασης","role.btproxy":"Bluetooth proxy","role.coordinator":"Coordinator","role.device":"Συσκευή","role.end":"Τελική συσκευή","role.gp":"Χωρίς μπαταρία (Green Power)","role.hub":"Hub / γέφυρα","role.router":"Router / αναμεταδότης","role.unavailable":"Μη διαθέσιμη","role.unknown":"Άγνωστο","rp.avg_temp":"Μέση θερμοκρασία δωματίων ({u}), χαμηλότερη–υψηλότερη","rp.back_now":"Πίσω στο τώρα","rp.before":"Πριν από τις {n} ώρες που φορτώθηκαν: εμφανίζεται η αρχή τους","rp.close":"Κλείσιμο Home Replay","rp.day":"Ημέρα","rp.future":"Αυτή η ώρα δεν έχει έρθει ακόμα: εμφανίζεται το Τώρα","rp.go":"Μετάβαση","rp.goto":"Μετάβαση σε ημέρα και ώρα","rp.name":"Home Replay","rp.next":"Επόμενο συμβάν","rp.no_switch":"Αναπαραγωγή: πάτα ← Τώρα για να χειριστείς συσκευές","rp.now":"Τώρα","rp.overlay":"Επίπεδο για αναπαραγωγή","rp.pause":"Παύση","rp.play":"Αναπαραγωγή","rp.prev":"Προηγούμενο συμβάν","rp.range":"Εύρος","rp.short":"Αναπαραγωγή","rp.speed":"Ταχύτητα","rp.tap_goto":"Πάτα για να πας σε ημέρα και ώρα","rp.time":"Ώρα αναπαραγωγής","rp.time_input":"Ώρα (τα δευτερόλεπτα προαιρετικά)","rp.today":"Σήμερα","rp.yesterday":"Χθες","save.cam_failed":"Δεν ήταν δυνατή η αποθήκευση της θέσης της κάμερας.","scene.all_off":"Όλα σβηστά","scene.all_on":"Όλα αναμμένα","scene.bar":"Σκηνές φωτισμού","scene.n":"Σκηνή {n}","sec.all_closed":"Όλα κλειστά","sec.all_secure":"Όλα ασφαλή","sec.n_open":"{n} ανοιχτά","shortcut":"Συντόμευση","temperature":"Θερμοκρασία","temperature_details":"Λεπτομέρειες θερμοκρασίας","temperature_l":"θερμοκρασία","this_device":"Αυτή η συσκευή","time.ago":"πριν από {t}","time.just_now":"μόλις τώρα","time.now":"τώρα","tip.close":"Κλείσιμο συμβουλής","tip.go":"Δοκίμασέ τα","tip.new_in":"Νέο στην {v}","tip.text":"Χριστουγεννιάτικα φωτάκια & δέντρα, και ένα dashboard για το κινητό","toast.cleaning_started":"Ο καθαρισμός ξεκίνησε","toast.no_shortcuts_editing":"Οι συντομεύσεις δεν εκτελούνται κατά την επεξεργασία","toast.pressed":"Πατήθηκε · {b}","toast.preview_not_run":"Προεπισκόπηση: το “{b}” δεν εκτελείται κατά την επεξεργασία","toast.unavailable":"{d}: μη διαθέσιμη","toast.would_open":"Θα άνοιγε: {u}","toast.would_press":"Θα πατούσε: {b}","turn_off":"Σβήσιμο","turn_on":"Άναμμα","unavailable_l":"μη διαθέσιμο","unit.d":"{n} ημ.","unit.h":"{n} ώρ.","unit.min":"{n} λεπ.","yes":"ναι"},"en":{"action":"Action","actions":"Actions","admin.new_place":"{n} new · Place them","admin.new_short":"{n} new","admin.new_title":{"one":"{n} new device · only admins see this","other":"{n} new devices · only admins see this"},"alloff.n_on":{"one":"{n} light is on.","other":"{n} lights are on."},"alloff.none":"No light is on right now.","alloff.q":"Turn all lights off?","appl.appliances":"Appliances","appl.done_unload":"Done · tap to unload","appl.door_open":"Door open","appl.drying":"Drying","appl.error":"Error","appl.finished":"Finished","appl.idle":"Idle","appl.min_elapsed":"{n} min elapsed","appl.min_left":"{n} min remaining","appl.paused":"Paused","appl.pct_done":"{n}% done","appl.run_coffee":"Brewing","appl.run_oven":"Cooking","appl.run_printer":"Printing","appl.running":"Running","appl.unavailable":"Status unavailable","appl.unloaded":"Unloaded","bar.more":"More buttons","bar.overlays":"Overlays","bar.scroll_back":"Scroll back","battery":"Battery","bond":"Bond","cancel":"Cancel","card.choose_plan":"Choose a plan (plan: <plan id>)","card.description":"Your floorplan with live overlays: Live, Lights, Comfort, Security, Network, Health and your own.","card.plan_missing":"Plan “{p}” not found. Check the plan id, or open the Floorplan Editor in the sidebar.","chip.n_of_on":"{n} of {t} on","chip.n_of_open":"{n} of {t} open","chip.n_on":"{n} on","chip.n_open":"{n} open","chip.off":"Off","chip.on":"On","clean.cant_room":"Your robot can't clean a single room from Home Assistant (needs its room mapping, Home Assistant 2026.3+).","clean.clean_now":"Clean now","clean.cleaned":"Cleaned {t}.","clean.cleaned_by":"Cleaned {t} by {by}.","clean.cleaning_l":"cleaning","clean.cleaning_now":"Cleaning now","clean.due":"Due","clean.every_d":"every {n} d","clean.in_d":"in {n} d","clean.last7":"Last 7 days","clean.last_cleaned":"Last cleaned","clean.last_time":"Cleaned last time","clean.leg_fresh":"Fresh","clean.leg_now":"Now","clean.map_hint":"Map this room to one of the robot's rooms in its settings (Map vacuum segments to areas) to clean it from here.","clean.never":"never","clean.none_yet":"No cleaning recorded here yet.","clean.not_cleaned":"not cleaned","clean.now":"now","clean.now_with":"Clean now with {r}","clean.robot_usually":"Robot usually cleans","clean.usually_takes":"Usually takes","climate.auto":"Auto","climate.cooling":"Cooling","climate.defrosting":"Defrosting","climate.dry":"Dry","climate.drying":"Drying","climate.fan":"Fan","climate.heating":"Heating","climate.idle":"Idle","climate.off":"Off","climate.preheating":"Preheating","close":"Close","conn.radio":"Wireless","cover.all":"All","cover.close":"Close","cover.close_all":"Close all","cover.open":"Open","cover.open_all":"Open all","cover.position":"Position","cover.stop":"Stop","cover.stop_all":"Stop all","details":"Details","details_more":"Details ›","edit.hide_here":"Hide it here (in this overlay only)","energy.grid":"Grid","energy.last24":"Last 24 h","energy.loading":"Loading energy…","energy.no_data":"Energy data not available","energy.none_yet":"No devices in Home Assistant's Energy settings yet. Add them under Settings → Dashboards → Energy, and they show here.","energy.not_on_plan":"Not on this plan","energy.now_live":"Now (live)","energy.on_plan":"On the plan","energy.panel":"Electrical panel","energy.place_panel":"Place the Electrical panel in the Floorplan Editor (Step 3, Energy points) to see the flow lines.","energy.rooms_darker":"Rooms: darker = more energy","energy.scrub":"Energy: the last 24 hours, hour by hour","energy.solar":"Solar","floor.change_a":"Floor {f}, change floor","floor.change_t":"{f}: change floor","floor.down":"Floor down","floor.floors":"Floors","floor.left":"Plan to the left","floor.right":"Plan to the right","floor.up":"Floor up","graphs_more":"Graphs ›","heat.estimated":"Estimated between sensors","heat.room_temp":"Room temperature","heat.strength":"Heatmap strength","hist.not_enough":"Not enough history yet","humidity":"Humidity","humidity_details":"Humidity details","humidity_l":"humidity","lay.air":"AC air flow","lay.all_sensors":"All sensors","lay.cams":"Cameras","lay.cams_not_replay":"Cameras (not in Replay)","lay.clim":"Climate devices","lay.fill":"Room shading","lay.flow":"Flow lines","lay.heat":"Heatmap","lay.labels":"Temperature labels","lay.no_cam_replay":"No camera video in Replay","lay.pall":"Rings around all proxies","lay.path":"Cleaning path","lay.path_last":"Path of the last run","lay.pdist":"People distance","lay.reset":"Back to the card's defaults","lay.rooms":"Room names","layers":"Layers","leg.colour_strength":"Colour strength","mob.afternoon":"Good afternoon","mob.air_good":"Air good","mob.air_mod":"Air moderate","mob.air_poor":"Air poor","mob.alarm_panel":"Alarm","mob.alert":"Alert","mob.all_closed":"All closed","mob.all_devices":"All devices","mob.all_fine":"All fine","mob.all_good":"All good","mob.all_off":"All off","mob.all_online":"All online","mob.appliances":"Appliances","mob.as_grid":"Show as a grid","mob.as_row":"Show as a row","mob.back":"Back","mob.battery":"Battery {n}%","mob.brightness":"Brightness","mob.cameras":"Cameras","mob.card_desc":"Your home on the phone: rooms, devices and overlays from the Floorplan.","mob.card_name":"Device Floorplan (mobile)","mob.cfg_hide_header":"Hide Home Assistant's top bar on phones","mob.cfg_hide_help":"Only on this dashboard and while it is open; ☰ at the bottom opens the menu. To edit the dashboard, add ?edit=1 to its address.","mob.cfg_layout":"Layout","mob.cfg_layout_help":"Automatic: the house explorer when a phone is turned sideways.","mob.cfg_people":"Household","mob.cfg_people_help":"The people counted as home / away. Empty: everyone in Home Assistant.","mob.cfg_room_order":"Room order","mob.cfg_sections":"Home page sections","mob.cfg_sections_help":"Which sections the Home page shows, in this order.","mob.cfg_source":"Settings from","mob.cfg_source_auto":"Automatic (the first Floorplan card found)","mob.cfg_source_help":"The Floorplan card whose overlays, devices, people, scenes and look the mobile card uses (never its layout).","mob.climate_to":"{s} to {t}°","mob.control":"Control","mob.details":"Details","mob.devices":"Devices","mob.door":"Door","mob.door_open":"Door open","mob.energy":"Energy","mob.evening":"Good evening","mob.floor_down":"Floor below","mob.floor_up":"Floor above","mob.floors":"Floors","mob.g_appl":"Appliances","mob.g_comfort":"Comfort","mob.g_lights":"Lights","mob.g_media":"Media","mob.g_other":"Other","mob.g_security":"Security","mob.hide":"Hide","mob.hint_land":"Tap a room to open it, or a device to control it","mob.hint_port":"Tap a room to open it","mob.home":"Home","mob.home_control":"Home control","mob.house_hint":"Tap a floor to open it","mob.k_of_n_home":"{k}/{n} home","mob.last":"Last run","mob.last_run":"Last run {t}","mob.layout_auto":"Automatic","mob.layout_landscape":"Always landscape","mob.layout_portrait":"Always portrait","mob.lights_on":{"one":"{n} light on","other":"{n} lights on"},"mob.measured":"now, from the devices with a power reading","mob.menu":"Home Assistant menu","mob.morning":"Good morning","mob.n_attention":{"one":"{n} needs a look","other":"{n} need a look"},"mob.n_devices":{"one":"{n} device","other":"{n} devices"},"mob.n_floors":{"one":"{n} floor","other":"{n} floors"},"mob.n_home":{"one":"{n} person home","other":"{n} people home"},"mob.n_low":{"one":"{n} low battery","other":"{n} low batteries"},"mob.n_offline":{"one":"{n} offline","other":"{n} offline"},"mob.n_on":{"one":"{n} on","other":"{n} on"},"mob.n_rooms":{"one":"{n} room","other":"{n} rooms"},"mob.n_shown":{"one":"{n} shown","other":"{n} shown"},"mob.n_warn":{"one":"{n} warning","other":"{n} warnings"},"mob.needs_look":"Needs a look","mob.next_room":"Next room","mob.no_people":"No people","mob.no_plans":"No Floorplan plans yet: draw one in the Floorplan Editor.","mob.no_room":"No room","mob.nothing":"Nothing here","mob.now_n":{"one":"{n} thing going on","other":"{n} things going on"},"mob.offline":"Offline","mob.open":"Open","mob.open_n":{"one":"{n} open","other":"{n} open"},"mob.openings":"Openings","mob.order_active":"Most active first","mob.order_alpha":"Alphabetical","mob.order_plan":"Plan order","mob.outside":"outside","mob.people":"People","mob.power":"Power","mob.prev_room":"Previous room","mob.program":"Program","mob.quiet":"Quiet","mob.rooms":"Rooms","mob.search":"Search devices or rooms","mob.sec_appliances":"Appliances","mob.sec_cameras":"Cameras","mob.sec_control":"Home control","mob.sec_rooms":"Rooms","mob.see_all":"See all","mob.show_plan":"Show the plan","mob.shutters":"Shutters","mob.status":"Status","mob.whole_home":"whole home","motion.clear":"Clear","motion.detected":"Detected","n_devices":{"one":"{n} device","other":"{n} devices"},"net.ap":"Access point","net.cable":"cable","net.cable_lan":"Cable (LAN)","net.connected_devices":"Connected devices ({n})","net.connected_here":"Connected here","net.connection":"Connection","net.connections":"Connections","net.default":"Default","net.fair":"fair","net.good":"good","net.hub_links":"Hub / bridge links","net.includes":"Includes","net.legend":"Legend","net.link":"Link","net.no_lqi":"No link quality known yet (ZHA data is loaded for admins).","net.no_signal":"No signal value: enable this device's signal sensor in Home Assistant to see it here.","net.not_connected":"not connected","net.not_on_floor":"not on this floor","net.on_floor":"on this floor","net.path":"Path","net.refresh":"Refresh","net.rescan":"Scan the Zigbee network again","net.role":"Role","net.router":"Router","net.scanning":"Scanning…","net.show_hide":"Show / hide","net.show_hide_range":"Show / hide links in this range","net.signal":"Signal","net.through":"Through {d}","net.through_k":"Through","net.via_hub":"through hub / bridge","net.weak":"weak","net.wifi_links":"Wi-Fi / LAN links","net.wifi_net":"Wi-Fi network","net.zha_at":"Zigbee data updated at {t}","net.zigbee_links":"Zigbee links","newov.add":"Add to this card","newov.energy":". Then place your energy sensors in the Floorplan Editor (Step 3, Energy points) for the flow lines.","newov.not_now":"Not now","newov.text":"New: {o} overlay","offline":"Offline","open_more":"Open ›","ov.cleaning":"Cleaning","ov.comfort":"Comfort","ov.custom":"Custom","ov.energy":"Energy","ov.health":"Health","ov.lights":"Lights","ov.live":"Live","ov.network":"Network","ov.people":"People","ov.plan":"Plan","ov.security":"Security","people.home":"Home","people.home_unknown":"home, room unknown","people.not_sure":"not sure","ph.average":"average","ph.highest":"highest","ph.lowest":"lowest","ph.one":"one sensor","phantom":"Phantom","phantom.place_hint":"Place these devices on the plan in the Floorplan Editor to see each one on its own.","press.do":"Press","press.q":"Press “{b}”?","robot.area":"Area","robot.charging":"Charging","robot.charging_l":"charging","robot.cleaning":"Cleaning","robot.consumables":"Consumables","robot.continue":"Continue","robot.dock":"Dock","robot.docked":"Docked","robot.error":"Error","robot.idle":"Idle","robot.last_cleaning":"Last cleaning","robot.pause":"Pause","robot.paused":"Paused","robot.returning":"Returning","robot.settings":"Settings","robot.start":"Start","robot.this_run":"This run","robot.took":"Took","role.ap":"Router / access point","role.btproxy":"Bluetooth proxy","role.coordinator":"Coordinator","role.device":"Device","role.end":"End device","role.gp":"Battery-free (Green Power)","role.hub":"Hub / bridge","role.router":"Router / repeater","role.unavailable":"Unavailable","role.unknown":"Unknown","rp.avg_temp":"Average room temperature ({u}), lowest–highest","rp.back_now":"Back to now","rp.before":"Before the loaded {n} h: showing their start","rp.close":"Close Home Replay","rp.day":"Day","rp.future":"That time is still to come: showing Now","rp.go":"Go","rp.goto":"Go to a day and time","rp.name":"Home Replay","rp.next":"Next event","rp.no_switch":"Replay: tap ← Now to switch devices","rp.now":"Now","rp.overlay":"Overlay to replay","rp.pause":"Pause","rp.play":"Play","rp.prev":"Previous event","rp.range":"Range","rp.short":"Replay","rp.speed":"Speed","rp.tap_goto":"Tap to go to a day and time","rp.time":"Replay time","rp.time_input":"Time (seconds optional)","rp.today":"Today","rp.yesterday":"Yesterday","save.cam_failed":"Couldn't save the camera spot.","scene.all_off":"All off","scene.all_on":"All on","scene.bar":"Light scenes","scene.n":"Scene {n}","sec.all_closed":"All closed","sec.all_secure":"All secure","sec.n_open":"{n} open","shortcut":"Shortcut","temperature":"Temperature","temperature_details":"Temperature details","temperature_l":"temperature","this_device":"This device","time.ago":"{t} ago","time.just_now":"just now","time.now":"now","tip.close":"Close this tip","tip.go":"Try them","tip.new_in":"New in {v}","tip.text":"Christmas lights & trees, and a dashboard for your phone","toast.cleaning_started":"Cleaning started","toast.no_shortcuts_editing":"Shortcuts aren't run while editing","toast.pressed":"Pressed · {b}","toast.preview_not_run":"Preview: “{b}” isn't run while editing","toast.unavailable":"{d} is unavailable","toast.would_open":"Would open: {u}","toast.would_press":"Would press: {b}","turn_off":"Turn off","turn_on":"Turn on","unavailable_l":"unavailable","unit.d":"{n} d","unit.h":"{n} h","unit.min":"{n} min","yes":"yes"}};
// 0.14 (L1): the card's texts in the user's Home Assistant language (English when a text has no translation).
// tools/build.mjs joins this file and the language files of src/i18n into each bundle that uses dfT().
let dfLang = "en";
let dfLoc = "en";
/** Pick the language: "el", "de", "de-CH" → "de"; anything else → English. */
function dfSetLang(lang) {
  const s = String(lang || "en");
  const low = s.toLowerCase();
  dfLoc = s;
  dfLang = DF_I18N[low] ? low : DF_I18N[low.split("-")[0]] ? low.split("-")[0] : "en";
}
/** The language of this Home Assistant user (profile → Language). */
function dfLangOf(hass) {
  if (hass) dfSetLang((hass.locale && hass.locale.language) || hass.language);
}
/** For dates and times: the user's language, so "Mon" / "Δευ" / "Mo." follow it. */
const dfLocale = () => dfLoc;
/** A text by key, with {name} placeholders; a {one, other} text picks its plural from vars.n. */
function dfT(key, vars) {
  let s = (DF_I18N[dfLang] || {})[key];
  if (s == null) s = DF_I18N.en[key];
  if (s == null) return key;
  if (typeof s === "object") {
    let cat = "other";
    try {
      cat = new Intl.PluralRules(dfLang).select(Number(vars && vars.n));
    } catch (_e) {
      cat = "other";
    }
    s = s[cat] ?? s.other;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}
dfSetLang(typeof document !== "undefined" && document.documentElement ? document.documentElement.lang : "en");
// ---- end of translations ----
// ---- 0.10: robot vacuums. A map integration (Xiaomi Cloud Map Extractor, Dreame, Roborock Custom Map, AnyVac…)
// gives the robot, dock, path and rooms in its own units; m turns them into % of the plan image.
const RB_ACTIVE = ["cleaning", "returning", "paused", "error"];
/** 0.10: two or more robots on a floor: each its own colour (marker and path), in the order they were added. */
const RB_OWN = ["33,150,243", "142,36,170", "0,150,136", "255,112,67", "121,85,72", "233,30,99"];
const rbOwn = (a, eid) => {
  const list = Object.keys((a && a.robots) || {});
  return list.length > 1 ? RB_OWN[Math.max(0, list.indexOf(eid)) % RB_OWN.length] : null;
};
const RB_COL = { cleaning: "33,150,243", returning: "0,172,193", paused: "251,140,0", error: "229,57,53", docked: "120,144,156", idle: "120,144,156" };
function rbPt(v) {
  if (Array.isArray(v) && v.length >= 2 && v.length <= 3 && num(v[0]) && num(v[1])) return { x: +v[0], y: +v[1], a: num(v[2]) ? +v[2] : null };
  if (v && typeof v === "object" && !Array.isArray(v) && num(v.x) && num(v.y)) return { x: +v.x, y: +v.y, a: num(v.a) ? +v.a : num(v.angle) ? +v.angle : null };
  return null;
}
/** Every polyline inside a path attribute, whatever its nesting ({x,y} lists, [x,y] lists, flat numbers). */
function rbLines(v, out = [], d = 0) {
  if (!v || d > 6 || typeof v !== "object") return out;
  if (Array.isArray(v)) {
    const pts = v.map(rbPt);
    if (v.length > 1 && pts.every(Boolean)) out.push(pts);
    else if (v.length > 3 && v.length % 2 === 0 && v.every((n) => typeof n === "number")) {
      const p = [];
      for (let i = 0; i < v.length; i += 2) p.push({ x: v[i], y: v[i + 1] });
      out.push(p);
    } else for (const w of v) rbLines(w, out, d + 1);
  } else for (const w of Object.values(v)) rbLines(w, out, d + 1);
  return out;
}
function rbRooms(v) {
  const list = Array.isArray(v) ? v.map((r, i) => [String((r && (r.id ?? r.segment_id ?? r.room_id)) ?? i), r]) : v && typeof v === "object" ? Object.entries(v) : [];
  return list.map(([k, r]) => {
    if (!r || typeof r !== "object") return null;
    const b = Array.isArray(r.box) ? r.box : [r.x0, r.y0, r.x1, r.y1];
    if (!b.every(num)) return null;
    const id = String(r.room_id ?? r.segment_id ?? r.id ?? k);
    return { id, name: String(r.name || r.room_name || ""), x0: Math.min(b[0], b[2]), y0: Math.min(b[1], b[3]), x1: Math.max(b[0], b[2]), y1: Math.max(b[1], b[3]) };
  }).filter(Boolean);
}
/** What a robot reports now: its vacuum entity's state plus the map entity's attributes. */
function rbRead(hass, eid, cfg) {
  const vs = hass.states[eid];
  const ms = cfg && cfg.source ? hass.states[cfg.source] : null;
  const A = { ...((vs && vs.attributes) || {}), ...((ms && ms.attributes) || {}) };
  const lines = rbLines(A.path || A.vacuum_path || A.cleaned_path);
  const calib = Array.isArray(A.calibration_points) ? A.calibration_points.map((c) => ({ r: rbPt(c && c.vacuum), p: rbPt(c && c.map) })).filter((c) => c.r && c.p) : [];
  const room = A.vacuum_room ?? A.current_segment ?? A.current_room ?? null;
  const rooms = rbRooms(A.rooms || A.segments);
  const mapName = ["map_name", "selected_map", "current_map", "active_map", "map_id"].map((k) => A[k]).find((v) => v != null && v !== "" && typeof v !== "object");
  return {
    state: vs ? vs.state : "unavailable",
    pos: rbPt(A.vacuum_position || A.robot_position || A.position),
    dock: rbPt(A.charger || A.charger_position || A.dock_position),
    lines,
    rooms,
    mapName: mapName != null ? String(mapName) : null,
    room: room != null && typeof room !== "object" ? String(room) : null,
    calib,
    pic: ms && ms.attributes.entity_picture,
    attrs: A,
  };
}
/** Robots that do several floors: is it on the map this plan was aligned with? (Same rule as robots.py.) */
function rbOnMap(saved, d) {
  if (!saved) return true;
  if (saved.name && d.mapName) return saved.name === d.mapName;
  const want = new Set(saved.rooms || []);
  const have = d.rooms.map((r) => r.id);
  if (!want.size || !have.length) return true;
  return have.filter((id) => want.has(id)).length * 2 >= want.size;
}
const rbSig = (d) => ({ name: d.mapName, rooms: d.rooms.map((r) => r.id) });
const rbApply = (m, p) => ({ x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] });
/** Best fit robot → plan (scale, turn, move; mirrored or not) from pairs {r:{x,y}, p:{x,y} in %}. */
function rbFit(pairs, ratio) {
  if (pairs.length < 2) return null;
  let best = null;
  for (const fy of [-1, 1]) {
    const R = pairs.map((q) => [q.r.x, fy * q.r.y]);
    const P = pairs.map((q) => [q.p.x * ratio, q.p.y]);
    const n = R.length;
    const rc = [R.reduce((t, q) => t + q[0], 0) / n, R.reduce((t, q) => t + q[1], 0) / n];
    const pc = [P.reduce((t, q) => t + q[0], 0) / n, P.reduce((t, q) => t + q[1], 0) / n];
    let ar = 0;
    let ai = 0;
    let sr = 0;
    for (let i = 0; i < n; i++) {
      const [rx, ry] = [R[i][0] - rc[0], R[i][1] - rc[1]];
      const [px, py] = [P[i][0] - pc[0], P[i][1] - pc[1]];
      ar += px * rx + py * ry;
      ai += py * rx - px * ry;
      sr += rx * rx + ry * ry;
    }
    if (!sr) continue;
    ar /= sr;
    ai /= sr;
    const tu = pc[0] - (ar * rc[0] - ai * rc[1]);
    const tv = pc[1] - (ai * rc[0] + ar * rc[1]);
    let err = 0;
    for (let i = 0; i < n; i++) err += (ar * R[i][0] - ai * R[i][1] + tu - P[i][0]) ** 2 + (ai * R[i][0] + ar * R[i][1] + tv - P[i][1]) ** 2;
    // Two rooms fit both ways: robot maps usually count y upwards, so mirrored wins a tie.
    if (!best || err < best.err - 1e-6) best = { err, m: [ar / ratio, (-ai * fy) / ratio, tu / ratio, ai, ar * fy, tv] };
  }
  return best && best.m;
}
/** Like rbFit, but a plan drawn a bit squeezed is allowed: turn (+ mirror), then a scale per plan axis.
 *  Used only with 4+ rooms and only when clearly better, so a few misplaced room names can't distort a good plan. */
function rbFit2(pairs, ratio) {
  const sim = rbFit(pairs, ratio);
  if (!sim) return null;
  const P = pairs.map((q) => [q.p.x * ratio, q.p.y]);
  const err = (m) => pairs.reduce((t, q, i) => { const a = rbApply(m, q.r); return t + (a.x * ratio - P[i][0]) ** 2 + (a.y - P[i][1]) ** 2; }, 0);
  const out = { m: sim, sx: 1, sy: 1, err: err(sim) };
  if (pairs.length < 3) return out;
  const fy = sim[0] * sim[4] - sim[1] * sim[3] < 0 ? -1 : 1;
  const th0 = Math.atan2(sim[3], sim[0] * ratio);
  const solve = (th) => {
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const R = pairs.map((q) => [c * q.r.x - sn * fy * q.r.y, sn * q.r.x + c * fy * q.r.y]);
    const line = (k) => {
      const n = R.length;
      const mx = R.reduce((t, r) => t + r[k], 0) / n;
      const my = P.reduce((t, p) => t + p[k], 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) { num += (R[i][k] - mx) * (P[i][k] - my); den += (R[i][k] - mx) ** 2; }
      const sc = den ? num / den : 0;
      return [sc, my - sc * mx];
    };
    const [sx, tx] = line(0);
    const [sy, ty] = line(1);
    if (!(sx > 0 && sy > 0)) return null;
    const m = [(sx * c) / ratio, (-sx * sn * fy) / ratio, tx / ratio, sy * sn, sy * c * fy, ty];
    return { m, sx, sy, err: err(m) };
  };
  let best = null;
  for (let k = -32; k <= 32; k++) { const r = solve(th0 + (k * 0.25 * Math.PI) / 180); if (r && (!best || r.err < best.err)) best = r; }
  if (best) for (let k = -10; k <= 10; k++) { const r = solve(Math.atan2(best.m[3], best.m[0] * ratio) + (k * 0.025 * Math.PI) / 180); if (r && r.err < best.err) best = r; }
  if (!best) return out;
  // Keep it only when clearly better than the plain fit (F-test, one extra parameter, ~95 %).
  const k = best.sx / best.sy;
  const dof = 2 * pairs.length - 5;
  const F = best.err > 1e-9 ? ((out.err - best.err) / best.err) * dof : Infinity;
  return pairs.length >= 4 && F > 3.84 + 25 / dof ** 1.3 && Math.abs(k - 1) > 0.015 && k > 0.75 && k < 1.33 ? best : out;
}
if (!window.__dfcRobot) window.__dfcRobot = { read: rbRead, apply: rbApply, fit: rbFit, fit2: rbFit2, sig: rbSig, onMap: rbOnMap, active: RB_ACTIVE, col: RB_COL };

// ---- Night look and light pools (#74): pure CSS over the one plan image.
const NIGHT_DEFAULT = { mode: "sun", start: "20:00", end: "07:00", strength: 70, style: "moon", overlays: ["live", "lights"], dim_quiet: true, shutters: true, warm_dusk: false };

/** 0 = day … 1 = night for fixed times, with a 30 minute fade around each time. */
function timesFactor(start, end, now) {
  const mins = (t) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
    return m ? (Number(m[1]) % 24) * 60 + Number(m[2]) : null;
  };
  const s = mins(start) ?? 1200;
  const e = mins(end) ?? 420;
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const L = (e - s + 1440) % 1440 || 1440;
  const pos = (m - s + 1440) % 1440;
  if (pos <= L) return Math.max(0, Math.min(1, (pos + 15) / 30, (L - pos + 15) / 30));
  const before = 1440 - pos;
  const after = pos - L;
  return Math.max(0, Math.min(0.5, (15 - before) / 30), Math.min(0.5, (15 - after) / 30));
}

/** "r,g,b" of a light that is on: its colour, else its colour temperature, else warm white. */
function lightRgb(at) {
  if (Array.isArray(at.rgb_color) && at.rgb_color.length === 3) return at.rgb_color.map((v) => Math.round(Number(v) || 0)).join(",");
  const k = Number(at.color_temp_kelvin) || (Number(at.color_temp) ? Math.round(1e6 / Number(at.color_temp)) : 0);
  if (k) return k <= 2700 ? "255,170,85" : k <= 3500 ? "255,192,125" : k <= 4500 ? "255,222,185" : "225,235,255";
  return "255,190,110";
}

/** A light shape as ellipses in percent of the plan (x of width, y of height). r / w in % of width, h in % of height. */
/** #112: a stored lamp colour ("k:2700" / "#ffaa00") → "r,g,b", or null. */
function colourRgb(col) {
  if (!col || col === "auto") return null;
  if (col.startsWith("#") && col.length === 7) return [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16)).join(",");
  if (col.startsWith("k:")) {
    const t = Math.max(1000, Math.min(12000, Number(col.slice(2)) || 3000)) / 100;
    const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
    const r = t <= 66 ? 255 : c(329.698727446 * Math.pow(t - 60, -0.1332047592));
    const g = t <= 66 ? c(99.4708025861 * Math.log(t) - 161.1195681661) : c(288.1221695283 * Math.pow(t - 60, -0.0755148492));
    const b = t >= 66 ? 255 : t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307);
    return `${r},${g},${b}`;
  }
  return null;
}

/** The colour a light shows. 0.11: a colour set in the Editor always wins; "Auto" uses the bulb's own colour, else warm. */
function bulbRgb(at, lampCol) {
  return colourRgb(lampCol) || lightRgb(at || {});
}

// 0.7.4: Comfort heatmap colours (cool -> warm) and the soft contour lines.
const HEAT_STOPS = [[0, [90, 134, 230]], [0.33, [72, 197, 192]], [0.66, [233, 220, 160]], [1, [243, 166, 92]]];
function heatRgb(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, c1] = HEAT_STOPS[i];
    const [t0, c0] = HEAT_STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Do two room shapes overlap (touch counts as overlap only when they really cross)? */
/** 0.7.2: do two room shapes touch (an edge on an edge, a corner on an edge)? A gap between them is a wall. */
function polysTouch(A, B, tol = 0.35) {
  const d2 = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const near = (P, Q) => P.some((p) => Q.some((a, i) => d2(p, a, Q[(i + 1) % Q.length]) <= tol));
  return near(A, B) || near(B, A);
}

function polysOverlap(A, B) {
  if (A.some((p) => inPoly(p[0], p[1], B)) || B.some((p) => inPoly(p[0], p[1], A))) return true;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return false;
}

/** Room shapes connected to a start room through overlaps (#111). */
function shapeGroup(areas, startAid) {
  const ids = Object.keys(areas).filter((k) => areas[k].shape && areas[k].shape.length >= 3);
  if (!ids.includes(startAid)) return null;
  const seen = new Set([startAid]);
  const queue = [startAid];
  while (queue.length) {
    const cur = queue.shift();
    for (const k of ids) if (!seen.has(k) && polysOverlap(areas[cur].shape, areas[k].shape)) { seen.add(k); queue.push(k); }
  }
  return [...seen].map((k) => areas[k].shape.map((q) => [q[0], q[1]]));
}

/** One SVG (as a CSS url) for light pools, each clipped to its room's shape (#111). */
function poolSvg(pools, mode) {
  let defs = "";
  let body = "";
  pools.forEach((p, i) => {
    // #111: the light's connected room shapes (overlap = open, gap = wall); several polygons = their union.
    const polys = p.shapes && p.shapes.length ? p.shapes : null;
    const clip = polys ? `c${i}` : null;
    if (clip) defs += `<clipPath id="${clip}">${polys.map((sh) => `<polygon points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
    if (mode === "mask") {
      const L = Math.round(255 * (1 - 0.92 * p.b));
      defs += `<radialGradient id="g${i}"><stop offset="0" stop-color="rgb(${L},${L},${L})"/><stop offset="1" stop-color="#fff"/></radialGradient>`;
    } else {
      defs += `<radialGradient id="g${i}"><stop offset="0" stop-color="rgb(${p.rgb})" stop-opacity="${(0.9 * p.b).toFixed(2)}"/><stop offset="1" stop-color="rgb(${p.rgb})" stop-opacity="0"/></radialGradient>`;
    }
    const ells = p.ell.map((e) => `<ellipse cx="${e.x.toFixed(2)}" cy="${e.y.toFixed(2)}" rx="${e.rx.toFixed(2)}" ry="${e.ry.toFixed(2)}" fill="url(#g${i})"${mode === "mask" ? ' style="mix-blend-mode:multiply"' : ""}/>`).join("");
    body += clip ? `<g clip-path="url(#${clip})">${ells}</g>` : ells;
  });
  const svg = mode === "mask"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs>${defs}<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>${body}</mask></defs><rect width="100" height="100" fill="#000" mask="url(#m)"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs>${defs}</defs>${body}</svg>`;
  // Single quotes: this goes into a style="…" attribute.
  return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}')`;
}

/** #119: white room shapes on transparent, as a CSS mask (single quotes: goes into style="…").
 *  0.9.1: a thin white stroke too, so rooms that meet on one line leave no hairline between them. */
function shapesSvg(shapes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${shapes.map((sh) => `<polygon fill="#fff" stroke="#fff" stroke-width=".3" stroke-linejoin="round" points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}')`;
}

/** 0.7.0: is this entity a door / window / shutter? "cover" or "contact". */
function openKind(eid, st) {
  const dom = domainOf(eid);
  if (dom === "cover") return "cover";
  if (dom === "binary_sensor" && st && ["door", "window", "opening", "garage_door"].includes(st.attributes.device_class)) return "contact";
  return null;
}

/** 0.7.0: door, window or shutter: chosen in the Editor, else from the device class and the name. */
function guessOpenAs(eid, hass, name, chosen) {
  if (["door", "window", "shutter"].includes(chosen)) return chosen;
  const st = eid && hass && hass.states[eid];
  const dc = (st && st.attributes.device_class) || "";
  const n = `${eid || ""} ${name || ""} ${eid ? entName({ states: { [eid]: st } }, eid) : ""}`.toLowerCase();
  if (/shutter|roller|blind|rolet|ρολ|jalous|persian|store|tapparell|persiana/.test(n)) return "shutter";
  if (domainOf(eid) === "cover") return ["door", "garage", "gate"].includes(dc) ? "door" : dc === "window" ? "window" : "shutter";
  if (["door", "garage_door"].includes(dc)) return "door";
  return "window";
}

// 0.7.4: appliances (washer, dryer, dishwasher). Colour by what the machine is doing:
// water = aqua, heat = champagne, finished = green, attention = orange, error = red.
const APPL_TYPES = ["washer", "dryer", "dishwasher"];
// 0.13.9.18: every appliance type (Floorplan Editor → Appliance type); the first three have drums / cycles.
const APPL_KINDS = ["washer", "dryer", "dishwasher", "oven", "fridge", "coffee", "air_purifier", "dehumidifier", "printer", "other"];
const APPL_ICON = { washer: "mdi:washing-machine", dryer: "mdi:tumble-dryer", dishwasher: "mdi:dishwasher", oven: "mdi:stove", fridge: "mdi:fridge-outline", coffee: "mdi:coffee-maker-outline", air_purifier: "mdi:air-purifier", dehumidifier: "mdi:air-humidifier", printer: "mdi:printer-3d", other: "mdi:washing-machine" };
const APPL_COL = { water: "79,209,197", spin: "79,209,197", heat: "242,196,141", run: null, done: "76,175,80", attention: "251,140,0", error: "229,57,53" };
function applGuess(text) {
  const t = String(text || "").toLowerCase();
  if (/dish|πιάτ|geschirr|lave-vaisselle|lavastoviglie|lavavajillas/.test(t)) return "dishwasher";
  if (/dryer|tumble|στεγν|trockner|sèche|asciuga|secadora/.test(t)) return "dryer";
  if (/wash|πλυντ|waschmaschine|lave-linge|lavatrice|lavadora/.test(t)) return "washer";
  return null;
}
/** What a status text means: water / spin / heat / done / attention / error / idle / run. */
function applPhase(text) {
  const t = String(text || "").toLowerCase().replace(/[_-]/g, " ");
  if (!t || ["unavailable", "unknown"].includes(t)) return null;
  if (/error|fault|fail/.test(t)) return "error";
  if (/end|finish|complete|done/.test(t)) return "done";
  if (/pause|door open|interrupt/.test(t)) return "attention";
  if (/spin/.test(t)) return "spin";
  if (/dry|heat|steam/.test(t)) return "heat";
  if (/wash|rins|soak|fill|drain|detect|pre ?wash|cool/.test(t)) return "water";
  if (/^(off|power off|standby|idle|ready|inactive|initial|sleep|none|0)$/.test(t.trim())) return "idle";
  return "run";
}

/** 0.7.7: AC air flow as a trapezoid from the unit's line on the wall. Works in square units (y / ratio).
 *  c: { x, y (marker, %), x1..y2 (the unit's line, % — optional), a (direction, deg), r (reach, %), s (spread, deg), L (default length, %) }
 *  The flow leaves the line at right angles towards a, widening by s / 2 on each side; arcs are centred on
 *  the point where the two sides meet, so the waves look like before. */
function airGeom(c, ratio) {
  const rad = (d) => (d * Math.PI) / 180;
  const dir = [Math.cos(rad(c.a ?? 90)), Math.sin(rad(c.a ?? 90))];
  let e1, e2;
  if (c.x1 != null && c.x2 != null) {
    e1 = [c.x1, c.y1 / ratio];
    e2 = [c.x2, c.y2 / ratio];
  } else {
    const L = c.L || 4;
    const u = [-dir[1], dir[0]];
    const m = [c.x, c.y / ratio];
    e1 = [m[0] - (u[0] * L) / 2, m[1] - (u[1] * L) / 2];
    e2 = [m[0] + (u[0] * L) / 2, m[1] + (u[1] * L) / 2];
  }
  const dx = e2[0] - e1[0], dy = e2[1] - e1[1];
  const len = Math.hypot(dx, dy) || 0.01;
  let n = [-dy / len, dx / len];
  if (n[0] * dir[0] + n[1] * dir[1] < 0) n = [-n[0], -n[1]];
  const h = rad(Math.max(10, Math.min(60, (c.s ?? 60) / 2)));
  const mid = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
  const d0 = len / 2 / Math.tan(h);
  const apex = [mid[0] - n[0] * d0, mid[1] - n[1] * d0];
  const R = d0 + Math.max(0.5, c.r || 10);
  const th = Math.atan2(n[1], n[0]);
  const far = (sg) => [apex[0] + Math.cos(th + sg * h) * (R / Math.cos(h)), apex[1] + Math.sin(th + sg * h) * (R / Math.cos(h))];
  const P = (q) => [q[0], q[1] * ratio];
  const f1 = far(-1), f2 = far(1);
  return { e1: P(e1), e2: P(e2), f1: P(f1), f2: P(f2), mid: P(mid), tip: P([mid[0] + n[0] * (R - d0), mid[1] + n[1] * (R - d0)]), apex: P(apex), d0, R, th: (th * 180) / Math.PI, h: (h * 180) / Math.PI, n };
}

/** 0.7.4: TV glow: the light leaves the whole screen (a line) and widens into the room.
 *  x/y in % of the image; reach r in % of the width; spread a in degrees; it faces (tx, ty). */
function screenPoly(x, y, x2, y2, r, a, ratio, tx, ty) {
  const Y = (v) => v / ratio;
  const dx = x2 - x, dy = Y(y2) - Y(y);
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  let nx = -uy, ny = ux;
  const mx = (x + x2) / 2, my = (Y(y) + Y(y2)) / 2;
  if (tx != null && ty != null && (tx - mx) * nx + (Y(ty) - my) * ny < 0) { nx = -nx; ny = -ny; }
  const sp = Math.tan((Math.max(0, Math.min(60, a ?? 20)) * Math.PI) / 180) * r;
  const P = [[x, Y(y)], [x2, Y(y2)], [x2 + nx * r + ux * sp, Y(y2) + ny * r + uy * sp], [x + nx * r - ux * sp, Y(y) + ny * r - uy * sp]];
  return { pts: P.map(([px, py]) => [px, py * ratio]), from: [mx, my * ratio], to: [mx + nx * r, (my + ny * r) * ratio] };
}

function shapeEllipses(x, y, s, ratio) {
  const r = Number(s.r) || 6;
  if (s.type === "strip" && s.x2 != null && s.y2 != null) {
    const out = [];
    for (let i = 0; i <= 4; i++) out.push({ x: x + ((s.x2 - x) * i) / 4, y: y + ((s.y2 - y) * i) / 4, rx: r, ry: r * ratio });
    return out;
  }
  if (s.type === "panel") {
    const w = Number(s.w) || r * 2;
    const h = Number(s.h) || w * ratio;
    return [{ x, y, rx: w * 0.8, ry: h * 0.8 }];
  }
  if (s.type === "wall") {
    const a = ((Number(s.a) || 90) * Math.PI) / 180;
    return [{ x: x + Math.cos(a) * r * 0.45, y: y + Math.sin(a) * r * 0.45 * ratio, rx: r * 0.9, ry: r * 0.9 * ratio }];
  }
  return [{ x, y, rx: r, ry: r * ratio }];
}

/** Default shape for a light with none set: bulb ≈ 1.5 m when the plan is measured, else 6% of the width. */
function defaultShape(type, realW) {
  const m = (v, pct) => (realW ? (v / realW) * 100 : pct);
  if (type === "spot") return { type, r: m(0.8, 3.5) };
  if (type === "strip") return { type, r: m(0.5, 2.5) };
  if (type === "screen") return { type, r: m(2.5, 10), a: 20 };
  if (type === "panel") return { type, w: m(1.2, 6) };
  if (type === "wall") return { type, r: m(1.2, 5), a: 90 };
  return { type: "bulb", r: m(1.5, 6) };
}

/** Phantom summary for chips outside the plan (#73): combined value from its entities. */
/** 0.7.4: a phantom's members as counting units: members of one bond are one unit. */
function phUnits(mem) {
  const by = new Map();
  mem.forEach((d, i) => {
    if (!d || !d.main_entity) return;
    const k = d.bond ? `b:${d.bond}` : `m:${i}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(d.main_entity);
  });
  return [...by.values()];
}

function phantomSummary(hass, ph) {
  const all = (ph && ph.entities) || [];
  // #126: lights, switches, doors and motion count by each member's main entity, as on the card;
  // readings still use every temperature / humidity sensor of the members.
  const mains = (ph && ph.mains) || [];
  const mk = mains.map((e) => kindOf(e, hass.states[e]));
  if (mains.length && mk.some((k) => ["light", "switch", "fan"].includes(k)) && !mk.some((k) => ["temperature", "humidity", "opening", "motion"].includes(k))) {
    // 0.7.4: a bond counts once (on while any of its members is on).
    const units = ((ph && ph.units) || mains.map((e) => [e])).filter((u) => u.some((e) => ["light", "switch", "fan"].includes(kindOf(e, hass.states[e]))));
    return `${units.filter((u) => u.some((e) => (hass.states[e] || {}).state === "on")).length} of ${units.length} on`;
  }
  const ents = mains.length && mk.some((k) => ["opening", "motion"].includes(k)) ? mains : all;
  const by = (k) => ents.filter((e) => kindOf(e, hass.states[e]) === k);
  const avg = (list) => {
    const v = list.map((e) => hass.states[e]).filter((s) => live(s) && num(s.state)).map((s) => Number(s.state));
    if (!v.length) return null;
    const mode = ph.value || "average";
    const x = mode === "min" ? Math.min(...v) : mode === "max" ? Math.max(...v) : v.reduce((a, b) => a + b, 0) / v.length;
    const st = hass.states[list[0]];
    const u = (st && st.attributes.unit_of_measurement) || "";
    return `${Math.round(x * 10) / 10}${u === "%" ? "" : " "}${u}`.trim();
  };
  const t = by("temperature");
  const h = by("humidity");
  if (t.length || h.length) return [avg(t), avg(h)].filter(Boolean).join(" · ");
  const op = by("opening");
  if (op.length) {
    const n = op.filter((e) => ["on", "open"].includes((hass.states[e] || {}).state)).length;
    return n ? dfT("sec.n_open", { n }) : dfT("sec.all_closed");
  }
  const mo = by("motion");
  if (mo.length) return mo.some((e) => (hass.states[e] || {}).state === "on") ? dfT("motion.detected") : dfT("motion.clear");
  const li = ents.filter((e) => domainOf(e) === "light");
  if (li.length) return `${li.filter((e) => (hass.states[e] || {}).state === "on").length} of ${li.length} on`;
  return "";
}

function planSensors(hass) {
  return Object.values((hass && hass.states) || {}).filter(
    (s) => s.entity_id.startsWith("sensor.") && s.attributes && s.attributes.plan_id && s.attributes.devices !== undefined,
  );
}

// 0.12.2 Device pictures: default look per state, and states that count as off.
const PIC_LOOK = { on: "full", off: "faint", un: "dotted" };

/** 0.12.6: ONE picture renderer for the card and the Floorplan Editor (window.__dfcPic), so the Editor always
 *  previews what the card draws: tint, inset outline, looks (full / faint / outline / dotted), busy, Highlight.
 *  Glow = a soft halo; Breathing = it fades in and out; Flow = a light runs around the outline; Tint = a 2nd colour. */
/** part: "all" (the Editor's preview), "body" (the picture itself, under the room's light and night) or "hl" (only
 *  its highlight halo / sparkle, drawn above the night: it gives light). 0.13.3. */
function picMarkup({ p, url, look, hl, busy = false, x, y, attrs = "", cls = "", part = "all" }) {
  const pic = look === "full" || look === "faint";
  const tint = pic && p.tint ? `<span class="ptint" style="background:${cesc(p.tint)};-webkit-mask-image:url('${cesc(url)}');mask-image:url('${cesc(url)}')"></span>` : "";
  const k = Math.max(0.4, (100 - 2 * (p.inset ?? 4)) / 100);
  const pts = (p.outline || [[2, 2], [98, 2], [98, 98], [2, 98]]).map(([px, py]) => `${(50 + (px - 50) * k).toFixed(1)},${(50 + (py - 50) * k).toFixed(1)}`).join(" ");
  const hcol = hl ? cesc(hl.color || "#2196f3") : "";
  const hk = hl ? (hl.look === "pulse" ? "breathing" : hl.look) : "";
  // 0.13.2 Sparkle: twinkling dots inside the picture's outline (a decorated tree, anything festive).
  let spark = "";
  if (hl && hk === "sparkle") {
    const P = pts.split(" ").map((q) => q.split(",").map(Number));
    const ar = Number(p.ar) || 1;
    for (let i = 0, n = 0; i < 90 && n < 16; i++) {
      const sx = 8 + ((i * 37) % 84);
      const sy = 8 + ((i * 61 + 13) % 84);
      if (!inPoly(sx, sy, P)) continue;
      n++;
      spark += `<ellipse class="sp" cx="${sx}" cy="${sy}" rx="1.8" ry="${(1.8 * ar).toFixed(2)}" style="animation-delay:-${((i * 0.37) % 2.2).toFixed(2)}s"/>`;
    }
    spark = `<g class="spk" style="--hc:${hcol}">${spark}</g>`;
  }
  const halo = hl && hk === "spin" ? "" : hl && hk === "sparkle" ? spark : hl && hk !== "tint" ? `<g class="hl ${hk}" style="--hc:${hcol}"><polygon points="${pts}" class="hw"/><polygon points="${pts}" class="hm"/>${hk === "flow" ? `<polygon points="${pts}" class="hf" pathLength="100"/>` : `<polygon points="${pts}" class="hn"/>`}</g>` : "";
  const geo = `left:${x}%;top:${y}%;width:${p.w}%;aspect-ratio:${p.ar};transform:translate(-50%,-50%) rotate(${p.r || 0}deg)`;
  if (part === "hl") return halo ? `<div class="pic hlonly" style="${geo}"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${halo}</svg></div>` : "";
  const glow = part === "body" ? "" : halo;
  const edge = look === "outline" || look === "dotted" || busy;
  const line = edge || glow ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${glow}${edge ? `<polygon points="${pts}" class="${look === "dotted" ? "dot" : ""}"/>` : ""}</svg>` : "";
  const tint2 = hl && hk === "tint" && pic ? `<span class="ptint" style="background:${hcol};-webkit-mask-image:url('${cesc(url)}');mask-image:url('${cesc(url)}')"></span>` : "";
  return `<div class="pic ${look} ${busy ? "busy" : ""} ${hk === "spin" ? "spin" : ""} ${cls}" ${attrs} style="${geo}">${pic ? `<img src="${cesc(url)}" alt="" draggable="false"${hk === "spin" && hl && (hl.ox != null || hl.oy != null) ? ` style="transform-origin:${Number(hl.ox ?? 50)}% ${Number(hl.oy ?? 50)}%"` : ""}>${tint}${tint2}` : ""}${line}</div>`;
}

/** The Flow light's dash follows the outline's length on screen (after drawing). */
function picSizeFlow(root) {
  for (const f of root.querySelectorAll(".pic .hf")) {
    const pic = f.closest(".pic");
    const sx = pic.offsetWidth / 100;
    const sy = pic.offsetHeight / 100;
    const pts = f.getAttribute("points").split(" ").map((q) => q.split(",").map(Number));
    let L = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      L += Math.hypot((x2 - x1) * sx, (y2 - y1) * sy);
    }
    if (L > 0) {
      f.style.strokeDasharray = `${(L * 0.18).toFixed(1)} ${(L * 0.82).toFixed(1)}`;
      f.style.setProperty("--L", `${L.toFixed(1)}px`);
    }
  }
}

const PIC_CSS = `
.pic { position:absolute; cursor:pointer; -webkit-tap-highlight-color: transparent; }
.pic.hlonly { pointer-events:none; cursor:default; }
.pic.spin img { animation: dfspin 3.2s linear infinite; }
@keyframes dfspin { to { transform: rotate(360deg); } }
.pic img { width:100%; height:100%; object-fit:fill; display:block; pointer-events:none; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
.pic.faint img { opacity:.38; filter:saturate(.4); }
.pic .ptint { position:absolute; inset:0; mix-blend-mode:multiply; -webkit-mask-size:100% 100%; mask-size:100% 100%; pointer-events:none; }
.pic.faint .ptint { opacity:.38; }
.pic svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.room.olsel { z-index: 4; display:flex; flex-direction:column; align-items:center; gap: 1px; padding: 5px 11px 6px; border-radius: 12px; background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 2px solid var(--primary-color, #03a9f4); box-shadow: 0 3px 12px rgba(0,0,0,.22); font-weight: 700; white-space: nowrap; text-shadow: none; opacity: 1; }
.room.olsel .olv { font-size: .85em; font-weight: 500; color: var(--secondary-text-color); }
.olroom { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; overflow:visible; }
.olroom polygon, .olroom ellipse { fill: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); stroke: var(--primary-color, #03a9f4); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.pic svg polygon { fill:none; stroke: var(--dfc-accent, var(--primary-color, #03a9f4)); stroke-width:1.6; vector-effect: non-scaling-stroke; }
.pic svg polygon.dot { stroke: var(--secondary-text-color, #8a8f98); stroke-dasharray: 3 3; }
.pic.busy { animation: dfbusy 1s ease-in-out infinite; }
.pic svg .hl polygon { fill:none; stroke: var(--hc); vector-effect: non-scaling-stroke; stroke-linejoin:round; }
.pic svg .hl .hw { stroke-width:16; opacity:.22; }
.pic svg .hl .hm { stroke-width:8; opacity:.38; }
.pic svg .hl .hn { stroke-width:2; opacity:.95; }
.pic svg .hl .hf { stroke-width:3; stroke-dasharray: 0 1000; stroke-linecap:round; animation: dfflow 2.4s linear infinite; filter: drop-shadow(0 0 3px var(--hc)); }
.pic svg .hl.breathing { animation: dfbreath 2.6s ease-in-out infinite; }
.pic svg .spk .sp { fill: var(--hc); filter: drop-shadow(0 0 2px var(--hc)); animation: dfspark 2.2s ease-in-out infinite; }
@keyframes dfspark { 0%, 100% { opacity:0; } 50% { opacity:1; } }
@keyframes dfflow { to { stroke-dashoffset: calc(var(--L, 100px) * -1); } }
@keyframes dfbreath { 0%, 100% { opacity:.35; } 50% { opacity:1; } }
@media (prefers-reduced-motion: reduce) { .pic svg .hl.breathing, .pic svg .hl .hf, .pic svg .spk .sp, .pic.spin img { animation:none; } .pic svg .spk .sp { opacity:.8; } }
`;
/** 0.13.2 Christmas lights: small round bulbs along a drawn line (corners allowed), in rings, or (0.13.3) in a
 *  spiral round a tree. One renderer for the card and the Floorplan Editor. Coordinates in % of the plan (x of its
 *  width, y of its height).
 *  0.13.3: bulb size in real centimetres (cm, 0.5..8; a plan that isn't measured counts as 12 m wide), spacing
 *  like a real string (5 bulb widths, at least 8 cm), never smaller than about 2 px on screen; the bulbs are crisp points (their
 *  light is one shared halo, drawn with the lamps' light pools); bulbs outside the walls of their room aren't drawn. */
const XMAS_OLD = { s: 2, m: 3, l: 4 }; // 0.13.2's S / M / L become 2 / 3 / 4 cm (smaller, closer to real bulbs)
const XMAS_MULTI = ["255,59,48", "52,199,89", "255,214,10", "10,132,255"];
function xmasCm(sh) {
  return Math.max(0.5, Math.min(8, Number(sh.cm) || XMAS_OLD[sh.size] || 3));
}
/** 0.13.6: the glow of each bulb in its own colour, as a diameter in cm: from the bulb's size up to 50 cm
 *  (default 3.2 × the bulb). */
function xmasGlowCm(sh) {
  const cm = xmasCm(sh);
  return Math.max(cm, Math.min(50, Number(sh.gl) || cm * 3.2));
}
/** Bulb radius and spacing in % of the plan width. realW: the plan's width in metres; pxw: screen px per 1 %. */
function xmasDims(sh, realW, pxw) {
  const W = realW > 0 ? realW : 12;
  const cm = xmasCm(sh);
  const rb = Math.max(cm / (2 * W), pxw ? 1 / pxw : 0); // ≥ 1 px radius on screen
  // Spacing as on a real string, from the real size (5 bulb widths, at least 8 cm), and ≥ 4 px on screen.
  const gap = Math.max(Math.max(cm * 5, 8) / W, pxw ? 4 / pxw : 0);
  return { rb, gap };
}
function xmasBulbs(sh, ratio, realW, pxw) {
  const { rb, gap } = xmasDims(sh, realW, pxw);
  const out = [];
  const Y = (v) => v / ratio; // to square units
  if (sh.lay === "scatter") {
    // 0.13.7: lights wound through a tree, seen from above: scattered at random but evenly (no clumps), the same
    // every time for this light (seeded by its place and size); bulbs deeper in the tree (towards the edge) are
    // smaller and fainter (k), and a few are half hidden by branches.
    const r = Math.max(gap, Number(sh.r) || 5);
    let seed = (Math.round(sh.x * 97) * 73856093) ^ (Math.round(sh.y * 89) * 19349663) ^ (Math.round(r * 101) * 83492791);
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Seen from above, a string wound through several layers of branches looks denser than its wire spacing.
    const want = Math.max(6, Math.round((Math.PI * r * r) / (gap * gap * 0.5)));
    const min = gap * 0.55;
    for (let tries = 0; tries < want * 40 && out.length < want; tries++) {
      const d = Math.sqrt(rnd()) * r;
      const t = rnd() * 2 * Math.PI;
      const x = Math.cos(t) * d;
      const y = Math.sin(t) * d;
      if (out.some((q) => Math.hypot(q.dx - x, q.dy - y) < min)) continue;
      const depth = d / r;
      out.push({ dx: x, dy: y, x: sh.x + x, y: sh.y + y * ratio, k: (1 - 0.45 * depth) * (rnd() < 0.15 ? 0.6 : 1) });
    }
    return { rb, gap, bulbs: out };
  }
  if (sh.lay === "rings" || sh.lay === "spiral") {
    const r = Math.max(gap, Number(sh.r) || 5);
    if (sh.lay === "spiral") {
      // One string winding outwards from the top of the tree, turns about 1.6 bulb gaps apart.
      const a = (gap * 1.6) / (2 * Math.PI);
      let t = (gap * 0.6) / a;
      for (let i = 0; i < 2000; i++) {
        const rr = a * t;
        if (rr > r) break;
        out.push({ x: sh.x + Math.cos(t) * rr, y: sh.y + Math.sin(t) * rr * ratio });
        t += gap / Math.hypot(rr, a);
      }
      return { rb, gap, bulbs: out };
    }
    const n = Math.max(2, Math.round(r / (gap * 1.6)));
    for (let i = 1; i <= n; i++) {
      const ri = (r * i) / n;
      const k = Math.max(5, Math.round((2 * Math.PI * ri) / gap));
      for (let j = 0; j < k; j++) {
        const t = (2 * Math.PI * j) / k + i * 0.35;
        out.push({ x: sh.x + Math.cos(t) * ri, y: sh.y + Math.sin(t) * ri * ratio });
      }
    }
    return { rb, gap, bulbs: out };
  }
  const pts = Array.isArray(sh.pts) && sh.pts.length >= 2 ? sh.pts : [[sh.x - 6, sh.y], [sh.x + 6, sh.y]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, Y(by) - Y(ay));
    for (let d = carry; d <= L; d += gap) out.push({ x: ax + ((bx - ax) * d) / (L || 1), y: ay + ((by - ay) * d) / (L || 1) });
    carry = gap - ((L - carry) % gap || gap);
    if (carry >= gap) carry = 0;
  }
  return { rb, gap, bulbs: out };
}
/** "r,g,b" of bulb i: Multicolour, a white (k:<kelvin>) or the light's own colour. */
function xmasRgb(sh, i, own) {
  if (sh.bulb === "own") return own || "255,190,110";
  if (sh.bulb === "white") return colourRgb(`k:${Number(sh.k) || 2700}`);
  return XMAS_MULTI[i % XMAS_MULTI.length];
}
/** The colour of the shared halo: warm for multicolour strings (their colours mix to a warm light). */
function xmasHaloRgb(sh, own) {
  return sh.bulb === "own" ? own || "255,190,110" : sh.bulb === "white" ? colourRgb(`k:${Number(sh.k) || 2700}`) : "255,196,140";
}
/** The room shapes the lights stay in: the room under them (smallest) and the rooms open to it (#111 rule). */
function xmasRooms(shapes, sh) {
  const ids = Object.keys(shapes || {}).filter((k) => Array.isArray(shapes[k]) && shapes[k].length >= 3);
  if (!ids.length) return null;
  // The room under the lights' own place (their centre, else the marker), as for the lamps' light pools.
  const cx = sh.x;
  const cy = sh.y; // (Scattered, Spiral, Rings: their centre)
  const area = (P) => Math.abs(P.reduce((t, p, i) => t + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
  const under = ids.filter((k) => inPoly(cx, cy, shapes[k])).sort((x, y) => area(shapes[x]) - area(shapes[y]))[0];
  if (!under) return null; // outside every room (a balcony railing): not limited
  return shapeGroup(Object.fromEntries(ids.map((k) => [k, { shape: shapes[k] }])), under);
}
/** Effect timing per speed (seconds): one twinkle cycle, one chase lap, one flash. */
const XMAS_DUR = { twinkle: { slow: 4.5, normal: 2.6, fast: 1.3 }, chase: { slow: 2.4, normal: 1.4, fast: 0.7 }, flash: { slow: 2.2, normal: 1.2, fast: 0.6 } };
/** SVG markup (viewBox 0 0 100 100, not keeping the aspect). 0.13.6: one soft halo per string drawn under the bulbs
 *  and animated with them (Flash: the area lights and goes dark with the bulbs; Twinkle / Chase: a gentle shimmer),
 *  blended so it lifts the night; bulbs are a bright core with a small bloom in their own colour; Twinkle is a quick
 *  blink-off at random moments, so the speed shows. Off: dark bulbs, no halo. */
function xmasSvg(sh, ratio, { on = true, own = null, still = false, rooms = null, realW = 0, pxw = 0, id = "x" } = {}) {
  const { rb, bulbs } = xmasBulbs(sh, ratio, realW, pxw);
  const rg = Math.max(rb, xmasGlowCm(sh) / (2 * (realW > 0 ? realW : 12))); // the bulb's own glow, radius in %
  const gk = Math.max(0.45, 1 - (xmasGlowCm(sh) / 50) * 0.5); // a wide glow is softer, so neighbours blend, not white out
  const fx = still || !on ? "steady" : sh.fx || "twinkle";
  const dur = fx === "steady" ? 0 : (XMAS_DUR[fx] || XMAS_DUR.twinkle)[sh.sp || "normal"] || 1.4;
  const inside = (b) => !rooms || rooms.some((P) => inPoly(b.x, b.y, P));
  const n = (v) => v.toFixed(3);
  let hdefs = "";
  let halo = "";
  let clip = "";
  if (on) {
    const W = realW > 0 ? realW : 12;
    const reach = 28 / W; // about 28 cm of glow around the string
    const c = xmasHaloRgb(sh, own);
    const multi = !sh.bulb || sh.bulb === "multi";
    const hfx = fx === "flash" ? `animation:dfx-flash ${dur}s infinite steps(1,end)` : fx === "steady" ? "" : `animation:${multi ? "dfx-drift-c" : "dfx-drift"} ${(dur * 2.4).toFixed(2)}s infinite ease-in-out`;
    if (rooms && rooms.length) clip = `<clipPath id="xc${id}">${rooms.map((P) => `<polygon points="${P.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
    const cp = clip ? ` clip-path="url(#xc${id})"` : "";
    if (sh.lay === "rings" || sh.lay === "spiral" || sh.lay === "scatter") {
      const r = (Number(sh.r) || 5) + reach;
      hdefs = `<radialGradient id="xg${id}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".55"/><stop offset=".6" stop-color="rgb(${c})" stop-opacity=".22"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`;
      halo = `<ellipse class="xhalo" cx="${n(sh.x)}" cy="${n(sh.y)}" rx="${n(r)}" ry="${n(r * ratio)}" fill="url(#xg${id})"${cp} style="${hfx}"/>`;
    } else {
      const pts = Array.isArray(sh.pts) && sh.pts.length >= 2 ? sh.pts : [[sh.x - 6, sh.y], [sh.x + 6, sh.y]];
      hdefs = `<filter id="xb${id}" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="${n(reach * 0.55)}"/></filter>`;
      // The drift animates the CSS filter (hue), so it goes on a wrapper: the blur stays on the line itself.
      halo = `<g${cp}><g class="xhalo" style="${hfx}"><polyline points="${pts.map((q) => `${n(q[0])},${n(q[1])}`).join(" ")}" fill="none" stroke="rgb(${c})" stroke-opacity=".38" stroke-width="${n(reach * 1.6)}" stroke-linecap="round" stroke-linejoin="round" filter="url(#xb${id})"/></g></g>`;
    }
  }
  const body = bulbs.map((b, i) => {
    if (!inside(b)) return ""; // walls: not outside its rooms
    const c = on ? xmasRgb(sh, i, own) : "60,60,60";
    let anim = "";
    if (fx === "twinkle") {
      const r1 = ((i * 7919) % 97) / 97;
      const r2 = ((i * 104729) % 89) / 89;
      anim = ` style="animation:dfx-twinkle ${(dur * (0.7 + r2 * 0.6)).toFixed(2)}s ${(-r1 * dur * 3).toFixed(2)}s infinite"`;
    } else if (fx === "chase") anim = ` style="animation:dfx-chase ${dur}s ${(-(i % 6) * (dur / 6)).toFixed(2)}s infinite"`;
    else if (fx === "flash") anim = ` style="animation:dfx-flash ${dur}s infinite steps(1,end)"`;
    const k = b.k || 1; // 0.13.7 Scattered: deeper in the tree = smaller and fainter
    const R = rb * (0.55 + 0.45 * k);
    const G = rg * (0.55 + 0.45 * k);
    const bloom = on && G > R ? `<ellipse cx="${n(b.x)}" cy="${n(b.y)}" rx="${n(G)}" ry="${n(G * ratio)}" fill="url(#xo${id}-${c.replace(/,/g, "-")})"/>` : "";
    const core = on ? `<ellipse cx="${n(b.x)}" cy="${n(b.y)}" rx="${n(R * 0.45)}" ry="${n(R * 0.45 * ratio)}" fill="rgba(255,255,255,.75)"/>` : "";
    const op = on ? (k < 1 ? ` opacity="${(0.35 + 0.65 * k).toFixed(2)}"` : "") : ' opacity=".8"';
    return `<g class="xbulb"${anim}><g${op}>${bloom}<ellipse cx="${n(b.x)}" cy="${n(b.y)}" rx="${n(R)}" ry="${n(R * ratio)}" fill="rgb(${c})"/>${core}</g></g>`;
  }).join("");
  // One soft bloom gradient per bulb colour used.
  const cols = on ? [...new Set(bulbs.map((_b, i) => xmasRgb(sh, i, own)))] : [];
  const odefs = cols.map((c) => `<radialGradient id="xo${id}-${c.replace(/,/g, "-")}"><stop offset="0" stop-color="rgb(${c})" stop-opacity="${(0.85 * gk).toFixed(2)}"/><stop offset=".35" stop-color="rgb(${c})" stop-opacity="${(0.45 * gk).toFixed(2)}"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`).join("");
  return `${clip || hdefs || odefs ? `<defs>${clip}${hdefs}${odefs}</defs>` : ""}${halo}${body}`;
}
const XMAS_CSS = `@keyframes dfx-twinkle { 0%, 72% { opacity:1 } 80% { opacity:.06 } 88%, 100% { opacity:1 } }
@keyframes dfx-chase { 0% { opacity:1 } 30%, 100% { opacity:.12 } }
@keyframes dfx-flash { 0% { opacity:1 } 50% { opacity:.06 } }
@keyframes dfx-drift { 0% { opacity:.5 } 30% { opacity:1 } 55% { opacity:.62 } 80% { opacity:.95 } 100% { opacity:.5 } }
@keyframes dfx-drift-c { 0% { opacity:.5; filter:hue-rotate(-30deg) } 30% { opacity:1; filter:hue-rotate(0deg) } 55% { opacity:.62; filter:hue-rotate(35deg) } 80% { opacity:.95; filter:hue-rotate(10deg) } 100% { opacity:.5; filter:hue-rotate(-30deg) } }
.xmas { stroke:none; }
.xmas .xhalo { mix-blend-mode: screen; }
@media (prefers-reduced-motion: reduce) { .xmas .xbulb, .xmas .xhalo { animation:none !important; } }`;
if (!window.__dfcXmas) window.__dfcXmas = { svg: xmasSvg, bulbs: xmasBulbs, rooms: xmasRooms, cm: xmasCm, glow: xmasGlowCm, css: XMAS_CSS };

if (!window.__dfcPic) window.__dfcPic = { html: picMarkup, sizeFlow: picSizeFlow, css: PIC_CSS, looks: PIC_LOOK };
const PIC_OFF = new Set(["off", "unknown", "idle", "standby", "closed", "docked", "paused", "not_home", "unavailable"]);
const STATIC_BASE = "/device_floorplan_static";

const _cardSigned = new Map();
async function cardSign(hass, url) {
  if (!url || !url.startsWith("/api/")) return url;
  const hit = _cardSigned.get(url);
  if (hit && hit.until > Date.now()) return hit.path;
  const res = await hass.callWS({ type: "auth/sign_path", path: url, expires: 24 * 3600 });
  _cardSigned.set(url, { path: res.path, until: Date.now() + 23 * 3600 * 1000 });
  return res.path;
}

// ZHA device data (role, LQI, RSSI, neighbours), shared by all cards on the page.
let _zhaCache = null;
async function zhaDevices(hass, maxAge = 120000) {
  if (_zhaCache && (_zhaCache.loading || Date.now() - _zhaCache.at < maxAge)) return _zhaCache.loading || _zhaCache.data;
  const prev = _zhaCache && _zhaCache.data;
  const loading = hass
    .callWS({ type: "zha/devices" })
    .then((devs) => {
      const byIeee = {};
      const links = [];
      for (const d of devs || []) {
        const k = ieeeKey(d.ieee);
        if (!k) continue;
        const type = String(d.device_type || "").toLowerCase();
        byIeee[k] = {
          // 0.8.1: Zigbee Green Power (HA 2026.11): battery-free switches, no parent, no links.
          role: /green|gpd/.test(type) || d.source_id != null || d.gpd_id != null ? "gp" : type.startsWith("coord") ? "coordinator" : type.startsWith("router") ? "router" : type.startsWith("end") ? "end" : null,
          lqi: num(d.lqi) ? Number(d.lqi) : null,
          rssi: num(d.rssi) ? Number(d.rssi) : null,
          available: d.available !== false,
        };
        for (const n of d.neighbors || []) if (n.ieee && num(n.lqi)) links.push({ a: k, b: ieeeKey(n.ieee), lqi: Number(n.lqi) });
      }
      const gp = (k) => (byIeee[k] || {}).role === "gp";
      _zhaCache = { at: Date.now(), data: { byIeee, links: links.filter((l) => !gp(l.a) && !gp(l.b)) } };
      return _zhaCache.data;
    })
    .catch(() => {
      _zhaCache = { at: Date.now(), data: prev || { byIeee: {}, links: [] } };
      return _zhaCache.data;
    });
  _zhaCache = { at: prev ? _zhaCache.at : 0, data: prev, loading };
  return loading;
}

/** What an entity is, for overlays and taps. */
function kindOf(eid, st) {
  const d = domainOf(eid);
  const dc = st && st.attributes ? st.attributes.device_class : null;
  if (d === "light") return "light";
  if (d === "switch" || d === "input_boolean") return "switch";
  if (d === "fan") return "fan";
  if (d === "cover" || d === "valve") return "cover";
  if (d === "climate" || d === "water_heater" || d === "humidifier") return "climate";
  if (d === "lock") return "lock";
  if (d === "alarm_control_panel") return "alarm";
  if (d === "media_player") return "media";
  if (d === "camera") return "camera";
  if (d === "vacuum" || d === "lawn_mower") return "appliance";
  if (d === "siren") return "safety";
  if (d === "binary_sensor") {
    if (OPEN_DC.has(dc)) return "opening";
    if (MOTION_DC.has(dc)) return "motion";
    if (SAFETY_DC.has(dc)) return "safety";
    if (dc === "running" || /_running$/.test(eid)) return "appliance";
    return "binary";
  }
  if (d === "sensor") {
    // test9: sensors without a device class: °C / °F is a temperature; a % sensor named "humid…" is humidity.
    const u = st && st.attributes ? st.attributes.unit_of_measurement : null;
    if (dc === "temperature" || (!dc && (u === "°C" || u === "°F"))) return "temperature";
    if (dc === "humidity" || (!dc && u === "%" && /humid/i.test(`${eid} ${st.attributes.friendly_name || ""}`))) return "humidity";
    if (dc === "battery") return "battery";
    if (dc === "signal_strength" || /_(linkquality|lqi|rssi|signal_strength|wifi_signal)$/.test(eid)) return "signal";
    return "sensor";
  }
  return "other";
}

/** 0.11 Electricity: the power of a sensor in W (W / kW / MW), or null. */
function powerW(st) {
  if (!st || !st.attributes || st.attributes.device_class !== "power" || !live(st) || !num(st.state)) return null;
  const u = String(st.attributes.unit_of_measurement || "W").toLowerCase();
  const f = u === "kw" ? 1000 : u === "mw" ? 1e6 : 1;
  return Number(st.state) * f;
}
const isPower = (st) => !!(st && st.attributes && st.attributes.device_class === "power");
/** "850 W", "1.24 kW". */
function fmtW(w) {
  const a = Math.abs(w);
  return a >= 1000 ? `${(w / 1000).toFixed(a >= 10000 ? 1 : 2)} kW` : `${Math.round(w)} W`;
}
/** "0.42 kWh", "12.3 kWh". */
function fmtKwh(v) {
  return `${v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(2)} kWh`;
}
/** Device colours, in the order Home Assistant's Energy dashboard uses for its devices. */
const E_COLORS = ["#4269d0", "#efb118", "#ff725c", "#6cc5b0", "#3ca951", "#ff8ab7", "#a463f2", "#97bbf5", "#9c6b4e", "#9498a0"];

/** Kind → Live / custom overlay setting key. */
// 0.11: the overlay the card editor is working on: previews (HA's and the large one) keep showing it.
let EDIT_OV = null;
const LIVE_KEY = { light: "lights", switch: "switches", fan: "switches", cover: "covers", climate: "climate", motion: "motion", opening: "openings", lock: "locks", alarm: "locks", media: "media", appliance: "appliances", camera: "cameras", safety: "safety" };

function tapKind(kind) {
  if (kind === "light") return "light";
  if (kind === "switch" || kind === "fan") return "switch";
  if (kind === "cover") return "cover";
  if (kind === "climate") return "climate";
  if (kind === "lock" || kind === "alarm") return "lock";
  if (["temperature", "humidity", "battery", "signal", "sensor", "reading"].includes(kind)) return "reading";
  return "other";
}

// 0.13.9.17 #70: Home Assistant's entity registry (hass.entities), kept by every card: entity categories
// are there, never in a state's attributes.
let dfcReg = null;
const dfcCat = (eid) => (dfcReg && dfcReg[eid] && dfcReg[eid].entity_category) || null;
const dfcHidden = (eid) => !!(dfcReg && dfcReg[eid] && dfcReg[eid].hidden);

/** 0.13.9.17 #70: a reading no real room has: humidity 0 %, CO₂ / particles / VOC / NO₂ exactly 0 ("no such sensor"). */
function impossibleReading(eid, st) {
  if (!st || !num(st.state) || Number(st.state) !== 0) return false;
  const dc = String(st.attributes.device_class || "");
  return /^(humidity|carbon_dioxide|pm1|pm25|pm10|volatile_organic_compounds(_parts)?|nitrogen_dioxide|aqi)$/.test(dc) || /voc|co2/i.test(eid);
}

/** Room temperature, not the chip temperature of a switch or contact sensor. */
function ambientTemp(eid, st, item) {
  if (/(device_temperature|internal_temperature|cpu_temperature|processor_temperature|chip_temperature|_temperature_internal)/i.test(eid)) return false;
  if (dfcCat(eid) === "diagnostic" || (st && st.attributes && st.attributes.entity_category === "diagnostic")) return false;
  if (item.standalone) return true;
  // 0.12.9: no computers (a NAS's or printer's temperature is its own); "Use its temperature in Comfort" adds one.
  return ["sensors", "climate", "motion"].includes(item.group);
}

function signalTone(eid, st) {
  if (!live(st) || !num(st.state)) return "unknown";
  const v = Number(st.state);
  const unit = (st.attributes && st.attributes.unit_of_measurement) || "";
  if (/lqi|linkquality/i.test(eid) || (!unit && v >= 0)) return v >= 150 ? "good" : v >= 100 ? "fair" : "poor";
  if (unit === "%") return v >= 60 ? "good" : v >= 30 ? "fair" : "poor";
  return v >= -65 ? "good" : v >= -80 ? "fair" : "poor"; // dBm
}

const CARD_CSS = `
:host { display:block; --dfc-size: 34px; --dfc-accent: var(--primary-color, #03a9f4); }
* { box-sizing: border-box; }
ha-card { position:relative; overflow:hidden; height:100%; display:flex; flex-direction:column; }
/* #111: "tools: side" (the mobile card in landscape): the overlay's controls as one icon column in the strip left of
   the plan (under the floors), its legends in a popover; nothing under the plan. */
ha-card.tsd { overflow: visible; }
ha-card.tsd .tside, ha-card.tsd .tinfo, ha-card.tsd .lcorner { translate: 0 var(--dfc-scroll, 0px); } /* #122: fixed over a scrolling tall plan */
.tside { position:absolute; left: var(--dfc-tools-left, -48px); top: var(--dfc-tools-top, 120px); width:36px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; gap:4px; padding:3px 0; border-radius:18px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); box-shadow:0 2px 10px rgba(0,0,0,.2); z-index:6; max-height: calc(100% - var(--dfc-tools-top, 120px) - 6px); overflow-y:auto; scrollbar-width:none; }
.tside::-webkit-scrollbar { display:none; }
.tside .bar { display: contents; }
ha-card.tsd .tside button { width:30px; height:30px; min-height:0; border-radius:50%; border:1px solid var(--divider-color, rgba(0,0,0,.12)); background: var(--card-background-color, #fff); color: var(--primary-text-color); font-size:0; padding:0; margin:0; display:flex; align-items:center; justify-content:center; gap:0; --mdc-icon-size:18px; flex:none; position:relative; cursor:pointer; box-shadow:none; }
ha-card.tsd .tside button.on { background: var(--dfc-accent, var(--primary-color, #03a9f4)); border-color: var(--dfc-accent, var(--primary-color, #03a9f4)); color:#fff; }
.tside button.on ha-icon { color:#fff !important; }
.tside button.tg:not(.on) { color: var(--secondary-text-color); }
.tside button.ok { color:#43a047; cursor:default; }
.tside .obadge, .tside .odot { position:absolute; top:-3px; right:-3px; font-size:10px; }
.tinfo { position:absolute; left: 2px; top: var(--dfc-tools-top, 120px); z-index:7; max-width: min(80%, 620px); max-height: calc(100% - var(--dfc-tools-top, 120px) - 6px); overflow:auto; box-sizing:border-box; padding:10px 12px; border-radius:14px; background: var(--card-background-color, #fff); box-shadow: 0 6px 24px rgba(0,0,0,.22); }
.tinfo .heatleg, .tinfo .netleg, .tinfo .leg { margin:0; flex-wrap:wrap; }
ha-card.dock-top { flex-direction: column-reverse; }
ha-card.dock-left { flex-direction: row-reverse; }
ha-card.dock-right { flex-direction: row; }
.main { position:relative; flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
.hdr { position:absolute; left:14px; top:12px; z-index:4; font-size:15px; font-weight:500; padding:4px 10px; border-radius:10px; background: color-mix(in srgb, var(--card-background-color, #fff) 75%, transparent); backdrop-filter: blur(6px); }
.wrap { position:relative; flex:1; display:flex; align-items:flex-start; justify-content:center; padding: 8px 8px 0; min-height:120px; }
.fr { position:relative; width: min(100%, calc(var(--dfc-fit-h, calc(100vh - var(--dfc-chrome, 170px))) * var(--fratio))); aspect-ratio: var(--fratio); }
:host([fw]) .fr { width: 100%; } /* #122: drawn at the full width (its container scrolls) */
.fr.crop { overflow:hidden; border-radius: 4px; }
.box { position:relative; width: 100%; aspect-ratio: var(--ratio); }
.night, .ntint, .nglow, .nglow2 { position:absolute; inset:0; pointer-events:none; }
.obar { position:absolute; height:7px; padding:0; margin:0; border:0; border-radius:4px; transform-origin:0 50%; cursor:pointer; z-index:2; box-sizing:border-box; overflow:hidden; background:transparent; }
.obar.door { background:#4fc3f7; box-shadow:0 0 8px rgba(79,195,247,.85); }
.obar.shut { overflow:visible; }
.obar.shut i { display:block; height:100%; background:#fff; border-radius:4px; box-shadow:0 0 0 1px rgba(0,0,0,.18), 0 0 6px rgba(0,0,0,.35); }
.obar.shut.unk { border:2px dashed rgba(255,255,255,.75); opacity:.6; }
.obar.shut.track { border:1.5px solid rgba(255,255,255,.7); box-shadow:0 0 0 1px rgba(0,0,0,.18); }
.obar.alert { border-color:#ff7043; animation: dfcBarAlert 1.4s ease-in-out infinite; }
.obar.alert i { background:#ff5722; }
@keyframes dfcBarAlert { 0%, 100% { box-shadow:0 0 4px rgba(255,87,34,.5); opacity:.75; } 50% { box-shadow:0 0 14px rgba(255,87,34,1); opacity:1; } }
@media (prefers-reduced-motion: reduce) { .obar.alert { animation:none; } }
.box svg.focus { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; fill: var(--dfc-focus-dim, var(--primary-background-color, #f2f2f2)); fill-opacity:.6; }
.box .m, .box .chip, .box .applbl, .box .rdock, .box .epin, .box .gdev { scale: var(--dfc-ui, 1); }
.box .room { scale: var(--dfc-ui-room, var(--dfc-ui, 1)); } /* 0.13.9.19 #95: room names shrink less than icons */
.room .rv { font-weight: 600; display:inline-flex; align-items:center; gap: 3px; }
.room.rvw { flex-direction: column; gap: 0; line-height: 1.15; text-align: center; }
.room.rvw .rv { font-size: .85em; }
.room.rvw.el { transform: translate(-12%, -50%); }
.room.rvw.er { transform: translate(-88%, -50%); }
.room .adot { width: 7px; height: 7px; border-radius: 50%; display:inline-block; background: #43a047; }
.room .adot.a1 { background: #f9a825; }
.room .adot.a2 { background: #e53935; }
.box svg.pulse { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.box svg.taps { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.box svg.taps .ptap, .box svg.taps .atap { pointer-events: all; cursor:pointer; }
.pg.breathe { animation: dfcBreathe 3.6s ease-in-out infinite; }
.pg.steady { opacity:.5; }
.pg.fade { animation: dfcPulseOut 2s linear forwards; }
@keyframes dfcBreathe { 0%, 100% { opacity:.45; } 50% { opacity:1; } }
@keyframes dfcPulseOut { from { opacity:.8; } to { opacity:0; } }
@media (prefers-reduced-motion: reduce) { .pg.breathe { animation:none; opacity:.8; } }
/* 0.13.4: the air flow's tap area is in svg.taps (under the pictures), the drawing itself takes no taps */
.box svg.air, .box svg.shade { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.nglow { mix-blend-mode: soft-light; }
.nglow.day { mix-blend-mode: multiply; opacity:.85; filter: saturate(1.6); }
.nglow2 { mix-blend-mode: screen; }
.box.nt .room.label { color:#fff; text-shadow: 0 0 3px rgba(0,0,0,.9), 0 0 7px rgba(0,0,0,.8); }
.box.nq .m:not(.on):not(.person) .ic, .box.nq .chip:not(.on) { filter: brightness(.78) saturate(.85); box-shadow: 0 0 0 1px rgba(255,255,255,.22), 0 1px 4px rgba(0,0,0,.5); }
${PIC_CSS}
.touch { position:absolute; z-index:1; border-radius:6px; cursor:pointer; -webkit-tap-highlight-color: transparent; }
.touch.outline { outline: 1px dashed color-mix(in srgb, var(--dfc-accent) 55%, transparent); outline-offset:-1px; }
.touch.flash { background: color-mix(in srgb, var(--dfc-accent) 22%, transparent); outline: 1px solid var(--dfc-accent); transition: background .2s; }
.touch.busy, [data-k].busy { animation: dfbusy 1s ease-in-out infinite; }
.touch.busy { background: color-mix(in srgb, var(--dfc-accent) 16%, transparent); }
@keyframes dfbusy { 50% { opacity:.45; } }
@media (prefers-reduced-motion: reduce) { .touch.busy, [data-k].busy { animation:none; opacity:.6; } }
.m.person .ic { background: var(--dfc-accent); color:#fff; font-weight:600; font-size: calc(var(--dfc-size) * .38); overflow:hidden; border: 2px solid var(--card-background-color, #fff); width: calc(var(--dfc-size) * 1.1); height: calc(var(--dfc-size) * 1.1); }
.m.person .ic img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
.m.person.low .ic { opacity:.55; border-style: dashed; }
.m.person.pd .ic { opacity:.85; }
svg.pdr { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
svg.pdr ellipse { fill:none; stroke:var(--dfc-accent, #2196f3); stroke-opacity:.3; stroke-width:1.5; stroke-dasharray:4 4; vector-effect:non-scaling-stroke; }
svg.pdr ellipse.near { stroke-opacity:.75; stroke-dasharray:none; }
.m.person { z-index:3; }
.prow { display:flex; align-items:center; gap:8px; padding:6px 4px 0; flex-wrap:wrap; font-size:12px; color: var(--secondary-text-color); }
.prow button { border:0; background:transparent; padding:0; cursor:pointer; display:flex; align-items:center; gap:5px; font: inherit; color: var(--primary-text-color); }
.prow .av { width:26px; height:26px; border-radius:50%; background: var(--dfc-accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; overflow:hidden; }
.prow .av img { width:100%; height:100%; object-fit:cover; }
.box img.plan { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; display:block; user-select:none; -webkit-user-drag:none; }
svg.rpath { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
svg.rpath polyline { fill:none; stroke: rgb(33,150,243); stroke-width:2.5; stroke-linejoin:round; stroke-linecap:round; opacity:.55; vector-effect: non-scaling-stroke; }
svg.fresh { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
svg.fresh polygon { pointer-events: visiblePainted; cursor:pointer; stroke:none; transition: fill .3s; }
/* 0.11 Energy: room shading, flow lines from the electrical panel, compact chips in each device's energy colour, the day scrubber. */
svg.efill polygon { pointer-events:none; cursor:default; }
svg.lines path.eln { fill:none; stroke-width:1.5; stroke-linecap:round; }
@media (prefers-reduced-motion: reduce) { svg.lines circle:has(animateMotion) { display:none; } }
/* 0.11 layer 3: camera dot; layer 4: windows (camera pictures), placed after the markers. */
.m.camdot { width:16px; height:16px; min-width:0; padding:0; border-radius:50%; border:3px solid #fff; background:#26a69a; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.m.camdot::before { inset:-14px; }
.wins { position:absolute; inset:0; pointer-events:none; z-index:4; }
.cwin { position:absolute; pointer-events:auto; border:2px solid #fff; border-radius:10px; overflow:hidden; background:#222; box-shadow: 0 4px 14px rgba(0,0,0,.4); cursor:pointer; }
.cwin img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
.cwin .cvid { width:100%; height:100%; display:block; pointer-events:none; overflow:hidden; } /* 0.13.1: live video */
.cwin .cvid ::slotted(ha-camera-stream) { width:100%; height:100%; display:block; }
.cwin.dr { cursor:grab; touch-action:none; }
.cwin.drag { cursor:grabbing; z-index:3; box-shadow: 0 10px 28px rgba(0,0,0,.5); transform: scale(1.03); }
.lines .wguide { stroke: var(--dfc-accent); stroke-width:1; stroke-dasharray: 4 4; opacity:.8; }
.lines .sl { opacity:0; transition: opacity .2s; }
.lines .sl.on { opacity:1; }
.lines .film { fill:#16181c; opacity:.92; }
.lines .holes { stroke: rgba(255,255,255,.35); stroke-width:3; stroke-dasharray: 5 7; stroke-linecap:round; }
.cwin .cnm { position:absolute; left:0; right:0; bottom:0; display:flex; align-items:center; gap:6px; padding:2px 6px; font-size:11px; color:#fff; background: linear-gradient(transparent, rgba(0,0,0,.65)); white-space:nowrap; }
.cwin .cnm .cn { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.cwin .crd { position:absolute; top:4px; right:4px; display:flex; gap:4px; }
.cwin .crd > span { display:inline-flex; align-items:center; gap:2px; padding:0 5px; border-radius:7px; background: rgba(0,0,0,.6); color:#fff; font-size:10px; line-height:16px; }
.cwin .crd { max-width: calc(100% - 8px); }
.cwin .crd > span { min-width:0; flex: 0 1 auto; }
.cwin .crd b { font-weight:inherit; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cwin .crd ha-icon, .cwin .crd ha-state-icon { --mdc-icon-size:11px; }
.cwin .crd .lo { color:#ffb74d; font-weight:600; }
.cwin .cx { flex:none; width:22px; height:22px; padding:0; border:0; border-radius:50%; background: rgba(0,0,0,.65); color:#fff; font-size:16px; line-height:24px; cursor:pointer; opacity:0; transition: opacity .15s; }
.cwin:hover .cx { opacity:1; }
@media (hover: none) { .cwin .cx { opacity:1; } }
svg.lines path.elbow { fill:none; stroke:#26a69a; stroke-width:2; }
.chip.en { padding: 3px 9px 3px 6px; border-radius: 999px; box-shadow: 0 0 0 2px var(--dfc-c), 0 1px 4px rgba(0,0,0,.3); font-size: 12px; }
.chip.en ha-icon { --mdc-icon-size: 14px; color: var(--dfc-c); }
.epin { position:absolute; transform:translate(-50%,-50%); width:32px; height:32px; box-sizing:border-box; border-radius:50%; display:flex; align-items:center; justify-content:center; background: var(--card-background-color, #fff); border: 2px solid var(--energy-grid-consumption-color, #488fc2); color: var(--primary-text-color, #222); box-shadow: 0 1px 4px rgba(0,0,0,.25); pointer-events:none; z-index:2; }
.epin.source { border-color: var(--energy-solar-color, #ff9800); }
.epin.battery { border-color: var(--energy-battery-out-color, #4db6ac); }
.epin ha-icon { --mdc-icon-size:18px; }
.epin.dummy { border-style: dashed; }
.epin.val { width:auto; min-width:32px; padding:0 9px 0 6px; border-radius:16px; gap:4px; font-size:12px; font-weight:600; white-space:nowrap; }
.room .rage.epw { color: var(--energy-grid-consumption-color, #488fc2); font-weight:600; }
.newov { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin: 8px 12px 2px; padding: 8px 12px; border-radius: 12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); font-size: 13px; }
.notes { position:absolute; left:50%; bottom:10px; transform:translateX(-50%); z-index:6; display:flex; flex-direction:column; gap:6px; width:max-content; max-width: calc(100% - 24px); pointer-events:none; }
.notes .newov { margin:0; pointer-events:auto; background: color-mix(in srgb, var(--card-background-color, #fff) 88%, var(--primary-color, #03a9f4)); box-shadow: 0 2px 10px rgba(0,0,0,.25); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.newov ha-icon { --mdc-icon-size: 18px; color: var(--primary-color, #03a9f4); }
.newov button { border: 0; border-radius: 14px; padding: 4px 12px; font: inherit; cursor: pointer; background: var(--secondary-background-color, rgba(0,0,0,.06)); color: var(--primary-text-color); }
.newov button[data-add] { background: var(--primary-color, #03a9f4); color: #fff; }
.heatleg.eleg i.eshade { width:22px; border-radius:3px; background: linear-gradient(90deg, color-mix(in srgb, var(--energy-grid-consumption-color, #488fc2) 15%, transparent), var(--energy-grid-consumption-color, #488fc2)); }
.heatleg.eleg i { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:4px; vertical-align:-1px; }
.escrub { position:relative; margin: 8px 12px 0; }
/* test10: Energy's hours under the plan again: the last 24 hours, a stacked bar each, labels below. */
.escrub .etrack { display:grid; align-items:stretch; height:46px; gap:2px; cursor:grab; touch-action: pan-y; user-select:none; }
.escrub .etrack i { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; font-style:normal; font-size:10px; color: var(--secondary-text-color); }
.escrub .etrack i.hr { border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); padding-bottom:13px; box-sizing:border-box; }
.escrub .etrack i.hr b { width: 72%; max-width: 18px; border-radius: 2px 2px 0 0; opacity:.75; }
.escrub .etrack i.hr small { position:absolute; bottom:1px; left:2px; font-size:9px; line-height:1; opacity:.8; white-space:nowrap; }
.escrub .etrack i.hr.day { border-left-color: var(--primary-text-color); }
.escrub .etrack i.hr.day small { font-weight:700; opacity:1; color: var(--primary-text-color); }
.escrub .etrack.pick i.hr b { opacity:.3; }
.escrub .etrack i.hr.on { background: color-mix(in srgb, var(--energy-grid-consumption-color, #488fc2) 14%, transparent); border-radius:3px; color: var(--primary-text-color); }
.escrub .etrack.pick i.hr.on b { opacity:1; }
.escrub .etrack i.end { justify-content:center; text-align:center; line-height:1.1; padding:0 4px; font-size:11px; font-weight:600; overflow:hidden; border-radius:8px; background: var(--secondary-background-color, rgba(0,0,0,.05)); }
.escrub .etrack i.end.on { background: var(--energy-grid-consumption-color, #488fc2); color:#fff; }
.escrub .erange { position:absolute; left:0; top:0; width:100%; height:100%; margin:0; opacity:0; pointer-events:none; }
.rpbar { margin: 10px 12px 2px; }
.rpbar .rprail { border-radius:22px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 80%, transparent); }
.ovbar { --rpb: 34px; }
.ovbar.sz-s { --rpb: 28px; }
.ovbar.sz-l { --rpb: 42px; }
.rprail { display:flex; align-items:center; gap:6px; padding:6px 10px; color: var(--bfg, var(--secondary-text-color)); flex:1; min-width:0; min-height:0; box-sizing:border-box; --rpb: inherit; }
.rprail.v { flex-direction:column; padding:8px 4px; gap:6px; width:100%; }
.rprail button { border:0; background:transparent; color: inherit; font: inherit; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0; }
.rprail .rpnow { gap:2px; font-size:12px; font-weight:600; color: var(--bon-fg, var(--primary-text-color)); padding:4px 6px; border-radius:12px; --mdc-icon-size:16px; }
.rprail.v .rpnow { flex-direction:column; }
.rprail .rpplay { width:var(--rpb); height:var(--rpb); flex:none; border-radius:50%; background: var(--dfc-accent); color:#fff; --mdc-icon-size: calc(var(--rpb) * .6); }
.rppn { display:inline-flex; gap:0; }
.rppn button { width: calc(var(--rpb) * .8); height: calc(var(--rpb) * .8); border-radius:50%; --mdc-icon-size: calc(var(--rpb) * .5); }
.rprail button:hover { background: var(--btile, rgba(0,0,0,.06)); }
.rprail .rpplay:hover { background: var(--dfc-accent); filter: brightness(1.08); }
.rptl { flex:1; min-width:80px; display:flex; flex-direction:column; }
.rpend { font-size:10px; opacity:.8; }
.rpscale { display:flex; justify-content:space-between; font-size:10px; opacity:.8; margin: 0 2px; }
.rprail select { font: inherit; font-size:11px; font-weight:600; padding:2px 4px; border-radius:10px; border:1px solid var(--bline, rgba(0,0,0,.15)); background: transparent; color: inherit; cursor:pointer; max-width:100%; }
.rprail select option { color:#111; }
.rptrack { position:relative; cursor:pointer; touch-action:none; user-select:none; }
.rptrack.h { height:30px; margin: 0 4px; }
/* test9: on a side rail the track takes the rail's whole width: the line at the outer edge, the rest for the bars. */
.rptrack.v { align-self:stretch; flex:1; min-height:100px; margin: 0 5px; }
.rptrack.v.ln { margin-top:10px; }
.rpline { position:absolute; border-radius:2px; background: var(--bline, rgba(0,0,0,.15)); }
.rptrack.h .rpline { left:0; right:0; bottom:6px; height:3px; }
.rptrack.v .rpline { top:0; bottom:0; left:4px; width:3px; }
.rpline b { position:absolute; display:block; border-radius:2px; background: var(--dfc-accent); }
.rptrack.h .rpline b { left:0; top:0; bottom:0; }
.rptrack.v .rpline b { left:0; right:0; bottom:0; }
.rpbars { position:absolute; pointer-events:none; }
.rptrack.h .rpbars { left:0; right:0; top:2px; bottom: calc(12px + var(--lanes, 0) * 6px); }
.rptrack.v .rpbars { top:0; bottom:0; left: calc(14px + var(--lanes, 0) * 6px); right:0; }
.rpbars i { position:absolute; border-radius:1px; opacity:.85; }
.rptrack.h .rpbars i { bottom:0; width: var(--w); height: var(--h); }
.rptrack.v .rpbars i { left:0; height: var(--w); width: var(--h); }
/* Spans (how long something ran): one thin lane per device, beside the line. */
.rpspans { position:absolute; inset:0; pointer-events:none; }
.rpspans s { position:absolute; display:block; border-radius:2px; opacity:.9; pointer-events:auto; }
.rptrack.h .rpspans s { height:4px; bottom: calc(11px + var(--lane) * 6px); }
.rptrack.v .rpspans s { width:4px; left: calc(14px + var(--lane) * 6px); }
/* The line (a measured value: Comfort's average indoor temperature) over the bars area, with its range. */
.rpln { position:absolute; overflow:visible; pointer-events:none; }
.rptrack.h .rpln { left:0; right:0; top:2px; bottom:12px; width:100%; height: calc(100% - 14px); }
.rptrack.v .rpln { top:0; bottom:0; left:14px; width: calc(100% - 14px); height:100%; }
.rpln polyline { fill:none; stroke: var(--state-climate-heat-color, #ff8100); stroke-width:1.6; vector-effect: non-scaling-stroke; stroke-linejoin:round; }
.rpmm { position:absolute; font-size:9px; opacity:.8; white-space:nowrap; pointer-events:none; }
.rptrack.h .rpmm { right:0; top:-10px; }
.rptrack.v .rpmm { top:-12px; left:50%; transform:translateX(-50%); }
/* test9: hour marks on the line (where a fast drag glues to). */
.rpticks u { position:absolute; display:block; background: var(--bline, rgba(0,0,0,.2)); pointer-events:none; text-decoration:none; }
.rpticks u.d { background: currentColor; opacity:.7; }
.rptrack.h .rpticks u { bottom:2px; width:1px; height:11px; }
.rptrack.v .rpticks u { left:0; height:1px; width:11px; }
.rprail.ld .rpbars { opacity:.35; }
.rpthumb { position:absolute; width:14px; height:14px; border-radius:50%; background: var(--card-background-color, #fff); border:3px solid var(--dfc-accent); box-sizing:border-box; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.rptrack.h .rpthumb { bottom:1px; margin-left:-7px; }
.rptrack.v .rpthumb { left:-1px; margin-bottom:-7px; }
.rpthumb em { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); font-style:normal; font-size:11px; font-weight:600; color:#fff; background: var(--dfc-accent); padding:1px 6px; border-radius:6px; white-space:nowrap; pointer-events:none; opacity:0; transition: opacity .15s; }
/* test9: on a side rail the bubble is drawn on the card (.rpbub), beside the rail: the plan can't cover it. */
.rptrack.v .rpthumb em { display:none; }
.rpbub { position:absolute; z-index:8; transform:translateY(-50%); font-size:11px; font-weight:600; color:#fff; background: var(--dfc-accent); padding:2px 7px; border-radius:6px; white-space:nowrap; pointer-events:none; box-shadow: 0 1px 4px rgba(0,0,0,.3); font-variant-numeric: tabular-nums; }
.rpbub[hidden] { display:none; }
.rprail.v select { -webkit-appearance:none; appearance:none; width:100%; box-sizing:border-box; text-align:center; text-align-last:center; padding:3px 0; }
.rprail.act .rpthumb em { opacity:1; }
.rpovw { position:relative; display:inline-flex; }
.rpov { color: var(--warning-color, #f0a020) !important; }
.rpmenu { position:absolute; z-index:9; right:0; top: calc(100% + 6px); min-width:180px; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius:12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); padding:6px; display:flex; flex-direction:column; }
.lcorner.bottom-left .rpmenu, .lcorner.bottom-right .rpmenu { top:auto; bottom: calc(100% + 6px); }
.lcorner.top-left .rpmenu, .lcorner.bottom-left .rpmenu { right:auto; left:0; }
.rpmenu button { display:flex; align-items:center; gap:10px; border:0; background:transparent; font: inherit; font-size:14px; padding:8px 10px; border-radius:8px; color: inherit; cursor:pointer; --mdc-icon-size:20px; text-align:left; }
.rpmenu button.on { background: color-mix(in srgb, var(--dfc-accent) 16%, transparent); color: var(--dfc-accent); font-weight:600; }
.ovbar.rpmode { overflow:visible; }
/* 0.11.1 test8: the time bubble shows in full over the plan; a side rail grows to hold all its controls. */
.dockrow.rpm { z-index:7; overflow:visible; }
.dock-left .dockrow.rpm, .dock-right .dockrow.rpm { min-height: min-content; max-height:none; }
.rptrack.v .rpbars i { min-height:1px; }
.rptrack.v { --rpgd: to right; }
/* Right-hand rail: a mirror of the left (line on the outer side, bars and the bubble towards the plan). */
.dock-right .rptrack.v { --rpgd: to left; }
.dock-right .rptrack.v .rpline { left:auto; right:4px; }
.dock-right .rptrack.v .rpbars { left:0; right: calc(14px + var(--lanes, 0) * 6px); }
.dock-right .rptrack.v .rpspans s { left:auto; right: calc(14px + var(--lane) * 6px); }
.dock-right .rptrack.v .rpln { left:0; transform: scaleX(-1); }
.dock-right .rptrack.v .rpticks u { left:auto; right:0; }
.dock-right .rptrack.v .rpbars i { left:auto; right:0; }
.dock-right .rptrack.v .rpthumb { left:auto; right:-1px; }
/* 0.11.1 test8: the replay time in the Replay look (teal), small, on the row of the round buttons. */
.rppill { position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:6; display:flex; align-items:center; gap:5px; height:22px; box-sizing:border-box; padding:0 8px; border-radius:11px; background: var(--card-background-color, #fff); border:1px solid color-mix(in srgb, var(--dfc-accent) 55%, transparent); color: var(--dfc-accent); font: inherit; font-size:12px; font-weight:600; font-variant-numeric: tabular-nums; white-space:nowrap; cursor:pointer; box-shadow: 0 2px 6px rgba(0,0,0,.12); --mdc-icon-size:14px; }
.rppill span { border-bottom:1px dotted currentColor; line-height:1.15; }
/* test9: with the round buttons on the plan the pill sits beside them (their row), not over the plan's own pills. */
.lcorner .rppill { top:7px; left:auto; right: calc(100% + 8px); transform:none; }
.lcorner.top-left .rppill, .lcorner.bottom-left .rppill { right:auto; left: calc(100% + 8px); }
.box.rpon { outline: 2px solid color-mix(in srgb, var(--dfc-accent) 45%, transparent); outline-offset: 4px; border-radius: 6px; }
.heatleg.eleg .ewhen { color: var(--primary-text-color); }
.heatleg.eleg { flex-wrap:wrap; gap:4px 14px; padding-top:2px; }
.heatleg.eleg .cl { white-space:nowrap; }
.heatleg.secok { color: var(--success-color, #43a047); font-weight:600; }
.heatleg.secok ha-icon { --mdc-icon-size:18px; margin-right:4px; }
.heatleg.eleg ha-icon { --mdc-icon-size:16px; margin-right:3px; }
.room.solo { padding: 1px 7px; }
.room.solo small.rage { opacity: 1; font-size: .9em; font-weight: 600; }
.room small.rage.now { color: #fff; background: rgb(21,101,192); opacity: 1; font-weight: 600; display: table; margin: 2px auto 0; padding: 1px 8px; border-radius: 999px; text-shadow: none; box-shadow: 0 1px 3px rgba(0,0,0,.35); } /* 0.13.3: readable on the blue "cleaning now" room */
.room small.rage { display:block; font-size:.78em; opacity:.75; font-weight:400; text-align:center; }
.rdock.chg { color:#43a047; }
.rdock .rdw { position:absolute; top:-3px; right:-3px; width:9px; height:9px; border-radius:50%; background:#ffa000; border:1.5px solid var(--card-background-color, #fff); }
.m.robot .rbg { position:absolute; left:50%; top:100%; transform: translate(-50%, 2px); font-size:10px; font-weight:600; line-height:1.5; padding:0 5px; border-radius:8px; background: var(--card-background-color, #fff); color: var(--dfc-c); box-shadow: 0 1px 3px rgba(0,0,0,.25); white-space:nowrap; pointer-events:none; }
.m.robot .rbg.warn { background:#ffa000; color:#fff; }
.m.robot .rbg.err { background:#e53935; color:#fff; }
.rbpop .rbst { display:flex; align-items:center; gap:8px; margin:0 0 10px; color: var(--secondary-text-color); }
.rbpop .rbst::before { content:""; width:10px; height:10px; border-radius:50%; background: var(--c); flex:none; }
.rbpop h4 { margin:12px 0 6px; font-size:13px; font-weight:600; }
.rbpop .rbc { display:grid; grid-template-columns: 1fr 90px 52px; align-items:center; gap:8px; width:100%; padding:4px 0; background:none; border:0; color:inherit; font:inherit; font-size:13px; text-align:left; cursor:pointer; }
.rbpop .rbc i { height:6px; border-radius:3px; background: linear-gradient(90deg, #43a047 var(--p), rgba(127,127,127,.2) var(--p)); }
.rbpop .rbc.low i { background: linear-gradient(90deg, #ffa000 var(--p, 100%), rgba(127,127,127,.2) var(--p, 100%)); }
.rbpop .rbc i.n { background:none; }
.rbpop .rbc b { text-align:right; font-weight:500; }
.rbpop .rbc.low b { color:#e65100; }
.rbcmds { display:flex; gap:8px; margin:14px 0 4px; flex-wrap:wrap; }
.rbcmds button { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:18px; border:1px solid var(--divider-color, rgba(0,0,0,.15)); background:none; color:inherit; font:inherit; cursor:pointer; --mdc-icon-size:18px; }
.bar.oacts button { position:relative; }
.bar.oacts .odot { position:absolute; top:4px; right:6px; width:8px; height:8px; border-radius:50%; }
.bar.oacts .obadge { margin-left:6px; font-style:normal; font-size:11px; font-weight:600; line-height:1.5; padding:0 6px; border-radius:8px; background: var(--primary-color, #03a9f4); color:#fff; }
.room.ctap { pointer-events:auto; cursor:pointer; }
.rbhint { margin-top:8px; font-size:12px; color: var(--secondary-text-color); }
.rdock { position:absolute; transform: translate(-50%,-50%); width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: var(--card-background-color, #fff); color: var(--secondary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.3); --mdc-icon-size:14px; pointer-events:none; }
.m.robot { z-index:3; }
.m.robot .ic { background: color-mix(in srgb, var(--dfc-c) 18%, var(--card-background-color, #fff)); color: var(--dfc-c); }
.m.robot .rhd { position:absolute; inset:-7px; pointer-events:none; }
.m.robot .rhd::before { content:""; position:absolute; left:50%; top:0; transform: translateX(-50%); border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:7px solid var(--dfc-c); }
.m.robot.error .ic, .m.robot.paused .ic { animation: dfcrb 1.6s ease-in-out infinite; }
.m.robot .ic { position:relative; }
@keyframes dfcrb { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--dfc-c) 30%, transparent), 0 1px 6px rgba(0,0,0,.35); } }
svg.lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
svg.lines line { stroke-linecap: round; }
svg.lines line.lead { stroke: var(--secondary-text-color); stroke-width:1; opacity:.55; }
svg.lines line.wl { stroke-width:1.6; stroke-dasharray: 3 4; opacity:.7; }
svg.lines line.wl.cab { stroke-width:2.2; stroke-dasharray:none; opacity:.8; }
svg.lines line.hub { stroke: var(--dfc-accent); stroke-width:1.6; stroke-dasharray: 5 4; opacity:.75; }
.room { position:absolute; transform: translate(-50%, -50%); pointer-events:none; white-space:nowrap; font-weight:500; color: var(--dfc-roomfg); display:flex; align-items:center; gap:4px; z-index:0; }
.room.label { text-shadow: 0 0 3px var(--dfc-roomhalo), 0 0 6px var(--dfc-roomhalo); }
.room.pill { padding: 3px 10px; border-radius: 999px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); border: 1px solid var(--dfc-chipborder); font-weight:600; letter-spacing:.2px; box-shadow:0 1px 4px rgba(0,0,0,.12); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.room ha-icon { --mdc-icon-size: 1.15em; }
.m { position:absolute; transform: translate(-50%, -50%); border:0; padding:0; background:transparent; cursor:pointer; font: inherit; color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; touch-action: manipulation; z-index:1; }
.m .ic { width: var(--dfc-size); height: var(--dfc-size); border-radius:50%; display:flex; align-items:center; justify-content:center; background: var(--card-background-color, #fff); box-shadow: 0 1px 4px rgba(0,0,0,.35); --mdc-icon-size: calc(var(--dfc-size) * .55); border: 2px solid transparent; transition: box-shadow .2s, background .2s, transform .1s; position:relative; }
.m:active .ic { transform: scale(.94); }
/* 0.11 (#9): every marker is easy to hit: at least 44 px, invisible, also when it shows text only; its value label is tappable too. */
.m::before { content:""; position:absolute; left:50%; top:50%; width:max(44px, 100%); height:max(44px, 100%); transform:translate(-50%, -50%); border-radius:50%; }
.m .val { pointer-events:auto; }
.m.on .ic { border-color: var(--dfc-c, var(--dfc-accent)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dfc-c, var(--dfc-accent)) 25%, transparent), 0 1px 6px rgba(0,0,0,.35); }
.m.light.on .ic { background: color-mix(in srgb, var(--dfc-lc, #ffc107) 22%, var(--card-background-color, #fff)); color: color-mix(in srgb, var(--dfc-lc, #ffc107) 80%, #000 12%); box-shadow: 0 0 16px 2px color-mix(in srgb, var(--dfc-lc, #ffc107) 55%, transparent); border-color: var(--dfc-lc, #ffc107); }
.m.glow .ic, .m.glow .val { opacity:0; }
.m.noi .ic { display:none; }
.bdg { position:absolute; top:-7px; right:-9px; min-width:16px; height:16px; padding:0 4px; border-radius:8px; background: var(--dfc-c, var(--primary-color, #03a9f4)); color:#fff; font-size:10px; font-weight:600; line-height:16px; text-align:center; white-space:nowrap; box-shadow:0 0 0 2px var(--card-background-color, #fff); pointer-events:none; }
.chip .bdg { top:-8px; right:-8px; }
.m.noi .val { position:static; transform:none; margin:0; }
.m.noi .bdg.nb { position:static; display:inline-block; }
.m .xs, .chip .xs { display:flex; flex-direction:column; align-items:flex-start; gap:0; font-size: calc(var(--dfc-chipsize, 34px) * .3); line-height:1.25; }
.m .xs { position:absolute; top: calc(100% + 2px); left:50%; transform: translateX(-50%); background: var(--dfc-chipbg); color: var(--dfc-chipfg); border:1px solid var(--dfc-chipborder); border-radius:8px; padding:2px 7px; white-space:nowrap; pointer-events:none; box-shadow:0 1px 4px rgba(0,0,0,.3); }
.chip .xs { margin-top:2px; opacity:.85; }
.m.eb .xs { top:auto; bottom: calc(100% + 2px); }
.m.eb.hasx .tip { bottom:auto; top: calc(100% + 6px); }
.m.et .tip { bottom:auto; top: calc(100% + 6px); }
.m.et.hasx .xs { top: calc(100% + 30px); }
.m.er .val { left:auto; right: calc(100% + 4px); }
.m.er .xs, .m.er .tip { left:auto; right:0; transform:none; }
.m.el .xs, .m.el .tip { left:0; transform:none; }
.xl { display:flex; align-items:center; gap:3px; white-space:nowrap; --mdc-icon-size: calc(var(--dfc-size) * .32); }
.chip.cl2.cmp { gap:5px; padding: 4px 9px 4px 6px; }
.chip.cl2.cmp .t { font-size: calc(var(--dfc-chipsize, 34px) * .42); font-weight:500; white-space:nowrap; }
.chip.cl2.cmp .mw { font-size: calc(var(--dfc-chipsize, 34px) * .32); opacity:.8; }
.m.dim .ic { opacity:.55; transform: scale(.82); }
.m.unavail .ic { opacity:.45; border: 2px dashed var(--secondary-text-color); }
ha-card.ov-security .m.unavail .ic { opacity:1; border-color: var(--error-color, #e53935); color: var(--error-color, #e53935); }
.m.motion.on .ic::after { content:''; position:absolute; inset:-2px; border-radius:50%; border:2px solid var(--dfc-c); animation: dfcpulse 1.8s ease-out infinite; }
@keyframes dfcpulse { from { transform: scale(1); opacity:.9; } to { transform: scale(1.9); opacity:0; } }
.m.ph .ic { background: var(--primary-text-color); color: var(--card-background-color, #fff); outline: 2px dashed var(--primary-text-color); outline-offset: 2px; width: calc(var(--dfc-size) * 1.15); height: calc(var(--dfc-size) * 1.15); }
.m.ph.on .ic { border-color: var(--dfc-c); }
.chip.ph { border: 2px dashed var(--primary-text-color); }
.phsum { display:flex; align-items:center; gap:8px; padding:4px 2px 10px; }
/* 0.12.10: readings chart (theme colours; override --dfc-rt / --dfc-rh with card-mod) */
.popin { --dfc-rt: #f0883e; --dfc-rh: #3b9bf5; }
.rc { position:relative; color: var(--secondary-text-color); }
.rc svg { width:100%; height:auto; display:block; touch-action: pan-y; overflow: visible; }
.rctip { position:absolute; top:-6px; transform: translateX(-50%); visibility:hidden; pointer-events:none; white-space:nowrap; font-size:12px; padding:3px 8px; border-radius:8px; background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.rcl { display:flex; gap:6px 16px; justify-content:center; flex-wrap:wrap; font-size:11px; }
.rcl .dash::before { background: repeating-linear-gradient(90deg, var(--c) 0 4px, transparent 4px 7px); }
.rcl span::before { content:""; display:inline-block; width:10px; height:3px; border-radius:2px; background: var(--c); margin-right:6px; vertical-align:middle; }
.rcnow { display:flex; gap:18px; align-items:baseline; }
.rcnow span, .rcv span { display:inline-flex; align-items:center; gap:6px; }
.rcnow span { font-size:26px; font-weight:500; }
.rcnow span::before, .rcv span::before { content:""; width:8px; height:8px; border-radius:50%; background: var(--dfc-rt); }
.rcnow .h::before, .rcv .h::before { background: var(--dfc-rh); }
.rcdet { display:flex; gap:14px; flex-wrap:wrap; }
.rcdet .more { color: var(--primary-color); }
.rclist { display:flex; flex-direction:column; border-top: 1px solid var(--divider-color); }
.rcrow { display:flex; align-items:center; gap:10px; padding:10px 2px; background:none; border:0; border-bottom: 1px solid var(--divider-color); color: inherit; font: inherit; text-align:left; cursor:pointer; }
.rcrow .nm { flex:1; display:flex; flex-direction:column; gap:2px; font-size:14px; }
.rcrow small, .rcv { font-size:12px; color: var(--secondary-text-color); display:flex; gap:10px; }
.rcs { width:84px; height:28px; flex:none; }
.rcrow .go { color: var(--secondary-text-color); }
.rcback { align-self:flex-start; background:none; border:0; padding:0; color: var(--primary-color); font: inherit; cursor:pointer; }
.phsum b { font-size:20px; font-weight:500; }
.phsum small { color: var(--secondary-text-color); margin-left:auto; }
.m .bn { position:absolute; top:-6px; right:-8px; min-width:17px; height:17px; border-radius:9px; background: var(--dfc-accent); color:#fff; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; border:2px solid var(--card-background-color, #fff); padding:0 3px; }
.m .val { position:absolute; left: calc(100% + 4px); top:50%; transform: translateY(-50%); white-space:nowrap; font-size:12px; font-weight:500; padding:2px 7px; border-radius:9px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.m.net .ic { background: var(--dfc-fill); color:#fff; border: 3px solid var(--dfc-ring, transparent); }
.m.net.diamond .ic { border-radius: 4px; transform: rotate(45deg) scale(.86); }
.m.net.diamond .ic ha-icon { transform: rotate(-45deg); }
.m.net.square .ic { border-radius: 7px; }
.m.net.unavailable .ic { opacity:.8; }
.m.net.szm .ic { width: max(14px, calc(var(--dfc-size) * .85)); height: max(14px, calc(var(--dfc-size) * .85)); --mdc-icon-size: calc(var(--dfc-size) * .47); border-width:2px; }
.m.net.szs .ic { width: max(14px, calc(var(--dfc-size) * .6)); height: max(14px, calc(var(--dfc-size) * .6)); --mdc-icon-size: max(9px, calc(var(--dfc-size) * .36)); border-width:2px; }
.m.net.szs::before { content:""; position:absolute; inset:-6px; } /* small mark, same touch area */
.m.net.szs.square .ic { border-radius:5px; }
.m.net img.nbm { width: var(--mdc-icon-size); height: var(--mdc-icon-size); object-fit:contain; filter: brightness(0) invert(1); }
.m.net b.nbm { font: 800 calc(var(--mdc-icon-size) * .9)/1 system-ui, sans-serif; letter-spacing:-.5px; }
.m.net.diamond .ic .nbm { transform: rotate(-45deg); }
.chip { position:absolute; transform: translate(-50%, -50%); border:0; cursor:pointer; font: inherit; padding: 6px 12px; border-radius: 12px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); box-shadow: 0 2px 8px rgba(0,0,0,.28); display:flex; flex-direction:column; align-items:center; gap:1px; line-height:1.2; text-align:center; border: 1px solid var(--dfc-chipborder); backdrop-filter: blur(4px); -webkit-tap-highlight-color: transparent; z-index:1; }
.chip .l1 { font-size: calc(var(--dfc-chipsize, 34px) * .42); font-weight:500; white-space:nowrap; }
.chip .l2 { font-size: calc(var(--dfc-chipsize, 34px) * .38); opacity:.9; white-space:nowrap; }
.chip .ico { --mdc-icon-size: 15px; display:flex; align-items:center; gap:4px; font-size: calc(var(--dfc-chipsize, 34px) * .38); font-weight:500; white-space:nowrap; }
.chip.clim { border-left: 4px solid var(--dfc-c); }
.chip.clim .ico { font-size: calc(var(--dfc-chipsize, 34px) * .42); --mdc-icon-size: calc(var(--dfc-chipsize, 34px) * .42); }
.chip.clim .ico ha-icon { color: var(--dfc-c); }
.chip.clim.off { opacity:.7; }
.chip.low { background:#e53935; color:#fff; border-color:#e53935; }
.chip.warn { border-color: var(--warning-color, #ffa000); border-width:2px; }
.m .tip, .chip .tip { position:absolute; left:50%; bottom: calc(100% + 6px); transform: translateX(-50%); white-space:nowrap; font-size:12px; font-weight:400; padding: 3px 8px; border-radius:6px; background: rgba(28,28,28,.92); color:#fff; opacity:0; pointer-events:none; transition: opacity .12s; z-index:3; }
.m.net.diamond .tip { transform: translateX(-50%); }
/* 0.7.5: hover names come from the one shared tooltip (.xtip); .tip stays for "names always". */
.names-always .tip { opacity:1; }
.names-always .tip small { display:none; }
.xb { position:absolute; top:-9px; right:-9px; width:20px; height:20px; border-radius:50%; background:#b3261e; color:#fff; font-size:12px; line-height:20px; text-align:center; cursor:pointer; z-index:8; box-shadow:0 1px 4px rgba(0,0,0,.4); pointer-events:auto; }
.dock .pen { position:static; box-shadow:none; margin-left:6px; }
.pen { position:absolute; top:8px; left:8px; z-index:6; display:flex; align-items:center; gap:6px; border:0; border-radius:16px; padding:6px 12px 6px 9px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-size:13px; font-weight:500; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); --mdc-icon-size:16px; }
.names-off .tip { display:none; }
.m:hover, .chip:hover { z-index:3; }
.m:focus-visible .ic, .chip:focus-visible { outline: 3px solid var(--dfc-accent); outline-offset: 2px; }
/* 0.8.2 Overlay Bar Reloaded: one bar as long as the plan (with its frame); buttons scroll inside it. */
.dockrow { display:flex; align-items:center; gap:8px; padding: 10px 0 12px; box-sizing:border-box; align-self:flex-start; flex:none; }
.dock-top .dockrow { padding: 12px 0 2px; }
.dock-top .dockrow, .dock-bottom .dockrow { margin-left: var(--dfc-bar-off, 0px); width: var(--dfc-bar-len, 100%); }
.dock-left .dockrow, .dock-right .dockrow { flex-direction:column; padding: 0 8px; margin-top: var(--dfc-bar-off, 0px); height: var(--dfc-bar-len, 0px); max-height:100%; }
/* buttons floating over the plan (the plan uses the whole card) */
.float .dockrow { position:absolute; z-index:4; pointer-events:none; margin:0; }
.float .dockrow > * { pointer-events:auto; }
.float.dock-bottom .dockrow { left: var(--dfc-bar-off, 0px); bottom:0; padding: 10px 10px 12px; }
.float.dock-top .dockrow { left: var(--dfc-bar-off, 0px); top:0; padding: 12px 10px 10px; }
.float.dock-left .dockrow { top: var(--dfc-bar-off, 0px); left:0; padding: 10px 8px; }
.float.dock-right .dockrow { top: var(--dfc-bar-off, 0px); right:0; padding: 10px 8px; }
.dockrow.share .lslot { flex: none; display:flex; min-width:44px; min-height:44px; align-items:center; justify-content:center; }
.lslot button.layers { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; flex:none; border:1px solid var(--dfc-chipborder, rgba(0,0,0,.12)); background: var(--dfc-chipbg, rgba(255,255,255,.85)); color: var(--dfc-chipfg, var(--primary-text-color)); box-shadow:0 2px 8px rgba(0,0,0,.18); --mdc-icon-size:20px; }
.lslot button.layers.on { color: var(--dfc-accent); border-color: var(--dfc-accent); }
.ovbar { position:relative; display:flex; flex: 1 1 auto; align-self:stretch; min-width:0; min-height:0; border-radius:22px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 80%, transparent);
  --bfg: var(--secondary-text-color); --bon-bg: var(--card-background-color, #fff); --bon-fg: var(--dfc-accent); --btile: color-mix(in srgb, var(--card-background-color, #fff) 60%, transparent); --bline: color-mix(in srgb, var(--primary-text-color, #000) 16%, transparent); --bring: var(--card-background-color, #fff); }
.ovbar.vert { flex-direction:column; }
.ovbar.sh-tiles { border-radius:14px; }
.ovbar.dark { background:#1f2329; --bfg: rgba(255,255,255,.62); --bon-bg: rgba(255,255,255,.13); --bon-fg:#fff; --btile: rgba(255,255,255,.06); --bline: rgba(255,255,255,.16); --bring:#1f2329; }
.ovbar.light { background:#eef0f3; --bfg: rgba(30,34,40,.62); --bon-bg: #fff; --bon-fg: #1f2329; --btile: rgba(0,0,0,.05); --bline: rgba(0,0,0,.14); --bring:#eef0f3; }
.ovbar.light .dock button.on ha-icon { color: var(--dfc-accent); }
.ovbar.light .chev { background:#fff; color:#1f2329; }
.ovbar.clear { background:transparent; --btile: color-mix(in srgb, var(--card-background-color, #fff) 88%, transparent); }
.float .ovbar.theme { background: color-mix(in srgb, var(--secondary-background-color, #eee) 62%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.dock { display:flex; flex: 1 1 auto; min-width:0; min-height:0; gap: var(--bgap, 2px); padding:4px; overflow:auto; scrollbar-width:none; overscroll-behavior:contain; }
.dock::-webkit-scrollbar { display:none; }
.dock[aria-orientation="vertical"] { flex-direction:column; min-width:64px; }
.dock:not([aria-orientation]) > :first-child { margin-left:auto; }
.dock:not([aria-orientation]) > :last-child { margin-right:auto; }
.dock .pen { position:static; box-shadow:none; margin-left:6px; }
.dock button { position:relative; display:flex; align-items:center; justify-content:center; gap:6px; flex:none; border:0; background:transparent; color: var(--bfg); font: inherit; font-size:13px; padding: 8px 14px; border-radius:18px; cursor:pointer; white-space:nowrap; box-sizing:border-box; --mdc-icon-size:18px; }
.dock[aria-orientation="vertical"] button { flex-direction:column; gap:3px; font-size:11px; padding: 9px 6px; width:100%; }
.dock button.on { background: var(--bon-bg); color: var(--bon-fg); box-shadow: 0 1px 4px rgba(0,0,0,.18); font-weight:500; }
.ovbar.dark .dock button.on { box-shadow:none; }
.ovbar.dark .dock button.on ha-icon { color: var(--dfc-accent); }
.ovbar.clear .dock button { background: var(--btile); box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.ovbar.clear .dock button.on { background: var(--bon-bg); }
.dock.icons button { padding: 8px 11px; }
.dock.icons button .bl { display:none; }
.ovbar.sz-s .dock button { font-size:11px; padding:6px 10px; --mdc-icon-size:16px; }
.ovbar.sz-l .dock button { font-size:15px; padding:11px 18px; --mdc-icon-size:24px; }
.ovbar.sz-s .dock[aria-orientation="vertical"] button { font-size:10px; padding:7px 4px; }
.ovbar.sz-l .dock[aria-orientation="vertical"] button { font-size:13px; padding:12px 8px; }
.ovbar.sh-tiles .dock { --bgap:6px; padding:6px; }
.ovbar.sh-tiles .dock button { flex-direction:column; gap:3px; font-size:11px; min-width:64px; padding:7px 10px; border-radius:10px; background: var(--btile); box-shadow:none; }
.ovbar.sh-tiles .dock button.on { background: color-mix(in srgb, var(--dfc-accent) 18%, var(--bon-bg)); color: var(--bon-fg); box-shadow: inset 0 0 0 1px var(--dfc-accent); }
.ovbar.sh-circles .dock { --bgap:6px; padding:6px; }
.ovbar.sh-circles .dock button { flex-direction:column; gap:3px; font-size:11px; padding:2px 6px; background:transparent; box-shadow:none; }
.ovbar.sh-circles .dock .bi { width: calc(var(--mdc-icon-size) + 18px); height: calc(var(--mdc-icon-size) + 18px); border-radius:50%; background: var(--btile); }
.ovbar.sh-circles .dock button.on { background:transparent; box-shadow:none; color: var(--bon-fg); }
.ovbar.sh-circles .dock button.on .bi { background: var(--dfc-accent); }
.ovbar.sh-circles .dock button.on .bi ha-icon { color:#fff; }
/* status: on the icon, never changes a button's size */
.dock .bi { position:relative; display:inline-flex; align-items:center; justify-content:center; flex:none; }
.dock .bdot { position:absolute; top:-3px; right:-4px; width:8px; height:8px; border-radius:50%; box-shadow: 0 0 0 1.5px var(--bring); }
.ovbar.sh-circles .dock .bdot { top:1px; right:1px; }
.dock .bbadge { position:absolute; top:-9px; right:-6px; min-width:16px; height:16px; padding:0 4px; box-sizing:border-box; border-radius:8px; background:#F2B84B; color:#1a1a1a; font-size:10px; font-weight:700; font-style:normal; line-height:16px; text-align:center; white-space:nowrap; box-shadow: 0 0 0 1.5px var(--bring); }
.ovbar.sh-circles .dock .bbadge { top:-4px; right:-6px; }
/* a faint line between card overlays, your own overlays and shortcuts (adds no space) */
.dock .bsep { flex:none; align-self:center; width:1px; height:55%; min-height:16px; background: var(--bline); margin: 0 calc(var(--bgap, 2px) / -2); }
.dock[aria-orientation="vertical"] .bsep { width:55%; height:1px; min-height:0; margin: calc(var(--bgap, 2px) / -2) 0; }
/* more buttons than room: they scroll, a chevron at the end (and at the start once scrolled) */
.ovbar .chev { position:absolute; z-index:2; display:none; align-items:center; justify-content:center; width:22px; height:22px; padding:0; border:0; border-radius:50%; cursor:pointer; background: var(--card-background-color, #fff); color: var(--secondary-text-color); box-shadow: 0 1px 4px rgba(0,0,0,.22); --mdc-icon-size:18px; }
.ovbar.dark .chev { background:#3a3f47; color:#fff; }
.ovbar.cs .chev.s, .ovbar.ce .chev.e { display:flex; }
.ovbar:not(.vert) .chev { top:50%; transform: translateY(-50%); }
.ovbar:not(.vert) .chev.s { left:3px; } .ovbar:not(.vert) .chev.e { right:3px; }
.ovbar.vert .chev { left:50%; transform: translateX(-50%); }
.ovbar.vert .chev.s { top:3px; } .ovbar.vert .chev.e { bottom:3px; }
/* 0.11: near a scroll arrow the buttons fade out and leave a clear band for the arrow (nothing half-visible behind it). */
.ovbar.ce:not(.vert) .dock { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
.ovbar.cs:not(.vert) .dock { -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to left, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
.ovbar.cs.ce:not(.vert) .dock { -webkit-mask-image: linear-gradient(to right, transparent, transparent 36px, #000 72px, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to right, transparent, transparent 36px, #000 72px, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
.ovbar.vert.ce .dock { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
.ovbar.vert.cs .dock { -webkit-mask-image: linear-gradient(to top, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to top, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
.ovbar.vert.cs.ce .dock { -webkit-mask-image: linear-gradient(to bottom, transparent, transparent 36px, #000 72px, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); mask-image: linear-gradient(to bottom, transparent, transparent 36px, #000 72px, #000 calc(100% - 72px), transparent calc(100% - 36px), transparent); }
/* fixed-height cards: the plan sits at the top (or centred), the bar right next to it */
/* the Side Rail: full height, flush with the card's edge */
ha-card.srail .dockrow { padding:0; margin:0; height: var(--dfc-rail-len, 0px); max-height:none; align-self:flex-start; gap:0; }
ha-card.srail .dockrow.rail-dark { background:#1f2329; }
ha-card.srail .dockrow.rail-light { background:#eef0f3; }
ha-card.srail .dockrow.rail-theme { background: color-mix(in srgb, var(--secondary-background-color, #eee) 85%, transparent); }
ha-card.srail .ovbar { border-radius:0; background:transparent; }
ha-card.srail .dockrow .lslot { padding: 8px 0; }
ha-card.srail .dockrow.rail-dark .lslot button.layers { box-shadow:none; }
.ovbar.sh-rail .dock { padding:10px 6px; --bgap:4px; }
.ovbar.sh-rail .dock button { border-radius:12px; background:transparent; box-shadow:none; }
.ovbar.sh-rail .dock button.on { background: var(--bon-bg); box-shadow:none; color: var(--bon-fg); }
.ovbar.sh-rail.theme .dock button.on ha-icon { color: var(--dfc-accent); }
:host([fit]) .wrap { flex: 0 1 auto; }
:host([fit]) ha-card.dock-top .main, :host([fit]) ha-card.dock-bottom .main { flex: 0 1 auto; }
:host([fit]) ha-card.dock-top { justify-content:flex-end; }
:host([fit][pc]) ha-card.dock-top, :host([fit][pc]) ha-card.dock-bottom, :host([fit][pc]) .main { justify-content:center; }
:host([pc]) .wrap { align-items:center; }
.bar { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; padding: 8px 10px 0; }
.bar button { display:flex; align-items:center; gap:5px; border: 1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:12px; padding: 5px 11px; border-radius: 16px; cursor:pointer; --mdc-icon-size: 16px; }
.bar button.on { border-color:#ffc107; background: color-mix(in srgb, #ffc107 18%, var(--card-background-color, #fff)); }
.legend { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap: 3px 14px; padding: 4px 8px 0; font-size:11px; line-height:1.3; color: var(--secondary-text-color); }
.legend .lgrp { display:flex; flex-wrap:wrap; align-items:center; gap: 2px 8px; }
.legend .lt { font-weight:600; letter-spacing:.3px; }
.legend span { display:flex; align-items:center; gap:4px; }
.legend i { display:inline-block; width:9px; height:9px; border-radius:50%; flex:none; }
.legend i.square { border-radius:2px; } .legend i.diamond { border-radius:1px; transform: rotate(45deg) scale(.85); }
.legend i.ring { background:transparent !important; border: 2.5px solid; box-sizing:border-box; }
.dock .sep { width:1px; align-self:stretch; margin: 6px 4px; background: var(--divider-color); flex: none; }
.dock-left .dock .sep, .dock-right .dock .sep { width:auto; height:1px; margin: 4px 6px; }
.dock button.layers.on { color: var(--dfc-accent); }
.legend button.layers { display:flex; align-items:center; gap:5px; border: 1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:12px; padding: 3px 10px; border-radius: 14px; cursor:pointer; --mdc-icon-size: 16px; }
.legend button.layers.on { color: var(--dfc-accent); border-color: var(--dfc-accent); }
.legend i.cab { width:16px; height:0; border-radius:0; border-top: 2px solid var(--secondary-text-color); }
.legend i.dash.wf { border-top-color: var(--secondary-text-color); border-top-style: dotted; }
.legend i.sw { width:10px; height:10px; border-radius:50%; }
.legend i.dash { width:16px; height:0; border-radius:0; border-top: 2px dashed var(--dfc-accent); }
.appl { position:absolute; z-index:2; cursor:pointer; }
.appl.drum { transform: translate(-50%, -50%); aspect-ratio:1; border-radius:50%; box-shadow: 0 0 0 2px rgba(var(--ac), .85), 0 0 14px 3px rgba(var(--ac), .55), inset 0 0 12px rgba(var(--ac), .45); }
.appl.drum i { position:absolute; inset:-3px; border-radius:50%; background: conic-gradient(from 0deg, rgba(var(--ac), 0) 0deg, rgba(var(--ac), .95) 70deg, rgba(var(--ac), 0) 110deg); -webkit-mask: radial-gradient(circle, transparent 62%, #000 64%); mask: radial-gradient(circle, transparent 62%, #000 64%); animation: dfcSpin 4s linear infinite; }
.appl.drum.spin i { animation-duration: 1.6s; }
.appl.drum.heat i { animation-duration: 6s; }
.appl.drum.done i, .appl.drum.unavailable i, .appl.drum.error i, .appl.drum.attention i, .appl.still i { animation:none; opacity:0; }
.appl.drum.attention, .appl.drum.error, .appl.aline.attention, .appl.aline.error { animation: dfcApPulse 1.8s ease-in-out infinite; }
.appl.unavailable { box-shadow:none !important; border:2px dashed rgba(150,150,150,.8); background:none; }
.appl.aline { height:2px; transform-origin:0 50%; border-radius:2px; background: linear-gradient(90deg, rgba(var(--ac), .35), rgba(var(--ac), 1), rgba(var(--ac), .35)); background-size: 200% 100%; box-shadow: 0 0 6px 2px rgba(var(--ac), .55); animation: dfcFlow 3s linear infinite; }
.appl.aline.heat { animation-duration: 6s; }
.appl.aline.done, .appl.aline.unavailable, .appl.still { animation:none; }
.appl.aline.unavailable { height:0; border:0; border-top:2px dashed rgba(150,150,150,.8); }
@keyframes dfcSpin { to { transform: rotate(360deg); } }
@keyframes dfcFlow { from { background-position: 200% 0; } to { background-position: 0 0; } }
@keyframes dfcApPulse { 0%, 100% { opacity:1; } 50% { opacity:.45; } }
.applbl { position:absolute; z-index:4; transform: translate(-50%, calc(-100% - 30px)); display:flex; flex-direction:column; gap:2px; padding:5px 10px; border-radius:12px; border:1px solid var(--dfc-chipborder); background: var(--dfc-chipbg); color: var(--dfc-chipfg); font: 500 12px/1.3 var(--primary-font-family, sans-serif); white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,.2); cursor:pointer; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.applbl .ar { display:flex; align-items:center; gap:6px; }
.applbl .ar i { width:8px; height:8px; border-radius:50%; flex:none; }
.alist .arow { display:flex; align-items:center; gap:6px; }
.alist .arow > button:first-child { flex:1; display:flex; align-items:center; gap:10px; border:0; background:transparent; color:inherit; font:inherit; text-align:left; padding:8px 4px; cursor:pointer; border-radius:8px; }
.alist .ad { width:10px; height:10px; border-radius:50%; background: rgb(var(--ac)); box-shadow: 0 0 6px rgba(var(--ac), .7); flex:none; }
.alist .nm { flex:1; display:flex; flex-direction:column; } .alist .nm small { color: var(--secondary-text-color); }
.alist .mini { border:1px solid var(--divider-color); background:transparent; color:inherit; border-radius:8px; padding:4px 8px; cursor:pointer; font:inherit; font-size:12px; }
canvas.heat { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; }
.heatleg { display:flex; align-items:center; gap:16px; padding: 8px 12px 2px; font-size:12px; color: var(--secondary-text-color); }
.cleanleg .cl { display:flex; align-items:center; gap:5px; white-space:nowrap; } .cleanleg .cl i { width:12px; height:12px; border-radius:3px; display:inline-block; }
.heatleg .ht { text-transform:uppercase; letter-spacing:1.2px; font-weight:600; color: var(--primary-text-color); white-space:nowrap; }
.heatleg .hb { flex:1; min-width:120px; }
.heatleg .bar { height:10px; border-radius:6px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
.heatleg .tk { display:flex; justify-content:space-between; margin-top:3px; font-variant-numeric: tabular-nums; }
.heatleg .est { font-style:italic; white-space:nowrap; }
.heatleg .hop { display:flex; align-items:center; gap:4px; flex:none; }
.heatleg .hop ha-icon { --mdc-icon-size:18px; }
.heatleg .hop input { width:90px; accent-color: var(--dfc-accent); }
.lcorner { position:absolute; z-index:5; }
.lcorner.top-right { top:8px; right:8px; } .lcorner.top-left { top:8px; left:8px; }
.lcorner.bottom-right { bottom:8px; right:8px; } .lcorner.bottom-left { bottom:8px; left:8px; }
.lcorner button.layers { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; border:1px solid var(--dfc-chipborder, rgba(0,0,0,.12)); background: var(--dfc-chipbg, rgba(255,255,255,.85)); color: var(--dfc-chipfg, var(--primary-text-color)); box-shadow:0 2px 8px rgba(0,0,0,.18); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.lcorner button.layers ha-icon { --mdc-icon-size:20px; }
.lcorner button.layers.on { color: var(--dfc-accent); border-color: var(--dfc-accent); }
.lmenu { position:absolute; left:0; top:0; z-index:6; min-width: 230px; box-sizing:border-box; overflow-y:auto; overscroll-behavior:contain; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.35); padding: 10px 6px; font-size:14px; }
.lmenu h4 { margin: 2px 10px 6px; font-size:13px; font-weight:500; color: var(--secondary-text-color); }
.lmenu button { display:flex; align-items:center; gap:10px; width:100%; border:0; background:transparent; color:inherit; font: inherit; padding: 7px 10px; border-radius: 8px; cursor:pointer; text-align:left; --mdc-icon-size: 20px; }
.lmenu button:hover { background: var(--secondary-background-color); }
.lmenu button.dis { opacity:.45; cursor:default; }
.lmenu button.dis:hover { background:transparent; }
.lmenu button ha-icon.eye { color: var(--secondary-text-color); }
.lmenu button.on ha-icon.eye { color: var(--dfc-accent); }
.lmenu .sl { padding: 6px 10px 2px; display:flex; flex-direction:column; gap:4px; font-size:13px; }
.lmenu .sl div { display:flex; justify-content:space-between; }
.lmenu input[type=range] { width:100%; accent-color: var(--dfc-accent); }
.lmenu hr { border:0; border-top:1px solid var(--divider-color); margin: 6px 4px; }
.main:has(.lcorner.top-left) > .admin { left:auto; right:12px; }
.admin { position:absolute; left:12px; top:12px; z-index:4; max-width: calc(100% - 140px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:0; border-radius:14px; padding: 5px 10px; font: inherit; font-size:12px; cursor:pointer; background: var(--dfc-accent); color: var(--text-primary-color, #fff); box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.msg { padding: 24px 16px; color: var(--secondary-text-color); font-size: 14px; text-align:center; }
.empty { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); font-size:13px; color: var(--secondary-text-color); background: var(--card-background-color); padding: 8px 12px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.2); pointer-events:none; max-width: 80%; text-align:center; z-index:2; }
.pop.ip { background: transparent; padding:0; display:block; }
.pop.ip.prev { pointer-events:none; }
.pop.ip.prev .icard { pointer-events:auto; border-style:dashed; }
.icard { position:absolute; left:-999px; top:-999px; width: min(300px, calc(100% - 12px)); max-height: calc(100% - 12px); overflow:auto; background: rgba(28,30,36,.95); color:#f1f3f6; border:1px solid rgba(255,255,255,.12); border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.4); padding:12px 14px; display:flex; flex-direction:column; gap:8px; font-size:13px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); opacity:0; transition: opacity .12s; }
.icard.placed { opacity:1; }
.icard .ih { display:flex; align-items:center; gap:8px; }
.icard .ih b { font-size:15px; font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.icard .ih button { border:0; background:transparent; color:#aab1bc; font-size:22px; line-height:1; cursor:pointer; padding:2px 4px; min-width:36px; min-height:36px; }
.icard .ist { display:flex; align-items:center; gap:8px; font-size:14px; }
.icard .ist i { width:10px; height:10px; border-radius:50%; flex:none; box-shadow:0 0 6px currentColor; }
.icard .irows { display:flex; flex-direction:column; border-top:1px solid rgba(255,255,255,.08); }
.icard .irow { display:flex; justify-content:space-between; gap:10px; border:0; background:transparent; color:inherit; font:inherit; padding:7px 0; min-height:36px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,.06); text-align:left; }
.icard .irow span { color:#aab1bc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.icard .irow b { font-weight:500; white-space:nowrap; }
.icard .ibtns { display:flex; flex-wrap:wrap; gap:8px; }
.icard .ibig, .icard .ipress { border:0; border-radius:12px; padding:10px 14px; min-height:44px; font:inherit; font-weight:600; cursor:pointer; background: var(--dfc-accent); color: var(--text-primary-color, #fff); flex:1; }
.icard .ipress { background: rgba(255,255,255,.1); color:#f1f3f6; font-weight:500; }
.icard .ipress.done { opacity:.6; }
.icard .iacts { display:flex; justify-content:flex-end; margin-top:-4px; }
.icard .irow:last-child { border-bottom:0; }
.icard .iopen { border:0; background:transparent; color: var(--dfc-accent); font:inherit; font-weight:600; cursor:pointer; padding:6px 4px; min-height:36px; }
.applbl.att { border-color: rgba(251,140,0,.85); box-shadow: 0 0 0 0 rgba(251,140,0,.5), 0 2px 8px rgba(0,0,0,.2); animation: dfatt 2.4s ease-in-out infinite; }
@keyframes dfatt { 0%,100% { box-shadow: 0 0 0 0 rgba(251,140,0,0), 0 2px 8px rgba(0,0,0,.2); } 50% { box-shadow: 0 0 0 4px rgba(251,140,0,.22), 0 0 14px rgba(251,140,0,.35); } }
.applbl::after, .m::before, .chip::before { content:''; position:absolute; inset:-8px; border-radius:inherit; }
.m.ghost, .chip.ghost { opacity:.5; }
.m.ghost .ic, .chip.ghost { outline: 1.5px dashed var(--secondary-text-color, #888); outline-offset: 2px; }
.m.sel .ic, .chip.sel { outline: 2px solid var(--dfc-accent); outline-offset: 3px; animation: dfsel 1.6s ease-in-out infinite; }
@keyframes dfsel { 50% { outline-offset: 6px; outline-color: transparent; } }
.tip .tst { opacity:.85; }
.names-always .tip .tst { display:none; }
@media (hover: hover) { .names-always .m:hover .tip .tst, .names-always .chip:hover .tip .tst { display:inline; } }
.xtip, .ftoast { position:absolute; z-index:20; transform: translate(-50%, -100%); white-space:nowrap; font-size:13px; padding:6px 10px; border-radius:8px; background: rgba(28,28,28,.94); color:#fff; pointer-events:none; opacity:0; transition: opacity .12s; }
.xtip.show, .ftoast.show { opacity:1; }
.ftoast { left:50%; top:auto; bottom:12px; transform: translateX(-50%); white-space:normal; text-align:center; max-width:90%; }
@media (prefers-reduced-motion: reduce) { .applbl.att, .m.sel .ic, .chip.sel { animation:none; } }
.pop { position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,.35); padding: 16px; }
.popin { width: min(380px, 100%); max-height: 100%; overflow:auto; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,.35); padding: 16px 18px; display:flex; flex-direction:column; gap: 14px; }
.popin h3 { margin:0; font-size:16px; font-weight:500; display:flex; align-items:center; gap:8px; }
.popin h3 button { margin-left:auto; border:0; background:transparent; color: var(--secondary-text-color); font-size:22px; cursor:pointer; line-height:1; padding:2px 6px; }
.popin .acts { display:flex; justify-content:flex-end; gap:8px; }
.popin .acts button { border:0; border-radius: 16px; padding: 7px 14px; font: inherit; font-size:13px; cursor:pointer; background: var(--secondary-background-color); color: var(--primary-text-color); }
.popin .acts button.pri { background: var(--dfc-accent); color: var(--text-primary-color, #fff); }
.rd { display:flex; flex-direction:column; gap:4px; }
.rd + .rd { border-top: 1px solid var(--divider-color); padding-top: 12px; }
.rd .top { display:flex; align-items:baseline; gap:8px; --mdc-icon-size: 18px; color: var(--secondary-text-color); font-size:13px; }
.rd .big { font-size: 28px; font-weight: 500; color: var(--primary-text-color); margin-left:auto; }
.rd svg { width:100%; height:56px; display:block; color: var(--secondary-text-color); }
.rd .mm { display:flex; justify-content:space-between; font-size:11px; color: var(--secondary-text-color); }
.rd button.more, .popin button.more { align-self:flex-start; border:0; background:transparent; color: var(--dfc-accent); font: inherit; font-size:12px; cursor:pointer; padding:0; }
.kv { display:grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size:14px; }
.kv span:nth-child(odd) { color: var(--secondary-text-color); }
.kv span:nth-child(even) { text-align:right; }
.list button { display:flex; justify-content:space-between; gap:12px; width:100%; border:0; background:transparent; color:inherit; font: inherit; font-size:14px; padding: 10px 4px; border-bottom: 1px solid var(--divider-color); cursor:pointer; text-align:left; }
.list button small { color: var(--secondary-text-color); }

/* 0.8.1: a device on another floor, linked to one here */
.gdev { position:absolute; z-index:2; transform: translate(-50%,-50%); width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,.55); border: 1.5px dashed rgba(60,60,60,.55); color: rgba(40,40,40,.6); --mdc-icon-size:16px; opacity:.75; }
/* 0.8.1: floor button under the Layers button, on the plan */
.wrap { gap: 8px; }
.lcorner { display:flex; flex-direction:column; align-items:center; gap:8px; }
.lcorner.bottom-right, .lcorner.bottom-left { flex-direction:column-reverse; }
.fbtn { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; border:1px solid var(--dfc-chipborder, rgba(0,0,0,.12)); background: var(--dfc-chipbg, rgba(255,255,255,.85)); color: var(--dfc-chipfg, var(--primary-text-color)); box-shadow:0 2px 8px rgba(0,0,0,.18); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); font: inherit; position:relative; --mdc-icon-size:20px; }
.fbtn .badge { position:absolute; right:-5px; bottom:-5px; min-width:18px; height:18px; padding:0 4px; box-sizing:border-box; border-radius:4px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #000); border: 1px solid var(--divider-color, rgba(0,0,0,.2)); box-shadow:0 1px 3px rgba(0,0,0,.2); font-size:11px; font-weight:700; line-height:16px; text-align:center; }
.fcorner { position:absolute; right:12px; bottom:12px; z-index:5; }
.lgroup { display:flex; align-items:center; gap:8px; flex:none; }
.lgroup.rev { flex-direction:row-reverse; }
.dock-left .lslot .lgroup, .dock-right .lslot .lgroup { flex-direction:column; }
.fwrap { position:relative; width:36px; height:36px; flex:none; display:block; }
.fwrap .rail { position:absolute; left:0; top:0; z-index:7; }
.fwrap.up .rail { top:auto; bottom:0; }
.rail { flex: none; width:36px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; gap:4px; padding: 3px 0; border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); box-shadow:0 2px 10px rgba(0,0,0,.2); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); position:relative; }
.rail button { width:30px; height:30px; border-radius:50%; border:1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; --mdc-icon-size: 18px; padding:0; position:relative; }
.rail button.arrow { border:0; background:transparent; width:28px; height:18px; color: var(--secondary-text-color); }
.rail button.arrow:disabled { opacity:.3; cursor:default; }
.rail .sides { display:flex; width:100%; justify-content:center; border-top:1px solid var(--divider-color); padding-top:3px; }
.rail .sides button.arrow { width:16px; height:22px; }
.rail button.fl.on { background: var(--dfc-accent); border-color: var(--dfc-accent); color: #fff; }
.rail .pill { position:absolute; right: calc(100% + 8px); top:50%; transform: translateY(-50%); white-space:nowrap; font-size:12px; font-weight:500; padding: 4px 10px; border-radius: 12px; background: rgba(28,28,28,.88); color:#fff; pointer-events:none; opacity:0; transition: opacity .2s; }
.lcorner.top-left .rail .pill, .lcorner.bottom-left .rail .pill { right:auto; left: calc(100% + 8px); }
.rail button.fl:hover .pill { opacity:1; }
/* climate chip v2 */
.chip.cl2 { flex-direction:row; align-items:center; gap: 7px; padding: 5px 9px 5px 7px; border: 2px solid var(--dfc-c); text-align:left; }
.chip.cl2 > ha-icon { --mdc-icon-size: calc(var(--dfc-chipsize, 34px) * .56); color: var(--dfc-c); flex:none; }
.chip.cl2 .mc { display:flex; flex-direction:column; line-height:1.15; }
.chip.cl2 .mw { font-size: calc(var(--dfc-chipsize, 34px) * .36); font-weight:500; white-space:nowrap; }
.chip.cl2 .st { font-size: calc(var(--dfc-chipsize, 34px) * .31); opacity:.75; white-space:nowrap; }
.chip.cl2 .vs { width:1px; align-self:stretch; background: currentColor; opacity:.25; margin: 1px 1px; }
.chip.cl2 .tc { display:flex; flex-direction:column; align-items:flex-end; line-height:1.15; }
.chip.cl2 .t { font-size: calc(var(--dfc-chipsize, 34px) * .44); font-weight:500; white-space:nowrap; }
.chip.cl2 .h { font-size: calc(var(--dfc-chipsize, 34px) * .31); opacity:.8; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-chipsize, 34px) * .32); }
.chip.cl2.off { opacity:.62; }
.chip.rd { padding: 5px 9px; }
.chip.rd .tc, .chip.cl2 .tc { display:flex; flex-direction:column; align-items:flex-end; line-height:1.15; }
.chip.rd .tc { align-items:center; }
.chip.rd .t { font-size: calc(var(--dfc-chipsize, 34px) * .44); font-weight:500; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-chipsize, 34px) * .38); }
.chip.rd .h { font-size: calc(var(--dfc-chipsize, 34px) * .31); opacity:.8; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-chipsize, 34px) * .32); }
.narrow .chip.cl2 .mw { display:none; }
/* highlight from a popup list */
.m.hl .ic, .chip.hl { animation: dfchl 1.1s ease-in-out 3; }
@keyframes dfchl { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--dfc-accent) 55%, transparent); } }
svg.lines line.hl { stroke-width: 4 !important; opacity: 1 !important; }
/* legend chips toggle roles (#64) */
.legend button.lg { display:flex; align-items:center; gap:4px; border:0; background:transparent; color:inherit; font: inherit; font-size:11px; padding: 1px 2px; border-radius: 8px; cursor:pointer; }
.legend button.lg.off { opacity:.4; text-decoration: line-through; }
.legend .upd { display:flex; align-items:center; gap:4px; }
.legend button.rf { border:1px solid var(--divider-color); background: var(--card-background-color,#fff); color: var(--primary-text-color); border-radius: 10px; padding: 1px 7px; font: inherit; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:4px; --mdc-icon-size: 15px; }
.legend button.rf.busy ha-icon { animation: dfcspin 1s linear infinite; }
@keyframes dfcspin { to { transform: rotate(360deg); } }
.lmenu button.chk ha-icon.eye { color: var(--secondary-text-color); }
.lmenu button.chk.on ha-icon.eye { color: var(--dfc-accent); }
/* cover controls popup (#77) */
.cov { display:flex; align-items:center; gap:8px; padding: 8px 2px; border-bottom: 1px solid var(--divider-color); font-size:14px; }
.cov .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cov .nm small { display:block; color: var(--secondary-text-color); font-size:12px; }
.cov button, .covall button { width:34px; height:34px; border-radius:50%; border:1px solid var(--divider-color); background: var(--card-background-color,#fff); color: var(--primary-text-color); cursor:pointer; display:flex; align-items:center; justify-content:center; --mdc-icon-size: 20px; padding:0; }
.cov input[type=range] { width: 90px; accent-color: var(--dfc-accent); }
.covall { display:flex; align-items:center; gap:8px; justify-content:flex-end; font-size:13px; color: var(--secondary-text-color); }
.conn-list button { display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%; border:0; background:transparent; color:inherit; font: inherit; font-size:14px; padding: 8px 4px; border-bottom: 1px solid var(--divider-color); cursor:pointer; text-align:left; }
.conn-list button small { color: var(--secondary-text-color); font-size:12px; }
.popin h4 { margin: 4px 0 0; font-size: 13px; font-weight:500; color: var(--secondary-text-color); }
`;

let _urlClean = null;

class DeviceFloorplanCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("device-floorplan-card-editor");
  }

  static getStubConfig(hass) {
    const first = planSensors(hass)[0];
    return { plan: first ? first.attributes.plan_id : "" };
  }

  setConfig(config) {
    if (!config || !(config.plan || (Array.isArray(config.plans) && config.plans.length))) throw new Error(dfT("card.choose_plan"));
    this._raw = config; // as stored in the dashboard (to find and save this card, #97)
    const c = { ...config };
    // 0.11: the Electricity overlay of the test builds is called Energy.
    if (Array.isArray(c.overlays)) c.overlays = c.overlays.map((o) => (o === "electricity" ? "energy" : o));
    if (c.electricity && !c.energy) c.energy = c.electricity;
    // Older configs (0.4.x card, card v0.0x): keep them working.
    if (!c.default_overlay && c.default_view) c.default_overlay = "live";
    // 0.7.4: the Plan overlay is gone; room names are a layer in every overlay. Old configs go to Live.
    if (c.default_overlay === "plan") c.default_overlay = "live";
    // 0.8.2: the People overlay is gone; people show in Live (and the overlays chosen under People).
    if (c.default_overlay === "people") c.default_overlay = "live";
    if (Array.isArray(c.overlays)) c.overlays = c.overlays.filter((o) => o !== "people");
    this._config = c;
    const dock = this._overlays();
    if (this.preview && EDIT_OV && dock.includes(EDIT_OV)) this._overlay = EDIT_OV;
    if (!this._overlay || !dock.includes(this._overlay)) this._overlay = this._defaultOverlay();
    const net = this._ov("network");
    const saved = lsGet(`dfc_net_${this._lsKey()}`) || {};
    const keep = (k, d) => (typeof saved[k] === "boolean" ? saved[k] : d);
    this._net = {
      conns: Array.isArray(saved.conns) ? saved.conns : null, // null = the card's default
      roles: Array.isArray(saved.roles) ? saved.roles : [], // hidden roles
      links: keep("links", net.links !== false),
      hubs: keep("hubs", net.hub_links !== false),
      wlinks: keep("wlinks", net.wifi_links !== false),
      minLqi: Number(net.min_lqi || 0), // the card's setting; viewers switch LQI ranges in the legend (0.8.1)
      lqiOff: Array.isArray(saved.lqiOff) ? saved.lqiOff : [],
      legend: keep("legend", net.legend !== false),
    };
    // 0.7.4: layers chosen by the viewer (per overlay), kept in this browser.
    this._lay = lsGet(`dfc_layers_${this._lsKey()}`) || {};
    // Floors (#75): which plan is shown.
    const ids = this._planIds();
    if (!this._floor || !ids.includes(this._floor)) {
      const rem = c.remember_floor !== false ? lsGet(`dfc_floor_${this._lsKey()}`) : null;
      this._floor = ids.includes(rem) ? rem : ids.includes(c.default_floor) ? c.default_floor : ids[0];
    }
    this._key = null;
    this._popup = null;
    this._menu = false;
    if (this._hass) {
      this._subscribe();
      this._update(true);
    }
  }

  set hass(hass) {
    dfLangOf(hass); // 0.14 L1: texts in this user's language
    if (hass && hass.entities) dfcReg = hass.entities;
    const first = !this._hass;
    this._live = hass;
    // 0.11.1 Home Replay: while replaying, the card sees Home Assistant as it was at the replay time.
    this._hass = this._rpT() != null ? this._rpHass() : hass;
    if (first) this._subscribe();
    this._update();
  }

  /** HA sets this while the dashboard is in edit mode (#97: ✎ Edit markers on the card). */
  set editMode(v) {
    const was = !!this._editMode;
    this._editMode = !!v;
    if (was !== this._editMode && this._hass) this._update(true);
  }

  get editMode() {
    return !!this._editMode;
  }

  /** Walk up through slots and shadow roots. */
  _up(test) {
    let el = this;
    while (el) {
      if (test(el)) return el;
      el = el.assignedSlot || el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    }
    return null;
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", rows: 8, min_columns: 6, min_rows: 4 };
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      const root = this.shadowRoot;
      root.addEventListener("click", (e) => this._onClick(e));
      root.addEventListener("input", (e) => this._onInput(e));
      root.addEventListener("contextmenu", (e) => {
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh],[data-touch]");
        if (!t) return;
        e.preventDefault();
        if (this._held || this._xOn) return; // a touch long press already did it
        this._holdEl(t);
      });
      // 0.7.5: tap = info card, hold = the marker's action. On touch screens hold, then slide = explore:
      // the name and state of whatever is under the finger, like a mouse hover; lifting does nothing.
      // 0.11.1: the camera strip shows a frame's line while the pointer is on it.
      root.addEventListener("pointerover", (e) => {
        const w = e.target.closest && e.target.closest(".cwin");
        const k = w ? w.dataset.wk : null;
        if (k === (this._winHover || null)) return;
        this._winHover = k;
        for (const pth of root.querySelectorAll("path.sl")) pth.classList.toggle("on", pth.dataset.wl === k || pth.classList.contains("ev"));
      });
      // 0.11.1: camera windows move by dragging (before the hold / explore handler below).
      root.addEventListener("pointerdown", (e) => {
        const win = e.target.closest && e.target.closest(".cwin.dr");
        if (!win || e.button > 0 || e.target.closest("[data-camx]")) return;
        e.stopImmediatePropagation();
        this._winDragStart(e, win);
      });
      // 0.11.1 Home Replay: its buttons act on finger down.
      root.addEventListener("pointerdown", (e) => {
        const c = e.target.closest && e.target.closest("[data-rpgo],[data-rpov],[data-rp]");
        if (!c || e.button > 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this._rpCtl(c);
      });
      // test10 Energy: tap or drag over the last 24 hours; every column (Last 24 h, the hours, Now) is one step.
      root.addEventListener("pointerdown", (e) => {
        const tr = e.target.closest && e.target.closest(".etrack");
        if (!tr) return;
        const cols = [...tr.children].map((c) => [c.getBoundingClientRect().right, c.dataset.at]);
        const pick = (x) => {
          const c = cols.find(([r]) => x < r + 1) || cols[cols.length - 1];
          const at = c[1] === "day" || c[1] === "now" ? c[1] : Number(c[1]);
          if (at === this._eSel()) return;
          this._eAt = at;
          this._update(true);
        };
        pick(e.clientX);
        const mv = (ev) => pick(ev.clientX);
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
      // 0.11.1 Home Replay: drag along the 24 hours (the plan follows; the end is Live).
      root.addEventListener("pointerdown", (e) => {
        const tr = e.target.closest && e.target.closest(".rptrack");
        if (!tr) return;
        e.preventDefault();
        this._rpStop();
        this._rp.drag = true;
        // Measured once: every step redraws the card (the grabbed line is replaced, a removed one measures 0).
        const r = tr.getBoundingClientRect();
        const vert = tr.classList.contains("v"); // a side rail: Now at the top
        // test9: a slow drag moves minute by minute; a fast one glues to the step of the chosen speed (one second
        // of play: 3600× = whole hours, 900× = quarters). The thumb stays under the finger; the time snaps.
        let lp = null;
        let lt = 0;
        let vel = 0;
        const off = new Date().getTimezoneOffset() * 60000;
        const pick = (x, y) => {
          const f = Math.max(0, Math.min(1, vert ? (r.bottom - y) / r.height : (x - r.left) / r.width));
          const p = vert ? y : x;
          const tn = performance.now();
          if (lp != null && tn > lt) vel = vel * 0.6 + (Math.abs(p - lp) / (tn - lt)) * 400; // px / s, smoothed
          lp = p;
          lt = tn;
          const step = vel > 140 ? Math.max(60000, this._rp.speed * 1000) : 60000;
          const raw = Date.now() - this._rpSpan() * (1 - f);
          this._rp.dragPct = f * 100;
          this._rpSeek(f >= 0.995 ? Date.now() : Math.round((raw - off) / step) * step + off);
        };
        this._rpLoad().then(() => this._rp.t != null && this._rpSeek(this._rp.t));
        pick(e.clientX, e.clientY);
        const mv = (ev) => pick(ev.clientX, ev.clientY);
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          this._rp.drag = false;
          this._rp.dragPct = null;
          this._update(true);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
      root.addEventListener("pointerdown", (e) => {
        clearTimeout(this._holdT);
        clearTimeout(this._armT);
        this._held = false;
        this._xArm = false;
        this._xOn = false;
        if (e.button > 0) return;
        const inBox = e.target.closest && e.target.closest(".box");
        this._pd = { x: e.clientX, y: e.clientY };
        if (inBox && e.pointerType !== "mouse") this._armT = setTimeout(() => (this._xArm = true), 300);
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh],[data-touch]");
        if (!t) return;
        // A long press counts when the finger is lifted without having moved (moving = explore).
        this._pd.t = t;
        this._holdT = setTimeout(() => (this._pd && (this._pd.long = true)), 550);
      });
      root.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse" && !this._pd) return this._hoverSoon(e.clientX, e.clientY);
        if (!this._pd || Math.hypot(e.clientX - this._pd.x, e.clientY - this._pd.y) < 10) return;
        clearTimeout(this._holdT);
        this._pd.long = false;
        this._pd.moved = true;
        if (this._xArm) {
          this._xOn = true;
          this._explore(e.clientX, e.clientY);
        } else clearTimeout(this._armT);
      });
      this.addEventListener("mouseleave", () => this._hideTip());
      root.addEventListener("touchmove", (e) => {
        if (this._xArm && e.cancelable) e.preventDefault(); // exploring, not scrolling the dashboard
      }, { passive: false });
      for (const ev of ["pointerup", "pointercancel"]) root.addEventListener(ev, () => {
        clearTimeout(this._holdT);
        clearTimeout(this._armT);
        const pd = this._pd;
        if (this._xOn) {
          this._held = true; // no tap after exploring
          this._exploreEnd();
        } else if (ev === "pointerup" && pd && pd.long && pd.t && !pd.moved) {
          this._held = true; // the click that follows is not a tap
          this._holdEl(pd.t);
        }
        this._pd = null;
        this._xArm = false;
        this._xOn = false;
      });
      root.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && (this._popup || this._menu)) {
          this._popup = null;
          this._menu = false;
          this._update(true);
        }
      });
    }
    this._onExternal = this._onExternal || ((e) => this._external(e.detail || {}));
    this._onLocation = this._onLocation || (() => this._fromUrl());
    window.addEventListener("device-floorplan-action", this._onExternal);
    this._onTip = this._onTip || (() => this._update(true));
    window.addEventListener("dfc-tip", this._onTip);
    window.addEventListener("location-changed", this._onLocation);
    window.addEventListener("popstate", this._onLocation);
    this._onVisible = this._onVisible || (() => {
      if (!document.hidden && this._dirty) this._update(true);
    });
    document.addEventListener("visibilitychange", this._onVisible);
    if (!this._ro && typeof ResizeObserver !== "undefined") this._ro = new ResizeObserver(() => this._layoutSoon());
    // 0.13.2 (#22): the screen's free height changes on resize / turning the phone.
    this._onWinResize = this._onWinResize || (() => this._layoutSoon());
    window.addEventListener("resize", this._onWinResize);
    this._connected = true;
    // The night look follows the sun / the clock: check every two minutes (renders only on change).
    clearInterval(this._nightT);
    this._nightT = setInterval(() => this._update(), 120000);
    this._subscribe();
    this._fromUrl();
    this._update(true);
  }

  disconnectedCallback() {
    this._connected = false;
    if (this._onWinResize) window.removeEventListener("resize", this._onWinResize);
    clearInterval(this._nightT);
    this._netTimer(false); // 0.11: no Network polling after the card is gone
    clearTimeout(this._trigT);
    if (this._rp) this._rpStop();
    if (this._rpPop) this._rpPop();
    window.removeEventListener("device-floorplan-action", this._onExternal);
    if (this._onTip) window.removeEventListener("dfc-tip", this._onTip);
    window.removeEventListener("location-changed", this._onLocation);
    window.removeEventListener("popstate", this._onLocation);
    document.removeEventListener("visibilitychange", this._onVisible);
    if (this._ro) this._ro.disconnect();
    this._unsubscribe();
  }

  // ------------------------------------------------------------- external control (#47)
  /** device_floorplan.show_overlay → every screen showing a card with that card_id. */
  _subscribe() {
    const id = this._config && this._config.card_id;
    if (!this._connected || !this._hass || !this._hass.connection || !id) return this._unsubscribe();
    if (this._subFor === id) return;
    this._unsubscribe();
    this._subFor = id;
    this._unsub = this._hass.connection
      .subscribeMessage((ev) => this._external(ev || {}), { type: "device_floorplan/overlay/subscribe" })
      .catch(() => null);
  }

  _unsubscribe() {
    if (this._unsub) this._unsub.then((u) => u && u()).catch(() => {});
    this._unsub = null;
    this._subFor = null;
  }

  /** ?overlay=comfort[&card=hall] in the dashboard link switches this screen, on every navigation (#71). */
  _fromUrl() {
    if (!this._config) return;
    const q = new URLSearchParams(window.location.search);
    const o = q.get("overlay");
    const fl = q.get("floor");
    if (!o && !fl) return;
    const card = q.get("card");
    if (card && card !== this._config.card_id) return;
    this._external({ card_id: this._config.card_id, overlay: o, floor: fl });
    // Clean the address afterwards (after every card on the view had its turn), so the same link
    // applies again next time.
    clearTimeout(_urlClean);
    _urlClean = setTimeout(() => {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("overlay") && !u.searchParams.has("floor")) return;
      u.searchParams.delete("overlay");
      u.searchParams.delete("floor");
      u.searchParams.delete("card");
      window.history.replaceState(window.history.state, "", u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash);
    }, 50);
  }

  _external(d) {
    if (!this._config || !d) return;
    if (d.card_id !== undefined && d.card_id !== null && d.card_id !== this._config.card_id) return;
    if (d.floor) this._setFloor(this._findFloor(d.floor), false);
    const o = d.action === "reset" ? "reset" : d.overlay || d.view || d.preset;
    if (!o) return;
    if (o === "reset") return this._setOverlay(this._defaultOverlay());
    this._setOverlay(o === "live_home" ? "live" : o);
  }

  // ------------------------------------------------------------- floors (#75)
  _lsKey() {
    const c = this._config || {};
    return c.card_id || this._planIds().join(",");
  }

  _planIds() {
    const c = this._config || {};
    const list = Array.isArray(c.plans) && c.plans.length ? c.plans : [c.plan];
    return [...new Set(list.filter(Boolean))];
  }

  /** Floors of this card that exist, in the card's order: {id, sensor, level, name, label}. */
  _floors() {
    const all = planSensors(this._hass);
    return this._planIds().map((id) => {
      const s = all.find((x) => x.attributes.plan_id === id);
      if (!s) return null;
      const lv = s.attributes.level;
      return { id, sensor: s, level: lv, name: s.attributes.plan_name || id, label: floorLabel(lv, s.attributes.plan_name), floor_id: s.attributes.floor_id };
    }).filter(Boolean);
  }

  /** A floor by plan id, HA floor id, label ("G", "1") or name. */
  _findFloor(q) {
    const f = this._floors();
    const v = String(q).toLowerCase();
    const hit = f.find((x) => x.id === q) || f.find((x) => (x.floor_id || "") === q) || f.find((x) => x.label.toLowerCase() === v || (v === "g" && x.level === 0)) || f.find((x) => x.name.toLowerCase() === v);
    return hit ? hit.id : null;
  }

  _setFloor(id, render = true) {
    if (!id || id === this._floor || !this._planIds().includes(id)) return;
    this._floor = id;
    this._popup = null;
    this._menu = false;
    this._pillUntil = Date.now() + 2500;
    if (this._config.remember_floor !== false) lsSet(`dfc_floor_${this._lsKey()}`, id);
    if (render) this._update(true);
    else this._key = null;
    // test11: Replay holds the history of what is on screen: the new floor's loads at once (time and play stay).
    if (this._rpIn()) setTimeout(() => this._rpLoad(), 0);
  }

  /** Floors stacked like a building: highest on top. */
  _floorStack() {
    return this._floors().slice().sort((a, b) => (Number.isFinite(b.level) ? b.level : -99) - (Number.isFinite(a.level) ? a.level : -99));
  }

  /** 0.12.1: the building as levels, highest on top. Plans with the same level number are one level with
   *  several plans side by side (house + garden, east + west), in the card's order; a plan without a level
   *  (a view) is a level of its own, as before. */
  _levels() {
    const out = [];
    for (const f of this._floorStack()) {
      const g = Number.isFinite(f.level) ? out.find((x) => x.level === f.level) : null;
      if (g) g.plans.push(f);
      else out.push({ level: Number.isFinite(f.level) ? f.level : null, plans: [f] });
    }
    return out;
  }

  /** Where the shown plan is: [levels, index of its level, index of the plan in that level]. */
  _levelAt() {
    const lv = this._levels();
    const li = Math.max(0, lv.findIndex((g) => g.plans.some((f) => f.id === this._floor)));
    const si = lv[li] ? Math.max(0, lv[li].plans.findIndex((f) => f.id === this._floor)) : 0;
    return [lv, li, si];
  }

  /** Up / down a level. The side is kept when the other level has it, else its first plan. */
  _stepFloor(dir) {
    const [lv, li, si] = this._levelAt();
    const n = lv[li - dir]; // dir +1 = up = earlier in the stack
    if (n) this._setFloor((n.plans[si] || n.plans[0]).id);
  }

  /** Left / right to the next plan of the same level. dir +1 = right. */
  _stepSide(dir) {
    const [lv, li, si] = this._levelAt();
    const n = lv[li] && lv[li].plans[si + dir];
    if (n) this._setFloor(n.id);
  }

  // ------------------------------------------------------------- settings
  _custom() {
    return (Array.isArray(this._config.custom_overlays) ? this._config.custom_overlays : []).filter((o) => o && o.id && !OVERLAYS[o.id]);
  }

  _ovDef(o) {
    if (OVERLAYS[o]) return OVERLAYS[o];
    const c = this._custom().find((x) => x.id === o);
    return c ? { label: c.name || dfT("ov.custom"), icon: c.icon || "mdi:layers-outline", custom: c } : null;
  }

  _overlays() {
    // 0.10: Cleaning joins the default list once a robot is set up on this plan (or when chosen in the card editor).
    const robots = Object.keys((this._a && this._a.robots) || {}).length ? ["cleaning"] : [];
    // 0.11: Electricity joins the default list once a device on this plan has a power sensor.
    const st = (this._hass && this._hass.states) || {};
    const power = (this._eData && this._eData.devs.length) || Object.values((this._a && this._a.devices) || {}).some((d) => (d.entities || []).some((e) => isPower(st[e]))) ? ["energy"] : [];
    const list = Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...power, ...robots, ...this._custom().map((c) => c.id)];
    return list.filter((o) => o !== "plan" && this._ovDef(o));
  }

  /** 0.7.4: a layer of an overlay, as the viewer left it (else the card's default). */
  _layerOn(ov, name, dflt) {
    const l = this._lay[ov] || {};
    const v = l[name];
    // 0.11: a screen's choice counts only while the card's own setting is still the one it changed.
    if (typeof l[`${name}@d`] === "boolean" && l[`${name}@d`] !== dflt) return dflt;
    if (ov === "energy" && typeof l[`${name}@d`] !== "boolean") return dflt; // choices from the 0.11 test builds
    return typeof v === "boolean" ? v : dflt;
  }

  /** Default of a layer other than room names: as set in the card editor (Comfort: heatmap, readings, air flow). */
  _layerDefault(ov, name) {
    if (ov === "comfort") return this._ov("comfort")[{ heat: "heatmap", labels: "readings", air: "airflow", clim: "climate_shown" }[name] || name] !== false;
    if (ov === "security" && name === "all") return this._ov("security").show_quiet === true;
    if (ov === "energy") return { fill: true, flow: this._ov("energy").flow !== false }[name] ?? true;
    if ((ov === "live" || ov === "security") && name === "cams") return false;
    if (name === "replay") return false; // 0.11.1 Home Replay (cards without a rail): off until a viewer turns it on
    if (ov === "network" && name === "pall") return false; // 0.13.9.4: only the nearest proxy's ring by default
    return true;
  }

  _setLayer(ov, name, on, dflt) {
    this._lay = { ...this._lay, [ov]: { ...(this._lay[ov] || {}), [name]: on, ...(typeof dflt === "boolean" ? { [`${name}@d`]: dflt } : {}) } };
    lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
  }

  /** Room names: shown by default in the overlays chosen in the editor (Live, when not set: where Plan was). */
  _roomsDefault(ov) {
    const si = (this._config.rooms || {}).show_in;
    if (!Array.isArray(si)) return ov === "live";
    return si.includes(ov) || (ov === "live" && si.includes("plan"));
  }

  /** Where the Layers button is: a corner of the plan (default top right), the overlay bar, or hidden. */
  /** Where the round buttons (floors · Layers · Replay) sit. test10: beside a side Overlay Bar they are always on
   *  the plan's other side: a corner on the bar's side moves across (saved or not), so the bar keeps its whole
   *  height and left and right are mirrors of each other. evenHidden: the corner even when Layers is hidden. */
  _layersPos(evenHidden = false) {
    const v = this._config.layers_button;
    let pos = ["top-right", "top-left", "bottom-left", "bottom-right", "bar", "hidden"].includes(v) ? v : this._ov("network").layers === false ? "hidden" : "top-right";
    if (pos === "hidden" && evenHidden) pos = "top-right";
    const bp = String((this._config.buttons || {}).position || "");
    const side = /right$/.test(bp) ? "right" : /left$/.test(bp) ? "left" : "";
    if (side && pos.endsWith(`-${side}`)) pos = pos.replace(`-${side}`, side === "right" ? "-left" : "-right");
    return pos;
  }

  /** test10: where the Home Replay button is: "layers" (a round button beside Layers, the default), "bar" (the
   *  Overlay Bar's last button) or "hidden". Without a bar it is beside Layers, so it can't get lost. */
  _rpBtnPos(dockShown) {
    const c = this._config;
    // #101: an overlay whose values are not recorded states (Energy: long-term statistics) has no Replay button.
    if (c.replay === false || c.replay_button === "hidden" || !this._rpOvs().length || RP_SKIP.has(this._overlay)) return "hidden";
    return c.replay_button === "bar" && dockShown ? "bar" : "layers";
  }

  /** The round Replay button. In Replay it turns into the overlay that is replayed (with the list of the others). */
  _rpRoundBtn() {
    const on = !!(this._rp && this._rp.mode);
    return (on && this._rpOvBtn()) || `<button class="layers rpr ${on ? "on" : ""}" data-rpgo="1" title="${on ? dfT("rp.close") : dfT("rp.name")}" aria-label="${dfT("rp.name")}" aria-pressed="${on}"><ha-icon icon="mdi:history"></ha-icon></button>`;
  }

  _defaultOverlay() {
    const dock = this._overlays();
    const d = this._config.default_overlay;
    return dock.includes(d) ? d : dock.includes("live") ? "live" : dock[0];
  }

  _ov(name) {
    return { ...(this._config[name] || {}) };
  }

  // ------------------------------------------------------------- day & night (#74)
  _night() {
    return { ...NIGHT_DEFAULT, ...(this._config.night || {}) };
  }

  /** f: 0 = day … 1 = night; tint: dusk / dawn while the sun is near the horizon. */
  _nightState() {
    const n = this._night();
    const hass = this._hass;
    const sun = hass.states["sun.sun"];
    let mode = n.mode;
    if (mode === "sun" && !(sun && sun.attributes && sun.attributes.elevation != null)) mode = "times";
    let f = 0;
    let tint = null;
    if (mode === "always") f = 1;
    else if (mode === "dark") f = hass.themes && hass.themes.darkMode ? 1 : 0;
    else if (mode === "sun") {
      const e = Number(sun.attributes.elevation);
      // #120: day until sunset, full night 6° below the horizon (civil dusk).
      f = e >= 0 ? 0 : e <= -6 ? 1 : -e / 6;
      // #121: no warm dusk stage unless asked for.
      if (n.warm_dusk && f > 0 && f < 1) tint = sun.attributes.rising ? "dawn" : "dusk";
    } else if (mode === "times") f = timesFactor(n.start, n.end, new Date(this._now()));
    return { f: Math.round(f * 20) / 20, tint, mode };
  }
}
Object.assign(DeviceFloorplanCard.prototype, {

  /** The lights on the plan with their shape source: one per item, or one per lamp of a bond set to "per lamp".
   *  { item, src, chosen, lights, on }. Shared by the light pools and the Christmas lights (0.13.2). */
  _lightSrcs(a) {
    const hass = this._hass;
    const res = [];
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      // #84: lamps get a bulb by default; anything else with a light only when a shape was chosen.
      // test9: "Acts as" (Floorplan Editor) decides when set: a plug Home Assistant shows as a light is no lamp.
      const asK = ["light", "switch", "fan"].includes(item.as) ? item.as : null;
      const lamp = asK ? asK === "light" : item.group === "lights" || ((!item.group || item.standalone) && domainOf(item.main_entity || "") === "light");
      // 0.12.6: a bond can glow once for the whole bond (default) or once per lamp, each at its own place.
      const srcs = item.bond && item.lights === "lamp"
        ? (item.mlights || []).filter((m) => m.ent && domainOf(m.ent) === "light").map((m) => ({ light: m.light, lights: [m.ent] }))
        : [{ light: item.light, lights: null }];
      for (const src of srcs) {
        const chosen = src.light && src.light.type;
        if (!lamp && (!chosen || src.light.type === "none")) continue;
        const pool = item.bond ? item.entities : (item.allEntities || item.entities || []).concat(item.main_entity ? [item.main_entity] : []);
        let lights = src.lights || [...new Set(pool)].filter((e) => e && (domainOf(e) === "light" || (item.as === "light" && e === item.main_entity)));
        // 0.13.2: a light shape on a smart plug (Category: Lights) follows the plug (its main entity).
        if (!lights.length && chosen && chosen !== "none" && item.main_entity && ["switch", "input_boolean"].includes(domainOf(item.main_entity))) lights = [item.main_entity];
        if (!lights.length) continue;
        const on = lights.map((e) => hass.states[e]).filter((s) => s && s.state === "on");
        res.push({ item, src, chosen, lights, on });
      }
    }
    return res;
  },

  /** 0.13.2: Christmas lights (Live, Lights): bulbs lit with their effect while the light or plug is on; when off,
   *  dark bulbs, or nothing when its marker is set to hide when off (Edit markers, "When it is off"). */
  _xmasHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "lights") return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shapes = Object.fromEntries(Object.entries(a.areas || {}).filter(([, v]) => v && v.shape).map(([k, v]) => [k, v.shape]));
    let body = "";
    let xi = 0;
    for (const { item, src, chosen, on } of this._lightSrcs(a)) {
      if (chosen !== "xmas" || this._hidden(item, ov)) continue;
      const lit = on.length > 0;
      // Off: the marker's "When it is off" (else the card's Live setting): hidden = no bulbs, faint / shown = dark bulbs.
      if (!lit && (this._per(item, "live").off || (this._config.live || {}).show_off || "hidden") === "hidden") continue;
      const L = src.light;
      const sh = { ...L, x: Number.isFinite(L.cx) ? L.cx : item.x, y: Number.isFinite(L.cy) ? L.cy : item.y };
      body += xmasSvg(sh, ratio, { on: lit, own: lit ? bulbRgb(on[0].attributes || {}, L.color) : null, still, rooms: xmasRooms(shapes, sh), realW: a.real_width_m, pxw: (this._boxW || 0) / 100, id: `c${xi++}` });
    }
    if (!body) return "";
    return `<svg class="air xmas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><style>${XMAS_CSS}</style>${body}</svg>`;
  },

  /** Lights that are on, as glowing pools from their shape in the Editor (default: a bulb). */
  _pools(a) {
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const out = [];
    for (const { item, src, chosen, lights, on } of this._lightSrcs(a)) {
      {
      if (!on.length) continue;
      const shape = chosen ? { ...defaultShape(src.light.type, a.real_width_m), ...src.light } : defaultShape("bulb", a.real_width_m);
      if (["none", "screen", "drum", "line"].includes(shape.type)) continue;
      // 0.12.6: a light shape can have its own centre (dragged away from the marker), else the marker's place.
      const cx = Number.isFinite(shape.cx) ? shape.cx : item.x;
      const cy = Number.isFinite(shape.cy) ? shape.cy : item.y;
      const bs = on.map((s) => (s.attributes.brightness != null ? Number(s.attributes.brightness) / 255 : 1));
      const b = Math.max(0.2, Math.min(1, bs.reduce((x, y) => x + y, 0) / bs.length)) * (0.6 + (0.4 * on.length) / lights.length);
      // #111: the light stays inside its room's shape.
      const devs = a.devices || {};
      const aid = item.area_id || (item.of && devs[item.of] && devs[item.of].area_id) || (item.members && (devs[item.members[0]] || {}).area_id) || null;
      const areas = a.areas || {};
      const polyArea = (P) => Math.abs(P.reduce((t, p, i) => t + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
      const under = Object.keys(areas).filter((k) => areas[k].shape && inPoly(cx, cy, areas[k].shape)).sort((x, y) => polyArea(areas[x].shape) - polyArea(areas[y].shape))[0] || null;
      // 0.7.4: a split spot (a relay's light placed where it acts) glows in the room it sits in,
      // not in its device's area (an NSPanel in the corridor switching the WC light).
      let start = item.of && !item.area_id && under ? under : aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = under;
      if (!this._groups || this._groups.a !== a) this._groups = { a, by: {} };
      if (start && !(start in this._groups.by)) this._groups.by[start] = shapeGroup(areas, start);
      // 0.13.3: Christmas lights glow as one soft halo around the string (their bulbs are drawn on top, crisp).
      if (shape.type === "xmas") continue; // 0.13.6: Christmas lights draw their halo with their bulbs (animated)
      out.push({ rgb: bulbRgb(on[0].attributes || {}, src.light && src.light.color), b, ell: shapeEllipses(cx, cy, shape, ratio), shapes: start ? this._groups.by[start] : null });
      }
    }
    return out;
  },

  /** 0.7.4: an appliance with a drum or line drawn in the Editor: its type and readings (null = not one). */
  _applOf(item) {
    if (!item || item.phantom || !item.light || !["drum", "line"].includes(item.light.type)) return null;
    return this._applModel(item);
  },

  /** 0.13.9.18: the appliance type set in the Floorplan Editor (the device's or a bond member's), else null. */
  _applKind(item) {
    if (!item) return null;
    const devs = (this._a && this._a.devices) || {};
    if (APPL_KINDS.includes(item.appliance)) return item.appliance;
    const m = (item.members || []).map((x) => (devs[x] || {}).appliance).find((v) => APPL_KINDS.includes(v));
    if (m) return m;
    return APPL_TYPES.includes(item.as) ? item.as : (item.members || []).map((x) => (devs[x] || {}).as).find((v) => APPL_TYPES.includes(v)) || null;
  },

  /** 0.13.9.18: any appliance (type set, category Appliances or a drum / line): its type and readings. */
  _applModel(item) {
    if (!item || item.phantom) return null;
    const hass = this._hass;
    const ents = [...new Set([...(item.bond ? item.entities || [] : [...(item.allEntities || item.entities || []), item.main_entity]), ...(item.allEntities || [])])].filter((e) => e && hass.states[e]);
    const drum = item.light && ["drum", "line"].includes(item.light.type);
    const type = this._applKind(item) || applGuess(`${item.name} ${ents.join(" ")}`) || (drum ? (item.light.type === "line" ? "dishwasher" : "washer") : "other");
    const dc = (e) => (hass.states[e].attributes || {}).device_class;
    const status = ents.find((e) => domainOf(e) === "sensor" && !num(hass.states[e].state) && dc(e) !== "timestamp" && /(run_state|operation_state|current_status|program_phase|program_progress_status|machine_state|status|_state)$/.test(e))
      || ents.find((e) => domainOf(e) === "sensor" && /run_state|operation_state|current_status/.test(e));
    const remaining = ents.find((e) => domainOf(e) === "sensor" && /remain|time_left|finish_time|end_time/.test(e));
    const running = ents.find((e) => domainOf(e) === "binary_sensor" && (dc(e) === "running" || /running/.test(e)));
    const power = ents.find((e) => domainOf(e) === "sensor" && dc(e) === "power");
    const door = ents.find((e) => domainOf(e) === "binary_sensor" && ["door", "opening"].includes(dc(e)));
    const plug = ents.find((e) => domainOf(e) === "switch");
    // 0.8.2: a progress sensor in % (Midea, SmartThings washers and dryers since HA 2026.11).
    const progress = ents.find((e) => domainOf(e) === "sensor" && /progress/.test(e) && (hass.states[e].attributes || {}).unit_of_measurement === "%");
    // 0.13.9.18: the program / cycle (a select or a text sensor named so) and an energy meter, for the details.
    const program = ents.find((e) => ["select", "sensor"].includes(domainOf(e)) && !num(hass.states[e].state) && /program|cycle|mode_select|selected_program|course/.test(e));
    const energy = ents.find((e) => domainOf(e) === "sensor" && dc(e) === "energy");
    return { item, type, status, remaining, running, power, door, plug, progress, program, energy, ents };
  },

  /** Current state of an appliance: phase, colour, label and the rows for its panel. */
  _applState(ap) {
    const hass = this._hass;
    const S = (e) => (e ? hass.states[e] : null);
    const deadStatus = ap.status && !live(S(ap.status));
    const deadPlug = (ap.plug && !live(S(ap.plug))) || (ap.power && !live(S(ap.power)));
    let phase = null;
    if (ap.status && !deadStatus) phase = applPhase(S(ap.status).state);
    if (!phase || phase === "run") {
      if (ap.running && live(S(ap.running)) && !deadPlug) phase = S(ap.running).state === "on" ? (phase || (ap.type === "dryer" ? "heat" : "run")) : phase === "run" ? "run" : "idle";
      else if (!ap.running && ap.power && live(S(ap.power))) phase = Number(S(ap.power).state) > 3 ? phase || (ap.type === "dryer" ? "heat" : "run") : phase || "idle";
    }
    const unav = (ap.status ? deadStatus : true) && (deadPlug || (!ap.running && !ap.power));
    if (unav && !(ap.status && !deadStatus)) phase = "unavailable";
    // 0.13.9.18: an appliance with no status / running / power reading (a coffee machine on a switch, a purifier):
    // its own on / off says it.
    if (!ap.status && !ap.running && !ap.power) {
      const own = S(ap.plug) || S(ap.item.main_entity);
      phase = !own || !live(own) ? "unavailable" : ["on", "running", "printing", "heating", "cleaning", "brewing"].includes(own.state) ? "run" : "idle";
    }
    phase = phase || "idle";
    const key = ap.item.id;
    // Finished: a cycle that was running and stopped keeps a check until the door opens or you tap "Unloaded".
    if (!this._applDone) this._applLoad();
    this._applDone = this._applDone || {};
    this._applPrev = this._applPrev || {};
    const active = ["water", "spin", "heat", "run", "attention"].includes(phase);
    const prev = this._applPrev[key];
    // 0.8.1: when it finished (older saves: true = now), so "Done" clears by itself after 30 min (setting).
    if (phase === "done" || (prev && prev !== "idle" && prev !== "done" && prev !== "unavailable" && phase === "idle")) {
      if (typeof this._applDone[key] !== "number") this._applDone[key] = phase === "done" && S(ap.status) ? Math.min(this._now(), new Date(S(ap.status).last_changed).getTime() || this._now()) : this._now();
    }
    if (active) delete this._applDone[key];
    if (ap.door && S(ap.door) && S(ap.door).state === "on" && !active) delete this._applDone[key];
    // 0.7.5: when the phase last changed (the status pill shows for a few minutes after that).
    this._applChg = this._applChg || {};
    if (prev === undefined) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      this._applChg[key] = since ? new Date(since.last_changed).getTime() : 0;
    } else if (prev !== phase) this._applChg[key] = this._now();
    this._applPrev[key] = phase;
    this._applSave();
    const doneFor = this._per(ap.item, "live").done_for || "30";
    let doneLeft = 0;
    if (this._applDone[key] && doneFor !== "unloaded") {
      doneLeft = Number(this._applDone[key]) + Number(doneFor) * 60000 - this._now();
      if (doneLeft <= 0 && (phase === "done" || phase === "idle")) {
        phase = "idle"; // cleared by time; the record stays until the next cycle so it doesn't come back
        doneLeft = 0;
      }
    }
    if (phase === "idle" && this._applDone[key] && (doneFor === "unloaded" || doneLeft > 0)) phase = "done";
    // Time: a finish timestamp becomes a countdown, minutes stay minutes; else time since it started.
    let time = "";
    let tshort = "";
    const rem = S(ap.remaining);
    if (active && rem && live(rem)) {
      const v = rem.state;
      let min = null;
      if ((rem.attributes || {}).device_class === "timestamp" || /^\d{4}-\d{2}-\d{2}T/.test(v)) min = Math.round((new Date(v).getTime() - this._now()) / 60000);
      else if (/^\d+:\d{2}(:\d{2})?$/.test(v)) {
        const [h, m] = v.split(":").map(Number);
        min = h * 60 + m;
      } else if (num(v)) min = Math.round(Number(v) * ((rem.attributes || {}).unit_of_measurement === "h" ? 60 : (rem.attributes || {}).unit_of_measurement === "s" ? 1 / 60 : 1));
      if (min != null && min >= 0) {
        time = dfT("appl.min_left", { n: min });
        tshort = dfT("unit.min", { n: min });
      }
    }
    const pr = S(ap.progress);
    if (active && !time && pr && live(pr) && num(pr.state)) time = tshort = dfT("appl.pct_done", { n: Math.round(Number(pr.state)) });
    if (active && !time) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      if (since) {
        const n = Math.max(0, Math.round((this._now() - new Date(since.last_changed).getTime()) / 60000));
        time = dfT("appl.min_elapsed", { n });
        tshort = dfT("unit.min", { n });
      }
    }
    const pretty = (t) => String(t).replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const said = (s) => (this._hass.formatEntityState ? this._hass.formatEntityState(s) : pretty(s.state)); // 0.14 L1: HA's own translated state
    const word = phase === "unavailable" ? dfT("appl.unavailable") : phase === "done" ? dfT("appl.finished") : phase === "attention" ? (ap.door && S(ap.door) && S(ap.door).state === "on" ? dfT("appl.door_open") : dfT("appl.paused")) : phase === "error" ? dfT("appl.error") : phase === "idle" ? dfT("appl.idle")
      : ap.status && !deadStatus ? said(S(ap.status)) : ap.type === "dryer" ? dfT("appl.drying") : ["coffee", "printer", "oven"].includes(ap.type) ? dfT(`appl.run_${ap.type}`) : dfT("appl.running");
    const w = ap.power && live(S(ap.power)) ? `${Math.round(Number(S(ap.power).state))} W` : "";
    const col = APPL_COL[phase] || (phase === "run" ? (ap.type === "dryer" ? APPL_COL.heat : APPL_COL.water) : null);
    return { phase, col, word, time, tshort, w, active, chg: this._applChg[key] || 0, doneLeft: phase === "done" ? doneLeft : 0 };
  },

  /** Live: appliances glow on their drum (front view) or along their line (seen from above) while they work;
   *  close ones share one label; tap opens a small panel (information, never the plug). */
  _applHtml(a) {
    this._appls = [];
    if (this._overlay !== "live") return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let html = "";
    const shown = [];
    for (const item of this._items(a)) {
      if (this._hidden(item, "live")) continue;
      const ap = this._applOf(item);
      if (!ap) continue;
      const st = this._applState(ap);
      this._appls.push({ ap, st });
      const tipA = cesc(this._applTip({ ap, st }));
      if (st.phase === "idle" && !(this._pick && this._selId === item.id)) continue;
      const L = item.light;
      const c = st.col || "150,150,150";
      const cls = `appl ${st.phase} ${still ? "still" : ""}`;
      if (L.type === "drum") {
        const r = Number(L.r) || 1.5;
        html += `<div class="${cls} drum" style="left:${item.x}%;top:${item.y}%;width:${(r * 2).toFixed(2)}%;--ac:${c}" data-appl="${cesc(item.id)}" aria-label="${tipA}"><i></i></div>`;
        shown.push({ id: item.id, x: item.x, y: item.y - r * ratio - 1, st, ap });
      } else {
        const x1 = L.x1 ?? item.x - 3;
        const y1 = L.y1 ?? item.y;
        const x2 = L.x2 ?? item.x + 3;
        const y2 = L.y2 ?? item.y;
        const len = Math.hypot(x2 - x1, (y2 - y1) / ratio);
        const ang = (Math.atan2((y2 - y1) / ratio, x2 - x1) * 180) / Math.PI;
        html += `<div class="${cls} aline" style="left:${x1}%;top:${y1}%;width:${len.toFixed(3)}%;transform:translateY(-50%) rotate(${ang.toFixed(2)}deg);--ac:${c}" data-appl="${cesc(item.id)}" aria-label="${tipA}"></div>`;
        shown.push({ id: item.id, x: (x1 + x2) / 2, y: Math.min(y1, y2) - 2.5, st, ap });
      }
    }
    // 0.7.5: a status pill shows for ~3 min after a change; one that needs you (finished, paused, error) stays
    // until it's resolved. Per marker in Live: automatic / always / never.
    const PILL_MS = 180000;
    let next = 0;
    const pillOf = (o) => {
      const mode = this._per(o.ap.item, "live").pill || "";
      if (this._pick && this._selId === o.ap.item.id) return true; // Edit markers: always while selected
      if (mode === "never") return false;
      if (o.st.doneLeft > 0) next = next ? Math.min(next, o.st.doneLeft) : o.st.doneLeft; // redraw when "Done" clears
      if (["done", "attention", "error"].includes(o.st.phase) || mode === "always") return true;
      const left = o.st.chg + PILL_MS - this._now();
      if (left > 0) next = next ? Math.min(next, left) : left;
      return left > 0;
    };
    const labelled = shown.filter(pillOf);
    clearTimeout(this._applT);
    if (next) this._applT = setTimeout(() => this._update(true), next + 500);
    // One label per group of appliances that sit close together.
    const used = new Set();
    for (const s0 of labelled) {
      if (used.has(s0.id)) continue;
      const grp = labelled.filter((o) => !used.has(o.id) && Math.hypot(o.x - s0.x, (o.y - s0.y) / ratio) < 9);
      grp.forEach((o) => used.add(o.id));
      const x = grp.reduce((t, o) => t + o.x, 0) / grp.length;
      const y = Math.min(...grp.map((o) => o.y));
      const att = grp.some((o) => ["done", "attention", "error"].includes(o.st.phase));
      const rows = grp.map((o) => `<span class="ar"><i style="background:rgb(${o.st.col || "150,150,150"})"></i>${o.st.phase === "done" ? dfT("appl.done_unload") : `${cesc(this._applWord(o))}${o.st.tshort ? ` · ${cesc(o.st.tshort)}` : ""}`}</span>`).join("");
      const anc = grp.map((o) => `${o.x},${o.y},${o.st.col || "150,150,150"}`).join(";");
      html += `<button class="applbl ${att ? "att" : ""}" style="left:${x}%;top:${y}%" data-anc="${anc}" data-appl="${cesc(grp.map((o) => o.id).join(","))}" aria-label="${cesc(grp.map((o) => this._applTip(o)).join(", "))}">${rows}</button>`;
    }
    return html;
  },

  /** 0.8.1: "name · state · time" for the hover label, like the info card's headline. */
  _applTip(o) {
    const t = o.st.tshort || "";
    return [this._dev(o.ap.item.id).name || o.ap.item.name, o.st.phase === "done" ? dfT("appl.finished") : this._applWord(o), t].filter(Boolean).join(" · ");
  },

  /** The appliance's word on its label: the leading entity chosen in Edit markers, else its status. */
  _applWord(o) {
    const l = this._per(o.ap.item, "live").lead;
    return l && this._hass.states[l] ? this._fmt(l) : o.st.word;
  },

  /** 0.7.4: a TV that is on lights the room from its screen: a soft, slowly changing glow (Live, Lights). */
  _tvHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "lights") return "";
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const areas = a.areas || {};
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const night = (this._ns && this._ns.f) || 0;
    let defs = "";
    let body = "";
    let n = 0;
    for (const item of this._items(a)) {
      if (item.phantom || item.bond || this._hidden(item, ov)) continue;
      const mp = [item.main_entity, ...(item.entities || [])].find((e) => e && domainOf(e) === "media_player" && hass.states[e]);
      const st = mp && hass.states[mp];
      // A TV glows by default; anything else only when set to Screen in the Editor.
      if (item.light ? item.light.type !== "screen" : !(st && st.attributes.device_class === "tv")) continue;
      if (!st || !live(st)) continue;
      const level = ["on", "playing"].includes(st.state) ? 1 : st.state === "paused" ? 0.45 : ["idle", "standby", "buffering"].includes(st.state) ? 0.25 : 0;
      if (!level) continue;
      const L = { ...defaultShape("screen", a.real_width_m), ...(item.light || {}) };
      // The screen is its own line (both ends set in the Editor); older settings start at the marker.
      const x1 = L.x1 ?? (L.x2 != null ? item.x : item.x - 3);
      const y1 = L.y1 ?? item.y;
      const x2 = L.x2 ?? item.x + 3;
      const y2 = L.y2 ?? item.y;
      const anc = item.area_id && areas[item.area_id];
      const g = screenPoly(x1, y1, x2, y2, Number(L.r) || 10, L.a, ratio, anc ? anc.x : 50, anc ? anc.y : 50);
      const under = Object.keys(areas).find((k) => areas[k].shape && inPoly((x1 + x2) / 2, (y1 + y2) / 2, areas[k].shape)) || null;
      const start = item.area_id && areas[item.area_id] && areas[item.area_id].shape ? item.area_id : under;
      const group = start ? shapeGroup(areas, start) : null;
      const i = n++;
      if (group) defs += `<clipPath id="tvc${i}">${group.map((sh) => `<polygon points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
      const op = (0.5 + 0.35 * night) * level;
      const anim = !still && level === 1;
      const col = anim ? `<animate attributeName="stop-color" values="#a9c8ff;#eef4ff;#b7a8ff;#8fd8ff;#ffe0b8;#a9c8ff" dur="11s" repeatCount="indefinite"/>` : "";
      defs += `<linearGradient id="tvg${i}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}"><stop offset="0" stop-color="#cfe0ff" stop-opacity="${op.toFixed(2)}">${col}</stop><stop offset=".55" stop-color="#cfe0ff" stop-opacity="${(op * 0.35).toFixed(2)}">${col}</stop><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></linearGradient><filter id="tvf${i}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(0.9).toFixed(2)} ${(0.9 * ratio).toFixed(2)}"/></filter>`;
      const flick = anim ? `<animate attributeName="opacity" values="1;.82;.95;.75;1;.88;1" dur="4.3s" repeatCount="indefinite"/>` : "";
      body += `<g${group ? ` clip-path="url(#tvc${i})"` : ""}><polygon points="${g.pts.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" fill="url(#tvg${i})" filter="url(#tvf${i})">${flick}</polygon></g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#eaf2ff" stroke-opacity="${(0.35 + 0.35 * level).toFixed(2)}" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 2px rgba(200,220,255,.8))"/>`;
    }
    if (!n) return "";
    return `<svg class="air" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  },

  /** #115: air flowing from ACs while they cool / heat (Live, Comfort), kept inside the room shapes. */
  /** 0.13.4: what you tap follows the old order even though light is drawn over pictures: room-wide tap areas
   *  (a room's motion / presence, an AC's air flow) sit in one transparent layer UNDER the pictures, touch areas
   *  and markers, so tapping a picture or a marker never opens the room. Same shapes as the drawings. */
  _tapLayer(pulseH, airH) {
    const pulse = (pulseH.match(/<polygon points="[^"]*" fill="transparent" class="ptap"[^>]*\/>/g) || []).join("");
    const air = (airH.match(/<g clip-path="url\(#[^)]*\)"><polygon class="atap"[^>]*\/>|<g><polygon class="atap"[^>]*\/>/g) || [])
      .map((g) => `${g.replace(/fill="url\(#[^)]*\)"/, 'fill="transparent"')}</g>`).join("");
    return pulse || air ? `<svg class="taps" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${pulse}${air}</svg>` : "";
  },

  _airHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "comfort") return "";
    if (ov === "comfort" && !this._layerOn("comfort", "air", this._layerDefault("comfort", "air"))) return "";
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const areas = a.areas || {};
    const W = a.real_width_m;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const COL = { cool: "79,163,255", heat: "255,138,61", dry: "60,193,176", fan: "60,193,176", auto: "126,87,194" };
    let defs = "";
    let body = "";
    let n = 0;
    for (const item of this._items(a)) {
      if (item.phantom || item.bond || this._hidden(item, ov)) continue;
      const clim = [item.main_entity, ...(item.entities || [])].find((e) => e && domainOf(e) === "climate" && hass.states[e]);
      if (!clim) continue;
      const st = hass.states[clim];
      const at = st.attributes || {};
      const act = at.hvac_action;
      let mode = act ? { cooling: "cool", heating: "heat", drying: "dry", fan: "fan" }[act] : { cool: "cool", heat: "heat", dry: "dry", fan_only: "fan", heat_cool: "auto", auto: "auto" }[st.state];
      if (!mode || !live(st)) continue;
      const modes = at.hvac_modes || [];
      const canCool = modes.includes("cool") || modes.includes("heat_cool") || modes.includes("dry") || modes.includes("fan_only");
      if (item.air && item.air.type === "none") continue;
      const aid = item.area_id || (item.of && (a.devices || {})[item.of] && a.devices[item.of].area_id) || null;
      let start = aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = Object.keys(areas).find((k) => areas[k].shape && inPoly(item.x, item.y, areas[k].shape)) || null;
      const group = start ? shapeGroup(areas, start) : null;
      const i = n++;
      if (group) defs += `<clipPath id="ac${i}">${group.map((sh) => `<polygon points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
      const c = COL[mode];
      const clip = group ? ` clip-path="url(#ac${i})"` : "";
      if (!canCool) {
        // Radiator / underfloor: a soft warm glow while heating.
        const r = W ? (1.5 / W) * 100 : 7;
        defs += `<radialGradient id="ag${i}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".62"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`;
        body += `<g${clip}><ellipse cx="${item.x}" cy="${item.y}" rx="${r}" ry="${r * ratio}" fill="url(#ag${i})">${still ? "" : `<animate attributeName="opacity" values=".7;1;.7" dur="4s" repeatCount="indefinite"/>`}</ellipse></g>`;
        continue;
      }
      let ang = 90;
      const anc = aid && areas[aid];
      if (anc && (Math.abs(anc.x - item.x) > 0.5 || Math.abs(anc.y - item.y) > 0.5)) ang = (Math.atan2((anc.y - item.y) / ratio, anc.x - item.x) * 180) / Math.PI;
      // 0.7.7: a trapezoid from the unit's line (drawn in the Editor; else a short line at the marker).
      const g = airGeom({ a: ang, r: W ? (2 / W) * 100 : 10, s: 60, L: W ? (0.8 / W) * 100 : 4, ...(item.air || {}), x: item.x, y: item.y }, ratio);
      const f = (q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
      defs += `<linearGradient id="ag${i}" gradientUnits="userSpaceOnUse" x1="${g.mid[0].toFixed(2)}" y1="${g.mid[1].toFixed(2)}" x2="${g.tip[0].toFixed(2)}" y2="${g.tip[1].toFixed(2)}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".62"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></linearGradient>`;
      // The arcs, as before: centred where the two sides meet, from the unit's line out to the reach.
      const arc = (k) => {
        const rr = g.R * k;
        const a1 = ((g.th - g.h * 0.92) * Math.PI) / 180, a2 = ((g.th + g.h * 0.92) * Math.PI) / 180;
        return `M${(Math.cos(a1) * rr).toFixed(2)},${(Math.sin(a1) * rr).toFixed(2)} A${rr.toFixed(2)},${rr.toFixed(2)} 0 0 1 ${(Math.cos(a2) * rr).toFixed(2)},${(Math.sin(a2) * rr).toFixed(2)}`;
      };
      const k0 = Math.min(0.9, g.d0 / g.R);
      const waves = still ? `<path d="${arc((1 + k0) / 2)}" fill="none" stroke="rgba(${c},.55)" stroke-width="2" vector-effect="non-scaling-stroke"/>` : [0, 1, 2].map((k) => `<g><path d="${arc(1)}" fill="none" stroke="rgba(${c},.95)" stroke-width="2.8" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0"><animateTransform attributeName="transform" type="scale" from="${k0.toFixed(3)}" to="1" dur="3s" begin="${k}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="3s" begin="${k}s" repeatCount="indefinite"/></path></g>`).join("");
      // 0.8.1: the air flow is the AC on the plan: tap and hold open it, hover names it.
      const tipA = `${item.name} · ${hass.formatEntityState ? hass.formatEntityState(st) : st.state}`;
      body += `<g${clip}><polygon class="atap" data-airent="${cesc(clim)}" data-airid="${cesc(item.id)}" aria-label="${cesc(tipA)}" points="${f(g.e1)} ${f(g.f1)} ${f(g.f2)} ${f(g.e2)}" fill="url(#ag${i})"/><g transform="translate(${g.apex[0].toFixed(2)} ${g.apex[1].toFixed(2)}) scale(1 ${ratio})">${waves}</g></g>`;
    }
    if (!n) return "";
    return `<svg class="air" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  },

  /** 0.7.0: every door / window / shutter spot on the plan (devices and entity spots, bonded too). */
  _openSpots(a) {
    const hass = this._hass;
    if (this._osA === a && this._osH === hass) return this._os;
    const out = [];
    const add = (id, d, eid) => {
      const st = hass.states[eid];
      if (!st || !openKind(eid, st)) return;
      out.push({ id, eid, st, kind: openKind(eid, st), as: guessOpenAs(eid, hass, d.name, d.as), x: d.x, y: d.y, area_id: d.area_id, opening: d.opening });
    };
    for (const [id, d] of Object.entries(a.devices || {})) {
      if (d.category === "moving") continue; // 0.12.3: a car's doors are no openings of the house
      const ents = d.entities || [];
      const eid = ents.find((e) => domainOf(e) === "cover" && hass.states[e]) || ents.find((e) => openKind(e, hass.states[e]) === "contact");
      if (eid) add(id, d, eid);
    }
    for (const [eid, d] of Object.entries(a.entities || {})) add(`entity:${eid}`, d, eid);
    // 0.7.2: one bar per opening. A sensor without its own bar shares the bar of another one on the
    // same spot (a twin, a few pixels beside it), or of the one it was set "Next to".
    const own = (o) => o.opening && o.opening.x1 != null;
    const sides = {};
    for (const o of out) if (own(o)) o.geo = o.opening;
    for (const o of out) {
      if (o.geo) continue;
      let base = null;
      if (o.opening && o.opening.link) base = out.find((q) => q.id === o.opening.link && own(q));
      if (!base && !o.opening) base = out.find((q) => q !== o && own(q) && Math.hypot(q.x - o.x, q.y - o.y) < 1.5);
      if (!base) continue;
      const n = (sides[base.id] = (sides[base.id] || 0) + 1);
      let side = o.opening && o.opening.side ? o.opening.side : n % 2 ? 1 : -1;
      if (base.opening.swap) side = -side;
      o.geo = base.opening;
      o.side = side * Math.ceil(n / 2);
    }
    // 0.7.3: "Combine into one bar": a shutter and a contact of the same opening share one bar,
    // driven by the shutter; the contact only raises an alert (closed shutter, open contact).
    for (const o of out) {
      if (!(o.opening && o.opening.merge && o.geo)) continue;
      const base = out.find((q) => q.id === o.opening.link);
      if (!base) continue;
      const cover = [o, base].find((q) => q.kind === "cover");
      const contact = cover === o ? base : o;
      if (!cover || contact.kind !== "contact") continue;
      cover.geo = base.opening;
      cover.side = 0;
      cover.as = "shutter";
      cover.mate = contact;
      contact.hidden = true;
    }
    this._osA = a;
    this._osH = hass;
    this._os = out;
    return out;
  },

  /** Entities that have a bar drawn: their markers step aside in Live. */
  _barEnts() {
    const a = this._a;
    if (!a || !this._hass) return new Set();
    return new Set(this._openSpots(a).filter((o) => o.geo).map((o) => o.eid));
  },

  /** How far open, 0…1 (null = unknown). */
  _openFrac(o) {
    const st = o.st;
    if (!live(st)) return null;
    if (o.kind === "contact") return st.state === "on" ? 1 : 0;
    const p = st.attributes.current_position;
    if (num(p)) return Math.max(0, Math.min(1, Number(p) / 100));
    return st.state === "closed" ? 0 : 1;
  },

  /** 0.7.0: doors and windows as a light blue bar while open.
   *  0.7.4: shutters as a white bar for the part that is closed: open = nothing, closed = full bar.
   *  A sliding shutter grows from the bar's first end, a roller shutter from the centre to both ends.
   *  Unknown / unavailable: a faint dashed bar, so it never looks open by mistake.
   *  In Security every shutter shows (an open one as a faint outline), so each can be tapped. */
  _barsHtml(a) {
    const ov = this._overlay;
    if (!["live", "security"].includes(ov)) return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    let html = "";
    for (const o of this._openSpots(a)) {
      if (!o.geo || o.hidden) continue;
      const f = this._openFrac(o);
      const { x1, y1, x2, y2 } = o.geo;
      const len = Math.hypot(x2 - x1, (y2 - y1) / ratio);
      const ang = (Math.atan2((y2 - y1) / ratio, x2 - x1) * 180) / Math.PI;
      // Twins sit beside the bar: 7 px bar + 4 px gap per step.
      const geo = `left:${x1}%;top:${y1}%;width:${len.toFixed(3)}%;transform:translateY(-50%) rotate(${ang.toFixed(2)}deg)${o.side ? ` translateY(${o.side * 11}px)` : ""}`;
      const label = `${entName(this._hass, o.eid)}: ${this._hass.formatEntityState ? this._hass.formatEntityState(o.st) : o.st.state}`;
      const bar = (cls, inner = "", title = label) => `<button class="obar ${cls}" data-bar="${cesc(o.eid)}" aria-label="${cesc(title)}" title="${cesc(title)}" style="${geo}">${inner}</button>`;
      if (o.as !== "shutter") {
        if (f == null || f === 0) continue;
        html += bar("door");
        continue;
      }
      if (f == null) {
        html += bar("shut unk");
        continue;
      }
      const shut = 1 - f; // how much of the opening the shutter covers
      if (o.mate && shut > 0.99 && o.mate.st && o.mate.st.state === "on") {
        // Shutter says closed, the contact says open: pulsing orange-red.
        const ml = `${label} · ${entName(this._hass, o.mate.eid)}: open`;
        html += bar("shut alert", `<i style="width:100%"></i>`, ml);
        continue;
      }
      // Security shows every shutter (open ones as a faint outline you can tap); Live only what is closed.
      const track = ov === "security" ? " track" : "";
      if (shut < 0.01) {
        if (track) html += bar("shut track");
        continue;
      }
      const w = (shut * 100).toFixed(1);
      const roll = (o.geo.roll || (o.kind === "cover" && num(o.st.attributes.current_position) ? "roller" : "sliding")) === "roller";
      html += bar(`shut${track}`, `<i style="width:${w}%${roll ? `;margin-left:${((100 - shut * 100) / 2).toFixed(1)}%` : ""}"></i>`);
    }
    return html;
  },

  /** 0.7.3: the shaped room a device sits in (its area, else the shape under it). */
  _roomOf(item, a = this._a) {
    const areas = (a && a.areas) || {};
    if (item.area_id && areas[item.area_id] && Array.isArray(areas[item.area_id].shape) && areas[item.area_id].shape.length >= 3) return item.area_id;
    // 0.13.9.19 #87: an opening drawn as a bar counts by its middle; a device on a wall (outside every room shape)
    // belongs to the nearest room within a few % of the plan (the integration's own `locate` rule).
    const op = item.opening;
    const x = op && Number.isFinite(op.x1) ? (op.x1 + op.x2) / 2 : item.x;
    const y = op && Number.isFinite(op.y1) ? (op.y1 + op.y2) / 2 : item.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const shaped = Object.keys(areas).filter((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3);
    const hit = shaped.find((k) => inPoly(x, y, areas[k].shape));
    if (hit) return hit;
    const segD = (px, py, [ax, ay], [bx, by]) => {
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(px - ax - t * dx, py - ay - t * dy);
    };
    let best = null;
    for (const k of shaped) {
      const sh = areas[k].shape;
      const d = Math.min(...sh.map((p, i) => segD(x, y, p, sh[(i + 1) % sh.length])));
      if (d <= 4 && (!best || d < best[1])) best = [k, d];
    }
    return best ? best[0] : null;
  },

  /** Motion and presence sensors on the plan, with their room. */
  _motionSpots(a) {
    const hass = this._hass;
    const out = [];
    const seen = new Set();
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      const room = this._roomOf(item);
      if (!room) continue;
      for (const e of [item.main_entity, ...(item.entities || [])]) {
        if (!e || seen.has(e)) continue;
        const st = hass.states[e];
        if (!st || kindOf(e, st) !== "motion") continue;
        seen.add(e);
        const dc = st.attributes.device_class;
        out.push({ eid: e, st, room, presence: dc === "occupancy" || dc === "presence" });
      }
    }
    return out;
  },

  /** 0.7.3: Room pulse. Motion: the room's edges glow and breathe; presence: a steady faint outline;
   *  cleared: fades out over 2 s. Only along real walls: where a room overlaps another (open plan),
   *  nothing is drawn, so no line runs through the open space. */
  _pulseHtml(a) {
    if (this._overlay !== "live") return "";
    const opts = (this._config.live || {});
    if ((opts.motion_as || "pulse") === "icons") return "";
    const areas = a.areas || {};
    const now = this._now();
    this._pulseT = this._pulseT || {};
    this._pulseOn = this._pulseOn || {};
    const rooms = {};
    for (const m of this._motionSpots(a)) {
      const r = (rooms[m.room] = rooms[m.room] || { motion: false, presence: false, ents: [] });
      if (m.st.state === "on") {
        if (m.presence) r.presence = true;
        else r.motion = true;
        r.ents.push(m.eid);
      }
    }
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const pts = (sh) => sh.map((q) => `${q[0]},${q[1]}`).join(" ");
    const shaped = Object.keys(areas).filter((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3);
    let defs = `<filter id="pgf" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${(0.9).toFixed(2)} ${(0.9 * ratio).toFixed(2)}"/></filter>`;
    let body = "";
    let i = 0;
    for (const aid of shaped) {
      const r = rooms[aid] || { motion: false, presence: false, ents: [] };
      const active = r.motion || r.presence;
      const was = this._pulseOn[aid];
      if (was && !active) this._pulseT[aid] = now;
      this._pulseOn[aid] = active;
      const fading = !active && this._pulseT[aid] && now - this._pulseT[aid] < 2100;
      if (!active && !fading) continue;
      const me = pts(areas[aid].shape);
      const open = shaped.filter((k) => k !== aid && polysOverlap(areas[aid].shape, areas[k].shape));
      defs += `<clipPath id="pc${i}"><polygon points="${me}"/></clipPath>`;
      let mask = "";
      if (open.length) {
        defs += `<mask id="pm${i}" maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="110"><rect x="-5" y="-5" width="110" height="110" fill="#fff"/>${open.map((k) => `<polygon points="${pts(areas[k].shape)}" fill="#000"/>`).join("")}</mask>`;
        mask = ` mask="url(#pm${i})"`;
      }
      const cls = fading ? "fade" : r.motion ? "breathe" : "steady";
      const delay = fading ? `animation-delay:-${now - this._pulseT[aid]}ms` : r.motion ? `animation-delay:-${now % 3600}ms` : "";
      body += `<g class="pg ${cls}" style="${delay}"><g clip-path="url(#pc${i})"${mask}><polygon points="${me}" fill="none" stroke="#3fb8a5" stroke-width="14" vector-effect="non-scaling-stroke" filter="url(#pgf)" opacity=".55"/><polygon points="${me}" fill="none" stroke="#5fd3c0" stroke-width="2" vector-effect="non-scaling-stroke" opacity=".85"/></g>${r.ents.length ? `<polygon points="${me}" fill="transparent" class="ptap" data-pulse="${cesc(r.ents[0])}"/>` : ""}</g>`;
      i++;
    }
    return body ? `<svg class="pulse" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>` : "";
  },

  /** 0.7.2: daylight per room, spreading through the home.
   *  Sources: a window lets light in whatever its state; a shutter by how far it's open; doors don't count.
   *  A room with sources is mostly its own light; an inner room (no sources) takes the average of the
   *  rooms its shape touches or overlaps (gap = wall: no light). Overlap (open plan) links stronger. */
  _daylight(a) {
    const areas = a.areas || {};
    const ids = Object.keys(areas).filter((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3);
    if (!ids.length) return null;
    const src = {};
    let anyShutter = false;
    for (const o of this._openSpots(a)) {
      if (o.as === "door" || o.hidden) continue;
      let aid = o.area_id && ids.includes(o.area_id) ? o.area_id : null;
      if (!aid) aid = ids.find((k) => inPoly(o.x, o.y, areas[k].shape)) || null;
      if (!aid && o.geo) aid = ids.find((k) => inPoly((o.geo.x1 + o.geo.x2) / 2, (o.geo.y1 + o.geo.y2) / 2, areas[k].shape)) || null;
      if (!aid) continue;
      let v;
      if (o.as === "window") v = 1;
      else {
        v = this._openFrac(o);
        if (v == null) continue;
        anyShutter = true;
      }
      (src[aid] = src[aid] || []).push(v);
    }
    if (!anyShutter) return null;
    // Links: overlap (open plan) 1, touch (doorway) 0.5.
    const links = {};
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = areas[ids[i]].shape;
      const B = areas[ids[j]].shape;
      const w = polysOverlap(A, B) ? 1 : polysTouch(A, B) ? 0.5 : 0;
      if (!w) continue;
      (links[ids[i]] = links[ids[i]] || []).push([ids[j], w]);
      (links[ids[j]] = links[ids[j]] || []).push([ids[i], w]);
    }
    const own = {};
    for (const k of ids) if (src[k]) own[k] = 1 - src[k].reduce((t, v) => t + v, 0) / src[k].length;
    let d = {};
    for (const k of ids) d[k] = own[k] ?? 0;
    for (let it = 0; it < 16; it++) {
      const nd = {};
      for (const k of ids) {
        const nb = links[k] || [];
        const sw = nb.reduce((t, [, w]) => t + w, 0);
        const sv = nb.reduce((t, [j, w]) => t + w * d[j], 0);
        if (src[k]) {
          const S = src[k].length; // its own windows count most
          nd[k] = (S * own[k] + 0.6 * sv) / (S + 0.6 * sw);
        } else nd[k] = sw ? sv / sw : 0;
      }
      d = nd;
    }
    return { ids, d };
  },

  /** #117 / 0.7.2: one shading layer by day; each spot gets one value (no doubling where shapes overlap),
   *  soft between rooms that touch, crisp at walls and outside. */
  _shadeHtml(a, n, ns) {
    if (n.shutters === false || !(n.overlays || []).includes(this._overlay)) return "";
    const day = 1 - (ns.f || 0);
    if (day <= 0.05) return "";
    const res = this._daylight(a);
    if (!res) return "";
    const areas = a.areas || {};
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const pts = (sh) => sh.map((q) => `${q[0]},${q[1]}`).join(" ");
    const MAX = 0.55; // fully dark room ≈ half dark, never black
    const order = [...res.ids].sort((x, y) => res.d[x] - res.d[y]); // darker last: overlaps take the darker
    let paint = "";
    let any = false;
    for (const k of order) {
      const alpha = Math.max(0, Math.min(1, res.d[k])) * MAX * day;
      if (alpha >= 0.03) any = true;
      const L = Math.round(255 * alpha);
      // 0.9.1: a thin stroke in the same colour closes the hairline where two glued rooms meet.
      paint += `<polygon points="${pts(areas[k].shape)}" fill="rgb(${L},${L},${L})" stroke="rgb(${L},${L},${L})" stroke-width=".3" stroke-linejoin="round"/>`;
    }
    if (!any) return "";
    const clip = res.ids.map((k) => `<polygon points="${pts(areas[k].shape)}"/>`).join("");
    const r = 1.4;
    const b = 1.6;
    return `<svg class="shade" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>
<filter id="shf" x="-10%" y="-10%" width="120%" height="120%"><feMorphology operator="dilate" radius="${r} ${(r * ratio).toFixed(2)}"/><feGaussianBlur stdDeviation="${b} ${(b * ratio).toFixed(2)}"/></filter>
<clipPath id="shc">${clip}</clipPath>
<mask id="shm" maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="110"><rect x="-5" y="-5" width="110" height="110" fill="#000"/><g filter="url(#shf)">${paint}</g></mask></defs>
<rect x="0" y="0" width="100" height="100" fill="rgb(12,18,34)" mask="url(#shm)" clip-path="url(#shc)"/></svg>`;
  },

  _nightHtml(a) {
    const n = this._night();
    const ns = this._ns || { f: 0 };
    const ov = this._overlay;
    const on = ns.f > 0 && (n.overlays || []).includes(ov);
    const pools = ov === "lights" || on || this._glowOnly(ov) ? this._pools(a) : [];
    const shade = this._shadeHtml(a, n, ns);
    if (!on && !pools.length) return shade;
    const k = (ns.f * Math.max(0, Math.min(100, Number(n.strength ?? 70)))) / 100;
    let html = shade;
    if (on) {
      const base = n.style === "dim" ? `rgba(0,0,0,${(0.82 * k).toFixed(3)})` : `rgba(10,16,38,${(0.86 * k).toFixed(3)})`;
      const mk = pools.length ? poolSvg(pools, "mask") : "";
      // #119: with room shapes, only the inside of the home darkens; walls and outside keep their colour.
      // Only when every room on the plan has a shape (else the unshaped rooms would stay bright).
      const rooms = Object.values(a.areas || {}).filter((x) => x.x != null || x.shape);
      const shapes = rooms.every((x) => Array.isArray(x.shape) && x.shape.length >= 3) ? rooms.map((x) => x.shape) : [];
      const sm = shapes.length ? shapesSvg(shapes) : "";
      const layers = [sm, mk].filter(Boolean);
      const both = layers.length === 2 ? "-webkit-mask-composite:source-in;mask-composite:intersect;" : "";
      const mask = layers.length ? `-webkit-mask-image:${layers.join(",")};mask-image:${layers.join(",")};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;${both}` : "";
      html += `<div class="night" style="background:${base};${mask}"></div>`;
      if (ns.tint) html += `<div class="ntint" style="background:${ns.tint === "dusk" ? "rgba(255,140,60," : "rgba(120,160,255,"}${(0.2 * Math.sin(Math.PI * ns.f)).toFixed(3)});${sm ? `-webkit-mask-image:${sm};mask-image:${sm};-webkit-mask-size:100% 100%;mask-size:100% 100%;` : ""}"></div>`;
    }
    if (pools.length) {
      const g = poolSvg(pools, "glow");
      if (on) html += `<div class="nglow" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:${(0.25 + 0.3 * ns.f).toFixed(2)}"></div>`;
      // By day, light pools tint the floor (multiply) so they stay visible on a bright plan.
      else html += `<div class="nglow day" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:.35"></div>`;
    }
    return html;
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- people (#67)
  _people() {
    return Array.isArray(this._config.people) ? this._config.people.filter((p) => p && p.entity) : [];
  },

  _peopleShown() {
    if (!this._people().length) return false;
    const ov = this._overlay;
    return ov === "live" || (Array.isArray(this._config.people_in) && this._config.people_in.includes(ov)) || this._pdOn();
  },

  /** Which room a person is in: room sensor 1, else 2; state = area name, id or alias of a room pin. */
  _personRoom(p, a) {
    const hass = this._hass;
    for (const sid of [p.room, p.room2]) {
      if (!sid) continue;
      const s = hass.states[sid];
      if (!live(s)) continue;
      const v = String(s.state).trim().toLowerCase();
      if (!v || ["not_home", "away", "none", "home"].includes(v)) continue;
      const vid = v.replace(/[\s-]+/g, "_");
      const hit = Object.entries(a.areas || {}).find(([id, ar]) => id.toLowerCase() === v || id.toLowerCase() === vid || String(ar.name || "").toLowerCase() === v || (ar.aliases || []).some((x) => String(x).toLowerCase() === v));
      if (!hit) continue;
      const c = Number((s.attributes || {}).confidence);
      const low = Number.isFinite(c) && (c <= 1 ? c < 0.5 : c < 50);
      return { id: hit[0], ar: hit[1], low };
    }
    return null;
  },

  _peopleData(a) {
    const hass = this._hass;
    const placed = [];
    const home = [];
    const rings = [];
    const pd = this._pdOn(); // 0.13.9.4: Network → Bluetooth shows the people with a distance sensor
    const proxies = pd ? this._pdProxies(a) : [];
    for (const p of this._people()) {
      if (pd && this._overlay === "network" && !p.distance) continue;
      const st = hass.states[p.entity];
      if (!st) continue;
      const name = p.name || entName(this._hass, p.entity);
      const pic = st.attributes && st.attributes.entity_picture ? (this._hass.hassUrl ? this._hass.hassUrl(st.attributes.entity_picture) : st.attributes.entity_picture) : null;
      const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const r = st.state === "home" || p.room || p.room2 ? this._personRoom(p, a) : null;
      const who = { eid: p.entity, name, pic, initials };
      if (r && this._config.focus_area && r.id !== this._config.focus_area) continue; // 0.13.9.16: a room cut-out: its own people
      if (r && st.state !== "not_home") {
        const rg = pd && p.distance ? this._pdRings(p, proxies) : [];
        rings.push(...rg);
        const spot = rg.length ? this._pdSpot(p.entity, r, rg, a) : null;
        placed.push({ ...who, room: r.id, roomName: r.ar.name, low: r.low, x: spot ? spot.x : r.ar.x, y: spot ? spot.y : r.ar.y, pd: !!spot });
      }
      else if (st.state === "home") home.push(who);
    }
    // Several people in one room: side by side under the room name.
    const W = this._boxW || 900;
    const H = W / (a.image_width && a.image_height ? a.image_width / a.image_height : 1.6);
    const size = (Number(this._look().size) || 34) * (this._scale || 1) * 1.15;
    const byRoom = {};
    for (const x of placed) if (!x.pd) (byRoom[x.room] = byRoom[x.room] || []).push(x);
    for (const list of Object.values(byRoom)) list.forEach((x, i) => {
      x.x += ((i - (list.length - 1) / 2) * size * 1.08 * 100) / W;
      x.y += (size * 0.95 * 100) / H;
    });
    return { placed, home, rings };
  },

  _peopleHtml(a) {
    if (!this._peopleShown()) return { plan: "", row: "" };
    const { placed, home, rings } = this._peopleData(a);
    const av = (x) => (x.pic ? `<img src="${cesc(x.pic)}" alt="">` : cesc(x.initials));
    const plan = this._pdRingsSvg(rings, a) + placed.map((x) => `<button class="m person ${edgeCls(x.x, x.y, this._em)} ${x.low ? "low" : ""} ${x.pd ? "pd" : ""}" style="left:${x.x}%;top:${x.y}%" data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${x.roomName}${x.low ? ` (${dfT("people.not_sure")})` : ""}`)}"><span class="ic">${av(x)}</span><span class="tip">${cesc(x.name)} · ${cesc(x.roomName)}</span></button>`).join("");
    const row = this._overlay === "live" && home.length && this._config.people_row !== false ? `<div class="prow"><span>${dfT("people.home")}</span>${home.map((x) => `<button data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${dfT("people.home_unknown")}`)}"><span class="av">${av(x)}</span>${cesc(x.name)}</button>`).join("")}</div>` : "";
    return { plan, row };
  },

  /** Tell chip cards on this screen which overlay is showing (#73). */
  _announce() {
    if (this._announced === this._overlay) return;
    this._announced = this._overlay;
    const key = (this._config && this._config.card_id) || "_";
    window.__dfpActive = { ...(window.__dfpActive || {}), [key]: this._overlay };
    window.dispatchEvent(new CustomEvent("device-floorplan-overlay", { detail: { card_id: (this._config && this._config.card_id) || null, overlay: this._overlay } }));
  },

  _look() {
    const l = this._config.look || {};
    const markers = l.markers || (l.values === false || this._config.show_states === false ? "icon" : "icon_text");
    return { size: 34, chips: "dark", names: this._config.names || "hover", title: true, ...l, markers };
  },

  _buttons() {
    const b = this._config.buttons || {};
    const dock = (this._config.look || {}).dock;
    // 0.8.2: the Side Rail: full height at the card's left / right edge, plain icon buttons, dark by default.
    const rail = b.position === "rail_left" || b.position === "rail_right";
    return {
      // 0.14.1: only known values reach the markup (class names); anything else falls back to the default.
      position: rail ? b.position.slice(5) : ["top", "bottom", "left", "right", "hidden"].includes(b.position) ? b.position : dock === "hidden" ? "hidden" : "bottom",
      rail,
      style: b.style || (dock === "icons" ? "icons" : "labels"),
      space: rail ? "reserve" : b.space || "reserve",
      // 0.8.2: the bar (background) and the buttons are separate; old "sidebar" / "plain" shapes map onto them.
      shape: rail ? "rail" : BAR_SHAPES.includes(b.shape) ? b.shape : "pill",
      // 0.9.1: "contrast" = the opposite of the theme (dark on a light theme, light on a dark one); the rail's default.
      bar: rail ? (["theme", "dark"].includes(b.bar) ? b.bar : "contrast") : b.space === "float_icons" || b.shape === "plain" ? "clear" : b.shape === "sidebar" ? (["theme", "clear", "contrast"].includes(b.bar) ? b.bar : "dark") : ["dark", "clear", "contrast"].includes(b.bar) ? b.bar : "theme",
      auto: b.auto_status === true,
      size: ["s", "l"].includes(b.size) ? b.size : "m",
      actions: b.actions || {},
      shortcuts: (Array.isArray(b.shortcuts) ? b.shortcuts : []).filter((x) => x && (x.name || x.icon)),
    };
  },

  /** 0.8.2: the automatic status of the built-in overlay buttons, from the devices on this floor. */
  _autoStatus() {
    const h = this._hass;
    const sen = this._sensor();
    const a = sen && sen.attributes;
    if (!h || !a) return {};
    const items = this._items(a).filter((i) => !i.phantom);
    if (!this._cx) this._cx = this._ctx(a);
    const lightItems = new Set(items.filter((i) => !this._hidden(i, "lights") && this._qualifies(i, "lights", a)).map((i) => i.id));
    const low = Number((this._config.health || {}).low ?? 20);
    const litItems = new Set(); // 0.11: lights on are counted per marker, like on the plan (a bond counts once)
    let sec = false;
    let health = false;
    let net = false;
    const seen = new Set();
    for (const it of items) {
      const mainSt = h.states[it.main_entity];
      if (it.main_entity && !it.bond && mainSt && devOffline(h, it)) {
        health = true;
        if ((it.conns || []).length) net = true;
      }
      const hasCover = (it.entities || []).some((e) => domainOf(e) === "cover");
      for (const e of it.entities || []) {
        if (seen.has(e)) continue;
        seen.add(e);
        const st = h.states[e];
        if (!st) continue;
        const k = kindOf(e, st);
        if (domainOf(e) === "light" && st.state === "on") {
          if (lightItems.has(it.id)) litItems.add(it.id);
        } else if (k === "opening" && st.state === "on" && !hasCover && ["door", "window", "garage_door"].includes(st.attributes.device_class)) sec = true;
        else if (domainOf(e) === "alarm_control_panel" && (/^armed/.test(st.state) || st.state === "triggered")) sec = true;
        else if (domainOf(e) === "lock" && st.state === "unlocked") sec = true;
        else if (k === "battery" && live(st) && num(st.state) && Number(st.state) <= low) health = true;
      }
    }
    let clean = null;
    for (const [eid, cfg] of Object.entries(a.robots || {})) {
      if (!h.states[eid]) continue;
      const inf = this._rbInfo(eid, rbRead(h, eid, cfg));
      if (inf.err) clean = { dot: "var(--error-color, #db4437)" };
      else if (inf.attn && !clean) clean = { dot: "#ffa000" };
    }
    const lights = litItems.size;
    return {
      cleaning: clean,
      lights: lights ? { badge: lights, color: "#F2B84B" } : null,
      security: sec ? { dot: "var(--error-color, #db4437)" } : null,
      health: health ? { dot: "#ffa000" } : null,
      network: net ? { dot: "var(--error-color, #db4437)" } : null,
    };
  },

  /** Status of a bar button: "auto" (built-ins), "off", or your own (entity + how it shows). */
  _btnStatus(st, auto) {
    if (st && st.mode === "off") return null;
    if (st && st.mode === "custom") return barStatus(this._hass, st);
    if (st && st.mode === "auto") return auto || null; // 0.13.1: chosen on this button, no need for the switch above
    return this._buttons().auto ? auto || null : null;
  },

  /** One bar button (an overlay or a shortcut), with its status on the icon (colour, dot or badge). */
  _barBtn({ attrs, cls, icon, label, st }) {
    const s = st || {};
    const col = s.color && s.badge == null ? ` style="color:${cesc(s.color)}"` : "";
    const mark = s.badge != null ? `<i class="bbadge"${s.color ? ` style="background:${cesc(s.color)}"` : ""}>${cesc(s.badge)}</i>` : s.dot ? `<i class="bdot" style="background:${cesc(s.dot)}"></i>` : "";
    return `<button class="${cls}" ${attrs} title="${cesc(label)}"><span class="bi"><ha-icon icon="${cesc(icon)}"${col}></ha-icon>${mark}</span><span class="bl">${cesc(label)}</span></button>`;
  },

  /** Tap / hold of a shortcut or an overlay's hold: Home Assistant actions, plus reload and back. */
  _barRun(act, ent) {
    if (!act || act.action === "none") return;
    if (this._pick) return this._toast(dfT("toast.no_shortcuts_editing"));
    if (act.action === "reload") return location.reload();
    if (act.action === "back") return history.back();
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: ent, tap_action: act }, action: "tap" }, bubbles: true, composed: true }));
  },

  _barHold(t) {
    if (t.dataset.oact != null) {
      const x = this._ovActs()[Number(t.dataset.oact)];
      if (!x) return;
      if (x.hold_action) this._barRun(x.hold_action, this._ovActEnt(x));
      else if (this._ovActEnt(x)) this._moreInfo(this._ovActEnt(x));
      return;
    }
    const b = this._buttons();
    if (t.dataset.ov) {
      const act = (b.actions[t.dataset.ov] || {}).hold_action;
      if (act) this._barRun(act);
      return;
    }
    const sc = b.shortcuts[Number(t.dataset.sc)];
    if (!sc) return;
    const ent = (Array.isArray((sc.status || {}).entity) ? sc.status.entity[0] : (sc.status || {}).entity) || undefined;
    if (sc.hold_action) this._barRun(sc.hold_action, ent);
    else if (ent) this._moreInfo(ent);
  },

  _barTap(i) {
    const sc = this._buttons().shortcuts[i];
    if (!sc) return;
    const ent = (Array.isArray((sc.status || {}).entity) ? sc.status.entity[0] : (sc.status || {}).entity) || undefined;
    if (sc.tap_action) this._barRun(sc.tap_action, ent);
    else if (ent) this._moreInfo(ent);
    this._update(true);
  },

  _rooms() {
    return { style: "label", size: "m", hidden: [], names: {}, ...(this._config.rooms || {}) };
  },

  _lights() {
    return { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, scenes: [], ...(this._config.lights || {}) };
  },

  _dev(id) {
    return (this._config.devices && this._config.devices[id]) || {};
  },

  _sensor() {
    const id = this._config && (this._floor || this._planIds()[0]);
    return planSensors(this._hass).find((s) => s.attributes.plan_id === id) || null;
  },

  // ------------------------------------------------------------- data
  /** Placed things: devices, helpers on their own, bonds (one item each). */
  _items(a) {
    const out = [];
    const bonds = a.bonds || {};
    const inBond = new Set();
    for (const b of Object.values(bonds)) for (const m of b.members || []) inBond.add(m);
    for (const [id, d] of Object.entries(a.devices || {})) {
      if (inBond.has(id)) continue;
      out.push({ id, ...d, standalone: false });
    }
    for (const [eid, e] of Object.entries(a.entities || {})) {
      const id = `entity:${eid}`;
      if (inBond.has(id)) continue;
      // Split device (#91): an entity of a device, shown where it acts.
      const of = e.of && (a.devices || {})[e.of];
      const group = e.of ? (domainOf(eid) === "light" ? "lights" : (of && of.group) || "plugs_switches") : "helpers";
      out.push({ id, ...e, main_entity: eid, entities: [eid], standalone: !e.of, group, ...(of ? { conns: of.conns || [], ofName: of.name } : {}) });
    }
    const memberOf = (m) => (a.devices || {})[m] || ((a.entities || {})[m.slice(7)] ? { ...(a.entities || {})[m.slice(7)], main_entity: m.slice(7), entities: [m.slice(7)] } : null);
    for (const [bid, b] of Object.entries(bonds)) {
      const mem = (b.members || []).map(memberOf).filter(Boolean);
      const groups = mem.map((d) => d.group);
      const all = [...new Set(mem.flatMap((d) => d.entities || [d.main_entity]).filter(Boolean))];
      const conns = [...new Set(mem.flatMap((d) => d.conns || []))];
      const zb = mem.find((d) => d.ieee);
      const rtr = (mem.find((d) => d.router) || {}).router;
      out.push({ id: `bond:${bid}`, bond: true, h: b.h, router: rtr, light: (mem.find((d) => d.light) || {}).light, lights: b.lights || "", mlights: mem.map((d) => ({ light: d.light, ent: d.main_entity })), name: bondName(b), icon: b.icon, tap: b.tap, show: b.show, x: b.x, y: b.y, px: b.px, py: b.py, main_entity: (b.entities || [])[0], entities: b.entities || [], allEntities: all, members: b.members || [], pic: (mem.find((d) => d.pic) || {}).pic, touch: (mem.find((d) => d.touch) || {}).touch, names: b.names || [], conns, ieee: zb ? zb.ieee : null, area: (mem[0] || {}).area, domain: b.domain, group: groups.includes("lights") || b.domain === "light" ? "lights" : groups[0] || "lights" });
    }
    // Phantoms (#60): an extra item with a combined value; its devices keep their own markers.
    // 0.13.9.8: mounting heights by marker id, so markers on one spot stack highest on top (see the layout).
    this._hIndex = this._hIndex || new Map();
    for (const it of out) {
      if (typeof it.h === "number") this._hIndex.set(it.id, it.h);
      else this._hIndex.delete(it.id);
    }
    for (const [pid, ph] of Object.entries(a.phantoms || {})) {
      if (!(ph.members || []).length) continue;
      const mem = ph.members.map((m) => [m, memberOf(m)]).filter((x) => x[1]);
      const byMember = {};
      const mgroup = {};
      for (const [m, d] of mem) {
        byMember[m] = d.entities || [d.main_entity];
        mgroup[m] = d.group || ""; // 0.12.9: which temperatures count as a room's (Comfort)
      }
      out.push({ id: `ph:${pid}`, phantom: true, name: ph.name || dfT("phantom"), icon: ph.icon, x: ph.x, y: ph.y, px: ph.px, py: ph.py, members: ph.members, names: mem.map(([, d]) => d.name), mains: mem.map(([, d]) => d.main_entity).filter(Boolean), units: phUnits(mem.map(([, d]) => d)), entities: ph.entities || [], byMember, mgroup, value: ph.value || "average", one: ph.one, group: "phantoms", ...(ph.pic ? { pic: ph.pic } : {}), ...(ph.touch ? { touch: ph.touch } : {}) });
    }
    return out;
  },

  /** 0.10.2: entities hidden in Home Assistant are never picked automatically (a raw sensor behind a template). */
  _hiddenInHA(e) {
    const re = this._hass && this._hass.entities && this._hass.entities[e];
    return !!(re && re.hidden);
  },

  _allowed(item) {
    const all = item.bond ? [...new Set([...(item.entities || []), ...(item.allEntities || [])])] : [...new Set([item.main_entity, ...(item.entities || [])].filter(Boolean))];
    return all.filter((e) => !this._hiddenInHA(e));
  },

  /** 0.11: the selected marker in Edit markers when it's hidden or idle: a real, drawable marker (the quick
   *  "does it qualify" answer is only a key, which drew as "undefined" in custom overlays). */
  _selSpec(item, ov, name) {
    const q = this._specsFor(item, ov, true).filter((x) => x && x.item);
    if (q.length) return q.slice(0, 1);
    if (ov === "health") return item.main_entity ? [this._offChip(item, name)] : []; // shows only when offline
    // 0.12.9: as it would look once shown (added): as itself, never a settings / technical value.
    const sp = this._asItself(item, name, this._addedLead(item));
    return sp ? [this._withExtras(sp, item, ov)] : [];
  },

  _hidden(item, overlay) {
    const o = this._dev(item.id);
    return Array.isArray(o.hide_in) && o.hide_in.includes(overlay);
  },

  _added(item, overlay) {
    const o = this._dev(item.id);
    if (this._ignoreAdded) return false;
    const c = this._custom().find((x) => x.id === overlay);
    return (Array.isArray(o.add_to) && o.add_to.includes(overlay)) || !!(c && Array.isArray(c.devices) && c.devices.includes(item.id));
  },

  _mainKind(item) {
    if (item.bond) {
      const k = item.main_entity ? kindOf(item.main_entity, this._hass.states[item.main_entity]) : null;
      return k || (item.domain === "cover" ? "cover" : item.domain === "switch" ? "switch" : "light");
    }
    return kindOf(item.main_entity, this._hass.states[item.main_entity]);
  },

  /** Context the Network overlay needs: which placed devices are hubs, ZHA data. */
  _ctx(a) {
    const placed = new Set(Object.keys(a.devices || {}));
    const hubs = new Set();
    for (const d of Object.values(a.devices || {})) if (d.via && placed.has(d.via) && !(d.conns || []).includes("zigbee")) hubs.add(d.via);
    return { hubs, zha: (this._zha && this._zha.byIeee) || {} };
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** Marker specs for the current overlay. */
  _markers(a) {
    const ov = this._overlay;
    const out = [];
    if (ov === "plan" || !this._ovDef(ov)) return out;
    this._cx = this._ctx(a);
    this._skippedUnknown = 0;
    const name0 = (item) => this._dev(item.id).name || item.name;
    const fa = this._config.focus_area; // 0.13.9.13: a room cut-out shows only that room's devices
    for (const item of this._items(a)) {
      if (fa && this._roomOf(item, a) !== fa && !(item.area_id === fa && !this._roomOf(item, a))) continue;
      const isSel = this._pick && this._selId === item.id;
      if (this._hidden(item, ov)) {
        // 0.7.5: Edit markers: a selected marker hidden here is drawn faded, so changes can be seen.
        if (isSel) out.push(...this._selSpec(item, ov, name0(item)).map((x) => ({ ...x, ghost: true })));
        continue;
      }
      let sp = this._specsFor(item, ov, false);
      // Off / idle right now (Live hides it): while selected it shows as it looks when active.
      // (Appliances show their label instead, see _applHtml.)
      if (isSel && !sp.length && !((ov === "live" || ov === "lights") && this._applOf(item))) sp = this._selSpec(item, ov, name0(item)).map((x) => ({ ...x, on: true, dim: false, cls: "" }));
      out.push(...sp);
    }
    return this._robotSpecs(a, ov, out);
  },

  /** 0.10: robots. Live: a robot out cleaning is one marker at its live position instead of its usual one.
   *  Cleaning: every robot, live or at its dock. Health: a robot not placed by hand sits at its dock with its battery.
   *  A robot that does several floors shows only on the plan whose map it is using. Path and dock: _robotHtml. */
  _robotSpecs(a, ov, out) {
    this._rb = [];
    if (!["live", "cleaning", "health"].includes(ov)) return out;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    let items = null;
    for (const [eid, cfg] of Object.entries(a.robots || {})) {
      const st = this._hass.states[eid];
      if (!cfg || !st) continue;
      let d = rbRead(this._hass, eid, cfg);
      if (!rbOnMap(cfg.map, d)) continue;
      // 0.10: a robot without a map (or not aligned yet) shows where it is placed; that spot is its dock.
      if (!(Array.isArray(cfg.m) && cfg.m.length === 6)) d = { ...d, pos: null, dock: null, lines: [] };
      const active = RB_ACTIVE.includes(d.state);
      items = items || this._items(a);
      const placed = items.find((it) => !it.phantom && [it.main_entity, ...(it.entities || []), ...(it.allEntities || [])].includes(eid));
      const item = placed || { id: `robot:${eid}`, name: st.attributes.friendly_name || eid, main_entity: eid, entities: [eid] };
      if (placed && this._hidden(placed, ov)) continue;
      const info = this._rbInfo(eid, d);
      let at = null;
      if (ov === "live") {
        if (!active || !d.pos) continue;
        at = d.pos;
      } else if (ov === "health") {
        if (placed) continue; // placed by hand: Health shows it there, like any device
        at = d.dock || d.pos;
      } else at = active && d.pos ? d.pos : d.dock || d.pos;
      if (!at && !placed) continue;
      const p = at ? rbApply(cfg.m, at) : { x: placed.x, y: placed.y };
      let head = null;
      if (at === d.pos && active && d.pos.a != null) {
        const r = (d.pos.a * Math.PI) / 180;
        const q = rbApply(cfg.m, { x: d.pos.x + Math.cos(r), y: d.pos.y + Math.sin(r) });
        head = (Math.atan2(q.y - p.y, (q.x - p.x) * ratio) * 180) / Math.PI + 90;
      }
      const low = Number((this._config.health || {}).low ?? 20);
      let col = RB_COL[d.state] || RB_COL.idle;
      let badge = "";
      if (ov === "health") {
        col = info.err ? RB_COL.error : info.battery != null && info.battery <= low ? "255,160,0" : info.charging ? "67,160,71" : RB_COL.docked;
        badge = info.battery != null ? `${info.charging ? "⚡" : ""}${Math.round(info.battery)}%` : "";
      } else {
        if (rbOwn(a, eid)) col = rbOwn(a, eid); // which robot is which (state: tooltip, pulse and badge)
        if (ov === "cleaning" && (info.err || info.attn)) badge = "!";
      }
      const tone = info.err ? "err" : info.attn ? "warn" : "";
      this._rb.push({ eid, cfg, d, info, active });
      out = out.filter((x) => x.item.id !== item.id);
      // Name and icon from Edit markers, also for a robot that isn't placed (item robot:<entity>).
      const dev = this._dev(item.id);
      out.push({ type: "robot", kind: "appliance", key: `robot:${eid}`, item, eid, ents: [eid], name: dev.name || item.name, x: +p.x.toFixed(3), y: +p.y.toFixed(3), on: true, color: `rgb(${col})`, head, state: d.state, icon: this._per(item, ov).icon || dev.icon || st.attributes.icon || "mdi:robot-vacuum", badge, tone: ov === "health" ? "" : tone, tip: this._rbTip(st, d, info, a, cfg) });
    }
    return out;
  },

  /** Everything the robot's device tells (HA's entity list): battery, consumables, dock, last run, error. Generic: names and units. */
  _rbInfo(eid, d) {
    const h = this._hass;
    const vs = h.states[eid];
    const devId = h.entities && h.entities[eid] && h.entities[eid].device_id;
    const ents = devId ? Object.values(h.entities).filter((e) => e.device_id === devId).map((e) => e.entity_id) : [eid];
    const name = (e) => {
      const fn = String((h.states[e] && h.states[e].attributes.friendly_name) || e);
      const dn = String((vs && vs.attributes.friendly_name) || "");
      return fn.startsWith(dn + " ") ? fn.slice(dn.length + 1) : fn;
    };
    let battery = vs && num(vs.attributes.battery_level) ? Number(vs.attributes.battery_level) : null;
    let charging = false;
    const parts = {};
    const station = [];
    const last = {};
    // How it cleans: suction, water, mode (attributes and select entities of the robot).
    const settings = [];
    if (vs && vs.attributes.fan_speed != null && vs.attributes.fan_speed !== "") settings.push(String(vs.attributes.fan_speed));
    let err = d.state === "error" ? String((vs && (vs.attributes.error || vs.attributes.status)) || "") || "\u0000" : "";
    const OK = /^(ok|normal|none|no_error|no error|idle|off|installed|not_full|0|false|unknown|unavailable|completed|clean|good)$/i;
    for (const e of ents) {
      const st = h.states[e];
      if (!st || e === eid) continue;
      const dc = st.attributes.device_class;
      const unit = st.attributes.unit_of_measurement;
      const id = e.split(".")[1];
      if (domainOf(e) === "sensor" && dc === "battery" && num(st.state)) battery = Number(st.state);
      else if (domainOf(e) === "binary_sensor" && dc === "battery_charging") charging = st.state === "on";
      else if (/charging_status|charge_state|charging_state/.test(id) && /^(charging)$/i.test(st.state)) charging = true;
      else if (domainOf(e) === "sensor" && /(brush|filter|sensor_dirty|dirty_sensor|mop_pad|_mop|pad|blade|squeegee|consumable|detergent|dust_bag)/.test(id) && /(left|remaining|life|time_left|wear)/.test(id) && num(st.state) && ["%", "h", "min", "s"].includes(unit)) {
        const key = id.replace(/_(time_left|time_remaining|left|remaining|life_level|life|wear)$/, "");
        const v = Number(st.state);
        const hrs = unit === "h" ? v : unit === "min" ? v / 60 : unit === "s" ? v / 3600 : null;
        const prev = parts[key];
        if (prev && prev.pct != null && unit !== "%") continue;
        parts[key] = { e, name: name(e).replace(/\s*(time left|left|remaining|life|level)$/i, ""), pct: unit === "%" ? v : null, txt: unit === "%" ? `${Math.round(v)}%` : `${Math.round(hrs)} h`, low: unit === "%" ? v <= 10 : hrs <= 10 };
      } else if (/(last_clean|last_cleaning)_?(end|start|begin|time)?$|last_clean_(end|start|begin)/.test(id) && dc === "timestamp") last.t = last.t && last.t > st.state ? last.t : st.state;
      else if (/(cleaning_time|clean_time|cleaning_duration|last_clean_duration)/.test(id) && num(st.state)) last.dur = this._fmt(e);
      else if (/(cleaned_area|cleaning_area|clean_area|last_clean_area)/.test(id) && num(st.state)) last.area = this._fmt(e);
      else if (/(dust_bag|dustbin|bin_full|water_tank|clean_water|dirty_water|water_box|station|dock|self_clean|drainage|detergent|mop_pad_status|mop_status)/.test(id) && ((domainOf(e) === "binary_sensor" && dc === "problem" && st.state === "on") || (domainOf(e) === "sensor" && !num(st.state) && /(full|empty|lack|missing|not_installed|dirty|low|shortage|no_water|error)/i.test(st.state) && !OK.test(st.state)))) station.push({ e, name: name(e), txt: this._fmt(e) });
      else if (/(^|_)error$|_error_|fault/.test(id) && domainOf(e) === "sensor" && !OK.test(st.state) && d.state === "error") err = this._fmt(e);
      else if (["select", "input_select"].includes(domainOf(e)) && /(fan|suction|water|mop|mode|route|intensity)/.test(id) && !/(^unknown|unavailable)$/.test(st.state) && settings.length < 4) settings.push(this._fmt(e));
    }
    if (d.state === "docked" && battery != null && battery < 100 && !charging) charging = true;
    const cons = Object.values(parts);
    return { battery, charging, cons, station, last, err, settings: [...new Set(settings)], attn: cons.some((c) => c.low) || station.length > 0 };
  },

  /** Hover line: state, room and battery, or the robot's own error text. */
  _rbTip(st, d, info, a, cfg) {
    const word = { cleaning: dfT("robot.cleaning"), returning: dfT("robot.returning"), paused: dfT("robot.paused"), error: dfT("robot.error"), docked: info.charging ? dfT("robot.charging") : dfT("robot.docked"), idle: dfT("robot.idle") }[d.state] || this._fmt(st.entity_id);
    if (info.err) return info.err === "\u0000" ? word : `${word}: ${info.err}`;
    const room = this._rbRoom(a, cfg, d);
    return [word, room, info.battery != null ? `${dfT("battery")} ${Math.round(info.battery)}%` : ""].filter(Boolean).join(" · ");
  },

  /** The room the robot is in: where it is on the plan's room shapes. */
  _rbRoom(a, cfg, d) {
    if (!RB_ACTIVE.includes(d.state)) return "";
    const seg = d.room != null && (cfg.seg || {})[d.room];
    if (seg && (a.areas || {})[seg]) return (this._rooms().names || {})[seg] || a.areas[seg].name;
    if (!d.pos || !Array.isArray(cfg.m)) return "";
    const p = rbApply(cfg.m, d.pos);
    const hit = Object.entries(a.areas || {}).find(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3 && inPoly(p.x, p.y, r.shape));
    return hit ? (this._rooms().names || {})[hit[0]] || hit[1].name : "";
  },

  /** "just now", "5 min ago", "2 d ago". */
  _agoTxt(t) {
    const x = this._ageTxt(t);
    return x === dfT("time.just_now") || !x ? x : dfT("time.ago", { t: x });
  },

  _ageTxt(t) {
    const ms = this._now() - new Date(t).getTime();
    if (!t || !(ms >= 0)) return "";
    const m = Math.round(ms / 60000);
    if (m < 60) return m < 2 ? dfT("time.just_now") : dfT("unit.min", { n: m });
    const hrs = Math.round(m / 60);
    return hrs < 24 ? dfT("unit.h", { n: hrs }) : dfT("unit.d", { n: Math.round(hrs / 24) });
  },

  /** A robot's name on the card: from Edit markers (placed or not), else its HA name. */
  _rbLabel(a, eid) {
    const placed = this._items(a).find((it) => !it.phantom && [it.main_entity, ...(it.entities || [])].includes(eid));
    const st = this._hass.states[eid];
    return this._dev(placed ? placed.id : `robot:${eid}`).name || (st && st.attributes.friendly_name) || eid;
  },

  /** Days between cleanings of a room (plan setting per room, else the plan's default; 0 = never due). */
  _pace(a, id) {
    const v = (a.pace || {})[id] ?? a.pace_default ?? (this._config.cleaning || {}).overdue ?? 7;
    return Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 7;
  },

  /** 0.10: rooms tinted by how long ago a robot cleaned them (a layer of Cleaning; tap a room to clean it). */
  _freshHtml(a) {
    if (this._overlay !== "cleaning" || !this._layerOn("cleaning", "fresh", true)) return "";
    const polys = Object.entries(a.areas || {}).filter(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3).map(([id, r]) => {
      const c = (a.cleaned || {})[id];
      const days = c && c.t ? (Date.now() - new Date(c.t).getTime()) / 86400000 : null;
      // Smooth: fresh green fades out by 60% of the room's pace, amber grows once it is due.
      const pace = this._pace(a, id);
      const f = days == null ? null : pace ? days / pace : days / 7;
      const nw = (a.now || {})[id];
      // Full strength here; the slider (or the card setting) sets how strongly the whole layer shows.
      const fill = nw ? "rgba(33,150,243,.55)" : f == null ? "rgba(0,0,0,0)" : f < 0.6 ? `rgba(76,175,80,${(0.85 * (1 - f / 0.6)).toFixed(3)})` : pace && f >= 1 ? `rgba(255,152,0,${Math.min(0.85, 0.45 + 0.4 * (f - 1)).toFixed(3)})` : "rgba(0,0,0,0)";
      return `<polygon data-croom="${cesc(id)}" points="${r.shape.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:${fill}"></polygon>`;
    }).join("");
    return `<svg class="fresh" viewBox="0 0 100 100" preserveAspectRatio="none" style="opacity:${this._cleanOp() / 100}">${polys}</svg>`;
  },

  /** 0.10: the cleaning path (a layer, always blue) and the dock of each robot; the dock is green while charging. */
  _robotHtml() {
    if (!(this._rb || []).length || this._overlay === "health") return "";
    const path = this._layerOn(this._overlay, "rpath", true);
    let svg = "";
    let html = "";
    for (const r of this._rb) {
      if (path && (r.active || this._overlay === "cleaning")) {
        for (const line of r.d.lines) {
          const step = Math.max(1, Math.ceil(line.length / 1500));
          const pts = line.filter((_p, i) => i % step === 0 || i === line.length - 1).map((p0) => rbApply(r.cfg.m, p0)).map((p0) => `${p0.x.toFixed(2)},${p0.y.toFixed(2)}`).join(" ");
          const own = rbOwn(this._a, r.eid);
          svg += `<polyline points="${pts}"${own ? ` style="stroke:rgb(${own});opacity:.7"` : ""}></polyline>`;
        }
      }
      if (r.d.dock) {
        const p = rbApply(r.cfg.m, r.d.dock);
        const chg = r.info.charging && r.d.state === "docked";
        const warn = this._overlay === "cleaning" && r.info.station.length ? `<i class="rdw" title="${cesc(r.info.station.map((x) => `${x.name}: ${x.txt}`).join(", "))}"></i>` : "";
        html += `<div class="rdock ${chg ? "chg" : ""}" style="left:${p.x.toFixed(3)}%;top:${p.y.toFixed(3)}%"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon>${warn}</div>`;
      }
    }
    return `${svg ? `<svg class="rpath" viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>` : ""}${html}`;
  },

  _robotMarker(s) {
    const pulse = ["error", "paused"].includes(s.state) && this._overlay !== "health" ? s.state : "";
    const badge = s.badge ? `<span class="rbg ${s.tone}">${cesc(s.badge)}</span>` : "";
    return `<button class="m robot on ${pulse} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name} · ${s.tip}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${s.head != null ? `<i class="rhd" style="transform:rotate(${s.head.toFixed(1)}deg)"></i>` : ""}</span>${badge}<span class="tip">${cesc(s.name)}<span class="tst"> · ${cesc(s.tip)}</span></span></button>`;
  },

  /** 0.10: the robot panel (tap on a robot): state, last run, consumables, dock, and start / pause / dock. */
  _robotPop(p) {
    const a = this._a || {};
    const eid = p.eid;
    const st = this._hass.states[eid];
    if (!st) return "";
    const cfg = (a.robots || {})[eid] || {};
    const d = rbRead(this._hass, eid, cfg);
    const info = this._rbInfo(eid, d);
    const name = st.attributes.friendly_name || eid;
    const col = RB_COL[d.state] || RB_COL.idle;
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    const mine = Object.values(a.cleaned || {}).filter((c) => c.by === eid).map((c) => c.t).sort().pop();
    const lastT = info.last.t || mine;
    const rows = [];
    if (lastT) rows.push([dfT("robot.last_cleaning"), this._agoTxt(lastT)]);
    if (info.last.dur) rows.push([dfT("robot.took"), info.last.dur]);
    if (info.last.area) rows.push([RB_ACTIVE.includes(d.state) ? dfT("robot.this_run") : dfT("robot.area"), info.last.area]);
    if (info.settings.length) rows.push([dfT("robot.settings"), info.settings.join(" · ")]);
    if (info.battery != null) rows.push([dfT("battery"), `${Math.round(info.battery)}%${info.charging ? ` · ${dfT("robot.charging_l")}` : ""}`]);
    const cons = info.cons.length ? `<h4>${dfT("robot.consumables")}</h4>${info.cons.map((c) => `<button class="rbc ${c.low ? "low" : ""}" data-mi="${cesc(c.e)}"><span>${cesc(c.name)}</span>${c.pct != null ? `<i style="--p:${Math.max(0, Math.min(100, c.pct))}%"></i>` : "<i class='n'></i>"}<b>${cesc(c.txt)}</b></button>`).join("")}` : "";
    const dock = info.station.length ? `<h4>${dfT("robot.dock")}</h4>${info.station.map((x) => `<button class="rbc low" data-mi="${cesc(x.e)}"><span>${cesc(x.name)}</span><i class="n"></i><b>${cesc(x.txt)}</b></button>`).join("")}` : "";
    const cmd = (c, icon, label) => `<button data-rbcmd="${c}" data-rb="${cesc(eid)}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    const btns = d.state === "cleaning" ? cmd("pause", "mdi:pause", dfT("robot.pause")) + cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")) : cmd("start", "mdi:play", d.state === "paused" ? dfT("robot.continue") : dfT("robot.start")) + (d.state === "docked" ? "" : cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")));
    return `<div class="pop"><div class="popin rbpop" role="dialog" aria-label="${cesc(name)}"><h3><ha-icon icon="${cesc(st.attributes.icon || "mdi:robot-vacuum")}" style="color:rgb(${col})"></ha-icon>${cesc(name)}${close}</h3>
      <div class="rbst" style="--c:rgb(${col})">${cesc(this._rbTip(st, d, info, a, cfg))}</div>
      ${rows.length ? `<div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>` : ""}${cons}${dock}
      <div class="rbcmds">${btns}</div><button class="more" data-mi="${cesc(eid)}">${dfT("details_more")}</button></div></div>`;
  },

  /** 0.10: tap a room in Cleaning: when it was cleaned, and "Clean this room" (vacuum.clean_area, HA 2026.3). */
  _roomPop(p) {
    const a = this._a || {};
    const room = (a.areas || {})[p.area];
    if (!room) return "";
    const name = (this._rooms().names || {})[p.area] || room.name;
    const c = (a.cleaned || {})[p.area];
    const by = c && this._hass.states[c.by] ? this._hass.states[c.by].attributes.friendly_name : "";
    const when = c && c.t ? (by ? dfT("clean.cleaned_by", { t: this._agoTxt(c.t), by }) : dfT("clean.cleaned", { t: this._agoTxt(c.t) })) : dfT("clean.none_yet");
    const ref = (a.room_area || {})[p.area];
    const cov = c && c.m2 != null ? `${c.m2} m²${c.pct != null ? ` (${c.pct}%)` : ""}` : "";
    const pace = this._pace(a, p.area);
    const daysAgo = c && c.t ? (Date.now() - new Date(c.t).getTime()) / 86400000 : null;
    const due = !pace ? dfT("clean.never") : daysAgo == null ? dfT("clean.every_d", { n: pace }) : daysAgo >= pace ? dfT("clean.now") : dfT("clean.in_d", { n: Math.max(1, Math.round(pace - daysAgo)) });
    // Visits of the last runs (the integration logs when a robot enters and leaves a room); one run = one clean.
    const runs = [];
    for (const v of ((a.clean_log || {})[p.area] || []).slice().sort((x, y) => (x.s < y.s ? -1 : 1))) {
      const s0 = new Date(v.s).getTime();
      const e0 = new Date(v.e).getTime();
      const last = runs[runs.length - 1];
      if (last && s0 - last.e < 45 * 60000) {
        last.e = e0;
        last.d += e0 - s0;
      } else runs.push({ s: s0, e: e0, d: e0 - s0 });
    }
    const week = runs.filter((r) => Date.now() - r.s < 7 * 86400000).length;
    const ds = runs.slice(-10).map((r) => r.d).sort((x, y) => x - y);
    const usual = ds.length ? Math.max(1, Math.round(ds[Math.floor(ds.length / 2)] / 60000)) : 0;
    const kv = [];
    const nw = (a.now || {})[p.area];
    if (nw) kv.push([dfT("clean.cleaning_now"), nw.m2 != null ? `${nw.m2} m²${nw.pct != null ? ` (${nw.pct}%)` : ""}` : dfT("yes")]);
    if (cov) kv.push([dfT("clean.last_time"), cov]);
    if (runs.length) kv.push([dfT("clean.last7"), week ? `${week}×` : dfT("clean.not_cleaned")]);
    if (usual) kv.push([dfT("clean.usually_takes"), dfT("unit.min", { n: usual })]);
    if (ref && ref.a && ref.n >= 2) kv.push([dfT("clean.robot_usually"), `${Math.round(ref.a)} m²`]);
    if (c && c.t) kv.push([dfT("clean.due"), due]);
    const stats = kv.length ? `<div class="kv">${kv.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>` : "";
    const robots = Object.entries(a.robots || {}).filter(([e]) => this._hass.states[e]);
    const can = robots.filter(([e]) => Number(this._hass.states[e].attributes.supported_features || 0) & CLEAN_AREA);
    const btns = can.filter(([, r]) => Object.values(r.seg || {}).includes(p.area)).map(([e]) => `<button class="pri" data-cleanroom="${cesc(p.area)}" data-rb="${cesc(e)}"><ha-icon icon="mdi:robot-vacuum"></ha-icon>${can.length > 1 ? dfT("clean.now_with", { r: cesc(this._hass.states[e].attributes.friendly_name || e) }) : dfT("clean.clean_now")}</button>`).join("");
    const hint = btns ? "" : can.length ? dfT("clean.map_hint") : robots.length ? dfT("clean.cant_room") : "";
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(name)}"><h3>${cesc(name)}${close}</h3><div>${cesc(when)}</div>${stats}${hint ? `<div class="rbhint">${cesc(hint)}</div>` : ""}${btns ? `<div class="acts">${btns}</div>` : ""}</div></div>`;
  },

  /** Does this item show up in this overlay at all (ignoring its current state)? Used by the editor (#52). */
  _qualifies(item, ov, a) {
    if (ov === "plan") return false;
    if (!this._cx && a) this._cx = this._ctx(a);
    try {
      return this._specsFor(item, ov, true).length > 0;
    } catch (_e) {
      return false;
    }
  },

  /** Card settings of one device in one overlay (#100/#101): { lead, extras, icon, tap }. */
  /** 0.11: each camera its own colour (dot, line, picture border), stable: by its place among the plan's cameras. */
  _camColor(s) {
    const ids = this._a ? this._items(this._a).filter((it) => this._camOf(it)).map((it) => it.id).sort() : [];
    return E_COLORS[Math.max(0, ids.indexOf(s.item.id)) % E_COLORS.length];
  },

  /** 0.11 Live camera, layer 3: a small dot where the camera is (spread like any marker). */
  _camHtml(s) {
    return `<button class="m camdot ${edgeCls(s.x, s.y, this._em)}" style="left:${s.x}%;top:${s.y}%;background:${this._camColor(s)}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(s.name)}"><span class="tip">${cesc(s.name)}</span></button>`;
  },

  /** 0.13.1: live video windows: one Home Assistant camera player per camera, kept between redraws and moved into
   *  its window in the same task (so the stream keeps playing); dropped when its window is gone. */
  _attachVids() {
    // The players live in the card's own (light) DOM and are shown in their window through a <slot>: a redraw of the
    // card never detaches them, so a stream isn't restarted on every state change.
    const want = new Set();
    for (const ph of this.shadowRoot.querySelectorAll(".cvid[data-vid]")) {
      const eid = ph.dataset.vid;
      const st = this._hass.states[eid];
      if (!st) continue;
      want.add(eid);
      let v = [...this.children].find((n) => n.localName === "ha-camera-stream" && n.dataset.vid === eid);
      if (!v) {
        v = document.createElement("ha-camera-stream");
        v.dataset.vid = eid;
        v.slot = vidSlot(eid);
        v.muted = true;
        v.controls = false;
        v.allowExoPlayer = false;
        this.appendChild(v);
      }
      v.hass = this._hass;
      if (!v.stateObj || v.stateObj.last_updated !== st.last_updated) v.stateObj = st; // a new object only when it changed
    }
    for (const n of [...this.children]) if (n.localName === "ha-camera-stream" && !want.has(n.dataset.vid)) n.remove();
  },

  /** Layer 4, windows: camera pictures. Placed by _placeWins() after the markers, next to their dot. */
  _winHtml() {
    if (this._overlay !== "live" && this._overlay !== "security") return "";
    const cams = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.cam && sp.win);
    if (!cams.length) return "";
    clearTimeout(this._snapT);
    this._snapT = setTimeout(() => this._update(true), 10000); // a fresh still every 10 s
    const tick = Math.floor(Date.now() / 10000);
    return `<div class="wins">${cams.map((sp) => {
      const pic = this._hass.states[sp.eid] && this._hass.states[sp.eid].attributes.entity_picture;
      // 0.13.1: "Shows: live video" uses Home Assistant's own camera player (kept across redraws, see _attachVids).
      const vid = this._per(sp.item, "live").video === "live";
      const src = pic && !vid ? `${pic}${pic.includes("?") ? "&" : "?"}_=${tick}` : "";
      // Readings in the name bar: what you picked under Also show; automatically only a low battery.
      const lowAt = Number(this._ov("health").low ?? 20);
      const isLow = (e) => {
        const st = this._hass.states[e];
        return !!st && st.attributes.device_class === "battery" && Number(st.state) < lowAt;
      };
      let rd = (sp.extras || []).filter((x) => domainOf(x.eid) !== "camera");
      if (!Array.isArray(this._per(sp.item, "live").extras)) {
        const bat = [...new Set([...(sp.item.entities || []), ...(sp.item.allEntities || [])])].find(isLow);
        rd = bat ? [{ eid: bat, text: this._extraText(bat), icon: null }] : [];
      }
      // 0.11: at most two readings on a picture (the editor stops at two), in the order picked; never cut, they
      // shrink with "…". "22.0 °C" → "22 °C".
      const ord = rd.slice(0, 2);
      const pill = (x) => {
        const t = String(x.text).replace(/(\d)\.0(?=\D|$)/, "$1");
        return `<span class="${isLow(x.eid) ? "lo" : ""}" title="${cesc(t)}">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}<b>${cesc(t)}</b></span>`;
      };
      const rds = ord.length ? `<span class="crd">${ord.map(pill).join("")}</span>` : "";
      const last = (this._camLast = this._camLast || {})[sp.key];
      this._camLast[sp.key] = src;
      return `<div class="cwin" data-wk="${cesc(sp.key)}" data-c="${this._camColor(sp)}" role="button" aria-label="${cesc(sp.name)}" style="border-color:${this._camColor(sp)};${last ? `background:#222 url('${cesc(last)}') center/cover` : ""}">${vid ? `<div class="cvid" data-vid="${cesc(sp.eid)}"><slot name="${cesc(vidSlot(sp.eid))}"></slot></div>` : src ? `<img alt="" src="${cesc(src)}">` : ""}${rds}<span class="cnm"><span class="cn">${cesc(sp.name)}</span>${sp.trig ? `<button class="cx" data-camx="${cesc(sp.trig)}" aria-label="${dfT("close")}">×</button>` : ""}</span></div>`;
    }).join("")}</div>`;
  },

  /** After the markers are laid out: each window next to its marker's final spot (above-right; left / below
   *  near the edges), clear of the other windows; an elbow line joins them. Returns the SVG lines. */
  _placeWins(box, W, H) {
    let out = "";
    // Appliance status (layer 4): a line from each appliance up to its status pill.
    const br = box.getBoundingClientRect();
    for (const pill of box.querySelectorAll(".applbl[data-anc]")) {
      const pr = pill.getBoundingClientRect();
      if (!pr.width) continue;
      const bx = pr.left - br.left + pr.width / 2;
      const by = pr.bottom - br.top;
      for (const a of pill.dataset.anc.split(";")) {
        const [ax0, ay0, ...rgb] = a.split(",");
        const c = rgb.join(",");
        const ax = (Number(ax0) / 100) * W;
        const ay = (Number(ay0) / 100) * H;
        const r = Math.min(10, Math.abs(ay - by), Math.abs(bx - ax));
        const sx = Math.sign(bx - ax);
        out += `<path class="elbow" style="stroke:rgb(${c})" d="M${ax},${ay} L${ax},${by + r} Q${ax},${by} ${ax + sx * r},${by} L${bx},${by}"/>`;
      }
    }
    const placed = [];
    // 0.11.1: windows may sit in the frame around the plan (Frame: space around it), not only on the plan.
    const fe = box.parentElement && box.parentElement.classList.contains("fr") ? box.parentElement.getBoundingClientRect() : br;
    const lim = { x0: fe.left - br.left, y0: fe.top - br.top, x1: fe.right - br.left, y1: fe.bottom - br.top };
    // 0.11.1: one size for every camera window of the card (S / M / L); "strip": all in one row like film.
    const camCfg = this._config.cameras || {};
    const [cmax, cshare] = CAM_SIZES[camCfg.cam_size] || CAM_SIZES.m;
    let ww = Math.min(cmax, W * cshare);
    let wh = ww * 0.5625;
    const wins = [...box.querySelectorAll(".cwin")];
    if (camCfg.cam_layout === "strip" && wins.length) return out + this._placeStrip(box, wins, W, H, lim, ww);
    for (const win of wins) {
      const dot = box.querySelector(`[data-k="${CSS.escape(win.dataset.wk)}"]`);
      if (!dot) continue;
      const cx = parseFloat(dot.style.left) || 0;
      const cy = parseFloat(dot.style.top) || 0;
      // 0.11.1: a window moved by hand stays where it was put (centre, % of the plan); the line follows.
      const pos = this._winPos(win.dataset.wk);
      let left = cx > W * 0.62;
      let up = cy > wh + 40;
      let x = left ? cx - 28 - ww : cx + 28;
      let y = up ? cy - 40 - wh : cy + 40;
      if (pos) {
        x = (pos.x / 100) * W - ww / 2;
        y = (pos.y / 100) * H - wh / 2;
        left = x + ww / 2 < cx;
      } else for (let i = 0; i < 6 && placed.some((p) => x < p.x + p.w + 8 && x + ww + 8 > p.x && y < p.y + p.h + 8 && y + wh + 8 > p.y); i++) y += up ? -(wh + 8) : wh + 8;
      win.classList.toggle("dr", this._winDraggable());
      win.classList.toggle("drag", !!(this._winDrag && this._winDrag.key === win.dataset.wk));
      x = Math.max(lim.x0 + 2, Math.min(lim.x1 - ww - 2, x));
      y = Math.max(lim.y0 + 2, Math.min(lim.y1 - wh - 2, y));
      up = y + wh / 2 < cy;
      placed.push({ x, y, w: ww, h: wh });
      Object.assign(win.style, { left: `${x}px`, top: `${y}px`, width: `${ww}px`, height: `${wh}px` });
      // Elbow: vertical from the dot, then horizontal into the window's side, rounded corner.
      const ey = y + wh / 2;
      const ex = left ? x + ww : x;
      const r = Math.min(14, Math.abs(ey - cy), Math.abs(ex - cx)); // rounded like the Energy lines
      const sy = ey < cy ? -1 : 1;
      const sx = ex < cx ? -1 : 1;
      out += `<path class="elbow" style="stroke:${win.dataset.c || "#26a69a"}" d="M${cx},${cy} L${cx},${ey - sy * r} Q${cx},${ey} ${cx + sx * r},${ey} L${ex},${ey}"/>`;
    }
    // Snap guides while dragging (same height / same column as another window).
    const g = this._winDrag && this._winDrag.guide;
    if (g && g.y != null) out += `<line class="wguide" x1="0" y1="${(g.y / 100) * H}" x2="${W}" y2="${(g.y / 100) * H}"/>`;
    if (g && g.x != null) out += `<line class="wguide" x1="${(g.x / 100) * W}" y1="0" x2="${(g.x / 100) * W}" y2="${H}"/>`;
    return out;
  },

  /** 0.11.1: the camera strip: every window in one row (film), in the frame space below or above the plan when
   *  there is room (else along the plan's bottom), ordered like their cameras left → right so lines stay short.
   *  Each frame and its dot share the camera's colour; a line only on hover or while the camera has an event. */
  _placeStrip(box, wins, W, H, lim, ww0) {
    const gap = 8;
    const below = lim.y1 - H;
    const above = -lim.y0;
    const room = Math.max(below, above);
    const items = wins.map((win) => {
      const dot = box.querySelector(`[data-k="${CSS.escape(win.dataset.wk)}"]`);
      return { win, cx: dot ? parseFloat(dot.style.left) || 0 : 0, cy: dot ? parseFloat(dot.style.top) || 0 : 0, dot: !!dot };
    }).sort((a, b) => a.cx - b.cx);
    const n = items.length;
    const availW = lim.x1 - lim.x0 - 16;
    let ww = Math.min(ww0, (availW - (n - 1) * gap) / n);
    let wh = ww * 0.5625;
    const inFrame = room >= 48;
    if (inFrame && wh > room - 20) {
      wh = room - 20;
      ww = wh / 0.5625;
    }
    const band = wh + 16;
    const y = inFrame ? (below >= above ? H + (below - wh) / 2 : lim.y0 + (above - wh) / 2) : H - wh - 10;
    const total = n * ww + (n - 1) * gap;
    let x = lim.x0 + (lim.x1 - lim.x0 - total) / 2;
    const x0 = x - 10;
    // The film: a dark band with sprocket holes along both edges.
    let out = `<rect class="film" x="${x0}" y="${y - 8}" width="${total + 20}" height="${band}" rx="8"/><line class="holes" x1="${x0 + 8}" y1="${y - 4}" x2="${x0 + total + 12}" y2="${y - 4}"/><line class="holes" x1="${x0 + 8}" y1="${y + wh + 4}" x2="${x0 + total + 12}" y2="${y + wh + 4}"/>`;
    const lines = [];
    for (const it of items) {
      const key = it.win.dataset.wk;
      Object.assign(it.win.style, { left: `${x}px`, top: `${y}px`, width: `${ww}px`, height: `${wh}px` });
      it.win.classList.remove("dr", "drag");
      if (it.dot) {
        const sp = this._specs && this._specs.get(key);
        const on = (sp && sp.trig) || this._winHover === key;
        const ex = x + ww / 2;
        const ey = y > it.cy ? y - 8 : y + wh + 8; // the band's edge facing the camera
        const my = (it.cy + ey) / 2;
        lines.push(`<path class="elbow sl ${on ? "on" : ""} ${sp && sp.trig ? "ev" : ""}" data-wl="${cesc(key)}" style="stroke:${it.win.dataset.c || "#26a69a"}" d="M${it.cx},${it.cy} L${it.cx},${my} L${ex},${my} L${ex},${ey}"/>`);
      }
      x += ww + gap;
    }
    out += lines.join("");
    return out;
  },

  /** 0.11.1: where a camera window was put by hand (its centre, % of the plan), if it was. */
  _winPos(key) {
    if (this._winDrag && this._winDrag.key === key) return this._winDrag;
    const sp = this._specs && this._specs.get(key);
    if (!sp || !sp.item) return null;
    const id = sp.item.id;
    if (!this._onWinMove) {
      this._winLoad();
      const st = this._winSt && this._winSt[id];
      if (st === 0) return null;
      if (st && Number.isFinite(st.x) && Number.isFinite(st.y)) return st;
    }
    const w = this._dev(id).win;
    return w && Number.isFinite(w.x) && Number.isFinite(w.y) ? w : null;
  },

  /** Camera windows can be moved in the Card Editor, and on the dashboard by admins (saved in the card). */
  _winDraggable() {
    if ((this._config.cameras || {}).cam_layout === "strip") return false; // the strip places them itself
    if (this._onWinMove) return true;
    return !this.preview && !this._editMode && !!(this._hass && this._hass.user && this._hass.user.is_admin);
  },

  /** Drag a camera window: it snaps to the height or the column of another window; dropped on its own camera dot,
   *  it goes back to its automatic spot. */
  _winDragStart(e, win) {
    const box = this.shadowRoot.querySelector(".box");
    const sp = this._specs && this._specs.get(win.dataset.wk);
    if (!box || !sp) return;
    const br = box.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    const key = win.dataset.wk;
    const fe = box.parentElement && box.parentElement.classList.contains("fr") ? box.parentElement.getBoundingClientRect() : br;
    const pxX = (v) => ((v - br.left) / br.width) * 100;
    const pxY = (v) => ((v - br.top) / br.height) * 100;
    const lim = { x0: pxX(fe.left), x1: pxX(fe.right), y0: pxY(fe.top), y1: pxY(fe.bottom) };
    // The other windows' centres (fixed while dragging), in %.
    const others = [...box.querySelectorAll(".cwin")].filter((w) => w.dataset.wk !== key).map((w) => {
      const r = w.getBoundingClientRect();
      return { x: ((r.left + r.width / 2 - br.left) / br.width) * 100, y: ((r.top + r.height / 2 - br.top) / br.height) * 100 };
    });
    const dx = e.clientX - (wr.left + wr.width / 2);
    const dy = e.clientY - (wr.top + wr.height / 2);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let raf = 0;
    const SNAP = 1.6; // % of the plan
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      let x = ((ev.clientX - dx - br.left) / br.width) * 100;
      let y = ((ev.clientY - dy - br.top) / br.height) * 100;
      const guide = {};
      const nx = others.reduce((b, o) => (Math.abs(o.x - x) < Math.abs((b ?? 1e9) - x) ? o.x : b), null);
      const ny = others.reduce((b, o) => (Math.abs(o.y - y) < Math.abs((b ?? 1e9) - y) ? o.y : b), null);
      if (nx != null && Math.abs(nx - x) < SNAP) x = guide.x = nx;
      if (ny != null && Math.abs(ny - y) < SNAP * (br.width / br.height)) y = guide.y = ny;
      this._winDrag = { key, x: Math.max(lim.x0, Math.min(lim.x1, x)), y: Math.max(lim.y0, Math.min(lim.y1, y)), guide };
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        this._layout();
      });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      this._winMoved = Date.now(); // the click after a drag doesn't open the camera
      const d = this._winDrag;
      this._winDrag = null;
      const dn = this.shadowRoot.querySelector(`.box [data-k="${CSS.escape(key)}"]`); // fresh: the card may have redrawn
      const dr = dn && dn.getBoundingClientRect();
      const home = dr && Math.hypot(ev.clientX - (dr.left + dr.width / 2), ev.clientY - (dr.top + dr.height / 2)) < 30;
      this._winSave(sp.item.id, home ? null : { x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  },

  /** 0.14.2: a window moved on the dashboard is kept in Device Floorplan's own storage (per card), never in the
   *  dashboard. In the Card Editor it goes into the card's settings, saved the Home Assistant way. */
  _winSave(id, pos) {
    if (this._onWinMove) {
      this._winStore(id, undefined); // the editor's choice replaces one made on the dashboard
      return this._onWinMove(id, pos);
    }
    this._winStore(id, pos || 0); // 0 = back at its automatic spot
    this._update(true);
  },

  /** Stored windows of this card: { device id: {x, y} | 0 }. */
  _winLoad() {
    if (this._winSt || this._winLoading || !this._hass) return;
    this._winLoading = true;
    this._hass
      .callWS({ type: "device_floorplan/card_state/get" })
      .then((r) => {
        this._winSt = (r && r.card_state && r.card_state[`win_${this._lsKey()}`]) || {};
        this._update(true);
      })
      .catch(() => {
        this._winSt = {}; // older backend: the card's own settings only
      });
  },

  _winStore(id, v) {
    const cur = { ...(this._winSt || {}) };
    if (v === undefined) {
      if (!(id in cur)) return;
      delete cur[id];
    } else cur[id] = v;
    this._winSt = cur;
    this._hass
      .callWS({ type: "device_floorplan/card_state/set", key: `win_${this._lsKey()}`, value: Object.keys(cur).length ? cur : null })
      .catch(() => this._toast(dfT("save.cam_failed")));
  },

  /** 0.11: the device's camera entity, if it has one. */
  _camOf(item) {
    // A device is a camera only when its main entity is one: a tablet's or a robot's map "camera" doesn't count.
    // Or when you pick the camera as what leads in Live (a doorbell whose main entity is its button).
    // test9: any camera entity of the device counts (a doorbell whose main entity is its button), never a map;
    // what you picked to lead in Live still wins (pick something else and the device is no camera there).
    const lead = (this._dev(item.id).per || {}).live?.lead;
    const ok = (e) => !!e && domainOf(e) === "camera" && !!this._hass.states[e] && !/map|valetudo|xiaomi_cloud_map/i.test(e);
    if (lead && this._hass.states[lead]) return ok(lead) ? lead : null;
    return [item.main_entity, ...(item.entities || [])].find(ok) || null;
  },

  /** What brings a device into Live: the picked trigger, else (cameras) its own motion / person / ring sensor. */
  _liveWhen(item) {
    const p = this._per(item, "live");
    const cam = this._camOf(item);
    if (cam && (p.popup === "off" || p.popup === false)) return null; // "Pop up on events" off: only with Layers → Cameras
    if (p.when && this._hass.states[p.when]) return p.when;
    // 0.12.6: a device you add to Live shows as itself and stays (no 30 s flash); "Show in Live when…" is the trigger.
    if (!cam) return null;
    const ents = [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    return ents.find((e) => {
      const st = this._hass.states[e];
      if (!st) return false;
      const dc = st.attributes.device_class;
      if (domainOf(e) === "event") return ["doorbell", "motion"].includes(dc) || /ring|ding|doorbell|motion|person/.test(e);
      return domainOf(e) === "binary_sensor" && (MOTION_DC.has(dc) || (!dc && /motion|presence|occupancy|person|ring|ding|doorbell|visitor/.test(e)));
    }) || null;
  },

  /** Closed with ✕ during this trigger event (opens again on the next one; per screen). */
  /** 0.13.1: a trigger seen on while this card is open (for "Stays open: until I close it"). */
  _trigMark(e) {
    const st = this._hass.states[e];
    if (!st) return;
    this._trigSeen ||= new Set();
    if (domainOf(e) === "event") {
      // An event (a doorbell press) counts from the first press after the card opened, not an old one.
      this._trigBase ||= new Map();
      if (!this._trigBase.has(e)) this._trigBase.set(e, st.state);
      else if (this._trigBase.get(e) !== st.state) this._trigSeen.add(e);
    } else if (["on", "open", "detected", "home", "playing", "running", "recording", "streaming"].includes(st.state)) this._trigSeen.add(e);
  },

  _camShut(trig) {
    const st = this._hass.states[trig];
    return !!(st && this._camX && this._camX[trig] === (domainOf(trig) === "event" ? st.state : st.last_changed));
  },

  /** Is the trigger on (or was it, within the last 30 s; an event within the last minute)? */
  _trigOn(e, stay = "") {
    const st = this._hass.states[e];
    if (!st) return false;
    const now = this._now();
    let left = 0;
    // 0.13.1: "Stays open" (per marker): automatic = 30 s after it ends (60 s after an event); "on" = only while
    // it is on (an event, which is never "on", keeps its 60 s); a number of seconds; "x" = until closed with ✕.
    const ev = domainOf(e) === "event";
    const on = !ev && ["on", "open", "detected", "home", "playing", "cleaning", "heating", "cooling", "running", "printing", "recording", "streaming"].includes(st.state);
    if (on) return true;
    const t0 = ev ? Date.parse(st.state) : Date.parse(st.last_changed);
    if (stay === "x") return !!this._trigSeen && this._trigSeen.has(e);
    const keep = stay === "on" ? (ev ? 60 : 0) : Number(stay) > 0 ? Number(stay) : ev ? 60 : 30;
    left = keep * 1000 - (now - t0);
    if (!(left > 0)) return false;
    clearTimeout(this._trigT);
    this._trigT = setTimeout(() => this._update(true), left + 200);
    return true;
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  _per(item, ov) {
    const o = this._dev(item.id);
    return (o.per && typeof o.per === "object" && o.per[ov]) || {};
  },

  /** The ONE entity a device shows in an overlay (#100): per overlay → device → Editor main → best fitting. */
  _leadFor(item, ov, fits) {
    const o = this._dev(item.id);
    const exists = (e) => !!e && !!this._hass.states[e];
    // 0.12.6: a Configuration / Diagnostic entity (a thermometer's "Show smiley" switch) never leads by itself.
    const ok = (e) => exists(e) && fits(e) && !this._hiddenInHA(e) && !this._aux(e);
    // What you chose in Edit markers always leads, also a plain sensor (print status, programme…).
    const legacy = o.show_in && typeof o.show_in === "object" ? o.show_in[ov] : null;
    for (const e of [this._per(item, ov).lead, legacy]) if (exists(e)) return e;
    for (const e of [o.show, item.main_entity]) if (ok(e)) return e;
    return this._allowed(item).find(ok) || null;
  },

  /** Kept for the editor (#90): the device-wide or per-overlay choice. */
  _shownEntity(item, ov) {
    const e = this._per(item, ov).lead || (this._dev(item.id).show_in || {})[ov] || this._dev(item.id).show;
    return e && this._hass.states[e] ? e : null;
  },

  /** Value text of an extra line (#101). */
  _extraText(e) {
    const st = this._hass.states[e];
    if (!st) return "—";
    if (domainOf(e) === "climate") return st.attributes.current_temperature != null ? this._attrVal(st, "current_temperature") : this._fmt(e);
    return ["temperature", "humidity", "battery", "sensor"].includes(kindOf(e, st)) ? this._fmtNum(e) : this._fmt(e);
  },

  /** Attach the "Also show" lines: per-overlay setting, else the defaults given by the overlay. */
  _withExtras(spec, item, ov, defaults = []) {
    if (!spec) return spec;
    const per = this._per(item, ov);
    // 0.12.6: only entities with a value (a button or an update has none) and not already part of the marker.
    const list = (Array.isArray(per.extras) ? per.extras : defaults).filter((e) => e && this._hass.states[e] && !NO_VALUE.has(domainOf(e)) && !(spec.ents || []).includes(e) && e !== spec.eid);
    spec.core = [...(spec.ents || [])]; // 0.12.9: the marker's own entities, before its extra lines
    if (per.icon) spec.icon = per.icon;
    if (per.noicon) {
      spec.icon0 = spec.icon;
      spec.icon = null;
      spec.noicon = true;
    }
    // One extra can be a badge on the marker's corner instead of a line (#116: FP2 people count).
    if (per.badge && list.includes(per.badge)) {
      spec.badge = this._extraText(per.badge);
      list.splice(list.indexOf(per.badge), 1);
      spec.ents = [...(spec.ents || []), per.badge];
    }
    if (list.length) {
      const ics = per.extra_icons || {};
      spec.extras = list.map((e) => ({ eid: e, text: this._extraText(e), icon: ics[e] || null }));
      spec.ents = [...(spec.ents || []), ...list];
    }
    return spec;
  },

  /** 0.8.2: space around the plan (+) or trimmed margin (-), % of the image per side: the card's own frame
   *  ("custom"), else the plan's default from the Floorplan Editor. Positions stay relative to the image. */
  _frame(a, ratio) {
    const cf = this._focusFrame(a) || this._config.frame || {};
    const f = cf.mode === "custom" ? cf : (a && a.frame) || {};
    // House frames (several floors) can be larger than 60 %: a big ground floor around a small upper floor.
    const v = (k) => Math.max(cf.focus ? -99 : -45, Math.min(500, Number(f[k]) || 0));
    const [t, r, b, l] = ["t", "r", "b", "l"].map(v);
    const W = 100 + l + r;
    const H = 100 + t + b;
    this._em = { t: Math.max(0, t), r: Math.max(0, r), b: Math.max(0, b), l: Math.max(0, l) };
    if (!t && !r && !b && !l) return { ratio, style: "", crop: false };
    return {
      // 0.8.2: a floor of a house uses the house's outer shape (its picture may be scaled per direction).
      ratio: cf.mode !== "custom" && Number(f.aspect) > 0 ? Number(f.aspect) : +(ratio * (W / H)).toFixed(4),
      crop: t < 0 || r < 0 || b < 0 || l < 0,
      style: `position:absolute;width:${(10000 / W).toFixed(3)}%;height:${(10000 / H).toFixed(3)}%;left:${((l * 100) / W).toFixed(3)}%;top:${((t * 100) / H).toFixed(3)}%;aspect-ratio:auto`,
    };
  },

  /** 0.13.9.13 (mobile card): `focus_area`: the plan cut to one room, its box + about 10 % per side
   *  (0.6–1.5 m on a measured plan), never padded beyond the picture. A room without a shape: around its pin. */
  _focusFrame(a) {
    const id = this._config.focus_area;
    const ar = id && a && (a.areas || {})[id];
    if (!ar) return null;
    const sh = Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const xs = sh ? sh.map((p) => p[0]) : [ar.x - 8, ar.x + 8];
    const ys = sh ? sh.map((p) => p[1]) : [ar.y - 8, ar.y + 8];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const marg = (size, mpp, px) => {
      const m = size * 0.1;
      const perPct = Number(mpp) > 0 && Number(px) > 0 ? (Number(mpp) * Number(px)) / 100 : 0; // metres per 1 %
      return perPct ? Math.min(Math.max(m, 0.6 / perPct), 1.5 / perPct) : Math.max(m, 2);
    };
    const mx = marg(x1 - x0, a.metres_per_px_x, a.image_width);
    const my = marg(y1 - y0, a.metres_per_px_y || a.metres_per_px_x, a.image_height);
    // 0.13.9.15: `focus_aspect` (width / height of the space the cut-out fills): the view keeps the room fitted
    // and centred, and fills the rest with the plan around it (shifted to stay on the picture).
    const asp = Number(this._config.focus_aspect);
    const W = Number(a.image_width) || 1000;
    const H = Number(a.image_height) || 1000;
    if (asp > 0) {
      let bw = ((x1 - x0 + 2 * mx) * W) / 100;
      let bh = ((y1 - y0 + 2 * my) * H) / 100;
      if (bw / bh < asp) bw = bh * asp;
      else bh = bw / asp;
      const span = (c, len, full) => {
        const l = Math.min(full, len);
        const s = Math.max(0, Math.min(full - l, c - l / 2));
        return [s, full - s - l];
      };
      const [l0, r0] = span(((x0 + x1) / 2 / 100) * W, bw, W);
      const [t0, b0] = span(((y0 + y1) / 2 / 100) * H, bh, H);
      return { mode: "custom", focus: true, t: -(t0 / H) * 100, b: -(b0 / H) * 100, l: -(l0 / W) * 100, r: -(r0 / W) * 100 };
    }
    const cut = (v) => -Math.max(0, Math.min(99, v));
    return { mode: "custom", focus: true, t: cut(y0 - my), b: cut(100 - y1 - my), l: cut(x0 - mx), r: cut(100 - x1 - mx) };
  },

  /** 0.8.1: the readings a marker shows when nothing is picked under "Also show": its lines on the plan, else
   *  what its info card lists (appliances: time left and power; bonds and phantoms: their members). The
   *  Marker Editor starts from exactly this list, so adding a reading keeps the others. */
  _autoReads(item, ov) {
    const ap = ov === "live" && this._applOf(item);
    if (ap) return [ap.remaining || ap.progress, ap.power].filter(Boolean);
    let sp = null;
    try {
      sp = this._specsFor(item, ov, false)[0];
    } catch (_e) {
      sp = null;
    }
    if (!sp) return [];
    if (sp.extras && sp.extras.length) return sp.extras.map((x) => x.eid);
    if (!item.bond && !item.phantom) return [];
    const lead = sp.phantom ? null : sp.eid || (sp.ents || [])[0];
    return [...new Set([...(sp.ents || []), ...(sp.also || []), ...(item.entities || [])])].filter((e) => e && e !== lead && this._hass.states[e]);
  },

  /** Lights as glow only in this overlay (#112). */
  _glowOnly(ov) {
    if (ov === "live") return (this._ov("live").lights_as || "glow") === "glow";
    const def = this._ovDef(ov);
    return !!(def && def.custom && def.custom.lights_as === "glow");
  },

  /** One entity per kind key (custom overlays, #109). */
  _entityForKind(item, key, allowed) {
    const hass = this._hass;
    const ks = (e) => kindOf(e, hass.states[e]);
    if (key === "temperature") return allowed.find((e) => ks(e) === "temperature" && (ambientTemp(e, hass.states[e], item) || this._dev(item.id).comfort === true)) || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && hass.states[e].attributes.current_temperature != null) || null;
    if (key === "humidity") return allowed.find((e) => ks(e) === "humidity" && !impossibleReading(e, hass.states[e])) || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && Number(hass.states[e].attributes.current_humidity) > 0) || null;
    if (key === "battery") return (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && item.roles.battery) || allowed.find((e) => ks(e) === "battery") || null;
    const pick = allowed.filter((e) => LIVE_KEY[ks(e)] === key && !this._aux(e)); // 0.12.6: no setting switches
    if (item.main_entity && pick.includes(item.main_entity)) return item.main_entity;
    return pick[0] || null;
  },

  _specsFor(item, ov, q) {
    const hass = this._hass;
    const name = this._dev(item.id).name || item.name;
    if (ov === "cleaning") return []; // 0.10: only robots (and rooms) in Cleaning: _robotSpecs
    if (item.phantom) return this._phantomSpecs(item, name, ov, q);
    // Split device (#91): Network and Health show the device at its hardware spot only.
    if (item.of && (ov === "network" || ov === "health")) return [];
    // #105: a split spot that "acts as" a light / switch / fan.
    if (["light", "switch", "fan"].includes(item.as)) item = { ...item, actsAs: item.as };
    const allowed = this._allowed(item);
    const cx = this._cx || { hubs: new Set(), zha: {} };
    const kindOfE = (e) => (item.actsAs && e === item.main_entity ? { light: "light", switch: "switch", fan: "fan" }[item.actsAs] : kindOf(e, hass.states[e]));
    const one = (spec, defaults) => (spec ? [this._withExtras(spec, item, ov, defaults)] : []);
    // 0.7.4: an appliance with a drum / line is its own signal in Live (bonds too), and its plug is no light.
    if (!q && (ov === "live" || ov === "lights") && this._applOf(item)) return [];
    if (ov === "live") {
      const opts = this._ov("live");
      const kinds = opts.show || LIVE_DEFAULT;
      // 0.11: "Show in Live when…": a camera (or any device with a picked trigger) shows only while its
      // motion / ring / door sensor is on, and a little after. A camera without a trigger stays out of Live.
      const trig = this._liveWhen(item);
      const cam = this._camOf(item);
      if (trig || cam) {
        if (q) return [{ key: item.id }];
        // A camera without a trigger shows only with Layers → Cameras; unavailable cameras never in Live.
        // 0.11: Layers → Cameras shows every camera; on top of that a trigger pops one up by itself.
        const layer = !!cam && this._layerOn("live", "cams", false) && this._layerOn("live", `cam:${item.id}`, true);
        if (trig) this._trigMark(trig);
        const popped = !!trig && this._trigOn(trig, this._per(item, "live").stay) && !this._camShut(trig);
        const show = layer || popped;
        if (!show) return [];
        const lead = cam || this._per(item, ov).lead || this._addedLead(item);
        if (cam && !live(hass.states[cam])) return [];
        if (!hass.states[lead]) return [];
        // 0.12.6: a device with a picked trigger shows as itself, with its value (a camera: its picture).
        const sp = cam ? this._liveSpec(item, name, lead, hass.states[lead], kindOfE(lead), { ...opts, values: false }) : this._asItself(item, name, lead);
        if (!sp) return [];
        return one({ ...sp, key: `${item.id}|${lead}`, on: true, dim: false, ents: trig ? [lead, trig] : [lead], trig: layer ? null : trig, cam: !!cam, win: true });
      }
      if (item.bond && !this._per(item, ov).lead) {
        const kind = this._mainKind(item);
        const key = LIVE_KEY[kind];
        if (!key || !kinds.includes(key)) return [];
        if (kind === "climate" && !q) return [];
        const bs = this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], kind, opts);
        if (!q && !bs.on && this._undoFor([item.main_entity, ...(item.entities || [])])) return one({ ...bs, dim: true });
        if (!q && (this._per(item, ov).off || opts.show_off || "hidden") === "hidden" && !bs.on) return [];
        if (kind === "light" && this._glowOnly(ov)) bs.glow = true;
        return one(bs);
      }
      const lead0 = this._leadFor(item, ov, (e) => kinds.includes(LIVE_KEY[kindOfE(e)]));
      // 0.12.6: a device you added to Live shows as itself (a thermometer as its chip) and stays on the plan.
      const added = this._added(item, ov);
      if (!lead0 && !added) return [];
      if (!lead0 || (added && READ_KIND.has(kindOfE(lead0)))) {
        if (q) return [{ key: item.id }];
        return one(this._asItself(item, name, lead0 || this._addedLead(item)), []);
      }
      const lead = lead0;
      const kind = kindOfE(lead);
      // Live = what is happening now: things that are off are hidden (option: faint). Added: shown unless set.
      const hideOff = !q && (this._per(item, ov).off || (added ? "shown" : opts.show_off) || "hidden") === "hidden";
      // 0.7.3: Room pulse: motion and presence in a room with a shape show as the room's glowing edges.
      if (!q && kind === "motion" && (opts.motion_as || "pulse") === "pulse" && this._roomOf(item)) return [];
      // 0.7.0: a drawn opening is its own signal (the bar); shutters show only while moving.
      if (!q && this._barEnts().has(lead)) return [];
      if (!q && openKind(lead, hass.states[lead]) && guessOpenAs(lead, hass, item.name, item.as) === "shutter") {
        const st0 = hass.states[lead];
        if (!(domainOf(lead) === "cover" && st0 && ["opening", "closing"].includes(st0.state))) return [];
      }
      if (kind === "climate") {
        // 0.8.0: Live shows climate only as its air flow / warm glow; temperatures live in Comfort.
        // (The editor still sees it, so it can be hidden in Live, which also hides its air flow.)
        if (!q) return [];
        return one(this._climateChip(item, name, lead, null, null, { compact: true }));
      }
      const spec = this._liveSpec(item, name, lead, hass.states[lead], kind, opts);
      if (!q && !spec.on && this._undoFor([lead])) return one({ ...spec, dim: true });
      if (kind === "light" && this._glowOnly(ov)) {
        if (!spec.on && !q) return [];
        spec.glow = true;
      }
      if (hideOff && !spec.on) return [];
      return one(spec);
    }
    if (ov === "lights") {
      const opts = this._lights();
      const fits = (e) => {
        const k = kindOfE(e);
        return k === "light" || (opts.switches !== false && (k === "switch" || k === "fan") && (item.actsAs ? item.actsAs === "light" : item.group === "lights"));
      };
      const lead = item.bond && !this._per(item, ov).lead ? (fits(item.main_entity) ? item.main_entity : null) : this._leadFor(item, ov, fits);
      if (!lead) return [];
      const spec = this._liveSpec(item, name, lead, hass.states[lead], "light", { quiet_small: false });
      if (!q && !spec.on && opts.off === "hidden") return [];
      spec.dim = !spec.on && opts.off !== "normal";
      spec.value = "";
      if (spec.on && opts.brightness && this._look().markers !== "icon") {
        const st = hass.states[lead];
        const b = st && st.attributes.brightness;
        if (num(b)) spec.value = `${Math.round((Number(b) / 255) * 100)}%`;
      }
      return one(spec);
    }
    if (ov === "comfort") {
      const per = this._per(item, ov);
      if (per.lead && hass.states[per.lead]) {
        const k = kindOf(per.lead, hass.states[per.lead]);
        if (k === "climate") return one(this._climateChip(item, name, per.lead, null, null));
        if (k === "temperature" || k === "humidity") {
          // An explicit lead shows itself (+ the extras you chose), no automatic humidity next to it.
          const t = k === "temperature" ? per.lead : null;
          const h = k === "humidity" ? per.lead : null;
          const lines = [t ? this._fmtNum(t) : "", h ? this._fmtNum(h) : ""].filter(Boolean);
          return one({ ...this._chipSpec(item, name, { lines, ents: [t, h].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: h ? lines[lines.length - 1] : "" } });
        }
      }
      return this._comfortSpecs(item, name, allowed, this._ov("comfort")).map((sp) => this._withExtras(sp, item, ov));
    }
    if (ov === "security") {
      const opts = this._ov("security");
      const sec = ["opening", "motion", "lock", "alarm", "safety", "camera"];
      // 0.10.2: a relay's "opening" input (e.g. a Sonoff ZBMINIR2's wall-switch input) is no door:
      // on a device with a switch or light it counts only when drawn as an opening or picked.
      const relay = !(item.opening && item.opening.x1 != null) && (item.allEntities || item.entities || []).some((e) => ["switch", "light"].includes(domainOf(e)));
      const fits = (e) => {
        const k = kindOf(e, hass.states[e]);
        if (k === "opening" && relay && domainOf(e) === "binary_sensor") return false;
        // 0.11: shutters are no security alert (their bar on the window shows the position).
        if (domainOf(e) === "cover") return false;
        // 0.11: a camera only when the device is one (its main entity), not a tablet's or robot's camera entity.
        return sec.includes(k) && !(k === "camera" && (opts.cameras === false || this._camOf(item) !== e));
      };
      // #100: one marker per device; its other sensors are in the popup.
      const lead = this._leadFor(item, ov, fits);
      if (!lead) return [];
      const st = hass.states[lead];
      const k = kindOf(lead, st);
      // 0.10.2: unavailable counts as an alert in Security (a silent sensor may be a threat).
      const alert = this._isOn(lead, st, k) || !live(st);
      // 0.11: a camera is a fixture: always on the Security map as its dot (unavailable: the usual red marker);
      // its picture as in Live: when its trigger fires, or with Layers → Cameras.
      if (k === "camera" && live(st)) {
        if (q) return [{ key: item.id }];
        const trig = this._liveWhen(item);
        const layer = this._layerOn(ov, "cams", false) && this._layerOn(ov, `cam:${item.id}`, true);
        if (trig) this._trigMark(trig);
        const popped = !!trig && this._trigOn(trig, this._per(item, "live").stay) && !this._camShut(trig);
        const sp = this._liveSpec(item, name, lead, st, k, { values: false });
        return one({ ...sp, key: `${item.id}|${lead}`, on: true, dim: false, ents: trig ? [lead, trig] : [lead], trig: layer ? null : trig, cam: true, win: layer || popped });
      }
      if (!q && !alert && k !== "camera" && !this._layerOn(ov, "all", this._layerDefault(ov, "all"))) return [];
      const others = allowed.filter((e) => e !== lead && fits(e));
      const spec = { ...this._liveSpec(item, name, lead, st, k, { values: false }), key: `${item.id}|${lead}`, ents: [lead], also: others };
      return one(spec);
    }
    if (ov === "health") return this._healthSpecs(item, name, allowed, this._ov("health"), q).map((sp) => this._withExtras(sp, item, ov));
    if (ov === "energy") return this._energySpecs(item, name, q);
    if (ov === "network") return this._netSpecs(item, name, cx, q);
    const def = this._ovDef(ov);
    if (def && def.custom) return this._customSpecs(item, name, allowed, def.custom, q, ov);
    return [];
  },

  _comfortSpecs(item, name, allowed, opts) {
    const hass = this._hass;
    const temps = [];
    const hums = [];
    for (const eid of allowed) {
      const st = hass.states[eid];
      const k = kindOf(eid, st);
      if (k === "temperature" && (ambientTemp(eid, st, item) || this._dev(item.id).comfort === true)) temps.push(eid);
      if (k === "humidity" && opts.humidity !== false && !impossibleReading(eid, st) && dfcCat(eid) !== "diagnostic") hums.push(eid);
    }
    const clim = allowed.find((eid) => domainOf(eid) === "climate");
    if (clim && opts.climate !== false && !item.bond) {
      const spec = this._climateChip(item, name, clim, temps[0], hums[0] || allowed.find((e) => kindOf(e, hass.states[e]) === "humidity" && !impossibleReading(e, hass.states[e])));
      if (spec) return [spec];
    }
    if (!temps.length && !hums.length) return [];
    if (!temps.length && opts.humidity_alone === false) return [];
    const lines = [];
    if (item.bond && (temps.length > 1 || hums.length > 1)) {
      // A bond of sensors: one chip, combined value (#58).
      if (temps.length) lines.push(this._combine(item, temps));
      if (hums.length) lines.push(this._combine(item, hums));
      return [{ ...this._chipSpec(item, name, { lines, ents: [...temps, ...hums], kind: "reading" }), rd: { t: temps.length ? lines[0] : "", h: hums.length ? lines[lines.length - 1] : "" } }];
    }
    if (temps[0]) lines.push(this._fmtNum(temps[0]));
    if (hums[0]) lines.push(this._fmtNum(hums[0]));
    return [{ ...this._chipSpec(item, name, { lines, ents: [...temps.slice(0, 1), ...hums.slice(0, 1)], kind: "reading" }), rd: { t: temps[0] ? lines[0] : "", h: hums[0] ? lines[lines.length - 1] : "" } }];
  },

  /** Combined number for bonds and phantoms: average · lowest · highest · one (#58, #60). */
  _combine(item, ents) {
    const hass = this._hass;
    const o = this._dev(item.id);
    const mode = o.value || (item.phantom && item.value) || this._ov("comfort").combine || "average";
    if (mode === "one") {
      const fromMember = item.phantom && item.one ? ents.find((e) => (item.byMember[item.one] || []).includes(e)) : null;
      return this._fmtNum((o.one && ents.includes(o.one) && o.one) || fromMember || ents[0]);
    }
    // "climate.x" = its room temperature, "climate.x#h" = its humidity (#98).
    const valOf = (e) => {
      const [id, part] = e.split("#");
      const s = hass.states[id];
      if (!live(s)) return null;
      if (domainOf(id) === "climate") {
        const v = part === "h" ? s.attributes.current_humidity : s.attributes.current_temperature;
        return num(v) && !(part === "h" && Number(v) <= 0) ? Number(v) : null;
      }
      return num(s.state) ? Number(s.state) : null;
    };
    const vals = ents.map(valOf).filter((v) => v != null);
    if (!vals.length) return "—";
    const v = mode === "min" ? Math.min(...vals) : mode === "max" ? Math.max(...vals) : vals.reduce((x, y) => x + y, 0) / vals.length;
    const plain = ents.find((e) => !e.includes("#") && domainOf(e) !== "climate");
    const st = plain ? hass.states[plain] : null;
    const unit = st ? st.attributes.unit_of_measurement || "" : ents[0].includes("#h") ? "%" : "°";
    return `${this._num1(v)}${unit === "%" || unit === "°" ? "" : " "}${unit}`.trim();
  },

  /** Phantom items per overlay: one chip/marker with the combined value; tap lists its devices. */
  _phantomSpecs(item, name, ov, q) {
    const hass = this._hass;
    const ents = item.entities || [];
    const kindsOf = (list, ks) => list.filter((e) => ks.includes(kindOf(e, hass.states[e])));
    const def = this._ovDef(ov);
    const custom = def && def.custom ? (Array.isArray(def.custom.kinds) ? def.custom.kinds : []) : null;
    const kindIcon = { opening: "mdi:window-open-variant", motion: "mdi:motion-sensor", light: "mdi:lightbulb-group", switch: "mdi:toggle-switch", fan: "mdi:fan", lock: "mdi:lock", safety: "mdi:shield-alert" };
    const pick = this._dev(item.id).icon || (item.icon && item.icon !== "dfp:phantom" ? item.icon : null);
    const icon = pick;
    if (ov === "comfort" || (custom && (custom.includes("temperature") || custom.includes("humidity")))) {
      const allT = kindsOf(ents, ["temperature"]);
      // 0.12.9: a room temperature by the rule of the device it comes from (no plug's or NAS's own temperature).
      const ownerOf = (e) => (item.members || []).find((m) => (item.byMember[m] || []).includes(e));
      const room = (e) => {
        const m = ownerOf(e);
        const g = m && (item.mgroup || {})[m];
        return g ? ambientTemp(e, hass.states[e], { group: g, standalone: false }) || this._dev(m).comfort === true : ambientTemp(e, hass.states[e], { standalone: true });
      };
      const amb = allT.filter(room);
      // #98: ACs and thermostats count with the temperature / humidity they report themselves.
      const clim = ents.filter((e) => domainOf(e) === "climate" && hass.states[e]);
      const temps = [...amb, ...clim.filter((e) => hass.states[e].attributes.current_temperature != null)];
      const hums = [...kindsOf(ents, ["humidity"]).filter((e) => !impossibleReading(e, hass.states[e])), ...clim.filter((e) => Number(hass.states[e].attributes.current_humidity) > 0).map((e) => `${e}#h`)];
      if (!temps.length && !hums.length) return [];
      if (q) return [{ key: item.id }];
      const lines = [];
      if (temps.length) lines.push(this._combine(item, temps));
      if (hums.length) lines.push(this._combine(item, hums));
      return [{ ...this._chipSpec(item, name, { lines, ents: [...new Set([...temps, ...hums].map((e) => e.split("#")[0]))], kind: "reading" }), rd: { t: temps.length ? lines[0] : "", h: hums.length ? lines[lines.length - 1] : "" }, phantom: true }];
    }
    let list = [];
    if (ov === "security" || (custom && custom.some((k) => ["opening", "motion"].includes(k)))) list = kindsOf(ents, ["opening", "motion", "lock", "safety"]);
    else if (ov === "lights") list = item.mains.filter((e) => ["light", "switch", "fan"].includes(kindOf(e, hass.states[e])));
    else if (ov === "live") list = [...new Set([...item.mains.filter((e) => LIVE_KEY[kindOf(e, hass.states[e])]), ...kindsOf(ents, ["opening", "motion"])])];
    if (!list.length) return [];
    if (q) return [{ key: item.id }];
    const kinds = list.map((e) => kindOf(e, hass.states[e]));
    const n = list.filter((e, i) => this._isOn(e, hass.states[e], kinds[i])).length;
    const kind = kinds.every((k) => k === kinds[0]) ? kinds[0] : kinds.includes("opening") ? "opening" : kinds[0];
    let value = "";
    if (kind === "opening") value = n ? dfT("sec.n_open", { n }) : dfT("sec.all_closed");
    else if (kind === "motion") value = n ? dfT("motion.detected") : dfT("motion.clear");
    else if (["light", "switch", "fan"].includes(kind)) {
      // 0.7.4: a bond counts once (on while any of its members is on).
      const units = (item.units || list.map((e) => [e])).map((u) => u.filter((e) => list.includes(e))).filter((u) => u.length);
      value = `${units.filter((u) => u.some((e) => this._isOn(e, hass.states[e], kindOf(e, hass.states[e])))).length} of ${units.length} on`;
    }
    else value = n ? `${n} active` : "";
    const color = kind === "motion" ? "#43a047" : kind === "opening" ? "#fb8c00" : "var(--dfc-accent)";
    return [{ key: item.id, type: "marker", item, name, ents: list, eid: list[0], st: null, kind, on: n > 0, dim: false, unavail: false, color, value: this._look().markers !== "icon" ? value : "", icon: icon || kindIcon[kind] || "mdi:shape-outline", x: item.x, y: item.y, phantom: true }];
  },

  /** ACs and thermostats, chip v2: [icon] Cooling / Set 24° │ 25.1° / 💧 68%; only what the unit reports. */
  _climateChip(item, name, clim, tempEid, humEid, { compact = false } = {}) {
    const st = this._hass.states[clim];
    if (!st) return null;
    const a = st.attributes || {};
    const on = live(st) && st.state !== "off";
    const act = on && a.hvac_action && CLIMATE_ACTION[a.hvac_action] ? CLIMATE_ACTION[a.hvac_action] : null;
    const mode = live(st) ? st.state : "off";
    const word = !live(st) ? dfT("offline") : act ? act.word : CLIMATE_MODE_WORD[mode] || (this._hass.formatEntityState ? this._hass.formatEntityState(st) : mode);
    const color = !on ? "#9e9e9e" : act ? act.color : (CLIMATE_MODES[mode] || CLIMATE_MODES.auto).color;
    let set = "";
    if (on) {
      if (a.temperature != null) set = `Set ${this._num1(a.temperature)}°`;
      else if (a.target_temp_low != null && a.target_temp_high != null) set = `Set ${this._num1(a.target_temp_low)}–${this._num1(a.target_temp_high)}°`;
      else if (a.target_humidity != null) set = `Set ${a.target_humidity}%`;
    }
    // 0.7.5: a real room thermometer bonded with the unit beats its built-in sensor; "own_temp: off"
    // keeps the unit's own readings out of the chip, Comfort and the heatmap.
    const room = this._roomSensors(item, clim);
    const own = this._dev(item.id).own_temp !== "off";
    let temp = "";
    if (room.t) temp = this._fmtNum(room.t).replace(/\s?°C|\s?°F/, "°");
    else if (own && a.current_temperature != null) temp = `${this._num1(a.current_temperature)}°`;
    else if (own && tempEid) temp = this._fmtNum(tempEid).replace(/\s?°C|\s?°F/, "°");
    let hum = "";
    // #88: 0 / missing humidity = the unit has no humidity sensor.
    if (room.h && Number((this._hass.states[room.h] || {}).state) > 0) hum = this._fmtNum(room.h);
    else if (own && a.current_humidity != null && Number(a.current_humidity) > 0) hum = `${Math.round(Number(a.current_humidity))}%`;
    else if (own && humEid && Number((this._hass.states[humEid] || {}).state) > 0) hum = this._fmtNum(humEid);
    // 0.12.10: where the chip's temperature / humidity come from (its readings popup charts these).
    const src = {
      t: room.t || (own && a.current_temperature != null ? clim : own ? tempEid : null) || null,
      h: (room.h && Number((this._hass.states[room.h] || {}).state) > 0 && room.h) || (own && Number(a.current_humidity) > 0 ? `${clim}#h` : own && humEid && Number((this._hass.states[humEid] || {}).state) > 0 ? humEid : null) || null,
    };
    const icon = this._dev(item.id).icon || climateIcon(clim, st);
    const ents = [clim];
    const heatEnts = room.t ? [room.t] : own ? [clim, tempEid].filter(Boolean) : [];
    // Compact (Live, custom overlays, #99): icon + room temperature in the mode colour; "Off" when off.
    // 0.7.4: off needs no word: the grey chip already says it (a narrower chip); offline still says so.
    const shown = live(st) && st.state === "off" ? "" : word;
    if (compact) return { key: `${item.id}|${clim}`, type: "chip", cl2: true, compact: true, item, name, lines: [temp || "—", word], word: on ? "" : shown, set: "", temp, hum: "", ents, src, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
    return { key: `${item.id}|${clim}`, type: "chip", cl2: true, item, name, lines: [temp || "—", word], word: shown, set, temp, hum, ents, src, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
  },

  /** Room thermometer / humidity sensor bonded with a climate unit (from another device than the unit). */
  _roomSensors(item, clim) {
    if (!item.bond) return {};
    const hass = this._hass;
    const devs = (this._a && this._a.devices) || {};
    const climDev = (item.members || []).find((m) => ((devs[m] || {}).entities || []).includes(clim));
    const mine = new Set(climDev ? devs[climDev].entities || [] : []);
    const pool = (item.entities || []).filter((e) => e !== clim && !mine.has(e) && live(hass.states[e]));
    const t = pool.find((e) => kindOf(e, hass.states[e]) === "temperature" && ambientTemp(e, hass.states[e], { standalone: true }));
    const h = pool.find((e) => kindOf(e, hass.states[e]) === "humidity");
    return { t, h };
  },

  _num1(v) {
    const n = Math.round(Number(v) * 10) / 10;
    try {
      return n.toLocaleString(this._hass.locale && this._hass.locale.language ? this._hass.locale.language : undefined, { maximumFractionDigits: 1 });
    } catch (_e) {
      return String(n);
    }
  },

  _healthSpecs(item, name, allowed, opts, q) {
    const hass = this._hass;
    const low = Number(opts.low ?? 20);
    // 0.12.9: automatically the device's own battery (HA lists it under Diagnostic); "Follows" picks another
    // (a UPS's or a car's charge level).
    const devBat = (eid) => kindOf(eid, hass.states[eid]) === "battery" && this._aux(eid);
    const pickd = this._per(item, "health").lead;
    const chosen = pickd && hass.states[pickd] ? pickd : null;
    let bat = chosen || (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && devBat(item.roles.battery) && item.roles.battery) || allowed.find(devBat);
    if (item.bond && !chosen) {
      // A bond: the lowest battery of its members.
      const bats = allowed.filter((eid) => devBat(eid) && live(hass.states[eid]) && num(hass.states[eid].state));
      if (bats.length) bat = bats.sort((x, y) => Number(hass.states[x].state) - Number(hass.states[y].state))[0];
    }
    const unavailable = item.bond ? (item.entities || []).some((e) => (hass.states[e] || {}).state === "unavailable") : item.main_entity && devOffline(hass, item, this._rpT() != null);
    const pos = item.box || item;
    if (bat) {
      const st = hass.states[bat];
      const v = live(st) && num(st.state) ? Number(st.state) : null;
      const isLow = v != null && v <= low;
      if (!q && opts.only_problems && !isLow && !unavailable) return [];
      const icon = v == null ? "mdi:battery-unknown" : v <= low ? "mdi:battery-alert-variant-outline" : v >= 95 ? "mdi:battery" : `mdi:battery-${Math.max(10, Math.min(90, Math.round(v / 10) * 10))}`;
      return [this._chipSpec({ ...item, x: pos.x, y: pos.y }, name, { lines: [v != null ? `${Math.round(v)}%` : "—"], icon, ents: [bat], kind: "reading", cls: isLow ? "low" : unavailable ? "warn" : "" })];
    }
    if (q) return item.main_entity && !item.bond ? [{ key: item.id, offlineOnly: true }] : []; // shows only when offline
    if (unavailable) return [this._offChip({ ...item, x: pos.x, y: pos.y }, name)];
    return [];
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------------ 0.11 Energy
  /** Energy data from Home Assistant's own Energy settings: the devices (with their kWh statistic and power
   *  sensor) and the sources, plus today's hourly statistics. Refreshed every 5 minutes while Energy shows. */
  _eLoad(force) {
    const now = Date.now();
    const day = new Date().toDateString();
    if (!this._hass || this._eBusy) return;
    if (!force && this._eData && this._eData.day === day && now - this._eData.t < 300000) return;
    this._eBusy = true;
    // test10: the last 24 hours (rolling, ending with the current hour), hour by hour.
    const start = new Date(Math.floor(now / 3600000) * 3600000 - 24 * 3600000);
    this._hass
      .callWS({ type: "energy/get_prefs" })
      .then(async (prefs) => {
        const devs = (prefs.device_consumption || []).filter((d) => d.stat_consumption);
        const srcs = [];
        for (const sr of prefs.energy_sources || []) {
          if (sr.type === "solar" && sr.stat_energy_from) srcs.push({ kind: "solar", stat: sr.stat_energy_from, rate: sr.stat_rate });
          if (sr.type === "battery") {
            if (sr.stat_energy_from) srcs.push({ kind: "battery_out", stat: sr.stat_energy_from, rate: sr.stat_rate });
            if (sr.stat_energy_to) srcs.push({ kind: "battery_in", stat: sr.stat_energy_to });
          }
          if (sr.type === "grid") for (const f of sr.flow_from || []) if (f.stat_energy_from) srcs.push({ kind: "grid", stat: f.stat_energy_from, rate: sr.stat_rate });
          if (sr.type === "grid" && sr.stat_energy_from) srcs.push({ kind: "grid", stat: sr.stat_energy_from, rate: sr.stat_rate }); // HA 2026.11+
        }
        const ids = [...devs.map((d) => d.stat_consumption), ...srcs.map((x) => x.stat)];
        let stats = {};
        if (ids.length) {
          stats = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: new Date().toISOString(), statistic_ids: ids, period: "hour", types: ["change"] });
        }
        const hours = {}; // statistic → { hour start (ms): kWh }
        for (const id of ids) {
          const by = {};
          for (const r of stats[id] || []) {
            const ts = Math.floor(new Date(r.start).getTime() / 3600000) * 3600000;
            if (Number.isFinite(ts)) by[ts] = (by[ts] || 0) + Math.max(0, Number(r.change) || 0);
          }
          hours[id] = by;
        }
        this._eData = { day, t: Date.now(), devs, srcs, hours };
        this._eErr = null;
      })
      .catch((e) => {
        this._eErr = (e && (e.message || e.code)) || dfT("energy.no_data");
        this._eData = { day, t: Date.now(), devs: [], srcs: [], hours: {} };
      })
      .finally(() => {
        this._eBusy = false;
        this._update(true);
      });
  },

  /** What Energy shows: "day" (kWh of the last 24 hours, rolling), "now" (live W), or one of those hours
   *  (its start, ms: kWh in that hour). */
  _eSel() {
    const v = this._eAt;
    if (v === "now") return "now";
    if (typeof v === "number") {
      const cur = Math.floor(Date.now() / 3600000) * 3600000;
      if (v <= cur && v >= cur - 23 * 3600000) return v;
    }
    return "day";
  },

  /** Value of one statistic (+ its power sensor) for the current selection: { v, unit }. */
  _eVal(stat, rate) {
    const sel = this._eSel();
    if (sel === "now") {
      const w = powerW(this._hass.states[rate]);
      return { v: w == null ? 0 : w, unit: "W", live: w != null };
    }
    const by = (this._eData && this._eData.hours[stat]) || {};
    const from = Math.floor(Date.now() / 3600000) * 3600000 - 23 * 3600000;
    const v = sel === "day" ? Object.entries(by).reduce((x, [ts, y]) => (Number(ts) >= from ? x + y : x), 0) : by[sel] || 0;
    return { v, unit: "kWh" };
  },

  /** Energy devices per plan item (by any of the item's entities), each with its colour. */
  _eIndex(a) {
    if (!this._eData) return new Map();
    const key = `${this._eData.t}|${this._floor}`;
    if (this._eIdx && this._eIdx.key === key) return this._eIdx.map;
    const byEnt = new Map();
    for (const item of this._items(a)) for (const e of [item.main_entity, ...(item.entities || []), ...(item.allEntities || [])]) if (e && !byEnt.has(e)) byEnt.set(e, item);
    const map = new Map();
    const byDev = new Map(this._items(a).map((it) => [it.id, it]));
    const devOf = (e) => (e && this._hass.entities && this._hass.entities[e] ? this._hass.entities[e].device_id : null);
    this._eData.devs.forEach((d, i) => {
      // 0.11: by entity, else by the device the sensor belongs to (a plug's energy sensor, when the plug is placed).
      const item = byEnt.get(d.stat_consumption) || byEnt.get(d.stat_rate) || byDev.get(devOf(d.stat_consumption)) || byDev.get(devOf(d.stat_rate));
      if (!item) return;
      const list = map.get(item.id) || [];
      list.push({ ...d, color: E_COLORS[i % E_COLORS.length] });
      map.set(item.id, list);
    });
    this._eIdx = { key, map };
    return map;
  },

  /** 0.11: Home Assistant's "Upstream device": the stat of the device whose meter already includes this one
   *  (only when that device is in Energy too). Such a device keeps its chip but isn't added again to totals. */
  _eUp(stat) {
    const devs = (this._eData && this._eData.devs) || [];
    const d = devs.find((x) => x.stat_consumption === stat);
    const up = d && d.included_in_stat;
    return up && devs.some((x) => x.stat_consumption === up) ? up : null;
  },

  /** Totals, room shading and lines: what a chip adds (its top-level devices) and where its line goes. */
  _eTree(sp, devs) {
    sp.stats = new Set(devs.map((d) => d.stat));
    sp.eSum = devs.filter((d) => !this._eUp(d.stat)).reduce((t, d) => t + d.v, 0);
    const ups = devs.map((d) => this._eUp(d.stat));
    sp.up = ups.every((u) => u && !sp.stats.has(u)) ? ups[0] : null;
  },

  _energySpecs(item, name, q) {
    const list = this._eIndex(this._a || {}).get(item.id);
    if (!list) return [];
    let v = 0;
    let unit = "kWh";
    const tree = [];
    for (const d of list) {
      const r = this._eVal(d.stat_consumption, d.stat_rate);
      v += r.v;
      unit = r.unit;
      tree.push({ stat: d.stat_consumption, v: r.v });
    }
    if (q) return [{ key: item.id }]; // 0.11: in Energy whenever it's in HA's Energy settings, whatever it uses now
    // 0.11: from 0 W by default (any use shows); a device using nothing never shows.
    const min = unit === "W" ? Number(this._ov("energy").min_w ?? 0) : 0.005;
    if (!(v > 0) || v < min) return [];
    const pos = item.box || item;
    const sp = this._chipSpec({ ...item, x: pos.x, y: pos.y }, name, { lines: [unit === "W" ? fmtW(v) : fmtKwh(v)], icon: "mdi:flash", ents: list.map((d) => d.stat_rate || d.stat_consumption).filter((e) => this._hass.states[e]), kind: "reading", cls: "en" });
    sp.color = list[0].color;
    sp.energy = v;
    sp.unit = unit;
    sp.area = item.area_id;
    this._eTree(sp, tree);
    return [sp];
  },

  /** Area of an entity (its own, else its device's). */
  _eAreaOf(e) {
    const en = e && this._hass.entities && this._hass.entities[e];
    if (!en) return null;
    if (en.area_id) return en.area_id;
    const dv = en.device_id && this._hass.devices && this._hass.devices[en.device_id];
    return dv ? dv.area_id || null : null;
  },

  /** 0.11: energy devices with no marker on the plan show at their room's pin (so the plan adds up to HA's Energy);
   *  what's on no room of this plan is summed as "Not on this plan". */
  _eRoomSpecs(a) {
    this._eOff = 0;
    if (!this._eData) return [];
    const placed = new Set();
    for (const list of this._eIndex(a).values()) for (const d of list) placed.add(d.stat_consumption);
    const per = {};
    this._eData.devs.forEach((d, i) => {
      if (placed.has(d.stat_consumption)) return;
      const r = this._eVal(d.stat_consumption, d.stat_rate);
      const area = this._eAreaOf(d.stat_consumption) || this._eAreaOf(d.stat_rate);
      const ar = area && (a.areas || {})[area];
      if (!ar || ar.x == null) {
        if (!this._eUp(d.stat_consumption)) this._eOff += r.v; // an upstream device already counts it
        return;
      }
      const g = (per[area] = per[area] || { ar, list: [], v: 0, unit: r.unit, i });
      const ent = d.stat_rate || d.stat_consumption;
      g.list.push({ name: d.name || entName(this._hass, ent), ent, v: r.v, stat: d.stat_consumption });
      g.v += r.v;
      if (r.v > (g.top || -1)) [g.top, g.i] = [r.v, i];
    });
    const out = [];
    for (const [area, g] of Object.entries(per)) {
      const min = g.unit === "W" ? Number(this._ov("energy").min_w ?? 0) : 0.005;
      if (!(g.v > 0) || g.v < min) continue;
      const n = g.list.length;
      const fmt = g.unit === "W" ? fmtW(g.v) : fmtKwh(g.v);
      const name = n > 1 ? `${g.ar.name || area} · ${n} devices` : g.list[0].name;
      const item = { id: `energy:${area}`, name, main_entity: g.list[0].ent, entities: g.list.map((x) => x.ent), x: g.ar.x, y: g.ar.y, area_id: area };
      const sp = this._chipSpec(item, name, { lines: [n > 1 ? `${n} · ${fmt}` : fmt], icon: "mdi:flash", ents: item.entities.filter((e) => this._hass.states[e]), kind: "reading", cls: "en" });
      sp.color = E_COLORS[g.i % E_COLORS.length];
      sp.energy = g.v;
      sp.unit = g.unit;
      sp.area = area;
      sp.elist = g.list.sort((x, y) => y.v - x.v);
      this._eTree(sp, g.list);
      out.push(sp);
    }
    return out;
  },

  /** Totals per room from the energy markers shown. */
  _eRooms(min = 1) {
    const by = {};
    const n = {};
    for (const sp of this._specs ? this._specs.values() : []) if (sp.energy > 0 && sp.area) {
      by[sp.area] = (by[sp.area] || 0) + (sp.eSum ?? sp.energy);
      n[sp.area] = (n[sp.area] || 0) + 1;
    }
    if (min > 1) for (const k of Object.keys(by)) if (n[k] < min) delete by[k];
    return by;
  },

  _eFmt(v) {
    return this._eSel() === "now" ? fmtW(v) : fmtKwh(v);
  },

  /** Rooms shaded by their share, in Home Assistant's energy colour. */
  _eFillHtml(a) {
    if (this._overlay !== "energy" || !this._layerOn("energy", "fill", true)) return "";
    const by = this._eRooms();
    const max = Math.max(...Object.values(by), 1e-9);
    const polys = Object.entries(a.areas || {}).filter(([id, r]) => by[id] > 0 && Array.isArray(r.shape) && r.shape.length >= 3).map(([id, r]) => `<polygon points="${r.shape.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:var(--energy-grid-consumption-color, #488fc2);fill-opacity:${(0.1 + 0.42 * Math.min(1, by[id] / max)).toFixed(3)}"></polygon>`).join("");
    return polys ? `<svg class="fresh efill" viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg>` : "";
  },

  /** Where the electrical panel and the solar / battery box are (placed in the Editor; else a good guess). */
  _ePoints(a) {
    // 0.11: the real grid meter / solar / battery when it's on the plan (its device, or the sensor itself), else the
    // point set in the Editor. No guessing: without an electrical panel there are no flow lines.
    const pts = a.energy_points || {};
    const srcs = (this._eData && this._eData.srcs) || [];
    const realAt = (kinds) => {
      for (const x of srcs.filter((q) => kinds.includes(q.kind))) {
        const en = this._hass.entities && this._hass.entities[x.stat];
        const it = this._items(a).find((i) => i.id === `entity:${x.stat}` || (en && en.device_id && i.id === en.device_id) || [i.main_entity, ...(i.entities || []), ...(i.allEntities || [])].includes(x.stat));
        if (it) return { x: (it.box || it).x, y: (it.box || it).y };
      }
      return null;
    };
    const has = (k) => srcs.some((x) => k.includes(x.kind));
    const rP = realAt(["grid"]);
    const rS = has(["solar"]) ? realAt(["solar"]) : null;
    const rB = has(["battery_out", "battery_in"]) ? realAt(["battery_out", "battery_in"]) : null;
    const panel = rP || pts.panel || null;
    const source = has(["solar"]) ? rS || pts.source || null : null;
    const battery = has(["battery_out", "battery_in"]) ? rB || pts.battery || null : null;
    // A point you set (no real device on the plan) is dashed, like phantoms.
    return { panel, source, battery, dummy: { panel: !rP, source: !rS, battery: !rB } };
  },

  /** The panel, the source and the flow lines: panel → every device using energy; source → panel. */
  _eFlowHtml(a) {
    this._eFlow = null;
    if (this._overlay !== "energy") return "";
    const { panel, source, battery, dummy } = this._ePoints(a);
    if (!panel) return "";
    if (this._layerOn("energy", "flow", this._layerDefault("energy", "flow"))) {
      this._eFlow = { panel, source, battery, sol: this._eSum("solar"), out: this._eSum("battery_out"), chg: this._eSum("battery_in") };
    }
    // 0.11: each point shows its value. The panel: Home Assistant's grid total (all grid meters together), else
    // the total of the devices on this plan; the lines flow into a number, as in Home Assistant.
    const onPlan = [...(this._specs ? this._specs.values() : [])].reduce((t, sp) => t + (sp.energy > 0 ? sp.eSum ?? sp.energy : 0), 0);
    const val = { panel: this._eSum("grid") || onPlan, source: this._eSum("solar"), battery: this._eSum("battery_out") };
    const pin = (p, icon, label, cls) => {
      const v = val[cls] > 0 ? this._eFmt(val[cls]) : "";
      return `<div class="epin ${cls} ${dummy[cls] ? "dummy" : ""} ${v ? "val" : ""}" style="left:${p.x}%;top:${p.y}%" title="${cesc(label)}${v ? ` · ${cesc(v)}` : ""}"><ha-icon icon="${icon}"></ha-icon>${v ? `<span>${cesc(v)}</span>` : ""}</div>`;
    };
    return `${pin(panel, "mdi:flash", dfT("energy.panel"), "panel")}${source ? pin(source, "mdi:solar-power-variant", dfT("energy.solar"), "source") : ""}${battery ? pin(battery, "mdi:home-battery", dfT("battery"), "battery") : ""}`;
  },

  /** Flow lines in pixels (drawn after the layout, to each chip's final spot), like Home Assistant's energy
   *  distribution: thin line, across then a rounded corner, one dot travelling along (faster = more). */
  _eFlowSvg(box, W, H, t0 = 0) {
    const f = this._eFlow;
    if (!f) return "";
    const P = (p) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });
    const elbow = (p, q) => {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const r = Math.min(14, Math.abs(dx), Math.abs(dy));
      return `M${p.x},${p.y} L${q.x - Math.sign(dx) * r},${p.y} Q${q.x},${p.y} ${q.x},${p.y + Math.sign(dy) * r} L${q.x},${q.y}`;
    };
    // 0.11: the plan is redrawn whenever a value changes; each dot starts where the clock says it should be
    // (not from the start), so the movement looks continuous. A per-line offset keeps the dots from bunching.
    let n = 0;
    const line = (d, c, dur, back) => {
      const t = Number(dur);
      const phase = ((Date.now() / 1000 + n++ * 0.37 * t) % t).toFixed(2);
      // begin is on this SVG's own clock: "now" there minus how far the dot should already be.
      return `<path class="eln" d="${d}" style="stroke:${c}"/><circle r="4" style="fill:${c}"><animateMotion dur="${t}s" begin="${(t0 - phase).toFixed(2)}s" repeatCount="indefinite" path="${d}"${back ? ` keyPoints="1;0" keyTimes="0;1" calcMode="linear"` : ""}/></circle>`;
    };
    const specs = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.energy > 0);
    const max = Math.max(...specs.map((sp) => sp.energy), 1e-9);
    const pan = P(f.panel);
    const at = (sp) => {
      const el = box.querySelector(`[data-k="${CSS.escape(sp.key)}"]`);
      return el && el.style.left.endsWith("px") ? { x: parseFloat(el.style.left), y: parseFloat(el.style.top) } : P(sp);
    };
    let out = specs.map((sp) => {
      // Like Home Assistant: the dot travels from the device to the panel (same line, other direction). A device
      // with an upstream device (a plug behind a sub-meter) flows into that one, when it's on the plan.
      const upSp = sp.up && specs.find((t) => t !== sp && t.stats && t.stats.has(sp.up));
      return line(elbow(upSp ? at(upSp) : pan, at(sp)), sp.color, (4 - 2.6 * (sp.energy / max)).toFixed(2), true);
    }).join("");
    // Like HA's distribution: solar → panel, battery → panel (discharging), solar (or panel) → battery (charging).
    const sol = f.source && P(f.source);
    const bat = f.battery && P(f.battery);
    if (sol && f.sol > 0) out += line(elbow(sol, pan), "var(--energy-solar-color, #ff9800)", 2);
    if (bat && f.out > 0) out += line(elbow(bat, pan), "var(--energy-battery-out-color, #4db6ac)", 2);
    if (bat && f.chg > 0) out += line(elbow(sol || pan, bat), "var(--energy-battery-in-color, #f06292)", 2);
    return out;
  },

  /** Total of one kind of source for the current selection. */
  _eSum(kind) {
    if (!this._eData) return 0;
    return this._eData.srcs.filter((x) => x.kind === kind).reduce((t, x) => t + this._eVal(x.stat, x.rate).v, 0);
  },

  /** Under the plan: total, top 3, sources, and the day scrubber (00:00 → now; left end Today, right end Now). */
  _eLegendHtml() {
    if (this._overlay !== "energy") return "";
    if (!this._eData) return `<div class="heatleg eleg">${dfT("energy.loading")}</div>`;
    if (!this._eData.devs.length) return `<div class="heatleg eleg">${this._eErr ? cesc(this._eErr) : dfT("energy.none_yet")}</div>`;
    const specs = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.energy > 0).sort((x, y) => y.energy - x.energy);
    const sum = specs.reduce((x, sp) => x + (sp.eSum ?? sp.energy), 0); // an upstream device's meter counts once
    const it = (icon, label, v, c) => `<span class="cl"><ha-icon icon="${icon}" style="color:${c}"></ha-icon>${cesc(label)} <b>${cesc(v)}</b></span>`;
    // 0.11: no device list (the chips and their colours say it); explain the room shading instead.
    const top = this._layerOn("energy", "fill", true) && Object.keys(this._eRooms()).length ? `<span class="cl"><i class="eshade"></i>${dfT("energy.rooms_darker")}</span>` : "";
    const sol = this._eSum("solar");
    const grid = this._eSum("grid");
    const batt = this._eSum("battery_out");
    const sumTxt = `${this._eSel() === "day" ? "" : `<span class="cl ewhen"><b>${cesc(this._eWhen())}</b></span>`}${it("mdi:flash", dfT("energy.on_plan"), this._eFmt(sum), "var(--energy-grid-consumption-color, #488fc2)")}${this._eOff >= (this._eSel() === "now" ? 1 : 0.005) ? it("mdi:map-marker-off-outline", dfT("energy.not_on_plan"), this._eFmt(this._eOff), "var(--secondary-text-color)") : ""}`;
    const srcTxt = `${grid > 0 ? it("mdi:transmission-tower", dfT("energy.grid"), this._eFmt(grid), "var(--energy-grid-consumption-color, #488fc2)") : ""}${sol > 0 ? it("mdi:solar-power", dfT("energy.solar"), this._eFmt(sol), "var(--energy-solar-color, #ff9800)") : ""}${batt > 0 ? it("mdi:home-battery", dfT("battery"), this._eFmt(batt), "var(--energy-battery-out-color, #4db6ac)") : ""}`;
    const hint = !this._ePoints(this._a || {}).panel && this._hass.user && this._hass.user.is_admin ? `<span class="cl">${dfT("energy.place_panel")}</span>` : "";
    return `${this._eScrubHtml()}<div class="heatleg eleg">${sumTxt}${srcTxt}${top}${hint}</div>`;
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- Home Replay (0.11.1)
  /** The card's clock: the replay time while replaying, else now (night look, motion, "ago", timers). */
  _now() {
    return this._rpT() ?? Date.now();
  },

  _rpT() {
    return this._rp && this._rp.t != null ? this._rp.t : null;
  },

  /** Replay is in use: open (rail / bar) or at a past time. */
  _rpIn() {
    return !!(this._rp && (this._rp.mode || this._rp.t != null));
  },

  /** Replay is open (the rail or the bar), at a past time or at Now. */
  _rpOn() {
    return !!(this._rp && (this._rp.mode || this._rp.t != null));
  },

  /** A replay control was pressed (on finger down, so a redraw while playing can't swallow it). */
  _rpCtl(t) {
    if (t.closest("[data-rpgo]")) {
      const bar = this.shadowRoot.querySelector(".ovbar");
      if (bar) this._railBox = { w: bar.offsetWidth, h: bar.offsetHeight }; // the replay rail keeps this size
      // test10: without a rail the round button also closes Replay; on Energy / Network (no replay) it replays Live.
      if (this._rp && this._rp.mode && !this._dockShown) return this._rpOpen(false);
      if (RP_SKIP.has(this._overlay)) this._setOverlay(this._rpOvs()[0] || "live");
      return this._rpOpen(true);
    }
    const rpo = t.closest("[data-rpov]");
    if (rpo) {
      this._rp.menu = false;
      return this._setOverlay(rpo.dataset.rpov);
    }
    const rpb = t.closest("[data-rp]");
    if (!rpb) return;
    const a = rpb.dataset.rp;
    if (a === "exit") return this._rpOpen(false);
    if (a === "pill") return this._rpAsk();
    if (a === "menu") {
      this._rp.menu = !this._rp.menu;
      return this._update(true);
    }
    if (a === "prev" || a === "next") return this._rpJump(a === "prev" ? -1 : 1);
    return this._rpPlay();
  },

  _rpSpan() {
    return ((this._rp && this._rp.range) || 24) * 3600000;
  },

  _rpState() {
    return (this._rp = this._rp || { t: null, mode: false, speed: Number(lsGet("dfc_rp_speed")) || 900, range: RP_RANGES.includes(Number(lsGet("dfc_rp_range"))) ? Number(lsGet("dfc_rp_range")) : 24 });
  },


  /** The history of everything the current overlay reads (plus the sun and every light, for the night look),
   *  for the chosen range; loaded again for another overlay or range, or after 5 min. */
  _rpLoad() {
    const rp = this._rpState();
    if (rp.loading) return rp.loading;
    const key = `${this._overlay}|${rp.range}|${this._floor || ""}`; // test11: the floor too (each floor has its own devices)
    if (rp.data && rp.key === key && Date.now() - rp.at < 300000) return Promise.resolve();
    const real = this._live || this._hass;
    const want = new Set([...(this._watch || []), "sun.sun"]);
    for (const item of this._items(this._a || {})) for (const e of item.bond ? item.entities : [item.main_entity]) if (e && domainOf(e) === "light") want.add(e);
    // 0.12.3: the entities a picture follows, so it takes the replayed moment's look.
    for (const item of this._items(this._a || {})) {
      const b = this._bodyOf(item);
      if (b && b.pic) {
        const pl = this._per(item, "live");
        // picked on purpose, or what decides the picture's On / Off (0.13.9.3: a sensor too): always replayed
        for (const e of [pl.when, pl.lead, pl.hl, ...b.sents]) if (e) want.add(e);
        for (const e of [b.lead, ...b.ents]) if (e && !["sensor", "button", "event", "update", "image"].includes(domainOf(e))) want.add(e);
      }
    }
    const ents = [...want].filter((e) => real.states[e]);
    const start = new Date(Date.now() - this._rpSpan()).toISOString();
    // Sensors only need their state (their unit etc. come from now); everything else with attributes.
    const q = (ids, full) => (ids.length ? real.callWS({ type: "history/history_during_period", start_time: start, entity_ids: ids, minimal_response: !full, no_attributes: !full, significant_changes_only: false }) : Promise.resolve({}));
    rp.loading = Promise.all([q(ents.filter((e) => domainOf(e) !== "sensor"), true), q(ents.filter((e) => domainOf(e) === "sensor"), false)])
      .then(([x, y]) => {
        const data = {};
        for (const [e, rows] of Object.entries({ ...x, ...y })) data[e] = rows.map((r) => ({ t: (r.lu || r.lc) * 1000, s: r.s, a: r.a })).filter((r) => r.t).sort((m, n) => m.t - n.t);
        rp.data = data;
        rp.own = new Set(this._watch || []); // the overlay's own entities (not the lights loaded for the night look)
        rp.model = null;
        rp.key = key;
      })
      .catch(() => {
        rp.data = rp.data || {};
      })
      .finally(() => {
        rp.at = Date.now();
        rp.snap = null;
        rp.loading = null;
        if (rp.t != null) this._hass = this._rpHass();
        this._update(true);
      });
    this._update(true);
    return rp.loading;
  },

  /** Home Assistant at the replay time: every entity's state from its history (now's for the rest). */
  _rpHass() {
    const rp = this._rp;
    const real = this._live;
    if (rp.snap && rp.snapT === rp.t && rp.snapBase === real) return rp.snap;
    const states = { ...real.states };
    let sig = "";
    for (const [e, rows] of Object.entries(rp.data || {})) {
      if (!rows.length) continue;
      let lo = 0, hi = rows.length - 1, i = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (rows[m].t <= rp.t) {
          i = m;
          lo = m + 1;
        } else hi = m - 1;
      }
      sig += `${i},`;
      const r = rows[i];
      const cur = real.states[e];
      const iso = new Date(r.t).toISOString();
      states[e] = { ...(cur || { entity_id: e }), state: r.s, attributes: r.a || (cur && cur.attributes) || {}, last_changed: iso, last_updated: iso };
    }
    // Nothing is switched in the past: a tap says how to get back.
    const callService = () => {
      this._toast(dfT("rp.no_switch"));
      return Promise.resolve();
    };
    rp.snap = { ...real, states, callService };
    rp.sig = sig;
    rp.snapT = rp.t;
    rp.snapBase = real;
    return rp.snap;
  },

  _rpSeek(t, light = false) {
    const rp = this._rp;
    if (!rp) return;
    if (t >= Date.now() - 20000) return this._rpLive();
    const enter = rp.t == null;
    rp.t = Math.max(Date.now() - this._rpSpan(), t);
    if (enter) this._pulseT = {}; // motion pulses start fresh in the past
    const sig = rp.sig;
    this._hass = this._rpHass();
    // 0.11.1: while playing, nothing on the plan changed → only the thumb, the time and the pill move.
    if (light && !enter && rp.sig === sig && this._rpMove()) return;
    this._update(true);
  },

  /** Move the thumb, the fill and the times in place (no redraw). False if the controls aren't there. */
  _rpMove() {
    const sr = this.shadowRoot;
    const tr = sr && sr.querySelector(".rptrack");
    if (!tr) return false;
    const rp = this._rp;
    const span = this._rpSpan();
    const T = rp.t ?? Date.now();
    const pct = this._rpPct(T, Date.now() - span, span).toFixed(2);
    const vert = tr.classList.contains("v");
    const th = tr.querySelector(".rpthumb");
    const fill = tr.querySelector(".rpline b");
    if (th) th.style[vert ? "bottom" : "left"] = `${pct}%`;
    if (fill) fill.style[vert ? "height" : "width"] = `${pct}%`;
    const em = tr.querySelector(".rpthumb em");
    rp.lab = this._rpLabel();
    if (em) em.textContent = rp.lab;
    const pill = sr.querySelector(".rppill span");
    if (pill && rp.t != null) pill.textContent = this._rpPillTxt();
    this._rpBub();
    return true;
  },

  /** test9: where the thumb is on the line (%). While dragging: under the finger. */
  _rpPct(T, t0, span) {
    const rp = this._rp;
    if (rp.drag && rp.dragPct != null) return rp.dragPct;
    return Math.max(0, Math.min(100, ((T - t0) / span) * 100));
  },

  /** The time at the thumb, in words: the clock (+ the line's value). */
  _rpLabel() {
    const rp = this._rp;
    if (rp.t == null) return dfT("rp.now");
    const T = rp.t;
    const m = this._rpModel();
    let lab = rpClock(T);
    if (m.line) {
      const span = this._rpSpan();
      const v = m.line[Math.min(m.n - 1, Math.max(0, Math.floor(((T - (Date.now() - span)) / span) * m.n)))];
      if (v != null) lab += ` · ${Math.round(v * 10) / 10}${m.unit || ""}`;
    }
    return lab;
  },

  /** The pill on the plan: the day and the time. */
  _rpPillTxt() {
    const T = this._rp.t;
    return `${this._rpWhen(T).day} ${rpClock(T)}`;
  },

  _rpPill() {
    return this._rpT() != null ? `<button class="rppill" data-rp="pill" title="${dfT("rp.tap_goto")}" aria-label="${dfT("rp.time")}: ${cesc(this._rpPillTxt())}. ${dfT("rp.tap_goto")}"><ha-icon icon="mdi:history"></ha-icon><span>${cesc(this._rpPillTxt())}</span></button>` : "";
  },

  /** test9: on a side rail the time bubble is drawn on the card itself, level with the thumb and right beside it
   *  (as a part of the rail the plan covered it). Shown while playing or dragging. */
  _rpBub() {
    const sr = this.shadowRoot;
    const b = sr && sr.querySelector(".rpbub");
    const rp = this._rp;
    if (!b || !rp) return;
    const th = sr.querySelector(".rptrack.v .rpthumb");
    const card = sr.querySelector("ha-card");
    const rail = sr.querySelector(".dockrow");
    if (!th || !card || !rail || !(rp.play || rp.drag)) {
      b.hidden = true;
      return;
    }
    const c = card.getBoundingClientRect();
    const t = th.getBoundingClientRect();
    const r = rail.getBoundingClientRect();
    const left = r.left - c.left <= c.right - r.right; // the rail is on the card's left
    b.textContent = rp.lab || "";
    b.style.top = `${t.top + t.height / 2 - c.top}px`;
    // test10: right beside the handle (over the bars), not beyond the rail.
    b.style.left = left ? `${t.right - c.left + 6}px` : "";
    b.style.right = left ? "" : `${c.right - t.left + 6}px`;
    b.hidden = false;
  },

  /** test9: tap the time pill → a small entry (day, time with optional seconds) → Replay goes there, paused.
   *  The entry lives outside the card's own drawing, so the card can keep redrawing under it. */
  _rpAsk() {
    const rp = this._rp;
    if (!rp || this._rpPop) return;
    // test10: the entry opens on the pill's own place (measured before the card redraws); with nothing to
    // measure, at the top centre of the card. Never in a corner of the page.
    const box = (x) => {
      const r = x && x.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    };
    const pr = box(this.shadowRoot.querySelector(".rppill"));
    const cr = box(this.shadowRoot.querySelector("ha-card")) || box(this);
    this._rpStop();
    this._update(true);
    const now = Date.now();
    const t0 = now - this._rpSpan();
    const T = rp.t ?? now;
    const p2 = (v) => String(v).padStart(2, "0");
    const days = [];
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    while (days.length < 4) {
      days.push(d.getTime());
      if (d.getTime() <= t0) break;
      d.setDate(d.getDate() - 1);
    }
    const cur = new Date(T);
    const curDay = new Date(T).setHours(0, 0, 0, 0);
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", dfT("rp.goto"));
    el.style.cssText = "position:fixed;z-index:10001;display:flex;align-items:center;gap:6px;padding:8px;border-radius:12px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#111);box-shadow:0 8px 24px rgba(0,0,0,.35);font:14px var(--paper-font-body1_-_font-family, Roboto, sans-serif)";
    const fld = "font:inherit;color:inherit;background:transparent;border:1px solid var(--divider-color,#ccc);border-radius:8px;padding:6px 8px;min-height:36px;box-sizing:border-box";
    el.innerHTML = `<select aria-label="${dfT("rp.day")}" style="${fld}">${days.map((x) => `<option value="${x}" ${x === curDay ? "selected" : ""}>${cesc(this._rpWhen(x + 43200000).day)}</option>`).join("")}</select><input type="time" step="1" aria-label="${dfT("rp.time_input")}" value="${p2(cur.getHours())}:${p2(cur.getMinutes())}:00" style="${fld}"><button data-go="1" style="font:inherit;font-weight:600;border:0;border-radius:8px;padding:0 14px;min-height:36px;cursor:pointer;background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff)">${dfT("rp.go")}</button><button data-x="1" aria-label="${dfT("close")}" style="font:inherit;border:0;background:transparent;color:inherit;min-width:36px;min-height:36px;cursor:pointer">✕</button>`;
    // Inside an open dialog (the Card Editor) the entry must live in that dialog to be reachable.
    let host = this;
    while (host && !(host instanceof HTMLDialogElement && host.open)) host = host.parentNode || host.host;
    (host || document.body).appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = pr ? pr.left + pr.width / 2 : cr ? cr.left + cr.width / 2 : window.innerWidth / 2;
    const cy = pr ? pr.top + pr.height / 2 : (cr ? cr.top : 0) + 14 + h / 2;
    const lo = Math.max(8, cr ? cr.left + 6 : 8);
    const hi = Math.max(lo, Math.min(window.innerWidth - 8, cr ? cr.right - 6 : window.innerWidth) - w);
    const x = Math.min(hi, Math.max(lo, cx - w / 2));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, cy - h / 2));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // A page that moves fixed elements (a transformed container): put it where it was meant to be.
    const ar = el.getBoundingClientRect();
    if (Math.abs(ar.left - x) > 1 || Math.abs(ar.top - y) > 1) {
      el.style.left = `${2 * x - ar.left}px`;
      el.style.top = `${2 * y - ar.top}px`;
    }
    const outside = (e) => !e.composedPath().includes(el) && close();
    const close = () => {
      document.removeEventListener("pointerdown", outside, true);
      el.remove();
      this._rpPop = null;
    };
    const go = () => {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(el.querySelector("input").value || "");
      if (!m) return;
      const t = new Date(Number(el.querySelector("select").value));
      t.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0);
      let at = t.getTime();
      close();
      if (at >= Date.now() - 20000) {
        this._toast(dfT("rp.future"));
        return this._rpLive();
      }
      const start = Date.now() - this._rpSpan();
      if (at < start) {
        at = start + 1000;
        this._toast(dfT("rp.before", { n: rp.range }));
      }
      this._rpLoad().then(() => this._rpSeek(at));
    };
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-go]")) go();
      else if (e.target.closest("[data-x]")) close();
    });
    for (const ev of ["keydown", "keyup", "keypress"]) el.addEventListener(ev, (e) => {
      e.stopPropagation();
      if (ev !== "keydown") return;
      if (e.key === "Enter") go();
      if (e.key === "Escape") close();
    });
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    this._rpPop = close;
    el.querySelector("input").focus();
  },

  _rpStop() {
    const rp = this._rp;
    if (!rp) return;
    clearInterval(rp.timer);
    rp.timer = null;
    rp.play = false;
  },

  /** To Now: the real Home Assistant (Replay stays open, at its end). */
  _rpLive(draw = true) {
    const rp = this._rpState();
    this._rpStop();
    if (rp.t != null) this._pulseT = {};
    rp.t = null;
    if (this._live) this._hass = this._live;
    if (draw) this._update(true);
  },

  /** Replay on / off (the rail button; ← Now closes it). */
  _rpOpen(on) {
    const rp = this._rpState();
    this._rpLive(false);
    rp.mode = on;
    rp.menu = false;
    if (this._rpPop) this._rpPop();
    // #105: "replay_global" (the mobile card): Replay is one mode for every overlay, not a layer per overlay.
    if (!this._dockShown && !this._config.replay_global) this._setLayer(this._overlay, "replay", on, false);
    if (on) this._rpLoad();
    this._update(true);
  },

  /** Play / pause. From Now it starts at the beginning of the range; the end is Now again. */
  _rpPlay() {
    const rp = this._rp;
    if (!rp) return;
    if (rp.play) {
      this._rpStop();
      return this._update(true);
    }
    rp.play = true;
    this._update(true);
    this._rpLoad().then(() => {
      if (!rp.play) return;
      let last = performance.now();
      this._rpSeek(rp.t ?? Date.now() - this._rpSpan());
      clearInterval(rp.timer);
      rp.timer = setInterval(() => {
        const n = performance.now();
        const next = (rp.t ?? Date.now()) + (n - last) * rp.speed;
        last = n;
        if (!this.isConnected || rp.t == null) return this._rpStop();
        this._rpSeek(next, true);
      }, 200);
    });
  },

  /** Previous / next moment worth seeing on this overlay's timeline (an event, a run starting, a busy hour);
   *  past the last one: Now. */
  _rpJump(dir) {
    this._rpStop();
    const go = () => {
      const rp = this._rp;
      const T = rp.t ?? Date.now();
      const t0 = Date.now() - this._rpSpan();
      const ts = this._rpModel().jumps.filter((t) => t > t0);
      if (dir < 0) {
        const p = ts.filter((t) => t < T - 60000).pop();
        this._rpSeek(p ?? t0);
      } else {
        const n = ts.find((t) => t > T + 60000);
        if (n != null) this._rpSeek(n);
        else this._rpLive();
      }
    };
    this._rpLoad().then(go);
  },

  /** Overlays Replay can play back (the ones on the rail, without Network). */
  _rpOvs() {
    return this._overlays().filter((o) => !RP_SKIP.has(o));
  },

  _rpWhen(T) {
    const d = new Date(T);
    const now = new Date();
    const y = new Date(now.getTime() - 86400000);
    const day = d.toDateString() === now.toDateString() ? dfT("rp.today") : d.toDateString() === y.toDateString() ? dfT("rp.yesterday") : d.toLocaleDateString(dfLocale(), { weekday: "short" });
    return { day, clock: rpClock(T) };
  },

  /** 0.11.1 test8: what this overlay's timeline shows (REPLAY-TIMELINE): { n, bars: [{kind: amount}], spans:
   *  [{lane, from, to, k}], line: [value | null] (per slot), jumps: [t] }. Bars and the line use n slots over the
   *  range; Energy one slot per hour. Cached until the data, the overlay, the range or the minute changes. */
  _rpModel() {
    const rp = this._rpState();
    const ov = this._overlay;
    const span = this._rpSpan();
    const now = Date.now();
    const ck = `${ov}|${rp.range}|${rp.at || 0}|${this._eData ? this._eData.t : 0}|${Math.floor(now / 60000)}`;
    if (rp.model && rp.model.ck === ck) return rp.model;
    const t0 = now - span;
    const real = this._live || this._hass;
    const states = (real && real.states) || {};
    const data = rp.data || {};
    const own = rp.own || new Set(this._watch || []);
    const ents = Object.keys(data).filter((e) => own.has(e) && data[e].length);
    const m = { ck, n: 96, bars: [], spans: [], line: null, jumps: [] };
    const slot = (t) => Math.min(m.n - 1, Math.max(0, Math.floor(((t - t0) / span) * m.n)));
    const bin = () => (m.bars = Array.from({ length: m.n }, () => ({})));
    const add = (t, k, v = 1) => {
      if (t <= t0) return;
      const b = m.bars[slot(t)];
      b[k] = (b[k] || 0) + v;
    };
    const kindsOf = { live: ["lt", "dv", "op", "mv"], security: ["op", "mv"] };
    const events = (ks) => {
      bin();
      for (const e of ents) {
        const k = rpKind(e, states[e]);
        if (!k || !ks.includes(k)) continue;
        const rows = data[e];
        for (let i = 1; i < rows.length; i++) {
          const on = domainOf(e) === "event" ? rows[i].s !== rows[i - 1].s && rows[i].s !== "unavailable" : rows[i].s !== rows[i - 1].s && RP_ON.has(rows[i].s);
          if (on && rows[i].t > t0) {
            add(rows[i].t, k);
            m.jumps.push(rows[i].t);
          }
        }
      }
    };
    const runs = (list) => {
      let lane = 0;
      for (const e of list) {
        const sp = rpSpans(e, data[e], t0, now);
        if (!sp.length) continue;
        const k = domainOf(e) === "light" ? "lt" : "dv";
        for (const [a, b] of sp) {
          m.spans.push({ lane, from: a, to: b, k, e });
          m.jumps.push(a);
        }
        lane++;
      }
      m.lanes = lane;
    };
    if (ov === "lights") {
      // How many lights (and light switches) were on in each slot.
      bin();
      const lights = ents.filter((e) => ["light", "switch"].includes(domainOf(e)));
      for (const e of lights) {
        for (const [a, b] of rpSpans(e, data[e], t0, now)) {
          for (let i = slot(a); i <= slot(b - 1); i++) m.bars[i].lt = (m.bars[i].lt || 0) + 1;
          m.jumps.push(a);
        }
      }
      m.linear = true;
    } else if (ov === "comfort") {
      // A line: the average indoor temperature; spans: ACs / heating really running.
      // test9: the same temperatures as the chips and the heatmap on the plan (each sensor once), not every
      // temperature entity of the devices (chip / device temperatures made the average too warm).
      const shown = new Set();
      for (const sp of (this._specs || new Map()).values()) for (const e of sp.heatEnts || sp.ents || []) shown.add(String(e).split("#")[0]);
      const temps = ents.filter((e) => shown.has(e) && domainOf(e) === "sensor" && kindOf(e, states[e]) === "temperature");
      const clim = ents.filter((e) => domainOf(e) === "climate");
      const src = [...temps.map((e) => [e, (r) => (num(r.s) ? Number(r.s) : NaN)]), ...clim.filter((e) => shown.has(e)).map((e) => [e, (r) => (r.a && num(r.a.current_temperature) ? Number(r.a.current_temperature) : NaN)])];
      if (src.length) {
        m.line = Array.from({ length: m.n }, (_, i) => {
          const t = t0 + ((i + 0.5) / m.n) * span;
          const vs = src.map(([e, f]) => {
            const row = rpAt(data[e], t);
            return row ? f(row) : NaN;
          }).filter((v) => Number.isFinite(v));
          return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null;
        });
        const u = ((states[src[0][0]] || {}).attributes || {}).unit_of_measurement;
        m.unit = u || (temps.length ? "" : "°");
      }
      runs(clim);
    } else if (ov === "health") {
      // A device going offline (grey), a battery dropping under the low level (orange).
      bin();
      const low = Number(this._ov("health").low ?? 20);
      for (const e of ents) {
        const rows = data[e];
        const bat = domainOf(e) === "sensor" && ((states[e] || {}).attributes || {}).device_class === "battery";
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].t <= t0) continue;
          if (rows[i].s === "unavailable" && rows[i - 1].s !== "unavailable") {
            add(rows[i].t, "off");
            m.jumps.push(rows[i].t);
          } else if (bat && Number(rows[i].s) < low && !(Number(rows[i - 1].s) < low) && Number.isFinite(Number(rows[i].s))) {
            add(rows[i].t, "bat");
            m.jumps.push(rows[i].t);
          }
        }
      }
    } else if (ov === "network") {
      // test11: how many devices were offline in each slot (their own entity unavailable); a jump at each drop.
      // A device offline for the whole range is left out.
      bin();
      const mains = new Set(this._items(this._a || {}).map((it) => it.main_entity).filter(Boolean));
      for (const e of ents) {
        if (!mains.has(e)) continue;
        const rows = data[e];
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].s !== "unavailable") continue;
          const a = Math.max(t0, rows[i].t);
          let j = i;
          while (j + 1 < rows.length && rows[j + 1].s === "unavailable") j++;
          const b = j + 1 < rows.length ? rows[j + 1].t : now;
          i = j;
          if (b <= t0 || (a <= t0 && b >= now)) continue; // offline the whole range: nothing happened (it is red on the plan)
          for (let k = slot(a); k <= slot(b - 1); k++) m.bars[k].off = (m.bars[k].off || 0) + 1;
          if (rows[j].t > t0 || a > t0) m.jumps.push(a);
        }
      }
      m.linear = true;
    } else if (ov === "cleaning") {
      runs(ents.filter((e) => ["vacuum", "lawn_mower"].includes(domainOf(e))));
    } else if (kindsOf[ov]) {
      events(kindsOf[ov]);
    } else {
      // Your own overlays: things that run as spans, single events (doors, motion, doorbell) as bars.
      const evk = ents.filter((e) => ["binary_sensor", "cover", "lock", "event"].includes(domainOf(e)));
      events(["op", "mv"]);
      runs(ents.filter((e) => !evk.includes(e) && ["light", "switch", "fan", "media_player", "climate", "vacuum", "lawn_mower", "sensor", "select", "input_select"].includes(domainOf(e)) && data[e].some((x) => rpRunning(e, x))));
    }
    m.jumps.sort((x, y) => x - y);
    rp.model = m;
    return m;
  },

  /** The timeline (horizontal or vertical): this overlay's bars, spans and line beside the line of time
   *  (REPLAY-TIMELINE), the line filled up to the thumb; the time shows on the thumb while dragging / playing. */
  _rpTrack(vert) {
    const rp = this._rp;
    const span = this._rpSpan();
    const now = Date.now();
    const t0 = now - span;
    const live = rp.t == null;
    const T = live ? now : rp.t;
    const pct = this._rpPct(T, t0, span);
    const m = this._rpModel();
    const N = m.n;
    const side = vert ? "bottom" : "left";
    const order = ["lt", "dv", "op", "mv", "off", "bat"];
    const tot = (m.bars || []).map((b) => Object.values(b).reduce((x, y) => x + y, 0));
    const max = Math.max(1e-9, ...tot, 0);
    const bars = (m.bars || []).map((bn, i) => {
      if (!tot[i]) return "";
      let acc = 0;
      const stops = order.filter((k) => bn[k]).map((k) => {
        const from = (acc / tot[i]) * 100;
        acc += bn[k];
        return `${RP_COL[k]} ${from.toFixed(0)}% ${((acc / tot[i]) * 100).toFixed(0)}%`;
      }).join(", ");
      // Amounts (lights on) grow in a straight line; event counts with the square root (one still shows).
      const h = Math.max(14, (m.linear ? tot[i] / max : Math.sqrt(tot[i] / max)) * 100).toFixed(0);
      return `<i style="${side}:${((i / N) * 100).toFixed(2)}%;--h:${h}%;--w:calc(100% / ${N} - 1px);background:linear-gradient(${vert ? "var(--rpgd)" : "to top"}, ${stops})"></i>`;
    }).join("");
    // Spans: one lane per device that ran (up to 4), a band from start to stop.
    const lanes = Math.min(4, m.lanes || 0);
    const spans = m.spans.filter((x) => x.lane < 4).map((x) => {
      const a = Math.max(0, ((x.from - t0) / span) * 100);
      const len = Math.max(0.6, ((x.to - x.from) / span) * 100);
      const nm = cesc(entName(this._live || this._hass, x.e));
      return `<s title="${nm} · ${rpClock(x.from)}–${rpClock(x.to)}" style="${side}:${a.toFixed(2)}%;${vert ? "height" : "width"}:${len.toFixed(2)}%;--lane:${x.lane};background:${RP_COL[x.k]}"></s>`;
    }).join("");
    // The line: a measured value (Comfort: average indoor temperature), scaled between its own min and max.
    let line = "";
    if (m.line && m.line.some((v) => v != null)) {
      const vs = m.line.filter((v) => v != null);
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const rng = hi - lo || 1;
      const pts = m.line.map((v, i) => (v == null ? null : [((i + 0.5) / N) * 100, 100 - ((v - lo) / rng) * 80 - 10])).filter(Boolean);
      const xy = pts.map(([a, b]) => (vert ? `${100 - b},${100 - a}` : `${a},${b}`)).join(" ");
      const f = (v) => String(Math.round(v * 10) / 10);
      // test9: the line in the Comfort heatmap's own colours (cool where it was cooler, warm where warmer), on the
      // heatmap's scale when it is shown, so the rail and the plan mean the same by a colour.
      const hm = this._heat && this._heat.hi > this._heat.lo ? this._heat : { lo, hi: lo + rng };
      const stops = [0, 0.25, 0.5, 0.75, 1].map((k) => `<stop offset="${k}" stop-color="rgb(${heatRgb(Math.max(0, Math.min(1, (lo + k * rng - hm.lo) / (hm.hi - hm.lo)))).map(Math.round).join(",")})"/>`).join("");
      const gr = vert ? 'x1="10" y1="0" x2="90" y2="0"' : 'x1="0" y1="90" x2="0" y2="10"';
      line = `<svg class="rpln" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rpg" gradientUnits="userSpaceOnUse" ${gr}>${stops}</linearGradient></defs><polyline points="${xy}" style="stroke:url(#rpg)"/></svg><span class="rpmm" title="${dfT("rp.avg_temp", { u: cesc(m.unit || "°") })}">${cesc(f(lo))}–${cesc(f(hi))}°</span>`;
    }
    // Hour marks on the line (every hour up to 24 h, every 2 h beyond): where a fast drag glues to.
    let ticks = "";
    const h1 = new Date(t0);
    h1.setMinutes(0, 0, 0);
    for (let t = h1.getTime() + 3600000; t < now; t += 3600000) {
      const hh = new Date(t).getHours();
      if (rp.range > 24 && hh % 2) continue;
      ticks += `<u class="${hh === 0 ? "d" : ""}" style="${side}:${(((t - t0) / span) * 100).toFixed(2)}%"></u>`;
    }
    const lab = (rp.lab = this._rpLabel());
    return `<div class="rptrack ${vert ? "v" : "h"} ${line ? "ln" : ""}" style="--lanes:${lanes}" role="slider" aria-label="${dfT("rp.time")}" aria-valuetext="${cesc(lab)}"><div class="rpbars">${bars}</div>${spans ? `<div class="rpspans">${spans}</div>` : ""}${line}<div class="rpticks">${ticks}</div><div class="rpline"><b style="${vert ? "height" : "width"}:${pct.toFixed(2)}%"></b></div><span class="rpthumb" style="${side}:${pct.toFixed(2)}%"><em>${cesc(lab)}</em></span></div>`;
  },

  /** 0.11.1: the replay rail: the overlay rail itself turned into Replay, same size, shape and colours
   *  (← Now · play · previous / next · timeline · speed · range); vertical in a side rail. The overlay to
   *  replay is picked beside Layers; the time is the pill on the plan (and on the thumb while it moves). */
  _rpRail(vert) {
    const rp = this._rpState();
    const now = this._config.replay_now === false ? "" : `<button class="rpnow" data-rp="exit" title="${dfT("rp.back_now")}"><ha-icon icon="mdi:arrow-left"></ha-icon><span>${dfT("rp.now")}</span></button>`;
    const play = `<button class="rpplay" data-rp="play" aria-label="${rp.play ? dfT("rp.pause") : dfT("rp.play")}"><ha-icon icon="mdi:${rp.play ? "pause" : "play"}"></ha-icon></button>`;
    const pn = `<span class="rppn"><button data-rp="prev" aria-label="${dfT("rp.prev")}"><ha-icon icon="mdi:skip-previous"></ha-icon></button><button data-rp="next" aria-label="${dfT("rp.next")}"><ha-icon icon="mdi:skip-next"></ha-icon></button></span>`;
    const speed = `<select class="rpspeed" aria-label="${dfT("rp.speed")}">${[60, 300, 900, 3600].map((v) => `<option value="${v}" ${v === rp.speed ? "selected" : ""}>${v}×</option>`).join("")}</select>`;
    const range = `<select class="rprange" aria-label="${dfT("rp.range")}">${RP_RANGES.map((v) => `<option value="${v}" ${v === rp.range ? "selected" : ""}>${v}h</option>`).join("")}</select>`;
    const cls = `rprail ${vert ? "v" : "h"} ${rp.play || rp.drag ? "act" : ""} ${rp.loading ? "ld" : ""}`;
    return vert
      ? `<div class="${cls}">${now}${play}${pn}<span class="rpend">${dfT("rp.now")}</span>${this._rpTrack(true)}<span class="rpend">−${rp.range}h</span>${speed}${range}</div>`
      : `<div class="${cls}">${now}${play}${pn}<span class="rptl">${this._rpTrack(false)}<span class="rpscale"><span>−${rp.range}h</span><span>${dfT("rp.now")}</span></span></span>${speed}${range}</div>`;
  },

  /** 0.11.1: in Replay, beside Layers: the overlay that is replayed (its icon), with the list of the others. */
  _rpOvBtn() {
    if (!this._rp || !this._rp.mode || !this._dockShown) return "";
    const ovs = this._rpOvs();
    if (ovs.length < 2) return "";
    const labels = this._config.overlay_names || {};
    const cur = this._ovDef(this._overlay) || {};
    const menu = this._rp.menu ? `<div class="rpmenu">${ovs.map((o) => `<button data-rpov="${cesc(o)}" class="${o === this._overlay ? "on" : ""}"><ha-icon icon="${cesc(this._ovDef(o).icon)}"></ha-icon>${cesc(labels[o] || this._ovDef(o).label)}</button>`).join("")}</div>` : "";
    return `<span class="rpovw"><button class="layers rpov ${this._rp.menu ? "on" : ""}" data-rp="menu" title="${dfT("rp.overlay")}" aria-label="${dfT("rp.overlay")}"><ha-icon icon="${cesc(cur.icon || "mdi:home")}"></ha-icon></button>${menu}</span>`;
  },

  /** Without a rail: the same controls as a bar under the plan (Layers → Home Replay). */
  _rpHtml() {
    return `<div class="rpbar">${this._rpRail(false)}</div>`;
  },

  /** test10: the last 24 hours, hour by hour (the current hour last), each split by source (grid, solar,
   *  battery; without sources: the devices' total). */
  _eHours() {
    const H = 3600000;
    const cur = Math.floor(Date.now() / H) * H;
    const ed = this._eData;
    const srcs = ed ? ed.srcs.filter((x) => E_COL[x.kind]) : [];
    return Array.from({ length: 24 }, (_, i) => {
      const ts = cur - (23 - i) * H;
      const parts = {};
      const add = (k, v) => v > 0 && (parts[k] = (parts[k] || 0) + v);
      if (ed && srcs.length) for (const x of srcs) add(x.kind, (ed.hours[x.stat] || {})[ts] || 0);
      else if (ed) for (const d of ed.devs) add("grid", (ed.hours[d.stat_consumption] || {})[ts] || 0);
      return { ts, parts, tot: Object.values(parts).reduce((x, y) => x + y, 0) };
    });
  },

  /** test10: Energy's own hours are back under the plan (they were in Home Replay in test8 / test9): a bar per
   *  hour of the last 24 hours, stacked in the Energy colours; "Last 24 h" (their sum) and "Now" (live W) at the
   *  ends. Tap or drag: the plan and the legend show that hour; the day change is marked. */
  _eScrubHtml() {
    const hrs = this._eHours();
    const max = Math.max(...hrs.map((h) => h.tot), 1e-9);
    const sel = this._eSel();
    const p2 = (h) => String(h).padStart(2, "0");
    const cols = hrs.map((h) => {
      const d = new Date(h.ts);
      const hh = d.getHours();
      let acc = 0;
      const stops = Object.keys(E_COL).filter((k) => h.parts[k]).map((k) => {
        const from = (acc / h.tot) * 100;
        acc += h.parts[k];
        return `${E_COL[k]} ${from.toFixed(0)}% ${((acc / h.tot) * 100).toFixed(0)}%`;
      }).join(", ");
      const lab = hh === 0 ? d.toLocaleDateString(dfLocale(), { weekday: "short" }) : hh % 3 === 0 ? p2(hh) : "";
      return `<i class="hr ${sel === h.ts ? "on" : ""} ${hh === 0 ? "day" : ""}" data-at="${h.ts}" title="${cesc(`${this._rpWhen(h.ts).day} ${p2(hh)}:00–${p2((hh + 1) % 24)}:00 · ${fmtKwh(h.tot)}`)}"><b style="height:${h.tot ? Math.round(3 + 27 * (h.tot / max)) : 2}px;background:${stops ? `linear-gradient(to top, ${stops})` : "var(--divider-color, rgba(0,0,0,.15))"}"></b>${lab ? `<small>${cesc(lab)}</small>` : ""}</i>`;
    }).join("");
    const idx = sel === "day" ? 0 : sel === "now" ? 25 : 1 + hrs.findIndex((h) => h.ts === sel);
    return `<div class="escrub"><div class="etrack ${typeof sel === "number" ? "pick" : ""}" style="grid-template-columns:3fr repeat(24, minmax(0, 1fr)) 2.2fr"><i class="end ${sel === "day" ? "on" : ""}" data-at="day">${dfT("energy.last24")}</i>${cols}<i class="end ${sel === "now" ? "on" : ""}" data-at="now">${dfT("rp.now")}</i></div><input type="range" class="erange" min="0" max="25" step="1" value="${idx}" aria-label="${dfT("energy.scrub")}" aria-valuetext="${cesc(this._eWhen())}"></div>`;
  },

  /** What the scrubber points at, in words. */
  _eWhen() {
    const sel = this._eSel();
    const p = (h) => String(h).padStart(2, "0");
    if (sel === "day" || sel === "now") return sel === "day" ? dfT("energy.last24") : dfT("energy.now_live");
    const h = new Date(sel).getHours();
    return `${this._rpWhen(sel).day} ${p(h)}:00–${p((h + 1) % 24)}:00`;
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** Network (#49): connection icon, role colour/shape, LQI as the ring; values only in the popup. */
  _netSpecs(item, name, cx, q) {
    const hass = this._hass;
    const opts = this._ov("network");
    // 0.8.2: a ZHA group (a device since HA 2026.11) has no radio of its own: not on the Network map.
    if (item.zha_group) return [];
    const conns = (item.conns || []).filter((c) => CONNS[c] && c !== "radio");
    // No known connection but a signal sensor: still a wireless device.
    if (!conns.length && (item.entities || []).some((e) => kindOf(e, hass.states[e]) === "signal")) conns.push("radio");
    if (!conns.length) return [];
    if (q) return [{ key: item.id }];
    const show = this._netShow();
    const visible = conns.filter((c) => show.includes(c));
    if (!visible.length) return [];
    // test12: a Bluetooth proxy (ESPHome, Shelly, …) shows as Bluetooth whenever Bluetooth is shown.
    const btp = !!item.bt_proxy && visible.includes("bluetooth");
    const conn = btp ? "bluetooth" : CONN_ORDER.find((c) => visible.includes(c));
    // test11, Replay: only what was recorded counts. ZHA's LQI and "available" are now-values, so the role stays,
    // the device's own entity says online / offline, and the ring comes from a recorded signal sensor only.
    const past = this._rpT() != null;
    const z0 = conns.includes("zigbee") && item.ieee ? cx.zha[ieeeKey(item.ieee)] : null;
    const z = z0 && past ? { ...z0, lqi: null, rssi: null, available: true } : z0;
    const unavailable = (z && !z.available) || ((!z || past) && item.main_entity && devOffline(hass, item, past) && !item.bond);
    const isAp = Object.values((this._a && this._a.aps) || {}).includes(item.id);
    let role = z && z.role ? z.role : isAp ? "ap" : cx.hubs.has(item.id) ? "hub" : conns.includes("zigbee") ? "end" : "device";
    if (btp && !["coordinator", "router", "hub"].includes(role)) role = "btproxy";
    else if (conn === "bluetooth" && role === "device") role = "end"; // test12: a Bluetooth sensor / beacon is an end device
    // test11: size by role (the role it has when online): hubs as before, routers a bit smaller, the rest small.
    const sz = ["coordinator", "ap", "hub", "btproxy"].includes(role) ? "" : role === "router" ? "szm" : "szs";
    if (unavailable) role = "unavailable";
    if (!z && conns.includes("zigbee") && !unavailable && !cx.hubs.has(item.id) && !isAp) role = Object.keys(cx.zha || {}).length ? "unknown" : "end";
    if ((this._net.roles || []).includes(role)) return [];
    // Signal: ZHA's LQI, else an enabled signal sensor.
    const sigEid = [...(item.entities || [])].find((e) => kindOf(e, hass.states[e]) === "signal" && live(hass.states[e]));
    let tone = "unknown";
    let ring = "";
    if (z && z.lqi != null) {
      ring = lqiColor(z.lqi);
      tone = z.lqi >= 150 ? "good" : z.lqi >= 100 ? "fair" : "poor";
    } else if (sigEid) {
      tone = signalTone(sigEid, hass.states[sigEid]);
      ring = { good: "#43a047", fair: "#fb8c00", poor: "#e53935" }[tone] || "";
    }
    if (opts.only_weak && tone !== "poor" && tone !== "fair") {
      if (tone === "unknown") this._skippedUnknown = (this._skippedUnknown || 0) + 1;
      return [];
    }
    const pos = item.box || item;
    const label = opts.labels && this._look().markers !== "icon" ? conns.map((c) => CONNS[c].label).join(" + ") : "";
    // 0.7.3: what the router says (access point, cable or Wi-Fi, network).
    const rs = item.router && hass.states[item.router];
    const rt = rs ? { eid: item.router, ap: rs.attributes.connected_to || "", lan: /lan|ethernet|cable/i.test(rs.attributes.connection_type || "") && !/wlan|wifi|wi-fi|wireless/i.test(rs.attributes.connection_type || ""), ssid: rs.attributes.ssid || "", ip: rs.attributes.ip || "", home: rs.state === "home" } : null;
    return [{ key: item.id, type: "net", item, name, conns, conn, role, ring, z, sigEid, rt, unavailable, ents: [item.main_entity].filter(Boolean), icon: conn === "network" && !(rt && rt.lan) ? { good: "mdi:wifi-strength-4", fair: "mdi:wifi-strength-2", poor: "mdi:wifi-strength-1" }[tone] || CONNS[conn].icon : CONNS[conn].icon, sz, tone, value: label, ieee: z ? item.ieee : null, x: pos.x, y: pos.y }];
  },

  /** 0.8.1: devices of the other floors (where they sit there), by device id, ZHA IEEE and access point. */
  _otherIdx() {
    const idx = { byId: {}, byIeee: {}, aps: {} };
    // 0.8.2: floors placed in one house (scaled and aligned): convert the other floor's spot into this floor's.
    const here = ((this._a || {}).frame || {}).box;
    for (const f of this._floors()) {
      if (f.id === this._floor) continue;
      const a2 = f.sensor.attributes || {};
      const there = (a2.frame || {}).box;
      const conv = here && there ? (x, y) => [((there.x + (x / 100) * there.w - here.x) / here.w) * 100, ((there.y + (y / 100) * there.h - here.y) / here.h) * 100] : (x, y) => [x, y];
      Object.assign(idx.aps, a2.aps || {});
      for (const it of this._items(a2)) {
        const pos = it.box || it;
        if (pos.x == null || it.phantom) continue;
        const conn = CONN_ORDER.find((c) => (it.conns || []).includes(c));
        const [gx, gy] = conv(pos.x, pos.y);
        const g = { key: `ghost:${f.id}:${it.id}`, name: this._dev(it.id).name || it.name, floor: f.name, x: gx, y: gy, conns: it.conns || [], icon: conn ? CONNS[conn].icon : "mdi:devices" };
        idx.byId[it.id] = g;
        if (it.ieee) idx.byIeee[ieeeKey(it.ieee)] = g;
      }
    }
    return idx;
  },

  /** 0.8.1: a device here linked to one on another floor: that one is drawn faded at its spot, with a normal line.
   *  Zigbee: a device with no router / coordinator next to it here gets its strongest link to one on another floor; Wi-Fi / LAN: its access
   *  point; hubs and bridges: the hub. Only direct links, never the other floor's network. */
  _netGhosts(specs) {
    if (this._floors().length < 2) return [];
    const idx = this._otherIdx();
    const out = new Map();
    const add = (g, link) => {
      const e = out.get(g.key) || { ...g, links: [] };
      e.links.push(link);
      out.set(g.key, e);
    };
    const net = specs.filter((s) => s.type === "net");
    const band = (v) => (LQI_BANDS.find((b) => v >= b.min) || LQI_BANDS[3]).min;
    if (this._net.links && this._zha && this._zha.links.length) {
      const here = {};
      for (const s of net) if (s.ieee) here[ieeeKey(s.ieee)] = s;
      const best = {};
      // Only for devices without a router or coordinator next to them on this floor ("headless").
      const isRt = (k) => ["router", "coordinator"].includes((this._zha.byIeee[k] || {}).role);
      const local = new Set();
      for (const l of this._zha.links) if (here[l.a] && here[l.b] && l.a !== l.b) {
        if (isRt(l.b)) local.add(l.a);
        if (isRt(l.a)) local.add(l.b);
      }
      for (const l of this._zha.links) {
        const hk = here[l.a] && !here[l.b] ? l.a : here[l.b] && !here[l.a] ? l.b : null;
        if (hk && local.has(hk)) continue;
        if (!hk) continue;
        const gk = hk === l.a ? l.b : l.a;
        const g = idx.byIeee[gk];
        const z = this._zha.byIeee[gk];
        if (!g || !z || (z.role !== "router" && z.role !== "coordinator")) continue;
        if (l.lqi < this._net.minLqi || (this._net.lqiOff || []).includes(band(l.lqi))) continue;
        const s = here[hk];
        if (!best[s.key] || best[s.key].lqi < l.lqi) best[s.key] = { g, lqi: l.lqi, s };
      }
      for (const b of Object.values(best)) add(b.g, { from: b.s.key, cls: "zb", color: lqiColor(b.lqi) });
    }
    if (this._net.wlinks && this._netShow().includes("network")) {
      const aps = this._apList();
      for (const s of net) {
        if (!s.rt || !s.rt.home || !s.rt.ap) continue;
        const id = ((this._a && this._a.aps) || {})[s.rt.ap] || idx.aps[s.rt.ap];
        if (!id || this._specs.has(id) || !idx.byId[id]) continue;
        add(idx.byId[id], { from: s.key, cls: `wl ${s.rt.lan ? "cab" : ""}`, color: AP_COLORS[Math.max(0, aps.indexOf(s.rt.ap)) % AP_COLORS.length] });
      }
    }
    if (this._net.hubs) {
      for (const s of net) {
        const via = s.item.via;
        if (!via || this._specs.has(via) || !idx.byId[via]) continue;
        if (s.conns.includes("zigbee") && (idx.byId[via].conns || []).includes("zigbee")) continue; // Zigbee: its own links above
        add(idx.byId[via], { from: s.key, cls: "hub" });
      }
    }
    return [...out.values()];
  },

  /** Connections shown in Network: the viewer's choice, else the card's default. */
  _netShow() {
    if (Array.isArray(this._net.conns) && this._net.conns.length) return this._net.conns;
    const opts = this._ov("network");
    return Array.isArray(opts.connections) && opts.connections.length && !opts.connections.includes("all") ? opts.connections : CONN_ORDER;
  },

  /** 0.7.3: access points in a stable order (the one with most devices first) for their colours. */
  _apList() {
    const a = this._a || {};
    if (this._apA === a) return this._aps;
    const n = {};
    for (const d of Object.values(a.devices || {})) {
      const st = d.router && this._hass.states[d.router];
      const k = st && st.attributes.connected_to;
      if (k) n[k] = (n[k] || 0) + 1;
    }
    this._apA = a;
    this._aps = Object.keys(n).sort((x, y) => n[y] - n[x] || x.localeCompare(y));
    return this._aps;
  },

  /** 0.11: appliance "done" state lives in Home Assistant, shared by every screen (was browser storage). */
  _applLoad() {
    if (this._applLoading || !this._hass) return;
    this._applLoading = true;
    const k = `appl_${this._lsKey()}`;
    const old = lsGet(`dfc_${k}`); // one-time move from this browser
    this._hass
      .callWS({ type: "device_floorplan/card_state/get" })
      .then((r) => {
        const v = (r && r.card_state && r.card_state[k]) || old || {};
        this._applDone = { ...v, ...(this._applDone || {}) };
        this._applSent = JSON.stringify(v);
        if (old) {
          lsSet(`dfc_${k}`, null);
          this._applSave();
        }
        this._update(true);
      })
      .catch(() => {
        this._applLoading = false; // older backend: try again later
      });
  },

  _applSave() {
    if (!this._hass || this._applSent === undefined) return;
    const v = JSON.stringify(this._applDone || {});
    if (v === this._applSent) return;
    this._applSent = v;
    this._hass.callWS({ type: "device_floorplan/card_state/set", key: `appl_${this._lsKey()}`, value: this._applDone || {} }).catch(() => {});
  },

  _saveNet() {
    const n = this._net;
    lsSet(`dfc_net_${this._lsKey()}`, { conns: n.conns, roles: n.roles, links: n.links, hubs: n.hubs, wlinks: n.wlinks, legend: n.legend, lqiOff: n.lqiOff });
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** Custom overlays (#109): ordered kinds; the first matching kind leads, the others become extra lines. */
  _customSpecs(item, name, allowed, def, q, ov) {
    const hass = this._hass;
    const kinds = Array.isArray(def.kinds) ? def.kinds : [];
    const added = this._added(item, def.id);
    if (def.mode === "manual" && !added) return [];
    let matches = def.mode === "manual" ? [] : kinds.map((k) => [k, this._entityForKind(item, k, allowed)]).filter((x) => x[1]);
    if (item.bond && matches.length) {
      // A bond leads with its combined value (#104); readings still add their lines.
      const k0 = matches[0][0];
      if (LIVE_KEY[this._mainKind(item)] === k0) matches[0] = [k0, item.main_entity];
    }
    const per = this._per(item, ov);
    if (per.lead && hass.states[per.lead]) {
      const k = kindOf(per.lead, hass.states[per.lead]);
      const key = ["temperature", "humidity", "battery"].includes(k) ? k : LIVE_KEY[k] || "other";
      matches = [[key, per.lead], ...matches.filter((x) => x[1] !== per.lead)];
    }
    if (!matches.length) {
      if (!added || !item.main_entity) return [];
      const k = this._mainKind(item);
      return [this._withExtras(this._valueChip(item, name, item.main_entity) || this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], k, {}), item, ov)];
    }
    if (q) return [{ key: item.id }];
    const [leadKey, lead] = matches[0];
    const rest = matches.slice(1);
    const st = hass.states[lead];
    let spec;
    let used = [lead];
    if (domainOf(lead) === "climate") {
      spec = this._climateChip(item, name, lead, null, null, { compact: true });
      used = used.concat(rest.filter((x) => x[1] === lead).map((x) => x[1]));
    } else if (leadKey === "temperature" || leadKey === "humidity") {
      const t = leadKey === "temperature" ? lead : null;
      const hm = leadKey === "humidity" ? lead : (rest.find((x) => x[0] === "humidity") || [])[1];
      if (hm) used.push(hm);
      const lines = [t ? this._fmtNum(t) : "", hm ? this._fmtNum(hm) : ""].filter(Boolean);
      spec = { ...this._chipSpec(item, name, { lines, ents: [t, hm].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: hm ? lines[lines.length - 1] : "" } };
    } else if (leadKey === "battery") {
      spec = (this._healthSpecs(item, name, [lead], { low: 20 }, false) || [])[0];
    } else {
      const k = item.bond && lead === item.main_entity ? this._mainKind(item) : kindOf(lead, st);
      spec = this._valueChip(item, name, lead) || this._liveSpec(item, name, lead, st, k, {});
      if (k === "light" && this._glowOnly(ov)) {
        if (!spec.on) return [];
        spec.glow = true;
      }
    }
    if (!spec) return [];
    const extras = rest.map((x) => x[1]).filter((e) => !used.includes(e));
    return [this._withExtras(spec, item, ov, extras)];
  },

  _isOn(eid, st, kind) {
    if (!live(st)) return false;
    const s = st.state;
    if (kind === "lock") return s === "unlocked" || s === "open" || s === "jammed";
    if (kind === "alarm") return s === "triggered";
    if (kind === "cover") return s === "open" || s === "opening";
    if (kind === "media") return s === "playing";
    if (kind === "climate") return s !== "off";
    if (kind === "appliance") return ["on", "cleaning", "mowing", "returning"].includes(s);
    // A status sensor as leading entity (printer, washer…): busy states count as "on".
    if (kind === "sensor" || kind === "other") return /^(on|running|printing|prepare|preparing|heating|busy|working|washing|drying|cleaning|active|in_progress|paused?)$/i.test(String(s).replace(/\s+/g, "_"));
    return s === "on" || s === "open" || s === "detected";
  },

  _liveSpec(item, name, eid, st, kind, opts) {
    const hass = this._hass;
    const look = this._look();
    let on = false;
    let value = "";
    let color = "var(--dfc-accent)";
    if (item.bond && (!eid || eid === item.main_entity)) {
      const sts = this._parts(item).map((e) => hass.states[e]).filter(Boolean);
      const n = sts.filter((s) => this._isOn(s.entity_id, s, kind)).length;
      on = n > 0;
      // 0.12.9: "how many are on" only when chosen; otherwise on if any is on, as the setting says.
      const showMode = this._per(item, this._overlay).show || item.show;
      if (showMode === "count" && sts.length > 1) value = `${n}/${sts.length}`;
    } else {
      on = this._isOn(eid, st, kind);
      if (kind === "climate" && st && st.attributes.current_temperature != null) value = this._attrVal(st, "current_temperature");
      if (["sensor", "binary", "other", "temperature", "humidity", "battery"].includes(kind) && st) value = this._fmt(eid);
      if (kind === "climate") color = st && CLIMATE_MODES[st.state] ? CLIMATE_MODES[st.state].color : color;
    }
    if (kind === "motion") color = "#43a047";
    if (kind === "opening") color = "#fb8c00";
    if (kind === "safety" || kind === "alarm") color = "#e53935";
    if (kind === "lock" && on) color = "#e53935";
    const dim = !on && ["opening", "motion", "safety"].includes(kind) && opts.quiet_small !== false;
    const unavail = !(item.bond && (!eid || eid === item.main_entity)) && !live(st);
    const showVal = look.markers !== "icon" && opts.values !== false;
    const bondAll = item.bond && (!eid || eid === item.main_entity);
    return { key: item.id, type: "marker", item, name, ents: bondAll ? this._parts(item) : [eid], eid, st, kind, on, dim, unavail, color, value: showVal ? value : "", icon: this._dev(item.id).icon || (bondAll ? item.icon : null), x: item.x, y: item.y };
  },

  /** test9: a device that only measures (nothing to switch or run) shows its value as a chip, the Comfort look,
   *  in every overlay it is in; a device you control keeps its icon. */
  /** 0.12.6: what an added device follows: your pick, else its main entity, else its first reading (no settings). */
  _addedLead(item) {
    const ok = (e) => e && this._hass.states[e] && !this._aux(e) && !NO_VALUE.has(domainOf(e));
    const all = [item.main_entity, ...this._allowed(item)];
    return all.find((e) => ok(e) && live(this._hass.states[e])) || all.find(ok) || null; // 0.12.9: none = nothing to draw
  },

  /** 0.12.6: a device drawn as itself, the look of the overlay that owns its kind (Live and own overlays). */
  _asItself(item, name, lead) {
    const hass = this._hass;
    const st = lead && hass.states[lead];
    if (!st) return null;
    const k = kindOf(lead, st);
    if (domainOf(lead) === "climate") return this._climateChip(item, name, lead, null, null, { compact: true });
    if (k === "temperature" || k === "humidity") {
      // 0.12.9: the Comfort chip: temperature first, humidity under it, whichever HA calls its main entity.
      const ents = this._allowed(item);
      const of = (kk) => (k === kk ? lead : ents.find((e) => !this._aux(e) && kindOf(e, hass.states[e]) === kk) || null);
      const t = of("temperature");
      const hm = of("humidity");
      const lines = [t ? this._fmtNum(t) : "", hm ? this._fmtNum(hm) : ""].filter(Boolean);
      return { ...this._chipSpec(item, name, { lines, ents: [t, hm].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: hm ? lines[lines.length - 1] : "" } };
    }
    if (k === "battery" || k === "sensor" || k === "reading" || domainOf(lead) === "sensor") {
      const line = ["temperature", "humidity", "battery", "sensor"].includes(k) ? this._fmtNum(lead) : this._fmt(lead);
      return { ...this._chipSpec(item, name, { lines: [line], ents: [lead], kind: "reading" }), rd: { t: line, h: "" } };
    }
    return this._liveSpec(item, name, lead, st, k, {});
  },

  _valueChip(item, name, e) {
    if (!e || item.bond || domainOf(e) !== "sensor") return null;
    if (!(item.group === "sensors" || (item.standalone && domainOf(item.main_entity || "") === "sensor"))) return null;
    const line = this._fmtNum(e);
    return { ...this._chipSpec(item, name, { lines: [line], ents: [e], kind: "reading" }), rd: { t: line, h: "" } };
  },

  /** Health: a device without a battery shows only while offline, as this chip. */
  _offChip(item, name) {
    return { ...this._chipSpec(item, name, { lines: [dfT("offline")], icon: "mdi:alert-circle-outline", ents: [item.main_entity], kind: "other", cls: "warn" }), offline: true };
  },

  _chipSpec(item, name, { lines, ents, kind, icon, cls = "" }) {
    return { key: `${item.id}|${ents.join(",")}`, type: "chip", item, name, lines, ents, kind, icon, cls, x: item.x, y: item.y };
  },

  _fmt(eid) {
    const st = this._hass.states[eid];
    if (!st || !live(st)) return "—";
    try {
      if (this._hass.formatEntityState) return this._hass.formatEntityState(st);
    } catch (_e) {
      /* fall back */
    }
    return `${st.state}${st.attributes.unit_of_measurement ? ` ${st.attributes.unit_of_measurement}` : ""}`;
  },

  /** Readings: the entity's own display precision if set, otherwise at most 1 decimal (#51). */
  _fmtNum(eid) {
    const st = this._hass.states[eid];
    if (!st || !live(st)) return "—";
    const reg = this._hass.entities && this._hass.entities[eid];
    if ((reg && reg.display_precision != null) || !num(st.state)) return this._fmt(eid);
    const v = Math.round(Number(st.state) * 10) / 10;
    const unit = st.attributes.unit_of_measurement || "";
    let n;
    try {
      n = v.toLocaleString(this._hass.locale && this._hass.locale.language ? this._hass.locale.language : undefined, { maximumFractionDigits: 1 });
    } catch (_e) {
      n = String(v);
    }
    return unit ? (unit === "%" ? `${n}%` : `${n} ${unit}`) : n;
  },

  _attrVal(st, attr) {
    try {
      if (this._hass.formatEntityAttributeValue) return this._hass.formatEntityAttributeValue(st, attr);
    } catch (_e) {
      /* fall back */
    }
    return `${st.attributes[attr]}°`;
  },

  // ------------------------------------------------------------- render
  /** 0.13.9.13: a room cut-out: everything around the room dimmed and greyed. */
  _focusHtml(a) {
    const ar = this._config.focus_area && (a.areas || {})[this._config.focus_area];
    if (!ar) return "";
    const sh = Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const hole = sh ? `M${sh.map((p) => `${p[0]} ${p[1]}`).join("L")}Z` : `M${ar.x - 6} ${ar.y}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z`;
    // 0.13.9.16: light just outside the room, stronger towards the edges (a radial fade from the room's centre).
    const xs = sh ? sh.map((p) => p[0]) : [ar.x - 6, ar.x + 6];
    const ys = sh ? sh.map((p) => p[1]) : [ar.y - 6, ar.y + 6];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rr = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    const R = Math.max(rr * 2.6, 30);
    const k = Math.min(0.9, rr / R);
    const stop = (o, op) => `<stop offset="${o}" style="stop-color:var(--dfc-focus-dim, var(--primary-background-color, #f2f2f2));stop-opacity:${op}"/>`;
    return `<svg class="focus" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="dfcfg" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${R}">${stop(0, 0.3)}${stop(k, 0.35)}${stop(Math.min(1, k + 0.25), 0.75)}${stop(1, 0.97)}</radialGradient></defs><path fill-rule="evenodd" fill="url(#dfcfg)" style="fill-opacity:1" d="M-200 -200H300V300H-200Z${hole}"/></svg>`;
  },

  /** 0.13.9.13: show an overlay (the mobile card's tabs). */
  /** What an overlay adds under the plan (scenes, actions, legends, Replay). #111: with "tools: side" (the mobile
   *  card in landscape) the controls become one icon column beside the plan and the legends open from its ⓘ, so
   *  the plan keeps the whole height; only the Replay bar stays under it. */
  _belowHtml(ov, specs, dockShown, layersInBar) {
    const scenes = ov === "lights" && !this._rpOn() ? this._sceneBarHtml(specs) : "";
    const acts = this._ovActsHtml(ov);
    const rp = !dockShown && !RP_SKIP.has(ov) && this._config.replay !== false && (this._config.replay_global ? !!(this._rp && this._rp.mode) : this._layerOn(ov, "replay", false)) ? this._rpHtml() : "";
    const secOk = ov === "security" && !specs.some((sp) => sp.kind !== "camera") && !this._layerOn("security", "all", this._layerDefault("security", "all"));
    const legends = () => `${this._heat ? this._heatLegendHtml() : ""}${this._cleanLegendHtml()}${this._eLegendHtml()}`;
    if (this._config.tools !== "side") {
      return `${scenes}${acts}${legends()}${rp}${secOk ? `<div class="heatleg secok"><span class="cl"><ha-icon icon="mdi:shield-check-outline"></ha-icon>${dfT("sec.all_secure")}</span></div>` : ""}${ov === "network" ? this._legendHtml(specs, layersInBar && !dockShown) : ""}`;
    }
    // #113: Network: the four connections as toggles (several at once); the legend in ⓘ.
    let net = "";
    let info = legends();
    if (ov === "network") {
      const shown = this._netShow();
      net = ["zigbee", "network", "bluetooth", "matter"].map((cn) => `<button class="tg ${shown.includes(cn) ? "on" : ""}" data-sconn="${cn}" aria-pressed="${shown.includes(cn)}"><ha-icon icon="${CONNS[cn].icon}"></ha-icon>${cesc(CONNS[cn].label)}</button>`).join("");
      const was = this._net.legend;
      this._net.legend = true;
      try {
        info += this._legendHtml(specs, false);
      } finally {
        this._net.legend = was;
      }
    }
    const sec = secOk ? `<button class="ok" disabled><ha-icon icon="mdi:shield-check-outline"></ha-icon>${dfT("sec.all_secure")}</button>` : "";
    const hasInfo = /\S/.test(info.replace(/<[^>]*>/g, ""));
    const tools = `${scenes}${acts}${net}${sec}${hasInfo ? `<button class="ti ${this._tinfo ? "on" : ""}" data-tinfo="1" aria-expanded="${!!this._tinfo}"><ha-icon icon="mdi:information-outline"></ha-icon>${dfT("net.legend")}</button>` : ""}`;
    const pop = hasInfo && this._tinfo ? `<div class="tinfo">${info}</div>` : "";
    return `${/<button/.test(tools) ? `<div class="tside">${tools}</div>${pop}` : ""}${rp}`;
  },

  /** #107: one room outlined on the plan (the mobile card's chosen room); null clears it. */
  dfOutlineRoom(id, txt = "") {
    if ((this._olRoom || null) === (id || null) && (this._olTxt || "") === txt) return;
    this._olRoom = id || null;
    this._olTxt = txt;
    if (this._config) this._update(true);
  },

  _olRoomSvg(a) {
    const ar = this._olRoom && a && a.areas && a.areas[this._olRoom];
    if (!ar) return "";
    const shape = Array.isArray(ar.shape) && ar.shape.length >= 3 ? `<polygon points="${ar.shape.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>` : `<ellipse cx="${ar.x}" cy="${ar.y}" rx="7" ry="9"/>`;
    return `<svg class="olroom" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${shape}</svg>`;
  },

  dfSetOverlay(ov) {
    if (!ov || ov === this._overlay || !this._config || !this._overlays().includes(ov)) return;
    if (this._rp && RP_SKIP.has(ov)) {
      this._rp.mode = false; // #101: Energy can't be replayed: back to Now, never a silent replay of Live
      this._rpLive(false);
    }
    // #105: in Replay another overlay is replayed at the same time (its history loaded after the redraw).
    const rpKeep = this._rp && this._rp.mode && !RP_SKIP.has(ov);
    this._overlay = ov;
    if (rpKeep) {
      const seek = () => this._rp && this._rp.t != null && this._rpSeek(this._rp.t);
      setTimeout(() => Promise.resolve(this._rp.loading).catch(() => {}).then(() => this._rpLoad()).then(seek), 0);
    }
    this._popup = null;
    this._menu = false;
    this._update(true);
  },

  _update(force = false) {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    // Nothing to do while nobody can see it: catch up when visible again (#72).
    if (document.hidden || !this.isConnected) {
      this._dirty = true;
      return;
    }
    if (!this._eData || this._overlay === "energy") this._eLoad(); // 0.11 Energy (only reloads every 5 min)
    const sensor = this._sensor();
    const parts = [sensor ? sensor.last_updated : "none", this._floor, this._overlay, this._img || "", this._imgFailed ? 1 : 0, JSON.stringify(this._popup || null), this._menu ? 1 : 0, JSON.stringify(this._net || {}), this._zha ? this._zhaAt : 0, this._hass.themes && this._hass.themes.darkMode ? 1 : 0];
    // Only the entities the current overlay reads; a power sensor ticking elsewhere changes nothing.
    for (const eid of this._watch || []) {
      const st = this._hass.states[eid];
      if (!st) {
        parts.push("-");
        continue;
      }
      // 0.11: any change of state or attributes (shutter position, AC activity, battery…) re-renders.
      parts.push(`${st.state}|${st.last_updated}`);
    }
    this._ns = this._nightState();
    parts.push(`n${this._ns.f}${this._ns.tint || ""}`);
    const nNew = this._hass.states["sensor.device_floorplan_new_devices"];
    parts.push(nNew ? nNew.state : "");
    parts.push(`e${this._eAt ?? ""}|${this._eData ? this._eData.t : ""}`);
    if (this._rp) parts.push(`rp${this._rp.t}|${this._rp.drag ? 1 : 0}|${this._rp.mode ? 1 : 0}|${this._rp.menu ? 1 : 0}|${this._rp.play ? 1 : 0}|${this._rp.loading ? 1 : 0}|${this._rp.speed}|${this._rp.range}|${this._rp.at || 0}`);
    const key = parts.join(";");
    if (!force && key === this._key) return;
    this._key = key;
    this._dirty = false;
    this._render(sensor);
  },

  /** Entities the current overlay reads for this item (what can change what it shows). */
  _reads(item, ov) {
    const hass = this._hass;
    const all = this._allowed(item);
    const ents = new Set(item.bond || item.phantom ? item.entities : []);
    const main = item.main_entity;
    // The main entity matters where its state decides what shows: switchable/visible kinds, and
    // availability in Health and Network. A plain sensor as main entity doesn't change Live.
    if (main && (ov === "health" || ov === "network" || LIVE_KEY[kindOf(main, hass.states[main])])) ents.add(main);
    const kinds = {
      comfort: ["temperature", "humidity", "climate"],
      security: ["opening", "motion", "lock", "alarm", "safety", "camera"],
      health: ["battery"],
      network: ["signal"],
    }[ov];
    if (kinds) for (const e of ov === "network" ? item.entities || [] : all) if (kinds.includes(kindOf(e, hass.states[e]))) ents.add(e);
    if (ov === "energy") for (const d of this._eIndex(this._a || {}).get(item.id) || []) if (d.stat_rate) ents.add(d.stat_rate);
    const def = this._ovDef(ov);
    if (def && def.custom) for (const e of all) if (["temperature", "humidity", "battery", "climate"].includes(kindOf(e, hass.states[e]))) ents.add(e);
    return ents;
  },

  _render(sensor) {
    const c = this._config;
    const look = this._look();
    const btn = this._buttons();
    const dark = this._hass.themes && this._hass.themes.darkMode;
    const chipMode = look.chips === "auto" ? (dark ? "dark" : "light") : look.chips;
    // 0.11: chips from the card editor (Look): style, background and text size as presets; a colour only for "Custom".
    const bgPct = { solid: 100, light: 60, clear: 35 }[look.chip_bg];
    const rgb = chipMode === "custom" && Array.isArray(look.chip_color) && look.chip_color.length === 3 ? look.chip_color.map((v) => Math.round(Number(v) || 0)) : null;
    const lum = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 : null;
    let chipVars = chipMode === "light" || (chipMode === "custom" && !rgb)
      ? `--dfc-chipbg: color-mix(in srgb, var(--card-background-color, #fff) ${bgPct ?? 92}%, transparent); --dfc-chipfg: var(--primary-text-color); --dfc-chipborder: var(--divider-color);`
      : `--dfc-chipbg: rgba(30,30,30,${((bgPct ?? 78) / 100).toFixed(2)}); --dfc-chipfg: #fff; --dfc-chipborder: rgba(255,255,255,.25);`;
    if (rgb) chipVars = `--dfc-chipbg: rgba(${rgb.join(",")},${((bgPct ?? 85) / 100).toFixed(2)}); --dfc-chipfg: ${lum > 0.6 ? "#1c1c1c" : "#fff"}; --dfc-chipborder: ${lum > 0.6 ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.25)"};`;
    chipVars += ` --dfc-chipsize: ${{ s: 30, l: 40, xl: 48 }[look.chip_size] || 34}px;`;
    const roomVars = dark ? "--dfc-roomfg:#fff; --dfc-roomhalo: rgba(0,0,0,.85);" : "--dfc-roomfg:#263238; --dfc-roomhalo: rgba(255,255,255,.95);";
    const style = `<style>${CARD_CSS}</style>`;
    if (!sensor) {
      setShadow(this, `${style}<ha-card><div class="msg">${dfT("card.plan_missing", { p: cesc(this._floor || c.plan) })}</div></ha-card>`);
      return;
    }
    const a = sensor.attributes;
    const url = this._imgFailed && a.image_fallback_url ? a.image_fallback_url : a.image_url;
    if (url && url !== this._imgFor) {
      this._imgFor = url;
      this._img = null;
      cardSign(this._hass, url)
        .then((p) => {
          this._img = p;
          this._update(true);
        })
        .catch(() => {
          this._img = url;
          this._update(true);
        });
    }
    const ov = this._overlay;
    if (ov === "network") this._loadZha();
    this._netTimer(ov === "network");
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const fr = this._frame(a, ratio); // 0.10.2: first, so markers know the space around the plan
    this._a = a;
    let specs = this._markers(a);
    this._heat = null;
    if (ov === "comfort") {
      if (this._layerOn("comfort", "heat", this._layerDefault("comfort", "heat"))) this._heat = this._heatGrid(a, specs, ratio);
      if (!this._layerOn("comfort", "labels", this._layerDefault("comfort", "labels"))) specs = specs.filter((sp) => sp.kind !== "reading");
      // 0.7.5: ACs / thermostats as their own layer (their temperatures still count in the heatmap above).
      if (!this._layerOn("comfort", "clim", this._layerDefault("comfort", "clim"))) specs = specs.filter((sp) => sp.kind !== "climate");
    }
    if (ov === "energy") specs = specs.concat(this._eRoomSpecs(a));
    // 0.11.1 test8: no cameras in Replay (there is no recorded video to replay), in every overlay.
    if (this._rpOn()) specs = specs.filter((sp) => !sp.cam);
    this._specs = new Map(specs.map((s) => [s.key, s]));
    this._ghosts = ov === "network" && !this._rpIn() ? this._netGhosts(specs) : [];
    const watch = new Set();
    // 0.7.0: doors, windows and shutters drive bars and room shading even without a marker.
    for (const o of this._openSpots(a)) watch.add(o.eid);
    if (ov === "live") for (const m of this._motionSpots(a)) watch.add(m.eid);
    // 0.12.3: what the pictures follow (a car's tracker, a bond's members), so they change with it.
    if (ov === "live") for (const item of this._items(a)) { const b = this._bodyOf(item); if (b && b.pic) { const pl = this._per(item, "live"); for (const e of [b.lead, pl.when, pl.lead, pl.hl, ...b.sw]) if (e) watch.add(e); } }
    if (ov === "live" || ov === "security") for (const item of this._items(a)) { const tg = this._liveWhen(item); if (tg) watch.add(tg); }
    if (ov === "live") for (const item of this._items(a)) { const ap = this._applOf(item); if (ap) for (const e of [ap.status, ap.remaining, ap.progress, ap.running, ap.power, ap.door, ap.plug]) if (e) watch.add(e); }
    if (ov === "network") for (const s of specs) if (s.rt) watch.add(s.rt.eid);
    if (ov === "live" || ov === "lights") for (const item of this._items(a)) for (const e of [item.main_entity, ...(item.entities || [])]) if (e && domainOf(e) === "media_player") watch.add(e);
    if (ov !== "plan") for (const item of this._items(a)) if (!this._hidden(item, ov)) for (const e of this._reads(item, ov)) watch.add(e);
    for (const s of specs) for (const e of s.ents || []) watch.add(e);
    if (ov === "lights") for (const sc of this._lights().scenes || []) for (const e of sc.lights || []) watch.add(e);
    // Night look: every light's state shapes the pools; people: person + room sensors.
    if (ov === "lights" || ((this._ns || {}).f > 0 && (this._night().overlays || []).includes(ov))) {
      for (const item of this._items(a)) for (const e of item.bond ? item.entities : [item.main_entity]) if (e && domainOf(e) === "light") watch.add(e);
    }
    if (this._peopleShown()) for (const pp of this._people()) for (const e of [pp.entity, pp.room, pp.room2, pp.distance]) if (e) watch.add(e);
    // 0.13.9.4 People distance: the Bermuda sensors of the same device (area, distance to each proxy)
    if (this._pdOn()) {
      const reg = this._hass.entities || {};
      for (const pp of this._people()) {
        const dev = pp.distance && (reg[pp.distance] || {}).device_id;
        if (dev) for (const e of Object.keys(reg)) if (reg[e].device_id === dev && e.startsWith("sensor.")) watch.add(e);
      }
    }
    for (const x of this._ovActs()) if ((x.overlay || "cleaning") === ov) for (const e of barEnts(this._hass, x.status || {})) watch.add(e);
    if (["live", "cleaning", "health"].includes(ov)) {
      const ents = this._hass.entities || {};
      for (const [eid, r] of Object.entries(a.robots || {})) {
        for (const e of [eid, r && r.source]) if (e) watch.add(e);
        // The robot's own device (battery, consumables, dock) for Cleaning and Health.
        const dev = ov !== "live" && ents[eid] && ents[eid].device_id;
        if (dev) for (const x of Object.values(ents)) if (x.device_id === dev) watch.add(x.entity_id);
      }
    }
    this._watch = [...watch].sort();
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    const nNew = Number((this._hass.states["sensor.device_floorplan_new_devices"] || {}).state) || 0;
    // 0.11.1: top left, away from Layers and the floor button; on a narrow card a short badge.
    const admin = isAdmin && nNew > 0 && !c.hide_admin_hint && !this._pick ? `<button class="admin" data-new="1" title="${dfT("admin.new_title", { n: nNew })}">${this._narrow ? dfT("admin.new_short", { n: nNew }) : dfT("admin.new_place", { n: nNew })}</button>` : "";
    const names = look.names === "always" ? "names-always" : look.names === "off" ? "names-off" : "";
    const dock = this._overlays();
    const labels = c.overlay_names || {};
    const vertical = btn.position === "left" || btn.position === "right";
    const dockShown = (dock.length > 1 || btn.shortcuts.some((x) => !x.hidden)) && btn.position !== "hidden";
    this._dockShown = dockShown;
    const rpRail = dockShown && this._rp && this._rp.mode;
    // Layers live in the floor rail when there is one, else in the button bar, never on the plan
    // (#63, #75); without a bar, in the legend row.
    const rpPos = this._rpBtnPos(dockShown);
    const layersOn = this._layersPos() !== "hidden";
    // test10: the round group is floors · Layers · Replay; with Layers hidden the Replay button keeps the corner.
    const lpos = layersOn || rpPos === "layers" ? this._layersPos(true) : "hidden";
    const grpOn = lpos !== "hidden";
    const floors = this._floorStack();
    const multi = floors.length > 1;
    const layersInBar = grpOn && lpos === "bar";
    // 0.7.5: a Layers corner on the bar's side shares that row / column (at its own end); "bar" = right after
    // the overlay buttons. Either way it sits outside the scrolling overlay buttons.
    const bp = btn.position;
    const touch = dockShown && grpOn && lpos !== "bar"
      && ((bp === "top" && lpos.startsWith("top")) || (bp === "bottom" && lpos.startsWith("bottom")) || (bp === "left" && lpos.endsWith("left")) || (bp === "right" && lpos.endsWith("right")));
    const atStart = touch && (vertical ? lpos.startsWith("top") : lpos.endsWith("left"));
    // Layers on the plan when it does not share the overlay buttons row.
    const lCorner = grpOn && !(layersInBar && dockShown) && !touch;
    // 0.13.3: admin notes (new overlay, release tip) float on the plan: they never push the Overlay Bar away.
    const notes = `${this._newOvHtml()}${this._tipHtml()}`;
    const pulseH = this._pulseHtml(a);
    const airH = this._airHtml(a);
    const cornerPos = ["top-left", "bottom-right", "bottom-left"].includes(lpos) ? lpos : "top-right";
    // 0.8.1: with several floors the floor button sits right next to Layers, on its right (one group, wherever Layers is).
    // test10: one order, counted from the plan's outer edge inwards: floors · Layers · Replay (so a group on the
    // left is the mirror of one on the right).
    const lg = () => {
      const parts = [rpPos === "layers" ? this._rpRoundBtn() : this._rpOvBtn(), layersOn ? this._layersBtn(true) : "", multi ? `<span class="fwrap">${this._floorHtml(floors)}</span>` : ""].filter(Boolean);
      return parts.length > 1 ? `<span class="lgroup ${lpos.endsWith("left") ? "rev" : ""}">${parts.join("")}</span>` : parts[0] || "";
    };
    const lgShown = () => lCorner || touch || (layersInBar && dockShown);
    const slot = (on) => `<span class="lslot ${on ? "" : "lvoid"}">${on ? lg() : ""}</span>`;
    const autoSt = dockShown && (btn.auto || Object.values(btn.actions || {}).some((x) => x && x.status && x.status.mode === "auto")) ? this._autoStatus() : {};
    // Card overlays · your own overlays · shortcuts, with a faint line where the group changes.
    const barItems = [
      ...dock.map((o) => {
        const d = this._ovDef(o);
        const oa = btn.actions[o] || {};
        return { g: OVERLAYS[o] ? 0 : 1, html: this._barBtn({ cls: o === ov ? "on" : "", attrs: `data-ov="${cesc(o)}" ${oa.hold_action ? 'data-bh="1"' : ""} aria-pressed="${o === ov}"`, icon: d.icon, label: labels[o] || d.label, st: this._btnStatus(oa.status, autoSt[o]) }) };
      }),
      ...btn.shortcuts.map((sc, i) => sc.hidden ? null : ({ g: 2, html: this._barBtn({ cls: "sc", attrs: `data-sc="${i}" data-bh="1"`, icon: sc.icon || "mdi:gesture-tap", label: sc.name || dfT("shortcut"), st: this._btnStatus(sc.status, null) }) })).filter(Boolean),
      // 0.11.1: Replay is a mode, not an overlay: last, after a divider.
      ...(rpPos === "bar" ? [{ g: 3, html: this._barBtn({ cls: "rpgo", attrs: 'data-rpgo="1"', icon: "mdi:history", label: dfT("rp.short") }) }] : []),
    ];
    const barHtml = barItems.map((x, i) => (i && x.g !== barItems[i - 1].g ? '<i class="bsep" aria-hidden="true"></i>' : "") + x.html).join("");
    const chev = (d) => `<button class="chev ${d}" data-chev="${d === "s" ? -1 : 1}" aria-label="${d === "s" ? dfT("bar.scroll_back") : dfT("bar.more")}"><ha-icon icon="mdi:chevron-${vertical ? (d === "s" ? "up" : "down") : d === "s" ? "left" : "right"}"></ha-icon></button>`;
    const barBg = btn.bar === "contrast" ? (this._hass.themes && this._hass.themes.darkMode ? "light" : "dark") : btn.bar;
    const dockHtml = dockShown
      ? `<div class="dockrow ${rpRail ? "rpm" : ""} ${touch ? "share" : ""} ${btn.rail ? `rail-${barBg}` : ""}">${touch ? slot(atStart) : ""}<div class="ovbar ${barBg} ${rpRail ? "rpmode" : ""} sh-${btn.shape} sz-${btn.size} ${vertical ? "vert" : ""}" ${rpRail && this._railBox ? `style="${vertical ? `width:${this._railBox.w}px` : `height:${this._railBox.h}px`}"` : ""}>${rpRail ? this._rpRail(vertical) : `${chev("s")}<nav class="dock ${btn.style === "icons" ? "icons" : ""}" aria-label="${dfT("bar.overlays")}" ${vertical ? 'aria-orientation="vertical"' : ""}>${barHtml}</nav>${chev("e")}`}</div>${layersInBar ? `<span class="lslot lbar">${lg()}</span>` : ""}${touch ? slot(!atStart) : ""}</div>`
      : "";
    const title = c.title ? `<div class="hdr">${cesc(c.title)}</div>` : "";
    let emptyMsg = "";
    const people = this._peopleHtml(a);
    // 0.7.7: no "nothing to show" text on the plan: an empty overlay just means nothing is happening.
    const pos = btn.position === "hidden" ? "bottom" : btn.position;
    const scale = this._scale || 1;
    const nOn = this._ns.f > 0 && (this._night().overlays || []).includes(ov);
    const boxCls = `${this._rpT() != null ? "rpon" : ""} ${nOn && this._ns.f >= 0.5 ? "nt" : ""} ${nOn && this._ns.f >= 0.5 && this._night().dim_quiet !== false ? "nq" : ""}`;
    const floatCls = dockShown && btn.space && btn.space !== "reserve" ? `float ${btn.space === "float_icons" ? "float-icons" : ""}` : "";
    setShadow(this, `${style}<ha-card class="ov-${cesc(ov || "")} dock-${pos} ${floatCls} ${dockShown && btn.rail ? "srail" : ""} ${this._narrow ? "narrow" : ""} ${c.tools === "side" ? "tsd" : ""}" style="--dfc-size:${Math.round((Number(look.size) || 34) * scale)}px;${chipVars}${roomVars}">
      <div class="main">${title}${admin}
        <div class="wrap ${names}"><div class="fr ${fr.crop ? "crop" : ""}" style="--fratio:${fr.ratio}"><div class="box ${boxCls}" style="--ratio:${ratio};${fr.style}">
          ${this._img ? `<img class="plan" src="${cesc(this._img)}" alt="${cesc(a.plan_name || "")}" draggable="false">` : ""}
          ${this._focusHtml(a)}${this._tapLayer(pulseH, airH)}${this._picHtml(a)}${this._heat ? `<canvas class="heat"></canvas>` : ""}${this._nightHtml(a)}${pulseH}${this._xmasHtml(a)}${this._picHtml(a, "hl")}${this._touchHtml(a)}${this._tvHtml(a)}${airH}${this._barsHtml(a)}${this._applHtml(a)}
          ${this._roomsHtml(a)}
          ${this._freshHtml(a)}${this._eFillHtml(a)}${this._eFlowHtml(a)}${this._robotHtml()}<svg class="lines"></svg>${this._winHtml()}
          ${this._olRoomSvg(a)}${specs.map((s) => (s.type === "chip" ? this._chipHtml(s) : s.type === "robot" ? this._robotMarker(s) : this._markerHtml(s))).join("")}${this._ghosts.map((g) => `<div class="gdev" data-ghost="1" style="left:${g.x}%;top:${g.y}%" aria-label="${cesc(`${g.name} · ${g.floor}`)}"><ha-icon icon="${cesc(g.icon)}"></ha-icon></div>`).join("")}${people.plan}${emptyMsg}${lCorner ? "" : this._rpPill()}
        </div>${lCorner ? `<div class="lcorner ${cornerPos}">${this._rpPill()}${lg()}</div>` : ""}${notes ? `<div class="notes">${notes}</div>` : ""}</div></div>${people.row}
        ${this._belowHtml(ov, specs, dockShown, layersInBar)}
      </div>${dockHtml}${layersOn && this._menu ? this._layersMenu(a) : ""}${multi && !lgShown() ? `<div class="fcorner"><span class="fwrap">${this._floorHtml(floors)}</span></div>` : ""}${this._popupHtml()}${rpRail && vertical ? '<div class="rpbub" hidden></div>' : ""}</ha-card>`);
    if (rpRail && vertical) {
      this._rpBub();
      requestAnimationFrame(() => this._rpBub()); // again once the rail has its final height
    }
    // #111: the side tools are icons only: their names as tooltips / for screen readers.
    for (const b of this.shadowRoot.querySelectorAll(".tside button")) {
      const t = b.textContent.trim();
      if (t) {
        b.title = t;
        b.setAttribute("aria-label", t);
      }
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-ent]")) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.ent];
    }
    const img = this.shadowRoot.querySelector("img.plan");
    if (img && a.image_fallback_url && !this._imgFailed && !img._dfErr) {
      img._dfErr = true;
      img.addEventListener("error", () => {
        this._imgFailed = true;
        this._update(true);
      }, { once: true });
    }
    for (const bm of this.shadowRoot.querySelectorAll("img.nbm")) {
      bm.addEventListener("error", () => {
        if (DFC_BRAND.matter.bad) return;
        DFC_BRAND.matter.bad = true; // no image: our "M"
        this._update(true);
      }, { once: true });
    }
    this._attachVids();
    const box = this.shadowRoot.querySelector(".box");
    if (this._ro && box) {
      this._ro.disconnect();
      this._ro.observe(box);
      this._ro.observe(this); // 0.8.2: the card's own size (the plan fits its free area)
    }
    this._layoutSoon();
    requestAnimationFrame(() => this._alignFloor());
    if (this._heat) requestAnimationFrame(() => this._drawHeat());
    if (this._menu) requestAnimationFrame(() => this._placeMenu());
    if (this._pillUntil && this._pillUntil > Date.now()) {
      clearTimeout(this._pillT);
      this._pillT = setTimeout(() => {
        const pl = this.shadowRoot.querySelector(".pill.show");
        if (pl) pl.classList.remove("show");
      }, this._pillUntil - Date.now());
    }
    // 0.12.5: Flow: one light runs around the outline; its dash is sized to the outline's length on screen.
    picSizeFlow(this.shadowRoot);
    if (this._busy && this._busy.size && this._specs) {
      for (const el of this.shadowRoot.querySelectorAll("[data-k]")) {
        const sp = this._specs.get(el.dataset.k);
        if (sp && sp.item && this._busyOn(sp.item.id)) el.classList.add("busy");
      }
    }
    if (box && !box._swipe) this._bindSwipe(box);
    if (box) this._boxW = box.getBoundingClientRect().width || this._boxW;
    this._announce();
    if (this._popup && this._popup.type === "readings") this._fillHistory();
    if ((this._popup && this._popup.type === "info") || this._prevShown) requestAnimationFrame(() => this._placeInfo());
  },

  /** Put the layers menu next to its button, inside the card (bar below, above, left or right). */
  _placeMenu() {
    const card = this.shadowRoot.querySelector("ha-card");
    const btn = this.shadowRoot.querySelector("[data-menu]");
    const menu = this.shadowRoot.querySelector(".lmenu");
    if (!card || !btn || !menu) return;
    const c = card.getBoundingClientRect();
    // 0.8.1: a long menu scrolls inside the card.
    menu.style.maxHeight = `${Math.max(120, c.height - 12)}px`;
    const b = btn.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const corner = btn.closest(".lcorner");
    const shared = btn.closest(".lslot");
    const pos = corner ? "corner" : shared ? `s-${this._buttons().position}` : this._buttons().position;
    let x;
    let y;
    if (pos.startsWith("s-")) {
      // From a shared row / column the menu opens towards the plan.
      const bp = pos.slice(2);
      if (bp === "left" || bp === "right") {
        x = bp === "right" ? b.left - m.width - 8 : b.right + 8;
        y = b.top + b.height / 2 < c.top + c.height / 2 ? b.top : b.bottom - m.height;
      } else {
        x = b.left + b.width / 2 < c.left + c.width / 2 ? b.left : b.right - m.width;
        y = bp === "top" ? b.bottom + 8 : b.top - m.height - 8;
      }
    } else if (pos === "corner") {
      const lp = this._layersPos();
      x = lp.endsWith("right") ? b.right - m.width : b.left;
      y = lp.startsWith("top") ? b.bottom + 8 : b.top - m.height - 8;
    } else if (pos === "left") {
      x = b.right + 8;
      y = b.top + b.height / 2 - m.height / 2;
    } else if (pos === "right") {
      x = b.left - m.width - 8;
      y = b.top + b.height / 2 - m.height / 2;
    } else if (pos === "top") {
      x = b.right - m.width;
      y = b.bottom + 8;
    } else {
      x = b.right - m.width;
      y = b.top - m.height - 8;
    }
    x = Math.max(c.left + 6, Math.min(c.right - m.width - 6, x));
    y = Math.max(c.top + 6, Math.min(c.bottom - m.height - 6, y));
    menu.style.left = `${x - c.left}px`;
    menu.style.top = `${y - c.top}px`;
    menu.style.visibility = "visible";
  },

  _loadZha(force = false) {
    if (!this._hass.user || !this._hass.user.is_admin || this._zhaBusy) return;
    if (!force && this._zha && Date.now() - this._zhaAt < 300000) return;
    this._zhaBusy = true;
    zhaDevices(this._hass, force ? 0 : 300000).then((d) => {
      this._zhaBusy = false;
      if (!d) return;
      this._zha = d;
      this._zhaAt = Date.now();
      if (this._overlay === "network") this._update(true);
    });
  },

  /** While Network is open: quietly reload ZHA data every 5 minutes (#66). */
  _netTimer(on) {
    if (on && !this._netT) this._netT = setInterval(() => this._loadZha(true), 300000);
    if (!on && this._netT) {
      clearInterval(this._netT);
      this._netT = null;
    }
  },

  /** ↻ Refresh: ask ZHA for a new neighbour scan, then reload (#66). */
  async _refreshZha() {
    if (this._scanning) return;
    this._scanning = true;
    this._update(true);
    try {
      await this._hass.callWS({ type: "zha/topology/update" });
    } catch (_e) {
      /* older HA / not ZHA: reload only */
    }
    await new Promise((r) => setTimeout(r, 6000));
    this._zhaBusy = false;
    this._loadZha(true);
    await new Promise((r) => setTimeout(r, 14000));
    this._zhaBusy = false;
    this._scanning = false;
    this._loadZha(true);
  },

  /** Floor rail (#75): Layers on top (Network), ▲ floors ▼. */
  /** 0.8.1: one round button with the floor number; tapped, it becomes the floor rail (▲ · floors · ▼), on the plan. */
  _floorHtml(floors) {
    const cur = floors.find((f) => f.id === this._floor) || floors[0];
    // 0.12.1: one rail button per level; a level with several plans also gets ◀ ▶ (only then).
    const [lv, li, si] = this._levelAt();
    const here = lv[li] ? lv[li].plans : [cur];
    const sides = here.length > 1;
    const hf = ((this._hass && this._hass.floors) || {})[cur.floor_id];
    const full = sides && hf && hf.name && hf.name.toLowerCase() !== cur.name.toLowerCase() ? `${hf.name} · ${cur.name}` : cur.name;
    if (!this._fopen) return `<button class="fbtn" data-fbtn="1" title="${dfT("floor.change_t", { f: cesc(full) })}" aria-label="${dfT("floor.change_a", { f: cesc(full) })}" aria-expanded="false"><ha-icon icon="mdi:office-building-outline"></ha-icon><b class="badge">${cesc(cur.label)}</b></button>`;
    const btn = (g, i) => {
      const f = i === li ? cur : g.plans[si] || g.plans[0];
      const nm = i === li ? full : f.name;
      return `<button class="fl ${i === li ? "on" : ""}" data-floor="${cesc(f.id)}" aria-pressed="${i === li}" aria-label="${cesc(nm)}" title="${cesc(nm)}">${cesc(f.label)}<span class="pill">${cesc(nm)}</span></button>`;
    };
    const side = sides
      ? `<span class="sides"><button class="arrow" data-side="-1" aria-label="${dfT("floor.left")}${si > 0 ? `: ${cesc(here[si - 1].name)}` : ""}" ${si <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-left"></ha-icon></button><button class="arrow" data-side="1" aria-label="${dfT("floor.right")}${si < here.length - 1 ? `: ${cesc(here[si + 1].name)}` : ""}" ${si >= here.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button></span>`
      : "";
    return `<div class="rail" role="toolbar" aria-label="${dfT("floor.floors")}">
      <button class="arrow" data-step="1" aria-label="${dfT("floor.up")}" ${li <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      ${lv.map(btn).join("")}
      <button class="arrow" data-step="-1" aria-label="${dfT("floor.down")}" ${li >= lv.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button>${side}</div>`;
  },

  /** 0.8.1: the floor rail opens towards the plan: downwards from a button in the upper half, else upwards. */
  _alignFloor() {
    const sr = this.shadowRoot;
    const card = sr && sr.querySelector("ha-card");
    if (!card) return;
    const c = card.getBoundingClientRect();
    sr.querySelectorAll(".fwrap").forEach((w) => {
      const r = w.getBoundingClientRect();
      w.classList.toggle("up", r.top > c.top + c.height / 2);
    });
  },

  /** Swipe up / down on the plan changes the floor (touch; option floors.swipe). */
  _bindSwipe(box) {
    box._swipe = true;
    let st = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      st = { x: e.clientX, y: e.clientY, t: Date.now() };
    });
    box.addEventListener("pointerup", (e) => {
      if (!st || this._floorStack().length < 2 || this._config.floor_swipe === false) return (st = null);
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      const fast = Date.now() - st.t < 700;
      st = null;
      if (fast && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.6) {
        this._swiped = true;
        this._stepFloor(dy < 0 ? 1 : -1);
      } else if (fast && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && this._levelAt()[0][this._levelAt()[1]].plans.length > 1) {
        // 0.12.1: sideways between the plans of this level (only when the level has more than one).
        this._swiped = true;
        this._stepSide(dx < 0 ? 1 : -1);
      }
    });
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.7.4: Comfort heatmap. Each shaped room is coloured from the temperatures on the plan: its own
   *  sensors count fully, rooms open to it (shapes that overlap) count less, the rest only a little, so a
   *  room with one sensor still gets a warmer and a cooler side. 0.8.1: rooms are open to each other where
   *  their shapes touch or overlap (as for daylight), and a room without a sensor takes a gradient from the
   *  rooms it opens into, also step by step (hallway → corridor → bedroom), slightly faded as an estimate.
   *  Only a room with no way to any sensor stays uncoloured. Scale: lowest to highest reading shown now. */
  _heatGrid(a, specs, ratio) {
    const rooms = Object.entries(a.areas || {}).filter(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3);
    if (!rooms.length) return null;
    // The temperatures Comfort shows, each sensor once and at its own spot: a phantom counts with its real
    // member sensors where they are placed (also when they are hidden from Comfort), at the phantom's
    // spot only when a member has no spot of its own. A sensor shown both on its own and in a phantom counts once.
    const hass = this._hass;
    const spotOf = {};
    for (const d of Object.values(a.devices || {})) if (d.x != null) for (const e of d.entities || []) if (!spotOf[e]) spotOf[e] = d;
    for (const [e, d] of Object.entries(a.entities || {})) if (d && d.x != null) spotOf[e] = d;
    const tempOf = (e) => {
      const st = hass.states[e];
      if (!live(st)) return null;
      if (domainOf(e) === "climate") return num(st.attributes.current_temperature) ? Number(st.attributes.current_temperature) : null;
      return kindOf(e, st) === "temperature" && num(st.state) ? Number(st.state) : null;
    };
    const byEnt = new Map();
    for (const sp of specs) {
      for (const e of new Set((sp.heatEnts || sp.ents || []).map((x) => String(x).split("#")[0]))) {
        const v = tempOf(e);
        if (v == null) continue;
        const at = sp.phantom ? spotOf[e] || sp : sp;
        const prev = byEnt.get(e);
        if (prev && !(prev.viaPhantom && !sp.phantom)) continue;
        byEnt.set(e, { x: at.x, y: at.y, v, viaPhantom: !!sp.phantom });
      }
    }
    const pts = [...byEnt.values()].map((p) => ({ ...p, ri: rooms.findIndex(([, r]) => inPoly(p.x, p.y, r.shape)) }));
    if (!pts.length) return null;
    const GW = 120;
    const GH = Math.max(20, Math.round(GW / ratio));
    const cellRooms = new Array(GW * GH);
    // Open to each other: shapes that touch or overlap; hops = steps between two rooms.
    const n = rooms.length;
    const link = rooms.map(() => new Set());
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const A = rooms[p][1].shape;
      const B = rooms[q][1].shape;
      if (polysOverlap(A, B) || polysTouch(A, B)) {
        link[p].add(q);
        link[q].add(p);
      }
    }
    const hops = rooms.map((_r, k) => {
      const d = new Array(n).fill(Infinity);
      d[k] = 0;
      const queue = [k];
      while (queue.length) {
        const c = queue.shift();
        for (const q of link[c]) if (d[q] === Infinity) {
          d[q] = d[c] + 1;
          queue.push(q);
        }
      }
      return d;
    });
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = ((i + 0.5) / GW) * 100;
        const y = ((j + 0.5) / GH) * 100;
        const inside = [];
        rooms.forEach(([, r], k) => {
          if (inPoly(x, y, r.shape)) inside.push(k);
        });
        cellRooms[j * GW + i] = inside;
      }
    }
    const own = rooms.map((_r, k) => pts.some((p) => p.ri === k));
    const lit = rooms.map((_r, k) => own[k] || own.some((o, q) => o && hops[k][q] < Infinity));
    let lo = Math.min(...pts.map((p) => p.v));
    let hi = Math.max(...pts.map((p) => p.v));
    if (hi - lo < 1.5) {
      const mid = (hi + lo) / 2;
      lo = mid - 0.75;
      hi = mid + 0.75;
    }
    const val = new Float32Array(GW * GH).fill(NaN);
    const est = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const inside = cellRooms[j * GW + i];
        const k = inside.find((q) => lit[q]);
        if (k == null) continue;
        const x = ((i + 0.5) / GW) * 100;
        const y = ((j + 0.5) / GH) * 100;
        let sw = 0;
        let sv = 0;
        if (!inside.some((q) => own[q])) est[j * GW + i] = 1;
        for (const p of pts) {
          const h = p.ri < 0 ? Infinity : Math.min(...inside.map((q) => hops[q][p.ri]));
          const f = h === 0 ? 1 : Math.max(0.08, 0.4 ** h);
          const d2 = (x - p.x) ** 2 + ((y - p.y) / ratio) ** 2;
          const w = f / (d2 + 4);
          sw += w;
          sv += w * p.v;
        }
        val[j * GW + i] = sv / sw;
      }
    }
    // Smooth twice (only inside the coloured area) so the bands and contour lines come out soft.
    for (let pass = 0; pass < 2; pass++) {
      const src = val.slice();
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          if (Number.isNaN(src[j * GW + i])) continue;
          let n = 0;
          let t = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
            const v = src[jj * GW + ii];
            if (!Number.isNaN(v)) {
              n++;
              t += v;
            }
          }
          val[j * GW + i] = t / n;
        }
      }
    }
    if (!lit.some(Boolean)) return null;
    const range = hi - lo;
    const step = range <= 2 ? 0.25 : range <= 4 ? 0.5 : 1;
    return { GW, GH, val, est, lo, hi, step, rooms: rooms.map(([, r], k) => (lit[k] ? r.shape : null)).filter(Boolean) };
  },

  _drawHeat() {
    const h = this._heat;
    const cv = this.shadowRoot && this.shadowRoot.querySelector("canvas.heat");
    if (!h || !cv) return;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const { GW, GH, val, est, lo, hi, step } = h;
    const small = document.createElement("canvas");
    small.width = GW;
    small.height = GH;
    const sx = small.getContext("2d");
    const img = sx.createImageData(GW, GH);
    for (let k = 0; k < GW * GH; k++) {
      const v = val[k];
      if (Number.isNaN(v)) continue;
      const [r, g, b] = heatRgb((v - lo) / (hi - lo));
      img.data.set([r, g, b, est && est[k] ? 165 : 255], k * 4);
    }
    sx.putImageData(img, 0, 0);
    // Only inside the rooms that get a colour.
    ctx.save();
    ctx.beginPath();
    for (const sh of h.rooms) {
      sh.forEach(([x, y], i) => (i ? ctx.lineTo((x / 100) * W, (y / 100) * H) : ctx.moveTo((x / 100) * W, (y / 100) * H)));
      ctx.closePath();
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(4, W / 90).toFixed(1)}px)`;
    ctx.globalAlpha = this._heatOp() / 100;
    ctx.drawImage(small, 0, 0, W, H);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    // Soft white contour lines (marching squares on the smoothed grid).
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 0.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cw = W / GW;
    const ch = H / GH;
    const at = (i, j) => val[j * GW + i];
    for (let lv = Math.ceil(lo / step) * step; lv < hi; lv += step) {
      ctx.beginPath();
      for (let j = 0; j < GH - 1; j++) {
        for (let i = 0; i < GW - 1; i++) {
          const a0 = at(i, j);
          const b0 = at(i + 1, j);
          const c0 = at(i + 1, j + 1);
          const d0 = at(i, j + 1);
          if (Number.isNaN(a0) || Number.isNaN(b0) || Number.isNaN(c0) || Number.isNaN(d0)) continue;
          const e = [];
          const cross = (v1, v2, x1, y1, x2, y2) => {
            if ((v1 < lv) === (v2 < lv)) return;
            const t = (lv - v1) / (v2 - v1);
            e.push([(x1 + (x2 - x1) * t + 0.5) * cw, (y1 + (y2 - y1) * t + 0.5) * ch]);
          };
          cross(a0, b0, i, j, i + 1, j);
          cross(b0, c0, i + 1, j, i + 1, j + 1);
          cross(d0, c0, i, j + 1, i + 1, j + 1);
          cross(a0, d0, i, j, i, j + 1);
          for (let q = 0; q + 1 < e.length; q += 2) {
            ctx.moveTo(e[q][0], e[q][1]);
            ctx.lineTo(e[q + 1][0], e[q + 1][1]);
          }
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Heatmap strength in % (viewer's slider, else the card's setting, else 52). */
  /** Strength of the Last cleaned colours: this browser's slider, else the card setting. */
  _cleanOp() {
    const v = (this._lay.cleaning || {}).op;
    const d = Number((this._config.cleaning || {}).opacity);
    return Number.isFinite(v) ? v : Number.isFinite(d) && d > 0 ? d : 60;
  },

  /** Under the plan in Cleaning: what the colours mean, and how strong they are. */
  _cleanLegendHtml() {
    if (this._overlay !== "cleaning" || !this._layerOn("cleaning", "fresh", true) || !Object.keys((this._a || {}).robots || {}).length) return "";
    const sw = (c, t) => `<span class="cl"><i style="background:${c}"></i>${t}</span>`;
    return `<div class="heatleg cleanleg"><span class="ht">${dfT("clean.last_cleaned")}</span>${sw("rgba(33,150,243,.55)", dfT("clean.leg_now"))}${sw("rgba(76,175,80,.85)", dfT("clean.leg_fresh"))}${sw("rgba(255,152,0,.7)", dfT("clean.due"))}<span class="hb"></span><label class="hop" title="${dfT("leg.colour_strength")}"><ha-icon icon="mdi:circle-opacity"></ha-icon><input type="range" min="15" max="100" step="5" value="${this._cleanOp()}" data-cleanop="1" aria-label="${dfT("leg.colour_strength")}"></label></div>`;
  },

  _heatOp() {
    const v = (this._lay.comfort || {}).heatOp;
    const d = Number(this._ov("comfort").heatmap_opacity);
    return Number.isFinite(v) ? v : Number.isFinite(d) && d > 0 ? d : 52;
  },

  _heatLegendHtml() {
    const h = this._heat;
    const f = (v) => `${this._num1 ? this._num1(v) : v.toFixed(1)}°`;
    const grad = HEAT_STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${Math.round(t * 100)}%`).join(", ");
    return `<div class="heatleg"><span class="ht">${dfT("heat.room_temp")}</span><div class="hb"><div class="bar" style="background:linear-gradient(90deg, ${grad})"></div><div class="tk"><span>${f(h.lo)}</span><span>${f((h.lo + h.hi) / 2)}</span><span>${f(h.hi)}</span></div></div><span class="est">${dfT("heat.estimated")}</span><label class="hop" title="${dfT("heat.strength")}"><ha-icon icon="mdi:circle-opacity"></ha-icon><input type="range" min="15" max="90" step="5" value="${this._heatOp()}" data-heatop="1" aria-label="${dfT("heat.strength")}"></label></div>`;
  },

  /** Rooms (#53): names at their spots, in the overlays chosen in the editor. */
  _roomsHtml(a) {
    const r = this._rooms();
    const names = this._layerOn(this._overlay, "rooms", this._roomsDefault(this._overlay));
    // 0.10: how long ago each room was cleaned belongs to the Last cleaned layer (alone when names are off).
    const ages = this._overlay === "cleaning" && this._layerOn("cleaning", "fresh", true);
    const ew = this._overlay === "energy" ? this._eRooms(2) : null; // 0.11: energy per room
    const rv = this._config.room_values && this._overlay === "live" ? this._roomVals(a) : null; // 0.13.9.15 (mobile)
    const fa = this._config.focus_area;
    if (!names && !ages && !ew && !rv) return "";
    const size = { s: 11, m: 13, l: 16 }[r.size] || 13;
    // A marker (or a robot's dock) right on a room name: the name steps aside, up or down, away from it.
    const pts = [...(this._specs ? this._specs.values() : [])].map((sp) => ({ x: +sp.x, y: +sp.y }));
    for (const rb of this._rb || []) if (rb.d.dock && Array.isArray(rb.cfg.m)) pts.push(rbApply(rb.cfg.m, rb.d.dock));
    const nudge = (room) => {
      const hit = pts.find((q) => Math.abs(q.x - room.x) < 4 && Math.abs(q.y - room.y) < 3.5);
      return hit ? `transform:translate(-50%, calc(-50% ${hit.y >= room.y ? "-" : "+"} ${Math.round(size * 1.6)}px));` : "";
    };
    return Object.entries(a.areas || {}).filter(([id]) => !(r.hidden || []).includes(id)).map(([id, room]) => {
      const nw = ages && (a.now || {})[id];
      const c = ages && ((a.cleaned || {})[id] || {}).t;
      const pw = ew && ew[id] > 0 ? `<small class="rage epw">${cesc(this._eFmt(ew[id]))}</small>` : "";
      const vv = rv && rv[id] && (!fa || fa === id) ? `<small class="rage rv">${rv[id].air != null ? `<i class="adot a${rv[id].air}"></i>` : ""}${cesc(rv[id].t)}</small>` : "";
      if (!names && !c && !nw && !pw && !vv) return "";
      const name = (r.names && r.names[id]) || room.name;
      const icon = names && r.style === "pill_icon" ? `<ha-icon icon="${cesc(room.icon || "mdi:texture-box")}"></ha-icon>` : "";
      const cls = r.style === "label" ? "label" : "pill";
      // Being cleaned now: progress instead of the age (it counts as cleaned when the run ends).
      const age = nw ? `<small class="rage now">${cesc(nw.pct != null ? `${dfT("clean.cleaning_l")} · ${nw.pct}%` : dfT("clean.cleaning_l"))}</small>` : c ? `<small class="rage">${cesc(this._ageTxt(c))}</small>` : "";
      const tap = this._overlay === "cleaning" && Object.keys(a.robots || {}).length ? ` data-croom="${cesc(id)}"` : "";
      // #82: with values, two lines centred on the room; near the plan's edge the label stays inside it.
      const two = vv && names ? ` rvw${room.x < 12 ? " el" : room.x > 88 ? " er" : ""}` : "";
      // #109: the room chosen on the mobile card's plan: its own label becomes the mark (name + values).
      const ol = id === this._olRoom;
      return `<div class="room ${cls}${two}${tap ? " ctap" : ""}${names || ol ? "" : " solo"}${ol ? " olsel" : ""}"${tap} style="left:${room.x}%;top:${room.y}%;font-size:${size}px;${nudge(room)}" title="${cesc(name)}">${icon}${names || ol ? cesc(name) : ""}${age}${pw}${ol && this._olTxt ? `<small class="olv">${cesc(this._olTxt)}</small>` : vv}</div>`;
    }).join("");
  },

  /** 0.13.9.15: each room's temperature · humidity (the average of all its readings, climate devices included). */
  _roomVals(a) {
    const S = this._hass.states;
    const acc = {};
    for (const item of this._items(a)) {
      const id = this._roomOf(item, a) || item.area_id;
      if (!id) continue;
      const r = (acc[id] = acc[id] || { t: [], h: [], air: [], seen: new Set() });
      for (const e of this._allowed(item)) {
        const s = S[e];
        if (r.seen.has(e)) continue;
        r.seen.add(e);
        if (!live(s)) continue;
        const k = kindOf(e, s);
        // 0.13.9.17 #70: the card's room-climate rule (no router / chip / diagnostic readings, no impossible zeros).
        if (dfcCat(e) === "diagnostic" || impossibleReading(e, s)) continue;
        const aq = typeof dfmAir === "function" ? dfmAir(e, s) : null; // 0.13.9.16: air quality (mobile)
        if (aq) r.air.push(aq.r);
        if (k === "temperature" && num(s.state) && (ambientTemp(e, s, item) || this._dev(item.id).comfort === true)) r.t.push(Number(s.state));
        if (k === "humidity" && num(s.state)) r.h.push(Number(s.state));
        if (k === "climate") {
          if (num(s.attributes.current_temperature)) r.t.push(Number(s.attributes.current_temperature));
          if (Number(s.attributes.current_humidity) > 0) r.h.push(Number(s.attributes.current_humidity));
        }
      }
    }
    const avg = (v) => v.reduce((x, y) => x + y, 0) / v.length;
    const out = {};
    for (const [id, r] of Object.entries(acc)) {
      const p = [];
      if (r.t.length) p.push(`${Math.round(avg(r.t) * 10) / 10}°`);
      if (r.h.length) p.push(`${Math.round(avg(r.h))}%`);
      // #82: air as its coloured dot only (short labels stay inside the room)
      if (p.length || r.air.length) out[id] = { t: p.join(" · "), air: r.air.length ? Math.max(...r.air) : null };
    }
    return out;
  },

  /** test11: the Matter mark = Home Assistant's own brand image (2026.3+: its local brands API, else the brands
   *  site), drawn white like the other marks; our "M" until it is there and when it can't load. */
  _matterMark() {
    const b = (DFC_BRAND.matter = DFC_BRAND.matter || {});
    if (!b.asked && this._live) {
      b.asked = true;
      const done = (url) => {
        b.url = url;
        this._update(true);
      };
      this._live.callWS({ type: "brands/access_token" })
        .then((r) => done(`/api/brands/integration/matter/icon.png?placeholder=no&token=${encodeURIComponent((r && r.token) || r)}`))
        .catch(() => done("https://brands.home-assistant.io/matter/icon.png"));
    }
    return b.url && !b.bad ? `<img class="nbm" src="${cesc(b.url)}" alt="" data-brand="matter">` : `<b class="nbm">M</b>`;
  },

  _markerHtml(s) {
    if (s.item && this._overlay === "live" && this._picStands(s.item)) return ""; // 0.12.2: its picture stands there
    if (s.cam && (this._overlay === "live" || this._overlay === "security")) return this._camHtml(s);
    if (s.type === "net") {
      const r = ROLES[s.role] || ROLES.device;
      const cls = ["m", edgeCls(s.x, s.y, this._em), "net", r.shape, s.role, s.sz || "", this._hl === s.key ? "hl" : ""].join(" ");
      const mark = s.conn === "matter" ? this._matterMark() : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`;
      return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-fill:${r.color};--dfc-ring:${s.ring || "transparent"}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.conns.map((c) => CONNS[c].label).join(", ")}`)}"><span class="ic">${mark}</span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const icon = s.icon
      ? `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`
      : s.eid && this._hass.states[s.eid]
        ? `<ha-state-icon data-ent="${cesc(s.eid)}"></ha-state-icon>`
        : `<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
    // 0.12.6: the icon is the fallback look: a device drawn by its touch area (or its light while on) has none.
    const noi = !!s.noicon || !!(s.item && this._per(s.item, this._overlay).noicon) || this._lookHere(s);
    const cls = ["m", edgeCls(s.x, s.y, this._em), s.kind, s.on ? "on" : "off", s.dim ? "dim" : "", s.unavail ? "unavail" : "", this._hl === s.key ? "hl" : "", s.glow ? "glow" : "", s.extras && s.extras.length ? "hasx" : "", noi ? "noi" : "", this._pick && this._selId === s.item.id ? "sel" : "", s.ghost ? "ghost" : ""].join(" ");
    // #112: a light that's on shows its real colour (or the lamp colour from the Editor).
    let lc = "";
    if (s.kind === "light" && s.on) {
      const st0 = s.eid && this._hass.states[s.eid];
      const rgb = bulbRgb(st0 ? st0.attributes : {}, s.item.light && s.item.light.color);
      if (rgb) lc = `;--dfc-lc:rgb(${rgb})`;
    }
    const xs = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const bond = ""; // #86: a bond is one device on the card, no badge
    const label = `${s.name}${s.st ? ` · ${this._fmt(s.eid)}` : ""}`;
    return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}${lc}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(label)}"><span class="ic">${icon}${bond}${s.badge && !noi ? `<span class="bdg">${cesc(s.badge)}</span>` : ""}</span>${s.badge && noi ? `<span class="bdg nb">${cesc(s.badge)}</span>` : ""}${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${xs}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}${s.item.ofName ? `<br><small>${dfT("net.through", { d: cesc(s.item.ofName) })}${(s.item.conns || []).length ? ` · ${cesc(s.item.conns.map((c) => (CONNS[c] || { label: c }).label).join(" + "))}` : ""}</small>` : ""}</span></button>`;
  },

  _chipHtml(s) {
    const bdg = s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : "";
    const xl0 = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const xl = xl0 + bdg;
    if (s.cl2 && s.compact) {
      return `<button class="chip cl2 cmp ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.temp].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${s.word && (s.temp || s.word !== dfT("climate.off")) ? `<span class="mw">${cesc(s.word)}</span>` : ""}${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.cl2) {
      const left = s.word || s.set ? `<span class="mc"><span class="mw">${cesc(s.word)}</span>${s.set ? `<span class="st">${cesc(s.set)}</span>` : ""}</span>` : "";
      const right = s.temp || s.hum ? `${left ? `<span class="vs"></span>` : ""}<span class="tc">${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${s.hum ? `<span class="h"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.hum)}</span>` : ""}</span>` : "";
      return `<button class="chip cl2 ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.set, s.temp, s.hum].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${left}${right}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.rd && !s.icon) {
      // #94: readings in the AC chip style: temperature large, 💧 humidity small under it.
      const t = s.rd.t ? `<span class="t">${cesc(s.rd.t.replace(/\s?°C|\s?°F/, "°"))}</span>` : "";
      const h = s.rd.h ? `<span class="${t ? "h" : "t"}"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.rd.h)}</span>` : "";
      return `<button class="chip rd ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}"><span class="tc">${t}${h}</span>${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const first = s.icon ? `<span class="ico"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.lines[0] || "")}</span>` : `<span class="l1">${cesc(s.lines[0] || "")}</span>`;
    return `<button class="chip ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}">${first}${s.lines[1] ? `<span class="l2">${cesc(s.lines[1])}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
  },

  /** Connections present on this plan (for the layers menu). */
  _connsPresent(a) {
    const set = new Set();
    for (const s of (this._specs || new Map()).values()) for (const cn of s.conns || []) set.add(cn);
    for (const d of Object.values(a.devices || {})) for (const cn of d.conns || []) if (CONNS[cn]) set.add(cn);
    return CONN_ORDER.filter((cn) => set.has(cn));
  },

  _layersBtn(rail = false) {
    return `<button class="layers ${this._menu ? "on" : ""}" data-menu="1" title="${dfT("layers")}" aria-label="${dfT("layers")}" aria-expanded="${this._menu}"><ha-icon icon="mdi:layers-outline"></ha-icon>${rail ? "" : `<span>${dfT("layers")}</span>`}</button>`;
  },

  _layersMenu(a) {
    const present = this._connsPresent(a);
    const n = this._net;
    const shown = this._netShow();
    const custom = Array.isArray(n.conns) && n.conns.length;
    const chk = (on) => `<ha-icon class="eye" icon="${on ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline"}"></ha-icon>`;
    const tick = (on) => `<ha-icon class="eye" icon="${on ? "mdi:eye" : "mdi:eye-off-outline"}"></ha-icon>`;
    // 0.7.3: only what applies to the connections shown.
    const hasZ = present.includes("zigbee") && shown.includes("zigbee");
    const hasW = shown.includes("network") && [...(this._specs || new Map()).values()].some((s) => s.rt);
    const hasH = [...(this._specs || new Map()).values()].some((s) => s.type === "net" && s.item.via && this._specs.has(s.item.via));
    const ov = this._overlay;
    const rooms = this._layerOn(ov, "rooms", this._roomsDefault(ov));
    const lay = (name, icon, label) => {
      const on = this._layerOn(ov, name, this._layerDefault(ov, name));
      return `<button class="${on ? "on" : ""}" data-lay="${name}">${tick(on)}<ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    };
    const comfort = ov === "comfort" ? `${lay("heat", "mdi:thermometer-lines", dfT("lay.heat"))}${lay("labels", "mdi:thermometer", dfT("lay.labels"))}${lay("clim", "mdi:air-conditioner", dfT("lay.clim"))}${lay("air", "mdi:weather-windy", dfT("lay.air"))}` : "";
    const reset = this._lay[ov] || (ov === "network" && Object.keys(lsGet(`dfc_net_${this._lsKey()}`) || {}).length) ? `<hr><button data-layreset="1"><ha-icon icon="mdi:restore"></ha-icon>${dfT("lay.reset")}</button>` : "";
    const running = (this._rb || []).some((r) => r.active);
    const rpath = (ov === "live" && (this._rb || []).length) || ov === "cleaning" ? lay("rpath", "mdi:vector-polyline", ov === "cleaning" && !running ? dfT("lay.path_last") : dfT("lay.path")) : "";
    const fresh = ov === "cleaning" ? lay("fresh", "mdi:clock-check-outline", dfT("clean.last_cleaned")) : "";
    const secAll = ov === "security" ? lay("all", "mdi:shield-search", dfT("lay.all_sensors")) : "";
    // 0.11: Cameras, and with 2+ cameras one tick per camera (this screen only; triggers still pop up).
    const camItems = (ov === "live" || ov === "security") && this._a ? this._items(this._a).filter((it) => this._camOf(it)) : [];
    const camsOn = camItems.length && this._layerOn(ov, "cams", false);
    const snaps = camItems.length && this._rpOn() ? `<button class="dis" disabled title="${dfT("lay.no_cam_replay")}"><ha-icon class="eye" icon="mdi:eye-off-outline"></ha-icon><ha-icon icon="mdi:cctv-off"></ha-icon>${dfT("lay.cams_not_replay")}</button>` : camItems.length ? lay("cams", "mdi:cctv", dfT("lay.cams")) + (camsOn && camItems.length > 1 ? camItems.map((it) => lay(`cam:${it.id}`, "mdi:circle-small", cesc(this._dev(it.id).name || it.name)).replace("<button ", '<button style="padding-left:28px" ')).join("") : "") : "";
    const elec = ov === "energy" ? `${lay("fill", "mdi:texture-box", dfT("lay.fill"))}${lay("flow", "mdi:transit-connection-variant", dfT("lay.flow"))}` : "";
    const general = `<h4>${dfT("layers")}</h4><button class="${rooms ? "on" : ""}" data-lay="rooms">${tick(rooms)}<ha-icon icon="mdi:label-outline"></ha-icon>${dfT("lay.rooms")}</button>${comfort}${rpath}${fresh}${secAll}${snaps}${elec}`;
    if (ov !== "network") return `<div class="lmenu" role="menu" style="visibility:hidden">${general}${reset}</div>`;
    return `<div class="lmenu" role="menu" style="visibility:hidden">${general}<hr><h4>${dfT("net.connections")}</h4>
      <button class="chk ${!custom ? "on" : ""}" data-conn="__default">${chk(!custom)}<ha-icon icon="mdi:star-outline"></ha-icon>${dfT("net.default")}</button>
      ${present.map((cn) => `<button class="chk ${custom && shown.includes(cn) ? "on" : ""}" data-conn="${cn}">${chk(custom && shown.includes(cn))}<ha-icon icon="${CONNS[cn].icon}"></ha-icon>${cesc(CONNS[cn].label)}</button>`).join("")}
      <hr>
      ${hasZ ? `<button class="${n.links ? "on" : ""}" data-tg="links">${tick(n.links)}${dfT("net.zigbee_links")}</button>` : ""}
      ${hasW ? `<button class="${n.wlinks ? "on" : ""}" data-tg="wlinks">${tick(n.wlinks)}${dfT("net.wifi_links")}</button>` : ""}
      ${hasH || n.hubs === false ? `<button class="${n.hubs ? "on" : ""}" data-tg="hubs">${tick(n.hubs)}${dfT("net.hub_links")}</button>` : ""}
      <button class="${n.legend ? "on" : ""}" data-tg="legend">${tick(n.legend)}${dfT("net.legend")}</button>
      ${shown.includes("bluetooth") && this._people().some((p) => p.distance) ? `<hr><h4>${dfT("ov.people")}</h4>${lay("pdist", "mdi:account-badge-outline", dfT("lay.pdist"))}${this._layerOn(ov, "pdist", true) ? lay("pall", "mdi:radar", dfT("lay.pall")) : ""}` : ""}
${reset}
    </div>`;
  },

  /** Roles of the devices in Network on this floor (incl. hidden ones, so they can be switched back on). */
  _rolesPresent() {
    const saved = this._net.roles;
    this._net.roles = [];
    const set = new Set();
    try {
      const a = this._a || (this._sensor() || {}).attributes || {};
      const cx = this._ctx(a);
      for (const item of this._items(a)) for (const s of this._netSpecs(item, item.name, cx, false)) set.add(s.role);
    } finally {
      this._net.roles = saved;
    }
    return Object.keys(ROLES).filter((r) => set.has(r)); // 0.13.9.3: every role drawn gets its legend entry
  },

  /** 0.8.1: the legend shows only what is drawn now, in small groups (roles · LQI · lines · access points · Refresh). */
  _legendHtml(specs, withLayers) {
    const groups = [];
    const showWifi = this._netShow().includes("network");
    if (this._net.legend) {
      const hidden = this._net.roles || [];
      const roles = this._rolesPresent();
      if (roles.length) groups.push(roles.map((r) => `<button class="lg ${hidden.includes(r) ? "off" : ""}" data-role="${r}" aria-pressed="${!hidden.includes(r)}" title="${dfT("net.show_hide")}"><i class="${ROLES[r].shape}" style="background:${ROLES[r].color}"></i>${ROLES[r].label}</button>`).join(""));
      // The LQI ranges switch their Zigbee links on and off, like the roles do.
      if (specs.some((s) => s.z && s.z.lqi != null)) groups.push(`<span class="lt">LQI</span>${LQI_BANDS.slice().reverse().map((b) => `<button class="lg ${(this._net.lqiOff || []).includes(b.min) ? "off" : ""}" data-lqi="${b.min}" aria-pressed="${!(this._net.lqiOff || []).includes(b.min)}" title="${dfT("net.show_hide_range")}"><i class="ring" style="border-color:${b.color}"></i>${b.label}</button>`).join("")}`);
      if (specs.some((s) => s.sigEid && !(s.z && s.z.lqi != null))) groups.push(`<span class="lt">${dfT("net.signal")}</span><span><i class="ring" style="border-color:#43a047"></i>${dfT("net.good")}</span><span><i class="ring" style="border-color:#fb8c00"></i>${dfT("net.fair")}</span><span><i class="ring" style="border-color:#e53935"></i>${dfT("net.weak")}</span>`);
      // Lines: only the kinds actually drawn (same rules as the lines themselves).
      const lines = [];
      const hubDrawn = this._net.hubs && (specs.some((s) => {
        const pa = s.item && s.item.via && this._specs.get(s.item.via);
        return s.type === "net" && pa && pa.type === "net" && !(s.conns.includes("zigbee") && pa.conns.includes("zigbee"));
      }) || (this._ghosts || []).some((g) => g.links.some((l) => l.cls === "hub")));
      if (hubDrawn) lines.push(`<span><i class="dash"></i>${dfT("net.via_hub")}</span>`);
      const rts = showWifi ? specs.filter((s) => s.rt && s.rt.home) : [];
      if (rts.length && this._net.wlinks) lines.push(`<span><i class="cab"></i>${dfT("net.cable")}</span><span><i class="dash wf"></i>Wi-Fi</span>`);
      if (lines.length) groups.push(lines.join(""));
      if (rts.length) {
        const aps = this._apList();
        const by = {};
        for (const s of rts) {
          const k = s.rt.ap || "?";
          const b = (by[k] = by[k] || { w: 0, c: 0 });
          s.rt.lan ? b.c++ : b.w++;
        }
        groups.push(Object.entries(by).map(([k, b]) => {
          const i = aps.indexOf(k);
          const ap = this._a.aps && this._a.aps[k] && this._specs.get(this._a.aps[k]);
          const nm = ap ? ap.name : k === "?" ? dfT("role.unknown") : k;
          return `<span class="aps"><i class="sw" style="background:${AP_COLORS[(i < 0 ? 0 : i) % AP_COLORS.length]}"></i>${cesc(nm)}: ${[b.w ? `${b.w} Wi-Fi` : "", b.c ? `${b.c} ${dfT("net.cable")}` : ""].filter(Boolean).join(", ")}</span>`;
        }).join(""));
      }
    }
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    if (isAdmin && this._netShow().includes("zigbee") && (this._zha || (this._a && Object.values(this._a.devices || {}).some((d) => (d.conns || []).includes("zigbee"))))) {
      const t = this._zhaAt ? new Date(this._zhaAt).toLocaleTimeString(dfLocale(), { hour: "2-digit", minute: "2-digit" }) : "–";
      groups.push(`<span class="upd" title="${dfT("net.zha_at", { t })}"><button class="rf ${this._scanning ? "busy" : ""}" data-refresh="1" title="${dfT("net.rescan")}"><ha-icon icon="mdi:refresh"></ha-icon>${this._scanning ? dfT("net.scanning") : dfT("net.refresh")}</button>${t}</span>`);
    }
    if (withLayers) groups.push(this._layersBtn());
    return groups.length ? `<div class="legend">${groups.map((g) => `<span class="lgrp">${g}</span>`).join("")}</div>` : "";
  },

  /** Lights overlay: All off / All on / the user's scenes (#54). */
  _sceneBarHtml(specs) {
    const L = this._lights();
    const pid = (this._a || {}).plan_id;
    // Scenes for some floors only show on those floors (indices stay those of the whole list).
    const scenes = (Array.isArray(L.scenes) ? L.scenes : []).map((s, i) => [s, i]).filter(([s]) => !(Array.isArray(s.plans) && s.plans.length && !s.plans.includes(pid)));
    if (!L.all_off && !L.all_on && !scenes.length) return "";
    const ents = this._lightEnts(specs);
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    const b = [];
    if (L.all_off) b.push(`<button data-scene="all_off" class="${ents.length && !anyOn ? "on" : ""}"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon>${dfT("scene.all_off")}</button>`);
    if (L.all_on) b.push(`<button data-scene="all_on"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>${dfT("scene.all_on")}</button>`);
    scenes.forEach(([s, i]) => {
      b.push(`<button data-scene="${i}" class="${this._sceneActive(s) ? "on" : ""}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || dfT("scene.n", { n: i + 1 }))}</button>`);
    });
    return `<div class="bar" role="toolbar" aria-label="${dfT("scene.bar")}">${b.join("")}</div>`;
  },

  /** 0.10: Overlay actions: your own buttons under the plan, per overlay and per floor (any HA action, a popup…);
   *  in Cleaning first the robots' own Start / Pause / Dock. */
  _ovActs() {
    return Array.isArray(this._config.overlay_actions) ? this._config.overlay_actions : [];
  },

  /** 0.13.2: "New in <version>" pill for admins (card setting release_tips: false hides it), until closed (✕). */
  _tipHtml() {
    const h = this._hass;
    if (!RELEASE_TIP || this.preview || this._config.release_tips === false || this._config.embedded || !h || !h.user || !h.user.is_admin) return "";
    if (window.__dfcTipSeen === undefined) {
      window.__dfcTipSeen = null; // asked once per page
      Promise.resolve(h.callWS({ type: "frontend/get_user_data", key: TIP_KEY }))
        .then((r) => (window.__dfcTipSeen = (r && r.value) || ""))
        .catch(() => (window.__dfcTipSeen = RELEASE_TIP.v)) // can't tell: stay quiet
        .finally(() => window.dispatchEvent(new CustomEvent("dfc-tip")));
      return "";
    }
    if (window.__dfcTipSeen === null || window.__dfcTipSeen === RELEASE_TIP.v) return "";
    return `<div class="newov tipv"><ha-icon icon="mdi:information-outline"></ha-icon><span>${dfT("tip.new_in", { v: cesc(RELEASE_TIP.v) })}: <b>${cesc(RELEASE_TIP.text)}</b></span><button data-tipgo="1" data-add="1">${cesc(RELEASE_TIP.go)} ›</button><button data-tipx="1" aria-label="${dfT("tip.close")}">✕</button></div>`;
  },

  _tipClose() {
    window.__dfcTipSeen = RELEASE_TIP.v;
    window.dispatchEvent(new CustomEvent("dfc-tip"));
    Promise.resolve(this._hass.callWS({ type: "frontend/set_user_data", key: TIP_KEY, value: RELEASE_TIP.v })).catch(() => {});
  },

  /** 0.11: a card that lists its own overlays doesn't get new ones by itself: admins see a tip, once per overlay. */
  _newOvHtml() {
    const raw = this._raw || {};
    // #120: a plan inside another card (the mobile card) has no settings of its own to add to or dismiss in.
    if (this._config.embedded) return "";
    // 0.14.2: asked only in the Card Editor, which saves the answer the Home Assistant way (config-changed).
    if (!this._onNewOv) return "";
    if (!this._hass || !this._hass.user || !this._hass.user.is_admin || !Array.isArray(raw.overlays) || !raw.overlays.length) return "";
    const seen = new Set([...raw.overlays, ...(raw.dismissed_overlays || [])].map((o) => (o === "electricity" ? "energy" : o)));
    const o = NEW_OVERLAYS.find((x) => !seen.has(x) && (x !== "energy" || (this._eData && this._eData.devs.length)));
    if (!o) return "";
    return `<div class="newov"><ha-icon icon="${OVERLAYS[o].icon}"></ha-icon><span>✨ ${dfT("newov.text", { o: `<b>${cesc(OVERLAYS[o].label)}</b>` })}${o === "energy" ? dfT("newov.energy") : ""}</span><button data-newov="${o}" data-add="1">${dfT("newov.add")}</button><button data-newov="${o}">${dfT("newov.not_now")}</button></div>`;
  },

  _newOvAnswer(o, add) {
    const raw = { ...(this._raw || {}) };
    if (add) raw.overlays = [...(raw.overlays || []), o];
    else raw.dismissed_overlays = [...new Set([...(raw.dismissed_overlays || []), o])];
    this._onNewOv(raw);
    if (add) this._overlay = o;
    this._update(true);
  },

  _ovActsHtml(ov) {
    const a = this._a || {};
    const b = [];
    if (ov === "cleaning" && (this._config.cleaning || {}).robot_buttons !== false) {
      const robots = Object.keys(a.robots || {}).filter((e) => this._hass.states[e]);
      for (const eid of robots) {
        const st = this._hass.states[eid];
        const pre = robots.length > 1 ? `${this._rbLabel(a, eid)}: ` : "";
        const own = rbOwn(a, eid);
        const cmd = (c, icon, label) => `<button data-rbcmd="${c}" data-rb="${cesc(eid)}"><ha-icon icon="${icon}"${own ? ` style="color:rgb(${own})"` : ""}></ha-icon>${cesc(pre + label)}</button>`;
        b.push(st.state === "cleaning" ? cmd("pause", "mdi:pause", dfT("robot.pause")) : cmd("start", "mdi:play", st.state === "paused" ? dfT("robot.continue") : dfT("robot.start")));
        if (st.state !== "docked") b.push(cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")));
      }
    }
    this._ovActs().forEach((x, i) => {
      if ((x.overlay || "cleaning") !== ov) return;
      if (Array.isArray(x.plans) && x.plans.length && !x.plans.includes(a.plan_id)) return;
      const st = x.status ? barStatus(this._hass, x.status) : null;
      const s0 = st || {};
      const col = s0.color && s0.badge == null ? ` style="color:${cesc(s0.color)}"` : "";
      const mark = s0.badge != null ? `<i class="obadge"${s0.color ? ` style="background:${cesc(s0.color)}"` : ""}>${cesc(s0.badge)}</i>` : s0.dot ? `<i class="odot" style="background:${cesc(s0.dot)}"></i>` : "";
      b.push(`<button data-oact="${i}" data-bh="1"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"${col}></ha-icon>${cesc(x.name || dfT("action"))}${mark}</button>`);
    });
    return b.length ? `<div class="bar oacts" role="toolbar" aria-label="${dfT("actions")}">${b.join("")}</div>` : "";
  },

  _ovActEnt(x) {
    const e = (x.status || {}).entity;
    return (Array.isArray(e) ? e[0] : e) || undefined;
  },

  _lightEnts(specs) {
    const out = new Set();
    for (const s of specs || [...(this._specs || new Map()).values()]) for (const e of s.ents || []) if (TOGGLE_DOMAINS.has(domainOf(e)) && domainOf(e) !== "cover") out.add(e);
    return [...out];
  },

  _sceneActive(s) {
    if (s.entity || !Array.isArray(s.lights) || !s.lights.length) return false;
    return s.lights.every((e) => {
      const st = this._hass.states[e];
      if (!st) return false;
      const want = (s.states && s.states[e]) || (Number(s.brightness) === 0 ? { state: "off" } : { state: "on", brightness_pct: s.brightness });
      if (want.state === "off") return st.state === "off";
      if (st.state !== "on") return false;
      if (want.brightness_pct != null && st.attributes.brightness != null) return Math.abs((st.attributes.brightness / 255) * 100 - want.brightness_pct) <= 4;
      return true;
    });
  },

  _runScene(id) {
    const L = this._lights();
    const ents = this._lightEnts();
    if (id === "all_off") {
      if (!ents.length) return;
      this._popup = { type: "confirm", action: "all_off", n: ents.filter((e) => (this._hass.states[e] || {}).state === "on").length };
      return this._update(true);
    }
    if (id === "all_on") return ents.length && this._hass.callService("homeassistant", "turn_on", { entity_id: ents });
    const s = (L.scenes || [])[Number(id)];
    if (!s) return;
    if (s.entity) return this._hass.callService(domainOf(s.entity), "turn_on", { entity_id: s.entity });
    for (const e of s.lights || []) {
      const want = (s.states && s.states[e]) || null;
      const d = domainOf(e);
      if (want ? want.state === "off" : Number(s.brightness) === 0) {
        this._hass.callService(d === "light" ? "light" : "homeassistant", "turn_off", { entity_id: e });
        continue;
      }
      if (d !== "light") {
        this._hass.callService("homeassistant", "turn_on", { entity_id: e });
        continue;
      }
      const data = { entity_id: e };
      const src = want || { brightness_pct: s.brightness };
      if (src.brightness_pct != null && src.brightness_pct !== "") data.brightness_pct = Number(src.brightness_pct);
      if (src.color_temp_kelvin) data.color_temp_kelvin = src.color_temp_kelvin;
      else if (src.rgb_color) data.rgb_color = src.rgb_color;
      this._hass.callService("light", "turn_on", data);
    }
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- layout
  /** 0.8.2: the bar as long as the plan with its frame (next to it), and the scroll chevrons. */
  _barFit() {
    const sr = this.shadowRoot;
    const card = sr && sr.querySelector("ha-card");
    const fr = sr && sr.querySelector(".fr");
    const bar = sr && sr.querySelector(".ovbar");
    if (!card || !fr || !bar) return;
    const cr = card.getBoundingClientRect();
    const r = fr.getBoundingClientRect();
    const vert = card.classList.contains("dock-left") || card.classList.contains("dock-right");
    if (card.classList.contains("srail")) {
      // The Side Rail: the card's full height (a card that sizes itself: as tall as the plan's column).
      const h = Math.round(this.hasAttribute("fit") ? card.clientHeight : this._natH || card.clientHeight);
      if (Math.abs((parseFloat(this.style.getPropertyValue("--dfc-rail-len")) || -99) - h) > 1) this.style.setProperty("--dfc-rail-len", `${h}px`);
    } else if (r.width && r.height) {
      const off = Math.max(0, Math.round(vert ? r.top - cr.top : r.left - cr.left));
      const len = Math.round(vert ? Math.min(r.height, cr.height - off) : r.width);
      const set = (k, v) => {
        if (Math.abs((parseFloat(this.style.getPropertyValue(k)) || -99) - v) > 1) this.style.setProperty(k, `${v}px`);
      };
      set("--dfc-bar-off", off);
      set("--dfc-bar-len", len);
    }
    const nav = bar.querySelector("nav.dock");
    if (!nav) return; // the replay rail has no overlay buttons to scroll
    const upd = () => {
      const v = nav.getAttribute("aria-orientation") === "vertical";
      const pos = v ? nav.scrollTop : nav.scrollLeft;
      const max = v ? nav.scrollHeight - nav.clientHeight : nav.scrollWidth - nav.clientWidth;
      bar.classList.toggle("cs", max > 2 && pos > 2);
      bar.classList.toggle("ce", max > 2 && pos < max - 2);
    };
    if (!nav._fadeOn) {
      nav._fadeOn = true;
      nav.addEventListener("scroll", upd, { passive: true });
    }
    upd();
  },

  _layoutSoon() {
    cancelAnimationFrame(this._lraf);
    this._lraf = requestAnimationFrame(() => this._layout());
  },

  /** Keep close markers readable: spread them in a small grid, then push any remaining overlaps apart; a leader line points to the real spot. */
  /** 0.8.2: in a card with a fixed height (panel view, sections grid, wall panel, preview) the plan fills the area
   *  left after the buttons, legend and people: as large as possible, never stretched. Elsewhere (masonry) the
   *  card grows with the plan, which then uses the full width as before. */
  /** 0.13.2 (#22): a bar a theme keeps fixed along the bottom of the dashboard (Material You's navigation bar).
   *  The plan's height reserve (170 px for Home Assistant's header and the card around the plan) grows by its
   *  height. Home Assistant has no such bar, so with the standard layout (phones with a notch included) nothing
   *  changes. */
  _screenBars() {
    const deep = (x, y) => {
      let el = document.elementFromPoint(x, y);
      for (let i = 0; el && el.shadowRoot && i < 30; i++) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    };
    const fixedUp = (el) => {
      for (let n = el, i = 0; n && i < 60; i++) {
        if (n.nodeType === 1) {
          const pos = getComputedStyle(n).position;
          if (pos === "fixed" || pos === "sticky") return n;
        }
        n = n.assignedSlot || n.parentNode || n.host;
      }
      return null;
    };
    const mine = (n) => n === this || (n.contains && n.contains(this));
    const x = Math.round(window.innerWidth / 2);
    const H = window.innerHeight;
    let bottom = 0;
    try {
      const b = fixedUp(deep(x, H - 1));
      if (b && !mine(b)) {
        const r = b.getBoundingClientRect();
        if (r.top > H / 2) bottom = Math.max(0, H - r.top); // a bar along the bottom, not a full-screen layer
      }
    } catch (_e) {
      /* keep the standard reserve */
    }
    return Math.round(bottom);
  },

  _fitPlan() {
    const sr = this.shadowRoot;
    // 0.13.2 (#22): the reserve follows what the screen really leaves free.
    const extra = typeof document !== "undefined" && document.elementFromPoint ? this._screenBars() : 0;
    if (extra > 0) this.style.setProperty("--dfc-chrome", `${170 + extra}px`);
    else this.style.removeProperty("--dfc-chrome");
    const card = sr && sr.querySelector("ha-card");
    const wrap = sr && sr.querySelector(".wrap");
    if (!card || !wrap) return;
    const fr = sr.querySelector(".fr");
    let fixed = !!(this.isPanel || this.layout === "panel" || this.layout === "grid" || this._fitHost || this._fitAuto);
    this.toggleAttribute("pc", this._config.plan_position === "centre");
    if (!fr) {
      this.toggleAttribute("fit", false);
      return;
    }
    const main = wrap.parentElement;
    const cs = getComputedStyle(wrap);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // Title, legend, people and scene bar take their share; a bar above / below the plan too.
    let others = 0;
    for (const c of main.children) if (c !== wrap && getComputedStyle(c).position !== "absolute") others += c.offsetHeight;
    const dock = sr.querySelector(".dockrow");
    if (dock && (card.classList.contains("dock-top") || card.classList.contains("dock-bottom")) && getComputedStyle(dock).position !== "absolute") others += dock.offsetHeight;
    const natural = others + padV + fr.offsetHeight;
    // 0.8.2: a card whose container sets its height (a stack or a layout with a fixed height) is a
    // fixed-height card too, wherever it sits: a card that sizes itself is always exactly its content.
    // (A vertical bar never sets the height: it is as long as the plan, or as tall as the card.)
    this._natH = Math.max(natural, others + 120);
    if (!fixed && Math.abs(card.clientHeight - this._natH) > 2) fixed = this._fitAuto = true;
    // In a fixed-height card the plan sits at the top (option: centred), the bar right next to it.
    this.toggleAttribute("fit", fixed);
    if (!fixed) {
      this.style.removeProperty("--dfc-fit-h");
      return;
    }
    if (Math.abs(card.clientHeight - natural) <= 2) return;
    const h = Math.max(120, card.clientHeight - others - padV - 2);
    const cur = parseFloat(this.style.getPropertyValue("--dfc-fit-h")) || 0;
    if (Math.abs(cur - h) > 1) this.style.setProperty("--dfc-fit-h", `${Math.round(h)}px`);
  },



  _layout() {
    this._fitPlan();
    this._barFit();
    const box = this.shadowRoot && this.shadowRoot.querySelector(".box");
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
    // 0.13.3: Christmas bulbs keep a minimum size on screen: redraw once when the plan's width changes a lot.
    const wasW = this._boxW || 0;
    this._boxW = W;
    if (Math.abs(wasW - W) > 40 && box.querySelector("svg.xmas")) this._update(true);
    this._alignFloor();
    // Markers follow the card size (#76): full size from ~900 px width, smaller below.
    const look = this._look();
    const sc = look.scale === false ? 1 : Math.max(0.55, Math.min(1, W / 900));
    const narrow = W < 520;
    if (Math.abs(sc - (this._scale || 1)) > 0.04 || narrow !== !!this._narrow) {
      this._scale = sc;
      this._narrow = narrow;
      const card = this.shadowRoot.querySelector("ha-card");
      if (card) {
        card.style.setProperty("--dfc-size", `${Math.round((Number(look.size) || 34) * sc)}px`);
        card.classList.toggle("narrow", narrow);
      }
      return this._layoutSoon();
    }
    // 0.11: a Live camera (dot + picture) keeps its own layout: never spread apart as two markers.
    const els = [...box.querySelectorAll("[data-k]")];
    const rects = els.map((el) => {
      const w = el.offsetWidth || 30;
      const h = el.offsetHeight || 30;
      const ax = (Number(el.dataset.x) / 100) * W;
      const ay = (Number(el.dataset.y) / 100) * H;
      return { el, w, h, ax, ay, x: ax - w / 2, y: ay - h / 2 };
    });
    const GAP = 4;
    const overlap = (p, q) => p.x < q.x + q.w + GAP && p.x + p.w + GAP > q.x && p.y < q.y + q.h + GAP && p.y + p.h + GAP > q.y;
    let groups = rects.map((r) => [r]);
    for (let pass = 0; pass < 6; pass++) {
      let merged = false;
      const next = [];
      for (const g of groups) {
        const hit = next.find((n) => n.some((p) => g.some((q) => overlap(p, q))));
        if (hit) {
          hit.push(...g);
          merged = true;
        } else next.push(g);
      }
      groups = next;
      // 0.13.9.8: devices on one spot that all have a mounting height stack in one column, highest on top.
      const hOf = (r) => {
        const v = this._hIndex && this._hIndex.get(String(r.el.dataset.k || "").split("|")[0]);
        return typeof v === "number" ? v : null;
      };
      for (const g of groups) {
        if (g.length < 2) continue;
        const cw = Math.max(...g.map((r) => r.w));
        const ch = Math.max(...g.map((r) => r.h));
        const tower = g.every((r) => hOf(r) != null && Math.abs(r.ax - g[0].ax) < 2 && Math.abs(r.ay - g[0].ay) < 2);
        const cols = tower ? 1 : Math.ceil(Math.sqrt(g.length));
        const rows = Math.ceil(g.length / cols);
        const gw = cols * (cw + 6) - 6;
        const gh = rows * (ch + 6) - 6;
        const cx = g.reduce((n, r) => n + r.ax, 0) / g.length;
        const cy = g.reduce((n, r) => n + r.ay, 0) / g.length;
        const left = Math.max(2, Math.min(W - gw - 2, cx - gw / 2));
        const top = Math.max(2, Math.min(H - gh - 2, cy - gh / 2));
        // Rows top to bottom; inside a row, left to right as on the plan (so neighbours never swap sides).
        const byY = tower ? [...g].sort((p, q) => hOf(q) - hOf(p)) : [...g].sort((p, q) => p.ay - q.ay || p.ax - q.ax);
        const ordered = [];
        for (let k = 0; k < byY.length; k += cols) ordered.push(...byY.slice(k, k + cols).sort((p, q) => p.ax - q.ax));
        ordered.forEach((r, i) => {
          const row = Math.floor(i / cols);
          const inRow = Math.min(cols, g.length - row * cols);
          const col = i % cols;
          r.x = left + ((cols - inRow) * (cw + 6)) / 2 + col * (cw + 6) + (cw - r.w) / 2;
          r.y = top + row * (ch + 6) + (ch - r.h) / 2;
        });
      }
      if (!merged) break;
    }
    // Remaining overlaps (grids next to other grids, chips of different sizes): push apart (#51).
    const clamp = (r) => {
      r.x = Math.max(1, Math.min(W - r.w - 1, r.x));
      r.y = Math.max(1, Math.min(H - r.h - 1, r.y));
    };
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i];
        const q = rects[j];
        if (!overlap(p, q)) continue;
        const dx = Math.min(p.x + p.w + GAP - q.x, q.x + q.w + GAP - p.x);
        const dy = Math.min(p.y + p.h + GAP - q.y, q.y + q.h + GAP - p.y);
        const sx = p.x + p.w / 2 <= q.x + q.w / 2 ? 1 : -1;
        const sy = p.y + p.h / 2 <= q.y + q.h / 2 ? 1 : -1;
        if (dx < dy) {
          p.x -= (sx * dx) / 2;
          q.x += (sx * dx) / 2;
        } else {
          p.y -= (sy * dy) / 2;
          q.y += (sy * dy) / 2;
        }
        clamp(p);
        clamp(q);
        moved = true;
      }
      if (!moved) break;
    }
    let lines = "";
    for (const r of rects) {
      const cx = Math.max(r.w / 2 + 1, Math.min(W - r.w / 2 - 1, r.x + r.w / 2));
      const cy = Math.max(r.h / 2 + 1, Math.min(H - r.h / 2 - 1, r.y + r.h / 2));
      r.el.style.left = `${cx}px`;
      r.el.style.top = `${cy}px`;
      if (Math.hypot(cx - r.ax, cy - r.ay) > 6) lines += `<line class="lead" x1="${r.ax}" y1="${r.ay}" x2="${cx}" y2="${cy}"/><circle cx="${r.ax}" cy="${r.ay}" r="2.5" fill="var(--secondary-text-color)" opacity=".7"/>`;
    }
    const svg = this.shadowRoot.querySelector("svg.lines");
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = this._eFlowSvg(box, W, H, svg.getCurrentTime ? svg.getCurrentTime() : 0) + this._linkLines(W, H) + lines + this._placeWins(box, W, H);
    }
  },

  /** Zigbee links (all ZHA neighbours, coloured by LQI) and hub/bridge links (Matter bridges, hubs). */
  _linkLines(W, H) {
    if (this._overlay !== "network" || !this._specs) return "";
    if (this._rpIn()) return ""; // test11: links are only known for now, so Replay draws none
    const specs = [...this._specs.values()].filter((s) => s.type === "net");
    let out = "";
    const P = (s) => [(s.x / 100) * W, (s.y / 100) * H];
    if (this._net.links && this._zha && this._zha.links.length) {
      const pos = {};
      for (const s of specs) if (s.ieee) pos[ieeeKey(s.ieee)] = s;
      const seen = new Set();
      for (const l of this._zha.links) {
        if (l.lqi < this._net.minLqi || (this._net.lqiOff || []).includes((LQI_BANDS.find((b) => l.lqi >= b.min) || LQI_BANDS[3]).min)) continue;
        const p = pos[l.a];
        const q = pos[l.b];
        if (!p || !q || p === q) continue;
        const k = [p.key, q.key].sort().join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        const [x1, y1] = P(p);
        const [x2, y2] = P(q);
        out += `<line class="${this._hl && (this._hl === p.key || this._hl === q.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lqiColor(l.lqi)}" stroke-width="2" opacity=".6"/>`;
      }
    }
    if (this._net.wlinks && this._a && this._a.aps && this._netShow().includes("network")) {
      // 0.7.3: each device to its access point; solid = cable, dashed = Wi-Fi; colour = access point.
      const aps = this._apList();
      for (const s of specs) {
        if (!s.rt || !s.rt.home || !s.rt.ap) continue;
        const ap = this._specs.get(this._a.aps[s.rt.ap]);
        if (!ap || ap === s) continue;
        const col = AP_COLORS[Math.max(0, aps.indexOf(s.rt.ap)) % AP_COLORS.length];
        const [x1, y1] = P(s);
        const [x2, y2] = P(ap);
        out += `<line class="wl ${s.rt.lan ? "cab" : ""} ${this._hl && (this._hl === s.key || this._hl === ap.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"/>`;
      }
    }
    if (this._net.hubs) {
      for (const s of specs) {
        const parent = s.item.via && this._specs.get(s.item.via);
        if (!parent || parent.type !== "net") continue;
        if (s.conns.includes("zigbee") && parent.conns.includes("zigbee")) continue;
        const [x1, y1] = P(s);
        const [x2, y2] = P(parent);
        out += `<line class="hub ${this._hl && (this._hl === s.key || this._hl === parent.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }
    }
    // 0.8.1: links to a device on another floor, drawn like any other link.
    for (const g of this._ghosts || []) {
      for (const l of g.links) {
        const s = this._specs.get(l.from);
        if (!s) continue;
        const [x1, y1] = P(s);
        const [x2, y2] = P(g);
        const hl = this._hl === s.key ? "hl" : "";
        out += l.cls === "zb"
          ? `<line class="${hl}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${l.color}" stroke-width="2" opacity=".6"/>`
          : `<line class="${l.cls} ${hl}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${l.color ? ` stroke="${l.color}"` : ""}/>`;
      }
    }
    return out;
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- actions
  _tapAction(s) {
    if (s.type === "net") return "network";
    const o = this._dev(s.item.id);
    const pt = this._per(s.item, this._overlay).tap;
    if (pt) return pt;
    if (o.tap) return o.tap;
    // 0.10: a robot opens its panel (the setting above can change that).
    if (s.type === "robot" || (s.ents || []).some((e) => domainOf(e) === "vacuum") || domainOf(s.item.main_entity || "") === "vacuum") return "robot";
    if (s.item.bond && s.item.tap === "more") return "more-info";
    const taps = { ...TAP_DEFAULT, ...(this._config.tap || {}) };
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    const act = taps[k] || "more-info";
    if (act === "toggle" && !s.ents.some((e) => TOGGLE_DOMAINS.has(domainOf(e)))) return "more-info";
    // 0.12.8: Health is for checking (batteries, connections): a tap there opens details, it never switches.
    if (act === "toggle" && this._overlay === "health") return "more-info";
    return act;
  },

  /** 0.12.8: the device's own word for "active": a door is open, motion is detected, an appliance is running. */
  _onWords(item, sp) {
    const e = (sp && sp.eid) || item.main_entity;
    const st = e && this._hass.states[e];
    const dm = e ? domainOf(e) : "";
    const dc = (st && st.attributes.device_class) || "";
    if (this._applOf(item)) return "it's running";
    if (dm === "cover" || ["door", "window", "opening", "garage_door", "garage"].includes(dc)) return "it's open";
    if (["motion", "moving", "vibration"].includes(dc)) return "motion is detected";
    if (["occupancy", "presence"].includes(dc)) return "someone is there";
    if (dm === "media_player") return "it's playing";
    if (dm === "lock") return "it's unlocked";
    if (dm === "climate") return "it's running";
    return "it's on";
  },

  /** Marker editing: ✕ on the selected marker hides it in this overlay (#108). */
  _xb(s) {
    return this._pick && s.item && this._selId === s.item.id ? `<span class="xb" data-xb="1" title="${dfT("edit.hide_here")}">✕</span>` : "";
  },

  _onClick(e) {
    const t = e.target;
    // 0.11.1: the click that ends a camera window drag does nothing (wherever it lands after a redraw).
    if (this._winMoved && Date.now() - this._winMoved < 500) {
      this._winMoved = 0;
      return;
    }
    // Edit markers: the info card preview is only a preview, its buttons are not run.
    if (this._pick && t.closest(".pop.prev")) {
      if (t.closest("[data-close]")) {
        this._prevHide = this._selId;
        return this._update(true);
      }
      const b = t.closest("[data-appldone],[data-iopen],[data-itg],[data-press],[data-mi]");
      if (b) this._toast(dfT("toast.preview_not_run", { b: b.textContent.trim().slice(0, 40) }));
      return;
    }
    // 0.10: robot panel buttons, "Clean this room", tap on a room in Cleaning.
    const rc = t.closest("[data-rbcmd]");
    if (rc) {
      this._hass.callService("vacuum", rc.dataset.rbcmd, { entity_id: rc.dataset.rb });
      this._popup = null;
      return this._update(true);
    }
    const cr = t.closest("[data-cleanroom]");
    if (cr) {
      this._hass.callService("vacuum", "clean_area", { entity_id: cr.dataset.rb, cleaning_area_id: [cr.dataset.cleanroom] });
      this._popup = null;
      this._toast(dfT("toast.cleaning_started"));
      return this._update(true);
    }
    const rm = !this._pick && !this._popup && t.closest("[data-croom]");
    if (rm) {
      this._popup = { type: "room", area: rm.dataset.croom };
      return this._update(true);
    }
    if (t.closest("[data-xb]") && this._pick) {
      e.stopPropagation();
      return this._pickHide && this._pickHide(this._selId);
    }
    const pp = this._pick && t.closest("[data-person]");
    if (pp) return this._pick(`person:${pp.dataset.person}`);
    const oa = t.closest("[data-oact]");
    if (oa) {
      if (this._held) {
        this._held = false;
        return;
      }
      const x = this._ovActs()[Number(oa.dataset.oact)];
      if (x && x.tap_action) this._barRun(x.tap_action, this._ovActEnt(x));
      else if (x && this._ovActEnt(x)) this._moreInfo(this._ovActEnt(x));
      return;
    }
    const ov = t.closest("[data-ov]");
    const scb = t.closest("[data-sc]");
    if ((ov || scb) && this._held) {
      this._held = false; // a long press already ran the hold action
      return;
    }
    if (ov) return this._setOverlay(ov.dataset.ov);
    if (scb) return this._barTap(Number(scb.dataset.sc));
    const ch = t.closest("[data-chev]");
    if (ch) {
      const nav = ch.parentElement.querySelector("nav.dock");
      const v = nav.getAttribute("aria-orientation") === "vertical";
      const by = Number(ch.dataset.chev) * (v ? nav.clientHeight : nav.clientWidth) * 0.8;
      nav.scrollBy(v ? { top: by, behavior: "smooth" } : { left: by, behavior: "smooth" });
      return;
    }
    if (t.closest("[data-menu]")) {
      this._menu = !this._menu;
      this._fopen = false;
      return this._update(true);
    }
    if (t.closest("[data-tinfo]")) {
      this._tinfo = !this._tinfo; // #111: the legends of the side tools
      return this._update(true);
    }
    const scn = t.closest("[data-sconn]");
    if (scn) {
      // #113: side tools: a connection on / off, starting from what is shown; at least one stays.
      const cur = new Set(this._netShow());
      const v = scn.dataset.sconn;
      if (cur.has(v)) {
        if (cur.size > 1) cur.delete(v);
      } else cur.add(v);
      this._net = { ...this._net, conns: CONN_ORDER.filter((c) => cur.has(c)) };
      this._saveNet();
      return this._update(true);
    }
    const cn = t.closest("[data-conn]");
    if (cn) {
      const v = cn.dataset.conn;
      if (v === "__default") this._net = { ...this._net, conns: null };
      else {
        const cur = new Set(Array.isArray(this._net.conns) && this._net.conns.length ? this._net.conns : []);
        if (cur.has(v)) cur.delete(v);
        else cur.add(v);
        this._net = { ...this._net, conns: cur.size ? CONN_ORDER.filter((c) => cur.has(c)) : null };
      }
      this._saveNet();
      return this._update(true);
    }
    const rl = t.closest("[data-role]");
    if (rl) {
      const set = new Set(this._net.roles || []);
      if (set.has(rl.dataset.role)) set.delete(rl.dataset.role);
      else set.add(rl.dataset.role);
      this._net = { ...this._net, roles: [...set] };
      this._saveNet();
      return this._update(true);
    }
    const lq = t.closest("[data-lqi]");
    if (lq) {
      const v = Number(lq.dataset.lqi);
      const set = new Set(this._net.lqiOff || []);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      this._net = { ...this._net, lqiOff: [...set] };
      this._saveNet();
      return this._update(true);
    }
    if (t.closest("[data-refresh]")) return this._refreshZha();
    if (t.closest("[data-fbtn]")) {
      this._fopen = true;
      this._menu = false;
      return this._update(true);
    }
    const fl = t.closest("[data-floor]");
    if (fl) {
      this._fopen = false;
      if (fl.dataset.floor === this._floor) return this._update(true);
      return this._setFloor(fl.dataset.floor);
    }
    const sd = t.closest("[data-side]");
    if (sd) {
      // 0.12.1: ◀ ▶ keep the rail open, so several plans of a level can be stepped through.
      this._stepSide(Number(sd.dataset.side));
      return;
    }
    const stp = t.closest("[data-step]");
    if (stp) {
      this._fopen = false;
      const before = this._floor;
      this._stepFloor(Number(stp.dataset.step));
      if (this._floor === before) this._update(true);
      return;
    }
    if (this._fopen) {
      this._fopen = false; // a tap anywhere else closes the floor list
      this._update(true);
      if (!t.closest("[data-k]")) return;
    }
    const air = t.closest("[data-airent]");
    if (air) {
      if (this._held) {
        this._held = false;
        return;
      }
      if (this._pick) return this._pick(air.dataset.airid); // Edit markers: select the AC
      return this._moreInfo(air.dataset.airent);
    }
    const pl = t.closest("[data-pulse]");
    if (pl) return this._moreInfo(pl.dataset.pulse);
    if (t.closest("[data-tipx]")) return this._tipClose();
    if (t.closest("[data-tipgo]")) {
      this._tipClose();
      window.history.pushState(null, "", PANEL_PATH);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    const nov = t.closest("[data-newov]");
    if (nov) return this._newOvAnswer(nov.dataset.newov, !!nov.dataset.add);
    const ad = t.closest("[data-appldone]");
    if (ad) {
      if (this._applDone) delete this._applDone[ad.dataset.appldone];
      this._applSave();
      this._popup = null;
      return this._update(true);
    }
    const apl = t.closest("[data-appl]");
    if (apl) {
      if (this._held) {
        this._held = false;
        return;
      }
      const keys = apl.dataset.appl.split(",");
      if (this._pick) return this._pick(keys[0]); // Edit markers: select it
      this._popup = keys.length > 1 ? { type: "appl", keys } : { type: "info", appl: keys[0] };
      return this._update(true);
    }
    const bar = t.closest("[data-bar]");
    if (bar) return this._moreInfo(bar.dataset.bar);
    const cv = t.closest("[data-cov]");
    if (cv) return this._coverCmd(cv.dataset.cov, cv.dataset.cmd);
    const hlk = t.closest("[data-hl]");
    if (hlk) return this._highlight(hlk.dataset.hl);
    const tg = t.closest("[data-tg]");
    if (tg) {
      this._net = { ...this._net, [tg.dataset.tg]: !this._net[tg.dataset.tg] };
      this._saveNet();
      return this._update(true);
    }
    if (t.closest("[data-layreset]")) {
      const ov = this._overlay;
      const rest = { ...this._lay };
      delete rest[ov];
      this._lay = rest;
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      if (ov === "network") {
        lsSet(`dfc_net_${this._lsKey()}`, {});
        this.setConfig(this._raw || this._config);
      }
      return this._update(true);
    }
    const ly = t.closest("[data-lay]");
    if (ly) {
      const ov = this._overlay;
      const name = ly.dataset.lay;
      const dflt = name === "rooms" ? this._roomsDefault(ov) : this._layerDefault(ov, name);
      this._setLayer(ov, name, !this._layerOn(ov, name, dflt), dflt);
      if (name === "replay") return this._rpOpen(this._layerOn(ov, "replay", false)); // no rail: Replay from Layers
      return this._update(true);
    }
    // 0.11.1 Home Replay: the rail button, ← Now, play, previous / next, the overlay to replay.
    if (t.closest("[data-rpgo],[data-rpov],[data-rp]")) {
      if (e.detail === 0) this._rpCtl(t); // keyboard (Enter / Space): a click without a pointer
      return;
    }
    if (this._rp && this._rp.menu) {
      this._rp.menu = false;
      this._update(true);
    }
    if (t.closest(".lmenu")) return;
    if (this._menu) {
      this._menu = false;
      this._update(true);
      if (!t.closest("[data-k]")) return;
    }
    const sc = t.closest("[data-scene]");
    if (sc) return this._runScene(sc.dataset.scene);
    if (t.closest("[data-new]")) {
      window.history.pushState(null, "", `${PANEL_PATH}?new=1`);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    const cf = t.closest("[data-confirm]");
    if (cf) {
      const p = this._popup;
      this._popup = null;
      if (p && p.action === "press" && p.eid) this._press(p.eid);
      if (p && p.action === "all_off") {
        const ents = this._lightEnts();
        if (ents.length) this._hass.callService("homeassistant", "turn_off", { entity_id: ents });
      }
      return this._update(true);
    }
    if (t.closest("[data-close]") || t.classList.contains("pop")) {
      this._popup = null;
      this._update(true);
      return;
    }
    const mi = t.closest("[data-mi]");
    if (mi) return this._moreInfo(mi.dataset.mi);
    const rs = t.closest("[data-rdsub]");
    if (rs && this._popup && this._popup.type === "readings") {
      this._popup = { ...this._popup, sub: rs.dataset.rdsub || null }; // 0.12.10: a device's own chart, "‹" back
      return this._update(true);
    }
    const io = t.closest("[data-iopen]");
    if (io) {
      const p0 = this._popup || {};
      this._popup = null;
      if (p0.appl) return this._moreInfo(io.dataset.iopen);
      const s0 = this._specs && this._specs.get(io.dataset.iopen);
      if (s0) s0.phantom ? (s0.type === "chip" ? this._openReadings(s0) : this._openList(s0)) : this._details(s0);
      return this._update(true);
    }
    const itg = t.closest("[data-itg]");
    if (itg) {
      const s0 = this._specs && this._specs.get(itg.dataset.itg);
      if (s0) this._toggle({ ...s0, ents: this._infoToggles(s0.item.bond ? { ...s0, ents: s0.item.entities || [] } : s0) });
      return;
    }
    const ip = t.closest("[data-press]");
    if (ip) {
      const e0 = ip.dataset.press;
      this._hass.callService(domainOf(e0), "press", { entity_id: e0 });
      ip.classList.add("done");
      return;
    }
    const pe = t.closest("[data-person]");
    if (pe) return this._moreInfo(pe.dataset.person);
    const wk = t.closest("[data-wk]");
    if (wk && !t.closest("[data-camx]")) {
      const ws = this._specs && this._specs.get(wk.dataset.wk);
      if (ws) return this._runAction(ws);
      return;
    }
    const cx = t.closest("[data-camx]");
    if (cx) {
      const st0 = this._hass.states[cx.dataset.camx];
      if (st0) this._camX = { ...(this._camX || {}), [cx.dataset.camx]: domainOf(cx.dataset.camx) === "event" ? st0.state : st0.last_changed };
      return this._update(true);
    }
    const k = t.closest("[data-k]");
    const tz = !k && t.closest("[data-touch]");
    if (!k && !tz) {
      if (!this._held && !this._swiped && t.closest(".box")) this._flashTouch();
      return;
    }
    if (this._swiped) {
      this._swiped = false;
      return;
    }
    if (this._held) {
      this._held = false;
      return;
    }
    // 0.12.6: in the card editor a tap selects the device AND does its real tap (the preview acts like the card).
    if (tz) {
      if (this._rpIn()) return null; // Replay is for looking
      this._pickNote(tz.dataset.touch);
      return this._touchTap(tz.dataset.touch);
    }
    return this._tapSpec(this._specs && this._specs.get(k.dataset.k));
  },

  /** A marker's tap (also a phantom's picture / touch area, which has no single device to switch). */
  _tapSpec(s) {
    if (!s) return;
    this._pickNote(s.item.id, s); // marker editing (#87/#95): select, then act
    if (s.elist) {
      this._popup = { type: "elist", key: s.key };
      return this._update(true);
    }
    // 0.11.1: a bond of lights is one lamp: tap switches all its bulbs (unless a tap is set for it).
    if (s.type !== "net" && this._lampBond(s.item) && !this._dev(s.item.id).tap && !this._per(s.item, this._overlay).tap) return this._toggle({ ...s, ents: this._parts(s.item) });
    // 0.7.5: bonds and phantoms (several things in one marker) open the info card; a single device does its tap action.
    // 0.12.10: a phantom of readings works like one thermometer: its tap opens the readings (the info card is the long press).
    if (s.type !== "net" && (s.phantom || s.item.bond || s.item.phantom) && !this._rdPhantom(s)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    return this._runAction(s);
  },

  /** The marker's own action ("Open ›" in the info card, a tap); 0.12.6: also a chosen long press (pre "hold_"). */
  _runAction(s, act = this._tapAction(s), pre = "") {
    if (act === "none") return;
    // 0.12.1: an unavailable device says so instead of trying to switch.
    if (act === "toggle") {
      const sts = (s.ents || []).map((e) => this._hass.states[e]).filter(Boolean);
      if (sts.length && sts.every((x) => x.state === "unavailable")) return this._toast(dfT("toast.unavailable", { d: this._dev(s.item.id).name || s.item.name || dfT("this_device") }));
    }
    if (act === "robot") {
      const eid = s.type === "robot" ? s.eid : [s.eid, ...(s.ents || []), s.item.main_entity].find((e) => e && domainOf(e) === "vacuum");
      if (eid) {
        this._popup = { type: "robot", key: s.key, eid };
        return this._update(true);
      }
    }
    // 0.10: open a dashboard / a browser_mod popup (set per device in Edit markers).
    if (act === "navigate" || act === "popup") {
      const o0 = { ...this._dev(s.item.id), ...this._per(s.item, this._overlay) };
      const o = { nav: o0[`${pre}nav`], popup_title: o0[`${pre}popup_title`], popup_card: o0[`${pre}popup_card`] };
      // 0.12.6: in the card editor's preview a dashboard is only named (leaving would close the editor).
      if (act === "navigate" && o.nav && this._isPreview()) return this._toast(dfT("toast.would_open", { u: o.nav }));
      const cfg = act === "navigate" ? (o.nav ? { action: "navigate", navigation_path: o.nav } : null) : o.popup_card ? { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(o.popup_title ? { title: o.popup_title } : {}), content: o.popup_card } } } : null;
      if (cfg) this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: s.ents[0], tap_action: cfg }, action: "tap" }, bubbles: true, composed: true }));
      else this._moreInfo(s.ents[0]);
      return;
    }
    // 0.13.9.17 #63: press a button (the one picked, else the device's / bond's first real button); asks first unless turned off.
    if (act === "press") {
      const e0 = this._pressEnt(s, pre);
      if (!e0) return this._moreInfo(s.ents[0]);
      const o0 = { ...this._dev(s.item.id), ...this._per(s.item, this._overlay) };
      if (o0[`${pre}ask`] === false) return this._press(e0);
      this._popup = { type: "confirm", action: "press", eid: e0 };
      return this._update(true);
    }
    if (act === "network") {
      this._popup = { type: "net", key: s.key };
      return this._update(true);
    }
    if (act === "toggle") return this._toggle(s);
    if (act === "readings") return this._openReadings(s);
    // Covers: the shutter controls (position, open / stop / close), also when a cover leads a bond
    // (shutter + window contact): only the covers are in the popup.
    // 0.10.2: any marker with a cover gets them, also when its main entity is a sensor
    // (an unsplit Shelly 2PM drawn as a bar).
    const covs = [...new Set([...s.ents, ...(s.item.allEntities || s.item.entities || [])])].filter((e) => e && domainOf(e) === "cover" && this._hass.states[e]);
    if (covs.length) {
      this._popup = { type: "covers", key: s.key, ents: covs };
      return this._update(true);
    }
    if (s.item.bond || (s.also && s.also.length)) return this._openList({ ...s, ents: [s.eid, ...(s.also || [])].filter(Boolean) });
    this._moreInfo(s.ents[0]);
  },

  _onInput(e) {
    const t = e.target;
    // test10 Energy: the hours by keyboard (the hidden slider over the bars).
    if (t && t.classList && t.classList.contains("erange")) {
      const i = Number(t.value);
      this._eAt = i <= 0 ? "day" : i >= 25 ? "now" : this._eHours()[i - 1].ts;
      return this._update(true);
    }
    if (t && t.classList && t.classList.contains("rpspeed")) {
      this._rp.speed = Number(t.value) || 900;
      lsSet("dfc_rp_speed", this._rp.speed);
      return this._update(true);
    }
    if (t && t.classList && t.classList.contains("rprange")) {
      this._rp.range = Number(t.value) || 24;
      lsSet("dfc_rp_range", this._rp.range);
      if (this._rp.t != null && this._rp.t < Date.now() - this._rpSpan()) this._rpLive(false);
      return this._rpLoad();
    }
    if (t && t.dataset && t.dataset.covpos) {
      clearTimeout(this._covT);
      this._covT = setTimeout(() => this._hass.callService("cover", "set_cover_position", { entity_id: t.dataset.covpos, position: Number(t.value) }), 350);
      return;
    }
    if (t && t.dataset && t.dataset.cleanop) {
      this._lay = { ...this._lay, cleaning: { ...(this._lay.cleaning || {}), op: Number(t.value) } };
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      const svg = this.shadowRoot.querySelector("svg.fresh");
      if (svg) svg.style.opacity = String(Number(t.value) / 100);
      return;
    }
    if (t && t.dataset && t.dataset.heatop) {
      this._lay = { ...this._lay, comfort: { ...(this._lay.comfort || {}), heatOp: Number(t.value) } };
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      this._drawHeat();
      return;
    }
  },

  /** Hold / right-click: Home Assistant's details (graphs for a phantom). In Edit markers it's only simulated. */
  _holdEl(t) {
    if (t.dataset.bh) this._barHold(t);
    else if (t.dataset.k) this._hold(t.dataset.k);
    else if (t.dataset.airent) this._moreInfo(t.dataset.airent);
    else if (t.dataset.touch) this._touchHold(t.dataset.touch, t.dataset.ent); // 0.12.6: the device's own long press
    else this._holdAppl(t.dataset.appl);
  },

  _hold(key) {
    const s = this._specs && this._specs.get(key);
    if (!s) return;
    this._pickNote(s.item.id, s);
    this._runHold(s);
  },

  /** 0.12.6: the long press chosen for a marker: per overlay, the device, the card's per kind; "" = the default. */
  _holdAction(s) {
    if (s.type === "net") return "";
    const pt = this._per(s.item, this._overlay).hold;
    if (pt) return pt;
    const o = this._dev(s.item.id);
    if (o.hold) return o.hold;
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    return (this._config.hold || {})[k] || "";
  },

  /** 0.12.6: run the long press: the chosen action, else the default (details; graphs for a phantom; a lamp bond's info card). */
  _runHold(s) {
    const act = this._holdAction(s);
    if (!act || act === "default") return this._details(s);
    if (act === "info") {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    const ents = this._lampBond(s.item) ? this._parts(s.item) : s.ents;
    if (act === "toggle") return this._toggle({ ...s, ents });
    return this._runAction({ ...s, ents }, act, "hold_");
  },

  /** 0.12.6: what a tap / long press does, in words (Edit markers, the card editor). */
  _actWords(s, hold) {
    const multi = (s.phantom || s.item.bond || s.item.phantom) && !this._rdPhantom(s);
    const W = { "more-info": "details", toggle: "switch on / off", readings: "readings with history", navigate: "open a dashboard", popup: "a popup card", none: "nothing", press: "press a button", network: "network info", robot: "robot panel", info: "info card" };
    if (hold) {
      const h = this._holdAction(s);
      if (h && h !== "default") return W[h] || h;
      return this._rdPhantom(s) ? "info card" : s.phantom ? "graphs" : this._lampBond(s.item) ? "info card" : "details";
    }
    if (this._lampBond(s.item) && !this._dev(s.item.id).tap && !this._per(s.item, this._overlay).tap) return "switch all";
    if (multi && !this._per(s.item, this._overlay).tap && !this._dev(s.item.id).tap) return "info card";
    return W[this._tapAction(s)] || this._tapAction(s);
  },

  /** 0.12.6: tell the card editor which device was tapped / held (big editor: select it; HA's preview: open
   *  its settings). The action itself still runs, as on the dashboard. */
  _pickNote(id, s) {
    if (!id) return;
    if (this._pick) this._pick(id, s);
    else if (this._isPreview()) window.dispatchEvent(new CustomEvent("dfc-preview-pick", { detail: { id, ov: this._overlay } }));
  },

  /** 0.12.6: inside the card editor's preview (HA sets .preview on preview cards; the dialog as a fallback). */
  _isPreview() {
    if (this.preview === true || this.hasAttribute("preview")) return true;
    let n = this;
    for (let i = 0; i < 30 && n; i++) {
      if (n.tagName && /HUI-CARD-PREVIEW|HUI-DIALOG-EDIT-CARD|HUI-SECTION-PREVIEW/.test(n.tagName)) return true;
      n = n.parentNode || n.host;
    }
    return false;
  },

  /** Home Assistant's details of a marker: graphs for a phantom, the leading entity's dialog otherwise. */
  /** 0.12.10: a phantom chip of readings (thermometers): tap = readings, long press = info card. */
  _rdPhantom(s) {
    return !!(s && s.phantom && s.type === "chip" && s.kind === "reading");
  },

  _details(s) {
    if (this._rdPhantom(s)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    if (s.phantom) return s.type === "chip" ? this._openReadings(s) : this._openList(s);
    // 0.11.1: a lamp bond's long press opens its info card (its tap switches it).
    if (s.type !== "net" && this._lampBond(s.item)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    this._moreInfo(s.eid || (s.ents || [])[0]);
  },

  /** Hold on an appliance: its details. */
  _holdAppl(ids) {
    const o = (this._appls || []).find((x) => x.ap.item.id === String(ids).split(",")[0]);
    if (!o) return;
    this._pickNote(o.ap.item.id);
    const ap = o.ap;
    this._moreInfo(ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity);
  },

  /** A short message on the card (Edit markers simulation). */
  /** 0.13.9.17 #63: the button a "Press a button" tap presses. */
  _pressEnt(s, pre = "") {
    const o = { ...this._dev(s.item.id), ...this._per(s.item, this._overlay) };
    const want = o[`${pre}press`];
    if (want && this._hass.states[want]) return want;
    const pool = [...new Set([...(s.ents || []), ...(s.item.entities || []), ...(s.item.allEntities || [])])];
    return pool.find((e) => e && ["button", "input_button"].includes(domainOf(e)) && this._hass.states[e] && this._hass.states[e].state !== "unavailable" && !this._aux(e) && !/_identify$/.test(e)) || null;
  },

  _press(e0) {
    const st = this._hass.states[e0];
    const b = (st && st.attributes.friendly_name) || e0;
    if (this._isPreview()) return this._toast(dfT("toast.would_press", { b }));
    this._hass.callService(domainOf(e0), "press", { entity_id: e0 });
    this._toast(dfT("toast.pressed", { b }));
  },

  _toast(text) {
    const card = this.shadowRoot && this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    let el = card.querySelector(".ftoast");
    if (!el) {
      el = document.createElement("div");
      el.className = "ftoast";
      card.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 2600);
  },

  /** "Name · state" of the thing at a screen point (markers, chips, openings, appliances, people). */
  _tipAt(x, y) {
    const root = this.shadowRoot;
    const hit = root.elementFromPoint ? root.elementFromPoint(x, y) : null;
    if (!hit || !hit.closest || hit.closest(".pop, .lmenu, .dock, .lcorner, .fcorner, .lslot")) return { text: "", el: null };
    const el = hit.closest("[data-k],[data-appl],[data-bar],[data-person],[data-ghost],[data-airent]");
    let text = "";
    if (el && el.dataset.k) {
      const s = this._specs && this._specs.get(el.dataset.k);
      text = s ? this._tipText(s) : "";
    }
    if (el && !text) text = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    return { text, el };
  },

  /** The one tooltip, placed inside the card above the point (finger or mouse). */
  _showTip(text, x, y, el, finger) {
    const card = this.shadowRoot && this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    let tip = card.querySelector(".xtip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "xtip";
      card.appendChild(tip);
    }
    clearTimeout(this._xtipT);
    if (!text) return tip.classList.remove("show");
    tip.textContent = text;
    const c = card.getBoundingClientRect();
    let ax = x, ay = y - (finger ? 48 : 0);
    if (el && !finger) {
      const r = el.getBoundingClientRect();
      ax = r.left + r.width / 2;
      ay = r.top - 6;
    }
    const w = tip.offsetWidth || 120;
    const h = tip.offsetHeight || 28;
    const left = Math.max(w / 2 + 4, Math.min(c.width - w / 2 - 4, ax - c.left));
    const top = Math.max(h + 4, ay - c.top);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.add("show");
  },

  _hideTip() {
    clearTimeout(this._hovT);
    this._hovEl = null;
    const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
    if (tip) tip.classList.remove("show");
  },

  /** PC hover: after a short pause over a thing, its name and state. */
  _hoverSoon(x, y) {
    if (this._hovRaf) return;
    this._hovRaf = requestAnimationFrame(() => {
      this._hovRaf = null;
      const { text, el } = this._tipAt(x, y);
      if (el === this._hovEl) return;
      this._hovEl = el;
      clearTimeout(this._hovT);
      if (!el || !text) return this._showTip("", 0, 0);
      this._hovT = setTimeout(() => this._showTip(text, x, y, el, false), 150);
    });
  },

  /** Explore (touch): show the name and state of what's under the finger. */
  _explore(x, y) {
    const { text } = this._tipAt(x, y);
    this._showTip(text, x, y, null, true); // above the finger, never under it
  },

  _exploreEnd() {
    clearTimeout(this._xtipT);
    this._xtipT = setTimeout(() => {
      const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
      if (tip) tip.classList.remove("show");
    }, 1000);
  },

  /** "Name · state" for the hover tooltip and explore. */
  _tipText(s) {
    return `${s.name}${this._tipState(s) ? ` · ${this._tipState(s)}` : ""}`;
  },

  _tipState(s) {
    if (s.type === "net") return "";
    let t = "";
    if (s.type === "chip") return ""; // 0.11: a chip already shows its values: the tip only names it
    else if (s.eid || (s.ents || [])[0]) t = this._fmt(s.eid || s.ents[0]);
    return t && t !== "—" ? t : t === "—" ? dfT("unavailable_l") : "";
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.11.1: a bond whose members are all lights acts as one lamp. */
  _lampBond(item) {
    const e = this._parts(item);
    return !!(item && item.bond) && e.length > 0 && e.every((x) => domainOf(x) === "light");
  },

  /** 0.12.9: a bond's real parts: its entities without settings / technical ones (an "Internet access" switch). */
  _parts(item) {
    const e = (item && item.entities) || [];
    const r = e.filter((x) => !this._aux(x));
    return r.length ? r : e;
  },

  /** Entities the info card can switch (lights, switches, fans, helpers). */
  _infoToggles(s) {
    const ents = [...new Set(s.ents || [])].filter((e) => ["light", "switch", "fan", "input_boolean"].includes(domainOf(e)) && this._hass.states[e] && !this._aux(e));
    // Only lamp bonds get on / off, and only their lights: never an appliance's plug or a config switch.
    if (this._applOf(s.item)) return [];
    const lamp = domainOf(s.eid || "") === "light" || s.item.group === "lights" || s.item.actsAs === "light" || s.item.as === "light";
    return lamp ? ents.filter((e) => domainOf(e) === "light" || (s.item.group === "lights" && e === s.eid)) : [];
  },

  /** A configuration or diagnostic entity (Home Assistant's category): never listed or switched. */
  _aux(e) {
    const reg = this._hass.entities && this._hass.entities[e];
    const st = this._hass.states[e];
    const cat = (reg && reg.entity_category) || (st && st.attributes && st.attributes.entity_category);
    return cat === "config" || cat === "diagnostic";
  },

  /** Edit markers (0.7.5): the selected bond / phantom / appliance shows its info card as a preview. */
  _previewPop() {
    const id = this._pick && this._selId;
    if (!id || this._prevHide === id) return null;
    if ((this._appls || []).some((o) => o.ap.item.id === id)) return { type: "info", appl: id, prev: true };
    const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x.item && x.item.id === id);
    return sp && (sp.phantom || sp.item.bond || sp.item.phantom) ? { type: "info", key: sp.key, prev: true } : null;
  },

  /** 0.7.5: the info card: name, state, every reading, buttons; "Open ›" = the marker's action. */
  _infoHtml(p) {
    const hass = this._hass;
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    let name, dot, state, item, lead, reads = [], toggles = [], open = "", anchor, attention = "";
    if (p.appl) {
      const o = (this._appls || []).find((x) => x.ap.item.id === p.appl);
      if (!o) return "";
      const { ap, st } = o;
      item = ap.item;
      name = this._dev(item.id).name || item.name;
      dot = `rgb(${st.col || "150,150,150"})`;
      const per = this._per(item, "live");
      const chosen = per.lead && hass.states[per.lead] ? per.lead : null;
      state = [chosen ? this._fmt(chosen) : st.word, st.time, st.w].filter(Boolean).join(" · ");
      lead = chosen || ap.status || ap.running || ap.power || ap.plug || item.main_entity;
      reads = Array.isArray(per.extras) ? per.extras : [ap.remaining || ap.progress, ap.power].filter(Boolean);
      if (st.phase === "done") attention = `<button class="ibig" data-appldone="${cesc(item.id)}">${dfT("appl.unloaded")}</button>`;
      open = lead ? `<button class="iopen" data-iopen="${cesc(lead)}">${dfT("open_more")}</button>` : "";
      anchor = `[data-appl*="${CSS.escape(item.id)}"]`;
    } else {
      const s = this._specs && this._specs.get(p.key);
      if (!s) return "";
      item = s.item;
      name = s.name;
      const on = s.type === "chip" ? s.cls !== "off" : s.on;
      dot = on ? s.color || "var(--dfc-accent)" : "#9e9e9e";
      // 0.12.9: a chip says its value (what the plan shows) and lists its own readings too.
      state = this._tipState(s) || (s.type === "chip" ? (s.lines || []).filter(Boolean).join(" · ") : "") || "—";
      state = state.split(" · ").filter((x) => x && x !== "—").join(" · ") || "—"; // no "— · Off"
      lead = s.type === "chip" ? null : s.eid || (s.ents || [])[0];
      const picked = Array.isArray(this._per(item, this._overlay).extras) ? this._per(item, this._overlay).extras : null;
      reads = picked || [...(s.ents || []), ...(s.also || []), ...(item.entities || [])];
      // 0.11.1: a bond lists every member (its leading one too); each row opens that member's details.
      if (s.phantom || item.bond) lead = null; // a phantom has no one leading entity: all its sensors are listed
      // 0.12.7: a bond always lists all its parts, then the picked "Also show" lines.
      if (item.bond) reads = [...(item.entities || []), ...(picked || s.also || [])];
      else if (s.phantom && picked) reads = [...(s.ents || []), ...picked];
      toggles = this._infoToggles(item.bond ? { ...s, ents: item.entities || [] } : s);
      open = item.bond ? "" : `<button class="iopen" data-iopen="${cesc(s.key)}">${s.phantom ? dfT("graphs_more") : dfT("open_more")}</button>`;
      anchor = `[data-k="${CSS.escape(s.key)}"]`;
      if (toggles.length) {
        const anyOn = toggles.some((e) => (hass.states[e] || {}).state === "on");
        attention = `<button class="ibig" data-itg="${cesc(s.key)}">${anyOn ? dfT("turn_off") : dfT("turn_on")}</button>`;
      }
    }
    // A chip's own readings are listed even when HA files them under Diagnostic (Health's battery).
    const sp0 = !p.appl && this._specs && this._specs.get(p.key);
    const own = new Set(sp0 ? sp0.ents || [] : []); // what the plan draws (its picked lines too); a Diagnostic one only as a number
    reads = [...new Set([...own, ...reads])].filter((e) => e && e !== lead && hass.states[e] && (!this._aux(e) || (own.has(e) && num(hass.states[e].state))) && !NO_VALUE.has(domainOf(e)));
    // 0.12.9: readings before switches and settings (a bond keeps its parts first).
    const rank = (e) => (["sensor", "climate", "weather"].includes(domainOf(e)) ? 0 : domainOf(e) === "binary_sensor" ? 1 : 2);
    if (!(item && (item.bond || item.phantom))) reads = reads.map((e, i) => [e, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]);
    const pool = [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    const presses = pool.filter((e) => ["button", "input_button"].includes(domainOf(e)) && hass.states[e] && hass.states[e].state !== "unavailable" && !this._aux(e)).slice(0, 3); // 0.13.9.17: a never-pressed button is "unknown", still a button
    // 0.12.9: names without the card's name or Home Assistant's device name in front.
    const strip = (e) => this._shortName(item, e, name, !!(item && (item.bond || item.phantom)));
    const seen = new Set();
    const rows = reads.filter((e) => {
      const k = `${strip(e)}|${this._extraText(e)}`; // one row per name and value (D1)
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8).map((e) => `<button class="irow" data-mi="${cesc(e)}"><span>${cesc(strip(e))}</span><b>${cesc(this._extraText(e))}</b></button>`).join("");
    const pr = presses.map((e) => `<button class="ipress" data-press="${cesc(e)}">${cesc(strip(e))}</button>`).join("");
    // 0.8.1: redrawn for new values at the spot it already had (no fade out and in).
    const was = this._icPos && this._icPos.anc === anchor ? this._icPos : null;
    return `<div class="pop ip ${p.prev ? "prev" : ""}"><div class="icard ${was ? "placed" : ""}" ${was ? `style="left:${was.left}px;top:${was.top}px"` : ""} role="dialog" aria-label="${cesc(name)}" data-anc="${cesc(anchor)}"><div class="ih"><b>${cesc(name)}</b>${close}</div><div class="ist"><i style="background:${dot}"></i><span>${cesc(state)}</span></div>${rows ? `<div class="irows">${rows}</div>` : ""}${attention || pr ? `<div class="ibtns">${attention}${pr}</div>` : ""}${open ? `<div class="iacts">${open}</div>` : ""}</div></div>`;
  },

  _entName(e) {
    return entName(this._hass, e);
  },

  /** 0.12.9: an entity's name without its device's name in front (the card's name, HA's device names). */
  _shortName(item, e, name, multi) {
    const hass = this._hass;
    const full = this._entName(e);
    const reg = (hass.entities || {})[e];
    const dv = reg && reg.device_id && (hass.devices || {})[reg.device_id];
    const pre = [name, item && item.name, dv && dv.name_by_user, dv && dv.name].filter(Boolean).map((x) => String(x).trim()).sort((x, y) => y.length - x.length);
    for (const n of pre) {
      if (full.toLowerCase().startsWith(n.toLowerCase()) && full.length > n.length) {
        const rest = full.slice(n.length).replace(/^[\s\-_·:]+/, "");
        // 0.12.10: in a marker of several devices the device's name tells the rows apart ("TH01 · Temperature").
        const dn = dv && (dv.name_by_user || dv.name);
        if (rest && multi && dn && n !== name && n !== (item && item.name)) return `${dn} · ${rest.replace(/^\w/, (c) => c.toUpperCase())}`;
        if (rest) return rest.replace(/^\w/, (c) => c.toUpperCase());
      }
    }
    return full;
  },

  /** Put the info card next to its marker, inside the card. */
  _placeInfo() {
    const ic = this.shadowRoot && this.shadowRoot.querySelector(".icard");
    if (!ic) return;
    const pop = ic.parentElement.getBoundingClientRect();
    const anc = this.shadowRoot.querySelector(ic.dataset.anc);
    const r = ic.getBoundingClientRect();
    let x = pop.width / 2, y = pop.height / 2, below = false;
    if (anc) {
      const a = anc.getBoundingClientRect();
      x = a.left + a.width / 2 - pop.left;
      y = a.top - pop.top - 10;
      if (y - r.height < 6) {
        y = a.bottom - pop.top + 10;
        below = true;
      }
    } else {
      y = (pop.height + r.height) / 2;
    }
    const left = Math.max(6, Math.min(pop.width - r.width - 6, x - r.width / 2));
    const top = below ? Math.min(pop.height - r.height - 6, y) : Math.max(6, y - r.height);
    ic.style.left = `${left}px`;
    ic.style.top = `${top}px`;
    ic.classList.add("placed");
    this._icPos = { anc: ic.dataset.anc, left, top };
  },

  /** 0.11: was this just turned off in Live (still within its few undo seconds)? */
  _undoFor(eids) {
    const u = this._undo;
    return !!(u && Date.now() < u.until && eids.some((e) => u.ents.includes(e)));
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.12.1 Touch areas: invisible tap areas for devices already drawn in the plan picture (a TV, an AC), set
   *  in the Floorplan Editor. Live only; they work when the device is off too. The smaller one wins where two
   *  overlap (drawn last). Card setting live.touch_hint: flash (when you tap empty plan), outline, or none. */
  _touchHtml(a) {
    if (this._overlay !== "live" || this._rpIn()) return "";
    const hint = ((this._config.live || {}).touch_hint) || "flash";
    const list = this._items(a)
      .map((it) => [it, this._bodyOf(it)])
      .filter(([it, b]) => b && b.touch && !b.pic && Number.isFinite(it.x) && this._per(it, "live").tap !== "none")
      .sort(([, x], [, y]) => y.touch.w * y.touch.h - x.touch.w * x.touch.h);
    return list
      .map(([it, b]) => {
        const { w, h } = b.touch;
        const busy = this._busyOn(it.id) ? "busy" : "";
        return `<div class="touch ${hint === "outline" ? "outline" : ""} ${busy}" data-touch="${cesc(it.id)}" data-ent="${cesc(b.lead)}" role="button" aria-label="${cesc(b.name)}" style="left:${it.x - w / 2}%;top:${it.y - h / 2}%;width:${w}%;height:${h}%"></div>`;
      })
      .join("");
  },

  /** 0.12.2 Device pictures (Live): the picture stands at the device and is its tap area (tap = the device's
   *  tap, hold = details, also when off). One look per state, changeable per device in the Floorplan Editor:
   *  on = full, off = faint, unavailable = dotted outline. The outline is traced from the picture's transparency
   *  when it is picked; "inset" pulls it a little inside. A tint keeps the picture's shading (blend "color"). */
  _picHtml(a, part = "body") {
    if (this._overlay !== "live") return "";
    const replay = this._rpIn(); // 0.12.3: in Replay the picture takes the look of the replayed moment
    const out = [];
    for (const it of this._items(a)) {
      const body = this._bodyOf(it);
      const p = body && body.pic;
      if (!p || !Number.isFinite(it.x)) continue;
      // 0.12.4: one rule for every picture. The entity picked in Edit markers ("Show in Live when…") decides
      // On / Off (with an optional "counts as on when"); without one, the item's own entities do.
      const pl = this._per(it, "live");
      const st = this._picState(body.sents, pl.when || pl.lead, pl.when_on); // 0.12.5: else the entity that leads
      const state = st;
      const look = (p.looks || {})[state] || PIC_LOOK[state];
      // Highlight: with an entity picked in Edit markers it follows that entity (by default only while On);
      // 0.13.3: without one, every highlight look shows while the picture is On.
      const hl = !p.hl || !p.hl.look ? null
        : pl.hl ? ((pl.hl_any || state === "on") && this._picState([pl.hl], pl.hl, pl.hl_on) === "on" ? p.hl : null)
          : state === "on" ? p.hl : null;
      if (look === "hidden") continue;
      const url = this._picUrl(p.src);
      if (!url) continue;
      const busy = !replay && this._busyOn(it.id);
      if (part === "hl") {
        out.push(picMarkup({ p, url, look, hl, x: it.x, y: it.y, part }));
        continue;
      }
      out.push(picMarkup({ p, url, look, hl, busy, x: it.x, y: it.y, part, attrs: `data-touch="${cesc(it.id)}" data-ent="${cesc(body.lead)}" role="button" aria-label="${cesc(`${body.name}${state === "un" ? ` · ${dfT("unavailable_l")}` : ""}`)}"` }));
    }
    return out.join("");
  },

  /** 0.12.6: does the device have a look of its own here (Live: a touch area; its chosen light shape while on)?
   *  Then its marker draws no icon. Same rule for every marker; pictures replace the marker anyway. */
  _lookHere(s) {
    if (!s || !s.item || this._overlay !== "live" || s.type === "net") return false;
    const b = this._bodyOf(s.item);
    return !!(b && b.touch); // 0.12.7: a light shape is not a look (Live's "Lights as" decides for lamps)
  },

  /** Does a picture stand for this item (itself or its bond)? Its marker is then not drawn in Live. */
  _picStands(it) {
    return !!it.pic;
  },

  /** 0.12.3: the "body" of an item (its picture / touch area). A bond is one item on the card (members merged),
   *  carrying the picture / touch area of the member that has one. Works the same for a device, a bond and an
   *  entity placed on its own. */
  _bodyOf(it) {
    if (!it || (!it.pic && !it.touch)) return null;
    const ents = [...new Set([it.main_entity, ...(it.allEntities || it.entities || [])].filter(Boolean))];
    const lead = it.main_entity || ents[0];
    if (!lead) return null;
    const sw = it.bond ? it.entities || [lead] : [lead]; // a bond switches its members' main entities together
    // 0.13.9.1: what the picture's own On / Off follows: the same as its marker (a bond: its members' main
    // entities; a device: its main entity); without one, only the device's primary entities (Home Assistant's
    // own label: no "config" / "diagnostic" category, not hidden), so a setting such as a delay number never
    // keeps it On.
    const reg = (this._hass && this._hass.entities) || {};
    const primary = ents.filter((e) => { const r = reg[e]; return !r || (!r.entity_category && !r.hidden); });
    const sents = it.bond ? sw : it.main_entity ? [it.main_entity] : primary.length ? primary : ents;
    return { pic: it.pic, touch: it.touch, ents, sents, lead, sw, name: this._dev(it.id).name || it.name || "", bond: !!it.bond };
  },

  /** 0.12.4: "on" / "off" / "un" of a picture. With an entity picked: its state, "on" by the Overlay Bar rule
   *  (on, open, home, playing…) or by "counts as on when" (same syntax: "charging, CHARGING", ">0"). Without one:
   *  on when any of the item's entities is on; unavailable when all are. */
  _picState(ents, when, whenOn) {
    if (when && this._hass.states[when]) {
      const s0 = this._hass.states[when];
      if (s0.state === "unavailable") return "un";
      return barActive(this._hass, when, whenOn) ? "on" : "off";
    }
    const sts = ents.map((e) => this._hass.states[e]).filter(Boolean);
    if (!sts.length || sts.every((x) => x.state === "unavailable")) return "un";
    return sts.some((x) => !PIC_OFF.has(x.state)) ? "on" : "off";
  },

  /** The picture's address: the library is a static file; an own picture needs a signed address (async). */
  _picUrl(src) {
    if (src.startsWith("lib:")) return `${STATIC_BASE}/pictures/${src.slice(4)}.webp`;
    this._picSigned = this._picSigned || new Map();
    const hit = this._picSigned.get(src);
    if (hit) return hit;
    if (!this._picSigning) {
      this._picSigning = true;
      cardSign(this._live || this._hass, src)
        .then((u) => {
          this._picSigned.set(src, u);
          this._update(true);
        })
        .catch(() => {})
        .finally(() => (this._picSigning = false));
    }
    return null;
  },

  _touchTap(id) {
    const it = this._items(this._a || {}).find((x) => x.id === id);
    const b = it && this._bodyOf(it);
    if (!b) return;
    // 0.13.2: a phantom's picture / touch area does what its marker does (readings, or its info card).
    if (it.phantom) {
      const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x && x.item && x.item.id === id);
      if (sp) return this._tapSpec(sp);
      this._popup = { type: "info", key: id };
      return this._update(true);
    }
    // 0.12.3: a bond's picture / touch area switches the whole bond (its members' main entities), as its marker.
    this._runAction({ type: "dev", key: `touch:${id}`, item: it, ents: b.bond ? b.sw : b.ents, eid: b.lead, kind: kindOf(b.lead, this._hass.states[b.lead]) });
  },

  /** 0.12.6: a touch area / picture held = its device's long press (a lamp bond: its info card). */
  _touchHold(id, ent) {
    const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x && x.item && x.item.id === id);
    this._pickNote(id);
    if (sp) return this._runHold(sp);
    const it = this._items(this._a || {}).find((x) => x.id === id);
    const b = it && this._bodyOf(it);
    if (!b) return this._moreInfo(ent);
    this._runHold({ type: "dev", key: `touch:${id}`, item: it, ents: b.bond ? b.sw : b.ents, eid: b.lead, kind: kindOf(b.lead, this._hass.states[b.lead]) });
  },

  /** Tapping empty plan briefly shows where the touch areas are (hint "flash"). */
  _flashTouch() {
    if (((this._config.live || {}).touch_hint || "flash") !== "flash") return;
    const zs = this.shadowRoot.querySelectorAll(".touch");
    if (!zs.length) return;
    zs.forEach((z) => z.classList.add("flash"));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => zs.forEach((z) => z.classList.remove("flash")), 700);
  },

  /** 0.12.1: after a tap, a short "working" pulse until the device answers (slow IR ACs, shutters), max 8 s. */
  _markBusy(item, ents) {
    if (!item || !item.id) return;
    this._busy = this._busy || new Map();
    this._busy.set(item.id, { until: Date.now() + 8000, ents, was: ents.map((e) => (this._hass.states[e] || {}).state).join("|") });
    clearTimeout(this._busyT);
    this._busyT = setTimeout(() => this._update(true), 8100);
  },

  _busyOn(id) {
    const b = this._busy && this._busy.get(id);
    if (!b) return false;
    const now = b.ents.map((e) => (this._hass.states[e] || {}).state).join("|");
    if (Date.now() > b.until || now !== b.was) {
      this._busy.delete(id);
      return false;
    }
    return true;
  },

  _toggle(s) {
    const ents = s.ents.filter((e) => TOGGLE_DOMAINS.has(domainOf(e)));
    if (!ents.length) return this._moreInfo(s.ents[0]);
    this._markBusy(s.item, ents);
    if (ents.every((e) => domainOf(e) === "cover")) {
      const anyOpen = ents.some((e) => ["open", "opening"].includes((this._hass.states[e] || {}).state));
      this._hass.callService("cover", anyOpen ? "close_cover" : "open_cover", { entity_id: ents });
      return;
    }
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    // 0.11: turned off in Live, it stays a few seconds, faded, so one more tap turns it back on.
    if (anyOn && this._overlay === "live") {
      this._undo = { ents, until: Date.now() + 6000 };
      clearTimeout(this._undoT);
      this._undoT = setTimeout(() => this._update(true), 6100);
    }
    this._hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
  },

  _coverCmd(eid, cmd) {
    const ents = eid === "__all" ? ((this._popup && this._popup.ents) || (this._specs.get(this._popup && this._popup.key) || { ents: [] }).ents).filter((e) => domainOf(e) === "cover") : [eid];
    const svc = { open: "open_cover", close: "close_cover", stop: "stop_cover" }[cmd];
    if (svc && ents.length) this._hass.callService("cover", svc, { entity_id: ents });
  },

  /** Highlight a marker for a few seconds (from a popup list, #65). */
  _highlight(key) {
    this._popup = null;
    this._hl = key;
    this._update(true);
    clearTimeout(this._hlT);
    this._hlT = setTimeout(() => {
      this._hl = null;
      this._update(true);
    }, 4000);
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** Zigbee: each device's best parent (strongest link to a router / the coordinator). */
  _zbParents() {
    const out = {};
    if (!this._zha) return out;
    const by = this._zha.byIeee || {};
    for (const l of this._zha.links || []) {
      const pr = by[l.b];
      if (!pr || !(pr.role === "router" || pr.role === "coordinator")) continue;
      if ((by[l.a] || {}).role === "coordinator") continue;
      if (!out[l.a] || l.lqi > out[l.a].lqi) out[l.a] = { p: l.b, lqi: l.lqi };
    }
    return out;
  },

  /** Path from the top (coordinator / hub) to this device, as names. */
  _chain(s) {
    const names = [s.name];
    const specsByIeee = {};
    for (const x of this._specs.values()) if (x.ieee) specsByIeee[ieeeKey(x.ieee)] = x;
    const parents = this._zbParents();
    let cur = s;
    for (let i = 0; i < 6; i++) {
      let up = null;
      if (cur.item.via && this._specs.get(cur.item.via)) up = this._specs.get(cur.item.via);
      else if (cur.ieee && parents[ieeeKey(cur.ieee)]) {
        const pk = parents[ieeeKey(cur.ieee)].p;
        up = specsByIeee[pk] || { name: (this._zha.byIeee[pk] || {}).role === "coordinator" ? dfT("role.coordinator") : dfT("net.router"), item: {}, last: true };
      }
      if (!up || names.includes(up.name)) break;
      names.unshift(up.name);
      if (up.last) break;
      cur = up;
    }
    return names;
  },

  /** Devices connected through this one: via a hub/bridge, or Zigbee children (best parent). */
  _children(s) {
    const out = [];
    const parents = this._zbParents();
    const me = s.ieee ? ieeeKey(s.ieee) : null;
    for (const x of this._specs.values()) {
      if (x === s || x.type !== "net") continue;
      if (x.item.via === s.item.id) out.push(x);
      else if (me && x.ieee && parents[ieeeKey(x.ieee)] && parents[ieeeKey(x.ieee)].p === me) out.push(x);
    }
    // Devices of this hub that aren't on the plan (or on another floor): names only.
    const placed = new Set(out.map((x) => x.item.id));
    const extra = [];
    for (const f of this._floors()) {
      if (f.id === this._floor) continue;
      for (const [id, d] of Object.entries(f.sensor.attributes.devices || {})) if (d.via === s.item.id && !placed.has(id)) extra.push(`${d.name} (${f.name})`);
    }
    return { out, extra };
  },

  _moreInfo(eid) {
    if (!eid) return;
    this._popup = null;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
    this._update(true);
  },

  _openList(s) {
    this._popup = { type: "list", key: s.key };
    this._update(true);
  },

  _openReadings(s) {
    // 0.12.11: the popup charts what the marker shows: its own values (for a chip, where its numbers come from)
    // and every reading picked in "Also shows".
    const core = s.core || s.ents;
    const extra = s.ents.filter((e) => !core.includes(e));
    const vals = s.src ? [s.src.t, s.src.h].filter(Boolean) : core;
    this._popup = { type: "readings", key: s.key, ents: [...new Set([...(vals.length ? vals : core), ...extra])], lead: s.eid || core[0] };
    this._hist = null;
    this._update(true);
  },

  _popupHtml() {
    const p = this._popup || this._previewPop();
    this._prevShown = !this._popup && !!p;
    if (!p) return "";
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    if (p.type === "confirm" && p.action === "press") {
      const st = this._hass.states[p.eid];
      const b = (st && st.attributes.friendly_name) || p.eid;
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(b)}"><h3>${dfT("press.q", { b: cesc(b) })}${close}</h3><div class="acts"><button data-close="1">${dfT("cancel")}</button><button class="pri" data-confirm="1">${dfT("press.do")}</button></div></div></div>`;
    }
    if (p.type === "confirm") {
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${dfT("scene.all_off")}"><h3>${dfT("alloff.q")}${close}</h3><div>${p.n ? dfT("alloff.n_on", { n: p.n }) : dfT("alloff.none")}</div><div class="acts"><button data-close="1">${dfT("cancel")}</button><button class="pri" data-confirm="1">${dfT("scene.all_off")}</button></div></div></div>`;
    }
    if (p.type === "info") return this._infoHtml(p);
    if (p.type === "elist") {
      const es = this._specs && this._specs.get(p.key);
      if (!es) return "";
      const f = (v) => (es.unit === "W" ? fmtW(v) : fmtKwh(v));
      return `<div class="pop"><div class="popin"><h3>${cesc(es.name)}${close}</h3><div class="list">${es.elist.map((x) => `<button data-mi="${cesc(x.ent)}">${cesc(x.name)}<small>${cesc(f(x.v))}</small></button>`).join("")}</div><div class="rbhint">${dfT("phantom.place_hint")}</div></div></div>`;
    }
    if (p.type === "robot") return this._robotPop(p);
    if (p.type === "room") return this._roomPop(p);
    if (p.type === "appl") {
      const list = (this._appls || []).filter((o) => p.keys.includes(o.ap.item.id));
      if (!list.length) return "";
      const rows = list.map(({ ap, st }) => {
        const lead = ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity;
        const sub = [st.word, st.time, st.w].filter(Boolean).join(" · ");
        const done = st.phase === "done" ? `<button class="mini" data-appldone="${cesc(ap.item.id)}">${dfT("appl.unloaded")}</button>` : "";
        return `<div class="arow"><button data-mi="${cesc(lead)}"><span class="ad" style="--ac:${st.col || "150,150,150"}"></span><span class="nm">${cesc(ap.item.name)}<small>${cesc(sub)}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>${done}</div>`;
      }).join("");
      const title = list.length > 1 ? dfT("appl.appliances") : list[0].ap.item.name;
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(title)}"><h3>${cesc(title)}${close}</h3><div class="alist">${rows}</div></div></div>`;
    }
    const s = this._specs && this._specs.get(p.key);
    if (!s) return "";
    if (p.type === "list") {
      const lents = s.also && s.also.length ? [s.eid, ...s.also] : s.ents;
      return `<div class="pop"><div class="popin"><h3>${cesc(s.name)}${close}</h3><div class="list">${lents.map((e) => {
        return `<button data-mi="${cesc(e)}">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}</small></button>`;
      }).join("")}</div></div></div>`;
    }
    if (p.type === "covers") {
      const row = (e) => {
        const st = this._hass.states[e];
        if (!st) return "";
        const f = Number(st.attributes.supported_features || 0);
        const pos = st.attributes.current_position;
        const slider = f & 4 && pos != null ? `<input type="range" min="0" max="100" step="5" value="${Number(pos)}" data-covpos="${cesc(e)}" aria-label="${dfT("cover.position")}">` : "";
        return `<div class="cov"><span class="nm">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}${pos != null && Number.isFinite(Number(pos)) ? ` · ${Number(pos)}%` : ""}</small></span>${slider}<button data-cov="${cesc(e)}" data-cmd="open" aria-label="${dfT("cover.open")}"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="stop" aria-label="${dfT("cover.stop")}"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="close" aria-label="${dfT("cover.close")}"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>`;
      };
      const cents = p.ents || s.ents.filter((e) => domainOf(e) === "cover");
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3>${cesc(s.name)}${close}</h3><div>${cents.map(row).join("")}</div>${cents.length > 1 ? `<div class="covall">${dfT("cover.all")}<button data-cov="__all" data-cmd="open" aria-label="${dfT("cover.open_all")}"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="__all" data-cmd="stop" aria-label="${dfT("cover.stop_all")}"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="__all" data-cmd="close" aria-label="${dfT("cover.close_all")}"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>` : ""}</div></div>`;
    }
    if (p.type === "net") {
      const rows = [[dfT("net.connection"), s.conns.map((cn) => CONNS[cn].label).join(" + ")], [dfT("net.role"), (ROLES[s.role] || ROLES.device).label]];
      const chain = this._chain(s);
      if (chain.length > 1) rows.push([dfT("net.path"), chain.join(" → ")]);
      if (s.z && s.z.lqi != null) rows.push(["LQI", String(s.z.lqi)]);
      if (s.z && s.z.rssi != null) rows.push(["RSSI", `${s.z.rssi} dBm`]);
      if (s.sigEid) rows.push([dfT("net.signal"), this._fmt(s.sigEid)]);
      if (s.rt) {
        const ap = this._a.aps && this._specs.get(this._a.aps[s.rt.ap]);
        if (!s.rt.home) rows.push([dfT("net.router"), dfT("net.not_connected")]);
        else {
          rows.push([dfT("net.ap"), ap ? ap.name : s.rt.ap || "—"]);
          rows.push([dfT("net.link"), s.rt.lan ? dfT("net.cable_lan") : "Wi-Fi"]);
          if (s.rt.ssid) rows.push([dfT("net.wifi_net"), s.rt.ssid]);
        }
        if (s.rt.ip) rows.push(["IP", s.rt.ip]);
      }
      if (s.role === "ap") {
        const mine = Object.entries(this._a.aps || {}).filter(([, k]) => k === s.key).map(([n]) => n);
        let w = 0, c = 0;
        for (const x of this._specs.values()) if (x.rt && x.rt.home && mine.includes(x.rt.ap)) x.rt.lan ? c++ : w++;
        if (w + c) rows.push([dfT("net.connected_here"), [w ? `${w} Wi-Fi` : "", c ? `${c} ${dfT("net.cable")}` : ""].filter(Boolean).join(", ") + ` (${dfT("net.on_floor")})`]);
      }
      if (s.item.parts && s.item.parts.length) rows.push([dfT("net.includes"), s.item.parts.join(", ")]);
      const parent = s.item.via && this._specs.get(s.item.via);
      if (parent) rows.push([dfT("net.through_k"), parent.name]);
      const none = !(s.z && (s.z.lqi != null || s.z.rssi != null)) && !s.sigEid && !s.rt;
      const hint = none ? `<div style="font-size:12px;color:var(--secondary-text-color)">${s.conns.includes("zigbee") ? dfT("net.no_lqi") : dfT("net.no_signal")}</div>` : "";
      const kids = this._children(s);
      const conn = kids.out.length || kids.extra.length
        ? `<h4>${dfT("net.connected_devices", { n: kids.out.length + kids.extra.length })}</h4><div class="conn-list">${kids.out.map((x) => `<button data-hl="${cesc(x.key)}">${cesc(x.name)}<small>${cesc(this._chain(x).join(" → "))}</small></button>`).join("")}${kids.extra.map((n) => `<button disabled>${cesc(n)}<small>${dfT("net.not_on_floor")}</small></button>`).join("")}</div>`
        : "";
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.name)}${close}</h3><div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>${hint}${conn}${s.ents[0] ? `<button class="more" data-mi="${cesc(s.ents[0])}">${dfT("details_more")}</button>` : ""}</div></div>`;
    }
    return this._rdHtml(s, p, close);
  },

  /** 0.12.10: the readings popup. Temperature and humidity share one chart; a marker of several devices (a phantom,
   *  a bond) shows its total first, then one row per device; a row opens that device's own chart. */
  _rdHtml(s, p, close) {
    const hass = this._hass;
    const groups = this._rdGroups(s, p.ents && p.ents.length ? p.ents : s.ents || []);
    const multi = groups.length > 1;
    const sub = multi && p.sub ? groups.find((g) => g.id === p.sub) : null;
    const view = multi && !sub ? null : sub || groups[0];
    this._rdCharts = [];
    const chart = (t, h, mode, small) => {
      this._rdCharts.push({ t, h, mode });
      const i = this._rdCharts.length - 1;
      return small ? `<svg class="rcs" data-rc="${i}" viewBox="0 0 100 28" preserveAspectRatio="none"></svg>` : `<div class="rc" data-rc="${i}"><svg viewBox="0 0 320 150"></svg><div class="rctip"></div><div class="rcl"></div></div>`;
    };
    const tv = (e) => (domainOf(e) === "climate" ? (hass.states[e] && hass.states[e].attributes.current_temperature != null ? `${this._num1(hass.states[e].attributes.current_temperature)} ${hass.states[e].attributes.temperature_unit || (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || "°C"}` : "—") : this._fmtNum(e));
    const now = (g, cls = "rcnow") => `<div class="${cls}">${g.t ? `<span class="t">${cesc(tv(g.t))}</span>` : ""}${g.h ? `<span class="h">${cesc(this._hv(g.h))}</span>` : ""}</div>`;
    const one = (e) => {
      const st = hass.states[e];
      const k = domainOf(e) === "climate" ? "temperature" : kindOf(e, st);
      const icon = { temperature: "mdi:thermometer", humidity: "mdi:water-percent", battery: "mdi:battery", signal: "mdi:signal" }[k] || "mdi:chart-line";
      const label = { temperature: dfT("temperature"), humidity: dfT("humidity"), battery: dfT("battery"), signal: dfT("net.signal") }[k] || this._shortName(s.item, e, s.name);
      const big = domainOf(e) === "climate" && st ? this._attrVal(st, "current_temperature") : this._fmtNum(e);
      return `<div class="rd" data-hist="${cesc(e)}"><div class="top"><ha-icon icon="${icon}"></ha-icon>${cesc(label)}<span class="big">${cesc(big)}</span></div><svg viewBox="0 0 300 56" preserveAspectRatio="none"></svg><div class="mm"><span>${dfT("time.ago", { t: dfT("unit.h", { n: 24 }) })}</span><span class="range"></span><span>${dfT("time.now")}</span></div><button class="more" data-mi="${cesc(e)}">${dfT("details_more")}</button></div>`;
    };
    // One button per charted entity; named by its device where a kind has several lines.
    const det = (g) => [...new Set([p.lead, ...g.ts, ...g.hs].filter(Boolean).map((e) => e.replace(/#h$/, "")))].map((e) => {
      const kd = domainOf(e) === "climate" ? "" : kindOf(e, hass.states[e]) === "temperature" ? "temperature" : "humidity";
      const many = kd && (kd === "temperature" ? g.ts : g.hs).length > 1;
      const lab = !kd ? dfT("details") : many ? `${this._rdName(e)} · ${dfT(kd + "_l")}` : dfT(kd + "_details");
      return `<button class="more" data-mi="${cesc(e)}">${cesc(lab)} ›</button>`;
    }).join("");
    let body;
    if (!view) {
      // The total, worked out as the marker works it out (average, lowest, highest, one sensor).
      const mode = this._dev(s.item.id).value || (s.item.phantom && s.item.value) || this._ov("comfort").combine || "average";
      const ts = groups.map((g) => g.t).filter(Boolean);
      const hs = groups.map((g) => g.h).filter(Boolean);
      // 0.13.2: the icon the user gave it, else what it measures (no ghost: the ghost only marks phantoms in the Editor).
      const phIcon = s.icon || this._dev(s.item.id).icon || (s.item.icon && s.item.icon !== "dfp:phantom" ? s.item.icon : ts.length ? "mdi:thermometer" : "mdi:water-percent");
      const sum = `<div class="phsum">${s.phantom ? `<ha-icon icon="${cesc(phIcon)}"></ha-icon>` : ""}<b>${cesc((s.lines || []).join(" · "))}</b><small>${cesc({ min: dfT("ph.lowest"), max: dfT("ph.highest"), one: dfT("ph.one") }[mode] || dfT("ph.average"))} · ${dfT("n_devices", { n: groups.length })}</small></div>`;
      const rows = groups.map((g) => `<button class="rcrow" data-rdsub="${cesc(g.id)}"><span class="nm">${cesc(g.name)}${g.t || g.h ? now(g, "rcv") : `<small>${cesc(g.ents.map((e) => this._fmt(e)).join(" · "))}</small>`}</span>${g.t || g.h ? chart(g.t ? [g.t] : [], g.h ? [g.h] : [], "one", true) : ""}<span class="go">›</span></button>`).join("");
      body = `${sum}${ts.length || hs.length ? chart(ts, hs, mode) : ""}<div class="rclist">${rows}</div>`;
    } else {
      const back = sub ? `<button class="rcback" data-rdsub="">‹ ${cesc(s.name)}</button>` : "";
      const tH = view.t || view.h ? `${now(view)}${chart(view.ts, view.hs, "each")}<div class="rcdet">${det(view)}</div>` : "";
      body = `${back}${tH}${view.other.map(one).join("")}`;
    }
    const title = sub ? sub.name : s.name;
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(title)}"><h3>${cesc(title)}${close}</h3>${body}</div></div>`;
  },

  /** The devices behind a readings marker: a phantom's members, otherwise HA's devices of its entities. Each with its
   *  temperature (t), humidity (h) and other readings. */
  _rdGroups(s, ents) {
    const hass = this._hass;
    const item = s.item;
    const by = new Map();
    for (const e of ents) {
      let g = item.byMember ? (item.members || []).find((m) => (item.byMember[m] || []).includes(e)) : null;
      if (!g) {
        const r = (hass.entities || {})[e];
        g = (r && r.device_id) || e;
      }
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(e);
    }
    if (!item.byMember && by.size > 1 && !item.bond) return [{ id: item.id, name: s.name, ...this._rdSplit([...ents]) }];
    const devs = (this._a && this._a.devices) || {};
    return [...by].map(([g, es]) => {
      const dv = (hass.devices || {})[g];
      const name = (devs[g] && devs[g].name) || (dv && (dv.name_by_user || dv.name)) || entName(hass, es[0]);
      return { id: g, name, ...this._rdSplit(es) };
    });
  },

  /** A chart line's name: its device (an AC, a room thermometer), else the entity's name. */
  _rdName(e) {
    const hass = this._hass;
    const id = e.replace(/#h$/, "");
    const reg = (hass.entities || {})[id];
    const dv = reg && reg.device_id && (hass.devices || {})[reg.device_id];
    return (dv && (dv.name_by_user || dv.name)) || entName(hass, id);
  },

  /** A humidity value; "climate.x#h" = the thermostat's own humidity. */
  _hv(e) {
    if (!e.endsWith("#h")) return this._fmtNum(e);
    const st = this._hass.states[e.slice(0, -2)];
    return st && Number(st.attributes.current_humidity) > 0 ? `${Math.round(Number(st.attributes.current_humidity))}%` : "—";
  },

  _rdSplit(es) {
    const hass = this._hass;
    const k = (e) => (e.endsWith("#h") ? "humidity" : domainOf(e) === "climate" ? "temperature" : kindOf(e, hass.states[e]));
    const ts = es.filter((e) => k(e) === "temperature");
    const hs = es.filter((e) => k(e) === "humidity");
    // t / h: the first of each (the marker's own value comes first); ts / hs: all of them, all charted.
    return { t: ts[0] || null, h: hs[0] || null, ts, hs, ents: es, other: es.filter((e) => !ts.includes(e) && !hs.includes(e)) };
  },

  /** 24 h history sparklines for the readings popup. */
  async _fillHistory() {
    const p = this._popup;
    if (!p || p.type !== "readings") return;
    if (!this._hist || this._hist.key !== p.key) {
      const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const data = {};
      const plain = p.ents.filter((e) => domainOf(e) !== "climate");
      const clim = p.ents.filter((e) => domainOf(e) === "climate");
      try {
        if (plain.length) Object.assign(data, await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: plain, minimal_response: true, no_attributes: true, significant_changes_only: false }));
        // Thermostats keep their room temperature in an attribute.
        if (clim.length) {
          const base = [...new Set(clim.map((e) => e.replace(/#h$/, "")))];
          const res = await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: base, minimal_response: false, no_attributes: false, significant_changes_only: false });
          for (const e of clim) {
            const at = e.endsWith("#h") ? "current_humidity" : "current_temperature"; // 0.12.10: its humidity too
            data[e] = ((res || {})[e.replace(/#h$/, "")] || []).map((r) => ({ s: r.a ? r.a[at] : null, lu: r.lu || r.lc }));
          }
        }
      } catch (_e) {
        /* no history: the popup still shows the current values */
      }
      this._hist = { key: p.key, data };
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-hist]")) {
      const eid = el.dataset.hist;
      const rows = (this._hist.data[eid] || []).map((r) => ({ t: (r.lu || r.lc || 0) * 1000, v: Number(r.s) })).filter((r) => Number.isFinite(r.v) && r.t);
      const svg = el.querySelector("svg");
      if (rows.length < 2) {
        svg.innerHTML = domainOf(eid) === "climate" ? "" : `<text x="150" y="32" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${dfT("hist.not_enough")}</text>`;
        continue;
      }
      const t0 = Date.now() - 24 * 3600 * 1000;
      const min = Math.min(...rows.map((r) => r.v));
      const max = Math.max(...rows.map((r) => r.v));
      const span = max - min || 1;
      const pts = rows.map((r) => `${(((Math.max(r.t, t0) - t0) / (24 * 3600 * 1000)) * 300).toFixed(1)},${(52 - ((r.v - min) / span) * 46).toFixed(1)}`);
      pts.push(`300,${pts[pts.length - 1].split(",")[1]}`);
      svg.innerHTML = `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--dfc-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      const unit = (this._hass.states[eid] && this._hass.states[eid].attributes.unit_of_measurement) || "";
      el.querySelector(".range").textContent = `${Math.round(min * 10) / 10}–${Math.round(max * 10) / 10} ${unit}`;
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-rc]")) this._drawRc(el, (this._rdCharts || [])[Number(el.dataset.rc)]);
  },

  /** 0.12.10: one 24 h series on a 10-minute grid (the value then), or several combined as the marker combines them. */
  _rdSeries(eids, mode) {
    const N = 145;
    const t0 = Date.now() - 24 * 3600 * 1000;
    const step = (24 * 3600 * 1000) / (N - 1);
    const one = (eid) => {
      const rows = ((this._hist && this._hist.data[eid]) || []).map((r) => ({ t: (r.lu || r.lc || 0) * 1000, v: Number(r.s) })).filter((r) => r.t && Number.isFinite(r.v)).sort((a, b) => a.t - b.t);
      const out = [];
      let j = -1;
      for (let i = 0; i < N; i++) {
        const t = t0 + i * step;
        while (j + 1 < rows.length && rows[j + 1].t <= t) j++;
        out.push(j >= 0 ? rows[j].v : null);
      }
      return out;
    };
    const all = eids.map(one);
    if (!all.length) return null;
    const res = all[0].map((_v, i) => {
      const vs = all.map((a) => a[i]).filter((v) => v != null);
      if (!vs.length) return null;
      if (mode === "min") return Math.min(...vs);
      if (mode === "max") return Math.max(...vs);
      if (mode === "one") return all[0][i];
      return vs.reduce((a, b) => a + b, 0) / vs.length;
    });
    return res.filter((v) => v != null).length >= 2 ? res : null;
  },

  /** 0.12.10: temperature (left axis) and humidity (right axis) in one chart; touch it for the values at a time.
   *  Colours and text follow the theme (--dfc-rt / --dfc-rh can be set, e.g. with card-mod). */
  _drawRc(el, def) {
    if (!def) return;
    const hass = this._hass;
    const unitOf = (eids, dflt) => {
      const st = eids[0] && hass.states[eids[0]];
      if (eids[0] && eids[0].endsWith("#h")) return "%";
      if (st && domainOf(eids[0]) === "climate") return (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || "°C";
      return (st && st.attributes.unit_of_measurement) || dflt;
    };
    const ser = [];
    const add = (eids, c, dflt, d) => {
      const each = def.mode === "each" ? eids.map((e) => [e]) : [eids];
      each.forEach((es, n) => {
        const v = this._rdSeries(es, def.mode === "each" ? "one" : def.mode);
        if (v) ser.push({ v, c, u: unitOf(es, dflt), d, dash: n > 0, nm: each.length > 1 ? this._rdName(es[0]) : "" });
      });
    };
    add(def.t, "var(--dfc-rt)", "°C", 1);
    add(def.h, "var(--dfc-rh)", "%", 0);
    const small = el.tagName.toLowerCase() === "svg";
    const svg = small ? el : el.querySelector("svg");
    if (!ser.length) {
      svg.innerHTML = small ? "" : `<text x="160" y="80" text-anchor="middle" font-size="12" fill="currentColor" opacity=".6">${dfT("hist.not_enough")}</text>`;
      return;
    }
    const W = small ? 100 : 320;
    const x0 = small ? 0 : 34;
    const axes = [...new Set(ser.map((x) => x.c))].map((c) => ser.find((x) => x.c === c));
    const x1 = small ? 100 : axes.length > 1 ? 286 : 312;
    const y0 = small ? 3 : 12;
    const y1 = small ? 25 : 120;
    const N = ser[0].v.length;
    const X = (i) => x0 + (i / (N - 1)) * (x1 - x0);
    const kinds = [...new Set(ser.map((x) => x.c))];
    for (const c of kinds) {
      const same = ser.filter((x) => x.c === c);
      const vs = same.flatMap((x) => x.v).filter((v) => v != null);
      const min = Math.min(...vs);
      const max = Math.max(...vs);
      const pad = (max - min) * 0.12 || 0.5;
      for (const s0 of same) {
        s0.lo = min - pad;
        s0.hi = max + pad;
        s0.Y = (v) => y1 - ((v - s0.lo) / (s0.hi - s0.lo)) * (y1 - y0);
      }
    }
    for (const s0 of ser) {
      const vs = s0.v.filter((v) => v != null);
      s0.min = Math.min(...vs);
      s0.max = Math.max(...vs);
    }
    // Smooth lines (Catmull-Rom as curves), broken where there is no value.
    const path = (s0) => {
      const P = s0.v.map((v, i) => (v == null ? null : [X(i), s0.Y(v)]));
      let d = "";
      for (let i = 0; i < N; i++) {
        if (!P[i]) continue;
        if (!P[i - 1]) {
          d += `M${P[i][0].toFixed(1)},${P[i][1].toFixed(1)}`;
          continue;
        }
        const a = P[i - 2] || P[i - 1];
        const b = P[i - 1];
        const c = P[i];
        const e = P[i + 1] || c;
        d += `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
      }
      return d;
    };
    const fmt = (s0, v) => `${(Math.round(v * (s0.d ? 10 : 1)) / (s0.d ? 10 : 1)).toLocaleString(hass.locale && hass.locale.language)}${s0.u === "%" ? "%" : "°"}`;
    if (small) {
      svg.innerHTML = ser.map((s0) => `<path d="${path(s0)}" fill="none" stroke="${s0.c}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`).join("");
      return;
    }
    const gid = `rcg${Math.random().toString(36).slice(2, 8)}`;
    const first = ser[0];
    const fi = first.v.findIndex((v) => v != null);
    const li = N - 1 - [...first.v].reverse().findIndex((v) => v != null);
    const area = `${path(first)}L${X(li).toFixed(1)},${y1}L${X(fi).toFixed(1)},${y1}Z`;
    const grid = [0, 0.5, 1].map((f) => {
      const y = y1 - f * (y1 - y0);
      const lab = (s0, x, anchor) => `<text x="${x}" y="${(y + 3.5).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="${s0.c}">${cesc(fmt(s0, s0.lo + f * (s0.hi - s0.lo)))}</text>`;
      return `<line x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/>${lab(axes[0], x0 - 4, "end")}${axes[1] ? lab(axes[1], x1 + 4, "start") : ""}`;
    }).join("");
    const t0 = Date.now() - 24 * 3600 * 1000;
    const hm = (ms) => new Date(ms).toLocaleTimeString(hass.locale && hass.locale.language, { hour: "2-digit", minute: "2-digit" });
    const times = [0, 0.5, 1].map((f) => `<text x="${(x0 + f * (x1 - x0)).toFixed(1)}" y="140" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}" font-size="10" fill="currentColor" opacity=".6">${f === 1 ? dfT("time.now") : dfT("time.ago", { t: dfT("unit.h", { n: f ? 12 : 24 }) })}</text>`).join("");
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${first.c};stop-opacity:.28"/><stop offset="1" style="stop-color:${first.c};stop-opacity:0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#${gid})"/>${ser.map((s0) => `<path d="${path(s0)}" fill="none" stroke="${s0.c}" stroke-width="2.2" stroke-linecap="round"${s0.dash ? ' stroke-dasharray="5 4"' : ""}/>`).join("")}${times}<line class="cx" y1="${y0}" y2="${y1}" stroke="currentColor" stroke-opacity=".35" visibility="hidden"/>${ser.map((s0, k) => `<circle class="cd${k}" r="3.5" fill="${s0.c}" stroke="var(--card-background-color, #fff)" stroke-width="1.5" visibility="hidden"/>`).join("")}`;
    el.querySelector(".rcl").innerHTML = ser.map((s0) => `<span class="${s0.dash ? "dash" : ""}" style="--c:${s0.c}">${s0.nm ? `${cesc(s0.nm)} ` : ""}${cesc(fmt(s0, s0.min))}–${cesc(fmt(s0, s0.max))}</span>`).join("");
    // Touch / hover: the values at that time.
    const tip = el.querySelector(".rctip");
    const cx = svg.querySelector(".cx");
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const fx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(N - 1, Math.round(((fx - x0) / (x1 - x0)) * (N - 1))));
      const x = X(i);
      cx.setAttribute("x1", x);
      cx.setAttribute("x2", x);
      cx.setAttribute("visibility", "visible");
      const parts = [];
      ser.forEach((s0, k) => {
        const dot = svg.querySelector(`.cd${k}`);
        const v = s0.v[i];
        if (v == null) return dot.setAttribute("visibility", "hidden");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", s0.Y(v));
        dot.setAttribute("visibility", "visible");
        parts.push(`<b style="color:${s0.c}">${cesc(fmt(s0, v))}</b>`);
      });
      tip.innerHTML = `${cesc(hm(t0 + (i / (N - 1)) * 24 * 3600 * 1000))} · ${parts.join(" · ")}`;
      tip.style.left = `${Math.max(12, Math.min(88, (x / W) * 100))}%`;
      tip.style.visibility = "visible";
    };
    const hide = () => {
      cx.setAttribute("visibility", "hidden");
      for (const d of svg.querySelectorAll("circle")) d.setAttribute("visibility", "hidden");
      tip.style.visibility = "hidden";
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", hide);
  },

  _setOverlay(o) {
    if (o === "plan" || o === "people") o = "live"; // 0.7.4: Plan is gone, 0.8.2: People too (people are in Live)
    if (!this._ovDef(o)) return;
    // 0.11.1: in Replay another overlay keeps the replay time (its history is loaded); Energy / Network end Replay.
    const rpKeep = this._rp && this._rp.mode && this._dockShown && !RP_SKIP.has(o);
    if (this._rp && !rpKeep) {
      if (this._rp.mode) this._rp.mode = false;
      this._rpLive(false);
    }
    if (rpKeep) setTimeout(() => this._rpLoad(), 0); // after the render: the new overlay's entities
    this._overlay = o;
    if (this.preview || this._fitHost) EDIT_OV = o;
    this._popup = null;
    this._menu = false;
    this._update(true);
    if (this._onOv) this._onOv(o);
  },
});
Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.13.9.4 People distance (test; Network with Bluetooth shown). A person with a distance sensor (Bermuda:
   *  metres to the nearest Bluetooth proxy) gets a ring around that proxy and stands on it, inside the room
   *  that room sensor 1 / 2 says. With Bermuda's "Distance to <proxy>" sensors on, every proxy that hears the
   *  person adds a ring and the spot is the room's point that fits all of them best. Needs a measured floor. */
  _pdOn() {
    return this._overlay === "network" && !this._rpIn() && this._netShow().includes("bluetooth")
      && this._people().some((p) => p.distance) && this._layerOn("network", "pdist", true);
  },

  /** The Bluetooth proxies on this floor: where they stand (%), their HA area and device name. */
  _pdProxies(a) {
    const h = this._hass;
    const reg = h.entities || {};
    const devs = h.devices || {};
    const out = [];
    for (const it of this._items(a)) {
      if (!it.bt_proxy || !Number.isFinite(it.x)) continue;
      const er = reg[it.main_entity || (it.entities || [])[0]] || {};
      const dv = devs[er.device_id] || {};
      out.push({ x: it.x, y: it.y, area: er.area_id || dv.area_id || null, name: String(dv.name_by_user || dv.name || this._dev(it.id).name || it.name || "").toLowerCase() });
    }
    return out;
  },

  /** The rings of one person: [{x, y (%), d (m), near}]. The nearest proxy comes from the device's area
   *  sensor (Bermuda: the area of the nearest proxy); the others from its "Distance to <proxy>" sensors. */
  _pdRings(p, proxies) {
    const h = this._hass;
    const reg = h.entities || {};
    const num = (e) => {
      const s = h.states[e];
      const v = s && live(s) ? Number(s.state) : NaN;
      return Number.isFinite(v) && v >= 0 ? v : null;
    };
    const d0 = num(p.distance);
    const dev = (reg[p.distance] || {}).device_id;
    const mine = dev ? Object.keys(reg).filter((e) => e !== p.distance && e.startsWith("sensor.") && reg[e].device_id === dev && h.states[e]) : [];
    // A proxy by its name ("Distance to <name>"), else the only proxy in that area.
    const find = (area, label) => {
      const n = String(label || "").toLowerCase();
      return proxies.find((x) => x.name && n.endsWith(`to ${x.name}`)) || (area && proxies.filter((x) => x.area === area).length === 1 ? proxies.find((x) => x.area === area) : null);
    };
    const rings = [];
    for (const e of mine) {
      const at = h.states[e].attributes || {};
      if (at.unit_of_measurement !== "m" || !/distance to /i.test(at.friendly_name || "")) continue;
      const d = num(e);
      const px = d == null ? null : find(at.area_id, at.friendly_name);
      if (px && !rings.some((r) => r.px === px)) rings.push({ px, d });
    }
    const areaS = mine.map((e) => h.states[e]).find((s) => s.attributes && "area_id" in s.attributes && "current_mac" in s.attributes);
    const near = areaS && live(areaS) ? find(areaS.attributes.area_id, null) : null;
    if (near && d0 != null) {
      const r = rings.find((x) => x.px === near);
      if (r) r.d = d0;
      else rings.push({ px: near, d: d0 });
    }
    rings.sort((x, y) => x.d - y.d);
    return rings.map((r, i) => ({ x: r.px.x, y: r.px.y, d: r.d, near: r.px === near || (!near && i === 0) }));
  },

  /** Where the person stands (%): the point of the room that fits the rings best (one ring: of those on it,
   *  the one nearest the room's pin). Moves only when the new spot is 0.5 m or more away. */
  _pdSpot(eid, room, rings, a) {
    const W = Number(a.real_width_m);
    const shape = room.ar && room.ar.shape;
    if (!(W > 0) || !rings.length || !Array.isArray(shape) || shape.length < 3) return null;
    const H = W / (a.image_width && a.image_height ? a.image_width / a.image_height : 1.6);
    const m = (x, y) => [(x / 100) * W, (y / 100) * H];
    const poly = shape.map(([x, y]) => m(x, y));
    const cs = rings.map((r) => [...m(r.x, r.y), r.d, 1 / Math.max(r.d, 0.5)]);
    const pin = m(room.ar.x, room.ar.y);
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const step = Math.max(0.05, Math.max(x1 - x0, y1 - y0) / 80);
    let best = null;
    for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
      if (!inPoly(x, y, poly)) continue;
      let c = 0.01 * ((x - pin[0]) ** 2 + (y - pin[1]) ** 2);
      for (const [cx, cy, d, w] of cs) c += w * (Math.hypot(x - cx, y - cy) - d) ** 2;
      if (!best || c < best[2]) best = [x, y, c];
    }
    if (!best) return null;
    this._pdLast = this._pdLast || {};
    const last = this._pdLast[eid];
    if (last && last.room === room.id && Math.hypot(last.mx - best[0], last.my - best[1]) < 0.5) return last;
    return (this._pdLast[eid] = { room: room.id, mx: best[0], my: best[1], x: (best[0] / W) * 100, y: (best[1] / H) * 100 });
  },

  /** The rings as SVG in plan %: the nearest proxy's ring stronger; others only with "Rings around all proxies". */
  _pdRingsSvg(list, a) {
    const W = Number(a.real_width_m);
    if (!(W > 0) || !list.length) return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const all = this._layerOn("network", "pall", false);
    const out = [];
    for (const r of list) {
      if (!r.near && !all) continue;
      const rx = (r.d / W) * 100;
      out.push(`<ellipse class="${r.near ? "near" : ""}" cx="${r.x}" cy="${r.y}" rx="${rx}" ry="${rx * ratio}"/>`);
    }
    return out.length ? `<svg class="pdr" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${out.join("")}</svg>` : "";
  },
});

// =================================================================== editor
/** JSON with sorted keys, to compare configs regardless of key order. */
/** Near the card's edges, a marker's labels open towards the inside so they aren't cut off.
 *  0.10.2: measured in the card's frame (the plan plus the space around it), not the plan image. */
function edgeCls(x, y, m) {
  const e = m || { t: 0, r: 0, b: 0, l: 0 };
  const fx = ((x + e.l) * 100) / (100 + e.l + e.r);
  const fy = ((y + e.t) * 100) / (100 + e.t + e.b);
  return [fy > 78 ? "eb" : "", fy < 12 ? "et" : "", fx > 84 ? "er" : "", fx < 12 ? "el" : ""].filter(Boolean).join(" ");
}

function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const ED_CSS = `
.dfe .dhome { display:flex; flex-direction:column; gap:10px; margin: 4px 0 14px; }
.dfe .dh { display:flex; align-items:center; gap:8px; font-size:15px; }
.dfe .dh ha-icon { color: var(--primary-color); }
.dfe .dh .dv { font-size:12px; color: var(--secondary-text-color); padding:1px 7px; border-radius:10px; background: var(--secondary-background-color, #eee); }
.dfe .dh a { margin-left:auto; font-size:13px; color: var(--primary-color); text-decoration:none; }
.dfe .dsum { margin:0; display:flex; gap:8px; align-items:flex-start; font-size:13px; color: var(--secondary-text-color); --mdc-icon-size:18px; }
.dfe .dsum ha-icon, .dfe .dtip ha-icon { flex:none; width:24px; display:inline-flex; justify-content:center; }
/* 0.11.1 test8: one way in. Home Assistant's editor shows only the home; the settings live in the Card Editor. */
.dfe details.dall { display:none; }
.dfe-big .bg-set details.dall { display:block; }
.dfe .dcol h3 { margin: 6px 0 2px; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:600; --mdc-icon-size:20px; }
.dfe .dcol h3 ha-icon { color: var(--primary-color); }
.dfe .dcol p { margin: 0 0 6px; font-size:12px; line-height:1.4; color: var(--secondary-text-color); }
.dfe .dtip { margin:0; display:flex; gap:8px; align-items:flex-start; font-size:13px; color: var(--secondary-text-color); --mdc-icon-size:18px; }
.dfe details.dall > summary { cursor:pointer; font-weight:500; padding:10px 0; border-top:1px solid var(--divider-color, #ddd); list-style:none; display:flex; align-items:center; gap:6px; }
.dfe details.dall > summary::before { content:"▸"; transition: transform .15s; }
.dfe details.dall[open] > summary::before { transform: rotate(90deg); }
.dfe .dtabs { display:flex; gap:4px; margin: 4px 0 12px; border-bottom:1px solid var(--divider-color, #ddd); }
.dfe .dtabs button { border:0; background:transparent; font: inherit; font-size:14px; padding:8px 14px; cursor:pointer; color: var(--secondary-text-color); border-bottom:2px solid transparent; margin-bottom:-1px; }
.dfe .dtabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight:500; }
.dfe-big .bg-set .dhome, .dfe-big .bg-set details.dall > summary { display:none; }
.dfe .kord { margin: 8px 0; font-size:13px; }
.dfe .kord h5 { margin: 4px 0 6px; font-size:13px; font-weight:500; }
.dfe .kord .kr { display:flex; align-items:center; justify-content:space-between; padding:3px 6px; border-radius:6px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 6%, transparent); margin-bottom:3px; }
.dfe .kord button { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font-size:12px; }
.dfe .bigbtn { display:flex; align-items:center; gap:8px; width:100%; justify-content:center; border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); border-radius:10px; padding:10px; font: inherit; font-weight:500; cursor:pointer; margin: 4px 0 10px; }
.dfe h4 { margin: 22px 0 4px; font-size: 15px; font-weight: 500; display:flex; align-items:center; gap:8px; }
.dfe details.csec { margin: 10px 0; border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; background: var(--card-background-color, transparent); }
/* 0.11: anything that opens or closes shows the hand pointer, on the whole line. */
.dfe summary, .dfe-big summary { cursor:pointer; user-select:none; }
.dfe details.csec > summary { list-style:none; cursor:pointer; padding: 12px 14px; }
.dfe details.csec > summary::-webkit-details-marker { display:none; }
.dfe details.csec > summary h4 { margin:0; font-size:16px; }
.dfe details.csec > summary h4 .cv { margin-left:auto; transition: transform .15s; }
.dfe details.csec[open] > summary h4 .cv { transform: rotate(180deg); }
.dfe details.csec > summary p { margin: 4px 0 0 32px; font-size: 13px; color: var(--secondary-text-color); }
.dfe details.csec > .csb { padding: 12px 14px 14px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.08)); }
.dfe details.csec[open] { border-color: var(--primary-color, #03a9f4); }
.dfe p { margin: 0 0 8px; font-size: 12px; color: var(--secondary-text-color); }
.dfe input.flt, .dfe select.flt { box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
.dfe .flts { display:flex; gap:8px; margin-bottom: 6px; }
.dfe .flts input { flex:1; min-width:0; }
.dfe .dev { border-bottom: 1px solid var(--divider-color); }
/* 0.11: the line under a list row starts where its fields start. */
.dfe .row { border-bottom: 0; }
.dfe .row::after { content:""; display:block; border-bottom: 1px solid var(--divider-color); margin: 8px 8px 0; }
.dfe #chipreset { display:inline-flex; align-items:center; gap:6px; margin: 4px 0 8px; border:0; background:transparent; color: var(--primary-color, #03a9f4); font: inherit; font-size:13px; cursor:pointer; }
.dfe #chipreset ha-icon { --mdc-icon-size:16px; }
.dfe .dev > button, .dfe .row > button.hd { width: 100%; display:flex; align-items:center; gap:10px; border:0; background:transparent; color: var(--primary-text-color); font: inherit; font-size: 14px; padding: 9px 4px; cursor:pointer; text-align:left; }
.dfe .dev > button .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dfe .dev > button .ovs { display:flex; gap:3px; --mdc-icon-size: 16px; color: var(--primary-color); }
.dfe .dev > button .ovs ha-icon.off { color: var(--disabled-text-color, #999); opacity:.55; }
.dfe .dev > button small, .dfe .row > button small { color: var(--secondary-text-color); font-size: 12px; }
.dfe .dev .body, .dfe .row .body { padding: 4px 4px 14px; }
.dfe .dev.custom > button .nm { font-weight: 500; }
.dfe .shows { margin-top: 10px; }
.dfe .shows h5 { margin: 6px 0; font-size: 13px; font-weight: 500; }
.dfe .sw { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 6px 2px; font-size: 14px; --mdc-icon-size: 18px; }
.dfe .sw span { display:flex; align-items:center; gap:8px; }
.dfe .sw small { color: var(--secondary-text-color); font-size: 12px; }
.dfe .btns { display:flex; flex-wrap:wrap; gap:8px; margin-top: 8px; }
.dfe .btns button, .dfe button.add { border: 1px solid var(--divider-color); background: transparent; color: var(--primary-color); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 16px; cursor:pointer; display:flex; align-items:center; gap:6px; --mdc-icon-size: 18px; }
.dfe .btns button.del { color: var(--error-color, #db4437); }
.dfe .prow-ed { border:1px solid var(--divider-color); border-radius:10px; padding:8px; margin-bottom:8px; }
.dfe .prow-ed button.del { border:0; background:transparent; color: var(--error-color, #db4437); font: inherit; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px; margin-top:4px; --mdc-icon-size:18px; }
.dfe #people > button.add { margin-bottom: 10px; }
/* 0.11: your own overlays look like the built-in ones: a framed row with a chevron (content below). */
.dfe #custom > .row { border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; margin: 8px 0; overflow:hidden; }
.dfe #custom > .row > .hd { width:100%; padding: 12px 14px; }
.dfe #custom > .row .cv { margin-left:8px; transition: transform .15s; }
.dfe #custom > .row .cv.up { transform: rotate(180deg); }
.dfe #custom > .row > .body { padding: 0 14px 12px; }
/* 0.11: every + Add button keeps clear of the row or line above it (generic). */
.dfe button.add { margin-top: 12px; }
.dfe .ftabs button.add { margin-top: 0; }
.dfe .note { font-size: 12px; color: var(--secondary-text-color); }
.dfe .sub { margin: 14px 0 10px; padding-left: 4px; }
.dfe .sub h5 { margin: 0 0 2px; font-size: 14px; font-weight: 500; display:flex; align-items:center; gap:8px; --mdc-icon-size: 18px; }
.dfe [data-form="general"] { margin-bottom: 4px; }
.dfe .floors { margin: 0 0 6px; }
.dfe .fpanel { border: 1px solid var(--divider-color); border-radius: 12px; padding: 4px 12px 6px; margin: 8px 0 6px; background: color-mix(in srgb, var(--secondary-background-color, #f5f5f5) 45%, transparent); }
.dfe .fpanel h4 { margin-top: 14px; }
.dfe h3.grp { margin: 18px 0 2px; padding-bottom: 6px; font-size: 17px; font-weight: 500; display:flex; align-items:center; gap:8px; border-bottom: 2px solid var(--primary-color, #03a9f4); }
.dfe h3.grp small { font-size: 13px; font-weight: 400; color: var(--secondary-text-color); }
.dfe h3.grp:first-child { margin-top: 0; }
.dfe .ftabs { display:flex; align-items:center; gap:2px; border-bottom: 1px solid var(--divider-color); }
.dfe .ftabs button { border:0; background:transparent; color: var(--secondary-text-color); font: inherit; font-size:14px; padding: 10px 16px; cursor:pointer; border-bottom: 2px solid transparent; }
.dfe .ftabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); }
.dfe .ftabs button.add { margin-left:auto; font-size:20px; padding: 4px 12px; border:0; color: var(--primary-text-color); }
.dfe .fbody { display:flex; align-items:center; gap:8px; padding: 10px 0 4px; }
.dfe .fbody select { flex:1; min-width:0; }
.dfe .fbody button { border:0; background:transparent; color: var(--primary-text-color); cursor:pointer; width:34px; height:34px; border-radius:50%; --mdc-icon-size: 20px; display:flex; align-items:center; justify-content:center; }
.dfe .fbody button:disabled { opacity:.3; cursor:default; }
.dfe .fhint { font-size:12px; color: var(--secondary-text-color); margin: 4px 0 0; }
`;

/* 0.12.6: the marker settings, the same in the card editor and the big editor (styles travel with the panel). */
const MP_CSS = `
.mp { font-size:14px; color: var(--primary-text-color); }
.mp .mpchips { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 10px; }
.mp .mpc { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--divider-color, rgba(0,0,0,.2)); background:transparent; color: inherit; border-radius:14px; padding:3px 10px 3px 7px; font: inherit; font-size:12px; cursor:pointer; --mdc-icon-size:16px; }
.mp .mpc.shown, .mp .mpc.added { border-color: var(--primary-color, #03a9f4); }
.mp .mpc.added::after { content:"+"; font-weight:700; margin-left:2px; color: var(--primary-color, #03a9f4); }
.mp .mpc.hidden, .mp .mpc.off { opacity:.55; text-decoration: line-through; }
.mp .mpc.cur { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: var(--primary-color, #03a9f4); opacity:1; text-decoration:none; }
.mp h5 { margin:10px 0 4px; font-size:15px; font-weight:600; }
.mp .mpfor { margin:6px 0 2px; font-size:13px; color: var(--secondary-text-color); }
.mp .mpr { display:block; padding:7px 0; border-bottom:1px solid var(--divider-color, rgba(0,0,0,.08)); }
.mp .mpr.mpsw { display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; }
.mp .mpl { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
.mp .mpk { font-weight:500; }
.mp .mpk small, .mp .mpv small, .mp .mpn, .mp .mpxn small { color: var(--secondary-text-color); font-weight:400; font-size:12px; }
.mp .mpv { text-align:right; flex:1; min-width:40%; }
.mp .mpv small { margin-left:4px; padding:0 6px; border-radius:8px; background: var(--secondary-background-color, rgba(0,0,0,.06)); }
.mp select, .mp .pics select, .mp .pics input[type=number] { display:block; width:100%; box-sizing:border-box; font: inherit; font-size:14px; padding:8px 10px; border-radius:8px; border:1px solid var(--divider-color, rgba(0,0,0,.25)); background: var(--card-background-color, #fff); color: inherit; text-align:left; margin:4px 0; }
.mp .pics { display:flex; flex-direction:column; align-items:stretch; gap:2px; }
.mp .pics .pis, .mp .pics .pv { font-size:12px; color: var(--secondary-text-color); }
.mp .pics .pv input { display:inline-block; width:8em; }
.mp .mpx { display:flex; flex-direction:column; gap:6px; }
.mp .mpxr { padding:6px 8px; border-radius:8px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); }
.mp .mpxr.no { background: var(--secondary-background-color, rgba(0,0,0,.05)); opacity:.8; }
.mp .mpxl { display:flex; align-items:center; gap:6px; }
.mp .mpxn { flex:1; min-width:0; overflow-wrap:anywhere; }
.mp .mpxn small { display:block; }
.mp .mpxi, .mp .mpxd { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; padding:2px; font: inherit; --mdc-icon-size:18px; }
.mp .lbsw { display:flex; margin-top:6px; border:1px solid var(--primary-color, #03a9f4); border-radius:8px; overflow:hidden; }
.mp .lbsw button { flex:1; border:0; background:transparent; color: var(--primary-color, #03a9f4); padding:5px 6px; font: inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.mp .lbsw button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.mp .mpa { display:flex; gap:12px; flex-wrap:wrap; }
.mp .lnk { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font: inherit; font-size:12px; padding:2px 0; }
.mp .mpall { margin-top:12px; }
.mp .mpall > summary { cursor:pointer; font-weight:600; padding:6px 0; }
.mp ha-form { display:block; margin:4px 0; }
`;

const BIG_CSS = `
dialog.dfe-big { width:100vw; height:100vh; max-width:none; max-height:none; margin:0; padding:0; border:0; box-sizing:border-box; }
dialog.dfe-big:not([open]) { display:none; }
dialog.dfe-big::backdrop { background: rgba(0,0,0,.4); }
.dfe-big { position:fixed; inset:0; z-index:10000; background: var(--primary-background-color, #fafafa); color: var(--primary-text-color); display:flex; flex-direction:column; font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
.dfe-big .bg-h { display:flex; align-items:center; gap:12px; min-height:48px; box-sizing:border-box; padding:6px 12px 6px 16px; font-size:16px; background: var(--card-background-color, #fff); border-bottom:1px solid var(--divider-color, #ddd); }
.dfe-big .bg-h span { flex:1; font-size:13px; color: var(--secondary-text-color); }
.dfe-big .bg-x { border:0; border-radius:18px; padding:8px 18px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-weight:500; cursor:pointer; }
.dfe-big .bg-b { flex:1; min-height:0; display:flex; gap:12px; padding:12px; }
.dfe-big .bg-mid { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; order:1; }
.dfe-big .bg-pan { display:contents; }
.dfe-big .bg-pan .bg-set { order:0; }
.dfe-big .bg-pan .bg-side { order:2; }
.dfe-big .bg-tabs { display:none; }
.dfe-big .bg-tabs button { flex:1; border:0; background:transparent; font: inherit; font-size:14px; padding:8px; cursor:pointer; color: var(--secondary-text-color); border-bottom:2px solid transparent; }
.dfe-big .bg-tabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight:500; }
.dfe-big .lic { --mdc-icon-size:18px; color: var(--secondary-text-color); margin-right:8px; flex:none; }
.dfe-big .lroom { font-size:11px; letter-spacing:.6px; text-transform:uppercase; color: var(--secondary-text-color); margin: 10px 0 2px; }
.dfe-big .bg-fit[hidden] { display:none; }
.dfe-big .bg-plan { flex:1; min-height:0; overflow:auto; }
.dfe-big .bg-plan > device-floorplan-card { display:block; }
.dfe-big .bg-zoom { display:flex; align-items:center; justify-content:flex-end; gap:4px; font-size:12px; color: var(--secondary-text-color); }
.dfe-big .bg-zoom button { border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; border-radius:14px; padding:2px 8px; font: inherit; cursor:pointer; --mdc-icon-size:18px; display:inline-flex; align-items:center; }
.dfe-big .bg-zv { min-width:44px; text-align:center; }
.dfe-big .bg-set { flex:0 0 360px; overflow:auto; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); padding:4px 12px 12px; }
.dfe-big .bg-set .mksec { display:none; }
.dfe-big .bg-side { flex:0 0 280px; overflow:auto; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); padding:12px 14px; }
.dfe-big .bg-t { margin:0 0 8px; font-size:16px; font-weight:500; }
.dfe-big .bg-hint { color: var(--secondary-text-color); font-size:13px; }
.dfe-big .bg-err { color: var(--error-color, #b3261e); font-size:13px; margin:0 0 8px; }
.dfe-big .qbtn, .dfe .qbtn { border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background:transparent; border-radius:16px; padding:6px 14px; font: inherit; font-weight:500; cursor:pointer; margin-bottom:8px; }
.dfe-big .shows h5 { margin:12px 0 6px; font-size:14px; font-weight:500; }
.dfe-big .shows .sw { display:flex; align-items:center; justify-content:space-between; padding:4px 0; }
.dfe-big .shows .sw span, .dfe-big .per .pr span { display:flex; align-items:center; gap:6px; --mdc-icon-size:18px; }
.dfe-big .per, .dfe .per { margin-top:8px; font-size:13px; }
.dfe-big .per summary, .dfe .per summary { cursor:pointer; color: var(--primary-color, #03a9f4); }
.dfe-big .per .pr, .dfe .per .pr { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; }
.dfe-big .per select, .dfe .per select { max-width:58%; font: inherit; padding:4px; border-radius:6px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big .bg-t { display:flex; align-items:center; justify-content:space-between; }
.dfe-big .bg-c { border:0; background:transparent; color: var(--secondary-text-color); font-size:16px; cursor:pointer; }
.dfe-big .bg-sel { border-bottom:1px solid var(--divider-color, #ddd); padding-bottom:10px; margin-bottom:10px; }
.dfe-big .bg-sel.inl { margin:2px 0 10px 8px; padding:8px 10px 10px; border:1px solid color-mix(in srgb, var(--primary-color, #03a9f4) 40%, transparent); border-left:3px solid var(--primary-color, #03a9f4); border-radius:8px; }
.dfe-big .bg-sel.inl { padding:6px 10px 10px; }
.dfe-big .bg-sel.inl .bg-t, .dfe-big .bg-sel.inl .qhide { display:none; }
.dfe-big .lr.sel .lb { white-space:nowrap; }
.dfe-big .bg-c2 { border:0; background:transparent; color: var(--secondary-text-color); font-size:15px; cursor:pointer; padding:2px 6px; }
.dfe-big .bg-lh { display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:6px; }
.dfe-big .bg-q { flex:1; min-width:0; font: inherit; padding:5px 8px; border-radius:8px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big h6 { margin:10px 0 4px; font-size:12px; font-weight:500; color: var(--secondary-text-color); }
.dfe-big details.dgrp { margin: 4px 0; }
.dfe-big .pr.rad { justify-content:flex-start; gap:8px; cursor:pointer; }
.dfe-big [hidden], .dfe [hidden] { display:none !important; } /* flex rows ignored the hidden attribute */
.dfe-big .pr.rad input { margin:0; }
.dfe-big details.dgrp > summary { list-style:none; display:flex; align-items:center; gap:8px; padding: 8px 4px; font-size:15px; font-weight:600; color: var(--primary-text-color); border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.1)); }
.dfe-big details.dgrp > summary::-webkit-details-marker { display:none; }
.dfe-big details.dgrp > summary::before { content:''; width:0; height:0; border-left:6px solid currentColor; border-top:5px solid transparent; border-bottom:5px solid transparent; transition: transform .15s; }
.dfe-big details.dgrp[open] > summary::before { transform: rotate(90deg); }
.dfe-big details.dgrp > summary .n { font-weight:500; color: var(--secondary-text-color); }
.dfe-big .lr { display:flex; align-items:center; gap:6px; padding:2px 4px; border-radius:6px; }
.dfe-big .lr.sel { background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent); }
.dfe-big .lnm { flex:1; min-width:0; display:flex; align-items:center; text-align:left; border:0; background:transparent; color: inherit; font: inherit; font-size:13px; padding:2px 0; min-height:32px; cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
/* 0.11.1 test8: the two side columns share one header style (title + icon, one grey line). */
.dfe-big .dcol h3 { margin: 2px 0 2px; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:600; --mdc-icon-size:20px; flex-wrap:wrap; }
.dfe-big .dcol h3 > ha-icon { color: var(--primary-color); }
.dfe-big .dcol p { margin: 0 0 8px; font-size:12px; line-height:1.4; color: var(--secondary-text-color); }
.dfe-big .ovchip { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:500; padding:2px 8px; border-radius:12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent); color: var(--primary-color, #03a9f4); --mdc-icon-size:14px; }
.dfe-big .mkn { font-size:13px; font-weight:500; color: var(--secondary-text-color); }
.dfe-big .lb { border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background:transparent; border-radius:12px; padding:2px 9px; font: inherit; font-size:12px; cursor:pointer; }
.dfe-big .na { color: var(--secondary-text-color); font-size:11px; }
.dfe-big .ovsec h5 { margin:12px 0 6px; font-size:14px; font-weight:500; }
.dfe-big .ovsec .pr { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; padding:4px 0; }
.picbox .pics { flex-direction:column; align-items:stretch; gap:4px; }
.picbox .pics select, .picbox .pics .pfind { width:100%; box-sizing:border-box; font:inherit; font-size:13px; padding:6px 8px; border-radius:6px; border:1px solid var(--divider-color, rgba(0,0,0,.2)); background: var(--card-background-color, #fff); color: var(--primary-text-color); }
.picbox .pics .pis { font-size:12px; color: var(--secondary-text-color); }
.picbox .pics .pv input { font:inherit; padding:4px 6px; }
.dfe-big .ovsec .pr.rad { justify-content:flex-start; cursor:pointer; padding-left:4px; }
.dfe-big .ovsec .pr.rad span { flex:1; text-align:left; }
.dfe-big .ovsec select { max-width:60%; font: inherit; padding:4px; border-radius:6px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big .ovsec .xs { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:13px; margin:6px 0; }
.dfe-big .ovsec .xh { width:100%; color: var(--secondary-text-color); font-size:12px; }
.dfe-big .ovsec .xchip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); font-size:12px; }
.dfe-big .ovsec .xchip button, .dfe-big .ovsec .lnk { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font: inherit; font-size:12px; padding:0 2px; }
.dfe-big .ovsec .none { color: var(--secondary-text-color); }
.dfe-big .ovsec .lbsw { display:inline-flex; border:1px solid color-mix(in srgb, var(--primary-color, #03a9f4) 45%, transparent); border-radius:10px; overflow:hidden; margin-left:2px; }
.dfe-big .ovsec .xchip .lbsw button { padding:0 7px; font-size:11px; color: var(--secondary-text-color); border-radius:0; }
.dfe-big .ovsec .xchip .lbsw button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.dfe-big .ovsec .xchip.isb { outline:1.5px solid var(--primary-color, #03a9f4); }
.dfe-big .ovsec .xic { border:0; background:transparent; padding:0 2px 0 0; cursor:pointer; color: inherit; --mdc-icon-size:16px; display:inline-flex; }
.dfe-big .ovsec .pr input[type=checkbox] { width:18px; height:18px; }
/* 0.11.1: the plan comes first. Medium: one side panel with Settings | Markers tabs. Narrow: the plan on top, kept in view. */
@media (max-width: 1400px) {
  .dfe-big .bg-pan { display:flex; flex-direction:column; flex: 0 0 380px; min-height:0; order:2; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); overflow:hidden; }
  .dfe-big .bg-tabs { display:flex; border-bottom:1px solid var(--divider-color, #ddd); }
  .dfe-big .bg-pan .bg-set, .dfe-big .bg-pan .bg-side { flex:1; min-height:0; border:0; border-radius:0; }
  .dfe-big .bg-b.tab-set .bg-side, .dfe-big .bg-b.tab-side .bg-set { display:none; }
}
@media (max-width: 800px) {
  .dfe-big .bg-b { flex-direction:column; overflow:auto; }
  .dfe-big .bg-mid { flex: 0 0 45vh; position:sticky; top:0; z-index:2; background: var(--secondary-background-color, #f3f3f3); }
  .dfe-big .bg-pan { flex: 0 0 auto; overflow:visible; }
  .dfe-big .bg-h span { display:none; }
}
`;

class DeviceFloorplanCardEditor extends HTMLElement {
  setConfig(config) {
    // HA hands every config we emit straight back. Redrawing then would replace the field being
    // typed in, lose its focus and send the next keys to HA's shortcuts (#69).
    if (this._built && this._sent && stableJson(config) === this._sent) {
      this._config = { ...config };
      return;
    }
    this._config = { ...config };
    // 0.11: the test builds' "electricity" is "energy" (the card does the same), so the editor lists it too.
    if (Array.isArray(this._config.overlays) && this._config.overlays.includes("electricity")) this._config.overlays = this._config.overlays.map((o) => (o === "electricity" ? "energy" : o));
    if (this._config.electricity && !this._config.energy) this._config.energy = this._config.electricity;
    delete this._config.electricity;
    this._render();
  }

  set hass(hass) {
    dfLangOf(hass); // 0.14 L1: texts in this user's language
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
    else this.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    // 0.12.7: the Card Editor window's card gets live states (its preview acts like the card); the settings
    // column is not redrawn (only its fields get the new hass).
    if (this._big) {
      this._big.wrap.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
      if (this._big.card) this._big.card.hass = hass;
    }
  }

  connectedCallback() {
    // 0.12.6: a tap / long press on a device in HA's preview opens its settings (in the Card Editor window, Markers).
    if (this._onPvPick) return;
    this._onPvPick = (e) => {
      if (!this.isConnected || !this._config || !e.detail || !e.detail.id) return;
      const { id, ov } = e.detail;
      const go = () => {
        if (!this._big || !this._big.card) return;
        if (ov && this._big.card._overlay !== ov) this._big.card._setOverlay(ov);
        if (this._big.card._pick) this._big.card._pick(id);
      };
      if (this._big) return go();
      this._openBig();
      setTimeout(go, 500);
    };
    window.addEventListener("dfc-preview-pick", this._onPvPick);
  }

  disconnectedCallback() {
    if (this._onPvPick) window.removeEventListener("dfc-preview-pick", this._onPvPick);
    this._onPvPick = null;
    if (this._big) {
      this._big.wrap.remove();
      this._big = null;
    }
    // 0.11: the large preview belongs to the editor: it closes with it.
    EDIT_OV = null;
  }

  /** Switch HA's own preview card (and ours) to the overlay being edited. */
  _previewOv(o) {
    const seen = new Set();
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName === "DEVICE-FLOORPLAN-CARD" && el.preview && el._overlay !== o && el._overlays().includes(o)) el._setOverlay(o);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    try {
      let host = this;
      while (host.getRootNode && host.getRootNode() !== document) host = host.getRootNode().host || document;
      walk(host.shadowRoot || host);
    } catch (_e) {
      /* the preview just keeps its overlay */
    }
  }

  _emit() {
    this._sent = stableJson(this._config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    // 0.11.1 / 0.13.5: the Card Editor's preview follows every setting: every save comes through here.
    if (this._big && this._big.card) this._big.card.setConfig(this._config);
  }

  _set(c, { devices = true, sections = false } = {}) {
    this._config = this._prune(c);
    this._emit();
    this._engine(true);
    if (sections) this._renderSections();
    if (devices) this._renderDevices();
  }

  _planIds() {
    const c = this._config || {};
    const list = Array.isArray(c.plans) && c.plans.length ? c.plans : [c.plan];
    return [...new Set(list.filter(Boolean))];
  }

  /** All floors of this card merged (devices, rooms, bonds…), for the device and room lists. */
  _plan() {
    const all = planSensors(this._hass);
    const sens = this._planIds().map((id) => all.find((s) => s.attributes.plan_id === id)).filter(Boolean);
    if (!sens.length) return null;
    if (sens.length === 1) return sens[0];
    const a = { devices: {}, entities: {}, bonds: {}, areas: {}, phantoms: {} };
    for (const s of sens) for (const k of Object.keys(a)) Object.assign(a[k], s.attributes[k] || {});
    return { attributes: { ...sens[0].attributes, ...a } };
  }

  _setPlans(ids) {
    const c = { ...this._config };
    ids = [...new Set(ids.filter(Boolean))];
    if (ids.length > 1) {
      c.plans = ids;
      delete c.plan;
    } else {
      c.plan = ids[0] || "";
      delete c.plans;
      delete c.default_floor;
    }
    if (c.default_floor && !ids.includes(c.default_floor)) delete c.default_floor;
    this._set(c, { sections: true });
    this._renderFloors();
  }

  /** Floors as tabs: 1 · 2 · + (#75). */
  _renderFloors() {
    const box = this.querySelector("#floors");
    if (!box) return;
    const all = planSensors(this._hass);
    const ids = this._planIds();
    if (!ids.length && all[0]) ids.push(all[0].attributes.plan_id);
    if (this._ftab == null || this._ftab >= ids.length) this._ftab = 0;
    const name = (id) => {
      const s = all.find((x) => x.attributes.plan_id === id);
      return s ? s.attributes.plan_name || id : `${id} (not found)`;
    };
    const free = all.filter((s) => !ids.includes(s.attributes.plan_id));
    const cur = ids[this._ftab];
    box.innerHTML = `<div class="ftabs" role="tablist">${ids.map((id, i) => `<button class="${i === this._ftab ? "on" : ""}" data-ft="${i}" role="tab" title="${cesc(name(id))}">${i + 1}</button>`).join("")}<button class="add" data-fadd="1" title="Add a floor" ${free.length ? "" : "disabled"}>+</button></div>
      <div class="fbody"><select class="flt" data-fsel="1" aria-label="Plan of this floor">${all.map((s) => `<option value="${cesc(s.attributes.plan_id)}" ${s.attributes.plan_id === cur ? "selected" : ""} ${ids.includes(s.attributes.plan_id) && s.attributes.plan_id !== cur ? "disabled" : ""}>${cesc(s.attributes.plan_name || s.attributes.plan_id)}</option>`).join("")}</select>
      <button data-fmv="-1" title="Move left" ${this._ftab === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></button><button data-fmv="1" title="Move right" ${this._ftab >= ids.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></button><button data-fdel="1" title="Remove this floor from the card" ${ids.length < 2 ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
      <p class="fhint">${ids.length > 1 ? "The Markers and Rooms below belong to this floor. On the card, the floor button under Layers switches floors." : "Add floors with + to switch between them on the card."}</p>`;
    box.querySelectorAll("[data-ft]").forEach((b) => b.addEventListener("click", () => {
      this._ftab = Number(b.dataset.ft);
      this._renderFloors();
      this._renderRooms();
      this._renderActs();
      this._renderScenes();
    }));
    const bb = this.querySelector("#bigbtn span");
    if (bb) bb.textContent = "Open the Card Editor";
    // 0.11.1: the home's one-line summary of this card.
    const ds = this.querySelector("#dsum");
    if (ds) {
      const c = this._config;
      const nOv = Array.isArray(c.overlays) && c.overlays.length ? c.overlays.length : this._engine()._overlays().length;
      const pos = (c.buttons || {}).position || "bottom";
      ds.textContent = `${ids.map(name).join(" + ") || "No plan yet"} · ${nOv} overlays · Overlay Bar: ${String(pos).replace("rail_", "rail ").replace("_", " ")}`;
    }
    // 0.11.1: in the Card Editor the floor tabs also switch the preview.
    if (this._big && cur && this._big.card._floor !== cur) {
      this._big.card._floor = cur;
      this._big.card._update(true);
      if (this._big.rerender) this._big.rerender();
    }
    const add = box.querySelector("[data-fadd]");
    if (add) add.addEventListener("click", () => {
      if (!free.length) return;
      const lv = (s) => (Number.isFinite(s.attributes.level) ? s.attributes.level : 99);
      const pick = free.slice().sort((x, y) => lv(x) - lv(y))[0];
      const next = [...ids, pick.attributes.plan_id];
      // Ordered by floor level by default.
      next.sort((x, y) => lv(all.find((s) => s.attributes.plan_id === x) || { attributes: {} }) - lv(all.find((s) => s.attributes.plan_id === y) || { attributes: {} }));
      this._ftab = next.indexOf(pick.attributes.plan_id);
      this._setPlans(next);
    });
    box.querySelector("[data-fsel]").addEventListener("change", (e) => {
      const next = ids.slice();
      next[this._ftab] = e.target.value;
      this._setPlans(next);
    });
    box.querySelectorAll("[data-fmv]").forEach((b) => b.addEventListener("click", () => {
      const d = Number(b.dataset.fmv);
      const next = ids.slice();
      const j = this._ftab + d;
      if (j < 0 || j >= next.length) return;
      [next[this._ftab], next[j]] = [next[j], next[this._ftab]];
      this._ftab = j;
      this._setPlans(next);
    }));
    const del = box.querySelector("[data-fdel]");
    if (del) del.addEventListener("click", () => {
      const next = ids.filter((_x, i) => i !== this._ftab);
      this._ftab = Math.max(0, this._ftab - 1);
      this._setPlans(next);
    });
    const o = this.querySelector("#fopts");
    if (o) o.innerHTML = "";
    if (ids.length > 1 && o) {
      o.appendChild(this._form(
        [
          { name: "default_floor", selector: { select: { options: [{ value: "", label: "The last one shown on this screen" }, ...ids.map((id) => ({ value: id, label: name(id) }))], mode: "dropdown" } } },
          { name: "floor_swipe", selector: { boolean: {} } },
        ],
        { default_floor: this._config.default_floor || "", floor_swipe: this._config.floor_swipe !== false },
        { default_floor: "Floor when the card opens", floor_swipe: "Swipe up / down on the plan to change floor (touch screens)" },
        (v) => {
          const c = { ...this._config };
          if (v.default_floor) {
            c.default_floor = v.default_floor;
            c.remember_floor = false;
          } else {
            delete c.default_floor;
            delete c.remember_floor;
          }
          if (v.floor_swipe === false) c.floor_swipe = false;
          else delete c.floor_swipe;
          this._config = this._prune(c);
          this._emit();
        },
      ));
    }
  }

  /** A card instance (not on screen) that answers "does this device show in that overlay?". */
  _engine(reset = false) {
    if (!this._eng || reset) {
      this._eng = document.createElement("device-floorplan-card");
      try {
        this._eng.setConfig({ ...this._config, plan: this._planIds()[0] || "-" });
      } catch (_e) {
        /* no plan yet */
      }
    }
    this._eng.hass = this._hass;
    return this._eng;
  }

  _custom() {
    return Array.isArray(this._config.custom_overlays) ? this._config.custom_overlays : [];
  }

  _ovOptions() {
    return [...[...OVERLAY_ORDER, "energy", "cleaning"].map((o) => ({ value: o, label: NEW_OVERLAYS.includes(o) ? `${OVERLAYS[o].label} ✨ new` : OVERLAYS[o].label })), ...this._custom().map((c) => ({ value: c.id, label: c.name || "Custom" }))];
  }

  /** The editor's settings forms, in display order (#70). */
  _schemas() {
    const ovOpts = this._ovOptions();
    const conns = [{ value: "all", label: "All connections" }, ...CONN_ORDER.map((c) => ({ value: c, label: CONNS[c].label }))];
    const rail = String((this._config.buttons || {}).position || "").startsWith("rail_");
    return {
      general: [
        { name: "title", selector: { text: {} } },
        { name: "card_id", selector: { text: {} } },
        { name: "hide_admin_hint", selector: { boolean: {} } },
      ],
      buttons: [
        { name: "overlays", selector: { select: { options: ovOpts, multiple: true, reorder: true, mode: "list" } } },
        { name: "default_overlay", selector: { select: { options: ovOpts, mode: "dropdown" } } },
        { name: "buttons_position", selector: { select: { options: [{ value: "bottom", label: "Below the plan" }, { value: "top", label: "Above the plan" }, { value: "left", label: "Left of the plan" }, { value: "right", label: "Right of the plan" }, { value: "rail_left", label: "Side Rail, left (full height, at the card's edge)" }, { value: "rail_right", label: "Side Rail, right (full height, at the card's edge)" }, { value: "hidden", label: "Hidden (switch from other cards, see Card ID)" }], mode: "dropdown" } } },
        { name: "buttons_bar", selector: { select: { options: [{ value: "contrast", label: "Contrast (dark on a light theme, light on a dark theme)" }, { value: "theme", label: "Theme colour" }, { value: "dark", label: "Dark" }, ...(rail ? [] : [{ value: "clear", label: "Transparent (the buttons alone)" }])], mode: "dropdown" } } },
        ...(rail ? [] : [{ name: "buttons_shape", selector: { select: { options: [{ value: "pill", label: "Pill" }, { value: "tiles", label: "Tiles" }, { value: "circles", label: "Circles" }], mode: "dropdown" } } }]),
        { name: "buttons_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
        { name: "buttons_auto", selector: { boolean: {} } },
        { name: "buttons_style", selector: { select: { options: [{ value: "labels", label: "Icons and labels" }, { value: "icons", label: "Icons only" }], mode: "dropdown" } } },
        ...(rail ? [] : [{ name: "buttons_space", selector: { select: { options: [{ value: "reserve", label: "Reserve space (the plan fits beside it)" }, { value: "float", label: "Float over the plan" }], mode: "dropdown" } } }]),
        { name: "layers_button", selector: { select: { options: [{ value: "auto", label: "Automatic (away from a side Overlay Bar)" }, { value: "top-right", label: "Top right of the plan" }, { value: "top-left", label: "Top left of the plan" }, { value: "bottom-right", label: "Bottom right of the plan" }, { value: "bottom-left", label: "Bottom left of the plan" }, { value: "bar", label: "In the overlay buttons" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
        { name: "replay_button", selector: { select: { options: [{ value: "layers", label: "Next to the Layers button (round, on the plan)" }, { value: "bar", label: "In the Overlay Bar (its last button)" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
        { name: "release_tips", selector: { boolean: {} } },
        { type: "expandable", name: "overlay_names", title: "Overlay names", icon: "mdi:rename", schema: ovOpts.filter((o) => OVERLAYS[o.value]).map((o) => ({ name: o.value, selector: { text: {} } })) },
      ],
      // 0.8.2: space around the plan for this card: the plan's default, or its own (linked or per side).
      frame: (() => {
        const f = this._config.frame || {};
        const custom = f.mode === "custom";
        const num = { number: { min: -45, max: 60, step: 1, mode: "box", unit_of_measurement: "%" } };
        return [
          { name: "frame_mode", selector: { select: { options: [{ value: "plan", label: "The plan's default (set in the Floorplan Editor)" }, { value: "custom", label: "Custom for this card" }], mode: "dropdown" } } },
          ...(custom ? [{ name: "frame_linked", selector: { boolean: {} } }, ...(f.linked === false ? ["t", "r", "b", "l"].map((k) => ({ name: `frame_${k}`, selector: num })) : [{ name: "frame_all", selector: num }])] : []),
          { name: "plan_position", selector: { select: { options: [{ value: "top", label: "Top (space left below)" }, { value: "centre", label: "Centred" }], mode: "dropdown" } } },
        ];
      })(),
      overlaysA: [
        {
          type: "expandable", name: "live", title: "Live: what it shows", icon: OVERLAYS.live.icon,
          schema: [
            { name: "show", selector: { select: { options: Object.entries(LIVE_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } },
            { name: "quiet_small", selector: { boolean: {} } },
            { name: "values", selector: { boolean: {} } },
            { name: "lights_as", selector: { select: { options: [{ value: "glow", label: "Glow only (tap the glow to switch off)" }, { value: "markers", label: "Markers" }], mode: "dropdown" } } },
            { name: "show_off", selector: { select: { options: [{ value: "hidden", label: "Hidden (Live shows only what's on or happening)" }, { value: "faint", label: "Faint" }], mode: "dropdown" } } },
            { name: "touch_hint", selector: { select: { options: [{ value: "flash", label: "Flash when you tap the plan where there is nothing" }, { value: "outline", label: "A faint outline" }, { value: "none", label: "Nothing" }], mode: "dropdown" } } },
            { name: "motion_as", selector: { select: { options: [{ value: "pulse", label: "Room pulse (the room's edges glow)" }, { value: "icons", label: "Icons" }, { value: "both", label: "Both" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "cameras", title: "Cameras (Live and Security)", icon: "mdi:cctv",
          schema: [
            { name: "cam_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
            { name: "cam_layout", selector: { select: { options: [{ value: "plan", label: "On the plan, next to each camera" }, { value: "strip", label: "In a strip (film), in the space around the plan" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "lights", title: "Lights", icon: OVERLAYS.lights.icon,
          schema: [
            { name: "switches", selector: { boolean: {} } },
            { name: "brightness", selector: { boolean: {} } },
            { name: "off", selector: { select: { options: [{ value: "faint", label: "Small and faint" }, { value: "normal", label: "Normal" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
            { name: "all_off", selector: { boolean: {} } },
            { name: "all_on", selector: { boolean: {} } },
          ],
        },
      ],
      overlaysB: [
        { type: "expandable", name: "comfort", title: "Comfort", icon: OVERLAYS.comfort.icon, schema: [{ name: "heatmap", selector: { boolean: {} } }, { name: "heatmap_opacity", selector: { number: { min: 15, max: 90, step: 5, mode: "slider", unit_of_measurement: "%" } } }, { name: "readings", selector: { boolean: {} } }, { name: "climate_shown", selector: { boolean: {} } }, { name: "airflow", selector: { boolean: {} } }, { name: "humidity", selector: { boolean: {} } }, { name: "humidity_alone", selector: { boolean: {} } }, { name: "climate", selector: { boolean: {} } }, { name: "combine", selector: { select: { options: [{ value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }], mode: "dropdown" } } }] },
        { type: "expandable", name: "security", title: "Security", icon: OVERLAYS.security.icon, schema: [{ name: "show_quiet", selector: { boolean: {} } }, { name: "quiet_small", selector: { boolean: {} } }, { name: "cameras", selector: { boolean: {} } }] },
        {
          type: "expandable", name: "network", title: "Network", icon: OVERLAYS.network.icon,
          schema: [
            { name: "connections", selector: { select: { options: conns, multiple: true, mode: "list" } } },
            { name: "links", selector: { boolean: {} } },
            { name: "min_lqi", selector: { number: { min: 0, max: 250, step: 5, mode: "slider" } } },
            { name: "hub_links", selector: { boolean: {} } },
            { name: "wifi_links", selector: { boolean: {} } },
            { name: "legend", selector: { boolean: {} } },
            { name: "labels", selector: { boolean: {} } },
            { name: "only_weak", selector: { boolean: {} } },
          ],
        },
        { type: "expandable", name: "health", title: "Health", icon: OVERLAYS.health.icon, schema: [{ name: "low", selector: { number: { min: 5, max: 60, step: 5, mode: "slider", unit_of_measurement: "%" } } }, { name: "only_problems", selector: { boolean: {} } }] },
        { type: "expandable", name: "energy", title: "Energy", icon: OVERLAYS.energy.icon, schema: [
          { name: "min_w", selector: { number: { min: 0, max: 200, step: "any", mode: "box", unit_of_measurement: "W" } } },
          { name: "flow", selector: { boolean: {} } },
        ] },
        { type: "expandable", name: "cleaning", title: "Cleaning", icon: OVERLAYS.cleaning.icon, schema: [{ name: "opacity", selector: { number: { min: 15, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } }] },
      ],
      look: [
        {
          type: "expandable", name: "look", title: "Look", icon: "mdi:palette-outline",
          schema: [
            { name: "size", selector: { number: { min: 24, max: 56, step: 2, mode: "slider", unit_of_measurement: "px" } } },
            { name: "markers", selector: { select: { options: [{ value: "icon_text", label: "Icon and value (e.g. 45 % next to a shutter)" }, { value: "icon", label: "Icon only" }], mode: "dropdown" } } },
            { name: "names", selector: { select: { options: [{ value: "hover", label: "On hover" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "look", title: "Info chips (temperatures, AC, battery, energy…)", icon: "mdi:card-text-outline",
          schema: [
            { name: "chips", selector: { select: { options: [{ value: "dark", label: "Dark glass (default)" }, { value: "light", label: "Light" }, { value: "auto", label: "Follow the theme" }, { value: "custom", label: "Custom colour" }], mode: "dropdown" } } },
            ...((this._config.look || {}).chips === "custom" ? [{ name: "chip_color", selector: { color_rgb: {} } }] : []),
            { name: "chip_bg", selector: { select: { options: [{ value: "solid", label: "Solid" }, { value: "normal", label: "Normal (default)" }, { value: "light", label: "Light" }, { value: "clear", label: "See-through" }], mode: "dropdown" } } },
            { name: "chip_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Normal (default)" }, { value: "l", label: "Large" }, { value: "xl", label: "Extra large" }], mode: "dropdown" } } },
          ],
        },
      ],
      tap: [
        { type: "expandable", name: "tap", title: "Tap", icon: "mdi:gesture-tap", schema: Object.keys(TAP_KINDS).map((name) => ({ name, selector: { select: { options: TAP_OPTIONS, mode: "dropdown" } } })) },
        { type: "expandable", name: "hold", title: "Long press", icon: "mdi:gesture-tap-hold", schema: Object.keys(TAP_KINDS).map((name) => ({ name, selector: { select: { options: HOLD_OPTIONS, mode: "dropdown" } } })) },
      ],
    };
  }

  _label(s) {
    const L = {
      plan: "Plan", title: "Title on the card (optional, empty = none)", overlays: "Which buttons, in which order (drag to reorder). New overlays from updates appear here, marked ✨", default_overlay: "Overlay when the card opens",
      buttons_position: "Where the Overlay Bar is", buttons_style: "Labels", buttons_bar: "Overlay Bar background", buttons_shape: "Buttons", buttons_size: "Size", buttons_auto: "Automatic status on the card's overlay buttons (lights on, doors open, low batteries, offline devices)", plan_position: "Plan position in a fixed-height card (wall panel, sections)", buttons_space: "Space for the Overlay Bar", frame_mode: "Space around the plan", frame_linked: "Same on all four sides", frame_all: "All sides (+ space, − trim)", frame_t: "Top", frame_r: "Right", frame_b: "Bottom", frame_l: "Left", layers_button: "Layers button (viewers switch room names and other layers). Beside a side Overlay Bar it always sits on the plan's other side", replay_button: "Home Replay button", release_tips: "Show release tips (admins only: one tip per new version, until closed)",
      cam_size: "Size of the camera pictures", cam_layout: "Where the camera pictures are", lights_as: "Lights show as", motion_as: "Motion and presence show as", show_off: "Things that are off", touch_hint: "Touch areas (devices drawn in your plan) show", show: "Show", quiet_small: "Closed doors and idle sensors: small and faint", values: "Values next to icons (thermostat temperature, open lamps)",
      switches: "Include switches and plugs that run lights", brightness: "Show brightness of lights that are on", off: "Lights that are off", all_off: "“All off” button", all_on: "“All on” button",
      heatmap: "Heatmap shown by default (viewers can switch it under Layers)", heatmap_opacity: "Heatmap strength (viewers can change it with the slider under the plan)", opacity: "Strength of the Last cleaned colours (viewers can change it with the slider under the plan)", readings: "Temperature labels shown by default", climate_shown: "Climate devices (ACs, thermostats) shown by default", airflow: "AC air flow shown by default",
      humidity: "Show humidity", humidity_alone: "Also devices with humidity only", combine: "Bonds and phantoms with several sensors show", climate: "ACs and thermostats as climate chips (mode, room temperature, target)",
      chip_bg: "Background",
      chip_size: "Size (separate from the marker size)",
      chip_color: "Colour",
      min_w: "Now: show devices from (W)",
      flow: "Flow lines shown by default (viewers can switch them under Layers)",
      show_quiet: "All sensors by default, also closed / idle (viewers can switch it under Layers)", cameras: "Show cameras",
      connections: "Connections shown by default", layers: "Layers button next to the overlay buttons (viewers can switch connections)", links: "Draw Zigbee links (ZHA)", min_lqi: "Hide Zigbee links below this LQI", hub_links: "Draw hub / bridge links (Matter bridges, hubs)", wifi_links: "Draw Wi-Fi / LAN links to the router / access point (needs router device tracking)", legend: "Legend under the plan", labels: "Connection names next to icons", only_weak: "Only weak and fair signals",
      low: "Battery is low below", only_problems: "Only low batteries and offline devices",
      size: "Marker size (icons in every overlay; chips have their own size below)", markers: "Values next to marker icons (overlays that show values)", chips: "Style", names: "Device names", card_id: "Card ID (lets other cards switch this card's overlay)",
      hide_admin_hint: "Hide the “N new · Place them” button (admins only see it)",
      ...TAP_KINDS,
    };
    if (OVERLAYS[s.name] && !L[s.name]) return OVERLAYS[s.name].label;
    return L[s.name] || s.name;
  }

  _data() {
    const c = this._config;
    const look = c.look || {};
    const b = c.buttons || {};
    return {
      overlays: [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)],
      default_overlay: "live",
      ...c,
      ...(Array.isArray(c.overlays) ? { overlays: c.overlays.filter((o) => o !== "plan") } : {}),
      ...(c.default_overlay === "plan" ? { default_overlay: "live" } : {}),
      buttons_position: b.position || (look.dock === "hidden" ? "hidden" : "bottom"),
      buttons_style: b.style || (look.dock === "icons" ? "icons" : "labels"),
      buttons_space: b.space === "float_icons" ? "float" : b.space || "reserve",
      buttons_shape: BAR_SHAPES.includes(b.shape) ? b.shape : "pill",
      buttons_bar: String(b.position || "").startsWith("rail_") ? (["theme", "dark"].includes(b.bar) ? b.bar : "contrast") : b.space === "float_icons" || b.shape === "plain" ? "clear" : b.shape === "sidebar" ? b.bar || "dark" : b.bar || "theme",
      buttons_size: b.size || "m",
      buttons_auto: b.auto_status === true,
      plan_position: c.plan_position === "centre" ? "centre" : "top",
      frame_mode: (c.frame || {}).mode === "custom" ? "custom" : "plan",
      frame_linked: (c.frame || {}).linked !== false,
      frame_all: Number((c.frame || {}).t) || 0,
      ...Object.fromEntries(["t", "r", "b", "l"].map((k) => [`frame_${k}`, Number((c.frame || {})[k]) || 0])),
      // test9: nothing saved = Automatic (the card picks the corner away from a side Overlay Bar); it is not written.
      layers_button: c.layers_button || ((c.network || {}).layers === false ? "hidden" : "auto"),
      replay_button: c.replay === false ? "hidden" : c.replay_button || "layers",
      release_tips: c.release_tips !== false,
      live: { show: LIVE_DEFAULT, quiet_small: true, values: true, lights_as: "glow", show_off: "hidden", motion_as: "pulse", ...(c.live || {}) },
      cameras: { cam_size: "m", cam_layout: "plan", ...(c.cameras || {}) },
      lights: { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, ...(c.lights || {}) },
      comfort: { heatmap: true, heatmap_opacity: 52, readings: true, climate_shown: true, airflow: true, humidity: true, humidity_alone: true, climate: true, ...(c.comfort || {}) },
      security: { show_quiet: false, quiet_small: true, cameras: true, ...(c.security || {}) },
      network: { connections: ["all"], layers: true, links: true, min_lqi: 0, hub_links: true, wifi_links: true, legend: true, labels: false, only_weak: false, ...(c.network || {}) },
      health: { low: 20, only_problems: false, ...(c.health || {}) },
      energy: { min_w: 0, flow: true, ...(c.energy || {}) }, // 0.11: the editor shows the values in use
      cleaning: { opacity: 60, ...(c.cleaning || {}) },
      tap: { ...TAP_DEFAULT, ...(c.tap || {}) },
      hold: { ...HOLD_DEFAULT, ...(c.hold || {}) },
      look: { size: 34, chips: "dark", chip_bg: "normal", chip_size: "m", names: c.names || "hover", markers: look.markers || (look.values === false || c.show_states === false ? "icon" : "icon_text"), ...look },
      overlay_names: { ...(c.overlay_names || {}) },
      night: { ...NIGHT_DEFAULT, ...(c.night || {}) },
    };
  }

  /** Keep only what differs from the defaults, so the YAML stays short. */
  _prune(c) {
    const defaults = this._data.call({ _config: {}, _custom: () => [] });
    const out = { ...c };
    delete out.names; // moved into look.names
    delete out.show_states; // replaced by look.markers
    delete out.default_view; // replaced by default_overlay
    if (!out.hide_admin_hint) delete out.hide_admin_hint;
    if (out.layers_button === "auto") delete out.layers_button;
    // test10: one setting for the Replay button (the older "replay: false" is folded into it); the default is not written.
    if (out.replay_button) delete out.replay;
    if (out.replay_button === "layers") delete out.replay_button;
    if (out.release_tips !== false) delete out.release_tips; // shown by default: only "off" is written
    if (out.look) {
      out.look = { ...out.look };
      delete out.look.show_title; // 0.11: a title shows when there is one
      delete out.look.title;
      delete out.look.dock; // moved to buttons
      delete out.look.values; // replaced by look.markers
    }
    if (Array.isArray(out.people) && !out.people.length) delete out.people;
    if (Array.isArray(out.people_in) && !out.people_in.length) delete out.people_in;
    for (const k of ["live", "lights", "comfort", "security", "network", "health", "energy", "cleaning", "tap", "hold", "look", "overlay_names", "rooms", "buttons", "night"]) {
      if (!out[k]) continue;
      const v = {};
      const d0 = k === "rooms" ? { show_in: ["live"], style: "label", size: "m" } : k === "buttons" ? { position: "bottom", style: "labels" } : defaults[k] || {};
      for (const [kk, vv] of Object.entries(out[k])) {
        if (vv === "" || vv == null) continue;
        if (Array.isArray(vv) && !vv.length && kk !== "show" && kk !== "show_in") continue;
        if (vv && typeof vv === "object" && !Array.isArray(vv) && !Object.keys(vv).length) continue;
        if (JSON.stringify(vv) !== JSON.stringify(d0[kk])) v[kk] = vv;
      }
      if (Object.keys(v).length) out[k] = v;
      else delete out[k];
    }
    if (out.custom_overlays && !out.custom_overlays.length) delete out.custom_overlays;
    if (JSON.stringify(out.overlays) === JSON.stringify([...OVERLAY_ORDER, ...(out.custom_overlays || []).map((x) => x.id)])) delete out.overlays;
    if (out.default_overlay === "live") delete out.default_overlay;
    for (const k of ["title", "card_id", "default_floor"]) if (!out[k]) delete out[k];
    if (Array.isArray(out.plans) && out.plans.length) delete out.plan;
    if (out.devices && !Object.keys(out.devices).length) delete out.devices;
    return out;
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) {
      this._built = true;
      const sec = (icon, title, p, inner) => `<h4><ha-icon icon="${icon}"></ha-icon>${title}</h4>${p ? `<p>${p}</p>` : ""}${inner}`;
      // 0.11: card settings as clear sections: title + one line; one open at a time.
      const csec = (icon, title, p, inner) => `<details class="csec"><summary><h4><ha-icon icon="${icon}"></ha-icon>${title}<ha-icon class="cv" icon="mdi:chevron-down"></ha-icon></h4>${p ? `<p>${p}</p>` : ""}</summary><div class="csb">${inner}</div></details>`;
      // 0.8.1: per floor first (Markers, Rooms), then the settings for the whole card (all floors).
      // 0.11.1: a short home (header, summary, the Card Editor button, one tip); every setting folded below,
      // in two tabs: the card (whole house) and the floors. In the Card Editor the home hides and all is open.
      this.innerHTML = `<style>${ED_CSS}</style><div class="dfe">
        <div class="dhome">
          <div class="dh"><ha-icon icon="mdi:floor-plan"></ha-icon><b>Device Floorplan</b><span class="dv">${CARD_VERSION}</span><a href="https://johnkotrolos.github.io/ha-device-floorplan/" target="_blank" rel="noopener">Guide ↗</a></div>
          <p class="dsum"><ha-icon icon="mdi:information-outline"></ha-icon><span id="dsum"></span></p>
          <button class="bigbtn" id="bigbtn"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><span>Open the Card Editor</span></button>
          <p class="dtip"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>New: Home Replay (the round button beside Layers), and camera pictures in a strip.</p>
        </div>
        <details class="dall" id="dall"><summary>Card settings</summary>
        <div class="dcol"><h3><ha-icon icon="mdi:tune-variant"></ha-icon>Card settings</h3><p>How the whole card looks and works: the Overlay Bar, the overlays and what each shows, rooms and people. Floors: settings per floor.</p></div>
        <div class="dtabs"><button data-dt="card" class="on">Card</button><button data-dt="floor">Floors</button></div>
        <div class="dpane" data-pane="floor" hidden>
        <div class="fpanel"><div class="floors" id="floors"></div>
        ${sec("mdi:texture-box", "Rooms on this floor", "Rooms from the Floorplan Editor: rename them for the card or hide them.", `<div id="rooms"></div>`)}
        ${sec("mdi:gesture-tap-button", "Buttons on this floor", "Overlay actions and light scenes shown only on this floor. Those for every floor are under Card settings.", `<div class="sub"><h5><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Overlay actions</h5><div id="oacts_f"></div></div><div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes</h5><div id="scenes_f"></div></div>`)}</div>
        </div>
        <div class="dpane" data-pane="card">
        <div id="fopts"></div>
        <div data-form="general"></div>
        ${csec("mdi:gesture-tap-button", "Overlay Bar", "Which buttons, their order, where the Overlay Bar sits and how it looks.", `<div data-form="buttons"></div><div class="sub"><h5><ha-icon icon="mdi:gesture-tap-hold"></ha-icon>Overlay Bar: hold, status and shortcuts</h5><p>Each overlay button can run an action on hold and show a status (dot, count, value, colour or another icon). Shortcuts are your own buttons: tap and hold run any Home Assistant action (open a page, a popup on this browser, reload…). A faint line separates card overlays, your own overlays and shortcuts; what doesn't fit scrolls in the bar.</p><div id="bbar"></div></div><div class="sub"><h5><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Overlay actions on every floor</h5><p>Your own buttons under the plan, shown in one overlay (buttons for one floor are in the floor menu above): run any Home Assistant action (a script, a scene, the robot, another integration), open a page or a popup. Cleaning also shows the robot's own Start / Pause / Dock.</p><div id="oacts"></div></div>`)}
        ${csec("mdi:layers-outline", "Overlays", "Your own overlays first, then what each overlay shows.", `<div class="sub"><h5><ha-icon icon="mdi:layers-plus"></ha-icon>Your own overlays</h5><p>Overlay buttons of your own, e.g. “Downstairs lights” or “Plants”: pick the kinds of devices it shows; add single devices in Edit markers.</p><div id="custom"></div></div><div data-form="overlaysA"></div>
          <div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes on every floor</h5><p>Buttons in the Lights overlay (scenes for one floor are in the floor menu above). Stored in this card only, nothing is created in Home Assistant.</p><div id="scenes"></div></div>
          <div data-form="overlaysB"></div>`)}
        ${csec("mdi:texture-box", "Rooms", "How Room names look on the plan, and in which overlays they show by default.", `<div id="roomsg"></div>`)}
        ${csec("mdi:account-group-outline", "People", "Each person at the room pin of the room they are in. Room sensor: any entity whose state is a room (Bermuda, ESPresense, a template sensor…); sensor 2 is used when 1 is unknown or not a room on this plan.", `<div id="people"></div>`)}
        ${csec("mdi:weather-night", "Day & night", "", `<p id="nightnote"></p><div id="night"></div>`)}
        ${csec("mdi:tune-variant", "Look and tap behaviour", "", `<div data-form="look"></div><button class="lk" id="chipreset"><ha-icon icon="mdi:restore"></ha-icon>Reset Info chips</button><div data-form="tap"></div>`)}
        ${csec("mdi:border-outside", "Frame", "Space around the plan (+) or trimmed margin (−), % of the image: markers and Rooms never move.", `<div data-form="frame"></div>`)}
        </div></details>
      </div>`;
      for (const b of this.querySelectorAll("[data-dt]")) b.addEventListener("click", () => {
        for (const x of this.querySelectorAll("[data-dt]")) x.classList.toggle("on", x === b);
        for (const pn of this.querySelectorAll(".dpane")) pn.hidden = pn.dataset.pane !== b.dataset.dt;
      });
      // One card-settings section open at a time; the opened one scrolls to the top.
      for (const d of this.querySelectorAll("details.csec")) d.addEventListener("toggle", () => {
        if (!d.open) return;
        for (const o of this.querySelectorAll("details.csec")) if (o !== d) o.open = false;
        d.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      this._forms = {};
      for (const box of this.querySelectorAll("[data-form]")) {
        const key = box.dataset.form;
        const f = document.createElement("ha-form");
        f.computeLabel = (s) => this._label(s);
        f.addEventListener("value-changed", (e) => {
          e.stopPropagation();
          this._fromForm(key, { ...e.detail.value });
        });
        box.appendChild(f);
        this._forms[key] = f;
      }
      this.querySelector("#bigbtn").addEventListener("click", () => this._openBig());
      // 0.11: chips back to the defaults in one click.
      this.querySelector("#chipreset").addEventListener("click", () => {
        const look = { ...(this._config.look || {}) };
        for (const k of ["chips", "chip_bg", "chip_size", "chip_color", "chip_opacity", "chip_text"]) delete look[k];
        this._config = { ...this._config, look };
        if (!Object.keys(look).length) delete this._config.look;
        this._emit();
        this._engine(true);
      });
    }
    this._engine(true);
    this._renderFloors();
    this._renderSections();
    this._renderDevices();
  }

  /** Top-level config keys a form owns (so a form never writes back stale values of another one). */
  _keysOf(schema) {
    const out = [];
    for (const s of schema) {
      if (s.type === "expandable" && s.flatten) out.push(...this._keysOf(s.schema));
      else out.push(s.name);
    }
    return out;
  }

  _fromForm(key, v) {
    // 0.11: the large preview shows the overlay you are changing (chips: Comfort has the most).
    const follow = { look: "comfort", live: "live", lights: "lights", comfort: "comfort", security: "security", network: "network", health: "health", energy: "energy", cleaning: "cleaning" }[key];
    if (follow) {
      EDIT_OV = follow;
      this._previewOv(follow);
    }
    const schema = this._schemas()[key] || [];
    const c = { ...this._config };
    for (const k of this._keysOf(schema)) if (k in v) c[k] = v[k];
    if (key === "frame") {
      for (const k of this._keysOf(schema)) delete c[k];
      if (v.plan_position === "centre") c.plan_position = "centre";
      else delete c.plan_position;
      if (v.frame_mode !== "custom") delete c.frame;
      else {
        const linked = v.frame_linked !== false;
        const old = this._config.frame || {};
        const all = Number(v.frame_all) || 0;
        // Unlinking starts from the linked value; linking takes the top value.
        const side = (k) => (linked ? all : old.linked === false ? Number(v[`frame_${k}`]) || 0 : Number(old.t) || 0);
        c.frame = { mode: "custom", ...(linked ? {} : { linked: false }), t: side("t"), r: side("r"), b: side("b"), l: side("l") };
      }
      this._set(c, { sections: false });
      this._refreshForms(key);
      return;
    }
    if (key === "buttons") {
      const { space: _s, shape: _h, size: _z, bar: _b, auto_status: _a, ...keep } = this._config.buttons || {};
      const space = v.buttons_space === "float_icons" ? "float" : v.buttons_space; // "buttons only" = a transparent bar now
      const rail = String(v.buttons_position || "").startsWith("rail_");
      const wasRail = String((this._config.buttons || {}).position || "").startsWith("rail_");
      // Switching to / from the Side Rail: each keeps its own default background (rail dark, bar theme).
      let bar = v.buttons_space === "float_icons" ? "clear" : rail !== wasRail ? (rail ? "contrast" : _b && _b !== "contrast" && _b !== "dark" ? _b : "theme") : v.buttons_bar;
      if (rail && bar === "clear") bar = "contrast";
      const keepShape = rail ? _h : v.buttons_shape;
      const keepSpace = rail ? _s : space;
      c.buttons = { ...keep, position: v.buttons_position, style: v.buttons_style, ...(keepSpace && keepSpace !== "reserve" ? { space: keepSpace } : {}), ...(BAR_SHAPES.includes(keepShape) && keepShape !== "pill" ? { shape: keepShape } : {}), ...(rail ? (bar === "theme" || bar === "dark" ? { bar } : {}) : bar && bar !== "theme" ? { bar } : {}), ...(v.buttons_size && v.buttons_size !== "m" ? { size: v.buttons_size } : {}), ...(v.buttons_auto ? { auto_status: true } : {}) };
      for (const k of ["buttons_position", "buttons_style", "buttons_space", "buttons_shape", "buttons_bar", "buttons_size", "buttons_auto"]) delete c[k];
    }
    // Only what depends on the changed form is redrawn; the form you type in is left alone.
    this._set(c, { sections: false });
    this._refreshForms(key);
    if (key === "buttons" || key === "general") {
      this._renderRooms();
      if (key === "buttons") {
        this._renderBar();
        this._renderActs();
      }
    }
  }

  /** Give every form the current data; schemas only when they changed (keeps focus and open panels). */
  _refreshForms(skip) {
    const schemas = this._schemas();
    const data = this._data();
    for (const [key, f] of Object.entries(this._forms || {})) {
      f.hass = this._hass;
      const sj = JSON.stringify(schemas[key]);
      if (f._sj !== sj) {
        f._sj = sj;
        f.schema = schemas[key];
      }
      if (key !== skip) f.data = data;
      else f.data = { ...data }; // same values: ha-form keeps the field and its focus
    }
  }

  _renderSections() {
    this._refreshForms();
    this._renderCustom();
    this._renderBar();
    this._renderActs();
    this._renderScenes();
    this._renderRooms();
    this._renderPeople();
    this._renderNight();
  }

  // ---- people (#67)
  _renderPeople() {
    const box = this.querySelector("#people");
    if (!box) return;
    box.innerHTML = "";
    // Always read the current list: edits are saved without a redraw, so a list captured at draw time goes stale.
    const cur = () => (Array.isArray(this._config.people) ? this._config.people : []);
    const list = cur();
    const save = (next, redraw) => {
      const c = { ...this._config, people: next };
      this._config = this._prune(c);
      this._emit();
      if (redraw) this._renderPeople();
    };
    list.forEach((pp, i) => {
      const row = document.createElement("div");
      row.className = "prow-ed";
      row.appendChild(this._form(
        [
          { name: "entity", selector: { entity: { domain: "person" } } },
          { name: "room", selector: { entity: {} } },
          { name: "room2", selector: { entity: {} } },
          { name: "distance", selector: { entity: { domain: "sensor", device_class: "distance" } } },
        ],
        { ...pp },
        { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (fallback)", distance: "Distance sensor (Bermuda; test: Network → Bluetooth)" },
        (v) => {
          const next = cur().slice();
          next[i] = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
          save(next, false);
        },
      ));
      const del = document.createElement("button");
      del.className = "del";
      del.innerHTML = `<ha-icon icon="mdi:delete-outline"></ha-icon>Remove`;
      del.addEventListener("click", () => save(cur().filter((_x, j) => j !== i), true));
      row.appendChild(del);
      box.appendChild(row);
    });
    const add = document.createElement("button");
    add.className = "add";
    add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>Add person`;
    add.addEventListener("click", () => {
      const now = cur();
      const used = new Set(now.map((x) => x.entity));
      const next = Object.keys(this._hass.states).find((e) => e.startsWith("person.") && !used.has(e));
      save([...now, next ? { entity: next } : {}], true);
    });
    box.appendChild(add);
    if (list.length) {
      box.appendChild(this._form(
        [{ name: "people_in", selector: { select: { options: this._ovOptions().filter((o) => o.value !== "people"), multiple: true, mode: "list" } } }],
        { people_in: this._config.people_in || [] },
        { people_in: "Also show people in these overlays (always in People)" },
        (v) => {
          this._config = this._prune({ ...this._config, people_in: v.people_in || [] });
          this._emit();
        },
      ));
    }
  }

  // ---- day & night (#74)
  _renderNight() {
    const box = this.querySelector("#night");
    if (!box) return;
    const sun = this._hass.states["sun.sun"];
    const note = this.querySelector("#nightnote");
    if (note) note.textContent = sun ? "The plan gets darker after sunset, gradually with the sun, and lights that are on glow where they are. Light shapes come from the Floorplan Editor." : "Add the Sun integration (Settings → Devices & services → Add integration → Sun) for a gradual day–night change; until then the fixed times are used.";
    if (box._built) {
      box._f.data = { ...NIGHT_DEFAULT, ...(this._config.night || {}) };
      return;
    }
    box._built = true;
    box._f = this._form(
      [
        { name: "mode", selector: { select: { options: [{ value: "sun", label: "Follow the sun (gradual)" }, { value: "times", label: "Fixed times" }, { value: "dark", label: "Follow Home Assistant's dark theme" }, { value: "always", label: "Always night" }, { value: "off", label: "Off" }], mode: "dropdown" } } },
        { name: "start", selector: { time: {} } },
        { name: "end", selector: { time: {} } },
        { name: "overlays", selector: { select: { options: this._ovOptions(), multiple: true, mode: "list" } } },
        { name: "strength", selector: { number: { min: 20, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "style", selector: { select: { options: [{ value: "moon", label: "Moonlight (deep blue)" }, { value: "dim", label: "Dim (darker, neutral)" }], mode: "dropdown" } } },
        { name: "dim_quiet", selector: { boolean: {} } },
        { name: "shutters", selector: { boolean: {} } },
        { name: "warm_dusk", selector: { boolean: {} } },
      ],
      { ...NIGHT_DEFAULT, ...(this._config.night || {}) },
      { mode: "Day & night", start: "Night starts (fixed times, also used without the Sun)", end: "Night ends", overlays: "Use the night look in", strength: "How dark the night gets", style: "Style", dim_quiet: "Dim quiet markers at night (active ones stay bright)", shutters: "Closed shutters darken their room by day (rooms with a shape)", warm_dusk: "Warm dusk and dawn colours (follows the sun)" },
      (v) => {
        const nv = { ...v };
        for (const k of ["start", "end"]) if (nv[k]) nv[k] = String(nv[k]).slice(0, 5);
        this._config = this._prune({ ...this._config, night: nv });
        this._emit();
      },
    );
    box.appendChild(box._f);
  }

  _form(schema, data, labels, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.computeLabel = (s) => labels[s.name] || s.name;
    f.schema = schema;
    f.data = data;
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      onChange({ ...e.detail.value });
    });
    return f;
  }
}
Object.assign(DeviceFloorplanCardEditor.prototype, {

  // ---- custom overlays (#55)
  _renderCustom() {
    const box = this.querySelector("#custom");
    if (!box) return;
    const curList = () => this._custom(); // read fresh: edits save without a redraw
    box.innerHTML = curList().map((o, i) => `<div class="row" data-i="${i}"><button class="hd" data-copen="${i}"><ha-icon icon="${cesc(o.icon || "mdi:layers-outline")}"></ha-icon>${cesc(o.name || "Custom")}<small style="margin-left:auto">${cesc(o.mode === "manual" ? "devices you add" : `${(o.kinds || []).length} kind${(o.kinds || []).length === 1 ? "" : "s"}`)}</small><ha-icon class="cv ${this._copen === i ? "up" : ""}" icon="mdi:chevron-down"></ha-icon></button>${this._copen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-cadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add overlay</button>`;
    box.querySelector("[data-cadd]").addEventListener("click", () => {
      const used = new Set([...curList().map((o) => o.id), ...OVERLAY_ORDER]);
      let n = 1;
      while (used.has(`custom${n}`)) n++;
      const next = [...curList(), { id: `custom${n}`, name: `Custom ${n}`, icon: "mdi:layers-outline", kinds: [] }];
      const c = { ...this._config, custom_overlays: next };
      if (Array.isArray(c.overlays)) c.overlays = [...c.overlays, `custom${n}`];
      this._copen = next.length - 1;
      this._set(c, { sections: true });
    });
    for (const b of box.querySelectorAll("[data-copen]")) b.addEventListener("click", () => {
      const i = Number(b.dataset.copen);
      this._copen = this._copen === i ? null : i;
      this._renderCustom();
    });
    const body = this._copen != null && box.querySelector(`.row[data-i="${this._copen}"] .body`);
    if (!body) return;
    const i = this._copen;
    const o = curList()[i];
    body.appendChild(this._form(
      [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "mode", selector: { select: { options: [{ value: "kinds", label: "By kinds (new devices join automatically)" }, { value: "manual", label: "Only devices I add (in Edit markers)" }], mode: "dropdown" } } },
        ...(o.mode === "manual" ? [] : [{ name: "kinds", selector: { select: { options: Object.entries(CUSTOM_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } }]),
        { name: "lights_as", selector: { select: { options: [{ value: "markers", label: "Markers" }, { value: "glow", label: "Glow only" }], mode: "dropdown" } } },
      ],
      { kinds: [], mode: "kinds", lights_as: "markers", ...o },
      { name: "Button name", icon: "Icon", mode: "Which devices", kinds: "Shows these kinds (the order below decides what leads)", lights_as: "Lights show as" },
      (v) => {
        const prev = curList()[i] || {};
        // Keep the user's order for kinds that stay; new ones go to the end (#109).
        if (Array.isArray(v.kinds)) v.kinds = [...(prev.kinds || []).filter((k) => v.kinds.includes(k)), ...v.kinds.filter((k) => !(prev.kinds || []).includes(k))];
        if (v.mode === "kinds") delete v.mode;
        if (v.lights_as === "markers") delete v.lights_as;
        const next = curList().map((x, j) => (j === i ? { ...x, ...v, id: x.id } : x));
        if (v.mode === undefined) delete next[i].mode;
        if (v.lights_as === undefined) delete next[i].lights_as;
        this._config = this._prune({ ...this._config, custom_overlays: next });
        if ((v.mode || "kinds") !== (prev.mode || "kinds") || JSON.stringify(v.kinds) !== JSON.stringify(prev.kinds)) setTimeout(() => this._renderCustom(), 0);
        this._emit();
        this._engine(true);
        this._refreshForms();
        this._renderDevices();
        const hd = box.querySelector(`.row[data-i="${i}"] .hd`);
        if (hd) hd.innerHTML = `<ha-icon icon="${cesc(v.icon || "mdi:layers-outline")}"></ha-icon>${cesc(v.name || "Custom")}<small style="margin-left:auto">${cesc(o.id)}</small>`;
      },
    ));
    // Order of kinds (#109): the first one a device matches leads, the others become extra lines.
    if (o.mode !== "manual" && (o.kinds || []).length > 1) {
      const ord = document.createElement("div");
      ord.className = "kord";
      ord.innerHTML = `<h5>What leads (first match) · the rest show as small lines</h5>${o.kinds.map((k, n) => `<div class="kr"><span>${n + 1}. ${cesc(CUSTOM_KINDS[k] || k)}</span>${n ? `<button data-up="${n}" title="Move up">▲</button>` : ""}</div>`).join("")}`;
      for (const b of ord.querySelectorAll("[data-up]")) b.addEventListener("click", () => {
        const n = Number(b.dataset.up);
        const ks = [...o.kinds];
        [ks[n - 1], ks[n]] = [ks[n], ks[n - 1]];
        const next = curList().map((x, j) => (j === i ? { ...x, kinds: ks } : x));
        this._set({ ...this._config, custom_overlays: next }, { devices: false });
        this._renderCustom();
      });
      body.appendChild(ord);
    }
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.innerHTML = `<button class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove this overlay</button>`;
    btns.querySelector(".del").addEventListener("click", () => {
      const next = curList().filter((_x, j) => j !== i);
      const c = { ...this._config, custom_overlays: next };
      if (Array.isArray(c.overlays)) c.overlays = c.overlays.filter((x) => x !== o.id);
      if (c.default_overlay === o.id) delete c.default_overlay;
      if (c.devices) {
        const devs = {};
        for (const [id, d] of Object.entries(c.devices)) {
          const dd = { ...d };
          for (const k of ["hide_in", "add_to"]) if (Array.isArray(dd[k])) dd[k] = dd[k].filter((x) => x !== o.id);
          for (const k of ["hide_in", "add_to"]) if (Array.isArray(dd[k]) && !dd[k].length) delete dd[k];
          if (Object.keys(dd).length) devs[id] = dd;
        }
        c.devices = devs;
      }
      this._copen = null;
      this._set(c, { sections: true });
    });
    body.appendChild(btns);
  },

  // ---- light scenes (#54)
  // ---- 0.8.2 Overlay Bar Reloaded: hold, status, shortcuts
  _statusSchema(st, allowAuto) {
    const mode = st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off");
    const show = st.show === "icon" ? "color" : st.show || "dot";
    const badge = show === "count" || show === "value";
    return [
      { name: "st_mode", selector: { select: { options: [...(allowAuto ? [{ value: "auto", label: "Automatic" }] : []), { value: "off", label: "None" }, { value: "custom", label: "From entities I pick" }], mode: "dropdown" } } },
      ...(mode === "custom" ? [
        { name: "st_entity", selector: { entity: { multiple: true } } },
        { name: "st_show", selector: { select: { options: [{ value: "color", label: "Icon colour" }, { value: "dot", label: "Dot" }, { value: "count", label: "Badge: how many are active" }, { value: "value", label: "Badge: short value (e.g. 62%)" }], mode: "dropdown" } } },
        ...(badge
          ? [{ name: "st_when_1", selector: { text: {} } }, { name: "st_color_1", selector: { text: {} } }]
          : [1, 2, 3].flatMap((n) => [{ name: `st_when_${n}`, selector: { text: {} } }, { name: `st_color_${n}`, selector: { text: {} } }])),
      ] : []),
    ];
  },

  _statusData(st, allowAuto) {
    const rules = Array.isArray(st.rules) && st.rules.length ? st.rules : [{ when: st.when, color: st.color }];
    const d = { st_mode: st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off"), st_entity: Array.isArray(st.entity) ? st.entity : st.entity ? [st.entity] : [], st_show: st.show === "icon" ? "color" : st.show || "dot" };
    for (const n of [1, 2, 3]) {
      d[`st_when_${n}`] = (rules[n - 1] || {}).when || "";
      d[`st_color_${n}`] = (rules[n - 1] || {}).color || "";
    }
    return d;
  },

  _statusFrom(v, allowAuto) {
    const mode = v.st_mode || (allowAuto ? "auto" : "off");
    if (mode === "auto" && allowAuto) return null;
    if (mode === "off") return allowAuto ? { mode: "off" } : null;
    const st = { mode: "custom", entity: v.st_entity || [], show: v.st_show || "dot" };
    if (st.show === "count" || st.show === "value") {
      if (v.st_when_1) st.when = v.st_when_1;
      if (v.st_color_1) st.color = v.st_color_1;
    } else {
      const rules = [1, 2, 3].map((n) => ({ when: v[`st_when_${n}`] || "", color: v[`st_color_${n}`] || "" })).filter((r) => r.when || r.color);
      if (rules.length) st.rules = rules.map((r) => ({ ...(r.when ? { when: r.when } : {}), ...(r.color ? { color: r.color } : {}) }));
    }
    return st;
  },

  /** 0.10: Overlay actions (buttons under the plan), per overlay and per floor. */
  /** The floor picked in the tabs (its plan id). */
  _curFloor() {
    const ids = this._planIds();
    return ids[Math.min(this._ftab || 0, Math.max(0, ids.length - 1))] || null;
  },

  /** Is a per-floor list (actions, scenes: items with plans) in scope: this floor, or every floor (no plans)? */
  _inScope(x, scope) {
    const pl = Array.isArray(x.plans) ? x.plans : [];
    return scope ? pl.includes(scope) : !pl.length;
  },

  /** 0.10: overlay actions on this floor (in the floor menu) and on every floor (card settings). */
  _renderActs() {
    this._actsIn("#oacts", null);
    this._actsIn("#oacts_f", this._curFloor());
  },

  _actsIn(sel, scope) {
    const box = this.querySelector(sel);
    if (!box) return;
    const curList = () => Array.isArray(this._config.overlay_actions) ? this._config.overlay_actions : []; // read fresh: edits save without a redraw
    const idx = curList().map((_x, i) => i).filter((i) => this._inScope(curList()[i], scope));
    const plans = planSensors(this._hass).map((x) => ({ value: x.attributes.plan_id, label: x.attributes.plan_name || x.attributes.plan_id }));
    const ovName = (o) => (this._ovOptions().find((x) => x.value === o) || {}).label || o;
    const save = (next, redraw = true) => {
      const c = { ...this._config, overlay_actions: next };
      if (!next.length) delete c.overlay_actions;
      this._config = this._prune(c);
      this._emit();
      if (redraw) this._renderActs();
    };
    const rb = (this._config.cleaning || {}).robot_buttons !== false;
    box.innerHTML = (scope ? "" : `<div class="oaopt"></div>`) + idx.map((i) => [curList()[i], i]).map(([x, i]) => `<div class="row" data-i="${i}"><button class="hd" data-aopen="${i}"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"></ha-icon>${cesc(x.name || `Action ${i + 1}`)}<small style="margin-left:auto">${cesc(ovName(x.overlay || "cleaning"))} · ${cesc(Array.isArray(x.plans) && x.plans.length ? x.plans.map((id) => (plans.find((q) => q.value === id) || {}).label || id).join(", ") : "every floor")}</small></button>${this._aopen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-aadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add action</button>`;
    if (!scope) box.querySelector(".oaopt").appendChild(this._form([{ name: "rb", selector: { boolean: {} } }], { rb }, { rb: "Cleaning: the robot's Start / Pause / Dock under the plan" }, (v) => {
      const c = { ...(this._config.cleaning || {}) };
      if (v.rb) delete c.robot_buttons;
      else c.robot_buttons = false;
      const nc = { ...this._config, cleaning: c };
      if (!Object.keys(c).length) delete nc.cleaning;
      this._config = this._prune(nc);
      this._emit();
    }));
    box.querySelector("[data-aadd]").addEventListener("click", () => {
      this._aopen = curList().length;
      save([...curList(), { name: "Action", icon: "mdi:gesture-tap", overlay: "cleaning", ...(scope ? { plans: [scope] } : {}) }]);
    });
    for (const el of box.querySelectorAll("[data-aopen]")) el.addEventListener("click", () => {
      const i = Number(el.dataset.aopen);
      this._aopen = this._aopen === i ? null : i;
      this._renderActs();
    });
    const body = this._aopen != null && box.querySelector(`.row[data-i="${this._aopen}"] .body`);
    if (!body) return;
    const i = this._aopen;
    const x = curList()[i] || {};
    const tk = (x.tap_action || {}).action;
    const bm = tk === "fire-dom-event" && x.tap_action.browser_mod && x.tap_action.browser_mod.service === "browser_mod.popup" ? x.tap_action.browser_mod.data || {} : null;
    const data = {
      name: x.name || "", icon: x.icon || "", overlay: x.overlay || "cleaning", plans: Array.isArray(x.plans) ? x.plans : [],
      tap_kind: bm ? "popup" : x.tap_action ? "action" : "details",
      tap_action: !bm && tk ? x.tap_action : undefined,
      popup_title: bm ? bm.title || "" : "", popup_card: bm ? bm.content : undefined,
      hold_kind: x.hold_action ? "action" : "details",
      hold_action: x.hold_action || undefined,
      ...this._statusData(x.status || {}, false),
    };
    const LBL = { name: "Name", icon: "Icon", overlay: "Shown in", plans: "Floors (none ticked = every floor)", tap_kind: "Tap", tap_action: "Tap action", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)", hold_kind: "Hold", hold_action: "Hold action", st_mode: "Status on the button", st_entity: "Entities", st_show: "Shows", st_when_1: "When (states like cleaning, on, or a number test like >50; empty = on / open / armed / unlocked)", st_color_1: "Colour (e.g. green, #E5534B)", st_when_2: "Else when", st_color_2: "Colour", st_when_3: "Else when", st_color_3: "Colour" };
    const schema = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "overlay", selector: { select: { options: this._ovOptions(), mode: "dropdown" } } },
      { name: "plans", selector: { select: { options: plans, multiple: true, mode: "list" } } },
      { name: "tap_kind", selector: { select: { options: [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action (script, scene, service, page…)" }, { value: "popup", label: "Popup on this browser only (browser_mod)" }], mode: "dropdown" } } },
      ...(data.tap_kind === "action" ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
      ...(data.tap_kind === "popup" ? [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }] : []),
      { name: "hold_kind", selector: { select: { options: [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action" }], mode: "dropdown" } } },
      ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
      ...this._statusSchema(x.status || {}, false),
    ];
    body.appendChild(this._form(schema, data, LBL, (v) => {
      const nx = { name: v.name || "", icon: v.icon || "", overlay: v.overlay || "cleaning" };
      if (Array.isArray(v.plans) && v.plans.length) nx.plans = v.plans;
      if (v.tap_kind === "action") nx.tap_action = v.tap_action && v.tap_action.action ? v.tap_action : { action: "perform-action" };
      else if (v.tap_kind === "popup") nx.tap_action = { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(v.popup_title ? { title: v.popup_title } : {}), content: v.popup_card || { type: "markdown", content: "Pick a card" } } } };
      if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "perform-action" };
      const st = this._statusFrom(v, false);
      if (st) nx.status = st;
      const redraw = v.tap_kind !== data.tap_kind || v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
      save(curList().map((y, j) => (j === i ? nx : y)), redraw);
    }));
    const at = idx.indexOf(i);
    body.insertAdjacentHTML("beforeend", `<div class="btns"><button data-amv="-1" ${at <= 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon>Up</button><button data-amv="1" ${at >= idx.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon>Down</button><button class="del" data-adel="1"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button></div>`);
    for (const el of body.querySelectorAll("[data-amv]")) el.addEventListener("click", () => {
      const j = idx[at + Number(el.dataset.amv)];
      const next = [...curList()];
      [next[i], next[j]] = [next[j], next[i]];
      this._aopen = j;
      save(next);
    });
    body.querySelector("[data-adel]").addEventListener("click", () => {
      this._aopen = null;
      save(curList().filter((_y, j) => j !== i));
    });
  },

  _renderBar() {
    const box = this.querySelector("#bbar");
    if (!box) return;
    const b = this._config.buttons || {};
    const actions = b.actions || {};
    const shortcuts = Array.isArray(b.shortcuts) ? b.shortcuts : [];
    const ovs = (Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)]).filter((o) => o !== "plan" && o !== "people");
    const def = (o) => OVERLAYS[o] || (this._custom().find((x) => x.id === o) ? { label: this._custom().find((x) => x.id === o).name || "Custom", icon: this._custom().find((x) => x.id === o).icon || "mdi:layers-outline" } : null);
    const AUTO = { lights: "badge with how many of the lights the Lights overlay shows are on", security: "red dot when a door or window is open, the alarm armed or a lock unlocked (not shutters)", health: "amber dot when a battery is low or a device offline", network: "red dot when a device is offline", cleaning: "red dot when a robot reports an error, amber when it needs attention" };
    const actTxt = (a) => (!a ? "" : { reload: "reload page", back: "back", navigate: "open a page", url: "open a link", "more-info": "details", "perform-action": "action", "call-service": "action", toggle: "toggle", "fire-dom-event": "popup", assist: "Assist", none: "" }[a.action] || a.action);
    const stTxt = (st, o) => (st && st.mode === "off" ? "no status" : st && st.mode === "auto" ? "auto status" : st && st.mode === "custom" ? `status: ${{ color: "icon colour", icon: "icon colour", dot: "dot", count: "badge", value: "badge" }[st.show || "dot"]}` : o && AUTO[o] && b.auto_status ? "auto status" : "");
    const save = (nb, redraw = true) => {
      const next = { ...nb };
      if (next.actions && !Object.keys(next.actions).length) delete next.actions;
      if (next.shortcuts && !next.shortcuts.length) delete next.shortcuts;
      this._config = this._prune({ ...this._config, buttons: next });
      this._emit();
      if (redraw) this._renderBar();
    };
    const rows = [
      ...ovs.filter(def).map((o) => ({ key: `o:${o}`, icon: def(o).icon, name: (this._config.overlay_names || {})[o] || def(o).label, small: [actions[o] && actions[o].hold_action ? `hold: ${actTxt(actions[o].hold_action)}` : "", stTxt((actions[o] || {}).status, o)].filter(Boolean).join(" · ") || "overlay" })),
      ...shortcuts.map((sc, i) => ({ key: `s:${i}`, icon: sc.icon || "mdi:gesture-tap", name: sc.name || `Shortcut ${i + 1}`, small: [sc.hidden ? "hidden shortcut" : "shortcut", sc.tap_action ? `tap: ${actTxt(sc.tap_action)}` : "", sc.hold_action ? `hold: ${actTxt(sc.hold_action)}` : "", stTxt(sc.status)].filter(Boolean).join(" · ") })),
    ];
    box.innerHTML = rows.map((r) => `<div class="row" data-bk="${cesc(r.key)}"><button class="hd" data-bopen="${cesc(r.key)}"><ha-icon icon="${cesc(r.icon)}"></ha-icon>${cesc(r.name)}<small style="margin-left:auto">${cesc(r.small)}</small></button>${this._bopen === r.key ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-badd="1"><ha-icon icon="mdi:plus"></ha-icon>Add shortcut</button>`;
    box.querySelector("[data-badd]").addEventListener("click", () => {
      this._bopen = `s:${shortcuts.length}`;
      save({ ...b, shortcuts: [...shortcuts, { name: "Shortcut", icon: "mdi:gesture-tap" }] });
    });
    for (const el of box.querySelectorAll("[data-bopen]")) el.addEventListener("click", () => {
      this._bopen = this._bopen === el.dataset.bopen ? null : el.dataset.bopen;
      this._renderBar();
    });
    const body = this._bopen && box.querySelector(`.row[data-bk="${CSS.escape(this._bopen)}"] .body`);
    if (!body) return;
    const [kind, id] = [this._bopen.slice(0, 1), this._bopen.slice(2)];
    const LBL = { hold_action: "Hold action", st_mode: "Status on the button", st_entity: "Entities", st_show: "Shows", st_when_1: "When (states like running, prepare, or a number test like >50; empty = on / open / armed / unlocked)", st_color_1: "Colour (e.g. green, #E5534B)", st_when_2: "Else when", st_color_2: "Colour", st_when_3: "Else when", st_color_3: "Colour", name: "Name", icon: "Icon", shown: "Show in the Overlay Bar (off: it stays here with all its settings)", tap_kind: "Tap", tap_action: "Tap action", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)", hold_kind: "Hold" };
    if (kind === "o") {
      const cur = actions[id] || {};
      const hk = (cur.hold_action || {}).action;
      const canAuto = !!AUTO[id];
      const stData = this._statusData(cur.status || {}, canAuto);
      if (canAuto && !cur.status) stData.st_mode = b.auto_status ? "auto" : "off"; // 0.13.1: unset follows the switch above
      const data = { hold_kind: hk === "reload" || hk === "back" ? hk : cur.hold_action ? "action" : "none", hold_action: hk && hk !== "reload" && hk !== "back" ? cur.hold_action : undefined, ...stData };
      const schema = [
        { name: "hold_kind", selector: { select: { options: [{ value: "none", label: "Nothing" }, { value: "action", label: "A Home Assistant action" }, { value: "reload", label: "Reload this page" }, { value: "back", label: "Back to where you were" }], mode: "dropdown" } } },
        ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
        ...this._statusSchema(cur.status || { mode: stData.st_mode }, canAuto),
      ];
      const f = this._form(schema, data, LBL, (v) => {
        const nx = {};
        if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
        else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
        // 0.13.1: the status is written only once you change it; "Automatic" chosen here is kept for this button.
        const touched = !!cur.status || v.st_mode !== data.st_mode;
        const st = !touched ? null : v.st_mode === "auto" && canAuto ? { mode: "auto" } : this._statusFrom(v, canAuto);
        if (st) nx.status = st;
        const na = { ...actions };
        if (Object.keys(nx).length) na[id] = nx;
        else delete na[id];
        const redraw = v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
        save({ ...b, actions: na }, redraw);
      });
      body.appendChild(f);
      if (AUTO[id]) body.insertAdjacentHTML("beforeend", `<p class="note">Automatic: ${cesc(AUTO[id])}, for the floor shown. A button you haven't set follows <i>Automatic status</i> above.</p>`);
      return;
    }
    const i = Number(id);
    const sc = shortcuts[i] || {};
    const tk = (sc.tap_action || {}).action;
    const bm = tk === "fire-dom-event" && sc.tap_action.browser_mod && sc.tap_action.browser_mod.service === "browser_mod.popup" ? sc.tap_action.browser_mod.data || {} : null;
    const hk = (sc.hold_action || {}).action;
    const data = {
      name: sc.name || "", icon: sc.icon || "", shown: sc.hidden !== true,
      tap_kind: bm ? "popup" : tk === "reload" || tk === "back" ? tk : sc.tap_action ? "action" : "details",
      tap_action: !bm && tk && tk !== "reload" && tk !== "back" ? sc.tap_action : undefined,
      popup_title: bm ? bm.title || "" : "", popup_card: bm ? bm.content : undefined,
      hold_kind: hk === "reload" || hk === "back" ? hk : sc.hold_action ? "action" : "details",
      hold_action: hk && hk !== "reload" && hk !== "back" ? sc.hold_action : undefined,
      ...this._statusData(sc.status || {}, false),
    };
    const kinds = (withPopup) => [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action (page, link, action…)" }, ...(withPopup ? [{ value: "popup", label: "Popup on this browser only (browser_mod)" }] : []), { value: "reload", label: "Reload this page" }, { value: "back", label: "Back to where you were" }];
    const schema = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "shown", selector: { boolean: {} } },
      { name: "tap_kind", selector: { select: { options: kinds(true), mode: "dropdown" } } },
      ...(data.tap_kind === "action" ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
      ...(data.tap_kind === "popup" ? [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }] : []),
      { name: "hold_kind", selector: { select: { options: kinds(false), mode: "dropdown" } } },
      ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
      ...this._statusSchema(sc.status || {}, false),
    ];
    body.appendChild(this._form(schema, data, LBL, (v) => {
      const nx = { name: v.name || "", icon: v.icon || "" };
      if (v.shown === false) nx.hidden = true; // test10: kept with all its settings, not drawn in the Overlay Bar
      if (v.tap_kind === "reload" || v.tap_kind === "back") nx.tap_action = { action: v.tap_kind };
      else if (v.tap_kind === "action") nx.tap_action = v.tap_action && v.tap_action.action ? v.tap_action : { action: "navigate", navigation_path: "/" };
      else if (v.tap_kind === "popup") nx.tap_action = { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(v.popup_title ? { title: v.popup_title } : {}), content: v.popup_card || { type: "markdown", content: "Pick a card" } } } };
      if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
      else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
      const st = this._statusFrom(v, false);
      if (st) nx.status = st;
      const redraw = (v.shown !== false) !== data.shown || v.tap_kind !== data.tap_kind || v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
      save({ ...b, shortcuts: shortcuts.map((x, j) => (j === i ? nx : x)) }, redraw);
    }));
    body.insertAdjacentHTML("beforeend", `<div class="btns"><button data-bmv="-1" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon>Up</button><button data-bmv="1" ${i === shortcuts.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon>Down</button><button class="del" data-bdel="1"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button></div>`);
    for (const el of body.querySelectorAll("[data-bmv]")) el.addEventListener("click", () => {
      const j = i + Number(el.dataset.bmv);
      const next = [...shortcuts];
      [next[i], next[j]] = [next[j], next[i]];
      this._bopen = `s:${j}`;
      save({ ...b, shortcuts: next });
    });
    body.querySelector("[data-bdel]").addEventListener("click", () => {
      this._bopen = null;
      save({ ...b, shortcuts: shortcuts.filter((x, j) => j !== i) });
    });
  },

  /** Light scenes on this floor (floor menu) and on every floor (card settings). */
  _renderScenes() {
    this._scenesIn("#scenes", null);
    this._scenesIn("#scenes_f", this._curFloor());
  },

  _scenesIn(sel, scope) {
    const box = this.querySelector(sel);
    if (!box) return;
    const curList = () => { const l = (this._config.lights || {}).scenes; return Array.isArray(l) ? l : []; }; // read fresh: edits save without a redraw
    const idx = curList().map((_x, i) => i).filter((i) => this._inScope(curList()[i], scope));
    const setList = (next, sections = true) => {
      const lights = { ...(this._config.lights || {}), scenes: next };
      if (!next.length) delete lights.scenes;
      if (sections) {
        this._set({ ...this._config, lights }, { devices: false, sections: true });
      } else {
        this._config = this._prune({ ...this._config, lights });
        this._emit();
      }
    };
    box.innerHTML = idx.map((i) => [curList()[i], i]).map(([s, i]) => `<div class="row" data-i="${i}"><button class="hd" data-sopen="${i}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || `Scene ${i + 1}`)}<small style="margin-left:auto">${s.entity ? cesc(s.entity) : `${(s.lights || []).length} lights${s.states ? " · saved state" : ""}`}</small></button>${this._sopen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-sadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add scene</button>`;
    box.querySelector("[data-sadd]").addEventListener("click", () => {
      this._sopen = curList().length;
      setList([...curList(), { name: curList().length ? `Scene ${curList().length + 1}` : "Movie night", icon: "mdi:movie-open-outline", lights: [], brightness: 30, ...(scope ? { plans: [scope] } : {}) }]);
    });
    for (const b of box.querySelectorAll("[data-sopen]")) b.addEventListener("click", () => {
      const i = Number(b.dataset.sopen);
      this._sopen = this._sopen === i ? null : i;
      this._renderScenes();
    });
    const body = this._sopen != null && box.querySelector(`.row[data-i="${this._sopen}"] .body`);
    if (!body) return;
    const i = this._sopen;
    const s = curList()[i];
    body.appendChild(this._form(
      [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "lights", selector: { entity: { multiple: true, filter: [{ domain: "light" }, { domain: "switch" }] } } },
        { name: "brightness", selector: { number: { min: 0, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "entity", selector: { entity: { filter: [{ domain: "scene" }, { domain: "script" }] } } },
        { name: "plans", selector: { select: { options: planSensors(this._hass).map((x) => ({ value: x.attributes.plan_id, label: x.attributes.plan_name || x.attributes.plan_id })), multiple: true, mode: "list" } } },
      ],
      { lights: [], brightness: 50, plans: [], ...s },
      { name: "Button name", icon: "Icon", lights: "Lights in this scene", brightness: "Brightness (0 = off), unless the state is saved below", entity: "…or run a Home Assistant scene / script instead", plans: "Floors (none ticked = every floor)" },
      (v) => {
        const next = curList().map((x, j) => (j === i ? { ...v, ...(x.states ? { states: x.states } : {}) } : x));
        if (!next[i].entity) delete next[i].entity;
        if (!(next[i].plans || []).length) delete next[i].plans;
        if (JSON.stringify(next[i].plans || []) !== JSON.stringify(s.plans || [])) return setList(next);
        if (next[i].states) for (const e of Object.keys(next[i].states)) if (!(next[i].lights || []).includes(e)) delete next[i].states[e];
        setList(next, false);
        const hd = box.querySelector(`.row[data-i="${i}"] .hd`);
        if (hd) hd.innerHTML = `<ha-icon icon="${cesc(v.icon || "mdi:palette-outline")}"></ha-icon>${cesc(v.name || `Scene ${i + 1}`)}`;
      },
    ));
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.innerHTML = `<button class="cap"><ha-icon icon="mdi:camera-outline"></ha-icon>Save the lights' current state</button>${s.states ? `<button class="clr"><ha-icon icon="mdi:close"></ha-icon>Forget saved state</button>` : ""}<button class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove scene</button>`;
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = s.states ? `Saved: on/off, brightness and colour of ${Object.keys(s.states).length} light(s).` : "Tip: set the lights the way you want them, then save their current state.";
    btns.querySelector(".cap").addEventListener("click", () => {
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      const sc = { ...cur[i] };
      const states = {};
      for (const e of sc.lights || []) {
        const st = this._hass.states[e];
        if (!st) continue;
        if (st.state !== "on") {
          states[e] = { state: "off" };
          continue;
        }
        const a = st.attributes || {};
        const w = { state: "on" };
        if (num(a.brightness)) w.brightness_pct = Math.round((a.brightness / 255) * 100);
        if (a.color_mode === "color_temp" && a.color_temp_kelvin) w.color_temp_kelvin = a.color_temp_kelvin;
        else if (Array.isArray(a.rgb_color) && a.color_mode && a.color_mode !== "brightness" && a.color_mode !== "onoff") w.rgb_color = a.rgb_color;
        states[e] = w;
      }
      sc.states = states;
      setList(cur.map((x, j) => (j === i ? sc : x)));
    });
    const clr = btns.querySelector(".clr");
    if (clr) clr.addEventListener("click", () => {
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      setList(cur.map((x, j) => {
        if (j !== i) return x;
        const y = { ...x };
        delete y.states;
        return y;
      }));
    });
    btns.querySelector(".del").addEventListener("click", () => {
      this._sopen = null;
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      setList(cur.filter((_x, j) => j !== i));
    });
    body.appendChild(btns);
    body.appendChild(note);
  },

  // ---- rooms (#53)
  /** The areas of the floor picked in the tabs (0.8.1: Rooms are set per floor). */
  _floorAreas() {
    const ids = this._planIds();
    const id = ids[Math.min(this._ftab || 0, Math.max(0, ids.length - 1))];
    const sen = planSensors(this._hass).find((x) => x.attributes.plan_id === id);
    return sen ? sen.attributes.areas || {} : {};
  },

  _renderRooms() {
    const r0 = this._config.rooms || {};
    const r = { style: "label", size: "m", hidden: [], names: {}, ...r0, show_in: Array.isArray(r0.show_in) ? r0.show_in.map((o) => (o === "plan" ? "live" : o)) : ["live"] };
    const save = (patch) => {
      this._config = this._prune({ ...this._config, rooms: { ...r, ...(this._config.rooms || {}), ...patch } });
      this._emit();
    };
    // Whole card: how names look and where they show.
    const g = this.querySelector("#roomsg");
    if (g) {
      g.innerHTML = "";
      g.appendChild(this._form(
        [
          { name: "show_in", selector: { select: { options: this._ovOptions(), multiple: true, mode: "list" } } },
          { name: "style", selector: { select: { options: [{ value: "label", label: "Text only" }, { value: "pill", label: "Text on a chip" }, { value: "pill_icon", label: "Chip with the room's icon" }], mode: "dropdown" } } },
          { name: "size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
        ],
        { show_in: r.show_in, style: r.style, size: r.size },
        { show_in: "Room names shown by default in (viewers can switch them under Layers)", style: "Style", size: "Size" },
        (v) => save({ show_in: v.show_in, style: v.style, size: v.size }),
      ));
    }
    // This floor: custom names and hidden Rooms (other floors' choices are kept).
    const box = this.querySelector("#rooms");
    if (!box) return;
    box.innerHTML = "";
    const areas = this._floorAreas();
    if (!Object.keys(areas).length) {
      box.innerHTML = `<p>No Rooms on this floor yet. Place them in the Floorplan Editor (step Rooms).</p>`;
      return;
    }
    const here = Object.keys(areas);
    const roomOpts = Object.entries(areas).map(([value, a]) => ({ value, label: a.name }));
    const labels = { hidden: "Hide these Rooms on the card" };
    for (const [id, a] of Object.entries(areas)) labels[id] = `${a.name}: name on the card`;
    const names0 = r.names || {};
    box.appendChild(this._form(
      [
        { name: "hidden", selector: { select: { options: roomOpts, multiple: true, mode: "dropdown" } } },
        { type: "expandable", name: "names", title: "Custom Room names", schema: here.map((id) => ({ name: id, selector: { text: {} } })) },
      ],
      { hidden: (r.hidden || []).filter((h) => here.includes(h)), names: Object.fromEntries(here.filter((k) => names0[k]).map((k) => [k, names0[k]])) },
      labels,
      (v) => {
        const cur = this._config.rooms || {};
        const names = Object.fromEntries(Object.entries(cur.names || {}).filter(([k]) => !here.includes(k)));
        for (const [k, n] of Object.entries(v.names || {})) if (n) names[k] = n;
        const hidden = [...(cur.hidden || []).filter((h) => !here.includes(h)), ...(v.hidden || [])];
        save({ names, hidden });
      },
    ));
  },
});
Object.assign(DeviceFloorplanCardEditor.prototype, {

  // ---- devices (#52)
  _renderDevices() {
    const box = this.querySelector("#devs");
    if (!box) return;
    const p = this._plan();
    const fov = this.querySelector("#fov");
    if (!p) {
      box.innerHTML = `<p>Choose a plan first.</p>`;
      return;
    }
    const a = p.attributes;
    const eng = this._engine();
    const ovs = eng._overlays().filter((o) => o !== "plan");
    if (fov) {
      if (this._fov && !ovs.includes(this._fov)) this._fov = "";
      fov.innerHTML = `<option value="">All overlays</option>${ovs.map((o) => `<option value="${cesc(o)}" ${this._fov === o ? "selected" : ""}>Only in ${cesc(eng._ovDef(o).label)}</option>`).join("")}`;
    }
    const items = eng._items(a).map((it) => ({ ...it, label: it.bond || (it.parts && it.parts.length) ? `${it.name} (bonded)` : it.phantom ? `${it.name} (phantom)` : it.name }));
    // 0.10: robots on the plan's robot list but not placed: their name and icon are set here too.
    const known = new Set(items.flatMap((it) => [it.main_entity, ...(it.entities || [])]));
    for (const eid of Object.keys(a.robots || {})) {
      if (known.has(eid) || !this._hass.states[eid]) continue;
      const nm = this._hass.states[eid].attributes.friendly_name || eid;
      items.push({ id: `robot:${eid}`, name: nm, main_entity: eid, entities: [eid], label: `${nm} (robot)` });
    }
    items.sort((x, y) => x.label.localeCompare(y.label));
    const devs = this._config.devices || {};
    const info = (it) => ovs.map((o) => {
      const e = this._eng || eng; // fresh after each change
      let specs = [];
      try {
        specs = e._specsFor(it, o, true);
      } catch (_err) {
        specs = [];
      }
      const q = specs.length > 0 && !specs.every((s) => s.offlineOnly); // "only when offline" isn't worth an icon
      return { o, q, hidden: q && e._hidden(it, o) };
    }).filter((x) => x.q);
    const shown = items.filter((i) => (!this._flt || i.label.toLowerCase().includes(this._flt) || (devs[i.id] && (devs[i.id].name || "").toLowerCase().includes(this._flt))) && (!this._fov || info(i).some((x) => x.o === this._fov && !x.hidden)));
    box.innerHTML = shown.map((i) => {
      const o = devs[i.id] || {};
      const custom = Object.keys(o).length;
      const icons = info(i).map((x) => `<ha-icon class="${x.hidden ? "off" : ""}" icon="${cesc(eng._ovDef(x.o).icon)}" title="${cesc(eng._ovDef(x.o).label)}${x.hidden ? " (hidden)" : ""}"></ha-icon>`).join("");
      return `<div class="dev ${custom ? "custom" : ""}" data-id="${cesc(i.id)}"><button data-open="${cesc(i.id)}"><ha-icon icon="${cesc(o.icon || (this._open === i.id ? "mdi:chevron-down" : "mdi:chevron-right"))}"></ha-icon><span class="nm">${cesc(o.name || i.label)}</span><span class="ovs">${icons}</span></button>${this._open === i.id ? `<div class="body"></div>` : ""}</div>`;
    }).join("") || `<p>No devices match.</p>`;
    for (const b of box.querySelectorAll("[data-open]")) {
      b.addEventListener("click", () => {
        this._open = this._open === b.dataset.open ? null : b.dataset.open;
        this._renderDevices();
      });
    }
    const body = this._open && box.querySelector(`.dev[data-id="${CSS.escape(this._open)}"] .body`);
    if (!body) return;
    const item = items.find((x) => x.id === this._open);
    this._markerPanel(body, item, a, eng, ovs, {
      saved: () => {
        const row = box.querySelector(`.dev[data-id="${CSS.escape(item.id)}"]`);
        if (!row) return;
        const cur = (this._config.devices || {})[item.id] || {};
        row.querySelector(".nm").textContent = cur.name || item.label;
        row.querySelector(".ovs").innerHTML = info(item).map((x) => `<ha-icon class="${x.hidden ? "off" : ""}" icon="${cesc(eng._ovDef(x.o).icon)}"></ha-icon>`).join("");
      },
      rerender: () => this._renderDevices(),
    });
  },

  /** Save per-device card settings (devices.<id>), dropping empty values. */
  _saveDev(id, patch) {
    const cur = { ...((this._config.devices || {})[id] || {}), ...patch };
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (v === "" || v == null || v === false || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) delete cur[k];
    }
    const all = { ...(this._config.devices || {}) };
    if (Object.keys(cur).length) all[id] = cur;
    else delete all[id];
    this._config = this._prune({ ...this._config, devices: all });
    this._emit();
    this._engine(true);
  },

  _entName(e) {
    return entName(this._hass, e);
  },

  /** Save one overlay's settings of a device: devices.<id>.per.<ov> (#100/#101). */
  /** 0.12.5: "Shows as On when [entity] is [value]" and "Highlight when [entity] is [value] [x] only while On".
   *  The device's own entities first, by short name with their value; the values offered are the entity's real ones
   *  (now + the last 7 days); numbers get "above …". Stored as when / when_on / hl / hl_on / hl_any (Live). */
  _picBox(item, id, p0, done) {
    const hass = this._hass;
    const box = document.createElement("div");
    box.className = "picbox";
    const devIds = item.bond ? item.members || [] : [item.id];
    const reg = hass.entities || {};
    const devNames = devIds.map((d) => (hass.devices || {})[d]).filter(Boolean).map((dv) => dv.name_by_user || dv.name).filter(Boolean).sort((x, y) => y.length - x.length);
    const own = Object.values(reg).filter((r) => r.device_id && devIds.includes(r.device_id) && !r.hidden && hass.states[r.entity_id]).map((r) => r.entity_id);
    if (String(item.id).startsWith("entity:") && item.main_entity) own.push(item.main_entity);
    const short = (e) => {
      let n = entName(hass, e);
      for (const dn of devNames) if (n.toLowerCase().startsWith(dn.toLowerCase())) n = n.slice(dn.length).replace(/^[\s\-_·:]+/, "");
      return n || e;
    };
    const val = (e) => {
      const st = hass.states[e];
      if (!st) return "";
      const u = st.attributes.unit_of_measurement;
      return `${st.state}${u ? ` ${u}` : ""}`;
    };
    this._picVals = this._picVals || {};
    const values = (e) => {
      if (!e || !hass.states[e]) return [];
      if (!this._picVals[e]) {
        this._picVals[e] = [];
        hass
          .callWS({ type: "history/history_during_period", start_time: new Date(Date.now() - 7 * 864e5).toISOString(), entity_ids: [e], minimal_response: true, no_attributes: true, significant_changes_only: false })
          .then((r) => {
            this._picVals[e] = [...new Set(((r && r[e]) || []).map((x) => x.s))];
            done();
          })
          .catch(() => {});
      }
      return [...new Set([hass.states[e].state, ...this._picVals[e]])].filter((v) => v != null && !["unavailable", "unknown", ""].includes(v));
    };
    const sentence = (title, eKey, vKey, def) => {
      // 0.12.8: the picture has no "Follows" line: an entity picked there before (lead) is its "Shows as On when".
      const e = p0[eKey] || (eKey === "when" ? p0.lead || "" : "");
      const ents = [...new Set([...own, ...(e ? [e] : [])])].sort((x, y) => short(x).localeCompare(short(y)));
      const opts = ents.map((x) => `<option value="${cesc(x)}" ${x === e ? "selected" : ""}>${cesc(short(x))} · ${cesc(val(x))}</option>`).join("");
      const cur = e || def || "";
      const num0 = cur && hass.states[cur] && num(hass.states[cur].state);
      const v = p0[vKey] || "";
      const vals = cur ? values(cur) : [];
      const vsel = num0
        ? `<span class="pv">above <input type="number" data-pv="${vKey}" value="${cesc(v.startsWith(">") ? v.slice(1) : "")}" placeholder="0" style="width:6em"></span>`
        : `<select data-pv="${vKey}"><option value="">on / open / home… (automatic)</option>${vals.map((x) => `<option value="${cesc(x)}" ${x === v ? "selected" : ""}>${cesc(x)}</option>`).join("")}${v && !vals.includes(v) ? `<option value="${cesc(v)}" selected>${cesc(v)}</option>` : ""}</select>`;
      const defName = def ? `Automatic: ${short(def)} · ${val(def)}` : "Automatic: its own state";
      return `<div class="mpr pics"><span class="mpk">${title}</span>
        <select data-pe="${eKey}"><option value="">${eKey === "hl" ? "Automatic: while it is On" : cesc(defName)}</option><optgroup label="${cesc(devNames[0] || "This device")}">${opts}</optgroup><option value="__other">Another entity…</option></select>
        ${cur ? `<span class="pis">is</span>${vsel}` : ""}<div class="pother" data-po="${eKey}" hidden></div></div>`;
    };
    box.innerHTML = `${sentence("Shows as On when", "when", "when_on", item.main_entity || "")}
      ${sentence("Highlight when", "hl", "hl_on", "")}
      ${p0.hl ? `<label class="mpr mpsw"><span class="mpk">Only while it is On</span><input type="checkbox" data-pany ${p0.hl_any ? "" : "checked"}></label>` : ""}`;
    const save = (patch) => {
      this._savePer(id, "live", patch);
      done();
    };
    for (const sel of box.querySelectorAll("[data-pe]")) sel.addEventListener("change", () => {
      const k = sel.dataset.pe;
      const vk = k === "hl" ? "hl_on" : "when_on";
      if (sel.value === "__other") {
        const po = box.querySelector(`[data-po="${k}"]`);
        po.hidden = false;
        po.appendChild(this._form([{ name: "e", selector: { entity: {} } }], { e: "" }, { e: "Any entity" }, (v) => save({ [k]: v.e || "", [vk]: "", ...(k === "when" ? { lead: "" } : {}) })));
        return;
      }
      save({ [k]: sel.value, [vk]: "", ...(k === "when" ? { lead: "" } : {}) }); // 0.12.8: one place decides
    });
    for (const el of box.querySelectorAll("[data-pv]")) el.addEventListener("change", () => {
      const k = el.dataset.pv;
      save({ [k]: el.tagName === "INPUT" ? (el.value === "" ? "" : `>${el.value}`) : el.value });
    });
    const any = box.querySelector("[data-pany]");
    if (any) any.addEventListener("change", () => save({ hl_any: !any.checked }));
    return box;
  },

  _savePer(id, ov, patch) {
    const cur = (this._config.devices || {})[id] || {};
    const per = { ...(cur.per || {}) };
    const o = { ...(per[ov] || {}), ...patch };
    for (const k of Object.keys(o)) if (o[k] === "" || o[k] == null || o[k] === false || (Array.isArray(o[k]) && !o[k].length && k !== "extras") || (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k];
    if (Object.keys(o).length) per[ov] = o;
    else delete per[ov];
    this._saveDev(id, { per });
  },

  /** 0.12.6: a device's entities for the marker settings: its own (by short name, with value), the candidates. */
  _entTools(item) {
    const hass = this._hass;
    const devIds = item.bond ? item.members || [] : [item.id];
    const reg = hass.entities || {};
    const devNames = devIds.map((d) => (hass.devices || {})[d]).filter(Boolean).map((dv) => dv.name_by_user || dv.name).filter(Boolean).sort((x, y) => y.length - x.length);
    const own = Object.values(reg).filter((r) => r.device_id && devIds.includes(r.device_id) && !r.hidden && hass.states[r.entity_id]).map((r) => r.entity_id);
    const cands = item.phantom ? [] : [...new Set([...(item.entities || []), ...(item.allEntities || []), item.main_entity, ...own].filter((e) => e && hass.states[e]))];
    const short = (e) => {
      let n = entName(hass, e);
      for (const dn of devNames) if (n.toLowerCase().startsWith(dn.toLowerCase())) n = n.slice(dn.length).replace(/^[\s\-_·:]+/, "");
      return n || entName(hass, e) || e;
    };
    const val = (e) => {
      const st = hass.states[e];
      if (!st) return "—";
      if (NO_VALUE.has(domainOf(e))) return "no value";
      const u = st.attributes.unit_of_measurement;
      return `${st.state}${u ? ` ${u}` : ""}`;
    };
    const aux = (e) => this._engine()._aux(e);
    return { own, cands, short, val, aux, devName: devNames[0] || "" };
  },

  /** 0.12.6: one entity choice as a plain drop-down: the closed box always shows the current choice (or what
   *  "automatic" uses), entities by short name with their value, "Another entity…" for anything else. */
  _entSelect(T, { cur, autoText, list, none = null, onPick }) {
    const w = document.createElement("div");
    w.className = "mpsel";
    const ents = [...new Set([...list, ...(cur ? [cur] : [])])].sort((x, y) => T.short(x).localeCompare(T.short(y)));
    const head = none != null ? `<option value="">${cesc(none)}</option>` : `<option value="">${cesc(autoText || "Automatic")}</option>`;
    w.innerHTML = `<select>${head}${ents.map((e) => `<option value="${cesc(e)}" ${e === cur ? "selected" : ""}>${cesc(T.short(e))} · ${cesc(T.val(e))}</option>`).join("")}<option value="__other">Another entity…</option></select><div class="mpo" hidden></div>`;
    const sel = w.querySelector("select");
    sel.addEventListener("change", () => {
      if (sel.value === "__other") {
        const po = w.querySelector(".mpo");
        po.hidden = false;
        po.appendChild(this._form([{ name: "e", selector: { entity: {} } }], { e: "" }, { e: "Any entity" }, (v) => v.e && onPick(v.e)));
        return;
      }
      onPick(sel.value);
    });
    return w;
  },

  /** 0.12.6 marker settings (#108 reworked): overlay chips on top; the chosen overlay's settings as sentences that
   *  always show their current value ("automatic" says what it uses); then the settings for every overlay.
   *  Only settings that do something are shown, and they say what the plan really draws. */
  _markerPanel(body, item, a, eng, ovs, { saved = () => {}, rerender = () => {}, current = null, onOv = null } = {}) {
    const id = item.id;
    const hass = this._hass;
    const dev = () => (this._config.devices || {})[id] || {};
    const done = () => {
      saved();
      rerender();
    };
    const T = this._entTools(item);
    const name = dev().name || item.name;
    // Which overlays can show it: by their rules (hide), or by your choice (Live and own overlays: add).
    const stOf = (o) => {
      eng._ignoreAdded = true;
      let q = false;
      try {
        q = eng._qualifies(item, o, a);
      } finally {
        eng._ignoreAdded = false;
      }
      const def = eng._ovDef(o) || {};
      if (q) return eng._hidden(item, o) ? "hidden" : "shown";
      // 0.12.9: offered only when it has something to draw (not a dongle with settings entities only).
      if (o === "live" || def.custom) return eng._added(item, o) ? "added" : eng._addedLead(item) ? "off" : "na";
      return "na";
    };
    const avail = ovs.filter((o) => stOf(o) !== "na");
    let ov = this._mpOv && this._mpOv.id === id && !onOv ? this._mpOv.ov : current;
    if (!ov || !avail.includes(ov)) ov = (current && avail.includes(current) && current) || avail.find((o) => ["shown", "added"].includes(stOf(o))) || avail[0] || null;
    const pickOv = (o) => {
      if (onOv) return onOv(o);
      this._mpOv = { id, ov: o };
      rerender();
    };
    const per = () => (ov && (dev().per || {})[ov]) || {};
    body.innerHTML = "";
    const root = document.createElement("div");
    root.className = "mp";
    body.appendChild(root);
    const labelOf = (o) => (this._config.overlay_names || {})[o] || (eng._ovDef(o) || {}).label || o;
    const ST = { shown: "shown", hidden: "hidden here", added: "added by you", off: "not shown" };
    root.innerHTML = `<style>${MP_CSS}</style><div class="mpchips">${avail.map((o) => `<button class="mpc ${stOf(o)} ${o === ov ? "cur" : ""}" data-ov="${cesc(o)}" title="${cesc(`${labelOf(o)}: ${ST[stOf(o)]}`)}"><ha-icon icon="${cesc((eng._ovDef(o) || {}).icon || "mdi:layers")}"></ha-icon>${cesc(labelOf(o))}</button>`).join("") || `<p class="mpn">No overlay on this card shows this device.</p>`}</div>`;
    for (const b of root.querySelectorAll("[data-ov]")) b.addEventListener("click", () => pickOv(b.dataset.ov));
    // A sentence: label, the current value (with "automatic"), and its control under it.
    // 0.12.7: dd = a drop-down under it shows the value, so the label line keeps only the "automatic" tag.
    const row = (label, value, auto, ctrl, dd = false) => {
      const r = document.createElement("div");
      r.className = "mpr";
      r.innerHTML = `<div class="mpl"><span class="mpk">${cesc(label)}</span><span class="mpv">${dd ? "" : value}${auto ? ` <small>automatic</small>` : ""}</span></div>`;
      if (ctrl) r.appendChild(ctrl);
      return r;
    };
    const sec = document.createElement("div");
    sec.className = "mps";
    root.appendChild(sec);
    if (ov) {
      const st = stOf(ov);
      const lbl = labelOf(ov);
      const shown = st === "shown" || st === "added";
      sec.insertAdjacentHTML("beforeend", `<p class="mpfor">These settings are for <b>${cesc(lbl)}</b> only</p>`);
      // 1. Show in this overlay.
      const sw = document.createElement("label");
      sw.className = "mpr mpsw";
      sw.innerHTML = `<span class="mpk">Show here <small>${st === "added" || st === "off" ? "(you add it)" : `(${cesc(lbl)} shows it by itself)`}</small></span><ha-switch></ha-switch>`;
      const hs = sw.querySelector("ha-switch");
      hs.checked = shown;
      hs.addEventListener("change", () => {
        const add = st === "added" || st === "off";
        const key = add ? "add_to" : "hide_in";
        const set = new Set(dev()[key] || []);
        if (add === hs.checked) set.add(ov);
        else set.delete(ov);
        this._saveDev(id, { [key]: [...set] });
        done();
      });
      sec.appendChild(sw);
      if (shown && ov !== "network") this._mpOverlay(sec, row, { item, id, a, eng, ov, lbl, per, dev, T, name, done, saved, rerender });
    }
    // On every overlay: name, the value of several sensors, temperatures for Comfort.
    const all = document.createElement("details");
    all.className = "mpall";
    all.innerHTML = `<summary>For all overlays</summary>`;
    root.appendChild(all);
    all.appendChild(this._form([{ name: "name", selector: { text: {} } }], { name: dev().name || "" }, { name: `Name on the card (automatic: ${item.name})` }, (v) => {
      this._saveDev(id, { name: v.name });
      saved();
    }));
    const sensEnts = [...new Set([...(item.entities || []), ...(item.allEntities || [])])].filter((e) => ["temperature", "humidity"].includes(kindOf(e, hass.states[e])));
    if ((item.bond || item.phantom) && sensEnts.length > 1) {
      const schema = [{ name: "value", selector: { select: { options: [{ value: "default", label: "Automatic (Comfort setting, or the Editor's choice for phantoms)" }, { value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }, { value: "one", label: "One sensor" }], mode: "dropdown" } } }];
      if (dev().value === "one") schema.push({ name: "one", selector: { select: { options: sensEnts.map((e) => ({ value: e, label: `${T.short(e)} · ${T.val(e)}` })), mode: "dropdown" } } });
      all.appendChild(this._form(schema, { value: dev().value || "default", one: dev().one }, { value: "Value on the plan", one: "Which sensor" }, (v) => {
        const prevOne = dev().value === "one";
        this._saveDev(id, { value: v.value === "default" ? "" : v.value, one: v.value === "one" ? v.one : "" });
        if ((v.value === "one") !== prevOne) rerender();
        else saved();
      }));
    }
    if (!item.phantom && T.cands.some((e) => domainOf(e) === "climate")) {
      all.appendChild(this._form([{ name: "own", selector: { boolean: {} } }], { own: dev().own_temp !== "off" }, { own: "Count this unit's own temperature in Comfort and the heatmap (a bonded room thermometer always wins)" }, (v) => {
        this._saveDev(id, { own_temp: v.own ? "" : "off" });
        saved();
      }));
    }
    // 0.12.9: only where Comfort doesn't use its temperature by itself (a thermometer needs no switch).
    const ownT = (item.entities || []).filter((e) => kindOf(e, hass.states[e]) === "temperature" && !T.aux(e));
    const usedT = ownT.some((e) => ambientTemp(e, hass.states[e], item));
    if (ownT.length && !usedT && !item.bond && !item.phantom) {
      all.appendChild(this._form([{ name: "comfort", selector: { boolean: {} } }], { comfort: !!dev().comfort }, { comfort: "Use its temperature in Comfort (even if it's a device's internal sensor)" }, (v) => {
        this._saveDev(id, { comfort: v.comfort });
        saved();
      }));
    }
    // 0.12.7: open when it holds only the name; folded (as you left it) when there is more.
    all.open = all.querySelectorAll("ha-form").length <= 1 || !!this._mpAllOpen;
    all.addEventListener("toggle", () => (this._mpAllOpen = all.open));
  },

  /** 0.12.6: the settings of one shown overlay, in reading order. */
  _mpOverlay(sec, row, { item, id, eng, ov, per, dev, T, name, done, saved }) {
    const hass = this._hass;
    const p0 = per();
    const camE = ov === "live" && eng._camOf(item);
    const picE = ov === "live" && !!item.pic;
    // What the plan draws now (the hidden-when-off ones as they would be drawn).
    let sp = null;
    try {
      sp = eng._specsFor(item, ov, false).find((x) => x && x.item) || eng._selSpec(item, ov, name)[0] || null;
    } catch (_e) {
      sp = null;
    }
    // 0.12.9: Health without a battery draws only its "Offline" chip, while it is offline.
    const hOff = ov === "health" && !!(sp && sp.offline);
    // 2. Follows (0.12.8): only where the followed entity changes the marker (Live, Lights, Security, own overlays),
    // only with a real choice, never a settings / technical entity. A picture says it in "Shows as On when".
    const defO = eng._ovDef(ov) || {};
    const follows = ["live", "lights", "security"].includes(ov) || !!defO.custom;
    const health = ov === "health"; // 0.12.9: Health follows a battery (its own, under Diagnostic, or another)
    const fits = (e) => {
      if (health) return kindOf(e, hass.states[e]) === "battery";
      if (T.aux(e) || NO_VALUE.has(domainOf(e))) return false;
      const dm = domainOf(e);
      if (ov === "lights") return ["light", "switch"].includes(dm);
      if (ov === "security") return ["binary_sensor", "lock", "cover", "alarm_control_panel", "camera"].includes(dm);
      return dm !== "sensor" || READ_KIND.has(kindOf(e, hass.states[e]));
    };
    const fcands = T.cands.filter(fits);
    const autoH = health ? (item.roles && item.roles.battery && fits(item.roles.battery) && T.aux(item.roles.battery) && item.roles.battery) || T.cands.find((e) => fits(e) && T.aux(e)) || null : null;
    const autoF = health ? autoH : sp && sp.eid && hass.states[sp.eid] && !T.aux(sp.eid) ? sp.eid : null;
    if ((follows || health) && !picE && !item.bond && !item.phantom && !camE && (fcands.some((e) => e !== autoF) || (p0.lead && !fcands.includes(p0.lead))) && (autoF || p0.lead || health)) {
      const auto = autoF && autoF !== p0.lead ? autoF : null;
      const cur = p0.lead || "";
      const none = health ? "no battery of its own" : "its own state";
      const val = cur ? `${cesc(T.short(cur))} · ${cesc(T.val(cur))}` : auto ? `${cesc(T.short(auto))} · ${cesc(T.val(auto))}` : none;
      sec.appendChild(row("Follows", val, !cur, this._entSelect(T, { cur, autoText: `Automatic: ${auto ? `${T.short(auto)} · ${T.val(auto)}` : none}`, list: fcands, onPick: (e) => {
        const x0 = per().extras;
        this._savePer(id, ov, { lead: e || "", ...(Array.isArray(x0) ? { extras: x0.filter((x) => x !== e) } : {}) });
        done();
      } }), true));
    }
    // Bonds: on if any is on, or how many (only where on / off changes the marker).
    if (item.bond && follows) {
      const cur = p0.show || item.show || "";
      const s = document.createElement("select");
      const part = eng._lampBond(item) ? "lamp" : "part"; // 0.12.8: "lamp" only for a bond of lamps
      s.innerHTML = `<option value="">if any ${part} is on</option><option value="count" ${cur === "count" ? "selected" : ""}>how many are on (2 of 3)</option>`;
      s.addEventListener("change", () => {
        this._savePer(id, ov, { show: s.value });
        done();
      });
      sec.appendChild(row("Counts as on", "", !p0.show, s, true));
    }
    // 3. Shown as: its own look (picture, chip, touch area, light) or, without one, an icon.
    const body = eng._bodyOf(item);
    const looks = [];
    // 0.12.9: said from what the plan draws: a chip's icon, a camera's dot, Health's offline chip.
    const chipIcon = !!(sp && sp.type === "chip" && (sp.cl2 || (!sp.rd && (sp.icon || sp.icon0))));
    if (picE) looks.push("picture");
    if ((sp && sp.cam) || camE) looks.push("a dot in the camera's colour, its camera beside it when it shows");
    if (hOff) looks.push("an “Offline” chip with its icon, only while it is offline");
    else if (sp && sp.type === "chip") looks.push(sp.rd && !chipIcon ? "chip with its values" : chipIcon ? "chip with its icon" : "chip");
    if (ov === "live" && body && body.touch && !picE) looks.push("touch area");
    // 0.12.7: lamps follow the overlay's "Lights as" (glow only = no icon); a light shape is not a look.
    const glowOnly = !!(sp && sp.kind === "light" && eng._glowOnly(ov) && !looks.length);
    if (glowOnly) looks.push("its glow (Lights as: Glow)");
    const markerIcon = !picE && !camE && !hOff && !(sp && sp.cam) && !glowOnly && !(sp && sp.type === "chip") && !(ov === "live" && body && body.touch);
    const legacyOff = !!p0.noicon && (markerIcon || chipIcon); // only where an icon would be drawn
    const iconDrawn = markerIcon && !legacyOff;
    const shownAs = looks.length ? looks.join(" + ") : "an icon";
    const iconBox = document.createElement("div");
    if (iconDrawn || (chipIcon && !legacyOff)) {
      iconBox.appendChild(this._form([{ name: "icon", selector: { icon: {} } }], { icon: p0.icon || dev().icon || "" }, { icon: "Icon (empty = Home Assistant's own)" }, (v) => {
        this._savePer(id, ov, { icon: v.icon });
        saved();
      }));
    }
    if (legacyOff) {
      iconBox.insertAdjacentHTML("beforeend", `<p class="mpn">The icon is hidden (your earlier choice). <button class="lnk" data-noi="1">Show it again</button></p>`);
      iconBox.querySelector("[data-noi]").addEventListener("click", () => {
        this._savePer(id, ov, { noicon: false });
        done();
      });
    }
    const lookTxt = legacyOff ? (looks.length ? shownAs : "its value, without its icon") : looks.length && !glowOnly && !chipIcon && !picE && !hOff ? `${shownAs} <small>(no icon)</small>` : shownAs;
    sec.appendChild(row("Shown as", lookTxt, false, iconBox.childNodes.length ? iconBox : null));
    if (ov === "health") {
      const only = !!(this._config.health || {}).only_problems;
      const when = hOff ? "only while it is offline" : only ? "only when its battery is low or it is offline (card setting)" : "always (marked when its battery is low)";
      sec.appendChild(row("When it shows", cesc(when), true, null));
    }
    // 4. Also shows: the real lines, with their values, where they are drawn.
    if (!picE || ov !== "live") this._mpExtras(sec, row, { item, id, ov, per, eng, T, sp, camE, done, saved });
    // 5. When it shows (Live): a trigger, when off; a camera's picture; a picture's two sentences.
    if (ov === "live") {
      const added = eng._added(item, "live");
      if (camE) {
        const pops = p0.popup !== "off" && p0.popup !== false;
        const s = document.createElement("select");
        s.innerHTML = `<option value="1">when something happens</option><option value="0" ${pops ? "" : "selected"}>only with Layers → Cameras</option>`;
        s.addEventListener("change", () => {
          this._savePer(id, "live", { popup: s.value === "1" ? "" : "off" });
          done();
        });
        sec.appendChild(row("Shows the camera", "", pops, s, true));
        // 0.13.1: its picture (a still, refreshed) or live video (Home Assistant's camera player).
        {
          const v = document.createElement("select");
          v.innerHTML = `<option value="">Automatic (its picture, refreshed every 10 s)</option><option value="live" ${p0.video === "live" ? "selected" : ""}>Live video</option>`;
          v.addEventListener("change", () => {
            this._savePer(id, "live", { video: v.value });
            done();
          });
          sec.appendChild(row("Shows", "", !p0.video, v, true));
        }
      }
      if (!picE && (!camE || (p0.popup !== "off" && p0.popup !== false))) {
        const autoT = !p0.when ? eng._liveWhen(item) : null;
        const list = T.cands.filter((e) => !NO_VALUE.has(domainOf(e)) || domainOf(e) === "event");
        const auto = camE ? (autoT ? `when ${T.short(autoT)} fires` : "nothing (no sensor of its own)") : added ? "always (you added it)" : `while ${eng._onWords(item, sp)}`;
        const cur = p0.when || "";
        const ctl = this._entSelect(T, { cur, autoText: `Automatic: ${auto}`, list, onPick: (e) => {
          this._savePer(id, "live", { when: e || "" });
          done();
        } });
        sec.appendChild(row("When it shows", "", !cur, ctl, true));
        // 0.13.1: how long it stays after its trigger, for every marker that has one (cameras and any device).
        if (p0.when || (camE && autoT)) {
          const ev = domainOf(p0.when || autoT) === "event";
          const st0 = p0.stay || "";
          const opts = [["", `Automatic (${ev ? "1 min after it fires" : "while it is on, then 30 s"})`], ["on", ev ? "Only briefly (1 min after it fires)" : "Only while it is on"], ["10", "10 s after it ends"], ["30", "30 s after it ends"], ["60", "1 min after it ends"], ["120", "2 min after it ends"], ["300", "5 min after it ends"], ["x", "Until I close it (✕)"]];
          const s2 = document.createElement("select");
          s2.innerHTML = opts.map(([val, lab]) => `<option value="${val}" ${val === st0 ? "selected" : ""}>${cesc(lab)}</option>`).join("");
          s2.addEventListener("change", () => {
            this._savePer(id, "live", { stay: s2.value });
            done();
          });
          sec.appendChild(row("Stays open", "", !st0, s2, true));
        }
      }
      if (picE) sec.appendChild(this._picBox(item, id, p0, done));
      if (!picE && !item.phantom && !camE && (TOGGLE_DOMAINS.has(domainOf(item.main_entity || "")) || item.bond)) {
        const card = (this._config.live || {}).show_off || "hidden";
        const cur = p0.off || "";
        const s = document.createElement("select");
        s.innerHTML = `<option value="">Automatic (${added ? "shown" : card === "faint" ? "faint" : "hidden"})</option><option value="hidden" ${cur === "hidden" ? "selected" : ""}>Hidden</option><option value="faint" ${cur === "faint" ? "selected" : ""}>Faint, so it can be tapped on again</option><option value="shown" ${cur === "shown" ? "selected" : ""}>Shown</option>`;
        s.addEventListener("change", () => {
          this._savePer(id, "live", { off: s.value });
          done();
        });
        const W = { hidden: "hidden", faint: "faint", shown: "shown" };
        sec.appendChild(row("When it is off", W[cur] || "", !cur, s, true));
      }
      if (eng._applOf(item)) {
        sec.appendChild(this._form([
          { name: "pill", selector: { select: { options: [{ value: "auto", label: "For a few minutes after it changes" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }], mode: "dropdown" } } },
          { name: "done_for", selector: { select: { options: [{ value: "30", label: "After 30 minutes" }, { value: "60", label: "After 1 hour" }, { value: "unloaded", label: "Only when unloaded (tap, or the door opens)" }], mode: "dropdown" } } },
        ], { pill: p0.pill || "auto", done_for: p0.done_for || "30" }, { pill: "Status label on the plan", done_for: "“Done” clears by itself" }, (v) => {
          this._savePer(id, ov, { pill: v.pill === "auto" ? "" : v.pill, done_for: v.done_for === "30" ? "" : v.done_for });
          saved();
        }));
      }
    }
    // 6. Tap and long press, in words; try them on the plan.
    this._mpActions(sec, row, { item, id, ov, per, dev, eng, sp, done });
  },

  /** 0.12.6: "Also shows": the lines drawn with the marker, each with its value; a pick the plan can't draw says so. */
  _mpExtras(sec, row, { item, id, ov, per, eng, T, sp, camE, done, saved }) {
    const hass = this._hass;
    const p0 = per();
    const auto = eng._autoReads(item, ov);
    const extras = Array.isArray(p0.extras) ? p0.extras : null;
    const inMarker = new Set([...((sp && (sp.core || sp.ents)) || []), sp && sp.eid, item.bond ? item.main_entity : null, ...(item.bond ? item.entities || [] : [])].filter(Boolean));
    const why = (e) => (!hass.states[e] ? "not shown: it no longer exists" : NO_VALUE.has(domainOf(e)) ? "not shown: it has no value (it is an action)" : inMarker.has(e) ? `not shown: already part of this ${item.bond ? "bond" : "marker"}` : "");
    // 0.12.8: automatic = only what is drawn; your own picks that can't be drawn still say why.
    const listed = (extras || auto.filter((e) => !why(e))).filter((e) => !(camE && domainOf(e) === "camera"));
    const box = document.createElement("div");
    box.className = "mpx";
    const xics = p0.extra_icons || {};
    box.innerHTML = listed.map((e) => {
      const no = why(e);
      const isB = p0.badge === e;
      return `<div class="mpxr ${no ? "no" : ""}"><div class="mpxl"><button class="mpxi" data-xic="${cesc(e)}" title="Icon for this line">${xics[e] ? `<ha-icon icon="${cesc(xics[e])}"></ha-icon>` : `<ha-state-icon data-xent="${cesc(e)}"></ha-state-icon>`}</button><span class="mpxn">${cesc(T.short(e))} · <b>${cesc(T.val(e))}</b>${no ? `<small>${cesc(no)}</small>` : ""}</span>${extras ? `<button class="mpxd" data-xdel="${cesc(e)}" title="Remove">✕</button>` : ""}</div>${no || camE ? "" : `<div class="lbsw" role="group" aria-label="Show as"><button class="${isB ? "" : "on"}" data-xbdg="${cesc(e)}" data-to="label">Label under it</button><button class="${isB ? "on" : ""}" data-xbdg="${cesc(e)}" data-to="badge">Badge on it</button></div>`}</div>`;
    }).join("");
    for (const el of box.querySelectorAll("[data-xent]")) {
      el.hass = hass;
      el.stateObj = hass.states[el.dataset.xent];
    }
    const offer = T.cands.filter((e) => !listed.includes(e) && !inMarker.has(e) && !NO_VALUE.has(domainOf(e)) && !(camE && domainOf(e) === "camera") && (this._xAll || !T.aux(e) || kindOf(e, hass.states[e]) === "battery"));
    const add = this._entSelect(T, { cur: "", none: "+ Add a reading", list: offer, onPick: (e) => {
      if (!e) return;
      this._savePer(id, ov, { extras: [...listed.filter((x) => !why(x)), e] });
      done();
    } });
    box.appendChild(add);
    box.insertAdjacentHTML("beforeend", `<div class="mpa"><button class="lnk" data-xall="1">${this._xAll ? "Hide settings entities" : "Show settings entities too"}</button>${extras ? `<button class="lnk" data-xauto="1">Back to automatic</button>` : ""}</div>`);
    const drawn = listed.filter((e) => !why(e));
    const val = drawn.length ? drawn.map((e) => `${cesc(T.short(e))} <small>(${p0.badge === e ? "badge" : "label"})</small>`).join(", ") : "nothing";
    sec.appendChild(row("Also shows", val, !extras, box));
    for (const b of box.querySelectorAll("[data-xbdg]")) b.addEventListener("click", () => {
      const eid = b.dataset.xbdg;
      const badge = b.dataset.to === "badge" ? eid : per().badge === eid ? "" : per().badge || "";
      this._savePer(id, ov, { badge, extras: listed });
      done();
    });
    for (const b of box.querySelectorAll("[data-xic]")) b.addEventListener("click", () => {
      const eid = b.dataset.xic;
      const old = box.querySelector(".xicf");
      if (old) old.remove();
      const f = document.createElement("div");
      f.className = "xicf";
      f.appendChild(this._form([{ name: "icon", selector: { icon: {} } }], { icon: (per().extra_icons || {})[eid] || "" }, { icon: `Icon for “${T.short(eid)}” (empty = its own)` }, (v) => {
        const ics = { ...(per().extra_icons || {}) };
        if (v.icon) ics[eid] = v.icon;
        else delete ics[eid];
        this._savePer(id, ov, { extra_icons: ics, extras: listed });
        saved();
      }));
      b.closest(".mpxr").after(f);
    });
    for (const b of box.querySelectorAll("[data-xdel]")) b.addEventListener("click", () => {
      this._savePer(id, ov, { extras: listed.filter((e) => e !== b.dataset.xdel), ...(per().badge === b.dataset.xdel ? { badge: "" } : {}) });
      done();
    });
    box.querySelector("[data-xall]").addEventListener("click", () => {
      this._xAll = !this._xAll;
      done();
    });
    const ba = box.querySelector("[data-xauto]");
    if (ba) ba.addEventListener("click", () => {
      this._savePer(id, ov, { extras: null, badge: "" });
      done();
    });
  },

  /** 0.12.6: Tap and Long press, said in words, each changeable (a dashboard / a popup asks for its target). */
  _mpActions(sec, row, { item, id, ov, per, dev, eng, sp, done }) {
    const p0 = per();
    const robot = [item.main_entity, ...(item.entities || [])].some((e) => e && domainOf(e) === "vacuum");
    const s = sp || { type: "dev", item, ents: [item.main_entity].filter(Boolean), eid: item.main_entity, kind: kindOf(item.main_entity, this._hass.states[item.main_entity]) };
    const ov0 = eng._overlay;
    eng._overlay = ov;
    let tapW = "";
    let holdW = "";
    try {
      tapW = eng._actWords(s, false);
      holdW = eng._actWords(s, true);
    } finally {
      eng._overlay = ov0;
    }
    const W = { "switch all": "switches all its lamps", "switch on / off": "switches it on / off", details: "opens its details", "info card": "opens its info card", graphs: "opens its graphs", "readings with history": "opens its readings with history", "open a dashboard": "opens a dashboard", "a popup card": "opens a popup card", "press a button": "presses a button", nothing: "nothing", "robot panel": "opens the robot panel", "network info": "shows its network info" };
    const say = (w) => W[w] || w;
    const mk = (key, pre, opts, cur, words, isHold) => {
      const box = document.createElement("div");
      const src = robot && !isHold ? dev() : { ...dev(), ...p0 };
      const save = (act, v = {}) => {
        const pick = (k, dflt) => (k in v ? v[k] : src[`${pre}${k}`] ?? dflt);
        const extra = { [`${pre}nav`]: act === "navigate" ? pick("nav", "") : "", [`${pre}popup_title`]: act === "popup" ? pick("popup_title", "") : "", [`${pre}popup_card`]: act === "popup" ? pick("popup_card", null) : null, [`${pre}press`]: act === "press" ? pick("press", "") : "", [`${pre}ask`]: act === "press" && pick("ask", true) === false ? false : null };
        if (robot && !isHold) this._saveDev(id, { [key]: act, ...extra });
        else this._savePer(id, ov, { [key]: act, ...extra });
      };
      // 0.12.7: a plain drop-down like the others; "Automatic (what it does)".
      const sel = document.createElement("select");
      sel.innerHTML = opts.map((o) => `<option value="${cesc(o.value)}" ${(cur || "default") === o.value ? "selected" : ""}>${cesc(o.value === "default" ? `Automatic (${say(words)})` : o.label)}</option>`).join("");
      sel.addEventListener("change", () => {
        save(sel.value === "default" ? "" : sel.value);
        done();
      });
      box.appendChild(sel);
      if (cur === "navigate" || cur === "popup") {
        const schema = cur === "navigate" ? [{ name: "nav", selector: { navigation: {} } }] : [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }];
        box.appendChild(this._form(schema, { nav: src[`${pre}nav`] || "", popup_title: src[`${pre}popup_title`] || "", popup_card: src[`${pre}popup_card`] }, { nav: "Dashboard to open", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)" }, (v) => save(cur, v)));
      }
      // 0.13.9.17 #63: which button, and ask first (on by default).
      if (cur === "press") {
        const ents = [...new Set([...(item.entities || []), ...(item.allEntities || [])])].filter((e) => ["button", "input_button"].includes(domainOf(e)));
        box.appendChild(this._form([{ name: "press", selector: { entity: { domain: ["button", "input_button"] } } }, { name: "ask", selector: { boolean: {} } }], { press: src[`${pre}press`] || "", ask: src[`${pre}ask`] !== false }, { press: `Button (empty: ${ents.filter((e) => !/_identify$/.test(e))[0] || "the device's first button"})`, ask: "Ask first" }, (v) => save(cur, v)));
      }
      sec.appendChild(row(isHold ? "Long press" : robot ? "Tap (all overlays)" : "Tap", "", !cur, box, true));
    };
    const tcur = (robot ? dev().tap : p0.tap || dev().tap) || "";
    const topts = robot ? [{ value: "default", label: "" }, ...TAP_OPTIONS.filter((o) => !["toggle", "readings"].includes(o.value))] : [{ value: "default", label: "" }, ...TAP_OPTIONS];
    mk("tap", "", topts, tcur, tapW, false);
    const hcur = p0.hold || dev().hold || "";
    const hopts = [{ value: "default", label: "" }, ...HOLD_OPTIONS.filter((o) => o.value !== "default"), { value: "navigate", label: "Open a dashboard" }, { value: "popup", label: "Popup with a card (browser_mod)" }, { value: "press", label: "Press a button" }];
    mk("hold", "hold_", hopts, hcur, holdW, true);
  },

  /** People in Edit markers (#107): the same fields as card editor → People. */
  _personPanel(body, entity, rerender) {
    const curList = () => Array.isArray(this._config.people) ? this._config.people : []; // read fresh: edits save without a redraw
    const idx = curList().findIndex((x) => x.entity === entity);
    if (idx < 0) {
      body.innerHTML = `<p class="bg-hint">This person isn't in this card's People list.</p>`;
      return;
    }
    const save = (next, extra = {}) => {
      this._config = this._prune({ ...this._config, people: next, ...extra });
      this._emit();
      this._engine(true);
    };
    body.innerHTML = "";
    body.appendChild(this._form([
      { name: "entity", selector: { entity: { domain: "person" } } },
      { name: "room", selector: { entity: {} } },
      { name: "room2", selector: { entity: {} } },
          { name: "distance", selector: { entity: { domain: "sensor", device_class: "distance" } } },
    ], { ...curList()[idx] }, { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (when 1 is unknown or not a room here)", distance: "Distance sensor (Bermuda; test: Network → Bluetooth)" }, (v) => {
      const next = curList().map((x, j) => (j === idx ? { ...x, ...v } : x));
      save(next);
    }));
    const eng = this._engine();
    const ovs = eng._overlays().filter((o) => o !== "plan" && o !== "people" && o !== "live" && o !== "network" && o !== "health");
    body.appendChild(this._form([{ name: "people_in", selector: { select: { options: ovs.map((o) => ({ value: o, label: eng._ovDef(o).label })), multiple: true, mode: "list" } } }], { people_in: this._config.people_in || [] }, { people_in: "People show in Live; also show them in (all people)" }, (v) => save(curList(), { people_in: v.people_in })));
    const del = document.createElement("button");
    del.className = "qbtn";
    del.textContent = "Remove this person from the card";
    del.addEventListener("click", () => {
      save(curList().filter((_x, j) => j !== idx));
      rerender(null);
    });
    body.appendChild(del);
  },

  /** The Marker Editor (#108): the card full-screen; click a marker, settings for THIS overlay. */
  _openBig({ direct = false, onClose = null } = {}) {
    if (this._big) return;
    const wrap = document.createElement("dialog");
    wrap.className = "dfe-big";
    wrap.innerHTML = `<style>${BIG_CSS}</style><div class="bg-h"><b>Card Editor</b><span></span><button class="bg-x" aria-label="Close">${direct ? "Done" : "Close the window and Press Save"}</button></div><div class="bg-b tab-set"><div class="bg-mid"><div class="bg-zoom"><button data-z="-1" aria-label="Zoom out"><ha-icon icon="mdi:minus"></ha-icon></button><span class="bg-zv">100 %</span><button data-z="1" aria-label="Zoom in"><ha-icon icon="mdi:plus"></ha-icon></button><button data-z="0" class="bg-fit" hidden>Fit</button></div><div class="bg-plan"></div></div><div class="bg-pan"><div class="bg-tabs"><button data-bt="set" class="on">Settings</button><button data-bt="side">Markers</button></div><aside class="bg-set"></aside><aside class="bg-side"></aside></div></div>`;
    // Inside HA's card editor dialog everything outside it is inert: keep the big plan inside the
    // editor (still drawn on top, from the top layer). From the ✎ pen the editor isn't on the page.
    (this.isConnected ? this : document.body).appendChild(wrap);
    try {
      wrap.showModal();
    } catch (_e) {
      wrap.setAttribute("open", "");
    }
    for (const ev of ["keydown", "keyup", "keypress"]) wrap.addEventListener(ev, (e) => e.stopPropagation());
    // 0.11.1: the card settings move into the left column (the same sections, moved back on Done).
    const setBox = wrap.querySelector(".bg-set");
    const dfe = this.querySelector(":scope > .dfe");
    const dfeStyle = dfe && dfe.previousElementSibling;
    const dall = dfe && dfe.querySelector("#dall");
    const dallWas = dall ? dall.open : false;
    if (dall) dall.open = true; // all settings open in the Card Editor
    if (dfe) setBox.append(...[dfeStyle, dfe].filter(Boolean));
    else {
      setBox.remove();
      wrap.querySelector(".bg-b").classList.replace("tab-set", "tab-side");
      wrap.querySelector(".bg-tabs").remove();
    }
    const bgB = wrap.querySelector(".bg-b");
    const showTab = (t) => {
      if (!dfe) return;
      bgB.classList.toggle("tab-set", t === "set");
      bgB.classList.toggle("tab-side", t === "side");
      for (const b of wrap.querySelectorAll("[data-bt]")) b.classList.toggle("on", b.dataset.bt === t);
    };
    for (const b of wrap.querySelectorAll("[data-bt]")) b.addEventListener("click", () => showTab(b.dataset.bt));
    // Zoom: the card is drawn wider in its scroll box (its markers and Rooms scale with it); Fit = 100 %.
    let zoom = 1;
    const zv = wrap.querySelector(".bg-zv");
    const fitB = wrap.querySelector(".bg-fit");
    // At 100 % the plan fits the column (height and width); zoomed, it is drawn wider and scrolls.
    const setZoom = (z) => {
      zoom = Math.max(1, Math.min(4, z));
      card._fitHost = zoom === 1;
      card.style.width = `${zoom * 100}%`;
      card.style.height = zoom === 1 ? "100%" : "";
      zv.textContent = `${Math.round(zoom * 100)} %`;
      fitB.hidden = zoom === 1;
      card._update(true);
    };
    for (const b of wrap.querySelectorAll("[data-z]")) b.addEventListener("click", () => setZoom(b.dataset.z === "0" ? 1 : zoom * (b.dataset.z === "1" ? 1.25 : 0.8)));
    wrap.querySelector(".bg-plan").addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return; // ctrl + wheel / trackpad pinch zooms; a plain wheel scrolls
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });
    const card = document.createElement("device-floorplan-card");
    card.setConfig(this._config);
    const fid = this._planIds()[this._ftab || 0];
    if (!direct && fid) card._floor = fid; // 0.8.1: the floor picked in the card editor
    card._fitHost = true;
    card.style.height = "100%";
    card.hass = this._hass;
    wrap.querySelector(".bg-plan").appendChild(card);
    const side = wrap.querySelector(".bg-side");
    this._big = { wrap, card, set: !!dfe };
    let sel = null;
    let q = "";
    const render = (id = sel) => {
      sel = id;
      card._selId = id && !String(id).startsWith("person:") ? id : null;
      card._update(true);
      const a = (card._sensor() || {}).attributes;
      if (!a) return;
      const ov = card._overlay;
      const eng = this._engine();
      const ovs = eng._overlays().filter((o) => o !== "plan");
      const def = eng._ovDef(ov);
      const items = card._items(a);
      // 0.11.1 test8: a strong header like the settings column: title, the overlay as a chip, the count, one line, search.
      const ovName = def ? (this._config.overlay_names || {})[ov] || def.label : "";
      side.innerHTML = `<div class="dcol"><h3><ha-icon icon="mdi:map-marker-multiple-outline"></ha-icon>Markers${def ? `<span class="ovchip"><ha-icon icon="${cesc(def.icon || "mdi:layers")}"></ha-icon>${cesc(ovName)}</span><span class="mkn"></span>` : ""}</h3><p>${ov === "plan" || !def ? "Pick an overlay under the plan to edit its markers." : `Every device in ${cesc(ovName)}. Pick one here or on the plan to change what it shows, its icon and what a tap does.`}</p></div><div class="bg-sel"></div><div class="bg-list"><div class="bg-lh"><input class="bg-q" placeholder="Search…" value="${cesc(q)}"></div><div class="bg-groups"></div></div>`;
      const selBox = side.querySelector(".bg-sel");
      if (id && String(id).startsWith("person:")) {
        selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
        selBox.querySelector(".bg-t span").textContent = entName(this._hass, id.slice(7));
        this._personPanel(selBox.querySelector(".bg-p"), id.slice(7), (x) => render(x));
      } else if (id) {
        const item = items.find((x) => x.id === id);
        if (item) {
          selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
          selBox.querySelector(".bg-t span").textContent = ((this._config.devices || {})[id] || {}).name || item.name;
          this._markerPanel(selBox.querySelector(".bg-p"), item, a, eng, ovs, { current: ov, onOv: (o) => card._setOverlay(o), rerender: () => render(id), saved: () => {
            const nm = side.querySelector(`.lr[data-id="${CSS.escape(id)}"] .lnm`);
            if (nm) nm.innerHTML = `${cesc(((this._config.devices || {})[id] || {}).name || item.name)}${item.bond ? " <small>(bonded)</small>" : item.phantom ? " <small>(phantom)</small>" : ""}`;
          } });
        }
      }
      const c = selBox.querySelector(".bg-c");
      if (c) c.addEventListener("click", () => render(null));
      const list = () => {
        const box = side.querySelector(".bg-groups");
        if (!box) return;
        if (box.contains(selBox)) side.prepend(selBox); // keep the open settings while the list is rebuilt
        const e2 = this._engine();
        const ql = q.trim().toLowerCase();
        const name = (it) => ((this._config.devices || {})[it.id] || {}).name || it.name;
        const rows = { hidden: [], on: [], off: [] };
        // 0.13.9.1: search matches the name, the entities, the category and the room; "lights" also finds "light".
        const qs = ql ? [...new Set([ql, ql.replace(/(?<=\w{3})s$/, "")])] : [];
        const hay = (it) => {
          const r = e2._roomOf(it, a) || it.area_id;
          const room = r ? (e2._rooms().names || {})[r] || ((a.areas || {})[r] || {}).name || "" : "";
          return `${name(it)} ${it.id} ${(it.entities || []).join(" ")} ${it.main_entity || ""} ${it.group || ""} ${LIVE_KINDS[it.group] || ""} ${room}`.toLowerCase();
        };
        for (const it of items) {
          if (qs.length && !qs.some((w) => hay(it).includes(w))) continue;
          if (ov === "plan") continue;
          const qual = e2._qualifies(it, ov, a);
          if (qual && e2._hidden(it, ov)) rows.hidden.push(it);
          else if (qual) rows.on.push(it);
          else rows.off.push(it);
        }
        for (const k of Object.keys(rows)) rows[k].sort((x, y) => name(x).localeCompare(name(y), undefined, { sensitivity: "base" }));
        const hideBtn = () => ""; // 0.12.7: the "Show here" switch in the settings does it
        const closeBtn = (it) => (sel === it.id ? `<button class="bg-c2" data-unpick="1" aria-label="Close">✕</button>` : "");
        const row = (it, btn) => `<div class="lr ${sel === it.id ? "sel" : ""}" data-id="${cesc(it.id)}"><button class="lnm" data-pick="${cesc(it.id)}">${((this._config.devices || {})[it.id] || {}).icon ? `<ha-icon class="lic" icon="${cesc(this._config.devices[it.id].icon)}"></ha-icon>` : it.main_entity ? `<ha-state-icon class="lic" data-ent="${cesc(it.main_entity)}"></ha-state-icon>` : `<ha-icon class="lic" icon="mdi:devices"></ha-icon>`}${cesc(name(it))}${it.bond ? " <small>(bonded)</small>" : it.phantom ? " <small>(phantom)</small>" : ""}</button>${btn}${hideBtn(it)}${closeBtn(it)}</div>`;
        const custom = def && def.custom;
        // 0.11: three groups, one style: arrow, bold title with count, collapsible (remembered while editing).
        const lbl = def ? def.label : "";
        const og = (this._grpOpen = this._grpOpen || { on: true, hidden: true, off: false });
        // 0.11.1: the shown devices grouped by room (as Home Assistant groups by area).
        // 0.13.9.1: the room is where the marker stands on THIS floor (any kind of spot, bonds included), else the
        // Home Assistant area it is in.
        const roomName = (it) => {
          const r = e2._roomOf(it, a) || (it.area_id && (a.areas || {})[it.area_id] ? it.area_id : null);
          return r ? (e2._rooms().names || {})[r] || ((a.areas || {})[r] || {}).name || r : "No room";
        };
        const byRoom = (list, btn) => {
          const g = new Map();
          for (const it of list) {
            const r = roomName(it);
            if (!g.has(r)) g.set(r, []);
            g.get(r).push(it);
          }
          return [...g].sort((x, y) => (x[0] === "No room") - (y[0] === "No room") || x[0].localeCompare(y[0])).map(([r, l]) => `<div class="lroom">${cesc(r)}</div>${l.map((it) => row(it, btn(it))).join("")}`).join("");
        };
        const grp = (k, title, list, btn) => (list.length ? `<details class="dgrp" data-g="${k}" ${og[k] || ql || list.some((it) => it.id === sel) ? "open" : ""}><summary>${cesc(title)} <span class="n">${list.length}</span></summary>${k === "on" ? byRoom(list, btn) : list.map((it) => row(it, btn(it))).join("")}</details>` : "");
        box.innerHTML = grp("on", `Shown in ${lbl}`, rows.on, () => "")
          + grp("hidden", `Hidden in ${lbl}`, rows.hidden, (it) => `<button class="lb" data-show="${cesc(it.id)}">↩ Show</button>`)
          + grp("off", `Not shown in ${lbl}`, rows.off, (it) => (custom ? `<button class="lb" data-add="${cesc(it.id)}">+ Add</button>` : ""))
          + `<p class="bg-hint" style="margin-top:10px">Devices that aren't on the plan yet: place them in the Floorplan Editor first.</p>`;
        const mkn = side.querySelector(".mkn");
        if (mkn) mkn.textContent = String(rows.on.length);
        for (const d of box.querySelectorAll("details.dgrp")) d.addEventListener("toggle", () => (this._grpOpen[d.dataset.g] = d.open));
        for (const ic of box.querySelectorAll("ha-state-icon[data-ent]")) {
          ic.hass = this._hass;
          ic.stateObj = this._hass.states[ic.dataset.ent];
        }
        for (const b of box.querySelectorAll("[data-pick]")) b.addEventListener("click", () => render(b.dataset.pick === sel ? null : b.dataset.pick));
        for (const b of box.querySelectorAll("[data-unpick]")) b.addEventListener("click", () => render(null));
        for (const b of box.querySelectorAll("[data-hide]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.hide] || {};
          this._saveDev(b.dataset.hide, { hide_in: [...new Set([...(cur.hide_in || []), ov])] });
          render(b.dataset.hide);
        });
        // 0.7.5: the selected marker's settings open right under its row, and the row scrolls into view.
        const r0 = sel && !String(sel).startsWith("person:") && box.querySelector(`.lr[data-id="${CSS.escape(sel)}"]`);
        if (r0) {
          const det = r0.closest("details");
          if (det) det.open = true;
          r0.after(selBox);
          selBox.classList.add("inl");
          if (!this._big || this._big.scrolled !== sel) {
            if (this._big) this._big.scrolled = sel;
            requestAnimationFrame(() => r0.scrollIntoView({ block: "start", behavior: "smooth" }));
          }
        } else selBox.classList.remove("inl");
        for (const b of box.querySelectorAll("[data-show]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.show] || {};
          this._saveDev(b.dataset.show, { hide_in: (cur.hide_in || []).filter((x) => x !== ov) });
          render(b.dataset.show);
        });
        for (const b of box.querySelectorAll("[data-add]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.add] || {};
          this._saveDev(b.dataset.add, { add_to: [...new Set([...(cur.add_to || []), ov])] });
          render(b.dataset.add);
        });
      };
      list();
      const qi = side.querySelector(".bg-q");
      qi.addEventListener("input", () => {
        q = qi.value;
        list();
      });
    };
    this._big.rerender = () => render(null);
    card._pick = (id) => {
      if (id) showTab("side"); // a marker picked on the plan opens Markers
      render(id);
    };
    card._onOv = () => render(sel);
    card._onWinMove = (id, pos) => this._saveDev(id, { win: pos });
    card._onNewOv = (raw) => {
      const c = { ...this._config, overlays: raw.overlays };
      if (raw.dismissed_overlays) c.dismissed_overlays = raw.dismissed_overlays;
      this._set(c);
    };
    card._pickHide = (id) => {
      if (!id) return;
      const ov = card._overlay;
      const cur = (this._config.devices || {})[id] || {};
      this._saveDev(id, { hide_in: [...new Set([...(cur.hide_in || []), ov])] });
      render(null);
    };
    setTimeout(() => render(null), 400);
    const close = () => {
      if (!this._big) return;
      try {
        wrap.close();
      } catch (_e) {
        /* already closed */
      }
      if (dall) dall.open = dallWas;
      if (dfe) this.prepend(...[dfeStyle, dfe].filter(Boolean)); // the settings go back to Home Assistant's editor
      wrap.remove();
      this._big = null;
      if (onClose) onClose();
      this._renderDevices();
    };
    wrap.querySelector(".bg-x").addEventListener("click", close);
    wrap.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
  },
});

if (!customElements.get("device-floorplan-card")) customElements.define("device-floorplan-card", DeviceFloorplanCard);
if (!customElements.get("device-floorplan-card-editor")) customElements.define("device-floorplan-card-editor", DeviceFloorplanCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "device-floorplan-card")) {
  window.customCards.push({
    type: "device-floorplan-card",
    name: "Device Floorplan",
    description: dfT("card.description"),
    preview: false,
    documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/card",
  });
}
// ------------------------------------------------------------------ companion chip card (#73)
/** A chip outside the plan: icon, label, optional value (entity or phantom); glows while its overlay shows. */
class DeviceFloorplanChip extends HTMLElement {
  static getConfigElement() {
    return document.createElement("device-floorplan-chip-editor");
  }

  static getStubConfig() {
    return { overlay: "lights", label: dfT("ov.lights"), icon: "mdi:lightbulb-group-outline" };
  }

  setConfig(c) {
    this._config = { ...(c || {}) };
    this._key = null;
    this._render();
  }

  set hass(h) {
    dfLangOf(h); // 0.14 L1: texts in this user's language
    this._hass = h;
    this._tplSub();
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 3, rows: 1, min_columns: 2, min_rows: 1 };
  }

  connectedCallback() {
    this._onOv = this._onOv || (() => this._render(true));
    window.addEventListener("device-floorplan-overlay", this._onOv);
    this._tplSub();
    this._render(true);
  }

  disconnectedCallback() {
    window.removeEventListener("device-floorplan-overlay", this._onOv);
    this._tplFor = undefined;
    if (this._tplUnsub) this._tplUnsub.then((u) => u && u()).catch(() => {});
    this._tplUnsub = null;
  }

  _active() {
    const c = this._config || {};
    if (!c.overlay) return false;
    const m = window.__dfpActive || {};
    return c.card_id ? m[c.card_id] === c.overlay : Object.values(m).includes(c.overlay);
  }

  _phantom() {
    const c = this._config || {};
    if (!c.phantom || !this._hass) return null;
    const [plan, pid] = String(c.phantom).split(":");
    const s = planSensors(this._hass).find((x) => x.attributes.plan_id === plan);
    const ph = s && s.attributes.phantoms ? s.attributes.phantoms[pid] || null : null;
    if (!ph) return null;
    // #126: like the card, a member counts with its main entity (not every entity of its device).
    const devs = s.attributes.devices || {};
    const ents = s.attributes.entities || {};
    const mem = (ph.members || []).map((m) => (String(m).startsWith("entity:") ? { ...(ents[String(m).slice(7)] || {}), main_entity: String(m).slice(7) } : devs[m] || {}));
    const mains = mem.map((d) => d.main_entity).filter(Boolean);
    return { ...ph, mains, units: phUnits(mem) };
  }

  /** #96: a bond ("plan_id:bond_id") as the value source. */
  _bond() {
    const c = this._config || {};
    if (!c.bond || !this._hass) return null;
    const [plan, bid] = String(c.bond).split(":");
    const s = planSensors(this._hass).find((x) => x.attributes.plan_id === plan);
    return s && s.attributes.bonds ? s.attributes.bonds[bid] || null : null;
  }

  _bondValue(b) {
    const h = this._hass;
    const ents = (b.entities || []).filter((e) => h.states[e]);
    if (!ents.length) return "";
    const nums = ents.map((e) => h.states[e]).filter((s) => live(s) && num(s.state));
    if (nums.length === ents.length) {
      const v = nums.reduce((x, y) => x + Number(y.state), 0) / nums.length;
      const unit = nums[0].attributes.unit_of_measurement || "";
      return `${Math.round(v * 10) / 10}${unit === "%" ? "" : " "}${unit}`.trim();
    }
    const on = ents.filter((e) => ["on", "open", "playing", "home"].includes(h.states[e].state)).length;
    if (ents.length === 1) return h.formatEntityState ? h.formatEntityState(h.states[ents[0]]) : h.states[ents[0]].state;
    return on === 0 ? dfT("chip.off") : on === ents.length ? dfT("chip.on") : dfT("chip.n_of_on", { n: on, t: ents.length });
  }

  /** 0.7.4: what the value counts, when it counts something: { n, total, word: "on" | "open" }. */
  _count() {
    const c = this._config || {};
    const h = this._hass;
    if (!h) return null;
    const ON = ["on", "open", "opening", "playing", "home", "unlocked"];
    const isOn = (e) => !!h.states[e] && ON.includes(h.states[e].state);
    const wordOf = (list) => (list.some((e) => kindOf(e, h.states[e]) === "opening" || domainOf(e) === "cover") ? "open" : "on");
    if (c.entity && h.states[c.entity]) {
      const grp = h.states[c.entity].attributes.entity_id;
      if (!Array.isArray(grp) || !grp.length || c.count === false) return null;
      // 0.11: count the group's own members, as Home Assistant does (a nested group is one);
      // entities of one bond (e.g. 3 bulbs in one lamp) count as one, like on the plan.
      const all = grp;
      const bondOf = {};
      for (const sen of planSensors(h)) for (const [bid, bd] of Object.entries(sen.attributes.bonds || {})) for (const e of bd.entities || []) bondOf[e] = `${sen.attributes.plan_id}:${bid}`;
      const units = [...all.reduce((m, e) => m.set(bondOf[e] || e, [...(m.get(bondOf[e] || e) || []), e]), new Map()).values()];
      return { n: units.filter((u) => u.some(isOn)).length, total: units.length, word: wordOf(all) };
    }
    const b = this._bond();
    if (b) {
      const ents = (b.entities || []).filter((e) => h.states[e]);
      if (ents.length < 2 || ents.every((e) => num(h.states[e].state))) return null;
      return { n: ents.filter(isOn).length, total: ents.length, word: wordOf(ents) };
    }
    const ph = this._phantom();
    if (!ph) return null;
    const mains = ph.mains || [];
    const kinds = mains.map((e) => kindOf(e, h.states[e]));
    if (kinds.some((k) => ["temperature", "humidity", "motion"].includes(k))) return null;
    if (kinds.includes("opening")) {
      const ops = mains.filter((e, i) => kinds[i] === "opening");
      return { n: ops.filter(isOn).length, total: ops.length, word: "open" };
    }
    const units = (ph.units || mains.map((e) => [e])).filter((u) => u.some((e) => ["light", "switch", "fan"].includes(kindOf(e, h.states[e]))));
    if (!units.length) return null;
    return { n: units.filter((u) => u.some(isOn)).length, total: units.length, word: "on" };
  }

  _value() {
    const c = this._config || {};
    const h = this._hass;
    if (!h) return "";
    const k = this._count();
    if (k) {
      // 0.7.4: value style: full "3 of 8 on" (default) or short "3 on" / "All off".
      if (c.value_style === "short") return k.n ? dfT(`chip.n_${k.word}`, { n: k.n }) : k.word === "open" ? dfT("sec.all_closed") : dfT("scene.all_off");
      return dfT(`chip.n_of_${k.word}`, { n: k.n, t: k.total });
    }
    if (c.entity && h.states[c.entity]) return h.formatEntityState ? h.formatEntityState(h.states[c.entity]) : h.states[c.entity].state;
    const b = this._bond();
    if (b) return this._bondValue(b);
    const ph = this._phantom();
    return ph ? phantomSummary(h, ph) : "";
  }

  /** 0.7.4: the icon's glow colour ("" = none). Standard: while something is on; custom: a template. */
  _glow() {
    const c = this._config || {};
    if (c.glow === "custom") return String(this._tplRes || "").trim();
    if (c.glow !== "standard") return "";
    const k = this._count();
    const h = this._hass;
    const on = k ? k.n > 0 : !!(c.entity && h && h.states[c.entity] && ["on", "open", "opening", "playing", "home", "unlocked"].includes(h.states[c.entity].state));
    if (!on) return "";
    if (c.glow_color) return c.glow_color;
    return k && k.word === "open" ? "#5aa9ff" : c.overlay === "lights" || (k && k.word === "on") ? "#F2B84B" : "var(--primary-color)";
  }

  /** Custom glow: Home Assistant renders the template and sends every new result. */
  _tplSub() {
    const c = this._config || {};
    const want = c.glow === "custom" && c.glow_template && this.isConnected && this._hass && this._hass.connection ? c.glow_template : null;
    if (want === this._tplFor) return;
    if (this._tplUnsub) this._tplUnsub.then((u) => u && u()).catch(() => {});
    this._tplUnsub = null;
    this._tplFor = want;
    this._tplRes = "";
    if (!want) return;
    this._tplUnsub = this._hass.connection
      .subscribeMessage((m) => {
        this._tplRes = m && m.result != null ? m.result : "";
        this._render(true);
      }, { type: "render_template", template: want, report_errors: false })
      .catch(() => null);
  }

  _render(force = false) {
    if (!this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      // 0.7.4: tap, and hold (hold_action: any Home Assistant action, e.g. a browser_mod popup).
      const R = this.shadowRoot;
      R.addEventListener("pointerdown", (e) => {
        if (e.button > 0 || !(this._config || {}).hold_action) return;
        this._held = false;
        clearTimeout(this._holdT);
        this._holdT = setTimeout(() => {
          this._held = true;
          this._runHold();
        }, 500);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) R.addEventListener(ev, () => clearTimeout(this._holdT));
      R.addEventListener("contextmenu", (e) => {
        if ((this._config || {}).hold_action) e.preventDefault();
      });
      R.addEventListener("click", () => {
        if (this._held) {
          this._held = false;
          return;
        }
        this._tap();
      });
    }
    const c = this._config;
    const ph = this._phantom();
    const bd = this._bond();
    const label = c.label ?? (bd ? bondName(bd) : ph ? ph.name : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].label : "");
    const icon = c.icon || (bd ? bd.icon || (bd.domain === "light" ? "mdi:lightbulb-group" : "mdi:link-variant") : ph ? ph.icon || "dfp:phantom" : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].icon : "mdi:floor-plan");
    const val = this._value();
    const on = this._active();
    const glow = this._glow();
    const custom = c.glow === "custom" && glow;
    const key = [label, icon, val, on, glow].join("|");
    if (!force && key === this._key) return;
    this._key = key;
    setShadow(this, `<style>
      :host { display:block; }
      ha-card { height:100%; border-radius: var(--ha-card-border-radius, 12px); transition: box-shadow .25s, background .25s; }
      button { width:100%; height:100%; min-height:44px; border:0; background:transparent; color: var(--primary-text-color); font: inherit; display:flex; align-items:center; gap:8px; padding: 8px 12px; cursor:pointer; text-align:left; border-radius: inherit; }
      ha-icon { --mdc-icon-size: 22px; color: var(--secondary-text-color); flex:none; }
      .t { display:flex; flex-direction:column; min-width:0; line-height:1.2; }
      .l { font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .v { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      /* 0.7.4: the border says "selected" (its overlay shows); the icon glows while something is on. */
      ha-card.on { box-shadow: inset 0 0 0 2px var(--primary-color), 0 0 10px 0 color-mix(in srgb, var(--primary-color) 35%, transparent); }
      ha-icon.glow { color: var(--dfc-glow); filter: drop-shadow(0 0 5px var(--dfc-glow)); }
      .val.alert { color: var(--dfc-glow) !important; }
    </style><ha-card class="${on ? "on" : ""}" style="${glow ? `--dfc-glow:${cesc(glow)}` : ""}"><button aria-pressed="${on}" aria-label="${cesc([label, val].filter(Boolean).join(": "))}"><ha-icon class="${glow ? "glow" : ""}" icon="${cesc(icon)}"></ha-icon><span class="t">${c.value_first && val ? `<span class="l val${custom ? " alert" : ""}">${cesc(val)}</span><span class="v">${cesc(label)}</span>` : `<span class="l">${cesc(label)}</span>${val ? `<span class="v val${custom ? " alert" : ""}">${cesc(val)}</span>` : ""}`}</span></button></ha-card>`);
  }

  _tap() {
    const c = this._config || {};
    if (c.tap === "none") return;
    if (c.tap === "bond") {
      const b = this._bond();
      const ents = b ? (b.entities || []).filter((e) => TOGGLE_DOMAINS.has(domainOf(e))) : [];
      if (ents.length) {
        const anyOn = ents.some((e) => this._hass.states[e] && this._hass.states[e].state === "on");
        this._hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
      }
      return;
    }
    if (c.tap === "more-info" && c.entity) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: c.entity }, bubbles: true, composed: true }));
      return;
    }
    if (!c.overlay) return;
    // 0.7.4: tapping the chip of the overlay that already shows goes back to the card's default overlay.
    const back = c.toggle !== false && this._active();
    window.dispatchEvent(new CustomEvent("device-floorplan-action", { detail: { card_id: c.card_id || null, overlay: back ? "reset" : c.overlay } }));
  }

  _runHold() {
    const c = this._config || {};
    if (!c.hold_action) return;
    if (navigator.vibrate) navigator.vibrate(30);
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { ...c, tap_action: undefined, hold_action: c.hold_action }, action: "hold" }, bubbles: true, composed: true }));
  }
}

class DeviceFloorplanChipEditor extends HTMLElement {
  setConfig(c) {
    this._config = { ...(c || {}) };
    this._render();
  }

  set hass(h) {
    dfLangOf(h); // 0.14 L1: texts in this user's language
    this._hass = h;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const phOpts = [{ value: "", label: "None" }];
    const bdOpts = [{ value: "", label: "None" }];
    for (const s of planSensors(this._hass)) for (const [pid, ph] of Object.entries(s.attributes.phantoms || {})) phOpts.push({ value: `${s.attributes.plan_id}:${pid}`, label: `${ph.name} (${s.attributes.plan_name || s.attributes.plan_id})` });
    for (const s of planSensors(this._hass)) for (const [bid, b] of Object.entries(s.attributes.bonds || {})) bdOpts.push({ value: `${s.attributes.plan_id}:${bid}`, label: `${bondName(b)} (${s.attributes.plan_name || s.attributes.plan_id})` });
    const schema = [
      { name: "overlay", selector: { select: { options: OVERLAY_ORDER.map((o) => ({ value: o, label: OVERLAYS[o].label })), mode: "dropdown", custom_value: true } } },
      { name: "card_id", selector: { text: {} } },
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "entity", selector: { entity: {} } },
      { name: "phantom", selector: { select: { options: phOpts, mode: "dropdown" } } },
      { name: "bond", selector: { select: { options: bdOpts, mode: "dropdown" } } },
      { name: "value_first", selector: { boolean: {} } },
      { name: "value_style", selector: { select: { options: [{ value: "full", label: "Full: 3 of 8 on" }, { value: "short", label: "Short: 3 on / All off" }], mode: "dropdown" } } },
      { name: "glow", selector: { select: { options: [{ value: "off", label: "Off" }, { value: "standard", label: "Standard: while something is on (amber lights, blue openings)" }, { value: "custom", label: "Custom: a template returns the colour" }], mode: "dropdown" } } },
      ...(this._config.glow === "standard" ? [{ name: "glow_color", selector: { text: {} } }] : []),
      ...(this._config.glow === "custom" ? [{ name: "glow_template", selector: { template: {} } }] : []),
      { name: "toggle", selector: { boolean: {} } },
      { name: "hold_action", selector: { ui_action: {} } },
      { name: "tap", selector: { select: { options: [{ value: "overlay", label: "Switch the floorplan to this overlay" }, { value: "more-info", label: "Open the value's details" }, { value: "bond", label: "Switch the bond (all together)" }, { value: "none", label: "Nothing" }], mode: "dropdown" } } },
    ];
    const labels = { overlay: "Overlay it opens (and glows for)", card_id: "Card ID of the floorplan card (empty = any on this screen)", label: "Label", icon: "Icon", entity: "Value from an entity (optional)", phantom: "…or from a phantom (optional)", bond: "…or from a bond (optional)", tap: "Tap", value_first: "Value big, label small", value_style: "Value style", glow: "Icon glow", glow_color: "Glow colour (optional, e.g. #F2B84B; empty = by kind)", glow_template: "Template: returns a colour (e.g. #E5534B) or nothing", toggle: "Tap again goes back to the default overlay", hold_action: "Hold (long press)" };
    if (!this._f) {
      this._f = document.createElement("ha-form");
      this._f.computeLabel = (s) => labels[s.name] || s.name;
      this._f.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const v = { ...e.detail.value };
        for (const k of Object.keys(v)) if (v[k] === "" || v[k] == null) delete v[k];
        if (v.tap === "overlay") delete v.tap;
        if (v.toggle === true) delete v.toggle;
        if (v.value_first === false) delete v.value_first;
        if (v.value_style === "full") delete v.value_style;
        if (v.glow === "off") delete v.glow;
        this._config = { type: "custom:device-floorplan-chip", ...v };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
        this._render();
      });
      this.appendChild(this._f);
    }
    this._f.hass = this._hass;
    this._f.schema = schema;
    this._f.data = { tap: "overlay", toggle: true, value_style: "full", glow: "off", ...this._config };
  }
}

if (!customElements.get("device-floorplan-chip")) customElements.define("device-floorplan-chip", DeviceFloorplanChip);
if (!customElements.get("device-floorplan-chip-editor")) customElements.define("device-floorplan-chip-editor", DeviceFloorplanChipEditor);
if (!window.customCards.some((c) => c.type === "device-floorplan-chip")) {
  window.customCards.push({
    type: "device-floorplan-chip",
    name: "Device Floorplan chip",
    description: "A chip for your top bar: switches a floorplan card's overlay and glows while it shows; can show a value or a phantom.",
    preview: true,
    documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/chip",
  });
}
console.info(`%c DEVICE-FLOORPLAN-CARD %c ${CARD_VERSION} `, "background:#03a9f4;color:#fff;border-radius:3px 0 0 3px", "background:#555;color:#fff;border-radius:0 3px 3px 0");

// ---------------------------------------------------------------------------------------------------------------
// 0.13.9.13 Mobile card (PLAN-MOBILE.md): `custom:device-floorplan-mobile`, a phone shell around the Floorplan.
// Only Floorplan data: plans = floors, plan rooms = rooms, placed devices / bonds / entities. The plan itself is the
// normal card (one code path), embedded without its card look; the shell adds pages, lists and the landscape explorer.
// ---------------------------------------------------------------------------------------------------------------
// #96: the Home page sections the editor can show / hide / order.
const DFM_SECTIONS = ["rooms", "control", "appliances", "cameras"];
const DFM_GROUPS = ["lights", "comfort", "security", "appl", "media", "other"];
const DFM_GICON = { lights: "mdi:lightbulb-group-outline", comfort: "mdi:thermometer", security: "mdi:shield-home-outline", appl: "mdi:washing-machine", media: "mdi:television-classic", other: "mdi:dots-horizontal-circle-outline" };
const DFM_GOV = { lights: "lights", comfort: "comfort", security: "security", appl: "live", media: "live", other: "live" };
const DFM_TOGGLE = new Set(["light", "switch", "fan", "input_boolean", "humidifier", "media_player", "cover", "siren"]);
// Settings of a Floorplan card that the mobile card takes over (how things look and who the people are), never its layout.
const DFM_COPY = ["plans", "plan", "card_id", "people", "people_in", "rooms", "look", "live", "lights", "comfort", "security", "network", "health", "energy", "cleaning", "night", "custom_overlays", "overlays", "overlay_names", "devices", "markers", "overlay_actions"];
// The overlays' colours on the mobile card (tiles, badges).
const DFM_OVC = { security: "#e5534b", lights: "#e8b923", comfort: "#3b9ad9", energy: "#f0a030", network: "#7e8ea3", health: "#d08a2c", cleaning: "#26a69a", people: "#8e7cc3", live: "#5c9ded" };
// #51: air quality: one rating per reading (good / moderate / poor), the worst wins.
const DFM_AIR = [
  [/pm25/, "PM2.5", [15, 35]], [/pm10/, "PM10", [45, 100]], [/carbon_dioxide/, "CO₂", [800, 1200]],
  [/volatile_organic_compounds|voc/, "VOC", [150, 250]], [/^aqi$/, "AQI", [50, 100]], [/nitrogen_dioxide/, "NO₂", [25, 50]],
];
/** An air reading of an entity: { k, label, v, unit, r: 0 good | 1 moderate | 2 poor } or null. */
function dfmAir(eid, st) {
  if (!st || !num(st.state) || !eid.startsWith("sensor.")) return null;
  if (impossibleReading(eid, st) || dfcCat(eid) === "diagnostic") return null; // 0.13.9.17 #70
  const dc = String(st.attributes.device_class || "");
  const key = dc || (/voc/i.test(eid) || /voc/i.test(st.attributes.friendly_name || "") ? "voc" : "");
  const hit = key && DFM_AIR.find(([re]) => re.test(key));
  if (!hit) return null;
  let v = Number(st.state);
  // ppb VOC (volatile_organic_compounds_parts) is not the 1–500 index: no rating from it.
  const idx = hit[1] === "VOC" && dc === "volatile_organic_compounds_parts" ? null : hit[2];
  const r = idx ? (v <= idx[0] ? 0 : v <= idx[1] ? 1 : 2) : 0;
  v = Math.round(v * 10) / 10;
  return { k: hit[1], label: hit[1], v, unit: st.attributes.unit_of_measurement || "", r };
}
// #67: kinds whose rows say when they last changed (not readings: they change all the time).
const DFM_AGO = new Set(["opening", "motion", "light", "switch", "fan", "cover", "lock", "media", "appliance", "safety", "binary", "alarm", "camera"]);
/** #96: every Floorplan card on every dashboard: { key, label, cfg } (key = "dashboard|id:card_id" or "|n:index").
 *  firstOnly: stop at the first one (the automatic choice). */
async function dfmFloorplanCards(hass, firstOnly = false) {
  if (!hass) return [];
  const boards = await hass.callWS({ type: "lovelace/dashboards/list" }).catch(() => []);
  const out = [];
  for (const bd of [{ url_path: null, title: "Overview" }, ...boards]) {
    const cfg = await hass.callWS({ type: "lovelace/config", ...(bd.url_path ? { url_path: bd.url_path } : {}) }).catch(() => null);
    if (!cfg || !Array.isArray(cfg.views)) continue;
    let n = 0;
    cfg.views.forEach((v, vi) => {
      const walk = (x) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(walk);
        if (x.type === "custom:device-floorplan-card") {
          const id = x.card_id ? `id:${x.card_id}` : `n:${n}`;
          n += 1;
          const what = x.card_id || x.title || (Array.isArray(x.plans) ? x.plans.join(", ") : x.plan) || "Floorplan";
          out.push({ key: `${bd.url_path || ""}|${id}`, label: `${bd.title || bd.url_path || "Overview"} › ${v.title || v.path || vi + 1} · ${what}`, cfg: x });
          return;
        }
        for (const y of Object.values(x)) if (y && typeof y === "object") walk(y);
      };
      walk(v);
    });
    if (firstOnly && out.length) return out;
  }
  return out;
}

// #92-13: which room badges matter most (alarms / open, then problems, lights, comfort, energy, the rest).
const DFM_BPRIO = { security: 0, network: 1, health: 1, lights: 2, comfort: 3, energy: 4 };
const dfmGroupLabel = (g) => dfT(`mob.g_${g}`);

// Device categories (Floorplan Editor) → the room page's groups; "sensors" go by what they measure.
const DFM_CAT = { lights: "lights", climate: "comfort", contacts: "security", motion: "security", cameras: "security", appliances: "appl", media: "media", computers: "other", network: "other", plugs_switches: "other", buttons: "other", covers: "other", energy: "other", moving: "other", sensors: null };
// Real alarms (red). Tamper / generic safety / problem sensors are warnings (amber), never "things going on".
const DFM_ALARM_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "heat"]);
const DFM_NOT_HOUSE = new Set(["appliances", "media", "moving", "computers"]);

/** What a placed device is and does right now, from its entities and its category. */
function dfmInfo(hass, item, opts = {}) {
  const S = hass.states;
  // 0.13.9.17 #61: an entity hidden in HA says nothing about the device (unless it is the one chosen as main).
  const ents = [...new Set([item.main_entity, ...(item.allEntities || item.entities || [])])].filter((e) => e && S[e] && (e === item.main_entity || !dfcHidden(e)));
  // 0.13.9.17 #70: the card's room-climate rule: no router / chip / diagnostic temperatures, no impossible readings.
  const roomOk = (e, k) => (k === "temperature" ? ambientTemp(e, S[e], item) || opts.comfort === true : k === "humidity" ? !impossibleReading(e, S[e]) && dfcCat(e) !== "diagnostic" : true);
  const kinds = ents.map((e) => [e, kindOf(e, S[e])]).filter(([e, k]) => roomOk(e, k));
  const find = (...ks) => kinds.find((x) => ks.includes(x[1]));
  const mk = item.main_entity && S[item.main_entity] ? kindOf(item.main_entity, S[item.main_entity]) : null;
  const pick = (k) => (mk === k ? [item.main_entity, k] : find(k));
  let g = null;
  let lead = null;
  const order = [
    ["lights", ["light"]],
    ["comfort", ["climate", "fan"]],
    ["appl", ["appliance"]],
    ["media", ["media"]],
    ["security", ["opening", "lock", "alarm", "safety", "camera", "motion"]],
    ["comfort", ["temperature", "humidity"]],
  ];
  const mainG = order.find(([, ks]) => ks.includes(mk));
  if (mainG) [g, lead] = [mainG[0], item.main_entity];
  else {
    for (const [gg, ks] of order) {
      const hit = ks.map(pick).find(Boolean);
      if (hit) {
        [g, lead] = [gg, hit[0]];
        break;
      }
    }
  }
  if (!lead) {
    const sw = pick("switch");
    if (sw) [g, lead] = [item.group === "lights" ? "lights" : "other", sw[0]];
    else {
      // #29: the most telling entity: one with a real state, never a time / setting / button entity.
      const rank = (e) => {
        const s = S[e];
        const d = domainOf(e);
        const dc = s.attributes.device_class;
        let r = live(s) && s.state !== "unknown" ? 4 : 0;
        if (["select", "button", "number", "text", "time", "date", "datetime", "update", "event", "image", "scene", "input_select", "input_number", "input_text", "input_datetime", "input_button"].includes(d)) r -= 6;
        if (["timestamp", "date"].includes(dc)) r -= 5;
        if (e === item.main_entity) r += 1;
        if (["sensor", "binary_sensor", "switch", "cover", "lock", "vacuum"].includes(d)) r += 1;
        return r;
      };
      lead = ents.length ? ents.slice().sort((x, y) => rank(y) - rank(x))[0] : null;
    }
  }
  // The category the user set wins (sensors: by what they measure).
  const cat = item.category || item.group;
  if (cat && DFM_CAT[cat]) g = DFM_CAT[cat];
  if (!g) g = "other";
  if (opts.appl) g = "appl"; // 0.13.9.18: an appliance type set in the Floorplan Editor
  // #29: fans and air purifiers are about comfort, whatever their category.
  if (g !== "lights" && !opts.appl && kinds.some(([e, k]) => k === "fan" || domainOf(e) === "humidifier")) g = "comfort";
  const st = lead ? S[lead] : null;
  const lk = st ? kindOf(lead, st) : null;
  const isOn = (e, k) => {
    const s = S[e];
    if (!live(s)) return false;
    if (k === "media") return ["playing", "on", "paused"].includes(s.state);
    if (k === "climate") return s.state !== "off";
    if (k === "appliance") return ["on", "cleaning", "running", "mowing", "returning"].includes(s.state);
    if (k === "cover") return s.state === "open" || s.state === "opening";
    return ["light", "switch", "fan"].includes(k) && s.state === "on";
  };
  const on = !!(lead && isOn(lead, lk));
  const dcOf = (e) => S[e].attributes.device_class;
  // Doors and windows of the house only: an appliance's or a car's door is part of that thing.
  // #40: by what the device is (an appliance, media, a car), not only by its category.
  const thing = kinds.some(([, k]) => k === "appliance" || k === "media") || APPL_TYPES.includes(item.as) || (item.light && ["drum", "line"].includes(item.light.type));
  const house = !DFM_NOT_HOUSE.has(cat) && g !== "media" && !thing;
  const opens = kinds.filter(([e, k]) => k === "opening" && S[e].state === "on").map(([e]) => e);
  const open = house ? opens : [];
  const nOpen = house ? kinds.filter(([, k]) => k === "opening").length : 0; // #64: the house's doors / windows on this device
  const doorOpen = !house && opens.length > 0;
  const alarm = kinds.filter(([e, k]) => (k === "safety" && DFM_ALARM_DC.has(dcOf(e)) && S[e].state === "on") || (k === "alarm" && S[e].state === "triggered")).map(([e]) => e);
  const warn = kinds.filter(([e, k]) => S[e].state === "on" && ((k === "safety" && !DFM_ALARM_DC.has(dcOf(e))) || (k === "binary" && dcOf(e) === "problem"))).map(([e]) => e);
  const presence = kinds.some(([e, k]) => k === "motion" && S[e].state === "on");
  const offline = !!(item.main_entity && S[item.main_entity] && S[item.main_entity].state === "unavailable");
  const temps = [];
  const hums = [];
  for (const [e, k] of kinds) {
    const s = S[e];
    if (!live(s)) continue;
    if (k === "temperature" && num(s.state)) temps.push(Number(s.state));
    if (k === "humidity" && num(s.state)) hums.push(Number(s.state));
    if (k === "climate") {
      if (num(s.attributes.current_temperature)) temps.push(Number(s.attributes.current_temperature));
      if (Number(s.attributes.current_humidity) > 0) hums.push(Number(s.attributes.current_humidity));
    }
  }
  // #73: a camera with no sensor of its own lives in Cameras only, not in the Security lists.
  const camOnly = ents.some((e) => domainOf(e) === "camera") && !kinds.some(([, k]) => ["opening", "lock", "alarm", "safety", "motion"].includes(k));
  const air = ents.map((e) => dfmAir(e, S[e])).filter(Boolean);
  const bat = kinds.find(([e, k]) => k === "battery" && num(S[e].state));
  const sig = kinds.find(([, k]) => k === "signal");
  const pw = ents.map((e) => powerW(S[e])).filter((v) => v != null);
  const attention = open.length + alarm.length; // #31: offline is a small amber badge, not red
  return {
    item, g, cat, lead, st, lk, on, camOnly, nOpen, open, doorOpen, alarm, warn, presence, offline, temps, hums, ents, attention, air,
    airR: air.length ? Math.max(...air.map((x) => x.r)) : null,
    battery: bat ? Number(S[bat[0]].state) : null, batEnt: bat ? bat[0] : null, sigEnt: sig ? sig[0] : null,
    power: pw.length ? pw.reduce((x, y) => x + y, 0) : null,
    conns: item.conns || [], name: item.name || (st && st.attributes.friendly_name) || item.id,
  };
}

/** A room's icon when neither the Floorplan nor Home Assistant has one: by the words in its name. */
function dfmRoomIcon(name) {
  const n = String(name || "").toLowerCase();
  const by = [
    [/kitchen|κουζ|küche/, "mdi:silverware-fork-knife"], [/bath|μπάν|bad\b/, "mdi:shower"], [/wc|toilet|τουαλ/, "mdi:toilet"],
    [/living|σαλόν|wohn/, "mdi:sofa"], [/bed|υπνοδ|schlaf|room|δωμάτ|zimmer/, "mdi:bed"], [/entr|είσοδ|eingang|hall|διάδρ|corridor|flur/, "mdi:door"],
    [/balcon|μπαλκ|terrace|βεράντ/, "mdi:balcony"], [/garage|parking|γκαράζ|πάρκ/, "mdi:garage"], [/office|γραφ|büro|study/, "mdi:desk"],
    [/laundry|πλυντ|wasch/, "mdi:washing-machine"], [/garden|κήπ|garten/, "mdi:flower"], [/storage|αποθ|keller|cellar/, "mdi:archive"],
  ];
  const hit = by.find(([re]) => re.test(n));
  return hit ? hit[1] : "mdi:floor-plan";
}

/** #23: bring `to` in line with `from` in place: same nodes stay (and keep what is inside a plan slot), so nothing
 *  jumps, reloads or loses its scroll; only changed texts and attributes are touched. */
/** A room's place on its plan (x / y in %), from the plan's sensor. */
function f0(m, plan, roomId) {
  const f = m.floors.find((q) => q.id === plan);
  return (f && f.a && f.a.areas && f.a.areas[roomId]) || null;
}

function dfmMorph(to, from) {
  const a = [...to.childNodes];
  const b = [...from.childNodes];
  for (let i = 0; i < b.length; i++) {
    const n = b[i];
    const o = a[i];
    if (!o) {
      to.appendChild(n);
      continue;
    }
    const slotO = o.nodeType === 1 ? o.getAttribute("data-slot") : null;
    const slotN = n.nodeType === 1 ? n.getAttribute("data-slot") : null;
    if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || slotO !== slotN) {
      to.replaceChild(n, o);
      continue;
    }
    if (o.nodeType !== 1) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
      continue;
    }
    const focused = o.getRootNode().activeElement === o;
    for (const at of [...o.attributes]) if (!n.hasAttribute(at.name) && !(slotO && at.name === "style")) o.removeAttribute(at.name);
    for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value && !(focused && at.name === "value")) o.setAttribute(at.name, at.value);
    if (o.localName === "input" && !focused && n.hasAttribute("value") && o.value !== n.getAttribute("value")) o.value = n.getAttribute("value");
    if (slotO) continue; // the plan inside is kept as it is
    dfmMorph(o, n);
  }
  for (let i = a.length - 1; i >= b.length; i--) if (a[i].parentNode === to) to.removeChild(a[i]);
}

const dfmAvg = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 10) / 10 : null);

class DeviceFloorplanMobile extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  /** #96: a basic editor: only what the mobile card itself needs (the rest is set in the Floorplan Editor and the
   *  Floorplan card it takes its settings from). */
  static async getConfigForm() {
    const ha = document.querySelector("home-assistant");
    const cards = await dfmFloorplanCards(ha && ha.hass).catch(() => []);
    return {
      schema: [
        { name: "source", selector: { select: { mode: "dropdown", options: [{ value: "", label: dfT("mob.cfg_source_auto") }, ...cards.map((c) => ({ value: c.key, label: c.label }))] } } },
        { name: "layout", selector: { select: { mode: "dropdown", options: ["auto", "portrait", "landscape"].map((v) => ({ value: v, label: dfT(`mob.layout_${v}`) })) } } },
        { name: "room_order", selector: { select: { mode: "dropdown", options: ["active", "alpha", "plan"].map((v) => ({ value: v, label: dfT(`mob.order_${v}`) })) } } },
        { name: "sections", selector: { select: { multiple: true, reorder: true, options: DFM_SECTIONS.map((v) => ({ value: v, label: dfT(`mob.sec_${v}`) })) } } },
        { name: "people", selector: { entity: { domain: "person", multiple: true } } },
        { name: "hide_header", selector: { boolean: {} } },
      ],
      computeLabel: (s) => dfT(`mob.cfg_${s.name}`),
      computeHelper: (s) => (s.name === "source" ? dfT("mob.cfg_source_help") : s.name === "hide_header" ? dfT("mob.cfg_hide_help") : s.name === "layout" ? dfT("mob.cfg_layout_help") : s.name === "sections" ? dfT("mob.cfg_sections_help") : s.name === "people" ? dfT("mob.cfg_people_help") : undefined),
    };
  }

  setConfig(config) {
    const had = !!this._config;
    const prevSrc = (this._config && this._config.source) || "";
    this._config = { room_order: "active", default_overlay: "live", layout: "auto", copy_settings: true, hide_header: true, ...(config || {}) };
    if (had && this._hass && prevSrc !== (this._config.source || "")) this._loadBase(); // #96: another source picked
    this._s = this._s || { page: "house", floor: null, room: null, ov: null, back: [] }; // #89: the card opens on Home
    this._kick();
  }

  set hass(hass) {
    dfLangOf(hass);
    if (hass && hass.entities) dfcReg = hass.entities;
    this.toggleAttribute("dark", !!(hass.themes && hass.themes.darkMode));
    const prev = this._hass;
    this._hass = hass;
    if (!prev) this._loadBase();
    // #102: only the plans on screen follow Home Assistant (a cached one gets it again when it is shown).
    for (const el of (this._plans || new Map()).values()) if (el.isConnected) this._feed(el);
    // #102: no redraw when nothing the card shows has changed (the minute tick still refreshes everything).
    if (prev && this._watch && prev.entities === hass.entities && prev.areas === hass.areas && prev.language === hass.language && prev.themes === hass.themes) {
      let same = true;
      for (const e of this._watch) {
        if (prev.states[e] !== hass.states[e]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this._kick();
  }

  /** #103: Home Assistant's state for a plan. The Home page's small plan (only a way to pick a room) follows at
   *  most every 5 s, always ending on the latest state; every other plan at once. force: now (a tap, a new page). */
  _feed(el, force = false) {
    const hass = this._hass;
    if (!hass || el.hass === hass) return;
    clearTimeout(el._dfmFeedT);
    const wait = el._dfmMode === "mini" && !force ? 5000 - (Date.now() - (el._dfmFedAt || 0)) : 0;
    if (wait > 0) {
      el._dfmFeedT = setTimeout(() => this._feed(el, true), wait);
      return;
    }
    el._dfmFedAt = Date.now();
    el.hass = hass;
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // #67: "… minutes ago" stays true: one quiet pass a minute (the usual guards: never while touching / scrolling).
    if (!this._tick) this._tick = setInterval(() => this._kick(), 60000);
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._click(e));
      this.shadowRoot.addEventListener("change", (e) => this._change(e));
      this.shadowRoot.addEventListener("input", (e) => this._input(e));
      this.shadowRoot.addEventListener("pointerdown", (e) => this._pdown(e), true);
      this.shadowRoot.addEventListener("pointerup", (e) => this._pup(e), true);
      this.shadowRoot.addEventListener("pointercancel", () => (this._ptr = null), true);
      this.shadowRoot.addEventListener("scroll", () => (this._scrollAt = Date.now()), true);
    }
    this._onScroll = this._onScroll || (() => {
      this._scrollAt = Date.now();
      // #92-2: the portrait page's place, kept for the way back (not the jumps a turn of the phone causes, #102).
      if (!this._wasLand && Date.now() - (this._rotAt || 0) > 1500 && this._land() === this._wasLand) this._pY = window.scrollY || 0;
    });
    window.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
    this._onUp = this._onUp || (() => (this._ptr = null)); // #104: the finger is up wherever the event ends
    window.addEventListener("pointerup", this._onUp, true);
    window.addEventListener("pointercancel", this._onUp, true);
    // #102: a turn of the phone is drawn at once (not held back by the scroll guard) and checked again once the
    // viewport has settled: real phones often report the new size only after the first resize event.
    this._onRot = this._onRot || (() => {
      const land = this._land();
      if (land !== this._wasLand) {
        this._rotAt = Date.now();
        this._tapAt = performance.now(); // #110
        const host = this.shadowRoot && this.shadowRoot.querySelector("div.dfm");
        if (host) {
          host.classList.add("turning");
          setTimeout(() => host.classList.remove("turning"), 1200); // never left hidden
        }
      }
      this._kick(true);
      clearTimeout(this._rotT);
      this._rotT = setTimeout(() => this._land() !== this._wasLand && this._kick(true), 250);
      clearTimeout(this._rotT2);
      this._rotT2 = setTimeout(() => this._land() !== this._wasLand && this._kick(true), 700);
    });
    window.addEventListener("resize", this._onRot);
    if (!this._mq && window.matchMedia) this._mq = window.matchMedia("(orientation: landscape)");
    if (this._mq && this._mq.addEventListener) this._mq.addEventListener("change", this._onRot);
    this._kick(true);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    window.removeEventListener("resize", this._onRot);
    if (this._mq && this._mq.removeEventListener) this._mq.removeEventListener("change", this._onRot);
    clearTimeout(this._rotT);
    clearTimeout(this._rotT2);
    window.removeEventListener("scroll", this._onScroll, { capture: true });
    window.removeEventListener("pointerup", this._onUp, true);
    window.removeEventListener("pointercancel", this._onUp, true);
    this._hideHdr(true);
    if (this._lay) this._lay.remove();
    clearTimeout(this._t);
    clearTimeout(this._hdrT);
  }

  // ------------------------------------------------------------- settings of the main Floorplan card
  /** The first Floorplan card on the user's dashboards: its people, rooms, look and overlay settings (cached). */
  /** #96: the settings of the Floorplan card picked in the editor ("Settings from"), else the first one found. */
  async _loadBase() {
    if (this._config.copy_settings === false) return;
    const want = this._config.source || "";
    try {
      const cached = lsGet("dfm_base");
      this._base = cached && cached.key === want ? cached.b : this._base || null;
    } catch (_e) {
      this._base = null;
    }
    try {
      const cards = await dfmFloorplanCards(this._hass, !want);
      const hit = (want && cards.find((c) => c.key === want)) || cards[0];
      if (!hit) return;
      const b = {};
      for (const k of DFM_COPY) if (hit.cfg[k] !== undefined) b[k] = hit.cfg[k];
      this._base = b;
      this._baseKey = hit.key;
      lsSet("dfm_base", { key: want, b });
      for (const el of (this._plans || new Map()).values()) el._dfmCfg = null;
      this._kick(true);
    } catch (_e) {
      /* no other card: defaults */
    }
  }

  // ------------------------------------------------------------- the model (floors, rooms, items)
  _model() {
    const hass = this._hass;
    // #30: the plans that are floors (a level set in the Floorplan Editor), unless the card names its plans.
    // #121: the card's own plans; else, when a Floorplan card was picked in "Settings from", the plans that card
    // shows (any plan, a view too); else every plan with a level.
    const b0 = this._config.source ? this._base || {} : {};
    const want = Array.isArray(this._config.plans) && this._config.plans.length ? this._config.plans
      : Array.isArray(b0.plans) && b0.plans.length ? b0.plans : b0.plan ? [b0.plan] : null;
    const all = planSensors(hass);
    const leveled = all.filter((x) => Number.isFinite(x.attributes.level));
    const sens = want ? all.filter((x) => want.includes(x.attributes.plan_id)) : leveled.length ? leveled : all;
    const floors = sens.map((s, i) => {
      const a = s.attributes;
      return { id: a.plan_id, a, i, level: a.level, name: a.plan_name || a.plan_id, label: floorLabel(a.level, a.plan_name) };
    }).sort((x, y) => (Number.isFinite(y.level) ? y.level : -99) - (Number.isFinite(x.level) ? x.level : -99) || x.i - y.i);
    if (want) floors.sort((x, y) => (Number.isFinite(y.level) ? y.level : -99) - (Number.isFinite(x.level) ? x.level : -99) || want.indexOf(x.id) - want.indexOf(y.id));
    const rooms = [];
    const items = [];
    const seen = new Set();
    // #102: a device's info (overlays it is in, what it shows) is kept while its states and the settings are the
    // same; at most 30 s, so anything else it reads is never stale for long.
    const ep = this._ep || {};
    if (ep.b !== this._base || ep.e !== hass.entities || ep.ar !== hass.areas || ep.c !== this._config || ep.l !== hass.language) {
      this._ep = { b: this._base, e: hass.entities, ar: hass.areas, c: this._config, l: hass.language };
      this._ic = new Map();
    }
    const ic = this._ic;
    const now = Date.now();
    const watch = new Set(sens.map((s) => s.entity_id));
    for (const f of floors) {
      const order = Object.keys(f.a.areas || {});
      const byRoom = new Map(order.map((id) => [id, []]));
      const h = this._helper(f);
      for (const item of h._items(f.a)) {
        if (item.phantom) continue;
        const key = item.id.startsWith("bond:") ? `${f.id}|${item.id}` : item.id;
        if (seen.has(key) && !item.x && !item.px) continue;
        seen.add(key);
        const ents = [item.main_entity, ...(item.allEntities || item.entities || [])].filter(Boolean);
        for (const e of ents) watch.add(e);
        const refs = ents.map((e) => hass.states[e]);
        const ck = `${f.id}|${item.id}`;
        const hit = ic.get(ck);
        if (hit && hit.a === f.a && now - hit.at < 30000 && hit.refs.length === refs.length && hit.refs.every((r, i) => r === refs[i])) {
          items.push(hit.info);
          if (hit.info.room) byRoom.get(hit.info.room).push(hit.info);
          continue;
        }
        const akind = h._applKind(item);
        const info = dfmInfo(hass, item, { comfort: h._dev(item.id).comfort === true, appl: !!akind });
        info.floor = f.id;
        // 0.13.9.18: an appliance (type set, category Appliances, or drawn with a drum / line): its model, for the
        // Appliances section and its details (built by the Floorplan card, one code path).
        if (akind || (item.category || item.group) === "appliances" || (item.light && ["drum", "line"].includes(item.light.type))) info.ap = h._applModel(item);
        if (info.ap) info.h = h;
        // The overlays this device belongs to, by the Floorplan card's own rules and the user's settings (#25),
        // and the ones that show it right now.
        info.ovs = new Set();
        info.now = new Set();
        for (const o of this._overlayList(f)) {
          if (o === "plan" || h._hidden(item, o)) continue;
          let q = false;
          let n = false;
          try {
            q = h._specsFor(item, o, true).length > 0;
            n = q && h._specsFor(item, o, false).length > 0;
          } catch (_e) {
            q = false;
          }
          if (!q && o === "live" && h._applOf(item)) [q, n] = [true, info.on]; // #40: running appliances count in Live only
          if (q) info.ovs.add(o);
          if (n) info.now.add(o);
        }
        // #29: what the card shows in Lights is a light here too (a switch / plug used as a light).
        if (info.ovs.has("lights") && info.g !== "lights" && !h._applOf(item)) info.g = "lights";
        info.room = h._roomOf(item, f.a) || (item.area_id && byRoom.has(item.area_id) ? item.area_id : null);
        ic.set(ck, { a: f.a, at: now, refs, info });
        items.push(info);
        if (info.room) byRoom.get(info.room).push(info);
      }
      order.forEach((id, idx) => {
        const ar = f.a.areas[id];
        const list = byRoom.get(id);
        const names = ((this._base || {}).rooms || {}).names || {};
        const hidden = ((this._base || {}).rooms || {}).hidden || [];
        if (hidden.includes(id) && !list.length) return;
        const area = (hass.areas || {})[id];
        const r = {
          id, floor: f.id, ar, idx, name: names[id] || ar.name || (area && area.name) || id, icon: ar.icon || (area && area.icon) || dfmRoomIcon(names[id] || ar.name || id), items: list,
          offline: list.filter((x) => x.offline).length, low: list.filter((x) => x.battery != null && x.battery <= 15).length, warns: list.filter((x) => x.warn.length).length,
          on: list.filter((x) => x.on).length, attention: list.reduce((n, x) => n + x.attention, 0), presence: list.some((x) => x.presence),
          lightsOn: list.filter((x) => x.g === "lights" && x.on).length,
          temp: dfmAvg(list.flatMap((x) => x.temps)), hum: dfmAvg(list.flatMap((x) => x.hums)),
          airR: list.some((x) => x.airR != null) ? Math.max(...list.filter((x) => x.airR != null).map((x) => x.airR)) : null,
          power: list.reduce((t, x) => t + (x.power || 0), 0),
        };
        r.people = [];
        rooms.push(r);
      });
    }
    // People: the main card's list, else every person.
    const ppl = this._peopleList();
    const wx = Object.keys(hass.states).find((e) => e.startsWith("weather."));
    if (wx) watch.add(wx);
    if (hass.states["sun.sun"]) watch.add("sun.sun");
    this._watch = watch;
    const people = ppl.map((p) => {
      watch.add(p.entity);
      for (const v of Object.values(p)) if (typeof v === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(v)) watch.add(v); // its room sensors etc.
      const st = hass.states[p.entity];
      let room = null;
      for (const f of floors) {
        const hit = DeviceFloorplanCard.prototype._personRoom.call({ _hass: hass }, p, f.a);
        if (hit) {
          room = rooms.find((r) => r.floor === f.id && r.id === hit.id) || null;
          break;
        }
      }
      if (room) room.people.push(p);
      return { ...p, st, room, home: !!st && st.state === "home", name: (st && st.attributes.friendly_name) || p.entity, pic: st && st.attributes.entity_picture };
    });
    for (const r of rooms) {
      if (r.people.length) r.presence = true;
      r.score = r.attention * 100 + r.on * 10 + (r.presence ? 1 : 0);
    }
    // The house: levels (plans with the same level side by side); plans without a level are views, not floors.
    const levels = [];
    for (const f of floors) {
      if (!Number.isFinite(f.level)) continue;
      const lv = levels.find((x) => x.level === f.level);
      if (lv) lv.plans.push(f);
      else levels.push({ level: f.level, plans: [f] });
    }
    return { floors, rooms, items, people, levels };
  }

  /** #31: every person in Home Assistant (or the card's own list); where they are from the Floorplan card's people settings. */
  _peopleList() {
    const b = this._base || {};
    const conf = new Map((Array.isArray(b.people) ? b.people : []).filter((p) => p && p.entity).map((p) => [p.entity, p]));
    const ids = Array.isArray(this._config.people) ? this._config.people.map((p) => (typeof p === "string" ? p : p && p.entity)).filter(Boolean) : Object.keys(this._hass.states).filter((e) => e.startsWith("person."));
    return ids.map((entity) => conf.get(entity) || { entity });
  }

  /** A card instance (never shown) for the shared helpers: items, rooms, overlays, people. */
  _helper(f) {
    if (!f) return null;
    this._hs = this._hs || {};
    let h = this._hs[f.id];
    if (!h) h = this._hs[f.id] = document.createElement("device-floorplan-card");
    if (!h._config || h._dfmB !== this._base) {
      h._dfmB = this._base;
      h._config = { ...(this._base || {}), plans: undefined, plan: f.id };
      h._lay = {};
      h._floor = f.id;
    }
    h._hass = this._hass;
    if (h._a !== f.a) {
      h._a = f.a;
      h._cx = h._ctx(f.a);
    }
    return h;
  }

  _overlayList(f) {
    const h = this._helper(f);
    try {
      return h ? h._overlays() : OVERLAY_ORDER;
    } catch (_e) {
      return OVERLAY_ORDER;
    }
  }

  _ovLabel(o, f) {
    const h = this._helper(f);
    const names = ((this._base || {}).overlay_names) || {};
    const d = h ? h._ovDef(o) : OVERLAYS[o];
    return names[o] || (d && d.label) || o;
  }

  _ovIcon(o, f) {
    const h = this._helper(f);
    const d = h ? h._ovDef(o) : OVERLAYS[o];
    return (d && d.icon) || "mdi:layers-outline";
  }

  _sortRooms(list) {
    const o = this._config.room_order;
    const a = list.slice();
    if (o === "alpha") return a.sort((x, y) => x.name.localeCompare(y.name));
    if (o === "plan") return a;
    // Most active first; the order is taken once while the list is open, so rows do not jump.
    const key = a.map((r) => r.id).join(",");
    if (this._frozen && this._frozen.key === key) return this._frozen.ids.map((id) => a.find((r) => r.id === id)).filter(Boolean);
    a.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
    if (this._freeze) this._frozen = { key, ids: a.map((r) => r.id) };
    return a;
  }

  // ------------------------------------------------------------- render
  _kick(now = false) {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    if (this._busy && !now) return;
    clearTimeout(this._t);
    const wait = now ? 0 : Math.max(0, 400 - (Date.now() - (this._last || 0)));
    this._t = setTimeout(() => this._render(), wait);
  }

  _land() {
    const l = this._config.layout;
    if (l === "landscape") return true;
    if (l === "portrait") return false;
    // #102: the orientation from the media query (right at once on phones), a phone by its short side (true
    // whichever way round the size is reported).
    const w = window.innerWidth;
    const h = window.innerHeight;
    const wide = this._mq ? this._mq.matches : w > h;
    return wide && Math.min(w, h) <= 600;
  }

  _render() {
    if (!this._hass || !this.shadowRoot || !this.isConnected) return;
    // #23: never while a finger is on the screen or the page is scrolling; right after. #102: a turn of the
    // phone is never held back (turning moves the page, which looks like scrolling).
    const turning = this._land() !== this._wasLand;
    // A finger counts for at most 2 s: a lost pointerup (the plan's own drag code) never freezes the card (#104).
    const finger = this._ptr && Date.now() - (this._ptrAt || 0) < 2000;
    if (!turning && (finger || Date.now() - (this._scrollAt || 0) < 450)) {
      clearTimeout(this._t);
      this._t = setTimeout(() => this._render(), 300);
      return;
    }
    this._last = Date.now();
    // #102: timing, to measure on a real phone: the card option "debug: true" or "?dfm_debug=1" in the address.
    const dbg = this._config.debug === true || /[?&]dfm_debug=1/.test(location.search);
    const m = (this._m = this._model());
    const s = this._s;
    const root = this.shadowRoot;
    if (!root.querySelector("style#dfm")) root.innerHTML = `<style id="dfm">${DFM_CSS}</style><div class="dfm"></div>`;
    const host = root.querySelector("div.dfm");
    this._hideHdr();
    if (!m.floors.length) {
      host.innerHTML = `<div class="empty">${dfT("mob.no_plans")}</div>`;
      return;
    }
    // #22: Home starts on the main floor: the floor (a plan with a level) with the most devices; ties: the ground floor.
    if (!s.floor || !m.floors.some((f) => f.id === s.floor)) s.floor = this._mainFloor(m);
    if (s.room && !m.rooms.some((r) => r.id === s.room && r.floor === s.floor)) s.room = null;
    if (s.page === "room" && !s.room) s.page = "home";
    const land = this._land();
    const turned = this._wasLand !== undefined && land !== this._wasLand;
    if (land !== this._wasLand) {
      this._wasLand = land;
      this._hdrHidden = false;
    }
    this._layerHtml = "";
    const html = land ? this._landHtml(m) : this._portHtml(m);
    if (html !== this._html) {
      this._html = html;
      const tpl = document.createElement("div");
      tpl.innerHTML = html;
      dfmMorph(host, tpl);
    }
    for (const el of root.querySelectorAll("[data-ent]")) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.ent];
    }
    // #110: the page first; a plan that is not there yet goes in right after the page is on the screen.
    const pend = [];
    for (const slot of root.querySelectorAll("[data-slot]")) {
      if (slot.firstElementChild) this._mount(slot);
      else pend.push(slot);
    }
    if (pend.length) {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        for (const slot of pend) if (slot.isConnected && !slot.firstElementChild) this._mount(slot);
        this._scaleAll();
        this._toolsTop();
      };
      requestAnimationFrame(() => setTimeout(go, 0)); // after the page is painted
      setTimeout(go, 80); // never later than this (a hidden tab has no frames)
    }
    this._renderLayer(!land && this._useLayer() ? this._layerHtml : "");
    const top = this._hdrOn ? 0 : Math.max(0, Math.round(this.getBoundingClientRect().top + (window.scrollY || 0)));
    if (top !== this._top) {
      this._top = top;
      this.style.setProperty("--dfm-top", `${top}px`);
    }
    if (land) this._hdrTimer();
    this._scaleAll();
    this._fitGreet();
    // #92-2: back to portrait = the portrait page as it was (its scroll place), never a leftover landscape layout.
    if (turned && !land) requestAnimationFrame(() => window.scrollTo(0, this._pY || 0));
    requestAnimationFrame(() => {
      this._bleed();
      this._scaleAll();
      this._toolsTop();
      if (host.classList.contains("turning")) requestAnimationFrame(() => host.classList.remove("turning")); // #102
    });
    if (dbg && this._tapAt) this._timeTap(land ? `landscape ${s.page}` : `portrait ${s.page}`);
  }

  /** #123: landscape end to end. Home Assistant keeps its page out of the phone's notch zones (plain strips at
   *  both sides); the landscape page reaches back to the screen's edges, and only the controls keep clear: of the
   *  notch on the side where it is, of the rounded corners (8 px) on the other. */
  _bleed() {
    const host = this.shadowRoot && this.shadowRoot.querySelector("div.dfm");
    if (!host) return;
    const props = ["--dfm-bl", "--dfm-br", "--dfm-il", "--dfm-ir"];
    if (!this._wasLand) {
      for (const p of props) host.style.removeProperty(p);
      return;
    }
    for (const p of props) host.style.removeProperty(p);
    const r = this.getBoundingClientRect();
    const gl = Math.round(r.left);
    const gr = Math.round(window.innerWidth - r.right);
    if (gl < 0 || gr < 0 || gl > 80 || gr > 80) return; // a desktop beside a sidebar, or something else: as it is
    const ins = this._insets();
    const so = window.screen && window.screen.orientation;
    const ang = so && typeof so.angle === "number" ? so.angle : typeof window.orientation === "number" ? (window.orientation + 360) % 360 : null;
    // The notch is on the left when the phone is turned to the left (90°), on the right at 270°; unknown: both.
    const il = ang === 90 || ang === null ? ins.l : Math.min(ins.l, 8);
    const ir = ang === 270 || ang === null ? ins.r : Math.min(ins.r, 8);
    host.style.setProperty("--dfm-bl", `${gl}px`);
    host.style.setProperty("--dfm-br", `${gr}px`);
    host.style.setProperty("--dfm-il", `${Math.max(0, il)}px`);
    host.style.setProperty("--dfm-ir", `${Math.max(0, ir)}px`);
  }

  /** The phone's safe-area insets (notch / rounded corners), measured. */
  _insets() {
    const p = document.createElement("div");
    p.style.cssText = "position:fixed;visibility:hidden;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)";
    document.body.appendChild(p);
    const cs = getComputedStyle(p);
    const out = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
    p.remove();
    return out;
  }

  /** #122: is this plan clearly taller than the landscape space beside the navigation and the rail? */
  _tall(planId) {
    const f = this._m && this._m.floors.find((q) => q.id === planId);
    const a = f && f.a;
    if (!a || !a.image_width || !a.image_height) return false;
    const fr = a.frame && a.frame.x2 > a.frame.x1 && a.frame.y2 > a.frame.y1 ? a.frame : { x1: 0, y1: 0, x2: 100, y2: 100 };
    const ratio = (a.image_width * (fr.x2 - fr.x1)) / (a.image_height * (fr.y2 - fr.y1)); // width / height as drawn
    const left = this.shadowRoot && this.shadowRoot.querySelector(".land .left");
    const W = left && left.clientWidth ? left.clientWidth - 6 : window.innerWidth - 48 - 92 - 12;
    const H = window.innerHeight - (this._top || 0) - 12;
    return W > 0 && H > 0 && W / ratio > H * 1.3;
  }

  /** #110: timing as felt, from the finger (tap, swipe, turn): when the page is on the screen and when its plan is
   *  ready (its picture loaded and drawn). */
  _timeTap(what) {
    const t0 = this._tapAt;
    this._tapAt = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._dbg(`${what}: page shown ${(performance.now() - t0).toFixed(0)} ms`);
      const until = performance.now() + 20000;
      const check = () => {
        const els = [...(this._plans || new Map()).values()].filter((el) => el.isConnected);
        const ready = els.length && els.every((el) => {
          const img = el.shadowRoot && el.shadowRoot.querySelector("img.plan");
          return img && img.complete && img.naturalWidth > 0;
        });
        if (ready) requestAnimationFrame(() => this._dbg(`${what}: plan ready ${(performance.now() - t0).toFixed(0)} ms`));
        else if (performance.now() < until) setTimeout(check, 50);
      };
      check();
    }));
  }

  /** #111: the side tools of the landscape plan start under the floor capsule. */
  _toolsTop() {
    if (!this._wasLand || !this.shadowRoot) return;
    const nav = this.shadowRoot.querySelector(".lnav");
    for (const el of (this._plans || new Map()).values()) {
      if (!el.isConnected || el._dfmMode !== "land" || !nav) continue;
      const card = (el.shadowRoot && el.shadowRoot.querySelector("ha-card")) || el;
      const n = nav.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      const st = el.parentElement && el.parentElement.classList.contains("tall") ? el.parentElement.scrollTop : 0;
      const top = Math.round(n.bottom - r.top + 10 - st); // #122: on a scrolled tall plan, from its top
      const left = Math.round(n.left - r.left);
      if (el.style.getPropertyValue("--dfc-tools-top") !== `${top}px`) el.style.setProperty("--dfc-tools-top", `${top}px`);
      if (el.style.getPropertyValue("--dfc-tools-left") !== `${left}px`) el.style.setProperty("--dfc-tools-left", `${left}px`); // under the floors, exactly
    }
  }

  /** #102 / #106: timing on the screen itself (a phone has no console at hand) and in the console; last 4 lines. */
  _dbg(line) {
    if (!(this._config.debug === true || /[?&]dfm_debug=1/.test(location.search))) return;
    console.info(`[device-floorplan-mobile] ${line}`);
    const t = new Date();
    this._dbgL = [...(this._dbgL || []).slice(-3), `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")} ${line}`];
    let box = this.shadowRoot && this.shadowRoot.querySelector("#dfmdbg");
    if (!box && this.shadowRoot) {
      box = document.createElement("pre");
      box.id = "dfmdbg";
      box.style.cssText = "position:fixed;left:64px;top:6px;z-index:20;margin:0;padding:6px 8px;max-width:92vw;white-space:pre-wrap;font:11px/1.35 monospace;color:#fff;background:rgba(0,0,0,.72);border-radius:8px;pointer-events:none";
      this.shadowRoot.appendChild(box);
    }
    if (box) box.textContent = this._dbgL.join("\n");
  }

  /** #20: Home Assistant's top bar hidden on this dashboard, on phones, while the card is open (option). Only a
   *  style in this dashboard's own hui-root; removed when the card goes. If HA changes, the bar just shows again. */
  _huiRoot() {
    let n = this;
    for (let i = 0; i < 20 && n; i++) {
      const r = n.getRootNode();
      if (!r || !r.host) return null;
      if (r.host.localName === "hui-root") return r;
      n = r.host;
    }
    return null;
  }

  _hideHdr(off = false) {
    const want = !off && this._config.hide_header !== false && this.isConnected && Math.min(window.innerWidth, window.innerHeight) <= 600 && !/[?&]edit=1/.test(location.search);
    const r = this._huiRoot();
    if (!r) {
      this._hdrOn = false;
      return;
    }
    let st = r.getElementById ? r.getElementById("dfm-hide-hdr") : r.querySelector("#dfm-hide-hdr");
    if (want && !st) {
      st = document.createElement("style");
      st.id = "dfm-hide-hdr";
      st.textContent = `.header, .toolbar, app-header, app-toolbar, ha-top-app-bar, ha-top-app-bar-fixed { display: none !important; }
        :host { --header-height: 0px !important; }
        #view { padding-top: env(safe-area-inset-top) !important; min-height: 100vh !important; }`;
      r.appendChild(st);
    } else if (!want && st) st.remove();
    this._hdrOn = want;
  }

  /** A plan (the normal card) for a slot: kept between redraws, so it never reloads or blinks. */
  _mount(slot) {
    const [plan, ov, mode] = slot.dataset.slot.split("|");
    const focus = slot.dataset.focus || "";
    const key = slot.dataset.slot;
    this._plans = this._plans || new Map();
    let el = this._plans.get(key);
    if (!el) {
      el = document.createElement("device-floorplan-card");
      el.addEventListener("click", (e) => this._planTap(e, el), true);
      this._plans.set(key, el);
      if (this._plans.size > 8) {
        const old = [...this._plans.keys()].find((k) => k !== key && !this.shadowRoot.querySelector(`[data-slot="${CSS.escape(k)}"]`));
        if (old) this._plans.delete(old);
      }
    }
    const b = this._base || {};
    const full = mode === "full";
    const land = mode === "land";
    const cfg = {
      // #79: its own storage key per kind of plan (layers, replay…): the mobile card never changes the dashboard
      // card's settings, nor one of its plans another. #83: landscape = the card with its overlay rail and Replay.
      ...b, plans: undefined, card_id: `dfm-${mode}`, type: "custom:device-floorplan-card", plan,
      buttons: { position: "hidden" }, layers_button: full ? "top-right" : "hidden",
      replay: full || land ? undefined : false, replay_button: false, replay_now: false, replay_global: true, hide_admin_hint: true, embedded: true, remember_floor: false, default_overlay: ov,
      people_row: false, frame: { mode: "custom", t: 0, r: 0, b: 0, l: 0 },
      ...(focus ? { focus_area: focus, focus_aspect: this._bandAspect(), rooms: { ...(b.rooms || {}), show_in: [] } } : {}),
      // #41: portrait plans are Live with one temperature · humidity chip per room.
      ...(["mini", "floor", "room"].includes(mode) ? { room_values: true } : {}),
      // #111 / #113: landscape: the overlay's controls beside the plan (nothing under it); Network shows Zigbee
      // until other connections are switched on (unless the Floorplan card chose its own).
      ...(land ? { tools: "side", network: { ...(b.network || {}), connections: Array.isArray((b.network || {}).connections) && b.network.connections.length ? b.network.connections : ["zigbee"] } } : {}),
    };
    const sig = JSON.stringify(cfg);
    if (el._dfmCfg !== sig) {
      el._dfmCfg = sig;
      el.setConfig(cfg);
    }
    el._dfmMode = mode;
    el._dfmFloor = plan;
    // #122: a plan much taller than the landscape space is drawn at the full width and scrolls up / down.
    const tall = land && this._tall(plan);
    el._fitHost = land && !tall;
    el.style.height = tall ? "auto" : "";
    el.toggleAttribute("fw", tall);
    slot.classList.toggle("tall", tall);
    if (tall && !slot._dfmOnScroll) {
      // #122: what sits on the plan's frame (Replay button, the side tools and their popover) stays in place while
      // the tall plan scrolls under it.
      slot._dfmOnScroll = () => {
        el.style.setProperty("--dfc-scroll", `${slot.scrollTop}px`);
        this._toolsTop();
      };
      slot.addEventListener("scroll", slot._dfmOnScroll, { passive: true });
    }
    if (slot.parentElement) slot.parentElement.classList.toggle("tall", tall);
    const fresh = el.parentNode !== slot;
    if (fresh) slot.appendChild(el);
    if (this._hass) this._feed(el, fresh); // #103: a plan just shown is up to date at once
    // Landscape: the overlay picked on the mobile card's rail (#93).
    const want = land ? this._lov || ov : ov;
    if (el.dfSetOverlay && el._dfmOv !== want) el.dfSetOverlay(want);
    el._dfmOv = want;
    if (land && el.dfOutlineRoom && this._m) {
      const sel = this._landSel(this._m); // #107: the chosen room outlined
      el.dfOutlineRoom(sel ? sel.id : null, sel ? this._vals(sel) : "");
      // #122: on a tall plan, a room arrived at (a turned room page) is scrolled into view once.
      if (tall && sel && slot._dfmScrolled !== sel.id) {
        slot._dfmScrolled = sel.id;
        const ar = f0(this._m, plan, sel.id);
        if (ar) requestAnimationFrame(() => requestAnimationFrame(() => (slot.scrollTop = Math.max(0, (ar.y / 100) * slot.scrollHeight - slot.clientHeight / 2))));
      }
    }
  }

  /** #33: the room band's shape: the screen's width × a third of its height (portrait); the left area (landscape). */
  _bandAspect() {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 844;
    const a = w / (h / 3);
    return Math.round(a * 100) / 100;
  }

  /** #32: icons, chips and names on a plan scaled by (plan width on the phone ÷ 900 px), 0.45–1; a room cut-out by the
   *  width the whole plan would have at that zoom. */
  _scaleAll() {
    for (const el of (this._plans || new Map()).values()) {
      if (!el.isConnected || !el.shadowRoot) continue;
      const fr = el.shadowRoot.querySelector(".fr");
      if (!fr) continue;
      let w = fr.getBoundingClientRect().width;
      if (!w) continue;
      const ff = el._config && el._config.focus_area && el._a && el._focusFrame ? el._focusFrame(el._a) : null;
      if (ff) w /= Math.max(0.05, (100 + ff.l + ff.r) / 100);
      const k = Math.max(el._dfmMode === "land" ? 0.85 : 0.45, Math.min(1, w / 900)).toFixed(2); // #114: finger-sized in landscape
      if (el.style.getPropertyValue("--dfc-ui") !== k) el.style.setProperty("--dfc-ui", k);
      const kr = Math.max(0.75, Number(k)).toFixed(2); // #95: room names keep at least 3/4 of their size
      if (el.style.getPropertyValue("--dfc-ui-room") !== kr) el.style.setProperty("--dfc-ui-room", kr);
    }
  }

  _slot(plan, ov, focus = "", mode = "mini", cls = "") {
    // #110: the room is not part of the slot's name: the next room reuses the same plan (only its focus moves).
    return `<div class="plan ${cls}" data-slot="${cesc([plan, ov, mode].join("|"))}" data-focus="${cesc(focus)}"></div>`;
  }
}
// Mobile card: navigation, gestures (swipe, plan taps) and the actions of its buttons (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** Taps on an embedded plan (#21): a whole floor is tapped only to open a room; devices only in a room. The
   *  card's own buttons (Layers, Replay) keep working. */
  _planTap(e, el) {
    if (this._swAt && Date.now() - this._swAt < 500) return this._stop(e);
    const mode = el._dfmMode;
    const path = e.composedPath();
    const inBox = path.some((n) => n && n.classList && n.classList.contains("box"));
    if (!inBox) return; // the card's own buttons and menus
    if (path.some((n) => n && n.classList && n.classList.contains("pop"))) return; // #63: the card's own popup (Press? · Cancel)
    // #83: landscape is the detailed view: a device acts by its own tap settings (the card does it); #107: an
    // empty spot chooses its room (outlined, a chip), again or outside any room clears it.
    if (mode === "land") {
      if (!lsGet("dfm_hint_l")) lsSet("dfm_hint_l", 1); // #92-6: the landscape hint has done its job
      if (path.find((n) => n && n.dataset && (n.dataset.k || n.dataset.touch))) return;
      this._stop(e);
    } else if (mode === "room") {
      const k = path.find((n) => n && n.dataset && n.dataset.k);
      this._stop(e);
      const sp = k && el._specs && el._specs.get(k.dataset.k);
      const eid = sp && (sp.eid || (sp.ents || [])[0] || (sp.item && sp.item.main_entity));
      // #63: a marker set to "Press a button" presses it here too (asking first, in the card's own popup).
      if (sp && sp.item && el._tapAction(sp) === "press") return el._runAction(sp, "press");
      if (eid) this._more(eid);
      return;
    }
    this._stop(e);
    const box = path.find((n) => n && n.classList && n.classList.contains("box"));
    const r = box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const f = this._m.floors.find((q) => q.id === el._dfmFloor);
    if (this._m.rooms.filter((q) => q.floor === (f && f.id)).length < 2) return; // #75: one room: no room level
    const areas = (f && f.a.areas) || {};
    let hit = Object.keys(areas).find((id) => Array.isArray(areas[id].shape) && areas[id].shape.length >= 3 && inPoly(x, y, areas[id].shape));
    if (!hit) {
      const near = Object.entries(areas).map(([id, ar]) => [id, Math.hypot(ar.x - x, ar.y - y)]).sort((p, q) => p[1] - q[1])[0];
      if (near && near[1] < 10) hit = near[0];
    }
    const ok = hit && this._m.rooms.some((q) => q.id === hit && q.floor === f.id);
    if (mode === "land") {
      const s = this._s;
      if (ok && !(s.page === "room" && s.room === hit)) Object.assign(s, { page: "room", floor: f.id, room: hit });
      else Object.assign(s, { page: "home", room: null });
      return this._kick(true);
    }
    if (ok) this._go({ page: "room", floor: f.id, room: hit });
  },

  _stop(e) {
    e.stopPropagation();
    e.preventDefault();
  },

  /** One-finger swipe anywhere on a swipe area (#28): next / previous room or floor. */
  _pdown(e) {
    this._ptr = true;
    this._ptrAt = Date.now();
    this._tapAt = performance.now(); // #110: timing from the finger
    this._touched();
    const path = e.composedPath();
    // #79 / #83: the card's overlay rail, Home Replay's bar and its popups never swipe floors or rooms.
    // #112: nor any control: a slider, a legend, the side tools and their popover, the navigation.
    const ctl = path.some((n) => n && ((n.classList && ["dockrow", "dock", "rprail", "rpbar", "rptrack", "layers", "pop", "lmenu", "ovbar", "heatleg", "bar", "tside", "tinfo", "lnav", "lrail"].some((c) => n.classList.contains(c))) || ["INPUT", "SELECT", "TEXTAREA"].includes(n.tagName)));
    const z = ctl ? null : path.find((n) => n && n.dataset && n.dataset.swipe);
    this._sw = z ? { x: e.clientX, y: e.clientY, t: Date.now(), zone: z.dataset.swipe } : null;
  },

  _pup(e) {
    this._ptr = null;
    const sw = this._sw;
    this._sw = null;
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - sw.t > 900) return;
    this._swAt = Date.now();
    this._step(dx < 0 ? 1 : -1, sw.zone);
  },

  _step(dir, zone) {
    const s = this._s;
    const m = this._m;
    if (zone === "room" || (!zone && s.page === "room")) {
      const list = this._sortRooms(m.rooms.filter((r) => r.floor === s.floor));
      const i = list.findIndex((r) => r.id === s.room);
      const n = list[(i + dir + list.length) % list.length];
      if (n) {
        s.room = n.id;
        this._kick(true);
      }
      return;
    }
    const fl = m.floors;
    const i = fl.findIndex((f) => f.id === s.floor);
    const n = fl[(i - dir + fl.length) % fl.length];
    if (n && n.id !== s.floor) {
      s.floor = n.id;
      if (s.page === "house") s.page = "home"; // #89: a floor picked = that floor (landscape: its plan)
      this._kick(true);
    }
  },

  /** #22: the main floor: the floor (a plan with a level) with the most devices; ties: the ground floor. */
  _mainFloor(m) {
    const cand = m.floors.filter((f) => Number.isFinite(f.level));
    return (cand.length ? cand : m.floors).map((f) => [f, m.items.filter((x) => x.floor === f.id).length]).sort((p, q) => q[1] - p[1] || (q[0].level === 0) - (p[0].level === 0))[0][0].id;
  },

  // ------------------------------------------------------------- navigation
  _go(next) {
    if (next.page === "room" && !lsGet("dfm_hint_p")) lsSet("dfm_hint_p", 1); // #92-6: the portrait hint has done its job
    const s = this._s;
    s.back.push({ page: s.page, floor: s.floor, room: s.room, ov: s.ov });
    if (s.back.length > 30) s.back.shift();
    Object.assign(s, next);
    this._sheet = null;
    this._frozen = null;
    this._kick(true);
    const pg = this.shadowRoot && this.shadowRoot.querySelector("[data-scroll=pg]");
    if (pg) pg.scrollTop = 0;
  },

  _back() {
    const s = this._s;
    if (this._land()) {
      // Landscape: the chosen room off, then the 3D Home (#107).
      if (s.page === "room") Object.assign(s, { page: "home", room: null });
      else if (this._m.levels.length > 1) Object.assign(s, { page: "house", room: null });
      this._kick(true);
      return;
    }
    const p = s.back.pop();
    if (p) Object.assign(s, p);
    else Object.assign(s, { page: "home", room: null });
    this._kick(true);
  },

  _more(eid) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
  },

  _touched() {
    for (const el of (this._plans || new Map()).values()) if (el.isConnected) this._feed(el, true); // #103: a tap: all up to date
    if (!this._land()) return;
    const was = this._hdrHidden;
    this._hdrShow = Date.now();
    if (was) {
      this._hdrHidden = false;
      const h = this.shadowRoot.querySelectorAll(".float");
      for (const x of h) x.classList.remove("gone");
    }
    this._hdrTimer();
  },

  _hdrTimer() {
    clearTimeout(this._hdrT);
    this._hdrT = setTimeout(() => {
      this._hdrHidden = true;
      for (const x of this.shadowRoot.querySelectorAll(".float")) x.classList.add("gone");
    }, 5000);
  },

  _click(e) {
    const t = e.target.closest("[data-a]");
    if (!t) return;
    const a = t.dataset.a;
    const v = t.dataset.v;
    const s = this._s;
    if (a === "back") return this._back();
    if (a === "menu") return this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    const open = (sh) => {
      this._sheet = sh;
      this._freeze = true;
      this._frozen = null;
      return this._kick(true);
    };
    if (a === "tab") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: v, room: null });
    }
    if (a === "house") return this._go({ page: "house", room: null });
    // #85: the place pill and "See all" of Rooms open the Navigator (Home, floors, their rooms).
    if (a === "home" || a === "nav") return open({ step: "nav" });
    if (a === "appl") return open({ step: "appl", key: v });
    if (a === "appldone") {
      const x = this._m.items.find((q) => q.ap && q.item.id === v);
      if (x && x.h._applDone) {
        delete x.h._applDone[v];
        if (x.h._applSave) x.h._applSave();
      }
      return this._kick(true);
    }
    // #71: a floor picked in the Navigator: Home shows that floor (its plan, rooms and values).
    if (a === "sheet-floor") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "home", floor: v, room: null });
    }
    if (a === "items") {
      const n = this._m ? this._floorItems(this._m, s.floor, v).length : 0;
      this._sheet = { step: "items", floor: s.floor, kind: v, title: { open: dfT("mob.openings"), cover: dfT("mob.shutters"), alarm: dfT("mob.alert"), offline: dfT("mob.n_offline", { n }), low: dfT("mob.n_low", { n }), warn: dfT("mob.n_warn", { n }) }[v] || "" };
      this._freeze = true;
      this._frozen = null;
      return this._kick(true);
    }
    if (a === "close") {
      this._sheet = null;
      this._freeze = false;
      return this._kick(true);
    }
    if (a === "floor") return this._go({ page: "home", floor: v, room: null }); // #107: landscape: that floor's plan
    if (a === "room") {
      const [f, r] = v.split("|");
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "room", floor: f, room: r });
    }
    // #89: Home = the whole home: portrait shows the main floor's Home page, landscape the 3D home.
    if (a === "gohome") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "house", room: null, floor: this._mainFloor(this._m) });
    }
    if (a === "ovs") {
      this._sheet = { step: "ov", ov: v };
      return this._kick(true);
    }
    if (a === "issues") {
      this._sheet = { step: "issues" };
      return this._kick(true);
    }
    if (a === "grid") {
      const g = lsGet("dfm_grid") || {};
      g[v] = !g[v];
      lsSet("dfm_grid", g);
      return this._kick(true);
    }
    if (a === "scene") return this._scene(v);
    if (a === "oact") {
      const x = ((this._base || {}).overlay_actions || [])[Number(v)];
      const h = this._helper(this._m.floors.find((q) => q.id === s.floor) || this._m.floors[0]);
      const ent = x && h ? h._ovActEnt(x) : null;
      if (x && x.tap_action && h) h._barRun.call(Object.assign(Object.create(h), { dispatchEvent: (ev) => this.dispatchEvent(ev) }), x.tap_action, ent);
      else if (ent) this._more(ent);
      return;
    }
    if (a === "rmaster") {
      const ents = v.split(",");
      const on = t.dataset.on === "1";
      this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: ents });
      return;
    }
    if (a === "lov") {
      // #104: the tapped overlay is shown as chosen at once; the plan's own redraw (the heavy part) comes right
      // after that is on the screen.
      this._lov = v;
      for (const b of this.shadowRoot.querySelectorAll(".lrail .lr")) b.classList.toggle("on", b.dataset.v === v);
      requestAnimationFrame(() => setTimeout(() => {
        const t0 = performance.now();
        for (const el of (this._plans || new Map()).values()) if (el.isConnected && el._dfmMode === "land" && el.dfSetOverlay) el.dfSetOverlay(v);
        this._dbg(`plan → ${v}: ${(performance.now() - t0).toFixed(0)} ms`);
        this._kick(true);
      }, 0));
      return;
    }
    if (a === "step") return this._step(Number(v), t.dataset.z);
    if (a === "fstep") return this._step(Number(v), "floor");
    if (a === "more") return this._more(v);
    if (a === "tog") {
      e.stopPropagation();
      const st = this._hass.states[v];
      if (!st) return;
      const d = domainOf(v);
      const svc = d === "cover" ? "toggle" : d === "media_player" ? (st.state === "off" ? "turn_on" : "turn_off") : "toggle";
      this._hass.callService(d, svc, { entity_id: v });
      t.classList.toggle("on");
      this._flash(v);
      return;
    }
    if (a === "gfold") {
      const gf = lsGet("dfm_gfold") || {};
      gf[v] = !gf[v];
      lsSet("dfm_gfold", gf);
      return this._kick(true);
    }
    if (a === "fold") {
      lsSet("dfm_fold", !lsGet("dfm_fold"));
      return this._kick(true);
    }
    if (a === "search") return;
  },

  /** #49: the main card's light scenes (All on / All off for the lights shown here). */
  _scene(id) {
    const ents = this._members("lights", this._m.items).map((x) => x.lead).filter((e) => e && TOGGLE_DOMAINS.has(domainOf(e)) && domainOf(e) !== "cover");
    if (id === "all_off") return ents.length && this._hass.callService("homeassistant", "turn_off", { entity_id: ents });
    if (id === "all_on") return ents.length && this._hass.callService("homeassistant", "turn_on", { entity_id: ents });
    const h = this._helper(this._m.floors[0]);
    if (h) DeviceFloorplanCard.prototype._runScene.call(h, id);
  },

  /** #41: a quick action shows on the plan above: the device's marker lights up for a few seconds. */
  _flash(eid) {
    const x = (this._m.items || []).find((i) => i.lead === eid || i.ents.includes(eid));
    if (!x) return;
    setTimeout(() => {
      const el = [...(this._plans || new Map()).values()].find((p) => p.isConnected && p._dfmFloor === x.floor);
      if (!el || !el._specs || !el._highlight) return;
      const sp = [...el._specs.values()].find((q) => q.item && q.item.id === x.item.id);
      if (sp) el._highlight(sp.key);
    }, 700);
  },

  _input(e) {
    const t = e.target;
    if (t.dataset.a === "q") {
      this._q = t.value;
      clearTimeout(this._qT);
      this._qT = setTimeout(() => {
        this._render();
        const q = this.shadowRoot.querySelector("[data-a=q]");
        if (q) {
          q.focus();
          q.setSelectionRange(q.value.length, q.value.length);
        }
      }, 250);
    }
    if (t.dataset.a === "bri") this._busy = true; // no redraws while the slider moves
  },

  _change(e) {
    const t = e.target;
    if (t.dataset.a === "bri") {
      this._busy = false;
      // Saved once, when the finger lets go (never per step).
      this._hass.callService("light", "turn_on", { entity_id: t.dataset.v, brightness_pct: Number(t.value) });
    }
  },
});
// Mobile card, portrait: the Home, room and Control pages, their rows, tiles and bars (split from 26-mobile, #86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** #96: the Home sections to show, in order (all four by default). */
  _secOrder() {
    const v = this._config.sections;
    return Array.isArray(v) && v.length ? v.filter((x) => DFM_SECTIONS.includes(x)) : DFM_SECTIONS;
  },

  /** #91: the greeting on one line, always whole: its font shrinks to the space (18 → 13 px); if even that is
   *  too long, the climate card gives up width first. Measured, so any name and language fits. */
  _fitGreet() {
    const hd = this.shadowRoot && this.shadowRoot.querySelector(".hd.top");
    const h1 = hd && hd.querySelector(".h1");
    if (!h1 || !h1.clientWidth) return;
    // #102: measured only when the text or the space changed; otherwise the last result is put back (the redraw
    // resets it) without measuring again.
    const key = `${h1.textContent}|${hd.clientWidth}`;
    const g = this._greetFit;
    if (g && g.key === key) {
      hd.style.setProperty("--dfm-greet", `${g.px}px`);
      hd.classList.toggle("tight", g.tight);
      return;
    }
    hd.classList.remove("tight"); // in the same frame: no flicker
    let px = 18;
    hd.style.setProperty("--dfm-greet", `${px}px`);
    while (h1.scrollWidth > h1.clientWidth + 1 && px > 13) hd.style.setProperty("--dfm-greet", `${--px}px`);
    if (h1.scrollWidth > h1.clientWidth + 1) hd.classList.add("tight");
    this._greetFit = { key, px, tight: hd.classList.contains("tight") };
  },

  // ------------------------------------------------------------- shared pieces
  _stateTxt(x) {
    const st = x.st;
    if (!st) return "";
    if (x.offline) return dfT("mob.offline");
    let s = "";
    try {
      s = this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    } catch (_e) {
      s = st.state;
    }
    if (x.lk === "light" && st.state === "on" && num(st.attributes.brightness)) s += ` · ${Math.round((st.attributes.brightness / 255) * 100)}%`;
    if (x.lk === "climate" && st.state !== "off") {
      const tg = st.attributes.temperature;
      if (num(tg)) s = dfT("mob.climate_to", { s, t: tg });
    }
    // #66: an AC that is off still says the room's temperature.
    if (x.lk === "climate" && st.state === "off" && num(st.attributes.current_temperature)) s += ` · ${Math.round(Number(st.attributes.current_temperature) * 10) / 10}°`;
    return s;
  },

  /** #67: "13 minutes ago" in Home Assistant's language. */
  _ago(ts) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) return "";
    const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || "en";
    if (!this._rtf || this._rtfL !== lang) {
      try {
        this._rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      } catch (_e) {
        this._rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      }
      this._rtfL = lang;
    }
    const sec = Math.max(0, (Date.now() - t) / 1000);
    if (sec < 60) return this._rtf.format(0, "second");
    const [u, d] = sec < 3600 ? ["minute", 60] : sec < 86400 ? ["hour", 3600] : ["day", 86400];
    return this._rtf.format(-Math.floor(sec / d), u);
  },

  /** #67: the icon of a row: the device's own, the entity's own, else by what it is and its state (open / closed …). */
  _iconOf(x) {
    const own = ((this._base || {}).devices || {})[x.item.id];
    if (own && own.icon) return own.icon;
    const st = x.st;
    if (!st) return null;
    if (st.attributes.icon) return st.attributes.icon;
    const on = ["on", "open", "opening", "unlocked", "unlocking"].includes(st.state);
    const dc = String(st.attributes.device_class || "");
    const nm = `${x.lead} ${x.name}`.toLowerCase();
    switch (x.lk) {
      case "opening":
        if (dc === "garage_door" || /garage/.test(nm)) return on ? "mdi:garage-open-variant" : "mdi:garage-variant";
        if (/slid|συρ/.test(nm)) return on ? "mdi:door-sliding-open" : "mdi:door-sliding";
        if (dc === "window" || /window|παράθ/.test(nm)) return on ? "mdi:window-open-variant" : "mdi:window-closed-variant";
        return on ? "mdi:door-open" : "mdi:door-closed";
      case "motion":
        return ["occupancy", "presence"].includes(dc) ? (on ? "mdi:account" : "mdi:account-outline") : on ? "mdi:motion-sensor" : "mdi:motion-sensor-off";
      case "cover":
        if (["curtain"].includes(dc)) return on ? "mdi:curtains" : "mdi:curtains-closed";
        if (["blind", "shade"].includes(dc)) return on ? "mdi:blinds-open" : "mdi:blinds";
        if (dc === "garage") return on ? "mdi:garage-open-variant" : "mdi:garage-variant";
        return on ? "mdi:window-shutter-open" : "mdi:window-shutter";
      case "lock":
        return on ? "mdi:lock-open-variant" : "mdi:lock";
      case "temperature":
      case "humidity":
        return x.temps.length ? "mdi:thermometer" : "mdi:water-percent";
      case "safety":
        return on ? "mdi:alert-circle" : "mdi:shield-check-outline";
      default:
        return x.air.length && !x.temps.length ? "mdi:air-filter" : null; // the rest: Home Assistant's own icon
    }
  },

  /** #68: the colour of a row's icon says its state. */
  _stCls(x) {
    if (x.alarm.length) return "s-alarm";
    if (x.open.length) return "s-open";
    const st = x.st;
    if (!st || x.offline) return "";
    if (x.lk === "climate" && st.state !== "off") return st.state === "heat" ? "s-warm" : st.state === "cool" ? "s-cool" : "s-act";
    if (x.on) return ["light", "switch"].includes(x.lk) ? "s-on" : "s-act";
    if (["motion", "opening", "lock", "cover"].includes(x.lk) && ["on", "open", "opening", "unlocked"].includes(st.state)) return "s-act";
    return "";
  },

  _row(x, opts = {}) {
    const eid = x.lead;
    const st = x.st;
    const d = domainOf(eid);
    const tog = st && DFM_TOGGLE.has(d) && !x.offline && !(d === "cover" && !["open", "closed"].includes(st.state));
    const dim = d === "light" && st && st.state === "on" && (st.attributes.supported_color_modes || []).some((c) => c !== "onoff");
    const badges = [];
    if (x.offline) badges.push(`<b class="bd amber">${dfT("mob.offline")}</b>`);
    if (x.open.length) badges.push(`<b class="bd red">${x.open.includes(eid) ? dfT("mob.open") : dfT("mob.open_n", { n: x.open.length })}</b>`);
    if (x.alarm.length) badges.push(`<b class="bd red">${cesc(this._fmtE(x.alarm[0]))}</b>`);
    if (x.warn.length) badges.push(`<b class="bd amber">${cesc(this._fmtE(x.warn[0]))}</b>`);
    if (x.battery != null && x.battery <= 15) badges.push(`<b class="bd amber">${dfT("mob.battery", { n: Math.round(x.battery) })}</b>`);
    if (x.power != null && x.power >= 5 && !opts.noPower) badges.push(`<b class="bd">${cesc(fmtW(x.power))}</b>`);
    const extra = opts.value ? `<span class="val">${cesc(opts.value)}</span>` : "";
    const room = `${x.doorOpen ? ` · ${dfT("mob.door_open")}` : ""}${opts.room ? ` · ${cesc(opts.room)}` : ""}`;
    return `<div class="row ${x.on ? "on" : ""} ${x.attention ? "att" : ""}" data-a="more" data-v="${cesc(eid || "")}">
      <span class="tile ${this._stCls(x)}">${this._iconOf(x) ? `<ha-icon icon="${cesc(this._iconOf(x))}"></ha-icon>` : st ? `<ha-state-icon data-ent="${cesc(eid)}"></ha-state-icon>` : `<ha-icon icon="${DFM_GICON[x.g]}"></ha-icon>`}</span>
      <span class="txt"><span class="nm"><span class="t">${cesc(x.name)}</span>${badges.join("")}</span><span class="sub">${this._rowVals(x)}${room}</span>
      ${dim ? `<input type="range" class="bri" min="1" max="100" value="${Math.round((st.attributes.brightness || 255) / 2.55)}" data-a="bri" data-v="${cesc(eid)}" aria-label="${dfT("mob.brightness")}">` : ""}</span>
      ${extra}${tog ? `<button class="sw ${x.on || (st && st.state === "on") ? "on" : ""}" role="switch" aria-checked="${x.on}" data-a="tog" data-v="${cesc(eid)}" aria-label="${cesc(x.name)}"><i></i></button>` : ""}
    </div>`;
  },

  /** #51: an air / climate sensor shows all its readings in one line ("20.6° · 63% · PM2.5 6 · VOC 178" + its air dot). */
  // #66: a device that measures the room shows all its readings, temperature first; #67: on / off things say since when.
  _rowVals(x) {
    if (!x.offline && (x.air.length || ["temperature", "humidity"].includes(x.lk))) {
      const p = [x.temps.length ? `${Math.round(x.temps[0] * 10) / 10}°` : "", x.hums.length ? `${Math.round(x.hums[0])}%` : "", ...x.air.map((q) => `${q.label} ${q.v}`)].filter(Boolean).join(" · ");
      if (p) return `${x.air.length ? this._airDot(x.airR) : ""}${cesc(p)}`;
    }
    const t = cesc(this._stateTxt(x));
    const ago = x.st && !x.offline && DFM_AGO.has(x.lk) ? this._ago(x.st.last_changed) : "";
    return ago ? `${t} · <span class="ago">${cesc(ago)}</span>` : t;
  },

  _vals(r) {
    return [r.temp != null ? `${r.temp}°` : "", r.hum != null ? `${Math.round(r.hum)}%` : "", dfT("mob.n_devices", { n: r.items.length })].filter(Boolean).join(" · ");
  },

  _roomSub(r) {
    const p = [];
    if (r.attention) p.push(dfT("mob.n_attention", { n: r.attention }));
    if (r.on) p.push(dfT("mob.n_on", { n: r.on }));
    if (r.temp != null) p.push(`${r.temp}°`);
    if (r.people.length) p.push(r.people.map((pp) => this._pname(pp)).join(", "));
    return p.join(" · ") || dfT("mob.quiet");
  },

  _pname(p) {
    const st = this._hass.states[p.entity];
    return ((st && st.attributes.friendly_name) || p.entity).split(" ")[0];
  },

  _outside() {
    const w = Object.values(this._hass.states).find((s) => s.entity_id.startsWith("weather.") && num(s.attributes.temperature));
    return w ? `${Math.round(Number(w.attributes.temperature) * 10) / 10}${w.attributes.temperature_unit || "°"}` : null;
  },

  /** The devices of an overlay: what the Floorplan card shows there, with the user's settings (#25). */
  _members(o, list) {
    if (o === "live") return list.filter((x) => x.now.has("live") || x.attention);
    return list.filter((x) => x.ovs.has(o) && !(o === "security" && x.camOnly));
  },

  /** What an overlay has to say now for a set of devices (one line), or "" when there is nothing. */
  _sum(o, list, quiet = false) {
    const m = this._m;
    const mem = this._members(o, list);
    const n = (f) => mem.filter(f).length;
    if (o === "live") return mem.length ? dfT("mob.now_n", { n: mem.length }) : quiet ? dfT("mob.quiet") : "";
    if (o === "lights") {
      const k = n((x) => x.on);
      return k ? dfT("mob.n_on", { n: k }) : quiet ? dfT("mob.all_off") : "";
    }
    if (o === "comfort") {
      const t = dfmAvg(mem.flatMap((x) => x.temps));
      const ac = mem.find((x) => x.lk === "climate" && x.on);
      return [t != null ? `${t}°` : "", ac ? `${ac.name} · ${this._stateTxt(ac)}` : ""].filter(Boolean).join(" · ");
    }
    if (o === "security") {
      const k = mem.reduce((t, x) => t + x.open.length, 0);
      const al = n((x) => x.alarm.length);
      return al ? dfT("mob.alert") : k ? dfT("mob.open_n", { n: k }) : quiet ? dfT("mob.all_closed") : "";
    }
    if (o === "network") {
      const k = n((x) => x.offline);
      return k ? dfT("mob.n_offline", { n: k }) : quiet ? dfT("mob.all_online") : "";
    }
    if (o === "health") {
      const k = n((x) => x.battery != null && x.battery <= 15);
      const w = n((x) => x.warn.length);
      const t = [k ? dfT("mob.n_low", { n: k }) : "", w ? dfT("mob.n_warn", { n: w }) : ""].filter(Boolean).join(" · ");
      return t || (quiet ? dfT("mob.all_fine") : "");
    }
    if (o === "energy") {
      const w = mem.reduce((t, x) => t + (x.power || 0), 0);
      return w > 0 ? fmtW(w) : "";
    }
    if (o === "cleaning") {
      const r = mem.find((x) => x.on);
      return r ? `${r.name} · ${this._stateTxt(r)}` : "";
    }
    if (o === "people") return dfT("mob.n_home", { n: m.people.filter((p) => p.home).length });
    const k = n((x) => x.now.has(o));
    return k ? dfT("mob.n_shown", { n: k }) : "";
  },

  /** The devices an overlay lists in full, most important first. */
  _list(o, list) {
    const mem = this._members(o, list);
    const att = (a, b) => b.attention - a.attention || Number(b.now.has(o) || b.on) - Number(a.now.has(o) || a.on) || a.name.localeCompare(b.name);
    if (o === "network") return mem.sort((a, b) => Number(b.offline) - Number(a.offline) || a.name.localeCompare(b.name));
    if (o === "health") return mem.sort((a, b) => b.warn.length - a.warn.length || (a.battery ?? 101) - (b.battery ?? 101) || a.name.localeCompare(b.name));
    if (o === "energy") return mem.sort((a, b) => (b.power || 0) - (a.power || 0));
    return mem.sort(att);
  },

  _listHtml(o, list, roomNames) {
    const rows = this._list(o, list);
    if (!rows.length) return `<div class="none">${dfT("mob.nothing")}</div>`;
    const val = (x) => (o === "health" ? `${Math.round(x.battery)}%` : o === "network" && x.sigEnt ? this._fmtE(x.sigEnt) : "");
    return rows.map((x) => this._row(x, { value: val(x), room: roomNames ? this._roomName(x) : "" })).join("");
  },

  _fmtE(eid) {
    const st = this._hass.states[eid];
    if (!live(st)) return "—";
    try {
      return this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    } catch (_e) {
      return st.state;
    }
  },

  _roomName(x) {
    const r = this._m.rooms.find((q) => q.id === x.room && q.floor === x.floor);
    return r ? r.name : "";
  },

  _peopleHtml(people) {
    if (!people.length) return `<div class="none">${dfT("mob.no_people")}</div>`;
    return people.map((p) => {
      const where = p.room ? p.room.name : p.st ? this._fmtE(p.entity) : "";
      return `<div class="row" data-a="${p.room ? "room" : "more"}" data-v="${cesc(p.room ? `${p.room.floor}|${p.room.id}` : p.entity)}">
        <span class="av ${p.home ? "home" : ""}">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>
        <span class="txt"><span class="nm">${cesc(p.name)}</span><span class="sub">${cesc(where)}</span></span>
        ${p.room ? '<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>' : ""}</div>`;
    }).join("");
  },

  _thumb(f, room) {
    const ar = room && f.a.areas[room];
    const shape = ar && Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const ratio = f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6;
    const img = this._img(f);
    return `<span class="thumb" style="aspect-ratio:${ratio}" data-a="gohome" data-v="${cesc(f.id)}">${img ? `<img src="${cesc(img)}" alt="">` : ""}<svg viewBox="0 0 100 100" preserveAspectRatio="none">${shape ? `<polygon points="${shape.map((p) => p.join(",")).join(" ")}"/>` : ar ? `<ellipse cx="${ar.x}" cy="${ar.y}" rx="6" ry="6"/>` : ""}</svg></span>`;
  },

  /** The plan picture (signed once a day). */
  _img(f) {
    const url = f.a.image_url;
    if (!url) return "";
    this._imgs = this._imgs || {};
    if (this._imgs[url] === undefined) {
      this._imgs[url] = "";
      cardSign(this._hass, url).then((p) => {
        this._imgs[url] = p;
        this._kick(true);
      }).catch(() => {
        this._imgs[url] = url;
      });
    }
    return this._imgs[url];
  },

  // ------------------------------------------------------------- portrait
  _portHtml(m) {
    const s = this._s;
    let body = "";
    if (s.page === "room") body = this._roomPage(m);
    else if (s.page === "rooms") body = this._homePage(m); // #71: portrait has no separate floor page
    else if (s.page === "devices") body = this._devPage(m);
    else if (s.page === "people") body = this._pplPage(m);
    else if (s.page === "control") body = this._ctlPage(m);
    else body = this._homePage(m);
    const ctlOn = ["control", "devices", "people"].includes(s.page);
    // #85: ☰ · the place you are in (opens the Navigator) · Control: a tab bar, always there.
    const f = m.floors.find((q) => q.id === s.floor);
    const r = s.page === "room" ? m.rooms.find((q) => q.id === s.room && q.floor === s.floor) : null;
    const place = r ? r.name : m.floors.length > 1 && f && s.page !== "house" ? f.name : this._homeName();
    const bar = `<div class="barwrap"><nav class="bar">${this._hdrOn ? `<button class="tb" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : ""}<span class="pill2"><button class="ph ${ctlOn ? "" : "on"}" data-a="home"><ha-icon icon="${cesc(r ? r.icon : "mdi:home-outline")}"></ha-icon><span class="pt">${cesc(place)}</span><ha-icon class="up" icon="mdi:chevron-up"></ha-icon></button><i class="sep"></i><button class="pl ${ctlOn ? "on" : ""}" data-a="tab" data-v="control" aria-label="${dfT("mob.control")}"><ha-icon icon="mdi:view-dashboard-outline"></ha-icon>${ctlOn ? `<span class="pt">${dfT("mob.control")}</span>` : ""}</button></span></nav></div>`;
    // #54: the bar, the sheets and their backdrop live in a layer of their own on the page (fixed = the screen).
    this._layerHtml = `${bar}${this._sheet ? this._sheetHtml(m) : ""}`;
    const inline = !this._useLayer();
    return `<div class="port"><div class="bgfix"></div><div class="pg" data-scroll="pg">${body}<div class="pad"></div></div>${inline ? this._layerHtml : ""}</div>`;
  },

  /** #58: a section's title with its grid / row switch. */
  _secHead(key, icon, title, extra = "") {
    const grid = !!(lsGet("dfm_grid") || {})[key];
    return `<h2><ha-icon icon="${icon}"></ha-icon>${title}${extra}<button class="gt" data-a="grid" data-v="${key}" aria-label="${dfT(grid ? "mob.as_row" : "mob.as_grid")}"><ha-icon icon="${grid ? "mdi:view-carousel-outline" : "mdi:view-grid-outline"}"></ha-icon></button></h2>`;
  },

  _secBody(key, html) {
    const grid = !!(lsGet("dfm_grid") || {})[key];
    return `<div class="${grid ? "gridw" : "hs"}" data-scroll="h${key}">${html}</div>`;
  },

  /** #51: "Air good / moderate / poor" with its dot. */
  _airTxt(r) {
    return r == null ? "" : dfT(["mob.air_good", "mob.air_mod", "mob.air_poor"][r]);
  },

  _airDot(r) {
    return r == null ? "" : `<i class="adot a${r}"></i>`;
  },

  /** The real issues (open doors / windows, alarms, poor air), one entry each. */
  _issues(m) {
    const out = [];
    for (const x of m.items) {
      for (const e of x.alarm) out.push({ x, e, txt: x.name, st: this._fmtE(e), p: 0 });
      for (const e of x.open) out.push({ x, e, txt: x.name, st: this._fmtE(e), p: 2 });
    }
    for (const r of m.rooms) if (r.airR === 2) {
      const worst = r.items.flatMap((x) => x.air).filter((q) => q.r === 2)[0];
      out.push({ room: r, e: null, txt: dfT("mob.air_poor"), st: worst ? `${worst.label} ${worst.v}` : "", p: 1 });
    }
    // #92-3: the most important first (alarms, poor air, then open), the latest first inside each.
    const t = (i) => Date.parse(((i.e && this._hass.states[i.e]) || {}).last_changed || "") || 0;
    return out.sort((a, b) => a.p - b.p || t(b) - t(a));
  },

  /** #64: a floor's devices for the bar under the plan: "open" = doors / windows, "cover" = shutters, "alarm" = alarms. */
  _floorItems(m, floor, kind) {
    const fi = m.items.filter((x) => x.floor === floor);
    // #87: the ones that are open first; inside each group the latest change first.
    const t = (x) => Date.parse((x.st && x.st.last_changed) || "") || 0;
    const by = (first) => (a, b) => Number(first(b)) - Number(first(a)) || t(b) - t(a);
    if (kind === "open") return fi.filter((x) => x.nOpen).sort(by((x) => x.open.length > 0));
    if (kind === "cover") return fi.filter((x) => x.ents.some((e) => domainOf(e) === "cover")).sort(by((x) => x.on));
    if (kind === "alarm") return fi.filter((x) => x.alarm.length).sort(by(() => true));
    // #117: the top bar's lists, by the same rules as its numbers.
    if (kind === "offline") return fi.filter((x) => x.offline).sort(by(() => true));
    if (kind === "low") return fi.filter((x) => x.battery != null && x.battery <= 15).sort((a, b) => a.battery - b.battery);
    if (kind === "warn") return fi.filter((x) => x.warn.length).sort(by(() => true));
    return [];
  },

  /** #64: one full-width bar of equal segments (icon + value); a segment opens its list. */
  _segBar(segs, cls = "") {
    const on = segs.filter(Boolean);
    return on.length ? `<div class="segs ${cls}">${on.map((g) => `<button class="seg ${g.tone || ""}" data-a="${g.a}" data-v="${cesc(g.v || "")}" aria-label="${cesc(g.label)}"><ha-icon icon="${g.icon}"></ha-icon>${g.txt != null ? `<span>${cesc(String(g.txt))}</span>` : ""}</button>`).join("")}</div>` : "";
  },

  _homePage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const hr = new Date().getHours();
    const user = this._hass.user || {};
    const first = String(user.name || "").split(" ")[0];
    const me = m.people.find((p) => p.st && p.st.attributes.user_id && p.st.attributes.user_id === user.id);
    const greet = dfT(hr < 12 ? "mob.morning" : hr < 18 ? "mob.afternoon" : "mob.evening") + (first ? `, ${first}` : "");
    const home = m.people.filter((p) => p.home).length;
    const iss = this._issues(m);
    // #92-3: what needs a look, led by the most important issue itself; a tap opens the list.
    const lead = iss[0] ? (iss[0].x ? `${iss[0].txt} · ${iss[0].st}` : `${iss[0].txt} · ${iss[0].room.name}`) : "";
    const sumLine = cesc(m.people.length ? dfT("mob.k_of_n_home", { k: home, n: m.people.length }) : "") + (m.people.length ? " · " : "")
      + (iss.length ? `<button class="isslink" data-a="issues">${cesc(lead)}${iss.length > 1 ? ` <b>+${iss.length - 1}</b>` : ""}</button>` : cesc(dfT("mob.all_good")));
    // #65: the shown floor's climate (its rooms); a floor without any: the main floor's, named.
    const multi = m.floors.length > 1;
    const climOf = (fid) => {
      const rs = m.rooms.filter((r) => r.floor === fid);
      const ar = rs.filter((r) => r.airR != null);
      return { t: dfmAvg(rs.filter((r) => r.temp != null).map((r) => r.temp)), h: dfmAvg(rs.filter((r) => r.hum != null).map((r) => r.hum)), air: ar.length ? Math.max(...ar.map((r) => r.airR)) : null };
    };
    let cf = f.id;
    let cl = climOf(f.id);
    if (cl.t == null && cl.h == null && cl.air == null) {
      cf = this._mainFloor(m);
      cl = climOf(cf);
    }
    const out = this._outside();
    const inLine = [cl.t != null ? `${cl.t}°` : "", cl.h != null ? `${Math.round(cl.h)}%` : ""].filter(Boolean).join(" · ");
    const cfName = multi ? (m.floors.find((q) => q.id === cf) || {}).name || "" : "";
    const clim = out || inLine || cl.air != null ? `<button class="clim" data-a="ovs" data-v="comfort">${out ? `<span class="cl"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><b>${cesc(out)}</b><small>${dfT("mob.outside")}</small></span>` : ""}${inLine ? `<span class="cl"><ha-icon icon="mdi:home-thermometer-outline"></ha-icon><b>${cesc(inLine)}</b>${cfName ? `<small>${cesc(cfName)}</small>` : ""}</span>` : ""}${cl.air != null ? `<span class="cl"><ha-icon icon="mdi:air-filter"></ha-icon>${this._airDot(cl.air)}<b>${cesc(this._airTxt(cl.air))}</b></span>` : ""}</button>` : "";
    // #64 / #74: what is going on on the shown floor: icon + number, zero hidden.
    const fi = m.items.filter((x) => x.floor === f.id);
    const lightsAll = this._members("lights", fi);
    const lightsOn = lightsAll.filter((x) => x.on).length;
    const off = fi.filter((x) => x.offline).length;
    const low = fi.filter((x) => x.battery != null && x.battery <= 15).length;
    const wn = fi.filter((x) => x.warn.length).length;
    // #116: the top bar is only what needs a look (gone when nothing does); #117: each opens exactly what it counts.
    const top = this._segBar([
      off && { a: "items", v: "offline", icon: "mdi:lan-disconnect", txt: off, label: dfT("mob.n_offline", { n: off }), tone: "warn" },
      low && { a: "items", v: "low", icon: "mdi:battery-alert-variant-outline", txt: low, label: dfT("mob.n_low", { n: low }), tone: "warn" },
      wn && { a: "items", v: "warn", icon: "mdi:alert-outline", txt: wn, label: dfT("mob.n_warn", { n: wn }), tone: "warn" },
    ]);
    // #64: under the plan, like the Wallpanel's row: this floor's openings and shutters, the house's alarm.
    const nAl = fi.reduce((t, x) => t + x.alarm.length, 0);
    const opDev = fi.filter((x) => x.nOpen);
    const nOp = opDev.reduce((t, x) => t + x.open.length, 0);
    const covs = [...new Set(fi.flatMap((x) => x.ents.filter((e) => domainOf(e) === "cover")))];
    const nCv = covs.filter((e) => ["open", "opening"].includes((this._hass.states[e] || {}).state)).length;
    const acp = Object.keys(this._hass.states).filter((e) => e.startsWith("alarm_control_panel.") && live(this._hass.states[e]));
    const ast = acp.length ? this._hass.states[acp[0]] : null;
    const aTone = !ast ? "" : ast.state === "triggered" ? "att" : ["arming", "pending"].includes(ast.state) ? "warn" : ast.state.startsWith("armed") ? "act" : "";
    const bottom = this._segBar([
      // #116: lights belong to the floor's state, under its plan (first: the one used most).
      lightsAll.length && { a: "ovs", v: "lights", icon: lightsOn ? "mdi:lightbulb-group" : "mdi:lightbulb-group-off-outline", txt: lightsOn || dfT("scene.all_off"), label: dfT("mob.lights_on", { n: lightsOn }), tone: lightsOn ? "lt" : "" },
      nAl && { a: "items", v: "alarm", icon: "mdi:alarm-light", txt: nAl, label: dfT("mob.alert"), tone: "att" },
      opDev.length && { a: "items", v: "open", icon: nOp ? "mdi:door-open" : "mdi:door-closed", txt: nOp ? dfT("mob.open_n", { n: nOp }) : dfT("mob.all_closed"), label: dfT("mob.openings"), tone: nOp ? "att" : "" },
      covs.length && { a: "items", v: "cover", icon: nCv ? "mdi:roller-shade" : "mdi:roller-shade-closed", txt: nCv ? dfT("mob.open_n", { n: nCv }) : dfT("mob.all_closed"), label: dfT("mob.shutters"), tone: nCv ? "act" : "" },
      ast && { a: "more", v: acp[0], icon: ast.state.startsWith("armed") || ast.state === "triggered" ? "mdi:shield-lock" : "mdi:shield-off-outline", txt: this._fmtE(acp[0]), label: dfT("mob.alarm_panel"), tone: aTone },
    ], "below");
    const rooms = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
    const cams = this._cams(m);
    const appls = m.items.filter((x) => x.ap);
    // #75: a floor with one room shows that room's groups here (no room level).
    const one = rooms.length === 1 ? rooms[0] : null;
    const see = (a, v = "") => `<button class="seeall" data-a="${a}" data-v="${cesc(v)}">${dfT("mob.see_all")}<ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    const avatar = me && me.pic ? `<span class="me"><img src="${cesc(me.pic)}" alt=""></span>` : "";
    // #96: the sections in the order (and only those) chosen in the editor.
    const sec = {
      rooms: one ? `<section class="oneroom"><h2 class="sh1"><span class="rtile"><ha-icon icon="${cesc(one.icon)}"></ha-icon></span>${cesc([one.name, this._vals(one)].filter(Boolean).join(" · "))}</h2>${this._roomGroups(one)}</section>`
        : `<section>${this._secHead("rooms", "mdi:floor-plan", multi ? `${dfT("mob.rooms")} · ${cesc(f.name)}` : dfT("mob.rooms"), see("nav"))}${this._secBody("rooms", rooms.map((r) => this._tile(m, r)).join(""))}</section>`,
      control: `<section>${this._secHead("ctl", "mdi:view-dashboard-outline", `${dfT("mob.home_control")}<small class="scope">${dfT("mob.whole_home")}</small>`, see("tab", "control"))}${this._secBody("ctl", this._ovTiles(m))}</section>`,
      appliances: appls.length ? `<section>${this._secHead("appl", "mdi:washing-machine", dfT("mob.appliances"))}${this._secBody("appl", appls.map((x) => this._applTile(x)).join(""))}</section>` : "",
      cameras: cams.length ? `<section>${this._secHead("cams", "mdi:cctv", dfT("mob.cameras"))}${this._secBody("cams", cams.map((c) => this._camTile(m, c)).join(""))}</section>` : "",
    };
    return `<header class="hd top">${avatar}<div class="grow"><div class="h1">${cesc(greet)}</div><div class="sub">${sumLine}</div></div>${clim}</header>
      ${top}
      <div class="mini" data-swipe="floor">${this._slot(f.id, "live", "", "mini")}${this._planNav(m, f)}${rooms.length > 1 && !lsGet("dfm_hint_p") ? `<div class="phint">${dfT("mob.hint_port")}</div>` : ""}</div>
      ${bottom}
      ${this._secOrder().map((k) => sec[k] || "").join("")}`;
  },

  /** #48: the floor's name and ‹ › on the plan itself (no row); swipe does the same. */
  _planNav(m, f) {
    const multi = m.floors.length > 1;
    return `<span class="flabel">${cesc(f.name)}</span>${multi ? `<button class="nav l" data-a="fstep" data-v="1" aria-label="${dfT("mob.floor_up")}"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button class="nav r" data-a="fstep" data-v="-1" aria-label="${dfT("mob.floor_down")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}`;
  },

  /** #50: every placed device with a camera (its camera entity), robots' maps excepted. */
  _cams(m) {
    const out = [];
    for (const x of m.items) {
      if (x.ents.some((e) => domainOf(e) === "vacuum" || domainOf(e) === "lawn_mower")) continue;
      // #90 (as Dwains): hidden, unknown and unavailable cameras are left out.
      const cam = x.ents.find((e) => domainOf(e) === "camera" && live(this._hass.states[e]) && !dfcHidden(e));
      if (cam) out.push({ x, cam });
    }
    return out;
  },

  _camTile(m, c) {
    const st = this._hass.states[c.cam];
    // #90: the still picture, renewed whenever the camera updates; a tap opens HA's own camera window.
    const pic0 = st && st.state !== "unavailable" && st.attributes.entity_picture;
    const pic = pic0 ? `${pic0}${pic0.includes("?") ? "&" : "?"}dfm=${Date.parse(st.last_updated || st.last_changed) || 0}` : "";
    const nm = c.x.name || (st && st.attributes.friendly_name) || c.cam;
    return `<button class="cam" data-a="more" data-v="${cesc(c.cam)}">${pic ? `<img src="${cesc(pic)}" alt="">` : `<span class="noimg"><ha-icon icon="mdi:cctv-off"></ha-icon></span>`}<b>${cesc(nm)}</b><small>${cesc([this._roomName(c.x), this._fmtE(c.cam)].filter(Boolean).join(" · "))}</small></button>`;
  },

  /** 0.13.9.18 Appliances: what it is doing, in one line (running: word · time left; idle: when it last ran). */
  _applLine(x, st) {
    this._lr = this._lr || {};
    const id = x.item.id;
    if (st.active) {
      this._lr[id] = { run: true };
      return [st.word, st.time].filter(Boolean).join(" · ");
    }
    if (st.phase === "idle") {
      const t = this._lastRun(x);
      return t ? dfT("mob.last_run", { t: this._ago(new Date(t).toISOString()) }) : st.word;
    }
    return st.word;
  },

  /** 0.14.2: when the appliance last finished, from Home Assistant's history (survives restarts; the entities'
   *  last_changed is reset by every restart). Asked once per appliance, then kept; seen stopping → now.
   *  Nothing found (not recorded, no run in 7 days, only a power reading) → null: the tile just says Idle. */
  _lastRun(x) {
    const ap = x.ap;
    const id = x.item.id;
    const c = this._lr[id];
    if (c && c.run) return (this._lr[id] = { t: Date.now() }).t; // it was running while we watched
    if (c) return c.t || null;
    const src = ap.running ? [ap.running, (v) => v === "on"]
      : ap.status ? [ap.status, (v) => ["water", "spin", "heat", "run", "attention"].includes(applPhase(v))]
      : ap.plug || x.item.main_entity ? [ap.plug || x.item.main_entity, (v) => ["on", "running", "printing", "heating", "cleaning", "brewing", "mowing", "drying", "washing"].includes(v)]
      : null;
    this._lr[id] = { t: null };
    if (!src || !this._hass) return null;
    const [eid, isOn] = src;
    this._hass
      .callWS({ type: "history/history_during_period", start_time: new Date(Date.now() - 7 * 86400000).toISOString(), entity_ids: [eid], minimal_response: true, no_attributes: true, significant_changes_only: false })
      .then((r) => {
        let on = false;
        let t = null;
        for (const h of (r && r[eid]) || []) {
          const v = h.s ?? h.state;
          const at = h.lu != null ? h.lu * 1000 : Date.parse(h.last_updated || h.last_changed);
          if (v === "unavailable" || v === "unknown") continue; // a restart in between is not a stop
          const now = isOn(v);
          if (on && !now && Number.isFinite(at)) t = at;
          on = now;
        }
        const cur = this._lr[id];
        if (cur && !cur.run && cur.t == null && t) {
          this._lr[id] = { t };
          this._kick(true);
        }
      })
      .catch(() => {});
    return null;
  },

  _applPct(x, st) {
    const pr = x.ap.progress && this._hass.states[x.ap.progress];
    return st.active && pr && num(pr.state) ? Math.max(0, Math.min(100, Number(pr.state))) : null;
  },

  _applTile(x) {
    const st = x.h._applState(x.ap);
    const pic = x.item.pic && x.item.pic.src ? x.h._picUrl(x.item.pic.src) : null;
    const pct = this._applPct(x, st);
    const tone = ["done"].includes(st.phase) ? "done" : ["attention", "error"].includes(st.phase) ? "att" : st.active ? "run" : "";
    return `<button class="apt ${tone}" data-a="appl" data-v="${cesc(`${x.floor}|${x.item.id}`)}"${pct != null ? ` style="--p:${pct}"` : ""}><span class="api ${pct != null ? "ring" : ""}">${pic ? `<img src="${cesc(pic)}" alt="">` : `<ha-icon icon="${APPL_ICON[x.ap.type] || APPL_ICON.other}"></ha-icon>`}</span><b>${cesc(x.name)}</b><small>${cesc(this._applLine(x, st))}</small></button>`;
  },

  /** #77: the home's own name (HA → Settings → General), else "Home". */
  _homeName() {
    const n = String((this._hass.config && this._hass.config.location_name) || "").trim();
    return n && n.toLowerCase() !== "home" ? n : dfT("mob.home");
  },

  /** #85: Control: every overlay as a rich tile (the same tiles as Home control), all devices, a 2-column grid. */
  _ctlPage(m) {
    const all = `<button class="ot" data-a="tab" data-v="devices" style="--c:#8a8f98"><span class="oti"><ha-icon icon="mdi:devices"></ha-icon></span><b>${dfT("mob.all_devices")}</b><small>${cesc(dfT("mob.n_devices", { n: m.items.length }))}</small></button>`;
    const appls = m.items.filter((x) => x.ap);
    const ap = appls.length ? `<button class="ot" data-a="ovs" data-v="appl" style="--c:#26a69a"><span class="oti"><ha-icon icon="mdi:washing-machine"></ha-icon></span><b>${dfT("mob.appliances")}</b><small>${cesc(appls.filter((x) => x.h._applState(x.ap).active).length ? dfT("mob.n_on", { n: appls.filter((x) => x.h._applState(x.ap).active).length }) : dfT("mob.quiet"))}</small></button>` : "";
    return `<header class="hd"><div class="grow"><div class="h1">${dfT("mob.control")}</div><div class="sub">${cesc(this._homeName())}</div></div></header><div class="ctlgrid">${this._ovTiles(m)}${ap}${all}</div>`;
  },

  /** #56 / #57: a room tile: its icon, one badge per overlay with something to say (max 4 + "+n"), its name and values. */
  _tile(m, r) {
    const line = [r.temp != null ? `${r.temp}°` : "", r.hum != null ? `${Math.round(r.hum)}%` : "", r.airR != null ? this._airTxt(r.airR) : ""].filter(Boolean).join(" · ");
    return `<button class="rt" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rti"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="bds">${this._badges(m, r)}</span><b>${cesc(r.name)}</b><small>${r.airR != null ? this._airDot(r.airR) : ""}${cesc(line || dfT("mob.n_devices", { n: r.items.length }))}</small></button>`;
  },

  /** #71: a room's overlay badges, built once for its tile and its row. */
  _badges(m, r) {
    const f = m.floors.find((q) => q.id === r.floor);
    const bd = [];
    for (const o of this._overlayList(f)) {
      const mem = this._members(o, r.items);
      let v = null;
      if (o === "security") v = r.items.reduce((t, x) => t + x.open.length + x.alarm.length, 0) || null;
      else if (o === "lights") v = mem.filter((x) => x.on).length || null;
      else if (o === "comfort") v = mem.filter((x) => x.lk === "climate" && x.on).length || null;
      else if (o === "energy") v = r.power >= 1 ? fmtW(r.power) : null;
      else if (o === "network") v = r.offline || null;
      else if (o === "health") v = r.low + r.warns || null;
      else if (o === "cleaning") v = mem.filter((x) => x.on).length || null;
      else if (o === "people") v = r.people.length || null;
      else if (o !== "live" && o !== "plan") v = mem.filter((x) => x.now.has(o)).length || null;
      if (v) bd.push([DFM_BPRIO[o] ?? 5, `<b class="tb2" style="--c:${DFM_OVC[o] || "#8a8f98"}"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon>${cesc(String(v))}</b>`]);
    }
    if (!bd.length && r.people.length) bd.push([6, `<b class="tb2" style="--c:${DFM_OVC.people}"><ha-icon icon="mdi:account"></ha-icon>${r.people.length}</b>`]);
    // #92-13: no "+n": only the most important ones that fit (3), never over the room's name.
    return bd.sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]).join("");
  },

  /** #60: "Home control": one big tile per overlay; a tap opens its sheet. */
  _ovTiles(m) {
    const f = m.floors.find((q) => q.id === this._s.floor);
    const ovs = this._overlayList(f).filter((o) => o !== "live" && o !== "plan");
    if (m.people.length && !ovs.includes("people")) ovs.unshift("people");
    const tiles = ovs.map((o) => {
      const t = o === "people" ? dfT("mob.k_of_n_home", { k: m.people.filter((p) => p.home).length, n: m.people.length }) : this._sum(o, m.items, true);
      let body = "";
      if (o === "people") body = `<span class="pchips">${m.people.slice(0, 4).map((p) => `<span class="pc ${p.home ? "home" : ""}"><span class="av">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>${cesc(p.name.split(" ")[0])}</span>`).join("")}${m.people.length > 4 ? `<span class="pc">+${m.people.length - 4}</span>` : ""}</span>`;
      if (o === "energy") {
        const rs = m.rooms.filter((r) => r.power >= 1).sort((a, b) => b.power - a.power).slice(0, 3);
        const max = rs.length ? rs[0].power : 1;
        body = `<span class="bars">${rs.map((r) => `<span class="bar1"><span>${cesc(r.name)}</span><small>${cesc(fmtW(r.power))}</small><i style="width:${Math.max(4, (r.power / max) * 100).toFixed(0)}%"></i></span>`).join("")}</span>`;
      }
      const quiet = !t || [dfT("mob.all_off"), dfT("mob.all_closed"), dfT("mob.all_online"), dfT("mob.all_fine"), dfT("mob.quiet")].includes(t);
      const att = o === "security" && /\d/.test(t);
      return `<button class="ot ${quiet ? "quiet" : ""} ${att ? "att" : ""}" data-a="ovs" data-v="${cesc(o)}" style="--c:${DFM_OVC[o] || "#8a8f98"}"><span class="oti"><ha-icon icon="${cesc(o === "people" ? OVERLAYS.people.icon : this._ovIcon(o, f))}"></ha-icon></span><b>${cesc(o === "people" ? OVERLAYS.people.label : this._ovLabel(o, f))}</b><small>${cesc(t || "")}</small>${body}</button>`;
    });
    return tiles.sort((a, b) => Number(a.includes(" quiet ")) - Number(b.includes(" quiet "))).join("");
  },

  /** #41 / #76: a room's devices by kind: one card per group (header inside, flat rows), each folds; Lights has
   *  the room's master switch like the Lights sheet. */
  _roomGroups(r) {
    const gfold = lsGet("dfm_gfold") || {};
    return DFM_GROUPS.map((g) => {
      const list = r.items.filter((x) => x.g === g).sort((a, b) => b.attention - a.attention || Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
      if (!list.length) return "";
      const sum = g === "lights" ? "" : this._sum(DFM_GOV[g] === "live" ? "live" : DFM_GOV[g], list) || "";
      const tg = g === "lights" ? list.filter((x) => x.st && DFM_TOGGLE.has(domainOf(x.lead)) && !x.offline) : [];
      const onN = tg.filter((x) => x.on).length;
      const master = tg.length ? `<button class="rmaster ${onN ? "on" : ""}" data-a="rmaster" data-v="${cesc(tg.map((x) => x.lead).join(","))}" data-on="${onN ? 1 : 0}">${onN}/${tg.length}<i></i></button>` : "";
      const fo = !!gfold[g];
      return `<section class="rcard gcard ${fo ? "folded" : ""}"><div class="rch" data-a="gfold" data-v="${g}"><span class="rtile gi g-${g}"><ha-icon icon="${DFM_GICON[g]}"></ha-icon></span><b>${dfmGroupLabel(g)}</b><span class="gs">${cesc(sum)}</span>${master}<span class="go"><ha-icon icon="mdi:chevron-${fo ? "right" : "down"}"></ha-icon></span></div>${fo ? "" : list.map((x) => this._row(x)).join("")}</section>`;
    }).join("");
  },

  _roomPage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const r = m.rooms.find((q) => q.id === s.room && q.floor === f.id);
    const folded = !!lsGet("dfm_fold");
    const groups = this._roomGroups(r);
    // #33 / #42: one plan band (a third of the screen), the room centred, controls floating on it.
    const foldBtn = `<button class="fold ${folded ? "off" : ""}" data-a="fold" aria-label="${folded ? dfT("mob.show_plan") : dfT("mob.hide")}"><ha-icon icon="mdi:chevron-${folded ? "down" : "up"}"></ha-icon></button>`;
    const band = folded ? "" : `<div class="cut" data-swipe="room">${this._slot(f.id, "live", r.id, "room")}
        <button class="nav l" data-a="step" data-z="room" data-v="-1" aria-label="${dfT("mob.prev_room")}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="nav r" data-a="step" data-z="room" data-v="1" aria-label="${dfT("mob.next_room")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>${foldBtn}</div>`;
    return `<header class="hd room"><button class="bk" data-a="back" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${cesc(r.name)}</div><div class="sub">${r.airR != null ? this._airDot(r.airR) : ""}${cesc([this._vals(r), r.airR != null ? this._airTxt(r.airR) : ""].filter(Boolean).join(" · "))}</div></div>${this._thumb(f, r.id)}${folded ? foldBtn : ""}</header>
      ${band}
      ${groups || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  },

  _devPage(m) {
    const q = String(this._q || "").trim().toLowerCase();
    const list = m.items.filter((x) => !q || x.name.toLowerCase().includes(q) || this._roomName(x).toLowerCase().includes(q));
    const by = new Map();
    for (const x of list) {
      const k = x.room ? `${x.floor}|${x.room}` : `${x.floor}|`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(x);
    }
    const sec = [...by.entries()].map(([k, xs]) => {
      const [fid, rid] = k.split("|");
      const f = m.floors.find((z) => z.id === fid);
      const r = rid && m.rooms.find((z) => z.id === rid && z.floor === fid);
      const title = r ? `${r.name}${m.floors.length > 1 ? ` · ${f.name}` : ""}` : `${dfT("mob.no_room")}${m.floors.length > 1 ? ` · ${f.name}` : ""}`;
      return `<section><h2>${cesc(title)}<span class="gs">${xs.length}</span></h2>${xs.sort((a, b) => a.name.localeCompare(b.name)).map((x) => this._row(x)).join("")}</section>`;
    }).join("");
    return `<header class="hd"><button class="bk" data-a="tab" data-v="control" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${dfT("mob.devices")}</div><div class="sub">${dfT("mob.n_devices", { n: m.items.length })}</div></div></header>
      <div class="search"><ha-icon icon="mdi:magnify"></ha-icon><input data-a="q" type="search" value="${cesc(this._q || "")}" placeholder="${dfT("mob.search")}"></div>${sec || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  },

  _pplPage(m) {
    return `<header class="hd"><button class="bk" data-a="tab" data-v="control" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${dfT("mob.people")}</div><div class="sub">${dfT("mob.n_home", { n: m.people.filter((p) => p.home).length })}</div></div></header><div class="list">${this._peopleHtml(m.people)}</div>`;
  },
});
// Mobile card: the page layer and its sheets (Navigator, appliance, overlay, item and issue lists) (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** The page layer is used on a dashboard (not in the card editor's preview). */
  _useLayer() {
    return !!this._huiRoot() && !this._config.inline_bar;
  },

  _layerEl() {
    if (!this._lay) {
      const el = document.createElement("div");
      el.setAttribute("data-dfm-layer", "");
      const sr = el.attachShadow({ mode: "open" });
      sr.innerHTML = `<style>${DFM_CSS}</style><div class="dfm lay"></div>`;
      sr.addEventListener("click", (e) => this._click(e));
      sr.addEventListener("change", (e) => this._change(e));
      sr.addEventListener("input", (e) => this._input(e));
      this._lay = el;
    }
    if (!this._lay.isConnected) document.body.appendChild(this._lay);
    return this._lay;
  },

  _renderLayer(html) {
    if (!html) {
      if (this._lay) this._lay.remove();
      return;
    }
    const el = this._layerEl();
    el.toggleAttribute("dark", this.hasAttribute("dark"));
    const host = el.shadowRoot.querySelector("div.lay");
    if (html !== this._layHtml) {
      this._layHtml = html;
      const tpl = document.createElement("div");
      tpl.innerHTML = html;
      dfmMorph(host, tpl);
    }
    for (const x of el.shadowRoot.querySelectorAll("[data-ent]")) {
      x.hass = this._hass;
      x.stateObj = this._hass.states[x.dataset.ent];
    }
  },

  /** 0.13.9.18: an appliance's details: picture, status, program, progress, time, door, power, energy, last run. */
  _applSheet(m, key) {
    const x = m.items.find((q) => q.ap && `${q.floor}|${q.item.id}` === key);
    if (!x) return "";
    const st = x.h._applState(x.ap);
    const ap = x.ap;
    const S = (e) => (e ? this._hass.states[e] : null);
    const pic = x.item.pic && x.item.pic.src ? x.h._picUrl(x.item.pic.src) : null;
    const pct = this._applPct(x, st);
    const row = (icon, label, val, eid) => (val ? `<button class="drow" ${eid ? `data-a="more" data-v="${cesc(eid)}"` : ""}><ha-icon icon="${icon}"></ha-icon><span>${cesc(label)}</span><b>${cesc(val)}</b></button>` : "");
    const rows = [
      row("mdi:list-status", dfT("mob.status"), [st.word, st.time].filter(Boolean).join(" · "), ap.status || ap.running),
      ap.program ? row("mdi:format-list-bulleted", dfT("mob.program"), this._fmtE(ap.program), ap.program) : "",
      ap.door && S(ap.door) ? row(S(ap.door).state === "on" ? "mdi:door-open" : "mdi:door-closed", dfT("mob.door"), this._fmtE(ap.door), ap.door) : "",
      st.w ? row("mdi:flash", dfT("mob.power"), st.w, ap.power) : "",
      ap.energy && S(ap.energy) ? row("mdi:lightning-bolt", dfT("mob.energy"), this._fmtE(ap.energy), ap.energy) : "",
      !st.active ? row("mdi:history", dfT("mob.last"), this._applLine(x, { ...st, active: false, phase: "idle" }), null) : "",
    ].join("");
    const done = st.phase === "done" ? `<button class="scb" data-a="appldone" data-v="${cesc(x.item.id)}"><ha-icon icon="mdi:check"></ha-icon>${dfT("appl.unloaded")}</button>` : "";
    const plug = ap.plug && S(ap.plug) && live(S(ap.plug)) ? `<button class="scb" data-a="tog" data-v="${cesc(ap.plug)}"><ha-icon icon="mdi:power"></ha-icon>${cesc(this._fmtE(ap.plug))}</button>` : "";
    return `<h3 class="sh"><span class="rtile"><ha-icon icon="${APPL_ICON[ap.type] || APPL_ICON.other}"></ha-icon></span>${cesc(x.name)}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3>
      <div class="apbig ${st.active ? "run" : ""}"${pct != null ? ` style="--p:${pct}"` : ""}>${pic ? `<img src="${cesc(pic)}" alt="">` : `<ha-icon icon="${APPL_ICON[ap.type] || APPL_ICON.other}"></ha-icon>`}${pct != null ? `<b>${Math.round(pct)}%</b>` : ""}</div>
      <div class="sub center">${cesc([this._roomName(x), this._applLine(x, st)].filter(Boolean).join(" · "))}</div>
      ${done || plug ? `<div class="scenes">${done}${plug}</div>` : ""}<div class="rcard">${rows}</div>
      <button class="srow" data-a="more" data-v="${cesc(x.lead || x.item.main_entity || "")}"><span class="rtile"><ha-icon icon="mdi:information-outline"></ha-icon></span><span class="txt"><span class="nm">${dfT("mob.details")}</span></span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
  },

  /** #85: the Navigator (the place pill): Home, then every floor with its rooms; where you are is marked. */
  _navSheet(m) {
    const s = this._s;
    const bell = this._issues(m).length;
    const many = m.rooms.length > 12;
    const homeRow = `<button class="srow nhome ${s.page === "house" || (s.page !== "room" && m.floors.length < 2) ? "cur" : ""}" data-a="gohome"><span class="rtile"><ha-icon icon="mdi:home"></ha-icon></span><span class="txt"><span class="nm">${cesc(this._homeName())}</span><span class="sub">${cesc(m.people.length ? dfT("mob.k_of_n_home", { k: m.people.filter((p) => p.home).length, n: m.people.length }) : "")}</span></span>${bell ? `<span class="bell"><ha-icon icon="mdi:bell-outline"></ha-icon><b>${bell}</b></span>` : ""}<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
    const floors = m.floors.map((f) => {
      const rs = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
      const curF = f.id === s.floor;
      const open = curF || !many;
      const head = m.floors.length > 1 || rs.length < 2 ? `<button class="nfloor ${curF && !["room", "house"].includes(s.page) ? "cur" : ""}" data-a="sheet-floor" data-v="${cesc(f.id)}"><span>${cesc(f.name)}</span><small>${cesc(dfT("mob.n_rooms", { n: rs.length }))}</small><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : "";
      const rows = open && rs.length > 1 ? rs.map((r) => `<button class="srow nroom ${s.page === "room" && s.room === r.id && curF ? "cur" : ""}" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rtile"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="txt"><span class="nm">${cesc(r.name)}</span><span class="sub">${cesc(this._vals(r))}</span></span><span class="bds inl">${this._badges(m, r)}</span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`).join("") : "";
      return `${head}${rows}`;
    }).join("");
    return `${homeRow}${floors}`;
  },

  _sheetHtml(m) {
    const sh = this._sheet;
    let body = "";
    if (sh.step === "nav") body = this._navSheet(m);
    else if (sh.step === "appl") body = this._applSheet(m, sh.key);
    else if (sh.step === "issues") {
      body = `<h3>${dfT("mob.needs_look")}</h3>${this._issues(m).map((i) => i.x ? this._row(i.x, { room: this._roomName(i.x) }) : `<button class="srow" data-a="room" data-v="${cesc(`${i.room.floor}|${i.room.id}`)}"><span class="rtile"><ha-icon icon="mdi:air-filter"></ha-icon></span><span class="txt"><span class="nm">${cesc(`${i.txt} · ${i.room.name}`)}</span><span class="sub">${cesc(i.st)}</span></span></button>`).join("")}`;
    } else if (sh.step === "ov") {
      body = this._ovSheet(m, sh.ov);
    } else if (sh.step === "items") {
      // #64: the floor's openings / shutters / alarms, from the bar under the plan.
      const list = this._floorItems(m, sh.floor, sh.kind);
      body = `<h3>${cesc(sh.title || "")}</h3>${list.map((x) => this._row(x, { room: this._roomName(x) })).join("") || `<p class="empty">${dfT("mob.quiet")}</p>`}`;
    }
    return `<div class="scrim" data-a="close"></div><div class="sheet" data-scroll="sheet"><i class="grab"></i>${body}</div>`;
  },

  /** #49 / #60: an overlay as controls (no plan): its scenes and actions from the main card, then its devices by room. */
  _ovSheet(m, o) {
    const f = m.floors.find((q) => q.id === this._s.floor) || m.floors[0];
    const b = this._base || {};
    const title = o === "people" ? OVERLAYS.people.label : this._ovLabel(o, f);
    const icon = o === "people" ? OVERLAYS.people.icon : this._ovIcon(o, f);
    let top = "";
    if (o === "lights") {
      const L = { all_off: true, all_on: false, scenes: [], ...(b.lights || {}) };
      const pids = m.floors.map((q) => q.id);
      const btn = (v, ic, t) => `<button class="scb" data-a="scene" data-v="${v}"><ha-icon icon="${ic}"></ha-icon>${cesc(t)}</button>`;
      top = [L.all_on ? btn("all_on", "mdi:lightbulb-on-outline", dfT("scene.all_on")) : "", L.all_off ? btn("all_off", "mdi:lightbulb-off-outline", dfT("scene.all_off")) : "",
        ...(L.scenes || []).map((sc, i) => (Array.isArray(sc.plans) && sc.plans.length && !sc.plans.some((x) => pids.includes(x)) ? "" : btn(i, sc.icon || "mdi:palette-outline", sc.name || dfT("scene.n", { n: i + 1 }))))].join("");
    }
    const acts = (Array.isArray(b.overlay_actions) ? b.overlay_actions : []).map((x, i) => [x, i]).filter(([x]) => (x.overlay || "cleaning") === o)
      .map(([x, i]) => `<button class="scb" data-a="oact" data-v="${i}"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"></ha-icon>${cesc(x.name || dfT("action"))}</button>`).join("");
    let list = "";
    if (o === "appl") {
      return `<h3 class="sh"><span class="rtile"><ha-icon icon="mdi:washing-machine"></ha-icon></span>${dfT("mob.appliances")}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3><div class="gridw">${m.items.filter((x) => x.ap).map((x) => this._applTile(x)).join("")}</div>`;
    }
    if (o === "people") list = this._peopleHtml(m.people);
    else if (o === "energy") {
      const rs = m.rooms.filter((r) => r.power >= 1).sort((a, c) => c.power - a.power);
      const total = m.items.reduce((t, x) => t + (x.power || 0), 0);
      list = `<div class="big">${cesc(fmtW(total))}<small>${dfT("mob.measured")}</small></div>${rs.map((r) => {
        const top1 = r.items.filter((x) => x.power).sort((a, c) => c.power - a.power)[0];
        return `<button class="srow" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rtile"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="txt"><span class="nm"><span class="t">${cesc(r.name)}</span></span><span class="sub">${cesc(top1 ? `${top1.name} · ${fmtW(top1.power)}` : "")}</span></span><span class="val">${cesc(fmtW(r.power))}</span></button>`;
      }).join("")}`;
    } else {
      const mem = this._list(o, m.items);
      const byRoom = new Map();
      for (const x of mem) {
        const k = `${x.floor}|${x.room || ""}`;
        if (!byRoom.has(k)) byRoom.set(k, []);
        byRoom.get(k).push(x);
      }
      list = [...byRoom.entries()].map(([k, xs]) => {
        const [fid, rid] = k.split("|");
        const r = rid && m.rooms.find((q) => q.id === rid && q.floor === fid);
        const tg = xs.filter((x) => x.st && DFM_TOGGLE.has(domainOf(x.lead)) && !x.offline);
        const onN = tg.filter((x) => x.on).length;
        const master = o === "lights" && tg.length > 1 ? `<button class="rmaster ${onN ? "on" : ""}" data-a="rmaster" data-v="${cesc(tg.map((x) => x.lead).join(","))}" data-on="${onN ? 1 : 0}">${onN}/${tg.length}<i></i></button>` : "";
        return `<div class="rcard"><div class="rch"><span class="rtile"><ha-icon icon="${cesc(r ? r.icon : "mdi:help-circle-outline")}"></ha-icon></span><b>${cesc(r ? r.name : dfT("mob.no_room"))}</b>${master}</div>${xs.map((x) => this._row(x)).join("")}</div>`;
      }).join("") || `<div class="none">${dfT("mob.nothing")}</div>`;
    }
    return `<h3 class="sh"><span class="rtile" style="color:${DFM_OVC[o] || "inherit"}"><ha-icon icon="${cesc(icon)}"></ha-icon></span>${cesc(title)}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3>${top || acts ? `<div class="scenes">${top}${acts}</div>` : ""}${list}`;
  },
});
// Mobile card, landscape: the 3D home, the floor / room plan and the overlay rail (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  // ------------------------------------------------------------- landscape: the house explorer
  _landHtml(m) {
    const s = this._s;
    const multi = m.levels.length > 1;
    // #107: landscape shows floors (and the 3D Home), never one room: the portrait room page is the room view. A
    // room can be chosen on the plan (outlined, a chip); turning the phone back opens its page.
    const scope = s.page === "house" && multi ? "house" : "floor";
    const f = m.floors.find((q) => q.id === s.floor);
    const sel = scope === "floor" ? this._landSel(m) : null;
    const gone = this._hdrHidden ? "gone" : "";
    let body = "";
    if (scope === "house") {
      body = `${this._houseHtml(m)}
        <div class="float hdr chip ${gone}"><div><div class="h1">${cesc(this._homeName())}</div><div class="sub">${cesc([dfT("mob.n_floors", { n: m.levels.length }), m.people.length ? dfT("mob.n_home", { n: m.people.filter((p) => p.home).length }) : "", this._outside() ? `${this._outside()} ${dfT("mob.outside")}` : ""].filter(Boolean).join(" · "))}</div></div></div>
        <div class="float hint ${gone}">${dfT("mob.house_hint")}</div>`;
    } else {
      // #92-6: a one-time hint (gone after the first tap on the plan in landscape).
      const hint = !lsGet("dfm_hint_l") ? `<div class="float hint2">${dfT("mob.hint_land")}</div>` : "";
      body = `${this._slot(f.id, "live", "", "land", "lplan")}${sel ? "" : hint}`; // #109: the mark is on the plan, at the room
    }
    return `<div class="land">${this._navHtml(m, f, scope)}<div class="left full" ${scope === "floor" ? 'data-swipe="floor"' : ""}>${body}</div>${scope === "house" ? "" : this._railHtml(m, f)}</div>`;
  },

  /** #107: the room chosen on the landscape plan (or the room page the phone was turned on). */
  _landSel(m) {
    const s = this._s;
    return s.page === "room" && s.room ? m.rooms.find((q) => q.id === s.room && q.floor === s.floor) || null : null;
  },

  /** #108 / #109: landscape navigation beside the plan, top left, in the Floorplan card's own floor-rail look:
   *  ☰ on a small tab, then one slim capsule with the floors (highest first) and ⌂ Home below a divider. */
  _navHtml(m, f, scope) {
    const menu = this._hdrOn ? `<button class="lnm" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : "";
    const short = (q) => (Number.isFinite(q.level) ? String(q.level) : (q.name || "?").trim().charAt(0).toUpperCase());
    const fl = m.floors.length > 1 ? m.floors.map((q) => `<button class="fl ${scope === "floor" && q.id === f.id ? "on" : ""}" data-a="floor" data-v="${cesc(q.id)}" title="${cesc(q.name)}" aria-label="${cesc(q.name)}">${cesc(short(q))}</button>`).join("") : "";
    const home = m.levels.length > 1 ? `<span class="div"></span><button class="fl ${scope === "house" ? "on" : ""}" data-a="gohome" title="${cesc(this._homeName())}" aria-label="${cesc(this._homeName())}"><ha-icon icon="mdi:home-outline"></ha-icon></button>` : "";
    return `<nav class="lnav">${menu}${fl || home ? `<div class="lcap">${fl}${home}</div>` : ""}</nav>`;
  },

  /** #93: the landscape overlay rail: the source card's overlays (its order), no background, labels whole (#101:
   *  no Home Replay here, the plan's round Replay button is the one switch); the mobile card's own element, so a state change never rebuilds it (its scroll stays). */
  _railHtml(m, f) {
    const ovs = this._overlayList(f).filter((o) => o !== "plan");
    const cur = ovs.includes(this._lov) ? this._lov : ovs.includes("live") ? "live" : ovs[0];
    this._lov = cur;
    return `<nav class="lrail" data-scroll="lrail">${ovs.map((o) => `<button class="lr ${o === cur ? "on" : ""}" data-a="lov" data-v="${cesc(o)}" style="--c:${DFM_OVC[o] || "var(--dfm-acc)"}"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon><span>${cesc(this._ovLabel(o, f))}</span></button>`).join("")}</nav>`;
  },

  /** #26: the House: all levels stacked on one footprint, one tilt for the whole building, sized to fit. */
  _houseHtml(m) {
    const lv = m.levels;
    const n = lv.length;
    const ratio = (f) => (f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6);
    const A = Math.max(...lv.map((l) => l.plans.reduce((t, f) => t + ratio(f), 0)));
    const W = window.innerWidth - 48 - 48; // #83: the whole screen beside the navigation (#109)
    const H = window.innerHeight - (this._top || 0) - 90;
    const th = (30 * Math.PI) / 180;
    const ph = (56 * Math.PI) / 180;
    const k = 0.5; // gap between levels, as a share of the footprint's depth
    const wW = W / (Math.cos(th) + Math.sin(th) / A);
    const wH = H / ((Math.sin(th) + Math.cos(th) / A) * Math.cos(ph) + ((n - 1) * k * Math.sin(ph)) / A);
    const w = Math.max(120, Math.min(wW, wH));
    const h = w / A;
    const g = k * h;
    const levels = lv.map((l, i) => {
      const z = (n - 1 - i) * g; // m.levels: highest first
      const plans = l.plans.map((f) => this._housePlan(m, f, (ratio(f) / A) * 100)).join("");
      const rs = m.rooms.filter((r) => l.plans.some((f) => f.id === r.floor));
      const att = rs.reduce((t, r) => t + r.attention, 0);
      const on = rs.reduce((t, r) => t + r.on, 0);
      const lab = [att ? dfT("mob.n_attention", { n: att }) : "", on ? dfT("mob.n_on", { n: on }) : ""].filter(Boolean).join(" · ") || dfT("mob.quiet");
      const y = -((n - 1 - i) - (n - 1) / 2) * g * Math.sin(ph);
      return { html: `<div class="lvl" style="transform:translateZ(${z.toFixed(1)}px)">${plans}</div>`, label: `<button class="hl" data-a="floor" data-v="${cesc(l.plans[0].id)}" style="top:calc(50% + ${y.toFixed(1)}px)"><b>${cesc(l.plans.map((f) => f.name).join(" · "))}</b><small>${cesc(lab)}</small></button>` };
    });
    return `<div class="house"><div class="stage" style="width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;--th:${(th * 180) / Math.PI}deg;--ph:${(ph * 180) / Math.PI}deg">${levels.map((x) => x.html).join("")}</div>${levels.map((x) => x.label).join("")}</div>`;
  },

  _housePlan(m, f, pct) {
    const img = this._img(f);
    const rs = m.rooms.filter((r) => r.floor === f.id);
    const polys = rs.map((r) => {
      const sh = Array.isArray(r.ar.shape) && r.ar.shape.length >= 3 ? r.ar.shape : null;
      const cls = r.attention ? "att" : r.lightsOn ? "lit" : r.presence ? "pres" : "";
      if (!cls) return "";
      return sh ? `<polygon class="${cls}" points="${sh.map((p) => p.join(",")).join(" ")}"/>` : `<ellipse class="${cls}" cx="${r.ar.x}" cy="${r.ar.y}" rx="5" ry="5"/>`;
    }).join("");
    const avs = m.people.filter((p) => p.room && p.room.floor === f.id).map((p) => `<span class="hav" style="left:${p.room.ar.x}%;top:${p.room.ar.y}%">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>`).join("");
    return `<button class="plane" data-a="floor" data-v="${cesc(f.id)}" style="width:${pct.toFixed(2)}%">${img ? `<img src="${cesc(img)}" alt="">` : ""}<svg viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg>${avs}</button>`;
  },
});
// Mobile card: its styles, registration and dashboard strategy (#86).
const DFM_CSS = `
:host { display:block; /* 0.13.9.17 #69: the HA theme as it is: page, cards, sheets, lines and text from its own variables. */ --dfm-g1: var(--dfm-bg-top, var(--primary-background-color, #f3f5f9)); --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #f3f5f9) 94%, #000)); --dfm-bg: var(--dfm-g2); --dfm-card: var(--ha-card-background, var(--card-background-color, #fff)); --dfm-sheet: var(--secondary-background-color, var(--dfm-card)); --dfm-fg: var(--primary-text-color, #222); --dfm-sub: var(--secondary-text-color, #777); --dfm-acc: var(--primary-color, #03a9f4); --dfm-red: var(--error-color, #db4437); --dfm-amber: var(--warning-color, #f4b400); --dfm-div: var(--divider-color, rgba(0,0,0,.08)); color: var(--dfm-fg); font-family: var(--paper-font-body1_-_font-family, inherit); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.empty { padding: 24px; color: var(--dfm-sub); }
:host([dark]) { --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #111) 85%, #000)); }
/* #38: a soft gradient behind everything, fixed to the screen */
.bgfix { position: fixed; inset: 0; z-index: 0; background: linear-gradient(180deg, var(--dfm-g1), var(--dfm-g2)); pointer-events: none; }
.port { position: relative; min-height: calc(100dvh - var(--dfm-top, 56px)); }
.pg { position: relative; z-index: 1; padding: 12px 14px 0; }
.pad { height: 110px; }
.hd { display:flex; align-items:center; gap:12px; padding: 6px 2px 10px; }
.hd .grow { flex:1; min-width:0; }
.h1 { font-size: 18px; font-weight: 700; line-height:1.2; letter-spacing:-.01em; }
.hd.room .h1 { font-size: 20px; }
.sub { font-size: 12.5px; color: var(--dfm-sub); }
/* #91: a smaller avatar; the greeting always one line, its size fitted to the space */
.isslink { display:inline; padding: 0; font: inherit; color: var(--dfm-red); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--dfm-red) 40%, transparent); text-underline-offset: 2px; }
.isslink b { font-weight: 700; }
.hd.top .h1 { white-space: nowrap; font-size: var(--dfm-greet, 18px); }
.hd.top.tight .clim { max-width: 40%; }
.hd.top .me { width: 38px; height: 38px; flex: none; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px var(--dfm-card); }
.hd.top .me img { width: 100%; height: 100%; object-fit: cover; }
.hd.room { position: relative; }
.fold { position: absolute; right: 2px; bottom: -14px; z-index: 3; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 70%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 1px 4px rgba(0,0,0,.15); color: var(--dfm-fg); }
.fold ha-icon { --mdc-icon-size: 20px; }
.cut .fold { right: 22px; bottom: 14px; }
.bk { width:40px; height:40px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size: 22px; flex: none; }
.thumb { position:relative; width: 96px; flex:none; border-radius:10px; overflow:hidden; background: var(--dfm-card); }
.thumb img { width:100%; height:100%; object-fit: fill; opacity:.35; filter: grayscale(.6); display:block; }
.thumb svg { position:absolute; inset:0; width:100%; height:100%; }
.thumb polygon, .thumb ellipse { fill: var(--dfm-acc); fill-opacity:.55; stroke: var(--dfm-acc); stroke-width:.8; vector-effect: non-scaling-stroke; }
.plan { position: relative; --ha-card-background: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; --ha-card-border-radius: 0; }
.mini .plan, .cut .plan, .full .plan { -webkit-mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); -webkit-mask-composite: source-in; mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); mask-composite: intersect; margin: 0 -14px; }
.mini .plan { --dfc-fit-h: 34vh; }
.mini { position: relative; margin-top: 2px; }
.flabel { position: absolute; left: 8px; top: 4px; z-index: 3; font-size: 11.5px; font-weight: 600; color: var(--dfm-sub); padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-card) 60%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); pointer-events: none; }
.mini .nav { opacity: .55; width: 34px; height: 34px; }
.mini .nav.l { left: -4px; } .mini .nav.r { right: -4px; }
/* #53: small pills that wrap: what is on above the plan, what needs a look under it */
/* #64: the climate card (top right) and the two segment bars (house above the plan, floor under it) */
.clim { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 7px 10px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); font-size: 12px; text-align: left; max-width: 52%; }
.clim .cl { display: flex; align-items: center; gap: 6px; white-space: nowrap; min-width: 0; }
.clim .cl ha-icon { --mdc-icon-size: 15px; color: var(--dfm-acc); flex: none; }
.clim .cl b { font-weight: 650; }
.clim .cl small { color: var(--dfm-sub); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; }
.clim .adot { margin: 0; }
.segs { display: flex; gap: 0; margin: 2px 0 8px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; }
.segs.below { margin: 6px 0 10px; }
.seg { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 6px; font-size: 13px; font-weight: 650; color: var(--dfm-sub); white-space: nowrap; }
.seg + .seg { box-shadow: inset 1px 0 0 var(--dfm-div); }
.seg span { overflow: hidden; text-overflow: ellipsis; }
.seg ha-icon { --mdc-icon-size: 18px; flex: none; }
.seg.on { color: #e8b923; }
/* #93: the landscape overlay rail: its own element, no background, labels whole */
.land { padding-right: calc(var(--dfm-rail-w, 92px) + var(--dfm-ir, 0px)); padding-left: calc(48px + var(--dfm-il, 0px)); box-sizing: border-box; margin-left: calc(-1 * var(--dfm-bl, 0px)); margin-right: calc(-1 * var(--dfm-br, 0px)); } /* #123: to the screen's edges, controls clear of the notch */
/* #108 / #109: navigation in the Floorplan card's floor-rail look (same sizes / colours), top left, beside the plan. */
.lnav { position: absolute; top: 6px; left: calc(6px + var(--dfm-il, 0px)); width: 36px; display:flex; flex-direction:column; align-items:center; gap: 8px; z-index: 4; }
.lnm { width: 36px; height: 32px; border-radius: 8px; display:flex; align-items:center; justify-content:center; color: var(--dfm-acc); background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); --mdc-icon-size: 22px; }
.lcap { width: 36px; box-sizing: border-box; display:flex; flex-direction:column; align-items:center; gap: 4px; padding: 3px 0; border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); box-shadow: 0 2px 10px rgba(0,0,0,.2); }
.lcap .fl { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--divider-color, rgba(0,0,0,.12)); background: var(--card-background-color, #fff); color: var(--primary-text-color); font-size: 13px; font-weight: 600; display:flex; align-items:center; justify-content:center; padding: 0; --mdc-icon-size: 18px; text-align: center; }
.lcap .fl.on { background: var(--dfm-acc); border-color: var(--dfm-acc); color: #fff; }
.lcap .div { width: 22px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); margin: 1px 0; }
.lrail { position: absolute; top: 0; right: var(--dfm-ir, 0px); bottom: 0; width: var(--dfm-rail-w, 92px); display:flex; flex-direction:column; align-items:center; gap: 4px; padding: 8px 4px; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; z-index: 4; scrollbar-width: none; }
.lrail::-webkit-scrollbar { display: none; }
.lr { width: 100%; display:flex; flex-direction:column; align-items:center; gap: 2px; padding: 7px 2px; border-radius: 16px; color: var(--dfm-sub); font-size: 11px; font-weight: 600; line-height: 1.15; text-align: center; flex: none; }
.lr ha-icon { --mdc-icon-size: 22px; width: 40px; height: 32px; border-radius: 12px; display:flex; align-items:center; justify-content:center; }
.lr span { max-width: 100%; overflow-wrap: anywhere; }
.lr.on { color: var(--dfm-fg); }
.lr.on ha-icon { background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
.lr:active ha-icon { background: color-mix(in srgb, var(--dfm-fg) 10%, transparent); }
/* #92-12: one place pill with its list */
/* #92-6: one-time hints */
.phint, .hint2 { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--dfm-card) 88%, transparent); box-shadow: 0 2px 10px rgba(0,0,0,.14); color: var(--dfm-fg); pointer-events: none; white-space: nowrap; z-index: 3; }
.hint2 { bottom: 14px; }
.mini { position: relative; }
h2 .scope { font-size: 12px; font-weight: 500; color: var(--dfm-sub); margin-left: 6px; }
.seg.lt ha-icon { color: #e8b923; } /* #92-10: lights on is normal life: a yellow bulb, a neutral number */
.seg.warn { color: var(--dfm-amber); }
.seg.att { color: var(--dfm-red); }
.seg.act { color: var(--dfm-acc); }
.seg:active { background: color-mix(in srgb, var(--dfm-fg) 8%, transparent); }
.pi { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 999px; background: var(--dfm-card); font-size: 12px; white-space: nowrap; max-width: 100%; box-sizing: border-box; overflow: hidden; }
.pi ha-icon, .pi ha-state-icon { --mdc-icon-size: 14px; color: var(--dfm-acc); flex: none; }
.pi .t { overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.pi.wx { background: color-mix(in srgb, var(--dfm-acc) 16%, var(--dfm-card)); }
.pi.warn { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dfm-amber) 75%, transparent); }
.pi.warn ha-icon { color: var(--dfm-amber); }
.pi.att { box-shadow: inset 0 0 0 1px var(--dfm-red); color: var(--dfm-red); }
.pi.att ha-icon, .pi.att ha-state-icon { color: var(--dfm-red); }
.adot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.adot.a0 { background: #4caf50; } .adot.a1 { background: var(--dfm-amber); } .adot.a2 { background: var(--dfm-red); }
.cut { position: relative; margin: 6px -14px 0; }
.cut .plan:empty { height: 33vh; background: color-mix(in srgb, var(--dfm-sub) 8%, transparent); } /* #110: until the plan is in */
.cut .plan { --dfc-fit-h: 33vh; margin: 0; --dfc-focus-dim: var(--dfm-g2); -webkit-mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); }
.nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 45%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); color: var(--dfm-fg); opacity: .7; }
.nav.l { left: 8px; } .nav.r { right: 8px; }
.nav ha-icon { --mdc-icon-size: 24px; }
.full .plan { --dfc-fit-h: 52vh; }
.full .plan { -webkit-mask-image:none; mask-image:none; }
.mini, .full { position:relative; }
.fsw, .sw { display:flex; align-items:center; gap:6px; justify-content:center; font-size: 13px; color: var(--dfm-sub); }
.fsw button, .sw button { width:30px; height:30px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size:18px; }
.chips { display:flex; gap:8px; overflow-x:auto; padding: 6px 0 10px; scrollbar-width:none; }
.chips::-webkit-scrollbar, .hs::-webkit-scrollbar { display:none; }
.chip { flex:none; display:inline-flex; align-items:center; gap:6px; padding: 7px 12px; border-radius: 999px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.07); font-size: 13.5px; white-space:nowrap; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--dfm-acc); }
.chip.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); color: var(--dfm-red); }
.chip.att ha-icon { color: var(--dfm-red); }
.chip.warn { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dfm-amber) 80%, transparent); }
.chip.warn ha-icon { color: var(--dfm-amber); }
.chip ha-state-icon { --mdc-icon-size: 18px; }
.chip.wx { background: color-mix(in srgb, var(--dfm-acc) 14%, var(--dfm-card)); }
.chip.sel { background: var(--dfm-acc); color: #fff; }
.chip.sel ha-icon { color:#fff; }
section { margin: 14px 0 4px; }
h2 { display:flex; align-items:center; gap:8px; font-size: 15px; font-weight: 650; margin: 0 0 8px; }
h2 .gt { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; display:flex; align-items:center; justify-content:center; background: var(--dfm-card); color: var(--dfm-sub); }
h2 .gt ha-icon { --mdc-icon-size: 18px; color: inherit; }
.gridw { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.gridw > * { width: auto !important; min-width: 0; }
h2 > ha-icon { --mdc-icon-size: 20px; color: var(--dfm-sub); }
h2 .all, h3 .all { margin-left:auto; font-size: 13px; color: var(--dfm-acc); font-weight:500; }
.gs { margin-left:auto; font-size: 13px; color: var(--dfm-sub); font-weight: 500; }
.gh { cursor: pointer; user-select: none; }
.gh .go { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-sub); }
.gh .go ha-icon { --mdc-icon-size: 22px; }
section.folded { margin-bottom: 0; }
.gi { width:32px; height:32px; border-radius: 10px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); }
.gi ha-icon { --mdc-icon-size: 19px; }
.g-lights { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent) !important; }
.g-comfort { color: #3b7dd8; background: color-mix(in srgb, #3b7dd8 15%, transparent) !important; }
.g-security { color: #2e8b57; background: color-mix(in srgb, #2e8b57 15%, transparent) !important; }
.g-media { color: #7e57c2; background: color-mix(in srgb, #7e57c2 15%, transparent) !important; }
.g-other { color: var(--dfm-sub); background: color-mix(in srgb, var(--dfm-sub) 12%, transparent) !important; }
.hs { display:flex; gap:10px; overflow-x:auto; padding: 2px 2px 6px; scrollbar-width:none; }
.rt, .pt, .cam, .ot { flex:none; width: 132px; padding: 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); display:flex; flex-direction:column; gap:4px; box-sizing: border-box; }
/* #56 / #57: room tiles: icon, overlay badges (top right), name, values */
.rt { position: relative; width: 150px; min-height: 150px; justify-content: flex-end; }
.rt .rti { position: absolute; left: 12px; top: 12px; }
.rt .bds { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-height: calc(100% - 66px); overflow: hidden; }
/* #92-1: the room's name has its own line: badges never reach it */
.rt b { position: relative; z-index: 1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bds.inl { position: static; flex-direction: row; flex-wrap: wrap; gap: 4px; }
.tb2 { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 999px; font-size: 11.5px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.tb2 ha-icon { --mdc-icon-size: 13px !important; color: inherit !important; }
.tb2.more { --c: var(--dfm-sub); }
/* #60: Home control tiles */
.ot { width: 170px; min-height: 130px; color: inherit; }
.ot .oti { width: 38px; height: 38px; border-radius: 12px; display:flex; align-items:center; justify-content:center; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); margin-bottom: 4px; }
.ot b { font-size: 14px; }
.ot small { font-size: 12px; color: var(--dfm-sub); }
.ot.quiet { opacity: .55; }
.ot.att small { color: var(--dfm-red); font-weight: 600; }
.pchips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.pc { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px 2px 2px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); }
.pc .av { width: 18px; height: 18px; font-size: 10px; box-shadow: none; }
.pc.home .av { box-shadow: 0 0 0 1.5px #4caf50; }
.bars { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.bar1 { display: grid; grid-template-columns: 1fr auto; font-size: 11px; gap: 2px 6px; }
.bar1 i { grid-column: 1 / 3; height: 4px; border-radius: 2px; background: var(--c); }
/* sheets: overlay controls */
.sheet h3.sh .x { margin-left: auto; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; background: var(--dfm-card); }
.scenes { display: flex; flex-wrap: wrap; gap: 8px; }
.scb { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px; background: var(--dfm-card); font-size: 13px; font-weight: 600; }
.scb ha-icon { --mdc-icon-size: 18px; color: var(--dfm-amber); }
.rcard { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 18px; background: color-mix(in srgb, var(--dfm-card) 60%, transparent); }
.rch { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.rmaster { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 4px 0 10px; border-radius: 999px; background: var(--dfm-card); font-size: 12px; font-weight: 700; }
.rmaster i { width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 30%, transparent); position: relative; }
.rmaster i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .2s; }
.rmaster.on i { background: #e8b923; } .rmaster.on i::after { left: 16px; }
.big { font-size: 30px; font-weight: 700; padding: 4px 4px 8px; }
.big small { display: block; font-size: 12px; font-weight: 500; color: var(--dfm-sub); }
.rti { width: 38px; height: 38px; border-radius: 12px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); color: var(--dfm-acc); margin-bottom: 4px; }
.rt ha-icon { --mdc-icon-size: 22px; }
.rt .bds { display:flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.rt.on .rti { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rt.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); }
.rt.att .rti { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.rt b { font-size: 16px; font-weight: 700; }
.pt b, .cam b { font-size: 13.5px; font-weight:600; }
.rt small, .pt small { font-size: 11.5px; color: var(--dfm-sub); line-height:1.3; }
.pt { align-items:center; text-align:center; width: 96px; }
.cam { width: 180px; padding: 0 0 10px; overflow:hidden; }
.cam img { width:100%; aspect-ratio: 16/9; object-fit: cover; display:block; background:#000; }
.cam b { padding: 6px 10px 0; }
.cam small { padding: 0 10px; font-size: 12px; color: var(--dfm-sub); }
.cam .noimg { width:100%; aspect-ratio: 16/9; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 15%, transparent); color: var(--dfm-sub); }
.av { width:44px; height:44px; flex:none; border-radius:50%; background: color-mix(in srgb, var(--dfm-sub) 20%, var(--dfm-card)); display:flex; align-items:center; justify-content:center; font-weight:700; overflow:hidden; box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px transparent; }
.av.home { box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px #4caf50; }
.av img { width:100%; height:100%; object-fit:cover; }
.list, section { display:flex; flex-direction:column; gap:8px; }
.row, .srow { display:flex; align-items:center; gap:12px; padding: 11px 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); min-height: 44px; width: 100%; box-sizing: border-box; }
/* #68: device rows are flat (no box, no icon tile): the icon's colour says the state; a short highlight on press. */
.row { background: transparent; box-shadow: none; border-radius: 12px; padding: 7px 6px; min-height: 40px; transition: background .15s; }
.row:active { background: color-mix(in srgb, var(--dfm-fg) 8%, transparent); }
.row.att { box-shadow: none; }
.row.att .nm .t { color: var(--dfm-red); }
.tile, .rtile { width:38px; height:38px; flex:none; border-radius: 11px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); color: var(--dfm-sub); }
.row .tile { width: 30px; height: 30px; background: none !important; --mdc-icon-size: 24px; }
.row .tile.s-on { color: #e8b923; }
.row .tile.s-open, .row .tile.s-alarm { color: var(--dfm-red); }
.row .tile.s-warm { color: #e5853b; }
.row .tile.s-cool { color: #3b9ad9; }
.row .tile.s-act { color: var(--dfm-acc); }
.row .sub .ago { color: var(--dfm-sub); }
.rtile.on { color:#c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rtile.att { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.nm { font-size: 14px; font-weight: 600; display:flex; align-items:center; gap:6px; flex-wrap: wrap; }
.txt .sub { font-size: 12px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd { font-size: 11px; font-weight:700; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 14%, transparent); color: var(--dfm-sub); }
.bd.red { background: color-mix(in srgb, var(--dfm-red) 15%, transparent); color: var(--dfm-red); }
.bd.amber { background: color-mix(in srgb, var(--dfm-amber) 22%, transparent); color: #9a6b00; }
.val { font-size: 13.5px; color: var(--dfm-sub); font-variant-numeric: tabular-nums; }
.chev { color: var(--dfm-sub); --mdc-icon-size: 20px; }
.sw { }
button.sw { width: 46px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 28%, transparent); position:relative; flex:none; transition: background .2s; }
button.sw i { position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left .2s; }
button.sw.on { background: #e8b923; }
button.sw.on i { left: 21px; }
.bri { width: 100%; margin: 6px 0 0; accent-color: #e8b923; height: 18px; }
.none { color: var(--dfm-sub); font-size: 14px; padding: 6px 4px; }
.link { color: var(--dfm-acc); font-size: 13.5px; padding: 6px 2px; }
.search { display:flex; align-items:center; gap:8px; padding: 0 12px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 6px; }
.search input { flex:1; border:0; outline:0; background:none; font: inherit; font-size: 15px; padding: 11px 0; color: inherit; }
/* #34: the bar is its own layer, fixed to the bottom of the screen, with the page fading under it */
.barwrap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; padding: 28px 0 max(12px, env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--dfm-g2) 40%, color-mix(in srgb, var(--dfm-g2) 0%, transparent)); pointer-events: none; }
.bar { display:flex; align-items:center; justify-content:center; gap: 10px; margin: 0 auto; width: max-content; pointer-events: auto; }
.pill2 { height: 48px; display:flex; align-items:center; border-radius: 999px; background: color-mix(in srgb, var(--dfm-card) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.16); }
.pill2 .ph { height: 48px; padding: 0 14px 0 18px; display:flex; align-items:center; gap: 8px; font-weight: 650; font-size: 15px; }
.pill2 .pl { height: 48px; padding: 0 16px 0 12px; display:flex; align-items:center; }
.pill2 .on { color: var(--dfm-acc); }
.pill2 .sep { width: 1px; height: 24px; background: var(--dfm-div); }
.pill2 .up { --mdc-icon-size: 18px; }
.tb { width:48px; height:48px; border-radius:50%; background: color-mix(in srgb, var(--dfm-card) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.14); display:flex; align-items:center; justify-content:center; }
.tb.on { color: var(--dfm-acc); }
.scrim { position: fixed; inset: 0; z-index: 8; background: rgba(0,0,0,.25); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9; max-height: 78vh; overflow-y: auto; background: var(--dfm-sheet); border-radius: 22px 22px 0 0; padding: 8px 14px calc(18px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:8px; box-shadow: 0 -6px 30px rgba(0,0,0,.18); }
.sheet .grab { width: 38px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--dfm-sub) 40%, transparent); margin: 2px auto 6px; }
.sheet h3 { display:flex; align-items:center; gap: 10px; margin: 4px 2px; font-size: 17px; }
.sheet h3 .bk { width:34px; height:34px; font-size: 19px; }
.fthumb { width: 56px; height: 40px; flex:none; border-radius: 8px; overflow:hidden; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); display:flex; align-items:center; justify-content:center; }
.fthumb img { width:100%; height:100%; object-fit: contain; }
/* landscape: one surface, the plan on the left 2/3, the overlays on the right */
.land { position: relative; display:flex; height: calc(100dvh - var(--dfm-top, 56px)); background: transparent; overflow: hidden; } /* #108: one colour with HA's page, edge to edge */
.left { position: relative; flex: 0 0 66%; height: 100%; }
.left { touch-action: none; }
[data-swipe] { touch-action: pan-y; }
.left[data-swipe], .left { touch-action: none; }
/* #81 / #83: no fade; the Floorplan card fills the screen (its plan fitted, its overlay rail on the right). */
.left.full { flex: 1 1 100%; }
.lplan { position:absolute; inset: 6px 0 6px 6px; }
.lplan device-floorplan-card { display:block; height: 100%; }
/* #122: a tall plan in landscape: full width, scrolls up / down (left / right still changes floor); a soft fade at the
   edges shows there is more. */
.left.tall { touch-action: pan-y; }
.lplan.tall { left: -48px; padding-left: 48px; box-sizing: border-box; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; scrollbar-width: none; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%); }
.lplan.tall::-webkit-scrollbar { display: none; } /* the box reaches into the navigation strip (under it), so the side tools that hang there are not clipped */
.lplan.tall device-floorplan-card { height: auto; }
.lmenu { flex:none; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-fg); }
.row, .srow, .one { flex-shrink: 0; }
.nm { flex-wrap: nowrap; min-width: 0; }
.nm .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bd { flex: none; white-space: nowrap; }
.float { position:absolute; z-index: 3; transition: opacity .5s; text-shadow: 0 1px 6px var(--dfm-bg), 0 0 2px var(--dfm-bg); }
.float.gone { opacity: 0; pointer-events: none; }
/* #102: while the phone turns, the old layout is not shown stretched (a very short fade). */
.dfm { transition: opacity .12s; }
.dfm.turning { opacity: 0; transition: none; }
/* #92-11: in landscape the ‹ back stays; only the big title fades */
.float.hdr.chip.gone { opacity: 1; pointer-events: auto; padding-bottom: 6px; }
.float.hdr.chip.gone .h1 { font-size: 17px; }
.float.hdr.chip.gone .sub { display: none; }
.float.hdr { top: 10px; left: 16px; }
/* #80: the title on a soft chip, readable on any plan */
.float.hdr.chip { display:flex; align-items:flex-start; gap: 8px; padding: 6px 12px 7px; border-radius: 16px; background: color-mix(in srgb, var(--dfm-g1) 72%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 2px 10px rgba(0,0,0,.12); text-shadow: none; max-width: 45%; }
.float.hdr.chip .lmenu { position: static; width: 34px; height: 34px; flex: none; }
/* #64 / #85: section links, appliances, the Navigator, Control, the camera view */
.seeall { margin-left: auto; display:inline-flex; align-items:center; gap: 2px; padding: 5px 6px 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--dfm-acc); background: color-mix(in srgb, var(--dfm-acc) 10%, transparent); }
.seeall + .gt { margin-left: 6px; }
.seeall ha-icon { --mdc-icon-size: 18px; }
.apt { flex: none; width: 150px; display:flex; flex-direction:column; align-items:flex-start; gap: 2px; padding: 12px; border-radius: 18px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); text-align:left; }
.gridw .apt { width: auto; }
.apt .api { width: 54px; height: 54px; border-radius: 16px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); color: var(--dfm-sub); margin-bottom: 8px; --mdc-icon-size: 30px; overflow: hidden; }
.apt .api img { width: 100%; height: 100%; object-fit: contain; }
.apt .api.ring { background: conic-gradient(#26a69a calc(var(--p) * 1%), color-mix(in srgb, var(--dfm-sub) 14%, transparent) 0); padding: 4px; box-sizing: border-box; }
.apt .api.ring > * { border-radius: 12px; background: var(--dfm-card); width: 100%; height: 100%; display:flex; align-items:center; justify-content:center; }
.apt.run .api { color: #26a69a; }
.apt.done .api { color: #4caf50; }
.apt.att .api { color: var(--dfm-amber); }
.apt b { font-size: 14px; }
.apt small { color: var(--dfm-sub); font-size: 12px; line-height: 1.3; }
/* 0.14.2: a long name never widens a tile: at most 2 lines, then … (also names without spaces). */
.apt b, .apt small { max-width: 100%; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.rt b, .pt b, .cam b { min-width: 0; overflow-wrap: anywhere; }
.apt.run small { color: #26a69a; }
.apbig { margin: 6px auto 4px; width: 132px; height: 132px; border-radius: 28px; display:flex; align-items:center; justify-content:center; position: relative; background: color-mix(in srgb, var(--dfm-sub) 10%, transparent); --mdc-icon-size: 64px; color: var(--dfm-sub); overflow: hidden; }
.apbig img { width: 100%; height: 100%; object-fit: contain; }
.apbig.run { color: #26a69a; box-shadow: inset 0 0 0 4px color-mix(in srgb, #26a69a 50%, transparent); }
.apbig b { position: absolute; bottom: 8px; right: 10px; font-size: 13px; color: #26a69a; }
.center { text-align: center; margin-bottom: 8px; }
.drow { display:flex; align-items:center; gap: 10px; width: 100%; padding: 9px 6px; font-size: 14px; text-align: left; }
.drow + .drow { box-shadow: inset 0 1px 0 var(--dfm-div); }
.drow ha-icon { --mdc-icon-size: 20px; color: var(--dfm-sub); }
.drow span { flex: 1; color: var(--dfm-sub); }
.drow b { font-weight: 600; }
.nfloor { display:flex; align-items:center; gap: 8px; width: 100%; padding: 14px 4px 6px; font-weight: 700; font-size: 15px; color: var(--dfm-fg); }
.nfloor small { color: var(--dfm-sub); font-weight: 500; font-size: 12px; margin-left: auto; }
.nfloor ha-icon { --mdc-icon-size: 18px; color: var(--dfm-sub); }
.srow.cur, .nfloor.cur { box-shadow: inset 3px 0 0 var(--dfm-acc), 0 1px 3px rgba(0,0,0,.06); }
.srow .bell { display:inline-flex; align-items:center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-red) 14%, transparent); color: var(--dfm-red); --mdc-icon-size: 16px; font-size: 12px; }
.ctlgrid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ctlgrid .ot { width: auto; min-width: 0; }
.pill2 .pt { max-width: 34vw; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl .pt { margin-left: 6px; font-weight: 600; }
.rcard.gcard { margin: 0 0 10px; }
.rcard.gcard .rch { cursor: pointer; }
.rcard.gcard .rch .gs { margin-left: auto; color: var(--dfm-sub); font-size: 13px; font-weight: 500; }
.rcard.gcard .rch .rmaster { margin-left: 8px; }
.rcard.gcard .rch .go { margin-left: 6px; color: var(--dfm-sub); --mdc-icon-size: 20px; }
.rcard.gcard.folded { padding-bottom: 6px; }
.oneroom .sh1 { display:flex; align-items:center; gap: 10px; font-size: 17px; margin: 6px 0 10px; }
.float.hdr .bk { width:auto; height:auto; border-radius: 0; background:none; box-shadow:none; font-size: 14px; color: var(--dfm-acc); }
.float.hdr .h1 { font-size: 24px; }
.float.sw { bottom: 12px; left: 16px; background: color-mix(in srgb, var(--dfm-card) 80%, transparent); border-radius: 999px; padding: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.1); text-shadow:none; color: var(--dfm-fg); font-weight: 600; }
.float.sw button { width:30px; height:30px; }
.float.hint { bottom: 14px; left: 16px; font-size: 13px; color: var(--dfm-sub); }
.house { position:absolute; inset: 0; perspective: 1800px; overflow: hidden; }
.house ~ .float.hdr.chip { padding: 5px 12px 6px; border-radius: 12px; }
.house ~ .float.hdr.chip .h1 { font-size: 17px; }
.house ~ .float.hdr.chip .sub { font-size: 12px; }
.stage { position:absolute; left: 44%; top: 54%; transform-style: preserve-3d; transform: translate(-50%, -50%) rotateX(var(--ph)) rotateZ(calc(-1 * var(--th))); }
.lvl { position:absolute; inset: 0; display:flex; justify-content:center; transform-style: preserve-3d; pointer-events: none; }
.plane { position:relative; height: 100%; display:block; pointer-events: auto; border-radius: 4px; background: var(--dfm-card); box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 18px 30px -12px rgba(0,0,0,.35); overflow: visible; }
.plane img { width:100%; height:100%; display:block; object-fit: fill; border-radius: 4px; }
.plane svg { position:absolute; inset:0; width:100%; height:100%; }
.plane .lit { fill: #f6c445; fill-opacity: .5; }
.plane .att { fill: var(--dfm-red); fill-opacity: .45; }
.plane .pres { fill: var(--dfm-acc); fill-opacity: .25; }
.hav { position:absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; overflow:hidden; background: var(--dfm-acc); color:#fff; font-size: 11px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 0 2px #fff; }
.hav img { width:100%; height:100%; object-fit: cover; }
.hl { position:absolute; right: 12px; transform: translateY(-50%); display:flex; flex-direction:column; align-items:flex-end; gap: 1px; font-size: 13.5px; background: color-mix(in srgb, var(--dfm-card) 88%, transparent); padding: 5px 11px; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.1); z-index: 2; text-align: right; }
.hl small { color: var(--dfm-sub); font-size: 12px; }
`;

if (!customElements.get("device-floorplan-mobile")) customElements.define("device-floorplan-mobile", DeviceFloorplanMobile);
if (!window.customCards.some((c) => c.type === "device-floorplan-mobile")) {
  window.customCards.push({ type: "device-floorplan-mobile", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), preview: false, documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}

/** Add dashboard → "Device Floorplan (mobile)": one panel view with the mobile card. */
class DeviceFloorplanMobileStrategy extends HTMLElement {
  static async generate(config = {}) {
    // #98 / #106: the dashboard's settings (Edit dashboard, or the Editor's "Create a new mobile dashboard") are
    // the card's settings.
    const card = { ...(config || {}), type: "custom:device-floorplan-mobile" };
    return { views: [{ title: dfT("mob.home"), path: "home", icon: "dfp:mobile", type: "panel", cards: [card] }] };
  }
}
/** #106: Edit dashboard → the mobile card's settings (the same form as its card editor), as Dwains does. */
class DeviceFloorplanMobileStrategyEditor extends HTMLElement {
  set hass(h) {
    this._hass = h;
    if (this._form) this._form.hass = h;
    else this._build();
  }

  setConfig(config) {
    this._cfg = { ...(config || {}) };
    if (this._form) this._form.data = this._cfg;
    else this._build();
  }

  async _build() {
    if (this._busy || !this._hass || !this._cfg) return;
    this._busy = true;
    const f = await DeviceFloorplanMobile.getConfigForm();
    const form = document.createElement("ha-form");
    Object.assign(form, { hass: this._hass, schema: f.schema, data: this._cfg, computeLabel: f.computeLabel, computeHelper: f.computeHelper });
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      this._cfg = { ...e.detail.value, type: this._cfg.type || "custom:device-floorplan-mobile" };
      form.data = this._cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._cfg }, bubbles: true, composed: true }));
    });
    this.appendChild(form);
    this._form = form;
  }
}
if (!customElements.get("device-floorplan-mobile-strategy-editor")) customElements.define("device-floorplan-mobile-strategy-editor", DeviceFloorplanMobileStrategyEditor);
DeviceFloorplanMobileStrategy.getConfigElement = async () => document.createElement("device-floorplan-mobile-strategy-editor");
if (!customElements.get("ll-strategy-dashboard-device-floorplan-mobile")) customElements.define("ll-strategy-dashboard-device-floorplan-mobile", DeviceFloorplanMobileStrategy);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((c) => c.type === "device-floorplan-mobile")) {
  window.customStrategies.push({ type: "device-floorplan-mobile", strategyType: "dashboard", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}
