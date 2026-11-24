Object.assign(DeviceFloorplanCard.prototype, {

  /** Marker specs for the current overlay. */
  _markers(a) {
    const ov = this._overlay;
    const out = [];
    if (ov === "plan" || !this._ovDef(ov)) return out;
    this._cx = this._ctx(a);
    this._skippedUnknown = 0;
    const name0 = (item) => this._dev(item.id).name || item.name;
    for (const item of this._items(a)) {
      const isSel = this._pick && this._selId === item.id;
      if (this._hidden(item, ov)) {
        // 0.7.5: Edit markers: a selected marker hidden here is drawn faded, so changes can be seen.
        if (isSel) out.push(...this._selSpec(item, ov, name0(item)).map((x) => ({ ...x, ghost: true })));
        continue;
      }
      let sp = this._specsFor(item, ov, false);
      // Off / idle right now (Live hides it): while selected it shows as it looks when active.
      // (Appliances show their label instead, see _applHtml.)
      if (isSel && !sp.length && !((ov === "live" || ov === "lights") && this._applOf(item))) sp = this._selSpec(item, ov, name0(item)).map((x) => ({ ...x, on: true, dim: false, cls: "" }));
      out.push(...sp);
    }
    return this._robotSpecs(a, ov, out);
  },

  /** 0.10: robots. Live: a robot out cleaning is one marker at its live position instead of its usual one.
   *  Cleaning: every robot, live or at its dock. Health: a robot not placed by hand sits at its dock with its battery.
   *  A robot that does several floors shows only on the plan whose map it is using. Path and dock: _robotHtml. */
  _robotSpecs(a, ov, out) {
    this._rb = [];
    if (!["live", "cleaning", "health"].includes(ov)) return out;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    let items = null;
    for (const [eid, cfg] of Object.entries(a.robots || {})) {
      const st = this._hass.states[eid];
      if (!cfg || !st) continue;
      let d = rbRead(this._hass, eid, cfg);
      if (!rbOnMap(cfg.map, d)) continue;
      // 0.10: a robot without a map (or not aligned yet) shows where it is placed; that spot is its dock.
      if (!(Array.isArray(cfg.m) && cfg.m.length === 6)) d = { ...d, pos: null, dock: null, lines: [] };
      const active = RB_ACTIVE.includes(d.state);
      items = items || this._items(a);
      const placed = items.find((it) => !it.phantom && [it.main_entity, ...(it.entities || []), ...(it.allEntities || [])].includes(eid));
      const item = placed || { id: `robot:${eid}`, name: st.attributes.friendly_name || eid, main_entity: eid, entities: [eid] };
      if (placed && this._hidden(placed, ov)) continue;
      const info = this._rbInfo(eid, d);
      let at = null;
      if (ov === "live") {
        if (!active || !d.pos) continue;
        at = d.pos;
      } else if (ov === "health") {
        if (placed) continue; // placed by hand: Health shows it there, like any device
        at = d.dock || d.pos;
      } else at = active && d.pos ? d.pos : d.dock || d.pos;
      if (!at && !placed) continue;
      const p = at ? rbApply(cfg.m, at) : { x: placed.x, y: placed.y };
      let head = null;
      if (at === d.pos && active && d.pos.a != null) {
        const r = (d.pos.a * Math.PI) / 180;
        const q = rbApply(cfg.m, { x: d.pos.x + Math.cos(r), y: d.pos.y + Math.sin(r) });
        head = (Math.atan2(q.y - p.y, (q.x - p.x) * ratio) * 180) / Math.PI + 90;
      }
      const low = Number((this._config.health || {}).low ?? 20);
      let col = RB_COL[d.state] || RB_COL.idle;
      let badge = "";
      if (ov === "health") {
        col = info.err ? RB_COL.error : info.battery != null && info.battery <= low ? "255,160,0" : info.charging ? "67,160,71" : RB_COL.docked;
        badge = info.battery != null ? `${info.charging ? "⚡" : ""}${Math.round(info.battery)}%` : "";
      } else {
        if (rbOwn(a, eid)) col = rbOwn(a, eid); // which robot is which (state: tooltip, pulse and badge)
        if (ov === "cleaning" && (info.err || info.attn)) badge = "!";
      }
      const tone = info.err ? "err" : info.attn ? "warn" : "";
      this._rb.push({ eid, cfg, d, info, active });
      out = out.filter((x) => x.item.id !== item.id);
      // Name and icon from Edit markers, also for a robot that isn't placed (item robot:<entity>).
      const dev = this._dev(item.id);
      out.push({ type: "robot", kind: "appliance", key: `robot:${eid}`, item, eid, ents: [eid], name: dev.name || item.name, x: +p.x.toFixed(3), y: +p.y.toFixed(3), on: true, color: `rgb(${col})`, head, state: d.state, icon: this._per(item, ov).icon || dev.icon || st.attributes.icon || "mdi:robot-vacuum", badge, tone: ov === "health" ? "" : tone, tip: this._rbTip(st, d, info, a, cfg) });
    }
    return out;
  },

  /** Everything the robot's device tells (HA's entity list): battery, consumables, dock, last run, error. Generic: names and units. */
  _rbInfo(eid, d) {
    const h = this._hass;
    const vs = h.states[eid];
    const devId = h.entities && h.entities[eid] && h.entities[eid].device_id;
    const ents = devId ? Object.values(h.entities).filter((e) => e.device_id === devId).map((e) => e.entity_id) : [eid];
    const name = (e) => {
      const fn = String((h.states[e] && h.states[e].attributes.friendly_name) || e);
      const dn = String((vs && vs.attributes.friendly_name) || "");
      return fn.startsWith(dn + " ") ? fn.slice(dn.length + 1) : fn;
    };
    let battery = vs && num(vs.attributes.battery_level) ? Number(vs.attributes.battery_level) : null;
    let charging = false;
    const parts = {};
    const station = [];
    const last = {};
    // How it cleans: suction, water, mode (attributes and select entities of the robot).
    const settings = [];
    if (vs && vs.attributes.fan_speed != null && vs.attributes.fan_speed !== "") settings.push(String(vs.attributes.fan_speed));
    let err = d.state === "error" ? String((vs && (vs.attributes.error || vs.attributes.status)) || "") || "\u0000" : "";
    const OK = /^(ok|normal|none|no_error|no error|idle|off|installed|not_full|0|false|unknown|unavailable|completed|clean|good)$/i;
    for (const e of ents) {
      const st = h.states[e];
      if (!st || e === eid) continue;
      const dc = st.attributes.device_class;
      const unit = st.attributes.unit_of_measurement;
      const id = e.split(".")[1];
      if (domainOf(e) === "sensor" && dc === "battery" && num(st.state)) battery = Number(st.state);
      else if (domainOf(e) === "binary_sensor" && dc === "battery_charging") charging = st.state === "on";
      else if (/charging_status|charge_state|charging_state/.test(id) && /^(charging)$/i.test(st.state)) charging = true;
      else if (domainOf(e) === "sensor" && /(brush|filter|sensor_dirty|dirty_sensor|mop_pad|_mop|pad|blade|squeegee|consumable|detergent|dust_bag)/.test(id) && /(left|remaining|life|time_left|wear)/.test(id) && num(st.state) && ["%", "h", "min", "s"].includes(unit)) {
        const key = id.replace(/_(time_left|time_remaining|left|remaining|life_level|life|wear)$/, "");
        const v = Number(st.state);
        const hrs = unit === "h" ? v : unit === "min" ? v / 60 : unit === "s" ? v / 3600 : null;
        const prev = parts[key];
        if (prev && prev.pct != null && unit !== "%") continue;
        parts[key] = { e, name: name(e).replace(/\s*(time left|left|remaining|life|level)$/i, ""), pct: unit === "%" ? v : null, txt: unit === "%" ? `${Math.round(v)}%` : `${Math.round(hrs)} h`, low: unit === "%" ? v <= 10 : hrs <= 10 };
      } else if (/(last_clean|last_cleaning)_?(end|start|begin|time)?$|last_clean_(end|start|begin)/.test(id) && dc === "timestamp") last.t = last.t && last.t > st.state ? last.t : st.state;
      else if (/(cleaning_time|clean_time|cleaning_duration|last_clean_duration)/.test(id) && num(st.state)) last.dur = this._fmt(e);
      else if (/(cleaned_area|cleaning_area|clean_area|last_clean_area)/.test(id) && num(st.state)) last.area = this._fmt(e);
      else if (/(dust_bag|dustbin|bin_full|water_tank|clean_water|dirty_water|water_box|station|dock|self_clean|drainage|detergent|mop_pad_status|mop_status)/.test(id) && ((domainOf(e) === "binary_sensor" && dc === "problem" && st.state === "on") || (domainOf(e) === "sensor" && !num(st.state) && /(full|empty|lack|missing|not_installed|dirty|low|shortage|no_water|error)/i.test(st.state) && !OK.test(st.state)))) station.push({ e, name: name(e), txt: this._fmt(e) });
      else if (/(^|_)error$|_error_|fault/.test(id) && domainOf(e) === "sensor" && !OK.test(st.state) && d.state === "error") err = this._fmt(e);
      else if (["select", "input_select"].includes(domainOf(e)) && /(fan|suction|water|mop|mode|route|intensity)/.test(id) && !/(^unknown|unavailable)$/.test(st.state) && settings.length < 4) settings.push(this._fmt(e));
    }
    if (d.state === "docked" && battery != null && battery < 100 && !charging) charging = true;
    const cons = Object.values(parts);
    return { battery, charging, cons, station, last, err, settings: [...new Set(settings)], attn: cons.some((c) => c.low) || station.length > 0 };
  },

  /** Hover line: state, room and battery, or the robot's own error text. */
  _rbTip(st, d, info, a, cfg) {
    const word = { cleaning: dfT("robot.cleaning"), returning: dfT("robot.returning"), paused: dfT("robot.paused"), error: dfT("robot.error"), docked: info.charging ? dfT("robot.charging") : dfT("robot.docked"), idle: dfT("robot.idle") }[d.state] || this._fmt(st.entity_id);
    if (info.err) return info.err === "\u0000" ? word : `${word}: ${info.err}`;
    const room = this._rbRoom(a, cfg, d);
    return [word, room, info.battery != null ? `${dfT("battery")} ${Math.round(info.battery)}%` : ""].filter(Boolean).join(" · ");
  },

  /** The room the robot is in: where it is on the plan's room shapes. */
  _rbRoom(a, cfg, d) {
    if (!RB_ACTIVE.includes(d.state)) return "";
    const seg = d.room != null && (cfg.seg || {})[d.room];
    if (seg && (a.areas || {})[seg]) return (this._rooms().names || {})[seg] || a.areas[seg].name;
    if (!d.pos || !Array.isArray(cfg.m)) return "";
    const p = rbApply(cfg.m, d.pos);
    const hit = Object.entries(a.areas || {}).find(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3 && inPoly(p.x, p.y, r.shape));
    return hit ? (this._rooms().names || {})[hit[0]] || hit[1].name : "";
  },

  /** "just now", "5 min ago", "2 d ago". */
  _agoTxt(t) {
    const x = this._ageTxt(t);
    return x === dfT("time.just_now") || !x ? x : dfT("time.ago", { t: x });
  },

  _ageTxt(t) {
    const ms = this._now() - new Date(t).getTime();
    if (!t || !(ms >= 0)) return "";
    const m = Math.round(ms / 60000);
    if (m < 60) return m < 2 ? dfT("time.just_now") : dfT("unit.min", { n: m });
    const hrs = Math.round(m / 60);
    return hrs < 24 ? dfT("unit.h", { n: hrs }) : dfT("unit.d", { n: Math.round(hrs / 24) });
  },

  /** A robot's name on the card: from Edit markers (placed or not), else its HA name. */
  _rbLabel(a, eid) {
    const placed = this._items(a).find((it) => !it.phantom && [it.main_entity, ...(it.entities || [])].includes(eid));
    const st = this._hass.states[eid];
    return this._dev(placed ? placed.id : `robot:${eid}`).name || (st && st.attributes.friendly_name) || eid;
  },

  /** Days between cleanings of a room (plan setting per room, else the plan's default; 0 = never due). */
  _pace(a, id) {
    const v = (a.pace || {})[id] ?? a.pace_default ?? (this._config.cleaning || {}).overdue ?? 7;
    return Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 7;
  },

  /** 0.10: rooms tinted by how long ago a robot cleaned them (a layer of Cleaning; tap a room to clean it). */
  _freshHtml(a) {
    if (this._overlay !== "cleaning" || !this._layerOn("cleaning", "fresh", true)) return "";
    const polys = Object.entries(a.areas || {}).filter(([, r]) => Array.isArray(r.shape) && r.shape.length >= 3).map(([id, r]) => {
      const c = (a.cleaned || {})[id];
      const days = c && c.t ? (Date.now() - new Date(c.t).getTime()) / 86400000 : null;
      // Smooth: fresh green fades out by 60% of the room's pace, amber grows once it is due.
      const pace = this._pace(a, id);
      const f = days == null ? null : pace ? days / pace : days / 7;
      const nw = (a.now || {})[id];
      // Full strength here; the slider (or the card setting) sets how strongly the whole layer shows.
      const fill = nw ? "rgba(33,150,243,.55)" : f == null ? "rgba(0,0,0,0)" : f < 0.6 ? `rgba(76,175,80,${(0.85 * (1 - f / 0.6)).toFixed(3)})` : pace && f >= 1 ? `rgba(255,152,0,${Math.min(0.85, 0.45 + 0.4 * (f - 1)).toFixed(3)})` : "rgba(0,0,0,0)";
      return `<polygon data-croom="${cesc(id)}" points="${r.shape.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:${fill}"></polygon>`;
    }).join("");
    return `<svg class="fresh" viewBox="0 0 100 100" preserveAspectRatio="none" style="opacity:${this._cleanOp() / 100}">${polys}</svg>`;
  },

  /** 0.10: the cleaning path (a layer, always blue) and the dock of each robot; the dock is green while charging. */
  _robotHtml() {
    if (!(this._rb || []).length || this._overlay === "health") return "";
    const path = this._layerOn(this._overlay, "rpath", true);
    let svg = "";
    let html = "";
    for (const r of this._rb) {
      if (path && (r.active || this._overlay === "cleaning")) {
        for (const line of r.d.lines) {
          const step = Math.max(1, Math.ceil(line.length / 1500));
          const pts = line.filter((_p, i) => i % step === 0 || i === line.length - 1).map((p0) => rbApply(r.cfg.m, p0)).map((p0) => `${p0.x.toFixed(2)},${p0.y.toFixed(2)}`).join(" ");
          const own = rbOwn(this._a, r.eid);
          svg += `<polyline points="${pts}"${own ? ` style="stroke:rgb(${own});opacity:.7"` : ""}></polyline>`;
        }
      }
      if (r.d.dock) {
        const p = rbApply(r.cfg.m, r.d.dock);
        const chg = r.info.charging && r.d.state === "docked";
        const warn = this._overlay === "cleaning" && r.info.station.length ? `<i class="rdw" title="${cesc(r.info.station.map((x) => `${x.name}: ${x.txt}`).join(", "))}"></i>` : "";
        html += `<div class="rdock ${chg ? "chg" : ""}" style="left:${p.x.toFixed(3)}%;top:${p.y.toFixed(3)}%"><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon>${warn}</div>`;
      }
    }
    return `${svg ? `<svg class="rpath" viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>` : ""}${html}`;
  },

  _robotMarker(s) {
    const pulse = ["error", "paused"].includes(s.state) && this._overlay !== "health" ? s.state : "";
    const badge = s.badge ? `<span class="rbg ${s.tone}">${cesc(s.badge)}</span>` : "";
    return `<button class="m robot on ${pulse} ${this._hl === s.key ? "hl" : ""}" style="left:${s.x}%;top:${s.y}%;--dfc-c:${s.color}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(`${s.name} · ${s.tip}`)}"><span class="ic"><ha-icon icon="${cesc(s.icon)}"></ha-icon>${s.head != null ? `<i class="rhd" style="transform:rotate(${s.head.toFixed(1)}deg)"></i>` : ""}</span>${badge}<span class="tip">${cesc(s.name)}<span class="tst"> · ${cesc(s.tip)}</span></span></button>`;
  },

  /** 0.10: the robot panel (tap on a robot): state, last run, consumables, dock, and start / pause / dock. */
  _robotPop(p) {
    const a = this._a || {};
    const eid = p.eid;
    const st = this._hass.states[eid];
    if (!st) return "";
    const cfg = (a.robots || {})[eid] || {};
    const d = rbRead(this._hass, eid, cfg);
    const info = this._rbInfo(eid, d);
    const name = st.attributes.friendly_name || eid;
    const col = RB_COL[d.state] || RB_COL.idle;
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    const mine = Object.values(a.cleaned || {}).filter((c) => c.by === eid).map((c) => c.t).sort().pop();
    const lastT = info.last.t || mine;
    const rows = [];
    if (lastT) rows.push([dfT("robot.last_cleaning"), this._agoTxt(lastT)]);
    if (info.last.dur) rows.push([dfT("robot.took"), info.last.dur]);
    if (info.last.area) rows.push([RB_ACTIVE.includes(d.state) ? dfT("robot.this_run") : dfT("robot.area"), info.last.area]);
    if (info.settings.length) rows.push([dfT("robot.settings"), info.settings.join(" · ")]);
    if (info.battery != null) rows.push([dfT("battery"), `${Math.round(info.battery)}%${info.charging ? ` · ${dfT("robot.charging_l")}` : ""}`]);
    const cons = info.cons.length ? `<h4>${dfT("robot.consumables")}</h4>${info.cons.map((c) => `<button class="rbc ${c.low ? "low" : ""}" data-mi="${cesc(c.e)}"><span>${cesc(c.name)}</span>${c.pct != null ? `<i style="--p:${Math.max(0, Math.min(100, c.pct))}%"></i>` : "<i class='n'></i>"}<b>${cesc(c.txt)}</b></button>`).join("")}` : "";
    const dock = info.station.length ? `<h4>${dfT("robot.dock")}</h4>${info.station.map((x) => `<button class="rbc low" data-mi="${cesc(x.e)}"><span>${cesc(x.name)}</span><i class="n"></i><b>${cesc(x.txt)}</b></button>`).join("")}` : "";
    const cmd = (c, icon, label) => `<button data-rbcmd="${c}" data-rb="${cesc(eid)}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`;
    const btns = d.state === "cleaning" ? cmd("pause", "mdi:pause", dfT("robot.pause")) + cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")) : cmd("start", "mdi:play", d.state === "paused" ? dfT("robot.continue") : dfT("robot.start")) + (d.state === "docked" ? "" : cmd("return_to_base", "mdi:home-import-outline", dfT("robot.dock")));
    return `<div class="pop"><div class="popin rbpop" role="dialog" aria-label="${cesc(name)}"><h3><ha-icon icon="${cesc(st.attributes.icon || "mdi:robot-vacuum")}" style="color:rgb(${col})"></ha-icon>${cesc(name)}${close}</h3>
      <div class="rbst" style="--c:rgb(${col})">${cesc(this._rbTip(st, d, info, a, cfg))}</div>
      ${rows.length ? `<div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>` : ""}${cons}${dock}
      <div class="rbcmds">${btns}</div><button class="more" data-mi="${cesc(eid)}">${dfT("details_more")}</button></div></div>`;
  },

  /** 0.10: tap a room in Cleaning: when it was cleaned, and "Clean this room" (vacuum.clean_area, HA 2026.3). */
  _roomPop(p) {
    const a = this._a || {};
    const room = (a.areas || {})[p.area];
    if (!room) return "";
    const name = (this._rooms().names || {})[p.area] || room.name;
    const c = (a.cleaned || {})[p.area];
    const by = c && this._hass.states[c.by] ? this._hass.states[c.by].attributes.friendly_name : "";
    const when = c && c.t ? (by ? dfT("clean.cleaned_by", { t: this._agoTxt(c.t), by }) : dfT("clean.cleaned", { t: this._agoTxt(c.t) })) : dfT("clean.none_yet");
    const ref = (a.room_area || {})[p.area];
    const cov = c && c.m2 != null ? `${c.m2} m²${c.pct != null ? ` (${c.pct}%)` : ""}` : "";
    const pace = this._pace(a, p.area);
    const daysAgo = c && c.t ? (Date.now() - new Date(c.t).getTime()) / 86400000 : null;
    const due = !pace ? dfT("clean.never") : daysAgo == null ? dfT("clean.every_d", { n: pace }) : daysAgo >= pace ? dfT("clean.now") : dfT("clean.in_d", { n: Math.max(1, Math.round(pace - daysAgo)) });
    // Visits of the last runs (the integration logs when a robot enters and leaves a room); one run = one clean.
    const runs = [];
    for (const v of ((a.clean_log || {})[p.area] || []).slice().sort((x, y) => (x.s < y.s ? -1 : 1))) {
      const s0 = new Date(v.s).getTime();
      const e0 = new Date(v.e).getTime();
      const last = runs[runs.length - 1];
      if (last && s0 - last.e < 45 * 60000) {
        last.e = e0;
        last.d += e0 - s0;
      } else runs.push({ s: s0, e: e0, d: e0 - s0 });
    }
    const week = runs.filter((r) => Date.now() - r.s < 7 * 86400000).length;
    const ds = runs.slice(-10).map((r) => r.d).sort((x, y) => x - y);
    const usual = ds.length ? Math.max(1, Math.round(ds[Math.floor(ds.length / 2)] / 60000)) : 0;
    const kv = [];
    const nw = (a.now || {})[p.area];
    if (nw) kv.push([dfT("clean.cleaning_now"), nw.m2 != null ? `${nw.m2} m²${nw.pct != null ? ` (${nw.pct}%)` : ""}` : dfT("yes")]);
    if (cov) kv.push([dfT("clean.last_time"), cov]);
    if (runs.length) kv.push([dfT("clean.last7"), week ? `${week}×` : dfT("clean.not_cleaned")]);
    if (usual) kv.push([dfT("clean.usually_takes"), dfT("unit.min", { n: usual })]);
    if (ref && ref.a && ref.n >= 2) kv.push([dfT("clean.robot_usually"), `${Math.round(ref.a)} m²`]);
    if (c && c.t) kv.push([dfT("clean.due"), due]);
    const stats = kv.length ? `<div class="kv">${kv.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>` : "";
    const robots = Object.entries(a.robots || {}).filter(([e]) => this._hass.states[e]);
    const can = robots.filter(([e]) => Number(this._hass.states[e].attributes.supported_features || 0) & CLEAN_AREA);
    const btns = can.filter(([, r]) => Object.values(r.seg || {}).includes(p.area)).map(([e]) => `<button class="pri" data-cleanroom="${cesc(p.area)}" data-rb="${cesc(e)}"><ha-icon icon="mdi:robot-vacuum"></ha-icon>${can.length > 1 ? dfT("clean.now_with", { r: cesc(this._hass.states[e].attributes.friendly_name || e) }) : dfT("clean.clean_now")}</button>`).join("");
    const hint = btns ? "" : can.length ? dfT("clean.map_hint") : robots.length ? dfT("clean.cant_room") : "";
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(name)}"><h3>${cesc(name)}${close}</h3><div>${cesc(when)}</div>${stats}${hint ? `<div class="rbhint">${cesc(hint)}</div>` : ""}${btns ? `<div class="acts">${btns}</div>` : ""}</div></div>`;
  },

  /** Does this item show up in this overlay at all (ignoring its current state)? Used by the editor (#52). */
  _qualifies(item, ov, a) {
    if (ov === "plan") return false;
    if (!this._cx && a) this._cx = this._ctx(a);
    try {
      return this._specsFor(item, ov, true).length > 0;
    } catch (_e) {
      return false;
    }
  },

  /** Card settings of one device in one overlay (#100/#101): { lead, extras, icon, tap }. */
  /** 0.11: each camera its own colour (dot, line, picture border), stable: by its place among the plan's cameras. */
  _camColor(s) {
    const ids = this._a ? this._items(this._a).filter((it) => this._camOf(it)).map((it) => it.id).sort() : [];
    return E_COLORS[Math.max(0, ids.indexOf(s.item.id)) % E_COLORS.length];
  },

  /** 0.11 Live camera, layer 3: a small dot where the camera is (spread like any marker). */
  _camHtml(s) {
    return `<button class="m camdot ${edgeCls(s.x, s.y, this._em)}" style="left:${s.x}%;top:${s.y}%;background:${this._camColor(s)}" data-k="${cesc(s.key)}" data-name="${cesc(s.name || "")}" data-x="${s.x}" data-y="${s.y}" aria-label="${cesc(s.name)}"><span class="tip">${cesc(s.name)}</span></button>`;
  },

  /** 0.13.1: live video windows: one Home Assistant camera player per camera, kept between redraws and moved into
   *  its window in the same task (so the stream keeps playing); dropped when its window is gone. */
  _attachVids() {
    // The players live in the card's own (light) DOM and are shown in their window through a <slot>: a redraw of the
    // card never detaches them, so a stream isn't restarted on every state change.
    const want = new Set();
    for (const ph of this.shadowRoot.querySelectorAll(".cvid[data-vid]")) {
      const eid = ph.dataset.vid;
      const st = this._hass.states[eid];
      if (!st) continue;
      want.add(eid);
      let v = [...this.children].find((n) => n.localName === "ha-camera-stream" && n.dataset.vid === eid);
      if (!v) {
        v = document.createElement("ha-camera-stream");
        v.dataset.vid = eid;
        v.slot = vidSlot(eid);
        v.muted = true;
        v.controls = false;
        v.allowExoPlayer = false;
        this.appendChild(v);
      }
      v.hass = this._hass;
      if (!v.stateObj || v.stateObj.last_updated !== st.last_updated) v.stateObj = st; // a new object only when it changed
    }
    for (const n of [...this.children]) if (n.localName === "ha-camera-stream" && !want.has(n.dataset.vid)) n.remove();
  },

  /** Layer 4, windows: camera pictures. Placed by _placeWins() after the markers, next to their dot. */
  _winHtml() {
    if (this._overlay !== "live" && this._overlay !== "security") return "";
    const cams = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.cam && sp.win);
    if (!cams.length) return "";
    clearTimeout(this._snapT);
    this._snapT = setTimeout(() => this._update(true), 10000); // a fresh still every 10 s
    const tick = Math.floor(Date.now() / 10000);
    return `<div class="wins">${cams.map((sp) => {
      const pic = this._hass.states[sp.eid] && this._hass.states[sp.eid].attributes.entity_picture;
      // 0.13.1: "Shows: live video" uses Home Assistant's own camera player (kept across redraws, see _attachVids).
      const vid = this._per(sp.item, "live").video === "live";
      const src = pic && !vid ? `${pic}${pic.includes("?") ? "&" : "?"}_=${tick}` : "";
      // Readings in the name bar: what you picked under Also show; automatically only a low battery.
      const lowAt = Number(this._ov("health").low ?? 20);
      const isLow = (e) => {
        const st = this._hass.states[e];
        return !!st && st.attributes.device_class === "battery" && Number(st.state) < lowAt;
      };
      let rd = (sp.extras || []).filter((x) => domainOf(x.eid) !== "camera");
      if (!Array.isArray(this._per(sp.item, "live").extras)) {
        const bat = [...new Set([...(sp.item.entities || []), ...(sp.item.allEntities || [])])].find(isLow);
        rd = bat ? [{ eid: bat, text: this._extraText(bat), icon: null }] : [];
      }
      // 0.11: at most two readings on a picture (the editor stops at two), in the order picked; never cut, they
      // shrink with "…". "22.0 °C" → "22 °C".
      const ord = rd.slice(0, 2);
      const pill = (x) => {
        const t = String(x.text).replace(/(\d)\.0(?=\D|$)/, "$1");
        return `<span class="${isLow(x.eid) ? "lo" : ""}" title="${cesc(t)}">${x.icon ? `<ha-icon icon="${cesc(x.icon)}"></ha-icon>` : `<ha-state-icon data-ent="${cesc(x.eid)}"></ha-state-icon>`}<b>${cesc(t)}</b></span>`;
      };
      const rds = ord.length ? `<span class="crd">${ord.map(pill).join("")}</span>` : "";
      const last = (this._camLast = this._camLast || {})[sp.key];
      this._camLast[sp.key] = src;
      return `<div class="cwin" data-wk="${cesc(sp.key)}" data-c="${this._camColor(sp)}" role="button" aria-label="${cesc(sp.name)}" style="border-color:${this._camColor(sp)};${last ? `background:#222 url('${cesc(last)}') center/cover` : ""}">${vid ? `<div class="cvid" data-vid="${cesc(sp.eid)}"><slot name="${cesc(vidSlot(sp.eid))}"></slot></div>` : src ? `<img alt="" src="${cesc(src)}">` : ""}${rds}<span class="cnm"><span class="cn">${cesc(sp.name)}</span>${sp.trig ? `<button class="cx" data-camx="${cesc(sp.trig)}" aria-label="${dfT("close")}">×</button>` : ""}</span></div>`;
    }).join("")}</div>`;
  },

  /** After the markers are laid out: each window next to its marker's final spot (above-right; left / below
   *  near the edges), clear of the other windows; an elbow line joins them. Returns the SVG lines. */
  _placeWins(box, W, H) {
    let out = "";
    // Appliance status (layer 4): a line from each appliance up to its status pill.
    const br = box.getBoundingClientRect();
    for (const pill of box.querySelectorAll(".applbl[data-anc]")) {
      const pr = pill.getBoundingClientRect();
      if (!pr.width) continue;
      const bx = pr.left - br.left + pr.width / 2;
      const by = pr.bottom - br.top;
      for (const a of pill.dataset.anc.split(";")) {
        const [ax0, ay0, ...rgb] = a.split(",");
        const c = rgb.join(",");
        const ax = (Number(ax0) / 100) * W;
        const ay = (Number(ay0) / 100) * H;
        const r = Math.min(10, Math.abs(ay - by), Math.abs(bx - ax));
        const sx = Math.sign(bx - ax);
        out += `<path class="elbow" style="stroke:rgb(${c})" d="M${ax},${ay} L${ax},${by + r} Q${ax},${by} ${ax + sx * r},${by} L${bx},${by}"/>`;
      }
    }
    const placed = [];
    // 0.11.1: windows may sit in the frame around the plan (Frame: space around it), not only on the plan.
    const fe = box.parentElement && box.parentElement.classList.contains("fr") ? box.parentElement.getBoundingClientRect() : br;
    const lim = { x0: fe.left - br.left, y0: fe.top - br.top, x1: fe.right - br.left, y1: fe.bottom - br.top };
    // 0.11.1: one size for every camera window of the card (S / M / L); "strip": all in one row like film.
    const camCfg = this._config.cameras || {};
    const [cmax, cshare] = CAM_SIZES[camCfg.cam_size] || CAM_SIZES.m;
    let ww = Math.min(cmax, W * cshare);
    let wh = ww * 0.5625;
    const wins = [...box.querySelectorAll(".cwin")];
    if (camCfg.cam_layout === "strip" && wins.length) return out + this._placeStrip(box, wins, W, H, lim, ww);
    for (const win of wins) {
      const dot = box.querySelector(`[data-k="${CSS.escape(win.dataset.wk)}"]`);
      if (!dot) continue;
      const cx = parseFloat(dot.style.left) || 0;
      const cy = parseFloat(dot.style.top) || 0;
      // 0.11.1: a window moved by hand stays where it was put (centre, % of the plan); the line follows.
      const pos = this._winPos(win.dataset.wk);
      let left = cx > W * 0.62;
      let up = cy > wh + 40;
      let x = left ? cx - 28 - ww : cx + 28;
      let y = up ? cy - 40 - wh : cy + 40;
      if (pos) {
        x = (pos.x / 100) * W - ww / 2;
        y = (pos.y / 100) * H - wh / 2;
        left = x + ww / 2 < cx;
      } else for (let i = 0; i < 6 && placed.some((p) => x < p.x + p.w + 8 && x + ww + 8 > p.x && y < p.y + p.h + 8 && y + wh + 8 > p.y); i++) y += up ? -(wh + 8) : wh + 8;
      win.classList.toggle("dr", this._winDraggable());
      win.classList.toggle("drag", !!(this._winDrag && this._winDrag.key === win.dataset.wk));
      x = Math.max(lim.x0 + 2, Math.min(lim.x1 - ww - 2, x));
      y = Math.max(lim.y0 + 2, Math.min(lim.y1 - wh - 2, y));
      up = y + wh / 2 < cy;
      placed.push({ x, y, w: ww, h: wh });
      Object.assign(win.style, { left: `${x}px`, top: `${y}px`, width: `${ww}px`, height: `${wh}px` });
      // Elbow: vertical from the dot, then horizontal into the window's side, rounded corner.
      const ey = y + wh / 2;
      const ex = left ? x + ww : x;
      const r = Math.min(14, Math.abs(ey - cy), Math.abs(ex - cx)); // rounded like the Energy lines
      const sy = ey < cy ? -1 : 1;
      const sx = ex < cx ? -1 : 1;
      out += `<path class="elbow" style="stroke:${win.dataset.c || "#26a69a"}" d="M${cx},${cy} L${cx},${ey - sy * r} Q${cx},${ey} ${cx + sx * r},${ey} L${ex},${ey}"/>`;
    }
    // Snap guides while dragging (same height / same column as another window).
    const g = this._winDrag && this._winDrag.guide;
    if (g && g.y != null) out += `<line class="wguide" x1="0" y1="${(g.y / 100) * H}" x2="${W}" y2="${(g.y / 100) * H}"/>`;
    if (g && g.x != null) out += `<line class="wguide" x1="${(g.x / 100) * W}" y1="0" x2="${(g.x / 100) * W}" y2="${H}"/>`;
    return out;
  },

  /** 0.11.1: the camera strip: every window in one row (film), in the frame space below or above the plan when
   *  there is room (else along the plan's bottom), ordered like their cameras left → right so lines stay short.
   *  Each frame and its dot share the camera's colour; a line only on hover or while the camera has an event. */
  _placeStrip(box, wins, W, H, lim, ww0) {
    const gap = 8;
    const below = lim.y1 - H;
    const above = -lim.y0;
    const room = Math.max(below, above);
    const items = wins.map((win) => {
      const dot = box.querySelector(`[data-k="${CSS.escape(win.dataset.wk)}"]`);
      return { win, cx: dot ? parseFloat(dot.style.left) || 0 : 0, cy: dot ? parseFloat(dot.style.top) || 0 : 0, dot: !!dot };
    }).sort((a, b) => a.cx - b.cx);
    const n = items.length;
    const availW = lim.x1 - lim.x0 - 16;
    let ww = Math.min(ww0, (availW - (n - 1) * gap) / n);
    let wh = ww * 0.5625;
    const inFrame = room >= 48;
    if (inFrame && wh > room - 20) {
      wh = room - 20;
      ww = wh / 0.5625;
    }
    const band = wh + 16;
    const y = inFrame ? (below >= above ? H + (below - wh) / 2 : lim.y0 + (above - wh) / 2) : H - wh - 10;
    const total = n * ww + (n - 1) * gap;
    let x = lim.x0 + (lim.x1 - lim.x0 - total) / 2;
    const x0 = x - 10;
    // The film: a dark band with sprocket holes along both edges.
    let out = `<rect class="film" x="${x0}" y="${y - 8}" width="${total + 20}" height="${band}" rx="8"/><line class="holes" x1="${x0 + 8}" y1="${y - 4}" x2="${x0 + total + 12}" y2="${y - 4}"/><line class="holes" x1="${x0 + 8}" y1="${y + wh + 4}" x2="${x0 + total + 12}" y2="${y + wh + 4}"/>`;
    const lines = [];
    for (const it of items) {
      const key = it.win.dataset.wk;
      Object.assign(it.win.style, { left: `${x}px`, top: `${y}px`, width: `${ww}px`, height: `${wh}px` });
      it.win.classList.remove("dr", "drag");
      if (it.dot) {
        const sp = this._specs && this._specs.get(key);
        const on = (sp && sp.trig) || this._winHover === key;
        const ex = x + ww / 2;
        const ey = y > it.cy ? y - 8 : y + wh + 8; // the band's edge facing the camera
        const my = (it.cy + ey) / 2;
        lines.push(`<path class="elbow sl ${on ? "on" : ""} ${sp && sp.trig ? "ev" : ""}" data-wl="${cesc(key)}" style="stroke:${it.win.dataset.c || "#26a69a"}" d="M${it.cx},${it.cy} L${it.cx},${my} L${ex},${my} L${ex},${ey}"/>`);
      }
      x += ww + gap;
    }
    out += lines.join("");
    return out;
  },

  /** 0.11.1: where a camera window was put by hand (its centre, % of the plan), if it was. */
  _winPos(key) {
    if (this._winDrag && this._winDrag.key === key) return this._winDrag;
    const sp = this._specs && this._specs.get(key);
    const w = sp && sp.item && this._dev(sp.item.id).win;
    return w && Number.isFinite(w.x) && Number.isFinite(w.y) ? w : null;
  },

  /** Camera windows can be moved in the Card Editor, and on the dashboard by admins (saved in the card). */
  _winDraggable() {
    if ((this._config.cameras || {}).cam_layout === "strip") return false; // the strip places them itself
    if (this._onWinMove) return true;
    return !this.preview && !this._editMode && !!(this._hass && this._hass.user && this._hass.user.is_admin);
  },

  /** Drag a camera window: it snaps to the height or the column of another window; dropped on its own camera dot,
   *  it goes back to its automatic spot. */
  _winDragStart(e, win) {
    const box = this.shadowRoot.querySelector(".box");
    const sp = this._specs && this._specs.get(win.dataset.wk);
    if (!box || !sp) return;
    const br = box.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    const key = win.dataset.wk;
    const fe = box.parentElement && box.parentElement.classList.contains("fr") ? box.parentElement.getBoundingClientRect() : br;
    const pxX = (v) => ((v - br.left) / br.width) * 100;
    const pxY = (v) => ((v - br.top) / br.height) * 100;
    const lim = { x0: pxX(fe.left), x1: pxX(fe.right), y0: pxY(fe.top), y1: pxY(fe.bottom) };
    // The other windows' centres (fixed while dragging), in %.
    const others = [...box.querySelectorAll(".cwin")].filter((w) => w.dataset.wk !== key).map((w) => {
      const r = w.getBoundingClientRect();
      return { x: ((r.left + r.width / 2 - br.left) / br.width) * 100, y: ((r.top + r.height / 2 - br.top) / br.height) * 100 };
    });
    const dx = e.clientX - (wr.left + wr.width / 2);
    const dy = e.clientY - (wr.top + wr.height / 2);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let raf = 0;
    const SNAP = 1.6; // % of the plan
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true;
      let x = ((ev.clientX - dx - br.left) / br.width) * 100;
      let y = ((ev.clientY - dy - br.top) / br.height) * 100;
      const guide = {};
      const nx = others.reduce((b, o) => (Math.abs(o.x - x) < Math.abs((b ?? 1e9) - x) ? o.x : b), null);
      const ny = others.reduce((b, o) => (Math.abs(o.y - y) < Math.abs((b ?? 1e9) - y) ? o.y : b), null);
      if (nx != null && Math.abs(nx - x) < SNAP) x = guide.x = nx;
      if (ny != null && Math.abs(ny - y) < SNAP * (br.width / br.height)) y = guide.y = ny;
      this._winDrag = { key, x: Math.max(lim.x0, Math.min(lim.x1, x)), y: Math.max(lim.y0, Math.min(lim.y1, y)), guide };
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        this._layout();
      });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      this._winMoved = Date.now(); // the click after a drag doesn't open the camera
      const d = this._winDrag;
      this._winDrag = null;
      const dn = this.shadowRoot.querySelector(`.box [data-k="${CSS.escape(key)}"]`); // fresh: the card may have redrawn
      const dr = dn && dn.getBoundingClientRect();
      const home = dr && Math.hypot(ev.clientX - (dr.left + dr.width / 2), ev.clientY - (dr.top + dr.height / 2)) < 30;
      this._winSave(sp.item.id, home ? null : { x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  },

  async _winSave(id, pos) {
    if (this._onWinMove) return this._onWinMove(id, pos);
    const raw = { ...(this._raw || {}) };
    const devs = { ...(raw.devices || {}) };
    const d = { ...(devs[id] || {}) };
    if (pos) d.win = pos;
    else delete d.win;
    if (Object.keys(d).length) devs[id] = d;
    else delete devs[id];
    raw.devices = devs;
    if (!Object.keys(devs).length) delete raw.devices;
    this._penOrig = this._raw;
    this.setConfig(raw); // it stays at once; saved to the dashboard below
    this._update(true);
    try {
      await this._saveToDashboard(raw);
    } catch (err) {
      this._toast(err && err.message === "yaml" ? dfT("save.cam_yaml") : dfT("save.cam_failed"));
    }
  },

  /** 0.11: the device's camera entity, if it has one. */
  _camOf(item) {
    // A device is a camera only when its main entity is one: a tablet's or a robot's map "camera" doesn't count.
    // Or when you pick the camera as what leads in Live (a doorbell whose main entity is its button).
    // test9: any camera entity of the device counts (a doorbell whose main entity is its button), never a map;
    // what you picked to lead in Live still wins (pick something else and the device is no camera there).
    const lead = (this._dev(item.id).per || {}).live?.lead;
    const ok = (e) => !!e && domainOf(e) === "camera" && !!this._hass.states[e] && !/map|valetudo|xiaomi_cloud_map/i.test(e);
    if (lead && this._hass.states[lead]) return ok(lead) ? lead : null;
    return [item.main_entity, ...(item.entities || [])].find(ok) || null;
  },

  /** What brings a device into Live: the picked trigger, else (cameras) its own motion / person / ring sensor. */
  _liveWhen(item) {
    const p = this._per(item, "live");
    const cam = this._camOf(item);
    if (cam && (p.popup === "off" || p.popup === false)) return null; // "Pop up on events" off: only with Layers → Cameras
    if (p.when && this._hass.states[p.when]) return p.when;
    // 0.12.6: a device you add to Live shows as itself and stays (no 30 s flash); "Show in Live when…" is the trigger.
    if (!cam) return null;
    const ents = [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    return ents.find((e) => {
      const st = this._hass.states[e];
      if (!st) return false;
      const dc = st.attributes.device_class;
      if (domainOf(e) === "event") return ["doorbell", "motion"].includes(dc) || /ring|ding|doorbell|motion|person/.test(e);
      return domainOf(e) === "binary_sensor" && (MOTION_DC.has(dc) || (!dc && /motion|presence|occupancy|person|ring|ding|doorbell|visitor/.test(e)));
    }) || null;
  },

  /** Closed with ✕ during this trigger event (opens again on the next one; per screen). */
  /** 0.13.1: a trigger seen on while this card is open (for "Stays open: until I close it"). */
  _trigMark(e) {
    const st = this._hass.states[e];
    if (!st) return;
    this._trigSeen ||= new Set();
    if (domainOf(e) === "event") {
      // An event (a doorbell press) counts from the first press after the card opened, not an old one.
      this._trigBase ||= new Map();
      if (!this._trigBase.has(e)) this._trigBase.set(e, st.state);
      else if (this._trigBase.get(e) !== st.state) this._trigSeen.add(e);
    } else if (["on", "open", "detected", "home", "playing", "running", "recording", "streaming"].includes(st.state)) this._trigSeen.add(e);
  },

  _camShut(trig) {
    const st = this._hass.states[trig];
    return !!(st && this._camX && this._camX[trig] === (domainOf(trig) === "event" ? st.state : st.last_changed));
  },

  /** Is the trigger on (or was it, within the last 30 s; an event within the last minute)? */
  _trigOn(e, stay = "") {
    const st = this._hass.states[e];
    if (!st) return false;
    const now = this._now();
    let left = 0;
    // 0.13.1: "Stays open" (per marker): automatic = 30 s after it ends (60 s after an event); "on" = only while
    // it is on (an event, which is never "on", keeps its 60 s); a number of seconds; "x" = until closed with ✕.
    const ev = domainOf(e) === "event";
    const on = !ev && ["on", "open", "detected", "home", "playing", "cleaning", "heating", "cooling", "running", "printing", "recording", "streaming"].includes(st.state);
    if (on) return true;
    const t0 = ev ? Date.parse(st.state) : Date.parse(st.last_changed);
    if (stay === "x") return !!this._trigSeen && this._trigSeen.has(e);
    const keep = stay === "on" ? (ev ? 60 : 0) : Number(stay) > 0 ? Number(stay) : ev ? 60 : 30;
    left = keep * 1000 - (now - t0);
    if (!(left > 0)) return false;
    clearTimeout(this._trigT);
    this._trigT = setTimeout(() => this._update(true), left + 200);
    return true;
  },
});
