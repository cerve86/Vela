/* Connect your watch (connect.html): her side of intervals.icu, one step at a time.

   Her watch → intervals.icu → Vela. She makes a free intervals.icu account, connects her
   watch to it directly (never only through Strava: intervals.icu can't pass Strava's runs
   on), and lets her coach coach her there. Her coach then links her in the portal, and
   the companion reads her mornings and workouts from intervals.icu from then on.

   Works signed out too, so her coach can send the link before she has the companion: the
   steps are the same, and only her coach's name and the live check need her signed in.

   Loaded after core.js (esc, announce, whatsAppHref), data.js (myIdentity,
   intervalsStatus) and auth.js (currentUser). core.js does not boot here: no tab bar. */

/* ============ what she might train with ============ */
// icu: the name on intervals.icu's Settings page. acct: the account she signs in with
// there. wellness: false for a device that sends workouts but takes no overnight readings.
const CON_DEVICES = [
  { id: "garmin", label: "Garmin", icu: "Garmin", acct: "Garmin Connect", kind: "watch" },
  { id: "coros", label: "Coros", icu: "Coros", acct: "Coros", kind: "watch" },
  { id: "apple", label: "Apple Watch", kind: "apple" },
  { id: "polar", label: "Polar", icu: "Polar", acct: "Polar Flow", kind: "watch" },
  { id: "suunto", label: "Suunto", icu: "Suunto", acct: "Suunto", kind: "watch" },
  { id: "huawei", label: "Huawei", icu: "Huawei", acct: "Huawei", kind: "watch" },
  { id: "amazfit", label: "Amazfit", icu: "Amazfit", acct: "Zepp", kind: "watch" },
  { id: "wahoo", label: "Wahoo", icu: "Wahoo", acct: "Wahoo", kind: "watch", wellness: false },
  { id: "oura", label: "Oura ring", icu: "Oura", acct: "Oura", kind: "ring" },
  { id: "whoop", label: "WHOOP", icu: "WHOOP", acct: "WHOOP", kind: "ring" },
  { id: "other", label: "Something else", kind: "other" },
  { id: "none", label: "No watch", kind: "none" }
];
const CON_FLOW = ["device", "account", "connect", "coach", "tell"];
// A device intervals.icu can't reach ends after the first question, with what to do instead.
const conSteps = (dev) => (!dev ? ["device"] : dev.kind === "other" || dev.kind === "none" ? ["device", dev.kind] : CON_FLOW);
const CON_STEP_NAMES = { device: "Your watch", account: "Account", connect: "Connect", coach: "Coach", tell: "Done", other: "Your watch", none: "Your watch" };

const CON_LINKS = {
  home: "https://intervals.icu/",
  settings: "https://intervals.icu/settings",
  athletes: "https://intervals.icu/athletes",
  healthfit: "https://apps.apple.com/app/healthfit/id1202650514"
};

/* ============ what this phone keeps ============ */
// vela-*: signOut() clears it with the rest. {device, step, done}: where she got to, so the
// guide picks up there when she comes back from intervals.icu in another tab.
const CON_KEY = "vela-connect-v1";
function conLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(CON_KEY));
    if (s && typeof s === "object") return { device: s.device || null, step: s.step || "device", done: !!s.done };
  } catch (e) {}
  return { device: null, step: "device", done: false };
}
function conSave() { try { localStorage.setItem(CON_KEY, JSON.stringify(_con)); } catch (e) {} }

/* ============ the page ============ */
let _con = null;
let _conWho = { signedIn: false, coach: "" };
let _conStatus = null;        // the live check: null while it runs
let _conCheckedAt = 0;
let _conOpen = false;          // all set already: the steps stay folded until she asks

const conDev = () => CON_DEVICES.find((d) => d.id === _con.device) || null;
const conCoach = (start) => _conWho.coach || (start ? "Your coach" : "your coach");
const conExt = (href, label) =>
  '<a class="btn-secondary con-ext" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>' +
  '<span class="sr-only"> (opens in a new tab)</span></a>';
const conNav = (next) =>
  '<div class="con-nav"><button type="button" class="btn-secondary" data-act="back">Back</button>' +
  (next || '<button type="button" class="btn-primary" data-act="next">Done, next</button>') + "</div>";
const conToday = '<a class="btn-primary" href="index.html#today">Back to Today</a>';

