# Vela Companion

The athletes' web companion: a mobile-first, installable PWA in plain HTML/CSS/JS. Seven
tabs — Today, Profile, Fuel, Strength, Routes, Progress, Learn. Its design notes, spec and
roadmap are in [`docs/`](docs/); start with [`docs/HANDOFF.md`](docs/HANDOFF.md).

This folder is the source. The portal (`apps/web`) hosts it at
**`https://www.vela-coaching.com/companion`**: `apps/web/scripts/copy-companion.mjs` copies
the site into `apps/web/public/companion` before `dev` and `build` (docs and `.md` files are
left out). Edit here, never in `public/companion` — that copy is gitignored and overwritten.

## How it sits on Vela

The handoff's open decision (§3) is settled: **it uses the existing Vela Supabase project**,
additively.

- **One account.** An athlete is a Vela client and signs in with the email she uses in the
  Vela app. The sign-in email carries a six-digit code (Vela's own template); the companion
  asks for it, which also works when it is installed on the home screen, where a tapped
  link would open the browser instead. Unknown emails are refused, never signed up.
- **Its own tables, Vela's access rules.** `supabase/migrations/20261101000000_companion.sql`
  adds `companion_profiles` (intervals.icu id, weight), `companion_readiness` (the morning
  taps), `companion_movement_profiles` (the radar), `companion_routes` and
  `companion_resources` (the coach's lists). Every row keys on `clients.id` or
  `coaches.id` and uses `is_the_client` / `is_coach_of`, like the rest of the schema. No
  existing table or policy changed. `fuel_days` was not carried over: Fuel stays on the
  device, as the handoff describes.
- **Reads what Vela already holds instead of copying it.**
  - Strength = the movements the coach marked for her in the library (priority → Focus,
    the rest → Race-ready), via `companion_my_strength()`; ungated only.
  - Progress and Today's HRV read intervals.icu first, through
    `apps/web/src/app/api/companion/intervals/route.ts`, and fall back to her Strava runs,
    Apple Health HRV / resting HR and her programme's sessions in Vela.
- **Config is served, not filled in.** `js/config.js` comes from the portal
  (`apps/web/src/app/companion/js/config.js/route.ts`) with the portal's own Supabase URL
  and anon key.

## Coach content

Until there are portal screens for it, the coach's content goes in through the Supabase
table editor:

| What | Table | Notes |
|------|-------|-------|
| Movement radar | `companion_movement_profiles` | `scores` keys: `Foot & ankle`, `Lateral hip`, `Rotation / diagonal`, `Posterior chain`, `Trunk / pelvic floor`, `Upper body` (0–5); `focus` is the line under it |
| Routes | `companion_routes` | `coach_id` = the coach's user id; links must be `https://` |
| Learn tiles | `companion_resources` | same; `audience` is `client` or `public` |
| intervals.icu | `companion_profiles.intervals_icu_id` | once she has accepted the coaching request |

To use intervals.icu, set `INTERVALS_API_KEY` (the coach's key) in the Vercel project.
Until then everything runs on Vela's data.

## Running it locally

`npm run dev:web` from the repo root, then open http://localhost:4310/companion.
