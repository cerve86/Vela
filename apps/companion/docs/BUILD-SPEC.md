# Vela Companion — build spec (handoff)

A mobile-first installable **PWA**: the client companion for an endurance-coaching
service. ~6 mothers training for a half marathon, on their phones. Each athlete sees
only her own data. This doc is the single source of truth for finishing + deploying it.

## Stack
- **Frontend:** vanilla HTML/CSS/JS (no framework). Installable PWA (manifest + service worker).
- **Auth + app data:** Supabase (Postgres + magic-link auth + row-level security).
- **Wearable/training data:** **intervals.icu** (HRV, resting HR, sleep, activities), pulled
  server-side with the coach's API key — see "intervals.icu" below.
- **Hosting:** Vercel or Netlify (free, HTTPS, serverless functions for `/api`).

## What's built vs. to build
Built (in this repo): the app shell + four working tabs — **Today** (readiness → Supabase),
**Profile** (movement radar from Supabase), **Fuel** (day-aware bottle + Ten Haaf estimate +
link to the nutrition check), **Strength** (per-athlete Focus/Race-ready list with photo +
description + cues; photos are drop-in, see `assets/exercises/photos/PHOTO-GUIDE.md`).
Plus `nutrition.html`, the Supabase schema with RLS, and the intervals.icu proxy stub.

To build (next, per ROADMAP.md):
1. **Wire intervals.icu** into Today + Progress (helper `intervalsWellness()` already in `js/data.js`;
   finish `api/intervals.js`, set env vars, deploy).
2. **Routes** tab — curated run routes (name, distance, terrain, start, "Open in Strava/Maps").
3. **Progress** tab — planned-vs-done, metric trends (volume, long-run, HRV baseline + RHR in the
   Laborde/Altini/Plews baseline-vs-range frame). The "what helps recovery" association read is
   **coach-only**; athletes see clean trends + an interpreted note.
4. **Learn** tab — client-only grid from a Supabase `resources` table (title, image, audience,
   link). Instagram is the public funnel; methodology stays coach-side.

## Data model (Supabase, all RLS `athlete_id = auth.uid()`)
`athletes` (id, name, weight_kg, goal, **intervals_icu_id**), `readiness_logs` (feel taps + manual
HRV/RHR fallback), `fuel_days`, `movement_profiles` (jsonb scores), `strength_items` (movement, tag
focus|race). Coaches (in `coaches`) can read/write everyone. Full SQL in `supabase/schema.sql`.

## intervals.icu integration
- **Model (for a small coached cohort):** you hold ONE intervals.icu **coach API key**. Each athlete
  gives you her intervals.icu link/ID; you store it in `athletes.intervals_icu_id`. The server
  function `api/intervals.js` reads her wellness/activities with your key and returns them to her
  (and only her) view. No per-athlete key, no OAuth needed at this size.
- **API:** base `https://intervals.icu/api/v1`; HTTP Basic auth username `API_KEY`, password = your key;
  numeric athlete id in the path; `GET /athlete/{id}/wellness?oldest=&newest=` and `/activities`.
  Limits ~5000/day (fine for 6). Strava-sourced data isn't exposed; set a browser-like User-Agent.
  If you scale past coached athletes, switch to intervals.icu **OAuth** (Bearer tokens).
- **Env vars** (Vercel/Netlify): `INTERVALS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE`.

## Readiness (HRV/RHR) — follow the "Reading HRV" coaching card
The Today logic implements that card's method (Altini normal-range/CV; Plews-Laursen-Buchheit
7-day rolling average; Stanley reactivation; luteal suppression):
- **Subjective-led** (sleep/legs/energy/last-session); HRV/RHR corroborate, never overrule.
- Judge the **7-day rolling average vs a personal normal band** (mean ± 0.75·SD), not a single
  morning. The CV band widens for a noisier device, so mixed/any device is fine — each athlete is
  compared only to her own trend, never to another person or a fixed number.
- The **strong** suppression flag needs HRV **below band AND RHR up together**; HRV-low with RHR
  normal is a transient. A dip **with a clear cause** (hard session, short sleep, luteal, travel,
  alcohol) is expected — note it, keep easy, let it rebound.
- Low HRV **gates intensity, not training** — soften/move the hard session, keep easy work easy.
- Multi-day reads ("below band, no cause, 2–3 days → cut load"; "baseline down 2–3 weeks → deload")
  live on the **coach-only Progress view**, not the athlete's daily card.

## Athlete onboarding (once all pages are ready)
1. Athlete creates an **intervals.icu** account and connects her watch (so HRV/RHR/sleep flow in).
2. She adds you as her coach on intervals.icu (or sends you her athlete link/ID).
3. You create her in the app (Supabase: invite email + an `athletes` row with her `intervals_icu_id`).
4. You send her the app link; she signs in by magic-link and sees her own pages, with her wearable
   data pulled live from intervals.icu.

