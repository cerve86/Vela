/* ============ LIBRARY — Routes, Learn and Progress in one tab ============
   initLibrary(el) renders the whole tab into #library. Called by the shell once per
   signed-in user. Each part has its own anchor (#library-routes, #library-learn,
   #library-progress) so a link elsewhere can open the tab at that part. */

function libMarkup() {
  const coach = esc(coachName());
  return `
  <h2 class="section-h tab-h" tabindex="-1">Library</h2>
  <p class="section-s">Routes to run, short reads, and how your training is adding up.</p>
  <nav class="jump" aria-label="Parts of the Library">
    <a class="btn-secondary" href="#library-routes">Routes</a>
    <a class="btn-secondary" href="#library-learn">Learn</a>
    <a class="btn-secondary" href="#library-progress">Progress</a>
  </nav>
  <section id="library-routes" class="libsec" aria-labelledby="lib-routes-h">
    <h3 class="section-h3" id="lib-routes-h">Routes</h3>
    <p class="section-s">Routes ${coach} has run and trusts, with where to start.</p>
    <div id="routesout"></div>
    <p class="rexplore"><a class="btn-secondary" href="${esc(STRAVA_RUN_MAPS)}" target="_blank" rel="noopener noreferrer"><span>Explore running maps on Strava<span class="sr-only"> (opens in a new tab)</span></span></a></p>
  </section>
  <section id="library-learn" class="libsec" aria-labelledby="lib-learn-h">
    <h3 class="section-h3" id="lib-learn-h">Learn</h3>
    <p class="section-s">Short reads on the why behind your training.</p>
    <div id="learnout"></div>
  </section>
  <section id="library-progress" class="libsec" aria-labelledby="lib-progress-h">
    <h3 class="section-h3" id="lib-progress-h">Your progress</h3>
    <p class="section-s">How your training is adding up, read over weeks rather than single days.</p>
    <div id="progressout"></div>
  </section>`;
}

async function initLibrary(el) {
  el.innerHTML = libMarkup();
  const parts = [libRoutes, libLearn, libProgress];
  const metas = await Promise.all(parts.map(f => f()));
  // "Today" decides which planned sessions are due and where the race countdown stands.
  onTodayChanged("library", () => { if (el.contains($("progressout"))) libProgress(); });
  // Back online after showing the phone's copy or an error: refresh just those parts.
  onReconnect("library", async () => {
    if (!el.contains($("progressout"))) return;
    for (let i = 0; i < parts.length; i++) if (!metas[i] || metas[i].stale) metas[i] = await parts[i]();
  });
}

/* ---- ROUTES — her coach's list ---- */
function libRoutes() {
  const box = $("routesout"); if (!box) return;
  const card = r => {
    const dist = (r.distance_km != null) ? (Number(r.distance_km) + " km") : "";
    const bits = [dist, r.terrain ? esc(r.terrain) : ""].filter(Boolean).join(" · ");
    const maps = safeUrl(r.map_url, true), strava = safeUrl(r.strava_url, true);
    // The route's name rides along for a screen reader, so ten "Open in Maps" links differ.
    const name = `<span class="sr-only"> ${esc(r.name)}</span>`;
    // A loop with its own link keeps it. One with neither gets Strava's run-map explorer
    // (popular lines, photos, points of interest): not this route, so it says so.
    const links = [
      maps ? `<a class="btn-secondary" href="${esc(maps)}" target="_blank" rel="noopener noreferrer"><span>Open${name} in Maps</span></a>` : "",
      strava ? `<a class="btn-secondary" href="${esc(strava)}" target="_blank" rel="noopener noreferrer"><span>Open${name} in Strava</span></a>` : "",
      !maps && !strava ? `<a class="btn-secondary" href="${esc(STRAVA_RUN_MAPS)}" target="_blank" rel="noopener noreferrer"><span>See running maps on Strava<span class="sr-only"> (Strava's general run-map explorer, not this route; opens in a new tab)</span></span></a>` : ""
    ].filter(Boolean).join("");
    return `<li class="routecard">
      <div class="rhead"><h4 class="rname">${esc(r.name)}</h4>${bits ? `<span class="rmeta">${bits}</span>` : ""}</div>
      ${r.start_point ? `<p class="rstart"><span class="rk">Start</span> ${esc(r.start_point)}</p>` : ""}
      ${r.description ? `<p class="rdesc">${esc(r.description)}</p>` : ""}
      ${links ? `<div class="rlinks">${links}</div>` : ""}
    </li>`;
  };
  return loadInto(box, {
    key: "routes", load: myRoutes, loading: "Loading routes…",
    empty: `No routes yet. ${coachName({ start: true })} adds them here, each with its distance, surface and a map.`,
    render: (routes) => { box.innerHTML = `<ul class="routelist">${routes.map(card).join("")}</ul>`; }
  });
}

