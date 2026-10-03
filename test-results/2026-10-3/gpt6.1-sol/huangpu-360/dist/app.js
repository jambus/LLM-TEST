'use strict';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile=()=>matchMedia('(max-width: 720px)').matches;
const views=[
 {name:'杨浦大桥',description:'从斜拉桥出发，向城市的天际线靠近。',center:[121.539,31.257],zoom:14.2,bearing:210,pitch:58},
 {name:'外滩 · 陆家嘴',description:'一江两岸，百年外滩与摩天城市相望。',center:[121.496,31.239],zoom:14.45,bearing:58,pitch:58},
 {name:'南浦大桥',description:'江水转弯，越过连接浦东与浦西的桥。',center:[121.503,31.208],zoom:14.3,bearing:25,pitch:58},
 {name:'世博滨江',description:'沿着世博岸线，打开更宽阔的江面。',center:[121.488,31.183],zoom:14.2,bearing:55,pitch:56},
 {name:'徐汇西岸',description:'城市与江岸舒展，漫游抵达西岸。',center:[121.457,31.175],zoom:14.1,bearing:80,pitch:56}
];
let map,scene,dayStyle,ready=false,activeView=1,mode='day',dragMode='orbit',orbit=false,touring=false,tourElapsed=0,lastTime=0,raf=0,drag=null,lastMarkerUpdate=0;
let markers=[],routeMetrics=[],routeLength=0,tourAnchors=[],tileErrorCount=0,loadTimer;
const TOUR_DURATION=100000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const cameraView=i=>({...views[i],zoom:views[i].zoom-(isMobile()?.45:0)});
const uiControls=['zoom-in','zoom-out','pitch-up','pitch-down','compass','reset','drag-mode','orbit','tour'];
function enableControls(value){uiControls.forEach(id=>$(id).disabled=!value);document.querySelectorAll('[data-view]').forEach(b=>b.disabled=!value);}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),2500);}
function updateReadouts(){const b=(map.getBearing()+360)%360;$('bearing-value').textContent=Math.round(b)+'°';$('pitch-value').textContent=Math.round(map.getPitch())+'°';$('coordinate-value').textContent=map.getCenter().lat.toFixed(3)+'° N';$('compass-arrow').style.transform=`rotate(${-b}deg)`;}
function setActiveView(i){activeView=i;$('view-name').textContent=views[i].name;$('view-description').textContent=views[i].description;$('view-index').textContent=String(i+1).padStart(2,'0')+' / 05';document.querySelectorAll('[data-view]').forEach(b=>{const active=Number(b.dataset.view)===i;b.classList.toggle('active',active);if(active){b.setAttribute('aria-current','true');if(isMobile())b.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduced?'instant':'smooth'});}else b.removeAttribute('aria-current')});}
function stopOrbit(){orbit=false;$('orbit').setAttribute('aria-pressed','false');}
function stopTour(announce=false){if(!touring)return;touring=false;$('tour').setAttribute('aria-pressed','false');$('tour-text').textContent='继续巡游';$('tour-icon').textContent='▷';map.setLayoutProperty('river-route','visibility','none');if(announce)toast('已暂停巡游，可以自由调整视角');}
function stopAutomation(){stopOrbit();stopTour(true);map.stop();}
function selectView(i){if(!ready)return;stopAutomation();tourElapsed=0;$('tour-text').textContent='开启巡游';$('tour-progress').style.width='0%';setActiveView(i);$('landmark-card').hidden=true;map.flyTo({...cameraView(i),duration:reduced?0:2200,essential:!reduced});}
function applyMode(value){if(!['day','night'].includes(value))throw Error('无效的昼夜模式');mode=value;document.body.dataset.mode=value;$('day').classList.toggle('selected',value==='day');$('night').classList.toggle('selected',value==='night');$('day').setAttribute('aria-pressed',String(value==='day'));$('night').setAttribute('aria-pressed',String(value==='night'));document.querySelector('meta[name="theme-color"]').content=value==='day'?'#e5edef':'#0c1421';if(!ready)return;
 const night=value==='night';
 for(const layer of dayStyle.layers){const p=layer.paint||{};
  if(layer.type==='background')map.setPaintProperty(layer.id,'background-color',night?'#121f30':p['background-color']);
  if(layer.type==='fill')map.setPaintProperty(layer.id,'fill-color',night?(layer.id==='water'?'#0b263c':layer.id.includes('park')||layer.id.includes('wood')||layer.id.includes('grass')?'#193d42':'#1c2c40'):p['fill-color']);
  if(layer.type==='line')map.setPaintProperty(layer.id,'line-color',night?(layer.id.includes('waterway')?'#0b263c':layer.id.includes('casing')?'#2b3c4b':layer.id.includes('motorway')||layer.id.includes('trunk')?'#b28f64':'#53605e'):p['line-color']);
  if(layer.type==='fill-extrusion')map.setPaintProperty(layer.id,'fill-extrusion-color',night?['interpolate',['linear'],['coalesce',['get','render_height'],10],0,'#34495c',80,'#4b687b',250,'#507b91',600,'#658b9c']:p['fill-extrusion-color']);
 }
 map.setPaintProperty('landmark-models','fill-extrusion-color',['get',value]);map.setLayoutProperty('night-illumination','visibility',night?'visible':'none');
 map.setLight(night?{anchor:'viewport',color:'#b0c9ee',intensity:.6,position:[1.5,205,45]}:dayStyle.light);
 map.setSky(night?{'sky-color':'#07101f','horizon-color':'#24344e','fog-color':'#1a2b44','fog-ground-blend':.65,'horizon-fog-blend':.75,'sky-horizon-blend':.7}:dayStyle.sky);
}
function showLandmark(item){$('landmark-name').textContent=item.name;$('landmark-height').textContent=item.height+' m';$('landmark-note').textContent='公开总高度 · 三维外形使用 OSM 建筑分部轮廓和高度标签，部分细节为估算。';$('landmark-source').href=item.source;$('landmark-card').hidden=false;}
function addScene(){
 // Replace only the footprints fully inside the four OSM building outlines.
 map.setFilter('building-3d',['!', ['within',scene.exclude]]);
 map.addSource('landmark-data',{type:'geojson',data:scene.models});
 map.addLayer({id:'landmark-models',type:'fill-extrusion',source:'landmark-data',minzoom:12,paint:{'fill-extrusion-color':['get','day'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1}});
 map.addSource('illumination',{type:'geojson',data:scene.lights});
 map.addLayer({id:'night-illumination',type:'fill-extrusion',source:'illumination',minzoom:13.4,layout:{visibility:'none'},paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':false}});
 map.addSource('river-line',{type:'geojson',data:scene.route});
 map.addLayer({id:'river-route',type:'line',source:'river-line',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#dfad77','line-width':2,'line-opacity':.7,'line-dasharray':[2,4]}});
 for(const item of scene.landmarks){let element=document.createElement('button');element.className='landmark-label';element.setAttribute('aria-label',item.name+'，高度 '+item.height+' 米，查看详情');element.append(document.createTextNode(item.name));const height=document.createElement('span');height.textContent=item.height+'m';element.append(height);element.onclick=e=>{e.stopPropagation();showLandmark(item)};const marker=new maplibregl.Marker({element,anchor:'bottom',offset:[0,-5]}).setLngLat(item.center).addTo(map);markers.push({marker,item,element});}
 map.on('click','landmark-models',e=>{const item=scene.landmarks.find(l=>l.name===e.features[0]?.properties.name);if(item)showLandmark(item)});
 // Hide labels when zoomed out; screen-space collision handling keeps them readable.
 map.on('move',()=>{const now=performance.now();if(now-lastMarkerUpdate<60)return;lastMarkerUpdate=now;updateMarkers();});updateMarkers();
 prepareRoute();
}
function updateMarkers(){const boxes=[];for(const m of markers){const p=map.project(m.item.center),w=isMobile()?94:170,h=30;const b={left:p.x-w/2,right:p.x+w/2,top:p.y-h,bottom:p.y};const hide=map.getZoom()<13.3||p.x<80||p.x>innerWidth-80||p.y<80||p.y>innerHeight-170||boxes.some(x=>b.left<x.right+5&&b.right>x.left-5&&b.top<x.bottom+8&&b.bottom>x.top-8);m.element.style.visibility=hide?'hidden':'visible';if(!hide)boxes.push(b);}}
function distance(a,b){return Math.hypot((b[0]-a[0])*Math.cos((a[1]+b[1])*Math.PI/360),b[1]-a[1]);}
function prepareRoute(){const coords=scene.route.geometry.coordinates;routeMetrics=[0];for(let i=1;i<coords.length;i++)routeMetrics.push(routeMetrics[i-1]+distance(coords[i-1],coords[i]));routeLength=routeMetrics.at(-1);tourAnchors=views.map(v=>{let index=0,best=Infinity;coords.forEach((c,i)=>{let d=distance(c,v.center);if(d<best){index=i;best=d}});return routeMetrics[index]/routeLength;});}
function routePoint(t){const d=t*routeLength;let i=1;while(i<routeMetrics.length-1&&routeMetrics[i]<d)i++;const f=(d-routeMetrics[i-1])/(routeMetrics[i]-routeMetrics[i-1]||1),coords=scene.route.geometry.coordinates;return [0,1].map(k=>coords[i-1][k]+(coords[i][k]-coords[i-1][k])*f);}
function startTour(){if(!ready)return;stopOrbit();map.stop();$('landmark-card').hidden=true;if(tourElapsed>=TOUR_DURATION)tourElapsed=0;if(!tourElapsed)tourElapsed=(activeView===4?0:tourAnchors[activeView])*TOUR_DURATION;touring=true;$('tour').setAttribute('aria-pressed','true');$('tour-text').textContent='暂停巡游';$('tour-icon').textContent='Ⅱ';map.setLayoutProperty('river-route','visibility','visible');lastTime=0;ensureAnimation();}
function ensureAnimation(){if(!raf)raf=requestAnimationFrame(animate);}
function animate(time){raf=0;const delta=lastTime?Math.min(100,time-lastTime):0;lastTime=time;
 if(document.hidden){lastTime=0;return;}
 if(orbit)map.jumpTo({bearing:map.getBearing()+delta*.007});
 if(touring){tourElapsed=Math.min(TOUR_DURATION,tourElapsed+delta);const t=tourElapsed/TOUR_DURATION,center=routePoint(t);let nearest=0,best=1;for(let i=0;i<tourAnchors.length;i++){const d=Math.abs(t-tourAnchors[i]);if(d<best){nearest=i;best=d}}if(nearest!==activeView)setActiveView(nearest);map.jumpTo({center,zoom:14.2-(isMobile()?.45:0),pitch:58,bearing:55+20*Math.sin(t*Math.PI*2)});$('tour-progress').style.width=t*100+'%';if(t>=1){stopTour();$('tour-text').textContent='重新巡游';setActiveView(4);toast('已抵达徐汇西岸');}}
 if(orbit||touring)ensureAnimation();
}
function bindDrag(){const canvas=map.getCanvas();map.dragPan.disable();map.touchPitch.enable();canvas.style.cursor='grab';const activePointers=new Set();
 canvas.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);if(!ready||e.button!==0||dragMode!=='orbit'||activePointers.size!==1){drag=null;return;}stopAutomation();drag={id:e.pointerId,x:e.clientX,y:e.clientY,bearing:map.getBearing(),pitch:map.getPitch()};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||activePointers.size!==1)return;map.jumpTo({bearing:drag.bearing-(e.clientX-drag.x)*.24,pitch:clamp(drag.pitch+(e.clientY-drag.y)*.15,0,80)});});
 const end=e=>{activePointers.delete(e.pointerId);if(drag?.id===e.pointerId)drag=null;canvas.style.cursor='grab';};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
 canvas.addEventListener('wheel',()=>stopAutomation(),{passive:true});canvas.addEventListener('touchstart',e=>{if(e.touches.length>1){drag=null;stopAutomation();}},{passive:true});map.on('dragstart',()=>stopAutomation());map.on('rotatestart',e=>{if(e.originalEvent)stopAutomation()});map.on('pitchstart',e=>{if(e.originalEvent)stopAutomation()});map.on('zoomstart',e=>{if(e.originalEvent)stopAutomation()});canvas.addEventListener('keydown',()=>stopAutomation());
}
function registerWebMCP(){const context=document.modelContext;if(!context?.registerTool)return;const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});
 const tools=[{name:'set_huangpu_mode',title:'切换黄浦江昼夜',description:'切换可见三维场景为白天或模拟夜景。',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['day','night']}},required:['mode'],additionalProperties:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='mode')||!['day','night'].includes(input.mode))throw Error('mode 必须是 day 或 night');applyMode(input.mode);return {mode};}},
 {name:'navigate_huangpu_viewpoint',title:'前往沿江观景点',description:'前往杨浦大桥、外滩陆家嘴、南浦大桥、世博滨江或徐汇西岸。会停止自动环绕与巡游。',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0,maximum:4}},required:['index'],additionalProperties:false},execute:async input=>{if(!input||Object.keys(input).some(k=>k!=='index')||!Number.isInteger(input.index)||input.index<0||input.index>4)throw Error('index 必须是 0–4 的整数');if(!ready)throw Error('地图还未加载');selectView(input.index);if(map.isMoving())await new Promise(resolve=>map.once('moveend',resolve));return {viewpoint:views[activeView].name,index:activeView};}}];
 for(const tool of tools)try{Promise.resolve(context.registerTool({...tool,annotations:{readOnlyHint:false,untrustedContentHint:false}},{signal:life.signal})).catch(console.warn)}catch(e){console.warn(e)}
}
async function init(){enableControls(false);try{if(!window.maplibregl)throw Error('地图引擎未加载');const fetchJSON=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+' 加载失败');return r.json()};[dayStyle,scene]=await Promise.all([fetchJSON('map-style.json'),fetchJSON('scene-data.json')]);
 map=new maplibregl.Map({container:'map',style:dayStyle,...cameraView(1),maxPitch:80,minZoom:11,maxZoom:18.5,maxBounds:[[121.37,31.10],[121.65,31.34]],attributionControl:{compact:true},canvasContextAttributes:{antialias:true},fadeDuration:150});
 loadTimer=setTimeout(()=>{if(!ready){$('loading').hidden=true;$('error').hidden=false;}},22000);
 map.on('load',()=>{try{addScene();bindDrag();ready=true;clearTimeout(loadTimer);$('loading').hidden=true;$('error').hidden=true;enableControls(true);applyMode(mode);updateReadouts();setActiveView(1);registerWebMCP();}catch(e){showError(e)}});
 map.on('move',()=>{updateReadouts();if(!touring){const nearest=views.reduce((best,v,i)=>distance(v.center,map.getCenter().toArray())<distance(views[best].center,map.getCenter().toArray())?i:best,0);if(nearest!==activeView)setActiveView(nearest)}});
 map.on('error',e=>{console.warn('Map source:',e.error?.message);tileErrorCount++;if(ready&&tileErrorCount===5)toast('部分地图数据未加载，请检查网络');});
}catch(e){showError(e)}}
function showError(e){clearTimeout(loadTimer);ready=false;enableControls(false);$('loading').hidden=true;$('error').hidden=false;console.error(e)}
$('day').onclick=()=>applyMode('day');$('night').onclick=()=>applyMode('night');$('retry').onclick=()=>location.reload();
$('info').onclick=$('data-link').onclick=()=>{$('data-dialog').showModal()};$('close-dialog').onclick=$('understood').onclick=()=>$('data-dialog').close();$('data-dialog').addEventListener('click',e=>{if(e.target===$('data-dialog')){const r=$('data-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('data-dialog').close()}});$('close-landmark').onclick=()=>$('landmark-card').hidden=true;
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('当前浏览器不支持全屏')}catch(e){toast('当前浏览器不支持全屏')}};
$('zoom-in').onclick=()=>{stopAutomation();map.zoomIn({duration:reduced?0:400})};$('zoom-out').onclick=()=>{stopAutomation();map.zoomOut({duration:reduced?0:400})};
$('pitch-up').onclick=()=>{stopAutomation();map.easeTo({pitch:clamp(map.getPitch()+10,0,80),duration:reduced?0:400})};$('pitch-down').onclick=()=>{stopAutomation();map.easeTo({pitch:clamp(map.getPitch()-10,0,80),duration:reduced?0:400})};
$('compass').onclick=()=>{stopAutomation();map.resetNorth({duration:reduced?0:700})};$('reset').onclick=()=>selectView(1);
$('orbit').onclick=()=>{if(orbit){stopOrbit();return;}stopTour();map.stop();orbit=true;$('orbit').setAttribute('aria-pressed','true');lastTime=0;ensureAnimation()};
$('tour').onclick=()=>touring?stopTour():startTour();
$('drag-mode').onclick=()=>{stopAutomation();drag=null;dragMode=dragMode==='orbit'?'pan':'orbit';$('drag-mode').setAttribute('aria-pressed',String(dragMode==='orbit'));$('drag-mode').querySelector('span').textContent=dragMode==='orbit'?'环视操控':'平移操控';if(dragMode==='pan')map.dragPan.enable();else map.dragPan.disable();$('gesture-text').textContent=dragMode==='orbit'?(isMobile()?'单指环视 · 双指缩放与俯仰':'拖动环视 · 滚轮缩放 · 右键俯仰'):(isMobile()?'单指平移 · 双指旋转与缩放':'拖动平移 · 滚轮缩放 · 右键环视');};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>selectView(Number(b.dataset.view)));
document.addEventListener('visibilitychange',()=>{lastTime=0;if(!document.hidden&&(orbit||touring))ensureAnimation()});
window.addEventListener('resize',()=>{if(ready){map.resize();updateMarkers();}});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);clearTimeout(loadTimer);});
if(isMobile())$('gesture-text').textContent='单指环视 · 双指缩放与俯仰';
init();
