Object.assign(DeviceFloorplanPanel.prototype, {

  _toastHtml() {
    const t = this.s.toast;
    if (!t) return "";
    return `<div class="toast" id="toast" role="status"><span>${esc(t.text)}</span>${t.undo ? `<button data-act="toastundo">Undo</button>` : ""}<button data-act="toastclose" aria-label="Dismiss" style="color:#c4c8cd">✕</button></div>`;
  },

  // -------------------------------------------------------------- dialogs
  _modalHtml() {
    const dlg = this.s.dialog;
    if (!dlg) return "";
    const wrap = (inner, width = 560) => `<div class="modal" data-act="modalbg"><div class="dialog" role="dialog" aria-modal="true" style="max-width:${width}px">${inner}</div></div>`;
    if (dlg.type === "create" || dlg.type === "settings") return `<div class="modal" data-act="modalbg">${this._planFormHtml(dlg.type, false)}</div>`;
    const p = this._plan();
    if (dlg.type === "ai") {
      // 0.13.9.5: share the floorplan (rooms, connections, where devices are) with AI assistants. Off by default.
      return wrap(`<h2>Share the floorplan with AI assistants</h2>
        <p>When on, an AI conversation agent in Home Assistant (Assist with OpenAI, Anthropic, Google, Ollama…) and AI apps connected through Home Assistant's MCP Server can ask the floorplan: which rooms connect (open space, passage, door) or only share a wall, where a device stands in its room, what is near, and the way between rooms. They only see devices you expose to Assist.</p>
        <p><b>With a cloud AI, your home's layout is sent to that service.</b> With a local AI (Ollama) it stays at home.</p>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="aishare" ${this.aiShare ? "checked" : ""}> Share the floorplan with AI assistants</label>
        <p style="font-size:13px;color:var(--df-sec)">Connections come from your room shapes: glue the Rooms, overlap them only where you can walk through, and leave a gap where there is a wall. Set where north is in each floor's settings to also get compass words. Automations can always use the actions device_floorplan.get_layout, locate, nearest and between.</p>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" data-act="aisave">Save</button></div>`);
    }
    if (dlg.type === "delete") {
      const n = p ? Object.keys(p.positions || {}).length : 0;
      const what = p && p.kind === "floor" ? "floor" : "plan";
      return wrap(`<h2>Delete “${esc(p.name)}”?</h2><p>The ${what}, its image${n ? ` and the positions of <b>${n} placed device${n > 1 ? "s" : ""}</b>` : ""} are removed, together with its device and entities in Home Assistant. Your devices themselves are not touched.</p>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" style="background:var(--error-color,#b3261e)" data-act="dodelete">Delete ${what}</button></div>`);
    }
    if (dlg.type === "frame") return this._frameHtml(dlg, wrap);
    if (dlg.type === "align") return this._alignHtml(dlg, wrap);
    if (dlg.type === "robot") return this._robotHtml(dlg, wrap);
    if (dlg.type === "rename") {
      return wrap(`<h2>Rename</h2><label class="f">Name<input type="text" id="rname" value="${esc(dlg.name ?? p.name)}" maxlength="60"></label><div class="err" id="formerr"></div>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn primary" data-act="dorename">Save</button></div>`, 420);
    }
    if (dlg.type === "hideroom") {
      const a = this.areaById.get(dlg.area);
      const n = dlg.ids.length;
      return wrap(`<h2>Hide ${esc(a ? a.name : "this room")}?</h2><p>${n} device${n > 1 ? "s" : ""} from ${esc(a ? a.name : "this room")} ${n > 1 ? "are" : "is"} already on the plan. Keep ${n > 1 ? "them" : "it"} there, or take ${n > 1 ? "them" : "it"} off the plan too?</p>
        <div class="acts"><button class="btn" data-act="closedlg">Cancel</button><button class="btn" data-act="hideroom" data-keep="1">Keep ${n > 1 ? "them" : "it"}</button><button class="btn primary" data-act="hideroom" data-keep="0">Remove ${n > 1 ? "them" : "it"}</button></div>`, 480);
    }
    if (dlg.type === "bondask") {
      const A = this.byId.get(dlg.a) || { name: "This device" };
      const B = this.byId.get(dlg.b) || { name: "the other device" };
      return `<div class="modal" data-act="modalbg"><div class="dialog bondask" role="dialog" aria-modal="true" style="max-width:480px"><h2>${esc(A.name)} is now on the same spot as ${esc(B.name)}</h2>
        <p>Are they one thing (like bulbs in one lamp), or just placed close together?</p>
        <div class="acts" style="flex-wrap:wrap"><button class="btn" data-act="bondno">Keep separate – just the same spot</button><button class="btn primary" data-act="bondyes">Bond them – one device on the card</button></div>
        <p style="font-size:12px;color:var(--df-sec);margin:4px 0 0">ⓘ A bond shows as one marker and is switched together. You can unbond any time.</p></div></div>`;
    }
    if (dlg.type === "ready") return wrap(this._readyHtml(), 580);
    if (dlg.type === "added") return wrap(this._addedHtml(), 520);
    if (dlg.type === "adddash") return wrap(this._addDashHtml(), 560);
    if (dlg.type === "preview") {
      return `<div class="modal" data-act="modalbg"><div class="dialog" role="dialog" aria-modal="true" style="max-width:1000px;width:100%"><h2 class="okttl">Live view · ${esc(p.name)} <span class="live"><i></i>LIVE</span></h2>
        <p>This is your plan, live. Try it: tap a sensor or a light to open its details and controls. This is the default style; you can adjust what the card shows and how it looks in the card's settings.</p>
        <div class="cardprev" id="cardprev"></div>
        <div class="acts">${dlg.from ? `<button class="btn" data-act="dlgback" style="margin-right:auto">← Back</button>` : ""}<button class="btn" data-act="closedlg">Close</button><button class="btn primary" data-act="toadddash">${dlg.dash ? "+ Add to another dashboard" : "Add to dashboard"}</button></div></div></div>`;
    }
    if (dlg.type === "export") {
      const n = p ? Object.keys((this.work || {}).positions || {}).length : 0;
      return wrap(`<h2>Export “${esc(p.name)}”</h2><p>${n} placed device${n === 1 ? "" : "s"}. Choose a format:</p>
        <button class="opt" data-act="doexport" data-fmt="csv" style="text-align:left;background:transparent"><span><b>CSV spreadsheet</b><span>One row per device: name, area, connection, position (% of the image, and metres if measured), status. For Excel, inventory or network planning.</span></span></button>
        <button class="opt" data-act="doexport" data-fmt="json" style="text-align:left;background:transparent"><span><b>Plan backup (JSON)</b><span>The whole plan: image, measurements, rooms and positions. Restore it with “Import a plan” when creating a new plan, also on another Home Assistant.</span></span></button>
        <button class="opt" data-act="doexport" data-fmt="png" style="text-align:left;background:transparent"><span><b>Picture (PNG)</b><span>The plan with the devices drawn on it and a legend. For printing or handing over to an installer.</span></span></button>
        <button class="opt" data-act="doexport" data-fmt="md" style="text-align:left;background:transparent"><span><b>AI description (Markdown)</b><span>This floor in plain words: rooms, how they connect (open space, passage, door, wall), left and right at each opening, directions, and where each device is. Paste it into ChatGPT, Claude or another AI agent's instructions.</span></span></button>
        <p style="margin:2px 0 0;opacity:.75;font-size:13px">For Home Assistant's own voice assistants, turn on ⋮ → AI assistants instead: they ask the plan live.</p>
        <div class="box">⚠ These files show your home's layout and where your devices, sensors and cameras are. Share them carefully.</div>
        <div class="err" id="formerr">${esc(dlg.err || "")}</div>
        <div class="acts"><button class="btn" data-act="closedlg">Close</button></div>`, 560);
    }
    return "";
  },

  _readyHtml() {
    const p = this._plan();
    const dlg = this.s.dialog;
    const pos = (this.work && this.work.positions) || {};
    const placed = Object.keys(pos).length;
    const approx = Object.values(pos).filter((x) => x.approx).length;
    const notYet = this.devices.filter((d) => this._inScope(d) && this._status(d) === "unplaced").length;
    const dash = dlg.dash;
    const preview = `<button class="btn" data-act="preview">Preview live view</button>`;
    const haBox = `<b>What's in Home Assistant</b><br>📍 <b>${esc(/plan$/i.test(p.name) ? p.name : `${p.name} plan`)}</b>: a device under Settings → Devices${[p.sensor_entity, p.image_entity].filter(Boolean).length ? `, with ${[p.sensor_entity, p.image_entity].filter(Boolean).map((e) => `<code>${esc(e)}</code>`).join(", ")}` : ""}. It holds your plan and the positions of your devices; deleting the plan removes it.
        ${p.device_id ? `<br><button class="link" style="padding:4px 0" data-act="opendevice">Open device</button> · ` : "<br>"}<button class="link" style="padding:4px 0" data-act="export">Export…</button>`;
    const later = `You can come back anytime to add, move or remove devices, or add floors. Everything is saved automatically, and new devices you add to Home Assistant show up here marked <b>New</b>.${approx ? ` ${approx} device${approx > 1 ? "s are" : " is"} still approximate: confirm ${approx > 1 ? "them" : "it"} whenever you like.` : ""}`;
    if (dash === undefined) {
      return `<h2 class="okttl">${SVG.okcircle}Your ${esc(p.name)} plan</h2><p>Checking your dashboards…</p>`;
    }
    if (dash) {
      // Already on a dashboard: the card reads the plan live, nothing to "send".
      const df = dlg.diff;
      const parts = df ? [df.added ? `<b>+${df.added}</b> placed` : "", df.moved ? `<b>${df.moved}</b> moved` : "", df.removed ? `<b>${df.removed}</b> removed` : ""].filter(Boolean) : [];
      const changes = parts.length ? `Since last time: ${parts.join(" · ")}` : "No changes since last time.";
      return `<h2 class="okttl">${SVG.okcircle}Your dashboard is up to date</h2>
        <p>The ${esc(p.name)} card on <b>${esc(dash.title)}</b> shows your plan live, so every change you make here is already there.</p>
        <div class="stat"><span>${changes}</span></div>
        <div class="stat"><span><b>${placed}</b> placed</span>${approx ? `<span><b>${approx}</b> approximate</span>` : ""}<span style="color:var(--df-sec)">${notYet} not placed yet</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="opendash" data-path="${esc(dash.path)}">Open dashboard (${esc(dash.title)})</button>${preview}<button class="btn" data-act="toadddash">+ Add to another dashboard</button></div>
        <details class="box"><summary style="cursor:pointer">What's in Home Assistant</summary>${haBox.replace("<b>What's in Home Assistant</b><br>", "")}</details>
        <p>${later}</p>
        <div class="acts"><button class="btn" data-act="closedlg">Done</button></div>`;
    }
    return `<h2 class="okttl">${SVG.okcircle}Your ${esc(p.name)} plan is ready to use</h2>
      <div class="stat"><span><b>${placed}</b> device${placed === 1 ? "" : "s"} placed</span>${approx ? `<span><b>${approx}</b> approximate</span>` : ""}<span style="color:var(--df-sec)">${notYet} not placed yet</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="toadddash">Add to dashboard</button>${preview}</div>
      <div style="font-size:13px;color:var(--df-sec)">Already have a floorplan card? Edit it and tick this floor under <b>Floors</b>.</div>
      <div class="box">${haBox}</div>
      <p>${later}</p>
      <div class="acts"><button class="btn" data-act="closedlg">Done</button></div>`;
  },

  _addedHtml() {
    const d = this.s.dialog;
    return `<h2 class="okttl">${SVG.okcircle}Added to ${esc(d.title)}</h2>
      <p>The ${esc(this._plan().name)} plan is now on your dashboard, in ${d.viewNew ? "a new view" : "the view"} <b>“${esc(d.view)}”</b>.${d.newDash ? ` A new dashboard <b>“${esc(d.title)}”</b> was added to your sidebar.` : ""}</p>
      <p>It updates by itself: when you add, move or remove devices here, the dashboard follows.</p>
      <div class="acts"><button class="btn" data-act="closedlg">Close</button><button class="btn primary" data-act="opendash" data-path="${esc(d.path)}">Open dashboard</button></div>`;
  },

  _addDashHtml() {
    const d = this.s.dialog;
    const p = this._plan();
    const yaml = `type: custom:device-floorplan-card\nplan: ${p.id}`;
    if (!d.dashboards) return `<h2>Add to dashboard</h2><p>Loading your dashboards…</p>`;
    const opts = d.dashboards.map((x) => `<option value="${esc(x.key)}" ${x.key === d.key ? "selected" : ""} ${x.mode === "yaml" ? "disabled" : ""}>${esc(x.title)}${x.mode === "yaml" ? " (YAML mode)" : ""}</option>`).join("");
    let body = "";
    if (d.cfgError) {
      body = `<div class="box">${esc(d.cfgError)} Add the card by hand instead: edit the dashboard, add a <b>Manual</b> card and paste:</div><div class="yaml">${esc(yaml)}</div><button class="btn" data-act="copyyaml">Copy</button>`;
    } else if (!d.config) body = `<p>Loading…</p>`;
    else {
      const views = d.config.views || [];
      const vopts = views.map((v, i) => `<option value="${i}" ${String(i) === String(d.view) ? "selected" : ""} ${v.type === "panel" ? "disabled" : ""}>${esc(v.title || v.path || `View ${i + 1}`)}${v.type === "panel" ? " (full width, has a card)" : ""}</option>`).join("");
      const isNew = (d.dashboards.find((x) => x.key === d.key) || {}).mode === "new";
      body = `${d.note ? `<div class="box">${esc(d.note)}</div>` : ""}<label class="opt ${d.where !== "view" ? "on" : ""}"><input type="radio" name="dw" value="new" data-act="dashwhere" ${d.where !== "view" ? "checked" : ""}><span><b>New full-width view “${esc(p.name)}” (recommended)</b><span>The plan gets the whole screen, best on wall tablets.</span></span></label>
        <label class="opt ${d.where === "view" ? "on" : ""}"><input type="radio" name="dw" value="view" data-act="dashwhere" ${d.where === "view" ? "checked" : ""} ${views.length && !isNew ? "" : "disabled"}><span><b>Add to an existing view</b><span>The card is added at the end of the view.</span></span></label>
        ${d.where === "view" ? `<label class="f">View<select id="dview" data-act="dashview">${vopts}</select></label>` : ""}`;
    }
    return `<h2>Add to dashboard</h2><label class="f">Dashboard<select id="dkey" data-act="dashkey">${opts}</select></label>${body}
      <div class="err" id="formerr">${esc(d.err || "")}</div>
      <div class="acts">${d.from ? `<button class="btn" data-act="dlgback" style="margin-right:auto">← Back</button>` : ""}<button class="btn" data-act="closedlg">Cancel</button>${d.cfgError ? "" : `<button class="btn primary" data-act="doadddash" ${d.config && !d.busy ? "" : "disabled"}>${d.busy ? "Adding…" : "Add card"}</button>`}</div>`;
  },

  _planFormHtml(mode, inline) {
    const p = mode === "settings" ? this._plan() : null;
    const f = this.s.form || (this.s.form = {});
    const name = f.name ?? (p ? p.name : this.floors[0] && !this.plans.length ? this.floors[0].name : "Ground floor");
    const freeFloor = this.floors.find((fl) => !this.plans.some((pl) => pl.floor_id === fl.floor_id));
    const where = f.where ?? (p ? (p.kind === "view" ? "view" : p.floor_id ? `floor:${p.floor_id}` : "level") : freeFloor ? `floor:${freeFloor.floor_id}` : "level");
    const level = f.level ?? (p && p.level != null ? p.level : 0);
    const img = f.img ?? (p ? p.image_type : "top");
    const used = (fid) => this.plans.some((pl) => pl.floor_id === fid && (!p || pl.id !== p.id));
    const floorOpts = this.floors.slice().sort((x, y) => (y.level ?? 0) - (x.level ?? 0)).map((fl) => `<option value="floor:${esc(fl.floor_id)}" ${where === `floor:${fl.floor_id}` ? "selected" : ""} >${esc(fl.name)} (HA floor, level ${fl.level ?? "?"})${used(fl.floor_id) ? " · has a plan: this one goes beside it" : ""}</option>`).join("");
    const opt = (val, title, desc) => `<label class="opt ${img === val ? "on" : ""}"><input type="radio" name="img" value="${val}" data-act="formimg" ${img === val ? "checked" : ""}><span><b>${title}</b><span>${desc}</span></span></label>`;
    const hasImage = !!f.image || (p && p.image_url && !f.changeImage);
    const title = p ? (p.kind === "view" ? "Plan settings" : "Floor settings") : inline ? "Create your first plan" : "New plan";
    const intro = !p ? `<p>A plan is one floor of your home, or any other view (garden, a single room…). A floor can have several plans (the house and its garden, or the two halves of a big floor): on the card ◀ ▶ go between them. ${inline ? "Start with one floor: you can add more floors later." : ""}</p>` : "";
    let imageBlock;
    if (p && p.image_url && !f.changeImage && !f.image) {
      const src = this._imgSrc(p);
      imageBlock = `<div class="chosen">${src ? `<img src="${esc(src)}" alt="">` : ""}<div class="t"><b>Current image</b>${p.image_source === "ha" ? `Linked to ${esc(p.image_url)} (a backup copy is kept)` : "Stored by Device Floorplan"}</div><button class="btn" data-act="changeimg">Replace image</button></div>`;
    } else imageBlock = this._imageChooserHtml("form");
    const typeBlock = hasImage
      ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="secttl">What kind of image is it?</span>
        ${opt("top", "Top-down plan", "A plan seen from above. Measuring and distances are available.")}
        ${opt("angled", "Angled view", "A 3D-style or perspective picture. Place devices where they appear; measuring is turned off.")}</div>`
      : "";
    // 0.13.9.5: where north is on the picture, for compass words (AI assistants, actions). Optional.
    const nv = p ? (f.north !== undefined ? f.north : p.north) : null;
    const dirs = [["0", "↑ Up"], ["45", "↗ Up right"], ["90", "→ Right"], ["135", "↘ Down right"], ["180", "↓ Down"], ["225", "↙ Down left"], ["270", "← Left"], ["315", "↖ Up left"]];
    const northBlock = p ? `<label class="f">North on this plan (optional: adds compass words such as “north side” to AI answers)<select id="fnorth"><option value="" ${nv == null ? "selected" : ""}>Not set</option>${dirs.map(([v, t]) => `<option value="${v}" ${nv != null && Math.round(nv) % 360 === Number(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>` : "";
    const extra = p ? `<label style="font-size:13px;display:flex;gap:8px;align-items:center"><input type="checkbox" data-act="guidebox" ${this.s.guide ? "checked" : ""}> Show the step-by-step guide</label>` : "";
    const importLink = !p ? `<div style="font-size:13px;color:var(--df-sec)">Have a backup? <button class="link" data-act="importplan">Import a plan from a file (.json)</button><input type="file" id="importfile" accept="application/json,.json" hidden></div>` : "";
    return `<div class="dialog stickyacts" role="dialog" aria-modal="${inline ? "false" : "true"}" data-form="${mode}" style="${inline ? "max-width:640px" : "max-width:620px"}">${f.fromIntro ? `<button class="link backlink" data-act="backintro">← Back to the intro</button>` : ""}<h2>${title}</h2>${intro}
      <label class="f">Name<input type="text" id="fname" value="${esc(name)}" maxlength="60"></label>
      <label class="f">This plan is<select id="fwhere">${floorOpts}<option value="level" ${where === "level" ? "selected" : ""}>A floor, by level number</option><option value="view" ${where === "view" ? "selected" : ""}>Not a floor (a view: garden, one room, network overview…)</option></select></label>
      ${where === "level" ? `<label class="f">Level (0 = ground floor, 1 = first floor, −1 = basement)<input type="number" id="flevel" value="${esc(level)}" step="1"></label>` : ""}
      <div style="display:flex;flex-direction:column;gap:8px"><span class="secttl">Floorplan image</span>${imageBlock}
      <div class="imgtip ${f.opaque ? "warn" : ""}">${f.opaque ? "<b>This image has a solid background.</b> " : "<b>Tip:</b> "}A plan with a <b>transparent background</b> (PNG or WebP, nothing around the house) looks much better on the dashboard: the card's background shows around the house instead of a box.</div></div>
      ${typeBlock}${northBlock}${extra}${importLink}<div class="err" id="formerr">${esc(f.err || "")}</div>
      <div class="acts">${inline ? "" : `<button class="btn" data-act="closedlg">Cancel</button>`}<button class="btn primary" data-act="saveform" ${f.busy ? "disabled" : ""}>${f.busy ? "Saving…" : p ? "Save" : "Create plan"}</button></div></div>`;
  },

  /**
   * Choose an image: drop zone / browse, an image already in HA, or a sample plan.
   * where = "form" (inside the plan dialog) or "canvas" (plan without image).
   */
  _imageChooserHtml(where) {
    const f = this.s.form || (this.s.form = {});
    if (f.image) {
      const im = f.image;
      const label = im.kind === "file" ? im.file.name : im.kind === "template" ? `Sample plan: ${(this.templates.find((t) => t.id === im.id) || {}).name || im.id}` : im.url;
      const sub = im.kind === "file" ? `${Math.round(im.file.size / 1024)} KB · will be stored by Device Floorplan` : im.kind === "template" ? "A sample to try things out. You can replace it with your own plan any time." : "Stays linked to this file in Home Assistant; a backup copy is kept.";
      const go = where === "canvas" ? `<button class="btn primary" data-act="applyimg" ${f.busy ? "disabled" : ""}>${f.busy ? "Saving…" : "Use this image"}</button>` : "";
      return `<div class="chosen"><img src="${esc(im.preview)}" alt=""><div class="t"><b>${esc(label)}</b>${esc(sub)}</div><button class="link" data-act="clearimg">Change</button></div>${go}
        ${where === "canvas" ? `<div class="err">${esc(f.err || "")}</div>` : ""}`;
    }
    const tpls = this.templates.length
      ? `<div class="secttl" style="margin-top:4px">Or try one of our sample plans</div><div class="tpls">${this.templates.map((t) => `<button class="tpl" data-act="picktpl" data-id="${esc(t.id)}" title="${esc(t.name)}"><img src="${STATIC}/${esc(t.thumbnail)}" alt="" loading="lazy">${esc(t.name)}</button>`).join("")}</div>`
      : "";
    let ha = `<button class="btn" data-act="halist">${SVG.ha}Use an image from Home Assistant</button>`;
    if (f.haOpen) {
      const list = f.haList;
      ha = !list
        ? `<div class="box">Looking for images in your <code>www</code> folder…</div>`
        : !list.length
          ? `<div class="box">No images found in your <code>config/www</code> folder. <button class="link" data-act="halistclose">Close</button></div>`
          : `<div class="secttl">Images in Home Assistant (<code>/local/…</code>) <button class="link" data-act="halistclose">Close</button></div><div class="tpls" style="max-height:260px;overflow:auto">${list.map((i) => `<button class="tpl" data-act="pickha" data-url="${esc(i.url)}" title="${esc(i.name)}"><img src="${esc(i.url)}" alt="" loading="lazy">${esc(i.name.split("/").pop())}</button>`).join("")}</div>`;
    }
    const drop = `<div class="drop" data-drop tabindex="0" role="button" data-act="browse" aria-label="Choose a floorplan image">${SVG.upload}<b>Drop your floorplan image here</b><span>or click to browse · PNG, JPG or WebP, up to 15 MB</span></div>
      <input type="file" id="pickfile" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="srcrow">${ha}</div>`;
    const err = where === "canvas" ? `<div class="err">${esc(f.err || "")}</div>` : "";
    if (f.samplesFirst && this.templates.length) {
      const first = tpls.replace("Or try one of our sample plans", "Pick a sample plan to try things out");
      return `${first}<div class="secttl" style="margin-top:6px">Or use your own image</div>${drop}${err}`;
    }
    return `${drop}${tpls}${err}`;
  },

  _setupHtml() {
    const f = this.s.setup || (this.s.setup = this._setupDefaults());
    const devs = this.devices.filter((d) => !d.loose || d.physical);
    const physical = devs.filter((d) => !d.virtual);
    const conns = CONN_ORDER.filter((c) => physical.some((d) => d.conns.includes(c)));
    const groups = Object.keys(GROUPS).filter((g) => physical.some((d) => (d.category || d.group) === g));
    const keep = devs.filter((d) => this._setupKeep(d, f));
    // Chips carry no counts: the live summary line below is the one number that matters.
    const box = (key, val, label) => {
      const on = f[key].includes(val);
      return `<label class="chip pick ${on ? "on" : ""}"><input type="checkbox" data-act="setupchk" data-key="${key}" data-val="${esc(val)}" ${on ? "checked" : ""} hidden><span class="ck">${on ? SVG.check : ""}</span>${esc(label)}</label>`;
    };
    const auto = (key, label) => `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-act="setupauto" data-key="${key}" ${f[key] ? "checked" : ""}>${esc(label)}</label>`;
    return `<div class="welcome"><div class="dialog stickyacts" style="max-width:720px"><h2>What should go on your plan?</h2>
      <p>We've <b>preselected the usual kinds</b> of devices for you: the ones marked <span class="chip pick on" style="display:inline-flex;padding:1px 8px 1px 6px;font-size:12px;vertical-align:1px"><span class="ck">${SVG.check}</span>like this</span> go on your list. Tap a kind to add or remove it.
      Everything else starts as <b>skipped</b>: nothing is deleted or changed in HA, and you can add any of them later: they wait in the device list on the right, under Status → Skipped.</p>
      <div class="setgrid"><div><h3 class="big">By type</h3><div class="chips">${groups.map((g) => box("groups", g, GROUPS[g][0])).join("")}</div></div>
      <div><h3 class="big">By connection</h3><div class="chips">${conns.map((c) => box("conns", c, CONN[c].label)).join("")}</div></div>
      <div><h3 class="big u">Automatically skipped</h3><div style="display:flex;flex-direction:column;gap:6px">
        ${auto("skipVirtual", "Virtual and software devices (browser sessions, cloud services, helpers…)")}
        ${auto("skipNoArea", "Devices without an area")}
        ${auto("skipUnavailable", "Devices that are unavailable right now")}
        ${auto("skipHidden", "Devices whose entities are all hidden in HA")}</div></div></div>
      <div class="total" aria-live="polite">Your home has <b>${physical.length} physical devices</b>. <b>${keep.length}</b> will be on your list, the rest starts as skipped. You can change this any time.</div>
      <div class="acts"><button class="btn primary" data-act="setupdone">Continue</button></div></div></div>`;
  },

  _setupDefaults() {
    const conns = CONN_ORDER.slice();
    const groups = Object.keys(GROUPS).filter((g) => !["media", "other", "helpers"].includes(g));
    return { conns, groups, skipVirtual: true, skipNoArea: true, skipUnavailable: true, skipHidden: true };
  },

  _setupKeep(d, f) {
    if (d.loose && !d.physical) return false;
    if (d.virtual && f.skipVirtual) return false;
    if (!d.area_id && f.skipNoArea) return false;
    if (d.unavailable && f.skipUnavailable) return false;
    if (d.all_hidden && f.skipHidden) return false;
    if (!d.virtual && !d.loose && !d.conns.some((c) => f.conns.includes(c))) return false;
    if (!f.groups.includes(d.category || d.group)) return false;
    return true;
  },
});
