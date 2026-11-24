class DeviceFloorplanCardEditor extends HTMLElement {
  setConfig(config) {
    // HA hands every config we emit straight back. Redrawing then would replace the field being
    // typed in, lose its focus and send the next keys to HA's shortcuts (#69).
    if (this._built && this._sent && stableJson(config) === this._sent) {
      this._config = { ...config };
      return;
    }
    this._config = { ...config };
    // 0.11: the test builds' "electricity" is "energy" (the card does the same), so the editor lists it too.
    if (Array.isArray(this._config.overlays) && this._config.overlays.includes("electricity")) this._config.overlays = this._config.overlays.map((o) => (o === "electricity" ? "energy" : o));
    if (this._config.electricity && !this._config.energy) this._config.energy = this._config.electricity;
    delete this._config.electricity;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
    else this.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    // 0.12.7: the Card Editor window's card gets live states (its preview acts like the card); the settings
    // column is not redrawn (only its fields get the new hass).
    if (this._big) {
      this._big.wrap.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
      if (this._big.card) this._big.card.hass = hass;
    }
  }

  connectedCallback() {
    // 0.12.6: a tap / long press on a device in HA's preview opens its settings (in the Card Editor window, Markers).
    if (this._onPvPick) return;
    this._onPvPick = (e) => {
      if (!this.isConnected || !this._config || !e.detail || !e.detail.id) return;
      const { id, ov } = e.detail;
      const go = () => {
        if (!this._big || !this._big.card) return;
        if (ov && this._big.card._overlay !== ov) this._big.card._setOverlay(ov);
        if (this._big.card._pick) this._big.card._pick(id);
      };
      if (this._big) return go();
      this._openBig();
      setTimeout(go, 500);
    };
    window.addEventListener("dfc-preview-pick", this._onPvPick);
  }

  disconnectedCallback() {
    if (this._onPvPick) window.removeEventListener("dfc-preview-pick", this._onPvPick);
    this._onPvPick = null;
    if (this._big) {
      this._big.wrap.remove();
      this._big = null;
    }
    // 0.11: the large preview belongs to the editor: it closes with it.
    EDIT_OV = null;
  }

  /** Switch HA's own preview card (and ours) to the overlay being edited. */
  _previewOv(o) {
    const seen = new Set();
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName === "DEVICE-FLOORPLAN-CARD" && el.preview && el._overlay !== o && el._overlays().includes(o)) el._setOverlay(o);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    try {
      let host = this;
      while (host.getRootNode && host.getRootNode() !== document) host = host.getRootNode().host || document;
      walk(host.shadowRoot || host);
    } catch (_e) {
      /* the preview just keeps its overlay */
    }
  }

  _emit() {
    this._sent = stableJson(this._config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    // 0.11.1 / 0.13.5: the Card Editor's preview follows every setting: every save comes through here.
    if (this._big && this._big.card) this._big.card.setConfig(this._config);
  }

  _set(c, { devices = true, sections = false } = {}) {
    this._config = this._prune(c);
    this._emit();
    this._engine(true);
    if (sections) this._renderSections();
    if (devices) this._renderDevices();
  }

  _planIds() {
    const c = this._config || {};
    const list = Array.isArray(c.plans) && c.plans.length ? c.plans : [c.plan];
    return [...new Set(list.filter(Boolean))];
  }

  /** All floors of this card merged (devices, rooms, bonds…), for the device and room lists. */
  _plan() {
    const all = planSensors(this._hass);
    const sens = this._planIds().map((id) => all.find((s) => s.attributes.plan_id === id)).filter(Boolean);
    if (!sens.length) return null;
    if (sens.length === 1) return sens[0];
    const a = { devices: {}, entities: {}, bonds: {}, areas: {}, phantoms: {} };
    for (const s of sens) for (const k of Object.keys(a)) Object.assign(a[k], s.attributes[k] || {});
    return { attributes: { ...sens[0].attributes, ...a } };
  }

  _setPlans(ids) {
    const c = { ...this._config };
    ids = [...new Set(ids.filter(Boolean))];
    if (ids.length > 1) {
      c.plans = ids;
      delete c.plan;
    } else {
      c.plan = ids[0] || "";
      delete c.plans;
      delete c.default_floor;
    }
    if (c.default_floor && !ids.includes(c.default_floor)) delete c.default_floor;
    this._set(c, { sections: true });
    this._renderFloors();
  }

  /** Floors as tabs: 1 · 2 · + (#75). */
  _renderFloors() {
    const box = this.querySelector("#floors");
    if (!box) return;
    const all = planSensors(this._hass);
    const ids = this._planIds();
    if (!ids.length && all[0]) ids.push(all[0].attributes.plan_id);
    if (this._ftab == null || this._ftab >= ids.length) this._ftab = 0;
    const name = (id) => {
      const s = all.find((x) => x.attributes.plan_id === id);
      return s ? s.attributes.plan_name || id : `${id} (not found)`;
    };
    const free = all.filter((s) => !ids.includes(s.attributes.plan_id));
    const cur = ids[this._ftab];
    box.innerHTML = `<div class="ftabs" role="tablist">${ids.map((id, i) => `<button class="${i === this._ftab ? "on" : ""}" data-ft="${i}" role="tab" title="${cesc(name(id))}">${i + 1}</button>`).join("")}<button class="add" data-fadd="1" title="Add a floor" ${free.length ? "" : "disabled"}>+</button></div>
      <div class="fbody"><select class="flt" data-fsel="1" aria-label="Plan of this floor">${all.map((s) => `<option value="${cesc(s.attributes.plan_id)}" ${s.attributes.plan_id === cur ? "selected" : ""} ${ids.includes(s.attributes.plan_id) && s.attributes.plan_id !== cur ? "disabled" : ""}>${cesc(s.attributes.plan_name || s.attributes.plan_id)}</option>`).join("")}</select>
      <button data-fmv="-1" title="Move left" ${this._ftab === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></button><button data-fmv="1" title="Move right" ${this._ftab >= ids.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></button><button data-fdel="1" title="Remove this floor from the card" ${ids.length < 2 ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>
      <p class="fhint">${ids.length > 1 ? "The Markers and Rooms below belong to this floor. On the card, the floor button under Layers switches floors." : "Add floors with + to switch between them on the card."}</p>`;
    box.querySelectorAll("[data-ft]").forEach((b) => b.addEventListener("click", () => {
      this._ftab = Number(b.dataset.ft);
      this._renderFloors();
      this._renderRooms();
      this._renderActs();
      this._renderScenes();
    }));
    const bb = this.querySelector("#bigbtn span");
    if (bb) bb.textContent = "Open the Card Editor";
    // 0.11.1: the home's one-line summary of this card.
    const ds = this.querySelector("#dsum");
    if (ds) {
      const c = this._config;
      const nOv = Array.isArray(c.overlays) && c.overlays.length ? c.overlays.length : this._engine()._overlays().length;
      const pos = (c.buttons || {}).position || "bottom";
      ds.textContent = `${ids.map(name).join(" + ") || "No plan yet"} · ${nOv} overlays · Overlay Bar: ${String(pos).replace("rail_", "rail ").replace("_", " ")}`;
    }
    // 0.11.1: in the Card Editor the floor tabs also switch the preview.
    if (this._big && cur && this._big.card._floor !== cur) {
      this._big.card._floor = cur;
      this._big.card._update(true);
      if (this._big.rerender) this._big.rerender();
    }
    const add = box.querySelector("[data-fadd]");
    if (add) add.addEventListener("click", () => {
      if (!free.length) return;
      const lv = (s) => (Number.isFinite(s.attributes.level) ? s.attributes.level : 99);
      const pick = free.slice().sort((x, y) => lv(x) - lv(y))[0];
      const next = [...ids, pick.attributes.plan_id];
      // Ordered by floor level by default.
      next.sort((x, y) => lv(all.find((s) => s.attributes.plan_id === x) || { attributes: {} }) - lv(all.find((s) => s.attributes.plan_id === y) || { attributes: {} }));
      this._ftab = next.indexOf(pick.attributes.plan_id);
      this._setPlans(next);
    });
    box.querySelector("[data-fsel]").addEventListener("change", (e) => {
      const next = ids.slice();
      next[this._ftab] = e.target.value;
      this._setPlans(next);
    });
    box.querySelectorAll("[data-fmv]").forEach((b) => b.addEventListener("click", () => {
      const d = Number(b.dataset.fmv);
      const next = ids.slice();
      const j = this._ftab + d;
      if (j < 0 || j >= next.length) return;
      [next[this._ftab], next[j]] = [next[j], next[this._ftab]];
      this._ftab = j;
      this._setPlans(next);
    }));
    const del = box.querySelector("[data-fdel]");
    if (del) del.addEventListener("click", () => {
      const next = ids.filter((_x, i) => i !== this._ftab);
      this._ftab = Math.max(0, this._ftab - 1);
      this._setPlans(next);
    });
    const o = this.querySelector("#fopts");
    if (o) o.innerHTML = "";
    if (ids.length > 1 && o) {
      o.appendChild(this._form(
        [
          { name: "default_floor", selector: { select: { options: [{ value: "", label: "The last one shown on this screen" }, ...ids.map((id) => ({ value: id, label: name(id) }))], mode: "dropdown" } } },
          { name: "floor_swipe", selector: { boolean: {} } },
        ],
        { default_floor: this._config.default_floor || "", floor_swipe: this._config.floor_swipe !== false },
        { default_floor: "Floor when the card opens", floor_swipe: "Swipe up / down on the plan to change floor (touch screens)" },
        (v) => {
          const c = { ...this._config };
          if (v.default_floor) {
            c.default_floor = v.default_floor;
            c.remember_floor = false;
          } else {
            delete c.default_floor;
            delete c.remember_floor;
          }
          if (v.floor_swipe === false) c.floor_swipe = false;
          else delete c.floor_swipe;
          this._config = this._prune(c);
          this._emit();
        },
      ));
    }
  }

  /** A card instance (not on screen) that answers "does this device show in that overlay?". */
  _engine(reset = false) {
    if (!this._eng || reset) {
      this._eng = document.createElement("device-floorplan-card");
      try {
        this._eng.setConfig({ ...this._config, plan: this._planIds()[0] || "-" });
      } catch (_e) {
        /* no plan yet */
      }
    }
    this._eng.hass = this._hass;
    return this._eng;
  }

  _custom() {
    return Array.isArray(this._config.custom_overlays) ? this._config.custom_overlays : [];
  }

  _ovOptions() {
    return [...[...OVERLAY_ORDER, "energy", "cleaning"].map((o) => ({ value: o, label: NEW_OVERLAYS.includes(o) ? `${OVERLAYS[o].label} ✨ new` : OVERLAYS[o].label })), ...this._custom().map((c) => ({ value: c.id, label: c.name || "Custom" }))];
  }

  /** The editor's settings forms, in display order (#70). */
  _schemas() {
    const ovOpts = this._ovOptions();
    const conns = [{ value: "all", label: "All connections" }, ...CONN_ORDER.map((c) => ({ value: c, label: CONNS[c].label }))];
    const rail = String((this._config.buttons || {}).position || "").startsWith("rail_");
    return {
      general: [
        { name: "title", selector: { text: {} } },
        { name: "card_id", selector: { text: {} } },
        { name: "hide_admin_hint", selector: { boolean: {} } },
      ],
      buttons: [
        { name: "overlays", selector: { select: { options: ovOpts, multiple: true, reorder: true, mode: "list" } } },
        { name: "default_overlay", selector: { select: { options: ovOpts, mode: "dropdown" } } },
        { name: "buttons_position", selector: { select: { options: [{ value: "bottom", label: "Below the plan" }, { value: "top", label: "Above the plan" }, { value: "left", label: "Left of the plan" }, { value: "right", label: "Right of the plan" }, { value: "rail_left", label: "Side Rail, left (full height, at the card's edge)" }, { value: "rail_right", label: "Side Rail, right (full height, at the card's edge)" }, { value: "hidden", label: "Hidden (switch from other cards, see Card ID)" }], mode: "dropdown" } } },
        { name: "buttons_bar", selector: { select: { options: [{ value: "contrast", label: "Contrast (dark on a light theme, light on a dark theme)" }, { value: "theme", label: "Theme colour" }, { value: "dark", label: "Dark" }, ...(rail ? [] : [{ value: "clear", label: "Transparent (the buttons alone)" }])], mode: "dropdown" } } },
        ...(rail ? [] : [{ name: "buttons_shape", selector: { select: { options: [{ value: "pill", label: "Pill" }, { value: "tiles", label: "Tiles" }, { value: "circles", label: "Circles" }], mode: "dropdown" } } }]),
        { name: "buttons_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
        { name: "buttons_auto", selector: { boolean: {} } },
        { name: "buttons_style", selector: { select: { options: [{ value: "labels", label: "Icons and labels" }, { value: "icons", label: "Icons only" }], mode: "dropdown" } } },
        ...(rail ? [] : [{ name: "buttons_space", selector: { select: { options: [{ value: "reserve", label: "Reserve space (the plan fits beside it)" }, { value: "float", label: "Float over the plan" }], mode: "dropdown" } } }]),
        { name: "layers_button", selector: { select: { options: [{ value: "auto", label: "Automatic (away from a side Overlay Bar)" }, { value: "top-right", label: "Top right of the plan" }, { value: "top-left", label: "Top left of the plan" }, { value: "bottom-right", label: "Bottom right of the plan" }, { value: "bottom-left", label: "Bottom left of the plan" }, { value: "bar", label: "In the overlay buttons" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
        { name: "replay_button", selector: { select: { options: [{ value: "layers", label: "Next to the Layers button (round, on the plan)" }, { value: "bar", label: "In the Overlay Bar (its last button)" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
        { name: "release_tips", selector: { boolean: {} } },
        { type: "expandable", name: "overlay_names", title: "Overlay names", icon: "mdi:rename", schema: ovOpts.filter((o) => OVERLAYS[o.value]).map((o) => ({ name: o.value, selector: { text: {} } })) },
      ],
      // 0.8.2: space around the plan for this card: the plan's default, or its own (linked or per side).
      frame: (() => {
        const f = this._config.frame || {};
        const custom = f.mode === "custom";
        const num = { number: { min: -45, max: 60, step: 1, mode: "box", unit_of_measurement: "%" } };
        return [
          { name: "frame_mode", selector: { select: { options: [{ value: "plan", label: "The plan's default (set in the Floorplan Editor)" }, { value: "custom", label: "Custom for this card" }], mode: "dropdown" } } },
          ...(custom ? [{ name: "frame_linked", selector: { boolean: {} } }, ...(f.linked === false ? ["t", "r", "b", "l"].map((k) => ({ name: `frame_${k}`, selector: num })) : [{ name: "frame_all", selector: num }])] : []),
          { name: "plan_position", selector: { select: { options: [{ value: "top", label: "Top (space left below)" }, { value: "centre", label: "Centred" }], mode: "dropdown" } } },
        ];
      })(),
      overlaysA: [
        {
          type: "expandable", name: "live", title: "Live: what it shows", icon: OVERLAYS.live.icon,
          schema: [
            { name: "show", selector: { select: { options: Object.entries(LIVE_KINDS).map(([value, label]) => ({ value, label })), multiple: true, mode: "list" } } },
            { name: "quiet_small", selector: { boolean: {} } },
            { name: "values", selector: { boolean: {} } },
            { name: "lights_as", selector: { select: { options: [{ value: "glow", label: "Glow only (tap the glow to switch off)" }, { value: "markers", label: "Markers" }], mode: "dropdown" } } },
            { name: "show_off", selector: { select: { options: [{ value: "hidden", label: "Hidden (Live shows only what's on or happening)" }, { value: "faint", label: "Faint" }], mode: "dropdown" } } },
            { name: "touch_hint", selector: { select: { options: [{ value: "flash", label: "Flash when you tap the plan where there is nothing" }, { value: "outline", label: "A faint outline" }, { value: "none", label: "Nothing" }], mode: "dropdown" } } },
            { name: "motion_as", selector: { select: { options: [{ value: "pulse", label: "Room pulse (the room's edges glow)" }, { value: "icons", label: "Icons" }, { value: "both", label: "Both" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "cameras", title: "Cameras (Live and Security)", icon: "mdi:cctv",
          schema: [
            { name: "cam_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }], mode: "dropdown" } } },
            { name: "cam_layout", selector: { select: { options: [{ value: "plan", label: "On the plan, next to each camera" }, { value: "strip", label: "In a strip (film), in the space around the plan" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "lights", title: "Lights", icon: OVERLAYS.lights.icon,
          schema: [
            { name: "switches", selector: { boolean: {} } },
            { name: "brightness", selector: { boolean: {} } },
            { name: "off", selector: { select: { options: [{ value: "faint", label: "Small and faint" }, { value: "normal", label: "Normal" }, { value: "hidden", label: "Hidden" }], mode: "dropdown" } } },
            { name: "all_off", selector: { boolean: {} } },
            { name: "all_on", selector: { boolean: {} } },
          ],
        },
      ],
      overlaysB: [
        { type: "expandable", name: "comfort", title: "Comfort", icon: OVERLAYS.comfort.icon, schema: [{ name: "heatmap", selector: { boolean: {} } }, { name: "heatmap_opacity", selector: { number: { min: 15, max: 90, step: 5, mode: "slider", unit_of_measurement: "%" } } }, { name: "readings", selector: { boolean: {} } }, { name: "climate_shown", selector: { boolean: {} } }, { name: "airflow", selector: { boolean: {} } }, { name: "humidity", selector: { boolean: {} } }, { name: "humidity_alone", selector: { boolean: {} } }, { name: "climate", selector: { boolean: {} } }, { name: "combine", selector: { select: { options: [{ value: "average", label: "Average" }, { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }], mode: "dropdown" } } }] },
        { type: "expandable", name: "security", title: "Security", icon: OVERLAYS.security.icon, schema: [{ name: "show_quiet", selector: { boolean: {} } }, { name: "quiet_small", selector: { boolean: {} } }, { name: "cameras", selector: { boolean: {} } }] },
        {
          type: "expandable", name: "network", title: "Network", icon: OVERLAYS.network.icon,
          schema: [
            { name: "connections", selector: { select: { options: conns, multiple: true, mode: "list" } } },
            { name: "links", selector: { boolean: {} } },
            { name: "min_lqi", selector: { number: { min: 0, max: 250, step: 5, mode: "slider" } } },
            { name: "hub_links", selector: { boolean: {} } },
            { name: "wifi_links", selector: { boolean: {} } },
            { name: "legend", selector: { boolean: {} } },
            { name: "labels", selector: { boolean: {} } },
            { name: "only_weak", selector: { boolean: {} } },
          ],
        },
        { type: "expandable", name: "health", title: "Health", icon: OVERLAYS.health.icon, schema: [{ name: "low", selector: { number: { min: 5, max: 60, step: 5, mode: "slider", unit_of_measurement: "%" } } }, { name: "only_problems", selector: { boolean: {} } }] },
        { type: "expandable", name: "energy", title: "Energy", icon: OVERLAYS.energy.icon, schema: [
          { name: "min_w", selector: { number: { min: 0, max: 200, step: "any", mode: "box", unit_of_measurement: "W" } } },
          { name: "flow", selector: { boolean: {} } },
        ] },
        { type: "expandable", name: "cleaning", title: "Cleaning", icon: OVERLAYS.cleaning.icon, schema: [{ name: "opacity", selector: { number: { min: 15, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } }] },
      ],
      look: [
        {
          type: "expandable", name: "look", title: "Look", icon: "mdi:palette-outline",
          schema: [
            { name: "size", selector: { number: { min: 24, max: 56, step: 2, mode: "slider", unit_of_measurement: "px" } } },
            { name: "markers", selector: { select: { options: [{ value: "icon_text", label: "Icon and value (e.g. 45 % next to a shutter)" }, { value: "icon", label: "Icon only" }], mode: "dropdown" } } },
            { name: "names", selector: { select: { options: [{ value: "hover", label: "On hover" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }], mode: "dropdown" } } },
          ],
        },
        {
          type: "expandable", name: "look", title: "Info chips (temperatures, AC, battery, energy…)", icon: "mdi:card-text-outline",
          schema: [
            { name: "chips", selector: { select: { options: [{ value: "dark", label: "Dark glass (default)" }, { value: "light", label: "Light" }, { value: "auto", label: "Follow the theme" }, { value: "custom", label: "Custom colour" }], mode: "dropdown" } } },
            ...((this._config.look || {}).chips === "custom" ? [{ name: "chip_color", selector: { color_rgb: {} } }] : []),
            { name: "chip_bg", selector: { select: { options: [{ value: "solid", label: "Solid" }, { value: "normal", label: "Normal (default)" }, { value: "light", label: "Light" }, { value: "clear", label: "See-through" }], mode: "dropdown" } } },
            { name: "chip_size", selector: { select: { options: [{ value: "s", label: "Small" }, { value: "m", label: "Normal (default)" }, { value: "l", label: "Large" }, { value: "xl", label: "Extra large" }], mode: "dropdown" } } },
          ],
        },
      ],
      tap: [
        { type: "expandable", name: "tap", title: "Tap", icon: "mdi:gesture-tap", schema: Object.keys(TAP_KINDS).map((name) => ({ name, selector: { select: { options: TAP_OPTIONS, mode: "dropdown" } } })) },
        { type: "expandable", name: "hold", title: "Long press", icon: "mdi:gesture-tap-hold", schema: Object.keys(TAP_KINDS).map((name) => ({ name, selector: { select: { options: HOLD_OPTIONS, mode: "dropdown" } } })) },
      ],
    };
  }

  _label(s) {
    const L = {
      plan: "Plan", title: "Title on the card (optional, empty = none)", overlays: "Which buttons, in which order (drag to reorder). New overlays from updates appear here, marked ✨", default_overlay: "Overlay when the card opens",
      buttons_position: "Where the Overlay Bar is", buttons_style: "Labels", buttons_bar: "Overlay Bar background", buttons_shape: "Buttons", buttons_size: "Size", buttons_auto: "Automatic status on the card's overlay buttons (lights on, doors open, low batteries, offline devices)", plan_position: "Plan position in a fixed-height card (wall panel, sections)", buttons_space: "Space for the Overlay Bar", frame_mode: "Space around the plan", frame_linked: "Same on all four sides", frame_all: "All sides (+ space, − trim)", frame_t: "Top", frame_r: "Right", frame_b: "Bottom", frame_l: "Left", layers_button: "Layers button (viewers switch room names and other layers). Beside a side Overlay Bar it always sits on the plan's other side", replay_button: "Home Replay button", release_tips: "Show release tips (admins only: one tip per new version, until closed)",
      cam_size: "Size of the camera pictures", cam_layout: "Where the camera pictures are", lights_as: "Lights show as", motion_as: "Motion and presence show as", show_off: "Things that are off", touch_hint: "Touch areas (devices drawn in your plan) show", show: "Show", quiet_small: "Closed doors and idle sensors: small and faint", values: "Values next to icons (thermostat temperature, open lamps)",
      switches: "Include switches and plugs that run lights", brightness: "Show brightness of lights that are on", off: "Lights that are off", all_off: "“All off” button", all_on: "“All on” button",
      heatmap: "Heatmap shown by default (viewers can switch it under Layers)", heatmap_opacity: "Heatmap strength (viewers can change it with the slider under the plan)", opacity: "Strength of the Last cleaned colours (viewers can change it with the slider under the plan)", readings: "Temperature labels shown by default", climate_shown: "Climate devices (ACs, thermostats) shown by default", airflow: "AC air flow shown by default",
      humidity: "Show humidity", humidity_alone: "Also devices with humidity only", combine: "Bonds and phantoms with several sensors show", climate: "ACs and thermostats as climate chips (mode, room temperature, target)",
      chip_bg: "Background",
      chip_size: "Size (separate from the marker size)",
      chip_color: "Colour",
      min_w: "Now: show devices from (W)",
      flow: "Flow lines shown by default (viewers can switch them under Layers)",
      show_quiet: "All sensors by default, also closed / idle (viewers can switch it under Layers)", cameras: "Show cameras",
      connections: "Connections shown by default", layers: "Layers button next to the overlay buttons (viewers can switch connections)", links: "Draw Zigbee links (ZHA)", min_lqi: "Hide Zigbee links below this LQI", hub_links: "Draw hub / bridge links (Matter bridges, hubs)", wifi_links: "Draw Wi-Fi / LAN links to the router / access point (needs router device tracking)", legend: "Legend under the plan", labels: "Connection names next to icons", only_weak: "Only weak and fair signals",
      low: "Battery is low below", only_problems: "Only low batteries and offline devices",
      size: "Marker size (icons in every overlay; chips have their own size below)", markers: "Values next to marker icons (overlays that show values)", chips: "Style", names: "Device names", card_id: "Card ID (lets other cards switch this card's overlay)",
      hide_admin_hint: "Hide the “N new · Place them” button (admins only see it)",
      ...TAP_KINDS,
    };
    if (OVERLAYS[s.name] && !L[s.name]) return OVERLAYS[s.name].label;
    return L[s.name] || s.name;
  }

  _data() {
    const c = this._config;
    const look = c.look || {};
    const b = c.buttons || {};
    return {
      overlays: [...OVERLAY_ORDER, ...this._custom().map((x) => x.id)],
      default_overlay: "live",
      ...c,
      ...(Array.isArray(c.overlays) ? { overlays: c.overlays.filter((o) => o !== "plan") } : {}),
      ...(c.default_overlay === "plan" ? { default_overlay: "live" } : {}),
      buttons_position: b.position || (look.dock === "hidden" ? "hidden" : "bottom"),
      buttons_style: b.style || (look.dock === "icons" ? "icons" : "labels"),
      buttons_space: b.space === "float_icons" ? "float" : b.space || "reserve",
      buttons_shape: BAR_SHAPES.includes(b.shape) ? b.shape : "pill",
      buttons_bar: String(b.position || "").startsWith("rail_") ? (["theme", "dark"].includes(b.bar) ? b.bar : "contrast") : b.space === "float_icons" || b.shape === "plain" ? "clear" : b.shape === "sidebar" ? b.bar || "dark" : b.bar || "theme",
      buttons_size: b.size || "m",
      buttons_auto: b.auto_status === true,
      plan_position: c.plan_position === "centre" ? "centre" : "top",
      frame_mode: (c.frame || {}).mode === "custom" ? "custom" : "plan",
      frame_linked: (c.frame || {}).linked !== false,
      frame_all: Number((c.frame || {}).t) || 0,
      ...Object.fromEntries(["t", "r", "b", "l"].map((k) => [`frame_${k}`, Number((c.frame || {})[k]) || 0])),
      // test9: nothing saved = Automatic (the card picks the corner away from a side Overlay Bar); it is not written.
      layers_button: c.layers_button || ((c.network || {}).layers === false ? "hidden" : "auto"),
      replay_button: c.replay === false ? "hidden" : c.replay_button || "layers",
      release_tips: c.release_tips !== false,
      live: { show: LIVE_DEFAULT, quiet_small: true, values: true, lights_as: "glow", show_off: "hidden", motion_as: "pulse", ...(c.live || {}) },
      cameras: { cam_size: "m", cam_layout: "plan", ...(c.cameras || {}) },
      lights: { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, ...(c.lights || {}) },
      comfort: { heatmap: true, heatmap_opacity: 52, readings: true, climate_shown: true, airflow: true, humidity: true, humidity_alone: true, climate: true, ...(c.comfort || {}) },
      security: { show_quiet: false, quiet_small: true, cameras: true, ...(c.security || {}) },
      network: { connections: ["all"], layers: true, links: true, min_lqi: 0, hub_links: true, wifi_links: true, legend: true, labels: false, only_weak: false, ...(c.network || {}) },
      health: { low: 20, only_problems: false, ...(c.health || {}) },
      energy: { min_w: 0, flow: true, ...(c.energy || {}) }, // 0.11: the editor shows the values in use
      cleaning: { opacity: 60, ...(c.cleaning || {}) },
      tap: { ...TAP_DEFAULT, ...(c.tap || {}) },
      hold: { ...HOLD_DEFAULT, ...(c.hold || {}) },
      look: { size: 34, chips: "dark", chip_bg: "normal", chip_size: "m", names: c.names || "hover", markers: look.markers || (look.values === false || c.show_states === false ? "icon" : "icon_text"), ...look },
      overlay_names: { ...(c.overlay_names || {}) },
      night: { ...NIGHT_DEFAULT, ...(c.night || {}) },
    };
  }

  /** Keep only what differs from the defaults, so the YAML stays short. */
  _prune(c) {
    const defaults = this._data.call({ _config: {}, _custom: () => [] });
    const out = { ...c };
    delete out.names; // moved into look.names
    delete out.show_states; // replaced by look.markers
    delete out.default_view; // replaced by default_overlay
    if (!out.hide_admin_hint) delete out.hide_admin_hint;
    if (out.layers_button === "auto") delete out.layers_button;
    // test10: one setting for the Replay button (the older "replay: false" is folded into it); the default is not written.
    if (out.replay_button) delete out.replay;
    if (out.replay_button === "layers") delete out.replay_button;
    if (out.release_tips !== false) delete out.release_tips; // shown by default: only "off" is written
    if (out.look) {
      out.look = { ...out.look };
      delete out.look.show_title; // 0.11: a title shows when there is one
      delete out.look.title;
      delete out.look.dock; // moved to buttons
      delete out.look.values; // replaced by look.markers
    }
    if (Array.isArray(out.people) && !out.people.length) delete out.people;
    if (Array.isArray(out.people_in) && !out.people_in.length) delete out.people_in;
    for (const k of ["live", "lights", "comfort", "security", "network", "health", "energy", "cleaning", "tap", "hold", "look", "overlay_names", "rooms", "buttons", "night"]) {
      if (!out[k]) continue;
      const v = {};
      const d0 = k === "rooms" ? { show_in: ["live"], style: "label", size: "m" } : k === "buttons" ? { position: "bottom", style: "labels" } : defaults[k] || {};
      for (const [kk, vv] of Object.entries(out[k])) {
        if (vv === "" || vv == null) continue;
        if (Array.isArray(vv) && !vv.length && kk !== "show" && kk !== "show_in") continue;
        if (vv && typeof vv === "object" && !Array.isArray(vv) && !Object.keys(vv).length) continue;
        if (JSON.stringify(vv) !== JSON.stringify(d0[kk])) v[kk] = vv;
      }
      if (Object.keys(v).length) out[k] = v;
      else delete out[k];
    }
    if (out.custom_overlays && !out.custom_overlays.length) delete out.custom_overlays;
    if (JSON.stringify(out.overlays) === JSON.stringify([...OVERLAY_ORDER, ...(out.custom_overlays || []).map((x) => x.id)])) delete out.overlays;
    if (out.default_overlay === "live") delete out.default_overlay;
    for (const k of ["title", "card_id", "default_floor"]) if (!out[k]) delete out[k];
    if (Array.isArray(out.plans) && out.plans.length) delete out.plan;
    if (out.devices && !Object.keys(out.devices).length) delete out.devices;
    return out;
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) {
      this._built = true;
      const sec = (icon, title, p, inner) => `<h4><ha-icon icon="${icon}"></ha-icon>${title}</h4>${p ? `<p>${p}</p>` : ""}${inner}`;
      // 0.11: card settings as clear sections: title + one line; one open at a time.
      const csec = (icon, title, p, inner) => `<details class="csec"><summary><h4><ha-icon icon="${icon}"></ha-icon>${title}<ha-icon class="cv" icon="mdi:chevron-down"></ha-icon></h4>${p ? `<p>${p}</p>` : ""}</summary><div class="csb">${inner}</div></details>`;
      // 0.8.1: per floor first (Markers, Rooms), then the settings for the whole card (all floors).
      // 0.11.1: a short home (header, summary, the Card Editor button, one tip); every setting folded below,
      // in two tabs: the card (whole house) and the floors. In the Card Editor the home hides and all is open.
      this.innerHTML = `<style>${ED_CSS}</style><div class="dfe">
        <div class="dhome">
          <div class="dh"><ha-icon icon="mdi:floor-plan"></ha-icon><b>Device Floorplan</b><span class="dv">${CARD_VERSION}</span><a href="https://johnkotrolos.github.io/ha-device-floorplan/" target="_blank" rel="noopener">Guide ↗</a></div>
          <p class="dsum"><ha-icon icon="mdi:information-outline"></ha-icon><span id="dsum"></span></p>
          <button class="bigbtn" id="bigbtn"><ha-icon icon="mdi:cursor-default-click-outline"></ha-icon><span>Open the Card Editor</span></button>
          <p class="dtip"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon>New: Home Replay (the round button beside Layers), and camera pictures in a strip.</p>
        </div>
        <details class="dall" id="dall"><summary>Card settings</summary>
        <div class="dcol"><h3><ha-icon icon="mdi:tune-variant"></ha-icon>Card settings</h3><p>How the whole card looks and works: the Overlay Bar, the overlays and what each shows, rooms and people. Floors: settings per floor.</p></div>
        <div class="dtabs"><button data-dt="card" class="on">Card</button><button data-dt="floor">Floors</button></div>
        <div class="dpane" data-pane="floor" hidden>
        <div class="fpanel"><div class="floors" id="floors"></div>
        ${sec("mdi:texture-box", "Rooms on this floor", "Rooms from the Floorplan Editor: rename them for the card or hide them.", `<div id="rooms"></div>`)}
        ${sec("mdi:gesture-tap-button", "Buttons on this floor", "Overlay actions and light scenes shown only on this floor. Those for every floor are under Card settings.", `<div class="sub"><h5><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Overlay actions</h5><div id="oacts_f"></div></div><div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes</h5><div id="scenes_f"></div></div>`)}</div>
        </div>
        <div class="dpane" data-pane="card">
        <div id="fopts"></div>
        <div data-form="general"></div>
        ${csec("mdi:gesture-tap-button", "Overlay Bar", "Which buttons, their order, where the Overlay Bar sits and how it looks.", `<div data-form="buttons"></div><div class="sub"><h5><ha-icon icon="mdi:gesture-tap-hold"></ha-icon>Overlay Bar: hold, status and shortcuts</h5><p>Each overlay button can run an action on hold and show a status (dot, count, value, colour or another icon). Shortcuts are your own buttons: tap and hold run any Home Assistant action (open a page, a popup on this browser, reload…). A faint line separates card overlays, your own overlays and shortcuts; what doesn't fit scrolls in the bar.</p><div id="bbar"></div></div><div class="sub"><h5><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Overlay actions on every floor</h5><p>Your own buttons under the plan, shown in one overlay (buttons for one floor are in the floor menu above): run any Home Assistant action (a script, a scene, the robot, another integration), open a page or a popup. Cleaning also shows the robot's own Start / Pause / Dock.</p><div id="oacts"></div></div>`)}
        ${csec("mdi:layers-outline", "Overlays", "Your own overlays first, then what each overlay shows.", `<div class="sub"><h5><ha-icon icon="mdi:layers-plus"></ha-icon>Your own overlays</h5><p>Overlay buttons of your own, e.g. “Downstairs lights” or “Plants”: pick the kinds of devices it shows; add single devices in Edit markers.</p><div id="custom"></div></div><div data-form="overlaysA"></div>
          <div class="sub"><h5><ha-icon icon="mdi:palette-outline"></ha-icon>Light scenes on every floor</h5><p>Buttons in the Lights overlay (scenes for one floor are in the floor menu above). Stored in this card only, nothing is created in Home Assistant.</p><div id="scenes"></div></div>
          <div data-form="overlaysB"></div>`)}
        ${csec("mdi:texture-box", "Rooms", "How Room names look on the plan, and in which overlays they show by default.", `<div id="roomsg"></div>`)}
        ${csec("mdi:account-group-outline", "People", "Each person at the room pin of the room they are in. Room sensor: any entity whose state is a room (Bermuda, ESPresense, a template sensor…); sensor 2 is used when 1 is unknown or not a room on this plan.", `<div id="people"></div>`)}
        ${csec("mdi:weather-night", "Day & night", "", `<p id="nightnote"></p><div id="night"></div>`)}
        ${csec("mdi:tune-variant", "Look and tap behaviour", "", `<div data-form="look"></div><button class="lk" id="chipreset"><ha-icon icon="mdi:restore"></ha-icon>Reset Info chips</button><div data-form="tap"></div>`)}
        ${csec("mdi:border-outside", "Frame", "Space around the plan (+) or trimmed margin (−), % of the image: markers and Rooms never move.", `<div data-form="frame"></div>`)}
        </div></details>
      </div>`;
      for (const b of this.querySelectorAll("[data-dt]")) b.addEventListener("click", () => {
        for (const x of this.querySelectorAll("[data-dt]")) x.classList.toggle("on", x === b);
        for (const pn of this.querySelectorAll(".dpane")) pn.hidden = pn.dataset.pane !== b.dataset.dt;
      });
      // One card-settings section open at a time; the opened one scrolls to the top.
      for (const d of this.querySelectorAll("details.csec")) d.addEventListener("toggle", () => {
        if (!d.open) return;
        for (const o of this.querySelectorAll("details.csec")) if (o !== d) o.open = false;
        d.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      this._forms = {};
      for (const box of this.querySelectorAll("[data-form]")) {
        const key = box.dataset.form;
        const f = document.createElement("ha-form");
        f.computeLabel = (s) => this._label(s);
        f.addEventListener("value-changed", (e) => {
          e.stopPropagation();
          this._fromForm(key, { ...e.detail.value });
        });
        box.appendChild(f);
        this._forms[key] = f;
      }
      this.querySelector("#bigbtn").addEventListener("click", () => this._openBig());
      // 0.11: chips back to the defaults in one click.
      this.querySelector("#chipreset").addEventListener("click", () => {
        const look = { ...(this._config.look || {}) };
        for (const k of ["chips", "chip_bg", "chip_size", "chip_color", "chip_opacity", "chip_text"]) delete look[k];
        this._config = { ...this._config, look };
        if (!Object.keys(look).length) delete this._config.look;
        this._emit();
        this._engine(true);
      });
    }
    this._engine(true);
    this._renderFloors();
    this._renderSections();
    this._renderDevices();
  }

  /** Top-level config keys a form owns (so a form never writes back stale values of another one). */
  _keysOf(schema) {
    const out = [];
    for (const s of schema) {
      if (s.type === "expandable" && s.flatten) out.push(...this._keysOf(s.schema));
      else out.push(s.name);
    }
    return out;
  }

  _fromForm(key, v) {
    // 0.11: the large preview shows the overlay you are changing (chips: Comfort has the most).
    const follow = { look: "comfort", live: "live", lights: "lights", comfort: "comfort", security: "security", network: "network", health: "health", energy: "energy", cleaning: "cleaning" }[key];
    if (follow) {
      EDIT_OV = follow;
      this._previewOv(follow);
    }
    const schema = this._schemas()[key] || [];
    const c = { ...this._config };
    for (const k of this._keysOf(schema)) if (k in v) c[k] = v[k];
    if (key === "frame") {
      for (const k of this._keysOf(schema)) delete c[k];
      if (v.plan_position === "centre") c.plan_position = "centre";
      else delete c.plan_position;
      if (v.frame_mode !== "custom") delete c.frame;
      else {
        const linked = v.frame_linked !== false;
        const old = this._config.frame || {};
        const all = Number(v.frame_all) || 0;
        // Unlinking starts from the linked value; linking takes the top value.
        const side = (k) => (linked ? all : old.linked === false ? Number(v[`frame_${k}`]) || 0 : Number(old.t) || 0);
        c.frame = { mode: "custom", ...(linked ? {} : { linked: false }), t: side("t"), r: side("r"), b: side("b"), l: side("l") };
      }
      this._set(c, { sections: false });
      this._refreshForms(key);
      return;
    }
    if (key === "buttons") {
      const { space: _s, shape: _h, size: _z, bar: _b, auto_status: _a, ...keep } = this._config.buttons || {};
      const space = v.buttons_space === "float_icons" ? "float" : v.buttons_space; // "buttons only" = a transparent bar now
      const rail = String(v.buttons_position || "").startsWith("rail_");
      const wasRail = String((this._config.buttons || {}).position || "").startsWith("rail_");
      // Switching to / from the Side Rail: each keeps its own default background (rail dark, bar theme).
      let bar = v.buttons_space === "float_icons" ? "clear" : rail !== wasRail ? (rail ? "contrast" : _b && _b !== "contrast" && _b !== "dark" ? _b : "theme") : v.buttons_bar;
      if (rail && bar === "clear") bar = "contrast";
      const keepShape = rail ? _h : v.buttons_shape;
      const keepSpace = rail ? _s : space;
      c.buttons = { ...keep, position: v.buttons_position, style: v.buttons_style, ...(keepSpace && keepSpace !== "reserve" ? { space: keepSpace } : {}), ...(BAR_SHAPES.includes(keepShape) && keepShape !== "pill" ? { shape: keepShape } : {}), ...(rail ? (bar === "theme" || bar === "dark" ? { bar } : {}) : bar && bar !== "theme" ? { bar } : {}), ...(v.buttons_size && v.buttons_size !== "m" ? { size: v.buttons_size } : {}), ...(v.buttons_auto ? { auto_status: true } : {}) };
      for (const k of ["buttons_position", "buttons_style", "buttons_space", "buttons_shape", "buttons_bar", "buttons_size", "buttons_auto"]) delete c[k];
    }
    // Only what depends on the changed form is redrawn; the form you type in is left alone.
    this._set(c, { sections: false });
    this._refreshForms(key);
    if (key === "buttons" || key === "general") {
      this._renderRooms();
      if (key === "buttons") {
        this._renderBar();
        this._renderActs();
      }
    }
  }

  /** Give every form the current data; schemas only when they changed (keeps focus and open panels). */
  _refreshForms(skip) {
    const schemas = this._schemas();
    const data = this._data();
    for (const [key, f] of Object.entries(this._forms || {})) {
      f.hass = this._hass;
      const sj = JSON.stringify(schemas[key]);
      if (f._sj !== sj) {
        f._sj = sj;
        f.schema = schemas[key];
      }
      if (key !== skip) f.data = data;
      else f.data = { ...data }; // same values: ha-form keeps the field and its focus
    }
  }

  _renderSections() {
    this._refreshForms();
    this._renderCustom();
    this._renderBar();
    this._renderActs();
    this._renderScenes();
    this._renderRooms();
    this._renderPeople();
    this._renderNight();
  }

  // ---- people (#67)
  _renderPeople() {
    const box = this.querySelector("#people");
    if (!box) return;
    box.innerHTML = "";
    // Always read the current list: edits are saved without a redraw, so a list captured at draw time goes stale.
    const cur = () => (Array.isArray(this._config.people) ? this._config.people : []);
    const list = cur();
    const save = (next, redraw) => {
      const c = { ...this._config, people: next };
      this._config = this._prune(c);
      this._emit();
      if (redraw) this._renderPeople();
    };
    list.forEach((pp, i) => {
      const row = document.createElement("div");
      row.className = "prow-ed";
      row.appendChild(this._form(
        [
          { name: "entity", selector: { entity: { domain: "person" } } },
          { name: "room", selector: { entity: {} } },
          { name: "room2", selector: { entity: {} } },
          { name: "distance", selector: { entity: { domain: "sensor", device_class: "distance" } } },
        ],
        { ...pp },
        { entity: "Person", room: "Room sensor 1", room2: "Room sensor 2 (fallback)", distance: "Distance sensor (Bermuda; test: Network → Bluetooth)" },
        (v) => {
          const next = cur().slice();
          next[i] = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
          save(next, false);
        },
      ));
      const del = document.createElement("button");
      del.className = "del";
      del.innerHTML = `<ha-icon icon="mdi:delete-outline"></ha-icon>Remove`;
      del.addEventListener("click", () => save(cur().filter((_x, j) => j !== i), true));
      row.appendChild(del);
      box.appendChild(row);
    });
    const add = document.createElement("button");
    add.className = "add";
    add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>Add person`;
    add.addEventListener("click", () => {
      const now = cur();
      const used = new Set(now.map((x) => x.entity));
      const next = Object.keys(this._hass.states).find((e) => e.startsWith("person.") && !used.has(e));
      save([...now, next ? { entity: next } : {}], true);
    });
    box.appendChild(add);
    if (list.length) {
      box.appendChild(this._form(
        [{ name: "people_in", selector: { select: { options: this._ovOptions().filter((o) => o.value !== "people"), multiple: true, mode: "list" } } }],
        { people_in: this._config.people_in || [] },
        { people_in: "Also show people in these overlays (always in People)" },
        (v) => {
          this._config = this._prune({ ...this._config, people_in: v.people_in || [] });
          this._emit();
        },
      ));
    }
  }

  // ---- day & night (#74)
  _renderNight() {
    const box = this.querySelector("#night");
    if (!box) return;
    const sun = this._hass.states["sun.sun"];
    const note = this.querySelector("#nightnote");
    if (note) note.textContent = sun ? "The plan gets darker after sunset, gradually with the sun, and lights that are on glow where they are. Light shapes come from the Floorplan Editor." : "Add the Sun integration (Settings → Devices & services → Add integration → Sun) for a gradual day–night change; until then the fixed times are used.";
    if (box._built) {
      box._f.data = { ...NIGHT_DEFAULT, ...(this._config.night || {}) };
      return;
    }
    box._built = true;
    box._f = this._form(
      [
        { name: "mode", selector: { select: { options: [{ value: "sun", label: "Follow the sun (gradual)" }, { value: "times", label: "Fixed times" }, { value: "dark", label: "Follow Home Assistant's dark theme" }, { value: "always", label: "Always night" }, { value: "off", label: "Off" }], mode: "dropdown" } } },
        { name: "start", selector: { time: {} } },
        { name: "end", selector: { time: {} } },
        { name: "overlays", selector: { select: { options: this._ovOptions(), multiple: true, mode: "list" } } },
        { name: "strength", selector: { number: { min: 20, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "style", selector: { select: { options: [{ value: "moon", label: "Moonlight (deep blue)" }, { value: "dim", label: "Dim (darker, neutral)" }], mode: "dropdown" } } },
        { name: "dim_quiet", selector: { boolean: {} } },
        { name: "shutters", selector: { boolean: {} } },
        { name: "warm_dusk", selector: { boolean: {} } },
      ],
      { ...NIGHT_DEFAULT, ...(this._config.night || {}) },
      { mode: "Day & night", start: "Night starts (fixed times, also used without the Sun)", end: "Night ends", overlays: "Use the night look in", strength: "How dark the night gets", style: "Style", dim_quiet: "Dim quiet markers at night (active ones stay bright)", shutters: "Closed shutters darken their room by day (rooms with a shape)", warm_dusk: "Warm dusk and dawn colours (follows the sun)" },
      (v) => {
        const nv = { ...v };
        for (const k of ["start", "end"]) if (nv[k]) nv[k] = String(nv[k]).slice(0, 5);
        this._config = this._prune({ ...this._config, night: nv });
        this._emit();
      },
    );
    box.appendChild(box._f);
  }

  _form(schema, data, labels, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.computeLabel = (s) => labels[s.name] || s.name;
    f.schema = schema;
    f.data = data;
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      onChange({ ...e.detail.value });
    });
    return f;
  }
}
