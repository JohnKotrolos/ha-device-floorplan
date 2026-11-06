import { startEditorTour } from "./editor-tour.js";
const tourRequested = new URLSearchParams(location.search).get("tour") === "editor";
const demoPage = new URL('./demo.html', import.meta.url).pathname;
import './ha-components.js';
import {DemoHome} from './ha-adapter.js';
import {clone,DEFAULT_CARD,AREA_NAMES} from './demo-data.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const home=new DemoHome();home.seedPrefs();
await import('./device_floorplan_static/device-floorplan-panel.js');
await import('./device_floorplan_static/device-floorplan-card.js');
let editor,currentView='editor',cardEls=[],configSig='',editing=false,toastT,detailEntity,detailDevice,cardForm,previewCard;
function toast(s){$('shell-toast').textContent=s;$('shell-toast').classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>$('shell-toast').classList.remove('show'),3200)}
function mountEditor(){if(editor){editor.remove();}editor=document.createElement('device-floorplan-panel');$('editor-view').append(editor);editor.hass=home.hass;}
function syncDashboard(){const configs=home.cards;const sig=JSON.stringify(configs);if(sig!==configSig){configSig=sig;cardEls=[];const box=$('dashboard-content');box.innerHTML='';if(!configs.length){box.innerHTML=`<div class="empty-dashboard"><ha-icon icon="dfp:floorplan-edit"></ha-icon><h2>Your floorplan starts in the Editor</h2><p>The integration is installed and a demo apartment is prepared. Explore the Editor, place the remaining devices, then choose <strong>I'm ready → Add to dashboard</strong>.</p><button class="ha-button primary" id="empty-open-editor">Open Floorplan Editor</button><p class="small-note">The Dashboard card will use the positions and settings you save there.</p></div>`;$('empty-open-editor').onclick=()=>showView('editor');}else configs.forEach((cfg,i)=>{let wrap=document.createElement('div');wrap.className='dash-card-wrap';let card=document.createElement('device-floorplan-card');card.setConfig(cfg);card._onOv=syncDockOverlay;card.hass=home.hass;let b=document.createElement('button');b.className='dash-card-edit';b.innerHTML='<ha-icon icon="mdi:pencil"></ha-icon>Edit card';b.onclick=()=>openCardEditor(i);wrap.append(card,b);box.append(wrap);cardEls.push(card)});}
 else cardEls.forEach(c=>c.hass=home.hass);$('edit-dashboard').disabled=!configs.length;if(editing)$('dashboard-content').classList.add('editing');syncDockOverlay();}
