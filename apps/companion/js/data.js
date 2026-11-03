// Per-athlete reads against the Vela backend. Row-Level Security scopes every table to
// the signed-in client, but a coach's session sees all her clients' rows, so reads still
// filter on the client id resolved once below — the same rule the Vela app follows.
//
// Errors are thrown (VelaError, from core.js), never swallowed into null or []: an empty
// answer must mean "there is nothing", so a view can say "Couldn't reach Vela" instead of
// "your coach is putting your plan together" after a network blip. Dates are her local
// dates (ymdLocal/today/daysAgo in core.js), never UTC.
//
// Tab-specific reads go in js/data-today.js, data-fuel.js, data-strength.js and
// data-library.js; this file keeps who she is and the reads several tabs share.

// Unwraps a Supabase result, with a time limit so a hung request becomes an error + retry.
async function q(query, ms) {
  const res = await withTimeout(query, ms || 10000, "Vela");
  if (res.error) throw new VelaError(res.error.message, res.error, "db");
  return res.data;
}

// The Vela client row that IS the signed-in user, or null for a coach / unlinked account.
// Remembered per user, and only once Vela has answered: a failed lookup throws and is
// asked again next time, instead of being remembered as "not an athlete".
let _me, _meFor;
async function myClient() {
  const user = await currentUser();
  if (!user) return null;
  if (_meFor === user.id) return _me;
  const data = await q(window.db.from("clients")
    .select("id, coach_id, goal, calorie_tracking, restrictive_pattern, first_name_hint")
    .eq("profile_id", user.id).maybeSingle());
  _me = data || null; _meFor = user.id;
  return _me;
}
async function myClientId() { const c = await myClient(); return c ? c.id : null; }

// Who she is, for the shell: {client, firstName, coachFirstName, coachWhatsApp}. Her
// coach's first name and WhatsApp link are read the way the Vela app reads her coach
// (profiles, under profiles_client_reads_own_coach); all three are niceties, so a failed
// read falls back to "" rather than failing.
async function myIdentity() {
  const none = { client: null, firstName: "", coachFirstName: "", coachWhatsApp: "" };
  const user = await currentUser();
  if (!user) return none;
  const client = await myClient();
  if (!client) return none;
  let names = {}, wa = "";
  try {
    const read = (cols) => q(window.db.from("profiles").select(cols).in("id", [user.id, client.coach_id]), 6000);
    // A Vela without the WhatsApp column yet must still give her the names.
    const rows = await read("id, first_name, whatsapp_url").catch(() => read("id, first_name"));
    (rows || []).forEach((p) => {
      names[p.id] = (p.first_name || "").trim();
      if (p.id === client.coach_id) wa = (p.whatsapp_url || "").trim();
    });
  } catch (e) { console.warn("[companion] names", e); }
  return {
    client,
    firstName: names[user.id] || (client.first_name_hint || "").trim(),
    coachFirstName: names[client.coach_id] || "",
    coachWhatsApp: wa
  };
}

// Her live programme and this week, Monday to Sunday: {name, week, weeks, days:[{date, sessions}]}.
// Week 1 is the Monday-start week holding the start date, as the Vela app counts it.
async function myPlan() {
  const id = await myClientId(); if (!id) return null;
  const now = new Date(), mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return ymdLocal(d); });
  const [asg, ss] = await Promise.all([
    q(window.db.from("assignments").select("start_date, programs(name, duration_weeks, kind, body)")
      .eq("client_id", id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle()),
    // Prescribed sessions only: a Strava run Vela could not match is stored as a session
    // too, and is not part of the plan.
    q(window.db.from("sessions").select("title, scheduled_date, status").eq("client_id", id)
      .not("program_day_id", "is", null).gte("scheduled_date", days[0]).lte("scheduled_date", days[6]).order("scheduled_date"))
  ]);
  let week = null, weeks = null, name = null, body = null;
  if (asg && asg.programs) {
    name = asg.programs.name; weeks = asg.programs.duration_weeks;
    // A descriptive programme is its text: it has no days, and assigning it makes no sessions.
    if (asg.programs.kind === "descriptive") body = asg.programs.body;
    const s = new Date(asg.start_date + "T00:00:00"); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    week = Math.round((mon - s) / (7 * 864e5)) + 1; // round: a DST week is an hour short or long
    if (week < 1 || week > weeks) week = null;
  }
  return { name, week, weeks, body, days: days.map(d => ({ date: d, sessions: (ss || []).filter(x => x.scheduled_date === d) })) };
}

