
// ---------------------------------------------------------------------------------------------------------------
// 0.13.9.13 Mobile card (PLAN-MOBILE.md): `custom:device-floorplan-mobile`, a phone shell around the Floorplan.
// Only Floorplan data: plans = floors, plan rooms = rooms, placed devices / bonds / entities. The plan itself is the
// normal card (one code path), embedded without its card look; the shell adds pages, lists and the landscape explorer.
// ---------------------------------------------------------------------------------------------------------------
// #96: the Home page sections the editor can show / hide / order.
const DFM_SECTIONS = ["rooms", "control", "appliances", "cameras"];
const DFM_GROUPS = ["lights", "comfort", "security", "appl", "media", "other"];
const DFM_GICON = { lights: "mdi:lightbulb-group-outline", comfort: "mdi:thermometer", security: "mdi:shield-home-outline", appl: "mdi:washing-machine", media: "mdi:television-classic", other: "mdi:dots-horizontal-circle-outline" };
const DFM_GOV = { lights: "lights", comfort: "comfort", security: "security", appl: "live", media: "live", other: "live" };
const DFM_TOGGLE = new Set(["light", "switch", "fan", "input_boolean", "humidifier", "media_player", "cover", "siren"]);
// Settings of a Floorplan card that the mobile card takes over (how things look and who the people are), never its layout.
const DFM_COPY = ["plans", "plan", "card_id", "people", "people_in", "rooms", "look", "live", "lights", "comfort", "security", "network", "health", "energy", "cleaning", "night", "custom_overlays", "overlays", "overlay_names", "devices", "markers", "overlay_actions"];
// The overlays' colours on the mobile card (tiles, badges).
const DFM_OVC = { security: "#e5534b", lights: "#e8b923", comfort: "#3b9ad9", energy: "#f0a030", network: "#7e8ea3", health: "#d08a2c", cleaning: "#26a69a", people: "#8e7cc3", live: "#5c9ded" };
// #51: air quality: one rating per reading (good / moderate / poor), the worst wins.
const DFM_AIR = [
  [/pm25/, "PM2.5", [15, 35]], [/pm10/, "PM10", [45, 100]], [/carbon_dioxide/, "CO₂", [800, 1200]],
  [/volatile_organic_compounds|voc/, "VOC", [150, 250]], [/^aqi$/, "AQI", [50, 100]], [/nitrogen_dioxide/, "NO₂", [25, 50]],
];
/** An air reading of an entity: { k, label, v, unit, r: 0 good | 1 moderate | 2 poor } or null. */
function dfmAir(eid, st) {
  if (!st || !num(st.state) || !eid.startsWith("sensor.")) return null;
  if (impossibleReading(eid, st) || dfcCat(eid) === "diagnostic") return null; // 0.13.9.17 #70
  const dc = String(st.attributes.device_class || "");
  const key = dc || (/voc/i.test(eid) || /voc/i.test(st.attributes.friendly_name || "") ? "voc" : "");
  const hit = key && DFM_AIR.find(([re]) => re.test(key));
  if (!hit) return null;
  let v = Number(st.state);
  // ppb VOC (volatile_organic_compounds_parts) is not the 1–500 index: no rating from it.
  const idx = hit[1] === "VOC" && dc === "volatile_organic_compounds_parts" ? null : hit[2];
  const r = idx ? (v <= idx[0] ? 0 : v <= idx[1] ? 1 : 2) : 0;
  v = Math.round(v * 10) / 10;
  return { k: hit[1], label: hit[1], v, unit: st.attributes.unit_of_measurement || "", r };
}
// #67: kinds whose rows say when they last changed (not readings: they change all the time).
const DFM_AGO = new Set(["opening", "motion", "light", "switch", "fan", "cover", "lock", "media", "appliance", "safety", "binary", "alarm", "camera"]);
/** #96: every Floorplan card on every dashboard: { key, label, cfg } (key = "dashboard|id:card_id" or "|n:index").
 *  firstOnly: stop at the first one (the automatic choice). */
