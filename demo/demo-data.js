export const STATIC=new URL('./device_floorplan_static', import.meta.url).pathname;
export const clone=x=>JSON.parse(JSON.stringify(x));
export const AREA_NAMES={kitchen:'Kitchen',living_room:'Living room',hallway:'Hallway',bathroom:'Bathroom',bedroom:'Bedroom',bedroom_2:'Bedroom 2'};
// Media remains visible as the TV screen glow; Live's round media marker is disabled.
export const LIVE_MARKER_KINDS=['lights','switches','covers','climate','motion','openings','locks','appliances','safety'];
// Rooms as drawn by hand (they overlap where rooms are open to each other): the Editor tour glues these.
export const DEMO_ROOM_SHAPES_ROUGH={
 kitchen:[[12.6,8.5],[42.1,8.5],[42.1,38],[45.8,38],[45.8,51.1],[12.6,51.1]],
 living_room:[[12.6,50.8],[45.8,50.8],[45.8,88.5],[12.6,88.5]],
 bathroom:[[44,8.5],[59.2,8.5],[59.2,39.2],[48,39.2],[48,35.4],[44,35.4]],
 hallway:[[47.6,38.6],[53.7,38.6],[53.7,41.6],[59.2,41.6],[59.2,44.7],[61.8,44.7],[61.8,53.4],[59.2,53.4],[59.2,60.7],[61.4,60.7],[61.4,70.8],[59.2,70.8],[59.2,88.7],[55.4,88.7],[55.4,95.9],[50,95.9],[50,88.7],[47.6,88.7],[47.6,56.6],[45,56.6],[45,45],[47.6,45]],
 bedroom:[[61.1,8.5],[94.9,8.5],[94.9,53.2],[61.1,53.2]],
 bedroom_2:[[61.1,55.8],[94.9,55.8],[94.9,88.7],[61.1,88.7]]
};
// The same rooms after Glue Rooms: neighbours meet on one line.
export const DEMO_ROOM_SHAPES={
 kitchen:[[12.6,8.5],[42.1,8.5],[42.1,38],[45.8,38],[45.8,50.95],[12.6,50.95]],
 living_room:[[12.6,50.95],[45.8,50.95],[45.8,88.5],[12.6,88.5]],
 bathroom:[[44,8.5],[59.2,8.5],[59.2,39.2],[48,39.2],[48,35.4],[44,35.4]],
 hallway:[[47.6,39.2],[53.7,39.2],[53.7,41.6],[59.2,41.6],[59.2,44.7],[61.1,44.7],[61.1,53.4],[59.2,53.4],[59.2,60.7],[61.1,60.7],[61.1,70.8],[59.2,70.8],[59.2,88.7],[55.4,88.7],[55.4,95.9],[50,95.9],[50,88.7],[47.6,88.7],[47.6,56.6],[45.8,56.6],[45.8,45],[47.6,45]],
 bedroom:[[61.1,8.5],[94.9,8.5],[94.9,53.2],[61.1,53.2]],
 bedroom_2:[[61.1,55.8],[94.9,55.8],[94.9,88.7],[61.1,88.7]]
};
export const DISHWASHER_LINE={type:'line',x1:17.6,y1:21.8,x2:17.6,y2:30};
export const TV_SCREEN={type:'screen',x1:44.5,y1:64,x2:44.5,y2:78,a:20,r:18};
export const DEFAULT_CARD={type:'custom:device-floorplan-card',plan:'demo_apartment',card_id:'demo-home',overlays:['live','lights','comfort','security','network','health','cleaning'],default_overlay:'live',buttons:{position:'top',style:'labels'},look:{chips:'auto',markers:'icon',names:'hover',size:36,show_title:false},rooms:{show_in:['comfort'],style:'label',size:'m'},live:{motion_as:'pulse',lights_as:'glow',show:LIVE_MARKER_KINDS},comfort:{humidity:true,heatmap:true,heatmap_opacity:32},network:{connections:['zigbee','network'],links:true,wifi_links:true,legend:true},health:{low:20,only_problems:false},night:{mode:'sun',strength:65,overlays:['live','lights'],style:'dim',shutters:true},lights:{all_on:true,all_off:true,brightness:true,scenes:[{name:'Evening',icon:'mdi:weather-night',lights:['light.living_bulb_1','light.living_bulb_2','light.living_bulb_3','light.bedroom_left','light.bedroom_right'],brightness:45}]},devices:{kitchen_plug:{hide_in:['live']},dishwasher:{per:{live:{lead:'sensor.dishwasher_status',extras:['sensor.dishwasher_remaining','sensor.dishwasher_power']}}}}};
const WALL_REFERENCES = [{ax:12.6,ay:8.5,bx:94.9,by:8.5,length:11.1,dir:'h'},{ax:12.6,ay:8.5,bx:12.6,by:88.5,length:6.4,dir:'v'}];
const TABLE_REFERENCES = [
 {ax:23.6,ay:30.7,bx:34.6,by:30.7,length:1.48,dir:'h'},
 {ax:23.6,ay:30.7,bx:23.6,by:41.45,length:0.86,dir:'v'}
];

