
// ---------------------------------------------------------------------------------------------------------------
// 0.13.9.13 Mobile card (PLAN-MOBILE.md): `custom:device-floorplan-mobile`, a phone shell around the Floorplan.
// Only Floorplan data: plans = floors, plan rooms = rooms, placed devices / bonds / entities. The plan itself is the
// normal card (one code path), embedded without its card look; the shell adds pages, lists and the landscape explorer.
// ---------------------------------------------------------------------------------------------------------------
const DFM_GROUPS = ["lights", "comfort", "security", "media", "other"];
const DFM_GICON = { lights: "mdi:lightbulb-group-outline", comfort: "mdi:thermometer", security: "mdi:shield-home-outline", media: "mdi:television-classic", other: "mdi:dots-horizontal-circle-outline" };
const DFM_GOV = { lights: "lights", comfort: "comfort", security: "security", media: "live", other: "live" };
const DFM_TOGGLE = new Set(["light", "switch", "fan", "input_boolean", "humidifier", "media_player", "cover", "siren"]);
// Settings of a Floorplan card that the mobile card takes over (how things look and who the people are), never its layout.
const DFM_COPY = ["plans", "plan", "card_id", "people", "people_in", "rooms", "look", "live", "lights", "comfort", "security", "network", "health", "energy", "cleaning", "night", "custom_overlays", "overlays", "overlay_names", "devices", "markers"];
const dfmGroupLabel = (g) => dfT(`mob.g_${g}`);

// Device categories (Floorplan Editor) → the room page's groups; "sensors" go by what they measure.
const DFM_CAT = { lights: "lights", climate: "comfort", contacts: "security", motion: "security", cameras: "security", appliances: "media", media: "media", computers: "other", network: "other", plugs_switches: "other", buttons: "other", covers: "other", energy: "other", moving: "other", sensors: null };
// Real alarms (red). Tamper / generic safety / problem sensors are warnings (amber), never "things going on".
const DFM_ALARM_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "heat"]);
const DFM_NOT_HOUSE = new Set(["appliances", "media", "moving", "computers"]);

/** What a placed device is and does right now, from its entities and its category. */
function dfmInfo(hass, item) {
  const S = hass.states;
  const ents = [...new Set([item.main_entity, ...(item.allEntities || item.entities || [])])].filter((e) => e && S[e]);
  const kinds = ents.map((e) => [e, kindOf(e, S[e])]);
  const find = (...ks) => kinds.find((x) => ks.includes(x[1]));
  const mk = item.main_entity && S[item.main_entity] ? kindOf(item.main_entity, S[item.main_entity]) : null;
  const pick = (k) => (mk === k ? [item.main_entity, k] : find(k));
  let g = null;
  let lead = null;
  const order = [
    ["lights", ["light"]],
    ["comfort", ["climate", "fan"]],
    ["media", ["media", "appliance"]],
    ["security", ["opening", "lock", "alarm", "safety", "camera", "motion"]],
    ["comfort", ["temperature", "humidity"]],
  ];
  const mainG = order.find(([, ks]) => ks.includes(mk));
  if (mainG) [g, lead] = [mainG[0], item.main_entity];
  else {
    for (const [gg, ks] of order) {
      const hit = ks.map(pick).find(Boolean);
      if (hit) {
        [g, lead] = [gg, hit[0]];
        break;
      }
    }
  }
  if (!lead) {
    const sw = pick("switch");
    if (sw) [g, lead] = [item.group === "lights" ? "lights" : "other", sw[0]];
    else {
      // #29: the most telling entity: one with a real state, never a time / setting / button entity.
      const rank = (e) => {
        const s = S[e];
        const d = domainOf(e);
        const dc = s.attributes.device_class;
        let r = live(s) && s.state !== "unknown" ? 4 : 0;
        if (["select", "button", "number", "text", "time", "date", "datetime", "update", "event", "image", "scene", "input_select", "input_number", "input_text", "input_datetime", "input_button"].includes(d)) r -= 6;
        if (["timestamp", "date"].includes(dc)) r -= 5;
        if (e === item.main_entity) r += 1;
        if (["sensor", "binary_sensor", "switch", "cover", "lock", "vacuum"].includes(d)) r += 1;
        return r;
      };
      lead = ents.length ? ents.slice().sort((x, y) => rank(y) - rank(x))[0] : null;
    }
  }
  // The category the user set wins (sensors: by what they measure).
  const cat = item.category || item.group;
  if (cat && DFM_CAT[cat]) g = DFM_CAT[cat];
  if (!g) g = "other";
  // #29: fans and air purifiers are about comfort, whatever their category.
  if (g !== "lights" && kinds.some(([e, k]) => k === "fan" || domainOf(e) === "humidifier")) g = "comfort";
  const st = lead ? S[lead] : null;
  const lk = st ? kindOf(lead, st) : null;
  const isOn = (e, k) => {
    const s = S[e];
    if (!live(s)) return false;
    if (k === "media") return ["playing", "on", "paused"].includes(s.state);
    if (k === "climate") return s.state !== "off";
    if (k === "appliance") return ["on", "cleaning", "running", "mowing", "returning"].includes(s.state);
    if (k === "cover") return s.state === "open" || s.state === "opening";
    return ["light", "switch", "fan"].includes(k) && s.state === "on";
  };
  const on = !!(lead && isOn(lead, lk));
  const dcOf = (e) => S[e].attributes.device_class;
  // Doors and windows of the house only: an appliance's or a car's door is part of that thing.
  // #40: by what the device is (an appliance, media, a car), not only by its category.
  const thing = kinds.some(([, k]) => k === "appliance" || k === "media") || APPL_TYPES.includes(item.as) || (item.light && ["drum", "line"].includes(item.light.type));
  const house = !DFM_NOT_HOUSE.has(cat) && g !== "media" && !thing;
  const opens = kinds.filter(([e, k]) => k === "opening" && S[e].state === "on").map(([e]) => e);
  const open = house ? opens : [];
  const doorOpen = !house && opens.length > 0;
  const alarm = kinds.filter(([e, k]) => (k === "safety" && DFM_ALARM_DC.has(dcOf(e)) && S[e].state === "on") || (k === "alarm" && S[e].state === "triggered")).map(([e]) => e);
  const warn = kinds.filter(([e, k]) => S[e].state === "on" && ((k === "safety" && !DFM_ALARM_DC.has(dcOf(e))) || (k === "binary" && dcOf(e) === "problem"))).map(([e]) => e);
  const presence = kinds.some(([e, k]) => k === "motion" && S[e].state === "on");
  const offline = !!(item.main_entity && S[item.main_entity] && S[item.main_entity].state === "unavailable");
  const temps = [];
  const hums = [];
  for (const [e, k] of kinds) {
    const s = S[e];
    if (!live(s)) continue;
    if (k === "temperature" && num(s.state)) temps.push(Number(s.state));
    if (k === "humidity" && num(s.state)) hums.push(Number(s.state));
    if (k === "climate") {
      if (num(s.attributes.current_temperature)) temps.push(Number(s.attributes.current_temperature));
      if (num(s.attributes.current_humidity)) hums.push(Number(s.attributes.current_humidity));
    }
  }
  const bat = kinds.find(([e, k]) => k === "battery" && num(S[e].state));
  const sig = kinds.find(([, k]) => k === "signal");
  const pw = ents.map((e) => powerW(S[e])).filter((v) => v != null);
  const attention = open.length + alarm.length; // #31: offline is a small amber badge, not red
  return {
    item, g, cat, lead, st, lk, on, open, doorOpen, alarm, warn, presence, offline, temps, hums, ents, attention,
    battery: bat ? Number(S[bat[0]].state) : null, batEnt: bat ? bat[0] : null, sigEnt: sig ? sig[0] : null,
    power: pw.length ? pw.reduce((x, y) => x + y, 0) : null,
    conns: item.conns || [], name: item.name || (st && st.attributes.friendly_name) || item.id,
  };
}

/** A room's icon when neither the Floorplan nor Home Assistant has one: by the words in its name. */
function dfmRoomIcon(name) {
  const n = String(name || "").toLowerCase();
  const by = [
    [/kitchen|κουζ|küche/, "mdi:silverware-fork-knife"], [/bath|μπάν|bad\b/, "mdi:shower"], [/wc|toilet|τουαλ/, "mdi:toilet"],
    [/living|σαλόν|wohn/, "mdi:sofa"], [/bed|υπνοδ|schlaf|room|δωμάτ|zimmer/, "mdi:bed"], [/entr|είσοδ|eingang|hall|διάδρ|corridor|flur/, "mdi:door"],
    [/balcon|μπαλκ|terrace|βεράντ/, "mdi:balcony"], [/garage|parking|γκαράζ|πάρκ/, "mdi:garage"], [/office|γραφ|büro|study/, "mdi:desk"],
    [/laundry|πλυντ|wasch/, "mdi:washing-machine"], [/garden|κήπ|garten/, "mdi:flower"], [/storage|αποθ|keller|cellar/, "mdi:archive"],
  ];
  const hit = by.find(([re]) => re.test(n));
  return hit ? hit[1] : "mdi:floor-plan";
}

/** #23: bring `to` in line with `from` in place: same nodes stay (and keep what is inside a plan slot), so nothing
 *  jumps, reloads or loses its scroll; only changed texts and attributes are touched. */
function dfmMorph(to, from) {
  const a = [...to.childNodes];
  const b = [...from.childNodes];
  for (let i = 0; i < b.length; i++) {
    const n = b[i];
    const o = a[i];
    if (!o) {
      to.appendChild(n);
      continue;
    }
    const slotO = o.nodeType === 1 ? o.getAttribute("data-slot") : null;
    const slotN = n.nodeType === 1 ? n.getAttribute("data-slot") : null;
    if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || slotO !== slotN) {
      to.replaceChild(n, o);
      continue;
    }
    if (o.nodeType !== 1) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
      continue;
    }
    const focused = o.getRootNode().activeElement === o;
    for (const at of [...o.attributes]) if (!n.hasAttribute(at.name) && !(slotO && at.name === "style")) o.removeAttribute(at.name);
    for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value && !(focused && at.name === "value")) o.setAttribute(at.name, at.value);
    if (o.localName === "input" && !focused && n.hasAttribute("value") && o.value !== n.getAttribute("value")) o.value = n.getAttribute("value");
    if (slotO) continue; // the plan inside is kept as it is
    dfmMorph(o, n);
  }
  for (let i = a.length - 1; i >= b.length; i--) if (a[i].parentNode === to) to.removeChild(a[i]);
}

const dfmAvg = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 10) / 10 : null);

