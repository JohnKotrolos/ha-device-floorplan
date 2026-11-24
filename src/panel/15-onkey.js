Object.assign(DeviceFloorplanPanel.prototype, {

  _onKey(e) {
    if (!this.isConnected || !this.work) return;
    const path = e.composedPath ? e.composedPath() : [];
    const t = path[0] || e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const s = this.s;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this._redoAct();
      else this._undoAct();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this._redoAct();
      return;
    }
    if (e.key === "Escape") {
      if (this._gesture && this._gesture.snap) {
        this._restore(this._gesture.snap);
        this._gesture = null;
      } else if (s.menu) s.menu = null;
      else if (s.layersOpen) s.layersOpen = false;
      else if (s.refSel !== null && s.refSel !== undefined) s.refSel = null;
      else if (s.dialog) s.dialog = null;
      else if (s.placing || s.placingRoom || s.placingBox) Object.assign(s, { placing: null, placingRoom: null, placingBox: null, hover: null });
      else if (s.tool === "measure" && s.m1) Object.assign(s, { m1: null, m2: null, mh: null, ask: false });
      else if (s.pop) s.pop = null;
      else if (s.fan) s.fan = null;
      else s.sel = null;
      this._render();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && s.tool === "measure" && s.refSel !== null && s.refSel !== undefined && this.work.refs[s.refSel]) {
      e.preventDefault();
      const r = this.work.refs[s.refSel];
      const i = s.refSel;
      this._change(() => this.work.refs.splice(i, 1));
      s.refSel = null;
      this._render();
      this._toast(`${r.dir === "h" ? "Horizontal" : "Vertical"} measurement deleted`);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && s.sel && this.work.positions[s.sel]) {
      e.preventDefault();
      const d = this.byId.get(s.sel);
      const sel = s.sel;
      this._change(() => {
        this._unbond(sel);
        delete this.work.positions[sel];
      });
      this._toast(`${d ? d.name : "Device"} removed from the plan`);
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && s.dialog && s.dialog.type === "align") {
      // 0.13.3: the dialog's promise "arrow keys move it a little": 0.2 % of the house (Shift: 1 %), finer when zoomed.
      e.preventDefault();
      const d = s.dialog;
      const step = (e.shiftKey ? 1 : 0.2) / ((d._vz && d._vz.z) || 1);
      d.x += arrows[e.key][0] * step;
      d.y += arrows[e.key][1] * step;
      const al = this.shadowRoot.querySelector("[data-alimg]");
      if (al) {
        al.style.left = `${((d.x - d.o.x1) / (d.o.x2 - d.o.x1)) * 100}%`;
        al.style.top = `${((d.y - d.o.y1) / (d.o.y2 - d.o.y1)) * 100}%`;
      }
      return;
    }
    // 0.7.5: nothing selected: the arrows move the plan (Shift = bigger steps); + / − zoom, 0 fits.
    if (!mod && !e.altKey && ["+", "=", "-", "_", "0"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "0") this._zoomTo(1);
      else this._zoomTo(this._zt() * (e.key === "-" || e.key === "_" ? 1 / 1.25 : 1.25));
      return;
    }
    if (arrows[e.key] && !(s.sel && this.work.positions[s.sel]) && s.z > 1) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const step = e.shiftKey ? 25 : 6;
      const lim = (v) => clamp(v, 100 * (1 - s.z), 0);
      s.tx = lim(s.tx - dx * step);
      s.ty = lim(s.ty - dy * step);
      this._layout();
      clearTimeout(this._zoomT);
      this._zoomT = setTimeout(() => this._render(), 160);
      return;
    }
    if (arrows[e.key] && s.sel && this.work.positions[s.sel]) {
      e.preventDefault();
      const step = (e.shiftKey ? 1 : 0.2) / s.z;
      const [dx, dy] = arrows[e.key];
      const pos = this.work.positions[s.sel];
      const now = Date.now();
      const snap = !this._nudgeT || now - this._nudgeT > 800 ? this._snap() : null;
      this._nudgeT = now;
      if (snap) this._pushUndo(snap);
      pos.x = clamp(pos.x + dx * step, 0, 100);
      pos.y = clamp(pos.y + dy * step, 0, 100);
      delete pos.approx;
      this._syncBond(s.sel);
      this._scheduleSave();
      this._renderOverlay();
    }
  },

  // ------------------------------------------------------------ plans CRUD
  async _saveForm(mode) {
    const root = this.shadowRoot;
    const f = this.s.form || (this.s.form = {});
    const name = root.getElementById("fname").value.trim();
    const where = root.getElementById("fwhere").value;
    const levelEl = root.getElementById("flevel");
    const img = f.img || (mode === "settings" ? this._plan().image_type : "top");
    const fail = (msg) => {
      f.err = msg;
      f.busy = false;
      this._render();
    };
    f.name = name;
    if (!name) return fail("Please give the plan a name.");
    const body = { name, image_type: img };
    const northEl = root.getElementById("fnorth");
    if (northEl && mode === "settings") body.north = northEl.value === "" ? null : Number(northEl.value);
    if (where === "view") Object.assign(body, { kind: "view", floor_id: null, level: null });
    else if (where === "level") {
      const lv = parseInt(levelEl ? levelEl.value : "0", 10);
      const clash = this.plans.find((p) => p.kind === "floor" && !p.floor_id && p.level === lv && (mode !== "settings" || p.id !== this.s.planId));
      if (clash) return fail(`“${clash.name}” already uses level ${lv}. Open it, or choose another level.`);
      Object.assign(body, { kind: "floor", floor_id: null, level: Number.isNaN(lv) ? 0 : lv });
    } else Object.assign(body, { kind: "floor", floor_id: where.slice(6), level: null });
    f.busy = true;
    f.err = null;
    this._render();
    try {
      let plan;
      if (mode === "settings") {
        await this._flushSave();
        const res = await this._ws("plan/update", { plan_id: this.s.planId, ...body });
        plan = this._plan();
        Object.assign(plan, res);
      } else {
        const res = await this._ws("plan/create", body);
        // A new plan may reuse the id of a deleted one: forget that plan's browser state.
        lsSet(`skip1_${res.id}`, null);
        this.plans.push(res);
        plan = res;
        this._openPlan(res.id);
      }
      if (f.image) await this._applyImage(plan, f.image);
      this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
      // 0.8.2: a new image: frame it right away (space around the plan, or trim its margin).
      // Later floors follow the house frame: no frame dialog (measure them, then align).
      this.s.dialog = f.image && !this._laterFloor(plan) ? this._frameDialog(plan) : null;
      if (f.image && this._laterFloor(plan)) this._toast(`This floor follows the house frame of ${this._laterFloor(plan).name}. Measure it to match the scale, then align it.`, false);
      this.s.form = null;
      if (mode !== "settings") this.s.tool = this._firstOpenStep();
      this._signImage(plan);
      this._render();
    } catch (err) {
      fail(errText(err));
    }
  },

  _formPickFile(file) {
    if (!file) return;
    const f = this.s.form || (this.s.form = {});
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      f.err = "Please use a PNG, JPG or WebP image.";
      return this._render();
    }
    if (file.size > 15 * 1024 * 1024) {
      f.err = "That image is larger than 15 MB.";
      return this._render();
    }
    f.err = null;
    f.image = { kind: "file", file, preview: URL.createObjectURL(file) };
    f.opaque = false;
    this._render();
    // 0.8.2: a solid background (all four corners opaque)? Then the tip under the image says so.
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(im, 0, 0);
        const W = c.width - 1;
        const H = c.height - 1;
        const opaque = [[0, 0], [W, 0], [0, H], [W, H]].every(([x, y]) => g.getImageData(x, y, 1, 1).data[3] > 250);
        if (opaque && this.s.form === f && f.image && f.image.file === file) {
          f.opaque = true;
          this._render();
        }
      } catch (_e) { /* */ }
    };
    im.src = f.image.preview;
  },

  /** Put the chosen image (upload, sample or HA file) on a plan. */
  async _applyImage(plan, image) {
    let res;
    if (image.kind === "file") res = await this._uploadFile(plan, image.file, true);
    else if (image.kind === "template") res = await this._ws("plan/image_template", { plan_id: plan.id, template_id: image.id });
    else {
      const size = await this._imageSize(image.url);
      res = await this._ws("plan/image_url", { plan_id: plan.id, url: image.url, width: size.w, height: size.h });
    }
    if (res) Object.assign(plan, res);
    this.s.imgFailed = null;
    this._signImage(plan);
    return plan;
  },

  async _applyCanvasImage() {
    const f = this.s.form;
    const plan = this._plan();
    if (!f || !f.image || !plan) return;
    f.busy = true;
    this._render();
    try {
      await this._applyImage(plan, f.image);
      this.s.form = null;
      this.s.tool = this._firstOpenStep();
    } catch (err) {
      f.busy = false;
      f.err = errText(err);
    }
    this._render();
  },

  async _renamePlan() {
    const p = this._plan();
    const name = ((this.s.dialog && this.s.dialog.name) ?? p.name).trim();
    if (!name) return;
    try {
      await this._flushSave();
      Object.assign(p, await this._ws("plan/update", { plan_id: p.id, name }));
      this.s.dialog = null;
      this._render();
    } catch (err) {
      const e = this.shadowRoot.getElementById("formerr");
      if (e) e.textContent = errText(err);
    }
  },

  async _movePlan(dir) {
    const views = this.plans.filter((p) => p.kind !== "floor");
    const p = this._plan();
    const i = views.indexOf(p);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= views.length) return;
    [views[i], views[j]] = [views[j], views[i]];
    await Promise.all(views.map((v, k) => (v.sort === k ? null : this._ws("plan/update", { plan_id: v.id, sort: k }).then((r) => Object.assign(v, r)))));
    views.forEach((v, k) => (v.sort = k));
    this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
    this._render();
  },

  async _deletePlan() {
    const id = this.s.planId;
    clearTimeout(this._saveT);
    this.s.save = "ok";
    await this._ws("plan/delete", { plan_id: id });
    this.plans = this.plans.filter((p) => p.id !== id);
    this.s.dialog = null;
    this._openPlan(this.plans[0] ? this.plans[0].id : null, true);
    this._render();
  },

  async _finishSetup() {
    const f = this.s.setup;
    const real = this.devices.filter((d) => !d.loose || d.physical);
    const skip = real.filter((d) => !this._setupKeep(d, f)).map((d) => d.id);
    const st = await this._ws("setup/complete", { skip_ids: skip, seen_ids: real.map((d) => d.id) });
    this._applyState(st);
    this.s.setup = null;
    this.s.form = null;
    if (this.plans.length) this._openPlan(this.s.planId && this.plans.find((p) => p.id === this.s.planId) ? this.s.planId : this.plans[0].id);
    this._render();
  },

  _imageSize(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => reject(new Error("Could not read that image"));
      im.src = src;
    });
  },

  /** 0.13.2 (#21): the floor's picture turned by quarter turns clockwise (q = 1 right, 3 left), as a file to upload. */
  async _turnedImage(plan, q) {
    const src = this._imgSrc(plan);
    if (!src) throw new Error("The picture isn't loaded yet");
    const im = await new Promise((resolve, reject) => {
      const x = new Image();
      x.onload = () => resolve(x);
      x.onerror = () => reject(new Error("Could not read the picture"));
      x.src = src;
    });
    const w = im.naturalWidth || plan.width;
    const h = im.naturalHeight || plan.height;
    const cv = document.createElement("canvas");
    cv.width = q % 2 ? h : w;
    cv.height = q % 2 ? w : h;
    const g = cv.getContext("2d");
    g.translate(cv.width / 2, cv.height / 2);
    g.rotate((q * Math.PI) / 2);
    g.drawImage(im, -w / 2, -h / 2, w, h);
    // Same kind of file where possible; a drawing (SVG) becomes a PNG.
    const type = /\.jpe?g(\?|$)/i.test(plan.image_url || "") ? "image/jpeg" : /\.webp(\?|$)/i.test(plan.image_url || "") ? "image/webp" : "image/png";
    const blob = await new Promise((resolve) => cv.toBlob(resolve, type, 0.95));
    if (!blob) throw new Error("Could not turn the picture");
    return new File([blob], `turned.${type.split("/")[1]}`, { type });
  },

  async _uploadFile(plan, file, quiet = false, turn = 0) {
    if (!file || !plan) return null;
    try {
      const url0 = URL.createObjectURL(file);
      const size = await this._imageSize(url0).finally(() => URL.revokeObjectURL(url0));
      this.s.save = "busy";
      this._renderSave();
      const url = `/api/${WS}/upload?plan_id=${encodeURIComponent(plan.id)}&width=${size.w}&height=${size.h}${turn ? `&turn=${turn}` : ""}`;
      const init = { method: "POST", body: file, headers: { "Content-Type": file.type } };
      const resp = this._hass.fetchWithAuth ? await this._hass.fetchWithAuth(url, init) : await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this._hass.auth.data.access_token}` } });
      if (!resp.ok) {
        let msg = `Upload failed (${resp.status})`;
        try {
          msg = (await resp.json()).message || msg;
        } catch (_e) {
          /* */
        }
        throw new Error(msg);
      }
      const res = await resp.json();
      Object.assign(plan, res);
      this.s.save = "ok";
      this._renderSave();
      if (!quiet) {
        this.s.dialog = null;
        this.s.tool = this._firstOpenStep();
        this._signImage(plan);
        this._render();
      }
      return res;
    } catch (err) {
      this._saveError(err);
      if (quiet) throw err;
      return null;
    }
  },

  // ---------------------------------------------------------------- ready + dashboards
  async _openReady() {
    await this._flushSave();
    this.s.dialog = { type: "ready", dash: undefined };
    this._render();
    try {
      const st = await this._ws("state");
      for (const np of st.plans) {
        const p = this.plans.find((x) => x.id === np.id);
        if (p) Object.assign(p, { device_id: np.device_id, sensor_entity: np.sensor_entity, image_entity: np.image_entity });
      }
    } catch (_e) {
      /* keep what we have */
    }
    const dash = await this._findDash(this.s.planId).catch(() => null);
    // What changed since the last time "I'm ready" was opened (per browser).
    const key = `readysnap_${this.s.planId}`;
    const before = lsGet(key, null);
    const now = this._readySnap();
    let diff = null;
    if (before) {
      diff = { added: 0, removed: 0, moved: 0 };
      for (const [id, p] of Object.entries(now)) {
        const b = before[id];
        if (!b) diff.added++;
        else if (Math.hypot(p[0] - b[0], p[1] - b[1]) > 1.5) diff.moved++;
      }
      for (const id of Object.keys(before)) if (!now[id]) diff.removed++;
    }
    lsSet(key, now);
    if (this.s.dialog && this.s.dialog.type === "ready") {
      Object.assign(this.s.dialog, { dash, diff });
      this._render();
    }
  },

  _readySnap() {
    const out = {};
    for (const [id, p] of Object.entries((this.work && this.work.positions) || {})) out[id] = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
    return out;
  },
});
