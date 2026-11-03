/* ============ FUEL — how much to fuel today: the day-aware bottle, the plan for the day,
   an optional check-off, an optional energy floor, the guide and the nutrition check ======
   initFuel(el) renders the whole tab into #fuel. Called by the shell once per signed-in
   user, and again when her local date rolls over (today's taps are day-scoped).
   Everything she taps stays on the phone; the only read is her plan, to pre-fill the day. */

/* ---- Vela's fuelling types, read the way the Vela app reads them (packages/shared fuel.ts
   fuelTypeFor), then folded into the companion's day types ---- */
const _FUEL_QUALITY = /interval|tempo|quality|threshold|hill|bun|fartlek|race|speed|strides|track|vo2/i;
const _FUEL_LONG = /\blong\b|\blsd\b/i;
function _fuelMinutes(text) {
  let best = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|')/gi)) best = Math.max(best, Number(m[1]));
  // "1h30", "2 hours", but not the "6 h" of "6 hills".
  for (const m of text.matchAll(/(\d+)\s*h(?:rs?|ours?)?(?![a-z])\s*(\d{1,2})?/gi)) best = Math.max(best, Number(m[1]) * 60 + Number(m[2] || 0));
  return best;
}
const _fuelIsDouble = (t) => /\bdouble\b(?!-)/i.test(t) || /\bAM\b[\s\S]*\bPM\b/.test(t) || /[·+&,;]\s*PM\b/.test(t);
// The coach's choice on the programme day wins; otherwise the discipline and title decide.
function _fuelTypeFor(s) {
  const pd = s.program_days || {};
  if (pd.fuel_type) return pd.fuel_type;
  const title = s.title || "";
  if (s.discipline !== "run" && s.discipline !== "cross" && s.discipline !== "strength") return "easy";
  if (_fuelIsDouble(title)) return "double";
  if (s.discipline === "strength") return "strength";
  if (_FUEL_LONG.test(title) || _fuelMinutes(title + " " + (pd.notes || "")) >= 75) return "long";
  if (/\bwalk/i.test(title)) return "easy";
  if (_FUEL_QUALITY.test(title)) return "quality";
  return "easy";
}
// Long runs, quality sessions and doubles need the full fuelling; easy and strength days
// less. A day in her plan with no session is a recovery day.
const _fuelDayOf = (type) => (/^(long|quality|double)/.test(type) ? "demanding" : "easy");

/* ---- Fuel for the work required: carbs follow the session coming up, not only today's.
   A rest or easy day before a long or KEY run is a top-up day. ---- */
// The coach's sign-off switch for all of it: false takes the top-up day, its picker option,
// its plate bar, its guide section and Today's line away, and nothing else.
const FUEL_TOPUP = true;
// The day after a YYYY-MM-DD, by calendar arithmetic (no time zone or clock change can
// shift it).
function _fuelNextDay(ymd) {
  const p = String(ymd || "").split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1));
  return d.toISOString().slice(0, 10);
}
// Reads a session in either shape the companion holds: Fuel's own rows (scheduled_date,
// program_days{fuel_type, notes}) or Today's (date, fuel_type, duration_sec), plus race:
// true for an intervals.icu RACE event. Returns "race", "long", "key" or "" for anything
// that doesn't need a top-up the day before.
// Never one of those: the jog around a race ("Pre-race shakeout", "Post-race recovery jog").
const _FUEL_LIGHT = /shake\s*-?\s*out|recovery|\bjog\b|\beasy\b|\bstrides\b|\bwalk/i;
function _fuelBigKind(s) {
  const title = String(s.title || "");
  const pd = s.program_days || {}, ft = pd.fuel_type || s.fuel_type || "";
  if (s.race) return "race";
  const light = _FUEL_LIGHT.test(title);
  // A race is a race: "Race day", "Milano race", not "pre-race", "post-race", "race week" or
  // "race pace" reps.
  if (!light && /(?:^|[^\w-])race\b(?![\s-]*(?:pace|rehearsal|sim|simulation|prep|specific|effort|week))/i.test(title) &&
    !/\b(?:pre|post)\s*-?\s*race\b/i.test(title)) return "race";
  let type = _fuelTypeFor(ft ? Object.assign({}, s, { program_days: { fuel_type: ft, notes: pd.notes } }) : s);
  // Without the coach's type, a planned 75 minutes or more on the run is long.
  if (!ft && s.discipline === "run" && Number(s.duration_sec) >= 75 * 60 && !/^(double|strength)/.test(type)) type = "long";
  // A long run tomorrow; a long ride or hike only when the coach typed the day long.
  if (/^long/.test(type) && (s.discipline === "run" || ft)) return "long";
  // KEY as the coach's label ("KEY 1 Long run", "Key session"), not "Key West"; race-pace
  // reps and a race rehearsal, but not easy running with a few strides at race pace.
  if (/\bKEY\b/.test(title) || /\bkey\s+(?:session|workout|run)\b/i.test(title)) return "key";
  if (!light && /\brace[\s-]*(?:pace|rehearsal|sim|simulation|specific|effort)\b/i.test(title) && !/\bno\s+race\b/i.test(title)) return "key";
  return "";
}
// Tomorrow's top session when it calls for a top-up today: {title, date, kind, run} (kind is
// "race", "long" or "key"; run is false for a long session that isn't a run), or null.
// Pure. Null for everything while FUEL_TOPUP is off.
function fuelTopUp(sessions, todayYmd) {
  if (!FUEL_TOPUP || !Array.isArray(sessions) || !todayYmd) return null;
  const tmr = _fuelNextDay(todayYmd), rank = { race: 3, long: 2, key: 1 };
  let best = null;
  sessions.forEach((s) => {
    if (!s || (s.scheduled_date || s.date) !== tmr || s.status === "skipped") return;
    const kind = _fuelBigKind(s);
    if (kind && (!best || rank[kind] > rank[best.kind])) best = { title: String(s.title || "").trim(), date: tmr, kind, run: s.discipline === "run" };
  });
  return best;
}
// intervals.icu calendar events in the shape fuelTopUp reads, as Today reads them:
// workouts and races, not notes. A run is long at 75 minutes or more, or when its name says
// long; an event in a RACE category is a race whatever its name.
function _fuelIcuRows(events) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && e.start_date_local && e.name && /^(WORKOUT|RACE)/i.test(e.category || "WORKOUT")).map((e) => {
      const name = String(e.name || ""), run = /^(Run|VirtualRun|TrailRun)$/.test(e.type || "");
      const long = run && (Number(e.moving_time) >= 75 * 60 || _FUEL_LONG.test(name));
      return { title: name, discipline: run ? "run" : e.type === "WeightTraining" ? "strength" : "cross",
        scheduled_date: String(e.start_date_local).slice(0, 10), status: e.paired_activity_id ? "completed" : "planned",
        race: /^RACE/i.test(e.category || ""), program_days: { fuel_type: long ? "long" : null, notes: e.description || "" } };
    });
}
// "Long run tomorrow: Sunday long run. Top up today."
function _fuelTopLabel(top) {
  const lead = top.kind === "race" ? "Race tomorrow" : top.kind === "key" ? "KEY session tomorrow" : top.run === false ? "Long session tomorrow" : "Long run tomorrow";
  return lead + (top.title ? ": " + top.title : "") + ". Top up today.";
}
const _fuelDayOk = (k) => _FUEL_DAYS.some((d) => d.k === k);

