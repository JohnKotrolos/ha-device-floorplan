// Mobile card: its styles, registration and dashboard strategy (#86).
const DFM_CSS = `
:host { display:block; /* 0.13.9.17 #69: the HA theme as it is: page, cards, sheets, lines and text from its own variables. */ --dfm-g1: var(--dfm-bg-top, var(--primary-background-color, #f3f5f9)); --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #f3f5f9) 94%, #000)); --dfm-bg: var(--dfm-g2); --dfm-card: var(--ha-card-background, var(--card-background-color, #fff)); --dfm-sheet: var(--secondary-background-color, var(--dfm-card)); --dfm-fg: var(--primary-text-color, #222); --dfm-sub: var(--secondary-text-color, #777); --dfm-acc: var(--primary-color, #03a9f4); --dfm-red: var(--error-color, #db4437); --dfm-amber: var(--warning-color, #f4b400); --dfm-div: var(--divider-color, rgba(0,0,0,.08)); color: var(--dfm-fg); font-family: var(--paper-font-body1_-_font-family, inherit); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.empty { padding: 24px; color: var(--dfm-sub); }
:host([dark]) { --dfm-g2: var(--dfm-bg-bottom, color-mix(in srgb, var(--primary-background-color, #111) 85%, #000)); }
/* #38: a soft gradient behind everything, fixed to the screen */
.bgfix { position: fixed; inset: 0; z-index: 0; background: linear-gradient(180deg, var(--dfm-g1), var(--dfm-g2)); pointer-events: none; }
.port { position: relative; min-height: calc(100dvh - var(--dfm-top, 56px)); }
.pg { position: relative; z-index: 1; padding: 12px 14px 0; }
.pad { height: 110px; }
.hd { display:flex; align-items:center; gap:12px; padding: 6px 2px 10px; }
.hd .grow { flex:1; min-width:0; }
.h1 { font-size: 18px; font-weight: 700; line-height:1.2; letter-spacing:-.01em; }
.hd.room .h1 { font-size: 20px; }
.sub { font-size: 12.5px; color: var(--dfm-sub); }
/* #91: a smaller avatar; the greeting always one line, its size fitted to the space */
.isslink { display:inline; padding: 0; font: inherit; color: var(--dfm-red); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--dfm-red) 40%, transparent); text-underline-offset: 2px; }
.isslink b { font-weight: 700; }
.hd.top .h1 { white-space: nowrap; font-size: var(--dfm-greet, 18px); }
.hd.top.tight .clim { max-width: 40%; }
.hd.top .me { width: 38px; height: 38px; flex: none; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px var(--dfm-card); }
.hd.top .me img { width: 100%; height: 100%; object-fit: cover; }
.hd.room { position: relative; }
.fold { position: absolute; right: 2px; bottom: -14px; z-index: 3; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 70%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 1px 4px rgba(0,0,0,.15); color: var(--dfm-fg); }
.fold ha-icon { --mdc-icon-size: 20px; }
.cut .fold { right: 22px; bottom: 14px; }
.bk { width:40px; height:40px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size: 22px; flex: none; }
.thumb { position:relative; width: 96px; flex:none; border-radius:10px; overflow:hidden; background: var(--dfm-card); }
.thumb img { width:100%; height:100%; object-fit: fill; opacity:.35; filter: grayscale(.6); display:block; }
.thumb svg { position:absolute; inset:0; width:100%; height:100%; }
.thumb polygon, .thumb ellipse { fill: var(--dfm-acc); fill-opacity:.55; stroke: var(--dfm-acc); stroke-width:.8; vector-effect: non-scaling-stroke; }
.plan { position: relative; --ha-card-background: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; --ha-card-border-radius: 0; }
.mini .plan, .cut .plan, .full .plan { -webkit-mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); -webkit-mask-composite: source-in; mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent), linear-gradient(to right, transparent, #000 5%, #000 95%, transparent); mask-composite: intersect; margin: 0 -14px; }
.mini .plan { --dfc-fit-h: 34vh; }
.mini { position: relative; margin-top: 2px; }
.flabel { position: absolute; left: 8px; top: 4px; z-index: 3; font-size: 11.5px; font-weight: 600; color: var(--dfm-sub); padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-card) 60%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); pointer-events: none; }
.mini .nav { opacity: .55; width: 34px; height: 34px; }
.mini .nav.l { left: -4px; } .mini .nav.r { right: -4px; }
/* #53: small pills that wrap: what is on above the plan, what needs a look under it */
/* #64: the climate card (top right) and the two segment bars (house above the plan, floor under it) */
.clim { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 7px 10px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); font-size: 12px; text-align: left; max-width: 52%; }
.clim .cl { display: flex; align-items: center; gap: 6px; white-space: nowrap; min-width: 0; }
.clim .cl ha-icon { --mdc-icon-size: 15px; color: var(--dfm-acc); flex: none; }
.clim .cl b { font-weight: 650; }
.clim .cl small { color: var(--dfm-sub); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; }
.clim .adot { margin: 0; }
.segs { display: flex; gap: 0; margin: 2px 0 8px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; }
.segs.below { margin: 6px 0 10px; }
.seg { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 6px; font-size: 13px; font-weight: 650; color: var(--dfm-sub); white-space: nowrap; }
.seg + .seg { box-shadow: inset 1px 0 0 var(--dfm-div); }
.seg span { overflow: hidden; text-overflow: ellipsis; }
.seg ha-icon { --mdc-icon-size: 18px; flex: none; }
.seg.on { color: #e8b923; }
/* #93: the landscape overlay rail: its own element, no background, labels whole */
.land { padding-right: var(--dfm-rail-w, 92px); padding-left: 48px; box-sizing: border-box; }
/* #108 / #109: navigation in the Floorplan card's floor-rail look (same sizes / colours), top left, beside the plan. */
.lnav { position: absolute; top: 6px; left: 6px; width: 36px; display:flex; flex-direction:column; align-items:center; gap: 8px; z-index: 4; }
.lnm { width: 36px; height: 32px; border-radius: 8px; display:flex; align-items:center; justify-content:center; color: var(--dfm-acc); background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); --mdc-icon-size: 22px; }
.lcap { width: 36px; box-sizing: border-box; display:flex; flex-direction:column; align-items:center; gap: 4px; padding: 3px 0; border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, #eee) 92%, transparent); box-shadow: 0 2px 10px rgba(0,0,0,.2); }
.lcap .fl { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--divider-color, rgba(0,0,0,.12)); background: var(--card-background-color, #fff); color: var(--primary-text-color); font-size: 13px; font-weight: 600; display:flex; align-items:center; justify-content:center; padding: 0; --mdc-icon-size: 18px; text-align: center; }
.lcap .fl.on { background: var(--dfm-acc); border-color: var(--dfm-acc); color: #fff; }
.lcap .div { width: 22px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); margin: 1px 0; }
.lrail { position: absolute; top: 0; right: 0; bottom: 0; width: var(--dfm-rail-w, 92px); display:flex; flex-direction:column; align-items:center; gap: 4px; padding: 8px 4px; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; z-index: 4; scrollbar-width: none; }
.lrail::-webkit-scrollbar { display: none; }
.lr { width: 100%; display:flex; flex-direction:column; align-items:center; gap: 2px; padding: 7px 2px; border-radius: 16px; color: var(--dfm-sub); font-size: 11px; font-weight: 600; line-height: 1.15; text-align: center; flex: none; }
.lr ha-icon { --mdc-icon-size: 22px; width: 40px; height: 32px; border-radius: 12px; display:flex; align-items:center; justify-content:center; }
.lr span { max-width: 100%; overflow-wrap: anywhere; }
.lr.on { color: var(--dfm-fg); }
.lr.on ha-icon { background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
.lr:active ha-icon { background: color-mix(in srgb, var(--dfm-fg) 10%, transparent); }
/* #92-12: one place pill with its list */
/* #92-6: one-time hints */
.phint, .hint2 { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--dfm-card) 88%, transparent); box-shadow: 0 2px 10px rgba(0,0,0,.14); color: var(--dfm-fg); pointer-events: none; white-space: nowrap; z-index: 3; }
.hint2 { bottom: 14px; }
.mini { position: relative; }
h2 .scope { font-size: 12px; font-weight: 500; color: var(--dfm-sub); margin-left: 6px; }
.seg.lt ha-icon { color: #e8b923; } /* #92-10: lights on is normal life: a yellow bulb, a neutral number */
.seg.warn { color: var(--dfm-amber); }
.seg.att { color: var(--dfm-red); }
.seg.act { color: var(--dfm-acc); }
.seg:active { background: color-mix(in srgb, var(--dfm-fg) 8%, transparent); }
.pi { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 999px; background: var(--dfm-card); font-size: 12px; white-space: nowrap; max-width: 100%; box-sizing: border-box; overflow: hidden; }
.pi ha-icon, .pi ha-state-icon { --mdc-icon-size: 14px; color: var(--dfm-acc); flex: none; }
.pi .t { overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.pi.wx { background: color-mix(in srgb, var(--dfm-acc) 16%, var(--dfm-card)); }
.pi.warn { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dfm-amber) 75%, transparent); }
.pi.warn ha-icon { color: var(--dfm-amber); }
.pi.att { box-shadow: inset 0 0 0 1px var(--dfm-red); color: var(--dfm-red); }
.pi.att ha-icon, .pi.att ha-state-icon { color: var(--dfm-red); }
.adot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.adot.a0 { background: #4caf50; } .adot.a1 { background: var(--dfm-amber); } .adot.a2 { background: var(--dfm-red); }
.cut { position: relative; margin: 6px -14px 0; }
.cut .plan { --dfc-fit-h: 33vh; margin: 0; --dfc-focus-dim: var(--dfm-g2); -webkit-mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); mask-image: linear-gradient(to bottom, transparent, #000 4%, #000 92%, transparent); }
.nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dfm-card) 45%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); color: var(--dfm-fg); opacity: .7; }
.nav.l { left: 8px; } .nav.r { right: 8px; }
.nav ha-icon { --mdc-icon-size: 24px; }
.full .plan { --dfc-fit-h: 52vh; }
.full .plan { -webkit-mask-image:none; mask-image:none; }
.mini, .full { position:relative; }
.fsw, .sw { display:flex; align-items:center; gap:6px; justify-content:center; font-size: 13px; color: var(--dfm-sub); }
.fsw button, .sw button { width:30px; height:30px; border-radius:50%; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.08); display:flex; align-items:center; justify-content:center; font-size:18px; }
.chips { display:flex; gap:8px; overflow-x:auto; padding: 6px 0 10px; scrollbar-width:none; }
.chips::-webkit-scrollbar, .hs::-webkit-scrollbar { display:none; }
.chip { flex:none; display:inline-flex; align-items:center; gap:6px; padding: 7px 12px; border-radius: 999px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.07); font-size: 13.5px; white-space:nowrap; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--dfm-acc); }
.chip.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); color: var(--dfm-red); }
.chip.att ha-icon { color: var(--dfm-red); }
.chip.warn { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dfm-amber) 80%, transparent); }
.chip.warn ha-icon { color: var(--dfm-amber); }
.chip ha-state-icon { --mdc-icon-size: 18px; }
.chip.wx { background: color-mix(in srgb, var(--dfm-acc) 14%, var(--dfm-card)); }
.chip.sel { background: var(--dfm-acc); color: #fff; }
.chip.sel ha-icon { color:#fff; }
section { margin: 14px 0 4px; }
h2 { display:flex; align-items:center; gap:8px; font-size: 15px; font-weight: 650; margin: 0 0 8px; }
h2 .gt { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; display:flex; align-items:center; justify-content:center; background: var(--dfm-card); color: var(--dfm-sub); }
h2 .gt ha-icon { --mdc-icon-size: 18px; color: inherit; }
.gridw { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gridw > * { width: auto !important; }
h2 > ha-icon { --mdc-icon-size: 20px; color: var(--dfm-sub); }
h2 .all, h3 .all { margin-left:auto; font-size: 13px; color: var(--dfm-acc); font-weight:500; }
.gs { margin-left:auto; font-size: 13px; color: var(--dfm-sub); font-weight: 500; }
.gh { cursor: pointer; user-select: none; }
.gh .go { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-sub); }
.gh .go ha-icon { --mdc-icon-size: 22px; }
section.folded { margin-bottom: 0; }
.gi { width:32px; height:32px; border-radius: 10px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); }
.gi ha-icon { --mdc-icon-size: 19px; }
.g-lights { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent) !important; }
.g-comfort { color: #3b7dd8; background: color-mix(in srgb, #3b7dd8 15%, transparent) !important; }
.g-security { color: #2e8b57; background: color-mix(in srgb, #2e8b57 15%, transparent) !important; }
.g-media { color: #7e57c2; background: color-mix(in srgb, #7e57c2 15%, transparent) !important; }
.g-other { color: var(--dfm-sub); background: color-mix(in srgb, var(--dfm-sub) 12%, transparent) !important; }
.hs { display:flex; gap:10px; overflow-x:auto; padding: 2px 2px 6px; scrollbar-width:none; }
.rt, .pt, .cam, .ot { flex:none; width: 132px; padding: 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); display:flex; flex-direction:column; gap:4px; box-sizing: border-box; }
/* #56 / #57: room tiles: icon, overlay badges (top right), name, values */
.rt { position: relative; width: 150px; min-height: 150px; justify-content: flex-end; }
.rt .rti { position: absolute; left: 12px; top: 12px; }
.rt .bds { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-height: calc(100% - 66px); overflow: hidden; }
/* #92-1: the room's name has its own line: badges never reach it */
.rt b { position: relative; z-index: 1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bds.inl { position: static; flex-direction: row; flex-wrap: wrap; gap: 4px; }
.tb2 { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 999px; font-size: 11.5px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.tb2 ha-icon { --mdc-icon-size: 13px !important; color: inherit !important; }
.tb2.more { --c: var(--dfm-sub); }
/* #60: Home control tiles */
.ot { width: 170px; min-height: 130px; color: inherit; }
.ot .oti { width: 38px; height: 38px; border-radius: 12px; display:flex; align-items:center; justify-content:center; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); margin-bottom: 4px; }
.ot b { font-size: 14px; }
.ot small { font-size: 12px; color: var(--dfm-sub); }
.ot.quiet { opacity: .55; }
.ot.att small { color: var(--dfm-red); font-weight: 600; }
.pchips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.pc { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px 2px 2px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); }
.pc .av { width: 18px; height: 18px; font-size: 10px; box-shadow: none; }
.pc.home .av { box-shadow: 0 0 0 1.5px #4caf50; }
.bars { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.bar1 { display: grid; grid-template-columns: 1fr auto; font-size: 11px; gap: 2px 6px; }
.bar1 i { grid-column: 1 / 3; height: 4px; border-radius: 2px; background: var(--c); }
/* sheets: overlay controls */
.sheet h3.sh .x { margin-left: auto; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; background: var(--dfm-card); }
.scenes { display: flex; flex-wrap: wrap; gap: 8px; }
.scb { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px; background: var(--dfm-card); font-size: 13px; font-weight: 600; }
.scb ha-icon { --mdc-icon-size: 18px; color: var(--dfm-amber); }
.rcard { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 18px; background: color-mix(in srgb, var(--dfm-card) 60%, transparent); }
.rch { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.rmaster { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 4px 0 10px; border-radius: 999px; background: var(--dfm-card); font-size: 12px; font-weight: 700; }
.rmaster i { width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 30%, transparent); position: relative; }
.rmaster i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .2s; }
.rmaster.on i { background: #e8b923; } .rmaster.on i::after { left: 16px; }
.big { font-size: 30px; font-weight: 700; padding: 4px 4px 8px; }
.big small { display: block; font-size: 12px; font-weight: 500; color: var(--dfm-sub); }
.rti { width: 38px; height: 38px; border-radius: 12px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-acc) 14%, transparent); color: var(--dfm-acc); margin-bottom: 4px; }
.rt ha-icon { --mdc-icon-size: 22px; }
.rt .bds { display:flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.rt.on .rti { color: #c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rt.att { box-shadow: inset 0 0 0 1.5px var(--dfm-red); }
.rt.att .rti { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.rt b { font-size: 16px; font-weight: 700; }
.pt b, .cam b { font-size: 13.5px; font-weight:600; }
.rt small, .pt small { font-size: 11.5px; color: var(--dfm-sub); line-height:1.3; }
.pt { align-items:center; text-align:center; width: 96px; }
.cam { width: 180px; padding: 0 0 10px; overflow:hidden; }
.cam img { width:100%; aspect-ratio: 16/9; object-fit: cover; display:block; background:#000; }
.cam b { padding: 6px 10px 0; }
.cam small { padding: 0 10px; font-size: 12px; color: var(--dfm-sub); }
.cam .noimg { width:100%; aspect-ratio: 16/9; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 15%, transparent); color: var(--dfm-sub); }
.av { width:44px; height:44px; flex:none; border-radius:50%; background: color-mix(in srgb, var(--dfm-sub) 20%, var(--dfm-card)); display:flex; align-items:center; justify-content:center; font-weight:700; overflow:hidden; box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px transparent; }
.av.home { box-shadow: 0 0 0 2px var(--dfm-card), 0 0 0 3.5px #4caf50; }
.av img { width:100%; height:100%; object-fit:cover; }
.list, section { display:flex; flex-direction:column; gap:8px; }
.row, .srow { display:flex; align-items:center; gap:12px; padding: 11px 12px; border-radius: 16px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); min-height: 44px; width: 100%; box-sizing: border-box; }
/* #68: device rows are flat (no box, no icon tile): the icon's colour says the state; a short highlight on press. */
.row { background: transparent; box-shadow: none; border-radius: 12px; padding: 7px 6px; min-height: 40px; transition: background .15s; }
.row:active { background: color-mix(in srgb, var(--dfm-fg) 8%, transparent); }
.row.att { box-shadow: none; }
.row.att .nm .t { color: var(--dfm-red); }
.tile, .rtile { width:38px; height:38px; flex:none; border-radius: 11px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); color: var(--dfm-sub); }
.row .tile { width: 30px; height: 30px; background: none !important; --mdc-icon-size: 24px; }
.row .tile.s-on { color: #e8b923; }
.row .tile.s-open, .row .tile.s-alarm { color: var(--dfm-red); }
.row .tile.s-warm { color: #e5853b; }
.row .tile.s-cool { color: #3b9ad9; }
.row .tile.s-act { color: var(--dfm-acc); }
.row .sub .ago { color: var(--dfm-sub); }
.rtile.on { color:#c99a00; background: color-mix(in srgb, #f6c445 22%, transparent); }
.rtile.att { color: var(--dfm-red); background: color-mix(in srgb, var(--dfm-red) 14%, transparent); }
.txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.nm { font-size: 14px; font-weight: 600; display:flex; align-items:center; gap:6px; flex-wrap: wrap; }
.txt .sub { font-size: 12px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd { font-size: 11px; font-weight:700; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 14%, transparent); color: var(--dfm-sub); }
.bd.red { background: color-mix(in srgb, var(--dfm-red) 15%, transparent); color: var(--dfm-red); }
.bd.amber { background: color-mix(in srgb, var(--dfm-amber) 22%, transparent); color: #9a6b00; }
.val { font-size: 13.5px; color: var(--dfm-sub); font-variant-numeric: tabular-nums; }
.chev { color: var(--dfm-sub); --mdc-icon-size: 20px; }
.sw { }
button.sw { width: 46px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-sub) 28%, transparent); position:relative; flex:none; transition: background .2s; }
button.sw i { position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left .2s; }
button.sw.on { background: #e8b923; }
button.sw.on i { left: 21px; }
.bri { width: 100%; margin: 6px 0 0; accent-color: #e8b923; height: 18px; }
.none { color: var(--dfm-sub); font-size: 14px; padding: 6px 4px; }
.link { color: var(--dfm-acc); font-size: 13.5px; padding: 6px 2px; }
.search { display:flex; align-items:center; gap:8px; padding: 0 12px; border-radius: 14px; background: var(--dfm-card); box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 6px; }
.search input { flex:1; border:0; outline:0; background:none; font: inherit; font-size: 15px; padding: 11px 0; color: inherit; }
/* #34: the bar is its own layer, fixed to the bottom of the screen, with the page fading under it */
.barwrap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; padding: 28px 0 max(12px, env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--dfm-g2) 40%, color-mix(in srgb, var(--dfm-g2) 0%, transparent)); pointer-events: none; }
.bar { display:flex; align-items:center; justify-content:center; gap: 10px; margin: 0 auto; width: max-content; pointer-events: auto; }
.pill2 { height: 48px; display:flex; align-items:center; border-radius: 999px; background: color-mix(in srgb, var(--dfm-card) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.16); }
.pill2 .ph { height: 48px; padding: 0 14px 0 18px; display:flex; align-items:center; gap: 8px; font-weight: 650; font-size: 15px; }
.pill2 .pl { height: 48px; padding: 0 16px 0 12px; display:flex; align-items:center; }
.pill2 .on { color: var(--dfm-acc); }
.pill2 .sep { width: 1px; height: 24px; background: var(--dfm-div); }
.pill2 .up { --mdc-icon-size: 18px; }
.tb { width:48px; height:48px; border-radius:50%; background: color-mix(in srgb, var(--dfm-card) 92%, transparent); box-shadow: 0 4px 16px rgba(0,0,0,.14); display:flex; align-items:center; justify-content:center; }
.tb.on { color: var(--dfm-acc); }
.scrim { position: fixed; inset: 0; z-index: 8; background: rgba(0,0,0,.25); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9; max-height: 78vh; overflow-y: auto; background: var(--dfm-sheet); border-radius: 22px 22px 0 0; padding: 8px 14px calc(18px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:8px; box-shadow: 0 -6px 30px rgba(0,0,0,.18); }
.sheet .grab { width: 38px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--dfm-sub) 40%, transparent); margin: 2px auto 6px; }
.sheet h3 { display:flex; align-items:center; gap: 10px; margin: 4px 2px; font-size: 17px; }
.sheet h3 .bk { width:34px; height:34px; font-size: 19px; }
.fthumb { width: 56px; height: 40px; flex:none; border-radius: 8px; overflow:hidden; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); display:flex; align-items:center; justify-content:center; }
.fthumb img { width:100%; height:100%; object-fit: contain; }
/* landscape: one surface, the plan on the left 2/3, the overlays on the right */
.land { position: relative; display:flex; height: calc(100dvh - var(--dfm-top, 56px)); background: transparent; overflow: hidden; } /* #108: one colour with HA's page, edge to edge */
.left { position: relative; flex: 0 0 66%; height: 100%; }
.left { touch-action: none; }
[data-swipe] { touch-action: pan-y; }
.left[data-swipe], .left { touch-action: none; }
/* #81 / #83: no fade; the Floorplan card fills the screen (its plan fitted, its overlay rail on the right). */
.left.full { flex: 1 1 100%; }
.lplan { position:absolute; inset: 6px 0 6px 6px; }
.lplan device-floorplan-card { display:block; height: 100%; }
.lmenu { flex:none; width: 34px; height: 34px; border-radius: 50%; display:flex; align-items:center; justify-content:center; color: var(--dfm-fg); }
.row, .srow, .one { flex-shrink: 0; }
.nm { flex-wrap: nowrap; min-width: 0; }
.nm .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bd { flex: none; white-space: nowrap; }
.float { position:absolute; z-index: 3; transition: opacity .5s; text-shadow: 0 1px 6px var(--dfm-bg), 0 0 2px var(--dfm-bg); }
.float.gone { opacity: 0; pointer-events: none; }
/* #102: while the phone turns, the old layout is not shown stretched (a very short fade). */
.dfm { transition: opacity .12s; }
.dfm.turning { opacity: 0; transition: none; }
/* #92-11: in landscape the ‹ back stays; only the big title fades */
.float.hdr.chip.gone { opacity: 1; pointer-events: auto; padding-bottom: 6px; }
.float.hdr.chip.gone .h1 { font-size: 17px; }
.float.hdr.chip.gone .sub { display: none; }
.float.hdr { top: 10px; left: 16px; }
/* #80: the title on a soft chip, readable on any plan */
.float.hdr.chip { display:flex; align-items:flex-start; gap: 8px; padding: 6px 12px 7px; border-radius: 16px; background: color-mix(in srgb, var(--dfm-g1) 72%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 2px 10px rgba(0,0,0,.12); text-shadow: none; max-width: 45%; }
.float.hdr.chip .lmenu { position: static; width: 34px; height: 34px; flex: none; }
/* #64 / #85: section links, appliances, the Navigator, Control, the camera view */
.seeall { margin-left: auto; display:inline-flex; align-items:center; gap: 2px; padding: 5px 6px 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--dfm-acc); background: color-mix(in srgb, var(--dfm-acc) 10%, transparent); }
.seeall + .gt { margin-left: 6px; }
.seeall ha-icon { --mdc-icon-size: 18px; }
.apt { flex: none; width: 150px; display:flex; flex-direction:column; align-items:flex-start; gap: 2px; padding: 12px; border-radius: 18px; background: var(--dfm-card); box-shadow: 0 1px 4px rgba(0,0,0,.07); text-align:left; }
.gridw .apt { width: auto; }
.apt .api { width: 54px; height: 54px; border-radius: 16px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--dfm-sub) 12%, transparent); color: var(--dfm-sub); margin-bottom: 8px; --mdc-icon-size: 30px; overflow: hidden; }
.apt .api img { width: 100%; height: 100%; object-fit: contain; }
.apt .api.ring { background: conic-gradient(#26a69a calc(var(--p) * 1%), color-mix(in srgb, var(--dfm-sub) 14%, transparent) 0); padding: 4px; box-sizing: border-box; }
.apt .api.ring > * { border-radius: 12px; background: var(--dfm-card); width: 100%; height: 100%; display:flex; align-items:center; justify-content:center; }
.apt.run .api { color: #26a69a; }
.apt.done .api { color: #4caf50; }
.apt.att .api { color: var(--dfm-amber); }
.apt b { font-size: 14px; }
.apt small { color: var(--dfm-sub); font-size: 12px; line-height: 1.3; }
.apt.run small { color: #26a69a; }
.apbig { margin: 6px auto 4px; width: 132px; height: 132px; border-radius: 28px; display:flex; align-items:center; justify-content:center; position: relative; background: color-mix(in srgb, var(--dfm-sub) 10%, transparent); --mdc-icon-size: 64px; color: var(--dfm-sub); overflow: hidden; }
.apbig img { width: 100%; height: 100%; object-fit: contain; }
.apbig.run { color: #26a69a; box-shadow: inset 0 0 0 4px color-mix(in srgb, #26a69a 50%, transparent); }
.apbig b { position: absolute; bottom: 8px; right: 10px; font-size: 13px; color: #26a69a; }
.center { text-align: center; margin-bottom: 8px; }
.drow { display:flex; align-items:center; gap: 10px; width: 100%; padding: 9px 6px; font-size: 14px; text-align: left; }
.drow + .drow { box-shadow: inset 0 1px 0 var(--dfm-div); }
.drow ha-icon { --mdc-icon-size: 20px; color: var(--dfm-sub); }
.drow span { flex: 1; color: var(--dfm-sub); }
.drow b { font-weight: 600; }
.nfloor { display:flex; align-items:center; gap: 8px; width: 100%; padding: 14px 4px 6px; font-weight: 700; font-size: 15px; color: var(--dfm-fg); }
.nfloor small { color: var(--dfm-sub); font-weight: 500; font-size: 12px; margin-left: auto; }
.nfloor ha-icon { --mdc-icon-size: 18px; color: var(--dfm-sub); }
.srow.cur, .nfloor.cur { box-shadow: inset 3px 0 0 var(--dfm-acc), 0 1px 3px rgba(0,0,0,.06); }
.srow .bell { display:inline-flex; align-items:center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dfm-red) 14%, transparent); color: var(--dfm-red); --mdc-icon-size: 16px; font-size: 12px; }
.ctlgrid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ctlgrid .ot { width: auto; min-width: 0; }
.pill2 .pt { max-width: 34vw; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl .pt { margin-left: 6px; font-weight: 600; }
.rcard.gcard { margin: 0 0 10px; }
.rcard.gcard .rch { cursor: pointer; }
.rcard.gcard .rch .gs { margin-left: auto; color: var(--dfm-sub); font-size: 13px; font-weight: 500; }
.rcard.gcard .rch .rmaster { margin-left: 8px; }
.rcard.gcard .rch .go { margin-left: 6px; color: var(--dfm-sub); --mdc-icon-size: 20px; }
.rcard.gcard.folded { padding-bottom: 6px; }
.oneroom .sh1 { display:flex; align-items:center; gap: 10px; font-size: 17px; margin: 6px 0 10px; }
.float.hdr .bk { width:auto; height:auto; border-radius: 0; background:none; box-shadow:none; font-size: 14px; color: var(--dfm-acc); }
.float.hdr .h1 { font-size: 24px; }
.float.sw { bottom: 12px; left: 16px; background: color-mix(in srgb, var(--dfm-card) 80%, transparent); border-radius: 999px; padding: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.1); text-shadow:none; color: var(--dfm-fg); font-weight: 600; }
.float.sw button { width:30px; height:30px; }
.float.hint { bottom: 14px; left: 16px; font-size: 13px; color: var(--dfm-sub); }
.house { position:absolute; inset: 0; perspective: 1800px; overflow: hidden; }
.house ~ .float.hdr.chip { padding: 5px 12px 6px; border-radius: 12px; }
.house ~ .float.hdr.chip .h1 { font-size: 17px; }
.house ~ .float.hdr.chip .sub { font-size: 12px; }
.stage { position:absolute; left: 44%; top: 54%; transform-style: preserve-3d; transform: translate(-50%, -50%) rotateX(var(--ph)) rotateZ(calc(-1 * var(--th))); }
.lvl { position:absolute; inset: 0; display:flex; justify-content:center; transform-style: preserve-3d; pointer-events: none; }
.plane { position:relative; height: 100%; display:block; pointer-events: auto; border-radius: 4px; background: var(--dfm-card); box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 18px 30px -12px rgba(0,0,0,.35); overflow: visible; }
.plane img { width:100%; height:100%; display:block; object-fit: fill; border-radius: 4px; }
.plane svg { position:absolute; inset:0; width:100%; height:100%; }
.plane .lit { fill: #f6c445; fill-opacity: .5; }
.plane .att { fill: var(--dfm-red); fill-opacity: .45; }
.plane .pres { fill: var(--dfm-acc); fill-opacity: .25; }
.hav { position:absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; overflow:hidden; background: var(--dfm-acc); color:#fff; font-size: 11px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 0 2px #fff; }
.hav img { width:100%; height:100%; object-fit: cover; }
.hl { position:absolute; right: 12px; transform: translateY(-50%); display:flex; flex-direction:column; align-items:flex-end; gap: 1px; font-size: 13.5px; background: color-mix(in srgb, var(--dfm-card) 88%, transparent); padding: 5px 11px; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.1); z-index: 2; text-align: right; }
.hl small { color: var(--dfm-sub); font-size: 12px; }
`;

