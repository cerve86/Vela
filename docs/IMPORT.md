# Importing programmes

Two doors, one pipeline. A coach uploads a spreadsheet at **Programmes → Import from a
spreadsheet**; a script posts the same shape as JSON to `POST /api/programs/import`. Both
go through `parseProgramRows` / `importProgramSchema` in `packages/shared` and
`importProgram` in `packages/api`, so the rules are identical and stated once.

## The spreadsheet

One row per prescribed movement. Template: [`/programme-template.csv`](../apps/web/public/programme-template.csv).

| Column     | Required | Accepted spellings             | Notes                                                                                                                                                  |
| ---------- | :------: | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Week       |   yes    | week, wk, week no              | 1–52. Blank = same as the row above.                                                                                                                   |
| Day        |   yes    | day, day no, session           | 1–7, the nth training day of that week, not a weekday. Blank = same as above. A new week must state its day.                                           |
| Day title  |          | day title, title, session name | First row that states it wins; defaults to "Day N".                                                                                                    |
| Discipline |          | discipline, type, kind         | strength · run · mobility · rehab. Aliases: running/cardio → run, stretching/yoga → mobility, physio/pelvic/core/breath → rehab. Defaults to strength. |
| Block      |          | block, superset, group         | Items sharing a letter are a superset. Defaults to A.                                                                                                  |
| Exercise   |   yes    | exercise, movement, name       | Must match the library — shipped or the coach's own. Case, spaces and hyphens are ignored; spelling is not.                                            |
| Sets       |   yes    | sets                           | 1–20                                                                                                                                                   |
| Reps       |   yes    | reps, repetitions, dose        | Free text: `8 to 10`, `AMRAP`, `30s`. **Write ranges as "8 to 10", not "8-10"** — Excel turns "8-10" into a date and the import refuses the row.       |
| Load (kg)  |          | load, kg, weight               | `32.5`, `32,5 kg`; blank, `-`, `bw` mean none.                                                                                                         |
| RPE        |          | rpe, effort, intensity         | 1–10                                                                                                                                                   |
| Tempo      |          | tempo                          | free text, e.g. `3010`                                                                                                                                 |
| Rest (s)   |          | rest, rest (sec)               | `90`, `90s`, `1:30`, `2 min`. Defaults to 60.                                                                                                          |
| Notes      |          | notes, cues, comment           | free text                                                                                                                                              |

`.xlsx` or `.csv` (comma or semicolon), first sheet only, up to 5 MB and 5,000 rows. The
programme's length in weeks is the highest week number in the file.

The upload form previews before it creates: every day and movement as parsed, every error
with its Excel row number, and every exercise name the library does not know. Nothing is
written until the preview is confirmed, and an unmatched exercise blocks it — rename it
in the file, or add it to the library, then preview again.

## Plan sheets

The second shape: **one row per dated session, for one athlete** — the export a planning
assistant makes for a physiotherapist. Template: [`/plan-template.csv`](../apps/web/public/plan-template.csv).
The headers decide which shape a file is: a date column and no sets column is a plan sheet.

| Column             | Required | Accepted spellings                    | Notes                                                                                                                                       |
| ------------------ | :------: | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| athlete_email      |          | athlete email, email, client          | Who it is for. One athlete per file. Matched to the coach's clients by email.                                                               |
| date               |   yes    | date, session date, when              | `2026-09-14`, `14/09/2026`, or an Excel date. The Monday of the earliest date is day 1 of week 1; the weekday is the day.                   |
| phase              |          | phase, block                          | Names the programme with the athlete: "Caroline — Base 1".                                                                                  |
| week_number        |          | week number, week, wk                 | Read but not relied on: the calendar numbers the weeks from the Monday of the earliest date, so weeks that start mid-week still land right. |
| title              |   yes    | title, session, session name          | The day's title in the app.                                                                                                                 |
| type               |          | type, session type, discipline        | strength · run · mobility · rehab · cross · rest. Words for them: intervals/long/tempo → run, spin/swim/bike → cross, recovery → rehab.     |
| planned_min        |          | planned min, minutes, duration        | Goes into the day's notes as "60 min", with the km, climb and carbs if given.                                                               |
| planned_km, vert_m |          | km, distance · vert, climb, elevation |                                                                                                                                             |
| fuel_carbs_g_per_h |          | fuel, carbs per hour                  |                                                                                                                                             |
| notes              |          | notes, description, details           | Kept whole as the day's notes — the client reads them on Today and before she starts.                                                       |