async function showView(v){if(currentView==='editor'&&v!=='editor')await editor?._flushSave();if(v==='dashboard'&&editor){editor.remove();editor=null;}if(v==='editor'&&!editor)mountEditor();currentView=v;if(v!=='dashboard')document.querySelectorAll('.dock-popover').forEach(el=>el.hidePopover());$('editor-view').hidden=v!=='editor';$('dashboard-view').hidden=v!=='dashboard';for(const b of document.querySelectorAll('[data-view]')){let active=b.dataset.view===v;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
 history.replaceState(null,'',v==='dashboard'?demoPage+'#dashboard':demoPage);if(v==='dashboard')syncDashboard();window.dispatchEvent(new Event('resize'));}
function applyTheme(t){document.documentElement.dataset.theme=t;home.dark=t==='dark';$('theme-select').value=t;try{localStorage.setItem('df-demo-theme',t)}catch{}home.emit();if(editor)editor.hass=home.hass;previewCard&&(previewCard.hass=home.hass);}
function setDashboardConfig(index,cfg){const original=home.cards[index];if(!original)return;for(const k of Object.keys(original))delete original[k];Object.assign(original,clone(cfg));home.emit()}
function openCardEditor(index){const cfg=home.cards[index];if(!cfg)return;const dialog=$('card-editor-dialog');$('card-editor-controls').innerHTML='';$('card-editor-preview').innerHTML='';cardForm=document.createElement('device-floorplan-card-editor');cardForm.hass=home.hass;cardForm.setConfig(cfg);previewCard=document.createElement('device-floorplan-card');previewCard.setConfig(cfg);previewCard.hass=home.hass;$('card-editor-controls').append(cardForm);$('card-editor-preview').append(previewCard);cardForm.addEventListener('config-changed',e=>{setDashboardConfig(index,e.detail.config);previewCard.setConfig(e.detail.config);previewCard.hass=home.hass});dialog.showModal()}
function closeCardEditor(){$('card-editor-dialog').close();cardForm=null;previewCard=null;syncDashboard()}
function showEntity(eid){if(!home.hass.states[eid])return;detailEntity=eid;detailDevice=null;renderEntity();if(!$('details-dialog').open)$('details-dialog').showModal()}
function renderEntity(){const s=home.hass.states[detailEntity];if(!s)return;let domain=detailEntity.split('.')[0],controls='';const button=(text,action)=>`<button class="ha-button" data-svc="${action}">${text}</button>`;
 if(['light','switch','fan'].includes(domain)){controls=button(s.state==='on'?'Turn off':'Turn on','toggle');if(domain==='light')controls+=`<label>Brightness <input id="detail-brightness" type="range" min="0" max="255" value="${s.attributes.brightness||0}"></label>`;}
 if(domain==='climate')controls=`<label>Mode <select id="detail-hvac">${(s.attributes.hvac_modes||[]).map(m=>`<option value="${m}" ${m===s.state?'selected':''}>${m.replaceAll('_',' ')}</option>`).join('')}</select></label><label>Target <input id="detail-target" type="number" min="16" max="30" step="0.5" value="${s.attributes.temperature}"> °C</label>`;
 if(domain==='cover')controls=button('Open','open_cover')+button('Stop','stop_cover')+button('Close','close_cover')+`<label>Position <input id="detail-cover" type="range" min="0" max="100" value="${s.attributes.current_position||0}"></label>`;
 if(domain==='media_player')controls=button(s.state==='playing'?'Pause':'Play',s.state==='playing'?'media_pause':'media_play');
 const attrs=Object.entries(s.attributes).filter(([k,v])=>!['friendly_name','icon','entity_picture'].includes(k)&&!Array.isArray(v)&&typeof v!=='object');
 $('details-content').innerHTML=`<div class="detail-header"><div><h2>${esc(s.attributes.friendly_name||detailEntity)}</h2><p>Home Assistant controls · simulated device</p></div><button class="icon-btn" id="close-details" aria-label="Close details"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="detail-state">${esc(home.formatState(s))}</div><div class="detail-controls">${controls}</div><table class="detail-table"><tbody><tr><td>Entity</td><td>${esc(detailEntity)}</td></tr>${attrs.map(([k,v])=>`<tr><td>${esc(k.replaceAll('_',' '))}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table><p class="detail-note">The Editor and floorplan card are the integration's real frontend. This device's Home Assistant data and controls are simulated for the demo.</p>`;
 $('close-details').onclick=()=>$('details-dialog').close();$('details-content').querySelectorAll('[data-svc]').forEach(b=>b.onclick=()=>home.callService(domain,b.dataset.svc,{entity_id:detailEntity}));
 if($('detail-hvac'))$('detail-hvac').onchange=e=>home.callService('climate','set_hvac_mode',{entity_id:detailEntity,hvac_mode:e.target.value});if($('detail-target'))$('detail-target').onchange=e=>home.callService('climate','set_temperature',{entity_id:detailEntity,temperature:Number(e.target.value)});if($('detail-brightness'))$('detail-brightness').onchange=e=>home.callService('light','turn_on',{entity_id:detailEntity,brightness:Number(e.target.value)});if($('detail-cover'))$('detail-cover').onchange=e=>home.callService('cover','set_cover_position',{entity_id:detailEntity,position:Number(e.target.value)});
}
function showDevice(id){const d=home.db.devices.find(d=>d.id===id);if(!d){toast('This is the simulated floorplan device.');return;}detailDevice=id;detailEntity=null;$('details-content').innerHTML=`<div class="detail-header"><div><h2>${esc(d.name)}</h2><p>${esc(d.manufacturer)} · ${esc(d.model)}</p></div><button id="close-details" class="icon-btn" aria-label="Close details"><ha-icon icon="mdi:close"></ha-icon></button></div><table class="detail-table"><tbody><tr><td>Area</td><td>${esc(d.area_name)}</td></tr><tr><td>Connection</td><td>${esc(d.conns.map(c=>c==='network'?'Wi-Fi':c==='zigbee'?'Zigbee':c).join(', '))}</td></tr>${d.ieee?`<tr><td>IEEE address</td><td>${d.ieee}</td></tr>`:''}</tbody></table><h3>Entities</h3>${d.entities.map(e=>`<button class="entity-link ha-button" data-eid="${e.entity_id}" style="display:flex;width:100%;justify-content:space-between;margin:6px 0"><span>${esc(e.name)}</span><span>${esc(home.formatState(home.hass.states[e.entity_id]))}</span></button>`).join('')}<p class="detail-note">Demo device registry · all states and controls are simulated in this browser.</p>`;$('close-details').onclick=()=>$('details-dialog').close();$('details-content').querySelectorAll('[data-eid]').forEach(b=>b.onclick=()=>showEntity(b.dataset.eid));if(!$('details-dialog').open)$('details-dialog').showModal();}
 $('demo-dishwasher').onchange=e=>{const v=e.target.value;home.db.states['sensor.dishwasher_status'].state=v;home.db.states['sensor.dishwasher_remaining'].state=v==='Finished'||v==='Off'?'0':v==='Drying'?'12':'46';home.db.states['binary_sensor.dishwasher_running'].state=['Finished','Off'].includes(v)?'off':'on';home.db.states['switch.dishwasher'].state=v==='Off'?'off':'on';home.db.states['sensor.dishwasher_power'].state=v==='Finished'||v==='Off'?'0':v==='Drying'?'180':'1240';home.emit()};
 $('demo-battery').onchange=e=>home.changeState('sensor.bedroom2_therm_battery',e.target.value);
 $('demo-desk-online').onchange=e=>{home.db.states['sensor.bedroom2_plug_power'].state=e.target.checked?'35':'unavailable';home.changeState('switch.bedroom2_plug',e.target.checked?'on':'unavailable')};
 $('demo-zigbee-online').onclick=async()=>{const on=home.hass.states['sensor.zigbee_router_state'].state==='unavailable';for(const d of home.db.devices.filter(d=>d.id==='zigbee_router'||d.via==='zigbee_router')){for(const ent of d.entities){let st=home.db.states[ent.entity_id];if(!on){st._before_offline=st.state;st.state='unavailable'}else if(st._before_offline!==undefined){st.state=st._before_offline;delete st._before_offline}}}home.emit();for(const c of cardEls){await c._loadZha?.(true);c._update?.(true)}toast(on?'Zigbee router and its devices reconnected.':'Zigbee router offline. Its child devices lose their route.')};
$('demo-leak').onchange=e=>home.changeState('binary_sensor.bath_leak',e.target.checked?'on':'off');
$('theme-select').onchange=e=>applyTheme(e.target.value);
$('collapse-sidebar').onclick=()=>{if(innerWidth<=1000)document.documentElement.classList.toggle('expanded-mobile');else document.documentElement.classList.toggle('collapsed');window.dispatchEvent(new Event('resize'))};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{showView(b.dataset.view);document.documentElement.classList.remove('expanded-mobile')};
$('edit-dashboard').onclick=()=>{editing=!editing;$('dashboard-content').classList.toggle('editing',editing);$('edit-dashboard').innerHTML=`<ha-icon icon="mdi:${editing?'check':'pencil'}"></ha-icon><span>${editing?'Done':'Edit dashboard'}</span>`;cardEls.forEach(c=>{c.editMode=editing;});};
$('close-card-editor').onclick=closeCardEditor;$('done-card-editor').onclick=closeCardEditor;
$('reset-demo').onclick=async()=>{await editor?._flushSave();home.reset();editing=false;$('dashboard-content').classList.remove('editing');$('edit-dashboard').innerHTML='<ha-icon icon="mdi:pencil"></ha-icon><span>Edit dashboard</span>';configSig='';mountEditor();await showView('editor');toast('Demo reset. The two unplaced devices are ready to try.');};
document.addEventListener('hass-more-info',e=>{e.stopPropagation();showEntity(e.detail.entityId)});
window.addEventListener('location-changed',()=>{let path=location.pathname;if(path.startsWith('/config/devices/device/')){let id=decodeURIComponent(path.split('/').at(-1));history.replaceState(null,'',currentView==='dashboard'?demoPage+'#dashboard':demoPage);showDevice(id)}else if(path.startsWith('/config/')){history.replaceState(null,'',demoPage);toast('Demo rooms and device areas are prepared. Use the Editor to explore them.')}else showView(path.startsWith('/device-floorplan')?'editor':'dashboard')});
window.addEventListener('popstate',()=>showView(location.hash==='#dashboard'?'dashboard':'editor'));
const dockLights = [1, 2, 3].map(i => 'light.living_bulb_' + i);
const dockSensors = {
  'dock-motion': 'binary_sensor.hall_motion',
  'dock-door': 'binary_sensor.entrance',
  'dock-window': 'binary_sensor.bedroom2_window',
  'dock-kitchen': 'light.kitchen_table'
};
function syncDockOverlay() {
  const overlay = cardEls[0]?._overlay;
  for (const control of document.querySelectorAll('[data-dock-overlay]')) {
    control.hidden = control.dataset.dockOverlay !== overlay;
    if (control.hidden && control.popoverTargetElement) control.popoverTargetElement.hidePopover();
  }
}
$('dock-ac').onchange = e => home.callService('climate', 'set_hvac_mode', {entity_id:'climate.living_ac', hvac_mode:e.target.value});
$('dock-temp-range').oninput = e => home.changeState('sensor.bedroom_therm_temperature', e.target.value);
$('dock-shutter-range').oninput = e => home.callService('cover', 'set_cover_position', {entity_id:'cover.bedroom2_shutter', position:Number(e.target.value)});
function syncSimulationDock(states) {
  $('demo-dishwasher').value = states['sensor.dishwasher_status'].state;
  $('demo-battery').value = states['sensor.bedroom2_therm_battery'].state;
  $('demo-desk-online').checked = states['switch.bedroom2_plug'].state !== 'unavailable';
  $('demo-leak').checked = states['binary_sensor.bath_leak'].state === 'on';
  const routerOnline = states['sensor.zigbee_router_state'].state !== 'unavailable';
  $('demo-zigbee-online').textContent = `Zigbee router · ${routerOnline ? 'Online' : 'Offline'}`;
  $('demo-zigbee-online').setAttribute('aria-pressed', String(routerOnline));
  const temperature = states['sensor.bedroom_therm_temperature'].state;
  const shutter = states['cover.bedroom2_shutter'].attributes.current_position;
  $('dock-ac').value = states['climate.living_ac'].state;
  $('dock-temp-range').value = temperature;
  $('dock-shutter-range').value = shutter;
  $('dock-temp-button').textContent = `Bedroom · ${temperature} °C`;
  $('dock-shutter-button').textContent = `Shutter & leak · ${shutter}%`;
  const night = states['sun.sun']?.state === 'below_horizon';
  $('dock-day').setAttribute('aria-pressed', String(!night));
  $('dock-night').setAttribute('aria-pressed', String(night));
  $('dock-lights').setAttribute('aria-pressed', String(dockLights.some(id => states[id]?.state === 'on')));
  for (const [button, entity] of Object.entries(dockSensors)) {
    const on = states[entity]?.state === 'on';
    $(button).setAttribute('aria-pressed', String(on));
    if (button === 'dock-door') $(button).textContent = `Front door · ${on ? 'Open' : 'Closed'}`;
    if (button === 'dock-window') $(button).textContent = `Bedroom 2 window · ${on ? 'Open' : 'Closed'}`;
  }
}
$('dock-day').onclick = () => home.changeState('sun.sun', 'above_horizon', {elevation: 35});
$('dock-night').onclick = () => home.changeState('sun.sun', 'below_horizon', {elevation: -20});
$('dock-lights').onclick = () => {
  const on = dockLights.some(id => home.hass.states[id]?.state === 'on');
  home.callService('homeassistant', on ? 'turn_off' : 'turn_on', {entity_id: dockLights});
};
for (const [button, entity] of Object.entries(dockSensors)) {
  $(button).onclick = () => home.changeState(entity, home.hass.states[entity]?.state === 'on' ? 'off' : 'on');
}
syncSimulationDock(home.hass.states);
home.subscribe(hass=>{syncSimulationDock(hass.states);if(editor)editor.hass=hass;if(currentView==='dashboard')syncDashboard();if(detailEntity&&$('details-dialog').open)renderEntity();if(cardForm)cardForm.hass=hass;if(previewCard)previewCard.hass=hass;});
// The intro can open a ready-to-use card without replacing an existing dashboard.
if (new URLSearchParams(location.search).get('demo') === 'live' && !home.cards.length) {
  const config = clone(home.db.dashboards['']);
  config.views.push({title:'Demo apartment', path:'demo-apartment', cards:[clone(DEFAULT_CARD)]});
  await home.callWS({type:'lovelace/config/save', config});
}
let theme='light';try{if(localStorage.getItem('df-demo-theme')==='dark')theme='dark'}catch{}applyTheme(theme);mountEditor();await showView(location.hash==='#dashboard'?'dashboard':'editor');

$('replay-editor-tour').onclick = async () => {
  await showView('editor');
  startEditorTour(home.hass);
};
if (tourRequested && currentView === 'editor') startEditorTour(home.hass);
