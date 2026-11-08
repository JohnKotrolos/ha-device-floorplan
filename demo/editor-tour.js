import { makeInitial, clone, AREA_NAMES, DEMO_ROOM_SHAPES_ROUGH } from './demo-data.js';

const lightEntity = 'light.bathroom_light';
const lightId = `entity:${lightEntity}`;
const switchPoint = {x:55, y:43};
const lightPoint = {x:52, y:23};
const near = (point, target, tolerance = 5) => Boolean(point &&
  Math.abs(point.x - target.x) <= tolerance && Math.abs(point.y - target.y) <= tolerance);
const hasReference = (work, ref) => work.refs.some(candidate =>
  candidate.dir === ref.dir && Math.abs(candidate.length - ref.length) < 0.005 &&
  ((near({x:candidate.ax,y:candidate.ay}, {x:ref.ax,y:ref.ay}, 3) &&
    near({x:candidate.bx,y:candidate.by}, {x:ref.bx,y:ref.by}, 3)) ||
   (near({x:candidate.bx,y:candidate.by}, {x:ref.ax,y:ref.ay}, 3) &&
    near({x:candidate.ax,y:candidate.ay}, {x:ref.bx,y:ref.by}, 3))));

function makeLessons(plan) {
  const [horizontal, vertical] = plan.refs;
  const dishwasher = plan.positions.dishwasher;
  const light = panel => panel.work.positions[lightId]?.light;
  return [
    [
      { title:'Give the floorplan a scale', copy:'A floorplan image has pixels. Two known lengths give the Editor a horizontal and vertical scale in metres. Use straight edges you can measure, such as the sides of this kitchen table.', watch:true, target:'[data-act="tool"][data-tool="measure"]' },
      { title:'Watch the long edge', copy:'Click the two ends of the long edge of the table, enter 1.48 m in Real length, then choose Set scale. The line on the plan shows the saved horizontal reference.', watch:true, refs:[horizontal], point:{x:horizontal.bx,y:horizontal.by} },
      { title:'Set the horizontal scale yourself', copy:'Click each end of the long edge nearest the top of the plan, starting at the blue dot. Type 1.48 in Real length and click Set scale. If you miss an end, use the × beside the measurement and try again.', reference:horizontal, ready:panel => hasReference(panel.work, horizontal) },
      { title:'Set the vertical scale', copy:'Starting at the blue dot, click the two ends of the short left edge of the table. Replace the estimated length with 0.86 m and choose Set scale. You should now see one reference for each direction.', reference:vertical, ready:panel => hasReference(panel.work, vertical) },
      { title:'Check both references', copy:'The two lines show 1.48 m horizontally and 0.86 m vertically. On your own plan, use lengths you measured in the room. The Editor now has a scale for sizing effects such as a light’s radius.', watch:true }
    ],
    [],
    [
      { title:'Place devices where they are', copy:'Room names stay visible in Place devices. Put each device where it actually sits so its marker and effects make sense on the plan. We’ll use the Kitchen dishwasher as an example.', watch:true, target:'[data-act="tool"][data-tool="place"]' },
      { title:'Place the Kitchen dishwasher', copy:'Select Dishwasher in the Kitchen group on the right, then click its location at the blue dot. You can also drag it from the list to that spot.', target:'[data-act="pick"][data-id="dishwasher"]', point:dishwasher, ready:panel => near(panel.work.positions.dishwasher, dishwasher) },
      { title:'Inspect the device you placed', copy:'Click the Dishwasher marker. The right panel shows the device and its entities. Click Next when those details are open.', target:'[data-mk="dishwasher"]', ready:panel => panel.s.sel === 'dishwasher' }
    ],
    [
      { title:'Find the physical switch', copy:'The Bathroom light switch is mounted on the hallway side of the wall. Its ceiling light is inside the bathroom. Start with the spot you would reach to press the switch.', watch:true, point:switchPoint },
      { title:'Place the switch by the door', copy:'Select Bathroom light switch in the Bathroom group, then click the blue dot beside the doorway. You can also drag it there from the list.', target:'[data-act="pick"][data-id="bath_switch"]', point:switchPoint, ready:panel => near(panel.work.positions.bath_switch, switchPoint, 3) }
    ],
    [
      { title:'Open the switch details', copy:'Click the Bathroom light switch marker on the plan. We’ll keep it by the door and give the light it controls a location of its own.', target:'[data-mk="bath_switch"]', ready:panel => panel.s.sel === 'bath_switch' },
      { title:'Open Split', copy:'In the switch details, choose “Split: it controls something elsewhere”. This reveals the entities you can place separately.', target:'[data-act="splitopen"]', ready:panel => panel.s.sel === 'bath_switch' && panel.s.splitOpen === 'bath_switch' },
      { title:'Place the ceiling light', copy:'Beside Bathroom ceiling light, choose “Place where it acts”. Then click the blue dot inside the bathroom. If you place it outside the room, move the light marker back inside.', target:`[data-act="splitplace"][data-id="${lightEntity}"]`, point:lightPoint, ready:panel => {
        const position = panel.work.positions[lightId];
        return position?.of === 'bath_switch' && near(position, lightPoint);
      } },
      { title:'Check the two locations', copy:'The switch stays beside the door. The ceiling light has its own marker inside the bathroom, where its glow will appear.', watch:true, point:lightPoint }
    ],
    [
      { title:'Choose the light shape', copy:'Select the Bathroom ceiling light marker. In Light on the plan, choose Bulb for a round pool of light.', target:`[data-mk="${lightId}"], [data-act="lighttype"][data-type="bulb"]`, ready:panel => light(panel)?.type === 'bulb' },
      { title:'Size the light pool', copy:'Set Radius to 1.2 m, then press Tab. Use the size that matches the fixture when you work on your own plan.', target:'#lightr', ready:panel => Math.abs((light(panel)?.r ?? 0) * panel._realW() / 100 - 1.2) < 0.03 },
      { title:'Choose a colour', copy:'Move the warm-to-cool slider or pick a custom colour. Auto is useful for smart lights that report their own colour.', target:'#lightk, #lighthex', ready:panel => Boolean(light(panel)?.color) },
      { title:'Preview the result at night', copy:'Click the moon button on the plan to preview the glow. Look for the light pool inside the bathroom and the switch marker beside the door.', target:'[data-act="nightprev"]', ready:panel => Boolean(panel.s.nightPrev) },
      { title:'Your bathroom light is ready', copy:'You measured the plan, traced room boundaries, placed devices, and previewed the glow from a separately placed light. Finish to return to the demo Editor. The practice copy closes when you finish.', watch:true }
    ]
  ];
}

