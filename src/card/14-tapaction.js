Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- actions
  _tapAction(s) {
    if (s.type === "net") return "network";
    const o = this._dev(s.item.id);
    const pt = this._per(s.item, this._overlay).tap;
    if (pt) return pt;
    if (o.tap) return o.tap;
    // 0.10: a robot opens its panel (the setting above can change that).
    if (s.type === "robot" || (s.ents || []).some((e) => domainOf(e) === "vacuum") || domainOf(s.item.main_entity || "") === "vacuum") return "robot";
    if (s.item.bond && s.item.tap === "more") return "more-info";
    const taps = { ...TAP_DEFAULT, ...(this._config.tap || {}) };
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    const act = taps[k] || "more-info";
    if (act === "toggle" && !s.ents.some((e) => TOGGLE_DOMAINS.has(domainOf(e)))) return "more-info";
    // 0.12.8: Health is for checking (batteries, connections): a tap there opens details, it never switches.
    if (act === "toggle" && this._overlay === "health") return "more-info";
    return act;
  },

  /** 0.12.8: the device's own word for "active": a door is open, motion is detected, an appliance is running. */
  _onWords(item, sp) {
    const e = (sp && sp.eid) || item.main_entity;
    const st = e && this._hass.states[e];
    const dm = e ? domainOf(e) : "";
    const dc = (st && st.attributes.device_class) || "";
    if (this._applOf(item)) return "it's running";
    if (dm === "cover" || ["door", "window", "opening", "garage_door", "garage"].includes(dc)) return "it's open";
    if (["motion", "moving", "vibration"].includes(dc)) return "motion is detected";
    if (["occupancy", "presence"].includes(dc)) return "someone is there";
    if (dm === "media_player") return "it's playing";
    if (dm === "lock") return "it's unlocked";
    if (dm === "climate") return "it's running";
    return "it's on";
  },

  /** Marker editing: ✕ on the selected marker hides it in this overlay (#108). */
  _xb(s) {
    return this._pick && s.item && this._selId === s.item.id ? `<span class="xb" data-xb="1" title="${dfT("edit.hide_here")}">✕</span>` : "";
  },

  _penHtml() {
    const m = this._penMode();
    if (m === "pen") return `<button class="pen" data-pen="1" title="${dfT("edit.pen_title")}"><ha-icon icon="mdi:pencil"></ha-icon>${dfT("edit.markers")}</button>`;
    return "";
  },

  _onClick(e) {
    const t = e.target;
    // 0.11.1: the click that ends a camera window drag does nothing (wherever it lands after a redraw).
    if (this._winMoved && Date.now() - this._winMoved < 500) {
      this._winMoved = 0;
      return;
    }
    // Edit markers: the info card preview is only a preview, its buttons are not run.
    if (this._pick && t.closest(".pop.prev")) {
      if (t.closest("[data-close]")) {
        this._prevHide = this._selId;
        return this._update(true);
      }
      const b = t.closest("[data-appldone],[data-iopen],[data-itg],[data-press],[data-mi]");
      if (b) this._toast(dfT("toast.preview_not_run", { b: b.textContent.trim().slice(0, 40) }));
      return;
    }
    if (t.closest("[data-pen]")) {
      e.stopPropagation();
      return this._openPen();
    }
    // 0.10: robot panel buttons, "Clean this room", tap on a room in Cleaning.
    const rc = t.closest("[data-rbcmd]");
    if (rc) {
      this._hass.callService("vacuum", rc.dataset.rbcmd, { entity_id: rc.dataset.rb });
      this._popup = null;
      return this._update(true);
    }
    const cr = t.closest("[data-cleanroom]");
    if (cr) {
      this._hass.callService("vacuum", "clean_area", { entity_id: cr.dataset.rb, cleaning_area_id: [cr.dataset.cleanroom] });
      this._popup = null;
      this._toast(dfT("toast.cleaning_started"));
      return this._update(true);
    }
    const rm = !this._pick && !this._popup && t.closest("[data-croom]");
    if (rm) {
      this._popup = { type: "room", area: rm.dataset.croom };
      return this._update(true);
    }
    if (t.closest("[data-xb]") && this._pick) {
      e.stopPropagation();
      return this._pickHide && this._pickHide(this._selId);
    }
    const pp = this._pick && t.closest("[data-person]");
    if (pp) return this._pick(`person:${pp.dataset.person}`);
    const oa = t.closest("[data-oact]");
    if (oa) {
      if (this._held) {
        this._held = false;
        return;
      }
      const x = this._ovActs()[Number(oa.dataset.oact)];
      if (x && x.tap_action) this._barRun(x.tap_action, this._ovActEnt(x));
      else if (x && this._ovActEnt(x)) this._moreInfo(this._ovActEnt(x));
      return;
    }
    const ov = t.closest("[data-ov]");
    const scb = t.closest("[data-sc]");
    if ((ov || scb) && this._held) {
      this._held = false; // a long press already ran the hold action
      return;
    }
    if (ov) return this._setOverlay(ov.dataset.ov);
    if (scb) return this._barTap(Number(scb.dataset.sc));
    const ch = t.closest("[data-chev]");
    if (ch) {
      const nav = ch.parentElement.querySelector("nav.dock");
      const v = nav.getAttribute("aria-orientation") === "vertical";
      const by = Number(ch.dataset.chev) * (v ? nav.clientHeight : nav.clientWidth) * 0.8;
      nav.scrollBy(v ? { top: by, behavior: "smooth" } : { left: by, behavior: "smooth" });
      return;
    }
    if (t.closest("[data-menu]")) {
      this._menu = !this._menu;
      this._fopen = false;
      return this._update(true);
    }
    const cn = t.closest("[data-conn]");
    if (cn) {
      const v = cn.dataset.conn;
      if (v === "__default") this._net = { ...this._net, conns: null };
      else {
        const cur = new Set(Array.isArray(this._net.conns) && this._net.conns.length ? this._net.conns : []);
        if (cur.has(v)) cur.delete(v);
        else cur.add(v);
        this._net = { ...this._net, conns: cur.size ? CONN_ORDER.filter((c) => cur.has(c)) : null };
      }
      this._saveNet();
      return this._update(true);
    }
    const rl = t.closest("[data-role]");
    if (rl) {
      const set = new Set(this._net.roles || []);
      if (set.has(rl.dataset.role)) set.delete(rl.dataset.role);
      else set.add(rl.dataset.role);
      this._net = { ...this._net, roles: [...set] };
      this._saveNet();
      return this._update(true);
    }
    const lq = t.closest("[data-lqi]");
    if (lq) {
      const v = Number(lq.dataset.lqi);
      const set = new Set(this._net.lqiOff || []);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      this._net = { ...this._net, lqiOff: [...set] };
      this._saveNet();
      return this._update(true);
    }
    if (t.closest("[data-refresh]")) return this._refreshZha();
    if (t.closest("[data-fbtn]")) {
      this._fopen = true;
      this._menu = false;
      return this._update(true);
    }
    const fl = t.closest("[data-floor]");
    if (fl) {
      this._fopen = false;
      if (fl.dataset.floor === this._floor) return this._update(true);
      return this._setFloor(fl.dataset.floor);
    }
    const sd = t.closest("[data-side]");
    if (sd) {
      // 0.12.1: ◀ ▶ keep the rail open, so several plans of a level can be stepped through.
      this._stepSide(Number(sd.dataset.side));
      return;
    }
    const stp = t.closest("[data-step]");
    if (stp) {
      this._fopen = false;
      const before = this._floor;
      this._stepFloor(Number(stp.dataset.step));
      if (this._floor === before) this._update(true);
      return;
    }
    if (this._fopen) {
      this._fopen = false; // a tap anywhere else closes the floor list
      this._update(true);
      if (!t.closest("[data-k]")) return;
    }
    const air = t.closest("[data-airent]");
    if (air) {
      if (this._held) {
        this._held = false;
        return;
      }
      if (this._pick) return this._pick(air.dataset.airid); // Edit markers: select the AC
      return this._moreInfo(air.dataset.airent);
    }
    const pl = t.closest("[data-pulse]");
    if (pl) return this._moreInfo(pl.dataset.pulse);
    if (t.closest("[data-tipx]")) return this._tipClose();
    if (t.closest("[data-tipgo]")) {
      this._tipClose();
      window.history.pushState(null, "", PANEL_PATH);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    const nov = t.closest("[data-newov]");
    if (nov) return this._newOvAnswer(nov.dataset.newov, !!nov.dataset.add);
    const ad = t.closest("[data-appldone]");
    if (ad) {
      if (this._applDone) delete this._applDone[ad.dataset.appldone];
      this._applSave();
      this._popup = null;
      return this._update(true);
    }
    const apl = t.closest("[data-appl]");
    if (apl) {
      if (this._held) {
        this._held = false;
        return;
      }
      const keys = apl.dataset.appl.split(",");
      if (this._pick) return this._pick(keys[0]); // Edit markers: select it
      this._popup = keys.length > 1 ? { type: "appl", keys } : { type: "info", appl: keys[0] };
      return this._update(true);
    }
    const bar = t.closest("[data-bar]");
    if (bar) return this._moreInfo(bar.dataset.bar);
    const cv = t.closest("[data-cov]");
    if (cv) return this._coverCmd(cv.dataset.cov, cv.dataset.cmd);
    const hlk = t.closest("[data-hl]");
    if (hlk) return this._highlight(hlk.dataset.hl);
    const tg = t.closest("[data-tg]");
    if (tg) {
      this._net = { ...this._net, [tg.dataset.tg]: !this._net[tg.dataset.tg] };
      this._saveNet();
      return this._update(true);
    }
    if (t.closest("[data-layreset]")) {
      const ov = this._overlay;
      const rest = { ...this._lay };
      delete rest[ov];
      this._lay = rest;
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      if (ov === "network") {
        lsSet(`dfc_net_${this._lsKey()}`, {});
        this.setConfig(this._raw || this._config);
      }
      return this._update(true);
    }
    const ly = t.closest("[data-lay]");
    if (ly) {
      const ov = this._overlay;
      const name = ly.dataset.lay;
      const dflt = name === "rooms" ? this._roomsDefault(ov) : this._layerDefault(ov, name);
      this._setLayer(ov, name, !this._layerOn(ov, name, dflt), dflt);
      if (name === "replay") return this._rpOpen(this._layerOn(ov, "replay", false)); // no rail: Replay from Layers
      return this._update(true);
    }
    // 0.11.1 Home Replay: the rail button, ← Now, play, previous / next, the overlay to replay.
    if (t.closest("[data-rpgo],[data-rpov],[data-rp]")) {
      if (e.detail === 0) this._rpCtl(t); // keyboard (Enter / Space): a click without a pointer
      return;
    }
    if (this._rp && this._rp.menu) {
      this._rp.menu = false;
      this._update(true);
    }
    if (t.closest(".lmenu")) return;
    if (this._menu) {
      this._menu = false;
      this._update(true);
      if (!t.closest("[data-k]")) return;
    }
    const sc = t.closest("[data-scene]");
    if (sc) return this._runScene(sc.dataset.scene);
    if (t.closest("[data-new]")) {
      window.history.pushState(null, "", `${PANEL_PATH}?new=1`);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    const cf = t.closest("[data-confirm]");
    if (cf) {
      const p = this._popup;
      this._popup = null;
      if (p && p.action === "all_off") {
        const ents = this._lightEnts();
        if (ents.length) this._hass.callService("homeassistant", "turn_off", { entity_id: ents });
      }
      return this._update(true);
    }
    if (t.closest("[data-close]") || t.classList.contains("pop")) {
      this._popup = null;
      this._update(true);
      return;
    }
    const mi = t.closest("[data-mi]");
    if (mi) return this._moreInfo(mi.dataset.mi);
    const rs = t.closest("[data-rdsub]");
    if (rs && this._popup && this._popup.type === "readings") {
      this._popup = { ...this._popup, sub: rs.dataset.rdsub || null }; // 0.12.10: a device's own chart, "‹" back
      return this._update(true);
    }
    const io = t.closest("[data-iopen]");
    if (io) {
      const p0 = this._popup || {};
      this._popup = null;
      if (p0.appl) return this._moreInfo(io.dataset.iopen);
      const s0 = this._specs && this._specs.get(io.dataset.iopen);
      if (s0) s0.phantom ? (s0.type === "chip" ? this._openReadings(s0) : this._openList(s0)) : this._details(s0);
      return this._update(true);
    }
    const itg = t.closest("[data-itg]");
    if (itg) {
      const s0 = this._specs && this._specs.get(itg.dataset.itg);
      if (s0) this._toggle({ ...s0, ents: this._infoToggles(s0.item.bond ? { ...s0, ents: s0.item.entities || [] } : s0) });
      return;
    }
    const ip = t.closest("[data-press]");
    if (ip) {
      const e0 = ip.dataset.press;
      this._hass.callService(domainOf(e0), "press", { entity_id: e0 });
      ip.classList.add("done");
      return;
    }
    const pe = t.closest("[data-person]");
    if (pe) return this._moreInfo(pe.dataset.person);
    const wk = t.closest("[data-wk]");
    if (wk && !t.closest("[data-camx]")) {
      const ws = this._specs && this._specs.get(wk.dataset.wk);
      if (ws) return this._runAction(ws);
      return;
    }
    const cx = t.closest("[data-camx]");
    if (cx) {
      const st0 = this._hass.states[cx.dataset.camx];
      if (st0) this._camX = { ...(this._camX || {}), [cx.dataset.camx]: domainOf(cx.dataset.camx) === "event" ? st0.state : st0.last_changed };
      return this._update(true);
    }
    const k = t.closest("[data-k]");
    const tz = !k && t.closest("[data-touch]");
    if (!k && !tz) {
      if (!this._held && !this._swiped && t.closest(".box")) this._flashTouch();
      return;
    }
    if (this._swiped) {
      this._swiped = false;
      return;
    }
    if (this._held) {
      this._held = false;
      return;
    }
    // 0.12.6: in the card editor a tap selects the device AND does its real tap (the preview acts like the card).
    if (tz) {
      if (this._rpIn()) return null; // Replay is for looking
      this._pickNote(tz.dataset.touch);
      return this._touchTap(tz.dataset.touch);
    }
    return this._tapSpec(this._specs && this._specs.get(k.dataset.k));
  },

  /** A marker's tap (also a phantom's picture / touch area, which has no single device to switch). */
  _tapSpec(s) {
    if (!s) return;
    this._pickNote(s.item.id, s); // marker editing (#87/#95): select, then act
    if (s.elist) {
      this._popup = { type: "elist", key: s.key };
      return this._update(true);
    }
    // 0.11.1: a bond of lights is one lamp: tap switches all its bulbs (unless a tap is set for it).
    if (s.type !== "net" && this._lampBond(s.item) && !this._dev(s.item.id).tap && !this._per(s.item, this._overlay).tap) return this._toggle({ ...s, ents: this._parts(s.item) });
    // 0.7.5: bonds and phantoms (several things in one marker) open the info card; a single device does its tap action.
    // 0.12.10: a phantom of readings works like one thermometer: its tap opens the readings (the info card is the long press).
    if (s.type !== "net" && (s.phantom || s.item.bond || s.item.phantom) && !this._rdPhantom(s)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    return this._runAction(s);
  },

  /** The marker's own action ("Open ›" in the info card, a tap); 0.12.6: also a chosen long press (pre "hold_"). */
  _runAction(s, act = this._tapAction(s), pre = "") {
    if (act === "none") return;
    // 0.12.1: an unavailable device says so instead of trying to switch.
    if (act === "toggle") {
      const sts = (s.ents || []).map((e) => this._hass.states[e]).filter(Boolean);
      if (sts.length && sts.every((x) => x.state === "unavailable")) return this._toast(dfT("toast.unavailable", { d: this._dev(s.item.id).name || s.item.name || dfT("this_device") }));
    }
    if (act === "robot") {
      const eid = s.type === "robot" ? s.eid : [s.eid, ...(s.ents || []), s.item.main_entity].find((e) => e && domainOf(e) === "vacuum");
      if (eid) {
        this._popup = { type: "robot", key: s.key, eid };
        return this._update(true);
      }
    }
    // 0.10: open a dashboard / a browser_mod popup (set per device in Edit markers).
    if (act === "navigate" || act === "popup") {
      const o0 = { ...this._dev(s.item.id), ...this._per(s.item, this._overlay) };
      const o = { nav: o0[`${pre}nav`], popup_title: o0[`${pre}popup_title`], popup_card: o0[`${pre}popup_card`] };
      // 0.12.6: in the card editor's preview a dashboard is only named (leaving would close the editor).
      if (act === "navigate" && o.nav && this._isPreview()) return this._toast(dfT("toast.would_open", { u: o.nav }));
      const cfg = act === "navigate" ? (o.nav ? { action: "navigate", navigation_path: o.nav } : null) : o.popup_card ? { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(o.popup_title ? { title: o.popup_title } : {}), content: o.popup_card } } } : null;
      if (cfg) this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: s.ents[0], tap_action: cfg }, action: "tap" }, bubbles: true, composed: true }));
      else this._moreInfo(s.ents[0]);
      return;
    }
    if (act === "network") {
      this._popup = { type: "net", key: s.key };
      return this._update(true);
    }
    if (act === "toggle") return this._toggle(s);
    if (act === "readings") return this._openReadings(s);
    // Covers: the shutter controls (position, open / stop / close), also when a cover leads a bond
    // (shutter + window contact): only the covers are in the popup.
    // 0.10.2: any marker with a cover gets them, also when its main entity is a sensor
    // (an unsplit Shelly 2PM drawn as a bar).
    const covs = [...new Set([...s.ents, ...(s.item.allEntities || s.item.entities || [])])].filter((e) => e && domainOf(e) === "cover" && this._hass.states[e]);
    if (covs.length) {
      this._popup = { type: "covers", key: s.key, ents: covs };
      return this._update(true);
    }
    if (s.item.bond || (s.also && s.also.length)) return this._openList({ ...s, ents: [s.eid, ...(s.also || [])].filter(Boolean) });
    this._moreInfo(s.ents[0]);
  },

  _onInput(e) {
    const t = e.target;
    // test10 Energy: the hours by keyboard (the hidden slider over the bars).
    if (t && t.classList && t.classList.contains("erange")) {
      const i = Number(t.value);
      this._eAt = i <= 0 ? "day" : i >= 25 ? "now" : this._eHours()[i - 1].ts;
      return this._update(true);
    }
    if (t && t.classList && t.classList.contains("rpspeed")) {
      this._rp.speed = Number(t.value) || 900;
      lsSet("dfc_rp_speed", this._rp.speed);
      return this._update(true);
    }
    if (t && t.classList && t.classList.contains("rprange")) {
      this._rp.range = Number(t.value) || 24;
      lsSet("dfc_rp_range", this._rp.range);
      if (this._rp.t != null && this._rp.t < Date.now() - this._rpSpan()) this._rpLive(false);
      return this._rpLoad();
    }
    if (t && t.dataset && t.dataset.covpos) {
      clearTimeout(this._covT);
      this._covT = setTimeout(() => this._hass.callService("cover", "set_cover_position", { entity_id: t.dataset.covpos, position: Number(t.value) }), 350);
      return;
    }
    if (t && t.dataset && t.dataset.cleanop) {
      this._lay = { ...this._lay, cleaning: { ...(this._lay.cleaning || {}), op: Number(t.value) } };
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      const svg = this.shadowRoot.querySelector("svg.fresh");
      if (svg) svg.style.opacity = String(Number(t.value) / 100);
      return;
    }
    if (t && t.dataset && t.dataset.heatop) {
      this._lay = { ...this._lay, comfort: { ...(this._lay.comfort || {}), heatOp: Number(t.value) } };
      lsSet(`dfc_layers_${this._lsKey()}`, this._lay);
      this._drawHeat();
      return;
    }
  },

  /** Hold / right-click: Home Assistant's details (graphs for a phantom). In Edit markers it's only simulated. */
  _holdEl(t) {
    if (t.dataset.bh) this._barHold(t);
    else if (t.dataset.k) this._hold(t.dataset.k);
    else if (t.dataset.airent) this._moreInfo(t.dataset.airent);
    else if (t.dataset.touch) this._touchHold(t.dataset.touch, t.dataset.ent); // 0.12.6: the device's own long press
    else this._holdAppl(t.dataset.appl);
  },

  _hold(key) {
    const s = this._specs && this._specs.get(key);
    if (!s) return;
    this._pickNote(s.item.id, s);
    this._runHold(s);
  },

  /** 0.12.6: the long press chosen for a marker: per overlay, the device, the card's per kind; "" = the default. */
  _holdAction(s) {
    if (s.type === "net") return "";
    const pt = this._per(s.item, this._overlay).hold;
    if (pt) return pt;
    const o = this._dev(s.item.id);
    if (o.hold) return o.hold;
    const k = s.type === "chip" && s.kind === "reading" ? "reading" : tapKind(s.kind);
    return (this._config.hold || {})[k] || "";
  },

  /** 0.12.6: run the long press: the chosen action, else the default (details; graphs for a phantom; a lamp bond's info card). */
  _runHold(s) {
    const act = this._holdAction(s);
    if (!act || act === "default") return this._details(s);
    if (act === "info") {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    const ents = this._lampBond(s.item) ? this._parts(s.item) : s.ents;
    if (act === "toggle") return this._toggle({ ...s, ents });
    return this._runAction({ ...s, ents }, act, "hold_");
  },

  /** 0.12.6: what a tap / long press does, in words (Edit markers, the card editor). */
  _actWords(s, hold) {
    const multi = (s.phantom || s.item.bond || s.item.phantom) && !this._rdPhantom(s);
    const W = { "more-info": "details", toggle: "switch on / off", readings: "readings with history", navigate: "open a dashboard", popup: "a popup card", none: "nothing", network: "network info", robot: "robot panel", info: "info card" };
    if (hold) {
      const h = this._holdAction(s);
      if (h && h !== "default") return W[h] || h;
      return this._rdPhantom(s) ? "info card" : s.phantom ? "graphs" : this._lampBond(s.item) ? "info card" : "details";
    }
    if (this._lampBond(s.item) && !this._dev(s.item.id).tap && !this._per(s.item, this._overlay).tap) return "switch all";
    if (multi && !this._per(s.item, this._overlay).tap && !this._dev(s.item.id).tap) return "info card";
    return W[this._tapAction(s)] || this._tapAction(s);
  },

  /** 0.12.6: tell the card editor which device was tapped / held (big editor: select it; HA's preview: open
   *  its settings). The action itself still runs, as on the dashboard. */
  _pickNote(id, s) {
    if (!id) return;
    if (this._pick) this._pick(id, s);
    else if (this._isPreview()) window.dispatchEvent(new CustomEvent("dfc-preview-pick", { detail: { id, ov: this._overlay } }));
  },

  /** 0.12.6: inside the card editor's preview (HA sets .preview on preview cards; the dialog as a fallback). */
  _isPreview() {
    if (this.preview === true || this.hasAttribute("preview")) return true;
    let n = this;
    for (let i = 0; i < 30 && n; i++) {
      if (n.tagName && /HUI-CARD-PREVIEW|HUI-DIALOG-EDIT-CARD|HUI-SECTION-PREVIEW/.test(n.tagName)) return true;
      n = n.parentNode || n.host;
    }
    return false;
  },

  /** Home Assistant's details of a marker: graphs for a phantom, the leading entity's dialog otherwise. */
  /** 0.12.10: a phantom chip of readings (thermometers): tap = readings, long press = info card. */
  _rdPhantom(s) {
    return !!(s && s.phantom && s.type === "chip" && s.kind === "reading");
  },

  _details(s) {
    if (this._rdPhantom(s)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    if (s.phantom) return s.type === "chip" ? this._openReadings(s) : this._openList(s);
    // 0.11.1: a lamp bond's long press opens its info card (its tap switches it).
    if (s.type !== "net" && this._lampBond(s.item)) {
      this._popup = { type: "info", key: s.key };
      return this._update(true);
    }
    this._moreInfo(s.eid || (s.ents || [])[0]);
  },

  /** Hold on an appliance: its details. */
  _holdAppl(ids) {
    const o = (this._appls || []).find((x) => x.ap.item.id === String(ids).split(",")[0]);
    if (!o) return;
    this._pickNote(o.ap.item.id);
    const ap = o.ap;
    this._moreInfo(ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity);
  },

  /** A short message on the card (Edit markers simulation). */
  _toast(text) {
    const card = this.shadowRoot && this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    let el = card.querySelector(".ftoast");
    if (!el) {
      el = document.createElement("div");
      el.className = "ftoast";
      card.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 2600);
  },

  /** "Name · state" of the thing at a screen point (markers, chips, openings, appliances, people). */
  _tipAt(x, y) {
    const root = this.shadowRoot;
    const hit = root.elementFromPoint ? root.elementFromPoint(x, y) : null;
    if (!hit || !hit.closest || hit.closest(".pop, .lmenu, .dock, .lcorner, .fcorner, .lslot")) return { text: "", el: null };
    const el = hit.closest("[data-k],[data-appl],[data-bar],[data-person],[data-ghost],[data-airent]");
    let text = "";
    if (el && el.dataset.k) {
      const s = this._specs && this._specs.get(el.dataset.k);
      text = s ? this._tipText(s) : "";
    }
    if (el && !text) text = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    return { text, el };
  },

  /** The one tooltip, placed inside the card above the point (finger or mouse). */
  _showTip(text, x, y, el, finger) {
    const card = this.shadowRoot && this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    let tip = card.querySelector(".xtip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "xtip";
      card.appendChild(tip);
    }
    clearTimeout(this._xtipT);
    if (!text) return tip.classList.remove("show");
    tip.textContent = text;
    const c = card.getBoundingClientRect();
    let ax = x, ay = y - (finger ? 48 : 0);
    if (el && !finger) {
      const r = el.getBoundingClientRect();
      ax = r.left + r.width / 2;
      ay = r.top - 6;
    }
    const w = tip.offsetWidth || 120;
    const h = tip.offsetHeight || 28;
    const left = Math.max(w / 2 + 4, Math.min(c.width - w / 2 - 4, ax - c.left));
    const top = Math.max(h + 4, ay - c.top);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.add("show");
  },

  _hideTip() {
    clearTimeout(this._hovT);
    this._hovEl = null;
    const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
    if (tip) tip.classList.remove("show");
  },

  /** PC hover: after a short pause over a thing, its name and state. */
  _hoverSoon(x, y) {
    if (this._hovRaf) return;
    this._hovRaf = requestAnimationFrame(() => {
      this._hovRaf = null;
      const { text, el } = this._tipAt(x, y);
      if (el === this._hovEl) return;
      this._hovEl = el;
      clearTimeout(this._hovT);
      if (!el || !text) return this._showTip("", 0, 0);
      this._hovT = setTimeout(() => this._showTip(text, x, y, el, false), 150);
    });
  },

  /** Explore (touch): show the name and state of what's under the finger. */
  _explore(x, y) {
    const { text } = this._tipAt(x, y);
    this._showTip(text, x, y, null, true); // above the finger, never under it
  },

  _exploreEnd() {
    clearTimeout(this._xtipT);
    this._xtipT = setTimeout(() => {
      const tip = this.shadowRoot && this.shadowRoot.querySelector(".xtip");
      if (tip) tip.classList.remove("show");
    }, 1000);
  },

  /** "Name · state" for the hover tooltip and explore. */
  _tipText(s) {
    return `${s.name}${this._tipState(s) ? ` · ${this._tipState(s)}` : ""}`;
  },

  _tipState(s) {
    if (s.type === "net") return "";
    let t = "";
    if (s.type === "chip") return ""; // 0.11: a chip already shows its values: the tip only names it
    else if (s.eid || (s.ents || [])[0]) t = this._fmt(s.eid || s.ents[0]);
    return t && t !== "—" ? t : t === "—" ? dfT("unavailable_l") : "";
  },
});
