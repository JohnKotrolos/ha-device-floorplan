/*
 * Device Floorplan – dashboard card (v0.4.7).
 *
 * The view is calm: the plan and the overlay buttons. Everything else (what
 * each overlay shows, icons, names, tap behaviour, rooms, scenes, custom
 * overlays, looks) is set in the card editor.
 *
 *   type: custom:device-floorplan-card
 *   plan: ground_floor            # plan id (required)
 *
 * Positions come from the plan sensor (sensor.device_floorplan_<plan>): a device's
 * entities share its position; a device's box/radio spot is used where the
 * hardware matters (Network, Health); helpers can be placed on their own;
 * bonded lights/switches/covers are one marker switched together.
 *
 * Other cards switch the overlay with the action device_floorplan.show_overlay
 * (card_id + overlay, every screen) or a link with ?overlay=<name>[&card=<card_id>].
 */

const CARD_VERSION = "0.4.7";
const PANEL_PATH = "/device-floorplan";

const OVERLAYS = {
  plan: { label: "Plan", icon: "mdi:floor-plan" },
  live: { label: "Live", icon: "mdi:home-lightbulb-outline" },
  lights: { label: "Lights", icon: "mdi:lightbulb-group-outline" },
  comfort: { label: "Comfort", icon: "mdi:thermometer" },
  security: { label: "Security", icon: "mdi:shield-home-outline" },
  network: { label: "Network", icon: "mdi:access-point-network" },
  health: { label: "Health", icon: "mdi:battery-heart-variant" },
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
const TAP_DEFAULT = { light: "toggle", switch: "toggle", cover: "toggle", climate: "more-info", lock: "more-info", reading: "readings", other: "more-info" };
const TAP_OPTIONS = [
  { value: "toggle", label: "Switch on / off" },
  { value: "more-info", label: "Open details (more-info)" },
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

const OPEN_DC = new Set(["door", "window", "opening", "garage_door"]);
const MOTION_DC = new Set(["motion", "occupancy", "presence", "moving"]);
const SAFETY_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "safety", "problem", "tamper", "heat", "sound"]);
const TOGGLE_DOMAINS = new Set(["light", "switch", "fan", "input_boolean", "cover", "siren", "humidifier"]);

const cesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const live = (st) => !!st && st.state !== "unavailable" && st.state !== "unknown";
const num = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const domainOf = (eid) => (eid ? eid.split(".")[0] : "");
const ieeeKey = (i) => String(i || "").toLowerCase().replace(/^0x/, "").replace(/:/g, "");

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
.m.light.on .ic { background: color-mix(in srgb, #ffc107 22%, var(--card-background-color, #fff)); color:#e0a000; box-shadow: 0 0 16px 2px color-mix(in srgb, #ffc107 55%, transparent); border-color:#ffc107; }
.m.dim .ic { opacity:.55; transform: scale(.82); }
.m.unavail .ic { opacity:.45; border: 2px dashed var(--secondary-text-color); }
.m.motion.on .ic::after { content:''; position:absolute; inset:-2px; border-radius:50%; border:2px solid var(--dfc-c); animation: dfcpulse 1.8s ease-out infinite; }
@keyframes dfcpulse { from { transform: scale(1); opacity:.9; } to { transform: scale(1.9); opacity:0; } }
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
    if (!config || !config.plan) throw new Error("Choose a plan (plan: <plan id>)");
    const c = { ...config };
    // Older configs (0.4.x card, card v0.0x): keep them working.
    if (!c.default_overlay && c.default_view) c.default_overlay = c.default_view === "plan" ? "plan" : "live";
    this._config = c;
    const dock = this._overlays();
    if (!this._overlay || !dock.includes(this._overlay)) this._overlay = this._defaultOverlay();
    const net = this._ov("network");
    this._net = {
      layer: (this._net && this._net.layer) || "default",
      links: net.links !== false,
      hubs: net.hub_links !== false,
      minLqi: Number(net.min_lqi || 0),
      legend: net.legend !== false,
    };
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
    this._subscribe();
    this._fromUrl();
    this._update(true);
  }

  disconnectedCallback() {
    this._connected = false;
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
    if (!o) return;
    const card = q.get("card");
    if (card && card !== this._config.card_id) return;
    this._external({ card_id: this._config.card_id, overlay: o });
    // Clean the address afterwards (after every card on the view had its turn), so the same link
    // applies again next time.
    clearTimeout(_urlClean);
    _urlClean = setTimeout(() => {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("overlay")) return;
      u.searchParams.delete("overlay");
      u.searchParams.delete("card");
      window.history.replaceState(window.history.state, "", u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash);
    }, 50);
  }

  _external(d) {
    if (!this._config || !d) return;
    if (d.card_id !== undefined && d.card_id !== this._config.card_id) return;
    const o = d.action === "reset" ? "reset" : d.overlay || d.view || d.preset;
    if (!o) return;
    if (o === "reset") return this._setOverlay(this._defaultOverlay());
    this._setOverlay(o === "live_home" ? "live" : o);
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
    const list = Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...this._custom().map((c) => c.id)];
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
    const id = this._config && this._config.plan;
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
      out.push({ id, ...e, main_entity: eid, entities: [eid], standalone: true, group: "helpers" });
    }
    for (const [bid, b] of Object.entries(bonds)) {
      const groups = (b.members || []).map((m) => (a.devices || {})[m]).filter(Boolean).map((d) => d.group);
      out.push({ id: `bond:${bid}`, bond: true, name: (b.names || []).join(" + "), x: b.x, y: b.y, main_entity: (b.entities || [])[0], entities: b.entities || [], members: b.members || [], domain: b.domain, group: groups.includes("lights") || b.domain === "light" ? "lights" : groups[0] || "lights" });
    }
    return out;
  }

  _allowed(item) {
    if (item.only_main && item.main_entity) return [item.main_entity];
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
    if (item.bond) return item.domain === "cover" ? "cover" : item.domain === "switch" ? "switch" : "light";
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

  _specsFor(item, ov, q) {
    const hass = this._hass;
    const name = this._dev(item.id).name || item.name;
    const allowed = this._allowed(item);
    const cx = this._cx || { hubs: new Set(), zha: {} };
    if (ov === "live") {
      const opts = this._ov("live");
      const kinds = opts.show || LIVE_DEFAULT;
      const kind = this._mainKind(item);
      const key = LIVE_KEY[kind];
      if (!key || !kinds.includes(key)) return [];
      return [this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], kind, opts)];
    }
    if (ov === "lights") {
      const opts = this._lights();
      const kind = this._mainKind(item);
      const isLight = kind === "light" || (opts.switches !== false && (kind === "switch" || kind === "fan") && item.group === "lights");
      if (!isLight) return [];
      const spec = this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], "light", { quiet_small: false });
      if (!q && !spec.on && opts.off === "hidden") return [];
      spec.dim = !spec.on && opts.off !== "normal";
      spec.value = "";
      if (spec.on && opts.brightness && this._look().markers !== "icon") {
        const st = hass.states[item.main_entity];
        const b = st && st.attributes.brightness;
        if (num(b)) spec.value = `${Math.round((Number(b) / 255) * 100)}%`;
      }
      return [spec];
    }
    if (ov === "comfort") return this._comfortSpecs(item, name, allowed, this._ov("comfort"));
    if (ov === "security") {
      const opts = this._ov("security");
      const out = [];
      for (const eid of allowed) {
        const st = hass.states[eid];
        const k = kindOf(eid, st);
        if (!["opening", "motion", "lock", "alarm", "safety", "camera"].includes(k)) continue;
        if (k === "camera" && opts.cameras === false) continue;
        const alert = this._isOn(eid, st, k);
        if (!q && !alert && opts.show_quiet === false) continue;
        out.push({ ...this._liveSpec(item, name, eid, st, k, { values: false }), key: `${item.id}|${eid}`, ents: [eid] });
      }
      return out;
    }
    if (ov === "health") return this._healthSpecs(item, name, allowed, this._ov("health"), q);
    if (ov === "network") return this._netSpecs(item, name, cx, q);
    const def = this._ovDef(ov);
    if (def && def.custom) return this._customSpecs(item, name, allowed, def.custom, q);
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
      const spec = this._climateChip(item, name, clim, temps[0]);
      if (spec) return [spec];
    }
    if (!temps.length && !hums.length) return [];
    if (!temps.length && opts.humidity_alone === false) return [];
    const lines = [];
    if (temps[0]) lines.push(this._fmtNum(temps[0]));
    if (hums[0]) lines.push(this._fmtNum(hums[0]));
    return [this._chipSpec(item, name, { lines, ents: [...temps.slice(0, 1), ...hums.slice(0, 1)], kind: "reading" })];
  }

  /** ACs and thermostats: mode colour + icon, room temperature, target (#50). */
  _climateChip(item, name, clim, tempEid) {
    const st = this._hass.states[clim];
    if (!st) return null;
    const a = st.attributes || {};
    const cur = a.current_temperature != null ? this._attrVal(st, "current_temperature") : tempEid ? this._fmtNum(tempEid) : null;
    const mode = live(st) ? st.state : "off";
    const m = CLIMATE_MODES[mode] || CLIMATE_MODES.auto;
    let target = "";
    if (mode === "off" || !live(st)) target = live(st) ? "Off" : "Offline";
    else if (a.temperature != null) target = `→ ${this._attrVal(st, "temperature")}`;
    else if (a.target_temp_low != null && a.target_temp_high != null) target = `→ ${a.target_temp_low}–${a.target_temp_high}°`;
    else target = (this._hass.formatEntityState && this._hass.formatEntityState(st)) || mode;
    return { ...this._chipSpec(item, name, { lines: [cur || "—", target], ents: [clim], kind: "climate", icon: m.icon, cls: `clim ${mode === "off" || !live(st) ? "off" : ""}` }), color: m.color };
  }

  _healthSpecs(item, name, allowed, opts, q) {
    const hass = this._hass;
    const low = Number(opts.low ?? 20);
    const bat = (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && item.roles.battery) || allowed.find((eid) => kindOf(eid, hass.states[eid]) === "battery");
    const mainSt = hass.states[item.main_entity];
    const unavailable = item.main_entity && !live(mainSt) && !item.bond;
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
    const show = this._net.layer !== "default" ? [this._net.layer] : Array.isArray(opts.connections) && opts.connections.length && !opts.connections.includes("all") ? opts.connections : CONN_ORDER;
    const visible = conns.filter((c) => show.includes(c));
    if (!visible.length) return [];
    const conn = CONN_ORDER.find((c) => visible.includes(c));
    const z = conns.includes("zigbee") && item.ieee ? cx.zha[ieeeKey(item.ieee)] : null;
    const mainSt = hass.states[item.main_entity];
    const unavailable = (z && !z.available) || (!z && item.main_entity && !live(mainSt) && !item.bond);
    let role = z && z.role ? z.role : cx.hubs.has(item.id) ? "hub" : conns.includes("zigbee") ? "end" : "device";
    if (unavailable) role = "unavailable";
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

  _customSpecs(item, name, allowed, def, q) {
    const kinds = Array.isArray(def.kinds) ? def.kinds : [];
    const kind = this._mainKind(item);
    const key = LIVE_KEY[kind];
    if ((key && kinds.includes(key)) || this._added(item, def.id)) {
      if (!item.main_entity) return [];
      return [this._liveSpec(item, name, item.main_entity, this._hass.states[item.main_entity], kind, {})];
    }
    if (kinds.includes("temperature") || kinds.includes("humidity")) {
      const c = this._comfortSpecs(item, name, allowed, { humidity: kinds.includes("humidity"), humidity_alone: kinds.includes("humidity"), climate: kinds.includes("temperature") });
      const keep = c.filter((s) => kinds.includes("temperature") || s.kind !== "climate");
      if (keep.length) return keep;
    }
    if (kinds.includes("battery")) return this._healthSpecs(item, name, allowed, { low: 20 }, q).filter((s) => !s.lines || s.lines[0] !== "Offline");
    return [];
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
    return s === "on" || s === "open" || s === "detected";
  }

  _liveSpec(item, name, eid, st, kind, opts) {
    const hass = this._hass;
    const look = this._look();
    let on = false;
    let value = "";
    let color = "var(--dfc-accent)";
    if (item.bond) {
      const sts = item.entities.map((e) => hass.states[e]).filter(Boolean);
      const n = sts.filter((s) => this._isOn(s.entity_id, s, kind)).length;
      on = n > 0;
      if (n && n < sts.length) value = `${n}/${sts.length}`;
    } else {
      on = this._isOn(eid, st, kind);
      if (kind === "climate" && st && st.attributes.current_temperature != null) value = this._attrVal(st, "current_temperature");
      if (kind === "climate") color = st && CLIMATE_MODES[st.state] ? CLIMATE_MODES[st.state].color : color;
    }
    if (kind === "motion") color = "#43a047";
    if (kind === "opening") color = "#fb8c00";
    if (kind === "safety" || kind === "alarm") color = "#e53935";
    if (kind === "lock" && on) color = "#e53935";
    const dim = !on && ["opening", "motion", "safety"].includes(kind) && opts.quiet_small !== false;
    const unavail = !item.bond && !live(st);
    const showVal = look.markers !== "icon" && opts.values !== false;
    return { key: item.id, type: "marker", item, name, ents: item.bond ? item.entities : [eid], eid, st, kind, on, dim, unavail, color, value: showVal ? value : "", icon: this._dev(item.id).icon, x: item.x, y: item.y };
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
    const parts = [sensor ? sensor.last_updated : "none", this._overlay, this._img || "", this._imgFailed ? 1 : 0, JSON.stringify(this._popup || null), this._menu ? 1 : 0, JSON.stringify(this._net || {}), this._zha ? this._zhaAt : 0, this._hass.themes && this._hass.themes.darkMode ? 1 : 0];
    // Only the entities the current overlay reads; a power sensor ticking elsewhere changes nothing.
    for (const eid of this._watch || []) {
      const st = this._hass.states[eid];
      if (!st) {
        parts.push("-");
        continue;
      }
      const a = st.attributes || {};
      parts.push(`${st.state}|${a.brightness ?? ""}|${a.current_temperature ?? ""}|${a.temperature ?? ""}|${a.target_temp_low ?? ""}|${a.target_temp_high ?? ""}|${a.current_humidity ?? ""}`);
    }
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
    const ents = new Set(item.bond ? item.entities : []);
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
      this.shadowRoot.innerHTML = `${style}<ha-card><div class="msg">Plan “${cesc(c.plan)}” not found. Check the plan id, or open the Floorplan Editor in the sidebar.</div></ha-card>`;
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
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const specs = this._markers(a);
    this._specs = new Map(specs.map((s) => [s.key, s]));
    this._a = a;
    const watch = new Set();
    if (ov !== "plan") for (const item of this._items(a)) if (!this._hidden(item, ov)) for (const e of this._reads(item, ov)) watch.add(e);
    for (const s of specs) for (const e of s.ents || []) watch.add(e);
    if (ov === "lights") for (const sc of this._lights().scenes || []) for (const e of sc.lights || []) watch.add(e);
    this._watch = [...watch].sort();
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    const nNew = Number((this._hass.states["sensor.device_floorplan_new_devices"] || {}).state) || 0;
    const admin = isAdmin && nNew > 0 && !c.hide_admin_hint ? `<button class="admin" data-new="1" title="Only admins see this">${nNew} new · Place them</button>` : "";
    const names = look.names === "always" ? "names-always" : look.names === "off" ? "names-off" : "";
    const dock = this._overlays();
    const labels = c.overlay_names || {};
    const vertical = btn.position === "left" || btn.position === "right";
    const dockShown = dock.length > 1 && btn.position !== "hidden";
    // Layers live in the button bar, never on the plan (#63); without a bar, in the legend row.
    const layersOn = ov === "network" && this._ov("network").layers !== false;
    const dockHtml = dockShown
      ? `<div class="dockrow"><nav class="dock ${btn.style === "icons" ? "icons" : ""}" aria-label="Overlays" ${vertical ? 'aria-orientation="vertical"' : ""}>${dock.map((o) => {
        const d = this._ovDef(o);
        const label = labels[o] || d.label;
        return `<button class="${o === ov ? "on" : ""}" data-ov="${cesc(o)}" aria-pressed="${o === ov}" title="${cesc(label)}"><ha-icon icon="${cesc(d.icon)}"></ha-icon><span>${cesc(label)}</span></button>`;
      }).join("")}${layersOn ? `<span class="sep" aria-hidden="true"></span>${this._layersBtn()}` : ""}</nav></div>`
      : "";
    const title = look.title !== false && c.title ? `<div class="hdr">${cesc(c.title)}</div>` : "";
    let emptyMsg = "";
    if (ov !== "plan" && !specs.length) {
      let t = "Nothing to show in this overlay";
      if (ov === "health" && this._ov("health").only_problems) t = "All good: no low batteries or offline devices";
      if (ov === "network" && this._ov("network").only_weak) t = `No weak or fair signals.${this._skippedUnknown ? ` ${this._skippedUnknown} device${this._skippedUnknown > 1 ? "s have" : " has"} no known signal: Zigbee comes from ZHA, others need their signal sensor enabled in Home Assistant.` : ""}`;
      if (ov === "lights" && this._lights().off === "hidden") t = "All lights are off";
      emptyMsg = `<div class="empty">${cesc(t)}</div>`;
    }
    const pos = btn.position === "hidden" ? "bottom" : btn.position;
    this.shadowRoot.innerHTML = `${style}<ha-card class="dock-${pos}" style="--dfc-size:${Number(look.size) || 34}px;${chipVars}${roomVars}">
      <div class="main">${title}${admin}
        <div class="wrap ${names}"><div class="box" style="--ratio:${ratio}">
          ${this._img ? `<img class="plan" src="${cesc(this._img)}" alt="${cesc(a.plan_name || "")}" draggable="false">` : ""}
          ${this._roomsHtml(a)}
          <svg class="lines"></svg>
          ${specs.map((s) => (s.type === "chip" ? this._chipHtml(s) : this._markerHtml(s))).join("")}${emptyMsg}
        </div></div>
        ${ov === "lights" ? this._sceneBarHtml(specs) : ""}${ov === "network" ? this._legendHtml(specs, layersOn && !dockShown) : ""}
      </div>${dockHtml}${layersOn && this._menu ? this._layersMenu(a) : ""}${this._popupHtml()}</ha-card>`;
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
    const pos = this._buttons().position;
    let x;
    let y;
    if (pos === "left") {
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

  _loadZha() {
    if (!this._hass.user || !this._hass.user.is_admin || this._zhaBusy) return;
    if (this._zha && Date.now() - this._zhaAt < 120000) return;
    this._zhaBusy = true;
    zhaDevices(this._hass).then((d) => {
      this._zhaBusy = false;
      if (!d) return;
      this._zha = d;
      this._zhaAt = Date.now();
      if (this._overlay === "network") this._update(true);
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
      const cls = ["m", "net", r.shape, s.role].join(" ");
      return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-fill:${r.color};--dfc-ring:${s.ring || "transparent"}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.conns.map((c) => CONNS[c].label).join(", ")}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon></span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}<span class="tip">${cesc(s.name)}</span></button>`;
    }
    const icon = s.icon
      ? `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`
      : s.eid && this._hass.states[s.eid]
        ? `<ha-state-icon data-ent="${cesc(s.eid)}"></ha-state-icon>`
        : `<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
    const cls = ["m", s.kind, s.on ? "on" : "off", s.dim ? "dim" : "", s.unavail ? "unavail" : ""].join(" ");
    const bond = s.item.bond ? `<span class="bn">×${s.ents.length}</span>` : "";
    const label = `${s.name}${s.st ? ` · ${this._fmt(s.eid)}` : ""}`;
    return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(label)}"><span class="ic">${icon}${bond}</span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}<span class="tip">${cesc(s.name)}</span></button>`;
  }

  _chipHtml(s) {
    const first = s.icon ? `<span class="ico"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.lines[0] || "")}</span>` : `<span class="l1">${cesc(s.lines[0] || "")}</span>`;
    return `<button class="chip ${s.cls}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}">${first}${s.lines[1] ? `<span class="l2">${cesc(s.lines[1])}</span>` : ""}<span class="tip">${cesc(s.name)}</span></button>`;
  }

  /** Connections present on this plan (for the layers menu). */
  _connsPresent(a) {
    const set = new Set();
    for (const s of (this._specs || new Map()).values()) for (const cn of s.conns || []) set.add(cn);
    for (const d of Object.values(a.devices || {})) for (const cn of d.conns || []) if (CONNS[cn]) set.add(cn);
    return CONN_ORDER.filter((cn) => set.has(cn));
  }

  _layersBtn() {
    return `<button class="layers ${this._menu ? "on" : ""}" data-menu="1" title="Layers" aria-label="Layers" aria-expanded="${this._menu}"><ha-icon icon="mdi:layers-outline"></ha-icon><span>Layers</span></button>`;
  }

  _layersMenu(a) {
    const present = this._connsPresent(a);
    const n = this._net;
    const eye = (on) => `<ha-icon class="eye" icon="${on ? "mdi:radiobox-marked" : "mdi:radiobox-blank"}"></ha-icon>`;
    const tick = (on) => `<ha-icon class="eye" icon="${on ? "mdi:eye" : "mdi:eye-off-outline"}"></ha-icon>`;
    const layer = (id, label, icon) => `<button class="${n.layer === id ? "on" : ""}" data-layer="${id}">${eye(n.layer === id)}<ha-icon icon="${icon}"></ha-icon>${cesc(label)}</button>`;
    const hasZ = present.includes("zigbee");
    return `<div class="lmenu" role="menu" style="visibility:hidden"><h4>Show on the plan</h4>
      ${layer("default", "Default", "mdi:star-outline")}
      ${present.map((cn) => layer(cn, CONNS[cn].label, CONNS[cn].icon)).join("")}
      <hr>
      ${hasZ ? `<button class="${n.links ? "on" : ""}" data-tg="links">${tick(n.links)}Zigbee links</button>` : ""}
      <button class="${n.hubs ? "on" : ""}" data-tg="hubs">${tick(n.hubs)}Hub / bridge links</button>
      <button class="${n.legend ? "on" : ""}" data-tg="legend">${tick(n.legend)}Legend</button>
      ${hasZ ? `<div class="sl"><div><span>Minimum LQI</span><b>${n.minLqi}</b></div><input type="range" min="0" max="250" step="5" value="${n.minLqi}" data-minlqi="1" aria-label="Minimum LQI"></div>` : ""}
    </div>`;
  }

  _legendHtml(specs, withLayers) {
    const items = [];
    if (this._net.legend && specs.length) {
      const roles = new Set(specs.map((s) => s.role));
      const order = ["coordinator", "router", "hub", "end", "device", "unavailable"];
      items.push(...order.filter((r) => roles.has(r)).map((r) => `<span><i class="${ROLES[r].shape}" style="background:${ROLES[r].color}"></i>${ROLES[r].label}</span>`));
      if (specs.some((s) => s.z && s.z.lqi != null)) items.push(`<span>LQI ${LQI_BANDS.slice().reverse().map((b) => `<i class="ring" style="border-color:${b.color}"></i>${b.label}`).join(" ")}</span>`);
      if (this._net.hubs && specs.some((s) => s.item.via && this._specs.has(s.item.via))) items.push(`<span><i class="dash"></i>through hub / bridge</span>`);
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
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lqiColor(l.lqi)}" stroke-width="2" opacity=".6"/>`;
      }
    }
    if (this._net.hubs) {
      for (const s of specs) {
        const parent = s.item.via && this._specs.get(s.item.via);
        if (!parent || parent.type !== "net") continue;
        if (s.conns.includes("zigbee") && parent.conns.includes("zigbee")) continue;
        const [x1, y1] = P(s);
        const [x2, y2] = P(parent);
        out += `<line class="hub" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }
    }
    return out;
  }

  // ------------------------------------------------------------- actions
  _tapAction(s) {
    if (s.type === "net") return "network";
    const o = this._dev(s.item.id);
    if (o.tap) return o.tap;
    const taps = { ...TAP_DEFAULT, ...(this._config.tap || {}) };
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    const act = taps[k] || "more-info";
    if (act === "toggle" && !s.ents.some((e) => TOGGLE_DOMAINS.has(domainOf(e)))) return "more-info";
    return act;
  }

  _onClick(e) {
    const t = e.target;
    const ov = t.closest("[data-ov]");
    if (ov) return this._setOverlay(ov.dataset.ov);
    if (t.closest("[data-menu]")) {
      this._menu = !this._menu;
      return this._update(true);
    }
    const ly = t.closest("[data-layer]");
    if (ly) {
      this._net = { ...this._net, layer: ly.dataset.layer };
      return this._update(true);
    }
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
    const k = t.closest("[data-k]");
    if (!k) return;
    if (this._held) {
      this._held = false;
      return;
    }
    const s = this._specs && this._specs.get(k.dataset.k);
    if (!s) return;
    const act = this._tapAction(s);
    if (act === "none") return;
    if (act === "network") {
      this._popup = { type: "net", key: s.key };
      return this._update(true);
    }
    if (act === "toggle") return this._toggle(s);
    if (act === "readings") return this._openReadings(s);
    if (s.item.bond) return this._openList(s);
    this._moreInfo(s.ents[0]);
  }

  _onInput(e) {
    const t = e.target;
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
      return `<div class="pop"><div class="popin"><h3>${cesc(s.name)}${close}</h3><div class="list">${s.ents.map((e) => {
        const st = this._hass.states[e];
        return `<button data-mi="${cesc(e)}">${cesc((st && st.attributes.friendly_name) || e)}<small>${cesc(this._fmt(e))}</small></button>`;
      }).join("")}</div></div></div>`;
    }
    if (p.type === "net") {
      const rows = [["Connection", s.conns.map((cn) => CONNS[cn].label).join(" + ")], ["Role", (ROLES[s.role] || ROLES.device).label]];
      if (s.z && s.z.lqi != null) rows.push(["LQI", String(s.z.lqi)]);
      if (s.z && s.z.rssi != null) rows.push(["RSSI", `${s.z.rssi} dBm`]);
      if (s.sigEid) rows.push(["Signal", this._fmt(s.sigEid)]);
      if (s.item.parts && s.item.parts.length) rows.push(["Includes", s.item.parts.join(", ")]);
      const parent = s.item.via && this._specs.get(s.item.via);
      if (parent) rows.push(["Through", parent.name]);
      const none = !(s.z && (s.z.lqi != null || s.z.rssi != null)) && !s.sigEid;
      const hint = none ? `<div style="font-size:12px;color:var(--secondary-text-color)">${s.conns.includes("zigbee") ? "No link quality known yet (ZHA data is loaded for admins)." : "No signal value: enable this device's signal sensor in Home Assistant to see it here."}</div>` : "";
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.name)}${close}</h3><div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>${hint}${s.ents[0] ? `<button class="more" data-mi="${cesc(s.ents[0])}">Details ›</button>` : ""}</div></div>`;
    }
    const rows = p.ents.map((e) => {
      const st = this._hass.states[e];
      const k = domainOf(e) === "climate" ? "temperature" : kindOf(e, st);
      const icon = { temperature: "mdi:thermometer", humidity: "mdi:water-percent", battery: "mdi:battery", signal: "mdi:signal" }[k] || "mdi:chart-line";
      const label = { temperature: "Temperature", humidity: "Humidity", battery: "Battery", signal: "Signal" }[k] || (st && st.attributes.friendly_name) || e;
      const big = domainOf(e) === "climate" && st ? this._attrVal(st, "current_temperature") : this._fmtNum(e);
      return `<div class="rd" data-hist="${cesc(e)}"><div class="top"><ha-icon icon="${icon}"></ha-icon>${cesc(label)}<span class="big">${cesc(big)}</span></div><svg viewBox="0 0 300 56" preserveAspectRatio="none"></svg><div class="mm"><span>24 h ago</span><span class="range"></span><span>now</span></div><button class="more" data-mi="${cesc(e)}">Details ›</button></div>`;
    }).join("");
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3>${cesc(s.name)}${close}</h3>${rows}</div></div>`;
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
.dfe .note { font-size: 12px; color: var(--secondary-text-color); }
.dfe .sub { margin: 14px 0 10px; padding-left: 4px; }
.dfe .sub h5 { margin: 0 0 2px; font-size: 14px; font-weight: 500; display:flex; align-items:center; gap:8px; --mdc-icon-size: 18px; }
.dfe [data-form="general"] { margin-bottom: 4px; }
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

  _plan() {
    return planSensors(this._hass).find((s) => s.attributes.plan_id === this._config.plan) || null;
  }

  /** A card instance (not on screen) that answers "does this device show in that overlay?". */
  _engine(reset = false) {
    if (!this._eng || reset) {
      this._eng = document.createElement("device-floorplan-card");
      try {
        this._eng.setConfig({ ...this._config, plan: this._config.plan || "-" });
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
    return [...OVERLAY_ORDER.map((o) => ({ value: o, label: OVERLAYS[o].label })), ...this._custom().map((c) => ({ value: c.id, label: c.name || "Custom" }))];
  }

  /** The editor's settings forms, in display order (#70). */
  _schemas() {
    const plans = planSensors(this._hass).map((s) => ({ value: s.attributes.plan_id, label: s.attributes.plan_name || s.attributes.plan_id }));
    const ovOpts = this._ovOptions();
    const conns = [{ value: "all", label: "All connections" }, ...CONN_ORDER.map((c) => ({ value: c, label: CONNS[c].label }))];
    return {
      general: [
        { name: "plan", required: true, selector: { select: { options: plans, mode: "dropdown" } } },
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
        { type: "expandable", name: "comfort", title: "Comfort", icon: OVERLAYS.comfort.icon, schema: [{ name: "humidity", selector: { boolean: {} } }, { name: "humidity_alone", selector: { boolean: {} } }, { name: "climate", selector: { boolean: {} } }] },
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
      show: "Show", quiet_small: "Closed doors and idle sensors: small and faint", values: "Values next to icons (thermostat temperature, open lamps)",
      switches: "Include switches and plugs that run lights", brightness: "Show brightness of lights that are on", off: "Lights that are off", all_off: "“All off” button", all_on: "“All on” button",
      humidity: "Show humidity", humidity_alone: "Also devices with humidity only", climate: "ACs and thermostats as climate chips (mode, room temperature, target)",
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
      overlays: [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)],
      default_overlay: "live",
      ...c,
      buttons_position: b.position || (look.dock === "hidden" ? "hidden" : "bottom"),
      buttons_style: b.style || (look.dock === "icons" ? "icons" : "labels"),
      live: { show: LIVE_DEFAULT, quiet_small: true, values: true, ...(c.live || {}) },
      lights: { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, ...(c.lights || {}) },
      comfort: { humidity: true, humidity_alone: true, climate: true, ...(c.comfort || {}) },
      security: { show_quiet: true, quiet_small: true, cameras: true, ...(c.security || {}) },
      network: { connections: ["all"], layers: true, links: true, min_lqi: 0, hub_links: true, legend: true, labels: false, only_weak: false, ...(c.network || {}) },
      health: { low: 20, only_problems: false, ...(c.health || {}) },
      tap: { ...TAP_DEFAULT, ...(c.tap || {}) },
      look: { size: 34, chips: "dark", names: c.names || "hover", markers: look.markers || (look.values === false || c.show_states === false ? "icon" : "icon_text"), ...look, show_title: look.title !== false },
      overlay_names: { ...(c.overlay_names || {}) },
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
    for (const k of ["live", "lights", "comfort", "security", "network", "health", "tap", "look", "overlay_names", "rooms", "buttons"]) {
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
    for (const k of ["title", "card_id"]) if (!out[k]) delete out[k];
    if (out.devices && !Object.keys(out.devices).length) delete out.devices;
    return out;
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) {
      this._built = true;
      const sec = (icon, title, p, inner) => `<h4><ha-icon icon="${icon}"></ha-icon>${title}</h4>${p ? `<p>${p}</p>` : ""}${inner}`;
      this.innerHTML = `<style>${ED_CSS}</style><div class="dfe">
        <div data-form="general"></div>
        ${sec("mdi:gesture-tap-button", "Overlay buttons on the card", "Which buttons, their order, where they sit and how they look.", `<div data-form="buttons"></div>`)}
        ${sec("mdi:layers-outline", "Overlays", "What each overlay shows.", `<div data-form="overlaysA"></div>
          <div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes</h5><p>Buttons in the Lights overlay. Stored in this card only, nothing is created in Home Assistant.</p><div id="scenes"></div></div>
          <div data-form="overlaysB"></div>
          <div class="sub"><h5><ha-icon icon="mdi:layers-plus"></ha-icon>Custom overlays</h5><p>Your own overlay buttons, e.g. “Downstairs lights” or “Plants”: pick the kinds of devices it shows, and add single devices in the device list below.</p><div id="custom"></div></div>`)}
        ${sec("mdi:texture-box", "Rooms", "Room names from the Floorplan Editor, shown on the plan.", `<div id="rooms"></div>`)}
        ${sec("mdi:tune-variant", "Look and tap behaviour", "", `<div data-form="look"></div>`)}
        ${sec("mdi:devices", "Devices on the plan", "Per device: icon, name, tap action, and in which overlays it shows. The icons on each row are the overlays it appears in.", `<div class="flts"><input class="flt" id="flt" placeholder="Filter devices…"><select class="flt" id="fov"></select></div><div id="devs"></div>`)}
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
      this.querySelector("#flt").addEventListener("input", (e) => {
        this._flt = e.target.value.toLowerCase();
        this._renderDevices();
      });
      this.querySelector("#fov").addEventListener("change", (e) => {
        this._fov = e.target.value;
        this._renderDevices();
      });
    }
    this._engine(true);
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
        { name: "kinds", selector: { select: { options: Object.entries(CUSTOM_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } },
      ],
      { kinds: [], ...o },
      { name: "Button name", icon: "Icon", kinds: "Shows these kinds of devices (add single devices in the list below)" },
      (v) => {
        const next = list.map((x, j) => (j === i ? { ...x, ...v, id: x.id } : x));
        this._config = this._prune({ ...this._config, custom_overlays: next });
        this._emit();
        this._engine(true);
        this._refreshForms();
        this._renderDevices();
        const hd = box.querySelector(`.row[data-i="${i}"] .hd`);
        if (hd) hd.innerHTML = `<ha-icon icon="${cesc(v.icon || "mdi:layers-outline")}"></ha-icon>${cesc(v.name || "Custom")}<small style="margin-left:auto">${cesc(o.id)}</small>`;
      },
    ));
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
    const items = eng._items(a).map((it) => ({ ...it, label: it.bond ? `${it.name} (bonded)` : it.name }));
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
    const id = this._open;
    const item = items.find((x) => x.id === id);
    const hasTemp = (item.entities || []).some((e) => kindOf(e, this._hass.states[e]) === "temperature");
    const schema = [
      { name: "icon", selector: { icon: {} } },
      { name: "name", selector: { text: {} } },
      { name: "tap", selector: { select: { options: [{ value: "default", label: "Default for its kind" }, ...TAP_OPTIONS], mode: "dropdown" } } },
    ];
    if (hasTemp) schema.push({ name: "comfort", selector: { boolean: {} } });
    const save = (patch) => {
      const cur = { ...((this._config.devices || {})[id] || {}), ...patch };
      for (const k of Object.keys(cur)) if (cur[k] === "" || cur[k] == null || cur[k] === false || (Array.isArray(cur[k]) && !cur[k].length)) delete cur[k];
      const all = { ...(this._config.devices || {}) };
      if (Object.keys(cur).length) all[id] = cur;
      else delete all[id];
      this._config = this._prune({ ...this._config, devices: all });
      this._emit();
      this._engine(true);
      const nm = box.querySelector(`.dev[data-id="${CSS.escape(id)}"] .nm`);
      if (nm) nm.textContent = cur.name || item.label;
    };
    body.appendChild(this._form(schema, { comfort: false, ...(devs[id] || {}), tap: (devs[id] || {}).tap || "default" }, { icon: "Icon (empty = Home Assistant's own; used in Live, Lights, Security and custom overlays)", name: "Name on the card", tap: "Tap action", comfort: "Use its temperature in Comfort (even if it's a device's internal sensor)" }, (v) => save({ icon: v.icon, name: v.name, tap: v.tap === "default" ? "" : v.tap, comfort: v.comfort })));
    // "Shows in": only overlays this device can appear in; turned-off overlays aren't listed.
    const shows = document.createElement("div");
    shows.className = "shows";
    const rows = [];
    for (const o of ovs) {
      const def = eng._ovDef(o);
      eng._ignoreAdded = true;
      const q = eng._qualifies(item, o, a);
      eng._ignoreAdded = false;
      const offlineOnly = o === "health" && q && eng._specsFor(item, o, true).every((s) => s.offlineOnly);
      if (q) rows.push({ o, def, mode: "hide", on: !eng._hidden(item, o), note: offlineOnly ? "only when offline" : "" });
      else if (def.custom) rows.push({ o, def, mode: "add", on: eng._added(item, o) });
    }
    shows.innerHTML = `<h5>Shows in</h5>${rows.length ? rows.map((r) => `<div class="sw"><span><ha-icon icon="${cesc(r.def.icon)}"></ha-icon>${cesc(r.def.label)}${r.mode === "add" ? " <small>(add by hand)</small>" : r.note ? ` <small>(${cesc(r.note)})</small>` : ""}</span><ha-switch data-sw="${cesc(r.o)}" data-mode="${r.mode}"></ha-switch></div>`).join("") : `<p>This device doesn't appear in any overlay on this card.</p>`}`;
    rows.forEach((r) => {
      const sw = shows.querySelector(`ha-switch[data-sw="${CSS.escape(r.o)}"]`);
      sw.checked = r.on;
      sw.addEventListener("change", () => {
        const cur = (this._config.devices || {})[id] || {};
        if (r.mode === "hide") {
          const set = new Set(cur.hide_in || []);
          if (sw.checked) set.delete(r.o);
          else set.add(r.o);
          save({ hide_in: [...set] });
        } else {
          const set = new Set(cur.add_to || []);
          if (sw.checked) set.add(r.o);
          else set.delete(r.o);
          save({ add_to: [...set] });
        }
        const row = box.querySelector(`.dev[data-id="${CSS.escape(id)}"] .ovs`);
        if (row) {
          const now = info(item);
          row.innerHTML = now.map((x) => `<ha-icon class="${x.hidden ? "off" : ""}" icon="${cesc(eng._ovDef(x.o).icon)}"></ha-icon>`).join("");
        }
      });
    });
    body.appendChild(shows);
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
console.info(`%c DEVICE-FLOORPLAN-CARD %c ${CARD_VERSION} `, "background:#03a9f4;color:#fff;border-radius:3px 0 0 3px", "background:#555;color:#fff;border-radius:0 3px 3px 0");