const roomLesson = [
  ['Why draw room shapes?', 'Room shapes tell Device Floorplan where rooms begin and end so lighting and other overlays can follow their boundaries. Device Floorplan does not detect walls or draw room boundaries automatically. You need to draw a shape for every room.'],
  ['Place the Bedroom pin', 'In Mark rooms, choose Bedroom in the right panel and click inside the bedroom. The pin uses the name of the existing Home Assistant area.', '[data-act="pickroom"][data-id="bedroom"]'],
  ['Open Shape', 'Once the pin is on the plan, click Shape beside Bedroom. The Editor gives you a starter rectangle to fit by hand.', '[data-act="shapeedit"][data-id="bedroom"]'],
  ...['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner, i) => [
    `Move corner ${i + 1} of 4`,
    `Drag the ${corner} handle to the matching inside corner of the bedroom walls. The blue dot marks the wall corner.`,
    `[data-shc="${i}"]`
  ]),
  ['Finish the Bedroom shape', 'Click Done in the shape toolbox. For a room with a jog in the wall, use + on an edge to add a corner before finishing.', '[data-act="shapedone"]'],
  ['One room is ready', 'The Bedroom outline now follows its walls. That defines one room. Repeat the same process by hand for every remaining room on your floorplan.']
];
const roomPractice = 'In Mark rooms, select Living room and click inside it on the plan. Click Shape beside its name, then drag the four corners to match the room and click Done. You can practise other rooms here too. These edits are for practice only.';

