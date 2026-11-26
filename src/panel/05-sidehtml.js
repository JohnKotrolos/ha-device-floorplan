Object.assign(DeviceFloorplanPanel.prototype, {

  // ---------------------------------------------------------------- side
  /** 0.8.2: the right column: the selected device in its own card on top, the step's card below. */
  _sideHtml() {
    let inner;
    let det = "";
    if (this.s.tool === "rooms") inner = this._roomsSideHtml();
    else if (this.s.tool === "measure" && this._imageType() !== "angled") inner = this._measureSideHtml();
    else {
      inner = this._devicesSideHtml();
      det = this._detailsHtml();
    }
    return `<div class="sidecol">${det ? `<section class="selcard" aria-label="Selected device">${det}</section>` : ""}${inner}</div>`;
  },

  _measureSideHtml() {
    const sc = this._scale();
    const refs = this.work ? this.work.refs : [];
    const row = (dir, label, glyph) => {
      const i = refs.findIndex((r) => r.dir === dir);
      if (i < 0) return `<div class="mrow unset"><span class="k">${glyph}</span><span>${label}</span><span class="v" style="font-weight:400">not set · draw one on the plan</span></div>`;
      return `<div class="mrow" data-refrow="${i}"><span class="k">${glyph}</span><span>${label}</span><span class="v">${refs[i].length.toFixed(2)} m</span>
        <button class="small" data-act="refedit" data-i="${i}" title="Change length" aria-label="Change ${label.toLowerCase()} length">${SVG.edit}</button>
        <button class="small" data-act="refdel" data-i="${i}" title="Delete" aria-label="Delete ${label.toLowerCase()} measurement">${SVG.trash}</button></div>`;
    };
    let warn = "";
    if (sc.h && sc.v) {
      const diff = Math.abs(sc.h - sc.v) / ((sc.h + sc.v) / 2);
      if (diff > 0.05) warn = `<div class="warnbox">Horizontal and vertical disagree by ${Math.round(diff * 100)}%. Check one of them; if the image really is stretched, separate horizontal and vertical scales are used.</div>`;
    }
    const plan = this._plan();
    const size = sc.x && plan.width ? `<p style="padding:10px 14px 0;margin:0;font-size:13px;color:var(--df-sec)">The whole image is about <b style="color:var(--primary-text-color)">${(plan.width * sc.x).toFixed(1)} × ${(plan.height * sc.y).toFixed(1)} m</b>.</p>` : "";
    return `<aside class="side" aria-label="Measurements"><div class="sidehead"><h2>Measurements <span class="pill ${refs.length === 2 ? "ok" : refs.length ? "" : "grey"}">${refs.length}/2</span></h2>
      <p>Click the start and end of something you know on the plan, then type its real length. Drag the ends of a line to adjust it.</p></div>
      <div class="list" style="margin-top:8px">${row("h", "Horizontal", SVG.dash)}${row("v", "Vertical", '<svg viewBox="0 0 24 24"><path d="M12 5v14"/></svg>')}${warn}${size}</div></aside>`;
  },

  _roomsSideHtml() {
    const allRooms = this._roomsForPlan(true);
    const rooms = allRooms.filter((r) => r.count);
    const empty = allRooms.filter((r) => !r.count);
    const left = rooms.filter((r) => !r.pos && !r.ignored && !r.mate).length;
    const roomRow = (r) => {
        const on = !!r.pos;
        if (r.ignored && !on) {
          return `<div class="row done hiddenrow"><span class="main" style="cursor:default"><span class="ico">${SVG.pin}</span><span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">hidden · its ${r.count} devices are out of the list</span></span><span class="pill grey">hidden</span></span>
            <button class="small" data-act="unignore" data-id="${esc(r.area_id)}" title="Show on this plan" aria-label="Show ${esc(r.name)} on this plan">${SVG.skip}</button></div>`;
        }
        const active = this.s.placingRoom === r.area_id;
        return `<div class="row ${on ? "done" : "todo"} ${active ? "sel" : ""}" draggable="true" data-room="${esc(r.area_id)}">
          <button class="main" data-act="pickroom" data-id="${esc(r.area_id)}"><span class="ico" style="color:${on ? "var(--df-primary)" : "var(--df-sec)"}">${SVG.pin}</span>
          <span class="rtxt"><span class="rname">${esc(r.name)}</span><span class="rmeta">${r.away ? `On ${esc(r.away)} in Home Assistant · ` : ""}${r.count ? `${r.count} device${r.count > 1 ? "s" : ""}` : "no devices yet"}</span></span>
          <span class="pill ${on ? "ok" : r.mate && !active ? "grey" : ""}">${on ? "✓ on plan" : active ? "click on plan" : r.mate ? `on ${esc(r.mate)}` : "drag to plan"}</span></button>
          ${on ? `<button class="shbtn ${(this.work.shapes || {})[r.area_id] ? "done" : ""} ${this.s.shapeEdit === r.area_id ? "act" : ""}" data-act="shapeedit" data-id="${esc(r.area_id)}" title="Draw the room's shape – its lights stay inside">${(this.work.shapes || {})[r.area_id] ? "Shape ✓" : "Shape"}</button>` : ""}
          ${on ? `<button class="small" data-act="unpin" data-id="${esc(r.area_id)}" title="Take the pin off the plan" aria-label="Take the pin off the plan">${SVG.close}</button>` : ""}
          <button class="small eyeon" data-act="ignore" data-id="${esc(r.area_id)}" title="Hide: not on this plan" aria-label="Hide ${esc(r.name)}: not on this plan">${SVG.eye}</button></div>`;
      };
    const rows = rooms
      .slice()
      .sort((a, b) => (a.pos || a.ignored || a.mate ? 1 : 0) - (b.pos || b.ignored || b.mate ? 1 : 0) || a.name.localeCompare(b.name))
      .map(roomRow)
      .join("") + (empty.length ? `<div class="lgh" style="padding:10px 12px 4px;font-size:12px;font-weight:500;color:var(--df-sec)">Empty rooms · no devices yet</div>` + empty.slice().sort((a, b) => a.name.localeCompare(b.name)).map(roomRow).join("") : "");
    const scope = this._plan().floor_id && this._plan().kind === "floor" ? "on this floor" : "with devices";
    // 0.8.2: the glue card only informs; its actions sit in the top bar.
    const gs = this._glueState();
    const nShapes = Object.values(this.work.shapes || {}).filter((sh) => Array.isArray(sh) && sh.length >= 3).length;
    const pairTxt = (x) => `${esc(this._areaName(x.a))} / ${esc(this._areaName(x.b))}`;
    const howTxt = (x) => (x.how === "meet" ? `${pairTxt(x)}: meet in the middle` : `${esc(this._areaName(x.how === "a" ? x.a : x.b))} moves onto ${esc(this._areaName(x.how === "a" ? x.b : x.a))}'s edge`);
    let glue = "";
    if (this.s.glued && this.s.glueLog) glue = `<div class="gluebox"><b>Glued</b>${this.s.glueLog.map((x) => `<span>· ${howTxt(x)}</span>`).join("")}<span>Gaps (walls) stayed as they were. Check the plan, then Looks good or Undo (top).</span></div>`;
    else if (gs.moved) glue = `<div class="gluebox"><b>Glue Rooms</b><span>Overlapping Rooms meet on one line, so they are properly connected; gaps stay walls. An edge the overlap covers completely moves onto the other Room's edge, otherwise both meet in the middle. The orange strips on the plan show where; click one below to go there.</span>${gs.pairs.map((x) => `<button class="link gluepair" data-act="gluefocus" data-k="${esc(`${x.a}|${x.b}`)}">· ${howTxt(x)}</button>`).join("")}</div>`;
    else if (nShapes > 1) glue = `<div class="gluebox ok">✓ All overlapping Rooms are glued.</div>`;
    return `<aside class="side" aria-label="Rooms" data-droptext="Drop to take the pin off the plan">${glue}<div class="sidehead"><h2>Rooms ${scope} <span class="pill ${left ? "" : "ok"}">${left ? `${left} left` : "all placed"}</span></h2>
      <p>Drag each room onto the plan and drop it in the middle of that room. Or click a room, then click on the plan. Rooms that are not on this plan: hide them with the eye button.${this._levelMates(this._plan()).length ? ` Rooms already on ${esc(this._levelMates(this._plan()).map((p) => p.name).join(", "))} are marked; drag one here too if it is on both.` : ""}</p>${scope === "with devices" && (this.floors || []).length && this._plan().kind === "floor" ? `<p class="lvlhint">Showing all rooms. Link this plan to a Home Assistant floor (⋮ → Floor) to see only its rooms.</p>` : ""}</div>
      <div class="list" style="margin-top:8px">${rows || `<p style="padding:14px;margin:0;font-size:13px;color:var(--df-sec)">No rooms yet${this._scopeFloor() ? " on this floor" : ""}. Rooms come from HA areas. <a href="/config/areas/dashboard" target="_self">Create areas</a> · <a href="https://www.home-assistant.io/docs/organizing/areas/" target="_blank" rel="noopener">How areas work ↗</a></p>`}</div></aside>`;
  },

  _devicesSideHtml() {
    const s = this.s;
    const searching = !!s.q.trim();
    const scoped = this.devices.filter((d) => this._inScope(d) && this._counted(d));
    // While searching, everything is a candidate (all floors, skipped, hidden rooms, helpers).
    const all = searching ? this.devices : scoped;
    const statuses = new Map(all.map((d) => [d.id, this._status(d)]));
    const left = scoped.filter((d) => statuses.get(d.id) === "unplaced").length;
    const active = scoped.filter((d) => statuses.get(d.id) !== "skipped").length;
    const shown = all.filter((d) => this._matches(d, statuses.get(d.id)));
    this._shownOrder = [];
    const newCount = scoped.filter((d) => this._isNew(d) && statuses.get(d.id) !== "skipped").length;

    const counts = (key, val) => scoped.filter((d) => statuses.get(d.id) !== "skipped" || s.status.includes("skipped")).filter((d) => (key === "conn" ? d.conns.includes(val) : this._inType(d, val))).length;
    const real = (key) => s[key].filter((x) => x !== "__none__");
    const fbtn = (key, label) => {
      const on = s[key].length > 0;
      const n = real(key).length;
      const btn = `<button class="fbtn ${on ? "act" : ""} ${s.pop === key ? "open" : ""}" data-act="pop" data-key="${key}" aria-expanded="${s.pop === key}">${label}${on ? `<span class="cnt">${n}</span>` : ""}${SVG.down}</button>`;
      return `<span class="fwrap">${btn}${on ? `<button class="fx" data-act="fclear" data-key="${key}" title="Clear the ${label} filter" aria-label="Clear the ${label} filter">✕</button>` : ""}</span>`;
    };
    let pop = "";
    if (s.pop) {
      let chips = "";
      // Progress, not totals (#44): "7 left", or a green ✓ when everything of that kind is placed.
      const prog = (key, val) => {
        const items = scoped.filter((d) => statuses.get(d.id) !== "skipped" && statuses.get(d.id) !== "hiddenroom" && (key === "conn" ? d.conns.includes(val) : this._inType(d, val)));
        const left = items.filter((d) => statuses.get(d.id) === "unplaced").length;
        return { left, total: items.length, on: items.filter((d) => ["placed", "approx"].includes(statuses.get(d.id))).length };
      };
      if (s.pop === "conn") chips = CONN_ORDER.filter((c) => counts("conn", c)).map((c) => this._chip("conn", c, CONN[c].label, counts("conn", c), CONN[c].color, prog("conn", c))).join("");
      if (s.pop === "type") chips = Object.keys(GROUPS).filter((g) => counts("type", g)).map((g) => this._chip("type", g, GROUPS[g][0], counts("type", g), null, prog("type", g))).join("");
      if (s.pop === "status") chips = STATUSES.map(([k, l]) => [k, l, scoped.filter((d) => (k === "new" ? this._isNew(d) && statuses.get(d.id) !== "skipped" : statuses.get(d.id) === k)).length]).filter((x) => x[2] || s.status.includes(x[0])).map(([k, l, n]) => this._chip("status", k, l, n)).join("");
      const allOn = !s[s.pop].length;
      const noneOn = s[s.pop].length === 1 && s[s.pop][0] === "__none__";
      pop = `<div class="pop"><div class="popall">Select: <button class="link" data-act="popall" ${allOn ? 'style="font-weight:700;text-decoration:none"' : ""}>All</button>·<button class="link" data-act="popnone" ${noneOn ? 'style="font-weight:700;text-decoration:none"' : ""}>None</button></div><div class="chips">${chips}</div><button class="btn primary" style="align-self:flex-end" data-act="closepop">Done</button></div>`;
    }
    const plan = this._plan();
    const unplacedShown = shown.filter((d) => (!d.loose || d.physical) && statuses.get(d.id) === "unplaced");
    const opts = [];
    if (this._filtering() && unplacedShown.length && !(s.status.length === 1 && s.status[0] === "skipped")) {
      opts.push(`<button class="btn" data-act="skipall">${SVG.skip}Skip the ${unplacedShown.length} not on the plan</button>`);
    }
    const optsRow2 = [];
    optsRow2.push(`<label>Group by <select data-act="groupby"><option value="room" ${s.groupBy === "room" ? "selected" : ""}>Room</option><option value="type" ${s.groupBy === "type" ? "selected" : ""}>Type</option><option value="conn" ${s.groupBy === "conn" ? "selected" : ""}>Connection</option></select></label>`);
    if (plan.kind === "floor" && plan.floor_id) optsRow2.push(`<label><input type="checkbox" data-act="allfloors" ${s.allFloors ? "checked" : ""}> Devices from all floors</label>`);

    const hiddenDevs = s.withHidden || searching ? [] : scoped.filter((d) => statuses.get(d.id) === "hiddenroom" && this._matches(d, "unplaced"));
    const newBar = newCount && !s.status.includes("new") ? `<div class="newbar"><span class="pill">${newCount} new</span><span style="flex:1">device${newCount > 1 ? "s" : ""} since your last visit</span><button class="link" data-act="shownew">Show</button></div>` : "";
    const filterBits = [];
    if (s.q.trim()) filterBits.push(`“${s.q.trim()}”`);
    const lbl = (key, map) => {
      const r = real(key);
      if (!s[key].length) return;
      if (!r.length) return filterBits.push(`no ${key === "conn" ? "connection" : key}`);
      filterBits.push(r.length === 1 ? map(r[0]) : `${r.length} ${key === "type" ? "types" : key === "conn" ? "connections" : "statuses"}`);
    };
    lbl("type", (v) => (GROUPS[v] || GROUPS.other)[0]);
    lbl("conn", (v) => (CONN[v] || CONN.other).label);
    lbl("status", (v) => (STATUSES.find((x) => x[0] === v) || [v, v])[1]);
    const summary = `${filterBits.length ? filterBits.join(" · ") : "All devices"} · ${shown.length} shown`;
    const controls = s.toolsOpen
      ? `<div class="controls"><input class="search" id="q" type="search" placeholder="Search name, room, model or entity…" value="${esc(s.q)}" aria-label="Search devices and entities">
        <div class="frow">${fbtn("type", "Type")}${fbtn("conn", "Connection")}${fbtn("status", "Status")}${s.conn.length || s.type.length || s.status.length ? `<button class="link" data-act="clearf">Clear filters</button>` : ""}</div>
        ${pop}
        ${searching ? `<div style="font-size:12px;color:var(--df-sec)">Searching everything: all floors, skipped devices, hidden rooms and entities without a device.</div>` : `${opts.length ? `<div class="frow">${opts.join("")}</div>` : ""}
        <div class="opts">${optsRow2.join("")}</div>`}</div>`
      : `<button class="toolsum" data-act="tools" title="Show search and filters">${SVG.down}<span>${esc(summary)}</span></button>`;

    return `<aside class="side" aria-label="Devices to place" data-droptext="Drop to remove from plan">
      <div class="sidehead"><h2>Devices to place <span class="pill ${left ? "" : active ? "ok" : "grey"}">${left ? `${left} left` : active ? "all placed" : "none here"}</span>
        <button class="tgl ${s.toolsOpen ? "up" : ""}" data-act="tools" title="${s.toolsOpen ? "Hide search and filters" : "Show search and filters"}" aria-label="${s.toolsOpen ? "Hide search and filters" : "Show search and filters"}" aria-expanded="${s.toolsOpen}">${SVG.down}</button></h2>
      ${s.toolsOpen ? `<p><b>Search</b> for a device you know, or <b>narrow the list</b> with <b>Type</b>, <b>Connection</b> and <b>Status</b>. Then click a device and click its spot on the plan, or drag it there. Placed devices are greyed out.</p>` : ""}</div>
      ${newBar}
      ${controls}
      <div class="list">${this._energyPtsHtml(false)}${this._listHtml(shown, statuses)}${this._hiddenGroupHtml(hiddenDevs, statuses)}${this._energyPtsHtml(true)}</div></aside>`;
  },

  /** 0.11: "Energy points" at the top of Devices to place: the electrical panel (always) and the solar / battery
   *  box (when Home Assistant's Energy has one). Click, then click on the plan; drop one back here to remove it. */
  /** The real thing behind an Energy point: the device of the grid meter / solar / battery sensor, or the
   *  sensor itself when it has no device (helpers); null when HA's Energy names none. */
  _eReal(role) {
    return this._eReals(role)[0] || null;
  },

  /** All real devices behind a point (several grid meters in one board: all of them), in Energy's order. */
  _eReals(role) {
    const out = [];
    for (const stat of (this._eStats || {})[role] || []) {
      const en = this._hass && this._hass.entities && this._hass.entities[stat];
      const d = (en && en.device_id && this.byId.get(en.device_id)) || this.byId.get(`entity:${stat}`);
      if (d && !out.includes(d)) out.push(d);
    }
    return out;
  },

  /** 0.11: Energy points. To place: at the top of the list. Placed: at the bottom, with ✓ on plan, like any
   *  placed device. A real device looks like itself (its icon and name, as on the plan); a point you set uses the
   *  point's icon, dashed. The house grid comes from Home Assistant's Energy (Grid), never from a bond: a bond only
   *  seats more grid meters at the panel. */
  _energyPtsHtml(placed) {
    if (!this.work) return "";
    const tag = (k) => `<span class="ico av eptag ${k === "__energy_panel" ? "" : k === "__energy_battery" ? "bat" : "src"} dummy"><ha-icon icon="${EPT_ICON[k]}"></ha-icon></span>`;
    const ok = `<span class="pill ok">✓ on plan</span>`;
    const rows = [];
    for (const k of Object.keys(EPTS)) {
      const reals = this._eReals(k);
      const dummyOn = !!this.work.anchors[k];
      if (!(this._eHas || {})[k] && !dummyOn && !reals.length) continue; // only what HA's Energy has (the panel always)
      const role = EPTS[k][0];
      const lead = reals[0];
      if (lead && !dummyOn) {
        const st = this._status(lead);
        const on = st !== "unplaced";
        if (on === placed) rows.push(this._rowHtml(lead, st, { role, title: EPTS[k][1] }));
      } else {
        // A point you set: when there's no real one in HA, or it was set before the real one came.
        const rname = lead ? lead.name : "";
        const rep = lead && dummyOn ? `<button class="rep" data-act="ereplace" data-id="${k}" title="Put ${esc(rname)} where this point is, and remove the point">Replace with ${esc(rname)}</button>` : "";
        if (dummyOn === placed) rows.push(`<div class="row ${dummyOn ? "done" : "todo"} ${this.s.placingRoom === k ? "sel" : ""}"><button class="main" data-act="pickroom" data-id="${k}" title="${esc(EPTS[k][1])}">${tag(k)}<span class="rtxt"><span class="rname">${esc(role)}</span><span class="rmeta"><span>${dummyOn ? "a point you set · drag to move" : "click, then click its spot"}</span></span></span>${dummyOn ? ok : ""}</button>${rep}</div>`);
      }
      // More grid meters in the same board: bonded onto the panel (they stay full devices).
      const panelAt = lead && this.work.positions[lead.id] ? lead : null;
      for (const m of k === "__energy_panel" ? reals.slice(1) : []) {
        const st = this._status(m);
        const bonded = !!(panelAt && this._bondOf(m.id) && this._bondOf(m.id) === this._bondOf(panelAt.id));
        if (bonded !== placed) continue;
        const btn = bonded ? "" : panelAt ? `<button class="rep" data-act="ebond" data-id="${esc(m.id)}" title="Seat it at the panel: one marker, it stays a full device">Bond to the panel</button>` : `<span class="rep note">Bond to the panel once the panel is placed</span>`;
        rows.push(this._rowHtml(m, bonded ? "placed" : st === "placed" ? "unplaced" : st, { role: `${role} · grid meter`, title: EPTS[k][1], after: btn }));
      }
    }
    if (!rows.length) return "";
    return `<div class="epts"><div class="ghead static"><b>Energy points</b> <small>${placed ? "on the plan" : "where the Energy overlay's flow lines start"}</small></div>${rows.join("")}</div>`;
  },

  /** Devices of rooms hidden on this plan: out of the list and the counts, in one collapsed group. */
  _hiddenGroupHtml(devs, statuses) {
    if (!devs.length) return "";
    const key = "hidden:rooms";
    const open = this.s.collapsed[key] === false;
    const rooms = [...new Set(devs.map((d) => d.area_name).filter(Boolean))].join(", ");
    const rows = open ? devs.map((d) => this._rowHtml(d, statuses.get(d.id))).join("") : "";
    return `<div style="opacity:.75"><button class="ghead ${open ? "open" : ""}" data-act="group" data-key="${key}" data-open="${open ? 1 : 0}" aria-expanded="${open}">${SVG.chev}<b>Hidden rooms · ${devs.length} device${devs.length > 1 ? "s" : ""} <small style="font-weight:400;color:var(--df-sec)">${esc(rooms)}</small></b></button>${rows}</div>`;
  },

  _chip(key, val, label, n, color, prog) {
    const on = this.s[key].includes(val);
    let count = `<small>${n}</small>`;
    let done = "";
    let title = "";
    if (prog && prog.total) {
      title = `${prog.on} of ${prog.total} on the plan · ${prog.left} left`;
      if (prog.left) count = `<small>· ${prog.left} left</small>`;
      else {
        count = `<small class="okc">✓</small>`;
        done = "done";
      }
    }
    return `<button class="chip ${on ? "on" : ""} ${done}" data-act="chip" data-key="${key}" data-val="${esc(val)}" aria-pressed="${on}" ${title ? `title="${esc(title)}"` : ""}>${color ? `<span class="dot" style="background:${color}"></span>` : ""}${esc(label)} ${count}</button>`;
  },

  _listHtml(shown, statuses) {
    const s = this.s;
    if (!shown.length) return `<p style="padding:20px 14px;margin:0;font-size:14px;color:var(--df-sec)">${s.q.trim() ? `Nothing found for “${esc(s.q.trim())}”. Try part of the name or the entity id (e.g. <i>dryer</i> or <i>binary_sensor.</i>).` : "No devices match."} ${this._filtering() ? '<button class="link" data-act="clearall">Clear search and filters</button>' : ""}</p>`;
    const groups = new Map();
    const keyOf = (d) => (d.loose && !d.physical ? "__loose" : s.groupBy === "conn" ? d.conns[0] || "other" : s.groupBy === "type" ? d.category || d.group : d.area_id || "__none");
    const nameOf = (k) => (k === "__loose" ? "Entities without a device" : s.groupBy === "conn" ? (CONN[k] || CONN.other).label : s.groupBy === "type" ? (GROUPS[k] || GROUPS.other)[0] : k === "__none" ? "No area" : (this.areaById.get(k) || {}).name || k);
    for (const d of shown) {
      const k = keyOf(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    const rank = { unplaced: 0, approx: 1, elsewhere: 2, placed: 3, skipped: 4 };
    const arr = [...groups.entries()].map(([k, items]) => {
      items.sort((a, b) => rank[statuses.get(a.id)] - rank[statuses.get(b.id)] || a.name.localeCompare(b.name));
      const todo = items.filter((d) => statuses.get(d.id) === "unplaced").length;
      return { k, name: nameOf(k), items, todo };
    });
    arr.sort((a, b) => (a.k === "__loose") - (b.k === "__loose") || (a.k === "__none") - (b.k === "__none") || b.todo - a.todo || a.name.localeCompare(b.name));
    return arr
      .map((g) => {
        const key = `${s.groupBy}:${g.k}`;
        // 0.8.2: groups start collapsed; open while searching, when there is only one group, or when opened by you.
        const open = s.q.trim() || arr.length === 1 ? true : s.collapsed[key] === false;
        const pill = g.todo ? `<span class="pill">${g.todo} to place</span>` : `<span class="pill ok">all placed</span>`;
        const note = g.k === "__none" && s.groupBy === "room" ? ` <small style="font-weight:400;color:var(--df-sec)">· not auto-placed</small>` : g.k === "__loose" ? ` <small style="font-weight:400;color:var(--df-sec)">· helpers, templates</small>` : "";
        let rows = "";
        if (open) {
          rows = g.items.map((d) => this._rowHtml(d, statuses.get(d.id))).join("");
          g.items.forEach((d) => this._shownOrder.push(d.id));
        }
        return `<div><button class="ghead ${open ? "open" : ""}" data-act="group" data-key="${esc(key)}" data-open="${open ? 1 : 0}" aria-expanded="${open}">${SVG.chev}<b>${esc(g.name)}${note}</b>${pill}</button>${rows}</div>`;
      })
      .join("");
  },

  _rowHtml(d, st, ep) {
    const s = this.s;
    let bat = "";
    if (d.battery_entity && this._hass && this._hass.states[d.battery_entity]) {
      const v = Number(this._hass.states[d.battery_entity].state);
      if (!Number.isNaN(v)) bat = `<span class="badge ${v <= 15 ? "bat-low" : "bat"}">${Math.round(v)}%</span>`;
    }
    const pill = {
      placed: `<span class="pill ok">✓ on plan</span>`,
      approx: `<span class="pill warn">◌ approx</span>`,
      skipped: `<span class="pill grey">skipped</span>`,
      hiddenroom: `<span class="pill grey">room hidden</span>`,
      elsewhere: `<span class="pill grey">on ${esc((this._otherFloorPlan(d) || {}).name || "another floor")}</span>`,
    }[st] || "";
    const isNew = this._isNew(d) && st !== "skipped" ? `<span class="badge newtag">New</span>` : "";
    const done = st === "placed" || st === "approx" || st === "elsewhere" || st === "skipped" || st === "hiddenroom";
    const area = (s.groupBy !== "room" || s.q.trim()) && d.area_name ? `<span>${esc(d.area_name)}</span>` : "";
    const hitName = this._matchedEntity(d);
    // #91: an entity of a device matched: say it's part of the device (and where it acts).
    const hitEnt = hitName && (d.entities || []).find((x) => x.name === hitName || x.entity_id === hitName);
    const hitSpot = hitEnt && this.work && this.work.positions[`entity:${hitEnt.entity_id}`];
    const hit = hitName ? `<span class="hit">${esc(hitName)} · ${hitSpot ? "placed where it acts" : hitEnt && this._switchables(d).includes(hitEnt) && this.work && this.work.positions[d.id] ? "part of this device · can sit where it acts" : "part of this device"}</span>` : "";
    const ent = d.loose ? `<span>${esc(d.entity_id)}</span>` : "";
    const rb = this.work && this.work.positions[d.id] && this._bondOf(d.id);
    const parts = d.parts && d.parts.length ? `<span style="color:var(--df-ok)">🔗 Bonded ×${d.parts.length + 1}</span>` : rb ? `<span style="color:var(--df-ok)" title="${esc(this._bondName(rb))}">🔗 Bonded</span>` : "";
    const meta = (ep ? `<span>${esc(ep.role)}</span>` : "") + isNew + bat + area + parts + ent + hit;
    return `<div class="row ${done ? "done" : "todo"} ${s.sel === d.id || s.placing === d.id ? "sel" : ""}" draggable="${st === "skipped" ? "false" : "true"}" data-dev="${esc(d.id)}">
      <button class="main" data-act="pick" data-id="${esc(d.id)}"${ep ? ` title="${esc(ep.title)}"` : ""}>${ep ? `<span class="ico av">${this._iconHtml(d)}</span>` : this._avatarHtml(d)}
        <span class="rtxt"><span class="rname">${esc(this._pl(d))}</span>${meta ? `<span class="rmeta">${meta}</span>` : ""}</span>${pill}</button>
      ${st === "placed" || st === "approx" ? `<button class="small" data-act="locate" data-id="${esc(d.id)}" title="Show on plan" aria-label="Show on plan">${SVG.locate}</button>` : ""}
      <button class="small" data-act="info" data-id="${esc(d.id)}" title="More info" aria-label="More info">${SVG.info}</button>${(ep && ep.after) || ""}</div>`;
  },

  _detailsHtml() {
    const s = this.s;
    if (String(s.sel || "").startsWith("ph:")) return this._phantomCardHtml(s.sel.slice(3));
    const sb = s.sel && this.work && this.work.positions[s.sel] && this._bondOf(s.sel);
    if (sb && s.memberView !== s.sel) return this._bondCardHtml(sb);
    if (s.sel && !this.byId.has(s.sel) && this.work && this.work.positions[s.sel]) {
      const cand = this.devices.filter((x) => this._inScope(x) && ["unplaced", "hiddenroom"].includes(this._status(x)));
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px;font-weight:700">?</span>
        <div style="flex:1;min-width:0"><div class="nm">Device removed from Home Assistant</div><div class="sub">This spot belonged to a device that no longer exists, for example after re-pairing it.</div></div>
        <button class="small" data-act="desel" aria-label="Close">${SVG.close}</button></div>
        <label style="font-size:12px;color:var(--df-sec);display:flex;flex-direction:column;gap:4px">Replace with (keeps this spot)<select data-act="replacedev"><option value="">Choose a device…</option>${cand.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.area_name ? ` · ${esc(x.area_name)}` : ""}</option>`).join("")}</select></label>
        <div class="acts"><button class="btn danger" data-act="remove">Remove from plan</button></div></div>`;
    }
    const d = s.sel && this.byId.get(s.sel);
    if (!d) return "";
    const st = this._status(d);
    const onPlan = st === "placed" || st === "approx";
    const close = `<button class="small" data-act="desel" aria-label="Close">${SVG.close}</button>`;
    if (d.split) {
      const dev = this.byId.get(d.of);
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc(d.entity_id)} · part of ${esc(dev ? dev.name : "a device")}</div></div>${close}</div>
        <div class="note">Split device: ${esc(dev ? dev.name : "the device")} sits where its hardware is, this ${esc(d.entity_id.split(".")[0])} shows here, where it acts. ${this._tip("split")}</div>
        ${d.entity_id.startsWith("light.") ? "" : `<label class="fl">Acts as<select data-act="splitas"><option value="">${esc(d.entity_id.split(".")[0])} (as in Home Assistant)</option>${[["light", "Light"], ["switch", "Switch"], ["fan", "Fan"], ["other", "Other"]].map(([k, l]) => `<option value="${k}" ${d.as === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`}
        ${this._lightSectionHtml(d)}${this._spotSections(d, onPlan)}
        <div class="acts"><button class="btn" data-act="selid" data-id="${esc(d.of)}">Go to ${esc(dev ? dev.name : "device")}</button><button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button><button class="btn danger" data-act="splitdel" data-id="${esc(d.id)}">✕ Back to the device</button></div></div>`;
    }
    if (d.loose) {
      const acts = [];
      if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
      if (st === "unplaced") acts.push(`<button class="btn primary" data-act="placeit">Add to plan</button>`);
      acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
      if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
      return `<div class="details"><div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(d.name)}</div><div class="sub">${esc(d.entity_id)} · entity without a device</div></div>${close}</div>
        <div class="note">Entity without a device (as Home Assistant calls it): placed directly on the plan; the card shows it at this spot.${st === "unplaced" ? " Click on the plan to put it there, or drag it from the list." : ""}</div>
        <div class="acts">${acts.join("")}</div>${onPlan ? this._lightSectionHtml(d) : ""}${this._spotSections(d, onPlan)}</div>`;
    }
    const badges = d.conns.map((c) => `<span class="badge" style="color:${(CONN[c] || CONN.other).color};background:color-mix(in srgb, ${(CONN[c] || CONN.other).color} 14%, transparent)">${(CONN[c] || CONN.other).label}</span>`).join(" ");
    const stLabel = { placed: "✓ Confirmed position", approx: "◌ Approximate position", unplaced: "Not on the plan yet", hiddenroom: "Its room is hidden on this plan", skipped: "Skipped · nothing changes in HA", elsewhere: `On ${(this._otherFloorPlan(d) || {}).name || "another floor"}` }[st];
    const acts = [];
    const more = !!s.more;
    if (st === "approx") acts.push(`<button class="btn primary" data-act="confirm">Confirm position</button>`);
    if (st === "unplaced" || st === "hiddenroom") acts.push(`<button class="btn primary" data-act="placeit">Place on plan</button>`);
    if (st === "elsewhere") acts.push(`<button class="btn primary" data-act="movehere">Move to this floor</button>`);
    if (st === "skipped") acts.push(`<button class="btn outline" data-act="unskip">Add to plan</button>`);
    acts.push(`<button class="btn" data-act="info" data-id="${esc(d.id)}">${SVG.info}More info</button>`);
    acts.push(`<button class="btn" data-act="devpage">Device page${SVG.ext}</button>`);
    if (onPlan && this._wallSpot(s.sel)) {
      const n = this._stackOf(s.sel).length;
      acts.push(`<button class="btn" data-act="snapwall" title="${n > 1 ? `Move all ${n} devices at this spot onto the nearest edge of their Room` : "Move it onto the nearest edge of its Room"}">${SVG.magnet}Snap to wall</button>`);
    }
    if (onPlan) acts.push(`<button class="btn danger" data-act="remove">Remove from plan</button>`);
    const skipBtn = st !== "skipped" ? `<button class="link" style="align-self:flex-start;padding:0" data-act="skipone">Skip this device</button>` : "";
    let stack = "";
    if (onPlan) {
      const cl = this._clusters().find((c) => c.m.some((m) => m.d.id === d.id));
      if (cl && cl.m.length > 1) {
        const others = cl.m.filter((m) => m.d.id !== d.id).map((m) => m.d.name).join(", ");
        const same = cl.m.filter((m) => m.d.id !== d.id && this._canBond(d.id, m.d.id));
        stack = `<div class="note">Same spot as ${esc(others)} · not bonded. <button class="link" data-act="front">Bring to front</button><button class="link" data-act="back">Send to back</button>${same.length ? `<button class="link" data-act="bondask" data-id="${esc(same[0].d.id)}">Bond with ${esc(same[0].d.name)}…</button>` : ""}</div>`;
      }
    }
    const bnd = this._bondOf(d.id);
    const back = bnd && onPlan ? `<button class="link back" data-act="bondback">‹ Back to bond “${esc(this._bondName(bnd))}”</button>` : "";
    const bondNote = "";
    const phIn = Object.values((this.work && this.work.phantoms) || {}).filter((ph) => (ph.members || []).includes(d.id));
    const phNote = phIn.length && onPlan ? `<div class="note">Part of phantom ${phIn.map((ph) => `<b>${esc(ph.name || "Phantom")}</b>`).join(", ")} ${this._tip("phantom")}</div>` : "";
    const bondHint = !bnd && onPlan && st !== "skipped" ? `<div style="font-size:12px;color:var(--df-sec)">Tip: drag another device onto this one if they are one thing (like bulbs in one lamp) ${this._tip("bond")}</div>` : "";
    const merged = d.merged.length ? `<div style="font-size:12px;color:var(--df-sec)" title="${esc(d.merged.join(", "))}">Includes its twin device${d.merged.length > 1 ? "s" : ""}</div>` : "";
    // Parts (#28): printer + AMS, NAS + drives… one row, one marker.
    // Automatic bonds (were "parts", #28/#60): printer + AMS, NAS + drives… one device, one marker.
    let parts = "";
    if (d.parts && d.parts.length) {
      parts = `<div class="note parts"><div class="bh"><span class="bcount">×${d.parts.length + 1}</span><b>Bonded automatically</b>${this._tip("autobond")}</div>
        <div style="color:var(--df-sec)">One device on the plan and the card; their entities count for it.</div>
        ${d.parts.map((p) => `<div class="prow"><span class="pn"><b title="${esc(p.name)}">${esc(p.name)}</b>${p.model ? `<small>${esc(p.model)}</small>` : ""}</span><button class="btn" data-act="partown" data-id="${esc(p.id)}">Unbond</button></div>`).join("")}</div>`;
    } else if (d.part_override === "own") {
      parts = `<div class="note">Unbonded: shown as its own device (it stays that way). <button class="link" data-act="partauto" data-id="${esc(d.id)}">Bond automatically again</button></div>`;
    }
    // Hubs and bridges (#65): what connects through what.
    let conn = "";
    if (!d.loose) {
      const kids = this.devices.filter((x) => !x.loose && x.via === d.id);
      const hub = d.via && this.byId.get(d.via);
      const bits = [];
      if (hub) bits.push(`Connected through <button class="link" style="padding:0" data-act="selid" data-id="${esc(hub.id)}">${esc(hub.name)}</button>`);
      if (kids.length) bits.push(`${kids.length} device${kids.length > 1 ? "s connect" : " connects"} through it: ${kids.slice(0, 6).map((k) => esc(k.name)).join(", ")}${kids.length > 6 ? ` +${kids.length - 6}` : ""}`);
      if (bits.length) conn = `<div style="font-size:12px;color:var(--df-sec)">${bits.join(" · ")}</div>`;
    }
    // Split device (#91): the device sits at its hardware; switchable entities can sit where they act.
    let box = "";
    if (onPlan) {
      const sw = this._switchables(d);
      const spots = this._splitSpots(d.id);
      if (sw.length) {
        const open = spots.length || s.splitOpen === d.id;
        if (!open) {
          box = `<span style="display:flex;align-items:center;gap:6px"><button class="link" style="align-self:flex-start;padding:0" data-act="splitopen">📍 Split: it controls something elsewhere</button>${this._tip("split")}</span>${sw.length > 1 ? `<div style="font-size:12px;color:var(--df-sec)">It has ${sw.length} switches: each can sit where it acts.</div>` : ""}`;
        } else {
          const rows = sw.map((e) => {
            const key = `entity:${e.entity_id}`;
            const placed = spots.includes(key);
            const placing = s.placingBox === `${d.id}|${e.entity_id}`;
            const nm = (e.name && e.name !== e.entity_id ? e.name : null) || entName(this._hass, e.entity_id);
            const btn = placed
              ? `<span class="pill ok">✓ placed</span><button class="small" data-act="locate" data-id="${esc(key)}" title="Show on plan" aria-label="Show on plan">${SVG.locate}</button><button class="small" data-act="splitdel" data-id="${esc(key)}" title="Back to the device" aria-label="Back to the device">✕</button>`
              : placing ? `<span style="font-size:12px">Click on the plan…</span><button class="link" data-act="boxcancel">Cancel</button>`
                : `<button class="link" data-act="splitplace" data-id="${esc(e.entity_id)}">Place where it acts</button>`;
            return `<div class="srow"><span class="snm" title="${esc(e.entity_id)}">${esc(nm)}</span>${btn}</div>`;
          }).join("");
          box = `<div class="note split"><div><b>Split device</b> ${this._tip("split")}</div><div style="color:var(--df-sec)">The device stays where its hardware is (Network, Health). What it switches can sit where it acts.</div>${rows}</div>`;
        }
      }
    }
    // One click to clean up software-heavy integrations (NAS, routers, cloud).
    let skipInt = "";
    if (d.integration && st !== "skipped") {
      const same = this.devices.filter((x) => !x.loose && x.integration === d.integration && !this.skipped.has(x.id) && !(this.work && this.work.positions[x.id]));
      if (same.length > 1) skipInt = `<button class="link" style="align-self:flex-start;padding:0" data-act="skipint" data-int="${esc(d.integration)}">Skip all ${same.length} not on the plan from ${esc(this._intName(d.integration))}</button>`;
    }
    const hint = st === "unplaced" || st === "hiddenroom" ? `<div style="font-size:12px;color:var(--df-sec)">Click on the plan to put it there, drag it from the list, use Auto-place, or skip it if you don't want it on the plan.</div>` : "";
    const lightSec = onPlan && this._lightSectionHtml ? this._lightSectionHtml(d) : "";
    // 0.11.1 test9: "Acts as" for any placed device that switches something (it was only on split spots): a plug
    // Home Assistant shows as a light → Switch, and the card stops treating it as a lamp (Lights, glow).
    let actsAs = "";
    const pos0 = onPlan && this.work && this.work.positions[d.id];
    const mainE = this.mainEntity[d.id] || d.main_entity || "";
    const mainD = mainE.split(".")[0];
    // 0.12.1: one Category choice per device (the safety net for anything sorted wrongly). For a light, plug or fan
    // it also sets what it is on the card, as "Acts as" did (stored the same way, so older setups keep working).
    if (!d.loose || d.physical) {
      const switchy = pos0 && ["light", "switch", "fan"].includes(mainD) && (!pos0.as || ["light", "switch", "fan"].includes(pos0.as)) && !this._applType(d.id);
      const own = (this.deviceOpts[d.id] || {}).category;
      const fromAs = switchy && pos0.as ? AS_CAT[pos0.as] : null;
      const cur = own || fromAs || "";
      const auto = d.category_auto || d.group || "other";
      actsAs = `<label class="fl">Category<select data-act="devcat"><option value="">${esc((GROUPS[auto] || GROUPS.other)[0])} (automatic)</option>${Object.entries(GROUPS).map(([k, [l]]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><div style="font-size:12px;color:var(--df-sec)">Where it is listed${switchy ? ", and what it is on the card: Lights glow and are in Lights; Switches & plugs and Climate (a fan) show their icon while on" : ""}.</div>`;
      // 0.13.9.18: an appliance's type (its icon, words and details on the cards; the mobile card's Appliances).
      if ((cur || auto) === "appliances" || (this.deviceOpts[d.id] || {}).appliance) {
        const ap = (this.deviceOpts[d.id] || {}).appliance || "";
        const guess = this._applType(d.id);
        actsAs += `<label class="fl">Appliance type<select data-act="devappl"><option value="">${guess ? `${esc(APPL_KINDS[guess] || guess)} (recognised)` : "Not set"}</option>${Object.entries(APPL_KINDS).map(([k, l]) => `<option value="${k}" ${ap === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><div style="font-size:12px;color:var(--df-sec)">Its icon, words ("Washing", "Brewing", "Printing") and details on the cards. Bond its plug, door or status sensors with it for the details.</div>`;
      }
    }
    const moreBtn = `<button class="link morebtn ${more ? "open" : ""}" data-act="more" aria-expanded="${more}">More options ${SVG.down}</button>`;
    const moreBox = more ? `<div class="more">${skipBtn}${skipInt}</div>` : "";
    return `<div class="details">${back}<div class="top"><span class="ico" style="width:36px;height:36px">${this._iconHtml(d)}</span>
      <div style="flex:1;min-width:0">${d.parts && d.parts.length && onPlan ? `<input class="nmin" id="devlabel" value="${esc(this._pl(d))}" placeholder="${esc(d.name)}" aria-label="Name on the plan" maxlength="60">` : `<div class="nm">${esc(d.name)}</div>`}<div class="sub">${esc([d.area_name || "No area", d.manufacturer, d.model].filter(Boolean).join(" · "))}</div></div>
      ${close}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${badges}<span class="badge bat">${esc(stLabel)}</span></div>
      ${conn}${bondNote}${this._zhaGroupNote(d)}${merged}${parts}${stack}${phNote}<div class="acts">${acts.join("")}</div>${lightSec}${actsAs}${this._spotSections(d, onPlan)}${box}${moreBtn}${moreBox}${bondHint}${hint}</div>`;
  },

  // ------------------------------------------------------- light shapes (#74)
  _realW() {
    const p = this._plan();
    const sc = this._scale();
    return sc.x && p && p.width ? sc.x * p.width : null;
  },

  _defaultShape(type, lamp = true) {
    const W = this._realW();
    const m = (v, pct) => (W ? (v / W) * 100 : pct);
    if (type === "spot") return lamp ? { type, r: m(0.8, 3.5) } : { type, r: m(0.5, 2.2) };
    if (type === "strip") return { type, r: m(0.5, 2.5) };
    if (type === "screen") return { type, r: m(2.5, 10), a: 20 };
    if (type === "drum") return { type, r: m(0.25, 1.4) };
    if (type === "line") return { type, r: 0 };
    if (type === "panel") return { type, w: m(1.2, 6) };
    if (type === "wall") return { type, r: m(1.2, 5), a: 90 };
    if (type === "none") return { type };
    return { type: "bulb", r: m(1.5, 6) };
  },

  /** Type filter: its own group, and "Lights" also for anything with a light (wall switches with light channels). */
  _inType(d, t) {
    if ((d.category || d.group) === t) return true;
    return t === "lights" && !d.category && !d.split && (d.entities || []).some((x) => x.domain === "light");
  },

  /** Light entities of a device that are NOT placed elsewhere (#106). */
  _ownLights(d) {
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    return (d.entities || []).filter((x) => x.domain === "light" && !spots.has(x.entity_id));
  },

  /** #115: an AC / thermostat on the plan (its own climate entity, or a split climate spot). */
  _climateEnt(id) {
    const d = this.byId.get(id);
    if (!d) return null;
    if (d.split || d.loose) return String(d.entity_id || "").startsWith("climate.") ? d.entity_id : null;
    const spots = new Set(this._splitSpots(d.id).map((k) => k.slice(7)));
    const e = (d.entities || []).find((x) => x.domain === "climate" && !spots.has(x.entity_id));
    return e ? e.entity_id : null;
  },

  /** Can it cool (an AC)? Heat-only climates (radiators) get a warm glow on the card instead of a cone. */
  _canCool(eid) {
    const st = eid && this._hass && this._hass.states[eid];
    const modes = (st && st.attributes.hvac_modes) || [];
    return modes.includes("cool") || modes.includes("heat_cool") || modes.includes("dry") || modes.includes("fan_only");
  },

  /** The AC's air-flow cone: stored, or a default pointing into the room. */
  _air(id) {
    const pos = this.work.positions[id];
    if (!pos) return null;
    const W = this._realW();
    const R = this._ratio();
    const d = this.byId.get(id);
    let a = 90;
    const anc = d && d.area_id && this.work.anchors[d.area_id];
    if (anc && (Math.abs(anc.x - pos.x) > 0.5 || Math.abs(anc.y - pos.y) > 0.5)) a = Math.round((Math.atan2((anc.y - pos.y) / R, anc.x - pos.x) * 180) / Math.PI);
    const def = { a, r: W ? (2 / W) * 100 : 10, s: 60, L: W ? (0.8 / W) * 100 : 4 };
    if (pos.air && pos.air.type === "none") return { type: "none", ...def, x: pos.x, y: pos.y };
    return { type: "cone", ...def, ...(pos.air || {}), x: pos.x, y: pos.y, auto: !pos.air };
  },

  /** The stored part of an air flow (direction, reach, spread and, when drawn, the unit's line). */
  _airKeep(c) {
    const o = { a: c.a, r: c.r, s: c.s };
    if (c.x1 != null) Object.assign(o, { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 });
    return o;
  },

  _airSvg(c, sel) {
    if (!c || c.type === "none") return "";
    // 0.7.7: a trapezoid from the unit's line on the wall (the line itself drawn solid).
    const g = airGeom(c, this._ratio());
    const f = (q) => `${(q[0] * 10).toFixed(1)},${(q[1] * 10).toFixed(1)}`;
    return `<polygon points="${f(g.e1)} ${f(g.f1)} ${f(g.f2)} ${f(g.e2)}" fill="rgba(79,163,255,${sel ? ".16" : ".07"})" stroke="#4fa3ff" stroke-width="${sel ? 2 : 1.2}" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><line x1="${(g.e1[0] * 10).toFixed(1)}" y1="${(g.e1[1] * 10).toFixed(1)}" x2="${(g.e2[0] * 10).toFixed(1)}" y2="${(g.e2[1] * 10).toFixed(1)}" stroke="#4fa3ff" stroke-width="${sel ? 4 : 2.5}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  },
});
