// ===== حالة عامة =====
let map, markerA, markerB, line;
const R = 6371000; // نصف قطر الأرض بالمتر

// ===== عناصر DOM =====
const el = (id) => document.getElementById(id);
const latA = el('latA'), lonA = el('lonA'), latB = el('latB'), lonB = el('lonB');
const okBtn = el('okBtn'), useLocBtn = el('useLocBtn'), swapBtn = el('swapBtn');
const errMsg = el('errMsg'), mapDiv = el('map'), results = el('results');
const rDist = el('rDist'), rBear = el('rBear'), rElev = el('rElev');
const netDot = el('netDot'), netText = el('netText');
const elevNote = el('elevNote'), elevPill = el('elevPill');

// ===== حالة الاتصال =====
function updateNetStatus(){
  if(navigator.onLine){
    netDot.classList.add('on');
    netText.textContent = 'متصل بالإنترنت — يمكن تحميل مناطق جديدة وبيانات ارتفاع جديدة';
  } else {
    netDot.classList.remove('on');
    netText.textContent = 'بدون إنترنت — تعمل المناطق والبيانات المحمّلة مسبقًا فقط';
  }
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);
updateNetStatus();

// ===== Service Worker للعمل بدون إنترنت =====
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

// ===== حسابات جغرافية =====
function toRad(d){ return d * Math.PI / 180; }
function toDeg(r){ return r * 180 / Math.PI; }

function haversineDistance(lat1, lon1, lat2, lon2){
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dLambda/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function initialBearing(lat1, lon1, lat2, lon2){
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(dLambda);
  let theta = toDeg(Math.atan2(y, x));
  return (theta + 360) % 360;
}

// ===== تخزين الارتفاعات محليًا (يعمل بدون إنترنت بعد أول استعلام) =====
function elevCacheKey(lat, lon){
  return `elev_${lat.toFixed(5)}_${lon.toFixed(5)}`;
}
function getCachedElevation(lat, lon){
  try{
    const v = localStorage.getItem(elevCacheKey(lat, lon));
    return v !== null ? parseFloat(v) : null;
  }catch(e){ return null; }
}
function setCachedElevation(lat, lon, elev){
  try{ localStorage.setItem(elevCacheKey(lat, lon), String(elev)); }catch(e){}
}

async function fetchElevation(lat, lon){
  const cached = getCachedElevation(lat, lon);
  if(cached !== null) return { value: cached, source: 'cache' };
  if(!navigator.onLine) return { value: null, source: 'offline' };
  try{
    const res = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const data = await res.json();
    const val = data?.results?.[0]?.elevation;
    if(typeof val === 'number'){
      setCachedElevation(lat, lon, val);
      return { value: val, source: 'network' };
    }
    return { value: null, source: 'error' };
  }catch(e){
    return { value: null, source: 'error' };
  }
}

// ===== الخريطة =====
function ensureMap(){
  if(map) return;
  map = L.map(mapDiv, { zoomControl: true, attributionControl: true });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri World Imagery'
  });
  sat.addTo(map);
}

function makeDraggableMarker(color){
  return L.circleMarker([0,0], {
    radius: 9, color: '#0b1220', weight: 2, fillColor: color, fillOpacity: 1,
    draggable: true
  });
}

// circleMarker لا يدعم draggable افتراضيًا، نستخدم L.marker بأيقونة بسيطة بدلًا منه
function makeIconMarker(color, label){
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #0b1220;box-shadow:0 0 0 2px ${color}66;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#06120a">${label}</div>`,
    iconSize: [22,22],
    iconAnchor: [11,11]
  });
  return L.marker([0,0], { icon, draggable: true });
}

function redrawLineAndFit(){
  const a = markerA.getLatLng(), b = markerB.getLatLng();
  if(line) map.removeLayer(line);
  line = L.polyline([a, b], { color: '#f1f5f9', weight: 3, dashArray: '8 6' }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [30,30] });
}

