import { makeInitial, clone, AREA_NAMES } from './demo-data.js';

const stages = [
  { tool: 'measure', title: 'Measure the kitchen table', frames: [
    [0, 'Start with an object of known size. Pick the two ends of the long edge.', 'measuring'],
    [2200, 'The horizontal edge measures 1.48 m.', 'horizontal'],
    [4900, 'Measure the short edge too. The 0.86 m reference sets the vertical scale.', 'vertical']
  ]},
  { tool: 'rooms', title: 'Mark rooms and draw their boundaries', frames: [
    [0, 'Kitchen is in the room list on the right. Start by placing its room pin.'],
    [2400, 'The Kitchen pin is on the plan. Choose Shape to define its boundary.', 'pin'],
    [5000, 'Trace the Kitchen outline. The shape tells the integration where the room ends.', 'shape'],
    [8200, 'The other rooms have now been marked and outlined too.', 'rooms']
  ]},
  { tool: 'place', title: 'Place a device and inspect it', frames: [
    [0, 'The Editor switches to device placement. The filled room boundaries disappear, and the room names remain.'],
    [2500, 'Place the dishwasher at its actual location in the Kitchen.', 'dishwasher'],
    [5200, 'Select the dishwasher marker to open its details in the right panel.', 'selected']
  ]},
  { tool: 'place', title: 'Try the Editor yourself', frames: [
    [0, 'The sample layout is ready. Try placing the Hallway thermometer or Bathroom light switch in the Editor.', 'finish']
  ]}
];

export function startEditorTour(hass, editorView) {
  if (document.querySelector('.editor-tour')) return;
  const sample = makeInitial();
  const [plan] = sample.plans;
  const dialog = document.createElement('section');
  dialog.className = 'editor-tour';
  dialog.setAttribute('aria-labelledby', 'editor-tour-title');
  dialog.innerHTML = `
    <header><small id="editor-tour-progress"></small><h2 id="editor-tour-title"></h2>
      <p id="editor-tour-narration" aria-live="polite"></p></header>
    <footer><button class="ha-button" data-action="skip">Skip tour</button><div>
      <button class="ha-button" data-action="back">Back</button>
      <button class="ha-button" data-action="replay">Replay step</button>
      <button class="ha-button primary" data-action="next"></button>
    </div></footer>`;

  // Render the actual Editor with a disposable snapshot and no live service calls.
  const panel = document.createElement('device-floorplan-panel');
  panel._showIntro = () => {};
  panel._onKey = () => {};
  panel._load = async () => {
    panel._applyState(sample);
    panel._applyDevices({devices:sample.devices, areas:Object.entries(AREA_NAMES).map(([area_id,name]) => ({area_id,name,floor_id:plan.floor_id})),floors:[{floor_id:plan.floor_id,name:plan.name}]});
    panel.s.planId = plan.id;
    panel.work = {};
    const style = document.createElement("style");
    style.textContent = ".app { height: 100%; }";
    panel.shadowRoot.append(style);
    showStage();
  };
  const original = editorView.querySelector('device-floorplan-panel');
  original.hidden = true;
  panel.classList.add('tour-preview');
  panel.inert = true;
  editorView.classList.add('editor-touring');
  editorView.append(panel, dialog);
  const cursor = document.createElement('span');
  cursor.className = 'tour-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  editorView.append(cursor);
  const button = name => dialog.querySelector(`[data-action="${name}"]`);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stage = 0;
  let timers = [];

  function applyFrame(tool, copy, frame) {
    dialog.querySelector('#editor-tour-narration').textContent = copy;
    const complete = frame === 'finish';
    const allRooms = stage >= 2 || frame === 'rooms';
    const kitchen = frame === 'pin' || frame === 'shape';
    const dishwasher = frame === 'dishwasher' || frame === 'selected';
    Object.assign(panel.work, {
      refs: clone(stage > 0 || frame === 'vertical' ? plan.refs : frame === 'horizontal' ? plan.refs.slice(0,1) : []),
      anchors: clone(allRooms ? plan.anchors : kitchen ? {kitchen:plan.anchors.kitchen} : {}),
      shapes: clone(allRooms ? plan.shapes : frame === 'shape' ? {kitchen:plan.shapes.kitchen} : {}),
      positions: clone(complete ? plan.positions : dishwasher ? {dishwasher:plan.positions.dishwasher} : {}),
      hidden_rooms: [], bonds: complete ? clone(plan.bonds) : {},
      bond_meta: complete ? clone(plan.bond_meta) : {}, phantoms: complete ? clone(plan.phantoms) : {}
    });
    Object.assign(panel.s, {
      tool, guide:false, loading:false, shapeEdit:frame === 'shape' ? 'kitchen' : null,
      m1:frame === "measuring" ? {x:plan.refs[0].ax,y:plan.refs[0].ay} : null,
      mh:frame === "measuring" ? {x:plan.refs[0].bx,y:plan.refs[0].by} : null,
      sel:frame === 'selected' ? 'dishwasher' : null,
      layers:{refs:true,rooms:true,devices:true,roomshapes:true}
    });
    panel._render();
    const targets = {
      measuring: {x:plan.refs[0].ax,y:plan.refs[0].ay},
      horizontal: {x:plan.refs[0].bx,y:plan.refs[0].by},
      vertical: {x:plan.refs[1].bx,y:plan.refs[1].by},
      pin: plan.anchors.kitchen,
      shape: {x:plan.shapes.kitchen[0][0],y:plan.shapes.kitchen[0][1]},
      dishwasher: plan.positions.dishwasher,
      selected: plan.positions.dishwasher
    };
    const point = targets[frame];
    if (reducedMotion || !point) { cursor.hidden = true; return; }
    requestAnimationFrame(() => {
      const image = panel.shadowRoot.querySelector('#planimg');
      if (!image || !cursor.isConnected) return;
      const rect = image.getBoundingClientRect();
      cursor.style.left = `${rect.left + rect.width * point.x / 100}px`;
      cursor.style.top = `${rect.top + rect.height * point.y / 100}px`;
      cursor.hidden = false;
    });
  }

  function showStage() {
    timers.forEach(clearTimeout);
    timers = [];
    const {tool,title,frames} = stages[stage];
    dialog.querySelector('#editor-tour-progress').textContent = `Floorplan Editor tour · ${stage + 1} of ${stages.length}`;
    dialog.querySelector('#editor-tour-title').textContent = title;
    button('back').disabled = stage === 0;
    button('next').textContent = stage === stages.length - 1 ? 'Open Editor' : 'Next →';
    if (reducedMotion) {
      const [,copy,frame] = frames.at(-1);
      applyFrame(tool,frames.map(([,message])=>message).join(' '),frame);
      return;
    }
    for (const [delay,copy,frame] of frames) {
      if (delay) timers.push(setTimeout(() => applyFrame(tool,copy,frame),delay));
      else applyFrame(tool,copy,frame);
    }
  }

  button('skip').onclick = stop;
  button('back').onclick = () => { stage--; showStage(); button('next').focus(); };
  button('replay').onclick = showStage;
  button('next').onclick = () => {
    if (stage === stages.length - 1) stop();
    else { stage++; showStage(); }
  };
  function stop() {
    if (!dialog.isConnected) return;
    timers.forEach(clearTimeout);
    panel.remove();
    cursor.remove();
    dialog.remove();
    editorView.classList.remove('editor-touring');
    original.hidden = false;
    window.dispatchEvent(new Event('resize'));
  }
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') stop();
  });
  panel.hass = {...hass, callWS: async () => ({})};
  button('next').focus();
  return stop;
}
