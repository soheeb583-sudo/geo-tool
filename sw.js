const SHELL_CACHE = 'geo-tool-shell-v2';
const TILE_CACHE = 'geo-tool-tiles-v1';

const SHELL_FILES = [
  './index.html',
  './app.js?v=v12-20261025',
  './manifest.json',
  './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isMapTile(url){
  return url.includes('arcgisonline.com') || url.includes('/tile/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // صور الخريطة (الأقمار الصناعية): تُخزَّن بعد أول تحميل وتُستخدم بدون إنترنت لاحقًا
  if(isMapTile(url)){
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if(cached) return cached;
        try{
          const resp = await fetch(req);
          if(resp && resp.status === 200) cache.put(req, resp.clone());
          return resp;
        }catch(e){
          return cached || new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // ملفات التطبيق: شبكة أولًا، وإن تعذر الاتصال نرجع للنسخة المخزنة
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if(resp && resp.status === 200 && req.method === 'GET'){
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, resp.clone()));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
