const CACHE_NAME = "dress-dashboard-v1";

const ASSETS_TO_CACHE = [
  "/dashboard.html",
  "/css/dashboard.css",
  "/js/dashboard.js",
  "/upload.html",
  "/search.html",
  "/profile.html",
  "/manage.html",
  "/favourites.html"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Activate (cleanup old cache)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});
