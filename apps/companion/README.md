# Vela Companion

The athletes' web companion: a mobile-first, installable PWA in plain HTML/CSS/JS. Four
tabs — **Today** (today's session, the check-in, the week), **Fuel**, **Strength** (her
movement profile, filming guide and exercises) and **Library** (Routes, Learn, Progress) —
plus the energy and nutrition check (`nutrition.html`). Its design notes, spec and roadmap
are in [`docs/`](docs/); start with [`docs/HANDOFF.md`](docs/HANDOFF.md).

This folder is the source. The portal (`apps/web`) hosts it at
**`https://www.vela-coaching.com/companion`**: `apps/web/scripts/copy-companion.mjs` copies
the site into `apps/web/public/companion` before `dev` and `build` (docs and `.md` files are
left out). Edit here, never in `public/companion` — that copy is gitignored and overwritten.

## How it sits on Vela

The handoff's open decision (§3) is settled: **it uses the existing Vela Supabase project**,
additively.

- **One account.** An athlete is a Vela client and signs in as she does in the Vela app:
  email and password. "Email me a code instead" sends a six-digit code (Vela's own
  template), which also works when the companion is installed on the home screen, where a
  tapped link would open the browser instead. "Forgot password?" emails a reset link back to
  `/companion`, where she chooses a new password. Unknown emails are refused, never signed up.
