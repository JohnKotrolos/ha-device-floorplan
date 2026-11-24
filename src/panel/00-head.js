/*
 * Device Floorplan – planner panel (v0.5.1).
 * Plain web component, no build step. Talks to the integration through
 * hass.callWS and uploads images through the authenticated HTTP endpoint.
 */

const WS = "device_floorplan";
const VERSION = "0.13.9.10";

/** Colour temperature (K) → rgb (Tanner Helland approximation), for light colours (#112). */
function kelvinRgb(k) {
  const t = Math.max(1000, Math.min(12000, k)) / 100;
  const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
  const r = t <= 66 ? 255 : c(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66 ? c(99.4708025861 * Math.log(t) - 161.1195681661) : c(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return [r, g, b];
}

/** A stored light colour ("k:2700" / "#ffaa00") → css colour, or null for Auto. */
function lightCss(col) {
  if (!col || col === "auto") return null;
  if (col.startsWith("#")) return col;
  if (col.startsWith("k:")) return `rgb(${kelvinRgb(Number(col.slice(2)) || 3000).join(",")})`;
  return null;
}
const DOCS = "https://johnkotrolos.github.io/ha-device-floorplan/";
const LS = "device_floorplan_";
// 0.11: the Energy overlay's two points, placed like devices (Step 3 → Energy points).
const EPTS = { __energy_panel: ["Electrical panel", "Where your electrical panel / house meter is: every device's flow line goes here."], __energy_source: ["Solar", "Where your solar inverter is: the solar flow starts here."], __energy_battery: ["Battery", "Where your home battery is: the battery flow starts here."] };
const EPT_ICON = { __energy_panel: "mdi:flash", __energy_source: "mdi:solar-power-variant", __energy_battery: "mdi:home-battery" };
// Until the 0.11 release: offer the dummy points even when a real one exists (for the release screenshots).
const STATIC = "/device_floorplan_static";
const BRANDS = "https://brands.home-assistant.io/_";

const CONN = {
  zigbee: { label: "Zigbee", short: "ZB", color: "#d97706" },
  network: { label: "Wi-Fi / Ethernet", short: "Wi-Fi", color: "#2563eb" },
  bluetooth: { label: "Bluetooth", short: "BT", color: "#7c3aed" },
  matter: { label: "Matter / Thread", short: "Matter", color: "#0f766e" },
  zwave: { label: "Z-Wave", short: "Z-Wave", color: "#be185d" },
  other: { label: "Other / cloud", short: "Other", color: "#6b7280" },
};
const CONN_ORDER = ["zigbee", "network", "bluetooth", "matter", "zwave", "other"];

/** 0.12.1: the one category list (Floorplan Editor, card), in its agreed order. */
const GROUPS = {
  lights: ["Lights", "mdi:lightbulb-outline"],
  plugs_switches: ["Switches & plugs", "mdi:power-socket-eu"],
  climate: ["Climate", "mdi:thermostat"],
  covers: ["Covers", "mdi:window-shutter"],
  contacts: ["Doors & windows", "mdi:door"],
  motion: ["Motion & presence", "mdi:motion-sensor"],
  security: ["Security", "mdi:shield-home-outline"],
  safety: ["Safety", "mdi:smoke-detector-variant"],
  cameras: ["Cameras", "mdi:cctv"],
  media: ["Media & screens", "mdi:television"],
  appliances: ["Appliances", "mdi:washing-machine"],
  moving: ["Moving things", "mdi:robot-vacuum"],
  sensors: ["Sensors", "mdi:thermometer"],
  energy: ["Energy", "mdi:lightning-bolt"],
  garden: ["Water & garden", "mdi:sprinkler-variant"],
  buttons: ["Buttons & remotes", "mdi:gesture-tap-button"],
  network: ["Network & repeaters", "mdi:router-wireless"],
  computers: ["Computers & servers", "mdi:server"],
  helpers: ["Helpers & entities", "mdi:tune-variant"],
  other: ["Other", "mdi:devices"],
};

/** 0.12.2: the built-in picture library (frontend/pictures/<name>.webp), grouped for the picker. */
const PIC_LIB = {
  "Climate & air": ["ac-wall", "ac-ceiling-cassette", "fan-ceiling", "air-purifier", "radiator"],
  "Media & network": ["tv-wall", "tv-stand", "soundbar", "speaker-smart", "projector", "streaming-box", "router", "access-point-ceiling", "hub-box", "nas", "server-mini"],
  Lights: ["light-ceiling", "light-pendant", "lamp-floor", "lamp-desk", "lamp-table"],
  "Kitchen & appliances": ["washing-machine", "dishwasher", "fridge", "cooktop", "range-hood", "coffee-machine", "printer-3d", "printer-3d-filament-unit", "pet-feeder", "aquarium"],
  "Moving things": ["robot-vacuum", "robot-vacuum-dock", "lawn-mower-robot", "car-sedan", "car-suv", "car-offroad", "car-pickup", "car-sedan-dashed", "car-suv-dashed", "motorcycle", "bicycle"],
  Security: ["camera-bullet"],
  Plants: ["plant-flowers", "plant-cactus"],
  Christmas: ["tree-green", "tree-green-small", "tree-decorated", "tree-decorated-small", "tree-white", "tree-white-small", "tree-white-decorated", "tree-white-decorated-small"],
  "Outside": ["solar-panels", "pool", "hot-tub", "grill", "plant-irrigation"],
};
const PIC_LOOKS = [["full", "Full picture"], ["faint", "Faint picture"], ["outline", "Outline"], ["dotted", "Dotted outline"], ["hidden", "Hidden"]];
const PIC_DEF = { on: "full", off: "faint", un: "dotted" };
const picName = (n) => n.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** 0.12.2: trace a picture's outline from its transparency: from the centre, the farthest solid pixel in 72
 *  directions (a star polygon, 0..100 of the picture box). Good for the mostly round / boxy shapes of devices. */
async function tracePic(url) {
  const im = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Could not read that picture"));
    i.src = url;
  });
  const W = im.naturalWidth;
  const H = im.naturalHeight;
  const S = 160 / Math.max(W, H);
  const w = Math.max(8, Math.round(W * S));
  const h = Math.max(8, Math.round(H * S));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext("2d");
  cx.drawImage(im, 0, 0, w, h);
  let px;
  try {
    px = cx.getImageData(0, 0, w, h).data;
  } catch (_e) {
    return { ar: W / H, outline: null };
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 40;
  const pts = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let last = 0;
    for (let r = 0; r < Math.hypot(w, h); r += 0.5) {
      if (solid(Math.round(w / 2 + dx * r), Math.round(h / 2 + dy * r))) last = r;
    }
    pts.push([+(((w / 2 + dx * last) / w) * 100).toFixed(1), +(((h / 2 + dy * last) / h) * 100).toFixed(1)]);
  }
  return { ar: +(W / H).toFixed(4), outline: pts };
}

/** 0.12.1: "Acts as" (light / switch / fan) ↔ category. */
const AS_CAT = { light: "lights", switch: "plugs_switches", fan: "climate" };
const CAT_AS = { lights: "light", plugs_switches: "switch", climate: "fan" };

const STATUSES = [
  ["unplaced", "To place"],
  ["approx", "Approx"],
  ["placed", "Placed"],
  ["elsewhere", "On another floor"],
  ["new", "New"],
  ["skipped", "Skipped"],
];

/** 0.10.2: readable text for any error HA hands back ({code, message}, a number, a string). */
const errText = (e) => (e && (e.message || e.code)) || (typeof e === "string" || typeof e === "number" ? String(e) : "Connection to Home Assistant was lost.");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 0.7.4: TV glow: the light leaves the whole screen (a line) and widens into the room.
 *  x/y in % of the image; reach r in % of the width; spread a in degrees; it faces (tx, ty). */
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
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

function lsGet(key, dflt) {
  try {
    const v = window.localStorage.getItem(LS + key);
    return v === null ? dflt : JSON.parse(v);
  } catch (_e) {
    return dflt;
  }
}
function lsSet(key, val) {
  try {
    window.localStorage.setItem(LS + key, JSON.stringify(val));
  } catch (_e) {
    /* storage unavailable */
  }
}

const SVG = {
  robot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="8.5" r="2"/><path d="M7 15.5h10"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/></svg>',
  glue: '<svg viewBox="0 0 24 24"><path d="M3 5h8v14H3zM13 5h8v14h-8M11 9h2M11 15h2"/></svg>',
  magnet: '<svg viewBox="0 0 24 24"><path d="M6 3v9a6 6 0 0 0 12 0V3M6 3h4v9a2 2 0 0 0 4 0V3h4M6 7h4M14 7h4"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  skip: '<svg viewBox="0 0 24 24"><path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.2 3.2M1 1l22 22"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  okcircle: '<svg viewBox="0 0 24 24" class="fill"><circle cx="12" cy="12" r="11" fill="var(--df-ok)"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dots: '<svg viewBox="0 0 24 24" class="fill"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  ha: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
};

