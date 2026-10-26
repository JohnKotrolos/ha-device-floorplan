/*
 * Device Floorplan – dashboard card (v0.6.0).
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

const CARD_VERSION = "0.6.0";
const PANEL_PATH = "/device-floorplan";

const OVERLAYS = {
  plan: { label: "Plan", icon: "mdi:floor-plan" },
  live: { label: "Live", icon: "mdi:home-lightbulb-outline" },
  lights: { label: "Lights", icon: "mdi:lightbulb-group-outline" },
  comfort: { label: "Comfort", icon: "mdi:thermometer" },
  security: { label: "Security", icon: "mdi:shield-home-outline" },
  network: { label: "Network", icon: "mdi:access-point-network" },
  health: { label: "Health", icon: "mdi:battery-heart-variant" },
  people: { label: "People", icon: "mdi:account-group-outline" },
};
const OVERLAY_ORDER = ["plan", "live", "lights", "comfort", "security", "network", "health"];

// What Live (and custom overlays) can show, by kind.
const LIVE_KINDS = {
  lights: "Lights",
  switches: "Switches & plugs",
  covers: "Covers & blinds",
  climate: "Climate",
  motion: "Motion & presence",
  openings: "Doors & windows",
  locks: "Locks & alarm",
  media: "Media",
  appliances: "Appliances (running, vacuum…)",
  cameras: "Cameras",
  safety: "Smoke, leak, gas",
};
const LIVE_DEFAULT = ["lights", "switches", "covers", "climate", "motion", "openings", "locks", "media", "appliances"];
const READING_KINDS = { temperature: "Temperature", humidity: "Humidity", battery: "Battery" };
const CUSTOM_KINDS = { ...LIVE_KINDS, ...READING_KINDS };

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
  { value: "none", label: "Nothing" },
];

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
  router: { label: "Router / repeater", color: "#3b82f6", shape: "square" },
  hub: { label: "Hub / bridge", color: "#3b82f6", shape: "square" },
  end: { label: "End device", color: "#43a047", shape: "round" },
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
/** "G", "1", "2", "B1" for HA floor levels; the name when no level. */
function floorLabel(level, name) {
  if (level === 0) return "G";
  if (typeof level === "number" && Number.isFinite(level)) return level < 0 ? `B${-level}` : String(level);
  return (name || "?").slice(0, 2);
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
const SAFETY_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "safety", "problem", "tamper", "heat", "sound"]);
const TOGGLE_DOMAINS = new Set(["light", "switch", "fan", "input_boolean", "cover", "siren", "humidifier"]);

const cesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const live = (st) => !!st && st.state !== "unavailable" && st.state !== "unknown";
const num = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const domainOf = (eid) => (eid ? eid.split(".")[0] : "");
const ieeeKey = (i) => String(i || "").toLowerCase().replace(/^0x/, "").replace(/:/g, "");

// ---- Night look and light pools (#74): pure CSS over the one plan image.
const NIGHT_DEFAULT = { mode: "sun", start: "20:00", end: "07:00", strength: 70, style: "moon", overlays: ["plan", "live", "lights", "people"], dim_quiet: true, shutters: true };

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

/** The colour a light shows: the bulb's own colour, else the lamp colour set in the Editor, else warm. */
function bulbRgb(at, lampCol) {
  const has = at && (Array.isArray(at.rgb_color) || at.color_temp_kelvin || at.color_temp);
  if (has) return lightRgb(at);
  return colourRgb(lampCol) || lightRgb(at || {});
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
  if (type === "panel") return { type, w: m(1.2, 6) };
  if (type === "wall") return { type, r: m(1.2, 5), a: 90 };
  return { type: "bulb", r: m(1.5, 6) };
}

/** Phantom summary for chips outside the plan (#73): combined value from its entities. */
function phantomSummary(hass, ph) {
  const ents = (ph && ph.entities) || [];
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
    return n ? `${n} open` : "All closed";
  }
  const mo = by("motion");
  if (mo.length) return mo.some((e) => (hass.states[e] || {}).state === "on") ? "Detected" : "Clear";
  const li = ents.filter((e) => domainOf(e) === "light");
  if (li.length) return `${li.filter((e) => (hass.states[e] || {}).state === "on").length} of ${li.length} on`;
  return "";
}

function planSensors(hass) {
  return Object.values((hass && hass.states) || {}).filter(
    (s) => s.entity_id.startsWith("sensor.") && s.attributes && s.attributes.plan_id && s.attributes.devices !== undefined,
  );
}

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
          role: type.startsWith("coord") ? "coordinator" : type.startsWith("router") ? "router" : type.startsWith("end") ? "end" : null,
          lqi: num(d.lqi) ? Number(d.lqi) : null,
          rssi: num(d.rssi) ? Number(d.rssi) : null,
          available: d.available !== false,
        };
        for (const n of d.neighbors || []) if (n.ieee && num(n.lqi)) links.push({ a: k, b: ieeeKey(n.ieee), lqi: Number(n.lqi) });
      }
      _zhaCache = { at: Date.now(), data: { byIeee, links } };
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
    if (dc === "temperature") return "temperature";
    if (dc === "humidity") return "humidity";
    if (dc === "battery") return "battery";
    if (dc === "signal_strength" || /_(linkquality|lqi|rssi|signal_strength|wifi_signal)$/.test(eid)) return "signal";
    return "sensor";
  }
  return "other";
}

/** Kind → Live / custom overlay setting key. */
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