async function computeAndRender(){
  const a = markerA.getLatLng(), b = markerB.getLatLng();
  const dist = haversineDistance(a.lat, a.lng, b.lat, b.lng);
  const bear = initialBearing(a.lat, a.lng, b.lat, b.lng);

  rDist.textContent = dist >= 1000 ? (dist/1000).toFixed(2) + ' كم' : Math.round(dist);
  rBear.textContent = bear.toFixed(1) + '°';
  results.classList.add('show');

  elevNote.style.display = 'flex';
  elevPill.textContent = 'جارِ جلب الارتفاع...';
  rElev.textContent = '…';

  const [eA, eB] = await Promise.all([
    fetchElevation(a.lat, a.lng),
    fetchElevation(b.lat, b.lng)
  ]);

  if(eA.value !== null && eB.value !== null){
    const diff = eB.value - eA.value;
    rElev.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1);
    const src = (eA.source === 'network' || eB.source === 'network') ? 'تم الجلب الآن وتخزينه للعمل بدون إنترنت لاحقًا'
      : 'من البيانات المخزنة مسبقًا';
    elevPill.textContent = `A: ${eA.value.toFixed(1)} م، B: ${eB.value.toFixed(1)} م — ${src}`;
  } else {
    rElev.textContent = '—';
    elevPill.textContent = 'تعذر جلب الارتفاع (تحتاج إنترنت أول مرة لكل نقطة)';
  }

  // تحديث الحقول لتعكس أي سحب يدوي
  latA.value = a.lat.toFixed(6); lonA.value = a.lng.toFixed(6);
  latB.value = b.lat.toFixed(6); lonB.value = b.lng.toFixed(6);
}

function showMapWithPoints(a, b){
  errMsg.style.display = 'none';
  mapDiv.classList.add('show');
  ensureMap();
  setTimeout(() => map.invalidateSize(), 50);

  if(!markerA){
    markerA = makeIconMarker('#4ade80', 'A').addTo(map);
    markerB = makeIconMarker('#60a5fa', 'B').addTo(map);
    markerA.on('dragend', () => { redrawLineAndFit(); computeAndRender(); });
    markerB.on('dragend', () => { redrawLineAndFit(); computeAndRender(); });
  }
  markerA.setLatLng(a);
  markerB.setLatLng(b);
  redrawLineAndFit();
  computeAndRender();
}

// ===== التحقق من المدخلات =====
function parseCoord(input, name){
  const v = parseFloat(input.value);
  if(isNaN(v)) throw new Error(`يرجى إدخال قيمة صحيحة لـ ${name}`);
  return v;
}

okBtn.addEventListener('click', () => {
  try{
    const a = { lat: parseCoord(latA, 'خط عرض A'), lng: parseCoord(lonA, 'خط طول A') };
    const b = { lat: parseCoord(latB, 'خط عرض B'), lng: parseCoord(lonB, 'خط طول B') };
    if(Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90) throw new Error('خط العرض يجب أن يكون بين 90- و 90');
    if(Math.abs(a.lng) > 180 || Math.abs(b.lng) > 180) throw new Error('خط الطول يجب أن يكون بين 180- و 180');
    showMapWithPoints(a, b);
  }catch(e){
    errMsg.textContent = e.message;
    errMsg.style.display = 'block';
  }
});

swapBtn.addEventListener('click', () => {
  [latA.value, latB.value] = [latB.value, latA.value];
  [lonA.value, lonB.value] = [lonB.value, lonA.value];
});

useLocBtn.addEventListener('click', () => {
  if(!navigator.geolocation){
    errMsg.textContent = 'المتصفح لا يدعم تحديد الموقع';
    errMsg.style.display = 'block';
    return;
  }
  useLocBtn.textContent = '... جارِ التحديد';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      latA.value = pos.coords.latitude.toFixed(6);
      lonA.value = pos.coords.longitude.toFixed(6);
      useLocBtn.textContent = '📍 موقعي الحالي → A';
    },
    () => {
      errMsg.textContent = 'تعذر الحصول على الموقع';
      errMsg.style.display = 'block';
      useLocBtn.textContent = '📍 موقعي الحالي → A';
    }
  );
});
