// Per-athlete reads against the Vela backend. Row-Level Security scopes every table to
// the signed-in client, but a coach's session sees all her clients' rows, so reads still
// filter on the client id resolved once below — the same rule the Vela app follows.
// Dates as she lives them, not in UTC: toISOString() would file a 7am check in Singapore
// under yesterday. ymdLocal is shared with views.js.
const ymdLocal = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => ymdLocal(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymdLocal(d); };

// The Vela client row that IS the signed-in user, or null for a coach / unlinked account.
let _me;
async function myClient() {
  if (_me !== undefined) return _me;
  const user = await currentUser();
  if (!user) return null;
  const { data } = await window.db.from("clients")
    .select("id, coach_id").eq("profile_id", user.id).maybeSingle();
  _me = data || null;
  return _me;
}
async function myClientId() { const c = await myClient(); return c ? c.id : null; }

async function myProfile() {
  const id = await myClientId(); if (!id) return null;
  const { data } = await window.db.from("companion_profiles")
    .select("*").eq("client_id", id).maybeSingle();
  return data;
}
async function todayReadiness() {
  const id = await myClientId(); if (!id) return null;
  const { data } = await window.db.from("companion_readiness")
    .select("*").eq("client_id", id).eq("log_date", today()).maybeSingle();
  return data;
}
async function recentVitals(days = 10) {
  const id = await myClientId(); if (!id) return [];
  const { data } = await window.db.from("companion_readiness")
    .select("log_date,hrv,rhr").eq("client_id", id)
    .order("log_date", { ascending: false }).limit(days);
  return (data || []).reverse();
}
async function latestMovement() {
  const id = await myClientId(); if (!id) return null;
  const { data } = await window.db.from("companion_movement_profiles")
    .select("*").eq("client_id", id)
    .order("assessed_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}
// The movements her coach marked for her in the Vela library (see companion_my_strength).
async function myStrength() {
  const { data } = await window.db.rpc("companion_my_strength");
  return data || [];
}
// Curated routes (her coach's list; RLS lets her read the active ones).
async function myRoutes() {
  const c = await myClient(); if (!c) return [];
  const { data } = await window.db.from("companion_routes")
    .select("*").eq("coach_id", c.coach_id).eq("active", true).order("sort");
  return data || [];
}
// Learn shelf tiles (her coach's; client + public).
async function myResources() {
  const c = await myClient(); if (!c) return [];
  const { data } = await window.db.from("companion_resources")
    .select("*").eq("coach_id", c.coach_id).eq("active", true).order("sort");
  return data || [];
}

// Athlete logs today's readiness taps (insert or update today's row).
async function saveReadiness(fields) {
  const id = await myClientId(); if (!id) return { error: { message: "not a client" } };
  return window.db.from("companion_readiness")
    .upsert({ client_id: id, log_date: today(), ...fields }, { onConflict: "client_id,log_date" });
}

// --- intervals.icu via the server proxy (apps/web: /api/companion/intervals) ---
// Returns [] when intervals.icu is not connected for her (no coach key, no id on file),
// so each caller falls back to what Vela already holds.
async function intervals(metric, days) {
  try {
    const { data: s } = await window.db.auth.getSession();
    const token = s && s.session ? s.session.access_token : "";
    const r = await fetch(`/api/companion/intervals?metric=${metric}&days=${days}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

// --- Vela's own records, in the shapes the views already read ---

// HRV and resting HR from Apple Health, one value per day: [{date, hrv, restingHR}].
async function velaWellness(days) {
  const id = await myClientId(); if (!id) return [];
  const { data } = await window.db.from("metrics")
    .select("recorded_at,type,value").eq("client_id", id)
    .in("type", ["hrv_ms", "resting_hr"]).gte("recorded_at", daysAgo(days))
    .order("recorded_at", { ascending: false }).limit(1000);
  const byDay = {};
  (data || []).forEach(m => {
    const d = m.recorded_at.slice(0, 10), k = m.type === "hrv_ms" ? "hrv" : "restingHR";
    const row = byDay[d] = byDay[d] || { date: d };
    if (row[k] == null) row[k] = Number(m.value); // newest reading of the day wins
  });
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}
// Runs synced from Strava: [{start_date_local, distance (m), type, name}].
async function velaActivities(days) {
  const id = await myClientId(); if (!id) return [];
  const { data } = await window.db.from("activities")
    .select("local_date,distance_m,sport_type,name").eq("client_id", id)
    .gte("local_date", daysAgo(days)).order("local_date");
  return (data || []).map(a => ({
    start_date_local: a.local_date, distance: a.distance_m, type: a.sport_type, name: a.name
  }));
}
// Her planned sessions up to today: [{category, start_date_local, paired_activity_id}].
async function velaPlanned(days) {
  const id = await myClientId(); if (!id) return [];
  const { data } = await window.db.from("sessions")
    .select("id,scheduled_date,status").eq("client_id", id)
    .gte("scheduled_date", daysAgo(days)).lte("scheduled_date", today())
    .order("scheduled_date");
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
// PLANNED sessions: the intervals.icu calendar if connected, else her Vela programme.
async function intervalsEvents(days = 42) {
  const icu = await intervals("events", days);
  return icu.length ? icu : velaPlanned(days);
}
