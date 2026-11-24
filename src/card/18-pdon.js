Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.13.9.4 People distance (test; Network with Bluetooth shown). A person with a distance sensor (Bermuda:
   *  metres to the nearest Bluetooth proxy) gets a ring around that proxy and stands on it, inside the room
   *  that room sensor 1 / 2 says. With Bermuda's "Distance to <proxy>" sensors on, every proxy that hears the
   *  person adds a ring and the spot is the room's point that fits all of them best. Needs a measured floor. */
  _pdOn() {
    return this._overlay === "network" && !this._rpIn() && this._netShow().includes("bluetooth")
      && this._people().some((p) => p.distance) && this._layerOn("network", "pdist", true);
  },

  /** The Bluetooth proxies on this floor: where they stand (%), their HA area and device name. */
  _pdProxies(a) {
    const h = this._hass;
    const reg = h.entities || {};
    const devs = h.devices || {};
    const out = [];
    for (const it of this._items(a)) {
      if (!it.bt_proxy || !Number.isFinite(it.x)) continue;
      const er = reg[it.main_entity || (it.entities || [])[0]] || {};
      const dv = devs[er.device_id] || {};
      out.push({ x: it.x, y: it.y, area: er.area_id || dv.area_id || null, name: String(dv.name_by_user || dv.name || this._dev(it.id).name || it.name || "").toLowerCase() });
    }
    return out;
  },

  /** The rings of one person: [{x, y (%), d (m), near}]. The nearest proxy comes from the device's area
   *  sensor (Bermuda: the area of the nearest proxy); the others from its "Distance to <proxy>" sensors. */
  _pdRings(p, proxies) {
    const h = this._hass;
    const reg = h.entities || {};
    const num = (e) => {
      const s = h.states[e];
      const v = s && live(s) ? Number(s.state) : NaN;
      return Number.isFinite(v) && v >= 0 ? v : null;
    };
    const d0 = num(p.distance);
    const dev = (reg[p.distance] || {}).device_id;
    const mine = dev ? Object.keys(reg).filter((e) => e !== p.distance && e.startsWith("sensor.") && reg[e].device_id === dev && h.states[e]) : [];
    // A proxy by its name ("Distance to <name>"), else the only proxy in that area.
    const find = (area, label) => {
      const n = String(label || "").toLowerCase();
      return proxies.find((x) => x.name && n.endsWith(`to ${x.name}`)) || (area && proxies.filter((x) => x.area === area).length === 1 ? proxies.find((x) => x.area === area) : null);
    };
    const rings = [];
    for (const e of mine) {
      const at = h.states[e].attributes || {};
      if (at.unit_of_measurement !== "m" || !/distance to /i.test(at.friendly_name || "")) continue;
      const d = num(e);
      const px = d == null ? null : find(at.area_id, at.friendly_name);
      if (px && !rings.some((r) => r.px === px)) rings.push({ px, d });
    }
    const areaS = mine.map((e) => h.states[e]).find((s) => s.attributes && "area_id" in s.attributes && "current_mac" in s.attributes);
    const near = areaS && live(areaS) ? find(areaS.attributes.area_id, null) : null;
    if (near && d0 != null) {
      const r = rings.find((x) => x.px === near);
      if (r) r.d = d0;
      else rings.push({ px: near, d: d0 });
    }
    rings.sort((x, y) => x.d - y.d);
    return rings.map((r, i) => ({ x: r.px.x, y: r.px.y, d: r.d, near: r.px === near || (!near && i === 0) }));
  },

  /** Where the person stands (%): the point of the room that fits the rings best (one ring: of those on it,
   *  the one nearest the room's pin). Moves only when the new spot is 0.5 m or more away. */
  _pdSpot(eid, room, rings, a) {
    const W = Number(a.real_width_m);
    const shape = room.ar && room.ar.shape;
    if (!(W > 0) || !rings.length || !Array.isArray(shape) || shape.length < 3) return null;
    const H = W / (a.image_width && a.image_height ? a.image_width / a.image_height : 1.6);
    const m = (x, y) => [(x / 100) * W, (y / 100) * H];
    const poly = shape.map(([x, y]) => m(x, y));
    const cs = rings.map((r) => [...m(r.x, r.y), r.d, 1 / Math.max(r.d, 0.5)]);
    const pin = m(room.ar.x, room.ar.y);
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const step = Math.max(0.05, Math.max(x1 - x0, y1 - y0) / 80);
    let best = null;
    for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
      if (!inPoly(x, y, poly)) continue;
      let c = 0.01 * ((x - pin[0]) ** 2 + (y - pin[1]) ** 2);
      for (const [cx, cy, d, w] of cs) c += w * (Math.hypot(x - cx, y - cy) - d) ** 2;
      if (!best || c < best[2]) best = [x, y, c];
    }
    if (!best) return null;
    this._pdLast = this._pdLast || {};
    const last = this._pdLast[eid];
    if (last && last.room === room.id && Math.hypot(last.mx - best[0], last.my - best[1]) < 0.5) return last;
    return (this._pdLast[eid] = { room: room.id, mx: best[0], my: best[1], x: (best[0] / W) * 100, y: (best[1] / H) * 100 });
  },

  /** The rings as SVG in plan %: the nearest proxy's ring stronger; others only with "Rings around all proxies". */
  _pdRingsSvg(list, a) {
    const W = Number(a.real_width_m);
    if (!(W > 0) || !list.length) return "";
    const ratio = a.image_width && a.image_height ? a.image_width / a.image_height : 1.6;
    const all = this._layerOn("network", "pall", false);
    const out = [];
    for (const r of list) {
      if (!r.near && !all) continue;
      const rx = (r.d / W) * 100;
      out.push(`<ellipse class="${r.near ? "near" : ""}" cx="${r.x}" cy="${r.y}" rx="${rx}" ry="${rx * ratio}"/>`);
    }
    return out.length ? `<svg class="pdr" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${out.join("")}</svg>` : "";
  },
});

