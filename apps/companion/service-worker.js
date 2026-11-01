// Minimal offline shell. Bump CACHE when the SHELL list changes.
const CACHE = "vela-companion-v3";
const SHELL = [
  "./index.html",
  "./styles.css",
  "./js/supabaseClient.js",
  "./js/auth.js",
  "./js/data.js",
  "./js/views.js",
  "./manifest.webmanifest",
  "./nutrition.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Supabase and /api always go to the network; the shell is network-first with an offline copy.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.endsWith("supabase.co")) return; // let live data go to network
  if (url.pathname.startsWith("/api/")) return;     // serverless fns (intervals.icu) always live
  if (e.request.method !== "GET") return;
  // Network first, cache as the offline fallback: a deploy reaches her on the next open,
  // instead of waiting for someone to remember to bump CACHE.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