async function dfmFloorplanCards(hass, firstOnly = false) {
  if (!hass) return [];
  const boards = await hass.callWS({ type: "lovelace/dashboards/list" }).catch(() => []);
  const out = [];
  for (const bd of [{ url_path: null, title: "Overview" }, ...boards]) {
    const cfg = await hass.callWS({ type: "lovelace/config", ...(bd.url_path ? { url_path: bd.url_path } : {}) }).catch(() => null);
    if (!cfg || !Array.isArray(cfg.views)) continue;
    let n = 0;
    cfg.views.forEach((v, vi) => {
      const walk = (x) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(walk);
        if (x.type === "custom:device-floorplan-card") {
          const id = x.card_id ? `id:${x.card_id}` : `n:${n}`;
          n += 1;
          const what = x.card_id || x.title || (Array.isArray(x.plans) ? x.plans.join(", ") : x.plan) || "Floorplan";
          out.push({ key: `${bd.url_path || ""}|${id}`, label: `${bd.title || bd.url_path || "Overview"} › ${v.title || v.path || vi + 1} · ${what}`, cfg: x });
          return;
        }
        for (const y of Object.values(x)) if (y && typeof y === "object") walk(y);
      };
      walk(v);
    });
    if (firstOnly && out.length) return out;
  }
  return out;
}

// #92-13: which room badges matter most (alarms / open, then problems, lights, comfort, energy, the rest).
const DFM_BPRIO = { security: 0, network: 1, health: 1, lights: 2, comfort: 3, energy: 4 };
const dfmGroupLabel = (g) => dfT(`mob.g_${g}`);

// Device categories (Floorplan Editor) → the room page's groups; "sensors" go by what they measure.
const DFM_CAT = { lights: "lights", climate: "comfort", contacts: "security", motion: "security", cameras: "security", appliances: "appl", media: "media", computers: "other", network: "other", plugs_switches: "other", buttons: "other", covers: "other", energy: "other", moving: "other", sensors: null };
// Real alarms (red). Tamper / generic safety / problem sensors are warnings (amber), never "things going on".
const DFM_ALARM_DC = new Set(["smoke", "gas", "moisture", "carbon_monoxide", "heat"]);
const DFM_NOT_HOUSE = new Set(["appliances", "media", "moving", "computers"]);

