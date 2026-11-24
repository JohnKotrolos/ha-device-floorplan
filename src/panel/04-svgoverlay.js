Object.assign(DeviceFloorplanPanel.prototype, {

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
    // 0.8.2: overlaps that gluing will join (orange strips), and where Rooms meet right after gluing (green).
    if (this.work && this.s.tool === "rooms" && !this.s.shapeEdit) {
      if (this.s.glued && this.s.glueLines) {
        for (const [A, B] of this.s.glueLines) parts.push(`<line class="glline" x1="${A[0] * 10}" y1="${A[1] * 10}" x2="${B[0] * 10}" y2="${B[1] * 10}" vector-effect="non-scaling-stroke"/>`);
      } else {
        for (const st of this._glueState().strips || []) parts.push(`<polygon class="glstrip ${this.s.glueFocus === st.key ? "focus" : ""}" points="${st.pts.map((q) => `${q[0] * 10},${q[1] * 10}`).join(" ")}" vector-effect="non-scaling-stroke"/>`);
      }
    }
    if (this.work && this.s.shapeEdit && (this.work.shapes || {})[this.s.shapeEdit]) {
      const sp = this.work.shapes[this.s.shapeEdit];
      const pts = sp.map((p) => `${p[0] * 10},${p[1] * 10}`).join(" ");
      parts.push(`<polygon points="${pts}" fill="rgba(255,255,255,.28)" stroke="none"/>`);
      sp.forEach((p, i) => {
        const q = sp[(i + 1) % sp.length];
        parts.push(`<line x1="${p[0] * 10}" y1="${p[1] * 10}" x2="${q[0] * 10}" y2="${q[1] * 10}" stroke="#b3261e" stroke-width="2" vector-effect="non-scaling-stroke"/>`);
        // 0.9: grab the edge itself and drag it: it moves straight out / in, its neighbours stretch.
        parts.push(`<line class="she" data-she="${i}" x1="${p[0] * 10}" y1="${p[1] * 10}" x2="${q[0] * 10}" y2="${q[1] * 10}" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke"><title>Drag to move this wall</title></line>`);
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
  },

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
  },

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
  },

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
  },

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
    // 0.13.9.8: when every device of a spot has a mounting height, the highest leads (shown in front, first in the list).
    for (const c of clusters) if (c.m.length > 1 && c.m.every((m) => typeof m.pos.h === "number")) c.m.sort((a, b) => b.pos.h - a.pos.h);
    return clusters;
  },

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
    // 0.11 Energy points: placed in Step 3 (Devices to place → Energy points); square tags, shown in every step.
    if (this.work) {
      if (this._eSrc === undefined && this._hass) {
        this._eSrc = null;
        this._hass.callWS({ type: "energy/get_prefs" }).then((p) => {
          const has = (t) => (p.energy_sources || []).some((x) => x.type === t);
          this._eSrc = has("solar") || has("battery");
          this._eHas = { __energy_panel: true, __energy_source: has("solar"), __energy_battery: has("battery") };
          // Grid: flow_from (older HA) or stat_energy_from (HA 2026.11+).
          const st = (t, keys) => (p.energy_sources || []).filter((x) => x.type === t).flatMap((x) => keys.flatMap((k) => (k === "flow_from" ? (x.flow_from || []).map((f) => f.stat_energy_from) : [x[k]])));
          this._eStats = { __energy_panel: st("grid", ["stat_energy_from", "flow_from"]).filter(Boolean), __energy_source: st("solar", ["stat_energy_from"]).filter(Boolean), __energy_battery: st("battery", ["stat_energy_from", "stat_energy_to"]).filter(Boolean) };
          this._render();
        }).catch(() => (this._eSrc = false));
      }
      for (const [eid, [lbl, tip]] of Object.entries(EPTS)) {
        const pos = this.work.anchors[eid];
        // Same look as on the card: a white circle with a coloured ring and its icon; the name on hover.
        if (pos) parts.push(`<span class="pin epin ${eid === "__energy_panel" ? "" : eid === "__energy_battery" ? "bat" : "src"}" data-pin="${eid}" data-x="${pos.x}" data-y="${pos.y}" title="${esc(`${lbl}: ${tip}`)}"><ha-icon icon="${EPT_ICON[eid]}"></ha-icon></span>`);
      }
    }
    // room pins (under the devices)
    if (this.work && (lRooms !== "off" || s.placingRoom)) {
      for (const [aid, pos] of Object.entries(this.work.anchors)) {
        if (aid.startsWith("__energy_")) continue;
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
        if (c.type === "cone") {
          // 0.7.7: both ends of the unit (drag them onto the real AC on the wall) + the reach.
          const g = airGeom(c, this._ratio());
          parts.push(`<span class="ahd" data-ah="1" data-x="${g.e1[0]}" data-y="${g.e1[1]}" title="Drag: one end of the AC unit"></span><span class="ahd" data-ah="2" data-x="${g.e2[0]}" data-y="${g.e2[1]}" title="Drag: the other end of the AC unit"></span><span class="ahd" data-ah="r" data-x="${g.tip[0]}" data-y="${g.tip[1]}" title="Drag: how far the air flows (and to which side)"></span>`);
        }
      }
      // 0.12.2: device pictures, as on the card. 0.12.6: drawn by the card's own renderer (window.__dfcPic): tint,
      // inset, looks and the animated Highlight exactly as on the card. The selected one follows "Preview".
      const PR = window.__dfcPic;
      let picCss = false;
      const bodies = [...Object.entries(this.work.positions), ...Object.entries(this.work.phantoms || {}).map(([k, v]) => [`ph:${k}`, v])];
      for (const [pid, p] of bodies) {
        if (!p.pic || !Number.isFinite(p.x)) continue;
        const url = this._picUrl(p.pic.src);
        if (!url) continue;
        const isSel = pid === this._bodyId(s.sel);
        let inner = this._picThumb(p.pic.src, p.pic.tint);
        if (PR) {
          const pv = isSel ? s.picPrev || "on" : "on";
          const st = pv === "hl" ? "on" : pv;
          const look = (p.pic.looks || {})[st] || PIC_DEF[st];
          const hl = pv === "hl" && p.pic.hl && p.pic.hl.look ? p.pic.hl : null;
          inner = look === "hidden" ? "" : PR.html({ p: { ...p.pic, w: 100, r: 0 }, url, look, hl, x: 50, y: 50 });
          if (!picCss) parts.push(`<style>${PR.css}</style>`);
          picCss = true;
        }
        parts.push(`<span class="pici ${PR ? "pr" : ""} ${isSel ? "sel" : ""}" data-x="${p.x}" data-y="${p.y}" data-w="${p.pic.w}" style="aspect-ratio:${p.pic.ar};transform:translate(-50%,-50%) rotate(${p.pic.r || 0}deg)">${inner}</span>`);
      }
      // 0.12.1: the selected device's touch area (a box around the marker) and its corner handle.
      const tb = s.sel && this._bodyId(s.sel);
      const tbr = tb && this._bodyRec(tb);
      if (tbr && !fade && tbr.touch) {
        const p = tbr;
        const { w, h } = p.touch;
        parts.push(`<span class="tza" data-x="${p.x - w / 2}" data-y="${p.y - h / 2}" data-w="${w}" data-h="${h}"></span><span class="lhd" data-th="1" data-x="${p.x + w / 2}" data-y="${p.y + h / 2}" title="Drag to size the touch area to the device drawn in your plan"></span>`);
      }
      // 0.7.0: the selected opening's two ends.
      if (s.sel && this.work.positions[s.sel] && !fade && this._openingEnt(s.sel) && this.work.positions[s.sel].opening && this.work.positions[s.sel].opening.x1 != null) {
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
      const name = d ? (pb ? `${d.name} · ${pb[1] || "box / radio"}` : d.name) : (this.areaById.get(s.placingRoom) || {}).name || (EPTS[s.placingRoom] || [])[0];
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
    parts.push(this._fxHtml()); // 0.13.3: light above the pictures, whatever layers are shown
    return parts.join("");
  },

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
    const side = pop && pop.closest(".sidecol");
    if (!pop || !side) return;
    const room = side.getBoundingClientRect().bottom - pop.getBoundingClientRect().top - 10;
    pop.style.maxHeight = `${Math.max(160, room)}px`;
  },

  /** Split device (#91): entity spots ("entity:<id>" with `of`) get a list-less item. */
  _syncSplit() {
    if (!this.work || !this.byId) return;
    for (const [key, pos] of Object.entries(this.work.positions)) {
      if (!pos.of || !key.startsWith("entity:")) continue;
      const old = this.byId.get(key);
      if (old && old.split && old.as === (pos.as || "")) continue;
      const eid = key.slice(7);
      const dev = this.byId.get(pos.of);
      const ent = dev && (dev.entities || []).find((e) => e.entity_id === eid);
      const item = {
        id: key, entity_id: eid, loose: true, split: true, of: pos.of, as: pos.as || "",
        name: (ent && ent.name !== eid && ent.name) || entName(this._hass, eid),
        manufacturer: null, model: null, area_id: dev ? dev.area_id : null, area_name: dev ? dev.area_name : null,
        floor_id: dev ? dev.floor_id : null, integration: null, conns: [], virtual: false,
        group: pos.as === "light" || eid.startsWith("light.") ? "lights" : pos.as === "fan" ? "climate" : "plugs_switches",
        physical: false, main_entity: eid, entities: [], merged: [], parts: [], search: eid,
      };
      if (old) this.devices = this.devices.filter((x) => x !== old);
      this.devices.push(item);
      this.byId.set(key, item);
    }
  },

  /** Entities of a device that can act somewhere else (#91). */
  _switchables(d) {
    return (d.entities || []).filter((e) => !e.other && ["light", "switch", "cover", "fan", "climate", "valve"].includes(e.domain));
  },

  _splitSpots(devId) {
    if (!this.work) return [];
    return Object.entries(this.work.positions).filter(([k, p]) => p.of === devId && k.startsWith("entity:")).map(([k]) => k);
  },

  _missingIds() {
    if (!this.work) return [];
    return Object.keys(this.work.positions).filter((id) => !this.byId.has(id) && !this.mergedInto[id] && !this.partOf[id]);
  },

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
  },

  _stackPopHtml(c) {
    const rows = c.m.map((m) => `<button class="si" data-act="stackpick" data-id="${esc(m.d.id)}"><span class="ico">${this._iconHtml(m.d)}</span>${esc(this._bondOf(m.d.id) ? this._bondName(this._bondOf(m.d.id)) : m.d.name)}</button>`).join("");
    return `<div class="stackpop" data-x="${c.x}" data-y="${c.y}" role="dialog" aria-label="Devices on this spot"><div class="sh">${c.m.length} on this spot · not bonded<button class="link" data-act="stackfan" data-id="${esc(c.m[0].d.id)}">Spread out to drag</button></div>${rows}</div>`;
  },

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
  },

  _dirOf(a, b) {
    const p = this._plan();
    const dx = Math.abs(((b.x - a.x) * p.width) / 100);
    const dy = Math.abs(((b.y - a.y) * p.height) / 100);
    return dx >= dy ? "h" : "v";
  },

  _isStraight(a, b) {
    return Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
  },

  _snapPoint(a, b, shift) {
    if (shift || !a) return b;
    const p = this._plan();
    const dx = ((b.x - a.x) * p.width) / 100;
    const dy = ((b.y - a.y) * p.height) / 100;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (ang < 3 || ang > 177) return { x: b.x, y: a.y };
    if (Math.abs(ang - 90) < 3) return { x: a.x, y: b.y };
    return b;
  },

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
  },

  _shapeBoxHtml() {
    const aid = this.s.shapeEdit;
    if (!aid || !this.work || !(this.work.shapes || {})[aid]) return "";
    const a = this.areaById.get(aid);
    const pos = this.s.shapeBox || { x: 12, y: 12 };
    return `<div class="shbox" id="shbox" style="left:${pos.x}px;top:${pos.y}px"><div class="shgrip" data-shgrip="1" title="Move">⋮⋮ <b>${esc(a ? a.name : aid)}</b> · shape</div>
      <div class="shtip">Drag the corners, or a wall to move it · "+" adds a corner · double-click removes one. Edges snap straight · hold Alt for a free angle. Let shapes overlap where rooms are open to each other (open-plan kitchen, a door); leave a small gap where there is a wall: light stops at gaps.</div>
      <div class="shacts"><button data-act="shapereset">Reset to rectangle</button><button data-act="shapedel">🗑 Remove</button><button class="pri" data-act="shapedone">Done</button></div></div>`;
  },

  /** A rectangle around the room pin (or the plan centre). */
  _shapeRect(aid) {
    const p = (this.work.anchors || {})[aid] || { x: 50, y: 50 };
    const w = 12, h = 14;
    return [[clamp(p.x - w, 0, 100), clamp(p.y - h, 0, 100)], [clamp(p.x + w, 0, 100), clamp(p.y - h, 0, 100)], [clamp(p.x + w, 0, 100), clamp(p.y + h, 0, 100)], [clamp(p.x - w, 0, 100), clamp(p.y + h, 0, 100)]];
  },

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
  },

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
  },

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
        if (el.dataset.w) {
          el.style.width = `${Number(el.dataset.w) * z}%`;
          if (el.dataset.h) el.style.height = `${Number(el.dataset.h) * z}%`;
        }
      }
    }
    if (window.__dfcPic) window.__dfcPic.sizeFlow(this.shadowRoot);
    const zl = this.shadowRoot.getElementById("zl");
    if (zl) zl.textContent = `${Math.round((this.s.g || 1) * z * 100)}%`;
    // Keep the length boxes fully inside the plan (they used to be cut off at the edges); test12: inside the part
    // of the plan that is on screen (a tall plan scrolls).
    const cr = this._vp.parentElement.getBoundingClientRect();
    const vr = { left: Math.max(r.left, cr.left), right: Math.min(r.right, cr.right), top: Math.max(r.top, cr.top), bottom: Math.min(r.bottom, cr.bottom) };
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
    // "N on this spot" list: opens above the marker near the bottom, stays inside left and right.
    for (const el of this.shadowRoot.querySelectorAll(".stackpop")) {
      el.classList.remove("up");
      el.style.marginLeft = "0px";
      let b = el.getBoundingClientRect();
      if (b.bottom > vr.bottom - 4) {
        el.classList.add("up");
        b = el.getBoundingClientRect();
      }
      if (b.left < vr.left + 4) el.style.marginLeft = `${vr.left + 4 - b.left}px`;
      else if (b.right > vr.right - 4) el.style.marginLeft = `${vr.right - 4 - b.right}px`;
    }
  },

  /** 0.8.2: zoom in on a spot of the plan (x / y in % of the plan) and put it in the middle. */
  _centerOn(x, y, nz = 2.5) {
    const s = this.s;
    nz = clamp(nz, 1, 6);
    const lim = (v) => clamp(v, 100 * (1 - nz), 0);
    Object.assign(s, { z: nz, tx: lim(50 - x * nz), ty: lim(50 - y * nz) });
    this._layout();
  },

  /** The zoom shown to the user: the plan's growth (tall plans) × the zoom inside it. */
  _zt() {
    return (this.s.g || 1) * this.s.z;
  },

  /** Zoom to `total` (as shown in the % box) around a point of the plan's box (vx / vy in %; default: the middle
   *  of what is on screen). test12 (#16): a tall plan first grows to the canvas width (it scrolls up / down), only
   *  then zooms inside its box as before. Plans as wide as the canvas: exactly as before. */
  _zoomTo(total, vx, vy) {
    const s = this.s;
    total = clamp(Math.round(total * 1000) / 1000, 0.25, 6);
    const sc = this._vp && this._vp.parentElement;
    if (sc && this._gMax > 1.001) {
      const r = this._vp.getBoundingClientRect();
      const cr = sc.getBoundingClientRect();
      if (vx == null) vx = ((Math.max(r.left, cr.left) + Math.min(r.right, cr.right)) / 2 - r.left) / r.width * 100;
      if (vy == null) vy = ((Math.max(r.top, cr.top) + Math.min(r.bottom, cr.bottom)) / 2 - r.top) / r.height * 100;
      const sx = r.left + (vx / 100) * r.width;
      const sy = r.top + (vy / 100) * r.height;
      const px = (vx - s.tx) / s.z;
      const py = (vy - s.ty) / s.z;
      const ng = total <= 1 ? 1 : Math.min(this._gMax, total);
      if (Math.abs(ng - (s.g || 1)) > 0.001) {
        Object.assign(s, { g: ng, z: 1, tx: 0, ty: 0 });
        this._sizeViewport();
        // Keep the spot that was under the pointer there.
        const r2 = this._vp.getBoundingClientRect();
        sc.scrollTop += r2.top + (py / 100) * r2.height - sy;
      }
      const r3 = this._vp.getBoundingClientRect();
      vx = ((sx - r3.left) / r3.width) * 100;
      vy = ((sy - r3.top) / r3.height) * 100;
      total /= ng;
      if (total > 1) {
        const lim = (v) => clamp(v, 100 * (1 - total), 0);
        Object.assign(s, { z: total, tx: lim(vx - px * total), ty: lim(vy - py * total) });
      } else {
        const c = (100 - 100 * total) / 2;
        Object.assign(s, { z: total, tx: c, ty: c });
      }
      this._layout();
      clearTimeout(this._zoomT);
      this._zoomT = setTimeout(() => this._render(), 160);
      return;
    }
    const nz = total;
    if (vx == null) vx = 50;
    if (vy == null) vy = 50;
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
  },

  _pt(e) {
    const r = this._vp.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 100;
    const vy = ((e.clientY - r.top) / r.height) * 100;
    return { x: clamp((vx - this.s.tx) / this.s.z, 0.5, 99.5), y: clamp((vy - this.s.ty) / this.s.z, 0.5, 99.5), vx, vy };
  },
});