// =================================================================== editor
/** JSON with sorted keys, to compare configs regardless of key order. */
/** Near the card's edges, a marker's labels open towards the inside so they aren't cut off.
 *  0.10.2: measured in the card's frame (the plan plus the space around it), not the plan image. */
function edgeCls(x, y, m) {
  const e = m || { t: 0, r: 0, b: 0, l: 0 };
  const fx = ((x + e.l) * 100) / (100 + e.l + e.r);
  const fy = ((y + e.t) * 100) / (100 + e.t + e.b);
  return [fy > 78 ? "eb" : "", fy < 12 ? "et" : "", fx > 84 ? "er" : "", fx < 12 ? "el" : ""].filter(Boolean).join(" ");
}

function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const ED_CSS = `
.dfe .dhome { display:flex; flex-direction:column; gap:10px; margin: 4px 0 14px; }
.dfe .dh { display:flex; align-items:center; gap:8px; font-size:15px; }
.dfe .dh ha-icon { color: var(--primary-color); }
.dfe .dh .dv { font-size:12px; color: var(--secondary-text-color); padding:1px 7px; border-radius:10px; background: var(--secondary-background-color, #eee); }
.dfe .dh a { margin-left:auto; font-size:13px; color: var(--primary-color); text-decoration:none; }
.dfe .dsum { margin:0; display:flex; gap:8px; align-items:flex-start; font-size:13px; color: var(--secondary-text-color); --mdc-icon-size:18px; }
.dfe .dsum ha-icon, .dfe .dtip ha-icon { flex:none; width:24px; display:inline-flex; justify-content:center; }
/* 0.11.1 test8: one way in. Home Assistant's editor shows only the home; the settings live in the Card Editor. */
.dfe details.dall { display:none; }
.dfe-big .bg-set details.dall { display:block; }
.dfe .dcol h3 { margin: 6px 0 2px; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:600; --mdc-icon-size:20px; }
.dfe .dcol h3 ha-icon { color: var(--primary-color); }
.dfe .dcol p { margin: 0 0 6px; font-size:12px; line-height:1.4; color: var(--secondary-text-color); }
.dfe .dtip { margin:0; display:flex; gap:8px; align-items:flex-start; font-size:13px; color: var(--secondary-text-color); --mdc-icon-size:18px; }
.dfe details.dall > summary { cursor:pointer; font-weight:500; padding:10px 0; border-top:1px solid var(--divider-color, #ddd); list-style:none; display:flex; align-items:center; gap:6px; }
.dfe details.dall > summary::before { content:"▸"; transition: transform .15s; }
.dfe details.dall[open] > summary::before { transform: rotate(90deg); }
.dfe .dtabs { display:flex; gap:4px; margin: 4px 0 12px; border-bottom:1px solid var(--divider-color, #ddd); }
.dfe .dtabs button { border:0; background:transparent; font: inherit; font-size:14px; padding:8px 14px; cursor:pointer; color: var(--secondary-text-color); border-bottom:2px solid transparent; margin-bottom:-1px; }
.dfe .dtabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight:500; }
.dfe-big .bg-set .dhome, .dfe-big .bg-set details.dall > summary { display:none; }
.dfe .kord { margin: 8px 0; font-size:13px; }
.dfe .kord h5 { margin: 4px 0 6px; font-size:13px; font-weight:500; }
.dfe .kord .kr { display:flex; align-items:center; justify-content:space-between; padding:3px 6px; border-radius:6px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 6%, transparent); margin-bottom:3px; }
.dfe .kord button { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font-size:12px; }
.dfe .bigbtn { display:flex; align-items:center; gap:8px; width:100%; justify-content:center; border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); border-radius:10px; padding:10px; font: inherit; font-weight:500; cursor:pointer; margin: 4px 0 10px; }
.dfe h4 { margin: 22px 0 4px; font-size: 15px; font-weight: 500; display:flex; align-items:center; gap:8px; }
.dfe details.csec { margin: 10px 0; border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; background: var(--card-background-color, transparent); }
/* 0.11: anything that opens or closes shows the hand pointer, on the whole line. */
.dfe summary, .dfe-big summary { cursor:pointer; user-select:none; }
.dfe details.csec > summary { list-style:none; cursor:pointer; padding: 12px 14px; }
.dfe details.csec > summary::-webkit-details-marker { display:none; }
.dfe details.csec > summary h4 { margin:0; font-size:16px; }
.dfe details.csec > summary h4 .cv { margin-left:auto; transition: transform .15s; }
.dfe details.csec[open] > summary h4 .cv { transform: rotate(180deg); }
.dfe details.csec > summary p { margin: 4px 0 0 32px; font-size: 13px; color: var(--secondary-text-color); }
.dfe details.csec > .csb { padding: 12px 14px 14px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.08)); }
.dfe details.csec[open] { border-color: var(--primary-color, #03a9f4); }
.dfe p { margin: 0 0 8px; font-size: 12px; color: var(--secondary-text-color); }
.dfe input.flt, .dfe select.flt { box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
.dfe .flts { display:flex; gap:8px; margin-bottom: 6px; }
.dfe .flts input { flex:1; min-width:0; }
.dfe .dev { border-bottom: 1px solid var(--divider-color); }
/* 0.11: the line under a list row starts where its fields start. */
.dfe .row { border-bottom: 0; }
.dfe .row::after { content:""; display:block; border-bottom: 1px solid var(--divider-color); margin: 8px 8px 0; }
.dfe #chipreset { display:inline-flex; align-items:center; gap:6px; margin: 4px 0 8px; border:0; background:transparent; color: var(--primary-color, #03a9f4); font: inherit; font-size:13px; cursor:pointer; }
.dfe #chipreset ha-icon { --mdc-icon-size:16px; }
.dfe .dev > button, .dfe .row > button.hd { width: 100%; display:flex; align-items:center; gap:10px; border:0; background:transparent; color: var(--primary-text-color); font: inherit; font-size: 14px; padding: 9px 4px; cursor:pointer; text-align:left; }
.dfe .dev > button .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dfe .dev > button .ovs { display:flex; gap:3px; --mdc-icon-size: 16px; color: var(--primary-color); }
.dfe .dev > button .ovs ha-icon.off { color: var(--disabled-text-color, #999); opacity:.55; }
.dfe .dev > button small, .dfe .row > button small { color: var(--secondary-text-color); font-size: 12px; }
.dfe .dev .body, .dfe .row .body { padding: 4px 4px 14px; }
.dfe .dev.custom > button .nm { font-weight: 500; }
.dfe .shows { margin-top: 10px; }
.dfe .shows h5 { margin: 6px 0; font-size: 13px; font-weight: 500; }
.dfe .sw { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 6px 2px; font-size: 14px; --mdc-icon-size: 18px; }
.dfe .sw span { display:flex; align-items:center; gap:8px; }
.dfe .sw small { color: var(--secondary-text-color); font-size: 12px; }
.dfe .btns { display:flex; flex-wrap:wrap; gap:8px; margin-top: 8px; }
.dfe .btns button, .dfe button.add { border: 1px solid var(--divider-color); background: transparent; color: var(--primary-color); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 16px; cursor:pointer; display:flex; align-items:center; gap:6px; --mdc-icon-size: 18px; }
.dfe .btns button.del { color: var(--error-color, #db4437); }
.dfe .prow-ed { border:1px solid var(--divider-color); border-radius:10px; padding:8px; margin-bottom:8px; }
.dfe .prow-ed button.del { border:0; background:transparent; color: var(--error-color, #db4437); font: inherit; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px; margin-top:4px; --mdc-icon-size:18px; }
.dfe #people > button.add { margin-bottom: 10px; }
/* 0.11: your own overlays look like the built-in ones: a framed row with a chevron (content below). */
.dfe #custom > .row { border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; margin: 8px 0; overflow:hidden; }
.dfe #custom > .row > .hd { width:100%; padding: 12px 14px; }
.dfe #custom > .row .cv { margin-left:8px; transition: transform .15s; }
.dfe #custom > .row .cv.up { transform: rotate(180deg); }
.dfe #custom > .row > .body { padding: 0 14px 12px; }
/* 0.11: every + Add button keeps clear of the row or line above it (generic). */
.dfe button.add { margin-top: 12px; }
.dfe .ftabs button.add { margin-top: 0; }
.dfe .note { font-size: 12px; color: var(--secondary-text-color); }
.dfe .sub { margin: 14px 0 10px; padding-left: 4px; }
.dfe .sub h5 { margin: 0 0 2px; font-size: 14px; font-weight: 500; display:flex; align-items:center; gap:8px; --mdc-icon-size: 18px; }
.dfe [data-form="general"] { margin-bottom: 4px; }
.dfe .floors { margin: 0 0 6px; }
.dfe .fpanel { border: 1px solid var(--divider-color); border-radius: 12px; padding: 4px 12px 6px; margin: 8px 0 6px; background: color-mix(in srgb, var(--secondary-background-color, #f5f5f5) 45%, transparent); }
.dfe .fpanel h4 { margin-top: 14px; }
.dfe h3.grp { margin: 18px 0 2px; padding-bottom: 6px; font-size: 17px; font-weight: 500; display:flex; align-items:center; gap:8px; border-bottom: 2px solid var(--primary-color, #03a9f4); }
.dfe h3.grp small { font-size: 13px; font-weight: 400; color: var(--secondary-text-color); }
.dfe h3.grp:first-child { margin-top: 0; }
.dfe .ftabs { display:flex; align-items:center; gap:2px; border-bottom: 1px solid var(--divider-color); }
.dfe .ftabs button { border:0; background:transparent; color: var(--secondary-text-color); font: inherit; font-size:14px; padding: 10px 16px; cursor:pointer; border-bottom: 2px solid transparent; }
.dfe .ftabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); }
.dfe .ftabs button.add { margin-left:auto; font-size:20px; padding: 4px 12px; border:0; color: var(--primary-text-color); }
.dfe .fbody { display:flex; align-items:center; gap:8px; padding: 10px 0 4px; }
.dfe .fbody select { flex:1; min-width:0; }
.dfe .fbody button { border:0; background:transparent; color: var(--primary-text-color); cursor:pointer; width:34px; height:34px; border-radius:50%; --mdc-icon-size: 20px; display:flex; align-items:center; justify-content:center; }
.dfe .fbody button:disabled { opacity:.3; cursor:default; }
.dfe .fhint { font-size:12px; color: var(--secondary-text-color); margin: 4px 0 0; }
`;

