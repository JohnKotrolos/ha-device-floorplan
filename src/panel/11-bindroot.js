Object.assign(DeviceFloorplanPanel.prototype, {

  // --------------------------------------------------------------- events
  _bindRoot() {
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("dblclick", (e) => {
      const c = e.target.closest && e.target.closest("[data-shc]");
      const pts = c && this.s.shapeEdit && (this.work.shapes || {})[this.s.shapeEdit];
      if (!pts || pts.length <= 3) return;
      e.preventDefault();
      this._change(() => pts.splice(Number(c.dataset.shc), 1));
    });
    root.addEventListener("input", (e) => this._onInput(e));
    root.addEventListener("pointerdown", (e) => this._dzDown(e)); // 0.13.3: two-finger pinch in the plan dialogs
    root.addEventListener("pointerdown", (e) => this._spinDown(e)); // 0.13.8: the Spin centre picker
    root.addEventListener("pointerdown", (e) => this._frDown(e)); // 0.8.2: frame lines (before the plan's own handler)
    root.addEventListener("pointerdown", (e) => this._onDown(e));
    root.addEventListener("pointermove", (e) => this._onMove(e));
    root.addEventListener("pointerup", (e) => this._onUp(e));
    root.addEventListener("pointercancel", (e) => this._onUp(e, true));
    root.addEventListener("dragstart", (e) => this._onDragStart(e));
    root.addEventListener("dragover", (e) => {
      if (!e.target.closest) return;
      if (e.target.closest("[data-vp]")) {
        e.preventDefault();
        // Dragging a device from the list and holding it over a marker of the same kind bonds them (#40).
        if (this._listDrag && this._listDrag.dev) {
          if (!this._listHover || this._listHover.id !== this._listDrag.dev) this._listHover = { id: this._listDrag.dev };
          this._bondHover(this._listHover, e.clientX, e.clientY);
        }
      }
      const drop = e.target.closest("[data-drop]");
      if (drop) {
        e.preventDefault();
        drop.classList.add("over");
      }
    });
    root.addEventListener("dragleave", (e) => {
      const drop = e.target.closest && e.target.closest("[data-drop]");
      if (drop) drop.classList.remove("over");
    });
    root.addEventListener("drop", (e) => {
      const drop = e.target.closest && e.target.closest("[data-drop]");
      if (drop) {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) this._formPickFile(file);
        return;
      }
      this._onDrop(e);
    });
    // 0.7.5: trackpad pinch / Ctrl-⌘ + wheel zooms at the pointer; two-finger swipe / wheel pans a zoomed plan.
    root.addEventListener("wheel", (e) => {
      const fst = e.composedPath().find((n) => n.classList && n.classList.contains("frstage"));
      if (fst) {
        const r = fst.getBoundingClientRect();
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
        const v = this._dzState();
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); // a trackpad pinch: the dialog zooms, not the browser
          this._dzTo(fst, v.z * Math.exp(-e.deltaY * k * 0.01), ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        } else if (v && v.z > 1) {
          e.preventDefault();
          const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
          const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
          this._dzPan(fst, (-dx / r.width) * 100, (-dy / r.height) * 100);
        }
        return;
      }
      if (!this._vp || !this._vp.contains(e.composedPath()[0])) return;
      if (e.target.closest && e.target.closest(".mbox, .refpop, .stackpop, .ipop, .lmenu")) return;
      const s = this.s;
      const r = this._vp.getBoundingClientRect();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const vx = ((e.clientX - r.left) / r.width) * 100;
        const vy = ((e.clientY - r.top) / r.height) * 100;
        this._zoomTo(this._zt() * Math.exp(-e.deltaY * k * 0.01), vx, vy);
        return;
      }
      if (s.z <= 1) return; // nothing to pan: let the page scroll
      e.preventDefault();
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
      const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
      const lim = (v) => clamp(v, 100 * (1 - s.z), 0);
      s.tx = lim(s.tx - (dx / r.width) * 100);
      s.ty = lim(s.ty - (dy / r.height) * 100);
      this._layout();
      clearTimeout(this._zoomT);
      this._zoomT = setTimeout(() => this._render(), 160);
    }, { passive: false });
    root.addEventListener("keydown", (e) => {
      if (e.target.id === "lenin" && e.key === "Enter") this._applyScale();
      // Esc also works while typing in the length fields: cancel the line / close the popup.
      if (e.key === "Escape" && (e.target.id === "lenin" || e.target.id === "reflen")) {
        e.stopPropagation();
        if (e.target.id === "lenin") Object.assign(this.s, { m1: null, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
        else this.s.refSel = null;
        this._render();
      }
      if (e.target.id === "reflen" && e.key === "Enter") this._saveRefLen();
      if (e.target.id === "rname" && e.key === "Enter") this._renamePlan();
      if (e.target.matches && e.target.matches("[data-drop]") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.target.click();
      }
    });
  },

  _onInput(e) {
    const t = e.target;
    if (t.id === "rbpicop") return this._onChange(e);
    if (t.dataset && t.dataset.hfor && t.type === "number") return this._setHeight(t, false); // live, one delayed save
    if (t.id === "q") {
      this.s.q = t.value;
      this._fresh = null;
      this._render();
    } else if (t.id === "lenin") {
      this.s.lenInput = t.value;
    } else if (t.id === "reflen") {
      this.s.refLen = t.value;
    } else if (t.id === "devlabel") {
      const pos = this.work.positions[this.s.sel];
      const d = this.byId.get(this.s.sel);
      if (!pos || !d) return;
      const v = t.value.trim();
      if (v && v !== d.name) pos.label = v.slice(0, 60);
      else delete pos.label;
      this._scheduleSave();
    } else if (t.id === "bondname" || t.id === "bondicon") {
      const b = this._bondOf(this.s.sel);
      if (!b) return;
      const meta = { ...this._bondMeta(b[0]) };
      const k = t.id === "bondname" ? "name" : "icon";
      const v = t.value.trim();
      if (v && (k === "name" || v.includes(":"))) meta[k] = v;
      else delete meta[k];
      this.work.bond_meta = { ...(this.work.bond_meta || {}), [b[0]]: meta };
      this._scheduleSave();
    } else if (t.id === "phname") {
      const ph = (this.work.phantoms || {})[t.dataset.ph];
      if (ph) {
        ph.name = t.value.trim() || "Phantom";
        this._scheduleSave();
      }
    } else if (t.id === "rname") {
      this.s.dialog.name = t.value;
    } else if (t.id === "fname" || t.id === "flevel") {
      this.s.form = { ...(this.s.form || {}), [t.id === "fname" ? "name" : "level"]: t.value };
    }
  },

  /** 0.13.9.8: a spot's mounting height; a bond's height goes on every member. 0.13.9.9: the metres box updates live
   *  (no redraw per arrow press), one undo step per field and one delayed save; the preset list saves and redraws. */
  _setHeight(t, now) {
    const id = this.s.sel;
    const pos = id && this.work.positions[id];
    if (!pos) return;
    const v = t.value === "" ? null : Math.min(10, Math.max(0, Math.round(Number(t.value) * 100) / 100));
    if (v != null && !Number.isFinite(v)) return;
    const bond = this._bondOf(id);
    const apply = () => {
      const recs = t.dataset.hfor === "box" ? [pos.box].filter(Boolean) : (bond ? bond[1] : [id]).map((m) => this.work.positions[m]).filter(Boolean);
      for (const r of recs) {
        if (v == null) delete r.h;
        else r.h = v;
      }
    };
    if (now) return this._change(apply);
    if (!t._undoDone) {
      this._pushUndo();
      t._undoDone = true;
    }
    apply();
    this._scheduleSave();
  },

  _onChange(e) {
    const t = e.target;
    const act = t.dataset.act;
    if (t.dataset && t.dataset.hfor) {
      // 0.13.9.8: the preset list saves at once; the metres box is handled live in _onInput (0.13.9.9).
      if (t.type !== "number") this._setHeight(t, true);
      return;
    }
    if (t.id === "fnorth") {
      this.s.form = { ...(this.s.form || {}), north: t.value === "" ? null : Number(t.value) }; // kept across redraws
      return;
    }
    if (t.id === "fwhere") {
      this.s.form = { ...(this.s.form || {}), where: t.value, name: this.shadowRoot.getElementById("fname").value };
      const fl = t.value.startsWith("floor:") && this.floors.find((x) => `floor:${x.floor_id}` === t.value);
      if (fl && (!this.s.form.name || this.floors.some((x) => x.name === this.s.form.name))) this.s.form.name = fl.name;
      this._render();
      return;
    }
    if (t.id === "rbadd" && t.value && this.s.dialog && this.s.dialog.type === "robot") {
      this.s.dialog = this._robotDialog(this._plan(), t.value);
      return this._render();
    }
    if (t.id === "rbpicop" && this.s.dialog && this.s.dialog.type === "robot") {
      this.s.dialog.op = Number(t.value);
      const draw = this.shadowRoot.getElementById("rbdraw");
      if (draw) draw.innerHTML = this._rbDraw(this.s.dialog, this._rbData(this.s.dialog));
      return;
    }
    if (t.dataset && t.dataset.rbpace && this.s.dialog && this.s.dialog.type === "robot") {
      const d = this.s.dialog;
      const k = t.dataset.rbpace;
      if (k === "*") d.paceDef = Number(t.value);
      else if (t.value === "") delete d.pace[k];
      else d.pace[k] = Number(t.value);
      return;
    }
    if (t.id === "rbsrc" && this.s.dialog && this.s.dialog.type === "robot") {
      const d = this.s.dialog;
      d.source = t.value;
      this._rbPic(d);
      if (!d.m) this._rbAuto(d);
      return this._render();
    }
    if (t.id === "bondname" || t.id === "bondicon" || t.id === "phname" || t.id === "devlabel") return this._render();
    if (act === "phuse") {
      const ph = (this.work.phantoms || {})[t.dataset.ph];
      const m = t.dataset.m;
      const d = this.byId.get(m);
      if (!ph || !d) return;
      const all = (d.entities || []).filter((e) => ["sensor", "binary_sensor", "climate"].includes(e.domain)).map((e) => e.entity_id);
      const box = t.closest(".uses");
      const checked = [...box.querySelectorAll("input[data-act=phuse]")].filter((x) => x.checked).map((x) => x.dataset.e);
      this._change(() => {
        const u = { ...(ph.uses || {}) };
        if (!checked.length || checked.length === all.length) delete u[m];
        else u[m] = checked;
        if (Object.keys(u).length) ph.uses = u;
        else delete ph.uses;
      });
      return;
    }
    if (act === "openlink") {
      const pos = this.work.positions[this.s.sel];
      if (pos && t.value) this._change(() => (pos.opening = { link: t.value, side: 1 }));
      return;
    }
    if (act === "pichl" || act === "pichlcol") {
      const pos = this._bodyRec(this.s.sel);
      if (!pos || !pos.pic) return;
      if (act === "pichl") this.s.picPrev = t.value ? "hl" : "on"; // 0.12.6: show what was just picked
      return this._change(() => {
        if (act === "pichl") {
          if (t.value) pos.pic.hl = { look: t.value, color: (pos.pic.hl || {}).color || "#2196f3" };
          else delete pos.pic.hl;
        } else if (pos.pic.hl) pos.pic.hl.color = t.value;
      });
    }
    if (act === "piclook" || act === "picnum" || act === "pictint" || act === "pictinton") {
      const pos = this._bodyRec(this.s.sel);
      if (!pos || !pos.pic) return;
      if (act === "piclook") this.s.picPrev = t.dataset.k; // 0.12.6: preview the state whose look changed
      return this._change(() => {
        const p = pos.pic;
        if (act === "piclook") {
          const looks = { ...(p.looks || {}) };
          if (t.value === PIC_DEF[t.dataset.k]) delete looks[t.dataset.k];
          else looks[t.dataset.k] = t.value;
          if (Object.keys(looks).length) p.looks = looks;
          else delete p.looks;
        } else if (act === "picnum") p[t.dataset.k] = Number(t.value);
        else if (act === "pictint") p.tint = t.value;
        else if (t.checked) p.tint = (this.shadowRoot.querySelector('[data-act="pictint"]') || {}).value || "#9aa4ae";
        else delete p.tint;
      });
    }
    if (act === "devcat") {
      // 0.12.1: the device's category (all floors); for a light / plug / fan on this plan also what it is on the card.
      const id = this.s.sel;
      const d = this.byId.get(id);
      const v = t.value || null;
      const pos = this.work.positions[id];
      const mainD = (this.mainEntity[id] || (d && d.main_entity) || "").split(".")[0];
      const as = v ? CAT_AS[v] || null : null;
      if (pos && ["light", "switch", "fan"].includes(mainD) && (!pos.as || ["light", "switch", "fan"].includes(pos.as)) && (pos.as || null) !== as) {
        this._change(() => {
          if (as) pos.as = as;
          else delete pos.as;
        });
      }
      if (d) d.category = v || d.category_auto || d.group;
      this._ws("devices/options", { device_id: id, category: v })
        .then((r) => {
          this.deviceOpts = r.device_opts || this.deviceOpts;
          this._render();
        })
        .catch((err) => this._saveError(err));
      return;
    }
    if (act === "splitas") {
      const key = this.s.sel;
      if (this.work.positions[key]) this._change(() => {
        if (t.value) this.work.positions[key].as = t.value;
        else delete this.work.positions[key].as;
      });
      return;
    }
    if (t.id === "airr" || t.id === "airs") {
      const pos = this.work.positions[this.s.sel];
      if (!pos) return;
      const cur = this._air(this.s.sel);
      const v = parseFloat(String(t.value).replace(",", "."));
      if (!(v > 0)) return this._render();
      const W = this._realW();
      this._change(() => {
        pos.air = { ...this._airKeep(cur), ...(t.id === "airr" ? { r: W ? (v / W) * 100 : v } : { s: v }) };
      });
      return;
    }
    if (t.id === "xmasgl") {
      const pos = this.work.positions[this._lightLead(this.s.sel)];
      if (!pos || !pos.light) return;
      this._change(() => (pos.light = { ...pos.light, gl: Number(t.value) }));
      return;
    }
    if (t.id === "xmascm") {
      const pos = this.work.positions[this._lightLead(this.s.sel)];
      if (!pos || !pos.light) return;
      this._change(() => {
        pos.light = { ...pos.light, cm: Number(t.value) };
        delete pos.light.size; // 0.13.3: the slider replaces S / M / L
      });
      return;
    }
    if (t.id === "xmask") {
      const pos = this.work.positions[this._lightLead(this.s.sel)];
      if (!pos || !pos.light) return;
      this._change(() => (pos.light = { ...pos.light, k: Number(t.value) }));
      return;
    }
    if (t.id === "lightk" || t.id === "lighthex") {
      const lead = this._lightLead(this.s.sel);
      const pos = this.work.positions[lead];
      if (!pos) return;
      const cur = this._shape(lead);
      this._change(() => {
        pos.light = { ...(pos.light || { type: cur.type }), type: cur.type, color: t.id === "lightk" ? `k:${t.value}` : t.value };
      });
      return;
    }
    if (t.id === "lightr" || t.id === "lightw" || t.id === "lighth") {
      const lead = this._lightLead(this.s.sel);
      const pos = this.work.positions[lead];
      const v = parseFloat(String(t.value).replace(",", "."));
      if (!pos || !(v > 0)) return this._render();
      const W = this._realW();
      const pct = W ? (v / W) * 100 : v;
      const cur = this._shape(lead);
      this._change(() => {
        const l = { ...(pos.light || { type: cur.type }), type: cur.type };
        if (t.id === "lightr") l.r = pct;
        if (t.id === "lightw") { l.w = pct; if (l.h == null) l.h = cur.h; }
        if (t.id === "lighth") { l.h = pct * this._ratio(); if (l.w == null) l.w = cur.w; }
        if (["strip", "screen", "line"].includes(cur.type) && l.x2 == null) Object.assign(l, { x2: cur.x2, y2: cur.y2 });
        if (["screen", "line"].includes(cur.type) && l.x1 == null) Object.assign(l, { x1: cur.x1, y1: cur.y1 });
        pos.light = l;
      });
      return;
    }
    if (t.id === "lighta") {
      const lead = this._lightLead(this.s.sel);
      const pos = this.work.positions[lead];
      const v = parseFloat(String(t.value).replace(",", "."));
      if (!pos || !(v >= 0)) return this._render();
      const cur = this._shape(lead);
      this._change(() => (pos.light = { ...(pos.light || {}), type: cur.type, x1: cur.x1, y1: cur.y1, x2: cur.x2, y2: cur.y2, r: (pos.light && pos.light.r) ?? cur.r, a: Math.min(60, v) }));
      return;
    }
    if (act === "bondtap" || act === "bondshow") {
      const b = this._bondOf(this.s.sel);
      if (!b) return;
      const meta = { ...this._bondMeta(b[0]) };
      const k = act === "bondtap" ? "tap" : "show";
      if (t.value) meta[k] = t.value;
      else delete meta[k];
      this._change(() => (this.work.bond_meta = { ...(this.work.bond_meta || {}), [b[0]]: meta }));
      return;
    }
    if (act === "phvalue" || act === "phone") {
      const ph = (this.work.phantoms || {})[String(this.s.sel).slice(3)];
      if (!ph) return;
      this._change(() => {
        if (act === "phvalue") {
          ph.value = t.value;
          if (t.value === "one" && !ph.one) ph.one = (ph.members || [])[0];
        } else ph.one = t.value;
      });
      return;
    }
    if (t.id === "file") return this._uploadFile(this._plan(), t.files && t.files[0]);
    if (t.id === "pickfile") return this._formPickFile(t.files && t.files[0]);
    if (t.id === "importfile") return this._importPlan(t.files && t.files[0]);
    if (act === "dashkey") return this._loadDashCfg(t.value);
    if (act === "dashwhere") {
      Object.assign(this.s.dialog, { where: t.value, view: this.s.dialog.view ?? this._firstFreeView() });
      return this._render();
    }
    if (act === "dashview") {
      this.s.dialog.view = t.value;
      return;
    }
    if (act === "replacedev" && t.value) {
      const old = this.s.sel;
      const nid = t.value;
      this._change(() => {
        this.work.positions[nid] = { ...this.work.positions[old] };
        delete this.work.positions[nid].approx;
        delete this.work.positions[old];
      });
      this.s.sel = nid;
      this._markSeen([nid]);
      this._render();
      return;
    }
    if (act === "formimg") {
      this.s.form = { ...(this.s.form || {}), img: t.value, name: this.shadowRoot.getElementById("fname").value };
      this._render();
    } else if (act === "colorby") {
      this.s.colorBy = t.value;
      lsSet("colorBy", t.value);
      this._render();
    } else if (act === "names") {
      this.s.names = t.value;
      lsSet("names", t.value);
      this._render();
    } else if (act === "groupby") {
      this.s.groupBy = t.value;
      lsSet("groupBy", t.value);
      this.s.collapsed = {}; // 0.8.2: a new grouping starts with every group collapsed
      this._render();
    } else if (act === "allfloors") {
      this.s.allFloors = t.checked;
      this._render();
    } else if (act === "queue") {
      this.s.queue = t.checked;
    } else if (act === "guidebox") {
      this.s.guide = t.checked;
      lsSet("guide", t.checked);
      this._render();
    } else if (act === "setupchk") {
      const f = this.s.setup;
      const list = f[t.dataset.key];
      const i = list.indexOf(t.dataset.val);
      if (i >= 0) list.splice(i, 1);
      else list.push(t.dataset.val);
      this._render();
    } else if (act === "setupauto") {
      this.s.setup[t.dataset.key] = t.checked;
      this._render();
    }
  },
});