// What today's plan says: {day, label, session, type, tomorrow} or null when there is no
// plan to go on (no programme, a descriptive one, or a phone copy from another day).
// tomorrow is fuelTopUp's answer (or icuTop, intervals.icu's, when Vela has nothing
// tomorrow): it turns a rest or easy day into a top-up day, and adds "Tonight" to a
// demanding one.
function _fuelFromPlan(data, t, icuTop) {
  if (!data || data.date !== t || !data.sessions || !data.sessions.length) return null;
  const all = data.sessions.filter((s) => s.scheduled_date === t), todays = all.filter((s) => s.status !== "skipped");
  const tomorrow = fuelTopUp(data.sessions, t) || icuTop || null;
  let p;
  if (!todays.length) p = { day: "recovery", label: all.length ? "Today's session is marked as skipped" : "No session in your plan today", session: null };
  else {
    const typed = todays.map((s) => ({ s, type: _fuelTypeFor(s) }));
    const top = typed.filter((x) => _fuelDayOf(x.type) === "demanding")[0] || typed[0];
    p = { day: _fuelDayOf(top.type), label: "From your plan: " + todays.map((s) => s.title).join(" · "), session: top.s, type: top.type };
  }
  p.tomorrow = tomorrow;
  if (tomorrow && (p.day === "recovery" || p.day === "easy")) { p.day = "topup"; p.label = _fuelTopLabel(tomorrow); }
  return p;
}
// For Today: tomorrow's top session when Fuel's own reading of these rows (today's and
// tomorrow's sessions) makes today a top-up day, else null. So Today's "top up carbs" line
// only shows when the Fuel tab it links to says the same.
function fuelTopUpToday(sessions, todayYmd) {
  const p = _fuelFromPlan({ date: todayYmd, sessions: sessions || [] }, todayYmd);
  return p && p.day === "topup" ? p.tomorrow : null;
}

const _FUEL_ITEMS = [
  { k: "before", name: "Fuelled before", hint: "Carbs in before a key or long run",
    tip: "Before a key or long run, a carb snack makes it feel easier." },
  { k: "during", name: "Carbs on the go", hint: "Gel, chews or drink on long or hard sessions",
    tip: "On long or hard sessions, something on the go keeps you going." },
  { k: "after", name: "Recovered after", hint: "Carbs and protein within about an hour",
    tip: "After a session, carbs and protein within about an hour help you recover." },
  { k: "protein", name: "Protein at meals", hint: "A protein source at each main meal",
    tip: "Try a protein source at each main meal." },
  { k: "enough", name: "Ate enough", hint: "A full day's food, no skimping" }
];
const _FUEL_DAYS = [
  { k: "easy", label: "Easy", word: "an easy", active: ["after", "protein", "enough"], target: 0.6,
    carbs: "About 2 cupped hands of carbs at each main meal" },
  { k: "demanding", label: "Demanding", word: "a demanding", active: ["before", "during", "after", "protein", "enough"], target: 0.8,
    carbs: "About 3 cupped hands of carbs at each main meal" },
  // The day before a long or KEY run: more carbs than the day alone asks for. "Recovered
  // after" joins in when she also trains today (see curDay). Gone while FUEL_TOPUP is off.
  { k: "topup", label: "Top-up", word: "a top-up", active: ["protein", "enough"], target: 0.75,
    carbs: "About 3 cupped hands of carbs at each main meal" },
  { k: "recovery", label: "Recovery", word: "a recovery", active: ["protein", "enough"], target: 0.6,
    carbs: "1 to 2 cupped hands of carbs at each main meal" },
  { k: "unwell", label: "Unwell", word: "an unwell", active: ["protein", "enough"], target: 0.55,
    carbs: "" }
].filter((d) => FUEL_TOPUP || d.k !== "topup");
const _FUEL_PHASES = [
  { k: "first", label: "First half", bump: 0,
    note: "First half of your cycle: you often handle carbs and harder efforts well. A good window for a big day." },
  { k: "second", label: "Second half", bump: 0.05,
    note: "Second half of your cycle: you run warmer, burn through carbs faster and effort can feel harder. Be a little more generous with fuel and fluids." },
  { k: "skip", label: "Not tracking", bump: 0, note: "" }
];
const _FUEL_KEY = "rb-fuel-v3", _FUEL_EST_KEY = "rb-est-v4", _FUEL_NUTRI_KEY = "vela-nutrition-v2";
let _fuelSeq = 0;