/** Signed URLs for plan images (they are served only to logged-in users). */
const _signed = new Map();
async function signUrl(hass, url) {
  if (!url || !url.startsWith("/api/")) return url;
  const hit = _signed.get(url);
  if (hit && hit.until > Date.now()) return hit.path;
  const res = await hass.callWS({ type: "auth/sign_path", path: url, expires: 24 * 3600 });
  _signed.set(url, { path: res.path, until: Date.now() + 23 * 3600 * 1000 });
  return res.path;
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

const STYLE = `
:host { display:block; height:100%; color: var(--primary-text-color); background: var(--primary-background-color);
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif);
  --df-primary: var(--primary-color, #03a9f4); --df-card: var(--card-background-color, #fff);
  --df-div: var(--divider-color, #e0e3e7); --df-sec: var(--secondary-text-color, #5f6368);
  --df-tint: color-mix(in srgb, var(--df-primary) 12%, var(--df-card));
  --df-ok: var(--success-color, #2e7d32); --df-warn: var(--warning-color, #d97706);
  --df-ok-tint: color-mix(in srgb, var(--df-ok) 12%, var(--df-card));
  --df-hover: color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
svg.fill { fill: currentColor; stroke: none; }
.app { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
header { display:flex; flex-wrap:wrap; align-items:center; gap: 8px 16px; padding: 8px 12px 8px 4px; background: var(--app-header-background-color, var(--df-card)); color: var(--app-header-text-color, var(--primary-text-color)); border-bottom: 1px solid var(--df-div); }
header h1 { margin:0; font-size: 20px; font-weight: 400; white-space: nowrap; }
header h1 .ver { font-size: 12px; color: var(--df-sec); font-weight: 400; margin-left: 4px; }
.menu-btn { width:40px; height:40px; border:0; background:transparent; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.tabs { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
.tab { border:0; background:transparent; border-radius:8px; padding:7px 12px; cursor:pointer; font-size:14px; }
.tab.on { background: var(--df-tint); color: var(--df-primary); font-weight:500; }
.tab small { color: var(--df-sec); margin-left: 4px; font-size: 11px; }
.tab.new { border: 1px dashed var(--df-div); }
.hdr-right { margin-left:auto; display:flex; align-items:center; gap:4px; }
.iconbtn { width:38px; height:38px; border:0; background:transparent; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color: var(--primary-text-color); }
.iconbtn:hover { background: var(--df-hover); }
.iconbtn[disabled] { opacity: .35; cursor: default; }
.save { font-size: 13px; color: var(--df-ok); padding: 0 6px; white-space:nowrap; display:inline-grid; justify-items:end; }
.save > span { grid-area: 1 / 1; }
.save .svk { visibility: hidden; }
.save.busy { color: var(--df-sec); }
.save.err { color: var(--error-color, #b3261e); }
.toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding: 8px 16px; background: var(--df-card); border-bottom: 1px solid var(--df-div); }
.toolbar .guidelink { margin-left:auto; }
.toolbar .btn svg, .acts .btn svg { width:18px; height:18px; fill:none; stroke: currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.steps { display:flex; gap:4px; background: var(--primary-background-color); border-radius:10px; padding:4px; flex-wrap:wrap; }
.step { display:flex; align-items:center; gap:8px; border:0; background:transparent; border-radius:7px; padding:7px 12px; font-size:14px; cursor:pointer; }
.step.on { background: var(--df-card); color: var(--df-primary); font-weight:500; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.step[disabled] { opacity:.4; cursor:not-allowed; }
.num { width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; background: var(--df-div); color: var(--primary-text-color); }
.step.on .num { background: var(--df-primary); color:#fff; }
.num.done { background: var(--df-ok) !important; color:#fff !important; }
.chip-status { display:flex; align-items:center; gap:6px; font-size:13px; border-radius:16px; padding:6px 12px; background: var(--primary-background-color); color: var(--df-sec); }
.chip-status.ok { background: var(--df-ok-tint); color: var(--df-ok); }
.chip-status.warn { background: color-mix(in srgb, var(--df-warn) 15%, var(--df-card)); color: var(--df-warn); }
.placing { display:flex; align-items:center; gap:10px; font-size:13px; color:#fff; background: var(--df-primary); border-radius:8px; padding:5px 6px 5px 12px; }
.placing button { border:0; background:#fff; color: var(--df-primary); border-radius:6px; padding:5px 10px; font-size:12px; font-weight:500; cursor:pointer; }
.placing label { display:flex; align-items:center; gap:4px; font-size:12px; }
.guide { display:flex; flex-wrap:wrap; align-items:flex-start; gap:10px 14px; margin: 8px 16px 0; padding:10px 14px; border-radius:10px; background: var(--df-ok-tint); border:1px solid color-mix(in srgb, var(--df-ok) 35%, transparent); }
.guide .badge { width:28px; height:28px; border-radius:50%; background: var(--df-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; flex:none; }
.guide .badge.done { background: var(--df-ok); }
.guide .txt { flex: 1 1 360px; min-width:0; display:flex; flex-direction:column; gap:3px; }
.guide .t1 { font-size:14px; font-weight:500; }
.guide .t2 { font-size:13px; line-height:1.45; }
.guide .t3 { font-size:12px; line-height:1.4; color: var(--df-sec); }
.guide .acts { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.btn { border:1px solid var(--df-div); background: var(--df-card); border-radius:8px; padding:7px 12px; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.btn:hover { background: var(--df-hover); }
.btn.primary { border:0; background: var(--df-primary); color:#fff; font-weight:500; }
.btn.ok { border:0; background: var(--df-ok); color:#fff; font-weight:500; }
.btn.danger { color: var(--error-color, #b3261e); }
.btn.outline { border-color: var(--df-primary); color: var(--df-primary); font-weight:500; }
.link { border:0; background:transparent; color: var(--df-primary); font-size:13px; cursor:pointer; padding:4px; text-decoration: underline; }
.body { flex:1; min-height:0; display:flex; gap:12px; padding-right:16px; }
.lcol { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; }
main { flex:1; min-height:0; display:flex; gap:12px; padding:12px 0 12px 16px; overflow:hidden; }
.sidecol { flex: 0 0 360px; min-width:0; min-height:0; display:flex; flex-direction:column; gap:10px; margin: 12px 0; overflow-y:auto; overscroll-behavior:contain; }
.sidecol > .side { flex: none; overflow: visible; }
.imgtip { font-size:12px; line-height:1.4; color: var(--df-sec); padding:8px 10px; border-radius:8px; background: var(--primary-background-color); }
.imgtip.warn { background: color-mix(in srgb, var(--df-warn) 12%, var(--df-card)); color: var(--primary-text-color); }
.frstage { position:relative; flex: none; width: min(100%, calc(var(--sh, 60vh) * var(--ar, 1.6))); aspect-ratio: var(--ar, 1.6); margin: 0 auto; background: repeating-conic-gradient(#0000000d 0 25%, transparent 0 50%) 0 0 / 16px 16px; border-radius:10px; overflow:hidden; user-select:none; touch-action:none; }
.frstage img { position:absolute; object-fit:fill; pointer-events:none; }
.frstage .dz { position:absolute; inset:0; transform-origin:0 0; }
.frstage .dzctl { position:absolute; right:8px; bottom:8px; z-index:5; display:flex; align-items:center; gap:2px; padding:3px; border-radius:10px; background: color-mix(in srgb, var(--df-card, #1f2125) 88%, transparent); box-shadow:0 1px 6px rgba(0,0,0,.3); }
.frstage .dzctl button { border:0; background:transparent; color: var(--df-text, #e8e8e8); font: inherit; font-size:15px; min-width:28px; height:28px; border-radius:7px; cursor:pointer; }
.frstage .dzctl button:hover { background: rgba(127,127,127,.18); }
.frstage .dzctl span { font-size:12px; min-width:40px; text-align:center; color: var(--df-sec); }
.frstage .frbox { position:absolute; outline: 2px solid var(--df-primary); box-shadow: 0 0 0 9999px rgba(0,0,0,.18); pointer-events:none; }
.frstage .frl { position:absolute; z-index:2; }
.frstage .frl.v { top:0; bottom:0; width:16px; margin-left:-8px; cursor:ew-resize; background: linear-gradient(90deg, transparent 7px, var(--df-primary) 7px, var(--df-primary) 9px, transparent 9px); }
.frstage .frl.h { left:0; right:0; height:16px; margin-top:-8px; cursor:ns-resize; background: linear-gradient(0deg, transparent 7px, var(--df-primary) 7px, var(--df-primary) 9px, transparent 9px); }
.alstage img { position:absolute; object-fit:fill; }
.rbstage { cursor: move; --sh: 46vh; }
.rbstage #rbdraw { position:absolute; inset:0; pointer-events:none; }
.rbsvg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.rbsvg polygon { fill: rgba(33,150,243,.14); stroke:#2196f3; stroke-width:1.5; vector-effect: non-scaling-stroke; }
.rbsvg polyline { fill:none; stroke:#2196f3; stroke-width:1.5; opacity:.6; vector-effect: non-scaling-stroke; }
.rbname { position:absolute; transform: translate(-50%,-50%); font-size:11px; line-height:1.5; padding:0 6px; border-radius:8px; background: rgba(33,150,243,.88); color:#fff; white-space:nowrap; }
.rbdot { position:absolute; transform: translate(-50%,-50%); width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
.rbdot.dock { background:#fff; color:#f9a825; }
.rbdot.bot { background:#2196f3; border:2px solid #fff; }
.rbp { margin:0 0 8px; color: var(--df-sec); font-size:13px; }
.rbpace { margin:10px 0 0; font-size:13px; } .rbpace summary { cursor:pointer; color: var(--df-sec); } .rbprow { display:flex; align-items:center; gap:8px; margin:4px 0; } .rbprow span { flex:1; } .rbprow select { min-width:150px; }
.rbempty { margin:16px 0; color: var(--df-sec); }
.rbbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px; }
.rbchip { display:flex; align-items:center; gap:8px; padding:6px 12px 6px 8px; border-radius:12px; border:1px solid var(--df-border, rgba(0,0,0,.15)); background:none; color:inherit; font:inherit; cursor:pointer; text-align:left; }
.rbchip svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; }
.rbchip small { display:block; font-size:11px; color: var(--df-sec); }
.rbchip.on { border-color:#2196f3; background: rgba(33,150,243,.1); }
.rbadd { padding:8px 10px; border-radius:12px; font:inherit; }
.rbframe { position:absolute; border:1.5px dashed #2196f3; pointer-events:none; }
.rbh { position:absolute; transform: translate(-50%,-50%); pointer-events:auto; background:#fff; border:2px solid #2196f3; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.rbh.c { width:12px; height:12px; border-radius:3px; }
.rbh.e { width:10px; height:10px; border-radius:50%; }
.rbrow { display:flex; gap:12px; flex-wrap:wrap; } .rbrow label.f { flex:1 1 220px; }
.rbtools { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:8px 0 0; } .rbtools .btn { padding:6px 10px; } .rbpic { display:flex; align-items:center; gap:8px; font-size:13px; color: var(--df-sec); margin-left:8px; } .rbpic input { width:110px; } .rbgap { flex:1; }
.alstage .alref { opacity:.45; filter: grayscale(.6); pointer-events:none; }
.alstage .alimg { opacity:.72; cursor:move; outline: 2px solid var(--df-primary); pointer-events:auto; }
.frvals { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:8px; font-size:13px; }
.gluebox { margin: 12px 14px 0; padding:10px 12px; border-radius:10px; background: var(--df-tint); font-size:12px; color: var(--df-sec); display:flex; flex-direction:column; gap:4px; }
.gluebox.ok { color: var(--df-ok, #43a047); }
.gluebox.warn { background: color-mix(in srgb, var(--df-warn) 12%, var(--df-card)); }
.glstrip { fill: #f59e0b; fill-opacity:.45; stroke:#d97706; stroke-width:2; stroke-dasharray: 5 3; }
.glstrip.focus { fill-opacity:.75; stroke-width:3; }
.glline { stroke:#16a34a; stroke-width:4; stroke-linecap:round; animation: glfade 4s ease-out forwards; }
@keyframes glfade { 0%, 60% { opacity:1; } 100% { opacity:.25; } }
.app:has([data-act="glue"]:hover) .glstrip { animation: glpulse .9s ease-in-out infinite alternate; }
@keyframes glpulse { from { fill-opacity:.25; } to { fill-opacity:.85; } }
.gluepair { text-align:left; font-size:12px; padding:2px 0; }
.gluebar { display:flex; align-items:center; gap:8px; font-size:13px; padding: 4px 6px 4px 12px; border-radius: 18px; background: var(--df-tint); }
.gluebox b { color: var(--primary-text-color); }
.gluebox .acts { display:flex; gap:8px; justify-content:flex-end; }
.selcard { flex:none; background: var(--df-card); border:1.5px solid var(--df-primary); border-radius:12px; overflow:hidden; }
.selcard > .details { margin:0; padding: 12px 14px; border:0; border-radius:0; background: transparent; }
header h1 { display:flex; align-items:center; gap:8px; }
header h1 .logo { width:28px; height:28px; }
.plancard { flex: 1 1 auto; min-width:0; min-height:0; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.canvas { position:relative; flex:1 1 0; min-height:220px; background: var(--primary-background-color); border-radius:8px; overflow:hidden; }
.viewport { position:absolute; left:50%; top:50%; transform: translate(-50%, -50%); overflow:hidden; touch-action:none; user-select:none; -webkit-user-select:none; }
/* test12 (#16): a tall plan zoomed in grows to the canvas width and scrolls up / down. */
.vscroll { position:absolute; inset:0; overflow:hidden; }
.vscroll.grown { overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; }
.vscroll.grown > .viewport { position:relative; left:auto; top:auto; transform:none; margin:4px auto; }
.viewport.cross { cursor: crosshair; }
.stage { position:absolute; inset:0; transform-origin:0 0; }
.stage img { position:absolute; inset:0; width:100%; height:100%; display:block; pointer-events:none; }
.stage svg.ov { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.layer { position:absolute; inset:0; pointer-events:none; }
.mk { position:absolute; width:40px; height:40px; margin:-20px 0 0 -20px; padding:0; border:0; background:transparent; display:flex; align-items:center; justify-content:center; cursor:grab; pointer-events:auto; touch-action:none; }
.mk .ring { width:28px; height:28px; border-radius:50%; background: var(--df-card); display:flex; align-items:center; justify-content:center; border: 2.5px solid var(--c1); box-shadow: 0 1px 3px rgba(0,0,0,.25); --mdc-icon-size: 16px; color: var(--primary-text-color); }
.mk.two .ring { box-shadow: 0 0 0 2px var(--df-card), 0 0 0 4px var(--c2); }
.mk.approx .ring { border-style: dashed; }
.mk.sel .ring { outline: 3px solid var(--df-primary); outline-offset: 4px; }
.mk .tip.multi { white-space:nowrap; text-align:left; line-height:1.35; }
.mk .tip { position:absolute; bottom:38px; left:50%; transform:translateX(-50%); white-space:nowrap; background: rgba(28,28,28,.92); color:#fff; font-size:12px; padding:4px 8px; border-radius:6px; opacity:0; pointer-events:none; transition: opacity .12s; }
.mk:hover .tip, .mk.sel .tip, .names-always .mk .tip { opacity:1; }
.names-off .mk:not(:hover):not(.sel) .tip { opacity:0; }
.mk:hover, .mk.sel { z-index: 5; }
.mk .count { position:absolute; top:0; right:0; min-width:18px; height:18px; border-radius:9px; background: var(--df-primary); color:#fff; font-size:11px; font-weight:500; display:flex; align-items:center; justify-content:center; border:2px solid var(--df-card); }
.mk.flash::after { content:''; position:absolute; left:50%; top:50%; width:28px; height:28px; margin:-14px 0 0 -14px; border-radius:50%; animation: pulse 1.2s ease-out 4; pointer-events:none; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--df-primary) 60%, transparent); } 100% { box-shadow: 0 0 0 22px transparent; } }
.mk.dragging { cursor: grabbing; z-index: 6; pointer-events:none; }
.mk .count.bondc { background: var(--df-ok); }
.mk .count.stk { background: #6b7280; }
.mk.approx::before { content:''; position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%; background: radial-gradient(circle, rgba(245,158,11,.6) 45%, rgba(245,158,11,0) 70%); pointer-events:none; }
.mk.droptgt { z-index: 7; }
.mk.droptgt .ring { transform: scale(1.45); transition: transform .15s; box-shadow: 0 0 0 4px var(--df-card), 0 0 0 7px var(--df-primary); }
.mk.droptgt .tip { opacity:1; background: var(--df-primary); }
.mk.ph { width:48px; height:48px; margin:-24px 0 0 -24px; }
.mk.ph .ring { width:36px; height:36px; background: var(--primary-text-color); color: var(--df-card); border:2px dashed var(--df-card); outline: 2px dashed var(--primary-text-color); outline-offset: 1px; --mdc-icon-size: 22px; }
.mk.ph.sel .ring { outline: 3px solid var(--df-primary); outline-offset: 4px; }
.mk.ph.empty .ring { animation: phglow 1.6s ease-in-out infinite; }
@keyframes phglow { 0%,100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--df-primary) 50%, transparent); } 50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--df-primary) 15%, transparent); } }
.mk .count.phc { background: var(--primary-text-color); color: var(--df-card); }
.stackpop { position:absolute; transform: translate(-50%, 26px); background: var(--df-card); color: var(--primary-text-color); border:1px solid var(--df-div); border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,.25); padding:6px; display:flex; flex-direction:column; gap:2px; min-width:200px; pointer-events:auto; z-index:9; font-size:13px; }
.stackpop.up { transform: translate(-50%, calc(-100% - 26px)); }
.stackpop .sh { font-size:11px; color: var(--df-sec); padding:2px 6px 4px; display:flex; align-items:center; }
.stackpop .sh button { margin-left:auto; }
.stackpop .si { display:flex; align-items:center; gap:8px; border:0; background:transparent; padding:6px; border-radius:8px; cursor:pointer; font: inherit; color: inherit; text-align:left; }
.stackpop .si:hover { background: var(--df-hover); }
.stackpop .si .ico { --mdc-icon-size:16px; display:flex; }
.details .bh { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.details .bcount { background: var(--df-ok); color:#fff; border-radius:9px; font-size:11px; font-weight:600; padding:1px 7px; }
.details .bcount.ph { background: var(--primary-text-color); color: var(--df-card); }
.details .mems { display:flex; flex-direction:column; gap:2px; }
.details .mem { display:flex; align-items:center; gap:8px; padding:4px 2px; border-radius:8px; }
.details .mem .cring { width:22px; height:22px; border-radius:50%; border:2px solid var(--c1); display:flex; align-items:center; justify-content:center; --mdc-icon-size:13px; flex:none; background: var(--df-card); }
.details .mem .link { padding:0; text-align:left; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.details .mem .mst { font-size:12px; color: var(--df-sec); white-space:nowrap; }
.details .mem .small { width:24px; height:24px; }
.details input.nmin { font: inherit; font-size:15px; font-weight:500; border:1px solid transparent; border-radius:6px; padding:2px 4px; margin-left:-4px; width:100%; background:transparent; color: inherit; box-sizing:border-box; }
.details input.nmin:hover, .details input.nmin:focus { border-color: var(--df-div); background: var(--df-card); outline:none; }
.details .morebtn { align-self:flex-start; padding:0; display:flex; align-items:center; gap:2px; }
.details .morebtn svg { width:14px; height:14px; transition: transform .15s; }
.details .morebtn.open svg { transform: rotate(180deg); }
.details .more { display:flex; flex-direction:column; gap:10px; border-top:1px dashed var(--df-div); padding-top:10px; }
.details .back { align-self:flex-start; padding:0; font-size:12px; }
.details label.fl { font-size:12px; color: var(--df-sec); display:flex; flex-direction:column; gap:4px; }
.details input.ent2 { font: inherit; font-size:13px; border:1px solid var(--df-div); border-radius:6px; padding:5px 6px; background: var(--df-card); color: inherit; }
.itipw { position:relative; display:inline-flex; vertical-align:middle; }
.itip { width:18px; height:18px; border-radius:50%; border:1px solid var(--df-sec); background:transparent; color: var(--df-sec); font: italic 600 11px/1 Georgia, serif; cursor:pointer; padding:0; display:inline-flex; align-items:center; justify-content:center; }
.itip.on, .itip:hover { border-color: var(--df-primary); color: var(--df-primary); }
.ipop { position:fixed; top:-999px; left:-999px; width:260px; z-index:30; background: var(--df-card); color: var(--primary-text-color); border:1px solid var(--df-div); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.22); padding:10px 12px; font-size:12.5px; line-height:1.45; font-style:normal; font-weight:400; text-align:left; white-space:normal; }
.ipop b { display:block; font-size:13px; margin-bottom:4px; }
.ipop a { color: var(--df-primary); }
.ipop .x { position:absolute; top:4px; right:4px; border:0; background:transparent; color: var(--df-sec); cursor:pointer; font-size:13px; }
.ovctl.layerctl { display:flex; gap:6px; align-items:flex-start; }
.pici { position:absolute; pointer-events:none; z-index:2; opacity:.92; }
.spinbox { position:relative; display:block; width:160px; max-width:100%; border-radius:8px; background: repeating-conic-gradient(rgba(127,127,127,.18) 0 25%, transparent 0 50%) 0 0/16px 16px; cursor:crosshair; touch-action:none; overflow:hidden; }
.spinbox img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; }
.spinbox .spinpt { position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; border:2px solid #f59e0b; background: rgba(245,158,11,.25); box-shadow: 0 0 0 1px rgba(0,0,0,.5); pointer-events:none; }
.spinbox .spinpt::before, .spinbox .spinpt::after { content:""; position:absolute; background:#f59e0b; }
.spinbox .spinpt::before { left:7px; top:-6px; width:2px; height:26px; }
.spinbox .spinpt::after { top:7px; left:-6px; height:2px; width:26px; }
svg.lfx { position:absolute; pointer-events:none; z-index:2; overflow:visible; background:none; border:0; padding:0; stroke:none; stroke-width:0; fill:none; } /* not the icon style (svg { stroke… }) */
.pici img, .pict img { width:100%; height:100%; display:block; object-fit:contain; }
.pici .ptint, .pict .ptint { position:absolute; inset:0; mix-blend-mode:multiply; -webkit-mask-size:100% 100%; mask-size:100% 100%; -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; pointer-events:none; }
.pict { position:relative; display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:8px; background:var(--df-bg2, rgba(127,127,127,.08)); overflow:hidden; flex:none; }
.pict .ptint { -webkit-mask-size:contain; mask-size:contain; -webkit-mask-position:center; mask-position:center; }
.picprev { display:flex; align-items:center; gap:8px; }
.pgwrap { display:flex; flex-direction:column; gap:6px; max-height:340px; overflow:auto; padding:6px; border:1px solid var(--df-line, rgba(127,127,127,.25)); border-radius:10px; }
.pgh { font-size:13px; font-weight:700; color:var(--df-text, var(--primary-text-color)); margin-top:8px; } /* 0.13.1: group names stand out from picture names */
.pgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:6px; }
.ptile { position:relative; display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 4px; border:1px solid transparent; border-radius:8px; background:none; cursor:pointer; font:inherit; color:inherit; }
.ptile:hover { background: rgba(127,127,127,.08); }
.ptile.on { border-color: var(--df-accent, #03a9f4); }
.ptile .pl { font-size:11px; line-height:1.2; text-align:center; }
.ptile .pdel { position:absolute; top:2px; right:4px; font-size:14px; line-height:1; color:var(--df-sec); }
.pici.sel { outline: 2px dashed #f59e0b; outline-offset:2px; }
.pici.pr { opacity:1; }
.pici.pr .pic { pointer-events:none; cursor:default; }
.pvsw { display:flex; gap:4px; flex-wrap:wrap; }
.pvsw button { flex:1; min-width:60px; border:1px solid var(--df-line, rgba(0,0,0,.2)); background:transparent; color:inherit; border-radius:6px; padding:4px 6px; font:inherit; font-size:12px; cursor:pointer; }
.pvsw button.on { background: var(--primary-color, #03a9f4); color:#fff; border-color: var(--primary-color, #03a9f4); }
.tza { position:absolute; box-sizing:border-box; border:2px dashed #f59e0b; background: rgba(245,158,11,.12); border-radius:6px; pointer-events:none; z-index:5; }
.lhd { position:absolute; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#f59e0b; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.4); cursor:grab; pointer-events:auto; touch-action:none; z-index:6; }
.details .lsec { display:flex; flex-direction:column; gap:6px; border:1px solid color-mix(in srgb, #f59e0b 45%, transparent); background: color-mix(in srgb, #f59e0b 8%, var(--df-card)); border-radius:10px; padding:8px 10px; }
.details .lsec .lh { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:500; }
.details .lsec .lh small { font-weight:400; color: var(--df-sec); margin-left:auto; }
.details .lchips { display:flex; flex-wrap:wrap; gap:4px; }
.details .lchips button { border:1px solid var(--df-div); background: var(--df-card); color: inherit; border-radius:14px; padding:3px 10px; font: inherit; font-size:12px; cursor:pointer; }
.details .lchips button.on { border-color:#f59e0b; background: color-mix(in srgb, #f59e0b 22%, var(--df-card)); font-weight:500; }
.details .lsz { display:flex; gap:8px; align-items:center; font-size:12px; color: var(--df-sec); flex-wrap:wrap; }
.details .lsz input { width:64px; font: inherit; font-size:13px; border:1px solid var(--df-div); border-radius:6px; padding:4px 6px; background: var(--df-card); color: var(--primary-text-color); }
.ovbtn ha-icon { --mdc-icon-size: 22px; display:flex; }
.ovbtn.on { background: var(--df-tint); color: var(--df-primary); border-color: var(--df-primary); }
.mk.bond .ring { box-shadow: 0 0 0 2px var(--df-card), 0 0 0 4px var(--c1); }
.mk.bondhint { z-index: 7; }
.mk.bondhint .ring { transform: scale(1.55); transition: transform .18s; box-shadow: 0 0 0 4px var(--df-card), 0 0 0 8px var(--df-ok); }
.mk.bondhint .tip { opacity:1; background: var(--df-ok); }
.lvlhint { margin:6px 0 0; padding:6px 8px; border-radius:8px; background: color-mix(in srgb, var(--df-primary) 10%, transparent); font-size:12px; }
.pin.epin { width:32px; height:32px; padding:0; box-sizing:border-box; justify-content:center; border-radius:50%; border:2px solid #488fc2; background:#fff; color:#222; }
.pin.epin.src { border-color:#ff9800; }
.pin.epin.bat { border-color:#4db6ac; }
.pin.epin { border-style:dashed; } /* a point you set, not a device: dashed like phantoms */
.pin.epin ha-icon { --mdc-icon-size:18px; }
.epts { margin: 0 0 8px; }
.epts .ghead.static { padding: 8px 12px; cursor:default; }
.epts .row { flex-wrap:wrap; }
.epts .row:has(.rep)::after { content:""; order:8; flex-basis:100%; } /* Replace / Bond go under the name */
.epts .row .rep { order:9; margin: 0 0 8px 38px; border:1px solid #488fc2; color:#2f6fa8; background:transparent; border-radius:12px; padding:2px 10px; font:inherit; font-size:12px; cursor:pointer; max-width: calc(100% - 50px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.epts .row .rep.note { border-color: transparent; color: var(--df-sec); cursor:default; padding-left:0; }
.epts .ico.av.eptag { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; box-sizing:border-box; border-radius:50%; border:2px solid #488fc2; background:#fff; color:#222; }
.epts .ico.av.eptag.src { border-color:#ff9800; }
.epts .ico.av.eptag.bat { border-color:#4db6ac; }
.epts .ico.av.eptag.dummy { border-style:dashed; }
.epts .row.done .ico.av.eptag { opacity:.45; filter: grayscale(1); }
.epts .ico.av.eptag ha-icon { --mdc-icon-size:16px; }
.pin { position:absolute; transform: translate(-50%, -50%); display:flex; align-items:center; gap:2px; font-size:12px; font-weight:500; color: var(--df-primary); background: var(--df-card); border:1.5px solid var(--df-primary); border-radius:12px; padding:3px 8px 3px 4px; white-space:nowrap; pointer-events:auto; cursor:grab; touch-action:none; box-shadow:0 1px 4px rgba(0,0,0,.2); }
.pin svg { width:14px; height:14px; }
#dragghost { position:fixed; left:-1000px; top:-1000px; pointer-events:none; }
.pin.dragpin { position:static; transform:none; display:inline-flex; border-radius: 12px; }
.dragmk { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
.dragmk .ring { width:28px; height:28px; border-radius:50%; background: var(--df-card); display:flex; align-items:center; justify-content:center; border: 2.5px dashed var(--c1); --mdc-icon-size:16px; }
.pin.dim { opacity:.75; pointer-events:none; }
.ghost { position:absolute; display:flex; align-items:center; gap:6px; pointer-events:none; transform: translate(-12px,-12px); }
.ghost .c { width:24px; height:24px; border-radius:50%; border:2.5px dashed var(--df-primary); background: color-mix(in srgb, var(--df-card) 80%, transparent); }
.ghost .n { font-size:12px; background: var(--df-primary); color:#fff; padding:2px 7px; border-radius:6px; white-space:nowrap; }
.mh { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:3px solid #c2410c; background: rgba(255,255,255,.8); pointer-events:auto; cursor:grab; touch-action:none; }
.mbox { position:absolute; transform: translate(-50%, -135%); display:flex; align-items:center; gap:8px; background:#c2410c; color:#fff; padding:6px 10px; border-radius:8px; white-space:nowrap; pointer-events:auto; box-shadow:0 2px 8px rgba(0,0,0,.25); font-size:13px; }
.mbox input { width:64px; border:0; border-radius:6px; padding:5px 6px; font: inherit; color:#1c1c1c; background:#fff; color-scheme: light; }
.mbox input::placeholder { color:#8a8f94; }
.mbox .x { background:transparent; color:#fff; padding:2px 4px; font-size:15px; line-height:1; }
.mbox button { border:0; background:#fff; color:#9a3412; border-radius:6px; padding:5px 10px; font-size:12px; font-weight:500; cursor:pointer; }
.mbox .lk { background:transparent; color:#fff; text-decoration:underline; padding:0; }
.reflbl { position:absolute; transform: translate(-50%, 4px); font-size:11px; color: var(--df-primary); background: color-mix(in srgb, var(--df-card) 90%, transparent); padding:1px 6px; border-radius:4px; white-space:nowrap; }
.empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center; padding:24px; color: var(--df-sec); }
.planfoot { flex:none; display:flex; align-items:center; flex-wrap:wrap; gap:6px 16px; font-size:12px; color: var(--df-sec); }
.ovctl { position:absolute; z-index:8; }
.ovctl.zoomctl { right:10px; bottom:10px; }
.ovctl.scalectl { left:12px; bottom:12px; pointer-events:none; font-size:12px; color: var(--primary-text-color); background: color-mix(in srgb, var(--df-card) 85%, transparent); border-radius:6px; padding:4px 8px 6px; }
.ovctl.layerctl { right:10px; top:10px; }
.layerctl .lwrap { position:relative; }
.scalebar { display:flex; flex-direction:column; gap:2px; }
.scalebar span:last-child { height:6px; border:2px solid var(--primary-text-color); border-top:0; }
.ovbtn { width:38px; height:38px; border:1px solid var(--df-div); background: var(--df-card); border-radius:10px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.15); }
.ovbtn.open { background: var(--df-tint); color: var(--df-primary); }
.layerpop { position:absolute; right:0; top:44px; width:230px; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.2); padding:8px; display:flex; flex-direction:column; gap:2px; }
.layerpop h4 { margin:4px 8px 6px; font-size:13px; font-weight:500; }
.lrow { display:flex; align-items:center; gap:10px; border:0; background:transparent; border-radius:8px; padding:8px; cursor:pointer; font-size:14px; text-align:left; }
.lrow:hover { background: var(--df-hover); }
.lrow .eye { color: var(--df-primary); display:flex; }
.lrow.off .eye { color: var(--df-sec); opacity:.5; }
.lrow.off span.l { color: var(--df-sec); text-decoration: line-through; }
.lrow[disabled] { cursor:default; }
.lrow[disabled]:hover { background:transparent; }
.lrow small { margin-left:auto; font-size:11px; color: var(--df-sec); }
.fade-refs line.ref { opacity:.3; }
.reflbl.fade, .rh.fade { opacity:.3; pointer-events:none !important; }
.pin.fade { opacity:.3; pointer-events:none; }
.pin.lbl { background:transparent; border:0; box-shadow:none; padding:0; font-weight:500; color: var(--primary-text-color); text-shadow: 0 0 3px var(--df-card), 0 0 3px var(--df-card), 0 0 2px var(--df-card); transform: translate(-50%, -50%); }
.mk.fade { opacity:.2; pointer-events:none; }
.mk.missing .ring { border-color: var(--df-sec); border-style: dotted; color: var(--df-sec); font-weight:700; }
.rh { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; border:2.5px solid var(--df-primary); background: var(--df-card); pointer-events:auto; cursor:grab; touch-action:none; z-index:3; }
.reflbl.edit { pointer-events:auto; cursor:pointer; border:1px solid color-mix(in srgb, var(--df-primary) 50%, transparent); }
.reflbl.edit:hover, .reflbl.on { background: var(--df-primary); color:#fff; }
.refpop { position:absolute; transform: translate(-50%, 18px); display:flex; align-items:center; gap:8px; background: var(--df-card); color: var(--primary-text-color); border:1px solid var(--df-div); padding:8px 10px; border-radius:10px; white-space:nowrap; pointer-events:auto; box-shadow:0 6px 18px rgba(0,0,0,.25); font-size:13px; z-index:9; }
.refpop input { width:64px; border:1px solid var(--df-div); border-radius:6px; padding:5px 6px; font: inherit; background: var(--df-card); color: inherit; }
.refpop button { border:0; border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer; background: var(--df-primary); color:#fff; display:flex; align-items:center; gap:4px; }
.refpop button.del { background:transparent; color: var(--error-color, #b3261e); padding:6px; }
.legend { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; }
.legend i { display:inline-block; width:12px; height:12px; border-radius:50%; border:2px solid; vertical-align:-2px; margin-right:4px; }
.legend select { font: inherit; font-size:12px; border:1px solid var(--df-div); border-radius:6px; padding:2px 4px; background: var(--df-card); color: inherit; }
.zoom { display:flex; align-items:center; gap:2px; border:1px solid var(--df-div); border-radius:10px; padding:2px; background: var(--df-card); box-shadow:0 1px 4px rgba(0,0,0,.15); }
.zoom button { width:32px; height:32px; border:0; background:transparent; font-size:18px; cursor:pointer; border-radius:8px; }
.zoom .fit { width:auto; font-size:12px; padding:0 10px; border-left:1px solid var(--df-div); border-radius:0 8px 8px 0; }
.zoom span { min-width:44px; text-align:center; color: var(--primary-text-color); }
.side { flex: 0 0 360px; min-width: 0; min-height:0; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; display:flex; flex-direction:column; overflow-y:auto; overscroll-behavior:contain; }
.sidehead { padding:12px 14px 4px; display:flex; flex-direction:column; gap:2px; }
.sidehead h2 { margin:0; font-size:16px; font-weight:500; display:flex; align-items:baseline; gap:8px; }
.sidehead p { margin:0; font-size:12px; color: var(--df-sec); line-height:1.4; }
.pill { font-size:12px; font-weight:500; border-radius:10px; padding:1px 8px; background: var(--df-tint); color: var(--df-primary); white-space: nowrap; }
.pill.ok { background: var(--df-ok-tint); color: var(--df-ok); }
.pill.grey { background: var(--primary-background-color); color: var(--df-sec); font-weight:400; }
.pill.warn { background: color-mix(in srgb, var(--df-warn) 15%, var(--df-card)); color: color-mix(in srgb, var(--df-warn) 80%, var(--primary-text-color)); }
.row.done[data-dev] .main > .ico { opacity:.45; filter: grayscale(1); }
.row.done[data-dev] .rname { color: var(--df-sec); }
.controls { padding: 8px 12px 6px; display:flex; flex-direction:column; gap:8px; position:relative; }
.search { width:100%; border:1px solid var(--df-div); border-radius:8px; padding:9px 10px; font: inherit; font-size:14px; background: var(--df-card); color: inherit; }
.frow { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.fbtn { display:flex; align-items:center; gap:6px; border:1px solid var(--df-div); background: var(--df-card); border-radius:16px; padding:6px 10px; font-size:13px; font-weight:600; cursor:pointer; }
.fbtn.act { border-color: var(--df-primary); }
.fbtn.open { background: var(--df-tint); }
.fbtn .cnt { background: var(--df-primary); color:#fff; border-radius:9px; font-size:11px; line-height:16px; padding:0 6px; }
.fbtn svg { width:12px; height:12px; }
.pop { position:absolute; left:12px; right:12px; top:100%; z-index:20; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.18); padding:12px; display:flex; flex-direction:column; gap:10px; max-height:60vh; overflow-y:auto; overscroll-behavior:contain; }
.pop > .btn.primary { position:sticky; bottom:0; box-shadow:0 -6px 10px var(--df-card); }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chip { display:flex; align-items:center; gap:6px; border:1px solid var(--df-div); background: var(--df-card); border-radius:16px; padding:6px 10px; font-size:13px; cursor:pointer; }
.chip.on { border-color: var(--df-primary); background: var(--df-tint); color: var(--df-primary); font-weight:500; }
.chip small { color: var(--df-sec); font-size:12px; font-weight:400; }
.chip.done:not(.on) { opacity:.7; }
.chip small.okc { color: var(--df-ok); font-weight:700; font-size:13px; }
.dot { width:9px; height:9px; border-radius:50%; flex:none; }
.opts { display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; font-size:12px; color: var(--df-sec); }
.opts select { font: inherit; font-size:12px; border:1px solid var(--df-div); border-radius:6px; padding:3px 4px; background: var(--df-card); color: inherit; }
.newbar { margin: 0 12px; padding: 8px 10px; border-radius:8px; background: var(--df-tint); font-size:13px; display:flex; align-items:center; gap:8px; }
.list { flex:none; border-top:1px solid var(--df-div); }
.ghead { width:100%; display:flex; align-items:center; gap:8px; padding:9px 14px; border:0; border-bottom:1px solid var(--df-div); background: color-mix(in srgb, var(--primary-background-color) 60%, var(--df-card)); cursor:pointer; text-align:left; position: sticky; top: 0; z-index: 1; }
.ghead svg { width:14px; height:14px; color: var(--df-sec); transition: transform .15s; }
.ghead.open svg { transform: rotate(90deg); }
.ghead b { font-size:14px; font-weight:500; flex:1; }
.row { display:flex; align-items:center; gap:2px; padding:0 6px 0 14px; border-bottom:1px solid color-mix(in srgb, var(--df-div) 50%, transparent); cursor:grab; }
.row:hover { background: var(--df-hover); }
.row.sel { background: var(--df-tint); box-shadow: inset 3px 0 0 var(--df-primary); }
.row .main { flex:1; min-width:0; display:flex; align-items:center; gap:10px; border:0; background:transparent; padding:5px 0; cursor:pointer; text-align:left; }
.ico { width:28px; height:28px; border-radius:8px; background: var(--primary-background-color); display:flex; align-items:center; justify-content:center; flex:none; --mdc-icon-size: 18px; }
.ico.av { width:34px; height:34px; border-radius:50%; background: var(--df-card); border:1px solid var(--df-div); overflow:hidden; }
.ico.av img { width:22px; height:22px; object-fit:contain; }
.rtxt { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
.rname { font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.row.todo .rname { font-weight:500; }
.row.done .rname { color: var(--df-sec); }
.rmeta { display:flex; gap:4px; align-items:center; flex-wrap:wrap; font-size:12px; color: var(--df-sec); }
.badge { font-size:11px; line-height:16px; padding:0 6px; border-radius:8px; }
.bat-low { color:#8c1d18; background:#fde7e6; }
.bat { color: var(--df-sec); background: var(--primary-background-color); }
.newtag { color:#fff; background: var(--df-primary); }
.small { width:34px; height:34px; border:0; background:transparent; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color: var(--df-sec); flex:none; }
.small:hover { background: var(--df-hover); }
.small.eyeon { color: var(--df-primary); }
.hiddenrow .ico { opacity:.4; }
.side > .details { flex: none; }
.details .note.parts .prow { display:flex; align-items:center; gap:6px; margin-top:4px; }
.details .note.parts .prow .pn { flex:1; min-width:0; display:flex; flex-direction:column; }
.details .note.parts .prow .pn b { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.details .note.parts .prow .pn small { color: var(--df-sec); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.details .note.parts .prow .btn { flex:none; padding:2px 8px; min-height:0; font-size:12px; }
.details { margin: 10px 12px 0; padding: 12px; border-radius:12px; border:1px solid color-mix(in srgb, var(--df-primary) 40%, transparent); background: color-mix(in srgb, var(--df-tint) 50%, var(--df-card)); display:flex; flex-direction:column; gap:10px; }
.details .top { display:flex; gap:10px; align-items:flex-start; }
.details .nm { font-size:15px; font-weight:500; }
.details .sub { font-size:12px; color: var(--df-sec); margin-top:2px; }
.details .acts { display:flex; flex-wrap:wrap; gap:6px; }
.stage svg.ov line.she { pointer-events: stroke; cursor: move; touch-action:none; }
.stage svg.ov line.she:hover { stroke: rgba(179,38,30,.25); }
.shc { position:absolute; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#fff; border:2.5px solid #b3261e; cursor:grab; pointer-events:auto; touch-action:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.shp { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background: rgba(179,38,30,.85); color:#fff; font-size:13px; line-height:16px; text-align:center; cursor:copy; pointer-events:auto; touch-action:none; z-index:5; opacity:.75; }
.shp:hover { opacity:1; }
.she { position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:5px; background:#b3261e; color:#fff; font-size:10px; line-height:18px; text-align:center; cursor:pointer; pointer-events:auto; z-index:5; opacity:.85; }
.she.open { background:#2e7d32; }
.shbox { position:absolute; z-index:20; width:260px; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,.25); padding:8px 10px; font-size:12px; }
.shbox .shgrip { cursor:move; user-select:none; margin-bottom:4px; color: var(--primary-text-color); }
.shbox .shtip { color: var(--df-sec); line-height:1.4; margin-bottom:8px; }
.shbox .shacts { display:flex; gap:6px; flex-wrap:wrap; }
.shbox .shacts button { border:1px solid var(--df-div); background: var(--df-card); color: inherit; border-radius:14px; padding:4px 10px; font: inherit; cursor:pointer; }
.shbox .shacts button.pri { background:#2e7d32; border-color:#2e7d32; color:#fff; }
.shbtn { flex:none; border:1px solid #b3261e; color:#b3261e; background: color-mix(in srgb, #b3261e 10%, transparent); border-radius:12px; padding:3px 9px; font: inherit; font-size:12px; cursor:pointer; margin-left:4px; }
.shbtn.done { border-color: var(--df-ok); color: var(--df-ok); background: color-mix(in srgb, var(--df-ok) 12%, transparent); }
.shbtn.act { outline:2px solid currentColor; outline-offset:1px; }
.details .usesrow { margin: -2px 0 4px 30px; font-size:12px; }
.details .usesrow .link { padding:0; font-size:12px; }
.details .uses { display:flex; flex-direction:column; gap:2px; margin-top:4px; }
.details .uses small { color: var(--df-sec); }
/* 0.11 (#5): every drag handle sits above markers and labels, with a bigger invisible grip; names never catch the mouse. */
.lhd, .ohd, .ahd, .rh { z-index:20 !important; }
.lhd.lc { background:#fff; border:3px solid #f59e0b; cursor:move; }
.lhd::before, .ohd::before, .ahd::before, .rh::before { content:""; position:absolute; inset:-10px; border-radius:50%; }
.pin.lbl, .mk .tip, .bx .tip { pointer-events:none; }
.ahd { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; border:3px solid #4fa3ff; cursor:grab; pointer-events:auto; touch-action:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.ohd { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; border:3px solid #26c6da; cursor:grab; pointer-events:auto; touch-action:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.details .lsec.opn { border-color: color-mix(in srgb, #26c6da 45%, transparent); background: color-mix(in srgb, #26c6da 8%, var(--df-card)); }
.details .lsec.air { border-color: color-mix(in srgb, #4fa3ff 45%, transparent); background: color-mix(in srgb, #4fa3ff 8%, var(--df-card)); }
.details .lclr { display:flex; align-items:center; gap:8px; font-size:12px; color: var(--df-sec); }
.details .lclr button { border:1px solid var(--df-div); background: var(--df-card); color: inherit; border-radius:12px; padding:2px 10px; font: inherit; cursor:pointer; }
.details .lclr button.on { border-color:#f59e0b; color: var(--primary-text-color); }
.details .lclr input[type=range] { flex:1; min-width:80px; height:6px; -webkit-appearance:none; appearance:none; border-radius:3px; background: linear-gradient(90deg, rgb(255,160,70), rgb(255,240,225), rgb(200,220,255)); outline:none; opacity:.55; }
.details .lclr input[type=range].on { opacity:1; }
.details .lclr input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #f59e0b; cursor:pointer; }
.details .lclr input[type=color] { width:28px; height:24px; padding:0; border:1px solid var(--df-div); border-radius:6px; background:none; cursor:pointer; opacity:.6; }
.details .lclr input[type=color].on { opacity:1; border-color:#f59e0b; }
.details .note.split .srow { display:flex; align-items:center; gap:6px; margin-top:6px; }
.details .note.split .snm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
.details .note { font-size:12px; line-height:1.4; border-radius:8px; padding:7px 9px; background: var(--primary-background-color); }
.details select { font: inherit; font-size:13px; border:1px solid var(--df-div); border-radius:8px; padding:6px; background: var(--df-card); color: inherit; width:100%; }
.toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:40; display:flex; align-items:center; gap:12px; background:#1c1c1c; color:#fff; border-radius:10px; padding:10px 10px 10px 16px; font-size:14px; box-shadow:0 6px 20px rgba(0,0,0,.35); max-width: calc(100% - 32px); }
.toast button { border:0; background:transparent; color:#7cc6ea; font-weight:500; cursor:pointer; padding:6px 8px; font-size:14px; }
.modal { position:fixed; inset:0; background: rgba(0,0,0,.45); z-index:50; display:flex; align-items:center; justify-content:center; padding:16px; }
.dialog { width:100%; max-width:560px; max-height: calc(100vh - 32px); overflow:auto; background: var(--df-card); border-radius:16px; box-shadow:0 12px 40px rgba(0,0,0,.3); padding:20px; display:flex; flex-direction:column; gap:14px; }
.dialog h2 { margin:0; font-size:20px; font-weight:500; }
.dialog p { margin:0; font-size:14px; line-height:1.45; color: var(--df-sec); }
.dialog label.f { display:flex; flex-direction:column; gap:4px; font-size:12px; color: var(--df-sec); }
.dialog input[type=text], .dialog input[type=number], .dialog select { font: inherit; font-size:14px; border:1px solid var(--df-div); border-radius:8px; padding:9px 10px; background: var(--df-card); color: var(--primary-text-color); }
.dialog .acts { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
.opt { display:flex; gap:10px; align-items:flex-start; border:1px solid var(--df-div); border-radius:10px; padding:10px; cursor:pointer; }
.opt.on { border-color: var(--df-primary); background: var(--df-tint); }
.opt b { font-size:14px; font-weight:500; display:block; }
.opt span { font-size:12px; color: var(--df-sec); }
.setgrid { display:flex; flex-direction:column; gap:12px; }
.setgrid h3 { margin:0 0 6px; font-size:13px; font-weight:500; color: var(--df-sec); }
.total { font-size:15px; padding:10px 12px; border-radius:10px; background: var(--df-tint); }
.err { color: var(--error-color, #b3261e); font-size:13px; }
.welcome { flex:1; min-height:0; display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow:auto; }
.welcome .dialog { box-shadow:none; border:1px solid var(--df-div); max-height:none; overflow:visible; }
.tabwrap { position:relative; display:flex; align-items:center; border-radius:8px; }
.tabwrap.on { background: var(--df-tint); }
.tabwrap.on .tab { background: transparent; }
.tabmenu { width:28px; height:30px; border:0; background:transparent; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; color: var(--df-sec); margin-left:-6px; margin-right:2px; }
.tabmenu:hover { background: var(--df-hover); color: var(--primary-text-color); }
.tabmenu svg { width:16px; height:16px; }
.tabwrap:not(.on) .tabmenu { opacity:0; }
.tabwrap:not(.on):hover .tabmenu, .tabwrap:not(.on) .tabmenu:focus-visible { opacity:1; }
@media (hover: none) { .tabwrap:not(.on) .tabmenu { display:none; } }
.tabdot { position:absolute; top:5px; right:4px; width:7px; height:7px; border-radius:50%; background: var(--df-primary); }
.menu { position:fixed; z-index:60; min-width:220px; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.22); padding:6px; display:flex; flex-direction:column; }
.menu button { border:0; background:transparent; text-align:left; padding:9px 12px; border-radius:8px; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:10px; }
.menu button:hover { background: var(--df-hover); }
.menu button[disabled] { opacity:.4; cursor:default; }
.menu button.danger { color: var(--error-color, #b3261e); }
.menu hr { border:0; border-top:1px solid var(--df-div); margin:4px 0; width:100%; }
.ready { border:0; background: var(--df-ok); color:#fff; border-radius:18px; padding:7px 14px; font-size:13px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.ready.anim { animation: readyin .5s ease-out; }
.ready svg { width:16px; height:16px; }
.ready small { font-weight:400; opacity:.9; font-size:12px; }
@keyframes readyin { from { opacity:0; transform: translateY(-4px); } }
.drop { border:2px dashed var(--df-div); border-radius:12px; padding:22px 16px; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; cursor:pointer; color: var(--df-sec); font-size:13px; transition: border-color .15s, background .15s; }
.drop:hover, .drop.over { border-color: var(--df-primary); background: var(--df-tint); }
.drop svg { width:28px; height:28px; color: var(--df-primary); }
.drop b { color: var(--primary-text-color); font-size:15px; font-weight:500; }
.srcrow { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.tpls { display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:8px; }
.tpl { border:1px solid var(--df-div); border-radius:10px; background: var(--df-card); padding:4px; cursor:pointer; display:flex; flex-direction:column; gap:4px; font-size:11px; color: var(--df-sec); text-align:center; }
.tpl:hover { border-color: var(--df-primary); }
.tpl img { width:100%; aspect-ratio: 4 / 3; object-fit:contain; border-radius:6px; background: var(--primary-background-color); }
.chosen { display:flex; gap:12px; align-items:center; border:1px solid var(--df-div); border-radius:12px; padding:8px; }
.chosen img { width:120px; height:90px; object-fit:contain; border-radius:8px; background: var(--primary-background-color); flex:none; }
.chosen .t { flex:1; min-width:0; font-size:13px; }
.chosen .t b { display:block; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.secttl { font-size:12px; color: var(--df-sec); }
.box { border-radius:10px; padding:10px 12px; background: var(--primary-background-color); font-size:13px; line-height:1.45; }
.box b { font-weight:500; }
.stat { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:14px; }
.yaml { font-family: ui-monospace, Menlo, monospace; font-size:12px; white-space:pre; background: var(--primary-background-color); border-radius:8px; padding:10px; overflow:auto; }
.mrow { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid color-mix(in srgb, var(--df-div) 50%, transparent); font-size:14px; }
.mrow .k { width:22px; display:flex; justify-content:center; color: var(--df-primary); }
.mrow .v { margin-left:auto; font-weight:500; }
.mrow.unset { color: var(--df-sec); }
.warnbox { margin:10px 12px 0; padding:9px 11px; border-radius:8px; font-size:13px; line-height:1.4; background: color-mix(in srgb, var(--df-warn) 14%, var(--df-card)); color: color-mix(in srgb, var(--df-warn) 70%, var(--primary-text-color)); }
.chip.pick { padding:7px 12px 7px 10px; }
.chip.pick .ck { width:16px; height:16px; border-radius:50%; border:1.5px solid var(--df-div); display:flex; align-items:center; justify-content:center; }
.chip.pick.on { background: var(--df-primary); border-color: var(--df-primary); color:#fff; }
.chip.pick.on .ck { border-color:#fff; background:#fff; color: var(--df-primary); }
.chip.pick .ck svg { width:11px; height:11px; stroke-width:3; }
.chip.pick:not(.on) { color: var(--df-sec); background: transparent; }
.backlink { align-self:flex-start; text-decoration:none; padding:0; margin-bottom:-6px; font-size:14px; }
.okttl { display:flex; align-items:center; gap:10px; }
.okttl > svg { width:28px; height:28px; flex:none; }
.live { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; letter-spacing:.06em; color:#fff; background:#e53935; border-radius:12px; padding:3px 10px 3px 8px; }
.live i { width:8px; height:8px; border-radius:50%; background:#fff; animation: livepulse 1.4s ease-in-out infinite; }
@keyframes livepulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }
summary { cursor:pointer; user-select:none; }
details.box summary { font-weight:500; }
.cardprev { min-height:300px; border-radius:12px; overflow:hidden; background: var(--primary-background-color); --dfc-chrome: 300px; }
.viewport.zoomed:not(.cross) { cursor: grab; }
.viewport.zoomed.panning { cursor: grabbing !important; }
.bx { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; padding:0; border:0; background:transparent; display:flex; align-items:center; justify-content:center; cursor:grab; pointer-events:auto; touch-action:none; }
.bx::before { content:''; width:14px; height:14px; border-radius:3px; background: var(--df-card); border:2.5px solid var(--df-primary); box-shadow:0 1px 3px rgba(0,0,0,.25); }
.bx.sel::before { outline:2px solid var(--df-primary); outline-offset:3px; }
.bx .tip { position:absolute; bottom:24px; left:50%; transform:translateX(-50%); white-space:nowrap; background: rgba(28,28,28,.92); color:#fff; font-size:12px; padding:4px 8px; border-radius:6px; opacity:0; pointer-events:none; }
.bx:hover .tip, .bx.sel .tip { opacity:1; }
.bx.fade { opacity:.25; pointer-events:none; }
.side.dropout { outline: 3px dashed var(--error-color, #b3261e); outline-offset:-3px; position:relative; }
.side.dropout::after { content: attr(data-droptext); position:absolute; left:12px; right:12px; top:45%; text-align:center; padding:14px; border-radius:12px; background: color-mix(in srgb, var(--error-color, #b3261e) 12%, var(--df-card)); color: var(--error-color, #b3261e); font-weight:500; font-size:15px; box-shadow:0 6px 20px rgba(0,0,0,.18); pointer-events:none; z-index:30; }
.fwrap { display:inline-flex; align-items:center; }
.fwrap .fbtn.act { border-top-right-radius:0; border-bottom-right-radius:0; border-right:0; }
.fx { border:1px solid var(--df-primary); border-left:1px solid var(--df-div); background: var(--df-card); border-radius:0 16px 16px 0; padding:6px 9px 6px 7px; font-size:13px; line-height:1; cursor:pointer; color: var(--df-sec); align-self:stretch; display:flex; align-items:center; }
.fx:hover { color: var(--error-color, #b3261e); background: var(--df-hover); }
.popall { display:flex; align-items:center; gap:4px; font-size:12px; color: var(--df-sec); }
.popall .link { font-size:12px; }
.toolsum { margin: 6px 12px 8px; display:flex; align-items:center; gap:8px; width: calc(100% - 24px); border:1px solid var(--df-div); background: var(--primary-background-color); border-radius:8px; padding:7px 10px; font-size:13px; cursor:pointer; text-align:left; }
.toolsum span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.toolsum svg { width:14px; height:14px; color: var(--df-sec); }
.sidehead h2 .tgl { margin-left:auto; width:30px; height:30px; border:0; background:transparent; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color: var(--df-sec); align-self:center; }
.sidehead h2 .tgl:hover { background: var(--df-hover); }
.sidehead h2 .tgl svg { width:16px; height:16px; transition: transform .15s; }
.sidehead h2 .tgl.up svg { transform: rotate(180deg); }
.rmeta .hit { color: var(--df-primary); }
.details .chk { display:flex; align-items:center; gap:8px; font-size:13px; }
.details input.ent { font: inherit; font-size:13px; border:1px solid var(--df-div); border-radius:8px; padding:6px 8px; background: var(--df-card); color: inherit; width:100%; }
.details .parts { display:flex; flex-direction:column; gap:4px; }
.details .parts div { display:flex; align-items:center; gap:6px; }
.details .parts .link { font-size:12px; padding:0 4px; }
.setgrid h3.big { font-size:14px; font-weight:700; color: var(--primary-text-color); }
.setgrid h3.u { text-decoration: underline; text-underline-offset: 3px; }
.dialog.stickyacts { padding-bottom:0; }
.dialog.stickyacts > .acts { position: sticky; bottom: 0; margin: 0 -20px; padding: 12px 20px 16px; background: var(--df-card); border-top: 1px solid var(--df-div); z-index: 2; }
@media (max-width: 600px) {
  header h1 { display:none; }
  .toolbar { padding:6px 8px; }
  .step { padding:6px 9px; font-size:13px; }
  .guide { margin:6px 8px 0; }
  .ovctl.scalectl { display:none; }
  .ready small { display:none; }
}
@media (max-width: 900px) {
  .body { flex-direction:column; padding: 0 8px 8px; gap:8px; }
  main { flex-direction:column; padding:8px 0 0; gap:8px; }
  .lcol { flex: 1 1 58%; }
  .sidecol { flex: 1 1 42%; margin:0; }
}
`;

/** 0.8.2: Glue Rooms. Where two Room shapes overlap (open to each other), the facing edges are moved so the shapes
 *  meet on one line. Rules: only parallel edges facing each other and overlapping by at most 4 % of the plan width;
 *  an edge that the overlap covers (almost) completely moves onto the other Room's edge (a corridor meets the big
 *  Room's wall line, which itself stays where it is); when both edges are covered they meet in the middle.
 *  Gaps (walls) are never touched. Works in a square space (y scaled by the plan's height). Returns the new shapes
 *  and the number of edges moved. */
function glueShapes(shapes, ratio, tol = 4) {
  const ids = Object.keys(shapes).filter((k) => Array.isArray(shapes[k]) && shapes[k].length >= 3);
  const S = {};
  for (const k of ids) S[k] = shapes[k].map((p) => [p[0], p[1] / ratio, ...p.slice(2)]); // keeps an open-edge flag
  const area = (P) => P.reduce((a, p, i) => a + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2;
  const edge = (P, i) => {
    const A = P[i];
    const B = P[(i + 1) % P.length];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 0.2) return null;
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const sgn = area(P) > 0 ? 1 : -1; // outward normal for this winding (y down)
    return { i, A, B, L, u, n: [u[1] * sgn, -u[0] * sgn] };
  };
  let moved = 0;
  const pairs = new Map(); // "a|b" → what happened
  const strips = []; // overlapping strips before gluing
  const lines = []; // where Rooms meet after gluing
  for (let p = 0; p < ids.length; p++) {
    for (let q = p + 1; q < ids.length; q++) {
      const PA = S[ids[p]];
      const PB = S[ids[q]];
      for (let i = 0; i < PA.length; i++) {
        for (let j = 0; j < PB.length; j++) {
          const a = edge(PA, i);
          const b = edge(PB, j);
          if (!a || !b) continue;
          if (Math.abs(a.u[0] * b.u[1] - a.u[1] * b.u[0]) > 0.03) continue; // not parallel
          if (a.n[0] * b.n[0] + a.n[1] * b.n[1] > -0.9) continue; // not facing each other
          const g = (a.A[0] - b.A[0]) * a.n[0] + (a.A[1] - b.A[1]) * a.n[1]; // > 0: overlap, < 0: gap
          if (g <= 0.01 || g > 25) continue;
          const t = (P) => P[0] * a.u[0] + P[1] * a.u[1];
          const [a0, a1] = [t(a.A), t(a.B)].sort((x, y) => x - y);
          const [b0, b1] = [t(b.A), t(b.B)].sort((x, y) => x - y);
          const ov = Math.min(a1, b1) - Math.max(a0, b0);
          if (ov <= 0.2) continue;
          const key = `${ids[p]}|${ids[q]}`;
          // A real overlap: the middle of the shared stretch of each edge lies inside the other Room.
          // (Edges far apart on opposite sides of two Rooms also face each other, but nothing overlaps there.)
          const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
          const onA = [a.A[0] + a.u[0] * (mid - t(a.A)), a.A[1] + a.u[1] * (mid - t(a.A))];
          const onB = [b.A[0] + a.u[0] * (mid - t(b.A)), b.A[1] + a.u[1] * (mid - t(b.A))];
          const inside = (P, x, y) => {
            let c = false;
            for (let m = 0, n = P.length - 1; m < P.length; n = m++) {
              if (P[m][1] > y !== P[n][1] > y && x < ((P[n][0] - P[m][0]) * (y - P[m][1])) / (P[n][1] - P[m][1]) + P[m][0]) c = !c;
            }
            return c;
          };
          const eps = 0.05; // test just inside the edge
          if (!inside(PB, onA[0] - a.n[0] * eps, onA[1] - a.n[1] * eps) || !inside(PA, onB[0] - b.n[0] * eps, onB[1] - b.n[1] * eps)) continue;
          if (g > tol) continue; // a large overlap is left as it is
          // The overlapping strip (before gluing), for the highlight on the plan.
          const at = (E, sv) => [E.A[0] + a.u[0] * (sv - t(E.A)), E.A[1] + a.u[1] * (sv - t(E.A))];
          const s0 = Math.max(a0, b0);
          const s1 = Math.min(a1, b1);
          strips.push({ key, pts: [at(a, s0), at(a, s1), at(b, s1), at(b, s0)] });
          const ca = ov / a.L;
          const cb = ov / b.L;
          const shift = (P, e, d) => {
            for (const k of [e.i, (e.i + 1) % P.length]) P[k] = [P[k][0] - e.n[0] * d, P[k][1] - e.n[1] * d, ...P[k].slice(2)];
          };
          if (ca > 0.8 && cb > 0.8) {
            shift(PA, a, g / 2);
            shift(PB, b, g / 2);
            pairs.set(key, { a: ids[p], b: ids[q], how: "meet" });
          } else if (ca >= cb) {
            shift(PA, a, g);
            pairs.set(key, { a: ids[p], b: ids[q], how: "a" });
          } else {
            shift(PB, b, g);
            pairs.set(key, { a: ids[p], b: ids[q], how: "b" });
          }
          moved++;
          // Where the two Rooms meet now (after gluing): the shared stretch of the moved edges.
          const ea = edge(PA, i);
          if (ea) {
            const at2 = (sv) => [ea.A[0] + a.u[0] * (sv - t(ea.A)), ea.A[1] + a.u[1] * (sv - t(ea.A))];
            const pb = edge(PB, j);
            const g2 = pb ? (ea.A[0] - pb.A[0]) * a.n[0] + (ea.A[1] - pb.A[1]) * a.n[1] : 1;
            if (Math.abs(g2) < 0.05) lines.push([at2(s0), at2(s1)]);
          }
        }
      }
    }
  }
  const out = {};
  for (const k of ids) out[k] = S[k].map((p) => [+p[0].toFixed(3), +(p[1] * ratio).toFixed(3), ...p.slice(2)]);
  const back = (P) => P.map(([x, y]) => [+x.toFixed(3), +(y * ratio).toFixed(3)]);
  return { shapes: out, moved, pairs: [...pairs.values()], strips: strips.map((x) => ({ key: x.key, pts: back(x.pts) })), lines: lines.map(back) };
}

/** Is a point inside a polygon ([[x, y], …], % of the plan)? */
function ptInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 0.7.0: door, window or shutter, from the device class and the name. */
function guessOpenAs(eid, hass, name) {
  const st = eid && hass && hass.states[eid];
  const dc = (st && st.attributes.device_class) || "";
  const n = `${eid || ""} ${name || ""} ${eid ? entName({ states: { [eid]: st } }, eid) : ""}`.toLowerCase();
  if (/shutter|roller|blind|rolet|ρολ|jalous|persian|store|tapparell|persiana/.test(n)) return "shutter";
  if (String(eid || "").startsWith("cover.")) return ["door", "garage", "gate"].includes(dc) ? "door" : dc === "window" ? "window" : "shutter";
  if (["door", "garage_door"].includes(dc)) return "door";
  return "window";
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