/** Room temperature, not the chip temperature of a switch or contact sensor. */
function ambientTemp(eid, st, item) {
  if (/(device_temperature|internal_temperature|cpu_temperature|processor_temperature|chip_temperature|_temperature_internal)/i.test(eid)) return false;
  if (st && st.attributes && st.attributes.entity_category === "diagnostic") return false;
  if (item.standalone) return true;
  return ["sensors", "climate", "computers", "motion"].includes(item.group);
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
ha-card.dock-top { flex-direction: column-reverse; }
ha-card.dock-left { flex-direction: row-reverse; }
ha-card.dock-right { flex-direction: row; }
.main { position:relative; flex:1; display:flex; flex-direction:column; min-width:0; }
.hdr { position:absolute; left:14px; top:12px; z-index:4; font-size:15px; font-weight:500; padding:4px 10px; border-radius:10px; background: color-mix(in srgb, var(--card-background-color, #fff) 75%, transparent); backdrop-filter: blur(6px); }
.wrap { position:relative; flex:1; display:flex; align-items:center; justify-content:center; padding: 8px 8px 0; min-height:120px; }
.box { position:relative; width: min(100%, calc((100vh - var(--dfc-chrome, 170px)) * var(--ratio))); aspect-ratio: var(--ratio); }
.night, .ntint, .nglow, .nglow2 { position:absolute; inset:0; pointer-events:none; }
.box svg.air, .box svg.shade { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.nglow { mix-blend-mode: soft-light; }
.nglow.day { mix-blend-mode: multiply; opacity:.85; filter: saturate(1.6); }
.nglow2 { mix-blend-mode: screen; }
.box.nt .room.label { color:#fff; text-shadow: 0 0 3px rgba(0,0,0,.9), 0 0 7px rgba(0,0,0,.8); }
.box.nq .m:not(.on):not(.person) .ic, .box.nq .chip:not(.on) { filter: brightness(.78) saturate(.85); box-shadow: 0 0 0 1px rgba(255,255,255,.22), 0 1px 4px rgba(0,0,0,.5); }
.m.person .ic { background: var(--dfc-accent); color:#fff; font-weight:600; font-size: calc(var(--dfc-size) * .38); overflow:hidden; border: 2px solid var(--card-background-color, #fff); width: calc(var(--dfc-size) * 1.1); height: calc(var(--dfc-size) * 1.1); }
.m.person .ic img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
.m.person.low .ic { opacity:.55; border-style: dashed; }
.m.person { z-index:3; }
.prow { display:flex; align-items:center; gap:8px; padding:6px 4px 0; flex-wrap:wrap; font-size:12px; color: var(--secondary-text-color); }
.prow button { border:0; background:transparent; padding:0; cursor:pointer; display:flex; align-items:center; gap:5px; font: inherit; color: var(--primary-text-color); }
.prow .av { width:26px; height:26px; border-radius:50%; background: var(--dfc-accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; overflow:hidden; }
.prow .av img { width:100%; height:100%; object-fit:cover; }
.box img.plan { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; user-select:none; -webkit-user-drag:none; }
svg.lines { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
svg.lines line { stroke-linecap: round; }
svg.lines line.lead { stroke: var(--secondary-text-color); stroke-width:1; opacity:.55; }
svg.lines line.hub { stroke: var(--dfc-accent); stroke-width:1.6; stroke-dasharray: 5 4; opacity:.75; }
.room { position:absolute; transform: translate(-50%, -50%); pointer-events:none; white-space:nowrap; font-weight:500; color: var(--dfc-roomfg); display:flex; align-items:center; gap:4px; z-index:0; }
.room.label { text-shadow: 0 0 3px var(--dfc-roomhalo), 0 0 6px var(--dfc-roomhalo); }
.room.pill { padding: 2px 9px; border-radius: 10px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); border: 1px solid var(--dfc-chipborder); }
.room ha-icon { --mdc-icon-size: 1.15em; }
.m { position:absolute; transform: translate(-50%, -50%); border:0; padding:0; background:transparent; cursor:pointer; font: inherit; color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; touch-action: manipulation; z-index:1; }
.m .ic { width: var(--dfc-size); height: var(--dfc-size); border-radius:50%; display:flex; align-items:center; justify-content:center; background: var(--card-background-color, #fff); box-shadow: 0 1px 4px rgba(0,0,0,.35); --mdc-icon-size: calc(var(--dfc-size) * .55); border: 2px solid transparent; transition: box-shadow .2s, background .2s, transform .1s; position:relative; }
.m:active .ic { transform: scale(.94); }
.m.on .ic { border-color: var(--dfc-c, var(--dfc-accent)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dfc-c, var(--dfc-accent)) 25%, transparent), 0 1px 6px rgba(0,0,0,.35); }
.m.light.on .ic { background: color-mix(in srgb, var(--dfc-lc, #ffc107) 22%, var(--card-background-color, #fff)); color: color-mix(in srgb, var(--dfc-lc, #ffc107) 80%, #000 12%); box-shadow: 0 0 16px 2px color-mix(in srgb, var(--dfc-lc, #ffc107) 55%, transparent); border-color: var(--dfc-lc, #ffc107); }
.m.glow .ic, .m.glow .val { opacity:0; }
.m.noi .ic { display:none; }
.bdg { position:absolute; top:-7px; right:-9px; min-width:16px; height:16px; padding:0 4px; border-radius:8px; background: var(--dfc-c, var(--primary-color, #03a9f4)); color:#fff; font-size:10px; font-weight:600; line-height:16px; text-align:center; white-space:nowrap; box-shadow:0 0 0 2px var(--card-background-color, #fff); pointer-events:none; }
.chip .bdg { top:-8px; right:-8px; }
.m.noi .val { position:static; transform:none; margin:0; }
.m .xs, .chip .xs { display:flex; flex-direction:column; align-items:flex-start; gap:0; font-size: calc(var(--dfc-size) * .3); line-height:1.25; }
.m .xs { position:absolute; top: calc(100% + 2px); left:50%; transform: translateX(-50%); background: var(--dfc-chipbg); color: var(--dfc-chipfg); border:1px solid var(--dfc-chipborder); border-radius:8px; padding:2px 7px; white-space:nowrap; pointer-events:none; box-shadow:0 1px 4px rgba(0,0,0,.3); }
.chip .xs { margin-top:2px; opacity:.85; }
.xl { display:flex; align-items:center; gap:3px; white-space:nowrap; --mdc-icon-size: calc(var(--dfc-size) * .32); }
.chip.cl2.cmp { gap:5px; padding: 4px 9px 4px 6px; }
.chip.cl2.cmp .t { font-size: calc(var(--dfc-size) * .42); font-weight:500; white-space:nowrap; }
.chip.cl2.cmp .mw { font-size: calc(var(--dfc-size) * .32); opacity:.8; }
.m.dim .ic { opacity:.55; transform: scale(.82); }
.m.unavail .ic { opacity:.45; border: 2px dashed var(--secondary-text-color); }
.m.motion.on .ic::after { content:''; position:absolute; inset:-2px; border-radius:50%; border:2px solid var(--dfc-c); animation: dfcpulse 1.8s ease-out infinite; }
@keyframes dfcpulse { from { transform: scale(1); opacity:.9; } to { transform: scale(1.9); opacity:0; } }
.m.ph .ic { background: var(--primary-text-color); color: var(--card-background-color, #fff); outline: 2px dashed var(--primary-text-color); outline-offset: 2px; width: calc(var(--dfc-size) * 1.15); height: calc(var(--dfc-size) * 1.15); }
.m.ph.on .ic { border-color: var(--dfc-c); }
.chip.ph { border: 2px dashed var(--primary-text-color); }
.phsum { display:flex; align-items:center; gap:8px; padding:4px 2px 10px; }
.phsum b { font-size:20px; font-weight:500; }
.phsum small { color: var(--secondary-text-color); margin-left:auto; }
.m .bn { position:absolute; top:-6px; right:-8px; min-width:17px; height:17px; border-radius:9px; background: var(--dfc-accent); color:#fff; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; border:2px solid var(--card-background-color, #fff); padding:0 3px; }
.m .val { position:absolute; left: calc(100% + 4px); top:50%; transform: translateY(-50%); white-space:nowrap; font-size:12px; font-weight:500; padding:2px 7px; border-radius:9px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.m.net .ic { background: var(--dfc-fill); color:#fff; border: 3px solid var(--dfc-ring, transparent); }
.m.net.diamond .ic { border-radius: 4px; transform: rotate(45deg) scale(.86); }
.m.net.diamond .ic ha-icon { transform: rotate(-45deg); }
.m.net.square .ic { border-radius: 7px; }
.m.net.unavailable .ic { opacity:.8; }
.chip { position:absolute; transform: translate(-50%, -50%); border:0; cursor:pointer; font: inherit; padding: 6px 12px; border-radius: 12px; background: var(--dfc-chipbg); color: var(--dfc-chipfg); box-shadow: 0 2px 8px rgba(0,0,0,.28); display:flex; flex-direction:column; align-items:center; gap:1px; line-height:1.2; text-align:center; border: 1px solid var(--dfc-chipborder); backdrop-filter: blur(4px); -webkit-tap-highlight-color: transparent; z-index:1; }
.chip .l1 { font-size: calc(var(--dfc-size) * .42); font-weight:500; white-space:nowrap; }
.chip .l2 { font-size: calc(var(--dfc-size) * .38); opacity:.9; white-space:nowrap; }
.chip .ico { --mdc-icon-size: 15px; display:flex; align-items:center; gap:4px; font-size: calc(var(--dfc-size) * .38); font-weight:500; white-space:nowrap; }
.chip.clim { border-left: 4px solid var(--dfc-c); }
.chip.clim .ico { font-size: calc(var(--dfc-size) * .42); --mdc-icon-size: calc(var(--dfc-size) * .42); }
.chip.clim .ico ha-icon { color: var(--dfc-c); }
.chip.clim.off { opacity:.7; }
.chip.low { background:#e53935; color:#fff; border-color:#e53935; }
.chip.warn { border-color: var(--warning-color, #ffa000); border-width:2px; }
.m .tip, .chip .tip { position:absolute; left:50%; bottom: calc(100% + 6px); transform: translateX(-50%); white-space:nowrap; font-size:12px; font-weight:400; padding: 3px 8px; border-radius:6px; background: rgba(28,28,28,.92); color:#fff; opacity:0; pointer-events:none; transition: opacity .12s; z-index:3; }
.m.net.diamond .tip { transform: translateX(-50%); }
@media (hover: hover) { .m:hover .tip, .chip:hover .tip { opacity:1; } }
.names-always .tip { opacity:1; }
.names-always .tip small { display:none; }
.xb { position:absolute; top:-9px; right:-9px; width:20px; height:20px; border-radius:50%; background:#b3261e; color:#fff; font-size:12px; line-height:20px; text-align:center; cursor:pointer; z-index:8; box-shadow:0 1px 4px rgba(0,0,0,.4); pointer-events:auto; }
.dock .pen { position:static; box-shadow:none; margin-left:6px; }
.pen { position:absolute; top:8px; left:8px; z-index:6; display:flex; align-items:center; gap:6px; border:0; border-radius:16px; padding:6px 12px 6px 9px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-size:13px; font-weight:500; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); --mdc-icon-size:16px; }
.pen.hint { background: color-mix(in srgb, var(--card-background-color, #fff) 90%, transparent); color: var(--primary-text-color); cursor:default; box-shadow:0 1px 4px rgba(0,0,0,.2); font-weight:400; }
.names-off .tip { display:none; }
.m:hover, .chip:hover { z-index:3; }
.m:focus-visible .ic, .chip:focus-visible { outline: 3px solid var(--dfc-accent); outline-offset: 2px; }
.dockrow { display:flex; justify-content:center; padding: 10px 10px 12px; }
.dock-top .dockrow { padding: 12px 10px 2px; }
.dock-left .dockrow, .dock-right .dockrow { flex-direction:column; justify-content:center; padding: 10px 8px; }
.dock { display:flex; gap:2px; padding:4px; border-radius: 22px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 80%, transparent); max-width:100%; overflow-x:auto; scrollbar-width:none; }
.dock-left .dock, .dock-right .dock { flex-direction:column; max-height:100%; overflow-y:auto; }
.dock::-webkit-scrollbar { display:none; }
.dock button { display:flex; align-items:center; gap:6px; border:0; background:transparent; color: var(--secondary-text-color); font: inherit; font-size:13px; padding: 8px 14px; border-radius: 18px; cursor:pointer; white-space:nowrap; --mdc-icon-size: 18px; }
.dock-left .dock button, .dock-right .dock button { flex-direction:column; gap:3px; font-size:11px; padding: 9px 10px; }
.dock button.on { background: var(--card-background-color, #fff); color: var(--dfc-accent); box-shadow: 0 1px 4px rgba(0,0,0,.18); font-weight:500; }
.dock.icons button { padding: 8px 11px; }
.dock.icons button span { display:none; }
.bar { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; padding: 8px 10px 0; }
.bar button { display:flex; align-items:center; gap:5px; border: 1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:12px; padding: 5px 11px; border-radius: 16px; cursor:pointer; --mdc-icon-size: 16px; }
.bar button.on { border-color:#ffc107; background: color-mix(in srgb, #ffc107 18%, var(--card-background-color, #fff)); }
.legend { display:flex; flex-wrap:wrap; justify-content:center; gap: 4px 14px; padding: 6px 10px 0; font-size:12px; color: var(--secondary-text-color); }
.legend span { display:flex; align-items:center; gap:5px; }
.legend i { display:inline-block; width:10px; height:10px; border-radius:50%; }
.legend i.square { border-radius:2px; } .legend i.diamond { border-radius:1px; transform: rotate(45deg) scale(.85); }
.legend i.ring { background:transparent !important; border: 3px solid; }
.dock .sep { width:1px; align-self:stretch; margin: 6px 4px; background: var(--divider-color); flex: none; }
.dock-left .dock .sep, .dock-right .dock .sep { width:auto; height:1px; margin: 4px 6px; }
.dock button.layers.on { color: var(--dfc-accent); }
.legend button.layers { display:flex; align-items:center; gap:5px; border: 1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:12px; padding: 3px 10px; border-radius: 14px; cursor:pointer; --mdc-icon-size: 16px; }
.legend button.layers.on { color: var(--dfc-accent); border-color: var(--dfc-accent); }
.legend i.dash { width:16px; height:0; border-radius:0; border-top: 2px dashed var(--dfc-accent); }
.lmenu { position:absolute; left:0; top:0; z-index:6; min-width: 230px; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.35); padding: 10px 6px; font-size:14px; }
.lmenu h4 { margin: 2px 10px 6px; font-size:13px; font-weight:500; color: var(--secondary-text-color); }
.lmenu button { display:flex; align-items:center; gap:10px; width:100%; border:0; background:transparent; color:inherit; font: inherit; padding: 7px 10px; border-radius: 8px; cursor:pointer; text-align:left; --mdc-icon-size: 20px; }
.lmenu button:hover { background: var(--secondary-background-color); }
.lmenu button ha-icon.eye { color: var(--secondary-text-color); }
.lmenu button.on ha-icon.eye { color: var(--dfc-accent); }
.lmenu .sl { padding: 6px 10px 2px; display:flex; flex-direction:column; gap:4px; font-size:13px; }
.lmenu .sl div { display:flex; justify-content:space-between; }
.lmenu input[type=range] { width:100%; accent-color: var(--dfc-accent); }
.lmenu hr { border:0; border-top:1px solid var(--divider-color); margin: 6px 4px; }
.admin { position:absolute; right:12px; top:12px; z-index:4; border:0; border-radius:14px; padding: 5px 10px; font: inherit; font-size:12px; cursor:pointer; background: var(--dfc-accent); color: var(--text-primary-color, #fff); box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.msg { padding: 24px 16px; color: var(--secondary-text-color); font-size: 14px; text-align:center; }
.empty { position:absolute; left:50%; top:50%; transform: translate(-50%,-50%); font-size:13px; color: var(--secondary-text-color); background: var(--card-background-color); padding: 8px 12px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.2); pointer-events:none; max-width: 80%; text-align:center; z-index:2; }
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

/* floors rail (#75): beside the plan, never on it */
.wrap { gap: 8px; }
.wrap.hasrail .box { width: min(calc(100% - 58px), calc((100vh - var(--dfc-chrome, 170px)) * var(--ratio))); }
.rail { flex: none; display:flex; flex-direction:column; align-items:center; gap:6px; padding: 8px 5px; border-radius: 24px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 80%, transparent); align-self:center; position:relative; }
.rail button { width:38px; height:38px; border-radius:50%; border:1.5px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:14px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; --mdc-icon-size: 20px; padding:0; position:relative; }
.rail button.arrow { border:0; background:transparent; width:30px; height:24px; color: var(--secondary-text-color); }
.rail button.arrow:disabled { opacity:.3; cursor:default; }
.rail button.fl.on { background: var(--dfc-accent); border-color: var(--dfc-accent); color: #fff; }
.rail button.layers { border:0; background:transparent; color: var(--secondary-text-color); }
.rail button.layers.on { color: var(--dfc-accent); }
.rail .pill { position:absolute; right: calc(100% + 8px); top:50%; transform: translateY(-50%); white-space:nowrap; font-size:12px; font-weight:500; padding: 4px 10px; border-radius: 12px; background: rgba(28,28,28,.88); color:#fff; pointer-events:none; opacity:0; transition: opacity .2s; }
.rail button.fl.on .pill.show, .rail button.fl:hover .pill { opacity:1; }
.rail hr { width: 70%; border:0; border-top: 1px solid var(--divider-color); margin: 2px 0; }
/* climate chip v2 */
.chip.cl2 { flex-direction:row; align-items:center; gap: 7px; padding: 5px 9px 5px 7px; border: 2px solid var(--dfc-c); text-align:left; }
.chip.cl2 > ha-icon { --mdc-icon-size: calc(var(--dfc-size) * .56); color: var(--dfc-c); flex:none; }
.chip.cl2 .mc { display:flex; flex-direction:column; line-height:1.15; }
.chip.cl2 .mw { font-size: calc(var(--dfc-size) * .36); font-weight:500; white-space:nowrap; }
.chip.cl2 .st { font-size: calc(var(--dfc-size) * .31); opacity:.75; white-space:nowrap; }
.chip.cl2 .vs { width:1px; align-self:stretch; background: currentColor; opacity:.25; margin: 1px 1px; }
.chip.cl2 .tc { display:flex; flex-direction:column; align-items:flex-end; line-height:1.15; }
.chip.cl2 .t { font-size: calc(var(--dfc-size) * .44); font-weight:500; white-space:nowrap; }
.chip.cl2 .h { font-size: calc(var(--dfc-size) * .31); opacity:.8; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-size) * .32); }
.chip.cl2.off { opacity:.62; }
.chip.rd { padding: 5px 9px; }
.chip.rd .tc, .chip.cl2 .tc { display:flex; flex-direction:column; align-items:flex-end; line-height:1.15; }
.chip.rd .tc { align-items:center; }
.chip.rd .t { font-size: calc(var(--dfc-size) * .44); font-weight:500; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-size) * .38); }
.chip.rd .h { font-size: calc(var(--dfc-size) * .31); opacity:.8; white-space:nowrap; display:flex; align-items:center; gap:1px; --mdc-icon-size: calc(var(--dfc-size) * .32); }
.narrow .chip.cl2 .mw { display:none; }
/* highlight from a popup list */
.m.hl .ic, .chip.hl { animation: dfchl 1.1s ease-in-out 3; }
@keyframes dfchl { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--dfc-accent) 55%, transparent); } }
svg.lines line.hl { stroke-width: 4 !important; opacity: 1 !important; }
/* legend chips toggle roles (#64) */
.legend button.lg { display:flex; align-items:center; gap:5px; border:0; background:transparent; color:inherit; font: inherit; font-size:12px; padding: 2px 4px; border-radius: 10px; cursor:pointer; }
.legend button.lg.off { opacity:.4; text-decoration: line-through; }
.legend .upd { display:flex; align-items:center; gap:4px; }
.legend button.rf { border:1px solid var(--divider-color); background: var(--card-background-color,#fff); color: var(--primary-text-color); border-radius: 12px; padding: 2px 8px; font: inherit; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; --mdc-icon-size: 15px; }
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
    if (!config || !(config.plan || (Array.isArray(config.plans) && config.plans.length))) throw new Error("Choose a plan (plan: <plan id>)");
    this._raw = config; // as stored in the dashboard (to find and save this card, #97)
    const c = { ...config };
    // Older configs (0.4.x card, card v0.0x): keep them working.
    if (!c.default_overlay && c.default_view) c.default_overlay = c.default_view === "plan" ? "plan" : "live";
    this._config = c;
    const dock = this._overlays();
    if (!this._overlay || !dock.includes(this._overlay)) this._overlay = this._defaultOverlay();
    const net = this._ov("network");
    const saved = lsGet(`dfc_net_${this._lsKey()}`) || {};
    this._net = {
      conns: Array.isArray(saved.conns) ? saved.conns : null, // null = the card's default
      roles: Array.isArray(saved.roles) ? saved.roles : [], // hidden roles
      links: net.links !== false,
      hubs: net.hub_links !== false,
      minLqi: Number(net.min_lqi || 0),
      legend: net.legend !== false,
    };
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
    const first = !this._hass;
    this._hass = hass;
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

  /** "pen" on panel / masonry dashboards, "hint" on sections (HA makes cards inert there), else "". */
  _penMode() {
    if (!this._editMode || this._pick || !this._raw) return "";
    const root = this._up((el) => el.tagName === "HUI-ROOT");
    if (!root || !root.lovelace) return ""; // e.g. the card editor's preview
    return this._up((el) => el.tagName === "HUI-CARD-EDIT-MODE") ? "hint" : "pen";
  }

  /** Save this card's config straight into the dashboard (storage mode), through HA's websocket API:
   *  independent of the frontend's internals, and still works after HA re-creates the card. */
  async _saveToDashboard(newCfg) {
    const seg = (window.location.pathname.split("/")[1] || "").trim();
    if (!this._penPath) this._penPath = seg && seg !== "lovelace" ? seg : null;
    const q = this._penPath ? { url_path: this._penPath } : {};
    let cfg;
    try {
      cfg = await this._hass.callWS({ type: "lovelace/config", ...q });
    } catch (_e) {
      throw new Error("read");
    }
    const want = stableJson(this._penOrig);
    let done = false;
    const walk = (node) => {
      if (done || !node || typeof node !== "object") return;
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object" && !Array.isArray(v) && v.type === "custom:device-floorplan-card" && stableJson(v) === want) {
          node[k] = newCfg;
          done = true;
          return;
        }
        walk(v);
      }
    };
    walk(cfg);
    if (!done) throw new Error("notfound");
    try {
      await this._hass.callWS({ type: "lovelace/config/save", config: cfg, ...q });
    } catch (e) {
      throw new Error(/yaml|not supported|mode/i.test(String((e && e.message) || "")) ? "yaml" : "save");
    }
    this._penOrig = newCfg;
  }

  /** ✎ Edit markers: the same big plan as in the card editor, saving to the dashboard. */
  _openPen() {
    const ed = document.createElement("device-floorplan-card-editor");
    ed._hass = this._hass;
    ed._config = { ...this._raw };
    ed._built = true;
    this._penOrig = this._raw;
    let t = null;
    const flush = async () => {
      clearTimeout(t);
      t = null;
      try {
        await this._saveToDashboard({ type: "custom:device-floorplan-card", ...ed._config });
      } catch (e) {
        const why = e && e.message;
        const msg = why === "yaml" ? "This dashboard is kept in YAML: use Edit card → Edit markers there and copy the YAML." : why === "notfound" ? "This card changed outside the Marker Editor. Close it (Done) and open Edit markers again." : "Couldn't save to the dashboard. Use Edit card → Edit markers instead.";
        if (ed._big) {
          const side = ed._big.wrap.querySelector(".bg-side");
          if (side && !side.querySelector(".bg-err")) side.insertAdjacentHTML("afterbegin", `<p class="bg-err">${cesc(msg)}</p>`);
        }
      }
    };
    ed._emit = () => {
      clearTimeout(t);
      t = setTimeout(flush, 700);
    };
    ed._openBig({ direct: true, onClose: () => t && flush() });
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
        const t = e.target.closest && e.target.closest("[data-k]");
        if (!t) return;
        e.preventDefault();
        this._hold(t.dataset.k);
      });
      root.addEventListener("pointerdown", (e) => {
        const t = e.target.closest && e.target.closest("[data-k]");
        if (!t || e.button > 0) return;
        clearTimeout(this._holdT);
        this._held = false;
        this._holdT = setTimeout(() => {
          this._held = true;
          this._hold(t.dataset.k);
        }, 550);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) root.addEventListener(ev, () => clearTimeout(this._holdT));
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
    window.addEventListener("location-changed", this._onLocation);
    window.addEventListener("popstate", this._onLocation);
    this._onVisible = this._onVisible || (() => {
      if (!document.hidden && this._dirty) this._update(true);
    });
    document.addEventListener("visibilitychange", this._onVisible);
    if (!this._ro && typeof ResizeObserver !== "undefined") this._ro = new ResizeObserver(() => this._layoutSoon());
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
    clearInterval(this._nightT);
    window.removeEventListener("device-floorplan-action", this._onExternal);
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
    const hit = f.find((x) => x.id === q) || f.find((x) => (x.floor_id || "") === q) || f.find((x) => x.label.toLowerCase() === v) || f.find((x) => x.name.toLowerCase() === v);
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
  }

  /** Floors stacked like a building: highest on top. */
  _floorStack() {
    return this._floors().slice().sort((a, b) => (Number.isFinite(b.level) ? b.level : -99) - (Number.isFinite(a.level) ? a.level : -99));
  }

  _stepFloor(dir) {
    const st = this._floorStack();
    const i = st.findIndex((f) => f.id === this._floor);
    const n = st[i - dir]; // dir +1 = up = earlier in the stack
    if (n) this._setFloor(n.id);
  }

  // ------------------------------------------------------------- settings
  _custom() {
    return (Array.isArray(this._config.custom_overlays) ? this._config.custom_overlays : []).filter((o) => o && o.id && !OVERLAYS[o.id]);
  }

  _ovDef(o) {
    if (OVERLAYS[o]) return OVERLAYS[o];
    const c = this._custom().find((x) => x.id === o);
    return c ? { label: c.name || "Custom", icon: c.icon || "mdi:layers-outline", custom: c } : null;
  }

  _overlays() {
    const list = Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...(this._people().length ? ["people"] : []), ...this._custom().map((c) => c.id)];
    return list.filter((o) => this._ovDef(o));
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
      f = e >= 6 ? 0 : e <= -6 ? 1 : (6 - e) / 12;
      if (f > 0 && f < 1) tint = sun.attributes.rising ? "dawn" : "dusk";
    } else if (mode === "times") f = timesFactor(n.start, n.end, new Date());
    return { f: Math.round(f * 20) / 20, tint, mode };
  }

  /** Lights that are on, as glowing pools from their shape in the Editor (default: a bulb). */
  _pools(a) {
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const out = [];
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      // #84: lamps get a bulb by default; anything else with a light only when a shape was chosen.
      const lamp = item.group === "lights" || item.as === "light" || ((!item.group || item.standalone) && domainOf(item.main_entity || "") === "light");
      const chosen = item.light && item.light.type;
      if (!lamp && (!chosen || item.light.type === "none")) continue;
      const pool = item.bond ? item.entities : (item.allEntities || item.entities || []).concat(item.main_entity ? [item.main_entity] : []);
      const lights = [...new Set(pool)].filter((e) => e && (domainOf(e) === "light" || (item.as === "light" && e === item.main_entity)));
      if (!lights.length) continue;
      const on = lights.map((e) => hass.states[e]).filter((s) => s && s.state === "on");
      if (!on.length) continue;
      const shape = chosen ? { ...defaultShape(item.light.type, a.real_width_m), ...item.light } : defaultShape("bulb", a.real_width_m);
      if (shape.type === "none") continue;
      const bs = on.map((s) => (s.attributes.brightness != null ? Number(s.attributes.brightness) / 255 : 1));
      const b = Math.max(0.2, Math.min(1, bs.reduce((x, y) => x + y, 0) / bs.length)) * (0.6 + (0.4 * on.length) / lights.length);
      // #111: the light stays inside its room's shape.
      const devs = a.devices || {};
      const aid = item.area_id || (item.of && devs[item.of] && devs[item.of].area_id) || (item.members && (devs[item.members[0]] || {}).area_id) || null;
      const areas = a.areas || {};
      let start = aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = Object.keys(areas).find((k) => areas[k].shape && inPoly(item.x, item.y, areas[k].shape)) || null;
      if (!this._groups || this._groups.a !== a) this._groups = { a, by: {} };
      if (start && !(start in this._groups.by)) this._groups.by[start] = shapeGroup(areas, start);
      out.push({ rgb: bulbRgb(on[0].attributes || {}, item.light && item.light.color), b, ell: shapeEllipses(item.x, item.y, shape, ratio), shapes: start ? this._groups.by[start] : null });
    }
    return out;
  }

  /** #115: air flowing from ACs while they cool / heat (Live, Comfort), kept inside the room shapes. */
  _airHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "comfort") return "";
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const areas = a.areas || {};
    const W = a.real_width_m;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const COL = { cool: "79,163,255", heat: "255,138,61", dry: "60,193,176", fan: "60,193,176" };
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
      let mode = act ? { cooling: "cool", heating: "heat", drying: "dry", fan: "fan" }[act] : { cool: "cool", heat: "heat", dry: "dry", fan_only: "fan", heat_cool: "cool", auto: "cool" }[st.state];
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
      const cone = { a: ang, r: W ? (2 / W) * 100 : 10, s: 60, ...(item.air || {}) };
      const rad = (d) => (d * Math.PI) / 180;
      const pt = (d, r) => [Math.cos(rad(d)) * r, Math.sin(rad(d)) * r * ratio];
      const [ax, ay] = pt(cone.a - cone.s / 2, cone.r);
      const [bx, by] = pt(cone.a + cone.s / 2, cone.r);
      const arc = (k) => {
        const [x1, y1] = pt(cone.a - (cone.s / 2) * 0.92, cone.r * k);
        const [x2, y2] = pt(cone.a + (cone.s / 2) * 0.92, cone.r * k);
        return `M${x1.toFixed(2)},${y1.toFixed(2)} A${(cone.r * k).toFixed(2)},${(cone.r * k * ratio).toFixed(2)} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
      };
      defs += `<radialGradient id="ag${i}" cx="0" cy="0" r="${cone.r}" gradientUnits="userSpaceOnUse" gradientTransform="scale(1 ${ratio})"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".62"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`;
      const waves = still ? `<path d="${arc(0.6)}" fill="none" stroke="rgba(${c},.55)" stroke-width="2" vector-effect="non-scaling-stroke"/>` : [0, 1, 2].map((k) => `<g><path d="${arc(1)}" fill="none" stroke="rgba(${c},.95)" stroke-width="2.8" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0"><animateTransform attributeName="transform" type="scale" from="0.12" to="1" dur="3s" begin="${k}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="3s" begin="${k}s" repeatCount="indefinite"/></path></g>`).join("");
      body += `<g${clip}><g transform="translate(${item.x} ${item.y})"><path d="M0,0 L${ax.toFixed(2)},${ay.toFixed(2)} A${cone.r},${cone.r * ratio} 0 0 1 ${bx.toFixed(2)},${by.toFixed(2)} Z" fill="url(#ag${i})"/>${waves}</g></g>`;
    }
    if (!n) return "";
    return `<svg class="air" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  }

  /** #117: by day, a room gets darker the more of its shutters / blinds are closed (needs a room shape). */
  _shadeHtml(a, n, ns) {
    if (n.shutters === false || !(n.overlays || []).includes(this._overlay)) return "";
    const day = 1 - (ns.f || 0);
    if (day <= 0.05) return "";
    const hass = this._hass;
    const areas = a.areas || {};
    const shaped = Object.keys(areas).filter((k) => areas[k].shape && areas[k].shape.length >= 3);
    if (!shaped.length) return "";
    const rooms = {};
    const seen = new Set();
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      const covers = [item.main_entity, ...(item.entities || [])].filter((e, i, arr) => e && arr.indexOf(e) === i && domainOf(e) === "cover" && hass.states[e]);
      for (const e of covers) {
        if (seen.has(e)) continue;
        seen.add(e);
        const st = hass.states[e];
        const dc = st.attributes.device_class;
        if (["garage", "gate", "door", "damper"].includes(dc)) continue;
        let aid = item.area_id && areas[item.area_id] && areas[item.area_id].shape ? item.area_id : null;
        if (!aid) aid = shaped.find((k) => inPoly(item.x, item.y, areas[k].shape)) || null;
        if (!aid) continue;
        const pos = st.attributes.current_position;
        const open = num(pos) ? Number(pos) / 100 : st.state === "closed" ? 0 : ["open", "opening", "closing"].includes(st.state) ? 1 : null;
        if (open == null) continue;
        (rooms[aid] = rooms[aid] || []).push(open);
      }
    }
    let polys = "";
    for (const [aid, opens] of Object.entries(rooms)) {
      const avg = opens.reduce((t, v) => t + v, 0) / opens.length;
      const k = 0.62 * (1 - avg) * day; // all closed ≈ quite dark, never black
      if (k < 0.04) continue;
      polys += `<polygon points="${areas[aid].shape.map((q) => `${q[0]},${q[1]}`).join(" ")}" fill="rgb(12,18,34)" fill-opacity="${k.toFixed(2)}"/>`;
    }
    return polys ? `<svg class="shade" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polys}</svg>` : "";
  }

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
    const grad = (p, e, c0, c1) => `radial-gradient(ellipse ${e.rx.toFixed(2)}% ${e.ry.toFixed(2)}% at ${e.x.toFixed(2)}% ${e.y.toFixed(2)}%, ${c0} 0%, ${c1} 100%)`;
    if (on) {
      const base = n.style === "dim" ? `rgba(0,0,0,${(0.82 * k).toFixed(3)})` : `rgba(10,16,38,${(0.86 * k).toFixed(3)})`;
      const mk = pools.length ? poolSvg(pools, "mask") : "";
      const mask = mk ? `-webkit-mask-image:${mk};mask-image:${mk};-webkit-mask-size:100% 100%;mask-size:100% 100%;` : "";
      html += `<div class="night" style="background:${base};${mask}"></div>`;
      if (ns.tint) html += `<div class="ntint" style="background:${ns.tint === "dusk" ? "rgba(255,140,60," : "rgba(120,160,255,"}${(0.2 * Math.sin(Math.PI * ns.f)).toFixed(3)})"></div>`;
    }
    if (pools.length) {
      const g = poolSvg(pools, "glow");
      if (on) html += `<div class="nglow" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:${(0.25 + 0.3 * ns.f).toFixed(2)}"></div>`;
      // By day, light pools tint the floor (multiply) so they stay visible on a bright plan.
      else html += `<div class="nglow day" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:.35"></div>`;
    }
    return html;
  }

  // ------------------------------------------------------------- people (#67)
  _people() {
    return Array.isArray(this._config.people) ? this._config.people.filter((p) => p && p.entity) : [];
  }

  _peopleShown() {
    if (!this._people().length) return false;
    const ov = this._overlay;
    return ov === "people" || (Array.isArray(this._config.people_in) && this._config.people_in.includes(ov));
  }

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
  }

  _peopleData(a) {
    const hass = this._hass;
    const placed = [];
    const home = [];
    for (const p of this._people()) {
      const st = hass.states[p.entity];
      if (!st) continue;
      const name = p.name || (st.attributes && st.attributes.friendly_name) || p.entity;
      const pic = st.attributes && st.attributes.entity_picture ? (this._hass.hassUrl ? this._hass.hassUrl(st.attributes.entity_picture) : st.attributes.entity_picture) : null;
      const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const r = st.state === "home" || p.room || p.room2 ? this._personRoom(p, a) : null;
      const who = { eid: p.entity, name, pic, initials };
      if (r && st.state !== "not_home") placed.push({ ...who, room: r.id, roomName: r.ar.name, low: r.low, x: r.ar.x, y: r.ar.y });
      else if (st.state === "home") home.push(who);
    }
    // Several people in one room: side by side under the room name.
    const W = this._boxW || 900;
    const H = W / (a.image_width && a.image_height ? a.image_width / a.image_height : 1.6);
    const size = (Number(this._look().size) || 34) * (this._scale || 1) * 1.15;
    const byRoom = {};
    for (const x of placed) (byRoom[x.room] = byRoom[x.room] || []).push(x);
    for (const list of Object.values(byRoom)) list.forEach((x, i) => {
      x.x += ((i - (list.length - 1) / 2) * size * 1.08 * 100) / W;
      x.y += (size * 0.95 * 100) / H;
    });
    return { placed, home };
  }

  _peopleHtml(a) {
    if (!this._peopleShown()) return { plan: "", row: "" };
    const { placed, home } = this._peopleData(a);
    const av = (x) => (x.pic ? `<img src="${cesc(x.pic)}" alt="">` : cesc(x.initials));
    const plan = placed.map((x) => `<button class="m person ${x.low ? "low" : ""}" style="left:${x.x}%;top:${x.y}%" data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${x.roomName}${x.low ? " (not sure)" : ""}`)}"><span class="ic">${av(x)}</span><span class="tip">${cesc(x.name)} · ${cesc(x.roomName)}</span></button>`).join("");
    const row = this._overlay === "people" && home.length ? `<div class="prow"><span>Home</span>${home.map((x) => `<button data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: home, room unknown`)}"><span class="av">${av(x)}</span>${cesc(x.name)}</button>`).join("")}</div>` : "";
    return { plan, row };
  }

  /** Tell chip cards on this screen which overlay is showing (#73). */
  _announce() {
    if (this._announced === this._overlay) return;
    this._announced = this._overlay;
    const key = (this._config && this._config.card_id) || "_";
    window.__dfpActive = { ...(window.__dfpActive || {}), [key]: this._overlay };
    window.dispatchEvent(new CustomEvent("device-floorplan-overlay", { detail: { card_id: (this._config && this._config.card_id) || null, overlay: this._overlay } }));
  }

  _look() {
    const l = this._config.look || {};
    const markers = l.markers || (l.values === false || this._config.show_states === false ? "icon" : "icon_text");
    return { size: 34, chips: "dark", names: this._config.names || "hover", title: true, ...l, markers };
  }

  _buttons() {
    const b = this._config.buttons || {};
    const dock = (this._config.look || {}).dock;
    return {
      position: b.position || (dock === "hidden" ? "hidden" : "bottom"),
      style: b.style || (dock === "icons" ? "icons" : "labels"),
    };
  }

  _rooms() {
    return { show_in: ["plan"], style: "label", size: "m", hidden: [], names: {}, ...(this._config.rooms || {}) };
  }

  _lights() {
    return { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, scenes: [], ...(this._config.lights || {}) };
  }

  _dev(id) {
    return (this._config.devices && this._config.devices[id]) || {};
  }

  _sensor() {
    const id = this._config && (this._floor || this._planIds()[0]);
    return planSensors(this._hass).find((s) => s.attributes.plan_id === id) || null;
  }

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
      out.push({ id: `bond:${bid}`, bond: true, light: (mem.find((d) => d.light) || {}).light, name: b.name || (b.names || []).join(" + "), icon: b.icon, tap: b.tap, show: b.show, x: b.x, y: b.y, px: b.px, py: b.py, main_entity: (b.entities || [])[0], entities: b.entities || [], allEntities: all, members: b.members || [], names: b.names || [], conns, ieee: zb ? zb.ieee : null, area: (mem[0] || {}).area, domain: b.domain, group: groups.includes("lights") || b.domain === "light" ? "lights" : groups[0] || "lights" });
    }
    // Phantoms (#60): an extra item with a combined value; its devices keep their own markers.
    for (const [pid, ph] of Object.entries(a.phantoms || {})) {
      if (!(ph.members || []).length) continue;
      const mem = ph.members.map((m) => [m, memberOf(m)]).filter((x) => x[1]);
      const byMember = {};
      for (const [m, d] of mem) byMember[m] = d.entities || [d.main_entity];
      out.push({ id: `ph:${pid}`, phantom: true, name: ph.name || "Phantom", icon: ph.icon, x: ph.x, y: ph.y, px: ph.px, py: ph.py, members: ph.members, names: mem.map(([, d]) => d.name), mains: mem.map(([, d]) => d.main_entity).filter(Boolean), entities: ph.entities || [], byMember, value: ph.value || "average", one: ph.one, group: "phantoms" });
    }
    return out;
  }

  _allowed(item) {
    if (item.bond) return [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    return [...new Set([item.main_entity, ...(item.entities || [])].filter(Boolean))];
  }

  _hidden(item, overlay) {
    const o = this._dev(item.id);
    return Array.isArray(o.hide_in) && o.hide_in.includes(overlay);
  }

  _added(item, overlay) {
    const o = this._dev(item.id);
    if (this._ignoreAdded) return false;
    const c = this._custom().find((x) => x.id === overlay);
    return (Array.isArray(o.add_to) && o.add_to.includes(overlay)) || !!(c && Array.isArray(c.devices) && c.devices.includes(item.id));
  }

  _mainKind(item) {
    if (item.bond) {
      const k = item.main_entity ? kindOf(item.main_entity, this._hass.states[item.main_entity]) : null;
      return k || (item.domain === "cover" ? "cover" : item.domain === "switch" ? "switch" : "light");
    }
    return kindOf(item.main_entity, this._hass.states[item.main_entity]);
  }

  /** Context the Network overlay needs: which placed devices are hubs, ZHA data. */
  _ctx(a) {
    const placed = new Set(Object.keys(a.devices || {}));
    const hubs = new Set();
    for (const d of Object.values(a.devices || {})) if (d.via && placed.has(d.via) && !(d.conns || []).includes("zigbee")) hubs.add(d.via);
    return { hubs, zha: (this._zha && this._zha.byIeee) || {} };
  }

  /** Marker specs for the current overlay. */
  _markers(a) {
    const ov = this._overlay;
    const out = [];
    if (ov === "plan" || !this._ovDef(ov)) return out;
    this._cx = this._ctx(a);
    this._skippedUnknown = 0;
    for (const item of this._items(a)) {
      if (this._hidden(item, ov)) continue;
      out.push(...this._specsFor(item, ov, false));
    }
    return out;
  }

  /** Does this item show up in this overlay at all (ignoring its current state)? Used by the editor (#52). */
  _qualifies(item, ov, a) {
    if (ov === "plan") return false;
    if (!this._cx && a) this._cx = this._ctx(a);
    try {
      return this._specsFor(item, ov, true).length > 0;
    } catch (_e) {
      return false;
    }
  }

  /** Card settings of one device in one overlay (#100/#101): { lead, extras, icon, tap }. */
  _per(item, ov) {
    const o = this._dev(item.id);
    return (o.per && typeof o.per === "object" && o.per[ov]) || {};
  }

  /** The ONE entity a device shows in an overlay (#100): per overlay → device → Editor main → best fitting. */
  _leadFor(item, ov, fits) {
    const o = this._dev(item.id);
    const exists = (e) => !!e && !!this._hass.states[e];
    const ok = (e) => exists(e) && fits(e);
    // What you chose in Edit markers always leads, also a plain sensor (print status, programme…).
    const legacy = o.show_in && typeof o.show_in === "object" ? o.show_in[ov] : null;
    for (const e of [this._per(item, ov).lead, legacy]) if (exists(e)) return e;
    for (const e of [o.show, item.main_entity]) if (ok(e)) return e;
    return this._allowed(item).find(ok) || null;
  }

  /** Kept for the editor (#90): the device-wide or per-overlay choice. */
  _shownEntity(item, ov) {
    const e = this._per(item, ov).lead || (this._dev(item.id).show_in || {})[ov] || this._dev(item.id).show;
    return e && this._hass.states[e] ? e : null;
  }

  /** Value text of an extra line (#101). */
  _extraText(e) {
    const st = this._hass.states[e];
    if (!st) return "—";
    if (domainOf(e) === "climate") return st.attributes.current_temperature != null ? this._attrVal(st, "current_temperature") : this._fmt(e);
    return ["temperature", "humidity", "battery", "sensor"].includes(kindOf(e, st)) ? this._fmtNum(e) : this._fmt(e);
  }

  /** Attach the "Also show" lines: per-overlay setting, else the defaults given by the overlay. */
  _withExtras(spec, item, ov, defaults = []) {
    if (!spec) return spec;
    const per = this._per(item, ov);
    const list = (Array.isArray(per.extras) ? per.extras : defaults).filter((e) => e && this._hass.states[e] && !(spec.ents || []).includes(e) && e !== spec.eid);
    if (per.icon) spec.icon = per.icon;
    if (per.noicon) {
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
  }

  /** Lights as glow only in this overlay (#112). */
  _glowOnly(ov) {
    if (ov === "live") return (this._ov("live").lights_as || "glow") === "glow";
    const def = this._ovDef(ov);
    return !!(def && def.custom && def.custom.lights_as === "glow");
  }

  /** One entity per kind key (custom overlays, #109). */
  _entityForKind(item, key, allowed) {
    const hass = this._hass;
    const ks = (e) => kindOf(e, hass.states[e]);
    if (key === "temperature") return allowed.find((e) => ks(e) === "temperature" && (ambientTemp(e, hass.states[e], item) || this._dev(item.id).comfort === true)) || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && hass.states[e].attributes.current_temperature != null) || null;
    if (key === "humidity") return allowed.find((e) => ks(e) === "humidity") || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && Number(hass.states[e].attributes.current_humidity) > 0) || null;
    if (key === "battery") return (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && item.roles.battery) || allowed.find((e) => ks(e) === "battery") || null;
    const pick = allowed.filter((e) => LIVE_KEY[ks(e)] === key);
    if (item.main_entity && pick.includes(item.main_entity)) return item.main_entity;
    return pick[0] || null;
  }

  _specsFor(item, ov, q) {
    const hass = this._hass;
    const name = this._dev(item.id).name || item.name;
    if (item.phantom) return this._phantomSpecs(item, name, ov, q);
    // Split device (#91): Network and Health show the device at its hardware spot only.
    if (item.of && (ov === "network" || ov === "health")) return [];
    // #105: a split spot that "acts as" a light / switch / fan.
    if (item.as && item.as !== "other") item = { ...item, actsAs: item.as };
    const allowed = this._allowed(item);
    const cx = this._cx || { hubs: new Set(), zha: {} };
    const kindOfE = (e) => (item.actsAs && e === item.main_entity ? { light: "light", switch: "switch", fan: "fan" }[item.actsAs] : kindOf(e, hass.states[e]));
    const one = (spec, defaults) => (spec ? [this._withExtras(spec, item, ov, defaults)] : []);
    if (ov === "live") {
      const opts = this._ov("live");
      const kinds = opts.show || LIVE_DEFAULT;
      if (item.bond && !this._per(item, ov).lead) {
        const kind = this._mainKind(item);
        const key = LIVE_KEY[kind];
        if (!key || !kinds.includes(key)) return [];
        const bs = this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], kind, opts);
        if (!q && (opts.show_off || "hidden") === "hidden" && !bs.on) return [];
        if (kind === "light" && this._glowOnly(ov)) bs.glow = true;
        return one(bs);
      }
      const lead = this._leadFor(item, ov, (e) => kinds.includes(LIVE_KEY[kindOfE(e)]));
      if (!lead) return [];
      const kind = kindOfE(lead);
      // Live = what is happening now: things that are off are hidden (option: faint).
      const hideOff = !q && (opts.show_off || "hidden") === "hidden";
      if (kind === "climate") {
        const cst = hass.states[lead];
        if (hideOff && (!cst || !live(cst) || cst.state === "off")) return [];
        return one(this._climateChip(item, name, lead, null, null, { compact: true }));
      }
      const spec = this._liveSpec(item, name, lead, hass.states[lead], kind, opts);
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
        return k === "light" || (opts.switches !== false && (k === "switch" || k === "fan") && (item.group === "lights" || item.actsAs === "light"));
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
      const fits = (e) => {
        const k = kindOf(e, hass.states[e]);
        return sec.includes(k) && !(k === "camera" && opts.cameras === false);
      };
      // #100: one marker per device; its other sensors are in the popup.
      const lead = this._leadFor(item, ov, fits);
      if (!lead) return [];
      const st = hass.states[lead];
      const k = kindOf(lead, st);
      const alert = this._isOn(lead, st, k);
      if (!q && !alert && opts.show_quiet === false) return [];
      const others = allowed.filter((e) => e !== lead && fits(e));
      const spec = { ...this._liveSpec(item, name, lead, st, k, { values: false }), key: `${item.id}|${lead}`, ents: [lead], also: others };
      return one(spec);
    }
    if (ov === "health") return this._healthSpecs(item, name, allowed, this._ov("health"), q).map((sp) => this._withExtras(sp, item, ov));
    if (ov === "network") return this._netSpecs(item, name, cx, q);
    const def = this._ovDef(ov);
    if (def && def.custom) return this._customSpecs(item, name, allowed, def.custom, q, ov);
    return [];
  }

  _comfortSpecs(item, name, allowed, opts) {
    const hass = this._hass;
    const temps = [];
    const hums = [];
    for (const eid of allowed) {
      const st = hass.states[eid];
      const k = kindOf(eid, st);
      if (k === "temperature" && (ambientTemp(eid, st, item) || this._dev(item.id).comfort === true)) temps.push(eid);
      if (k === "humidity" && opts.humidity !== false) hums.push(eid);
    }
    const clim = allowed.find((eid) => domainOf(eid) === "climate");
    if (clim && opts.climate !== false && !item.bond) {
      const spec = this._climateChip(item, name, clim, temps[0], hums[0] || allowed.find((e) => kindOf(e, hass.states[e]) === "humidity"));
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
  }

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
  }

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
      const amb = allT.filter((e) => ambientTemp(e, hass.states[e], { standalone: true }));
      // #98: ACs and thermostats count with the temperature / humidity they report themselves.
      const clim = ents.filter((e) => domainOf(e) === "climate" && hass.states[e]);
      const temps = [...(amb.length ? amb : allT), ...clim.filter((e) => hass.states[e].attributes.current_temperature != null)];
      const hums = [...kindsOf(ents, ["humidity"]), ...clim.filter((e) => Number(hass.states[e].attributes.current_humidity) > 0).map((e) => `${e}#h`)];
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
    if (kind === "opening") value = n ? `${n} open` : "All closed";
    else if (kind === "motion") value = n ? "Detected" : "Clear";
    else if (["light", "switch", "fan"].includes(kind)) value = `${n} of ${list.length} on`;
    else value = n ? `${n} active` : "";
    const color = kind === "motion" ? "#43a047" : kind === "opening" ? "#fb8c00" : "var(--dfc-accent)";
    return [{ key: item.id, type: "marker", item, name, ents: list, eid: list[0], st: null, kind, on: n > 0, dim: false, unavail: false, color, value: this._look().markers !== "icon" ? value : "", icon: icon || kindIcon[kind] || "mdi:shape-outline", x: item.x, y: item.y, phantom: true }];
  }

  /** ACs and thermostats, chip v2: [icon] Cooling / Set 24° │ 25.1° / 💧 68%; only what the unit reports. */
  _climateChip(item, name, clim, tempEid, humEid, { compact = false } = {}) {
    const st = this._hass.states[clim];
    if (!st) return null;
    const a = st.attributes || {};
    const on = live(st) && st.state !== "off";
    const act = on && a.hvac_action && CLIMATE_ACTION[a.hvac_action] ? CLIMATE_ACTION[a.hvac_action] : null;
    const mode = live(st) ? st.state : "off";
    const word = !live(st) ? "Offline" : act ? act.word : CLIMATE_MODE_WORD[mode] || (this._hass.formatEntityState ? this._hass.formatEntityState(st) : mode);
    const color = !on ? "#9e9e9e" : act ? act.color : (CLIMATE_MODES[mode] || CLIMATE_MODES.auto).color;
    let set = "";
    if (on) {
      if (a.temperature != null) set = `Set ${this._num1(a.temperature)}°`;
      else if (a.target_temp_low != null && a.target_temp_high != null) set = `Set ${this._num1(a.target_temp_low)}–${this._num1(a.target_temp_high)}°`;
      else if (a.target_humidity != null) set = `Set ${a.target_humidity}%`;
    }
    let temp = "";
    if (a.current_temperature != null) temp = `${this._num1(a.current_temperature)}°`;
    else if (tempEid) temp = this._fmtNum(tempEid).replace(/\s?°C|\s?°F/, "°");
    let hum = "";
    // #88: 0 / missing humidity = the unit has no humidity sensor.
    if (a.current_humidity != null && Number(a.current_humidity) > 0) hum = `${Math.round(Number(a.current_humidity))}%`;
    else if (humEid && Number((this._hass.states[humEid] || {}).state) > 0) hum = this._fmtNum(humEid);
    const icon = this._dev(item.id).icon || climateIcon(clim, st);
    const ents = [clim];
    // Compact (Live, custom overlays, #99): icon + room temperature in the mode colour; "Off" when off.
    if (compact) return { key: `${item.id}|${clim}`, type: "chip", cl2: true, compact: true, item, name, lines: [temp || "—", word], word: on ? "" : word, set: "", temp, hum: "", ents, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
    return { key: `${item.id}|${clim}`, type: "chip", cl2: true, item, name, lines: [temp || "—", word], word, set, temp, hum, ents, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
  }

  _num1(v) {
    const n = Math.round(Number(v) * 10) / 10;
    try {
      return n.toLocaleString(this._hass.locale && this._hass.locale.language ? this._hass.locale.language : undefined, { maximumFractionDigits: 1 });
    } catch (_e) {
      return String(n);
    }
  }

  _healthSpecs(item, name, allowed, opts, q) {
    const hass = this._hass;
    const low = Number(opts.low ?? 20);
    let bat = (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && item.roles.battery) || allowed.find((eid) => kindOf(eid, hass.states[eid]) === "battery");
    if (item.bond) {
      // A bond: the lowest battery of its members.
      const bats = allowed.filter((eid) => kindOf(eid, hass.states[eid]) === "battery" && live(hass.states[eid]) && num(hass.states[eid].state));
      if (bats.length) bat = bats.sort((x, y) => Number(hass.states[x].state) - Number(hass.states[y].state))[0];
    }
    const mainSt = hass.states[item.main_entity];
    const unavailable = item.bond ? (item.entities || []).some((e) => !live(hass.states[e])) : item.main_entity && !live(mainSt);
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
    if (unavailable) return [this._chipSpec({ ...item, x: pos.x, y: pos.y }, name, { lines: ["Offline"], icon: "mdi:alert-circle-outline", ents: [item.main_entity], kind: "other", cls: "warn" })];
    return [];
  }

  /** Network (#49): connection icon, role colour/shape, LQI as the ring; values only in the popup. */
  _netSpecs(item, name, cx, q) {
    const hass = this._hass;
    const opts = this._ov("network");
    const conns = (item.conns || []).filter((c) => CONNS[c] && c !== "radio");
    // No known connection but a signal sensor: still a wireless device.
    if (!conns.length && (item.entities || []).some((e) => kindOf(e, hass.states[e]) === "signal")) conns.push("radio");
    if (!conns.length) return [];
    if (q) return [{ key: item.id }];
    const show = this._netShow();
    const visible = conns.filter((c) => show.includes(c));
    if (!visible.length) return [];
    const conn = CONN_ORDER.find((c) => visible.includes(c));
    const z = conns.includes("zigbee") && item.ieee ? cx.zha[ieeeKey(item.ieee)] : null;
    const mainSt = hass.states[item.main_entity];
    const unavailable = (z && !z.available) || (!z && item.main_entity && !live(mainSt) && !item.bond);
    let role = z && z.role ? z.role : cx.hubs.has(item.id) ? "hub" : conns.includes("zigbee") ? "end" : "device";
    if (unavailable) role = "unavailable";
    if (!z && conns.includes("zigbee") && !unavailable && !cx.hubs.has(item.id)) role = Object.keys(cx.zha || {}).length ? "unknown" : "end";
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
    return [{ key: item.id, type: "net", item, name, conns, conn, role, ring, z, sigEid, unavailable, ents: [item.main_entity].filter(Boolean), icon: CONNS[conn].icon, value: label, ieee: z ? item.ieee : null, x: pos.x, y: pos.y }];
  }

  /** Connections shown in Network: the viewer's choice, else the card's default. */
  _netShow() {
    if (Array.isArray(this._net.conns) && this._net.conns.length) return this._net.conns;
    const opts = this._ov("network");
    return Array.isArray(opts.connections) && opts.connections.length && !opts.connections.includes("all") ? opts.connections : CONN_ORDER;
  }

  _saveNet() {
    lsSet(`dfc_net_${this._lsKey()}`, { conns: this._net.conns, roles: this._net.roles });
  }

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
      return [this._withExtras(this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], k, {}), item, ov)];
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
      spec = this._liveSpec(item, name, lead, st, k, {});
      if (k === "light" && this._glowOnly(ov)) {
        if (!spec.on) return [];
        spec.glow = true;
      }
    }
    if (!spec) return [];
    const extras = rest.map((x) => x[1]).filter((e) => !used.includes(e));
    return [this._withExtras(spec, item, ov, extras)];
  }

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
  }

  _liveSpec(item, name, eid, st, kind, opts) {
    const hass = this._hass;
    const look = this._look();
    let on = false;
    let value = "";
    let color = "var(--dfc-accent)";
    if (item.bond && (!eid || eid === item.main_entity)) {
      const sts = item.entities.map((e) => hass.states[e]).filter(Boolean);
      const n = sts.filter((s) => this._isOn(s.entity_id, s, kind)).length;
      on = n > 0;
      const showMode = this._per(item, this._overlay).show || item.show;
      if (showMode === "count" ? sts.length > 1 : n && n < sts.length) value = `${n}/${sts.length}`;
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
    return { key: item.id, type: "marker", item, name, ents: bondAll ? item.entities : [eid], eid, st, kind, on, dim, unavail, color, value: showVal ? value : "", icon: this._dev(item.id).icon || (bondAll ? item.icon : null), x: item.x, y: item.y };
  }

  _chipSpec(item, name, { lines, ents, kind, icon, cls = "" }) {
    return { key: `${item.id}|${ents.join(",")}`, type: "chip", item, name, lines, ents, kind, icon, cls, x: item.x, y: item.y };
  }

  _fmt(eid) {
    const st = this._hass.states[eid];
    if (!st || !live(st)) return "—";
    try {
      if (this._hass.formatEntityState) return this._hass.formatEntityState(st);
    } catch (_e) {
      /* fall back */
    }
    return `${st.state}${st.attributes.unit_of_measurement ? ` ${st.attributes.unit_of_measurement}` : ""}`;
  }

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
  }

  _attrVal(st, attr) {
    try {
      if (this._hass.formatEntityAttributeValue) return this._hass.formatEntityAttributeValue(st, attr);
    } catch (_e) {
      /* fall back */
    }
    return `${st.attributes[attr]}°`;
  }

  // ------------------------------------------------------------- render
  _update(force = false) {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    // Nothing to do while nobody can see it: catch up when visible again (#72).
    if (document.hidden || !this.isConnected) {
      this._dirty = true;
      return;
    }
    const sensor = this._sensor();
    const parts = [sensor ? sensor.last_updated : "none", this._floor, this._overlay, this._img || "", this._imgFailed ? 1 : 0, JSON.stringify(this._popup || null), this._menu ? 1 : 0, JSON.stringify(this._net || {}), this._zha ? this._zhaAt : 0, this._hass.themes && this._hass.themes.darkMode ? 1 : 0];
    // Only the entities the current overlay reads; a power sensor ticking elsewhere changes nothing.
    for (const eid of this._watch || []) {
      const st = this._hass.states[eid];
      if (!st) {
        parts.push("-");
        continue;
      }
      const a = st.attributes || {};
      parts.push(`${st.state}|${a.brightness ?? ""}|${a.current_temperature ?? ""}|${a.temperature ?? ""}|${a.target_temp_low ?? ""}|${a.target_temp_high ?? ""}|${a.current_humidity ?? ""}|${a.rgb_color ?? ""}|${a.color_temp_kelvin ?? ""}|${a.entity_picture ?? ""}|${a.confidence ?? ""}`);
    }
    this._ns = this._nightState();
    parts.push(`n${this._ns.f}${this._ns.tint || ""}`);
    const nNew = this._hass.states["sensor.device_floorplan_new_devices"];
    parts.push(nNew ? nNew.state : "");
    const key = parts.join(";");
    if (!force && key === this._key) return;
    this._key = key;
    this._dirty = false;
    this._render(sensor);
  }

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
    const def = this._ovDef(ov);
    if (def && def.custom) for (const e of all) if (["temperature", "humidity", "battery", "climate"].includes(kindOf(e, hass.states[e]))) ents.add(e);
    return ents;
  }

  _render(sensor) {
    const c = this._config;
    const look = this._look();
    const btn = this._buttons();
    const dark = this._hass.themes && this._hass.themes.darkMode;
    const chipMode = look.chips === "auto" ? (dark ? "dark" : "light") : look.chips;
    const chipVars = chipMode === "light"
      ? "--dfc-chipbg: color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent); --dfc-chipfg: var(--primary-text-color); --dfc-chipborder: var(--divider-color);"
      : "--dfc-chipbg: rgba(30,30,30,.78); --dfc-chipfg: #fff; --dfc-chipborder: rgba(255,255,255,.25);";
    const roomVars = dark ? "--dfc-roomfg:#fff; --dfc-roomhalo: rgba(0,0,0,.85);" : "--dfc-roomfg:#263238; --dfc-roomhalo: rgba(255,255,255,.95);";
    const style = `<style>${CARD_CSS}</style>`;
    if (!sensor) {
      this.shadowRoot.innerHTML = `${style}<ha-card><div class="msg">Plan “${cesc(this._floor || c.plan)}” not found. Check the plan id, or open the Floorplan Editor in the sidebar.</div></ha-card>`;
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
    const specs = this._markers(a);
    this._specs = new Map(specs.map((s) => [s.key, s]));
    this._a = a;
    const watch = new Set();
    if (ov !== "plan") for (const item of this._items(a)) if (!this._hidden(item, ov)) for (const e of this._reads(item, ov)) watch.add(e);
    for (const s of specs) for (const e of s.ents || []) watch.add(e);
    if (ov === "lights") for (const sc of this._lights().scenes || []) for (const e of sc.lights || []) watch.add(e);
    // Night look: every light's state shapes the pools; people: person + room sensors.
    if (ov === "lights" || ((this._ns || {}).f > 0 && (this._night().overlays || []).includes(ov))) {
      for (const item of this._items(a)) for (const e of item.bond ? item.entities : [item.main_entity]) if (e && domainOf(e) === "light") watch.add(e);
    }
    if (this._peopleShown()) for (const pp of this._people()) for (const e of [pp.entity, pp.room, pp.room2]) if (e) watch.add(e);
    this._watch = [...watch].sort();
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    const nNew = Number((this._hass.states["sensor.device_floorplan_new_devices"] || {}).state) || 0;
    const admin = isAdmin && nNew > 0 && !c.hide_admin_hint ? `<button class="admin" data-new="1" title="Only admins see this">${nNew} new · Place them</button>` : "";
    const names = look.names === "always" ? "names-always" : look.names === "off" ? "names-off" : "";
    const dock = this._overlays();
    const labels = c.overlay_names || {};
    const vertical = btn.position === "left" || btn.position === "right";
    const dockShown = dock.length > 1 && btn.position !== "hidden";
    // Layers live in the floor rail when there is one, else in the button bar, never on the plan
    // (#63, #75); without a bar, in the legend row.
    const layersOn = ov === "network" && this._ov("network").layers !== false;
    const floors = this._floorStack();
    const hasRail = floors.length > 1;
    const layersInBar = layersOn && !hasRail;
    const dockHtml = dockShown
      ? `<div class="dockrow"><nav class="dock ${btn.style === "icons" ? "icons" : ""}" aria-label="Overlays" ${vertical ? 'aria-orientation="vertical"' : ""}>${dock.map((o) => {
        const d = this._ovDef(o);
        const label = labels[o] || d.label;
        return `<button class="${o === ov ? "on" : ""}" data-ov="${cesc(o)}" aria-pressed="${o === ov}" title="${cesc(label)}"><ha-icon icon="${cesc(d.icon)}"></ha-icon><span>${cesc(label)}</span></button>`;
      }).join("")}${layersInBar ? `<span class="sep" aria-hidden="true"></span>${this._layersBtn()}` : ""}${this._penMode() === "pen" ? this._penHtml() : ""}</nav></div>`
      : "";
    const title = look.title !== false && c.title ? `<div class="hdr">${cesc(c.title)}</div>` : "";
    let emptyMsg = "";
    const people = this._peopleHtml(a);
    if (ov === "people" && !this._people().length) emptyMsg = `<div class="empty">Add people in the card settings (People)</div>`;
    else if (ov !== "plan" && ov !== "people" && !specs.length) {
      let t = "Nothing to show in this overlay";
      if (ov === "health" && this._ov("health").only_problems) t = "All good: no low batteries or offline devices";
      if (ov === "network" && this._ov("network").only_weak) t = `No weak or fair signals.${this._skippedUnknown ? ` ${this._skippedUnknown} device${this._skippedUnknown > 1 ? "s have" : " has"} no known signal: Zigbee comes from ZHA, others need their signal sensor enabled in Home Assistant.` : ""}`;
      if (ov === "lights" && this._lights().off === "hidden") t = "All lights are off";
      emptyMsg = `<div class="empty">${cesc(t)}</div>`;
    }
    const pos = btn.position === "hidden" ? "bottom" : btn.position;
    const scale = this._scale || 1;
    const nOn = this._ns.f > 0 && (this._night().overlays || []).includes(ov);
    const boxCls = `${nOn && this._ns.f >= 0.5 ? "nt" : ""} ${nOn && this._ns.f >= 0.5 && this._night().dim_quiet !== false ? "nq" : ""}`;
    this.shadowRoot.innerHTML = `${style}<ha-card class="dock-${pos} ${this._narrow ? "narrow" : ""}" style="--dfc-size:${Math.round((Number(look.size) || 34) * scale)}px;${chipVars}${roomVars}">
      <div class="main">${title}${admin}
        <div class="wrap ${names} ${hasRail ? "hasrail" : ""}"><div class="box ${boxCls}" style="--ratio:${ratio}">
          ${this._img ? `<img class="plan" src="${cesc(this._img)}" alt="${cesc(a.plan_name || "")}" draggable="false">` : ""}
          ${this._nightHtml(a)}${this._airHtml(a)}
          ${this._roomsHtml(a)}
          <svg class="lines"></svg>
          ${specs.map((s) => (s.type === "chip" ? this._chipHtml(s) : this._markerHtml(s))).join("")}${people.plan}${emptyMsg}
        </div>${hasRail ? this._railHtml(floors, layersOn) : ""}</div>${people.row}
        ${ov === "lights" ? this._sceneBarHtml(specs) : ""}${ov === "network" ? this._legendHtml(specs, layersInBar && !dockShown) : ""}
      </div>${dockHtml}${layersOn && this._menu ? this._layersMenu(a) : ""}${this._popupHtml()}${dockShown && this._penMode() === "pen" ? "" : this._penHtml()}</ha-card>`;
    for (const el of this.shadowRoot.querySelectorAll("[data-ent]")) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.ent];
    }
    const img = this.shadowRoot.querySelector("img.plan");
    if (img && a.image_fallback_url && !this._imgFailed) {
      img.addEventListener("error", () => {
        this._imgFailed = true;
        this._update(true);
      }, { once: true });
    }
    const box = this.shadowRoot.querySelector(".box");
    if (this._ro && box) {
      this._ro.disconnect();
      this._ro.observe(box);
    }
    this._layoutSoon();
    if (this._menu) requestAnimationFrame(() => this._placeMenu());
    if (this._pillUntil && this._pillUntil > Date.now()) {
      clearTimeout(this._pillT);
      this._pillT = setTimeout(() => {
        const pl = this.shadowRoot.querySelector(".pill.show");
        if (pl) pl.classList.remove("show");
      }, this._pillUntil - Date.now());
    }
    if (box && !box._swipe) this._bindSwipe(box);
    if (box) this._boxW = box.getBoundingClientRect().width || this._boxW;
    this._announce();
    if (this._popup && this._popup.type === "readings") this._fillHistory();
  }

  /** Put the layers menu next to its button, inside the card (bar below, above, left or right). */
  _placeMenu() {
    const card = this.shadowRoot.querySelector("ha-card");
    const btn = this.shadowRoot.querySelector("[data-menu]");
    const menu = this.shadowRoot.querySelector(".lmenu");
    if (!card || !btn || !menu) return;
    const c = card.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const pos = btn.closest(".rail") ? "rail" : this._buttons().position;
    let x;
    let y;
    if (pos === "rail") {
      x = b.left - m.width - 8;
      y = b.top;
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
  }

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
  }

  /** While Network is open: quietly reload ZHA data every 5 minutes (#66). */
  _netTimer(on) {
    if (on && !this._netT) this._netT = setInterval(() => this._loadZha(true), 300000);
    if (!on && this._netT) {
      clearInterval(this._netT);
      this._netT = null;
    }
  }

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
  }

  /** Floor rail (#75): Layers on top (Network), ▲ floors ▼. */
  _railHtml(floors, layersOn) {
    const i = floors.findIndex((f) => f.id === this._floor);
    const pill = this._pillUntil && this._pillUntil > Date.now();
    return `<div class="rail" role="toolbar" aria-label="Floors">${layersOn ? `${this._layersBtn(true)}<hr>` : ""}
      <button class="arrow" data-step="1" aria-label="Floor up" ${i <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      ${floors.map((f) => `<button class="fl ${f.id === this._floor ? "on" : ""}" data-floor="${cesc(f.id)}" aria-pressed="${f.id === this._floor}" aria-label="${cesc(f.name)}" title="${cesc(f.name)}">${cesc(f.label)}<span class="pill ${f.id === this._floor && pill ? "show" : ""}">${cesc(f.name)}</span></button>`).join("")}
      <button class="arrow" data-step="-1" aria-label="Floor down" ${i >= floors.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>`;
  }

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
      }
    });
  }

  /** Rooms (#53): names at their spots, in the overlays chosen in the editor. */
  _roomsHtml(a) {
    const r = this._rooms();
    if (!Array.isArray(r.show_in) || !r.show_in.includes(this._overlay)) return "";
    const size = { s: 11, m: 13, l: 16 }[r.size] || 13;
    return Object.entries(a.areas || {}).filter(([id]) => !(r.hidden || []).includes(id)).map(([id, room]) => {
      const name = (r.names && r.names[id]) || room.name;
      const icon = r.style === "pill_icon" ? `<ha-icon icon="${cesc(room.icon || "mdi:texture-box")}"></ha-icon>` : "";
      const cls = r.style === "label" ? "label" : "pill";
      return `<div class="room ${cls}" style="left:${room.x}%;top:${room.y}%;font-size:${size}px">${icon}${cesc(name)}</div>`;
    }).join("");
  }

  _markerHtml(s) {
    if (s.type === "net") {
      const r = ROLES[s.role] || ROLES.device;
      const cls = ["m", "net", r.shape, s.role, this._hl === s.key ? "hl" : ""].join(" ");
      return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-fill:${r.color};--dfc-ring:${s.ring || "transparent"}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.conns.map((c) => CONNS[c].label).join(", ")}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon></span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${this._xb(s)}<span class="tip">${cesc(s.name)}</span></button>`;
    }
    const icon = s.icon
      ? `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`
      : s.eid && this._hass.states[s.eid]
        ? `<ha-state-icon data-ent="${cesc(s.eid)}"></ha-state-icon>`
        : `<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
    const cls = ["m", s.kind, s.on ? "on" : "off", s.dim ? "dim" : "", s.unavail ? "unavail" : "", this._hl === s.key ? "hl" : "", s.glow ? "glow" : "", s.extras && s.extras.length ? "hasx" : "", s.noicon ? "noi" : ""].join(" ");
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
    return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}${lc}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(label)}"><span class="ic">${icon}${bond}${s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : ""}</span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${xs}${this._xb(s)}<span class="tip">${cesc(s.name)}${s.item.ofName ? `<br><small>Through ${cesc(s.item.ofName)}${(s.item.conns || []).length ? ` · ${cesc(s.item.conns.map((c) => (CONNS[c] || { label: c }).label).join(" + "))}` : ""}</small>` : ""}</span></button>`;
  }

  _chipHtml(s) {
    const bdg = s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : "";
    const xl0 = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const xl = xl0 + bdg;
    if (s.cl2 && s.compact) {
      return `<button class="chip cl2 cmp ${s.cls} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.temp].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${s.word ? `<span class="mw">${cesc(s.word)}</span>` : ""}<span class="t">${cesc(s.temp || "—")}</span>${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}</span></button>`;
    }
    if (s.cl2) {
      const left = `<span class="mc"><span class="mw">${cesc(s.word)}</span>${s.set ? `<span class="st">${cesc(s.set)}</span>` : ""}</span>`;
      const right = `<span class="tc"><span class="t">${cesc(s.temp || "—")}</span>${s.hum ? `<span class="h"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.hum)}</span>` : ""}</span>`;
      return `<button class="chip cl2 ${s.cls} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.set, s.temp, s.hum].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${left}<span class="vs"></span>${right}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}</span></button>`;
    }
    if (s.rd && !s.icon) {
      // #94: readings in the AC chip style: temperature large, 💧 humidity small under it.
      const t = s.rd.t ? `<span class="t">${cesc(s.rd.t.replace(/\s?°C|\s?°F/, "°"))}</span>` : "";
      const h = s.rd.h ? `<span class="${t ? "h" : "t"}"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.rd.h)}</span>` : "";
      return `<button class="chip rd ${s.cls} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}"><span class="tc">${t}${h}</span>${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}</span></button>`;
    }
    const first = s.icon ? `<span class="ico"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.lines[0] || "")}</span>` : `<span class="l1">${cesc(s.lines[0] || "")}</span>`;
    return `<button class="chip ${s.cls} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}">${first}${s.lines[1] ? `<span class="l2">${cesc(s.lines[1])}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}</span></button>`;
  }

  /** Connections present on this plan (for the layers menu). */
  _connsPresent(a) {
    const set = new Set();
    for (const s of (this._specs || new Map()).values()) for (const cn of s.conns || []) set.add(cn);
    for (const d of Object.values(a.devices || {})) for (const cn of d.conns || []) if (CONNS[cn]) set.add(cn);
    return CONN_ORDER.filter((cn) => set.has(cn));
  }

  _layersBtn(rail = false) {
    return `<button class="layers ${this._menu ? "on" : ""}" data-menu="1" title="Layers" aria-label="Layers" aria-expanded="${this._menu}"><ha-icon icon="mdi:layers-outline"></ha-icon>${rail ? "" : "<span>Layers</span>"}</button>`;
  }

  _layersMenu(a) {
    const present = this._connsPresent(a);
    const n = this._net;
    const shown = this._netShow();
    const custom = Array.isArray(n.conns) && n.conns.length;
    const chk = (on) => `<ha-icon class="eye" icon="${on ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline"}"></ha-icon>`;
    const tick = (on) => `<ha-icon class="eye" icon="${on ? "mdi:eye" : "mdi:eye-off-outline"}"></ha-icon>`;
    const hasZ = present.includes("zigbee");
    const roles = this._rolesPresent();
    return `<div class="lmenu" role="menu" style="visibility:hidden"><h4>Connections</h4>
      <button class="chk ${!custom ? "on" : ""}" data-conn="__default">${chk(!custom)}<ha-icon icon="mdi:star-outline"></ha-icon>Default</button>
      ${present.map((cn) => `<button class="chk ${custom && shown.includes(cn) ? "on" : ""}" data-conn="${cn}">${chk(custom && shown.includes(cn))}<ha-icon icon="${CONNS[cn].icon}"></ha-icon>${cesc(CONNS[cn].label)}</button>`).join("")}
      ${roles.length > 1 ? `<hr><h4>Show</h4>${roles.map((r) => `<button class="chk ${!(n.roles || []).includes(r) ? "on" : ""}" data-role="${r}">${chk(!(n.roles || []).includes(r))}<i style="display:inline-block;width:10px;height:10px;border-radius:${ROLES[r].shape === "round" ? "50%" : "2px"};background:${ROLES[r].color}"></i>${cesc(ROLES[r].label)}</button>`).join("")}` : ""}
      <hr>
      ${hasZ ? `<button class="${n.links ? "on" : ""}" data-tg="links">${tick(n.links)}Zigbee links</button>` : ""}
      <button class="${n.hubs ? "on" : ""}" data-tg="hubs">${tick(n.hubs)}Hub / bridge links</button>
      <button class="${n.legend ? "on" : ""}" data-tg="legend">${tick(n.legend)}Legend</button>
      ${hasZ ? `<div class="sl"><div><span>Minimum LQI</span><b>${n.minLqi}</b></div><input type="range" min="0" max="250" step="5" value="${n.minLqi}" data-minlqi="1" aria-label="Minimum LQI"></div>` : ""}
    </div>`;
  }

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
    return ["coordinator", "router", "hub", "end", "device", "unknown", "unavailable"].filter((r) => set.has(r));
  }

  _legendHtml(specs, withLayers) {
    const items = [];
    if (this._net.legend) {
      const hidden = this._net.roles || [];
      const roles = this._rolesPresent();
      items.push(...roles.map((r) => `<button class="lg ${hidden.includes(r) ? "off" : ""}" data-role="${r}" aria-pressed="${!hidden.includes(r)}" title="Show / hide"><i class="${ROLES[r].shape}" style="background:${ROLES[r].color}"></i>${ROLES[r].label}</button>`));
      if (specs.some((s) => s.z && s.z.lqi != null)) items.push(`<span>LQI ${LQI_BANDS.slice().reverse().map((b) => `<i class="ring" style="border-color:${b.color}"></i>${b.label}`).join(" ")}</span>`);
      if (this._net.hubs && specs.some((s) => s.item.via && this._specs.has(s.item.via))) items.push(`<span><i class="dash"></i>through hub / bridge</span>`);
    }
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    if (isAdmin && (this._zha || (this._a && Object.values(this._a.devices || {}).some((d) => (d.conns || []).includes("zigbee"))))) {
      const t = this._zhaAt ? new Date(this._zhaAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
      items.push(`<span class="upd"><button class="rf ${this._scanning ? "busy" : ""}" data-refresh="1" title="Scan the Zigbee network again"><ha-icon icon="mdi:refresh"></ha-icon>${this._scanning ? "Scanning…" : "Refresh"}</button>Updated ${t}</span>`);
    }
    if (withLayers) items.push(this._layersBtn());
    return items.length ? `<div class="legend">${items.join("")}</div>` : "";
  }

  /** Lights overlay: All off / All on / the user's scenes (#54). */
  _sceneBarHtml(specs) {
    const L = this._lights();
    const scenes = Array.isArray(L.scenes) ? L.scenes : [];
    if (!L.all_off && !L.all_on && !scenes.length) return "";
    const ents = this._lightEnts(specs);
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    const b = [];
    if (L.all_off) b.push(`<button data-scene="all_off" class="${ents.length && !anyOn ? "on" : ""}"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon>All off</button>`);
    if (L.all_on) b.push(`<button data-scene="all_on"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>All on</button>`);
    scenes.forEach((s, i) => {
      b.push(`<button data-scene="${i}" class="${this._sceneActive(s) ? "on" : ""}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || `Scene ${i + 1}`)}</button>`);
    });
    return `<div class="bar" role="toolbar" aria-label="Light scenes">${b.join("")}</div>`;
  }

  _lightEnts(specs) {
    const out = new Set();
    for (const s of specs || [...(this._specs || new Map()).values()]) for (const e of s.ents || []) if (TOGGLE_DOMAINS.has(domainOf(e)) && domainOf(e) !== "cover") out.add(e);
    return [...out];
  }

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
  }

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
  }

  // ------------------------------------------------------------- layout
  _layoutSoon() {
    cancelAnimationFrame(this._lraf);
    this._lraf = requestAnimationFrame(() => this._layout());
  }

  /** Keep close markers readable: spread them in a small grid, then push any remaining overlaps apart; a leader line points to the real spot. */
  _layout() {
    const box = this.shadowRoot && this.shadowRoot.querySelector(".box");
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
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
      for (const g of groups) {
        if (g.length < 2) continue;
        const cw = Math.max(...g.map((r) => r.w));
        const ch = Math.max(...g.map((r) => r.h));
        const cols = Math.ceil(Math.sqrt(g.length));
        const rows = Math.ceil(g.length / cols);
        const gw = cols * (cw + 6) - 6;
        const gh = rows * (ch + 6) - 6;
        const cx = g.reduce((n, r) => n + r.ax, 0) / g.length;
        const cy = g.reduce((n, r) => n + r.ay, 0) / g.length;
        const left = Math.max(2, Math.min(W - gw - 2, cx - gw / 2));
        const top = Math.max(2, Math.min(H - gh - 2, cy - gh / 2));
        g.sort((p, q) => p.ay - q.ay || p.ax - q.ax).forEach((r, i) => {
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
      svg.innerHTML = this._linkLines(W, H) + lines;
    }
  }

  /** Zigbee links (all ZHA neighbours, coloured by LQI) and hub/bridge links (Matter bridges, hubs). */
  _linkLines(W, H) {
    if (this._overlay !== "network" || !this._specs) return "";
    const specs = [...this._specs.values()].filter((s) => s.type === "net");
    let out = "";
    const P = (s) => [(s.x / 100) * W, (s.y / 100) * H];
    if (this._net.links && this._zha && this._zha.links.length) {
      const pos = {};
      for (const s of specs) if (s.ieee) pos[ieeeKey(s.ieee)] = s;
      const seen = new Set();
      for (const l of this._zha.links) {
        if (l.lqi < this._net.minLqi) continue;
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
    return out;
  }

  // ------------------------------------------------------------- actions
  _tapAction(s) {
    if (s.type === "net") return "network";
    const o = this._dev(s.item.id);
    const pt = this._per(s.item, this._overlay).tap;
    if (pt) return pt;
    if (o.tap) return o.tap;
    if (s.item.bond && s.item.tap === "more") return "more-info";
    const taps = { ...TAP_DEFAULT, ...(this._config.tap || {}) };
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    const act = taps[k] || "more-info";
    if (act === "toggle" && !s.ents.some((e) => TOGGLE_DOMAINS.has(domainOf(e)))) return "more-info";
    return act;
  }

  /** Marker editing: ✕ on the selected marker hides it in this overlay (#108). */
  _xb(s) {
    return this._pick && s.item && this._selId === s.item.id ? `<span class="xb" data-xb="1" title="Hide in this overlay">✕</span>` : "";
  }

  _penHtml() {
    const m = this._penMode();
    if (m === "pen") return `<button class="pen" data-pen="1" title="Click markers to hide them, choose what they show, icon, name, tap"><ha-icon icon="mdi:pencil"></ha-icon>Edit markers</button>`;
    if (m === "hint") return `<div class="pen hint"><ha-icon icon="mdi:pencil"></ha-icon>Edit card → Edit markers on the plan</div>`;
    return "";
  }

  _onClick(e) {
    const t = e.target;
    if (t.closest("[data-pen]")) {
      e.stopPropagation();
      return this._openPen();
    }
    if (t.closest("[data-xb]") && this._pick) {
      e.stopPropagation();
      return this._pickHide && this._pickHide(this._selId);
    }
    const pp = this._pick && t.closest("[data-person]");
    if (pp) return this._pick(`person:${pp.dataset.person}`);
    const ov = t.closest("[data-ov]");
    if (ov) return this._setOverlay(ov.dataset.ov);
    if (t.closest("[data-menu]")) {
      this._menu = !this._menu;
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
    if (t.closest("[data-refresh]")) return this._refreshZha();
    const fl = t.closest("[data-floor]");
    if (fl) return this._setFloor(fl.dataset.floor);
    const stp = t.closest("[data-step]");
    if (stp) return this._stepFloor(Number(stp.dataset.step));
    const cv = t.closest("[data-cov]");
    if (cv) return this._coverCmd(cv.dataset.cov, cv.dataset.cmd);
    const hlk = t.closest("[data-hl]");
    if (hlk) return this._highlight(hlk.dataset.hl);
    const tg = t.closest("[data-tg]");
    if (tg) {
      this._net = { ...this._net, [tg.dataset.tg]: !this._net[tg.dataset.tg] };
      return this._update(true);
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
    const pe = t.closest("[data-person]");
    if (pe) return this._moreInfo(pe.dataset.person);
    const k = t.closest("[data-k]");
    if (!k) return;
    if (this._swiped) {
      this._swiped = false;
      return;
    }
    if (this._held) {
      this._held = false;
      return;
    }
    const s = this._specs && this._specs.get(k.dataset.k);
    if (!s) return;
    if (this._pick) return this._pick(s.item.id, s); // marker editing (#87/#95)
    if (s.phantom) return s.type === "chip" ? this._openReadings(s) : this._openList(s);
    const act = this._tapAction(s);
    if (act === "none") return;
    if (act === "network") {
      this._popup = { type: "net", key: s.key };
      return this._update(true);
    }
    if (act === "toggle") return this._toggle(s);
    if (act === "readings") return this._openReadings(s);
    // Covers: the shutter controls (position, open / stop / close), also when a cover leads a bond
    // (shutter + window contact): only the covers are in the popup.
    const covs = s.ents.filter((e) => domainOf(e) === "cover");
    if (covs.length && (domainOf(s.eid || "") === "cover" || s.ents.every((e) => domainOf(e) === "cover")) && act !== "toggle") {
      this._popup = { type: "covers", key: s.key, ents: covs };
      return this._update(true);
    }
    if (s.item.bond || (s.also && s.also.length)) return this._openList({ ...s, ents: [s.eid, ...(s.also || [])].filter(Boolean) });
    this._moreInfo(s.ents[0]);
  }

  _onInput(e) {
    const t = e.target;
    if (t && t.dataset && t.dataset.covpos) {
      clearTimeout(this._covT);
      this._covT = setTimeout(() => this._hass.callService("cover", "set_cover_position", { entity_id: t.dataset.covpos, position: Number(t.value) }), 350);
      return;
    }
    if (t && t.dataset && t.dataset.minlqi) {
      this._net = { ...this._net, minLqi: Number(t.value) };
      const lab = t.parentElement.querySelector("b");
      if (lab) lab.textContent = t.value;
      this._key = null;
      this._layoutSoon();
    }
  }

  /** Hold / right-click: HA's details (a list for bonds). */
  _hold(key) {
    const s = this._specs && this._specs.get(key);
    if (!s) return;
    if (s.item.bond || s.ents.length > 1) return this._openList(s);
    this._moreInfo(s.ents[0]);
  }

  _toggle(s) {
    const ents = s.ents.filter((e) => TOGGLE_DOMAINS.has(domainOf(e)));
    if (!ents.length) return this._moreInfo(s.ents[0]);
    if (ents.every((e) => domainOf(e) === "cover")) {
      const anyOpen = ents.some((e) => ["open", "opening"].includes((this._hass.states[e] || {}).state));
      this._hass.callService("cover", anyOpen ? "close_cover" : "open_cover", { entity_id: ents });
      return;
    }
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    this._hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
  }

  _coverCmd(eid, cmd) {
    const ents = eid === "__all" ? ((this._popup && this._popup.ents) || (this._specs.get(this._popup && this._popup.key) || { ents: [] }).ents).filter((e) => domainOf(e) === "cover") : [eid];
    const svc = { open: "open_cover", close: "close_cover", stop: "stop_cover" }[cmd];
    if (svc && ents.length) this._hass.callService("cover", svc, { entity_id: ents });
  }

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
  }

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
  }

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
        up = specsByIeee[pk] || { name: (this._zha.byIeee[pk] || {}).role === "coordinator" ? "Coordinator" : "Router", item: {}, last: true };
      }
      if (!up || names.includes(up.name)) break;
      names.unshift(up.name);
      if (up.last) break;
      cur = up;
    }
    return names;
  }

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
  }

  _moreInfo(eid) {
    if (!eid) return;
    this._popup = null;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
    this._update(true);
  }

  _openList(s) {
    this._popup = { type: "list", key: s.key };
    this._update(true);
  }

  _openReadings(s) {
    this._popup = { type: "readings", key: s.key, ents: [...s.ents] };
    this._hist = null;
    this._update(true);
  }

  _popupHtml() {
    const p = this._popup;
    if (!p) return "";
    const close = `<button data-close="1" aria-label="Close">×</button>`;
    if (p.type === "confirm") {
      return `<div class="pop"><div class="popin" role="dialog" aria-label="All off"><h3>Turn all lights off?${close}</h3><div>${p.n ? `${p.n} light${p.n > 1 ? "s are" : " is"} on.` : "No light is on right now."}</div><div class="acts"><button data-close="1">Cancel</button><button class="pri" data-confirm="1">All off</button></div></div></div>`;
    }
    const s = this._specs && this._specs.get(p.key);
    if (!s) return "";
    if (p.type === "list") {
      const lents = s.also && s.also.length ? [s.eid, ...s.also] : s.ents;
      return `<div class="pop"><div class="popin"><h3>${cesc(s.name)}${close}</h3><div class="list">${lents.map((e) => {
        const st = this._hass.states[e];
        return `<button data-mi="${cesc(e)}">${cesc((st && st.attributes.friendly_name) || e)}<small>${cesc(this._fmt(e))}</small></button>`;
      }).join("")}</div></div></div>`;
    }
    if (p.type === "covers") {
      const row = (e) => {
        const st = this._hass.states[e];
        if (!st) return "";
        const f = Number(st.attributes.supported_features || 0);
        const pos = st.attributes.current_position;
        const slider = f & 4 && pos != null ? `<input type="range" min="0" max="100" step="5" value="${Number(pos)}" data-covpos="${cesc(e)}" aria-label="Position">` : "";
        return `<div class="cov"><span class="nm">${cesc(st.attributes.friendly_name || e)}<small>${cesc(this._fmt(e))}${pos != null ? ` · ${pos}%` : ""}</small></span>${slider}<button data-cov="${cesc(e)}" data-cmd="open" aria-label="Open"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="stop" aria-label="Stop"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="close" aria-label="Close"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>`;
      };
      const cents = p.ents || s.ents.filter((e) => domainOf(e) === "cover");
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3>${cesc(s.name)}${close}</h3><div>${cents.map(row).join("")}</div>${cents.length > 1 ? `<div class="covall">All<button data-cov="__all" data-cmd="open" aria-label="Open all"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="__all" data-cmd="stop" aria-label="Stop all"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="__all" data-cmd="close" aria-label="Close all"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>` : ""}</div></div>`;
    }
    if (p.type === "net") {
      const rows = [["Connection", s.conns.map((cn) => CONNS[cn].label).join(" + ")], ["Role", (ROLES[s.role] || ROLES.device).label]];
      const chain = this._chain(s);
      if (chain.length > 1) rows.push(["Path", chain.join(" → ")]);
      if (s.z && s.z.lqi != null) rows.push(["LQI", String(s.z.lqi)]);
      if (s.z && s.z.rssi != null) rows.push(["RSSI", `${s.z.rssi} dBm`]);
      if (s.sigEid) rows.push(["Signal", this._fmt(s.sigEid)]);
      if (s.item.parts && s.item.parts.length) rows.push(["Includes", s.item.parts.join(", ")]);
      const parent = s.item.via && this._specs.get(s.item.via);
      if (parent) rows.push(["Through", parent.name]);
      const none = !(s.z && (s.z.lqi != null || s.z.rssi != null)) && !s.sigEid;
      const hint = none ? `<div style="font-size:12px;color:var(--secondary-text-color)">${s.conns.includes("zigbee") ? "No link quality known yet (ZHA data is loaded for admins)." : "No signal value: enable this device's signal sensor in Home Assistant to see it here."}</div>` : "";
      const kids = this._children(s);
      const conn = kids.out.length || kids.extra.length
        ? `<h4>Connected devices (${kids.out.length + kids.extra.length})</h4><div class="conn-list">${kids.out.map((x) => `<button data-hl="${cesc(x.key)}">${cesc(x.name)}<small>${cesc(this._chain(x).join(" → "))}</small></button>`).join("")}${kids.extra.map((n) => `<button disabled>${cesc(n)}<small>not on this floor</small></button>`).join("")}</div>`
        : "";
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.name)}${close}</h3><div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>${hint}${conn}${s.ents[0] ? `<button class="more" data-mi="${cesc(s.ents[0])}">Details ›</button>` : ""}</div></div>`;
    }
    const rows = p.ents.map((e) => {
      const st = this._hass.states[e];
      const k = domainOf(e) === "climate" ? "temperature" : kindOf(e, st);
      const icon = { temperature: "mdi:thermometer", humidity: "mdi:water-percent", battery: "mdi:battery", signal: "mdi:signal" }[k] || "mdi:chart-line";
      const multi = s.phantom || (s.item.bond && p.ents.length > 2);
      const label = multi ? (st && st.attributes.friendly_name) || e : { temperature: "Temperature", humidity: "Humidity", battery: "Battery", signal: "Signal" }[k] || (st && st.attributes.friendly_name) || e;
      const big = domainOf(e) === "climate" && st ? this._attrVal(st, "current_temperature") : this._fmtNum(e);
      return `<div class="rd" data-hist="${cesc(e)}"><div class="top"><ha-icon icon="${icon}"></ha-icon>${cesc(label)}<span class="big">${cesc(big)}</span></div><svg viewBox="0 0 300 56" preserveAspectRatio="none"></svg><div class="mm"><span>24 h ago</span><span class="range"></span><span>now</span></div><button class="more" data-mi="${cesc(e)}">Details ›</button></div>`;
    }).join("");
    const sum = s.phantom || (s.item.bond && s.lines && p.ents.length > 2) ? `<div class="phsum">${s.phantom ? `<ha-icon icon="${cesc(s.icon || "dfp:phantom")}"></ha-icon>` : ""}<b>${cesc((s.lines || []).join(" · "))}</b><small>${cesc({ min: "lowest", max: "highest", one: "one sensor" }[this._dev(s.item.id).value || (s.item.phantom && s.item.value) || this._ov("comfort").combine] || "average")} · ${s.item.names ? s.item.names.length : p.ents.length} devices</small></div>` : "";
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3>${cesc(s.name)}${close}</h3>${sum}${rows}</div></div>`;
  }

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
          const res = await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: clim, minimal_response: false, no_attributes: false, significant_changes_only: false });
          for (const [eid, rows] of Object.entries(res || {})) data[eid] = rows.map((r) => ({ s: r.a ? r.a.current_temperature : null, lu: r.lu || r.lc }));
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
        svg.innerHTML = domainOf(eid) === "climate" ? "" : `<text x="150" y="32" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">Not enough history yet</text>`;
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
  }

  _setOverlay(o) {
    if (!this._ovDef(o)) return;
    this._overlay = o;
    this._popup = null;
    this._menu = false;
    this._update(true);
    if (this._onOv) this._onOv(o);
  }
}

