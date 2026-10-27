/*
 * Device Floorplan – planner panel (v0.5.1).
 * Plain web component, no build step. Talks to the integration through
 * hass.callWS and uploads images through the authenticated HTTP endpoint.
 */

const WS = "device_floorplan";
const VERSION = "0.7.1";

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

const GROUPS = {
  lights: ["Lights", "mdi:lightbulb-outline"],
  plugs_switches: ["Switches & plugs", "mdi:power-socket-eu"],
  climate: ["Climate", "mdi:thermostat"],
  covers: ["Covers", "mdi:window-shutter"],
  contacts: ["Doors & windows", "mdi:door"],
  motion: ["Motion & presence", "mdi:motion-sensor"],
  sensors: ["Sensors", "mdi:thermometer"],
  buttons: ["Buttons & remotes", "mdi:gesture-tap-button"],
  media: ["Media & screens", "mdi:television"],
  security: ["Security", "mdi:shield-home-outline"],
  cameras: ["Cameras", "mdi:cctv"],
  appliances: ["Appliances", "mdi:washing-machine"],
  network: ["Network & repeaters", "mdi:router-wireless"],
  computers: ["Computers & servers", "mdi:server"],
  helpers: ["Helpers & entities", "mdi:tune-variant"],
  other: ["Other", "mdi:devices"],
};

