Object.assign(DeviceFloorplanCardEditor.prototype, {

  // ---- custom overlays (#55)
  _renderCustom() {
    const box = this.querySelector("#custom");
    if (!box) return;
    const curList = () => this._custom(); // read fresh: edits save without a redraw
    box.innerHTML = curList().map((o, i) => `<div class="row" data-i="${i}"><button class="hd" data-copen="${i}"><ha-icon icon="${cesc(o.icon || "mdi:layers-outline")}"></ha-icon>${cesc(o.name || "Custom")}<small style="margin-left:auto">${cesc(o.mode === "manual" ? "devices you add" : `${(o.kinds || []).length} kind${(o.kinds || []).length === 1 ? "" : "s"}`)}</small><ha-icon class="cv ${this._copen === i ? "up" : ""}" icon="mdi:chevron-down"></ha-icon></button>${this._copen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-cadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add overlay</button>`;
    box.querySelector("[data-cadd]").addEventListener("click", () => {
      const used = new Set([...curList().map((o) => o.id), ...OVERLAY_ORDER]);
      let n = 1;
      while (used.has(`custom${n}`)) n++;
      const next = [...curList(), { id: `custom${n}`, name: `Custom ${n}`, icon: "mdi:layers-outline", kinds: [] }];
      const c = { ...this._config, custom_overlays: next };
      if (Array.isArray(c.overlays)) c.overlays = [...c.overlays, `custom${n}`];
      this._copen = next.length - 1;
      this._set(c, { sections: true });
    });
    for (const b of box.querySelectorAll("[data-copen]")) b.addEventListener("click", () => {
      const i = Number(b.dataset.copen);
      this._copen = this._copen === i ? null : i;
      this._renderCustom();
    });
    const body = this._copen != null && box.querySelector(`.row[data-i="${this._copen}"] .body`);
    if (!body) return;
    const i = this._copen;
    const o = curList()[i];
    body.appendChild(this._form(
      [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "mode", selector: { select: { options: [{ value: "kinds", label: "By kinds (new devices join automatically)" }, { value: "manual", label: "Only devices I add (in Edit markers)" }], mode: "dropdown" } } },
        ...(o.mode === "manual" ? [] : [{ name: "kinds", selector: { select: { options: Object.entries(CUSTOM_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } }]),
        { name: "lights_as", selector: { select: { options: [{ value: "markers", label: "Markers" }, { value: "glow", label: "Glow only" }], mode: "dropdown" } } },
      ],
      { kinds: [], mode: "kinds", lights_as: "markers", ...o },
      { name: "Button name", icon: "Icon", mode: "Which devices", kinds: "Shows these kinds (the order below decides what leads)", lights_as: "Lights show as" },
      (v) => {
        const prev = curList()[i] || {};
        // Keep the user's order for kinds that stay; new ones go to the end (#109).
        if (Array.isArray(v.kinds)) v.kinds = [...(prev.kinds || []).filter((k) => v.kinds.includes(k)), ...v.kinds.filter((k) => !(prev.kinds || []).includes(k))];
        if (v.mode === "kinds") delete v.mode;
        if (v.lights_as === "markers") delete v.lights_as;
        const next = curList().map((x, j) => (j === i ? { ...x, ...v, id: x.id } : x));
        if (v.mode === undefined) delete next[i].mode;
        if (v.lights_as === undefined) delete next[i].lights_as;
        this._config = this._prune({ ...this._config, custom_overlays: next });
        if ((v.mode || "kinds") !== (prev.mode || "kinds") || JSON.stringify(v.kinds) !== JSON.stringify(prev.kinds)) setTimeout(() => this._renderCustom(), 0);
        this._emit();
        this._engine(true);
        this._refreshForms();
        this._renderDevices();
        const hd = box.querySelector(`.row[data-i="${i}"] .hd`);
        if (hd) hd.innerHTML = `<ha-icon icon="${cesc(v.icon || "mdi:layers-outline")}"></ha-icon>${cesc(v.name || "Custom")}<small style="margin-left:auto">${cesc(o.id)}</small>`;
      },
    ));
    // Order of kinds (#109): the first one a device matches leads, the others become extra lines.
    if (o.mode !== "manual" && (o.kinds || []).length > 1) {
      const ord = document.createElement("div");
      ord.className = "kord";
      ord.innerHTML = `<h5>What leads (first match) · the rest show as small lines</h5>${o.kinds.map((k, n) => `<div class="kr"><span>${n + 1}. ${cesc(CUSTOM_KINDS[k] || k)}</span>${n ? `<button data-up="${n}" title="Move up">▲</button>` : ""}</div>`).join("")}`;
      for (const b of ord.querySelectorAll("[data-up]")) b.addEventListener("click", () => {
        const n = Number(b.dataset.up);
        const ks = [...o.kinds];
        [ks[n - 1], ks[n]] = [ks[n], ks[n - 1]];
        const next = curList().map((x, j) => (j === i ? { ...x, kinds: ks } : x));
        this._set({ ...this._config, custom_overlays: next }, { devices: false });
        this._renderCustom();
      });
      body.appendChild(ord);
    }
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.innerHTML = `<button class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove this overlay</button>`;
    btns.querySelector(".del").addEventListener("click", () => {
      const next = curList().filter((_x, j) => j !== i);
      const c = { ...this._config, custom_overlays: next };
      if (Array.isArray(c.overlays)) c.overlays = c.overlays.filter((x) => x !== o.id);
      if (c.default_overlay === o.id) delete c.default_overlay;
      if (c.devices) {
        const devs = {};
        for (const [id, d] of Object.entries(c.devices)) {
          const dd = { ...d };
          for (const k of ["hide_in", "add_to"]) if (Array.isArray(dd[k])) dd[k] = dd[k].filter((x) => x !== o.id);
          for (const k of ["hide_in", "add_to"]) if (Array.isArray(dd[k]) && !dd[k].length) delete dd[k];
          if (Object.keys(dd).length) devs[id] = dd;
        }
        c.devices = devs;
      }
      this._copen = null;
      this._set(c, { sections: true });
    });
    body.appendChild(btns);
  },

  // ---- light scenes (#54)
  // ---- 0.8.2 Overlay Bar Reloaded: hold, status, shortcuts
  _statusSchema(st, allowAuto) {
    const mode = st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off");
    const show = st.show === "icon" ? "color" : st.show || "dot";
    const badge = show === "count" || show === "value";
    return [
      { name: "st_mode", selector: { select: { options: [...(allowAuto ? [{ value: "auto", label: "Automatic" }] : []), { value: "off", label: "None" }, { value: "custom", label: "From entities I pick" }], mode: "dropdown" } } },
      ...(mode === "custom" ? [
        { name: "st_entity", selector: { entity: { multiple: true } } },
        { name: "st_show", selector: { select: { options: [{ value: "color", label: "Icon colour" }, { value: "dot", label: "Dot" }, { value: "count", label: "Badge: how many are active" }, { value: "value", label: "Badge: short value (e.g. 62%)" }], mode: "dropdown" } } },
        ...(badge
          ? [{ name: "st_when_1", selector: { text: {} } }, { name: "st_color_1", selector: { text: {} } }]
          : [1, 2, 3].flatMap((n) => [{ name: `st_when_${n}`, selector: { text: {} } }, { name: `st_color_${n}`, selector: { text: {} } }])),
      ] : []),
    ];
  },

  _statusData(st, allowAuto) {
    const rules = Array.isArray(st.rules) && st.rules.length ? st.rules : [{ when: st.when, color: st.color }];
    const d = { st_mode: st.mode || (allowAuto ? "auto" : st.entity ? "custom" : "off"), st_entity: Array.isArray(st.entity) ? st.entity : st.entity ? [st.entity] : [], st_show: st.show === "icon" ? "color" : st.show || "dot" };
    for (const n of [1, 2, 3]) {
      d[`st_when_${n}`] = (rules[n - 1] || {}).when || "";
      d[`st_color_${n}`] = (rules[n - 1] || {}).color || "";
    }
    return d;
  },

  _statusFrom(v, allowAuto) {
    const mode = v.st_mode || (allowAuto ? "auto" : "off");
    if (mode === "auto" && allowAuto) return null;
    if (mode === "off") return allowAuto ? { mode: "off" } : null;
    const st = { mode: "custom", entity: v.st_entity || [], show: v.st_show || "dot" };
    if (st.show === "count" || st.show === "value") {
      if (v.st_when_1) st.when = v.st_when_1;
      if (v.st_color_1) st.color = v.st_color_1;
    } else {
      const rules = [1, 2, 3].map((n) => ({ when: v[`st_when_${n}`] || "", color: v[`st_color_${n}`] || "" })).filter((r) => r.when || r.color);
      if (rules.length) st.rules = rules.map((r) => ({ ...(r.when ? { when: r.when } : {}), ...(r.color ? { color: r.color } : {}) }));
    }
    return st;
  },

  /** 0.10: Overlay actions (buttons under the plan), per overlay and per floor. */
  /** The floor picked in the tabs (its plan id). */
  _curFloor() {
    const ids = this._planIds();
    return ids[Math.min(this._ftab || 0, Math.max(0, ids.length - 1))] || null;
  },

  /** Is a per-floor list (actions, scenes: items with plans) in scope: this floor, or every floor (no plans)? */
  _inScope(x, scope) {
    const pl = Array.isArray(x.plans) ? x.plans : [];
    return scope ? pl.includes(scope) : !pl.length;
  },

  /** 0.10: overlay actions on this floor (in the floor menu) and on every floor (card settings). */
  _renderActs() {
    this._actsIn("#oacts", null);
    this._actsIn("#oacts_f", this._curFloor());
  },

  _actsIn(sel, scope) {
    const box = this.querySelector(sel);
    if (!box) return;
    const curList = () => Array.isArray(this._config.overlay_actions) ? this._config.overlay_actions : []; // read fresh: edits save without a redraw
    const idx = curList().map((_x, i) => i).filter((i) => this._inScope(curList()[i], scope));
    const plans = planSensors(this._hass).map((x) => ({ value: x.attributes.plan_id, label: x.attributes.plan_name || x.attributes.plan_id }));
    const ovName = (o) => (this._ovOptions().find((x) => x.value === o) || {}).label || o;
    const save = (next, redraw = true) => {
      const c = { ...this._config, overlay_actions: next };
      if (!next.length) delete c.overlay_actions;
      this._config = this._prune(c);
      this._emit();
      if (redraw) this._renderActs();
    };
    const rb = (this._config.cleaning || {}).robot_buttons !== false;
    box.innerHTML = (scope ? "" : `<div class="oaopt"></div>`) + idx.map((i) => [curList()[i], i]).map(([x, i]) => `<div class="row" data-i="${i}"><button class="hd" data-aopen="${i}"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"></ha-icon>${cesc(x.name || `Action ${i + 1}`)}<small style="margin-left:auto">${cesc(ovName(x.overlay || "cleaning"))} · ${cesc(Array.isArray(x.plans) && x.plans.length ? x.plans.map((id) => (plans.find((q) => q.value === id) || {}).label || id).join(", ") : "every floor")}</small></button>${this._aopen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-aadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add action</button>`;
    if (!scope) box.querySelector(".oaopt").appendChild(this._form([{ name: "rb", selector: { boolean: {} } }], { rb }, { rb: "Cleaning: the robot's Start / Pause / Dock under the plan" }, (v) => {
      const c = { ...(this._config.cleaning || {}) };
      if (v.rb) delete c.robot_buttons;
      else c.robot_buttons = false;
      const nc = { ...this._config, cleaning: c };
      if (!Object.keys(c).length) delete nc.cleaning;
      this._config = this._prune(nc);
      this._emit();
    }));
    box.querySelector("[data-aadd]").addEventListener("click", () => {
      this._aopen = curList().length;
      save([...curList(), { name: "Action", icon: "mdi:gesture-tap", overlay: "cleaning", ...(scope ? { plans: [scope] } : {}) }]);
    });
    for (const el of box.querySelectorAll("[data-aopen]")) el.addEventListener("click", () => {
      const i = Number(el.dataset.aopen);
      this._aopen = this._aopen === i ? null : i;
      this._renderActs();
    });
    const body = this._aopen != null && box.querySelector(`.row[data-i="${this._aopen}"] .body`);
    if (!body) return;
    const i = this._aopen;
    const x = curList()[i] || {};
    const tk = (x.tap_action || {}).action;
    const bm = tk === "fire-dom-event" && x.tap_action.browser_mod && x.tap_action.browser_mod.service === "browser_mod.popup" ? x.tap_action.browser_mod.data || {} : null;
    const data = {
      name: x.name || "", icon: x.icon || "", overlay: x.overlay || "cleaning", plans: Array.isArray(x.plans) ? x.plans : [],
      tap_kind: bm ? "popup" : x.tap_action ? "action" : "details",
      tap_action: !bm && tk ? x.tap_action : undefined,
      popup_title: bm ? bm.title || "" : "", popup_card: bm ? bm.content : undefined,
      hold_kind: x.hold_action ? "action" : "details",
      hold_action: x.hold_action || undefined,
      ...this._statusData(x.status || {}, false),
    };
    const LBL = { name: "Name", icon: "Icon", overlay: "Shown in", plans: "Floors (none ticked = every floor)", tap_kind: "Tap", tap_action: "Tap action", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)", hold_kind: "Hold", hold_action: "Hold action", st_mode: "Status on the button", st_entity: "Entities", st_show: "Shows", st_when_1: "When (states like cleaning, on, or a number test like >50; empty = on / open / armed / unlocked)", st_color_1: "Colour (e.g. green, #E5534B)", st_when_2: "Else when", st_color_2: "Colour", st_when_3: "Else when", st_color_3: "Colour" };
    const schema = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "overlay", selector: { select: { options: this._ovOptions(), mode: "dropdown" } } },
      { name: "plans", selector: { select: { options: plans, multiple: true, mode: "list" } } },
      { name: "tap_kind", selector: { select: { options: [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action (script, scene, service, page…)" }, { value: "popup", label: "Popup on this browser only (browser_mod)" }], mode: "dropdown" } } },
      ...(data.tap_kind === "action" ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
      ...(data.tap_kind === "popup" ? [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }] : []),
      { name: "hold_kind", selector: { select: { options: [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action" }], mode: "dropdown" } } },
      ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
      ...this._statusSchema(x.status || {}, false),
    ];
    body.appendChild(this._form(schema, data, LBL, (v) => {
      const nx = { name: v.name || "", icon: v.icon || "", overlay: v.overlay || "cleaning" };
      if (Array.isArray(v.plans) && v.plans.length) nx.plans = v.plans;
      if (v.tap_kind === "action") nx.tap_action = v.tap_action && v.tap_action.action ? v.tap_action : { action: "perform-action" };
      else if (v.tap_kind === "popup") nx.tap_action = { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(v.popup_title ? { title: v.popup_title } : {}), content: v.popup_card || { type: "markdown", content: "Pick a card" } } } };
      if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "perform-action" };
      const st = this._statusFrom(v, false);
      if (st) nx.status = st;
      const redraw = v.tap_kind !== data.tap_kind || v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
      save(curList().map((y, j) => (j === i ? nx : y)), redraw);
    }));
    const at = idx.indexOf(i);
    body.insertAdjacentHTML("beforeend", `<div class="btns"><button data-amv="-1" ${at <= 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon>Up</button><button data-amv="1" ${at >= idx.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon>Down</button><button class="del" data-adel="1"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button></div>`);
    for (const el of body.querySelectorAll("[data-amv]")) el.addEventListener("click", () => {
      const j = idx[at + Number(el.dataset.amv)];
      const next = [...curList()];
      [next[i], next[j]] = [next[j], next[i]];
      this._aopen = j;
      save(next);
    });
    body.querySelector("[data-adel]").addEventListener("click", () => {
      this._aopen = null;
      save(curList().filter((_y, j) => j !== i));
    });
  },

  _renderBar() {
    const box = this.querySelector("#bbar");
    if (!box) return;
    const b = this._config.buttons || {};
    const actions = b.actions || {};
    const shortcuts = Array.isArray(b.shortcuts) ? b.shortcuts : [];
    const ovs = (Array.isArray(this._config.overlays) && this._config.overlays.length ? this._config.overlays : [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)]).filter((o) => o !== "plan" && o !== "people");
    const def = (o) => OVERLAYS[o] || (this._custom().find((x) => x.id === o) ? { label: this._custom().find((x) => x.id === o).name || "Custom", icon: this._custom().find((x) => x.id === o).icon || "mdi:layers-outline" } : null);
    const AUTO = { lights: "badge with how many of the lights the Lights overlay shows are on", security: "red dot when a door or window is open, the alarm armed or a lock unlocked (not shutters)", health: "amber dot when a battery is low or a device offline", network: "red dot when a device is offline", cleaning: "red dot when a robot reports an error, amber when it needs attention" };
    const actTxt = (a) => (!a ? "" : { reload: "reload page", back: "back", navigate: "open a page", url: "open a link", "more-info": "details", "perform-action": "action", "call-service": "action", toggle: "toggle", "fire-dom-event": "popup", assist: "Assist", none: "" }[a.action] || a.action);
    const stTxt = (st, o) => (st && st.mode === "off" ? "no status" : st && st.mode === "auto" ? "auto status" : st && st.mode === "custom" ? `status: ${{ color: "icon colour", icon: "icon colour", dot: "dot", count: "badge", value: "badge" }[st.show || "dot"]}` : o && AUTO[o] && b.auto_status ? "auto status" : "");
    const save = (nb, redraw = true) => {
      const next = { ...nb };
      if (next.actions && !Object.keys(next.actions).length) delete next.actions;
      if (next.shortcuts && !next.shortcuts.length) delete next.shortcuts;
      this._config = this._prune({ ...this._config, buttons: next });
      this._emit();
      if (redraw) this._renderBar();
    };
    const rows = [
      ...ovs.filter(def).map((o) => ({ key: `o:${o}`, icon: def(o).icon, name: (this._config.overlay_names || {})[o] || def(o).label, small: [actions[o] && actions[o].hold_action ? `hold: ${actTxt(actions[o].hold_action)}` : "", stTxt((actions[o] || {}).status, o)].filter(Boolean).join(" · ") || "overlay" })),
      ...shortcuts.map((sc, i) => ({ key: `s:${i}`, icon: sc.icon || "mdi:gesture-tap", name: sc.name || `Shortcut ${i + 1}`, small: [sc.hidden ? "hidden shortcut" : "shortcut", sc.tap_action ? `tap: ${actTxt(sc.tap_action)}` : "", sc.hold_action ? `hold: ${actTxt(sc.hold_action)}` : "", stTxt(sc.status)].filter(Boolean).join(" · ") })),
    ];
    box.innerHTML = rows.map((r) => `<div class="row" data-bk="${cesc(r.key)}"><button class="hd" data-bopen="${cesc(r.key)}"><ha-icon icon="${cesc(r.icon)}"></ha-icon>${cesc(r.name)}<small style="margin-left:auto">${cesc(r.small)}</small></button>${this._bopen === r.key ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-badd="1"><ha-icon icon="mdi:plus"></ha-icon>Add shortcut</button>`;
    box.querySelector("[data-badd]").addEventListener("click", () => {
      this._bopen = `s:${shortcuts.length}`;
      save({ ...b, shortcuts: [...shortcuts, { name: "Shortcut", icon: "mdi:gesture-tap" }] });
    });
    for (const el of box.querySelectorAll("[data-bopen]")) el.addEventListener("click", () => {
      this._bopen = this._bopen === el.dataset.bopen ? null : el.dataset.bopen;
      this._renderBar();
    });
    const body = this._bopen && box.querySelector(`.row[data-bk="${CSS.escape(this._bopen)}"] .body`);
    if (!body) return;
    const [kind, id] = [this._bopen.slice(0, 1), this._bopen.slice(2)];
    const LBL = { hold_action: "Hold action", st_mode: "Status on the button", st_entity: "Entities", st_show: "Shows", st_when_1: "When (states like running, prepare, or a number test like >50; empty = on / open / armed / unlocked)", st_color_1: "Colour (e.g. green, #E5534B)", st_when_2: "Else when", st_color_2: "Colour", st_when_3: "Else when", st_color_3: "Colour", name: "Name", icon: "Icon", shown: "Show in the Overlay Bar (off: it stays here with all its settings)", tap_kind: "Tap", tap_action: "Tap action", popup_title: "Popup title", popup_card: "Card in the popup (YAML, like any card)", hold_kind: "Hold" };
    if (kind === "o") {
      const cur = actions[id] || {};
      const hk = (cur.hold_action || {}).action;
      const canAuto = !!AUTO[id];
      const stData = this._statusData(cur.status || {}, canAuto);
      if (canAuto && !cur.status) stData.st_mode = b.auto_status ? "auto" : "off"; // 0.13.1: unset follows the switch above
      const data = { hold_kind: hk === "reload" || hk === "back" ? hk : cur.hold_action ? "action" : "none", hold_action: hk && hk !== "reload" && hk !== "back" ? cur.hold_action : undefined, ...stData };
      const schema = [
        { name: "hold_kind", selector: { select: { options: [{ value: "none", label: "Nothing" }, { value: "action", label: "A Home Assistant action" }, { value: "reload", label: "Reload this page" }, { value: "back", label: "Back to where you were" }], mode: "dropdown" } } },
        ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
        ...this._statusSchema(cur.status || { mode: stData.st_mode }, canAuto),
      ];
      const f = this._form(schema, data, LBL, (v) => {
        const nx = {};
        if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
        else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
        // 0.13.1: the status is written only once you change it; "Automatic" chosen here is kept for this button.
        const touched = !!cur.status || v.st_mode !== data.st_mode;
        const st = !touched ? null : v.st_mode === "auto" && canAuto ? { mode: "auto" } : this._statusFrom(v, canAuto);
        if (st) nx.status = st;
        const na = { ...actions };
        if (Object.keys(nx).length) na[id] = nx;
        else delete na[id];
        const redraw = v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
        save({ ...b, actions: na }, redraw);
      });
      body.appendChild(f);
      if (AUTO[id]) body.insertAdjacentHTML("beforeend", `<p class="note">Automatic: ${cesc(AUTO[id])}, for the floor shown. A button you haven't set follows <i>Automatic status</i> above.</p>`);
      return;
    }
    const i = Number(id);
    const sc = shortcuts[i] || {};
    const tk = (sc.tap_action || {}).action;
    const bm = tk === "fire-dom-event" && sc.tap_action.browser_mod && sc.tap_action.browser_mod.service === "browser_mod.popup" ? sc.tap_action.browser_mod.data || {} : null;
    const hk = (sc.hold_action || {}).action;
    const data = {
      name: sc.name || "", icon: sc.icon || "", shown: sc.hidden !== true,
      tap_kind: bm ? "popup" : tk === "reload" || tk === "back" ? tk : sc.tap_action ? "action" : "details",
      tap_action: !bm && tk && tk !== "reload" && tk !== "back" ? sc.tap_action : undefined,
      popup_title: bm ? bm.title || "" : "", popup_card: bm ? bm.content : undefined,
      hold_kind: hk === "reload" || hk === "back" ? hk : sc.hold_action ? "action" : "details",
      hold_action: hk && hk !== "reload" && hk !== "back" ? sc.hold_action : undefined,
      ...this._statusData(sc.status || {}, false),
    };
    const kinds = (withPopup) => [{ value: "details", label: "Details of the status entity" }, { value: "action", label: "A Home Assistant action (page, link, action…)" }, ...(withPopup ? [{ value: "popup", label: "Popup on this browser only (browser_mod)" }] : []), { value: "reload", label: "Reload this page" }, { value: "back", label: "Back to where you were" }];
    const schema = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "shown", selector: { boolean: {} } },
      { name: "tap_kind", selector: { select: { options: kinds(true), mode: "dropdown" } } },
      ...(data.tap_kind === "action" ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
      ...(data.tap_kind === "popup" ? [{ name: "popup_title", selector: { text: {} } }, { name: "popup_card", selector: { object: {} } }] : []),
      { name: "hold_kind", selector: { select: { options: kinds(false), mode: "dropdown" } } },
      ...(data.hold_kind === "action" ? [{ name: "hold_action", selector: { ui_action: {} } }] : []),
      ...this._statusSchema(sc.status || {}, false),
    ];
    body.appendChild(this._form(schema, data, LBL, (v) => {
      const nx = { name: v.name || "", icon: v.icon || "" };
      if (v.shown === false) nx.hidden = true; // test10: kept with all its settings, not drawn in the Overlay Bar
      if (v.tap_kind === "reload" || v.tap_kind === "back") nx.tap_action = { action: v.tap_kind };
      else if (v.tap_kind === "action") nx.tap_action = v.tap_action && v.tap_action.action ? v.tap_action : { action: "navigate", navigation_path: "/" };
      else if (v.tap_kind === "popup") nx.tap_action = { action: "fire-dom-event", browser_mod: { service: "browser_mod.popup", data: { ...(v.popup_title ? { title: v.popup_title } : {}), content: v.popup_card || { type: "markdown", content: "Pick a card" } } } };
      if (v.hold_kind === "reload" || v.hold_kind === "back") nx.hold_action = { action: v.hold_kind };
      else if (v.hold_kind === "action") nx.hold_action = v.hold_action && v.hold_action.action ? v.hold_action : { action: "navigate", navigation_path: "/" };
      const st = this._statusFrom(v, false);
      if (st) nx.status = st;
      const redraw = (v.shown !== false) !== data.shown || v.tap_kind !== data.tap_kind || v.hold_kind !== data.hold_kind || v.st_mode !== data.st_mode || (v.st_show === "count" || v.st_show === "value") !== (data.st_show === "count" || data.st_show === "value");
      save({ ...b, shortcuts: shortcuts.map((x, j) => (j === i ? nx : x)) }, redraw);
    }));
    body.insertAdjacentHTML("beforeend", `<div class="btns"><button data-bmv="-1" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon>Up</button><button data-bmv="1" ${i === shortcuts.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon>Down</button><button class="del" data-bdel="1"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button></div>`);
    for (const el of body.querySelectorAll("[data-bmv]")) el.addEventListener("click", () => {
      const j = i + Number(el.dataset.bmv);
      const next = [...shortcuts];
      [next[i], next[j]] = [next[j], next[i]];
      this._bopen = `s:${j}`;
      save({ ...b, shortcuts: next });
    });
    body.querySelector("[data-bdel]").addEventListener("click", () => {
      this._bopen = null;
      save({ ...b, shortcuts: shortcuts.filter((x, j) => j !== i) });
    });
  },

  /** Light scenes on this floor (floor menu) and on every floor (card settings). */
  _renderScenes() {
    this._scenesIn("#scenes", null);
    this._scenesIn("#scenes_f", this._curFloor());
  },

  _scenesIn(sel, scope) {
    const box = this.querySelector(sel);
    if (!box) return;
    const curList = () => { const l = (this._config.lights || {}).scenes; return Array.isArray(l) ? l : []; }; // read fresh: edits save without a redraw
    const idx = curList().map((_x, i) => i).filter((i) => this._inScope(curList()[i], scope));
    const setList = (next, sections = true) => {
      const lights = { ...(this._config.lights || {}), scenes: next };
      if (!next.length) delete lights.scenes;
      if (sections) {
        this._set({ ...this._config, lights }, { devices: false, sections: true });
      } else {
        this._config = this._prune({ ...this._config, lights });
        this._emit();
      }
    };
    box.innerHTML = idx.map((i) => [curList()[i], i]).map(([s, i]) => `<div class="row" data-i="${i}"><button class="hd" data-sopen="${i}"><ha-icon icon="${cesc(s.icon || "mdi:palette-outline")}"></ha-icon>${cesc(s.name || `Scene ${i + 1}`)}<small style="margin-left:auto">${s.entity ? cesc(s.entity) : `${(s.lights || []).length} lights${s.states ? " · saved state" : ""}`}</small></button>${this._sopen === i ? `<div class="body"></div>` : ""}</div>`).join("") + `<button class="add" data-sadd="1"><ha-icon icon="mdi:plus"></ha-icon>Add scene</button>`;
    box.querySelector("[data-sadd]").addEventListener("click", () => {
      this._sopen = curList().length;
      setList([...curList(), { name: curList().length ? `Scene ${curList().length + 1}` : "Movie night", icon: "mdi:movie-open-outline", lights: [], brightness: 30, ...(scope ? { plans: [scope] } : {}) }]);
    });
    for (const b of box.querySelectorAll("[data-sopen]")) b.addEventListener("click", () => {
      const i = Number(b.dataset.sopen);
      this._sopen = this._sopen === i ? null : i;
      this._renderScenes();
    });
    const body = this._sopen != null && box.querySelector(`.row[data-i="${this._sopen}"] .body`);
    if (!body) return;
    const i = this._sopen;
    const s = curList()[i];
    body.appendChild(this._form(
      [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "lights", selector: { entity: { multiple: true, filter: [{ domain: "light" }, { domain: "switch" }] } } },
        { name: "brightness", selector: { number: { min: 0, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "entity", selector: { entity: { filter: [{ domain: "scene" }, { domain: "script" }] } } },
        { name: "plans", selector: { select: { options: planSensors(this._hass).map((x) => ({ value: x.attributes.plan_id, label: x.attributes.plan_name || x.attributes.plan_id })), multiple: true, mode: "list" } } },
      ],
      { lights: [], brightness: 50, plans: [], ...s },
      { name: "Button name", icon: "Icon", lights: "Lights in this scene", brightness: "Brightness (0 = off), unless the state is saved below", entity: "…or run a Home Assistant scene / script instead", plans: "Floors (none ticked = every floor)" },
      (v) => {
        const next = curList().map((x, j) => (j === i ? { ...v, ...(x.states ? { states: x.states } : {}) } : x));
        if (!next[i].entity) delete next[i].entity;
        if (!(next[i].plans || []).length) delete next[i].plans;
        if (JSON.stringify(next[i].plans || []) !== JSON.stringify(s.plans || [])) return setList(next);
        if (next[i].states) for (const e of Object.keys(next[i].states)) if (!(next[i].lights || []).includes(e)) delete next[i].states[e];
        setList(next, false);
        const hd = box.querySelector(`.row[data-i="${i}"] .hd`);
        if (hd) hd.innerHTML = `<ha-icon icon="${cesc(v.icon || "mdi:palette-outline")}"></ha-icon>${cesc(v.name || `Scene ${i + 1}`)}`;
      },
    ));
    const btns = document.createElement("div");
    btns.className = "btns";
    btns.innerHTML = `<button class="cap"><ha-icon icon="mdi:camera-outline"></ha-icon>Save the lights' current state</button>${s.states ? `<button class="clr"><ha-icon icon="mdi:close"></ha-icon>Forget saved state</button>` : ""}<button class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove scene</button>`;
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = s.states ? `Saved: on/off, brightness and colour of ${Object.keys(s.states).length} light(s).` : "Tip: set the lights the way you want them, then save their current state.";
    btns.querySelector(".cap").addEventListener("click", () => {
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      const sc = { ...cur[i] };
      const states = {};
      for (const e of sc.lights || []) {
        const st = this._hass.states[e];
        if (!st) continue;
        if (st.state !== "on") {
          states[e] = { state: "off" };
          continue;
        }
        const a = st.attributes || {};
        const w = { state: "on" };
        if (num(a.brightness)) w.brightness_pct = Math.round((a.brightness / 255) * 100);
        if (a.color_mode === "color_temp" && a.color_temp_kelvin) w.color_temp_kelvin = a.color_temp_kelvin;
        else if (Array.isArray(a.rgb_color) && a.color_mode && a.color_mode !== "brightness" && a.color_mode !== "onoff") w.rgb_color = a.rgb_color;
        states[e] = w;
      }
      sc.states = states;
      setList(cur.map((x, j) => (j === i ? sc : x)));
    });
    const clr = btns.querySelector(".clr");
    if (clr) clr.addEventListener("click", () => {
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      setList(cur.map((x, j) => {
        if (j !== i) return x;
        const y = { ...x };
        delete y.states;
        return y;
      }));
    });
    btns.querySelector(".del").addEventListener("click", () => {
      this._sopen = null;
      const cur = (this._config.lights && this._config.lights.scenes) || curList();
      setList(cur.filter((_x, j) => j !== i));
    });
    body.appendChild(btns);
    body.appendChild(note);
  },

  // ---- rooms (#53)
  /** The areas of the floor picked in the tabs (0.8.1: Rooms are set per floor). */
  _floorAreas() {
    const ids = this._planIds();
    const id = ids[Math.min(this._ftab || 0, Math.max(0, ids.length - 1))];
    const sen = planSensors(this._hass).find((x) => x.attributes.plan_id === id);
    return sen ? sen.attributes.areas || {} : {};
  },

  _renderRooms() {
    const r0 = this._config.rooms || {};
    const r = { style: "label", size: "m", hidden: [], names: {}, ...r0, show_in: Array.isArray(r0.show_in) ? r0.show_in.map((o) => (o === "plan" ? "live" : o)) : ["live"] };
    const save = (patch) => {
      this._config = this._prune({ ...this._config, rooms: { ...r, ...(this._config.rooms || {}), ...patch } });
      this._emit();
    };
    // Whole card: how names look and where they show.
    const g = this.querySelector("#roomsg");
    if (g) {
      g.innerHTML = "";
      g.appendChild(this._form(
        [
          { name: "show_in", selector: { select: { options: this._ovOptions(), multiple: true, mode: "list" } } },
          { name: "style", selector: { select: { options: [{ value: "label", label: "Text only" }, { value: "pill", label: "Text on a chip" }, { value: "pill_icon", label: "Chip with the room's icon" }], mode: "dropdown" } } },
          { name: "size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
        ],
        { show_in: r.show_in, style: r.style, size: r.size },
        { show_in: "Room names shown by default in (viewers can switch them under Layers)", style: "Style", size: "Size" },
        (v) => save({ show_in: v.show_in, style: v.style, size: v.size }),
      ));
    }
    // This floor: custom names and hidden Rooms (other floors' choices are kept).
    const box = this.querySelector("#rooms");
    if (!box) return;
    box.innerHTML = "";
    const areas = this._floorAreas();
    if (!Object.keys(areas).length) {
      box.innerHTML = `<p>No Rooms on this floor yet. Place them in the Floorplan Editor (step Rooms).</p>`;
      return;
    }
    const here = Object.keys(areas);
    const roomOpts = Object.entries(areas).map(([value, a]) => ({ value, label: a.name }));
    const labels = { hidden: "Hide these Rooms on the card" };
    for (const [id, a] of Object.entries(areas)) labels[id] = `${a.name}: name on the card`;
    const names0 = r.names || {};
    box.appendChild(this._form(
      [
        { name: "hidden", selector: { select: { options: roomOpts, multiple: true, mode: "dropdown" } } },
        { type: "expandable", name: "names", title: "Custom Room names", schema: here.map((id) => ({ name: id, selector: { text: {} } })) },
      ],
      { hidden: (r.hidden || []).filter((h) => here.includes(h)), names: Object.fromEntries(here.filter((k) => names0[k]).map((k) => [k, names0[k]])) },
      labels,
      (v) => {
        const cur = this._config.rooms || {};
        const names = Object.fromEntries(Object.entries(cur.names || {}).filter(([k]) => !here.includes(k)));
        for (const [k, n] of Object.entries(v.names || {})) if (n) names[k] = n;
        const hidden = [...(cur.hidden || []).filter((h) => !here.includes(h)), ...(v.hidden || [])];
        save({ names, hidden });
      },
    ));
  },
});
