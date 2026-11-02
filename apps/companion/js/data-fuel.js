// Supabase reads and writes for the Fuel tab, as named async functions (the demo build
// mocks them by name). Shared reads — who she is, her plan, intervals.icu — are in data.js.
// Use q() from data.js so failures throw a VelaError rather than returning null or [].

// Her prescribed sessions from three days back to three days ahead, each with its
// programme day's fuelling type (program_days.fuel_type, read under
// program_days_client_read). Fuel pre-fills today's day type from it: a session today
// sets the type, and a plan with sessions around today but none on it is a rest day.
// {date, sessions}: date is the day it was asked for, so a copy kept on the phone is
// never read as another day's plan.
async function fuelPlanSessions() {
  const date = today();
  const id = await myClientId(); if (!id) return { date, sessions: [] };
  const rows = await q(window.db.from("sessions")
    .select("title, discipline, scheduled_date, status, program_days(fuel_type, notes)")
    .eq("client_id", id).not("program_day_id", "is", null)
    .gte("scheduled_date", daysAgo(3)).lte("scheduled_date", daysAgo(-3))
    .order("scheduled_date"));
  return { date, sessions: rows || [] };
}
