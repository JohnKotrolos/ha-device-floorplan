Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- Home Replay (0.11.1)
  /** The card's clock: the replay time while replaying, else now (night look, motion, "ago", timers). */
  _now() {
    return this._rpT() ?? Date.now();
  },

  _rpT() {
    return this._rp && this._rp.t != null ? this._rp.t : null;
  },

  /** Replay is in use: open (rail / bar) or at a past time. */
  _rpIn() {
    return !!(this._rp && (this._rp.mode || this._rp.t != null));
  },

  /** Replay is open (the rail or the bar), at a past time or at Now. */
  _rpOn() {
    return !!(this._rp && (this._rp.mode || this._rp.t != null));
  },

  /** A replay control was pressed (on finger down, so a redraw while playing can't swallow it). */
  _rpCtl(t) {
    if (t.closest("[data-rpgo]")) {
      const bar = this.shadowRoot.querySelector(".ovbar");
      if (bar) this._railBox = { w: bar.offsetWidth, h: bar.offsetHeight }; // the replay rail keeps this size
      // test10: without a rail the round button also closes Replay; on Energy / Network (no replay) it replays Live.
      if (this._rp && this._rp.mode && !this._dockShown) return this._rpOpen(false);
      if (RP_SKIP.has(this._overlay)) this._setOverlay(this._rpOvs()[0] || "live");
      return this._rpOpen(true);
    }
    const rpo = t.closest("[data-rpov]");
    if (rpo) {
      this._rp.menu = false;
      return this._setOverlay(rpo.dataset.rpov);
    }
    const rpb = t.closest("[data-rp]");
    if (!rpb) return;
    const a = rpb.dataset.rp;
    if (a === "exit") return this._rpOpen(false);
    if (a === "pill") return this._rpAsk();
    if (a === "menu") {
      this._rp.menu = !this._rp.menu;
      return this._update(true);
    }
    if (a === "prev" || a === "next") return this._rpJump(a === "prev" ? -1 : 1);
    return this._rpPlay();
  },

  _rpSpan() {
    return ((this._rp && this._rp.range) || 24) * 3600000;
  },

  _rpState() {
    return (this._rp = this._rp || { t: null, mode: false, speed: Number(lsGet("dfc_rp_speed")) || 900, range: RP_RANGES.includes(Number(lsGet("dfc_rp_range"))) ? Number(lsGet("dfc_rp_range")) : 24 });
  },


  /** The history of everything the current overlay reads (plus the sun and every light, for the night look),
   *  for the chosen range; loaded again for another overlay or range, or after 5 min. */
  _rpLoad() {
    const rp = this._rpState();
    if (rp.loading) return rp.loading;
    const key = `${this._overlay}|${rp.range}|${this._floor || ""}`; // test11: the floor too (each floor has its own devices)
    if (rp.data && rp.key === key && Date.now() - rp.at < 300000) return Promise.resolve();
    const real = this._live || this._hass;
    const want = new Set([...(this._watch || []), "sun.sun"]);
    for (const item of this._items(this._a || {})) for (const e of item.bond ? item.entities : [item.main_entity]) if (e && domainOf(e) === "light") want.add(e);
    // 0.12.3: the entities a picture follows, so it takes the replayed moment's look.
    for (const item of this._items(this._a || {})) {
      const b = this._bodyOf(item);
      if (b && b.pic) {
        const pl = this._per(item, "live");
        // picked on purpose, or what decides the picture's On / Off (0.13.9.3: a sensor too): always replayed
        for (const e of [pl.when, pl.lead, pl.hl, ...b.sents]) if (e) want.add(e);
        for (const e of [b.lead, ...b.ents]) if (e && !["sensor", "button", "event", "update", "image"].includes(domainOf(e))) want.add(e);
      }
    }
    const ents = [...want].filter((e) => real.states[e]);
    const start = new Date(Date.now() - this._rpSpan()).toISOString();
    // Sensors only need their state (their unit etc. come from now); everything else with attributes.
    const q = (ids, full) => (ids.length ? real.callWS({ type: "history/history_during_period", start_time: start, entity_ids: ids, minimal_response: !full, no_attributes: !full, significant_changes_only: false }) : Promise.resolve({}));
    rp.loading = Promise.all([q(ents.filter((e) => domainOf(e) !== "sensor"), true), q(ents.filter((e) => domainOf(e) === "sensor"), false)])
      .then(([x, y]) => {
        const data = {};
        for (const [e, rows] of Object.entries({ ...x, ...y })) data[e] = rows.map((r) => ({ t: (r.lu || r.lc) * 1000, s: r.s, a: r.a })).filter((r) => r.t).sort((m, n) => m.t - n.t);
        rp.data = data;
        rp.own = new Set(this._watch || []); // the overlay's own entities (not the lights loaded for the night look)
        rp.model = null;
        rp.key = key;
      })
      .catch(() => {
        rp.data = rp.data || {};
      })
      .finally(() => {
        rp.at = Date.now();
        rp.snap = null;
        rp.loading = null;
        if (rp.t != null) this._hass = this._rpHass();
        this._update(true);
      });
    this._update(true);
    return rp.loading;
  },

  /** Home Assistant at the replay time: every entity's state from its history (now's for the rest). */
  _rpHass() {
    const rp = this._rp;
    const real = this._live;
    if (rp.snap && rp.snapT === rp.t && rp.snapBase === real) return rp.snap;
    const states = { ...real.states };
    let sig = "";
    for (const [e, rows] of Object.entries(rp.data || {})) {
      if (!rows.length) continue;
      let lo = 0, hi = rows.length - 1, i = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (rows[m].t <= rp.t) {
          i = m;
          lo = m + 1;
        } else hi = m - 1;
      }
      sig += `${i},`;
      const r = rows[i];
      const cur = real.states[e];
      const iso = new Date(r.t).toISOString();
      states[e] = { ...(cur || { entity_id: e }), state: r.s, attributes: r.a || (cur && cur.attributes) || {}, last_changed: iso, last_updated: iso };
    }
    // Nothing is switched in the past: a tap says how to get back.
    const callService = () => {
      this._toast(dfT("rp.no_switch"));
      return Promise.resolve();
    };
    rp.snap = { ...real, states, callService };
    rp.sig = sig;
    rp.snapT = rp.t;
    rp.snapBase = real;
    return rp.snap;
  },

  _rpSeek(t, light = false) {
    const rp = this._rp;
    if (!rp) return;
    if (t >= Date.now() - 20000) return this._rpLive();
    const enter = rp.t == null;
    rp.t = Math.max(Date.now() - this._rpSpan(), t);
    if (enter) this._pulseT = {}; // motion pulses start fresh in the past
    const sig = rp.sig;
    this._hass = this._rpHass();
    // 0.11.1: while playing, nothing on the plan changed → only the thumb, the time and the pill move.
    if (light && !enter && rp.sig === sig && this._rpMove()) return;
    this._update(true);
  },

  /** Move the thumb, the fill and the times in place (no redraw). False if the controls aren't there. */
  _rpMove() {
    const sr = this.shadowRoot;
    const tr = sr && sr.querySelector(".rptrack");
    if (!tr) return false;
    const rp = this._rp;
    const span = this._rpSpan();
    const T = rp.t ?? Date.now();
    const pct = this._rpPct(T, Date.now() - span, span).toFixed(2);
    const vert = tr.classList.contains("v");
    const th = tr.querySelector(".rpthumb");
    const fill = tr.querySelector(".rpline b");
    if (th) th.style[vert ? "bottom" : "left"] = `${pct}%`;
    if (fill) fill.style[vert ? "height" : "width"] = `${pct}%`;
    const em = tr.querySelector(".rpthumb em");
    rp.lab = this._rpLabel();
    if (em) em.textContent = rp.lab;
    const pill = sr.querySelector(".rppill span");
    if (pill && rp.t != null) pill.textContent = this._rpPillTxt();
    this._rpBub();
    return true;
  },

  /** test9: where the thumb is on the line (%). While dragging: under the finger. */
  _rpPct(T, t0, span) {
    const rp = this._rp;
    if (rp.drag && rp.dragPct != null) return rp.dragPct;
    return Math.max(0, Math.min(100, ((T - t0) / span) * 100));
  },

  /** The time at the thumb, in words: the clock (+ the line's value). */
  _rpLabel() {
    const rp = this._rp;
    if (rp.t == null) return dfT("rp.now");
    const T = rp.t;
    const m = this._rpModel();
    let lab = rpClock(T);
    if (m.line) {
      const span = this._rpSpan();
      const v = m.line[Math.min(m.n - 1, Math.max(0, Math.floor(((T - (Date.now() - span)) / span) * m.n)))];
      if (v != null) lab += ` · ${Math.round(v * 10) / 10}${m.unit || ""}`;
    }
    return lab;
  },

  /** The pill on the plan: the day and the time. */
  _rpPillTxt() {
    const T = this._rp.t;
    return `${this._rpWhen(T).day} ${rpClock(T)}`;
  },

  _rpPill() {
    return this._rpT() != null ? `<button class="rppill" data-rp="pill" title="${dfT("rp.tap_goto")}" aria-label="${dfT("rp.time")}: ${cesc(this._rpPillTxt())}. ${dfT("rp.tap_goto")}"><ha-icon icon="mdi:history"></ha-icon><span>${cesc(this._rpPillTxt())}</span></button>` : "";
  },

  /** test9: on a side rail the time bubble is drawn on the card itself, level with the thumb and right beside it
   *  (as a part of the rail the plan covered it). Shown while playing or dragging. */
  _rpBub() {
    const sr = this.shadowRoot;
    const b = sr && sr.querySelector(".rpbub");
    const rp = this._rp;
    if (!b || !rp) return;
    const th = sr.querySelector(".rptrack.v .rpthumb");
    const card = sr.querySelector("ha-card");
    const rail = sr.querySelector(".dockrow");
    if (!th || !card || !rail || !(rp.play || rp.drag)) {
      b.hidden = true;
      return;
    }
    const c = card.getBoundingClientRect();
    const t = th.getBoundingClientRect();
    const r = rail.getBoundingClientRect();
    const left = r.left - c.left <= c.right - r.right; // the rail is on the card's left
    b.textContent = rp.lab || "";
    b.style.top = `${t.top + t.height / 2 - c.top}px`;
    // test10: right beside the handle (over the bars), not beyond the rail.
    b.style.left = left ? `${t.right - c.left + 6}px` : "";
    b.style.right = left ? "" : `${c.right - t.left + 6}px`;
    b.hidden = false;
  },

  /** test9: tap the time pill → a small entry (day, time with optional seconds) → Replay goes there, paused.
   *  The entry lives outside the card's own drawing, so the card can keep redrawing under it. */
  _rpAsk() {
    const rp = this._rp;
    if (!rp || this._rpPop) return;
    // test10: the entry opens on the pill's own place (measured before the card redraws); with nothing to
    // measure, at the top centre of the card. Never in a corner of the page.
    const box = (x) => {
      const r = x && x.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    };
    const pr = box(this.shadowRoot.querySelector(".rppill"));
    const cr = box(this.shadowRoot.querySelector("ha-card")) || box(this);
    this._rpStop();
    this._update(true);
    const now = Date.now();
    const t0 = now - this._rpSpan();
    const T = rp.t ?? now;
    const p2 = (v) => String(v).padStart(2, "0");
    const days = [];
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    while (days.length < 4) {
      days.push(d.getTime());
      if (d.getTime() <= t0) break;
      d.setDate(d.getDate() - 1);
    }
    const cur = new Date(T);
    const curDay = new Date(T).setHours(0, 0, 0, 0);
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", dfT("rp.goto"));
    el.style.cssText = "position:fixed;z-index:10001;display:flex;align-items:center;gap:6px;padding:8px;border-radius:12px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#111);box-shadow:0 8px 24px rgba(0,0,0,.35);font:14px var(--paper-font-body1_-_font-family, Roboto, sans-serif)";
    const fld = "font:inherit;color:inherit;background:transparent;border:1px solid var(--divider-color,#ccc);border-radius:8px;padding:6px 8px;min-height:36px;box-sizing:border-box";
    el.innerHTML = `<select aria-label="${dfT("rp.day")}" style="${fld}">${days.map((x) => `<option value="${x}" ${x === curDay ? "selected" : ""}>${cesc(this._rpWhen(x + 43200000).day)}</option>`).join("")}</select><input type="time" step="1" aria-label="${dfT("rp.time_input")}" value="${p2(cur.getHours())}:${p2(cur.getMinutes())}:00" style="${fld}"><button data-go="1" style="font:inherit;font-weight:600;border:0;border-radius:8px;padding:0 14px;min-height:36px;cursor:pointer;background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff)">${dfT("rp.go")}</button><button data-x="1" aria-label="${dfT("close")}" style="font:inherit;border:0;background:transparent;color:inherit;min-width:36px;min-height:36px;cursor:pointer">✕</button>`;
    // Inside an open dialog (the Card Editor) the entry must live in that dialog to be reachable.
    let host = this;
    while (host && !(host instanceof HTMLDialogElement && host.open)) host = host.parentNode || host.host;
    (host || document.body).appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = pr ? pr.left + pr.width / 2 : cr ? cr.left + cr.width / 2 : window.innerWidth / 2;
    const cy = pr ? pr.top + pr.height / 2 : (cr ? cr.top : 0) + 14 + h / 2;
    const lo = Math.max(8, cr ? cr.left + 6 : 8);
    const hi = Math.max(lo, Math.min(window.innerWidth - 8, cr ? cr.right - 6 : window.innerWidth) - w);
    const x = Math.min(hi, Math.max(lo, cx - w / 2));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, cy - h / 2));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // A page that moves fixed elements (a transformed container): put it where it was meant to be.
    const ar = el.getBoundingClientRect();
    if (Math.abs(ar.left - x) > 1 || Math.abs(ar.top - y) > 1) {
      el.style.left = `${2 * x - ar.left}px`;
      el.style.top = `${2 * y - ar.top}px`;
    }
    const outside = (e) => !e.composedPath().includes(el) && close();
    const close = () => {
      document.removeEventListener("pointerdown", outside, true);
      el.remove();
      this._rpPop = null;
    };
    const go = () => {
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(el.querySelector("input").value || "");
      if (!m) return;
      const t = new Date(Number(el.querySelector("select").value));
      t.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0);
      let at = t.getTime();
      close();
      if (at >= Date.now() - 20000) {
        this._toast(dfT("rp.future"));
        return this._rpLive();
      }
      const start = Date.now() - this._rpSpan();
      if (at < start) {
        at = start + 1000;
        this._toast(dfT("rp.before", { n: rp.range }));
      }
      this._rpLoad().then(() => this._rpSeek(at));
    };
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-go]")) go();
      else if (e.target.closest("[data-x]")) close();
    });
    for (const ev of ["keydown", "keyup", "keypress"]) el.addEventListener(ev, (e) => {
      e.stopPropagation();
      if (ev !== "keydown") return;
      if (e.key === "Enter") go();
      if (e.key === "Escape") close();
    });
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    this._rpPop = close;
    el.querySelector("input").focus();
  },

  _rpStop() {
    const rp = this._rp;
    if (!rp) return;
    clearInterval(rp.timer);
    rp.timer = null;
    rp.play = false;
  },

  /** To Now: the real Home Assistant (Replay stays open, at its end). */
  _rpLive(draw = true) {
    const rp = this._rpState();
    this._rpStop();
    if (rp.t != null) this._pulseT = {};
    rp.t = null;
    if (this._live) this._hass = this._live;
    if (draw) this._update(true);
  },

  /** Replay on / off (the rail button; ← Now closes it). */
  _rpOpen(on) {
    const rp = this._rpState();
    this._rpLive(false);
    rp.mode = on;
    rp.menu = false;
    if (this._rpPop) this._rpPop();
    // #105: "replay_global" (the mobile card): Replay is one mode for every overlay, not a layer per overlay.
    if (!this._dockShown && !this._config.replay_global) this._setLayer(this._overlay, "replay", on, false);
    if (on) this._rpLoad();
    this._update(true);
  },

  /** Play / pause. From Now it starts at the beginning of the range; the end is Now again. */
  _rpPlay() {
    const rp = this._rp;
    if (!rp) return;
    if (rp.play) {
      this._rpStop();
      return this._update(true);
    }
    rp.play = true;
    this._update(true);
    this._rpLoad().then(() => {
      if (!rp.play) return;
      let last = performance.now();
      this._rpSeek(rp.t ?? Date.now() - this._rpSpan());
      clearInterval(rp.timer);
      rp.timer = setInterval(() => {
        const n = performance.now();
        const next = (rp.t ?? Date.now()) + (n - last) * rp.speed;
        last = n;
        if (!this.isConnected || rp.t == null) return this._rpStop();
        this._rpSeek(next, true);
      }, 200);
    });
  },

  /** Previous / next moment worth seeing on this overlay's timeline (an event, a run starting, a busy hour);
   *  past the last one: Now. */
  _rpJump(dir) {
    this._rpStop();
    const go = () => {
      const rp = this._rp;
      const T = rp.t ?? Date.now();
      const t0 = Date.now() - this._rpSpan();
      const ts = this._rpModel().jumps.filter((t) => t > t0);
      if (dir < 0) {
        const p = ts.filter((t) => t < T - 60000).pop();
        this._rpSeek(p ?? t0);
      } else {
        const n = ts.find((t) => t > T + 60000);
        if (n != null) this._rpSeek(n);
        else this._rpLive();
      }
    };
    this._rpLoad().then(go);
  },

  /** Overlays Replay can play back (the ones on the rail, without Network). */
  _rpOvs() {
    return this._overlays().filter((o) => !RP_SKIP.has(o));
  },

  _rpWhen(T) {
    const d = new Date(T);
    const now = new Date();
    const y = new Date(now.getTime() - 86400000);
    const day = d.toDateString() === now.toDateString() ? dfT("rp.today") : d.toDateString() === y.toDateString() ? dfT("rp.yesterday") : d.toLocaleDateString(dfLocale(), { weekday: "short" });
    return { day, clock: rpClock(T) };
  },

  /** 0.11.1 test8: what this overlay's timeline shows (REPLAY-TIMELINE): { n, bars: [{kind: amount}], spans:
   *  [{lane, from, to, k}], line: [value | null] (per slot), jumps: [t] }. Bars and the line use n slots over the
   *  range; Energy one slot per hour. Cached until the data, the overlay, the range or the minute changes. */
  _rpModel() {
    const rp = this._rpState();
    const ov = this._overlay;
    const span = this._rpSpan();
    const now = Date.now();
    const ck = `${ov}|${rp.range}|${rp.at || 0}|${this._eData ? this._eData.t : 0}|${Math.floor(now / 60000)}`;
    if (rp.model && rp.model.ck === ck) return rp.model;
    const t0 = now - span;
    const real = this._live || this._hass;
    const states = (real && real.states) || {};
    const data = rp.data || {};
    const own = rp.own || new Set(this._watch || []);
    const ents = Object.keys(data).filter((e) => own.has(e) && data[e].length);
    const m = { ck, n: 96, bars: [], spans: [], line: null, jumps: [] };
    const slot = (t) => Math.min(m.n - 1, Math.max(0, Math.floor(((t - t0) / span) * m.n)));
    const bin = () => (m.bars = Array.from({ length: m.n }, () => ({})));
    const add = (t, k, v = 1) => {
      if (t <= t0) return;
      const b = m.bars[slot(t)];
      b[k] = (b[k] || 0) + v;
    };
    const kindsOf = { live: ["lt", "dv", "op", "mv"], security: ["op", "mv"] };
    const events = (ks) => {
      bin();
      for (const e of ents) {
        const k = rpKind(e, states[e]);
        if (!k || !ks.includes(k)) continue;
        const rows = data[e];
        for (let i = 1; i < rows.length; i++) {
          const on = domainOf(e) === "event" ? rows[i].s !== rows[i - 1].s && rows[i].s !== "unavailable" : rows[i].s !== rows[i - 1].s && RP_ON.has(rows[i].s);
          if (on && rows[i].t > t0) {
            add(rows[i].t, k);
            m.jumps.push(rows[i].t);
          }
        }
      }
    };
    const runs = (list) => {
      let lane = 0;
      for (const e of list) {
        const sp = rpSpans(e, data[e], t0, now);
        if (!sp.length) continue;
        const k = domainOf(e) === "light" ? "lt" : "dv";
        for (const [a, b] of sp) {
          m.spans.push({ lane, from: a, to: b, k, e });
          m.jumps.push(a);
        }
        lane++;
      }
      m.lanes = lane;
    };
    if (ov === "lights") {
      // How many lights (and light switches) were on in each slot.
      bin();
      const lights = ents.filter((e) => ["light", "switch"].includes(domainOf(e)));
      for (const e of lights) {
        for (const [a, b] of rpSpans(e, data[e], t0, now)) {
          for (let i = slot(a); i <= slot(b - 1); i++) m.bars[i].lt = (m.bars[i].lt || 0) + 1;
          m.jumps.push(a);
        }
      }
      m.linear = true;
    } else if (ov === "comfort") {
      // A line: the average indoor temperature; spans: ACs / heating really running.
      // test9: the same temperatures as the chips and the heatmap on the plan (each sensor once), not every
      // temperature entity of the devices (chip / device temperatures made the average too warm).
      const shown = new Set();
      for (const sp of (this._specs || new Map()).values()) for (const e of sp.heatEnts || sp.ents || []) shown.add(String(e).split("#")[0]);
      const temps = ents.filter((e) => shown.has(e) && domainOf(e) === "sensor" && kindOf(e, states[e]) === "temperature");
      const clim = ents.filter((e) => domainOf(e) === "climate");
      const src = [...temps.map((e) => [e, (r) => (num(r.s) ? Number(r.s) : NaN)]), ...clim.filter((e) => shown.has(e)).map((e) => [e, (r) => (r.a && num(r.a.current_temperature) ? Number(r.a.current_temperature) : NaN)])];
      if (src.length) {
        m.line = Array.from({ length: m.n }, (_, i) => {
          const t = t0 + ((i + 0.5) / m.n) * span;
          const vs = src.map(([e, f]) => {
            const row = rpAt(data[e], t);
            return row ? f(row) : NaN;
          }).filter((v) => Number.isFinite(v));
          return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null;
        });
        const u = ((states[src[0][0]] || {}).attributes || {}).unit_of_measurement;
        m.unit = u || (temps.length ? "" : "°");
      }
      runs(clim);
    } else if (ov === "health") {
      // A device going offline (grey), a battery dropping under the low level (orange).
      bin();
      const low = Number(this._ov("health").low ?? 20);
      for (const e of ents) {
        const rows = data[e];
        const bat = domainOf(e) === "sensor" && ((states[e] || {}).attributes || {}).device_class === "battery";
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].t <= t0) continue;
          if (rows[i].s === "unavailable" && rows[i - 1].s !== "unavailable") {
            add(rows[i].t, "off");
            m.jumps.push(rows[i].t);
          } else if (bat && Number(rows[i].s) < low && !(Number(rows[i - 1].s) < low) && Number.isFinite(Number(rows[i].s))) {
            add(rows[i].t, "bat");
            m.jumps.push(rows[i].t);
          }
        }
      }
    } else if (ov === "network") {
      // test11: how many devices were offline in each slot (their own entity unavailable); a jump at each drop.
      // A device offline for the whole range is left out.
      bin();
      const mains = new Set(this._items(this._a || {}).map((it) => it.main_entity).filter(Boolean));
      for (const e of ents) {
        if (!mains.has(e)) continue;
        const rows = data[e];
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].s !== "unavailable") continue;
          const a = Math.max(t0, rows[i].t);
          let j = i;
          while (j + 1 < rows.length && rows[j + 1].s === "unavailable") j++;
          const b = j + 1 < rows.length ? rows[j + 1].t : now;
          i = j;
          if (b <= t0 || (a <= t0 && b >= now)) continue; // offline the whole range: nothing happened (it is red on the plan)
          for (let k = slot(a); k <= slot(b - 1); k++) m.bars[k].off = (m.bars[k].off || 0) + 1;
          if (rows[j].t > t0 || a > t0) m.jumps.push(a);
        }
      }
      m.linear = true;
    } else if (ov === "cleaning") {
      runs(ents.filter((e) => ["vacuum", "lawn_mower"].includes(domainOf(e))));
    } else if (kindsOf[ov]) {
      events(kindsOf[ov]);
    } else {
      // Your own overlays: things that run as spans, single events (doors, motion, doorbell) as bars.
      const evk = ents.filter((e) => ["binary_sensor", "cover", "lock", "event"].includes(domainOf(e)));
      events(["op", "mv"]);
      runs(ents.filter((e) => !evk.includes(e) && ["light", "switch", "fan", "media_player", "climate", "vacuum", "lawn_mower", "sensor", "select", "input_select"].includes(domainOf(e)) && data[e].some((x) => rpRunning(e, x))));
    }
    m.jumps.sort((x, y) => x - y);
    rp.model = m;
    return m;
  },

  /** The timeline (horizontal or vertical): this overlay's bars, spans and line beside the line of time
   *  (REPLAY-TIMELINE), the line filled up to the thumb; the time shows on the thumb while dragging / playing. */
  _rpTrack(vert) {
    const rp = this._rp;
    const span = this._rpSpan();
    const now = Date.now();
    const t0 = now - span;
    const live = rp.t == null;
    const T = live ? now : rp.t;
    const pct = this._rpPct(T, t0, span);
    const m = this._rpModel();
    const N = m.n;
    const side = vert ? "bottom" : "left";
    const order = ["lt", "dv", "op", "mv", "off", "bat"];
    const tot = (m.bars || []).map((b) => Object.values(b).reduce((x, y) => x + y, 0));
    const max = Math.max(1e-9, ...tot, 0);
    const bars = (m.bars || []).map((bn, i) => {
      if (!tot[i]) return "";
      let acc = 0;
      const stops = order.filter((k) => bn[k]).map((k) => {
        const from = (acc / tot[i]) * 100;
        acc += bn[k];
        return `${RP_COL[k]} ${from.toFixed(0)}% ${((acc / tot[i]) * 100).toFixed(0)}%`;
      }).join(", ");
      // Amounts (lights on) grow in a straight line; event counts with the square root (one still shows).
      const h = Math.max(14, (m.linear ? tot[i] / max : Math.sqrt(tot[i] / max)) * 100).toFixed(0);
      return `<i style="${side}:${((i / N) * 100).toFixed(2)}%;--h:${h}%;--w:calc(100% / ${N} - 1px);background:linear-gradient(${vert ? "var(--rpgd)" : "to top"}, ${stops})"></i>`;
    }).join("");
    // Spans: one lane per device that ran (up to 4), a band from start to stop.
    const lanes = Math.min(4, m.lanes || 0);
    const spans = m.spans.filter((x) => x.lane < 4).map((x) => {
      const a = Math.max(0, ((x.from - t0) / span) * 100);
      const len = Math.max(0.6, ((x.to - x.from) / span) * 100);
      const nm = cesc(entName(this._live || this._hass, x.e));
      return `<s title="${nm} · ${rpClock(x.from)}–${rpClock(x.to)}" style="${side}:${a.toFixed(2)}%;${vert ? "height" : "width"}:${len.toFixed(2)}%;--lane:${x.lane};background:${RP_COL[x.k]}"></s>`;
    }).join("");
    // The line: a measured value (Comfort: average indoor temperature), scaled between its own min and max.
    let line = "";
    if (m.line && m.line.some((v) => v != null)) {
      const vs = m.line.filter((v) => v != null);
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const rng = hi - lo || 1;
      const pts = m.line.map((v, i) => (v == null ? null : [((i + 0.5) / N) * 100, 100 - ((v - lo) / rng) * 80 - 10])).filter(Boolean);
      const xy = pts.map(([a, b]) => (vert ? `${100 - b},${100 - a}` : `${a},${b}`)).join(" ");
      const f = (v) => String(Math.round(v * 10) / 10);
      // test9: the line in the Comfort heatmap's own colours (cool where it was cooler, warm where warmer), on the
      // heatmap's scale when it is shown, so the rail and the plan mean the same by a colour.
      const hm = this._heat && this._heat.hi > this._heat.lo ? this._heat : { lo, hi: lo + rng };
      const stops = [0, 0.25, 0.5, 0.75, 1].map((k) => `<stop offset="${k}" stop-color="rgb(${heatRgb(Math.max(0, Math.min(1, (lo + k * rng - hm.lo) / (hm.hi - hm.lo)))).map(Math.round).join(",")})"/>`).join("");
      const gr = vert ? 'x1="10" y1="0" x2="90" y2="0"' : 'x1="0" y1="90" x2="0" y2="10"';
      line = `<svg class="rpln" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rpg" gradientUnits="userSpaceOnUse" ${gr}>${stops}</linearGradient></defs><polyline points="${xy}" style="stroke:url(#rpg)"/></svg><span class="rpmm" title="${dfT("rp.avg_temp", { u: cesc(m.unit || "°") })}">${cesc(f(lo))}–${cesc(f(hi))}°</span>`;
    }
    // Hour marks on the line (every hour up to 24 h, every 2 h beyond): where a fast drag glues to.
    let ticks = "";
    const h1 = new Date(t0);
    h1.setMinutes(0, 0, 0);
    for (let t = h1.getTime() + 3600000; t < now; t += 3600000) {
      const hh = new Date(t).getHours();
      if (rp.range > 24 && hh % 2) continue;
      ticks += `<u class="${hh === 0 ? "d" : ""}" style="${side}:${(((t - t0) / span) * 100).toFixed(2)}%"></u>`;
    }
    const lab = (rp.lab = this._rpLabel());
    return `<div class="rptrack ${vert ? "v" : "h"} ${line ? "ln" : ""}" style="--lanes:${lanes}" role="slider" aria-label="${dfT("rp.time")}" aria-valuetext="${cesc(lab)}"><div class="rpbars">${bars}</div>${spans ? `<div class="rpspans">${spans}</div>` : ""}${line}<div class="rpticks">${ticks}</div><div class="rpline"><b style="${vert ? "height" : "width"}:${pct.toFixed(2)}%"></b></div><span class="rpthumb" style="${side}:${pct.toFixed(2)}%"><em>${cesc(lab)}</em></span></div>`;
  },

  /** 0.11.1: the replay rail: the overlay rail itself turned into Replay, same size, shape and colours
   *  (← Now · play · previous / next · timeline · speed · range); vertical in a side rail. The overlay to
   *  replay is picked beside Layers; the time is the pill on the plan (and on the thumb while it moves). */
  _rpRail(vert) {
    const rp = this._rpState();
    const now = this._config.replay_now === false ? "" : `<button class="rpnow" data-rp="exit" title="${dfT("rp.back_now")}"><ha-icon icon="mdi:arrow-left"></ha-icon><span>${dfT("rp.now")}</span></button>`;
    const play = `<button class="rpplay" data-rp="play" aria-label="${rp.play ? dfT("rp.pause") : dfT("rp.play")}"><ha-icon icon="mdi:${rp.play ? "pause" : "play"}"></ha-icon></button>`;
    const pn = `<span class="rppn"><button data-rp="prev" aria-label="${dfT("rp.prev")}"><ha-icon icon="mdi:skip-previous"></ha-icon></button><button data-rp="next" aria-label="${dfT("rp.next")}"><ha-icon icon="mdi:skip-next"></ha-icon></button></span>`;
    const speed = `<select class="rpspeed" aria-label="${dfT("rp.speed")}">${[60, 300, 900, 3600].map((v) => `<option value="${v}" ${v === rp.speed ? "selected" : ""}>${v}×</option>`).join("")}</select>`;
    const range = `<select class="rprange" aria-label="${dfT("rp.range")}">${RP_RANGES.map((v) => `<option value="${v}" ${v === rp.range ? "selected" : ""}>${v}h</option>`).join("")}</select>`;
    const cls = `rprail ${vert ? "v" : "h"} ${rp.play || rp.drag ? "act" : ""} ${rp.loading ? "ld" : ""}`;
    return vert
      ? `<div class="${cls}">${now}${play}${pn}<span class="rpend">${dfT("rp.now")}</span>${this._rpTrack(true)}<span class="rpend">−${rp.range}h</span>${speed}${range}</div>`
      : `<div class="${cls}">${now}${play}${pn}<span class="rptl">${this._rpTrack(false)}<span class="rpscale"><span>−${rp.range}h</span><span>${dfT("rp.now")}</span></span></span>${speed}${range}</div>`;
  },

  /** 0.11.1: in Replay, beside Layers: the overlay that is replayed (its icon), with the list of the others. */
  _rpOvBtn() {
    if (!this._rp || !this._rp.mode || !this._dockShown) return "";
    const ovs = this._rpOvs();
    if (ovs.length < 2) return "";
    const labels = this._config.overlay_names || {};
    const cur = this._ovDef(this._overlay) || {};
    const menu = this._rp.menu ? `<div class="rpmenu">${ovs.map((o) => `<button data-rpov="${cesc(o)}" class="${o === this._overlay ? "on" : ""}"><ha-icon icon="${cesc(this._ovDef(o).icon)}"></ha-icon>${cesc(labels[o] || this._ovDef(o).label)}</button>`).join("")}</div>` : "";
    return `<span class="rpovw"><button class="layers rpov ${this._rp.menu ? "on" : ""}" data-rp="menu" title="${dfT("rp.overlay")}" aria-label="${dfT("rp.overlay")}"><ha-icon icon="${cesc(cur.icon || "mdi:home")}"></ha-icon></button>${menu}</span>`;
  },

  /** Without a rail: the same controls as a bar under the plan (Layers → Home Replay). */
  _rpHtml() {
    return `<div class="rpbar">${this._rpRail(false)}</div>`;
  },

  /** test10: the last 24 hours, hour by hour (the current hour last), each split by source (grid, solar,
   *  battery; without sources: the devices' total). */
  _eHours() {
    const H = 3600000;
    const cur = Math.floor(Date.now() / H) * H;
    const ed = this._eData;
    const srcs = ed ? ed.srcs.filter((x) => E_COL[x.kind]) : [];
    return Array.from({ length: 24 }, (_, i) => {
      const ts = cur - (23 - i) * H;
      const parts = {};
      const add = (k, v) => v > 0 && (parts[k] = (parts[k] || 0) + v);
      if (ed && srcs.length) for (const x of srcs) add(x.kind, (ed.hours[x.stat] || {})[ts] || 0);
      else if (ed) for (const d of ed.devs) add("grid", (ed.hours[d.stat_consumption] || {})[ts] || 0);
      return { ts, parts, tot: Object.values(parts).reduce((x, y) => x + y, 0) };
    });
  },

  /** test10: Energy's own hours are back under the plan (they were in Home Replay in test8 / test9): a bar per
   *  hour of the last 24 hours, stacked in the Energy colours; "Last 24 h" (their sum) and "Now" (live W) at the
   *  ends. Tap or drag: the plan and the legend show that hour; the day change is marked. */
  _eScrubHtml() {
    const hrs = this._eHours();
    const max = Math.max(...hrs.map((h) => h.tot), 1e-9);
    const sel = this._eSel();
    const p2 = (h) => String(h).padStart(2, "0");
    const cols = hrs.map((h) => {
      const d = new Date(h.ts);
      const hh = d.getHours();
      let acc = 0;
      const stops = Object.keys(E_COL).filter((k) => h.parts[k]).map((k) => {
        const from = (acc / h.tot) * 100;
        acc += h.parts[k];
        return `${E_COL[k]} ${from.toFixed(0)}% ${((acc / h.tot) * 100).toFixed(0)}%`;
      }).join(", ");
      const lab = hh === 0 ? d.toLocaleDateString(dfLocale(), { weekday: "short" }) : hh % 3 === 0 ? p2(hh) : "";
      return `<i class="hr ${sel === h.ts ? "on" : ""} ${hh === 0 ? "day" : ""}" data-at="${h.ts}" title="${cesc(`${this._rpWhen(h.ts).day} ${p2(hh)}:00–${p2((hh + 1) % 24)}:00 · ${fmtKwh(h.tot)}`)}"><b style="height:${h.tot ? Math.round(3 + 27 * (h.tot / max)) : 2}px;background:${stops ? `linear-gradient(to top, ${stops})` : "var(--divider-color, rgba(0,0,0,.15))"}"></b>${lab ? `<small>${cesc(lab)}</small>` : ""}</i>`;
    }).join("");
    const idx = sel === "day" ? 0 : sel === "now" ? 25 : 1 + hrs.findIndex((h) => h.ts === sel);
    return `<div class="escrub"><div class="etrack ${typeof sel === "number" ? "pick" : ""}" style="grid-template-columns:3fr repeat(24, minmax(0, 1fr)) 2.2fr"><i class="end ${sel === "day" ? "on" : ""}" data-at="day">${dfT("energy.last24")}</i>${cols}<i class="end ${sel === "now" ? "on" : ""}" data-at="now">${dfT("rp.now")}</i></div><input type="range" class="erange" min="0" max="25" step="1" value="${idx}" aria-label="${dfT("energy.scrub")}" aria-valuetext="${cesc(this._eWhen())}"></div>`;
  },

  /** What the scrubber points at, in words. */
  _eWhen() {
    const sel = this._eSel();
    const p = (h) => String(h).padStart(2, "0");
    if (sel === "day" || sel === "now") return sel === "day" ? dfT("energy.last24") : dfT("energy.now_live");
    const h = new Date(sel).getHours();
    return `${this._rpWhen(sel).day} ${p(h)}:00–${p((h + 1) % 24)}:00`;
  },
});
