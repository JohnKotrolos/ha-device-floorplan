Object.assign(DeviceFloorplanPanel.prototype, {

  _ratio() {
    const p = this._plan();
    return p && p.width && p.height ? p.width / p.height : 1.6;
  },

  _shapeSvg(s, cls) {
    const R = this._ratio();
    const lc = lightCss(s.color); // #112: preview the chosen colour
    const fill = lc ? `fill="${lc}" fill-opacity="${cls === "sel" ? ".28" : ".14"}"` : `fill="rgba(245,158,11,${cls === "sel" ? ".14" : ".06"})"`;
    const st = cls === "sel" ? `${fill} stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4"` : `${fill} stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"`;
    const ve = `vector-effect="non-scaling-stroke"`;
    if (s.type === "none") return "";
    if (s.type === "xmas") {
      const X = window.__dfcXmas;
      const pts = ["rings", "spiral", "scatter"].includes(s.lay) ? null : (s.pts || []);
      const guide = ["rings", "spiral", "scatter"].includes(s.lay)
        ? `<ellipse cx="${s.x * 10}" cy="${s.y * 10}" rx="${(Number(s.r) || 5) * 10}" ry="${(Number(s.r) || 5) * R * 10}" fill="none" stroke="#f59e0b" stroke-width="${cls === "sel" ? 1.5 : 1}" stroke-dasharray="4 4" ${ve} opacity=".7"/>`
        : `<polyline points="${pts.map((q) => `${q[0] * 10},${q[1] * 10}`).join(" ")}" fill="none" stroke="#f59e0b" stroke-width="${cls === "sel" ? 1.5 : 1}" stroke-dasharray="4 4" ${ve} opacity=".7"/>`;
      return X ? guide : guide; // the bulbs: _fxHtml (above pictures)
    }
    if (s.type === "drum") return `<ellipse cx="${s.x * 10}" cy="${s.y * 10}" rx="${s.r * 10}" ry="${s.r * R * 10}" fill="rgba(79,209,197,${cls === "sel" ? ".18" : ".08"})" stroke="#4fd1c5" stroke-width="${cls === "sel" ? 2 : 1.2}" stroke-dasharray="5 3" ${ve}/>`;
    if (s.type === "line") return `<line x1="${s.x1 * 10}" y1="${s.y1 * 10}" x2="${s.x2 * 10}" y2="${s.y2 * 10}" stroke="#4fd1c5" stroke-opacity="${cls === "sel" ? 1 : 0.6}" stroke-width="${cls === "sel" ? 3 : 2}" stroke-linecap="round" ${ve}/>`;
    if (s.type === "screen") {
      const g = screenPoly(s.x1, s.y1, s.x2, s.y2, s.r, s.a, R, s.tx, s.ty);
      return `<polygon points="${g.pts.map((q) => `${q[0] * 10},${q[1] * 10}`).join(" ")}" fill="rgba(170,200,255,${cls === "sel" ? ".22" : ".1"})" stroke="#8fb8ff" stroke-width="${cls === "sel" ? 2 : 1.2}" stroke-dasharray="6 4" ${ve}/><line x1="${s.x1 * 10}" y1="${s.y1 * 10}" x2="${s.x2 * 10}" y2="${s.y2 * 10}" stroke="#eaf2ff" stroke-width="2" stroke-linecap="round" ${ve}/>`;
    }
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
  },

  /** 0.13.3: light on the plan above the device pictures (same layer order as the card): the night preview's glow
   *  and Christmas lights. Shape outlines and handles stay where they were. */
  _fxHtml() {
    if (!this.work) return "";
    const s = this.s;
    const lights = Object.keys(this.work.positions).filter((id) => this.byId.get(id) && !this.skipped.has(id) && (this._bondLeader(id) === id || this._lampMode(id)) && this._isLight(id));
    let out = "";
    if (s.nightPrev) {
      const R = this._ratio();
      out += `<defs><radialGradient id="lglow"><stop offset="0" stop-color="rgb(255,196,120)" stop-opacity=".95"/><stop offset=".55" stop-color="rgb(255,180,90)" stop-opacity=".45"/><stop offset="1" stop-color="rgb(255,170,80)" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="1000" height="1000" fill="rgba(10,16,38,.72)"/>`;
      for (const id of lights) {
        const sh = this._shape(id, this._lampMode(id));
        if (!sh || ["none", "screen", "drum", "line"].includes(sh.type)) continue;
        const ells = sh.type === "strip" ? [0, 1, 2, 3, 4].map((i) => ({ x: sh.x + ((sh.x2 - sh.x) * i) / 4, y: sh.y + ((sh.y2 - sh.y) * i) / 4, rx: sh.r, ry: sh.r * R }))
          : sh.type === "panel" ? [{ x: sh.x, y: sh.y, rx: sh.w * 0.8, ry: sh.h * 0.8 }]
            : sh.type === "wall" ? [{ x: sh.x + Math.cos(((sh.a ?? 90) * Math.PI) / 180) * sh.r * 0.45, y: sh.y + Math.sin(((sh.a ?? 90) * Math.PI) / 180) * sh.r * 0.45 * R, rx: sh.r * 0.9, ry: sh.r * 0.9 * R }]
              : [{ x: sh.x, y: sh.y, rx: sh.r, ry: sh.r * R }];
        for (const e of ells) out += `<ellipse cx="${e.x * 10}" cy="${e.y * 10}" rx="${e.rx * 10}" ry="${e.ry * 10}" fill="url(#lglow)" style="mix-blend-mode:screen"/>`;
      }
    }
    const X = window.__dfcXmas;
    if (X) {
      const R = this._ratio();
      let bulbs = "";
      let xi = 0;
      for (const id of lights) {
        const sh = this._shape(id, this._lampMode(id));
        // 0.13.6: always lit and playing its effect here, so the effect can be judged in the Editor.
        if (sh && sh.type === "xmas") bulbs += X.svg(sh, R, { on: true, rooms: X.rooms(this.work.shapes, sh), realW: this._realW(), pxw: ((this._vpW || 800) * (s.z || 1)) / 100, id: `e${xi++}` });
      }
      if (bulbs) out += `<g class="xmas" transform="scale(10)"><style>${X.css}</style>${bulbs}</g>`;
    }
    return out ? `<svg class="lfx" data-x="0" data-y="0" data-w="100" data-h="100" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${out}</svg>` : "";
  },

  /** Handles for the selected light's shape (drag on the plan). */
  _shapeHandles(s) {
    if (!s || s.type === "none") return "";
    // 0.12.6: every light shape can be moved away from its marker (to where the lamp hangs).
    const c = ["bulb", "spot", "strip", "panel", "wall"].includes(s.type) || (s.type === "xmas" && ["rings", "spiral", "scatter"].includes(s.lay)) ? `<span class="lhd lc" data-lh="c" data-x="${s.x}" data-y="${s.y}" title="Drag: where the light is"></span>` : "";
    return c + this._shapeHandles0(s);
  },

  _shapeHandles0(s) {
    const R = this._ratio();
    if (s.type === "xmas" && !["rings", "spiral", "scatter"].includes(s.lay)) return (s.pts || []).map((q, i) => `<span class="lhd" data-lh="p${i}" data-x="${q[0]}" data-y="${q[1]}" title="Drag: a corner of the Christmas lights"></span>`).join("");
    if (s.type === "strip") return `<span class="lhd" data-lh="end" data-x="${s.x2}" data-y="${s.y2}" title="Drag the end of the strip"></span>`;
    if (s.type === "line") return `<span class="lhd" data-lh="start" data-x="${s.x1}" data-y="${s.y1}" title="Drag: one end of the machine"></span><span class="lhd" data-lh="end" data-x="${s.x2}" data-y="${s.y2}" title="Drag: the other end of the machine"></span>`;
    if (s.type === "screen") return `<span class="lhd" data-lh="start" data-x="${s.x1}" data-y="${s.y1}" title="Drag: one end of the screen"></span><span class="lhd" data-lh="end" data-x="${s.x2}" data-y="${s.y2}" title="Drag: the other end of the screen"></span>`;
    if (s.type === "panel") return `<span class="lhd" data-lh="corner" data-x="${s.x + s.w / 2}" data-y="${s.y + s.h / 2}" title="Drag to size the panel"></span>`;
    if (s.type === "wall") {
      const a = ((s.a ?? 90) * Math.PI) / 180;
      return `<span class="lhd" data-lh="wall" data-x="${s.x + Math.cos(a) * s.r}" data-y="${s.y + Math.sin(a) * s.r * R}" title="Drag: size and direction"></span>`;
    }
    return `<span class="lhd" data-lh="r" data-x="${s.x + s.r}" data-y="${s.y}" title="Drag to size the light"></span>`;
  },

  /** 0.13.2: Christmas lights: layout, bulbs, size, effect and speed. */
  _xmasHtml(s) {
    const chips = (act, cur, opts) => `<div class="lchips">${opts.map(([k, l]) => `<button class="${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}">${l}</button>`).join("")}</div>`;
    const lay = s.lay || "line";
    const bulb = s.bulb || "multi";
    const cm = window.__dfcXmas ? window.__dfcXmas.cm(s) : Number(s.cm) || 3;
    const gl = window.__dfcXmas && window.__dfcXmas.glow ? window.__dfcXmas.glow(s) : cm * 3.2;
    return `<div style="display:flex;flex-direction:column;gap:6px">
      ${chips("xlay", lay, [["line", "Line"], ["scatter", "Scattered (a tree)"], ["spiral", "Spiral"], ["rings", "Rings"]])}
      ${lay === "line" ? `<div class="lchips"><button data-act="xpt" data-v="add">+ Add a corner</button><button data-act="xpt" data-v="del" ${(s.pts || []).length > 2 ? "" : "disabled"}>− Remove the last corner</button></div>` : ""}
      <span style="font-size:12px"><b>Bulbs</b></span>${chips("xbulb", bulb, [["multi", "Multicolour"], ["white", "White"], ["own", "The light's colour"]])}
      ${bulb === "white" ? `<label class="fl"><span style="font-size:12px"><b>White: warm ↔ cool</b> <span style="color:var(--df-sec)">${Number(s.k) || 2700} K · ${(Number(s.k) || 2700) < 3300 ? "warm" : (Number(s.k) || 2700) < 4800 ? "neutral" : "cool"}</span></span><input type="range" id="xmask" min="2200" max="6500" step="100" value="${Number(s.k) || 2700}" aria-label="White, warm to cool"></label>` : ""}
      <label class="fl"><span style="font-size:12px"><b>Bulb size</b> <span style="color:var(--df-sec)">${cm.toFixed(1)} cm${this._realW() ? "" : " (the plan isn't measured: counted as 12 m wide)"}</span></span><input type="range" id="xmascm" min="0.5" max="8" step="0.5" value="${cm}" aria-label="Bulb size in centimetres"></label>
      <label class="fl"><span style="font-size:12px"><b>Glow around each bulb</b> <span style="color:var(--df-sec)">${gl.toFixed(0)} cm, in the bulb's own colour</span></span><input type="range" id="xmasgl" min="${cm}" max="50" step="1" value="${gl}" aria-label="Glow around each bulb in centimetres"></label>
      <span style="font-size:12px"><b>Effect</b></span>${chips("xfx", s.fx || "twinkle", [["steady", "Steady"], ["twinkle", "Twinkle"], ["chase", "Chase"], ["flash", "Flash"]])}
      ${(s.fx || "twinkle") === "steady" ? "" : chips("xsp", s.sp || "normal", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]])}
      <div style="font-size:12px;color:var(--df-sec)">${lay === "line" ? "Drag the orange handles along the railing, window or wall; add corners where it turns." : lay === "scatter" ? "Bulbs scattered through the tree as seen from above: brightest at the top (the centre), smaller and fainter deeper in the branches. Drag the centre onto the tree and the outer handle to its size." : lay === "spiral" ? "One string winding round the tree from its top outwards. Drag the centre onto the tree and the outer handle to its size." : "Drag the centre onto the wreath or tree and the outer handle to its size; more rings appear as it grows."} The card lights the bulbs while the light or plug is on; when it is off they show dark, or not at all if its marker hides when off.</div></div>`;
  },

  /** #112: colour for lights that don't report one (smart bulbs: Auto = their real colour). */
  _lightColourHtml(s) {
    const col = s.color || "auto";
    const k = col.startsWith("k:") ? Number(col.slice(2)) : 3000;
    const hex = /^#[0-9a-f]{6}$/i.test(col) ? col : "#ffd27f"; // 0.11: only a real colour reaches the HTML
    return `<div class="lclr"><span>Colour</span><button class="${col === "auto" ? "on" : ""}" data-act="lightauto" title="Use the real colour of smart lights. Plain lights glow warm white.">Auto</button>
      <input type="range" id="lightk" min="2200" max="6500" step="100" value="${k}" class="${col.startsWith("k:") ? "on" : ""}" aria-label="Warm to cool white" title="Pick a white: warm ↔ cool">
      <input type="color" id="lighthex" value="${hex}" class="${col.startsWith("#") ? "on" : ""}" aria-label="Custom colour" title="Pick any colour"></div>`;
  },

  _lightSectionHtml(d) {
    if (!this.work.positions[d.id] || !this._isLight(d.id)) return "";
    const s = this._shape(d.id);
    const W = this._realW();
    const v = (pct) => (W ? ((pct * W) / 100).toFixed(1) : pct.toFixed(1));
    const u = W ? "m" : "% of the plan";
    const appl = !this._isTv(d.id) && (this._applType(d.id) || ((this.work.positions[this._bondLeader(d.id)] || {}).as === "none_appl" ? "none_appl" : null));
    if (appl) {
      // 0.7.4: appliances: a drum (machine seen from the front) or a line (seen from above / built in).
      const kinds = [["washer", "Washer"], ["dryer", "Dryer"], ["dishwasher", "Dishwasher"], ["none_appl", "Not an appliance"]];
      const shapes = [["drum", "Drum"], ["line", "Line"], ["none", "None"]];
      const lead = this._bondLeader(d.id);
      const setBy = (this.work.positions[lead] || {}).as;
      return `<div class="lsec"><div class="lh">🫧 Appliance on the plan<small>${setBy ? "set by you" : "recognised"}</small></div>
        <div class="lchips">${kinds.map(([k, l]) => `<button class="${appl === k ? "on" : ""}" data-act="applas" data-as="${k}">${l}</button>`).join("")}</div>
        ${appl === "none_appl" ? "" : `<div class="lchips">${shapes.map(([k, l]) => `<button class="${s.type === k ? "on" : ""}" data-act="lighttype" data-type="${k}">${l}</button>`).join("")}</div>`}
        <div style="font-size:12px;color:var(--df-sec)">${appl === "none_appl" ? "Treated as a normal device." : s.type === "drum" ? "Put the marker on the machine's drum in your plan and drag the handle to its size." : s.type === "line" ? "Drag the two handles to the ends of the machine (e.g. under the kitchen counter)." : "No effect on the card."} On the card (Live), it glows while it works: aqua for water, warm for drying, green when finished. Tap shows its status, never the plug.${this._bondOf(d.id) ? " Readings come from the whole bond (plug power, door, status)." : " Tip: bond its plug and door sensor with it."}</div></div>`;
    }
    if (this._isTv(d.id)) {
      // 0.7.4: TV glow: the screen is a line (drag its other end), the glow reaches into the room and widens.
      const on = s.type === "screen";
      return `<div class="lsec"><div class="lh">📺 TV glow on the plan<small>${s.auto ? "automatic" : "set by you"}</small></div>
        <div class="lchips"><button class="${on ? "on" : ""}" data-act="lighttype" data-type="screen">Screen</button><button class="${!on ? "on" : ""}" data-act="lighttype" data-type="none">None</button></div>
        ${on ? `<div class="lsz"><label>Reach <input id="lightr" inputmode="decimal" value="${v(s.r)}"></label>${u}<label>Spread <input id="lighta" inputmode="numeric" value="${Math.round(s.a ?? 20)}"></label>°</div>` : ""}
        <div style="font-size:12px;color:var(--df-sec)">${on ? "Drag the two orange handles to the ends of the screen, along the wall; the TV marker can sit anywhere. While the TV is on, the card shows a soft, slowly changing glow from the screen into the room." : "No glow on the card."}</div></div>`;
    }
    const types = [["bulb", "Bulb"], ["spot", "Spot"], ["strip", "Strip"], ["panel", "Panel"], ["wall", "Wall lamp"], ["xmas", "🎄 Christmas lights"], ["none", "None"]];
    let size = "";
    if (s.type === "panel") size = `<label>Width <input id="lightw" inputmode="decimal" value="${v(s.w)}"></label><label>Height <input id="lighth" inputmode="decimal" value="${v((s.h / this._ratio()))}"></label>${u}`;
    else if (s.type !== "none" && s.type !== "xmas") size = `<label>${s.type === "strip" ? "Glow width" : "Radius"} <input id="lightr" inputmode="decimal" value="${v(s.r)}"></label>${u}`;
    // 0.12.6: a bond of lamps: one light for the whole bond (default) or one per lamp, each at its own place.
    const bd = this._bondOf(d.id);
    const lampsOf = bd ? bd[1].filter((m) => this.work.positions[m]) : [];
    const lead = this._lightLead(d.id);
    const mName = (m) => (this.byId.get(m) || {}).name || m;
    const bondRow = bd && lampsOf.length > 1
      ? `<div class="lchips"><button class="${this._lampMode(d.id) ? "" : "on"}" data-act="bondlights" data-v="">One light for the whole bond</button><button class="${this._lampMode(d.id) ? "on" : ""}" data-act="bondlights" data-v="lamp">One light per lamp</button></div>
        ${this._lampMode(d.id) ? `<div class="lchips">${lampsOf.map((m) => { const t = (this.work.positions[m].light || {}).type; return `<button class="${m === lead ? "on" : ""}" data-act="lampof" data-m="${esc(m)}">${esc(mName(m))}: ${esc(t ? (types.find((x) => x[0] === t) || [t, t])[1] : "Bulb")}</button>`; }).join("")}</div>` : ""}`
      : "";
    return `<div class="lsec"><div class="lh">💡 Light on the plan<small>${s.auto ? "automatic" : "set by you"}</small></div>${bondRow}
      <div class="lchips">${types.map(([k, l]) => `<button class="${s.type === k && !(s.auto && k !== "bulb") ? "on" : ""}" data-act="lighttype" data-type="${k}">${l}</button>`).join("")}</div>
      ${size ? `<div class="lsz">${size}</div>` : ""}
      ${s.type === "xmas" ? this._xmasHtml(s) : s.type === "none" ? "" : this._lightColourHtml(s)}
      <div style="font-size:12px;color:var(--df-sec)">${s.type === "none" ? "No light pool on the card." : "Drag the orange handle on the plan. The card draws a soft light pool here when the light is on."}${this._bondOf(d.id) ? (this._lampMode(d.id) ? " Each lamp has its own light; it glows while that lamp is on." : " One light for the whole bond.") : ""}</div></div>`;
  },

  _extraCtlHtml() {
    if (this.s.tool !== "place") return "";
    return `<button class="ovbtn ${this.s.nightPrev ? "on" : ""}" data-act="nightprev" aria-pressed="${!!this.s.nightPrev}" title="See it at night: all light shapes glow as if on" aria-label="See it at night">${SVG.moon}</button>`;
  },

  _extraLayerRows() {
    const on = this.s.layers.lightshapes === true;
    const sh = this.s.layers.roomshapes !== false;
    const hasShapes = this.work && Object.keys(this.work.shapes || {}).length;
    return `${hasShapes ? `<button class="lrow ${sh ? "" : "off"}" data-act="layer" data-key="roomshapes" aria-pressed="${sh}"><span class="eye">${SVG.eye}</span><span class="l">Room shapes</span></button>` : ""}<button class="lrow ${on ? "" : "off"}" data-act="layer" data-key="lightshapes" aria-pressed="${on}"><span class="eye">${SVG.eye}</span><span class="l">Light shapes</span></button>`;
  },

  /** Night preview and light-shape outlines in the SVG layer. */
  _lightSvg() {
    if (!this.work) return "";
    const s = this.s;
    const lights = Object.keys(this.work.positions).filter((id) => this.byId.get(id) && !this.skipped.has(id) && (this._bondLeader(id) === id || this._lampMode(id)) && this._isLight(id));
    let out = "";
    const selLead = s.sel && this.work.positions[s.sel] && this._isLight(s.sel) ? this._lightLead(s.sel) : null;
    // 0.12.6: a per-lamp bond shows all its lamps' shapes while selected.
    const mates = selLead && this._lampMode(s.sel) ? (this._bondOf(s.sel) || [null, []])[1].filter((m) => m !== selLead && this.work.positions[m]) : [];
    if (s.layers.lightshapes === true) for (const id of lights) if (id !== selLead && !mates.includes(id)) out += this._shapeSvg(this._shape(id, this._lampMode(id)), "");
    for (const m of mates) out += this._shapeSvg(this._shape(m, true), "");
    if (selLead) out += this._shapeSvg(this._shape(selLead, true), "sel");
    if (s.sel && this.work.positions[s.sel] && this._climateEnt(s.sel) && this._canCool(this._climateEnt(s.sel))) out += this._airSvg(this._air(s.sel), true);
    // 0.7.0: openings (doors, windows, shutters): all faint, the selected one bold.
    for (const id of Object.keys(this.work.positions)) {
      const g = this._openGeo(id);
      if (!g) continue;
      const o = g.geo;
      const sel = id === s.sel || (g.base && g.base === s.sel);
      const col = this._openAs(id) === "shutter" ? "#ffffff" : "#26c6da";
      // Twins: a few screen pixels beside the bar (perpendicular).
      let ox = 0, oy = 0;
      if (g.merged) continue; // 0.7.3: combined into the other's bar
      if (g.side) {
        const W = (this._vpW || 800) * (s.z || 1), H = (this._vpH || 500) * (s.z || 1);
        const dx = ((o.x2 - o.x1) * W) / 100, dy = ((o.y2 - o.y1) * H) / 100;
        const L = Math.hypot(dx, dy) || 1;
        ox = ((-dy / L) * 9 * g.side * 100) / W;
        oy = ((dx / L) * 9 * g.side * 100) / H;
      }
      out += `<line x1="${(o.x1 + ox) * 10}" y1="${(o.y1 + oy) * 10}" x2="${(o.x2 + ox) * 10}" y2="${(o.y2 + oy) * 10}" stroke="${col}" stroke-opacity="${sel ? 0.95 : 0.45}" stroke-width="${sel ? 6 : 4}" stroke-linecap="round" vector-effect="non-scaling-stroke"${sel ? "" : ' stroke-dasharray="8 6"'}/>`;
    }
    return out;
  },

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
  },
});
