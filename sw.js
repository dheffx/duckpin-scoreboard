const CACHE_NAME = "duckpin-scoreboard-v19";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=19",
  "./src/app.js?v=19",
  "./src/scoring.js?v=19",
  "./src/style.css?v=19",
  "./assets/duckpin-bowler.png",
  "./assets/duckpin-duck.png",
  "./assets/terrier-strike.png",
  "./assets/terrier-spare.png",
  "./icons/duckpin-duck-180.png?v=19",
  "./icons/duckpin-duck-192.png?v=19",
  "./icons/duckpin-duck-512.png?v=19"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached ?? new Response("Offline", { status: 503, statusText: "Offline" })
        )
      )
  );
});
