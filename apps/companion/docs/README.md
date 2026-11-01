# Training Companion — starter project

A mobile-first, installable PWA: the client companion for your coaching.
~6 athletes open it on their phones. Each sees **only her own** data.

Built to pair with your two design pages (`movement_profiles.html`,
`nutrition_screen.html`) — this repo is the shell + backend + privacy layer
they slot into.

---

## What's here

```
index.html                 app shell: login + Today / Profile / Fuel / Strength
styles.css                 shared palette (your blue/green), light + dark
manifest.webmanifest       makes it installable on phones
service-worker.js          offline shell (live data always hits the network)
js/config.example.js       copy to js/config.js, add your Supabase keys
js/supabaseClient.js       creates the Supabase client
js/auth.js                 passwordless email magic-link sign-in
js/data.js                 per-athlete reads (RLS scopes them automatically)
supabase/schema.sql        tables + Row-Level Security policies
assets/exercises/          placeholder SVG cue-cards + exercises.json map
```

---

## Go live in 5 steps (no coding needed to stand it up)

1. **Create a Supabase project** (free) → supabase.com. Open **SQL Editor**,
   paste `supabase/schema.sql`, Run. This builds the tables + privacy rules.
2. **Turn on email auth**: Supabase → Authentication → Providers → Email →
   enable "magic link". Add your deployed URL under Authentication → URL config.
3. **Add your keys**: copy `js/config.example.js` to `js/config.js`, paste your
   Project URL + anon public key (Settings → API). (The anon key is safe in the
   browser — the privacy rules below protect the data, not the key.)
4. **Deploy**: push this folder to a GitHub repo, import it in **Vercel** or
   **Netlify** (free). It's a static site — no build step. You get an HTTPS URL.
5. **Add athletes + seed data**: in Supabase → Authentication, invite each
   athlete's email; add a matching row in `athletes`, plus their
   `strength_items` / `movement_profiles`. Make yourself a coach (see bottom of
   schema.sql) to read/write everyone.

You do **not** need any Claude skill or plugin to go live — just the Supabase
and Vercel/Netlify accounts above, and a GitHub repo.

---

## How "each sees only her own info" works

It's enforced in the **database**, not the browser (hiding data in the page is
not real privacy). Every table has an `athlete_id`, and a Row-Level Security
policy `athlete_id = auth.uid()` means Postgres itself refuses to return
anyone else's rows — even if the frontend asks. That's why `js/data.js` never
filters by athlete: the database already does. Coaches (listed in the `coaches`
table) can read/write everyone.

---

## UX principles (from your Haze Lah reference)

- **Dynamic vs static, by placement + stamps.** *Today* carries time-stamps
  ("updated…", greeting) and changing content; *Profile* and *Strength* are your
  standing reference, re-checked at the taper.
- **Verdict-first, plain language.** Readiness shows a headline — *Go for it /
  Ease in / Rest is the session* — plus one line of why. Always labelled a
  **suggestion; the coach confirms**.
- **Status in words AND colour**, never colour alone (pills read "in range" /
  "a little low" / "below range").
- **Plan-today chips** (session type + cycle phase) return today's fuel line —
  your day-aware bottle.
- **Reference behind disclosures.** Any deeper "how is this worked out?" sits in
  a collapsed `<details>`; the scientific evidence stays **off the athlete page
  entirely** (coach-side only). No brand names on the page.

---

## Exercise visuals (swappable slot)

Each strength movement has a `visual_url`. Right now it points at a simple owned
SVG cue-card in `assets/exercises/` (no licensing risk, carries your cues). When
you film your own demos, just change `visual_url` to the video — **no code
change**. `assets/exercises/exercises.json` maps movement → visual + cues; add
one entry per movement in your library. (Avoid shipping scraped exercise GIFs in
a paid app — licensing is usually unclear.)

---

## Still to integrate (next with Claude)

- Drop the full **radar** and **day-aware fuel bottle** from `movement_profiles.html`
  into the Profile and Fuel views (shell has the slots marked).
- Wire **nutrition_screen.html** behind the Fuel "Energy & nutrition check".
- Generate the **full SVG cue-card set** for every movement in your library.
- Seed all athletes from your Vela data.

---

## Kickoff prompt (paste to continue the build)

```
Build a mobile-first installable PWA: the client companion for my endurance-
coaching service. ~6 mothers training for a half marathon, on their phones.

STACK: vanilla HTML/CSS/JS; Supabase (auth + Postgres + storage); deploy to
Vercel/Netlify. PWA (manifest + service worker, offline shell).

AUTH & PRIVACY: Supabase email magic-link (no passwords). Each athlete sees
ONLY her own data via Postgres row-level security (athlete_id = auth.uid() on
every table). Coaches can read/write everyone.

UI = DYNAMIC vs STATIC (Haze Lah style): Today = verdict-first readiness
(Go/Ease/Rest, suggest-only) + freshness stamps + metric cards (status in words
AND colour) + plan-today chips (session + cycle phase → fuel). Profile = movement
radar (static, repeated at taper). Fuel = steady base + day bottle + link to the
energy/nutrition check. Strength = Focus vs Race-ready list, each with a
SWAPPABLE visual slot (SVG placeholder now, my video later).

CONTENT RULES: no brand names on the page (label "Coach check-in"); all
scientific evidence/citations coach-side, never rendered — show the visual + one
plain line; deeper detail behind <details> disclosures only.

DESIGN BASIS: match palette/tabs/components of movement_profiles.html and
nutrition_screen.html.

DATA MODEL (Supabase, RLS on athlete_id): athletes; readiness_logs; fuel_days;
movement_profiles(jsonb scores); strength_items(tag focus|race, visual_url).
```