/* ---- LEARN — the coach's tiles, with a brand cover when there's no picture ---- */
// A tile has no topic field, so the cover's icon is picked from its words.
const LIB_TOPICS = [
  [/fuel|eat|food|carb|protein|iron|nutri|hydrat|drink|vitamin/i,
    '<path d="M9 2h6"/><path d="M10 2v2.5c0 .8-.4 1.5-1 2-1.3 1-2 2.3-2 3.9V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.6c0-1.6-.7-2.9-2-3.9-.6-.5-1-1.2-1-2V2"/><path d="M7 13h10"/>'],
  [/hrv|recover|sleep|rest\b|stress|heart/i,
    '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'],
  [/strength|tendon|muscle|gym|lift|core|bone/i,
    '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3.5 9v6"/><path d="M20.5 9v6"/><path d="M6.5 12h11"/>'],
  [/cycle|period|hormon|menstru|pregnan|postpartum|menopaus/i,
    '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/>'],
  [/race|pace|taper|marathon|half|10k|5k|run|route/i,
    '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>']
];
const LIB_BOOK = '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M19 17v4H6"/><path d="M9 7h6"/>';
function libCover(t) {
  const words = (t.title || "") + " " + (t.blurb || "");
  const hit = LIB_TOPICS.find(x => x[0].test(words));
  return `<div class="ltcover" aria-hidden="true">
    <svg class="ltsail" viewBox="15 15 66 66"><path d="M42 30 L42 81 L15 81 Q25 52 42 30 Z" class="jib"/><path d="M48 15 L48 81 L81 81 Q73 46 48 15 Z" class="main"/></svg>
    <span class="lticon"><svg viewBox="0 0 24 24">${hit ? hit[1] : LIB_BOOK}</svg></span>
  </div>`;
}

