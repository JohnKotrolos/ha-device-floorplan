/*
 * Device Floorplan – dashboard card (v0.10.0).
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

const CARD_VERSION = "0.10.0";
const PANEL_PATH = "/device-floorplan";

const OVERLAYS = {
  plan: { label: "Plan", icon: "mdi:floor-plan" },
  live: { label: "Live", icon: "mdi:home-lightbulb-outline" },
  lights: { label: "Lights", icon: "mdi:lightbulb-group-outline" },
  comfort: { label: "Comfort", icon: "mdi:thermometer" },
  security: { label: "Security", icon: "mdi:shield-home-outline" },
  network: { label: "Network", icon: "mdi:access-point-network" },
  health: { label: "Health", icon: "mdi:battery-heart-variant" },
  cleaning: { label: "Cleaning", icon: "mdi:robot-vacuum" },
  people: { label: "People", icon: "mdi:account-group-outline" },
};
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
  { value: "navigate", label: "Open a dashboard" },
  { value: "popup", label: "Popup with a card (browser_mod)" },
  { value: "none", label: "Nothing" },
];
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
const PREVIEW_SIZES = [
  { id: "wall", label: "Wall panel", w: 1280, h: 800 },
  { id: "tablet", label: "Tablet", w: 1024, h: 768 },
  { id: "desktop", label: "Desktop", w: 1440, h: 900 },
  { id: "phone", label: "Phone", w: 390, h: 844 },
];
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
/** Re-render a shadow root but keep what other cards put in it (card-mod's <card-mod> style). */
function setShadow(el, html) {
  const keep = [...el.shadowRoot.children].filter((n) => n.localName === "card-mod");
  const oldImg = el.shadowRoot.querySelector("img.plan");
  el.shadowRoot.innerHTML = html;
  for (const n of keep) el.shadowRoot.appendChild(n);
  // 0.7.5: the same plan image stays (no reload / blink on every redraw).
  const ni = el.shadowRoot.querySelector("img.plan");
  if (oldImg && ni && oldImg.getAttribute("src") === ni.getAttribute("src")) ni.replaceWith(oldImg);
}
const num = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const domainOf = (eid) => (eid ? eid.split(".")[0] : "");
const ieeeKey = (i) => String(i || "").toLowerCase().replace(/^0x/, "").replace(/:/g, "");

// ---- 0.10: robot vacuums. A map integration (Xiaomi Cloud Map Extractor, Dreame, Roborock Custom Map, AnyVac…)
// gives the robot, dock, path and rooms in its own units; m turns them into % of the plan image.
const RB_ACTIVE = ["cleaning", "returning", "paused", "error"];
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

