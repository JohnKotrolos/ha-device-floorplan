// Mobile card: navigation, gestures (swipe, plan taps) and the actions of its buttons (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** Taps on an embedded plan (#21): a whole floor is tapped only to open a room; devices only in a room. The
   *  card's own buttons (Layers, Replay) keep working. */
  _planTap(e, el) {
    if (this._swAt && Date.now() - this._swAt < 500) return this._stop(e);
    const mode = el._dfmMode;
    const path = e.composedPath();
    const inBox = path.some((n) => n && n.classList && n.classList.contains("box"));
    if (!inBox) return; // the card's own buttons and menus
    if (path.some((n) => n && n.classList && n.classList.contains("pop"))) return; // #63: the card's own popup (Press? · Cancel)
    // #83: landscape is the detailed view: a device acts by its own tap settings (the card does it); an empty
    // spot of a floor opens its room (#75: not on a floor with one room); in a room it does nothing.
    if (mode === "land" || mode === "landroom") {
      if (!lsGet("dfm_hint_l")) lsSet("dfm_hint_l", 1); // #92-6: the landscape hint has done its job
      if (path.find((n) => n && n.dataset && (n.dataset.k || n.dataset.touch))) return;
      this._stop(e);
      if (mode === "landroom") return;
    } else if (mode === "room") {
      const k = path.find((n) => n && n.dataset && n.dataset.k);
      this._stop(e);
      const sp = k && el._specs && el._specs.get(k.dataset.k);
      const eid = sp && (sp.eid || (sp.ents || [])[0] || (sp.item && sp.item.main_entity));
      // #63: a marker set to "Press a button" presses it here too (asking first, in the card's own popup).
      if (sp && sp.item && el._tapAction(sp) === "press") return el._runAction(sp, "press");
      if (eid) this._more(eid);
      return;
    }
    this._stop(e);
    const box = path.find((n) => n && n.classList && n.classList.contains("box"));
    const r = box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const f = this._m.floors.find((q) => q.id === el._dfmFloor);
    if (this._m.rooms.filter((q) => q.floor === (f && f.id)).length < 2) return; // #75: one room: no room level
    const areas = (f && f.a.areas) || {};
    let hit = Object.keys(areas).find((id) => Array.isArray(areas[id].shape) && areas[id].shape.length >= 3 && inPoly(x, y, areas[id].shape));
    if (!hit) {
      const near = Object.entries(areas).map(([id, ar]) => [id, Math.hypot(ar.x - x, ar.y - y)]).sort((p, q) => p[1] - q[1])[0];
      if (near && near[1] < 10) hit = near[0];
    }
    if (hit && this._m.rooms.some((q) => q.id === hit && q.floor === f.id)) this._go({ page: "room", floor: f.id, room: hit });
  },

  _stop(e) {
    e.stopPropagation();
    e.preventDefault();
  },

  /** One-finger swipe anywhere on a swipe area (#28): next / previous room or floor. */
  _pdown(e) {
    this._ptr = true;
    this._touched();
    const path = e.composedPath();
    // #79 / #83: the card's overlay rail, Home Replay's bar and its popups never swipe floors or rooms.
    const ctl = path.some((n) => n && n.classList && ["dockrow", "dock", "rprail", "rpbar", "rptrack", "layers", "pop", "lmenu", "ovbar"].some((c) => n.classList.contains(c)));
    const z = ctl ? null : path.find((n) => n && n.dataset && n.dataset.swipe);
    this._sw = z ? { x: e.clientX, y: e.clientY, t: Date.now(), zone: z.dataset.swipe } : null;
  },

  _pup(e) {
    this._ptr = null;
    const sw = this._sw;
    this._sw = null;
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - sw.t > 900) return;
    this._swAt = Date.now();
    this._step(dx < 0 ? 1 : -1, sw.zone);
  },

  _step(dir, zone) {
    const s = this._s;
    const m = this._m;
    if (zone === "room" || (!zone && s.page === "room")) {
      const list = this._sortRooms(m.rooms.filter((r) => r.floor === s.floor));
      const i = list.findIndex((r) => r.id === s.room);
      const n = list[(i + dir + list.length) % list.length];
      if (n) {
        s.room = n.id;
        this._kick(true);
      }
      return;
    }
    const fl = m.floors;
    const i = fl.findIndex((f) => f.id === s.floor);
    const n = fl[(i - dir + fl.length) % fl.length];
    if (n && n.id !== s.floor) {
      s.floor = n.id;
      if (s.page === "house") s.page = "home"; // #89: a floor picked = that floor (landscape: its plan)
      this._kick(true);
    }
  },

  /** #22: the main floor: the floor (a plan with a level) with the most devices; ties: the ground floor. */
  _mainFloor(m) {
    const cand = m.floors.filter((f) => Number.isFinite(f.level));
    return (cand.length ? cand : m.floors).map((f) => [f, m.items.filter((x) => x.floor === f.id).length]).sort((p, q) => q[1] - p[1] || (q[0].level === 0) - (p[0].level === 0))[0][0].id;
  },

  // ------------------------------------------------------------- navigation
  _go(next) {
    if (next.page === "room" && !lsGet("dfm_hint_p")) lsSet("dfm_hint_p", 1); // #92-6: the portrait hint has done its job
    const s = this._s;
    s.back.push({ page: s.page, floor: s.floor, room: s.room, ov: s.ov });
    if (s.back.length > 30) s.back.shift();
    Object.assign(s, next);
    this._sheet = null;
    this._frozen = null;
    this._kick(true);
    const pg = this.shadowRoot && this.shadowRoot.querySelector("[data-scroll=pg]");
    if (pg) pg.scrollTop = 0;
  },

  _back() {
    const s = this._s;
    if (this._land()) {
      // Landscape: one level out (room → floor → house).
      if (s.page === "room") Object.assign(s, { page: "rooms", room: null });
      else if (this._m.levels.length > 1) Object.assign(s, { page: "house", room: null });
      this._kick(true);
      return;
    }
    const p = s.back.pop();
    if (p) Object.assign(s, p);
    else Object.assign(s, { page: "home", room: null });
    this._kick(true);
  },

  _more(eid) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
  },

  _touched() {
    if (!this._land()) return;
    const was = this._hdrHidden;
    this._hdrShow = Date.now();
    if (was) {
      this._hdrHidden = false;
      const h = this.shadowRoot.querySelectorAll(".float");
      for (const x of h) x.classList.remove("gone");
    }
    this._hdrTimer();
  },

  _hdrTimer() {
    clearTimeout(this._hdrT);
    this._hdrT = setTimeout(() => {
      this._hdrHidden = true;
      for (const x of this.shadowRoot.querySelectorAll(".float")) x.classList.add("gone");
    }, 5000);
  },

  _click(e) {
    const t = e.target.closest("[data-a]");
    if (!t) return;
    const a = t.dataset.a;
    const v = t.dataset.v;
    const s = this._s;
    if (a === "back") return this._back();
    if (a === "menu") return this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    const open = (sh) => {
      this._sheet = sh;
      this._freeze = true;
      this._frozen = null;
      return this._kick(true);
    };
    if (a === "tab") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: v, room: null });
    }
    if (a === "house") return this._go({ page: "house", room: null });
    // #85: the place pill and "See all" of Rooms open the Navigator (Home, floors, their rooms).
    if (a === "home" || a === "nav") return open({ step: "nav" });
    if (a === "appl") return open({ step: "appl", key: v });
    if (a === "appldone") {
      const x = this._m.items.find((q) => q.ap && q.item.id === v);
      if (x && x.h._applDone) {
        delete x.h._applDone[v];
        if (x.h._applSave) x.h._applSave();
      }
      return this._kick(true);
    }
    // #71: a floor picked in the Navigator: Home shows that floor (its plan, rooms and values).
    if (a === "sheet-floor") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "home", floor: v, room: null });
    }
    if (a === "items") {
      this._sheet = { step: "items", floor: s.floor, kind: v, title: { open: dfT("mob.openings"), cover: dfT("mob.shutters"), alarm: dfT("mob.alert") }[v] || "" };
      this._freeze = true;
      this._frozen = null;
      return this._kick(true);
    }
    if (a === "close") {
      this._sheet = null;
      this._freeze = false;
      return this._kick(true);
    }
    this._fmenu = false;
    if (a === "floor") return this._go({ page: this._land() ? "rooms" : "home", floor: v, room: null });
    if (a === "room") {
      const [f, r] = v.split("|");
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "room", floor: f, room: r });
    }
    // #89: Home = the whole home: portrait shows the main floor's Home page, landscape the 3D home.
    if (a === "gohome") {
      this._sheet = null;
      this._freeze = false;
      return this._go({ page: "house", room: null, floor: this._mainFloor(this._m) });
    }
    if (a === "ovs") {
      this._sheet = { step: "ov", ov: v };
      return this._kick(true);
    }
    if (a === "issues") {
      this._sheet = { step: "issues" };
      return this._kick(true);
    }
    if (a === "grid") {
      const g = lsGet("dfm_grid") || {};
      g[v] = !g[v];
      lsSet("dfm_grid", g);
      return this._kick(true);
    }
    if (a === "scene") return this._scene(v);
    if (a === "oact") {
      const x = ((this._base || {}).overlay_actions || [])[Number(v)];
      const h = this._helper(this._m.floors.find((q) => q.id === s.floor) || this._m.floors[0]);
      const ent = x && h ? h._ovActEnt(x) : null;
      if (x && x.tap_action && h) h._barRun.call(Object.assign(Object.create(h), { dispatchEvent: (ev) => this.dispatchEvent(ev) }), x.tap_action, ent);
      else if (ent) this._more(ent);
      return;
    }
    if (a === "rmaster") {
      const ents = v.split(",");
      const on = t.dataset.on === "1";
      this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: ents });
      return;
    }
    if (a === "lov") {
      this._lov = v;
      for (const el of (this._plans || new Map()).values()) if (el.isConnected && (el._dfmMode === "land" || el._dfmMode === "landroom") && el.dfSetOverlay) el.dfSetOverlay(v);
      return this._kick(true);
    }
    if (a === "fmenu") {
      this._fmenu = !this._fmenu;
      return this._kick(true);
    }
    if (a === "step") return this._step(Number(v), t.dataset.z);
    if (a === "fstep") return this._step(Number(v), "floor");
    if (a === "more") return this._more(v);
    if (a === "tog") {
      e.stopPropagation();
      const st = this._hass.states[v];
      if (!st) return;
      const d = domainOf(v);
      const svc = d === "cover" ? "toggle" : d === "media_player" ? (st.state === "off" ? "turn_on" : "turn_off") : "toggle";
      this._hass.callService(d, svc, { entity_id: v });
      t.classList.toggle("on");
      this._flash(v);
      return;
    }
    if (a === "gfold") {
      const gf = lsGet("dfm_gfold") || {};
      gf[v] = !gf[v];
      lsSet("dfm_gfold", gf);
      return this._kick(true);
    }
    if (a === "fold") {
      lsSet("dfm_fold", !lsGet("dfm_fold"));
      return this._kick(true);
    }
    if (a === "search") return;
  },

  /** #49: the main card's light scenes (All on / All off for the lights shown here). */
  _scene(id) {
    const ents = this._members("lights", this._m.items).map((x) => x.lead).filter((e) => e && TOGGLE_DOMAINS.has(domainOf(e)) && domainOf(e) !== "cover");
    if (id === "all_off") return ents.length && this._hass.callService("homeassistant", "turn_off", { entity_id: ents });
    if (id === "all_on") return ents.length && this._hass.callService("homeassistant", "turn_on", { entity_id: ents });
    const h = this._helper(this._m.floors[0]);
    if (h) DeviceFloorplanCard.prototype._runScene.call(h, id);
  },

  /** #41: a quick action shows on the plan above: the device's marker lights up for a few seconds. */
  _flash(eid) {
    const x = (this._m.items || []).find((i) => i.lead === eid || i.ents.includes(eid));
    if (!x) return;
    setTimeout(() => {
      const el = [...(this._plans || new Map()).values()].find((p) => p.isConnected && p._dfmFloor === x.floor);
      if (!el || !el._specs || !el._highlight) return;
      const sp = [...el._specs.values()].find((q) => q.item && q.item.id === x.item.id);
      if (sp) el._highlight(sp.key);
    }, 700);
  },

  _input(e) {
    const t = e.target;
    if (t.dataset.a === "q") {
      this._q = t.value;
      clearTimeout(this._qT);
      this._qT = setTimeout(() => {
        this._render();
        const q = this.shadowRoot.querySelector("[data-a=q]");
        if (q) {
          q.focus();
          q.setSelectionRange(q.value.length, q.value.length);
        }
      }, 250);
    }
    if (t.dataset.a === "bri") this._busy = true; // no redraws while the slider moves
  },

  _change(e) {
    const t = e.target;
    if (t.dataset.a === "bri") {
      this._busy = false;
      // Saved once, when the finger lets go (never per step).
      this._hass.callService("light", "turn_on", { entity_id: t.dataset.v, brightness_pct: Number(t.value) });
    }
  },
});
