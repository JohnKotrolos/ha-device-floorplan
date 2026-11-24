Object.assign(DeviceFloorplanPanel.prototype, {

  /** 0.12.3: where a device's picture / touch area is kept. A bond is one device: its body sits on the member
   *  that already has one, else on its first placed member. */
  _bodyId(id) {
    if (String(id || "").startsWith("ph:")) return id; // 0.13.2: a phantom keeps its own
    const b = id && this._bondOf(id);
    if (!b) return id;
    const P = this.work.positions;
    const ids = b[1].filter((m) => P[m]);
    return ids.find((m) => P[m].pic) || ids.find((m) => P[m].touch) || ids[0] || id;
  },

  /** 0.13.2: the record holding a spot's picture / touch area: its placed position, or the phantom itself. */
  _bodyRec(id) {
    const bid = this._bodyId(id);
    if (String(bid || "").startsWith("ph:")) return (this.work.phantoms || {})[bid.slice(3)] || null;
    return (bid && this.work.positions[bid]) || null;
  },

  /** 0.12.2: the device's picture on the plan (library or own upload): size, turn, tint, looks per state. */
  /** 0.13.1: the sections every kind of spot gets (device, split spot, entity placed on its own), from one list, so a
   *  new feature lands everywhere. Each section decides itself whether it applies; the light shape stays in each
   *  kind's own layout. */
  _spotSections(d, onPlan) {
    const pos = this.work.positions[d.id];
    if (!onPlan || !pos) return "";
    const bond = this._bondOf(d.id);
    return `${this._heightHtml(d, pos)}${bond ? "" : this._picSectionHtml(d, pos)}${bond || pos.pic ? "" : this._touchSectionHtml(d, pos)}${this._airSectionHtml(d)}${this._openSectionHtml(d)}`;
  },

  _picSectionHtml(d, pos, bond = false) {
    if (this.s.picGridFor !== d.id) {
      this.s.picGrid = false; // the picker closes when another device is picked
      this.s.picGridFor = d.id;
    }
    if (!pos) return ""; // every kind of spot (0.13.2: phantoms too)
    const p = pos.pic;
    const what = bond ? "the whole bond" : "the icon";
    const cur = p
      ? `<span class="picprev"><span class="pict">${this._picThumb(p.src, p.tint)}</span><span style="flex:1">${esc(p.src.startsWith("lib:") ? picName(p.src.slice(4)) : "Your own picture")}</span><button class="btn" data-act="picgrid">${this.s.picGrid ? "Close" : "Change"}</button></span>`
      : `<span class="picprev"><span style="flex:1;font-size:12px;color:var(--df-sec)">A top-down picture instead of ${what}, in Live. The picture is where you tap.</span><button class="btn" data-act="picgrid">${this.s.picGrid ? "Close" : "Choose…"}</button></span>`;
    const grid = this.s.picGrid ? this._picGridHtml(p) : "";
    if (!p) return `<div class="fl" style="display:flex;flex-direction:column;gap:6px"><span><b>Picture</b></span>${cur}${grid}</div>`;
    const lk = p.looks || {};
    const sel = (k, label) => `<label class="fl" style="flex:1">${label}<select data-act="piclook" data-k="${k}">${PIC_LOOKS.map(([v, l]) => `<option value="${v}" ${(lk[k] || PIC_DEF[k]) === v ? "selected" : ""}>${l}${PIC_DEF[k] === v ? " (default)" : ""}</option>`).join("")}</select></label>`;
    const rng = (k, label, min, max, step, val, unit) => `<label class="fl">${label} <span style="color:var(--df-sec)">${val}${unit}</span><input type="range" data-act="picnum" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
    // 0.13.2: a Christmas tree on a light or plug: one tap puts Christmas lights in rings on it.
    const lead = !String(d.id).startsWith("ph:") && this.work.positions[d.id] && this._isLight(d.id) ? this._lightLead(d.id) : null;
    const tree = lead && p.src.startsWith("lib:tree-") ? `<button class="btn" data-act="xtree">🎄 Add lights on the tree</button>` : "";
    return `<div class="fl" style="display:flex;flex-direction:column;gap:6px"><span><b>Picture</b></span>${cur}${grid}${tree}
      ${rng("w", "Size", 1, 40, 0.5, p.w, " % of the plan width")}${rng("r", "Turn", 0, 355, 5, p.r || 0, "°")}
      <label class="fl">Colour <span style="display:flex;gap:8px;align-items:center"><input type="color" data-act="pictint" value="${esc(p.tint || "#9aa4ae")}"><label style="font-size:12px"><input type="checkbox" data-act="pictinton" ${p.tint ? "checked" : ""}> Tint the picture</label></span></label>
      <span style="font-size:12px;color:var(--df-sec)">Preview on the plan:</span>
      <div class="pvsw">${[["on", "On"], ["off", "Off"], ["un", "Unavailable"], ...(p.hl ? [["hl", "Highlight"]] : [])].map(([v, l]) => `<button data-act="picprev" data-v="${v}" class="${(this.s.picPrev || "on") === v ? "on" : ""}">${l}</button>`).join("")}</div>
      <span style="font-size:12px;color:var(--df-sec)">How it looks on the card:</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${sel("on", "On")}${sel("off", "Off")}${sel("un", "Unavailable")}</div>
      ${rng("inset", "Outline inset", 0, 20, 1, p.inset ?? 4, " % of the picture")}
      <label class="fl">Highlight <span style="display:flex;gap:8px;align-items:center"><select data-act="pichl">${[["", "None"], ["glow", "Glow (still)"], ["breathing", "Breathing glow (animated)"], ["flow", "Flow: a light runs around (animated)"], ["tint", "Tint (a second colour)"], ["sparkle", "Sparkle: twinkling dots (animated)"], ["spin", "Spin: the picture turns (a fan; animated)"]].map(([v, l]) => `<option value="${v}" ${(((p.hl || {}).look === "pulse" ? "breathing" : (p.hl || {}).look) || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>${p.hl ? `<input type="color" data-act="pichlcol" value="${esc(p.hl.color || "#2196f3")}">` : ""}</span></label>
      ${p.hl && p.hl.look === "spin" ? `<div class="fl" style="display:flex;flex-direction:column;gap:4px"><span>Spin centre <span style="color:var(--df-sec)">tap or drag onto the point it turns around (a fan's hub)</span></span><span class="spinbox" data-spinbox="1" style="aspect-ratio:${p.ar || 1}">${this._picThumb(p.src, p.tint)}<i class="spinpt" style="left:${p.hl.ox ?? 50}%;top:${p.hl.oy ?? 50}%"></i></span>${p.hl.ox != null || p.hl.oy != null ? `<button class="link" data-act="spinreset" style="align-self:flex-start">Back to the centre</button>` : ""}</div>` : ""}
      ${p.hl ? `<span style="font-size:12px;color:var(--df-sec)">Shown on top of its look while the picture is On. To follow something else (a car charging, a washer running…), pick it in the card: Edit markers → Live → Highlight when.</span>` : ""}
      <span style="display:flex;gap:6px">${p.looks ? `<button class="btn" data-act="piclookreset">Reset looks</button>` : ""}<button class="btn" data-act="picoff">Remove picture</button></span></div>`;
  },

  /** A small picture (with its tint) for the picker. */
  _picThumb(src, tint) {
    const url = this._picUrl(src);
    if (!url) return "";
    return `<img src="${esc(url)}" alt="" loading="lazy">${tint ? `<span class="ptint" style="background:${esc(tint)};-webkit-mask-image:url('${esc(url)}');mask-image:url('${esc(url)}')"></span>` : ""}`;
  },

  /** 0.12.3: the picture picker: thumbnails grouped, your own pictures (delete the unused ones) and upload. */
  _picGridHtml(p) {
    const cur = p ? p.src : "";
    const tile = (src, label, del) => `<button class="ptile ${cur === src ? "on" : ""}" data-act="picpick" data-src="${esc(src)}" title="${esc(label)}"><span class="pict">${src ? this._picThumb(src) : `<ha-icon icon="mdi:cancel"></ha-icon>`}</span><span class="pl">${esc(label)}</span>${del ? `<span class="pdel" data-act="picdel" data-src="${esc(src)}" title="Delete this picture (no device uses it)">×</span>` : ""}</button>`;
    if (!this._ownPics) {
      this._ownPics = [];
      this._ws("pictures/list")
        .then((r) => {
          this._ownPics = r.pictures || [];
          this._render();
        })
        .catch(() => {});
    }
    const own = (this._ownPics || []).map((x) => tile(x.url, "Your picture", !x.used && x.url !== cur)).join("");
    const groups = Object.entries(PIC_LIB).map(([g, list]) => `<div class="pgh">${esc(g)}</div><div class="pgrid">${list.map((n) => tile(`lib:${n}`, picName(n))).join("")}</div>`).join("");
    return `<div class="pgwrap"><div class="pgrid">${tile("", "None (its icon)")}<button class="ptile" data-act="picup" title="A transparent PNG or WebP, max 2 MB"><span class="pict"><ha-icon icon="mdi:upload"></ha-icon></span><span class="pl">Upload your own</span></button></div>${own ? `<div class="pgh">Your pictures</div><div class="pgrid">${own}</div>` : ""}${groups}<input type="file" id="picfile" accept="image/png,image/webp" hidden></div>`;
  },

  /** The picture's address: the library is a static file, an own picture is signed (async, then redrawn). */
  _picUrl(src) {
    if (!src) return null;
    if (src.startsWith("lib:")) return `${STATIC}/pictures/${src.slice(4)}.webp`;
    this._picSigned = this._picSigned || new Map();
    if (this._picSigned.has(src)) return this._picSigned.get(src);
    this._picSigned.set(src, null);
    signUrl(this._hass, src)
      .then((u) => {
        this._picSigned.set(src, u);
        this._renderOverlay();
      })
      .catch(() => {});
    return null;
  },

  /** Set the picture of the selected device: size from the touch area or a default, outline traced. */
  async _setPic(id, src) {
    const pos = this._bodyRec(id);
    if (!pos) return;
    let traced = { ar: 1, outline: null };
    try {
      const url = src.startsWith("lib:") ? this._picUrl(src) : await signUrl(this._hass, src);
      traced = await tracePic(url);
    } catch (_e) {
      /* keep a box outline */
    }
    this._change(() => {
      const old = pos.pic || {};
      pos.pic = { w: old.w || (pos.touch ? pos.touch.w : 6), r: old.r || 0, inset: old.inset ?? 4, ...(old.tint ? { tint: old.tint } : {}), ...(old.looks ? { looks: old.looks } : {}), src, ar: traced.ar, ...(traced.outline ? { outline: traced.outline } : {}) };
      delete pos.touch; // the picture is the tap area
    });
  },

  async _uploadPic(id, file) {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type)) return this._toast("Use a transparent PNG or WebP picture", false);
    try {
      const url = `/api/${WS}/upload?pic=1`;
      const init = { method: "POST", body: file, headers: { "Content-Type": file.type } };
      const resp = this._hass.fetchWithAuth ? await this._hass.fetchWithAuth(url, init) : await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this._hass.auth.data.access_token}` } });
      if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
      const r = await resp.json();
      this._ownPics = null; // listed again
      this.s.picGrid = false;
      await this._setPic(id, r.url);
    } catch (err) {
      this._saveError(err);
    }
  },

  /** 0.12.1: a touch area: the device is already drawn in the plan picture (a TV, an AC); on the card's Live it
   *  can be tapped there, also when it is off. */
  /** 0.13.9.8: mounting height (m), optional. A bond has one height (kept on every member); a split device's box has its
   *  own. Used by AI assistants and to stack devices on one spot (highest on top) when they all have one. */
  _heightHtml(d, pos) {
    if (!pos || String(d.id).startsWith("ph:")) return "";
    const presets = [["0", "Floor"], ["0.8", "Desk"], ["1.5", "Wall"], ["2.2", "High on the wall"], ["2.6", "Ceiling"]];
    const row = (which, v, label) => {
      const known = v != null && presets.some(([pv]) => Number(pv) === v);
      return `<label class="fl">${label}<span style="display:flex;gap:6px;align-items:center"><select data-hfor="${which}" style="flex:1"><option value="" ${v == null ? "selected" : ""}>Not set</option>${presets.map(([pv, pl]) => `<option value="${pv}" ${known && Number(pv) === v ? "selected" : ""}>${pl} (${pv} m)</option>`).join("")}${v != null && !known ? `<option value="${v}" selected>Other (${v} m)</option>` : ""}</select><input type="number" data-hfor="${which}" min="0" max="10" step="0.1" value="${v == null ? "" : v}" style="width:70px" aria-label="${esc(label)} in metres"> m</span></label>`;
    };
    const bond = this._bondOf(d.id);
    const hint = `<span style="font-size:12px;color:var(--df-sec)">How high it is mounted. AI assistants use it; devices on one spot that all have a height stack highest on top.</span>`;
    return `<div class="fl" style="display:flex;flex-direction:column;gap:4px">${row("pos", pos.h, bond ? "Height of the bond" : "Height")}${pos.box ? row("box", pos.box.h, "Height of its box") : ""}${hint}</div>`;
  },

  _touchSectionHtml(d, pos) {
    if (!pos) return "";
    const on = !!pos.touch;
    return `<div class="fl" style="display:flex;flex-direction:column;gap:4px"><span><b>Touch area</b></span><span style="font-size:12px;color:var(--df-sec)">${on ? "Drag the orange corner so the box covers the device drawn in your plan. On the card's Live, tapping it does the device's tap (also when it is off); holding opens its details." : "For a device already drawn in your plan picture (a TV, an AC): tap it where it is drawn, also when it is off."}</span><button class="btn" data-act="${on ? "touchoff" : "touchon"}">${on ? "Remove touch area" : "Add a touch area"}</button></div>`;
  },

  _airSectionHtml(d) {
    const eid = this.work.positions[d.id] && this._climateEnt(d.id);
    if (!eid) return "";
    if (!this._canCool(eid)) return `<div class="lsec air"><div class="lh">🔥 Heating on the plan</div><div style="font-size:12px;color:var(--df-sec)">Heat only (radiator, underfloor): the card shows a soft warm glow here while it heats.</div></div>`;
    const c = this._air(d.id);
    const W = this._realW();
    const v = (pct) => (W ? ((pct * W) / 100).toFixed(1) : pct.toFixed(1));
    const sp = c.s <= 40 ? "35" : c.s >= 80 ? "90" : "60";
    return `<div class="lsec air"><div class="lh">🌬 Air flow on the plan<small>${c.auto ? "automatic" : "set by you"}</small></div>
      <div class="lchips"><button class="${c.type === "cone" ? "on" : ""}" data-act="airtype" data-type="cone">Air flow</button><button class="${c.type === "none" ? "on" : ""}" data-act="airtype" data-type="none">None</button></div>
      ${c.type === "cone" ? `<div class="lsz"><label>Reach <input id="airr" inputmode="decimal" value="${v(c.r)}"></label>${W ? "m" : "% of the plan"}<label>Spread <select id="airs"><option value="35" ${sp === "35" ? "selected" : ""}>Narrow</option><option value="60" ${sp === "60" ? "selected" : ""}>Normal</option><option value="90" ${sp === "90" ? "selected" : ""}>Wide</option></select></label></div>` : ""}
      <div style="font-size:12px;color:var(--df-sec)">${c.type === "none" ? "No air flow on the card." : "Drag the two end handles onto the AC unit on the wall, and the third one to set how far the air reaches into the room. While cooling or heating, the card shows the air flowing (blue cool, orange heat), kept inside the room's shape."}</div></div>`;
  },

  /** 0.7.0: the door / window / shutter of this spot: a cover, or a door/window contact. */
  _openingEnt(id) {
    const d = this.byId.get(id);
    if (!d || !this._hass || (d.category || d.group) === "moving") return null; // 0.12.3: no openings for moving things
    const ok = (eid) => {
      const dom = String(eid || "").split(".")[0];
      if (dom === "cover") return true;
      const st = this._hass.states[eid];
      return dom === "binary_sensor" && st && ["door", "window", "opening", "garage_door"].includes(st.attributes.device_class);
    };
    if (d.split || d.loose) return ok(d.entity_id) ? d.entity_id : null;
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    const ents = (d.entities || []).map((x) => x.entity_id).filter((e) => !spots.has(e));
    return ents.find((e) => e.startsWith("cover.") && ok(e)) || ents.find(ok) || null;
  },

  /** Door, window or shutter: chosen, else guessed from the device class and name. */
  _openAs(id) {
    const pos = this.work.positions[id] || {};
    if (["door", "window", "shutter"].includes(pos.as)) return pos.as;
    return guessOpenAs(this._openingEnt(id), this._hass, (this.byId.get(id) || {}).name);
  },

  /** 0.7.2: the bar of this spot: its own, its twin's (another sensor on the same spot) or a linked one. */
  _openGeo(id) {
    const P = this.work.positions;
    const pos = P[id];
    if (!pos || !this._openingEnt(id)) return null;
    const own = (k) => P[k] && P[k].opening && P[k].opening.x1 != null && this._openingEnt(k);
    if (own(id)) return { geo: pos.opening, side: 0, kind: "own" };
    let base = null;
    let kind = "twin";
    if (pos.opening && pos.opening.link && own(pos.opening.link)) {
      base = pos.opening.link;
      kind = "link";
    }
    if (!base && !pos.opening) base = Object.keys(P).find((k) => k !== id && own(k) && Math.hypot(P[k].x - pos.x, P[k].y - pos.y) < 1.5) || null;
    if (!base) return null;
    const twins = Object.keys(P).filter((k) => k !== base && !own(k) && this._openingEnt(k) && ((P[k].opening && P[k].opening.link === base) || (!P[k].opening && Math.hypot(P[base].x - P[k].x, P[base].y - P[k].y) < 1.5)));
    const n = twins.indexOf(id) + 1 || 1;
    let side = kind === "link" && pos.opening.side ? pos.opening.side : n % 2 ? 1 : -1;
    if (P[base].opening.swap) side = -side;
    return { geo: P[base].opening, side: side * Math.ceil(n / 2), kind, base, merged: !!(pos.opening && pos.opening.merge) };
  },

  _openSectionHtml(d) {
    if ((d.category || d.group) === "moving") return ""; // 0.12.3: a car's doors are no openings of the house
    const pos = this.work.positions[d.id];
    const eid = pos && this._openingEnt(d.id);
    if (!eid) return "";
    const as = this._openAs(d.id);
    const g = this._openGeo(d.id);
    const nm = (k) => esc(((this.byId.get(k) || {}).name) || String(k).replace(/^entity:/, ""));
    const chips = [["door", "Door"], ["window", "Window"], ["shutter", "Shutter"]].map(([k, l]) => `<button class="${as === k ? "on" : ""}" data-act="openas" data-as="${k}">${l}</button>`).join("");
    // 0.7.4: a shutter is a white bar for the part that is closed: open = nothing, closed = full bar.
    const P0 = this.work.positions;
    const rollKey = g && g.kind === "own" ? d.id : g && g.merged ? g.base : null;
    const rollGeo = rollKey && P0[rollKey] && P0[rollKey].opening;
    const roll = rollGeo && rollGeo.roll ? rollGeo.roll : (eid.startsWith("cover.") && this._hass && this._hass.states[eid] && this._hass.states[eid].attributes.current_position != null ? "roller" : "sliding");
    const what = as === "shutter" ? `a white bar for the part that is closed (open: nothing, closed: a full bar${roll === "roller" ? ", growing from the centre to both ends" : ", growing from the bar's first end"}); the room gets darker by day as it closes` : as === "window" ? "a light blue bar while open; a window always lets daylight in" : "a light blue bar while open, nothing while closed";
    const rollChips = as === "shutter" && rollGeo ? `<div class="lchips">${[["sliding", "Sliding"], ["roller", "Roller"]].map(([k, l]) => `<button class="${roll === k ? "on" : ""}" data-act="openroll" data-roll="${k}" data-key="${esc(rollKey)}">${l}</button>`).join("")}</div>` : "";
    let acts;
    let hint;
    if (g && g.kind === "own") {
      const twins = Object.keys(this.work.positions).filter((k) => k !== d.id && (this._openGeo(k) || {}).base === d.id);
      acts = `<button data-act="opendel">Remove the bar</button>${twins.length ? `<button data-act="openswap">Switch side of ${twins.length === 1 ? nm(twins[0]) : "the twins"}</button>` : ""}`;
      hint = `Drag the two ends along the wall (they snap straight and to other bars' ends, Alt for any angle).${twins.length ? ` ${twins.map(nm).join(", ")} ${twins.length === 1 ? "sits" : "sit"} beside it and follow${twins.length === 1 ? "s" : ""}.` : " Put a second sensor of the same opening on this spot and it gets a twin bar beside this one."} On the card: ${what}.`;
    } else if (g) {
      // 0.7.3: a shutter and a contact of the same opening can share one bar.
      const be = this._openingEnt(g.base) || "";
      const canMerge = eid.startsWith("cover.") !== be.startsWith("cover.");
      const mergeBtn = canMerge ? `<button class="${g.merged ? "on" : ""}" data-act="openmerge">${g.merged ? "✓ Combined into one bar" : "Combine into one bar"}</button>` : "";
      if (g.merged) {
        acts = `${mergeBtn}<button data-act="openownbar">Draw its own bar</button>`;
        hint = `One bar together with ${nm(g.base)}, driven by the shutter (daylight too). If the shutter says closed but the contact says open, the bar pulses orange-red.`;
      } else {
        acts = `<button data-act="openswap">Switch side</button>${mergeBtn}<button data-act="openownbar">Draw its own bar</button>`;
        hint = `${g.kind === "link" ? "Next to" : "Same spot as"} ${nm(g.base)}: same length, a few pixels beside its bar, and moves with it. On the card: ${what}.${canMerge ? " A shutter and a contact of the same opening? <b>Combine into one bar</b>." : ""}`;
      }
    } else {
      const P = this.work.positions;
      const near = Object.keys(P).filter((k) => k !== d.id && P[k].opening && P[k].opening.x1 != null && this._openingEnt(k)).map((k) => [k, Math.hypot((P[k].opening.x1 + P[k].opening.x2) / 2 - pos.x, (P[k].opening.y1 + P[k].opening.y2) / 2 - pos.y)]).sort((x, y) => x[1] - y[1]).slice(0, 4);
      acts = `<button class="on" data-act="opendraw">Draw it on the plan</button>${near.length ? `<select data-act="openlink" aria-label="Next to another bar"><option value="">Next to…</option>${near.map(([k]) => `<option value="${esc(k)}">${nm(k)}</option>`).join("")}</select>` : ""}`;
      hint = `Mark where the ${as} is: the card then shows ${what}, instead of a marker. Already a bar for this opening (the shutter, say)? Put this sensor on the same spot, or pick it under <b>Next to…</b>.`;
    }
    return `<div class="lsec opn"><div class="lh">🪟 Opening on the plan<small>${["door", "window", "shutter"].includes(pos.as) ? "set by you" : "automatic"}</small></div>
      <div class="lchips">${chips}</div>${rollChips}
      <div class="lchips">${acts}</div>
      <div style="font-size:12px;color:var(--df-sec)">${hint}</div></div>`;
  },

  /** Has this device (or its bond) a light? Light shapes live on the bond's leader (#84). */
  /** 0.7.4: a TV (media player of class tv), or anything set to a Screen glow by hand. */
  _isTv(id) {
    const pos = this.work && this.work.positions[id];
    if (pos && pos.light && pos.light.type === "screen") return true;
    const d = this.byId.get(id);
    if (!d || !this._hass) return false;
    const ents = d.split || d.loose ? [d.entity_id] : (d.entities || []).map((x) => x.entity_id);
    return ents.some((e) => String(e || "").startsWith("media_player.") && ((this._hass.states[e] || {}).attributes || {}).device_class === "tv");
  },

  /** 0.7.4: a washer, dryer or dishwasher (chosen, drawn, or recognised by its name and readings). */
  _applType(id) {
    const lead = this._bondLeader(id);
    const pos = this.work && this.work.positions[lead];
    if (pos && ["washer", "dryer", "dishwasher"].includes(pos.as)) return pos.as;
    if (pos && pos.as === "none_appl") return null;
    const b = this._bondOf(id);
    const ids = b ? b[1] : [id];
    const txt = [];
    let readings = false;
    for (const m of ids) {
      const d = this.byId.get(m);
      if (!d) continue;
      txt.push(d.name || "");
      const ents = d.split || d.loose ? [d.entity_id] : (d.entities || []).map((x) => x.entity_id);
      for (const e of ents) {
        txt.push(e || "");
        const st = this._hass && this._hass.states[e];
        const dc = st && st.attributes ? st.attributes.device_class : null;
        if (dc === "power" || dc === "running" || /run_state|operation_state|remain/.test(e || "")) readings = true;
      }
    }
    const t = txt.join(" ").toLowerCase();
    const g = /dish|πιάτ|geschirr|lave-vaisselle|lavastoviglie|lavavajillas/.test(t) ? "dishwasher" : /dryer|tumble|στεγν|trockner|sèche|asciuga|secadora/.test(t) ? "dryer" : /wash|πλυντ|waschmaschine|lave-linge|lavatrice|lavadora/.test(t) ? "washer" : null;
    if (g && readings) return g;
    if (pos && pos.light && ["drum", "line"].includes(pos.light.type)) return "washer";
    return null;
  },

  _isLight(id) {
    if (this._isTv(id)) return true;
    if (this._applType(id) || ((this.work.positions[this._bondLeader(id)] || {}).as === "none_appl")) return true;
    const b = this._bondOf(id);
    const ids = b ? b[1] : [id];
    return ids.some((m) => {
      const d = this.byId.get(m);
      if (!d) return false;
      if (d.split) return d.entity_id.startsWith("light.") || d.as === "light";
      if (d.loose) return String(d.entity_id || "").startsWith("light.");
      if ((d.category || d.group) === "lights") return true; // 0.13.2: a plug in Lights (Christmas lights)
      const e = this.mainEntity[d.id] || d.main_entity;
      const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
      return (e && e.startsWith("light.") && !spots.has(e)) || this._ownLights(d).length > 0;
    });
  },

  /** A real lamp gets a bulb automatically; anything else starts with no shape (#84). */
  _isLamp(id) {
    const b = this._bondOf(id);
    const ids = b ? b[1] : [id];
    return ids.some((m) => {
      const d = this.byId.get(m);
      if (!d) return false;
      if (d.split) return d.entity_id.startsWith("light.") || d.as === "light";
      if (d.loose) return String(d.entity_id || "").startsWith("light.");
      return d.group === "lights" && this._ownLights(d).length > 0;
    });
  },

  _shape(id, exact = false) {
    const lead = exact ? id : this._lightLead(id);
    const pos = this.work.positions[lead];
    if (!pos) return null;
    const lamp = this._isLamp(id);
    const tv = this._isTv(id);
    const appl = !tv && this._applType(id);
    const s = pos.light && pos.light.type ? { ...this._defaultShape(pos.light.type, lamp), ...pos.light } : this._defaultShape(tv ? "screen" : appl ? (appl === "dishwasher" ? "line" : "drum") : lamp ? "bulb" : "none");
    if (s.type === "strip" && (s.x2 == null || s.y2 == null)) Object.assign(s, { x2: clamp(pos.x + 8, 0, 100), y2: pos.y });
    if (s.type === "line") {
      if (s.x1 == null) Object.assign(s, { x1: clamp(pos.x - 3, 0, 100), y1: pos.y });
      if (s.x2 == null) Object.assign(s, { x2: clamp(pos.x + 3, 0, 100), y2: pos.y });
    }
    if (s.type === "screen") {
      // 0.7.4: the screen is its own line: both ends free; new screens are centred on the marker.
      if (s.x1 == null) Object.assign(s, s.x2 != null ? { x1: pos.x, y1: pos.y } : { x1: clamp(pos.x - 3, 0, 100), y1: pos.y });
      if (s.x2 == null) Object.assign(s, { x2: clamp(pos.x + 3, 0, 100), y2: pos.y });
      const d = this.byId.get(lead);
      const anc = d && d.area_id && this.work.anchors[d.area_id];
      s.tx = anc ? anc.x : 50;
      s.ty = anc ? anc.y : 50;
    }
    if (s.type === "panel" && s.h == null) s.h = s.w * this._ratio();
    // 0.12.6: a light shape can have its own centre (cx / cy), else the marker's place.
    return { ...s, x: Number.isFinite(s.cx) ? s.cx : pos.x, y: Number.isFinite(s.cy) ? s.cy : pos.y, auto: !pos.light, lead };
  },

  /** 0.8.2: where "Snap to wall" puts a marker: on the nearest edge of the Room it is in (else the nearest Room),
   *  moved just inside so the marker stays in that Room. Null when there are no Room shapes. */
  /** Devices sharing this marker's exact spot (a stack), the marker first. */
  _stackOf(id) {
    const p = this.work.positions[id];
    if (!p) return [id];
    return [id, ...Object.entries(this.work.positions).filter(([k, q]) => k !== id && q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01).map(([k]) => k)];
  },

  _wallSpot(id) {
    const pos = id && this.work && this.work.positions[id];
    const shapes = Object.values((this.work && this.work.shapes) || {}).filter((sh) => Array.isArray(sh) && sh.length >= 3);
    if (!pos || pos.x == null || !shapes.length) return null;
    const r = this._ratio(); // work in a square space: x in %, y scaled by the plan's height
    const P = [pos.x, pos.y / r];
    let best = null;
    const inside = shapes.filter((sh) => ptInPoly(pos.x, pos.y, sh));
    for (const sh of inside.length ? inside : shapes) {
      for (let i = 0; i < sh.length; i++) {
        const A = [sh[i][0], sh[i][1] / r];
        const B = [sh[(i + 1) % sh.length][0], sh[(i + 1) % sh.length][1] / r];
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2));
        const Q = [A[0] + t * dx, A[1] + t * dy];
        const d = Math.hypot(P[0] - Q[0], P[1] - Q[1]);
        if (!best || d < best.d) best = { d, Q, sh, n: [-dy, dx] };
      }
    }
    if (!best) return null;
    // Inward normal: towards the Room's inside, about half a marker (1 % of the plan width).
    let [nx, ny] = best.n;
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const inset = 0.2; // the centre sits on the edge (a hair inside), so it stays on the wall at every zoom
    if (!ptInPoly(best.Q[0] + nx * inset, (best.Q[1] + ny * inset) * r, best.sh)) {
      nx = -nx;
      ny = -ny;
    }
    const x = +(best.Q[0] + nx * inset).toFixed(3);
    const y = +((best.Q[1] + ny * inset) * r).toFixed(3);
    if (Math.abs(x - pos.x) < 0.05 && Math.abs(y - pos.y) < 0.05) return null; // already on the wall
    return { x, y };
  },

  /** 0.8.2: ZHA groups (devices since HA 2026.11) and their member devices, from ZHA itself (once per visit). */
  _zhaGroupsOf(d) {
    if (!d || !d.zha_group) return null;
    if (this._zg === undefined) {
      this._zg = null;
      this._hass.callWS({ type: "zha/groups" }).then((gs) => {
        this._zg = (gs || []).map((g) => ({ name: String(g.name || ""), members: (g.members || []).map((m) => (m.device || {}).device_reg_id).filter(Boolean) }));
        this._render();
      }).catch(() => (this._zg = []));
    }
    const g = (this._zg || []).find((x) => x.name.trim().toLowerCase() === String(d.name || "").trim().toLowerCase());
    return g ? g.members.filter((id) => this.byId.has(id) && id !== d.id) : null;
  },

  _zhaGroupNote(d) {
    const mem = this._zhaGroupsOf(d);
    if (!mem) return "";
    const b = this._bondOf(d.id);
    const all = mem.every((id) => b && b[1].includes(id));
    return `<div class="note">ZHA group of <b>${mem.length}</b> device${mem.length === 1 ? "" : "s"}: ${esc(mem.map((id) => this.byId.get(id).name).join(", "))}.
      ${all ? "They are bonded as one marker." : `<button class="btn outline" style="margin-top:6px" data-act="zhabond">Bond them as one marker</button>`}</div>`;
  },

  /** 0.8.2: the floor whose frame is the house frame (from the integration), when there are 2+ floors. */
  _houseRef(plan) {
    const id = plan && plan.frame_eff && plan.frame_eff.ref;
    return id ? this.plans.find((p) => p.id === id) || null : null;
  },

  /** 0.12.1: a plan on the same level as an earlier plan (a garden, the other half of a big floor): it sits
   *  beside that plan, with its own frame. Returns the first plan of the level, or null. */
  _besidePlan(plan) {
    if (!plan || plan.kind !== "floor" || plan.level == null) return null;
    const first = this.plans.find((p) => p.kind === "floor" && p.level === plan.level);
    return first && first.id !== plan.id ? first : null;
  },

  /** The other plans of this plan's level (same level number), for the room list. */
  _levelMates(plan) {
    if (!plan || plan.kind !== "floor" || plan.level == null) return [];
    return this.plans.filter((p) => p.id !== plan.id && p.kind === "floor" && p.level === plan.level);
  },

  /** A later floor: part of a house whose frame comes from another floor. */
  _laterFloor(plan) {
    if (this._besidePlan(plan)) return null; // 0.12.1: a plan beside another keeps its own frame
    const ref = this._houseRef(plan);
    if (ref) return ref.id !== plan.id ? ref : null;
    // Not saved yet: any other floor with a picture makes this one a later floor.
    if (!plan || plan.kind !== "floor") return null;
    return this.plans.find((p) => p.kind === "floor" && p.id !== plan.id && p.width) || null;
  },

  _measuredPlan(p) {
    if (!p || !p.width || !p.height) return false;
    return (p.refs || []).length > 0;
  },
});
