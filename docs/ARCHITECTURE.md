# CoachApp — Architecture

> Physiotherapy coaching platform: iOS client app (TestFlight) + coach web portal.
> Everfit-inspired, but narrowed to what a solo physio-coach actually needs, with
> rehab-specific concepts (pain, ROM, load tolerance) that generic fitness apps lack.

---

## 1. Product shape

Two surfaces, one backend, one shared domain model.

| Surface | Who | Purpose |
|---|---|---|
| **iOS app** (client) | Your clients | Do today's session, log sets/reps/load/pain, log food, sync Apple Health, weekly check-in, message you |
| **Web portal** (coach) | You | Roster at a glance, per-client deep dive, program builder, exercise library, nutrition targets, review + message |

There is deliberately **no coach mobile app** in v1 and **no client web app** in v1. Both are
additive later; neither is needed to prove the product.

### Feature parity map vs Everfit

| Everfit capability | v1 | v2 | Notes |
|---|:--:|:--:|---|
| Workout builder (weeks/days/blocks) | ✅ | | Core |
| Exercise library w/ video | ✅ | | Your own videos + a seed library |
| Client logging (sets, reps, load, RPE) | ✅ | | Plus **pain score** — physio addition |
| Body metrics & progress photos | ✅ | | |
| Wearable / Apple Health sync | ✅ | | HealthKit read-only |
| Nutrition macro targets + food logging | ✅ | | Barcode + search via Open Food Facts |
| Coach dashboard w/ adherence & alerts | ✅ | | |
| 1:1 messaging | ✅ | | Text first; voice notes v2 |
| Check-in forms / questionnaires | ✅ | | Physio intake, weekly subjective |
| **Rehab assessments (ROM, special tests, pain map)** | ✅ | | Not in Everfit — your differentiator |
| Habit tracking | | ✅ | |
| Automation / autoflow program delivery | | ✅ | |
| Group programs, challenges, leaderboards | | ✅ | Irrelevant for 1:1 physio |
| Payments / subscriptions | | ✅ | Stripe when you charge in-app |
| Meal plans & recipes, AI meal scan | | ✅ | |
| White-label / multi-coach teams | | ✅ | Schema is multi-tenant from day 1 anyway |

---

## 2. Technology decisions

### 2.1 Stack — locked 2026-08-10

```
apps/mobile   Expo SDK 57 (React Native 0.86) + TypeScript  → EAS Build → TestFlight
apps/web      Next.js 16 App Router + React 19 + Tailwind v4
packages/*    Shared TS types, Zod schemas, domain calculations, design tokens
supabase/     Postgres + Auth + RLS + Storage + Realtime + Edge Functions (EU region)
```

**Why Expo over native SwiftUI.** You are one person shipping two surfaces. Expo gives you
one TypeScript codebase shared with the web portal (types, validation, business rules like
e1RM and macro maths written once), a mature TestFlight pipeline via EAS, and **over-the-air
updates** — you can push a fix to your beta testers in 2 minutes without a new App Review.
HealthKit is fully accessible from Expo via a native module in a custom dev client. The
tradeoff you accept: no Apple Watch app in v1, and slightly less polished native feel.

Choose **native SwiftUI instead** only if a Watch companion app (live workout logging from the
wrist) is a must-have on day one. That decision roughly doubles v1 effort and kills code
sharing with the portal.

**Why Supabase over a custom backend.** Health data demands strict per-client isolation.
Postgres **Row Level Security** lets you enforce "a client can only ever read their own rows,
a coach only rows of clients linked to them" *in the database*, so a bug in the app cannot
leak another person's data. You also get auth, file storage, realtime (messaging), cron and
serverless functions in one EU-hosted box. A hand-rolled NestJS backend is more control and
roughly 3–4 extra weeks you don't need to spend yet.

### 2.2 Component choices

