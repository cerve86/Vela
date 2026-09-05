# Vela — Plan of Approach

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md). This file is the build order.

**Guiding rule: de-risk in reverse order of confidence.** The two things most likely to
derail this project are (a) Apple distribution and (b) health-data access control — not the
features. So both get proven in the first two weeks, on a near-empty app.

Timings assume ~15–20 focused hours/week alongside your practice. Halve them for full-time.

---

## Phase 0 — Foundations & pipeline · ~1 week

Nothing here is a feature. It is the machine that ships features.

- Enrol in the Apple Developer Program; create App ID, bundle IDs (`io.<you>.vela`), App Store Connect record
- Scaffold monorepo (pnpm + Turborepo), TypeScript config, ESLint/Prettier, Git
- Supabase project in **EU (Frankfurt)**, migrations dir, local dev via Supabase CLI
- Expo app with a custom dev client (needed for HealthKit later — do not build on Expo Go)
- Next.js portal skeleton, deployed to Vercel
- GitHub Actions: typecheck + test on PR; EAS Build → TestFlight on `main`
- Sentry wired into both apps

> ### ✅ CP0 — "Hello world" on your phone via TestFlight
>
> A push to `main` produces a build that lands in TestFlight and installs on your iPhone,
> and the portal is live at a URL. **Do not proceed until this works.** Everything after
> is easier; this is the part that surprises people.

### Phase 0 progress — 2026-08-10

| Item                                                           | State                             |
| -------------------------------------------------------------- | --------------------------------- |
| Monorepo (npm workspaces), TypeScript, shared domain package   | ✅ Done                           |
| Coach portal — roster, client deep-dive, chart kit             | ✅ Running on seed data           |
| iOS app — Today, session logging, progress, nutrition, profile | ✅ Written, builds locally        |
| Supabase schema + default-deny RLS + pgTAP CP1 tests           | ✅ Written, not yet applied       |
| CI — typecheck, lint, build, RLS tests                         | ✅ Written                        |
| TestFlight pipeline                                            | ✅ 0.1.0 (4) submitted 2026-08-16 |

**Environment findings on this Mac**

- `pnpm` needed root to install → switched to npm workspaces. Better for Expo regardless:
  Metro has long-standing friction with pnpm's symlinked `node_modules`.
- ~~Xcode had no iOS platform component installed~~ — **resolved**. Xcode 26.6 ships the
  iOS 26.5 SDK; until the matching platform was installed via Xcode → Settings →
  Components, `xcodebuild` offered _zero_ iOS destinations (device or simulator), even
  though simulator runtimes existed. Build against an **iOS 26.5** simulator: a 27.0
  runtime is newer than the SDK and is not a valid destination.
- CocoaPods requires a UTF-8 locale and this shell has no `LANG`. Every build command
  here is prefixed with `LANG=en_US.UTF-8`; make it permanent with
  `echo 'export LANG=en_US.UTF-8' >> ~/.zshrc`.
- Supabase CLI and Docker are not installed — needed before Phase 1 can apply migrations.

---

## Phase 1 — Identity, tenancy & security · ~1.5 weeks

- `profiles` / `coaches` / `clients` / `client_invites` schema + migrations
- Supabase Auth: email magic link + Sign in with Apple
- Coach invites a client by email → deep link → client signs up on iOS, auto-linked
- **RLS on every table, default deny**, both policy shapes from ARCHITECTURE §3.2
- pgTAP test suite in CI: a second client and a second coach each read **zero** rows
- Consent capture screen (ToS, privacy, explicit health-data consent) writing to `consents`
- In-app account deletion + data export Edge Function (do it now — Apple requires it, and retrofitting cascade deletes later is miserable)

