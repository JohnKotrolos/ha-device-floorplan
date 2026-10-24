/**
 * <device-floorplan-intro> – first-run welcome dialog for Device Floorplan.
 *
 * Vanilla web component (no Lit dependency), Shadow DOM, follows the active
 * Home Assistant theme through HA CSS variables (light + dark).
 *
 * Usage:
 *   import "./device-floorplan-intro.js";
 *   const intro = document.createElement("device-floorplan-intro");
 *   intro.addEventListener("intro-action", (e) => {
 *     // e.detail.action: "start" | "sample" | "later"
 *   });
 *   panelRoot.appendChild(intro);
 *
 * Attributes:
 *   image-base  Base URL of the step images (default "/device_floorplan/intro/")
 *   open        Present = visible. Set by show(), removed by close().
 *
 * Helpers:
 *   DeviceFloorplanIntro.shouldShow()  true until the intro was dismissed once
 *   DeviceFloorplanIntro.markSeen()    called automatically on any action
 *   DeviceFloorplanIntro.reset()       for "⋮ → Show intro"
 */

const SEEN_KEY = "device_floorplan_intro_seen_v1";

const STEPS = [
  {
    img: "step-1.webp",
    title: "Add your plan",
    text: "Upload a picture of your home, or start from one of our sample plans.",
    alt: "The Device Floorplan editor with a floorplan loaded",
  },
  {
    img: "step-2.webp",
    title: "Choose your devices",
    text: "Pick which kinds of devices to show – we preselect the usual ones.",
    alt: "The device list with filters on top of the floorplan",
  },
  {
    img: "step-3.webp",
    title: "Place them",
    text: "Drag devices from the list onto the plan, or use Auto-place for a quick start, then fine-tune.",
    alt: "A device being placed on the floorplan",
  },
  {
    img: "step-4.webp",
    title: "See it live",
    text: "Add the card to your dashboard and watch your home update in real time.",
    alt: "The live card showing humidity, motion, light and temperature on the plan",
  },
];

// Tips may contain HTML; {guide} is replaced with the sketch-guide URL.
const TIPS = [
  "A top-down plan works best – it doesn't need to be exact.",
  "No floorplan? No need for a 3D program. Read our quick guide <a href=\"{guide}\" target=\"_blank\" rel=\"noopener\">Turn your sketch into a floorplan in 10 minutes ↗</a>",
  "Measuring is optional, but it makes distances and the scale bar correct.",
  "Skip devices you don't need on the plan. You can add them anytime.",
  "Start with Auto-place, then fine-tune by dragging.",
  "Focus on putting each device in the right spot – that's what matters. Icons, what each marker shows and how it looks can be adjusted later in the dashboard card.",
  "Can't find something? Type its name or entity id in the search: it finds every device, also skipped ones, and helpers without a device.",
];

const ICON = {
  logo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 2a4 4 0 0 0-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4m0 2.6A1.4 1.4 0 1 1 18 7.4 1.4 1.4 0 0 1 18 4.6M3 6v15h18v-6h-2v4h-5v-3h-2v3H5v-6h5v-2H5V8h6V6z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16m4.6 4.6L10 15.2l-2.6-2.6L6 14l4 4 8-8z"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2m2 11.7V16h-4v-2.3a5 5 0 1 1 4 0M9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`,
};

