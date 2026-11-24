Object.assign(DeviceFloorplanPanel.prototype, {

  /** "Align with …": the reference floor faintly underneath, this floor's picture on top, drag it into place. */
  _alignDialog(plan) {
    const fe = plan.frame_eff || {};
    const b = fe.box;
    if (!b) return null;
    const x1 = b.x - (fe.l * b.w) / 100;
    const x2 = b.x + b.w + (fe.r * b.w) / 100;
    const y1 = b.y - (fe.t * b.h) / 100;
    const y2 = b.y + b.h + (fe.b * b.h) / 100;
    // The stage leaves room to move the picture around.
    const padX = (x2 - x1) * 0.15;
    const padY = (y2 - y1) * 0.15;
    return { type: "align", plan: plan.id, ref: fe.ref, x: b.x, y: b.y, w: b.w, h: b.h, o: { x1: x1 - padX, x2: x2 + padX, y1: y1 - padY, y2: y2 + padY }, aspect: fe.aspect * ((x2 - x1 + 2 * padX) / (x2 - x1)) / ((y2 - y1 + 2 * padY) / (y2 - y1)) };
  },

  _alignHtml(d, wrap) {
    const p = this.plans.find((x) => x.id === d.plan);
    const ref = this.plans.find((x) => x.id === d.ref);
    if (!p || !ref) return "";
    const W = d.o.x2 - d.o.x1;
    const H = d.o.y2 - d.o.y1;
    const rect = (x, y, w, h) => `left:${((x - d.o.x1) / W) * 100}%;top:${((y - d.o.y1) / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%`;
    return wrap(`<h2>Align ${esc(p.name)} with ${esc(ref.name)}</h2>
      <p style="margin:0 0 8px;color:var(--df-sec);font-size:13px">${esc(ref.name)} is shown faintly underneath. Drag ${esc(p.name)} until the stairs or the outer walls sit on top of each other. ${this._measuredPlan(p) && this._measuredPlan(ref) ? "Both floors are measured, so one metre is equally long on both." : "Measure both floors to match their scale exactly."}</p>
      <div class="frstage alstage" id="alstage" style="--ar:${d.aspect}">
        <img class="alref" src="${esc(this._imgSrc(ref) || "")}" alt="" style="${rect(0, 0, 100, 100)}" draggable="false">
        <img class="alimg" data-alimg="1" src="${esc(this._imgSrc(p) || "")}" alt="" style="${rect(d.x, d.y, d.w, d.h)}" draggable="false">
      </div>
      <div class="frvals"><span>Drag the picture · arrow keys move it a little</span><button class="link" data-act="alturn" data-q="3" title="Turn this floor a quarter to the left, with everything placed on it">⟲ 90°</button><button class="link" data-act="alturn" data-q="1" title="Turn this floor a quarter to the right, with everything placed on it">⟳ 90°</button><button class="link" data-act="alcentre">Centre</button></div>
      <div class="acts"><button class="btn" data-act="closedlg">Not now</button><button class="btn primary" data-act="alsave">Save</button></div>`, 820);
  },

  // -------------------------------------------------------------- 0.10: robot vacuums
  _rbVacuums() {
    return Object.keys((this._hass && this._hass.states) || {}).filter((e) => e.startsWith("vacuum.")).sort();
  },

  /** Map entities: anything reporting a robot position or map calibration; the robot's own first. */
  _rbSources(eid) {
    const obj = String(eid || "").split(".")[1] || "";
    const list = Object.values(this._hass.states).filter((st) => /^(camera|image|sensor|vacuum)\./.test(st.entity_id) && st.attributes && (st.attributes.vacuum_position || st.attributes.robot_position || st.attributes.calibration_points)).map((st) => st.entity_id);
    // The robot's own device first (Valetudo's map sensor sits there), then by name.
    const ents = this._hass.entities || {};
    const dev = (e) => (ents[e] || {}).device_id;
    const mine = (e) => Number(!!dev(eid) && dev(e) === dev(eid));
    return list.sort((a, b) => mine(b) - mine(a) || Number(b.includes(obj)) - Number(a.includes(obj)) || a.localeCompare(b));
  },

  /** Opacity of the robot's map picture in the dialog (%), saved with the robot: map pictures can be full colour. */
  _rbPicOp(d) {
    return Math.max(0, Math.min(100, Number((d || this.s.dialog || {}).op ?? 40)));
  },

  /** How often rooms should be cleaned (plan-wide, per room): rooms turn amber in Cleaning when due, and the plan sensor lists them. */
  _rbPaceHtml(d) {
    const w = this.work || {};
    const hidden = new Set(w.hidden_rooms || []);
    const rooms = Object.keys(w.shapes || {}).filter((a) => !hidden.has(a) && (w.shapes[a] || []).length >= 3);
    const opts = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30];
    const sel = (id, v, withDef) => `<select data-rbpace="${esc(id)}">${withDef ? `<option value="" ${v == null ? "selected" : ""}>As the others</option>` : ""}${opts.map((n) => `<option value="${n}" ${Number(v) === n ? "selected" : ""}>Every ${n === 1 ? "day" : `${n} days`}</option>`).join("")}<option value="0" ${v != null && Number(v) === 0 ? "selected" : ""}>Never due</option></select>`;
    return `<details class="rbpace"><summary>How often to clean (rooms turn amber when due)</summary>
      <div class="rbprow"><span>All rooms</span>${sel("*", d.paceDef, false)}</div>
      ${rooms.map((a) => `<div class="rbprow"><span>${esc(this._areaName(a))}</span>${sel(a, d.pace[a], true)}</div>`).join("")}</details>`;
  },

  _rbRatio() {
    const p = this._plan();
    return p && p.width && p.height ? p.width / p.height : 1.6;
  },

  _rbData(d) {
    return window.__dfcRobot.read(this._hass, d.eid, { source: d.source });
  },

  _rbName(e) {
    return ((this._hass.states[e] || {}).attributes || {}).friendly_name || e;
  },

  /** The dialog for one robot on this plan (eid), or for choosing one (no eid: nothing is picked for the user). */
  _robotDialog(plan, eid) {
    eid = eid || Object.keys(plan.robots || {})[0] || null;
    const cfg = (eid && (plan.robots || {})[eid]) || {};
    const d = { type: "robot", plan: plan.id, eid, source: cfg.source || (eid ? this._rbSources(eid)[0] : "") || "", m: cfg.m ? [...cfg.m] : null, seg: null, msg: cfg.m ? "" : eid ? "Reading the robot…" : "", op: Number.isFinite(cfg.op) ? cfg.op : 40, pace: { ...(plan.pace || {}) }, paceDef: plan.pace_default ?? 7 };
    if (!eid) return d;
    this._rbPic(d);
    const done = () => {
      if (this.s.dialog !== d) return;
      if (!d.m) this._rbAuto(d);
      this._render();
    };
    // HA 2026.3+: the robot's rooms mapped to areas ("Map vacuum segments to areas") make auto-align exact.
    this._hass.callWS({ type: "config/entity_registry/get", entity_id: eid }).then((e) => {
      const map = (((e && e.options) || {}).vacuum || {}).area_mapping || {};
      const seg = {};
      for (const [area, segs] of Object.entries(map)) for (const sg of segs || []) seg[String(sg)] = area;
      d.seg = Object.keys(seg).length ? seg : null;
      done();
    }).catch(done);
    return d;
  },

  /** The map picture under the rooms, when the map entity has one with calibration points. */
  _rbPic(d) {
    d.picW = 0;
    const data = this._rbData(d);
    if (!data.pic || data.calib.length < 3) return;
    const im = new Image();
    im.onload = () => {
      d.picW = im.naturalWidth;
      d.picH = im.naturalHeight;
      // A first guess without rooms: fit the whole map (picture included) into the plan.
      if (d.guess && !this._rbData(d).rooms.length) this._rbFit(d);
      d.guess = false;
      const draw = this.s.dialog === d && this.shadowRoot.getElementById("rbdraw");
      if (draw) draw.innerHTML = this._rbDraw(d, this._rbData(d));
    };
    im.src = data.pic;
  },

  /** Where a room is on this plan: the middle of the box around its shape (robots report rooms as boxes too), else its name. */
  _rbPlanPt(area) {
    const sh = ((this.work || {}).shapes || {})[area];
    if (sh && sh.length >= 3) {
      const xs = sh.map((q) => q[0]);
      const ys = sh.map((q) => q[1]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    const an = ((this.work || {}).anchors || {})[area];
    return an ? { x: an.x, y: an.y } : null;
  },

  /** Auto-align: the robot's rooms matched to this plan's rooms (HA's room mapping, else names), best fit.
   *  With 4+ rooms a plan drawn a bit squeezed is detected and allowed for. */
  _rbAuto(d) {
    const R = window.__dfcRobot;
    const data = this._rbData(d);
    const ratio = this._rbRatio();
    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9α-ω]/g, "");
    const nameOf = (a) => (this.areaById.get(a) || {}).name || a;
    const areas = [...new Set([...Object.keys((this.work || {}).anchors || {}), ...Object.keys((this.work || {}).shapes || {})])];
    const pairs = [];
    const used = new Set();
    for (const r of data.rooms) {
      let area = d.seg && d.seg[r.id];
      const n = norm(r.name);
      if (!area && n) area = areas.find((a) => norm(nameOf(a)) === n) || (n.length >= 4 ? areas.find((a) => { const m = norm(nameOf(a)); return m.length >= 4 && (m.includes(n) || n.includes(m)); }) : null);
      if (!area || used.has(area) || !areas.includes(area)) continue;
      const pp = this._rbPlanPt(area);
      if (!pp) continue;
      used.add(area);
      pairs.push({ r: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, p: pp, name: nameOf(area) });
    }
    const fit = R.fit2(pairs, ratio);
    if (fit) {
      d.m = fit.m;
      const k = fit.sx / fit.sy;
      const sq = Math.abs(k - 1) > 0.015 ? ` Your plan is drawn ${Math.round(Math.abs(1 - k) * 100)}% ${k < 1 ? "narrower" : "wider"} than the robot measures it: allowed for.` : "";
      d.msg = `Matched ${pairs.length} rooms (${pairs.map((q) => q.name).join(", ")}).${sq} Check it, then fine-tune by hand if needed.`;
      return;
    }
    if (!d.m) {
      d.m = this._rbBox(data, ratio);
      d.guess = !d.picW;
      if (d.m && d.picW && !data.rooms.length) this._rbFit(d);
    }
    if (!d.m) d.msg = "No position or rooms from this map entity yet. Choose another map, or wait until the robot reports one.";
    else if (!data.rooms.length) d.msg = "This map has no rooms: drag it into place, then stretch and turn it.";
    else d.msg = `Couldn't match enough rooms (${pairs.length} found, 2 needed). ${d.seg ? "" : "Map the robot's rooms to areas in its settings (Map vacuum segments to areas), or "}line it up by hand.`;
  },

  /** First guess without matches: everything the robot knows, fitted into the plan. */
  /** Everything of the robot's map, in robot units: rooms, path, dock, robot and the map picture's corners. */
  _rbPts(d, data) {
    return [...data.rooms.flatMap((r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]), data.dock, data.pos, ...data.lines.flat(), ...this._rbPicPts(d, data)].filter(Boolean);
  },

  /** The map picture's corners in robot units (calibration points: robot units → picture px, inverted). */
  _rbPicPts(d, data) {
    if (!d || !d.picW || data.calib.length < 3) return [];
    const [q1, q2, q3] = data.calib;
    const det = (q2.r.x - q1.r.x) * (q3.r.y - q1.r.y) - (q3.r.x - q1.r.x) * (q2.r.y - q1.r.y);
    if (Math.abs(det) < 1e-9) return [];
    const solve = (k) => {
      const b2 = q2.p[k] - q1.p[k];
      const b3 = q3.p[k] - q1.p[k];
      const a = (b2 * (q3.r.y - q1.r.y) - b3 * (q2.r.y - q1.r.y)) / det;
      const b = ((q2.r.x - q1.r.x) * b3 - (q3.r.x - q1.r.x) * b2) / det;
      return [a, b, q1.p[k] - a * q1.r.x - b * q1.r.y];
    };
    const [a, b, c] = solve("x");
    const [e, f, g] = solve("y");
    const id = a * f - b * e;
    if (Math.abs(id) < 1e-12) return [];
    const inv = (u, v) => ({ x: (f * (u - c) - b * (v - g)) / id, y: (a * (v - g) - e * (u - c)) / id });
    return [inv(0, 0), inv(d.picW, 0), inv(d.picW, d.picH), inv(0, d.picH)];
  },

  /** Fit the robot's map into the plan as it is turned now (uniform size, centred): when it is far too big or small. */
  _rbFit(d) {
    const f = this._rbFrame(d, this._rbData(d));
    if (!f || !d.m) return;
    const w = f.x1 - f.x0;
    const h = f.y1 - f.y0;
    if (!(w > 0 || h > 0)) return;
    const k = Math.min(w > 0 ? 90 / w : Infinity, h > 0 ? 90 / h : Infinity);
    const cx = (f.x0 + f.x1) / 2;
    const cy = (f.y0 + f.y1) / 2;
    const m = d.m;
    d.m = [m[0] * k, m[1] * k, (m[2] - cx) * k + 50, m[3] * k, m[4] * k, (m[5] - cy) * k + 50];
  },

  _rbBox(data, ratio) {
    const pts = [...data.rooms.flatMap((r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }]), data.dock, data.pos, ...data.lines.flat()].filter(Boolean);
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Not turned; y counts upwards on most robot maps, unless its picture says otherwise (Valetudo: downwards).
    const c = data.calib;
    const fy = c.length >= 2 && Math.abs(c[1].r.y - c[0].r.y) + Math.abs(c[2] ? c[2].r.y - c[0].r.y : 0) > 0 ? (Math.sign(((c[2] || c[1]).p.y - c[0].p.y) * ((c[2] || c[1]).r.y - c[0].r.y)) || -1) : -1;
    const k = x1 - x0 < 1e-6 && y1 - y0 < 1e-6 ? 0.01 : Math.min(x1 - x0 > 1e-6 ? 80 / (x1 - x0) : Infinity, y1 - y0 > 1e-6 ? 80 / ((y1 - y0) * ratio) : Infinity);
    const ky = fy * k * ratio;
    return [k, 0, 50 - (k * (x0 + x1)) / 2, 0, ky, 50 - (ky * (y0 + y1)) / 2];
  },

  /** The robot's map as drawn now: the box around it on the plan (in %), for the handles. */
  _rbFrame(d, data) {
    const all = this._rbPts(d, data);
    if (!all.length || !d.m) return null;
    const q = all.map((p) => window.__dfcRobot.apply(d.m, p));
    const xs = q.map((p) => p.x);
    const ys = q.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  },

  /** Turn or mirror the robot's map around its middle (in real proportions, not % of the image). */
  _rbOp(d, op, val) {
    if (!d.m) return;
    if (op === "fit") return this._rbFit(d);
    const ratio = this._rbRatio();
    const f = this._rbFrame(d, this._rbData(d)) || { x0: 50, y0: 50, x1: 50, y1: 50 };
    const c = [((f.x0 + f.x1) / 2) * ratio, (f.y0 + f.y1) / 2];
    const M = [d.m[0] * ratio, d.m[1] * ratio, d.m[2] * ratio, d.m[3], d.m[4], d.m[5]];
    const t = (val * Math.PI) / 180;
    const L = op === "rot" ? [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)] : [-1, 0, 0, 1];
    const ap = (u, v) => [L[0] * u + L[1] * v, L[2] * u + L[3] * v];
    const [a0, a3] = ap(M[0], M[3]);
    const [a1, a4] = ap(M[1], M[4]);
    const [tx, ty] = ap(M[2] - c[0], M[5] - c[1]);
    d.m = [a0 / ratio, a1 / ratio, (tx + c[0]) / ratio, a3, a4, ty + c[1]];
  },

  /** Rooms, path, dock and robot of the map, drawn over the plan with the current fit, plus the frame's handles. */
  _rbDraw(d, data) {
    if (!d.m) return "";
    const A = (p) => window.__dfcRobot.apply(d.m, p);
    const f = (v) => v.toFixed(2);
    let img = "";
    if (d.picW && data.calib.length >= 3) {
      // Picture px → robot units (inverse of the calibration), then robot → plan %.
      const [q1, q2, q3] = data.calib;
      const det = (q2.r.x - q1.r.x) * (q3.r.y - q1.r.y) - (q3.r.x - q1.r.x) * (q2.r.y - q1.r.y);
      const solve = (k) => {
        const b2 = q2.p[k] - q1.p[k];
        const b3 = q3.p[k] - q1.p[k];
        const a = (b2 * (q3.r.y - q1.r.y) - b3 * (q2.r.y - q1.r.y)) / det;
        const b = ((q2.r.x - q1.r.x) * b3 - (q3.r.x - q1.r.x) * b2) / det;
        return [a, b, q1.p[k] - a * q1.r.x - b * q1.r.y];
      };
      if (Math.abs(det) > 1e-9) {
        const [c0, c1, c2] = solve("x");
        const [c3, c4, c5] = solve("y");
        const id = c0 * c4 - c1 * c3;
        if (Math.abs(id) > 1e-12) {
          const i0 = c4 / id;
          const i1 = -c1 / id;
          const i3 = -c3 / id;
          const i4 = c0 / id;
          const i2 = -(i0 * c2 + i1 * c5);
          const i5 = -(i3 * c2 + i4 * c5);
          const m = d.m;
          const T = [m[0] * i0 + m[1] * i3, m[0] * i1 + m[1] * i4, m[0] * i2 + m[1] * i5 + m[2], m[3] * i0 + m[4] * i3, m[3] * i1 + m[4] * i4, m[3] * i2 + m[4] * i5 + m[5]];
          img = `<image href="${esc(data.pic)}" width="${d.picW}" height="${d.picH}" preserveAspectRatio="none" opacity="${this._rbPicOp(d) / 100}" transform="matrix(${T[0]} ${T[3]} ${T[1]} ${T[4]} ${T[2]} ${T[5]})"></image>`;
        }
      }
    }
    let svg = "";
    let html = "";
    for (const r of data.rooms) {
      const c = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([x, y]) => A({ x, y }));
      svg += `<polygon points="${c.map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}"></polygon>`;
      const m = A({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
      // The robot's room number too: it is what "Map vacuum segments to areas" lists.
      const nm = r.name && r.name !== r.id ? `${r.name} · ${r.id}` : `Room ${r.id}`;
      html += `<span class="rbname" style="left:${f(m.x)}%;top:${f(m.y)}%">${esc(nm)}</span>`;
    }
    for (const line of data.lines) {
      const step = Math.max(1, Math.ceil(line.length / 800));
      svg += `<polyline points="${line.filter((_p, i) => i % step === 0).map(A).map((q) => `${f(q.x)},${f(q.y)}`).join(" ")}"></polyline>`;
    }
    if (data.dock) {
      const q = A(data.dock);
      html += `<span class="rbdot dock" style="left:${f(q.x)}%;top:${f(q.y)}%" title="Dock">⚡</span>`;
    }
    if (data.pos) {
      const q = A(data.pos);
      html += `<span class="rbdot bot" style="left:${f(q.x)}%;top:${f(q.y)}%" title="Robot"></span>`;
    }
    const fr = this._rbFrame(d, data);
    if (fr) {
      const mx = (fr.x0 + fr.x1) / 2;
      const my = (fr.y0 + fr.y1) / 2;
      html += `<div class="rbframe" style="left:${f(fr.x0)}%;top:${f(fr.y0)}%;width:${f(fr.x1 - fr.x0)}%;height:${f(fr.y1 - fr.y0)}%"></div>`;
      const hs = { nw: [fr.x0, fr.y0], n: [mx, fr.y0], ne: [fr.x1, fr.y0], e: [fr.x1, my], se: [fr.x1, fr.y1], s: [mx, fr.y1], sw: [fr.x0, fr.y1], w: [fr.x0, my] };
      for (const [h, [x, y]] of Object.entries(hs)) html += `<i class="rbh ${h.length === 2 ? "c" : "e"}" data-h="${h}" style="left:${f(x)}%;top:${f(y)}%;cursor:${h}-resize" title="${h.length === 2 ? "Drag to resize" : "Drag to stretch or squeeze"}"></i>`;
    }
    return `<svg class="rbsvg" viewBox="0 0 100 100" preserveAspectRatio="none">${img}${svg}</svg>${html}`;
  },

  _robotHtml(d, wrap) {
    const p = this._plan();
    if (!p) return "";
    const robots = p.robots || {};
    const onPlan = Object.keys(robots);
    if (d.eid && !onPlan.includes(d.eid)) onPlan.push(d.eid);
    const others = this._rbVacuums().filter((e) => !onPlan.includes(e));
    const chips = onPlan.map((e) => `<button class="rbchip ${e === d.eid ? "on" : ""}" data-act="rbpick" data-eid="${esc(e)}">${SVG.robot}<span>${esc(this._rbName(e))}<small>${robots[e] && robots[e].m ? "Aligned" : "Not saved yet"}</small></span></button>`).join("");
    const add = others.length ? `<select id="rbadd" class="rbadd"><option value="">+ Add a robot…</option>${others.map((e) => `<option value="${esc(e)}">${esc(this._rbName(e))}</option>`).join("")}</select>` : "";
    const head = `<h2>Robot vacuums on ${esc(p.name)}</h2>
      <p class="rbp">The card shows each robot where it really is while it cleans, with its path. This needs a map integration that reports the robot's position: Xiaomi Cloud Map Extractor, Dreame Vacuum, Roborock Custom Map, Valetudo (MQTT), AnyVac…</p>
      <div class="rbbar">${chips}${add}</div>`;
    if (!d.eid) {
      const none = this._rbVacuums().length ? "No robot on this plan yet. Add one to line its map up with your plan." : "There is no robot vacuum in Home Assistant.";
      return wrap(`${head}<p class="rbempty">${onPlan.length ? "Choose a robot above." : none}</p><div class="acts"><button class="btn" data-act="closedlg">Close</button></div>`, 880);
    }
    const data = this._rbData(d);
    const srcs = this._rbSources(d.eid);
    if (d.source && !srcs.includes(d.source)) srcs.unshift(d.source);
    const btn = (op, v, label, title) => `<button class="btn" data-act="rbop" data-op="${op}" data-v="${v}" title="${title}" ${d.m ? "" : "disabled"}>${label}</button>`;
    return wrap(`${head}
      <div class="rbrow"><label class="f">Map of ${esc(this._rbName(d.eid))}<select id="rbsrc">${srcs.length ? srcs.map((e) => `<option value="${esc(e)}" ${e === d.source ? "selected" : ""}>${esc(this._rbName(e))}</option>`).join("") : `<option value="">No map entity found</option>`}</select></label></div>
      <p class="rbp">Line the robot's map (blue) up with your plan. <b>Auto-align</b> does it for you when the robot's rooms match yours. To do it by hand, drag the map into place, drag the sides of its frame to stretch or squeeze it, drag a corner to resize it, and use the buttons to turn or mirror it. <b>The robot's own map is not changed:</b> this only tells the card how to place the robot on your plan.</p>
      <div class="frstage rbstage" id="rbstage" style="--ar:${this._rbRatio()}"><img src="${esc(this._imgSrc(p) || "")}" alt="" style="left:0;top:0;width:100%;height:100%" draggable="false"><div id="rbdraw">${this._rbDraw(d, data)}</div></div>
      <div class="frvals"><span>${esc(d.msg || "")}</span></div>
      ${!d.source ? `<p class="rbp">No map: the robot can still be saved. Place it on the plan in the Editor; the card shows it there, and its rooms count as cleaned when you start them from the card (vacuum.clean_area).</p>` : !data.dock ? `<p class="rbp">The map shows no dock: place the robot on the plan in the Editor, and that spot is its dock.</p>` : ""}
      <div class="rbtools"><button class="btn" data-act="rbauto" ${data.rooms.length ? "" : "disabled"}>Auto-align from rooms</button>${data.pic && data.calib.length >= 3 ? `<label class="rbpic" title="The robot's own map picture under the blue rooms">Map picture<input type="range" id="rbpicop" min="0" max="100" step="5" value="${this._rbPicOp(d)}"></label>` : ""}<span class="rbgap"></span>
        ${btn("fit", 0, "⤢ Fit to plan", "Make the whole map fit inside your plan")}${btn("rot", -90, "⟲ 90°", "Turn left")}${btn("rot", -1, "⟲ 1°", "Turn a little left")}${btn("rot", 1, "⟳ 1°", "Turn a little right")}${btn("rot", 90, "⟳ 90°", "Turn right")}${btn("flip", 0, "⇋ Mirror", "Mirror")}</div>
      ${this._rbPaceHtml(d)}
      <div class="acts">${robots[d.eid] ? `<button class="btn danger" data-act="rbdel" style="margin-right:auto">Remove from plan</button>` : ""}<button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" data-act="rbsave">Save</button></div>`, 880);
  },

  /** 0.8.2: "Frame the plan" (after a new image, or from the plan's ⋮ menu). Values are % of the image per side:
   *  + space around the plan, − trimmed margin. The image sits in the middle 60 % of the stage. */
  _frameDialog(plan) {
    const f = plan.frame || {};
    const v = (k) => Number(f[k]) || 0;
    return { type: "frame", t: v("t"), r: v("r"), b: v("b"), l: v("l"), linked: v("t") === v("r") && v("r") === v("b") && v("b") === v("l") };
  },

  _frameGeom(d) {
    const k = 0.6;
    return { x1: 20 - d.l * k, x2: 80 + d.r * k, y1: 20 - d.t * k, y2: 80 + d.b * k };
  },

  _frameHtml(d, wrap) {
    const p = this._plan();
    const ratio = p && p.width && p.height ? p.width / p.height : 1.6;
    const g = this._frameGeom(d);
    const val = (k) => `${d[k] > 0 ? "+" : ""}${Math.round(d[k])} %`;
    return wrap(`<h2>Frame the plan</h2>
      <p style="margin:0 0 8px;color:var(--df-sec);font-size:13px">Drag the dashed lines: <b>outwards</b> adds space around the plan (room for labels and buttons), <b>inwards</b> trims empty margin. Markers and Rooms never move. Every dashboard card uses this frame unless it sets its own.</p>
      <div class="frstage" id="frstage" style="--ar:${ratio}">
        <img src="${esc(this._imgSrc(p) || "")}" alt="" style="left:20%;top:20%;width:60%;height:60%" draggable="false">
        <div class="frbox" style="left:${g.x1}%;top:${g.y1}%;width:${g.x2 - g.x1}%;height:${g.y2 - g.y1}%"></div>
        <div class="frl v" data-frl="l" style="left:${g.x1}%" title="Left"></div><div class="frl v" data-frl="r" style="left:${g.x2}%" title="Right"></div>
        <div class="frl h" data-frl="t" style="top:${g.y1}%" title="Top"></div><div class="frl h" data-frl="b" style="top:${g.y2}%" title="Bottom"></div>
      </div>
      <div class="frvals"><label><input type="checkbox" data-act="frlink" ${d.linked ? "checked" : ""}> Same on all four sides</label>
        <span id="frv">Top ${val("t")} · Right ${val("r")} · Bottom ${val("b")} · Left ${val("l")}</span><button class="link" data-act="frreset">Reset</button></div>
      <div class="acts"><button class="btn" data-act="closedlg">Not now</button><button class="btn primary" data-act="frsave">Save</button></div>`, 760);
  },

  _frDown(e) {
    if (e.target.closest && e.target.closest(".dzctl")) return; // the zoom buttons are no drag
    const rs = e.target.closest && e.target.closest("#rbstage");
    if (rs && this.s.dialog && this.s.dialog.type === "robot" && this.s.dialog.m) {
      // 0.10: drag the robot's map over the plan; its frame's sides stretch / squeeze, its corners resize.
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = this.s.dialog;
      const r = this._dzRect(rs);
      const draw = rs.querySelector("#rbdraw");
      const data = this._rbData(d);
      const h = (e.target.dataset && e.target.dataset.h) || "";
      const fr = this._rbFrame(d, data);
      const m0 = [...d.m];
      const [sx0, sy0] = [e.clientX, e.clientY];
      const move = (ev) => {
        if (this._dzPinch) return;
        const dx = ((ev.clientX - sx0) / r.width) * 100;
        const dy = ((ev.clientY - sy0) / r.height) * 100;
        if (!h || !fr) {
          d.m = [m0[0], m0[1], m0[2] + dx, m0[3], m0[4], m0[5] + dy];
        } else {
          let [ax, ay, fx, fy] = [0, 0, 1, 1];
          const w = fr.x1 - fr.x0 || 1;
          const hh = fr.y1 - fr.y0 || 1;
          if (h.includes("e")) [ax, fx] = [fr.x0, (w + dx) / w];
          if (h.includes("w")) [ax, fx] = [fr.x1, (w - dx) / w];
          if (h.includes("s")) [ay, fy] = [fr.y0, (hh + dy) / hh];
          if (h.includes("n")) [ay, fy] = [fr.y1, (hh - dy) / hh];
          if (h.length === 2) fx = fy = Math.abs(fx - 1) > Math.abs(fy - 1) ? fx : fy;
          fx = Math.max(0.05, fx);
          fy = Math.max(0.05, fy);
          d.m = [m0[0] * fx, m0[1] * fx, ax + (m0[2] - ax) * fx, m0[3] * fy, m0[4] * fy, ay + (m0[5] - ay) * fy];
        }
        draw.innerHTML = this._rbDraw(d, data);
      };
      const up = () => {
        this._frUp = Date.now();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    const al = e.target.closest && e.target.closest("[data-alimg]");
    if (al && this.s.dialog && this.s.dialog.type === "align") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = this.s.dialog;
      const stage = this.shadowRoot.getElementById("alstage");
      const r = this._dzRect(stage);
      const sx = e.clientX;
      const sy = e.clientY;
      const x0 = d.x;
      const y0 = d.y;
      const W = d.o.x2 - d.o.x1;
      const H = d.o.y2 - d.o.y1;
      const move = (ev) => {
        if (this._dzPinch) return;
        d.x = x0 + ((ev.clientX - sx) / r.width) * W;
        d.y = y0 + ((ev.clientY - sy) / r.height) * H;
        al.style.left = `${((d.x - d.o.x1) / W) * 100}%`;
        al.style.top = `${((d.y - d.o.y1) / H) * 100}%`;
      };
      const up = () => {
        this._frUp = Date.now();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    const line = e.target.closest && e.target.closest("[data-frl]");
    const stage = line && this.shadowRoot.getElementById("frstage");
    const d = this.s.dialog;
    if (!line || !stage || !d || d.type !== "frame") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const side = line.dataset.frl;
    const move = (ev) => {
      if (this._dzPinch) return;
      const r = this._dzRect(stage);
      const xs = ((ev.clientX - r.left) / r.width) * 100;
      const ys = ((ev.clientY - r.top) / r.height) * 100;
      const raw = side === "l" ? (20 - xs) / 0.6 : side === "r" ? (xs - 80) / 0.6 : side === "t" ? (20 - ys) / 0.6 : (ys - 80) / 0.6;
      const v = Math.round(Math.max(-45, Math.min(33, raw)));
      if (d.linked) d.t = d.r = d.b = d.l = v;
      else d[side] = v;
      // Only the lines move while dragging; no full redraw.
      const g = this._frameGeom(d);
      const q = (sel) => stage.querySelector(sel);
      q('[data-frl="l"]').style.left = `${g.x1}%`;
      q('[data-frl="r"]').style.left = `${g.x2}%`;
      q('[data-frl="t"]').style.top = `${g.y1}%`;
      q('[data-frl="b"]').style.top = `${g.y2}%`;
      Object.assign(q(".frbox").style, { left: `${g.x1}%`, top: `${g.y1}%`, width: `${g.x2 - g.x1}%`, height: `${g.y2 - g.y1}%` });
      const fv = this.shadowRoot.getElementById("frv");
      const val = (k) => `${d[k] > 0 ? "+" : ""}${d[k]} %`;
      if (fv) fv.textContent = `Top ${val("t")} · Right ${val("r")} · Bottom ${val("b")} · Left ${val("l")}`;
    };
    const up = () => {
      this._frUp = Date.now();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  },
});
