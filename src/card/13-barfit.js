Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- layout
  /** 0.8.2: the bar as long as the plan with its frame (next to it), and the scroll chevrons. */
  _barFit() {
    const sr = this.shadowRoot;
    const card = sr && sr.querySelector("ha-card");
    const fr = sr && sr.querySelector(".fr");
    const bar = sr && sr.querySelector(".ovbar");
    if (!card || !fr || !bar) return;
    const cr = card.getBoundingClientRect();
    const r = fr.getBoundingClientRect();
    const vert = card.classList.contains("dock-left") || card.classList.contains("dock-right");
    if (card.classList.contains("srail")) {
      // The Side Rail: the card's full height (a card that sizes itself: as tall as the plan's column).
      const h = Math.round(this.hasAttribute("fit") ? card.clientHeight : this._natH || card.clientHeight);
      if (Math.abs((parseFloat(this.style.getPropertyValue("--dfc-rail-len")) || -99) - h) > 1) this.style.setProperty("--dfc-rail-len", `${h}px`);
    } else if (r.width && r.height) {
      const off = Math.max(0, Math.round(vert ? r.top - cr.top : r.left - cr.left));
      const len = Math.round(vert ? Math.min(r.height, cr.height - off) : r.width);
      const set = (k, v) => {
        if (Math.abs((parseFloat(this.style.getPropertyValue(k)) || -99) - v) > 1) this.style.setProperty(k, `${v}px`);
      };
      set("--dfc-bar-off", off);
      set("--dfc-bar-len", len);
    }
    const nav = bar.querySelector("nav.dock");
    if (!nav) return; // the replay rail has no overlay buttons to scroll
    const upd = () => {
      const v = nav.getAttribute("aria-orientation") === "vertical";
      const pos = v ? nav.scrollTop : nav.scrollLeft;
      const max = v ? nav.scrollHeight - nav.clientHeight : nav.scrollWidth - nav.clientWidth;
      bar.classList.toggle("cs", max > 2 && pos > 2);
      bar.classList.toggle("ce", max > 2 && pos < max - 2);
    };
    if (!nav._fadeOn) {
      nav._fadeOn = true;
      nav.addEventListener("scroll", upd, { passive: true });
    }
    upd();
  },

  _layoutSoon() {
    cancelAnimationFrame(this._lraf);
    this._lraf = requestAnimationFrame(() => this._layout());
  },

  /** Keep close markers readable: spread them in a small grid, then push any remaining overlaps apart; a leader line points to the real spot. */
  /** 0.8.2: in a card with a fixed height (panel view, sections grid, wall panel, preview) the plan fills the area
   *  left after the buttons, legend and people: as large as possible, never stretched. Elsewhere (masonry) the
   *  card grows with the plan, which then uses the full width as before. */
  /** 0.13.2 (#22): a bar a theme keeps fixed along the bottom of the dashboard (Material You's navigation bar).
   *  The plan's height reserve (170 px for Home Assistant's header and the card around the plan) grows by its
   *  height. Home Assistant has no such bar, so with the standard layout (phones with a notch included) nothing
   *  changes. */
  _screenBars() {
    const deep = (x, y) => {
      let el = document.elementFromPoint(x, y);
      for (let i = 0; el && el.shadowRoot && i < 30; i++) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    };
    const fixedUp = (el) => {
      for (let n = el, i = 0; n && i < 60; i++) {
        if (n.nodeType === 1) {
          const pos = getComputedStyle(n).position;
          if (pos === "fixed" || pos === "sticky") return n;
        }
        n = n.assignedSlot || n.parentNode || n.host;
      }
      return null;
    };
    const mine = (n) => n === this || (n.contains && n.contains(this));
    const x = Math.round(window.innerWidth / 2);
    const H = window.innerHeight;
    let bottom = 0;
    try {
      const b = fixedUp(deep(x, H - 1));
      if (b && !mine(b)) {
        const r = b.getBoundingClientRect();
        if (r.top > H / 2) bottom = Math.max(0, H - r.top); // a bar along the bottom, not a full-screen layer
      }
    } catch (_e) {
      /* keep the standard reserve */
    }
    return Math.round(bottom);
  },

  _fitPlan() {
    const sr = this.shadowRoot;
    // 0.13.2 (#22): the reserve follows what the screen really leaves free.
    const extra = typeof document !== "undefined" && document.elementFromPoint ? this._screenBars() : 0;
    if (extra > 0) this.style.setProperty("--dfc-chrome", `${170 + extra}px`);
    else this.style.removeProperty("--dfc-chrome");
    const card = sr && sr.querySelector("ha-card");
    const wrap = sr && sr.querySelector(".wrap");
    if (!card || !wrap) return;
    const fr = sr.querySelector(".fr");
    let fixed = !!(this.isPanel || this.layout === "panel" || this.layout === "grid" || this._fitHost || this._fitAuto);
    this.toggleAttribute("pc", this._config.plan_position === "centre");
    if (!fr) {
      this.toggleAttribute("fit", false);
      return;
    }
    const main = wrap.parentElement;
    const cs = getComputedStyle(wrap);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // Title, legend, people and scene bar take their share; a bar above / below the plan too.
    let others = 0;
    for (const c of main.children) if (c !== wrap && getComputedStyle(c).position !== "absolute") others += c.offsetHeight;
    const dock = sr.querySelector(".dockrow");
    if (dock && (card.classList.contains("dock-top") || card.classList.contains("dock-bottom")) && getComputedStyle(dock).position !== "absolute") others += dock.offsetHeight;
    const natural = others + padV + fr.offsetHeight;
    // 0.8.2: a card whose container sets its height (a stack or a layout with a fixed height) is a
    // fixed-height card too, wherever it sits: a card that sizes itself is always exactly its content.
    // (A vertical bar never sets the height: it is as long as the plan, or as tall as the card.)
    this._natH = Math.max(natural, others + 120);
    if (!fixed && Math.abs(card.clientHeight - this._natH) > 2) fixed = this._fitAuto = true;
    // In a fixed-height card the plan sits at the top (option: centred), the bar right next to it.
    this.toggleAttribute("fit", fixed);
    if (!fixed) {
      this.style.removeProperty("--dfc-fit-h");
      return;
    }
    if (Math.abs(card.clientHeight - natural) <= 2) return;
    const h = Math.max(120, card.clientHeight - others - padV - 2);
    const cur = parseFloat(this.style.getPropertyValue("--dfc-fit-h")) || 0;
    if (Math.abs(cur - h) > 1) this.style.setProperty("--dfc-fit-h", `${Math.round(h)}px`);
  },



  _layout() {
    this._fitPlan();
    this._barFit();
    const box = this.shadowRoot && this.shadowRoot.querySelector(".box");
    if (!box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H) return;
    // 0.13.3: Christmas bulbs keep a minimum size on screen: redraw once when the plan's width changes a lot.
    const wasW = this._boxW || 0;
    this._boxW = W;
    if (Math.abs(wasW - W) > 40 && box.querySelector("svg.xmas")) this._update(true);
    this._alignFloor();
    // Markers follow the card size (#76): full size from ~900 px width, smaller below.
    const look = this._look();
    const sc = look.scale === false ? 1 : Math.max(0.55, Math.min(1, W / 900));
    const narrow = W < 520;
    if (Math.abs(sc - (this._scale || 1)) > 0.04 || narrow !== !!this._narrow) {
      this._scale = sc;
      this._narrow = narrow;
      const card = this.shadowRoot.querySelector("ha-card");
      if (card) {
        card.style.setProperty("--dfc-size", `${Math.round((Number(look.size) || 34) * sc)}px`);
        card.classList.toggle("narrow", narrow);
      }
      return this._layoutSoon();
    }
    // 0.11: a Live camera (dot + picture) keeps its own layout: never spread apart as two markers.
    const els = [...box.querySelectorAll("[data-k]")];
    const rects = els.map((el) => {
      const w = el.offsetWidth || 30;
      const h = el.offsetHeight || 30;
      const ax = (Number(el.dataset.x) / 100) * W;
      const ay = (Number(el.dataset.y) / 100) * H;
      return { el, w, h, ax, ay, x: ax - w / 2, y: ay - h / 2 };
    });
    const GAP = 4;
    const overlap = (p, q) => p.x < q.x + q.w + GAP && p.x + p.w + GAP > q.x && p.y < q.y + q.h + GAP && p.y + p.h + GAP > q.y;
    let groups = rects.map((r) => [r]);
    for (let pass = 0; pass < 6; pass++) {
      let merged = false;
      const next = [];
      for (const g of groups) {
        const hit = next.find((n) => n.some((p) => g.some((q) => overlap(p, q))));
        if (hit) {
          hit.push(...g);
          merged = true;
        } else next.push(g);
      }
      groups = next;
      // 0.13.9.8: devices on one spot that all have a mounting height stack in one column, highest on top.
      const hOf = (r) => {
        const v = this._hIndex && this._hIndex.get(String(r.el.dataset.k || "").split("|")[0]);
        return typeof v === "number" ? v : null;
      };
      for (const g of groups) {
        if (g.length < 2) continue;
        const cw = Math.max(...g.map((r) => r.w));
        const ch = Math.max(...g.map((r) => r.h));
        const tower = g.every((r) => hOf(r) != null && Math.abs(r.ax - g[0].ax) < 2 && Math.abs(r.ay - g[0].ay) < 2);
        const cols = tower ? 1 : Math.ceil(Math.sqrt(g.length));
        const rows = Math.ceil(g.length / cols);
        const gw = cols * (cw + 6) - 6;
        const gh = rows * (ch + 6) - 6;
        const cx = g.reduce((n, r) => n + r.ax, 0) / g.length;
        const cy = g.reduce((n, r) => n + r.ay, 0) / g.length;
        const left = Math.max(2, Math.min(W - gw - 2, cx - gw / 2));
        const top = Math.max(2, Math.min(H - gh - 2, cy - gh / 2));
        // Rows top to bottom; inside a row, left to right as on the plan (so neighbours never swap sides).
        const byY = tower ? [...g].sort((p, q) => hOf(q) - hOf(p)) : [...g].sort((p, q) => p.ay - q.ay || p.ax - q.ax);
        const ordered = [];
        for (let k = 0; k < byY.length; k += cols) ordered.push(...byY.slice(k, k + cols).sort((p, q) => p.ax - q.ax));
        ordered.forEach((r, i) => {
          const row = Math.floor(i / cols);
          const inRow = Math.min(cols, g.length - row * cols);
          const col = i % cols;
          r.x = left + ((cols - inRow) * (cw + 6)) / 2 + col * (cw + 6) + (cw - r.w) / 2;
          r.y = top + row * (ch + 6) + (ch - r.h) / 2;
        });
      }
      if (!merged) break;
    }
    // Remaining overlaps (grids next to other grids, chips of different sizes): push apart (#51).
    const clamp = (r) => {
      r.x = Math.max(1, Math.min(W - r.w - 1, r.x));
      r.y = Math.max(1, Math.min(H - r.h - 1, r.y));
    };
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i];
        const q = rects[j];
        if (!overlap(p, q)) continue;
        const dx = Math.min(p.x + p.w + GAP - q.x, q.x + q.w + GAP - p.x);
        const dy = Math.min(p.y + p.h + GAP - q.y, q.y + q.h + GAP - p.y);
        const sx = p.x + p.w / 2 <= q.x + q.w / 2 ? 1 : -1;
        const sy = p.y + p.h / 2 <= q.y + q.h / 2 ? 1 : -1;
        if (dx < dy) {
          p.x -= (sx * dx) / 2;
          q.x += (sx * dx) / 2;
        } else {
          p.y -= (sy * dy) / 2;
          q.y += (sy * dy) / 2;
        }
        clamp(p);
        clamp(q);
        moved = true;
      }
      if (!moved) break;
    }
    let lines = "";
    for (const r of rects) {
      const cx = Math.max(r.w / 2 + 1, Math.min(W - r.w / 2 - 1, r.x + r.w / 2));
      const cy = Math.max(r.h / 2 + 1, Math.min(H - r.h / 2 - 1, r.y + r.h / 2));
      r.el.style.left = `${cx}px`;
      r.el.style.top = `${cy}px`;
      if (Math.hypot(cx - r.ax, cy - r.ay) > 6) lines += `<line class="lead" x1="${r.ax}" y1="${r.ay}" x2="${cx}" y2="${cy}"/><circle cx="${r.ax}" cy="${r.ay}" r="2.5" fill="var(--secondary-text-color)" opacity=".7"/>`;
    }
    const svg = this.shadowRoot.querySelector("svg.lines");
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = this._eFlowSvg(box, W, H, svg.getCurrentTime ? svg.getCurrentTime() : 0) + this._linkLines(W, H) + lines + this._placeWins(box, W, H);
    }
  },

  /** Zigbee links (all ZHA neighbours, coloured by LQI) and hub/bridge links (Matter bridges, hubs). */
  _linkLines(W, H) {
    if (this._overlay !== "network" || !this._specs) return "";
    if (this._rpIn()) return ""; // test11: links are only known for now, so Replay draws none
    const specs = [...this._specs.values()].filter((s) => s.type === "net");
    let out = "";
    const P = (s) => [(s.x / 100) * W, (s.y / 100) * H];
    if (this._net.links && this._zha && this._zha.links.length) {
      const pos = {};
      for (const s of specs) if (s.ieee) pos[ieeeKey(s.ieee)] = s;
      const seen = new Set();
      for (const l of this._zha.links) {
        if (l.lqi < this._net.minLqi || (this._net.lqiOff || []).includes((LQI_BANDS.find((b) => l.lqi >= b.min) || LQI_BANDS[3]).min)) continue;
        const p = pos[l.a];
        const q = pos[l.b];
        if (!p || !q || p === q) continue;
        const k = [p.key, q.key].sort().join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        const [x1, y1] = P(p);
        const [x2, y2] = P(q);
        out += `<line class="${this._hl && (this._hl === p.key || this._hl === q.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lqiColor(l.lqi)}" stroke-width="2" opacity=".6"/>`;
      }
    }
    if (this._net.wlinks && this._a && this._a.aps && this._netShow().includes("network")) {
      // 0.7.3: each device to its access point; solid = cable, dashed = Wi-Fi; colour = access point.
      const aps = this._apList();
      for (const s of specs) {
        if (!s.rt || !s.rt.home || !s.rt.ap) continue;
        const ap = this._specs.get(this._a.aps[s.rt.ap]);
        if (!ap || ap === s) continue;
        const col = AP_COLORS[Math.max(0, aps.indexOf(s.rt.ap)) % AP_COLORS.length];
        const [x1, y1] = P(s);
        const [x2, y2] = P(ap);
        out += `<line class="wl ${s.rt.lan ? "cab" : ""} ${this._hl && (this._hl === s.key || this._hl === ap.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"/>`;
      }
    }
    if (this._net.hubs) {
      for (const s of specs) {
        const parent = s.item.via && this._specs.get(s.item.via);
        if (!parent || parent.type !== "net") continue;
        if (s.conns.includes("zigbee") && parent.conns.includes("zigbee")) continue;
        const [x1, y1] = P(s);
        const [x2, y2] = P(parent);
        out += `<line class="hub ${this._hl && (this._hl === s.key || this._hl === parent.key) ? "hl" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }
    }
    // 0.8.1: links to a device on another floor, drawn like any other link.
    for (const g of this._ghosts || []) {
      for (const l of g.links) {
        const s = this._specs.get(l.from);
        if (!s) continue;
        const [x1, y1] = P(s);
        const [x2, y2] = P(g);
        const hl = this._hl === s.key ? "hl" : "";
        out += l.cls === "zb"
          ? `<line class="${hl}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${l.color}" stroke-width="2" opacity=".6"/>`
          : `<line class="${l.cls} ${hl}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${l.color ? ` stroke="${l.color}"` : ""}/>`;
      }
    }
    return out;
  },
});
