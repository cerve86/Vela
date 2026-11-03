// Supabase reads and writes for the Today tab, as named async functions (the demo build
// mocks them by name). Shared reads — who she is, her plan, intervals.icu — are in data.js.
// Reads use q() from data.js so failures throw a VelaError rather than returning null or [].
// Writes return {error} like saveReadiness, so a tap can say "Not sent" and carry on.

// "YYYY-MM-DD" n days after a local "YYYY-MM-DD" (noon, so a DST night can't skip a day).
function _tdAddDays(ymd, n) { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return ymdLocal(d); }

// Today's richer plan: the programme, which week it is, and every prescribed session from
// last Monday to three weeks ahead, with what kind of session each is. Last week feeds the
// Monday look-back; the weeks ahead find a free day when she asks to rest today.
//   {name, week, weeks, body, monday, sessions:[{id, title, date, status, discipline,
//    duration_sec, fuel_type}]}
async function todayWeek() {
  const id = await myClientId(); if (!id) return null;
  const now = new Date(), mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0, 0, 0, 0);
  const monday = ymdLocal(mon);
  const [asg, ss] = await Promise.all([
    q(window.db.from("assignments").select("start_date, programs(name, duration_weeks, kind, body)")
      .eq("client_id", id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle()),
    // Prescribed sessions only, as in myPlan: an unmatched Strava run is a session too.
    q(window.db.from("sessions")
      .select("id, title, scheduled_date, status, discipline, duration_sec, program_days(fuel_type)")
      .eq("client_id", id).not("program_day_id", "is", null)
      .gte("scheduled_date", _tdAddDays(monday, -7)).lte("scheduled_date", _tdAddDays(monday, 20))
      .order("scheduled_date"))
  ]);
  let week = null, weeks = null, name = null, body = null;
  if (asg && asg.programs) {
    name = asg.programs.name; weeks = asg.programs.duration_weeks;
    if (asg.programs.kind === "descriptive") body = asg.programs.body;
    const s = new Date(asg.start_date + "T00:00:00"); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    week = Math.round((mon - s) / (7 * 864e5)) + 1; // round: a DST week is an hour short or long
    if (week < 1 || week > weeks) week = null;
  }
  return {
    name, week, weeks, body, monday,
    sessions: (ss || []).map((x) => ({
      id: x.id, title: x.title, date: x.scheduled_date, status: x.status, discipline: x.discipline,
      duration_sec: x.duration_sec, fuel_type: x.program_days ? x.program_days.fuel_type : null
    }))
  };
}

// What the HRV decision tree (js/hrv-guidance.js) reads besides HRV and resting HR, fed the
// way the Vela app feeds it (apps/mobile lib/vitality.ts), so both apps read her week the
// same: daily training load, the watch's cardio load where Vela has 3 or more days of it,
// otherwise sets done; and the completed sessions with their effort. Four weeks: this one
// and the three it is read against. {load:[{day, value}], sessions:[{day, discipline, rpe}]}
async function todayTreeInputs() {
  const id = await myClientId(); if (!id) return { load: [], sessions: [] };
  const from = new Date(); from.setDate(from.getDate() - 27); from.setHours(0, 0, 0, 0);
  const [cardio, ss] = await Promise.all([
    q(window.db.from("metrics").select("recorded_at,value").eq("client_id", id)
      .eq("type", "cardio_load").gte("recorded_at", from.toISOString()).limit(1000)),
    q(window.db.from("sessions").select("scheduled_date, discipline, session_rpe, sets_done")
      .eq("client_id", id).eq("status", "completed")
      .gte("scheduled_date", daysAgo(27)).lte("scheduled_date", today()))
  ]);
  const sum = (rows, dayOf, valOf) => {
    const by = {};
    (rows || []).forEach((r) => { const v = Number(valOf(r)); if (isFinite(v)) by[dayOf(r)] = (by[dayOf(r)] || 0) + v; });
    return Object.keys(by).map((day) => ({ day, value: by[day] }));
  };
  const load = sum(cardio, (m) => ymdLocal(new Date(m.recorded_at)), (m) => m.value);
  return {
    load: load.length >= 3 ? load : sum(ss, (s) => s.scheduled_date, (s) => s.sets_done || 0),
    sessions: (ss || []).map((s) => ({ day: s.scheduled_date, discipline: s.discipline, rpe: s.session_rpe }))
  };
}

// The Vela app's daily read for today, if she has done one (the latest window wins, as in
// the app): {id, read_window, readiness 0–4, created_at} or null.
async function todayVelaRead() {
  const id = await myClientId(); if (!id) return null;
  return q(window.db.from("daily_reads").select("id, read_window, readiness, created_at")
    .eq("client_id", id).eq("read_on", today())
    .order("created_at", { ascending: false }).limit(1).maybeSingle());
}

// Files her companion check-in as the Vela app's daily read too, so her coach sees it where
// she already looks. One read per window per day; the window is the wall-clock one the app
// uses (morning until 12, midday until 17, then evening). Returns {id, already, error}:
// already = that window was logged before (the unique index doing its job), not a failure.
async function lockVelaRead(readiness) {
  try {
    const id = await myClientId(); if (!id) return { error: { message: "not a client" } };
    const h = new Date().getHours(), win = h < 12 ? "morning" : h < 17 ? "midday" : "evening";
    const res = await withTimeout(window.db.from("daily_reads")
      .insert({ client_id: id, read_on: today(), read_window: win, readiness })
      .select("id, created_at").maybeSingle(), 10000, "save");
    if (res.error && res.error.code === "23505") return { already: true };
    if (res.error) return { error: res.error };
    return { id: res.data && res.data.id, at: res.data ? Date.parse(res.data.created_at) : Date.now() };
  } catch (e) { return { error: e }; }
}
// A read can be changed for 15 minutes after it was written (the database refuses after,
// quietly, so changed=false then).
async function amendVelaRead(readId, readiness) {
  try {
    const res = await withTimeout(window.db.from("daily_reads").update({ readiness })
      .eq("id", readId).select("id"), 10000, "save");
    return { error: res.error, changed: !!(res.data && res.data.length) };
  } catch (e) { return { error: e }; }
}

// Requests to move a session that her coach hasn't answered yet: [{session_id, to_date}].
async function pendingMoves(sessionIds) {
  const id = await myClientId(); if (!id || !sessionIds.length) return [];
  return (await q(window.db.from("move_requests").select("session_id, to_date")
    .eq("client_id", id).eq("status", "pending").in("session_id", sessionIds))) || [];
}
// Asks her coach to move a planned session (the Vela app's own request: it raises a flag on
// the coach's side, and only the coach can accept it). Returns {error}.
async function requestMove(sessionId, toYmd, note) {
  try {
    const res = await withTimeout(window.db.rpc("request_session_move", { p_session: sessionId, p_to: toYmd, p_note: note || null }), 10000, "move");
    return { error: res.error };
  } catch (e) { return { error: e }; }
}
// Takes a pending request back (the Undo after "I'll rest today").
async function withdrawMove(sessionId) {
  try {
    const res = await withTimeout(window.db.rpc("withdraw_move_request", { p_session: sessionId }), 10000, "move");
    return { error: res.error };
  } catch (e) { return { error: e }; }
}

// When she last shared a nutrition check with her coach (ms), or null.
async function lastNutritionShare() {
  const id = await myClientId(); if (!id) return null;
  const row = await q(window.db.from("companion_nutrition_shares").select("created_at")
    .eq("client_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle());
  return row ? Date.parse(row.created_at) : null;
}
