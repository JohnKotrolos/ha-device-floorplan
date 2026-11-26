Object.assign(DeviceFloorplanPanel.prototype, {

  _headerHtml(bare) {
    const menu = this._narrow ? `<button class="menu-btn" data-act="menu" aria-label="Menu"><ha-icon icon="mdi:menu"></ha-icon></button>` : `<span style="width:8px"></span>`;
    const more = `<button class="iconbtn" data-act="appmenu" aria-label="Device Floorplan options" title="Device Floorplan options">${SVG.dots}</button>`;
    const title = `<h1><img class="logo" src="${STATIC}/logo.png" alt="" onerror="this.remove()">Device Floorplan <small class="ver" title="Device Floorplan version">v${VERSION}</small></h1>`;
    if (bare) return `<header>${menu}${title}<div class="hdr-right">${more}</div></header>`;
    const tabs = this.plans
      .map((p) => {
        const on = p.id === this.s.planId;
        const lvl = p.kind === "floor" && p.level != null ? `<small>level ${p.level}</small>` : p.kind === "view" ? `<small>view</small>` : "";
        const dot = this._planHasNew(p) ? `<span class="tabdot" title="New devices to place"></span>` : "";
        return `<span class="tabwrap ${on ? "on" : ""}"><button class="tab ${on ? "on" : ""}" data-act="plan" data-id="${esc(p.id)}">${esc(p.name)}${lvl}</button>
          <button class="tabmenu" data-act="tabmenu" data-id="${esc(p.id)}" aria-label="Floor options – ${esc(p.name)}" title="Floor options – ${esc(p.name)}">${SVG.dots}</button>${dot}</span>`;
      })
      .join("");
    const placed = this.work ? Object.keys(this.work.positions).length : 0;
    const firstReady = placed && !this._readySeen;
    if (placed) this._readySeen = true;
    const ready = placed ? `<button class="ready ${firstReady ? "anim" : ""}" data-act="ready" title="See what you get and add it to a dashboard">${SVG.check}I'm ready<small>· ${placed} placed</small></button>` : "";
    return `<header>${menu}${title}
      <nav class="tabs" aria-label="Plans">${tabs}<button class="tab new" data-act="newplan">+ New plan</button></nav>
      <div class="hdr-right">
        ${this._saveHtml()}${ready}
        <button class="iconbtn" data-act="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" ${this._undo.length ? "" : "disabled"}>${SVG.undo}</button>
        <button class="iconbtn" data-act="redo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" ${this._redo.length ? "" : "disabled"}>${SVG.redo}</button>${more}
      </div></header>`;
  },

  _planHasNew(p) {
    if (!p.floor_id || !this.setupDone) return false;
    return this.devices.some((d) => d.floor_id === p.floor_id && this._isNew(d) && !this.skipped.has(d.id) && !(p.positions && p.positions[d.id]));
  },

  _menuHtml() {
    const m = this.s.menu;
    if (!m) return "";
    const style = `left:${Math.round(m.x)}px;top:${Math.round(m.y)}px`;
    if (m.type === "app") {
      return `<div class="menu" style="${style}" role="menu">
        <button data-act="showintro" role="menuitem">${SVG.info}Show intro</button>
        ${this.plans.length ? `<button data-act="guide" role="menuitem">${SVG.eye}${this.s.guide ? "Hide" : "Show"} step-by-step guide</button>` : ""}
        ${this.plans.length && this.setupDone ? `<button data-act="resetsetup" role="menuitem">${SVG.skip}Choose devices again…</button>` : ""}
        ${this.plans.length ? `<button data-act="aidlg" role="menuitem">${SVG.info}AI assistants: ${this.aiShare ? "on" : "off"}…</button>` : ""}
        ${this.plans.length ? `<hr><button data-act="newdash" role="menuitem">${SVG.newdash}Create a new dashboard…</button><button data-act="newmob" role="menuitem">${SVG.phone}Create a new mobile dashboard…</button>` : ""}
        <hr><button disabled role="menuitem" style="font-size:12px">Device Floorplan v${VERSION}</button></div>`;
    }
    const p = this.plans.find((x) => x.id === m.id);
    if (!p) return "";
    const isView = p.kind !== "floor";
    const idx = this.plans.indexOf(p);
    const canL = isView && idx > 0 && this.plans[idx - 1].kind !== "floor";
    const canR = isView && idx < this.plans.length - 1;
    const floorTip = isView ? "" : ' title="Floors are ordered by their level"';
    return `<div class="menu" style="${style}" role="menu" aria-label="Floor options">
      <button data-act="settings" role="menuitem">${SVG.gear}${isView ? "Plan" : "Floor"} settings</button>
      <button data-act="rename" role="menuitem">${SVG.edit}Rename</button>
      ${p.image_url ? `<button data-act="pturn" data-id="${esc(p.id)}" data-q="3" role="menuitem">${SVG.undo}Turn picture left (90°)</button><button data-act="pturn" data-id="${esc(p.id)}" data-q="1" role="menuitem">${SVG.redo}Turn picture right (90°)</button>` : ""}
      ${p.image_url ? (this._laterFloor(p) ? `<button data-act="alignplan" role="menuitem">${SVG.glue}Align with ${esc(this._laterFloor(p).name)}…</button>` : `<button data-act="frameplan" role="menuitem">${SVG.glue}${p.kind === "floor" ? "Frame the house…" : "Frame the plan…"}</button>`) : ""}
      ${p.image_url && this._rbVacuums().length ? `<button data-act="robotdlg" role="menuitem">${SVG.robot}Robot vacuum…</button>` : ""}
      <button data-act="replaceimg" role="menuitem">${SVG.image}Replace image</button>
      <button data-act="export" role="menuitem">${SVG.download}Export…</button>
      <button data-act="moveplan" data-dir="-1" role="menuitem" ${canL ? "" : "disabled"}${floorTip}>← Move left</button>
      <button data-act="moveplan" data-dir="1" role="menuitem" ${canR ? "" : "disabled"}${floorTip}>Move right →</button>
      <hr><button class="danger" data-act="askdelete" role="menuitem">${SVG.trash}Delete ${isView ? "plan" : "floor"}…</button></div>`;
  },

  _saveHtml() {
    const s = this.s;
    // 0.13.1: "Saving…" and "✓ All changes saved" take the same room (the longer text, invisible, holds it), so the
    // header never wraps differently while saving and the plan below doesn't jump. An error may be longer: it should stand out.
    const keep = '<span class="svk" aria-hidden="true">✓ All changes saved</span>';
    if (s.save === "busy") return `<span class="save busy" id="save" role="status"><span>Saving…</span>${keep}</span>`;
    if (s.save === "err") return `<button class="save err" id="save" data-act="saveretry" title="${esc(s.saveErr)} · click to try again">Not saved: ${esc(s.saveErr || "error")} · Retry</button>`;
    return `<span class="save" id="save" role="status"><span>✓ All changes saved</span>${keep}</span>`;
  },

  _toolbarHtml() {
    const plan = this._plan();
    if (!plan) return "";
    const [d1, d2, d3] = this._stepsDone();
    const angled = plan.image_type === "angled";
    const gluePend = this._gluePending();
    const step = (id, n, label, done, off) =>
      `<button class="step ${this.s.tool === id ? "on" : ""}" data-act="tool" data-tool="${id}" ${off ? `disabled title="${off === "glue" ? "Glue the Rooms first (step 2)" : "Not available for angled images"}"` : ""}><span class="num ${done && !(id === "rooms" && gluePend) ? "done" : ""}">${done && !(id === "rooms" && gluePend) ? "✓" : n}</span>${label}</button>`;
    let calib = "";
    if (this.s.tool === "measure" && !angled) {
      const sc = this._scale();
      const stretched = sc.h && sc.v && Math.abs(sc.h - sc.v) / ((sc.h + sc.v) / 2) > 0.05;
      if (!sc.x) calib = `<span class="chip-status">○ Not calibrated</span>`;
      else if (stretched) calib = `<span class="chip-status warn" title="Measure again with longer lines, or keep it as it is">! Horizontal and vertical differ by ${Math.round((Math.abs(sc.h - sc.v) / ((sc.h + sc.v) / 2)) * 100)} %: the picture may be stretched</span><button class="btn primary" data-act="fixprop" title="Stretch the plan to its true shape, using both measurements. Everything placed stays in its place.">Fix proportions</button>`;
      else if (this.work.refs.length === 1) calib = `<span class="chip-status ok">✓ Scale set · add a ${sc.h ? "vertical" : "horizontal"} measurement for best accuracy</span>`;
      else calib = `<span class="chip-status ok">✓ Scale set · horizontal + vertical</span>`;
      if (plan.orig_size) calib += `<button class="btn" data-act="resetprop" title="Back to the picture's own shape">Reset proportions</button>`;
      const ref = this._laterFloor(plan);
      if (sc.x && ref) calib += `<button class="btn ${plan.align && "x" in plan.align ? "" : "primary"}" data-act="alignplan">${SVG.glue}Align with ${esc(ref.name)}</button>`;
    }
    // 0.8.2: gluing ends step 2: its status and actions sit next to the steps, like Measure's.
    if (this.s.tool === "rooms") {
      const gs = this._glueState();
      if (this.s.glued) calib = `<span class="gluebar"><b>${this.s.glued} edge${this.s.glued > 1 ? "s" : ""} glued</b> · check the plan<button class="btn" data-act="glueundo">Undo</button><button class="btn primary" data-act="glueok">Looks good</button></span>`;
      else if (gs.moved) calib = `<button class="btn primary" data-act="glue" title="Overlapping Rooms meet on one line; gaps stay walls">${SVG.glue}Glue Rooms · ${gs.pairs.length} overlap${gs.pairs.length > 1 ? "s" : ""}</button>`;
      else if (Object.values(this.work.shapes || {}).filter((sh) => Array.isArray(sh) && sh.length >= 3).length > 1) calib = `<span class="chip-status ok">✓ Rooms glued</span>`;
    }
    let placing = "";
    const pd = this.s.placing && this.byId.get(this.s.placing);
    if (pd || this.s.placingRoom) {
      const name = pd ? pd.name : (this.areaById.get(this.s.placingRoom) || {}).name || (EPTS[this.s.placingRoom] || [])[0];
      placing = `<span class="placing">Placing <b>${esc(name)}</b> · click on the plan
        <label><input type="checkbox" data-act="queue" ${this.s.queue ? "checked" : ""}>then next</label>
        ${pd && this.s.sel !== pd.id ? `<button data-act="placingdetails">Details</button>` : ""}<button data-act="stopplace">Stop (Esc)</button></span>`;
    }
    const guideLink = `<button class="link guidelink" data-act="guide">${this.s.guide ? "Hide guide" : "Show guide"}</button>`;
    // 0.8.2: Auto-place belongs to step 3, right next to it (only when there is something to place).
    let auto = "";
    if (this.s.tool === "place") {
      const n = this._autoTargets().length;
      if (n) auto = `<button class="btn primary autobtn" data-act="autoplace" title="Put the devices shown in the list next to their room pins (approximate)">${SVG.spark}Auto-place ${n}${this._filtering() ? " shown" : ""}</button>`;
    }
    return `<div class="toolbar"><div class="steps" role="group" aria-label="Steps">
      ${step("measure", 1, "Measure", d1, angled)}${step("rooms", 2, "Mark rooms", d2)}${step("place", 3, "Place devices", d3, gluePend ? "glue" : false)}</div>
      ${auto}${calib}${placing}${guideLink}</div>`;
  },

  _guideHtml() {
    const plan = this._plan();
    if (!this.s.guide || !plan) return "";
    if (!plan.image_url) {
      return this._guideBox("1", false, "Add your floorplan image", "Upload a picture of this floor: a plan seen from above works best, but an angled 3D view works too. PNG, JPG or WebP.", "", "");
    }
    const [d1, d2, d3] = this._stepsDone();
    const t = this.s.tool;
    if (t === "measure") {
      const acts = d1 ? `<button class="btn ok" data-act="tool" data-tool="rooms">Next: mark rooms →</button>` : `<button class="btn" data-act="skip1">Skip this step</button>`;
      return this._guideBox(d1 ? "✓" : "1", d1, "Step 1 of 3 · Measure (optional)", "Tell the plan how big your home really is. Click the start and the end of something you know, like a wall or a door, then type its real length.", "Best accuracy: one horizontal and one vertical measurement; the second one starts with an estimate from the first. Drag the ends of a line to adjust it, click its label to change the length or delete it. Drawing a new one in the same direction replaces the old one. Esc or ✕ cancels a line you're drawing. You can skip this step; placing devices works without it.", acts);
    }
    if (t === "rooms") {
      const rooms = this._roomsForPlan();
      const pinned = rooms.filter((r) => r.pos || r.ignored).length;
      const anyAreas = this._roomsForPlan(true).length > 0;
      const tip = !rooms.length
        ? anyAreas
          ? "Your rooms are listed, but no device is assigned to them yet: open a device in HA and choose its area, then come back. Or skip this step and place devices by hand."
          : "None of your devices has an area yet. Assign each device to an area in its device page, then come back: rooms appear here. Or skip this step and place devices by hand."
        : d2
          ? `All ${rooms.length} rooms are on the plan. You can still drag a pin to adjust it.`
          : `${pinned} of ${rooms.length} rooms on the plan. "Done" appears when all of them are placed.`;
      const areaLinks = !rooms.length ? `<a class="btn" href="/config/areas/dashboard" target="_self">${anyAreas ? "Open areas" : "Create areas"}</a><a class="btn" href="https://www.home-assistant.io/docs/organizing/areas/" target="_blank" rel="noopener">How areas work${SVG.ext}</a>` : "";
      const gp = this._gluePending();
      const acts = areaLinks + (d2 || !rooms.length ? `<button class="btn ok" data-act="tool" data-tool="place" ${gp ? 'disabled title="Glue the Rooms first"' : ""}>Done, place devices →</button>` : "");
      const tip2 = gp ? `${tip} ${this._glueState().pairs.length} overlap${this._glueState().pairs.length > 1 ? "s" : ""} to glue before placing devices.` : tip;
      return this._guideBox(d2 && !gp ? "✓" : "2", d2 && !gp, "Step 2 of 3 · Mark rooms", "Your rooms from HA are listed on the right. Drag each one onto the plan and drop it in the middle of that room, or click a room and then click on the plan. Auto-place uses them to put each device in the right room. Rooms that are not on this plan: hide them with the eye button, their devices leave the list. Shape draws a Room's outline, roughly is enough: where two Rooms are open to each other (open plan, a corridor, a doorway) let them overlap a little, where there is a wall leave a small gap. Glue then makes overlapping Rooms meet on one line, so they are properly connected; gaps stay walls.", tip2, acts);
    }
    let left = 0;
    let approx = 0;
    let inScope = 0;
    for (const d of this.devices) {
      if (!this._inScope(d) || !this._counted(d)) continue;
      const st = this._status(d);
      if (st !== "skipped") inScope++;
      if (st === "unplaced") left++;
      else if (st === "approx") approx++;
    }
    if (!inScope) {
      const fl = this.floors.find((f) => f.floor_id === plan.floor_id);
      return this._guideBox("3", false, "No devices on this floor yet", `Devices show up here when their HA area is on ${fl ? fl.name : "this floor"}. To place devices from other floors here, tick “Devices from all floors” in the list.`, "", "");
    }
    if (d3) return this._guideBox("✓", true, "All devices are on the plan", "Everything is saved automatically. Press “I'm ready” at the top to put the plan on a dashboard. You can come back any time; new devices you add to HA show up here marked New.", "", "");
    return this._guideBox("3", false, "Step 3 of 3 · Place devices", "Use Type, Connection or Status in the list to choose what to work on. Press Auto-place for a quick start, or click a device and then click on the plan. Focus on the right spot for each device: icons and what each marker shows can be adjusted later in the dashboard card.", `Dashed rings are approximate: drag them to the exact spot or ✓ confirm them. ${left} to place · ${approx} approximate. Skip anything you don't want on the plan. Can't find something? Type its name or entity id in the search.`, "");
  },

  _guideBox(step, done, title, text, tip, acts) {
    return `<div class="guide"><span class="badge ${done ? "done" : ""}">${step}</span>
      <div class="txt"><div class="t1">${esc(title)}</div><div class="t2">${esc(text)}</div>${tip ? `<div class="t3">${esc(tip)}</div>` : ""}</div>
      ${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;
  },

  // ---------------------------------------------------------------- plan
  _planHtml() {
    const plan = this._plan();
    if (!plan) return "";
    const names = this.s.names === "always" ? "names-always" : this.s.names === "off" ? "names-off" : "";
    const cross = this.s.placing || this.s.placingRoom || this.s.placingBox || this.s.tool === "measure";
    const grab = this.s.z > 1 || (this.s.g || 1) > 1 ? "zoomed" : "";
    if (!plan.image_url) {
      // No image yet: offer the same choices as when creating a plan (no viewport,
      // so nothing can swallow the clicks; this was the 0.3 "Upload does nothing" bug).
      return `<section class="plancard" style="overflow:auto"><div style="max-width:640px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:12px;padding:8px 0">
        <h2 style="margin:0;font-size:18px;font-weight:500">Add the floorplan image for “${esc(plan.name)}”</h2>
        ${this._imageChooserHtml("canvas")}</div></section>`;
    }
    const src = this._imgSrc(plan);
    const fadeRefs = this._layer("refs") === "faded" ? "fade-refs" : "";
    return `<section class="plancard" aria-label="Floorplan">
      <div class="canvas" id="canvas">
        <div class="vscroll" id="vscroll"><div class="viewport ${cross ? "cross" : ""} ${grab} ${names}" data-vp>
          <div class="stage" id="stage">${src ? `<img src="${esc(src)}" alt="" draggable="false" id="planimg">` : ""}
            <svg class="ov ${fadeRefs}" viewBox="0 0 1000 1000" preserveAspectRatio="none" id="ovsvg">${this._svgOverlay()}</svg></div>
          <div class="layer" id="layer">${this._overlayHtml()}</div>
        </div></div>
        ${this._canvasCtlHtml()}${this._shapeBoxHtml()}
      </div>
      ${this.s.imgFailed === plan.image_url && plan.image_fallback_url ? `<div class="warnbox" style="margin:0">The original image (${esc(plan.image_url)}) was not found, so the saved copy is shown. <button class="link" data-act="replaceimg">Choose the image again</button></div>` : ""}
      ${this._footHtml()}
    </section>`;
  },

  /** "full" | "faded" | "off" for a layer in the current step. */
  _layer(name) {
    const own = { measure: "refs", rooms: "rooms", place: "devices" }[this.s.tool] || "devices";
    if (name === own) return "full";
    if (name === "refs" && this._imageType() === "angled") return "off";
    return this.s.layers[name] === false ? "off" : "faded";
  },

  _canvasCtlHtml() {
    const s = this.s;
    const plan = this._plan();
    const sc = this._scale();
    let scale = "";
    if (sc.x && plan.image_type !== "angled" && this._layer("refs") !== "off") {
      const pxPerM = 1 / sc.x;
      const vpW = this._vpW || 800;
      const metres = [0.5, 1, 2, 5, 10, 20].find((m) => ((m * pxPerM) / plan.width) * vpW * s.z > 60) || 20;
      const px = ((metres * pxPerM) / plan.width) * vpW * s.z;
      scale = `<div class="ovctl scalectl" id="scalectl"><div class="scalebar" id="scalebar" style="width:${Math.round(px)}px" data-m="${metres}"><span>${metres} m</span><span></span></div></div>`;
    }
    const own = { measure: "refs", rooms: "rooms", place: "devices" }[s.tool] || "devices";
    const row = (key, label) => {
      const locked = key === own;
      const angledOff = key === "refs" && plan.image_type === "angled";
      const on = locked || (s.layers[key] !== false && !angledOff);
      return `<button class="lrow ${on ? "" : "off"}" data-act="layer" data-key="${key}" ${locked || angledOff ? "disabled" : ""} aria-pressed="${on}"><span class="eye">${SVG.eye}</span><span class="l">${label}</span>${locked ? "<small>current step</small>" : angledOff ? "<small>angled image</small>" : ""}</button>`;
    };
    const phBtn = s.tool === "place" ? `<button class="ovbtn ${String(s.sel || "").startsWith("ph:") ? "on" : ""}" data-act="phnew" aria-label="New phantom" title="New phantom: one combined value from several devices"><ha-icon icon="dfp:phantom-plus"></ha-icon></button>` : "";
    const layers = `<div class="ovctl layerctl">${this._extraCtlHtml ? this._extraCtlHtml() : ""}${phBtn}<div class="lwrap"><button class="ovbtn ${s.layersOpen ? "open" : ""}" data-act="layers" aria-label="Layers" title="Layers" aria-expanded="${s.layersOpen}">${SVG.layers}</button>
      ${s.layersOpen ? `<div class="layerpop" role="dialog" aria-label="Layers"><h4>Show on the plan</h4>${row("refs", "Measurements")}${row("rooms", "Rooms")}${row("devices", "Devices")}${row("bonds", "Bonds")}${row("phantoms", "Phantoms")}${this._extraLayerRows ? this._extraLayerRows(row) : ""}${s.tool === "place" ? row("others", "Devices outside the filter") : ""}</div>` : ""}</div></div>`;
    const zoom = `<div class="ovctl zoomctl"><div class="zoom"><button data-act="zoomout" aria-label="Zoom out">−</button><span id="zl">${Math.round((s.g || 1) * s.z * 100)}%</span><button data-act="zoomin" aria-label="Zoom in">+</button><button class="fit" data-act="zoomfit">Fit</button></div></div>`;
    return scale + layers + zoom;
  },
});