function libLearn() {
  const box = $("learnout"); if (!box) return;
  const tile = t => {
    const link = safeUrl(t.link_url, true);
    const img = safeUrl(t.image_url, true);
    // The cover sits under the picture, so a picture that fails to load leaves the cover.
    const inner = `
      <div class="ltimg">${libCover(t)}${img ? `<img loading="lazy" alt="" src="${esc(img)}" onerror="this.remove()">` : ""}</div>
      <div class="ltbody"><h4 class="lttitle">${esc(t.title)}</h4>${t.blurb ? `<p class="ltblurb">${esc(t.blurb)}</p>` : ""}${link ? '<span class="sr-only"> (opens in a new tab)</span>' : ""}</div>`;
    return `<li>${link
      ? `<a class="ltile" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : `<div class="ltile">${inner}</div>`}</li>`;
  };
  return loadInto(box, {
    key: "resources", load: myResources, loading: "Loading your reads…",
    empty: `Nothing here yet. Short reads from ${coachName()} will appear here.`,
    render: (tiles) => { box.innerHTML = '<ul class="lgrid">' + tiles.map(tile).join("") + "</ul>"; }
  });
}

/* ---- PROGRESS — keeping to the plan, weekly running, long run, recovery trend ----
   Athlete view only: clean trends and ONE interpreted line each. The recovery-factor read
   (sleep/load/cycle -> next-day HRV) is COACH-ONLY and deliberately not in this bundle
   (see BUILD-SPEC + IP strategy). */

// Training load (effort × minutes) is read over 6 Monday-start weeks, this week last, and
// shown only once at least 3 sessions in them carry an effort she logged.
const LIB_LOAD_WEEKS = 6, LIB_LOAD_MIN = 3;

// The HRV baseline is the last 42 days, by the calendar rather than the last 42 readings,
// so a fortnight without the watch doesn't stretch it back months.
const LIB_HRV_DAYS = 42;
const libMean = a => a.reduce((x, y) => x + y, 0) / a.length;
const libSd = a => { const m = libMean(a); return Math.sqrt(libMean(a.map(v => (v - m) * (v - m)))); };
// "YYYY-MM-DD" moved by n days, on her calendar.
const libShift = (ymd, n) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + n); return ymdLocal(d); };
const libDays = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

// Planned sessions over the last four weeks: [{date, done}]. Vela's own status first (the
// Vela app is where she logs the plan); the intervals.icu calendar only for an athlete with
// no programme in Vela, where a session counts once intervals.icu paired an activity to it.
async function libPlanned() {
  const vela = await myPlannedSessions(28);
  if (vela.length) return vela.map(s => ({ date: s.date, done: s.status === "completed" }));
  const ev = await intervalsEvents(28);
  return ev.filter(e => String(e.category || "").toUpperCase() === "WORKOUT")
    .map(e => ({ date: String(e.start_date_local || e.start_date || "").slice(0, 10), done: !!e.paired_activity_id }))
    .filter(e => e.date);
}

// Everything Progress reads, as one bundle so the phone can keep a copy for offline.
async function libProgressData() {
  const [acts, plan, w, profile, loads] = await Promise.all([
    intervalsActivities(56), libPlanned(), intervalsWellness(LIB_HRV_DAYS),
    // The race strip is a nicety: no race row, or no signal for it, never blocks Progress.
    myProfile().catch(() => null),
    // So is training load: without it, the panel just doesn't show.
    sessionLoads(LIB_LOAD_WEEKS * 7).catch(() => [])
  ]);
  const wells = w.length ? w : await myVitalsByDays(LIB_HRV_DAYS);
  return { acts, plan, wells, loads, race: profile ? { name: profile.race_name || "", date: profile.race_date || "" } : null };
}

function libProgress() {
  const box = $("progressout"); if (!box) return;
  return loadInto(box, {
    key: "progress", load: libProgressData, loading: "Loading your progress…",
    render: (d) => { box.innerHTML = libProgressHtml(d); }
  });
}

// The HRV trend: a normal range from her last 42 days (mean ± 0.75·SD, so a noisier watch
// just gives a wider range), and the average of her readings in the last 7 days judged
// against it. Each reading also carries its own 7-day average, which is the line drawn.
// Needs 14 readings for a range and 3 in the last week for a trend.
function libHrvTrend(wells, end) {
  end = end || today();
  const from = libShift(end, -(LIB_HRV_DAYS - 1)), byDay = {};
  (wells || []).forEach(w => {
    const date = String(w.date || "").slice(0, 10), hrv = Number(w.hrv), rhr = Number(w.restingHR);
    if (!date || date < from || date > end) return;
    const row = byDay[date] = byDay[date] || { date };
    if (w.hrv != null && isFinite(hrv) && hrv > 0) row.hrv = hrv;
    if (w.restingHR != null && isFinite(rhr) && rhr > 0) row.rhr = rhr;
  });
  const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  const pts = days.filter(p => p.hrv != null), rhrs = days.filter(p => p.rhr != null).map(p => p.rhr);
  const t = { from, end, points: pts, enough: pts.length >= 14 };
  pts.forEach(p => { const a = libShift(p.date, -6); p.avg7 = libMean(pts.filter(x => x.date >= a && x.date <= p.date).map(x => x.hrv)); });
  if (rhrs.length >= 14) t.rbase = libMean(rhrs);
  if (!t.enough) return t;
  const vals = pts.map(p => p.hrv), m = libMean(vals), s = libSd(vals);
  t.base = m; t.lo = m - 0.75 * s; t.hi = m + 0.75 * s;
  const recent = pts.filter(p => p.date >= libShift(end, -6));
  t.roll7 = recent.length >= 3 ? libMean(recent.map(p => p.hrv)) : null;
  t.pos = t.roll7 == null ? null : t.roll7 < t.lo ? "below" : t.roll7 > t.hi ? "above" : "inside";
  // Whole numbers that never contradict the verdict: "range 49–54, average 49, below" can't
  // happen, because a value below the range is rounded down and the range's edge up.
  const r = Math.round;
  t.show = { base: r(m), lo: r(t.lo), hi: r(t.hi), avg: t.roll7 == null ? null : r(t.roll7) };
  if (t.pos === "below") { t.show.avg = Math.floor(t.roll7); t.show.lo = Math.ceil(t.lo); }
  if (t.pos === "above") { t.show.avg = Math.ceil(t.roll7); t.show.hi = Math.floor(t.hi); }
  return t;
}

// The race on her profile, if it is still ahead: {name, date, days}.
function libRace(race, now) {
  if (!race || !race.date) return null;
  const date = String(race.date).slice(0, 10), days = libDays(now, date);
  return days < 0 ? null : { name: race.name || "", date, days };
}
// A half marathon (by the race's name or her goal) puts a 21.1 km line on the long-run chart.
function libTargetKm(race, goal) {
  const words = ((race && race.name) || "") + " " + (goal || "");
  return /half|21[.,]1|\b21 ?k\b/i.test(words) ? 21.1 : null;
}

// A visible "See the numbers" table under each chart: the same values as text, for a screen
// reader and for anyone who'd rather read them.
function libNumbers(caption, head, rows) {
  return `<details class="watch pgnums"><summary>See the numbers</summary>
    <table class="pgtable"><caption class="sr-only">${esc(caption)}</caption>
      <thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join("")}</tr>`).join("")}</tbody>
    </table></details>`;
}

