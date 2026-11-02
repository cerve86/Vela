/* The energy & nutrition check (nutrition.html). Three short sections: energy (the warning
   signs used in screens like the LEAF-Q), iron and vitamin D. The answers stay on this
   phone; the only thing that ever leaves it is the three results and the date, and only
   when she taps "Share with <coach>".

   Loaded after core.js (esc, segmented, announce, dates), auth.js (currentUser) and
   data.js (myClientId, myIdentity). core.js does not boot here: there is no tab bar. */

/* ============ the questions and how they score ============ */
// period: true adds "Doesn't apply" (pregnant, breastfeeding, past menopause, or she'd
// rather not say). "Doesn't apply" completes the question but never counts toward a flag.
// protective: true is scored the other way round (Yes lowers the odds).
const NUT_SECTIONS = [
  {
    id: "energy", title: "Energy",
    intro: "How your body has been running lately, based on the warning signs used in screens like the LEAF-Q. Nothing here is about food or weight.",
    qs: [
      { id: "e1", text: "An injury in the last year that kept me out of training for a while" },
      { id: "e2", text: "Recurring niggles, stress reactions or bone-stress injuries" },
      { id: "e3", text: "Regular bloating, constipation or other gut discomfort" },
      // Each on its own is enough to flag: missing or irregular periods are one of the
      // clearest signs of under-fuelling. e5 matters most for athletes on hormonal
      // contraception, who answer No to e4 by its wording.
      { id: "e4", text: "My periods are irregular or have stopped, and contraception doesn't explain it", period: true, redFlag: true },
      { id: "e5", text: "My periods changed or stopped when my training went up", period: true, redFlag: true },
      { id: "e6", text: "Tiredness or heavy legs that rest doesn't fix" },
      { id: "e7", text: "I feel cold, flat or low on drive a lot of the time" },
      { id: "e8", text: "I seem to catch every bug going" }
    ],
    verdicts: {
      clear: { pill: "Nothing flagging", msg: "Your body looks like it's getting the fuel the training asks for." },
      watch: { pill: "One to watch", msg: "One sign on its own is common in hard training. Keep an eye on it and run this again in a few weeks." },
      flag: { pill: "Worth a GP visit", msg: "Together these can point to under-fuelling, when food hasn't kept pace with training. Nothing is wrong with you, and it's very fixable once it's caught." },
      periods: { pill: "Worth a GP visit", msg: "Periods that go irregular or stop are one of the clearest signs that food hasn't kept pace with training. That's worth a doctor's visit even on its own, and it's very fixable once it's caught." }
    }
  },
  {
    id: "iron", title: "Iron",
    intro: "A few things that raise the odds of running low on iron.",
    qs: [
      { id: "i1", text: "My periods are heavy or long", period: true },
      { id: "i2", text: "I eat little or no red meat" },
      { id: "i3", text: "I've been told my iron or ferritin was low before" },
      { id: "i4", text: "I have gut problems, or coeliac disease" },
      { id: "i5", text: "I'm often breathless or wiped out, beyond normal training tiredness" },
      { id: "i6", text: "My training load is high right now" }
    ],
    verdicts: {
      clear: { pill: "Nothing flagging", msg: "No strong iron risk factors right now." },
      watch: { pill: "One to watch", msg: "One risk factor. Not a worry on its own, but worth asking about at your next blood test." },
      flag: { pill: "Worth a blood test", msg: "A few risk factors together. Low iron is common in women who train for endurance, and a simple blood test shows where you are." }
    }
  },
  {
    id: "vitamin_d", title: "Vitamin D",
    intro: "Mostly about how much sun reaches your skin, and whether you take a supplement.",
    qs: [
      { id: "v1", text: "Most of my day is spent indoors or in air-con" },
      { id: "v2", text: "I train early or late, so I'm rarely outside in the middle of the day" },
      { id: "v3", text: "I'm usually covered up or wearing sunscreen when I'm outside" },
      { id: "v4", text: "I have a darker skin tone" },
      { id: "v5", text: "I take a vitamin D supplement", protective: true }
    ],
    verdicts: {
      clear: { pill: "Nothing flagging", msg: "Low vitamin D risk from these." },
      watch: { pill: "One to watch", msg: "One thing raises the odds a little. Worth asking about at your next blood test." },
      flag: { pill: "Worth a blood test", msg: "A few things here raise the odds of low vitamin D. It's common even in sunny places, and a blood test shows where you are." }
    }
  }
];
const NUT_LEVELS = ["clear", "watch", "flag"];