// Who is on this phone, for her coach's name and WhatsApp. The companion's own offline copy
// of her identity answers at once; Vela then has the last word.
async function conLoadWho() {
  let user = null;
  try { user = await currentUser(); } catch (e) {}
  if (!user) { _conWho = { signedIn: false, coach: "" }; return; }
  _conWho = { signedIn: true, coach: "" };
  const use = (d) => {
    if (!d) return;
    _conWho.coach = d.coachFirstName || _conWho.coach;
    // core.js's whatsAppHref reads her coach's link from here.
    _identity = Object.assign({}, _identity, { coachFirstName: d.coachFirstName || "", coachWhatsApp: d.coachWhatsApp || "" });
  };
  try { const c = JSON.parse(localStorage.getItem("vela-cache-" + user.id + "-identity")); use(c && c.data); } catch (e) {}
  conRender();
  try { use(await myIdentity()); } catch (e) { /* offline: keep what the phone had */ }
}

// Asks Vela whether her watch is coming through. Runs when the page opens (signed in), on
// the last step, and when she comes back from intervals.icu.
async function conCheck() {
  if (!_conWho.signedIn) { _conStatus = { state: "signed-out" }; conRender(); return; }
  _conStatus = null; _conCheckedAt = Date.now();
  conRenderLive();
  _conStatus = await intervalsStatus();
  conRender();
  const v = conStatusView(_conStatus);
  if (v && _con.step === "tell") announce(v.title);
}

/* ============ what the live check says, in her words ============ */
// {tone: ok | warn | wait | muted, title, text, fix: step to send her to, or null}.
function conStatusView(st) {
  const C = conCoach(true), c = conCoach();
  if (!st) return { tone: "muted", title: "Checking your connection…", text: "", fix: null };
  switch (st.state) {
    case "signed-out":
      return { tone: "muted", title: "Sign in to see when it's working", text: "Open the companion and sign in, and this page checks your connection for you.", fix: null };
    case "no-key":
    case "bad-key":
      return { tone: "wait", title: "Waiting for " + c, text: C + " is still switching intervals.icu on for Vela. Your part is done: it starts working as soon as she has.", fix: null };
    case "no-athlete-id":
      return { tone: "wait", title: "Waiting for " + c, text: C + " links your intervals.icu account in Vela once she has accepted your coaching request. Usually within a day.", fix: null };
    case "denied":
      return { tone: "wait", title: "Waiting for your coaching request", text: C + " has linked your account, but intervals.icu won't share it until she's your coach there.", fix: "coach" };
    case "connected": {
      const k = st.conn || {};
      if (k.issue === "withheld-only")
        return { tone: "warn", title: "Almost there", text: "Your runs reach intervals.icu only through Strava, and Strava doesn't let them be passed on to Vela. Connect your watch to intervals.icu directly too.", fix: "connect" };
      if (k.issue === "no-wellness")
        return { tone: "warn", title: "Connected, but no readings yet", text: "No HRV or resting heart rate has arrived in the last two weeks. Check that wellness is ticked in your watch's connection. A new connection can take a day.", fix: "connect" };
      const shared = (k.shared || []).map((s) => s.count + (s.count === 1 ? " workout" : " workouts") + " from " + s.name).join(" and ");
      let text = "Vela can see your watch: HRV on " + (k.hrvDays || 0) + " of the last " + (k.days || 14) + " days" +
        (shared ? ", and " + shared + " in the last four weeks." : ".");
      if (k.issue === "some-withheld") text += k.withheldCount === 1 ? " One came in only through Strava, so Vela doesn't see it." : " A few came in only through Strava, so Vela doesn't see those.";
      if (k.issue === "no-activities") text += " No workouts in the last four weeks yet.";
      return { tone: "ok", title: "You're connected", text, fix: null };
    }
    default:
      return { tone: "muted", title: "Couldn't check just now", text: "Try again in a minute.", fix: null };
  }
}

