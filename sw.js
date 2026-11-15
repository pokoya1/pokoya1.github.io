/* Service Worker — 資産取り崩し・モンテカルロ シミュレーション
   Caches the page shell so the simulator opens offline after the first visit.
   The page registers this worker ONLY with a scope covering the page itself
   (the shared-URL path) — there is no fallback to this script's folder
   scope, because a worker scoped to assets/ could never serve the page.
   Note: this static host serves only index.html and assets/*, so whether
   the page-wide scope is accepted depends on the host's response headers
   (Service-Worker-Allowed) and must be confirmed on the public URL. */
"use strict";

var CACHE_NAME = "asset-sim-v1";
var CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache each file individually so one failure does not block the rest.
      return Promise.all(
        CORE_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* optional asset */ });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
          return null;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  // Page navigations: network first, fall back to the cached page offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put("/index.html", copy);
        });
        return response;
      }).catch(function () {
        return caches.match("/index.html", { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match("/", { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // Everything else (icons, manifest, fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && (response.status === 200 || response.type === "opaque")) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || network;
    })
  );
});