const STATUSES = [
  ["unplaced", "To place"],
  ["approx", "Approx"],
  ["placed", "Placed"],
  ["elsewhere", "On another floor"],
  ["new", "New"],
  ["skipped", "Skipped"],
];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/></svg>',
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
.save { font-size: 13px; color: var(--df-ok); padding: 0 6px; white-space:nowrap; }
.save.busy { color: var(--df-sec); }
.save.err { color: var(--error-color, #b3261e); }
.toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding: 8px 16px; background: var(--df-card); border-bottom: 1px solid var(--df-div); }
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
main { flex:1; min-height:0; display:flex; gap:12px; padding:12px 16px; overflow:hidden; }
.plancard { flex: 1 1 auto; min-width:0; min-height:0; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.canvas { position:relative; flex:1 1 0; min-height:220px; background: var(--primary-background-color); border-radius:8px; overflow:hidden; }
.viewport { position:absolute; left:50%; top:50%; transform: translate(-50%, -50%); overflow:hidden; touch-action:none; user-select:none; -webkit-user-select:none; }
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
.fbtn { display:flex; align-items:center; gap:6px; border:1px solid var(--df-div); background: var(--df-card); border-radius:16px; padding:6px 10px; font-size:13px; cursor:pointer; }
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
.ahd { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; border:3px solid #4fa3ff; cursor:grab; pointer-events:auto; touch-action:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.ohd { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; border:3px solid #26c6da; cursor:grab; pointer-events:auto; touch-action:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.details .lsec.opn { border-color: color-mix(in srgb, #26c6da 45%, transparent); background: color-mix(in srgb, #26c6da 8%, var(--df-card)); }
.details .lsec.air { border-color: color-mix(in srgb, #4fa3ff 45%, transparent); background: color-mix(in srgb, #4fa3ff 8%, var(--df-card)); }
.details .lcol { display:flex; align-items:center; gap:8px; font-size:12px; color: var(--df-sec); }
.details .lcol button { border:1px solid var(--df-div); background: var(--df-card); color: inherit; border-radius:12px; padding:2px 10px; font: inherit; cursor:pointer; }
.details .lcol button.on { border-color:#f59e0b; color: var(--primary-text-color); }
.details .lcol input[type=range] { flex:1; min-width:80px; height:6px; -webkit-appearance:none; appearance:none; border-radius:3px; background: linear-gradient(90deg, rgb(255,160,70), rgb(255,240,225), rgb(200,220,255)); outline:none; opacity:.55; }
.details .lcol input[type=range].on { opacity:1; }
.details .lcol input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #f59e0b; cursor:pointer; }
.details .lcol input[type=color] { width:28px; height:24px; padding:0; border:1px solid var(--df-div); border-radius:6px; background:none; cursor:pointer; opacity:.6; }
.details .lcol input[type=color].on { opacity:1; border-color:#f59e0b; }
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
  main { flex-direction:column; padding:8px; gap:8px; }
  .plancard { flex: 1 1 58%; padding:8px; }
  .side { flex: 1 1 42%; width:auto; }
}
`;

/** 0.7.0: door, window or shutter, from the device class and the name. */
function guessOpenAs(eid, hass, name) {
  const st = eid && hass && hass.states[eid];
  const dc = (st && st.attributes.device_class) || "";
  const n = `${eid || ""} ${name || ""} ${(st && st.attributes.friendly_name) || ""}`.toLowerCase();
  if (/shutter|roller|blind|rolet|ρολ|jalous|persian|store|tapparell|persiana/.test(n)) return "shutter";
  if (String(eid || "").startsWith("cover.")) return ["door", "garage", "gate"].includes(dc) ? "door" : dc === "window" ? "window" : "shutter";
  if (["door", "garage_door"].includes(dc)) return "door";
  return "window";
}

class DeviceFloorplanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.plans = [];
    this.devices = [];
    this.byId = new Map();
    this.areas = [];
    this.areaById = new Map();
    this.floors = [];
    this.skipped = new Set();
    this.seen = new Set();
    this.mainEntity = {};
    this.deviceOpts = {};
    this.partOf = {};
    this.setupDone = true;
    this.work = null;
    this._undo = [];
    this._redo = [];
    this._seenQueue = new Set();
    this.s = {
      planId: lsGet("plan", null),
      tool: "place",
      guide: lsGet("guide", true),
      more: lsGet("more", false),
      colorBy: lsGet("colorBy", "conn"),
      names: lsGet("names", "hover"),
      groupBy: lsGet("groupBy", "room"),
      allFloors: false,
      conn: [],
      type: [],
      status: [],
      q: "",
      pop: null,
      collapsed: {},
      sel: null,
      placing: null,
      placingRoom: null,
      queue: true,
      z: 1,
      tx: 0,
      ty: 0,
      fan: null,
      m1: null,
      m2: null,
      mh: null,
      ask: false,
      skipAuto: false,
      lenInput: "",
      flash: null,
      toast: null,
      dialog: null,
      save: "ok",
      loading: true,
      error: null,
      layersOpen: false,
      toolsOpen: lsGet("tools", true),
      placingBox: null,
      layers: lsGet("layers", { refs: true, rooms: true, devices: true }),
      refSel: null,
      refLen: "",
      menu: null,
      img: {},
    };
    this.mergedInto = {};
    this.templates = [];
    this._onKey = this._onKey.bind(this);
  }

  // ------------------------------------------------------------------ HA glue
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
    else this._hydrateSoon();
  }
  get hass() {
    return this._hass;
  }
  set narrow(v) {
    this._narrow = v;
  }
  set panel(_p) {}
  set route(_r) {}

  connectedCallback() {
    window.addEventListener("keydown", this._onKey);
    if (this._vp && this._ro) this._ro.observe(this._vp.parentElement);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKey);
    if (this._ro) this._ro.disconnect();
    this._flushSave();
  }

  _ws(type, extra = {}) {
    return this._hass.callWS({ type: `${WS}/${type}`, ...extra });
  }

  async _init() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="app" id="app"></div>`;
    this._app = this.shadowRoot.getElementById("app");
    this._bindRoot();
    if (!customElements.get("ha-state-icon")) customElements.whenDefined("ha-state-icon").then(() => this._render());
    fetch(`${STATIC}/templates/templates.json?v=${VERSION}`)
      .then((r) => r.json())
      .then((j) => {
        this.templates = j.templates || [];
        this._render();
      })
      .catch(() => {});
    try {
      await this._load();
      const params = new URLSearchParams(window.location.search);
      if (params.get("new")) this.s.status = ["new"];
    } catch (err) {
      this.s.error = err.message || String(err);
    }
    this.s.loading = false;
    this._render();
    let seen = false;
    try {
      seen = window.localStorage.getItem("device_floorplan_intro_seen_v1") === "1";
    } catch (_e) {
      seen = false;
    }
    if (!seen && !this.s.error) this._showIntro();
  }

  /** The welcome dialog (first visit, or "⋮ → Show intro"). */
  async _showIntro() {
    try {
      await import(`${STATIC}/intro/device-floorplan-intro.js?v=${VERSION}`);
    } catch (_e) {
      return;
    }
    let el = this.shadowRoot.querySelector("device-floorplan-intro");
    if (el) el.remove();
    el = document.createElement("device-floorplan-intro");
    el.setAttribute("image-base", `${STATIC}/intro/`);
    el.setAttribute("guide-url", `${STATIC}/guide/sketch.html`);
    el.addEventListener("intro-action", (e) => {
      el.remove();
      const action = e.detail && e.detail.action;
      if (action === "later") return;
      // "Try a sample plan" shows the samples first; nothing is chosen for the user.
      this.s.form = { fromIntro: true, samplesFirst: action === "sample" };
      if (this.plans.length) this.s.dialog = { type: "create" };
      this._render();
    });
    this.shadowRoot.appendChild(el);
  }

  async _load() {
    const [st, dv] = await Promise.all([this._ws("state"), this._ws("devices")]);
    this._applyState(st);
    this._applyDevices(dv);
    if (!this.plans.find((p) => p.id === this.s.planId)) this.s.planId = this.plans[0] ? this.plans[0].id : null;
    this._openPlan(this.s.planId, true);
  }

  _applyState(st) {
    this.plans = st.plans.slice().sort((a, b) => this._planOrder(a) - this._planOrder(b));
    this.skipped = new Set(st.skipped);
    this.seen = new Set(st.seen);
    this.mainEntity = st.main_entity || {};
    this.deviceOpts = st.device_opts || {};
    this.setupDone = !!st.setup_done;
  }

  _planOrder(p) {
    if (p.kind === "floor") return (p.level ?? 0) * 10;
    return 100000 + (p.sort || 0);
  }

  _applyDevices(dv) {
    this.areas = dv.areas;
    this.areaById = new Map(this.areas.map((a) => [a.area_id, a]));
    // Entities without a device (helpers, YAML templates): listed only when placed or
    // found by the search; placed on their own as "entity:<entity_id>".
    const loose = (dv.loose || []).map((e) => {
      const area = e.area_id ? this.areaById.get(e.area_id) : null;
      return {
        id: `entity:${e.entity_id}`,
        entity_id: e.entity_id,
        loose: true,
        name: e.name,
        manufacturer: null,
        model: null,
        area_id: e.area_id,
        area_name: area ? area.name : null,
        floor_id: area ? area.floor_id : null,
        integration: null,
        platform: e.platform,
        conns: [],
        virtual: false,
        group: e.group || "helpers",
        physical: !!e.physical,
        main_entity: e.entity_id,
        entities: [],
        merged: [],
        parts: [],
        search: `${e.entity_id} ${e.name}`.toLowerCase(),
      };
    });
    this.devices = dv.devices.concat(loose);
    this.byId = new Map(this.devices.map((d) => [d.id, d]));
    this.floors = (dv.floors || []).slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    this.mergedInto = dv.merged_into || {};
    this.partOf = dv.part_of || {};
  }

  _plan() {
    return this.plans.find((p) => p.id === this.s.planId) || null;
  }

  _openPlan(planId, initial = false) {
    if (!initial) this._flushSave();
    this.s.planId = planId;
    lsSet("plan", planId);
    const plan = this._plan();
    this.work = plan ? { positions: clone(plan.positions) || {}, anchors: clone(plan.anchors) || {}, refs: clone(plan.refs) || [], hidden_rooms: clone(plan.hidden_rooms) || [], bonds: clone(plan.bonds) || {}, bond_meta: clone(plan.bond_meta) || {}, phantoms: clone(plan.phantoms) || {}, shapes: clone(plan.shapes) || {} } : null;
    this._undo = [];
    this._redo = [];
    Object.assign(this.s, { sel: null, memberView: null, stack: null, itip: null, placing: null, placingRoom: null, fan: null, m1: null, m2: null, mh: null, ask: false, z: 1, tx: 0, ty: 0, refSel: null, menu: null, layersOpen: false, imgFailed: null });
    if (!this.s.dialog) this.s.form = null;
    if (plan) {
      let dirty = false;
      // 0.3 kept "rooms not on this plan" in the browser: move them to HA once.
      const legacy = lsGet(`ignored_${plan.id}`, null);
      if (legacy && legacy.length && !this.work.hidden_rooms.length) {
        this.work.hidden_rooms = legacy.slice();
        dirty = true;
      }
      if (legacy) lsSet(`ignored_${plan.id}`, null);
      // Positions of devices that are now merged into a parent (or are parts of it) move to the parent.
      for (const [child, parent] of Object.entries({ ...(this.mergedInto || {}), ...(this.partOf || {}) })) {
        if (this.work.positions[child]) {
          if (!this.work.positions[parent]) this.work.positions[parent] = this.work.positions[child];
          delete this.work.positions[child];
          dirty = true;
        }
      }
      if (dirty) setTimeout(() => this._scheduleSave(), 0);
      this._signImage(plan);
    }
    if (plan) this.s.tool = this._firstOpenStep();
  }

  // ------------------------------------------------------------ derived data
  _imageType() {
    const p = this._plan();
    return p ? p.image_type : "top";
  }

  _scopeFloor() {
    const p = this._plan();
    if (!p || p.kind !== "floor" || !p.floor_id || this.s.allFloors) return null;
    return p.floor_id;
  }

  _inScope(d) {
    const f = this._scopeFloor();
    if (!f) return true;
    return !d.area_id || !d.floor_id || d.floor_id === f;
  }

  _otherFloorPlan(d) {
    const p = this._plan();
    if (!p || p.kind !== "floor") return null;
    return this.plans.find((o) => o.id !== p.id && o.kind === "floor" && o.positions && o.positions[d.id]) || null;
  }

  _status(d) {
    if (this.skipped.has(d.id)) return "skipped";
    const pos = this.work && this.work.positions[d.id];
    if (pos) return pos.approx ? "approx" : "placed";
    if (this._otherFloorPlan(d)) return "elsewhere";
    if (this._inHiddenRoom(d)) return "hiddenroom";
    return "unplaced";
  }

  _isNew(d) {
    return this.setupDone && !d.loose && !this.seen.has(d.id) && !d.virtual;
  }

  /** Entities without a device only show up when placed on this plan or found by the search. */
  _listable(d) {
    if (d.split) return false;
    if (!d.loose || d.physical) return true;
    return !!(this.work && this.work.positions[d.id]) || !!this.s.q.trim();
  }

  /** Devices that count (steps, rooms, guide): real devices, plus entities placed here. */
  _counted(d) {
    if (d.split) return false;
    return !d.loose || d.physical || !!(this.work && this.work.positions[d.id]);
  }

  _hay(d) {
    return `${d.name} ${d.area_name || ""} ${d.model || ""} ${d.manufacturer || ""} ${d.integration || ""} ${d.search || ""}`.toLowerCase();
  }

  /** The entity a search matched, when it wasn't the device itself (shown under the name). */
  _matchedEntity(d) {
    const q = this.s.q.trim().toLowerCase();
    if (!q || d.loose) return null;
    const own = `${d.name} ${d.area_name || ""} ${d.model || ""} ${d.manufacturer || ""} ${d.integration || ""}`.toLowerCase();
    if (own.includes(q)) return null;
    const e = (d.entities || []).find((x) => `${x.entity_id} ${x.name}`.toLowerCase().includes(q));
    if (e) return e.name || e.entity_id;
    const word = (d.search || "").split(" ").find((w) => w.includes(q));
    return word || null;
  }

  _roomsForPlan(withEmpty = false) {
    const f = this._scopeFloor();
    const counts = {};
    for (const d of this.devices) {
      if ((d.loose && !d.physical) || !d.area_id || this.skipped.has(d.id) || !this._inScope(d)) continue;
      counts[d.area_id] = (counts[d.area_id] || 0) + 1;
    }
    return this.areas
      .filter((a) => (withEmpty || counts[a.area_id]) && (!f || a.floor_id === f || !a.floor_id))
      .map((a) => ({ ...a, count: counts[a.area_id] || 0, pos: this.work ? this.work.anchors[a.area_id] : null, ignored: this._ignoredRooms().includes(a.area_id) }));
  }

  _ignoredRooms() {
    return (this.work && this.work.hidden_rooms) || [];
  }

  /** Unplaced device whose room is marked "not on this plan". */
  _inHiddenRoom(d) {
    return !!(d.area_id && this.work && this.work.hidden_rooms.includes(d.area_id) && !this.work.positions[d.id]);
  }

  /** Resolve the plan image to a signed URL (images need a login). */
  _signImage(plan) {
    if (!plan || !this._hass) return;
    for (const key of ["image_url", "image_fallback_url"]) {
      const url = plan[key];
      if (!url || this.s.img[url]) continue;
      signUrl(this._hass, url)
        .then((signed) => {
          this.s.img[url] = signed;
          this._render();
        })
        .catch(() => {
          this.s.img[url] = url;
          this._render();
        });
    }
  }

  _imgSrc(plan) {
    if (!plan || !plan.image_url) return null;
    if (this.s.imgFailed === plan.image_url && plan.image_fallback_url) return this.s.img[plan.image_fallback_url] || null;
    return this.s.img[plan.image_url] || null;
  }

  _scale() {
    const p = this._plan();
    if (!p || !p.width || !p.height || !this.work) return { x: null, y: null, refs: [] };
    const per = {};
    for (const r of this.work.refs) {
      const px = Math.hypot(((r.bx - r.ax) * p.width) / 100, ((r.by - r.ay) * p.height) / 100);
      if (px > 0) per[r.dir] = r.length / px;
    }
    const one = per.h || per.v || null;
    return { x: per.h || one, y: per.v || one, h: per.h, v: per.v, refs: this.work.refs };
  }

  _distM(a, b) {
    const p = this._plan();
    const sc = this._scale();
    if (!sc.x || !p) return null;
    return Math.hypot((((b.x - a.x) * p.width) / 100) * sc.x, (((b.y - a.y) * p.height) / 100) * sc.y);
  }

  _matches(d, st) {
    const s = this.s;
    // Searching finds everything: filters, skipped, hidden rooms and other floors are ignored.
    if (s.q.trim()) return this._hay(d).includes(s.q.trim().toLowerCase());
    if (!this._listable(d)) return false;
    if (!this._inScope(d)) return false;
    if (s.conn.length && !d.conns.some((c) => s.conn.includes(c))) return false;
    if (s.type.length && !s.type.some((t) => this._inType(d, t))) return false;
    if (st === "hiddenroom" && !s.withHidden) return false;
    if (s.status.length && !s.withHidden) {
      const ok = s.status.some((x) => (x === "new" ? this._isNew(d) && st !== "skipped" : x === st));
      if (!ok) return false;
    } else if (st === "skipped") return false;
    return true;
  }

  _markerMatch(d, st) {
    const s = this.s;
    // Just placed: never faded until filters or search change (#42).
    if (this._fresh && this._fresh.has(d.id)) return true;
    // While searching the plan follows the list: filters are ignored (#42).
    if (s.q.trim()) return this._hay(d).includes(s.q.trim().toLowerCase());
    if (s.conn.length && !d.conns.some((c) => s.conn.includes(c))) return false;
    if (s.type.length && !s.type.some((t) => this._inType(d, t))) return false;
    const onPlan = s.status.filter((x) => x === "approx" || x === "placed");
    if (onPlan.length && !onPlan.includes(st)) return false;
    return true;
  }

  _filtering() {
    const s = this.s;
    return !!(s.conn.length || s.type.length || s.status.length || s.q);
  }

  // ------------------------------------------------------------ undo + save
  _snap() {
    return { positions: clone(this.work.positions), anchors: clone(this.work.anchors), refs: clone(this.work.refs), hidden_rooms: clone(this.work.hidden_rooms), bonds: clone(this.work.bonds || {}), bond_meta: clone(this.work.bond_meta || {}), phantoms: clone(this.work.phantoms || {}), shapes: clone(this.work.shapes || {}), skipped: [...this.skipped] };
  }

  _pushUndo(snap) {
    this._undo.push(snap || this._snap());
    if (this._undo.length > 50) this._undo.shift();
    this._redo = [];
  }

  _restore(snap) {
    const before = new Set(this.skipped);
    this.work.positions = snap.positions;
    this.work.anchors = snap.anchors;
    this.work.refs = snap.refs;
    this.work.hidden_rooms = snap.hidden_rooms || [];
    this.work.bonds = snap.bonds || {};
    this.work.bond_meta = snap.bond_meta || {};
    this.work.phantoms = snap.phantoms || {};
    this.work.shapes = snap.shapes || {};
    const after = new Set(snap.skipped);
    const nowSkipped = [...after].filter((x) => !before.has(x));
    const nowUnskipped = [...before].filter((x) => !after.has(x));
    this.skipped = after;
    if (nowSkipped.length) this._ws("devices/skip", { device_ids: nowSkipped, skipped: true }).catch((e) => this._saveError(e));
    if (nowUnskipped.length) this._ws("devices/skip", { device_ids: nowUnskipped, skipped: false }).catch((e) => this._saveError(e));
    this._scheduleSave();
  }

  _undoAct() {
    if (!this._undo.length || !this.work) return;
    const snap = this._undo.pop();
    this._redo.push(this._snap());
    this._restore(snap);
    this.s.toast = null;
    this._render();
  }

  _redoAct() {
    if (!this._redo.length || !this.work) return;
    const snap = this._redo.pop();
    this._undo.push(this._snap());
    this._restore(snap);
    this._render();
  }

  _change(fn, snap) {
    if (!this.work) return;
    this._pushUndo(snap);
    fn();
    this._scheduleSave();
    this._render();
  }

  _scheduleSave() {
    this.s.save = "busy";
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this._flushSave(), 600);
    this._renderSave();
  }

  async _flushSave() {
    clearTimeout(this._saveT);
    this._saveT = null;
    const plan = this._plan();
    if (!plan || !this.work || this.s.save !== "busy") return;
    // Bonds only keep members that are still on the plan.
    const bonds = {};
    for (const [k, v] of Object.entries(this.work.bonds || {})) {
      const m = v.filter((id) => this.work.positions[id]);
      if (m.length >= 2) bonds[k] = m;
    }
    this.work.bonds = bonds;
    const bondMeta = {};
    for (const [k, v] of Object.entries(this.work.bond_meta || {})) if (bonds[k]) bondMeta[k] = v;
    this.work.bond_meta = bondMeta;
    // Phantom members must be on the plan; empty phantoms are kept while you fill them.
    const phantoms = {};
    for (const [k, v] of Object.entries(this.work.phantoms || {})) phantoms[k] = { ...v, members: (v.members || []).filter((id) => this.work.positions[id]) };
    this.work.phantoms = phantoms;
    const body = { plan_id: plan.id, positions: this.work.positions, anchors: this.work.anchors, refs: this.work.refs, hidden_rooms: this.work.hidden_rooms, bonds, bond_meta: bondMeta, phantoms, shapes: this.work.shapes || {} };
    try {
      const res = await this._ws("plan/update", body);
      Object.assign(plan, { positions: res.positions, anchors: res.anchors, refs: res.refs, hidden_rooms: res.hidden_rooms, bonds: res.bonds || {}, bond_meta: res.bond_meta || {}, phantoms: res.phantoms || {}, shapes: res.shapes || {} });
      if (this._saveT === null && this.s.save === "busy") this.s.save = "ok";
    } catch (err) {
      this._saveError(err);
    }
    this._renderSave();
  }

  _saveError(err) {
    this.s.save = "err";
    this.s.saveErr = err.message || String(err);
    this._renderSave();
  }

  _markSeen(ids) {
    for (const id of ids) if (!this.seen.has(id)) this._seenQueue.add(id);
    if (!this._seenQueue.size) return;
    clearTimeout(this._seenT);
    this._seenT = setTimeout(() => {
      const list = [...this._seenQueue];
      this._seenQueue.clear();
      list.forEach((id) => this.seen.add(id));
      this._ws("devices/seen", { device_ids: list }).catch(() => {});
    }, 800);
  }

  async _setSkipped(ids, skipped) {
    ids.forEach((id) => (skipped ? this.skipped.add(id) : this.skipped.delete(id)));
    this._markSeen(ids);
    try {
      await this._ws("devices/skip", { device_ids: ids, skipped });
    } catch (err) {
      this._saveError(err);
    }
  }

  _toast(text, withUndo = true) {
    this.s.toast = { text, undo: withUndo };
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      this.s.toast = null;
      this._renderToast();
    }, 9000);
    this._renderToast();
  }

  // ------------------------------------------------------------------ steps
  _stepsDone() {
    const plan = this._plan();
    if (!plan || !this.work) return [false, false, false];
    const angled = plan.image_type === "angled";
    const done1 = angled || this.work.refs.length > 0 || lsGet(`skip1_${plan.id}`, false);
    const rooms = this._roomsForPlan();
    const done2 = rooms.length > 0 && rooms.every((r) => r.pos || r.ignored);
    let left = 0;
    let inScope = 0;
    for (const d of this.devices) {
      if (!this._inScope(d) || !this._counted(d)) continue;
      const st = this._status(d);
      if (st !== "skipped" && st !== "hiddenroom") inScope++;
      if (st === "unplaced" || st === "approx") left++;
    }
    return [done1, done2, inScope > 0 && left === 0];
  }

  _firstOpenStep() {
    const plan = this._plan();
    if (!plan) return "place";
    const [d1, d2] = this._stepsDone();
    if (!d1) return "measure";
    if (!d2) return "rooms";
    return "place";
  }

  _setTool(tool) {
    if (tool === "measure" && this._imageType() === "angled") return;
    Object.assign(this.s, { tool, m1: null, m2: null, mh: null, ask: false, placing: null, placingRoom: null, pop: null, refSel: null, fan: null, z: 1, tx: 0, ty: 0 });
    this._render();
  }

  // ---------------------------------------------------------------- render
  _render() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._renderNow());
  }

  _renderNow() {
    if (!this._app) return;
    this._syncSplit();
    requestAnimationFrame(() => this._fitPop());
    const sideEl = this.shadowRoot.querySelector(".side");
    // Keep the right column's scroll; a newly selected device starts at the top.
    const scroll = sideEl && this._lastSel === this.s.sel ? sideEl.scrollTop : 0;
    this._lastSel = this.s.sel;
    const focused = this.shadowRoot.activeElement;
    const focusId = focused && focused.id;
    const caret = focused && focused.selectionStart;
    this._app.innerHTML = this._html();
    this._vp = this.shadowRoot.querySelector(".viewport");
    if (this._vp) {
      if (!this._ro) this._ro = new ResizeObserver(() => this._sizeViewport());
      this._ro.disconnect();
      this._ro.observe(this._vp.parentElement);
      this._sizeViewport();
      const img = this.shadowRoot.getElementById("planimg");
      const plan = this._plan();
      if (img && plan && plan.image_fallback_url && this.s.imgFailed !== plan.image_url) {
        img.addEventListener("error", () => {
          this.s.imgFailed = plan.image_url;
          this._render();
        }, { once: true });
      }
    }
    this._bindBrandIcons();
    this._hydrateCardPreview();
    const side2 = this.shadowRoot.querySelector(".side");
    if (side2) side2.scrollTop = scroll;
    if (focusId) {
      const el = this.shadowRoot.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (_e) { /* */ }
      }
    }
    this._hydrate();
  }

  /** Fit the plan into the space left in the canvas (the legend below always stays visible). */
  _sizeViewport() {
    const plan = this._plan();
    if (!this._vp || !plan) return;
    const canvas = this._vp.parentElement;
    const ratio = plan.width && plan.height ? plan.width / plan.height : 1.6;
    const availW = Math.max(120, canvas.clientWidth - 8);
    const availH = Math.max(120, canvas.clientHeight - 8);
    const w = Math.min(availW, availH * ratio);
    this._vp.style.width = `${Math.round(w)}px`;
    this._vp.style.height = `${Math.round(w / ratio)}px`;
    const prevW = this._vpW;
    this._layout();
    if (prevW && Math.abs(prevW - this._vpW) > 2) {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this._renderOverlay(true), 120);
    }
  }

  _renderSave() {
    const el = this.shadowRoot.getElementById("save");
    if (el) el.outerHTML = this._saveHtml();
    const u = this.shadowRoot.querySelector('[data-act="undo"]');
    const r = this.shadowRoot.querySelector('[data-act="redo"]');
    if (u) u.disabled = !this._undo.length;
    if (r) r.disabled = !this._redo.length;
  }

  _renderToast() {
    const old = this.shadowRoot.getElementById("toast");
    if (old) old.remove();
    if (!this.s.toast) return;
    this._app.insertAdjacentHTML("beforeend", this._toastHtml());
  }

  _hydrateSoon() {
    if (this._hydT) return;
    this._hydT = setTimeout(() => {
      this._hydT = null;
      this._hydrate();
    }, 1500);
  }

  _hydrate() {
    if (!this._hass) return;
    const prev = this.shadowRoot.querySelector("#cardprev > device-floorplan-card");
    if (prev) prev.hass = this._hass;
    const states = this._hass.states || {};
    for (const el of this.shadowRoot.querySelectorAll("[data-ent]")) {
      const ent = el.dataset.ent;
      const so = states[ent];
      el.hass = this._hass;
      if (so) {
        el.stateObj = so;
        if (el.tagName === "HA-STATE-ICON") el.icon = undefined;
      } else {
        el.stateObj = undefined;
        el.icon = el.dataset.fallback;
      }
    }
  }

  /** Integration logo in a round avatar; falls back to the device-type icon. */
  _avatarHtml(d) {
    if (!d.integration) return `<span class="ico av">${this._iconHtml(d)}</span>`;
    const dark = this._hass && this._hass.themes && this._hass.themes.darkMode;
    const fb = (GROUPS[d.group] || GROUPS.other)[1];
    return `<span class="ico av" title="${esc(d.integration)}"><img class="brand" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${fb}" src="${BRANDS}/${encodeURIComponent(d.integration)}/${dark ? "dark_icon" : "icon"}.png"></span>`;
  }

  _bindBrandIcons() {
    for (const img of this.shadowRoot.querySelectorAll("img.brand:not([data-b])")) {
      img.dataset.b = "1";
      const swap = () => {
        const span = img.parentElement;
        if (span) span.innerHTML = `<ha-icon icon="${img.dataset.fallback}"></ha-icon>`;
      };
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener("error", swap, { once: true });
    }
  }

  async _hydrateCardPreview() {
    const box = this.shadowRoot.getElementById("cardprev");
    if (!box || box.firstChild) return;
    if (!customElements.get("device-floorplan-card")) {
      try {
        await import(`${STATIC}/device-floorplan-card.js?v=${VERSION}`);
      } catch (_e) {
        box.textContent = "Could not load the card.";
        return;
      }
    }
    if (box.firstChild) return;
    await this._flushSave();
    const card = document.createElement("device-floorplan-card");
    card.setConfig({ type: "custom:device-floorplan-card", plan: this.s.planId });
    card.hass = this._hass;
    box.appendChild(card);
  }

  _iconHtml(d) {
    if (d.split && d.as && d.as !== "other") return `<ha-icon icon="${{ light: "mdi:lightbulb", switch: "mdi:toggle-switch-variant", fan: "mdi:fan" }[d.as]}"></ha-icon>`;
    const fb = (GROUPS[d.group] || GROUPS.other)[1];
    const ent = this.mainEntity[d.id] || d.main_entity;
    if (ent && customElements.get("ha-state-icon")) return `<ha-state-icon data-ent="${esc(ent)}" data-fallback="${fb}"></ha-state-icon>`;
    return `<ha-icon icon="${fb}"></ha-icon>`;
  }

  _html() {
    const s = this.s;
    if (s.loading) return `<div class="welcome"><p>Loading…</p></div>`;
    if (s.error) return `${this._headerHtml(true)}<div class="welcome"><div class="dialog"><h2>Could not load</h2><p class="err">${esc(s.error)}</p><div class="acts"><button class="btn primary" data-act="reload">Try again</button></div></div></div>`;
    // First run: create the plan first, then choose which kinds of devices go on it.
    if (!this.plans.length) return `${this._headerHtml(true)}<div class="welcome">${this._planFormHtml("create", true)}</div>${this._modalHtml()}${this._menuHtml()}`;
    if (!this.setupDone) return `${this._headerHtml(true)}${this._setupHtml()}`;
    const p = this._plan();
    const noImage = p && !p.image_url;
    return `${this._headerHtml(false)}${noImage ? "" : this._toolbarHtml()}${this._guideHtml()}
      <main>${this._planHtml()}${noImage ? "" : this._sideHtml()}</main>${this._toastHtml()}${this._modalHtml()}${this._menuHtml()}`;
  }

  _headerHtml(bare) {
    const menu = this._narrow ? `<button class="menu-btn" data-act="menu" aria-label="Menu"><ha-icon icon="mdi:menu"></ha-icon></button>` : `<span style="width:8px"></span>`;
    const more = `<button class="iconbtn" data-act="appmenu" aria-label="Device Floorplan options" title="Device Floorplan options">${SVG.dots}</button>`;
    const title = `<h1>Device Floorplan <small class="ver" title="Device Floorplan version">v${VERSION}</small></h1>`;
    if (bare) return `<header>${menu}${title}<div class="hdr-right">${more}</div></header>`;
    const tabs = this.plans
      .map((p) => {
        const on = p.id === this.s.planId;
        const lvl = p.kind === "floor" && p.level != null ? `<small>level ${p.level}</small>` : p.kind === "view" ? `<small>view</small>` : "";
        const dot = this._planHasNew(p) ? `<span class="tabdot" title="New devices to place"></span>` : "";
        return `<span class="tabwrap ${on ? "on" : ""}"><button class="tab ${on ? "on" : ""}" data-act="plan" data-id="${esc(p.id)}">${esc(p.name)}${lvl}</button>
          <button class="tabmenu" data-act="tabmenu" data-id="${esc(p.id)}" aria-label="Floor options – ${esc(p.name)}" title="Floor options – ${esc(p.name)}">${SVG.dots}</button>${dot}</span>`;
      })
      .join("");
    const placed = this.work ? Object.keys(this.work.positions).length : 0;
    const firstReady = placed && !this._readySeen;
    if (placed) this._readySeen = true;
    const ready = placed ? `<button class="ready ${firstReady ? "anim" : ""}" data-act="ready" title="See what you get and add it to a dashboard">${SVG.check}I'm ready<small>· ${placed} placed</small></button>` : "";
    return `<header>${menu}${title}
      <nav class="tabs" aria-label="Plans">${tabs}<button class="tab new" data-act="newplan">+ New plan</button></nav>
      <div class="hdr-right">
        ${this._saveHtml()}${ready}
        <button class="iconbtn" data-act="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" ${this._undo.length ? "" : "disabled"}>${SVG.undo}</button>
        <button class="iconbtn" data-act="redo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" ${this._redo.length ? "" : "disabled"}>${SVG.redo}</button>${more}
      </div></header>`;
  }

  _planHasNew(p) {
    if (!p.floor_id || !this.setupDone) return false;
    return this.devices.some((d) => d.floor_id === p.floor_id && this._isNew(d) && !this.skipped.has(d.id) && !(p.positions && p.positions[d.id]));
  }

  _menuHtml() {
    const m = this.s.menu;
    if (!m) return "";
    const style = `left:${Math.round(m.x)}px;top:${Math.round(m.y)}px`;
    if (m.type === "app") {
      return `<div class="menu" style="${style}" role="menu">
        <button data-act="showintro" role="menuitem">${SVG.info}Show intro</button>
        ${this.plans.length ? `<button data-act="guide" role="menuitem">${SVG.eye}${this.s.guide ? "Hide" : "Show"} step-by-step guide</button>` : ""}
        ${this.plans.length && this.setupDone ? `<button data-act="resetsetup" role="menuitem">${SVG.skip}Choose devices again…</button>` : ""}
        <hr><button disabled role="menuitem" style="font-size:12px">Device Floorplan v${VERSION}</button></div>`;
    }
    const p = this.plans.find((x) => x.id === m.id);
    if (!p) return "";
    const isView = p.kind !== "floor";
    const idx = this.plans.indexOf(p);
    const canL = isView && idx > 0 && this.plans[idx - 1].kind !== "floor";
    const canR = isView && idx < this.plans.length - 1;
    const floorTip = isView ? "" : ' title="Floors are ordered by their level"';
    return `<div class="menu" style="${style}" role="menu" aria-label="Floor options">
      <button data-act="settings" role="menuitem">${SVG.gear}${isView ? "Plan" : "Floor"} settings</button>
      <button data-act="rename" role="menuitem">${SVG.edit}Rename</button>
      <button data-act="replaceimg" role="menuitem">${SVG.image}Replace image</button>
      <button data-act="export" role="menuitem">${SVG.download}Export…</button>
      <button data-act="moveplan" data-dir="-1" role="menuitem" ${canL ? "" : "disabled"}${floorTip}>← Move left</button>
      <button data-act="moveplan" data-dir="1" role="menuitem" ${canR ? "" : "disabled"}${floorTip}>Move right →</button>
      <hr><button class="danger" data-act="askdelete" role="menuitem">${SVG.trash}Delete ${isView ? "plan" : "floor"}…</button></div>`;
  }

  _saveHtml() {
    const s = this.s;
    if (s.save === "busy") return `<span class="save busy" id="save">Saving…</span>`;
    if (s.save === "err") return `<span class="save err" id="save" title="${esc(s.saveErr)}">Not saved: ${esc(s.saveErr || "error")}</span>`;
    return `<span class="save" id="save">✓ All changes saved</span>`;
  }

  _toolbarHtml() {
    const plan = this._plan();
    if (!plan) return "";
    const [d1, d2, d3] = this._stepsDone();
    const angled = plan.image_type === "angled";
    const step = (id, n, label, done, off) =>
      `<button class="step ${this.s.tool === id ? "on" : ""}" data-act="tool" data-tool="${id}" ${off ? 'disabled title="Not available for angled images"' : ""}><span class="num ${done ? "done" : ""}">${done ? "✓" : n}</span>${label}</button>`;
    let calib = "";
    if (this.s.tool === "measure" && !angled) {
      const sc = this._scale();
      const stretched = sc.h && sc.v && Math.abs(sc.h - sc.v) / ((sc.h + sc.v) / 2) > 0.05;
      if (!sc.x) calib = `<span class="chip-status">○ Not calibrated</span>`;
      else if (stretched) calib = `<span class="chip-status warn">! Scale set · horizontal and vertical disagree</span>`;
      else if (this.work.refs.length === 1) calib = `<span class="chip-status ok">✓ Scale set · add a ${sc.h ? "vertical" : "horizontal"} measurement for best accuracy</span>`;
      else calib = `<span class="chip-status ok">✓ Scale set · horizontal + vertical</span>`;
    }
    let placing = "";
    const pd = this.s.placing && this.byId.get(this.s.placing);
    if (pd || this.s.placingRoom) {
      const name = pd ? pd.name : (this.areaById.get(this.s.placingRoom) || {}).name;
      placing = `<span class="placing">Placing <b>${esc(name)}</b> · click on the plan
        <label><input type="checkbox" data-act="queue" ${this.s.queue ? "checked" : ""}>then next</label>
        ${pd && this.s.sel !== pd.id ? `<button data-act="placingdetails">Details</button>` : ""}<button data-act="stopplace">Stop (Esc)</button></span>`;
    }
    const guideLink = `<button class="link" data-act="guide">${this.s.guide ? "Hide guide" : "Show guide"}</button>`;
    return `<div class="toolbar"><div class="steps" role="group" aria-label="Steps">
      ${step("measure", 1, "Measure", d1, angled)}${step("rooms", 2, "Mark rooms", d2)}${step("place", 3, "Place devices", d3)}</div>
      ${calib}${placing}${guideLink}</div>`;
  }

  _guideHtml() {
    const plan = this._plan();
    if (!this.s.guide || !plan) return "";
    if (!plan.image_url) {
      return this._guideBox("1", false, "Add your floorplan image", "Upload a picture of this floor: a plan seen from above works best, but an angled 3D view works too. PNG, JPG or WebP.", "", "");
    }
    const [d1, d2, d3] = this._stepsDone();
    const t = this.s.tool;
    if (t === "measure") {
      const acts = d1 ? `<button class="btn ok" data-act="tool" data-tool="rooms">Next: mark rooms →</button>` : `<button class="btn" data-act="skip1">Skip this step</button>`;
      return this._guideBox(d1 ? "✓" : "1", d1, "Step 1 of 3 · Measure (optional)", "Tell the plan how big your home really is. Click the start and the end of something you know, like a wall or a door, then type its real length.", "Best accuracy: one horizontal and one vertical measurement; the second one starts with an estimate from the first. Drag the ends of a line to adjust it, click its label to change the length or delete it. Drawing a new one in the same direction replaces the old one. Esc or ✕ cancels a line you're drawing. You can skip this step; placing devices works without it.", acts);
    }
    if (t === "rooms") {
      const rooms = this._roomsForPlan();
      const pinned = rooms.filter((r) => r.pos || r.ignored).length;
      const anyAreas = this._roomsForPlan(true).length > 0;
      const tip = !rooms.length
        ? anyAreas
          ? "Your rooms are listed, but no device is assigned to them yet: open a device in HA and choose its area, then come back. Or skip this step and place devices by hand."
          : "None of your devices has an area yet. Assign each device to an area in its device page, then come back: rooms appear here. Or skip this step and place devices by hand."
        : d2
          ? `All ${rooms.length} rooms are on the plan. You can still drag a pin to adjust it.`
          : `${pinned} of ${rooms.length} rooms on the plan. "Done" appears when all of them are placed.`;
      const areaLinks = !rooms.length ? `<a class="btn" href="/config/areas/dashboard" target="_self">${anyAreas ? "Open areas" : "Create areas"}</a><a class="btn" href="https://www.home-assistant.io/docs/organizing/areas/" target="_blank" rel="noopener">How areas work${SVG.ext}</a>` : "";
      const acts = areaLinks + (d2 || !rooms.length ? `<button class="btn ok" data-act="tool" data-tool="place">Done, place devices →</button>` : "");
      return this._guideBox(d2 ? "✓" : "2", d2, "Step 2 of 3 · Mark rooms", "Your rooms from HA are listed on the right. Drag each one onto the plan and drop it in the middle of that room, or click a room and then click on the plan. Auto-place uses them to put each device in the right room. Rooms that are not on this plan: hide them with the eye button, their devices leave the list. Optional: Shape draws a room's outline, so its lights stay inside (edges snap straight, hold Alt for a free angle).", tip, acts);
    }
    let left = 0;
    let approx = 0;
    let inScope = 0;
    for (const d of this.devices) {
      if (!this._inScope(d) || !this._counted(d)) continue;
      const st = this._status(d);
      if (st !== "skipped") inScope++;
      if (st === "unplaced") left++;
      else if (st === "approx") approx++;
    }
    if (!inScope) {
      const fl = this.floors.find((f) => f.floor_id === plan.floor_id);
      return this._guideBox("3", false, "No devices on this floor yet", `Devices show up here when their HA area is on ${fl ? fl.name : "this floor"}. To place devices from other floors here, tick “Devices from all floors” in the list.`, "", "");
    }
    if (d3) return this._guideBox("✓", true, "All devices are on the plan", "Everything is saved automatically. Press “I'm ready” at the top to put the plan on a dashboard. You can come back any time; new devices you add to HA show up here marked New.", "", "");
    return this._guideBox("3", false, "Step 3 of 3 · Place devices", "Use Type, Connection or Status in the list to choose what to work on. Press Auto-place for a quick start, or click a device and then click on the plan. Focus on the right spot for each device: icons and what each marker shows can be adjusted later in the dashboard card.", `Dashed rings are approximate: drag them to the exact spot or ✓ confirm them. ${left} to place · ${approx} approximate. Skip anything you don't want on the plan. Can't find something? Type its name or entity id in the search.`, "");
  }

  _guideBox(step, done, title, text, tip, acts) {
    return `<div class="guide"><span class="badge ${done ? "done" : ""}">${step}</span>
      <div class="txt"><div class="t1">${esc(title)}</div><div class="t2">${esc(text)}</div>${tip ? `<div class="t3">${esc(tip)}</div>` : ""}</div>
      ${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;
  }

  // ---------------------------------------------------------------- plan
  _planHtml() {
    const plan = this._plan();
    if (!plan) return "";
    const names = this.s.names === "always" ? "names-always" : this.s.names === "off" ? "names-off" : "";
    const cross = this.s.placing || this.s.placingRoom || this.s.placingBox || this.s.tool === "measure";
    const grab = this.s.z > 1 ? "zoomed" : "";
    if (!plan.image_url) {
      // No image yet: offer the same choices as when creating a plan (no viewport,
      // so nothing can swallow the clicks; this was the 0.3 "Upload does nothing" bug).
      return `<section class="plancard" style="overflow:auto"><div style="max-width:640px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:12px;padding:8px 0">
        <h2 style="margin:0;font-size:18px;font-weight:500">Add the floorplan image for “${esc(plan.name)}”</h2>
        ${this._imageChooserHtml("canvas")}</div></section>`;
    }
    const src = this._imgSrc(plan);
    const fadeRefs = this._layer("refs") === "faded" ? "fade-refs" : "";
    return `<section class="plancard" aria-label="Floorplan">
      <div class="canvas" id="canvas">
        <div class="viewport ${cross ? "cross" : ""} ${grab} ${names}" data-vp>
          <div class="stage" id="stage">${src ? `<img src="${esc(src)}" alt="" draggable="false" id="planimg">` : ""}
            <svg class="ov ${fadeRefs}" viewBox="0 0 1000 1000" preserveAspectRatio="none" id="ovsvg">${this._svgOverlay()}</svg></div>
          <div class="layer" id="layer">${this._overlayHtml()}</div>
        </div>
        ${this._canvasCtlHtml()}${this._shapeBoxHtml()}
      </div>
      ${this.s.imgFailed === plan.image_url && plan.image_fallback_url ? `<div class="warnbox" style="margin:0">The original image (${esc(plan.image_url)}) was not found, so the saved copy is shown. <button class="link" data-act="replaceimg">Choose the image again</button></div>` : ""}
      ${this._footHtml()}
    </section>`;
  }

  /** "full" | "faded" | "off" for a layer in the current step. */
  _layer(name) {
    const own = { measure: "refs", rooms: "rooms", place: "devices" }[this.s.tool] || "devices";
    if (name === own) return "full";
    if (name === "refs" && this._imageType() === "angled") return "off";
    return this.s.layers[name] === false ? "off" : "faded";
  }

  _canvasCtlHtml() {
    const s = this.s;
    const plan = this._plan();
    const sc = this._scale();
    let scale = "";
    if (sc.x && plan.image_type !== "angled" && this._layer("refs") !== "off") {
      const pxPerM = 1 / sc.x;
      const vpW = this._vpW || 800;
      const metres = [0.5, 1, 2, 5, 10, 20].find((m) => ((m * pxPerM) / plan.width) * vpW * s.z > 60) || 20;
      const px = ((metres * pxPerM) / plan.width) * vpW * s.z;
      scale = `<div class="ovctl scalectl" id="scalectl"><div class="scalebar" id="scalebar" style="width:${Math.round(px)}px" data-m="${metres}"><span>${metres} m</span><span></span></div></div>`;
    }
    const own = { measure: "refs", rooms: "rooms", place: "devices" }[s.tool] || "devices";
    const row = (key, label) => {
      const locked = key === own;
      const angledOff = key === "refs" && plan.image_type === "angled";
      const on = locked || (s.layers[key] !== false && !angledOff);
      return `<button class="lrow ${on ? "" : "off"}" data-act="layer" data-key="${key}" ${locked || angledOff ? "disabled" : ""} aria-pressed="${on}"><span class="eye">${SVG.eye}</span><span class="l">${label}</span>${locked ? "<small>current step</small>" : angledOff ? "<small>angled image</small>" : ""}</button>`;
    };
    const phBtn = s.tool === "place" ? `<button class="ovbtn ${String(s.sel || "").startsWith("ph:") ? "on" : ""}" data-act="phnew" aria-label="New phantom" title="New phantom: one combined value from several devices"><ha-icon icon="dfp:phantom-plus"></ha-icon></button>` : "";
    const layers = `<div class="ovctl layerctl">${this._extraCtlHtml ? this._extraCtlHtml() : ""}${phBtn}<div class="lwrap"><button class="ovbtn ${s.layersOpen ? "open" : ""}" data-act="layers" aria-label="Layers" title="Layers" aria-expanded="${s.layersOpen}">${SVG.layers}</button>
      ${s.layersOpen ? `<div class="layerpop" role="dialog" aria-label="Layers"><h4>Show on the plan</h4>${row("refs", "Measurements")}${row("rooms", "Rooms")}${row("devices", "Devices")}${row("bonds", "Bonds")}${row("phantoms", "Phantoms")}${this._extraLayerRows ? this._extraLayerRows(row) : ""}${s.tool === "place" ? row("others", "Devices outside the filter") : ""}</div>` : ""}</div></div>`;
    const zoom = `<div class="ovctl zoomctl"><div class="zoom"><button data-act="zoomout" aria-label="Zoom out">−</button><span id="zl">${Math.round(s.z * 100)}%</span><button data-act="zoomin" aria-label="Zoom in">+</button><button class="fit" data-act="zoomfit">Fit</button></div></div>`;
    return scale + layers + zoom;
  }

  _svgOverlay() {
    const parts = [this._lightSvg()];
    const lr = this._layer("refs");
    if (this.work && lr !== "off") {
      this.work.refs.forEach((r, i) => {
        const on = lr === "full" && this.s.refSel === i;
        parts.push(`<line class="ref" x1="${r.ax * 10}" y1="${r.ay * 10}" x2="${r.bx * 10}" y2="${r.by * 10}" stroke="var(--df-primary)" stroke-width="${on ? 3.5 : 2}" ${lr === "full" ? "" : 'stroke-dasharray="6 4"'} vector-effect="non-scaling-stroke"/>`);
      });
    }
    if (this.s.tool === "measure" && this.s.m1) {
      const b = this.s.m2 || this.s.mh || this.s.m1;
      parts.push(`<line id="mline" x1="${this.s.m1.x * 10}" y1="${this.s.m1.y * 10}" x2="${b.x * 10}" y2="${b.y * 10}" stroke="#c2410c" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`);
    }
    // Room shapes (#111): every room in its own see-through colour while marking rooms.
    if (this.work && ((this.s.tool === "rooms" && this.s.layers.roomshapes !== false) || this.s.shapeEdit)) {
      const cols = ["#4f9de0", "#7cc04b", "#f0a030", "#e57399", "#e8d24a", "#9b7be0", "#4fc1b5", "#e0784f"];
      const colOf = (aid) => cols[[...aid].reduce((t, ch) => t + ch.charCodeAt(0), 0) % cols.length];
      for (const [aid, sp0] of Object.entries(this.work.shapes || {})) {
        if (aid === this.s.shapeEdit) continue;
        const c = colOf(aid);
        parts.push(`<polygon points="${sp0.map((p) => `${p[0] * 10},${p[1] * 10}`).join(" ")}" fill="${c}" fill-opacity=".38" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);
      }
    }
    if (this.work && this.s.shapeEdit && (this.work.shapes || {})[this.s.shapeEdit]) {
      const sp = this.work.shapes[this.s.shapeEdit];
      const pts = sp.map((p) => `${p[0] * 10},${p[1] * 10}`).join(" ");
      parts.push(`<polygon points="${pts}" fill="rgba(255,255,255,.28)" stroke="none"/>`);
      sp.forEach((p, i) => {
        const q = sp[(i + 1) % sp.length];
        parts.push(`<line x1="${p[0] * 10}" y1="${p[1] * 10}" x2="${q[0] * 10}" y2="${q[1] * 10}" stroke="#b3261e" stroke-width="2" vector-effect="non-scaling-stroke"/>`);
      });
    }
    // Device with a separate box / radio spot: dashed line when either is selected.
    const sel = this.s.sel && this.work && this.work.positions[this.s.sel];
    const phSel = String(this.s.sel || "").startsWith("ph:") && this.work && (this.work.phantoms || {})[this.s.sel.slice(3)];
    if (phSel) for (const m of phSel.members || []) {
      const q = this.work.positions[m];
      if (q) parts.push(`<line x1="${phSel.x * 10}" y1="${phSel.y * 10}" x2="${q.x * 10}" y2="${q.y * 10}" stroke="var(--primary-text-color)" stroke-width="1.4" stroke-dasharray="4 4" opacity=".7" vector-effect="non-scaling-stroke"/>`);
    }
    // Split device (#91): dashed lines from the device to the spots where its entities act.
    if (sel && this.s.sel) {
      const devId = sel.of || this.s.sel;
      const dp = this.work.positions[devId];
      if (dp) for (const k of this._splitSpots(devId)) {
        const q = this.work.positions[k];
        parts.push(`<line x1="${dp.x * 10}" y1="${dp.y * 10}" x2="${q.x * 10}" y2="${q.y * 10}" stroke="var(--df-primary)" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`);
      }
    }
    if (sel && sel.box) parts.push(`<line x1="${sel.x * 10}" y1="${sel.y * 10}" x2="${sel.box.x * 10}" y2="${sel.box.y * 10}" stroke="var(--df-primary)" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`);
    if (this._fanLines) for (const l of this._fanLines) parts.push(`<line x1="${l[0] * 10}" y1="${l[1] * 10}" x2="${l[2] * 10}" y2="${l[3] * 10}" stroke="var(--df-primary)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);
    return parts.join("");
  }

  _ringVars(d) {
    if (this.s.colorBy === "status") {
      const st = this._status(d);
      const c = st === "approx" ? "#d97706" : "var(--df-primary)";
      return { c1: c, c2: null };
    }
    if (this.s.colorBy === "none") return { c1: "var(--df-sec)", c2: null };
    const c1 = (CONN[d.conns[0]] || CONN.other).color;
    const c2 = d.conns[1] ? (CONN[d.conns[1]] || CONN.other).color : null;
    return { c1, c2 };
  }

  _visibleMarkers() {
    const out = [];
    if (!this.work) return out;
    for (const [id, pos] of Object.entries(this.work.positions)) {
      const d = this.byId.get(id);
      if (!d || this.skipped.has(id) || this._bondLeader(id) !== id) continue;
      const st = pos.approx ? "approx" : "placed";
      const b = this._bondOf(id);
      if (this.s.layers.bonds === false && (b || (d.parts && d.parts.length)) && !(b ? b[1].includes(this.s.sel) : this.s.sel === id)) continue;
      const match = b ? b[1].some((m) => this.byId.get(m) && this._markerMatch(this.byId.get(m), st)) : this._markerMatch(d, st);
      if (!match && !(b ? b[1].includes(this.s.sel) : this.s.sel === id)) continue;
      out.push({ d, pos, z: pos.z || 0 });
    }
    out.sort((a, b) => b.z - a.z);
    return out;
  }

  /** Placed devices that don't match the current filter: shown faded. */
  _dimMarkers() {
    if (!this.work || !this._filtering() || this.s.layers.others === false) return [];
    const out = [];
    for (const [id, pos] of Object.entries(this.work.positions)) {
      const d = this.byId.get(id);
      if (!d || this.skipped.has(id) || this.s.sel === id || this._bondLeader(id) !== id) continue;
      const b = this._bondOf(id);
      if (b ? b[1].some((m) => this.byId.get(m) && this._markerMatch(this.byId.get(m), pos.approx ? "approx" : "placed")) : this._markerMatch(d, pos.approx ? "approx" : "placed")) continue;
      out.push({ d, pos });
    }
    return out;
  }

  _clusters() {
    const vis = this._visibleMarkers();
    const vpW = this._vpW || 800;
    const vpH = this._vpH || 500;
    const z = this.s.z;
    const clusters = [];
    for (const m of vis) {
      const c = clusters.find((c) => Math.hypot(((c.x - m.pos.x) * z * vpW) / 100, ((c.y - m.pos.y) * z * vpH) / 100) < 20);
      if (c) c.m.push(m);
      else clusters.push({ x: m.pos.x, y: m.pos.y, m: [m] });
    }
    return clusters;
  }

  _overlayHtml() {
    const s = this.s;
    const parts = [];
    this._fanLines = [];
    // Layer rule: the current step's layer is full, the others are faded and
    // ignore clicks (or switched off in the Layers menu).
    const lRooms = this._layer("rooms");
    const lDev = this._layer("devices");
    const lRefs = this._layer("refs");
    // Room shape being drawn (#111): corners, "+" on edges, movable toolbox.
    if (this.work && s.shapeEdit && (this.work.shapes || {})[s.shapeEdit]) {
      const pts = this.work.shapes[s.shapeEdit];
      pts.forEach((p, i) => {
        parts.push(`<span class="shc" data-shc="${i}" data-x="${p[0]}" data-y="${p[1]}" title="Drag · double-click to remove"></span>`);
        const q = pts[(i + 1) % pts.length];
        parts.push(`<span class="shp" data-shp="${i}" data-x="${(p[0] + q[0]) / 2}" data-y="${(p[1] + q[1]) / 2}" title="Add a corner here">+</span>`);

      });
    }
    // room pins (under the devices)
    if (this.work && (lRooms !== "off" || s.placingRoom)) {
      for (const [aid, pos] of Object.entries(this.work.anchors)) {
        const a = this.areaById.get(aid);
        if (lRooms === "full" || s.placingRoom) {
          parts.push(`<span class="pin" data-pin="${esc(aid)}" data-x="${pos.x}" data-y="${pos.y}" title="Drag into the middle of the room">${SVG.pin}${esc(a ? a.name : aid)}</span>`);
        } else {
          parts.push(`<span class="pin lbl fade" data-x="${pos.x}" data-y="${pos.y}">${esc(a ? a.name : aid)}</span>`);
        }
      }
    }
    // devices
    if (lDev !== "off") {
      const fade = lDev === "full" ? "" : "fade";
      for (const m of this._dimMarkers()) parts.push(this._markerHtml(m.d, m.pos.x, m.pos.y, "fade"));
      for (const c of this._clusters()) {
        if (c.m.length === 1) {
          parts.push(this._markerHtml(c.m[0].d, c.m[0].pos.x, c.m[0].pos.y, fade));
          continue;
        }
        const front = c.m[0];
        if (s.fan === front.d.id && !fade) {
          const r = 34;
          const vpW = this._vpW || 800;
          const vpH = this._vpH || 500;
          c.m.forEach((m, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / c.m.length;
            const fx = c.x + (Math.cos(a) * r * 100) / (vpW * s.z);
            const fy = c.y + (Math.sin(a) * r * 100) / (vpH * s.z);
            this._fanLines.push([c.x, c.y, fx, fy]);
            parts.push(this._markerHtml(m.d, fx, fy));
          });
          continue;
        }
        const anySel = c.m.some((m) => m.d.id === s.sel);
        const v = this._ringVars(front.d);
        const names = c.m.map((m) => m.d.name).join(" · ");
        parts.push(`<button class="mk ${fade} ${anySel ? "sel" : ""} ${v.c2 ? "two" : ""} ${front.pos.approx ? "approx" : ""}" data-cluster="${esc(front.d.id)}" data-x="${c.x}" data-y="${c.y}" style="--c1:${v.c1};--c2:${v.c2 || "transparent"}" aria-label="${esc(c.m.length + " devices: " + names)}" ${fade ? 'tabindex="-1"' : ""}>
          <span class="ring">${this._iconHtml(front.d)}</span><span class="count stk">${c.m.length}</span><span class="tip">${esc(names)}</span></button>`);
        if (s.stack === front.d.id && !fade) parts.push(this._stackPopHtml(c));
      }
      // separate box / radio spots (#23): small square, draggable in the Place step
      for (const [id, pos] of Object.entries(this.work.positions)) {
        const d = this.byId.get(id);
        if (!pos.box || !d || this.skipped.has(id)) continue;
        parts.push(`<button class="bx ${fade} ${s.sel === id ? "sel" : ""}" data-box="${esc(id)}" data-x="${pos.box.x}" data-y="${pos.box.y}" aria-label="${esc(`Split device: box of ${d.name}`)}" ${fade ? 'tabindex="-1"' : ""}><span class="tip">${esc(`${d.name} · box / radio`)}</span></button>`);
      }
      // Light shape handles (#74) for the selected light.
      if (s.sel && this.work.positions[s.sel] && !fade && this._isLight(s.sel)) parts.push(this._shapeHandles(this._shape(s.sel)));
      if (s.sel && this.work.positions[s.sel] && !fade && this._climateEnt(s.sel) && this._canCool(this._climateEnt(s.sel))) {
        const c = this._air(s.sel);
        if (c.type === "cone") parts.push(`<span class="ahd" data-ah="1" data-x="${c.x + Math.cos((c.a * Math.PI) / 180) * c.r}" data-y="${c.y + Math.sin((c.a * Math.PI) / 180) * c.r * this._ratio()}" title="Drag: direction and reach of the air flow"></span>`);
      }
      // 0.7.0: the selected opening's two ends.
      if (s.sel && this.work.positions[s.sel] && !fade && this._openingEnt(s.sel) && this.work.positions[s.sel].opening) {
        const o = this.work.positions[s.sel].opening;
        parts.push(`<span class="ohd" data-oh="1" data-x="${o.x1}" data-y="${o.y1}" title="Drag: one end of the opening (Alt: free angle)"></span><span class="ohd" data-oh="2" data-x="${o.x2}" data-y="${o.y2}" title="Drag: the other end of the opening (Alt: free angle)"></span>`);
      }
      // Phantoms (#60): bigger, inverted, dashed; members stay where they are.
      if (s.layers.phantoms !== false || String(s.sel).startsWith("ph:")) {
        for (const [pid, ph] of Object.entries(this.work.phantoms || {})) {
          const n = (ph.members || []).filter((m) => this.work.positions[m]).length;
          const sel = s.sel === `ph:${pid}`;
          parts.push(`<button class="mk ph ${n < 2 ? "empty" : ""} ${sel ? "sel" : ""} ${fade && !sel ? "fade" : ""}" data-ph="${esc(pid)}" data-x="${ph.x}" data-y="${ph.y}" aria-label="${esc(`Phantom: ${ph.name || "Phantom"}`)}"><span class="ring"><ha-icon icon="${esc(ph.icon || "dfp:phantom")}"></ha-icon></span>${n ? `<span class="count phc">${n}</span>` : ""}<span class="tip">${esc(`Phantom · ${ph.name || "Phantom"}${n < 2 ? " · drag devices onto it" : ""}`)}</span></button>`);
        }
      }
      // devices that no longer exist in HA
      for (const id of this._missingIds()) {
        const pos = this.work.positions[id];
        parts.push(`<button class="mk missing ${fade} ${s.sel === id ? "sel" : ""}" data-mk="${esc(id)}" data-x="${pos.x}" data-y="${pos.y}" style="--c1:var(--df-sec)" aria-label="Device removed from Home Assistant"><span class="ring">?</span><span class="tip">Device removed from Home Assistant</span></button>`);
      }
    }
    // placing ghost
    if ((s.placing || s.placingRoom || s.placingBox) && s.hover) {
      const pb = s.placingBox ? s.placingBox.split("|") : null;
      const d = (s.placing || pb) && this.byId.get(s.placing || pb[0]);
      const name = d ? (pb ? `${d.name} · ${pb[1] || "box / radio"}` : d.name) : (this.areaById.get(s.placingRoom) || {}).name;
      parts.push(`<span class="ghost" id="ghost" data-x="${s.hover.x}" data-y="${s.hover.y}"><span class="c"></span><span class="n">${esc(name)}</span></span>`);
    }
    // saved measurements: editable in the Measure step, a faded "2.40 m" otherwise
    if (this.work && lRefs !== "off") {
      this.work.refs.forEach((r, i) => {
        const mx = (r.ax + r.bx) / 2;
        const my = (r.ay + r.by) / 2;
        if (lRefs === "full") {
          parts.push(`<span class="rh" data-rh="${i}" data-end="a" data-x="${r.ax}" data-y="${r.ay}" title="Drag to adjust"></span><span class="rh" data-rh="${i}" data-end="b" data-x="${r.bx}" data-y="${r.by}" title="Drag to adjust"></span>`);
          parts.push(`<span class="reflbl edit ${s.refSel === i ? "on" : ""}" data-refl="${i}" data-x="${mx}" data-y="${my}" title="Click to change or delete · drag to move">${r.length.toFixed(2)} m · ${r.dir === "h" ? "horizontal" : "vertical"}</span>`);
          if (s.refSel === i) {
            parts.push(`<div class="refpop" id="refpop" data-x="${mx}" data-y="${my}"><span>${r.dir === "h" ? "Horizontal" : "Vertical"}</span>
              <label>Length <input id="reflen" inputmode="decimal" value="${esc(s.refLen)}"> m</label>
              <button data-act="refsave">${SVG.check}Save</button><button class="del" data-act="refdel" title="Delete this measurement" aria-label="Delete this measurement">${SVG.trash}</button></div>`);
          }
        } else {
          parts.push(`<span class="reflbl fade" data-x="${mx}" data-y="${my}">${r.length.toFixed(2)} m</span>`);
        }
      });
    }
    // measuring a new line
    if (s.tool === "measure" && s.m1) {
      const end = s.m2 || s.mh || s.m1;
      parts.push(`<span class="mh" data-mh="a" data-x="${s.m1.x}" data-y="${s.m1.y}"></span>`);
      if (s.m2) parts.push(`<span class="mh" data-mh="b" data-x="${s.m2.x}" data-y="${s.m2.y}"></span>`);
      parts.push(`<div class="mbox" id="mbox" data-x="${(s.m1.x + end.x) / 2}" data-y="${(s.m1.y + end.y) / 2}">${this._mboxInner()}</div>`);
    }
    return parts.join("");
  }

  /** Positions whose device is gone from HA (not merged into another device). */
  /** The filter popup stays inside the right column (it scrolls, Done stays visible). */
  _fitPop() {
    // ⓘ explanations: next to their button, inside the window.
    const ip = this.shadowRoot && this.shadowRoot.querySelector(".ipop");
    if (ip) {
      const b = ip.parentElement.querySelector(".itip").getBoundingClientRect();
      const h = ip.offsetHeight;
      ip.style.left = `${Math.max(8, Math.min(window.innerWidth - 268, b.right - 260))}px`;
      ip.style.top = `${b.bottom + 6 + h > window.innerHeight ? Math.max(8, b.top - h - 6) : b.bottom + 6}px`;
    }
    const pop = this.shadowRoot && this.shadowRoot.querySelector(".side .pop");
    const side = pop && pop.closest(".side");
    if (!pop || !side) return;
    const room = side.getBoundingClientRect().bottom - pop.getBoundingClientRect().top - 10;
    pop.style.maxHeight = `${Math.max(160, room)}px`;
  }

  /** Split device (#91): entity spots ("entity:<id>" with `of`) get a list-less item. */
  _syncSplit() {
    if (!this.work || !this.byId) return;
    for (const [key, pos] of Object.entries(this.work.positions)) {
      if (!pos.of || !key.startsWith("entity:")) continue;
      const old = this.byId.get(key);
      if (old && old.split && old.as === (pos.as || "")) continue;
      const eid = key.slice(7);
      const dev = this.byId.get(pos.of);
      const so = this._hass && this._hass.states[eid];
      const ent = dev && (dev.entities || []).find((e) => e.entity_id === eid);
      const item = {
        id: key, entity_id: eid, loose: true, split: true, of: pos.of, as: pos.as || "",
        name: (ent && ent.name !== eid && ent.name) || (so && so.attributes.friendly_name) || eid,
        manufacturer: null, model: null, area_id: dev ? dev.area_id : null, area_name: dev ? dev.area_name : null,
        floor_id: dev ? dev.floor_id : null, integration: null, conns: [], virtual: false,
        group: pos.as === "light" || eid.startsWith("light.") ? "lights" : pos.as === "fan" ? "climate" : "plugs_switches",
        physical: false, main_entity: eid, entities: [], merged: [], parts: [], search: eid,
      };
      if (old) this.devices = this.devices.filter((x) => x !== old);
      this.devices.push(item);
      this.byId.set(key, item);
    }
  }

  /** Entities of a device that can act somewhere else (#91). */
  _switchables(d) {
    return (d.entities || []).filter((e) => !e.other && ["light", "switch", "cover", "fan", "climate", "valve"].includes(e.domain));
  }

  _splitSpots(devId) {
    if (!this.work) return [];
    return Object.entries(this.work.positions).filter(([k, p]) => p.of === devId && k.startsWith("entity:")).map(([k]) => k);
  }

  _missingIds() {
    if (!this.work) return [];
    return Object.keys(this.work.positions).filter((id) => !this.byId.has(id) && !this.mergedInto[id] && !this.partOf[id]);
  }

  _markerHtml(d, x, y, fade = "") {
    const s = this.s;
    const pos = this.work.positions[d.id];
    const v = this._ringVars(d);
    const b = this._bondOf(d.id);
    const members = b ? b[1].filter((m) => this.work.positions[m]) : [d.id];
    const selHere = members.includes(s.sel);
    const auto = !b && d.parts && d.parts.length ? d.parts.length + 1 : 0;
    const cls = ["mk", fade, v.c2 ? "two" : "", pos && pos.approx ? "approx" : "", selHere ? "sel" : "", members.includes(s.flash) ? "flash" : "", b || auto ? "bond" : ""].join(" ");
    const names = members.map((m) => (this.byId.get(m) || {}).name || m);
    const bname = b ? this._bondName(b) : "";
    const tip = b ? `<b>${esc(bname)}</b> · bonded${this._shortNames(names).map((n) => `<br>${esc(n)}`).join("")}` : esc(d.name) + (auto ? ` · bonded ×${auto}` : "");
    return `<button class="${cls}" data-mk="${esc(d.id)}" data-x="${x}" data-y="${y}" style="--c1:${v.c1};--c2:${v.c2 || "transparent"}" aria-label="${esc(b ? `Bonded: ${bname} (${names.join(", ")})` : d.name)}" ${fade ? 'tabindex="-1"' : ""}>
      <span class="ring">${b && this._bondMeta(b[0]).icon ? `<ha-icon icon="${esc(this._bondMeta(b[0]).icon)}"></ha-icon>` : this._iconHtml(d)}</span>${b ? `<span class="count bondc">×${members.length}</span>` : auto ? `<span class="count bondc">×${auto}</span>` : ""}<span class="tip ${b ? "multi" : ""}">${tip}${pos && pos.approx ? " · approx" : ""}</span></button>`;
  }

  _stackPopHtml(c) {
    const rows = c.m.map((m) => `<button class="si" data-act="stackpick" data-id="${esc(m.d.id)}"><span class="ico">${this._iconHtml(m.d)}</span>${esc(this._bondOf(m.d.id) ? this._bondName(this._bondOf(m.d.id)) : m.d.name)}</button>`).join("");
    return `<div class="stackpop" data-x="${c.x}" data-y="${c.y}" role="dialog" aria-label="Devices on this spot"><div class="sh">${c.m.length} on this spot · not bonded<button class="link" data-act="stackfan" data-id="${esc(c.m[0].d.id)}">Spread out to drag</button></div>${rows}</div>`;
  }

  _mboxInner() {
    const s = this.s;
    const end = s.m2 || s.mh;
    if (!end) return "";
    const dir = this._dirOf(s.m1, end);
    const sc = this._scale();
    const missingDir = this.work.refs.length === 1 && this.work.refs[0].dir !== dir;
    const ask = !!s.m2 && (!sc.x || s.ask || (missingDir && !s.skipAuto));
    const straight = this._isStraight(s.m1, end);
    if (ask) {
      return `<span>${dir === "h" ? "Horizontal" : "Vertical"}${straight ? " ✓" : ""}</span>
        <label>Real length <input id="lenin" inputmode="decimal" placeholder="metres" value="${esc(s.lenInput)}" title="${sc.x ? "Estimate from your other measurement: type the real length" : "Type the real length in metres"}"> m</label>
        <button data-act="setscale">Set scale</button>${sc.x ? `<button class="lk" data-act="justmeasure">Just measure</button>` : ""}<button class="x" data-act="cancelline" title="Discard this line (Esc)" aria-label="Discard this line">✕</button>`;
    }
    const x = s.m2 ? `<button class="x" data-act="cancelline" title="Discard this line (Esc)" aria-label="Discard this line">✕</button>` : "";
    if (!sc.x) return `<span>${dir === "h" ? "Horizontal" : "Vertical"}${straight ? " ✓" : ""}</span>${x}`;
    const m = this._distM(s.m1, end);
    return `<b>${m.toFixed(2)} m</b>${straight ? `<span>${dir === "h" ? "horizontal ✓" : "vertical ✓"}</span>` : ""}${s.m2 ? `<button class="lk" data-act="usescale">Use as scale</button>` : ""}${x}`;
  }

  _dirOf(a, b) {
    const p = this._plan();
    const dx = Math.abs(((b.x - a.x) * p.width) / 100);
    const dy = Math.abs(((b.y - a.y) * p.height) / 100);
    return dx >= dy ? "h" : "v";
  }

  _isStraight(a, b) {
    return Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
  }

  _snapPoint(a, b, shift) {
    if (shift || !a) return b;
    const p = this._plan();
    const dx = ((b.x - a.x) * p.width) / 100;
    const dy = ((b.y - a.y) * p.height) / 100;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (ang < 3 || ang > 177) return { x: b.x, y: a.y };
    if (Math.abs(ang - 90) < 3) return { x: a.x, y: b.y };
    return b;
  }

  _footHtml() {
    const cb = this.s.colorBy;
    let legend;
    if (cb === "conn") {
      legend = CONN_ORDER.filter((c) => this.devices.some((d) => d.conns.includes(c) && this.work && this.work.positions[d.id]))
        .map((c) => `<span><i style="border-color:${CONN[c].color}"></i>${CONN[c].label}</span>`)
        .join("");
      legend += `<span><i style="border-color:#2563eb;box-shadow:0 0 0 2px var(--df-card),0 0 0 4px #7c3aed"></i>Two connections</span>`;
    } else if (cb === "status") legend = `<span><i style="border-color:var(--df-primary)"></i>Placed</span>`;
    else legend = "";
    legend += `<span><i style="border-style:dashed;border-color:var(--df-sec)"></i>Approximate (auto-placed)</span>`;
    return `<div class="planfoot"><div class="legend">${legend}
      <label>Colour by <select data-act="colorby"><option value="conn" ${cb === "conn" ? "selected" : ""}>Connection</option><option value="status" ${cb === "status" ? "selected" : ""}>Status</option><option value="none" ${cb === "none" ? "selected" : ""}>None</option></select></label>
      <label>Names <select data-act="names"><option value="hover" ${this.s.names === "hover" ? "selected" : ""}>On hover</option><option value="always" ${this.s.names === "always" ? "selected" : ""}>Always</option><option value="off" ${this.s.names === "off" ? "selected" : ""}>Off</option></select></label>
      </div></div>`;
  }

  _shapeBoxHtml() {
    const aid = this.s.shapeEdit;
    if (!aid || !this.work || !(this.work.shapes || {})[aid]) return "";
    const a = this.areaById.get(aid);
    const pos = this.s.shapeBox || { x: 12, y: 12 };
    return `<div class="shbox" id="shbox" style="left:${pos.x}px;top:${pos.y}px"><div class="shgrip" data-shgrip="1" title="Move">⋮⋮ <b>${esc(a ? a.name : aid)}</b> · shape</div>
      <div class="shtip">Drag the corners · "+" adds a corner · double-click removes one. Edges snap straight · hold Alt for a free angle. Let shapes overlap where rooms are open to each other (open-plan kitchen, a door); leave a small gap where there is a wall: light stops at gaps.</div>
      <div class="shacts"><button data-act="shapereset">Reset to rectangle</button><button data-act="shapedel">🗑 Remove</button><button class="pri" data-act="shapedone">Done</button></div></div>`;
  }

  /** A rectangle around the room pin (or the plan centre). */
  _shapeRect(aid) {
    const p = (this.work.anchors || {})[aid] || { x: 50, y: 50 };
    const w = 12, h = 14;
    return [[clamp(p.x - w, 0, 100), clamp(p.y - h, 0, 100)], [clamp(p.x + w, 0, 100), clamp(p.y - h, 0, 100)], [clamp(p.x + w, 0, 100), clamp(p.y + h, 0, 100)], [clamp(p.x - w, 0, 100), clamp(p.y + h, 0, 100)]];
  }

  /** Snap a dragged corner so its edges to both neighbours come out straight (unless Alt). */
  _shapeSnap(pts, i, p, alt) {
    if (alt) return p;
    const n = pts.length;
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const vpW = this._vpW || 800;
    const vpH = this._vpH || 500;
    const z = this.s.z || 1;
    const tol = 9; // px on screen
    let { x, y } = p;
    let snapped = false;
    for (const q of [prev, next]) {
      if (Math.abs((x - q[0]) * vpW * z) / 100 < tol) { x = q[0]; snapped = true; }
      if (Math.abs((y - q[1]) * vpH * z) / 100 < tol) { y = q[1]; snapped = true; }
    }
    this._shSnapped = snapped;
    return { x, y };
  }

  /** 0.5.1 (#85): the saved room point is the centre of the name. Older anchors were the pin's
   *  tip (pill up-right of it): move them once so names stay where they were seen. */
  _centerAnchors() {
    const plan = this._plan();
    if (!plan || !this.work || plan.anchors_centered || !this._vpW || !this._vpH) return;
    plan.anchors_centered = true;
    const z = this.s.z || 1;
    const names = Object.keys(this.work.anchors);
    if (names.length) {
      for (const aid of names) {
        const a = this.areaById && this.areaById.get(aid);
        const w = String(a ? a.name : aid).length * 6.8 + 30;
        const p = this.work.anchors[aid];
        p.x = clamp(p.x + ((w / 2 - 7) * 100) / (this._vpW * z), 0, 100);
        p.y = clamp(p.y - (11 * 100) / (this._vpH * z), 0, 100);
      }
    }
    this._ws("plan/update", { plan_id: plan.id, anchors: this.work.anchors, anchors_centered: true }).catch(() => {});
    if (names.length) requestAnimationFrame(() => this._render());
  }

  /** Position stage + overlay elements for the current zoom/pan (no re-render). */
  _layout() {
    if (!this._vp) return;
    const r = this._vp.getBoundingClientRect();
    this._vpW = r.width;
    this._vpH = r.height;
    this._centerAnchors();
    const { z, tx, ty } = this.s;
    const stage = this.shadowRoot.getElementById("stage");
    if (stage) stage.style.transform = `translate(${tx}%, ${ty}%) scale(${z})`;
    const layer = this.shadowRoot.getElementById("layer");
    if (layer) {
      for (const el of layer.children) {
        if (el.dataset.x === undefined) continue;
        el.style.left = `${tx + Number(el.dataset.x) * z}%`;
        el.style.top = `${ty + Number(el.dataset.y) * z}%`;
      }
    }
    const zl = this.shadowRoot.getElementById("zl");
    if (zl) zl.textContent = `${Math.round(z * 100)}%`;
    // Keep the length boxes fully inside the plan (they used to be cut off at the edges).
    const vr = r;
    for (const id of ["mbox", "refpop"]) {
      const el = this.shadowRoot.getElementById(id);
      if (!el) continue;
      el.style.marginLeft = "0px";
      el.style.marginTop = "0px";
      const b = el.getBoundingClientRect();
      if (b.left < vr.left + 4) el.style.marginLeft = `${vr.left + 4 - b.left}px`;
      else if (b.right > vr.right - 4) el.style.marginLeft = `${vr.right - 4 - b.right}px`;
      if (b.top < vr.top + 4) el.style.marginTop = `${vr.top + 4 - b.top}px`;
      else if (b.bottom > vr.bottom - 4) el.style.marginTop = `${vr.bottom - 4 - b.bottom}px`;
    }
  }

  _zoomTo(nz, vx = 50, vy = 50) {
    const s = this.s;
    nz = clamp(Math.round(nz * 100) / 100, 0.25, 6);
    if (nz <= 1) {
      const c = (100 - 100 * nz) / 2;
      Object.assign(s, { z: nz, tx: c, ty: c });
    } else {
      const x = (vx - s.tx) / s.z;
      const y = (vy - s.ty) / s.z;
      const lim = (v) => clamp(v, 100 * (1 - nz), 0);
      Object.assign(s, { z: nz, tx: lim(vx - x * nz), ty: lim(vy - y * nz) });
    }
    this._layout();
    clearTimeout(this._zoomT);
    this._zoomT = setTimeout(() => this._render(), 160);
  }

  _pt(e) {
    const r = this._vp.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 100;
    const vy = ((e.clientY - r.top) / r.height) * 100;
    return { x: clamp((vx - this.s.tx) / this.s.z, 0.5, 99.5), y: clamp((vy - this.s.ty) / this.s.z, 0.5, 99.5), vx, vy };
  }

  // ---------------------------------------------------------------- side
  _sideHtml() {
    if (this.s.tool === "rooms") return this._roomsSideHtml();
    if (this.s.tool === "measure" && this._imageType() !== "angled") return this._measureSideHtml();
    return this._devicesSideHtml();
  }

  _measureSideHtml() {
    const sc = this._scale();
    const refs = this.work ? this.work.refs : [];
    const row = (dir, label, glyph) => {
      const i = refs.findIndex((r) => r.dir === dir);
      if (i < 0) return `<div class="mrow unset"><span class="k">${glyph}</span><span>${label}</span><span class="v" style="font-weight:400">not set · draw one on the plan</span></div>`;
      return `<div class="mrow" data-refrow="${i}"><span class="k">${glyph}</span><span>${label}</span><span class="v">${refs[i].length.toFixed(2)} m</span>
        <button class="small" data-act="refedit" data-i="${i}" title="Change length" aria-label="Change ${label.toLowerCase()} length">${SVG.edit}</button>
        <button class="small" data-act="refdel" data-i="${i}" title="Delete" aria-label="Delete ${label.toLowerCase()} measurement">${SVG.trash}</button></div>`;
    };
    let warn = "";
    if (sc.h && sc.v) {
      const diff = Math.abs(sc.h - sc.v) / ((sc.h + sc.v) / 2);
      if (diff > 0.05) warn = `<div class="warnbox">Horizontal and vertical disagree by ${Math.round(diff * 100)}%. Check one of them; if the image really is stretched, separate horizontal and vertical scales are used.</div>`;
    }
    const plan = this._plan();
    const size = sc.x && plan.width ? `<p style="padding:10px 14px 0;margin:0;font-size:13px;color:var(--df-sec)">The whole image is about <b style="color:var(--primary-text-color)">${(plan.width * sc.x).toFixed(1)} × ${(plan.height * sc.y).toFixed(1)} m</b>.</p>` : "";
    return `<aside class="side" aria-label="Measurements"><div class="sidehead"><h2>Measurements <span class="pill ${refs.length === 2 ? "ok" : refs.length ? "" : "grey"}">${refs.length}/2</span></h2>
      <p>Click the start and end of something you know on the plan, then type its real length. Drag the ends of a line to adjust it.</p></div>
      <div class="list" style="margin-top:8px">${row("h", "Horizontal", SVG.dash)}${row("v", "Vertical", '<svg viewBox="0 0 24 24"><path d="M12 5v14"/></svg>')}${warn}${size}</div></aside>`;
  }

  _roomsSideHtml() {
    const allRooms = this._roomsForPlan(true);
    const rooms = allRooms.filter((r) => r.count);
    const empty = allRooms.filter((r) => !r.count);
    const left = rooms.filter((r) => !r.pos && !r.ignored).length;
    const roomRow = (r) => {
        const on = !!r.pos;
        if (r.ignored && !on) {
          return `<div class="row done hiddenrow"><span class="main" style="cursor:default"><span class="ico">${SVG.pin}</span><span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">hidden · its ${r.count} devices are out of the list</span></span><span class="pill grey">hidden</span></span>
            <button class="small" data-act="unignore" data-id="${esc(r.area_id)}" title="Show on this plan" aria-label="Show ${esc(r.name)} on this plan">${SVG.skip}</button></div>`;
        }
        const active = this.s.placingRoom === r.area_id;
        return `<div class="row ${on ? "done" : "todo"} ${active ? "sel" : ""}" draggable="true" data-room="${esc(r.area_id)}">
          <button class="main" data-act="pickroom" data-id="${esc(r.area_id)}"><span class="ico" style="color:${on ? "var(--df-primary)" : "var(--df-sec)"}">${SVG.pin}</span>
          <span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">${r.count ? `${r.count} device${r.count > 1 ? "s" : ""}` : "no devices yet"}</span></span>
          <span class="pill ${on ? "ok" : ""}">${on ? "✓ on plan" : active ? "click on plan" : "drag to plan"}</span></button>
          ${on ? `<button class="shbtn ${(this.work.shapes || {})[r.area_id] ? "done" : ""} ${this.s.shapeEdit === r.area_id ? "act" : ""}" data-act="shapeedit" data-id="${esc(r.area_id)}" title="Draw the room's shape – its lights stay inside">${(this.work.shapes || {})[r.area_id] ? "Shape ✓" : "Shape"}</button>` : ""}
          ${on ? `<button class="small" data-act="unpin" data-id="${esc(r.area_id)}" title="Take the pin off the plan" aria-label="Take the pin off the plan">${SVG.close}</button>` : ""}
          <button class="small eyeon" data-act="ignore" data-id="${esc(r.area_id)}" title="Hide: not on this plan" aria-label="Hide ${esc(r.name)}: not on this plan">${SVG.eye}</button></div>`;
      };
    const rows = rooms
      .slice()
      .sort((a, b) => (a.pos || a.ignored ? 1 : 0) - (b.pos || b.ignored ? 1 : 0) || a.name.localeCompare(b.name))
      .map(roomRow)
      .join("") + (empty.length ? `<div class="lgh" style="padding:10px 12px 4px;font-size:12px;font-weight:500;color:var(--df-sec)">Empty rooms · no devices yet</div>` + empty.slice().sort((a, b) => a.name.localeCompare(b.name)).map(roomRow).join("") : "");
    const scope = this._plan().floor_id && this._plan().kind === "floor" ? "on this floor" : "with devices";
    return `<aside class="side" aria-label="Rooms" data-droptext="Drop to take the pin off the plan"><div class="sidehead"><h2>Rooms ${scope} <span class="pill ${left ? "" : "ok"}">${left ? `${left} left` : "all placed"}</span></h2>
      <p>Drag each room onto the plan and drop it in the middle of that room. Or click a room, then click on the plan. Rooms that are not on this plan: hide them with the eye button.</p></div>
      <div class="list" style="margin-top:8px">${rows || `<p style="padding:14px;margin:0;font-size:13px;color:var(--df-sec)">No rooms yet${this._scopeFloor() ? " on this floor" : ""}. Rooms come from HA areas. <a href="/config/areas/dashboard" target="_self">Create areas</a> · <a href="https://www.home-assistant.io/docs/organizing/areas/" target="_blank" rel="noopener">How areas work ↗</a></p>`}</div></aside>`;
  }

  _devicesSideHtml() {
    const s = this.s;
    const searching = !!s.q.trim();
    const scoped = this.devices.filter((d) => this._inScope(d) && this._counted(d));
    // While searching, everything is a candidate (all floors, skipped, hidden rooms, helpers).
    const all = searching ? this.devices : scoped;
    const statuses = new Map(all.map((d) => [d.id, this._status(d)]));
    const left = scoped.filter((d) => statuses.get(d.id) === "unplaced").length;
    const active = scoped.filter((d) => statuses.get(d.id) !== "skipped").length;
    const shown = all.filter((d) => this._matches(d, statuses.get(d.id)));
    this._shownOrder = [];
    const newCount = scoped.filter((d) => this._isNew(d) && statuses.get(d.id) !== "skipped").length;

    const counts = (key, val) => scoped.filter((d) => statuses.get(d.id) !== "skipped" || s.status.includes("skipped")).filter((d) => (key === "conn" ? d.conns.includes(val) : this._inType(d, val))).length;
    const real = (key) => s[key].filter((x) => x !== "__none__");
    const fbtn = (key, label) => {
      const on = s[key].length > 0;
      const n = real(key).length;
      const btn = `<button class="fbtn ${on ? "act" : ""} ${s.pop === key ? "open" : ""}" data-act="pop" data-key="${key}" aria-expanded="${s.pop === key}">${label}${on ? `<span class="cnt">${n}</span>` : ""}${SVG.down}</button>`;
      return `<span class="fwrap">${btn}${on ? `<button class="fx" data-act="fclear" data-key="${key}" title="Clear the ${label} filter" aria-label="Clear the ${label} filter">✕</button>` : ""}</span>`;
    };
    let pop = "";
    if (s.pop) {
      let chips = "";
      // Progress, not totals (#44): "7 left", or a green ✓ when everything of that kind is placed.
      const prog = (key, val) => {
        const items = scoped.filter((d) => statuses.get(d.id) !== "skipped" && statuses.get(d.id) !== "hiddenroom" && (key === "conn" ? d.conns.includes(val) : this._inType(d, val)));
        const left = items.filter((d) => statuses.get(d.id) === "unplaced").length;
        return { left, total: items.length, on: items.filter((d) => ["placed", "approx"].includes(statuses.get(d.id))).length };
      };
      if (s.pop === "conn") chips = CONN_ORDER.filter((c) => counts("conn", c)).map((c) => this._chip("conn", c, CONN[c].label, counts("conn", c), CONN[c].color, prog("conn", c))).join("");
      if (s.pop === "type") chips = Object.keys(GROUPS).filter((g) => counts("type", g)).map((g) => this._chip("type", g, GROUPS[g][0], counts("type", g), null, prog("type", g))).join("");
      if (s.pop === "status") chips = STATUSES.map(([k, l]) => [k, l, scoped.filter((d) => (k === "new" ? this._isNew(d) && statuses.get(d.id) !== "skipped" : statuses.get(d.id) === k)).length]).filter((x) => x[2] || s.status.includes(x[0])).map(([k, l, n]) => this._chip("status", k, l, n)).join("");
      const allOn = !s[s.pop].length;
      const noneOn = s[s.pop].length === 1 && s[s.pop][0] === "__none__";
      pop = `<div class="pop"><div class="popall">Select: <button class="link" data-act="popall" ${allOn ? 'style="font-weight:700;text-decoration:none"' : ""}>All</button>·<button class="link" data-act="popnone" ${noneOn ? 'style="font-weight:700;text-decoration:none"' : ""}>None</button></div><div class="chips">${chips}</div><button class="btn primary" style="align-self:flex-end" data-act="closepop">Done</button></div>`;
    }
    const plan = this._plan();
    const autoTargets = shown.filter((d) => (!d.loose || d.physical) && statuses.get(d.id) === "unplaced" && d.area_id && this.work.anchors[d.area_id] && this._inScope(d));
    const unplacedShown = shown.filter((d) => (!d.loose || d.physical) && statuses.get(d.id) === "unplaced");
    const opts = [];
    opts.push(`<button class="btn outline" data-act="autoplace" ${autoTargets.length ? "" : "disabled"} title="${autoTargets.length ? "Put the devices shown below next to their room pins (approximate)" : "Nothing to auto-place: mark rooms first, or all shown devices are placed"}">${SVG.spark}Auto-place ${autoTargets.length}${this._filtering() ? " shown" : ""}</button>`);
    if (this._filtering() && unplacedShown.length && !(s.status.length === 1 && s.status[0] === "skipped")) {
      opts.push(`<button class="btn" data-act="skipall">${SVG.skip}Skip the ${unplacedShown.length} not on the plan</button>`);
    }
    const optsRow2 = [];
    optsRow2.push(`<label>Group by <select data-act="groupby"><option value="room" ${s.groupBy === "room" ? "selected" : ""}>Room</option><option value="type" ${s.groupBy === "type" ? "selected" : ""}>Type</option><option value="conn" ${s.groupBy === "conn" ? "selected" : ""}>Connection</option></select></label>`);
    if (plan.kind === "floor" && plan.floor_id) optsRow2.push(`<label><input type="checkbox" data-act="allfloors" ${s.allFloors ? "checked" : ""}> Devices from all floors</label>`);

    const hiddenDevs = s.withHidden || searching ? [] : scoped.filter((d) => statuses.get(d.id) === "hiddenroom" && this._matches(d, "unplaced"));
    const newBar = newCount && !s.status.includes("new") ? `<div class="newbar"><span class="pill">${newCount} new</span><span style="flex:1">device${newCount > 1 ? "s" : ""} since your last visit</span><button class="link" data-act="shownew">Show</button></div>` : "";
    const filterBits = [];
    if (s.q.trim()) filterBits.push(`“${s.q.trim()}”`);
    const lbl = (key, map) => {
      const r = real(key);
      if (!s[key].length) return;
      if (!r.length) return filterBits.push(`no ${key === "conn" ? "connection" : key}`);
      filterBits.push(r.length === 1 ? map(r[0]) : `${r.length} ${key === "type" ? "types" : key === "conn" ? "connections" : "statuses"}`);
    };
    lbl("type", (v) => (GROUPS[v] || GROUPS.other)[0]);
    lbl("conn", (v) => (CONN[v] || CONN.other).label);
    lbl("status", (v) => (STATUSES.find((x) => x[0] === v) || [v, v])[1]);
    const summary = `${filterBits.length ? filterBits.join(" · ") : "All devices"} · ${shown.length} shown`;
    const controls = s.toolsOpen
      ? `<div class="controls"><input class="search" id="q" type="search" placeholder="Search name, room, model or entity…" value="${esc(s.q)}" aria-label="Search devices and entities">
        <div class="frow">${fbtn("type", "Type")}${fbtn("conn", "Connection")}${fbtn("status", "Status")}${s.conn.length || s.type.length || s.status.length ? `<button class="link" data-act="clearf">Clear filters</button>` : ""}</div>
        ${pop}
        ${searching ? `<div style="font-size:12px;color:var(--df-sec)">Searching everything: all floors, skipped devices, hidden rooms and entities without a device.</div>` : `<div class="frow">${opts.join("")}</div>
        <div class="opts">${optsRow2.join("")}</div>`}</div>`
      : `<button class="toolsum" data-act="tools" title="Show search and filters">${SVG.down}<span>${esc(summary)}</span></button>`;

    return `<aside class="side" aria-label="Devices to place" data-droptext="Drop to remove from plan">
      <div class="sidehead"><h2>Devices to place <span class="pill ${left ? "" : active ? "ok" : "grey"}">${left ? `${left} left` : active ? "all placed" : "none here"}</span>
        <button class="tgl ${s.toolsOpen ? "up" : ""}" data-act="tools" title="${s.toolsOpen ? "Hide search and filters" : "Show search and filters"}" aria-label="${s.toolsOpen ? "Hide search and filters" : "Show search and filters"}" aria-expanded="${s.toolsOpen}">${SVG.down}</button></h2>
      ${s.toolsOpen ? `<p>Click a device, then click on the plan, or drag it there. Placed devices are greyed out.</p>` : ""}</div>
      ${this._detailsHtml()}${newBar}
      ${controls}
      <div class="list">${this._listHtml(shown, statuses)}${this._hiddenGroupHtml(hiddenDevs, statuses)}</div></aside>`;
  }

  /** Devices of rooms hidden on this plan: out of the list and the counts, in one collapsed group. */
  _hiddenGroupHtml(devs, statuses) {
    if (!devs.length) return "";
    const key = "hidden:rooms";
    const open = this.s.collapsed[key] === false;
    const rooms = [...new Set(devs.map((d) => d.area_name).filter(Boolean))].join(", ");
    const rows = open ? devs.map((d) => this._rowHtml(d, statuses.get(d.id))).join("") : "";
    return `<div style="opacity:.75"><button class="ghead ${open ? "open" : ""}" data-act="group" data-key="${key}" data-open="${open ? 1 : 0}" aria-expanded="${open}">${SVG.chev}<b>Hidden rooms · ${devs.length} device${devs.length > 1 ? "s" : ""} <small style="font-weight:400;color:var(--df-sec)">${esc(rooms)}</small></b></button>${rows}</div>`;
  }

  _chip(key, val, label, n, color, prog) {
    const on = this.s[key].includes(val);
    let count = `<small>${n}</small>`;
    let done = "";
    let title = "";
    if (prog && prog.total) {
      title = `${prog.on} of ${prog.total} on the plan · ${prog.left} left`;
      if (prog.left) count = `<small>· ${prog.left} left</small>`;
      else {
        count = `<small class="okc">✓</small>`;
        done = "done";
      }
    }
    return `<button class="chip ${on ? "on" : ""} ${done}" data-act="chip" data-key="${key}" data-val="${esc(val)}" aria-pressed="${on}" ${title ? `title="${esc(title)}"` : ""}>${color ? `<span class="dot" style="background:${color}"></span>` : ""}${esc(label)} ${count}</button>`;
  }

  _listHtml(shown, statuses) {
    const s = this.s;
    if (!shown.length) return `<p style="padding:20px 14px;margin:0;font-size:14px;color:var(--df-sec)">${s.q.trim() ? `Nothing found for “${esc(s.q.trim())}”. Try part of the name or the entity id (e.g. <i>dryer</i> or <i>binary_sensor.</i>).` : "No devices match."} ${this._filtering() ? '<button class="link" data-act="clearall">Clear search and filters</button>' : ""}</p>`;
    const groups = new Map();
    const keyOf = (d) => (d.loose && !d.physical ? "__loose" : s.groupBy === "conn" ? d.conns[0] || "other" : s.groupBy === "type" ? d.group : d.area_id || "__none");
    const nameOf = (k) => (k === "__loose" ? "Entities without a device" : s.groupBy === "conn" ? (CONN[k] || CONN.other).label : s.groupBy === "type" ? (GROUPS[k] || GROUPS.other)[0] : k === "__none" ? "No area" : (this.areaById.get(k) || {}).name || k);
    for (const d of shown) {
      const k = keyOf(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    const rank = { unplaced: 0, approx: 1, elsewhere: 2, placed: 3, skipped: 4 };
    const arr = [...groups.entries()].map(([k, items]) => {
      items.sort((a, b) => rank[statuses.get(a.id)] - rank[statuses.get(b.id)] || a.name.localeCompare(b.name));
      const todo = items.filter((d) => statuses.get(d.id) === "unplaced").length;
      return { k, name: nameOf(k), items, todo };
    });
    arr.sort((a, b) => (a.k === "__loose") - (b.k === "__loose") || (a.k === "__none") - (b.k === "__none") || b.todo - a.todo || a.name.localeCompare(b.name));
    const many = shown.length > 40;
    return arr
      .map((g, i) => {
        const key = `${s.groupBy}:${g.k}`;
        const open = s.q.trim() ? true : s.collapsed[key] === undefined ? !many || i === 0 || g.items.some((d) => d.id === s.sel) : !s.collapsed[key];
        const pill = g.todo ? `<span class="pill">${g.todo} to place</span>` : `<span class="pill ok">all placed</span>`;
        const note = g.k === "__none" && s.groupBy === "room" ? ` <small style="font-weight:400;color:var(--df-sec)">· not auto-placed</small>` : g.k === "__loose" ? ` <small style="font-weight:400;color:var(--df-sec)">· helpers, templates</small>` : "";
        let rows = "";
        if (open) {
          rows = g.items.map((d) => this._rowHtml(d, statuses.get(d.id))).join("");
          g.items.forEach((d) => this._shownOrder.push(d.id));
        }
        return `<div><button class="ghead ${open ? "open" : ""}" data-act="group" data-key="${esc(key)}" data-open="${open ? 1 : 0}" aria-expanded="${open}">${SVG.chev}<b>${esc(g.name)}${note}</b>${pill}</button>${rows}</div>`;
      })
      .join("");
  }

  _rowHtml(d, st) {
    const s = this.s;
    let bat = "";
    if (d.battery_entity && this._hass && this._hass.states[d.battery_entity]) {
      const v = Number(this._hass.states[d.battery_entity].state);
      if (!Number.isNaN(v)) bat = `<span class="badge ${v <= 15 ? "bat-low" : "bat"}">${Math.round(v)}%</span>`;
    }
    const pill = {
      placed: `<span class="pill ok">✓ on plan</span>`,
      approx: `<span class="pill warn">◌ approx</span>`,
      skipped: `<span class="pill grey">skipped</span>`,
      hiddenroom: `<span class="pill grey">room hidden</span>`,
      elsewhere: `<span class="pill grey">on ${esc((this._otherFloorPlan(d) || {}).name || "another floor")}</span>`,
    }[st] || "";
    const isNew = this._isNew(d) && st !== "skipped" ? `<span class="badge newtag">New</span>` : "";
    const done = st === "placed" || st === "approx" || st === "elsewhere" || st === "skipped" || st === "hiddenroom";
    const area = (s.groupBy !== "room" || s.q.trim()) && d.area_name ? `<span>${esc(d.area_name)}</span>` : "";
    const hitName = this._matchedEntity(d);
    // #91: an entity of a device matched: say it's part of the device (and where it acts).
    const hitEnt = hitName && (d.entities || []).find((x) => x.name === hitName || x.entity_id === hitName);
    const hitSpot = hitEnt && this.work && this.work.positions[`entity:${hitEnt.entity_id}`];
    const hit = hitName ? `<span class="hit">${esc(hitName)} · ${hitSpot ? "placed where it acts" : hitEnt && this._switchables(d).includes(hitEnt) && this.work && this.work.positions[d.id] ? "part of this device · can sit where it acts" : "part of this device"}</span>` : "";
    const ent = d.loose ? `<span>${esc(d.entity_id)}</span>` : "";
    const rb = this.work && this.work.positions[d.id] && this._bondOf(d.id);
    const parts = d.parts && d.parts.length ? `<span style="color:var(--df-ok)">🔗 Bonded ×${d.parts.length + 1}</span>` : rb ? `<span style="color:var(--df-ok)" title="${esc(this._bondName(rb))}">🔗 Bonded</span>` : "";
    const meta = isNew + bat + area + parts + ent + hit;
    return `<div class="row ${done ? "done" : "todo"} ${s.sel === d.id || s.placing === d.id ? "sel" : ""}" draggable="${st === "skipped" ? "false" : "true"}" data-dev="${esc(d.id)}">
      <button class="main" data-act="pick" data-id="${esc(d.id)}">${this._avatarHtml(d)}
        <span class="rtxt"><span class="rname">${esc(d.name)}</span>${meta ? `<span class="rmeta">${meta}</span>` : ""}</span>${pill}</button>
      ${st === "placed" || st === "approx" ? `<button class="small" data-act="locate" data-id="${esc(d.id)}" title="Show on plan" aria-label="Show on plan">${SVG.locate}</button>` : ""}
      <button class="small" data-act="info" data-id="${esc(d.id)}" title="More info" aria-label="More info">${SVG.info}</button></div>`;
  }

  _detailsHtml() {
    const s = this.s;
    if (String(s.sel || "").startsWith("ph:")) return this._phantomCardHtml(s.sel.slice(3));
    const sb = s.sel && this.work && this.work.positions[s.sel] && this._bondOf(s.sel);
    if (sb && s.memberView !== s.sel) return this._bondCardHtml(sb);
    if (s.sel && !this.byId.has(s.sel) && this.work && this.work.positions[s.sel]) {
      const cand = this.devices.filter((x) => this._inScope(x) && ["unplaced", "hiddenroom"].includes(this._status(x)));
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px;font-weight:700">?</span>
        <div style="flex:1;min-width:0"><div class="nm">Device removed from Home Assistant</div><div class="sub">This spot belonged to a device that no longer exists, for example after re-pairing it.</div></div>
        <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
        <label style="font-size:12px;color:var(--df-sec);display:flex;flex-direction:column;gap:4px">Replace with (keeps this spot)<select data-act="replacedev"><option value="">Choose a device…</option>${cand.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.area_name ? ` · ${esc(x.area_name)}` : ""}</option>`).join("")}</select></label>
        <div class="acts"><button class="btn danger" data-act="remove">Remove from plan</button></div></div>`;
    }
    const d = s.sel && this.byId.get(s.sel);
    if (!d) return "";
    const st = this._status(d);
    const onPlan = st === "placed" || st === "approx";
    const close = `<button class="small" data-act="desel" aria-label="Close">${SVG.close}</button>`;
    if (d.split) {
      const dev = this.byId.get(d.of);
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc(d.entity_id)} · part of ${esc(dev ? dev.name : "a device")}</div></div>${close}</div>
        <div class="note">Split device: ${esc(dev ? dev.name : "the device")} sits where its hardware is, this ${esc(d.entity_id.split(".")[0])} shows here, where it acts. ${this._tip("split")}</div>
        ${d.entity_id.startsWith("light.") ? "" : `<label class="fl">Acts as<select data-act="splitas"><option value="">${esc(d.entity_id.split(".")[0])} (as in Home Assistant)</option>${[["light", "Light"], ["switch", "Switch"], ["fan", "Fan"], ["other", "Other"]].map(([k, l]) => `<option value="${k}" ${d.as === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`}
        ${this._lightSectionHtml(d)}${this._airSectionHtml(d)}${this._openSectionHtml(d)}
        <div class="acts"><button class="btn" data-act="selid" data-id="${esc(d.of)}">Go to ${esc(dev ? dev.name : "device")}</button><button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button><button class="btn danger" data-act="splitdel" data-id="${esc(d.id)}">✕ Back to the device</button></div></div>`;
    }
    if (d.loose) {
      const acts = [];
      if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
      if (st === "unplaced") acts.push(`<button class="btn primary" data-act="placeit">Add to plan</button>`);
      acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
      if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc(d.entity_id)} · entity without a device</div></div>${close}</div>
        <div class="note">Placed on its own: the card shows this entity at this spot.${st === "unplaced" ? " Click on the plan to put it there, or drag it from the list." : ""}</div>
        <div class="acts">${acts.join("")}</div>${onPlan ? this._lightSectionHtml(d) : ""}</div>`;
    }
    const badges = d.conns.map((c) => `<span class="badge" style="color:${(CONN[c] || CONN.other).color};background:color-mix(in srgb, ${(CONN[c] || CONN.other).color} 14%, transparent)">${(CONN[c] || CONN.other).label}</span>`).join(" ");
    const stLabel = { placed: "✓ Confirmed position", approx: "◌ Approximate position", unplaced: "Not on the plan yet", hiddenroom: "Its room is hidden on this plan", skipped: "Skipped · nothing changes in HA", elsewhere: `On ${(this._otherFloorPlan(d) || {}).name || "another floor"}` }[st];
    const acts = [];
    const more = !!s.more;
    if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
    if (st === "unplaced" || st === "hiddenroom") acts.push(`<button class="btn primary" data-act="placeit">Place on plan</button>`);
    if (st === "elsewhere") acts.push(`<button class="btn primary" data-act="movehere">Move to this floor</button>`);
    if (st === "skipped") acts.push(`<button class="btn outline" data-act="unskip">Add to plan</button>`);
    acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
    acts.push(`<button class="btn" data-act="devpage">Device page${SVG.ext}</button>`);
    if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
    const skipBtn = st !== "skipped" ? `<button class="link" style="align-self:flex-start;padding:0" data-act="skipone">Skip this device</button>` : "";
    let stack = "";
    if (onPlan) {
      const cl = this._clusters().find((c) => c.m.some((m) => m.d.id === d.id));
      if (cl && cl.m.length > 1) {
        const others = cl.m.filter((m) => m.d.id !== d.id).map((m) => m.d.name).join(", ");
        const same = cl.m.filter((m) => m.d.id !== d.id && this._canBond(d.id, m.d.id));
        stack = `<div class="note">Same spot as ${esc(others)} · not bonded. <button class="link" data-act="front">Bring to front</button><button class="link" data-act="back">Send to back</button>${same.length ? `<button class="link" data-act="bondask" data-id="${esc(same[0].d.id)}">Bond with ${esc(same[0].d.name)}…</button>` : ""}</div>`;
      }
    }
    const bnd = this._bondOf(d.id);
    const back = bnd && onPlan ? `<button class="link back" data-act="bondback">‹ Back to bond “${esc(this._bondName(bnd))}”</button>` : "";
    const bondNote = "";
    const phIn = Object.values((this.work && this.work.phantoms) || {}).filter((ph) => (ph.members || []).includes(d.id));
    const phNote = phIn.length && onPlan ? `<div class="note">Part of phantom ${phIn.map((ph) => `<b>${esc(ph.name || "Phantom")}</b>`).join(", ")} ${this._tip("phantom")}</div>` : "";
    const bondHint = !bnd && onPlan && st !== "skipped" ? `<div style="font-size:12px;color:var(--df-sec)">Tip: drag another device onto this one if they are one thing (like bulbs in one lamp) ${this._tip("bond")}</div>` : "";
    const merged = d.merged.length ? `<div style="font-size:12px;color:var(--df-sec)" title="${esc(d.merged.join(", "))}">Includes its twin device${d.merged.length > 1 ? "s" : ""}</div>` : "";
    // Parts (#28): printer + AMS, NAS + drives… one row, one marker.
    // Automatic bonds (were "parts", #28/#60): printer + AMS, NAS + drives… one device, one marker.
    let parts = "";
    if (d.parts && d.parts.length) {
      parts = `<div class="note parts"><div class="bh"><span class="bcount">×${d.parts.length + 1}</span><b>Bonded automatically</b>${this._tip("autobond")}</div>
        <div style="color:var(--df-sec)">One device on the plan and the card; their entities count for it.</div>
        ${d.parts.map((p) => `<div class="prow"><span class="pn"><b title="${esc(p.name)}">${esc(p.name)}</b>${p.model ? `<small>${esc(p.model)}</small>` : ""}</span><button class="btn" data-act="partown" data-id="${esc(p.id)}">Unbond</button></div>`).join("")}</div>`;
    } else if (d.part_override === "own") {
      parts = `<div class="note">Unbonded: shown as its own device (it stays that way). <button class="link" data-act="partauto" data-id="${esc(d.id)}">Bond automatically again</button></div>`;
    }
    // Hubs and bridges (#65): what connects through what.
    let conn = "";
    if (!d.loose) {
      const kids = this.devices.filter((x) => !x.loose && x.via === d.id);
      const hub = d.via && this.byId.get(d.via);
      const bits = [];
      if (hub) bits.push(`Connected through <button class="link" style="padding:0" data-act="selid" data-id="${esc(hub.id)}">${esc(hub.name)}</button>`);
      if (kids.length) bits.push(`${kids.length} device${kids.length > 1 ? "s connect" : " connects"} through it: ${kids.slice(0, 6).map((k) => esc(k.name)).join(", ")}${kids.length > 6 ? ` +${kids.length - 6}` : ""}`);
      if (bits.length) conn = `<div style="font-size:12px;color:var(--df-sec)">${bits.join(" · ")}</div>`;
    }
    // What the marker shows (#34, #43): every entity of the device, grouped; "linked" only for
    // an entity from outside the device, and only while it is the chosen one.
    const cur = this.mainEntity[d.id] || d.main_entity;
    const own = d.entities.filter((e) => !e.other);
    const cands = own.slice();
    if (cur && !own.some((e) => e.entity_id === cur)) {
      const so = this._hass && this._hass.states[cur];
      cands.unshift({ entity_id: cur, name: (so && so.attributes.friendly_name) || cur, domain: cur.split(".")[0], other: true });
    }
    const picking = s.otherEnt === d.id;
    let entIds = [];
    if (picking && this._hass) entIds = Object.keys(this._hass.states).sort();
    const cat = (e) => {
      if (e.other) return "Linked";
      if (["light", "switch", "fan", "cover", "climate", "lock", "media_player", "valve", "vacuum", "humidifier", "water_heater", "siren", "camera"].includes(e.domain)) return "Lights, switches & controls";
      if (e.domain === "binary_sensor" && ["motion", "occupancy", "presence", "moving"].includes(e.dc)) return "Presence & motion";
      if (e.domain === "binary_sensor" || e.domain === "sensor" || e.domain === "event") return "Sensors";
      return "Other";
    };
    const q = (s.entFilter || "").toLowerCase();
    const shownCands = q ? cands.filter((e) => e.entity_id === cur || `${e.name} ${e.entity_id}`.toLowerCase().includes(q)) : cands;
    const order = ["Linked", "Lights, switches & controls", "Presence & motion", "Sensors", "Other"];
    const groups = order.map((g) => [g, shownCands.filter((e) => cat(e) === g)]).filter((x) => x[1].length);
    const nm = (e) => {
      // Entities named after their device have no own name: use HA's friendly name.
      if (e.name && e.name !== e.entity_id) return e.name;
      const st = this._hass && this._hass.states[e.entity_id];
      return (st && st.attributes.friendly_name) || e.entity_id;
    };
    const opt = (e) => `<option value="${esc(e.entity_id)}" ${e.entity_id === cur && !picking ? "selected" : ""}>${esc(nm(e))} (${esc(e.domain)})${e.other ? " · linked" : ""}</option>`;
    const optsHtml = groups.length > 1 ? groups.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(opt).join("")}</optgroup>`).join("") : shownCands.map(opt).join("");
    const so = cur && this._hass ? this._hass.states[cur] : null;
    const now = so ? (this._hass.formatEntityState ? this._hass.formatEntityState(so) : so.state) : "";
    const filterBox = cands.length > 15 ? `<input class="ent" id="entfilter" placeholder="Filter ${cands.length} entities… (e.g. count)" value="${esc(s.entFilter || "")}" autocomplete="off">` : "";
    const mainSel = `<label style="font-size:12px;color:var(--df-sec);display:flex;flex-direction:column;gap:4px">The marker shows (icon, state, tap)${filterBox}<select data-act="mainent">${optsHtml}<option value="__other" ${picking ? "selected" : ""}>Other entity…</option></select></label>
      ${now ? `<div style="font-size:12px;color:var(--df-sec);margin-top:-6px">Now: <b style="color:var(--primary-text-color);font-weight:500">${esc(now)}</b> · numbers and states show on the card</div>` : ""}
      ${picking ? `<label style="font-size:12px;color:var(--df-sec);display:flex;flex-direction:column;gap:4px">Any entity, also a helper: type its name or id<input class="ent" id="otherent" list="entlist" placeholder="binary_sensor.dryer_running" autocomplete="off"><datalist id="entlist">${entIds.map((x) => `<option value="${esc(x)}">${esc((this._hass.states[x].attributes || {}).friendly_name || "")}</option>`).join("")}</datalist></label>` : ""}
      <label class="chk"><input type="checkbox" data-act="onlymain" ${this.deviceOpts[d.id] && this.deviceOpts[d.id].only_main ? "checked" : ""}> The card uses only this entity</label>`;
    // Split device (#91): the device sits at its hardware; switchable entities can sit where they act.
    let box = "";
    if (onPlan) {
      const sw = this._switchables(d);
      const spots = this._splitSpots(d.id);
      if (sw.length) {
        const open = spots.length || s.splitOpen === d.id;
        if (!open) {
          box = `<span style="display:flex;align-items:center;gap:6px"><button class="link" style="align-self:flex-start;padding:0" data-act="splitopen">📍 Split: it controls something elsewhere</button>${this._tip("split")}</span>${sw.length > 1 ? `<div style="font-size:12px;color:var(--df-sec)">It has ${sw.length} switches: each can sit where it acts.</div>` : ""}`;
        } else {
          const rows = sw.map((e) => {
            const key = `entity:${e.entity_id}`;
            const placed = spots.includes(key);
            const placing = s.placingBox === `${d.id}|${e.entity_id}`;
            const nm = (e.name && e.name !== e.entity_id ? e.name : null) || ((this._hass && this._hass.states[e.entity_id] && this._hass.states[e.entity_id].attributes.friendly_name) || e.entity_id);
            const btn = placed
              ? `<span class="pill ok">✓ placed</span><button class="small" data-act="locate" data-id="${esc(key)}" title="Show on plan" aria-label="Show on plan">${SVG.locate}</button><button class="small" data-act="splitdel" data-id="${esc(key)}" title="Back to the device" aria-label="Back to the device">✕</button>`
              : placing ? `<span style="font-size:12px">Click on the plan…</span><button class="link" data-act="boxcancel">Cancel</button>`
                : `<button class="link" data-act="splitplace" data-id="${esc(e.entity_id)}">Place where it acts</button>`;
            return `<div class="srow"><span class="snm" title="${esc(e.entity_id)}">${esc(nm)}</span>${btn}</div>`;
          }).join("");
          box = `<div class="note split"><div><b>Split device</b> ${this._tip("split")}</div><div style="color:var(--df-sec)">The device stays where its hardware is (Network, Health). What it switches can sit where it acts.</div>${rows}</div>`;
        }
      }
    }
    // One click to clean up software-heavy integrations (NAS, routers, cloud).
    let skipInt = "";
    if (d.integration && st !== "skipped") {
      const same = this.devices.filter((x) => !x.loose && x.integration === d.integration && !this.skipped.has(x.id) && !(this.work && this.work.positions[x.id]));
      if (same.length > 1) skipInt = `<button class="link" style="align-self:flex-start;padding:0" data-act="skipint" data-int="${esc(d.integration)}">Skip all ${same.length} not on the plan from ${esc(this._intName(d.integration))}</button>`;
    }
    const hint = st === "unplaced" || st === "hiddenroom" ? `<div style="font-size:12px;color:var(--df-sec)">Click on the plan to put it there, drag it from the list, use Auto-place, or skip it if you don't want it on the plan.</div>` : "";
    const lightSec = onPlan && this._lightSectionHtml ? this._lightSectionHtml(d) : "";
    const moreBtn = `<button class="link morebtn ${more ? "open" : ""}" data-act="more" aria-expanded="${more}">More options ${SVG.down}</button>`;
    const moreBox = more ? `<div class="more">${skipBtn}${skipInt}</div>` : "";
    return `<div class="details">${back}<div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
      <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc([d.area_name || "No area", d.manufacturer, d.model].filter(Boolean).join(" · "))}</div></div>
      ${close}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${badges}<span class="badge bat">${esc(stLabel)}</span></div>
      ${conn}${bondNote}${merged}${parts}${stack}${phNote}<div class="acts">${acts.join("")}</div>${lightSec}${onPlan ? this._airSectionHtml(d) + this._openSectionHtml(d) : ""}${box}${moreBtn}${moreBox}${bondHint}${hint}</div>`;
  }

  // ------------------------------------------------------- light shapes (#74)
  _realW() {
    const p = this._plan();
    const sc = this._scale();
    return sc.x && p && p.width ? sc.x * p.width : null;
  }

  _defaultShape(type, lamp = true) {
    const W = this._realW();
    const m = (v, pct) => (W ? (v / W) * 100 : pct);
    if (type === "spot") return lamp ? { type, r: m(0.8, 3.5) } : { type, r: m(0.5, 2.2) };
    if (type === "strip") return { type, r: m(0.5, 2.5) };
    if (type === "panel") return { type, w: m(1.2, 6) };
    if (type === "wall") return { type, r: m(1.2, 5), a: 90 };
    if (type === "none") return { type };
    return { type: "bulb", r: m(1.5, 6) };
  }

  /** Type filter: its own group, and "Lights" also for anything with a light (wall switches with light channels). */
  _inType(d, t) {
    if (d.group === t) return true;
    return t === "lights" && !d.split && (d.entities || []).some((x) => x.domain === "light");
  }

  /** Light entities of a device that are NOT placed elsewhere (#106). */
  _ownLights(d) {
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    return (d.entities || []).filter((x) => x.domain === "light" && !spots.has(x.entity_id));
  }

  /** #115: an AC / thermostat on the plan (its own climate entity, or a split climate spot). */
  _climateEnt(id) {
    const d = this.byId.get(id);
    if (!d) return null;
    if (d.split || d.loose) return String(d.entity_id || "").startsWith("climate.") ? d.entity_id : null;
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    const e = (d.entities || []).find((x) => x.domain === "climate" && !spots.has(x.entity_id));
    return e ? e.entity_id : null;
  }

  /** Can it cool (an AC)? Heat-only climates (radiators) get a warm glow on the card instead of a cone. */
  _canCool(eid) {
    const st = eid && this._hass && this._hass.states[eid];
    const modes = (st && st.attributes.hvac_modes) || [];
    return modes.includes("cool") || modes.includes("heat_cool") || modes.includes("dry") || modes.includes("fan_only");
  }

  /** The AC's air-flow cone: stored, or a default pointing into the room. */
  _air(id) {
    const pos = this.work.positions[id];
    if (!pos) return null;
    const W = this._realW();
    const R = this._ratio();
    const d = this.byId.get(id);
    let a = 90;
    const anc = d && d.area_id && this.work.anchors[d.area_id];
    if (anc && (Math.abs(anc.x - pos.x) > 0.5 || Math.abs(anc.y - pos.y) > 0.5)) a = Math.round((Math.atan2((anc.y - pos.y) / R, anc.x - pos.x) * 180) / Math.PI);
    const def = { a, r: W ? (2 / W) * 100 : 10, s: 60 };
    if (pos.air && pos.air.type === "none") return { type: "none", ...def, x: pos.x, y: pos.y };
    return { type: "cone", ...def, ...(pos.air || {}), x: pos.x, y: pos.y, auto: !pos.air };
  }

  _airSvg(c, sel) {
    if (!c || c.type === "none") return "";
    const R = this._ratio();
    const pt = (deg, r) => [(c.x + Math.cos((deg * Math.PI) / 180) * r) * 10, (c.y + Math.sin((deg * Math.PI) / 180) * r * R) * 10];
    const [x1, y1] = pt(c.a - c.s / 2, c.r);
    const [x2, y2] = pt(c.a + c.s / 2, c.r);
    return `<path d="M${c.x * 10},${c.y * 10} L${x1},${y1} A${c.r * 10},${c.r * R * 10} 0 0 1 ${x2},${y2} Z" fill="rgba(79,163,255,${sel ? ".16" : ".07"})" stroke="#4fa3ff" stroke-width="${sel ? 2 : 1.2}" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
  }

  _airSectionHtml(d) {
    const eid = this.work.positions[d.id] && this._climateEnt(d.id);
    if (!eid) return "";
    if (!this._canCool(eid)) return `<div class="lsec air"><div class="lh">🔥 Heating on the plan</div><div style="font-size:12px;color:var(--df-sec)">Heat only (radiator, underfloor): the card shows a soft warm glow here while it heats.</div></div>`;
    const c = this._air(d.id);
    const W = this._realW();
    const v = (pct) => (W ? ((pct * W) / 100).toFixed(1) : pct.toFixed(1));
    const sp = c.s <= 40 ? "35" : c.s >= 80 ? "90" : "60";
    return `<div class="lsec air"><div class="lh">🌬 Air flow on the plan<small>${c.auto ? "automatic" : "set by you"}</small></div>
      <div class="lchips"><button class="${c.type === "cone" ? "on" : ""}" data-act="airtype" data-type="cone">Air flow</button><button class="${c.type === "none" ? "on" : ""}" data-act="airtype" data-type="none">None</button></div>
      ${c.type === "cone" ? `<div class="lsz"><label>Reach <input id="airr" inputmode="decimal" value="${v(c.r)}"></label>${W ? "m" : "% of the plan"}<label>Spread <select id="airs"><option value="35" ${sp === "35" ? "selected" : ""}>Narrow</option><option value="60" ${sp === "60" ? "selected" : ""}>Normal</option><option value="90" ${sp === "90" ? "selected" : ""}>Wide</option></select></label></div>` : ""}
      <div style="font-size:12px;color:var(--df-sec)">${c.type === "none" ? "No air flow on the card." : "Drag the blue handle on the plan to point it into the room. While cooling or heating, the card shows the air flowing (blue cool, orange heat), kept inside the room's shape."}</div></div>`;
  }

  /** 0.7.0: the door / window / shutter of this spot: a cover, or a door/window contact. */
  _openingEnt(id) {
    const d = this.byId.get(id);
    if (!d || !this._hass) return null;
    const ok = (eid) => {
      const dom = String(eid || "").split(".")[0];
      if (dom === "cover") return true;
      const st = this._hass.states[eid];
      return dom === "binary_sensor" && st && ["door", "window", "opening", "garage_door"].includes(st.attributes.device_class);
    };
    if (d.split || d.loose) return ok(d.entity_id) ? d.entity_id : null;
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    const ents = (d.entities || []).map((x) => x.entity_id).filter((e) => !spots.has(e));
    return ents.find((e) => e.startsWith("cover.") && ok(e)) || ents.find(ok) || null;
  }

  /** Door, window or shutter: chosen, else guessed from the device class and name. */
  _openAs(id) {
    const pos = this.work.positions[id] || {};
    if (["door", "window", "shutter"].includes(pos.as)) return pos.as;
    return guessOpenAs(this._openingEnt(id), this._hass, (this.byId.get(id) || {}).name);
  }

  _openSectionHtml(d) {
    const pos = this.work.positions[d.id];
    const eid = pos && this._openingEnt(d.id);
    if (!eid) return "";
    const as = this._openAs(d.id);
    const chips = [["door", "Door"], ["window", "Window"], ["shutter", "Shutter"]].map(([k, l]) => `<button class="${as === k ? "on" : ""}" data-act="openas" data-as="${k}">${l}</button>`).join("");
    const what = as === "shutter" ? (eid.startsWith("cover.") ? "a white bar filled as far as it's closed; fully closed it fades away and the room gets darker by day" : "a white outlined bar while open; closed, the bar goes away and the room gets darker by day") : "a light blue bar while open, nothing while closed";
    return `<div class="lsec opn"><div class="lh">🪟 Opening on the plan<small>${["door", "window", "shutter"].includes(pos.as) ? "set by you" : "automatic"}</small></div>
      <div class="lchips">${chips}</div>
      <div class="lchips">${pos.opening ? `<button data-act="opendel">Remove the bar</button>` : `<button class="on" data-act="opendraw">Draw it on the plan</button>`}</div>
      <div style="font-size:12px;color:var(--df-sec)">${pos.opening ? `Drag the two ends along the wall (they snap straight, Alt for any angle). On the card: ${what}.` : `Mark where the ${as} is: the card then shows ${what}, instead of a marker.`}</div></div>`;
  }

  /** Has this device (or its bond) a light? Light shapes live on the bond's leader (#84). */
  _isLight(id) {
    const b = this._bondOf(id);
    const ids = b ? b[1] : [id];
    return ids.some((m) => {
      const d = this.byId.get(m);
      if (!d) return false;
      if (d.split) return d.entity_id.startsWith("light.") || d.as === "light";
      if (d.loose) return String(d.entity_id || "").startsWith("light.");
      const e = this.mainEntity[d.id] || d.main_entity;
      const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
      return (e && e.startsWith("light.") && !spots.has(e)) || this._ownLights(d).length > 0;
    });
  }

  /** A real lamp gets a bulb automatically; anything else starts with no shape (#84). */
  _isLamp(id) {
    const b = this._bondOf(id);
    const ids = b ? b[1] : [id];
    return ids.some((m) => {
      const d = this.byId.get(m);
      if (!d) return false;
      if (d.split) return d.entity_id.startsWith("light.") || d.as === "light";
      if (d.loose) return String(d.entity_id || "").startsWith("light.");
      return d.group === "lights" && this._ownLights(d).length > 0;
    });
  }

  _shape(id) {
    const lead = this._bondLeader(id);
    const pos = this.work.positions[lead];
    if (!pos) return null;
    const lamp = this._isLamp(id);
    const s = pos.light && pos.light.type ? { ...this._defaultShape(pos.light.type, lamp), ...pos.light } : this._defaultShape(lamp ? "bulb" : "none");
    if (s.type === "strip" && (s.x2 == null || s.y2 == null)) Object.assign(s, { x2: clamp(pos.x + 8, 0, 100), y2: pos.y });
    if (s.type === "panel" && s.h == null) s.h = s.w * this._ratio();
    return { ...s, x: pos.x, y: pos.y, auto: !pos.light, lead };
  }

  _ratio() {
    const p = this._plan();
    return p && p.width && p.height ? p.width / p.height : 1.6;
  }

  _shapeSvg(s, cls) {
    const R = this._ratio();
    const lc = lightCss(s.color); // #112: preview the chosen colour
    const fill = lc ? `fill="${lc}" fill-opacity="${cls === "sel" ? ".28" : ".14"}"` : `fill="rgba(245,158,11,${cls === "sel" ? ".14" : ".06"})"`;
    const st = cls === "sel" ? `${fill} stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4"` : `${fill} stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"`;
    const ve = `vector-effect="non-scaling-stroke"`;
    if (s.type === "none") return "";
    if (s.type === "strip") return `<line x1="${s.x * 10}" y1="${s.y * 10}" x2="${s.x2 * 10}" y2="${s.y2 * 10}" stroke="rgba(245,158,11,.35)" stroke-width="${Math.max(4, s.r * 6)}" stroke-linecap="round"/><line x1="${s.x * 10}" y1="${s.y * 10}" x2="${s.x2 * 10}" y2="${s.y2 * 10}" ${st} ${ve}/>`;
    if (s.type === "panel") return `<rect x="${(s.x - s.w / 2) * 10}" y="${(s.y - s.h / 2) * 10}" width="${s.w * 10}" height="${s.h * 10}" rx="4" ${st} ${ve}/>`;
    if (s.type === "wall") {
      const a = ((s.a ?? 90) * Math.PI) / 180;
      const rx = s.r * 10;
      const ry = s.r * R * 10;
      const p0 = [s.x * 10 + Math.cos(a - Math.PI / 2) * rx, s.y * 10 + Math.sin(a - Math.PI / 2) * ry];
      const p1 = [s.x * 10 + Math.cos(a + Math.PI / 2) * rx, s.y * 10 + Math.sin(a + Math.PI / 2) * ry];
      return `<path d="M${p0[0]},${p0[1]} A${rx},${ry} 0 0 1 ${p1[0]},${p1[1]} Z" ${st} ${ve}/>`;
    }
    return `<ellipse cx="${s.x * 10}" cy="${s.y * 10}" rx="${s.r * 10}" ry="${s.r * R * 10}" ${st} ${ve}/>`;
  }

  /** Handles for the selected light's shape (drag on the plan). */
  _shapeHandles(s) {
    const R = this._ratio();
    if (!s || s.type === "none") return "";
    if (s.type === "strip") return `<span class="lhd" data-lh="end" data-x="${s.x2}" data-y="${s.y2}" title="Drag the end of the strip"></span>`;
    if (s.type === "panel") return `<span class="lhd" data-lh="corner" data-x="${s.x + s.w / 2}" data-y="${s.y + s.h / 2}" title="Drag to size the panel"></span>`;
    if (s.type === "wall") {
      const a = ((s.a ?? 90) * Math.PI) / 180;
      return `<span class="lhd" data-lh="wall" data-x="${s.x + Math.cos(a) * s.r}" data-y="${s.y + Math.sin(a) * s.r * R}" title="Drag: size and direction"></span>`;
    }
    return `<span class="lhd" data-lh="r" data-x="${s.x + s.r}" data-y="${s.y}" title="Drag to size the light"></span>`;
  }

  /** #112: colour for lights that don't report one (smart bulbs: Auto = their real colour). */
  _lightColourHtml(s) {
    const col = s.color || "auto";
    const k = col.startsWith("k:") ? Number(col.slice(2)) : 3000;
    const hex = col.startsWith("#") ? col : "#ffd27f";
    return `<div class="lcol"><span>Colour</span><button class="${col === "auto" ? "on" : ""}" data-act="lightauto" title="Use the real colour of smart lights. Plain lights glow warm white.">Auto</button>
      <input type="range" id="lightk" min="2200" max="6500" step="100" value="${k}" class="${col.startsWith("k:") ? "on" : ""}" aria-label="Warm to cool white" title="Pick a white: warm ↔ cool">
      <input type="color" id="lighthex" value="${hex}" class="${col.startsWith("#") ? "on" : ""}" aria-label="Custom colour" title="Pick any colour"></div>`;
  }

  _lightSectionHtml(d) {
    if (!this.work.positions[d.id] || !this._isLight(d.id)) return "";
    const s = this._shape(d.id);
    const W = this._realW();
    const v = (pct) => (W ? ((pct * W) / 100).toFixed(1) : pct.toFixed(1));
    const u = W ? "m" : "% of the plan";
    const types = [["bulb", "Bulb"], ["spot", "Spot"], ["strip", "Strip"], ["panel", "Panel"], ["wall", "Wall lamp"], ["none", "None"]];
    let size = "";
    if (s.type === "panel") size = `<label>Width <input id="lightw" inputmode="decimal" value="${v(s.w)}"></label><label>Height <input id="lighth" inputmode="decimal" value="${v((s.h / this._ratio()))}"></label>${u}`;
    else if (s.type !== "none") size = `<label>${s.type === "strip" ? "Glow width" : "Radius"} <input id="lightr" inputmode="decimal" value="${v(s.r)}"></label>${u}`;
    return `<div class="lsec"><div class="lh">💡 Light on the plan<small>${s.auto ? "automatic" : "set by you"}</small></div>
      <div class="lchips">${types.map(([k, l]) => `<button class="${s.type === k && !(s.auto && k !== "bulb") ? "on" : ""}" data-act="lighttype" data-type="${k}">${l}</button>`).join("")}</div>
      ${size ? `<div class="lsz">${size}</div>` : ""}
      ${s.type === "none" ? "" : this._lightColourHtml(s)}
      <div style="font-size:12px;color:var(--df-sec)">${s.type === "none" ? "No light pool on the card." : "Drag the orange handle on the plan. The card draws a soft light pool here when the light is on."}${this._bondOf(d.id) ? " One shape for the whole bond." : ""}</div></div>`;
  }

  _extraCtlHtml() {
    if (this.s.tool !== "place") return "";
    return `<button class="ovbtn ${this.s.nightPrev ? "on" : ""}" data-act="nightprev" aria-pressed="${!!this.s.nightPrev}" title="See it at night: all light shapes glow as if on" aria-label="See it at night">${SVG.moon}</button>`;
  }

  _extraLayerRows() {
    const on = this.s.layers.lightshapes === true;
    const sh = this.s.layers.roomshapes !== false;
    const hasShapes = this.work && Object.keys(this.work.shapes || {}).length;
    return `${hasShapes ? `<button class="lrow ${sh ? "" : "off"}" data-act="layer" data-key="roomshapes" aria-pressed="${sh}"><span class="eye">${SVG.eye}</span><span class="l">Room shapes</span></button>` : ""}<button class="lrow ${on ? "" : "off"}" data-act="layer" data-key="lightshapes" aria-pressed="${on}"><span class="eye">${SVG.eye}</span><span class="l">Light shapes</span></button>`;
  }

  /** Night preview and light-shape outlines in the SVG layer. */
  _lightSvg() {
    if (!this.work) return "";
    const s = this.s;
    const lights = Object.keys(this.work.positions).filter((id) => this.byId.get(id) && !this.skipped.has(id) && this._bondLeader(id) === id && this._isLight(id));
    let out = "";
    if (s.nightPrev) {
      const R = this._ratio();
      out += `<defs><radialGradient id="lglow"><stop offset="0" stop-color="rgb(255,196,120)" stop-opacity=".95"/><stop offset=".55" stop-color="rgb(255,180,90)" stop-opacity=".45"/><stop offset="1" stop-color="rgb(255,170,80)" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="1000" height="1000" fill="rgba(10,16,38,.72)"/>`;
      for (const id of lights) {
        const sh = this._shape(id);
        if (!sh || sh.type === "none") continue;
        const ells = sh.type === "strip" ? [0, 1, 2, 3, 4].map((i) => ({ x: sh.x + ((sh.x2 - sh.x) * i) / 4, y: sh.y + ((sh.y2 - sh.y) * i) / 4, rx: sh.r, ry: sh.r * R }))
          : sh.type === "panel" ? [{ x: sh.x, y: sh.y, rx: sh.w * 0.8, ry: sh.h * 0.8 }]
            : sh.type === "wall" ? [{ x: sh.x + Math.cos(((sh.a ?? 90) * Math.PI) / 180) * sh.r * 0.45, y: sh.y + Math.sin(((sh.a ?? 90) * Math.PI) / 180) * sh.r * 0.45 * R, rx: sh.r * 0.9, ry: sh.r * 0.9 * R }]
              : [{ x: sh.x, y: sh.y, rx: sh.r, ry: sh.r * R }];
        for (const e of ells) out += `<ellipse cx="${e.x * 10}" cy="${e.y * 10}" rx="${e.rx * 10}" ry="${e.ry * 10}" fill="url(#lglow)" style="mix-blend-mode:screen"/>`;
      }
    }
    const selLead = s.sel && this.work.positions[s.sel] && this._isLight(s.sel) ? this._bondLeader(s.sel) : null;
    if (s.layers.lightshapes === true) for (const id of lights) if (id !== selLead) out += this._shapeSvg(this._shape(id), "");
    if (selLead) out += this._shapeSvg(this._shape(selLead), "sel");
    if (s.sel && this.work.positions[s.sel] && this._climateEnt(s.sel) && this._canCool(this._climateEnt(s.sel))) out += this._airSvg(this._air(s.sel), true);
    // 0.7.0: openings (doors, windows, shutters): all faint, the selected one bold.
    for (const [id, pos] of Object.entries(this.work.positions)) {
      const o = pos.opening;
      if (!o) continue;
      const sel = id === s.sel;
      const col = this._openAs(id) === "shutter" ? "#ffffff" : "#26c6da";
      out += `<line x1="${o.x1 * 10}" y1="${o.y1 * 10}" x2="${o.x2 * 10}" y2="${o.y2 * 10}" stroke="${col}" stroke-opacity="${sel ? 0.95 : 0.45}" stroke-width="${sel ? 7 : 5}" stroke-linecap="round" vector-effect="non-scaling-stroke"${sel ? "" : ' stroke-dasharray="8 6"'}/>`;
    }
    return out;
  }

  // ------------------------------------------------------- bonds & phantoms (#56–#62)
  _tip(key) {
    if (this.s.guide === false) return "";
    const T = {
      bond: ["Bond", "Several physical devices on the same spot, treated as one device: one marker on the card, switched together, value combined (2 of 3 on, lowest battery). Unbond any time.", "bonds"],
      autobond: ["Bonded automatically", "This device is connected through the other one, comes from the same integration, has no network of its own and its name starts with the other's name or model. Unbond it if you want them separate.", "bonds"],
      phantom: ["Phantom", "One combined value from devices anywhere in your home, shown like a device: average temperature, any window open, motion anywhere. Its devices stay where they are.", "phantoms"],
      split: ["Split device", "The device sits where its hardware is; each light or switch it controls can sit where it acts. Network and Health show the device.", "split"],
      stack: ["Same spot", "Devices on the same spot stay separate devices. Bond them only if they are one thing.", "bonds"],
    }[key];
    if (!T) return "";
    const on = this.s.itip === key;
    return `<span class="itipw"><button class="itip ${on ? "on" : ""}" data-act="itip" data-key="${key}" aria-label="What is ${esc(T[0])}?" aria-expanded="${on}">i</button>${on ? `<span class="ipop" role="note"><b>${esc(T[0])}</b>${esc(T[1])} <a href="${DOCS}together/${T[2]}" target="_blank" rel="noopener">Learn more</a><button class="x" data-act="itip" data-key="${key}" aria-label="Close">✕</button></span>` : ""}</span>`;
  }

  _bondMeta(bid) {
    return ((this.work && this.work.bond_meta) || {})[bid] || {};
  }

  _commonPrefix(names) {
    if (names.length < 2) return "";
    let p = names[0];
    for (const n of names) while (p && !n.startsWith(p)) p = p.slice(0, -1);
    if (names.every((n) => n.length === p.length || /[\s\-_·.,]/.test(n[p.length]))) return p;
    const m = p.match(/^(.*[\s\-_·.,])/);
    return m ? m[1] : "";
  }

  _shortNames(names) {
    const p = this._commonPrefix(names);
    if (p.trim().length < 3) return names.slice();
    return names.map((n) => n.slice(p.length).replace(/^[\s\-_·.,]+/, "").trim() || n);
  }

  _bondName(b) {
    const meta = this._bondMeta(b[0]);
    if (meta.name) return meta.name;
    const names = b[1].filter((m) => this.work.positions[m]).map((m) => (this.byId.get(m) || {}).name || m);
    const p = this._commonPrefix(names).replace(/[\s\-_·.,]+$/, "").trim();
    return p.length >= 3 ? `${p} ×${names.length}` : names[0] || "Bond";
  }

  _bondMeaning(ids) {
    const doms = ids.map((m) => { const d = this.byId.get(m); const e = d && (this.mainEntity[d.id] || d.main_entity); return e ? e.split(".")[0] : ""; });
    const dcs = ids.map((m) => { const d = this.byId.get(m); const e = d && (this.mainEntity[d.id] || d.main_entity); const so = e && this._hass && this._hass.states[e]; return (so && so.attributes.device_class) || ""; });
    if (doms.every((x) => ["light", "switch", "fan", "media_player", "cover", "valve"].includes(x))) return "Switched together on the card · shows “2 of 3 on”";
    if (dcs.every((x) => ["motion", "occupancy", "presence"].includes(x))) return "Detected if any of them detects";
    if (dcs.every((x) => ["door", "window", "opening", "garage_door"].includes(x))) return "Open if any of them is open";
    if (dcs.every((x) => ["temperature", "humidity"].includes(x))) return "One value: the average (the card can show lowest, highest or one)";
    return "One marker on the card; tap does what the first device does";
  }

  _memberRow(m, actOut, label) {
    const d = this.byId.get(m);
    const v = d ? this._ringVars(d) : { c1: "var(--df-sec)" };
    const ent = d && (this.mainEntity[d.id] || d.main_entity);
    const so = ent && this._hass ? this._hass.states[ent] : null;
    const state = so ? (this._hass.formatEntityState ? this._hass.formatEntityState(so) : so.state) : "";
    return `<div class="mem"><span class="cring" style="--c1:${v.c1}">${d ? this._iconHtml(d) : "?"}</span><button class="link" data-act="memopen" data-id="${esc(m)}" title="${esc(d ? d.name : m)}">${esc(label)}</button><span class="mst">${esc(state)}</span><button class="small" data-act="${actOut}" data-id="${esc(m)}" aria-label="Take ${esc(d ? d.name : m)} out" title="Take out">${SVG.close}</button></div>`;
  }

  _bondCardHtml(b) {
    const s = this.s;
    const ids = b[1].filter((m) => this.work.positions[m]);
    const meta = this._bondMeta(b[0]);
    const names = ids.map((m) => (this.byId.get(m) || {}).name || m);
    const short = this._shortNames(names);
    const lead = this.byId.get(ids[0]);
    const more = !!s.more;
    const moreBox = ""; // tap and "2 of 3" moved to the card (Edit markers)
    return `<div class="details bondcard"><div class="top"><span class="ico" style="width:36px;height:36px">${meta.icon ? `<ha-icon icon="${esc(meta.icon)}"></ha-icon>` : lead ? this._iconHtml(lead) : SVG.link}</span>
      <div style="flex:1;min-width:0"><input class="nmin" id="bondname" data-bond="${esc(b[0])}" value="${esc(this._bondName(b))}" aria-label="Bond name" maxlength="60"><div class="sub bh"><span class="bcount">×${ids.length}</span>Bonded · one device ${this._tip("bond")}</div></div>
      <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
      <div style="font-size:12px;color:var(--df-sec)">${esc(this._bondMeaning(ids))}</div>
      <div class="mems">${ids.map((m, i) => this._memberRow(m, "bout", short[i])).join("")}</div>
      <div style="font-size:12px;color:var(--df-sec)">Add more: drag a device onto this marker.</div>
      ${this._lightSectionHtml(this.byId.get(ids[0]) || { id: ids[0] })}
      <div class="acts"><button class="btn" data-act="unbondall">Unbond all</button><button class="btn danger" data-act="remove">Remove from plan</button></div>${moreBox}</div>`;
  }

  /** #103: which entities of a member count (default: all its readings). */
  _phUsesHtml(pid, ph, m) {
    const d = this.byId.get(m);
    if (!d || d.loose) return "";
    const cands = (d.entities || []).filter((e) => ["sensor", "binary_sensor", "climate"].includes(e.domain));
    if (cands.length < 2) return "";
    const uses = (ph.uses || {})[m] || [];
    const open = this.s.phUses === m;
    const label = uses.length ? `${uses.length} of ${cands.length}` : "All readings";
    const list = open ? `<div class="uses">${cands.map((e) => `<label class="chk"><input type="checkbox" data-act="phuse" data-ph="${esc(pid)}" data-m="${esc(m)}" data-e="${esc(e.entity_id)}" ${!uses.length || uses.includes(e.entity_id) ? "checked" : ""}> ${esc(e.name && e.name !== e.entity_id ? e.name : e.entity_id)} <small>${esc(e.domain)}</small></label>`).join("")}</div>` : "";
    return `<div class="usesrow"><button class="link" data-act="phusesopen" data-id="${esc(m)}">Uses: ${esc(label)} ${open ? "▴" : "▾"}</button>${list}</div>`;
  }

  _phantomCardHtml(pid) {
    const ph = (this.work.phantoms || {})[pid];
    if (!ph) return "";
    const ids = (ph.members || []).filter((m) => this.work.positions[m]);
    const names = ids.map((m) => (this.byId.get(m) || {}).name || m);
    const vsel = ph.value || "average";
    return `<div class="details phcard"><div class="top"><span class="ico" style="width:36px;height:36px"><ha-icon icon="${esc(ph.icon || "dfp:phantom")}"></ha-icon></span>
      <div style="flex:1;min-width:0"><input class="nmin" id="phname" data-ph="${esc(pid)}" value="${esc(ph.name || "Phantom")}" aria-label="Phantom name" maxlength="60"><div class="sub bh"><span class="bcount ph">${ids.length}</span>Phantom · combined value ${this._tip("phantom")}</div></div>
      <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
      ${ids.length < 2 ? `<div class="note"><b>Drag devices that are already on the plan onto this phantom.</b> They join it and jump back to their own spot. With 2 or more it's ready: move it wherever you want it shown.</div>` : ""}
      ${ids.length ? `<div style="font-size:12px;font-weight:500">Combined devices</div><div class="mems">${ids.map((m, i) => this._memberRow(m, "phout", names[i]) + this._phUsesHtml(pid, ph, m)).join("")}</div>` : ""}
      <label class="fl">Value on the card (numbers)<select data-act="phvalue"><option value="average" ${vsel === "average" ? "selected" : ""}>Average</option><option value="min" ${vsel === "min" ? "selected" : ""}>Lowest</option><option value="max" ${vsel === "max" ? "selected" : ""}>Highest</option><option value="one" ${vsel === "one" ? "selected" : ""}>One device</option></select></label>
      ${vsel === "one" ? `<label class="fl">Which device<select data-act="phone">${ids.map((m, i) => `<option value="${esc(m)}" ${ph.one === m ? "selected" : ""}>${esc(names[i])}</option>`).join("")}</select></label>` : ""}
      <div style="font-size:12px;color:var(--df-sec)">Motion: detected if any · doors and windows: open if any. The card can show it with its own popup and graph.</div>
      <div class="acts"><button class="btn danger" data-act="phdel">Delete phantom</button></div></div>`;
  }

  _toastHtml() {
    const t = this.s.toast;
    if (!t) return "";
    return `<div class="toast" id="toast" role="status"><span>${esc(t.text)}</span>${t.undo ? `<button data-act="toastundo">Undo</button>` : ""}<button data-act="toastclose" aria-label="Dismiss" style="color:#c4c8cd">✕</button></div>`;
  }

  // -------------------------------------------------------------- dialogs
  _modalHtml() {
    const dlg = this.s.dialog;
    if (!dlg) return "";
    const wrap = (inner, width = 560) => `<div class="modal" data-act="modalbg"><div class="dialog" role="dialog" aria-modal="true" style="max-width:${width}px">${inner}</div></div>`;
    if (dlg.type === "create" || dlg.type === "settings") return `<div class="modal" data-act="modalbg">${this._planFormHtml(dlg.type, false)}</div>`;
    const p = this._plan();
    if (dlg.type === "delete") {
      const n = p ? Object.keys(p.positions || {}).length : 0;
      const what = p && p.kind === "floor" ? "floor" : "plan";
      return wrap(`<h2>Delete “${esc(p.name)}”?</h2><p>The ${what}, its image${n ? ` and the positions of <b>${n} placed device${n > 1 ? "s" : ""}</b>` : ""} are removed, together with its device and entities in Home Assistant. Your devices themselves are not touched.</p>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" style="background:var(--error-color,#b3261e)" data-act="dodelete">Delete ${what}</button></div>`);
    }
    if (dlg.type === "rename") {
      return wrap(`<h2>Rename</h2><label class="f">Name<input type="text" id="rname" value="${esc(dlg.name ?? p.name)}" maxlength="60"></label><div class="err" id="formerr"></div>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" data-act="dorename">Save</button></div>`, 420);
    }
    if (dlg.type === "hideroom") {
      const a = this.areaById.get(dlg.area);
      const n = dlg.ids.length;
      return wrap(`<h2>Hide ${esc(a ? a.name : "this room")}?</h2><p>${n} device${n > 1 ? "s" : ""} from ${esc(a ? a.name : "this room")} ${n > 1 ? "are" : "is"} already on the plan. Keep ${n > 1 ? "them" : "it"} there, or take ${n > 1 ? "them" : "it"} off the plan too?</p>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn" data-act="hideroom" data-keep="1">Keep ${n > 1 ? "them" : "it"}</button><button class="btn primary" data-act="hideroom" data-keep="0">Remove ${n > 1 ? "them" : "it"}</button></div>`, 480);
    }
    if (dlg.type === "bondask") {
      const A = this.byId.get(dlg.a) || { name: "This device" };
      const B = this.byId.get(dlg.b) || { name: "the other device" };
      return `<div class="modal" data-act="modalbg"><div class="dialog bondask" role="dialog" aria-modal="true" style="max-width:480px"><h2>${esc(A.name)} is now on the same spot as ${esc(B.name)}</h2>
        <p>Are they one thing (like bulbs in one lamp), or just placed close together?</p>
        <div class="acts" style="flex-wrap:wrap"><button class="btn" data-act="bondno">Keep separate – just the same spot</button><button class="btn primary" data-act="bondyes">Bond them – one device on the card</button></div>
        <p style="font-size:12px;color:var(--df-sec);margin:4px 0 0">ⓘ A bond shows as one marker and is switched together. You can unbond any time.</p></div></div>`;
    }
    if (dlg.type === "ready") return wrap(this._readyHtml(), 580);
    if (dlg.type === "added") return wrap(this._addedHtml(), 520);
    if (dlg.type === "adddash") return wrap(this._addDashHtml(), 560);
    if (dlg.type === "preview") {
      return `<div class="modal" data-act="modalbg"><div class="dialog" role="dialog" aria-modal="true" style="max-width:1000px;width:100%"><h2 class="okttl">Live view · ${esc(p.name)} <span class="live"><i></i>LIVE</span></h2>
        <p>This is your plan, live. Try it: tap a sensor or a light to open its details and controls. This is the default style; you can adjust what the card shows and how it looks in the card's settings.</p>
        <div class="cardprev" id="cardprev"></div>
        <div class="acts">${dlg.from ? `<button class="btn" data-act="dlgback" style="margin-right:auto">← Back</button>` : ""}<button class="btn" data-act="closedlg">Close</button><button class="btn primary" data-act="toadddash">${dlg.dash ? "+ Add to another dashboard" : "Add to dashboard"}</button></div></div></div>`;
    }
    if (dlg.type === "export") {
      const n = p ? Object.keys((this.work || {}).positions || {}).length : 0;
      return wrap(`<h2>Export “${esc(p.name)}”</h2><p>${n} placed device${n === 1 ? "" : "s"}. Choose a format:</p>
        <button class="opt" data-act="doexport" data-fmt="csv" style="text-align:left;background:transparent"><span><b>CSV spreadsheet</b><span>One row per device: name, area, connection, position (% of the image, and metres if measured), status. For Excel, inventory or network planning.</span></span></button>
        <button class="opt" data-act="doexport" data-fmt="json" style="text-align:left;background:transparent"><span><b>Plan backup (JSON)</b><span>The whole plan: image, measurements, rooms and positions. Restore it with “Import a plan” when creating a new plan, also on another Home Assistant.</span></span></button>
        <button class="opt" data-act="doexport" data-fmt="png" style="text-align:left;background:transparent"><span><b>Picture (PNG)</b><span>The plan with the devices drawn on it and a legend. For printing or handing over to an installer.</span></span></button>
        <div class="box">⚠ These files show your home's layout and where your devices, sensors and cameras are. Share them carefully.</div>
        <div class="err" id="formerr">${esc(dlg.err || "")}</div>
        <div class="acts"><button class="btn" data-act="closedlg">Close</button></div>`, 560);
    }
    return "";
  }

  _readyHtml() {
    const p = this._plan();
    const dlg = this.s.dialog;
    const pos = (this.work && this.work.positions) || {};
    const placed = Object.keys(pos).length;
    const approx = Object.values(pos).filter((x) => x.approx).length;
    const notYet = this.devices.filter((d) => this._inScope(d) && this._status(d) === "unplaced").length;
    const dash = dlg.dash;
    const preview = `<button class="btn" data-act="preview">Preview live view</button>`;
    const haBox = `<b>What's in Home Assistant</b><br>📍 <b>${esc(/plan$/i.test(p.name) ? p.name : `${p.name} plan`)}</b>: a device under Settings → Devices${[p.sensor_entity, p.image_entity].filter(Boolean).length ? `, with ${[p.sensor_entity, p.image_entity].filter(Boolean).map((e) => `<code>${esc(e)}</code>`).join(", ")}` : ""}. It holds your plan and the positions of your devices; deleting the plan removes it.
        ${p.device_id ? `<br><button class="link" style="padding:4px 0" data-act="opendevice">Open device</button> · ` : "<br>"}<button class="link" style="padding:4px 0" data-act="export">Export…</button>`;
    const later = `You can come back anytime to add, move or remove devices, or add floors. Everything is saved automatically, and new devices you add to Home Assistant show up here marked <b>New</b>.${approx ? ` ${approx} device${approx > 1 ? "s are" : " is"} still approximate: confirm ${approx > 1 ? "them" : "it"} whenever you like.` : ""}`;
    if (dash === undefined) {
      return `<h2 class="okttl">${SVG.okcircle}Your ${esc(p.name)} plan</h2><p>Checking your dashboards…</p>`;
    }
    if (dash) {
      // Already on a dashboard: the card reads the plan live, nothing to "send".
      const df = dlg.diff;
      const parts = df ? [df.added ? `<b>+${df.added}</b> placed` : "", df.moved ? `<b>${df.moved}</b> moved` : "", df.removed ? `<b>${df.removed}</b> removed` : ""].filter(Boolean) : [];
      const changes = parts.length ? `Since last time: ${parts.join(" · ")}` : "No changes since last time.";
      return `<h2 class="okttl">${SVG.okcircle}Your dashboard is up to date</h2>
        <p>The ${esc(p.name)} card on <b>${esc(dash.title)}</b> shows your plan live, so every change you make here is already there.</p>
        <div class="stat"><span>${changes}</span></div>
        <div class="stat"><span><b>${placed}</b> placed</span>${approx ? `<span><b>${approx}</b> approximate</span>` : ""}<span style="color:var(--df-sec)">${notYet} not placed yet</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="opendash" data-path="${esc(dash.path)}">Open dashboard (${esc(dash.title)})</button>${preview}<button class="btn" data-act="toadddash">+ Add to another dashboard</button></div>
        <details class="box"><summary style="cursor:pointer">What's in Home Assistant</summary>${haBox.replace("<b>What's in Home Assistant</b><br>", "")}</details>
        <p>${later}</p>
        <div class="acts"><button class="btn" data-act="closedlg">Done</button></div>`;
    }
    return `<h2 class="okttl">${SVG.okcircle}Your ${esc(p.name)} plan is ready to use</h2>
      <div class="stat"><span><b>${placed}</b> device${placed === 1 ? "" : "s"} placed</span>${approx ? `<span><b>${approx}</b> approximate</span>` : ""}<span style="color:var(--df-sec)">${notYet} not placed yet</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="toadddash">Add to dashboard</button>${preview}</div>
      <div style="font-size:13px;color:var(--df-sec)">Already have a floorplan card? Edit it and tick this floor under <b>Floors</b>.</div>
      <div class="box">${haBox}</div>
      <p>${later}</p>
      <div class="acts"><button class="btn" data-act="closedlg">Done</button></div>`;
  }

  _addedHtml() {
    const d = this.s.dialog;
    return `<h2 class="okttl">${SVG.okcircle}Added to ${esc(d.title)}</h2>
      <p>The ${esc(this._plan().name)} plan is now on your dashboard, in ${d.viewNew ? "a new view" : "the view"} <b>“${esc(d.view)}”</b>.${d.newDash ? ` A new dashboard <b>“${esc(d.title)}”</b> was added to your sidebar.` : ""}</p>
      <p>It updates by itself: when you add, move or remove devices here, the dashboard follows.</p>
      <div class="acts"><button class="btn" data-act="closedlg">Close</button><button class="btn primary" data-act="opendash" data-path="${esc(d.path)}">Open dashboard</button></div>`;
  }

  _addDashHtml() {
    const d = this.s.dialog;
    const p = this._plan();
    const yaml = `type: custom:device-floorplan-card\nplan: ${p.id}`;
    if (!d.dashboards) return `<h2>Add to dashboard</h2><p>Loading your dashboards…</p>`;
    const opts = d.dashboards.map((x) => `<option value="${esc(x.key)}" ${x.key === d.key ? "selected" : ""} ${x.mode === "yaml" ? "disabled" : ""}>${esc(x.title)}${x.mode === "yaml" ? " (YAML mode)" : ""}</option>`).join("");
    let body = "";
    if (d.cfgError) {
      body = `<div class="box">${esc(d.cfgError)} Add the card by hand instead: edit the dashboard, add a <b>Manual</b> card and paste:</div><div class="yaml">${esc(yaml)}</div><button class="btn" data-act="copyyaml">Copy</button>`;
    } else if (!d.config) body = `<p>Loading…</p>`;
    else {
      const views = d.config.views || [];
      const vopts = views.map((v, i) => `<option value="${i}" ${String(i) === String(d.view) ? "selected" : ""} ${v.type === "panel" ? "disabled" : ""}>${esc(v.title || v.path || `View ${i + 1}`)}${v.type === "panel" ? " (full width, has a card)" : ""}</option>`).join("");
      const isNew = (d.dashboards.find((x) => x.key === d.key) || {}).mode === "new";
      body = `${d.note ? `<div class="box">${esc(d.note)}</div>` : ""}<label class="opt ${d.where !== "view" ? "on" : ""}"><input type="radio" name="dw" value="new" data-act="dashwhere" ${d.where !== "view" ? "checked" : ""}><span><b>New full-width view “${esc(p.name)}” (recommended)</b><span>The plan gets the whole screen, best on wall tablets.</span></span></label>
        <label class="opt ${d.where === "view" ? "on" : ""}"><input type="radio" name="dw" value="view" data-act="dashwhere" ${d.where === "view" ? "checked" : ""} ${views.length && !isNew ? "" : "disabled"}><span><b>Add to an existing view</b><span>The card is added at the end of the view.</span></span></label>
        ${d.where === "view" ? `<label class="f">View<select id="dview" data-act="dashview">${vopts}</select></label>` : ""}`;
    }
    return `<h2>Add to dashboard</h2><label class="f">Dashboard<select id="dkey" data-act="dashkey">${opts}</select></label>${body}
      <div class="err" id="formerr">${esc(d.err || "")}</div>
      <div class="acts">${d.from ? `<button class="btn" data-act="dlgback" style="margin-right:auto">← Back</button>` : ""}<button class="btn" data-act="closedlg">Cancel</button>${d.cfgError ? "" : `<button class="btn primary" data-act="doadddash" ${d.config && !d.busy ? "" : "disabled"}>${d.busy ? "Adding…" : "Add card"}</button>`}</div>`;
  }

  _planFormHtml(mode, inline) {
    const p = mode === "settings" ? this._plan() : null;
    const f = this.s.form || (this.s.form = {});
    const name = f.name ?? (p ? p.name : this.floors[0] && !this.plans.length ? this.floors[0].name : "Ground floor");
    const freeFloor = this.floors.find((fl) => !this.plans.some((pl) => pl.floor_id === fl.floor_id));
    const where = f.where ?? (p ? (p.kind === "view" ? "view" : p.floor_id ? `floor:${p.floor_id}` : "level") : freeFloor ? `floor:${freeFloor.floor_id}` : "level");
    const level = f.level ?? (p && p.level != null ? p.level : 0);
    const img = f.img ?? (p ? p.image_type : "top");
    const used = (fid) => this.plans.some((pl) => pl.floor_id === fid && (!p || pl.id !== p.id));
    const floorOpts = this.floors.map((fl) => `<option value="floor:${esc(fl.floor_id)}" ${where === `floor:${fl.floor_id}` ? "selected" : ""} ${used(fl.floor_id) ? "disabled" : ""}>${esc(fl.name)} (HA floor, level ${fl.level ?? "?"})${used(fl.floor_id) ? " · has a plan" : ""}</option>`).join("");
    const opt = (val, title, desc) => `<label class="opt ${img === val ? "on" : ""}"><input type="radio" name="img" value="${val}" data-act="formimg" ${img === val ? "checked" : ""}><span><b>${title}</b><span>${desc}</span></span></label>`;
    const hasImage = !!f.image || (p && p.image_url && !f.changeImage);
    const title = p ? (p.kind === "view" ? "Plan settings" : "Floor settings") : inline ? "Create your first plan" : "New plan";
    const intro = !p ? `<p>A plan is one floor of your home, or any other view (garden, a single room…). ${inline ? "Start with one floor: you can add more floors later." : ""}</p>` : "";
    let imageBlock;
    if (p && p.image_url && !f.changeImage && !f.image) {
      const src = this._imgSrc(p);
      imageBlock = `<div class="chosen">${src ? `<img src="${esc(src)}" alt="">` : ""}<div class="t"><b>Current image</b>${p.image_source === "ha" ? `Linked to ${esc(p.image_url)} (a backup copy is kept)` : "Stored by Device Floorplan"}</div><button class="btn" data-act="changeimg">Replace image</button></div>`;
    } else imageBlock = this._imageChooserHtml("form");
    const typeBlock = hasImage
      ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="secttl">What kind of image is it?</span>
        ${opt("top", "Top-down plan", "A plan seen from above. Measuring and distances are available.")}
        ${opt("angled", "Angled view", "A 3D-style or perspective picture. Place devices where they appear; measuring is turned off.")}</div>`
      : "";
    const extra = p ? `<label style="font-size:13px;display:flex;gap:8px;align-items:center"><input type="checkbox" data-act="guidebox" ${this.s.guide ? "checked" : ""}> Show the step-by-step guide</label>` : "";
    const importLink = !p ? `<div style="font-size:13px;color:var(--df-sec)">Have a backup? <button class="link" data-act="importplan">Import a plan from a file (.json)</button><input type="file" id="importfile" accept="application/json,.json" hidden></div>` : "";
    return `<div class="dialog stickyacts" role="dialog" aria-modal="${inline ? "false" : "true"}" data-form="${mode}" style="${inline ? "max-width:640px" : "max-width:620px"}">${f.fromIntro ? `<button class="link backlink" data-act="backintro">← Back to the intro</button>` : ""}<h2>${title}</h2>${intro}
      <label class="f">Name<input type="text" id="fname" value="${esc(name)}" maxlength="60"></label>
      <label class="f">This plan is<select id="fwhere">${floorOpts}<option value="level" ${where === "level" ? "selected" : ""}>A floor, by level number</option><option value="view" ${where === "view" ? "selected" : ""}>Not a floor (a view: garden, one room, network overview…)</option></select></label>
      ${where === "level" ? `<label class="f">Level (0 = ground floor, 1 = first floor, −1 = basement)<input type="number" id="flevel" value="${esc(level)}" step="1"></label>` : ""}
      <div style="display:flex;flex-direction:column;gap:8px"><span class="secttl">Floorplan image</span>${imageBlock}</div>
      ${typeBlock}${extra}${importLink}<div class="err" id="formerr">${esc(f.err || "")}</div>
      <div class="acts">${inline ? "" : `<button class="btn" data-act="closedlg">Cancel</button>`}<button class="btn primary" data-act="saveform" ${f.busy ? "disabled" : ""}>${f.busy ? "Saving…" : p ? "Save" : "Create plan"}</button></div></div>`;
  }

  /**
   * Choose an image: drop zone / browse, an image already in HA, or a sample plan.
   * where = "form" (inside the plan dialog) or "canvas" (plan without image).
   */
  _imageChooserHtml(where) {
    const f = this.s.form || (this.s.form = {});
    if (f.image) {
      const im = f.image;
      const label = im.kind === "file" ? im.file.name : im.kind === "template" ? `Sample plan: ${(this.templates.find((t) => t.id === im.id) || {}).name || im.id}` : im.url;
      const sub = im.kind === "file" ? `${Math.round(im.file.size / 1024)} KB · will be stored by Device Floorplan` : im.kind === "template" ? "A sample to try things out. You can replace it with your own plan any time." : "Stays linked to this file in Home Assistant; a backup copy is kept.";
      const go = where === "canvas" ? `<button class="btn primary" data-act="applyimg" ${f.busy ? "disabled" : ""}>${f.busy ? "Saving…" : "Use this image"}</button>` : "";
      return `<div class="chosen"><img src="${esc(im.preview)}" alt=""><div class="t"><b>${esc(label)}</b>${esc(sub)}</div><button class="link" data-act="clearimg">Change</button></div>${go}
        ${where === "canvas" ? `<div class="err">${esc(f.err || "")}</div>` : ""}`;
    }
    const tpls = this.templates.length
      ? `<div class="secttl" style="margin-top:4px">Or try one of our sample plans</div><div class="tpls">${this.templates.map((t) => `<button class="tpl" data-act="picktpl" data-id="${esc(t.id)}" title="${esc(t.name)}"><img src="${STATIC}/${esc(t.thumbnail)}" alt="" loading="lazy">${esc(t.name)}</button>`).join("")}</div>`
      : "";
    let ha = `<button class="btn" data-act="halist">${SVG.ha}Use an image from Home Assistant</button>`;
    if (f.haOpen) {
      const list = f.haList;
      ha = !list
        ? `<div class="box">Looking for images in your <code>www</code> folder…</div>`
        : !list.length
          ? `<div class="box">No images found in your <code>config/www</code> folder. <button class="link" data-act="halistclose">Close</button></div>`
          : `<div class="secttl">Images in Home Assistant (<code>/local/…</code>) <button class="link" data-act="halistclose">Close</button></div><div class="tpls" style="max-height:260px;overflow:auto">${list.map((i) => `<button class="tpl" data-act="pickha" data-url="${esc(i.url)}" title="${esc(i.name)}"><img src="${esc(i.url)}" alt="" loading="lazy">${esc(i.name.split("/").pop())}</button>`).join("")}</div>`;
    }
    const drop = `<div class="drop" data-drop tabindex="0" role="button" data-act="browse" aria-label="Choose a floorplan image">${SVG.upload}<b>Drop your floorplan image here</b><span>or click to browse · PNG, JPG or WebP, up to 15 MB</span></div>
      <input type="file" id="pickfile" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="srcrow">${ha}</div>`;
    const err = where === "canvas" ? `<div class="err">${esc(f.err || "")}</div>` : "";
    if (f.samplesFirst && this.templates.length) {
      const first = tpls.replace("Or try one of our sample plans", "Pick a sample plan to try things out");
      return `${first}<div class="secttl" style="margin-top:6px">Or use your own image</div>${drop}${err}`;
    }
    return `${drop}${tpls}${err}`;
  }

  _setupHtml() {
    const f = this.s.setup || (this.s.setup = this._setupDefaults());
    const devs = this.devices.filter((d) => !d.loose || d.physical);
    const physical = devs.filter((d) => !d.virtual);
    const conns = CONN_ORDER.filter((c) => physical.some((d) => d.conns.includes(c)));
    const groups = Object.keys(GROUPS).filter((g) => physical.some((d) => d.group === g));
    const keep = devs.filter((d) => this._setupKeep(d, f));
    // Chips carry no counts: the live summary line below is the one number that matters.
    const box = (key, val, label) => {
      const on = f[key].includes(val);
      return `<label class="chip pick ${on ? "on" : ""}"><input type="checkbox" data-act="setupchk" data-key="${key}" data-val="${esc(val)}" ${on ? "checked" : ""} hidden><span class="ck">${on ? SVG.check : ""}</span>${esc(label)}</label>`;
    };
    const auto = (key, label) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-act="setupauto" data-key="${key}" ${f[key] ? "checked" : ""}>${esc(label)}</label>`;
    return `<div class="welcome"><div class="dialog stickyacts" style="max-width:720px"><h2>What should go on your plan?</h2>
      <p>We've <b>preselected the usual kinds</b> of devices for you: the ones marked <span class="chip pick on" style="display:inline-flex;padding:1px 8px 1px 6px;font-size:12px;vertical-align:1px"><span class="ck">${SVG.check}</span>like this</span> go on your list. Tap a kind to add or remove it.
      Everything else starts as <b>skipped</b>: nothing is deleted or changed in HA, and you can add any of them later: they wait in the device list on the right, under Status → Skipped.</p>
      <div class="setgrid"><div><h3 class="big">By type</h3><div class="chips">${groups.map((g) => box("groups", g, GROUPS[g][0])).join("")}</div></div>
      <div><h3 class="big">By connection</h3><div class="chips">${conns.map((c) => box("conns", c, CONN[c].label)).join("")}</div></div>
      <div><h3 class="big u">Automatically skipped</h3><div style="display:flex;flex-direction:column;gap:6px">
        ${auto("skipVirtual", "Virtual and software devices (browser sessions, cloud services, helpers…)")}
        ${auto("skipNoArea", "Devices without an area")}
        ${auto("skipUnavailable", "Devices that are unavailable right now")}
        ${auto("skipHidden", "Devices whose entities are all hidden in HA")}</div></div></div>
      <div class="total" aria-live="polite">Your home has <b>${physical.length} physical devices</b>. <b>${keep.length}</b> will be on your list, the rest starts as skipped. You can change this any time.</div>
      <div class="acts"><button class="btn primary" data-act="setupdone">Continue</button></div></div></div>`;
  }

  _setupDefaults() {
    const conns = CONN_ORDER.slice();
    const groups = Object.keys(GROUPS).filter((g) => !["media", "other", "helpers"].includes(g));
    return { conns, groups, skipVirtual: true, skipNoArea: true, skipUnavailable: true, skipHidden: true };
  }

  _setupKeep(d, f) {
    if (d.loose && !d.physical) return false;
    if (d.virtual && f.skipVirtual) return false;
    if (!d.area_id && f.skipNoArea) return false;
    if (d.unavailable && f.skipUnavailable) return false;
    if (d.all_hidden && f.skipHidden) return false;
    if (!d.virtual && !d.loose && !d.conns.some((c) => f.conns.includes(c))) return false;
    if (!f.groups.includes(d.group)) return false;
    return true;
  }

  // --------------------------------------------------------------- events
  _bindRoot() {
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("dblclick", (e) => {
      const c = e.target.closest && e.target.closest("[data-shc]");
      const pts = c && this.s.shapeEdit && (this.work.shapes || {})[this.s.shapeEdit];
      if (!pts || pts.length <= 3) return;
      e.preventDefault();
      this._change(() => pts.splice(Number(c.dataset.shc), 1));
    });
    root.addEventListener("input", (e) => this._onInput(e));
    root.addEventListener("pointerdown", (e) => this._onDown(e));
    root.addEventListener("pointermove", (e) => this._onMove(e));
    root.addEventListener("pointerup", (e) => this._onUp(e));
    root.addEventListener("pointercancel", (e) => this._onUp(e, true));
    root.addEventListener("dragstart", (e) => this._onDragStart(e));
    root.addEventListener("dragover", (e) => {
      if (!e.target.closest) return;
      if (e.target.closest("[data-vp]")) {
        e.preventDefault();
        // Dragging a device from the list and holding it over a marker of the same kind bonds them (#40).
        if (this._listDrag && this._listDrag.dev) {
          if (!this._listHover || this._listHover.id !== this._listDrag.dev) this._listHover = { id: this._listDrag.dev };
          this._bondHover(this._listHover, e.clientX, e.clientY);
        }
      }
      const drop = e.target.closest("[data-drop]");
      if (drop) {
        e.preventDefault();
        drop.classList.add("over");
      }
    });
    root.addEventListener("dragleave", (e) => {
      const drop = e.target.closest && e.target.closest("[data-drop]");
      if (drop) drop.classList.remove("over");
    });
    root.addEventListener("drop", (e) => {
      const drop = e.target.closest && e.target.closest("[data-drop]");
      if (drop) {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) this._formPickFile(file);
        return;
      }
      this._onDrop(e);
    });
    root.addEventListener("keydown", (e) => {
      if (e.target.id === "lenin" && e.key === "Enter") this._applyScale();
      // Esc also works while typing in the length fields: cancel the line / close the popup.
      if (e.key === "Escape" && (e.target.id === "lenin" || e.target.id === "reflen")) {
        e.stopPropagation();
        if (e.target.id === "lenin") Object.assign(this.s, { m1: null, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
        else this.s.refSel = null;
        this._render();
      }
      if (e.target.id === "reflen" && e.key === "Enter") this._saveRefLen();
      if (e.target.id === "rname" && e.key === "Enter") this._renamePlan();
      if (e.target.matches && e.target.matches("[data-drop]") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.target.click();
      }
    });
  }

  _onInput(e) {
    const t = e.target;
    if (t.id === "q") {
      this.s.q = t.value;
      this._fresh = null;
      this._render();
    } else if (t.id === "lenin") {
      this.s.lenInput = t.value;
    } else if (t.id === "reflen") {
      this.s.refLen = t.value;
    } else if (t.id === "entfilter") {
      this.s.entFilter = t.value;
      this._render();
    } else if (t.id === "otherent") {
      const v = t.value.trim();
      if (this._hass && this._hass.states[v] && this.s.sel) this._setMain(this.s.sel, v, true);
    } else if (t.id === "bondname" || t.id === "bondicon") {
      const b = this._bondOf(this.s.sel);
      if (!b) return;
      const meta = { ...this._bondMeta(b[0]) };
      const k = t.id === "bondname" ? "name" : "icon";
      const v = t.value.trim();
      if (v && (k === "name" || v.includes(":"))) meta[k] = v;
      else delete meta[k];
      this.work.bond_meta = { ...(this.work.bond_meta || {}), [b[0]]: meta };
      this._scheduleSave();
    } else if (t.id === "phname") {
      const ph = (this.work.phantoms || {})[t.dataset.ph];
      if (ph) {
        ph.name = t.value.trim() || "Phantom";
        this._scheduleSave();
      }
    } else if (t.id === "rname") {
      this.s.dialog.name = t.value;
    } else if (t.id === "fname" || t.id === "flevel") {
      this.s.form = { ...(this.s.form || {}), [t.id === "fname" ? "name" : "level"]: t.value };
    }
  }

  _onChange(e) {
    const t = e.target;
    const act = t.dataset.act;
    if (t.id === "fwhere") {
      this.s.form = { ...(this.s.form || {}), where: t.value, name: this.shadowRoot.getElementById("fname").value };
      const fl = t.value.startsWith("floor:") && this.floors.find((x) => `floor:${x.floor_id}` === t.value);
      if (fl && (!this.s.form.name || this.floors.some((x) => x.name === this.s.form.name))) this.s.form.name = fl.name;
      this._render();
      return;
    }
    if (t.id === "bondname" || t.id === "bondicon" || t.id === "phname") return this._render();
    if (act === "phuse") {
      const ph = (this.work.phantoms || {})[t.dataset.ph];
      const m = t.dataset.m;
      const d = this.byId.get(m);
      if (!ph || !d) return;
      const all = (d.entities || []).filter((e) => ["sensor", "binary_sensor", "climate"].includes(e.domain)).map((e) => e.entity_id);
      const box = t.closest(".uses");
      const checked = [...box.querySelectorAll("input[data-act=phuse]")].filter((x) => x.checked).map((x) => x.dataset.e);
      this._change(() => {
        const u = { ...(ph.uses || {}) };
        if (!checked.length || checked.length === all.length) delete u[m];
        else u[m] = checked;
        if (Object.keys(u).length) ph.uses = u;
        else delete ph.uses;
      });
      return;
    }
    if (act === "splitas") {
      const key = this.s.sel;
      if (this.work.positions[key]) this._change(() => {
        if (t.value) this.work.positions[key].as = t.value;
        else delete this.work.positions[key].as;
      });
      return;
    }
    if (t.id === "airr" || t.id === "airs") {
      const pos = this.work.positions[this.s.sel];
      if (!pos) return;
      const cur = this._air(this.s.sel);
      const v = parseFloat(String(t.value).replace(",", "."));
      if (!(v > 0)) return this._render();
      const W = this._realW();
      this._change(() => {
        pos.air = { a: cur.a, r: cur.r, s: cur.s, ...(t.id === "airr" ? { r: W ? (v / W) * 100 : v } : { s: v }) };
      });
      return;
    }
    if (t.id === "lightk" || t.id === "lighthex") {
      const lead = this._bondLeader(this.s.sel);
      const pos = this.work.positions[lead];
      if (!pos) return;
      const cur = this._shape(lead);
      this._change(() => {
        pos.light = { ...(pos.light || { type: cur.type }), type: cur.type, color: t.id === "lightk" ? `k:${t.value}` : t.value };
      });
      return;
    }
    if (t.id === "lightr" || t.id === "lightw" || t.id === "lighth") {
      const lead = this._bondLeader(this.s.sel);
      const pos = this.work.positions[lead];
      const v = parseFloat(String(t.value).replace(",", "."));
      if (!pos || !(v > 0)) return this._render();
      const W = this._realW();
      const pct = W ? (v / W) * 100 : v;
      const cur = this._shape(lead);
      this._change(() => {
        const l = { ...(pos.light || { type: cur.type }), type: cur.type };
        if (t.id === "lightr") l.r = pct;
        if (t.id === "lightw") { l.w = pct; if (l.h == null) l.h = cur.h; }
        if (t.id === "lighth") { l.h = pct * this._ratio(); if (l.w == null) l.w = cur.w; }
        if (cur.type === "strip" && l.x2 == null) Object.assign(l, { x2: cur.x2, y2: cur.y2 });
        pos.light = l;
      });
      return;
    }
    if (act === "bondtap" || act === "bondshow") {
      const b = this._bondOf(this.s.sel);
      if (!b) return;
      const meta = { ...this._bondMeta(b[0]) };
      const k = act === "bondtap" ? "tap" : "show";
      if (t.value) meta[k] = t.value;
      else delete meta[k];
      this._change(() => (this.work.bond_meta = { ...(this.work.bond_meta || {}), [b[0]]: meta }));
      return;
    }
    if (act === "phvalue" || act === "phone") {
      const ph = (this.work.phantoms || {})[String(this.s.sel).slice(3)];
      if (!ph) return;
      this._change(() => {
        if (act === "phvalue") {
          ph.value = t.value;
          if (t.value === "one" && !ph.one) ph.one = (ph.members || [])[0];
        } else ph.one = t.value;
      });
      return;
    }
    if (t.id === "file") return this._uploadFile(this._plan(), t.files && t.files[0]);
    if (t.id === "pickfile") return this._formPickFile(t.files && t.files[0]);
    if (t.id === "importfile") return this._importPlan(t.files && t.files[0]);
    if (act === "dashkey") return this._loadDashCfg(t.value);
    if (act === "dashwhere") {
      Object.assign(this.s.dialog, { where: t.value, view: this.s.dialog.view ?? this._firstFreeView() });
      return this._render();
    }
    if (act === "dashview") {
      this.s.dialog.view = t.value;
      return;
    }
    if (act === "replacedev" && t.value) {
      const old = this.s.sel;
      const nid = t.value;
      this._change(() => {
        this.work.positions[nid] = { ...this.work.positions[old] };
        delete this.work.positions[nid].approx;
        delete this.work.positions[old];
      });
      this.s.sel = nid;
      this._markSeen([nid]);
      this._render();
      return;
    }
    if (act === "formimg") {
      this.s.form = { ...(this.s.form || {}), img: t.value, name: this.shadowRoot.getElementById("fname").value };
      this._render();
    } else if (act === "colorby") {
      this.s.colorBy = t.value;
      lsSet("colorBy", t.value);
      this._render();
    } else if (act === "names") {
      this.s.names = t.value;
      lsSet("names", t.value);
      this._render();
    } else if (act === "groupby") {
      this.s.groupBy = t.value;
      lsSet("groupBy", t.value);
      this._render();
    } else if (act === "allfloors") {
      this.s.allFloors = t.checked;
      this._render();
    } else if (act === "queue") {
      this.s.queue = t.checked;
    } else if (act === "guidebox") {
      this.s.guide = t.checked;
      lsSet("guide", t.checked);
      this._render();
    } else if (act === "mainent") {
      if (t.value === "__other") {
        this.s.otherEnt = this.s.sel;
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("otherent");
          if (i) i.focus({ preventScroll: true });
        }, 50);
        return;
      }
      this._setMain(this.s.sel, t.value);
    } else if (act === "onlymain") {
      const id = this.s.sel;
      this.deviceOpts[id] = { ...(this.deviceOpts[id] || {}), only_main: t.checked };
      this._ws("devices/options", { device_id: id, only_main: t.checked }).catch((err) => this._saveError(err));
    } else if (act === "setupchk") {
      const f = this.s.setup;
      const list = f[t.dataset.key];
      const i = list.indexOf(t.dataset.val);
      if (i >= 0) list.splice(i, 1);
      else list.push(t.dataset.val);
      this._render();
    } else if (act === "setupauto") {
      this.s.setup[t.dataset.key] = t.checked;
      this._render();
    }
  }

  async _onClick(e) {
    const el = e.target.closest("[data-act]");
    // Any click outside an open menu / layer list closes it.
    if (this.s.menu && !e.target.closest(".menu") && !(el && ["appmenu", "tabmenu"].includes(el.dataset.act))) {
      this.s.menu = null;
      if (!el) return this._render();
    }
    if (this.s.layersOpen && !e.target.closest(".layerctl")) {
      this.s.layersOpen = false;
      if (!el) return this._render();
    }
    if (!el) return;
    const act = el.dataset.act;
    if (this.s.menu && e.target.closest(".menu")) this.s.menu = null;
    if (["colorby", "names", "groupby", "allfloors", "queue", "guidebox", "mainent", "onlymain", "setupchk", "setupauto", "formimg", "dashkey", "dashwhere", "dashview", "replacedev", "bondtap", "bondshow", "phvalue", "phone"].includes(act)) return;
    if (act === "modalbg") {
      if (e.target === el && !(this.s.dialog && this.s.dialog.type === "bondask")) this._closeDialog();
      return;
    }
    const s = this.s;
    const id = el.dataset.id;
    switch (act) {
      case "menu":
        this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
        break;
      case "reload":
        this.s.error = null;
        this.s.loading = true;
        this._render();
        this._init();
        break;
      case "plan":
        this._openPlan(el.dataset.id);
        this._render();
        break;
      case "newplan":
        s.form = null;
        s.dialog = { type: "create" };
        this._render();
        break;
      case "settings":
        s.form = null;
        s.dialog = { type: "settings" };
        this._render();
        break;
      case "appmenu":
      case "tabmenu": {
        if (act === "tabmenu" && id !== s.planId) this._openPlan(id);
        const r = el.getBoundingClientRect();
        const x = Math.min(r.left, window.innerWidth - 240);
        s.menu = s.menu && s.menu.type === (act === "appmenu" ? "app" : "tab") && (act === "appmenu" || s.menu.id === id) ? null : { type: act === "appmenu" ? "app" : "tab", id, x: act === "appmenu" ? Math.min(r.right - 230, x) : x, y: r.bottom + 4 };
        this._render();
        break;
      }
      case "showintro":
        try {
          window.localStorage.removeItem("device_floorplan_intro_seen_v1");
        } catch (_e) {
          /* */
        }
        this._showIntro();
        this._render();
        break;
      case "rename":
        s.dialog = { type: "rename" };
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("rname");
          if (i) {
            i.focus({ preventScroll: true });
            i.select();
          }
        }, 50);
        break;
      case "dorename":
        await this._renamePlan();
        break;
      case "replaceimg":
        s.form = { changeImage: true };
        s.dialog = { type: "settings" };
        s.imgFailed = null;
        this._render();
        break;
      case "changeimg":
        s.form = { ...(s.form || {}), changeImage: true };
        this._render();
        break;
      case "moveplan":
        await this._movePlan(Number(el.dataset.dir));
        break;
      case "export":
        await this._flushSave();
        s.dialog = { type: "export" };
        this._render();
        break;
      case "doexport":
        await this._export(el.dataset.fmt);
        break;
      case "importplan": {
        const inp = this.shadowRoot.getElementById("importfile");
        if (inp) {
          inp.value = "";
          inp.click();
        }
        break;
      }
      case "ready":
        await this._openReady();
        break;
      case "preview": {
        const prev = s.dialog;
        s.dialog = { type: "preview", from: prev && prev.type === "ready" ? prev : null, dash: prev && prev.dash };
        this._render();
        break;
      }
      case "toadddash":
        await this._openAddDash(s.dialog && ["ready", "preview"].includes(s.dialog.type) ? s.dialog : null);
        break;
      case "dlgback":
        s.dialog = s.dialog && s.dialog.from ? s.dialog.from : null;
        this._render();
        break;
      case "doadddash":
        await this._addToDashboard();
        break;
      case "opendash":
        s.dialog = null;
        this._navigate(el.dataset.path);
        break;
      case "opendevice": {
        const p = this._plan();
        s.dialog = null;
        if (p && p.device_id) this._navigate(`/config/devices/device/${p.device_id}`);
        break;
      }
      case "copyyaml":
        try {
          await navigator.clipboard.writeText(`type: custom:device-floorplan-card\nplan: ${s.planId}`);
          el.textContent = "Copied ✓";
        } catch (_e) {
          el.textContent = "Select the text above and copy it";
        }
        break;
      case "layers":
        s.layersOpen = !s.layersOpen;
        this._render();
        break;
      case "layer":
        if (el.dataset.key === "lightshapes") s.layers = { ...s.layers, lightshapes: s.layers.lightshapes !== true };
        else s.layers = { ...s.layers, [el.dataset.key]: s.layers[el.dataset.key] === false };
        lsSet("layers", s.layers);
        s.layersOpen = true;
        this._render();
        break;
      case "refedit":
        s.refSel = Number(el.dataset.i);
        s.refLen = this.work.refs[s.refSel].length.toFixed(2);
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("reflen");
          if (i) {
            i.focus({ preventScroll: true });
            i.select();
          }
        }, 50);
        break;
      case "refsave":
        this._saveRefLen();
        break;
      case "refdel": {
        const i = el.dataset.i !== undefined ? Number(el.dataset.i) : s.refSel;
        const r = this.work.refs[i];
        if (!r) break;
        this._change(() => this.work.refs.splice(i, 1));
        s.refSel = null;
        this._render();
        this._toast(`${r.dir === "h" ? "Horizontal" : "Vertical"} measurement deleted`);
        break;
      }
      case "browse": {
        const inp = this.shadowRoot.getElementById("pickfile");
        if (inp) {
          inp.value = "";
          inp.click();
        }
        break;
      }
      case "halist":
        s.form = { ...(s.form || {}), haOpen: true, haList: null };
        this._render();
        try {
          const res = await this._ws("images/list");
          s.form.haList = res.images;
        } catch (_e) {
          s.form.haList = [];
        }
        this._render();
        break;
      case "halistclose":
        s.form.haOpen = false;
        this._render();
        break;
      case "pickha":
        s.form = { ...(s.form || {}), haOpen: false, err: null, image: { kind: "ha", url: el.dataset.url, preview: el.dataset.url } };
        this._render();
        break;
      case "picktpl": {
        const t = this.templates.find((x) => x.id === el.dataset.id);
        s.form = { ...(s.form || {}), err: null, img: "top", image: { kind: "template", id: t.id, preview: `${STATIC}/${t.thumbnail}` } };
        this._render();
        break;
      }
      case "backintro":
        s.dialog = null;
        s.form = null;
        this._render();
        this._showIntro();
        break;
      case "clearimg":
        s.form = { ...(s.form || {}), image: null, err: null };
        this._render();
        break;
      case "applyimg":
        await this._applyCanvasImage();
        break;
      case "hideroom": {
        const dlg = s.dialog;
        const keep = el.dataset.keep === "1";
        this._change(() => {
          if (!this.work.hidden_rooms.includes(dlg.area)) this.work.hidden_rooms.push(dlg.area);
          delete this.work.anchors[dlg.area];
          if (!keep) dlg.ids.forEach((x) => delete this.work.positions[x]);
        });
        s.dialog = null;
        this._render();
        break;
      }
      case "closedlg":
        this._closeDialog();
        break;
      case "saveform":
        await this._saveForm(el.closest("[data-form]").dataset.form);
        break;
      case "askdelete":
        s.dialog = { type: "delete" };
        this._render();
        break;
      case "dodelete":
        await this._deletePlan();
        break;
      case "resetsetup":
        await this._flushSave();
        await this._ws("setup/reset");
        this.setupDone = false;
        s.setup = null;
        s.dialog = null;
        this._render();
        break;
      case "setupdone":
        await this._finishSetup();
        break;
      case "undo":
        this._undoAct();
        break;
      case "redo":
        this._redoAct();
        break;
      case "tool":
        this._setTool(el.dataset.tool);
        break;
      case "guide":
        s.guide = !s.guide;
        lsSet("guide", s.guide);
        this._render();
        break;
      case "skip1":
        lsSet(`skip1_${s.planId}`, true);
        this._setTool("rooms");
        break;
      case "placingdetails":
        s.sel = s.placing;
        this._render();
        break;
      case "stopplace":
        Object.assign(s, { placing: null, placingRoom: null, placingBox: null, hover: null });
        this._render();
        break;
      case "pop":
        s.pop = s.pop === el.dataset.key ? null : el.dataset.key;
        this._render();
        break;
      case "closepop":
        s.pop = null;
        this._render();
        break;
      case "chip": {
        this._fresh = null;
        const key = el.dataset.key;
        s[key] = s[key].filter((x) => x !== "__none__");
        const list = s[key];
        const i = list.indexOf(el.dataset.val);
        if (i >= 0) list.splice(i, 1);
        else list.push(el.dataset.val);
        this._render();
        break;
      }
      case "popall":
        this._fresh = null;
        s[s.pop] = [];
        this._render();
        break;
      case "popnone":
        this._fresh = null;
        s[s.pop] = ["__none__"];
        this._render();
        break;
      case "fclear":
        this._fresh = null;
        s[el.dataset.key] = [];
        if (s.pop === el.dataset.key) s.pop = null;
        this._render();
        break;
      case "tools":
        s.toolsOpen = !s.toolsOpen;
        if (!s.toolsOpen) s.pop = null;
        lsSet("tools", s.toolsOpen);
        this._render();
        break;
      case "partown":
      case "partauto":
        await this._ws("devices/options", { device_id: id, part: act === "partown" ? "own" : null }).catch((err) => this._saveError(err));
        this.deviceOpts[id] = { ...(this.deviceOpts[id] || {}), part: act === "partown" ? "own" : undefined };
        await this._reloadDevices();
        if (act === "partown" && s.sel && this.work && this.work.positions[s.sel] && !this.work.positions[id]) {
          // Unbonded: it stays on the same spot as its own device (#62).
          const pp = this.work.positions[s.sel];
          this._change(() => (this.work.positions[id] = { x: pp.x, y: pp.y, ...(pp.approx ? { approx: true } : {}) }));
        }
        this._toast(act === "partown" ? "Unbonded: its own device on the same spot (it stays unbonded)" : "Bonded automatically again: one device with its parent", false);
        break;
      case "shapeedit": {
        const aid = el.dataset.id;
        if (s.shapeEdit === aid) { s.shapeEdit = null; this._render(); break; }
        s.shapeEdit = aid;
        if (!(this.work.shapes || {})[aid]) this._change(() => { this.work.shapes = { ...(this.work.shapes || {}), [aid]: this._shapeRect(aid) }; });
        else this._render();
        break;
      }
      case "shapereset":
        if (s.shapeEdit) this._change(() => (this.work.shapes[s.shapeEdit] = this._shapeRect(s.shapeEdit)));
        break;
      case "shapedel":
        if (s.shapeEdit) {
          const aid = s.shapeEdit;
          s.shapeEdit = null;
          this._change(() => delete this.work.shapes[aid]);
        }
        break;
      case "shapedone":
        s.shapeEdit = null;
        this._render();
        break;
      case "phusesopen":
        s.phUses = s.phUses === el.dataset.id ? null : el.dataset.id;
        this._render();
        break;
      case "openas": {
        const pos = this.work.positions[s.sel];
        if (pos) this._change(() => (pos.as = el.dataset.as));
        break;
      }
      case "opendraw": {
        const pos = this.work.positions[s.sel];
        if (!pos) break;
        const W = this._realW();
        const half = W ? (0.5 / W) * 100 : 3; // about 1 m long, horizontal, through the marker
        const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
        this._change(() => (pos.opening = { x1: c(pos.x - half), y1: c(pos.y), x2: c(pos.x + half), y2: c(pos.y) }));
        break;
      }
      case "opendel": {
        const pos = this.work.positions[s.sel];
        if (pos) this._change(() => delete pos.opening);
        break;
      }
      case "airtype": {
        const pos = this.work.positions[s.sel];
        if (!pos) break;
        const cur = this._air(s.sel);
        this._change(() => (pos.air = el.dataset.type === "none" ? { type: "none" } : { a: cur.a, r: cur.r, s: cur.s }));
        break;
      }
      case "lightauto": {
        const lead = this._bondLeader(s.sel);
        const pos = this.work.positions[lead];
        if (pos && pos.light) this._change(() => delete pos.light.color);
        break;
      }
      case "splitopen":
        s.splitOpen = s.sel;
        this._render();
        break;
      case "splitplace":
        s.placingBox = `${s.sel}|${el.dataset.id}`;
        s.placing = null;
        this._render();
        break;
      case "splitdel": {
        const key = el.dataset.id;
        const of = this.work.positions[key] && this.work.positions[key].of;
        this._change(() => delete this.work.positions[key]);
        const it = this.byId.get(key);
        if (it && it.split) { this.byId.delete(key); this.devices = this.devices.filter((x) => x !== it); }
        if (s.sel === key) s.sel = of || null;
        this._toast("Back to the device: it shows at the device's spot");
        break;
      }
      case "boxadd":
        s.placingBox = s.sel;
        s.placing = null;
        this._render();
        break;
      case "boxcancel":
        s.placingBox = null;
        this._render();
        break;
      case "boxdel": {
        const sel = s.sel;
        this._change(() => delete this.work.positions[sel].box);
        this._toast("Box / radio spot removed");
        break;
      }
      case "skipint": {
        const integ = el.dataset.int;
        const ids = this.devices.filter((x) => !x.loose && x.integration === integ && !this.skipped.has(x.id) && !(this.work && this.work.positions[x.id])).map((x) => x.id);
        if (!ids.length) break;
        this._pushUndo();
        await this._setSkipped(ids, true);
        s.sel = null;
        this._render();
        this._toast(`${ids.length} devices from ${this._intName(integ)} skipped. Devices already on the plan were kept.`);
        break;
      }
      case "clearf":
        this._fresh = null;
        Object.assign(s, { conn: [], type: [], status: [], pop: null });
        this._render();
        break;
      case "clearall":
        this._fresh = null;
        Object.assign(s, { conn: [], type: [], status: [], q: "", pop: null });
        this._render();
        break;
      case "shownew":
        Object.assign(s, { status: ["new"], pop: null });
        this._render();
        break;
      case "group": {
        const key = el.dataset.key;
        s.collapsed[key] = el.dataset.open === "1";
        this._render();
        break;
      }
      case "pick":
        this._pickDevice(id);
        break;
      case "pickroom":
        Object.assign(s, { placingRoom: id, placing: null });
        this._render();
        break;
      case "ignore": {
        if (s.placingRoom === id) s.placingRoom = null;
        const placed = Object.keys(this.work.positions).filter((x) => (this.byId.get(x) || {}).area_id === id);
        if (placed.length) {
          s.dialog = { type: "hideroom", area: id, ids: placed };
          this._render();
          break;
        }
        this._change(() => {
          if (!this.work.hidden_rooms.includes(id)) this.work.hidden_rooms.push(id);
          delete this.work.anchors[id];
        });
        break;
      }
      case "unignore":
        this._change(() => {
          this.work.hidden_rooms = this.work.hidden_rooms.filter((x) => x !== id);
        });
        break;
      case "unpin":
        this._change(() => delete this.work.anchors[id]);
        break;
      case "info":
        this._moreInfo(id);
        break;
      case "locate":
        this._locate(id);
        break;
      case "desel":
        s.sel = null;
        s.placing = null;
        this._render();
        break;
      case "unbond": {
        const sel = s.sel;
        this._change(() => this._unbond(sel));
        this._toast("Unbonded: it has its own marker again");
        break;
      }
      case "bout": {
        const b = this._bondOf(id);
        const d = this.byId.get(id);
        this._change(() => this._unbond(id));
        if (b && !this._bondOf(s.sel)) s.memberView = null;
        if (s.sel === id && this._bondOf(b ? b[1].find((m) => m !== id) : null)) s.sel = this._bondLeader(b[1].find((m) => m !== id));
        this._render();
        this._toast(`${d ? d.name : "Device"} left the bond · same spot, its own device`);
        break;
      }
      case "unbondall": {
        const b = this._bondOf(s.sel);
        if (!b) break;
        this._change(() => {
          delete this.work.bonds[b[0]];
          if (this.work.bond_meta) delete this.work.bond_meta[b[0]];
        });
        s.memberView = null;
        this._render();
        this._toast(`Unbonded: ${b[1].length} devices, each on its own, same spot`);
        break;
      }
      case "bondask":
        s.dialog = { type: "bondask", a: s.sel, b: id };
        this._render();
        break;
      case "bondyes": {
        const dl = s.dialog;
        s.dialog = null;
        if (!dl) break;
        const target = this._bondLeader(dl.b);
        const ids = (this._bondOf(dl.a) || [null, [dl.a]])[1].filter((m) => m !== target && this.work.positions[m]);
        this._change(() => {
          for (const m of ids) this._bond(m, target);
        });
        s.sel = this._bondLeader(target);
        s.memberView = null;
        const n = ((this._bondOf(target) || [null, []])[1]).length;
        this._render();
        this._toast(`Bonded: ${n} together · one device on the card`);
        break;
      }
      case "bondno":
        s.dialog = null;
        this._render();
        this._toast("Kept separate: same spot, not bonded", false);
        break;
      case "bondback":
        s.memberView = null;
        s.sel = this._bondLeader(s.sel);
        this._render();
        break;
      case "memopen":
        s.sel = id;
        s.memberView = id;
        this._render();
        break;
      case "selid":
        if (this.byId.get(id)) {
          s.sel = id;
          s.memberView = null;
          this._render();
        }
        break;
      case "more":
        s.more = !s.more;
        lsSet("more", s.more);
        this._render();
        break;
      case "itip":
        s.itip = s.itip === el.dataset.key ? null : el.dataset.key;
        this._render();
        break;
      case "stackpick":
        s.stack = null;
        s.sel = id;
        s.memberView = null;
        this._render();
        break;
      case "stackfan":
        s.stack = null;
        s.fan = id;
        this._render();
        break;
      case "nightprev":
        s.nightPrev = !s.nightPrev;
        this._render();
        break;
      case "lighttype": {
        const lead = this._bondLeader(s.sel);
        const pos = this.work.positions[lead];
        if (!pos) break;
        const t = el.dataset.type;
        const keep = pos.light && pos.light.type === t ? pos.light : this._defaultShape(t, this._isLamp(s.sel));
        this._change(() => {
          pos.light = { ...keep, type: t };
          if (t === "strip" && pos.light.x2 == null) Object.assign(pos.light, { x2: clamp(pos.x + 8, 0, 100), y2: pos.y });
          if (t === "panel" && pos.light.h == null) pos.light.h = pos.light.w * this._ratio();
        });
        break;
      }
      case "phnew": {
        const pid = `p${Date.now().toString(36)}`;
        const n = Object.keys(this.work.phantoms || {}).length + 1;
        const x = clamp((50 - s.tx) / s.z, 4, 96);
        const y = clamp((50 - s.ty) / s.z, 4, 96);
        this._change(() => (this.work.phantoms = { ...(this.work.phantoms || {}), [pid]: { name: n > 1 ? `Phantom ${n}` : "Phantom", x, y, members: [] } }));
        s.sel = `ph:${pid}`;
        this._render();
        this._toast("New phantom: drag devices that are already on the plan onto it", false);
        break;
      }
      case "phout": {
        const ph = (this.work.phantoms || {})[String(s.sel).slice(3)];
        if (ph) this._change(() => (ph.members = (ph.members || []).filter((m) => m !== id)));
        break;
      }
      case "phdel": {
        const pid = String(s.sel).slice(3);
        const ph = (this.work.phantoms || {})[pid];
        this._change(() => delete this.work.phantoms[pid]);
        s.sel = null;
        this._render();
        this._toast(`Phantom ${ph ? ph.name : ""} deleted · its devices are not touched`);
        break;
      }
      case "confirm":
        this._change(() => {
          delete this.work.positions[s.sel].approx;
          this._syncBond(s.sel);
        });
        break;
      case "placeit":
        s.placing = s.sel;
        this._render();
        break;
      case "movehere":
        await this._moveHere(s.sel);
        break;
      case "remove": {
        const d = this.byId.get(s.sel);
        const sel = s.sel;
        const wb = this._bondOf(sel);
        if (wb && s.memberView !== sel) {
          this._change(() => {
            for (const m of wb[1]) delete this.work.positions[m];
            delete this.work.bonds[wb[0]];
          });
          s.sel = null;
          this._render();
          this._toast(`${this._bondName(wb)} taken off the plan`);
          break;
        }
        this._change(() => {
          for (const k of this._splitSpots(sel)) delete this.work.positions[k];
          this._unbond(sel);
          delete this.work.positions[sel];
        });
        s.sel = d ? sel : null;
        this._render();
        this._toast(`${d ? d.name : "Removed device"} taken off the plan`);
        break;
      }
      case "skipone": {
        const d = this.byId.get(s.sel);
        const snap = this._snap();
        this._pushUndo(snap);
        await this._setSkipped([d.id], true);
        s.sel = null;
        this._render();
        this._toast(`${d.name} skipped`);
        break;
      }
      case "unskip":
        await this._unskip(s.sel);
        break;
      case "skipall":
        await this._skipShown();
        break;
      case "autoplace":
        this._autoPlace();
        break;
      case "devpage":
        this._navigate(`/config/devices/device/${s.sel}`);
        break;
      case "front":
      case "back":
        this._zOrder(s.sel, act === "front");
        break;
      case "zoomin":
      case "zoomout": {
        // Zoom around what you're working on (measuring point, selected marker), else the centre.
        const f = this._focusPoint();
        const nz = Math.round(s.z * 4) / 4 + (act === "zoomin" ? 0.25 : -0.25);
        this._zoomTo(nz, f ? s.tx + f.x * s.z : 50, f ? s.ty + f.y * s.z : 50);
        break;
      }
      case "zoomfit":
        this._zoomTo(1);
        break;
      case "setscale":
        this._applyScale();
        break;
      case "justmeasure":
        s.skipAuto = true;
        s.ask = false;
        this._render();
        break;
      case "cancelline":
        Object.assign(s, { m1: null, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
        this._render();
        break;
      case "usescale": {
        const m = this._distM(s.m1, s.m2);
        s.ask = true;
        s.lenInput = m ? m.toFixed(2) : "";
        this._render();
        break;
      }
      case "toastundo":
        this._undoAct();
        break;
      case "toastclose":
        s.toast = null;
        this._renderToast();
        break;
      default:
        break;
    }
  }

  /** "synology_dsm" → "Synology DSM" (HA's own title when it is loaded). */
  _intName(domain) {
    const t = this._hass && this._hass.localize ? this._hass.localize(`component.${domain}.title`) : "";
    if (t) return t;
    return String(domain).split("_").map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
  }

  // ---------------------------------------------------------------- bonds (#40)
  /** [bondId, members] of a device, or null. */
  _bondOf(id) {
    for (const [k, v] of Object.entries((this.work && this.work.bonds) || {})) if (v.includes(id)) return [k, v];
    return null;
  }

  /** The member that carries the bond's marker (first one on the plan). */
  _bondLeader(id) {
    const b = this._bondOf(id);
    if (!b) return id;
    return b[1].find((m) => this.work.positions[m]) || id;
  }

  /** Lights with lights, switches with switches, covers with covers. */
  _bondKind(d) {
    if (!d) return null;
    const ent = this.mainEntity[d.id] || d.main_entity;
    const dom = ent ? ent.split(".")[0] : null;
    return ["light", "switch", "cover"].includes(dom) ? dom : null;
  }

  _canBond(a, b) {
    if (!a || !b || a === b) return false;
    if (!this.byId.get(a) || !this.byId.get(b)) return false;
    return !(this._bondOf(a) && this._bondOf(a) === this._bondOf(b));
  }

  /** Put `id` into the bond of `target` (creating it) at the target's spot. */
  _bond(id, target) {
    const bonds = this.work.bonds || (this.work.bonds = {});
    const old = this._bondOf(id);
    if (old) {
      bonds[old[0]] = old[1].filter((m) => m !== id);
      if (bonds[old[0]].length < 2) delete bonds[old[0]];
    }
    const tb = this._bondOf(target);
    if (tb) bonds[tb[0]].push(id);
    else bonds[`b${Date.now().toString(36)}`] = [target, id];
    const tp = this.work.positions[target];
    this._moveTo(id, tp.x, tp.y, !!tp.approx);
  }

  _unbond(id) {
    const b = this._bondOf(id);
    if (!b) return;
    const bonds = this.work.bonds;
    bonds[b[0]] = b[1].filter((m) => m !== id);
    if (bonds[b[0]].length < 2) {
      delete bonds[b[0]];
      if (this.work.bond_meta) delete this.work.bond_meta[b[0]];
    }
  }

  /** All members follow the leader's position. */
  _syncBond(id) {
    const b = this._bondOf(id);
    if (!b) return;
    const p = this.work.positions[id];
    for (const m of b[1]) {
      const q = this.work.positions[m];
      if (m === id || !q) continue;
      q.x = p.x;
      q.y = p.y;
      if (p.approx) q.approx = true;
      else delete q.approx;
    }
  }

  _focusPoint() {
    const s = this.s;
    if (s.tool === "measure" && s.m1) return s.m2 ? { x: (s.m1.x + s.m2.x) / 2, y: (s.m1.y + s.m2.y) / 2 } : s.m1;
    const pos = s.sel && this.work && this.work.positions[s.sel];
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  _setMain(id, entityId, other = false) {
    this.mainEntity[id] = entityId;
    this.s.otherEnt = null;
    this.s.entFilter = "";
    const d = this.byId.get(id);
    // A previously linked entity leaves the list when another one is chosen (#43).
    if (d) d.entities = d.entities.filter((e) => !e.other);
    this._ws("devices/main_entity", { device_id: id, entity_id: entityId }).catch((err) => this._saveError(err));
    this._render();
  }

  async _reloadDevices() {
    try {
      const [st, dv] = await Promise.all([this._ws("state"), this._ws("devices")]);
      this._applyState(st);
      this._applyDevices(dv);
      const plan = this._plan();
      if (plan && this.work) {
        // Keep unsaved work; only move positions of new parts to their parent.
        for (const [child, parent] of Object.entries(this.partOf)) {
          if (this.work.positions[child]) {
            if (!this.work.positions[parent]) this.work.positions[parent] = this.work.positions[child];
            delete this.work.positions[child];
            this._scheduleSave();
          }
        }
      }
    } catch (err) {
      this._saveError(err);
    }
    this._render();
  }

  _closeDialog() {
    this.s.dialog = null;
    this.s.form = null;
    this._render();
  }

  _pickDevice(id) {
    const s = this.s;
    const d = this.byId.get(id);
    if (!d) return;
    const st = this._status(d);
    s.placingRoom = null;
    s.placingBox = null;
    s.entFilter = "";
    if (st === "unplaced" || st === "hiddenroom") {
      // Picking a device to place doesn't open its details (they'd take the list's space);
      // picking it again while placing opens them.
      if (s.placing === id) {
        s.sel = id;
      } else {
        s.placing = id;
        s.sel = null;
      }
    } else {
      s.sel = id;
      s.placing = null;
      if (st === "placed" || st === "approx") this._flash(id);
    }
    this._render();
  }

  _flash(id) {
    this.s.flash = id;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => {
      this.s.flash = null;
      const el = this.shadowRoot.querySelector(`[data-mk="${CSS.escape(id)}"]`);
      if (el) el.classList.remove("flash");
    }, 4800);
  }

  _locate(id) {
    const pos = this.work.positions[id];
    if (!pos) return;
    const nz = Math.max(this.s.z, 2.5);
    const lim = (v) => clamp(v, 100 * (1 - nz), 0);
    Object.assign(this.s, { sel: id, z: nz, tx: lim(50 - pos.x * nz), ty: lim(50 - pos.y * nz), fan: null });
    this._flash(id);
    this._render();
  }

  _moreInfo(id) {
    const d = this.byId.get(id);
    const ent = d && (this.mainEntity[id] || d.main_entity);
    if (!ent) return this._navigate(`/config/devices/device/${id}`);
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: ent }, bubbles: true, composed: true }));
  }

  _navigate(path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _zOrder(id, front) {
    const zs = Object.values(this.work.positions).map((p) => p.z || 0);
    this._change(() => {
      this.work.positions[id].z = front ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
    });
  }

  /** Move a spot, keeping what it is (split spot of a device, acts as, light shape, air flow, layer). */
  _moveTo(id, x, y, approx = false) {
    const old = this.work.positions[id] || {};
    const keep = {};
    for (const k of ["of", "as", "light", "air", "z"]) if (old[k] != null) keep[k] = old[k];
    this.work.positions[id] = { ...keep, x, y, ...(approx ? { approx: true } : {}) };
  }

  _placeAt(id, p, approx = false) {
    const d = this.byId.get(id);
    if (!approx) (this._fresh || (this._fresh = new Set())).add(id);
    this._moveTo(id, Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, approx);
    if (d) this._markSeen([id]);
  }

  _nextUnplaced(afterId) {
    const order = this._shownOrder || [];
    const idx = order.indexOf(afterId);
    const rest = order.slice(idx + 1).concat(order.slice(0, Math.max(0, idx)));
    return rest.find((id) => id !== afterId && this.byId.get(id) && this._status(this.byId.get(id)) === "unplaced") || null;
  }

  _spotNear(anchor, n) {
    // Concentric rings around the room pin: 6 spots in ring 1, 12 in ring 2…
    const plan = this._plan();
    const vpW = this._vpW || 900;
    const ratio = plan.width && plan.height ? plan.width / plan.height : 1.6;
    const step = (36 / vpW) * 100;
    let ring = 1;
    let idx = n - 1;
    while (idx >= ring * 6) {
      idx -= ring * 6;
      ring++;
    }
    const a = (idx / (ring * 6)) * 2 * Math.PI + (ring % 2 ? 0 : Math.PI / (ring * 6));
    return { x: clamp(anchor.x + Math.cos(a) * step * ring, 1, 99), y: clamp(anchor.y + Math.sin(a) * step * ring * ratio, 1, 99) };
  }

  _autoPlace() {
    const all = this.devices.filter((d) => this._inScope(d));
    const targets = all.filter((d) => (!d.loose || d.physical) && this._status(d) === "unplaced" && this._matches(d, "unplaced") && d.area_id && this.work.anchors[d.area_id]);
    if (!targets.length) return;
    this._change(() => {
      const counts = {};
      for (const [id] of Object.entries(this.work.positions)) {
        const d = this.byId.get(id);
        if (d && d.area_id) counts[d.area_id] = (counts[d.area_id] || 0) + 1;
      }
      for (const d of targets) {
        counts[d.area_id] = (counts[d.area_id] || 0) + 1;
        this._placeAt(d.id, this._spotNear(this.work.anchors[d.area_id], counts[d.area_id]), true);
      }
    });
    this._toast(`${targets.length} devices placed near their rooms (approximate).`);
  }

  async _skipShown() {
    const all = this.devices.filter((d) => this._inScope(d));
    const ids = all.filter((d) => (!d.loose || d.physical) && this._status(d) === "unplaced" && this._matches(d, "unplaced")).map((d) => d.id);
    if (!ids.length) return;
    this._pushUndo();
    await this._setSkipped(ids, true);
    this.s.sel = null;
    this._render();
    this._toast(`${ids.length} devices skipped. Devices already on the plan were kept.`);
  }

  async _unskip(id) {
    const d = this.byId.get(id);
    this._pushUndo();
    await this._setSkipped([id], false);
    if (!this.work.positions[id]) {
      const anchor = d.area_id && this.work.anchors[d.area_id];
      const n = Object.keys(this.work.positions).filter((k) => (this.byId.get(k) || {}).area_id === d.area_id).length + 1;
      this._placeAt(id, anchor ? this._spotNear(anchor, n) : { x: 50, y: 50 }, true);
      this._scheduleSave();
    }
    this.s.status = this.s.status.filter((x) => x !== "skipped");
    this.s.sel = id;
    this._flash(id);
    this._render();
  }

  async _moveHere(id) {
    const other = this._otherFloorPlan(this.byId.get(id));
    if (other) {
      const positions = { ...other.positions };
      delete positions[id];
      try {
        const res = await this._ws("plan/update", { plan_id: other.id, positions });
        other.positions = res.positions;
      } catch (err) {
        return this._saveError(err);
      }
    }
    this.s.placing = id;
    this._render();
  }

  _applyScale() {
    const s = this.s;
    const L = parseFloat(String(s.lenInput).replace(",", "."));
    if (!(L > 0) || !s.m1 || !s.m2) return;
    const dir = this._dirOf(s.m1, s.m2);
    const replaced = this.work.refs.some((r) => r.dir === dir);
    this._change(() => {
      this.work.refs = this.work.refs.filter((r) => r.dir !== dir).concat([{ ax: s.m1.x, ay: s.m1.y, bx: s.m2.x, by: s.m2.y, length: L, dir }]);
    });
    Object.assign(s, { ask: false, skipAuto: false, m1: null, m2: null, mh: null, lenInput: "", refSel: null });
    this._render();
    if (replaced) this._toast(`${dir === "h" ? "Horizontal" : "Vertical"} reference replaced`);
  }

  // ------------------------------------------------------------- pointer
  _onDown(e) {
    const grip = e.target.closest && e.target.closest("[data-shgrip]");
    if (grip) {
      const box = grip.closest(".shbox");
      this._gesture = { kind: "shbox", start: { x: e.clientX, y: e.clientY }, x0: box.offsetLeft, y0: box.offsetTop, el: box, moved: false };
      e.preventDefault();
      return;
    }
    if (!this._vp || !this._vp.contains(e.target) || e.button > 0) return;
    if (e.target.closest(".mbox") || e.target.closest(".refpop") || e.target.closest(".stackpop")) return;
    const s = this.s;
    this._pointers = this._pointers || new Map();
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: s.z };
      this._gesture = null;
      return;
    }
    const modal = s.placing || s.placingRoom || s.placingBox || s.tool === "measure";
    // Saved lines always react; a line being drawn is dropped (#39).
    const rh = s.tool === "measure" && e.target.closest("[data-rh]");
    const rl = s.tool === "measure" && e.target.closest("[data-refl]");
    if ((rh || rl) && s.m1) {
      Object.assign(s, { m1: null, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
      const mb = this.shadowRoot.getElementById("mbox");
      if (mb) mb.remove();
      const ml = this.shadowRoot.getElementById("mline");
      if (ml) ml.remove();
      for (const h of this.shadowRoot.querySelectorAll("[data-mh]")) h.remove();
    }
    const mh = e.target.closest("[data-mh]");
    const mk = !modal && e.target.closest("[data-mk]");
    const cl = !modal && e.target.closest("[data-cluster]");
    const pin = !modal && e.target.closest("[data-pin]");
    const bx = !modal && e.target.closest("[data-box]");
    const phm = !modal && e.target.closest("[data-ph]");
    const lhd = !modal && e.target.closest("[data-lh]");
    const start = { x: e.clientX, y: e.clientY };
    // Room shape (#111): corners, edge "+", toolbox grip.
    const shc = e.target.closest("[data-shc]");
    const shp = e.target.closest("[data-shp]");
    if ((shc || shp) && s.shapeEdit) {
      e.preventDefault();
      const pts = this.work.shapes[s.shapeEdit];
      const snap = this._snap();
      let i = shc ? Number(shc.dataset.shc) : Number(shp.dataset.shp) + 1;
      if (shp) {
        const a = pts[i - 1];
        const b = pts[i % pts.length];
        pts.splice(i, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ...(a[2] ? [1] : [])]);
      }
      this._gesture = { kind: "shc", i, start, moved: !!shp, snap };
      if (shp) this._render();
      return;
    }
    if (rh) this._gesture = { kind: "rh", i: Number(rh.dataset.rh), end: rh.dataset.end, start, moved: false, snap: this._snap() };
    else if (rl) this._gesture = { kind: "rl", i: Number(rl.dataset.refl), start, moved: false, snap: this._snap(), orig: clone(this.work.refs[Number(rl.dataset.refl)]), p0: this._pt(e) };
    else if (mh) this._gesture = { kind: "mh", which: mh.dataset.mh, start, moved: false };
    else if (pin) this._gesture = { kind: "pin", id: pin.dataset.pin, el: pin, start, moved: false, snap: this._snap() };
    else if (bx) this._gesture = { kind: "box", id: bx.dataset.box, el: bx, start, moved: false, snap: this._snap() };
    else if (!modal && e.target.closest("[data-ah]")) this._gesture = { kind: "ah", id: this.s.sel, start, moved: false, snap: this._snap() };
    else if (!modal && e.target.closest("[data-oh]")) this._gesture = { kind: "oh", which: e.target.closest("[data-oh]").dataset.oh, id: this.s.sel, start, moved: false, snap: this._snap() };
    else if (lhd) this._gesture = { kind: "lh", which: lhd.dataset.lh, id: this._bondLeader(this.s.sel), el: lhd, start, moved: false, snap: this._snap() };
    else if (phm) this._gesture = { kind: "ph", id: phm.dataset.ph, el: phm, start, moved: false, snap: this._snap() };
    else if (mk) this._gesture = { kind: "mk", id: mk.dataset.mk, el: mk, start, moved: false, snap: this._snap() };
    else if (cl) this._gesture = { kind: "cluster", id: cl.dataset.cluster, start, moved: false };
    else this._gesture = { kind: "bg", start, moved: false, tx: s.tx, ty: s.ty };
    try {
      this._vp.setPointerCapture(e.pointerId);
    } catch (_e) {
      /* */
    }
  }

  _onMove(e) {
    if (!this._vp) return;
    const s = this.s;
    if (this._pointers && this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pinch && this._pointers && this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = this._vp.getBoundingClientRect();
      const cx = (((a.x + b.x) / 2 - r.left) / r.width) * 100;
      const cy = (((a.y + b.y) / 2 - r.top) / r.height) * 100;
      this._zoomTo((this._pinch.z * d) / Math.max(1, this._pinch.d), cx, cy);
      return;
    }
    const g = this._gesture;
    const inside = this._vp.contains(e.target) || (g && g.kind !== "bg");
    if (!g) {
      if (!inside) return;
      if ((s.placing || s.placingRoom || s.placingBox) && e.pointerType !== "touch") {
        s.hover = this._pt(e);
        const gh = this.shadowRoot.getElementById("ghost");
        if (gh) {
          gh.dataset.x = s.hover.x;
          gh.dataset.y = s.hover.y;
          this._layout();
        } else this._renderOverlay();
      } else if (s.tool === "measure" && s.m1 && !s.m2) {
        s.mh = this._snapPoint(s.m1, this._pt(e), e.shiftKey);
        this._renderOverlay();
      }
      return;
    }
    const dist = Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y);
    if (dist > 4) g.moved = true;
    if (!g.moved) return;
    if (g.kind === "rh") {
      const r = this.work.refs[g.i];
      const other = g.end === "a" ? { x: r.bx, y: r.by } : { x: r.ax, y: r.ay };
      const p = this._snapPoint(other, this._pt(e), e.shiftKey);
      if (g.end === "a") Object.assign(r, { ax: p.x, ay: p.y });
      else Object.assign(r, { bx: p.x, by: p.y });
      s.refSel = null;
      this._renderOverlay();
      return;
    }
    if (g.kind === "rl") {
      const p = this._pt(e);
      const dx = p.x - g.p0.x;
      const dy = p.y - g.p0.y;
      const o = g.orig;
      const kx = clamp(dx, -Math.min(o.ax, o.bx), 100 - Math.max(o.ax, o.bx));
      const ky = clamp(dy, -Math.min(o.ay, o.by), 100 - Math.max(o.ay, o.by));
      Object.assign(this.work.refs[g.i], { ax: o.ax + kx, bx: o.bx + kx, ay: o.ay + ky, by: o.by + ky });
      s.refSel = null;
      this._renderOverlay();
      return;
    }
    if (g.kind === "mk" || g.kind === "pin") {
      // Dragged out of the plan: over the list it removes, anywhere else it snaps back (#32).
      const out = this._outside(e);
      const side = out ? this._overSide(e) : null;
      this._dropHint(side);
      g.out = out;
      g.side = side;
      if (out) {
        g.el.style.opacity = side ? "0.35" : "0.6";
        return;
      }
      g.el.style.opacity = "";
    }
    if (g.kind === "ah") {
      const p = this._pt(e);
      const pos = this.work.positions[g.id];
      if (!pos) return;
      const R = this._ratio();
      const cur = this._air(g.id);
      pos.air = { a: Math.round((Math.atan2((p.y - pos.y) / R, p.x - pos.x) * 180) / Math.PI), r: Math.max(1, Math.hypot(p.x - pos.x, (p.y - pos.y) / R)), s: cur.s };
      this._renderOverlay();
      return;
    }
    if (g.kind === "oh") {
      let p = this._pt(e);
      const pos = this.work.positions[g.id];
      if (!pos || !pos.opening) return;
      const o = pos.opening;
      const other = g.which === "1" ? [o.x2, o.y2] : [o.x1, o.y1];
      // Straight along the wall: snap to the other end's row or column (Alt: any angle).
      if (!e.altKey) {
        const R = this._ratio();
        if (Math.abs(p.x - other[0]) < Math.abs(p.y - other[1]) / R) p = { x: other[0], y: p.y };
        else p = { x: p.x, y: other[1] };
      }
      const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
      if (g.which === "1") Object.assign(o, { x1: c(p.x), y1: c(p.y) });
      else Object.assign(o, { x2: c(p.x), y2: c(p.y) });
      this._renderOverlay();
      return;
    }
    if (g.kind === "lh") {
      const p = this._pt(e);
      const pos = this.work.positions[g.id];
      if (!pos) return;
      const cur = this._shape(g.id);
      const R = this._ratio();
      const l = { ...(pos.light || {}), type: cur.type };
      if (g.which === "r") l.r = Math.max(0.5, Math.hypot(p.x - pos.x, (p.y - pos.y) / R));
      if (g.which === "end") Object.assign(l, { x2: p.x, y2: p.y, r: l.r ?? cur.r });
      if (g.which === "corner") Object.assign(l, { w: Math.max(1, Math.abs(p.x - pos.x) * 2), h: Math.max(1, Math.abs(p.y - pos.y) * 2) });
      if (g.which === "wall") Object.assign(l, { r: Math.max(0.5, Math.hypot(p.x - pos.x, (p.y - pos.y) / R)), a: Math.round((Math.atan2((p.y - pos.y) / R, p.x - pos.x) * 180) / Math.PI) });
      pos.light = l;
      this._renderOverlay();
      return;
    }
    if (g.kind === "ph") {
      const p = this._pt(e);
      const ph = (this.work.phantoms || {})[g.id];
      if (!ph) return;
      ph.x = p.x;
      ph.y = p.y;
      g.el.dataset.x = p.x;
      g.el.dataset.y = p.y;
      g.el.classList.add("dragging");
      this._layout();
      return;
    }
    if (g.kind === "shbox") {
      const x = g.x0 + e.clientX - g.start.x;
      const y = g.y0 + e.clientY - g.start.y;
      g.el.style.left = `${x}px`;
      g.el.style.top = `${y}px`;
      s.shapeBox = { x, y };
      return;
    }
    if (g.kind === "shc") {
      const pts = this.work.shapes[s.shapeEdit];
      if (!pts) return;
      const p = this._shapeSnap(pts, g.i, this._pt(e), e.altKey);
      pts[g.i] = [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, ...(pts[g.i][2] ? [1] : [])];
      this._render();
      return;
    }
    if (g.kind === "box") {
      const p = this._pt(e);
      this.work.positions[g.id].box = { x: p.x, y: p.y };
      g.el.dataset.x = p.x;
      g.el.dataset.y = p.y;
      this._layout();
      return;
    }
    if (g.kind === "mk") {
      // Over another marker: drop = same spot, then "Bond them?" (#62); over a phantom: join it.
      this._bondHover(g, e.clientX, e.clientY);
      const p = this._pt(e);
      this.work.positions[g.id] = { ...this.work.positions[g.id], x: p.x, y: p.y };
      delete this.work.positions[g.id].approx;
      g.el.dataset.x = p.x;
      g.el.dataset.y = p.y;
      g.el.classList.add("dragging");
      g.el.classList.remove("approx");
      this._layout();
    } else if (g.kind === "pin") {
      const p = this._pt(e);
      this.work.anchors[g.id] = { x: p.x, y: p.y };
      g.el.dataset.x = p.x;
      g.el.dataset.y = p.y;
      this._layout();
    } else if (g.kind === "mh") {
      const p = this._pt(e);
      const other = g.which === "a" ? s.m2 : s.m1;
      const sp = this._snapPoint(other, p, e.shiftKey);
      if (g.which === "a") s.m1 = sp;
      else s.m2 = sp;
      this._renderOverlay();
    } else if (g.kind === "bg") {
      // Zoomed in: dragging always moves the plan, in every step (#27). A click
      // without movement still measures / places.
      if (s.z > 1) {
        const r = this._vp.getBoundingClientRect();
        const lim = (v) => clamp(v, 100 * (1 - s.z), 0);
        s.tx = lim(g.tx + ((e.clientX - g.start.x) / r.width) * 100);
        s.ty = lim(g.ty + ((e.clientY - g.start.y) / r.height) * 100);
        this._vp.classList.add("panning");
        this._layout();
      }
    }
  }

  _onUp(e, cancelled = false) {
    if (this._pointers) this._pointers.delete(e.pointerId);
    if (this._pinch) {
      if (!this._pointers || this._pointers.size < 2) this._pinch = null;
      this._gesture = null;
      return;
    }
    const g = this._gesture;
    this._gesture = null;
    if (!g || !this._vp) return;
    const s = this.s;
    if (cancelled) {
      if (g.snap) this._restore(g.snap);
      this._render();
      return;
    }
    if (g.kind === "rh" || g.kind === "rl") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
        this._render();
      } else if (g.kind === "rl") {
        s.refSel = s.refSel === g.i ? null : g.i;
        s.refLen = this.work.refs[g.i].length.toFixed(2);
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("reflen");
          if (i) {
            i.focus({ preventScroll: true });
            i.select();
          }
        }, 50);
      }
      return;
    }
    clearTimeout(this._bondT);
    if (g.kind === "ah" || g.kind === "lh" || g.kind === "oh") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
      }
      this._render();
      return;
    }
    if (g.kind === "ph") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
      }
      s.sel = `ph:${g.id}`;
      s.memberView = null;
      this._render();
      return;
    }
    if (g.kind === "mk" && g.moved && g.dropTo && !g.out) {
      this._clearDrop();
      const own = (this._bondOf(g.id) || [null, [g.id]])[1].filter((m) => this.work.positions[m]);
      const d = this.byId.get(g.id);
      if (g.dropTo.kind === "ph") {
        // Joins the phantom and jumps back to its own spot.
        this._restore(clone(g.snap));
        this._pushUndo(g.snap);
        const ph = this.work.phantoms[g.dropTo.id];
        ph.members = [...new Set([...(ph.members || []), ...own])];
        this._scheduleSave();
        s.sel = `ph:${g.dropTo.id}`;
        this._render();
        this._toast(`${d ? d.name : "Device"} added to ${ph.name || "the phantom"} · it stays where it is`);
        return;
      }
      const target = this._bondLeader(g.dropTo.id);
      const tp = this.work.positions[target];
      this._pushUndo(g.snap);
      for (const m of own) {
        const q = this.work.positions[m];
        q.x = tp.x;
        q.y = tp.y;
        if (tp.approx) q.approx = true;
        else delete q.approx;
      }
      this._markSeen([g.id]);
      this._scheduleSave();
      if (s.sel && s.sel !== g.id) s.sel = null;
      if (this._canBond(g.id, target)) s.dialog = { type: "bondask", a: g.id, b: target };
      this._render();
      return;
    }
    this._clearDrop();
    if ((g.kind === "mk" || g.kind === "pin") && g.moved && g.out) {
      this._dropHint(null);
      this._restore(clone(g.snap));
      if (g.side) {
        // Dropped on the list: off the plan, back in the list (Undo in the toast).
        this._pushUndo(g.snap);
        if (g.kind === "mk") {
          const bb = this._bondOf(g.id);
          for (const m of bb ? bb[1] : [g.id]) delete this.work.positions[m];
          if (bb) delete this.work.bonds[bb[0]];
          if (s.sel === g.id || (bb && bb[1].includes(s.sel))) s.sel = null;
          const d = this.byId.get(g.id);
          this._scheduleSave();
          this._render();
          this._toast(`${d ? d.name : "Device"} removed from plan`);
        } else {
          delete this.work.anchors[g.id];
          const a = this.areaById.get(g.id);
          this._scheduleSave();
          this._render();
          this._toast(`${a ? a.name : "Room"} pin taken off the plan`);
        }
      } else this._render(); // anywhere else outside the plan: snaps back
      return;
    }
    if (g.kind === "mk") {
      if (g.moved) {
        this._syncBond(g.id);
        this._pushUndo(g.snap);
        this._markSeen([g.id]);
        this._scheduleSave();
        // Moving a marker doesn't open its details; another device's details close.
        if (s.sel && s.sel !== g.id) s.sel = null;
        this._render();
      } else {
        s.sel = g.id;
        s.memberView = null;
        s.stack = null;
        s.placing = null;
        this._render();
      }
      return;
    }
    if (g.kind === "shbox") return;
    if (g.kind === "shc") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
      }
      this._shSnapped = false;
      return;
    }
    if (g.kind === "box") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
      }
      s.sel = g.id;
      this._render();
      return;
    }
    if (g.kind === "pin") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
        this._render();
      }
      return;
    }
    if (g.kind === "mh") {
      this._render();
      return;
    }
    if (g.kind === "cluster") {
      if (!g.moved) {
        s.stack = s.stack === g.id ? null : g.id;
        this._render();
      }
      return;
    }
    if (g.kind === "bg") {
      this._vp.classList.remove("panning");
      if (g.moved && s.z > 1) return; // that was a pan, not a click
      this._bgClick(e);
    }
  }

  /** Which marker the dragged device is over: a device (same spot) or a phantom (join it). */
  _bondHover(g, cx, cy) {
    const el = this.shadowRoot.elementFromPoint ? this.shadowRoot.elementFromPoint(cx, cy) : null;
    const mk = el && el.closest ? el.closest("[data-mk],[data-cluster],[data-ph]") : null;
    let to = null;
    if (mk && mk.dataset.ph !== undefined) {
      if (this.work.positions[g.id]) to = { kind: "ph", id: mk.dataset.ph };
    } else if (mk) {
      const id = mk.dataset.mk || mk.dataset.cluster;
      const gb = this._bondOf(g.id);
      if (id && id !== g.id && !(gb && gb[1].includes(id))) to = { kind: "mk", id };
    }
    const key = to ? `${to.kind}:${to.id}` : "";
    if (g.dropKey === key) return;
    this._clearDrop();
    g.dropKey = key;
    g.dropTo = to;
    g.bondTo = to && to.kind === "mk" ? to.id : null;
    if (to) {
      mk.classList.add("droptgt");
      const t = mk.querySelector(".tip");
      if (t) {
        mk._tip0 = t.innerHTML;
        t.textContent = to.kind === "ph" ? "Drop to add it to this phantom" : "Drop here: same spot";
      }
    }
  }

  _clearDrop() {
    for (const x of this.shadowRoot.querySelectorAll(".mk.droptgt")) {
      x.classList.remove("droptgt");
      const t = x.querySelector(".tip");
      if (t && x._tip0 !== undefined) t.innerHTML = x._tip0;
    }
  }

  _outside(e) {
    const r = this._vp.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }

  _overSide(e) {
    const el = this.shadowRoot.elementFromPoint ? this.shadowRoot.elementFromPoint(e.clientX, e.clientY) : null;
    return el && el.closest ? el.closest("aside.side") : null;
  }

  _dropHint(side) {
    for (const el of this.shadowRoot.querySelectorAll("aside.side.dropout")) if (el !== side) el.classList.remove("dropout");
    if (side) side.classList.add("dropout");
  }

  _bgClick(e) {
    const s = this.s;
    const p = this._pt(e);
    if (s.placingRoom) {
      const room = s.placingRoom;
      this._change(() => {
        this.work.anchors[room] = { x: p.x, y: p.y };
      });
      const next = this._roomsForPlan().find((r) => !r.pos && !r.ignored && r.area_id !== room);
      s.placingRoom = s.queue && next ? next.area_id : null;
      this._render();
      return;
    }
    if (s.placingBox) {
      const [id, eid] = s.placingBox.split("|");
      const pt = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
      if (this.work.positions[id] && eid) this._change(() => (this.work.positions[`entity:${eid}`] = { ...pt, of: id }));
      else if (this.work.positions[id]) this._change(() => (this.work.positions[id].box = pt));
      s.placingBox = null;
      this._render();
      return;
    }
    if (s.placing) {
      const id = s.placing;
      this._change(() => this._placeAt(id, p));
      const next = s.queue ? this._nextUnplaced(id) : null;
      s.placing = next;
      s.sel = null;
      this._placedFeedback(id);
      return;
    }
    if (s.tool === "measure") {
      if (s.refSel !== null && s.refSel !== undefined) {
        s.refSel = null;
        this._render();
        return;
      }
      if (!s.m1 || s.m2) Object.assign(s, { m1: p, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
      else {
        Object.assign(s, { m2: this._snapPoint(s.m1, p, e.shiftKey), mh: null });
        // With one direction measured, offer its estimate for this line (#38): overwrite or keep.
        const est = this._scale().x ? this._distM(s.m1, s.m2) : null;
        s.lenInput = est ? est.toFixed(2) : "";
      }
      this._render();
      if (s.m2) setTimeout(() => {
        const inp = this.shadowRoot.getElementById("lenin");
        if (inp) {
          inp.focus({ preventScroll: true });
          inp.select();
        }
      }, 50);
      return;
    }
    if (s.sel || s.fan || s.stack || s.itip) {
      s.sel = null;
      s.fan = null;
      s.stack = null;
      s.itip = null;
      s.memberView = null;
      this._render();
    }
  }

  /** After placing: a short flash on the marker and a toast, no details card (#29). */
  _placedFeedback(id) {
    const d = this.byId.get(id);
    this._flash(id);
    this._render();
    this._toast(`✓ ${d ? d.name : "Device"} placed`);
  }

  _renderOverlay(withControls = false) {
    const layer = this.shadowRoot.getElementById("layer");
    const svg = this.shadowRoot.getElementById("ovsvg");
    if (layer) layer.innerHTML = this._overlayHtml();
    if (svg) svg.innerHTML = this._svgOverlay();
    if (withControls) {
      const canvas = this.shadowRoot.getElementById("canvas");
      if (canvas) {
        canvas.querySelectorAll(".ovctl").forEach((el) => el.remove());
        canvas.insertAdjacentHTML("beforeend", this._canvasCtlHtml());
      }
    }
    this._layout();
    this._hydrate();
  }

  _onDragStart(e) {
    const row = e.target.closest && e.target.closest("[data-dev],[data-room]");
    if (!row) return;
    this._listDrag = row.dataset.dev ? { dev: row.dataset.dev } : { room: row.dataset.room };
    try {
      e.dataTransfer.setData("text/plain", row.dataset.dev || row.dataset.room);
      e.dataTransfer.effectAllowed = "move";
      // Drag a compact pin / marker instead of the whole row. The point under the
      // pointer is exactly where it lands: the pin's tip, or the marker's centre.
      let ghost = this.shadowRoot.getElementById("dragghost");
      if (!ghost) {
        ghost = document.createElement("div");
        ghost.id = "dragghost";
        this.shadowRoot.appendChild(ghost);
      }
      if (row.dataset.room) {
        const a = this.areaById.get(row.dataset.room);
        ghost.innerHTML = `<span class="pin dragpin">${SVG.pin}${esc(a ? a.name : "")}</span>`;
        const el = ghost.firstElementChild;
        const r = el.getBoundingClientRect();
        e.dataTransfer.setDragImage(el, r.width / 2, r.height / 2);
      } else {
        const d = this.byId.get(row.dataset.dev);
        const v = d ? this._ringVars(d) : { c1: "var(--df-primary)" };
        ghost.innerHTML = `<span class="dragmk" style="--c1:${v.c1}"><span class="ring">${d ? this._iconHtml(d) : ""}</span></span>`;
        this._hydrate();
        e.dataTransfer.setDragImage(ghost.firstElementChild, 20, 20);
      }
    } catch (_e) {
      /* older browsers: default drag image */
    }
  }

  _onDrop(e) {
    if (!this._vp || !e.target.closest || !e.target.closest("[data-vp]") || !this._listDrag) return;
    e.preventDefault();
    const p = this._pt(e);
    const ld = this._listDrag;
    this._listDrag = null;
    if (ld.room) {
      this._change(() => {
        this.work.anchors[ld.room] = { x: p.x, y: p.y };
      });
      return;
    }
    const d = this.byId.get(ld.dev);
    const lh = this._listHover;
    this._listHover = null;
    clearTimeout(this._bondT);
    if (!d) return;
    const st = this._status(d);
    if (st === "skipped") return;
    this._clearDrop();
    if (lh && lh.bondTo && st !== "elsewhere" && this.work.positions[this._bondLeader(lh.bondTo)]) {
      const target = this._bondLeader(lh.bondTo);
      const tp = this.work.positions[target];
      this._change(() => {
        this._unbond(d.id);
        this._moveTo(d.id, tp.x, tp.y, !!tp.approx);
      });
      this._markSeen([d.id]);
      if (this.s.placing === d.id) this.s.placing = null;
      this.s.sel = null;
      if (this._canBond(d.id, target)) this.s.dialog = { type: "bondask", a: d.id, b: target };
      this._render();
      return;
    }
    if (st === "elsewhere") {
      this.s.sel = d.id;
      this._render();
      this._toast(`${d.name} is on another floor. Use “Move to this floor” first.`, false);
      return;
    }
    this._change(() => this._placeAt(d.id, p));
    if (this.s.placing === d.id) this.s.placing = null;
    this.s.sel = null;
    this._placedFeedback(d.id);
  }

  _onKey(e) {
    if (!this.isConnected || !this.work) return;
    const path = e.composedPath ? e.composedPath() : [];
    const t = path[0] || e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const s = this.s;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this._redoAct();
      else this._undoAct();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this._redoAct();
      return;
    }
    if (e.key === "Escape") {
      if (this._gesture && this._gesture.snap) {
        this._restore(this._gesture.snap);
        this._gesture = null;
      } else if (s.menu) s.menu = null;
      else if (s.layersOpen) s.layersOpen = false;
      else if (s.refSel !== null && s.refSel !== undefined) s.refSel = null;
      else if (s.dialog) s.dialog = null;
      else if (s.placing || s.placingRoom || s.placingBox) Object.assign(s, { placing: null, placingRoom: null, placingBox: null, hover: null });
      else if (s.tool === "measure" && s.m1) Object.assign(s, { m1: null, m2: null, mh: null, ask: false });
      else if (s.pop) s.pop = null;
      else if (s.fan) s.fan = null;
      else s.sel = null;
      this._render();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && s.tool === "measure" && s.refSel !== null && s.refSel !== undefined && this.work.refs[s.refSel]) {
      e.preventDefault();
      const r = this.work.refs[s.refSel];
      const i = s.refSel;
      this._change(() => this.work.refs.splice(i, 1));
      s.refSel = null;
      this._render();
      this._toast(`${r.dir === "h" ? "Horizontal" : "Vertical"} measurement deleted`);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && s.sel && this.work.positions[s.sel]) {
      e.preventDefault();
      const d = this.byId.get(s.sel);
      const sel = s.sel;
      this._change(() => {
        this._unbond(sel);
        delete this.work.positions[sel];
      });
      this._toast(`${d ? d.name : "Device"} removed from the plan`);
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && s.sel && this.work.positions[s.sel]) {
      e.preventDefault();
      const step = (e.shiftKey ? 1 : 0.2) / s.z;
      const [dx, dy] = arrows[e.key];
      const pos = this.work.positions[s.sel];
      const now = Date.now();
      const snap = !this._nudgeT || now - this._nudgeT > 800 ? this._snap() : null;
      this._nudgeT = now;
      if (snap) this._pushUndo(snap);
      pos.x = clamp(pos.x + dx * step, 0, 100);
      pos.y = clamp(pos.y + dy * step, 0, 100);
      delete pos.approx;
      this._syncBond(s.sel);
      this._scheduleSave();
      this._renderOverlay();
    }
  }

  // ------------------------------------------------------------ plans CRUD
  async _saveForm(mode) {
    const root = this.shadowRoot;
    const f = this.s.form || (this.s.form = {});
    const name = root.getElementById("fname").value.trim();
    const where = root.getElementById("fwhere").value;
    const levelEl = root.getElementById("flevel");
    const img = f.img || (mode === "settings" ? this._plan().image_type : "top");
    const fail = (msg) => {
      f.err = msg;
      f.busy = false;
      this._render();
    };
    f.name = name;
    if (!name) return fail("Please give the plan a name.");
    const body = { name, image_type: img };
    if (where === "view") Object.assign(body, { kind: "view", floor_id: null, level: null });
    else if (where === "level") {
      const lv = parseInt(levelEl ? levelEl.value : "0", 10);
      const clash = this.plans.find((p) => p.kind === "floor" && !p.floor_id && p.level === lv && (mode !== "settings" || p.id !== this.s.planId));
      if (clash) return fail(`“${clash.name}” already uses level ${lv}. Open it, or choose another level.`);
      Object.assign(body, { kind: "floor", floor_id: null, level: Number.isNaN(lv) ? 0 : lv });
    } else Object.assign(body, { kind: "floor", floor_id: where.slice(6), level: null });
    f.busy = true;
    f.err = null;
    this._render();
    try {
      let plan;
      if (mode === "settings") {
        await this._flushSave();
        const res = await this._ws("plan/update", { plan_id: this.s.planId, ...body });
        plan = this._plan();
        Object.assign(plan, res);
      } else {
        const res = await this._ws("plan/create", body);
        // A new plan may reuse the id of a deleted one: forget that plan's browser state.
        lsSet(`skip1_${res.id}`, null);
        this.plans.push(res);
        plan = res;
        this._openPlan(res.id);
      }
      if (f.image) await this._applyImage(plan, f.image);
      this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
      this.s.dialog = null;
      this.s.form = null;
      if (mode !== "settings") this.s.tool = this._firstOpenStep();
      this._signImage(plan);
      this._render();
    } catch (err) {
      fail(err.message || String(err));
    }
  }

  _formPickFile(file) {
    if (!file) return;
    const f = this.s.form || (this.s.form = {});
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      f.err = "Please use a PNG, JPG or WebP image.";
      return this._render();
    }
    if (file.size > 15 * 1024 * 1024) {
      f.err = "That image is larger than 15 MB.";
      return this._render();
    }
    f.err = null;
    f.image = { kind: "file", file, preview: URL.createObjectURL(file) };
    this._render();
  }

  /** Put the chosen image (upload, sample or HA file) on a plan. */
  async _applyImage(plan, image) {
    let res;
    if (image.kind === "file") res = await this._uploadFile(plan, image.file, true);
    else if (image.kind === "template") res = await this._ws("plan/image_template", { plan_id: plan.id, template_id: image.id });
    else {
      const size = await this._imageSize(image.url);
      res = await this._ws("plan/image_url", { plan_id: plan.id, url: image.url, width: size.w, height: size.h });
    }
    if (res) Object.assign(plan, res);
    this.s.imgFailed = null;
    this._signImage(plan);
    return plan;
  }

  async _applyCanvasImage() {
    const f = this.s.form;
    const plan = this._plan();
    if (!f || !f.image || !plan) return;
    f.busy = true;
    this._render();
    try {
      await this._applyImage(plan, f.image);
      this.s.form = null;
      this.s.tool = this._firstOpenStep();
    } catch (err) {
      f.busy = false;
      f.err = err.message || String(err);
    }
    this._render();
  }

  async _renamePlan() {
    const p = this._plan();
    const name = ((this.s.dialog && this.s.dialog.name) ?? p.name).trim();
    if (!name) return;
    try {
      await this._flushSave();
      Object.assign(p, await this._ws("plan/update", { plan_id: p.id, name }));
      this.s.dialog = null;
      this._render();
    } catch (err) {
      const e = this.shadowRoot.getElementById("formerr");
      if (e) e.textContent = err.message || String(err);
    }
  }

  async _movePlan(dir) {
    const views = this.plans.filter((p) => p.kind !== "floor");
    const p = this._plan();
    const i = views.indexOf(p);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= views.length) return;
    [views[i], views[j]] = [views[j], views[i]];
    await Promise.all(views.map((v, k) => (v.sort === k ? null : this._ws("plan/update", { plan_id: v.id, sort: k }).then((r) => Object.assign(v, r)))));
    views.forEach((v, k) => (v.sort = k));
    this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
    this._render();
  }

  async _deletePlan() {
    const id = this.s.planId;
    clearTimeout(this._saveT);
    this.s.save = "ok";
    await this._ws("plan/delete", { plan_id: id });
    this.plans = this.plans.filter((p) => p.id !== id);
    this.s.dialog = null;
    this._openPlan(this.plans[0] ? this.plans[0].id : null, true);
    this._render();
  }

  async _finishSetup() {
    const f = this.s.setup;
    const real = this.devices.filter((d) => !d.loose || d.physical);
    const skip = real.filter((d) => !this._setupKeep(d, f)).map((d) => d.id);
    const st = await this._ws("setup/complete", { skip_ids: skip, seen_ids: real.map((d) => d.id) });
    this._applyState(st);
    this.s.setup = null;
    this.s.form = null;
    if (this.plans.length) this._openPlan(this.s.planId && this.plans.find((p) => p.id === this.s.planId) ? this.s.planId : this.plans[0].id);
    this._render();
  }

  _imageSize(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => reject(new Error("Could not read that image"));
      im.src = src;
    });
  }

  async _uploadFile(plan, file, quiet = false) {
    if (!file || !plan) return null;
    try {
      const url0 = URL.createObjectURL(file);
      const size = await this._imageSize(url0).finally(() => URL.revokeObjectURL(url0));
      this.s.save = "busy";
      this._renderSave();
      const url = `/api/${WS}/upload?plan_id=${encodeURIComponent(plan.id)}&width=${size.w}&height=${size.h}`;
      const init = { method: "POST", body: file, headers: { "Content-Type": file.type } };
      const resp = this._hass.fetchWithAuth ? await this._hass.fetchWithAuth(url, init) : await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this._hass.auth.data.access_token}` } });
      if (!resp.ok) {
        let msg = `Upload failed (${resp.status})`;
        try {
          msg = (await resp.json()).message || msg;
        } catch (_e) {
          /* */
        }
        throw new Error(msg);
      }
      const res = await resp.json();
      Object.assign(plan, res);
      this.s.save = "ok";
      this._renderSave();
      if (!quiet) {
        this.s.dialog = null;
        this.s.tool = this._firstOpenStep();
        this._signImage(plan);
        this._render();
      }
      return res;
    } catch (err) {
      this._saveError(err);
      if (quiet) throw err;
      return null;
    }
  }

  // ---------------------------------------------------------------- ready + dashboards
  async _openReady() {
    await this._flushSave();
    this.s.dialog = { type: "ready", dash: undefined };
    this._render();
    try {
      const st = await this._ws("state");
      for (const np of st.plans) {
        const p = this.plans.find((x) => x.id === np.id);
        if (p) Object.assign(p, { device_id: np.device_id, sensor_entity: np.sensor_entity, image_entity: np.image_entity });
      }
    } catch (_e) {
      /* keep what we have */
    }
    const dash = await this._findDash(this.s.planId).catch(() => null);
    // What changed since the last time "I'm ready" was opened (per browser).
    const key = `readysnap_${this.s.planId}`;
    const before = lsGet(key, null);
    const now = this._readySnap();
    let diff = null;
    if (before) {
      diff = { added: 0, removed: 0, moved: 0 };
      for (const [id, p] of Object.entries(now)) {
        const b = before[id];
        if (!b) diff.added++;
        else if (Math.hypot(p[0] - b[0], p[1] - b[1]) > 1.5) diff.moved++;
      }
      for (const id of Object.keys(before)) if (!now[id]) diff.removed++;
    }
    lsSet(key, now);
    if (this.s.dialog && this.s.dialog.type === "ready") {
      Object.assign(this.s.dialog, { dash, diff });
      this._render();
    }
  }

  _readySnap() {
    const out = {};
    for (const [id, p] of Object.entries((this.work && this.work.positions) || {})) out[id] = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
    return out;
  }

  async _dashboards() {
    let list = [];
    try {
      list = await this._hass.callWS({ type: "lovelace/dashboards/list" });
    } catch (_e) {
      list = [];
    }
    return [{ key: "", url_path: null, title: "Overview", mode: "storage" }]
      .concat(list.map((d) => ({ key: d.url_path, url_path: d.url_path, title: d.title || d.url_path, mode: d.mode })))
      .concat([{ key: "__new", url_path: null, title: "+ New dashboard “Floorplan”", mode: "new" }]);
  }

  _dashPath(dash, view, index) {
    return `/${dash.url_path || "lovelace"}/${view && view.path ? view.path : index}`;
  }

  /** Is there already a Device Floorplan card for this plan on a dashboard? */
  async _findDash(planId) {
    for (const dash of await this._dashboards()) {
      if (dash.mode === "yaml") continue;
      let cfg;
      try {
        cfg = await this._hass.callWS({ type: "lovelace/config", url_path: dash.url_path });
      } catch (_e) {
        continue;
      }
      const views = (cfg && cfg.views) || [];
      for (let i = 0; i < views.length; i++) {
        const txt = JSON.stringify(views[i]);
        if (txt.includes("custom:device-floorplan-card") && txt.includes(`"plan":"${planId}"`)) {
          return { title: dash.title, path: this._dashPath(dash, views[i], i) };
        }
      }
    }
    return null;
  }

  async _openAddDash(from = null) {
    await this._flushSave();
    this.s.dialog = { type: "adddash", where: "new", key: "", from };
    this._render();
    const dashboards = await this._dashboards();
    if (!this.s.dialog || this.s.dialog.type !== "adddash") return;
    this.s.dialog.dashboards = dashboards;
    await this._loadDashCfg("");
    // Overview is often generated automatically by HA: then offer a new dashboard instead.
    const d = this.s.dialog;
    if (d && d.type === "adddash" && d.cfgError) {
      await this._loadDashCfg("__new");
      d.note = "Your Overview is generated automatically by Home Assistant, so a new “Floorplan” dashboard will be created (it shows up in the sidebar).";
      this._render();
    }
  }

  async _loadDashCfg(key) {
    const d = this.s.dialog;
    const dash = d.dashboards.find((x) => x.key === key) || d.dashboards[0];
    Object.assign(d, { key: dash.key, config: null, cfgError: null, err: null, note: null });
    this._render();
    if (dash.mode === "new") {
      Object.assign(d, { config: { views: [] }, where: "new" });
      return this._render();
    }
    if (dash.mode === "yaml") {
      d.cfgError = "This dashboard is managed in YAML.";
      return this._render();
    }
    try {
      const cfg = await this._hass.callWS({ type: "lovelace/config", url_path: dash.url_path });
      if (!cfg || cfg.strategy) d.cfgError = "Home Assistant generates this dashboard automatically (you haven't taken control of it), so the card can't be added for you.";
      else d.config = cfg;
    } catch (err) {
      d.cfgError = err && err.code === "config_not_found" ? "Home Assistant generates this dashboard automatically (you haven't taken control of it), so the card can't be added for you." : `Could not open this dashboard (${err.message || err}).`;
    }
    d.view = this._firstFreeView();
    this._render();
  }

  _firstFreeView() {
    const d = this.s.dialog;
    const views = (d && d.config && d.config.views) || [];
    const i = views.findIndex((v) => v.type !== "panel");
    return i < 0 ? 0 : i;
  }

  async _addToDashboard() {
    const d = this.s.dialog;
    const plan = this._plan();
    const dash = d.dashboards.find((x) => x.key === d.key);
    const cfg = clone(d.config);
    cfg.views = cfg.views || [];
    const card = { type: "custom:device-floorplan-card", plan: plan.id };
    let index;
    let urlPath = dash.url_path;
    if (dash.mode === "new") {
      const existing = new Set(d.dashboards.map((x) => x.url_path).filter(Boolean));
      urlPath = "home-floorplan";
      for (let n = 2; existing.has(urlPath); n++) urlPath = `home-floorplan-${n}`;
    }
    if (d.where === "view") {
      index = Number(d.view) || 0;
      const view = cfg.views[index];
      if (!view || view.type === "panel") {
        d.err = "Choose a view that is not a full-width view.";
        return this._render();
      }
      if (view.type === "sections" || Array.isArray(view.sections)) {
        view.sections = view.sections || [];
        if (!view.sections.length) view.sections.push({ type: "grid", cards: [] });
        const sec = view.sections[view.sections.length - 1];
        sec.cards = sec.cards || [];
        sec.cards.push({ ...card, grid_options: { columns: "full" } });
      } else {
        view.cards = view.cards || [];
        view.cards.push(card);
      }
    } else {
      const used = new Set(cfg.views.map((v) => v.path));
      let path = `floorplan-${plan.id}`.replace(/_/g, "-");
      for (let n = 2; used.has(path); n++) path = `floorplan-${plan.id}-${n}`.replace(/_/g, "-");
      // No icon: HA then shows the title, so several floor views can be told apart.
      cfg.views.push({ title: plan.name, path, type: "panel", cards: [card] });
      index = cfg.views.length - 1;
    }
    d.busy = true;
    this._render();
    try {
      if (dash.mode === "new") {
        await this._hass.callWS({ type: "lovelace/dashboards/create", url_path: urlPath, title: "Floorplan", icon: "mdi:floor-plan", mode: "storage", show_in_sidebar: true, require_admin: false });
      }
      await this._hass.callWS({ type: "lovelace/config/save", url_path: urlPath, config: cfg });
      const target = { ...dash, url_path: urlPath, title: dash.mode === "new" ? "Floorplan" : dash.title };
      const view = cfg.views[index];
      this.s.dialog = {
        type: "added",
        title: target.title,
        path: this._dashPath(target, view, index),
        view: view.title || view.path || `View ${index + 1}`,
        viewNew: d.where !== "view",
        newDash: dash.mode === "new",
      };
      lsSet(`readysnap_${plan.id}`, this._readySnap());
      this._render();
    } catch (err) {
      d.busy = false;
      d.err = err.message || String(err);
      this._render();
    }
  }

  // ---------------------------------------------------------------- export / import
  _planRows() {
    const plan = this._plan();
    const sc = this._scale();
    const rows = [];
    for (const [id, pos] of Object.entries(this.work.positions)) {
      const d = this.byId.get(id);
      rows.push({
        id,
        d,
        pos,
        xm: sc.x && plan.width ? ((pos.x / 100) * plan.width * sc.x) : null,
        ym: sc.y && plan.height ? ((pos.y / 100) * plan.height * sc.y) : null,
      });
    }
    return rows;
  }

  async _export(fmt) {
    const plan = this._plan();
    const slug = plan.id;
    try {
      if (fmt === "csv") {
        const q = (v) => {
          const t = v === null || v === undefined ? "" : String(v);
          return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const head = ["name", "device_id", "area", "plan", "type", "connection", "manufacturer", "model", "x_percent", "y_percent", "x_m", "y_m", "status", "main_entity", "box_x_percent", "box_y_percent"];
        const lines = [head.join(",")];
        for (const r of this._planRows()) {
          const d = r.d || {};
          lines.push([d.name || "(removed device)", r.id, d.area_name, plan.name, d.group ? (GROUPS[d.group] || GROUPS.other)[0] : "", (d.conns || []).map((c) => (CONN[c] || CONN.other).label).join(" + "), d.manufacturer, d.model, r.pos.x.toFixed(2), r.pos.y.toFixed(2), r.xm != null ? r.xm.toFixed(2) : "", r.ym != null ? r.ym.toFixed(2) : "", r.pos.approx ? "approximate" : "placed", this.mainEntity[r.id] || d.main_entity || "", r.pos.box ? r.pos.box.x.toFixed(2) : "", r.pos.box ? r.pos.box.y.toFixed(2) : ""].map(q).join(","));
        }
        download(`device-floorplan-${slug}.csv`, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
      } else if (fmt === "json") {
        let image = null;
        const src = this._imgSrc(plan);
        if (src) {
          const blob = await (await fetch(src)).blob();
          image = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
        }
        const out = {
          format: "device_floorplan_plan",
          version: 1,
          exported: new Date().toISOString(),
          plan: {
            name: plan.name,
            kind: plan.kind,
            floor_id: plan.floor_id,
            level: plan.level,
            image_type: plan.image_type,
            width: plan.width,
            height: plan.height,
            refs: this.work.refs,
            hidden_rooms: this.work.hidden_rooms.map((a) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a })),
            anchors: Object.entries(this.work.anchors).map(([a, p]) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a, x: p.x, y: p.y })),
            devices: this._planRows().map((r) => ({ device_id: r.id, name: r.d ? r.d.name : null, ieee: r.d ? r.d.ieee : null, mac: r.d ? r.d.mac : null, area: r.d ? r.d.area_name : null, x: r.pos.x, y: r.pos.y, approx: !!r.pos.approx, z: r.pos.z || 0, ...(r.pos.box ? { box: r.pos.box } : {}), ...(r.pos.light ? { light: r.pos.light } : {}), ...(r.pos.of ? { of: r.pos.of } : {}), ...(r.pos.as ? { as: r.pos.as } : {}), ...(r.pos.air ? { air: r.pos.air } : {}), ...(r.pos.opening ? { opening: r.pos.opening } : {}) })),
            shapes: Object.entries(this.work.shapes || {}).map(([a, pts]) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a, points: pts })),
            bonds: Object.entries(this.work.bonds || {}).map(([id, m]) => ({ id, members: m, ...((this.work.bond_meta || {})[id] || {}) })),
            phantoms: Object.entries(this.work.phantoms || {}).map(([id, ph]) => ({ id, ...ph })),
          },
          image,
        };
        download(`device-floorplan-${slug}.json`, new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
      } else if (fmt === "png") {
        download(`device-floorplan-${slug}.png`, await this._renderPng());
      }
      this.s.dialog = null;
      this._render();
      this._toast(`Exported ${fmt.toUpperCase()}`, false);
    } catch (err) {
      this.s.dialog.err = `Export failed: ${err.message || err}`;
      this._render();
    }
  }

  async _renderPng() {
    const plan = this._plan();
    const src = this._imgSrc(plan);
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("could not load the plan image"));
      i.src = src;
    });
    const W = im.naturalWidth;
    const H = im.naturalHeight;
    const r = Math.max(9, Math.round(Math.max(W, H) / 90));
    const used = CONN_ORDER.filter((c) => this._planRows().some((x) => x.d && x.d.conns.includes(c)));
    const legendH = Math.round(r * 3.2);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H + legendH;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(im, 0, 0, W, H);
    for (const row of this._planRows()) {
      const x = (row.pos.x / 100) * W;
      const y = (row.pos.y / 100) * H;
      const c1 = row.d ? (CONN[row.d.conns[0]] || CONN.other).color : "#6b7280";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = Math.max(2, r / 4);
      g.strokeStyle = c1;
      g.setLineDash(row.pos.approx ? [r / 2, r / 3] : []);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(x, y, r / 3, 0, Math.PI * 2);
      g.fillStyle = c1;
      g.fill();
    }
    g.font = `${Math.round(r * 1.2)}px Roboto, system-ui, sans-serif`;
    g.textBaseline = "middle";
    let lx = r;
    const ly = H + legendH / 2;
    g.fillStyle = "#1c1c1c";
    g.fillText(`${plan.name} · ${this._planRows().length} devices`, lx, ly);
    lx += g.measureText(`${plan.name} · ${this._planRows().length} devices`).width + r * 2;
    for (const c of used) {
      g.beginPath();
      g.arc(lx + r / 2, ly, r / 2, 0, Math.PI * 2);
      g.strokeStyle = CONN[c].color;
      g.lineWidth = Math.max(2, r / 5);
      g.stroke();
      g.fillStyle = "#1c1c1c";
      g.fillText(CONN[c].label, lx + r * 1.4, ly);
      lx += r * 2.4 + g.measureText(CONN[c].label).width;
    }
    return await new Promise((res) => cv.toBlob(res, "image/png"));
  }

  async _importPlan(file) {
    if (!file) return;
    const f = this.s.form || (this.s.form = {});
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== "device_floorplan_plan" || !data.plan) throw new Error("This is not a Device Floorplan plan file");
      const P = data.plan;
      const floorOk = P.floor_id && this.floors.some((x) => x.floor_id === P.floor_id) && !this.plans.some((x) => x.floor_id === P.floor_id);
      let name = P.name || "Imported plan";
      const body = { name, image_type: P.image_type === "angled" ? "angled" : "top" };
      if (P.kind === "view") Object.assign(body, { kind: "view" });
      else if (floorOk) Object.assign(body, { kind: "floor", floor_id: P.floor_id });
      else {
        let lv = Number.isInteger(P.level) ? P.level : 0;
        while (this.plans.some((x) => x.kind === "floor" && x.level === lv)) lv++;
        Object.assign(body, { kind: "floor", floor_id: null, level: lv });
      }
      f.busy = true;
      this._render();
      const plan = await this._ws("plan/create", body);
      this.plans.push(plan);
      if (data.image) {
        const blob = await (await fetch(data.image)).blob();
        const ext = blob.type || "image/png";
        await this._uploadFile(plan, new File([blob], `plan.${ext.split("/")[1] || "png"}`, { type: ext }), true);
      }
      // Map devices: same id, else Zigbee IEEE, else MAC, else exact name.
      const positions = {};
      const idMap = {};
      let matched = 0;
      let missing = 0;
      const extra = (dv) => ({ ...(dv.approx ? { approx: true } : {}), ...(dv.z ? { z: dv.z } : {}), ...(dv.box ? { box: dv.box } : {}), ...(dv.light ? { light: dv.light } : {}), ...(dv.as ? { as: dv.as } : {}), ...(dv.air ? { air: dv.air } : {}), ...(dv.opening ? { opening: dv.opening } : {}) });
      const spots = [];
      for (const dv of P.devices || []) {
        // 0.7.0: split spots and entities placed on their own come back when the entity exists here.
        if (String(dv.device_id).startsWith("entity:")) {
          if (this._hass && this._hass.states[dv.device_id.slice(7)]) spots.push(dv);
          else missing++;
          continue;
        }
        let d = this.byId.get(dv.device_id);
        if (!d && dv.ieee) d = this.devices.find((x) => x.ieee === dv.ieee);
        if (!d && dv.mac) d = this.devices.find((x) => x.mac === dv.mac);
        if (!d && dv.name) d = this.devices.find((x) => x.name === dv.name);
        if (!d) {
          missing++;
          continue;
        }
        matched++;
        idMap[dv.device_id] = d.id;
        positions[d.id] = { x: dv.x, y: dv.y, ...extra(dv) };
      }
      for (const dv of spots) {
        const of = dv.of ? idMap[dv.of] : null;
        if (dv.of && !of) {
          missing++;
          continue;
        }
        matched++;
        positions[dv.device_id] = { x: dv.x, y: dv.y, ...(of ? { of } : {}), ...extra(dv) };
      }
      // Bonds and phantoms (0.5.0) follow their matched devices.
      const bonds = {};
      const bondMeta = {};
      for (const b of P.bonds || []) {
        const m = (b.members || []).map((x) => idMap[x]).filter(Boolean);
        if (m.length < 2) continue;
        bonds[b.id] = m;
        const meta = {};
        for (const k of ["name", "icon", "tap", "show"]) if (b[k]) meta[k] = b[k];
        if (Object.keys(meta).length) bondMeta[b.id] = meta;
      }
      const phantoms = {};
      for (const ph of P.phantoms || []) {
        const { id, ...rest } = ph;
        phantoms[id] = { ...rest, members: (ph.members || []).map((x) => idMap[x]).filter(Boolean), ...(ph.one ? { one: idMap[ph.one] } : {}) };
      }
      const areaFor = (a) => (this.areaById.get(a.area_id) ? a.area_id : (this.areas.find((x) => x.name === a.name) || {}).area_id);
      const anchors = {};
      for (const a of P.anchors || []) {
        const id = areaFor(a);
        if (id) anchors[id] = { x: a.x, y: a.y };
      }
      const hidden = (P.hidden_rooms || []).map(areaFor).filter(Boolean);
      const shapes = {};
      for (const a of P.shapes || []) {
        const id = areaFor(a);
        if (id && Array.isArray(a.points)) shapes[id] = a.points;
      }
      const res = await this._ws("plan/update", { plan_id: plan.id, positions, anchors, shapes, refs: (P.refs || []).slice(0, 2), hidden_rooms: hidden, bonds, bond_meta: bondMeta, phantoms });
      Object.assign(plan, res);
      this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
      this.s.dialog = null;
      this.s.form = null;
      this._openPlan(plan.id);
      this.s.tool = "place";
      this._render();
      this._toast(`Imported “${name}”: ${matched} device${matched === 1 ? "" : "s"} matched${missing ? `, ${missing} not found here` : ""}.`, false);
    } catch (err) {
      f.busy = false;
      f.err = `Import failed: ${err.message || err}`;
      this._render();
    }
  }

  _saveRefLen() {
    const s = this.s;
    const i = s.refSel;
    const L = parseFloat(String(s.refLen).replace(",", "."));
    if (i === null || i === undefined || !(L > 0) || !this.work.refs[i]) return;
    this._change(() => {
      this.work.refs[i].length = L;
    });
    s.refSel = null;
    this._render();
  }
}

if (!customElements.get("device-floorplan-panel")) customElements.define("device-floorplan-panel", DeviceFloorplanPanel);
window.__DEVICE_FLOORPLAN_VERSION__ = VERSION;
