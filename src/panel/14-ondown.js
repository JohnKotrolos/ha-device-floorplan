Object.assign(DeviceFloorplanPanel.prototype, {

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
      this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this._zt() };
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
    const she = e.target.closest("[data-she]");
    if (she && !shc && !shp && s.shapeEdit && (this.work.shapes || {})[s.shapeEdit]) {
      e.preventDefault();
      const i = Number(she.dataset.she);
      this._gesture = { kind: "she", i, start, p0: this._pt(e), orig: clone(this.work.shapes[s.shapeEdit]), moved: false, snap: this._snap() };
      return;
    }
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
    // 0.7.3: press inside a room's shape (Mark rooms) and drag: the whole shape moves.
    if (!modal && s.tool === "rooms" && !mk && !cl && !pin && !phm && !e.target.closest("[data-shc],[data-shp],.shbox,button,input,select")) {
      const p = this._pt(e);
      const sh = this.work.shapes || {};
      const vis = s.layers.roomshapes !== false;
      const hit = s.shapeEdit && sh[s.shapeEdit] && ptInPoly(p.x, p.y, sh[s.shapeEdit]) ? s.shapeEdit : vis ? Object.keys(sh).find((k) => ptInPoly(p.x, p.y, sh[k])) : null;
      if (hit) {
        e.preventDefault();
        this._gesture = { kind: "shmove", aid: hit, start, p0: p, orig: clone(sh[hit]), moved: false, snap: this._snap() };
        try { this._vp.setPointerCapture(e.pointerId); } catch (_e) { /* fine */ }
        return;
      }
    }
    // 0.7.3: press on a bar (not its ends) and drag: the whole bar moves, its twins follow.
    if (!modal && s.tool === "place" && !mk && !cl && !pin && !phm && !lhd && !e.target.closest("[data-oh],[data-ah],[data-th],button,input,select")) {
      const p = this._pt(e);
      const W = (this._vpW || 800) * (s.z || 1), H = (this._vpH || 500) * (s.z || 1);
      let best = null;
      for (const [k, q] of Object.entries(this.work.positions)) {
        const o = q.opening;
        if (!o || o.x1 == null || !this._openingEnt(k)) continue;
        const ax = (o.x1 * W) / 100, ay = (o.y1 * H) / 100, bx = (o.x2 * W) / 100, by = (o.y2 * H) / 100, px = (p.x * W) / 100, py = (p.y * H) / 100;
        const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L));
        const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
        if (d < 9 && (!best || d < best.d)) best = { k, d };
      }
      if (best) {
        e.preventDefault();
        this._gesture = { kind: "obmove", id: best.k, start, p0: p, orig: { ...this.work.positions[best.k].opening }, moved: false, snap: this._snap() };
        try { this._vp.setPointerCapture(e.pointerId); } catch (_e) { /* fine */ }
        return;
      }
    }
    if (rh) this._gesture = { kind: "rh", i: Number(rh.dataset.rh), end: rh.dataset.end, start, moved: false, snap: this._snap() };
    else if (rl) this._gesture = { kind: "rl", i: Number(rl.dataset.refl), start, moved: false, snap: this._snap(), orig: clone(this.work.refs[Number(rl.dataset.refl)]), p0: this._pt(e) };
    else if (mh) this._gesture = { kind: "mh", which: mh.dataset.mh, start, moved: false };
    else if (pin) this._gesture = { kind: "pin", id: pin.dataset.pin, el: pin, start, moved: false, snap: this._snap() };
    else if (bx) this._gesture = { kind: "box", id: bx.dataset.box, el: bx, start, moved: false, snap: this._snap() };
    else if (!modal && e.target.closest("[data-ah]")) this._gesture = { kind: "ah", which: e.target.closest("[data-ah]").dataset.ah, id: this.s.sel, start, moved: false, snap: this._snap() };
    else if (!modal && e.target.closest("[data-oh]")) this._gesture = { kind: "oh", which: e.target.closest("[data-oh]").dataset.oh, id: this.s.sel, start, moved: false, snap: this._snap() };
    else if (!modal && e.target.closest("[data-th]")) this._gesture = { kind: "th", id: this._bodyId(this.s.sel), start, moved: false, snap: this._snap() };
    else if (lhd) this._gesture = { kind: "lh", which: lhd.dataset.lh, id: this._lightLead(this.s.sel), el: lhd, start, moved: false, snap: this._snap() };
    else if (phm) this._gesture = { kind: "ph", id: phm.dataset.ph, el: phm, start, moved: false, snap: this._snap() };
    else if (mk) this._gesture = { kind: "mk", id: mk.dataset.mk, el: mk, start, moved: false, snap: this._snap() };
    else if (cl) this._gesture = { kind: "cluster", id: cl.dataset.cluster, start, moved: false };
    else this._gesture = { kind: "bg", start, moved: false, tx: s.tx, ty: s.ty, st: this._vp.parentElement.scrollTop };
    try {
      this._vp.setPointerCapture(e.pointerId);
    } catch (_e) {
      /* */
    }
  },

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
      const geo = airGeom(cur, R);
      const keep = this._airKeep(cur);
      if (keep.x1 == null) Object.assign(keep, { x1: geo.e1[0], y1: geo.e1[1], x2: geo.e2[0], y2: geo.e2[1] });
      if (g.which === "1" || g.which === "2") {
        // An end of the unit's line; the air keeps flowing to the same side.
        keep[`x${g.which}`] = clamp(p.x, 0, 100);
        keep[`y${g.which}`] = clamp(p.y, 0, 100);
      } else {
        // Reach (distance from the line) and side (the direction it points to).
        const mid = [(keep.x1 + keep.x2) / 2, (keep.y1 + keep.y2) / 2 / R];
        const v = [p.x - mid[0], p.y / R - mid[1]];
        const side = v[0] * geo.n[0] + v[1] * geo.n[1];
        const nn = side < 0 ? [-geo.n[0], -geo.n[1]] : geo.n;
        keep.a = Math.round((Math.atan2(nn[1], nn[0]) * 180) / Math.PI);
        keep.r = Math.max(1, Math.abs(side));
      }
      pos.air = keep;
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
      // 0.7.2: and to the ends of other bars, so bars of the same opening get the same length.
      if (!e.altKey) {
        const W = (this._vpW || 800) * (this.s.z || 1), H = (this._vpH || 500) * (this.s.z || 1);
        const horiz = Math.abs(p.y - other[1]) < 1e-6;
        for (const [k, q] of Object.entries(this.work.positions)) {
          if (k === g.id || !q.opening || q.opening.x1 == null) continue;
          for (const [ex, ey] of [[q.opening.x1, q.opening.y1], [q.opening.x2, q.opening.y2]]) {
            if (horiz && Math.abs((ex - p.x) * W) / 100 < 10) p = { x: ex, y: p.y };
            else if (!horiz && Math.abs((ey - p.y) * H) / 100 < 10) p = { x: p.x, y: ey };
          }
        }
      }
      const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
      if (g.which === "1") Object.assign(o, { x1: c(p.x), y1: c(p.y) });
      else Object.assign(o, { x2: c(p.x), y2: c(p.y) });
      this._renderOverlay();
      return;
    }
    if (g.kind === "th") {
      const p = this._pt(e);
      const pos = this._bodyRec(g.id);
      if (!pos) return;
      pos.touch = { w: Math.max(1, Math.abs(p.x - pos.x) * 2), h: Math.max(1, Math.abs(p.y - pos.y) * 2) };
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
      if (g.which === "c") Object.assign(l, { cx: Math.round(p.x * 1000) / 1000, cy: Math.round(p.y * 1000) / 1000, r: l.r ?? cur.r }); // 0.12.6
      if (g.which === "r") l.r = Math.max(0.5, Math.hypot(p.x - cur.x, (p.y - cur.y) / R));
      if (g.which === "end") Object.assign(l, { x2: p.x, y2: p.y, r: l.r ?? cur.r }, ["screen", "line"].includes(cur.type) ? { x1: l.x1 ?? cur.x1, y1: l.y1 ?? cur.y1 } : {});
      if (g.which === "start") Object.assign(l, { x1: p.x, y1: p.y, x2: l.x2 ?? cur.x2, y2: l.y2 ?? cur.y2, r: l.r ?? cur.r });
      if (/^p\d+$/.test(g.which) && Array.isArray(l.pts)) l.pts = l.pts.map((q, i) => (i === Number(g.which.slice(1)) ? [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000] : q)); // 0.13.2
      if (g.which === "corner") Object.assign(l, { w: Math.max(1, Math.abs(p.x - cur.x) * 2), h: Math.max(1, Math.abs(p.y - cur.y) * 2) });
      if (g.which === "wall") Object.assign(l, { r: Math.max(0.5, Math.hypot(p.x - cur.x, (p.y - cur.y) / R)), a: Math.round((Math.atan2((p.y - cur.y) / R, p.x - cur.x) * 180) / Math.PI) });
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
    if (g.kind === "shmove" || g.kind === "obmove") {
      const p = this._pt(e);
      let dx = p.x - g.p0.x, dy = p.y - g.p0.y;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      if (g.kind === "shmove") {
        // Keep the whole shape on the plan.
        const xs = g.orig.map((q) => q[0]), ys = g.orig.map((q) => q[1]);
        dx = Math.max(-Math.min(...xs), Math.min(100 - Math.max(...xs), dx));
        dy = Math.max(-Math.min(...ys), Math.min(100 - Math.max(...ys), dy));
        this.work.shapes[g.aid] = g.orig.map((q) => [r3(q[0] + dx), r3(q[1] + dy), ...(q[2] ? [1] : [])]);
        this._render();
      } else {
        const o = g.orig;
        dx = Math.max(-Math.min(o.x1, o.x2), Math.min(100 - Math.max(o.x1, o.x2), dx));
        dy = Math.max(-Math.min(o.y1, o.y2), Math.min(100 - Math.max(o.y1, o.y2), dy));
        Object.assign(this.work.positions[g.id].opening, { x1: r3(o.x1 + dx), y1: r3(o.y1 + dy), x2: r3(o.x2 + dx), y2: r3(o.y2 + dy) });
        this._renderOverlay();
      }
      return;
    }
    if (g.kind === "she") {
      // The edge moves along its normal (as on screen); both its corners follow, so the neighbouring edges stretch.
      const pts = this.work.shapes[s.shapeEdit];
      if (!pts) return;
      const n = g.orig.length;
      const a = g.orig[g.i];
      const b = g.orig[(g.i + 1) % n];
      const p = this._pt(e);
      const k = this._ratio() || 1; // % across → % down, so the normal is true on screen
      let nx = -(b[1] - a[1]);
      let ny = (b[0] - a[0]) * k;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const d = (p.x - g.p0.x) * k * nx + (p.y - g.p0.y) * ny; // distance along the normal (in "down" units)
      const mx = (d * nx) / k;
      const my = d * ny;
      const r3 = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
      for (const j of [g.i, (g.i + 1) % n]) pts[j] = [r3(g.orig[j][0] + mx), r3(g.orig[j][1] + my), ...(g.orig[j][2] ? [1] : [])];
      this._render();
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
      } else if ((s.g || 1) > 1) {
        // test12: a grown tall plan: dragging scrolls it up / down (touch screens have no wheel).
        this._vp.parentElement.scrollTop = g.st - (e.clientY - g.start.y);
        this._vp.classList.add("panning");
      }
    }
  },

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
    if (g.kind === "ah" || g.kind === "lh" || g.kind === "oh" || g.kind === "th") {
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
          this._toast(EPTS[g.id] ? `${EPTS[g.id][0]} taken off the plan` : `${a ? a.name : "Room"} pin taken off the plan`);
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
    if (g.kind === "shmove" || g.kind === "obmove") {
      if (g.moved) {
        this._pushUndo(g.snap);
        this._scheduleSave();
      } else if (g.kind === "shmove") s.shapeEdit = g.aid; // a click on a shape: edit it
      else s.sel = g.id; // a click on a bar: its sensor
      this._render();
      return;
    }
    if (g.kind === "shbox") return;
    if (g.kind === "shc" || g.kind === "she") {
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
  },

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
  },

  _clearDrop() {
    for (const x of this.shadowRoot.querySelectorAll(".mk.droptgt")) {
      x.classList.remove("droptgt");
      const t = x.querySelector(".tip");
      if (t && x._tip0 !== undefined) t.innerHTML = x._tip0;
    }
  },

  _outside(e) {
    const r = this._vp.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  },

  _overSide(e) {
    const el = this.shadowRoot.elementFromPoint ? this.shadowRoot.elementFromPoint(e.clientX, e.clientY) : null;
    return el && el.closest ? el.closest("aside.side") : null;
  },

  _dropHint(side) {
    for (const el of this.shadowRoot.querySelectorAll("aside.side.dropout")) if (el !== side) el.classList.remove("dropout");
    if (side) side.classList.add("dropout");
  },

  _bgClick(e) {
    const s = this.s;
    const p = this._pt(e);
    if (s.placingRoom) {
      const room = s.placingRoom;
      this._change(() => {
        this.work.anchors[room] = { x: p.x, y: p.y };
      });
      const next = !EPTS[room] && this._roomsForPlan().find((r) => !r.pos && !r.ignored && r.area_id !== room);
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
  },

  /** After placing: a short flash on the marker and a toast, no details card (#29). */
  _placedFeedback(id) {
    const d = this.byId.get(id);
    this._flash(id);
    this._render();
    this._toast(`✓ ${d ? d.name : "Device"} placed`);
  },

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
  },

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
  },

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
  },
});