export function startEditorTour(hass, editorView) {
  if (document.querySelector('.editor-tour')) return;
  const sample = makeInitial();
  const [plan] = sample.plans;
  const lessons = makeLessons(plan);
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
  panel._scheduleSave = () => {};
  const tourStyle = document.createElement('style');
  const editorHeight = '.app { height: 100%; }';
  panel._load = async () => {
    panel._applyState(sample);
    panel._applyDevices({devices:sample.devices, areas:Object.entries(AREA_NAMES).map(([area_id,name]) => ({area_id,name,floor_id:plan.floor_id})),floors:[{floor_id:plan.floor_id,name:plan.name}]});
    panel.s.planId = plan.id;
    panel.s.img[plan.image_url] = plan.image_url;
    panel.work = {};
    panel.shadowRoot.append(tourStyle);
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
  let stage = 0;
  let lessonFrame = 0;
  let pointFrame;
  const checkpoints = [];
  let placementCheck;
  let roomFrame = 0;
  let practiceFinished = false;
  const bedroom = 'bedroom';
  const living = 'living_room';
  const hasAdjustedLivingShape = () => {
    const points = panel.work?.shapes?.[living];
    return Boolean(panel.work?.anchors?.[living] && points?.length >= 3 &&
      JSON.stringify(points) !== JSON.stringify(panel._shapeRect(living)));
  };

  panel.shadowRoot.addEventListener('click', event => {
    if (stage !== 1 || roomFrame !== roomLesson.length ||
        panel.s.shapeEdit !== living || !event.target.closest('[data-act="shapedone"]')) return;
    practiceFinished = hasAdjustedLivingShape();
    if (!practiceFinished) {
      dialog.querySelector('#editor-tour-narration').textContent =
        'The Living room still has its starter rectangle. Open Shape again, drag the corners to the walls, then click Done.';
    }
  }, {capture:true});

  function showRoomFrame() {
    const practising = roomFrame === roomLesson.length;
    const gluing = roomFrame > roomLesson.length + 1;
    const example = roomFrame > roomLesson.length;
    const [title, copy, target] = practising
      ? ['Draw the Living room yourself', roomPractice]
      : gluing
        ? ['Glue the rooms together', 'Hand-drawn rooms overlap a little where they are open to each other. Click Glue Rooms in the top bar: overlapping rooms then meet on one line and the orange overlaps disappear, gaps stay walls. Check the result, then click Looks good (or Undo). Placing devices waits until the rooms are glued.', '[data-act="glue"], [data-act="glueok"]']
      : example
        ? ['Completed example · 6 rooms', 'This is how your floorplan will look once all rooms are drawn. Let adjacent room shapes overlap slightly where rooms connect through an open doorway or share an open-plan space. Leave a small gap where a wall separates them. This lets light and other room effects flow through openings and stop at walls. On your own plan, place a pin and fit a shape for each room before placing devices.']
        : roomLesson[roomFrame];
    dialog.querySelector('#editor-tour-progress').textContent = practising || gluing
      ? 'Step 2 of 6 · Your turn'
      : example ? 'Step 2 of 6 · Finished result'
      : `Step 2 of 6 · Watch me · ${roomFrame + 1} of ${roomLesson.length}`;
    dialog.querySelector('#editor-tour-title').textContent = title;
    button('next').textContent = practising ? 'View completed example' : gluing
      ? 'Continue to device placement →' : example
      ? 'Glue the rooms →' : roomFrame === roomLesson.length - 1
        ? 'Try it yourself →' : 'Next action →';
    panel.inert = !practising && !gluing;
    practiceFinished = false;

    narrate(copy);
    resetEditor('rooms', {
      refs: checkpoints[1].refs,
      anchors: example ? plan.anchors : {},
      shapes: example ? clone(DEMO_ROOM_SHAPES_ROUGH) : {}
    });
    if (!example && roomFrame >= 2) panel.work.anchors[bedroom] = clone(plan.anchors[bedroom]);
    if (!example && roomFrame >= 3) {
      const points = panel._shapeRect(bedroom);
      const moved = Math.min(roomFrame - 3, points.length);
      panel.work.shapes[bedroom] = points.map((point, i) =>
        i < moved ? clone(plan.shapes[bedroom][i]) : point);
      panel.s.shapeEdit = roomFrame <= 7 ? bedroom : null;
    }
    panel._render();

    highlight(target);
    const corner = roomFrame - 3;
    if (corner >= 0 && corner < 4) {
      const [x, y] = plan.shapes[bedroom][corner];
      pointAt({x,y});
    }
    if (gluing) {
      button('next').disabled = true;
      placementCheck = setInterval(() => {
        button('next').disabled = Boolean(!panel.work || panel._gluePending());
      }, 150);
    }
    if (practising) {
      button('next').disabled = true;
      placementCheck = setInterval(() => {
        button('next').disabled = !practiceFinished || !hasAdjustedLivingShape() || Boolean(panel.s.shapeEdit);
      }, 150);
    }
  }

  function narrate(copy) {
    dialog.querySelector('#editor-tour-narration').textContent = copy;
  }

  function highlight(target) {
    tourStyle.textContent = editorHeight + (target
      ? `\n${target} { outline: 3px solid #00a6ce; outline-offset: 2px; }` : '');
  }

  function pointAt(point) {
    cancelAnimationFrame(pointFrame);
    cursor.hidden = true;
    if (!point) return;
    pointFrame = requestAnimationFrame(() => {
      const image = panel.shadowRoot.querySelector('#planimg');
      if (!image) return;
      const rect = image.getBoundingClientRect();
      cursor.style.left = `${rect.left + rect.width * point.x / 100}px`;
      cursor.style.top = `${rect.top + rect.height * point.y / 100}px`;
      cursor.hidden = false;
    });
  }

  function resetEditor(tool, work = {}) {
    panel.work = clone({
      refs:[], anchors:{}, shapes:{}, positions:{},
      hidden_rooms:[], bonds:{}, bond_meta:{}, phantoms:{}, ...work
    });
    panel._undo = [];
    panel._redo = [];
    panel._setTool(tool);
    Object.assign(panel.s, {
      guide:false, loading:false, queue:false, shapeEdit:null, sel:null,
      placingBox:null, splitOpen:null, nightPrev:false, dialog:null,
      ask:false, lenInput:'', q:'', status:[], collapsed:{},
      layers:{refs:true,rooms:true,devices:true,roomshapes:true}
    });
    panel._render();
  }

  function showStage() {
    clearInterval(placementCheck);
    button('next').disabled = false;
    button('back').disabled = stage === 0 && lessonFrame === 0;
    highlight();
    pointAt();
    if (stage === 1) { showRoomFrame(); return; }

    const lesson = lessons[stage];
    const step = lesson[lessonFrame];
    const phase = step.watch ? (lessonFrame === lesson.length - 1 ? 'Check the result' : 'Watch me') : 'Your turn';
    dialog.querySelector('#editor-tour-progress').textContent =
      `Step ${stage + 1} of ${lessons.length} · ${phase} · ${lessonFrame + 1} of ${lesson.length}`;
    dialog.querySelector('#editor-tour-title').textContent = step.title;
    narrate(step.copy);
    panel.inert = Boolean(step.watch);

    if (stage === 0 && lessonFrame <= 2) {
      resetEditor('measure', {refs:step.refs || []});
    }
    highlight(step.target);
    pointAt(step.point);
    button('next').textContent = stage === lessons.length - 1 && lessonFrame === lesson.length - 1
      ? 'Finish' : lessonFrame === lesson.length - 1 ? 'Next step →' : 'Next action →';
    if (step.ready) {
      let lastCue;
      const update = () => {
        const ready = Boolean(panel.work && step.ready(panel));
        button('next').disabled = !ready;
        if (!step.reference) return;
        const cue = ready ? 'done' : panel.s.m2 ? 'length' : panel.s.m1 ? 'end' : 'start';
        if (cue === lastCue) return;
        lastCue = cue;
        const {ax, ay, bx, by, dir} = step.reference;
        pointAt(cue === 'start' ? {x:ax,y:ay} : cue === 'end' ? {x:bx,y:by} : null);
        highlight(cue === 'length' ? '#lenin, [data-act="setscale"]' : null);
        // Both table references share an endpoint. Let the second measurement
        // start there without grabbing the handle of the already saved line.
        if (dir === 'v' && !ready) {
          tourStyle.textContent += '\n.rh[data-rh], .reflbl[data-refl] { pointer-events: none; opacity: .45; }';
        }
      };
      update();
      placementCheck = setInterval(update, 150);
    }
  }

  function enterStage(index, atEnd = false) {
    stage = index;
    lessonFrame = atEnd ? lessons[stage].length - 1 : 0;
    roomFrame = atEnd ? roomLesson.length + 2 : 0;
    resetEditor(stage === 0 ? 'measure' : stage === 1 ? 'rooms' : 'place',
      atEnd ? checkpoints[stage + 1] : checkpoints[stage]);
    if (atEnd && stage === 2) panel.s.sel = 'dishwasher';
    showStage();
  }

  button('skip').onclick = stop;
  button('back').onclick = () => {
    if (stage === 1 && roomFrame > 0) { roomFrame--; showStage(); }
    else if (stage !== 1 && lessonFrame > 0) { lessonFrame--; showStage(); }
    else enterStage(stage - 1, true);
  };
  button('replay').onclick = () => enterStage(stage);
  button('next').onclick = () => {
    if (stage === 1 && roomFrame === roomLesson.length + 2 && (!panel.work || panel._gluePending())) return;
    if (stage === 1 && roomFrame <= roomLesson.length + 1) {
      if (roomFrame === roomLesson.length &&
          (!practiceFinished || !hasAdjustedLivingShape() || panel.s.shapeEdit)) return;
      roomFrame++;
      showStage();
      return;
    }
    if (stage !== 1) {
      const lesson = lessons[stage];
      if (lesson[lessonFrame].ready && (!panel.work || !lesson[lessonFrame].ready(panel))) return;
      if (lessonFrame < lesson.length - 1) {
        lessonFrame++;
        showStage();
        return;
      }
    }
    if (stage === lessons.length - 1) { stop(); return; }
    checkpoints[stage + 1] = clone(panel.work);
    enterStage(stage + 1);
  };
  function stop() {
    if (!dialog.isConnected) return;
    cancelAnimationFrame(pointFrame);
    clearInterval(placementCheck);
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