async function myProfile() {
  const id = await myClientId(); if (!id) return null;
  return q(window.db.from("companion_profiles").select("*").eq("client_id", id).maybeSingle());
}
async function todayReadiness() {
  const id = await myClientId(); if (!id) return null;
  return q(window.db.from("companion_readiness").select("*").eq("client_id", id).eq("log_date", today()).maybeSingle());
}
async function recentVitals(days = 10) {
  const id = await myClientId(); if (!id) return [];
  const data = await q(window.db.from("companion_readiness")
    .select("log_date,hrv,rhr").eq("client_id", id)
    .order("log_date", { ascending: false }).limit(days));
  return (data || []).reverse();
}
async function latestMovement() {
  const id = await myClientId(); if (!id) return null;
  return q(window.db.from("companion_movement_profiles")
    .select("*").eq("client_id", id)
    .order("assessed_at", { ascending: false }).limit(1).maybeSingle());
}
// The movements her coach marked for her in the Vela library (see companion_my_strength).
async function myStrength() {
  return (await q(window.db.rpc("companion_my_strength"))) || [];
}
// Curated routes (her coach's list; RLS lets her read the active ones).
async function myRoutes() {
  const c = await myClient(); if (!c) return [];
  return (await q(window.db.from("companion_routes")
    .select("*").eq("coach_id", c.coach_id).eq("active", true).order("sort"))) || [];
}
// Learn shelf tiles (her coach's; client + public).
async function myResources() {
  const c = await myClient(); if (!c) return [];
  return (await q(window.db.from("companion_resources")
    .select("*").eq("coach_id", c.coach_id).eq("active", true).order("sort"))) || [];
}

// Athlete logs today's readiness taps (insert or update today's row). Returns {error} like
// supabase-js rather than throwing, so a tap can say "not saved" and carry on.
async function saveReadiness(fields) {
  try {
    const id = await myClientId(); if (!id) return { error: { message: "not a client" } };
    return await withTimeout(window.db.from("companion_readiness")
      .upsert({ client_id: id, log_date: today(), ...fields }, { onConflict: "client_id,log_date" }), 10000, "save");
  } catch (e) { return { error: e }; }
}

// The nutrition check's one write (nutrition.html): only the three results and whether her
// periods raised the energy flag; the date is the row's created_at. Never the answers.
// Returns {error} so the tap can say "Not shared".
async function shareNutritionResults(results) {
  try {
    const id = await myClientId();
    if (!id) return { error: "not-client" };
    const res = await withTimeout(window.db.from("companion_nutrition_shares").insert({
      client_id: id,
      energy: results.energy,
      iron: results.iron,
      vitamin_d: results.vitamin_d,
      periods_flag: !!results.periods_flag
    }), 10000, "Vela");
    return { error: res.error || null };
  } catch (e) {
    return { error: e };
  }
}