> ### ✅ CP1 — Two clients cannot see each other — **MET 2026-08-10**
>
> Verified end to end on the local stack:
> coach signs in by magic link → invites Marta Rossi → real email arrives → deep link
> opens the iOS app → tapping it verifies her address (`email_confirmed_at` set) →
> invite redeemed → consent captured → she lands in the app, and the coach's roster
> shows her as Active. 14 pgTAP assertions green.
>
> **Findings worth keeping:**
>
> - RLS filters rows; GRANTs decide table access. Missing grants made every query
>   return zero rows — which reads exactly like working isolation, and would have made
>   a negative-only test suite pass for the wrong reason. Every negative assertion is
>   now paired with a positive control.
> - `inviteUserByEmail` renders from the auth user's _stored_ metadata, so a re-invite
>   mailed the previous (just-revoked) token. Metadata is now overwritten first.
> - A magic link started in the coach's browser cannot complete a PKCE exchange on the
>   client's phone. The invite email carries GoTrue's `token_hash` instead, and
>   returning clients sign in with a 6-digit OTP.
>
> **Closed out 2026-08-10.** Invitation now uses a six-digit code rather than a deep
> link, which removed the token-in-metadata failure mode entirely — there is no secret
> in the email to go stale. Acceptance is keyed on the caller's _verified_ email, which
> is the only thing the old token ever proved.
>
> Account deletion and data export are wired and verified on device: export writes a
> JSON file and opens the iOS share sheet; deletion erases the auth user, client row
> and consents, leaving an audit row that deliberately carries no subject identifier.
>
> Two further findings:
>
> - A local Supabase email template is fetched by GoTrue over HTTP from Kong. Rewriting
>   the template file replaces its inode and breaks the single-file bind mount, so Kong
>   404s and GoTrue silently falls back to the default email. `supabase stop && start`
>   re-establishes it — `db reset` alone does not.
> - The delete confirmation was originally two stacked `Alert`s. Presenting an Alert from
>   inside another Alert's handler races the first one's dismissal, and a single tap was
>   observed deleting an account outright. Replaced with an inline typed challenge
>   ("type DELETE"), which is deterministic and verified to stay disabled on wrong input.

---

## Phase 2 — Exercise library & program builder · ~2 weeks

- Exercise CRUD in portal: name, cues, muscle groups, equipment, video upload to private Storage
- Seed ~120 common rehab + strength exercises
- Program builder: weeks → days → items, supersets/blocks, drag-to-reorder, prescribed sets/reps/load/tempo/rest
- Save as reusable template; duplicate week; assign to client with a start date → generates `sessions`
- iOS: calendar/agenda view of assigned sessions, session detail with video playback

### Phase 2 progress — exercise library shipped 2026-08-11

> Library is live on real data: 16 shipped exercises across pelvic floor, strength,
> impact, running and mobility, plus coach-owned custom exercises. Filter by category,
> search across name/muscle group/equipment, "mine only" toggle.
>
> Design decisions worth keeping:
>
> - One table for shipped and custom exercises, so a programme item has a single foreign
>   key even when a day mixes both.
> - Shipped rows are read-only; "Duplicate to edit" is how a coach customises one. That
>   keeps everyone's library upgradeable when Vela adds exercises.
> - Archive, never delete. A programme written months ago still points at the row, and
>   hard-deleting would silently rewrite a client's training history.
> - Case-insensitive uniqueness per owner, so no coach ends up with two identically
>   named exercises and no way to tell which a programme references.
> - 4 further pgTAP assertions: a coach sees the shipped library and her own exercises,
>   and none of another coach's.
>
> **Programme builder shipped 2026-08-12.** Programmes → weeks → days → items, with an
> exercise picker drawing on the library, inline editing of sets/reps/load/RPE/rest, and
> assignment to a client with a start date.
>
> - The programme is the PRESCRIPTION; sessions are dated INSTANCES generated on assign.
>   Keeping them apart is what stops editing next week's plan from rewriting last week's
>   history — the thing that makes progress analysis trustworthy in Phase 3.
> - `day_no` is the nth training day of the week, not a weekday. The start date decides
>   the calendar, so one programme fits any schedule.
> - Re-assigning cancels the live assignment and clears only _future_ scheduled sessions.
>   Completed and past sessions stay.
> - Clients cannot read programmes at all — they read sessions. Narrower surface, and it
>   keeps template work private. Asserted in the tests.
> - Verified: a 6-week block assigned from Mon 17 Aug generated Mon/Wed/Fri in week 1 and
>   the following Mon/Wed/Fri in week 2, exactly as designed.
>
> Still to do for CP2: surfacing the assigned sessions on the iOS calendar (the app still
> reads seed data for Today) and video upload on exercises.

> ### ✅ CP2 — A real 4-week rehab program, end to end
>
> You build a genuine 4-week program for a real client in the portal, assign it, and see
> the correct days appear on the correct dates in the iOS app with videos playing.

---

## Phase 3 — Workout logging & offline sync · ~2 weeks

This is the highest-usage screen in the product. It deserves the most care.