function conLiveMarkup() {
  const v = conStatusView(_conStatus);
  const fix = v.fix ? '<button type="button" class="btn-text" data-act="goto" data-step="' + v.fix + '">Show me how</button>' : "";
  const again = _conStatus && _conStatus.state !== "signed-out" ? '<button type="button" class="btn-text" data-act="recheck">Check again</button>' : "";
  return '<div class="con-live is-' + v.tone + '" role="status"><p class="con-live-h">' + esc(v.title) + "</p>" +
    (v.text ? "<p>" + esc(v.text) + "</p>" : "") + (fix || again ? '<p class="con-live-acts">' + fix + again + "</p>" : "") + "</div>";
}
// Only the live box, so a check finishing never moves her focus.
function conRenderLive() { $$(".con-livebox").forEach((b) => { b.innerHTML = conLiveMarkup(); }); }

/* ============ the steps ============ */
function conStepMarkup(step) {
  const dev = conDev(), C = conCoach(true), c = conCoach();
  const name = dev ? dev.label : "watch";
  switch (step) {
    case "device":
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">What do you train with?</h2>' +
        '<p class="hintline">Pick what you wear when you run.</p>' +
        '<div class="con-tiles" role="group" aria-labelledby="conStepH">' +
        CON_DEVICES.map((d) => '<button type="button" class="con-tile' + (d.kind === "other" || d.kind === "none" ? " quiet" : "") +
          '" data-act="pick" data-dev="' + d.id + '" aria-pressed="' + (_con.device === d.id) + '">' + esc(d.label) + "</button>").join("") +
        "</div>" + (_con.device ? '<div class="con-nav"><button type="button" class="btn-primary" data-act="next">Next</button></div>' : "");

    case "account":
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">Make a free intervals.icu account</h2>' +
        "<p>intervals.icu is the free training site " + esc(c) + " uses to plan and review your training. Your " + esc(name) +
        " sends everything there, and Vela reads it from there.</p>" +
        conExt(CON_LINKS.home, "Open intervals.icu") +
        '<p class="hintline">Already have an account? Then this step is done. Any way of signing up works.</p>' + conNav();

    case "connect": {
      if (dev && dev.kind === "apple") {
        return '<h2 class="section-h3" id="conStepH" tabindex="-1">Send your Apple Watch to intervals.icu</h2>' +
          "<p>Apple Watch doesn't connect to intervals.icu on its own, so a small iPhone app passes your data along.</p>" +
          '<ol class="con-list">' +
          "<li><p>Install <b>HealthFit</b> from the App Store. It's a paid app.</p>" + conExt(CON_LINKS.healthfit, "HealthFit on the App Store") + "</li>" +
          "<li><p>Open HealthFit, let it read your Health data, and connect <b>intervals.icu</b> in its settings.</p></li>" +
          "<li><p>Switch on automatic sync for your workouts and your health readings: <b>HRV, resting heart rate and sleep</b>.</p></li>" +
          "</ol>" +
          '<p class="inset con-note"><b>Already have the Vela app?</b> It reads your Apple Watch through Apple Health, so your morning readings reach Vela without HealthFit. You can skip to the next step.</p>' +
          conNav();
      }
      const wellness = dev && dev.wellness !== false;
      const notes = [];
      if (dev && dev.kind === "ring") notes.push("Your " + esc(dev.label) + " sends your sleep, HRV and resting heart rate. Your runs come from the watch or app you run with: connect that here too if intervals.icu lists it.");
      if (dev && dev.wellness === false) notes.push("Wahoo sends your workouts but takes no readings overnight. If you measure HRV another way, add it on Today.");
      notes.push("<b>Use Strava too?</b> Keep it. Just connect your " + (dev && dev.kind === "ring" ? "watch" : esc(name)) + " here as well: runs that reach intervals.icu only through Strava can't be passed on to Vela.");
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">Connect your ' + esc(name) + " to intervals.icu</h2>" +
        '<ol class="con-list">' +
        "<li><p>In intervals.icu, open <b>Settings</b>.</p>" + conExt(CON_LINKS.settings, "Open Settings") + "</li>" +
        "<li><p>Find <b>" + esc(dev ? dev.icu : "your watch") + "</b> and tap <b>Connect</b>. Sign in with your " + esc(dev ? dev.acct : "watch's") +
        " account and allow everything it asks for.</p></li>" +
        (wellness ? "<li><p>Back on intervals.icu, under " + esc(dev ? dev.icu : "your watch") + ", make sure the wellness data is ticked: <b>HRV, resting heart rate and sleep</b>.</p></li>" : "") +
        "</ol>" + notes.map((n) => '<p class="inset con-note">' + n + "</p>").join("") + conNav();
    }

    case "coach":
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">Let ' + esc(c) + " coach you on intervals.icu</h2>" +
        "<p>This lets " + esc(c) + " see what your watch sends, and lets Vela read it for you.</p>" +
        '<ol class="con-list">' +
        "<li><p>Open the <b>Athletes</b> page on intervals.icu.</p>" + conExt(CON_LINKS.athletes, "Open Athletes") + "</li>" +
        "<li><p>Tap <b>Add a coach</b>, find " + esc(c) + " and send the request.</p></li>" +
        "</ol>" +
        '<p class="hintline">' + esc(C) + " accepts it on her side. If she has already sent you a request, accept that one instead.</p>" + conNav();

    case "tell": {
      const msg = "Hi " + (_conWho.coach || "") + "! I've connected my " + name + " to intervals.icu and sent you a coaching request.";
      const wa = _conWho.signedIn ? whatsAppHref(msg.replace("Hi !", "Hi!")) : "";
      const waBtn = wa
        ? '<a class="btn-secondary con-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' +
          (coachWhatsAppIsGroup() ? "Tell the WhatsApp group" : "WhatsApp " + esc(c)) + '<span class="sr-only"> (opens WhatsApp)</span></a>'
        : "<p>Send " + esc(c) + " a message to let her know.</p>";
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">Tell ' + esc(c) + " you're set</h2>" +
        "<p>" + esc(C) + " links your account in Vela once she has accepted your request.</p>" + waBtn +
        (_conWho.signedIn ? '<div class="con-livebox">' + conLiveMarkup() + "</div>" : "") +
        conNav('<button type="button" class="btn-primary" data-act="finish">Finish</button>');
    }

    case "other": {
      const wa = whatsAppHref(("Hi " + (_conWho.coach || "") + "! My watch isn't one intervals.icu connects to. What's the best way to share my numbers?").replace("Hi !", "Hi!"));
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">intervals.icu doesn\'t connect to that one</h2>' +
        "<p>It connects to Garmin, Coros, Polar, Suunto, Huawei, Amazfit, Wahoo, Oura, WHOOP and, through an app, Apple Watch.</p>" +
        "<p>Today works well without it: answer the four quick taps, and if you like, add your watch's HRV and resting heart rate under <b>Add your watch numbers</b>.</p>" +
        (wa ? '<p><a class="btn-secondary" href="' + esc(wa) + '" target="_blank" rel="noopener">Ask ' + esc(c) + '<span class="sr-only"> (opens WhatsApp)</span></a></p>' : "") +
        conNav(conToday);
    }

    case "none":
      return '<h2 class="section-h3" id="conStepH" tabindex="-1">No watch? No problem</h2>' +
        "<p>You don't need intervals.icu. The four quick taps on Today are what matter most: your sleep, your legs, your energy and how your last session felt.</p>" +
        conNav(conToday);
  }
  return "";
}