function libProgressHtml(d) {
  const now = today(), coach = esc(coachName());
  const km = m => (Number(m) || 0) / 1000;
  const runs = (d.acts || []).filter(a => {
    const t = (a.type || "").toLowerCase(); return t.includes("run") || (a.distance && !t);
  }).map(a => ({ date: String(a.start_date_local || a.start_date || "").slice(0, 10), dist: km(a.distance) }))
    .filter(a => a.date && a.date <= now);

  // ---- race strip ----
  const race = libRace(d.race, now);
  let strip = "";
  if (race) {
    const left = race.days === 0 ? "Race day" : race.days < 14 ? `${race.days} day${race.days === 1 ? "" : "s"} to go` : `${Math.floor(race.days / 7)} weeks to go`;
    strip = `<p class="racestrip"><b>${esc(race.name || "Your race")}</b><span aria-hidden="true"> · </span><span class="sr-only">, </span>${left}<span class="rsdate">${esc(fmtDay(race.date))}</span></p>`;
  }

  // ---- keeping to the plan: last four weeks, by Vela's own "completed" ----
  // Today's session isn't counted until it's done: at 7am it hasn't been missed.
  const due = (d.plan || []).filter(p => p.date >= daysAgo(27) && p.date <= now && (p.date < now || p.done));
  let adherence;
  if (due.length) {
    const done = due.filter(p => p.done).length, pct = Math.round(100 * done / due.length);
    adherence = `<div class="card pcard">
      <h4 class="pgh">Keeping to the plan</h4>
      ${libDonut(pct, done, due.length)}
      <p class="pgnote">${done} of ${due.length} planned sessions marked done in the last 4 weeks.</p>
      <p class="pgline">${pct >= 85 ? "Beautifully consistent. This is the part that moves the needle most."
        : pct >= 60 ? "Solid consistency. The sessions you're getting done are doing the work."
        : `Life happens, and what you've done still counts. If the plan isn't fitting your weeks, mention it to ${coach}.`}</p>
    </div>`;
  } else {
    adherence = `<div class="card pcard"><h4 class="pgh">Keeping to the plan</h4>
      <p class="hintline">Once your first planned sessions have passed, you'll see how you're keeping to them here.</p></div>`;
  }

  // ---- weekly running and long run: 8 Monday-start weeks, this week last ----
  const weekKey = s => { const dt = new Date(s + "T00:00:00"); dt.setDate(dt.getDate() - (dt.getDay() + 6) % 7); return ymdLocal(dt); };
  const thisWeek = weekKey(now), total = {}, longest = {};
  runs.forEach(r => { const k = weekKey(r.date); total[k] = (total[k] || 0) + r.dist; longest[k] = Math.max(longest[k] || 0, r.dist); });
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const k = libShift(thisWeek, -7 * i); weeks.push({ k, km: total[k] || 0, long: longest[k] || 0, now: k === thisWeek }); }
  const hasRuns = runs.length > 0;
  const last = weeks[7], prev = weeks[6];
  const volPanel = `<div class="card pcard">
    <h4 class="pgh">Weekly running</h4>
    ${hasRuns ? libBarChart(weeks) + `<p class="pgnote">This week so far ${last.km.toFixed(1)} km · last week ${prev.km.toFixed(1)} km.</p>`
      + libNumbers("Kilometres run each week, last 8 weeks", ["Week starting", "Distance"], weeks.map(w => [fmtDay(w.k) + (w.now ? " (so far)" : ""), w.km.toFixed(1) + " km"]))
      : '<p class="hintline">Your weekly distance shows here once runs come through from your watch.</p>'}
  </div>`;
  const target = libTargetKm(d.race, client() && client().goal);
  const longPanel = hasRuns ? `<div class="card pcard">
    <h4 class="pgh">Long run</h4>
    ${libLineChart(weeks, target)}
    <p class="pgnote">Your longest run each week${target ? ". The dashed line is the half-marathon distance, 21.1 km." : "."}</p>
    ${libNumbers("Longest run each week, last 8 weeks", ["Week starting", "Longest run"], weeks.map(w => [fmtDay(w.k) + (w.now ? " (so far)" : ""), w.long.toFixed(1) + " km"]))}
  </div>` : "";

  // ---- training load: effort × minutes, summed by week ----
  // RPE × minutes per session (sRPE). Only sessions with both count, toward the bars and
  // the wait for 3 logged efforts (so two taps don't read as a trend): an effort logged
  // without the timer has no minutes, and a week of those would chart as zero.
  const lFrom = libShift(thisWeek, -7 * (LIB_LOAD_WEEKS - 1));
  const logged = (d.loads || []).filter(x => x && x.date >= lFrom && x.date <= now && x.rpe != null && Number(x.minutes) > 0);
  let loadPanel = "";
  if (logged.length >= LIB_LOAD_MIN) {
    const lw = [];
    for (let i = LIB_LOAD_WEEKS - 1; i >= 0; i--) { const k = libShift(thisWeek, -7 * i); lw.push({ k, load: 0, n: 0, now: k === thisWeek }); }
    logged.forEach(x => {
      const w = lw.find(y => y.k === weekKey(x.date)); if (!w) return;
      w.n++;
      w.load += Number(x.rpe) * Number(x.minutes);
    });
    lw.forEach(w => { w.load = Math.round(w.load); });
    const lNow = lw[lw.length - 1], lPrev = lw[lw.length - 2];
    loadPanel = `<div class="card pcard">
      <h4 class="pgh">Training load</h4>
      ${libBarChart(lw, { val: w => w.load, unit: "load", what: "Training load each week (effort × minutes)" })}
      <p class="pgnote">Effort × minutes, from what you log after each session.</p>
      <p class="pgnote">This week so far ${lNow.load} · last week ${lPrev.load}.</p>
      ${libNumbers(`Training load each week, last ${LIB_LOAD_WEEKS} weeks`, ["Week starting", "Load", "Sessions with effort"], lw.map(w => [fmtDay(w.k) + (w.now ? " (so far)" : ""), String(w.load), String(w.n)]))}
    </div>`;
  }

  // ---- recovery trend: the same 7-day average and normal range as Today's read ----
  const t = libHrvTrend(d.wells, now);
  let hrvPanel;
  if (t.enough) {
    const s = t.show;
    const rbit = t.rbase ? ` · resting heart rate around ${Math.round(t.rbase)} bpm` : "";
    let line;
    if (t.pos === "inside") line = "Your 7-day average is inside your normal range. Steady, which is exactly what you want through a build.";
    else if (t.pos === "above") line = "Your 7-day average is a little above your normal range, a sign the training is being absorbed well.";
    else if (t.pos === "below") line = `Your 7-day average has dipped below your normal range. Often it's just a hard week or a short night or two. Keep easy days easy and it tends to come back. If it's still low next week, mention it to ${coach}.`;
    else line = "Fewer than three readings in the last 7 days, so there's no trend to read this week.";
    hrvPanel = `<div class="card pcard">
      <h4 class="pgh">Recovery trend (HRV)</h4>
      ${libHrvChart(t)}
      <p class="pglegend" aria-hidden="true"><span class="lg lg-line"></span>7-day average <span class="lg lg-dot"></span>Daily reading <span class="lg lg-band"></span>Your normal range</p>
      <p class="pgnote">Your normal range ${s.lo}–${s.hi} ms${s.avg != null ? ` · 7-day average ${s.avg} ms` : ""}${rbit}.</p>
      <p class="pgline">${line}</p>
      ${libNumbers("HRV readings in the last 6 weeks", ["Date", "Reading", "7-day average"], t.points.map(p => [fmtDay(p.date), Math.round(p.hrv) + " ms", Math.round(p.avg7) + " ms"]))}
      <details class="watch"><summary>What this is</summary>
        <p class="estnote">Your normal range comes from your own readings over the last 6 weeks, and the line is the average of each 7 days, so one morning never decides it. It's never compared with anyone else, and a noisier watch just gives a slightly wider range. Read it alongside how you feel.</p>
      </details>
    </div>`;
  } else {
    hrvPanel = `<div class="card pcard"><h4 class="pgh">Recovery trend (HRV)</h4>
      <p class="hintline">Building your recovery baseline. It needs about two weeks of readings. Until then, how you feel and your resting heart rate carry most of the same signal.</p></div>`;
  }

  return strip + adherence + volPanel + longPanel + loadPanel + hrvPanel;
}

