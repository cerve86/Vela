/* ============ TODAY — today's session, the check-in and its suggestion ============
   initToday(el) renders the whole tab into #today. Called by the shell once per signed-in
   user, and again when her local date rolls over. Answers one question: how am I, and what
   do I do with today's session? Everything else (the week, the look-back, the nutrition
   check) sits below and only shows when it has something to say.

   The session card shows today's movements (with library photos and cues) and, before a
   long run, KEY session or race, a top-up line to Fuel. With no plan in Vela at all, her
   intervals.icu calendar is the plan. Reaching the coach is WhatsApp (coachWhatsApp in
   core.js): nothing here writes a message.

   The movement radar and the full filming guide live on Strength (strength.js). */

/* ============ pure logic (no DOM): the check-in's rules ============ */

const TD_AM = [
  { k: "sleep", name: "Sleep", opts: ["Rough", "OK", "Good"] },
  { k: "legs", name: "Legs", opts: ["Heavy", "Normal", "Fresh"] },
  { k: "energy", name: "Energy", opts: ["Low", "Meh", "Good"] },
  { k: "last_session", name: "Last session felt", short: "Last session", opts: ["Hard", "Moderate", "Easy"] }
];
// A rest day keeps the check-in short: legs and the last session only matter for training.
const TD_REST_KEYS = ["sleep", "energy"];
// The Vela app's five readiness steps (packages/shared tokens: tide).
const TD_TIDE = ["Depleted", "Low", "Steady", "Good", "Strong"];
const TD_WATCH = { rhr: [30, 120, "Resting HR is usually between 30 and 120 bpm."], hrv: [10, 200, "HRV is usually between 10 and 200 ms."] };
const TD_DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// What kind of session this is, for the advice. The coach's fuelling type on the day is the
// best signal; the title is the fallback for days she hasn't typed.
function tdKind(s) {
  const f = s.fuel_type, d = s.discipline, t = String(s.title || "").toLowerCase();
  // long_gut / long_absorb / long_rehearsal are the race block's long-run cards.
  if (f === "quality" || f === "strength") return f;
  if (f && f.indexOf("long") === 0) return "long";
  if (d === "strength") return "strength";
  if (d === "mobility" || d === "rehab") return "gentle";
  if (f === "easy") return d === "run" || !d ? "easy" : "gentle";
  if (/\blong\b/.test(t)) return "long";
  if (/interval|tempo|threshold|pacing|race pace|hill|fartlek|speed|\d+\s*[x×]\s*\d+/.test(t)) return "quality";
  if (/easy|recovery|shake|jog/.test(t)) return "easy";
  if (d === "cross") return "gentle";
  return "run";
}
const TD_HARDEST = ["quality", "long", "run", "strength", "easy", "gentle"];
const tdFullDay = (ymd) => TD_DOW[(new Date(ymd + "T12:00:00").getDay() + 6) % 7];
const tdShortDate = (ymd) => new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// Today in the plan: {plan, rest, done, kind, title, prevHard, swap, strides, sessions}, or
// null while the plan hasn't loaded (the advice then stays general).
function tdCtx(week, day) {
  if (!week) return null;
  if (week.body) return { plan: true, descriptive: true, sessions: [] };
  const all = week.sessions || [];
  if (!week.name && !all.length) return { plan: false, sessions: [] };
  const ss = all.filter((s) => s.date === day);
  if (!ss.length) return { plan: true, rest: true, sessions: [] };
  const kinds = ss.map(tdKind), kind = TD_HARDEST.find((k) => kinds.indexOf(k) >= 0);
  const title = ss.map((s) => s.title).join(" + ");
  // The last session before today: a hard one makes "last session felt hard" expected.
  const before = all.filter((s) => s.date < day), lastDay = before.length ? before[before.length - 1].date : null;
  const prevHard = !!lastDay && before.some((s) => s.date === lastDay && ["quality", "long"].indexOf(tdKind(s)) >= 0);
  // A quality day can swap with a later easy day this week.
  let swap = "";
  if (kind === "quality") {
    const sun = _tdAddDays(week.monday, 6), later = {};
    all.filter((s) => s.date > day && s.date <= sun).forEach((s) => { (later[s.date] = later[s.date] || []).push(s); });
    const d = Object.keys(later).sort().find((k) => later[k].every((s) => ["easy", "gentle"].indexOf(tdKind(s)) >= 0));
    if (d) swap = tdFullDay(d) + "'s " + later[d].map((s) => s.title).join(" + ");
  }
  return { plan: true, rest: false, done: ss.every((s) => s.status === "completed"), kind, title, prevHard, swap, strides: /strides/i.test(title), sessions: ss };
}

// What the HRV tree's stance says, in the companion's voice (the Vela app's own sentences
// name a physio; here it is her coach).
const TD_STANCE = {
  push: () => "Your body is coping well with training.",
  hold: () => "Tracking as expected for this stretch of training.",
  ease: () => "Your body is asking for a little less this week.",
  rest: () => "Your body is asking for a proper rest. Worth letting " + coachName() + " know.",
  check: () => "HRV and resting HR are both unusually low: fine if you're feeling and performing well; if not, tell " + coachName() + "."
};

