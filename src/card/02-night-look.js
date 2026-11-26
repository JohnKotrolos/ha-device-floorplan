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