// Carbs during long runs: grams only where amounts are shown, a gel count otherwise.
const _fuelDuring = () => showAmounts()
  ? "Past about an hour, aim for 30–60 g of carbs an hour: about one gel every 30–45 minutes, or chews or a sports drink to match. Shorter sessions don't need it."
  : "Past about an hour, take a gel every 30–45 minutes, or chews or a sports drink to match. Shorter sessions don't need it.";

function _fuelHtml() {
  const est = showCalories() ? `
  <div class="card fuel-est">
    <details class="watch" id="fuelestd">
      <summary>Want a rough energy number? (optional)</summary>
      <div class="estbox">
        <div class="fields">
          <label>Weight (kg)<input id="fuel-wkg" type="number" inputmode="decimal" min="30" max="150" step="0.5"></label>
          <label>Height (cm)<input id="fuel-hcm" type="number" inputmode="decimal" min="130" max="200" step="0.5"></label>
          <label>Age<input id="fuel-age" type="number" inputmode="numeric" min="16" max="70" step="1"></label>
        </div>
        <div class="selgroup" id="fuel-sportsel"><span class="lbl" id="fuel-sportsel-l">Today's sport</span></div>
        <div class="fields" id="fuel-runinput" hidden><label>Distance (km)<input id="fuel-dkm" type="number" inputmode="decimal" min="0" max="60" step="0.5"></label></div>
        <div class="fuel-met" id="fuel-metinput" hidden>
          <div class="selgroup" id="fuel-effortsel"><span class="lbl" id="fuel-effortsel-l">Effort</span></div>
          <div class="fields"><label>Duration (min)<input id="fuel-dmin" type="number" inputmode="numeric" min="0" max="600" step="5"></label></div>
        </div>
        <p class="estout" id="fuel-estout" aria-live="polite"></p>
        <p class="estnote">A floor to fuel toward, never a limit. A longer or harder session raises it.</p>
      </div>
    </details>
  </div>` : "";
  const rmr = showCalories() ? `
    <details class="fg"><summary>A metabolic (RMR) test</summary>
      <p>It measures your resting energy use directly and replaces the estimate with your own number. Ask ${esc(coachName())} if you'd like one.</p></details>` : "";
  // Bars are as long as the plate is big: a recovery plate is a smaller plate, not the same
  // plate with a gap.
  const bar = (carb, label, desc, share) =>
    `<div class="prow"><div class="plabel"><b>${label}</b><span class="desc">${desc}</span></div>
      <div class="bar" style="width:${carb + 52}%" role="img" aria-label="${label}: carbs ${share} of the plate, then protein, fat and veg">
        <i class="carb" style="flex-grow:${carb}">Carbs</i><i class="pro" style="flex-grow:20">Protein</i><i class="fat" style="flex-grow:18">Fat</i><i class="veg" style="flex-grow:14">Veg</i></div></div>`;
  return `
  <h2 class="section-h tab-h" tabindex="-1">How much to fuel today</h2>
  <p class="section-s">Fuel follows the work: today's session, and tomorrow's. A lighter day means fewer carbs, never less food.</p>
  <div class="card fuelcard">
    <div class="fuel-top">
      <div class="viz"><div id="fuelsvg"></div><p class="cap" id="fuelcap"></p></div>
      <div class="fuel-head">
        <div class="fuel-day" id="fuelday" hidden>
          <p class="fuel-dayline" id="fueldayline"></p>
          <p class="fuel-from muted" id="fuelfrom"></p>
          <button type="button" class="btn-text fuel-change" id="fuelchange" aria-expanded="false" aria-controls="fuel-daysel">Change</button>
        </div>
        <div class="selgroup" id="fuel-daysel"><span class="lbl" id="fuel-daysel-l">Today is…</span></div>
      </div>
    </div>
    <div class="fuelmain">
      <div class="fuel-plan" id="fuelplan" aria-live="polite"></div>
      <div class="selgroup" id="fuel-phasesel"><span class="lbl" id="fuel-phasesel-l">Your cycle, only if you track it</span></div>
      <div class="fuel-log">
        <h3 class="fuel-h3" id="fuellog-h">How it's going <span class="muted">(optional)</span></h3>
        <p class="hintline">Check off as you go and the bottle fills toward today's "enough" line.</p>
        <div class="frows" id="fuel-frows"></div>
        <div class="feedback" id="fuel-feedback" aria-live="polite"></div>
        <div class="fuel-clear">
          <button type="button" class="btn-secondary" id="fuel-freset">Clear today</button>
          <div class="fuel-toast" id="fueltoast" role="status"></div>
        </div>
      </div>
    </div>
  </div>
  ${est}
  <section class="card fuel-guide" aria-labelledby="fuelguide-h">
    <h3 class="section-h3" id="fuelguide-h">Fuel guide</h3>
    <details class="fg"><summary>The steady base: protein, fat and fibre</summary>
      <p>Carbs are what moves up and down with training: that's the bottle. Protein, fat and fibre are the steady base. They barely change, and they're never the thing to cut.</p>
      <div class="plate">
        ${bar(48, "Demanding day", "About 3 cupped hands of carbs", "about half")}
        ${FUEL_TOPUP ? bar(38, "Top-up day (before a long or KEY run)", "About 3 cupped hands of carbs", "about two fifths") : ""}
        ${bar(28, "Easy day", "About 2 cupped hands of carbs", "about a third")}
        ${bar(18, "Recovery or rest", "1 to 2 cupped hands of carbs", "about a quarter")}
      </div></details>
    ${FUEL_TOPUP ? `<details class="fg"><summary>Why carbs follow tomorrow's session</summary>
      <p>Carbs are set by the work coming up, not only the work you've done. Starting a long or KEY run with a stocked tank makes it feel easier, all the way to the end.</p>
      <p>A top-up isn't race-week carb-loading, and it isn't every rest day: only the day before a long or KEY session.</p></details>` : ""}
    <details class="fg"><summary>Daily: measure by hand, not by weighing</summary>
      <p>Carbs: a cupped hand. Protein: your palm. Fat: a thumb. Veg and fibre: a fist. Only the carbs change with the day.</p>
      <p>${showAmounts()
        ? "Grams and precise targets are a precision tool for later, when they're useful. They're not a daily routine."
        : "Weighing isn't needed. Your hands are the measure."}</p></details>
    <details class="fg"><summary>Carbs on long runs</summary>
      <p>${_fuelDuring()}</p></details>
    <details class="fg"><summary>Timing around a hard session</summary>
      <p><b>Before and during:</b> simple carbs, low in fibre and fat, so nothing sits heavy. Your first snack after stays simple too: fast carbs and protein.</p>
      <p><b>After, and away from it:</b> bring fibre and healthy fats back from your next proper meal. Veg, wholegrains and good fats belong away from the session.</p></details>
    <details class="fg"><summary>Why fat and fibre stay in</summary>
      <p><b>Fat:</b> hormones, bones, periods and vitamins A, D, E and K all depend on it. Keep it steady when carbs drop.</p>
      <p><b>Fibre:</b> your gut needs it every day. Cutting it to feel light backfires. It's about timing, not removal: just don't stack it right before your hardest runs.</p></details>
    ${rmr}
  </section>
  <section class="card fuel-check" aria-labelledby="fuelcheck-h">
    <h3 class="fuel-h3" id="fuelcheck-h">Energy and nutrition check</h3>
    <p>A few questions on energy, iron and vitamin D, and what to do about anything that comes up. Your answers stay on this phone. You can choose to share just the results with ${esc(coachName())}.</p>
    <p class="fuel-when" id="fuelcheck-when" hidden></p>
    <a class="btn-secondary" href="nutrition.html?from=fuel" id="fuelcheck-go">Take the check</a>
  </section>`;
}

