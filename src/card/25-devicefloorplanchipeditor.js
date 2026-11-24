class DeviceFloorplanChipEditor extends HTMLElement {
  setConfig(c) {
    this._config = { ...(c || {}) };
    this._render();
  }

  set hass(h) {
    dfLangOf(h); // 0.14 L1: texts in this user's language
    this._hass = h;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const phOpts = [{ value: "", label: "None" }];
    const bdOpts = [{ value: "", label: "None" }];
    for (const s of planSensors(this._hass)) for (const [pid, ph] of Object.entries(s.attributes.phantoms || {})) phOpts.push({ value: `${s.attributes.plan_id}:${pid}`, label: `${ph.name} (${s.attributes.plan_name || s.attributes.plan_id})` });
    for (const s of planSensors(this._hass)) for (const [bid, b] of Object.entries(s.attributes.bonds || {})) bdOpts.push({ value: `${s.attributes.plan_id}:${bid}`, label: `${bondName(b)} (${s.attributes.plan_name || s.attributes.plan_id})` });
    const schema = [
      { name: "overlay", selector: { select: { options: OVERLAY_ORDER.map((o) => ({ value: o, label: OVERLAYS[o].label })), mode: "dropdown", custom_value: true } } },
      { name: "card_id", selector: { text: {} } },
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "entity", selector: { entity: {} } },
      { name: "phantom", selector: { select: { options: phOpts, mode: "dropdown" } } },
      { name: "bond", selector: { select: { options: bdOpts, mode: "dropdown" } } },
      { name: "value_first", selector: { boolean: {} } },
      { name: "value_style", selector: { select: { options: [{ value: "full", label: "Full: 3 of 8 on" }, { value: "short", label: "Short: 3 on / All off" }], mode: "dropdown" } } },
      { name: "glow", selector: { select: { options: [{ value: "off", label: "Off" }, { value: "standard", label: "Standard: while something is on (amber lights, blue openings)" }, { value: "custom", label: "Custom: a template returns the colour" }], mode: "dropdown" } } },
      ...(this._config.glow === "standard" ? [{ name: "glow_color", selector: { text: {} } }] : []),
      ...(this._config.glow === "custom" ? [{ name: "glow_template", selector: { template: {} } }] : []),
      { name: "toggle", selector: { boolean: {} } },
      { name: "hold_action", selector: { ui_action: {} } },
      { name: "tap", selector: { select: { options: [{ value: "overlay", label: "Switch the floorplan to this overlay" }, { value: "more-info", label: "Open the value's details" }, { value: "bond", label: "Switch the bond (all together)" }, { value: "none", label: "Nothing" }], mode: "dropdown" } } },
    ];
    const labels = { overlay: "Overlay it opens (and glows for)", card_id: "Card ID of the floorplan card (empty = any on this screen)", label: "Label", icon: "Icon", entity: "Value from an entity (optional)", phantom: "…or from a phantom (optional)", bond: "…or from a bond (optional)", tap: "Tap", value_first: "Value big, label small", value_style: "Value style", glow: "Icon glow", glow_color: "Glow colour (optional, e.g. #F2B84B; empty = by kind)", glow_template: "Template: returns a colour (e.g. #E5534B) or nothing", toggle: "Tap again goes back to the default overlay", hold_action: "Hold (long press)" };
    if (!this._f) {
      this._f = document.createElement("ha-form");
      this._f.computeLabel = (s) => labels[s.name] || s.name;
      this._f.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const v = { ...e.detail.value };
        for (const k of Object.keys(v)) if (v[k] === "" || v[k] == null) delete v[k];
        if (v.tap === "overlay") delete v.tap;
        if (v.toggle === true) delete v.toggle;
        if (v.value_first === false) delete v.value_first;
        if (v.value_style === "full") delete v.value_style;
        if (v.glow === "off") delete v.glow;
        this._config = { type: "custom:device-floorplan-chip", ...v };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
        this._render();
      });
      this.appendChild(this._f);
    }
    this._f.hass = this._hass;
    this._f.schema = schema;
    this._f.data = { tap: "overlay", toggle: true, value_style: "full", glow: "off", ...this._config };
  }
}

if (!customElements.get("device-floorplan-chip")) customElements.define("device-floorplan-chip", DeviceFloorplanChip);
if (!customElements.get("device-floorplan-chip-editor")) customElements.define("device-floorplan-chip-editor", DeviceFloorplanChipEditor);
if (!window.customCards.some((c) => c.type === "device-floorplan-chip")) {
  window.customCards.push({
    type: "device-floorplan-chip",
    name: "Device Floorplan chip",
    description: "A chip for your top bar: switches a floorplan card's overlay and glows while it shows; can show a value or a phantom.",
    preview: true,
    documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/chip",
  });
}
console.info(`%c DEVICE-FLOORPLAN-CARD %c ${CARD_VERSION} `, "background:#03a9f4;color:#fff;border-radius:3px 0 0 3px", "background:#555;color:#fff;border-radius:0 3px 3px 0");
