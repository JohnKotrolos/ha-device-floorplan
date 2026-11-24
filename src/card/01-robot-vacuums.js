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