const CSS = `
:host {
  --dfi-primary: var(--primary-color, #03a9f4);
  --dfi-on-primary: var(--text-primary-color, #fff);
  --dfi-bg: var(--card-background-color, var(--ha-card-background, #fff));
  --dfi-surface: var(--secondary-background-color, #f3f4f6);
  --dfi-text: var(--primary-text-color, #1c1c1e);
  --dfi-muted: var(--secondary-text-color, #5f6368);
  --dfi-divider: var(--divider-color, rgba(0,0,0,.12));
  --dfi-success: var(--success-color, #43a047);
  --dfi-radius: var(--ha-card-border-radius, 16px);
  display: none;
  position: fixed; inset: 0; z-index: 9;
  font-family: var(--paper-font-body1_-_font-family, inherit);
}
:host([open]) { display: block; }
* { box-sizing: border-box; }

.scrim {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.45);
  backdrop-filter: blur(2px);
  animation: fade .2s ease-out;
}
.dialog {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: min(1120px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  display: flex; flex-direction: column;
  background: var(--dfi-bg); color: var(--dfi-text);
  border: 1px solid var(--dfi-divider);
  border-radius: calc(var(--dfi-radius) + 4px);
  box-shadow: 0 24px 64px rgba(0,0,0,.35);
  overflow: hidden; outline: none;
  animation: rise .28s cubic-bezier(.2,.8,.2,1);
}
@keyframes fade { from { opacity: 0 } }
@keyframes rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)) } }
@media (prefers-reduced-motion: reduce) { .scrim, .dialog, .step { animation: none !important } }

header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 20px 0 24px;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 500; font-size: 15px; }
.brand svg { width: 26px; height: 26px; color: var(--dfi-primary); }
.icon-btn {
  margin-left: auto; width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center; border: 0; cursor: pointer;
  background: transparent; color: var(--dfi-muted);
}
.icon-btn:hover { background: var(--dfi-surface); color: var(--dfi-text); }
.icon-btn svg { width: 22px; height: 22px; }

.body { overflow-y: auto; padding: 8px 24px 20px; }

.hero { text-align: center; padding: 8px 0 24px; }
.hero h1 {
  margin: 0; font-size: clamp(24px, 3.4vw, 38px); line-height: 1.15;
  font-weight: 700; letter-spacing: -.02em; text-wrap: balance;
}
.hero p {
  margin: 10px auto 0; max-width: 620px;
  font-size: clamp(14px, 1.5vw, 17px); color: var(--dfi-muted); text-wrap: balance;
}

.steps {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;
  counter-reset: step;
}
.step {
  position: relative; display: flex; flex-direction: column; gap: 10px;
  animation: rise-step .4s cubic-bezier(.2,.8,.2,1) both;
}
.step:nth-child(2) { animation-delay: .06s }
.step:nth-child(3) { animation-delay: .12s }
.step:nth-child(4) { animation-delay: .18s }
@keyframes rise-step { from { opacity: 0; transform: translateY(10px) } }

.shot {
  position: relative; aspect-ratio: 4 / 3; border-radius: var(--dfi-radius);
  overflow: hidden; background: var(--dfi-surface);
  border: 1px solid var(--dfi-divider);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08);
}
.shot img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform .6s cubic-bezier(.2,.8,.2,1);
}
.step:hover .shot img { transform: scale(1.04); }

/* arrow between cards */
.shot-wrap { position: relative; }
.arrow {
  position: absolute; right: -19px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 18px; color: var(--dfi-muted); pointer-events: none;
}
.arrow svg { width: 18px; height: 18px; display: block; }
.step:last-child .arrow { display: none; }

.num {
  font-size: 13px; font-weight: 600; letter-spacing: .04em; color: var(--dfi-primary);
  font-variant-numeric: tabular-nums; margin-top: 6px;
}
.step h2 { margin: 0; font-size: 17px; font-weight: 600; }
.step p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--dfi-muted); }

.reassure {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin: 28px 0 16px; font-size: 14px; color: var(--dfi-muted); text-align: left;
}
.reassure svg { flex: none; width: 22px; height: 22px; color: var(--dfi-success); }

details {
  border: 1px solid var(--dfi-divider); border-radius: var(--dfi-radius);
  background: var(--dfi-surface);
}
summary {
  list-style: none; cursor: pointer; display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; font-size: 15px; font-weight: 500; border-radius: var(--dfi-radius);
}
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid var(--dfi-primary); outline-offset: 2px; }
summary .bulb { width: 22px; height: 22px; color: var(--dfi-muted); }
summary .chev { margin-left: auto; width: 22px; height: 22px; color: var(--dfi-muted); transition: transform .2s; }
details[open] summary .chev { transform: rotate(180deg); }
details ul { margin: 0; padding: 0 18px 16px 52px; display: grid; gap: 8px; }
details li { font-size: 14px; line-height: 1.45; color: var(--dfi-muted); }
details li a { color: var(--dfi-primary); font-weight: 500; }

footer {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 16px 24px; border-top: 1px solid var(--dfi-divider);
}
.btn {
  font: inherit; font-size: 15px; font-weight: 500; cursor: pointer;
  height: 44px; padding: 0 20px; border-radius: 22px;
  display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  transition: background .15s, box-shadow .15s, transform .1s;
}
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 2px solid var(--dfi-primary); outline-offset: 2px; }
.btn svg { width: 20px; height: 20px; }
.ghost { border: 0; background: transparent; color: var(--dfi-muted); padding: 0 12px; }
.ghost:hover { color: var(--dfi-text); background: var(--dfi-surface); }
.secondary {
  margin-left: auto; border: 1px solid var(--dfi-divider);
  background: transparent; color: var(--dfi-primary);
}
.secondary:hover { background: color-mix(in srgb, var(--dfi-primary) 8%, transparent); }
.primary {
  border: 0; background: var(--dfi-primary); color: var(--dfi-on-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--dfi-primary) 40%, transparent);
}
.primary:hover { box-shadow: 0 4px 16px color-mix(in srgb, var(--dfi-primary) 50%, transparent); }

/* tablet: 2 x 2 */
@media (max-width: 900px) {
  .steps { grid-template-columns: repeat(2, 1fr); gap: 24px 20px; }
  .arrow { display: none; }
}
/* phone: horizontal swipe row, full-screen sheet */
@media (max-width: 600px) {
  .dialog {
    left: 0; top: auto; bottom: 0; transform: none; width: 100vw;
    max-height: 100dvh; border-radius: 20px 20px 0 0; animation: sheet .3s ease-out;
  }
  @keyframes sheet { from { transform: translateY(24px); opacity: 0 } }
  .body { padding: 4px 16px 16px; }
  header { padding: 14px 12px 0 16px; }
  .hero { padding-bottom: 18px; }
  .steps {
    grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 78%;
    overflow-x: auto; scroll-snap-type: x mandatory; gap: 14px;
    margin: 0 -16px; padding: 0 16px 6px; scroll-padding-inline: 16px; scrollbar-width: none;
  }
  .steps::-webkit-scrollbar { display: none; }
  .step { scroll-snap-align: start; }
  footer { padding: 12px 16px; }
  .ghost { order: 3; width: 100%; justify-content: center; }
  .secondary, .primary { flex: 1; justify-content: center; margin: 0; padding: 0 12px; }
}
`;

