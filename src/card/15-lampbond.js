Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.11.1: a bond whose members are all lights acts as one lamp. */
  _lampBond(item) {
    const e = this._parts(item);
    return !!(item && item.bond) && e.length > 0 && e.every((x) => domainOf(x) === "light");
  },

  /** 0.12.9: a bond's real parts: its entities without settings / technical ones (an "Internet access" switch). */
  _parts(item) {
    const e = (item && item.entities) || [];
    const r = e.filter((x) => !this._aux(x));
    return r.length ? r : e;
  },

  /** Entities the info card can switch (lights, switches, fans, helpers). */
  _infoToggles(s) {
    const ents = [...new Set(s.ents || [])].filter((e) => ["light", "switch", "fan", "input_boolean"].includes(domainOf(e)) && this._hass.states[e] && !this._aux(e));
    // Only lamp bonds get on / off, and only their lights: never an appliance's plug or a config switch.
    if (this._applOf(s.item)) return [];
    const lamp = domainOf(s.eid || "") === "light" || s.item.group === "lights" || s.item.actsAs === "light" || s.item.as === "light";
    return lamp ? ents.filter((e) => domainOf(e) === "light" || (s.item.group === "lights" && e === s.eid)) : [];
  },

  /** A configuration or diagnostic entity (Home Assistant's category): never listed or switched. */
  _aux(e) {
    const reg = this._hass.entities && this._hass.entities[e];
    const st = this._hass.states[e];
    const cat = (reg && reg.entity_category) || (st && st.attributes && st.attributes.entity_category);
    return cat === "config" || cat === "diagnostic";
  },

  /** Edit markers (0.7.5): the selected bond / phantom / appliance shows its info card as a preview. */
  _previewPop() {
    const id = this._pick && this._selId;
    if (!id || this._prevHide === id) return null;
    if ((this._appls || []).some((o) => o.ap.item.id === id)) return { type: "info", appl: id, prev: true };
    const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x.item && x.item.id === id);
    return sp && (sp.phantom || sp.item.bond || sp.item.phantom) ? { type: "info", key: sp.key, prev: true } : null;
  },

  /** 0.7.5: the info card: name, state, every reading, buttons; "Open ›" = the marker's action. */
  _infoHtml(p) {
    const hass = this._hass;
    const close = `<button data-close="1" aria-label="${dfT("close")}">×</button>`;
    let name, dot, state, item, lead, reads = [], toggles = [], open = "", anchor, attention = "";
    if (p.appl) {
      const o = (this._appls || []).find((x) => x.ap.item.id === p.appl);
      if (!o) return "";
      const { ap, st } = o;
      item = ap.item;
      name = this._dev(item.id).name || item.name;
      dot = `rgb(${st.col || "150,150,150"})`;
      const per = this._per(item, "live");
      const chosen = per.lead && hass.states[per.lead] ? per.lead : null;
      state = [chosen ? this._fmt(chosen) : st.word, st.time, st.w].filter(Boolean).join(" · ");
      lead = chosen || ap.status || ap.running || ap.power || ap.plug || item.main_entity;
      reads = Array.isArray(per.extras) ? per.extras : [ap.remaining || ap.progress, ap.power].filter(Boolean);
      if (st.phase === "done") attention = `<button class="ibig" data-appldone="${cesc(item.id)}">${dfT("appl.unloaded")}</button>`;
      open = lead ? `<button class="iopen" data-iopen="${cesc(lead)}">${dfT("open_more")}</button>` : "";
      anchor = `[data-appl*="${CSS.escape(item.id)}"]`;
    } else {
      const s = this._specs && this._specs.get(p.key);
      if (!s) return "";
      item = s.item;
      name = s.name;
      const on = s.type === "chip" ? s.cls !== "off" : s.on;
      dot = on ? s.color || "var(--dfc-accent)" : "#9e9e9e";
      // 0.12.9: a chip says its value (what the plan shows) and lists its own readings too.
      state = this._tipState(s) || (s.type === "chip" ? (s.lines || []).filter(Boolean).join(" · ") : "") || "—";
      state = state.split(" · ").filter((x) => x && x !== "—").join(" · ") || "—"; // no "— · Off"
      lead = s.type === "chip" ? null : s.eid || (s.ents || [])[0];
      const picked = Array.isArray(this._per(item, this._overlay).extras) ? this._per(item, this._overlay).extras : null;
      reads = picked || [...(s.ents || []), ...(s.also || []), ...(item.entities || [])];
      // 0.11.1: a bond lists every member (its leading one too); each row opens that member's details.
      if (s.phantom || item.bond) lead = null; // a phantom has no one leading entity: all its sensors are listed
      // 0.12.7: a bond always lists all its parts, then the picked "Also show" lines.
      if (item.bond) reads = [...(item.entities || []), ...(picked || s.also || [])];
      else if (s.phantom && picked) reads = [...(s.ents || []), ...picked];
      toggles = this._infoToggles(item.bond ? { ...s, ents: item.entities || [] } : s);
      open = item.bond ? "" : `<button class="iopen" data-iopen="${cesc(s.key)}">${s.phantom ? dfT("graphs_more") : dfT("open_more")}</button>`;
      anchor = `[data-k="${CSS.escape(s.key)}"]`;
      if (toggles.length) {
        const anyOn = toggles.some((e) => (hass.states[e] || {}).state === "on");
        attention = `<button class="ibig" data-itg="${cesc(s.key)}">${anyOn ? dfT("turn_off") : dfT("turn_on")}</button>`;
      }
    }
    // A chip's own readings are listed even when HA files them under Diagnostic (Health's battery).
    const sp0 = !p.appl && this._specs && this._specs.get(p.key);
    const own = new Set(sp0 ? sp0.ents || [] : []); // what the plan draws (its picked lines too); a Diagnostic one only as a number
    reads = [...new Set([...own, ...reads])].filter((e) => e && e !== lead && hass.states[e] && (!this._aux(e) || (own.has(e) && num(hass.states[e].state))) && !NO_VALUE.has(domainOf(e)));
    // 0.12.9: readings before switches and settings (a bond keeps its parts first).
    const rank = (e) => (["sensor", "climate", "weather"].includes(domainOf(e)) ? 0 : domainOf(e) === "binary_sensor" ? 1 : 2);
    if (!(item && (item.bond || item.phantom))) reads = reads.map((e, i) => [e, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]);
    const pool = [...new Set([...(item.entities || []), ...(item.allEntities || [])])];
    const presses = pool.filter((e) => ["button", "input_button"].includes(domainOf(e)) && live(hass.states[e]) && !this._aux(e)).slice(0, 3);
    // 0.12.9: names without the card's name or Home Assistant's device name in front.
    const strip = (e) => this._shortName(item, e, name, !!(item && (item.bond || item.phantom)));
    const seen = new Set();
    const rows = reads.filter((e) => {
      const k = `${strip(e)}|${this._extraText(e)}`; // one row per name and value (D1)
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8).map((e) => `<button class="irow" data-mi="${cesc(e)}"><span>${cesc(strip(e))}</span><b>${cesc(this._extraText(e))}</b></button>`).join("");
    const pr = presses.map((e) => `<button class="ipress" data-press="${cesc(e)}">${cesc(strip(e))}</button>`).join("");
    // 0.8.1: redrawn for new values at the spot it already had (no fade out and in).
    const was = this._icPos && this._icPos.anc === anchor ? this._icPos : null;
    return `<div class="pop ip ${p.prev ? "prev" : ""}"><div class="icard ${was ? "placed" : ""}" ${was ? `style="left:${was.left}px;top:${was.top}px"` : ""} role="dialog" aria-label="${cesc(name)}" data-anc="${cesc(anchor)}"><div class="ih"><b>${cesc(name)}</b>${close}</div><div class="ist"><i style="background:${dot}"></i><span>${cesc(state)}</span></div>${rows ? `<div class="irows">${rows}</div>` : ""}${attention || pr ? `<div class="ibtns">${attention}${pr}</div>` : ""}${open ? `<div class="iacts">${open}</div>` : ""}</div></div>`;
  },

  _entName(e) {
    return entName(this._hass, e);
  },

  /** 0.12.9: an entity's name without its device's name in front (the card's name, HA's device names). */
  _shortName(item, e, name, multi) {
    const hass = this._hass;
    const full = this._entName(e);
    const reg = (hass.entities || {})[e];
    const dv = reg && reg.device_id && (hass.devices || {})[reg.device_id];
    const pre = [name, item && item.name, dv && dv.name_by_user, dv && dv.name].filter(Boolean).map((x) => String(x).trim()).sort((x, y) => y.length - x.length);
    for (const n of pre) {
      if (full.toLowerCase().startsWith(n.toLowerCase()) && full.length > n.length) {
        const rest = full.slice(n.length).replace(/^[\s\-_·:]+/, "");
        // 0.12.10: in a marker of several devices the device's name tells the rows apart ("TH01 · Temperature").
        const dn = dv && (dv.name_by_user || dv.name);
        if (rest && multi && dn && n !== name && n !== (item && item.name)) return `${dn} · ${rest.replace(/^\w/, (c) => c.toUpperCase())}`;
        if (rest) return rest.replace(/^\w/, (c) => c.toUpperCase());
      }
    }
    return full;
  },

  /** Put the info card next to its marker, inside the card. */
  _placeInfo() {
    const ic = this.shadowRoot && this.shadowRoot.querySelector(".icard");
    if (!ic) return;
    const pop = ic.parentElement.getBoundingClientRect();
    const anc = this.shadowRoot.querySelector(ic.dataset.anc);
    const r = ic.getBoundingClientRect();
    let x = pop.width / 2, y = pop.height / 2, below = false;
    if (anc) {
      const a = anc.getBoundingClientRect();
      x = a.left + a.width / 2 - pop.left;
      y = a.top - pop.top - 10;
      if (y - r.height < 6) {
        y = a.bottom - pop.top + 10;
        below = true;
      }
    } else {
      y = (pop.height + r.height) / 2;
    }
    const left = Math.max(6, Math.min(pop.width - r.width - 6, x - r.width / 2));
    const top = below ? Math.min(pop.height - r.height - 6, y) : Math.max(6, y - r.height);
    ic.style.left = `${left}px`;
    ic.style.top = `${top}px`;
    ic.classList.add("placed");
    this._icPos = { anc: ic.dataset.anc, left, top };
  },

  /** 0.11: was this just turned off in Live (still within its few undo seconds)? */
  _undoFor(eids) {
    const u = this._undo;
    return !!(u && Date.now() < u.until && eids.some((e) => u.ents.includes(e)));
  },
});
