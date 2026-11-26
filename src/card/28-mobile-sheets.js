// Mobile card: the page layer and its sheets (Navigator, appliance, overlay, item and issue lists) (#86).
Object.assign(DeviceFloorplanMobile.prototype, {
  /** The page layer is used on a dashboard (not in the card editor's preview). */
  _useLayer() {
    return !!this._huiRoot() && !this._config.inline_bar;
  },

  _layerEl() {
    if (!this._lay) {
      const el = document.createElement("div");
      el.setAttribute("data-dfm-layer", "");
      const sr = el.attachShadow({ mode: "open" });
      sr.innerHTML = `<style>${DFM_CSS}</style><div class="dfm lay"></div>`;
      sr.addEventListener("click", (e) => this._click(e));
      sr.addEventListener("change", (e) => this._change(e));
      sr.addEventListener("input", (e) => this._input(e));
      this._lay = el;
    }
    if (!this._lay.isConnected) document.body.appendChild(this._lay);
    return this._lay;
  },

  _renderLayer(html) {
    if (!html) {
      if (this._lay) this._lay.remove();
      return;
    }
    const el = this._layerEl();
    el.toggleAttribute("dark", this.hasAttribute("dark"));
    const host = el.shadowRoot.querySelector("div.lay");
    if (html !== this._layHtml) {
      this._layHtml = html;
      const tpl = document.createElement("div");
      tpl.innerHTML = html;
      dfmMorph(host, tpl);
    }
    for (const x of el.shadowRoot.querySelectorAll("[data-ent]")) {
      x.hass = this._hass;
      x.stateObj = this._hass.states[x.dataset.ent];
    }
  },

  /** 0.13.9.18: an appliance's details: picture, status, program, progress, time, door, power, energy, last run. */
  _applSheet(m, key) {
    const x = m.items.find((q) => q.ap && `${q.floor}|${q.item.id}` === key);
    if (!x) return "";
    const st = x.h._applState(x.ap);
    const ap = x.ap;
    const S = (e) => (e ? this._hass.states[e] : null);
    const pic = x.item.pic && x.item.pic.src ? x.h._picUrl(x.item.pic.src) : null;
    const pct = this._applPct(x, st);
    const row = (icon, label, val, eid) => (val ? `<button class="drow" ${eid ? `data-a="more" data-v="${cesc(eid)}"` : ""}><ha-icon icon="${icon}"></ha-icon><span>${cesc(label)}</span><b>${cesc(val)}</b></button>` : "");
    const rows = [
      row("mdi:list-status", dfT("mob.status"), [st.word, st.time].filter(Boolean).join(" · "), ap.status || ap.running),
      ap.program ? row("mdi:format-list-bulleted", dfT("mob.program"), this._fmtE(ap.program), ap.program) : "",
      ap.door && S(ap.door) ? row(S(ap.door).state === "on" ? "mdi:door-open" : "mdi:door-closed", dfT("mob.door"), this._fmtE(ap.door), ap.door) : "",
      st.w ? row("mdi:flash", dfT("mob.power"), st.w, ap.power) : "",
      ap.energy && S(ap.energy) ? row("mdi:lightning-bolt", dfT("mob.energy"), this._fmtE(ap.energy), ap.energy) : "",
      !st.active ? row("mdi:history", dfT("mob.last"), this._applLine(x, { ...st, active: false, phase: "idle" }), null) : "",
    ].join("");
    const done = st.phase === "done" ? `<button class="scb" data-a="appldone" data-v="${cesc(x.item.id)}"><ha-icon icon="mdi:check"></ha-icon>${dfT("appl.unloaded")}</button>` : "";
    const plug = ap.plug && S(ap.plug) && live(S(ap.plug)) ? `<button class="scb" data-a="tog" data-v="${cesc(ap.plug)}"><ha-icon icon="mdi:power"></ha-icon>${cesc(this._fmtE(ap.plug))}</button>` : "";
    return `<h3 class="sh"><span class="rtile"><ha-icon icon="${APPL_ICON[ap.type] || APPL_ICON.other}"></ha-icon></span>${cesc(x.name)}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3>
      <div class="apbig ${st.active ? "run" : ""}"${pct != null ? ` style="--p:${pct}"` : ""}>${pic ? `<img src="${cesc(pic)}" alt="">` : `<ha-icon icon="${APPL_ICON[ap.type] || APPL_ICON.other}"></ha-icon>`}${pct != null ? `<b>${Math.round(pct)}%</b>` : ""}</div>
      <div class="sub center">${cesc([this._roomName(x), this._applLine(x, st)].filter(Boolean).join(" · "))}</div>
      ${done || plug ? `<div class="scenes">${done}${plug}</div>` : ""}<div class="rcard">${rows}</div>
      <button class="srow" data-a="more" data-v="${cesc(x.lead || x.item.main_entity || "")}"><span class="rtile"><ha-icon icon="mdi:information-outline"></ha-icon></span><span class="txt"><span class="nm">${dfT("mob.details")}</span></span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
  },

  /** #85: the Navigator (the place pill): Home, then every floor with its rooms; where you are is marked. */
  _navSheet(m) {
    const s = this._s;
    const bell = this._issues(m).length;
    const many = m.rooms.length > 12;
    const homeRow = `<button class="srow nhome ${s.page === "house" || (s.page !== "room" && m.floors.length < 2) ? "cur" : ""}" data-a="gohome"><span class="rtile"><ha-icon icon="mdi:home"></ha-icon></span><span class="txt"><span class="nm">${cesc(this._homeName())}</span><span class="sub">${cesc(m.people.length ? dfT("mob.k_of_n_home", { k: m.people.filter((p) => p.home).length, n: m.people.length }) : "")}</span></span>${bell ? `<span class="bell"><ha-icon icon="mdi:bell-outline"></ha-icon><b>${bell}</b></span>` : ""}<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
    const floors = m.floors.map((f) => {
      const rs = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
      const curF = f.id === s.floor;
      const open = curF || !many;
      const head = m.floors.length > 1 || rs.length < 2 ? `<button class="nfloor ${curF && !["room", "house"].includes(s.page) ? "cur" : ""}" data-a="sheet-floor" data-v="${cesc(f.id)}"><span>${cesc(f.name)}</span><small>${cesc(dfT("mob.n_rooms", { n: rs.length }))}</small><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : "";
      const rows = open && rs.length > 1 ? rs.map((r) => `<button class="srow nroom ${s.page === "room" && s.room === r.id && curF ? "cur" : ""}" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rtile"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="txt"><span class="nm">${cesc(r.name)}</span><span class="sub">${cesc(this._vals(r))}</span></span><span class="bds inl">${this._badges(m, r)}</span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`).join("") : "";
      return `${head}${rows}`;
    }).join("");
    return `${homeRow}${floors}`;
  },

  _sheetHtml(m) {
    const sh = this._sheet;
    let body = "";
    if (sh.step === "nav") body = this._navSheet(m);
    else if (sh.step === "appl") body = this._applSheet(m, sh.key);
    else if (sh.step === "issues") {
      body = `<h3>${dfT("mob.needs_look")}</h3>${this._issues(m).map((i) => i.x ? this._row(i.x, { room: this._roomName(i.x) }) : `<button class="srow" data-a="room" data-v="${cesc(`${i.room.floor}|${i.room.id}`)}"><span class="rtile"><ha-icon icon="mdi:air-filter"></ha-icon></span><span class="txt"><span class="nm">${cesc(`${i.txt} · ${i.room.name}`)}</span><span class="sub">${cesc(i.st)}</span></span></button>`).join("")}`;
    } else if (sh.step === "ov") {
      body = this._ovSheet(m, sh.ov);
    } else if (sh.step === "items") {
      // #64: the floor's openings / shutters / alarms, from the bar under the plan.
      const list = this._floorItems(m, sh.floor, sh.kind);
      body = `<h3>${cesc(sh.title || "")}</h3>${list.map((x) => this._row(x, { room: this._roomName(x) })).join("") || `<p class="empty">${dfT("mob.quiet")}</p>`}`;
    }
    return `<div class="scrim" data-a="close"></div><div class="sheet" data-scroll="sheet"><i class="grab"></i>${body}</div>`;
  },

  /** #49 / #60: an overlay as controls (no plan): its scenes and actions from the main card, then its devices by room. */
  _ovSheet(m, o) {
    const f = m.floors.find((q) => q.id === this._s.floor) || m.floors[0];
    const b = this._base || {};
    const title = o === "people" ? OVERLAYS.people.label : this._ovLabel(o, f);
    const icon = o === "people" ? OVERLAYS.people.icon : this._ovIcon(o, f);
    let top = "";
    if (o === "lights") {
      const L = { all_off: true, all_on: false, scenes: [], ...(b.lights || {}) };
      const pids = m.floors.map((q) => q.id);
      const btn = (v, ic, t) => `<button class="scb" data-a="scene" data-v="${v}"><ha-icon icon="${ic}"></ha-icon>${cesc(t)}</button>`;
      top = [L.all_on ? btn("all_on", "mdi:lightbulb-on-outline", dfT("scene.all_on")) : "", L.all_off ? btn("all_off", "mdi:lightbulb-off-outline", dfT("scene.all_off")) : "",
        ...(L.scenes || []).map((sc, i) => (Array.isArray(sc.plans) && sc.plans.length && !sc.plans.some((x) => pids.includes(x)) ? "" : btn(i, sc.icon || "mdi:palette-outline", sc.name || dfT("scene.n", { n: i + 1 }))))].join("");
    }
    const acts = (Array.isArray(b.overlay_actions) ? b.overlay_actions : []).map((x, i) => [x, i]).filter(([x]) => (x.overlay || "cleaning") === o)
      .map(([x, i]) => `<button class="scb" data-a="oact" data-v="${i}"><ha-icon icon="${cesc(x.icon || "mdi:gesture-tap")}"></ha-icon>${cesc(x.name || dfT("action"))}</button>`).join("");
    let list = "";
    if (o === "appl") {
      return `<h3 class="sh"><span class="rtile"><ha-icon icon="mdi:washing-machine"></ha-icon></span>${dfT("mob.appliances")}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3><div class="gridw">${m.items.filter((x) => x.ap).map((x) => this._applTile(x)).join("")}</div>`;
    }
    if (o === "people") list = this._peopleHtml(m.people);
    else if (o === "energy") {
      const rs = m.rooms.filter((r) => r.power >= 1).sort((a, c) => c.power - a.power);
      const total = m.items.reduce((t, x) => t + (x.power || 0), 0);
      list = `<div class="big">${cesc(fmtW(total))}<small>${dfT("mob.measured")}</small></div>${rs.map((r) => {
        const top1 = r.items.filter((x) => x.power).sort((a, c) => c.power - a.power)[0];
        return `<button class="srow" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rtile"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="txt"><span class="nm"><span class="t">${cesc(r.name)}</span></span><span class="sub">${cesc(top1 ? `${top1.name} · ${fmtW(top1.power)}` : "")}</span></span><span class="val">${cesc(fmtW(r.power))}</span></button>`;
      }).join("")}`;
    } else {
      const mem = this._list(o, m.items);
      const byRoom = new Map();
      for (const x of mem) {
        const k = `${x.floor}|${x.room || ""}`;
        if (!byRoom.has(k)) byRoom.set(k, []);
        byRoom.get(k).push(x);
      }
      list = [...byRoom.entries()].map(([k, xs]) => {
        const [fid, rid] = k.split("|");
        const r = rid && m.rooms.find((q) => q.id === rid && q.floor === fid);
        const tg = xs.filter((x) => x.st && DFM_TOGGLE.has(domainOf(x.lead)) && !x.offline);
        const onN = tg.filter((x) => x.on).length;
        const master = o === "lights" && tg.length > 1 ? `<button class="rmaster ${onN ? "on" : ""}" data-a="rmaster" data-v="${cesc(tg.map((x) => x.lead).join(","))}" data-on="${onN ? 1 : 0}">${onN}/${tg.length}<i></i></button>` : "";
        return `<div class="rcard"><div class="rch"><span class="rtile"><ha-icon icon="${cesc(r ? r.icon : "mdi:help-circle-outline")}"></ha-icon></span><b>${cesc(r ? r.name : dfT("mob.no_room"))}</b>${master}</div>${xs.map((x) => this._row(x)).join("")}</div>`;
      }).join("") || `<div class="none">${dfT("mob.nothing")}</div>`;
    }
    return `<h3 class="sh"><span class="rtile" style="color:${DFM_OVC[o] || "inherit"}"><ha-icon icon="${cesc(icon)}"></ha-icon></span>${cesc(title)}<button class="x" data-a="close" aria-label="${dfT("close")}"><ha-icon icon="mdi:close"></ha-icon></button></h3>${top || acts ? `<div class="scenes">${top}${acts}</div>` : ""}${list}`;
  },
});