- Active-session UI: set-by-set entry, rest timer, previous-session values pre-filled, quick +/- steppers
- **Pain 0–10 capture** per set and per session (before/after) — your clinical differentiator
- Session RPE, duration, free-text client notes
- Local SQLite write-through + outbox queue; background sync with conflict resolution (last-write-wins per set row, server timestamps)
- Portal: session log view, per-exercise history, e1RM and volume-load charts, coach feedback comment

> ### ✅ CP3 — Airplane-mode test
>
> A full session logged with the phone in airplane mode syncs cleanly on reconnect, no
> duplicates and no lost sets. The portal shows the log and a strength-progression chart.
> Run this test on a real device, not the simulator.

---

## Phase 4 — Vitals & Apple Health · ~1 week

- `metrics` table + manual entry (weight, BP, waist, sleep, resting HR)
- HealthKit read permissions, background delivery, idempotent import keyed on HealthKit UUID
- Progress photos: capture, private storage, side-by-side comparison
- Portal: vitals dashboard, source badges (manual vs Apple Health vs coach), date-range zoom
- **Pain-vs-load overlay chart** and ACWR flag

> ### ✅ CP4 — Health data flows without duplication
>
> Weight logged in Apple Health appears in the portal within minutes. Re-running the sync
> creates zero duplicate rows. Manual and HealthKit values are visually distinguishable.

### Phase 4 progress — real sessions and Apple Health wired 2026-08-13

**Shipped**

- `metrics` table with `metric_type` / `metric_source` enums, plus the partial unique index
  `(client_id, type, external_id) where external_id is not null` — HealthKit imports
  deduplicate on the sample UUID, manual entries (no external id) never collide.
- `import_health_metrics(jsonb)` requires health consent, inserts `on conflict do nothing`,
  and returns the count of genuinely new rows so the UI reports what landed rather than
  what was offered.
- `get_session_plan(session_id)` — SECURITY DEFINER, returns items only to the client
  herself or her coach.
- iOS: Today, session logging, progress and `/health` all read live data. Finishing a
  session writes `status`, `completed_at` and both pain scores back through RLS.
- Portal: client deep dive (overview, training, vitals) runs on real rows; the roster links
  into it. Nutrition says plainly that it is Phase 5 rather than rendering mock macros.

**Verified end to end** — invite code accepted on the simulator, consent recorded, Today
showed the real Wednesday session (3 exercises, 9 sets, loads from the programme builder),
three sets logged, session saved, and both the app and the portal then reported 1 of 2 —
the same number from the same rule. 27 pgTAP assertions pass.

**Found and fixed while verifying**

- `requestAuthorization` takes **one** argument in `@kingstinct/react-native-healthkit` v14
  (`{ toRead }`), not `(share, read)`. The two-argument call threw at the native bridge, so
  the permission sheet never appeared. Units are now requested explicitly per identifier —
  HealthKit will answer body mass in pounds on a US-locale phone otherwise.
- `NSHealthUpdateUsageDescription` claimed Vela writes workouts back. It does not, and the
  app promises it does not — removed, so Apple's sheet no longer says "and update".
- `weekAdherence` treated "nothing resolved yet" as 100%, painting a full bar above
  "0 of 3". Adherence now counts only sessions that have already come due.
- Today did not refetch on focus, so a finished session still offered "Start session".
- The portal's `dateWindow` was anchored to the frozen mock date, ending every real chart
  two days in the past.
- The client deep-dive shell still looked clients up in the mock map, so every real client
  id 404'd — the vitals tab built for CP4 was unreachable.

**Not done** — progress photos, background delivery, and the pain-vs-load overlay (load
needs set-by-set logs from Phase 3). HealthKit itself cannot be fully proven on the
Simulator, which holds no samples; a real iPhone is needed to confirm import volume.

---

## Phase 5 — Nutrition · ~2 weeks

- Coach sets macro/calorie targets per client, with effective-from history
- iOS logging: barcode scan (Open Food Facts), text search, recent/favourites, custom foods, quantity by g/serving
- Daily rings vs. target; weekly macro adherence
- Portal: 7/30-day macro adherence, weight trend overlaid on calorie intake

> ### ✅ CP5 — A week of real food logging
>
> You (or a willing client) log 7 consecutive days including barcode scans, and the
> portal's adherence numbers match a hand calculation.

### Phase 5 progress — nutrition shipped 2026-08-13

