/*
 * Device Floorplan – planner panel (v0.4.7).
 * Plain web component, no build step. Talks to the integration through
 * hass.callWS and uploads images through the authenticated HTTP endpoint.
 */

const WS = "device_floorplan";
const VERSION = "0.4.7";
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
.mk .tip { position:absolute; bottom:38px; left:50%; transform:translateX(-50%); white-space:nowrap; background: rgba(28,28,28,.92); color:#fff; font-size:12px; padding:4px 8px; border-radius:6px; opacity:0; pointer-events:none; transition: opacity .12s; }
.mk:hover .tip, .mk.sel .tip, .names-always .mk .tip { opacity:1; }
.names-off .mk:not(:hover):not(.sel) .tip { opacity:0; }
.mk:hover, .mk.sel { z-index: 5; }
.mk .count { position:absolute; top:0; right:0; min-width:18px; height:18px; border-radius:9px; background: var(--df-primary); color:#fff; font-size:11px; font-weight:500; display:flex; align-items:center; justify-content:center; border:2px solid var(--df-card); }
.mk.flash::after { content:''; position:absolute; left:50%; top:50%; width:28px; height:28px; margin:-14px 0 0 -14px; border-radius:50%; animation: pulse 1.2s ease-out 4; pointer-events:none; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--df-primary) 60%, transparent); } 100% { box-shadow: 0 0 0 22px transparent; } }
.mk.dragging { cursor: grabbing; z-index: 6; pointer-events:none; }
.mk .count.bondc { background: var(--df-ok); }
.mk.bond .ring { box-shadow: 0 0 0 2px var(--df-card), 0 0 0 4px var(--c1); }
.mk.bondhint { z-index: 7; }
.mk.bondhint .ring { transform: scale(1.55); transition: transform .18s; box-shadow: 0 0 0 4px var(--df-card), 0 0 0 8px var(--df-ok); }
.mk.bondhint .tip { opacity:1; background: var(--df-ok); }
.pin { position:absolute; transform: translate(-7px, -100%); border-bottom-left-radius: 2px !important; display:flex; align-items:center; gap:2px; font-size:12px; font-weight:500; color: var(--df-primary); background: var(--df-card); border:1.5px solid var(--df-primary); border-radius:12px; padding:3px 8px 3px 4px; white-space:nowrap; pointer-events:auto; cursor:grab; touch-action:none; box-shadow:0 1px 4px rgba(0,0,0,.2); }
.pin svg { width:14px; height:14px; }
#dragghost { position:fixed; left:-1000px; top:-1000px; pointer-events:none; }
.pin.dragpin { position:static; transform:none; display:inline-flex; border-radius: 12px 12px 12px 2px; }
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
.side { flex: 0 0 360px; min-width: 0; min-height:0; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; }
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
.pop { position:absolute; left:12px; right:12px; top:100%; z-index:20; background: var(--df-card); border:1px solid var(--df-div); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.18); padding:12px; display:flex; flex-direction:column; gap:10px; }
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
.list { flex:1; min-height:0; overflow-y:auto; border-top:1px solid var(--df-div); }
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
.details { margin: 10px 12px 0; padding: 12px; border-radius:12px; border:1px solid color-mix(in srgb, var(--df-primary) 40%, transparent); background: color-mix(in srgb, var(--df-tint) 50%, var(--df-card)); display:flex; flex-direction:column; gap:10px; }
.details .top { display:flex; gap:10px; align-items:flex-start; }
.details .nm { font-size:15px; font-weight:500; }
.details .sub { font-size:12px; color: var(--df-sec); margin-top:2px; }
.details .acts { display:flex; flex-wrap:wrap; gap:6px; }
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
    this.work = plan ? { positions: clone(plan.positions) || {}, anchors: clone(plan.anchors) || {}, refs: clone(plan.refs) || [], hidden_rooms: clone(plan.hidden_rooms) || [], bonds: clone(plan.bonds) || {} } : null;
    this._undo = [];
    this._redo = [];
    Object.assign(this.s, { sel: null, placing: null, placingRoom: null, fan: null, m1: null, m2: null, mh: null, ask: false, z: 1, tx: 0, ty: 0, refSel: null, menu: null, layersOpen: false, imgFailed: null });
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
    if (!d.loose || d.physical) return true;
    return !!(this.work && this.work.positions[d.id]) || !!this.s.q.trim();
  }

  /** Devices that count (steps, rooms, guide): real devices, plus entities placed here. */
  _counted(d) {
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

  _roomsForPlan() {
    const f = this._scopeFloor();
    const counts = {};
    for (const d of this.devices) {
      if ((d.loose && !d.physical) || !d.area_id || this.skipped.has(d.id) || !this._inScope(d)) continue;
      counts[d.area_id] = (counts[d.area_id] || 0) + 1;
    }
    return this.areas
      .filter((a) => counts[a.area_id] && (!f || a.floor_id === f || !a.floor_id))
      .map((a) => ({ ...a, count: counts[a.area_id], pos: this.work ? this.work.anchors[a.area_id] : null, ignored: this._ignoredRooms().includes(a.area_id) }));
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
    if (s.type.length && !s.type.includes(d.group)) return false;
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
    if (s.type.length && !s.type.includes(d.group)) return false;
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
    return { positions: clone(this.work.positions), anchors: clone(this.work.anchors), refs: clone(this.work.refs), hidden_rooms: clone(this.work.hidden_rooms), bonds: clone(this.work.bonds || {}), skipped: [...this.skipped] };
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
    const body = { plan_id: plan.id, positions: this.work.positions, anchors: this.work.anchors, refs: this.work.refs, hidden_rooms: this.work.hidden_rooms, bonds };
    try {
      const res = await this._ws("plan/update", body);
      Object.assign(plan, { positions: res.positions, anchors: res.anchors, refs: res.refs, hidden_rooms: res.hidden_rooms, bonds: res.bonds || {} });
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
    const listEl = this.shadowRoot.querySelector(".list");
    const scroll = listEl ? listEl.scrollTop : 0;
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
    const list2 = this.shadowRoot.querySelector(".list");
    if (list2) list2.scrollTop = scroll;
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
        <button class="iconbtn" data-act="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" ${this._undo.length ? "" : "disabled"}>${SVG.undo}</button>
        <button class="iconbtn" data-act="redo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" ${this._redo.length ? "" : "disabled"}>${SVG.redo}</button>
        ${this._saveHtml()}${ready}${more}
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
    const guideLink = this.s.guide ? "" : `<button class="link" data-act="guide">Show guide</button>`;
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
      const tip = !rooms.length
        ? "None of your devices has an area yet. Give devices an area in HA, or skip this step and place devices by hand."
        : d2
          ? `All ${rooms.length} rooms are on the plan. You can still drag a pin to adjust it.`
          : `${pinned} of ${rooms.length} rooms on the plan. "Done" appears when all of them are placed.`;
      const acts = d2 || !rooms.length ? `<button class="btn ok" data-act="tool" data-tool="place">Done, place devices →</button>` : "";
      return this._guideBox(d2 ? "✓" : "2", d2, "Step 2 of 3 · Mark rooms", "Your rooms from HA are listed on the right. Drag each one onto the plan and drop it in the middle of that room, or click a room and then click on the plan. Auto-place uses them to put each device in the right room. Rooms that are not on this plan: hide them with the eye button, their devices leave the list.", tip, acts);
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
      <div class="acts">${acts}<button class="link" data-act="guide">Hide guide</button></div></div>`;
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
        ${this._canvasCtlHtml()}
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
    const layers = `<div class="ovctl layerctl"><button class="ovbtn ${s.layersOpen ? "open" : ""}" data-act="layers" aria-label="Layers" title="Layers" aria-expanded="${s.layersOpen}">${SVG.layers}</button>
      ${s.layersOpen ? `<div class="layerpop" role="dialog" aria-label="Layers"><h4>Show on the plan</h4>${row("refs", "Measurements")}${row("rooms", "Rooms")}${row("devices", "Devices")}${s.tool === "place" ? row("others", "Devices outside the filter") : ""}</div>` : ""}</div>`;
    const zoom = `<div class="ovctl zoomctl"><div class="zoom"><button data-act="zoomout" aria-label="Zoom out">−</button><span id="zl">${Math.round(s.z * 100)}%</span><button data-act="zoomin" aria-label="Zoom in">+</button><button class="fit" data-act="zoomfit">Fit</button></div></div>`;
    return scale + layers + zoom;
  }

  _svgOverlay() {
    const parts = [];
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
    // Device with a separate box / radio spot: dashed line when either is selected.
    const sel = this.s.sel && this.work && this.work.positions[this.s.sel];
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
          <span class="ring">${this._iconHtml(front.d)}</span><span class="count">${c.m.length}</span><span class="tip">${esc(names)}</span></button>`);
      }
      // separate box / radio spots (#23): small square, draggable in the Place step
      for (const [id, pos] of Object.entries(this.work.positions)) {
        const d = this.byId.get(id);
        if (!pos.box || !d || this.skipped.has(id)) continue;
        parts.push(`<button class="bx ${fade} ${s.sel === id ? "sel" : ""}" data-box="${esc(id)}" data-x="${pos.box.x}" data-y="${pos.box.y}" aria-label="${esc(`Box / radio of ${d.name}`)}" ${fade ? 'tabindex="-1"' : ""}><span class="tip">${esc(`${d.name} · box / radio`)}</span></button>`);
      }
      // devices that no longer exist in HA
      for (const id of this._missingIds()) {
        const pos = this.work.positions[id];
        parts.push(`<button class="mk missing ${fade} ${s.sel === id ? "sel" : ""}" data-mk="${esc(id)}" data-x="${pos.x}" data-y="${pos.y}" style="--c1:var(--df-sec)" aria-label="Device removed from Home Assistant"><span class="ring">?</span><span class="tip">Device removed from Home Assistant</span></button>`);
      }
    }
    // placing ghost
    if ((s.placing || s.placingRoom || s.placingBox) && s.hover) {
      const d = (s.placing || s.placingBox) && this.byId.get(s.placing || s.placingBox);
      const name = d ? (s.placingBox ? `${d.name} · box / radio` : d.name) : (this.areaById.get(s.placingRoom) || {}).name;
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
    const cls = ["mk", fade, v.c2 ? "two" : "", pos && pos.approx ? "approx" : "", selHere ? "sel" : "", members.includes(s.flash) ? "flash" : "", b ? "bond" : ""].join(" ");
    const names = members.map((m) => (this.byId.get(m) || {}).name || m).join(" + ");
    return `<button class="${cls}" data-mk="${esc(d.id)}" data-x="${x}" data-y="${y}" style="--c1:${v.c1};--c2:${v.c2 || "transparent"}" aria-label="${esc(b ? `Bonded: ${names}` : d.name)}" ${fade ? 'tabindex="-1"' : ""}>
      <span class="ring">${this._iconHtml(d)}</span>${b ? `<span class="count bondc">×${members.length}</span>` : ""}<span class="tip">${esc(b ? `Bonded · ${names}` : d.name)}${pos && pos.approx ? " · approx" : ""}</span></button>`;
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

  /** Position stage + overlay elements for the current zoom/pan (no re-render). */
  _layout() {
    if (!this._vp) return;
    const r = this._vp.getBoundingClientRect();
    this._vpW = r.width;
    this._vpH = r.height;
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
    const rooms = this._roomsForPlan();
    const left = rooms.filter((r) => !r.pos && !r.ignored).length;
    const rows = rooms
      .slice()
      .sort((a, b) => (a.pos || a.ignored ? 1 : 0) - (b.pos || b.ignored ? 1 : 0) || a.name.localeCompare(b.name))
      .map((r) => {
        const on = !!r.pos;
        if (r.ignored && !on) {
          return `<div class="row done hiddenrow"><span class="main" style="cursor:default"><span class="ico">${SVG.pin}</span><span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">hidden · its ${r.count} devices are out of the list</span></span><span class="pill grey">hidden</span></span>
            <button class="small" data-act="unignore" data-id="${esc(r.area_id)}" title="Show on this plan" aria-label="Show ${esc(r.name)} on this plan">${SVG.skip}</button></div>`;
        }
        const active = this.s.placingRoom === r.area_id;
        return `<div class="row ${on ? "done" : "todo"} ${active ? "sel" : ""}" draggable="true" data-room="${esc(r.area_id)}">
          <button class="main" data-act="pickroom" data-id="${esc(r.area_id)}"><span class="ico" style="color:${on ? "var(--df-primary)" : "var(--df-sec)"}">${SVG.pin}</span>
          <span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">${r.count} devices</span></span>
          <span class="pill ${on ? "ok" : ""}">${on ? "✓ on plan" : active ? "click on plan" : "drag to plan"}</span></button>
          ${on ? `<button class="small" data-act="unpin" data-id="${esc(r.area_id)}" title="Take the pin off the plan" aria-label="Take the pin off the plan">${SVG.close}</button>` : ""}
          <button class="small eyeon" data-act="ignore" data-id="${esc(r.area_id)}" title="Hide: not on this plan" aria-label="Hide ${esc(r.name)}: not on this plan">${SVG.eye}</button></div>`;
      })
      .join("");
    const scope = this._plan().floor_id && this._plan().kind === "floor" ? "on this floor" : "with devices";
    return `<aside class="side" aria-label="Rooms" data-droptext="Drop to take the pin off the plan"><div class="sidehead"><h2>Rooms ${scope} <span class="pill ${left ? "" : "ok"}">${left ? `${left} left` : "all placed"}</span></h2>
      <p>Drag each room onto the plan and drop it in the middle of that room. Or click a room, then click on the plan. Rooms that are not on this plan: hide them with the eye button.</p></div>
      <div class="list" style="margin-top:8px">${rows || `<p style="padding:14px;margin:0;font-size:13px;color:var(--df-sec)">No rooms with devices${this._scopeFloor() ? " on this floor" : ""}. Rooms come from HA areas.</p>`}</div></aside>`;
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

    const counts = (key, val) => scoped.filter((d) => statuses.get(d.id) !== "skipped" || s.status.includes("skipped")).filter((d) => (key === "conn" ? d.conns.includes(val) : d.group === val)).length;
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
        const items = scoped.filter((d) => statuses.get(d.id) !== "skipped" && statuses.get(d.id) !== "hiddenroom" && (key === "conn" ? d.conns.includes(val) : d.group === val));
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
    const hit = hitName ? `<span class="hit">matches: ${esc(hitName)}</span>` : "";
    const ent = d.loose ? `<span>${esc(d.entity_id)}</span>` : "";
    const parts = d.parts && d.parts.length ? `<span>+${d.parts.length} part${d.parts.length > 1 ? "s" : ""}</span>` : "";
    const meta = isNew + bat + area + parts + ent + hit;
    return `<div class="row ${done ? "done" : "todo"} ${s.sel === d.id || s.placing === d.id ? "sel" : ""}" draggable="${st === "skipped" ? "false" : "true"}" data-dev="${esc(d.id)}">
      <button class="main" data-act="pick" data-id="${esc(d.id)}">${this._avatarHtml(d)}
        <span class="rtxt"><span class="rname">${esc(d.name)}</span>${meta ? `<span class="rmeta">${meta}</span>` : ""}</span>${pill}</button>
      ${st === "placed" || st === "approx" ? `<button class="small" data-act="locate" data-id="${esc(d.id)}" title="Show on plan" aria-label="Show on plan">${SVG.locate}</button>` : ""}
      <button class="small" data-act="info" data-id="${esc(d.id)}" title="More info" aria-label="More info">${SVG.info}</button></div>`;
  }

  _detailsHtml() {
    const s = this.s;
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
    if (d.loose) {
      const acts = [];
      if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
      if (st === "unplaced") acts.push(`<button class="btn primary" data-act="placeit">Add to plan</button>`);
      acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
      if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc(d.entity_id)} · entity without a device</div></div>${close}</div>
        <div class="note">Placed on its own: the card shows this entity at this spot.${st === "unplaced" ? " Click on the plan to put it there, or drag it from the list." : ""}</div>
        <div class="acts">${acts.join("")}</div></div>`;
    }
    const badges = d.conns.map((c) => `<span class="badge" style="color:${(CONN[c] || CONN.other).color};background:color-mix(in srgb, ${(CONN[c] || CONN.other).color} 14%, transparent)">${(CONN[c] || CONN.other).label}</span>`).join(" ");
    const stLabel = { placed: "✓ Confirmed position", approx: "◌ Approximate position", unplaced: "Not on the plan yet", hiddenroom: "Its room is hidden on this plan", skipped: "Skipped · nothing changes in HA", elsewhere: `On ${(this._otherFloorPlan(d) || {}).name || "another floor"}` }[st];
    const acts = [];
    if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
    if (st === "unplaced" || st === "hiddenroom") acts.push(`<button class="btn primary" data-act="placeit">Place on plan</button>`);
    if (st === "elsewhere") acts.push(`<button class="btn primary" data-act="movehere">Move to this floor</button>`);
    if (st === "skipped") acts.push(`<button class="btn outline" data-act="unskip">Add to plan</button>`);
    acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
    acts.push(`<button class="btn" data-act="devpage">Device page${SVG.ext}</button>`);
    if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
    if (st !== "skipped") acts.push(`<button class="link" data-act="skipone">Skip this device</button>`);
    let stack = "";
    if (onPlan) {
      const cl = this._clusters().find((c) => c.m.some((m) => m.d.id === d.id));
      if (cl && cl.m.length > 1) {
        const others = cl.m.filter((m) => m.d.id !== d.id).map((m) => m.d.name).join(", ");
        stack = `<div class="note">Shares this spot with ${esc(others)}. <button class="link" data-act="front">Bring to front</button><button class="link" data-act="back">Send to back</button></div>`;
      }
    }
    const bnd = this._bondOf(d.id);
    const bondNote = bnd && onPlan ? `<div class="note">🔗 <b>Bonded</b> with ${esc(bnd[1].filter((m) => m !== d.id).map((m) => (this.byId.get(m) || {}).name || m).join(", "))}: one marker, switched on and off together on the card. <button class="link" data-act="unbond">Unbond</button></div>` : "";
    const bondHint = !bnd && onPlan && this._bondKind(d) ? `<div style="font-size:12px;color:var(--df-sec)">Tip: drag another ${this._bondKind(d) === "light" ? "light" : this._bondKind(d) === "cover" ? "cover" : "switch"} onto this one and hold to bond them.</div>` : "";
    const merged = d.merged.length ? `<div class="note">One dot for one device: <b>${esc(d.merged.join(", "))}</b> ${d.merged.length > 1 ? "are" : "is"} merged in automatically (connected via this device, no entities of its own).</div>` : "";
    // Parts (#28): printer + AMS, NAS + drives… one row, one marker.
    let parts = "";
    if (d.parts && d.parts.length) {
      parts = `<div class="note parts"><div><b>Includes ${d.parts.length} part${d.parts.length > 1 ? "s" : ""}</b> · they follow this device and their entities count for it</div>
        ${d.parts.map((p) => `<div>· ${esc(p.name)}${p.model ? ` <span style="color:var(--df-sec)">(${esc(p.model)})</span>` : ""}<button class="link" data-act="partown" data-id="${esc(p.id)}">Show as its own device</button></div>`).join("")}</div>`;
    } else if (d.part_override === "own") {
      parts = `<div class="note">Shown as its own device (you split it from its parent). <button class="link" data-act="partauto" data-id="${esc(d.id)}">Make it a part again</button></div>`;
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
    // Separate spot for the box / radio (#23), e.g. a wall switch driving a ceiling lamp.
    let box = "";
    if (onPlan) {
      const pos = this.work.positions[d.id];
      box = pos.box
        ? `<div class="note">▣ The box / radio has its own spot (Network and Health views use it). <button class="link" data-act="boxdel">Remove</button></div>`
        : s.placingBox === d.id
          ? `<div class="note">Click on the plan where the box / radio is. <button class="link" data-act="boxcancel">Cancel</button></div>`
          : `<button class="link" style="align-self:flex-start;padding:0" data-act="boxadd">📍 Box / radio is somewhere else</button>`;
    }
    // One click to clean up software-heavy integrations (NAS, routers, cloud).
    let skipInt = "";
    if (d.integration && st !== "skipped") {
      const same = this.devices.filter((x) => !x.loose && x.integration === d.integration && !this.skipped.has(x.id) && !(this.work && this.work.positions[x.id]));
      if (same.length > 1) skipInt = `<button class="link" style="align-self:flex-start;padding:0" data-act="skipint" data-int="${esc(d.integration)}">Skip all ${same.length} not on the plan from ${esc(this._intName(d.integration))}</button>`;
    }
    const hint = st === "unplaced" || st === "hiddenroom" ? `<div style="font-size:12px;color:var(--df-sec)">Click on the plan to put it there, drag it from the list, use Auto-place, or skip it if you don't want it on the plan.</div>` : "";
    return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
      <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc([d.area_name || "No area", d.manufacturer, d.model].filter(Boolean).join(" · "))}</div></div>
      ${close}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${badges}<span class="badge bat">${esc(stLabel)}</span></div>
      ${bondNote}${merged}${parts}${stack}${mainSel}${box}<div class="acts">${acts.join("")}</div>${skipInt}${bondHint}${hint}</div>`;
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
        <div class="acts"><button class="btn" data-act="closedlg">Keep editing</button></div>`;
    }
    return `<h2 class="okttl">${SVG.okcircle}Your ${esc(p.name)} plan is ready to use</h2>
      <div class="stat"><span><b>${placed}</b> device${placed === 1 ? "" : "s"} placed</span>${approx ? `<span><b>${approx}</b> approximate</span>` : ""}<span style="color:var(--df-sec)">${notYet} not placed yet</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="toadddash">Add to dashboard</button>${preview}</div>
      <div class="box">${haBox}</div>
      <p>${later}</p>
      <div class="acts"><button class="btn" data-act="closedlg">Keep editing</button></div>`;
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
    if (["colorby", "names", "groupby", "allfloors", "queue", "guidebox", "mainent", "onlymain", "setupchk", "setupauto", "formimg", "dashkey", "dashwhere", "dashview", "replacedev"].includes(act)) return;
    if (act === "modalbg") {
      if (e.target === el) this._closeDialog();
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
        s.layers = { ...s.layers, [el.dataset.key]: s.layers[el.dataset.key] === false };
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
        this._toast(act === "partown" ? "Shown as its own device" : "It's a part again: it follows its parent", false);
        break;
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
        this._change(() => {
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
    const ka = this._bondKind(this.byId.get(a));
    return !!ka && ka === this._bondKind(this.byId.get(b)) && !(this._bondOf(a) && this._bondOf(a) === this._bondOf(b));
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
    this.work.positions[id] = { x: tp.x, y: tp.y, ...(tp.approx ? { approx: true } : {}) };
  }

  _unbond(id) {
    const b = this._bondOf(id);
    if (!b) return;
    const bonds = this.work.bonds;
    bonds[b[0]] = b[1].filter((m) => m !== id);
    if (bonds[b[0]].length < 2) delete bonds[b[0]];
    const pos = this.work.positions[id];
    if (pos) Object.assign(pos, { x: clamp(pos.x + 3, 1, 99), y: clamp(pos.y + 3, 1, 99) });
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

  _placeAt(id, p, approx = false) {
    const d = this.byId.get(id);
    if (!approx) (this._fresh || (this._fresh = new Set())).add(id);
    this.work.positions[id] = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, ...(approx ? { approx: true } : {}) };
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
    if (!this._vp || !this._vp.contains(e.target) || e.button > 0) return;
    if (e.target.closest(".mbox") || e.target.closest(".refpop")) return;
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
    const start = { x: e.clientX, y: e.clientY };
    if (rh) this._gesture = { kind: "rh", i: Number(rh.dataset.rh), end: rh.dataset.end, start, moved: false, snap: this._snap() };
    else if (rl) this._gesture = { kind: "rl", i: Number(rl.dataset.refl), start, moved: false, snap: this._snap(), orig: clone(this.work.refs[Number(rl.dataset.refl)]), p0: this._pt(e) };
    else if (mh) this._gesture = { kind: "mh", which: mh.dataset.mh, start, moved: false };
    else if (pin) this._gesture = { kind: "pin", id: pin.dataset.pin, el: pin, start, moved: false, snap: this._snap() };
    else if (bx) this._gesture = { kind: "box", id: bx.dataset.box, el: bx, start, moved: false, snap: this._snap() };
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
    if (g.kind === "box") {
      const p = this._pt(e);
      this.work.positions[g.id].box = { x: p.x, y: p.y };
      g.el.dataset.x = p.x;
      g.el.dataset.y = p.y;
      this._layout();
      return;
    }
    if (g.kind === "mk") {
      // Hold over a marker of the same kind to bond (#40).
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
    if (g.kind === "mk" && g.moved && g.bondTo && !g.out) {
      const target = this._bondLeader(g.bondTo);
      this._restore(clone(g.snap));
      this._pushUndo(g.snap);
      this._bond(g.id, target);
      this._scheduleSave();
      const n = (this._bondOf(target) || [null, []])[1].length;
      this._render();
      this._toast(`Bonded: ${n} together, one marker · switched together on the card`);
      return;
    }
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
        s.placing = null;
        this._render();
      }
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
        s.fan = g.id;
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

  /** Track "held over another marker"; after a moment it shows Bond (#40). */
  _bondHover(g, cx, cy) {
    const el = this.shadowRoot.elementFromPoint ? this.shadowRoot.elementFromPoint(cx, cy) : null;
    const mk = el && el.closest ? el.closest("[data-mk]") : null;
    const tid = mk && mk.dataset.mk !== g.id ? mk.dataset.mk : null;
    const ok = tid && this._canBond(g.id, tid);
    if (!ok) {
      if (g.hoverT) this.shadowRoot.querySelectorAll(".mk.bondhint").forEach((x) => x.classList.remove("bondhint"));
      g.hoverT = null;
      g.bondTo = null;
      return;
    }
    if (g.hoverT !== tid) {
      g.hoverT = tid;
      g.hoverSince = Date.now();
      g.bondTo = null;
      clearTimeout(this._bondT);
      this._bondT = setTimeout(() => {
        if (g.hoverT === tid && (this._gesture === g || this._listHover === g)) {
          g.bondTo = tid;
          const t2 = this.shadowRoot.querySelector(`[data-mk="${CSS.escape(tid)}"]`);
          if (t2) {
            t2.classList.add("bondhint");
            const tip = t2.querySelector(".tip");
            if (tip) tip.textContent = "Drop to bond";
          }
        }
      }, 650);
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
      const id = s.placingBox;
      if (this.work.positions[id]) this._change(() => (this.work.positions[id].box = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
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
    if (s.sel || s.fan) {
      s.sel = null;
      s.fan = null;
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
        e.dataTransfer.setDragImage(el, 7, r.height);
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
    if (lh && lh.bondTo && st !== "elsewhere" && this._canBond(d.id, lh.bondTo)) {
      const target = this._bondLeader(lh.bondTo);
      this._change(() => this._bond(d.id, target));
      this._markSeen([d.id]);
      if (this.s.placing === d.id) this.s.placing = null;
      const n = (this._bondOf(target) || [null, []])[1].length;
      this._render();
      this._toast(`Bonded: ${n} together, one marker · switched together on the card`);
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
            devices: this._planRows().map((r) => ({ device_id: r.id, name: r.d ? r.d.name : null, ieee: r.d ? r.d.ieee : null, mac: r.d ? r.d.mac : null, area: r.d ? r.d.area_name : null, x: r.pos.x, y: r.pos.y, approx: !!r.pos.approx, z: r.pos.z || 0 })),
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
      let matched = 0;
      let missing = 0;
      for (const dv of P.devices || []) {
        let d = this.byId.get(dv.device_id);
        if (!d && dv.ieee) d = this.devices.find((x) => x.ieee === dv.ieee);
        if (!d && dv.mac) d = this.devices.find((x) => x.mac === dv.mac);
        if (!d && dv.name) d = this.devices.find((x) => x.name === dv.name);
        if (!d) {
          missing++;
          continue;
        }
        matched++;
        positions[d.id] = { x: dv.x, y: dv.y, ...(dv.approx ? { approx: true } : {}), ...(dv.z ? { z: dv.z } : {}) };
      }
      const areaFor = (a) => (this.areaById.get(a.area_id) ? a.area_id : (this.areas.find((x) => x.name === a.name) || {}).area_id);
      const anchors = {};
      for (const a of P.anchors || []) {
        const id = areaFor(a);
        if (id) anchors[id] = { x: a.x, y: a.y };
      }
      const hidden = (P.hidden_rooms || []).map(areaFor).filter(Boolean);
      const res = await this._ws("plan/update", { plan_id: plan.id, positions, anchors, refs: (P.refs || []).slice(0, 2), hidden_rooms: hidden });
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
