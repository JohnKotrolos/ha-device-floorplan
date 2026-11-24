Object.assign(DeviceFloorplanCard.prototype, {

  /** Zigbee: each device's best parent (strongest link to a router / the coordinator). */
  _zbParents() {
    const out = {};
    if (!this._zha) return out;
    const by = this._zha.byIeee || {};
    for (const l of this._zha.links || []) {
      const pr = by[l.b];
      if (!pr || !(pr.role === "router" || pr.role === "coordinator")) continue;
      if ((by[l.a] || {}).role === "coordinator") continue;
      if (!out[l.a] || l.lqi > out[l.a].lqi) out[l.a] = { p: l.b, lqi: l.lqi };
    }
    return out;
  },

  /** Path from the top (coordinator / hub) to this device, as names. */
  _chain(s) {
    const names = [s.name];
    const specsByIeee = {};
    for (const x of this._specs.values()) if (x.ieee) specsByIeee[ieeeKey(x.ieee)] = x;
    const parents = this._zbParents();
    let cur = s;
    for (let i = 0; i < 6; i++) {
      let up = null;
      if (cur.item.via && this._specs.get(cur.item.via)) up = this._specs.get(cur.item.via);
      else if (cur.ieee && parents[ieeeKey(cur.ieee)]) {
        const pk = parents[ieeeKey(cur.ieee)].p;
        up = specsByIeee[pk] || { name: (this._zha.byIeee[pk] || {}).role === "coordinator" ? dfT("role.coordinator") : dfT("net.router"), item: {}, last: true };
      }
      if (!up || names.includes(up.name)) break;
      names.unshift(up.name);
      if (up.last) break;
      cur = up;
    }
    return names;
  },

  /** Devices connected through this one: via a hub/bridge, or Zigbee children (best parent). */
  _children(s) {
    const out = [];
    const parents = this._zbParents();
    const me = s.ieee ? ieeeKey(s.ieee) : null;
    for (const x of this._specs.values()) {
      if (x === s || x.type !== "net") continue;
      if (x.item.via === s.item.id) out.push(x);
      else if (me && x.ieee && parents[ieeeKey(x.ieee)] && parents[ieeeKey(x.ieee)].p === me) out.push(x);
    }
    // Devices of this hub that aren't on the plan (or on another floor): names only.
    const placed = new Set(out.map((x) => x.item.id));
    const extra = [];
    for (const f of this._floors()) {
      if (f.id === this._floor) continue;
      for (const [id, d] of Object.entries(f.sensor.attributes.devices || {})) if (d.via === s.item.id && !placed.has(id)) extra.push(`${d.name} (${f.name})`);
    }
    return { out, extra };
  },

  _moreInfo(eid) {
    if (!eid) return;
    this._popup = null;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
    this._update(true);
  },

  _openList(s) {
    this._popup = { type: "list", key: s.key };
    this._update(true);
  },

  _openReadings(s) {
    // 0.12.11: the popup charts what the marker shows: its own values (for a chip, where its numbers come from)
    // and every reading picked in "Also shows".
    const core = s.core || s.ents;
    const extra = s.ents.filter((e) => !core.includes(e));
    const vals = s.src ? [s.src.t, s.src.h].filter(Boolean) : core;
    this._popup = { type: "readings", key: s.key, ents: [...new Set([...(vals.length ? vals : core), ...extra])], lead: s.eid || core[0] };
    this._hist = null;
    this._update(true);
  },

  _popupHtml() {
    const p = this._popup || this._previewPop();
    this._prevShown = !this._popup && !!p;
    if (!p) return "";
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    if (p.type === "confirm") {
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${dfT("scene.all_off")}"><h3>${dfT("alloff.q")}${close}</h3><div>${p.n ? dfT("alloff.n_on", { n: p.n }) : dfT("alloff.none")}</div><div class="acts"><button data-close="1">${dfT("cancel")}</button><button class="pri" data-confirm="1">${dfT("scene.all_off")}</button></div></div></div>`;
    }
    if (p.type === "info") return this._infoHtml(p);
    if (p.type === "elist") {
      const es = this._specs && this._specs.get(p.key);
      if (!es) return "";
      const f = (v) => (es.unit === "W" ? fmtW(v) : fmtKwh(v));
      return `<div class="pop"><div class="popin"><h3>${cesc(es.name)}${close}</h3><div class="list">${es.elist.map((x) => `<button data-mi="${cesc(x.ent)}">${cesc(x.name)}<small>${cesc(f(x.v))}</small></button>`).join("")}</div><div class="rbhint">${dfT("phantom.place_hint")}</div></div></div>`;
    }
    if (p.type === "robot") return this._robotPop(p);
    if (p.type === "room") return this._roomPop(p);
    if (p.type === "appl") {
      const list = (this._appls || []).filter((o) => p.keys.includes(o.ap.item.id));
      if (!list.length) return "";
      const rows = list.map(({ ap, st }) => {
        const lead = ap.status || ap.running || ap.power || ap.plug || ap.item.main_entity;
        const sub = [st.word, st.time, st.w].filter(Boolean).join(" · ");
        const done = st.phase === "done" ? `<button class="mini" data-appldone="${cesc(ap.item.id)}">${dfT("appl.unloaded")}</button>` : "";
        return `<div class="arow"><button data-mi="${cesc(lead)}"><span class="ad" style="--ac:${st.col || "150,150,150"}"></span><span class="nm">${cesc(ap.item.name)}<small>${cesc(sub)}</small></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>${done}</div>`;
      }).join("");
      const title = list.length > 1 ? dfT("appl.appliances") : list[0].ap.item.name;
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(title)}"><h3>${cesc(title)}${close}</h3><div class="alist">${rows}</div></div></div>`;
    }
    const s = this._specs && this._specs.get(p.key);
    if (!s) return "";
    if (p.type === "list") {
      const lents = s.also && s.also.length ? [s.eid, ...s.also] : s.ents;
      return `<div class="pop"><div class="popin"><h3>${cesc(s.name)}${close}</h3><div class="list">${lents.map((e) => {
        return `<button data-mi="${cesc(e)}">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}</small></button>`;
      }).join("")}</div></div></div>`;
    }
    if (p.type === "covers") {
      const row = (e) => {
        const st = this._hass.states[e];
        if (!st) return "";
        const f = Number(st.attributes.supported_features || 0);
        const pos = st.attributes.current_position;
        const slider = f & 4 && pos != null ? `<input type="range" min="0" max="100" step="5" value="${Number(pos)}" data-covpos="${cesc(e)}" aria-label="${dfT("cover.position")}">` : "";
        return `<div class="cov"><span class="nm">${cesc(entName(this._hass, e))}<small>${cesc(this._fmt(e))}${pos != null ? ` · ${pos}%` : ""}</small></span>${slider}<button data-cov="${cesc(e)}" data-cmd="open" aria-label="${dfT("cover.open")}"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="stop" aria-label="${dfT("cover.stop")}"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="${cesc(e)}" data-cmd="close" aria-label="${dfT("cover.close")}"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>`;
      };
      const cents = p.ents || s.ents.filter((e) => domainOf(e) === "cover");
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3>${cesc(s.name)}${close}</h3><div>${cents.map(row).join("")}</div>${cents.length > 1 ? `<div class="covall">${dfT("cover.all")}<button data-cov="__all" data-cmd="open" aria-label="${dfT("cover.open_all")}"><ha-icon icon="mdi:arrow-up"></ha-icon></button><button data-cov="__all" data-cmd="stop" aria-label="${dfT("cover.stop_all")}"><ha-icon icon="mdi:stop"></ha-icon></button><button data-cov="__all" data-cmd="close" aria-label="${dfT("cover.close_all")}"><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>` : ""}</div></div>`;
    }
    if (p.type === "net") {
      const rows = [[dfT("net.connection"), s.conns.map((cn) => CONNS[cn].label).join(" + ")], [dfT("net.role"), (ROLES[s.role] || ROLES.device).label]];
      const chain = this._chain(s);
      if (chain.length > 1) rows.push([dfT("net.path"), chain.join(" → ")]);
      if (s.z && s.z.lqi != null) rows.push(["LQI", String(s.z.lqi)]);
      if (s.z && s.z.rssi != null) rows.push(["RSSI", `${s.z.rssi} dBm`]);
      if (s.sigEid) rows.push([dfT("net.signal"), this._fmt(s.sigEid)]);
      if (s.rt) {
        const ap = this._a.aps && this._specs.get(this._a.aps[s.rt.ap]);
        if (!s.rt.home) rows.push([dfT("net.router"), dfT("net.not_connected")]);
        else {
          rows.push([dfT("net.ap"), ap ? ap.name : s.rt.ap || "—"]);
          rows.push([dfT("net.link"), s.rt.lan ? dfT("net.cable_lan") : "Wi-Fi"]);
          if (s.rt.ssid) rows.push([dfT("net.wifi_net"), s.rt.ssid]);
        }
        if (s.rt.ip) rows.push(["IP", s.rt.ip]);
      }
      if (s.role === "ap") {
        const mine = Object.entries(this._a.aps || {}).filter(([, k]) => k === s.key).map(([n]) => n);
        let w = 0, c = 0;
        for (const x of this._specs.values()) if (x.rt && x.rt.home && mine.includes(x.rt.ap)) x.rt.lan ? c++ : w++;
        if (w + c) rows.push([dfT("net.connected_here"), [w ? `${w} Wi-Fi` : "", c ? `${c} ${dfT("net.cable")}` : ""].filter(Boolean).join(", ") + ` (${dfT("net.on_floor")})`]);
      }
      if (s.item.parts && s.item.parts.length) rows.push([dfT("net.includes"), s.item.parts.join(", ")]);
      const parent = s.item.via && this._specs.get(s.item.via);
      if (parent) rows.push([dfT("net.through_k"), parent.name]);
      const none = !(s.z && (s.z.lqi != null || s.z.rssi != null)) && !s.sigEid && !s.rt;
      const hint = none ? `<div style="font-size:12px;color:var(--secondary-text-color)">${s.conns.includes("zigbee") ? dfT("net.no_lqi") : dfT("net.no_signal")}</div>` : "";
      const kids = this._children(s);
      const conn = kids.out.length || kids.extra.length
        ? `<h4>${dfT("net.connected_devices", { n: kids.out.length + kids.extra.length })}</h4><div class="conn-list">${kids.out.map((x) => `<button data-hl="${cesc(x.key)}">${cesc(x.name)}<small>${cesc(this._chain(x).join(" → "))}</small></button>`).join("")}${kids.extra.map((n) => `<button disabled>${cesc(n)}<small>${dfT("net.not_on_floor")}</small></button>`).join("")}</div>`
        : "";
      return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(s.name)}"><h3><ha-icon icon="${cesc(s.icon)}"></ha-icon>${cesc(s.name)}${close}</h3><div class="kv">${rows.map(([k, v]) => `<span>${cesc(k)}</span><span>${cesc(v)}</span>`).join("")}</div>${hint}${conn}${s.ents[0] ? `<button class="more" data-mi="${cesc(s.ents[0])}">${dfT("details_more")}</button>` : ""}</div></div>`;
    }
    return this._rdHtml(s, p, close);
  },

  /** 0.12.10: the readings popup. Temperature and humidity share one chart; a marker of several devices (a phantom,
   *  a bond) shows its total first, then one row per device; a row opens that device's own chart. */
  _rdHtml(s, p, close) {
    const hass = this._hass;
    const groups = this._rdGroups(s, p.ents && p.ents.length ? p.ents : s.ents || []);
    const multi = groups.length > 1;
    const sub = multi && p.sub ? groups.find((g) => g.id === p.sub) : null;
    const view = multi && !sub ? null : sub || groups[0];
    this._rdCharts = [];
    const chart = (t, h, mode, small) => {
      this._rdCharts.push({ t, h, mode });
      const i = this._rdCharts.length - 1;
      return small ? `<svg class="rcs" data-rc="${i}" viewBox="0 0 100 28" preserveAspectRatio="none"></svg>` : `<div class="rc" data-rc="${i}"><svg viewBox="0 0 320 150"></svg><div class="rctip"></div><div class="rcl"></div></div>`;
    };
    const tv = (e) => (domainOf(e) === "climate" ? (hass.states[e] && hass.states[e].attributes.current_temperature != null ? `${this._num1(hass.states[e].attributes.current_temperature)} ${hass.states[e].attributes.temperature_unit || (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || "°C"}` : "—") : this._fmtNum(e));
    const now = (g, cls = "rcnow") => `<div class="${cls}">${g.t ? `<span class="t">${cesc(tv(g.t))}</span>` : ""}${g.h ? `<span class="h">${cesc(this._hv(g.h))}</span>` : ""}</div>`;
    const one = (e) => {
      const st = hass.states[e];
      const k = domainOf(e) === "climate" ? "temperature" : kindOf(e, st);
      const icon = { temperature: "mdi:thermometer", humidity: "mdi:water-percent", battery: "mdi:battery", signal: "mdi:signal" }[k] || "mdi:chart-line";
      const label = { temperature: dfT("temperature"), humidity: dfT("humidity"), battery: dfT("battery"), signal: dfT("net.signal") }[k] || this._shortName(s.item, e, s.name);
      const big = domainOf(e) === "climate" && st ? this._attrVal(st, "current_temperature") : this._fmtNum(e);
      return `<div class="rd" data-hist="${cesc(e)}"><div class="top"><ha-icon icon="${icon}"></ha-icon>${cesc(label)}<span class="big">${cesc(big)}</span></div><svg viewBox="0 0 300 56" preserveAspectRatio="none"></svg><div class="mm"><span>${dfT("time.ago", { t: dfT("unit.h", { n: 24 }) })}</span><span class="range"></span><span>${dfT("time.now")}</span></div><button class="more" data-mi="${cesc(e)}">${dfT("details_more")}</button></div>`;
    };
    // One button per charted entity; named by its device where a kind has several lines.
    const det = (g) => [...new Set([p.lead, ...g.ts, ...g.hs].filter(Boolean).map((e) => e.replace(/#h$/, "")))].map((e) => {
      const kd = domainOf(e) === "climate" ? "" : kindOf(e, hass.states[e]) === "temperature" ? "temperature" : "humidity";
      const many = kd && (kd === "temperature" ? g.ts : g.hs).length > 1;
      const lab = !kd ? dfT("details") : many ? `${this._rdName(e)} · ${dfT(kd + "_l")}` : dfT(kd + "_details");
      return `<button class="more" data-mi="${cesc(e)}">${cesc(lab)} ›</button>`;
    }).join("");
    let body;
    if (!view) {
      // The total, worked out as the marker works it out (average, lowest, highest, one sensor).
      const mode = this._dev(s.item.id).value || (s.item.phantom && s.item.value) || this._ov("comfort").combine || "average";
      const ts = groups.map((g) => g.t).filter(Boolean);
      const hs = groups.map((g) => g.h).filter(Boolean);
      // 0.13.2: the icon the user gave it, else what it measures (no ghost: the ghost only marks phantoms in the Editor).
      const phIcon = s.icon || this._dev(s.item.id).icon || (s.item.icon && s.item.icon !== "dfp:phantom" ? s.item.icon : ts.length ? "mdi:thermometer" : "mdi:water-percent");
      const sum = `<div class="phsum">${s.phantom ? `<ha-icon icon="${cesc(phIcon)}"></ha-icon>` : ""}<b>${cesc((s.lines || []).join(" · "))}</b><small>${cesc({ min: dfT("ph.lowest"), max: dfT("ph.highest"), one: dfT("ph.one") }[mode] || dfT("ph.average"))} · ${dfT("n_devices", { n: groups.length })}</small></div>`;
      const rows = groups.map((g) => `<button class="rcrow" data-rdsub="${cesc(g.id)}"><span class="nm">${cesc(g.name)}${g.t || g.h ? now(g, "rcv") : `<small>${cesc(g.ents.map((e) => this._fmt(e)).join(" · "))}</small>`}</span>${g.t || g.h ? chart(g.t ? [g.t] : [], g.h ? [g.h] : [], "one", true) : ""}<span class="go">›</span></button>`).join("");
      body = `${sum}${ts.length || hs.length ? chart(ts, hs, mode) : ""}<div class="rclist">${rows}</div>`;
    } else {
      const back = sub ? `<button class="rcback" data-rdsub="">‹ ${cesc(s.name)}</button>` : "";
      const tH = view.t || view.h ? `${now(view)}${chart(view.ts, view.hs, "each")}<div class="rcdet">${det(view)}</div>` : "";
      body = `${back}${tH}${view.other.map(one).join("")}`;
    }
    const title = sub ? sub.name : s.name;
    return `<div class="pop"><div class="popin" role="dialog" aria-label="${cesc(title)}"><h3>${cesc(title)}${close}</h3>${body}</div></div>`;
  },

  /** The devices behind a readings marker: a phantom's members, otherwise HA's devices of its entities. Each with its
   *  temperature (t), humidity (h) and other readings. */
  _rdGroups(s, ents) {
    const hass = this._hass;
    const item = s.item;
    const by = new Map();
    for (const e of ents) {
      let g = item.byMember ? (item.members || []).find((m) => (item.byMember[m] || []).includes(e)) : null;
      if (!g) {
        const r = (hass.entities || {})[e];
        g = (r && r.device_id) || e;
      }
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(e);
    }
    if (!item.byMember && by.size > 1 && !item.bond) return [{ id: item.id, name: s.name, ...this._rdSplit([...ents]) }];
    const devs = (this._a && this._a.devices) || {};
    return [...by].map(([g, es]) => {
      const dv = (hass.devices || {})[g];
      const name = (devs[g] && devs[g].name) || (dv && (dv.name_by_user || dv.name)) || entName(hass, es[0]);
      return { id: g, name, ...this._rdSplit(es) };
    });
  },

  /** A chart line's name: its device (an AC, a room thermometer), else the entity's name. */
  _rdName(e) {
    const hass = this._hass;
    const id = e.replace(/#h$/, "");
    const reg = (hass.entities || {})[id];
    const dv = reg && reg.device_id && (hass.devices || {})[reg.device_id];
    return (dv && (dv.name_by_user || dv.name)) || entName(hass, id);
  },

  /** A humidity value; "climate.x#h" = the thermostat's own humidity. */
  _hv(e) {
    if (!e.endsWith("#h")) return this._fmtNum(e);
    const st = this._hass.states[e.slice(0, -2)];
    return st && Number(st.attributes.current_humidity) > 0 ? `${Math.round(Number(st.attributes.current_humidity))}%` : "—";
  },

  _rdSplit(es) {
    const hass = this._hass;
    const k = (e) => (e.endsWith("#h") ? "humidity" : domainOf(e) === "climate" ? "temperature" : kindOf(e, hass.states[e]));
    const ts = es.filter((e) => k(e) === "temperature");
    const hs = es.filter((e) => k(e) === "humidity");
    // t / h: the first of each (the marker's own value comes first); ts / hs: all of them, all charted.
    return { t: ts[0] || null, h: hs[0] || null, ts, hs, ents: es, other: es.filter((e) => !ts.includes(e) && !hs.includes(e)) };
  },

  /** 24 h history sparklines for the readings popup. */
  async _fillHistory() {
    const p = this._popup;
    if (!p || p.type !== "readings") return;
    if (!this._hist || this._hist.key !== p.key) {
      const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const data = {};
      const plain = p.ents.filter((e) => domainOf(e) !== "climate");
      const clim = p.ents.filter((e) => domainOf(e) === "climate");
      try {
        if (plain.length) Object.assign(data, await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: plain, minimal_response: true, no_attributes: true, significant_changes_only: false }));
        // Thermostats keep their room temperature in an attribute.
        if (clim.length) {
          const base = [...new Set(clim.map((e) => e.replace(/#h$/, "")))];
          const res = await this._hass.callWS({ type: "history/history_during_period", start_time: start, entity_ids: base, minimal_response: false, no_attributes: false, significant_changes_only: false });
          for (const e of clim) {
            const at = e.endsWith("#h") ? "current_humidity" : "current_temperature"; // 0.12.10: its humidity too
            data[e] = ((res || {})[e.replace(/#h$/, "")] || []).map((r) => ({ s: r.a ? r.a[at] : null, lu: r.lu || r.lc }));
          }
        }
      } catch (_e) {
        /* no history: the popup still shows the current values */
      }
      this._hist = { key: p.key, data };
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-hist]")) {
      const eid = el.dataset.hist;
      const rows = (this._hist.data[eid] || []).map((r) => ({ t: (r.lu || r.lc || 0) * 1000, v: Number(r.s) })).filter((r) => Number.isFinite(r.v) && r.t);
      const svg = el.querySelector("svg");
      if (rows.length < 2) {
        svg.innerHTML = domainOf(eid) === "climate" ? "" : `<text x="150" y="32" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${dfT("hist.not_enough")}</text>`;
        continue;
      }
      const t0 = Date.now() - 24 * 3600 * 1000;
      const min = Math.min(...rows.map((r) => r.v));
      const max = Math.max(...rows.map((r) => r.v));
      const span = max - min || 1;
      const pts = rows.map((r) => `${(((Math.max(r.t, t0) - t0) / (24 * 3600 * 1000)) * 300).toFixed(1)},${(52 - ((r.v - min) / span) * 46).toFixed(1)}`);
      pts.push(`300,${pts[pts.length - 1].split(",")[1]}`);
      svg.innerHTML = `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--dfc-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      const unit = (this._hass.states[eid] && this._hass.states[eid].attributes.unit_of_measurement) || "";
      el.querySelector(".range").textContent = `${Math.round(min * 10) / 10}–${Math.round(max * 10) / 10} ${unit}`;
    }
    for (const el of this.shadowRoot.querySelectorAll("[data-rc]")) this._drawRc(el, (this._rdCharts || [])[Number(el.dataset.rc)]);
  },

  /** 0.12.10: one 24 h series on a 10-minute grid (the value then), or several combined as the marker combines them. */
  _rdSeries(eids, mode) {
    const N = 145;
    const t0 = Date.now() - 24 * 3600 * 1000;
    const step = (24 * 3600 * 1000) / (N - 1);
    const one = (eid) => {
      const rows = ((this._hist && this._hist.data[eid]) || []).map((r) => ({ t: (r.lu || r.lc || 0) * 1000, v: Number(r.s) })).filter((r) => r.t && Number.isFinite(r.v)).sort((a, b) => a.t - b.t);
      const out = [];
      let j = -1;
      for (let i = 0; i < N; i++) {
        const t = t0 + i * step;
        while (j + 1 < rows.length && rows[j + 1].t <= t) j++;
        out.push(j >= 0 ? rows[j].v : null);
      }
      return out;
    };
    const all = eids.map(one);
    if (!all.length) return null;
    const res = all[0].map((_v, i) => {
      const vs = all.map((a) => a[i]).filter((v) => v != null);
      if (!vs.length) return null;
      if (mode === "min") return Math.min(...vs);
      if (mode === "max") return Math.max(...vs);
      if (mode === "one") return all[0][i];
      return vs.reduce((a, b) => a + b, 0) / vs.length;
    });
    return res.filter((v) => v != null).length >= 2 ? res : null;
  },

  /** 0.12.10: temperature (left axis) and humidity (right axis) in one chart; touch it for the values at a time.
   *  Colours and text follow the theme (--dfc-rt / --dfc-rh can be set, e.g. with card-mod). */
  _drawRc(el, def) {
    if (!def) return;
    const hass = this._hass;
    const unitOf = (eids, dflt) => {
      const st = eids[0] && hass.states[eids[0]];
      if (eids[0] && eids[0].endsWith("#h")) return "%";
      if (st && domainOf(eids[0]) === "climate") return (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || "°C";
      return (st && st.attributes.unit_of_measurement) || dflt;
    };
    const ser = [];
    const add = (eids, c, dflt, d) => {
      const each = def.mode === "each" ? eids.map((e) => [e]) : [eids];
      each.forEach((es, n) => {
        const v = this._rdSeries(es, def.mode === "each" ? "one" : def.mode);
        if (v) ser.push({ v, c, u: unitOf(es, dflt), d, dash: n > 0, nm: each.length > 1 ? this._rdName(es[0]) : "" });
      });
    };
    add(def.t, "var(--dfc-rt)", "°C", 1);
    add(def.h, "var(--dfc-rh)", "%", 0);
    const small = el.tagName.toLowerCase() === "svg";
    const svg = small ? el : el.querySelector("svg");
    if (!ser.length) {
      svg.innerHTML = small ? "" : `<text x="160" y="80" text-anchor="middle" font-size="12" fill="currentColor" opacity=".6">${dfT("hist.not_enough")}</text>`;
      return;
    }
    const W = small ? 100 : 320;
    const x0 = small ? 0 : 34;
    const axes = [...new Set(ser.map((x) => x.c))].map((c) => ser.find((x) => x.c === c));
    const x1 = small ? 100 : axes.length > 1 ? 286 : 312;
    const y0 = small ? 3 : 12;
    const y1 = small ? 25 : 120;
    const N = ser[0].v.length;
    const X = (i) => x0 + (i / (N - 1)) * (x1 - x0);
    const kinds = [...new Set(ser.map((x) => x.c))];
    for (const c of kinds) {
      const same = ser.filter((x) => x.c === c);
      const vs = same.flatMap((x) => x.v).filter((v) => v != null);
      const min = Math.min(...vs);
      const max = Math.max(...vs);
      const pad = (max - min) * 0.12 || 0.5;
      for (const s0 of same) {
        s0.lo = min - pad;
        s0.hi = max + pad;
        s0.Y = (v) => y1 - ((v - s0.lo) / (s0.hi - s0.lo)) * (y1 - y0);
      }
    }
    for (const s0 of ser) {
      const vs = s0.v.filter((v) => v != null);
      s0.min = Math.min(...vs);
      s0.max = Math.max(...vs);
    }
    // Smooth lines (Catmull-Rom as curves), broken where there is no value.
    const path = (s0) => {
      const P = s0.v.map((v, i) => (v == null ? null : [X(i), s0.Y(v)]));
      let d = "";
      for (let i = 0; i < N; i++) {
        if (!P[i]) continue;
        if (!P[i - 1]) {
          d += `M${P[i][0].toFixed(1)},${P[i][1].toFixed(1)}`;
          continue;
        }
        const a = P[i - 2] || P[i - 1];
        const b = P[i - 1];
        const c = P[i];
        const e = P[i + 1] || c;
        d += `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
      }
      return d;
    };
    const fmt = (s0, v) => `${(Math.round(v * (s0.d ? 10 : 1)) / (s0.d ? 10 : 1)).toLocaleString(hass.locale && hass.locale.language)}${s0.u === "%" ? "%" : "°"}`;
    if (small) {
      svg.innerHTML = ser.map((s0) => `<path d="${path(s0)}" fill="none" stroke="${s0.c}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`).join("");
      return;
    }
    const gid = `rcg${Math.random().toString(36).slice(2, 8)}`;
    const first = ser[0];
    const fi = first.v.findIndex((v) => v != null);
    const li = N - 1 - [...first.v].reverse().findIndex((v) => v != null);
    const area = `${path(first)}L${X(li).toFixed(1)},${y1}L${X(fi).toFixed(1)},${y1}Z`;
    const grid = [0, 0.5, 1].map((f) => {
      const y = y1 - f * (y1 - y0);
      const lab = (s0, x, anchor) => `<text x="${x}" y="${(y + 3.5).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="${s0.c}">${cesc(fmt(s0, s0.lo + f * (s0.hi - s0.lo)))}</text>`;
      return `<line x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/>${lab(axes[0], x0 - 4, "end")}${axes[1] ? lab(axes[1], x1 + 4, "start") : ""}`;
    }).join("");
    const t0 = Date.now() - 24 * 3600 * 1000;
    const hm = (ms) => new Date(ms).toLocaleTimeString(hass.locale && hass.locale.language, { hour: "2-digit", minute: "2-digit" });
    const times = [0, 0.5, 1].map((f) => `<text x="${(x0 + f * (x1 - x0)).toFixed(1)}" y="140" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}" font-size="10" fill="currentColor" opacity=".6">${f === 1 ? dfT("time.now") : dfT("time.ago", { t: dfT("unit.h", { n: f ? 12 : 24 }) })}</text>`).join("");
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${first.c};stop-opacity:.28"/><stop offset="1" style="stop-color:${first.c};stop-opacity:0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#${gid})"/>${ser.map((s0) => `<path d="${path(s0)}" fill="none" stroke="${s0.c}" stroke-width="2.2" stroke-linecap="round"${s0.dash ? ' stroke-dasharray="5 4"' : ""}/>`).join("")}${times}<line class="cx" y1="${y0}" y2="${y1}" stroke="currentColor" stroke-opacity=".35" visibility="hidden"/>${ser.map((s0, k) => `<circle class="cd${k}" r="3.5" fill="${s0.c}" stroke="var(--card-background-color, #fff)" stroke-width="1.5" visibility="hidden"/>`).join("")}`;
    el.querySelector(".rcl").innerHTML = ser.map((s0) => `<span class="${s0.dash ? "dash" : ""}" style="--c:${s0.c}">${s0.nm ? `${cesc(s0.nm)} ` : ""}${cesc(fmt(s0, s0.min))}–${cesc(fmt(s0, s0.max))}</span>`).join("");
    // Touch / hover: the values at that time.
    const tip = el.querySelector(".rctip");
    const cx = svg.querySelector(".cx");
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const fx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(N - 1, Math.round(((fx - x0) / (x1 - x0)) * (N - 1))));
      const x = X(i);
      cx.setAttribute("x1", x);
      cx.setAttribute("x2", x);
      cx.setAttribute("visibility", "visible");
      const parts = [];
      ser.forEach((s0, k) => {
        const dot = svg.querySelector(`.cd${k}`);
        const v = s0.v[i];
        if (v == null) return dot.setAttribute("visibility", "hidden");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", s0.Y(v));
        dot.setAttribute("visibility", "visible");
        parts.push(`<b style="color:${s0.c}">${cesc(fmt(s0, v))}</b>`);
      });
      tip.innerHTML = `${cesc(hm(t0 + (i / (N - 1)) * 24 * 3600 * 1000))} · ${parts.join(" · ")}`;
      tip.style.left = `${Math.max(12, Math.min(88, (x / W) * 100))}%`;
      tip.style.visibility = "visible";
    };
    const hide = () => {
      cx.setAttribute("visibility", "hidden");
      for (const d of svg.querySelectorAll("circle")) d.setAttribute("visibility", "hidden");
      tip.style.visibility = "hidden";
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", hide);
  },

  _setOverlay(o) {
    if (o === "plan" || o === "people") o = "live"; // 0.7.4: Plan is gone, 0.8.2: People too (people are in Live)
    if (!this._ovDef(o)) return;
    // 0.11.1: in Replay another overlay keeps the replay time (its history is loaded); Energy / Network end Replay.
    const rpKeep = this._rp && this._rp.mode && this._dockShown && !RP_SKIP.has(o);
    if (this._rp && !rpKeep) {
      if (this._rp.mode) this._rp.mode = false;
      this._rpLive(false);
    }
    if (rpKeep) setTimeout(() => this._rpLoad(), 0); // after the render: the new overlay's entities
    this._overlay = o;
    if (this.preview || this._fitHost) EDIT_OV = o;
    this._popup = null;
    this._menu = false;
    this._update(true);
    if (this._onOv) this._onOv(o);
  },
});
