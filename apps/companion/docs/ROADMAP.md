# Companion — product roadmap

## Information architecture (target)
1. **Today** (dynamic) — greeting, readiness verdict, metric cards, plan-today fuel. ✅ in shell
2. **Profile** (static) — movement radar, re-checked at taper. ⏳ integrate from movement_profiles.html
3. **Fuel** (static base + day) — periodised base, day bottle, energy/nutrition check. ⏳ integrate
4. **Strength** (static) — Focus vs Race-ready, swappable visuals. ✅ shell; ⏳ full SVG set
5. **Routes** (new) — where to run + how far.
6. **Progress** (new) — planned-vs-done, metric trends, recovery-factor read.
7. **Learn** (new) — client-only evidence shelf (see IP strategy).

## Routes — Strava
- **Start simple:** a curated Routes page you control — your vetted R&B loops: name,
  distance, terrain, start point, and an "Open in Strava / Maps" link. High value, no
  mapping cost, no API wait. Answers "where can I run? how far?" directly.
- **Later:** pull each athlete's OWN recent run maps via the Strava API (their data,
  with the required "View on Strava" attribution). Full interactive maps (Mapbox) only
  if truly needed — adds cost + complexity.

## Progress
- **Planned vs completed** (adherence) from session data.
- **Metric trends:** weekly volume, long-run progression, HRV baseline + RHR — framed
  with the Laborde/Altini/Plews approach (baseline vs normal range, not single days).
- **Recovery-factor read:** lightweight *associations* between inputs (sleep, prior-day
  load, cycle phase) and next-day HRV/readiness. Stated as associations, NOT causation,
  with an n-caveat until enough days are logged. Keeps the academic bar.

## Evidence & IP strategy (the moat)
Split content by intent — **publish the "that," withhold the "how":**
- **Public (Instagram = top of funnel):** authority infographics that share the insight
  and the *why* ("why mums under-fuel and what it costs", "what HRV really reflects").
  Conclusions, not recipes. Proves expertise → attracts clients.
- **Client-only (in-app Learn shelf):** curated tiles that reinforce *their* training and
  lift perceived value + retention. Can repost your IG tiles + client-only extras.
- **Coach-only (never published):** the edge — exact thresholds, your periodised-nutrition
  logic, the readiness decision-tree, formulas, the bibliography. Stays coach-side.

**Recommendation:** NOT a public in-app forum (leaks IP, needs moderation, thin traffic,
weak moat). Instead an in-app **Learn** grid driven by a Supabase `resources` table
(title, image, audience = client | public, optional link) + Instagram as the public
channel. Single source: the app can mirror your IG tiles.

## Build order
1. Integrate real radar + fuel bottle; full exercise SVG set. (agreed)
2. Routes (curated).
3. Progress (once data is logging).
4. Learn shelf (once you have a few tiles); IG in parallel.