class DeviceFloorplanIntro extends HTMLElement {
  static shouldShow() {
    try { return localStorage.getItem(SEEN_KEY) !== "1"; } catch { return true; }
  }
  static markSeen() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
  }
  static reset() {
    try { localStorage.removeItem(SEEN_KEY); } catch { /* storage unavailable */ }
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._onKey = this._onKey.bind(this);
  }

  connectedCallback() {
    this._render();
    if (!this.hasAttribute("open")) this.show();
  }
  disconnectedCallback() { document.removeEventListener("keydown", this._onKey); }

  static get observedAttributes() { return ["image-base"]; }
  attributeChangedCallback() { if (this.shadowRoot.innerHTML) this._render(); }

  show() {
    this._lastFocus = document.activeElement;
    this.setAttribute("open", "");
    document.addEventListener("keydown", this._onKey);
    requestAnimationFrame(() => this.shadowRoot.querySelector(".dialog")?.focus());
  }

  close(action = "later") {
    DeviceFloorplanIntro.markSeen();
    this.removeAttribute("open");
    document.removeEventListener("keydown", this._onKey);
    this._lastFocus?.focus?.();
    this.dispatchEvent(new CustomEvent("intro-action", {
      detail: { action }, bubbles: true, composed: true,
    }));
  }

  _onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); this.close("later"); return; }
    if (e.key !== "Tab") return;
    // simple focus trap
    const f = [...this.shadowRoot.querySelectorAll("button, summary")];
    const first = f[0], last = f[f.length - 1];
    const active = this.shadowRoot.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  _render() {
    const base = (this.getAttribute("image-base") || "/device_floorplan/intro/").replace(/\/?$/, "/");
    const guide = this.getAttribute("guide-url") || "#";
    const steps = STEPS.map((s, i) => `
      <li class="step">
        <div class="shot-wrap">
          <div class="shot"><img src="${base}${s.img}" alt="${s.alt}" decoding="async" width="640" height="480"></div>
          <span class="arrow">${ICON.arrow}</span>
        </div>
        <span class="num">0${i + 1}</span>
        <h2>${s.title}</h2>
        <p>${s.text}</p>
      </li>`).join("");

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <div class="scrim" part="scrim"></div>
      <div class="dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="dfi-title" part="dialog">
        <header>
          <div class="brand">${ICON.logo}<span>Device Floorplan</span></div>
          <button class="icon-btn" data-action="later" aria-label="Close">${ICON.close}</button>
        </header>
        <div class="body">
          <div class="hero">
            <h1 id="dfi-title">See every device where it really is.</h1>
            <p>Place your devices on your floorplan and bring them to life on your dashboard.</p>
          </div>
          <ol class="steps">${steps}</ol>
          <div class="reassure">${ICON.check}<span>Everything saves automatically. Leave anytime and pick up where you left off.</span></div>
          <details>
            <summary><span class="bulb">${ICON.bulb}</span>A few tips before you start<span class="chev">${ICON.chevron}</span></summary>
            <ul>${TIPS.map((t) => `<li>${t.replace("{guide}", guide)}</li>`).join("")}</ul>
          </details>
        </div>
        <footer>
          <button class="btn ghost" data-action="later">Maybe later</button>
          <button class="btn secondary" data-action="sample">Try a sample plan</button>
          <button class="btn primary" data-action="start">Add your first plan ${ICON.arrow}</button>
        </footer>
      </div>`;

    this.shadowRoot.querySelectorAll("[data-action]").forEach((b) =>
      b.addEventListener("click", () => this.close(b.dataset.action)));
    this.shadowRoot.querySelector(".scrim").addEventListener("click", () => this.close("later"));
  }
}

if (!customElements.get("device-floorplan-intro")) {
  customElements.define("device-floorplan-intro", DeviceFloorplanIntro);
}
export { DeviceFloorplanIntro };