function initFuel(el) {
  const seq = ++_fuelSeq;
  el.innerHTML = _fuelHtml();
  // Today's taps belong to today: a new date starts a clean bottle and asks for the new
  // day's plan.
  onTodayChanged("fuel", () => initFuel(el));
  const t = today();
  const live = () => seq === _fuelSeq;

  /* ---- today's state: her own taps, kept for today only. null = not answered yet ---- */
  const blank = () => ({ date: t, day: "", phase: "", vals: { before: null, during: null, after: null, protein: null, enough: null } });
  let state = blank();
  try {
    const s = JSON.parse(localStorage.getItem(_FUEL_KEY));
    if (s && s.date === t && s.vals) state = Object.assign(blank(), s, { vals: Object.assign(blank().vals, s.vals) });
  } catch (e) {}
  // Any day type the picker offers, "topup" included; anything else reads as not picked.
  if (!_fuelDayOk(state.day)) state.day = "";
  const persist = () => {
    // Open past midnight: start the new day rather than filing these taps under yesterday.
    if (today() !== t) { initFuel(el); return false; }
    try { localStorage.setItem(_FUEL_KEY, JSON.stringify(state)); } catch (e) {}
    return true;
  };
  let plan = null; // what today's plan says, once it has loaded

  const dayEl = $("fuel-daysel"), phEl = $("fuel-phasesel"), frows = $("fuel-frows"), fsvg = $("fuelsvg"), fb = $("fuel-feedback"), cap = $("fuelcap");
  const dayBox = $("fuelday"), dayLine = $("fueldayline"), fromEl = $("fuelfrom"), changeBtn = $("fuelchange"), planEl = $("fuelplan");
  const LABELS = ["Missed", "Some", "Nailed"];
  // Her own pick wins; otherwise the plan's.
  const dayKey = () => state.day || (plan && plan.day) || "";
  const curDay = () => {
    const d = _FUEL_DAYS.filter((x) => x.k === dayKey())[0] || null;
    // A top-up day with a session today still needs the recovery after it.
    return d && d.k === "topup" && plan && plan.session ? Object.assign({}, d, { active: ["after"].concat(d.active) }) : d;
  };
  const curPhase = () => _FUEL_PHASES.filter((p) => p.k === state.phase)[0] || null;
  const targetPct = () => { const d = curDay(); if (!d) return 0.7; const p = curPhase(); return Math.min(0.95, d.target + (p ? p.bump : 0)); };
  const answered = () => { const d = curDay(); return d ? d.active.filter((k) => state.vals[k] != null) : []; };
  let picking = false; // the day picker is open while she changes the day

  function drawBottle(pct, tgt, dim) {
    pct = Math.max(0, Math.min(1, pct));
    const bx = 34, bw = 52, by = 46, bh = 128, r = 14, fillH = bh * pct, fillY = by + bh - fillH, ty = by + bh - bh * tgt;
    const fillCol = dim ? "var(--grid)" : "var(--fuel)", s = [];
    const label = dim ? "Fuel bottle, empty until today's type is picked"
      : "Fuel bottle " + Math.round(pct * 100) + " percent full; enough for today is " + Math.round(tgt * 100) + " percent";
    s.push('<svg viewBox="0 20 140 160" width="140" height="160" role="img" aria-label="' + label + '">');
    s.push('<rect x="' + (bx + bw / 2 - 9) + '" y="26" width="18" height="12" rx="3" fill="var(--grid)"/>');
    s.push('<rect x="' + (bx + bw / 2 - 13) + '" y="35" width="26" height="8" rx="3" fill="' + fillCol + '"/>');
    s.push('<defs><clipPath id="bott"><rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '"/></clipPath></defs>');
    s.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '" fill="var(--fuel-soft)"/>');
    s.push('<rect x="' + bx + '" y="' + fillY.toFixed(1) + '" width="' + bw + '" height="' + fillH.toFixed(1) + '" fill="' + fillCol + '" clip-path="url(#bott)"/>');
    if (tgt > 0 && tgt < 1) {
      s.push('<line x1="' + (bx - 4) + '" y1="' + ty.toFixed(1) + '" x2="' + (bx + bw + 4) + '" y2="' + ty.toFixed(1) + '" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>');
      s.push('<text x="' + (bx + bw + 7) + '" y="' + (ty + 4).toFixed(1) + '" font-size="12" font-weight="600" fill="var(--muted)">enough</text>');
    }
    s.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '" fill="none" stroke="var(--ink)" stroke-width="1.5" opacity="0.22"/></svg>');
    return s.join("");
  }

  // Day type and cycle: built once, kept in step with state by setValue.
  const daySeg = segmented({ labelledBy: "fuel-daysel-l", className: "seg-wrap", options: _FUEL_DAYS.map((d) => ({ value: d.k, label: d.label })),
    // Picking keeps the picker open (arrow keys move through it) until she presses Done.
    value: dayKey() || null, onChange: (v) => { state.day = v; picking = true; if (persist()) renderAll(); } });
  const phSeg = segmented({ labelledBy: "fuel-phasesel-l", className: "seg-wrap", options: _FUEL_PHASES.map((p) => ({ value: p.k, label: p.label })),
    value: state.phase || null, onChange: (v) => { state.phase = v; if (persist()) renderAll(); } });
  dayEl.appendChild(daySeg); phEl.appendChild(phSeg);
  changeBtn.addEventListener("click", () => {
    picking = !picking;
    renderDay();
    if (picking) { const b = daySeg.querySelector('[tabindex="0"]'); if (b) b.focus(); }
    else announce("Today is " + (curDay() || {}).word + " day.");
  });

  // "Today is a demanding day · Change", with where that came from; the picker shows only
  // when there is nothing to go on or she asks to change it.
  function renderDay() {
    const d = curDay();
    dayBox.hidden = !d;
    dayEl.hidden = !!d && !picking;
    changeBtn.textContent = picking ? "Done" : "Change";
    changeBtn.setAttribute("aria-expanded", picking ? "true" : "false");
    if (!d) return;
    dayLine.textContent = "Today is " + d.word + " day.";
    let from = "";
    if (!state.day && plan) from = plan.label;
    else if (state.day && plan && plan.day !== state.day) from = "You changed it. Your plan has " + (_FUEL_DAYS.filter((x) => x.k === plan.day)[0] || {}).word + " day.";
    fromEl.textContent = from;
    fromEl.hidden = !from;
  }

  // The planner: how much and when, for this kind of day. Hand portions for everyone;
  // grams only for carbs on the run, and none when amounts are hidden.
  function renderPlan() {
    const d = curDay();
    if (!d) { planEl.innerHTML = ""; return; }
    const steps = [], tmr = plan && plan.tomorrow;
    let note = "";
    if (d.k === "demanding") {
      steps.push(["Before", "A carb-based meal or snack 2–3 hours before, low in fibre and fat so nothing sits heavy."]);
      steps.push(["During", _fuelDuring()]);
      steps.push(["After", "Carbs and protein within about an hour."]);
      // Back to back: tonight's dinner is tomorrow's fuel.
      if (tmr) steps.push(["Tonight", "Keep carbs generous" + (tmr.title ? ": " + tmr.title + " is tomorrow." : ". Tomorrow is a big one.")]);
    } else if (d.k === "topup") {
      steps.push(["Today", "Top up carbs to stock glycogen for tomorrow's " + (tmr && tmr.title ? tmr.title : "long or KEY run") +
        ": a carb-based snack between meals and a generous carb portion at dinner. Keep fibre and fat moderate tonight so nothing sits heavy."]);
      if (plan && plan.session) steps.push(["After", "Carbs and protein within about an hour of today's session."]);
      // Not the day before a race: race week has its own fuelling, and this mustn't argue with it.
      if (!tmr || tmr.kind !== "race") note = "This is a top-up, not race-week carb-loading.";
    } else if (d.k === "easy") {
      steps.push(["During", "Water's fine. A little electrolyte helps in the heat."]);
      steps.push(["After", "Carbs and protein within about an hour."]);
    } else if (d.k === "recovery") {
      steps.push(["Today", "Maintain: no run to fuel today, but don't under-eat. Protein and a full day's food are how you adapt."]);
    } else {
      steps.push(["Today", "No performance pressure. Eat what you can, keep fluids up and rest."]);
    }
    steps.push(["All day", "Protein at each meal, and a full day's food."]);
    const p = curPhase();
    planEl.innerHTML = (d.carbs ? '<p class="fuel-carbs">' + d.carbs + "</p>" : "") +
      '<ul class="fuel-steps">' + steps.map((s) => "<li><b>" + s[0] + "</b> " + esc(s[1]) + "</li>").join("") + "</ul>" +
      (note ? '<p class="fuel-note">' + esc(note) + "</p>" : "") +
      (p && p.note ? '<p class="fuel-phase">' + esc(p.note) + "</p>" : "");
  }

  function renderRows() {
    frows.innerHTML = ""; const d = curDay();
    if (!d) { const h = document.createElement("p"); h.className = "hintline"; h.textContent = "Pick today's type above. It decides what to fuel for."; frows.appendChild(h); return; }
    _FUEL_ITEMS.forEach((it) => {
      const on = d.active.indexOf(it.k) >= 0;
      const row = document.createElement("div"); row.className = "frow" + (on ? "" : " off");
      const id = "fu-" + it.k;
      row.innerHTML = '<div class="fh"><b id="' + id + '">' + it.name + "</b><span>" + it.hint + "</span></div>";
      if (on) {
        // Not answered yet stays unanswered: nothing reads as chosen, nothing as missed.
        row.appendChild(segmented({ labelledBy: id, options: LABELS, value: state.vals[it.k],
          onChange: (i) => { state.vals[it.k] = i; if (persist()) drawFuel(); } }));
      } else {
        const na = document.createElement("p"); na.className = "na";
        na.textContent = it.k === "during" ? "Not needed today. Water's fine." : "Not needed today";
        row.appendChild(na);
      }
      frows.appendChild(row);
    });
  }

  function drawFuel() {
    const d = curDay();
    if (!d) { fsvg.innerHTML = drawBottle(0, 0, true); cap.textContent = "Pick today first"; fb.innerHTML = ""; return; }
    const done = answered();
    let sum = 0; done.forEach((k) => (sum += state.vals[k]));
    // The bottle fills through the day: what's not answered yet adds nothing and takes nothing.
    const fill = sum / (2 * d.active.length), tgt = targetPct();
    fsvg.innerHTML = drawBottle(fill, tgt, false);
    cap.textContent = !done.length ? "Fills as you check off today"
      : fill >= tgt ? "Fuelled for today"
      : done.length < d.active.length ? done.length + " of " + d.active.length + " checked so far"
      : fill >= tgt * 0.55 ? "Getting there" : "Room to top up";
    if (!done.length) { fb.innerHTML = ""; return; }
    // Feedback only on what she has answered.
    const msg = [], e = state.vals.enough;
    if (e === 2) msg.push("<b>You ate enough today.</b> That's the one that matters most.");
    else if (e === 1) msg.push("Top up a little more through the day. Fuelling the work beats cutting back.");
    else if (e === 0) msg.push("Today's big one: <b>eat a bit more.</b> Under-fuelling is what holds running back. Aim up, never down.");
    const tips = _FUEL_ITEMS.filter((it) => it.tip && d.active.indexOf(it.k) >= 0 && state.vals[it.k] === 0).map((it) => it.tip);
    if (tips.length) msg.push(tips.slice(0, 2).join(" "));
    if (!msg.length) msg.push(done.length < d.active.length ? "Good so far." : "Well fuelled today.");
    fb.innerHTML = (done.length < d.active.length && e == null ? "<span class='muted'>So far:</span> " : "") + msg.join(" ");
  }

  function renderAll() {
    daySeg.setValue(dayKey() || null); phSeg.setValue(state.phase || null);
    renderDay(); renderPlan(); renderRows(); drawFuel();
  }

  /* ---- Clear today, with Undo ---- */
  const resetBtn = $("fuel-freset"), toast = $("fueltoast");
  let toastTimer = 0, undoState = null;
  const hideToast = () => {
    clearTimeout(toastTimer);
    // Not while she is on the Undo button: wait until she leaves it.
    if (toast.contains(document.activeElement)) { toast.addEventListener("focusout", hideToast, { once: true }); return; }
    toast.innerHTML = ""; undoState = null;
  };
  resetBtn.addEventListener("click", () => {
    const touched = state.day || state.phase || answered().length;
    if (!touched) { announce("Nothing to clear yet."); return; }
    undoState = JSON.parse(JSON.stringify(state));
    state = blank();
    if (!persist()) return;
    picking = false; renderAll();
    toast.innerHTML = 'Cleared. <button type="button" class="btn-text" id="fuelundo">Undo</button>';
    $("fuelundo").addEventListener("click", () => {
      if (!undoState || undoState.date !== today()) { toast.innerHTML = ""; return; }
      state = undoState; undoState = null;
      if (!persist()) return;
      renderAll(); toast.innerHTML = ""; resetBtn.focus(); announce("Today's taps are back.");
    });
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 10000);
  });

  // Earlier versions kept the day and cycle under rb-fuel-v2 with 0 for "not answered";
  // keep today's day and cycle, drop the taps rather than read them as missed.
  if (!state.day && !state.phase) {
    try {
      const o = JSON.parse(localStorage.getItem("rb-fuel-v2"));
      if (o && o.date === t) { if (_fuelDayOk(o.day)) state.day = o.day;
        state.phase = { foll: "first", lut: "second", skip: "skip" }[o.phase] || ""; persist(); }
      localStorage.removeItem("rb-fuel-v2");
    } catch (e) {}
  }
  renderAll();

  const est = showCalories() ? _fuelEstimate(t) : null;

  // Today's plan pre-fills the day (and the estimate's session) when it arrives; a slow or
  // failed read just leaves the picker. Read again when the signal comes back, in case the
  // first try found no copy or only an old one.
  // With nothing in Vela tomorrow, intervals.icu's calendar (when connected) can still say
  // tomorrow is a long or KEY run. With no Vela sessions at all, the calendar is her plan,
  // as on Today. Asked once; not connected or failed just means no top-up.
  let icuTop = null, icuAsked = false;
  const loadPlan = () => cached("fuel-plan", fuelPlanSessions).then((r) => {
    if (!live() || today() !== t) return;
    const p = _fuelFromPlan(r.data, t, icuTop);
    if (p) {
      plan = p;
      renderAll();
      if (est && plan.session) est.prefill(plan.session, plan.type);
    }
    const tmr = _fuelNextDay(t), none = !r.data || r.data.date !== t || !(r.data.sessions || []).length;
    if (icuAsked || typeof fuelTomorrowEvents !== "function" || (!p && !none) || (p && r.data.sessions.some((s) => s.scheduled_date === tmr))) return;
    icuAsked = true;
    fuelTomorrowEvents().then((events) => {
      if (!live() || today() !== t) return;
      // Nothing back (offline, or not connected): ask again when the signal returns.
      if (!events.length) { icuAsked = false; return; }
      const rows = _fuelIcuRows(events);
      // No Vela plan: today and tomorrow straight from the calendar.
      const q2 = p ? null : _fuelFromPlan({ date: t, sessions: rows }, t);
      if (q2) { plan = q2; renderAll(); if (est && plan.session) est.prefill(plan.session, plan.type); return; }
      const top = p && fuelTopUp(rows, t);
      if (!top) return;
      icuTop = top;
      const q3 = _fuelFromPlan(r.data, t, icuTop);
      if (q3) { plan = q3; renderAll(); }
    }).catch((e) => console.warn("[companion] fuel tomorrow", e));
  }).catch((e) => console.warn("[companion] fuel plan", e));
  loadPlan();
  onReconnect("fuel", () => { if (live() && !plan) loadPlan(); });

  /* ---- the energy & nutrition check: the page keeps its own state on the phone ---- */
  function renderCheck() {
    const when = $("fuelcheck-when"), go = $("fuelcheck-go");
    if (!when || !live()) return;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(_FUEL_NUTRI_KEY)); } catch (e) {}
    if (!s || typeof s !== "object") s = {};
    const day = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? fmtDay(ymdLocal(d)) : ""; };
    // A new check keeps the last one under prev until it is finished, so "Last done" holds.
    const done = day(s.completedAt) || day(s.prev && s.prev.completedAt);
    const going = !s.completedAt && (!!s.prev || (s.answers && Object.keys(s.answers).length > 0));
    // "Shared" only while what was sent still matches the results on the phone.
    const same = (a, b) => !!a && !!b && ["energy", "iron", "vitamin_d", "periods_flag"].every((k) => a[k] === b[k]);
    const shared = s.completedAt && same(s.sharedResults, s.results) ? day(s.sharedAt) : "";
    const parts = [];
    if (done) parts.push("Last done " + done + ".");
    if (shared) parts.push("Shared with " + coachName() + " on " + shared + ".");
    if (going) parts.push(done ? "A new one is under way." : "Your answers so far are saved.");
    when.hidden = !parts.length;
    when.textContent = parts.join(" ");
    go.textContent = going ? "Carry on with the check" : done ? "See your results" : "Take the check";
  }
  renderCheck();
  onTabShown("fuel", renderCheck);
  // Back from nutrition.html through the browser's back button restores this page as it was.
  listen("fuel-check", window, "pageshow", renderCheck);
}

