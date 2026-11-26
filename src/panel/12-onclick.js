Object.assign(DeviceFloorplanPanel.prototype, {

  async _onClick(e) {
    const el = e.target.closest("[data-act]");
    // Any click outside an open menu / layer list closes it.
    if (this.s.menu && !e.target.closest(".menu") && !(el && ["appmenu", "tabmenu"].includes(el.dataset.act))) {
      this.s.menu = null;
      if (!el) return this._render();
    }
    if (this.s.layersOpen && !e.target.closest(".layerctl")) {
      this.s.layersOpen = false;
      if (!el) return this._render();
    }
    if (!el) return;
    const act = el.dataset.act;
    if (this.s.menu && e.target.closest(".menu")) this.s.menu = null;
    if (["colorby", "names", "groupby", "allfloors", "queue", "guidebox", "setupchk", "setupauto", "formimg", "dashkey", "dashwhere", "dashview", "replacedev", "bondtap", "bondshow", "phvalue", "phone"].includes(act)) return;
    if (act === "modalbg") {
      // A frame line dragged out of the dialog ends with a click on the background: keep the dialog.
      if (e.target === el && !(this.s.dialog && this.s.dialog.type === "bondask") && !(this._frUp && Date.now() - this._frUp < 400)) this._closeDialog();
      return;
    }
    const s = this.s;
    const id = el.dataset.id;
    switch (act) {
      case "menu":
        this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
        break;
      case "reload":
        this._reload();
        break;
      case "fixprop": {
        // 0.11: a squeezed picture gets its true shape. The height changes so both directions use one scale;
        // everything is stored in % of the picture, so devices, rooms and lines stay where they are.
        const p = this._plan();
        const sc = this._scale();
        if (!p || !sc.h || !sc.v) break;
        const height = Math.max(1, Math.round((p.height * sc.v) / sc.h));
        this._ws("plan/update", { plan_id: p.id, width: p.width, height })
          .then((res) => {
            Object.assign(p, { width: res.width ?? p.width, height: res.height ?? height });
            this._render();
          })
          .catch((err) => this._saveError(err));
        break;
      }
      case "resetprop": {
        // 0.11: back to the picture's own shape.
        const p = this._plan();
        if (!p) break;
        this._ws("plan/update", { plan_id: p.id, reset_size: true })
          .then((res) => {
            Object.assign(p, { width: res.width, height: res.height, orig_size: res.orig_size });
            this._render();
          })
          .catch((err) => this._saveError(err));
        break;
      }
      case "saveretry": // 0.11
        this.s.save = "busy";
        this._flushSave();
        break;
      case "plan":
        this._openPlan(el.dataset.id);
        this._render();
        break;
      case "newplan":
        s.form = null;
        s.dialog = { type: "create" };
        this._render();
        break;
      case "settings":
        s.form = null;
        s.dialog = { type: "settings" };
        this._render();
        break;
      case "appmenu":
      case "tabmenu": {
        if (act === "tabmenu" && id !== s.planId) this._openPlan(id);
        const r = el.getBoundingClientRect();
        const x = Math.min(r.left, window.innerWidth - 240);
        s.menu = s.menu && s.menu.type === (act === "appmenu" ? "app" : "tab") && (act === "appmenu" || s.menu.id === id) ? null : { type: act === "appmenu" ? "app" : "tab", id, x: act === "appmenu" ? Math.min(r.right - 230, x) : x, y: r.bottom + 4 };
        this._render();
        break;
      }
      case "showintro":
        try {
          window.localStorage.removeItem("device_floorplan_intro_seen_v1");
        } catch (_e) {
          /* */
        }
        this._showIntro();
        this._render();
        break;
      case "rename":
        s.dialog = { type: "rename" };
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("rname");
          if (i) {
            i.focus({ preventScroll: true });
            i.select();
          }
        }, 50);
        break;
      case "alignplan":
        s.menu = null;
        if (this._plan()) {
          await this._flushSave();
          s.dialog = this._alignDialog(this._plan());
          if (!s.dialog) this._toast("Measure this floor first, then align it", false);
          else this._signImage(this.plans.find((x) => x.id === s.dialog.ref)); // the house floor's picture underneath
        }
        this._render();
        break;
      case "pturn":
      case "alturn": {
        // 0.13.2 (#21): the picture is turned here and saved as this floor's picture; Home Assistant turns
        // everything placed on it the same way, so nothing moves on the floor. #119: also from the plan's ⋮ menu.
        const d = act === "alturn" ? s.dialog : null;
        const p = this.plans.find((x) => x.id === (d ? d.plan : el.dataset.id));
        if (act === "pturn") s.menu = null;
        if (!p) break;
        const q = Number(el.dataset.q) === 3 ? 3 : 1;
        try {
          this._flushSave();
          const file = await this._turnedImage(p, q);
          if (!file) break;
          const res = await this._uploadFile(p, file, true, q);
          if (!res) break;
          if (this.s.planId === p.id) this._openPlan(p.id);
          this._signImage(p);
          if (d) s.dialog = this._alignDialog(p);
          this._toast(`${p.name} turned ${q === 1 ? "right" : "left"}; everything on it turned too`, false);
        } catch (err) {
          this._saveError(err);
        }
        this._render();
        break;
      }
      case "dzz": {
        const st = el.closest(".frstage");
        const v = this._dzState();
        if (!st || !v) break;
        if (el.dataset.v === "fit") Object.assign(v, { z: 1, tx: 0, ty: 0 });
        this._dzTo(st, el.dataset.v === "in" ? v.z * 1.4 : el.dataset.v === "out" ? v.z / 1.4 : 1);
        break;
      }
      case "alcentre":
      case "alsave": {
        const d = s.dialog;
        const p = d && this.plans.find((x) => x.id === d.plan);
        if (!p) break;
        const align = act === "alcentre" ? {} : { x: +d.x.toFixed(3), y: +d.y.toFixed(3) };
        try {
          const res = await this._ws("plan/update", { plan_id: p.id, align });
          Object.assign(p, { align: res.align, frame_eff: res.frame_eff });
        } catch (err) {
          this._saveError(err);
        }
        s.dialog = act === "alcentre" ? this._alignDialog(p) : null;
        if (act === "alsave") this._toast("Aligned: the card shows both floors in the same place", false);
        this._render();
        break;
      }
      case "robotdlg":
        s.menu = null;
        if (this._plan()) {
          await this._flushSave();
          if (!window.__dfcRobot || !window.__dfcRobot.fit2) await import(`${STATIC}/device-floorplan-card.js?v=${VERSION}`).catch(() => {});
          s.dialog = window.__dfcRobot ? this._robotDialog(this._plan()) : null;
        }
        this._render();
        break;
      case "rbpick":
        if (s.dialog && s.dialog.type === "robot" && el.dataset.eid !== s.dialog.eid) s.dialog = this._robotDialog(this._plan(), el.dataset.eid);
        this._render();
        break;
      case "rbauto":
        if (s.dialog && s.dialog.type === "robot") this._rbAuto(s.dialog);
        this._render();
        break;
      case "rbop":
        if (s.dialog && s.dialog.type === "robot") this._rbOp(s.dialog, el.dataset.op, Number(el.dataset.v));
        this._render();
        break;
      case "rbsave":
      case "rbdel": {
        const d = s.dialog;
        const p = this._plan();
        if (!d || !p || d.type !== "robot" || !d.eid) break;
        const robots = { ...(p.robots || {}) };
        if (act === "rbdel") delete robots[d.eid];
        else robots[d.eid] = { source: d.source || "", op: d.op, ...(d.m && d.source ? { m: d.m.map((v) => +v.toPrecision(9)), map: window.__dfcRobot.sig(this._rbData(d)) } : {}) };
        try {
          const res = await this._ws("plan/update", { plan_id: p.id, robots, ...(act === "rbsave" ? { pace: d.pace, pace_default: Number(d.paceDef) } : {}) });
          p.robots = res.robots;
          p.pace = res.pace;
          p.pace_default = res.pace_default;
        } catch (err) {
          this._saveError(err);
          break;
        }
        s.dialog = act === "rbdel" ? this._robotDialog(p) : null;
        this._toast(act === "rbdel" ? "Robot removed from this plan" : d.m && d.source ? "Saved: the card shows the robot live while it cleans" : "Saved. Without a map, the card shows the robot where you place it on the plan", false);
        this._render();
        break;
      }
      case "frameplan":
        s.menu = null;
        if (this._plan()) s.dialog = this._frameDialog(this._plan());
        this._render();
        break;
      case "frlink":
        if (s.dialog && s.dialog.type === "frame") {
          s.dialog.linked = !s.dialog.linked;
          if (s.dialog.linked) s.dialog.r = s.dialog.b = s.dialog.l = s.dialog.t;
          this._render();
        }
        break;
      case "frreset":
        if (s.dialog && s.dialog.type === "frame") {
          Object.assign(s.dialog, { t: 0, r: 0, b: 0, l: 0 });
          this._render();
        }
        break;
      case "frsave": {
        const dlg = s.dialog;
        const p = this._plan();
        if (!dlg || !p) break;
        const frame = { t: dlg.t, r: dlg.r, b: dlg.b, l: dlg.l };
        // A floor's frame is the house frame: every other floor follows it.
        this._ws("plan/update", { plan_id: p.id, frame, ...(p.kind === "floor" ? { frame_ref: true } : {}) }).then((res) => Object.assign(p, res)).catch((err) => this._saveError(err));
        p.frame = frame;
        s.dialog = null;
        this._toast("Frame saved: dashboards use it unless a card sets its own", false);
        this._render();
        break;
      }
      case "dorename":
        await this._renamePlan();
        break;
      case "replaceimg":
        s.form = { changeImage: true };
        s.dialog = { type: "settings" };
        s.imgFailed = null;
        this._render();
        break;
      case "changeimg":
        s.form = { ...(s.form || {}), changeImage: true };
        this._render();
        break;
      case "moveplan":
        await this._movePlan(Number(el.dataset.dir));
        break;
      case "export":
        await this._flushSave();
        s.dialog = { type: "export" };
        this._render();
        break;
      case "doexport":
        await this._export(el.dataset.fmt);
        break;
      case "importplan": {
        const inp = this.shadowRoot.getElementById("importfile");
        if (inp) {
          inp.value = "";
          inp.click();
        }
        break;
      }
      case "ready":
        await this._openReady();
        break;
      case "preview": {
        const prev = s.dialog;
        s.dialog = { type: "preview", from: prev && prev.type === "ready" ? prev : null, dash: prev && prev.dash };
        this._render();
        break;
      }
      case "toadddash":
        await this._openAddDash(s.dialog && ["ready", "preview"].includes(s.dialog.type) ? s.dialog : null);
        break;
      case "dlgback":
        s.dialog = s.dialog && s.dialog.from ? s.dialog.from : null;
        this._render();
        break;
      case "newdash":
      case "newmob":
        await this._openNewDash(act === "newmob");
        break;
      case "donewdash":
        await this._createDash();
        break;
      case "doadddash":
        await this._addToDashboard();
        break;
      case "opendash":
        s.dialog = null;
        this._navigate(el.dataset.path);
        break;
      case "opendevice": {
        const p = this._plan();
        s.dialog = null;
        if (p && p.device_id) this._navigate(`/config/devices/device/${p.device_id}`);
        break;
      }
      case "copyyaml":
        try {
          await navigator.clipboard.writeText(`type: custom:device-floorplan-card\nplan: ${s.planId}`);
          el.textContent = "Copied ✓";
        } catch (_e) {
          el.textContent = "Select the text above and copy it";
        }
        break;
      case "layers":
        s.layersOpen = !s.layersOpen;
        this._render();
        break;
      case "layer":
        if (el.dataset.key === "lightshapes") s.layers = { ...s.layers, lightshapes: s.layers.lightshapes !== true };
        else s.layers = { ...s.layers, [el.dataset.key]: s.layers[el.dataset.key] === false };
        lsSet("layers", s.layers);
        s.layersOpen = true;
        this._render();
        break;
      case "refedit":
        s.refSel = Number(el.dataset.i);
        s.refLen = this.work.refs[s.refSel].length.toFixed(2);
        this._render();
        setTimeout(() => {
          const i = this.shadowRoot.getElementById("reflen");
          if (i) {
            i.focus({ preventScroll: true });
            i.select();
          }
        }, 50);
        break;
      case "refsave":
        this._saveRefLen();
        break;
      case "refdel": {
        const i = el.dataset.i !== undefined ? Number(el.dataset.i) : s.refSel;
        const r = this.work.refs[i];
        if (!r) break;
        this._change(() => this.work.refs.splice(i, 1));
        s.refSel = null;
        this._render();
        this._toast(`${r.dir === "h" ? "Horizontal" : "Vertical"} measurement deleted`);
        break;
      }
      case "browse": {
        const inp = this.shadowRoot.getElementById("pickfile");
        if (inp) {
          inp.value = "";
          inp.click();
        }
        break;
      }
      case "halist":
        s.form = { ...(s.form || {}), haOpen: true, haList: null };
        this._render();
        try {
          const res = await this._ws("images/list");
          s.form.haList = res.images;
        } catch (_e) {
          s.form.haList = [];
        }
        this._render();
        break;
      case "halistclose":
        s.form.haOpen = false;
        this._render();
        break;
      case "pickha":
        s.form = { ...(s.form || {}), haOpen: false, err: null, image: { kind: "ha", url: el.dataset.url, preview: el.dataset.url } };
        this._render();
        break;
      case "picktpl": {
        const t = this.templates.find((x) => x.id === el.dataset.id);
        s.form = { ...(s.form || {}), err: null, img: "top", image: { kind: "template", id: t.id, preview: `${STATIC}/${t.thumbnail}` } };
        this._render();
        break;
      }
      case "backintro":
        s.dialog = null;
        s.form = null;
        this._render();
        this._showIntro();
        break;
      case "clearimg":
        s.form = { ...(s.form || {}), image: null, err: null };
        this._render();
        break;
      case "applyimg":
        await this._applyCanvasImage();
        break;
      case "hideroom": {
        const dlg = s.dialog;
        const keep = el.dataset.keep === "1";
        this._change(() => {
          if (!this.work.hidden_rooms.includes(dlg.area)) this.work.hidden_rooms.push(dlg.area);
          delete this.work.anchors[dlg.area];
          if (!keep) dlg.ids.forEach((x) => delete this.work.positions[x]);
        });
        s.dialog = null;
        this._render();
        break;
      }
      case "closedlg":
        this._closeDialog();
        break;
      case "saveform":
        await this._saveForm(el.closest("[data-form]").dataset.form);
        break;
      case "aidlg":
        s.dialog = { type: "ai" };
        this._render();
        break;
      case "aisave": {
        const on = !!(this.shadowRoot.getElementById("aishare") || {}).checked;
        try {
          const res = await this._ws("ai_share", { on });
          this.aiShare = !!res.ai_share;
          s.dialog = null;
          this._toast(this.aiShare ? "AI assistants can now ask the floorplan" : "The floorplan is no longer shared with AI assistants", false);
        } catch (err) {
          this._saveError(err);
        }
        this._render();
        break;
      }
      case "askdelete":
        s.dialog = { type: "delete" };
        this._render();
        break;
      case "dodelete":
        await this._deletePlan();
        break;
      case "resetsetup":
        await this._flushSave();
        await this._ws("setup/reset");
        this.setupDone = false;
        s.setup = null;
        s.dialog = null;
        this._render();
        break;
      case "setupdone":
        await this._finishSetup();
        break;
      case "undo":
        this._undoAct();
        break;
      case "redo":
        this._redoAct();
        break;
      case "tool":
        this._setTool(el.dataset.tool);
        break;
      case "guide":
        s.guide = !s.guide;
        lsSet("guide", s.guide);
        this._render();
        break;
      case "skip1":
        lsSet(`skip1_${s.planId}`, true);
        this._setTool("rooms");
        break;
      case "placingdetails":
        s.sel = s.placing;
        this._render();
        break;
      case "stopplace":
        Object.assign(s, { placing: null, placingRoom: null, placingBox: null, hover: null });
        this._render();
        break;
      case "pop":
        s.pop = s.pop === el.dataset.key ? null : el.dataset.key;
        this._render();
        break;
      case "closepop":
        s.pop = null;
        this._render();
        break;
      case "chip": {
        this._fresh = null;
        const key = el.dataset.key;
        s[key] = s[key].filter((x) => x !== "__none__");
        const list = s[key];
        const i = list.indexOf(el.dataset.val);
        if (i >= 0) list.splice(i, 1);
        else list.push(el.dataset.val);
        this._render();
        break;
      }
      case "popall":
        this._fresh = null;
        s[s.pop] = [];
        this._render();
        break;
      case "popnone":
        this._fresh = null;
        s[s.pop] = ["__none__"];
        this._render();
        break;
      case "fclear":
        this._fresh = null;
        s[el.dataset.key] = [];
        if (s.pop === el.dataset.key) s.pop = null;
        this._render();
        break;
      case "tools":
        s.toolsOpen = !s.toolsOpen;
        if (!s.toolsOpen) s.pop = null;
        lsSet("tools", s.toolsOpen);
        this._render();
        break;
      case "partown":
      case "partauto":
        await this._ws("devices/options", { device_id: id, part: act === "partown" ? "own" : null }).catch((err) => this._saveError(err));
        this.deviceOpts[id] = { ...(this.deviceOpts[id] || {}), part: act === "partown" ? "own" : undefined };
        await this._reloadDevices();
        if (act === "partown" && s.sel && this.work && this.work.positions[s.sel] && !this.work.positions[id]) {
          // Unbonded: it stays on the same spot as its own device (#62).
          const pp = this.work.positions[s.sel];
          this._change(() => (this.work.positions[id] = { x: pp.x, y: pp.y, ...(pp.approx ? { approx: true } : {}) }));
        }
        this._toast(act === "partown" ? "Unbonded: its own device on the same spot (it stays unbonded)" : "Bonded automatically again: one device with its parent", false);
        break;
      case "shapeedit": {
        const aid = el.dataset.id;
        if (s.shapeEdit === aid) { s.shapeEdit = null; this._render(); break; }
        s.shapeEdit = aid;
        if (!(this.work.shapes || {})[aid]) this._change(() => { this.work.shapes = { ...(this.work.shapes || {}), [aid]: this._shapeRect(aid) }; });
        else this._render();
        break;
      }
      case "shapereset":
        if (s.shapeEdit) this._change(() => (this.work.shapes[s.shapeEdit] = this._shapeRect(s.shapeEdit)));
        break;
      case "shapedel":
        if (s.shapeEdit) {
          const aid = s.shapeEdit;
          s.shapeEdit = null;
          this._change(() => delete this.work.shapes[aid]);
        }
        break;
      case "shapedone":
        s.shapeEdit = null;
        this._render();
        break;
      case "phusesopen":
        s.phUses = s.phUses === el.dataset.id ? null : el.dataset.id;
        this._render();
        break;
      case "openroll": {
        const pos = this.work.positions[el.dataset.key];
        if (pos && pos.opening) this._change(() => (pos.opening.roll = el.dataset.roll));
        break;
      }
      case "openas": {
        const pos = this.work.positions[s.sel];
        if (pos) this._change(() => (pos.as = el.dataset.as));
        break;
      }
      case "opendraw": {
        const pos = this.work.positions[s.sel];
        if (!pos) break;
        const W = this._realW();
        const half = W ? (0.5 / W) * 100 : 3; // about 1 m long, horizontal, through the marker
        const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
        this._change(() => (pos.opening = { x1: c(pos.x - half), y1: c(pos.y), x2: c(pos.x + half), y2: c(pos.y) }));
        break;
      }
      case "openswap": {
        const g = this._openGeo(s.sel);
        if (!g) break;
        if (g.kind === "own") {
          const pos = this.work.positions[s.sel];
          this._change(() => (pos.opening.swap ? delete pos.opening.swap : (pos.opening.swap = true)));
        } else if (g.kind === "link") {
          const pos = this.work.positions[s.sel];
          this._change(() => (pos.opening.side = (pos.opening.side || 1) === 1 ? -1 : 1));
        } else {
          const bp = this.work.positions[g.base];
          this._change(() => (bp.opening.swap ? delete bp.opening.swap : (bp.opening.swap = true)));
        }
        break;
      }
      case "openmerge": {
        const g = this._openGeo(s.sel);
        const pos = this.work.positions[s.sel];
        if (!g || !pos || g.kind === "own") break;
        this._change(() => {
          const side = pos.opening && pos.opening.side === -1 ? -1 : 1;
          pos.opening = { link: g.base, side };
          if (!g.merged) pos.opening.merge = true;
        });
        break;
      }
      case "openownbar": {
        const g = this._openGeo(s.sel);
        const pos = this.work.positions[s.sel];
        if (!g || !pos) break;
        const W = (this._vpW || 800) * (s.z || 1), H = (this._vpH || 500) * (s.z || 1);
        const o = g.geo;
        const dx = ((o.x2 - o.x1) * W) / 100, dy = ((o.y2 - o.y1) * H) / 100;
        const L = Math.hypot(dx, dy) || 1;
        const ox = ((-dy / L) * 14 * (g.side || 1) * 100) / W, oy = ((dx / L) * 14 * (g.side || 1) * 100) / H;
        const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 1000) / 1000;
        this._change(() => (pos.opening = { x1: c(o.x1 + ox), y1: c(o.y1 + oy), x2: c(o.x2 + ox), y2: c(o.y2 + oy) }));
        break;
      }
      case "opendel": {
        const pos = this.work.positions[s.sel];
        if (pos) this._change(() => delete pos.opening);
        break;
      }
      case "airtype": {
        const pos = this.work.positions[s.sel];
        if (!pos) break;
        const cur = this._air(s.sel);
        this._change(() => (pos.air = el.dataset.type === "none" ? { type: "none" } : this._airKeep(cur)));
        break;
      }
      case "lightauto": {
        const lead = this._lightLead(s.sel);
        const pos = this.work.positions[lead];
        if (pos && pos.light) this._change(() => delete pos.light.color);
        break;
      }
      case "splitopen":
        s.splitOpen = s.sel;
        this._render();
        break;
      case "splitplace":
        s.placingBox = `${s.sel}|${el.dataset.id}`;
        s.placing = null;
        this._render();
        break;
      case "splitdel": {
        const key = el.dataset.id;
        const of = this.work.positions[key] && this.work.positions[key].of;
        this._change(() => delete this.work.positions[key]);
        const it = this.byId.get(key);
        if (it && it.split) { this.byId.delete(key); this.devices = this.devices.filter((x) => x !== it); }
        if (s.sel === key) s.sel = of || null;
        this._toast("Back to the device: it shows at the device's spot");
        break;
      }
      case "boxadd":
        s.placingBox = s.sel;
        s.placing = null;
        this._render();
        break;
      case "boxcancel":
        s.placingBox = null;
        this._render();
        break;
      case "boxdel": {
        const sel = s.sel;
        this._change(() => delete this.work.positions[sel].box);
        this._toast("Box / radio spot removed");
        break;
      }
      case "skipint": {
        const integ = el.dataset.int;
        const ids = this.devices.filter((x) => !x.loose && x.integration === integ && !this.skipped.has(x.id) && !(this.work && this.work.positions[x.id])).map((x) => x.id);
        if (!ids.length) break;
        this._pushUndo();
        await this._setSkipped(ids, true);
        s.sel = null;
        this._render();
        this._toast(`${ids.length} devices from ${this._intName(integ)} skipped. Devices already on the plan were kept.`);
        break;
      }
      case "clearf":
        this._fresh = null;
        Object.assign(s, { conn: [], type: [], status: [], pop: null });
        this._render();
        break;
      case "clearall":
        this._fresh = null;
        Object.assign(s, { conn: [], type: [], status: [], q: "", pop: null });
        this._render();
        break;
      case "shownew":
        Object.assign(s, { status: ["new"], pop: null });
        this._render();
        break;
      case "group": {
        const key = el.dataset.key;
        s.collapsed[key] = el.dataset.open === "1";
        this._render();
        break;
      }
      case "pick":
        this._pickDevice(id);
        break;
      case "ebond": {
        // 0.11: one more grid meter seated at the panel (a normal bond: it stays a full device).
        const lead = this._eReal("__energy_panel");
        const m = this.byId.get(id);
        if (lead && m && this.work.positions[lead.id]) {
          this._change(() => {
            this._placeAt(m.id, this.work.positions[lead.id]);
            this._bond(m.id, lead.id);
          });
          this._toast(`${m.name} bonded to the panel`);
        }
        break;
      }
      case "ereplace": {
        // 0.11: the real device takes the dummy point's place; the point goes.
        const real = this._eReal(id);
        const pos = this.work.anchors[id];
        if (real && pos) {
          this._change(() => {
            this._placeAt(real.id, pos);
            delete this.work.anchors[id];
          });
          this._toast(`${real.name} is now the ${EPTS[id][0].toLowerCase()} point`);
        }
        break;
      }
      case "pickroom":
        Object.assign(s, { placingRoom: id, placing: null });
        this._render();
        break;
      case "ignore": {
        if (s.placingRoom === id) s.placingRoom = null;
        const placed = Object.keys(this.work.positions).filter((x) => (this.byId.get(x) || {}).area_id === id);
        if (placed.length) {
          s.dialog = { type: "hideroom", area: id, ids: placed };
          this._render();
          break;
        }
        this._change(() => {
          if (!this.work.hidden_rooms.includes(id)) this.work.hidden_rooms.push(id);
          delete this.work.anchors[id];
        });
        break;
      }
      case "unignore":
        this._change(() => {
          this.work.hidden_rooms = this.work.hidden_rooms.filter((x) => x !== id);
        });
        break;
      case "unpin":
        this._change(() => delete this.work.anchors[id]);
        break;
      case "picoff": {
        const bp = this._bodyRec(this.s.sel);
        if (bp) this._change(() => delete bp.pic);
        break;
      }
      case "piclookreset": {
        const bp = this._bodyRec(this.s.sel);
        if (bp && bp.pic) this._change(() => delete bp.pic.looks);
        break;
      }
      case "bondlights": {
        const b = this._bondOf(s.sel);
        if (!b) break;
        const meta = { ...this._bondMeta(b[0]) };
        if (el.dataset.v === "lamp") meta.lights = "lamp";
        else delete meta.lights;
        s.lampOf = null;
        this._change(() => (this.work.bond_meta = { ...(this.work.bond_meta || {}), [b[0]]: meta }));
        break;
      }
      case "lampof":
        s.lampOf = el.dataset.m;
        this._render();
        break;
      case "picprev":
        this.s.picPrev = el.dataset.v || "on";
        this._render();
        break;
      case "picgrid":
        this.s.picGrid = !this.s.picGrid;
        this._render();
        break;
      case "picpick": {
        const bid = this._bodyId(this.s.sel);
        this.s.picGrid = false;
        if (!el.dataset.src) {
          const bp = this._bodyRec(bid);
          if (bp) this._change(() => delete bp.pic);
        } else this._setPic(bid, el.dataset.src);
        break;
      }
      case "picup": {
        const bid = this._bodyId(this.s.sel);
        const f = this.shadowRoot.getElementById("picfile");
        if (f) {
          f.onchange = () => this._uploadPic(bid, f.files && f.files[0]);
          f.click();
        }
        break;
      }
      case "picdel": {
        const name = String(el.dataset.src || "").split("/").pop();
        this._ws("pictures/delete", { name })
          .then((r) => {
            this._ownPics = r.pictures || [];
            this._render();
          })
          .catch((err) => this._saveError(err));
        break;
      }
      case "touchon": {
        const bp = this._bodyRec(this.s.sel);
        if (bp) this._change(() => (bp.touch = { w: 6, h: 4 }));
        break;
      }
      case "touchoff": {
        const bp = this._bodyRec(this.s.sel);
        if (bp) this._change(() => delete bp.touch);
        break;
      }
      case "info":
        this._moreInfo(id);
        break;
      case "locate":
        this._locate(id);
        break;
      case "desel":
        s.sel = null;
        s.placing = null;
        this._render();
        break;
      case "unbond": {
        const sel = s.sel;
        this._change(() => this._unbond(sel));
        this._toast("Unbonded: it has its own marker again");
        break;
      }
      case "bout": {
        const b = this._bondOf(id);
        const d = this.byId.get(id);
        this._change(() => this._unbond(id));
        if (b && !this._bondOf(s.sel)) s.memberView = null;
        if (s.sel === id && this._bondOf(b ? b[1].find((m) => m !== id) : null)) s.sel = this._bondLeader(b[1].find((m) => m !== id));
        this._render();
        this._toast(`${d ? d.name : "Device"} left the bond · same spot, its own device`);
        break;
      }
      case "unbondall": {
        const b = this._bondOf(s.sel);
        if (!b) break;
        this._change(() => {
          delete this.work.bonds[b[0]];
          if (this.work.bond_meta) delete this.work.bond_meta[b[0]];
        });
        s.memberView = null;
        this._render();
        this._toast(`Unbonded: ${b[1].length} devices, each on its own, same spot`);
        break;
      }
      case "bondask":
        s.dialog = { type: "bondask", a: s.sel, b: id };
        this._render();
        break;
      case "bondyes": {
        const dl = s.dialog;
        s.dialog = null;
        if (!dl) break;
        const target = this._bondLeader(dl.b);
        const ids = (this._bondOf(dl.a) || [null, [dl.a]])[1].filter((m) => m !== target && this.work.positions[m]);
        this._change(() => {
          for (const m of ids) this._bond(m, target);
        });
        s.sel = this._bondLeader(target);
        s.memberView = null;
        const n = ((this._bondOf(target) || [null, []])[1]).length;
        this._render();
        this._toast(`Bonded: ${n} together · one device on the card`);
        break;
      }
      case "bondno":
        s.dialog = null;
        this._render();
        this._toast("Kept separate: same spot, not bonded", false);
        break;
      case "bondback":
        s.memberView = null;
        s.sel = this._bondLeader(s.sel);
        this._render();
        break;
      case "memopen":
        s.sel = id;
        s.memberView = id;
        this._render();
        break;
      case "selid":
        if (this.byId.get(id)) {
          s.sel = id;
          s.memberView = null;
          this._render();
        }
        break;
      case "more":
        s.more = !s.more;
        lsSet("more", s.more);
        this._render();
        break;
      case "itip":
        s.itip = s.itip === el.dataset.key ? null : el.dataset.key;
        this._render();
        break;
      case "stackpick":
        s.stack = null;
        s.sel = id;
        s.memberView = null;
        this._render();
        break;
      case "stackfan":
        s.stack = null;
        s.fan = id;
        this._render();
        break;
      case "nightprev":
        s.nightPrev = !s.nightPrev;
        this._render();
        break;
      case "applas": {
        const pos = this.work.positions[this._bondLeader(s.sel)];
        if (pos) this._change(() => {
          pos.as = el.dataset.as;
          if (el.dataset.as === "none_appl" && pos.light && ["drum", "line"].includes(pos.light.type)) delete pos.light;
        });
        break;
      }
      case "lighttype": {
        const lead = this._lightLead(s.sel);
        const pos = this.work.positions[lead];
        if (!pos) break;
        const t = el.dataset.type;
        const keep = pos.light && pos.light.type === t ? pos.light : this._defaultShape(t, this._isLamp(s.sel));
        this._change(() => {
          pos.light = { ...keep, type: t };
          if (t === "strip" && pos.light.x2 == null) Object.assign(pos.light, { x2: clamp(pos.x + 8, 0, 100), y2: pos.y });
          if ((t === "screen" || t === "line") && pos.light.x2 == null) Object.assign(pos.light, { x1: clamp(pos.x - 3, 0, 100), y1: pos.y, x2: clamp(pos.x + 3, 0, 100), y2: pos.y });
          if (t === "panel" && pos.light.h == null) pos.light.h = pos.light.w * this._ratio();
          if (t === "xmas" && !pos.light.lay) Object.assign(pos.light, { lay: "line", pts: [[clamp(pos.x - 6, 0, 100), pos.y], [clamp(pos.x + 6, 0, 100), pos.y]], r: pos.light.r || 5 });
        });
        break;
      }
      case "spinreset": {
        const body = this._bodyRec(s.sel);
        if (!body || !body.pic || !body.pic.hl) break;
        this._change(() => {
          delete body.pic.hl.ox;
          delete body.pic.hl.oy;
        });
        break;
      }
      case "xtree": {
        const body = this._bodyRec(s.sel);
        const pos = this.work.positions[this._lightLead(s.sel)];
        if (!body || !body.pic || !pos) break;
        // 0.13.7: lights scattered through the tree, inside its outline (the tree's radius is half its width).
        this._change(() => (pos.light = { type: "xmas", lay: "scatter", cx: body.x, cy: body.y, r: Math.round(body.pic.w * 0.38 * 1000) / 1000, bulb: "multi", cm: 5, fx: "twinkle", sp: "normal" }));
        this._toast("Christmas lights added on the tree: they light up with the plug or light", false);
        break;
      }
      case "xlay":
      case "xbulb":
      case "xfx":
      case "xsp":
      case "xpt": {
        const pos = this.work.positions[this._lightLead(s.sel)];
        if (!pos || !pos.light || pos.light.type !== "xmas") break;
        const key = { xlay: "lay", xbulb: "bulb", xfx: "fx", xsp: "sp" }[act];
        this._change(() => {
          const L = pos.light;
          if (key) L[key] = el.dataset.v;
          if (act === "xlay" && el.dataset.v !== "line") L.r = L.r || 5;
          if (act === "xlay" && el.dataset.v === "line" && !(L.pts || []).length) L.pts = [[clamp(pos.x - 6, 0, 100), pos.y], [clamp(pos.x + 6, 0, 100), pos.y]];
          if (act === "xpt") {
            const P = L.pts || [];
            if (el.dataset.v === "del" && P.length > 2) P.pop();
            if (el.dataset.v === "add") {
              const [x1, y1] = P[P.length - 2] || [pos.x - 6, pos.y];
              const [x2, y2] = P[P.length - 1] || [pos.x + 6, pos.y];
              P.push([clamp(x2 + (x2 - x1) * 0.5, 0, 100), clamp(y2 + (y2 - y1) * 0.5 + (x1 === x2 && y1 === y2 ? 3 : 0), 0, 100)]);
            }
            L.pts = P;
          }
        });
        break;
      }
      case "phnew": {
        const pid = `p${Date.now().toString(36)}`;
        const n = Object.keys(this.work.phantoms || {}).length + 1;
        const x = clamp((50 - s.tx) / s.z, 4, 96);
        const y = clamp((50 - s.ty) / s.z, 4, 96);
        this._change(() => (this.work.phantoms = { ...(this.work.phantoms || {}), [pid]: { name: n > 1 ? `Phantom ${n}` : "Phantom", x, y, members: [] } }));
        s.sel = `ph:${pid}`;
        this._render();
        this._toast("New phantom: drag devices that are already on the plan onto it", false);
        break;
      }
      case "phoutbond": {
        const ph = (this.work.phantoms || {})[String(s.sel).slice(3)];
        const mem = ((this.work.bonds || {})[id]) || [];
        if (ph) this._change(() => (ph.members = (ph.members || []).filter((m) => !mem.includes(m))));
        break;
      }
      case "phout": {
        const ph = (this.work.phantoms || {})[String(s.sel).slice(3)];
        if (ph) this._change(() => (ph.members = (ph.members || []).filter((m) => m !== id)));
        break;
      }
      case "phdel": {
        const pid = String(s.sel).slice(3);
        const ph = (this.work.phantoms || {})[pid];
        this._change(() => delete this.work.phantoms[pid]);
        s.sel = null;
        this._render();
        this._toast(`Phantom ${ph ? ph.name : ""} deleted · its devices are not touched`);
        break;
      }
      case "confirm":
        this._change(() => {
          delete this.work.positions[s.sel].approx;
          this._syncBond(s.sel);
        });
        break;
      case "placeit":
        s.placing = s.sel;
        this._render();
        break;
      case "movehere":
        await this._moveHere(s.sel);
        break;
      case "glue": {
        const res = glueShapes(this.work.shapes || {}, this._ratio());
        if (!res.moved) {
          this._toast("Nothing to glue: no Room shapes overlap", false);
          break;
        }
        this._change(() => (this.work.shapes = { ...this.work.shapes, ...res.shapes }));
        s.glued = res.moved;
        s.glueLog = res.pairs;
        s.glueLines = res.lines;
        this._render();
        break;
      }
      case "gluefocus": {
        const k = el.dataset.k;
        s.glueFocus = k;
        const st = (this._glueState().strips || []).find((x) => x.key === k);
        if (st) {
          const cx = st.pts.reduce((t, q) => t + q[0], 0) / st.pts.length;
          const cy = st.pts.reduce((t, q) => t + q[1], 0) / st.pts.length;
          this._centerOn(cx, cy, 2.5);
        }
        this._render();
        break;
      }
      case "glueundo":
        this._undoAct();
        s.glued = 0;
        this._render();
        break;
      case "glueok":
        s.glued = 0;
        this._render();
        break;
      case "zhabond": {
        const d = this.byId.get(s.sel);
        const mem = this._zhaGroupsOf(d) || [];
        const ids = [d.id, ...mem];
        const target = ids.find((id) => this.work.positions[id]);
        if (!target) {
          this._toast("Place the group or one of its devices first", false);
          break;
        }
        this._change(() => {
          for (const id of ids) {
            const tb = this._bondOf(target);
            if (id !== target && !(tb && tb[1].includes(id))) this._bond(id, target);
          }
        });
        this._toast(`Bonded: ${ids.length} as one marker`);
        this._render();
        break;
      }
      case "snapwall": {
        const sp = this._wallSpot(s.sel);
        if (sp) {
          const ids = this._stackOf(s.sel);
          this._change(() => ids.forEach((id) => this._moveTo(id, sp.x, sp.y)));
          this._toast(ids.length > 1 ? `Snapped to the wall: ${ids.length} devices` : "Snapped to the wall");
        }
        this._render();
        break;
      }
      case "remove": {
        const d = this.byId.get(s.sel);
        const sel = s.sel;
        const wb = this._bondOf(sel);
        if (wb && s.memberView !== sel) {
          this._change(() => {
            for (const m of wb[1]) delete this.work.positions[m];
            delete this.work.bonds[wb[0]];
          });
          s.sel = null;
          this._render();
          this._toast(`${this._bondName(wb)} taken off the plan`);
          break;
        }
        this._change(() => {
          for (const k of this._splitSpots(sel)) delete this.work.positions[k];
          this._unbond(sel);
          delete this.work.positions[sel];
        });
        s.sel = d ? sel : null;
        this._render();
        this._toast(`${d ? d.name : "Removed device"} taken off the plan`);
        break;
      }
      case "skipone": {
        const d = this.byId.get(s.sel);
        const snap = this._snap();
        this._pushUndo(snap);
        await this._setSkipped([d.id], true);
        s.sel = null;
        this._render();
        this._toast(`${d.name} skipped`);
        break;
      }
      case "unskip":
        await this._unskip(s.sel);
        break;
      case "skipall":
        await this._skipShown();
        break;
      case "autoplace":
        this._autoPlace();
        break;
      case "devpage":
        this._navigate(`/config/devices/device/${s.sel}`);
        break;
      case "front":
      case "back":
        this._zOrder(s.sel, act === "front");
        break;
      case "zoomin":
      case "zoomout": {
        // Zoom around what you're working on (measuring point, selected marker), else the centre.
        const f = this._focusPoint();
        const nz = Math.round(this._zt() * 4) / 4 + (act === "zoomin" ? 0.25 : -0.25);
        this._zoomTo(nz, f ? s.tx + f.x * s.z : undefined, f ? s.ty + f.y * s.z : undefined);
        break;
      }
      case "zoomfit":
        this._zoomTo(1);
        break;
      case "setscale":
        this._applyScale();
        break;
      case "justmeasure":
        s.skipAuto = true;
        s.ask = false;
        this._render();
        break;
      case "cancelline":
        Object.assign(s, { m1: null, m2: null, mh: null, ask: false, skipAuto: false, lenInput: "" });
        this._render();
        break;
      case "usescale": {
        const m = this._distM(s.m1, s.m2);
        s.ask = true;
        s.lenInput = m ? m.toFixed(2) : "";
        this._render();
        break;
      }
      case "toastundo":
        this._undoAct();
        break;
      case "toastclose":
        s.toast = null;
        this._renderToast();
        break;
      default:
        break;
    }
  },
});