/* ---- charts: inline SVG, theme colours from CSS variables ---- */
const LIB_W = 320, LIB_H = 180, LIB_L = 34, LIB_R = 12, LIB_T = 26, LIB_B = 30;

// A "nice" axis maximum and step for ticks: 1, 2, 2.5 or 5 times a power of ten.
function libNiceAxis(max, ticks = 4) {
  const raw = Math.max(max, 1) / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(v => v >= raw);
  return { step, top: step * Math.ceil(Math.max(max, 1) / step) };
}
function libGrid(top, step, y, out, unit) {
  for (let v = 0; v <= top + 1e-9; v += step) {
    out.push(`<line x1="${LIB_L}" y1="${y(v).toFixed(1)}" x2="${LIB_W - LIB_R}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="${v ? 0.6 : 1}"/>`);
    out.push(`<text class="axt" x="${LIB_L - 4}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${+v.toFixed(1)}</text>`);
  }
  out.push(`<text class="axtitle" x="2" y="12">${unit}</text>`);
}
// Week labels: every other week back from this one, and "this week" for the last.
function libWeekLabel(w, i, n, x, out) {
  if ((n - 1 - i) % 2) return;
  const last = i === n - 1;
  out.push(`<text class="axt" x="${(last ? LIB_W - LIB_R : x).toFixed(1)}" y="${LIB_H - LIB_B + 15}" text-anchor="${last ? "end" : "middle"}">${last ? "this week" : fmtDay(w.k)}</text>`);
}

