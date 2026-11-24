Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.7.4: Comfort heatmap. Each shaped room is coloured from the temperatures on the plan: its own
   *  sensors count fully, rooms open to it (shapes that overlap) count less, the rest only a little, so a
   *  room with one sensor still gets a warmer and a cooler side. 0.8.1: rooms are open to each other where
   *  their shapes touch or overlap (as for daylight), and a room without a sensor takes a gradient from the
   *  rooms it opens into, also step by step (hallway → corridor → bedroom), slightly faded as an estimate.
   *  Only a room with no way to any sensor stays uncoloured. Scale: lowest to highest reading shown now. */
  _heatGrid(a, specs, ratio) {
    const rooms = Object.entries(a.areas || {}).filter(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3);
    if (!rooms.length) return null;
    // The temperatures Comfort shows, each sensor once and at its own spot: a phantom counts with its real
    // member sensors where they are placed (also when they are hidden from Comfort), at the phantom's
    // spot only when a member has no spot of its own. A sensor shown both on its own and in a phantom counts once.
    const hass = this._hass;
    const spotOf = {};
    for (const d of Object.values(a.devices || {})) if (d.x != null) for (const e of d.entities || []) if (!spotOf[e]) spotOf[e] = d;
    for (const [e, d] of Object.entries(a.entities || {})) if (d && d.x != null) spotOf[e] = d;
    const tempOf = (e) => {
      const st = hass.states[e];
      if (!live(st)) return null;
      if (domainOf(e) === "climate") return num(st.attributes.current_temperature) ? Number(st.attributes.current_temperature) : null;
      return kindOf(e, st) === "temperature" && num(st.state) ? Number(st.state) : null;
    };
    const byEnt = new Map();
    for (const sp of specs) {
      for (const e of new Set((sp.heatEnts || sp.ents || []).map((x) => String(x).split("#")[0]))) {
        const v = tempOf(e);
        if (v == null) continue;
        const at = sp.phantom ? spotOf[e] || sp : sp;
        const prev = byEnt.get(e);
        if (prev && !(prev.viaPhantom && !sp.phantom)) continue;
        byEnt.set(e, { x: at.x, y: at.y, v, viaPhantom: !!sp.phantom });
      }
    }
    const pts = [...byEnt.values()].map((p) => ({ ...p, ri: rooms.findIndex(([, r]) => inPoly(p.x, p.y, r.shape)) }));
    if (!pts.length) return null;
    const GW = 120;
    const GH = Math.max(20, Math.round(GW / ratio));
    const cellRooms = new Array(GW * GH);
    // Open to each other: shapes that touch or overlap; hops = steps between two rooms.
    const n = rooms.length;
    const link = rooms.map(() => new Set());
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const A = rooms[p][1].shape;
      const B = rooms[q][1].shape;
      if (polysOverlap(A, B) || polysTouch(A, B)) {
        link[p].add(q);
        link[q].add(p);
      }
    }
    const hops = rooms.map((_r, k) => {
      const d = new Array(n).fill(Infinity);
      d[k] = 0;
      const queue = [k];
      while (queue.length) {
        const c = queue.shift();
        for (const q of link[c]) if (d[q] === Infinity) {
          d[q] = d[c] + 1;
          queue.push(q);
        }
      }
      return d;
    });
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = ((i + 0.5) / GW) * 100;
        const y = ((j + 0.5) / GH) * 100;
        const inside = [];
        rooms.forEach(([, r], k) => {
          if (inPoly(x, y, r.shape)) inside.push(k);
        });
        cellRooms[j * GW + i] = inside;
      }
    }
    const own = rooms.map((_r, k) => pts.some((p) => p.ri === k));
    const lit = rooms.map((_r, k) => own[k] || own.some((o, q) => o && hops[k][q] < Infinity));
    let lo = Math.min(...pts.map((p) => p.v));
    let hi = Math.max(...pts.map((p) => p.v));
    if (hi - lo < 1.5) {
      const mid = (hi + lo) / 2;
      lo = mid - 0.75;
      hi = mid + 0.75;
    }
    const val = new Float32Array(GW * GH).fill(NaN);
    const est = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const inside = cellRooms[j * GW + i];
        const k = inside.find((q) => lit[q]);
        if (k == null) continue;
        const x = ((i + 0.5) / GW) * 100;
        const y = ((j + 0.5) / GH) * 100;
        let sw = 0;
        let sv = 0;
        if (!inside.some((q) => own[q])) est[j * GW + i] = 1;
        for (const p of pts) {
          const h = p.ri < 0 ? Infinity : Math.min(...inside.map((q) => hops[q][p.ri]));
          const f = h === 0 ? 1 : Math.max(0.08, 0.4 ** h);
          const d2 = (x - p.x) ** 2 + ((y - p.y) / ratio) ** 2;
          const w = f / (d2 + 4);
          sw += w;
          sv += w * p.v;
        }
        val[j * GW + i] = sv / sw;
      }
    }
    // Smooth twice (only inside the coloured area) so the bands and contour lines come out soft.
    for (let pass = 0; pass < 2; pass++) {
      const src = val.slice();
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          if (Number.isNaN(src[j * GW + i])) continue;
          let n = 0;
          let t = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
            const v = src[jj * GW + ii];
            if (!Number.isNaN(v)) {
              n++;
              t += v;
            }
          }
          val[j * GW + i] = t / n;
        }
      }
    }
    if (!lit.some(Boolean)) return null;
    const range = hi - lo;
    const step = range <= 2 ? 0.25 : range <= 4 ? 0.5 : 1;
    return { GW, GH, val, est, lo, hi, step, rooms: rooms.map(([, r], k) => (lit[k] ? r.shape : null)).filter(Boolean) };
  },

  _drawHeat() {
    const h = this._heat;
    const cv = this.shadowRoot && this.shadowRoot.querySelector("canvas.heat");
    if (!h || !cv) return;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const { GW, GH, val, est, lo, hi, step } = h;
    const small = document.createElement("canvas");
    small.width = GW;
    small.height = GH;
    const sx = small.getContext("2d");
    const img = sx.createImageData(GW, GH);
    for (let k = 0; k < GW * GH; k++) {
      const v = val[k];
      if (Number.isNaN(v)) continue;
      const [r, g, b] = heatRgb((v - lo) / (hi - lo));
      img.data.set([r, g, b, est && est[k] ? 165 : 255], k * 4);
    }
    sx.putImageData(img, 0, 0);
    // Only inside the rooms that get a colour.
    ctx.save();
    ctx.beginPath();
    for (const sh of h.rooms) {
      sh.forEach(([x, y], i) => (i ? ctx.lineTo((x / 100) * W, (y / 100) * H) : ctx.moveTo((x / 100) * W, (y / 100) * H)));
      ctx.closePath();
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(4, W / 90).toFixed(1)}px)`;
    ctx.globalAlpha = this._heatOp() / 100;
    ctx.drawImage(small, 0, 0, W, H);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    // Soft white contour lines (marching squares on the smoothed grid).
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 0.7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cw = W / GW;
    const ch = H / GH;
    const at = (i, j) => val[j * GW + i];
    for (let lv = Math.ceil(lo / step) * step; lv < hi; lv += step) {
      ctx.beginPath();
      for (let j = 0; j < GH - 1; j++) {
        for (let i = 0; i < GW - 1; i++) {
          const a0 = at(i, j);
          const b0 = at(i + 1, j);
          const c0 = at(i + 1, j + 1);
          const d0 = at(i, j + 1);
          if (Number.isNaN(a0) || Number.isNaN(b0) || Number.isNaN(c0) || Number.isNaN(d0)) continue;
          const e = [];
          const cross = (v1, v2, x1, y1, x2, y2) => {
            if ((v1 < lv) === (v2 < lv)) return;
            const t = (lv - v1) / (v2 - v1);
            e.push([(x1 + (x2 - x1) * t + 0.5) * cw, (y1 + (y2 - y1) * t + 0.5) * ch]);
          };
          cross(a0, b0, i, j, i + 1, j);
          cross(b0, c0, i + 1, j, i + 1, j + 1);
          cross(d0, c0, i, j + 1, i + 1, j + 1);
          cross(a0, d0, i, j, i, j + 1);
          for (let q = 0; q + 1 < e.length; q += 2) {
            ctx.moveTo(e[q][0], e[q][1]);
            ctx.lineTo(e[q + 1][0], e[q + 1][1]);
          }
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Heatmap strength in % (viewer's slider, else the card's setting, else 52). */
  /** Strength of the Last cleaned colours: this browser's slider, else the card setting. */
  _cleanOp() {
    const v = (this._lay.cleaning || {}).op;
    const d = Number((this._config.cleaning || {}).opacity);
    return Number.isFinite(v) ? v : Number.isFinite(d) && d > 0 ? d : 60;
  },

  /** Under the plan in Cleaning: what the colours mean, and how strong they are. */
  _cleanLegendHtml() {
    if (this._overlay !== "cleaning" || !this._layerOn("cleaning", "fresh", true) || !Object.keys((this._a || {}).robots || {}).length) return "";
    const sw = (c, t) => `<span class="cl"><i style="background:${c}"></i>${t}</span>`;
    return `<div class="heatleg cleanleg"><span class="ht">${dfT("clean.last_cleaned")}</span>${sw("rgba(33,150,243,.55)", dfT("clean.leg_now"))}${sw("rgba(76,175,80,.85)", dfT("clean.leg_fresh"))}${sw("rgba(255,152,0,.7)", dfT("clean.due"))}<span class="hb"></span><label class="hop" title="${dfT("leg.colour_strength")}"><ha-icon icon="mdi:circle-opacity"></ha-icon><input type="range" min="15" max="100" step="5" value="${this._cleanOp()}" data-cleanop="1" aria-label="${dfT("leg.colour_strength")}"></label></div>`;
  },

  _heatOp() {
    const v = (this._lay.comfort || {}).heatOp;
    const d = Number(this._ov("comfort").heatmap_opacity);
    return Number.isFinite(v) ? v : Number.isFinite(d) && d > 0 ? d : 52;
  },

  _heatLegendHtml() {
    const h = this._heat;
    const f = (v) => `${this._num1 ? this._num1(v) : v.toFixed(1)}°`;
    const grad = HEAT_STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${Math.round(t * 100)}%`).join(", ");
    return `<div class="heatleg"><span class="ht">${dfT("heat.room_temp")}</span><div class="hb"><div class="bar" style="background:linear-gradient(90deg, ${grad})"></div><div class="tk"><span>${f(h.lo)}</span><span>${f((h.lo + h.hi) / 2)}</span><span>${f(h.hi)}</span></div></div><span class="est">${dfT("heat.estimated")}</span><label class="hop" title="${dfT("heat.strength")}"><ha-icon icon="mdi:circle-opacity"></ha-icon><input type="range" min="15" max="90" step="5" value="${this._heatOp()}" data-heatop="1" aria-label="${dfT("heat.strength")}"></label></div>`;
  },

  /** Rooms (#53): names at their spots, in the overlays chosen in the editor. */
  _roomsHtml(a) {
    const r = this._rooms();
    const names = this._layerOn(this._overlay, "rooms", this._roomsDefault(this._overlay));
    // 0.10: how long ago each room was cleaned belongs to the Last cleaned layer (alone when names are off).
    const ages = this._overlay === "cleaning" && this._layerOn("cleaning", "fresh", true);
    const ew = this._overlay === "energy" ? this._eRooms(2) : null; // 0.11: energy per room
    if (!names && !ages && !ew) return "";
    const size = { s: 11, m: 13, l: 16 }[r.size] || 13;
    // A marker (or a robot's dock) right on a room name: the name steps aside, up or down, away from it.
    const pts = [...(this._specs ? this._specs.values() : [])].map((sp) => ({ x: +sp.x, y: +sp.y }));
    for (const rb of this._rb || []) if (rb.d.dock && Array.isArray(rb.cfg.m)) pts.push(rbApply(rb.cfg.m, rb.d.dock));
    const nudge = (room) => {
      const hit = pts.find((q) => Math.abs(q.x - room.x) < 4 && Math.abs(q.y - room.y) < 3.5);
      return hit ? `transform:translate(-50%, calc(-50% ${hit.y >= room.y ? "-" : "+"} ${Math.round(size * 1.6)}px));` : "";
    };
    return Object.entries(a.areas || {}).filter(([id]) => !(r.hidden || []).includes(id)).map(([id, room]) => {
      const nw = ages && (a.now || {})[id];
      const c = ages && ((a.cleaned || {})[id] || {}).t;
      const pw = ew && ew[id] > 0 ? `<small class="rage epw">${cesc(this._eFmt(ew[id]))}</small>` : "";
      if (!names && !c && !nw && !pw) return "";
      const name = (r.names && r.names[id]) || room.name;
      const icon = names && r.style === "pill_icon" ? `<ha-icon icon="${cesc(room.icon || "mdi:texture-box")}"></ha-icon>` : "";
      const cls = r.style === "label" ? "label" : "pill";
      // Being cleaned now: progress instead of the age (it counts as cleaned when the run ends).
      const age = nw ? `<small class="rage now">${cesc(nw.pct != null ? `${dfT("clean.cleaning_l")} · ${nw.pct}%` : dfT("clean.cleaning_l"))}</small>` : c ? `<small class="rage">${cesc(this._ageTxt(c))}</small>` : "";
      const tap = this._overlay === "cleaning" && Object.keys(a.robots || {}).length ? ` data-croom="${cesc(id)}"` : "";
      return `<div class="room ${cls}${tap ? " ctap" : ""}${names ? "" : " solo"}"${tap} style="left:${room.x}%;top:${room.y}%;font-size:${size}px;${nudge(room)}" title="${cesc(name)}">${icon}${names ? cesc(name) : ""}${age}${pw}</div>`;
    }).join("");
  },

  /** test11: the Matter mark = Home Assistant's own brand image (2026.3+: its local brands API, else the brands
   *  site), drawn white like the other marks; our "M" until it is there and when it can't load. */
  _matterMark() {
    const b = (DFC_BRAND.matter = DFC_BRAND.matter || {});
    if (!b.asked && this._live) {
      b.asked = true;
      const done = (url) => {
        b.url = url;
        this._update(true);
      };
      this._live.callWS({ type: "brands/access_token" })
        .then((r) => done(`/api/brands/integration/matter/icon.png?placeholder=no&token=${encodeURIComponent((r && r.token) || r)}`))
        .catch(() => done("https://brands.home-assistant.io/matter/icon.png"));
    }
    return b.url && !b.bad ? `<img class="nbm" src="${cesc(b.url)}" alt="" data-brand="matter">` : `<b class="nbm">M</b>`;
  },

  _markerHtml(s) {
    if (s.item && this._overlay === "live" && this._picStands(s.item)) return ""; // 0.12.2: its picture stands there
    if (s.cam && (this._overlay === "live" || this._overlay === "security")) return this._camHtml(s);
    if (s.type === "net") {
      const r = ROLES[s.role] || ROLES.device;
      const cls = ["m", edgeCls(s.x, s.y, this._em), "net", r.shape, s.role, s.sz || "", this._hl === s.key ? "hl" : ""].join(" ");
      const mark = s.conn === "matter" ? this._matterMark() : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`;
      return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-fill:${r.color};--dfc-ring:${s.ring || "transparent"}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.conns.map((c) => CONNS[c].label).join(", ")}`)}"><span class="ic">${mark}</span>${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const icon = s.icon
      ? `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`
      : s.eid && this._hass.states[s.eid]
        ? `<ha-state-icon data-ent="${cesc(s.eid)}"></ha-state-icon>`
        : `<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
    // 0.12.6: the icon is the fallback look: a device drawn by its touch area (or its light while on) has none.
    const noi = !!s.noicon || !!(s.item && this._per(s.item, this._overlay).noicon) || this._lookHere(s);
    const cls = ["m", edgeCls(s.x, s.y, this._em), s.kind, s.on ? "on" : "off", s.dim ? "dim" : "", s.unavail ? "unavail" : "", this._hl === s.key ? "hl" : "", s.glow ? "glow" : "", s.extras && s.extras.length ? "hasx" : "", noi ? "noi" : "", this._pick && this._selId === s.item.id ? "sel" : "", s.ghost ? "ghost" : ""].join(" ");
    // #112: a light that's on shows its real colour (or the lamp colour from the Editor).
    let lc = "";
    if (s.kind === "light" && s.on) {
      const st0 = s.eid && this._hass.states[s.eid];
      const rgb = bulbRgb(st0 ? st0.attributes : {}, s.item.light && s.item.light.color);
      if (rgb) lc = `;--dfc-lc:rgb(${rgb})`;
    }
    const xs = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const bond = ""; // #86: a bond is one device on the card, no badge
    const label = `${s.name}${s.st ? ` · ${this._fmt(s.eid)}` : ""}`;
    return `<button class="${cls}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}${lc}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(label)}"><span class="ic">${icon}${bond}${s.badge && !noi ? `<span class="bdg">${cesc(s.badge)}</span>` : ""}</span>${s.badge && noi ? `<span class="bdg nb">${cesc(s.badge)}</span>` : ""}${s.value ? `<span class="val">${cesc(s.value)}</span>` : ""}${xs}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}${s.item.ofName ? `<br><small>${dfT("net.through", { d: cesc(s.item.ofName) })}${(s.item.conns || []).length ? ` · ${cesc(s.item.conns.map((c) => (CONNS[c] || { label: c }).label).join(" + "))}` : ""}</small>` : ""}</span></button>`;
  },

  _chipHtml(s) {
    const bdg = s.badge ? `<span class="bdg">${cesc(s.badge)}</span>` : "";
    const xl0 = s.extras && s.extras.length ? `<span class="xs">${s.extras.map((x) => `<span class="xl">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}${cesc(x.text)}</span>`).join("")}</span>` : "";
    const xl = xl0 + bdg;
    if (s.cl2 && s.compact) {
      return `<button class="chip cl2 cmp ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.temp].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${s.word && (s.temp || s.word !== dfT("climate.off")) ? `<span class="mw">${cesc(s.word)}</span>` : ""}${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.cl2) {
      const left = s.word || s.set ? `<span class="mc"><span class="mw">${cesc(s.word)}</span>${s.set ? `<span class="st">${cesc(s.set)}</span>` : ""}</span>` : "";
      const right = s.temp || s.hum ? `${left ? `<span class="vs"></span>` : ""}<span class="tc">${s.temp ? `<span class="t">${cesc(s.temp)}</span>` : ""}${s.hum ? `<span class="h"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.hum)}</span>` : ""}</span>` : "";
      return `<button class="chip cl2 ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${[s.word, s.set, s.temp, s.hum].filter(Boolean).join(", ")}`)}">${s.noicon ? "" : `<ha-icon icon="${cesc(s.icon)}"></ha-icon>`}${left}${right}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    if (s.rd && !s.icon) {
      // #94: readings in the AC chip style: temperature large, 💧 humidity small under it.
      const t = s.rd.t ? `<span class="t">${cesc(s.rd.t.replace(/\s?°C|\s?°F/, "°"))}</span>` : "";
      const h = s.rd.h ? `<span class="${t ? "h" : "t"}"><ha-icon icon="mdi:water"></ha-icon>${cesc(s.rd.h)}</span>` : "";
      return `<button class="chip rd ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}"><span class="tc">${t}${h}</span>${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
    }
    const first = s.icon ? `<span class="ico"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.lines[0] || "")}</span>` : `<span class="l1">${cesc(s.lines[0] || "")}</span>`;
    return `<button class="chip ${s.cls} ${this._hl === s.key ? "hl" : ""} ${this._pick && this._selId === s.item.id ? "sel" : ""} ${s.ghost ? "ghost" : ""}" style="left:${s.x}%;top:${s.y}%;${s.color ? `--dfc-c:${s.color}` : ""}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name}: ${s.lines.join(", ")}`)}">${first}${s.lines[1] ? `<span class="l2">${cesc(s.lines[1])}</span>` : ""}${xl}${this._xb(s)}<span class="tip">${cesc(s.name)}${this._tipState(s) ? `<span class="tst"> · ${cesc(this._tipState(s))}</span>` : ""}</span></button>`;
  },

  /** Connections present on this plan (for the layers menu). */
  _connsPresent(a) {
    const set = new Set();
    for (const s of (this._specs || new Map()).values()) for (const cn of s.conns || []) set.add(cn);
    for (const d of Object.values(a.devices || {})) for (const cn of d.conns || []) if (CONNS[cn]) set.add(cn);
    return CONN_ORDER.filter((cn) => set.has(cn));
  },

  _layersBtn(rail = false) {
    return `<button class="layers ${this._menu ? "on" : ""}" data-menu="1" title="${dfT("layers")}" aria-label="${dfT("layers")}" aria-expanded="${this._menu}"><ha-icon icon="mdi:layers-outline"></ha-icon>${rail ? "" : `<span>${dfT("layers")}</span>`}</button>`;
  },

  _layersMenu(a) {
    const present = this._connsPresent(a);
    const n = this._net;
    const shown = this._netShow();
    const custom = Array.isArray(n.conns) && n.conns.length;
    const chk = (on) => `<ha-icon class="eye" icon="${on ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline"}"></ha-icon>`;
    const tick = (on) => `<ha-icon class="eye" icon="${on ? "mdi:eye" : "mdi:eye-off-outline"}"></ha-icon>`;
    // 0.7.3: only what applies to the connections shown.
    const hasZ = present.includes("zigbee") && shown.includes("zigbee");
    const hasW = shown.includes("network") && [...(this._specs || new Map()).values()].some((s) => s.rt);
    const hasH = [...(this._specs || new Map()).values()].some((s) => s.type === "net" && s.item.via && this._specs.has(s.item.via));
    const ov = this._overlay;
    const rooms = this._layerOn(ov, "rooms", this._roomsDefault(ov));
    const lay = (name, icon, label) => {
      const on = this._layerOn(ov, name, this._layerDefault(ov, name));
      return `<button class="${on ? "on" : ""}" data-lay="${name}">${tick(on)}<ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    };
    const comfort = ov === "comfort" ? `${lay("heat", "mdi:thermometer-lines", dfT("lay.heat"))}${lay("labels", "mdi:thermometer", dfT("lay.labels"))}${lay("clim", "mdi:air-conditioner", dfT("lay.clim"))}${lay("air", "mdi:weather-windy", dfT("lay.air"))}` : "";
    const reset = this._lay[ov] || (ov === "network" && Object.keys(lsGet(`dfc_net_${this._lsKey()}`) || {}).length) ? `<hr><button data-layreset="1"><ha-icon icon="mdi:restore"></ha-icon>${dfT("lay.reset")}</button>` : "";
    const running = (this._rb || []).some((r) => r.active);
    const rpath = (ov === "live" && (this._rb || []).length) || ov === "cleaning" ? lay("rpath", "mdi:vector-polyline", ov === "cleaning" && !running ? dfT("lay.path_last") : dfT("lay.path")) : "";
    const fresh = ov === "cleaning" ? lay("fresh", "mdi:clock-check-outline", dfT("clean.last_cleaned")) : "";
    const secAll = ov === "security" ? lay("all", "mdi:shield-search", dfT("lay.all_sensors")) : "";
    // 0.11: Cameras, and with 2+ cameras one tick per camera (this screen only; triggers still pop up).
    const camItems = (ov === "live" || ov === "security") && this._a ? this._items(this._a).filter((it) => this._camOf(it)) : [];
    const camsOn = camItems.length && this._layerOn(ov, "cams", false);
    const snaps = camItems.length && this._rpOn() ? `<button class="dis" disabled title="${dfT("lay.no_cam_replay")}"><ha-icon class="eye" icon="mdi:eye-off-outline"></ha-icon><ha-icon icon="mdi:cctv-off"></ha-icon>${dfT("lay.cams_not_replay")}</button>` : camItems.length ? lay("cams", "mdi:cctv", dfT("lay.cams")) + (camsOn && camItems.length > 1 ? camItems.map((it) => lay(`cam:${it.id}`, "mdi:circle-small", cesc(this._dev(it.id).name || it.name)).replace("<button ", '<button style="padding-left:28px" ')).join("") : "") : "";
    const elec = ov === "energy" ? `${lay("fill", "mdi:texture-box", dfT("lay.fill"))}${lay("flow", "mdi:transit-connection-variant", dfT("lay.flow"))}` : "";
    const general = `<h4>${dfT("layers")}</h4><button class="${rooms ? "on" : ""}" data-lay="rooms">${tick(rooms)}<ha-icon icon="mdi:label-outline"></ha-icon>${dfT("lay.rooms")}</button>${comfort}${rpath}${fresh}${secAll}${snaps}${elec}`;
    if (ov !== "network") return `<div class="lmenu" role="menu" style="visibility:hidden">${general}${reset}</div>`;
    return `<div class="lmenu" role="menu" style="visibility:hidden">${general}<hr><h4>${dfT("net.connections")}</h4>
      <button class="chk ${!custom ? "on" : ""}" data-conn="__default">${chk(!custom)}<ha-icon icon="mdi:star-outline"></ha-icon>${dfT("net.default")}</button>
      ${present.map((cn) => `<button class="chk ${custom && shown.includes(cn) ? "on" : ""}" data-conn="${cn}">${chk(custom && shown.includes(cn))}<ha-icon icon="${CONNS[cn].icon}"></ha-icon>${cesc(CONNS[cn].label)}</button>`).join("")}
      <hr>
      ${hasZ ? `<button class="${n.links ? "on" : ""}" data-tg="links">${tick(n.links)}${dfT("net.zigbee_links")}</button>` : ""}
      ${hasW ? `<button class="${n.wlinks ? "on" : ""}" data-tg="wlinks">${tick(n.wlinks)}${dfT("net.wifi_links")}</button>` : ""}
      ${hasH || n.hubs === false ? `<button class="${n.hubs ? "on" : ""}" data-tg="hubs">${tick(n.hubs)}${dfT("net.hub_links")}</button>` : ""}
      <button class="${n.legend ? "on" : ""}" data-tg="legend">${tick(n.legend)}${dfT("net.legend")}</button>
      ${shown.includes("bluetooth") && this._people().some((p) => p.distance) ? `<hr><h4>${dfT("ov.people")}</h4>${lay("pdist", "mdi:account-badge-outline", dfT("lay.pdist"))}${this._layerOn(ov, "pdist", true) ? lay("pall", "mdi:radar", dfT("lay.pall")) : ""}` : ""}
${reset}
    </div>`;
  },

  /** Roles of the devices in Network on this floor (incl. hidden ones, so they can be switched back on). */
  _rolesPresent() {
    const saved = this._net.roles;
    this._net.roles = [];
    const set = new Set();
    try {
      const a = this._a || (this._sensor() || {}).attributes || {};
      const cx = this._ctx(a);
      for (const item of this._items(a)) for (const s of this._netSpecs(item, item.name, cx, false)) set.add(s.role);
    } finally {
      this._net.roles = saved;
    }
    return Object.keys(ROLES).filter((r) => set.has(r)); // 0.13.9.3: every role drawn gets its legend entry
  },

  /** 0.8.1: the legend shows only what is drawn now, in small groups (roles · LQI · lines · access points · Refresh). */
  _legendHtml(specs, withLayers) {
    const groups = [];
    const showWifi = this._netShow().includes("network");
    if (this._net.legend) {
      const hidden = this._net.roles || [];
      const roles = this._rolesPresent();
      if (roles.length) groups.push(roles.map((r) => `<button class="lg ${hidden.includes(r) ? "off" : ""}" data-role="${r}" aria-pressed="${!hidden.includes(r)}" title="${dfT("net.show_hide")}"><i class="${ROLES[r].shape}" style="background:${ROLES[r].color}"></i>${ROLES[r].label}</button>`).join(""));
      // The LQI ranges switch their Zigbee links on and off, like the roles do.
      if (specs.some((s) => s.z && s.z.lqi != null)) groups.push(`<span class="lt">LQI</span>${LQI_BANDS.slice().reverse().map((b) => `<button class="lg ${(this._net.lqiOff || []).includes(b.min) ? "off" : ""}" data-lqi="${b.min}" aria-pressed="${!(this._net.lqiOff || []).includes(b.min)}" title="${dfT("net.show_hide_range")}"><i class="ring" style="border-color:${b.color}"></i>${b.label}</button>`).join("")}`);
      if (specs.some((s) => s.sigEid && !(s.z && s.z.lqi != null))) groups.push(`<span class="lt">${dfT("net.signal")}</span><span><i class="ring" style="border-color:#43a047"></i>${dfT("net.good")}</span><span><i class="ring" style="border-color:#fb8c00"></i>${dfT("net.fair")}</span><span><i class="ring" style="border-color:#e53935"></i>${dfT("net.weak")}</span>`);
      // Lines: only the kinds actually drawn (same rules as the lines themselves).
      const lines = [];
      const hubDrawn = this._net.hubs && (specs.some((s) => {
        const pa = s.item && s.item.via && this._specs.get(s.item.via);
        return s.type === "net" && pa && pa.type === "net" && !(s.conns.includes("zigbee") && pa.conns.includes("zigbee"));
      }) || (this._ghosts || []).some((g) => g.links.some((l) => l.cls === "hub")));
      if (hubDrawn) lines.push(`<span><i class="dash"></i>${dfT("net.via_hub")}</span>`);
      const rts = showWifi ? specs.filter((s) => s.rt && s.rt.home) : [];
      if (rts.length && this._net.wlinks) lines.push(`<span><i class="cab"></i>${dfT("net.cable")}</span><span><i class="dash wf"></i>Wi-Fi</span>`);
      if (lines.length) groups.push(lines.join(""));
      if (rts.length) {
        const aps = this._apList();
        const by = {};
        for (const s of rts) {
          const k = s.rt.ap || "?";
          const b = (by[k] = by[k] || { w: 0, c: 0 });
          s.rt.lan ? b.c++ : b.w++;
        }
        groups.push(Object.entries(by).map(([k, b]) => {
          const i = aps.indexOf(k);
          const ap = this._a.aps && this._a.aps[k] && this._specs.get(this._a.aps[k]);
          const nm = ap ? ap.name : k === "?" ? dfT("role.unknown") : k;
          return `<span class="aps"><i class="sw" style="background:${AP_COLORS[(i < 0 ? 0 : i) % AP_COLORS.length]}"></i>${cesc(nm)}: ${[b.w ? `${b.w} Wi-Fi` : "", b.c ? `${b.c} ${dfT("net.cable")}` : ""].filter(Boolean).join(", ")}</span>`;
        }).join(""));
      }
    }
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    if (isAdmin && this._netShow().includes("zigbee") && (this._zha || (this._a && Object.values(this._a.devices || {}).some((d) => (d.conns || []).includes("zigbee"))))) {
      const t = this._zhaAt ? new Date(this._zhaAt).toLocaleTimeString(dfLocale(), { hour: "2-digit", minute: "2-digit" }) : "–";
      groups.push(`<span class="upd" title="${dfT("net.zha_at", { t })}"><button class="rf ${this._scanning ? "busy" : ""}" data-refresh="1" title="${dfT("net.rescan")}"><ha-icon icon="mdi:refresh"></ha-icon>${this._scanning ? dfT("net.scanning") : dfT("net.refresh")}</button>${t}</span>`);
    }
    if (withLayers) groups.push(this._layersBtn());
    return groups.length ? `<div class="legend">${groups.map((g) => `<span class="lgrp">${g}</span>`).join("")}</div>` : "";
  },

  /** Lights overlay: All off / All on / the user's scenes (#54). */
  _sceneBarHtml(specs) {
    const L = this._lights();
    const pid = (this._a || {}).plan_id;
    // Scenes for some floors only show on those floors (indices stay those of the whole list).
    const scenes = (Array.isArray(L.scenes) ? L.scenes : []).map((s, i) => [s, i]).filter(([s]) => !(Array.isArray(s.plans) && s.plans.length && !s.plans.includes(pid)));
    if (!L.all_off && !L.all_on && !scenes.length) return "";
    const ents = this._lightEnts(specs);
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    const b = [];
    if (L.all_off) b.push(`<button data-scene="all_off" class="${ents.length && !anyOn ? "on" : ""}"><ha-icon icon="mdi:lightbulb-off-outline"></ha-icon>${dfT("scene.all_off")}</button>`);
    if (L.all_on) b.push(`<button data-scene="all_on"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>${dfT("scene.all_on")}</button>`);
    scenes.forEach(([s, i]) => {
      b.push(`<button data-scene="${i}" class="${this._sceneActive(s) ? "on" : ""}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || dfT("scene.n", { n: i + 1 }))}</button>`);
    });
    return `<div class="bar" role="toolbar" aria-label="${dfT("scene.bar")}">${b.join("")}</div>`;
  },

  /** 0.10: Overlay actions: your own buttons under the plan, per overlay and per floor (any HA action, a popup…);
   *  in Cleaning first the robots' own Start / Pause / Dock. */
  _ovActs() {
    return Array.isArray(this._config.overlay_actions) ? this._config.overlay_actions : [];
  },

  /** 0.13.2: "New in <version>" pill for admins (card setting release_tips: false hides it), until closed (✕). */
  _tipHtml() {
    const h = this._hass;
    if (!RELEASE_TIP || this.preview || this._config.release_tips === false || !h || !h.user || !h.user.is_admin) return "";
    if (window.__dfcTipSeen === undefined) {
      window.__dfcTipSeen = null; // asked once per page
      Promise.resolve(h.callWS({ type: "frontend/get_user_data", key: TIP_KEY }))
        .then((r) => (window.__dfcTipSeen = (r && r.value) || ""))
        .catch(() => (window.__dfcTipSeen = RELEASE_TIP.v)) // can't tell: stay quiet
        .finally(() => window.dispatchEvent(new CustomEvent("dfc-tip")));
      return "";
    }
    if (window.__dfcTipSeen === null || window.__dfcTipSeen === RELEASE_TIP.v) return "";
    return `<div class="newov tipv"><ha-icon icon="mdi:information-outline"></ha-icon><span>${dfT("tip.new_in", { v: cesc(RELEASE_TIP.v) })}: <b>${cesc(RELEASE_TIP.text)}</b></span><button data-tipgo="1" data-add="1">${cesc(RELEASE_TIP.go)} ›</button><button data-tipx="1" aria-label="${dfT("tip.close")}">✕</button></div>`;
  },

  _tipClose() {
    window.__dfcTipSeen = RELEASE_TIP.v;
    window.dispatchEvent(new CustomEvent("dfc-tip"));
    Promise.resolve(this._hass.callWS({ type: "frontend/set_user_data", key: TIP_KEY, value: RELEASE_TIP.v })).catch(() => {});
  },

  /** 0.11: a card that lists its own overlays doesn't get new ones by itself: admins see a tip, once per overlay. */
  _newOvHtml() {
    const raw = this._raw || {};
    if (!this._hass || !this._hass.user || !this._hass.user.is_admin || !Array.isArray(raw.overlays) || !raw.overlays.length) return "";
    const seen = new Set([...raw.overlays, ...(raw.dismissed_overlays || [])].map((o) => (o === "electricity" ? "energy" : o)));
    const o = NEW_OVERLAYS.find((x) => !seen.has(x) && (x !== "energy" || (this._eData && this._eData.devs.length)));
    if (!o) return "";
    return `<div class="newov"><ha-icon icon="${OVERLAYS[o].icon}"></ha-icon><span>✨ ${dfT("newov.text", { o: `<b>${cesc(OVERLAYS[o].label)}</b>` })}${o === "energy" ? dfT("newov.energy") : ""}</span><button data-newov="${o}" data-add="1">${dfT("newov.add")}</button><button data-newov="${o}">${dfT("newov.not_now")}</button></div>`;
  },

  async _newOvAnswer(o, add) {
    const raw = { ...(this._raw || {}) };
    if (add) raw.overlays = [...(raw.overlays || []), o];
    else raw.dismissed_overlays = [...new Set([...(raw.dismissed_overlays || []), o])];
    // test12: the save finds this card in the dashboard by its config (it was only set by Edit markers, so the
    // banner never saved). When it still can't save (YAML dashboard, card not found), say so.
    this._penOrig = this._raw;
    try {
      await this._saveToDashboard(raw);
    } catch (_e) {
      this._toast(add ? dfT("newov.save_add", { o: OVERLAYS[o].label }) : dfT("newov.save_later"));
    }
    this.setConfig(raw);
    if (add) this._overlay = o;
    this._update(true);
  },

  _ovActsHtml(ov) {
    const a = this._a || {};
    const b = [];
    if (ov === "cleaning" && (this._config.cleaning || {}).robot_buttons !== false) {
      const robots = Object.keys(a.robots || {}).filter((e) => this._hass.states[e]);
      for (const eid of robots) {
        const st = this._hass.states[eid];
        const pre = robots.length > 1 ? `${this._rbLabel(a, eid)}: ` : "";
        const own = rbOwn(a, eid);
        const cmd = (c, icon, label) => `<button data-rbcmd="${c}" data-rb="${cesc(eid)}"><ha-icon icon="${icon}"${own ? ` style="color:rgb(${own})"` : ""}></ha-icon>${cesc(pre + label)}</button>`;
        b.push(st.state === "cleaning" ? cmd("pause", "mdi:pause", dfT("robot.pause")) : cmd("start", "mdi:play", st.state === "paused" ? dfT("robot.continue") : dfT("robot.start")));
        if (st.state !== "docked") b.push(cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")));
      }
    }
    this._ovActs().forEach((x, i) => {
      if ((x.overlay || "cleaning") !== ov) return;
      if (Array.isArray(x.plans) && x.plans.length && !x.plans.includes(a.plan_id)) return;
      const st = x.status ? barStatus(this._hass, x.status) : null;
      const s0 = st || {};
      const col = s0.color && s0.badge == null ? ` style="color:${cesc(s0.color)}"` : "";
      const mark = s0.badge != null ? `<i class="obadge"${s0.color ? ` style="background:${cesc(s0.color)}"` : ""}>${cesc(s0.badge)}</i>` : s0.dot ? `<i class="odot" style="background:${cesc(s0.dot)}"></i>` : "";
      b.push(`<button data-oact="${i}" data-bh="1"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"${col}></ha-icon>${cesc(x.name || dfT("action"))}${mark}</button>`);
    });
    return b.length ? `<div class="bar oacts" role="toolbar" aria-label="${dfT("actions")}">${b.join("")}</div>` : "";
  },

  _ovActEnt(x) {
    const e = (x.status || {}).entity;
    return (Array.isArray(e) ? e[0] : e) || undefined;
  },

  _lightEnts(specs) {
    const out = new Set();
    for (const s of specs || [...(this._specs || new Map()).values()]) for (const e of s.ents || []) if (TOGGLE_DOMAINS.has(domainOf(e)) && domainOf(e) !== "cover") out.add(e);
    return [...out];
  },

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
  },

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
  },
});
