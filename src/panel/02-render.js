Object.assign(DeviceFloorplanPanel.prototype, {

  // ---------------------------------------------------------------- render
  _render() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._renderNow());
  },

  /** 0.13.3: zoom for the plan dialogs (Align floors, Frame the plan, the robot map): the stage's content goes into
   *  a zoomable layer with − / % / + / Fit. Wheel with Ctrl / ⌘ or a trackpad pinch zooms at the pointer, the wheel
   *  pans when zoomed, two fingers pinch on touch screens. The dialog's own drags read the zoomed layer's size. */
  _dzApply() {
    const d = this.s.dialog;
    for (const st of this.shadowRoot.querySelectorAll(".frstage")) {
      if (!d) continue;
      let dz = st.querySelector(":scope > .dz");
      if (!dz) {
        dz = document.createElement("div");
        dz.className = "dz";
        while (st.firstChild) dz.appendChild(st.firstChild);
        st.appendChild(dz);
        const ctl = document.createElement("div");
        ctl.className = "dzctl";
        ctl.innerHTML = `<button data-act="dzz" data-v="out" aria-label="Zoom out">−</button><span></span><button data-act="dzz" data-v="in" aria-label="Zoom in">+</button><button data-act="dzz" data-v="fit" aria-label="Fit">Fit</button>`;
        st.appendChild(ctl);
      }
      this._dzShow(st);
    }
  },

  _dzState() {
    const d = this.s.dialog;
    if (!d) return null;
    d._vz = d._vz || { z: 1, tx: 0, ty: 0 };
    return d._vz;
  },

  _dzShow(st) {
    const v = this._dzState();
    const dz = st && st.querySelector(":scope > .dz");
    if (!v || !dz) return;
    dz.style.transform = `translate(${v.tx}%, ${v.ty}%) scale(${v.z})`;
    const lab = st.querySelector(".dzctl span");
    if (lab) lab.textContent = `${Math.round(v.z * 100)}%`;
  },

  /** Zoom to z keeping the stage point (vx, vy) (% of the stage) where it is. */
  _dzTo(st, z, vx = 50, vy = 50) {
    const v = this._dzState();
    if (!v) return;
    z = clamp(z, 1, 8);
    const px = (vx - v.tx) / v.z;
    const py = (vy - v.ty) / v.z;
    const lim = (t) => clamp(t, 100 * (1 - z), 0);
    Object.assign(v, { z, tx: lim(vx - px * z), ty: lim(vy - py * z) });
    this._dzShow(st);
  },

  _dzPan(st, dxPct, dyPct) {
    const v = this._dzState();
    if (!v || v.z <= 1) return;
    const lim = (t) => clamp(t, 100 * (1 - v.z), 0);
    v.tx = lim(v.tx + dxPct);
    v.ty = lim(v.ty + dyPct);
    this._dzShow(st);
  },

  /** 0.13.8: the Spin centre picker: tap or drag the crosshair; saved when let go. */
  _spinDown(e) {
    const box = e.target.closest && e.target.closest("[data-spinbox]");
    if (!box) return false;
    const body = this._bodyRec(this.s.sel);
    if (!body || !body.pic || !body.pic.hl) return false;
    e.preventDefault();
    const pt = box.querySelector(".spinpt");
    let ox = body.pic.hl.ox ?? 50;
    let oy = body.pic.hl.oy ?? 50;
    const at = (ev) => {
      const r = box.getBoundingClientRect();
      ox = Math.round(clamp(((ev.clientX - r.left) / r.width) * 100, 0, 100) * 10) / 10;
      oy = Math.round(clamp(((ev.clientY - r.top) / r.height) * 100, 0, 100) * 10) / 10;
      pt.style.left = `${ox}%`;
      pt.style.top = `${oy}%`;
    };
    at(e);
    const up = () => {
      window.removeEventListener("pointermove", at);
      window.removeEventListener("pointerup", up);
      this._change(() => (body.pic.hl = { ...body.pic.hl, ox, oy }));
    };
    window.addEventListener("pointermove", at);
    window.addEventListener("pointerup", up);
    return true;
  },

  _dzDown(e) {
    const st = e.target.closest && e.target.closest(".frstage");
    if (!st || e.pointerType !== "touch") return;
    this._dzPts = this._dzPts || new Map();
    this._dzPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._dzPts.size !== 2) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this._dzPinch = true;
    const mid = (P) => ({ x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2, d: Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1 });
    let last = mid([...this._dzPts.values()]);
    const move = (ev) => {
      if (!this._dzPts.has(ev.pointerId)) return;
      this._dzPts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const now = mid([...this._dzPts.values()]);
      const r = st.getBoundingClientRect();
      const v = this._dzState();
      this._dzTo(st, v.z * (now.d / last.d), ((now.x - r.left) / r.width) * 100, ((now.y - r.top) / r.height) * 100);
      this._dzPan(st, ((now.x - last.x) / r.width) * 100, ((now.y - last.y) / r.height) * 100);
      last = now;
    };
    const up = (ev) => {
      this._dzPts.delete(ev.pointerId);
      if (this._dzPts.size < 2) {
        this._dzPinch = false;
        this._dzPts.clear();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  },

  /** The rectangle the dialog's drags measure against: the zoomed layer (equals the stage when not zoomed). */
  _dzRect(st) {
    const dz = st && st.querySelector(":scope > .dz");
    return (dz || st).getBoundingClientRect();
  },

  _renderNow() {
    if (!this._app) return;
    this._syncSplit();
    requestAnimationFrame(() => this._fitPop());
    const sideEl = this.shadowRoot.querySelector(".sidecol");
    // Keep the right column's scroll; a newly selected device starts at the top.
    const scroll = sideEl && this._lastSel === this.s.sel ? sideEl.scrollTop : 0;
    this._lastSel = this.s.sel;
    const focused = this.shadowRoot.activeElement;
    const focusId = focused && focused.id;
    const caret = focused && focused.selectionStart;
    const vsTop = (this.shadowRoot.getElementById("vscroll") || {}).scrollTop || 0; // test12: keep a tall plan's scroll
    this._app.innerHTML = this._html();
    this._vp = this.shadowRoot.querySelector(".viewport");
    if (this._vp) {
      if (!this._ro) this._ro = new ResizeObserver(() => this._sizeViewport());
      this._ro.disconnect();
      this._ro.observe(this._vp.parentElement);
      this._sizeViewport();
      if (vsTop) this._vp.parentElement.scrollTop = vsTop;
      const img = this.shadowRoot.getElementById("planimg");
      const plan = this._plan();
      if (img && plan && plan.image_fallback_url && this.s.imgFailed !== plan.image_url) {
        img.addEventListener("error", () => {
          this.s.imgFailed = plan.image_url;
          this._render();
        }, { once: true });
      }
    }
    this._bindBrandIcons();
    this._dzApply(); // 0.13.3: zoom in the plan dialogs
    if (window.__dfcAlignAnims) window.__dfcAlignAnims(this.shadowRoot); // 0.13.9.1: previews don't restart on redraw
    this._hydrateCardPreview();
    const side2 = this.shadowRoot.querySelector(".sidecol");
    if (side2) side2.scrollTop = scroll;
    if (focusId) {
      const el = this.shadowRoot.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (_e) { /* */ }
      }
    }
    this._hydrate();
  },

  /** Fit the plan into the space left in the canvas (the legend below always stays visible). */
  _sizeViewport() {
    const plan = this._plan();
    if (!this._vp || !plan) return;
    const canvas = this._vp.parentElement;
    const ratio = plan.width && plan.height ? plan.width / plan.height : 1.6;
    const availW = Math.max(120, canvas.clientWidth - 8);
    const availH = Math.max(120, canvas.clientHeight - 8);
    const w0 = Math.min(availW, availH * ratio);
    // test12 (#16): a plan narrower than the canvas (a tall plan) may grow up to the canvas width when zoomed in
    // (s.g); it then scrolls up / down. Room for the scrollbar is kept. Wide plans: gMax = 1, as before.
    this._gMax = Math.max(1, (availW - 16) / w0);
    const g = Math.min(this.s.g || 1, this._gMax);
    this.s.g = g;
    canvas.classList.toggle("grown", g > 1.001);
    const w = w0 * g;
    this._vp.style.width = `${Math.round(w)}px`;
    this._vp.style.height = `${Math.round(w / ratio)}px`;
    const prevW = this._vpW;
    this._layout();
    if (prevW && Math.abs(prevW - this._vpW) > 2) {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this._renderOverlay(true), 120);
    }
  },

  _renderSave() {
    const el = this.shadowRoot.getElementById("save");
    if (el) el.outerHTML = this._saveHtml();
    const u = this.shadowRoot.querySelector('[data-act="undo"]');
    const r = this.shadowRoot.querySelector('[data-act="redo"]');
    if (u) u.disabled = !this._undo.length;
    if (r) r.disabled = !this._redo.length;
  },

  _renderToast() {
    const old = this.shadowRoot.getElementById("toast");
    if (old) old.remove();
    if (!this.s.toast) return;
    this._app.insertAdjacentHTML("beforeend", this._toastHtml());
  },

  _hydrateSoon() {
    if (this._hydT) return;
    this._hydT = setTimeout(() => {
      this._hydT = null;
      this._hydrate();
    }, 1500);
  },

  _hydrate() {
    if (!this._hass) return;
    const prev = this.shadowRoot.querySelector("#cardprev > device-floorplan-card");
    if (prev) prev.hass = this._hass;
    const states = this._hass.states || {};
    for (const el of this.shadowRoot.querySelectorAll("[data-ent]")) {
      const ent = el.dataset.ent;
      const so = states[ent];
      el.hass = this._hass;
      if (so) {
        el.stateObj = so;
        if (el.tagName === "HA-STATE-ICON") el.icon = undefined;
      } else {
        el.stateObj = undefined;
        el.icon = el.dataset.fallback;
      }
    }
  },

  /** Integration logo in a round avatar; falls back to the device-type icon. */
  _avatarHtml(d) {
    if (!d.integration) return `<span class="ico av">${this._iconHtml(d)}</span>`;
    const dark = this._hass && this._hass.themes && this._hass.themes.darkMode;
    const fb = (GROUPS[d.category || d.group] || GROUPS.other)[1];
    return `<span class="ico av" title="${esc(d.integration)}"><img class="brand" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${fb}" src="${BRANDS}/${encodeURIComponent(d.integration)}/${dark ? "dark_icon" : "icon"}.png"></span>`;
  },

  _bindBrandIcons() {
    for (const img of this.shadowRoot.querySelectorAll("img.brand:not([data-b])")) {
      img.dataset.b = "1";
      const swap = () => {
        const span = img.parentElement;
        if (span) span.innerHTML = `<ha-icon icon="${img.dataset.fallback}"></ha-icon>`;
      };
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener("error", swap, { once: true });
    }
  },

  async _hydrateCardPreview() {
    const box = this.shadowRoot.getElementById("cardprev");
    if (!box || box.firstChild) return;
    if (!customElements.get("device-floorplan-card")) {
      try {
        await import(`${STATIC}/device-floorplan-card.js?v=${VERSION}`);
      } catch (_e) {
        box.textContent = "Could not load the card.";
        return;
      }
    }
    if (box.firstChild) return;
    await this._flushSave();
    const card = document.createElement("device-floorplan-card");
    card.setConfig({ type: "custom:device-floorplan-card", plan: this.s.planId });
    card.hass = this._hass;
    box.appendChild(card);
  },

  _iconHtml(d) {
    if (d.split && d.as && d.as !== "other") return `<ha-icon icon="${{ light: "mdi:lightbulb", switch: "mdi:toggle-switch-variant", fan: "mdi:fan" }[d.as]}"></ha-icon>`;
    const fb = (GROUPS[d.category || d.group] || GROUPS.other)[1];
    const ent = this.mainEntity[d.id] || d.main_entity;
    if (ent && customElements.get("ha-state-icon")) return `<ha-state-icon data-ent="${esc(ent)}" data-fallback="${fb}"></ha-state-icon>`;
    return `<ha-icon icon="${fb}"></ha-icon>`;
  },

  _html() {
    const s = this.s;
    if (s.loading) return `<div class="welcome"><p>Loading…</p></div>`;
    if (s.error) return `${this._headerHtml(true)}<div class="welcome"><div class="dialog"><h2>Could not load</h2><p class="err">${esc(s.error)}</p><div class="acts"><button class="btn primary" data-act="reload">Try again</button></div></div></div>`;
    // First run: create the plan first, then choose which kinds of devices go on it.
    if (!this.plans.length) return `${this._headerHtml(true)}<div class="welcome">${this._planFormHtml("create", true)}</div>${this._modalHtml()}${this._menuHtml()}`;
    if (!this.setupDone) return `${this._headerHtml(true)}${this._setupHtml()}`;
    const p = this._plan();
    const noImage = p && !p.image_url;
    // 0.8.2: the header runs the full width; steps, guide and plan on the left; the right column starts under the header.
    return `${this._headerHtml(false)}<div class="body"><div class="lcol">${noImage ? "" : this._toolbarHtml()}${this._guideHtml()}
      <main>${this._planHtml()}</main></div>${noImage ? "" : this._sideHtml()}</div>${this._toastHtml()}${this._modalHtml()}${this._menuHtml()}`;
  },
});