- **Its own tables, Vela's access rules.** `supabase/migrations/20261101000000_companion.sql`
  adds `companion_profiles` (intervals.icu id, weight), `companion_readiness` (the morning
  taps), `companion_movement_profiles` (the radar), `companion_routes` and
  `companion_resources` (the coach's lists). `20261102000000_companion_ux.sql` adds the
  race (`companion_profiles.race_name`, `race_date`), the verdict she was shown
  (`companion_readiness.verdict`) and `companion_nutrition_shares` (the three results she
  chose to share, never her answers). `20261103000000_companion_round2.sql` adds the
  coach's WhatsApp link (`profiles.whatsapp_url`, coaches only, checked against the three
  WhatsApp link shapes) and `companion_session_movements(uuid[])` (the movements in her
  sessions with the library card; same ownership rule as `get_session_plans`, gated
  movements she isn't cleared for left out). Every row keys on `clients.id` or `coaches.id` and
  uses `is_the_client` / `is_coach_of`, like the rest of the schema. No existing table or
  policy changed.
- **Writes into Vela where Vela already has the place for it.** A check-in also files the
  Vela app's daily read (`daily_reads`), "I'll rest today" asks her coach to move the session
  through `request_session_move` (with Take it back).
- **WhatsApp is the channel; the companion writes no messages.** Contact buttons ("WhatsApp
  <coach>", the filming guide's "Send on WhatsApp", the look-back's prefilled summary) open
  the coach's link, `coachWhatsApp()` / `whatsAppHref(text)` in `core.js`; with no link set
  there is no contact button. Per-run feedback lives in intervals.icu activity comments.
  The companion has no upload. `fuel_days` was not carried over: Fuel stays on the device, as
  the handoff describes.
- **Reads what Vela already holds instead of copying it.**
  - Strength = the movements the coach marked for her in the library (priority → Focus,
    the rest → Race-ready), via `companion_my_strength()`; ungated only.
  - Today's movements = `companion_session_movements()` for today's prescribed sessions,
    matched to `assets/exercises/exercises.json` by `exMatch()` (tolerant of qualifiers
    like "(heavy)", never across a variant such as jumps or single leg), which Strength
    uses too.
  - "Last session felt" is prefilled from the effort she logged after her last session
    (`lastSessionEffort()`: intervals.icu `icu_rpe` from her watch, else Vela's
    `sessions.session_rpe`); her tap overrides it. Progress's Training load chart is
    effort × minutes by week (`sessionLoads()`), shown once 3 sessions carry an effort.
  - Fuel turns a rest or easy day before a long or KEY session into a top-up day
    (`fuelTopUp()` in `fuel.js`, reading tomorrow from Vela, else intervals.icu events with
    `ahead`).
  - Progress and Today's HRV read intervals.icu first, through
    `apps/web/src/app/api/companion/intervals/route.ts`, and fall back to her Strava runs,
    Apple Health HRV / resting HR and her programme's sessions in Vela.
- **Config is served, not filled in.** `js/config.js` comes from the portal
  (`apps/web/src/app/companion/js/config.js/route.ts`) with the portal's own Supabase URL
  and anon key.

## How the code is laid out

No build step and no framework: scripts load in order with `<script>` tags and their
functions are globals.

- `index.html` is only the shell: header and account menu, sign-in (`js/signin.js`), the
  "not an athlete" and "couldn't reach Vela" screens, one empty `<section>` per tab
  (`#today`, `#fuel`, `#strength`, `#library`) and the tab bar.
- Load order: supabase-js → `js/config.js` → `js/supabaseClient.js` → `js/core.js` →
  `js/hrv-guidance.js` → `js/data.js` and `js/data-*.js` → `js/auth.js` → the four tab files → `js/signin.js`; the
  shell boots on `DOMContentLoaded`. A top-level `const` with the same name in two files
  stops the later file, so module-private names carry a prefix (`_fuel…`, `TD_…`, `lib…`).
- `js/hrv-guidance.js` is GENERATED: the Vela app's HRV decision tree
  (`packages/shared/src/hrvGuidance.ts`), transpiled by `apps/web/scripts/copy-companion.mjs`
  on every dev and build run. Change the source, never this file; Today and Progress read
  it through `hrvRead()`, so the companion, the app and the portal agree.
- `js/core.js` holds the shared helpers and the shell: `esc`, local-date helpers, who she
  is (`firstName()`, `coachName()`, `coachWhatsApp()`, `showCalories()`), the exercise
  library (`exerciseLibrary()`, `exMatch()`), `STRAVA_RUN_MAPS`, `hrvRead()` (her HRV week
  through the tree, read again without its most unusual morning), `cached()` for offline copies,
  `loadInto()` for loading / empty / error states, `segmented()` (the one pick-one
  control), `announce()`, the "today changed" hook and the hash router (`#today`,
  `#library-routes`, …), so the phone's back gesture moves between tabs.
- Each tab renders itself: `js/today.js`, `fuel.js`, `strength.js`, `library.js` export
  `initToday(el)` etc., with their styles in `css/today.css`, `fuel.css`, … .
- `nutrition.html` is its own page (`js/nutrition.js`, `css/nutrition.css`). It loads
  `core.js`, `data.js` and `auth.js` like the shell, but core.js doesn't boot there. Her
  answers stay on the phone (`vela-nutrition-v2`); Fuel and Today read that key for "Last
  done". The only write is `shareNutritionResults()`, when she taps Share.
- Every Supabase call is a named async function in `js/data.js` (shared reads) or
  `js/data-<tab>.js`, and throws when Vela can't be reached, so "couldn't load" and "there
  is nothing" never look the same. `styles.css` is the design system: type scale, spacing,
  three buttons, three cards, `.seg`, readiness colours.
- `service-worker.js` keeps the shell working offline (bump `CACHE` and add the file to
  `SHELL` whenever a page, stylesheet or script is added); her data's offline copy is
  `cached()` in localStorage, per user. Sign-out clears every `vela-` and `rb-` key on the
  phone (the check-in, Fuel's taps, the nutrition check), so name new per-person keys that way.
- Calories and amounts follow her coach's switches in Vela: no kcal unless
  `clients.calorie_tracking` is on, and no amounts at all, grams included, when
  `clients.restrictive_pattern` is set (`showCalories()`, `showAmounts()`).

## Voice

The app speaks as Vela and names the coach by her first name (`coachName()`, "your coach"
until it is known). "I" appears only in text the coach writes herself (routes, Learn
tiles, focus notes). Never promise something the app doesn't do: no "your coach confirms",
"we'll move it" or "stays between you and your coach" unless a real button or screen is
behind it. Plain, warm and short, British spelling, no jargon ("second half of your
cycle", not "luteal"; "side hips", not "lateral hip"). The greeting keeps one Italian
touch as a signature: "Buongiorno, Marta", marked `lang="it"`.

## Coach content

The race and what she shares are on the athlete's page in the portal (`/clients/<id>`, the
Companion card): the coach sets the race name and date there, and sees the companion
check-ins (her four answers and the verdict she was shown) and any nutrition check she
shared. A shared energy flag also shows on the clients list for four weeks. The rest still
goes in through the Supabase table editor:

| What | Table | Notes |
|------|-------|-------|
| Race | `companion_profiles.race_name`, `race_date` | set in the portal; drives the countdown on Today and Progress, and the 21.1 km line for a half |
| Movement profile | `companion_movement_profiles` | `scores` (0–5) for feet and ankles, side hips, twisting, glutes and back of the legs, core and pelvic floor, upper body. Keys are matched by their words, so `Foot & ankle`, `Lateral hip`, `Side hips`, `Trunk / pelvic floor` and `Trunk & pelvic floor` all work; `focus` is the line above the bars |
| WhatsApp link | `profiles.whatsapp_url` (the coach's own row) | set in portal Settings → WhatsApp: a wa.me link, a group invite or her number; empty clears it and the companion shows no contact button |
| Routes | `companion_routes` | `coach_id` = the coach's user id; links must be `https://`. A route with neither `map_url` nor `strava_url` links to Strava's run-map explorer, and the section always offers it |
| Learn tiles | `companion_resources` | same; `audience` is `client` or `public` |
| intervals.icu | `companion_profiles.intervals_icu_id` | once she has accepted the coaching request |

To use intervals.icu, set `INTERVALS_API_KEY` (the coach's key) in the Vercel project.
Until then everything runs on Vela's data.

## Running it locally

`npm run dev:web` from the repo root, then open http://localhost:4310/companion.