/** The colour a light shows: the bulb's own colour, else the lamp colour set in the Editor, else warm. */
function bulbRgb(at, lampCol) {
  const has = at && (Array.isArray(at.rgb_color) || at.color_temp_kelvin || at.color_temp);
  if (has) return lightRgb(at);
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
.main { position:relative; flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
.hdr { position:absolute; left:14px; top:12px; z-index:4; font-size:15px; font-weight:500; padding:4px 10px; border-radius:10px; background: color-mix(in srgb, var(--card-background-color, #fff) 75%, transparent); backdrop-filter: blur(6px); }
.wrap { position:relative; flex:1; display:flex; align-items:flex-start; justify-content:center; padding: 8px 8px 0; min-height:120px; }
.fr { position:relative; width: min(100%, calc(var(--dfc-fit-h, calc(100vh - var(--dfc-chrome, 170px))) * var(--fratio))); aspect-ratio: var(--fratio); }
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
.box svg.pulse { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.box svg.pulse .ptap { pointer-events: all; cursor:pointer; }
.pg.breathe { animation: dfcBreathe 3.6s ease-in-out infinite; }
.pg.steady { opacity:.5; }
.pg.fade { animation: dfcPulseOut 2s linear forwards; }
@keyframes dfcBreathe { 0%, 100% { opacity:.45; } 50% { opacity:1; } }
@keyframes dfcPulseOut { from { opacity:.8; } to { opacity:0; } }
@media (prefers-reduced-motion: reduce) { .pg.breathe { animation:none; opacity:.8; } }
.box svg.air .atap { pointer-events: all; cursor:pointer; }
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
.box img.plan { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; display:block; user-select:none; -webkit-user-drag:none; }
svg.rpath { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
svg.rpath polyline { fill:none; stroke: rgb(33,150,243); stroke-width:2.5; stroke-linejoin:round; stroke-linecap:round; opacity:.55; vector-effect: non-scaling-stroke; }
svg.fresh { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
svg.fresh polygon { pointer-events: visiblePainted; cursor:pointer; stroke:none; transition: fill .3s; }
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
.m.eb .xs { top:auto; bottom: calc(100% + 2px); }
.m.eb.hasx .tip { bottom:auto; top: calc(100% + 6px); }
.m.et .tip { bottom:auto; top: calc(100% + 6px); }
.m.et.hasx .xs { top: calc(100% + 30px); }
.m.er .val { left:auto; right: calc(100% + 4px); }
.m.er .xs, .m.er .tip { left:auto; right:0; transform:none; }
.m.el .xs, .m.el .tip { left:0; transform:none; }
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
/* 0.7.5: hover names come from the one shared tooltip (.xtip); .tip stays for "names always". */
.names-always .tip { opacity:1; }
.names-always .tip small { display:none; }
.xb { position:absolute; top:-9px; right:-9px; width:20px; height:20px; border-radius:50%; background:#b3261e; color:#fff; font-size:12px; line-height:20px; text-align:center; cursor:pointer; z-index:8; box-shadow:0 1px 4px rgba(0,0,0,.4); pointer-events:auto; }
.dock .pen { position:static; box-shadow:none; margin-left:6px; }
.pen { position:absolute; top:8px; left:8px; z-index:6; display:flex; align-items:center; gap:6px; border:0; border-radius:16px; padding:6px 12px 6px 9px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-size:13px; font-weight:500; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); --mdc-icon-size:16px; }
.pen.hint { background: color-mix(in srgb, var(--card-background-color, #fff) 90%, transparent); color: var(--primary-text-color); cursor:default; box-shadow:0 1px 4px rgba(0,0,0,.2); font-weight:400; }
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
.ovbar.ce:not(.vert) .dock { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 34px), transparent); }
.ovbar.cs:not(.vert) .dock { -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to left, #000 calc(100% - 34px), transparent); }
.ovbar.cs.ce:not(.vert) .dock { -webkit-mask-image: linear-gradient(to right, transparent, #000 34px, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to right, transparent, #000 34px, #000 calc(100% - 34px), transparent); }
.ovbar.vert.ce .dock { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent); }
.ovbar.vert.cs .dock { -webkit-mask-image: linear-gradient(to top, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to top, #000 calc(100% - 34px), transparent); }
.ovbar.vert.cs.ce .dock { -webkit-mask-image: linear-gradient(to bottom, transparent, #000 34px, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(to bottom, transparent, #000 34px, #000 calc(100% - 34px), transparent); }
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
.applbl { position:absolute; z-index:4; transform: translate(-50%, -100%); display:flex; flex-direction:column; gap:2px; padding:5px 10px; border-radius:12px; border:1px solid var(--dfc-chipborder); background: var(--dfc-chipbg); color: var(--dfc-chipfg); font: 500 12px/1.3 var(--primary-font-family, sans-serif); white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,.2); cursor:pointer; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.applbl .ar { display:flex; align-items:center; gap:6px; }
.applbl .ar i { width:8px; height:8px; border-radius:50%; flex:none; }
.alist .arow { display:flex; align-items:center; gap:6px; }
.alist .arow > button:first-child { flex:1; display:flex; align-items:center; gap:10px; border:0; background:transparent; color:inherit; font:inherit; text-align:left; padding:8px 4px; cursor:pointer; border-radius:8px; }
.alist .ad { width:10px; height:10px; border-radius:50%; background: rgb(var(--ac)); box-shadow: 0 0 6px rgba(var(--ac), .7); flex:none; }
.alist .nm { flex:1; display:flex; flex-direction:column; } .alist .nm small { color: var(--secondary-text-color); }
.alist .mini { border:1px solid var(--divider-color); background:transparent; color:inherit; border-radius:8px; padding:4px 8px; cursor:pointer; font:inherit; font-size:12px; }
canvas.heat { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; }
.heatleg { display:flex; align-items:center; gap:16px; padding: 8px 12px 2px; font-size:12px; color: var(--secondary-text-color); }
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
.lmenu button ha-icon.eye { color: var(--secondary-text-color); }
.lmenu button.on ha-icon.eye { color: var(--dfc-accent); }
.lmenu .sl { padding: 6px 10px 2px; display:flex; flex-direction:column; gap:4px; font-size:13px; }
.lmenu .sl div { display:flex; justify-content:space-between; }
.lmenu input[type=range] { width:100%; accent-color: var(--dfc-accent); }
.lmenu hr { border:0; border-top:1px solid var(--divider-color); margin: 6px 4px; }
.admin { position:absolute; right:12px; top:12px; z-index:4; border:0; border-radius:14px; padding: 5px 10px; font: inherit; font-size:12px; cursor:pointer; background: var(--dfc-accent); color: var(--text-primary-color, #fff); box-shadow: 0 2px 6px rgba(0,0,0,.25); }
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
.dock-left .lslot .lgroup, .dock-right .lslot .lgroup { flex-direction:column; }
.fwrap { position:relative; width:36px; height:36px; flex:none; display:block; }
.fwrap .rail { position:absolute; left:0; top:0; z-index:7; }
.fwrap.up .rail { top:auto; bottom:0; }
.rail { flex: none; width:36px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; gap:4px; padding: 3px 0; border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); box-shadow:0 2px 10px rgba(0,0,0,.2); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); position:relative; }
.rail button { width:30px; height:30px; border-radius:50%; border:1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; --mdc-icon-size: 18px; padding:0; position:relative; }
.rail button.arrow { border:0; background:transparent; width:28px; height:18px; color: var(--secondary-text-color); }
.rail button.arrow:disabled { opacity:.3; cursor:default; }
.rail button.fl.on { background: var(--dfc-accent); border-color: var(--dfc-accent); color: #fff; }
.rail .pill { position:absolute; right: calc(100% + 8px); top:50%; transform: translateY(-50%); white-space:nowrap; font-size:12px; font-weight:500; padding: 4px 10px; border-radius: 12px; background: rgba(28,28,28,.88); color:#fff; pointer-events:none; opacity:0; transition: opacity .2s; }
.lcorner.top-left .rail .pill, .lcorner.bottom-left .rail .pill { right:auto; left: calc(100% + 8px); }
.rail button.fl:hover .pill { opacity:1; }
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
    if (!config || !(config.plan || (Array.isArray(config.plans) && config.plans.length))) throw new Error("Choose a plan (plan: <plan id>)");
    this._raw = config; // as stored in the dashboard (to find and save this card, #97)
    const c = { ...config };
    // Older configs (0.4.x card, card v0.0x): keep them working.
    if (!c.default_overlay && c.default_view) c.default_overlay = "live";
    // 0.7.4: the Plan overlay is gone; room names are a layer in every overlay. Old configs go to Live.
    if (c.default_overlay === "plan") c.default_overlay = "live";
    // 0.8.2: the People overlay is gone; people show in Live (and the overlays chosen under People).
    if (c.default_overlay === "people") c.default_overlay = "live";
    if (Array.isArray(c.overlays)) c.overlays = c.overlays.filter((o) => o !== "people");
    this._config = c;
    const dock = this._overlays();
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
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh]");
        if (!t) return;
        e.preventDefault();
        if (this._held || this._xOn) return; // a touch long press already did it
        this._holdEl(t);
      });
      // 0.7.5: tap = info card, hold = the marker's action. On touch screens hold, then slide = explore:
      // the name and state of whatever is under the finger, like a mouse hover; lifting does nothing.
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
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh]");
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
      for (const ev of ["pointerup", "pointercancel"]) root.addEventListener(ev, (e) => {
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
    // 0.10: Cleaning joins the default list once a robot is set up on this plan (or when chosen in the card editor).
    const robots = Object.keys((this._a && this._a.robots) || {}).length ? ["cleaning"] : [];
    const list = Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...robots, ...this._custom().map((c) => c.id)];
    return list.filter((o) => o !== "plan" && this._ovDef(o));
  }

  /** 0.7.4: a layer of an overlay, as the viewer left it (else the card's default). */
  _layerOn(ov, name, dflt) {
    const v = (this._lay[ov] || {})[name];
    return typeof v === "boolean" ? v : dflt;
  }

  /** Default of a layer other than room names: as set in the card editor (Comfort: heatmap, readings, air flow). */
  _layerDefault(ov, name) {
    if (ov === "comfort") return this._ov("comfort")[{ heat: "heatmap", labels: "readings", air: "airflow", clim: "climate_shown" }[name] || name] !== false;
    return true;
  }

  _setLayer(ov, name, on) {
    this._lay = { ...this._lay, [ov]: { ...(this._lay[ov] || {}), [name]: on } };
    lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
  }

  /** Room names: shown by default in the overlays chosen in the editor (Live, when not set: where Plan was). */
  _roomsDefault(ov) {
    const si = (this._config.rooms || {}).show_in;
    // 0.10: Cleaning shows room names by default: they carry when each room was cleaned.
    if (ov === "cleaning") return true;
    if (!Array.isArray(si)) return ov === "live";
    return si.includes(ov) || (ov === "live" && si.includes("plan"));
  }

  /** Where the Layers button is: a corner of the plan (default top right), the overlay bar, or hidden. */
  _layersPos() {
    const v = this._config.layers_button;
    if (["top-right", "top-left", "bottom-left", "bottom-right", "bar", "hidden"].includes(v)) return v;
    return this._ov("network").layers === false ? "hidden" : "top-right";
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
      if (["none", "screen", "drum", "line"].includes(shape.type)) continue;
      const bs = on.map((s) => (s.attributes.brightness != null ? Number(s.attributes.brightness) / 255 : 1));
      const b = Math.max(0.2, Math.min(1, bs.reduce((x, y) => x + y, 0) / bs.length)) * (0.6 + (0.4 * on.length) / lights.length);
      // #111: the light stays inside its room's shape.
      const devs = a.devices || {};
      const aid = item.area_id || (item.of && devs[item.of] && devs[item.of].area_id) || (item.members && (devs[item.members[0]] || {}).area_id) || null;
      const areas = a.areas || {};
      const polyArea = (P) => Math.abs(P.reduce((t, p, i) => t + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
      const under = Object.keys(areas).filter((k) => areas[k].shape && inPoly(item.x, item.y, areas[k].shape)).sort((x, y) => polyArea(areas[x].shape) - polyArea(areas[y].shape))[0] || null;
      // 0.7.4: a split spot (a relay's light placed where it acts) glows in the room it sits in,
      // not in its device's area (an NSPanel in the corridor switching the WC light).
      let start = item.of && !item.area_id && under ? under : aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = under;
      if (!this._groups || this._groups.a !== a) this._groups = { a, by: {} };
      if (start && !(start in this._groups.by)) this._groups.by[start] = shapeGroup(areas, start);
      out.push({ rgb: bulbRgb(on[0].attributes || {}, item.light && item.light.color), b, ell: shapeEllipses(item.x, item.y, shape, ratio), shapes: start ? this._groups.by[start] : null });
    }
    return out;
  }

  /** 0.7.4: an appliance with a drum or line drawn in the Editor: its type and readings (null = not one). */
  _applOf(item) {
    if (!item || item.phantom || !item.light || !["drum", "line"].includes(item.light.type)) return null;
    const hass = this._hass;
    const devs = (this._a && this._a.devices) || {};
    const ents = [...new Set([...(item.bond ? item.entities || [] : [...(item.allEntities || item.entities || []), item.main_entity]), ...(item.allEntities || [])])].filter((e) => e && hass.states[e]);
    const as = APPL_TYPES.includes(item.as) ? item.as : ((item.members || []).map((m) => (devs[m] || {}).as).find((v) => APPL_TYPES.includes(v)));
    const type = as || applGuess(`${item.name} ${ents.join(" ")}`) || (item.light.type === "line" ? "dishwasher" : "washer");
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
    return { item, type, status, remaining, running, power, door, plug, progress, ents };
  }

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
    phase = phase || "idle";
    const key = ap.item.id;
    // Finished: a cycle that was running and stopped keeps a check until the door opens or you tap "Unloaded".
    this._applDone = this._applDone || lsGet(`dfc_appl_${this._lsKey()}`) || {};
    this._applPrev = this._applPrev || {};
    const active = ["water", "spin", "heat", "run", "attention"].includes(phase);
    const prev = this._applPrev[key];
    // 0.8.1: when it finished (older saves: true = now), so "Done" clears by itself after 30 min (setting).
    if (phase === "done" || (prev && prev !== "idle" && prev !== "done" && prev !== "unavailable" && phase === "idle")) {
      if (typeof this._applDone[key] !== "number") this._applDone[key] = phase === "done" && S(ap.status) ? Math.min(Date.now(), new Date(S(ap.status).last_changed).getTime() || Date.now()) : Date.now();
    }
    if (active) delete this._applDone[key];
    if (ap.door && S(ap.door) && S(ap.door).state === "on" && !active) delete this._applDone[key];
    // 0.7.5: when the phase last changed (the status pill shows for a few minutes after that).
    this._applChg = this._applChg || {};
    if (prev === undefined) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      this._applChg[key] = since ? new Date(since.last_changed).getTime() : 0;
    } else if (prev !== phase) this._applChg[key] = Date.now();
    this._applPrev[key] = phase;
    lsSet(`dfc_appl_${this._lsKey()}`, this._applDone);
    const doneFor = this._per(ap.item, "live").done_for || "30";
    let doneLeft = 0;
    if (this._applDone[key] && doneFor !== "unloaded") {
      doneLeft = Number(this._applDone[key]) + Number(doneFor) * 60000 - Date.now();
      if (doneLeft <= 0 && (phase === "done" || phase === "idle")) {
        phase = "idle"; // cleared by time; the record stays until the next cycle so it doesn't come back
        doneLeft = 0;
      }
    }
    if (phase === "idle" && this._applDone[key] && (doneFor === "unloaded" || doneLeft > 0)) phase = "done";
    // Time: a finish timestamp becomes a countdown, minutes stay minutes; else time since it started.
    let time = "";
    const rem = S(ap.remaining);
    if (active && rem && live(rem)) {
      const v = rem.state;
      let min = null;
      if ((rem.attributes || {}).device_class === "timestamp" || /^\d{4}-\d{2}-\d{2}T/.test(v)) min = Math.round((new Date(v).getTime() - Date.now()) / 60000);
      else if (/^\d+:\d{2}(:\d{2})?$/.test(v)) {
        const [h, m] = v.split(":").map(Number);
        min = h * 60 + m;
      } else if (num(v)) min = Math.round(Number(v) * ((rem.attributes || {}).unit_of_measurement === "h" ? 60 : (rem.attributes || {}).unit_of_measurement === "s" ? 1 / 60 : 1));
      if (min != null && min >= 0) time = `${min} min remaining`;
    }
    const pr = S(ap.progress);
    if (active && !time && pr && live(pr) && num(pr.state)) time = `${Math.round(Number(pr.state))}% done`;
    if (active && !time) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      if (since) time = `${Math.max(0, Math.round((Date.now() - new Date(since.last_changed).getTime()) / 60000))} min elapsed`;
    }
    const pretty = (t) => String(t).replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const word = phase === "unavailable" ? "Status unavailable" : phase === "done" ? "Finished" : phase === "attention" ? (ap.door && S(ap.door) && S(ap.door).state === "on" ? "Door open" : "Paused") : phase === "error" ? "Error" : phase === "idle" ? "Idle"
      : ap.status && !deadStatus && applPhase(S(ap.status).state) !== "run" ? pretty(S(ap.status).state) : ap.status && !deadStatus ? pretty(S(ap.status).state) : ap.type === "dryer" ? "Drying" : "Running";
    const w = ap.power && live(S(ap.power)) ? `${Math.round(Number(S(ap.power).state))} W` : "";
    const col = APPL_COL[phase] || (phase === "run" ? (ap.type === "dryer" ? APPL_COL.heat : APPL_COL.water) : null);
    return { phase, col, word, time, w, active, chg: this._applChg[key] || 0, doneLeft: phase === "done" ? doneLeft : 0 };
  }

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
      const left = o.st.chg + PILL_MS - Date.now();
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
      const rows = grp.map((o) => `<span class="ar"><i style="background:rgb(${o.st.col || "150,150,150"})"></i>${o.st.phase === "done" ? "Done · tap to unload" : `${cesc(this._applWord(o))}${o.st.time ? ` · ${cesc(o.st.time.replace(" remaining", "").replace(" elapsed", ""))}` : ""}`}</span>`).join("");
      html += `<button class="applbl ${att ? "att" : ""}" style="left:${x}%;top:${y}%" data-appl="${cesc(grp.map((o) => o.id).join(","))}" aria-label="${cesc(grp.map((o) => this._applTip(o)).join(", "))}">${rows}</button>`;
    }
    return html;
  }

  /** 0.8.1: "name · state · time" for the hover label, like the info card's headline. */
  _applTip(o) {
    const t = o.st.time ? o.st.time.replace(" remaining", "").replace(" elapsed", "") : "";
    return [this._dev(o.ap.item.id).name || o.ap.item.name, o.st.phase === "done" ? "Finished" : this._applWord(o), t].filter(Boolean).join(" · ");
  }

  /** The appliance's word on its label: the leading entity chosen in Edit markers, else its status. */
  _applWord(o) {
    const l = this._per(o.ap.item, "live").lead;
    return l && this._hass.states[l] ? this._fmt(l) : o.st.word;
  }

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
  }

  /** #115: air flowing from ACs while they cool / heat (Live, Comfort), kept inside the room shapes. */
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
  }

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
  }

  /** Entities that have a bar drawn: their markers step aside in Live. */
  _barEnts() {
    const a = this._a;
    if (!a || !this._hass) return new Set();
    return new Set(this._openSpots(a).filter((o) => o.geo).map((o) => o.eid));
  }

  /** How far open, 0…1 (null = unknown). */
  _openFrac(o) {
    const st = o.st;
    if (!live(st)) return null;
    if (o.kind === "contact") return st.state === "on" ? 1 : 0;
    const p = st.attributes.current_position;
    if (num(p)) return Math.max(0, Math.min(1, Number(p) / 100));
    return st.state === "closed" ? 0 : 1;
  }

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
  }

  /** 0.7.3: the shaped room a device sits in (its area, else the shape under it). */
  _roomOf(item) {
    const areas = (this._a && this._a.areas) || {};
    if (item.area_id && areas[item.area_id] && Array.isArray(areas[item.area_id].shape) && areas[item.area_id].shape.length >= 3) return item.area_id;
    return Object.keys(areas).find((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3 && inPoly(item.x, item.y, areas[k].shape)) || null;
  }

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
  }

  /** 0.7.3: Room pulse. Motion: the room's edges glow and breathe; presence: a steady faint outline;
   *  cleared: fades out over 2 s. Only along real walls: where a room overlaps another (open plan),
   *  nothing is drawn, so no line runs through the open space. */
  _pulseHtml(a) {
    if (this._overlay !== "live") return "";
    const opts = (this._config.live || {});
    if ((opts.motion_as || "pulse") === "icons") return "";
    const areas = a.areas || {};
    const now = Date.now();
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
  }

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
  }

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
  }

  // ------------------------------------------------------------- people (#67)
  _people() {
    return Array.isArray(this._config.people) ? this._config.people.filter((p) => p && p.entity) : [];
  }

  _peopleShown() {
    if (!this._people().length) return false;
    const ov = this._overlay;
    return ov === "live" || (Array.isArray(this._config.people_in) && this._config.people_in.includes(ov));
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
      const name = p.name || entName(this._hass, p.entity);
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
    const plan = placed.map((x) => `<button class="m person ${edgeCls(x.x, x.y)} ${x.low ? "low" : ""}" style="left:${x.x}%;top:${x.y}%" data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${x.roomName}${x.low ? " (not sure)" : ""}`)}"><span class="ic">${av(x)}</span><span class="tip">${cesc(x.name)} · ${cesc(x.roomName)}</span></button>`).join("");
    const row = this._overlay === "live" && home.length ? `<div class="prow"><span>Home</span>${home.map((x) => `<button data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: home, room unknown`)}"><span class="av">${av(x)}</span>${cesc(x.name)}</button>`).join("")}</div>` : "";
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
    // 0.8.2: the Side Rail: full height at the card's left / right edge, plain icon buttons, dark by default.
    const rail = b.position === "rail_left" || b.position === "rail_right";
    return {
      position: rail ? b.position.slice(5) : b.position || (dock === "hidden" ? "hidden" : "bottom"),
      rail,
      style: b.style || (dock === "icons" ? "icons" : "labels"),
      space: rail ? "reserve" : b.space || "reserve",
      // 0.8.2: the bar (background) and the buttons are separate; old "sidebar" / "plain" shapes map onto them.
      shape: rail ? "rail" : BAR_SHAPES.includes(b.shape) ? b.shape : "pill",
      // 0.9.1: "contrast" = the opposite of the theme (dark on a light theme, light on a dark one); the rail's default.
      bar: rail ? (["theme", "dark"].includes(b.bar) ? b.bar : "contrast") : b.space === "float_icons" || b.shape === "plain" ? "clear" : b.shape === "sidebar" ? b.bar || "dark" : ["dark", "clear", "contrast"].includes(b.bar) ? b.bar : "theme",
      auto: b.auto_status === true,
      size: ["s", "l"].includes(b.size) ? b.size : "m",
      actions: b.actions || {},
      shortcuts: (Array.isArray(b.shortcuts) ? b.shortcuts : []).filter((x) => x && (x.name || x.icon)),
    };
  }

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
    let lights = 0;
    let sec = false;
    let health = false;
    let net = false;
    const seen = new Set();
    for (const it of items) {
      const mainSt = h.states[it.main_entity];
      if (it.main_entity && !it.bond && mainSt && !live(mainSt)) {
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
          if (lightItems.has(it.id)) lights++;
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
    return {
      cleaning: clean,
      lights: lights ? { badge: lights, color: "#F2B84B" } : null,
      security: sec ? { dot: "var(--error-color, #db4437)" } : null,
      health: health ? { dot: "#ffa000" } : null,
      network: net ? { dot: "var(--error-color, #db4437)" } : null,
    };
  }

  /** Status of a bar button: "auto" (built-ins), "off", or your own (entity + how it shows). */
  _btnStatus(st, auto) {
    if (st && st.mode === "off") return null;
    if (st && st.mode === "custom") return barStatus(this._hass, st);
    return this._buttons().auto ? auto || null : null;
  }

  /** One bar button (an overlay or a shortcut), with its status on the icon (colour, dot or badge). */
  _barBtn({ attrs, cls, icon, label, st }) {
    const s = st || {};
    const col = s.color && s.badge == null ? ` style="color:${cesc(s.color)}"` : "";
    const mark = s.badge != null ? `<i class="bbadge"${s.color ? ` style="background:${cesc(s.color)}"` : ""}>${cesc(s.badge)}</i>` : s.dot ? `<i class="bdot" style="background:${cesc(s.dot)}"></i>` : "";
    return `<button class="${cls}" ${attrs} title="${cesc(label)}"><span class="bi"><ha-icon icon="${cesc(icon)}"${col}></ha-icon>${mark}</span><span class="bl">${cesc(label)}</span></button>`;
  }

  /** Tap / hold of a shortcut or an overlay's hold: Home Assistant actions, plus reload and back. */
  _barRun(act, ent) {
    if (!act || act.action === "none") return;
    if (this._pick) return this._toast("Shortcuts aren't run while editing");
    if (act.action === "reload") return location.reload();
    if (act.action === "back") return history.back();
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: ent, tap_action: act }, action: "tap" }, bubbles: true, composed: true }));
  }

  _barHold(t) {
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
  }

  _barTap(i) {
    const sc = this._buttons().shortcuts[i];
    if (!sc) return;
    const ent = (Array.isArray((sc.status || {}).entity) ? sc.status.entity[0] : (sc.status || {}).entity) || undefined;
    if (sc.tap_action) this._barRun(sc.tap_action, ent);
    else if (ent) this._moreInfo(ent);
    this._update(true);
  }

  _rooms() {
    return { style: "label", size: "m", hidden: [], names: {}, ...(this._config.rooms || {}) };
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
      const rtr = (mem.find((d) => d.router) || {}).router;
      out.push({ id: `bond:${bid}`, bond: true, router: rtr, light: (mem.find((d) => d.light) || {}).light, name: bondName(b), icon: b.icon, tap: b.tap, show: b.show, x: b.x, y: b.y, px: b.px, py: b.py, main_entity: (b.entities || [])[0], entities: b.entities || [], allEntities: all, members: b.members || [], names: b.names || [], conns, ieee: zb ? zb.ieee : null, area: (mem[0] || {}).area, domain: b.domain, group: groups.includes("lights") || b.domain === "light" ? "lights" : groups[0] || "lights" });
    }
    // Phantoms (#60): an extra item with a combined value; its devices keep their own markers.
    for (const [pid, ph] of Object.entries(a.phantoms || {})) {
      if (!(ph.members || []).length) continue;
      const mem = ph.members.map((m) => [m, memberOf(m)]).filter((x) => x[1]);
      const byMember = {};
      for (const [m, d] of mem) byMember[m] = d.entities || [d.main_entity];
      out.push({ id: `ph:${pid}`, phantom: true, name: ph.name || "Phantom", icon: ph.icon, x: ph.x, y: ph.y, px: ph.px, py: ph.py, members: ph.members, names: mem.map(([, d]) => d.name), mains: mem.map(([, d]) => d.main_entity).filter(Boolean), units: phUnits(mem.map(([, d]) => d)), entities: ph.entities || [], byMember, value: ph.value || "average", one: ph.one, group: "phantoms" });
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
      const isSel = this._pick && this._selId === item.id;
      if (this._hidden(item, ov)) {
        // 0.7.5: Edit markers: a selected marker hidden here is drawn faded, so changes can be seen.
        if (isSel) out.push(...this._specsFor(item, ov, true).slice(0, 1).map((x) => ({ ...x, ghost: true })));
        continue;
      }
      let sp = this._specsFor(item, ov, false);
      // Off / idle right now (Live hides it): while selected it shows as it looks when active.
      // (Appliances show their label instead, see _applHtml.)
      if (isSel && !sp.length && !((ov === "live" || ov === "lights") && this._applOf(item))) sp = this._specsFor(item, ov, true).slice(0, 1).map((x) => ({ ...x, on: true, dim: false, cls: "" }));
      out.push(...sp);
    }
    return this._robotSpecs(a, ov, out);
  }

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
      if (!cfg || !Array.isArray(cfg.m) || !st) continue;
      const d = rbRead(this._hass, eid, cfg);
      if (!rbOnMap(cfg.map, d)) continue;
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
      } else if (ov === "cleaning" && (info.err || info.attn)) badge = "!";
      const tone = info.err ? "err" : info.attn ? "warn" : "";
      this._rb.push({ eid, cfg, d, info, active });
      out = out.filter((x) => x.item.id !== item.id);
      const dev = placed ? this._dev(placed.id) : {};
      out.push({ type: "robot", kind: "appliance", key: `robot:${eid}`, item, eid, ents: [eid], name: dev.name || item.name, x: +p.x.toFixed(3), y: +p.y.toFixed(3), on: true, color: `rgb(${col})`, head, state: d.state, icon: (placed && this._per(placed, ov).icon) || dev.icon || st.attributes.icon || "mdi:robot-vacuum", badge, tone: ov === "health" ? "" : tone, tip: this._rbTip(st, d, info, a, cfg) });
    }
    return out;
  }

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
    let err = d.state === "error" ? String((vs && (vs.attributes.error || vs.attributes.status)) || "") || "Error" : "";
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
    }
    if (d.state === "docked" && battery != null && battery < 100 && !charging) charging = true;
    const cons = Object.values(parts);
    return { battery, charging, cons, station, last, err, attn: cons.some((c) => c.low) || station.length > 0 };
  }

  /** Hover line: state, room and battery, or the robot's own error text. */
  _rbTip(st, d, info, a, cfg) {
    const word = { cleaning: "Cleaning", returning: "Returning", paused: "Paused", error: "Error", docked: info.charging ? "Charging" : "Docked", idle: "Idle" }[d.state] || this._fmt(st.entity_id);
    if (info.err) return info.err === "Error" ? word : `${word}: ${info.err}`;
    const room = this._rbRoom(a, cfg, d);
    return [word, room, info.battery != null ? `${Math.round(info.battery)}%` : ""].filter(Boolean).join(" · ");
  }

  /** The room the robot is in: where it is on the plan's room shapes. */
  _rbRoom(a, cfg, d) {
    if (!d.pos || !RB_ACTIVE.includes(d.state)) return "";
    const p = rbApply(cfg.m, d.pos);
    const hit = Object.entries(a.areas || {}).find(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3 && inPoly(p.x, p.y, r.shape));
    return hit ? (this._rooms().names || {})[hit[0]] || hit[1].name : "";
  }

  _ageTxt(t) {
    const ms = Date.now() - new Date(t).getTime();
    if (!t || !(ms >= 0)) return "";
    const m = Math.round(ms / 60000);
    if (m < 60) return m < 2 ? "now" : `${m} min`;
    const hrs = Math.round(m / 60);
    return hrs < 24 ? `${hrs} h` : `${Math.round(hrs / 24)} d`;
  }

  /** 0.10: rooms tinted by how long ago a robot cleaned them (a layer of Cleaning; tap a room to clean it). */
  _freshHtml(a) {
    if (this._overlay !== "cleaning" || !this._layerOn("cleaning", "fresh", true)) return "";
    const over = Number((this._config.cleaning || {}).overdue) || 7;
    const polys = Object.entries(a.areas || {}).filter(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3).map(([id, r]) => {
      const c = (a.cleaned || {})[id];
      const hrs = c && c.t ? (Date.now() - new Date(c.t).getTime()) / 3600000 : null;
      const fill = hrs == null ? "rgba(0,0,0,0)" : hrs < 24 ? "rgba(67,160,71,.30)" : hrs < 72 ? "rgba(67,160,71,.14)" : hrs >= over * 24 ? "rgba(255,160,0,.22)" : "rgba(0,0,0,0)";
      return `<polygon data-croom="${cesc(id)}" points="${r.shape.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:${fill}"></polygon>`;
    }).join("");
    return `<svg class="fresh" viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg>`;
  }

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
          svg += `<polyline points="${pts}"></polyline>`;
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
  }

  _robotMarker(s) {
    const pulse = ["error", "paused"].includes(s.state) && this._overlay !== "health" ? s.state : "";
    const badge = s.badge ? `<span class="rbg ${s.tone}">${cesc(s.badge)}</span>` : "";
    return `<button class="m robot on ${pulse} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name} · ${s.tip}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${s.head != null ? `<i class="rhd" style="transform:rotate(${s.head.toFixed(1)}deg)"></i>` : ""}</span>${badge}<span class="tip">${cesc(s.name)}<span class="tst"> · ${cesc(s.tip)}</span></span></button>`;
  }

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
    const close = `<button data-close="1" aria-label="Close">×</button>`;
    const mine = Object.values(a.cleaned || {}).filter((c) => c.by === eid).map((c) => c.t).sort().pop();
    const lastT = info.last.t || mine;
    const rows = [];
    if (lastT) rows.push(["Last cleaning", `${this._ageTxt(lastT)} ago`]);
    if (info.last.dur) rows.push(["Took", info.last.dur]);
    if (info.last.area) rows.push(["Area", info.last.area]);
    if (info.battery != null) rows.push(["Battery", `${Math.round(info.battery)}%${info.charging ? " · charging" : ""}`]);
    const cons = info.cons.length ? `<h4>Consumables</h4>${info.cons.map((c) => `<button class="rbc ${c.low ? "low" : ""}" data-mi="${cesc(c.e)}"><span>${cesc(c.name)}</span>${c.pct != null ? `<i style="--p:${Math.max(0, Math.min(100, c.pct))}%"></i>` : "<i class='n'></i>"}<b>${cesc(c.txt)}</b></button>`).join("")}` : "";
    const dock = info.station.length ? `<h4>Dock</h4>${info.station.map((x) => `<button class="rbc low" data-mi="${cesc(x.e)}"><span>${cesc(x.name)}</span><i class="n"></i><b>${cesc(x.txt)}</b></button>`).join("")}` : "";
    const cmd = (c, icon, label) => `<button data-rbcmd="${c}" data-rb="${cesc(eid)}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    const btns = d.state === "cleaning" ? cmd("pause", "mdi:pause", "Pause") + cmd("return_to_base", "mdi:home-import-outline", "Dock") : cmd("start", "mdi:play", d.state === "paused" ? "Continue" : "Start") + (d.state === "docked" ? "" : cmd("return_to_base", "mdi:home-import-outline", "Dock"));
    return `<div class="pop"><div class="popin rbpop" role="dialog" aria-label="${cesc(name)}"><h3><ha-icon icon="${cesc(st.attributes.icon || "mdi:robot-vacuum")}" style="color:rgb(${col})"></ha-icon>${cesc(name)}${close}</h3>
      <div class="rbst" style="--c:rgb(${col})">${cesc(this._rbTip(st, d, info, a, cfg))}</div>
      ${rows.length ? `<div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>` : ""}${cons}${dock}
      <div class="rbcmds">${btns}</div><button class="more" data-mi="${cesc(eid)}">Details ›</button></div></div>`;
  }

  /** 0.10: tap a room in Cleaning: when it was cleaned, and "Clean this room" (vacuum.clean_area, HA 2026.3). */
  _roomPop(p) {
    const a = this._a || {};
    const room = (a.areas || {})[p.area];
    if (!room) return "";
    const name = (this._rooms().names || {})[p.area] || room.name;
    const c = (a.cleaned || {})[p.area];
    const by = c && this._hass.states[c.by] ? this._hass.states[c.by].attributes.friendly_name : "";
    const when = c && c.t ? `Cleaned ${this._ageTxt(c.t)} ago${by ? ` by ${by}` : ""}.` : "No cleaning recorded here yet.";
    const robots = Object.entries(a.robots || {}).filter(([e]) => this._hass.states[e]);
    const can = robots.filter(([e]) => Number(this._hass.states[e].attributes.supported_features || 0) & CLEAN_AREA);
    const btns = can.filter(([, r]) => Object.values(r.seg || {}).includes(p.area)).map(([e]) => `<button class="pri" data-cleanroom="${cesc(p.area)}" data-rb="${cesc(e)}"><ha-icon icon="mdi:robot-vacuum"></ha-icon>Clean with ${cesc(this._hass.states[e].attributes.friendly_name || e)}</button>`).join("");
    const hint = btns ? "" : can.length ? `Map this room to one of the robot's rooms in its settings (Map vacuum segments to areas) to clean it from here.` : robots.length ? "Your robot can't clean a single room from Home Assistant (needs its room mapping, Home Assistant 2026.3+)." : "";
    const close = `<button data-close="1" aria-label="Close">×</button>`;
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(name)}"><h3>${cesc(name)}${close}</h3><div>${cesc(when)}</div>${hint ? `<div class="rbhint">${cesc(hint)}</div>` : ""}${btns ? `<div class="acts">${btns}</div>` : ""}</div></div>`;
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

  /** 0.8.2: space around the plan (+) or trimmed margin (-), % of the image per side: the card's own frame
   *  ("custom"), else the plan's default from the Floorplan Editor. Positions stay relative to the image. */
  _frame(a, ratio) {
    const cf = this._config.frame || {};
    const f = cf.mode === "custom" ? cf : (a && a.frame) || {};
    // House frames (several floors) can be larger than 60 %: a big ground floor around a small upper floor.
    const v = (k) => Math.max(-45, Math.min(500, Number(f[k]) || 0));
    const [t, r, b, l] = ["t", "r", "b", "l"].map(v);
    const W = 100 + l + r;
    const H = 100 + t + b;
    if (!t && !r && !b && !l) return { ratio, style: "", crop: false };
    return {
      // 0.8.2: a floor of a house uses the house's outer shape (its picture may be scaled per direction).
      ratio: cf.mode !== "custom" && Number(f.aspect) > 0 ? Number(f.aspect) : +(ratio * (W / H)).toFixed(4),
      crop: t < 0 || r < 0 || b < 0 || l < 0,
      style: `position:absolute;width:${(10000 / W).toFixed(3)}%;height:${(10000 / H).toFixed(3)}%;left:${((l * 100) / W).toFixed(3)}%;top:${((t * 100) / H).toFixed(3)}%;aspect-ratio:auto`,
    };
  }

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
      if (item.bond && !this._per(item, ov).lead) {
        const kind = this._mainKind(item);
        const key = LIVE_KEY[kind];
        if (!key || !kinds.includes(key)) return [];
        if (kind === "climate" && !q) return [];
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
    else if (["light", "switch", "fan"].includes(kind)) {
      // 0.7.4: a bond counts once (on while any of its members is on).
      const units = (item.units || list.map((e) => [e])).map((u) => u.filter((e) => list.includes(e))).filter((u) => u.length);
      value = `${units.filter((u) => u.some((e) => this._isOn(e, hass.states[e], kindOf(e, hass.states[e])))).length} of ${units.length} on`;
    }
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
    const icon = this._dev(item.id).icon || climateIcon(clim, st);
    const ents = [clim];
    const heatEnts = room.t ? [room.t] : own ? [clim, tempEid].filter(Boolean) : [];
    // Compact (Live, custom overlays, #99): icon + room temperature in the mode colour; "Off" when off.
    // 0.7.4: off needs no word: the grey chip already says it (a narrower chip); offline still says so.
    const shown = live(st) && st.state === "off" ? "" : word;
    if (compact) return { key: `${item.id}|${clim}`, type: "chip", cl2: true, compact: true, item, name, lines: [temp || "—", word], word: on ? "" : shown, set: "", temp, hum: "", ents, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
    return { key: `${item.id}|${clim}`, type: "chip", cl2: true, item, name, lines: [temp || "—", word], word: shown, set, temp, hum, ents, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
  }

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
    const conn = CONN_ORDER.find((c) => visible.includes(c));
    const z = conns.includes("zigbee") && item.ieee ? cx.zha[ieeeKey(item.ieee)] : null;
    const mainSt = hass.states[item.main_entity];
    const unavailable = (z && !z.available) || (!z && item.main_entity && !live(mainSt) && !item.bond);
    const isAp = Object.values((this._a && this._a.aps) || {}).includes(item.id);
    let role = z && z.role ? z.role : isAp ? "ap" : cx.hubs.has(item.id) ? "hub" : conns.includes("zigbee") ? "end" : "device";
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
    return [{ key: item.id, type: "net", item, name, conns, conn, role, ring, z, sigEid, rt, unavailable, ents: [item.main_entity].filter(Boolean), icon: CONNS[conn].icon, value: label, ieee: z ? item.ieee : null, x: pos.x, y: pos.y }];
  }

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
  }

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
  }

  /** Connections shown in Network: the viewer's choice, else the card's default. */
  _netShow() {
    if (Array.isArray(this._net.conns) && this._net.conns.length) return this._net.conns;
    const opts = this._ov("network");
    return Array.isArray(opts.connections) && opts.connections.length && !opts.connections.includes("all") ? opts.connections : CONN_ORDER;
  }

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
  }

  _saveNet() {
    const n = this._net;
    lsSet(`dfc_net_${this._lsKey()}`, { conns: n.conns, roles: n.roles, links: n.links, hubs: n.hubs, wlinks: n.wlinks, legend: n.legend, lqiOff: n.lqiOff });
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
      setShadow(this, `${style}<ha-card><div class="msg">Plan “${cesc(this._floor || c.plan)}” not found. Check the plan id, or open the Floorplan Editor in the sidebar.</div></ha-card>`);
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
    this._a = a;
    let specs = this._markers(a);
    this._heat = null;
    if (ov === "comfort") {
      if (this._layerOn("comfort", "heat", this._layerDefault("comfort", "heat"))) this._heat = this._heatGrid(a, specs, ratio);
      if (!this._layerOn("comfort", "labels", this._layerDefault("comfort", "labels"))) specs = specs.filter((sp) => sp.kind !== "reading");
      // 0.7.5: ACs / thermostats as their own layer (their temperatures still count in the heatmap above).
      if (!this._layerOn("comfort", "clim", this._layerDefault("comfort", "clim"))) specs = specs.filter((sp) => sp.kind !== "climate");
    }
    this._specs = new Map(specs.map((s) => [s.key, s]));
    this._ghosts = ov === "network" ? this._netGhosts(specs) : [];
    const watch = new Set();
    // 0.7.0: doors, windows and shutters drive bars and room shading even without a marker.
    for (const o of this._openSpots(a)) watch.add(o.eid);
    if (ov === "live") for (const m of this._motionSpots(a)) watch.add(m.eid);
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
    if (this._peopleShown()) for (const pp of this._people()) for (const e of [pp.entity, pp.room, pp.room2]) if (e) watch.add(e);
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
    const admin = isAdmin && nNew > 0 && !c.hide_admin_hint ? `<button class="admin" data-new="1" title="Only admins see this">${nNew} new · Place them</button>` : "";
    const names = look.names === "always" ? "names-always" : look.names === "off" ? "names-off" : "";
    const dock = this._overlays();
    const labels = c.overlay_names || {};
    const vertical = btn.position === "left" || btn.position === "right";
    const dockShown = (dock.length > 1 || btn.shortcuts.length > 0) && btn.position !== "hidden";
    // Layers live in the floor rail when there is one, else in the button bar, never on the plan
    // (#63, #75); without a bar, in the legend row.
    const lpos = this._layersPos();
    const layersOn = lpos !== "hidden";
    const floors = this._floorStack();
    const multi = floors.length > 1;
    const layersInBar = layersOn && lpos === "bar";
    // 0.7.5: a Layers corner on the bar's side shares that row / column (at its own end); "bar" = right after
    // the overlay buttons. Either way it sits outside the scrolling overlay buttons.
    const bp = btn.position;
    const touch = dockShown && layersOn && lpos !== "bar"
      && ((bp === "top" && lpos.startsWith("top")) || (bp === "bottom" && lpos.startsWith("bottom")) || (bp === "left" && lpos.endsWith("left")) || (bp === "right" && lpos.endsWith("right")));
    const atStart = touch && (vertical ? lpos.startsWith("top") : lpos.endsWith("left"));
    // Layers on the plan when it does not share the overlay buttons row.
    const lCorner = layersOn && !(layersInBar && dockShown) && !touch;
    const cornerPos = ["top-left", "bottom-right", "bottom-left"].includes(lpos) ? lpos : "top-right";
    // 0.8.1: with several floors the floor button sits right next to Layers, on its right (one group, wherever Layers is).
    const lg = () => (multi ? `<span class="lgroup">${this._layersBtn(true)}<span class="fwrap">${this._floorHtml(floors)}</span></span>` : this._layersBtn(true));
    const lgShown = () => lCorner || touch || (layersInBar && dockShown);
    const slot = (on) => `<span class="lslot ${on ? "" : "lvoid"}">${on ? lg() : ""}</span>`;
    const autoSt = dockShown && btn.auto ? this._autoStatus() : {};
    // Card overlays · your own overlays · shortcuts, with a faint line where the group changes.
    const barItems = [
      ...dock.map((o) => {
        const d = this._ovDef(o);
        const oa = btn.actions[o] || {};
        return { g: OVERLAYS[o] ? 0 : 1, html: this._barBtn({ cls: o === ov ? "on" : "", attrs: `data-ov="${cesc(o)}" ${oa.hold_action ? 'data-bh="1"' : ""} aria-pressed="${o === ov}"`, icon: d.icon, label: labels[o] || d.label, st: this._btnStatus(oa.status, autoSt[o]) }) };
      }),
      ...btn.shortcuts.map((sc, i) => ({ g: 2, html: this._barBtn({ cls: "sc", attrs: `data-sc="${i}" data-bh="1"`, icon: sc.icon || "mdi:gesture-tap", label: sc.name || "Shortcut", st: this._btnStatus(sc.status, null) }) })),
    ];
    const barHtml = barItems.map((x, i) => (i && x.g !== barItems[i - 1].g ? '<i class="bsep" aria-hidden="true"></i>' : "") + x.html).join("");
    const chev = (d) => `<button class="chev ${d}" data-chev="${d === "s" ? -1 : 1}" aria-label="${d === "s" ? "Scroll back" : "More buttons"}"><ha-icon icon="mdi:chevron-${vertical ? (d === "s" ? "up" : "down") : d === "s" ? "left" : "right"}"></ha-icon></button>`;
    const barBg = btn.bar === "contrast" ? (this._hass.themes && this._hass.themes.darkMode ? "light" : "dark") : btn.bar;
    const dockHtml = dockShown
      ? `<div class="dockrow ${touch ? "share" : ""} ${btn.rail ? `rail-${barBg}` : ""}">${touch ? slot(atStart) : ""}<div class="ovbar ${barBg} sh-${btn.shape} sz-${btn.size} ${vertical ? "vert" : ""}">${chev("s")}<nav class="dock ${btn.style === "icons" ? "icons" : ""}" aria-label="Overlays" ${vertical ? 'aria-orientation="vertical"' : ""}>${barHtml}${this._penMode() === "pen" ? this._penHtml() : ""}</nav>${chev("e")}</div>${layersInBar ? `<span class="lslot lbar">${lg()}</span>` : ""}${touch ? slot(!atStart) : ""}</div>`
      : "";
    const title = look.title !== false && c.title ? `<div class="hdr">${cesc(c.title)}</div>` : "";
    let emptyMsg = "";
    const people = this._peopleHtml(a);
    // 0.7.7: no "nothing to show" text on the plan: an empty overlay just means nothing is happening.
    const pos = btn.position === "hidden" ? "bottom" : btn.position;
    const scale = this._scale || 1;
    const nOn = this._ns.f > 0 && (this._night().overlays || []).includes(ov);
    const fr = this._frame(a, ratio);
    const boxCls = `${nOn && this._ns.f >= 0.5 ? "nt" : ""} ${nOn && this._ns.f >= 0.5 && this._night().dim_quiet !== false ? "nq" : ""}`;
    const floatCls = dockShown && btn.space && btn.space !== "reserve" ? `float ${btn.space === "float_icons" ? "float-icons" : ""}` : "";
    setShadow(this, `${style}<ha-card class="dock-${pos} ${floatCls} ${dockShown && btn.rail ? "srail" : ""} ${this._narrow ? "narrow" : ""}" style="--dfc-size:${Math.round((Number(look.size) || 34) * scale)}px;${chipVars}${roomVars}">
      <div class="main">${title}${admin}
        <div class="wrap ${names}"><div class="fr ${fr.crop ? "crop" : ""}" style="--fratio:${fr.ratio}"><div class="box ${boxCls}" style="--ratio:${ratio};${fr.style}">
          ${this._img ? `<img class="plan" src="${cesc(this._img)}" alt="${cesc(a.plan_name || "")}" draggable="false">` : ""}
          ${this._heat ? `<canvas class="heat"></canvas>` : ""}${this._nightHtml(a)}${this._pulseHtml(a)}${this._tvHtml(a)}${this._airHtml(a)}${this._barsHtml(a)}${this._applHtml(a)}
          ${this._roomsHtml(a)}
          ${this._freshHtml(a)}${this._robotHtml()}<svg class="lines"></svg>
          ${specs.map((s) => (s.type === "chip" ? this._chipHtml(s) : s.type === "robot" ? this._robotMarker(s) : this._markerHtml(s))).join("")}${this._ghosts.map((g) => `<div class="gdev" data-ghost="1" style="left:${g.x}%;top:${g.y}%" aria-label="${cesc(`${g.name} · ${g.floor}`)}"><ha-icon icon="${cesc(g.icon)}"></ha-icon></div>`).join("")}${people.plan}${emptyMsg}
        </div>${lCorner ? `<div class="lcorner ${cornerPos}">${lg()}</div>` : ""}</div></div>${people.row}
        ${ov === "lights" ? this._sceneBarHtml(specs) : ""}${this._heat ? this._heatLegendHtml() : ""}${ov === "network" ? this._legendHtml(specs, layersInBar && !dockShown) : ""}
      </div>${dockHtml}${layersOn && this._menu ? this._layersMenu(a) : ""}${multi && !lgShown() ? `<div class="fcorner"><span class="fwrap">${this._floorHtml(floors)}</span></div>` : ""}${this._popupHtml()}${dockShown && this._penMode() === "pen" ? "" : this._penHtml()}</ha-card>`);
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
    if (box && !box._swipe) this._bindSwipe(box);
    if (box) this._boxW = box.getBoundingClientRect().width || this._boxW;
    this._announce();
    if (this._popup && this._popup.type === "readings") this._fillHistory();
    if ((this._popup && this._popup.type === "info") || this._prevShown) requestAnimationFrame(() => this._placeInfo());
  }

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
  /** 0.8.1: one round button with the floor number; tapped, it becomes the floor rail (▲ · floors · ▼), on the plan. */
  _floorHtml(floors) {
    const cur = floors.find((f) => f.id === this._floor) || floors[0];
    if (!this._fopen) return `<button class="fbtn" data-fbtn="1" title="${cesc(cur.name)}: change floor" aria-label="Floor ${cesc(cur.name)}, change floor" aria-expanded="false"><ha-icon icon="mdi:office-building-outline"></ha-icon><b class="badge">${cesc(cur.label)}</b></button>`;
    const i = floors.findIndex((f) => f.id === this._floor);
    return `<div class="rail" role="toolbar" aria-label="Floors">
      <button class="arrow" data-step="1" aria-label="Floor up" ${i <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      ${floors.map((f) => `<button class="fl ${f.id === this._floor ? "on" : ""}" data-floor="${cesc(f.id)}" aria-pressed="${f.id === this._floor}" aria-label="${cesc(f.name)}" title="${cesc(f.name)}">${cesc(f.label)}<span class="pill">${cesc(f.name)}</span></button>`).join("")}
      <button class="arrow" data-step="-1" aria-label="Floor down" ${i >= floors.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>`;
  }

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
  }

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
  }

  /** Heatmap strength in % (viewer's slider, else the card's setting, else 52). */
  _heatOp() {
    const v = (this._lay.comfort || {}).heatOp;
    const d = Number(this._ov("comfort").heatmap_opacity);
    return Number.isFinite(v) ? v : Number.isFinite(d) && d > 0 ? d : 52;
  }

  _heatLegendHtml() {
    const h = this._heat;
    const f = (v) => `${this._num1 ? this._num1(v) : v.toFixed(1)}°`;
    const grad = HEAT_STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${Math.round(t * 100)}%`).join(", ");
    return `<div class="heatleg"><span class="ht">Room temperature</span><div class="hb"><div class="bar" style="background:linear-gradient(90deg, ${grad})"></div><div class="tk"><span>${f(h.lo)}</span><span>${f((h.lo + h.hi) / 2)}</span><span>${f(h.hi)}</span></div></div><span class="est">Estimated between sensors</span><label class="hop" title="Heatmap strength"><ha-icon icon="mdi:circle-opacity"></ha-icon><input type="range" min="15" max="90" step="5" value="${this._heatOp()}" data-heatop="1" aria-label="Heatmap strength"></label></div>`;
  }

  /** Rooms (#53): names at their spots, in the overlays chosen in the editor. */
  _roomsHtml(a) {
    const r = this._rooms();
    if (!this._layerOn(this._overlay, "rooms", this._roomsDefault(this._overlay))) return "";
    const size = { s: 11, m: 13, l: 16 }[r.size] || 13;
    return Object.entries(a.areas || {}).filter(([id]) => !(r.hidden || []).includes(id)).map(([id, room]) => {
      const name = (r.names && r.names[id]) || room.name;
      const icon = r.style === "pill_icon" ? `<ha-icon icon="${cesc(room.icon || "mdi:texture-box")}"></ha-icon>` : "";
      const cls = r.style === "label" ? "label" : "pill";
      const c = this._overlay === "cleaning" && this._layerOn("cleaning", "fresh", true) && ((a.cleaned || {})[id] || {}).t;
      const age = c ? `<small class="rage">${cesc(this._ageTxt(c))}</small>` : "";
      return `<div class="room ${cls}" style="left:${room.x}%;top:${room.y}%;font-size:${size}px">${icon}${cesc(name)}${age}</div>`;
    }).join("");
  }

  _markerHtml(s) {
    if (s.type === "net") {
      const r = ROLES[s.role] || ROLES.device;
      const cls = ["m", edgeCls(s.x, s.y), "net", r.shape, s.role, this._hl === s.key ? "hl" : ""].join(" ");
      return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-fill:${r.color};--dfc-ring:${s.ring || "transparent"}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.conns.map((c) => CONNS[c].label).join(", ")}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon></span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const icon = s.icon
      ? `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`
      : s.eid && this._hass.states[s.eid]
        ? `<ha-state-icon data-ent="${cesc(s.eid)}"></ha-state-icon>`
        : `<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
    const cls = ["m", edgeCls(s.x, s.y), s.kind, s.on ? "on" : "off", s.dim ? "dim" : "", s.unavail ? "unavail" : "", this._hl === s.key ? "hl" : "", s.glow ? "glow" : "", s.extras && s.extras.length ? "hasx" : "", s.noicon ? "noi" : "", this._pick && this._selId === s.item.id ? "sel" : "", s.ghost ? "ghost" : ""].join(" ");
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
    return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}${lc}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(label)}"><span class="ic">${icon}${bond}${s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : ""}</span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${xs}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}${s.item.ofName ? `<br><small>Through ${cesc(s.item.ofName)}${(s.item.conns || []).length ? ` · ${cesc(s.item.conns.map((c) => (CONNS[c] || { label: c }).label).join(" + "))}` : ""}</small>` : ""}</span></button>`;
  }

  _chipHtml(s) {
    const bdg = s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : "";
    const xl0 = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const xl = xl0 + bdg;
    if (s.cl2 && s.compact) {
      return `<button class="chip cl2 cmp ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.temp].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${s.word && (s.temp || s.word !== "Off") ? `<span class="mw">${cesc(s.word)}</span>` : ""}${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.cl2) {
      const left = s.word || s.set ? `<span class="mc"><span class="mw">${cesc(s.word)}</span>${s.set ? `<span class="st">${cesc(s.set)}</span>` : ""}</span>` : "";
      const right = s.temp || s.hum ? `${left ? `<span class="vs"></span>` : ""}<span class="tc">${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${s.hum ? `<span class="h"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.hum)}</span>` : ""}</span>` : "";
      return `<button class="chip cl2 ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.set, s.temp, s.hum].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${left}${right}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.rd && !s.icon) {
      // #94: readings in the AC chip style: temperature large, 💧 humidity small under it.
      const t = s.rd.t ? `<span class="t">${cesc(s.rd.t.replace(/\s?°C|\s?°F/, "°"))}</span>` : "";
      const h = s.rd.h ? `<span class="${t ? "h" : "t"}"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.rd.h)}</span>` : "";
      return `<button class="chip rd ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}"><span class="tc">${t}${h}</span>${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const first = s.icon ? `<span class="ico"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.lines[0] || "")}</span>` : `<span class="l1">${cesc(s.lines[0] || "")}</span>`;
    return `<button class="chip ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}">${first}${s.lines[1] ? `<span class="l2">${cesc(s.lines[1])}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
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
    const comfort = ov === "comfort" ? `${lay("heat", "mdi:thermometer-lines", "Heatmap")}${lay("labels", "mdi:thermometer", "Temperature labels")}${lay("clim", "mdi:air-conditioner", "Climate devices")}${lay("air", "mdi:weather-windy", "AC air flow")}` : "";
    const reset = this._lay[ov] || (ov === "network" && Object.keys(lsGet(`dfc_net_${this._lsKey()}`) || {}).length) ? `<hr><button data-layreset="1"><ha-icon icon="mdi:restore"></ha-icon>Back to the card's defaults</button>` : "";
    const rpath = (ov === "live" && (this._rb || []).length) || ov === "cleaning" ? lay("rpath", "mdi:vector-polyline", "Cleaning path") : "";
    const fresh = ov === "cleaning" ? lay("fresh", "mdi:clock-check-outline", "When rooms were cleaned") : "";
    const general = `<h4>Layers</h4><button class="${rooms ? "on" : ""}" data-lay="rooms">${tick(rooms)}<ha-icon icon="mdi:label-outline"></ha-icon>Room names</button>${comfort}${rpath}${fresh}`;
    if (ov !== "network") return `<div class="lmenu" role="menu" style="visibility:hidden">${general}${reset}</div>`;
    return `<div class="lmenu" role="menu" style="visibility:hidden">${general}<hr><h4>Connections</h4>
      <button class="chk ${!custom ? "on" : ""}" data-conn="__default">${chk(!custom)}<ha-icon icon="mdi:star-outline"></ha-icon>Default</button>
      ${present.map((cn) => `<button class="chk ${custom && shown.includes(cn) ? "on" : ""}" data-conn="${cn}">${chk(custom && shown.includes(cn))}<ha-icon icon="${CONNS[cn].icon}"></ha-icon>${cesc(CONNS[cn].label)}</button>`).join("")}
      <hr>
      ${hasZ ? `<button class="${n.links ? "on" : ""}" data-tg="links">${tick(n.links)}Zigbee links</button>` : ""}
      ${hasW ? `<button class="${n.wlinks ? "on" : ""}" data-tg="wlinks">${tick(n.wlinks)}Wi-Fi / LAN links</button>` : ""}
      ${hasH || n.hubs === false ? `<button class="${n.hubs ? "on" : ""}" data-tg="hubs">${tick(n.hubs)}Hub / bridge links</button>` : ""}
      <button class="${n.legend ? "on" : ""}" data-tg="legend">${tick(n.legend)}Legend</button>
${reset}
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
    return ["coordinator", "ap", "router", "hub", "end", "device", "unknown", "unavailable"].filter((r) => set.has(r));
  }

  /** 0.8.1: the legend shows only what is drawn now, in small groups (roles · LQI · lines · access points · Refresh). */
  _legendHtml(specs, withLayers) {
    const groups = [];
    const showWifi = this._netShow().includes("network");
    if (this._net.legend) {
      const hidden = this._net.roles || [];
      const roles = this._rolesPresent();
      if (roles.length) groups.push(roles.map((r) => `<button class="lg ${hidden.includes(r) ? "off" : ""}" data-role="${r}" aria-pressed="${!hidden.includes(r)}" title="Show / hide"><i class="${ROLES[r].shape}" style="background:${ROLES[r].color}"></i>${ROLES[r].label}</button>`).join(""));
      // The LQI ranges switch their Zigbee links on and off, like the roles do.
      if (specs.some((s) => s.z && s.z.lqi != null)) groups.push(`<span class="lt">LQI</span>${LQI_BANDS.slice().reverse().map((b) => `<button class="lg ${(this._net.lqiOff || []).includes(b.min) ? "off" : ""}" data-lqi="${b.min}" aria-pressed="${!(this._net.lqiOff || []).includes(b.min)}" title="Show / hide links in this range"><i class="ring" style="border-color:${b.color}"></i>${b.label}</button>`).join("")}`);
      if (specs.some((s) => s.sigEid && !(s.z && s.z.lqi != null))) groups.push(`<span class="lt">Signal</span><span><i class="ring" style="border-color:#43a047"></i>good</span><span><i class="ring" style="border-color:#fb8c00"></i>fair</span><span><i class="ring" style="border-color:#e53935"></i>weak</span>`);
      // Lines: only the kinds actually drawn (same rules as the lines themselves).
      const lines = [];
      const hubDrawn = this._net.hubs && (specs.some((s) => {
        const pa = s.item && s.item.via && this._specs.get(s.item.via);
        return s.type === "net" && pa && pa.type === "net" && !(s.conns.includes("zigbee") && pa.conns.includes("zigbee"));
      }) || (this._ghosts || []).some((g) => g.links.some((l) => l.cls === "hub")));
      if (hubDrawn) lines.push(`<span><i class="dash"></i>through hub / bridge</span>`);
      const rts = showWifi ? specs.filter((s) => s.rt && s.rt.home) : [];
      if (rts.length && this._net.wlinks) lines.push(`<span><i class="cab"></i>cable</span><span><i class="dash wf"></i>Wi-Fi</span>`);
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
          const nm = ap ? ap.name : k === "?" ? "Unknown" : k;
          return `<span class="aps"><i class="sw" style="background:${AP_COLORS[(i < 0 ? 0 : i) % AP_COLORS.length]}"></i>${cesc(nm)}: ${[b.w ? `${b.w} Wi-Fi` : "", b.c ? `${b.c} cable` : ""].filter(Boolean).join(", ")}</span>`;
        }).join(""));
      }
    }
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    if (isAdmin && this._netShow().includes("zigbee") && (this._zha || (this._a && Object.values(this._a.devices || {}).some((d) => (d.conns || []).includes("zigbee"))))) {
      const t = this._zhaAt ? new Date(this._zhaAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
      groups.push(`<span class="upd" title="Zigbee data updated at ${t}"><button class="rf ${this._scanning ? "busy" : ""}" data-refresh="1" title="Scan the Zigbee network again"><ha-icon icon="mdi:refresh"></ha-icon>${this._scanning ? "Scanning…" : "Refresh"}</button>${t}</span>`);
    }
    if (withLayers) groups.push(this._layersBtn());
    return groups.length ? `<div class="legend">${groups.map((g) => `<span class="lgrp">${g}</span>`).join("")}</div>` : "";
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
  }

  _layoutSoon() {
    cancelAnimationFrame(this._lraf);
    this._lraf = requestAnimationFrame(() => this._layout());
  }

  /** Keep close markers readable: spread them in a small grid, then push any remaining overlaps apart; a leader line points to the real spot. */
  /** 0.8.2: in a card with a fixed height (panel view, sections grid, wall panel, preview) the plan fills the area
   *  left after the buttons, legend and people: as large as possible, never stretched. Elsewhere (masonry) the
   *  card grows with the plan, which then uses the full width as before. */
  _fitPlan() {
    const sr = this.shadowRoot;
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
  }



  _layout() {
    this._fitPlan();
    this._barFit();
    const box = this.shadowRoot && this.shadowRoot.querySelector(".box");
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
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
        // Rows top to bottom; inside a row, left to right as on the plan (so neighbours never swap sides).
        const byY = [...g].sort((p, q) => p.ay - q.ay || p.ax - q.ax);
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
  }

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
    // Edit markers: the info card preview is only a preview, its buttons are not run.
    if (this._pick && t.closest(".pop.prev")) {
      if (t.closest("[data-close]")) {
        this._prevHide = this._selId;
        return this._update(true);
      }
      const b = t.closest("[data-appldone],[data-iopen],[data-itg],[data-press],[data-mi]");
      if (b) this._toast(`Preview: “${b.textContent.trim().slice(0, 40)}” isn't run while editing`);
      return;
    }
    if (t.closest("[data-pen]")) {
      e.stopPropagation();
      return this._openPen();
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
      this._toast("Cleaning started");
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
    const ad = t.closest("[data-appldone]");
    if (ad) {
      if (this._applDone) delete this._applDone[ad.dataset.appldone];
      lsSet(`dfc_appl_${this._lsKey()}`, this._applDone || {});
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
      this._setLayer(ov, name, !this._layerOn(ov, name, dflt));
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
    const io = t.closest("[data-iopen]");
    if (io) {
      const p0 = this._popup || {};
      this._popup = null;
      if (p0.appl) return this._moreInfo(io.dataset.iopen);
      const s0 = this._specs && this._specs.get(io.dataset.iopen);
      if (s0) this._details(s0);
      return this._update(true);
    }
    const itg = t.closest("[data-itg]");
    if (itg) {
      const s0 = this._specs && this._specs.get(itg.dataset.itg);
      if (s0) this._toggle({ ...s0, ents: this._infoToggles(s0) });
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
    // 0.7.5: bonds and phantoms (several things in one marker) open the info card; a single device does its tap action.
    if (s.type !== "net" && (s.phantom || s.item.bond || s.item.phantom)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    return this._runAction(s);
  }

  /** The marker's own action (long press, or "Open ›" in the info card). */
  _runAction(s) {
    const act = this._tapAction(s);
    if (act === "none") return;
    if (act === "robot") {
      const eid = s.type === "robot" ? s.eid : [s.eid, ...(s.ents || []), s.item.main_entity].find((e) => e && domainOf(e) === "vacuum");
      if (eid) {
        this._popup = { type: "robot", key: s.key, eid };
        return this._update(true);
      }
    }
    // 0.10: open a dashboard / a browser_mod popup (set per device in Edit markers).
    if (act === "navigate" || act === "popup") {
      const o = { ...this._dev(s.item.id), ...this._per(s.item, this._overlay) };
      const cfg = act === "navigate" ? (o.nav ? { action: "navigate", navigation_path: o.nav } : null) : o.popup_card ? { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(o.popup_title ? { title: o.popup_title } : {}), content: o.popup_card } } } : null;
      if (cfg) this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: s.ents[0], tap_action: cfg }, action: "tap" }, bubbles: true, composed: true }));
      else this._moreInfo(s.ents[0]);
      return;
    }
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
    if (t && t.dataset && t.dataset.heatop) {
      this._lay = { ...this._lay, comfort: { ...(this._lay.comfort || {}), heatOp: Number(t.value) } };
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      this._drawHeat();
      return;
    }
  }

  /** Hold / right-click: Home Assistant's details (graphs for a phantom). In Edit markers it's only simulated. */
  _holdEl(t) {
    if (t.dataset.bh) this._barHold(t);
    else if (t.dataset.k) this._hold(t.dataset.k);
    else if (t.dataset.airent) this._moreInfo(t.dataset.airent);
    else this._holdAppl(t.dataset.appl);
  }

  _hold(key) {
    const s = this._specs && this._specs.get(key);
    if (!s) return;
    const multi = s.phantom || s.item.bond || s.item.phantom;
    if (this._pick) {
      const tap = multi ? "info card" : { "more-info": "details", toggle: "switch on / off", readings: "graphs", none: "nothing", network: "network info" }[this._tapAction(s)] || this._tapAction(s);
      return this._toast(`Tap → ${tap} · long press → ${s.phantom ? "graphs" : "details"} (not run while editing)`);
    }
    this._details(s);
  }

  /** Home Assistant's details of a marker: graphs for a phantom, the leading entity's dialog otherwise. */
  _details(s) {
    if (s.phantom) return s.type === "chip" ? this._openReadings(s) : this._openList(s);
    this._moreInfo(s.eid || (s.ents || [])[0]);
  }

  /** Hold on an appliance: its details. */
  _holdAppl(ids) {
    const o = (this._appls || []).find((x) => x.ap.item.id === String(ids).split(",")[0]);
    if (!o) return;
    if (this._pick) return this._toast("Long press → details (not run while editing)");
    const ap = o.ap;
    this._moreInfo(ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity);
  }

  /** A short message on the card (Edit markers simulation). */
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
  }

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
  }

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
  }

  _hideTip() {
    clearTimeout(this._hovT);
    this._hovEl = null;
    const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
    if (tip) tip.classList.remove("show");
  }

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
  }

  /** Explore (touch): show the name and state of what's under the finger. */
  _explore(x, y) {
    const { text } = this._tipAt(x, y);
    this._showTip(text, x, y, null, true); // above the finger, never under it
  }

  _exploreEnd() {
    clearTimeout(this._xtipT);
    this._xtipT = setTimeout(() => {
      const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
      if (tip) tip.classList.remove("show");
    }, 1000);
  }

  /** "Name · state" for the hover tooltip and explore. */
  _tipText(s) {
    return `${s.name}${this._tipState(s) ? ` · ${this._tipState(s)}` : ""}`;
  }

  _tipState(s) {
    if (s.type === "net") return "";
    let t = "";
    if (s.type === "chip") t = s.cl2 ? [s.word, s.set, s.temp].filter(Boolean).join(" · ") : (s.lines || []).filter(Boolean).join(" · ");
    else if (s.eid || (s.ents || [])[0]) t = this._fmt(s.eid || s.ents[0]);
    return t && t !== "—" ? t : t === "—" ? "unavailable" : "";
  }

  /** Entities the info card can switch (lights, switches, fans, helpers). */
  _infoToggles(s) {
    const ents = [...new Set(s.ents || [])].filter((e) => ["light", "switch", "fan", "input_boolean"].includes(domainOf(e)) && this._hass.states[e] && !this._aux(e));
    // Only lamp bonds get on / off, and only their lights: never an appliance's plug or a config switch.
    if (this._applOf(s.item)) return [];
    const lamp = domainOf(s.eid || "") === "light" || s.item.group === "lights" || s.item.actsAs === "light" || s.item.as === "light";
    return lamp ? ents.filter((e) => domainOf(e) === "light" || (s.item.group === "lights" && e === s.eid)) : [];
  }

  /** A configuration or diagnostic entity (Home Assistant's category): never listed or switched. */
  _aux(e) {
    const reg = this._hass.entities && this._hass.entities[e];
    const st = this._hass.states[e];
    const cat = (reg && reg.entity_category) || (st && st.attributes && st.attributes.entity_category);
    return cat === "config" || cat === "diagnostic";
  }

  /** Edit markers (0.7.5): the selected bond / phantom / appliance shows its info card as a preview. */
  _previewPop() {
    const id = this._pick && this._selId;
    if (!id || this._prevHide === id) return null;
    if ((this._appls || []).some((o) => o.ap.item.id === id)) return { type: "info", appl: id, prev: true };
    const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x.item && x.item.id === id);
    return sp && (sp.phantom || sp.item.bond || sp.item.phantom) ? { type: "info", key: sp.key, prev: true } : null;
  }

  /** 0.7.5: the info card: name, state, every reading, buttons; "Open ›" = the marker's action. */
  _infoHtml(p) {
    const hass = this._hass;
    const close = `<button data-close="1" aria-label="Close">×</button>`;
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
      if (st.phase === "done") attention = `<button class="ibig" data-appldone="${cesc(item.id)}">Unloaded</button>`;
      open = lead ? `<button class="iopen" data-iopen="${cesc(lead)}">Open ›</button>` : "";
      anchor = `[data-appl*="${CSS.escape(item.id)}"]`;
    } else {
      const s = this._specs && this._specs.get(p.key);
      if (!s) return "";
      item = s.item;
      name = s.name;
      const on = s.type === "chip" ? s.cls !== "off" : s.on;
      dot = on ? s.color || "var(--dfc-accent)" : "#9e9e9e";
      state = this._tipState(s) || "—";
      lead = s.eid || (s.ents || [])[0];
      const picked = Array.isArray(this._per(item, this._overlay).extras) ? this._per(item, this._overlay).extras : null;
      reads = picked || [...(s.ents || []), ...(s.also || []), ...(item.entities || [])];
      if (s.phantom) lead = null; // a phantom has no one leading entity: all its sensors are listed
      toggles = this._infoToggles(s);
      open = `<button class="iopen" data-iopen="${cesc(s.key)}">${s.phantom ? "Graphs ›" : "Open ›"}</button>`;
      anchor = `[data-k="${CSS.escape(s.key)}"]`;
      if (toggles.length) {
        const anyOn = toggles.some((e) => (hass.states[e] || {}).state === "on");
        attention = `<button class="ibig" data-itg="${cesc(s.key)}">${anyOn ? "Turn off" : "Turn on"}</button>`;
      }
    }
    reads = [...new Set(reads)].filter((e) => e && e !== lead && hass.states[e] && !this._aux(e) && !["button", "input_button"].includes(domainOf(e))).slice(0, 8);
    const pool = [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    const presses = pool.filter((e) => ["button", "input_button"].includes(domainOf(e)) && live(hass.states[e]) && !this._aux(e)).slice(0, 3);
    const strip = (t) => {
      const n = String(name || "").trim();
      return n && t.toLowerCase().startsWith(`${n.toLowerCase()} `) ? t.slice(n.length + 1).replace(/^\w/, (c) => c.toUpperCase()) : t;
    };
    const rows = reads.map((e) => `<button class="irow" data-mi="${cesc(e)}"><span>${cesc(strip(this._entName(e)))}</span><b>${cesc(this._extraText(e))}</b></button>`).join("");
    const pr = presses.map((e) => `<button class="ipress" data-press="${cesc(e)}">${cesc(strip(this._entName(e)))}</button>`).join("");
    // 0.8.1: redrawn for new values at the spot it already had (no fade out and in).
    const was = this._icPos && this._icPos.anc === anchor ? this._icPos : null;
    return `<div class="pop ip ${p.prev ? "prev" : ""}"><div class="icard ${was ? "placed" : ""}" ${was ? `style="left:${was.left}px;top:${was.top}px"` : ""} role="dialog" aria-label="${cesc(name)}" data-anc="${cesc(anchor)}"><div class="ih"><b>${cesc(name)}</b>${close}</div><div class="ist"><i style="background:${dot}"></i><span>${cesc(state)}</span></div>${rows ? `<div class="irows">${rows}</div>` : ""}${attention || pr ? `<div class="ibtns">${attention}${pr}</div>` : ""}${open ? `<div class="iacts">${open}</div>` : ""}</div></div>`;
  }

  _entName(e) {
    const st = this._hass.states[e];
    return entName(this._hass, e);
  }

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
    const p = this._popup || this._previewPop();
    this._prevShown = !this._popup && !!p;
    if (!p) return "";
    const close = `<button data-close="1" aria-label="Close">×</button>`;
    if (p.type === "confirm") {
      return `<div class="pop"><div class="popin" role="dialog" aria-label="All off"><h3>Turn all lights off?${close}</h3><div>${p.n ? `${p.n} light${p.n > 1 ? "s are" : " is"} on.` : "No light is on right now."}</div><div class="acts"><button data-close="1">Cancel</button><button class="pri" data-confirm="1">All off</button></div></div></div>`;
    }
    if (p.type === "info") return this._infoHtml(p);
    if (p.type === "robot") return this._robotPop(p);
    if (p.type === "room") return this._roomPop(p);
    if (p.type === "appl") {
      const list = (this._appls || []).filter((o) => p.keys.includes(o.ap.item.id));
      if (!list.length) return "";
      const rows = list.map(({ ap, st }) => {
        const lead = ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity;
        const sub = [st.word, st.time, st.w].filter(Boolean).join(" · ");
        const done = st.phase === "done" ? `<button class="mini" data-appldone="${cesc(ap.item.id)}">Unloaded</button>` : "";
        return `<div class="arow"><button data-mi="${cesc(lead)}"><span class="ad" style="--ac:${st.col || "150,150,150"}"></span><span class="nm">${cesc(ap.item.name)}<small>${cesc(sub)}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>${done}</div>`;
      }).join("");
      const title = list.length > 1 ? "Appliances" : list[0].ap.item.name;
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(title)}"><h3>${cesc(title)}${close}</h3><div class="alist">${rows}</div></div></div>`;
    }
    const s = this._specs && this._specs.get(p.key);
    if (!s) return "";
    if (p.type === "list") {
      const lents = s.also && s.also.length ? [s.eid, ...s.also] : s.ents;
      return `<div class="pop"><div class="popin"><h3>${cesc(s.name)}${close}</h3><div class="list">${lents.map((e) => {
        const st = this._hass.states[e];
        return `<button data-mi="${cesc(e)}">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}</small></button>`;
      }).join("")}</div></div></div>`;
    }
    if (p.type === "covers") {
      const row = (e) => {
        const st = this._hass.states[e];
        if (!st) return "";
        const f = Number(st.attributes.supported_features || 0);
        const pos = st.attributes.current_position;
        const slider = f & 4 && pos != null ? `<input type="range" min="0" max="100" step="5" value="${Number(pos)}" data-covpos="${cesc(e)}" aria-label="Position">` : "";
        return `<div class="cov"><span class="nm">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}${pos != null ? ` · ${pos}%` : ""}</small></span>${slider}<button data-cov="${cesc(e)}" data-cmd="open" aria-label="Open"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="stop" aria-label="Stop"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="close" aria-label="Close"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>`;
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
      if (s.rt) {
        const ap = this._a.aps && this._specs.get(this._a.aps[s.rt.ap]);
        if (!s.rt.home) rows.push(["Router", "not connected"]);
        else {
          rows.push(["Access point", ap ? ap.name : s.rt.ap || "—"]);
          rows.push(["Link", s.rt.lan ? "Cable (LAN)" : "Wi-Fi"]);
          if (s.rt.ssid) rows.push(["Wi-Fi network", s.rt.ssid]);
        }
        if (s.rt.ip) rows.push(["IP", s.rt.ip]);
      }
      if (s.role === "ap") {
        const mine = Object.entries(this._a.aps || {}).filter(([, k]) => k === s.key).map(([n]) => n);
        let w = 0, c = 0;
        for (const x of this._specs.values()) if (x.rt && x.rt.home && mine.includes(x.rt.ap)) x.rt.lan ? c++ : w++;
        if (w + c) rows.push(["Connected here", [w ? `${w} Wi-Fi` : "", c ? `${c} cable` : ""].filter(Boolean).join(", ") + " (on this floor)"]);
      }
      if (s.item.parts && s.item.parts.length) rows.push(["Includes", s.item.parts.join(", ")]);
      const parent = s.item.via && this._specs.get(s.item.via);
      if (parent) rows.push(["Through", parent.name]);
      const none = !(s.z && (s.z.lqi != null || s.z.rssi != null)) && !s.sigEid && !s.rt;
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
      const label = multi ? entName(this._hass, e) : { temperature: "Temperature", humidity: "Humidity", battery: "Battery", signal: "Signal" }[k] || entName(this._hass, e);
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
    if (o === "plan" || o === "people") o = "live"; // 0.7.4: Plan is gone, 0.8.2: People too (people are in Live)
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
/** Near the plan's edges, a marker's labels open towards the inside so they aren't cut off. */
function edgeCls(x, y) {
  return [y > 78 ? "eb" : "", y < 12 ? "et" : "", x > 84 ? "er" : "", x < 12 ? "el" : ""].filter(Boolean).join(" ");
}

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
.dfe-big .bg-sel.inl { margin:2px 0 10px 8px; padding:8px 10px 10px; border:1px solid color-mix(in srgb, var(--primary-color, #03a9f4) 40%, transparent); border-left:3px solid var(--primary-color, #03a9f4); border-radius:8px; }
.dfe-big .bg-sel.inl { padding:6px 10px 10px; }
.dfe-big .bg-sel.inl .bg-t, .dfe-big .bg-sel.inl .qhide { display:none; }
.dfe-big .lr.sel .lb { white-space:nowrap; }
.dfe-big .bg-c2 { border:0; background:transparent; color: var(--secondary-text-color); font-size:15px; cursor:pointer; padding:2px 6px; }
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
    // 0.8.1: Edit markers works on the values from when it opened (nothing redraws or blinks while editing).
    if (this._big) this._big.wrap.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
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
      <p class="fhint">${ids.length > 1 ? "The Markers and Rooms below belong to this floor. On the card, the floor button under Layers switches floors." : "Add floors with + to switch between them on the card."}</p>`;
    box.querySelectorAll("[data-ft]").forEach((b) => b.addEventListener("click", () => {
      this._ftab = Number(b.dataset.ft);
      this._renderFloors();
      this._renderRooms();
    }));
    const bb = this.querySelector("#bigbtn span");
    if (bb) bb.textContent = ids.length > 1 ? `Edit markers on ${name(cur)}` : "Edit markers";
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
    return [...[...OVERLAY_ORDER, "cleaning"].map((o) => ({ value: o, label: OVERLAYS[o].label })), ...this._custom().map((c) => ({ value: c.id, label: c.name || "Custom" }))];
  }

  /** The editor's settings forms, in display order (#70). */
  _schemas() {
    const plans = planSensors(this._hass).map((s) => ({ value: s.attributes.plan_id, label: s.attributes.plan_name || s.attributes.plan_id }));
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
        { name: "layers_button", selector: { select: { options: [{ value: "top-right", label: "Top right of the plan" }, { value: "top-left", label: "Top left of the plan" }, { value: "bottom-right", label: "Bottom right of the plan" }, { value: "bottom-left", label: "Bottom left of the plan" }, { value: "bar", label: "In the overlay buttons" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
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
          { name: "preview_size", selector: { select: { options: [...PREVIEW_SIZES.map((p) => ({ value: p.id, label: `${p.label} (${p.w} × ${p.h})` })), { value: "custom", label: "Custom" }], mode: "dropdown" } } },
          ...(this._pv === "custom" ? [{ name: "preview_w", selector: { number: { min: 300, max: 3840, step: 10, mode: "box", unit_of_measurement: "px" } } }, { name: "preview_h", selector: { number: { min: 300, max: 2160, step: 10, mode: "box", unit_of_measurement: "px" } } }] : []),
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
            { name: "motion_as", selector: { select: { options: [{ value: "pulse", label: "Room pulse (the room's edges glow)" }, { value: "icons", label: "Icons" }, { value: "both", label: "Both" }], mode: "dropdown" } } },
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
      buttons_position: "Where the Overlay Bar is", buttons_style: "Labels", buttons_bar: "Overlay Bar background", buttons_shape: "Buttons", buttons_size: "Size", buttons_auto: "Automatic status on the card's overlay buttons (lights on, doors open, low batteries, offline devices)", plan_position: "Plan position in a fixed-height card (wall panel, sections)", buttons_space: "Space for the Overlay Bar", frame_mode: "Space around the plan", frame_linked: "Same on all four sides", frame_all: "All sides (+ space, − trim)", frame_t: "Top", frame_r: "Right", frame_b: "Bottom", frame_l: "Left", preview_size: "Preview size (Preview button below)", preview_w: "Width", preview_h: "Height", layers_button: "Layers button (viewers switch room names and other layers)",
      lights_as: "Lights show as", motion_as: "Motion and presence show as", show_off: "Things that are off", show: "Show", quiet_small: "Closed doors and idle sensors: small and faint", values: "Values next to icons (thermostat temperature, open lamps)",
      switches: "Include switches and plugs that run lights", brightness: "Show brightness of lights that are on", off: "Lights that are off", all_off: "“All off” button", all_on: "“All on” button",
      heatmap: "Heatmap shown by default (viewers can switch it under Layers)", heatmap_opacity: "Heatmap strength (viewers can change it with the slider under the plan)", readings: "Temperature labels shown by default", climate_shown: "Climate devices (ACs, thermostats) shown by default", airflow: "AC air flow shown by default",
      humidity: "Show humidity", humidity_alone: "Also devices with humidity only", combine: "Bonds and phantoms with several sensors show", climate: "ACs and thermostats as climate chips (mode, room temperature, target)",
      show_quiet: "Also show closed / idle (not only alerts)", cameras: "Show cameras",
      connections: "Connections shown by default", layers: "Layers button next to the overlay buttons (viewers can switch connections)", links: "Draw Zigbee links (ZHA)", min_lqi: "Hide Zigbee links below this LQI", hub_links: "Draw hub / bridge links (Matter bridges, hubs)", wifi_links: "Draw Wi-Fi / LAN links to the router / access point (needs router device tracking)", legend: "Legend under the plan", labels: "Connection names next to icons", only_weak: "Only weak and fair signals",
      low: "Battery is low below", only_problems: "Only low batteries and offline devices",
      show_title: "Show the title on the card", size: "Marker size", markers: "Markers on the plan", chips: "Reading chips", names: "Device names", card_id: "Card ID (lets other cards switch this card's overlay)",
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
      preview_size: this._pv || "wall",
      preview_w: (this._pvc || {}).w || 1280,
      preview_h: (this._pvc || {}).h || 800,
      layers_button: c.layers_button || ((c.network || {}).layers === false ? "hidden" : "top-right"),
      live: { show: LIVE_DEFAULT, quiet_small: true, values: true, lights_as: "glow", show_off: "hidden", motion_as: "pulse", ...(c.live || {}) },
      lights: { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, ...(c.lights || {}) },
      comfort: { heatmap: true, heatmap_opacity: 52, readings: true, climate_shown: true, airflow: true, humidity: true, humidity_alone: true, climate: true, ...(c.comfort || {}) },
      security: { show_quiet: true, quiet_small: true, cameras: true, ...(c.security || {}) },
      network: { connections: ["all"], layers: true, links: true, min_lqi: 0, hub_links: true, wifi_links: true, legend: true, labels: false, only_weak: false, ...(c.network || {}) },
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
    if (!out.hide_admin_hint) delete out.hide_admin_hint;
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
      // 0.8.1: per floor first (Markers, Rooms), then the settings for the whole card (all floors).
      this.innerHTML = `<style>${ED_CSS}</style><div class="dfe">
        <h3 class="grp"><ha-icon icon="mdi:office-building-outline"></ha-icon>Per floor <small>(Markers and Rooms of the floor picked in the tabs)</small></h3>
        <div class="fpanel"><div class="floors" id="floors"></div>
        ${sec("mdi:devices", "Markers", "What each device shows per overlay, extra readings, icon, tap, hide / add, people: all on the plan of this floor.", `<button class="bigbtn" id="bigbtn"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><span>Edit markers</span></button>`)}
        ${sec("mdi:texture-box", "Rooms on this floor", "Rooms from the Floorplan Editor: rename them for the card or hide them.", `<div id="rooms"></div>`)}</div>
        <h3 class="grp"><ha-icon icon="mdi:home-outline"></ha-icon>Card settings <small>(the whole house, all floors)</small></h3>
        <div id="fopts"></div>
        <div data-form="general"></div>
        ${sec("mdi:gesture-tap-button", "Overlay Bar", "Which buttons, their order, where the Overlay Bar sits and how it looks.", `<div data-form="buttons"></div><div class="sub"><h5><ha-icon icon="mdi:gesture-tap-hold"></ha-icon>Overlay Bar: hold, status and shortcuts</h5><p>Each overlay button can run an action on hold and show a status (dot, count, value, colour or another icon). Shortcuts are your own buttons: tap and hold run any Home Assistant action (open a page, a popup on this browser, reload…). A faint line separates card overlays, your own overlays and shortcuts; what doesn't fit scrolls in the bar.</p><div id="bbar"></div></div>`)}
        ${sec("mdi:layers-outline", "Overlays", "What each overlay shows.", `<div data-form="overlaysA"></div>
          <div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes</h5><p>Buttons in the Lights overlay. Stored in this card only, nothing is created in Home Assistant.</p><div id="scenes"></div></div>
          <div data-form="overlaysB"></div>
          <div class="sub"><h5><ha-icon icon="mdi:layers-plus"></ha-icon>Custom overlays</h5><p>Your own overlay buttons, e.g. “Downstairs lights” or “Plants”: pick the kinds of devices it shows, and add single devices in the device list below.</p><div id="custom"></div></div>`)}
        ${sec("mdi:texture-box", "Rooms", "How Room names look on the plan, and in which overlays they show by default.", `<div id="roomsg"></div>`)}
        ${sec("mdi:account-group-outline", "People", "Each person at the room pin of the room they are in. Room sensor: any entity whose state is a room (Bermuda, ESPresense, a template sensor…); sensor 2 is used when 1 is unknown or not a room on this plan.", `<div id="people"></div>`)}
        ${sec("mdi:weather-night", "Day & night", "", `<p id="nightnote"></p><div id="night"></div>`)}
        ${sec("mdi:tune-variant", "Look and tap behaviour", "", `<div data-form="look"></div>`)}
        ${sec("mdi:border-outside", "Frame and preview", "Space around the plan (+) or trimmed margin (−), % of the image: markers and Rooms never move. Then see the card at a real screen size.", `<div data-form="frame"></div><button class="bigbtn" id="pvbtn"><ha-icon icon="mdi:monitor-screenshot"></ha-icon><span>Preview</span></button>`)}
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
      this.querySelector("#pvbtn").addEventListener("click", () => this._openPreview());
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
    if (key === "frame") {
      for (const k of this._keysOf(schema)) delete c[k];
      this._pv = v.preview_size || "wall";
      this._pvc = { w: Number(v.preview_w) || 1280, h: Number(v.preview_h) || 800 };
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
      if (key === "buttons") this._renderBar();
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

  /** 0.8.2: the card as it will look on a real screen (wall panel, tablet…), scaled to fit this window. */
  _openPreview() {
    const size = this._pv === "custom" ? { label: "Custom", ...(this._pvc || { w: 1280, h: 800 }) } : PREVIEW_SIZES.find((p) => p.id === (this._pv || "wall")) || PREVIEW_SIZES[0];
    const wrap = document.createElement("div");
    wrap.className = "dfc-preview";
    const k = Math.min(1, (window.innerWidth * 0.92) / size.w, (window.innerHeight * 0.82) / size.h);
    wrap.innerHTML = `<style>
      .dfc-preview { position:fixed; inset:0; z-index:10000; background: rgba(0,0,0,.6); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      .dfc-preview .bar { color:#fff; display:flex; gap:12px; align-items:center; font-size:14px; }
      .dfc-preview .bar button { border:0; border-radius:16px; padding:6px 14px; cursor:pointer; font: inherit; }
      .dfc-preview .scr { width:${size.w * k}px; height:${size.h * k}px; overflow:hidden; border-radius:10px; box-shadow: 0 10px 40px rgba(0,0,0,.5); background: var(--primary-background-color, #fafafa); }
      .dfc-preview .in { width:${size.w}px; height:${size.h}px; transform: scale(${k}); transform-origin: 0 0; padding: 8px; box-sizing:border-box; }
    </style><div class="bar"><b>${size.label}</b><span>${size.w} × ${size.h} px${k < 1 ? ` · shown at ${Math.round(k * 100)} %` : ""}</span><button>Close</button></div><div class="scr"><div class="in"></div></div>`;
    const card = document.createElement("device-floorplan-card");
    card.setConfig(this._config);
    card.style.height = "100%";
    card._fitHost = true; // a fixed screen: the plan fits the card's free area
    wrap.querySelector(".in").appendChild(card);
    card.hass = this._hass;
    const close = () => wrap.remove();
    wrap.querySelector(".bar button").addEventListener("click", close);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });
    document.body.appendChild(wrap);
  }

  _renderSections() {
    this._refreshForms();
    this._renderCustom();
    this._renderBar();
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
  // ---- 0.8.2 Overlay Bar Reloaded: hold, status, shortcuts
  _statusSchema(st, allowAuto) {
    const mode = st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off");
    const show = st.show === "icon" ? "color" : st.show || "dot";
    const badge = show === "count" || show === "value";
    return [
      { name: "st_mode", selector: { select: { options: [...(allowAuto ? [{ value: "auto", label: "Automatic (when switched on above)" }] : []), { value: "off", label: "None" }, { value: "custom", label: "From entities I pick" }], mode: "dropdown" } } },
      ...(mode === "custom" ? [
        { name: "st_entity", selector: { entity: { multiple: true } } },
        { name: "st_show", selector: { select: { options: [{ value: "color", label: "Icon colour" }, { value: "dot", label: "Dot" }, { value: "count", label: "Badge: how many are active" }, { value: "value", label: "Badge: short value (e.g. 62%)" }], mode: "dropdown" } } },
        ...(badge
          ? [{ name: "st_when_1", selector: { text: {} } }, { name: "st_color_1", selector: { text: {} } }]
          : [1, 2, 3].flatMap((n) => [{ name: `st_when_${n}`, selector: { text: {} } }, { name: `st_color_${n}`, selector: { text: {} } }])),
      ] : []),
    ];
  }

  _statusData(st, allowAuto) {
    const rules = Array.isArray(st.rules) && st.rules.length ? st.rules : [{ when: st.when, color: st.color }];
    const d = { st_mode: st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off"), st_entity: Array.isArray(st.entity) ? st.entity : st.entity ? [st.entity] : [], st_show: st.show === "icon" ? "color" : st.show || "dot" };
    for (const n of [1, 2, 3]) {
      d[`st_when_${n}`] = (rules[n - 1] || {}).when || "";
      d[`st_color_${n}`] = (rules[n - 1] || {}).color || "";
    }
    return d;
  }

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
  }

  _renderBar() {
    const box = this.querySelector("#bbar");
    if (!box) return;
    const b = this._config.buttons || {};
    const actions = b.actions || {};
    const shortcuts = Array.isArray(b.shortcuts) ? b.shortcuts : [];
    const ovs = (Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)]).filter((o) => o !== "plan" && o !== "people");
    const def = (o) => OVERLAYS[o] || (this._custom().find((x) => x.id === o) ? { label: this._custom().find((x) => x.id === o).name || "Custom", icon: this._custom().find((x) => x.id === o).icon || "mdi:layers-outline" } : null);
    const AUTO = { lights: "badge with how many of the lights the Lights overlay shows are on", security: "red dot when a door or window is open, the alarm armed or a lock unlocked (not shutters)", health: "amber dot when a battery is low or a device offline", network: "red dot when a device is offline" };
    const actTxt = (a) => (!a ? "" : { reload: "reload page", back: "back", navigate: "open a page", url: "open a link", "more-info": "details", "perform-action": "action", "call-service": "action", toggle: "toggle", "fire-dom-event": "popup", assist: "Assist", none: "" }[a.action] || a.action);
    const stTxt = (st, o) => (st && st.mode === "off" ? "no status" : st && st.mode === "custom" ? `status: ${{ color: "icon colour", icon: "icon colour", dot: "dot", count: "badge", value: "badge" }[st.show || "dot"]}` : o && AUTO[o] && b.auto_status ? "auto status" : "");
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
      ...shortcuts.map((sc, i) => ({ key: `s:${i}`, icon: sc.icon || "mdi:gesture-tap", name: sc.name || `Shortcut ${i + 1}`, small: ["shortcut", sc.tap_action ? `tap: ${actTxt(sc.tap_action)}` : "", sc.hold_action ? `hold: ${actTxt(sc.hold_action)}` : "", stTxt(sc.status)].filter(Boolean).join(" · ") })),
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
    const LBL = { hold_action: "Hold action", st_mode: "Status on the button", st_entity: "Entities", st_show: "Shows", st_when_1: "When (states like running, prepare, or a number test like >50; empty = on / open / armed / unlocked)", st_color_1: "Colour (e.g. green, #E5534B)", st_when_2: "Else when", st_color_2: "Colour", st_when_3: "Else when", st_color_3: "Colour", name: "Name", icon: "Icon", tap_kind: "Tap", tap_action: "Tap action", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)", hold_kind: "Hold" };
    if (kind === "o") {
      const cur = actions[id] || {};
      const hk = (cur.hold_action || {}).action;
      const data = { hold_kind: hk === "reload" || hk === "back" ? hk : cur.hold_action ? "action" : "none", hold_action: hk && hk !== "reload" && hk !== "back" ? cur.hold_action : undefined, ...this._statusData(cur.status || {}, true) };
      const schema = [
        { name: "hold_kind", selector: { select: { options: [{ value: "none", label: "Nothing" }, { value: "action", label: "A Home Assistant action" }, { value: "reload", label: "Reload this page" }, { value: "back", label: "Back to where you were" }], mode: "dropdown" } } },
        ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
        ...this._statusSchema(cur.status || {}, !!AUTO[id]),
      ];
      const f = this._form(schema, data, LBL, (v) => {
        const nx = {};
        if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
        else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
        const st = this._statusFrom(v, !!AUTO[id]);
        if (st) nx.status = st;
        const na = { ...actions };
        if (Object.keys(nx).length) na[id] = nx;
        else delete na[id];
        const redraw = v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
        save({ ...b, actions: na }, redraw);
      });
      body.appendChild(f);
      if (AUTO[id]) body.insertAdjacentHTML("beforeend", `<p class="note">Automatic: ${cesc(AUTO[id])}, for the floor shown. Only while <i>Automatic status</i> is switched on above.</p>`);
      return;
    }
    const i = Number(id);
    const sc = shortcuts[i] || {};
    const tk = (sc.tap_action || {}).action;
    const bm = tk === "fire-dom-event" && sc.tap_action.browser_mod && sc.tap_action.browser_mod.service === "browser_mod.popup" ? sc.tap_action.browser_mod.data || {} : null;
    const hk = (sc.hold_action || {}).action;
    const data = {
      name: sc.name || "", icon: sc.icon || "",
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
      { name: "tap_kind", selector: { select: { options: kinds(true), mode: "dropdown" } } },
      ...(data.tap_kind === "action" ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
      ...(data.tap_kind === "popup" ? [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }] : []),
      { name: "hold_kind", selector: { select: { options: kinds(false), mode: "dropdown" } } },
      ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
      ...this._statusSchema(sc.status || {}, false),
    ];
    body.appendChild(this._form(schema, data, LBL, (v) => {
      const nx = { name: v.name || "", icon: v.icon || "" };
      if (v.tap_kind === "reload" || v.tap_kind === "back") nx.tap_action = { action: v.tap_kind };
      else if (v.tap_kind === "action") nx.tap_action = v.tap_action && v.tap_action.action ? v.tap_action : { action: "navigate", navigation_path: "/" };
      else if (v.tap_kind === "popup") nx.tap_action = { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(v.popup_title ? { title: v.popup_title } : {}), content: v.popup_card || { type: "markdown", content: "Pick a card" } } } };
      if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
      else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
      const st = this._statusFrom(v, false);
      if (st) nx.status = st;
      const redraw = v.tap_kind !== data.tap_kind || v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
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
  }

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
  /** The areas of the floor picked in the tabs (0.8.1: Rooms are set per floor). */
  _floorAreas() {
    const ids = this._planIds();
    const id = ids[Math.min(this._ftab || 0, Math.max(0, ids.length - 1))];
    const sen = planSensors(this._hass).find((x) => x.attributes.plan_id === id);
    return sen ? sen.attributes.areas || {} : {};
  }

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
    return entName(this._hass, e);
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
      const auto = eng._autoReads(item, ov);
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
        const x0 = per().extras;
        this._savePer(id, ov, { lead: leadEl.value, ...(Array.isArray(x0) ? { extras: x0.filter((e) => e !== leadEl.value) } : {}) });
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
      // 0.10: a robot's tap is one setting for every overlay (its panel by default); a dashboard or a popup for any device.
      const robot = [item.main_entity, ...(item.entities || [])].some((e) => e && domainOf(e) === "vacuum");
      const tsrc = robot ? dev() : { ...dev(), ...p0 };
      const tcur = (robot ? dev().tap : p0.tap || dev().tap) || "default";
      const topts = robot ? [{ value: "default", label: "Robot panel" }, ...TAP_OPTIONS.filter((o) => !["toggle", "readings"].includes(o.value))] : [{ value: "default", label: "Default for its kind" }, ...TAP_OPTIONS];
      const tschema = [{ name: "icon", selector: { icon: {} } }, { name: "tap", selector: { select: { options: topts, mode: "dropdown" } } }];
      if (tcur === "navigate") tschema.push({ name: "nav", selector: { navigation: {} } });
      if (tcur === "popup") tschema.push({ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } });
      body.appendChild(this._form(tschema, { icon: p0.icon || dev().icon || "", tap: tcur, nav: tsrc.nav || "", popup_title: tsrc.popup_title || "", popup_card: tsrc.popup_card }, { icon: `Icon in ${ovLabel} (empty = Home Assistant's own)`, tap: robot ? "Tap (on every overlay)" : item.bond || item.phantom ? `Tap in ${ovLabel} (bonds and phantoms open their info card)` : `Tap in ${ovLabel}`, nav: "Dashboard to open", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)" }, (v) => {
        const tap = v.tap === "default" ? "" : v.tap;
        const extra = { nav: tap === "navigate" ? v.nav || "" : "", popup_title: tap === "popup" ? v.popup_title || "" : "", popup_card: tap === "popup" ? v.popup_card || null : null };
        if (robot) {
          this._savePer(id, ov, { icon: v.icon });
          this._saveDev(id, { tap, ...extra });
        } else this._savePer(id, ov, { icon: v.icon, tap, ...extra });
        if ((v.tap || "default") !== tcur) rerender();
        else saved();
      }));
      // 0.7.5: an appliance's status pill in Live.
      if (ov === "live" && eng._applOf(item)) {
        body.appendChild(this._form([
          { name: "pill", selector: { select: { options: [{ value: "auto", label: "For a few minutes after it changes" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }], mode: "dropdown" } } },
          { name: "done_for", selector: { select: { options: [{ value: "30", label: "After 30 minutes" }, { value: "60", label: "After 1 hour" }, { value: "unloaded", label: "Only when unloaded (tap, or the door opens)" }], mode: "dropdown" } } },
        ], { pill: p0.pill || "auto", done_for: p0.done_for || "30" }, { pill: "Status label on the plan", done_for: "“Done” clears by itself" }, (v) => {
          this._savePer(id, ov, { pill: v.pill === "auto" ? "" : v.pill, done_for: v.done_for === "30" ? "" : v.done_for });
          saved();
        }));
      }
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
    // 0.7.5: a climate unit's own temperature (a wrong built-in sensor can be left out everywhere).
    if (!item.phantom && cands.some((e) => domainOf(e) === "climate")) {
      body.appendChild(this._form([{ name: "own", selector: { boolean: {} } }], { own: dev().own_temp !== "off" }, { own: "Count this unit's own temperature in Comfort and the heatmap (a bonded room thermometer always wins)" }, (v) => {
        this._saveDev(id, { own_temp: v.own ? "" : "off" });
        saved();
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
    const ovs = eng._overlays().filter((o) => o !== "plan" && o !== "people" && o !== "live" && o !== "network" && o !== "health");
    body.appendChild(this._form([{ name: "people_in", selector: { select: { options: ovs.map((o) => ({ value: o, label: eng._ovDef(o).label })), multiple: true, mode: "list" } } }], { people_in: this._config.people_in || [] }, { people_in: "People show in Live; also show them in (all people)" }, (v) => save(list, { people_in: v.people_in })));
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
    const fid = this._planIds()[this._ftab || 0];
    if (!direct && fid) card._floor = fid; // 0.8.1: the floor picked in the card editor
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
        selBox.querySelector(".bg-t span").textContent = entName(this._hass, id.slice(7));
        this._personPanel(selBox.querySelector(".bg-p"), id.slice(7), (x) => render(x));
      } else if (id) {
        const item = items.find((x) => x.id === id);
        if (item) {
          selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
          selBox.querySelector(".bg-t span").textContent = ((this._config.devices || {})[id] || {}).name || item.name;
          this._markerPanel(selBox.querySelector(".bg-p"), item, a, eng, ovs, { current: ov, rerender: () => render(id), saved: () => {
            const nm = side.querySelector(`.lr[data-id="${CSS.escape(id)}"] .lnm`);
            if (nm) nm.innerHTML = `${cesc(((this._config.devices || {})[id] || {}).name || item.name)}${item.bond ? " <small>(bonded)</small>" : item.phantom ? " <small>(phantom)</small>" : ""}`;
          } });
        }
      } else {
        selBox.innerHTML = `<p class="bg-hint">${ov === "plan" ? "Pick an overlay under the plan to edit its markers." : `Click a marker on the plan to change it in <b>${cesc(def ? def.label : "")}</b>: what it shows, extra readings, icon, tap. ✕ on a selected marker hides it here.`}</p>`;
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
        for (const it of items) {
          if (ql && !`${name(it)} ${it.id}`.toLowerCase().includes(ql)) continue;
          if (ov === "plan") continue;
          const qual = e2._qualifies(it, ov, a);
          if (qual && e2._hidden(it, ov)) rows.hidden.push(it);
          else if (qual) rows.on.push(it);
          else rows.off.push(it);
        }
        for (const k of Object.keys(rows)) rows[k].sort((x, y) => name(x).localeCompare(name(y), undefined, { sensitivity: "base" }));
        const hideBtn = (it) => (sel === it.id && rows.on.includes(it) ? `<button class="lb" data-hide="${cesc(it.id)}">Hide in ${cesc(def ? def.label : "")}</button>` : "");
        const closeBtn = (it) => (sel === it.id ? `<button class="bg-c2" data-unpick="1" aria-label="Close">✕</button>` : "");
        const row = (it, btn) => `<div class="lr ${sel === it.id ? "sel" : ""}" data-id="${cesc(it.id)}"><button class="lnm" data-pick="${cesc(it.id)}">${cesc(name(it))}${it.bond ? " <small>(bonded)</small>" : it.phantom ? " <small>(phantom)</small>" : ""}</button>${btn}${hideBtn(it)}${closeBtn(it)}</div>`;
        const custom = def && def.custom;
        box.innerHTML = (rows.hidden.length ? `<h6>Hidden here (${rows.hidden.length})</h6>${rows.hidden.map((it) => row(it, `<button class="lb" data-show="${cesc(it.id)}">↩ Show</button>`)).join("")}` : "")
          + (rows.on.length ? `<h6>On this overlay (${rows.on.length})</h6>${rows.on.map((it) => row(it, "")).join("")}` : "")
          + (rows.off.length ? (custom || ql
            ? `<h6>Not in this overlay (${rows.off.length})</h6>${rows.off.map((it) => row(it, custom ? `<button class="lb" data-add="${cesc(it.id)}">+ Add</button>` : `<small class="na">not for ${cesc(def ? def.label : "")}</small>`)).join("")}`
            : `<details><summary><h6 style="display:inline">Not for ${cesc(def ? def.label : "")} (${rows.off.length})</h6></summary>${rows.off.map((it) => row(it, "")).join("")}</details>`) : "")
          + `<p class="bg-hint" style="margin-top:10px">Devices that aren't on the plan yet: place them in the Floorplan Editor first.</p>`;
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
    return on === 0 ? "Off" : on === ents.length ? "On" : `${on} of ${ents.length} on`;
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
      const all = grp.flatMap((e) => (h.states[e] && Array.isArray(h.states[e].attributes.entity_id) ? h.states[e].attributes.entity_id : [e]));
      return { n: all.filter(isOn).length, total: all.length, word: wordOf(all) };
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
      if (c.value_style === "short") return k.n ? `${k.n} ${k.word}` : k.word === "open" ? "All closed" : "All off";
      return `${k.n} of ${k.total} ${k.word}`;
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
