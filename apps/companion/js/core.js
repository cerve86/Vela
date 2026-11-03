/* Shared helpers and the app shell: DOM and date helpers, who she is, offline-aware
   caching, the "today changed" hook, loading/error/empty states, the pick-one control,
   the screen-reader announcer and the hash router. Loaded before auth.js and every data
   and tab file, so nothing here may touch window.db: Supabase calls live in js/data*.js.
   Safe to load on a page without the shell (nutrition.html): boot only runs when the tab
   bar is present. */

/* ============ DOM ============ */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
// Every piece of text from her, her coach or the database goes through this before innerHTML.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Coach-entered links: https only unless the caller allows plain http too.
const safeUrl = (u, allowHttp) => { u = String(u || "").trim(); return (allowHttp ? /^https?:\/\//i : /^https:\/\//i).test(u) ? u : ""; };

/* ============ dates — always her local calendar, never UTC ============ */
// toISOString() would file a 7am check-in in Singapore under yesterday.
const ymdLocal = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => ymdLocal(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymdLocal(d); };
// "21 Oct" from a YYYY-MM-DD (read as a local date, not UTC midnight).
const fmtDay = (d) => new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
// "07:12" from a timestamp in ms.
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/* ============ errors and timeouts ============ */
// Thrown by data functions when Vela could not be reached or refused the read, so a view can
// tell "couldn't load" apart from "there is nothing" (which comes back as null or []).
class VelaError extends Error {
  constructor(message, cause, kind) { super(message || "Couldn't reach Vela"); this.name = "VelaError"; this.cause = cause; this.kind = kind || "network"; }
}
// A slow call (intervals.icu, a weak signal) must end in a decision, never an endless wait.
function withTimeout(promise, ms, label) {
  let t;
  const timer = new Promise((_, reject) => { t = setTimeout(() => reject(new VelaError((label || "request") + " timed out", null, "timeout")), ms); });
  return Promise.race([Promise.resolve(promise), timer]).finally(() => clearTimeout(t));
}

/* ============ who she is ============ */
// Filled once per signed-in user by the shell (from data.js myIdentity), read by every tab.
let _identity = { client: null, firstName: "", coachFirstName: "", coachWhatsApp: "" };
let _uid = null;
const userId = () => _uid;
const client = () => _identity.client;
const firstName = () => _identity.firstName || "";
// The app speaks as Vela and names the coach; "your coach" until we know her name.
// coachName({start:true}) for the start of a sentence.
const coachName = (o) => _identity.coachFirstName || (o && o.start ? "Your coach" : "your coach");

/* ============ reaching her coach: WhatsApp ============ */
// WhatsApp is the channel; the companion never writes a message itself. The coach sets her
// link once in portal Settings (profiles.whatsapp_url). The same three shapes the database
// accepts: a chat (wa.me/<digits>), the long form (api.whatsapp.com/send?phone=…) and a
// group invite (chat.whatsapp.com/<code>).
const _WA_CHAT = /^https:\/\/(wa\.me\/[0-9]+|api\.whatsapp\.com\/send\?phone=[0-9]+)/i;
const _WA_GROUP = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
// Her coach's link, or "" when she hasn't set one (then there is no contact button at all).
const coachWhatsApp = () => {
  const u = String(_identity.coachWhatsApp || "").trim();
  return _WA_CHAT.test(u) || _WA_GROUP.test(u) ? u : "";
};
// The link is a group invite: everyone in the group sees what she posts there, so nothing
// private (her clips, her week) is ever sent to it, and its button says it's the group.
const coachWhatsAppIsGroup = () => _WA_GROUP.test(coachWhatsApp());
// The link with a message typed in for her (?text=…). A group invite can't carry one, so it
// comes back as it is; "" when there is no link. A link that already carries a text keeps it.
function whatsAppHref(text) {
  const u = coachWhatsApp();
  if (!u || !text || !_WA_CHAT.test(u) || /[?&]text=/i.test(u)) return u;
  return u + (u.indexOf("?") >= 0 ? "&" : "?") + "text=" + encodeURIComponent(String(text));
}

/* ============ links out ============ */
// Strava's run-map explorer: popular running lines, photos and points of interest. Not a
// route of its own; the shared "see running maps" link when a route has no map.
const STRAVA_RUN_MAPS = "https://www.strava.com/maps?sport=Run&style=standard&terrain=false&labels=true&poi=true&cPhotos=true&3d=true";

/* ============ the exercise library (assets/exercises/exercises.json) ============ */
// Movement name → {photo, domain, description, cues}. Fetched once; a failed fetch is an
// empty library (text-only cards), never an error on screen. The photo stays hidden until it
// has loaded, so a file not there yet never flashes a broken image.
let _exLib;
async function exerciseLibrary() {
  if (_exLib) return _exLib;
  try {
    const r = await fetch("assets/exercises/exercises.json");
    _exLib = r.ok ? await r.json() : {};
  } catch (e) { _exLib = {}; }
  if (!_exLib || typeof _exLib !== "object") _exLib = {};
  return _exLib;
}
// "Split Squat (Dumbbell)" → "split squat": lowercase, no parenthetical qualifier, no
// punctuation, dashes or arrows, single spaces.
const _exNorm = (s) => String(s || "").toLowerCase()
  .replace(/\([^)]*\)/g, " ")
  .replace(/[→←↔⇒>\-–—_/\\.,;:!?'"’+&*•·]/g, " ")
  .replace(/\s+/g, " ").trim();
// The words that make a movement a different variant (jumping, one leg or both, a hold), in
// the full name, qualifiers included, as one sorted string: "single-leg … hold" → "hold single".
const _EX_VARIANT = /^(?:jump|jumps|jumping|hop|hops|bound|bounds|plyo|plyometric|single|one|unilateral|both|bilateral|double|iso|isometric|hold|holds|eccentric)$/;
const _exVariants = (s) => String(s || "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ")
  .filter((w) => _EX_VARIANT.test(w)).map((w) => w.replace(/^(jump|hop|bound|hold)(?:s|ing)$/, "$1").replace(/^isometric$/, "iso").replace(/^plyometric$/, "plyo"))
  .filter((w, i, a) => a.indexOf(w) === i).sort().join(" ");
// The library ENTRY (the {photo, description, cues} object) for a prescribed movement name,
// or null. Tolerant, because the coach's names and the library's keys drift: the exact key,
// then the same words without qualifiers ("Suitcase carry (heavy)" finds "Suitcase
// carry"), then one name being the other's first whole words ("Copenhagen" finds
// "Copenhagen plank"), never across a variant (_exVariants). "_note" is never a movement.
function exMatch(lib, name) {
  if (!lib || !name) return null;
  const keys = Object.keys(lib).filter((k) => k !== "_note" && lib[k] && typeof lib[k] === "object");
  if (keys.indexOf(name) >= 0) return lib[name];
  const n = _exNorm(name); if (!n) return null;
  // Never across a variant: "Split squat jumps" isn't "Split Squat (iso hold)", and "Hip
  // thrust (single leg)" isn't "Hip thrust, both legs, heavy". Her own cues beat the wrong card.
  const same = (x) => _exVariants(x) === _exVariants(name);
  let k = keys.find((x) => _exNorm(x) === n && same(x));
  if (k) return lib[k];
  // A one-syllable fragment ("Hip") is too little to go on.
  const prefix = (a, b) => a.length >= 5 && a.length < b.length && b.indexOf(a + " ") === 0;
  k = keys.find((x) => { const m = _exNorm(x); return m && (prefix(n, m) || prefix(m, n)) && same(x); });
  return k ? lib[k] : null;
}
// Vela's own fuelling switches (clients.calorie_tracking, clients.restrictive_pattern):
// no kcal unless the coach turned it on; no amounts at all, grams included, when she has
// flagged a restrictive pattern.
const showAmounts = () => !(_identity.client && _identity.client.restrictive_pattern);
const showCalories = () => !!(_identity.client && _identity.client.calorie_tracking) && showAmounts();

/* ============ her HRV week: the Vela app's tree, never one morning ============ */
// VelaHrv.hrvGuidance (js/hrv-guidance.js, generated from packages/shared hrvGuidance.ts):
// the same read as the Vela app and the coach's portal. It already leaves out a single
// morning that alone would tip the week (g.oneOff), and marks a week of only four readings
// as a hint (g.firm false). → {g: hrvGuidance result or null, firm, oneOff}
function hrvRead(input) {
  const g = typeof VelaHrv === "undefined" ? null : VelaHrv.hrvGuidance(input);
  return g ? { g, firm: g.firm, oneOff: g.oneOff } : { g: null };
}

/* ============ offline-aware cache ============ */
// Fresh data when Vela answers, and a copy on the phone for when it doesn't. Keys are
// per user, so a shared iPad never shows one athlete another's plan; signOut clears them.
const _cacheKey = (key) => "vela-cache-" + (_uid || "anon") + "-" + key;
function _readCache(key) { try { const c = JSON.parse(localStorage.getItem(_cacheKey(key))); return c && typeof c.at === "number" ? c : null; } catch (e) { return null; } }
// Resolves to {data, at, stale}: at is when the data was fetched (ms), stale is true when it
// is the phone's copy. Throws only when the fetch failed and there is no copy.
async function cached(key, fn) {
  if (navigator.onLine !== false) {
    try {
      const data = await fn(), at = Date.now();
      try { localStorage.setItem(_cacheKey(key), JSON.stringify({ at, data })); } catch (e) {}
      return { data, at, stale: false };
    } catch (e) {
      const c = _readCache(key);
      if (c) return { data: c.data, at: c.at, stale: true, error: e };
      throw e;
    }
  }
  const c = _readCache(key);
  if (c) return { data: c.data, at: c.at, stale: true };
  // navigator.onLine can be wrong; with nothing saved, trying costs nothing.
  const data = await fn();
  return { data, at: Date.now(), stale: false };
}
function clearCache() {
  try { Object.keys(localStorage).filter((k) => k.indexOf("vela-cache-") === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
}
// "Offline · showing what you had at 07:12" for a stale result, "" for a fresh one.
function staleText(meta) {
  if (!meta || !meta.stale) return "";
  const d = new Date(meta.at), when = ymdLocal(d) === today() ? "at " + fmtTime(meta.at) : "on " + fmtDay(ymdLocal(d)) + " at " + fmtTime(meta.at);
  return (navigator.onLine === false ? "Offline" : "Couldn't reach Vela") + " · showing what you had " + when;
}
const staleNote = (meta) => (meta && meta.stale ? '<p class="stale" role="status">' + esc(staleText(meta)) + "</p>" : "");

/* ============ loading, error and empty states ============ */
function renderLoading(el, text) { if (el) el.innerHTML = '<p class="state state-loading" role="status">' + esc(text || "Loading…") + "</p>"; }
function renderEmpty(el, text, o) {
  if (el) el.innerHTML = '<p class="state state-empty">' + (o && o.html ? text : esc(text)) + "</p>";
}
// "Couldn't reach Vela. Try again" with a real button; retry re-runs whatever failed.
function renderError(el, retry, text) {
  if (!el) return;
  el.innerHTML = '<div class="state state-error" role="status"><p>' + esc(text || "Couldn't reach Vela.") + "</p>" +
    (retry ? '<button type="button" class="btn-secondary">Try again</button>' : "") + "</div>";
  const b = el.querySelector("button");
  if (b) b.addEventListener("click", () => { renderLoading(el); retry(); });
}
// The usual load: loading → (cached) fetch → empty or render, with the offline note on
// top and an error + retry when nothing could be shown. Returns the {data, at, stale}
// meta, or undefined after an error.
//   o.key      cache key (omit to skip the phone copy)
//   o.load     async () => data            (a data*.js function)
//   o.render   (data, meta) => void        (fills el)
//   o.empty    copy for "there is nothing"; o.isEmpty(data) overrides the null/[] test
//   o.loading  copy while waiting
async function loadInto(el, o) {
  if (!el) return;
  renderLoading(el, o.loading);
  let r;
  try {
    r = o.key ? await cached(o.key, o.load) : { data: await o.load(), at: Date.now(), stale: false };
  } catch (e) {
    console.warn("[companion]", o.key || "load", e);
    renderError(el, () => loadInto(el, o));
    return;
  }
  const isEmpty = o.isEmpty ? o.isEmpty(r.data) : (r.data == null || (Array.isArray(r.data) && !r.data.length));
  if (isEmpty && o.empty != null) renderEmpty(el, o.empty);
  else o.render(r.data, r);
  if (r.stale) el.insertAdjacentHTML("afterbegin", staleNote(r));
  return r;
}

/* ============ screen reader announcements ============ */
// For results that appear after a tap: a verdict, "Saved", an error. Cleared first so the
// same words said twice are read twice.
function announce(msg, o) {
  let live = $("announcer");
  if (!live) {
    live = document.createElement("div"); live.id = "announcer"; live.className = "sr-only";
    live.setAttribute("aria-live", "polite"); document.body.appendChild(live);
  }
  live.setAttribute("aria-live", o && o.assertive ? "assertive" : "polite");
  live.textContent = "";
  setTimeout(() => { live.textContent = msg; }, 60);
}

/* ============ the one pick-one control ============ */
// A segmented row with radiogroup semantics: one tab stop, arrows move the choice, the
// chosen option is a raised thumb. Every pick-one in the app is built with this.
//   o.options     [{value, label}] or ["Rough","OK","Good"] (values become 0,1,2)
//   o.value       the chosen value, or null/undefined for none yet
//   o.onChange    (value) => void, on tap or arrow key
//   o.label       accessible name, or o.labelledBy = id of a visible label
//   o.className   extra classes, e.g. "seg-wrap" for long rows that may wrap
// Returns the element; el.setValue(v) changes the choice without firing onChange,
// el.value reads it.
function segmented(o) {
  const g = document.createElement("div");
  g.className = "seg" + (o.className ? " " + o.className : "");
  g.setAttribute("role", "radiogroup");
  if (o.labelledBy) g.setAttribute("aria-labelledby", o.labelledBy);
  else if (o.label) g.setAttribute("aria-label", o.label);
  const opts = o.options.map((x, i) => (typeof x === "object" ? x : { value: i, label: String(x) }));
  const btns = opts.map((opt) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio"); b.textContent = opt.label; b._v = opt.value;
    b.addEventListener("click", () => set(opt.value, true));
    g.appendChild(b);
    return b;
  });
  function set(v, fire) {
    g.value = v;
    let any = false;
    btns.forEach((b) => { const on = b._v === v; any = any || on; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    if (!any && btns[0]) btns[0].tabIndex = 0;
    if (fire && o.onChange) o.onChange(v);
  }
  g.addEventListener("keydown", (e) => {
    const i = btns.indexOf(document.activeElement); if (i < 0) return;
    const n = btns.length;
    const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    const k = (j + n) % n; btns[k].focus(); set(btns[k]._v, true);
  });
  g.setValue = (v) => set(v, false);
  set(o.value, false);
  return g;
}

/* ============ hooks ============ */
// Keyed, so a tab that re-renders replaces its handler instead of stacking another.
const _hooks = { day: {}, tab: {}, online: {}, resume: {} };
const _run = (bag, args) => Object.keys(bag).forEach((k) => { try { bag[k].apply(null, args); } catch (e) { console.error("[companion] hook", k, e); } });
// fn(newYmd, oldYmd) when her local date rolls over while the app is open (left open
// overnight, back from the background after midnight). Reset anything day-scoped.
function onTodayChanged(key, fn) { _hooks.day[key] = fn; }
// fn(tabId) each time that tab is shown, including the first time.
function onTabShown(tab, fn) { _hooks.tab[tab] = fn; }
// fn() when the connection comes back.
function onReconnect(key, fn) { _hooks.online[key] = fn; }
// fn(msHidden) when she comes back to the app after it was in the background.
function onResume(key, fn) { _hooks.resume[key] = fn; }
// A keyed listener on window/document: re-registering under the same key replaces it.
const _listeners = {};
function listen(key, target, type, fn, opts) {
  const old = _listeners[key];
  if (old) old.target.removeEventListener(old.type, old.fn, old.opts);
  _listeners[key] = { target, type, fn, opts };
  target.addEventListener(type, fn, opts);
}

let _day = today(), _hiddenAt = 0;
function checkDay() {
  const d = today();
  if (d !== _day) { const old = _day; _day = d; _run(_hooks.day, [d, old]); }
}

/* ============ the shell ============ */
const TABS = ["today", "fuel", "strength", "library"];
let _tab = null;
const _scroll = {};
let _shellReady = false, _rendered = { uid: undefined, state: "" }, _seq = 0;

// "#library-routes" → {tab:"library", anchor:"library-routes"}; null when it isn't a tab.
function parseHash(h) {
  h = String(h || "").replace(/^#/, "");
  const t = h.split("-")[0];
  return TABS.indexOf(t) >= 0 ? { tab: t, anchor: h.indexOf("-") > 0 ? h : "" } : null;
}
const currentTab = () => _tab;

// Show one tab: remembers where she was in the one she left, restores it (or scrolls to an
// anchor), and on her own navigation moves focus to the tab's heading.
function showTab(tab, o) {
  o = o || {};
  if (TABS.indexOf(tab) < 0) tab = "today";
  const acct = $("acct"); if (acct) acct.open = false;
  if (_tab && _tab !== tab) _scroll[_tab] = window.scrollY;
  const changed = _tab !== tab;
  _tab = tab;
  TABS.forEach((t) => { const p = $(t); if (p) p.hidden = t !== tab; });
  $$("#tabs a[data-tab]").forEach((a) => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const panel = $(tab);
  // After the browser's own jump to a fragment, so ours wins.
  requestAnimationFrame(() => {
    const target = o.anchor && $(o.anchor);
    if (target) target.scrollIntoView({ block: "start" });
    // Another tab: back to where she was in it. Same tab, back from an anchor: its top.
    else if (changed) window.scrollTo(0, _scroll[tab] || 0);
    else if (o.restore) window.scrollTo(0, 0);
    if (o.focus && panel) {
      const h = panel.querySelector(".tab-h") || panel.querySelector("h2") || panel;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  });
  if (_hooks.tab[tab]) { try { _hooks.tab[tab](tab); } catch (e) { console.error(e); } }
}
// Navigate as a new history entry, so the phone's back gesture goes to the previous tab.
function goTo(hash) {
  hash = String(hash).replace(/^#/, "");
  const r = parseHash(hash); if (!r) return;
  if (location.hash !== "#" + hash) history.pushState(null, "", "#" + hash);
  showTab(r.tab, { focus: true, anchor: r.anchor });
}

function showScreen(id) {
  ["login", "notClient", "bootError", "booting", "app"].forEach((s) => { const el = $(s); if (el) el.hidden = s !== id; });
  const tabs = $("tabs"); if (tabs) tabs.hidden = id !== "app";
}

function setupShell() {
  if (_shellReady) return; _shellReady = true;
  try { history.scrollRestoration = "manual"; } catch (e) {}
  const acct = $("acct");
  if (acct) {
    document.addEventListener("click", (e) => { if (acct.open && !acct.contains(e.target)) acct.open = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && acct.open) { acct.open = false; acct.querySelector("summary").focus(); } });
  }
  // Tab bar and any in-page link to a tab ("#strength", "#library-routes") go through goTo.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const h = a.getAttribute("href");
    if (!parseHash(h) || $("app").hidden) return;
    e.preventDefault(); goTo(h);
  });
  window.addEventListener("popstate", () => {
    const r = parseHash(location.hash); if (!r || $("app").hidden) return;
    showTab(r.tab, { focus: true, anchor: r.anchor, restore: true });
  });
  const retry = $("bootRetry"); if (retry) retry.addEventListener("click", () => renderApp({ force: true }));
  // Offline banner and reconnect.
  const banner = () => { const b = $("offline"); if (b) b.hidden = navigator.onLine !== false; };
  window.addEventListener("offline", banner);
  window.addEventListener("online", () => {
    banner();
    if (_rendered.state === "error") renderApp({ force: true }); else _run(_hooks.online, []);
  });
  banner();
  // The date can roll over while she's away: check on return and once a minute.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { _hiddenAt = Date.now(); return; }
    checkDay();
    if (_hiddenAt) { const gone = Date.now() - _hiddenAt; _hiddenAt = 0; _run(_hooks.resume, [gone]); }
  });
  window.addEventListener("focus", checkDay);
  window.addEventListener("pageshow", checkDay);
  setInterval(checkDay, 60000);
}

// Runs one tab's init into its container; an init that throws leaves an error + retry
// there rather than a blank tab.
function runInit(tab) {
  const el = $(tab), fn = window["init" + tab[0].toUpperCase() + tab.slice(1)];
  if (!el || typeof fn !== "function") return;
  Promise.resolve().then(() => fn(el)).catch((e) => { console.error("[companion] init", tab, e); renderError(el, () => runInit(tab)); });
}

// Decide what to show for whoever is signed in on this phone. Rebuilds the tabs only when
// that person changes (or force): coming back from another app must not reset her place.
//   o.user   the user from an auth event, so we don't ask the auth library again inside
//            its own callback; undefined means "look it up".
window.renderApp = async function (o) {
  // core.js also loads on nutrition.html, where a restored session's SIGNED_IN can land
  // before nutrition.js takes over renderApp. The shell isn't there: leave the page alone.
  if (!$("tabs")) return;
  o = o || {};
  const user = o.user !== undefined ? o.user : await currentUser();
  const uid = user ? user.id : null;
  // A same-user SIGNED_IN (the auth library sends one each time the app returns to the
  // screen) stops here, including while the first render is still loading.
  if (!o.force && uid === _rendered.uid && _rendered.state !== "error") return;
  // No await between the check above and these two lines, so two calls can't both pass.
  const seq = ++_seq;
  _rendered = { uid, state: "pending" };
  _uid = uid;
  const acct = $("acct");
  if (acct) { acct.hidden = !user; acct.open = false; }
  if ($("acctWho")) $("acctWho").textContent = user ? user.email || "" : "";
  if (!user) { _identity = { client: null, firstName: "", coachFirstName: "", coachWhatsApp: "" }; _rendered.state = "ok"; showScreen("login"); return; }

  // Only show "getting ready" if the lookup is slow, so a quick one doesn't flash.
  const slow = setTimeout(() => { if (seq === _seq && _rendered.state === "pending") showScreen("booting"); }, 400);
  let r;
  try { r = await cached("identity", myIdentity); }
  catch (e) {
    clearTimeout(slow); if (seq !== _seq) return;
    console.warn("[companion] identity", e);
    _rendered.state = "error"; showScreen("bootError"); return;
  }
  clearTimeout(slow);
  if (seq !== _seq) return;
  _identity = r.data || { client: null };
  _rendered.state = "ok";
  // "Not an athlete" only when Vela answered and there really is no client row.
  if (!_identity.client) { showScreen("notClient"); return; }
  showScreen("app");
  const start = parseHash(location.hash);
  if (!start) history.replaceState(null, "", "#today");
  TABS.forEach(runInit);
  showTab(start ? start.tab : "today", { anchor: start && start.anchor });
};

function boot() {
  setupShell();
  renderApp();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
if ($("tabs")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);
}