**Shipped**

- `nutrition_targets`, versioned by `effective_from` and never edited in place, so lowering
  a target in March cannot rewrite February's adherence. `nutrition_target_on(client, day)`
  resolves the one in force.
- `foods` stored per 100 g, holding two kinds of row: Open Food Facts products cached by
  barcode (owned by nobody, readable by all) and the coach's own custom foods.
- `food_logs` copies the macros onto the row rather than joining `foods` — correcting a
  food next month must not silently change what a diary said last month.
- `nutrition_days(client, from, to)` computes daily totals against the target in force on
  each day, in the database, so the app and the portal cannot disagree. Unlogged days come
  back as zero-with-no-entries rather than being omitted.
- iOS: diary with macro bars against target, a week strip, and three ways in — barcode
  (camera or typed number), search across her coach's foods, and calories-only for the meal
  nobody is going to weigh. Quick entries leave the macros blank instead of inventing a split.
- Portal: target editor with history, 7- and 30-day adherence, energy-against-target with
  weight on a shared timeline, and today's meals labelled by how each was entered.
- `targetConcerns()` warns when a target falls below 1,600 kcal, or 2,000 while
  breastfeeding, and the editor checks the macro split against the stated energy before it
  will save. Neither is a clinical threshold; both exist because this population is the one
  most harmed by a number typed in haste.
- `scripts/seed-demo.mjs` (`npm run seed`) rebuilds the whole demo world through the real
  APIs as the real users, so a broken policy fails the seed. It also asserts that
  re-importing the same HealthKit payload inserts nothing.

**Verified end to end** — logged a coach food (120 g chicken → 251 kcal) and a scanned
product (Nutella by barcode → 108 kcal at 20 g) from the app; both appeared in the coach's
diary view labelled "Searched" and "Scanned". The portal's three adherence numbers were
checked by hand against the rows: 6 of 7 days logged, 1 of 6 within 10% of 2,450 kcal, mean
2,356 kcal. 38 pgTAP assertions pass. One day is deliberately left unlogged rather than
seeding a tidy seven, because "she logged nothing" is a finding the UI has to render.

**Found and fixed while verifying**

- The `foods` read policy matched only `coach_id = auth.uid()`, so every food a coach
  created was invisible to her client — the search box returned nothing and looked merely
  empty. Now covered by a paired positive/negative assertion.
- Magic-link sign-in on iOS was broken end to end: the app asks for a six-digit code but
  GoTrue's default template mails only a link, and `vela://auth-callback` had no route, so
  a tapped link ended on "Unmatched Route" with the code stranded in the URL. Added a
  magic-link template carrying `{{ .Token }}`, plus an `auth-callback` route that exchanges
  the PKCE code — and an exemption in the routing gate, which was redirecting the callback
  to sign-in before it could run.
- Logging from the scanner returned to a stale "Add food" screen, because the scanner
  replaces itself with that route and leaves the first one underneath.
- `expo-camera`'s config plugin declares `NSMicrophoneUsageDescription` by default. Vela
  never records video; an unexplained microphone prompt in a food diary is both an App
  Review finding and a fair reason to delete the app. Disabled, along with the leftover
  photo-library string for progress photos that do not exist yet.

**Not done** — recents and favourites, editing a logged entry's portion, and coach-side
custom food management in the portal UI (foods are seeded or created through the API).
Barcode scanning through the lens is unverifiable on the Simulator, which has no camera;
the typed-number path exercises the same lookup, cache and log.

---

## Phase 6 — Coach dashboard & intelligence · ~1.5 weeks

- Roster: every client as a card/row with adherence RAG status, last activity, weight delta, open alerts
- Alert rules: 2+ sessions missed, pain ≥ 6 reported, ACWR > 1.5, no log in 5 days, weight trend against goal
- Client deep-dive tabs: Overview · Training · Nutrition · Vitals · Assessments · Notes
- Nightly rollup Edge Function → `client_rollups`
- Physio assessments module: ROM/special-test/MMT forms, pain map, intake vs. review comparison

> ### ✅ CP6 — 30-second triage
>
> You open the portal in the morning and know within 30 seconds which clients need you
> today, and why. Roster loads in under 1 second with 50 clients seeded.

---

## Phase 7 — Messaging, check-ins & notifications · ~1.5 weeks

