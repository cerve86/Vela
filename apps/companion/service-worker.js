// Offline shell: the pages, styles and scripts work with no signal. Her data is not cached
// here — Supabase and /api always go to the network, and the app keeps its own per-user
// copy (cached() in js/core.js), which signOut clears. Bump CACHE when SHELL changes.
const CACHE = "vela-companion-v8";
const SHELL = [
  "./",
  "./index.html",
  "./nutrition.html",
  "./connect.html",
  "./manifest.webmanifest",
  "./styles.css",
  "./css/today.css",
  "./css/fuel.css",
  "./css/strength.css",
  "./css/library.css",
  "./css/nutrition.css",
  "./css/connect.css",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/core.js",
  "./js/hrv-guidance.js",
  "./js/auth.js",
  "./js/data.js",
  "./js/data-today.js",
  "./js/data-fuel.js",
  "./js/data-strength.js",
  "./js/data-library.js",
  "./js/today.js",
  "./js/fuel.js",
  "./js/strength.js",
  "./js/library.js",
  "./js/signin.js",
  "./js/nutrition.js",
  "./js/connect.js",
  "./assets/exercises/exercises.json",
  "./icons/icon-192.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"
];
// Third-party files the shell needs offline: the pinned supabase-js build and the fonts.
const CDN = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  // One missing file must not stop the rest from being saved.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const same = url.origin === self.location.origin;
  // Live data never comes from here: /api (intervals.icu) and anything not ours or the CDN
  // list (Supabase, wherever it is hosted) go straight to the network.
  if (same && url.pathname.startsWith("/api/")) return;
  if (!same && CDN.indexOf(url.hostname) < 0) return;
  if (same && !url.pathname.startsWith("/companion/")) return;
  e.respondWith(networkFirst(e.request));
});

// Network first, so a deploy reaches her on the next open; the saved copy when there's no
// signal, or when the network takes longer than 4 s and a copy exists.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  });
  const saved = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
  const fallback = () => saved || (req.mode === "navigate" ? cache.match("./index.html") : undefined);
  if (!saved) {
    try { return await net; }
    catch (e) { const f = await fallback(); if (f) return f; throw e; }
  }
  const slow = new Promise((resolve) => setTimeout(() => resolve(saved), 4000));
  return Promise.race([net.catch(() => saved), slow]);
}
