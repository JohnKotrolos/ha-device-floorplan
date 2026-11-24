Object.assign(DeviceFloorplanPanel.prototype, {

  /** "synology_dsm" → "Synology DSM" (HA's own title when it is loaded). */
  _intName(domain) {
    const t = this._hass && this._hass.localize ? this._hass.localize(`component.${domain}.title`) : "";
    if (t) return t;
    return String(domain).split("_").map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
  },

  // ---------------------------------------------------------------- bonds (#40)
  /** [bondId, members] of a device, or null. */
  _bondOf(id) {
    for (const [k, v] of Object.entries((this.work && this.work.bonds) || {})) if (v.includes(id)) return [k, v];
    return null;
  },

  /** The member that carries the bond's marker (first one on the plan). */
  /** 0.12.6: a bond set to "One light per lamp" (else one light for the whole bond). */
  _lampMode(id) {
    const b = this._bondOf(id);
    return !!b && this._bondMeta(b[0]).lights === "lamp";
  },

  /** 0.12.6: whose light shape is edited: the lamp picked in the bond panel (per lamp), else the bond's leader. */
  _lightLead(id) {
    const b = this._bondOf(id);
    if (!b || !this._lampMode(id)) return this._bondLeader(id);
    const ok = (m) => m && b[1].includes(m) && this.work.positions[m];
    return ok(this.s.lampOf) ? this.s.lampOf : b[1].find((m) => this.work.positions[m]) || id;
  },

  _bondLeader(id) {
    const b = this._bondOf(id);
    if (!b) return id;
    return b[1].find((m) => this.work.positions[m]) || id;
  },

  /** Lights with lights, switches with switches, covers with covers. */
  _bondKind(d) {
    if (!d) return null;
    const ent = this.mainEntity[d.id] || d.main_entity;
    const dom = ent ? ent.split(".")[0] : null;
    return ["light", "switch", "cover"].includes(dom) ? dom : null;
  },

  _canBond(a, b) {
    if (!a || !b || a === b) return false;
    if (!this.byId.get(a) || !this.byId.get(b)) return false;
    return !(this._bondOf(a) && this._bondOf(a) === this._bondOf(b));
  },

  /** Put `id` into the bond of `target` (creating it) at the target's spot. */
  _bond(id, target) {
    const bonds = this.work.bonds || (this.work.bonds = {});
    const old = this._bondOf(id);
    if (old) {
      bonds[old[0]] = old[1].filter((m) => m !== id);
      if (bonds[old[0]].length < 2) delete bonds[old[0]];
    }
    const tb = this._bondOf(target);
    if (tb) bonds[tb[0]].push(id);
    else bonds[`b${Date.now().toString(36)}`] = [target, id];
    const tp = this.work.positions[target];
    this._moveTo(id, tp.x, tp.y, !!tp.approx);
  },

  _unbond(id) {
    const b = this._bondOf(id);
    if (!b) return;
    const bonds = this.work.bonds;
    bonds[b[0]] = b[1].filter((m) => m !== id);
    if (bonds[b[0]].length < 2) {
      delete bonds[b[0]];
      if (this.work.bond_meta) delete this.work.bond_meta[b[0]];
    }
  },

  /** All members follow the leader's position. */
  _syncBond(id) {
    const b = this._bondOf(id);
    if (!b) return;
    const p = this.work.positions[id];
    for (const m of b[1]) {
      const q = this.work.positions[m];
      if (m === id || !q) continue;
      q.x = p.x;
      q.y = p.y;
      if (p.approx) q.approx = true;
      else delete q.approx;
    }
  },

  _focusPoint() {
    const s = this.s;
    if (s.tool === "measure" && s.m1) return s.m2 ? { x: (s.m1.x + s.m2.x) / 2, y: (s.m1.y + s.m2.y) / 2 } : s.m1;
    const pos = s.sel && this.work && this.work.positions[s.sel];
    return pos ? { x: pos.x, y: pos.y } : null;
  },

  async _reloadDevices() {
    try {
      const [st, dv] = await Promise.all([this._ws("state"), this._ws("devices")]);
      this._applyState(st);
      this._applyDevices(dv);
      const plan = this._plan();
      if (plan && this.work) {
        // Keep unsaved work; only move positions of new parts to their parent.
        for (const [child, parent] of Object.entries(this.partOf)) {
          if (this.work.positions[child]) {
            if (!this.work.positions[parent]) this.work.positions[parent] = this.work.positions[child];
            delete this.work.positions[child];
            this._scheduleSave();
          }
        }
      }
    } catch (err) {
      this._saveError(err);
    }
    this._render();
  },

  _closeDialog() {
    this.s.dialog = null;
    this.s.form = null;
    this._render();
  },

  _pickDevice(id) {
    const s = this.s;
    const d = this.byId.get(id);
    if (!d) return;
    const st = this._status(d);
    s.placingRoom = null;
    s.placingBox = null;
    if (st === "unplaced" || st === "hiddenroom") {
      // Picking a device to place doesn't open its details (they'd take the list's space);
      // picking it again while placing opens them.
      if (s.placing === id) {
        s.sel = id;
      } else {
        s.placing = id;
        s.sel = null;
      }
    } else {
      s.sel = id;
      s.placing = null;
      if (st === "placed" || st === "approx") this._flash(id);
    }
    this._render();
  },

  _flash(id) {
    this.s.flash = id;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => {
      this.s.flash = null;
      const el = this.shadowRoot.querySelector(`[data-mk="${CSS.escape(id)}"]`);
      if (el) el.classList.remove("flash");
    }, 4800);
  },

  _locate(id) {
    const pos = this.work.positions[id];
    if (!pos) return;
    const nz = Math.max(this.s.z, 2.5);
    const lim = (v) => clamp(v, 100 * (1 - nz), 0);
    Object.assign(this.s, { sel: id, z: nz, tx: lim(50 - pos.x * nz), ty: lim(50 - pos.y * nz), fan: null });
    this._flash(id);
    this._render();
  },

  _moreInfo(id) {
    const d = this.byId.get(id);
    const ent = d && (this.mainEntity[id] || d.main_entity);
    if (!ent) return this._navigate(`/config/devices/device/${id}`);
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: ent }, bubbles: true, composed: true }));
  },

  _navigate(path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  },

  _zOrder(id, front) {
    const zs = Object.values(this.work.positions).map((p) => p.z || 0);
    this._change(() => {
      this.work.positions[id].z = front ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
    });
  },

  /** Move a spot, keeping what it is (split spot of a device, acts as, light shape, air flow, layer). */
  _moveTo(id, x, y, approx = false) {
    const old = this.work.positions[id] || {};
    const keep = {};
    for (const k of ["of", "as", "light", "air", "z", "label"]) if (old[k] != null) keep[k] = old[k];
    this.work.positions[id] = { ...keep, x, y, ...(approx ? { approx: true } : {}) };
  },

  _placeAt(id, p, approx = false) {
    const d = this.byId.get(id);
    if (!approx) (this._fresh || (this._fresh = new Set())).add(id);
    this._moveTo(id, Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, approx);
    if (d) this._markSeen([id]);
  },

  _nextUnplaced(afterId) {
    const order = this._shownOrder || [];
    const idx = order.indexOf(afterId);
    const rest = order.slice(idx + 1).concat(order.slice(0, Math.max(0, idx)));
    return rest.find((id) => id !== afterId && this.byId.get(id) && this._status(this.byId.get(id)) === "unplaced") || null;
  },

  _spotNear(anchor, n) {
    // Concentric rings around the room pin: 6 spots in ring 1, 12 in ring 2…
    const plan = this._plan();
    const vpW = this._vpW || 900;
    const ratio = plan.width && plan.height ? plan.width / plan.height : 1.6;
    const step = (36 / vpW) * 100;
    let ring = 1;
    let idx = n - 1;
    while (idx >= ring * 6) {
      idx -= ring * 6;
      ring++;
    }
    const a = (idx / (ring * 6)) * 2 * Math.PI + (ring % 2 ? 0 : Math.PI / (ring * 6));
    return { x: clamp(anchor.x + Math.cos(a) * step * ring, 1, 99), y: clamp(anchor.y + Math.sin(a) * step * ring * ratio, 1, 99) };
  },

  /** What Auto-place would place now: unplaced devices shown in the list whose room has a pin. */
  _autoTargets() {
    if (!this.work) return [];
    return this.devices.filter((d) => this._inScope(d) && (!d.loose || d.physical) && this._status(d) === "unplaced" && this._matches(d, "unplaced") && d.area_id && this.work.anchors[d.area_id]);
  },

  _autoPlace() {
    const targets = this._autoTargets();
    if (!targets.length) return;
    this._change(() => {
      const counts = {};
      for (const [id] of Object.entries(this.work.positions)) {
        const d = this.byId.get(id);
        if (d && d.area_id) counts[d.area_id] = (counts[d.area_id] || 0) + 1;
      }
      for (const d of targets) {
        counts[d.area_id] = (counts[d.area_id] || 0) + 1;
        this._placeAt(d.id, this._spotNear(this.work.anchors[d.area_id], counts[d.area_id]), true);
      }
    });
    this._toast(`${targets.length} devices placed near their rooms (approximate).`);
  },

  async _skipShown() {
    const all = this.devices.filter((d) => this._inScope(d));
    const ids = all.filter((d) => (!d.loose || d.physical) && this._status(d) === "unplaced" && this._matches(d, "unplaced")).map((d) => d.id);
    if (!ids.length) return;
    this._pushUndo();
    await this._setSkipped(ids, true);
    this.s.sel = null;
    this._render();
    this._toast(`${ids.length} devices skipped. Devices already on the plan were kept.`);
  },

  async _unskip(id) {
    const d = this.byId.get(id);
    this._pushUndo();
    await this._setSkipped([id], false);
    if (!this.work.positions[id]) {
      const anchor = d.area_id && this.work.anchors[d.area_id];
      const n = Object.keys(this.work.positions).filter((k) => (this.byId.get(k) || {}).area_id === d.area_id).length + 1;
      this._placeAt(id, anchor ? this._spotNear(anchor, n) : { x: 50, y: 50 }, true);
      this._scheduleSave();
    }
    this.s.status = this.s.status.filter((x) => x !== "skipped");
    this.s.sel = id;
    this._flash(id);
    this._render();
  },

  async _moveHere(id) {
    const other = this._otherFloorPlan(this.byId.get(id));
    if (other) {
      const positions = { ...other.positions };
      delete positions[id];
      try {
        const res = await this._ws("plan/update", { plan_id: other.id, positions });
        other.positions = res.positions;
      } catch (err) {
        return this._saveError(err);
      }
    }
    this.s.placing = id;
    this._render();
  },

  _applyScale() {
    const s = this.s;
    const L = parseFloat(String(s.lenInput).replace(",", "."));
    if (!(L > 0) || !s.m1 || !s.m2) return;
    const dir = this._dirOf(s.m1, s.m2);
    const replaced = this.work.refs.some((r) => r.dir === dir);
    this._change(() => {
      this.work.refs = this.work.refs.filter((r) => r.dir !== dir).concat([{ ax: s.m1.x, ay: s.m1.y, bx: s.m2.x, by: s.m2.y, length: L, dir }]);
    });
    Object.assign(s, { ask: false, skipAuto: false, m1: null, m2: null, mh: null, lenInput: "", refSel: null });
    this._render();
    if (replaced) this._toast(`${dir === "h" ? "Horizontal" : "Vertical"} reference replaced`);
    // 0.8.2: a later floor just got its scale: offer to align it with the house floor (once per visit).
    const p = this._plan();
    const ref = this._laterFloor(p);
    if (p && ref && this._measuredPlan(ref) && !(p.align && "x" in p.align) && !(s.alignAsked || {})[p.id]) {
      s.alignAsked = { ...(s.alignAsked || {}), [p.id]: true };
      this._flushSave().then(() => {
        const d = this._alignDialog(p);
        if (d && !this.s.dialog) {
          this.s.dialog = d;
          this._signImage(this.plans.find((x) => x.id === d.ref));
          this._render();
        }
      });
    }
  },
});
