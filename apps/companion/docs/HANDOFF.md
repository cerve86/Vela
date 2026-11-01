# Vela Companion — developer handoff

A working summary for the next developer (human or Claude). Read this first, then
`BUILD-SPEC.md` (architecture + the finalised-decisions section) and `ROADMAP.md`.

> **Status in the Vela repo (1 Nov 2026):** §3 is resolved — Option B, done additively.
> See [`../README.md`](../README.md) for how the companion sits on Vela: the tables it
> added, what it reads from Vela instead of storing, and where it is served. The original
> standalone `schema.sql` and `api/intervals.js` were replaced by a Vela migration and a
> portal route, so they are not in this folder.

---

## 1. What it is
A mobile-first, installable **PWA** — the client companion for Francesca's endurance
coaching (Run&Bun; ~6 mothers training for the Angkor Wat Half Marathon, Jan 2027). Each
athlete signs in and sees **only her own data**.

**Design principle (important):** Vela Companion is the **intelligent layer** — it
*summarises, analyses and visualises*. It is **not** a second system of record. It does
not hold the training calendar or duplicate wearable data; it reads those from
intervals.icu and adds interpretation, feedback and the coach's own content.

## 2. Stack (resolved)
- **Frontend:** vanilla HTML/CSS/JS, no framework. PWA (`manifest.webmanifest` +
  `service-worker.js`). One `init*()` per tab in `js/views.js`, wired in `index.html`'s
  `renderApp()`.
- **Auth:** Supabase **email magic-link** (`js/auth.js`). Not OAuth — see §4.
- **Wearable/training data:** **intervals.icu**, read **server-side** by `api/intervals.js`
  (a Vercel serverless function) using **one coach API key** (HTTP Basic, username
  `API_KEY`), keyed by `athletes.intervals_icu_id`. The key never reaches the browser.
  A **browser-like User-Agent is required** (Cloudflare blocks default clients).
- **Hosting:** Vercel (static site + `/api` functions). HTTPS, no build step.

## 3. ⚠️ THE OPEN DECISION — which Supabase?
This is the one unresolved question. Two valid options:

**Option A — new, dedicated Supabase project (what `supabase/schema.sql` assumes).**
The schema runs as-is on an *empty* project (tested clean on Postgres 16, RLS isolation
verified). Clean and isolated. Downside: the athlete list is maintained separately from
the Vela iOS app's backend.

**Option B — reuse the existing Vela project (`eainnbmlzbhfftcpushs`).**
Architecturally nicer: the Companion becomes the client-facing window into the same
backend the Vela iOS app already uses, and the athletes already exist there as Vela
clients (no duplicate athlete management). **This is the recommended direction IF done
safely.**

**🚨 Safety rules for Option B — do NOT skip:**
- `eainnbmlzbhfftcpushs` is the **live production backend of the Vela iOS app.** Do **not**
  paste `schema.sql` into it or `supabase db push` against it blind.
- `schema.sql` was written to *own* its tables (e.g. `create table athletes …`). The live
  DB likely already has a client/athlete table with a different shape and a different RLS
  model tied to the iOS app. `create table if not exists` silently skips an existing table
  (→ quiet breakage), and new RLS policies on shared tables can change what the iOS app may
  read/write.
- **Before any DDL,** inspect the live schema (read-only):
  `select table_name, column_name, data_type from information_schema.columns where table_schema='public' order by 1,2;`
  and `select tablename, policyname from pg_policies where schemaname='public';`
  (or `supabase db dump --schema public`).
- Then make the Companion **additive**: `alter table <existing clients> add column if not
  exists intervals_icu_id text;` (do **not** create a new `athletes`), add only the new
  Companion tables (readiness_logs, movement_profiles, strength_items, routes, resources),
  ideally in a dedicated `companion` schema so they can't collide, and **match the existing
  auth/RLS** so nothing about Vela changes.

**Blocking question for Option B:** are the Vela clients already Supabase **auth users**
(so a magic-link signs each into her existing account), or does the Vela iOS app use its
own login separate from Supabase auth? This decides whether login is nearly free or needs
a small bridge. *(Unanswered as of this handoff.)*

**`supabase login` / `init` / `link` are safe** (link connects local↔remote without
changing the remote). The risk is the step after — `db push` / applying SQL. Gate that
until the live schema has been reviewed.

## 4. Why magic-link, not intervals.icu OAuth (verified on the intervals.icu forum)
- OAuth apps need **intervals.icu's prior approval** before the flow works at all.
- Tokens **expire with no refresh** (users report 403s after hours) — fragile for an
  always-on app a non-developer must maintain.