/* 0.12.6: the marker settings, the same in the card editor and the big editor (styles travel with the panel). */
const MP_CSS = `
.mp { font-size:14px; color: var(--primary-text-color); }
.mp .mpchips { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 10px; }
.mp .mpc { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--divider-color, rgba(0,0,0,.2)); background:transparent; color: inherit; border-radius:14px; padding:3px 10px 3px 7px; font: inherit; font-size:12px; cursor:pointer; --mdc-icon-size:16px; }
.mp .mpc.shown, .mp .mpc.added { border-color: var(--primary-color, #03a9f4); }
.mp .mpc.added::after { content:"+"; font-weight:700; margin-left:2px; color: var(--primary-color, #03a9f4); }
.mp .mpc.hidden, .mp .mpc.off { opacity:.55; text-decoration: line-through; }
.mp .mpc.cur { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: var(--primary-color, #03a9f4); opacity:1; text-decoration:none; }
.mp h5 { margin:10px 0 4px; font-size:15px; font-weight:600; }
.mp .mpfor { margin:6px 0 2px; font-size:13px; color: var(--secondary-text-color); }
.mp .mpr { display:block; padding:7px 0; border-bottom:1px solid var(--divider-color, rgba(0,0,0,.08)); }
.mp .mpr.mpsw { display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; }
.mp .mpl { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
.mp .mpk { font-weight:500; }
.mp .mpk small, .mp .mpv small, .mp .mpn, .mp .mpxn small { color: var(--secondary-text-color); font-weight:400; font-size:12px; }
.mp .mpv { text-align:right; flex:1; min-width:40%; }
.mp .mpv small { margin-left:4px; padding:0 6px; border-radius:8px; background: var(--secondary-background-color, rgba(0,0,0,.06)); }
.mp select, .mp .pics select, .mp .pics input[type=number] { display:block; width:100%; box-sizing:border-box; font: inherit; font-size:14px; padding:8px 10px; border-radius:8px; border:1px solid var(--divider-color, rgba(0,0,0,.25)); background: var(--card-background-color, #fff); color: inherit; text-align:left; margin:4px 0; }
.mp .pics { display:flex; flex-direction:column; align-items:stretch; gap:2px; }
.mp .pics .pis, .mp .pics .pv { font-size:12px; color: var(--secondary-text-color); }
.mp .pics .pv input { display:inline-block; width:8em; }
.mp .mpx { display:flex; flex-direction:column; gap:6px; }
.mp .mpxr { padding:6px 8px; border-radius:8px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); }
.mp .mpxr.no { background: var(--secondary-background-color, rgba(0,0,0,.05)); opacity:.8; }
.mp .mpxl { display:flex; align-items:center; gap:6px; }
.mp .mpxn { flex:1; min-width:0; overflow-wrap:anywhere; }
.mp .mpxn small { display:block; }
.mp .mpxi, .mp .mpxd { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; padding:2px; font: inherit; --mdc-icon-size:18px; }
.mp .lbsw { display:flex; margin-top:6px; border:1px solid var(--primary-color, #03a9f4); border-radius:8px; overflow:hidden; }
.mp .lbsw button { flex:1; border:0; background:transparent; color: var(--primary-color, #03a9f4); padding:5px 6px; font: inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.mp .lbsw button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.mp .mpa { display:flex; gap:12px; flex-wrap:wrap; }
.mp .lnk { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font: inherit; font-size:12px; padding:2px 0; }
.mp .mpall { margin-top:12px; }
.mp .mpall > summary { cursor:pointer; font-weight:600; padding:6px 0; }
.mp ha-form { display:block; margin:4px 0; }
`;

