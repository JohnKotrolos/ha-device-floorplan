Object.assign(DeviceFloorplanPanel.prototype, {

  async _dashboards() {
    let list = [];
    try {
      list = await this._hass.callWS({ type: "lovelace/dashboards/list" });
    } catch (_e) {
      list = [];
    }
    return [{ key: "", url_path: null, title: "Overview", mode: "storage" }]
      .concat(list.map((d) => ({ key: d.url_path, url_path: d.url_path, title: d.title || d.url_path, mode: d.mode })))
      .concat([{ key: "__new", url_path: null, title: "+ New dashboard “Floorplan”", mode: "new" }]);
  },

  _dashPath(dash, view, index) {
    return `/${dash.url_path || "lovelace"}/${view && view.path ? view.path : index}`;
  },

  /** Is there already a Device Floorplan card for this plan on a dashboard? */
  async _findDash(planId) {
    for (const dash of await this._dashboards()) {
      if (dash.mode === "yaml") continue;
      let cfg;
      try {
        cfg = await this._hass.callWS({ type: "lovelace/config", url_path: dash.url_path });
      } catch (_e) {
        continue;
      }
      const views = (cfg && cfg.views) || [];
      for (let i = 0; i < views.length; i++) {
        const txt = JSON.stringify(views[i]);
        if (txt.includes("custom:device-floorplan-card") && txt.includes(`"plan":"${planId}"`)) {
          return { title: dash.title, path: this._dashPath(dash, views[i], i) };
        }
      }
    }
    return null;
  },

  async _openAddDash(from = null) {
    await this._flushSave();
    this.s.dialog = { type: "adddash", where: "new", key: "", from };
    this._render();
    const dashboards = await this._dashboards();
    if (!this.s.dialog || this.s.dialog.type !== "adddash") return;
    this.s.dialog.dashboards = dashboards;
    await this._loadDashCfg("");
    // Overview is often generated automatically by HA: then offer a new dashboard instead.
    const d = this.s.dialog;
    if (d && d.type === "adddash" && d.cfgError) {
      await this._loadDashCfg("__new");
      d.note = "Your Overview is generated automatically by Home Assistant, so a new “Floorplan” dashboard will be created (it shows up in the sidebar).";
      this._render();
    }
  },

  async _loadDashCfg(key) {
    const d = this.s.dialog;
    const dash = d.dashboards.find((x) => x.key === key) || d.dashboards[0];
    Object.assign(d, { key: dash.key, config: null, cfgError: null, err: null, note: null });
    this._render();
    if (dash.mode === "new") {
      Object.assign(d, { config: { views: [] }, where: "new" });
      return this._render();
    }
    if (dash.mode === "yaml") {
      d.cfgError = "This dashboard is managed in YAML.";
      return this._render();
    }
    try {
      const cfg = await this._hass.callWS({ type: "lovelace/config", url_path: dash.url_path });
      if (!cfg || cfg.strategy) d.cfgError = "Home Assistant generates this dashboard automatically (you haven't taken control of it), so the card can't be added for you.";
      else d.config = cfg;
    } catch (err) {
      d.cfgError = err && err.code === "config_not_found" ? "Home Assistant generates this dashboard automatically (you haven't taken control of it), so the card can't be added for you." : `Could not open this dashboard (${errText(err)}).`;
    }
    d.view = this._firstFreeView();
    this._render();
  },

  _firstFreeView() {
    const d = this.s.dialog;
    const views = (d && d.config && d.config.views) || [];
    const i = views.findIndex((v) => v.type !== "panel");
    return i < 0 ? 0 : i;
  },

  async _addToDashboard() {
    const d = this.s.dialog;
    const plan = this._plan();
    const dash = d.dashboards.find((x) => x.key === d.key);
    const cfg = clone(d.config);
    cfg.views = cfg.views || [];
    const card = { type: "custom:device-floorplan-card", plan: plan.id };
    let index;
    let urlPath = dash.url_path;
    if (dash.mode === "new") {
      const existing = new Set(d.dashboards.map((x) => x.url_path).filter(Boolean));
      urlPath = "home-floorplan";
      for (let n = 2; existing.has(urlPath); n++) urlPath = `home-floorplan-${n}`;
    }
    if (d.where === "view") {
      index = Number(d.view) || 0;
      const view = cfg.views[index];
      if (!view || view.type === "panel") {
        d.err = "Choose a view that is not a full-width view.";
        return this._render();
      }
      if (view.type === "sections" || Array.isArray(view.sections)) {
        view.sections = view.sections || [];
        if (!view.sections.length) view.sections.push({ type: "grid", cards: [] });
        const sec = view.sections[view.sections.length - 1];
        sec.cards = sec.cards || [];
        sec.cards.push({ ...card, grid_options: { columns: "full" } });
      } else {
        view.cards = view.cards || [];
        view.cards.push(card);
      }
    } else {
      const used = new Set(cfg.views.map((v) => v.path));
      let path = `floorplan-${plan.id}`.replace(/_/g, "-");
      for (let n = 2; used.has(path); n++) path = `floorplan-${plan.id}-${n}`.replace(/_/g, "-");
      // No icon: HA then shows the title, so several floor views can be told apart.
      cfg.views.push({ title: plan.name, path, type: "panel", cards: [card] });
      index = cfg.views.length - 1;
    }
    d.busy = true;
    this._render();
    try {
      if (dash.mode === "new") {
        await this._hass.callWS({ type: "lovelace/dashboards/create", url_path: urlPath, title: "Floorplan", icon: "mdi:floor-plan", mode: "storage", show_in_sidebar: true, require_admin: false });
      }
      await this._hass.callWS({ type: "lovelace/config/save", url_path: urlPath, config: cfg });
      const target = { ...dash, url_path: urlPath, title: dash.mode === "new" ? "Floorplan" : dash.title };
      const view = cfg.views[index];
      this.s.dialog = {
        type: "added",
        title: target.title,
        path: this._dashPath(target, view, index),
        view: view.title || view.path || `View ${index + 1}`,
        viewNew: d.where !== "view",
        newDash: dash.mode === "new",
      };
      lsSet(`readysnap_${plan.id}`, this._readySnap());
      this._render();
    } catch (err) {
      d.busy = false;
      d.err = errText(err);
      this._render();
    }
  },

  // ---------------------------------------------------------------- export / import
  _planRows() {
    const plan = this._plan();
    const sc = this._scale();
    const rows = [];
    for (const [id, pos] of Object.entries(this.work.positions)) {
      const d = this.byId.get(id);
      rows.push({
        id,
        d,
        pos,
        xm: sc.x && plan.width ? ((pos.x / 100) * plan.width * sc.x) : null,
        ym: sc.y && plan.height ? ((pos.y / 100) * plan.height * sc.y) : null,
      });
    }
    return rows;
  },

  async _export(fmt) {
    const plan = this._plan();
    const slug = plan.id;
    try {
      if (fmt === "csv") {
        const q = (v) => {
          const t = v === null || v === undefined ? "" : String(v);
          return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const head = ["name", "device_id", "area", "plan", "type", "connection", "manufacturer", "model", "x_percent", "y_percent", "x_m", "y_m", "status", "main_entity", "box_x_percent", "box_y_percent"];
        const lines = [head.join(",")];
        for (const r of this._planRows()) {
          const d = r.d || {};
          lines.push([d.name || "(removed device)", r.id, d.area_name, plan.name, d.category || d.group ? (GROUPS[d.category || d.group] || GROUPS.other)[0] : "", (d.conns || []).map((c) => (CONN[c] || CONN.other).label).join(" + "), d.manufacturer, d.model, r.pos.x.toFixed(2), r.pos.y.toFixed(2), r.xm != null ? r.xm.toFixed(2) : "", r.ym != null ? r.ym.toFixed(2) : "", r.pos.approx ? "approximate" : "placed", this.mainEntity[r.id] || d.main_entity || "", r.pos.box ? r.pos.box.x.toFixed(2) : "", r.pos.box ? r.pos.box.y.toFixed(2) : ""].map(q).join(","));
        }
        download(`device-floorplan-${slug}.csv`, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
      } else if (fmt === "json") {
        let image = null;
        const src = this._imgSrc(plan);
        if (src) {
          const blob = await (await fetch(src)).blob();
          image = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
        }
        const out = {
          format: "device_floorplan_plan",
          version: 1,
          exported: new Date().toISOString(),
          plan: {
            name: plan.name,
            kind: plan.kind,
            floor_id: plan.floor_id,
            level: plan.level,
            image_type: plan.image_type,
            width: plan.width,
            height: plan.height,
            refs: this.work.refs,
            hidden_rooms: this.work.hidden_rooms.map((a) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a })),
            anchors: Object.entries(this.work.anchors).map(([a, p]) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a, x: p.x, y: p.y })),
            devices: this._planRows().map((r) => ({ device_id: r.id, name: r.d ? r.d.name : null, ieee: r.d ? r.d.ieee : null, mac: r.d ? r.d.mac : null, area: r.d ? r.d.area_name : null, x: r.pos.x, y: r.pos.y, approx: !!r.pos.approx, z: r.pos.z || 0, ...(r.pos.box ? { box: r.pos.box } : {}), ...(r.pos.light ? { light: r.pos.light } : {}), ...(r.pos.of ? { of: r.pos.of } : {}), ...(r.pos.as ? { as: r.pos.as } : {}), ...(r.pos.air ? { air: r.pos.air } : {}), ...(r.pos.label ? { label: r.pos.label } : {}), ...(r.pos.opening ? { opening: r.pos.opening } : {}) })),
            shapes: Object.entries(this.work.shapes || {}).map(([a, pts]) => ({ area_id: a, name: (this.areaById.get(a) || {}).name || a, points: pts })),
            bonds: Object.entries(this.work.bonds || {}).map(([id, m]) => ({ id, members: m, ...((this.work.bond_meta || {})[id] || {}) })),
            phantoms: Object.entries(this.work.phantoms || {}).map(([id, ph]) => ({ id, ...ph })),
          },
          image,
        };
        download(`device-floorplan-${slug}.json`, new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
      } else if (fmt === "png") {
        download(`device-floorplan-${slug}.png`, await this._renderPng());
      } else if (fmt === "md") {
        await this._flushSave();
        const r = await this._ws("ai_text", { plan_id: plan.id });
        download(`device-floorplan-${slug}-ai.md`, new Blob([r.text], { type: "text/markdown" }));
      }
      this.s.dialog = null;
      this._render();
      this._toast(`Exported ${fmt === "md" ? "AI description" : fmt.toUpperCase()}`, false);
    } catch (err) {
      this.s.dialog.err = `Export failed: ${errText(err)}`;
      this._render();
    }
  },

  async _renderPng() {
    const plan = this._plan();
    const src = this._imgSrc(plan);
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("could not load the plan image"));
      i.src = src;
    });
    const W = im.naturalWidth;
    const H = im.naturalHeight;
    const r = Math.max(9, Math.round(Math.max(W, H) / 90));
    const used = CONN_ORDER.filter((c) => this._planRows().some((x) => x.d && x.d.conns.includes(c)));
    const legendH = Math.round(r * 3.2);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H + legendH;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(im, 0, 0, W, H);
    for (const row of this._planRows()) {
      const x = (row.pos.x / 100) * W;
      const y = (row.pos.y / 100) * H;
      const c1 = row.d ? (CONN[row.d.conns[0]] || CONN.other).color : "#6b7280";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = Math.max(2, r / 4);
      g.strokeStyle = c1;
      g.setLineDash(row.pos.approx ? [r / 2, r / 3] : []);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(x, y, r / 3, 0, Math.PI * 2);
      g.fillStyle = c1;
      g.fill();
    }
    g.font = `${Math.round(r * 1.2)}px Roboto, system-ui, sans-serif`;
    g.textBaseline = "middle";
    let lx = r;
    const ly = H + legendH / 2;
    g.fillStyle = "#1c1c1c";
    g.fillText(`${plan.name} · ${this._planRows().length} devices`, lx, ly);
    lx += g.measureText(`${plan.name} · ${this._planRows().length} devices`).width + r * 2;
    for (const c of used) {
      g.beginPath();
      g.arc(lx + r / 2, ly, r / 2, 0, Math.PI * 2);
      g.strokeStyle = CONN[c].color;
      g.lineWidth = Math.max(2, r / 5);
      g.stroke();
      g.fillStyle = "#1c1c1c";
      g.fillText(CONN[c].label, lx + r * 1.4, ly);
      lx += r * 2.4 + g.measureText(CONN[c].label).width;
    }
    return await new Promise((res) => cv.toBlob(res, "image/png"));
  },

  async _importPlan(file) {
    if (!file) return;
    const f = this.s.form || (this.s.form = {});
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== "device_floorplan_plan" || !data.plan) throw new Error("This is not a Device Floorplan plan file");
      const P = data.plan;
      const floorOk = P.floor_id && this.floors.some((x) => x.floor_id === P.floor_id) && !this.plans.some((x) => x.floor_id === P.floor_id);
      let name = P.name || "Imported plan";
      const body = { name, image_type: P.image_type === "angled" ? "angled" : "top" };
      if (P.kind === "view") Object.assign(body, { kind: "view" });
      else if (floorOk) Object.assign(body, { kind: "floor", floor_id: P.floor_id });
      else {
        let lv = Number.isInteger(P.level) ? P.level : 0;
        while (this.plans.some((x) => x.kind === "floor" && x.level === lv)) lv++;
        Object.assign(body, { kind: "floor", floor_id: null, level: lv });
      }
      f.busy = true;
      this._render();
      const plan = await this._ws("plan/create", body);
      this.plans.push(plan);
      if (data.image) {
        const blob = await (await fetch(data.image)).blob();
        const ext = blob.type || "image/png";
        await this._uploadFile(plan, new File([blob], `plan.${ext.split("/")[1] || "png"}`, { type: ext }), true);
      }
      // Map devices: same id, else Zigbee IEEE, else MAC, else exact name.
      const positions = {};
      const idMap = {};
      let matched = 0;
      let missing = 0;
      const extra = (dv) => ({ ...(dv.approx ? { approx: true } : {}), ...(dv.z ? { z: dv.z } : {}), ...(dv.box ? { box: dv.box } : {}), ...(dv.light ? { light: dv.light } : {}), ...(dv.as ? { as: dv.as } : {}), ...(dv.air ? { air: dv.air } : {}), ...(dv.label ? { label: dv.label } : {}), ...(dv.opening ? { opening: dv.opening } : {}) });
      const spots = [];
      for (const dv of P.devices || []) {
        // 0.7.0: split spots and entities placed on their own come back when the entity exists here.
        if (String(dv.device_id).startsWith("entity:")) {
          if (this._hass && this._hass.states[dv.device_id.slice(7)]) spots.push(dv);
          else missing++;
          continue;
        }
        let d = this.byId.get(dv.device_id);
        if (!d && dv.ieee) d = this.devices.find((x) => x.ieee === dv.ieee);
        if (!d && dv.mac) d = this.devices.find((x) => x.mac === dv.mac);
        if (!d && dv.name) d = this.devices.find((x) => x.name === dv.name);
        if (!d) {
          missing++;
          continue;
        }
        matched++;
        idMap[dv.device_id] = d.id;
        positions[d.id] = { x: dv.x, y: dv.y, ...extra(dv) };
      }
      for (const dv of spots) {
        const of = dv.of ? idMap[dv.of] : null;
        if (dv.of && !of) {
          missing++;
          continue;
        }
        matched++;
        positions[dv.device_id] = { x: dv.x, y: dv.y, ...(of ? { of } : {}), ...extra(dv) };
      }
      // 0.7.2: "Next to" links follow their matched spots.
      for (const pos of Object.values(positions)) if (pos.opening && pos.opening.link) {
        const to = String(pos.opening.link).startsWith("entity:") ? pos.opening.link : idMap[pos.opening.link];
        if (to && positions[to]) pos.opening.link = to;
        else delete pos.opening;
      }
      // Bonds and phantoms (0.5.0) follow their matched devices.
      const bonds = {};
      const bondMeta = {};
      for (const b of P.bonds || []) {
        const m = (b.members || []).map((x) => idMap[x]).filter(Boolean);
        if (m.length < 2) continue;
        bonds[b.id] = m;
        const meta = {};
        for (const k of ["name", "icon", "tap", "show"]) if (b[k]) meta[k] = b[k];
        if (Object.keys(meta).length) bondMeta[b.id] = meta;
      }
      const phantoms = {};
      for (const ph of P.phantoms || []) {
        const { id, ...rest } = ph;
        phantoms[id] = { ...rest, members: (ph.members || []).map((x) => idMap[x]).filter(Boolean), ...(ph.one ? { one: idMap[ph.one] } : {}) };
      }
      const areaFor = (a) => (this.areaById.get(a.area_id) ? a.area_id : (this.areas.find((x) => x.name === a.name) || {}).area_id);
      const anchors = {};
      for (const a of P.anchors || []) {
        const id = areaFor(a);
        if (id) anchors[id] = { x: a.x, y: a.y };
      }
      const hidden = (P.hidden_rooms || []).map(areaFor).filter(Boolean);
      const shapes = {};
      for (const a of P.shapes || []) {
        const id = areaFor(a);
        if (id && Array.isArray(a.points)) shapes[id] = a.points;
      }
      const res = await this._ws("plan/update", { plan_id: plan.id, positions, anchors, shapes, refs: (P.refs || []).slice(0, 2), hidden_rooms: hidden, bonds, bond_meta: bondMeta, phantoms });
      Object.assign(plan, res);
      this.plans.sort((a, b) => this._planOrder(a) - this._planOrder(b));
      this.s.dialog = null;
      this.s.form = null;
      this._openPlan(plan.id);
      this.s.tool = "place";
      this._render();
      this._toast(`Imported “${name}”: ${matched} device${matched === 1 ? "" : "s"} matched${missing ? `, ${missing} not found here` : ""}.`, false);
    } catch (err) {
      f.busy = false;
      f.err = `Import failed: ${errText(err)}`;
      this._render();
    }
  },

  _saveRefLen() {
    const s = this.s;
    const i = s.refSel;
    const L = parseFloat(String(s.refLen).replace(",", "."));
    if (i === null || i === undefined || !(L > 0) || !this.work.refs[i]) return;
    this._change(() => {
      this.work.refs[i].length = L;
    });
    s.refSel = null;
    this._render();
  },
});

if (!customElements.get("device-floorplan-panel")) customElements.define("device-floorplan-panel", DeviceFloorplanPanel);
window.__DEVICE_FLOORPLAN_VERSION__ = VERSION;