// The suggestion: the full read, never a single number. Her morning check-in leads (sleep,
// legs, energy, last session); then her HRV week through the Vela app's decision tree (this
// week against the three before, the day-to-day swing, resting HR, training load) can make
// it gentler: "ease" turns Good to go into Ease in, "rest" turns it into Keep it easy. It
// never makes it harder than she feels. With no HRV baseline yet, a resting-HR trend that
// is clearly up does the "ease" part. Neutral answers are "Good to go", the advice is
// about today's actual session, and an already-easy session is never downgraded.
//   o.st    {sleep, legs, energy, last_session}: 0–2, or -1 unanswered
//   o.keys  the questions asked today (TD_REST_KEYS on a rest day)
//   o.ctx   tdCtx(...) or null
//   o.hrv   readHrvRhr() result {g: hrvGuidance or null, firm, oneOff, enoughR, rUp, rbase}, or {}
//   o.back  null, "pending", "fresh", "busy" or "unwell" (back after more than 4 days)
//   o.vela  the Vela app's readiness 0–4 when that is all there is today, else null
// → {band: "go"|"ease"|"easy", cls, pill, msg, note}
function tdVerdict(o) {
  const st = o.st, c = o.ctx || {}, v = o.hrv || {}, keys = o.keys || TD_AM.map((a) => a.k);
  const reasons = [];
  let b;
  if (o.vela != null) {
    b = o.vela >= 2 ? 2 : o.vela === 1 ? 1 : 0;
    if (b < 2) reasons.push("you marked " + TD_TIDE[o.vela].toLowerCase() + " in the Vela app");
  } else {
    if (st.sleep === 0) reasons.push("sleep was short");
    if (keys.indexOf("legs") >= 0 && st.legs === 0) reasons.push("your legs feel heavy");
    if (st.energy === 0) reasons.push("energy's low");
    // Hard after a planned hard session is what was meant to happen, not a warning sign.
    if (keys.indexOf("last_session") >= 0 && st.last_session === 0 && !c.prevHard) reasons.push("your last session felt hard");
    const lows = reasons.length, max = keys.length * 2;
    const feel = keys.reduce((s, k) => s + Math.max(st[k], 0), 0);
    b = lows === 0 ? 2 : lows >= 3 || (lows >= 2 && feel <= max * 0.375) ? 0 : 1;
  }
  // How she feels, before her numbers: a rough morning opens with empathy (below).
  const felt = b;
  let note = "";
  const g = v.g;
  if (g) {
    // With only four readings this week the read can't be checked without its odd morning:
    // shown, but it doesn't change the suggestion.
    const firm = v.firm !== false;
    let moved = false;
    if (firm && g.stance === "rest" && b > 0) { b = 0; moved = true; reasons.push("your HRV trend points to real fatigue"); }
    else if (firm && g.stance === "ease" && b === 2) { b = 1; moved = true; reasons.push("your HRV trend is asking for a little less"); }
    // The tree's own summary of her week, which says so when a morning was left out or the
    // week is thin: "HRV below your range · steady day to day · a usual week".
    note = "Your 7-day trend: " + g.summary.replace(/ · /g, ", ") + "." +
      (moved && g.stance === "ease" ? "" : " " + TD_STANCE[g.stance]()) +
      (firm ? "" : " Take it as a hint for now.");
    if (v.enoughR && v.rUp) note += " Resting HR is up on your usual too.";
  } else if (v.enoughR && v.rUp && b === 2) { b = 1; reasons.push("your resting HR trend is up on your usual"); }
  // Back after a gap: the first day back starts gently, whatever the taps say.
  if (o.back === "unwell" && b > 0) { b = 0; reasons.unshift("you've been unwell"); }
  else if ((o.back === "busy" || o.back === "pending") && b === 2) { b = 1; reasons.unshift("it's your first day back"); }
  else if (o.back === "fresh" && b === 2) note = (note ? note + " " : "") + "First session back: start easy and build.";

  const band = ["easy", "ease", "go"][b], PILL = ["Keep it easy", "Ease in", "Good to go"];
  const lead = reasons.length ? reasons.join(", ").replace(/^./, (x) => x.toUpperCase()) + ". " : "";
  const T = c.title || "today's session";
  const smart = " A smart call, not a setback.";
  // A rough morning (how she feels, not her numbers) is met with empathy, never "enjoy":
  // rest and gentle mobilisation come first, and the coach can swap the intensity (the
  // coach's words, 3 Nov 2026).
  const rough = "Some days don't start the way we wished for. ";
  const swap = " If you need to, ask " + coachName() + " to swap the intensity.";
  let msg;
  if (c.rest) {
    // The pill already says "Rest day".
    msg = felt < 2
      ? rough + "Prioritise rest and gentle mobilisation today" +
        (st.sleep === 0 ? ", and an early night: it will do more than anything." : st.energy === 0 ? ", with a proper meal and an early night." : ".") +
        " If the next sessions feel like too much, ask " + coachName() + " to swap the intensity."
      : "Enjoy it.";
    return { band, cls: "rest", pill: "Rest day", msg, note };
  }
  if (c.done) {
    msg = "Today's session is done. Nice work." + (b < 2 ? " Eat soon, and make tonight an early one." : "");
    return { band, cls: band, pill: PILL[b], msg, note };
  }
  const reps = /(\d+)\s*[x×]\s*([\d.]+\s*(?:min|km|m|s)?)/i.exec(T);
  const k = c.kind || "";
  if (b === 2) {
    msg = {
      quality: "Good to go for " + T + ". Warm up well and let the first rep tell you how it feels.",
      long: "Good to go for " + T + ". Start slower than you think, and fuel as planned.",
      easy: "Good to go. " + T + " as written, nice and relaxed.",
      gentle: "Good to go. " + T + " as written.",
      strength: "Good to go. " + T + " as written.",
      run: "Good to go. " + T + " as written: start easy and let it build."
    }[k] || "Body and legs are with you. Enjoy today's training as written.";
  } else if (b === 1) {
    msg = lead + ({
      quality: "For " + T + ", " + (reps && +reps[1] > 1 ? "do " + (reps[1] - 1) + " × " + reps[2].trim() + " instead of " + reps[1] : "do about two thirds of the work") + (c.swap ? ", or swap it with " + c.swap : "") + ".",
      long: "Keep " + T + " conversational, and cut it short if it isn't settling.",
      easy: T + " is already easy, so keep it that way: a relaxed pace" + (c.strides ? ", and skip the strides" : "") + ".",
      gentle: T + " is gentle, so it should help. Go by feel.",
      strength: "Do " + T + " with lighter weights, or one set fewer.",
      run: "Take " + T + " a little shorter or slower and see how it feels."
    }[k] || "Trim today a little: a bit shorter, or a bit easier.");
  } else {
    msg = (felt < 2 ? rough : "") + lead + ({
      quality: "Leave the hard work in " + T + " for another day: prioritise rest or gentle mobilisation, or an easy run." + swap,
      long: "Make " + T + " a short, easy run today, or rest and do some gentle mobilisation." + swap,
      easy: T + " is already easy. Keep it truly relaxed" + (c.strides ? " and skip the strides" : "") + ", or rest if you'd rather." + smart,
      gentle: T + " is gentle, a good fit for today. Or rest if you'd rather.",
      strength: "Keep " + T + " light, or rest and do some gentle mobilisation." + swap,
      run: "Prioritise rest or gentle mobilisation, or run easy and a little shorter." + swap
    }[k] || "Prioritise rest and gentle mobilisation, or keep today easy and low-impact." + swap);
  }
  return { band, cls: band, pill: PILL[b], msg, note };
}

// The four taps as the Vela app's readiness 0–4, never brighter than the verdict she saw.
function tdReadiness(st, keys, band) {
  const feel = keys.reduce((s, k) => s + Math.max(st[k], 0), 0);
  const r = Math.round(feel / (keys.length * 2) * 4);
  return Math.min(r, band === "easy" ? 1 : band === "ease" ? 2 : 4);
}

// Is the nutrition check worth putting on Today? Never done, or not in 8 weeks, or the first
// two weeks of a block, or the last three weeks before her race. A check done in the last
// three weeks already covers the block or the race, so those don't ask twice.
function tdNutritionDue(o) {
  const recent = o.last && o.now - o.last < 21 * 864e5;
  if (o.raceDays != null && o.raceDays >= 0 && o.raceDays <= 21 && !recent) return "race";
  if (o.week != null && o.week <= 2 && !recent) return "block";
  if (!o.last) return "never";
  if (o.now - o.last > 56 * 864e5) return "stale";
  return "";
}
function tdDaysTo(ymd, day) { return Math.round((Date.parse(ymd + "T12:00:00") - Date.parse(day + "T12:00:00")) / 864e5); }
function tdRaceText(name, date, day) {
  const n = tdDaysTo(date, day), r = name || "your race";
  if (isNaN(n) || n < 0) return "";
  if (n === 0) return "Race day: " + r;
  if (n === 1) return r.replace(/^./, (x) => x.toUpperCase()) + " is tomorrow";
  return n <= 21 ? n + " days to " + r : Math.floor(n / 7) + " weeks to " + r;
}
function tdDayStatus(ss, d, t) {
  if (!ss.length) return "rest";
  if (ss.every((x) => x.status === "completed")) return "done";
  if (ss.some((x) => x.status === "skipped")) return "skipped";
  if (d === t) return "today";
  return d < t ? "notlogged" : "planned";
}
const TD_STATUS = { rest: "Rest", done: "Done", skipped: "Skipped", today: "Today", notlogged: "Not logged", planned: "Planned" };
// The Vela app (apps/mobile/app.json scheme "vela"): a session's own screen. Only for Vela's
// own sessions: one from the intervals.icu calendar has no id there.
const tdAppSession = (id) => "vela://session/" + encodeURIComponent(id);

// The effort she logged after her last session (RPE 1–10) as a "Last session felt" answer:
// 7 and up is Hard, 4 to 6 Moderate, 3 and under Easy.
const tdEffortAnswer = (rpe) => (rpe >= 7 ? 0 : rpe >= 4 ? 1 : 2);

// An intervals.icu calendar event in the shape Today reads, for an athlete with no plan in
// Vela at all: the calendar is then her plan. id null, so nothing links to the Vela app.
// race: the event is in a RACE category (RACE_A/B/C), whatever its name.
function tdIcuSession(e) {
  const disc = /^(Run|VirtualRun|TrailRun)$/.test(e.type || "") ? "run" : e.type === "WeightTraining" ? "strength" : "cross";
  return {
    id: null, icu: true, title: e.name || "Session", date: String(e.start_date_local || "").slice(0, 10),
    status: e.paired_activity_id ? "completed" : "scheduled", discipline: disc, race: /^RACE/i.test(e.category || ""),
    duration_sec: Number(e.moving_time) || null, fuel_type: null, description: e.description || ""
  };
}
// A session as fuel.js reads it (fuelPlanSessions rows, plus the planned duration: without
// a fuelling type, fuelTopUp counts 75 minutes or more on the run as long).
function tdFuelRow(s) {
  return { title: s.title, discipline: s.discipline, scheduled_date: s.date, status: s.status, duration_sec: s.duration_sec, race: !!s.race, program_days: { fuel_type: s.fuel_type } };
}
// The Today line for a top-up day, worded for what tomorrow holds (fuelTopUp's kind).
function tdTopUpText(t) {
  const k = t && t.kind;
  return (k === "race" ? "Race" : k === "key" ? "KEY session" : t.run === false ? "Long session" : "Long run") + " tomorrow — top up carbs today.";
}

