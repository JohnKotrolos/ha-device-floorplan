Object.assign(DeviceFloorplanCard.prototype, {

  /** The lights on the plan with their shape source: one per item, or one per lamp of a bond set to "per lamp".
   *  { item, src, chosen, lights, on }. Shared by the light pools and the Christmas lights (0.13.2). */
  _lightSrcs(a) {
    const hass = this._hass;
    const res = [];
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      // #84: lamps get a bulb by default; anything else with a light only when a shape was chosen.
      // test9: "Acts as" (Floorplan Editor) decides when set: a plug Home Assistant shows as a light is no lamp.
      const asK = ["light", "switch", "fan"].includes(item.as) ? item.as : null;
      const lamp = asK ? asK === "light" : item.group === "lights" || ((!item.group || item.standalone) && domainOf(item.main_entity || "") === "light");
      // 0.12.6: a bond can glow once for the whole bond (default) or once per lamp, each at its own place.
      const srcs = item.bond && item.lights === "lamp"
        ? (item.mlights || []).filter((m) => m.ent && domainOf(m.ent) === "light").map((m) => ({ light: m.light, lights: [m.ent] }))
        : [{ light: item.light, lights: null }];
      for (const src of srcs) {
        const chosen = src.light && src.light.type;
        if (!lamp && (!chosen || src.light.type === "none")) continue;
        const pool = item.bond ? item.entities : (item.allEntities || item.entities || []).concat(item.main_entity ? [item.main_entity] : []);
        let lights = src.lights || [...new Set(pool)].filter((e) => e && (domainOf(e) === "light" || (item.as === "light" && e === item.main_entity)));
        // 0.13.2: a light shape on a smart plug (Category: Lights) follows the plug (its main entity).
        if (!lights.length && chosen && chosen !== "none" && item.main_entity && ["switch", "input_boolean"].includes(domainOf(item.main_entity))) lights = [item.main_entity];
        if (!lights.length) continue;
        const on = lights.map((e) => hass.states[e]).filter((s) => s && s.state === "on");
        res.push({ item, src, chosen, lights, on });
      }
    }
    return res;
  },

  /** 0.13.2: Christmas lights (Live, Lights): bulbs lit with their effect while the light or plug is on; when off,
   *  dark bulbs, or nothing when its marker is set to hide when off (Edit markers, "When it is off"). */
  _xmasHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "lights") return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shapes = Object.fromEntries(Object.entries(a.areas || {}).filter(([, v]) => v && v.shape).map(([k, v]) => [k, v.shape]));
    let body = "";
    let xi = 0;
    for (const { item, src, chosen, on } of this._lightSrcs(a)) {
      if (chosen !== "xmas" || this._hidden(item, ov)) continue;
      const lit = on.length > 0;
      // Off: the marker's "When it is off" (else the card's Live setting): hidden = no bulbs, faint / shown = dark bulbs.
      if (!lit && (this._per(item, "live").off || (this._config.live || {}).show_off || "hidden") === "hidden") continue;
      const L = src.light;
      const sh = { ...L, x: Number.isFinite(L.cx) ? L.cx : item.x, y: Number.isFinite(L.cy) ? L.cy : item.y };
      body += xmasSvg(sh, ratio, { on: lit, own: lit ? bulbRgb(on[0].attributes || {}, L.color) : null, still, rooms: xmasRooms(shapes, sh), realW: a.real_width_m, pxw: (this._boxW || 0) / 100, id: `c${xi++}` });
    }
    if (!body) return "";
    return `<svg class="air xmas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><style>${XMAS_CSS}</style>${body}</svg>`;
  },

  /** Lights that are on, as glowing pools from their shape in the Editor (default: a bulb). */
  _pools(a) {
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const out = [];
    for (const { item, src, chosen, lights, on } of this._lightSrcs(a)) {
      {
      if (!on.length) continue;
      const shape = chosen ? { ...defaultShape(src.light.type, a.real_width_m), ...src.light } : defaultShape("bulb", a.real_width_m);
      if (["none", "screen", "drum", "line"].includes(shape.type)) continue;
      // 0.12.6: a light shape can have its own centre (dragged away from the marker), else the marker's place.
      const cx = Number.isFinite(shape.cx) ? shape.cx : item.x;
      const cy = Number.isFinite(shape.cy) ? shape.cy : item.y;
      const bs = on.map((s) => (s.attributes.brightness != null ? Number(s.attributes.brightness) / 255 : 1));
      const b = Math.max(0.2, Math.min(1, bs.reduce((x, y) => x + y, 0) / bs.length)) * (0.6 + (0.4 * on.length) / lights.length);
      // #111: the light stays inside its room's shape.
      const devs = a.devices || {};
      const aid = item.area_id || (item.of && devs[item.of] && devs[item.of].area_id) || (item.members && (devs[item.members[0]] || {}).area_id) || null;
      const areas = a.areas || {};
      const polyArea = (P) => Math.abs(P.reduce((t, p, i) => t + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0)) / 2;
      const under = Object.keys(areas).filter((k) => areas[k].shape && inPoly(cx, cy, areas[k].shape)).sort((x, y) => polyArea(areas[x].shape) - polyArea(areas[y].shape))[0] || null;
      // 0.7.4: a split spot (a relay's light placed where it acts) glows in the room it sits in,
      // not in its device's area (an NSPanel in the corridor switching the WC light).
      let start = item.of && !item.area_id && under ? under : aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = under;
      if (!this._groups || this._groups.a !== a) this._groups = { a, by: {} };
      if (start && !(start in this._groups.by)) this._groups.by[start] = shapeGroup(areas, start);
      // 0.13.3: Christmas lights glow as one soft halo around the string (their bulbs are drawn on top, crisp).
      if (shape.type === "xmas") continue; // 0.13.6: Christmas lights draw their halo with their bulbs (animated)
      out.push({ rgb: bulbRgb(on[0].attributes || {}, src.light && src.light.color), b, ell: shapeEllipses(cx, cy, shape, ratio), shapes: start ? this._groups.by[start] : null });
      }
    }
    return out;
  },

  /** 0.7.4: an appliance with a drum or line drawn in the Editor: its type and readings (null = not one). */
  _applOf(item) {
    if (!item || item.phantom || !item.light || !["drum", "line"].includes(item.light.type)) return null;
    const hass = this._hass;
    const devs = (this._a && this._a.devices) || {};
    const ents = [...new Set([...(item.bond ? item.entities || [] : [...(item.allEntities || item.entities || []), item.main_entity]), ...(item.allEntities || [])])].filter((e) => e && hass.states[e]);
    const as = APPL_TYPES.includes(item.as) ? item.as : ((item.members || []).map((m) => (devs[m] || {}).as).find((v) => APPL_TYPES.includes(v)));
    const type = as || applGuess(`${item.name} ${ents.join(" ")}`) || (item.light.type === "line" ? "dishwasher" : "washer");
    const dc = (e) => (hass.states[e].attributes || {}).device_class;
    const status = ents.find((e) => domainOf(e) === "sensor" && !num(hass.states[e].state) && dc(e) !== "timestamp" && /(run_state|operation_state|current_status|program_phase|program_progress_status|machine_state|status|_state)$/.test(e))
      || ents.find((e) => domainOf(e) === "sensor" && /run_state|operation_state|current_status/.test(e));
    const remaining = ents.find((e) => domainOf(e) === "sensor" && /remain|time_left|finish_time|end_time/.test(e));
    const running = ents.find((e) => domainOf(e) === "binary_sensor" && (dc(e) === "running" || /running/.test(e)));
    const power = ents.find((e) => domainOf(e) === "sensor" && dc(e) === "power");
    const door = ents.find((e) => domainOf(e) === "binary_sensor" && ["door", "opening"].includes(dc(e)));
    const plug = ents.find((e) => domainOf(e) === "switch");
    // 0.8.2: a progress sensor in % (Midea, SmartThings washers and dryers since HA 2026.11).
    const progress = ents.find((e) => domainOf(e) === "sensor" && /progress/.test(e) && (hass.states[e].attributes || {}).unit_of_measurement === "%");
    return { item, type, status, remaining, running, power, door, plug, progress, ents };
  },

  /** Current state of an appliance: phase, colour, label and the rows for its panel. */
  _applState(ap) {
    const hass = this._hass;
    const S = (e) => (e ? hass.states[e] : null);
    const deadStatus = ap.status && !live(S(ap.status));
    const deadPlug = (ap.plug && !live(S(ap.plug))) || (ap.power && !live(S(ap.power)));
    let phase = null;
    if (ap.status && !deadStatus) phase = applPhase(S(ap.status).state);
    if (!phase || phase === "run") {
      if (ap.running && live(S(ap.running)) && !deadPlug) phase = S(ap.running).state === "on" ? (phase || (ap.type === "dryer" ? "heat" : "run")) : phase === "run" ? "run" : "idle";
      else if (!ap.running && ap.power && live(S(ap.power))) phase = Number(S(ap.power).state) > 3 ? phase || (ap.type === "dryer" ? "heat" : "run") : phase || "idle";
    }
    const unav = (ap.status ? deadStatus : true) && (deadPlug || (!ap.running && !ap.power));
    if (unav && !(ap.status && !deadStatus)) phase = "unavailable";
    phase = phase || "idle";
    const key = ap.item.id;
    // Finished: a cycle that was running and stopped keeps a check until the door opens or you tap "Unloaded".
    if (!this._applDone) this._applLoad();
    this._applDone = this._applDone || {};
    this._applPrev = this._applPrev || {};
    const active = ["water", "spin", "heat", "run", "attention"].includes(phase);
    const prev = this._applPrev[key];
    // 0.8.1: when it finished (older saves: true = now), so "Done" clears by itself after 30 min (setting).
    if (phase === "done" || (prev && prev !== "idle" && prev !== "done" && prev !== "unavailable" && phase === "idle")) {
      if (typeof this._applDone[key] !== "number") this._applDone[key] = phase === "done" && S(ap.status) ? Math.min(this._now(), new Date(S(ap.status).last_changed).getTime() || this._now()) : this._now();
    }
    if (active) delete this._applDone[key];
    if (ap.door && S(ap.door) && S(ap.door).state === "on" && !active) delete this._applDone[key];
    // 0.7.5: when the phase last changed (the status pill shows for a few minutes after that).
    this._applChg = this._applChg || {};
    if (prev === undefined) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      this._applChg[key] = since ? new Date(since.last_changed).getTime() : 0;
    } else if (prev !== phase) this._applChg[key] = this._now();
    this._applPrev[key] = phase;
    this._applSave();
    const doneFor = this._per(ap.item, "live").done_for || "30";
    let doneLeft = 0;
    if (this._applDone[key] && doneFor !== "unloaded") {
      doneLeft = Number(this._applDone[key]) + Number(doneFor) * 60000 - this._now();
      if (doneLeft <= 0 && (phase === "done" || phase === "idle")) {
        phase = "idle"; // cleared by time; the record stays until the next cycle so it doesn't come back
        doneLeft = 0;
      }
    }
    if (phase === "idle" && this._applDone[key] && (doneFor === "unloaded" || doneLeft > 0)) phase = "done";
    // Time: a finish timestamp becomes a countdown, minutes stay minutes; else time since it started.
    let time = "";
    let tshort = "";
    const rem = S(ap.remaining);
    if (active && rem && live(rem)) {
      const v = rem.state;
      let min = null;
      if ((rem.attributes || {}).device_class === "timestamp" || /^\d{4}-\d{2}-\d{2}T/.test(v)) min = Math.round((new Date(v).getTime() - this._now()) / 60000);
      else if (/^\d+:\d{2}(:\d{2})?$/.test(v)) {
        const [h, m] = v.split(":").map(Number);
        min = h * 60 + m;
      } else if (num(v)) min = Math.round(Number(v) * ((rem.attributes || {}).unit_of_measurement === "h" ? 60 : (rem.attributes || {}).unit_of_measurement === "s" ? 1 / 60 : 1));
      if (min != null && min >= 0) {
        time = dfT("appl.min_left", { n: min });
        tshort = dfT("unit.min", { n: min });
      }
    }
    const pr = S(ap.progress);
    if (active && !time && pr && live(pr) && num(pr.state)) time = tshort = dfT("appl.pct_done", { n: Math.round(Number(pr.state)) });
    if (active && !time) {
      const since = [S(ap.running), S(ap.status)].find((x) => x && live(x));
      if (since) {
        const n = Math.max(0, Math.round((this._now() - new Date(since.last_changed).getTime()) / 60000));
        time = dfT("appl.min_elapsed", { n });
        tshort = dfT("unit.min", { n });
      }
    }
    const pretty = (t) => String(t).replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const said = (s) => (this._hass.formatEntityState ? this._hass.formatEntityState(s) : pretty(s.state)); // 0.14 L1: HA's own translated state
    const word = phase === "unavailable" ? dfT("appl.unavailable") : phase === "done" ? dfT("appl.finished") : phase === "attention" ? (ap.door && S(ap.door) && S(ap.door).state === "on" ? dfT("appl.door_open") : dfT("appl.paused")) : phase === "error" ? dfT("appl.error") : phase === "idle" ? dfT("appl.idle")
      : ap.status && !deadStatus ? said(S(ap.status)) : ap.type === "dryer" ? dfT("appl.drying") : dfT("appl.running");
    const w = ap.power && live(S(ap.power)) ? `${Math.round(Number(S(ap.power).state))} W` : "";
    const col = APPL_COL[phase] || (phase === "run" ? (ap.type === "dryer" ? APPL_COL.heat : APPL_COL.water) : null);
    return { phase, col, word, time, tshort, w, active, chg: this._applChg[key] || 0, doneLeft: phase === "done" ? doneLeft : 0 };
  },

  /** Live: appliances glow on their drum (front view) or along their line (seen from above) while they work;
   *  close ones share one label; tap opens a small panel (information, never the plug). */
  _applHtml(a) {
    this._appls = [];
    if (this._overlay !== "live") return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let html = "";
    const shown = [];
    for (const item of this._items(a)) {
      if (this._hidden(item, "live")) continue;
      const ap = this._applOf(item);
      if (!ap) continue;
      const st = this._applState(ap);
      this._appls.push({ ap, st });
      const tipA = cesc(this._applTip({ ap, st }));
      if (st.phase === "idle" && !(this._pick && this._selId === item.id)) continue;
      const L = item.light;
      const c = st.col || "150,150,150";
      const cls = `appl ${st.phase} ${still ? "still" : ""}`;
      if (L.type === "drum") {
        const r = Number(L.r) || 1.5;
        html += `<div class="${cls} drum" style="left:${item.x}%;top:${item.y}%;width:${(r * 2).toFixed(2)}%;--ac:${c}" data-appl="${cesc(item.id)}" aria-label="${tipA}"><i></i></div>`;
        shown.push({ id: item.id, x: item.x, y: item.y - r * ratio - 1, st, ap });
      } else {
        const x1 = L.x1 ?? item.x - 3;
        const y1 = L.y1 ?? item.y;
        const x2 = L.x2 ?? item.x + 3;
        const y2 = L.y2 ?? item.y;
        const len = Math.hypot(x2 - x1, (y2 - y1) / ratio);
        const ang = (Math.atan2((y2 - y1) / ratio, x2 - x1) * 180) / Math.PI;
        html += `<div class="${cls} aline" style="left:${x1}%;top:${y1}%;width:${len.toFixed(3)}%;transform:translateY(-50%) rotate(${ang.toFixed(2)}deg);--ac:${c}" data-appl="${cesc(item.id)}" aria-label="${tipA}"></div>`;
        shown.push({ id: item.id, x: (x1 + x2) / 2, y: Math.min(y1, y2) - 2.5, st, ap });
      }
    }
    // 0.7.5: a status pill shows for ~3 min after a change; one that needs you (finished, paused, error) stays
    // until it's resolved. Per marker in Live: automatic / always / never.
    const PILL_MS = 180000;
    let next = 0;
    const pillOf = (o) => {
      const mode = this._per(o.ap.item, "live").pill || "";
      if (this._pick && this._selId === o.ap.item.id) return true; // Edit markers: always while selected
      if (mode === "never") return false;
      if (o.st.doneLeft > 0) next = next ? Math.min(next, o.st.doneLeft) : o.st.doneLeft; // redraw when "Done" clears
      if (["done", "attention", "error"].includes(o.st.phase) || mode === "always") return true;
      const left = o.st.chg + PILL_MS - this._now();
      if (left > 0) next = next ? Math.min(next, left) : left;
      return left > 0;
    };
    const labelled = shown.filter(pillOf);
    clearTimeout(this._applT);
    if (next) this._applT = setTimeout(() => this._update(true), next + 500);
    // One label per group of appliances that sit close together.
    const used = new Set();
    for (const s0 of labelled) {
      if (used.has(s0.id)) continue;
      const grp = labelled.filter((o) => !used.has(o.id) && Math.hypot(o.x - s0.x, (o.y - s0.y) / ratio) < 9);
      grp.forEach((o) => used.add(o.id));
      const x = grp.reduce((t, o) => t + o.x, 0) / grp.length;
      const y = Math.min(...grp.map((o) => o.y));
      const att = grp.some((o) => ["done", "attention", "error"].includes(o.st.phase));
      const rows = grp.map((o) => `<span class="ar"><i style="background:rgb(${o.st.col || "150,150,150"})"></i>${o.st.phase === "done" ? dfT("appl.done_unload") : `${cesc(this._applWord(o))}${o.st.tshort ? ` · ${cesc(o.st.tshort)}` : ""}`}</span>`).join("");
      const anc = grp.map((o) => `${o.x},${o.y},${o.st.col || "150,150,150"}`).join(";");
      html += `<button class="applbl ${att ? "att" : ""}" style="left:${x}%;top:${y}%" data-anc="${anc}" data-appl="${cesc(grp.map((o) => o.id).join(","))}" aria-label="${cesc(grp.map((o) => this._applTip(o)).join(", "))}">${rows}</button>`;
    }
    return html;
  },

  /** 0.8.1: "name · state · time" for the hover label, like the info card's headline. */
  _applTip(o) {
    const t = o.st.tshort || "";
    return [this._dev(o.ap.item.id).name || o.ap.item.name, o.st.phase === "done" ? dfT("appl.finished") : this._applWord(o), t].filter(Boolean).join(" · ");
  },

  /** The appliance's word on its label: the leading entity chosen in Edit markers, else its status. */
  _applWord(o) {
    const l = this._per(o.ap.item, "live").lead;
    return l && this._hass.states[l] ? this._fmt(l) : o.st.word;
  },

  /** 0.7.4: a TV that is on lights the room from its screen: a soft, slowly changing glow (Live, Lights). */
  _tvHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "lights") return "";
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const areas = a.areas || {};
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const night = (this._ns && this._ns.f) || 0;
    let defs = "";
    let body = "";
    let n = 0;
    for (const item of this._items(a)) {
      if (item.phantom || item.bond || this._hidden(item, ov)) continue;
      const mp = [item.main_entity, ...(item.entities || [])].find((e) => e && domainOf(e) === "media_player" && hass.states[e]);
      const st = mp && hass.states[mp];
      // A TV glows by default; anything else only when set to Screen in the Editor.
      if (item.light ? item.light.type !== "screen" : !(st && st.attributes.device_class === "tv")) continue;
      if (!st || !live(st)) continue;
      const level = ["on", "playing"].includes(st.state) ? 1 : st.state === "paused" ? 0.45 : ["idle", "standby", "buffering"].includes(st.state) ? 0.25 : 0;
      if (!level) continue;
      const L = { ...defaultShape("screen", a.real_width_m), ...(item.light || {}) };
      // The screen is its own line (both ends set in the Editor); older settings start at the marker.
      const x1 = L.x1 ?? (L.x2 != null ? item.x : item.x - 3);
      const y1 = L.y1 ?? item.y;
      const x2 = L.x2 ?? item.x + 3;
      const y2 = L.y2 ?? item.y;
      const anc = item.area_id && areas[item.area_id];
      const g = screenPoly(x1, y1, x2, y2, Number(L.r) || 10, L.a, ratio, anc ? anc.x : 50, anc ? anc.y : 50);
      const under = Object.keys(areas).find((k) => areas[k].shape && inPoly((x1 + x2) / 2, (y1 + y2) / 2, areas[k].shape)) || null;
      const start = item.area_id && areas[item.area_id] && areas[item.area_id].shape ? item.area_id : under;
      const group = start ? shapeGroup(areas, start) : null;
      const i = n++;
      if (group) defs += `<clipPath id="tvc${i}">${group.map((sh) => `<polygon points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
      const op = (0.5 + 0.35 * night) * level;
      const anim = !still && level === 1;
      const col = anim ? `<animate attributeName="stop-color" values="#a9c8ff;#eef4ff;#b7a8ff;#8fd8ff;#ffe0b8;#a9c8ff" dur="11s" repeatCount="indefinite"/>` : "";
      defs += `<linearGradient id="tvg${i}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}"><stop offset="0" stop-color="#cfe0ff" stop-opacity="${op.toFixed(2)}">${col}</stop><stop offset=".55" stop-color="#cfe0ff" stop-opacity="${(op * 0.35).toFixed(2)}">${col}</stop><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></linearGradient><filter id="tvf${i}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(0.9).toFixed(2)} ${(0.9 * ratio).toFixed(2)}"/></filter>`;
      const flick = anim ? `<animate attributeName="opacity" values="1;.82;.95;.75;1;.88;1" dur="4.3s" repeatCount="indefinite"/>` : "";
      body += `<g${group ? ` clip-path="url(#tvc${i})"` : ""}><polygon points="${g.pts.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" fill="url(#tvg${i})" filter="url(#tvf${i})">${flick}</polygon></g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#eaf2ff" stroke-opacity="${(0.35 + 0.35 * level).toFixed(2)}" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 2px rgba(200,220,255,.8))"/>`;
    }
    if (!n) return "";
    return `<svg class="air" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  },

  /** #115: air flowing from ACs while they cool / heat (Live, Comfort), kept inside the room shapes. */
  /** 0.13.4: what you tap follows the old order even though light is drawn over pictures: room-wide tap areas
   *  (a room's motion / presence, an AC's air flow) sit in one transparent layer UNDER the pictures, touch areas
   *  and markers, so tapping a picture or a marker never opens the room. Same shapes as the drawings. */
  _tapLayer(pulseH, airH) {
    const pulse = (pulseH.match(/<polygon points="[^"]*" fill="transparent" class="ptap"[^>]*\/>/g) || []).join("");
    const air = (airH.match(/<g clip-path="url\(#[^)]*\)"><polygon class="atap"[^>]*\/>|<g><polygon class="atap"[^>]*\/>/g) || [])
      .map((g) => `${g.replace(/fill="url\(#[^)]*\)"/, 'fill="transparent"')}</g>`).join("");
    return pulse || air ? `<svg class="taps" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${pulse}${air}</svg>` : "";
  },

  _airHtml(a) {
    const ov = this._overlay;
    if (ov !== "live" && ov !== "comfort") return "";
    if (ov === "comfort" && !this._layerOn("comfort", "air", this._layerDefault("comfort", "air"))) return "";
    const hass = this._hass;
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const areas = a.areas || {};
    const W = a.real_width_m;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const COL = { cool: "79,163,255", heat: "255,138,61", dry: "60,193,176", fan: "60,193,176", auto: "126,87,194" };
    let defs = "";
    let body = "";
    let n = 0;
    for (const item of this._items(a)) {
      if (item.phantom || item.bond || this._hidden(item, ov)) continue;
      const clim = [item.main_entity, ...(item.entities || [])].find((e) => e && domainOf(e) === "climate" && hass.states[e]);
      if (!clim) continue;
      const st = hass.states[clim];
      const at = st.attributes || {};
      const act = at.hvac_action;
      let mode = act ? { cooling: "cool", heating: "heat", drying: "dry", fan: "fan" }[act] : { cool: "cool", heat: "heat", dry: "dry", fan_only: "fan", heat_cool: "auto", auto: "auto" }[st.state];
      if (!mode || !live(st)) continue;
      const modes = at.hvac_modes || [];
      const canCool = modes.includes("cool") || modes.includes("heat_cool") || modes.includes("dry") || modes.includes("fan_only");
      if (item.air && item.air.type === "none") continue;
      const aid = item.area_id || (item.of && (a.devices || {})[item.of] && a.devices[item.of].area_id) || null;
      let start = aid && areas[aid] && areas[aid].shape ? aid : null;
      if (!start) start = Object.keys(areas).find((k) => areas[k].shape && inPoly(item.x, item.y, areas[k].shape)) || null;
      const group = start ? shapeGroup(areas, start) : null;
      const i = n++;
      if (group) defs += `<clipPath id="ac${i}">${group.map((sh) => `<polygon points="${sh.map((q) => `${q[0]},${q[1]}`).join(" ")}"/>`).join("")}</clipPath>`;
      const c = COL[mode];
      const clip = group ? ` clip-path="url(#ac${i})"` : "";
      if (!canCool) {
        // Radiator / underfloor: a soft warm glow while heating.
        const r = W ? (1.5 / W) * 100 : 7;
        defs += `<radialGradient id="ag${i}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".62"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`;
        body += `<g${clip}><ellipse cx="${item.x}" cy="${item.y}" rx="${r}" ry="${r * ratio}" fill="url(#ag${i})">${still ? "" : `<animate attributeName="opacity" values=".7;1;.7" dur="4s" repeatCount="indefinite"/>`}</ellipse></g>`;
        continue;
      }
      let ang = 90;
      const anc = aid && areas[aid];
      if (anc && (Math.abs(anc.x - item.x) > 0.5 || Math.abs(anc.y - item.y) > 0.5)) ang = (Math.atan2((anc.y - item.y) / ratio, anc.x - item.x) * 180) / Math.PI;
      // 0.7.7: a trapezoid from the unit's line (drawn in the Editor; else a short line at the marker).
      const g = airGeom({ a: ang, r: W ? (2 / W) * 100 : 10, s: 60, L: W ? (0.8 / W) * 100 : 4, ...(item.air || {}), x: item.x, y: item.y }, ratio);
      const f = (q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
      defs += `<linearGradient id="ag${i}" gradientUnits="userSpaceOnUse" x1="${g.mid[0].toFixed(2)}" y1="${g.mid[1].toFixed(2)}" x2="${g.tip[0].toFixed(2)}" y2="${g.tip[1].toFixed(2)}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".62"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></linearGradient>`;
      // The arcs, as before: centred where the two sides meet, from the unit's line out to the reach.
      const arc = (k) => {
        const rr = g.R * k;
        const a1 = ((g.th - g.h * 0.92) * Math.PI) / 180, a2 = ((g.th + g.h * 0.92) * Math.PI) / 180;
        return `M${(Math.cos(a1) * rr).toFixed(2)},${(Math.sin(a1) * rr).toFixed(2)} A${rr.toFixed(2)},${rr.toFixed(2)} 0 0 1 ${(Math.cos(a2) * rr).toFixed(2)},${(Math.sin(a2) * rr).toFixed(2)}`;
      };
      const k0 = Math.min(0.9, g.d0 / g.R);
      const waves = still ? `<path d="${arc((1 + k0) / 2)}" fill="none" stroke="rgba(${c},.55)" stroke-width="2" vector-effect="non-scaling-stroke"/>` : [0, 1, 2].map((k) => `<g><path d="${arc(1)}" fill="none" stroke="rgba(${c},.95)" stroke-width="2.8" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0"><animateTransform attributeName="transform" type="scale" from="${k0.toFixed(3)}" to="1" dur="3s" begin="${k}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="3s" begin="${k}s" repeatCount="indefinite"/></path></g>`).join("");
      // 0.8.1: the air flow is the AC on the plan: tap and hold open it, hover names it.
      const tipA = `${item.name} · ${hass.formatEntityState ? hass.formatEntityState(st) : st.state}`;
      body += `<g${clip}><polygon class="atap" data-airent="${cesc(clim)}" data-airid="${cesc(item.id)}" aria-label="${cesc(tipA)}" points="${f(g.e1)} ${f(g.f1)} ${f(g.f2)} ${f(g.e2)}" fill="url(#ag${i})"/><g transform="translate(${g.apex[0].toFixed(2)} ${g.apex[1].toFixed(2)}) scale(1 ${ratio})">${waves}</g></g>`;
    }
    if (!n) return "";
    return `<svg class="air" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  },

  /** 0.7.0: every door / window / shutter spot on the plan (devices and entity spots, bonded too). */
  _openSpots(a) {
    const hass = this._hass;
    if (this._osA === a && this._osH === hass) return this._os;
    const out = [];
    const add = (id, d, eid) => {
      const st = hass.states[eid];
      if (!st || !openKind(eid, st)) return;
      out.push({ id, eid, st, kind: openKind(eid, st), as: guessOpenAs(eid, hass, d.name, d.as), x: d.x, y: d.y, area_id: d.area_id, opening: d.opening });
    };
    for (const [id, d] of Object.entries(a.devices || {})) {
      if (d.category === "moving") continue; // 0.12.3: a car's doors are no openings of the house
      const ents = d.entities || [];
      const eid = ents.find((e) => domainOf(e) === "cover" && hass.states[e]) || ents.find((e) => openKind(e, hass.states[e]) === "contact");
      if (eid) add(id, d, eid);
    }
    for (const [eid, d] of Object.entries(a.entities || {})) add(`entity:${eid}`, d, eid);
    // 0.7.2: one bar per opening. A sensor without its own bar shares the bar of another one on the
    // same spot (a twin, a few pixels beside it), or of the one it was set "Next to".
    const own = (o) => o.opening && o.opening.x1 != null;
    const sides = {};
    for (const o of out) if (own(o)) o.geo = o.opening;
    for (const o of out) {
      if (o.geo) continue;
      let base = null;
      if (o.opening && o.opening.link) base = out.find((q) => q.id === o.opening.link && own(q));
      if (!base && !o.opening) base = out.find((q) => q !== o && own(q) && Math.hypot(q.x - o.x, q.y - o.y) < 1.5);
      if (!base) continue;
      const n = (sides[base.id] = (sides[base.id] || 0) + 1);
      let side = o.opening && o.opening.side ? o.opening.side : n % 2 ? 1 : -1;
      if (base.opening.swap) side = -side;
      o.geo = base.opening;
      o.side = side * Math.ceil(n / 2);
    }
    // 0.7.3: "Combine into one bar": a shutter and a contact of the same opening share one bar,
    // driven by the shutter; the contact only raises an alert (closed shutter, open contact).
    for (const o of out) {
      if (!(o.opening && o.opening.merge && o.geo)) continue;
      const base = out.find((q) => q.id === o.opening.link);
      if (!base) continue;
      const cover = [o, base].find((q) => q.kind === "cover");
      const contact = cover === o ? base : o;
      if (!cover || contact.kind !== "contact") continue;
      cover.geo = base.opening;
      cover.side = 0;
      cover.as = "shutter";
      cover.mate = contact;
      contact.hidden = true;
    }
    this._osA = a;
    this._osH = hass;
    this._os = out;
    return out;
  },

  /** Entities that have a bar drawn: their markers step aside in Live. */
  _barEnts() {
    const a = this._a;
    if (!a || !this._hass) return new Set();
    return new Set(this._openSpots(a).filter((o) => o.geo).map((o) => o.eid));
  },

  /** How far open, 0…1 (null = unknown). */
  _openFrac(o) {
    const st = o.st;
    if (!live(st)) return null;
    if (o.kind === "contact") return st.state === "on" ? 1 : 0;
    const p = st.attributes.current_position;
    if (num(p)) return Math.max(0, Math.min(1, Number(p) / 100));
    return st.state === "closed" ? 0 : 1;
  },

  /** 0.7.0: doors and windows as a light blue bar while open.
   *  0.7.4: shutters as a white bar for the part that is closed: open = nothing, closed = full bar.
   *  A sliding shutter grows from the bar's first end, a roller shutter from the centre to both ends.
   *  Unknown / unavailable: a faint dashed bar, so it never looks open by mistake.
   *  In Security every shutter shows (an open one as a faint outline), so each can be tapped. */
  _barsHtml(a) {
    const ov = this._overlay;
    if (!["live", "security"].includes(ov)) return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    let html = "";
    for (const o of this._openSpots(a)) {
      if (!o.geo || o.hidden) continue;
      const f = this._openFrac(o);
      const { x1, y1, x2, y2 } = o.geo;
      const len = Math.hypot(x2 - x1, (y2 - y1) / ratio);
      const ang = (Math.atan2((y2 - y1) / ratio, x2 - x1) * 180) / Math.PI;
      // Twins sit beside the bar: 7 px bar + 4 px gap per step.
      const geo = `left:${x1}%;top:${y1}%;width:${len.toFixed(3)}%;transform:translateY(-50%) rotate(${ang.toFixed(2)}deg)${o.side ? ` translateY(${o.side * 11}px)` : ""}`;
      const label = `${entName(this._hass, o.eid)}: ${this._hass.formatEntityState ? this._hass.formatEntityState(o.st) : o.st.state}`;
      const bar = (cls, inner = "", title = label) => `<button class="obar ${cls}" data-bar="${cesc(o.eid)}" aria-label="${cesc(title)}" title="${cesc(title)}" style="${geo}">${inner}</button>`;
      if (o.as !== "shutter") {
        if (f == null || f === 0) continue;
        html += bar("door");
        continue;
      }
      if (f == null) {
        html += bar("shut unk");
        continue;
      }
      const shut = 1 - f; // how much of the opening the shutter covers
      if (o.mate && shut > 0.99 && o.mate.st && o.mate.st.state === "on") {
        // Shutter says closed, the contact says open: pulsing orange-red.
        const ml = `${label} · ${entName(this._hass, o.mate.eid)}: open`;
        html += bar("shut alert", `<i style="width:100%"></i>`, ml);
        continue;
      }
      // Security shows every shutter (open ones as a faint outline you can tap); Live only what is closed.
      const track = ov === "security" ? " track" : "";
      if (shut < 0.01) {
        if (track) html += bar("shut track");
        continue;
      }
      const w = (shut * 100).toFixed(1);
      const roll = (o.geo.roll || (o.kind === "cover" && num(o.st.attributes.current_position) ? "roller" : "sliding")) === "roller";
      html += bar(`shut${track}`, `<i style="width:${w}%${roll ? `;margin-left:${((100 - shut * 100) / 2).toFixed(1)}%` : ""}"></i>`);
    }
    return html;
  },

  /** 0.7.3: the shaped room a device sits in (its area, else the shape under it). */
  _roomOf(item, a = this._a) {
    const areas = (a && a.areas) || {};
    if (item.area_id && areas[item.area_id] && Array.isArray(areas[item.area_id].shape) && areas[item.area_id].shape.length >= 3) return item.area_id;
    return Object.keys(areas).find((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3 && inPoly(item.x, item.y, areas[k].shape)) || null;
  },

  /** Motion and presence sensors on the plan, with their room. */
  _motionSpots(a) {
    const hass = this._hass;
    const out = [];
    const seen = new Set();
    for (const item of this._items(a)) {
      if (item.phantom) continue;
      const room = this._roomOf(item);
      if (!room) continue;
      for (const e of [item.main_entity, ...(item.entities || [])]) {
        if (!e || seen.has(e)) continue;
        const st = hass.states[e];
        if (!st || kindOf(e, st) !== "motion") continue;
        seen.add(e);
        const dc = st.attributes.device_class;
        out.push({ eid: e, st, room, presence: dc === "occupancy" || dc === "presence" });
      }
    }
    return out;
  },

  /** 0.7.3: Room pulse. Motion: the room's edges glow and breathe; presence: a steady faint outline;
   *  cleared: fades out over 2 s. Only along real walls: where a room overlaps another (open plan),
   *  nothing is drawn, so no line runs through the open space. */
  _pulseHtml(a) {
    if (this._overlay !== "live") return "";
    const opts = (this._config.live || {});
    if ((opts.motion_as || "pulse") === "icons") return "";
    const areas = a.areas || {};
    const now = this._now();
    this._pulseT = this._pulseT || {};
    this._pulseOn = this._pulseOn || {};
    const rooms = {};
    for (const m of this._motionSpots(a)) {
      const r = (rooms[m.room] = rooms[m.room] || { motion: false, presence: false, ents: [] });
      if (m.st.state === "on") {
        if (m.presence) r.presence = true;
        else r.motion = true;
        r.ents.push(m.eid);
      }
    }
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const pts = (sh) => sh.map((q) => `${q[0]},${q[1]}`).join(" ");
    const shaped = Object.keys(areas).filter((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3);
    let defs = `<filter id="pgf" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${(0.9).toFixed(2)} ${(0.9 * ratio).toFixed(2)}"/></filter>`;
    let body = "";
    let i = 0;
    for (const aid of shaped) {
      const r = rooms[aid] || { motion: false, presence: false, ents: [] };
      const active = r.motion || r.presence;
      const was = this._pulseOn[aid];
      if (was && !active) this._pulseT[aid] = now;
      this._pulseOn[aid] = active;
      const fading = !active && this._pulseT[aid] && now - this._pulseT[aid] < 2100;
      if (!active && !fading) continue;
      const me = pts(areas[aid].shape);
      const open = shaped.filter((k) => k !== aid && polysOverlap(areas[aid].shape, areas[k].shape));
      defs += `<clipPath id="pc${i}"><polygon points="${me}"/></clipPath>`;
      let mask = "";
      if (open.length) {
        defs += `<mask id="pm${i}" maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="110"><rect x="-5" y="-5" width="110" height="110" fill="#fff"/>${open.map((k) => `<polygon points="${pts(areas[k].shape)}" fill="#000"/>`).join("")}</mask>`;
        mask = ` mask="url(#pm${i})"`;
      }
      const cls = fading ? "fade" : r.motion ? "breathe" : "steady";
      const delay = fading ? `animation-delay:-${now - this._pulseT[aid]}ms` : r.motion ? `animation-delay:-${now % 3600}ms` : "";
      body += `<g class="pg ${cls}" style="${delay}"><g clip-path="url(#pc${i})"${mask}><polygon points="${me}" fill="none" stroke="#3fb8a5" stroke-width="14" vector-effect="non-scaling-stroke" filter="url(#pgf)" opacity=".55"/><polygon points="${me}" fill="none" stroke="#5fd3c0" stroke-width="2" vector-effect="non-scaling-stroke" opacity=".85"/></g>${r.ents.length ? `<polygon points="${me}" fill="transparent" class="ptap" data-pulse="${cesc(r.ents[0])}"/>` : ""}</g>`;
      i++;
    }
    return body ? `<svg class="pulse" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>${defs}</defs>${body}</svg>` : "";
  },

  /** 0.7.2: daylight per room, spreading through the home.
   *  Sources: a window lets light in whatever its state; a shutter by how far it's open; doors don't count.
   *  A room with sources is mostly its own light; an inner room (no sources) takes the average of the
   *  rooms its shape touches or overlaps (gap = wall: no light). Overlap (open plan) links stronger. */
  _daylight(a) {
    const areas = a.areas || {};
    const ids = Object.keys(areas).filter((k) => Array.isArray(areas[k].shape) && areas[k].shape.length >= 3);
    if (!ids.length) return null;
    const src = {};
    let anyShutter = false;
    for (const o of this._openSpots(a)) {
      if (o.as === "door" || o.hidden) continue;
      let aid = o.area_id && ids.includes(o.area_id) ? o.area_id : null;
      if (!aid) aid = ids.find((k) => inPoly(o.x, o.y, areas[k].shape)) || null;
      if (!aid && o.geo) aid = ids.find((k) => inPoly((o.geo.x1 + o.geo.x2) / 2, (o.geo.y1 + o.geo.y2) / 2, areas[k].shape)) || null;
      if (!aid) continue;
      let v;
      if (o.as === "window") v = 1;
      else {
        v = this._openFrac(o);
        if (v == null) continue;
        anyShutter = true;
      }
      (src[aid] = src[aid] || []).push(v);
    }
    if (!anyShutter) return null;
    // Links: overlap (open plan) 1, touch (doorway) 0.5.
    const links = {};
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = areas[ids[i]].shape;
      const B = areas[ids[j]].shape;
      const w = polysOverlap(A, B) ? 1 : polysTouch(A, B) ? 0.5 : 0;
      if (!w) continue;
      (links[ids[i]] = links[ids[i]] || []).push([ids[j], w]);
      (links[ids[j]] = links[ids[j]] || []).push([ids[i], w]);
    }
    const own = {};
    for (const k of ids) if (src[k]) own[k] = 1 - src[k].reduce((t, v) => t + v, 0) / src[k].length;
    let d = {};
    for (const k of ids) d[k] = own[k] ?? 0;
    for (let it = 0; it < 16; it++) {
      const nd = {};
      for (const k of ids) {
        const nb = links[k] || [];
        const sw = nb.reduce((t, [, w]) => t + w, 0);
        const sv = nb.reduce((t, [j, w]) => t + w * d[j], 0);
        if (src[k]) {
          const S = src[k].length; // its own windows count most
          nd[k] = (S * own[k] + 0.6 * sv) / (S + 0.6 * sw);
        } else nd[k] = sw ? sv / sw : 0;
      }
      d = nd;
    }
    return { ids, d };
  },

  /** #117 / 0.7.2: one shading layer by day; each spot gets one value (no doubling where shapes overlap),
   *  soft between rooms that touch, crisp at walls and outside. */
  _shadeHtml(a, n, ns) {
    if (n.shutters === false || !(n.overlays || []).includes(this._overlay)) return "";
    const day = 1 - (ns.f || 0);
    if (day <= 0.05) return "";
    const res = this._daylight(a);
    if (!res) return "";
    const areas = a.areas || {};
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const pts = (sh) => sh.map((q) => `${q[0]},${q[1]}`).join(" ");
    const MAX = 0.55; // fully dark room ≈ half dark, never black
    const order = [...res.ids].sort((x, y) => res.d[x] - res.d[y]); // darker last: overlaps take the darker
    let paint = "";
    let any = false;
    for (const k of order) {
      const alpha = Math.max(0, Math.min(1, res.d[k])) * MAX * day;
      if (alpha >= 0.03) any = true;
      const L = Math.round(255 * alpha);
      // 0.9.1: a thin stroke in the same colour closes the hairline where two glued rooms meet.
      paint += `<polygon points="${pts(areas[k].shape)}" fill="rgb(${L},${L},${L})" stroke="rgb(${L},${L},${L})" stroke-width=".3" stroke-linejoin="round"/>`;
    }
    if (!any) return "";
    const clip = res.ids.map((k) => `<polygon points="${pts(areas[k].shape)}"/>`).join("");
    const r = 1.4;
    const b = 1.6;
    return `<svg class="shade" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>
<filter id="shf" x="-10%" y="-10%" width="120%" height="120%"><feMorphology operator="dilate" radius="${r} ${(r * ratio).toFixed(2)}"/><feGaussianBlur stdDeviation="${b} ${(b * ratio).toFixed(2)}"/></filter>
<clipPath id="shc">${clip}</clipPath>
<mask id="shm" maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="110"><rect x="-5" y="-5" width="110" height="110" fill="#000"/><g filter="url(#shf)">${paint}</g></mask></defs>
<rect x="0" y="0" width="100" height="100" fill="rgb(12,18,34)" mask="url(#shm)" clip-path="url(#shc)"/></svg>`;
  },

  _nightHtml(a) {
    const n = this._night();
    const ns = this._ns || { f: 0 };
    const ov = this._overlay;
    const on = ns.f > 0 && (n.overlays || []).includes(ov);
    const pools = ov === "lights" || on || this._glowOnly(ov) ? this._pools(a) : [];
    const shade = this._shadeHtml(a, n, ns);
    if (!on && !pools.length) return shade;
    const k = (ns.f * Math.max(0, Math.min(100, Number(n.strength ?? 70)))) / 100;
    let html = shade;
    if (on) {
      const base = n.style === "dim" ? `rgba(0,0,0,${(0.82 * k).toFixed(3)})` : `rgba(10,16,38,${(0.86 * k).toFixed(3)})`;
      const mk = pools.length ? poolSvg(pools, "mask") : "";
      // #119: with room shapes, only the inside of the home darkens; walls and outside keep their colour.
      // Only when every room on the plan has a shape (else the unshaped rooms would stay bright).
      const rooms = Object.values(a.areas || {}).filter((x) => x.x != null || x.shape);
      const shapes = rooms.every((x) => Array.isArray(x.shape) && x.shape.length >= 3) ? rooms.map((x) => x.shape) : [];
      const sm = shapes.length ? shapesSvg(shapes) : "";
      const layers = [sm, mk].filter(Boolean);
      const both = layers.length === 2 ? "-webkit-mask-composite:source-in;mask-composite:intersect;" : "";
      const mask = layers.length ? `-webkit-mask-image:${layers.join(",")};mask-image:${layers.join(",")};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;${both}` : "";
      html += `<div class="night" style="background:${base};${mask}"></div>`;
      if (ns.tint) html += `<div class="ntint" style="background:${ns.tint === "dusk" ? "rgba(255,140,60," : "rgba(120,160,255,"}${(0.2 * Math.sin(Math.PI * ns.f)).toFixed(3)});${sm ? `-webkit-mask-image:${sm};mask-image:${sm};-webkit-mask-size:100% 100%;mask-size:100% 100%;` : ""}"></div>`;
    }
    if (pools.length) {
      const g = poolSvg(pools, "glow");
      if (on) html += `<div class="nglow" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:${(0.25 + 0.3 * ns.f).toFixed(2)}"></div>`;
      // By day, light pools tint the floor (multiply) so they stay visible on a bright plan.
      else html += `<div class="nglow day" style="background-image:${g};background-size:100% 100%"></div><div class="nglow2" style="background-image:${g};background-size:100% 100%;opacity:.35"></div>`;
    }
    return html;
  },
});