| Concern | Choice | Notes |
|---|---|---|
| Monorepo | **npm workspaces** | Chosen over pnpm: Metro (React Native's bundler) has long-standing friction with pnpm's symlinked `node_modules`, and npm's hoisted layout is the safer foundation for an Expo monorepo. Also avoids a sudo install. |
| Mobile state | TanStack Query + Zustand | Query = server cache, Zustand = active-workout UI state |
| Offline | SQLite (`expo-sqlite`) + outbox queue | **Non-negotiable** — gyms and clinics have bad signal |
| Web data | TanStack Query + Supabase JS | Server Components for the shell, client components for charts |
| Charts | Recharts (web), Victory Native XL (mobile) | |
| Forms/validation | React Hook Form + Zod, schemas in `packages/shared` | One schema validates client, server and DB constraint |
| Health data | HealthKit read-only via `@kingstinct/react-native-healthkit` | Background delivery for weight/HR/sleep/steps |
| Food database | Open Food Facts (free, EU, barcode) | Swap to FatSecret/Nutritionix if coverage disappoints |
| Media | Supabase Storage, signed URLs, private buckets | Exercise video + progress photos |
| Push | Expo Notifications → APNs | |
| Errors / analytics | Sentry + PostHog (EU cloud) | |
| CI/CD | GitHub Actions → EAS Build → TestFlight; Vercel for web | |

### 2.3 Repository layout

```
CoachApp/
├─ apps/
│  ├─ mobile/            Expo app (client)
│  │  ├─ app/            expo-router: (auth) (tabs) workout/ nutrition/ checkin/
│  │  ├─ src/features/   workout/ nutrition/ vitals/ messaging/
│  │  └─ src/db/         SQLite schema + sync outbox
│  └─ web/               Next.js portal (coach)
│     ├─ app/(dash)/clients/[id]/  overview | training | nutrition | vitals | notes
│     └─ app/(dash)/library, /programs, /messages
├─ packages/
│  ├─ shared/            Zod schemas, TS types, enums, units
│  ├─ domain/            e1RM, volume load, ACWR, macro rollups, adherence scoring
│  └─ api/               Typed Supabase client + query hooks
├─ supabase/
│  ├─ migrations/        SQL, version-controlled
│  ├─ functions/         edge functions (rollups, notifications, export/delete)
│  └─ tests/             pgTAP RLS tests
└─ docs/                 this folder
```

---

## 3. Data model

Core principles:
1. **Multi-tenant from day one** — every row carries `coach_id`; you may add an associate later, and retrofitting tenancy is painful.
2. **Prescription vs. performance are separate tables.** What you programmed never mutates when the client logs what they actually did. This is what makes progress analysis honest.
3. **One tall `metrics` table**, not a column per vital. Adding "grip strength" or "HRV" later must not be a migration.
4. **Append-only logs.** Corrections are new rows, never destructive edits — you need defensible history for clinical notes.

### 3.1 Entities

**Identity & tenancy**
- `profiles` — extends `auth.users`; `role ∈ {coach, client}`, name, avatar, locale, timezone
- `coaches` — profile_id, business name, branding
- `clients` — profile_id, `coach_id`, dob, sex, height_cm, goals, status ∈ {invited, active, paused, archived}
- `client_invites` — token, email, expires_at

**Exercise library & programming**
- `exercises` — name, description, cues, `muscle_groups[]`, equipment, `video_path`, `is_public`, `coach_id` (null = seed library)
- `programs` — coach_id, name, description, duration_weeks, is_template
- `program_days` — program_id, week_no, day_no, title, notes
- `program_items` — program_day_id, exercise_id, order, `block` (superset grouping), prescribed: sets, reps (range), load (%1RM / kg / RPE-target), tempo, rest_sec, notes
- `assignments` — client_id, program_id, start_date, status
- `sessions` — assignment_id, client_id, `scheduled_date`, status ∈ {scheduled, in_progress, completed, skipped}, started_at, completed_at, duration_sec, `session_rpe`, `pain_before`, `pain_after`, client_notes, coach_feedback

**Performance**
- `set_logs` — session_id, program_item_id (nullable — ad-hoc work), exercise_id, set_index, reps, weight_kg, rpe, `pain_0_10`, completed, logged_at

**Vitals & body**
- `metrics` — client_id, `recorded_at`, `type` (weight_kg, body_fat_pct, waist_cm, resting_hr, hrv_ms, bp_systolic, bp_diastolic, spo2, sleep_min, steps, vo2max, …), `value numeric`, `unit`, `source ∈ {manual, healthkit, coach}`, `external_id` (HealthKit UUID, for idempotent sync)
  - Unique index on `(client_id, type, external_id)` — makes re-sync safe.
- `progress_photos` — client_id, taken_on, pose ∈ {front, side, back}, storage_path

**Nutrition**
- `nutrition_targets` — client_id, effective_from, kcal, protein_g, carbs_g, fat_g, fiber_g, notes
- `food_items` — barcode, name, brand, per-100g macros, source ∈ {off, custom}
- `nutrition_logs` — client_id, logged_on, meal ∈ {breakfast, lunch, dinner, snack}, food_item_id, quantity_g, cached macros
- `v_nutrition_daily` — view rolling logs to daily totals vs. target

**Clinical / physio**
- `assessments` — client_id, performed_on, type ∈ {intake, review, discharge}, `findings jsonb` (ROM per joint, special tests, MMT grades), `pain_map jsonb`, summary
- `checkin_forms` — coach_id, name, `schema jsonb` (question builder)
- `checkins` — client_id, form_id, period_start, `answers jsonb`, submitted_at

**Communication & ops**
- `threads`, `messages` (thread_id, sender_id, body, attachment_path, read_at)
- `notifications`, `push_tokens`
- `consents` — client_id, policy_version, `type ∈ {tos, privacy, health_data_processing}`, granted_at, revoked_at
- `audit_log` — actor_id, action, entity, entity_id, at — **every coach read of client health data**

### 3.2 Access control

Two RLS predicates cover almost everything:

```sql
-- client: own rows only
create policy client_own on set_logs for select
  using (exists (select 1 from clients c
                 where c.id = set_logs.client_id and c.profile_id = auth.uid()));

-- coach: rows of clients linked to them
create policy coach_of_client on set_logs for select
  using (exists (select 1 from clients c
                 where c.id = set_logs.client_id and c.coach_id = auth.uid()));
```

RLS is enabled on **every** table, default-deny. Storage buckets are private with
path-prefix policies (`clients/{client_id}/…`). This is verified by pgTAP tests in CI that
assert a second client and a second coach both get zero rows — see checkpoint CP1.

### 3.3 Derived analytics (in `packages/domain`, computed server-side nightly)

- **Estimated 1RM** (Epley) per exercise → strength progression curve
- **Volume load** (Σ reps × kg) per session / week / muscle group
- **Adherence** = completed sessions ÷ scheduled, 7d & 28d
- **Acute:Chronic Workload Ratio** (7d ÷ 28d rolling volume) — flags reinjury risk when >1.5
- **Pain trend** vs. load — the chart that justifies the whole app for a physio
- **Macro adherence** = days within ±10% of target ÷ days logged

Nightly Edge Function writes to `client_rollups` so the roster page is a single fast query
rather than 40 aggregations.

---

## 4. Compliance & App Store — read before writing code

Health data is **GDPR Article 9 special-category data**. This is not optional polish; it
shapes the schema and the first screens.

**GDPR**
- Explicit, versioned consent for processing health data (`consents` table), captured at onboarding, revocable.
- EU region (Supabase Frankfurt), signed DPA with Supabase and any subprocessor.
- Right of access & portability → one-click JSON+CSV export per client.
- Right to erasure → hard-delete Edge Function, cascading, with an audit record.
- Retention policy (physio records in many EU states must be kept years — decide and document; erasure and retention obligations must be reconciled explicitly).
- Breach process and an access audit trail.

**Apple**
- Apple Developer Program enrollment (€99/yr) — **do this first, it can take days**.
- HealthKit: precise `NSHealthShareUsageDescription`, read-only, never used for advertising, never shared with third parties. Health data must not be written to iCloud backups per Apple's HealthKit rules.
- Guideline 1.4.1 — medical disclaimer: this is a coaching aid, not a medical device, not diagnosis. Put it in onboarding and the App Store description.
- Guideline 5.1.1(v) — **in-app account deletion is mandatory**, no exceptions.
- Privacy Policy URL and Privacy Nutrition Labels declaring health & fitness data collection.
- Sign in with Apple required if you offer any other third-party login.
- TestFlight: internal testers (up to 100, no review) work immediately; **external testers (up to 10,000) need a Beta App Review** — usually 24–48h, so factor it in.

**Medical device line.** Recording, displaying and trending data is fine. The moment the app
*interprets* data into a diagnosis or auto-prescribes treatment, you risk MDR classification
in the EU. Keep the app descriptive; you supply the clinical judgement.

---

## 5. Running costs (v1)

| Item | Cost |
|---|---|
| Apple Developer Program | €99 / yr |
| Supabase Pro (EU, daily backups, needed for real client data) | $25 / mo |
| Vercel (portal) | $0–20 / mo |
| Expo EAS (build + OTA) | $0–19 / mo (local Xcode builds are free — Xcode 26.6 is installed) |
| Sentry / PostHog | free tiers |
| **Total** | **≈ €35–70 / mo + €99/yr** |