const BIG_CSS = `
dialog.dfe-big { width:100vw; height:100vh; max-width:none; max-height:none; margin:0; padding:0; border:0; box-sizing:border-box; }
dialog.dfe-big:not([open]) { display:none; }
dialog.dfe-big::backdrop { background: rgba(0,0,0,.4); }
.dfe-big { position:fixed; inset:0; z-index:10000; background: var(--primary-background-color, #fafafa); color: var(--primary-text-color); display:flex; flex-direction:column; font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
.dfe-big .bg-h { display:flex; align-items:center; gap:12px; min-height:48px; box-sizing:border-box; padding:6px 12px 6px 16px; font-size:16px; background: var(--card-background-color, #fff); border-bottom:1px solid var(--divider-color, #ddd); }
.dfe-big .bg-h span { flex:1; font-size:13px; color: var(--secondary-text-color); }
.dfe-big .bg-x { border:0; border-radius:18px; padding:8px 18px; background: var(--primary-color, #03a9f4); color:#fff; font: inherit; font-weight:500; cursor:pointer; }
.dfe-big .bg-b { flex:1; min-height:0; display:flex; gap:12px; padding:12px; }
.dfe-big .bg-mid { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; order:1; }
.dfe-big .bg-pan { display:contents; }
.dfe-big .bg-pan .bg-set { order:0; }
.dfe-big .bg-pan .bg-side { order:2; }
.dfe-big .bg-tabs { display:none; }
.dfe-big .bg-tabs button { flex:1; border:0; background:transparent; font: inherit; font-size:14px; padding:8px; cursor:pointer; color: var(--secondary-text-color); border-bottom:2px solid transparent; }
.dfe-big .bg-tabs button.on { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight:500; }
.dfe-big .lic { --mdc-icon-size:18px; color: var(--secondary-text-color); margin-right:8px; flex:none; }
.dfe-big .lroom { font-size:11px; letter-spacing:.6px; text-transform:uppercase; color: var(--secondary-text-color); margin: 10px 0 2px; }
.dfe-big .bg-fit[hidden] { display:none; }
.dfe-big .bg-plan { flex:1; min-height:0; overflow:auto; }
.dfe-big .bg-plan > device-floorplan-card { display:block; }
.dfe-big .bg-zoom { display:flex; align-items:center; justify-content:flex-end; gap:4px; font-size:12px; color: var(--secondary-text-color); }
.dfe-big .bg-zoom button { border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; border-radius:14px; padding:2px 8px; font: inherit; cursor:pointer; --mdc-icon-size:18px; display:inline-flex; align-items:center; }
.dfe-big .bg-zv { min-width:44px; text-align:center; }
.dfe-big .bg-set { flex:0 0 360px; overflow:auto; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); padding:4px 12px 12px; }
.dfe-big .bg-set .mksec { display:none; }
.dfe-big .bg-side { flex:0 0 280px; overflow:auto; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); padding:12px 14px; }
.dfe-big .bg-t { margin:0 0 8px; font-size:16px; font-weight:500; }
.dfe-big .bg-hint { color: var(--secondary-text-color); font-size:13px; }
.dfe-big .bg-err { color: var(--error-color, #b3261e); font-size:13px; margin:0 0 8px; }
.dfe-big .qbtn, .dfe .qbtn { border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background:transparent; border-radius:16px; padding:6px 14px; font: inherit; font-weight:500; cursor:pointer; margin-bottom:8px; }
.dfe-big .shows h5 { margin:12px 0 6px; font-size:14px; font-weight:500; }
.dfe-big .shows .sw { display:flex; align-items:center; justify-content:space-between; padding:4px 0; }
.dfe-big .shows .sw span, .dfe-big .per .pr span { display:flex; align-items:center; gap:6px; --mdc-icon-size:18px; }
.dfe-big .per, .dfe .per { margin-top:8px; font-size:13px; }
.dfe-big .per summary, .dfe .per summary { cursor:pointer; color: var(--primary-color, #03a9f4); }
.dfe-big .per .pr, .dfe .per .pr { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; }
.dfe-big .per select, .dfe .per select { max-width:58%; font: inherit; padding:4px; border-radius:6px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big .bg-t { display:flex; align-items:center; justify-content:space-between; }
.dfe-big .bg-c { border:0; background:transparent; color: var(--secondary-text-color); font-size:16px; cursor:pointer; }
.dfe-big .bg-sel { border-bottom:1px solid var(--divider-color, #ddd); padding-bottom:10px; margin-bottom:10px; }
.dfe-big .bg-sel.inl { margin:2px 0 10px 8px; padding:8px 10px 10px; border:1px solid color-mix(in srgb, var(--primary-color, #03a9f4) 40%, transparent); border-left:3px solid var(--primary-color, #03a9f4); border-radius:8px; }
.dfe-big .bg-sel.inl { padding:6px 10px 10px; }
.dfe-big .bg-sel.inl .bg-t, .dfe-big .bg-sel.inl .qhide { display:none; }
.dfe-big .lr.sel .lb { white-space:nowrap; }
.dfe-big .bg-c2 { border:0; background:transparent; color: var(--secondary-text-color); font-size:15px; cursor:pointer; padding:2px 6px; }
.dfe-big .bg-lh { display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:6px; }
.dfe-big .bg-q { flex:1; min-width:0; font: inherit; padding:5px 8px; border-radius:8px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big h6 { margin:10px 0 4px; font-size:12px; font-weight:500; color: var(--secondary-text-color); }
.dfe-big details.dgrp { margin: 4px 0; }
.dfe-big .pr.rad { justify-content:flex-start; gap:8px; cursor:pointer; }
.dfe-big [hidden], .dfe [hidden] { display:none !important; } /* flex rows ignored the hidden attribute */
.dfe-big .pr.rad input { margin:0; }
.dfe-big details.dgrp > summary { list-style:none; display:flex; align-items:center; gap:8px; padding: 8px 4px; font-size:15px; font-weight:600; color: var(--primary-text-color); border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.1)); }
.dfe-big details.dgrp > summary::-webkit-details-marker { display:none; }
.dfe-big details.dgrp > summary::before { content:''; width:0; height:0; border-left:6px solid currentColor; border-top:5px solid transparent; border-bottom:5px solid transparent; transition: transform .15s; }
.dfe-big details.dgrp[open] > summary::before { transform: rotate(90deg); }
.dfe-big details.dgrp > summary .n { font-weight:500; color: var(--secondary-text-color); }
.dfe-big .lr { display:flex; align-items:center; gap:6px; padding:2px 4px; border-radius:6px; }
.dfe-big .lr.sel { background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent); }
.dfe-big .lnm { flex:1; min-width:0; display:flex; align-items:center; text-align:left; border:0; background:transparent; color: inherit; font: inherit; font-size:13px; padding:2px 0; min-height:32px; cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
/* 0.11.1 test8: the two side columns share one header style (title + icon, one grey line). */
.dfe-big .dcol h3 { margin: 2px 0 2px; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:600; --mdc-icon-size:20px; flex-wrap:wrap; }
.dfe-big .dcol h3 > ha-icon { color: var(--primary-color); }
.dfe-big .dcol p { margin: 0 0 8px; font-size:12px; line-height:1.4; color: var(--secondary-text-color); }
.dfe-big .ovchip { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:500; padding:2px 8px; border-radius:12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent); color: var(--primary-color, #03a9f4); --mdc-icon-size:14px; }
.dfe-big .mkn { font-size:13px; font-weight:500; color: var(--secondary-text-color); }
.dfe-big .lb { border:1px solid var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); background:transparent; border-radius:12px; padding:2px 9px; font: inherit; font-size:12px; cursor:pointer; }
.dfe-big .na { color: var(--secondary-text-color); font-size:11px; }
.dfe-big .ovsec h5 { margin:12px 0 6px; font-size:14px; font-weight:500; }
.dfe-big .ovsec .pr { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; padding:4px 0; }
.picbox .pics { flex-direction:column; align-items:stretch; gap:4px; }
.picbox .pics select, .picbox .pics .pfind { width:100%; box-sizing:border-box; font:inherit; font-size:13px; padding:6px 8px; border-radius:6px; border:1px solid var(--divider-color, rgba(0,0,0,.2)); background: var(--card-background-color, #fff); color: var(--primary-text-color); }
.picbox .pics .pis { font-size:12px; color: var(--secondary-text-color); }
.picbox .pics .pv input { font:inherit; padding:4px 6px; }
.dfe-big .ovsec .pr.rad { justify-content:flex-start; cursor:pointer; padding-left:4px; }
.dfe-big .ovsec .pr.rad span { flex:1; text-align:left; }
.dfe-big .ovsec select { max-width:60%; font: inherit; padding:4px; border-radius:6px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; }
.dfe-big .ovsec .xs { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:13px; margin:6px 0; }
.dfe-big .ovsec .xh { width:100%; color: var(--secondary-text-color); font-size:12px; }
.dfe-big .ovsec .xchip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:12px; background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); font-size:12px; }
.dfe-big .ovsec .xchip button, .dfe-big .ovsec .lnk { border:0; background:transparent; color: var(--primary-color, #03a9f4); cursor:pointer; font: inherit; font-size:12px; padding:0 2px; }
.dfe-big .ovsec .none { color: var(--secondary-text-color); }
.dfe-big .ovsec .lbsw { display:inline-flex; border:1px solid color-mix(in srgb, var(--primary-color, #03a9f4) 45%, transparent); border-radius:10px; overflow:hidden; margin-left:2px; }
.dfe-big .ovsec .xchip .lbsw button { padding:0 7px; font-size:11px; color: var(--secondary-text-color); border-radius:0; }
.dfe-big .ovsec .xchip .lbsw button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.dfe-big .ovsec .xchip.isb { outline:1.5px solid var(--primary-color, #03a9f4); }
.dfe-big .ovsec .xic { border:0; background:transparent; padding:0 2px 0 0; cursor:pointer; color: inherit; --mdc-icon-size:16px; display:inline-flex; }
.dfe-big .ovsec .pr input[type=checkbox] { width:18px; height:18px; }
/* 0.11.1: the plan comes first. Medium: one side panel with Settings | Markers tabs. Narrow: the plan on top, kept in view. */
@media (max-width: 1400px) {
  .dfe-big .bg-pan { display:flex; flex-direction:column; flex: 0 0 380px; min-height:0; order:2; background: var(--card-background-color, #fff); border-radius:12px; border:1px solid var(--divider-color, #ddd); overflow:hidden; }
  .dfe-big .bg-tabs { display:flex; border-bottom:1px solid var(--divider-color, #ddd); }
  .dfe-big .bg-pan .bg-set, .dfe-big .bg-pan .bg-side { flex:1; min-height:0; border:0; border-radius:0; }
  .dfe-big .bg-b.tab-set .bg-side, .dfe-big .bg-b.tab-side .bg-set { display:none; }
}
@media (max-width: 800px) {
  .dfe-big .bg-b { flex-direction:column; overflow:auto; }
  .dfe-big .bg-mid { flex: 0 0 45vh; position:sticky; top:0; z-index:2; background: var(--secondary-background-color, #f3f3f3); }
  .dfe-big .bg-pan { flex: 0 0 auto; overflow:visible; }
  .dfe-big .bg-h span { display:none; }
}
`;

