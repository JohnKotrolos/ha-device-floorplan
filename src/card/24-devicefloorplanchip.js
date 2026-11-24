/** A chip outside the plan: icon, label, optional value (entity or phantom); glows while its overlay shows. */
class DeviceFloorplanChip extends HTMLElement {
  static getConfigElement() {
    return document.createElement("device-floorplan-chip-editor");
  }

  static getStubConfig() {
    return { overlay: "lights", label: "Lights", icon: "mdi:lightbulb-group-outline" };
  }

  setConfig(c) {
    this._config = { ...(c || {}) };
    this._key = null;
    this._render();
  }

  set hass(h) {
    this._hass = h;
    this._tplSub();
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 3, rows: 1, min_columns: 2, min_rows: 1 };
  }

  connectedCallback() {
    this._onOv = this._onOv || (() => this._render(true));
    window.addEventListener("device-floorplan-overlay", this._onOv);
    this._tplSub();
    this._render(true);
  }

  disconnectedCallback() {
    window.removeEventListener("device-floorplan-overlay", this._onOv);
    this._tplFor = undefined;
    if (this._tplUnsub) this._tplUnsub.then((u) => u && u()).catch(() => {});
    this._tplUnsub = null;
  }

  _active() {
    const c = this._config || {};
    if (!c.overlay) return false;
    const m = window.__dfpActive || {};
    return c.card_id ? m[c.card_id] === c.overlay : Object.values(m).includes(c.overlay);
  }

  _phantom() {
    const c = this._config || {};
    if (!c.phantom || !this._hass) return null;
    const [plan, pid] = String(c.phantom).split(":");
    const s = planSensors(this._hass).find((x) => x.attributes.plan_id === plan);
    const ph = s && s.attributes.phantoms ? s.attributes.phantoms[pid] || null : null;
    if (!ph) return null;
    // #126: like the card, a member counts with its main entity (not every entity of its device).
    const devs = s.attributes.devices || {};
    const ents = s.attributes.entities || {};
    const mem = (ph.members || []).map((m) => (String(m).startsWith("entity:") ? { ...(ents[String(m).slice(7)] || {}), main_entity: String(m).slice(7) } : devs[m] || {}));
    const mains = mem.map((d) => d.main_entity).filter(Boolean);
    return { ...ph, mains, units: phUnits(mem) };
  }

  /** #96: a bond ("plan_id:bond_id") as the value source. */
  _bond() {
    const c = this._config || {};
    if (!c.bond || !this._hass) return null;
    const [plan, bid] = String(c.bond).split(":");
    const s = planSensors(this._hass).find((x) => x.attributes.plan_id === plan);
    return s && s.attributes.bonds ? s.attributes.bonds[bid] || null : null;
  }

  _bondValue(b) {
    const h = this._hass;
    const ents = (b.entities || []).filter((e) => h.states[e]);
    if (!ents.length) return "";
    const nums = ents.map((e) => h.states[e]).filter((s) => live(s) && num(s.state));
    if (nums.length === ents.length) {
      const v = nums.reduce((x, y) => x + Number(y.state), 0) / nums.length;
      const unit = nums[0].attributes.unit_of_measurement || "";
      return `${Math.round(v * 10) / 10}${unit === "%" ? "" : " "}${unit}`.trim();
    }
    const on = ents.filter((e) => ["on", "open", "playing", "home"].includes(h.states[e].state)).length;
    if (ents.length === 1) return h.formatEntityState ? h.formatEntityState(h.states[ents[0]]) : h.states[ents[0]].state;
    return on === 0 ? "Off" : on === ents.length ? "On" : `${on} of ${ents.length} on`;
  }

  /** 0.7.4: what the value counts, when it counts something: { n, total, word: "on" | "open" }. */
  _count() {
    const c = this._config || {};
    const h = this._hass;
    if (!h) return null;
    const ON = ["on", "open", "opening", "playing", "home", "unlocked"];
    const isOn = (e) => !!h.states[e] && ON.includes(h.states[e].state);
    const wordOf = (list) => (list.some((e) => kindOf(e, h.states[e]) === "opening" || domainOf(e) === "cover") ? "open" : "on");
    if (c.entity && h.states[c.entity]) {
      const grp = h.states[c.entity].attributes.entity_id;
      if (!Array.isArray(grp) || !grp.length || c.count === false) return null;
      // 0.11: count the group's own members, as Home Assistant does (a nested group is one);
      // entities of one bond (e.g. 3 bulbs in one lamp) count as one, like on the plan.
      const all = grp;
      const bondOf = {};
      for (const sen of planSensors(h)) for (const [bid, bd] of Object.entries(sen.attributes.bonds || {})) for (const e of bd.entities || []) bondOf[e] = `${sen.attributes.plan_id}:${bid}`;
      const units = [...all.reduce((m, e) => m.set(bondOf[e] || e, [...(m.get(bondOf[e] || e) || []), e]), new Map()).values()];
      return { n: units.filter((u) => u.some(isOn)).length, total: units.length, word: wordOf(all) };
    }
    const b = this._bond();
    if (b) {
      const ents = (b.entities || []).filter((e) => h.states[e]);
      if (ents.length < 2 || ents.every((e) => num(h.states[e].state))) return null;
      return { n: ents.filter(isOn).length, total: ents.length, word: wordOf(ents) };
    }
    const ph = this._phantom();
    if (!ph) return null;
    const mains = ph.mains || [];
    const kinds = mains.map((e) => kindOf(e, h.states[e]));
    if (kinds.some((k) => ["temperature", "humidity", "motion"].includes(k))) return null;
    if (kinds.includes("opening")) {
      const ops = mains.filter((e, i) => kinds[i] === "opening");
      return { n: ops.filter(isOn).length, total: ops.length, word: "open" };
    }
    const units = (ph.units || mains.map((e) => [e])).filter((u) => u.some((e) => ["light", "switch", "fan"].includes(kindOf(e, h.states[e]))));
    if (!units.length) return null;
    return { n: units.filter((u) => u.some(isOn)).length, total: units.length, word: "on" };
  }

  _value() {
    const c = this._config || {};
    const h = this._hass;
    if (!h) return "";
    const k = this._count();
    if (k) {
      // 0.7.4: value style: full "3 of 8 on" (default) or short "3 on" / "All off".
      if (c.value_style === "short") return k.n ? `${k.n} ${k.word}` : k.word === "open" ? "All closed" : "All off";
      return `${k.n} of ${k.total} ${k.word}`;
    }
    if (c.entity && h.states[c.entity]) return h.formatEntityState ? h.formatEntityState(h.states[c.entity]) : h.states[c.entity].state;
    const b = this._bond();
    if (b) return this._bondValue(b);
    const ph = this._phantom();
    return ph ? phantomSummary(h, ph) : "";
  }

  /** 0.7.4: the icon's glow colour ("" = none). Standard: while something is on; custom: a template. */
  _glow() {
    const c = this._config || {};
    if (c.glow === "custom") return String(this._tplRes || "").trim();
    if (c.glow !== "standard") return "";
    const k = this._count();
    const h = this._hass;
    const on = k ? k.n > 0 : !!(c.entity && h && h.states[c.entity] && ["on", "open", "opening", "playing", "home", "unlocked"].includes(h.states[c.entity].state));
    if (!on) return "";
    if (c.glow_color) return c.glow_color;
    return k && k.word === "open" ? "#5aa9ff" : c.overlay === "lights" || (k && k.word === "on") ? "#F2B84B" : "var(--primary-color)";
  }

  /** Custom glow: Home Assistant renders the template and sends every new result. */
  _tplSub() {
    const c = this._config || {};
    const want = c.glow === "custom" && c.glow_template && this.isConnected && this._hass && this._hass.connection ? c.glow_template : null;
    if (want === this._tplFor) return;
    if (this._tplUnsub) this._tplUnsub.then((u) => u && u()).catch(() => {});
    this._tplUnsub = null;
    this._tplFor = want;
    this._tplRes = "";
    if (!want) return;
    this._tplUnsub = this._hass.connection
      .subscribeMessage((m) => {
        this._tplRes = m && m.result != null ? m.result : "";
        this._render(true);
      }, { type: "render_template", template: want, report_errors: false })
      .catch(() => null);
  }

  _render(force = false) {
    if (!this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      // 0.7.4: tap, and hold (hold_action: any Home Assistant action, e.g. a browser_mod popup).
      const R = this.shadowRoot;
      R.addEventListener("pointerdown", (e) => {
        if (e.button > 0 || !(this._config || {}).hold_action) return;
        this._held = false;
        clearTimeout(this._holdT);
        this._holdT = setTimeout(() => {
          this._held = true;
          this._runHold();
        }, 500);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) R.addEventListener(ev, () => clearTimeout(this._holdT));
      R.addEventListener("contextmenu", (e) => {
        if ((this._config || {}).hold_action) e.preventDefault();
      });
      R.addEventListener("click", () => {
        if (this._held) {
          this._held = false;
          return;
        }
        this._tap();
      });
    }
    const c = this._config;
    const ph = this._phantom();
    const bd = this._bond();
    const label = c.label ?? (bd ? bondName(bd) : ph ? ph.name : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].label : "");
    const icon = c.icon || (bd ? bd.icon || (bd.domain === "light" ? "mdi:lightbulb-group" : "mdi:link-variant") : ph ? ph.icon || "dfp:phantom" : c.overlay && OVERLAYS[c.overlay] ? OVERLAYS[c.overlay].icon : "mdi:floor-plan");
    const val = this._value();
    const on = this._active();
    const glow = this._glow();
    const custom = c.glow === "custom" && glow;
    const key = [label, icon, val, on, glow].join("|");
    if (!force && key === this._key) return;
    this._key = key;
    setShadow(this, `<style>
      :host { display:block; }
      ha-card { height:100%; border-radius: var(--ha-card-border-radius, 12px); transition: box-shadow .25s, background .25s; }
      button { width:100%; height:100%; min-height:44px; border:0; background:transparent; color: var(--primary-text-color); font: inherit; display:flex; align-items:center; gap:8px; padding: 8px 12px; cursor:pointer; text-align:left; border-radius: inherit; }
      ha-icon { --mdc-icon-size: 22px; color: var(--secondary-text-color); flex:none; }
      .t { display:flex; flex-direction:column; min-width:0; line-height:1.2; }
      .l { font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .v { font-size:12px; color: var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      /* 0.7.4: the border says "selected" (its overlay shows); the icon glows while something is on. */
      ha-card.on { box-shadow: inset 0 0 0 2px var(--primary-color), 0 0 10px 0 color-mix(in srgb, var(--primary-color) 35%, transparent); }
      ha-icon.glow { color: var(--dfc-glow); filter: drop-shadow(0 0 5px var(--dfc-glow)); }
      .val.alert { color: var(--dfc-glow) !important; }
    </style><ha-card class="${on ? "on" : ""}" style="${glow ? `--dfc-glow:${cesc(glow)}` : ""}"><button aria-pressed="${on}" aria-label="${cesc([label, val].filter(Boolean).join(": "))}"><ha-icon class="${glow ? "glow" : ""}" icon="${cesc(icon)}"></ha-icon><span class="t">${c.value_first && val ? `<span class="l val${custom ? " alert" : ""}">${cesc(val)}</span><span class="v">${cesc(label)}</span>` : `<span class="l">${cesc(label)}</span>${val ? `<span class="v val${custom ? " alert" : ""}">${cesc(val)}</span>` : ""}`}</span></button></ha-card>`);
  }

  _tap() {
    const c = this._config || {};
    if (c.tap === "none") return;
    if (c.tap === "bond") {
      const b = this._bond();
      const ents = b ? (b.entities || []).filter((e) => TOGGLE_DOMAINS.has(domainOf(e))) : [];
      if (ents.length) {
        const anyOn = ents.some((e) => this._hass.states[e] && this._hass.states[e].state === "on");
        this._hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
      }
      return;
    }
    if (c.tap === "more-info" && c.entity) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: c.entity }, bubbles: true, composed: true }));
      return;
    }
    if (!c.overlay) return;
    // 0.7.4: tapping the chip of the overlay that already shows goes back to the card's default overlay.
    const back = c.toggle !== false && this._active();
    window.dispatchEvent(new CustomEvent("device-floorplan-action", { detail: { card_id: c.card_id || null, overlay: back ? "reset" : c.overlay } }));
  }

  _runHold() {
    const c = this._config || {};
    if (!c.hold_action) return;
    if (navigator.vibrate) navigator.vibrate(30);
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { ...c, tap_action: undefined, hold_action: c.hold_action }, action: "hold" }, bubbles: true, composed: true }));
  }
}

