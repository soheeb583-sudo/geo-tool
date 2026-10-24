let map, markerA, markerB, line;
const R = 6371000;
const el = id => document.getElementById(id);
const latA=el('latA'),lonA=el('lonA'),latB=el('latB'),lonB=el('lonB');
const okBtn=el('okBtn'),useLocBtn=el('useLocBtn'),swapBtn=el('swapBtn'),pickABtn=el('pickABtn'),pickBBtn=el('pickBBtn');
const errMsg=el('errMsg'),mapDiv=el('map'),results=el('results'),rDist=el('rDist'),rBear=el('rBear'),rElev=el('rElev');
const netDot=el('netDot'),netText=el('netText'),elevNote=el('elevNote'),elevPill=el('elevPill'),modeText=el('modeText');
let pickMode='A';

function updateNetStatus(){
  const online=navigator.onLine; netDot.classList.toggle('on',online);
  netText.textContent=online?'متصل — يمكن تحميل الخرائط والارتفاعات':'بدون إنترنت — المناطق المحمّلة مسبقًا فقط';
}
window.addEventListener('online',updateNetStatus); window.addEventListener('offline',updateNetStatus); updateNetStatus();
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
function toRad(d){return d*Math.PI/180} function toDeg(r){return r*180/Math.PI}
function haversineDistance(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dp=toRad(b.lat-a.lat),dl=toRad(b.lng-a.lng);const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function initialBearing(a,b){const p1=toRad(a.lat),p2=toRad(b.lat),dl=toRad(b.lng-a.lng),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (toDeg(Math.atan2(y,x))+360)%360}
function elevCacheKey(lat,lon){return `elev_${lat.toFixed(5)}_${lon.toFixed(5)}`}
function getCachedElevation(lat,lon){try{const v=localStorage.getItem(elevCacheKey(lat,lon));return v===null?null:parseFloat(v)}catch(e){return null}}
function setCachedElevation(lat,lon,v){try{localStorage.setItem(elevCacheKey(lat,lon),String(v))}catch(e){}}
async function fetchElevation(lat,lon){const cached=getCachedElevation(lat,lon);if(cached!==null)return{value:cached,source:'cache'};if(!navigator.onLine)return{value:null,source:'offline'};try{const res=await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);const data=await res.json(),v=data?.results?.[0]?.elevation;if(typeof v==='number'){setCachedElevation(lat,lon,v);return{value:v,source:'network'}}}catch(e){}return{value:null,source:'error'}}
function coordText(p){return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`}
function makeIconMarker(color,label){const icon=L.divIcon({className:'fixed-marker',html:`<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #07111f;box-shadow:0 0 0 3px ${color}66;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#06120a">${label}</div>`,iconSize:[28,28],iconAnchor:[14,14]});return L.marker([0,0],{icon,draggable:false,keyboard:false})}
function addPermanentLabel(marker,label,color){marker.bindTooltip(`${label} — ${coordText(marker.getLatLng())}`,{permanent:true,direction:'top',offset:[0,-15],className:'coord-label',opacity:1}).openTooltip();marker._label=label;marker._labelColor=color}
function refreshLabels(){if(markerA)markerA.setTooltipContent(`A — ${coordText(markerA.getLatLng())}`);if(markerB)markerB.setTooltipContent(`B — ${coordText(markerB.getLatLng())}`)}
function ensureMap(){if(map)return;map=L.map(mapDiv,{zoomControl:true,attributionControl:true,preferCanvas:true});const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Imagery'});const street=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Street Map'});const topo=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Topographic Map'});street.addTo(map);L.control.layers({'خريطة واضحة':street,'قمر صناعي':satellite,'تضاريس':topo},{},{collapsed:true,position:'topleft'}).addTo(map);map.on('click',e=>setPointFromMap(pickMode,{lat:e.latlng.lat,lng:e.latlng.lng}))}
function redrawLine(){if(!map||!markerA||!markerB)return;const a=markerA.getLatLng(),b=markerB.getLatLng();if(line)map.removeLayer(line);line=L.polyline([a,b],{color:'#ffd166',weight:4,opacity:.9,dashArray:'10 8'}).addTo(map);refreshLabels()}
function formatDistance(m){return m>=1000?(m/1000).toFixed(2)+' كم':Math.round(m)+' م'}
async function computeAndRender(){if(!markerA||!markerB)return;const a=markerA.getLatLng(),b=markerB.getLatLng();rDist.textContent=formatDistance(haversineDistance(a,b));rBear.textContent=initialBearing(a,b).toFixed(1)+'°';results.style.display='grid';latA.value=a.lat.toFixed(6);lonA.value=a.lng.toFixed(6);latB.value=b.lat.toFixed(6);lonB.value=b.lng.toFixed(6);elevNote.style.display='block';elevPill.textContent='جارِ جلب الارتفاع...';rElev.textContent='…';const [ea,eb]=await Promise.all([fetchElevation(a.lat,a.lng),fetchElevation(b.lat,b.lng)]);if(ea.value!==null&&eb.value!==null){const d=eb.value-ea.value;rElev.textContent=(d>=0?'+':'')+d.toFixed(1);elevPill.textContent=`A: ${ea.value.toFixed(1)} م، B: ${eb.value.toFixed(1)} م — ${ea.source==='network'||eb.source==='network'?'تم التحديث الآن':'من التخزين المحلي'}`}else{rElev.textContent='—';elevPill.textContent='تعذر جلب الارتفاع؛ تحتاج إنترنت أول مرة لكل نقطة'}}
function validPoint(a,b){if(!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||!Number.isFinite(b.lat)||!Number.isFinite(b.lng))throw Error('أدخل إحداثيات صحيحة للنقطتين A و B');if(Math.abs(a.lat)>90||Math.abs(b.lat)>90)throw Error('خط العرض يجب أن يكون بين -90 و 90');if(Math.abs(a.lng)>180||Math.abs(b.lng)>180)throw Error('خط الطول يجب أن يكون بين -180 و 180')}
function showMapWithPoints(a,b,fit=true){errMsg.style.display='none';ensureMap();if(!markerA){markerA=makeIconMarker('#50e38a','A').addTo(map);markerB=makeIconMarker('#62a9ff','B').addTo(map);addPermanentLabel(markerA,'A','#50e38a');addPermanentLabel(markerB,'B','#62a9ff')}markerA.setLatLng(a);markerB.setLatLng(b);redrawLine();if(fit)map.fitBounds(L.latLngBounds([a,b]),{padding:[70,70],maxZoom:16});setTimeout(()=>map.invalidateSize(),100);computeAndRender()}
function readInputs(){return[{lat:parseFloat(latA.value),lng:parseFloat(lonA.value)},{lat:parseFloat(latB.value),lng:parseFloat(lonB.value)}]}
function setPointFromMap(which,p){try{const [a,b]=markerA&&markerB?[markerA.getLatLng(),markerB.getLatLng()]:readInputs();if(which==='A'){latA.value=p.lat.toFixed(6);lonA.value=p.lng.toFixed(6);showMapWithPoints(p,b,false)}else{latB.value=p.lat.toFixed(6);lonB.value=p.lng.toFixed(6);showMapWithPoints(a,p,false)}setPickMode(which==='A'?'B':'B')}catch(e){errMsg.textContent='حدد النقطة الأخرى أولًا أو أدخل إحداثياتها';errMsg.style.display='block'}}
function setPickMode(mode){pickMode=mode;pickABtn.classList.toggle('active',mode==='A');pickBBtn.classList.toggle('active',mode==='B');const t=`النقرة التالية: ${mode}`;modeText.textContent=t;pickABtn.textContent=t;pickBBtn.textContent=mode==='A'?'النقرة التالية: B':'النقرة التالية: B'}
okBtn.addEventListener('click',()=>{try{const[a,b]=readInputs();validPoint(a,b);showMapWithPoints(a,b,true)}catch(e){errMsg.textContent=e.message;errMsg.style.display='block'}});
swapBtn.addEventListener('click',()=>{[latA.value,latB.value]=[latB.value,latA.value];[lonA.value,lonB.value]=[lonB.value,lonA.value];if(markerA&&markerB)showMapWithPoints(readInputs()[0],readInputs()[1],true)});
pickABtn.addEventListener('click',()=>setPickMode('A'));pickBBtn.addEventListener('click',()=>setPickMode('B'));
useLocBtn.addEventListener('click',()=>{if(!navigator.geolocation){errMsg.textContent='المتصفح لا يدعم تحديد الموقع';errMsg.style.display='block';return}useLocBtn.textContent='جارِ تحديد الموقع...';navigator.geolocation.getCurrentPosition(pos=>{latA.value=pos.coords.latitude.toFixed(6);lonA.value=pos.coords.longitude.toFixed(6);useLocBtn.textContent='موقعي الحالي → A';},()=>{errMsg.textContent='تعذر الحصول على الموقع؛ اسمح للمتصفح بالوصول إلى الموقع';errMsg.style.display='block';useLocBtn.textContent='موقعي الحالي → A'})});
setPickMode('A');
ensureMap();
map.setView([15.3694,44.1910],10);