// One section's state from her answers: {answered, total, complete, level, periodsFlag}.
// level is null until every question has an answer, so one "No" never reads as an all-clear.
function nutScore(sec, answers) {
  const total = sec.qs.length;
  const answered = sec.qs.filter((q) => answers[q.id]).length;
  const complete = answered === total;
  const yes = (q) => answers[q.id] === "yes";
  let level = null, periodsFlag = false;
  if (sec.id === "energy") {
    // Missing or irregular periods flag on their own; otherwise two or more of the rest.
    periodsFlag = sec.qs.some((q) => q.redFlag && yes(q));
    const signs = sec.qs.filter((q) => !q.redFlag && yes(q)).length;
    if (complete) level = periodsFlag || signs >= 2 ? "flag" : signs === 1 ? "watch" : "clear";
  } else if (sec.id === "vitamin_d") {
    // How little sun reaches her skin sets the odds; a supplement brings them down a step.
    const risk = sec.qs.filter((q) => !q.protective && yes(q)).length;
    let i = Math.min(risk, 2);
    if (sec.qs.some((q) => q.protective && yes(q))) i = Math.max(0, i - 1);
    if (complete) level = NUT_LEVELS[i];
  } else {
    const risk = sec.qs.filter((q) => yes(q)).length;
    if (complete) level = risk >= 2 ? "flag" : risk === 1 ? "watch" : "clear";
  }
  return { answered, total, complete, level, periodsFlag };
}

// All three sections: {energy, iron, vitamin_d, periods_flag} once every section is done,
// else null. The same shape is what a share sends.
function nutResults(answers) {
  const s = NUT_SECTIONS.map((sec) => nutScore(sec, answers));
  if (!s.every((x) => x.complete)) return null;
  return { energy: s[0].level, iron: s[1].level, vitamin_d: s[2].level, periods_flag: s[0].periodsFlag };
}
const nutSame = (a, b) => !!a && !!b && ["energy", "iron", "vitamin_d", "periods_flag"].every((k) => a[k] === b[k]);

