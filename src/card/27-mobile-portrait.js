// Mobile card, portrait: the Home, room and Control pages, their rows, tiles and bars (split from 26-mobile, #86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** #96: the Home sections to show, in order (all four by default). */
  _secOrder() {
    const v = this._config.sections;
    return Array.isArray(v) && v.length ? v.filter((x) => DFM_SECTIONS.includes(x)) : DFM_SECTIONS;
  },

  /** #91: the greeting on one line, always whole: its font shrinks to the space (18 → 13 px); if even that is
   *  too long, the climate card gives up width first. Measured, so any name and language fits. */
  _fitGreet() {
    const hd = this.shadowRoot && this.shadowRoot.querySelector(".hd.top");
    const h1 = hd && hd.querySelector(".h1");
    if (!h1 || !h1.clientWidth) return;
    hd.classList.remove("tight"); // measured on every draw (the page redraw resets it), in the same frame: no flicker
    let px = 18;
    hd.style.setProperty("--dfm-greet", `${px}px`);
    while (h1.scrollWidth > h1.clientWidth + 1 && px > 13) hd.style.setProperty("--dfm-greet", `${--px}px`);
    if (h1.scrollWidth > h1.clientWidth + 1) hd.classList.add("tight");
  },

  // ------------------------------------------------------------- shared pieces
  _stateTxt(x) {
    const st = x.st;
    if (!st) return "";
    if (x.offline) return dfT("mob.offline");
    let s = "";
    try {
      s = this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    } catch (_e) {
      s = st.state;
    }
    if (x.lk === "light" && st.state === "on" && num(st.attributes.brightness)) s += ` · ${Math.round((st.attributes.brightness / 255) * 100)}%`;
    if (x.lk === "climate" && st.state !== "off") {
      const tg = st.attributes.temperature;
      if (num(tg)) s = dfT("mob.climate_to", { s, t: tg });
    }
    // #66: an AC that is off still says the room's temperature.
    if (x.lk === "climate" && st.state === "off" && num(st.attributes.current_temperature)) s += ` · ${Math.round(Number(st.attributes.current_temperature) * 10) / 10}°`;
    return s;
  },

  /** #67: "13 minutes ago" in Home Assistant's language. */
  _ago(ts) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) return "";
    const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || "en";
    if (!this._rtf || this._rtfL !== lang) {
      try {
        this._rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      } catch (_e) {
        this._rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      }
      this._rtfL = lang;
    }
    const sec = Math.max(0, (Date.now() - t) / 1000);
    if (sec < 60) return this._rtf.format(0, "second");
    const [u, d] = sec < 3600 ? ["minute", 60] : sec < 86400 ? ["hour", 3600] : ["day", 86400];
    return this._rtf.format(-Math.floor(sec / d), u);
  },

  /** #67: the icon of a row: the device's own, the entity's own, else by what it is and its state (open / closed …). */
  _iconOf(x) {
    const own = ((this._base || {}).devices || {})[x.item.id];
    if (own && own.icon) return own.icon;
    const st = x.st;
    if (!st) return null;
    if (st.attributes.icon) return st.attributes.icon;
    const on = ["on", "open", "opening", "unlocked", "unlocking"].includes(st.state);
    const dc = String(st.attributes.device_class || "");
    const nm = `${x.lead} ${x.name}`.toLowerCase();
    switch (x.lk) {
      case "opening":
        if (dc === "garage_door" || /garage/.test(nm)) return on ? "mdi:garage-open-variant" : "mdi:garage-variant";
        if (/slid|συρ/.test(nm)) return on ? "mdi:door-sliding-open" : "mdi:door-sliding";
        if (dc === "window" || /window|παράθ/.test(nm)) return on ? "mdi:window-open-variant" : "mdi:window-closed-variant";
        return on ? "mdi:door-open" : "mdi:door-closed";
      case "motion":
        return ["occupancy", "presence"].includes(dc) ? (on ? "mdi:account" : "mdi:account-outline") : on ? "mdi:motion-sensor" : "mdi:motion-sensor-off";
      case "cover":
        if (["curtain"].includes(dc)) return on ? "mdi:curtains" : "mdi:curtains-closed";
        if (["blind", "shade"].includes(dc)) return on ? "mdi:blinds-open" : "mdi:blinds";
        if (dc === "garage") return on ? "mdi:garage-open-variant" : "mdi:garage-variant";
        return on ? "mdi:window-shutter-open" : "mdi:window-shutter";
      case "lock":
        return on ? "mdi:lock-open-variant" : "mdi:lock";
      case "temperature":
      case "humidity":
        return x.temps.length ? "mdi:thermometer" : "mdi:water-percent";
      case "safety":
        return on ? "mdi:alert-circle" : "mdi:shield-check-outline";
      default:
        return x.air.length && !x.temps.length ? "mdi:air-filter" : null; // the rest: Home Assistant's own icon
    }
  },

  /** #68: the colour of a row's icon says its state. */
  _stCls(x) {
    if (x.alarm.length) return "s-alarm";
    if (x.open.length) return "s-open";
    const st = x.st;
    if (!st || x.offline) return "";
    if (x.lk === "climate" && st.state !== "off") return st.state === "heat" ? "s-warm" : st.state === "cool" ? "s-cool" : "s-act";
    if (x.on) return ["light", "switch"].includes(x.lk) ? "s-on" : "s-act";
    if (["motion", "opening", "lock", "cover"].includes(x.lk) && ["on", "open", "opening", "unlocked"].includes(st.state)) return "s-act";
    return "";
  },

  _row(x, opts = {}) {
    const eid = x.lead;
    const st = x.st;
    const d = domainOf(eid);
    const tog = st && DFM_TOGGLE.has(d) && !x.offline && !(d === "cover" && !["open", "closed"].includes(st.state));
    const dim = d === "light" && st && st.state === "on" && (st.attributes.supported_color_modes || []).some((c) => c !== "onoff");
    const badges = [];
    if (x.offline) badges.push(`<b class="bd amber">${dfT("mob.offline")}</b>`);
    if (x.open.length) badges.push(`<b class="bd red">${x.open.includes(eid) ? dfT("mob.open") : dfT("mob.open_n", { n: x.open.length })}</b>`);
    if (x.alarm.length) badges.push(`<b class="bd red">${cesc(this._fmtE(x.alarm[0]))}</b>`);
    if (x.warn.length) badges.push(`<b class="bd amber">${cesc(this._fmtE(x.warn[0]))}</b>`);
    if (x.battery != null && x.battery <= 15) badges.push(`<b class="bd amber">${dfT("mob.battery", { n: Math.round(x.battery) })}</b>`);
    if (x.power != null && x.power >= 5 && !opts.noPower) badges.push(`<b class="bd">${cesc(fmtW(x.power))}</b>`);
    const extra = opts.value ? `<span class="val">${cesc(opts.value)}</span>` : "";
    const room = `${x.doorOpen ? ` · ${dfT("mob.door_open")}` : ""}${opts.room ? ` · ${cesc(opts.room)}` : ""}`;
    return `<div class="row ${x.on ? "on" : ""} ${x.attention ? "att" : ""}" data-a="more" data-v="${cesc(eid || "")}">
      <span class="tile ${this._stCls(x)}">${this._iconOf(x) ? `<ha-icon icon="${cesc(this._iconOf(x))}"></ha-icon>` : st ? `<ha-state-icon data-ent="${cesc(eid)}"></ha-state-icon>` : `<ha-icon icon="${DFM_GICON[x.g]}"></ha-icon>`}</span>
      <span class="txt"><span class="nm"><span class="t">${cesc(x.name)}</span>${badges.join("")}</span><span class="sub">${this._rowVals(x)}${room}</span>
      ${dim ? `<input type="range" class="bri" min="1" max="100" value="${Math.round((st.attributes.brightness || 255) / 2.55)}" data-a="bri" data-v="${cesc(eid)}" aria-label="${dfT("mob.brightness")}">` : ""}</span>
      ${extra}${tog ? `<button class="sw ${x.on || (st && st.state === "on") ? "on" : ""}" role="switch" aria-checked="${x.on}" data-a="tog" data-v="${cesc(eid)}" aria-label="${cesc(x.name)}"><i></i></button>` : ""}
    </div>`;
  },

  /** #51: an air / climate sensor shows all its readings in one line ("20.6° · 63% · PM2.5 6 · VOC 178" + its air dot). */
  // #66: a device that measures the room shows all its readings, temperature first; #67: on / off things say since when.
  _rowVals(x) {
    if (!x.offline && (x.air.length || ["temperature", "humidity"].includes(x.lk))) {
      const p = [x.temps.length ? `${Math.round(x.temps[0] * 10) / 10}°` : "", x.hums.length ? `${Math.round(x.hums[0])}%` : "", ...x.air.map((q) => `${q.label} ${q.v}`)].filter(Boolean).join(" · ");
      if (p) return `${x.air.length ? this._airDot(x.airR) : ""}${cesc(p)}`;
    }
    const t = cesc(this._stateTxt(x));
    const ago = x.st && !x.offline && DFM_AGO.has(x.lk) ? this._ago(x.st.last_changed) : "";
    return ago ? `${t} · <span class="ago">${cesc(ago)}</span>` : t;
  },

  _vals(r) {
    return [r.temp != null ? `${r.temp}°` : "", r.hum != null ? `${Math.round(r.hum)}%` : "", dfT("mob.n_devices", { n: r.items.length })].filter(Boolean).join(" · ");
  },

  _roomSub(r) {
    const p = [];
    if (r.attention) p.push(dfT("mob.n_attention", { n: r.attention }));
    if (r.on) p.push(dfT("mob.n_on", { n: r.on }));
    if (r.temp != null) p.push(`${r.temp}°`);
    if (r.people.length) p.push(r.people.map((pp) => this._pname(pp)).join(", "));
    return p.join(" · ") || dfT("mob.quiet");
  },

  _pname(p) {
    const st = this._hass.states[p.entity];
    return ((st && st.attributes.friendly_name) || p.entity).split(" ")[0];
  },

  _outside() {
    const w = Object.values(this._hass.states).find((s) => s.entity_id.startsWith("weather.") && num(s.attributes.temperature));
    return w ? `${Math.round(Number(w.attributes.temperature) * 10) / 10}${w.attributes.temperature_unit || "°"}` : null;
  },

  /** The devices of an overlay: what the Floorplan card shows there, with the user's settings (#25). */
  _members(o, list) {
    if (o === "live") return list.filter((x) => x.now.has("live") || x.attention);
    return list.filter((x) => x.ovs.has(o) && !(o === "security" && x.camOnly));
  },

  /** What an overlay has to say now for a set of devices (one line), or "" when there is nothing. */
  _sum(o, list, quiet = false) {
    const m = this._m;
    const mem = this._members(o, list);
    const n = (f) => mem.filter(f).length;
    if (o === "live") return mem.length ? dfT("mob.now_n", { n: mem.length }) : quiet ? dfT("mob.quiet") : "";
    if (o === "lights") {
      const k = n((x) => x.on);
      return k ? dfT("mob.n_on", { n: k }) : quiet ? dfT("mob.all_off") : "";
    }
    if (o === "comfort") {
      const t = dfmAvg(mem.flatMap((x) => x.temps));
      const ac = mem.find((x) => x.lk === "climate" && x.on);
      return [t != null ? `${t}°` : "", ac ? `${ac.name} · ${this._stateTxt(ac)}` : ""].filter(Boolean).join(" · ");
    }
    if (o === "security") {
      const k = mem.reduce((t, x) => t + x.open.length, 0);
      const al = n((x) => x.alarm.length);
      return al ? dfT("mob.alert") : k ? dfT("mob.open_n", { n: k }) : quiet ? dfT("mob.all_closed") : "";
    }
    if (o === "network") {
      const k = n((x) => x.offline);
      return k ? dfT("mob.n_offline", { n: k }) : quiet ? dfT("mob.all_online") : "";
    }
    if (o === "health") {
      const k = n((x) => x.battery != null && x.battery <= 15);
      const w = n((x) => x.warn.length);
      const t = [k ? dfT("mob.n_low", { n: k }) : "", w ? dfT("mob.n_warn", { n: w }) : ""].filter(Boolean).join(" · ");
      return t || (quiet ? dfT("mob.all_fine") : "");
    }
    if (o === "energy") {
      const w = mem.reduce((t, x) => t + (x.power || 0), 0);
      return w > 0 ? fmtW(w) : "";
    }
    if (o === "cleaning") {
      const r = mem.find((x) => x.on);
      return r ? `${r.name} · ${this._stateTxt(r)}` : "";
    }
    if (o === "people") return dfT("mob.n_home", { n: m.people.filter((p) => p.home).length });
    const k = n((x) => x.now.has(o));
    return k ? dfT("mob.n_shown", { n: k }) : "";
  },

  /** The devices an overlay lists in full, most important first. */
  _list(o, list) {
    const mem = this._members(o, list);
    const att = (a, b) => b.attention - a.attention || Number(b.now.has(o) || b.on) - Number(a.now.has(o) || a.on) || a.name.localeCompare(b.name);
    if (o === "network") return mem.sort((a, b) => Number(b.offline) - Number(a.offline) || a.name.localeCompare(b.name));
    if (o === "health") return mem.sort((a, b) => b.warn.length - a.warn.length || (a.battery ?? 101) - (b.battery ?? 101) || a.name.localeCompare(b.name));
    if (o === "energy") return mem.sort((a, b) => (b.power || 0) - (a.power || 0));
    return mem.sort(att);
  },

  _listHtml(o, list, roomNames) {
    const rows = this._list(o, list);
    if (!rows.length) return `<div class="none">${dfT("mob.nothing")}</div>`;
    const val = (x) => (o === "health" ? `${Math.round(x.battery)}%` : o === "network" && x.sigEnt ? this._fmtE(x.sigEnt) : "");
    return rows.map((x) => this._row(x, { value: val(x), room: roomNames ? this._roomName(x) : "" })).join("");
  },

  _fmtE(eid) {
    const st = this._hass.states[eid];
    if (!live(st)) return "—";
    try {
      return this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    } catch (_e) {
      return st.state;
    }
  },

  _roomName(x) {
    const r = this._m.rooms.find((q) => q.id === x.room && q.floor === x.floor);
    return r ? r.name : "";
  },

  _peopleHtml(people) {
    if (!people.length) return `<div class="none">${dfT("mob.no_people")}</div>`;
    return people.map((p) => {
      const where = p.room ? p.room.name : p.st ? this._fmtE(p.entity) : "";
      return `<div class="row" data-a="${p.room ? "room" : "more"}" data-v="${cesc(p.room ? `${p.room.floor}|${p.room.id}` : p.entity)}">
        <span class="av ${p.home ? "home" : ""}">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>
        <span class="txt"><span class="nm">${cesc(p.name)}</span><span class="sub">${cesc(where)}</span></span>
        ${p.room ? '<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>' : ""}</div>`;
    }).join("");
  },

  _thumb(f, room) {
    const ar = room && f.a.areas[room];
    const shape = ar && Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const ratio = f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6;
    const img = this._img(f);
    return `<span class="thumb" style="aspect-ratio:${ratio}" data-a="gohome" data-v="${cesc(f.id)}">${img ? `<img src="${cesc(img)}" alt="">` : ""}<svg viewBox="0 0 100 100" preserveAspectRatio="none">${shape ? `<polygon points="${shape.map((p) => p.join(",")).join(" ")}"/>` : ar ? `<ellipse cx="${ar.x}" cy="${ar.y}" rx="6" ry="6"/>` : ""}</svg></span>`;
  },

  /** The plan picture (signed once a day). */
  _img(f) {
    const url = f.a.image_url;
    if (!url) return "";
    this._imgs = this._imgs || {};
    if (this._imgs[url] === undefined) {
      this._imgs[url] = "";
      cardSign(this._hass, url).then((p) => {
        this._imgs[url] = p;
        this._kick(true);
      }).catch(() => {
        this._imgs[url] = url;
      });
    }
    return this._imgs[url];
  },

  // ------------------------------------------------------------- portrait
  _portHtml(m) {
    const s = this._s;
    let body = "";
    if (s.page === "room") body = this._roomPage(m);
    else if (s.page === "rooms") body = this._homePage(m); // #71: portrait has no separate floor page
    else if (s.page === "devices") body = this._devPage(m);
    else if (s.page === "people") body = this._pplPage(m);
    else if (s.page === "control") body = this._ctlPage(m);
    else body = this._homePage(m);
    const ctlOn = ["control", "devices", "people"].includes(s.page);
    // #85: ☰ · the place you are in (opens the Navigator) · Control: a tab bar, always there.
    const f = m.floors.find((q) => q.id === s.floor);
    const r = s.page === "room" ? m.rooms.find((q) => q.id === s.room && q.floor === s.floor) : null;
    const place = r ? r.name : m.floors.length > 1 && f && s.page !== "house" ? f.name : this._homeName();
    const bar = `<div class="barwrap"><nav class="bar">${this._hdrOn ? `<button class="tb" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : ""}<span class="pill2"><button class="ph ${ctlOn ? "" : "on"}" data-a="home"><ha-icon icon="${cesc(r ? r.icon : "mdi:home-outline")}"></ha-icon><span class="pt">${cesc(place)}</span><ha-icon class="up" icon="mdi:chevron-up"></ha-icon></button><i class="sep"></i><button class="pl ${ctlOn ? "on" : ""}" data-a="tab" data-v="control" aria-label="${dfT("mob.control")}"><ha-icon icon="mdi:view-dashboard-outline"></ha-icon>${ctlOn ? `<span class="pt">${dfT("mob.control")}</span>` : ""}</button></span></nav></div>`;
    // #54: the bar, the sheets and their backdrop live in a layer of their own on the page (fixed = the screen).
    this._layerHtml = `${bar}${this._sheet ? this._sheetHtml(m) : ""}`;
    const inline = !this._useLayer();
    return `<div class="port"><div class="bgfix"></div><div class="pg" data-scroll="pg">${body}<div class="pad"></div></div>${inline ? this._layerHtml : ""}</div>`;
  },

  /** #58: a section's title with its grid / row switch. */
  _secHead(key, icon, title, extra = "") {
    const grid = !!(lsGet("dfm_grid") || {})[key];
    return `<h2><ha-icon icon="${icon}"></ha-icon>${title}${extra}<button class="gt" data-a="grid" data-v="${key}" aria-label="${dfT(grid ? "mob.as_row" : "mob.as_grid")}"><ha-icon icon="${grid ? "mdi:view-carousel-outline" : "mdi:view-grid-outline"}"></ha-icon></button></h2>`;
  },

  _secBody(key, html) {
    const grid = !!(lsGet("dfm_grid") || {})[key];
    return `<div class="${grid ? "gridw" : "hs"}" data-scroll="h${key}">${html}</div>`;
  },

  /** #51: "Air good / moderate / poor" with its dot. */
  _airTxt(r) {
    return r == null ? "" : dfT(["mob.air_good", "mob.air_mod", "mob.air_poor"][r]);
  },

  _airDot(r) {
    return r == null ? "" : `<i class="adot a${r}"></i>`;
  },

  /** The real issues (open doors / windows, alarms, poor air), one entry each. */
  _issues(m) {
    const out = [];
    for (const x of m.items) {
      for (const e of x.alarm) out.push({ x, e, txt: x.name, st: this._fmtE(e), p: 0 });
      for (const e of x.open) out.push({ x, e, txt: x.name, st: this._fmtE(e), p: 2 });
    }
    for (const r of m.rooms) if (r.airR === 2) {
      const worst = r.items.flatMap((x) => x.air).filter((q) => q.r === 2)[0];
      out.push({ room: r, e: null, txt: dfT("mob.air_poor"), st: worst ? `${worst.label} ${worst.v}` : "", p: 1 });
    }
    // #92-3: the most important first (alarms, poor air, then open), the latest first inside each.
    const t = (i) => Date.parse(((i.e && this._hass.states[i.e]) || {}).last_changed || "") || 0;
    return out.sort((a, b) => a.p - b.p || t(b) - t(a));
  },

  /** #64: a floor's devices for the bar under the plan: "open" = doors / windows, "cover" = shutters, "alarm" = alarms. */
  _floorItems(m, floor, kind) {
    const fi = m.items.filter((x) => x.floor === floor);
    // #87: the ones that are open first; inside each group the latest change first.
    const t = (x) => Date.parse((x.st && x.st.last_changed) || "") || 0;
    const by = (first) => (a, b) => Number(first(b)) - Number(first(a)) || t(b) - t(a);
    if (kind === "open") return fi.filter((x) => x.nOpen).sort(by((x) => x.open.length > 0));
    if (kind === "cover") return fi.filter((x) => x.ents.some((e) => domainOf(e) === "cover")).sort(by((x) => x.on));
    if (kind === "alarm") return fi.filter((x) => x.alarm.length).sort(by(() => true));
    return [];
  },

  /** #64: one full-width bar of equal segments (icon + value); a segment opens its list. */
  _segBar(segs, cls = "") {
    const on = segs.filter(Boolean);
    return on.length ? `<div class="segs ${cls}">${on.map((g) => `<button class="seg ${g.tone || ""}" data-a="${g.a}" data-v="${cesc(g.v || "")}" aria-label="${cesc(g.label)}"><ha-icon icon="${g.icon}"></ha-icon>${g.txt != null ? `<span>${cesc(String(g.txt))}</span>` : ""}</button>`).join("")}</div>` : "";
  },

  _homePage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const hr = new Date().getHours();
    const user = this._hass.user || {};
    const first = String(user.name || "").split(" ")[0];
    const me = m.people.find((p) => p.st && p.st.attributes.user_id && p.st.attributes.user_id === user.id);
    const greet = dfT(hr < 12 ? "mob.morning" : hr < 18 ? "mob.afternoon" : "mob.evening") + (first ? `, ${first}` : "");
    const home = m.people.filter((p) => p.home).length;
    const iss = this._issues(m);
    // #92-3: what needs a look, led by the most important issue itself; a tap opens the list.
    const lead = iss[0] ? (iss[0].x ? `${iss[0].txt} · ${iss[0].st}` : `${iss[0].txt} · ${iss[0].room.name}`) : "";
    const sumLine = cesc(m.people.length ? dfT("mob.k_of_n_home", { k: home, n: m.people.length }) : "") + (m.people.length ? " · " : "")
      + (iss.length ? `<button class="isslink" data-a="issues">${cesc(lead)}${iss.length > 1 ? ` <b>+${iss.length - 1}</b>` : ""}</button>` : cesc(dfT("mob.all_good")));
    // #65: the shown floor's climate (its rooms); a floor without any: the main floor's, named.
    const multi = m.floors.length > 1;
    const climOf = (fid) => {
      const rs = m.rooms.filter((r) => r.floor === fid);
      const ar = rs.filter((r) => r.airR != null);
      return { t: dfmAvg(rs.filter((r) => r.temp != null).map((r) => r.temp)), h: dfmAvg(rs.filter((r) => r.hum != null).map((r) => r.hum)), air: ar.length ? Math.max(...ar.map((r) => r.airR)) : null };
    };
    let cf = f.id;
    let cl = climOf(f.id);
    if (cl.t == null && cl.h == null && cl.air == null) {
      cf = this._mainFloor(m);
      cl = climOf(cf);
    }
    const out = this._outside();
    const inLine = [cl.t != null ? `${cl.t}°` : "", cl.h != null ? `${Math.round(cl.h)}%` : ""].filter(Boolean).join(" · ");
    const cfName = multi ? (m.floors.find((q) => q.id === cf) || {}).name || "" : "";
    const clim = out || inLine || cl.air != null ? `<button class="clim" data-a="ovs" data-v="comfort">${out ? `<span class="cl"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><b>${cesc(out)}</b><small>${dfT("mob.outside")}</small></span>` : ""}${inLine ? `<span class="cl"><ha-icon icon="mdi:home-thermometer-outline"></ha-icon><b>${cesc(inLine)}</b>${cfName ? `<small>${cesc(cfName)}</small>` : ""}</span>` : ""}${cl.air != null ? `<span class="cl"><ha-icon icon="mdi:air-filter"></ha-icon>${this._airDot(cl.air)}<b>${cesc(this._airTxt(cl.air))}</b></span>` : ""}</button>` : "";
    // #64 / #74: what is going on on the shown floor: icon + number, zero hidden.
    const fi = m.items.filter((x) => x.floor === f.id);
    const lightsOn = this._members("lights", fi).filter((x) => x.on).length;
    const off = fi.filter((x) => x.offline).length;
    const low = fi.filter((x) => x.battery != null && x.battery <= 15).length;
    const wn = fi.filter((x) => x.warn.length).length;
    const top = this._segBar([
      lightsOn && { a: "ovs", v: "lights", icon: "mdi:lightbulb-group", txt: lightsOn, label: dfT("mob.lights_on", { n: lightsOn }), tone: "lt" },
      off && { a: "ovs", v: "network", icon: "mdi:lan-disconnect", txt: off, label: dfT("mob.n_offline", { n: off }), tone: "warn" },
      low && { a: "ovs", v: "health", icon: "mdi:battery-alert-variant-outline", txt: low, label: dfT("mob.n_low", { n: low }), tone: "warn" },
      wn && { a: "ovs", v: "health", icon: "mdi:alert-outline", txt: wn, label: dfT("mob.n_warn", { n: wn }), tone: "warn" },
    ]);
    // #64: under the plan, like the Wallpanel's row: this floor's openings and shutters, the house's alarm.
    const nAl = fi.reduce((t, x) => t + x.alarm.length, 0);
    const opDev = fi.filter((x) => x.nOpen);
    const nOp = opDev.reduce((t, x) => t + x.open.length, 0);
    const covs = [...new Set(fi.flatMap((x) => x.ents.filter((e) => domainOf(e) === "cover")))];
    const nCv = covs.filter((e) => ["open", "opening"].includes((this._hass.states[e] || {}).state)).length;
    const acp = Object.keys(this._hass.states).filter((e) => e.startsWith("alarm_control_panel.") && live(this._hass.states[e]));
    const ast = acp.length ? this._hass.states[acp[0]] : null;
    const aTone = !ast ? "" : ast.state === "triggered" ? "att" : ["arming", "pending"].includes(ast.state) ? "warn" : ast.state.startsWith("armed") ? "act" : "";
    const bottom = this._segBar([
      nAl && { a: "items", v: "alarm", icon: "mdi:alarm-light", txt: nAl, label: dfT("mob.alert"), tone: "att" },
      opDev.length && { a: "items", v: "open", icon: nOp ? "mdi:door-open" : "mdi:door-closed", txt: nOp ? dfT("mob.open_n", { n: nOp }) : dfT("mob.all_closed"), label: dfT("mob.openings"), tone: nOp ? "att" : "" },
      covs.length && { a: "items", v: "cover", icon: nCv ? "mdi:roller-shade" : "mdi:roller-shade-closed", txt: nCv ? dfT("mob.open_n", { n: nCv }) : dfT("mob.all_closed"), label: dfT("mob.shutters"), tone: nCv ? "act" : "" },
      ast && { a: "more", v: acp[0], icon: ast.state.startsWith("armed") || ast.state === "triggered" ? "mdi:shield-lock" : "mdi:shield-off-outline", txt: this._fmtE(acp[0]), label: dfT("mob.alarm_panel"), tone: aTone },
    ], "below");
    const rooms = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
    const cams = this._cams(m);
    const appls = m.items.filter((x) => x.ap);
    // #75: a floor with one room shows that room's groups here (no room level).
    const one = rooms.length === 1 ? rooms[0] : null;
    const see = (a, v = "") => `<button class="seeall" data-a="${a}" data-v="${cesc(v)}">${dfT("mob.see_all")}<ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    const avatar = me && me.pic ? `<span class="me"><img src="${cesc(me.pic)}" alt=""></span>` : "";
    // #96: the sections in the order (and only those) chosen in the editor.
    const sec = {
      rooms: one ? `<section class="oneroom"><h2 class="sh1"><span class="rtile"><ha-icon icon="${cesc(one.icon)}"></ha-icon></span>${cesc([one.name, this._vals(one)].filter(Boolean).join(" · "))}</h2>${this._roomGroups(one)}</section>`
        : `<section>${this._secHead("rooms", "mdi:floor-plan", multi ? `${dfT("mob.rooms")} · ${cesc(f.name)}` : dfT("mob.rooms"), see("nav"))}${this._secBody("rooms", rooms.map((r) => this._tile(m, r)).join(""))}</section>`,
      control: `<section>${this._secHead("ctl", "mdi:view-dashboard-outline", `${dfT("mob.home_control")}<small class="scope">${dfT("mob.whole_home")}</small>`, see("tab", "control"))}${this._secBody("ctl", this._ovTiles(m))}</section>`,
      appliances: appls.length ? `<section>${this._secHead("appl", "mdi:washing-machine", dfT("mob.appliances"))}${this._secBody("appl", appls.map((x) => this._applTile(x)).join(""))}</section>` : "",
      cameras: cams.length ? `<section>${this._secHead("cams", "mdi:cctv", dfT("mob.cameras"))}${this._secBody("cams", cams.map((c) => this._camTile(m, c)).join(""))}</section>` : "",
    };
    return `<header class="hd top">${avatar}<div class="grow"><div class="h1">${cesc(greet)}</div><div class="sub">${sumLine}</div></div>${clim}</header>
      ${top}
      <div class="mini" data-swipe="floor">${this._slot(f.id, "live", "", "mini")}${this._planNav(m, f)}${rooms.length > 1 && !lsGet("dfm_hint_p") ? `<div class="phint">${dfT("mob.hint_port")}</div>` : ""}</div>
      ${bottom}
      ${this._secOrder().map((k) => sec[k] || "").join("")}`;
  },

  /** #48: the floor's name and ‹ › on the plan itself (no row); swipe does the same. */
  _planNav(m, f) {
    const multi = m.floors.length > 1;
    return `<span class="flabel">${cesc(f.name)}</span>${multi ? `<button class="nav l" data-a="fstep" data-v="1" aria-label="${dfT("mob.floor_up")}"><ha-icon icon="mdi:chevron-left"></ha-icon></button><button class="nav r" data-a="fstep" data-v="-1" aria-label="${dfT("mob.floor_down")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}`;
  },

  /** #50: every placed device with a camera (its camera entity), robots' maps excepted. */
  _cams(m) {
    const out = [];
    for (const x of m.items) {
      if (x.ents.some((e) => domainOf(e) === "vacuum" || domainOf(e) === "lawn_mower")) continue;
      // #90 (as Dwains): hidden, unknown and unavailable cameras are left out.
      const cam = x.ents.find((e) => domainOf(e) === "camera" && live(this._hass.states[e]) && !dfcHidden(e));
      if (cam) out.push({ x, cam });
    }
    return out;
  },

  _camTile(m, c) {
    const st = this._hass.states[c.cam];
    // #90: the still picture, renewed whenever the camera updates; a tap opens HA's own camera window.
    const pic0 = st && st.state !== "unavailable" && st.attributes.entity_picture;
    const pic = pic0 ? `${pic0}${pic0.includes("?") ? "&" : "?"}dfm=${Date.parse(st.last_updated || st.last_changed) || 0}` : "";
    const nm = c.x.name || (st && st.attributes.friendly_name) || c.cam;
    return `<button class="cam" data-a="more" data-v="${cesc(c.cam)}">${pic ? `<img src="${cesc(pic)}" alt="">` : `<span class="noimg"><ha-icon icon="mdi:cctv-off"></ha-icon></span>`}<b>${cesc(nm)}</b><small>${cesc([this._roomName(c.x), this._fmtE(c.cam)].filter(Boolean).join(" · "))}</small></button>`;
  },

  /** 0.13.9.18 Appliances: what it is doing, in one line (running: word · time left; idle: when it last ran). */
  _applLine(x, st) {
    const ap = x.ap;
    if (st.active) return [st.word, st.time].filter(Boolean).join(" · ");
    if (st.phase === "idle") {
      const src = [ap.running, ap.status, ap.plug, ap.power, x.item.main_entity].map((e) => e && this._hass.states[e]).find((q) => q && live(q));
      return src ? dfT("mob.last_run", { t: this._ago(src.last_changed) }) : st.word;
    }
    return st.word;
  },

  _applPct(x, st) {
    const pr = x.ap.progress && this._hass.states[x.ap.progress];
    return st.active && pr && num(pr.state) ? Math.max(0, Math.min(100, Number(pr.state))) : null;
  },

  _applTile(x) {
    const st = x.h._applState(x.ap);
    const pic = x.item.pic && x.item.pic.src ? x.h._picUrl(x.item.pic.src) : null;
    const pct = this._applPct(x, st);
    const tone = ["done"].includes(st.phase) ? "done" : ["attention", "error"].includes(st.phase) ? "att" : st.active ? "run" : "";
    return `<button class="apt ${tone}" data-a="appl" data-v="${cesc(`${x.floor}|${x.item.id}`)}"${pct != null ? ` style="--p:${pct}"` : ""}><span class="api ${pct != null ? "ring" : ""}">${pic ? `<img src="${cesc(pic)}" alt="">` : `<ha-icon icon="${APPL_ICON[x.ap.type] || APPL_ICON.other}"></ha-icon>`}</span><b>${cesc(x.name)}</b><small>${cesc(this._applLine(x, st))}</small></button>`;
  },

  /** #77: the home's own name (HA → Settings → General), else "Home". */
  _homeName() {
    const n = String((this._hass.config && this._hass.config.location_name) || "").trim();
    return n && n.toLowerCase() !== "home" ? n : dfT("mob.home");
  },

  /** #85: Control: every overlay as a rich tile (the same tiles as Home control), all devices, a 2-column grid. */
  _ctlPage(m) {
    const all = `<button class="ot" data-a="tab" data-v="devices" style="--c:#8a8f98"><span class="oti"><ha-icon icon="mdi:devices"></ha-icon></span><b>${dfT("mob.all_devices")}</b><small>${cesc(dfT("mob.n_devices", { n: m.items.length }))}</small></button>`;
    const appls = m.items.filter((x) => x.ap);
    const ap = appls.length ? `<button class="ot" data-a="ovs" data-v="appl" style="--c:#26a69a"><span class="oti"><ha-icon icon="mdi:washing-machine"></ha-icon></span><b>${dfT("mob.appliances")}</b><small>${cesc(appls.filter((x) => x.h._applState(x.ap).active).length ? dfT("mob.n_on", { n: appls.filter((x) => x.h._applState(x.ap).active).length }) : dfT("mob.quiet"))}</small></button>` : "";
    return `<header class="hd"><div class="grow"><div class="h1">${dfT("mob.control")}</div><div class="sub">${cesc(this._homeName())}</div></div></header><div class="ctlgrid">${this._ovTiles(m)}${ap}${all}</div>`;
  },

  /** #56 / #57: a room tile: its icon, one badge per overlay with something to say (max 4 + "+n"), its name and values. */
  _tile(m, r) {
    const line = [r.temp != null ? `${r.temp}°` : "", r.hum != null ? `${Math.round(r.hum)}%` : "", r.airR != null ? this._airTxt(r.airR) : ""].filter(Boolean).join(" · ");
    return `<button class="rt" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rti"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="bds">${this._badges(m, r)}</span><b>${cesc(r.name)}</b><small>${r.airR != null ? this._airDot(r.airR) : ""}${cesc(line || dfT("mob.n_devices", { n: r.items.length }))}</small></button>`;
  },

  /** #71: a room's overlay badges, built once for its tile and its row. */
  _badges(m, r) {
    const f = m.floors.find((q) => q.id === r.floor);
    const bd = [];
    for (const o of this._overlayList(f)) {
      const mem = this._members(o, r.items);
      let v = null;
      if (o === "security") v = r.items.reduce((t, x) => t + x.open.length + x.alarm.length, 0) || null;
      else if (o === "lights") v = mem.filter((x) => x.on).length || null;
      else if (o === "comfort") v = mem.filter((x) => x.lk === "climate" && x.on).length || null;
      else if (o === "energy") v = r.power >= 1 ? fmtW(r.power) : null;
      else if (o === "network") v = r.offline || null;
      else if (o === "health") v = r.low + r.warns || null;
      else if (o === "cleaning") v = mem.filter((x) => x.on).length || null;
      else if (o === "people") v = r.people.length || null;
      else if (o !== "live" && o !== "plan") v = mem.filter((x) => x.now.has(o)).length || null;
      if (v) bd.push([DFM_BPRIO[o] ?? 5, `<b class="tb2" style="--c:${DFM_OVC[o] || "#8a8f98"}"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon>${cesc(String(v))}</b>`]);
    }
    if (!bd.length && r.people.length) bd.push([6, `<b class="tb2" style="--c:${DFM_OVC.people}"><ha-icon icon="mdi:account"></ha-icon>${r.people.length}</b>`]);
    // #92-13: no "+n": only the most important ones that fit (3), never over the room's name.
    return bd.sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]).join("");
  },

  /** #60: "Home control": one big tile per overlay; a tap opens its sheet. */
  _ovTiles(m) {
    const f = m.floors.find((q) => q.id === this._s.floor);
    const ovs = this._overlayList(f).filter((o) => o !== "live" && o !== "plan");
    if (m.people.length && !ovs.includes("people")) ovs.unshift("people");
    const tiles = ovs.map((o) => {
      const t = o === "people" ? dfT("mob.k_of_n_home", { k: m.people.filter((p) => p.home).length, n: m.people.length }) : this._sum(o, m.items, true);
      let body = "";
      if (o === "people") body = `<span class="pchips">${m.people.slice(0, 4).map((p) => `<span class="pc ${p.home ? "home" : ""}"><span class="av">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>${cesc(p.name.split(" ")[0])}</span>`).join("")}${m.people.length > 4 ? `<span class="pc">+${m.people.length - 4}</span>` : ""}</span>`;
      if (o === "energy") {
        const rs = m.rooms.filter((r) => r.power >= 1).sort((a, b) => b.power - a.power).slice(0, 3);
        const max = rs.length ? rs[0].power : 1;
        body = `<span class="bars">${rs.map((r) => `<span class="bar1"><span>${cesc(r.name)}</span><small>${cesc(fmtW(r.power))}</small><i style="width:${Math.max(4, (r.power / max) * 100).toFixed(0)}%"></i></span>`).join("")}</span>`;
      }
      const quiet = !t || [dfT("mob.all_off"), dfT("mob.all_closed"), dfT("mob.all_online"), dfT("mob.all_fine"), dfT("mob.quiet")].includes(t);
      const att = o === "security" && /\d/.test(t);
      return `<button class="ot ${quiet ? "quiet" : ""} ${att ? "att" : ""}" data-a="ovs" data-v="${cesc(o)}" style="--c:${DFM_OVC[o] || "#8a8f98"}"><span class="oti"><ha-icon icon="${cesc(o === "people" ? OVERLAYS.people.icon : this._ovIcon(o, f))}"></ha-icon></span><b>${cesc(o === "people" ? OVERLAYS.people.label : this._ovLabel(o, f))}</b><small>${cesc(t || "")}</small>${body}</button>`;
    });
    return tiles.sort((a, b) => Number(a.includes(" quiet ")) - Number(b.includes(" quiet "))).join("");
  },

  /** #41 / #76: a room's devices by kind: one card per group (header inside, flat rows), each folds; Lights has
   *  the room's master switch like the Lights sheet. */
  _roomGroups(r) {
    const gfold = lsGet("dfm_gfold") || {};
    return DFM_GROUPS.map((g) => {
      const list = r.items.filter((x) => x.g === g).sort((a, b) => b.attention - a.attention || Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
      if (!list.length) return "";
      const sum = g === "lights" ? "" : this._sum(DFM_GOV[g] === "live" ? "live" : DFM_GOV[g], list) || "";
      const tg = g === "lights" ? list.filter((x) => x.st && DFM_TOGGLE.has(domainOf(x.lead)) && !x.offline) : [];
      const onN = tg.filter((x) => x.on).length;
      const master = tg.length ? `<button class="rmaster ${onN ? "on" : ""}" data-a="rmaster" data-v="${cesc(tg.map((x) => x.lead).join(","))}" data-on="${onN ? 1 : 0}">${onN}/${tg.length}<i></i></button>` : "";
      const fo = !!gfold[g];
      return `<section class="rcard gcard ${fo ? "folded" : ""}"><div class="rch" data-a="gfold" data-v="${g}"><span class="rtile gi g-${g}"><ha-icon icon="${DFM_GICON[g]}"></ha-icon></span><b>${dfmGroupLabel(g)}</b><span class="gs">${cesc(sum)}</span>${master}<span class="go"><ha-icon icon="mdi:chevron-${fo ? "right" : "down"}"></ha-icon></span></div>${fo ? "" : list.map((x) => this._row(x)).join("")}</section>`;
    }).join("");
  },

  _roomPage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const r = m.rooms.find((q) => q.id === s.room && q.floor === f.id);
    const folded = !!lsGet("dfm_fold");
    const groups = this._roomGroups(r);
    // #33 / #42: one plan band (a third of the screen), the room centred, controls floating on it.
    const foldBtn = `<button class="fold ${folded ? "off" : ""}" data-a="fold" aria-label="${folded ? dfT("mob.show_plan") : dfT("mob.hide")}"><ha-icon icon="mdi:chevron-${folded ? "down" : "up"}"></ha-icon></button>`;
    const band = folded ? "" : `<div class="cut" data-swipe="room">${this._slot(f.id, "live", r.id, "room")}
        <button class="nav l" data-a="step" data-z="room" data-v="-1" aria-label="${dfT("mob.prev_room")}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="nav r" data-a="step" data-z="room" data-v="1" aria-label="${dfT("mob.next_room")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>${foldBtn}</div>`;
    return `<header class="hd room"><button class="bk" data-a="back" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${cesc(r.name)}</div><div class="sub">${r.airR != null ? this._airDot(r.airR) : ""}${cesc([this._vals(r), r.airR != null ? this._airTxt(r.airR) : ""].filter(Boolean).join(" · "))}</div></div>${this._thumb(f, r.id)}${folded ? foldBtn : ""}</header>
      ${band}
      ${groups || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  },

  _devPage(m) {
    const q = String(this._q || "").trim().toLowerCase();
    const list = m.items.filter((x) => !q || x.name.toLowerCase().includes(q) || this._roomName(x).toLowerCase().includes(q));
    const by = new Map();
    for (const x of list) {
      const k = x.room ? `${x.floor}|${x.room}` : `${x.floor}|`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(x);
    }
    const sec = [...by.entries()].map(([k, xs]) => {
      const [fid, rid] = k.split("|");
      const f = m.floors.find((z) => z.id === fid);
      const r = rid && m.rooms.find((z) => z.id === rid && z.floor === fid);
      const title = r ? `${r.name}${m.floors.length > 1 ? ` · ${f.name}` : ""}` : `${dfT("mob.no_room")}${m.floors.length > 1 ? ` · ${f.name}` : ""}`;
      return `<section><h2>${cesc(title)}<span class="gs">${xs.length}</span></h2>${xs.sort((a, b) => a.name.localeCompare(b.name)).map((x) => this._row(x)).join("")}</section>`;
    }).join("");
    return `<header class="hd"><button class="bk" data-a="tab" data-v="control" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${dfT("mob.devices")}</div><div class="sub">${dfT("mob.n_devices", { n: m.items.length })}</div></div></header>
      <div class="search"><ha-icon icon="mdi:magnify"></ha-icon><input data-a="q" type="search" value="${cesc(this._q || "")}" placeholder="${dfT("mob.search")}"></div>${sec || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  },

  _pplPage(m) {
    return `<header class="hd"><button class="bk" data-a="tab" data-v="control" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${dfT("mob.people")}</div><div class="sub">${dfT("mob.n_home", { n: m.people.filter((p) => p.home).length })}</div></div></header><div class="list">${this._peopleHtml(m.people)}</div>`;
  },
});
