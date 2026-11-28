class DeviceFloorplanCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("device-floorplan-card-editor");
  }

  static getStubConfig(hass) {
    const first = planSensors(hass)[0];
    return { plan: first ? first.attributes.plan_id : "" };
  }

  setConfig(config) {
    if (!config || !(config.plan || (Array.isArray(config.plans) && config.plans.length))) throw new Error(dfT("card.choose_plan"));
    this._raw = config; // as stored in the dashboard (to find and save this card, #97)
    const c = { ...config };
    // 0.11: the Electricity overlay of the test builds is called Energy.
    if (Array.isArray(c.overlays)) c.overlays = c.overlays.map((o) => (o === "electricity" ? "energy" : o));
    if (c.electricity && !c.energy) c.energy = c.electricity;
    // Older configs (0.4.x card, card v0.0x): keep them working.
    if (!c.default_overlay && c.default_view) c.default_overlay = "live";
    // 0.7.4: the Plan overlay is gone; room names are a layer in every overlay. Old configs go to Live.
    if (c.default_overlay === "plan") c.default_overlay = "live";
    // 0.8.2: the People overlay is gone; people show in Live (and the overlays chosen under People).
    if (c.default_overlay === "people") c.default_overlay = "live";
    if (Array.isArray(c.overlays)) c.overlays = c.overlays.filter((o) => o !== "people");
    this._config = c;
    const dock = this._overlays();
    if (this.preview && EDIT_OV && dock.includes(EDIT_OV)) this._overlay = EDIT_OV;
    if (!this._overlay || !dock.includes(this._overlay)) this._overlay = this._defaultOverlay();
    const net = this._ov("network");
    const saved = lsGet(`dfc_net_${this._lsKey()}`) || {};
    const keep = (k, d) => (typeof saved[k] === "boolean" ? saved[k] : d);
    this._net = {
      conns: Array.isArray(saved.conns) ? saved.conns : null, // null = the card's default
      roles: Array.isArray(saved.roles) ? saved.roles : [], // hidden roles
      links: keep("links", net.links !== false),
      hubs: keep("hubs", net.hub_links !== false),
      wlinks: keep("wlinks", net.wifi_links !== false),
      minLqi: Number(net.min_lqi || 0), // the card's setting; viewers switch LQI ranges in the legend (0.8.1)
      lqiOff: Array.isArray(saved.lqiOff) ? saved.lqiOff : [],
      legend: keep("legend", net.legend !== false),
    };
    // 0.7.4: layers chosen by the viewer (per overlay), kept in this browser.
    this._lay = lsGet(`dfc_layers_${this._lsKey()}`) || {};
    // Floors (#75): which plan is shown.
    const ids = this._planIds();
    if (!this._floor || !ids.includes(this._floor)) {
      const rem = c.remember_floor !== false ? lsGet(`dfc_floor_${this._lsKey()}`) : null;
      this._floor = ids.includes(rem) ? rem : ids.includes(c.default_floor) ? c.default_floor : ids[0];
    }
    this._key = null;
    this._popup = null;
    this._menu = false;
    if (this._hass) {
      this._subscribe();
      this._update(true);
    }
  }

  set hass(hass) {
    dfLangOf(hass); // 0.14 L1: texts in this user's language
    if (hass && hass.entities) dfcReg = hass.entities;
    const first = !this._hass;
    this._live = hass;
    // 0.11.1 Home Replay: while replaying, the card sees Home Assistant as it was at the replay time.
    this._hass = this._rpT() != null ? this._rpHass() : hass;
    if (first) this._subscribe();
    this._update();
  }

  /** HA sets this while the dashboard is in edit mode (#97: ✎ Edit markers on the card). */
  set editMode(v) {
    const was = !!this._editMode;
    this._editMode = !!v;
    if (was !== this._editMode && this._hass) this._update(true);
  }

  get editMode() {
    return !!this._editMode;
  }

  /** Walk up through slots and shadow roots. */
  _up(test) {
    let el = this;
    while (el) {
      if (test(el)) return el;
      el = el.assignedSlot || el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    }
    return null;
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", rows: 8, min_columns: 6, min_rows: 4 };
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      const root = this.shadowRoot;
      root.addEventListener("click", (e) => this._onClick(e));
      root.addEventListener("input", (e) => this._onInput(e));
      root.addEventListener("contextmenu", (e) => {
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh],[data-touch]");
        if (!t) return;
        e.preventDefault();
        if (this._held || this._xOn) return; // a touch long press already did it
        this._holdEl(t);
      });
      // 0.7.5: tap = info card, hold = the marker's action. On touch screens hold, then slide = explore:
      // the name and state of whatever is under the finger, like a mouse hover; lifting does nothing.
      // 0.11.1: the camera strip shows a frame's line while the pointer is on it.
      root.addEventListener("pointerover", (e) => {
        const w = e.target.closest && e.target.closest(".cwin");
        const k = w ? w.dataset.wk : null;
        if (k === (this._winHover || null)) return;
        this._winHover = k;
        for (const pth of root.querySelectorAll("path.sl")) pth.classList.toggle("on", pth.dataset.wl === k || pth.classList.contains("ev"));
      });
      // 0.11.1: camera windows move by dragging (before the hold / explore handler below).
      root.addEventListener("pointerdown", (e) => {
        const win = e.target.closest && e.target.closest(".cwin.dr");
        if (!win || e.button > 0 || e.target.closest("[data-camx]")) return;
        e.stopImmediatePropagation();
        this._winDragStart(e, win);
      });
      // 0.11.1 Home Replay: its buttons act on finger down.
      root.addEventListener("pointerdown", (e) => {
        const c = e.target.closest && e.target.closest("[data-rpgo],[data-rpov],[data-rp]");
        if (!c || e.button > 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this._rpCtl(c);
      });
      // test10 Energy: tap or drag over the last 24 hours; every column (Last 24 h, the hours, Now) is one step.
      root.addEventListener("pointerdown", (e) => {
        const tr = e.target.closest && e.target.closest(".etrack");
        if (!tr) return;
        const cols = [...tr.children].map((c) => [c.getBoundingClientRect().right, c.dataset.at]);
        const pick = (x) => {
          const c = cols.find(([r]) => x < r + 1) || cols[cols.length - 1];
          const at = c[1] === "day" || c[1] === "now" ? c[1] : Number(c[1]);
          if (at === this._eSel()) return;
          this._eAt = at;
          this._update(true);
        };
        pick(e.clientX);
        const mv = (ev) => pick(ev.clientX);
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
      // 0.11.1 Home Replay: drag along the 24 hours (the plan follows; the end is Live).
      root.addEventListener("pointerdown", (e) => {
        const tr = e.target.closest && e.target.closest(".rptrack");
        if (!tr) return;
        e.preventDefault();
        this._rpStop();
        this._rp.drag = true;
        // Measured once: every step redraws the card (the grabbed line is replaced, a removed one measures 0).
        const r = tr.getBoundingClientRect();
        const vert = tr.classList.contains("v"); // a side rail: Now at the top
        // test9: a slow drag moves minute by minute; a fast one glues to the step of the chosen speed (one second
        // of play: 3600× = whole hours, 900× = quarters). The thumb stays under the finger; the time snaps.
        let lp = null;
        let lt = 0;
        let vel = 0;
        const off = new Date().getTimezoneOffset() * 60000;
        const pick = (x, y) => {
          const f = Math.max(0, Math.min(1, vert ? (r.bottom - y) / r.height : (x - r.left) / r.width));
          const p = vert ? y : x;
          const tn = performance.now();
          if (lp != null && tn > lt) vel = vel * 0.6 + (Math.abs(p - lp) / (tn - lt)) * 400; // px / s, smoothed
          lp = p;
          lt = tn;
          const step = vel > 140 ? Math.max(60000, this._rp.speed * 1000) : 60000;
          const raw = Date.now() - this._rpSpan() * (1 - f);
          this._rp.dragPct = f * 100;
          this._rpSeek(f >= 0.995 ? Date.now() : Math.round((raw - off) / step) * step + off);
        };
        this._rpLoad().then(() => this._rp.t != null && this._rpSeek(this._rp.t));
        pick(e.clientX, e.clientY);
        const mv = (ev) => pick(ev.clientX, ev.clientY);
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          this._rp.drag = false;
          this._rp.dragPct = null;
          this._update(true);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
      root.addEventListener("pointerdown", (e) => {
        clearTimeout(this._holdT);
        clearTimeout(this._armT);
        this._held = false;
        this._xArm = false;
        this._xOn = false;
        if (e.button > 0) return;
        const inBox = e.target.closest && e.target.closest(".box");
        this._pd = { x: e.clientX, y: e.clientY };
        if (inBox && e.pointerType !== "mouse") this._armT = setTimeout(() => (this._xArm = true), 300);
        const t = e.target.closest && e.target.closest("[data-k],[data-appl],[data-airent],[data-bh],[data-touch]");
        if (!t) return;
        // A long press counts when the finger is lifted without having moved (moving = explore).
        this._pd.t = t;
        this._holdT = setTimeout(() => (this._pd && (this._pd.long = true)), 550);
      });
      root.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse" && !this._pd) return this._hoverSoon(e.clientX, e.clientY);
        if (!this._pd || Math.hypot(e.clientX - this._pd.x, e.clientY - this._pd.y) < 10) return;
        clearTimeout(this._holdT);
        this._pd.long = false;
        this._pd.moved = true;
        if (this._xArm) {
          this._xOn = true;
          this._explore(e.clientX, e.clientY);
        } else clearTimeout(this._armT);
      });
      this.addEventListener("mouseleave", () => this._hideTip());
      root.addEventListener("touchmove", (e) => {
        if (this._xArm && e.cancelable) e.preventDefault(); // exploring, not scrolling the dashboard
      }, { passive: false });
      for (const ev of ["pointerup", "pointercancel"]) root.addEventListener(ev, () => {
        clearTimeout(this._holdT);
        clearTimeout(this._armT);
        const pd = this._pd;
        if (this._xOn) {
          this._held = true; // no tap after exploring
          this._exploreEnd();
        } else if (ev === "pointerup" && pd && pd.long && pd.t && !pd.moved) {
          this._held = true; // the click that follows is not a tap
          this._holdEl(pd.t);
        }
        this._pd = null;
        this._xArm = false;
        this._xOn = false;
      });
      root.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && (this._popup || this._menu)) {
          this._popup = null;
          this._menu = false;
          this._update(true);
        }
      });
    }
    this._onExternal = this._onExternal || ((e) => this._external(e.detail || {}));
    this._onLocation = this._onLocation || (() => this._fromUrl());
    window.addEventListener("device-floorplan-action", this._onExternal);
    this._onTip = this._onTip || (() => this._update(true));
    window.addEventListener("dfc-tip", this._onTip);
    window.addEventListener("location-changed", this._onLocation);
    window.addEventListener("popstate", this._onLocation);
    this._onVisible = this._onVisible || (() => {
      if (!document.hidden && this._dirty) this._update(true);
    });
    document.addEventListener("visibilitychange", this._onVisible);
    if (!this._ro && typeof ResizeObserver !== "undefined") this._ro = new ResizeObserver(() => this._layoutSoon());
    // 0.13.2 (#22): the screen's free height changes on resize / turning the phone.
    this._onWinResize = this._onWinResize || (() => this._layoutSoon());
    window.addEventListener("resize", this._onWinResize);
    this._connected = true;
    // The night look follows the sun / the clock: check every two minutes (renders only on change).
    clearInterval(this._nightT);
    this._nightT = setInterval(() => this._update(), 120000);
    this._subscribe();
    this._fromUrl();
    this._update(true);
  }

  disconnectedCallback() {
    this._connected = false;
    if (this._onWinResize) window.removeEventListener("resize", this._onWinResize);
    clearInterval(this._nightT);
    this._netTimer(false); // 0.11: no Network polling after the card is gone
    clearTimeout(this._trigT);
    if (this._rp) this._rpStop();
    if (this._rpPop) this._rpPop();
    window.removeEventListener("device-floorplan-action", this._onExternal);
    if (this._onTip) window.removeEventListener("dfc-tip", this._onTip);
    window.removeEventListener("location-changed", this._onLocation);
    window.removeEventListener("popstate", this._onLocation);
    document.removeEventListener("visibilitychange", this._onVisible);
    if (this._ro) this._ro.disconnect();
    this._unsubscribe();
  }

  // ------------------------------------------------------------- external control (#47)
  /** device_floorplan.show_overlay → every screen showing a card with that card_id. */
  _subscribe() {
    const id = this._config && this._config.card_id;
    if (!this._connected || !this._hass || !this._hass.connection || !id) return this._unsubscribe();
    if (this._subFor === id) return;
    this._unsubscribe();
    this._subFor = id;
    this._unsub = this._hass.connection
      .subscribeMessage((ev) => this._external(ev || {}), { type: "device_floorplan/overlay/subscribe" })
      .catch(() => null);
  }

  _unsubscribe() {
    if (this._unsub) this._unsub.then((u) => u && u()).catch(() => {});
    this._unsub = null;
    this._subFor = null;
  }

  /** ?overlay=comfort[&card=hall] in the dashboard link switches this screen, on every navigation (#71). */
  _fromUrl() {
    if (!this._config) return;
    const q = new URLSearchParams(window.location.search);
    const o = q.get("overlay");
    const fl = q.get("floor");
    if (!o && !fl) return;
    const card = q.get("card");
    if (card && card !== this._config.card_id) return;
    this._external({ card_id: this._config.card_id, overlay: o, floor: fl });
    // Clean the address afterwards (after every card on the view had its turn), so the same link
    // applies again next time.
    clearTimeout(_urlClean);
    _urlClean = setTimeout(() => {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("overlay") && !u.searchParams.has("floor")) return;
      u.searchParams.delete("overlay");
      u.searchParams.delete("floor");
      u.searchParams.delete("card");
      window.history.replaceState(window.history.state, "", u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash);
    }, 50);
  }

  _external(d) {
    if (!this._config || !d) return;
    if (d.card_id !== undefined && d.card_id !== null && d.card_id !== this._config.card_id) return;
    if (d.floor) this._setFloor(this._findFloor(d.floor), false);
    const o = d.action === "reset" ? "reset" : d.overlay || d.view || d.preset;
    if (!o) return;
    if (o === "reset") return this._setOverlay(this._defaultOverlay());
    this._setOverlay(o === "live_home" ? "live" : o);
  }

  // ------------------------------------------------------------- floors (#75)
  _lsKey() {
    const c = this._config || {};
    return c.card_id || this._planIds().join(",");
  }

  _planIds() {
    const c = this._config || {};
    const list = Array.isArray(c.plans) && c.plans.length ? c.plans : [c.plan];
    return [...new Set(list.filter(Boolean))];
  }

  /** Floors of this card that exist, in the card's order: {id, sensor, level, name, label}. */
  _floors() {
    const all = planSensors(this._hass);
    return this._planIds().map((id) => {
      const s = all.find((x) => x.attributes.plan_id === id);
      if (!s) return null;
      const lv = s.attributes.level;
      return { id, sensor: s, level: lv, name: s.attributes.plan_name || id, label: floorLabel(lv, s.attributes.plan_name), floor_id: s.attributes.floor_id };
    }).filter(Boolean);
  }

  /** A floor by plan id, HA floor id, label ("G", "1") or name. */
  _findFloor(q) {
    const f = this._floors();
    const v = String(q).toLowerCase();
    const hit = f.find((x) => x.id === q) || f.find((x) => (x.floor_id || "") === q) || f.find((x) => x.label.toLowerCase() === v || (v === "g" && x.level === 0)) || f.find((x) => x.name.toLowerCase() === v);
    return hit ? hit.id : null;
  }

  _setFloor(id, render = true) {
    if (!id || id === this._floor || !this._planIds().includes(id)) return;
    this._floor = id;
    this._popup = null;
    this._menu = false;
    this._pillUntil = Date.now() + 2500;
    if (this._config.remember_floor !== false) lsSet(`dfc_floor_${this._lsKey()}`, id);
    if (render) this._update(true);
    else this._key = null;
    // test11: Replay holds the history of what is on screen: the new floor's loads at once (time and play stay).
    if (this._rpIn()) setTimeout(() => this._rpLoad(), 0);
  }

  /** Floors stacked like a building: highest on top. */
  _floorStack() {
    return this._floors().slice().sort((a, b) => (Number.isFinite(b.level) ? b.level : -99) - (Number.isFinite(a.level) ? a.level : -99));
  }

  /** 0.12.1: the building as levels, highest on top. Plans with the same level number are one level with
   *  several plans side by side (house + garden, east + west), in the card's order; a plan without a level
   *  (a view) is a level of its own, as before. */
  _levels() {
    const out = [];
    for (const f of this._floorStack()) {
      const g = Number.isFinite(f.level) ? out.find((x) => x.level === f.level) : null;
      if (g) g.plans.push(f);
      else out.push({ level: Number.isFinite(f.level) ? f.level : null, plans: [f] });
    }
    return out;
  }

  /** Where the shown plan is: [levels, index of its level, index of the plan in that level]. */
  _levelAt() {
    const lv = this._levels();
    const li = Math.max(0, lv.findIndex((g) => g.plans.some((f) => f.id === this._floor)));
    const si = lv[li] ? Math.max(0, lv[li].plans.findIndex((f) => f.id === this._floor)) : 0;
    return [lv, li, si];
  }

  /** Up / down a level. The side is kept when the other level has it, else its first plan. */
  _stepFloor(dir) {
    const [lv, li, si] = this._levelAt();
    const n = lv[li - dir]; // dir +1 = up = earlier in the stack
    if (n) this._setFloor((n.plans[si] || n.plans[0]).id);
  }

  /** Left / right to the next plan of the same level. dir +1 = right. */
  _stepSide(dir) {
    const [lv, li, si] = this._levelAt();
    const n = lv[li] && lv[li].plans[si + dir];
    if (n) this._setFloor(n.id);
  }

  // ------------------------------------------------------------- settings
  _custom() {
    return (Array.isArray(this._config.custom_overlays) ? this._config.custom_overlays : []).filter((o) => o && o.id && !OVERLAYS[o.id]);
  }

  _ovDef(o) {
    if (OVERLAYS[o]) return OVERLAYS[o];
    const c = this._custom().find((x) => x.id === o);
    return c ? { label: c.name || dfT("ov.custom"), icon: c.icon || "mdi:layers-outline", custom: c } : null;
  }

  _overlays() {
    // 0.10: Cleaning joins the default list once a robot is set up on this plan (or when chosen in the card editor).
    const robots = Object.keys((this._a && this._a.robots) || {}).length ? ["cleaning"] : [];
    // 0.11: Electricity joins the default list once a device on this plan has a power sensor.
    const st = (this._hass && this._hass.states) || {};
    const power = (this._eData && this._eData.devs.length) || Object.values((this._a && this._a.devices) || {}).some((d) => (d.entities || []).some((e) => isPower(st[e]))) ? ["energy"] : [];
    const list = Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...power, ...robots, ...this._custom().map((c) => c.id)];
    return list.filter((o) => o !== "plan" && this._ovDef(o));
  }

  /** 0.7.4: a layer of an overlay, as the viewer left it (else the card's default). */
  _layerOn(ov, name, dflt) {
    const l = this._lay[ov] || {};
    const v = l[name];
    // 0.11: a screen's choice counts only while the card's own setting is still the one it changed.
    if (typeof l[`${name}@d`] === "boolean" && l[`${name}@d`] !== dflt) return dflt;
    if (ov === "energy" && typeof l[`${name}@d`] !== "boolean") return dflt; // choices from the 0.11 test builds
    return typeof v === "boolean" ? v : dflt;
  }

  /** Default of a layer other than room names: as set in the card editor (Comfort: heatmap, readings, air flow). */
  _layerDefault(ov, name) {
    if (ov === "comfort") return this._ov("comfort")[{ heat: "heatmap", labels: "readings", air: "airflow", clim: "climate_shown" }[name] || name] !== false;
    if (ov === "security" && name === "all") return this._ov("security").show_quiet === true;
    if (ov === "energy") return { fill: true, flow: this._ov("energy").flow !== false }[name] ?? true;
    if ((ov === "live" || ov === "security") && name === "cams") return false;
    if (name === "replay") return false; // 0.11.1 Home Replay (cards without a rail): off until a viewer turns it on
    if (ov === "network" && name === "pall") return false; // 0.13.9.4: only the nearest proxy's ring by default
    return true;
  }

  _setLayer(ov, name, on, dflt) {
    this._lay = { ...this._lay, [ov]: { ...(this._lay[ov] || {}), [name]: on, ...(typeof dflt === "boolean" ? { [`${name}@d`]: dflt } : {}) } };
    lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
  }

  /** Room names: shown by default in the overlays chosen in the editor (Live, when not set: where Plan was). */
  _roomsDefault(ov) {
    const si = (this._config.rooms || {}).show_in;
    if (!Array.isArray(si)) return ov === "live";
    return si.includes(ov) || (ov === "live" && si.includes("plan"));
  }

  /** Where the Layers button is: a corner of the plan (default top right), the overlay bar, or hidden. */
  /** Where the round buttons (floors · Layers · Replay) sit. test10: beside a side Overlay Bar they are always on
   *  the plan's other side: a corner on the bar's side moves across (saved or not), so the bar keeps its whole
   *  height and left and right are mirrors of each other. evenHidden: the corner even when Layers is hidden. */
  _layersPos(evenHidden = false) {
    const v = this._config.layers_button;
    let pos = ["top-right", "top-left", "bottom-left", "bottom-right", "bar", "hidden"].includes(v) ? v : this._ov("network").layers === false ? "hidden" : "top-right";
    if (pos === "hidden" && evenHidden) pos = "top-right";
    const bp = String((this._config.buttons || {}).position || "");
    const side = /right$/.test(bp) ? "right" : /left$/.test(bp) ? "left" : "";
    if (side && pos.endsWith(`-${side}`)) pos = pos.replace(`-${side}`, side === "right" ? "-left" : "-right");
    return pos;
  }

  /** test10: where the Home Replay button is: "layers" (a round button beside Layers, the default), "bar" (the
   *  Overlay Bar's last button) or "hidden". Without a bar it is beside Layers, so it can't get lost. */
  _rpBtnPos(dockShown) {
    const c = this._config;
    // #101: an overlay whose values are not recorded states (Energy: long-term statistics) has no Replay button.
    if (c.replay === false || c.replay_button === "hidden" || !this._rpOvs().length || RP_SKIP.has(this._overlay)) return "hidden";
    return c.replay_button === "bar" && dockShown ? "bar" : "layers";
  }

  /** The round Replay button. In Replay it turns into the overlay that is replayed (with the list of the others). */
  _rpRoundBtn() {
    const on = !!(this._rp && this._rp.mode);
    return (on && this._rpOvBtn()) || `<button class="layers rpr ${on ? "on" : ""}" data-rpgo="1" title="${on ? dfT("rp.close") : dfT("rp.name")}" aria-label="${dfT("rp.name")}" aria-pressed="${on}"><ha-icon icon="mdi:history"></ha-icon></button>`;
  }

  _defaultOverlay() {
    const dock = this._overlays();
    const d = this._config.default_overlay;
    return dock.includes(d) ? d : dock.includes("live") ? "live" : dock[0];
  }

  _ov(name) {
    return { ...(this._config[name] || {}) };
  }

  // ------------------------------------------------------------- day & night (#74)
  _night() {
    return { ...NIGHT_DEFAULT, ...(this._config.night || {}) };
  }

  /** f: 0 = day … 1 = night; tint: dusk / dawn while the sun is near the horizon. */
  _nightState() {
    const n = this._night();
    const hass = this._hass;
    const sun = hass.states["sun.sun"];
    let mode = n.mode;
    if (mode === "sun" && !(sun && sun.attributes && sun.attributes.elevation != null)) mode = "times";
    let f = 0;
    let tint = null;
    if (mode === "always") f = 1;
    else if (mode === "dark") f = hass.themes && hass.themes.darkMode ? 1 : 0;
    else if (mode === "sun") {
      const e = Number(sun.attributes.elevation);
      // #120: day until sunset, full night 6° below the horizon (civil dusk).
      f = e >= 0 ? 0 : e <= -6 ? 1 : -e / 6;
      // #121: no warm dusk stage unless asked for.
      if (n.warm_dusk && f > 0 && f < 1) tint = sun.attributes.rising ? "dawn" : "dusk";
    } else if (mode === "times") f = timesFactor(n.start, n.end, new Date(this._now()));
    return { f: Math.round(f * 20) / 20, tint, mode };
  }
}