// =================================================================== editor
/** JSON with sorted keys, to compare configs regardless of key order. */
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const ED_CSS = `
.dfe .kord { margin: 8px 0; font-size:13px; }
.dfe .kord h5 { margin: 4px 0 6px; font-size:13px; font-weight:500; }
.dfe .kord .kr { display:flex; align-items:center; justify-content:space-between; padding:3px 6px; border-radius:6px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 6%, transparent); margin-bottom:3px; }
.dfe .kord button { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font-size:12px; }
.dfe .bigbtn { display:flex; align-items:center; gap:8px; width:100%; justify-content:center; border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); border-radius:10px; padding:10px; font: inherit; font-weight:500; cursor:pointer; margin: 4px 0 10px; }
.dfe h4 { margin: 22px 0 4px; font-size: 15px; font-weight: 500; display:flex; align-items:center; gap:8px; }
.dfe p { margin: 0 0 8px; font-size: 12px; color: var(--secondary-text-color); }
.dfe input.flt, .dfe select.flt { box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
.dfe .flts { display:flex; gap:8px; margin-bottom: 6px; }
.dfe .flts input { flex:1; min-width:0; }
.dfe .dev, .dfe .row { border-bottom: 1px solid var(--divider-color); }
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
.dfe .note { font-size: 12px; color: var(--secondary-text-color); }
.dfe .sub { margin: 14px 0 10px; padding-left: 4px; }
.dfe .sub h5 { margin: 0 0 2px; font-size: 14px; font-weight: 500; display:flex; align-items:center; gap:8px; --mdc-icon-size: 18px; }
.dfe [data-form="general"] { margin-bottom: 4px; }
.dfe .floors { margin: 4px 0 14px; }
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

const BIG_CSS = `
dialog.dfe-big { width:100vw; height:100vh; max-width:none; max-height:none; margin:0; padding:0; border:0; box-sizing:border-box; }
dialog.dfe-big:not([open]) { display:none; }
dialog.dfe-big::backdrop { background: rgba(0,0,0,.4); }
.dfe-big { position:fixed; inset:0; z-index:10000; background: var(--primary-background-color, #fafafa); color: var(--primary-text-color); display:flex; flex-direction:column; font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
.dfe-big .bg-h { display:flex; align-items:center; gap:12px; padding:10px 16px; background: var(--card-background-color, #fff); border-bottom:1px solid var(--divider-color, #ddd); }
.dfe-big .bg-h span { flex:1; font-size:13px; color: var(--secondary-text-color); }
.dfe-big .bg-x { border:0; border-radius:18px; padding:8px 18px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-weight:500; cursor:pointer; }
.dfe-big .bg-b { flex:1; min-height:0; display:flex; gap:12px; padding:12px; }
.dfe-big .bg-plan { flex:1; min-width:0; overflow:auto; }
.dfe-big .bg-side { flex:0 0 360px; overflow:auto; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); padding:12px 14px; }
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
.dfe-big .bg-lh { display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:6px; }
.dfe-big .bg-q { flex:1; min-width:0; font: inherit; padding:5px 8px; border-radius:8px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big h6 { margin:10px 0 4px; font-size:12px; font-weight:500; color: var(--secondary-text-color); }
.dfe-big .lr { display:flex; align-items:center; gap:6px; padding:2px 4px; border-radius:6px; }
.dfe-big .lr.sel { background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent); }
.dfe-big .lnm { flex:1; text-align:left; border:0; background:transparent; color: inherit; font: inherit; font-size:13px; padding:4px 0; cursor:pointer; }
.dfe-big .lb { border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background:transparent; border-radius:12px; padding:2px 9px; font: inherit; font-size:12px; cursor:pointer; }
.dfe-big .na { color: var(--secondary-text-color); font-size:11px; }
.dfe-big .ovsec h5 { margin:12px 0 6px; font-size:14px; font-weight:500; }
.dfe-big .ovsec .pr { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; padding:4px 0; }
.dfe-big .ovsec select { max-width:60%; font: inherit; padding:4px; border-radius:6px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big .ovsec .xs { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:13px; margin:6px 0; }
.dfe-big .ovsec .xh { width:100%; color: var(--secondary-text-color); font-size:12px; }
.dfe-big .ovsec .xchip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); font-size:12px; }
.dfe-big .ovsec .xchip button, .dfe-big .ovsec .lnk { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font: inherit; font-size:12px; padding:0 2px; }
.dfe-big .ovsec .none { color: var(--secondary-text-color); }
.dfe-big .ovsec .xb2 { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; padding:0 2px 0 0; font-size:12px; }
.dfe-big .ovsec .xchip.isb { outline:1.5px solid var(--primary-color, #03a9f4); }
.dfe-big .ovsec .xic { border:0; background:transparent; padding:0 2px 0 0; cursor:pointer; color: inherit; --mdc-icon-size:16px; display:inline-flex; }
.dfe-big .ovsec .pr input[type=checkbox] { width:18px; height:18px; }
@media (max-width: 800px) { .dfe-big .bg-b { flex-direction:column; } .dfe-big .bg-side { flex: 0 0 auto; max-height: 45vh; } .dfe-big .bg-h span { display:none; } }
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
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
    else this.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    if (this._big) {
      this._big.card.hass = hass;
      this._big.wrap.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    }
  }

  disconnectedCallback() {
    if (this._big) {
      this._big.wrap.remove();
      this._big = null;
    }
  }

  _emit() {
    this._sent = stableJson(this._config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
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
      <p class="fhint">${ids.length > 1 ? "Several floors: the card shows a floor switch on the right of the plan." : "Add floors with + to switch between them on the card."}</p><div id="fopts"></div>`;
    box.querySelectorAll("[data-ft]").forEach((b) => b.addEventListener("click", () => {
      this._ftab = Number(b.dataset.ft);
      this._renderFloors();
    }));
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
    if (ids.length > 1) {
      const o = box.querySelector("#fopts");
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
    return [...[...OVERLAY_ORDER, "people"].map((o) => ({ value: o, label: OVERLAYS[o].label })), ...this._custom().map((c) => ({ value: c.id, label: c.name || "Custom" }))];
  }

  /** The editor's settings forms, in display order (#70). */
  _schemas() {
    const plans = planSensors(this._hass).map((s) => ({ value: s.attributes.plan_id, label: s.attributes.plan_name || s.attributes.plan_id }));
    const ovOpts = this._ovOptions();
    const conns = [{ value: "all", label: "All connections" }, ...CONN_ORDER.map((c) => ({ value: c, label: CONNS[c].label }))];
    return {
      general: [
        { name: "title", selector: { text: {} } },
        { name: "card_id", selector: { text: {} } },
      ],
      buttons: [
        { name: "overlays", selector: { select: { options: ovOpts, multiple: true, reorder: true, mode: "list" } } },
        { name: "default_overlay", selector: { select: { options: ovOpts, mode: "dropdown" } } },
        { name: "buttons_position", selector: { select: { options: [{ value: "bottom", label: "Below the plan" }, { value: "top", label: "Above the plan" }, { value: "left", label: "Left of the plan" }, { value: "right", label: "Right of the plan" }, { value: "hidden", label: "Hidden (switch from other cards, see Card ID)" }], mode: "dropdown" } } },
        { name: "buttons_style", selector: { select: { options: [{ value: "labels", label: "Icons and labels" }, { value: "icons", label: "Icons only" }], mode: "dropdown" } } },
        { type: "expandable", name: "overlay_names", title: "Overlay names", icon: "mdi:rename", schema: ovOpts.filter((o) => OVERLAYS[o.value]).map((o) => ({ name: o.value, selector: { text: {} } })) },
      ],
      overlaysA: [
        {
          type: "expandable", name: "live", title: "Live: what it shows", icon: OVERLAYS.live.icon,
          schema: [
            { name: "show", selector: { select: { options: Object.entries(LIVE_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } },
            { name: "quiet_small", selector: { boolean: {} } },
            { name: "values", selector: { boolean: {} } },
            { name: "lights_as", selector: { select: { options: [{ value: "glow", label: "Glow only (tap the glow to switch off)" }, { value: "markers", label: "Markers" }], mode: "dropdown" } } },
            { name: "show_off", selector: { select: { options: [{ value: "hidden", label: "Hidden (Live shows only what's on or happening)" }, { value: "faint", label: "Faint" }], mode: "dropdown" } } },
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
        { type: "expandable", name: "comfort", title: "Comfort", icon: OVERLAYS.comfort.icon, schema: [{ name: "humidity", selector: { boolean: {} } }, { name: "humidity_alone", selector: { boolean: {} } }, { name: "climate", selector: { boolean: {} } }, { name: "combine", selector: { select: { options: [{ value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }], mode: "dropdown" } } }] },
        { type: "expandable", name: "security", title: "Security", icon: OVERLAYS.security.icon, schema: [{ name: "show_quiet", selector: { boolean: {} } }, { name: "quiet_small", selector: { boolean: {} } }, { name: "cameras", selector: { boolean: {} } }] },
        {
          type: "expandable", name: "network", title: "Network", icon: OVERLAYS.network.icon,
          schema: [
            { name: "connections", selector: { select: { options: conns, multiple: true, mode: "list" } } },
            { name: "layers", selector: { boolean: {} } },
            { name: "links", selector: { boolean: {} } },
            { name: "min_lqi", selector: { number: { min: 0, max: 250, step: 5, mode: "slider" } } },
            { name: "hub_links", selector: { boolean: {} } },
            { name: "legend", selector: { boolean: {} } },
            { name: "labels", selector: { boolean: {} } },
            { name: "only_weak", selector: { boolean: {} } },
          ],
        },
        { type: "expandable", name: "health", title: "Health", icon: OVERLAYS.health.icon, schema: [{ name: "low", selector: { number: { min: 5, max: 60, step: 5, mode: "slider", unit_of_measurement: "%" } } }, { name: "only_problems", selector: { boolean: {} } }] },
      ],
      look: [
        {
          type: "expandable", name: "look", title: "Look", icon: "mdi:palette-outline",
          schema: [
            { name: "size", selector: { number: { min: 24, max: 56, step: 2, mode: "slider", unit_of_measurement: "px" } } },
            { name: "markers", selector: { select: { options: [{ value: "icon_text", label: "Icon and text (values next to icons)" }, { value: "icon", label: "Icon only" }], mode: "dropdown" } } },
            { name: "chips", selector: { select: { options: [{ value: "dark", label: "Dark glass" }, { value: "light", label: "Light" }, { value: "auto", label: "Follow the theme" }], mode: "dropdown" } } },
            { name: "names", selector: { select: { options: [{ value: "hover", label: "On hover" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }], mode: "dropdown" } } },
            { name: "show_title", selector: { boolean: {} } },
          ],
        },
        { type: "expandable", name: "tap", title: "Tap behaviour (hold always opens the details)", icon: "mdi:gesture-tap", schema: Object.keys(TAP_KINDS).map((name) => ({ name, selector: { select: { options: TAP_OPTIONS, mode: "dropdown" } } })) },
      ],
    };
  }

  _label(s) {
    const L = {
      plan: "Plan", title: "Title (optional)", overlays: "Which buttons, in which order (drag to reorder)", default_overlay: "Overlay when the card opens",
      buttons_position: "Where the buttons are", buttons_style: "Button style",
      lights_as: "Lights show as", show_off: "Things that are off", show: "Show", quiet_small: "Closed doors and idle sensors: small and faint", values: "Values next to icons (thermostat temperature, open lamps)",
      switches: "Include switches and plugs that run lights", brightness: "Show brightness of lights that are on", off: "Lights that are off", all_off: "“All off” button", all_on: "“All on” button",
      humidity: "Show humidity", humidity_alone: "Also devices with humidity only", combine: "Bonds and phantoms with several sensors show", climate: "ACs and thermostats as climate chips (mode, room temperature, target)",
      show_quiet: "Also show closed / idle (not only alerts)", cameras: "Show cameras",
      connections: "Connections shown by default", layers: "Layers button next to the overlay buttons (viewers can switch connections)", links: "Draw Zigbee links (ZHA)", min_lqi: "Hide Zigbee links below this LQI", hub_links: "Draw hub / bridge links (Matter bridges, hubs)", legend: "Legend under the plan", labels: "Connection names next to icons", only_weak: "Only weak and fair signals",
      low: "Battery is low below", only_problems: "Only low batteries and offline devices",
      show_title: "Show the title on the card", size: "Marker size", markers: "Markers on the plan", chips: "Reading chips", names: "Device names", card_id: "Card ID (lets other cards switch this card's overlay)",
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
      overlays: [...OVERLAY_ORDER, ...(Array.isArray(c.people) && c.people.length ? ["people"] : []), ...this._custom().map((x) => x.id)],
      default_overlay: "live",
      ...c,
      buttons_position: b.position || (look.dock === "hidden" ? "hidden" : "bottom"),
      buttons_style: b.style || (look.dock === "icons" ? "icons" : "labels"),
      live: { show: LIVE_DEFAULT, quiet_small: true, values: true, lights_as: "glow", show_off: "hidden", ...(c.live || {}) },
      lights: { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, ...(c.lights || {}) },
      comfort: { humidity: true, humidity_alone: true, climate: true, ...(c.comfort || {}) },
      security: { show_quiet: true, quiet_small: true, cameras: true, ...(c.security || {}) },
      network: { connections: ["all"], layers: true, links: true, min_lqi: 0, hub_links: true, legend: true, labels: false, only_weak: false, ...(c.network || {}) },
      health: { low: 20, only_problems: false, ...(c.health || {}) },
      tap: { ...TAP_DEFAULT, ...(c.tap || {}) },
      look: { size: 34, chips: "dark", names: c.names || "hover", markers: look.markers || (look.values === false || c.show_states === false ? "icon" : "icon_text"), ...look, show_title: look.title !== false },
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
    if (out.look) {
      out.look = { ...out.look };
      if ("show_title" in out.look) {
        if (out.look.show_title === false) out.look.title = false;
        else delete out.look.title;
        delete out.look.show_title;
      }
      delete out.look.dock; // moved to buttons
      delete out.look.values; // replaced by look.markers
    }
    if (Array.isArray(out.people) && !out.people.length) delete out.people;
    if (Array.isArray(out.people_in) && !out.people_in.length) delete out.people_in;
    for (const k of ["live", "lights", "comfort", "security", "network", "health", "tap", "look", "overlay_names", "rooms", "buttons", "night"]) {
      if (!out[k]) continue;
      const v = {};
      const d0 = k === "rooms" ? { show_in: ["plan"], style: "label", size: "m" } : k === "buttons" ? { position: "bottom", style: "labels" } : defaults[k] || {};
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
      this.innerHTML = `<style>${ED_CSS}</style><div class="dfe">
        <div class="floors" id="floors"></div>
        <div data-form="general"></div>
        ${sec("mdi:gesture-tap-button", "Overlay buttons on the card", "Which buttons, their order, where they sit and how they look.", `<div data-form="buttons"></div>`)}
        ${sec("mdi:layers-outline", "Overlays", "What each overlay shows.", `<div data-form="overlaysA"></div>
          <div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes</h5><p>Buttons in the Lights overlay. Stored in this card only, nothing is created in Home Assistant.</p><div id="scenes"></div></div>
          <div data-form="overlaysB"></div>
          <div class="sub"><h5><ha-icon icon="mdi:layers-plus"></ha-icon>Custom overlays</h5><p>Your own overlay buttons, e.g. “Downstairs lights” or “Plants”: pick the kinds of devices it shows, and add single devices in the device list below.</p><div id="custom"></div></div>`)}
        ${sec("mdi:texture-box", "Rooms", "Room names from the Floorplan Editor, shown on the plan.", `<div id="rooms"></div>`)}
        ${sec("mdi:account-group-outline", "People", "Each person at the room pin of the room they are in. Room sensor: any entity whose state is a room (Bermuda, ESPresense, a template sensor…); sensor 2 is used when 1 is unknown or not a room on this plan.", `<div id="people"></div>`)}
        ${sec("mdi:weather-night", "Day & night", "", `<p id="nightnote"></p><div id="night"></div>`)}
        ${sec("mdi:tune-variant", "Look and tap behaviour", "", `<div data-form="look"></div>`)}
        ${sec("mdi:devices", "Markers", "Everything about single markers (what each device shows per overlay, extra readings, icon, tap, hide / add, people) is edited on the plan.", `<button class="bigbtn" id="bigbtn"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon>Edit markers</button>`)}
      </div>`;
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
    const schema = this._schemas()[key] || [];
    const c = { ...this._config };
    for (const k of this._keysOf(schema)) if (k in v) c[k] = v[k];
    if (key === "buttons") {
      c.buttons = { position: v.buttons_position, style: v.buttons_style };
      delete c.buttons_position;
      delete c.buttons_style;
    }
    // Only what depends on the changed form is redrawn; the form you type in is left alone.
    this._set(c, { sections: false });
    this._refreshForms(key);
    if (key === "buttons" || key === "general") {
      this._renderRooms();
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
    const list = Array.isArray(this._config.people) ? this._config.people : [];
    const save = (next, redraw) => {
      const c = { ...this._config, people: next };
      if (Array.isArray(c.overlays) && next.length && !c.overlays.includes("people")) c.overlays = [...c.overlays, "people"];
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
        ],
        { ...pp },
        { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (fallback)" },
        (v) => {
          const next = list.slice();
          next[i] = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
          save(next, false);
        },
      ));
      const del = document.createElement("button");
      del.className = "del";
      del.innerHTML = `<ha-icon icon="mdi:delete-outline"></ha-icon>Remove`;
      del.addEventListener("click", () => save(list.filter((_x, j) => j !== i), true));
      row.appendChild(del);
      box.appendChild(row);
    });
    const add = document.createElement("button");
    add.className = "add";
    add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>Add person`;
    add.addEventListener("click", () => {
      const used = new Set(list.map((x) => x.entity));
      const next = Object.keys(this._hass.states).find((e) => e.startsWith("person.") && !used.has(e));
      save([...list, next ? { entity: next } : {}], true);
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
      ],
      { ...NIGHT_DEFAULT, ...(this._config.night || {}) },
      { mode: "Day & night", start: "Night starts (fixed times, also used without the Sun)", end: "Night ends", overlays: "Use the night look in", strength: "How dark the night gets", style: "Style", dim_quiet: "Dim quiet markers at night (active ones stay bright)", shutters: "Closed shutters darken their room by day (rooms with a shape)" },
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

  // ---- custom overlays (#55)
  _renderCustom() {
    const box = this.querySelector("#custom");
    if (!box) return;
    const list = this._custom();
    box.innerHTML = list.map((o, i) => `<div class="row" data-i="${i}"><button class="hd" data-copen="${i}"><ha-icon icon="${cesc(o.icon || "mdi:layers-outline")}"></ha-icon>${cesc(o.name || "Custom")}<small style="margin-left:auto">${cesc(o.id)}</small></button>${this._copen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-cadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add overlay</button>`;
    box.querySelector("[data-cadd]").addEventListener("click", () => {
      const used = new Set([...list.map((o) => o.id), ...OVERLAY_ORDER]);
      let n = 1;
      while (used.has(`custom${n}`)) n++;
      const next = [...list, { id: `custom${n}`, name: `Custom ${n}`, icon: "mdi:layers-outline", kinds: [] }];
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
    const o = list[i];
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
        const prev = list[i] || {};
        // Keep the user's order for kinds that stay; new ones go to the end (#109).
        if (Array.isArray(v.kinds)) v.kinds = [...(prev.kinds || []).filter((k) => v.kinds.includes(k)), ...v.kinds.filter((k) => !(prev.kinds || []).includes(k))];
        if (v.mode === "kinds") delete v.mode;
        if (v.lights_as === "markers") delete v.lights_as;
        const next = list.map((x, j) => (j === i ? { ...x, ...v, id: x.id } : x));
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
        const next = list.map((x, j) => (j === i ? { ...x, kinds: ks } : x));
        this._set({ ...this._config, custom_overlays: next }, { devices: false });
        this._renderCustom();
      });
      body.appendChild(ord);
    }
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.innerHTML = `<button class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove this overlay</button>`;
    btns.querySelector(".del").addEventListener("click", () => {
      const next = list.filter((_x, j) => j !== i);
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
  }

  // ---- light scenes (#54)
  _renderScenes() {
    const box = this.querySelector("#scenes");
    if (!box) return;
    const L = this._config.lights || {};
    const list = Array.isArray(L.scenes) ? L.scenes : [];
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
    box.innerHTML = list.map((s, i) => `<div class="row" data-i="${i}"><button class="hd" data-sopen="${i}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || `Scene ${i + 1}`)}<small style="margin-left:auto">${s.entity ? cesc(s.entity) : `${(s.lights || []).length} lights${s.states ? " · saved state" : ""}`}</small></button>${this._sopen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-sadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add scene</button>`;
    box.querySelector("[data-sadd]").addEventListener("click", () => {
      this._sopen = list.length;
      setList([...list, { name: list.length ? `Scene ${list.length + 1}` : "Movie night", icon: "mdi:movie-open-outline", lights: [], brightness: 30 }]);
    });
    for (const b of box.querySelectorAll("[data-sopen]")) b.addEventListener("click", () => {
      const i = Number(b.dataset.sopen);
      this._sopen = this._sopen === i ? null : i;
      this._renderScenes();
    });
    const body = this._sopen != null && box.querySelector(`.row[data-i="${this._sopen}"] .body`);
    if (!body) return;
    const i = this._sopen;
    const s = list[i];
    body.appendChild(this._form(
      [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "lights", selector: { entity: { multiple: true, filter: [{ domain: "light" }, { domain: "switch" }] } } },
        { name: "brightness", selector: { number: { min: 0, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "entity", selector: { entity: { filter: [{ domain: "scene" }, { domain: "script" }] } } },
      ],
      { lights: [], brightness: 50, ...s },
      { name: "Button name", icon: "Icon", lights: "Lights in this scene", brightness: "Brightness (0 = off), unless the state is saved below", entity: "…or run a Home Assistant scene / script instead" },
      (v) => {
        const next = list.map((x, j) => (j === i ? { ...v, ...(x.states ? { states: x.states } : {}) } : x));
        if (!next[i].entity) delete next[i].entity;
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
      const cur = (this._config.lights && this._config.lights.scenes) || list;
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
      const cur = (this._config.lights && this._config.lights.scenes) || list;
      setList(cur.map((x, j) => {
        if (j !== i) return x;
        const y = { ...x };
        delete y.states;
        return y;
      }));
    });
    btns.querySelector(".del").addEventListener("click", () => {
      this._sopen = null;
      const cur = (this._config.lights && this._config.lights.scenes) || list;
      setList(cur.filter((_x, j) => j !== i));
    });
    body.appendChild(btns);
    body.appendChild(note);
  }

  // ---- rooms (#53)
  _renderRooms() {
    const box = this.querySelector("#rooms");
    if (!box) return;
    box.innerHTML = "";
    const p = this._plan();
    const areas = p ? p.attributes.areas || {} : {};
    if (!Object.keys(areas).length) {
      box.innerHTML = `<p>No room names on this plan yet. Place them in the Floorplan Editor (step Rooms).</p>`;
      return;
    }
    const r = { show_in: ["plan"], style: "label", size: "m", hidden: [], names: {}, ...(this._config.rooms || {}) };
    const roomOpts = Object.entries(areas).map(([value, a]) => ({ value, label: a.name }));
    const labels = { show_in: "Show room names in these overlays", style: "Style", size: "Size", hidden: "Hide these rooms on the card" };
    for (const [id, a] of Object.entries(areas)) labels[id] = `${a.name}: name on the card`;
    box.appendChild(this._form(
      [
        { name: "show_in", selector: { select: { options: this._ovOptions(), multiple: true, mode: "list" } } },
        { name: "style", selector: { select: { options: [{ value: "label", label: "Text only" }, { value: "pill", label: "Text on a chip" }, { value: "pill_icon", label: "Chip with the room's icon" }], mode: "dropdown" } } },
        { name: "size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
        { name: "hidden", selector: { select: { options: roomOpts, multiple: true, mode: "dropdown" } } },
        { type: "expandable", name: "names", title: "Custom room names", schema: Object.keys(areas).map((id) => ({ name: id, selector: { text: {} } })) },
      ],
      r,
      labels,
      (v) => {
        const names = {};
        for (const [k, n] of Object.entries(v.names || {})) if (n) names[k] = n;
        this._config = this._prune({ ...this._config, rooms: { ...v, names } });
        this._emit();
      },
    ));
  }

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
  }

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
    if (this._big) this._big.card.setConfig(this._config);
  }

  _entName(e) {
    const st = this._hass.states[e];
    return (st && st.attributes.friendly_name) || e;
  }

  /** Save one overlay's settings of a device: devices.<id>.per.<ov> (#100/#101). */
  _savePer(id, ov, patch) {
    const cur = (this._config.devices || {})[id] || {};
    const per = { ...(cur.per || {}) };
    const o = { ...(per[ov] || {}), ...patch };
    for (const k of Object.keys(o)) if (o[k] === "" || o[k] == null || o[k] === false || (Array.isArray(o[k]) && !o[k].length && k !== "extras") || (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k];
    if (Object.keys(o).length) per[ov] = o;
    else delete per[ov];
    this._saveDev(id, { per });
  }

  /** One marker's settings in ONE overlay (#108): lead, Also show, icon, tap, + name and Shows in. */
  _markerPanel(body, item, a, eng, ovs, { saved = () => {}, rerender = () => {}, current = null } = {}) {
    const id = item.id;
    const ov = current;
    const dev = () => (this._config.devices || {})[id] || {};
    const per = () => ((dev().per || {})[ov]) || {};
    const done = () => {
      saved();
      rerender();
    };
    body.innerHTML = "";
    const ovLabel = ov && eng._ovDef(ov) ? eng._ovDef(ov).label : "";
    // Quick hide / show in this overlay (#87).
    if (ov && ov !== "plan" && eng._ovDef(ov)) {
      const hidden = (dev().hide_in || []).includes(ov);
      const q = document.createElement("div");
      q.className = "qhide";
      q.innerHTML = `<button class="qbtn">${hidden ? "Show" : "Hide"} in ${cesc(ovLabel)}</button>`;
      q.querySelector("button").addEventListener("click", () => {
        const set = new Set(dev().hide_in || []);
        if (set.has(ov)) set.delete(ov);
        else set.add(ov);
        this._saveDev(id, { hide_in: [...set] });
        done();
      });
      body.appendChild(q);
    }
    // Name: the same device everywhere.
    body.appendChild(this._form([{ name: "name", selector: { text: {} } }], { name: dev().name || "" }, { name: "Name on the card (all overlays)" }, (v) => {
      this._saveDev(id, { name: v.name });
      saved();
    }));
    const cands = item.phantom ? [] : [...new Set([...(item.entities || []), ...(item.allEntities || []), item.main_entity].filter((e) => e && this._hass.states[e]))];
    if (ov && ov !== "network" && ov !== "plan") {
      const sec = document.createElement("div");
      sec.className = "ovsec";
      const p0 = per();
      let auto = [];
      try {
        const sp = eng._specsFor(item, ov, false)[0];
        auto = sp && sp.extras ? sp.extras.map((x) => x.eid) : [];
      } catch (_e) {
        auto = [];
      }
      const extras = Array.isArray(p0.extras) ? p0.extras : null;
      const shownX = extras || auto;
      const opt = (e, sel) => `<option value="${cesc(e)}" ${sel === e ? "selected" : ""}>${cesc(this._entName(e))}</option>`;
      const leadSel = cands.length > 1 ? `<label class="pr"><span>Leads in ${cesc(ovLabel)}</span><select data-k="lead"><option value="">Automatic</option>${cands.map((e) => opt(e, p0.lead)).join("")}</select></label>` : "";
      const xics = p0.extra_icons || {};
      const xRows = shownX.map((e) => `<span class="xchip ${p0.badge === e ? "isb" : ""}"><button class="xb2" data-xbdg="${cesc(e)}" title="${p0.badge === e ? "Shown as a badge · click: back to a line" : "Show as a badge on the marker"}">${p0.badge === e ? "●" : "○"}</button><button class="xic" data-xic="${cesc(e)}" title="Icon for this line">${xics[e] ? `<ha-icon icon="${cesc(xics[e])}"></ha-icon>` : `<ha-state-icon data-xent="${cesc(e)}"></ha-state-icon>`}</button>${cesc(this._entName(e))}${extras ? `<button data-xdel="${cesc(e)}" title="Remove">✕</button>` : ""}</span>`).join("");
      const left = cands.filter((e) => !shownX.includes(e) && e !== p0.lead);
      sec.innerHTML = `<h5>In ${cesc(ovLabel)}</h5>${leadSel}
        <label class="pr"><span>Show an icon</span><input type="checkbox" data-k="noicon" ${p0.noicon ? "" : "checked"}></label>
        <div class="xs"><span class="xh">Also show${extras ? "" : auto.length ? " <small>(automatic)</small>" : ""} <small>· ○ = show as a badge</small></span>${xRows || `<small class="none">nothing</small>`}
        ${left.length ? `<select data-k="xadd"><option value="">+ Add a reading…</option>${left.map((e) => opt(e, null)).join("")}</select>` : ""}
        ${extras ? `<button class="lnk" data-xauto="1">Back to automatic</button>` : ""}</div>`;
      for (const el of sec.querySelectorAll("[data-xent]")) {
        el.hass = this._hass;
        el.stateObj = this._hass.states[el.dataset.xent];
      }
      const ni = sec.querySelector('[data-k="noicon"]');
      ni.addEventListener("change", () => {
        this._savePer(id, ov, { noicon: !ni.checked });
        done();
      });
      for (const b of sec.querySelectorAll("[data-xbdg]")) b.addEventListener("click", () => {
        const eid = b.dataset.xbdg;
        this._savePer(id, ov, { badge: per().badge === eid ? "" : eid, extras: shownX });
        done();
      });
      for (const b of sec.querySelectorAll("[data-xic]")) b.addEventListener("click", () => {
        const eid = b.dataset.xic;
        const old = sec.querySelector(".xicf");
        if (old) old.remove();
        const box = document.createElement("div");
        box.className = "xicf";
        box.appendChild(this._form([{ name: "icon", selector: { icon: {} } }], { icon: (per().extra_icons || {})[eid] || "" }, { icon: `Icon for “${this._entName(eid)}” (empty = its own)` }, (v) => {
          const ics = { ...(per().extra_icons || {}) };
          if (v.icon) ics[eid] = v.icon;
          else delete ics[eid];
          this._savePer(id, ov, { extra_icons: ics, extras: shownX });
          saved();
        }));
        sec.querySelector(".xs").after(box);
      });
      const leadEl = sec.querySelector('[data-k="lead"]');
      if (leadEl) leadEl.addEventListener("change", () => {
        this._savePer(id, ov, { lead: leadEl.value });
        done();
      });
      const addEl = sec.querySelector('[data-k="xadd"]');
      if (addEl) addEl.addEventListener("change", () => {
        if (!addEl.value) return;
        this._savePer(id, ov, { extras: [...shownX, addEl.value] });
        done();
      });
      for (const b of sec.querySelectorAll("[data-xdel]")) b.addEventListener("click", () => {
        this._savePer(id, ov, { extras: shownX.filter((e) => e !== b.dataset.xdel) });
        done();
      });
      const ba = sec.querySelector("[data-xauto]");
      if (ba) ba.addEventListener("click", () => {
        this._savePer(id, ov, { extras: null });
        done();
      });
      body.appendChild(sec);
      // Bonds: "on if any is on" or "2 of 3" (was in the Floorplan Editor).
      if (item.bond) {
        const bs = document.createElement("label");
        bs.className = "pr";
        bs.innerHTML = `<span>The bond shows</span><select><option value="">On if any is on</option><option value="count" ${(p0.show || item.show) === "count" ? "selected" : ""}>How many are on (2 of 3)</option></select>`;
        const selb = bs.querySelector("select");
        selb.addEventListener("change", () => {
          this._savePer(id, ov, { show: selb.value });
          done();
        });
        sec.appendChild(bs);
      }
      // Icon and tap in this overlay.
      body.appendChild(this._form([
        { name: "icon", selector: { icon: {} } },
        { name: "tap", selector: { select: { options: [{ value: "default", label: "Default for its kind" }, ...TAP_OPTIONS], mode: "dropdown" } } },
      ], { icon: p0.icon || dev().icon || "", tap: p0.tap || dev().tap || "default" }, { icon: `Icon in ${ovLabel} (empty = Home Assistant's own)`, tap: `Tap in ${ovLabel}` }, (v) => {
        this._savePer(id, ov, { icon: v.icon, tap: v.tap === "default" ? "" : v.tap });
        saved();
      }));
    } else if (ov === "plan") {
      const p = document.createElement("p");
      p.className = "bg-hint";
      p.textContent = "Pick an overlay with the buttons under the plan: settings apply to the overlay you are looking at.";
      body.appendChild(p);
    }
    // Bonds and phantoms with several sensors: how the combined value shows.
    const sensEnts = [...new Set([...(item.entities || []), ...(item.allEntities || [])])].filter((e) => ["temperature", "humidity"].includes(kindOf(e, this._hass.states[e])));
    if ((item.bond || item.phantom) && sensEnts.length > 1) {
      const schema = [{ name: "value", selector: { select: { options: [{ value: "default", label: "Default (Comfort setting, or the Editor's choice for phantoms)" }, { value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }, { value: "one", label: "One sensor" }], mode: "dropdown" } } }];
      if (dev().value === "one") schema.push({ name: "one", selector: { select: { options: sensEnts.map((e) => ({ value: e, label: this._entName(e) })), mode: "dropdown" } } });
      body.appendChild(this._form(schema, { value: dev().value || "default", one: dev().one }, { value: "Value on the plan", one: "Which sensor" }, (v) => {
        const prevOne = dev().value === "one";
        this._saveDev(id, { value: v.value === "default" ? "" : v.value, one: v.value === "one" ? v.one : "" });
        if ((v.value === "one") !== prevOne) rerender();
        else saved();
      }));
    }
    const hasTemp = (item.entities || []).some((e) => kindOf(e, this._hass.states[e]) === "temperature");
    if (hasTemp && !item.bond && !item.phantom) {
      body.appendChild(this._form([{ name: "comfort", selector: { boolean: {} } }], { comfort: !!dev().comfort }, { comfort: "Use its temperature in Comfort (even if it's a device's internal sensor)" }, (v) => {
        this._saveDev(id, { comfort: v.comfort });
        saved();
      }));
    }
    // "Shows in": only overlays this device can appear in.
    const shows = document.createElement("div");
    shows.className = "shows";
    const rows = [];
    for (const o of ovs) {
      const def = eng._ovDef(o);
      eng._ignoreAdded = true;
      const q = eng._qualifies(item, o, a);
      eng._ignoreAdded = false;
      const offlineOnly = o === "health" && q && eng._specsFor(item, o, true).every((x) => x.offlineOnly);
      if (q) rows.push({ o, def, mode: "hide", on: !eng._hidden(item, o), note: offlineOnly ? "only when offline" : "" });
      else if (def.custom) rows.push({ o, def, mode: "add", on: eng._added(item, o) });
    }
    shows.innerHTML = `<h5>Shows in</h5>${rows.length ? rows.map((r) => `<div class="sw"><span><ha-icon icon="${cesc(r.def.icon)}"></ha-icon>${cesc(r.def.label)}${r.mode === "add" ? " <small>(added by you)</small>" : r.note ? ` <small>(${cesc(r.note)})</small>` : ""}</span><ha-switch data-sw="${cesc(r.o)}" data-mode="${r.mode}"></ha-switch></div>`).join("") : `<p>This device doesn't appear in any overlay on this card.</p>`}`;
    rows.forEach((r) => {
      const sw = shows.querySelector(`ha-switch[data-sw="${CSS.escape(r.o)}"]`);
      sw.checked = r.on;
      sw.addEventListener("change", () => {
        const cur = dev();
        const key = r.mode === "hide" ? "hide_in" : "add_to";
        const set = new Set(cur[key] || []);
        if ((r.mode === "hide") === sw.checked) set.delete(r.o);
        else set.add(r.o);
        this._saveDev(id, { [key]: [...set] });
        done();
      });
    });
    body.appendChild(shows);
  }

  /** People in Edit markers (#107): the same fields as card editor → People. */
  _personPanel(body, entity, rerender) {
    const list = Array.isArray(this._config.people) ? this._config.people : [];
    const idx = list.findIndex((x) => x.entity === entity);
    if (idx < 0) {
      body.innerHTML = `<p class="bg-hint">This person isn't in this card's People list.</p>`;
      return;
    }
    const save = (next, extra = {}) => {
      this._config = this._prune({ ...this._config, people: next, ...extra });
      this._emit();
      this._engine(true);
      if (this._big) this._big.card.setConfig(this._config);
    };
    body.innerHTML = "";
    body.appendChild(this._form([
      { name: "entity", selector: { entity: { domain: "person" } } },
      { name: "room", selector: { entity: {} } },
      { name: "room2", selector: { entity: {} } },
    ], { ...list[idx] }, { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (when 1 is unknown or not a room here)" }, (v) => {
      const next = list.map((x, j) => (j === idx ? { ...x, ...v } : x));
      save(next);
    }));
    const eng = this._engine();
    const ovs = eng._overlays().filter((o) => o !== "plan" && o !== "people" && o !== "network" && o !== "health");
    body.appendChild(this._form([{ name: "people_in", selector: { select: { options: ovs.map((o) => ({ value: o, label: eng._ovDef(o).label })), multiple: true, mode: "list" } } }], { people_in: this._config.people_in || [] }, { people_in: "Also show people in these overlays (all people)" }, (v) => save(list, { people_in: v.people_in })));
    const del = document.createElement("button");
    del.className = "qbtn";
    del.textContent = "Remove this person from the card";
    del.addEventListener("click", () => {
      save(list.filter((_x, j) => j !== idx));
      rerender(null);
    });
    body.appendChild(del);
  }

  /** The Marker Editor (#108): the card full-screen; click a marker, settings for THIS overlay. */
  _openBig({ direct = false, onClose = null } = {}) {
    if (this._big) return;
    const wrap = document.createElement("dialog");
    wrap.className = "dfe-big";
    wrap.innerHTML = `<style>${BIG_CSS}</style><div class="bg-h"><b>Edit markers</b><span>Pick an overlay under the plan, then click a marker. ${direct ? "Changes are saved to the dashboard right away." : "Changes go into this card's settings (press Save in the card editor when you're done)."}</span><button class="bg-x" aria-label="Close">Done</button></div><div class="bg-b"><div class="bg-plan"></div><aside class="bg-side"></aside></div>`;
    // Inside HA's card editor dialog everything outside it is inert: keep the big plan inside the
    // editor (still drawn on top, from the top layer). From the ✎ pen the editor isn't on the page.
    (this.isConnected ? this : document.body).appendChild(wrap);
    try {
      wrap.showModal();
    } catch (_e) {
      wrap.setAttribute("open", "");
    }
    for (const ev of ["keydown", "keyup", "keypress"]) wrap.addEventListener(ev, (e) => e.stopPropagation());
    const card = document.createElement("device-floorplan-card");
    card.setConfig(this._config);
    card.hass = this._hass;
    wrap.querySelector(".bg-plan").appendChild(card);
    const side = wrap.querySelector(".bg-side");
    this._big = { wrap, card };
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
      side.innerHTML = `<div class="bg-sel"></div><div class="bg-list"><div class="bg-lh"><b>${cesc(def ? def.label : "Plan")}</b> · devices <input class="bg-q" placeholder="Search…" value="${cesc(q)}"></div><div class="bg-groups"></div></div>`;
      const selBox = side.querySelector(".bg-sel");
      if (id && String(id).startsWith("person:")) {
        selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
        selBox.querySelector(".bg-t span").textContent = (this._hass.states[id.slice(7)] || { attributes: {} }).attributes.friendly_name || id.slice(7);
        this._personPanel(selBox.querySelector(".bg-p"), id.slice(7), (x) => render(x));
      } else if (id) {
        const item = items.find((x) => x.id === id);
        if (item) {
          selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
          selBox.querySelector(".bg-t span").textContent = ((this._config.devices || {})[id] || {}).name || item.name;
          this._markerPanel(selBox.querySelector(".bg-p"), item, a, eng, ovs, { current: ov, rerender: () => render(id), saved: () => list() });
        }
      } else {
        selBox.innerHTML = `<p class="bg-hint">${ov === "plan" ? "Pick an overlay under the plan to edit its markers." : `Click a marker on the plan to change it in <b>${cesc(def ? def.label : "")}</b>: what it shows, extra readings, icon, tap. ✕ on a selected marker hides it here.`}</p>`;
      }
      const c = selBox.querySelector(".bg-c");
      if (c) c.addEventListener("click", () => render(null));
      const list = () => {
        const box = side.querySelector(".bg-groups");
        if (!box) return;
        const e2 = this._engine();
        const ql = q.trim().toLowerCase();
        const name = (it) => ((this._config.devices || {})[it.id] || {}).name || it.name;
        const rows = { hidden: [], on: [], off: [] };
        for (const it of items) {
          if (ql && !`${name(it)} ${it.id}`.toLowerCase().includes(ql)) continue;
          if (ov === "plan") continue;
          const qual = e2._qualifies(it, ov, a);
          if (qual && e2._hidden(it, ov)) rows.hidden.push(it);
          else if (qual) rows.on.push(it);
          else rows.off.push(it);
        }
        const row = (it, btn) => `<div class="lr ${sel === it.id ? "sel" : ""}" data-id="${cesc(it.id)}"><button class="lnm" data-pick="${cesc(it.id)}">${cesc(name(it))}${it.bond ? " <small>(bonded)</small>" : it.phantom ? " <small>(phantom)</small>" : ""}</button>${btn}</div>`;
        const custom = def && def.custom;
        box.innerHTML = (rows.hidden.length ? `<h6>Hidden here (${rows.hidden.length})</h6>${rows.hidden.map((it) => row(it, `<button class="lb" data-show="${cesc(it.id)}">↩ Show</button>`)).join("")}` : "")
          + (rows.on.length ? `<h6>On this overlay (${rows.on.length})</h6>${rows.on.map((it) => row(it, "")).join("")}` : "")
          + (rows.off.length ? (custom || ql
            ? `<h6>Not in this overlay (${rows.off.length})</h6>${rows.off.map((it) => row(it, custom ? `<button class="lb" data-add="${cesc(it.id)}">+ Add</button>` : `<small class="na">not for ${cesc(def ? def.label : "")}</small>`)).join("")}`
            : `<details><summary><h6 style="display:inline">Not for ${cesc(def ? def.label : "")} (${rows.off.length})</h6></summary>${rows.off.map((it) => row(it, "")).join("")}</details>`) : "")
          + `<p class="bg-hint" style="margin-top:10px">Devices that aren't on the plan yet: place them in the Floorplan Editor first.</p>`;
        for (const b of box.querySelectorAll("[data-pick]")) b.addEventListener("click", () => render(b.dataset.pick));
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
    card._pick = (id) => render(id);
    card._onOv = () => render(sel);
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
  }
}

if (!customElements.get("device-floorplan-card")) customElements.define("device-floorplan-card", DeviceFloorplanCard);
if (!customElements.get("device-floorplan-card-editor")) customElements.define("device-floorplan-card-editor", DeviceFloorplanCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "device-floorplan-card")) {
  window.customCards.push({
    type: "device-floorplan-card",
    name: "Device Floorplan",
    description: "Your floorplan with live overlays: Live, Lights, Comfort, Security, Network, Health and your own.",
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
    return { overlay: "lights", label: "Lights", icon: "mdi:lightbulb-group-outline" };
  }

  setConfig(c) {
    this._config = { ...(c || {}) };
    this._key = null;
    this._render();
  }

  set hass(h) {
    this._hass = h;
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
    this._render(true);
  }

  disconnectedCallback() {
    window.removeEventListener("device-floorplan-overlay", this._onOv);
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
    return s && s.attributes.phantoms ? s.attributes.phantoms[pid] || null : null;
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
    return on === 0 ? "Off" : on === ents.length ? "On" : `${on} of ${ents.length} on`;
  }

  _value() {
    const c = this._config || {};
    const h = this._hass;
    if (!h) return "";
    if (c.entity && h.states[c.entity]) return h.formatEntityState ? h.formatEntityState(h.states[c.entity]) : h.states[c.entity].state;
    const b = this._bond();
    if (b) return this._bondValue(b);
    const ph = this._phantom();
    return ph ? phantomSummary(h, ph) : "";
  }

  _render(force = false) {
    if (!this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", () => this._tap());
    }
    const c = this._config;
    const ph = this._phantom();
    const bd = this._bond();
    const label = c.label ?? (bd ? bd.name || (bd.names || []).join(" + ") : ph ? ph.name : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].label : "");
    const icon = c.icon || (bd ? bd.icon || (bd.domain === "light" ? "mdi:lightbulb-group" : "mdi:link-variant") : ph ? ph.icon || "dfp:phantom" : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].icon : "mdi:floor-plan");
    const val = this._value();
    const on = this._active();
    const key = [label, icon, val, on].join("|");
    if (!force && key === this._key) return;
    this._key = key;
    this.shadowRoot.innerHTML = `<style>
      :host { display:block; }
      ha-card { height:100%; border-radius: var(--ha-card-border-radius, 12px); transition: box-shadow .25s, background .25s; }
      button { width:100%; height:100%; min-height:44px; border:0; background:transparent; color: var(--primary-text-color); font: inherit; display:flex; align-items:center; gap:8px; padding: 8px 12px; cursor:pointer; text-align:left; border-radius: inherit; }
      ha-icon { --mdc-icon-size: 22px; color: var(--secondary-text-color); flex:none; }
      .t { display:flex; flex-direction:column; min-width:0; line-height:1.2; }
      .l { font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .v { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      ha-card.on { background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background-color, #fff)); box-shadow: 0 0 0 2px var(--primary-color), 0 0 14px 2px color-mix(in srgb, var(--primary-color) 45%, transparent); }
      ha-card.on ha-icon { color: var(--primary-color); }
    </style><ha-card class="${on ? "on" : ""}"><button aria-pressed="${on}" aria-label="${cesc([label, val].filter(Boolean).join(": "))}"><ha-icon icon="${cesc(icon)}"></ha-icon><span class="t"><span class="l">${cesc(label)}</span>${val ? `<span class="v">${cesc(val)}</span>` : ""}</span></button></ha-card>`;
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
    if (c.overlay) window.dispatchEvent(new CustomEvent("device-floorplan-action", { detail: { card_id: c.card_id || null, overlay: c.overlay } }));
  }
}

class DeviceFloorplanChipEditor extends HTMLElement {
  setConfig(c) {
    this._config = { ...(c || {}) };
    this._render();
  }

  set hass(h) {
    this._hass = h;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const phOpts = [{ value: "", label: "None" }];
    const bdOpts = [{ value: "", label: "None" }];
    for (const s of planSensors(this._hass)) for (const [pid, ph] of Object.entries(s.attributes.phantoms || {})) phOpts.push({ value: `${s.attributes.plan_id}:${pid}`, label: `${ph.name} (${s.attributes.plan_name || s.attributes.plan_id})` });
    for (const s of planSensors(this._hass)) for (const [bid, b] of Object.entries(s.attributes.bonds || {})) bdOpts.push({ value: `${s.attributes.plan_id}:${bid}`, label: `${b.name || (b.names || []).join(" + ")} (${s.attributes.plan_name || s.attributes.plan_id})` });
    const schema = [
      { name: "overlay", selector: { select: { options: [...OVERLAY_ORDER, "people"].map((o) => ({ value: o, label: OVERLAYS[o].label })), mode: "dropdown", custom_value: true } } },
      { name: "card_id", selector: { text: {} } },
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "entity", selector: { entity: {} } },
      { name: "phantom", selector: { select: { options: phOpts, mode: "dropdown" } } },
      { name: "bond", selector: { select: { options: bdOpts, mode: "dropdown" } } },
      { name: "tap", selector: { select: { options: [{ value: "overlay", label: "Switch the floorplan to this overlay" }, { value: "more-info", label: "Open the value's details" }, { value: "bond", label: "Switch the bond (all together)" }, { value: "none", label: "Nothing" }], mode: "dropdown" } } },
    ];
    const labels = { overlay: "Overlay it opens (and glows for)", card_id: "Card ID of the floorplan card (empty = any on this screen)", label: "Label", icon: "Icon", entity: "Value from an entity (optional)", phantom: "…or from a phantom (optional)", bond: "…or from a bond (optional)", tap: "Tap" };
    if (!this._f) {
      this._f = document.createElement("ha-form");
      this._f.computeLabel = (s) => labels[s.name] || s.name;
      this._f.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const v = { ...e.detail.value };
        for (const k of Object.keys(v)) if (v[k] === "" || v[k] == null) delete v[k];
        if (v.tap === "overlay") delete v.tap;
        this._config = { type: "custom:device-floorplan-chip", ...v };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._f);
    }
    this._f.hass = this._hass;
    this._f.schema = schema;
    this._f.data = { tap: "overlay", ...this._config };
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
