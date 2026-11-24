Object.assign(DeviceFloorplanCard.prototype, {

  // ------------------------------------------------------------- people (#67)
  _people() {
    return Array.isArray(this._config.people) ? this._config.people.filter((p) => p && p.entity) : [];
  },

  _peopleShown() {
    if (!this._people().length) return false;
    const ov = this._overlay;
    return ov === "live" || (Array.isArray(this._config.people_in) && this._config.people_in.includes(ov)) || this._pdOn();
  },

  /** Which room a person is in: room sensor 1, else 2; state = area name, id or alias of a room pin. */
  _personRoom(p, a) {
    const hass = this._hass;
    for (const sid of [p.room, p.room2]) {
      if (!sid) continue;
      const s = hass.states[sid];
      if (!live(s)) continue;
      const v = String(s.state).trim().toLowerCase();
      if (!v || ["not_home", "away", "none", "home"].includes(v)) continue;
      const vid = v.replace(/[\s-]+/g, "_");
      const hit = Object.entries(a.areas || {}).find(([id, ar]) => id.toLowerCase() === v || id.toLowerCase() === vid || String(ar.name || "").toLowerCase() === v || (ar.aliases || []).some((x) => String(x).toLowerCase() === v));
      if (!hit) continue;
      const c = Number((s.attributes || {}).confidence);
      const low = Number.isFinite(c) && (c <= 1 ? c < 0.5 : c < 50);
      return { id: hit[0], ar: hit[1], low };
    }
    return null;
  },

  _peopleData(a) {
    const hass = this._hass;
    const placed = [];
    const home = [];
    const rings = [];
    const pd = this._pdOn(); // 0.13.9.4: Network → Bluetooth shows the people with a distance sensor
    const proxies = pd ? this._pdProxies(a) : [];
    for (const p of this._people()) {
      if (pd && this._overlay === "network" && !p.distance) continue;
      const st = hass.states[p.entity];
      if (!st) continue;
      const name = p.name || entName(this._hass, p.entity);
      const pic = st.attributes && st.attributes.entity_picture ? (this._hass.hassUrl ? this._hass.hassUrl(st.attributes.entity_picture) : st.attributes.entity_picture) : null;
      const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const r = st.state === "home" || p.room || p.room2 ? this._personRoom(p, a) : null;
      const who = { eid: p.entity, name, pic, initials };
      if (r && st.state !== "not_home") {
        const rg = pd && p.distance ? this._pdRings(p, proxies) : [];
        rings.push(...rg);
        const spot = rg.length ? this._pdSpot(p.entity, r, rg, a) : null;
        placed.push({ ...who, room: r.id, roomName: r.ar.name, low: r.low, x: spot ? spot.x : r.ar.x, y: spot ? spot.y : r.ar.y, pd: !!spot });
      }
      else if (st.state === "home") home.push(who);
    }
    // Several people in one room: side by side under the room name.
    const W = this._boxW || 900;
    const H = W / (a.image_width && a.image_height ? a.image_width / a.image_height : 1.6);
    const size = (Number(this._look().size) || 34) * (this._scale || 1) * 1.15;
    const byRoom = {};
    for (const x of placed) if (!x.pd) (byRoom[x.room] = byRoom[x.room] || []).push(x);
    for (const list of Object.values(byRoom)) list.forEach((x, i) => {
      x.x += ((i - (list.length - 1) / 2) * size * 1.08 * 100) / W;
      x.y += (size * 0.95 * 100) / H;
    });
    return { placed, home, rings };
  },

  _peopleHtml(a) {
    if (!this._peopleShown()) return { plan: "", row: "" };
    const { placed, home, rings } = this._peopleData(a);
    const av = (x) => (x.pic ? `<img src="${cesc(x.pic)}" alt="">` : cesc(x.initials));
    const plan = this._pdRingsSvg(rings, a) + placed.map((x) => `<button class="m person ${edgeCls(x.x, x.y, this._em)} ${x.low ? "low" : ""} ${x.pd ? "pd" : ""}" style="left:${x.x}%;top:${x.y}%" data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${x.roomName}${x.low ? ` (${dfT("people.not_sure")})` : ""}`)}"><span class="ic">${av(x)}</span><span class="tip">${cesc(x.name)} · ${cesc(x.roomName)}</span></button>`).join("");
    const row = this._overlay === "live" && home.length ? `<div class="prow"><span>${dfT("people.home")}</span>${home.map((x) => `<button data-person="${cesc(x.eid)}" aria-label="${cesc(`${x.name}: ${dfT("people.home_unknown")}`)}"><span class="av">${av(x)}</span>${cesc(x.name)}</button>`).join("")}</div>` : "";
    return { plan, row };
  },

  /** Tell chip cards on this screen which overlay is showing (#73). */
  _announce() {
    if (this._announced === this._overlay) return;
    this._announced = this._overlay;
    const key = (this._config && this._config.card_id) || "_";
    window.__dfpActive = { ...(window.__dfpActive || {}), [key]: this._overlay };
    window.dispatchEvent(new CustomEvent("device-floorplan-overlay", { detail: { card_id: (this._config && this._config.card_id) || null, overlay: this._overlay } }));
  },

  _look() {
    const l = this._config.look || {};
    const markers = l.markers || (l.values === false || this._config.show_states === false ? "icon" : "icon_text");
    return { size: 34, chips: "dark", names: this._config.names || "hover", title: true, ...l, markers };
  },

  _buttons() {
    const b = this._config.buttons || {};
    const dock = (this._config.look || {}).dock;
    // 0.8.2: the Side Rail: full height at the card's left / right edge, plain icon buttons, dark by default.
    const rail = b.position === "rail_left" || b.position === "rail_right";
    return {
      position: rail ? b.position.slice(5) : b.position || (dock === "hidden" ? "hidden" : "bottom"),
      rail,
      style: b.style || (dock === "icons" ? "icons" : "labels"),
      space: rail ? "reserve" : b.space || "reserve",
      // 0.8.2: the bar (background) and the buttons are separate; old "sidebar" / "plain" shapes map onto them.
      shape: rail ? "rail" : BAR_SHAPES.includes(b.shape) ? b.shape : "pill",
      // 0.9.1: "contrast" = the opposite of the theme (dark on a light theme, light on a dark one); the rail's default.
      bar: rail ? (["theme", "dark"].includes(b.bar) ? b.bar : "contrast") : b.space === "float_icons" || b.shape === "plain" ? "clear" : b.shape === "sidebar" ? b.bar || "dark" : ["dark", "clear", "contrast"].includes(b.bar) ? b.bar : "theme",
      auto: b.auto_status === true,
      size: ["s", "l"].includes(b.size) ? b.size : "m",
      actions: b.actions || {},
      shortcuts: (Array.isArray(b.shortcuts) ? b.shortcuts : []).filter((x) => x && (x.name || x.icon)),
    };
  },

  /** 0.8.2: the automatic status of the built-in overlay buttons, from the devices on this floor. */
  _autoStatus() {
    const h = this._hass;
    const sen = this._sensor();
    const a = sen && sen.attributes;
    if (!h || !a) return {};
    const items = this._items(a).filter((i) => !i.phantom);
    if (!this._cx) this._cx = this._ctx(a);
    const lightItems = new Set(items.filter((i) => !this._hidden(i, "lights") && this._qualifies(i, "lights", a)).map((i) => i.id));
    const low = Number((this._config.health || {}).low ?? 20);
    const litItems = new Set(); // 0.11: lights on are counted per marker, like on the plan (a bond counts once)
    let sec = false;
    let health = false;
    let net = false;
    const seen = new Set();
    for (const it of items) {
      const mainSt = h.states[it.main_entity];
      if (it.main_entity && !it.bond && mainSt && devOffline(h, it)) {
        health = true;
        if ((it.conns || []).length) net = true;
      }
      const hasCover = (it.entities || []).some((e) => domainOf(e) === "cover");
      for (const e of it.entities || []) {
        if (seen.has(e)) continue;
        seen.add(e);
        const st = h.states[e];
        if (!st) continue;
        const k = kindOf(e, st);
        if (domainOf(e) === "light" && st.state === "on") {
          if (lightItems.has(it.id)) litItems.add(it.id);
        } else if (k === "opening" && st.state === "on" && !hasCover && ["door", "window", "garage_door"].includes(st.attributes.device_class)) sec = true;
        else if (domainOf(e) === "alarm_control_panel" && (/^armed/.test(st.state) || st.state === "triggered")) sec = true;
        else if (domainOf(e) === "lock" && st.state === "unlocked") sec = true;
        else if (k === "battery" && live(st) && num(st.state) && Number(st.state) <= low) health = true;
      }
    }
    let clean = null;
    for (const [eid, cfg] of Object.entries(a.robots || {})) {
      if (!h.states[eid]) continue;
      const inf = this._rbInfo(eid, rbRead(h, eid, cfg));
      if (inf.err) clean = { dot: "var(--error-color, #db4437)" };
      else if (inf.attn && !clean) clean = { dot: "#ffa000" };
    }
    const lights = litItems.size;
    return {
      cleaning: clean,
      lights: lights ? { badge: lights, color: "#F2B84B" } : null,
      security: sec ? { dot: "var(--error-color, #db4437)" } : null,
      health: health ? { dot: "#ffa000" } : null,
      network: net ? { dot: "var(--error-color, #db4437)" } : null,
    };
  },

  /** Status of a bar button: "auto" (built-ins), "off", or your own (entity + how it shows). */
  _btnStatus(st, auto) {
    if (st && st.mode === "off") return null;
    if (st && st.mode === "custom") return barStatus(this._hass, st);
    if (st && st.mode === "auto") return auto || null; // 0.13.1: chosen on this button, no need for the switch above
    return this._buttons().auto ? auto || null : null;
  },

  /** One bar button (an overlay or a shortcut), with its status on the icon (colour, dot or badge). */
  _barBtn({ attrs, cls, icon, label, st }) {
    const s = st || {};
    const col = s.color && s.badge == null ? ` style="color:${cesc(s.color)}"` : "";
    const mark = s.badge != null ? `<i class="bbadge"${s.color ? ` style="background:${cesc(s.color)}"` : ""}>${cesc(s.badge)}</i>` : s.dot ? `<i class="bdot" style="background:${cesc(s.dot)}"></i>` : "";
    return `<button class="${cls}" ${attrs} title="${cesc(label)}"><span class="bi"><ha-icon icon="${cesc(icon)}"${col}></ha-icon>${mark}</span><span class="bl">${cesc(label)}</span></button>`;
  },

  /** Tap / hold of a shortcut or an overlay's hold: Home Assistant actions, plus reload and back. */
  _barRun(act, ent) {
    if (!act || act.action === "none") return;
    if (this._pick) return this._toast(dfT("toast.no_shortcuts_editing"));
    if (act.action === "reload") return location.reload();
    if (act.action === "back") return history.back();
    this.dispatchEvent(new CustomEvent("hass-action", { detail: { config: { entity: ent, tap_action: act }, action: "tap" }, bubbles: true, composed: true }));
  },

  _barHold(t) {
    if (t.dataset.oact != null) {
      const x = this._ovActs()[Number(t.dataset.oact)];
      if (!x) return;
      if (x.hold_action) this._barRun(x.hold_action, this._ovActEnt(x));
      else if (this._ovActEnt(x)) this._moreInfo(this._ovActEnt(x));
      return;
    }
    const b = this._buttons();
    if (t.dataset.ov) {
      const act = (b.actions[t.dataset.ov] || {}).hold_action;
      if (act) this._barRun(act);
      return;
    }
    const sc = b.shortcuts[Number(t.dataset.sc)];
    if (!sc) return;
    const ent = (Array.isArray((sc.status || {}).entity) ? sc.status.entity[0] : (sc.status || {}).entity) || undefined;
    if (sc.hold_action) this._barRun(sc.hold_action, ent);
    else if (ent) this._moreInfo(ent);
  },

  _barTap(i) {
    const sc = this._buttons().shortcuts[i];
    if (!sc) return;
    const ent = (Array.isArray((sc.status || {}).entity) ? sc.status.entity[0] : (sc.status || {}).entity) || undefined;
    if (sc.tap_action) this._barRun(sc.tap_action, ent);
    else if (ent) this._moreInfo(ent);
    this._update(true);
  },

  _rooms() {
    return { style: "label", size: "m", hidden: [], names: {}, ...(this._config.rooms || {}) };
  },

  _lights() {
    return { switches: true, brightness: false, off: "faint", all_off: true, all_on: false, scenes: [], ...(this._config.lights || {}) };
  },

  _dev(id) {
    return (this._config.devices && this._config.devices[id]) || {};
  },

  _sensor() {
    const id = this._config && (this._floor || this._planIds()[0]);
    return planSensors(this._hass).find((s) => s.attributes.plan_id === id) || null;
  },

  // ------------------------------------------------------------- data
  /** Placed things: devices, helpers on their own, bonds (one item each). */
  _items(a) {
    const out = [];
    const bonds = a.bonds || {};
    const inBond = new Set();
    for (const b of Object.values(bonds)) for (const m of b.members || []) inBond.add(m);
    for (const [id, d] of Object.entries(a.devices || {})) {
      if (inBond.has(id)) continue;
      out.push({ id, ...d, standalone: false });
    }
    for (const [eid, e] of Object.entries(a.entities || {})) {
      const id = `entity:${eid}`;
      if (inBond.has(id)) continue;
      // Split device (#91): an entity of a device, shown where it acts.
      const of = e.of && (a.devices || {})[e.of];
      const group = e.of ? (domainOf(eid) === "light" ? "lights" : (of && of.group) || "plugs_switches") : "helpers";
      out.push({ id, ...e, main_entity: eid, entities: [eid], standalone: !e.of, group, ...(of ? { conns: of.conns || [], ofName: of.name } : {}) });
    }
    const memberOf = (m) => (a.devices || {})[m] || ((a.entities || {})[m.slice(7)] ? { ...(a.entities || {})[m.slice(7)], main_entity: m.slice(7), entities: [m.slice(7)] } : null);
    for (const [bid, b] of Object.entries(bonds)) {
      const mem = (b.members || []).map(memberOf).filter(Boolean);
      const groups = mem.map((d) => d.group);
      const all = [...new Set(mem.flatMap((d) => d.entities || [d.main_entity]).filter(Boolean))];
      const conns = [...new Set(mem.flatMap((d) => d.conns || []))];
      const zb = mem.find((d) => d.ieee);
      const rtr = (mem.find((d) => d.router) || {}).router;
      out.push({ id: `bond:${bid}`, bond: true, h: b.h, router: rtr, light: (mem.find((d) => d.light) || {}).light, lights: b.lights || "", mlights: mem.map((d) => ({ light: d.light, ent: d.main_entity })), name: bondName(b), icon: b.icon, tap: b.tap, show: b.show, x: b.x, y: b.y, px: b.px, py: b.py, main_entity: (b.entities || [])[0], entities: b.entities || [], allEntities: all, members: b.members || [], pic: (mem.find((d) => d.pic) || {}).pic, touch: (mem.find((d) => d.touch) || {}).touch, names: b.names || [], conns, ieee: zb ? zb.ieee : null, area: (mem[0] || {}).area, domain: b.domain, group: groups.includes("lights") || b.domain === "light" ? "lights" : groups[0] || "lights" });
    }
    // Phantoms (#60): an extra item with a combined value; its devices keep their own markers.
    // 0.13.9.8: mounting heights by marker id, so markers on one spot stack highest on top (see the layout).
    this._hIndex = this._hIndex || new Map();
    for (const it of out) {
      if (typeof it.h === "number") this._hIndex.set(it.id, it.h);
      else this._hIndex.delete(it.id);
    }
    for (const [pid, ph] of Object.entries(a.phantoms || {})) {
      if (!(ph.members || []).length) continue;
      const mem = ph.members.map((m) => [m, memberOf(m)]).filter((x) => x[1]);
      const byMember = {};
      const mgroup = {};
      for (const [m, d] of mem) {
        byMember[m] = d.entities || [d.main_entity];
        mgroup[m] = d.group || ""; // 0.12.9: which temperatures count as a room's (Comfort)
      }
      out.push({ id: `ph:${pid}`, phantom: true, name: ph.name || dfT("phantom"), icon: ph.icon, x: ph.x, y: ph.y, px: ph.px, py: ph.py, members: ph.members, names: mem.map(([, d]) => d.name), mains: mem.map(([, d]) => d.main_entity).filter(Boolean), units: phUnits(mem.map(([, d]) => d)), entities: ph.entities || [], byMember, mgroup, value: ph.value || "average", one: ph.one, group: "phantoms", ...(ph.pic ? { pic: ph.pic } : {}), ...(ph.touch ? { touch: ph.touch } : {}) });
    }
    return out;
  },

  /** 0.10.2: entities hidden in Home Assistant are never picked automatically (a raw sensor behind a template). */
  _hiddenInHA(e) {
    const re = this._hass && this._hass.entities && this._hass.entities[e];
    return !!(re && re.hidden);
  },

  _allowed(item) {
    const all = item.bond ? [...new Set([...(item.entities || []), ...(item.allEntities || [])])] : [...new Set([item.main_entity, ...(item.entities || [])].filter(Boolean))];
    return all.filter((e) => !this._hiddenInHA(e));
  },

  /** 0.11: the selected marker in Edit markers when it's hidden or idle: a real, drawable marker (the quick
   *  "does it qualify" answer is only a key, which drew as "undefined" in custom overlays). */
  _selSpec(item, ov, name) {
    const q = this._specsFor(item, ov, true).filter((x) => x && x.item);
    if (q.length) return q.slice(0, 1);
    if (ov === "health") return item.main_entity ? [this._offChip(item, name)] : []; // shows only when offline
    // 0.12.9: as it would look once shown (added): as itself, never a settings / technical value.
    const sp = this._asItself(item, name, this._addedLead(item));
    return sp ? [this._withExtras(sp, item, ov)] : [];
  },

  _hidden(item, overlay) {
    const o = this._dev(item.id);
    return Array.isArray(o.hide_in) && o.hide_in.includes(overlay);
  },

  _added(item, overlay) {
    const o = this._dev(item.id);
    if (this._ignoreAdded) return false;
    const c = this._custom().find((x) => x.id === overlay);
    return (Array.isArray(o.add_to) && o.add_to.includes(overlay)) || !!(c && Array.isArray(c.devices) && c.devices.includes(item.id));
  },

  _mainKind(item) {
    if (item.bond) {
      const k = item.main_entity ? kindOf(item.main_entity, this._hass.states[item.main_entity]) : null;
      return k || (item.domain === "cover" ? "cover" : item.domain === "switch" ? "switch" : "light");
    }
    return kindOf(item.main_entity, this._hass.states[item.main_entity]);
  },

  /** Context the Network overlay needs: which placed devices are hubs, ZHA data. */
  _ctx(a) {
    const placed = new Set(Object.keys(a.devices || {}));
    const hubs = new Set();
    for (const d of Object.values(a.devices || {})) if (d.via && placed.has(d.via) && !(d.conns || []).includes("zigbee")) hubs.add(d.via);
    return { hubs, zha: (this._zha && this._zha.byIeee) || {} };
  },
});
