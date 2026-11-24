Object.assign(DeviceFloorplanPanel.prototype, {

  _bondMeta(bid) {
    return ((this.work && this.work.bond_meta) || {})[bid] || {};
  },

  _commonPrefix(names) {
    if (names.length < 2) return "";
    let p = names[0];
    for (const n of names) while (p && !n.startsWith(p)) p = p.slice(0, -1);
    if (names.every((n) => n.length === p.length || /[\s\-_·.,]/.test(n[p.length]))) return p;
    const m = p.match(/^(.*[\s\-_·.,])/);
    return m ? m[1] : "";
  },

  _shortNames(names) {
    const p = this._commonPrefix(names);
    if (p.trim().length < 3) return names.slice();
    return names.map((n) => n.slice(p.length).replace(/^[\s\-_·.,]+/, "").trim() || n);
  },

  /** 0.8.0: an automatic bond's name on the plan (set in the Editor), else Home Assistant's device name. */
  _pl(d) {
    const pos = this.work && this.work.positions && this.work.positions[d.id];
    return (pos && pos.label) || d.name;
  },

  _bondName(b) {
    const meta = this._bondMeta(b[0]);
    if (meta.name) return meta.name;
    const names = b[1].filter((m) => this.work.positions[m]).map((m) => (this.byId.get(m) || {}).name || m);
    const p = this._commonPrefix(names).replace(/[\s\-_·.,]+$/, "").trim();
    return p.length >= 3 ? `${p} ×${names.length}` : names[0] || "Bond";
  },

  _bondMeaning(ids) {
    const doms = ids.map((m) => { const d = this.byId.get(m); const e = d && (this.mainEntity[d.id] || d.main_entity); return e ? e.split(".")[0] : ""; });
    const dcs = ids.map((m) => { const d = this.byId.get(m); const e = d && (this.mainEntity[d.id] || d.main_entity); const so = e && this._hass && this._hass.states[e]; return (so && so.attributes.device_class) || ""; });
    if (doms.every((x) => ["light", "switch", "fan", "media_player", "cover", "valve"].includes(x))) {
      // 0.13.9.1: this bond's own count, not an example that reads like one.
      const ents = ids.map((m) => { const d = this.byId.get(m); return d && (this.mainEntity[d.id] || d.main_entity); }).filter(Boolean);
      const on = ents.filter((e) => { const so = this._hass && this._hass.states[e]; return so && ["on", "open", "opening", "playing"].includes(so.state); }).length;
      return `Switched together on the card · shows how many are on (now ${on} of ${ents.length})`;
    }
    if (dcs.every((x) => ["motion", "occupancy", "presence"].includes(x))) return "Detected if any of them detects";
    if (dcs.every((x) => ["door", "window", "opening", "garage_door"].includes(x))) return "Open if any of them is open";
    if (dcs.every((x) => ["temperature", "humidity"].includes(x))) return "One value: the average (the card can show lowest, highest or one)";
    return "One marker on the card; tap does what the first device does";
  },

  _memberRow(m, actOut, label) {
    const d = this.byId.get(m);
    const v = d ? this._ringVars(d) : { c1: "var(--df-sec)" };
    const ent = d && (this.mainEntity[d.id] || d.main_entity);
    const so = ent && this._hass ? this._hass.states[ent] : null;
    const state = so ? (this._hass.formatEntityState ? this._hass.formatEntityState(so) : so.state) : "";
    return `<div class="mem"><span class="cring" style="--c1:${v.c1}">${d ? this._iconHtml(d) : "?"}</span><button class="link" data-act="memopen" data-id="${esc(m)}" title="${esc(d ? d.name : m)}">${esc(label)}</button><span class="mst">${esc(state)}</span><button class="small" data-act="${actOut}" data-id="${esc(m)}" aria-label="Take ${esc(d ? d.name : m)} out" title="Take out">${SVG.close}</button></div>`;
  },

  /** 0.7.4: a bond inside a phantom: one row, its name, the ×N badge, its combined state. */
  _bondMemberRow(b, ids) {
    const lead = this.byId.get(ids[0]);
    const meta = this._bondMeta(b[0]);
    const v = lead ? this._ringVars(lead) : { c1: "var(--df-sec)" };
    const sts = ids.map((m) => { const d = this.byId.get(m); const e = d && (this.mainEntity[d.id] || d.main_entity); return e && this._hass ? this._hass.states[e] : null; }).filter(Boolean);
    const live = sts.filter((x) => !["unavailable", "unknown"].includes(x.state));
    const on = live.filter((x) => ["on", "open", "playing", "home"].includes(x.state)).length;
    const state = !sts.length ? "" : !live.length ? "Unavailable" : on === 0 ? "Off" : on === sts.length ? "On" : `${on} of ${sts.length} on`;
    const name = this._bondName(b);
    const icon = meta.icon ? `<ha-icon icon="${esc(meta.icon)}"></ha-icon>` : lead ? this._iconHtml(lead) : SVG.link;
    return `<div class="mem"><span class="cring" style="--c1:${v.c1}">${icon}</span><button class="link" data-act="selid" data-id="${esc(ids[0])}" title="${esc(name)}">${esc(name)}</button><span class="bcount" style="margin-left:6px">×${ids.length}</span><span class="mst">${esc(state)}</span><button class="small" data-act="phoutbond" data-id="${esc(b[0])}" aria-label="Take ${esc(name)} out" title="Take out">${SVG.close}</button></div>`;
  },

  _bondCardHtml(b) {
    const ids = b[1].filter((m) => this.work.positions[m]);
    const meta = this._bondMeta(b[0]);
    const names = ids.map((m) => (this.byId.get(m) || {}).name || m);
    const short = this._shortNames(names);
    const lead = this.byId.get(ids[0]);
    return `<div class="details bondcard"><div class="top"><span class="ico" style="width:36px;height:36px">${meta.icon ? `<ha-icon icon="${esc(meta.icon)}"></ha-icon>` : lead ? this._iconHtml(lead) : SVG.link}</span>
      <div style="flex:1;min-width:0"><input class="nmin" id="bondname" data-bond="${esc(b[0])}" value="${esc(this._bondName(b))}" aria-label="Bond name" maxlength="60"><div class="sub bh"><span class="bcount">×${ids.length}</span>Bonded · one device ${this._tip("bond")}</div></div>
      <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
      <div style="font-size:12px;color:var(--df-sec)">${esc(this._bondMeaning(ids))}</div>
      <div class="mems">${ids.map((m, i) => this._memberRow(m, "bout", short[i])).join("")}</div>
      <div style="font-size:12px;color:var(--df-sec)">Add more: drag a device onto this marker.</div>
      ${this._lightSectionHtml(this.byId.get(ids[0]) || { id: ids[0] })}
      ${(() => {
        const bid = this._bodyId(ids[0]);
        const bd = this.byId.get(bid) || { id: bid };
        const bp = this.work.positions[bid];
        return `${this._heightHtml(bd, bp)}${this._picSectionHtml(bd, bp, true)}${bp && bp.pic ? "" : this._touchSectionHtml(bd, bp)}`;
      })()}
      <div class="acts"><button class="btn" data-act="unbondall">Unbond all</button>${this._wallSpot(this.s.sel) ? `<button class="btn" data-act="snapwall" title="Move it onto the nearest edge of its Room">${SVG.magnet}Snap to wall</button>` : ""}<button class="btn danger" data-act="remove">Remove from plan</button></div></div>`;
  },

  /** #103: which entities of a member count (default: all its readings). */
  _phUsesHtml(pid, ph, m) {
    const d = this.byId.get(m);
    if (!d || d.loose) return "";
    const cands = (d.entities || []).filter((e) => ["sensor", "binary_sensor", "climate"].includes(e.domain));
    if (cands.length < 2) return "";
    const uses = (ph.uses || {})[m] || [];
    const open = this.s.phUses === m;
    const label = uses.length ? `${uses.length} of ${cands.length}` : "All readings";
    const list = open ? `<div class="uses">${cands.map((e) => `<label class="chk"><input type="checkbox" data-act="phuse" data-ph="${esc(pid)}" data-m="${esc(m)}" data-e="${esc(e.entity_id)}" ${!uses.length || uses.includes(e.entity_id) ? "checked" : ""}> ${esc(e.name && e.name !== e.entity_id ? e.name : e.entity_id)} <small>${esc(e.domain)}</small></label>`).join("")}</div>` : "";
    return `<div class="usesrow"><button class="link" data-act="phusesopen" data-id="${esc(m)}">Uses: ${esc(label)} ${open ? "▴" : "▾"}</button>${list}</div>`;
  },

  _phantomCardHtml(pid) {
    const ph = (this.work.phantoms || {})[pid];
    if (!ph) return "";
    const ids = (ph.members || []).filter((m) => this.work.positions[m]);
    const names = ids.map((m) => (this.byId.get(m) || {}).name || m);
    const vsel = ph.value || "average";
    // 0.7.4: a bond is one member here too (one row with its ×N badge), as on the plan and the card.
    const rows = [];
    const seen = new Set();
    ids.forEach((m, i) => {
      const b = this._bondOf(m);
      const inPh = b ? b[1].filter((x) => ids.includes(x)) : [];
      if (b && inPh.length > 1) {
        if (seen.has(b[0])) return;
        seen.add(b[0]);
        rows.push(this._bondMemberRow(b, inPh));
      } else rows.push(this._memberRow(m, "phout", names[i]) + this._phUsesHtml(pid, ph, m));
    });
    return `<div class="details phcard"><div class="top"><span class="ico" style="width:36px;height:36px"><ha-icon icon="${esc(ph.icon || "dfp:phantom")}"></ha-icon></span>
      <div style="flex:1;min-width:0"><input class="nmin" id="phname" data-ph="${esc(pid)}" value="${esc(ph.name || "Phantom")}" aria-label="Phantom name" maxlength="60"><div class="sub bh"><span class="bcount ph">${rows.length}</span>Phantom · combined value ${this._tip("phantom")}</div></div>
      <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
      ${rows.length < 2 ? `<div class="note"><b>Drag devices that are already on the plan onto this phantom.</b> They join it and jump back to their own spot. With 2 or more it's ready: move it wherever you want it shown.</div>` : ""}
      ${ids.length ? `<div style="font-size:12px;font-weight:500">Combined devices</div><div class="mems">${rows.join("")}</div>` : ""}
      <label class="fl">Value on the card (numbers)<select data-act="phvalue"><option value="average" ${vsel === "average" ? "selected" : ""}>Average</option><option value="min" ${vsel === "min" ? "selected" : ""}>Lowest</option><option value="max" ${vsel === "max" ? "selected" : ""}>Highest</option><option value="one" ${vsel === "one" ? "selected" : ""}>One device</option></select></label>
      ${vsel === "one" ? `<label class="fl">Which device<select data-act="phone">${ids.map((m, i) => `<option value="${esc(m)}" ${ph.one === m ? "selected" : ""}>${esc(names[i])}</option>`).join("")}</select></label>` : ""}
      <div style="font-size:12px;color:var(--df-sec)">Motion: detected if any · doors and windows: open if any. The card can show it with its own popup and graph.</div>
      ${this._picSectionHtml({ id: `ph:${pid}` }, ph)}${ph.pic ? "" : this._touchSectionHtml({ id: `ph:${pid}` }, ph)}
      <div class="acts"><button class="btn danger" data-act="phdel">Delete phantom</button></div></div>`;
  },
});