- 1:1 threads with Supabase Realtime, unread counts, image attachments
- Check-in form builder (portal) + scheduled weekly check-in (iOS) with photos
- Push: session reminder, check-in due, new message from coach; per-client quiet hours
- Notification preferences screen

> ### ✅ CP7 — A full coaching week runs on the app
>
> Program assigned → sessions reminded → logged → check-in submitted → you reply → client
> gets the push. No email or WhatsApp needed anywhere in that loop.

---

## Phase 8 — Hardening & TestFlight beta · ~2 weeks

- Accessibility (Dynamic Type, VoiceOver on logging flow), empty/loading/error states everywhere
- Performance: cold start < 2s, roster query budget, image/video optimisation
- Maestro E2E on the critical mobile paths; Playwright on the portal
- Load-test with seeded data (50 clients × 6 months of logs)
- App Store assets: icon, screenshots, description, privacy policy URL, Privacy Nutrition Labels, medical disclaimer
- **Submit for TestFlight external Beta App Review** (allow 24–48h)
- Onboard 5–10 real clients; weekly feedback triage; OTA fixes via EAS Update

> ### ✅ CP8 — Real clients, real data, stable
>
> 5–10 clients using it for 2 consecutive weeks. Crash-free sessions > 99.5%. Every P0
> from feedback closed. You have decided whether App Store public release follows.

---

## Timeline summary

| Phase                   | Effort | Cumulative     |
| ----------------------- | ------ | -------------- |
| 0 Foundations           | 1 wk   | 1              |
| 1 Identity & security   | 1.5 wk | 2.5            |
| 2 Library & builder     | 2 wk   | 4.5            |
| 3 Logging & offline     | 2 wk   | 6.5            |
| 4 Vitals & HealthKit    | 1 wk   | 7.5            |
| 5 Nutrition             | 2 wk   | 9.5            |
| 6 Dashboard             | 1.5 wk | 11             |
| 7 Messaging & check-ins | 1.5 wk | 12.5           |
| 8 Hardening & beta      | 2 wk   | **14.5 weeks** |

### The 6-week cut line

If you want something in real clients' hands fast, ship **Phases 0 → 4 plus a stripped
Phase 6** (roster + adherence only) as an internal TestFlight beta at ~week 8. Training and
vitals alone are already a usable coaching product. Nutrition (Phase 5) is the single
biggest phase and the easiest to defer — clients can stay on their existing food app while
you validate the training loop.

---

## Working agreement

- One phase per branch; each checkpoint is a demo, not a status update — if it can't be shown working on a device, the phase isn't done
- Every phase ends with a TestFlight build, so distribution never rots
- Migrations are always forward-only SQL in `supabase/migrations`, never console edits
- No client health data in dev/staging — seeded fake data only
- Re-read the checkpoint before starting a phase; move the cut line whenever reality demands it

## Locked decisions — 2026-08-10

| Decision                | Choice                               | Consequence                                                                                                                                         |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile stack            | **Expo / React Native + TypeScript** | Shared code with the portal, OTA updates. No Apple Watch app in v1 — revisit after beta.                                                            |
| v1 scope                | **Nutrition included**               | Full ~14.5-week plan. The 6-week cut line stays documented as a fallback if Phases 2–4 overrun.                                                     |
| Apple Developer Program | **Not yet enrolled**                 | Enrolment is task #1 of Phase 0 and gates CP0. See below.                                                                                           |
| Languages at beta       | **English only**                     | No i18n layer, but all user-facing copy lives in `packages/shared/strings` from day 1 so adding Italian later is a translation job, not a refactor. |

### Apple enrolment - done 2026-08-16

Enrolled, signed, built and submitted. Recorded here because this was the tracked blocker
from Phase 0 onward, and the details are worth having next time.

- Apple Developer Program active, Team ID `5YC55P5CQD`
- Bundle identifier is **`io.velas.app`**. `io.vela.app` was already taken on Apple's side;
  the custom URL scheme stays `vela`, so the auth deep links were unaffected
- App Store Connect app ID `6801958199`, SKU `vela-ios`
- First TestFlight build: **0.1.0 (4)**, production profile, submitted 2026-08-16

**What the first real build surfaced, all now fixed:**

- `uuid_generate_v4()` failed against hosted Postgres. Hosted Supabase installs extensions
  into the `extensions` schema, off a migration search path, so it resolved locally and
  died on deploy. Switched to `gen_random_uuid()`, core since Postgres 13