Rows sharing a date make one day: the longest non-rest session is the day, the others are
folded into its notes under their own titles ("Daily — ankle: Tennis-ball calf raises 15
x 2, twice daily."). A date with nothing but a rest row makes no day.

**Movements in the notes.** Wherever the notes name a movement with a dose — "Dead bug hip
thrust 3 x 12 per side", "Suitcase carry 4 × 45 s, 12.5-15 kg", "single-leg RDL 3 × 8/side"
— it is also lifted out as an item, so the set is tickable in the app. A range, a unit and
a per-side marker travel with the reps; a load in kg becomes the target (the lower end of a
range); "15 x 2" is read as two sets of fifteen; anything else on the tail is the item's
note. The sentence stays in the notes as written either way. Coaching with no dose
("hinges lead over squats") is not an item.

**What the preview offers, and does only when ticked:**

- **Add the unmatched names to the library** as the coach's own exercises — name and a
  category guessed from the day (running, mobility, strength); cues and equipment are
  filled in from the library later. Unticked, an unmatched name blocks the import as
  before.
- **Assign it** to the client the sheet names, from its first Monday, when that email is
  one of her clients. Her current programme ends there and she gets the usual message.
  The programme name defaults to "First name — Phase".

## The API

```
POST /api/programs/import[?dryRun=1]
Authorization: Bearer <supabase access token>     (or the portal session cookie)
```

**JSON body** — the shape of `importProgramSchema`:

```json
{
  "name": "Return to running — weeks 12-18",
  "description": "optional",
  "isTemplate": false,
  "days": [
    {
      "weekNo": 1,
      "dayNo": 1,
      "title": "Strength — lower body",
      "discipline": "strength",
      "items": [
        {
          "exercise": "Romanian Deadlift",
          "block": "A",
          "sets": 3,
          "reps": "8 to 10",
          "loadKg": 32.5,
          "rpe": 7,
          "tempo": "3010",
          "restSec": 90,
          "notes": "Hinge from the hip"
        },
        { "exercise": "Single-Leg Bridge", "sets": 3, "reps": "12" }
      ]
    }
  ]
}
```

Defaults apply as in the table: `discipline` strength, `block` A, `restSec` 60,
`loadKg` / `rpe` / `tempo` / `notes` null.

A day may carry `notes` (up to 4,000 characters) and then an empty `items` list; a day
needs one or the other. `discipline` also accepts `cross`.

**Multipart body** — the upload without the form: a `file` field holding the .xlsx or
.csv (either shape), plus optional `name`, `description` and `isTemplate`
(`true`/`1`/`on`). Query flags for either body: `addMissing=1` creates the exercises the
library lacks as the coach's own; `assign=1` puts a plan sheet on the calendar of the
client it names, from its first Monday (422 when no client has that email).

```bash
curl -X POST "https://www.vela-coaching.com/api/programs/import?dryRun=1" \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@block.xlsx -F "name=Block 3"
```

| Status | Body                                       | Meaning                                                                                                                                |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 201    | `{ id, summary, created, assigned }`       | Created. `id` opens in the builder at `/programs/{id}`; `created` lists exercises made, `assigned` says whether it went on a calendar. |
| 200    | `{ ok: true, summary, unmatched, assign }` | Dry run passed; nothing created.                                                                                                       |
| 400    | `{ errors: [{ row, message }] }`           | The body or file did not validate. `row` is the spreadsheet row (header = 1), or 0 for a body-level problem.                           |
| 401    | `{ error }`                                | No session and no usable token.                                                                                                        |
| 422    | `{ error, unmatched: [...] }`              | Exercise names not in the coach's library. Nothing created.                                                                            |

### Getting a credential

The simplest is a **personal API key**: in the portal, Settings → API keys, create one and
send it as `Authorization: Bearer vela_…`. It is long-lived, revocable, and acts exactly as
the coach — the server resolves it to her session, so row-level security still decides
what it may touch. This is what the Claude extension uses; see [MCP.md](MCP.md).

The alternative is the coach's own Supabase session token, which suits a script that runs
once. Mint one with the auth API using the same six-digit code the portal uses:

```bash
# 1. ask for a code (arrives by email)
curl -X POST "$SUPABASE_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"coach@example.com","create_user":false}'

# 2. exchange it — the response carries access_token (valid ~1 hour) and refresh_token
curl -X POST "$SUPABASE_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"coach@example.com","token":"123456","type":"email"}'
```

`SUPABASE_URL` and `ANON_KEY` are the public values in `apps/mobile/eas.json`. A
longer-lived integration should refresh with `POST /auth/v1/token?grant_type=refresh_token`
rather than request a code each time.

## What is deliberately not here

- **No silent creation of exercises.** An unmatched name is refused unless the coach,
  looking at the list, ticks the box (or a script passes `addMissing=1`). A typo that
  silently became a new library entry is how a client ends up prescribed something that
  does not exist; a name she has read and accepted is hers.
- **No silent assignment.** A plan sheet says who it is for and when; putting it on her
  calendar is still a box the coach ticks on the preview, and a movement sheet is never
  assigned by import.
- **No multi-sheet workbooks.** One flat table. A "Week 1" tab and a "Week 2" tab is a
  reasonable thing to have made and a wrong thing to guess the meaning of.
