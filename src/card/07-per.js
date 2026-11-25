Object.assign(DeviceFloorplanCard.prototype, {

  _per(item, ov) {
    const o = this._dev(item.id);
    return (o.per && typeof o.per === "object" && o.per[ov]) || {};
  },

  /** The ONE entity a device shows in an overlay (#100): per overlay → device → Editor main → best fitting. */
  _leadFor(item, ov, fits) {
    const o = this._dev(item.id);
    const exists = (e) => !!e && !!this._hass.states[e];
    // 0.12.6: a Configuration / Diagnostic entity (a thermometer's "Show smiley" switch) never leads by itself.
    const ok = (e) => exists(e) && fits(e) && !this._hiddenInHA(e) && !this._aux(e);
    // What you chose in Edit markers always leads, also a plain sensor (print status, programme…).
    const legacy = o.show_in && typeof o.show_in === "object" ? o.show_in[ov] : null;
    for (const e of [this._per(item, ov).lead, legacy]) if (exists(e)) return e;
    for (const e of [o.show, item.main_entity]) if (ok(e)) return e;
    return this._allowed(item).find(ok) || null;
  },

  /** Kept for the editor (#90): the device-wide or per-overlay choice. */
  _shownEntity(item, ov) {
    const e = this._per(item, ov).lead || (this._dev(item.id).show_in || {})[ov] || this._dev(item.id).show;
    return e && this._hass.states[e] ? e : null;
  },

  /** Value text of an extra line (#101). */
  _extraText(e) {
    const st = this._hass.states[e];
    if (!st) return "—";
    if (domainOf(e) === "climate") return st.attributes.current_temperature != null ? this._attrVal(st, "current_temperature") : this._fmt(e);
    return ["temperature", "humidity", "battery", "sensor"].includes(kindOf(e, st)) ? this._fmtNum(e) : this._fmt(e);
  },

  /** Attach the "Also show" lines: per-overlay setting, else the defaults given by the overlay. */
  _withExtras(spec, item, ov, defaults = []) {
    if (!spec) return spec;
    const per = this._per(item, ov);
    // 0.12.6: only entities with a value (a button or an update has none) and not already part of the marker.
    const list = (Array.isArray(per.extras) ? per.extras : defaults).filter((e) => e && this._hass.states[e] && !NO_VALUE.has(domainOf(e)) && !(spec.ents || []).includes(e) && e !== spec.eid);
    spec.core = [...(spec.ents || [])]; // 0.12.9: the marker's own entities, before its extra lines
    if (per.icon) spec.icon = per.icon;
    if (per.noicon) {
      spec.icon0 = spec.icon;
      spec.icon = null;
      spec.noicon = true;
    }
    // One extra can be a badge on the marker's corner instead of a line (#116: FP2 people count).
    if (per.badge && list.includes(per.badge)) {
      spec.badge = this._extraText(per.badge);
      list.splice(list.indexOf(per.badge), 1);
      spec.ents = [...(spec.ents || []), per.badge];
    }
    if (list.length) {
      const ics = per.extra_icons || {};
      spec.extras = list.map((e) => ({ eid: e, text: this._extraText(e), icon: ics[e] || null }));
      spec.ents = [...(spec.ents || []), ...list];
    }
    return spec;
  },

  /** 0.8.2: space around the plan (+) or trimmed margin (-), % of the image per side: the card's own frame
   *  ("custom"), else the plan's default from the Floorplan Editor. Positions stay relative to the image. */
  _frame(a, ratio) {
    const cf = this._focusFrame(a) || this._config.frame || {};
    const f = cf.mode === "custom" ? cf : (a && a.frame) || {};
    // House frames (several floors) can be larger than 60 %: a big ground floor around a small upper floor.
    const v = (k) => Math.max(cf.focus ? -99 : -45, Math.min(500, Number(f[k]) || 0));
    const [t, r, b, l] = ["t", "r", "b", "l"].map(v);
    const W = 100 + l + r;
    const H = 100 + t + b;
    this._em = { t: Math.max(0, t), r: Math.max(0, r), b: Math.max(0, b), l: Math.max(0, l) };
    if (!t && !r && !b && !l) return { ratio, style: "", crop: false };
    return {
      // 0.8.2: a floor of a house uses the house's outer shape (its picture may be scaled per direction).
      ratio: cf.mode !== "custom" && Number(f.aspect) > 0 ? Number(f.aspect) : +(ratio * (W / H)).toFixed(4),
      crop: t < 0 || r < 0 || b < 0 || l < 0,
      style: `position:absolute;width:${(10000 / W).toFixed(3)}%;height:${(10000 / H).toFixed(3)}%;left:${((l * 100) / W).toFixed(3)}%;top:${((t * 100) / H).toFixed(3)}%;aspect-ratio:auto`,
    };
  },

  /** 0.13.9.13 (mobile card): `focus_area`: the plan cut to one room, its box + about 10 % per side
   *  (0.6–1.5 m on a measured plan), never padded beyond the picture. A room without a shape: around its pin. */
  _focusFrame(a) {
    const id = this._config.focus_area;
    const ar = id && a && (a.areas || {})[id];
    if (!ar) return null;
    const sh = Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const xs = sh ? sh.map((p) => p[0]) : [ar.x - 8, ar.x + 8];
    const ys = sh ? sh.map((p) => p[1]) : [ar.y - 8, ar.y + 8];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const marg = (size, mpp, px) => {
      const m = size * 0.1;
      const perPct = Number(mpp) > 0 && Number(px) > 0 ? (Number(mpp) * Number(px)) / 100 : 0; // metres per 1 %
      return perPct ? Math.min(Math.max(m, 0.6 / perPct), 1.5 / perPct) : Math.max(m, 2);
    };
    const mx = marg(x1 - x0, a.metres_per_px_x, a.image_width);
    const my = marg(y1 - y0, a.metres_per_px_y || a.metres_per_px_x, a.image_height);
    // 0.13.9.15: `focus_aspect` (width / height of the space the cut-out fills): the view keeps the room fitted
    // and centred, and fills the rest with the plan around it (shifted to stay on the picture).
    const asp = Number(this._config.focus_aspect);
    const W = Number(a.image_width) || 1000;
    const H = Number(a.image_height) || 1000;
    if (asp > 0) {
      let bw = ((x1 - x0 + 2 * mx) * W) / 100;
      let bh = ((y1 - y0 + 2 * my) * H) / 100;
      if (bw / bh < asp) bw = bh * asp;
      else bh = bw / asp;
      const span = (c, len, full) => {
        const l = Math.min(full, len);
        const s = Math.max(0, Math.min(full - l, c - l / 2));
        return [s, full - s - l];
      };
      const [l0, r0] = span(((x0 + x1) / 2 / 100) * W, bw, W);
      const [t0, b0] = span(((y0 + y1) / 2 / 100) * H, bh, H);
      return { mode: "custom", focus: true, t: -(t0 / H) * 100, b: -(b0 / H) * 100, l: -(l0 / W) * 100, r: -(r0 / W) * 100 };
    }
    const cut = (v) => -Math.max(0, Math.min(99, v));
    return { mode: "custom", focus: true, t: cut(y0 - my), b: cut(100 - y1 - my), l: cut(x0 - mx), r: cut(100 - x1 - mx) };
  },

  /** 0.8.1: the readings a marker shows when nothing is picked under "Also show": its lines on the plan, else
   *  what its info card lists (appliances: time left and power; bonds and phantoms: their members). The
   *  Marker Editor starts from exactly this list, so adding a reading keeps the others. */
  _autoReads(item, ov) {
    const ap = ov === "live" && this._applOf(item);
    if (ap) return [ap.remaining || ap.progress, ap.power].filter(Boolean);
    let sp = null;
    try {
      sp = this._specsFor(item, ov, false)[0];
    } catch (_e) {
      sp = null;
    }
    if (!sp) return [];
    if (sp.extras && sp.extras.length) return sp.extras.map((x) => x.eid);
    if (!item.bond && !item.phantom) return [];
    const lead = sp.phantom ? null : sp.eid || (sp.ents || [])[0];
    return [...new Set([...(sp.ents || []), ...(sp.also || []), ...(item.entities || [])])].filter((e) => e && e !== lead && this._hass.states[e]);
  },

  /** Lights as glow only in this overlay (#112). */
  _glowOnly(ov) {
    if (ov === "live") return (this._ov("live").lights_as || "glow") === "glow";
    const def = this._ovDef(ov);
    return !!(def && def.custom && def.custom.lights_as === "glow");
  },

  /** One entity per kind key (custom overlays, #109). */
  _entityForKind(item, key, allowed) {
    const hass = this._hass;
    const ks = (e) => kindOf(e, hass.states[e]);
    if (key === "temperature") return allowed.find((e) => ks(e) === "temperature" && (ambientTemp(e, hass.states[e], item) || this._dev(item.id).comfort === true)) || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && hass.states[e].attributes.current_temperature != null) || null;
    if (key === "humidity") return allowed.find((e) => ks(e) === "humidity") || allowed.find((e) => domainOf(e) === "climate" && hass.states[e] && Number(hass.states[e].attributes.current_humidity) > 0) || null;
    if (key === "battery") return (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && item.roles.battery) || allowed.find((e) => ks(e) === "battery") || null;
    const pick = allowed.filter((e) => LIVE_KEY[ks(e)] === key && !this._aux(e)); // 0.12.6: no setting switches
    if (item.main_entity && pick.includes(item.main_entity)) return item.main_entity;
    return pick[0] || null;
  },

  _specsFor(item, ov, q) {
    const hass = this._hass;
    const name = this._dev(item.id).name || item.name;
    if (ov === "cleaning") return []; // 0.10: only robots (and rooms) in Cleaning: _robotSpecs
    if (item.phantom) return this._phantomSpecs(item, name, ov, q);
    // Split device (#91): Network and Health show the device at its hardware spot only.
    if (item.of && (ov === "network" || ov === "health")) return [];
    // #105: a split spot that "acts as" a light / switch / fan.
    if (["light", "switch", "fan"].includes(item.as)) item = { ...item, actsAs: item.as };
    const allowed = this._allowed(item);
    const cx = this._cx || { hubs: new Set(), zha: {} };
    const kindOfE = (e) => (item.actsAs && e === item.main_entity ? { light: "light", switch: "switch", fan: "fan" }[item.actsAs] : kindOf(e, hass.states[e]));
    const one = (spec, defaults) => (spec ? [this._withExtras(spec, item, ov, defaults)] : []);
    // 0.7.4: an appliance with a drum / line is its own signal in Live (bonds too), and its plug is no light.
    if (!q && (ov === "live" || ov === "lights") && this._applOf(item)) return [];
    if (ov === "live") {
      const opts = this._ov("live");
      const kinds = opts.show || LIVE_DEFAULT;
      // 0.11: "Show in Live when…": a camera (or any device with a picked trigger) shows only while its
      // motion / ring / door sensor is on, and a little after. A camera without a trigger stays out of Live.
      const trig = this._liveWhen(item);
      const cam = this._camOf(item);
      if (trig || cam) {
        if (q) return [{ key: item.id }];
        // A camera without a trigger shows only with Layers → Cameras; unavailable cameras never in Live.
        // 0.11: Layers → Cameras shows every camera; on top of that a trigger pops one up by itself.
        const layer = !!cam && this._layerOn("live", "cams", false) && this._layerOn("live", `cam:${item.id}`, true);
        if (trig) this._trigMark(trig);
        const popped = !!trig && this._trigOn(trig, this._per(item, "live").stay) && !this._camShut(trig);
        const show = layer || popped;
        if (!show) return [];
        const lead = cam || this._per(item, ov).lead || this._addedLead(item);
        if (cam && !live(hass.states[cam])) return [];
        if (!hass.states[lead]) return [];
        // 0.12.6: a device with a picked trigger shows as itself, with its value (a camera: its picture).
        const sp = cam ? this._liveSpec(item, name, lead, hass.states[lead], kindOfE(lead), { ...opts, values: false }) : this._asItself(item, name, lead);
        if (!sp) return [];
        return one({ ...sp, key: `${item.id}|${lead}`, on: true, dim: false, ents: trig ? [lead, trig] : [lead], trig: layer ? null : trig, cam: !!cam, win: true });
      }
      if (item.bond && !this._per(item, ov).lead) {
        const kind = this._mainKind(item);
        const key = LIVE_KEY[kind];
        if (!key || !kinds.includes(key)) return [];
        if (kind === "climate" && !q) return [];
        const bs = this._liveSpec(item, name, item.main_entity, hass.states[item.main_entity], kind, opts);
        if (!q && !bs.on && this._undoFor([item.main_entity, ...(item.entities || [])])) return one({ ...bs, dim: true });
        if (!q && (this._per(item, ov).off || opts.show_off || "hidden") === "hidden" && !bs.on) return [];
        if (kind === "light" && this._glowOnly(ov)) bs.glow = true;
        return one(bs);
      }
      const lead0 = this._leadFor(item, ov, (e) => kinds.includes(LIVE_KEY[kindOfE(e)]));
      // 0.12.6: a device you added to Live shows as itself (a thermometer as its chip) and stays on the plan.
      const added = this._added(item, ov);
      if (!lead0 && !added) return [];
      if (!lead0 || (added && READ_KIND.has(kindOfE(lead0)))) {
        if (q) return [{ key: item.id }];
        return one(this._asItself(item, name, lead0 || this._addedLead(item)), []);
      }
      const lead = lead0;
      const kind = kindOfE(lead);
      // Live = what is happening now: things that are off are hidden (option: faint). Added: shown unless set.
      const hideOff = !q && (this._per(item, ov).off || (added ? "shown" : opts.show_off) || "hidden") === "hidden";
      // 0.7.3: Room pulse: motion and presence in a room with a shape show as the room's glowing edges.
      if (!q && kind === "motion" && (opts.motion_as || "pulse") === "pulse" && this._roomOf(item)) return [];
      // 0.7.0: a drawn opening is its own signal (the bar); shutters show only while moving.
      if (!q && this._barEnts().has(lead)) return [];
      if (!q && openKind(lead, hass.states[lead]) && guessOpenAs(lead, hass, item.name, item.as) === "shutter") {
        const st0 = hass.states[lead];
        if (!(domainOf(lead) === "cover" && st0 && ["opening", "closing"].includes(st0.state))) return [];
      }
      if (kind === "climate") {
        // 0.8.0: Live shows climate only as its air flow / warm glow; temperatures live in Comfort.
        // (The editor still sees it, so it can be hidden in Live, which also hides its air flow.)
        if (!q) return [];
        return one(this._climateChip(item, name, lead, null, null, { compact: true }));
      }
      const spec = this._liveSpec(item, name, lead, hass.states[lead], kind, opts);
      if (!q && !spec.on && this._undoFor([lead])) return one({ ...spec, dim: true });
      if (kind === "light" && this._glowOnly(ov)) {
        if (!spec.on && !q) return [];
        spec.glow = true;
      }
      if (hideOff && !spec.on) return [];
      return one(spec);
    }
    if (ov === "lights") {
      const opts = this._lights();
      const fits = (e) => {
        const k = kindOfE(e);
        return k === "light" || (opts.switches !== false && (k === "switch" || k === "fan") && (item.actsAs ? item.actsAs === "light" : item.group === "lights"));
      };
      const lead = item.bond && !this._per(item, ov).lead ? (fits(item.main_entity) ? item.main_entity : null) : this._leadFor(item, ov, fits);
      if (!lead) return [];
      const spec = this._liveSpec(item, name, lead, hass.states[lead], "light", { quiet_small: false });
      if (!q && !spec.on && opts.off === "hidden") return [];
      spec.dim = !spec.on && opts.off !== "normal";
      spec.value = "";
      if (spec.on && opts.brightness && this._look().markers !== "icon") {
        const st = hass.states[lead];
        const b = st && st.attributes.brightness;
        if (num(b)) spec.value = `${Math.round((Number(b) / 255) * 100)}%`;
      }
      return one(spec);
    }
    if (ov === "comfort") {
      const per = this._per(item, ov);
      if (per.lead && hass.states[per.lead]) {
        const k = kindOf(per.lead, hass.states[per.lead]);
        if (k === "climate") return one(this._climateChip(item, name, per.lead, null, null));
        if (k === "temperature" || k === "humidity") {
          // An explicit lead shows itself (+ the extras you chose), no automatic humidity next to it.
          const t = k === "temperature" ? per.lead : null;
          const h = k === "humidity" ? per.lead : null;
          const lines = [t ? this._fmtNum(t) : "", h ? this._fmtNum(h) : ""].filter(Boolean);
          return one({ ...this._chipSpec(item, name, { lines, ents: [t, h].filter(Boolean), kind: "reading" }), rd: { t: t ? lines[0] : "", h: h ? lines[lines.length - 1] : "" } });
        }
      }
      return this._comfortSpecs(item, name, allowed, this._ov("comfort")).map((sp) => this._withExtras(sp, item, ov));
    }
    if (ov === "security") {
      const opts = this._ov("security");
      const sec = ["opening", "motion", "lock", "alarm", "safety", "camera"];
      // 0.10.2: a relay's "opening" input (e.g. a Sonoff ZBMINIR2's wall-switch input) is no door:
      // on a device with a switch or light it counts only when drawn as an opening or picked.
      const relay = !(item.opening && item.opening.x1 != null) && (item.allEntities || item.entities || []).some((e) => ["switch", "light"].includes(domainOf(e)));
      const fits = (e) => {
        const k = kindOf(e, hass.states[e]);
        if (k === "opening" && relay && domainOf(e) === "binary_sensor") return false;
        // 0.11: shutters are no security alert (their bar on the window shows the position).
        if (domainOf(e) === "cover") return false;
        // 0.11: a camera only when the device is one (its main entity), not a tablet's or robot's camera entity.
        return sec.includes(k) && !(k === "camera" && (opts.cameras === false || this._camOf(item) !== e));
      };
      // #100: one marker per device; its other sensors are in the popup.
      const lead = this._leadFor(item, ov, fits);
      if (!lead) return [];
      const st = hass.states[lead];
      const k = kindOf(lead, st);
      // 0.10.2: unavailable counts as an alert in Security (a silent sensor may be a threat).
      const alert = this._isOn(lead, st, k) || !live(st);
      // 0.11: a camera is a fixture: always on the Security map as its dot (unavailable: the usual red marker);
      // its picture as in Live: when its trigger fires, or with Layers → Cameras.
      if (k === "camera" && live(st)) {
        if (q) return [{ key: item.id }];
        const trig = this._liveWhen(item);
        const layer = this._layerOn(ov, "cams", false) && this._layerOn(ov, `cam:${item.id}`, true);
        if (trig) this._trigMark(trig);
        const popped = !!trig && this._trigOn(trig, this._per(item, "live").stay) && !this._camShut(trig);
        const sp = this._liveSpec(item, name, lead, st, k, { values: false });
        return one({ ...sp, key: `${item.id}|${lead}`, on: true, dim: false, ents: trig ? [lead, trig] : [lead], trig: layer ? null : trig, cam: true, win: layer || popped });
      }
      if (!q && !alert && k !== "camera" && !this._layerOn(ov, "all", this._layerDefault(ov, "all"))) return [];
      const others = allowed.filter((e) => e !== lead && fits(e));
      const spec = { ...this._liveSpec(item, name, lead, st, k, { values: false }), key: `${item.id}|${lead}`, ents: [lead], also: others };
      return one(spec);
    }
    if (ov === "health") return this._healthSpecs(item, name, allowed, this._ov("health"), q).map((sp) => this._withExtras(sp, item, ov));
    if (ov === "energy") return this._energySpecs(item, name, q);
    if (ov === "network") return this._netSpecs(item, name, cx, q);
    const def = this._ovDef(ov);
    if (def && def.custom) return this._customSpecs(item, name, allowed, def.custom, q, ov);
    return [];
  },

  _comfortSpecs(item, name, allowed, opts) {
    const hass = this._hass;
    const temps = [];
    const hums = [];
    for (const eid of allowed) {
      const st = hass.states[eid];
      const k = kindOf(eid, st);
      if (k === "temperature" && (ambientTemp(eid, st, item) || this._dev(item.id).comfort === true)) temps.push(eid);
      if (k === "humidity" && opts.humidity !== false) hums.push(eid);
    }
    const clim = allowed.find((eid) => domainOf(eid) === "climate");
    if (clim && opts.climate !== false && !item.bond) {
      const spec = this._climateChip(item, name, clim, temps[0], hums[0] || allowed.find((e) => kindOf(e, hass.states[e]) === "humidity"));
      if (spec) return [spec];
    }
    if (!temps.length && !hums.length) return [];
    if (!temps.length && opts.humidity_alone === false) return [];
    const lines = [];
    if (item.bond && (temps.length > 1 || hums.length > 1)) {
      // A bond of sensors: one chip, combined value (#58).
      if (temps.length) lines.push(this._combine(item, temps));
      if (hums.length) lines.push(this._combine(item, hums));
      return [{ ...this._chipSpec(item, name, { lines, ents: [...temps, ...hums], kind: "reading" }), rd: { t: temps.length ? lines[0] : "", h: hums.length ? lines[lines.length - 1] : "" } }];
    }
    if (temps[0]) lines.push(this._fmtNum(temps[0]));
    if (hums[0]) lines.push(this._fmtNum(hums[0]));
    return [{ ...this._chipSpec(item, name, { lines, ents: [...temps.slice(0, 1), ...hums.slice(0, 1)], kind: "reading" }), rd: { t: temps[0] ? lines[0] : "", h: hums[0] ? lines[lines.length - 1] : "" } }];
  },

  /** Combined number for bonds and phantoms: average · lowest · highest · one (#58, #60). */
  _combine(item, ents) {
    const hass = this._hass;
    const o = this._dev(item.id);
    const mode = o.value || (item.phantom && item.value) || this._ov("comfort").combine || "average";
    if (mode === "one") {
      const fromMember = item.phantom && item.one ? ents.find((e) => (item.byMember[item.one] || []).includes(e)) : null;
      return this._fmtNum((o.one && ents.includes(o.one) && o.one) || fromMember || ents[0]);
    }
    // "climate.x" = its room temperature, "climate.x#h" = its humidity (#98).
    const valOf = (e) => {
      const [id, part] = e.split("#");
      const s = hass.states[id];
      if (!live(s)) return null;
      if (domainOf(id) === "climate") {
        const v = part === "h" ? s.attributes.current_humidity : s.attributes.current_temperature;
        return num(v) && !(part === "h" && Number(v) <= 0) ? Number(v) : null;
      }
      return num(s.state) ? Number(s.state) : null;
    };
    const vals = ents.map(valOf).filter((v) => v != null);
    if (!vals.length) return "—";
    const v = mode === "min" ? Math.min(...vals) : mode === "max" ? Math.max(...vals) : vals.reduce((x, y) => x + y, 0) / vals.length;
    const plain = ents.find((e) => !e.includes("#") && domainOf(e) !== "climate");
    const st = plain ? hass.states[plain] : null;
    const unit = st ? st.attributes.unit_of_measurement || "" : ents[0].includes("#h") ? "%" : "°";
    return `${this._num1(v)}${unit === "%" || unit === "°" ? "" : " "}${unit}`.trim();
  },

  /** Phantom items per overlay: one chip/marker with the combined value; tap lists its devices. */
  _phantomSpecs(item, name, ov, q) {
    const hass = this._hass;
    const ents = item.entities || [];
    const kindsOf = (list, ks) => list.filter((e) => ks.includes(kindOf(e, hass.states[e])));
    const def = this._ovDef(ov);
    const custom = def && def.custom ? (Array.isArray(def.custom.kinds) ? def.custom.kinds : []) : null;
    const kindIcon = { opening: "mdi:window-open-variant", motion: "mdi:motion-sensor", light: "mdi:lightbulb-group", switch: "mdi:toggle-switch", fan: "mdi:fan", lock: "mdi:lock", safety: "mdi:shield-alert" };
    const pick = this._dev(item.id).icon || (item.icon && item.icon !== "dfp:phantom" ? item.icon : null);
    const icon = pick;
    if (ov === "comfort" || (custom && (custom.includes("temperature") || custom.includes("humidity")))) {
      const allT = kindsOf(ents, ["temperature"]);
      // 0.12.9: a room temperature by the rule of the device it comes from (no plug's or NAS's own temperature).
      const ownerOf = (e) => (item.members || []).find((m) => (item.byMember[m] || []).includes(e));
      const room = (e) => {
        const m = ownerOf(e);
        const g = m && (item.mgroup || {})[m];
        return g ? ambientTemp(e, hass.states[e], { group: g, standalone: false }) || this._dev(m).comfort === true : ambientTemp(e, hass.states[e], { standalone: true });
      };
      const amb = allT.filter(room);
      // #98: ACs and thermostats count with the temperature / humidity they report themselves.
      const clim = ents.filter((e) => domainOf(e) === "climate" && hass.states[e]);
      const temps = [...amb, ...clim.filter((e) => hass.states[e].attributes.current_temperature != null)];
      const hums = [...kindsOf(ents, ["humidity"]), ...clim.filter((e) => Number(hass.states[e].attributes.current_humidity) > 0).map((e) => `${e}#h`)];
      if (!temps.length && !hums.length) return [];
      if (q) return [{ key: item.id }];
      const lines = [];
      if (temps.length) lines.push(this._combine(item, temps));
      if (hums.length) lines.push(this._combine(item, hums));
      return [{ ...this._chipSpec(item, name, { lines, ents: [...new Set([...temps, ...hums].map((e) => e.split("#")[0]))], kind: "reading" }), rd: { t: temps.length ? lines[0] : "", h: hums.length ? lines[lines.length - 1] : "" }, phantom: true }];
    }
    let list = [];
    if (ov === "security" || (custom && custom.some((k) => ["opening", "motion"].includes(k)))) list = kindsOf(ents, ["opening", "motion", "lock", "safety"]);
    else if (ov === "lights") list = item.mains.filter((e) => ["light", "switch", "fan"].includes(kindOf(e, hass.states[e])));
    else if (ov === "live") list = [...new Set([...item.mains.filter((e) => LIVE_KEY[kindOf(e, hass.states[e])]), ...kindsOf(ents, ["opening", "motion"])])];
    if (!list.length) return [];
    if (q) return [{ key: item.id }];
    const kinds = list.map((e) => kindOf(e, hass.states[e]));
    const n = list.filter((e, i) => this._isOn(e, hass.states[e], kinds[i])).length;
    const kind = kinds.every((k) => k === kinds[0]) ? kinds[0] : kinds.includes("opening") ? "opening" : kinds[0];
    let value = "";
    if (kind === "opening") value = n ? dfT("sec.n_open", { n }) : dfT("sec.all_closed");
    else if (kind === "motion") value = n ? dfT("motion.detected") : dfT("motion.clear");
    else if (["light", "switch", "fan"].includes(kind)) {
      // 0.7.4: a bond counts once (on while any of its members is on).
      const units = (item.units || list.map((e) => [e])).map((u) => u.filter((e) => list.includes(e))).filter((u) => u.length);
      value = `${units.filter((u) => u.some((e) => this._isOn(e, hass.states[e], kindOf(e, hass.states[e])))).length} of ${units.length} on`;
    }
    else value = n ? `${n} active` : "";
    const color = kind === "motion" ? "#43a047" : kind === "opening" ? "#fb8c00" : "var(--dfc-accent)";
    return [{ key: item.id, type: "marker", item, name, ents: list, eid: list[0], st: null, kind, on: n > 0, dim: false, unavail: false, color, value: this._look().markers !== "icon" ? value : "", icon: icon || kindIcon[kind] || "mdi:shape-outline", x: item.x, y: item.y, phantom: true }];
  },

  /** ACs and thermostats, chip v2: [icon] Cooling / Set 24° │ 25.1° / 💧 68%; only what the unit reports. */
  _climateChip(item, name, clim, tempEid, humEid, { compact = false } = {}) {
    const st = this._hass.states[clim];
    if (!st) return null;
    const a = st.attributes || {};
    const on = live(st) && st.state !== "off";
    const act = on && a.hvac_action && CLIMATE_ACTION[a.hvac_action] ? CLIMATE_ACTION[a.hvac_action] : null;
    const mode = live(st) ? st.state : "off";
    const word = !live(st) ? dfT("offline") : act ? act.word : CLIMATE_MODE_WORD[mode] || (this._hass.formatEntityState ? this._hass.formatEntityState(st) : mode);
    const color = !on ? "#9e9e9e" : act ? act.color : (CLIMATE_MODES[mode] || CLIMATE_MODES.auto).color;
    let set = "";
    if (on) {
      if (a.temperature != null) set = `Set ${this._num1(a.temperature)}°`;
      else if (a.target_temp_low != null && a.target_temp_high != null) set = `Set ${this._num1(a.target_temp_low)}–${this._num1(a.target_temp_high)}°`;
      else if (a.target_humidity != null) set = `Set ${a.target_humidity}%`;
    }
    // 0.7.5: a real room thermometer bonded with the unit beats its built-in sensor; "own_temp: off"
    // keeps the unit's own readings out of the chip, Comfort and the heatmap.
    const room = this._roomSensors(item, clim);
    const own = this._dev(item.id).own_temp !== "off";
    let temp = "";
    if (room.t) temp = this._fmtNum(room.t).replace(/\s?°C|\s?°F/, "°");
    else if (own && a.current_temperature != null) temp = `${this._num1(a.current_temperature)}°`;
    else if (own && tempEid) temp = this._fmtNum(tempEid).replace(/\s?°C|\s?°F/, "°");
    let hum = "";
    // #88: 0 / missing humidity = the unit has no humidity sensor.
    if (room.h && Number((this._hass.states[room.h] || {}).state) > 0) hum = this._fmtNum(room.h);
    else if (own && a.current_humidity != null && Number(a.current_humidity) > 0) hum = `${Math.round(Number(a.current_humidity))}%`;
    else if (own && humEid && Number((this._hass.states[humEid] || {}).state) > 0) hum = this._fmtNum(humEid);
    // 0.12.10: where the chip's temperature / humidity come from (its readings popup charts these).
    const src = {
      t: room.t || (own && a.current_temperature != null ? clim : own ? tempEid : null) || null,
      h: (room.h && Number((this._hass.states[room.h] || {}).state) > 0 && room.h) || (own && Number(a.current_humidity) > 0 ? `${clim}#h` : own && humEid && Number((this._hass.states[humEid] || {}).state) > 0 ? humEid : null) || null,
    };
    const icon = this._dev(item.id).icon || climateIcon(clim, st);
    const ents = [clim];
    const heatEnts = room.t ? [room.t] : own ? [clim, tempEid].filter(Boolean) : [];
    // Compact (Live, custom overlays, #99): icon + room temperature in the mode colour; "Off" when off.
    // 0.7.4: off needs no word: the grey chip already says it (a narrower chip); offline still says so.
    const shown = live(st) && st.state === "off" ? "" : word;
    if (compact) return { key: `${item.id}|${clim}`, type: "chip", cl2: true, compact: true, item, name, lines: [temp || "—", word], word: on ? "" : shown, set: "", temp, hum: "", ents, src, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
    return { key: `${item.id}|${clim}`, type: "chip", cl2: true, item, name, lines: [temp || "—", word], word: shown, set, temp, hum, ents, src, heatEnts, kind: "climate", icon, cls: on ? "" : "off", color, x: item.x, y: item.y };
  },

  /** Room thermometer / humidity sensor bonded with a climate unit (from another device than the unit). */
  _roomSensors(item, clim) {
    if (!item.bond) return {};
    const hass = this._hass;
    const devs = (this._a && this._a.devices) || {};
    const climDev = (item.members || []).find((m) => ((devs[m] || {}).entities || []).includes(clim));
    const mine = new Set(climDev ? devs[climDev].entities || [] : []);
    const pool = (item.entities || []).filter((e) => e !== clim && !mine.has(e) && live(hass.states[e]));
    const t = pool.find((e) => kindOf(e, hass.states[e]) === "temperature" && ambientTemp(e, hass.states[e], { standalone: true }));
    const h = pool.find((e) => kindOf(e, hass.states[e]) === "humidity");
    return { t, h };
  },

  _num1(v) {
    const n = Math.round(Number(v) * 10) / 10;
    try {
      return n.toLocaleString(this._hass.locale && this._hass.locale.language ? this._hass.locale.language : undefined, { maximumFractionDigits: 1 });
    } catch (_e) {
      return String(n);
    }
  },

  _healthSpecs(item, name, allowed, opts, q) {
    const hass = this._hass;
    const low = Number(opts.low ?? 20);
    // 0.12.9: automatically the device's own battery (HA lists it under Diagnostic); "Follows" picks another
    // (a UPS's or a car's charge level).
    const devBat = (eid) => kindOf(eid, hass.states[eid]) === "battery" && this._aux(eid);
    const pickd = this._per(item, "health").lead;
    const chosen = pickd && hass.states[pickd] ? pickd : null;
    let bat = chosen || (item.roles && item.roles.battery && allowed.includes(item.roles.battery) && devBat(item.roles.battery) && item.roles.battery) || allowed.find(devBat);
    if (item.bond && !chosen) {
      // A bond: the lowest battery of its members.
      const bats = allowed.filter((eid) => devBat(eid) && live(hass.states[eid]) && num(hass.states[eid].state));
      if (bats.length) bat = bats.sort((x, y) => Number(hass.states[x].state) - Number(hass.states[y].state))[0];
    }
    const unavailable = item.bond ? (item.entities || []).some((e) => (hass.states[e] || {}).state === "unavailable") : item.main_entity && devOffline(hass, item, this._rpT() != null);
    const pos = item.box || item;
    if (bat) {
      const st = hass.states[bat];
      const v = live(st) && num(st.state) ? Number(st.state) : null;
      const isLow = v != null && v <= low;
      if (!q && opts.only_problems && !isLow && !unavailable) return [];
      const icon = v == null ? "mdi:battery-unknown" : v <= low ? "mdi:battery-alert-variant-outline" : v >= 95 ? "mdi:battery" : `mdi:battery-${Math.max(10, Math.min(90, Math.round(v / 10) * 10))}`;
      return [this._chipSpec({ ...item, x: pos.x, y: pos.y }, name, { lines: [v != null ? `${Math.round(v)}%` : "—"], icon, ents: [bat], kind: "reading", cls: isLow ? "low" : unavailable ? "warn" : "" })];
    }
    if (q) return item.main_entity && !item.bond ? [{ key: item.id, offlineOnly: true }] : []; // shows only when offline
    if (unavailable) return [this._offChip({ ...item, x: pos.x, y: pos.y }, name)];
    return [];
  },
});
