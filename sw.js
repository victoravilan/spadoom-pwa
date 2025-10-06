const CACHE = 'spadoom-v1';
const ASSETS = [
  '/', '/index.html', '/style.css', '/main.js', '/joystick.js',
  '/manifest.webmanifest', '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
  'https://unpkg.com/three@0.160.0/build/three.min.js'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request))
  );
});