export function makeInitial(){
 const states={},devices=[],positions={}; let counter=0;
 const state=(id,name,value,attrs={})=>(states[id]={entity_id:id,state:String(value),attributes:{friendly_name:name,...attrs},last_changed:new Date().toISOString(),last_updated:new Date().toISOString()});
 function add(id,name,area,conn,group,entities,xy,meta={}){
  const mains=Object.entries(entities);const d={id,name,area_id:area,area_name:AREA_NAMES[area],floor_id:'demo_floor',manufacturer:meta.manufacturer||'Demo home',model:meta.model||name,integration:conn==='zigbee'?'zha':(meta.manufacturer==='Shelly'?'shelly':meta.manufacturer==='TP-Link'?'tplink':meta.manufacturer==='Samsung'?'samsungtv':null),conns:[conn],group,virtual:false,physical:true,main_entity:mains[0][0],entities:[],merged:[],parts:[],via:meta.via||null,search:'',...meta};
  if(conn==='zigbee'){d.ieee='00:12:4b:00:de:00:'+String(++counter).padStart(2,'0')+':01';d.via=meta.role==='coordinator'?null:(meta.via||'zigbee_router');d.zha_role=meta.role||'EndDevice';d.lqi=meta.lqi||210;}
  for(const [eid,e] of mains){state(eid,e.name||name,e.state,e.attrs);d.entities.push({entity_id:eid,name:e.name||name,domain:eid.split('.')[0],device_class:e.attrs?.device_class||null,entity_category:e.category||null,disabled_by:null,hidden_by:null});}
  if(conn==='network'){const eid='sensor.'+id+'_wifi_signal';state(eid,name+' Wi-Fi signal',meta.rssi||-54,{device_class:'signal_strength',unit_of_measurement:'dBm'});d.entities.push({entity_id:eid,name:'Wi-Fi signal',domain:'sensor',device_class:'signal_strength',entity_category:'diagnostic'});const tr='device_tracker.'+id;state(tr,name,'home',{connected_to:'Demo Wi-Fi router',connection_type:meta.cable?'Ethernet':'Wi-Fi',ssid:'Demo home',ip:'192.168.10.'+(20+devices.length)});d.router=tr;}
  d.search=d.entities.map(e=>e.entity_id+' '+e.name).join(' ');devices.push(d);if(xy)positions[id]={x:xy[0],y:xy[1],approx:false};return d;
 }
 function thermo(id,name,area,xy,temp,hum=48,bat=87){add(id,name,area,'zigbee','sensors',{['sensor.'+id+'_temperature']:{state:temp,attrs:{device_class:'temperature',unit_of_measurement:'°C'}},['sensor.'+id+'_humidity']:{name:'Humidity',state:hum,attrs:{device_class:'humidity',unit_of_measurement:'%'}},['sensor.'+id+'_battery']:{name:'Battery',state:bat,attrs:{device_class:'battery',unit_of_measurement:'%'}}},xy,{manufacturer:'Aqara',model:'Temperature & humidity sensor',lqi:area==='bedroom_2'?128:212});}
 function lamp(id,name,area,xy,on=true,plug=false){add(id,name,area,'network','lights',{['light.'+id]:{state:on?'on':'off',attrs:{icon:'mdi:lightbulb',brightness:on?190:0,supported_color_modes:['color_temp'],color_mode:'color_temp',color_temp_kelvin:2900,min_color_temp_kelvin:2200,max_color_temp_kelvin:6500,supported_features:40}}},xy,{manufacturer:plug?'TP-Link':'Wi-Fi lighting',model:plug?'Smart plug · tabletop lamp':'Wi-Fi bulb'});positions[id].light={type:'bulb',r:plug?4.1:7,color:'k:2900'};}
 function contact(id,name,area,xy,type='window',open=false){add(id,name,area,'zigbee','contacts',{['binary_sensor.'+id]:{state:open?'on':'off',attrs:{device_class:type}},['sensor.'+id+'_battery']:{name:'Battery',state:92,attrs:{device_class:'battery',unit_of_measurement:'%'}}},xy,{manufacturer:'Aqara',model:'Door & window sensor'});}
 add('dishwasher','Dishwasher','kitchen','network','appliances',{'switch.dishwasher':{state:'on',attrs:{icon:'mdi:power'}},'sensor.dishwasher_status':{name:'Cycle status',state:'Washing',attrs:{icon:'mdi:dishwasher'}},'sensor.dishwasher_remaining':{name:'Time remaining',state:46,attrs:{unit_of_measurement:'min',icon:'mdi:timer-outline'}},'sensor.dishwasher_power':{name:'Power',state:1240,attrs:{device_class:'power',unit_of_measurement:'W'}},'binary_sensor.dishwasher_running':{name:'Running',state:'on',attrs:{device_class:'running'}}},[16.1,27.7],{manufacturer:'Demo appliances',model:'Power-monitored dishwasher'});positions.dishwasher.as='dishwasher';positions.dishwasher.light=clone(DISHWASHER_LINE);
 add('kitchen_plug','Kitchen power plug','kitchen','network','plugs_switches',{'switch.kitchen_plug':{state:'on',attrs:{icon:'mdi:power-socket-eu'}},'sensor.kitchen_plug_power':{name:'Power',state:42,attrs:{device_class:'power',unit_of_measurement:'W'}}},[41.5,20.8],{manufacturer:'TP-Link',model:'Wi-Fi smart plug'});
 thermo('kitchen_therm','Kitchen thermometer','kitchen',[43.7,34],23.6,52);
 add('kitchen_switch','Kitchen table light switch','kitchen','network','plugs_switches',{'light.kitchen_table':{name:'Kitchen table light',state:'on',attrs:{icon:'mdi:light-switch',brightness:210,supported_color_modes:['brightness'],supported_features:0}}},[46.7,43],{manufacturer:'Shelly',model:'Wi-Fi relay · light channel'});
 positions['entity:light.kitchen_table']={x:29.2,y:36.2,approx:false,of:'kitchen_switch',as:'light',light:{type:'bulb',r:6.7,color:'k:3000'}};
 for(let i=1;i<=3;i++)lamp('living_bulb_'+i,'Living room bulb '+i,'living_room',[31.1,65.1],i!==3);
 add('living_tv','Living room TV','living_room','network','media',{'media_player.living_tv':{state:'playing',attrs:{icon:'mdi:television',device_class:'tv',media_title:'A quiet evening',supported_features:2097152}}},[44.9,70.1],{manufacturer:'Samsung',model:'Smart TV'});positions.living_tv.light=clone(TV_SCREEN);
 add('living_ac','Living room AC','living_room','network','climate',{'climate.living_ac':{state:'cool',attrs:{icon:'mdi:air-conditioner',hvac_action:'cooling',current_temperature:24.8,temperature:22,humidity:49,hvac_modes:['off','cool','heat','dry','fan_only','auto'],min_temp:16,max_temp:30,target_temp_step:0.5,supported_features:385}}},[26.5,89.2],{manufacturer:'Demo climate',model:'Wi-Fi air conditioner'});positions.living_ac.air={x1:23,y1:88.8,x2:30,y2:88.8,a:270,r:16,s:40};
 thermo('living_therm','Living room thermometer','living_room',[14.6,85.1],22.8,49);
 contact('entrance','Entrance door','hallway',[52.1,94.5],'door',false);positions.entrance.opening={x1:49.8,y1:89.6,x2:55,y2:89.6};
 add('hall_motion','Hallway motion sensor','hallway','zigbee','motion',{'binary_sensor.hall_motion':{state:'on',attrs:{device_class:'motion'}},'sensor.hall_motion_battery':{name:'Battery',state:78,attrs:{device_class:'battery',unit_of_measurement:'%'}}},[52.7,64.2],{manufacturer:'Aqara',model:'Motion sensor'});
 add('bath_leak','Bathroom leak sensor','bathroom','zigbee','sensors',{'binary_sensor.bath_leak':{state:'off',attrs:{device_class:'moisture',icon:'mdi:water-alert-outline'}},'sensor.bath_leak_battery':{name:'Battery',state:94,attrs:{device_class:'battery',unit_of_measurement:'%'}}},[51.2,20.7],{manufacturer:'Aqara',model:'Water leak sensor'});
 lamp('bedroom_left','Bedroom bedside lamp · left','bedroom',[70.8,15],true,true);lamp('bedroom_right','Bedroom bedside lamp · right','bedroom',[90.2,15],false,true);
 thermo('bedroom_therm','Bedroom thermometer','bedroom',[87.4,50],24.9,54);
 contact('bedroom_window','Bedroom window','bedroom',[96.3,29.1],'window',true);positions.bedroom_window.opening={x1:96.6,y1:20.8,x2:96.6,y2:35.4};
 thermo('bedroom2_therm','Bedroom 2 thermometer','bedroom_2',[62.6,60.7],21.6,46,12);
 add('bedroom2_plug','Bedroom 2 desk plug','bedroom_2','network','plugs_switches',{'switch.bedroom2_plug':{state:'unavailable',attrs:{icon:'mdi:power-socket-eu'}},'sensor.bedroom2_plug_power':{name:'Power',state:'unavailable',attrs:{device_class:'power',unit_of_measurement:'W'}}},[76.9,61],{manufacturer:'TP-Link',model:'Wi-Fi smart plug'});
 lamp('bedroom2_lamp','Bedroom 2 bedside lamp','bedroom_2',[92.3,85.5],true,true);
 contact('bedroom2_window','Bedroom 2 window','bedroom_2',[96.1,68.5],'window',true);positions.bedroom2_window.opening={x1:96.6,y1:66.7,x2:96.6,y2:78.8};
 add('bedroom2_shutter','Bedroom 2 electric shutter','bedroom_2','network','covers',{'cover.bedroom2_shutter':{state:'open',attrs:{device_class:'shutter',icon:'mdi:window-shutter',current_position:45,supported_features:15}}},[96.1,68.5],{manufacturer:'Shelly',model:'Wi-Fi shutter controller'});positions.bedroom2_shutter.opening={link:'bedroom2_window',side:-1};
 add('zigbee_coordinator','Home Assistant · Zigbee coordinator','living_room','zigbee','network',{'sensor.zigbee_coordinator_state':{state:'Connected',attrs:{icon:'mdi:home-assistant'}}},[44.4,56.3],{manufacturer:'Home Assistant',model:'Zigbee coordinator',role:'coordinator'});
 add('zigbee_router','Zigbee router','living_room','zigbee','network',{'sensor.zigbee_router_state':{state:'Connected',attrs:{icon:'mdi:router-wireless'}},'sensor.zigbee_router_lqi':{state:244,attrs:{icon:'mdi:signal',unit_of_measurement:'lqi'}}},[44.4,61.5],{manufacturer:'SONOFF',model:'Zigbee router',role:'Router',via:'zigbee_coordinator',lqi:244});
 add('wifi_router','Demo Wi-Fi router','living_room','network','network',{'sensor.wifi_router_state':{state:'Connected',attrs:{icon:'mdi:router-wireless'}}},[44.4,82.9],{manufacturer:'Demo network',model:'Wi-Fi access point',cable:true});
 delete devices.find(d=>d.id==='wifi_router').router;
 thermo('hall_therm','Hallway thermometer','hallway',null,22.1,47);
 add('bath_switch','Bathroom light switch','bathroom','network','plugs_switches',{'light.bathroom_light':{name:'Bathroom ceiling light',state:'off',attrs:{icon:'mdi:light-switch',brightness:0,supported_color_modes:['onoff'],supported_features:0}}},null,{manufacturer:'Shelly',model:'Wi-Fi relay · light channel'});
 state('sun.sun','Sun','above_horizon',{elevation:35});
 const plan={id:'demo_apartment',name:'Demo apartment',kind:'floor',floor_id:'demo_floor',level:0,image_type:'top',image_url:STATIC+'/templates/apartment-two-bedroom.webp',image_fallback_url:null,image_source:'upload',width:1367,height:806,positions,anchors:{__energy_panel:{x:46,y:66},__energy_source:{x:57,y:56},kitchen:{x:30.5,y:22},living_room:{x:28,y:79},hallway:{x:53,y:72},bathroom:{x:52.2,y:31},bedroom:{x:79.4,y:48},bedroom_2:{x:79.3,y:77}},refs:clone(TABLE_REFERENCES),hidden_rooms:[],sort:0,bonds:{living_lights:['living_bulb_1','living_bulb_2','living_bulb_3']},bond_meta:{living_lights:{name:'Living room lights'}},phantoms:{open_plan_temperature:{name:'Kitchen & Living room',x:41.1,y:47.2,members:['kitchen_therm','living_therm'],value:'average',uses:{kitchen_therm:['sensor.kitchen_therm_temperature','sensor.kitchen_therm_humidity'],living_therm:['sensor.living_therm_temperature','sensor.living_therm_humidity']}}},anchors_centered:true,shapes:clone(DEMO_ROOM_SHAPES),device_id:'demo_plan_device',image_entity:'image.device_floorplan_demo_apartment',sensor_entity:'sensor.device_floorplan_demo_apartment'};
 return {revision:5,presentation_revision:8,states,devices,plans:[plan],skipped:[],seen:devices.map(d=>d.id),main_entity:{},device_opts:{},setup_done:true,dashboards:{'':{title:'Dashboard',views:[{title:'Home',path:'home',cards:[]}]}},dashboardList:[],events:[]};
}
export function buildPayload(plan,db){
 const px=p=>({x:p.x,y:p.y,px:p.x*plan.width/100,py:p.y*plan.height/100});const devices={},entities={},bonds={},phantoms={},areas={},zigbee_devices={};const byId=Object.fromEntries(db.devices.map(d=>[d.id,d]));
 const roles=ids=>{const r={};for(const id of ids){let dc=db.states[id]?.attributes.device_class;if(['temperature','humidity','battery','signal_strength','power','energy','illuminance'].includes(dc))r[dc==='signal_strength'?'signal':dc]??=id;}return r};
 for(const [id,p] of Object.entries(plan.positions)){
  if(id.startsWith('entity:')){let eid=id.slice(7);entities[eid]={name:p.label||db.states[eid]?.attributes.friendly_name||eid,...clone(p),...px(p),main_entity:eid,entities:[eid],roles:roles([eid])};continue;}
  const d=byId[id];if(!d)continue;let ids=d.entities.map(e=>e.entity_id);const split=Object.entries(plan.positions).filter(([k,q])=>k.startsWith('entity:')&&q.of===id).map(([k])=>k.slice(7));ids=ids.filter(e=>!split.includes(e));let main=db.main_entity[id]||d.main_entity;if(!ids.includes(main))main=ids[0]||null;
  devices[id]={name:p.label||d.name,area_id:d.area_id,...clone(p),...px(p),main_entity:main,entities:ids,roles:roles(ids),conns:d.conns,group:d.group,...(split.length?{split}:{}),...(d.ieee?{ieee:d.ieee}:{}),...(d.via?{via:d.via}:{}),...(d.router?{router:d.router}:{})};if(d.ieee)zigbee_devices[d.ieee]={x:p.x*plan.width/100,y:p.y*plan.height/100,name:d.name};
 }
 for(const [bid,all] of Object.entries(plan.bonds||{})){const mem=all.filter(id=>devices[id]);if(mem.length<2)continue;let f=devices[mem[0]],meta=plan.bond_meta?.[bid]||{};for(const id of mem)devices[id].bond=bid;bonds[bid]={...meta,members:mem,names:mem.map(id=>devices[id].name),entities:mem.map(id=>devices[id].main_entity).filter(Boolean),domain:(f.main_entity||'light.x').split('.')[0],...px(f)};}
 for(const [id,ph] of Object.entries(plan.phantoms||{})){let mem=(ph.members||[]).filter(x=>devices[x]);phantoms[id]={...clone(ph),...px(ph),members:mem,entities:[...new Set(mem.flatMap(m=>ph.uses?.[m]||devices[m].entities))]};}
 const energy_points={};for(const [id,p] of Object.entries(plan.anchors||{})){if(id.startsWith('__energy_')){energy_points[id.slice(9)]={x:p.x,y:p.y};continue;}if(!plan.hidden_rooms.includes(id))areas[id]={name:AREA_NAMES[id]||id,...px(p),...(plan.shapes?.[id]?{shape:plan.shapes[id]}:{})};}
 let scales={};for(const ref of plan.refs||[]){let len=Math.hypot((ref.bx-ref.ax)*plan.width/100,(ref.by-ref.ay)*plan.height/100);scales[ref.dir]=ref.length/len;}const sx=scales.h||scales.v||null,sy=scales.v||scales.h||null;
 return {plan_id:plan.id,plan_name:plan.name,kind:plan.kind,floor_id:plan.floor_id,level:plan.level,image_type:plan.image_type,image_url:plan.image_url,image_fallback_url:plan.image_fallback_url,image_width:plan.width,image_height:plan.height,metres_per_px_x:sx,metres_per_px_y:sy,real_width_m:sx?plan.width*sx:null,real_height_m:sy?plan.height*sy:null,approx_count:Object.values(devices).filter(d=>d.approx).length,devices,entities,bonds,phantoms,zigbee_devices,areas,energy_points,robots:clone(plan.robots||{}),cleaned:clone(plan.cleaned||{}),aps:devices.wifi_router?{'Demo Wi-Fi router':'wifi_router'}:{}};
}

