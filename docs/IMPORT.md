# Importing programmes

Two doors, one pipeline. A coach uploads a spreadsheet at **Programmes → Import from a
spreadsheet**; a script posts the same shape as JSON to `POST /api/programs/import`. Both
go through `parseProgramRows` / `importProgramSchema` in `packages/shared` and
`importProgram` in `packages/api`, so the rules are identical and stated once.

## The spreadsheet

One row per prescribed movement. Template: [`/programme-template.csv`](../apps/web/public/programme-template.csv).

| Column | Required | Accepted spellings | Notes |
| --- | :-: | --- | --- |
| Week | yes | week, wk, week no | 1–52. Blank = same as the row above. |
| Day | yes | day, day no, session | 1–7, the nth training day of that week, not a weekday. Blank = same as above. A new week must state its day. |
| Day title | | day title, title, session name | First row that states it wins; defaults to "Day N". |
| Discipline | | discipline, type, kind | strength · run · mobility · rehab. Aliases: running/cardio → run, stretching/yoga → mobility, physio/pelvic/core/breath → rehab. Defaults to strength. |
| Block | | block, superset, group | Items sharing a letter are a superset. Defaults to A. |
| Exercise | yes | exercise, movement, name | Must match the library — shipped or the coach's own. Case, spaces and hyphens are ignored; spelling is not. |
| Sets | yes | sets | 1–20 |
| Reps | yes | reps, repetitions, dose | Free text: `8 to 10`, `AMRAP`, `30s`. **Write ranges as "8 to 10", not "8-10"** — Excel turns "8-10" into a date and the import refuses the row. |
| Load (kg) | | load, kg, weight | `32.5`, `32,5 kg`; blank, `-`, `bw` mean none. |
| RPE | | rpe, effort, intensity | 1–10 |
| Tempo | | tempo | free text, e.g. `3010` |
| Rest (s) | | rest, rest (sec) | `90`, `90s`, `1:30`, `2 min`. Defaults to 60. |
| Notes | | notes, cues, comment | free text |

`.xlsx` or `.csv` (comma or semicolon), first sheet only, up to 5 MB and 5,000 rows. The
programme's length in weeks is the highest week number in the file.

The upload form previews before it creates: every day and movement as parsed, every error
with its Excel row number, and every exercise name the library does not know. Nothing is
written until the preview is confirmed, and an unmatched exercise blocks it — rename it
in the file, or add it to the library, then preview again.

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
        { "exercise": "Romanian Deadlift", "block": "A", "sets": 3, "reps": "8 to 10", "loadKg": 32.5, "rpe": 7, "tempo": "3010", "restSec": 90, "notes": "Hinge from the hip" },
        { "exercise": "Single-Leg Bridge", "sets": 3, "reps": "12" }
      ]
    }
  ]
}
```

Defaults apply as in the table: `discipline` strength, `block` A, `restSec` 60,
`loadKg` / `rpe` / `tempo` / `notes` null.

**Multipart body** — the upload without the form: a `file` field holding the .xlsx or
.csv, plus optional `name`, `description` and `isTemplate` (`true`/`1`/`on`).

```bash
curl -X POST "https://www.vela-coaching.com/api/programs/import?dryRun=1" \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@block.xlsx -F "name=Block 3"
```

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ id, summary }` | Created. `id` opens in the builder at `/programs/{id}`. |
| 200 | `{ ok: true, summary }` | Dry run passed; nothing created. |
| 400 | `{ errors: [{ row, message }] }` | The body or file did not validate. `row` is the spreadsheet row (header = 1), or 0 for a body-level problem. |
| 401 | `{ error }` | No session and no usable token. |
| 422 | `{ error, unmatched: [...] }` | Exercise names not in the coach's library. Nothing created. |

### Getting a token

The token is the coach's own Supabase session, so the endpoint inherits her row-level
security and needs no permission logic — and there is no API key to leak. For a script,
mint one with the auth API using the same six-digit code the portal uses:

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

- **No auto-creation of exercises.** An unmatched name is refused, never invented. A typo
  that silently became a new library entry is how a client ends up prescribed something
  that does not exist.
- **No assignment.** Import makes a programme; assigning it to a client with a start date
  is a separate, deliberate step in the builder, as it is for every other programme.
- **No multi-sheet workbooks.** One flat table. A "Week 1" tab and a "Week 2" tab is a
  reasonable thing to have made and a wrong thing to guess the meaning of.
