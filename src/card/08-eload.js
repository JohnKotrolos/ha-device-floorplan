Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------------ 0.11 Energy
  /** Energy data from Home Assistant's own Energy settings: the devices (with their kWh statistic and power
   *  sensor) and the sources, plus today's hourly statistics. Refreshed every 5 minutes while Energy shows. */
  _eLoad(force) {
    const now = Date.now();
    const day = new Date().toDateString();
    if (!this._hass || this._eBusy) return;
    if (!force && this._eData && this._eData.day === day && now - this._eData.t < 300000) return;
    this._eBusy = true;
    // test10: the last 24 hours (rolling, ending with the current hour), hour by hour.
    const start = new Date(Math.floor(now / 3600000) * 3600000 - 24 * 3600000);
    this._hass
      .callWS({ type: "energy/get_prefs" })
      .then(async (prefs) => {
        const devs = (prefs.device_consumption || []).filter((d) => d.stat_consumption);
        const srcs = [];
        for (const sr of prefs.energy_sources || []) {
          if (sr.type === "solar" && sr.stat_energy_from) srcs.push({ kind: "solar", stat: sr.stat_energy_from, rate: sr.stat_rate });
          if (sr.type === "battery") {
            if (sr.stat_energy_from) srcs.push({ kind: "battery_out", stat: sr.stat_energy_from, rate: sr.stat_rate });
            if (sr.stat_energy_to) srcs.push({ kind: "battery_in", stat: sr.stat_energy_to });
          }
          if (sr.type === "grid") for (const f of sr.flow_from || []) if (f.stat_energy_from) srcs.push({ kind: "grid", stat: f.stat_energy_from, rate: sr.stat_rate });
          if (sr.type === "grid" && sr.stat_energy_from) srcs.push({ kind: "grid", stat: sr.stat_energy_from, rate: sr.stat_rate }); // HA 2026.11+
        }
        const ids = [...devs.map((d) => d.stat_consumption), ...srcs.map((x) => x.stat)];
        let stats = {};
        if (ids.length) {
          stats = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: new Date().toISOString(), statistic_ids: ids, period: "hour", types: ["change"] });
        }
        const hours = {}; // statistic → { hour start (ms): kWh }
        for (const id of ids) {
          const by = {};
          for (const r of stats[id] || []) {
            const ts = Math.floor(new Date(r.start).getTime() / 3600000) * 3600000;
            if (Number.isFinite(ts)) by[ts] = (by[ts] || 0) + Math.max(0, Number(r.change) || 0);
          }
          hours[id] = by;
        }
        this._eData = { day, t: Date.now(), devs, srcs, hours };
        this._eErr = null;
      })
      .catch((e) => {
        this._eErr = (e && (e.message || e.code)) || "Energy data not available";
        this._eData = { day, t: Date.now(), devs: [], srcs: [], hours: {} };
      })
      .finally(() => {
        this._eBusy = false;
        this._update(true);
      });
  },

  /** What Energy shows: "day" (kWh of the last 24 hours, rolling), "now" (live W), or one of those hours
   *  (its start, ms: kWh in that hour). */
  _eSel() {
    const v = this._eAt;
    if (v === "now") return "now";
    if (typeof v === "number") {
      const cur = Math.floor(Date.now() / 3600000) * 3600000;
      if (v <= cur && v >= cur - 23 * 3600000) return v;
    }
    return "day";
  },

  /** Value of one statistic (+ its power sensor) for the current selection: { v, unit }. */
  _eVal(stat, rate) {
    const sel = this._eSel();
    if (sel === "now") {
      const w = powerW(this._hass.states[rate]);
      return { v: w == null ? 0 : w, unit: "W", live: w != null };
    }
    const by = (this._eData && this._eData.hours[stat]) || {};
    const from = Math.floor(Date.now() / 3600000) * 3600000 - 23 * 3600000;
    const v = sel === "day" ? Object.entries(by).reduce((x, [ts, y]) => (Number(ts) >= from ? x + y : x), 0) : by[sel] || 0;
    return { v, unit: "kWh" };
  },

  /** Energy devices per plan item (by any of the item's entities), each with its colour. */
  _eIndex(a) {
    if (!this._eData) return new Map();
    const key = `${this._eData.t}|${this._floor}`;
    if (this._eIdx && this._eIdx.key === key) return this._eIdx.map;
    const byEnt = new Map();
    for (const item of this._items(a)) for (const e of [item.main_entity, ...(item.entities || []), ...(item.allEntities || [])]) if (e && !byEnt.has(e)) byEnt.set(e, item);
    const map = new Map();
    const byDev = new Map(this._items(a).map((it) => [it.id, it]));
    const devOf = (e) => (e && this._hass.entities && this._hass.entities[e] ? this._hass.entities[e].device_id : null);
    this._eData.devs.forEach((d, i) => {
      // 0.11: by entity, else by the device the sensor belongs to (a plug's energy sensor, when the plug is placed).
      const item = byEnt.get(d.stat_consumption) || byEnt.get(d.stat_rate) || byDev.get(devOf(d.stat_consumption)) || byDev.get(devOf(d.stat_rate));
      if (!item) return;
      const list = map.get(item.id) || [];
      list.push({ ...d, color: E_COLORS[i % E_COLORS.length] });
      map.set(item.id, list);
    });
    this._eIdx = { key, map };
    return map;
  },

  /** 0.11: Home Assistant's "Upstream device": the stat of the device whose meter already includes this one
   *  (only when that device is in Energy too). Such a device keeps its chip but isn't added again to totals. */
  _eUp(stat) {
    const devs = (this._eData && this._eData.devs) || [];
    const d = devs.find((x) => x.stat_consumption === stat);
    const up = d && d.included_in_stat;
    return up && devs.some((x) => x.stat_consumption === up) ? up : null;
  },

  /** Totals, room shading and lines: what a chip adds (its top-level devices) and where its line goes. */
  _eTree(sp, devs) {
    sp.stats = new Set(devs.map((d) => d.stat));
    sp.eSum = devs.filter((d) => !this._eUp(d.stat)).reduce((t, d) => t + d.v, 0);
    const ups = devs.map((d) => this._eUp(d.stat));
    sp.up = ups.every((u) => u && !sp.stats.has(u)) ? ups[0] : null;
  },

  _energySpecs(item, name, q) {
    const list = this._eIndex(this._a || {}).get(item.id);
    if (!list) return [];
    let v = 0;
    let unit = "kWh";
    const tree = [];
    for (const d of list) {
      const r = this._eVal(d.stat_consumption, d.stat_rate);
      v += r.v;
      unit = r.unit;
      tree.push({ stat: d.stat_consumption, v: r.v });
    }
    if (q) return [{ key: item.id }]; // 0.11: in Energy whenever it's in HA's Energy settings, whatever it uses now
    // 0.11: from 0 W by default (any use shows); a device using nothing never shows.
    const min = unit === "W" ? Number(this._ov("energy").min_w ?? 0) : 0.005;
    if (!(v > 0) || v < min) return [];
    const pos = item.box || item;
    const sp = this._chipSpec({ ...item, x: pos.x, y: pos.y }, name, { lines: [unit === "W" ? fmtW(v) : fmtKwh(v)], icon: "mdi:flash", ents: list.map((d) => d.stat_rate || d.stat_consumption).filter((e) => this._hass.states[e]), kind: "reading", cls: "en" });
    sp.color = list[0].color;
    sp.energy = v;
    sp.unit = unit;
    sp.area = item.area_id;
    this._eTree(sp, tree);
    return [sp];
  },

  /** Area of an entity (its own, else its device's). */
  _eAreaOf(e) {
    const en = e && this._hass.entities && this._hass.entities[e];
    if (!en) return null;
    if (en.area_id) return en.area_id;
    const dv = en.device_id && this._hass.devices && this._hass.devices[en.device_id];
    return dv ? dv.area_id || null : null;
  },

  /** 0.11: energy devices with no marker on the plan show at their room's pin (so the plan adds up to HA's Energy);
   *  what's on no room of this plan is summed as "Not on this plan". */
  _eRoomSpecs(a) {
    this._eOff = 0;
    if (!this._eData) return [];
    const placed = new Set();
    for (const list of this._eIndex(a).values()) for (const d of list) placed.add(d.stat_consumption);
    const per = {};
    this._eData.devs.forEach((d, i) => {
      if (placed.has(d.stat_consumption)) return;
      const r = this._eVal(d.stat_consumption, d.stat_rate);
      const area = this._eAreaOf(d.stat_consumption) || this._eAreaOf(d.stat_rate);
      const ar = area && (a.areas || {})[area];
      if (!ar || ar.x == null) {
        if (!this._eUp(d.stat_consumption)) this._eOff += r.v; // an upstream device already counts it
        return;
      }
      const g = (per[area] = per[area] || { ar, list: [], v: 0, unit: r.unit, i });
      const ent = d.stat_rate || d.stat_consumption;
      g.list.push({ name: d.name || entName(this._hass, ent), ent, v: r.v, stat: d.stat_consumption });
      g.v += r.v;
      if (r.v > (g.top || -1)) [g.top, g.i] = [r.v, i];
    });
    const out = [];
    for (const [area, g] of Object.entries(per)) {
      const min = g.unit === "W" ? Number(this._ov("energy").min_w ?? 0) : 0.005;
      if (!(g.v > 0) || g.v < min) continue;
      const n = g.list.length;
      const fmt = g.unit === "W" ? fmtW(g.v) : fmtKwh(g.v);
      const name = n > 1 ? `${g.ar.name || area} · ${n} devices` : g.list[0].name;
      const item = { id: `energy:${area}`, name, main_entity: g.list[0].ent, entities: g.list.map((x) => x.ent), x: g.ar.x, y: g.ar.y, area_id: area };
      const sp = this._chipSpec(item, name, { lines: [n > 1 ? `${n} · ${fmt}` : fmt], icon: "mdi:flash", ents: item.entities.filter((e) => this._hass.states[e]), kind: "reading", cls: "en" });
      sp.color = E_COLORS[g.i % E_COLORS.length];
      sp.energy = g.v;
      sp.unit = g.unit;
      sp.area = area;
      sp.elist = g.list.sort((x, y) => y.v - x.v);
      this._eTree(sp, g.list);
      out.push(sp);
    }
    return out;
  },

  /** Totals per room from the energy markers shown. */
  _eRooms(min = 1) {
    const by = {};
    const n = {};
    for (const sp of this._specs ? this._specs.values() : []) if (sp.energy > 0 && sp.area) {
      by[sp.area] = (by[sp.area] || 0) + (sp.eSum ?? sp.energy);
      n[sp.area] = (n[sp.area] || 0) + 1;
    }
    if (min > 1) for (const k of Object.keys(by)) if (n[k] < min) delete by[k];
    return by;
  },

  _eFmt(v) {
    return this._eSel() === "now" ? fmtW(v) : fmtKwh(v);
  },

  /** Rooms shaded by their share, in Home Assistant's energy colour. */
  _eFillHtml(a) {
    if (this._overlay !== "energy" || !this._layerOn("energy", "fill", true)) return "";
    const by = this._eRooms();
    const max = Math.max(...Object.values(by), 1e-9);
    const polys = Object.entries(a.areas || {}).filter(([id, r]) => by[id] > 0 && Array.isArray(r.shape) && r.shape.length >= 3).map(([id, r]) => `<polygon points="${r.shape.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:var(--energy-grid-consumption-color, #488fc2);fill-opacity:${(0.1 + 0.42 * Math.min(1, by[id] / max)).toFixed(3)}"></polygon>`).join("");
    return polys ? `<svg class="fresh efill" viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg>` : "";
  },

  /** Where the electrical panel and the solar / battery box are (placed in the Editor; else a good guess). */
  _ePoints(a) {
    // 0.11: the real grid meter / solar / battery when it's on the plan (its device, or the sensor itself), else the
    // point set in the Editor. No guessing: without an electrical panel there are no flow lines.
    const pts = a.energy_points || {};
    const srcs = (this._eData && this._eData.srcs) || [];
    const realAt = (kinds) => {
      for (const x of srcs.filter((q) => kinds.includes(q.kind))) {
        const en = this._hass.entities && this._hass.entities[x.stat];
        const it = this._items(a).find((i) => i.id === `entity:${x.stat}` || (en && en.device_id && i.id === en.device_id) || [i.main_entity, ...(i.entities || []), ...(i.allEntities || [])].includes(x.stat));
        if (it) return { x: (it.box || it).x, y: (it.box || it).y };
      }
      return null;
    };
    const has = (k) => srcs.some((x) => k.includes(x.kind));
    const rP = realAt(["grid"]);
    const rS = has(["solar"]) ? realAt(["solar"]) : null;
    const rB = has(["battery_out", "battery_in"]) ? realAt(["battery_out", "battery_in"]) : null;
    const panel = rP || pts.panel || null;
    const source = has(["solar"]) ? rS || pts.source || null : null;
    const battery = has(["battery_out", "battery_in"]) ? rB || pts.battery || null : null;
    // A point you set (no real device on the plan) is dashed, like phantoms.
    return { panel, source, battery, dummy: { panel: !rP, source: !rS, battery: !rB } };
  },

  /** The panel, the source and the flow lines: panel → every device using energy; source → panel. */
  _eFlowHtml(a) {
    this._eFlow = null;
    if (this._overlay !== "energy") return "";
    const { panel, source, battery, dummy } = this._ePoints(a);
    if (!panel) return "";
    if (this._layerOn("energy", "flow", this._layerDefault("energy", "flow"))) {
      this._eFlow = { panel, source, battery, sol: this._eSum("solar"), out: this._eSum("battery_out"), chg: this._eSum("battery_in") };
    }
    // 0.11: each point shows its value. The panel: Home Assistant's grid total (all grid meters together), else
    // the total of the devices on this plan; the lines flow into a number, as in Home Assistant.
    const onPlan = [...(this._specs ? this._specs.values() : [])].reduce((t, sp) => t + (sp.energy > 0 ? sp.eSum ?? sp.energy : 0), 0);
    const val = { panel: this._eSum("grid") || onPlan, source: this._eSum("solar"), battery: this._eSum("battery_out") };
    const pin = (p, icon, label, cls) => {
      const v = val[cls] > 0 ? this._eFmt(val[cls]) : "";
      return `<div class="epin ${cls} ${dummy[cls] ? "dummy" : ""} ${v ? "val" : ""}" style="left:${p.x}%;top:${p.y}%" title="${cesc(label)}${v ? ` · ${cesc(v)}` : ""}"><ha-icon icon="${icon}"></ha-icon>${v ? `<span>${cesc(v)}</span>` : ""}</div>`;
    };
    return `${pin(panel, "mdi:flash", "Electrical panel", "panel")}${source ? pin(source, "mdi:solar-power-variant", "Solar", "source") : ""}${battery ? pin(battery, "mdi:home-battery", "Battery", "battery") : ""}`;
  },

  /** Flow lines in pixels (drawn after the layout, to each chip's final spot), like Home Assistant's energy
   *  distribution: thin line, across then a rounded corner, one dot travelling along (faster = more). */
  _eFlowSvg(box, W, H, t0 = 0) {
    const f = this._eFlow;
    if (!f) return "";
    const P = (p) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });
    const elbow = (p, q) => {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const r = Math.min(14, Math.abs(dx), Math.abs(dy));
      return `M${p.x},${p.y} L${q.x - Math.sign(dx) * r},${p.y} Q${q.x},${p.y} ${q.x},${p.y + Math.sign(dy) * r} L${q.x},${q.y}`;
    };
    // 0.11: the plan is redrawn whenever a value changes; each dot starts where the clock says it should be
    // (not from the start), so the movement looks continuous. A per-line offset keeps the dots from bunching.
    let n = 0;
    const line = (d, c, dur, back) => {
      const t = Number(dur);
      const phase = ((Date.now() / 1000 + n++ * 0.37 * t) % t).toFixed(2);
      // begin is on this SVG's own clock: "now" there minus how far the dot should already be.
      return `<path class="eln" d="${d}" style="stroke:${c}"/><circle r="4" style="fill:${c}"><animateMotion dur="${t}s" begin="${(t0 - phase).toFixed(2)}s" repeatCount="indefinite" path="${d}"${back ? ` keyPoints="1;0" keyTimes="0;1" calcMode="linear"` : ""}/></circle>`;
    };
    const specs = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.energy > 0);
    const max = Math.max(...specs.map((sp) => sp.energy), 1e-9);
    const pan = P(f.panel);
    const at = (sp) => {
      const el = box.querySelector(`[data-k="${CSS.escape(sp.key)}"]`);
      return el && el.style.left.endsWith("px") ? { x: parseFloat(el.style.left), y: parseFloat(el.style.top) } : P(sp);
    };
    let out = specs.map((sp) => {
      // Like Home Assistant: the dot travels from the device to the panel (same line, other direction). A device
      // with an upstream device (a plug behind a sub-meter) flows into that one, when it's on the plan.
      const upSp = sp.up && specs.find((t) => t !== sp && t.stats && t.stats.has(sp.up));
      return line(elbow(upSp ? at(upSp) : pan, at(sp)), sp.color, (4 - 2.6 * (sp.energy / max)).toFixed(2), true);
    }).join("");
    // Like HA's distribution: solar → panel, battery → panel (discharging), solar (or panel) → battery (charging).
    const sol = f.source && P(f.source);
    const bat = f.battery && P(f.battery);
    if (sol && f.sol > 0) out += line(elbow(sol, pan), "var(--energy-solar-color, #ff9800)", 2);
    if (bat && f.out > 0) out += line(elbow(bat, pan), "var(--energy-battery-out-color, #4db6ac)", 2);
    if (bat && f.chg > 0) out += line(elbow(sol || pan, bat), "var(--energy-battery-in-color, #f06292)", 2);
    return out;
  },

  /** Total of one kind of source for the current selection. */
  _eSum(kind) {
    if (!this._eData) return 0;
    return this._eData.srcs.filter((x) => x.kind === kind).reduce((t, x) => t + this._eVal(x.stat, x.rate).v, 0);
  },

  /** Under the plan: total, top 3, sources, and the day scrubber (00:00 → now; left end Today, right end Now). */
  _eLegendHtml() {
    if (this._overlay !== "energy") return "";
    if (!this._eData) return `<div class="heatleg eleg">Loading energy…</div>`;
    if (!this._eData.devs.length) return `<div class="heatleg eleg">${this._eErr ? cesc(this._eErr) : "No devices in Home Assistant's Energy settings yet. Add them under Settings → Dashboards → Energy, and they show here."}</div>`;
    const specs = [...(this._specs ? this._specs.values() : [])].filter((sp) => sp.energy > 0).sort((x, y) => y.energy - x.energy);
    const sum = specs.reduce((x, sp) => x + (sp.eSum ?? sp.energy), 0); // an upstream device's meter counts once
    const it = (icon, label, v, c) => `<span class="cl"><ha-icon icon="${icon}" style="color:${c}"></ha-icon>${cesc(label)} <b>${cesc(v)}</b></span>`;
    // 0.11: no device list (the chips and their colours say it); explain the room shading instead.
    const top = this._layerOn("energy", "fill", true) && Object.keys(this._eRooms()).length ? `<span class="cl"><i class="eshade"></i>Rooms: darker = more energy</span>` : "";
    const sol = this._eSum("solar");
    const grid = this._eSum("grid");
    const batt = this._eSum("battery_out");
    const sumTxt = `${this._eSel() === "day" ? "" : `<span class="cl ewhen"><b>${cesc(this._eWhen())}</b></span>`}${it("mdi:flash", "On the plan", this._eFmt(sum), "var(--energy-grid-consumption-color, #488fc2)")}${this._eOff >= (this._eSel() === "now" ? 1 : 0.005) ? it("mdi:map-marker-off-outline", "Not on this plan", this._eFmt(this._eOff), "var(--secondary-text-color)") : ""}`;
    const srcTxt = `${grid > 0 ? it("mdi:transmission-tower", "Grid", this._eFmt(grid), "var(--energy-grid-consumption-color, #488fc2)") : ""}${sol > 0 ? it("mdi:solar-power", "Solar", this._eFmt(sol), "var(--energy-solar-color, #ff9800)") : ""}${batt > 0 ? it("mdi:home-battery", "Battery", this._eFmt(batt), "var(--energy-battery-out-color, #4db6ac)") : ""}`;
    const hint = !this._ePoints(this._a || {}).panel && this._hass.user && this._hass.user.is_admin ? `<span class="cl">Place the Electrical panel in the Floorplan Editor (Step 3, Energy points) to see the flow lines.</span>` : "";
    return `${this._eScrubHtml()}<div class="heatleg eleg">${sumTxt}${srcTxt}${top}${hint}</div>`;
  },
});
