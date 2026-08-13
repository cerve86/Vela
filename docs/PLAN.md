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
> A push to `main` produces a build that lands in TestFlight and installs on your iPhone,
> and the portal is live at a URL. **Do not proceed until this works.** Everything after
> is easier; this is the part that surprises people.

### Phase 0 progress — 2026-08-10

| Item | State |
|---|---|
| Monorepo (npm workspaces), TypeScript, shared domain package | ✅ Done |
| Coach portal — roster, client deep-dive, chart kit | ✅ Running on seed data |
| iOS app — Today, session logging, progress, nutrition, profile | ✅ Written, builds locally |
| Supabase schema + default-deny RLS + pgTAP CP1 tests | ✅ Written, not yet applied |
| CI — typecheck, lint, build, RLS tests | ✅ Written |
| TestFlight pipeline | ⛔ Blocked on Apple enrolment |

**Environment findings on this Mac**

- `pnpm` needed root to install → switched to npm workspaces. Better for Expo regardless:
  Metro has long-standing friction with pnpm's symlinked `node_modules`.
- ~~Xcode had no iOS platform component installed~~ — **resolved**. Xcode 26.6 ships the
  iOS 26.5 SDK; until the matching platform was installed via Xcode → Settings →
  Components, `xcodebuild` offered *zero* iOS destinations (device or simulator), even
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
> Verified end to end on the local stack:
> coach signs in by magic link → invites Marta Rossi → real email arrives → deep link
> opens the iOS app → tapping it verifies her address (`email_confirmed_at` set) →
> invite redeemed → consent captured → she lands in the app, and the coach's roster
> shows her as Active. 14 pgTAP assertions green.
>
> **Findings worth keeping:**
> - RLS filters rows; GRANTs decide table access. Missing grants made every query
>   return zero rows — which reads exactly like working isolation, and would have made
>   a negative-only test suite pass for the wrong reason. Every negative assertion is
>   now paired with a positive control.
> - `inviteUserByEmail` renders from the auth user's *stored* metadata, so a re-invite
>   mailed the previous (just-revoked) token. Metadata is now overwritten first.
> - A magic link started in the coach's browser cannot complete a PKCE exchange on the
>   client's phone. The invite email carries GoTrue's `token_hash` instead, and
>   returning clients sign in with a 6-digit OTP.
>
> **Closed out 2026-08-10.** Invitation now uses a six-digit code rather than a deep
> link, which removed the token-in-metadata failure mode entirely — there is no secret
> in the email to go stale. Acceptance is keyed on the caller's *verified* email, which
> is the only thing the old token ever proved.
>
> Account deletion and data export are wired and verified on device: export writes a
> JSON file and opens the iOS share sheet; deletion erases the auth user, client row
> and consents, leaving an audit row that deliberately carries no subject identifier.
>
> Two further findings:
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
>
> Library is live on real data: 16 shipped exercises across pelvic floor, strength,
> impact, running and mobility, plus coach-owned custom exercises. Filter by category,
> search across name/muscle group/equipment, "mine only" toggle.
>
> Design decisions worth keeping:
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
> - Re-assigning cancels the live assignment and clears only *future* scheduled sessions.
>   Completed and past sessions stay.
> - Clients cannot read programmes at all — they read sessions. Narrower surface, and it
>   keeps template work private. Asserted in the tests.
> - Verified: a 6-week block assigned from Mon 17 Aug generated Mon/Wed/Fri in week 1 and
>   the following Mon/Wed/Fri in week 2, exactly as designed.
>
> Still to do for CP2: surfacing the assigned sessions on the iOS calendar (the app still
> reads seed data for Today) and video upload on exercises.

> ### ✅ CP2 — A real 4-week rehab program, end to end
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
> You (or a willing client) log 7 consecutive days including barcode scans, and the
> portal's adherence numbers match a hand calculation.

---

## Phase 6 — Coach dashboard & intelligence · ~1.5 weeks

- Roster: every client as a card/row with adherence RAG status, last activity, weight delta, open alerts
- Alert rules: 2+ sessions missed, pain ≥ 6 reported, ACWR > 1.5, no log in 5 days, weight trend against goal
- Client deep-dive tabs: Overview · Training · Nutrition · Vitals · Assessments · Notes
- Nightly rollup Edge Function → `client_rollups`
- Physio assessments module: ROM/special-test/MMT forms, pain map, intake vs. review comparison

> ### ✅ CP6 — 30-second triage
> You open the portal in the morning and know within 30 seconds which clients need you
> today, and why. Roster loads in under 1 second with 50 clients seeded.

---

## Phase 7 — Messaging, check-ins & notifications · ~1.5 weeks

- 1:1 threads with Supabase Realtime, unread counts, image attachments
- Check-in form builder (portal) + scheduled weekly check-in (iOS) with photos
- Push: session reminder, check-in due, new message from coach; per-client quiet hours
- Notification preferences screen

> ### ✅ CP7 — A full coaching week runs on the app
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
> 5–10 clients using it for 2 consecutive weeks. Crash-free sessions > 99.5%. Every P0
> from feedback closed. You have decided whether App Store public release follows.

---

## Timeline summary

| Phase | Effort | Cumulative |
|---|---|---|
| 0 Foundations | 1 wk | 1 |
| 1 Identity & security | 1.5 wk | 2.5 |
| 2 Library & builder | 2 wk | 4.5 |
| 3 Logging & offline | 2 wk | 6.5 |
| 4 Vitals & HealthKit | 1 wk | 7.5 |
| 5 Nutrition | 2 wk | 9.5 |
| 6 Dashboard | 1.5 wk | 11 |
| 7 Messaging & check-ins | 1.5 wk | 12.5 |
| 8 Hardening & beta | 2 wk | **14.5 weeks** |

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

| Decision | Choice | Consequence |
|---|---|---|
| Mobile stack | **Expo / React Native + TypeScript** | Shared code with the portal, OTA updates. No Apple Watch app in v1 — revisit after beta. |
| v1 scope | **Nutrition included** | Full ~14.5-week plan. The 6-week cut line stays documented as a fallback if Phases 2–4 overrun. |
| Apple Developer Program | **Not yet enrolled** | Enrolment is task #1 of Phase 0 and gates CP0. See below. |
| Languages at beta | **English only** | No i18n layer, but all user-facing copy lives in `packages/shared/strings` from day 1 so adding Italian later is a translation job, not a refactor. |

### Apple enrolment — do this before anything else

Enrolment can take anywhere from a few hours to over a week. Start it, then build Phase 0
around it; everything except the TestFlight upload can proceed in parallel.

1. Decide **Individual** (fastest — personal ID, app lists under your own name) vs. **Organization** (needs a legal entity and a D-U-N-S number, which alone can take 5+ business days; app lists under your business name). For a solo physio practice, Individual is usually right unless you want the practice name on the App Store listing.
2. Enrol at `developer.apple.com/programs` with the Apple ID you intend to keep long-term — €99/yr, two-factor authentication required.
3. Once approved: create the App ID and bundle identifier, then the App Store Connect app record.
4. Add the HealthKit capability to the App ID at creation time.

Steps 2–4 involve your personal identity and payment details, so they're yours to do — I
can't and shouldn't complete them for you. Tell me when the account is live and I'll wire
up the signing and EAS submission.