- `ITSAppUsesNonExemptEncryption` was missing, which puts a manual export-compliance
  toggle in front of every build. Declared false: Vela uses only standard TLS
- all three build profiles named an update channel with `expo-updates` not installed. Now
  configured, so a JS-only fix reaches testers via `eas update` without a rebuild
- a `_comment` key in `eas.json` broke every eas-cli command; that file is schema-validated
  and rejects unknown keys

**Interactive by necessity.** The first build signing certificate and the App Store Connect
API key both require an interactive Apple login, so those two commands are the operator to
run. Every build and submit after them can be non-interactive.

**~~Known limitation at first ship~~ — resolved.** Client invites were blocked because
Supabase refuses email template customisation on the free tier with the default provider,
and the invite flow depends on a six-digit token the stock template omits. Custom SMTP
through Resend is now configured (`auth.email.smtp` in `supabase/config.toml`, the API key
supplied by environment rather than committed), so the templates carrying `{{ .Token }}`
are accepted and invites reach real addresses.

---

## The dials read the body — 2026-09-04

Not a phase; a correction to two numbers that were being presented as measurements and were
not. Shipped as **0.2.0 (15)**.

**What was wrong**

- Apple Health synced only when somebody opened Settings and tapped a button. Today's two
  headline figures are computed from _today's_ rows, so on an ordinary morning the app
  opened to "—" and "Estimated · no sleep recorded last night" on a night that had synced
  perfectly. The screen looked broken and the fix was a settings screen nobody had a reason
  to visit.
- Strain counted prescribed sets, then active energy. Sets saw only what Vela had written
  down, so a Saturday run read as a rest day. Active energy is derived by Apple mostly from
  movement and body mass, so it reads a brisk walk and hill repeats as closer together than
  they are and barely registers strength work.
- Recovery gave "how you feel" three tenths of the weight and, with no watch, all of it —
  which is how the dial reported **82% · GOOD** off one tap and no measurement. Meanwhile
  `resting_hr` and `sleep_awake_min` had been imported on every sync since Phase 4 and were
  read by nothing.
- `in_progress`, `started_at` and `duration_sec` were in the enum, in the types and in
  Today's "Resume session" branch, and nothing ever wrote them.

**Shipped**

- Sync runs on cold start and on every foreground, throttled to thirty minutes, armed only
  once there is a consented client. Not Apple's background delivery — that is still worth
  doing, and is the only way an overnight backfill reaches the coach before she opens the app.
- **Strain** prefers cardiovascular load: minutes weighted by heart rate reserve, Banister's
  TRIMP with the female coefficients. Read through `queryStatisticsCollectionForQuantity` in
  five-minute buckets, because a month of raw heart rate is tens of thousands of samples;
  bucketed on the phone, because only the device knows the timezone the day was lived in.
- **Recovery** is measured, with the daily read reduced to a bounded ±10 buffer. Now reads
  resting heart rate, sleep efficiency and overnight respiratory rate alongside duration,
  restorative sleep and HRV. Where nothing at all was measured her own read still carries it,
  and `estimated` now means exactly that.
- Heart rate maximum comes from observation. `date_of_birth` exists in the schema and nothing
  in the product fills it, so Tanaka is wired and dormant for when intake asks.

**Findings worth keeping**

- **36 unit tests, and CI runs them.** These are pure functions deciding numbers a
  physiotherapist acts on, and they fail silently — a sign error still renders a tidy
  percentage. One test caught the author asserting heart rate reserve backwards.
- A five per cent reserve deadband keeps a night's sleep from accumulating into a training
  session. Without it eight hours a few beats above resting is not small over ninety-six
  five-minute buckets, and a genuine rest day never reads as rest.
- Three migrations were sitting unapplied on the **hosted** project — the sleep stages and
  active energy from 24 August, plus both from this change. A build shipped against that
  would have installed fine and failed every health import. `migration list --linked` before
  a release is now in RELEASE.md.
- The TRIMP coefficients and the deadband are calibrations, not clinical constants, and are
  commented as such. An observed maximum is unstable early — one hard week raises it and
  shrinks every reserve — which largely cancels because today is scored against her own peak
  on the same scale, but not perfectly.

**Not done** — per-set logs still do not exist, so volume load, e1RM, ACWR and the
pain-vs-load overlay remain unbuildable and "completed" still cannot say which sets she
actually did. The return-to-running screen is still local state that reaches nobody. No
offline outbox, no push, no error reporting.

