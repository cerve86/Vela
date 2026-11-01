// Requires the supabase-js UMD bundle + js/config.js loaded first (see index.html).
// js/config.js is not a file in the repo: the portal writes it from its own environment
// (apps/web/src/app/companion/js/config.js/route.ts), so the URL and anon key always
// match the backend the portal itself is talking to.
(function () {
  if (!window.VELA_CONFIG || !window.VELA_CONFIG.SUPABASE_URL) {
    console.warn("js/config.js did not load — the portal sets VELA_CONFIG from its environment.");
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.VELA_CONFIG || {};
  // Its own storage key: the portal on the same origin keeps a coach's session in cookies,
  // and the two must never be mistaken for each other.
  window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: "vela-companion-auth" }
  });
})();