// Weekly km as bars; this week is a dashed outline labelled "so far", not a sliver that
// reads like a bad week. o (optional) charts something else by week:
//   o.val(w) the bar's value, o.unit the axis title, o.what the chart's accessible name.
function libBarChart(weeks, o) {
  o = o || {};
  const val = o.val || (w => w.km), unit = o.unit || "km";
  const fmt = o.val ? (v => String(Math.round(v))) : (v => v.toFixed(1));
  const n = weeks.length, { step, top } = libNiceAxis(Math.max(...weeks.map(val)));
  const y = v => LIB_T + (LIB_H - LIB_T - LIB_B) * (1 - v / top), gap = (LIB_W - LIB_L - LIB_R) / n, bw = gap * 0.62;
  const out = []; libGrid(top, step, y, out, unit);
  weeks.forEach((w, i) => {
    const h = (LIB_H - LIB_T - LIB_B) * (val(w) / top), x = LIB_L + i * gap + (gap - bw) / 2, yt = LIB_H - LIB_B - h;
    if (w.now) {
      const hh = Math.max(h, 3);
      out.push(`<rect x="${x.toFixed(1)}" y="${(LIB_H - LIB_B - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="var(--base-fill)" stroke="var(--base)" stroke-width="1.4" stroke-dasharray="4 3"/>`);
      out.push(`<text class="axt sofar" x="${(x + bw / 2).toFixed(1)}" y="${(LIB_H - LIB_B - hh - 5).toFixed(1)}" text-anchor="middle">so far</text>`);
    } else {
      out.push(`<rect x="${x.toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="3" fill="var(--base)"/>`);
    }
    libWeekLabel(w, i, n, x + bw / 2, out);
  });
  const said = weeks.map(w => (w.now ? "this week so far " : "week of " + fmtDay(w.k) + " ") + fmt(val(w))).join(", ");
  return `<svg class="pgchart" viewBox="0 0 ${LIB_W} ${LIB_H}" role="img" aria-label="${esc(o.what || "Kilometres run each week")}, last ${n} weeks: ${esc(said)}.">${out.join("")}</svg>`;
}

