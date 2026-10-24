let map, markerA, markerB, line, measureLine, measureDestinationMarker, measureDestination = null, pendingDestination = null, pressTimer = null, pressStart = null;
const R=6371000, el=id=>document.getElementById(id);
const latA=el('latA'),lonA=el('lonA'),latB=el('latB'),lonB=el('lonB'),okBtn=el('okBtn'),useLocBtn=el('useLocBtn'),swapBtn=el('swapBtn');
const errMsg=el('errMsg'),mapDiv=el('map'),mapWrap=el('map-wrap'),results=el('results'),rDist=el('rDist'),rBear=el('rBear'),rElev=el('rElev'),netDot=el('netDot'),netText=el('netText'),elevNote=el('elevNote'),elevPill=el('elevPill'),destinationAction=el('destinationAction'),clearMeasureBtn=el('clearMeasureBtn'),centerCursor=el('centerCursor');
const mainLayout=el('mainLayout'),calcScreen=el('calcScreen'),openCalcBtn=el('openCalcBtn'),backMapBtn=el('backMapBtn'),calcOkBtn=el('calcOkBtn');
const calcDistance=el('calcDistance'),calcElevation=el('calcElevation'),calcBearing=el('calcBearing'),calcType=el('calcType'),calcNumber=el('calcNumber'),calcOutput=el('calcOutput'),outAdjusted=el('outAdjusted'),outAngle=el('outAngle'),outMapAngle=el('outMapAngle'),outTable=el('outTable'),outTableDetail=el('outTableDetail'),calcError=el('calcError');
function updateNetStatus(){const online=navigator.onLine;netDot.classList.toggle('on',online);netText.textContent=online?'متصل — يمكن تحميل الخرائط والارتفاعات':'بدون إنترنت — المناطق المحمّلة مسبقًا فقط'}
window.addEventListener('online',updateNetStatus);window.addEventListener('offline',updateNetStatus);updateNetStatus();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
const toRad=d=>d*Math.PI/180,toDeg=r=>r*180/Math.PI;
function distance(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dp=toRad(b.lat-a.lat),dl=toRad(b.lng-a.lng),x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearing(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dl=toRad(b.lng-a.lng),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(toDeg(Math.atan2(y,x))+360)%360}
function coordText(p){return`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`}
function cacheKey(lat,lon){return`elev_${lat.toFixed(5)}_${lon.toFixed(5)}`}
async function elevation(lat,lon){try{const key=cacheKey(lat,lon),old=localStorage.getItem(key);if(old!==null)return{value:+old,source:'cache'};if(!navigator.onLine)return{value:null};const res=await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`),v=(await res.json())?.results?.[0]?.elevation;if(typeof v==='number'){localStorage.setItem(key,String(v));return{value:v,source:'network'}}}catch(e){}return{value:null}}
function markerIcon(color,label){return L.divIcon({className:'fixed-marker',html:`<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #07111f;box-shadow:0 0 0 3px ${color}66;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#06120a">${label}</div>`,iconSize:[28,28],iconAnchor:[14,14]})}
function updateLabels(){if(markerA)markerA.setTooltipContent(`A — ${coordText(markerA.getLatLng())}`);if(markerB)markerB.setTooltipContent(`B — ${coordText(markerB.getLatLng())}`)}
function makeMarker(which){const green=which==='A',m=L.marker([0,0],{icon:markerIcon(green?'#50e38a':'#62a9ff',which),draggable:false});m.bindTooltip(`${which}`,{permanent:true,direction:'top',offset:[0,-15],className:'coord-label',opacity:1});return m}
function ensureMap(){if(map)return;map=L.map(mapDiv,{zoomControl:true,attributionControl:true,preferCanvas:true,rotate:true,bearing:0,touchRotate:true});const street=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Street Map'}),sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Imagery'}),topo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Topographic Map'});street.addTo(map);L.control.layers({'خريطة واضحة':street,'قمر صناعي':sat,'تضاريس':topo},null,{collapsed:true,position:'topleft'}).addTo(map);map.on('move',()=>{if(measureDestination)updateLiveMeasure();});map.on('moveend',()=>{if(markerA&&markerB&&!measureDestination)updateCenterLine();if(measureDestination)updateLiveMeasure();});map.on('mousedown',startLongPress);map.on('mousemove',cancelLongPress);map.on('mouseup',endLongPress);map.on('contextmenu',e=>{L.DomEvent.preventDefault(e);openDestinationAction(e.latlng)});const c=map.getContainer();c.addEventListener('pointerdown',pointerStart,{passive:false});c.addEventListener('pointermove',pointerMove,{passive:false});c.addEventListener('pointerup',pointerEnd,{passive:false});c.addEventListener('pointercancel',pointerEnd,{passive:false});}
function eventContainerPoint(e){if(e.latlng)return e.latlng;return map.mouseEventToContainerPoint(e.originalEvent)}
function startLongPress(e){const point=eventContainerPoint(e);if(!point)return;pressStart={x:point.x,y:point.y};const latlng=e.latlng||map.containerPointToLatLng(point);pressTimer=setTimeout(()=>openDestinationAction(latlng,true),650)}
function cancelLongPress(e){if(!pressTimer||!pressStart)return;const p=eventContainerPoint(e);if(p&&Math.hypot(p.x-pressStart.x,p.y-pressStart.y)>12){clearTimeout(pressTimer);pressTimer=null}}
function endLongPress(){if(pressTimer){clearTimeout(pressTimer);pressTimer=null}}
function pointerPoint(e){const r=map.getContainer().getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function pointerStart(e){if(e.pointerType==='mouse'&&e.button!==0)return;if(e.pointerType==='touch'&&!e.isPrimary){endLongPress();return}const p=pointerPoint(e);pressStart=p;const latlng=map.containerPointToLatLng([p.x,p.y]);pressTimer=setTimeout(()=>openDestinationAction(latlng),650)}
function pointerMove(e){if(!pressTimer||!pressStart)return;const p=pointerPoint(e);if(Math.hypot(p.x-pressStart.x,p.y-pressStart.y)>14)endLongPress()}
function pointerEnd(){endLongPress()}
function openDestinationAction(latlng){if(!latlng)return;pendingDestination=latlng;destinationAction.classList.add('show');setTimeout(()=>destinationAction.classList.remove('show'),5000)}
function showPoints(a,b,fit=true){ensureMap();if(!markerA){markerA=makeMarker('A').addTo(map);markerB=makeMarker('B').addTo(map)}markerA.setLatLng(a);markerB.setLatLng(b);latA.value=a.lat.toFixed(6);lonA.value=a.lng.toFixed(6);latB.value=b.lat.toFixed(6);lonB.value=b.lng.toFixed(6);updateCenterLine();if(fit)map.fitBounds(L.latLngBounds([a,b]),{padding:[70,70],maxZoom:16});setTimeout(()=>map.invalidateSize(),80)}
function updateCenterLine(){if(!markerA||!markerB)return;const a=markerA.getLatLng(),b=markerB.getLatLng();if(line)map.removeLayer(line);line=L.polyline([a,b],{color:'#ffd166',weight:4,opacity:.92,dashArray:'10 8'}).addTo(map);updateLabels();compute()}
async function compute(){if(!markerA||!markerB)return;const a=markerA.getLatLng(),b=markerB.getLatLng(),d=distance(a,b),br=bearing(a,b);rDist.textContent=d>=1000?(d/1000).toFixed(2)+' كم':Math.round(d)+' م';rBear.textContent=br.toFixed(1)+'°';results.style.display='grid';elevNote.style.display='block';openCalcBtn.style.display='block';rElev.textContent='…';elevPill.textContent='جارِ جلب الارتفاع...';const[ea,eb]=await Promise.all([elevation(a.lat,a.lng),elevation(b.lat,b.lng)]);if(ea.value!==null&&eb.value!==null){const diff=eb.value-ea.value;rElev.textContent=(diff>=0?'+':'')+diff.toFixed(1);elevPill.textContent=`A: ${ea.value.toFixed(1)} م، B: ${eb.value.toFixed(1)} م — ${ea.source==='network'||eb.source==='network'?'تم التحديث الآن':'من التخزين المحلي'}`}else{rElev.textContent='—';elevPill.textContent='تعذر جلب الارتفاع؛ تحتاج إنترنت أول مرة لكل نقطة'}}
function inputs(){return[{lat:parseFloat(latA.value),lng:parseFloat(lonA.value)},{lat:parseFloat(latB.value),lng:parseFloat(lonB.value)}]}
function validate(a,b){if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))throw Error('أدخل إحداثيات صحيحة للنقطتين A و B');if(Math.abs(a.lat)>90||Math.abs(b.lat)>90)throw Error('خط العرض يجب أن يكون بين -90 و 90');if(Math.abs(a.lng)>180||Math.abs(b.lng)>180)throw Error('خط الطول يجب أن يكون بين -180 و 180')}
destinationAction.addEventListener('click',()=>{if(!pendingDestination)return;startLiveMeasure(pendingDestination);pendingDestination=null;destinationAction.classList.remove('show')});
clearMeasureBtn.addEventListener('click',clearLiveMeasure);
function startLiveMeasure(destination){measureDestination=L.latLng(destination.lat,destination.lng);if(measureLine)map.removeLayer(measureLine);if(measureDestinationMarker)map.removeLayer(measureDestinationMarker);measureDestinationMarker=L.circleMarker(measureDestination,{radius:5,color:'#ff3b30',weight:2,fillColor:'#ff3b30',fillOpacity:1}).addTo(map);clearMeasureBtn.style.display='block';updateLiveMeasure()}
function updateLiveMeasure(){if(!measureDestination||!map)return;const center=map.getCenter();if(measureLine)map.removeLayer(measureLine);measureLine=L.polyline([center,measureDestination],{color:'#ff3b30',weight:4,opacity:.95}).addTo(map);const d=distance(center,measureDestination),br=bearing(center,measureDestination);rDist.textContent=d>=1000?(d/1000).toFixed(2)+' كم':Math.round(d)+' م';rBear.textContent=br.toFixed(1)+'°';rElev.textContent='—';elevPill.textContent='قياس حي من مركز الخريطة إلى الوجهة';results.style.display='grid';elevNote.style.display='block';openCalcBtn.style.display='block'}
function clearLiveMeasure(){if(measureLine)map.removeLayer(measureLine);if(measureDestinationMarker)map.removeLayer(measureDestinationMarker);measureLine=null;measureDestinationMarker=null;measureDestination=null;clearMeasureBtn.style.display='none';results.style.display='none';elevNote.style.display='none'}
okBtn.addEventListener('click',()=>{try{const[a,b]=inputs();validate(a,b);showPoints(a,b,true);errMsg.style.display='none'}catch(e){errMsg.textContent=e.message;errMsg.style.display='block'}});
swapBtn.addEventListener('click',()=>{[latA.value,latB.value]=[latB.value,latA.value];[lonA.value,lonB.value]=[lonB.value,lonA.value];if(markerA&&markerB)showPoints(inputs()[0],inputs()[1],true)});
useLocBtn.addEventListener('click',()=>{if(!navigator.geolocation){errMsg.textContent='المتصفح لا يدعم تحديد الموقع';errMsg.style.display='block';return}useLocBtn.textContent='جارِ تحديد الموقع...';navigator.geolocation.getCurrentPosition(p=>{latA.value=p.coords.latitude.toFixed(6);lonA.value=p.coords.longitude.toFixed(6);useLocBtn.textContent='موقعي الحالي → A'},()=>{errMsg.textContent='تعذر الحصول على الموقع؛ اسمح للمتصفح بالوصول للموقع';errMsg.style.display='block';useLocBtn.textContent='موقعي الحالي → A'})});
ensureMap();map.setView([15.3694,44.1910],10);let lastCenterTap=0;const openFromCenter=e=>{e?.preventDefault();e?.stopPropagation();const now=Date.now();if(now-lastCenterTap<350)return;lastCenterTap=now;openDestinationAction(map.getCenter())};centerCursor.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation()},{passive:false});centerCursor.addEventListener('touchend',openFromCenter,{passive:false});centerCursor.addEventListener('pointerup',openFromCenter);centerCursor.addEventListener('click',openFromCenter);mapWrap.addEventListener('click',e=>{const r=mapDiv.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2);if(Math.hypot(x,y)<38)openFromCenter(e)});
const sampleTable=[
  {distance:500,type:'A',number:1,output:12},
  {distance:500,type:'A',number:2,output:15},
  {distance:500,type:'A',number:3,output:18},
  {distance:500,type:'A',number:4,output:21},
  {distance:500,type:'A',number:5,output:24},
  {distance:500,type:'B',number:1,output:14},
  {distance:500,type:'B',number:2,output:17},
  {distance:500,type:'B',number:3,output:20},
  {distance:500,type:'B',number:4,output:23},
  {distance:500,type:'B',number:5,output:26},
  {distance:500,type:'C',number:1,output:16},
  {distance:500,type:'C',number:2,output:19},
  {distance:500,type:'C',number:3,output:22},
  {distance:500,type:'C',number:4,output:25},
  {distance:500,type:'C',number:5,output:28},
  {distance:1000,type:'A',number:1,output:25},
  {distance:1000,type:'A',number:2,output:28},
  {distance:1000,type:'A',number:3,output:31},
  {distance:1000,type:'A',number:4,output:34},
  {distance:1000,type:'A',number:5,output:37},
  {distance:1000,type:'B',number:1,output:27},
  {distance:1000,type:'B',number:2,output:30},
  {distance:1000,type:'B',number:3,output:33},
  {distance:1000,type:'B',number:4,output:36},
  {distance:1000,type:'B',number:5,output:39},
  {distance:1000,type:'C',number:1,output:29},
  {distance:1000,type:'C',number:2,output:32},
  {distance:1000,type:'C',number:3,output:35},
  {distance:1000,type:'C',number:4,output:38},
  {distance:1000,type:'C',number:5,output:41},
  {distance:1500,type:'A',number:1,output:38},
  {distance:1500,type:'A',number:2,output:41},
  {distance:1500,type:'A',number:3,output:44},
  {distance:1500,type:'A',number:4,output:47},
  {distance:1500,type:'A',number:5,output:50},
  {distance:1500,type:'B',number:1,output:40},
  {distance:1500,type:'B',number:2,output:43},
  {distance:1500,type:'B',number:3,output:46},
  {distance:1500,type:'B',number:4,output:49},
  {distance:1500,type:'B',number:5,output:52},
  {distance:1500,type:'C',number:1,output:42},
  {distance:1500,type:'C',number:2,output:45},
  {distance:1500,type:'C',number:3,output:48},
  {distance:1500,type:'C',number:4,output:51},
  {distance:1500,type:'C',number:5,output:54},
  {distance:2000,type:'A',number:1,output:51},
  {distance:2000,type:'A',number:2,output:54},
  {distance:2000,type:'A',number:3,output:57},
  {distance:2000,type:'A',number:4,output:60},
  {distance:2000,type:'A',number:5,output:63},
  {distance:2000,type:'B',number:1,output:53},
  {distance:2000,type:'B',number:2,output:56},
  {distance:2000,type:'B',number:3,output:59},
  {distance:2000,type:'B',number:4,output:62},
  {distance:2000,type:'B',number:5,output:65},
  {distance:2000,type:'C',number:1,output:55},
  {distance:2000,type:'C',number:2,output:58},
  {distance:2000,type:'C',number:3,output:61},
  {distance:2000,type:'C',number:4,output:64},
  {distance:2000,type:'C',number:5,output:67}
];
function showCalcScreen(){let d,br,ev=0;if(markerA&&markerB){d=distance(markerA.getLatLng(),markerB.getLatLng());br=bearing(markerA.getLatLng(),markerB.getLatLng());const parsed=parseFloat(rElev.textContent.replace('+',''));ev=Number.isFinite(parsed)?parsed:0}else if(measureDestination&&map){const center=map.getCenter();d=distance(center,measureDestination);br=bearing(center,measureDestination)}else{return}calcDistance.value=d.toFixed(2);calcBearing.value=br.toFixed(2);calcElevation.value=ev.toFixed(2);mainLayout.style.display='none';calcScreen.classList.add('show');window.scrollTo({top:0,behavior:'smooth'})}
function showMapScreen(){calcScreen.classList.remove('show');mainLayout.style.display='grid';setTimeout(()=>{if(map)map.invalidateSize()},100);window.scrollTo({top:0,behavior:'smooth'})}
openCalcBtn.addEventListener('click',showCalcScreen);backMapBtn.addEventListener('click',showMapScreen);
calcOkBtn.addEventListener('click',()=>{const d=parseFloat(calcDistance.value),ev=parseFloat(calcElevation.value),br=parseFloat(calcBearing.value),n=parseInt(calcNumber.value,10);calcError.style.display='none';if(![d,ev,br,n].every(Number.isFinite)||d<0||n<1||n>5){calcError.textContent='تحقق من المسافة والارتفاع والزاوية والرقم (من 1 إلى 5)';calcError.style.display='block';return}const adjusted=d+ev/2,normalized=Math.round(adjusted),mapAngle=br/6,row=sampleTable.find(x=>x.distance===normalized&&x.type===calcType.value&&x.number===n);outAdjusted.textContent=adjusted.toFixed(2)+' م';outMapAngle.textContent=mapAngle.toFixed(2)+'°';if(row){outAngle.textContent=row.output.toFixed(2)+'°';outTable.textContent=`الزاوية ${row.output.toFixed(2)}°`;outTableDetail.textContent=`مطابقة تامة: مسافة ${row.distance} م، النوع ${row.type}، الرقم ${row.number} — بيانات افتراضية للتجربة`}else{outAngle.textContent='—';outTable.textContent='لا توجد مطابقة';outTableDetail.textContent=`المسافة المعدلة بعد التقريب لأقرب متر: ${normalized} م، ولا يوجد لها صف بهذا النوع والرقم` }calcOutput.classList.add('show')});