// "All set" only once the check says so; until then her part is done and she is waiting.
function conDoneMarkup() {
  const dev = conDev(), name = esc(dev ? dev.label : "watch");
  const set = _conStatus && _conStatus.state === "connected" && conStatusView(_conStatus).tone === "ok";
  return '<h2 class="section-h3" id="conStepH" tabindex="-1">' + (set ? "All set" : "Your part is done") + "</h2>" +
    (set
      ? "<p>From tomorrow morning, the readings from your " + name + " appear on Today by themselves. The four quick taps still matter most.</p>"
      : "<p>Once " + esc(conCoach()) + " has linked you, the readings from your " + name + " appear on Today by themselves. Until then, Today works as it always has.</p>") +
    (_conWho.signedIn ? '<div class="con-livebox">' + conLiveMarkup() + "</div>" : "") +
    '<div class="con-nav con-nav-col">' + conToday +
    '<button type="button" class="btn-text" data-act="restart">Go through the steps again</button></div>';
}

/* ============ drawing ============ */
function conRenderProgress() {
  const box = $("conProgress"), steps = conSteps(conDev());
  if (_con.done || steps.length < 3) { box.innerHTML = ""; return; }
  const i = Math.max(0, steps.indexOf(_con.step));
  box.innerHTML = "<p>Step " + (i + 1) + " of " + steps.length + " · " + esc(CON_STEP_NAMES[_con.step] || "") + "</p>" +
    '<div class="con-bar" aria-hidden="true">' + steps.map((_, j) => '<span class="' + (j <= i ? "on" : "") + '"></span>').join("") + "</div>";
}

