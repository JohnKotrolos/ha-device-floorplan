// Mobile card, landscape: the 3D home, the floor / room plan and the overlay rail (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  // ------------------------------------------------------------- landscape: the house explorer
  _landHtml(m) {
    const s = this._s;
    const multi = m.levels.length > 1;
    // #27 / #83 / #93: landscape is the big plan with its overlays. The House is the 3D building (several levels);
    // a floor and a room are the Floorplan card; the overlay rail is the mobile card's own (never redrawn by the card).
    const one = (fid) => m.rooms.filter((q) => q.floor === fid).length < 2;
    const scope = s.page === "room" && s.room && !one(s.floor) ? "room" : s.page === "house" && multi ? "house" : "floor";
    const f = m.floors.find((q) => q.id === s.floor);
    const r = scope === "room" ? m.rooms.find((q) => q.id === s.room && q.floor === f.id) : null;
    const items = scope === "room" ? r.items : scope === "floor" ? m.items.filter((x) => x.floor === f.id) : m.items;
    const gone = this._hdrHidden ? "gone" : "";
    const menu = this._hdrOn ? `<button class="lmenu" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : "";
    // #100: the title is the picker (▾ lists the floors, or the floor's rooms), in the top-left chip with ‹ back:
    // one place to navigate (no second pill at the bottom).
    const pick = (label, list, act) => (list.length > 1
      ? `<button class="h1 tpick" data-a="fmenu" aria-expanded="${this._fmenu ? "true" : "false"}"><span>${cesc(label)}</span><ha-icon icon="mdi:chevron-${this._fmenu ? "up" : "down"}"></ha-icon></button>${this._fmenu ? `<div class="fmenu">${list.map(([v, n, on]) => `<button class="${on ? "on" : ""}" data-a="${act}" data-v="${cesc(v)}">${cesc(n)}</button>`).join("")}</div>` : ""}`
      : `<div class="h1">${cesc(label)}</div>`);
    // #92-6: a one-time hint (gone after the first tap on the plan in landscape).
    const hint = scope !== "house" && !lsGet("dfm_hint_l") ? `<div class="float hint2">${dfT("mob.hint_land")}</div>` : "";
    let body = "";
    if (scope === "house") {
      body = `${this._houseHtml(m)}
        <div class="float hdr chip ${gone}">${menu}<div><div class="h1">${cesc(this._homeName())}</div><div class="sub">${cesc([dfT("mob.n_floors", { n: m.levels.length }), m.people.length ? dfT("mob.n_home", { n: m.people.filter((p) => p.home).length }) : "", this._outside() ? `${this._outside()} ${dfT("mob.outside")}` : ""].filter(Boolean).join(" · "))}</div></div></div>
        <div class="float hint ${gone}">${dfT("mob.house_hint")}</div>`;
    } else if (scope === "floor") {
      body = `${this._slot(f.id, "live", "", "land", "lplan")}
        <div class="float hdr chip ${gone}">${menu}<div>${multi ? `<button class="bk" data-a="back">‹ ${cesc(this._homeName())}</button>` : ""}${pick(f.name, m.floors.map((q) => [q.id, q.name, q.id === f.id]), "floor")}<div class="sub">${cesc(this._sum("live", items, true))}</div></div></div>${hint}`;
    } else {
      const rs = this._sortRooms(m.rooms.filter((q) => q.floor === f.id));
      body = `${this._slot(f.id, "live", r.id, "landroom", "lplan")}
        <div class="float hdr chip ${gone}">${menu}<div><button class="bk" data-a="back">‹ ${cesc(f.name)}</button>${pick(r.name, rs.map((q) => [`${q.floor}|${q.id}`, q.name, q.id === r.id]), "room")}<div class="sub">${cesc(this._vals(r))}</div></div></div>${hint}`;
    }
    const zone = scope === "room" ? "room" : scope === "floor" ? "floor" : "";
    return `<div class="land"><div class="left full" ${zone ? `data-swipe="${zone}"` : ""}>${body}</div>${scope === "house" ? "" : this._railHtml(m, f)}</div>`;
  },

  /** #93: the landscape overlay rail: the source card's overlays (its order), no background, labels whole (#101:
   *  no Home Replay here, the plan's round Replay button is the one switch); the mobile card's own element, so a state change never rebuilds it (its scroll stays). */
  _railHtml(m, f) {
    const ovs = this._overlayList(f).filter((o) => o !== "plan");
    const cur = ovs.includes(this._lov) ? this._lov : ovs.includes("live") ? "live" : ovs[0];
    this._lov = cur;
    return `<nav class="lrail" data-scroll="lrail">${ovs.map((o) => `<button class="lr ${o === cur ? "on" : ""}" data-a="lov" data-v="${cesc(o)}" style="--c:${DFM_OVC[o] || "var(--dfm-acc)"}"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon><span>${cesc(this._ovLabel(o, f))}</span></button>`).join("")}</nav>`;
  },

  /** #26: the House: all levels stacked on one footprint, one tilt for the whole building, sized to fit. */
  _houseHtml(m) {
    const lv = m.levels;
    const n = lv.length;
    const ratio = (f) => (f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6);
    const A = Math.max(...lv.map((l) => l.plans.reduce((t, f) => t + ratio(f), 0)));
    const W = window.innerWidth - 48; // #83: the whole screen
    const H = window.innerHeight - (this._top || 0) - 90;
    const th = (30 * Math.PI) / 180;
    const ph = (56 * Math.PI) / 180;
    const k = 0.5; // gap between levels, as a share of the footprint's depth
    const wW = W / (Math.cos(th) + Math.sin(th) / A);
    const wH = H / ((Math.sin(th) + Math.cos(th) / A) * Math.cos(ph) + ((n - 1) * k * Math.sin(ph)) / A);
    const w = Math.max(120, Math.min(wW, wH));
    const h = w / A;
    const g = k * h;
    const levels = lv.map((l, i) => {
      const z = (n - 1 - i) * g; // m.levels: highest first
      const plans = l.plans.map((f) => this._housePlan(m, f, (ratio(f) / A) * 100)).join("");
      const rs = m.rooms.filter((r) => l.plans.some((f) => f.id === r.floor));
      const att = rs.reduce((t, r) => t + r.attention, 0);
      const on = rs.reduce((t, r) => t + r.on, 0);
      const lab = [att ? dfT("mob.n_attention", { n: att }) : "", on ? dfT("mob.n_on", { n: on }) : ""].filter(Boolean).join(" · ") || dfT("mob.quiet");
      const y = -((n - 1 - i) - (n - 1) / 2) * g * Math.sin(ph);
      return { html: `<div class="lvl" style="transform:translateZ(${z.toFixed(1)}px)">${plans}</div>`, label: `<button class="hl" data-a="floor" data-v="${cesc(l.plans[0].id)}" style="top:calc(50% + ${y.toFixed(1)}px)"><b>${cesc(l.plans.map((f) => f.name).join(" · "))}</b><small>${cesc(lab)}</small></button>` };
    });
    return `<div class="house"><div class="stage" style="width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;--th:${(th * 180) / Math.PI}deg;--ph:${(ph * 180) / Math.PI}deg">${levels.map((x) => x.html).join("")}</div>${levels.map((x) => x.label).join("")}</div>`;
  },

  _housePlan(m, f, pct) {
    const img = this._img(f);
    const rs = m.rooms.filter((r) => r.floor === f.id);
    const polys = rs.map((r) => {
      const sh = Array.isArray(r.ar.shape) && r.ar.shape.length >= 3 ? r.ar.shape : null;
      const cls = r.attention ? "att" : r.lightsOn ? "lit" : r.presence ? "pres" : "";
      if (!cls) return "";
      return sh ? `<polygon class="${cls}" points="${sh.map((p) => p.join(",")).join(" ")}"/>` : `<ellipse class="${cls}" cx="${r.ar.x}" cy="${r.ar.y}" rx="5" ry="5"/>`;
    }).join("");
    const avs = m.people.filter((p) => p.room && p.room.floor === f.id).map((p) => `<span class="hav" style="left:${p.room.ar.x}%;top:${p.room.ar.y}%">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>`).join("");
    return `<button class="plane" data-a="floor" data-v="${cesc(f.id)}" style="width:${pct.toFixed(2)}%">${img ? `<img src="${cesc(img)}" alt="">` : ""}<svg viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg>${avs}</button>`;
  },
});
