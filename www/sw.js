const cacheName = "receta-medica-mobile-v1";
const assets = [
  "./",
  "./index.html",
  "./styles.css?v=1",
  "./app.js?v=1",
  "./manifest.webmanifest",
  "./icon.svg",
  "./assets/ipn-logo-darkblue.png",
  "./assets/medical-caduceus-darkblue.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