// Longest run per week as a line building up, this week's point hollow and dashed in (it
// isn't over), and a dashed race-distance line when she's training for a half.
function libLineChart(weeks, target) {
  const n = weeks.length, { step, top } = libNiceAxis(Math.max(...weeks.map(w => w.long), target || 0));
  const y = v => LIB_T + (LIB_H - LIB_T - LIB_B) * (1 - v / top), gap = (LIB_W - LIB_L - LIB_R) / n;
  const x = i => LIB_L + i * gap + gap / 2;
  const out = []; libGrid(top, step, y, out, "km");
  if (target) {
    out.push(`<line x1="${LIB_L}" y1="${y(target).toFixed(1)}" x2="${LIB_W - LIB_R}" y2="${y(target).toFixed(1)}" stroke="var(--fuel-ink)" stroke-width="1.4" stroke-dasharray="5 4"/>`);
    out.push(`<text class="axt target" x="${LIB_W - LIB_R}" y="${(y(target) - 5).toFixed(1)}" text-anchor="end">${target} km</text>`);
  }
  const pt = i => x(i).toFixed(1) + "," + y(weeks[i].long).toFixed(1);
  const done = weeks.map((w, i) => i).filter(i => !weeks[i].now);
  out.push(`<polyline points="${done.map(pt).join(" ")}" fill="none" stroke="var(--base)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
  const cur = weeks.findIndex(w => w.now);
  if (cur > 0) out.push(`<line x1="${x(cur - 1).toFixed(1)}" y1="${y(weeks[cur - 1].long).toFixed(1)}" x2="${x(cur).toFixed(1)}" y2="${y(weeks[cur].long).toFixed(1)}" stroke="var(--base)" stroke-width="1.6" stroke-dasharray="4 3"/>`);
  weeks.forEach((w, i) => {
    out.push(w.now
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(w.long).toFixed(1)}" r="3.6" fill="var(--surface)" stroke="var(--base)" stroke-width="1.6"/>`
      : `<circle cx="${x(i).toFixed(1)}" cy="${y(w.long).toFixed(1)}" r="3.2" fill="var(--base)"/>`);
    libWeekLabel(w, i, n, x(i), out);
  });
  const said = weeks.map(w => (w.now ? "this week so far " : "week of " + fmtDay(w.k) + " ") + w.long.toFixed(1)).join(", ");
  return `<svg class="pgchart" viewBox="0 0 ${LIB_W} ${LIB_H}" role="img" aria-label="Longest run each week in kilometres, last ${n} weeks: ${esc(said)}${target ? `. Half-marathon distance ${target} km` : ""}.">${out.join("")}</svg>`;
}