---

## The dials hold still, and the charts change engine — 2026-09-05

Shipped as **0.2.1 (16)** — a refinement of the same screens rather than new ones.

**The maths.** An end-to-end review of recovery and strain found no runtime loops but
several self-referential scales, and two places Apple's data was being filed wrongly.
Seven corrections, in order of how far each moved the number:

- Ceilings by percentile, not maximum. One strap artifact at 210 bpm compressed every
  reserve for a month; the ceiling is now the second-highest five-minute average, the
  strain peak the 90th percentile of her days.
- HRV and breathing rate are filed to the wake morning like sleep. Averaging by timestamp
  had split every night at midnight. Resting heart rate falls back to yesterday until
  Apple writes today's — inferred from exported data, **not yet verified on a Watch**.
- The cardio ceiling comes from sixty days and the loads from thirty, so identical effort
  scores the same when a hard day ages out. Two definitions of resting heart rate became
  one.
- Five nights before a baseline means anything. A night with no wakes reads as settled,
  not unknown. A generation guard on the load; one fetch on pull-to-refresh, not two.
- Rounding once, a smooth deadband, the raised-resting-rate note in every band, and the
  signal count on screen.

**The charts.** BoardUI was asked for and evaluated on the facts: a Next.js design system
installed by copying source, charts on Recharts, two free charts (both revenue widgets),
every chart Vela needs behind a licence, and an `init` that lands a second design system.
The portal took the engine and the idiom on Vela's tokens behind the unchanged
`TimeSeriesPanels` contract; the app's SVG kit draws the same idiom with a transcribed
monotone curve. The series palette failed the validator in both modes — the failing pair
was the pain before/after chart — and was re-ordered until every hard gate passed.

**Findings worth keeping**

- The `initialDimension` prop is what makes a Recharts chart paint on the first frame,
  and the only thing that makes it paint at all in a document the browser is not
  displaying. Without it, verification in a hidden pane reports an empty chart that is
  perfectly healthy.
- `supabase start` now routes auth mail through Resend, and without `RESEND_API_KEY`
  exported every local sign-in and invite returns 500. The stack that worked earlier the
  same day had containers from before the SMTP block; a restart re-created them. The SMTP
  configuration probably belongs under a remote-only override rather than the shared
  `[auth]` block.
- eas-cli writes a stub `app.json` into whatever directory it is run from when no config
  is found there. Run it from `apps/mobile`.

**Not done** — per-set logs, the readiness screen's persistence, the outbox, push, and
error reporting, unchanged from the previous entry.

## 0.2.2 — a key for a tool, and Claude as the tool (5 September 2026)

The physiotherapist plans in Claude. Until now the way from there to Vela was a
spreadsheet, or a token minted by hand that lasts an hour. This entry is the proper
credential and the proper client.

**Personal API keys.** A coach mints a key in Settings, named for what will use it, shown
once. Only the hash is stored. On the way in the portal looks the hash up with the service
role, mints a session for the owning coach through the admin API — a magic-link token
generated and verified server-side, no mail — and from there the request is her session
and RLS does the rest. Revocation is checked on every call; the minted session is cached
per key for its lifetime. The service role turned out to need an explicit grant on the
new table: on this database it bypasses RLS but is not a superuser, and without the grant
every key was refused as "revoked".

**Read routes.** `/api/me`, `/api/exercises`, `/api/programs`, `/api/programs/{id}`, all
through the one `requireCoach` helper so the refusal reads the same everywhere.

**The MCP server.** `packages/mcp`: six tools over the portal API, the import schema
published field by field as the tool input, and instructions that make the assistant
read the library before drafting, preview before creating, and never assign. Bundled
with esbuild into one file and packed as a Claude Desktop extension (`vela.mcpb`) with
the key as a sensitive setting — double-click, paste, done. Tested in-process against a
scripted portal, then over stdio against the real local stack: unmatched name refused,
preview, create, read back.

**Findings worth keeping**

- A supabase-js query builder runs when awaited and not before. `void builder` is a
  no-op, and "last used" stayed empty until the write was awaited.
- Node's test runner resolves a package subpath to a `.ts` file but not the barrel's
  extensionless internal imports. The MCP package imports `@vela/shared/programImport`
  for that reason.