class DeviceFloorplanMobile extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "room_order", selector: { select: { mode: "dropdown", options: ["active", "alpha", "plan"].map((v) => ({ value: v, label: dfT(`mob.order_${v}`) })) } } },
        { name: "default_overlay", selector: { select: { mode: "dropdown", options: OVERLAY_ORDER.map((v) => ({ value: v, label: OVERLAYS[v].label })) } } },
        { name: "layout", selector: { select: { mode: "dropdown", options: ["auto", "portrait", "landscape"].map((v) => ({ value: v, label: dfT(`mob.layout_${v}`) })) } } },
        { name: "hide_header", selector: { boolean: {} } },
        { name: "copy_settings", selector: { boolean: {} } },
      ],
      computeLabel: (s) => dfT(`mob.cfg_${s.name}`),
      computeHelper: (s) => (s.name === "copy_settings" ? dfT("mob.cfg_copy_help") : s.name === "hide_header" ? dfT("mob.cfg_hide_help") : s.name === "layout" ? dfT("mob.cfg_layout_help") : undefined),
    };
  }

  setConfig(config) {
    this._config = { room_order: "active", default_overlay: "live", layout: "auto", copy_settings: true, hide_header: true, ...(config || {}) };
    this._s = this._s || { page: "home", floor: null, room: null, ov: null, back: [] };
    this._tab = this._tab || null;
    this._kick();
  }

  set hass(hass) {
    dfLangOf(hass);
    this.toggleAttribute("dark", !!(hass.themes && hass.themes.darkMode));
    const first = !this._hass;
    this._hass = hass;
    if (first) this._loadBase();
    for (const el of (this._plans || new Map()).values()) el.hass = hass;
    this._kick();
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._click(e));
      this.shadowRoot.addEventListener("change", (e) => this._change(e));
      this.shadowRoot.addEventListener("input", (e) => this._input(e));
      this.shadowRoot.addEventListener("pointerdown", (e) => this._pdown(e), true);
      this.shadowRoot.addEventListener("pointerup", (e) => this._pup(e), true);
      this.shadowRoot.addEventListener("pointercancel", () => (this._ptr = null), true);
      this.shadowRoot.addEventListener("scroll", () => (this._scrollAt = Date.now()), true);
    }
    this._onScroll = this._onScroll || (() => (this._scrollAt = Date.now()));
    window.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
    this._onRot = this._onRot || (() => this._kick(true));
    window.addEventListener("resize", this._onRot);
    this._kick(true);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onRot);
    window.removeEventListener("scroll", this._onScroll, { capture: true });
    this._hideHdr(true);
    clearTimeout(this._t);
    clearTimeout(this._hdrT);
  }

  // ------------------------------------------------------------- settings of the main Floorplan card
  /** The first Floorplan card on the user's dashboards: its people, rooms, look and overlay settings (cached). */
  async _loadBase() {
    if (this._config.copy_settings === false) return;
    try {
      this._base = lsGet("dfm_base") || null;
    } catch (_e) {
      this._base = null;
    }
    try {
      const boards = await this._hass.callWS({ type: "lovelace/dashboards/list" }).catch(() => []);
      const paths = [null, ...boards.filter((b) => b.mode !== "yaml" || true).map((b) => b.url_path)];
      const walk = (n, out) => {
        if (!n || typeof n !== "object" || out.length) return;
        if (Array.isArray(n)) return n.forEach((x) => walk(x, out));
        if (n.type === "custom:device-floorplan-card") return out.push(n);
        for (const v of Object.values(n)) if (v && typeof v === "object") walk(v, out);
      };
      for (const p of paths) {
        const cfg = await this._hass.callWS({ type: "lovelace/config", ...(p ? { url_path: p } : {}) }).catch(() => null);
        const out = [];
        walk(cfg, out);
        if (out.length) {
          const b = {};
          for (const k of DFM_COPY) if (out[0][k] !== undefined) b[k] = out[0][k];
          this._base = b;
          lsSet("dfm_base", b);
          for (const el of (this._plans || new Map()).values()) el._dfmCfg = null;
          this._kick(true);
          return;
        }
      }
    } catch (_e) {
      /* no other card: defaults */
    }
  }

  // ------------------------------------------------------------- the model (floors, rooms, items)
  _model() {
    const hass = this._hass;
    const b = this._base || {};
    // #30: the plans that are floors (a level set in the Floorplan Editor), unless the card names its plans.
    const want = Array.isArray(this._config.plans) && this._config.plans.length ? this._config.plans : null;
    const all = planSensors(hass);
    const leveled = all.filter((x) => Number.isFinite(x.attributes.level));
    const sens = want ? all.filter((x) => want.includes(x.attributes.plan_id)) : leveled.length ? leveled : all;
    const floors = sens.map((s, i) => {
      const a = s.attributes;
      return { id: a.plan_id, a, i, level: a.level, name: a.plan_name || a.plan_id, label: floorLabel(a.level, a.plan_name) };
    }).sort((x, y) => (Number.isFinite(y.level) ? y.level : -99) - (Number.isFinite(x.level) ? x.level : -99) || x.i - y.i);
    if (want) floors.sort((x, y) => (Number.isFinite(y.level) ? y.level : -99) - (Number.isFinite(x.level) ? x.level : -99) || want.indexOf(x.id) - want.indexOf(y.id));
    const rooms = [];
    const items = [];
    const seen = new Set();
    for (const f of floors) {
      const order = Object.keys(f.a.areas || {});
      const byRoom = new Map(order.map((id) => [id, []]));
      const h = this._helper(f);
      for (const item of h._items(f.a)) {
        if (item.phantom) continue;
        const key = item.id.startsWith("bond:") ? `${f.id}|${item.id}` : item.id;
        if (seen.has(key) && !item.x && !item.px) continue;
        seen.add(key);
        const info = dfmInfo(hass, item);
        info.floor = f.id;
        // The overlays this device belongs to, by the Floorplan card's own rules and the user's settings (#25),
        // and the ones that show it right now.
        info.ovs = new Set();
        info.now = new Set();
        for (const o of this._overlayList(f)) {
          if (o === "plan" || h._hidden(item, o)) continue;
          let q = false;
          let n = false;
          try {
            q = h._specsFor(item, o, true).length > 0;
            n = q && h._specsFor(item, o, false).length > 0;
          } catch (_e) {
            q = false;
          }
          if (!q && o === "live" && h._applOf(item)) [q, n] = [true, info.on]; // #40: running appliances count in Live only
          if (q) info.ovs.add(o);
          if (n) info.now.add(o);
        }
        // #29: what the card shows in Lights is a light here too (a switch / plug used as a light).
        if (info.ovs.has("lights") && info.g !== "lights" && !h._applOf(item)) info.g = "lights";
        info.room = h._roomOf(item, f.a) || (item.area_id && byRoom.has(item.area_id) ? item.area_id : null);
        items.push(info);
        if (info.room) byRoom.get(info.room).push(info);
      }
      order.forEach((id, idx) => {
        const ar = f.a.areas[id];
        const list = byRoom.get(id);
        const names = ((this._base || {}).rooms || {}).names || {};
        const hidden = ((this._base || {}).rooms || {}).hidden || [];
        if (hidden.includes(id) && !list.length) return;
        const area = (hass.areas || {})[id];
        const r = {
          id, floor: f.id, ar, idx, name: names[id] || ar.name || (area && area.name) || id, icon: ar.icon || (area && area.icon) || dfmRoomIcon(names[id] || ar.name || id), items: list,
          offline: list.filter((x) => x.offline).length, low: list.filter((x) => x.battery != null && x.battery <= 15).length, warns: list.filter((x) => x.warn.length).length,
          on: list.filter((x) => x.on).length, attention: list.reduce((n, x) => n + x.attention, 0), presence: list.some((x) => x.presence),
          lightsOn: list.filter((x) => x.g === "lights" && x.on).length,
          temp: dfmAvg(list.flatMap((x) => x.temps)), hum: dfmAvg(list.flatMap((x) => x.hums)),
        };
        r.people = [];
        rooms.push(r);
      });
    }
    // People: the main card's list, else every person.
    const ppl = this._peopleList();
    const people = ppl.map((p) => {
      const st = hass.states[p.entity];
      let room = null;
      for (const f of floors) {
        const hit = DeviceFloorplanCard.prototype._personRoom.call({ _hass: hass }, p, f.a);
        if (hit) {
          room = rooms.find((r) => r.floor === f.id && r.id === hit.id) || null;
          break;
        }
      }
      if (room) room.people.push(p);
      return { ...p, st, room, home: !!st && st.state === "home", name: (st && st.attributes.friendly_name) || p.entity, pic: st && st.attributes.entity_picture };
    });
    for (const r of rooms) {
      if (r.people.length) r.presence = true;
      r.score = r.attention * 100 + r.on * 10 + (r.presence ? 1 : 0);
    }
    // The house: levels (plans with the same level side by side); plans without a level are views, not floors.
    const levels = [];
    for (const f of floors) {
      if (!Number.isFinite(f.level)) continue;
      const lv = levels.find((x) => x.level === f.level);
      if (lv) lv.plans.push(f);
      else levels.push({ level: f.level, plans: [f] });
    }
    return { floors, rooms, items, people, levels };
  }

  /** #31: every person in Home Assistant (or the card's own list); where they are from the Floorplan card's people settings. */
  _peopleList() {
    const b = this._base || {};
    const conf = new Map((Array.isArray(b.people) ? b.people : []).filter((p) => p && p.entity).map((p) => [p.entity, p]));
    const ids = Array.isArray(this._config.people) ? this._config.people.map((p) => (typeof p === "string" ? p : p && p.entity)).filter(Boolean) : Object.keys(this._hass.states).filter((e) => e.startsWith("person."));
    return ids.map((entity) => conf.get(entity) || { entity });
  }

  /** A card instance (never shown) for the shared helpers: items, rooms, overlays, people. */
  _helper(f) {
    if (!f) return null;
    this._hs = this._hs || {};
    let h = this._hs[f.id];
    if (!h) h = this._hs[f.id] = document.createElement("device-floorplan-card");
    if (!h._config || h._dfmB !== this._base) {
      h._dfmB = this._base;
      h._config = { ...(this._base || {}), plans: undefined, plan: f.id };
      h._lay = {};
      h._floor = f.id;
    }
    h._hass = this._hass;
    if (h._a !== f.a) {
      h._a = f.a;
      h._cx = h._ctx(f.a);
    }
    return h;
  }

  _overlayList(f) {
    const h = this._helper(f);
    try {
      return h ? h._overlays() : OVERLAY_ORDER;
    } catch (_e) {
      return OVERLAY_ORDER;
    }
  }

  _ovLabel(o, f) {
    const h = this._helper(f);
    const names = ((this._base || {}).overlay_names) || {};
    const d = h ? h._ovDef(o) : OVERLAYS[o];
    return names[o] || (d && d.label) || o;
  }

  _ovIcon(o, f) {
    const h = this._helper(f);
    const d = h ? h._ovDef(o) : OVERLAYS[o];
    return (d && d.icon) || "mdi:layers-outline";
  }

  _sortRooms(list) {
    const o = this._config.room_order;
    const a = list.slice();
    if (o === "alpha") return a.sort((x, y) => x.name.localeCompare(y.name));
    if (o === "plan") return a;
    // Most active first; the order is taken once while the list is open, so rows do not jump.
    const key = a.map((r) => r.id).join(",");
    if (this._frozen && this._frozen.key === key) return this._frozen.ids.map((id) => a.find((r) => r.id === id)).filter(Boolean);
    a.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
    if (this._freeze) this._frozen = { key, ids: a.map((r) => r.id) };
    return a;
  }

  // ------------------------------------------------------------- render
  _kick(now = false) {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    if (this._busy && !now) return;
    clearTimeout(this._t);
    const wait = now ? 0 : Math.max(0, 400 - (Date.now() - (this._last || 0)));
    this._t = setTimeout(() => this._render(), wait);
  }

  _land() {
    const l = this._config.layout;
    if (l === "landscape") return true;
    if (l === "portrait") return false;
    return window.innerWidth > window.innerHeight && window.innerHeight <= 600;
  }

  _render() {
    if (!this._hass || !this.shadowRoot || !this.isConnected) return;
    // #23: never while a finger is on the screen or the page is scrolling; right after.
    if (this._ptr || Date.now() - (this._scrollAt || 0) < 450) {
      clearTimeout(this._t);
      this._t = setTimeout(() => this._render(), 300);
      return;
    }
    this._last = Date.now();
    const m = (this._m = this._model());
    const s = this._s;
    const root = this.shadowRoot;
    if (!root.querySelector("style#dfm")) root.innerHTML = `<style id="dfm">${DFM_CSS}</style><div class="dfm"></div>`;
    const host = root.querySelector("div.dfm");
    this._hideHdr();
    if (!m.floors.length) {
      host.innerHTML = `<div class="empty">${dfT("mob.no_plans")}</div>`;
      return;
    }
    // #22: Home starts on the main floor: the floor (a plan with a level) with the most devices; ties: the ground floor.
    if (!s.floor || !m.floors.some((f) => f.id === s.floor)) {
      const cand = m.floors.filter((f) => Number.isFinite(f.level));
      s.floor = (cand.length ? cand : m.floors).map((f) => [f, m.items.filter((x) => x.floor === f.id).length]).sort((p, q) => q[1] - p[1] || (q[0].level === 0) - (p[0].level === 0))[0][0].id;
    }
    if (s.room && !m.rooms.some((r) => r.id === s.room && r.floor === s.floor)) s.room = null;
    if (s.page === "room" && !s.room) s.page = "home";
    const land = this._land();
    if (land !== this._wasLand) {
      this._wasLand = land;
      this._hdrHidden = false;
    }
    const html = land ? this._landHtml(m) : this._portHtml(m);
    if (html !== this._html) {
      this._html = html;
      const tpl = document.createElement("div");
      tpl.innerHTML = html;
      dfmMorph(host, tpl);
    }
    for (const el of root.querySelectorAll("[data-ent]")) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.ent];
    }
    for (const slot of root.querySelectorAll("[data-slot]")) this._mount(slot);
    const top = this._hdrOn ? 0 : Math.max(0, Math.round(this.getBoundingClientRect().top + (window.scrollY || 0)));
    if (top !== this._top) {
      this._top = top;
      this.style.setProperty("--dfm-top", `${top}px`);
    }
    if (land) {
      this._fitLand();
      this._hdrTimer();
    }
    this._scaleAll();
    requestAnimationFrame(() => {
      if (land) this._fitLand();
      this._scaleAll();
    });
  }

  /** #28: the landscape plan as large as fits the left area, centred, never cut (the card's own fit is not used). */
  _fitLand() {
    const left = this.shadowRoot.querySelector(".left");
    const slot = left && left.querySelector(".lplan");
    const el = slot && slot.firstElementChild;
    const fr = el && el.shadowRoot && el.shadowRoot.querySelector(".fr");
    if (!fr) return;
    const ratio = parseFloat(fr.style.getPropertyValue("--fratio")) || 1.6;
    const W = left.clientWidth - 24;
    const H = left.clientHeight - 24;
    if (W <= 0 || H <= 0) return;
    const w = Math.min(W - 16, (H - 8) * ratio);
    const h = w / ratio;
    const st = `width:${Math.round(w + 16)}px;height:${Math.round(h + 8)}px;left:${Math.round((W + 24 - w - 16) / 2)}px;top:${Math.round((H + 24 - h - 8) / 2)}px;--dfc-fit-h:${Math.round(h)}px`;
    if (slot.getAttribute("style") !== st) slot.setAttribute("style", st);
  }

  /** #20: Home Assistant's top bar hidden on this dashboard, on phones, while the card is open (option). Only a
   *  style in this dashboard's own hui-root; removed when the card goes. If HA changes, the bar just shows again. */
  _huiRoot() {
    let n = this;
    for (let i = 0; i < 20 && n; i++) {
      const r = n.getRootNode();
      if (!r || !r.host) return null;
      if (r.host.localName === "hui-root") return r;
      n = r.host;
    }
    return null;
  }

  _hideHdr(off = false) {
    const want = !off && this._config.hide_header !== false && this.isConnected && Math.min(window.innerWidth, window.innerHeight) <= 600 && !/[?&]edit=1/.test(location.search);
    const r = this._huiRoot();
    if (!r) {
      this._hdrOn = false;
      return;
    }
    let st = r.getElementById ? r.getElementById("dfm-hide-hdr") : r.querySelector("#dfm-hide-hdr");
    if (want && !st) {
      st = document.createElement("style");
      st.id = "dfm-hide-hdr";
      st.textContent = `.header, .toolbar, app-header, app-toolbar, ha-top-app-bar, ha-top-app-bar-fixed { display: none !important; }
        :host { --header-height: 0px !important; }
        #view { padding-top: env(safe-area-inset-top) !important; min-height: 100vh !important; }`;
      r.appendChild(st);
    } else if (!want && st) st.remove();
    this._hdrOn = want;
  }

  /** A plan (the normal card) for a slot: kept between redraws, so it never reloads or blinks. */
  _mount(slot) {
    const [plan, ov, focus, mode] = slot.dataset.slot.split("|");
    const key = slot.dataset.slot;
    this._plans = this._plans || new Map();
    let el = this._plans.get(key);
    if (!el) {
      el = document.createElement("device-floorplan-card");
      el.addEventListener("click", (e) => this._planTap(e, el), true);
      this._plans.set(key, el);
      if (this._plans.size > 8) {
        const old = [...this._plans.keys()].find((k) => k !== key && !this.shadowRoot.querySelector(`[data-slot="${CSS.escape(k)}"]`));
        if (old) this._plans.delete(old);
      }
    }
    const b = this._base || {};
    const full = mode === "full";
    const cfg = {
      ...b, plans: undefined, card_id: undefined, type: "custom:device-floorplan-card", plan, buttons: { position: "hidden" }, layers_button: full ? "top-right" : "hidden",
      replay: full ? undefined : false, hide_admin_hint: true, remember_floor: false, default_overlay: ov,
      ...(focus ? { focus_area: focus, focus_aspect: this._bandAspect(mode), rooms: { ...(b.rooms || {}), show_in: [] } } : {}),
      // #41: portrait plans are Live with one temperature · humidity chip per room.
      ...(["mini", "floor", "room"].includes(mode) ? { room_values: true } : {}),
    };
    const sig = JSON.stringify(cfg);
    if (el._dfmCfg !== sig) {
      el._dfmCfg = sig;
      el.setConfig(cfg);
    }
    el._dfmMode = mode;
    el._dfmFloor = plan;
    el._fitHost = false;
    if (el.parentNode !== slot) slot.appendChild(el);
    if (this._hass) el.hass = this._hass;
    if (el.dfSetOverlay) el.dfSetOverlay(ov);
  }

  /** #33: the room band's shape: the screen's width × a third of its height (portrait); the left area (landscape). */
  _bandAspect(mode) {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 844;
    const a = mode === "landroom" ? (w * 0.66 - 24) / Math.max(200, h - (this._top || 0) - 24) : w / (h / 3);
    return Math.round(a * 100) / 100;
  }

  /** #32: icons, chips and names on a plan scaled by (plan width on the phone ÷ 900 px), 0.45–1; a room cut-out by the
   *  width the whole plan would have at that zoom. */
  _scaleAll() {
    for (const el of (this._plans || new Map()).values()) {
      if (!el.isConnected || !el.shadowRoot) continue;
      const fr = el.shadowRoot.querySelector(".fr");
      if (!fr) continue;
      let w = fr.getBoundingClientRect().width;
      if (!w) continue;
      const ff = el._config && el._config.focus_area && el._a && el._focusFrame ? el._focusFrame(el._a) : null;
      if (ff) w /= Math.max(0.05, (100 + ff.l + ff.r) / 100);
      const k = Math.max(0.45, Math.min(1, w / 900)).toFixed(2);
      if (el.style.getPropertyValue("--dfc-ui") !== k) el.style.setProperty("--dfc-ui", k);
    }
  }

  _slot(plan, ov, focus = "", mode = "mini", cls = "") {
    return `<div class="plan ${cls}" data-slot="${cesc([plan, ov, focus, mode].join("|"))}"></div>`;
  }

  /** Taps on an embedded plan (#21): a whole floor is tapped only to open a room; devices only in a room. The
   *  card's own buttons (Layers, Replay) keep working. */
  _planTap(e, el) {
    if (this._swAt && Date.now() - this._swAt < 500) return this._stop(e);
    const mode = el._dfmMode;
    const path = e.composedPath();
    const inBox = path.some((n) => n && n.classList && n.classList.contains("box"));
    if (!inBox) return; // the card's own buttons and menus
    if (mode === "room" || mode === "landroom") {
      const k = path.find((n) => n && n.dataset && n.dataset.k);
      this._stop(e);
      const sp = k && el._specs && el._specs.get(k.dataset.k);
      const eid = sp && (sp.eid || (sp.ents || [])[0] || (sp.item && sp.item.main_entity));
      if (eid) this._more(eid);
      return;
    }
    this._stop(e);
    const box = path.find((n) => n && n.classList && n.classList.contains("box"));
    const r = box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const f = this._m.floors.find((q) => q.id === el._dfmFloor);
    const areas = (f && f.a.areas) || {};
    let hit = Object.keys(areas).find((id) => Array.isArray(areas[id].shape) && areas[id].shape.length >= 3 && inPoly(x, y, areas[id].shape));
    if (!hit) {
      const near = Object.entries(areas).map(([id, ar]) => [id, Math.hypot(ar.x - x, ar.y - y)]).sort((p, q) => p[1] - q[1])[0];
      if (near && near[1] < 10) hit = near[0];
    }
    if (hit && this._m.rooms.some((q) => q.id === hit && q.floor === f.id)) this._go({ page: "room", floor: f.id, room: hit });
  }

  _stop(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** One-finger swipe anywhere on a swipe area (#28): next / previous room or floor. */
  _pdown(e) {
    this._ptr = true;
    this._touched();
    const z = e.composedPath().find((n) => n && n.dataset && n.dataset.swipe);
    this._sw = z ? { x: e.clientX, y: e.clientY, t: Date.now(), zone: z.dataset.swipe } : null;
  }

  _pup(e) {
    this._ptr = null;
    const sw = this._sw;
    this._sw = null;
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - sw.t > 900) return;
    this._swAt = Date.now();
    this._step(dx < 0 ? 1 : -1, sw.zone);
  }

  _step(dir, zone) {
    const s = this._s;
    const m = this._m;
    if (zone === "room" || (!zone && s.page === "room")) {
      const list = this._sortRooms(m.rooms.filter((r) => r.floor === s.floor));
      const i = list.findIndex((r) => r.id === s.room);
      const n = list[(i + dir + list.length) % list.length];
      if (n) {
        s.room = n.id;
        this._kick(true);
      }
      return;
    }
    const fl = m.floors;
    const i = fl.findIndex((f) => f.id === s.floor);
    const n = fl[(i - dir + fl.length) % fl.length];
    if (n && n.id !== s.floor) {
      s.floor = n.id;
      this._kick(true);
    }
  }

  // ------------------------------------------------------------- navigation
  _go(next) {
    const s = this._s;
    s.back.push({ page: s.page, floor: s.floor, room: s.room, ov: s.ov });
    if (s.back.length > 30) s.back.shift();
    Object.assign(s, next);
    this._sheet = null;
    this._frozen = null;
    this._kick(true);
    const pg = this.shadowRoot && this.shadowRoot.querySelector("[data-scroll=pg]");
    if (pg) pg.scrollTop = 0;
  }

  _back() {
    const s = this._s;
    if (this._land()) {
      // Landscape: one level out (room → floor → house).
      if (s.page === "room") Object.assign(s, { page: "rooms", room: null });
      else if (this._m.levels.length > 1) Object.assign(s, { page: "house", room: null });
      this._kick(true);
      return;
    }
    const p = s.back.pop();
    if (p) Object.assign(s, p);
    else Object.assign(s, { page: "home", room: null });
    this._kick(true);
  }

  _more(eid) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: eid }, bubbles: true, composed: true }));
  }

  _touched() {
    if (!this._land()) return;
    const was = this._hdrHidden;
    this._hdrShow = Date.now();
    if (was) {
      this._hdrHidden = false;
      const h = this.shadowRoot.querySelectorAll(".float");
      for (const x of h) x.classList.remove("gone");
    }
    this._hdrTimer();
  }

  _hdrTimer() {
    clearTimeout(this._hdrT);
    this._hdrT = setTimeout(() => {
      this._hdrHidden = true;
      for (const x of this.shadowRoot.querySelectorAll(".float")) x.classList.add("gone");
    }, 5000);
  }

  _click(e) {
    const t = e.target.closest("[data-a]");
    if (!t) return;
    const a = t.dataset.a;
    const v = t.dataset.v;
    const s = this._s;
    if (a === "back") return this._back();
    if (a === "menu") return this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    if (a === "list") {
      this._sheet = { step: "list" };
      return this._kick(true);
    }
    if (a === "tab") return this._go({ page: v, room: null });
    if (a === "house") return this._go({ page: "house", room: null });
    if (a === "home") {
      if (s.page !== "home" && s.page !== "house") return this._go({ page: "home", room: null });
      this._sheet = this._m.floors.length > 1 ? { step: "floors" } : { step: "rooms", floor: s.floor };
      this._freeze = true;
      this._frozen = null;
      return this._kick(true);
    }
    if (a === "sheet-floor") {
      this._sheet = { step: "rooms", floor: v };
      this._frozen = null;
      return this._kick(true);
    }
    if (a === "sheet-back") {
      this._sheet = { step: "floors" };
      return this._kick(true);
    }
    if (a === "close") {
      this._sheet = null;
      this._freeze = false;
      return this._kick(true);
    }
    if (a === "floor") return this._go({ page: "rooms", floor: v, room: null });
    if (a === "room") {
      const [f, r] = v.split("|");
      this._freeze = false;
      return this._go({ page: "room", floor: f, room: r });
    }
    if (a === "ov") return this._go({ page: "plan", ov: v, floor: t.dataset.f || s.floor });
    if (a === "rp") {
      this._go({ page: "plan", ov: s.ov || this._config.default_overlay });
      setTimeout(() => {
        const el = [...(this._plans || new Map()).values()].find((x) => x._dfmMode === "full" && x.isConnected);
        if (el && el._rpOpen) el._rpOpen(true);
      }, 300);
      return;
    }
    if (a === "ltab") {
      this._tab = v;
      return this._kick(true);
    }
    if (a === "step") return this._step(Number(v), t.dataset.z);
    if (a === "fstep") return this._step(Number(v), "floor");
    if (a === "more") return this._more(v);
    if (a === "tog") {
      e.stopPropagation();
      const st = this._hass.states[v];
      if (!st) return;
      const d = domainOf(v);
      const svc = d === "cover" ? "toggle" : d === "media_player" ? (st.state === "off" ? "turn_on" : "turn_off") : "toggle";
      this._hass.callService(d, svc, { entity_id: v });
      t.classList.toggle("on");
      this._flash(v);
      return;
    }
    if (a === "gfold") {
      const gf = lsGet("dfm_gfold") || {};
      gf[v] = !gf[v];
      lsSet("dfm_gfold", gf);
      return this._kick(true);
    }
    if (a === "fold") {
      lsSet("dfm_fold", !lsGet("dfm_fold"));
      return this._kick(true);
    }
    if (a === "search") return;
  }

  /** #41: a quick action shows on the plan above: the device's marker lights up for a few seconds. */
  _flash(eid) {
    const x = (this._m.items || []).find((i) => i.lead === eid || i.ents.includes(eid));
    if (!x) return;
    setTimeout(() => {
      const el = [...(this._plans || new Map()).values()].find((p) => p.isConnected && p._dfmFloor === x.floor);
      if (!el || !el._specs || !el._highlight) return;
      const sp = [...el._specs.values()].find((q) => q.item && q.item.id === x.item.id);
      if (sp) el._highlight(sp.key);
    }, 700);
  }

  _input(e) {
    const t = e.target;
    if (t.dataset.a === "q") {
      this._q = t.value;
      clearTimeout(this._qT);
      this._qT = setTimeout(() => {
        this._render();
        const q = this.shadowRoot.querySelector("[data-a=q]");
        if (q) {
          q.focus();
          q.setSelectionRange(q.value.length, q.value.length);
        }
      }, 250);
    }
    if (t.dataset.a === "bri") this._busy = true; // no redraws while the slider moves
  }

  _change(e) {
    const t = e.target;
    if (t.dataset.a === "bri") {
      this._busy = false;
      // Saved once, when the finger lets go (never per step).
      this._hass.callService("light", "turn_on", { entity_id: t.dataset.v, brightness_pct: Number(t.value) });
    }
  }

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
    return s;
  }

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
      <span class="tile g-${x.g}">${st ? `<ha-state-icon data-ent="${cesc(eid)}"></ha-state-icon>` : `<ha-icon icon="${DFM_GICON[x.g]}"></ha-icon>`}</span>
      <span class="txt"><span class="nm"><span class="t">${cesc(x.name)}</span>${badges.join("")}</span><span class="sub">${cesc(this._stateTxt(x))}${room}</span>
      ${dim ? `<input type="range" class="bri" min="1" max="100" value="${Math.round((st.attributes.brightness || 255) / 2.55)}" data-a="bri" data-v="${cesc(eid)}" aria-label="${dfT("mob.brightness")}">` : ""}</span>
      ${extra}${tog ? `<button class="sw ${x.on || (st && st.state === "on") ? "on" : ""}" role="switch" aria-checked="${x.on}" data-a="tog" data-v="${cesc(eid)}" aria-label="${cesc(x.name)}"><i></i></button>` : ""}
    </div>`;
  }

  _vals(r) {
    return [r.temp != null ? `${r.temp}°` : "", r.hum != null ? `${Math.round(r.hum)}%` : "", dfT("mob.n_devices", { n: r.items.length })].filter(Boolean).join(" · ");
  }

  _roomSub(r) {
    const p = [];
    if (r.attention) p.push(dfT("mob.n_attention", { n: r.attention }));
    if (r.on) p.push(dfT("mob.n_on", { n: r.on }));
    if (r.temp != null) p.push(`${r.temp}°`);
    if (r.people.length) p.push(r.people.map((pp) => this._pname(pp)).join(", "));
    return p.join(" · ") || dfT("mob.quiet");
  }

  _pname(p) {
    const st = this._hass.states[p.entity];
    return ((st && st.attributes.friendly_name) || p.entity).split(" ")[0];
  }

  _outside() {
    const w = Object.values(this._hass.states).find((s) => s.entity_id.startsWith("weather.") && num(s.attributes.temperature));
    return w ? `${Math.round(Number(w.attributes.temperature) * 10) / 10}${w.attributes.temperature_unit || "°"}` : null;
  }

  /** The devices of an overlay: what the Floorplan card shows there, with the user's settings (#25). */
  _members(o, list) {
    if (o === "live") return list.filter((x) => x.now.has("live") || x.attention);
    return list.filter((x) => x.ovs.has(o));
  }

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
  }

  /** The devices an overlay lists in full, most important first. */
  _list(o, list) {
    const mem = this._members(o, list);
    const att = (a, b) => b.attention - a.attention || Number(b.now.has(o) || b.on) - Number(a.now.has(o) || a.on) || a.name.localeCompare(b.name);
    if (o === "network") return mem.sort((a, b) => Number(b.offline) - Number(a.offline) || a.name.localeCompare(b.name));
    if (o === "health") return mem.sort((a, b) => b.warn.length - a.warn.length || (a.battery ?? 101) - (b.battery ?? 101) || a.name.localeCompare(b.name));
    if (o === "energy") return mem.sort((a, b) => (b.power || 0) - (a.power || 0));
    return mem.sort(att);
  }

  _listHtml(o, list, roomNames) {
    const rows = this._list(o, list);
    if (!rows.length) return `<div class="none">${dfT("mob.nothing")}</div>`;
    const val = (x) => (o === "health" ? `${Math.round(x.battery)}%` : o === "network" && x.sigEnt ? this._fmtE(x.sigEnt) : "");
    return rows.map((x) => this._row(x, { value: val(x), room: roomNames ? this._roomName(x) : "" })).join("");
  }

  _fmtE(eid) {
    const st = this._hass.states[eid];
    if (!live(st)) return "—";
    try {
      return this._hass.formatEntityState ? this._hass.formatEntityState(st) : st.state;
    } catch (_e) {
      return st.state;
    }
  }

  _roomName(x) {
    const r = this._m.rooms.find((q) => q.id === x.room && q.floor === x.floor);
    return r ? r.name : "";
  }

  _peopleHtml(people) {
    if (!people.length) return `<div class="none">${dfT("mob.no_people")}</div>`;
    return people.map((p) => {
      const where = p.room ? p.room.name : p.st ? this._fmtE(p.entity) : "";
      return `<div class="row" data-a="${p.room ? "room" : "more"}" data-v="${cesc(p.room ? `${p.room.floor}|${p.room.id}` : p.entity)}">
        <span class="av ${p.home ? "home" : ""}">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span>
        <span class="txt"><span class="nm">${cesc(p.name)}</span><span class="sub">${cesc(where)}</span></span>
        ${p.room ? '<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>' : ""}</div>`;
    }).join("");
  }

  _thumb(f, room) {
    const ar = room && f.a.areas[room];
    const shape = ar && Array.isArray(ar.shape) && ar.shape.length >= 3 ? ar.shape : null;
    const ratio = f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6;
    const img = this._img(f);
    return `<span class="thumb" style="aspect-ratio:${ratio}" data-a="ov" data-v="${cesc(this._config.default_overlay)}" data-f="${cesc(f.id)}">${img ? `<img src="${cesc(img)}" alt="">` : ""}<svg viewBox="0 0 100 100" preserveAspectRatio="none">${shape ? `<polygon points="${shape.map((p) => p.join(",")).join(" ")}"/>` : ar ? `<ellipse cx="${ar.x}" cy="${ar.y}" rx="6" ry="6"/>` : ""}</svg></span>`;
  }

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
  }

  // ------------------------------------------------------------- portrait
  _portHtml(m) {
    const s = this._s;
    let body = "";
    if (s.page === "room") body = this._roomPage(m);
    else if (s.page === "rooms") body = this._roomsPage(m);
    else if (s.page === "overlays") body = this._ovPage(m);
    else if (s.page === "devices") body = this._devPage(m);
    else if (s.page === "people") body = this._pplPage(m);
    else if (s.page === "plan") body = this._planPage(m);
    else body = this._homePage(m);
    const homeOn = ["home", "house", "rooms", "room"].includes(s.page);
    const listOn = ["overlays", "devices", "people", "plan"].includes(s.page);
    // #20: ☰ (Home Assistant's menu) when its top bar is hidden · Home · the other pages behind one round button.
    // #31 / #34: ☰ on its own + one pill (Home ^ | ≡), on a layer fixed to the bottom of the screen.
    const bar = `<div class="barwrap"><nav class="bar">${this._hdrOn ? `<button class="tb" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : ""}<span class="pill2"><button class="ph ${homeOn ? "on" : ""}" data-a="home"><ha-icon icon="mdi:home-outline"></ha-icon>${dfT("mob.home")}<ha-icon class="up" icon="mdi:chevron-up"></ha-icon></button><i class="sep"></i><button class="pl ${listOn ? "on" : ""}" data-a="list" aria-label="${dfT("mob.more")}"><ha-icon icon="mdi:format-list-bulleted"></ha-icon></button></span></nav></div>`;
    return `<div class="port"><div class="bgfix"></div><div class="pg" data-scroll="pg">${body}<div class="pad"></div></div>${bar}${this._sheet ? this._sheetHtml(m) : ""}</div>`;
  }

  _homePage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const hr = new Date().getHours();
    const user = this._hass.user || {};
    const first = String(user.name || "").split(" ")[0];
    const me = m.people.find((p) => p.st && p.st.attributes.user_id && p.st.attributes.user_id === user.id);
    const greet = dfT(hr < 12 ? "mob.morning" : hr < 18 ? "mob.afternoon" : "mob.evening") + (first ? `, ${first}` : "");
    const home = m.people.filter((p) => p.home).length;
    const att = m.items.filter((x) => x.attention);
    const sumLine = [m.people.length ? dfT("mob.k_of_n_home", { k: home, n: m.people.length }) : "", att.length ? dfT("mob.n_attention", { n: att.length }) : dfT("mob.all_good")].filter(Boolean).join(" · ");
    // #31: one chip per real issue first (what · where), then the weather, then overlay chips that say what they count.
    const issues = att.slice(0, 4).map((x) => {
      const e = x.alarm[0] || x.open[0] || x.lead;
      const where = this._roomName(x);
      return `<button class="chip att" data-a="${x.room ? "room" : "more"}" data-v="${cesc(x.room ? `${x.floor}|${x.room}` : e)}"><ha-state-icon data-ent="${cesc(e)}"></ha-state-icon>${cesc(`${x.name} · ${this._fmtE(e)}`)}${where ? ` · ${cesc(where)}` : ""}</button>`;
    }).join("") + (att.length > 4 ? `<span class="chip att">+${att.length - 4}</span>` : "");
    const out = this._outside();
    const lightsOn = this._members("lights", m.items).filter((x) => x.on).length;
    const tin = dfmAvg(m.items.flatMap((x) => x.temps));
    const off = m.items.filter((x) => x.offline).length;
    const low = m.items.filter((x) => x.battery != null && x.battery <= 15).length;
    const wn = m.items.filter((x) => x.warn.length).length;
    const ch = (ov, icon, t, cls = "") => `<button class="chip ${cls}" data-a="ov" data-v="${ov}"><ha-icon icon="${icon}"></ha-icon>${cesc(t)}</button>`;
    const chips = [
      lightsOn ? ch("lights", "mdi:lightbulb-group", dfT("mob.lights_on", { n: lightsOn })) : "",
      tin != null ? ch("comfort", "mdi:home-thermometer-outline", dfT("mob.inside", { t: tin })) : "",
      off ? ch("network", "mdi:lan-disconnect", dfT("mob.n_offline", { n: off }), "warn") : "",
      low ? ch("health", "mdi:battery-alert-variant-outline", dfT("mob.n_low", { n: low }), "warn") : "",
      wn ? ch("health", "mdi:alert-outline", dfT("mob.n_warn", { n: wn }), "warn") : "",
    ].join("");
    const rooms = this._sortRooms(m.rooms).slice(0, 8);
    const cams = m.items.filter((x) => x.lk === "camera");
    const fl = this._fsw(m, f);
    const avatar = me && me.pic ? `<span class="me"><img src="${cesc(me.pic)}" alt=""></span>` : "";
    const tile = (r) => {
      const bd = [r.offline ? `<b class="bd amber">${dfT("mob.n_offline", { n: r.offline })}</b>` : "", r.low ? `<b class="bd amber">${dfT("mob.n_low", { n: r.low })}</b>` : "", r.warns ? `<b class="bd amber">${dfT("mob.n_warn", { n: r.warns })}</b>` : ""].join("");
      const sub = [r.on ? dfT("mob.n_on", { n: r.on }) : "", r.temp != null ? `${r.temp}°` : "", r.people.map((pp) => this._pname(pp)).join(", ")].filter(Boolean).join(" · ");
      return `<button class="rt ${r.attention ? "att" : r.on ? "on" : ""}" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rti"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><b>${cesc(r.name)}</b><small>${cesc(sub || dfT("mob.quiet"))}</small>${bd ? `<span class="bds">${bd}</span>` : ""}</button>`;
    };
    const cam = (c) => {
      const pic = c.st && c.st.state !== "unavailable" && c.st.attributes.entity_picture;
      const nm = (c.st && c.st.attributes.friendly_name) || c.name;
      return `<button class="cam" data-a="more" data-v="${cesc(c.lead)}">${pic ? `<img src="${cesc(pic)}" alt="">` : `<span class="noimg"><ha-icon icon="mdi:cctv-off"></ha-icon></span>`}<b>${cesc(nm)}</b><small>${cesc([this._roomName(c), this._fmtE(c.lead)].filter(Boolean).join(" · "))}</small></button>`;
    };
    return `<header class="hd top">${avatar}<div class="grow"><div class="h1">${cesc(greet)}</div><div class="sub">${cesc(sumLine)}</div></div></header>
      <div class="mini" data-swipe="floor">${this._slot(f.id, "live", "", "mini")}${fl}</div>
      <div class="chips" data-scroll="chips">${issues}${out ? `<span class="chip wx"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>${cesc(`${out} ${dfT("mob.outside")}`)}</span>` : ""}${chips}</div>
      <section><h2><ha-icon icon="mdi:floor-plan"></ha-icon>${dfT("mob.rooms")}<button class="all" data-a="home">${dfT("mob.see_all")} ›</button></h2>
        <div class="hs" data-scroll="hrooms">${rooms.map(tile).join("")}</div></section>
      ${cams.length ? `<section><h2><ha-icon icon="mdi:cctv"></ha-icon>${dfT("mob.cameras")}</h2><div class="hs" data-scroll="hcams">${cams.map(cam).join("")}</div></section>` : ""}
      ${m.people.length ? `<section><h2><ha-icon icon="mdi:account-group-outline"></ha-icon>${dfT("mob.people")}<button class="all" data-a="tab" data-v="people">${dfT("mob.see_all")} ›</button></h2><div class="hs" data-scroll="hppl">${m.people.map((p) => `<button class="pt" data-a="${p.room ? "room" : "more"}" data-v="${cesc(p.room ? `${p.room.floor}|${p.room.id}` : p.entity)}"><span class="av ${p.home ? "home" : ""}">${p.pic ? `<img src="${cesc(p.pic)}" alt="">` : cesc(p.name.slice(0, 1))}</span><b>${cesc(p.name.split(" ")[0])}</b><small>${cesc(p.room ? p.room.name : p.st ? this._fmtE(p.entity) : "")}</small></button>`).join("")}</div></section>` : ""}`;
  }

  _sheetHtml(m) {
    const sh = this._sheet;
    let body = "";
    const item = (p, icon, label, sub) => `<button class="srow" data-a="tab" data-v="${p}"><span class="rtile"><ha-icon icon="${icon}"></ha-icon></span><span class="txt"><span class="nm"><span class="t">${label}</span></span><span class="sub">${cesc(sub)}</span></span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
    if (sh.step === "list") {
      body = `${item("overlays", "mdi:layers-outline", dfT("mob.overlays"), dfT("mob.overlays_sub"))}${item("devices", "mdi:devices", dfT("mob.devices"), dfT("mob.n_devices", { n: m.items.length }))}${item("people", "mdi:account-group-outline", dfT("mob.people"), dfT("mob.n_home", { n: m.people.filter((p) => p.home).length }))}`;
    } else if (sh.step === "floors") {
      body = `<h3>${dfT("mob.floors")}</h3>${m.floors.map((f) => {
        const rs = m.rooms.filter((r) => r.floor === f.id);
        const on = rs.reduce((n, r) => n + r.on, 0);
        const att = rs.reduce((n, r) => n + r.attention, 0);
        const sub = [dfT("mob.n_rooms", { n: rs.length }), att ? dfT("mob.n_attention", { n: att }) : "", on ? dfT("mob.n_on", { n: on }) : ""].filter(Boolean).join(" · ");
        const img = this._img(f);
        return `<button class="srow" data-a="sheet-floor" data-v="${cesc(f.id)}"><span class="fthumb">${img ? `<img src="${cesc(img)}" alt="">` : `<ha-icon icon="mdi:floor-plan"></ha-icon>`}</span><span class="txt"><span class="nm">${cesc(f.name)}</span><span class="sub">${cesc(sub)}</span></span>${att ? `<b class="bd red">${att}</b>` : ""}<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
      }).join("")}`;
    } else {
      const f = m.floors.find((q) => q.id === sh.floor) || m.floors[0];
      const rs = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
      body = `<h3>${m.floors.length > 1 ? `<button class="bk" data-a="sheet-back" aria-label="${dfT("mob.back")}">‹</button>` : ""}${cesc(f.name)}<button class="all" data-a="floor" data-v="${cesc(f.id)}">${dfT("mob.whole_floor")} ›</button></h3>${rs.map((r) => this._roomRow(r)).join("")}`;
    }
    return `<div class="scrim" data-a="close"></div><div class="sheet" data-scroll="sheet"><i class="grab"></i>${body}</div>`;
  }

  _roomRow(r) {
    return `<button class="srow" data-a="room" data-v="${cesc(`${r.floor}|${r.id}`)}"><span class="rtile ${r.attention ? "att" : r.on ? "on" : ""}"><ha-icon icon="${cesc(r.icon)}"></ha-icon></span><span class="txt"><span class="nm">${cesc(r.name)}</span><span class="sub">${cesc(this._roomSub(r))}</span></span>${r.attention ? `<b class="bd red">${r.attention}</b>` : ""}<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
  }

  _roomsPage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const rs = this._sortRooms(m.rooms.filter((r) => r.floor === f.id));
    return `<header class="hd"><button class="bk" data-a="back" aria-label="${dfT("mob.back")}">‹</button><div><div class="h1">${cesc(f.name)}</div><div class="sub">${dfT("mob.n_rooms", { n: rs.length })}</div></div></header>
      <div class="mini" data-swipe="floor">${this._slot(f.id, "live", "", "floor")}${this._fsw(m, f)}</div><div class="list">${rs.map((r) => this._roomRow(r)).join("")}</div>`;
  }

  _roomPage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const r = m.rooms.find((q) => q.id === s.room && q.floor === f.id);
    const folded = !!lsGet("dfm_fold");
    const gfold = lsGet("dfm_gfold") || {};
    // #41: portrait = quick actions: each group folds; its header (or ⌄) folds / unfolds it.
    const groups = DFM_GROUPS.map((g) => {
      const list = r.items.filter((x) => x.g === g).sort((a, b) => b.attention - a.attention || Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
      if (!list.length) return "";
      const sum = g === "lights" ? dfT("mob.k_of_n_on", { k: list.filter((x) => x.on).length, n: list.length }) : this._sum(DFM_GOV[g] === "live" ? "live" : DFM_GOV[g], list) || "";
      const fo = !!gfold[g];
      return `<section class="${fo ? "folded" : ""}"><h2 class="gh" data-a="gfold" data-v="${g}"><span class="gi g-${g}"><ha-icon icon="${DFM_GICON[g]}"></ha-icon></span>${dfmGroupLabel(g)}<span class="gs">${cesc(sum)}</span><span class="go"><ha-icon icon="mdi:chevron-${fo ? "right" : "down"}"></ha-icon></span></h2>${fo ? "" : list.map((x) => this._row(x)).join("")}</section>`;
    }).join("");
    // #33 / #42: one plan band (a third of the screen), the room centred, controls floating on it.
    const band = folded ? "" : `<div class="cut" data-swipe="room">${this._slot(f.id, "live", r.id, "room")}
        <button class="nav l" data-a="step" data-z="room" data-v="-1" aria-label="${dfT("mob.prev_room")}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="nav r" data-a="step" data-z="room" data-v="1" aria-label="${dfT("mob.next_room")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>`;
    return `<header class="hd room"><button class="bk" data-a="back" aria-label="${dfT("mob.back")}">‹</button><div class="grow"><div class="h1">${cesc(r.name)}</div><div class="sub">${cesc(this._vals(r))}</div></div>${this._thumb(f, r.id)}
        <button class="fold ${folded ? "off" : ""}" data-a="fold" aria-label="${folded ? dfT("mob.show_plan") : dfT("mob.hide")}"><ha-icon icon="mdi:chevron-${folded ? "down" : "up"}"></ha-icon></button></header>
      ${band}
      ${groups || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  }

  /** The floor's name on its plan ("‹ 1st Floor ›"), so a plan is always seen as one floor (#27). */
  _fsw(m, f) {
    const multi = m.floors.length > 1;
    return `<div class="fsw">${multi ? `<button data-a="fstep" data-v="1" aria-label="${dfT("mob.floor_up")}">‹</button>` : ""}<span>${cesc(f.name)}</span>${multi ? `<button data-a="fstep" data-v="-1" aria-label="${dfT("mob.floor_down")}">›</button>` : ""}</div>`;
  }

  _ovPage(m) {
    const f = m.floors.find((q) => q.id === this._s.floor);
    const ovs = this._overlayList(f);
    return `<header class="hd"><div><div class="h1">${dfT("mob.overlays")}</div><div class="sub">${cesc(f.name)}</div></div></header>
      <div class="list">${ovs.map((o) => `<button class="srow" data-a="ov" data-v="${cesc(o)}"><span class="rtile"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon></span><span class="txt"><span class="nm">${cesc(this._ovLabel(o, f))}</span><span class="sub">${cesc(this._sum(o, m.items, true))}</span></span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`).join("")}
      ${(this._base || {}).replay === false ? "" : `<button class="srow" data-a="rp"><span class="rtile"><ha-icon icon="mdi:history"></ha-icon></span><span class="txt"><span class="nm">${dfT("rp.name")}</span><span class="sub">${dfT("mob.replay_sub")}</span></span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`}</div>`;
  }

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
    return `<header class="hd"><div><div class="h1">${dfT("mob.devices")}</div><div class="sub">${dfT("mob.n_devices", { n: m.items.length })}</div></div></header>
      <div class="search"><ha-icon icon="mdi:magnify"></ha-icon><input data-a="q" type="search" value="${cesc(this._q || "")}" placeholder="${dfT("mob.search")}"></div>${sec || `<div class="none">${dfT("mob.nothing")}</div>`}`;
  }

  _pplPage(m) {
    return `<header class="hd"><div><div class="h1">${dfT("mob.people")}</div><div class="sub">${dfT("mob.n_home", { n: m.people.filter((p) => p.home).length })}</div></div></header><div class="list">${this._peopleHtml(m.people)}</div>`;
  }

  _planPage(m) {
    const s = this._s;
    const f = m.floors.find((q) => q.id === s.floor);
    const ov = s.ov || this._config.default_overlay;
    const fl = this._fsw(m, f);
    const ovs = this._overlayList(f);
    return `<header class="hd"><button class="bk" data-a="back" aria-label="${dfT("mob.back")}">‹</button><div><div class="h1">${cesc(this._ovLabel(ov, f))}</div><div class="sub">${cesc(f.name)}</div></div></header>
      <div class="chips" data-scroll="pchips">${ovs.map((o) => `<button class="chip ${o === ov ? "sel" : ""}" data-a="ov" data-v="${cesc(o)}"><ha-icon icon="${cesc(this._ovIcon(o, f))}"></ha-icon>${cesc(this._ovLabel(o, f))}</button>`).join("")}</div>
      <div class="full" data-swipe="floor">${this._slot(f.id, ov, "", "full")}${fl}</div>
      <section><h2>${cesc(this._ovLabel(ov, f))}<span class="gs">${cesc(this._sum(ov, m.items.filter((x) => x.floor === f.id), true))}</span></h2>${ov === "people" ? this._peopleHtml(m.people) : this._listHtml(ov, m.items.filter((x) => x.floor === f.id), true)}</section>`;
  }

  // ------------------------------------------------------------- landscape: the house explorer
  _landHtml(m) {
    const s = this._s;
    const multi = m.levels.length > 1;
    // #27: Home (portrait) turns into the floor it shows; the House is the 3D building (Back from a floor).
    const scope = s.page === "room" && s.room ? "room" : s.page === "house" && multi ? "house" : "floor";
    const f = m.floors.find((q) => q.id === s.floor);
    const r = scope === "room" ? m.rooms.find((q) => q.id === s.room && q.floor === f.id) : null;
    const items = scope === "room" ? r.items : scope === "floor" ? m.items.filter((x) => x.floor === f.id) : m.items;
    const ovs = this._overlayList(f);
    const tabs = ["live", ...ovs.filter((o) => o !== "live")];
    if (m.people.length && !tabs.includes("people")) tabs.push("people");
    let tab = this._tab && tabs.includes(this._tab) ? this._tab : scope === "room" ? "lights" : "live";
    if (!tabs.includes(tab)) tab = tabs[0];
    const planOv = tab === "people" ? "live" : tab;
    const gone = this._hdrHidden ? "gone" : "";
    let left = "";
    if (scope === "house") {
      left = `${this._houseHtml(m)}
        <div class="float hdr ${gone}"><div class="h1">${dfT("mob.house")}</div><div class="sub">${cesc([dfT("mob.n_floors", { n: m.levels.length }), m.people.length ? dfT("mob.n_home", { n: m.people.filter((p) => p.home).length }) : "", this._outside() ? `${this._outside()} ${dfT("mob.outside")}` : ""].filter(Boolean).join(" · "))}</div></div>
        <div class="float hint ${gone}">${dfT("mob.house_hint")}</div>`;
    } else if (scope === "floor") {
      left = `${this._slot(f.id, planOv, "", "land", "lplan")}
        <div class="float hdr ${gone}">${multi ? `<button class="bk" data-a="back">‹ ${dfT("mob.house")}</button>` : ""}<div class="h1">${cesc(f.name)}</div><div class="sub">${cesc(this._sum("live", items, true))}</div></div>
        ${m.floors.length > 1 ? `<div class="float sw ${gone}"><button data-a="step" data-z="floor" data-v="-1">‹</button><span>${cesc(f.name)}</span><button data-a="step" data-z="floor" data-v="1">›</button></div>` : ""}`;
    } else {
      left = `${this._slot(f.id, planOv, r.id, "landroom", "lplan")}
        <div class="float hdr ${gone}"><button class="bk" data-a="back">‹ ${cesc(f.name)}</button><div class="h1">${cesc(r.name)}</div><div class="sub">${cesc(this._vals(r))}</div></div>
        <div class="float sw ${gone}"><button data-a="step" data-z="room" data-v="-1">‹</button><span>${cesc(r.name)}</span><button data-a="step" data-z="room" data-v="1">›</button></div>`;
    }
    const ppl = scope === "room" ? m.people.filter((p) => p.room === r) : scope === "floor" ? m.people.filter((p) => p.room && p.room.floor === f.id) : m.people;
    const others = tabs.filter((o) => o !== tab).map((o) => {
      const t = o === "people" ? dfT("mob.n_home", { n: ppl.filter((p) => p.home).length }) : this._sum(o, items);
      if (!t) return "";
      const att = ["security", "network", "health"].includes(o) && /\d/.test(t);
      return `<button class="one ${att ? "att" : ""}" data-a="ltab" data-v="${cesc(o)}"><ha-icon icon="${cesc(o === "people" ? OVERLAYS.people.icon : this._ovIcon(o, f))}"></ha-icon><span>${cesc(this._ovLabel(o, f))}</span><small>${cesc(t)}</small>›</button>`;
    }).join("");
    const main = tab === "people" ? this._peopleHtml(ppl) : this._listHtml(tab, items, scope !== "room");
    const menu = this._hdrOn ? `<button class="lmenu" data-a="menu" aria-label="${dfT("mob.menu")}"><ha-icon icon="mdi:menu"></ha-icon></button>` : "";
    const right = `<div class="tabs" data-scroll="ltabs">${menu}${tabs.map((o) => `<button class="lt ${o === tab ? "on" : ""}" data-a="ltab" data-v="${cesc(o)}">${cesc(o === "people" ? OVERLAYS.people.label : this._ovLabel(o, f))}</button>`).join("")}</div>
      <div class="rbody" data-scroll="rbody"><div class="rsum">${cesc(this._sum(tab, items, true))}</div>${main}${others ? `<div class="others">${others}</div>` : ""}</div>`;
    const zone = scope === "room" ? "room" : scope === "floor" ? "floor" : "";
    return `<div class="land"><div class="left" ${zone ? `data-swipe="${zone}"` : ""}>${left}</div><aside class="right">${right}</aside></div>`;
  }

  /** #26: the House: all levels stacked on one footprint, one tilt for the whole building, sized to fit. */
  _houseHtml(m) {
    const lv = m.levels;
    const n = lv.length;
    const ratio = (f) => (f.a.image_width && f.a.image_height ? f.a.image_width / f.a.image_height : 1.6);
    const A = Math.max(...lv.map((l) => l.plans.reduce((t, f) => t + ratio(f), 0)));
    const W = window.innerWidth * 0.66 - 32;
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
  }

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
  }
}

const DFM_CSS = `
:host { display:block; --dfm-g1: var(--dfm-bg-top, color-mix(in srgb, var(--primary-background-color, #f3f5f9) 35%, #f3f5f9)); --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #e3e7ee) 35%, #e3e7ee)); --dfm-bg: var(--dfm-g2); --dfm-card: color-mix(in srgb, var(--card-background-color, #fff) 82%, transparent); --dfm-fg: var(--primary-text-color, #222); --dfm-sub: var(--secondary-text-color, #777); --dfm-acc: var(--primary-color, #03a9f4); --dfm-red: var(--error-color, #db4437); --dfm-amber: var(--warning-color, #f4b400); --dfm-div: var(--divider-color, rgba(0,0,0,.08)); color: var(--dfm-fg); font-family: var(--paper-font-body1_-_font-family, inherit); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.empty { padding: 24px; color: var(--dfm-sub); }
:host([dark]) { --dfm-g1: var(--dfm-bg-top, color-mix(in srgb, var(--primary-background-color, #1f2636) 30%, #1f2636)); --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #121418) 30%, #121418)); --dfm-card: rgba(255,255,255,.06); }
/* #38: a soft gradient behind everything, fixed to the screen */
.bgfix { position: fixed; inset: 0; z-index: 0; background: linear-gradient(180deg, var(--dfm-g1), var(--dfm-g2)); pointer-events: none; }
.port { position: relative; min-height: calc(100dvh - var(--dfm-top, 56px)); }
.pg { position: relative; z-index: 1; padding: 12px 14px 0; }
.pad { height: 110px; }
.hd { display:flex; align-items:center; gap:12px; padding: 6px 2px 10px; }
.hd .grow { flex:1; min-width:0; }
.h1 { font-size: 20px; font-weight: 700; line-height:1.2; letter-spacing:-.01em; }
.hd.room .h1 { font-size: 22px; }
.sub { font-size: 13px; color: var(--dfm-sub); }
.hd.top .me { width: 44px; height: 44px; flex: none; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px var(--dfm-card); }
.hd.top .me img { width: 100%; height: 100%; object-fit: cover; }
.hd.room { position: relative; }
.fold { position: absolute; right: 2px; bottom: -16px; z-index: 3; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 70%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 1px 4px rgba(0,0,0,.15); color: var(--dfm-fg); }
.fold ha-icon { --mdc-icon-size: 20px; }
.bk { width:40px; height:40px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size: 22px; flex: none; }
.thumb { position:relative; width: 96px; flex:none; border-radius:10px; overflow:hidden; background: var(--dfm-card); }
.thumb img { width:100%; height:100%; object-fit: fill; opacity:.35; filter: grayscale(.6); display:block; }
.thumb svg { position:absolute; inset:0; width:100%; height:100%; }
.thumb polygon, .thumb ellipse { fill: var(--dfm-acc); fill-opacity:.55; stroke: var(--dfm-acc); stroke-width:.8; vector-effect: non-scaling-stroke; }
.plan { position: relative; --ha-card-background: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; --ha-card-border-radius: 0; }
.mini .plan, .cut .plan, .full .plan { -webkit-mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); -webkit-mask-composite: source-in; mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); mask-composite: intersect; margin: 0 -14px; }
.mini .plan { --dfc-fit-h: 34vh; }
.cut { position: relative; margin: 6px -14px 0; }
.cut .plan { --dfc-fit-h: 33vh; margin: 0; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); }
.nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 45%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); color: var(--dfm-fg); opacity: .7; }
.nav.l { left: 8px; } .nav.r { right: 8px; }
.nav ha-icon { --mdc-icon-size: 24px; }
.full .plan { --dfc-fit-h: 52vh; }
.full .plan { -webkit-mask-image:none; mask-image:none; }
.mini, .full { position:relative; }
.fsw, .sw { display:flex; align-items:center; gap:6px; justify-content:center; font-size: 13px; color: var(--dfm-sub); }
.fsw button, .sw button { width:30px; height:30px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size:18px; }
.chips { display:flex; gap:8px; overflow-x:auto; padding: 6px 0 10px; scrollbar-width:none; }
.chips::-webkit-scrollbar, .hs::-webkit-scrollbar { display:none; }
.chip { flex:none; display:inline-flex; align-items:center; gap:6px; padding: 7px 12px; border-radius: 999px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.07); font-size: 13.5px; white-space:nowrap; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--dfm-acc); }
.chip.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); color: var(--dfm-red); }
.chip.att ha-icon { color: var(--dfm-red); }
.chip.warn { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dfm-amber) 80%, transparent); }
.chip.warn ha-icon { color: var(--dfm-amber); }
.chip ha-state-icon { --mdc-icon-size: 18px; }
.chip.wx { background: color-mix(in srgb, var(--dfm-acc) 14%, var(--dfm-card)); }
.chip.sel { background: var(--dfm-acc); color: #fff; }
.chip.sel ha-icon { color:#fff; }
section { margin: 14px 0 4px; }
h2 { display:flex; align-items:center; gap:8px; font-size: 17px; font-weight: 650; margin: 0 0 8px; }
h2 > ha-icon { --mdc-icon-size: 20px; color: var(--dfm-sub); }
h2 .all, h3 .all { margin-left:auto; font-size: 13px; color: var(--dfm-acc); font-weight:500; }
.gs { margin-left:auto; font-size: 13px; color: var(--dfm-sub); font-weight: 500; }
.gh { cursor: pointer; user-select: none; }
.gh .go { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-sub); }
.gh .go ha-icon { --mdc-icon-size: 22px; }
section.folded { margin-bottom: 0; }
.gi { width:32px; height:32px; border-radius: 10px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); }
.gi ha-icon { --mdc-icon-size: 19px; }
.g-lights { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent) !important; }
.g-comfort { color: #3b7dd8; background: color-mix(in srgb, #3b7dd8 15%, transparent) !important; }
.g-security { color: #2e8b57; background: color-mix(in srgb, #2e8b57 15%, transparent) !important; }
.g-media { color: #7e57c2; background: color-mix(in srgb, #7e57c2 15%, transparent) !important; }
.g-other { color: var(--dfm-sub); background: color-mix(in srgb, var(--dfm-sub) 12%, transparent) !important; }
.hs { display:flex; gap:10px; overflow-x:auto; padding: 2px 2px 6px; scrollbar-width:none; }
.rt, .pt, .cam { flex:none; width: 132px; padding: 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); display:flex; flex-direction:column; gap:4px; }
.rti { width: 38px; height: 38px; border-radius: 12px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); color: var(--dfm-acc); margin-bottom: 4px; }
.rt ha-icon { --mdc-icon-size: 22px; }
.rt .bds { display:flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.rt.on .rti { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rt.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); }
.rt.att .rti { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.rt b, .pt b, .cam b { font-size: 14.5px; font-weight:600; }
.rt small, .pt small { font-size: 12px; color: var(--dfm-sub); line-height:1.3; }
.pt { align-items:center; text-align:center; width: 96px; }
.cam { width: 180px; padding: 0 0 10px; overflow:hidden; }
.cam img { width:100%; aspect-ratio: 16/9; object-fit: cover; display:block; background:#000; }
.cam b { padding: 6px 10px 0; }
.cam small { padding: 0 10px; font-size: 12px; color: var(--dfm-sub); }
.cam .noimg { width:100%; aspect-ratio: 16/9; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 15%, transparent); color: var(--dfm-sub); }
.av { width:44px; height:44px; flex:none; border-radius:50%; background: color-mix(in srgb, var(--dfm-sub) 20%, var(--dfm-card)); display:flex; align-items:center; justify-content:center; font-weight:700; overflow:hidden; box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px transparent; }
.av.home { box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px #4caf50; }
.av img { width:100%; height:100%; object-fit:cover; }
.list, section { display:flex; flex-direction:column; gap:8px; }
.row, .srow { display:flex; align-items:center; gap:12px; padding: 11px 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); min-height: 44px; width: 100%; box-sizing: border-box; }
.row.att { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dfm-red) 70%, transparent); }
.tile, .rtile { width:38px; height:38px; flex:none; border-radius: 11px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); color: var(--dfm-sub); }
.row:not(.on) .tile { filter: saturate(.3); opacity:.85; }
.rtile.on { color:#c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rtile.att { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.nm { font-size: 15px; font-weight: 600; display:flex; align-items:center; gap:6px; flex-wrap: wrap; }
.txt .sub { font-size: 13px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd { font-size: 11px; font-weight:700; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 14%, transparent); color: var(--dfm-sub); }
.bd.red { background: color-mix(in srgb, var(--dfm-red) 15%, transparent); color: var(--dfm-red); }
.bd.amber { background: color-mix(in srgb, var(--dfm-amber) 22%, transparent); color: #9a6b00; }
.val { font-size: 13.5px; color: var(--dfm-sub); font-variant-numeric: tabular-nums; }
.chev { color: var(--dfm-sub); --mdc-icon-size: 20px; }
.sw { }
button.sw { width: 46px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 28%, transparent); position:relative; flex:none; transition: background .2s; }
button.sw i { position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left .2s; }
button.sw.on { background: #e8b923; }
button.sw.on i { left: 21px; }
.bri { width: 100%; margin: 6px 0 0; accent-color: #e8b923; height: 18px; }
.none { color: var(--dfm-sub); font-size: 14px; padding: 6px 4px; }
.link { color: var(--dfm-acc); font-size: 13.5px; padding: 6px 2px; }
.search { display:flex; align-items:center; gap:8px; padding: 0 12px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 6px; }
.search input { flex:1; border:0; outline:0; background:none; font: inherit; font-size: 15px; padding: 11px 0; color: inherit; }
/* #34: the bar is its own layer, fixed to the bottom of the screen, with the page fading under it */
.barwrap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; padding: 28px 0 max(12px, env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--dfm-g2) 40%, color-mix(in srgb, var(--dfm-g2) 0%, transparent)); pointer-events: none; }
.bar { display:flex; align-items:center; justify-content:center; gap: 10px; margin: 0 auto; width: max-content; pointer-events: auto; }
.pill2 { height: 48px; display:flex; align-items:center; border-radius: 999px; background: color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.16); }
.pill2 .ph { height: 48px; padding: 0 14px 0 18px; display:flex; align-items:center; gap: 8px; font-weight: 650; font-size: 15px; }
.pill2 .pl { height: 48px; padding: 0 16px 0 12px; display:flex; align-items:center; }
.pill2 .on { color: var(--dfm-acc); }
.pill2 .sep { width: 1px; height: 24px; background: var(--dfm-div); }
.pill2 .up { --mdc-icon-size: 18px; }
.tb { width:48px; height:48px; border-radius:50%; background: color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.14); display:flex; align-items:center; justify-content:center; }
.tb.on { color: var(--dfm-acc); }
.pill { height:48px; padding: 0 18px; border-radius: 999px; background: var(--dfm-card); box-shadow: 0 4px 16px rgba(0,0,0,.14); display:flex; align-items:center; gap:8px; font-weight:650; font-size: 15px; }
.pill.on { color: var(--dfm-acc); }
.pill .up { --mdc-icon-size: 18px; }
.scrim { position: fixed; inset: 0; z-index: 8; background: rgba(0,0,0,.25); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9; max-height: 78vh; overflow-y: auto; background: var(--dfm-bg); border-radius: 22px 22px 0 0; padding: 8px 14px calc(18px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:8px; box-shadow: 0 -6px 30px rgba(0,0,0,.18); }
.sheet .grab { width: 38px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--dfm-sub) 40%, transparent); margin: 2px auto 6px; }
.sheet h3 { display:flex; align-items:center; gap: 10px; margin: 4px 2px; font-size: 19px; }
.sheet h3 .bk { width:34px; height:34px; font-size: 19px; }
.fthumb { width: 56px; height: 40px; flex:none; border-radius: 8px; overflow:hidden; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); display:flex; align-items:center; justify-content:center; }
.fthumb img { width:100%; height:100%; object-fit: contain; }
/* landscape: one surface, the plan on the left 2/3, the overlays on the right */
.land { position: relative; display:flex; height: calc(100dvh - var(--dfm-top, 56px)); background: linear-gradient(180deg, var(--dfm-g1), var(--dfm-g2)); overflow: hidden; }
.left { position: relative; flex: 0 0 66%; height: 100%; }
.left { touch-action: none; }
[data-swipe] { touch-action: pan-y; }
.left[data-swipe], .left { touch-action: none; }
.lplan { position:absolute; -webkit-mask-image: linear-gradient(to right, transparent, #000 4%, #000 86%, transparent), linear-gradient(to bottom, transparent, #000 5%, #000 95%, transparent); -webkit-mask-composite: source-in; mask-image: linear-gradient(to right, transparent, #000 4%, #000 86%, transparent), linear-gradient(to bottom, transparent, #000 5%, #000 95%, transparent); mask-composite: intersect; }
.lplan device-floorplan-card { display:block; }
.lmenu { flex:none; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-fg); }
.row, .srow, .one { flex-shrink: 0; }
.nm { flex-wrap: nowrap; min-width: 0; }
.nm .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bd { flex: none; white-space: nowrap; }
.float { position:absolute; z-index: 3; transition: opacity .5s; text-shadow: 0 1px 6px var(--dfm-bg), 0 0 2px var(--dfm-bg); }
.float.gone { opacity: 0; pointer-events: none; }
.float.hdr { top: 10px; left: 16px; }
.float.hdr .bk { width:auto; height:auto; border-radius: 0; background:none; box-shadow:none; font-size: 14px; color: var(--dfm-acc); }
.float.hdr .h1 { font-size: 24px; }
.float.sw { bottom: 12px; left: 16px; background: color-mix(in srgb, var(--dfm-card) 80%, transparent); border-radius: 999px; padding: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.1); text-shadow:none; color: var(--dfm-fg); font-weight: 600; }
.float.sw button { width:30px; height:30px; }
.float.hint { bottom: 14px; left: 16px; font-size: 13px; color: var(--dfm-sub); }
.right { flex: 1; min-width: 0; height: 100%; display:flex; flex-direction:column; background: color-mix(in srgb, var(--dfm-card) 72%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: -1px 0 0 var(--dfm-div); z-index: 2; }
.tabs { display:flex; gap: 4px; overflow-x: auto; padding: 10px 12px 6px; scrollbar-width: none; flex: none; }
.tabs::-webkit-scrollbar { display:none; }
.lt { flex:none; padding: 7px 12px; border-radius: 999px; font-size: 13.5px; font-weight: 600; color: var(--dfm-sub); }
.lt.on { background: var(--dfm-fg); color: var(--dfm-bg); }
.rbody { flex:1; overflow-y:auto; padding: 4px 12px 16px; display:flex; flex-direction:column; gap: 6px; }
.rsum { font-size: 13px; color: var(--dfm-sub); padding: 2px 4px 4px; }
.right .row { box-shadow: none; background: transparent; border-radius: 0; border-bottom: 1px solid var(--dfm-div); padding: 9px 4px; }
.right .row.att { box-shadow: none; }
.right .row.att .nm { color: var(--dfm-red); }
.others { margin-top: 10px; display:flex; flex-direction:column; }
.one { display:flex; align-items:center; gap: 10px; padding: 11px 4px; border-top: 1px solid var(--dfm-div); font-size: 14px; }
.one span { font-weight: 600; }
.one small { margin-left:auto; color: var(--dfm-sub); font-size: 13px; }
.one.att small { color: var(--dfm-red); font-weight: 600; }
.one ha-icon { --mdc-icon-size: 19px; color: var(--dfm-sub); }
.house { position:absolute; inset: 0; perspective: 1800px; overflow: hidden; }
.stage { position:absolute; left: 44%; top: 54%; transform-style: preserve-3d; transform: translate(-50%, -50%) rotateX(var(--ph)) rotateZ(calc(-1 * var(--th))); }
.lvl { position:absolute; inset: 0; display:flex; justify-content:center; transform-style: preserve-3d; pointer-events: none; }
.plane { position:relative; height: 100%; display:block; pointer-events: auto; border-radius: 4px; background: var(--dfm-card); box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 18px 30px -12px rgba(0,0,0,.35); overflow: visible; }
.plane img { width:100%; height:100%; display:block; object-fit: fill; border-radius: 4px; }
.plane svg { position:absolute; inset:0; width:100%; height:100%; }
.plane .lit { fill: #f6c445; fill-opacity: .5; }
.plane .att { fill: var(--dfm-red); fill-opacity: .45; }
.plane .pres { fill: var(--dfm-acc); fill-opacity: .25; }
.hav { position:absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; overflow:hidden; background: var(--dfm-acc); color:#fff; font-size: 11px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 0 2px #fff; }
.hav img { width:100%; height:100%; object-fit: cover; }
.hl { position:absolute; right: 12px; transform: translateY(-50%); display:flex; flex-direction:column; align-items:flex-end; gap: 1px; font-size: 13.5px; background: color-mix(in srgb, var(--dfm-card) 88%, transparent); padding: 5px 11px; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.1); z-index: 2; text-align: right; }
.hl small { color: var(--dfm-sub); font-size: 12px; }
`;

if (!customElements.get("device-floorplan-mobile")) customElements.define("device-floorplan-mobile", DeviceFloorplanMobile);
if (!window.customCards.some((c) => c.type === "device-floorplan-mobile")) {
  window.customCards.push({ type: "device-floorplan-mobile", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), preview: false, documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}

/** Add dashboard → "Device Floorplan (mobile)": one panel view with the mobile card. */
class DeviceFloorplanMobileStrategy extends HTMLElement {
  static async generate() {
    return { views: [{ title: dfT("mob.home"), path: "home", icon: "mdi:floor-plan", type: "panel", cards: [{ type: "custom:device-floorplan-mobile" }] }] };
  }
}
if (!customElements.get("ll-strategy-dashboard-device-floorplan-mobile")) customElements.define("ll-strategy-dashboard-device-floorplan-mobile", DeviceFloorplanMobileStrategy);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((c) => c.type === "device-floorplan-mobile")) {
  window.customStrategies.push({ type: "device-floorplan-mobile", strategyType: "dashboard", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}