// --- intervals.icu via the server proxy (apps/web: /api/companion/intervals) ---
// Returns [] when intervals.icu is not connected for her (no coach key, no id on file), is
// slow (4 s) or fails, so each caller falls back to what Vela already holds rather than
// waiting on a third party. `ahead` (events only, 0–14) reaches that many days past
// tomorrow, for the fuel plan's look at tomorrow's session.
async function intervals(metric, days, ahead) {
  try {
    const { data: s } = await window.db.auth.getSession();
    const token = s && s.session ? s.session.access_token : "";
    const more = ahead ? `&ahead=${Math.max(0, Math.min(14, Math.round(Number(ahead) || 0)))}` : "";
    const r = await withTimeout(fetch(`/api/companion/intervals?metric=${metric}&days=${days}${more}`, {
      headers: { Authorization: "Bearer " + token }
    }), 4000, "intervals.icu");
    if (!r.ok) return [];
    const data = await withTimeout(r.json(), 4000, "intervals.icu");
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

// --- Vela's own records, in the shapes the views already read ---

// HRV and resting HR from Apple Health, one value per day: [{date, hrv, restingHR}].
// recorded_at is a timestamp; the day is hers (a 6:30am reading in Singapore is today, not
// yesterday in UTC), and the window starts at her local midnight.
async function velaWellness(days) {
  const id = await myClientId(); if (!id) return [];
  const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);
  const data = await q(window.db.from("metrics")
    .select("recorded_at,type,value").eq("client_id", id)
    .in("type", ["hrv_ms", "resting_hr"]).gte("recorded_at", from.toISOString())
    .order("recorded_at", { ascending: false }).limit(1000));
  // The day's mean, as the Vela app reads it (apps/mobile lib/vitality.ts meanByType): a
  // manual entry beside the imported one must not decide the day on its own.
  const acc = {};
  (data || []).forEach(m => {
    const d = ymdLocal(new Date(m.recorded_at)), k = m.type === "hrv_ms" ? "hrv" : "restingHR", v = Number(m.value);
    if (!isFinite(v)) return;
    const e = (acc[d] = acc[d] || {})[k] = acc[d][k] || { total: 0, n: 0 };
    e.total += v; e.n += 1;
  });
  return Object.keys(acc).sort().map(d => {
    const row = { date: d };
    Object.keys(acc[d]).forEach(k => { row[k] = acc[d][k].total / acc[d][k].n; });
    return row;
  });
}
// Runs synced from Strava: [{start_date_local, distance (m), type, name}].
async function velaActivities(days) {
  const id = await myClientId(); if (!id) return [];
  const data = await q(window.db.from("activities")
    .select("local_date,distance_m,sport_type,name").eq("client_id", id)
    .gte("local_date", daysAgo(days)).order("local_date"));
  return (data || []).map(a => ({
    start_date_local: a.local_date, distance: a.distance_m, type: a.sport_type, name: a.name
  }));
}
// Her planned sessions up to today (or `ahead` days past it):
// [{category, start_date_local, paired_activity_id}].
async function velaPlanned(days, ahead) {
  const id = await myClientId(); if (!id) return [];
  const data = await q(window.db.from("sessions")
    .select("id,scheduled_date,status").eq("client_id", id)
    .not("program_day_id", "is", null).gte("scheduled_date", daysAgo(days)).lte("scheduled_date", daysAgo(-(ahead || 0)))
    .order("scheduled_date"));
  return (data || []).map(s => ({
    category: "WORKOUT", start_date_local: s.scheduled_date,
    paired_activity_id: s.status === "completed" ? s.id : null
  }));
}

// Recent wellness (HRV, resting HR, sleep): intervals.icu if connected, else Apple Health
// through Vela. The Today card falls back to manual entries when both are empty.
async function intervalsWellness(days = 30) {
  const icu = await intervals("wellness", days);
  return icu.length ? icu : velaWellness(days);
}
// Recent COMPLETED activities: intervals.icu if connected, else Strava through Vela.
async function intervalsActivities(days = 42) {
  const icu = await intervals("activities", days);
  return icu.length ? icu : velaActivities(days);
}
// PLANNED sessions: the intervals.icu calendar if connected, else her Vela programme. Up to
// today, or with `ahead` up to that many days past tomorrow.
async function intervalsEvents(days = 42, ahead = 0) {
  const icu = await intervals("events", days, ahead);
  return icu.length ? icu : velaPlanned(days, ahead ? ahead + 1 : 0);
}

// --- effort she logged after a session (RPE), for Today and Progress ---
// Her watch's Perceived Effort reaches intervals.icu as icu_rpe (1–10) and feel (1–5); the
// Vela app's own after-session tap is sessions.session_rpe. intervals.icu when it has her
// activities, else Vela: the athlete who logs in the Vela app and has no watch still counts.
const _rpe = (v) => { const n = Number(v); return v != null && v !== "" && isFinite(n) && n > 0 ? Math.min(10, Math.round(n * 10) / 10) : null; };

// Her completed sessions/activities in the last `days` days up to today:
// [{date, rpe|null, minutes|null, feel|null, title, source}], newest first.
async function _effortRows(days) {
  const from = daysAgo(days), to = today();
  const icu = await intervals("activities", days);
  if (icu.length) {
    return icu.map((a) => ({
      date: String(a.start_date_local || a.start_date || "").slice(0, 10),
      at: String(a.start_date_local || a.start_date || ""),
      rpe: _rpe(a.icu_rpe),
      feel: a.feel != null && isFinite(Number(a.feel)) && Number(a.feel) >= 1 ? Math.min(5, Math.round(Number(a.feel))) : null,
      minutes: Number(a.moving_time) > 0 ? Math.round(Number(a.moving_time) / 60) : null,
      title: a.name || "",
      source: "watch"
    })).filter((x) => x.date && x.date >= from && x.date <= to)
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  const id = await myClientId(); if (!id) return [];
  // Her own rows only: programme sessions and the Strava runs Vela could not match.
  const data = await q(window.db.from("sessions")
    .select("scheduled_date,completed_at,title,session_rpe,duration_sec").eq("client_id", id)
    .eq("status", "completed").gte("scheduled_date", from).lte("scheduled_date", to)
    .order("scheduled_date", { ascending: false }).order("completed_at", { ascending: false, nullsFirst: false }));
  return (data || []).map((s) => ({
    date: s.scheduled_date,
    at: s.scheduled_date + (s.completed_at || ""),
    rpe: _rpe(s.session_rpe),
    feel: null,
    minutes: Number(s.duration_sec) > 0 ? Math.round(Number(s.duration_sec) / 60) : null,
    title: s.title || "",
    source: "vela"
  }));
}

// The effort she logged after her most recent session before today, within the last week:
// {rpe 1–10, feel 1–5|null, date, title, minutes, source:"watch"|"vela"}. null when there
// was no session, or that last one has no RPE: then she taps "last session felt" herself.
// Never throws: a prefill is a nicety, and the manual tap is always there.
async function lastSessionEffort() {
  try {
    const rows = (await _effortRows(7)).filter((x) => x.date < today());
    const last = rows[0];
    if (!last || last.rpe == null) return null;
    return { rpe: last.rpe, feel: last.feel, date: last.date, title: last.title, minutes: last.minutes, source: last.source };
  } catch (e) { console.warn("[companion] last effort", e); return null; }
}

// Session load (sRPE = RPE × minutes) inputs over the last `days` days:
// [{date, rpe|null, minutes|null}], oldest first. A session without an RPE is still listed,
// so Progress can tell "too few logged" apart from "no sessions". Throws like any read.
async function sessionLoads(days = 42) {
  return (await _effortRows(days)).map((x) => ({ date: x.date, rpe: x.rpe, minutes: x.minutes })).reverse();
}

// The movements in the given Vela sessions, with the library card: [{session_id,
// exercise_name, block, sets, reps, tempo, notes, order_index, domain, why, cues,
// video_url}]. Gated movements she isn't cleared for are left out by the database.
async function sessionMovements(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];
  return (await q(window.db.rpc("companion_session_movements", { p_session_ids: list }))) || [];
}