- OAuth may **not grant a coach access to athlete data** (privacy design).
- intervals.icu's own guidance: for reading data, use the **API key**, not OAuth.
- **Coach-key reads of a coached athlete's wellness/activities are confirmed by a tested
  forum user (not official docs)** and require the athlete to **accept the coaching
  request** (athletes never share their own keys). **One live check remains:** accept one
  coaching request, call `/athlete/{id}/wellness` with the coach key. Fallback if it fails:
  per-athlete personal keys stored server-side.

## 5. Tabs (all athlete-facing; built + tested)
| Tab | Source | Notes |
|-----|--------|-------|
| **Today** | Supabase (taps) + intervals.icu (HRV/RHR/sleep) | 4 subjective taps → readiness verdict. HRV/RHR read from intervals, manual entry as fallback. Implements the "Reading HRV" card: 7-day rolling avg vs personal band (mean ± 0.75·SD), HRV+RHR together for the strong flag, cause-aware, gate intensity not rest. **Suggest-only; coach confirms.** |
| **Profile** | Supabase `movement_profiles` | 0–5 movement radar (SVG), re-filmed at taper. |
| **Fuel** | **On-device (localStorage)** | Day-aware fuel bottle + Ten Haaf RMR estimate. `fuel_days` table exists but is **unused** (see §6). |
| **Strength** | Supabase `strength_items` + `assets/exercises/exercises.json` | Focus vs Race-ready; drop-in photos per `PHOTO-GUIDE.md`; "photo coming soon" until then. |
| **Routes** | Supabase `routes` | Curated shared library (name, distance, terrain, start, Open-in-Maps/Strava). Coach-writable, athlete read-only. |
| **Progress** | intervals.icu + Supabase/manual | Weekly volume + long-run (from `/activities`), HRV baseline-vs-range (Laborde/Altini/Plews), adherence (planned from intervals.icu `/events` vs done from `/activities`). **The recovery-factor *association* read is coach-only and deliberately NOT in the athlete bundle** (IP + privacy). No calendar grid. |
| **Learn** | Supabase `resources` | Client/public tile grid; Instagram is the public funnel. |

## 6. Data model (current `schema.sql`)
RLS on every table: `athlete_id = auth.uid() or public.is_coach()`. `is_coach()` is a
security-definer helper reading `public.coaches`.
- `coaches`, `athletes` (incl. `intervals_icu_id`), `readiness_logs` (taps + optional
  manual HRV/RHR), `movement_profiles` (jsonb scores), `strength_items`, `routes`,
  `resources`.
- `fuel_days` — **present but unused**; the Fuel tab is on-device only. Decision pending:
  wire it (so fuel check-ins sync and the coach can see them) or drop it to keep the
  backend lean.
- No `planned_sessions` table — removed by design; the plan lives in intervals.icu.

## 7. What changed in this handoff pass
`schema.sql` (+routes, +resources, −planned_sessions), `api/intervals.js` (browser-like
UA; `events` metric added), `js/data.js` (+`intervalsActivities`, `intervalsEvents`,
`myRoutes`, `myResources`), `js/views.js` (+`initRoutes`, `initProgress`, `initLearn` and
their inline-SVG charts), `index.html` (3 new sections + nav buttons + `renderApp` wiring),
`styles.css` (route/learn/progress components; 7-tab nav fits to 375px), `service-worker.js`
(cache bumped to v2; `/api` bypasses cache), `js/config.js` (template), `BUILD-SPEC.md`
(finalised-decisions section).

## 8. Verification done
- `schema.sql` runs clean on real Postgres 16.
- RLS isolation tested with two athletes: each sees only her own rows; shared tables
  (routes/resources) are signed-in-read-only; anonymous sees nothing.
- All new views exercised via a headless harness (seeded + empty states): charts render,
  user text is HTML-escaped (XSS-tested), and the coach-only association read is confirmed
  absent from the athlete Progress bundle.

## 9. Remaining to go live
1. Resolve §3 (which Supabase) — the blocker.
2. Fill `js/config.js` (Supabase URL + anon key).
3. Deploy to Vercel (static + `/api`); add the live URL to Supabase Auth → URL config.
4. Set 4 env vars: `INTERVALS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE` (service-role server-side only).
5. Seed content (routes, resources, each athlete's `movement_profiles` / `strength_items`);
   make the coach a `coaches` row; set each athlete's `intervals_icu_id`.
6. Run the §4 coach-key live check.