// The movements an intervals.icu workout names, best effort: each line of its description
// with any bullet and set/rep notation ("3x8", "- ", "•") taken off, kept only when it names a
// movement in her exercise library. → [{name, dose, meta}]
function tdIcuMovements(desc, lib) {
  const out = [], seen = {};
  String(desc || "").split(/\r?\n/).forEach((line) => {
    let t = line.replace(/^[\s\-–—•*·>]+/, "");
    const dose = (/\d+\s*[x×]\s*[\d:]+\s*(?:s|sec|secs|reps?|m|min)?\b/i.exec(t) || [""])[0].trim();
    t = t.replace(/^\d+\s*[x×]\s*[\d:]+\s*(?:s|sec|secs|reps?|m|min)?\b\s*/i, "")
      .replace(/\s*[-–—:@,]?\s*\d+\s*[x×]\s*[\d:]+.*$/i, "").trim();
    const meta = t && exMatch(lib, t);
    if (!meta) return;
    // Her coach's words for it, always: the library only adds the cues and photo.
    const name = t;
    if (seen[name.toLowerCase()]) return;
    seen[name.toLowerCase()] = 1; out.push({ name, dose, meta });
  });
  return out;
}
// One movement on Today, compact: the name and dose, the cues, a photo when the library has
// one (hidden until it loads), and the demo when the coach has added a video.
//   m {name, dose, desc, note (the coach's, on this session), cues[], photo, video}
function tdMoveHtml(m) {
  const video = safeUrl(m.video);
  return '<li class="tdmove">' +
    (m.photo ? '<img class="tdmovephoto" loading="lazy" alt="" src="' + esc(m.photo) + '" hidden onload="this.hidden=false" onerror="this.remove()">' : "") +
    '<p class="tdmovename">' + esc(m.name) + (m.dose ? ' <span class="tddose"><span class="sr-only">Dose: </span>' + esc(m.dose) + "</span>" : "") + "</p>" +
    (m.desc ? '<p class="tdmovedesc">' + esc(m.desc) + "</p>" : "") +
    (m.note ? '<p class="tdmovenote"><span class="sr-only">Note from your coach: </span>' + esc(m.note) + "</p>" : "") +
    (m.cues && m.cues.length ? '<ul class="tdcues" aria-label="Cues">' + m.cues.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>" : "") +
    (video ? '<a class="btn-text tdmovevid" href="' + esc(video) + '" target="_blank" rel="noopener noreferrer">Watch the demo<span class="sr-only"> of ' + esc(m.name) + " (opens in a new tab)</span></a>" : "") +
    "</li>";
}

/* ============ small per-phone memories (vela-*: cleared on sign-out) ============ */
const _tdGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const _tdSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// Back after more than 4 days without opening the app: {days, how} for today, else null.
function tdWelcomeBack(uid, day) {
  const K = "vela-back-" + uid, kept = _tdGet(K);
  if (kept && kept.date === day) return kept;
  const seen = _tdGet("vela-seen-" + uid);
  _tdSet("vela-seen-" + uid, Date.now());
  if (typeof seen === "number" && Date.now() - seen > 4 * 864e5) {
    const b = { date: day, days: Math.floor((Date.now() - seen) / 864e5), how: null };
    _tdSet(K, b); return b;
  }
  return null;
}

/* ============ the tab ============ */

function tdMarkup(o) {
  const hello = o.hr < 12 ? "Buongiorno" : o.hr < 18 ? "Buon pomeriggio" : "Buonasera";
  const name = firstName(), coach = esc(coachName()), wa = coachWhatsApp();
  return `
    <h2 class="section-h tab-h" tabindex="-1"><span lang="it">${hello}</span>${name ? ", " + esc(name) : ""}</h2>
    <div id="tdBack"></div>
    <section class="card tdtop" aria-labelledby="tdTopH">
      <p class="tdeyebrow" id="tdTopH">Today · ${esc(tdShortDate(o.day))}</p>
      <div id="tdSession"></div>
      <p class="tdmeta" id="tdMeta" hidden></p>
    </section>
    <div id="tdFuelNudge"></div>
    <section class="card tdcheck" aria-labelledby="tdCheckH">
      <h3 class="section-h3" id="tdCheckH">Today's check-in</h3>
      <p class="section-s" id="tdIntro">A few taps and Vela suggests how to take today. A nudge, never an order.</p>
      <div id="tdVela"></div>
      <div id="tdFold" class="tdfold" hidden></div>
      <div class="frows" id="tdRows"></div>
      <p id="tdDoneWrap" hidden><button type="button" class="btn-text" id="tdDone">Done</button></p>
      <details class="watch" id="tdWatch">
        <summary>Add your watch numbers (optional)</summary>
        <div class="wfields">
          <label for="tdRhr">Resting HR (bpm)<input id="tdRhr" type="number" inputmode="numeric" min="30" max="120" step="1" autocomplete="off"></label>
          <label for="tdHrv">HRV (ms)<input id="tdHrv" type="number" inputmode="numeric" min="10" max="200" step="1" autocomplete="off"></label>
        </div>
        <p class="estnote" id="tdWatchNote" role="status"></p>
        <p class="estnote" id="tdBase"></p>
      </details>
      <div class="readout" id="tdOut" hidden></div>
      <div id="tdActs" class="tdactswrap" hidden>
        <div class="tdacts">
          <span id="tdRestWrap"></span>
          ${wa ? `<a class="btn-secondary" href="${esc(wa)}" target="_blank" rel="noopener">${coachWhatsAppIsGroup() ? "Open the WhatsApp group" : "WhatsApp " + coach}<span class="sr-only"> (opens WhatsApp)</span></a>` : ""}
        </div>
        <p class="tdactout" id="tdActOut" role="status"></p>
      </div>
      <div id="tdSave" class="tdsave" role="status"></div>
    </section>
    <section class="card tdweekcard" id="tdWeekCard" aria-labelledby="tdWeekH" hidden>
      <div class="sumhead"><h3 id="tdWeekH">This week</h3><span class="stamp" id="tdWeekStamp"></span></div>
      <div id="tdWeek"></div>
    </section>
    <div id="tdFilm"></div>
    <div id="tdLook"></div>
    <div id="tdNut"></div>
    <div id="tdA2hs"></div>`;
}

async function initToday(el) {
  const uid = userId(), day = today(), hr = new Date().getHours();
  const coach = coachName(), Coach = coachName({ start: true });
  const back = tdWelcomeBack(uid, day);
  el.innerHTML = tdMarkup({ hr, day });
  // A new day starts a fresh check-in: yesterday's taps must never be saved under today.
  onTodayChanged("today", () => initToday(el));
  onResume("today", () => _tdSet("vela-seen-" + uid, Date.now()));

  const rows = $("tdRows"), out = $("tdOut"), saveEl = $("tdSave"), fold = $("tdFold");
  const rhrI = $("tdRhr"), hrvI = $("tdHrv");
  const alive = () => el.contains(rows);

  const st = { sleep: -1, legs: -1, energy: -1, last_session: -1 };
  const S = {
    week: null, ctx: null, profile: null, hist: [], watch: { rhr: null, hrv: null }, watchTouched: false,
    folded: false, editing: false, checkedAt: null, vela: null, velaFromApp: false, velaRow: null,
    lastBand: null, pending: [], back,
    // The effort logged after her last session, and whether "Last session felt" is still the
    // answer filled in from it (lsAuto) and not yet saved (lsUnsaved).
    effort: null, readyLoaded: false, lsAuto: false, lsUnsaved: false,
    moves: {}, topUp: null, tree: { load: [], sessions: [] }
  };
  const segs = {};
  const keys = () => (S.ctx && S.ctx.rest ? TD_REST_KEYS : TD_AM.map((a) => a.k));
  const answered = () => keys().every((k) => st[k] >= 0);

  /* ---- HRV and resting HR: her week against her own trend, never a single morning ---- */
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
  // One value per day; today's is the number she typed, else the one her watch synced.
  function daily(key, watchKey) {
    const out = S.hist.filter((d) => d.date < day && d[key] != null && isFinite(d[key]) && d[key] > 0).map((d) => ({ day: d.date, value: Number(d[key]) }));
    const synced = S.hist.find((d) => d.date === day && d[key] != null && isFinite(d[key]) && d[key] > 0);
    const t = S.watch[watchKey] != null ? S.watch[watchKey] : synced ? Number(synced[key]) : null;
    if (t != null) out.push({ day, value: t });
    return out;
  }
  // HRV goes through the Vela app's own decision tree (js/hrv-guidance.js, generated from
  // packages/shared hrvGuidance.ts), so the companion, the app and the coach's portal read
  // her week the same way: this week's HRV against the three weeks before it, how much it
  // swings day to day, resting HR, and whether the training is bigger or lighter than usual.
  // Null until there is a baseline: 10 readings in the three weeks before this one and 4
  // this week; one unusual morning never decides it (hrvRead). Resting HR up is read the same way, as a trend: the last 7 days' mean against
  // her 6-week normal (3-bpm floor).
  //   feel  her check-in as the Vela app's 0–4, or null
  function readHrvRhr(feel) {
    const R = daily("restingHR", "rhr");
    let res = { g: null, enoughR: false };
    try {
      // The shared tree, which never lets one unusual morning decide the week (hrvRead, core.js).
      res = Object.assign(res, hrvRead({ today: day, hrv: daily("hrv", "hrv"), restingHr: R,
        load: S.tree.load, sessions: S.tree.sessions, readiness: feel == null ? null : feel }));
    } catch (e) { console.warn("[companion] hrv tree", e); }
    const base = R.filter((r) => r.day >= daysAgo(41)).map((r) => r.value), wk = R.filter((r) => r.day >= daysAgo(6)).map((r) => r.value);
    if (base.length >= 14) {
      const m = mean(base), s = sd(base);
      res.enoughR = true; res.rbase = m; res.rUp = wk.length >= 3 && mean(wk) > m + Math.max(0.75 * s, 3);
    }
    return res;
  }
  function updBase(v) {
    const g = v.g, rhr = v.enoughR ? " Resting HR about " + Math.round(v.rbase) + " bpm." : "";
    if (!g) {
      $("tdBase").textContent = "Building your HRV baseline: it needs readings on 10 days in the three weeks before this one, and 4 this week. Until then the suggestion leans on how you feel and your resting HR trend." + rhr;
      return;
    }
    // In ms, rounded so the numbers never contradict the reading: below the range, the
    // average rounds down and the range's edge up (and the reverse above).
    const f = g.figures, avg0 = Math.exp(f.weekMean), lo0 = Math.exp(f.rangeLow), hi0 = Math.exp(f.rangeHigh);
    let avg = Math.round(avg0), lo = Math.round(lo0), hi = Math.round(hi0);
    if (g.hrv === "below") { avg = Math.floor(avg0); lo = Math.ceil(lo0); }
    if (g.hrv === "above") { avg = Math.ceil(avg0); hi = Math.floor(hi0); }
    const left = v.oneOff ? " (leaving out one unusual morning, " + Math.round(v.oneOff.value) + " ms on " + tdFullDay(v.oneOff.day) + ")" : "";
    $("tdBase").textContent = "Your HRV over the last 7 days averages about " + avg + " ms" + left + "; your usual range, from the three weeks before, is " + lo + " to " + hi + " ms." + rhr +
      " Read against your own trend, never a single morning or another person.";
  }

  /* ---- the check-in ---- */
  function buildRows() {
    rows.innerHTML = "";
    TD_AM.forEach((it) => {
      const row = document.createElement("div"); row.className = "frow"; row.dataset.k = it.k;
      const id = "td-am-" + it.k;
      row.innerHTML = '<div class="fh"><b id="' + id + '">' + it.name + "</b></div>";
      segs[it.k] = segmented({
        labelledBy: id, options: it.opts, value: st[it.k] >= 0 ? st[it.k] : null,
        onChange: (i) => {
          const was = answered(); st[it.k] = i;
          // Her tap on the filled-in answer makes it hers.
          if (it.k === "last_session" && S.lsAuto) { S.lsAuto = false; updEffortHint(); }
          if (!was && answered() && !S.checkedAt) S.checkedAt = Date.now();
          // Finished just now: fold to one line and keep focus on something that stays.
          if (!was && answered() && !S.editing) { S.folded = true; render({ speak: true }); const c = $("tdChange"); if (c) c.focus(); }
          else render({ speak: answered() });
          persist();
        }
      });
      row.appendChild(segs[it.k]);
      if (it.k === "last_session") row.insertAdjacentHTML("beforeend", '<p class="hintline tdeffort" id="tdEffort" hidden></p>');
      rows.appendChild(row);
    });
  }
  /* ---- "Last session felt", filled in from the effort she logged after it ---- */
  function effortText() {
    const e = S.effort; if (!e) return "";
    const after = e.date && e.title ? tdFullDay(e.date) + "'s " + e.title : e.date ? "your session on " + tdFullDay(e.date) : "your last session";
    return "Filled in from the effort you logged after " + after + " (" + e.rpe + "/10). Tap to change.";
  }
  function updEffortHint() {
    const p = $("tdEffort"); if (!p) return;
    p.textContent = S.lsAuto ? effortText() : "";
    p.hidden = !S.lsAuto;
    // A screen reader hears that the checked answer was filled in, not chosen by her.
    const g = segs.last_session;
    if (g) { if (S.lsAuto) g.setAttribute("aria-describedby", "tdEffort"); else g.removeAttribute("aria-describedby"); }
  }
  // Only into an empty answer, and only once her saved check-in has loaded, so a saved or
  // tapped answer always wins. Writes nothing: it is saved with her next tap, like any answer.
  function applyEffort() {
    const e = S.effort;
    if (!S.readyLoaded || !e || S.effortTried || !alive()) return;
    S.effortTried = true;
    if (st.last_session >= 0 || !(e.rpe >= 1 && e.rpe <= 10)) return;
    st.last_session = tdEffortAnswer(e.rpe); segs.last_session.setValue(st.last_session);
    S.lsAuto = true; S.lsUnsaved = true; updEffortHint();
    if (answered() && !S.editing) S.folded = true;
    render();
  }
  function summaryText() {
    return keys().map((k) => {
      const a = TD_AM.find((x) => x.k === k), v = a.opts[st[k]];
      return (a.short || a.name) + " " + (v === "OK" ? v : v.toLowerCase());
    }).join(" · ");
  }
  function render(o) {
    o = o || {};
    const ks = keys(), done = answered(), useVela = !done && S.vela != null;
    // Rest day: only the two questions that matter.
    $$(".frow", rows).forEach((r) => { r.hidden = ks.indexOf(r.dataset.k) < 0; });
    $("tdIntro").textContent = S.ctx && S.ctx.rest ? "Rest day, so just two questions." : "A few taps and Vela suggests how to take today. A nudge, never an order.";
    const showFold = done && S.folded && !S.editing;
    fold.hidden = !showFold;
    rows.hidden = showFold || (useVela && !S.editing);
    $("tdDoneWrap").hidden = !(done && S.editing);
    if (showFold) {
      fold.innerHTML = '<p class="tdsum">' + esc(summaryText()) + "</p>" +
        (S.lsAuto && ks.indexOf("last_session") >= 0 ? '<p class="hintline">' + esc(effortText().replace(/ Tap to change\.$/, "")) + "</p>" : "") +
        '<p class="tdsumwhen">' + (S.checkedAt ? "Checked in " + esc(fmtTime(S.checkedAt)) + " · " : "") +
        '<button type="button" class="btn-text" id="tdChange">Change<span class="sr-only"> your check-in</span></button></p>';
      $("tdChange").addEventListener("click", () => {
        S.editing = true; render();
        const first = rows.querySelector('.frow:not([hidden]) [role="radio"][tabindex="0"]'); if (first) first.focus();
      });
    }
    // The Vela app's daily read, shown instead of asking again.
    const vbox = $("tdVela");
    if (S.vela != null && !done) {
      vbox.innerHTML = '<p class="inset tdvelaread">You checked in on the Vela app' + (S.velaAt ? " at " + esc(fmtTime(S.velaAt)) : "") + ": <b>" + esc(TD_TIDE[S.vela]) + "</b>.</p>" +
        (S.editing ? "" : '<p><button type="button" class="btn-text" id="tdAddMore">' + (S.ctx && S.ctx.rest ? "Add sleep and energy" : "Add sleep, legs and energy") + "</button></p>");
      const add = $("tdAddMore");
      if (add) add.addEventListener("click", () => { S.editing = true; render(); const f = rows.querySelector('[role="radio"][tabindex="0"]'); if (f) f.focus(); });
    } else vbox.innerHTML = "";

    // Her check-in as the Vela app's 0–4, for the HRV tree (the Vela app's own read stands in
    // when that is all she has done today).
    const feel = done ? tdReadiness(st, ks, "go") : S.vela;
    const v = readHrvRhr(feel); updBase(v);
    if (!done && !useVela) { out.hidden = true; $("tdActs").hidden = true; S.lastBand = null; updNudge(); return; }
    const r = tdVerdict({ st, keys: ks, ctx: S.ctx, hrv: v, back: S.back ? S.back.how || "pending" : null, vela: done ? null : S.vela });
    out.hidden = false;
    out.className = "readout " + r.cls;
    out.innerHTML = '<span class="pill">' + esc(r.pill) + "</span><p>" + esc(r.msg) + (r.note ? " " + esc(r.note) : "") + "</p>" +
      '<p class="suggest">' + esc(Coach) + " sees your check-in too." + (r.cls === "rest" ? "" : " Your plan only changes if you ask.") + "</p>";
    // Saved as she saw it, so a rest day reaches the coach as "Rest day", not "Good to go".
    S.verdict = r.cls === "rest" ? "rest" : r.band;
    // The plan, her HRV history or the welcome-back answer can arrive after the check-in
    // was saved and change what she sees: keep the saved verdict in step with the screen.
    // Only once the plan and the history are in: before that the verdict is provisional,
    // and opening the app would save it and then save it again a moment later.
    // Not while "Last session felt" is an unsaved filled-in answer: opening the app writes
    // nothing on its own; it is saved with her next tap.
    const autoOnly = S.lsUnsaved && ks.indexOf("last_session") >= 0;
    if (done && S.week && S.histReady && S.savedVerdict !== undefined && S.verdict !== S.savedVerdict && !autoOnly) persist();
    $("tdActs").hidden = false; renderRest();
    // Read the new suggestion aloud only when her own tap or number changed it.
    if (o.speak && (S.lastBand !== r.band + r.msg)) announce(r.pill + ". " + r.msg);
    S.lastBand = r.band + r.msg;
    updNudge();
  }
  $("tdDone").addEventListener("click", () => { S.editing = false; S.folded = true; render(); const c = $("tdChange"); if (c) c.focus(); });

  /* ---- saving: companion_readiness, and the Vela app's daily read so the coach sees it ---- */
  let saving = Promise.resolve();
  function persist() { saving = saving.then(doSave, doSave); return saving; }
  async function doSave() {
    // Open past midnight: start the new day instead of filing these taps under it.
    if (today() !== day) { initToday(el); return; }
    const fields = {};
    TD_AM.forEach((a) => { if (st[a.k] >= 0) fields[a.k] = st[a.k]; });
    // A filled-in "Last session felt" she never saw (a rest day hides it) isn't hers to save.
    if (S.lsAuto && keys().indexOf("last_session") < 0) delete fields.last_session;
    if (S.watchTouched) { fields.hrv = S.watch.hrv; fields.rhr = S.watch.rhr; }
    if (answered() && S.verdict) fields.verdict = S.verdict;
    if (!Object.keys(fields).length) return;
    const { error } = await saveReadiness(fields);
    if (!error && fields.verdict) S.savedVerdict = fields.verdict;
    if (!error && fields.last_session != null) S.lsUnsaved = false;
    setSave(!error);
    if (!error && answered()) syncVelaRead();
  }
  function setSave(ok) {
    if (!alive()) return;
    if (ok) { saveEl.innerHTML = '<p class="tdsaved">Saved · ' + esc(fmtTime(Date.now())) + "</p>"; return; }
    saveEl.innerHTML = '<p class="savestate">Not saved. Couldn\'t reach Vela. <button type="button" class="btn-text" id="tdRetry">Retry</button></p>';
    $("tdRetry").addEventListener("click", () => { saveEl.innerHTML = '<p class="tdsaved">Saving…</p>'; persist(); });
  }
  async function syncVelaRead() {
    // She already did the Vela app's read today: that one stands, no second read from here.
    if (S.velaFromApp) return;
    const r = tdReadiness(st, keys(), S.verdict);
    if (!S.velaRow) {
      const res = await lockVelaRead(r);
      // Remembered so a reload knows this read is ours to amend, not one from the Vela app.
      if (res.id) { S.velaRow = { id: res.id, at: res.at, readiness: r }; _tdSet("vela-read-" + uid, { day, id: res.id }); }
      else if (res.already) S.velaRow = { locked: true };
      else if (res.error) console.warn("[companion] daily read", res.error);
    } else if (S.velaRow.id && S.velaRow.readiness !== r && Date.now() - S.velaRow.at < 14.5 * 60000) {
      const res = await amendVelaRead(S.velaRow.id, r);
      if (res.changed) S.velaRow.readiness = r;
    }
  }

  /* ---- watch numbers: saved once she stops typing, never a half-typed "5" ---- */
  let watchT;
  function commitWatch() {
    clearTimeout(watchT);
    const notes = [], next = {};
    [["rhr", rhrI], ["hrv", hrvI]].forEach(([k, inp]) => {
      const raw = inp.value.trim(), n = parseFloat(raw), R = TD_WATCH[k];
      if (!raw) next[k] = null;
      else if (isNaN(n) || n < R[0] || n > R[1]) { next[k] = S.watch[k]; notes.push(R[2] + " Not saved."); }
      else next[k] = n;
    });
    $("tdWatchNote").textContent = notes.join(" ");
    if (next.rhr === S.watch.rhr && next.hrv === S.watch.hrv) return;
    S.watch = next; S.watchTouched = true;
    render({ speak: answered() }); persist();
  }
  [rhrI, hrvI].forEach((inp) => {
    inp.addEventListener("input", () => { clearTimeout(watchT); watchT = setTimeout(commitWatch, 1200); });
    inp.addEventListener("change", commitWatch);
  });

  /* ---- under the verdict: rest today, or WhatsApp the coach (a plain link, in the markup) ---- */
  function freeDay() {
    if (!S.week || S.week.icu) return null;
    const busy = {}; S.week.sessions.forEach((s) => { busy[s.date] = 1; });
    const last = _tdAddDays(S.week.monday, 20);
    for (let d = _tdAddDays(day, 1); d <= last; d = _tdAddDays(d, 1)) if (!busy[d]) return d;
    return null;
  }
  function movable() { return S.ctx && S.ctx.sessions ? S.ctx.sessions.filter((s) => s.status === "scheduled" && s.id) : []; }
  function renderRest() {
    const wrap = $("tdRestWrap"); if (!wrap) return;
    const ms = movable(), pend = S.pending.filter((p) => ms.some((s) => s.id === p.session_id));
    if (pend.length) {
      wrap.innerHTML = '<span class="tdpend">Asked ' + esc(coach) + " to move it to " + esc(tdShortDate(pend[0].to_date)) + '.</span> <button type="button" class="btn-text" id="tdUnrest">Take it back</button>';
      $("tdUnrest").addEventListener("click", () => undoRest(pend.map((p) => p.session_id)));
      return;
    }
    const to = freeDay();
    if (!ms.length || !to) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = '<button type="button" class="btn-secondary" id="tdRest">I\'ll rest today</button>';
    $("tdRest").addEventListener("click", () => askRest(ms, to));
  }
  async function askRest(ms, to) {
    const b = $("tdRest"); if (b) { b.disabled = true; b.textContent = "Sending…"; }
    const res = await Promise.all(ms.map((s) => requestMove(s.id, to, "From her check-in: resting today")));
    if (!alive()) return;
    const bad = res.find((r) => r.error && r.error.code !== "23505");
    if (bad) {
      renderRest(); actOut("Not sent. Couldn't reach Vela. Try again when you have signal.");
      return;
    }
    S.pending = S.pending.concat(ms.map((s) => ({ session_id: s.id, to_date: to })));
    renderRest(); renderSession();
    actOut("Sent to " + coach + ": asked to move " + S.ctx.title + " to " + tdShortDate(to) + ". It moves in your plan once " + coach + " says yes.");
    const u = $("tdUnrest"); if (u) u.focus();
  }
  async function undoRest(ids) {
    const res = await Promise.all(ids.map((id) => withdrawMove(id)));
    if (!alive()) return;
    if (res.some((r) => r.error)) { actOut("Couldn't take it back. Couldn't reach Vela."); return; }
    S.pending = S.pending.filter((p) => ids.indexOf(p.session_id) < 0);
    renderRest(); renderSession(); actOut("Taken back. Today's session stays where it is.");
    const r = $("tdRest"); if (r) r.focus();
  }
  function actOut(text) { const p = $("tdActOut"); if (p) p.textContent = text; }

  /* ---- after midday, once checked in: how did you fuel? ---- */
  function updNudge() {
    const box = $("tdFuelNudge"); if (!box) return;
    const show = new Date().getHours() >= 12 && (answered() || S.vela != null);
    box.innerHTML = show ? '<a class="card tdnudge" href="#fuel"><span><b>How did you fuel today?</b><span>A quick check in Fuel.</span></span><span class="go" aria-hidden="true">Fuel →</span></a>' : "";
  }

  /* ---- welcome back ---- */
  if (S.back) {
    const box = $("tdBack");
    box.innerHTML = '<section class="card tdback" aria-labelledby="tdBackH"><h3 class="section-h3" id="tdBackH">Welcome back</h3>' +
      "<p>It's been " + S.back.days + ' days. <span id="tdBackQ">How are you coming back?</span></p><div id="tdBackSeg"></div>' +
      '<p class="hintline">Today\'s suggestion starts gently either way.</p></section>';
    const HOW = ["fresh", "busy", "unwell"];
    const seg = segmented({
      labelledBy: "tdBackQ", className: "seg-wrap",
      options: [{ value: "fresh", label: "Feeling fresh" }, { value: "busy", label: "Been busy" }, { value: "unwell", label: "Been unwell" }],
      value: HOW.indexOf(S.back.how) >= 0 ? S.back.how : null,
      onChange: (h) => { S.back.how = h; _tdSet("vela-back-" + uid, S.back); render({ speak: answered() || S.vela != null }); }
    });
    $("tdBackSeg").appendChild(seg);
  }

  /* ---- today's session and the week ---- */
  function updMeta() {
    const m = $("tdMeta"); if (!m) return;
    const parts = [], w = S.week, p = S.profile;
    if (w && w.week && w.weeks) parts.push("Week " + w.week + " of " + w.weeks);
    const race = p && p.race_date ? tdRaceText(p.race_name, p.race_date, day) : "";
    if (race) parts.push(race);
    const goal = !race && client() && client().goal ? client().goal : "";
    m.innerHTML = esc(parts.join(" · ")) + (goal ? (parts.length ? "<br>" : "") + '<span class="tdgoal">Goal: ' + esc(goal) + "</span>" : "");
    m.hidden = !parts.length && !goal;
  }
  function chip(s) {
    if (s.id && S.pending.some((p) => p.session_id === s.id)) return '<span class="st planned">Asked to move</span>';
    return s.status === "completed" ? '<span class="st done">Done</span>' : s.status === "skipped" ? '<span class="st missed">Skipped</span>' : "";
  }
  function renderSession() {
    const box = $("tdSession"); if (!box || !S.week) return;
    const c = S.ctx, stale = staleNote(S.weekMeta);
    box.innerHTML = stale + sessionHtml(c);
  }
  function sessionHtml(c) {
    if (!c.plan) return '<p class="state state-empty">No plan yet. ' + esc(Coach) + " is putting it together, and it shows here as soon as it starts.</p>";
    if (c.descriptive) return '<p class="tdsess">' + esc(S.week.name || "Your programme") + '</p><p class="hintline">Your programme is written out under This week.</p>';
    if (c.rest) return '<p class="tdsess">Rest day</p>' + topUpHtml();
    return '<ul class="tdsesslist">' + c.sessions.map((s, i) => {
      const min = s.duration_sec && !/\bmin\b/i.test(s.title) ? " · " + Math.round(s.duration_sec / 60) + " min" : "";
      const app = s.id && s.status !== "completed" ? '<a class="btn-text tdapp" href="' + tdAppSession(s.id) + '">Open in the Vela app<span class="sr-only"> to log ' + esc(s.title) + "</span></a>" : "";
      return '<li><p class="tdsess">' + esc(s.title) + '<span class="tdmin">' + esc(min) + "</span> " + chip(s) + "</p>" + app + movesHtml(s, i) + "</li>";
    }).join("") + "</ul>" +
      (S.week.icu ? '<p class="hintline">From your intervals.icu calendar.</p>' : "") + topUpHtml();
  }
  // A rest or easy day before a long run, KEY session or race: one line, to Fuel.
  function topUpHtml() {
    return S.topUp ? '<p class="tdtopup"><a href="#fuel">' + esc(tdTopUpText(S.topUp)) + "</a></p>" : "";
  }
  // Today's movements under a session: open while it's still to do, folded once it's done.
  function movesHtml(s, i) {
    const list = S.moves[s.id || "icu" + i];
    if (!list || !list.length) return "";
    return '<details class="tdmoves"' + (s.status === "completed" ? "" : " open") + ">" +
      "<summary>Today's movements <span class=\"tdmovesn\">(" + list.length + ")</span></summary>" +
      '<ul class="tdmovelist">' + list.map(tdMoveHtml).join("") + "</ul>" +
      '<a class="btn-text tdapp" href="#strength">Your strength work</a></details>';
  }
  function renderWeek() {
    const card = $("tdWeekCard"), box = $("tdWeek"), w = S.week; if (!card || !w) return;
    if (!S.ctx.plan) { card.hidden = true; return; }
    card.hidden = false;
    $("tdWeekH").textContent = w.name ? "This week · " + w.name : "This week";
    if (w.body) { box.innerHTML = '<p class="planbody">' + esc(w.body) + "</p>"; $("tdWeekStamp").textContent = ""; return; }
    const days = Array.from({ length: 7 }, (_, i) => _tdAddDays(w.monday, i));
    const by = (d) => w.sessions.filter((s) => s.date === d);
    const planned = w.sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
    $("tdWeekStamp").textContent = planned.length ? planned.filter((s) => s.status === "completed").length + " of " + planned.length + " done" : "";
    box.innerHTML = '<div id="tdStrip"></div><div class="tdday" id="tdDay" aria-live="polite"></div>';
    const showDay = (d) => {
      const ss = by(d), s = tdDayStatus(ss, d, day), when = (d === day ? "Today, " : "") + tdFullDay(d) + " " + fmtDay(d);
      let h = '<p class="tdday-h"><b>' + esc(when) + "</b>" + (s === "today" ? "" : " · " + TD_STATUS[s]) + "</p>";
      if (!ss.length) h += '<p class="muted">Nothing planned.</p>';
      ss.forEach((x) => {
        h += "<p>" + esc(x.title) + "</p>";
        if (x.id && x.status !== "completed" && d <= day) h += '<a class="btn-text tdapp" href="' + tdAppSession(x.id) + '">' + (d < day ? "Log it in the Vela app" : "Open in the Vela app") + '<span class="sr-only">: ' + esc(x.title) + "</span></a> ";
        if (tdKind(x) === "strength") h += '<a class="btn-text" href="#strength">Your strength work</a>';
      });
      $("tdDay").innerHTML = h;
    };
    const strip = segmented({
      label: "Pick a day this week", className: "tdstrip",
      options: days.map((d) => ({ value: d, label: tdFullDay(d).slice(0, 3) })),
      value: days.indexOf(day) >= 0 ? day : days[0], onChange: showDay
    });
    $$('[role="radio"]', strip).forEach((b, i) => {
      const d = days[i], ss = by(d), s = tdDayStatus(ss, d, day);
      b.innerHTML = '<span class="tdd">' + tdFullDay(d).slice(0, 3) + '</span><span class="tdn">' + Number(d.slice(8)) + '</span><span class="tddot s-' + s + '" aria-hidden="true"></span>';
      b.setAttribute("aria-label", (d === day ? "Today, " : "") + tdFullDay(d) + " " + fmtDay(d) + ": " + (ss.length ? ss.map((x) => x.title).join(" and ") + (s === "today" ? "" : ", " + TD_STATUS[s].toLowerCase()) : "rest"));
      if (d === day) b.classList.add("is-today");
    });
    $("tdStrip").appendChild(strip);
    showDay(strip.value);
  }

  /* ---- the first running clip (until the coach has assessed her) ---- */
  // Clips go to the coach on WhatsApp (the companion has no upload); with no link set, the
  // card just says who to send them to. Never to a group invite: the whole group would see
  // them. It goes once she has been assessed.
  function renderFilm(m) {
    const box = $("tdFilm"); if (!box || m) { if (box) box.innerHTML = ""; return; }
    const group = coachWhatsAppIsGroup(), wa = group ? "" : whatsAppHref("My running clips: from the side, then from behind.");
    box.innerHTML = '<section class="card tdfilm" aria-labelledby="tdFilmH"><h3 class="section-h3" id="tdFilmH">Film your first running clip</h3>' +
      "<p>It shows " + esc(coach) + " how you move, and sets your starting point.</p>" +
      '<ol class="tdsteps"><li>Ask someone to hold the phone steady, sideways, at hip height.</li>' +
      "<li>Film two angles, about 20 seconds each: from the side, then from behind.</li>" +
      "<li>Send both clips to " + esc(coach) + (wa ? " on WhatsApp." : group ? " directly, not in the group." : ".") + "</li></ol>" +
      '<div class="tdacts">' +
      (wa ? '<a class="btn-secondary" href="' + esc(wa) + '" target="_blank" rel="noopener">Send on WhatsApp<span class="sr-only"> (opens WhatsApp)</span></a>' : "") +
      '<a class="btn-text" href="#strength">How to film</a></div></section>';
  }

  /* ---- Sunday and Monday: the week, looked back on ---- */
  async function renderLook() {
    const box = $("tdLook"), dow = new Date().getDay(); if (!box || !S.week || (dow !== 0 && dow !== 1) || S.week.body) return;
    const from = dow === 1 ? _tdAddDays(S.week.monday, -7) : S.week.monday, to = dow === 1 ? _tdAddDays(S.week.monday, -1) : day;
    const ss = S.week.sessions.filter((s) => s.date >= from && s.date <= to);
    const done = ss.filter((s) => s.status === "completed").length;
    let km = null, longest = null;
    try {
      const acts = (await intervalsActivities(9)).filter((a) => /run/i.test(a.type || "") && String(a.start_date_local || "").slice(0, 10) >= from && String(a.start_date_local || "").slice(0, 10) <= to);
      if (acts.length) { const ks = acts.map((a) => (Number(a.distance) || 0) / 1000); km = ks.reduce((x, y) => x + y, 0); longest = Math.max.apply(null, ks); }
    } catch (e) {}
    if (!alive() || (!ss.length && !km)) return;
    const k1 = (n) => (n < 10 ? n.toFixed(1) : String(Math.round(n))) + " km";
    const nums = [];
    if (ss.length) nums.push("<b>" + done + " of " + ss.length + "</b> sessions done");
    if (km) nums.push("<b>" + k1(km) + "</b> run");
    if (longest) nums.push("longest <b>" + k1(longest) + "</b>");
    // Her answer becomes a WhatsApp message to the coach, typed in for her to send. Only a
    // chat link can carry one: with a group invite or no link, the card is just the numbers,
    // since a question that goes nowhere would read as if her coach had been told.
    const canSend = !!coachWhatsApp() && !coachWhatsAppIsGroup() && whatsAppHref("x") !== coachWhatsApp();
    box.innerHTML = '<section class="card tdlook" aria-labelledby="tdLookH"><h3 class="section-h3" id="tdLookH">' + (dow === 1 ? "Last week" : "Your week") + "</h3>" +
      '<p class="tdlooknums">' + nums.join(" · ") + "</p>" +
      (canSend ? '<p class="tdlookq" id="tdLookQ">How did it feel?</p><div id="tdLookSeg"></div><div id="tdLookSend" role="status"></div>' : "") + "</section>";
    if (!canSend) return;
    const FEEL = ["hard going", "about right", "good"];
    $("tdLookSeg").appendChild(segmented({
      labelledBy: "tdLookQ", options: ["Hard going", "About right", "Felt good"], value: null,
      onChange: (i) => {
        const text = (dow === 1 ? "Last week" : "My week") + " (" + fmtDay(from) + " to " + fmtDay(to) + "): " +
          (ss.length ? done + " of " + ss.length + " sessions done" : "") + (km ? (ss.length ? ", " : "") + k1(km) + " run" : "") +
          ". It felt " + FEEL[i] + ".";
        const href = whatsAppHref(text), sb = $("tdLookSend");
        if (!sb || !href || href === coachWhatsApp()) return; // no summary in it: no send
        sb.innerHTML = '<a class="btn-secondary" href="' + esc(href) + '" target="_blank" rel="noopener">Send to ' + esc(coach) + ' on WhatsApp<span class="sr-only"> (opens WhatsApp with your summary typed in)</span></a>';
      }
    }));
  }

  /* ---- the nutrition check: a card when it's due, otherwise one quiet line ---- */
  function renderNut(shareAt) {
    const box = $("tdNut"); if (!box) return;
    const local = _tdGet("vela-nutrition-v2") || {}, prev = local.prev || {};
    const last = Math.max(local.completedAt || 0, local.sharedAt || 0, prev.completedAt || 0, shareAt || 0) || null;
    const p = S.profile, raceDays = p && p.race_date ? tdDaysTo(p.race_date, day) : null;
    const due = tdNutritionDue({ last, now: Date.now(), week: S.week ? S.week.week : null, raceDays });
    if (!due) {
      const r = local.results, clear = r && r.energy === "clear" && r.iron === "clear" && r.vitamin_d === "clear";
      box.innerHTML = '<p class="tdquiet"><a href="nutrition.html">Energy &amp; nutrition check</a><span> · last done ' + esc(fmtDay(ymdLocal(new Date(last)))) + (clear ? " · nothing flagging" : "") + "</span></p>";
      return;
    }
    const why = { race: "Worth doing in the weeks before your race.", block: "Worth doing at the start of a block.", stale: "Last done over 8 weeks ago.", never: "" }[due];
    box.innerHTML = '<a class="card qcard" href="nutrition.html">' +
      '<span class="qi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v3.5L5.5 17A2.5 2.5 0 0 0 7.8 20.5h8.4a2.5 2.5 0 0 0 2.3-3.5L14 6.5V3"/><path d="M7.5 14h9"/></svg></span>' +
      "<span class=\"qt\"><b>Energy &amp; nutrition check</b><span>" + (why ? esc(why) + " " : "") + "Fuelling, iron and vitamin D in about 3 minutes. It stays on this phone unless you share it with " + esc(coach) + ".</span></span>" +
      '<span class="go" aria-hidden="true">Start →</span></a>';
  }

  /* ---- add to home screen (once, on a phone, not when already installed) ---- */
  function renderA2hs() {
    const box = $("tdA2hs"); if (!box) return;
    const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    // Per phone, not per person, so it stays hidden after a sign-out.
    let hidden = false; try { hidden = localStorage.getItem("companion-a2hs-hidden") === "1"; } catch (e) {}
    if (standalone || hidden || (!ios && !android)) { box.innerHTML = ""; return; }
    const steps = ios
      ? '<li>Tap Share <svg class="tdshare" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11v9h12v-9"/></svg> at the bottom of Safari.</li><li>Choose <b>Add to Home Screen</b>.</li>'
      : "<li>Open the browser menu (the three dots).</li><li>Choose <b>Add to Home screen</b> or <b>Install app</b>.</li>";
    box.innerHTML = '<section class="card tda2hs" aria-labelledby="tdA2hsH"><h3 class="section-h3" id="tdA2hsH">Add Vela to your home screen</h3>' +
      "<p>It opens like an app, one tap away.</p>" + '<div id="tdInstall"></div><ol class="tdsteps">' + steps + "</ol>" +
      '<p class="estnote">You\'ll sign in once more there: the home-screen version keeps its own sign-in.</p>' +
      '<button type="button" class="btn-text" id="tdA2hsHide">Got it, hide this</button></section>';
    $("tdA2hsHide").addEventListener("click", () => {
      try { localStorage.setItem("companion-a2hs-hidden", "1"); } catch (e) {}
      box.innerHTML = ""; const h = el.querySelector(".tab-h"); if (h) h.focus({ preventScroll: true });
    });
    if (window._tdInstallPrompt) showInstall();
  }
  function showInstall() {
    const b = $("tdInstall"); if (!b || !window._tdInstallPrompt) return;
    b.innerHTML = '<button type="button" class="btn-secondary">Install Vela</button>';
    b.firstChild.addEventListener("click", async () => {
      const ev = window._tdInstallPrompt; window._tdInstallPrompt = null;
      try { ev.prompt(); await ev.userChoice; } catch (e) {}
      renderA2hs();
    });
  }
  // Back from the nutrition check usually restores this page from the back/forward cache:
  // redraw the card so it shows the check she has just finished.
  listen("today-nut", window, "pageshow", () => { if (alive()) renderNut(S.shareAt); });
  listen("today-install", window, "beforeinstallprompt", (e) => { e.preventDefault(); window._tdInstallPrompt = e; showInstall(); });

  /* ---- start: the rows show at once; saved answers, the plan and HRV fill in as they arrive ---- */
  buildRows(); render(); renderA2hs();

  function loadWeek() {
    renderLoading($("tdSession"), "Loading today's session…");
    return cached("today-week", todayWeek).then(async (r) => {
      if (!alive()) return;
      let w = r.data || { sessions: [] };
      // No programme and no sessions in Vela: her intervals.icu calendar is the plan.
      if (!w.name && !w.body && !(w.sessions || []).length) w = (await icuWeek(w)) || w;
      if (!alive()) return;
      S.weekMeta = r; S.week = w; S.ctx = tdCtx(S.week, day);
      renderSession(); renderWeek(); updMeta(); render();
      const ids = movable().map((s) => s.id);
      if (ids.length && !r.stale) pendingMoves(ids).then((p) => { if (!alive()) return; S.pending = p; renderSession(); renderRest(); }).catch(() => {});
      loadMoves(); loadTopUp();
    }).catch((e) => {
      console.warn("[companion] today-week", e);
      if (alive()) renderError($("tdSession"), () => loadWeek().then(() => { if (alive()) { renderLook(); renderNut(S.shareAt); } }));
    });
  }
  // This week from the intervals.icu calendar (last Monday to Sunday, as todayWeek reads
  // Vela), or null when it has nothing: workouts and races, not notes.
  async function icuWeek(w) {
    const monday = w.monday || _tdAddDays(day, -((new Date(day + "T12:00:00").getDay() + 6) % 7));
    const back = tdDaysTo(day, _tdAddDays(monday, -7)), ahead = tdDaysTo(_tdAddDays(monday, 6), day);
    let ev = [];
    try { ev = await intervalsEvents(back, ahead); } catch (e) { return null; }
    const ss = (ev || []).filter((e) => e && e.name && /^(WORKOUT|RACE)/i.test(e.category || "WORKOUT"))
      .map(tdIcuSession).filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
    return ss.length ? { name: null, week: null, weeks: null, body: null, monday, sessions: ss, icu: true } : null;
  }

  // Today's movements: what the coach prescribed in today's Vela sessions, matched to the
  // exercise library for photos (and cues when Vela has none). For a calendar session, the
  // lines of its description that name a library movement.
  async function loadMoves() {
    const c = S.ctx; if (!c || !c.sessions || !c.sessions.length) return;
    let lib = {};
    try { lib = await exerciseLibrary(); } catch (e) {}
    const moves = {};
    const ids = c.sessions.filter((s) => s.id).map((s) => s.id);
    if (ids.length) {
      let rows = [];
      try { rows = (await sessionMovements(ids)) || []; } catch (e) { console.warn("[companion] movements", e); }
      rows.slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).forEach((x) => {
        const meta = exMatch(lib, x.exercise_name) || {};
        const dose = x.sets && x.reps ? x.sets + " × " + x.reps : x.sets ? x.sets + " sets" : x.reps || "";
        (moves[x.session_id] = moves[x.session_id] || []).push({
          name: x.exercise_name, dose: dose + (x.tempo ? (dose ? " · " : "") + "tempo " + x.tempo : ""),
          desc: x.why || meta.description || "", note: x.notes || "",
          cues: x.cues && x.cues.length ? x.cues : meta.cues || [], photo: meta.photo || "", video: x.video_url
        });
      });
    }
    c.sessions.forEach((s, i) => {
      if (s.id || !s.description) return;
      const list = tdIcuMovements(s.description, lib);
      if (list.length) moves["icu" + i] = list.map((m) => ({ name: m.name, dose: m.dose, desc: m.meta.description || "", cues: m.meta.cues || [], photo: m.meta.photo || "" }));
    });
    if (!alive() || S.ctx !== c) return;
    S.moves = moves; renderSession();
  }

  // Tomorrow is a long run, a KEY session or a race: on a rest or easy day, Today says to top
  // up carbs. Fuel's own day model decides (fuelTopUpToday), so the line only shows when the
  // Fuel tab it links to says top-up too. Vela's plan first; with no session in it tomorrow,
  // the intervals.icu calendar.
  async function loadTopUp() {
    if (typeof fuelTopUpToday !== "function" || !S.week || S.week.body) return;
    const c = S.ctx, tom = _tdAddDays(day, 1);
    let rows = S.week.sessions.filter((s) => s.date === day || s.date === tom).map(tdFuelRow);
    if (!rows.some((s) => s.scheduled_date === tom)) {
      let ev = [];
      try { ev = await intervalsEvents(1, 2); } catch (e) {}
      rows = rows.concat((ev || []).filter((e) => e && e.name && /^(WORKOUT|RACE)/i.test(e.category || "WORKOUT"))
        .map(tdIcuSession).filter((s) => s.date === tom).map(tdFuelRow));
    }
    let t = null;
    try { t = fuelTopUpToday(rows, day); } catch (e) { console.warn("[companion] top-up", e); }
    if (!alive() || S.ctx !== c) return;
    S.topUp = t; if (t) renderSession();
  }

  const weekP = loadWeek();
  const profP = cached("today-profile", myProfile).then((r) => { S.profile = r.data; updMeta(); }).catch((e) => console.warn("[companion] profile", e));
  Promise.all([weekP, profP]).then(() => { if (alive()) { renderLook(); updMeta(); } });

  // readyOk: her saved check-in was actually read. A failed read leaves "Last session felt"
  // alone, so a filled-in guess can never overwrite an answer she saved earlier today.
  let readyOk = true;
  Promise.all([todayReadiness().catch(() => { readyOk = false; return null; }), todayVelaRead().catch(() => null)]).then(([existing, vr]) => {
    if (!alive()) return;
    if (existing) {
      // Only where she hasn't already tapped while this was loading.
      TD_AM.forEach((a) => { if (st[a.k] < 0 && existing[a.k] != null) { st[a.k] = existing[a.k]; segs[a.k].setValue(existing[a.k]); } });
      if (existing.hrv != null && !hrvI.value) { hrvI.value = existing.hrv; S.watch.hrv = Number(existing.hrv); }
      if (existing.rhr != null && !rhrI.value) { rhrI.value = existing.rhr; S.watch.rhr = Number(existing.rhr); }
      if (existing.created_at && !S.checkedAt) S.checkedAt = Date.parse(existing.created_at);
      S.savedVerdict = existing.verdict || null;
    }
    const had = existing && TD_AM.some((a) => existing[a.k] != null);
    if (vr) {
      const mine = _tdGet("vela-read-" + uid), at = Date.parse(vr.created_at);
      if (mine && mine.day === day && mine.id === vr.id) {
        // The read this check-in wrote: still amendable for its first 15 minutes.
        S.velaRow = Date.now() - at < 14.5 * 60000 ? { id: vr.id, at, readiness: vr.readiness } : { locked: true };
      } else {
        // The Vela app's own read: it stands, and nothing from here writes a second one.
        S.velaFromApp = true;
        // Her taps here win over it when she has both.
        if (!had) { S.vela = vr.readiness; S.velaAt = at; }
      }
    }
    if (answered() && !S.editing) S.folded = true;
    S.readyLoaded = readyOk;
    render(); applyEffort();
  });
  // The effort she logged after her last session (her watch through intervals.icu, or the
  // Vela app), to fill in "Last session felt" when she hasn't answered it.
  lastSessionEffort().catch(() => null).then((e) => { S.effort = e; applyEffort(); });

  cached("movement", latestMovement).then((r) => { if (alive()) renderFilm(r.data); }).catch(() => {});
  Promise.all([weekP, profP]).then(() => lastNutritionShare().catch(() => null)).then((at) => { S.shareAt = at; if (alive()) renderNut(at); });

  // History: intervals.icu wellness if wired (gives up after 4 s), else Apple Health via
  // Vela, else the manual logs; with the training load and sessions the HRV tree reads. Both
  // are in before the verdict counts as settled, so opening the app never saves it twice.
  (async () => {
    const treeP = todayTreeInputs().catch(() => ({ load: [], sessions: [] }));
    try { S.hist = await intervalsWellness(42); } catch (e) { S.hist = []; }
    if (!S.hist.length) {
      try { const v = await recentVitals(42); S.hist = v.map((x) => ({ date: x.log_date, hrv: x.hrv, restingHR: x.rhr })); } catch (e) {}
    }
    S.tree = await treeP;
    S.histReady = true;
    if (alive()) render();
  })();
}
