// Supabase reads and writes for the Library tab, as named async functions (the demo build
// mocks them by name). Shared reads — who she is, her plan, intervals.icu — are in data.js.
// Use q() from data.js so failures throw a VelaError rather than returning null or [].

// Her prescribed sessions from `days` ago up to today, with Vela's own status:
// [{date, status, title}]. Progress counts a session as done only when Vela marks it
// completed, never because some activity happened near that day.
async function myPlannedSessions(days) {
  const id = await myClientId(); if (!id) return [];
  const data = await q(window.db.from("sessions")
    .select("scheduled_date,status,title").eq("client_id", id)
    .not("program_day_id", "is", null).gte("scheduled_date", daysAgo(days)).lte("scheduled_date", today())
    .order("scheduled_date"));
  return (data || []).map(s => ({ date: s.scheduled_date, status: s.status, title: s.title }));
}

// Her manual HRV / resting HR from the morning check-in over the last `days` calendar days
// (not the last N rows, so a fortnight off doesn't stretch the baseline back months):
// [{date, hrv, restingHR}], oldest first.
async function myVitalsByDays(days) {
  const id = await myClientId(); if (!id) return [];
  const data = await q(window.db.from("companion_readiness")
    .select("log_date,hrv,rhr").eq("client_id", id)
    .gte("log_date", daysAgo(days)).order("log_date"));
  return (data || []).map(x => ({ date: x.log_date, hrv: x.hrv, restingHR: x.rhr }));
}
