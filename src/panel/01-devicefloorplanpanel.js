class DeviceFloorplanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.plans = [];
    this.devices = [];
    this.byId = new Map();
    this.areas = [];
    this.areaById = new Map();
    this.floors = [];
    this.skipped = new Set();
    this.seen = new Set();
    this.mainEntity = {};
    this.deviceOpts = {};
    this.partOf = {};
    this.setupDone = true;
    this.work = null;
    this._undo = [];
    this._redo = [];
    this._seenQueue = new Set();
    this.s = {
      planId: lsGet("plan", null),
      tool: "place",
      guide: lsGet("guide", true),
      more: lsGet("more", false),
      colorBy: lsGet("colorBy", "conn"),
      names: lsGet("names", "hover"),
      groupBy: lsGet("groupBy", "room"),
      allFloors: false,
      conn: [],
      type: [],
      status: [],
      q: "",
      pop: null,
      collapsed: {},
      sel: null,
      placing: null,
      placingRoom: null,
      queue: true,
      z: 1,
      tx: 0,
      ty: 0,
      fan: null,
      m1: null,
      m2: null,
      mh: null,
      ask: false,
      skipAuto: false,
      lenInput: "",
      flash: null,
      toast: null,
      dialog: null,
      save: "ok",
      loading: true,
      error: null,
      layersOpen: false,
      toolsOpen: lsGet("tools", true),
      placingBox: null,
      layers: lsGet("layers", { refs: true, rooms: true, devices: true }),
      refSel: null,
      refLen: "",
      menu: null,
      img: {},
    };
    this.mergedInto = {};
    this.templates = [];
    this._onKey = this._onKey.bind(this);
  }

  // ------------------------------------------------------------------ HA glue
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._watchConn(hass);
    if (first) {
      this._init();
    } else this._hydrateSoon();
  }
  get hass() {
    return this._hass;
  }
  set narrow(v) {
    this._narrow = v;
  }
  set panel(_p) {}
  set route(_r) {}

  connectedCallback() {
    window.addEventListener("keydown", this._onKey);
    // 0.12.6: the card's picture renderer, so the Editor previews pictures exactly as the card draws them.
    if (!window.__dfcPic) import(`${STATIC}/device-floorplan-card.js?v=${VERSION}`).then(() => this._render && this.work && this._render()).catch(() => {});
    if (this._vp && this._ro) this._ro.observe(this._vp.parentElement);
  }
  /** 0.11: when HA's connection comes back, a failed load reloads and a failed save is sent again.
   *  The listener is removed when the panel goes away. */
  _watchConn(hass) {
    const conn = hass && hass.connection;
    if (!conn || typeof conn.addEventListener !== "function" || this._conn === conn) return;
    this._unwatchConn();
    this._conn = conn;
    this._onReady = () => {
      if (this.s.error) return this._reload();
      if (this.s.save === "err") {
        this.s.save = "busy";
        this._flushSave();
      }
    };
    conn.addEventListener("ready", this._onReady);
  }

  _unwatchConn() {
    if (this._conn && this._onReady && typeof this._conn.removeEventListener === "function") this._conn.removeEventListener("ready", this._onReady);
    this._conn = null;
    this._onReady = null;
  }

  disconnectedCallback() {
    this._unwatchConn();
    window.removeEventListener("keydown", this._onKey);
    if (this._ro) this._ro.disconnect();
    this._flushSave();
  }

  _reload() {
    this.s.error = null;
    this.s.loading = true;
    this._render();
    this._init();
  }

  _ws(type, extra = {}) {
    return this._hass.callWS({ type: `${WS}/${type}`, ...extra });
  }

  async _init() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="app" id="app"></div>`;
    this._app = this.shadowRoot.getElementById("app");
    this._bindRoot();
    if (!customElements.get("ha-state-icon")) customElements.whenDefined("ha-state-icon").then(() => this._render());
    fetch(`${STATIC}/templates/templates.json?v=${VERSION}`)
      .then((r) => r.json())
      .then((j) => {
        this.templates = j.templates || [];
        this._render();
      })
      .catch(() => {});
    try {
      await this._load();
      const params = new URLSearchParams(window.location.search);
      if (params.get("new")) this.s.status = ["new"];
    } catch (err) {
      this.s.error = errText(err);
    }
    this.s.loading = false;
    this._render();
    let seen = false;
    try {
      seen = window.localStorage.getItem("device_floorplan_intro_seen_v1") === "1";
    } catch (_e) {
      seen = false;
    }
    if (!seen && !this.s.error) this._showIntro();
  }

  /** The welcome dialog (first visit, or "⋮ → Show intro"). */
  async _showIntro() {
    try {
      await import(`${STATIC}/intro/device-floorplan-intro.js?v=${VERSION}`);
    } catch (_e) {
      return;
    }
    let el = this.shadowRoot.querySelector("device-floorplan-intro");
    if (el) el.remove();
    el = document.createElement("device-floorplan-intro");
    el.setAttribute("image-base", `${STATIC}/intro/`);
    el.setAttribute("guide-url", `${STATIC}/guide/sketch.html`);
    el.addEventListener("intro-action", (e) => {
      el.remove();
      const action = e.detail && e.detail.action;
      if (action === "later") return;
      // "Try a sample plan" shows the samples first; nothing is chosen for the user.
      this.s.form = { fromIntro: true, samplesFirst: action === "sample" };
      if (this.plans.length) this.s.dialog = { type: "create" };
      this._render();
    });
    this.shadowRoot.appendChild(el);
  }

  async _load() {
    const [st, dv] = await Promise.all([this._ws("state"), this._ws("devices")]);
    this._applyState(st);
    this._applyDevices(dv);
    if (!this.plans.find((p) => p.id === this.s.planId)) this.s.planId = this.plans[0] ? this.plans[0].id : null;
    this._openPlan(this.s.planId, true);
  }

  _applyState(st) {
    this.plans = st.plans.slice().sort((a, b) => this._planOrder(a) - this._planOrder(b));
    this.skipped = new Set(st.skipped);
    this.seen = new Set(st.seen);
    this.mainEntity = st.main_entity || {};
    this.deviceOpts = st.device_opts || {};
    this.setupDone = !!st.setup_done;
    this.aiShare = !!st.ai_share; // 0.13.9.5
  }

  _planOrder(p) {
    // 0.11: like a building, the highest floor first; views after all floors.
    if (p.kind === "floor") return -(p.level ?? 0) * 10;
    return 100000 + (p.sort || 0);
  }

  _applyDevices(dv) {
    this.areas = dv.areas;
    this.areaById = new Map(this.areas.map((a) => [a.area_id, a]));
    // Entities without a device (helpers, YAML templates): listed only when placed or
    // found by the search; placed on their own as "entity:<entity_id>".
    const loose = (dv.loose || []).map((e) => {
      const area = e.area_id ? this.areaById.get(e.area_id) : null;
      return {
        id: `entity:${e.entity_id}`,
        entity_id: e.entity_id,
        loose: true,
        name: e.name,
        manufacturer: null,
        model: null,
        area_id: e.area_id,
        area_name: area ? area.name : null,
        floor_id: area ? area.floor_id : null,
        integration: null,
        platform: e.platform,
        conns: [],
        virtual: false,
        group: e.group || "helpers",
        category: e.category || e.group || "helpers",
        physical: !!e.physical,
        main_entity: e.entity_id,
        entities: [],
        merged: [],
        parts: [],
        search: `${e.entity_id} ${e.name}`.toLowerCase(),
      };
    });
    this.devices = dv.devices.concat(loose);
    this.byId = new Map(this.devices.map((d) => [d.id, d]));
    this.floors = (dv.floors || []).slice().sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    this.mergedInto = dv.merged_into || {};
    this.partOf = dv.part_of || {};
  }

  _plan() {
    return this.plans.find((p) => p.id === this.s.planId) || null;
  }

  _openPlan(planId, initial = false) {
    if (!initial) this._flushSave();
    this.s.planId = planId;
    lsSet("plan", planId);
    const plan = this._plan();
    this.work = plan ? { positions: clone(plan.positions) || {}, anchors: clone(plan.anchors) || {}, refs: clone(plan.refs) || [], hidden_rooms: clone(plan.hidden_rooms) || [], bonds: clone(plan.bonds) || {}, bond_meta: clone(plan.bond_meta) || {}, phantoms: clone(plan.phantoms) || {}, shapes: clone(plan.shapes) || {} } : null;
    this._undo = [];
    this._redo = [];
    Object.assign(this.s, { sel: null, memberView: null, stack: null, itip: null, placing: null, placingRoom: null, fan: null, m1: null, m2: null, mh: null, ask: false, z: 1, g: 1, tx: 0, ty: 0, refSel: null, menu: null, layersOpen: false, imgFailed: null });
    if (!this.s.dialog) this.s.form = null;
    if (plan) {
      let dirty = false;
      // 0.3 kept "rooms not on this plan" in the browser: move them to HA once.
      const legacy = lsGet(`ignored_${plan.id}`, null);
      if (legacy && legacy.length && !this.work.hidden_rooms.length) {
        this.work.hidden_rooms = legacy.slice();
        dirty = true;
      }
      if (legacy) lsSet(`ignored_${plan.id}`, null);
      // Positions of devices that are now merged into a parent (or are parts of it) move to the parent.
      for (const [child, parent] of Object.entries({ ...(this.mergedInto || {}), ...(this.partOf || {}) })) {
        if (this.work.positions[child]) {
          if (!this.work.positions[parent]) this.work.positions[parent] = this.work.positions[child];
          delete this.work.positions[child];
          dirty = true;
        }
      }
      if (dirty) setTimeout(() => this._scheduleSave(), 0);
      this._signImage(plan);
    }
    if (plan) this.s.tool = this._firstOpenStep();
  }

  // ------------------------------------------------------------ derived data
  _imageType() {
    const p = this._plan();
    return p ? p.image_type : "top";
  }

  _scopeFloor() {
    const p = this._plan();
    if (!p || p.kind !== "floor" || !p.floor_id || this.s.allFloors) return null;
    return p.floor_id;
  }

  _inScope(d) {
    const f = this._scopeFloor();
    if (!f) return true;
    return !d.area_id || !d.floor_id || d.floor_id === f;
  }

  _otherFloorPlan(d) {
    const p = this._plan();
    if (!p || p.kind !== "floor") return null;
    return this.plans.find((o) => o.id !== p.id && o.kind === "floor" && o.positions && o.positions[d.id]) || null;
  }

  _status(d) {
    if (this.skipped.has(d.id)) return "skipped";
    const pos = this.work && this.work.positions[d.id];
    if (pos) return pos.approx ? "approx" : "placed";
    if (this._otherFloorPlan(d)) return "elsewhere";
    if (this._inHiddenRoom(d)) return "hiddenroom";
    return "unplaced";
  }

  _isNew(d) {
    return this.setupDone && !d.loose && !this.seen.has(d.id) && !d.virtual;
  }

  /** Entities without a device only show up when placed on this plan or found by the search. */
  _listable(d) {
    if (d.split) return false;
    if (!d.loose || d.physical) return true;
    return !!(this.work && this.work.positions[d.id]) || !!this.s.q.trim();
  }

  /** Devices that count (steps, rooms, guide): real devices, plus entities placed here. */
  _counted(d) {
    if (d.split) return false;
    return !d.loose || d.physical || !!(this.work && this.work.positions[d.id]);
  }

  _hay(d) {
    return `${d.name} ${d.area_name || ""} ${d.model || ""} ${d.manufacturer || ""} ${d.integration || ""} ${d.search || ""}`.toLowerCase();
  }

  /** The entity a search matched, when it wasn't the device itself (shown under the name). */
  _matchedEntity(d) {
    const q = this.s.q.trim().toLowerCase();
    if (!q || d.loose) return null;
    const own = `${d.name} ${d.area_name || ""} ${d.model || ""} ${d.manufacturer || ""} ${d.integration || ""}`.toLowerCase();
    if (own.includes(q)) return null;
    const e = (d.entities || []).find((x) => `${x.entity_id} ${x.name}`.toLowerCase().includes(q));
    if (e) return e.name || e.entity_id;
    const word = (d.search || "").split(" ").find((w) => w.includes(q));
    return word || null;
  }

  _roomsForPlan(withEmpty = false) {
    const f = this._scopeFloor();
    const counts = {};
    for (const d of this.devices) {
      if ((d.loose && !d.physical) || !d.area_id || this.skipped.has(d.id) || !this._inScope(d)) continue;
      counts[d.area_id] = (counts[d.area_id] || 0) + 1;
    }
    return this.areas
      // 0.12.1: a room placed on this plan is always listed (also when HA puts it on another floor), so it can be
      // changed or removed; it is marked with its own floor.
      .filter((a) => this._placedHere(a.area_id) || ((withEmpty || counts[a.area_id]) && (!f || a.floor_id === f || !a.floor_id)))
      .map((a) => {
        const mate = this._levelMates(this._plan()).find((p) => (p.anchors || {})[a.area_id] || (p.shapes || {})[a.area_id]);
        const away = f && a.floor_id && a.floor_id !== f ? (this.floors.find((x) => x.floor_id === a.floor_id) || {}).name || "another floor" : null;
        return { ...a, count: counts[a.area_id] || 0, pos: this.work ? this.work.anchors[a.area_id] : null, ignored: this._ignoredRooms().includes(a.area_id), mate: mate ? mate.name : null, away };
      });
  }

  _placedHere(aid) {
    return !!(this.work && ((this.work.anchors || {})[aid] || (this.work.shapes || {})[aid]));
  }

  _ignoredRooms() {
    return (this.work && this.work.hidden_rooms) || [];
  }

  /** Unplaced device whose room is marked "not on this plan". */
  _inHiddenRoom(d) {
    return !!(d.area_id && this.work && this.work.hidden_rooms.includes(d.area_id) && !this.work.positions[d.id]);
  }

  /** Resolve the plan image to a signed URL (images need a login). */
  _signImage(plan) {
    if (!plan || !this._hass) return;
    for (const key of ["image_url", "image_fallback_url"]) {
      const url = plan[key];
      if (!url || this.s.img[url]) continue;
      signUrl(this._hass, url)
        .then((signed) => {
          this.s.img[url] = signed;
          this._render();
        })
        .catch(() => {
          this.s.img[url] = url;
          this._render();
        });
    }
  }

  _imgSrc(plan) {
    if (!plan || !plan.image_url) return null;
    if (this.s.imgFailed === plan.image_url && plan.image_fallback_url) return this.s.img[plan.image_fallback_url] || null;
    return this.s.img[plan.image_url] || null;
  }

  _scale() {
    const p = this._plan();
    if (!p || !p.width || !p.height || !this.work) return { x: null, y: null, refs: [] };
    const per = {};
    for (const r of this.work.refs) {
      const px = Math.hypot(((r.bx - r.ax) * p.width) / 100, ((r.by - r.ay) * p.height) / 100);
      if (px > 0) per[r.dir] = r.length / px;
    }
    const one = per.h || per.v || null;
    return { x: per.h || one, y: per.v || one, h: per.h, v: per.v, refs: this.work.refs };
  }

  _distM(a, b) {
    const p = this._plan();
    const sc = this._scale();
    if (!sc.x || !p) return null;
    return Math.hypot((((b.x - a.x) * p.width) / 100) * sc.x, (((b.y - a.y) * p.height) / 100) * sc.y);
  }

  _matches(d, st) {
    const s = this.s;
    // Searching finds everything: filters, skipped, hidden rooms and other floors are ignored.
    if (s.q.trim()) return this._hay(d).includes(s.q.trim().toLowerCase());
    if (!this._listable(d)) return false;
    if (!this._inScope(d)) return false;
    if (s.conn.length && !d.conns.some((c) => s.conn.includes(c))) return false;
    if (s.type.length && !s.type.some((t) => this._inType(d, t))) return false;
    if (st === "hiddenroom" && !s.withHidden) return false;
    // 0.12.1: phones / watches feed a person (inputs, not markers): not offered for placing; one already placed stays.
    if (d.integration === "mobile_app" && !(d.category && (this.deviceOpts[d.id] || {}).category) && (st === "unplaced" || st === "new")) return false;
    if (s.status.length && !s.withHidden) {
      const ok = s.status.some((x) => (x === "new" ? this._isNew(d) && st !== "skipped" : x === st));
      if (!ok) return false;
    } else if (st === "skipped") return false;
    return true;
  }

  _markerMatch(d, st) {
    const s = this.s;
    // Just placed: never faded until filters or search change (#42).
    if (this._fresh && this._fresh.has(d.id)) return true;
    // While searching the plan follows the list: filters are ignored (#42).
    if (s.q.trim()) return this._hay(d).includes(s.q.trim().toLowerCase());
    if (s.conn.length && !d.conns.some((c) => s.conn.includes(c))) return false;
    if (s.type.length && !s.type.some((t) => this._inType(d, t))) return false;
    const onPlan = s.status.filter((x) => x === "approx" || x === "placed");
    if (onPlan.length && !onPlan.includes(st)) return false;
    return true;
  }

  _filtering() {
    const s = this.s;
    return !!(s.conn.length || s.type.length || s.status.length || s.q);
  }

  // ------------------------------------------------------------ undo + save
  _snap() {
    return { positions: clone(this.work.positions), anchors: clone(this.work.anchors), refs: clone(this.work.refs), hidden_rooms: clone(this.work.hidden_rooms), bonds: clone(this.work.bonds || {}), bond_meta: clone(this.work.bond_meta || {}), phantoms: clone(this.work.phantoms || {}), shapes: clone(this.work.shapes || {}), skipped: [...this.skipped] };
  }

  _pushUndo(snap) {
    this._undo.push(snap || this._snap());
    if (this._undo.length > 50) this._undo.shift();
    this._redo = [];
  }

  _restore(snap) {
    const before = new Set(this.skipped);
    this.work.positions = snap.positions;
    this.work.anchors = snap.anchors;
    this.work.refs = snap.refs;
    this.work.hidden_rooms = snap.hidden_rooms || [];
    this.work.bonds = snap.bonds || {};
    this.work.bond_meta = snap.bond_meta || {};
    this.work.phantoms = snap.phantoms || {};
    this.work.shapes = snap.shapes || {};
    const after = new Set(snap.skipped);
    const nowSkipped = [...after].filter((x) => !before.has(x));
    const nowUnskipped = [...before].filter((x) => !after.has(x));
    this.skipped = after;
    if (nowSkipped.length) this._ws("devices/skip", { device_ids: nowSkipped, skipped: true }).catch((e) => this._saveError(e));
    if (nowUnskipped.length) this._ws("devices/skip", { device_ids: nowUnskipped, skipped: false }).catch((e) => this._saveError(e));
    this._scheduleSave();
  }

  _undoAct() {
    if (!this._undo.length || !this.work) return;
    const snap = this._undo.pop();
    this._redo.push(this._snap());
    this._restore(snap);
    this.s.toast = null;
    this._render();
  }

  _redoAct() {
    if (!this._redo.length || !this.work) return;
    const snap = this._redo.pop();
    this._undo.push(this._snap());
    this._restore(snap);
    this._render();
  }

  _change(fn, snap) {
    if (!this.work) return;
    this._pushUndo(snap);
    fn();
    this._scheduleSave();
    this._render();
  }

  _scheduleSave() {
    this.s.save = "busy";
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this._flushSave(), 600);
    this._renderSave();
  }

  async _flushSave() {
    clearTimeout(this._saveT);
    this._saveT = null;
    const plan = this._plan();
    if (!plan || !this.work || this.s.save !== "busy") return;
    // Bonds only keep members that are still on the plan.
    const bonds = {};
    for (const [k, v] of Object.entries(this.work.bonds || {})) {
      const m = v.filter((id) => this.work.positions[id]);
      if (m.length >= 2) bonds[k] = m;
    }
    this.work.bonds = bonds;
    const bondMeta = {};
    for (const [k, v] of Object.entries(this.work.bond_meta || {})) if (bonds[k]) bondMeta[k] = v;
    this.work.bond_meta = bondMeta;
    // Phantom members must be on the plan; empty phantoms are kept while you fill them.
    const phantoms = {};
    for (const [k, v] of Object.entries(this.work.phantoms || {})) phantoms[k] = { ...v, members: (v.members || []).filter((id) => this.work.positions[id]) };
    this.work.phantoms = phantoms;
    const body = { plan_id: plan.id, positions: this.work.positions, anchors: this.work.anchors, refs: this.work.refs, hidden_rooms: this.work.hidden_rooms, bonds, bond_meta: bondMeta, phantoms, shapes: this.work.shapes || {} };
    try {
      const res = await this._ws("plan/update", body);
      Object.assign(plan, { positions: res.positions, anchors: res.anchors, refs: res.refs, hidden_rooms: res.hidden_rooms, bonds: res.bonds || {}, bond_meta: res.bond_meta || {}, phantoms: res.phantoms || {}, shapes: res.shapes || {}, frame_eff: res.frame_eff || {} });
      if (this._saveT === null && this.s.save === "busy") this.s.save = "ok";
    } catch (err) {
      this._saveError(err);
    }
    this._renderSave();
  }

  _saveError(err) {
    this.s.save = "err";
    this.s.saveErr = errText(err);
    this._renderSave();
  }

  _markSeen(ids) {
    for (const id of ids) if (!this.seen.has(id)) this._seenQueue.add(id);
    if (!this._seenQueue.size) return;
    clearTimeout(this._seenT);
    this._seenT = setTimeout(() => {
      const list = [...this._seenQueue];
      this._seenQueue.clear();
      list.forEach((id) => this.seen.add(id));
      this._ws("devices/seen", { device_ids: list }).catch(() => {});
    }, 800);
  }

  async _setSkipped(ids, skipped) {
    ids.forEach((id) => (skipped ? this.skipped.add(id) : this.skipped.delete(id)));
    this._markSeen(ids);
    try {
      await this._ws("devices/skip", { device_ids: ids, skipped });
    } catch (err) {
      this._saveError(err);
    }
  }

  _toast(text, withUndo = true) {
    this.s.toast = { text, undo: withUndo };
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      this.s.toast = null;
      this._renderToast();
    }, 9000);
    this._renderToast();
  }

  // ------------------------------------------------------------------ steps
  _stepsDone() {
    const plan = this._plan();
    if (!plan || !this.work) return [false, false, false];
    const angled = plan.image_type === "angled";
    const done1 = angled || this.work.refs.length > 0 || lsGet(`skip1_${plan.id}`, false);
    const rooms = this._roomsForPlan();
    const done2 = rooms.length > 0 && rooms.every((r) => r.pos || r.ignored);
    let left = 0;
    let inScope = 0;
    for (const d of this.devices) {
      if (!this._inScope(d) || !this._counted(d)) continue;
      const st = this._status(d);
      if (st !== "skipped" && st !== "hiddenroom") inScope++;
      if (st === "unplaced" || st === "approx") left++;
    }
    return [done1, done2, inScope > 0 && left === 0];
  }

  _firstOpenStep() {
    const plan = this._plan();
    if (!plan) return "place";
    const [d1, d2] = this._stepsDone();
    if (!d1) return "measure";
    if (!d2) return "rooms";
    return "place";
  }

  /** 0.8.2: what gluing would do now (overlaps to glue, overlaps too big); cached per shapes object. */
  _glueState() {
    const sh = (this.work && this.work.shapes) || {};
    const key = JSON.stringify(sh);
    if (!this._glueC || this._glueC.key !== key) this._glueC = { key, res: glueShapes(sh, this._ratio()) };
    return this._glueC.res;
  }

  /** Step 3 waits until overlapping Room shapes are glued (2+ shapes). */
  _gluePending() {
    return !!(this.work && this._glueState().moved);
  }

  _areaName(id) {
    return (this.areaById.get(id) || {}).name || id;
  }

  _setTool(tool) {
    if (tool === "measure" && this._imageType() === "angled") return;
    if (tool === "place" && this._gluePending()) {
      this._toast("Glue the Rooms first (step 2)", false);
      return;
    }
    Object.assign(this.s, { tool, m1: null, m2: null, mh: null, ask: false, placing: null, placingRoom: null, pop: null, refSel: null, fan: null, z: 1, g: 1, tx: 0, ty: 0 });
    this._render();
  }
}
