import { makeInitial, AREA_NAMES } from './demo-data.js';

const steps = [
  ['Measure', 'Set the scale', 'Measure an object you know. Here, the kitchen table is 1.48 m long and 0.86 m wide. Two references set the horizontal and vertical scale.'],
  ['Mark rooms', 'Give each room a place', 'Drag Kitchen from the room list onto the plan. Then trace its outline so Device Floorplan knows where the room begins and ends.'],
  ['Place devices', 'Put devices where they belong', 'Drag the dishwasher onto its real location, then select its marker to see the device details.'],
  ['Finish', 'Try it yourself', 'In the Editor, try placing the Hallway thermometer or Bathroom light switch. Your own changes are saved in this browser.']
];

function drawPlan(plan, stage) {
  const refs = stage === 0 ? plan.refs.map(({ax,ay,bx,by,length}, i) =>
    `<g class="tour-reveal" style="--delay:${i * 400}ms"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><circle cx="${ax}" cy="${ay}" r=".55"/><circle cx="${bx}" cy="${by}" r=".55"/><text x="${(ax+bx)/2+(i?3:0)}" y="${(ay+by)/2+(i?0:-2)}">${length.toFixed(2)} m</text></g>`).join('') : '';
  const rooms = stage >= 1 ? Object.entries(plan.shapes).map(([id, shape]) =>
    `<polygon class="tour-reveal" style="--delay:${stage !== 1 ? 0 : id === 'kitchen' ? 600 : 1750}ms" points="${shape.map(p=>p.join(',')).join(' ')}"/>`).join('') : '';
  const anchors = stage >= 1 ? Object.entries(plan.anchors).map(([id, {x,y}]) =>
    `<text class="tour-reveal" style="--delay:${stage !== 1 ? 0 : id === 'kitchen' ? 600 : 1750}ms" x="${x}" y="${y}">${AREA_NAMES[id]}</text>`).join('') : '';
  const devices = stage >= 2 ? Object.entries(plan.positions).filter(([,p]) => Number.isFinite(p.x) && Number.isFinite(p.y)).map(([id,p]) =>
    `<circle class="tour-device tour-reveal ${id === 'dishwasher' ? 'tour-selected' : ''}" style="--delay:${stage === 3 ? 0 : id === 'dishwasher' ? 600 : 1750}ms" cx="${p.x}" cy="${p.y}" r=".75"/>`).join('') : '';
  return refs + rooms + anchors + devices;
}

export function startEditorTour() {
  if (document.querySelector('.editor-tour')) return;
  const {plans:[plan]} = makeInitial();
  const dialog = document.createElement('dialog');
  dialog.className = 'editor-tour';
  dialog.setAttribute('aria-labelledby','editor-tour-title');
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  let stage = 0;

  function render() {
    const [label, title, copy] = steps[stage];
    const drag = stage === 1 ? plan.anchors.kitchen : stage === 2 ? plan.positions.dishwasher : null;
    dialog.innerHTML = `
      <header><small>Floorplan Editor tour · ${stage + 1} of ${steps.length}</small>
      <h2 id="editor-tour-title">${title}</h2><p>${copy}</p></header>
      <div class="tour-steps">${steps.map(([name], i)=>`<span ${i===stage?'aria-current="step"':''}>${i+1}. ${name}</span>`).join('')}</div>
      <div class="tour-body">
        <div class="tour-plan">
          <img src="${plan.image_url}" alt="Demo apartment floorplan">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${drawPlan(plan, stage)}</svg>
          ${drag ? `<span class="tour-drag" aria-hidden="true" style="--x:${drag.x}%;--y:${drag.y}%">${stage === 1 ? 'Kitchen' : 'Dishwasher'}</span>` : ''}
        </div>
        <aside><strong>${label}</strong>
          ${stage===0?'<p>Horizontal · 1.48 m</p><p>Vertical · 0.86 m</p>':
            stage===1?'<p>Kitchen</p><p>Living room</p><p>Hallway</p><p>Bedrooms</p>':
            stage===2?'<div class="tour-reveal" style="--delay:850ms"><p><b>Dishwasher</b></p><p>Kitchen · Wi-Fi</p><p>Power switch<br>Cycle status</p></div>':
            '<p>Hallway thermometer</p><p>Bathroom light switch</p>'}
        </aside>
      </div>
      <footer><button class="ha-button" data-action="skip">Skip tour</button><div>
        ${stage ? '<button class="ha-button" data-action="back">Back</button>' : ''}
        <button class="ha-button primary" data-action="next">${stage===3?'Open Editor':'Next →'}</button>
      </div></footer>`;
    dialog.querySelector('[data-action="skip"]').onclick = () => dialog.close();
    dialog.querySelector('[data-action="next"]').onclick = () => {
      if (stage === 3) dialog.close();
      else { stage++; render(); }
    };
    const back = dialog.querySelector('[data-action="back"]');
    if (back) back.onclick = () => { stage--; render(); };
    if (dialog.open) dialog.querySelector('[data-action="next"]').focus();
  }
  render();
  dialog.showModal();
  dialog.querySelector('[data-action="next"]').focus();
}