## Deploy (5 steps)
1. Supabase project → run `supabase/schema.sql`. Enable email magic-link auth; add the deployed URL
   under Auth → URL config.
2. `js/config.js` ← Supabase URL + anon key (copy from `config.example.js`).
3. Push to GitHub → import in Vercel/Netlify (static site, no build step).
4. Set the four env vars above (for `/api/intervals`).
5. Add athletes + seed their `movement_profiles` / `strength_items`; make yourself a coach.

## Kickoff prompt (paste into the code chat)
```
Finish and deploy a mobile-first PWA — the client companion for my endurance coaching.
~6 mothers, on phones, each sees only her own data.

STACK: vanilla HTML/CSS/JS; Supabase (magic-link auth + Postgres + RLS athlete_id=auth.uid());
intervals.icu for wearable data pulled server-side with my COACH API KEY (never in the browser)
via /api/intervals.js keyed by athletes.intervals_icu_id; deploy to Vercel/Netlify as a PWA.

ALREADY BUILT (this repo): Today (readiness→Supabase), Profile (movement radar), Fuel (bottle +
Ten Haaf estimate + nutrition.html link), Strength (photo+description+cues, drop-in photos).
Schema with RLS in supabase/schema.sql. intervals.icu proxy stub in api/intervals.js; helper
intervalsWellness() in js/data.js.

BUILD NEXT: (1) finish api/intervals.js + wire Today and Progress to intervals wellness/activities;
(2) Routes tab (curated routes + Open-in-Strava/Maps links); (3) Progress tab (planned-vs-done +
trends: volume, long-run, HRV baseline+RHR in Laborde/Altini/Plews baseline-vs-range; the recovery-
factor association read is COACH-ONLY, athletes see clean trends + an interpreted note); (4) Learn
tab (client-only grid from a Supabase `resources` table; Instagram is the public funnel).

RULES: no brand names on the page (label "Coach check-in"); all scientific evidence/citations
coach-side only — athletes see a visual + one plain line, deeper detail behind <details>; readiness
follows the "Reading HRV" card (7-day rolling avg vs a personal CV band, HRV+RHR together for the
strong flag, cause-aware dips, gate intensity not rest) and is suggest-only, coach confirms. Match
the existing palette/components. Mobile-first, light/dark,
accessible. Exercise visuals stay "photo/video coming soon" until the coach drops photos into
assets/exercises/photos/ (see PHOTO-GUIDE.md).
```

## Architecture decisions (finalised Nov 2026)
These supersede anything above that conflicts.

- **Vela is the intelligent layer, not a second system of record.** It summarises,
  analyses and visualises; it does not duplicate the athlete's schedule or wearable data.
- **No calendar/plan inside the app.** The plan lives in intervals.icu (and its Google/
  Apple calendar sync). Progress reads *planned* sessions from the intervals.icu calendar
  (`GET /athlete/{id}/events`) and *completed* ones from `/activities`, and shows an
  interpreted adherence read — never a calendar grid. There is no app-side sessions table.
- **Login = Supabase email magic-link.** Verified against intervals.icu's own guidance that
  OAuth is the wrong fit here: OAuth apps need intervals.icu's prior approval, tokens expire
  with no refresh (403s after hours), and OAuth may not grant coaches access to athlete data.
  The personal/coach **API key** is the supported path for reading data.
- **Wearable + training data (HRV, resting HR, sleep, RPE, activities, planned events) is
  read from intervals.icu** server-side with the ONE coach API key, keyed by
  `athletes.intervals_icu_id`. Confirmed on the intervals.icu forum: a coach's key reads a
  coached athlete's wellness/activities once the athlete **accepts the coaching request**
  (athletes never share their own keys). One live check to run once you have your key:
  accept one coaching request, hit `/athlete/{id}/wellness` — proves the model end-to-end.
- **Supabase holds only what intervals.icu can't:** identity (`athletes` + magic-link auth),
  the in-app morning readiness taps (`readiness_logs`, with optional manual HRV/RHR fallback),
  the coach's own content (`movement_profiles` radar, `strength_items`), and the curated
  shared lists the coach manages in the table editor (`routes`, `resources`).
- **Fuel tab is on-device** (localStorage); the `fuel_days` table is currently unused — kept
  as a hook if fuel check-ins should later sync / be coach-visible.
- RPE enhancement available later: Today's "last session felt" tap could be corroborated by
  reading the most recent activity's RPE from intervals.icu (not built; taps stay primary).
