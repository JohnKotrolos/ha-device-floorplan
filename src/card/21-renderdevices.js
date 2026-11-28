Object.assign(DeviceFloorplanCardEditor.prototype, {

  // ---- devices (#52)
  _renderDevices() {
    const box = this.querySelector("#devs");
    if (!box) return;
    const p = this._plan();
    const fov = this.querySelector("#fov");
    if (!p) {
      box.innerHTML = `<p>Choose a plan first.</p>`;
      return;
    }
    const a = p.attributes;
    const eng = this._engine();
    const ovs = eng._overlays().filter((o) => o !== "plan");
    if (fov) {
      if (this._fov && !ovs.includes(this._fov)) this._fov = "";
      fov.innerHTML = `<option value="">All overlays</option>${ovs.map((o) => `<option value="${cesc(o)}" ${this._fov === o ? "selected" : ""}>Only in ${cesc(eng._ovDef(o).label)}</option>`).join("")}`;
    }
    const items = eng._items(a).map((it) => ({ ...it, label: it.bond || (it.parts && it.parts.length) ? `${it.name} (bonded)` : it.phantom ? `${it.name} (phantom)` : it.name }));
    // 0.10: robots on the plan's robot list but not placed: their name and icon are set here too.
    const known = new Set(items.flatMap((it) => [it.main_entity, ...(it.entities || [])]));
    for (const eid of Object.keys(a.robots || {})) {
      if (known.has(eid) || !this._hass.states[eid]) continue;
      const nm = this._hass.states[eid].attributes.friendly_name || eid;
      items.push({ id: `robot:${eid}`, name: nm, main_entity: eid, entities: [eid], label: `${nm} (robot)` });
    }
    items.sort((x, y) => x.label.localeCompare(y.label));
    const devs = this._config.devices || {};
    const info = (it) => ovs.map((o) => {
      const e = this._eng || eng; // fresh after each change
      let specs = [];
      try {
        specs = e._specsFor(it, o, true);
      } catch (_err) {
        specs = [];
      }
      const q = specs.length > 0 && !specs.every((s) => s.offlineOnly); // "only when offline" isn't worth an icon
      return { o, q, hidden: q && e._hidden(it, o) };
    }).filter((x) => x.q);
    const shown = items.filter((i) => (!this._flt || i.label.toLowerCase().includes(this._flt) || (devs[i.id] && (devs[i.id].name || "").toLowerCase().includes(this._flt))) && (!this._fov || info(i).some((x) => x.o === this._fov && !x.hidden)));
    box.innerHTML = shown.map((i) => {
      const o = devs[i.id] || {};
      const custom = Object.keys(o).length;
      const icons = info(i).map((x) => `<ha-icon class="${x.hidden ? "off" : ""}" icon="${cesc(eng._ovDef(x.o).icon)}" title="${cesc(eng._ovDef(x.o).label)}${x.hidden ? " (hidden)" : ""}"></ha-icon>`).join("");
      return `<div class="dev ${custom ? "custom" : ""}" data-id="${cesc(i.id)}"><button data-open="${cesc(i.id)}"><ha-icon icon="${cesc(o.icon || (this._open === i.id ? "mdi:chevron-down" : "mdi:chevron-right"))}"></ha-icon><span class="nm">${cesc(o.name || i.label)}</span><span class="ovs">${icons}</span></button>${this._open === i.id ? `<div class="body"></div>` : ""}</div>`;
    }).join("") || `<p>No devices match.</p>`;
    for (const b of box.querySelectorAll("[data-open]")) {
      b.addEventListener("click", () => {
        this._open = this._open === b.dataset.open ? null : b.dataset.open;
        this._renderDevices();
      });
    }
    const body = this._open && box.querySelector(`.dev[data-id="${CSS.escape(this._open)}"] .body`);
    if (!body) return;
    const item = items.find((x) => x.id === this._open);
    this._markerPanel(body, item, a, eng, ovs, {
      saved: () => {
        const row = box.querySelector(`.dev[data-id="${CSS.escape(item.id)}"]`);
        if (!row) return;
        const cur = (this._config.devices || {})[item.id] || {};
        row.querySelector(".nm").textContent = cur.name || item.label;
        row.querySelector(".ovs").innerHTML = info(item).map((x) => `<ha-icon class="${x.hidden ? "off" : ""}" icon="${cesc(eng._ovDef(x.o).icon)}"></ha-icon>`).join("");
      },
      rerender: () => this._renderDevices(),
    });
  },

  /** Save per-device card settings (devices.<id>), dropping empty values. */
  _saveDev(id, patch) {
    const cur = { ...((this._config.devices || {})[id] || {}), ...patch };
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (v === "" || v == null || v === false || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) delete cur[k];
    }
    const all = { ...(this._config.devices || {}) };
    if (Object.keys(cur).length) all[id] = cur;
    else delete all[id];
    this._config = this._prune({ ...this._config, devices: all });
    this._emit();
    this._engine(true);
  },

  _entName(e) {
    return entName(this._hass, e);
  },

  /** Save one overlay's settings of a device: devices.<id>.per.<ov> (#100/#101). */
  /** 0.12.5: "Shows as On when [entity] is [value]" and "Highlight when [entity] is [value] [x] only while On".
   *  The device's own entities first, by short name with their value; the values offered are the entity's real ones
   *  (now + the last 7 days); numbers get "above …". Stored as when / when_on / hl / hl_on / hl_any (Live). */
  _picBox(item, id, p0, done) {
    const hass = this._hass;
    const box = document.createElement("div");
    box.className = "picbox";
    const devIds = item.bond ? item.members || [] : [item.id];
    const reg = hass.entities || {};
    const devNames = devIds.map((d) => (hass.devices || {})[d]).filter(Boolean).map((dv) => dv.name_by_user || dv.name).filter(Boolean).sort((x, y) => y.length - x.length);
    const own = Object.values(reg).filter((r) => r.device_id && devIds.includes(r.device_id) && !r.hidden && hass.states[r.entity_id]).map((r) => r.entity_id);
    if (String(item.id).startsWith("entity:") && item.main_entity) own.push(item.main_entity);
    const short = (e) => {
      let n = entName(hass, e);
      for (const dn of devNames) if (n.toLowerCase().startsWith(dn.toLowerCase())) n = n.slice(dn.length).replace(/^[\s\-_·:]+/, "");
      return n || e;
    };
    const val = (e) => {
      const st = hass.states[e];
      if (!st) return "";
      const u = st.attributes.unit_of_measurement;
      return `${st.state}${u ? ` ${u}` : ""}`;
    };
    this._picVals = this._picVals || {};
    const values = (e) => {
      if (!e || !hass.states[e]) return [];
      if (!this._picVals[e]) {
        this._picVals[e] = [];
        hass
          .callWS({ type: "history/history_during_period", start_time: new Date(Date.now() - 7 * 864e5).toISOString(), entity_ids: [e], minimal_response: true, no_attributes: true, significant_changes_only: false })
          .then((r) => {
            this._picVals[e] = [...new Set(((r && r[e]) || []).map((x) => x.s))];
            done();
          })
          .catch(() => {});
      }
      return [...new Set([hass.states[e].state, ...this._picVals[e]])].filter((v) => v != null && !["unavailable", "unknown", ""].includes(v));
    };
    const sentence = (title, eKey, vKey, def) => {
      // 0.12.8: the picture has no "Follows" line: an entity picked there before (lead) is its "Shows as On when".
      const e = p0[eKey] || (eKey === "when" ? p0.lead || "" : "");
      const ents = [...new Set([...own, ...(e ? [e] : [])])].sort((x, y) => short(x).localeCompare(short(y)));
      const opts = ents.map((x) => `<option value="${cesc(x)}" ${x === e ? "selected" : ""}>${cesc(short(x))} · ${cesc(val(x))}</option>`).join("");
      const cur = e || def || "";
      const num0 = cur && hass.states[cur] && num(hass.states[cur].state);
      const v = p0[vKey] || "";
      const vals = cur ? values(cur) : [];
      const vsel = num0
        ? `<span class="pv">above <input type="number" data-pv="${vKey}" value="${cesc(v.startsWith(">") ? v.slice(1) : "")}" placeholder="0" style="width:6em"></span>`
        : `<select data-pv="${vKey}"><option value="">on / open / home… (automatic)</option>${vals.map((x) => `<option value="${cesc(x)}" ${x === v ? "selected" : ""}>${cesc(x)}</option>`).join("")}${v && !vals.includes(v) ? `<option value="${cesc(v)}" selected>${cesc(v)}</option>` : ""}</select>`;
      const defName = def ? `Automatic: ${short(def)} · ${val(def)}` : "Automatic: its own state";
      return `<div class="mpr pics"><span class="mpk">${title}</span>
        <select data-pe="${eKey}"><option value="">${eKey === "hl" ? "Automatic: while it is On" : cesc(defName)}</option><optgroup label="${cesc(devNames[0] || "This device")}">${opts}</optgroup><option value="__other">Another entity…</option></select>
        ${cur ? `<span class="pis">is</span>${vsel}` : ""}<div class="pother" data-po="${eKey}" hidden></div></div>`;
    };
    box.innerHTML = `${sentence("Shows as On when", "when", "when_on", item.main_entity || "")}
      ${sentence("Highlight when", "hl", "hl_on", "")}
      ${p0.hl ? `<label class="mpr mpsw"><span class="mpk">Only while it is On</span><input type="checkbox" data-pany ${p0.hl_any ? "" : "checked"}></label>` : ""}`;
    const save = (patch) => {
      this._savePer(id, "live", patch);
      done();
    };
    for (const sel of box.querySelectorAll("[data-pe]")) sel.addEventListener("change", () => {
      const k = sel.dataset.pe;
      const vk = k === "hl" ? "hl_on" : "when_on";
      if (sel.value === "__other") {
        const po = box.querySelector(`[data-po="${k}"]`);
        po.hidden = false;
        po.appendChild(this._form([{ name: "e", selector: { entity: {} } }], { e: "" }, { e: "Any entity" }, (v) => save({ [k]: v.e || "", [vk]: "", ...(k === "when" ? { lead: "" } : {}) })));
        return;
      }
      save({ [k]: sel.value, [vk]: "", ...(k === "when" ? { lead: "" } : {}) }); // 0.12.8: one place decides
    });
    for (const el of box.querySelectorAll("[data-pv]")) el.addEventListener("change", () => {
      const k = el.dataset.pv;
      save({ [k]: el.tagName === "INPUT" ? (el.value === "" ? "" : `>${el.value}`) : el.value });
    });
    const any = box.querySelector("[data-pany]");
    if (any) any.addEventListener("change", () => save({ hl_any: !any.checked }));
    return box;
  },

  _savePer(id, ov, patch) {
    const cur = (this._config.devices || {})[id] || {};
    const per = { ...(cur.per || {}) };
    const o = { ...(per[ov] || {}), ...patch };
    for (const k of Object.keys(o)) if (o[k] === "" || o[k] == null || o[k] === false || (Array.isArray(o[k]) && !o[k].length && k !== "extras") || (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k];
    if (Object.keys(o).length) per[ov] = o;
    else delete per[ov];
    this._saveDev(id, { per });
  },

  /** 0.12.6: a device's entities for the marker settings: its own (by short name, with value), the candidates. */
  _entTools(item) {
    const hass = this._hass;
    const devIds = item.bond ? item.members || [] : [item.id];
    const reg = hass.entities || {};
    const devNames = devIds.map((d) => (hass.devices || {})[d]).filter(Boolean).map((dv) => dv.name_by_user || dv.name).filter(Boolean).sort((x, y) => y.length - x.length);
    const own = Object.values(reg).filter((r) => r.device_id && devIds.includes(r.device_id) && !r.hidden && hass.states[r.entity_id]).map((r) => r.entity_id);
    const cands = item.phantom ? [] : [...new Set([...(item.entities || []), ...(item.allEntities || []), item.main_entity, ...own].filter((e) => e && hass.states[e]))];
    const short = (e) => {
      let n = entName(hass, e);
      for (const dn of devNames) if (n.toLowerCase().startsWith(dn.toLowerCase())) n = n.slice(dn.length).replace(/^[\s\-_·:]+/, "");
      return n || entName(hass, e) || e;
    };
    const val = (e) => {
      const st = hass.states[e];
      if (!st) return "—";
      if (NO_VALUE.has(domainOf(e))) return "no value";
      const u = st.attributes.unit_of_measurement;
      return `${st.state}${u ? ` ${u}` : ""}`;
    };
    const aux = (e) => this._engine()._aux(e);
    return { own, cands, short, val, aux, devName: devNames[0] || "" };
  },

  /** 0.12.6: one entity choice as a plain drop-down: the closed box always shows the current choice (or what
   *  "automatic" uses), entities by short name with their value, "Another entity…" for anything else. */
  _entSelect(T, { cur, autoText, list, none = null, onPick }) {
    const w = document.createElement("div");
    w.className = "mpsel";
    const ents = [...new Set([...list, ...(cur ? [cur] : [])])].sort((x, y) => T.short(x).localeCompare(T.short(y)));
    const head = none != null ? `<option value="">${cesc(none)}</option>` : `<option value="">${cesc(autoText || "Automatic")}</option>`;
    w.innerHTML = `<select>${head}${ents.map((e) => `<option value="${cesc(e)}" ${e === cur ? "selected" : ""}>${cesc(T.short(e))} · ${cesc(T.val(e))}</option>`).join("")}<option value="__other">Another entity…</option></select><div class="mpo" hidden></div>`;
    const sel = w.querySelector("select");
    sel.addEventListener("change", () => {
      if (sel.value === "__other") {
        const po = w.querySelector(".mpo");
        po.hidden = false;
        po.appendChild(this._form([{ name: "e", selector: { entity: {} } }], { e: "" }, { e: "Any entity" }, (v) => v.e && onPick(v.e)));
        return;
      }
      onPick(sel.value);
    });
    return w;
  },

  /** 0.12.6 marker settings (#108 reworked): overlay chips on top; the chosen overlay's settings as sentences that
   *  always show their current value ("automatic" says what it uses); then the settings for every overlay.
   *  Only settings that do something are shown, and they say what the plan really draws. */
  _markerPanel(body, item, a, eng, ovs, { saved = () => {}, rerender = () => {}, current = null, onOv = null } = {}) {
    const id = item.id;
    const hass = this._hass;
    const dev = () => (this._config.devices || {})[id] || {};
    const done = () => {
      saved();
      rerender();
    };
    const T = this._entTools(item);
    const name = dev().name || item.name;
    // Which overlays can show it: by their rules (hide), or by your choice (Live and own overlays: add).
    const stOf = (o) => {
      eng._ignoreAdded = true;
      let q = false;
      try {
        q = eng._qualifies(item, o, a);
      } finally {
        eng._ignoreAdded = false;
      }
      const def = eng._ovDef(o) || {};
      if (q) return eng._hidden(item, o) ? "hidden" : "shown";
      // 0.12.9: offered only when it has something to draw (not a dongle with settings entities only).
      if (o === "live" || def.custom) return eng._added(item, o) ? "added" : eng._addedLead(item) ? "off" : "na";
      return "na";
    };
    const avail = ovs.filter((o) => stOf(o) !== "na");
    let ov = this._mpOv && this._mpOv.id === id && !onOv ? this._mpOv.ov : current;
    if (!ov || !avail.includes(ov)) ov = (current && avail.includes(current) && current) || avail.find((o) => ["shown", "added"].includes(stOf(o))) || avail[0] || null;
    const pickOv = (o) => {
      if (onOv) return onOv(o);
      this._mpOv = { id, ov: o };
      rerender();
    };
    const per = () => (ov && (dev().per || {})[ov]) || {};
    body.innerHTML = "";
    const root = document.createElement("div");
    root.className = "mp";
    body.appendChild(root);
    const labelOf = (o) => (this._config.overlay_names || {})[o] || (eng._ovDef(o) || {}).label || o;
    const ST = { shown: "shown", hidden: "hidden here", added: "added by you", off: "not shown" };
    root.innerHTML = `<style>${MP_CSS}</style><div class="mpchips">${avail.map((o) => `<button class="mpc ${stOf(o)} ${o === ov ? "cur" : ""}" data-ov="${cesc(o)}" title="${cesc(`${labelOf(o)}: ${ST[stOf(o)]}`)}"><ha-icon icon="${cesc((eng._ovDef(o) || {}).icon || "mdi:layers")}"></ha-icon>${cesc(labelOf(o))}</button>`).join("") || `<p class="mpn">No overlay on this card shows this device.</p>`}</div>`;
    for (const b of root.querySelectorAll("[data-ov]")) b.addEventListener("click", () => pickOv(b.dataset.ov));
    // A sentence: label, the current value (with "automatic"), and its control under it.
    // 0.12.7: dd = a drop-down under it shows the value, so the label line keeps only the "automatic" tag.
    const row = (label, value, auto, ctrl, dd = false) => {
      const r = document.createElement("div");
      r.className = "mpr";
      r.innerHTML = `<div class="mpl"><span class="mpk">${cesc(label)}</span><span class="mpv">${dd ? "" : value}${auto ? ` <small>automatic</small>` : ""}</span></div>`;
      if (ctrl) r.appendChild(ctrl);
      return r;
    };
    const sec = document.createElement("div");
    sec.className = "mps";
    root.appendChild(sec);
    if (ov) {
      const st = stOf(ov);
      const lbl = labelOf(ov);
      const shown = st === "shown" || st === "added";
      sec.insertAdjacentHTML("beforeend", `<p class="mpfor">These settings are for <b>${cesc(lbl)}</b> only</p>`);
      // 1. Show in this overlay.
      const sw = document.createElement("label");
      sw.className = "mpr mpsw";
      sw.innerHTML = `<span class="mpk">Show here <small>${st === "added" || st === "off" ? "(you add it)" : `(${cesc(lbl)} shows it by itself)`}</small></span><ha-switch></ha-switch>`;
      const hs = sw.querySelector("ha-switch");
      hs.checked = shown;
      hs.addEventListener("change", () => {
        const add = st === "added" || st === "off";
        const key = add ? "add_to" : "hide_in";
        const set = new Set(dev()[key] || []);
        if (add === hs.checked) set.add(ov);
        else set.delete(ov);
        this._saveDev(id, { [key]: [...set] });
        done();
      });
      sec.appendChild(sw);
      if (shown && ov !== "network") this._mpOverlay(sec, row, { item, id, a, eng, ov, lbl, per, dev, T, name, done, saved, rerender });
    }
    // On every overlay: name, the value of several sensors, temperatures for Comfort.
    const all = document.createElement("details");
    all.className = "mpall";
    all.innerHTML = `<summary>For all overlays</summary>`;
    root.appendChild(all);
    all.appendChild(this._form([{ name: "name", selector: { text: {} } }], { name: dev().name || "" }, { name: `Name on the card (automatic: ${item.name})` }, (v) => {
      this._saveDev(id, { name: v.name });
      saved();
    }));
    const sensEnts = [...new Set([...(item.entities || []), ...(item.allEntities || [])])].filter((e) => ["temperature", "humidity"].includes(kindOf(e, hass.states[e])));
    if ((item.bond || item.phantom) && sensEnts.length > 1) {
      const schema = [{ name: "value", selector: { select: { options: [{ value: "default", label: "Automatic (Comfort setting, or the Editor's choice for phantoms)" }, { value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }, { value: "one", label: "One sensor" }], mode: "dropdown" } } }];
      if (dev().value === "one") schema.push({ name: "one", selector: { select: { options: sensEnts.map((e) => ({ value: e, label: `${T.short(e)} · ${T.val(e)}` })), mode: "dropdown" } } });
      all.appendChild(this._form(schema, { value: dev().value || "default", one: dev().one }, { value: "Value on the plan", one: "Which sensor" }, (v) => {
        const prevOne = dev().value === "one";
        this._saveDev(id, { value: v.value === "default" ? "" : v.value, one: v.value === "one" ? v.one : "" });
        if ((v.value === "one") !== prevOne) rerender();
        else saved();
      }));
    }
    if (!item.phantom && T.cands.some((e) => domainOf(e) === "climate")) {
      all.appendChild(this._form([{ name: "own", selector: { boolean: {} } }], { own: dev().own_temp !== "off" }, { own: "Count this unit's own temperature in Comfort and the heatmap (a bonded room thermometer always wins)" }, (v) => {
        this._saveDev(id, { own_temp: v.own ? "" : "off" });
        saved();
      }));
    }
    // 0.12.9: only where Comfort doesn't use its temperature by itself (a thermometer needs no switch).
    const ownT = (item.entities || []).filter((e) => kindOf(e, hass.states[e]) === "temperature" && !T.aux(e));
    const usedT = ownT.some((e) => ambientTemp(e, hass.states[e], item));
    if (ownT.length && !usedT && !item.bond && !item.phantom) {
      all.appendChild(this._form([{ name: "comfort", selector: { boolean: {} } }], { comfort: !!dev().comfort }, { comfort: "Use its temperature in Comfort (even if it's a device's internal sensor)" }, (v) => {
        this._saveDev(id, { comfort: v.comfort });
        saved();
      }));
    }
    // 0.12.7: open when it holds only the name; folded (as you left it) when there is more.
    all.open = all.querySelectorAll("ha-form").length <= 1 || !!this._mpAllOpen;
    all.addEventListener("toggle", () => (this._mpAllOpen = all.open));
  },

  /** 0.12.6: the settings of one shown overlay, in reading order. */
  _mpOverlay(sec, row, { item, id, eng, ov, per, dev, T, name, done, saved }) {
    const hass = this._hass;
    const p0 = per();
    const camE = ov === "live" && eng._camOf(item);
    const picE = ov === "live" && !!item.pic;
    // What the plan draws now (the hidden-when-off ones as they would be drawn).
    let sp = null;
    try {
      sp = eng._specsFor(item, ov, false).find((x) => x && x.item) || eng._selSpec(item, ov, name)[0] || null;
    } catch (_e) {
      sp = null;
    }
    // 0.12.9: Health without a battery draws only its "Offline" chip, while it is offline.
    const hOff = ov === "health" && !!(sp && sp.offline);
    // 2. Follows (0.12.8): only where the followed entity changes the marker (Live, Lights, Security, own overlays),
    // only with a real choice, never a settings / technical entity. A picture says it in "Shows as On when".
    const defO = eng._ovDef(ov) || {};
    const follows = ["live", "lights", "security"].includes(ov) || !!defO.custom;
    const health = ov === "health"; // 0.12.9: Health follows a battery (its own, under Diagnostic, or another)
    const fits = (e) => {
      if (health) return kindOf(e, hass.states[e]) === "battery";
      if (T.aux(e) || NO_VALUE.has(domainOf(e))) return false;
      const dm = domainOf(e);
      if (ov === "lights") return ["light", "switch"].includes(dm);
      if (ov === "security") return ["binary_sensor", "lock", "cover", "alarm_control_panel", "camera"].includes(dm);
      return dm !== "sensor" || READ_KIND.has(kindOf(e, hass.states[e]));
    };
    const fcands = T.cands.filter(fits);
    const autoH = health ? (item.roles && item.roles.battery && fits(item.roles.battery) && T.aux(item.roles.battery) && item.roles.battery) || T.cands.find((e) => fits(e) && T.aux(e)) || null : null;
    const autoF = health ? autoH : sp && sp.eid && hass.states[sp.eid] && !T.aux(sp.eid) ? sp.eid : null;
    if ((follows || health) && !picE && !item.bond && !item.phantom && !camE && (fcands.some((e) => e !== autoF) || (p0.lead && !fcands.includes(p0.lead))) && (autoF || p0.lead || health)) {
      const auto = autoF && autoF !== p0.lead ? autoF : null;
      const cur = p0.lead || "";
      const none = health ? "no battery of its own" : "its own state";
      const val = cur ? `${cesc(T.short(cur))} · ${cesc(T.val(cur))}` : auto ? `${cesc(T.short(auto))} · ${cesc(T.val(auto))}` : none;
      sec.appendChild(row("Follows", val, !cur, this._entSelect(T, { cur, autoText: `Automatic: ${auto ? `${T.short(auto)} · ${T.val(auto)}` : none}`, list: fcands, onPick: (e) => {
        const x0 = per().extras;
        this._savePer(id, ov, { lead: e || "", ...(Array.isArray(x0) ? { extras: x0.filter((x) => x !== e) } : {}) });
        done();
      } }), true));
    }
    // Bonds: on if any is on, or how many (only where on / off changes the marker).
    if (item.bond && follows) {
      const cur = p0.show || item.show || "";
      const s = document.createElement("select");
      const part = eng._lampBond(item) ? "lamp" : "part"; // 0.12.8: "lamp" only for a bond of lamps
      s.innerHTML = `<option value="">if any ${part} is on</option><option value="count" ${cur === "count" ? "selected" : ""}>how many are on (2 of 3)</option>`;
      s.addEventListener("change", () => {
        this._savePer(id, ov, { show: s.value });
        done();
      });
      sec.appendChild(row("Counts as on", "", !p0.show, s, true));
    }
    // 3. Shown as: its own look (picture, chip, touch area, light) or, without one, an icon.
    const body = eng._bodyOf(item);
    const looks = [];
    // 0.12.9: said from what the plan draws: a chip's icon, a camera's dot, Health's offline chip.
    const chipIcon = !!(sp && sp.type === "chip" && (sp.cl2 || (!sp.rd && (sp.icon || sp.icon0))));
    if (picE) looks.push("picture");
    if ((sp && sp.cam) || camE) looks.push("a dot in the camera's colour, its camera beside it when it shows");
    if (hOff) looks.push("an “Offline” chip with its icon, only while it is offline");
    else if (sp && sp.type === "chip") looks.push(sp.rd && !chipIcon ? "chip with its values" : chipIcon ? "chip with its icon" : "chip");
    if (ov === "live" && body && body.touch && !picE) looks.push("touch area");
    // 0.12.7: lamps follow the overlay's "Lights as" (glow only = no icon); a light shape is not a look.
    const glowOnly = !!(sp && sp.kind === "light" && eng._glowOnly(ov) && !looks.length);
    if (glowOnly) looks.push("its glow (Lights as: Glow)");
    const markerIcon = !picE && !camE && !hOff && !(sp && sp.cam) && !glowOnly && !(sp && sp.type === "chip") && !(ov === "live" && body && body.touch);
    const legacyOff = !!p0.noicon && (markerIcon || chipIcon); // only where an icon would be drawn
    const iconDrawn = markerIcon && !legacyOff;
    const shownAs = looks.length ? looks.join(" + ") : "an icon";
    const iconBox = document.createElement("div");
    if (iconDrawn || (chipIcon && !legacyOff)) {
      iconBox.appendChild(this._form([{ name: "icon", selector: { icon: {} } }], { icon: p0.icon || dev().icon || "" }, { icon: "Icon (empty = Home Assistant's own)" }, (v) => {
        this._savePer(id, ov, { icon: v.icon });
        saved();
      }));
    }
    if (legacyOff) {
      iconBox.insertAdjacentHTML("beforeend", `<p class="mpn">The icon is hidden (your earlier choice). <button class="lnk" data-noi="1">Show it again</button></p>`);
      iconBox.querySelector("[data-noi]").addEventListener("click", () => {
        this._savePer(id, ov, { noicon: false });
        done();
      });
    }
    const lookTxt = legacyOff ? (looks.length ? shownAs : "its value, without its icon") : looks.length && !glowOnly && !chipIcon && !picE && !hOff ? `${shownAs} <small>(no icon)</small>` : shownAs;
    sec.appendChild(row("Shown as", lookTxt, false, iconBox.childNodes.length ? iconBox : null));
    if (ov === "health") {
      const only = !!(this._config.health || {}).only_problems;
      const when = hOff ? "only while it is offline" : only ? "only when its battery is low or it is offline (card setting)" : "always (marked when its battery is low)";
      sec.appendChild(row("When it shows", cesc(when), true, null));
    }
    // 4. Also shows: the real lines, with their values, where they are drawn.
    if (!picE || ov !== "live") this._mpExtras(sec, row, { item, id, ov, per, eng, T, sp, camE, done, saved });
    // 5. When it shows (Live): a trigger, when off; a camera's picture; a picture's two sentences.
    if (ov === "live") {
      const added = eng._added(item, "live");
      if (camE) {
        const pops = p0.popup !== "off" && p0.popup !== false;
        const s = document.createElement("select");
        s.innerHTML = `<option value="1">when something happens</option><option value="0" ${pops ? "" : "selected"}>only with Layers → Cameras</option>`;
        s.addEventListener("change", () => {
          this._savePer(id, "live", { popup: s.value === "1" ? "" : "off" });
          done();
        });
        sec.appendChild(row("Shows the camera", "", pops, s, true));
        // 0.13.1: its picture (a still, refreshed) or live video (Home Assistant's camera player).
        {
          const v = document.createElement("select");
          v.innerHTML = `<option value="">Automatic (its picture, refreshed every 10 s)</option><option value="live" ${p0.video === "live" ? "selected" : ""}>Live video</option>`;
          v.addEventListener("change", () => {
            this._savePer(id, "live", { video: v.value });
            done();
          });
          sec.appendChild(row("Shows", "", !p0.video, v, true));
        }
      }
      if (!picE && (!camE || (p0.popup !== "off" && p0.popup !== false))) {
        const autoT = !p0.when ? eng._liveWhen(item) : null;
        const list = T.cands.filter((e) => !NO_VALUE.has(domainOf(e)) || domainOf(e) === "event");
        const auto = camE ? (autoT ? `when ${T.short(autoT)} fires` : "nothing (no sensor of its own)") : added ? "always (you added it)" : `while ${eng._onWords(item, sp)}`;
        const cur = p0.when || "";
        const ctl = this._entSelect(T, { cur, autoText: `Automatic: ${auto}`, list, onPick: (e) => {
          this._savePer(id, "live", { when: e || "" });
          done();
        } });
        sec.appendChild(row("When it shows", "", !cur, ctl, true));
        // 0.13.1: how long it stays after its trigger, for every marker that has one (cameras and any device).
        if (p0.when || (camE && autoT)) {
          const ev = domainOf(p0.when || autoT) === "event";
          const st0 = p0.stay || "";
          const opts = [["", `Automatic (${ev ? "1 min after it fires" : "while it is on, then 30 s"})`], ["on", ev ? "Only briefly (1 min after it fires)" : "Only while it is on"], ["10", "10 s after it ends"], ["30", "30 s after it ends"], ["60", "1 min after it ends"], ["120", "2 min after it ends"], ["300", "5 min after it ends"], ["x", "Until I close it (✕)"]];
          const s2 = document.createElement("select");
          s2.innerHTML = opts.map(([val, lab]) => `<option value="${val}" ${val === st0 ? "selected" : ""}>${cesc(lab)}</option>`).join("");
          s2.addEventListener("change", () => {
            this._savePer(id, "live", { stay: s2.value });
            done();
          });
          sec.appendChild(row("Stays open", "", !st0, s2, true));
        }
      }
      if (picE) sec.appendChild(this._picBox(item, id, p0, done));
      if (!picE && !item.phantom && !camE && (TOGGLE_DOMAINS.has(domainOf(item.main_entity || "")) || item.bond)) {
        const card = (this._config.live || {}).show_off || "hidden";
        const cur = p0.off || "";
        const s = document.createElement("select");
        s.innerHTML = `<option value="">Automatic (${added ? "shown" : card === "faint" ? "faint" : "hidden"})</option><option value="hidden" ${cur === "hidden" ? "selected" : ""}>Hidden</option><option value="faint" ${cur === "faint" ? "selected" : ""}>Faint, so it can be tapped on again</option><option value="shown" ${cur === "shown" ? "selected" : ""}>Shown</option>`;
        s.addEventListener("change", () => {
          this._savePer(id, "live", { off: s.value });
          done();
        });
        const W = { hidden: "hidden", faint: "faint", shown: "shown" };
        sec.appendChild(row("When it is off", W[cur] || "", !cur, s, true));
      }
      if (eng._applOf(item)) {
        sec.appendChild(this._form([
          { name: "pill", selector: { select: { options: [{ value: "auto", label: "For a few minutes after it changes" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }], mode: "dropdown" } } },
          { name: "done_for", selector: { select: { options: [{ value: "30", label: "After 30 minutes" }, { value: "60", label: "After 1 hour" }, { value: "unloaded", label: "Only when unloaded (tap, or the door opens)" }], mode: "dropdown" } } },
        ], { pill: p0.pill || "auto", done_for: p0.done_for || "30" }, { pill: "Status label on the plan", done_for: "“Done” clears by itself" }, (v) => {
          this._savePer(id, ov, { pill: v.pill === "auto" ? "" : v.pill, done_for: v.done_for === "30" ? "" : v.done_for });
          saved();
        }));
      }
    }
    // 6. Tap and long press, in words; try them on the plan.
    this._mpActions(sec, row, { item, id, ov, per, dev, eng, sp, done });
  },

  /** 0.12.6: "Also shows": the lines drawn with the marker, each with its value; a pick the plan can't draw says so. */
  _mpExtras(sec, row, { item, id, ov, per, eng, T, sp, camE, done, saved }) {
    const hass = this._hass;
    const p0 = per();
    const auto = eng._autoReads(item, ov);
    const extras = Array.isArray(p0.extras) ? p0.extras : null;
    const inMarker = new Set([...((sp && (sp.core || sp.ents)) || []), sp && sp.eid, item.bond ? item.main_entity : null, ...(item.bond ? item.entities || [] : [])].filter(Boolean));
    const why = (e) => (!hass.states[e] ? "not shown: it no longer exists" : NO_VALUE.has(domainOf(e)) ? "not shown: it has no value (it is an action)" : inMarker.has(e) ? `not shown: already part of this ${item.bond ? "bond" : "marker"}` : "");
    // 0.12.8: automatic = only what is drawn; your own picks that can't be drawn still say why.
    const listed = (extras || auto.filter((e) => !why(e))).filter((e) => !(camE && domainOf(e) === "camera"));
    const box = document.createElement("div");
    box.className = "mpx";
    const xics = p0.extra_icons || {};
    box.innerHTML = listed.map((e) => {
      const no = why(e);
      const isB = p0.badge === e;
      return `<div class="mpxr ${no ? "no" : ""}"><div class="mpxl"><button class="mpxi" data-xic="${cesc(e)}" title="Icon for this line">${xics[e] ? `<ha-icon icon="${cesc(xics[e])}"></ha-icon>` : `<ha-state-icon data-xent="${cesc(e)}"></ha-state-icon>`}</button><span class="mpxn">${cesc(T.short(e))} · <b>${cesc(T.val(e))}</b>${no ? `<small>${cesc(no)}</small>` : ""}</span>${extras ? `<button class="mpxd" data-xdel="${cesc(e)}" title="Remove">✕</button>` : ""}</div>${no || camE ? "" : `<div class="lbsw" role="group" aria-label="Show as"><button class="${isB ? "" : "on"}" data-xbdg="${cesc(e)}" data-to="label">Label under it</button><button class="${isB ? "on" : ""}" data-xbdg="${cesc(e)}" data-to="badge">Badge on it</button></div>`}</div>`;
    }).join("");
    for (const el of box.querySelectorAll("[data-xent]")) {
      el.hass = hass;
      el.stateObj = hass.states[el.dataset.xent];
    }
    const offer = T.cands.filter((e) => !listed.includes(e) && !inMarker.has(e) && !NO_VALUE.has(domainOf(e)) && !(camE && domainOf(e) === "camera") && (this._xAll || !T.aux(e) || kindOf(e, hass.states[e]) === "battery"));
    const add = this._entSelect(T, { cur: "", none: "+ Add a reading", list: offer, onPick: (e) => {
      if (!e) return;
      this._savePer(id, ov, { extras: [...listed.filter((x) => !why(x)), e] });
      done();
    } });
    box.appendChild(add);
    box.insertAdjacentHTML("beforeend", `<div class="mpa"><button class="lnk" data-xall="1">${this._xAll ? "Hide settings entities" : "Show settings entities too"}</button>${extras ? `<button class="lnk" data-xauto="1">Back to automatic</button>` : ""}</div>`);
    const drawn = listed.filter((e) => !why(e));
    const val = drawn.length ? drawn.map((e) => `${cesc(T.short(e))} <small>(${p0.badge === e ? "badge" : "label"})</small>`).join(", ") : "nothing";
    sec.appendChild(row("Also shows", val, !extras, box));
    for (const b of box.querySelectorAll("[data-xbdg]")) b.addEventListener("click", () => {
      const eid = b.dataset.xbdg;
      const badge = b.dataset.to === "badge" ? eid : per().badge === eid ? "" : per().badge || "";
      this._savePer(id, ov, { badge, extras: listed });
      done();
    });
    for (const b of box.querySelectorAll("[data-xic]")) b.addEventListener("click", () => {
      const eid = b.dataset.xic;
      const old = box.querySelector(".xicf");
      if (old) old.remove();
      const f = document.createElement("div");
      f.className = "xicf";
      f.appendChild(this._form([{ name: "icon", selector: { icon: {} } }], { icon: (per().extra_icons || {})[eid] || "" }, { icon: `Icon for “${T.short(eid)}” (empty = its own)` }, (v) => {
        const ics = { ...(per().extra_icons || {}) };
        if (v.icon) ics[eid] = v.icon;
        else delete ics[eid];
        this._savePer(id, ov, { extra_icons: ics, extras: listed });
        saved();
      }));
      b.closest(".mpxr").after(f);
    });
    for (const b of box.querySelectorAll("[data-xdel]")) b.addEventListener("click", () => {
      this._savePer(id, ov, { extras: listed.filter((e) => e !== b.dataset.xdel), ...(per().badge === b.dataset.xdel ? { badge: "" } : {}) });
      done();
    });
    box.querySelector("[data-xall]").addEventListener("click", () => {
      this._xAll = !this._xAll;
      done();
    });
    const ba = box.querySelector("[data-xauto]");
    if (ba) ba.addEventListener("click", () => {
      this._savePer(id, ov, { extras: null, badge: "" });
      done();
    });
  },

  /** 0.12.6: Tap and Long press, said in words, each changeable (a dashboard / a popup asks for its target). */
  _mpActions(sec, row, { item, id, ov, per, dev, eng, sp, done }) {
    const p0 = per();
    const robot = [item.main_entity, ...(item.entities || [])].some((e) => e && domainOf(e) === "vacuum");
    const s = sp || { type: "dev", item, ents: [item.main_entity].filter(Boolean), eid: item.main_entity, kind: kindOf(item.main_entity, this._hass.states[item.main_entity]) };
    const ov0 = eng._overlay;
    eng._overlay = ov;
    let tapW = "";
    let holdW = "";
    try {
      tapW = eng._actWords(s, false);
      holdW = eng._actWords(s, true);
    } finally {
      eng._overlay = ov0;
    }
    const W = { "switch all": "switches all its lamps", "switch on / off": "switches it on / off", details: "opens its details", "info card": "opens its info card", graphs: "opens its graphs", "readings with history": "opens its readings with history", "open a dashboard": "opens a dashboard", "a popup card": "opens a popup card", "press a button": "presses a button", nothing: "nothing", "robot panel": "opens the robot panel", "network info": "shows its network info" };
    const say = (w) => W[w] || w;
    const mk = (key, pre, opts, cur, words, isHold) => {
      const box = document.createElement("div");
      const src = robot && !isHold ? dev() : { ...dev(), ...p0 };
      const save = (act, v = {}) => {
        const pick = (k, dflt) => (k in v ? v[k] : src[`${pre}${k}`] ?? dflt);
        const extra = { [`${pre}nav`]: act === "navigate" ? pick("nav", "") : "", [`${pre}popup_title`]: act === "popup" ? pick("popup_title", "") : "", [`${pre}popup_card`]: act === "popup" ? pick("popup_card", null) : null, [`${pre}press`]: act === "press" ? pick("press", "") : "", [`${pre}ask`]: act === "press" && pick("ask", true) === false ? false : null };
        if (robot && !isHold) this._saveDev(id, { [key]: act, ...extra });
        else this._savePer(id, ov, { [key]: act, ...extra });
      };
      // 0.12.7: a plain drop-down like the others; "Automatic (what it does)".
      const sel = document.createElement("select");
      sel.innerHTML = opts.map((o) => `<option value="${cesc(o.value)}" ${(cur || "default") === o.value ? "selected" : ""}>${cesc(o.value === "default" ? `Automatic (${say(words)})` : o.label)}</option>`).join("");
      sel.addEventListener("change", () => {
        save(sel.value === "default" ? "" : sel.value);
        done();
      });
      box.appendChild(sel);
      if (cur === "navigate" || cur === "popup") {
        const schema = cur === "navigate" ? [{ name: "nav", selector: { navigation: {} } }] : [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }];
        box.appendChild(this._form(schema, { nav: src[`${pre}nav`] || "", popup_title: src[`${pre}popup_title`] || "", popup_card: src[`${pre}popup_card`] }, { nav: "Dashboard to open", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)" }, (v) => save(cur, v)));
      }
      // 0.13.9.17 #63: which button, and ask first (on by default).
      if (cur === "press") {
        const ents = [...new Set([...(item.entities || []), ...(item.allEntities || [])])].filter((e) => ["button", "input_button"].includes(domainOf(e)));
        box.appendChild(this._form([{ name: "press", selector: { entity: { domain: ["button", "input_button"] } } }, { name: "ask", selector: { boolean: {} } }], { press: src[`${pre}press`] || "", ask: src[`${pre}ask`] !== false }, { press: `Button (empty: ${ents.filter((e) => !/_identify$/.test(e))[0] || "the device's first button"})`, ask: "Ask first" }, (v) => save(cur, v)));
      }
      sec.appendChild(row(isHold ? "Long press" : robot ? "Tap (all overlays)" : "Tap", "", !cur, box, true));
    };
    const tcur = (robot ? dev().tap : p0.tap || dev().tap) || "";
    const topts = robot ? [{ value: "default", label: "" }, ...TAP_OPTIONS.filter((o) => !["toggle", "readings"].includes(o.value))] : [{ value: "default", label: "" }, ...TAP_OPTIONS];
    mk("tap", "", topts, tcur, tapW, false);
    const hcur = p0.hold || dev().hold || "";
    const hopts = [{ value: "default", label: "" }, ...HOLD_OPTIONS.filter((o) => o.value !== "default"), { value: "navigate", label: "Open a dashboard" }, { value: "popup", label: "Popup with a card (browser_mod)" }, { value: "press", label: "Press a button" }];
    mk("hold", "hold_", hopts, hcur, holdW, true);
  },

  /** People in Edit markers (#107): the same fields as card editor → People. */
  _personPanel(body, entity, rerender) {
    const curList = () => Array.isArray(this._config.people) ? this._config.people : []; // read fresh: edits save without a redraw
    const idx = curList().findIndex((x) => x.entity === entity);
    if (idx < 0) {
      body.innerHTML = `<p class="bg-hint">This person isn't in this card's People list.</p>`;
      return;
    }
    const save = (next, extra = {}) => {
      this._config = this._prune({ ...this._config, people: next, ...extra });
      this._emit();
      this._engine(true);
    };
    body.innerHTML = "";
    body.appendChild(this._form([
      { name: "entity", selector: { entity: { domain: "person" } } },
      { name: "room", selector: { entity: {} } },
      { name: "room2", selector: { entity: {} } },
          { name: "distance", selector: { entity: { domain: "sensor", device_class: "distance" } } },
    ], { ...curList()[idx] }, { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (when 1 is unknown or not a room here)", distance: "Distance sensor (Bermuda; test: Network → Bluetooth)" }, (v) => {
      const next = curList().map((x, j) => (j === idx ? { ...x, ...v } : x));
      save(next);
    }));
    const eng = this._engine();
    const ovs = eng._overlays().filter((o) => o !== "plan" && o !== "people" && o !== "live" && o !== "network" && o !== "health");
    body.appendChild(this._form([{ name: "people_in", selector: { select: { options: ovs.map((o) => ({ value: o, label: eng._ovDef(o).label })), multiple: true, mode: "list" } } }], { people_in: this._config.people_in || [] }, { people_in: "People show in Live; also show them in (all people)" }, (v) => save(curList(), { people_in: v.people_in })));
    const del = document.createElement("button");
    del.className = "qbtn";
    del.textContent = "Remove this person from the card";
    del.addEventListener("click", () => {
      save(curList().filter((_x, j) => j !== idx));
      rerender(null);
    });
    body.appendChild(del);
  },

  /** The Marker Editor (#108): the card full-screen; click a marker, settings for THIS overlay. */
  _openBig({ direct = false, onClose = null } = {}) {
    if (this._big) return;
    const wrap = document.createElement("dialog");
    wrap.className = "dfe-big";
    wrap.innerHTML = `<style>${BIG_CSS}</style><div class="bg-h"><b>Card Editor</b><span></span><button class="bg-x" aria-label="Close">${direct ? "Done" : "Close the window and Press Save"}</button></div><div class="bg-b tab-set"><div class="bg-mid"><div class="bg-zoom"><button data-z="-1" aria-label="Zoom out"><ha-icon icon="mdi:minus"></ha-icon></button><span class="bg-zv">100 %</span><button data-z="1" aria-label="Zoom in"><ha-icon icon="mdi:plus"></ha-icon></button><button data-z="0" class="bg-fit" hidden>Fit</button></div><div class="bg-plan"></div></div><div class="bg-pan"><div class="bg-tabs"><button data-bt="set" class="on">Settings</button><button data-bt="side">Markers</button></div><aside class="bg-set"></aside><aside class="bg-side"></aside></div></div>`;
    // Inside HA's card editor dialog everything outside it is inert: keep the big plan inside the
    // editor (still drawn on top, from the top layer). From the ✎ pen the editor isn't on the page.
    (this.isConnected ? this : document.body).appendChild(wrap);
    try {
      wrap.showModal();
    } catch (_e) {
      wrap.setAttribute("open", "");
    }
    for (const ev of ["keydown", "keyup", "keypress"]) wrap.addEventListener(ev, (e) => e.stopPropagation());
    // 0.11.1: the card settings move into the left column (the same sections, moved back on Done).
    const setBox = wrap.querySelector(".bg-set");
    const dfe = this.querySelector(":scope > .dfe");
    const dfeStyle = dfe && dfe.previousElementSibling;
    const dall = dfe && dfe.querySelector("#dall");
    const dallWas = dall ? dall.open : false;
    if (dall) dall.open = true; // all settings open in the Card Editor
    if (dfe) setBox.append(...[dfeStyle, dfe].filter(Boolean));
    else {
      setBox.remove();
      wrap.querySelector(".bg-b").classList.replace("tab-set", "tab-side");
      wrap.querySelector(".bg-tabs").remove();
    }
    const bgB = wrap.querySelector(".bg-b");
    const showTab = (t) => {
      if (!dfe) return;
      bgB.classList.toggle("tab-set", t === "set");
      bgB.classList.toggle("tab-side", t === "side");
      for (const b of wrap.querySelectorAll("[data-bt]")) b.classList.toggle("on", b.dataset.bt === t);
    };
    for (const b of wrap.querySelectorAll("[data-bt]")) b.addEventListener("click", () => showTab(b.dataset.bt));
    // Zoom: the card is drawn wider in its scroll box (its markers and Rooms scale with it); Fit = 100 %.
    let zoom = 1;
    const zv = wrap.querySelector(".bg-zv");
    const fitB = wrap.querySelector(".bg-fit");
    // At 100 % the plan fits the column (height and width); zoomed, it is drawn wider and scrolls.
    const setZoom = (z) => {
      zoom = Math.max(1, Math.min(4, z));
      card._fitHost = zoom === 1;
      card.style.width = `${zoom * 100}%`;
      card.style.height = zoom === 1 ? "100%" : "";
      zv.textContent = `${Math.round(zoom * 100)} %`;
      fitB.hidden = zoom === 1;
      card._update(true);
    };
    for (const b of wrap.querySelectorAll("[data-z]")) b.addEventListener("click", () => setZoom(b.dataset.z === "0" ? 1 : zoom * (b.dataset.z === "1" ? 1.25 : 0.8)));
    wrap.querySelector(".bg-plan").addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return; // ctrl + wheel / trackpad pinch zooms; a plain wheel scrolls
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });
    const card = document.createElement("device-floorplan-card");
    card.setConfig(this._config);
    const fid = this._planIds()[this._ftab || 0];
    if (!direct && fid) card._floor = fid; // 0.8.1: the floor picked in the card editor
    card._fitHost = true;
    card.style.height = "100%";
    card.hass = this._hass;
    wrap.querySelector(".bg-plan").appendChild(card);
    const side = wrap.querySelector(".bg-side");
    this._big = { wrap, card, set: !!dfe };
    let sel = null;
    let q = "";
    const render = (id = sel) => {
      sel = id;
      card._selId = id && !String(id).startsWith("person:") ? id : null;
      card._update(true);
      const a = (card._sensor() || {}).attributes;
      if (!a) return;
      const ov = card._overlay;
      const eng = this._engine();
      const ovs = eng._overlays().filter((o) => o !== "plan");
      const def = eng._ovDef(ov);
      const items = card._items(a);
      // 0.11.1 test8: a strong header like the settings column: title, the overlay as a chip, the count, one line, search.
      const ovName = def ? (this._config.overlay_names || {})[ov] || def.label : "";
      side.innerHTML = `<div class="dcol"><h3><ha-icon icon="mdi:map-marker-multiple-outline"></ha-icon>Markers${def ? `<span class="ovchip"><ha-icon icon="${cesc(def.icon || "mdi:layers")}"></ha-icon>${cesc(ovName)}</span><span class="mkn"></span>` : ""}</h3><p>${ov === "plan" || !def ? "Pick an overlay under the plan to edit its markers." : `Every device in ${cesc(ovName)}. Pick one here or on the plan to change what it shows, its icon and what a tap does.`}</p></div><div class="bg-sel"></div><div class="bg-list"><div class="bg-lh"><input class="bg-q" placeholder="Search…" value="${cesc(q)}"></div><div class="bg-groups"></div></div>`;
      const selBox = side.querySelector(".bg-sel");
      if (id && String(id).startsWith("person:")) {
        selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
        selBox.querySelector(".bg-t span").textContent = entName(this._hass, id.slice(7));
        this._personPanel(selBox.querySelector(".bg-p"), id.slice(7), (x) => render(x));
      } else if (id) {
        const item = items.find((x) => x.id === id);
        if (item) {
          selBox.innerHTML = `<div class="bg-t"><span></span><button class="bg-c" aria-label="Close">✕</button></div><div class="bg-p"></div>`;
          selBox.querySelector(".bg-t span").textContent = ((this._config.devices || {})[id] || {}).name || item.name;
          this._markerPanel(selBox.querySelector(".bg-p"), item, a, eng, ovs, { current: ov, onOv: (o) => card._setOverlay(o), rerender: () => render(id), saved: () => {
            const nm = side.querySelector(`.lr[data-id="${CSS.escape(id)}"] .lnm`);
            if (nm) nm.innerHTML = `${cesc(((this._config.devices || {})[id] || {}).name || item.name)}${item.bond ? " <small>(bonded)</small>" : item.phantom ? " <small>(phantom)</small>" : ""}`;
          } });
        }
      }
      const c = selBox.querySelector(".bg-c");
      if (c) c.addEventListener("click", () => render(null));
      const list = () => {
        const box = side.querySelector(".bg-groups");
        if (!box) return;
        if (box.contains(selBox)) side.prepend(selBox); // keep the open settings while the list is rebuilt
        const e2 = this._engine();
        const ql = q.trim().toLowerCase();
        const name = (it) => ((this._config.devices || {})[it.id] || {}).name || it.name;
        const rows = { hidden: [], on: [], off: [] };
        // 0.13.9.1: search matches the name, the entities, the category and the room; "lights" also finds "light".
        const qs = ql ? [...new Set([ql, ql.replace(/(?<=\w{3})s$/, "")])] : [];
        const hay = (it) => {
          const r = e2._roomOf(it, a) || it.area_id;
          const room = r ? (e2._rooms().names || {})[r] || ((a.areas || {})[r] || {}).name || "" : "";
          return `${name(it)} ${it.id} ${(it.entities || []).join(" ")} ${it.main_entity || ""} ${it.group || ""} ${LIVE_KINDS[it.group] || ""} ${room}`.toLowerCase();
        };
        for (const it of items) {
          if (qs.length && !qs.some((w) => hay(it).includes(w))) continue;
          if (ov === "plan") continue;
          const qual = e2._qualifies(it, ov, a);
          if (qual && e2._hidden(it, ov)) rows.hidden.push(it);
          else if (qual) rows.on.push(it);
          else rows.off.push(it);
        }
        for (const k of Object.keys(rows)) rows[k].sort((x, y) => name(x).localeCompare(name(y), undefined, { sensitivity: "base" }));
        const hideBtn = () => ""; // 0.12.7: the "Show here" switch in the settings does it
        const closeBtn = (it) => (sel === it.id ? `<button class="bg-c2" data-unpick="1" aria-label="Close">✕</button>` : "");
        const row = (it, btn) => `<div class="lr ${sel === it.id ? "sel" : ""}" data-id="${cesc(it.id)}"><button class="lnm" data-pick="${cesc(it.id)}">${((this._config.devices || {})[it.id] || {}).icon ? `<ha-icon class="lic" icon="${cesc(this._config.devices[it.id].icon)}"></ha-icon>` : it.main_entity ? `<ha-state-icon class="lic" data-ent="${cesc(it.main_entity)}"></ha-state-icon>` : `<ha-icon class="lic" icon="mdi:devices"></ha-icon>`}${cesc(name(it))}${it.bond ? " <small>(bonded)</small>" : it.phantom ? " <small>(phantom)</small>" : ""}</button>${btn}${hideBtn(it)}${closeBtn(it)}</div>`;
        const custom = def && def.custom;
        // 0.11: three groups, one style: arrow, bold title with count, collapsible (remembered while editing).
        const lbl = def ? def.label : "";
        const og = (this._grpOpen = this._grpOpen || { on: true, hidden: true, off: false });
        // 0.11.1: the shown devices grouped by room (as Home Assistant groups by area).
        // 0.13.9.1: the room is where the marker stands on THIS floor (any kind of spot, bonds included), else the
        // Home Assistant area it is in.
        const roomName = (it) => {
          const r = e2._roomOf(it, a) || (it.area_id && (a.areas || {})[it.area_id] ? it.area_id : null);
          return r ? (e2._rooms().names || {})[r] || ((a.areas || {})[r] || {}).name || r : "No room";
        };
        const byRoom = (list, btn) => {
          const g = new Map();
          for (const it of list) {
            const r = roomName(it);
            if (!g.has(r)) g.set(r, []);
            g.get(r).push(it);
          }
          return [...g].sort((x, y) => (x[0] === "No room") - (y[0] === "No room") || x[0].localeCompare(y[0])).map(([r, l]) => `<div class="lroom">${cesc(r)}</div>${l.map((it) => row(it, btn(it))).join("")}`).join("");
        };
        const grp = (k, title, list, btn) => (list.length ? `<details class="dgrp" data-g="${k}" ${og[k] || ql || list.some((it) => it.id === sel) ? "open" : ""}><summary>${cesc(title)} <span class="n">${list.length}</span></summary>${k === "on" ? byRoom(list, btn) : list.map((it) => row(it, btn(it))).join("")}</details>` : "");
        box.innerHTML = grp("on", `Shown in ${lbl}`, rows.on, () => "")
          + grp("hidden", `Hidden in ${lbl}`, rows.hidden, (it) => `<button class="lb" data-show="${cesc(it.id)}">↩ Show</button>`)
          + grp("off", `Not shown in ${lbl}`, rows.off, (it) => (custom ? `<button class="lb" data-add="${cesc(it.id)}">+ Add</button>` : ""))
          + `<p class="bg-hint" style="margin-top:10px">Devices that aren't on the plan yet: place them in the Floorplan Editor first.</p>`;
        const mkn = side.querySelector(".mkn");
        if (mkn) mkn.textContent = String(rows.on.length);
        for (const d of box.querySelectorAll("details.dgrp")) d.addEventListener("toggle", () => (this._grpOpen[d.dataset.g] = d.open));
        for (const ic of box.querySelectorAll("ha-state-icon[data-ent]")) {
          ic.hass = this._hass;
          ic.stateObj = this._hass.states[ic.dataset.ent];
        }
        for (const b of box.querySelectorAll("[data-pick]")) b.addEventListener("click", () => render(b.dataset.pick === sel ? null : b.dataset.pick));
        for (const b of box.querySelectorAll("[data-unpick]")) b.addEventListener("click", () => render(null));
        for (const b of box.querySelectorAll("[data-hide]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.hide] || {};
          this._saveDev(b.dataset.hide, { hide_in: [...new Set([...(cur.hide_in || []), ov])] });
          render(b.dataset.hide);
        });
        // 0.7.5: the selected marker's settings open right under its row, and the row scrolls into view.
        const r0 = sel && !String(sel).startsWith("person:") && box.querySelector(`.lr[data-id="${CSS.escape(sel)}"]`);
        if (r0) {
          const det = r0.closest("details");
          if (det) det.open = true;
          r0.after(selBox);
          selBox.classList.add("inl");
          if (!this._big || this._big.scrolled !== sel) {
            if (this._big) this._big.scrolled = sel;
            requestAnimationFrame(() => r0.scrollIntoView({ block: "start", behavior: "smooth" }));
          }
        } else selBox.classList.remove("inl");
        for (const b of box.querySelectorAll("[data-show]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.show] || {};
          this._saveDev(b.dataset.show, { hide_in: (cur.hide_in || []).filter((x) => x !== ov) });
          render(b.dataset.show);
        });
        for (const b of box.querySelectorAll("[data-add]")) b.addEventListener("click", () => {
          const cur = (this._config.devices || {})[b.dataset.add] || {};
          this._saveDev(b.dataset.add, { add_to: [...new Set([...(cur.add_to || []), ov])] });
          render(b.dataset.add);
        });
      };
      list();
      const qi = side.querySelector(".bg-q");
      qi.addEventListener("input", () => {
        q = qi.value;
        list();
      });
    };
    this._big.rerender = () => render(null);
    card._pick = (id) => {
      if (id) showTab("side"); // a marker picked on the plan opens Markers
      render(id);
    };
    card._onOv = () => render(sel);
    card._onWinMove = (id, pos) => this._saveDev(id, { win: pos });
    card._onNewOv = (raw) => {
      const c = { ...this._config, overlays: raw.overlays };
      if (raw.dismissed_overlays) c.dismissed_overlays = raw.dismissed_overlays;
      this._set(c);
    };
    card._pickHide = (id) => {
      if (!id) return;
      const ov = card._overlay;
      const cur = (this._config.devices || {})[id] || {};
      this._saveDev(id, { hide_in: [...new Set([...(cur.hide_in || []), ov])] });
      render(null);
    };
    setTimeout(() => render(null), 400);
    const close = () => {
      if (!this._big) return;
      try {
        wrap.close();
      } catch (_e) {
        /* already closed */
      }
      if (dall) dall.open = dallWas;
      if (dfe) this.prepend(...[dfeStyle, dfe].filter(Boolean)); // the settings go back to Home Assistant's editor
      wrap.remove();
      this._big = null;
      if (onClose) onClose();
      this._renderDevices();
    };
    wrap.querySelector(".bg-x").addEventListener("click", close);
    wrap.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
  },
});

if (!customElements.get("device-floorplan-card")) customElements.define("device-floorplan-card", DeviceFloorplanCard);
if (!customElements.get("device-floorplan-card-editor")) customElements.define("device-floorplan-card-editor", DeviceFloorplanCardEditor);
