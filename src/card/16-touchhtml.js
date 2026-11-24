Object.assign(DeviceFloorplanCard.prototype, {

  /** 0.12.1 Touch areas: invisible tap areas for devices already drawn in the plan picture (a TV, an AC), set
   *  in the Floorplan Editor. Live only; they work when the device is off too. The smaller one wins where two
   *  overlap (drawn last). Card setting live.touch_hint: flash (when you tap empty plan), outline, or none. */
  _touchHtml(a) {
    if (this._overlay !== "live" || this._rpIn()) return "";
    const hint = ((this._config.live || {}).touch_hint) || "flash";
    const list = this._items(a)
      .map((it) => [it, this._bodyOf(it)])
      .filter(([it, b]) => b && b.touch && !b.pic && Number.isFinite(it.x) && this._per(it, "live").tap !== "none")
      .sort(([, x], [, y]) => y.touch.w * y.touch.h - x.touch.w * x.touch.h);
    return list
      .map(([it, b]) => {
        const { w, h } = b.touch;
        const busy = this._busyOn(it.id) ? "busy" : "";
        return `<div class="touch ${hint === "outline" ? "outline" : ""} ${busy}" data-touch="${cesc(it.id)}" data-ent="${cesc(b.lead)}" role="button" aria-label="${cesc(b.name)}" style="left:${it.x - w / 2}%;top:${it.y - h / 2}%;width:${w}%;height:${h}%"></div>`;
      })
      .join("");
  },

  /** 0.12.2 Device pictures (Live): the picture stands at the device and is its tap area (tap = the device's
   *  tap, hold = details, also when off). One look per state, changeable per device in the Floorplan Editor:
   *  on = full, off = faint, unavailable = dotted outline. The outline is traced from the picture's transparency
   *  when it is picked; "inset" pulls it a little inside. A tint keeps the picture's shading (blend "color"). */
  _picHtml(a, part = "body") {
    if (this._overlay !== "live") return "";
    const replay = this._rpIn(); // 0.12.3: in Replay the picture takes the look of the replayed moment
    const out = [];
    for (const it of this._items(a)) {
      const body = this._bodyOf(it);
      const p = body && body.pic;
      if (!p || !Number.isFinite(it.x)) continue;
      // 0.12.4: one rule for every picture. The entity picked in Edit markers ("Show in Live when…") decides
      // On / Off (with an optional "counts as on when"); without one, the item's own entities do.
      const pl = this._per(it, "live");
      const st = this._picState(body.sents, pl.when || pl.lead, pl.when_on); // 0.12.5: else the entity that leads
      const state = st;
      const look = (p.looks || {})[state] || PIC_LOOK[state];
      // Highlight: with an entity picked in Edit markers it follows that entity (by default only while On);
      // 0.13.3: without one, every highlight look shows while the picture is On.
      const hl = !p.hl || !p.hl.look ? null
        : pl.hl ? ((pl.hl_any || state === "on") && this._picState([pl.hl], pl.hl, pl.hl_on) === "on" ? p.hl : null)
          : state === "on" ? p.hl : null;
      if (look === "hidden") continue;
      const url = this._picUrl(p.src);
      if (!url) continue;
      const busy = !replay && this._busyOn(it.id);
      if (part === "hl") {
        out.push(picMarkup({ p, url, look, hl, x: it.x, y: it.y, part }));
        continue;
      }
      out.push(picMarkup({ p, url, look, hl, busy, x: it.x, y: it.y, part, attrs: `data-touch="${cesc(it.id)}" data-ent="${cesc(body.lead)}" role="button" aria-label="${cesc(`${body.name}${state === "un" ? " · unavailable" : ""}`)}"` }));
    }
    return out.join("");
  },

  /** 0.12.6: does the device have a look of its own here (Live: a touch area; its chosen light shape while on)?
   *  Then its marker draws no icon. Same rule for every marker; pictures replace the marker anyway. */
  _lookHere(s) {
    if (!s || !s.item || this._overlay !== "live" || s.type === "net") return false;
    const b = this._bodyOf(s.item);
    return !!(b && b.touch); // 0.12.7: a light shape is not a look (Live's "Lights as" decides for lamps)
  },

  /** Does a picture stand for this item (itself or its bond)? Its marker is then not drawn in Live. */
  _picStands(it) {
    return !!it.pic;
  },

  /** 0.12.3: the "body" of an item (its picture / touch area). A bond is one item on the card (members merged),
   *  carrying the picture / touch area of the member that has one. Works the same for a device, a bond and an
   *  entity placed on its own. */
  _bodyOf(it) {
    if (!it || (!it.pic && !it.touch)) return null;
    const ents = [...new Set([it.main_entity, ...(it.allEntities || it.entities || [])].filter(Boolean))];
    const lead = it.main_entity || ents[0];
    if (!lead) return null;
    const sw = it.bond ? it.entities || [lead] : [lead]; // a bond switches its members' main entities together
    // 0.13.9.1: what the picture's own On / Off follows: the same as its marker (a bond: its members' main
    // entities; a device: its main entity); without one, only the device's primary entities (Home Assistant's
    // own label: no "config" / "diagnostic" category, not hidden), so a setting such as a delay number never
    // keeps it On.
    const reg = (this._hass && this._hass.entities) || {};
    const primary = ents.filter((e) => { const r = reg[e]; return !r || (!r.entity_category && !r.hidden); });
    const sents = it.bond ? sw : it.main_entity ? [it.main_entity] : primary.length ? primary : ents;
    return { pic: it.pic, touch: it.touch, ents, sents, lead, sw, name: this._dev(it.id).name || it.name || "", bond: !!it.bond };
  },

  /** 0.12.4: "on" / "off" / "un" of a picture. With an entity picked: its state, "on" by the Overlay Bar rule
   *  (on, open, home, playing…) or by "counts as on when" (same syntax: "charging, CHARGING", ">0"). Without one:
   *  on when any of the item's entities is on; unavailable when all are. */
  _picState(ents, when, whenOn) {
    if (when && this._hass.states[when]) {
      const s0 = this._hass.states[when];
      if (s0.state === "unavailable") return "un";
      return barActive(this._hass, when, whenOn) ? "on" : "off";
    }
    const sts = ents.map((e) => this._hass.states[e]).filter(Boolean);
    if (!sts.length || sts.every((x) => x.state === "unavailable")) return "un";
    return sts.some((x) => !PIC_OFF.has(x.state)) ? "on" : "off";
  },

  /** The picture's address: the library is a static file; an own picture needs a signed address (async). */
  _picUrl(src) {
    if (src.startsWith("lib:")) return `${STATIC_BASE}/pictures/${src.slice(4)}.webp`;
    this._picSigned = this._picSigned || new Map();
    const hit = this._picSigned.get(src);
    if (hit) return hit;
    if (!this._picSigning) {
      this._picSigning = true;
      cardSign(this._live || this._hass, src)
        .then((u) => {
          this._picSigned.set(src, u);
          this._update(true);
        })
        .catch(() => {})
        .finally(() => (this._picSigning = false));
    }
    return null;
  },

  _touchTap(id) {
    const it = this._items(this._a || {}).find((x) => x.id === id);
    const b = it && this._bodyOf(it);
    if (!b) return;
    // 0.13.2: a phantom's picture / touch area does what its marker does (readings, or its info card).
    if (it.phantom) {
      const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x && x.item && x.item.id === id);
      if (sp) return this._tapSpec(sp);
      this._popup = { type: "info", key: id };
      return this._update(true);
    }
    // 0.12.3: a bond's picture / touch area switches the whole bond (its members' main entities), as its marker.
    this._runAction({ type: "dev", key: `touch:${id}`, item: it, ents: b.bond ? b.sw : b.ents, eid: b.lead, kind: kindOf(b.lead, this._hass.states[b.lead]) });
  },

  /** 0.12.6: a touch area / picture held = its device's long press (a lamp bond: its info card). */
  _touchHold(id, ent) {
    const sp = [...((this._specs && this._specs.values()) || [])].find((x) => x && x.item && x.item.id === id);
    this._pickNote(id);
    if (sp) return this._runHold(sp);
    const it = this._items(this._a || {}).find((x) => x.id === id);
    const b = it && this._bodyOf(it);
    if (!b) return this._moreInfo(ent);
    this._runHold({ type: "dev", key: `touch:${id}`, item: it, ents: b.bond ? b.sw : b.ents, eid: b.lead, kind: kindOf(b.lead, this._hass.states[b.lead]) });
  },

  /** Tapping empty plan briefly shows where the touch areas are (hint "flash"). */
  _flashTouch() {
    if (((this._config.live || {}).touch_hint || "flash") !== "flash") return;
    const zs = this.shadowRoot.querySelectorAll(".touch");
    if (!zs.length) return;
    zs.forEach((z) => z.classList.add("flash"));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => zs.forEach((z) => z.classList.remove("flash")), 700);
  },

  /** 0.12.1: after a tap, a short "working" pulse until the device answers (slow IR ACs, shutters), max 8 s. */
  _markBusy(item, ents) {
    if (!item || !item.id) return;
    this._busy = this._busy || new Map();
    this._busy.set(item.id, { until: Date.now() + 8000, ents, was: ents.map((e) => (this._hass.states[e] || {}).state).join("|") });
    clearTimeout(this._busyT);
    this._busyT = setTimeout(() => this._update(true), 8100);
  },

  _busyOn(id) {
    const b = this._busy && this._busy.get(id);
    if (!b) return false;
    const now = b.ents.map((e) => (this._hass.states[e] || {}).state).join("|");
    if (Date.now() > b.until || now !== b.was) {
      this._busy.delete(id);
      return false;
    }
    return true;
  },

  _toggle(s) {
    const ents = s.ents.filter((e) => TOGGLE_DOMAINS.has(domainOf(e)));
    if (!ents.length) return this._moreInfo(s.ents[0]);
    this._markBusy(s.item, ents);
    if (ents.every((e) => domainOf(e) === "cover")) {
      const anyOpen = ents.some((e) => ["open", "opening"].includes((this._hass.states[e] || {}).state));
      this._hass.callService("cover", anyOpen ? "close_cover" : "open_cover", { entity_id: ents });
      return;
    }
    const anyOn = ents.some((e) => (this._hass.states[e] || {}).state === "on");
    // 0.11: turned off in Live, it stays a few seconds, faded, so one more tap turns it back on.
    if (anyOn && this._overlay === "live") {
      this._undo = { ents, until: Date.now() + 6000 };
      clearTimeout(this._undoT);
      this._undoT = setTimeout(() => this._update(true), 6100);
    }
    this._hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
  },

  _coverCmd(eid, cmd) {
    const ents = eid === "__all" ? ((this._popup && this._popup.ents) || (this._specs.get(this._popup && this._popup.key) || { ents: [] }).ents).filter((e) => domainOf(e) === "cover") : [eid];
    const svc = { open: "open_cover", close: "close_cover", stop: "stop_cover" }[cmd];
    if (svc && ents.length) this._hass.callService("cover", svc, { entity_id: ents });
  },

  /** Highlight a marker for a few seconds (from a popup list, #65). */
  _highlight(key) {
    this._popup = null;
    this._hl = key;
    this._update(true);
    clearTimeout(this._hlT);
    this._hlT = setTimeout(() => {
      this._hl = null;
      this._update(true);
    }, 4000);
  },
});
