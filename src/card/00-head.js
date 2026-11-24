/*
 * Device Floorplan – dashboard card (v0.13.9.10).
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

const CARD_VERSION = "0.13.9.10";
// 0.13.2: one tip per version for admins, closed per Home Assistant user (follows them across devices).
// A version without a tip: set it to null. "go" opens the Floorplan Editor.
const RELEASE_TIP = { v: "0.13.9", text: "Christmas lights and trees", go: "Try them" };
const TIP_KEY = "device_floorplan_release_tip";
const PANEL_PATH = "/device-floorplan";

const OVERLAYS = {
  plan: { label: "Plan", icon: "mdi:floor-plan" },
  live: { label: "Live", icon: "mdi:home-lightbulb-outline" },
  lights: { label: "Lights", icon: "mdi:lightbulb-group-outline" },
  comfort: { label: "Comfort", icon: "mdi:thermometer" },
  security: { label: "Security", icon: "mdi:shield-home-outline" },
  network: { label: "Network", icon: "mdi:access-point-network" },
  health: { label: "Health", icon: "mdi:battery-heart-variant" },
  energy: { label: "Energy", icon: "mdi:lightning-bolt" },
  cleaning: { label: "Cleaning", icon: "mdi:robot-vacuum" },
  people: { label: "People", icon: "mdi:account-group-outline" },
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
  radio: { label: "Wireless", icon: "mdi:signal" },
};
const CONN_ORDER = ["zigbee", "zwave", "matter", "network", "bluetooth", "radio"];
const ROLES = {
  coordinator: { label: "Coordinator", color: "#f5a623", shape: "diamond" },
  ap: { label: "Router / access point", color: "#f5a623", shape: "diamond" },
  btproxy: { label: "Bluetooth proxy", color: "#f5a623", shape: "diamond" }, // test12: Bluetooth's access point
  router: { label: "Router / repeater", color: "#3b82f6", shape: "square" },
  hub: { label: "Hub / bridge", color: "#3b82f6", shape: "square" },
  end: { label: "End device", color: "#43a047", shape: "round" },
  gp: { label: "Battery-free (Green Power)", color: "#9ccc65", shape: "round" }, // 0.8.1: HA 2026.11, no parent line
  device: { label: "Device", color: "#78909c", shape: "round" },
  unavailable: { label: "Unavailable", color: "#e53935", shape: "round" },
  unknown: { label: "Unknown", color: "#9e9e9e", shape: "round" },
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
  cooling: { word: "Cooling", color: "#29b6f6" },
  heating: { word: "Heating", color: "#ff7043" },
  drying: { word: "Drying", color: "#26a69a" },
  fan: { word: "Fan", color: "#26a69a" },
  idle: { word: "Idle", color: "#90a4ae" },
  preheating: { word: "Preheating", color: "#ff7043" },
  defrosting: { word: "Defrosting", color: "#29b6f6" },
  off: { word: "Off", color: "#9e9e9e" },
};
const CLIMATE_MODE_WORD = { cool: "Cooling", heat: "Heating", dry: "Dry", fan_only: "Fan", heat_cool: "Auto", auto: "Auto", off: "Off" };
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
  return p.length >= 3 ? `${p} ×${names.length}` : names[0] || "Bond";
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
const rpClock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