/* ---- the optional energy floor (Ten Haaf resting estimate × 1.4 plus the session),
   only where her coach shows calories. Her own numbers stay on the phone; weight is never
   filled in for her. Returns {prefill(session, type)} for the plan. ---- */
function _fuelEstimate(t) {
  const out = $("fuel-estout"), w = $("fuel-wkg"), h = $("fuel-hcm"), a = $("fuel-age"), dkm = $("fuel-dkm"), dmin = $("fuel-dmin"),
        sportEl = $("fuel-sportsel"), effEl = $("fuel-effortsel"), runBox = $("fuel-runinput"), metBox = $("fuel-metinput");
  if (!out || !sportEl) return null;
  const SPORTS = [{ k: "run", label: "Run" }, { k: "bike", label: "Bike" }, { k: "swim", label: "Swim" }, { k: "row", label: "Row" }, { k: "other", label: "Other" }];
  const EFFORTS = [{ k: "easy", label: "Easy" }, { k: "moderate", label: "Moderate" }, { k: "hard", label: "Hard" }];
  const MET = { bike: { easy: 5, moderate: 7.5, hard: 10 }, swim: { easy: 6, moderate: 8, hard: 10 }, row: { easy: 6, moderate: 8.5, hard: 11 }, other: { easy: 5, moderate: 7, hard: 9 } };
  // Weight, height and age carry over; today's session is today's only.
  const sel = { sport: "", eff: "" };
  let mine = false; // she has set today's session herself, so the plan doesn't overwrite it
  try {
    const s = JSON.parse(localStorage.getItem(_FUEL_EST_KEY));
    if (s) {
      if (s.w) w.value = s.w; if (s.h) h.value = s.h; if (s.a) a.value = s.a;
      if (s.date === t) { sel.sport = s.sport || ""; sel.eff = s.eff || ""; if (s.dkm) dkm.value = s.dkm; if (s.dmin) dmin.value = s.dmin; mine = !!s.mine; }
    }
  } catch (e) {}
  const r50 = (x) => Math.round(x / 50) * 50;
  const save = () => {
    if (today() !== t) return;
    try { localStorage.setItem(_FUEL_EST_KEY, JSON.stringify({ w: w.value, h: h.value, a: a.value, date: t, sport: sel.sport, eff: sel.eff, dkm: dkm.value, dmin: dmin.value, mine })); } catch (e) {}
  };
  function toggle() { const isRun = sel.sport === "run"; runBox.hidden = !isRun; metBox.hidden = !(sel.sport && !isRun); }
  function upd() {
    const W = parseFloat(w.value), H = parseFloat(h.value), A = parseFloat(a.value);
    if (!(W >= 30 && W <= 150 && H >= 130 && H <= 200 && A >= 16 && A <= 70)) { out.textContent = "Add your weight, height and age for a rough number."; return; }
    const rmr = 11.936 * W + 587.728 * (H / 100) - 8.129 * A + 29.279, base = rmr * 1.4;
    let ex = 0, extxt = "";
    if (sel.sport === "run") {
      const D = parseFloat(dkm.value) || 0;
      if (D > 0) { ex = D * W * 1.0; extxt = "That includes about " + r50(ex).toLocaleString("en-GB") + " kcal for " + D + " km of running."; }
    } else if (sel.sport && sel.eff) {
      const M = parseFloat(dmin.value) || 0;
      if (M > 0) {
        ex = (MET[sel.sport][sel.eff] - 1) * W * (M / 60);
        const sp = SPORTS.filter((x) => x.k === sel.sport)[0];
        extxt = "That includes about " + r50(ex).toLocaleString("en-GB") + " kcal for " + M + " min of " + (sel.sport === "other" ? "training" : sp.label.toLowerCase()) + " (" + sel.eff + ").";
      }
    }
    if (!ex) extxt = "Add today's session and it goes up.";
    // A floor, not a range: the low end of the estimate, so the number only ever says "at least".
    const floor = r50((base + ex) * 0.93);
    out.innerHTML = "Aim for at least <b>~" + floor.toLocaleString("en-GB") + " kcal</b> today. More is fine. <span class=\"estsub\">" + esc(extxt) + "</span>";
  }
  const sportSeg = segmented({ labelledBy: "fuel-sportsel-l", className: "seg-wrap", options: SPORTS.map((s) => ({ value: s.k, label: s.label })),
    value: sel.sport || null, onChange: (v) => { sel.sport = v; mine = true; toggle(); upd(); save(); } });
  const effSeg = segmented({ labelledBy: "fuel-effortsel-l", options: EFFORTS.map((s) => ({ value: s.k, label: s.label })),
    value: sel.eff || null, onChange: (v) => { sel.eff = v; mine = true; upd(); save(); } });
  sportEl.appendChild(sportSeg); effEl.appendChild(effSeg);
  toggle();
  [w, h, a].forEach((x) => x.addEventListener("input", () => { upd(); save(); }));
  [dkm, dmin].forEach((x) => x.addEventListener("input", () => { mine = true; upd(); save(); }));
  upd();
  return {
    // Today's session from her plan: sport, distance or minutes, and effort, where the plan
    // says. Never over what she set herself today.
    prefill(s, type) {
      if (mine || today() !== t) return;
      const title = (s.title || "") + " " + ((s.program_days && s.program_days.notes) || "");
      let sport = "other";
      if (s.discipline === "run") sport = "run";
      else if (/bike|cycl|spin/i.test(title)) sport = "bike";
      else if (/swim/i.test(title)) sport = "swim";
      else if (/\brow/i.test(title)) sport = "row";
      sel.sport = sport;
      if (sport === "run") { const km = /(\d+(?:\.\d+)?)\s*km\b/i.exec(s.title || ""); if (km && !dkm.value) dkm.value = km[1]; }
      else {
        sel.eff = /^(long|double)/.test(type) || type === "strength" ? "moderate" : type === "quality" ? "hard" : "easy";
        const m = _fuelMinutes(title); if (m && !dmin.value) dmin.value = m;
      }
      sportSeg.setValue(sel.sport); effSeg.setValue(sel.eff || null);
      toggle(); upd();
    }
  };
}
