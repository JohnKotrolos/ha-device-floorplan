// Mobile card, landscape: the 3D home, the floor / room plan and the overlay rail (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  // ------------------------------------------------------------- landscape: the house explorer
  _landHtml(m) {
    const s = this._s;
    const multi = m.levels.length > 1;
    // #107: landscape shows floors (and the 3D Home), never one room: the portrait room page is the room view. A
    // room can be chosen on the plan (outlined, a chip); turning the phone back opens its page.
    const scope = s.page === "house" && multi ? "house" : "floor";
    const f = m.floors.find((q) => q.id === s.floor);
    const sel = scope === "floor" ? this._landSel(m) : null;
    const gone = this._hdrHidden ? "gone" : "";
    let body = "";
    if (scope === "house") {
      body = `${this._houseHtml(m)}
        <div class="float hdr chip ${gone}"><div><div class="h1">${cesc(this._homeName())}</div><div class="sub">${cesc([dfT("mob.n_floors", { n: m.levels.length }), m.people.length ? dfT("mob.n_home", { n: m.people.filter((p) => p.home).length }) : "", this._outside() ? `${this._outside()} ${dfT("mob.outside")}` : ""].filter(Boolean).join(" · "))}</div></div></div>
        <div class="float hint ${gone}">${dfT("mob.house_hint")}</div>`;
    } else {
      // #92-6: a one-time hint (gone after the first tap on the plan in landscape).
      const hint = !lsGet("dfm_hint_l") ? `<div class="float hint2">${dfT("mob.hint_land")}</div>` : "";
      const chip = sel ? `<button class="float selchip" data-a="unsel"><b>${cesc(sel.name)}</b>${this._vals(sel) ? `<span>${cesc(this._vals(sel))}</span>` : ""}<ha-icon icon="mdi:close"></ha-icon></button>` : hint;
      body = `${this._slot(f.id, "live", "", "land", "lplan")}${chip}`;
    }
    return `<div class="land">${this._navHtml(m, f, scope)}<div class="left full" ${scope === "floor" ? 'data-swipe="floor"' : ""}>${body}</div>${scope === "house" ? "" : this._railHtml(m, f)}</div>`;
  },

  /** #107: the room chosen on the landscape plan (or the room page the phone was turned on). */
  _landSel(m) {
    const s = this._s;
    return s.page === "room" && s.room ? m.rooms.find((q) => q.id === s.room && q.floor === s.floor) || null : null;
  },

  /** #108: landscape navigation in its own strip on the left, beside the plan (never over it): ☰, the floors
   *  (highest first, by level), Home (the 3D home). */
  _navHtml(m, f, scope) {
    const menu = this._hdrOn ? `<button class="ln menu" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : "";
    const short = (q) => (Number.isFinite(q.level) ? String(q.level) : (q.name || "?").trim().charAt(0).toUpperCase());
    const fl = m.floors.length > 1 ? m.floors.map((q) => `<button class="ln fl ${scope === "floor" && q.id === f.id ? "on" : ""}" data-a="floor" data-v="${cesc(q.id)}" title="${cesc(q.name)}" aria-label="${cesc(q.name)}">${cesc(short(q))}</button>`).join("") : "";
    const home = m.levels.length > 1 ? `<button class="ln home ${scope === "house" ? "on" : ""}" data-a="gohome" title="${cesc(this._homeName())}" aria-label="${cesc(this._homeName())}"><ha-icon icon="mdi:home-outline"></ha-icon></button>` : "";
    return `<nav class="lnav">${menu}<div class="lfl">${fl}${home}</div></nav>`;
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
