Object.assign(DeviceFloorplanCard.prototype, {

  /** Network (#49): connection icon, role colour/shape, LQI as the ring; values only in the popup. */
  _netSpecs(item, name, cx, q) {
    const hass = this._hass;
    const opts = this._ov("network");
    // 0.8.2: a ZHA group (a device since HA 2026.11) has no radio of its own: not on the Network map.
    if (item.zha_group) return [];
    const conns = (item.conns || []).filter((c) => CONNS[c] && c !== "radio");
    // No known connection but a signal sensor: still a wireless device.
    if (!conns.length && (item.entities || []).some((e) => kindOf(e, hass.states[e]) === "signal")) conns.push("radio");
    if (!conns.length) return [];
    if (q) return [{ key: item.id }];
    const show = this._netShow();
    const visible = conns.filter((c) => show.includes(c));
    if (!visible.length) return [];
    // test12: a Bluetooth proxy (ESPHome, Shelly, …) shows as Bluetooth whenever Bluetooth is shown.
    const btp = !!item.bt_proxy && visible.includes("bluetooth");
    const conn = btp ? "bluetooth" : CONN_ORDER.find((c) => visible.includes(c));
    // test11, Replay: only what was recorded counts. ZHA's LQI and "available" are now-values, so the role stays,
    // the device's own entity says online / offline, and the ring comes from a recorded signal sensor only.
    const past = this._rpT() != null;
    const z0 = conns.includes("zigbee") && item.ieee ? cx.zha[ieeeKey(item.ieee)] : null;
    const z = z0 && past ? { ...z0, lqi: null, rssi: null, available: true } : z0;
    const unavailable = (z && !z.available) || ((!z || past) && item.main_entity && devOffline(hass, item, past) && !item.bond);
    const isAp = Object.values((this._a && this._a.aps) || {}).includes(item.id);
    let role = z && z.role ? z.role : isAp ? "ap" : cx.hubs.has(item.id) ? "hub" : conns.includes("zigbee") ? "end" : "device";
    if (btp && !["coordinator", "router", "hub"].includes(role)) role = "btproxy";
    else if (conn === "bluetooth" && role === "device") role = "end"; // test12: a Bluetooth sensor / beacon is an end device
    // test11: size by role (the role it has when online): hubs as before, routers a bit smaller, the rest small.
    const sz = ["coordinator", "ap", "hub", "btproxy"].includes(role) ? "" : role === "router" ? "szm" : "szs";
    if (unavailable) role = "unavailable";
    if (!z && conns.includes("zigbee") && !unavailable && !cx.hubs.has(item.id) && !isAp) role = Object.keys(cx.zha || {}).length ? "unknown" : "end";
    if ((this._net.roles || []).includes(role)) return [];
    // Signal: ZHA's LQI, else an enabled signal sensor.
    const sigEid = [...(item.entities || [])].find((e) => kindOf(e, hass.states[e]) === "signal" && live(hass.states[e]));
    let tone = "unknown";
    let ring = "";
    if (z && z.lqi != null) {
      ring = lqiColor(z.lqi);
      tone = z.lqi >= 150 ? "good" : z.lqi >= 100 ? "fair" : "poor";
    } else if (sigEid) {
      tone = signalTone(sigEid, hass.states[sigEid]);
      ring = { good: "#43a047", fair: "#fb8c00", poor: "#e53935" }[tone] || "";
    }
    if (opts.only_weak && tone !== "poor" && tone !== "fair") {
      if (tone === "unknown") this._skippedUnknown = (this._skippedUnknown || 0) + 1;
      return [];
    }
    const pos = item.box || item;
    const label = opts.labels && this._look().markers !== "icon" ? conns.map((c) => CONNS[c].label).join(" + ") : "";
    // 0.7.3: what the router says (access point, cable or Wi-Fi, network).
    const rs = item.router && hass.states[item.router];
    const rt = rs ? { eid: item.router, ap: rs.attributes.connected_to || "", lan: /lan|ethernet|cable/i.test(rs.attributes.connection_type || "") && !/wlan|wifi|wi-fi|wireless/i.test(rs.attributes.connection_type || ""), ssid: rs.attributes.ssid || "", ip: rs.attributes.ip || "", home: rs.state === "home" } : null;
    return [{ key: item.id, type: "net", item, name, conns, conn, role, ring, z, sigEid, rt, unavailable, ents: [item.main_entity].filter(Boolean), icon: conn === "network" && !(rt && rt.lan) ? { good: "mdi:wifi-strength-4", fair: "mdi:wifi-strength-2", poor: "mdi:wifi-strength-1" }[tone] || CONNS[conn].icon : CONNS[conn].icon, sz, tone, value: label, ieee: z ? item.ieee : null, x: pos.x, y: pos.y }];
  },

  /** 0.8.1: devices of the other floors (where they sit there), by device id, ZHA IEEE and access point. */
  _otherIdx() {
    const idx = { byId: {}, byIeee: {}, aps: {} };
    // 0.8.2: floors placed in one house (scaled and aligned): convert the other floor's spot into this floor's.
    const here = ((this._a || {}).frame || {}).box;
    for (const f of this._floors()) {
      if (f.id === this._floor) continue;
      const a2 = f.sensor.attributes || {};
      const there = (a2.frame || {}).box;
      const conv = here && there ? (x, y) => [((there.x + (x / 100) * there.w - here.x) / here.w) * 100, ((there.y + (y / 100) * there.h - here.y) / here.h) * 100] : (x, y) => [x, y];
      Object.assign(idx.aps, a2.aps || {});
      for (const it of this._items(a2)) {
        const pos = it.box || it;
        if (pos.x == null || it.phantom) continue;
        const conn = CONN_ORDER.find((c) => (it.conns || []).includes(c));
        const [gx, gy] = conv(pos.x, pos.y);
        const g = { key: `ghost:${f.id}:${it.id}`, name: this._dev(it.id).name || it.name, floor: f.name, x: gx, y: gy, conns: it.conns || [], icon: conn ? CONNS[conn].icon : "mdi:devices" };
        idx.byId[it.id] = g;
        if (it.ieee) idx.byIeee[ieeeKey(it.ieee)] = g;
      }
    }
    return idx;
  },

  /** 0.8.1: a device here linked to one on another floor: that one is drawn faded at its spot, with a normal line.
   *  Zigbee: a device with no router / coordinator next to it here gets its strongest link to one on another floor; Wi-Fi / LAN: its access
   *  point; hubs and bridges: the hub. Only direct links, never the other floor's network. */
  _netGhosts(specs) {
    if (this._floors().length < 2) return [];
    const idx = this._otherIdx();
    const out = new Map();
    const add = (g, link) => {
      const e = out.get(g.key) || { ...g, links: [] };
      e.links.push(link);
      out.set(g.key, e);
    };
    const net = specs.filter((s) => s.type === "net");
    const band = (v) => (LQI_BANDS.find((b) => v >= b.min) || LQI_BANDS[3]).min;
    if (this._net.links && this._zha && this._zha.links.length) {
      const here = {};
      for (const s of net) if (s.ieee) here[ieeeKey(s.ieee)] = s;
      const best = {};
      // Only for devices without a router or coordinator next to them on this floor ("headless").
      const isRt = (k) => ["router", "coordinator"].includes((this._zha.byIeee[k] || {}).role);
      const local = new Set();
      for (const l of this._zha.links) if (here[l.a] && here[l.b] && l.a !== l.b) {
        if (isRt(l.b)) local.add(l.a);
        if (isRt(l.a)) local.add(l.b);
      }
      for (const l of this._zha.links) {
        const hk = here[l.a] && !here[l.b] ? l.a : here[l.b] && !here[l.a] ? l.b : null;
        if (hk && local.has(hk)) continue;
        if (!hk) continue;
        const gk = hk === l.a ? l.b : l.a;
        const g = idx.byIeee[gk];
        const z = this._zha.byIeee[gk];
        if (!g || !z || (z.role !== "router" && z.role !== "coordinator")) continue;
        if (l.lqi < this._net.minLqi || (this._net.lqiOff || []).includes(band(l.lqi))) continue;
        const s = here[hk];
        if (!best[s.key] || best[s.key].lqi < l.lqi) best[s.key] = { g, lqi: l.lqi, s };
      }
      for (const b of Object.values(best)) add(b.g, { from: b.s.key, cls: "zb", color: lqiColor(b.lqi) });
    }
    if (this._net.wlinks && this._netShow().includes("network")) {
      const aps = this._apList();
      for (const s of net) {
        if (!s.rt || !s.rt.home || !s.rt.ap) continue;
        const id = ((this._a && this._a.aps) || {})[s.rt.ap] || idx.aps[s.rt.ap];
        if (!id || this._specs.has(id) || !idx.byId[id]) continue;
        add(idx.byId[id], { from: s.key, cls: `wl ${s.rt.lan ? "cab" : ""}`, color: AP_COLORS[Math.max(0, aps.indexOf(s.rt.ap)) % AP_COLORS.length] });
      }
    }
    if (this._net.hubs) {
      for (const s of net) {
        const via = s.item.via;
        if (!via || this._specs.has(via) || !idx.byId[via]) continue;
        if (s.conns.includes("zigbee") && (idx.byId[via].conns || []).includes("zigbee")) continue; // Zigbee: its own links above
        add(idx.byId[via], { from: s.key, cls: "hub" });
      }
    }
    return [...out.values()];
  },

  /** Connections shown in Network: the viewer's choice, else the card's default. */
  _netShow() {
    if (Array.isArray(this._net.conns) && this._net.conns.length) return this._net.conns;
    const opts = this._ov("network");
    return Array.isArray(opts.connections) && opts.connections.length && !opts.connections.includes("all") ? opts.connections : CONN_ORDER;
  },

  /** 0.7.3: access points in a stable order (the one with most devices first) for their colours. */
  _apList() {
    const a = this._a || {};
    if (this._apA === a) return this._aps;
    const n = {};
    for (const d of Object.values(a.devices || {})) {
      const st = d.router && this._hass.states[d.router];
      const k = st && st.attributes.connected_to;
      if (k) n[k] = (n[k] || 0) + 1;
    }
    this._apA = a;
    this._aps = Object.keys(n).sort((x, y) => n[y] - n[x] || x.localeCompare(y));
    return this._aps;
  },

  /** 0.11: appliance "done" state lives in Home Assistant, shared by every screen (was browser storage). */
  _applLoad() {
    if (this._applLoading || !this._hass) return;
    this._applLoading = true;
    const k = `appl_${this._lsKey()}`;
    const old = lsGet(`dfc_${k}`); // one-time move from this browser
    this._hass
      .callWS({ type: "device_floorplan/card_state/get" })
      .then((r) => {
        const v = (r && r.card_state && r.card_state[k]) || old || {};
        this._applDone = { ...v, ...(this._applDone || {}) };
        this._applSent = JSON.stringify(v);
        if (old) {
          lsSet(`dfc_${k}`, null);
          this._applSave();
        }
        this._update(true);
      })
      .catch(() => {
        this._applLoading = false; // older backend: try again later
      });
  },

  _applSave() {
    if (!this._hass || this._applSent === undefined) return;
    const v = JSON.stringify(this._applDone || {});
    if (v === this._applSent) return;
    this._applSent = v;
    this._hass.callWS({ type: "device_floorplan/card_state/set", key: `appl_${this._lsKey()}`, value: this._applDone || {} }).catch(() => {});
  },

  _saveNet() {
    const n = this._net;
    lsSet(`dfc_net_${this._lsKey()}`, { conns: n.conns, roles: n.roles, links: n.links, hubs: n.hubs, wlinks: n.wlinks, legend: n.legend, lqiOff: n.lqiOff });
  },
});
