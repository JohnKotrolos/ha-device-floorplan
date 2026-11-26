Object.assign(DeviceFloorplanCard.prototype, {

  /** Custom overlays (#109): ordered kinds; the first matching kind leads, the others become extra lines. */
  _customSpecs(item, name, allowed, def, q, ov) {
    const hass = this._hass;
    const kinds = Array.isArray(def.kinds) ? def.kinds : [];
    const added = this._added(item, def.id);
    if (def.mode === "manual" && !added) return [];
    let matches = def.mode === "manual" ? [] : kinds.map((k) => [k, this._entityForKind(item, k, allowed)]).filter((x) => x[1]);
    if (item.bond && matches.length) {
      // A bond leads with its combined value (#104); readings still add their lines.
      const k0 = matches[0][0];
      if (LIVE_KEY[this._mainKind(item)] === k0) matches[0] = [k0, item.main_entity];
    }
    const per = this._per(item, ov);
    if (per.lead && hass.states[per.lead]) {
      const k = kindOf(per.lead, hass.states[per.lead]);
      const key = ["temperature", "humidity", "battery"].includes(k) ? k : LIVE_KEY[k] || "other";
      matches = [[key, per.lead], ...matches.filter((x) => x[1] !== per.lead)];
    }
    if (!matches.length) {
      if (!added || !item.main_entity) return [];
      const k = this._mainKind(item);
      return [this._withExtras(this._valueChip(item, name, item.main_entity) || this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], k, {}), item, ov)];
    }
    if (q) return [{ key: item.id }];
    const [leadKey, lead] = matches[0];
    const rest = matches.slice(1);
    const st = hass.states[lead];
    let spec;
    let used = [lead];
    if (domainOf(lead) === "climate") {
      spec = this._climateChip(item, name, lead, null, null, { compact: true });
      used = used.concat(rest.filter((x) => x[1] === lead).map((x) => x[1]));
    } else if (leadKey === "temperature" || leadKey === "humidity") {
      const t = leadKey === "temperature" ? lead : null;
      const hm = leadKey === "humidity" ? lead : (rest.find((x) => x[0] === "humidity") || [])[1];
      if (hm) used.push(hm);
      const lines = [t ? this._fmtNum(t) : "", hm ? this._fmtNum(hm) : ""].filter(Boolean);
      spec = { ...this._chipSpec(item, name, { lines, ents: [t, hm].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: hm ? lines[lines.length - 1] : "" } };
    } else if (leadKey === "battery") {
      spec = (this._healthSpecs(item, name, [lead], { low: 20 }, false) || [])[0];
    } else {
      const k = item.bond && lead === item.main_entity ? this._mainKind(item) : kindOf(lead, st);
      spec = this._valueChip(item, name, lead) || this._liveSpec(item, name, lead, st, k, {});
      if (k === "light" && this._glowOnly(ov)) {
        if (!spec.on) return [];
        spec.glow = true;
      }
    }
    if (!spec) return [];
    const extras = rest.map((x) => x[1]).filter((e) => !used.includes(e));
    return [this._withExtras(spec, item, ov, extras)];
  },

  _isOn(eid, st, kind) {
    if (!live(st)) return false;
    const s = st.state;
    if (kind === "lock") return s === "unlocked" || s === "open" || s === "jammed";
    if (kind === "alarm") return s === "triggered";
    if (kind === "cover") return s === "open" || s === "opening";
    if (kind === "media") return s === "playing";
    if (kind === "climate") return s !== "off";
    if (kind === "appliance") return ["on", "cleaning", "mowing", "returning"].includes(s);
    // A status sensor as leading entity (printer, washer…): busy states count as "on".
    if (kind === "sensor" || kind === "other") return /^(on|running|printing|prepare|preparing|heating|busy|working|washing|drying|cleaning|active|in_progress|paused?)$/i.test(String(s).replace(/\s+/g, "_"));
    return s === "on" || s === "open" || s === "detected";
  },

  _liveSpec(item, name, eid, st, kind, opts) {
    const hass = this._hass;
    const look = this._look();
    let on = false;
    let value = "";
    let color = "var(--dfc-accent)";
    if (item.bond && (!eid || eid === item.main_entity)) {
      const sts = this._parts(item).map((e) => hass.states[e]).filter(Boolean);
      const n = sts.filter((s) => this._isOn(s.entity_id, s, kind)).length;
      on = n > 0;
      // 0.12.9: "how many are on" only when chosen; otherwise on if any is on, as the setting says.
      const showMode = this._per(item, this._overlay).show || item.show;
      if (showMode === "count" && sts.length > 1) value = `${n}/${sts.length}`;
    } else {
      on = this._isOn(eid, st, kind);
      if (kind === "climate" && st && st.attributes.current_temperature != null) value = this._attrVal(st, "current_temperature");
      if (["sensor", "binary", "other", "temperature", "humidity", "battery"].includes(kind) && st) value = this._fmt(eid);
      if (kind === "climate") color = st && CLIMATE_MODES[st.state] ? CLIMATE_MODES[st.state].color : color;
    }
    if (kind === "motion") color = "#43a047";
    if (kind === "opening") color = "#fb8c00";
    if (kind === "safety" || kind === "alarm") color = "#e53935";
    if (kind === "lock" && on) color = "#e53935";
    const dim = !on && ["opening", "motion", "safety"].includes(kind) && opts.quiet_small !== false;
    const unavail = !(item.bond && (!eid || eid === item.main_entity)) && !live(st);
    const showVal = look.markers !== "icon" && opts.values !== false;
    const bondAll = item.bond && (!eid || eid === item.main_entity);
    return { key: item.id, type: "marker", item, name, ents: bondAll ? this._parts(item) : [eid], eid, st, kind, on, dim, unavail, color, value: showVal ? value : "", icon: this._dev(item.id).icon || (bondAll ? item.icon : null), x: item.x, y: item.y };
  },

  /** test9: a device that only measures (nothing to switch or run) shows its value as a chip, the Comfort look,
   *  in every overlay it is in; a device you control keeps its icon. */
  /** 0.12.6: what an added device follows: your pick, else its main entity, else its first reading (no settings). */
  _addedLead(item) {
    const ok = (e) => e && this._hass.states[e] && !this._aux(e) && !NO_VALUE.has(domainOf(e));
    const all = [item.main_entity, ...this._allowed(item)];
    return all.find((e) => ok(e) && live(this._hass.states[e])) || all.find(ok) || null; // 0.12.9: none = nothing to draw
  },

  /** 0.12.6: a device drawn as itself, the look of the overlay that owns its kind (Live and own overlays). */
  _asItself(item, name, lead) {
    const hass = this._hass;
    const st = lead && hass.states[lead];
    if (!st) return null;
    const k = kindOf(lead, st);
    if (domainOf(lead) === "climate") return this._climateChip(item, name, lead, null, null, { compact: true });
    if (k === "temperature" || k === "humidity") {
      // 0.12.9: the Comfort chip: temperature first, humidity under it, whichever HA calls its main entity.
      const ents = this._allowed(item);
      const of = (kk) => (k === kk ? lead : ents.find((e) => !this._aux(e) && kindOf(e, hass.states[e]) === kk) || null);
      const t = of("temperature");
      const hm = of("humidity");
      const lines = [t ? this._fmtNum(t) : "", hm ? this._fmtNum(hm) : ""].filter(Boolean);
      return { ...this._chipSpec(item, name, { lines, ents: [t, hm].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: hm ? lines[lines.length - 1] : "" } };
    }
    if (k === "battery" || k === "sensor" || k === "reading" || domainOf(lead) === "sensor") {
      const line = ["temperature", "humidity", "battery", "sensor"].includes(k) ? this._fmtNum(lead) : this._fmt(lead);
      return { ...this._chipSpec(item, name, { lines: [line], ents: [lead], kind: "reading" }), rd: { t: line, h: "" } };
    }
    return this._liveSpec(item, name, lead, st, k, {});
  },

  _valueChip(item, name, e) {
    if (!e || item.bond || domainOf(e) !== "sensor") return null;
    if (!(item.group === "sensors" || (item.standalone && domainOf(item.main_entity || "") === "sensor"))) return null;
    const line = this._fmtNum(e);
    return { ...this._chipSpec(item, name, { lines: [line], ents: [e], kind: "reading" }), rd: { t: line, h: "" } };
  },

  /** Health: a device without a battery shows only while offline, as this chip. */
  _offChip(item, name) {
    return { ...this._chipSpec(item, name, { lines: [dfT("offline")], icon: "mdi:alert-circle-outline", ents: [item.main_entity], kind: "other", cls: "warn" }), offline: true };
  },

  _chipSpec(item, name, { lines, ents, kind, icon, cls = "" }) {
    return { key: `${item.id}|${ents.join(",")}`, type: "chip", item, name, lines, ents, kind, icon, cls, x: item.x, y: item.y };
  },

  _fmt(eid) {
    const st = this._hass.states[eid];
    if (!st || !live(st)) return "—";
    try {
      if (this._hass.formatEntityState) return this._hass.formatEntityState(st);
    } catch (_e) {
      /* fall back */
    }
    return `${st.state}${st.attributes.unit_of_measurement ? ` ${st.attributes.unit_of_measurement}` : ""}`;
  },

  /** Readings: the entity's own display precision if set, otherwise at most 1 decimal (#51). */
  _fmtNum(eid) {
    const st = this._hass.states[eid];
    if (!st || !live(st)) return "—";
    const reg = this._hass.entities && this._hass.entities[eid];
    if ((reg && reg.display_precision != null) || !num(st.state)) return this._fmt(eid);
    const v = Math.round(Number(st.state) * 10) / 10;
    const unit = st.attributes.unit_of_measurement || "";
    let n;
    try {
      n = v.toLocaleString(this._hass.locale && this._hass.locale.language ? this._hass.locale.language : undefined, { maximumFractionDigits: 1 });
    } catch (_e) {
      n = String(v);
    }
    return unit ? (unit === "%" ? `${n}%` : `${n} ${unit}`) : n;
  },

  _attrVal(st, attr) {
    try {
      if (this._hass.formatEntityAttributeValue) return this._hass.formatEntityAttributeValue(st, attr);
    } catch (_e) {
      /* fall back */
    }
    return `${st.attributes[attr]}°`;
  },

  // ------------------------------------------------------------- render
  /** 0.13.9.13: a room cut-out: everything around the room dimmed and greyed. */
  _focusHtml(a) {
    const ar = this._config.focus_area && (a.areas || {})[this._config.focus_area];
    if (!ar) return "";
    const sh = Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const hole = sh ? `M${sh.map((p) => `${p[0]} ${p[1]}`).join("L")}Z` : `M${ar.x - 6} ${ar.y}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z`;
    // 0.13.9.16: light just outside the room, stronger towards the edges (a radial fade from the room's centre).
    const xs = sh ? sh.map((p) => p[0]) : [ar.x - 6, ar.x + 6];
    const ys = sh ? sh.map((p) => p[1]) : [ar.y - 6, ar.y + 6];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rr = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    const R = Math.max(rr * 2.6, 30);
    const k = Math.min(0.9, rr / R);
    const stop = (o, op) => `<stop offset="${o}" style="stop-color:var(--dfc-focus-dim, var(--primary-background-color, #f2f2f2));stop-opacity:${op}"/>`;
    return `<svg class="focus" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="dfcfg" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${R}">${stop(0, 0.3)}${stop(k, 0.35)}${stop(Math.min(1, k + 0.25), 0.75)}${stop(1, 0.97)}</radialGradient></defs><path fill-rule="evenodd" fill="url(#dfcfg)" style="fill-opacity:1" d="M-200 -200H300V300H-200Z${hole}"/></svg>`;
  },

  /** 0.13.9.13: show an overlay (the mobile card's tabs). */
  dfSetOverlay(ov) {
    if (!ov || ov === this._overlay || !this._config || !this._overlays().includes(ov)) return;
    this._overlay = ov;
    this._popup = null;
    this._menu = false;
    this._update(true);
  },

  _update(force = false) {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    // Nothing to do while nobody can see it: catch up when visible again (#72).
    if (document.hidden || !this.isConnected) {
      this._dirty = true;
      return;
    }
    if (!this._eData || this._overlay === "energy") this._eLoad(); // 0.11 Energy (only reloads every 5 min)
    const sensor = this._sensor();
    const parts = [sensor ? sensor.last_updated : "none", this._floor, this._overlay, this._img || "", this._imgFailed ? 1 : 0, JSON.stringify(this._popup || null), this._menu ? 1 : 0, JSON.stringify(this._net || {}), this._zha ? this._zhaAt : 0, this._hass.themes && this._hass.themes.darkMode ? 1 : 0];
    // Only the entities the current overlay reads; a power sensor ticking elsewhere changes nothing.
    for (const eid of this._watch || []) {
      const st = this._hass.states[eid];
      if (!st) {
        parts.push("-");
        continue;
      }
      // 0.11: any change of state or attributes (shutter position, AC activity, battery…) re-renders.
      parts.push(`${st.state}|${st.last_updated}`);
    }
    this._ns = this._nightState();
    parts.push(`n${this._ns.f}${this._ns.tint || ""}`);
    const nNew = this._hass.states["sensor.device_floorplan_new_devices"];
    parts.push(nNew ? nNew.state : "");
    parts.push(`e${this._eAt ?? ""}|${this._eData ? this._eData.t : ""}`);
    if (this._rp) parts.push(`rp${this._rp.t}|${this._rp.drag ? 1 : 0}|${this._rp.mode ? 1 : 0}|${this._rp.menu ? 1 : 0}|${this._rp.play ? 1 : 0}|${this._rp.loading ? 1 : 0}|${this._rp.speed}|${this._rp.range}|${this._rp.at || 0}`);
    const key = parts.join(";");
    if (!force && key === this._key) return;
    this._key = key;
    this._dirty = false;
    this._render(sensor);
  },

  /** Entities the current overlay reads for this item (what can change what it shows). */
  _reads(item, ov) {
    const hass = this._hass;
    const all = this._allowed(item);
    const ents = new Set(item.bond || item.phantom ? item.entities : []);
    const main = item.main_entity;
    // The main entity matters where its state decides what shows: switchable/visible kinds, and
    // availability in Health and Network. A plain sensor as main entity doesn't change Live.
    if (main && (ov === "health" || ov === "network" || LIVE_KEY[kindOf(main, hass.states[main])])) ents.add(main);
    const kinds = {
      comfort: ["temperature", "humidity", "climate"],
      security: ["opening", "motion", "lock", "alarm", "safety", "camera"],
      health: ["battery"],
      network: ["signal"],
    }[ov];
    if (kinds) for (const e of ov === "network" ? item.entities || [] : all) if (kinds.includes(kindOf(e, hass.states[e]))) ents.add(e);
    if (ov === "energy") for (const d of this._eIndex(this._a || {}).get(item.id) || []) if (d.stat_rate) ents.add(d.stat_rate);
    const def = this._ovDef(ov);
    if (def && def.custom) for (const e of all) if (["temperature", "humidity", "battery", "climate"].includes(kindOf(e, hass.states[e]))) ents.add(e);
    return ents;
  },

  _render(sensor) {
    const c = this._config;
    const look = this._look();
    const btn = this._buttons();
    const dark = this._hass.themes && this._hass.themes.darkMode;
    const chipMode = look.chips === "auto" ? (dark ? "dark" : "light") : look.chips;
    // 0.11: chips from the card editor (Look): style, background and text size as presets; a colour only for "Custom".
    const bgPct = { solid: 100, light: 60, clear: 35 }[look.chip_bg];
    const rgb = chipMode === "custom" && Array.isArray(look.chip_color) && look.chip_color.length === 3 ? look.chip_color.map((v) => Math.round(Number(v) || 0)) : null;
    const lum = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 : null;
    let chipVars = chipMode === "light" || (chipMode === "custom" && !rgb)
      ? `--dfc-chipbg: color-mix(in srgb, var(--card-background-color, #fff) ${bgPct ?? 92}%, transparent); --dfc-chipfg: var(--primary-text-color); --dfc-chipborder: var(--divider-color);`
      : `--dfc-chipbg: rgba(30,30,30,${((bgPct ?? 78) / 100).toFixed(2)}); --dfc-chipfg: #fff; --dfc-chipborder: rgba(255,255,255,.25);`;
    if (rgb) chipVars = `--dfc-chipbg: rgba(${rgb.join(",")},${((bgPct ?? 85) / 100).toFixed(2)}); --dfc-chipfg: ${lum > 0.6 ? "#1c1c1c" : "#fff"}; --dfc-chipborder: ${lum > 0.6 ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.25)"};`;
    chipVars += ` --dfc-chipsize: ${{ s: 30, l: 40, xl: 48 }[look.chip_size] || 34}px;`;
    const roomVars = dark ? "--dfc-roomfg:#fff; --dfc-roomhalo: rgba(0,0,0,.85);" : "--dfc-roomfg:#263238; --dfc-roomhalo: rgba(255,255,255,.95);";
    const style = `<style>${CARD_CSS}</style>`;
    if (!sensor) {
      setShadow(this, `${style}<ha-card><div class="msg">${dfT("card.plan_missing", { p: cesc(this._floor || c.plan) })}</div></ha-card>`);
      return;
    }
    const a = sensor.attributes;
    const url = this._imgFailed && a.image_fallback_url ? a.image_fallback_url : a.image_url;
    if (url && url !== this._imgFor) {
      this._imgFor = url;
      this._img = null;
      cardSign(this._hass, url)
        .then((p) => {
          this._img = p;
          this._update(true);
        })
        .catch(() => {
          this._img = url;
          this._update(true);
        });
    }
    const ov = this._overlay;
    if (ov === "network") this._loadZha();
    this._netTimer(ov === "network");
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const fr = this._frame(a, ratio); // 0.10.2: first, so markers know the space around the plan
    this._a = a;
    let specs = this._markers(a);
    this._heat = null;
    if (ov === "comfort") {
      if (this._layerOn("comfort", "heat", this._layerDefault("comfort", "heat"))) this._heat = this._heatGrid(a, specs, ratio);
      if (!this._layerOn("comfort", "labels", this._layerDefault("comfort", "labels"))) specs = specs.filter((sp) => sp.kind !== "reading");
      // 0.7.5: ACs / thermostats as their own layer (their temperatures still count in the heatmap above).
      if (!this._layerOn("comfort", "clim", this._layerDefault("comfort", "clim"))) specs = specs.filter((sp) => sp.kind !== "climate");
    }
    if (ov === "energy") specs = specs.concat(this._eRoomSpecs(a));
    // 0.11.1 test8: no cameras in Replay (there is no recorded video to replay), in every overlay.
    if (this._rpOn()) specs = specs.filter((sp) => !sp.cam);
    this._specs = new Map(specs.map((s) => [s.key, s]));
    this._ghosts = ov === "network" && !this._rpIn() ? this._netGhosts(specs) : [];
    const watch = new Set();
    // 0.7.0: doors, windows and shutters drive bars and room shading even without a marker.
    for (const o of this._openSpots(a)) watch.add(o.eid);
    if (ov === "live") for (const m of this._motionSpots(a)) watch.add(m.eid);
    // 0.12.3: what the pictures follow (a car's tracker, a bond's members), so they change with it.
    if (ov === "live") for (const item of this._items(a)) { const b = this._bodyOf(item); if (b && b.pic) { const pl = this._per(item, "live"); for (const e of [b.lead, pl.when, pl.lead, pl.hl, ...b.sw]) if (e) watch.add(e); } }
    if (ov === "live" || ov === "security") for (const item of this._items(a)) { const tg = this._liveWhen(item); if (tg) watch.add(tg); }
    if (ov === "live") for (const item of this._items(a)) { const ap = this._applOf(item); if (ap) for (const e of [ap.status, ap.remaining, ap.progress, ap.running, ap.power, ap.door, ap.plug]) if (e) watch.add(e); }
    if (ov === "network") for (const s of specs) if (s.rt) watch.add(s.rt.eid);
    if (ov === "live" || ov === "lights") for (const item of this._items(a)) for (const e of [item.main_entity, ...(item.entities || [])]) if (e && domainOf(e) === "media_player") watch.add(e);
    if (ov !== "plan") for (const item of this._items(a)) if (!this._hidden(item, ov)) for (const e of this._reads(item, ov)) watch.add(e);
    for (const s of specs) for (const e of s.ents || []) watch.add(e);
    if (ov === "lights") for (const sc of this._lights().scenes || []) for (const e of sc.lights || []) watch.add(e);
    // Night look: every light's state shapes the pools; people: person + room sensors.
    if (ov === "lights" || ((this._ns || {}).f > 0 && (this._night().overlays || []).includes(ov))) {
      for (const item of this._items(a)) for (const e of item.bond ? item.entities : [item.main_entity]) if (e && domainOf(e) === "light") watch.add(e);
    }
    if (this._peopleShown()) for (const pp of this._people()) for (const e of [pp.entity, pp.room, pp.room2, pp.distance]) if (e) watch.add(e);
    // 0.13.9.4 People distance: the Bermuda sensors of the same device (area, distance to each proxy)
    if (this._pdOn()) {
      const reg = this._hass.entities || {};
      for (const pp of this._people()) {
        const dev = pp.distance && (reg[pp.distance] || {}).device_id;
        if (dev) for (const e of Object.keys(reg)) if (reg[e].device_id === dev && e.startsWith("sensor.")) watch.add(e);
      }
    }
    for (const x of this._ovActs()) if ((x.overlay || "cleaning") === ov) for (const e of barEnts(this._hass, x.status || {})) watch.add(e);
    if (["live", "cleaning", "health"].includes(ov)) {
      const ents = this._hass.entities || {};
      for (const [eid, r] of Object.entries(a.robots || {})) {
        for (const e of [eid, r && r.source]) if (e) watch.add(e);
        // The robot's own device (battery, consumables, dock) for Cleaning and Health.
        const dev = ov !== "live" && ents[eid] && ents[eid].device_id;
        if (dev) for (const x of Object.values(ents)) if (x.device_id === dev) watch.add(x.entity_id);
      }
    }
    this._watch = [...watch].sort();
    const isAdmin = this._hass.user && this._hass.user.is_admin;
    const nNew = Number((this._hass.states["sensor.device_floorplan_new_devices"] || {}).state) || 0;
    // 0.11.1: top left, away from Layers and the floor button; on a narrow card a short badge.
    const admin = isAdmin && nNew > 0 && !c.hide_admin_hint && !this._pick ? `<button class="admin" data-new="1" title="${dfT("admin.new_title", { n: nNew })}">${this._narrow ? dfT("admin.new_short", { n: nNew }) : dfT("admin.new_place", { n: nNew })}</button>` : "";
    const names = look.names === "always" ? "names-always" : look.names === "off" ? "names-off" : "";
    const dock = this._overlays();
    const labels = c.overlay_names || {};
    const vertical = btn.position === "left" || btn.position === "right";
    const dockShown = (dock.length > 1 || btn.shortcuts.some((x) => !x.hidden)) && btn.position !== "hidden";
    this._dockShown = dockShown;
    const rpRail = dockShown && this._rp && this._rp.mode;
    // Layers live in the floor rail when there is one, else in the button bar, never on the plan
    // (#63, #75); without a bar, in the legend row.
    const rpPos = this._rpBtnPos(dockShown);
    const layersOn = this._layersPos() !== "hidden";
    // test10: the round group is floors · Layers · Replay; with Layers hidden the Replay button keeps the corner.
    const lpos = layersOn || rpPos === "layers" ? this._layersPos(true) : "hidden";
    const grpOn = lpos !== "hidden";
    const floors = this._floorStack();
    const multi = floors.length > 1;
    const layersInBar = grpOn && lpos === "bar";
    // 0.7.5: a Layers corner on the bar's side shares that row / column (at its own end); "bar" = right after
    // the overlay buttons. Either way it sits outside the scrolling overlay buttons.
    const bp = btn.position;
    const touch = dockShown && grpOn && lpos !== "bar"
      && ((bp === "top" && lpos.startsWith("top")) || (bp === "bottom" && lpos.startsWith("bottom")) || (bp === "left" && lpos.endsWith("left")) || (bp === "right" && lpos.endsWith("right")));
    const atStart = touch && (vertical ? lpos.startsWith("top") : lpos.endsWith("left"));
    // Layers on the plan when it does not share the overlay buttons row.
    const lCorner = grpOn && !(layersInBar && dockShown) && !touch;
    // 0.13.3: admin notes (new overlay, release tip) float on the plan: they never push the Overlay Bar away.
    const notes = `${this._newOvHtml()}${this._tipHtml()}`;
    const pulseH = this._pulseHtml(a);
    const airH = this._airHtml(a);
    const cornerPos = ["top-left", "bottom-right", "bottom-left"].includes(lpos) ? lpos : "top-right";
    // 0.8.1: with several floors the floor button sits right next to Layers, on its right (one group, wherever Layers is).
    // test10: one order, counted from the plan's outer edge inwards: floors · Layers · Replay (so a group on the
    // left is the mirror of one on the right).
    const lg = () => {
      const parts = [rpPos === "layers" ? this._rpRoundBtn() : this._rpOvBtn(), layersOn ? this._layersBtn(true) : "", multi ? `<span class="fwrap">${this._floorHtml(floors)}</span>` : ""].filter(Boolean);
      return parts.length > 1 ? `<span class="lgroup ${lpos.endsWith("left") ? "rev" : ""}">${parts.join("")}</span>` : parts[0] || "";
    };
    const lgShown = () => lCorner || touch || (layersInBar && dockShown);
    const slot = (on) => `<span class="lslot ${on ? "" : "lvoid"}">${on ? lg() : ""}</span>`;
    const autoSt = dockShown && (btn.auto || Object.values(btn.actions || {}).some((x) => x && x.status && x.status.mode === "auto")) ? this._autoStatus() : {};
    // Card overlays · your own overlays · shortcuts, with a faint line where the group changes.
    const barItems = [
      ...dock.map((o) => {
        const d = this._ovDef(o);
        const oa = btn.actions[o] || {};
        return { g: OVERLAYS[o] ? 0 : 1, html: this._barBtn({ cls: o === ov ? "on" : "", attrs: `data-ov="${cesc(o)}" ${oa.hold_action ? 'data-bh="1"' : ""} aria-pressed="${o === ov}"`, icon: d.icon, label: labels[o] || d.label, st: this._btnStatus(oa.status, autoSt[o]) }) };
      }),
      ...btn.shortcuts.map((sc, i) => sc.hidden ? null : ({ g: 2, html: this._barBtn({ cls: "sc", attrs: `data-sc="${i}" data-bh="1"`, icon: sc.icon || "mdi:gesture-tap", label: sc.name || dfT("shortcut"), st: this._btnStatus(sc.status, null) }) })).filter(Boolean),
      // 0.11.1: Replay is a mode, not an overlay: last, after a divider.
      ...(rpPos === "bar" ? [{ g: 3, html: this._barBtn({ cls: "rpgo", attrs: 'data-rpgo="1"', icon: "mdi:history", label: dfT("rp.short") }) }] : []),
    ];
    const barHtml = barItems.map((x, i) => (i && x.g !== barItems[i - 1].g ? '<i class="bsep" aria-hidden="true"></i>' : "") + x.html).join("");
    const chev = (d) => `<button class="chev ${d}" data-chev="${d === "s" ? -1 : 1}" aria-label="${d === "s" ? dfT("bar.scroll_back") : dfT("bar.more")}"><ha-icon icon="mdi:chevron-${vertical ? (d === "s" ? "up" : "down") : d === "s" ? "left" : "right"}"></ha-icon></button>`;
    const barBg = btn.bar === "contrast" ? (this._hass.themes && this._hass.themes.darkMode ? "light" : "dark") : btn.bar;
    const dockHtml = dockShown
      ? `<div class="dockrow ${rpRail ? "rpm" : ""} ${touch ? "share" : ""} ${btn.rail ? `rail-${barBg}` : ""}">${touch ? slot(atStart) : ""}<div class="ovbar ${barBg} ${rpRail ? "rpmode" : ""} sh-${btn.shape} sz-${btn.size} ${vertical ? "vert" : ""}" ${rpRail && this._railBox ? `style="${vertical ? `width:${this._railBox.w}px` : `height:${this._railBox.h}px`}"` : ""}>${rpRail ? this._rpRail(vertical) : `${chev("s")}<nav class="dock ${btn.style === "icons" ? "icons" : ""}" aria-label="${dfT("bar.overlays")}" ${vertical ? 'aria-orientation="vertical"' : ""}>${barHtml}${this._penMode() === "pen" ? this._penHtml() : ""}</nav>${chev("e")}`}</div>${layersInBar ? `<span class="lslot lbar">${lg()}</span>` : ""}${touch ? slot(!atStart) : ""}</div>`
      : "";
    const title = c.title ? `<div class="hdr">${cesc(c.title)}</div>` : "";
    let emptyMsg = "";
    const people = this._peopleHtml(a);
    // 0.7.7: no "nothing to show" text on the plan: an empty overlay just means nothing is happening.
    const pos = btn.position === "hidden" ? "bottom" : btn.position;
    const scale = this._scale || 1;
    const nOn = this._ns.f > 0 && (this._night().overlays || []).includes(ov);
    const boxCls = `${this._rpT() != null ? "rpon" : ""} ${nOn && this._ns.f >= 0.5 ? "nt" : ""} ${nOn && this._ns.f >= 0.5 && this._night().dim_quiet !== false ? "nq" : ""}`;
    const floatCls = dockShown && btn.space && btn.space !== "reserve" ? `float ${btn.space === "float_icons" ? "float-icons" : ""}` : "";
    setShadow(this, `${style}<ha-card class="ov-${cesc(ov || "")} dock-${pos} ${floatCls} ${dockShown && btn.rail ? "srail" : ""} ${this._narrow ? "narrow" : ""}" style="--dfc-size:${Math.round((Number(look.size) || 34) * scale)}px;${chipVars}${roomVars}">
      <div class="main">${title}${admin}
        <div class="wrap ${names}"><div class="fr ${fr.crop ? "crop" : ""}" style="--fratio:${fr.ratio}"><div class="box ${boxCls}" style="--ratio:${ratio};${fr.style}">
          ${this._img ? `<img class="plan" src="${cesc(this._img)}" alt="${cesc(a.plan_name || "")}" draggable="false">` : ""}
          ${this._focusHtml(a)}${this._tapLayer(pulseH, airH)}${this._picHtml(a)}${this._heat ? `<canvas class="heat"></canvas>` : ""}${this._nightHtml(a)}${pulseH}${this._xmasHtml(a)}${this._picHtml(a, "hl")}${this._touchHtml(a)}${this._tvHtml(a)}${airH}${this._barsHtml(a)}${this._applHtml(a)}
          ${this._roomsHtml(a)}
          ${this._freshHtml(a)}${this._eFillHtml(a)}${this._eFlowHtml(a)}${this._robotHtml()}<svg class="lines"></svg>${this._winHtml()}
          ${specs.map((s) => (s.type === "chip" ? this._chipHtml(s) : s.type === "robot" ? this._robotMarker(s) : this._markerHtml(s))).join("")}${this._ghosts.map((g) => `<div class="gdev" data-ghost="1" style="left:${g.x}%;top:${g.y}%" aria-label="${cesc(`${g.name} · ${g.floor}`)}"><ha-icon icon="${cesc(g.icon)}"></ha-icon></div>`).join("")}${people.plan}${emptyMsg}${lCorner ? "" : this._rpPill()}
        </div>${lCorner ? `<div class="lcorner ${cornerPos}">${this._rpPill()}${lg()}</div>` : ""}${notes ? `<div class="notes">${notes}</div>` : ""}</div></div>${people.row}
        ${ov === "lights" ? this._sceneBarHtml(specs) : ""}${this._ovActsHtml(ov)}${this._heat ? this._heatLegendHtml() : ""}${this._cleanLegendHtml()}${this._eLegendHtml()}${!dockShown && !RP_SKIP.has(ov) && this._config.replay !== false && this._layerOn(ov, "replay", false) ? this._rpHtml() : ""}${ov === "security" && !specs.some((sp) => sp.kind !== "camera") && !this._layerOn("security", "all", this._layerDefault("security", "all")) ? `<div class="heatleg secok"><span class="cl"><ha-icon icon="mdi:shield-check-outline"></ha-icon>${dfT("sec.all_secure")}</span></div>` : ""}${ov === "network" ? this._legendHtml(specs, layersInBar && !dockShown) : ""}
      </div>${dockHtml}${layersOn && this._menu ? this._layersMenu(a) : ""}${multi && !lgShown() ? `<div class="fcorner"><span class="fwrap">${this._floorHtml(floors)}</span></div>` : ""}${this._popupHtml()}${dockShown && this._penMode() === "pen" ? "" : this._penHtml()}${rpRail && vertical ? '<div class="rpbub" hidden></div>' : ""}</ha-card>`);
    if (rpRail && vertical) {
      this._rpBub();
      requestAnimationFrame(() => this._rpBub()); // again once the rail has its final height
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-ent]")) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.ent];
    }
    const img = this.shadowRoot.querySelector("img.plan");
    if (img && a.image_fallback_url && !this._imgFailed && !img._dfErr) {
      img._dfErr = true;
      img.addEventListener("error", () => {
        this._imgFailed = true;
        this._update(true);
      }, { once: true });
    }
    for (const bm of this.shadowRoot.querySelectorAll("img.nbm")) {
      bm.addEventListener("error", () => {
        if (DFC_BRAND.matter.bad) return;
        DFC_BRAND.matter.bad = true; // no image: our "M"
        this._update(true);
      }, { once: true });
    }
    this._attachVids();
    const box = this.shadowRoot.querySelector(".box");
    if (this._ro && box) {
      this._ro.disconnect();
      this._ro.observe(box);
      this._ro.observe(this); // 0.8.2: the card's own size (the plan fits its free area)
    }
    this._layoutSoon();
    requestAnimationFrame(() => this._alignFloor());
    if (this._heat) requestAnimationFrame(() => this._drawHeat());
    if (this._menu) requestAnimationFrame(() => this._placeMenu());
    if (this._pillUntil && this._pillUntil > Date.now()) {
      clearTimeout(this._pillT);
      this._pillT = setTimeout(() => {
        const pl = this.shadowRoot.querySelector(".pill.show");
        if (pl) pl.classList.remove("show");
      }, this._pillUntil - Date.now());
    }
    // 0.12.5: Flow: one light runs around the outline; its dash is sized to the outline's length on screen.
    picSizeFlow(this.shadowRoot);
    if (this._busy && this._busy.size && this._specs) {
      for (const el of this.shadowRoot.querySelectorAll("[data-k]")) {
        const sp = this._specs.get(el.dataset.k);
        if (sp && sp.item && this._busyOn(sp.item.id)) el.classList.add("busy");
      }
    }
    if (box && !box._swipe) this._bindSwipe(box);
    if (box) this._boxW = box.getBoundingClientRect().width || this._boxW;
    this._announce();
    if (this._popup && this._popup.type === "readings") this._fillHistory();
    if ((this._popup && this._popup.type === "info") || this._prevShown) requestAnimationFrame(() => this._placeInfo());
  },

  /** Put the layers menu next to its button, inside the card (bar below, above, left or right). */
  _placeMenu() {
    const card = this.shadowRoot.querySelector("ha-card");
    const btn = this.shadowRoot.querySelector("[data-menu]");
    const menu = this.shadowRoot.querySelector(".lmenu");
    if (!card || !btn || !menu) return;
    const c = card.getBoundingClientRect();
    // 0.8.1: a long menu scrolls inside the card.
    menu.style.maxHeight = `${Math.max(120, c.height - 12)}px`;
    const b = btn.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const corner = btn.closest(".lcorner");
    const shared = btn.closest(".lslot");
    const pos = corner ? "corner" : shared ? `s-${this._buttons().position}` : this._buttons().position;
    let x;
    let y;
    if (pos.startsWith("s-")) {
      // From a shared row / column the menu opens towards the plan.
      const bp = pos.slice(2);
      if (bp === "left" || bp === "right") {
        x = bp === "right" ? b.left - m.width - 8 : b.right + 8;
        y = b.top + b.height / 2 < c.top + c.height / 2 ? b.top : b.bottom - m.height;
      } else {
        x = b.left + b.width / 2 < c.left + c.width / 2 ? b.left : b.right - m.width;
        y = bp === "top" ? b.bottom + 8 : b.top - m.height - 8;
      }
    } else if (pos === "corner") {
      const lp = this._layersPos();
      x = lp.endsWith("right") ? b.right - m.width : b.left;
      y = lp.startsWith("top") ? b.bottom + 8 : b.top - m.height - 8;
    } else if (pos === "left") {
      x = b.right + 8;
      y = b.top + b.height / 2 - m.height / 2;
    } else if (pos === "right") {
      x = b.left - m.width - 8;
      y = b.top + b.height / 2 - m.height / 2;
    } else if (pos === "top") {
      x = b.right - m.width;
      y = b.bottom + 8;
    } else {
      x = b.right - m.width;
      y = b.top - m.height - 8;
    }
    x = Math.max(c.left + 6, Math.min(c.right - m.width - 6, x));
    y = Math.max(c.top + 6, Math.min(c.bottom - m.height - 6, y));
    menu.style.left = `${x - c.left}px`;
    menu.style.top = `${y - c.top}px`;
    menu.style.visibility = "visible";
  },

  _loadZha(force = false) {
    if (!this._hass.user || !this._hass.user.is_admin || this._zhaBusy) return;
    if (!force && this._zha && Date.now() - this._zhaAt < 300000) return;
    this._zhaBusy = true;
    zhaDevices(this._hass, force ? 0 : 300000).then((d) => {
      this._zhaBusy = false;
      if (!d) return;
      this._zha = d;
      this._zhaAt = Date.now();
      if (this._overlay === "network") this._update(true);
    });
  },

  /** While Network is open: quietly reload ZHA data every 5 minutes (#66). */
  _netTimer(on) {
    if (on && !this._netT) this._netT = setInterval(() => this._loadZha(true), 300000);
    if (!on && this._netT) {
      clearInterval(this._netT);
      this._netT = null;
    }
  },

  /** ↻ Refresh: ask ZHA for a new neighbour scan, then reload (#66). */
  async _refreshZha() {
    if (this._scanning) return;
    this._scanning = true;
    this._update(true);
    try {
      await this._hass.callWS({ type: "zha/topology/update" });
    } catch (_e) {
      /* older HA / not ZHA: reload only */
    }
    await new Promise((r) => setTimeout(r, 6000));
    this._zhaBusy = false;
    this._loadZha(true);
    await new Promise((r) => setTimeout(r, 14000));
    this._zhaBusy = false;
    this._scanning = false;
    this._loadZha(true);
  },

  /** Floor rail (#75): Layers on top (Network), ▲ floors ▼. */
  /** 0.8.1: one round button with the floor number; tapped, it becomes the floor rail (▲ · floors · ▼), on the plan. */
  _floorHtml(floors) {
    const cur = floors.find((f) => f.id === this._floor) || floors[0];
    // 0.12.1: one rail button per level; a level with several plans also gets ◀ ▶ (only then).
    const [lv, li, si] = this._levelAt();
    const here = lv[li] ? lv[li].plans : [cur];
    const sides = here.length > 1;
    const hf = ((this._hass && this._hass.floors) || {})[cur.floor_id];
    const full = sides && hf && hf.name && hf.name.toLowerCase() !== cur.name.toLowerCase() ? `${hf.name} · ${cur.name}` : cur.name;
    if (!this._fopen) return `<button class="fbtn" data-fbtn="1" title="${dfT("floor.change_t", { f: cesc(full) })}" aria-label="${dfT("floor.change_a", { f: cesc(full) })}" aria-expanded="false"><ha-icon icon="mdi:office-building-outline"></ha-icon><b class="badge">${cesc(cur.label)}</b></button>`;
    const btn = (g, i) => {
      const f = i === li ? cur : g.plans[si] || g.plans[0];
      const nm = i === li ? full : f.name;
      return `<button class="fl ${i === li ? "on" : ""}" data-floor="${cesc(f.id)}" aria-pressed="${i === li}" aria-label="${cesc(nm)}" title="${cesc(nm)}">${cesc(f.label)}<span class="pill">${cesc(nm)}</span></button>`;
    };
    const side = sides
      ? `<span class="sides"><button class="arrow" data-side="-1" aria-label="${dfT("floor.left")}${si > 0 ? `: ${cesc(here[si - 1].name)}` : ""}" ${si <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-left"></ha-icon></button><button class="arrow" data-side="1" aria-label="${dfT("floor.right")}${si < here.length - 1 ? `: ${cesc(here[si + 1].name)}` : ""}" ${si >= here.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button></span>`
      : "";
    return `<div class="rail" role="toolbar" aria-label="${dfT("floor.floors")}">
      <button class="arrow" data-step="1" aria-label="${dfT("floor.up")}" ${li <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      ${lv.map(btn).join("")}
      <button class="arrow" data-step="-1" aria-label="${dfT("floor.down")}" ${li >= lv.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-down"></ha-icon></button>${side}</div>`;
  },

  /** 0.8.1: the floor rail opens towards the plan: downwards from a button in the upper half, else upwards. */
  _alignFloor() {
    const sr = this.shadowRoot;
    const card = sr && sr.querySelector("ha-card");
    if (!card) return;
    const c = card.getBoundingClientRect();
    sr.querySelectorAll(".fwrap").forEach((w) => {
      const r = w.getBoundingClientRect();
      w.classList.toggle("up", r.top > c.top + c.height / 2);
    });
  },

  /** Swipe up / down on the plan changes the floor (touch; option floors.swipe). */
  _bindSwipe(box) {
    box._swipe = true;
    let st = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      st = { x: e.clientX, y: e.clientY, t: Date.now() };
    });
    box.addEventListener("pointerup", (e) => {
      if (!st || this._floorStack().length < 2 || this._config.floor_swipe === false) return (st = null);
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      const fast = Date.now() - st.t < 700;
      st = null;
      if (fast && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.6) {
        this._swiped = true;
        this._stepFloor(dy < 0 ? 1 : -1);
      } else if (fast && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && this._levelAt()[0][this._levelAt()[1]].plans.length > 1) {
        // 0.12.1: sideways between the plans of this level (only when the level has more than one).
        this._swiped = true;
        this._stepSide(dx < 0 ? 1 : -1);
      }
    });
  },
});