/** What a placed device is and does right now, from its entities and its category. */
function dfmInfo(hass, item, opts = {}) {
  const S = hass.states;
  // 0.13.9.17 #61: an entity hidden in HA says nothing about the device (unless it is the one chosen as main).
  const ents = [...new Set([item.main_entity, ...(item.allEntities || item.entities || [])])].filter((e) => e && S[e] && (e === item.main_entity || !dfcHidden(e)));
  // 0.13.9.17 #70: the card's room-climate rule: no router / chip / diagnostic temperatures, no impossible readings.
  const roomOk = (e, k) => (k === "temperature" ? ambientTemp(e, S[e], item) || opts.comfort === true : k === "humidity" ? !impossibleReading(e, S[e]) && dfcCat(e) !== "diagnostic" : true);
  const kinds = ents.map((e) => [e, kindOf(e, S[e])]).filter(([e, k]) => roomOk(e, k));
  const find = (...ks) => kinds.find((x) => ks.includes(x[1]));
  const mk = item.main_entity && S[item.main_entity] ? kindOf(item.main_entity, S[item.main_entity]) : null;
  const pick = (k) => (mk === k ? [item.main_entity, k] : find(k));
  let g = null;
  let lead = null;
  const order = [
    ["lights", ["light"]],
    ["comfort", ["climate", "fan"]],
    ["appl", ["appliance"]],
    ["media", ["media"]],
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
  if (opts.appl) g = "appl"; // 0.13.9.18: an appliance type set in the Floorplan Editor
  // #29: fans and air purifiers are about comfort, whatever their category.
  if (g !== "lights" && !opts.appl && kinds.some(([e, k]) => k === "fan" || domainOf(e) === "humidifier")) g = "comfort";
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
  const nOpen = house ? kinds.filter(([, k]) => k === "opening").length : 0; // #64: the house's doors / windows on this device
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
      if (Number(s.attributes.current_humidity) > 0) hums.push(Number(s.attributes.current_humidity));
    }
  }
  // #73: a camera with no sensor of its own lives in Cameras only, not in the Security lists.
  const camOnly = ents.some((e) => domainOf(e) === "camera") && !kinds.some(([, k]) => ["opening", "lock", "alarm", "safety", "motion"].includes(k));
  const air = ents.map((e) => dfmAir(e, S[e])).filter(Boolean);
  const bat = kinds.find(([e, k]) => k === "battery" && num(S[e].state));
  const sig = kinds.find(([, k]) => k === "signal");
  const pw = ents.map((e) => powerW(S[e])).filter((v) => v != null);
  const attention = open.length + alarm.length; // #31: offline is a small amber badge, not red
  return {
    item, g, cat, lead, st, lk, on, camOnly, nOpen, open, doorOpen, alarm, warn, presence, offline, temps, hums, ents, attention, air,
    airR: air.length ? Math.max(...air.map((x) => x.r)) : null,
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

  /** #96: a basic editor: only what the mobile card itself needs (the rest is set in the Floorplan Editor and the
   *  Floorplan card it takes its settings from). */
  static async getConfigForm() {
    const ha = document.querySelector("home-assistant");
    const cards = await dfmFloorplanCards(ha && ha.hass).catch(() => []);
    return {
      schema: [
        { name: "source", selector: { select: { mode: "dropdown", options: [{ value: "", label: dfT("mob.cfg_source_auto") }, ...cards.map((c) => ({ value: c.key, label: c.label }))] } } },
        { name: "layout", selector: { select: { mode: "dropdown", options: ["auto", "portrait", "landscape"].map((v) => ({ value: v, label: dfT(`mob.layout_${v}`) })) } } },
        { name: "room_order", selector: { select: { mode: "dropdown", options: ["active", "alpha", "plan"].map((v) => ({ value: v, label: dfT(`mob.order_${v}`) })) } } },
        { name: "sections", selector: { select: { multiple: true, reorder: true, options: DFM_SECTIONS.map((v) => ({ value: v, label: dfT(`mob.sec_${v}`) })) } } },
        { name: "people", selector: { entity: { domain: "person", multiple: true } } },
        { name: "hide_header", selector: { boolean: {} } },
      ],
      computeLabel: (s) => dfT(`mob.cfg_${s.name}`),
      computeHelper: (s) => (s.name === "source" ? dfT("mob.cfg_source_help") : s.name === "hide_header" ? dfT("mob.cfg_hide_help") : s.name === "layout" ? dfT("mob.cfg_layout_help") : s.name === "sections" ? dfT("mob.cfg_sections_help") : s.name === "people" ? dfT("mob.cfg_people_help") : undefined),
    };
  }

  setConfig(config) {
    const had = !!this._config;
    const prevSrc = (this._config && this._config.source) || "";
    this._config = { room_order: "active", default_overlay: "live", layout: "auto", copy_settings: true, hide_header: true, ...(config || {}) };
    if (had && this._hass && prevSrc !== (this._config.source || "")) this._loadBase(); // #96: another source picked
    this._s = this._s || { page: "house", floor: null, room: null, ov: null, back: [] }; // #89: the card opens on Home
    this._kick();
  }

  set hass(hass) {
    dfLangOf(hass);
    if (hass && hass.entities) dfcReg = hass.entities;
    this.toggleAttribute("dark", !!(hass.themes && hass.themes.darkMode));
    const prev = this._hass;
    this._hass = hass;
    if (!prev) this._loadBase();
    // #102: only the plans on screen follow Home Assistant (a cached one gets it again when it is shown).
    for (const el of (this._plans || new Map()).values()) if (el.isConnected) this._feed(el);
    // #102: no redraw when nothing the card shows has changed (the minute tick still refreshes everything).
    if (prev && this._watch && prev.entities === hass.entities && prev.areas === hass.areas && prev.language === hass.language && prev.themes === hass.themes) {
      let same = true;
      for (const e of this._watch) {
        if (prev.states[e] !== hass.states[e]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this._kick();
  }

  /** #103: Home Assistant's state for a plan. The Home page's small plan (only a way to pick a room) follows at
   *  most every 5 s, always ending on the latest state; every other plan at once. force: now (a tap, a new page). */
  _feed(el, force = false) {
    const hass = this._hass;
    if (!hass || el.hass === hass) return;
    clearTimeout(el._dfmFeedT);
    const wait = el._dfmMode === "mini" && !force ? 5000 - (Date.now() - (el._dfmFedAt || 0)) : 0;
    if (wait > 0) {
      el._dfmFeedT = setTimeout(() => this._feed(el, true), wait);
      return;
    }
    el._dfmFedAt = Date.now();
    el.hass = hass;
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // #67: "… minutes ago" stays true: one quiet pass a minute (the usual guards: never while touching / scrolling).
    if (!this._tick) this._tick = setInterval(() => this._kick(), 60000);
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
    this._onScroll = this._onScroll || (() => {
      this._scrollAt = Date.now();
      // #92-2: the portrait page's place, kept for the way back (not the jumps a turn of the phone causes, #102).
      if (!this._wasLand && Date.now() - (this._rotAt || 0) > 1500 && this._land() === this._wasLand) this._pY = window.scrollY || 0;
    });
    window.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
    this._onUp = this._onUp || (() => (this._ptr = null)); // #104: the finger is up wherever the event ends
    window.addEventListener("pointerup", this._onUp, true);
    window.addEventListener("pointercancel", this._onUp, true);
    // #102: a turn of the phone is drawn at once (not held back by the scroll guard) and checked again once the
    // viewport has settled: real phones often report the new size only after the first resize event.
    this._onRot = this._onRot || (() => {
      const land = this._land();
      if (land !== this._wasLand) {
        this._rotAt = Date.now();
        this._tapAt = performance.now(); // #110
        const host = this.shadowRoot && this.shadowRoot.querySelector("div.dfm");
        if (host) {
          host.classList.add("turning");
          setTimeout(() => host.classList.remove("turning"), 1200); // never left hidden
        }
      }
      this._kick(true);
      clearTimeout(this._rotT);
      this._rotT = setTimeout(() => this._land() !== this._wasLand && this._kick(true), 250);
      clearTimeout(this._rotT2);
      this._rotT2 = setTimeout(() => this._land() !== this._wasLand && this._kick(true), 700);
    });
    window.addEventListener("resize", this._onRot);
    if (!this._mq && window.matchMedia) this._mq = window.matchMedia("(orientation: landscape)");
    if (this._mq && this._mq.addEventListener) this._mq.addEventListener("change", this._onRot);
    this._kick(true);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    window.removeEventListener("resize", this._onRot);
    if (this._mq && this._mq.removeEventListener) this._mq.removeEventListener("change", this._onRot);
    clearTimeout(this._rotT);
    clearTimeout(this._rotT2);
    window.removeEventListener("scroll", this._onScroll, { capture: true });
    window.removeEventListener("pointerup", this._onUp, true);
    window.removeEventListener("pointercancel", this._onUp, true);
    this._hideHdr(true);
    if (this._lay) this._lay.remove();
    clearTimeout(this._t);
    clearTimeout(this._hdrT);
  }

  // ------------------------------------------------------------- settings of the main Floorplan card
  /** The first Floorplan card on the user's dashboards: its people, rooms, look and overlay settings (cached). */
  /** #96: the settings of the Floorplan card picked in the editor ("Settings from"), else the first one found. */
  async _loadBase() {
    if (this._config.copy_settings === false) return;
    const want = this._config.source || "";
    try {
      const cached = lsGet("dfm_base");
      this._base = cached && cached.key === want ? cached.b : this._base || null;
    } catch (_e) {
      this._base = null;
    }
    try {
      const cards = await dfmFloorplanCards(this._hass, !want);
      const hit = (want && cards.find((c) => c.key === want)) || cards[0];
      if (!hit) return;
      const b = {};
      for (const k of DFM_COPY) if (hit.cfg[k] !== undefined) b[k] = hit.cfg[k];
      this._base = b;
      this._baseKey = hit.key;
      lsSet("dfm_base", { key: want, b });
      for (const el of (this._plans || new Map()).values()) el._dfmCfg = null;
      this._kick(true);
    } catch (_e) {
      /* no other card: defaults */
    }
  }

  // ------------------------------------------------------------- the model (floors, rooms, items)
  _model() {
    const hass = this._hass;
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
    // #102: a device's info (overlays it is in, what it shows) is kept while its states and the settings are the
    // same; at most 30 s, so anything else it reads is never stale for long.
    const ep = this._ep || {};
    if (ep.b !== this._base || ep.e !== hass.entities || ep.ar !== hass.areas || ep.c !== this._config || ep.l !== hass.language) {
      this._ep = { b: this._base, e: hass.entities, ar: hass.areas, c: this._config, l: hass.language };
      this._ic = new Map();
    }
    const ic = this._ic;
    const now = Date.now();
    const watch = new Set(sens.map((s) => s.entity_id));
    for (const f of floors) {
      const order = Object.keys(f.a.areas || {});
      const byRoom = new Map(order.map((id) => [id, []]));
      const h = this._helper(f);
      for (const item of h._items(f.a)) {
        if (item.phantom) continue;
        const key = item.id.startsWith("bond:") ? `${f.id}|${item.id}` : item.id;
        if (seen.has(key) && !item.x && !item.px) continue;
        seen.add(key);
        const ents = [item.main_entity, ...(item.allEntities || item.entities || [])].filter(Boolean);
        for (const e of ents) watch.add(e);
        const refs = ents.map((e) => hass.states[e]);
        const ck = `${f.id}|${item.id}`;
        const hit = ic.get(ck);
        if (hit && hit.a === f.a && now - hit.at < 30000 && hit.refs.length === refs.length && hit.refs.every((r, i) => r === refs[i])) {
          items.push(hit.info);
          if (hit.info.room) byRoom.get(hit.info.room).push(hit.info);
          continue;
        }
        const akind = h._applKind(item);
        const info = dfmInfo(hass, item, { comfort: h._dev(item.id).comfort === true, appl: !!akind });
        info.floor = f.id;
        // 0.13.9.18: an appliance (type set, category Appliances, or drawn with a drum / line): its model, for the
        // Appliances section and its details (built by the Floorplan card, one code path).
        if (akind || (item.category || item.group) === "appliances" || (item.light && ["drum", "line"].includes(item.light.type))) info.ap = h._applModel(item);
        if (info.ap) info.h = h;
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
        ic.set(ck, { a: f.a, at: now, refs, info });
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
          airR: list.some((x) => x.airR != null) ? Math.max(...list.filter((x) => x.airR != null).map((x) => x.airR)) : null,
          power: list.reduce((t, x) => t + (x.power || 0), 0),
        };
        r.people = [];
        rooms.push(r);
      });
    }
    // People: the main card's list, else every person.
    const ppl = this._peopleList();
    const wx = Object.keys(hass.states).find((e) => e.startsWith("weather."));
    if (wx) watch.add(wx);
    if (hass.states["sun.sun"]) watch.add("sun.sun");
    this._watch = watch;
    const people = ppl.map((p) => {
      watch.add(p.entity);
      for (const v of Object.values(p)) if (typeof v === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(v)) watch.add(v); // its room sensors etc.
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
    // #102: the orientation from the media query (right at once on phones), a phone by its short side (true
    // whichever way round the size is reported).
    const w = window.innerWidth;
    const h = window.innerHeight;
    const wide = this._mq ? this._mq.matches : w > h;
    return wide && Math.min(w, h) <= 600;
  }

  _render() {
    if (!this._hass || !this.shadowRoot || !this.isConnected) return;
    // #23: never while a finger is on the screen or the page is scrolling; right after. #102: a turn of the
    // phone is never held back (turning moves the page, which looks like scrolling).
    const turning = this._land() !== this._wasLand;
    // A finger counts for at most 2 s: a lost pointerup (the plan's own drag code) never freezes the card (#104).
    const finger = this._ptr && Date.now() - (this._ptrAt || 0) < 2000;
    if (!turning && (finger || Date.now() - (this._scrollAt || 0) < 450)) {
      clearTimeout(this._t);
      this._t = setTimeout(() => this._render(), 300);
      return;
    }
    this._last = Date.now();
    // #102: timing, to measure on a real phone: the card option "debug: true" or "?dfm_debug=1" in the address.
    const dbg = this._config.debug === true || /[?&]dfm_debug=1/.test(location.search);
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
    if (!s.floor || !m.floors.some((f) => f.id === s.floor)) s.floor = this._mainFloor(m);
    if (s.room && !m.rooms.some((r) => r.id === s.room && r.floor === s.floor)) s.room = null;
    if (s.page === "room" && !s.room) s.page = "home";
    const land = this._land();
    const turned = this._wasLand !== undefined && land !== this._wasLand;
    if (land !== this._wasLand) {
      this._wasLand = land;
      this._hdrHidden = false;
    }
    this._layerHtml = "";
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
    // #110: the page first; a plan that is not there yet goes in right after the page is on the screen.
    const pend = [];
    for (const slot of root.querySelectorAll("[data-slot]")) {
      if (slot.firstElementChild) this._mount(slot);
      else pend.push(slot);
    }
    if (pend.length) {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        for (const slot of pend) if (slot.isConnected && !slot.firstElementChild) this._mount(slot);
        this._scaleAll();
        this._toolsTop();
      };
      requestAnimationFrame(() => setTimeout(go, 0)); // after the page is painted
      setTimeout(go, 80); // never later than this (a hidden tab has no frames)
    }
    this._renderLayer(!land && this._useLayer() ? this._layerHtml : "");
    const top = this._hdrOn ? 0 : Math.max(0, Math.round(this.getBoundingClientRect().top + (window.scrollY || 0)));
    if (top !== this._top) {
      this._top = top;
      this.style.setProperty("--dfm-top", `${top}px`);
    }
    if (land) this._hdrTimer();
    this._scaleAll();
    this._fitGreet();
    // #92-2: back to portrait = the portrait page as it was (its scroll place), never a leftover landscape layout.
    if (turned && !land) requestAnimationFrame(() => window.scrollTo(0, this._pY || 0));
    requestAnimationFrame(() => {
      this._scaleAll();
      this._toolsTop();
      if (host.classList.contains("turning")) requestAnimationFrame(() => host.classList.remove("turning")); // #102
    });
    if (dbg && this._tapAt) this._timeTap(land ? `landscape ${s.page}` : `portrait ${s.page}`);
  }

  /** #110: timing as felt, from the finger (tap, swipe, turn): when the page is on the screen and when its plan is
   *  ready (its picture loaded and drawn). */
  _timeTap(what) {
    const t0 = this._tapAt;
    this._tapAt = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._dbg(`${what}: page shown ${(performance.now() - t0).toFixed(0)} ms`);
      const until = performance.now() + 20000;
      const check = () => {
        const els = [...(this._plans || new Map()).values()].filter((el) => el.isConnected);
        const ready = els.length && els.every((el) => {
          const img = el.shadowRoot && el.shadowRoot.querySelector("img.plan");
          return img && img.complete && img.naturalWidth > 0;
        });
        if (ready) requestAnimationFrame(() => this._dbg(`${what}: plan ready ${(performance.now() - t0).toFixed(0)} ms`));
        else if (performance.now() < until) setTimeout(check, 50);
      };
      check();
    }));
  }

  /** #111: the side tools of the landscape plan start under the floor capsule. */
  _toolsTop() {
    if (!this._wasLand || !this.shadowRoot) return;
    const nav = this.shadowRoot.querySelector(".lnav");
    for (const el of (this._plans || new Map()).values()) {
      if (!el.isConnected || el._dfmMode !== "land" || !nav) continue;
      const card = (el.shadowRoot && el.shadowRoot.querySelector("ha-card")) || el;
      const n = nav.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      const top = Math.round(n.bottom - r.top + 10);
      const left = Math.round(n.left - r.left);
      if (el.style.getPropertyValue("--dfc-tools-top") !== `${top}px`) el.style.setProperty("--dfc-tools-top", `${top}px`);
      if (el.style.getPropertyValue("--dfc-tools-left") !== `${left}px`) el.style.setProperty("--dfc-tools-left", `${left}px`); // under the floors, exactly
    }
  }

  /** #102 / #106: timing on the screen itself (a phone has no console at hand) and in the console; last 4 lines. */
  _dbg(line) {
    if (!(this._config.debug === true || /[?&]dfm_debug=1/.test(location.search))) return;
    console.info(`[device-floorplan-mobile] ${line}`);
    const t = new Date();
    this._dbgL = [...(this._dbgL || []).slice(-3), `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")} ${line}`];
    let box = this.shadowRoot && this.shadowRoot.querySelector("#dfmdbg");
    if (!box && this.shadowRoot) {
      box = document.createElement("pre");
      box.id = "dfmdbg";
      box.style.cssText = "position:fixed;left:64px;top:6px;z-index:20;margin:0;padding:6px 8px;max-width:92vw;white-space:pre-wrap;font:11px/1.35 monospace;color:#fff;background:rgba(0,0,0,.72);border-radius:8px;pointer-events:none";
      this.shadowRoot.appendChild(box);
    }
    if (box) box.textContent = this._dbgL.join("\n");
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
    const [plan, ov, mode] = slot.dataset.slot.split("|");
    const focus = slot.dataset.focus || "";
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
    const land = mode === "land";
    const cfg = {
      // #79: its own storage key per kind of plan (layers, replay…): the mobile card never changes the dashboard
      // card's settings, nor one of its plans another. #83: landscape = the card with its overlay rail and Replay.
      ...b, plans: undefined, card_id: `dfm-${mode}`, type: "custom:device-floorplan-card", plan,
      buttons: { position: "hidden" }, layers_button: full ? "top-right" : "hidden",
      replay: full || land ? undefined : false, replay_button: false, replay_now: false, replay_global: true, hide_admin_hint: true, embedded: true, remember_floor: false, default_overlay: ov,
      people_row: false, frame: { mode: "custom", t: 0, r: 0, b: 0, l: 0 },
      ...(focus ? { focus_area: focus, focus_aspect: this._bandAspect(), rooms: { ...(b.rooms || {}), show_in: [] } } : {}),
      // #41: portrait plans are Live with one temperature · humidity chip per room.
      ...(["mini", "floor", "room"].includes(mode) ? { room_values: true } : {}),
      // #111 / #113: landscape: the overlay's controls beside the plan (nothing under it); Network shows Zigbee
      // until other connections are switched on (unless the Floorplan card chose its own).
      ...(land ? { tools: "side", network: { ...(b.network || {}), connections: Array.isArray((b.network || {}).connections) && b.network.connections.length ? b.network.connections : ["zigbee"] } } : {}),
    };
    const sig = JSON.stringify(cfg);
    if (el._dfmCfg !== sig) {
      el._dfmCfg = sig;
      el.setConfig(cfg);
    }
    el._dfmMode = mode;
    el._dfmFloor = plan;
    el._fitHost = land;
    const fresh = el.parentNode !== slot;
    if (fresh) slot.appendChild(el);
    if (this._hass) this._feed(el, fresh); // #103: a plan just shown is up to date at once
    // Landscape: the overlay picked on the mobile card's rail (#93).
    const want = land ? this._lov || ov : ov;
    if (el.dfSetOverlay && el._dfmOv !== want) el.dfSetOverlay(want);
    el._dfmOv = want;
    if (land && el.dfOutlineRoom && this._m) {
      const sel = this._landSel(this._m); // #107: the chosen room outlined
      el.dfOutlineRoom(sel ? sel.id : null, sel ? this._vals(sel) : "");
    }
  }

  /** #33: the room band's shape: the screen's width × a third of its height (portrait); the left area (landscape). */
  _bandAspect() {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 844;
    const a = w / (h / 3);
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
      const k = Math.max(el._dfmMode === "land" ? 0.85 : 0.45, Math.min(1, w / 900)).toFixed(2); // #114: finger-sized in landscape
      if (el.style.getPropertyValue("--dfc-ui") !== k) el.style.setProperty("--dfc-ui", k);
      const kr = Math.max(0.75, Number(k)).toFixed(2); // #95: room names keep at least 3/4 of their size
      if (el.style.getPropertyValue("--dfc-ui-room") !== kr) el.style.setProperty("--dfc-ui-room", kr);
    }
  }

  _slot(plan, ov, focus = "", mode = "mini", cls = "") {
    // #110: the room is not part of the slot's name: the next room reuses the same plan (only its focus moves).
    return `<div class="plan ${cls}" data-slot="${cesc([plan, ov, mode].join("|"))}" data-focus="${cesc(focus)}"></div>`;
  }
}