// HRV: daily readings as faint dots, the 7-day average as the line (what Today's read
// judges), the normal range shaded, across the full 42 days so a gap shows as a gap.
function libHrvChart(t) {
  const pts = t.points, vals = pts.map(p => p.hrv);
  const minV = Math.min(...vals, t.lo), maxV = Math.max(...vals, t.hi); // roll7 is a mean of vals, so inside
  const { step } = libNiceAxis(maxV - minV, 4);
  const y0 = Math.floor(minV / step) * step, y1 = Math.ceil(maxV / step) * step, span = (y1 - y0) || 1;
  const total = libDays(t.from, t.end) || 1;
  const x = date => LIB_L + (LIB_W - LIB_L - LIB_R) * (libDays(t.from, date) / total);
  const y = v => LIB_T + (LIB_H - LIB_T - LIB_B) * (1 - (v - y0) / span);
  const out = [];
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    out.push(`<line x1="${LIB_L}" y1="${y(v).toFixed(1)}" x2="${LIB_W - LIB_R}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="0.6"/>`);
    out.push(`<text class="axt" x="${LIB_L - 4}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${+v.toFixed(2)}</text>`);
  }
  out.push(`<text class="axtitle" x="2" y="12">ms</text>`);
  out.push(`<rect x="${LIB_L}" y="${y(t.hi).toFixed(1)}" width="${LIB_W - LIB_L - LIB_R}" height="${Math.max(y(t.lo) - y(t.hi), 1).toFixed(1)}" fill="var(--base-fill)"/>`);
  pts.forEach(p => out.push(`<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.hrv).toFixed(1)}" r="2" fill="var(--muted)" fill-opacity=".55"/>`));
  out.push(`<polyline points="${pts.map(p => x(p.date).toFixed(1) + "," + y(p.avg7).toFixed(1)).join(" ")}" fill="none" stroke="var(--base)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  // The marked point is the 7-day average the note states, on today's date. When the last
  // reading was a day or two ago, a dashed step carries the line to it.
  const lastP = pts[pts.length - 1];
  if (t.roll7 != null) {
    if (lastP.date < t.end) out.push(`<line x1="${x(lastP.date).toFixed(1)}" y1="${y(lastP.avg7).toFixed(1)}" x2="${x(t.end).toFixed(1)}" y2="${y(t.roll7).toFixed(1)}" stroke="var(--base)" stroke-width="1.6" stroke-dasharray="4 3"/>`);
    out.push(`<circle cx="${x(t.end).toFixed(1)}" cy="${y(t.roll7).toFixed(1)}" r="3.6" fill="var(--base)"/>`);
  }
  const mid = libShift(t.from, Math.round(total / 2));
  out.push(`<text class="axt" x="${LIB_L}" y="${LIB_H - LIB_B + 15}" text-anchor="start">${fmtDay(t.from)}</text>`);
  out.push(`<text class="axt" x="${x(mid).toFixed(1)}" y="${LIB_H - LIB_B + 15}" text-anchor="middle">${fmtDay(mid)}</text>`);
  out.push(`<text class="axt" x="${LIB_W - LIB_R}" y="${LIB_H - LIB_B + 15}" text-anchor="end">${fmtDay(t.end)}</text>`);
  const s = t.show;
  const said = `HRV over the last 6 weeks. Your normal range ${s.lo} to ${s.hi} ms` + (s.avg != null ? `; 7-day average now ${s.avg} ms, ${t.pos === "inside" ? "inside" : t.pos} the range` : "") + ". Every reading is in the table below.";
  return `<svg class="pgchart" viewBox="0 0 ${LIB_W} ${LIB_H}" role="img" aria-label="${esc(said)}">${out.join("")}</svg>`;
}

// Planned sessions done, as a ring.
function libDonut(pct, done, n) {
  const R = 34, C = 2 * Math.PI * R, off = C * (1 - pct / 100);
  return `<svg class="pgdonut" viewBox="0 0 90 90" role="img" aria-label="${pct} percent: ${done} of ${n} planned sessions done">` +
    `<circle cx="45" cy="45" r="${R}" fill="none" stroke="var(--ring)" stroke-width="9"/>` +
    `<circle cx="45" cy="45" r="${R}" fill="none" stroke="var(--fuel)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 45 45)"/>` +
    `<text x="45" y="51" font-size="18" text-anchor="middle" font-weight="700" fill="var(--ink)">${pct}%</text></svg>`;
}