/* ============ what this phone keeps ============ */
// vela-*: signOut() clears it, so a family iPad never shows the next person her answers.
//   answers        {e1: "yes" | "no" | "na", …} for the check in progress or just done
//   completedAt    ms, when all three sections were first finished
//   results        nutResults(answers) at that point, kept current if she changes an answer
//   sharedAt       ms, when she last shared this check; sharedResults = what was sent
//   prev           {completedAt, results, sharedAt, sharedResults} of the check before
//                  this one, so "Last done" survives starting a new check
const NUT_KEY = "vela-nutrition-v2";
// The first version saved undated answers forever under these, and its questions and scoring
// have since changed, so they can't be carried over honestly.
const NUT_OLD_KEYS = ["rb-screen2-mod-reds", "rb-screen2-mod-iron", "rb-screen2-mod-vitd"];
const nutBlank = () => ({ answers: {}, completedAt: null, results: null, sharedAt: null, sharedResults: null, prev: null });
function nutLoad() {
  try { NUT_OLD_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  try {
    const s = JSON.parse(localStorage.getItem(NUT_KEY));
    if (s && typeof s === "object" && s.answers) return Object.assign(nutBlank(), s);
  } catch (e) {}
  return nutBlank();
}
function nutSave(st) { try { localStorage.setItem(NUT_KEY, JSON.stringify(st)); } catch (e) {} }

/* ============ the one write: sharing the results ============ */
// shareNutritionResults(results) lives in js/data.js with every other Supabase call.

/* ============ the page ============ */
let _nut = null;                                   // saved state
let _nutWho = { signedIn: false, coach: "", isClient: null };
let _nutSharing = false, _nutShareErr = "";
const _nutLevels = {};                             // last level shown per section, for announcements

const nutCoach = (start) => _nutWho.coach || (start ? "Your coach" : "your coach");
const nutPrivacy = () => "Private to this phone unless you choose to share it with " + nutCoach() + ".";
const nutDate = (ms) => fmtDay(ymdLocal(new Date(ms)));
const nutReduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Back to the tab she came from: Fuel links here with ?from=fuel (a referrer carries no #).
const nutFrom = () => (new URLSearchParams(location.search).get("from") === "fuel" ? "fuel" : "today");
// Came straight from the companion: going back through history returns her to the tab and
// the place she left (and lets Fuel refresh its "Last done" line on pageshow).
function nutBackClick(e) {
  let fromApp = false;
  try { const r = new URL(document.referrer); fromApp = r.origin === location.origin && /^\/companion\/?(index\.html)?$/.test(r.pathname); } catch (_) {}
  if (!fromApp || history.length < 2) return;
  e.preventDefault();
  history.back();
}

// Who is on this phone, for the coach's name and whether sharing can work. The companion's
// own offline copy of her identity answers at once; Vela then has the last word.
async function nutLoadWho() {
  let user = null;
  try { user = await currentUser(); } catch (e) {}
  if (!user) { _nutWho = { signedIn: false, coach: "", isClient: null }; return; }
  _nutWho = { signedIn: true, coach: "", isClient: null };
  try {
    const c = JSON.parse(localStorage.getItem("vela-cache-" + user.id + "-identity"));
    if (c && c.data) { _nutWho.coach = c.data.coachFirstName || ""; _nutWho.isClient = !!c.data.client; }
  } catch (e) {}
  nutRenderNames();
  try {
    const id = await myIdentity();
    _nutWho.coach = (id && id.coachFirstName) || _nutWho.coach;
    _nutWho.isClient = !!(id && id.client);
  } catch (e) { /* offline: keep what the phone had */ }
}

function nutRenderNames() {
  $$(".nut-privacy").forEach((p) => { p.textContent = nutPrivacy(); });
  nutRenderStatus();
  nutRenderSummary();
}

function nutSectionMarkup(sec) {
  let hinted = false;
  const rows = sec.qs.map((q) => {
    // One note before the first period question, not under every one.
    const hint = q.period && !hinted ? (hinted = true,
      '<p class="hintline nut-hint">For questions about periods, choose Doesn\'t apply if you\'re pregnant, breastfeeding or past menopause, or if you\'d rather not say.</p>') : "";
    return hint + '<div class="nut-q' + (q.period ? " nut-q3" : "") + '" data-q="' + q.id + '">' +
      '<p class="nut-qt" id="nq-' + q.id + '">' + esc(q.text) + "</p></div>";
  }).join("");
  return '<section class="card nut-mod" id="nut-' + sec.id + '" aria-labelledby="nut-' + sec.id + '-h">' +
    '<h2 class="section-h3 nut-mod-h" id="nut-' + sec.id + '-h" tabindex="-1">' + esc(sec.title) + "</h2>" +
    '<p class="hintline nut-intro">' + esc(sec.intro) + "</p>" +
    '<p class="nut-count" id="nut-' + sec.id + '-count"></p>' +
    '<div class="nut-qs">' + rows + "</div>" +
    '<div class="nut-verdict" id="nut-' + sec.id + '-out"></div></section>';
}

function nutRenderSections() {
  const box = $("nutSections");
  box.innerHTML = NUT_SECTIONS.map(nutSectionMarkup).join("");
  NUT_SECTIONS.forEach((sec) => {
    sec.qs.forEach((q) => {
      const opts = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
      if (q.period) opts.push({ value: "na", label: "Doesn't apply" });
      const seg = segmented({
        options: opts, value: _nut.answers[q.id] || null, labelledBy: "nq-" + q.id,
        onChange: (v) => nutAnswer(sec, q, v)
      });
      box.querySelector('[data-q="' + q.id + '"]').appendChild(seg);
    });
    _nutLevels[sec.id] = nutScore(sec, _nut.answers).level;
    nutRenderSection(sec);
  });
}

function nutRenderSection(sec) {
  const s = nutScore(sec, _nut.answers);
  $("nut-" + sec.id + "-count").textContent = s.complete ? "All " + s.total + " answered" : s.answered + " of " + s.total + " answered";
  const out = $("nut-" + sec.id + "-out");
  if (!s.level) { out.className = "nut-verdict"; out.innerHTML = ""; return s; }
  const v = s.periodsFlag ? sec.verdicts.periods : sec.verdicts[s.level];
  out.className = "nut-verdict is-" + s.level;
  out.innerHTML = '<p class="nut-pill">' + esc(v.pill) + "</p><p>" + esc(v.msg) + "</p>";
  return s;
}

function nutAnswer(sec, q, v) {
  _nut.answers[q.id] = v;
  const wasDone = !!_nut.results;
  const results = nutResults(_nut.answers);
  if (results) {
    if (!_nut.completedAt) _nut.completedAt = Date.now();
    _nut.results = results;
  }
  nutSave(_nut);
  const s = nutRenderSection(sec);
  nutRenderDots(); nutRenderStatus(); nutRenderSummary();
  // Speak a result when it first appears or changes, not on every tap.
  if (s.level && s.level !== _nutLevels[sec.id]) {
    const verdict = s.periodsFlag ? sec.verdicts.periods : sec.verdicts[s.level];
    let msg = sec.title + ": " + verdict.pill + ". " + verdict.msg;
    if (results && !wasDone) msg += " All three are done. Your results and what to do next are below.";
    announce(msg);
  }
  _nutLevels[sec.id] = s.level;
}

function nutRenderDots() {
  $("nutDots").innerHTML = NUT_SECTIONS.map((sec) => {
    const s = nutScore(sec, _nut.answers);
    const state = s.complete ? "is-done" : s.answered ? "is-part" : "";
    const sr = s.complete ? "done" : s.answered + " of " + s.total + " answered";
    return '<li class="' + state + '"><button type="button" data-go="nut-' + sec.id + '">' +
      '<span class="nut-dot" aria-hidden="true"></span><span>' + esc(sec.title) + '</span><span class="sr-only">, ' + sr + "</span></button></li>";
  }).join("");
}

// "Last done 2 Nov · Shared with Anna on 2 Nov" with a way to start again, or when to run it.
function nutRenderStatus() {
  const box = $("nutStatus"); if (!box || !_nut) return;
  const started = Object.keys(_nut.answers).length > 0;
  if (_nut.completedAt) {
    const shared = _nut.sharedAt && nutSame(_nut.sharedResults, _nut.results)
      ? " · Shared with " + esc(nutCoach()) + " on " + nutDate(_nut.sharedAt) : "";
    box.innerHTML = '<div class="inset nut-status"><p><b>Last done ' + nutDate(_nut.completedAt) + "</b>" + shared + "</p>" +
      '<p class="hintline">Run it again in your peak weeks, or whenever something feels off.</p>' +
      '<button type="button" class="btn-secondary" id="nutNew">Start a new check</button></div>';
    $("nutNew").addEventListener("click", nutStartNew);
  } else if (_nut.prev) {
    box.innerHTML = '<div class="inset nut-status"><p><b>Last done ' + nutDate(_nut.prev.completedAt) + "</b> · this is a new check, saved as you go.</p>" +
      (started ? "" : '<button type="button" class="btn-text" id="nutUndo">Back to your last results</button>') + "</div>";
    const u = $("nutUndo"); if (u) u.addEventListener("click", nutRestorePrev);
  } else if (started) {
    // A check left half done stays as it was, with a way to clear it if it's from a while back.
    box.innerHTML = '<div class="inset nut-status"><p>Your answers so far are saved on this phone.</p>' +
      '<button type="button" class="btn-text" id="nutOver">Start over</button></div>';
    $("nutOver").addEventListener("click", nutStartOver);
  } else {
    box.innerHTML = '<div class="inset nut-status"><p><b>When to run it:</b> early in a training block, since iron and vitamin D take weeks to put right, and again in your peak weeks. Your answers save as you go.</p></div>';
  }
}

function nutStartNew() {
  const prev = { completedAt: _nut.completedAt, results: _nut.results, sharedAt: _nut.sharedAt, sharedResults: _nut.sharedResults };
  _nut = nutBlank(); _nut.prev = prev; _nutShareErr = "";
  nutSave(_nut);
  nutRenderAll();
  const h = $("nut-energy-h"); if (h) h.focus();
  announce("New check started. Your last results stay until you finish this one.");
}

function nutStartOver() {
  _nut = nutBlank(); _nutShareErr = "";
  nutSave(_nut);
  nutRenderAll();
  const h = $("nut-energy-h"); if (h) h.focus();
  announce("Answers cleared. Start again from Energy.");
}

// Undo for "Start a new check", while nothing has been answered yet.
function nutRestorePrev() {
  const p = _nut.prev; if (!p) return;
  // The answers behind the old results weren't kept, so the questions stay blank; the
  // results, date and share are what come back.
  _nut = Object.assign(nutBlank(), { completedAt: p.completedAt, results: p.results, sharedAt: p.sharedAt, sharedResults: p.sharedResults, restored: true });
  nutSave(_nut);
  nutRenderAll();
  announce("Back to your results from " + nutDate(p.completedAt) + ".");
}

/* ---------- results, next steps and sharing ---------- */
const NUT_LABEL = {
  energy: { clear: "Nothing flagging", watch: "One to watch", flag: "Worth a GP visit" },
  iron: { clear: "Nothing flagging", watch: "One to watch", flag: "Worth a blood test" },
  vitamin_d: { clear: "Nothing flagging", watch: "One to watch", flag: "Worth a blood test" }
};

function nutShareMarkup(r, energyFlag) {
  const coach = esc(nutCoach());
  if (_nut.sharedAt && nutSame(_nut.sharedResults, r)) {
    return '<p class="nut-shared" role="status" tabindex="-1">Shared with ' + coach + " on " + nutDate(_nut.sharedAt) + ".</p>";
  }
  if (!_nutWho.signedIn) {
    return '<p class="hintline">To share this with ' + coach + ', sign in to the <a href="index.html#today">companion</a> and open the check from there.</p>';
  }
  if (_nutWho.isClient === false) {
    return '<p class="hintline">Sharing works for Vela athletes signed in to the companion.</p>';
  }
  const changed = _nut.sharedAt ? "<p class=\"hintline\">Your results changed since you shared them on " + nutDate(_nut.sharedAt) + ".</p>" : "";
  const label = (energyFlag ? "Tell " : "Share with ") + coach;
  return changed +
    '<button type="button" class="btn-primary" id="nutShare"' + (_nutSharing ? " disabled" : "") + ">" + (_nutSharing ? "Sharing…" : label) + "</button>" +
    '<p class="hintline nut-sends">Sends ' + coach + " your three results and today's date, and whether your periods were part of the energy result. Never your answers.</p>" +
    '<p class="savestate" id="nutShareErr" role="status">' + esc(_nutShareErr) + "</p>";
}

async function nutShare() {
  if (_nutSharing || !_nut.results) return;
  // Updated in place rather than re-rendered, so focus stays on the button.
  const btn = $("nutShare"), label = btn ? btn.textContent : "", err = $("nutShareErr");
  _nutSharing = true; _nutShareErr = "";
  if (btn) { btn.disabled = true; btn.textContent = "Sharing…"; }
  if (err) err.textContent = "";
  const sent = Object.assign({}, _nut.results);
  const { error } = await shareNutritionResults(sent);
  _nutSharing = false;
  if (error) {
    console.warn("[nutrition] share", error);
    _nutShareErr = error === "not-client"
      ? "Not shared. This account isn't a Vela athlete's."
      : navigator.onLine === false ? "Not shared. You're offline, so try again when you have signal." : "Not shared. Couldn't reach Vela, so try again.";
    const b = $("nutShare"); if (b) { b.disabled = false; b.textContent = label; }
    const e2 = $("nutShareErr"); if (e2) e2.textContent = _nutShareErr; // role=status reads it out
    return;
  }
  _nut.sharedAt = Date.now(); _nut.sharedResults = sent;
  nutSave(_nut);
  nutRenderStatus(); nutRenderSummary();
  const done = document.querySelector(".nut-shared"); if (done) done.focus();
}

function nutRenderSummary() {
  const box = $("nutSummary"); if (!box || !_nut) return;
  const r = _nut.results;
  if (!r) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const coach = esc(nutCoach());
  const energyFlag = r.energy === "flag";
  const rows = NUT_SECTIONS.map((sec) =>
    '<li class="nut-res is-' + r[sec.id] + '"><span>' + esc(sec.title) + '</span><b>' + esc(NUT_LABEL[sec.id][r[sec.id]]) + "</b></li>").join("");
  const share = '<div class="nut-sharebox" id="nutShareBox">' + nutShareMarkup(r, energyFlag) + "</div>";
  let html = '<h2 class="section-h3">Your results</h2>' +
    (_nut.restored ? '<p class="hintline">From your check on ' + nutDate(_nut.completedAt) + ". Start a new check to answer the questions again.</p>" : "") +
    '<ul class="list nut-results">' + rows + "</ul>";

  if (energyFlag) {
    // An energy flag leads with a doctor and a person, before any general advice.
    html += '<div class="card nut-gp"><h3>Book a GP or sports-doctor visit</h3>' +
      "<p>Tell them which signs you said yes to. A doctor can look at your energy, periods, bones and bloods together, and catch under-fuelling early.</p>" +
      "<p>You can also let " + coach + " know, so you're not sorting it out on your own.</p>" + share +
      '<p class="nut-support"><b>If eating ever feels stressful or out of your control,</b> you deserve proper support. In Singapore, the Singapore General Hospital Eating Disorders Programme helps, and your GP or a polyclinic can refer you. The national mindline is on <a href="tel:1771">1771</a>, any time of day. Elsewhere, your GP can point you to support near you.</p></div>';
  }

  const anyFlag = NUT_SECTIONS.some((sec) => r[sec.id] !== "clear");
  if (!anyFlag) {
    html += '<p class="nut-allclear">Nothing is flagging. Keep fuelling and sleeping the way you are, and run this again in your peak weeks.</p>';
  } else {
    const steps = [];
    steps.push(["Start with food, not restriction", "The strongest fix is usually the simplest: <b>add, don't cut</b>. A snack around training, a bigger breakfast, carbs beside your sessions. Small, steady additions beat any supplement."]);
    steps.push(["Protect your sleep", "A steady wind-down, a dark cool room, caffeine earlier in the day. Under-recovery and under-fuelling feed each other, so sleep is part of fuelling."]);
    steps.push(["Supplements only with your GP", "Correcting a <b>confirmed</b> low iron or vitamin D helps most. Magnesium may help sleep and cramps, though the evidence is modest. Be careful with herbal products like ashwagandha: there's little evidence, and they're not advised in pregnancy, while breastfeeding or with thyroid conditions. Check with your doctor first."]);
    const markers = [];
    if (r.iron !== "clear") markers.push("ferritin and transferrin saturation (iron), with CRP");
    if (r.vitamin_d !== "clear") markers.push("vitamin D (25-OH-D)");
    if (energyFlag) markers.push("thyroid (free T3) and anything else your doctor thinks fits");
    if (markers.length) steps.push(["Blood tests to ask about", "Ask your GP about <b>" + esc(markers.join("; ")) + "</b>. Your doctor reads the results against your full history. This isn't a diagnosis, just the values worth a conversation."]);
    html += '<h3 class="section-h3 nut-next-h">What you can do</h3><ol class="nut-steps">' +
      steps.map((s) => "<li><h4>" + s[0] + "</h4><p>" + s[1] + "</p></li>").join("") + "</ol>";
  }

  if (!energyFlag) html += '<h3 class="section-h3 nut-next-h">Share with ' + coach + "</h3>" + '<p class="nut-privacy">' + esc(nutPrivacy()) + "</p>" + share;
  const from = nutFrom();
  html += '<a class="btn-primary nut-done" id="nutDone" href="index.html#' + from + '">Done · back to ' + (from === "fuel" ? "Fuel" : "Today") + "</a>";
  box.innerHTML = html;
  $("nutDone").addEventListener("click", nutBackClick);
  const b = $("nutShare"); if (b) b.addEventListener("click", nutShare);
}

function nutRenderAll() {
  if (_nut.restored) {
    // Results without answers: the questions would only look unanswered, so they wait
    // until she starts a new check.
    $("nutSections").innerHTML = ""; $("nutDots").innerHTML = "";
  } else { nutRenderSections(); nutRenderDots(); }
  nutRenderStatus(); nutRenderSummary();
}

function initNutrition() {
  _nut = nutLoad();
  const from = nutFrom(), back = $("nutBack");
  if (back) { back.href = "index.html#" + from; back.textContent = "← Back to " + (from === "fuel" ? "Fuel" : "Today"); back.addEventListener("click", nutBackClick); }
  $$(".nut-privacy").forEach((p) => { p.textContent = nutPrivacy(); });
  nutRenderAll();
  // Progress dots jump to their section.
  $("nutDots").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-go]"); if (!b) return;
    const sec = $(b.dataset.go); if (!sec) return;
    sec.scrollIntoView({ behavior: nutReduced() ? "auto" : "smooth", block: "start" });
    const h = sec.querySelector(".nut-mod-h"); if (h) h.focus({ preventScroll: true });
  });
  // There is no shell here: an auth change (signed in, signed out in another tab) only
  // changes whether she can share and her coach's name.
  window.renderApp = () => nutLoadWho().then(nutRenderNames);
  nutLoadWho().then(nutRenderNames);
}

if (typeof document !== "undefined" && document.getElementById("nutSections")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initNutrition);
  else initNutrition();
}