- `.describe()` on the shared Zod schema is now documentation an assistant reads. It
  is written for that reader.

**Not done** — a hosted MCP server for claude.ai in the browser (needs OAuth in front),
per-set logs, the readiness screen's persistence, the outbox, push, and error reporting.

## 0.2.2 fix — the verified-but-never-linked account (5 September 2026)

Reported as "I deleted my account and now it says one already exists". Deletion was
clean; the loop was in coming back. Only the invite screen called `accept_my_invite`.
The link in the invitation email and the sign-in screen's code both verify the address
and Supabase confirms the account either way — leaving a verified user whose client row
was never linked. The gate bounced her to sign-in, and the portal refused the coach a
re-invite because the account "already exists". Reproduced end to end on the local stack.

**The fix.** The app's session loader now calls `accept_my_invite` whenever it finds a
session and no client row, on every door — it only succeeds when a pending invitation
matches the verified email, so it is safe to call blind. The portal, on re-inviting a
verified account, now tells linked from stranded: a linked client is told to sign in; a
stranded one gets a sign-in code emailed instead of a refusal, and the coach is told so.
pgTAP asserts what the call does for exactly that state, and that a second call is a
no-op. 94 assertions.

**Finding worth keeping** — `accept_my_invite` copies name hints onto a blank profile and
`profiles.last_name` is NOT NULL, so a NULL `last_name_hint` fails the call. The portal
always sends `''`; a direct caller might not. Worth a `coalesce(…, '')` in the function.

## Roster as cards (5 September 2026)

The clients page was a table with everything compressed into a row. It is now a grid of
cards, one per client, in the idiom of a parameter dashboard: the name and standing, the
alerts that put her at the top, a month of symptoms after sessions as a small area
chart with a dot per recorded score, and four readings — adherence this week with its
band, pain after sessions on a 0–10 scale, weight change over the month, and resting
heart rate with HRV (or the latest morning read where there is no watch). "Needs
attention" stays above, sorted by severity. Invited clients who have not signed in sit
in their own short list rather than as cards with nothing in them.

The arithmetic moved out of the page into `rosterRollups` in the shared package, pure
and tested: four queries for the whole roster, one pass per client, and the alert that
ranks a client and the number on her card come from the same function. Node's test
runner does not guess extensions, so the module reaches `domain` through the package's
own export map — one spelling that Node, tsc and the bundlers all resolve.

**The client's own page** followed the roster the same day. The overview is now three
groups of readings — Training, Body, Daily habits — each a card with the value, a bar for
where it sits or how much of the target it covers, a caption in words, a card-sized trend
and a link into the tab that explains it. The before/after symptoms panel and the recent
sessions list stay; the "This week" column and the "Latest vitals" strip were absorbed.
The reading card lives in `components/readings.tsx` and the roster card uses the same one
at its compact size, so the two pages cannot drift.

## Training from outside the app (6 September 2026)

Two integrations that share an idea: training that happens away from the app still
belongs in the record, and the record says who wrote it (`sessions.logged_via`).

**Strava.** OAuth brokered by the portal, tokens in a table nothing signed-in can read,
imports run as the client through RLS with a minted session — the same mechanism as
personal API keys, now in `impersonate.ts`. An activity completes the planned session of
the same discipline on the same local day, or becomes a completed session of its own.
Cadence in steps per minute, power where the device has it. A card on Today, a table on
the coach's Training tab, a reading on the overview. Webhook for arrivals; _Sync now_
otherwise. Built and tested against a stand-in Strava; the real application still has to
be registered and its keys set in Vercel.

**Calendars.** One iCalendar feed per client, keyed by a token, with every session's
exercises in the notes and a link that marks the whole session done from a page that
needs no sign-in. Apple subscribes from `webcal://`; Google from its add-by-URL page.
The feed is hand-written (`ics.ts`, tested) because the format is small and the rules
that break clients are three: CRLF, folding at 75 octets, escaping.

**Findings worth keeping**

- This schema's default privileges hand every new table to `authenticated`. A table
  meant to be unreadable must be revoked explicitly; RLS with no policy only makes it
  look empty. The isolation test asserts the refusal.
- A new native module means a new dev-client build. The in-app browser sheet was dropped
  for the system browser and a deep link back, which the build already on phones can do.

**Not done** — Strava's official button asset, cardiovascular load from Strava heart
rate, device-calendar writes, and the earlier list.