if (!customElements.get("device-floorplan-mobile")) customElements.define("device-floorplan-mobile", DeviceFloorplanMobile);
if (!window.customCards.some((c) => c.type === "device-floorplan-mobile")) {
  window.customCards.push({ type: "device-floorplan-mobile", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), preview: false, documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}

/** Add dashboard → "Device Floorplan (mobile)": one panel view with the mobile card. */
class DeviceFloorplanMobileStrategy extends HTMLElement {
  static async generate(config = {}) {
    // #98 / #106: the dashboard's settings (Edit dashboard, or the Editor's "Create a new mobile dashboard") are
    // the card's settings.
    const card = { ...(config || {}), type: "custom:device-floorplan-mobile" };
    return { views: [{ title: dfT("mob.home"), path: "home", icon: "dfp:mobile", type: "panel", cards: [card] }] };
  }
}
/** #106: Edit dashboard → the mobile card's settings (the same form as its card editor), as Dwains does. */
class DeviceFloorplanMobileStrategyEditor extends HTMLElement {
  set hass(h) {
    this._hass = h;
    if (this._form) this._form.hass = h;
    else this._build();
  }

  setConfig(config) {
    this._cfg = { ...(config || {}) };
    if (this._form) this._form.data = this._cfg;
    else this._build();
  }

  async _build() {
    if (this._busy || !this._hass || !this._cfg) return;
    this._busy = true;
    const f = await DeviceFloorplanMobile.getConfigForm();
    const form = document.createElement("ha-form");
    Object.assign(form, { hass: this._hass, schema: f.schema, data: this._cfg, computeLabel: f.computeLabel, computeHelper: f.computeHelper });
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      this._cfg = { ...e.detail.value, type: this._cfg.type || "custom:device-floorplan-mobile" };
      form.data = this._cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._cfg }, bubbles: true, composed: true }));
    });
    this.appendChild(form);
    this._form = form;
  }
}
if (!customElements.get("device-floorplan-mobile-strategy-editor")) customElements.define("device-floorplan-mobile-strategy-editor", DeviceFloorplanMobileStrategyEditor);
DeviceFloorplanMobileStrategy.getConfigElement = async () => document.createElement("device-floorplan-mobile-strategy-editor");
if (!customElements.get("ll-strategy-dashboard-device-floorplan-mobile")) customElements.define("ll-strategy-dashboard-device-floorplan-mobile", DeviceFloorplanMobileStrategy);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((c) => c.type === "device-floorplan-mobile")) {
  window.customStrategies.push({ type: "device-floorplan-mobile", strategyType: "dashboard", name: dfT("mob.card_name"), description: dfT("mob.card_desc"), documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/mobile" });
}