// Upgrade existing browser demos without resetting placements, device states or dashboards.
export function migratePresentation(db){
 if(db.presentation_revision>=9)return false;
 const previousRevision=db.presentation_revision;
 db.presentation_revision=9;
 const p=db.plans.find(p=>p.id==='demo_apartment');
 // 0.11: the demo's Energy points (the card draws no flow lines without an electrical panel).
 if(p){p.anchors=p.anchors||{};p.anchors.__energy_panel=p.anchors.__energy_panel||{x:46,y:66};p.anchors.__energy_source=p.anchors.__energy_source||{x:57,y:56};}
 // 0.9: the demo rooms come glued (else the Editor waits for Glue Rooms before Place devices).
 if(p)for(const id of Object.keys(DEMO_ROOM_SHAPES))if(p.shapes?.[id])p.shapes[id]=clone(DEMO_ROOM_SHAPES[id]);
 if(previousRevision>=7)return true;
 if(p?.refs?.length===WALL_REFERENCES.length&&WALL_REFERENCES.every((ref,i)=>
  Object.entries(ref).every(([key,value])=>p.refs[i]?.[key]===value))){
  p.refs=clone(TABLE_REFERENCES);
 }
 if(previousRevision>=6)return true;
 const door=p?.positions?.entrance?.opening;
 if(door?.x1===49.8&&door.x2===55&&door.y1===93.2&&door.y2===93.2)door.y1=door.y2=89.6;
 if(previousRevision>=5)return true;
 const windowOpening=p?.positions?.bedroom2_window?.opening;
 const shutterOpening=p?.positions?.bedroom2_shutter?.opening;
 // A downward line rotates the negative transverse offset to the right.
 if(windowOpening?.x1===96.6&&windowOpening.x2===96.6&&
    windowOpening.y1===66.7&&windowOpening.y2===78.8&&!windowOpening.swap&&
    shutterOpening?.link==='bedroom2_window'&&shutterOpening.side===1&&
    Object.keys(shutterOpening).length===2){
  shutterOpening.side=-1;
 }
 if(previousRevision>=4)return true;
 if(p){
  p.shapes??={};
  for(const id of ['hallway','bathroom','bedroom_2','bedroom'])p.shapes[id]=clone(DEMO_ROOM_SHAPES[id]);
  if(p.positions.dishwasher)p.positions.dishwasher.light=clone(DISHWASHER_LINE);
  if(p.positions.living_tv)p.positions.living_tv.light=clone(TV_SCREEN);
 }
 function visit(x){
  if(!x||typeof x!=='object')return;
  if(x.type==='custom:device-floorplan-card'){
   x.buttons={...x.buttons,style:'labels'};
   x.live={...x.live,show:(x.live?.show||LIVE_MARKER_KINDS).filter(k=>k!=='media').concat('safety').filter((k,i,a)=>a.indexOf(k)===i)};
   delete x.live.kinds;
   x.devices??={};
   x.devices.kitchen_plug={...x.devices.kitchen_plug,hide_in:[...new Set([...(x.devices.kitchen_plug?.hide_in||[]),'live'])]};
  }
  for(const v of Object.values(x))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);
 }
 Object.values(db.dashboards).forEach(visit);
 return true;
}