// At the top: the live answer once she is connected, so coming back shows it first. Not
// while the step in front of her shows it already (the last one, and "All set").
function conRenderStatus() {
  const box = $("conStatus"), st = _conStatus;
  const connected = st && st.state === "connected";
  const inCard = _conWho.signedIn && (_con.done || _con.step === "tell");
  if (!connected || (inCard && _conOpen)) { box.innerHTML = ""; $("conGuide").hidden = false; return; }
  const clear = conStatusView(st).tone === "ok";
  box.innerHTML = '<div class="con-livebox con-top">' + conLiveMarkup() + "</div>" +
    (clear && !_conOpen ? '<p><button type="button" class="btn-text con-open" data-act="open">See the steps again</button></p>' : "");
  // All set: the steps fold away until she asks for them. A problem keeps them open.
  $("conGuide").hidden = clear && !_conOpen;
}

function conRender() {
  if (!_con) return;
  conRenderStatus();
  conRenderProgress();
  $("conStep").innerHTML = _con.done ? conDoneMarkup() : conStepMarkup(_con.step);
}

// A move between steps: draw it, take her to its heading, and say where she is.
function conGo(step, o) {
  _con.step = step; _con.done = false; _conOpen = true; conSave();
  conRender();
  const h = $("conStepH");
  if (h) {
    const card = $("conStep"), top = card.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) card.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }
  if (!(o && o.quiet)) {
    const steps = conSteps(conDev()), i = steps.indexOf(step);
    announce((steps.length > 2 ? "Step " + (i + 1) + " of " + steps.length + ". " : "") + (h ? h.textContent : ""));
  }
  if (step === "tell" && _conWho.signedIn && (!_conStatus || Date.now() - _conCheckedAt > 20000)) conCheck();
}

function conOnClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, steps = conSteps(conDev()), i = steps.indexOf(_con.step);
  if (act === "pick") {
    _con.device = b.dataset.dev;
    conGo(conSteps(conDev())[1]);
  } else if (act === "next") conGo(steps[Math.min(steps.length - 1, i + 1)]);
  else if (act === "back") conGo(steps[Math.max(0, i - 1)]);
  else if (act === "finish") {
    _con.done = true; _conOpen = true; conSave(); conRender();
    const h = $("conStepH"); if (h) h.focus();
    announce("All set.");
    if (_conWho.signedIn) conCheck();
  } else if (act === "restart") conGo("device");
  else if (act === "open") { _conOpen = true; conRender(); }
  else if (act === "goto") {
    _conOpen = true;
    conGo(conDev() ? b.dataset.step : "device");
  } else if (act === "recheck") conCheck();
}

// Back to the companion through history when she came from it, so she lands where she was.
function conBackClick(e) {
  let fromApp = false;
  try { const r = new URL(document.referrer); fromApp = r.origin === location.origin && /^\/companion\/?(index\.html)?$/.test(r.pathname); } catch (_) {}
  if (!fromApp || history.length < 2) return;
  e.preventDefault();
  history.back();
}

function initConnect() {
  _con = conLoad();
  if (!conSteps(conDev()).includes(_con.step)) _con.step = "device";
  $("conBack").addEventListener("click", conBackClick);
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("main.con")) conOnClick(e); });
  conRender();
  // Coming back from intervals.icu in the other tab: if she was waiting on the check, ask again.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !_conWho.signedIn || Date.now() - _conCheckedAt < 20000) return;
    if (_con.done || _con.step === "tell" || (_conStatus && _conStatus.state === "connected")) conCheck();
  });
  // There is no shell here: an auth change (signed in, signed out in another tab) only
  // changes her coach's name and whether the check can run.
  // The auth library sends SIGNED_IN each time the page comes back, hence the 20 s.
  window.renderApp = async () => {
    await conLoadWho();
    if (!_conWho.signedIn) { _conStatus = { state: "signed-out" }; conRender(); return; }
    conRender();
    if (!_conStatus || _conStatus.state === "signed-out" || Date.now() - _conCheckedAt > 20000) conCheck();
  };
  window.renderApp();
}

if (typeof document !== "undefined" && document.getElementById("conStep")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initConnect);
  else initConnect();
}
