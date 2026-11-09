# Claude and Vela: the MCP server

`packages/mcp` is a small [MCP](https://modelcontextprotocol.io) server that lets Claude
work inside a coach's Vela account: read her exercise library, check a programme draft
against it, and create the programme. It is how a physiotherapist who plans in Claude
gets the plan into Vela without retyping it.

It never assigns a programme to a client. Claude drafts; the coach assigns, with a start
date, in the portal. That boundary is deliberate and this server has no tool that crosses
it.

## Setting it up — for the coach

1. **Make a key.** In the portal open **Settings → API keys**, name the key after what
   will use it ("Claude on my laptop"), and copy it. It is shown once; if it is lost,
   revoke it and make another.
2. **Install the extension.** Open `vela.mcpb` — double-click it, or in Claude Desktop go
   to Settings → Extensions → Advanced settings → Install extension… and choose the file.
   Claude Desktop asks for the API key; paste it. Nothing else to configure.
3. **Use it.** Start a chat and ask for a programme:

   > Draft a 4-week early postnatal progression, three days a week: pelvic floor and
   > breath work first, then hinge and bridge patterns, building to single-leg work.

   Claude reads the library, drafts, shows a preview and asks before creating. The
   programme then appears under **Programmes** in the portal, unassigned, ready to open
   in the builder and assign.

If a movement Claude wants is not in the library it will say so rather than substitute.
Add it under **Exercise library** and ask again.

To stop a key working, revoke it in Settings. It stops on the next call.

### Claude Code, or a hand-written Claude Desktop config

The same server runs anywhere that can start a Node process:

```bash
claude mcp add vela -e VELA_API_KEY=vela_… -- node /path/to/packages/mcp/dist/vela-mcp.cjs
```

or, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vela": {
      "command": "node",
      "args": ["/path/to/packages/mcp/dist/vela-mcp.cjs"],
      "env": { "VELA_API_KEY": "vela_…" }
    }
  }
}
```

`VELA_URL` overrides the portal address (default `https://www.vela-coaching.com`); set it
to `http://localhost:4310` against a local stack.

## The tools

| Tool                                                            | What it does                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whoami`                                                        | The coach the key acts as. The first call to make when something is off.                                                                                                                                                                             |
| `list_exercises`                                                | The library — shipped plus her own — optionally filtered by name or category, with her codes, doses, gates and what is in her curated library.                                                                                                       |
| `list_programs`                                                 | Her programmes and templates, with ids and portal links.                                                                                                                                                                                             |
| `get_program`                                                   | One programme in full, as days of prescriptions.                                                                                                                                                                                                     |
| `preview_program`                                               | Validates a draft and matches every exercise name. Creates nothing.                                                                                                                                                                                  |
| `create_program`                                                | Creates the programme and returns its link. Never assigns.                                                                                                                                                                                           |
| `delete_program`                                                | Archives a programme; the coach can restore it from the portal.                                                                                                                                                                                      |
| `create_descriptive_program`                                    | A written programme: name, weeks and the text the client reads as it is.                                                                                                                                                                             |
| `list_clients`                                                  | Her active clients, by name, with ids.                                                                                                                                                                                                               |
| `send_weekly_plan`                                              | This week's plan for one client, straight to her phone, with a message.                                                                                                                                                                              |
| `get_client_report`                                             | Everything about one client as a page: open flags, sessions with readiness, pain and RPE, freshness (session load, acute:chronic, monotony, strain), weekly wellness, cycle context if shared, reads, vitals, HRV read, activities, meals, messages. |
| `update_program_item`                                           | Change sets, reps, load, RPE, tempo, rest or notes of one prescription.                                                                                                                                                                              |
| `add_program_item` / `remove_program_item`                      | Add a movement to a day, or take one off.                                                                                                                                                                                                            |
| `add_program_day` / `update_program_day` / `remove_program_day` | Add a day (movements, notes, or notes only), rename it, change its discipline or notes, move it, or remove it. Clients' upcoming sessions follow; completed ones never change.                                                                       |
| `assign_program` / `unassign_program`                           | Put a programme on a client's calendar from the Monday of the start week, or take it off. Only when the coach asks.                                                                                                                                  |
| `move_session`                                                  | Move a planned session to another day, or with `ripple` the rest of its block after it. Records never move; a moved session keeps its day when the programme changes. Only when the coach asks.                                                      |
| `create_exercise`                                               | Add a movement to her own library, once she has agreed the name. Duplicates are refused.                                                                                                                                                             |
| `send_to_intervals`                                             | Start or stop sending one client's sessions to her intervals.icu calendar, or check where it stands. Only when the coach asks.                                                                                                                       |

`add_program_day` and `update_program_day` also take `watch_steps`, and `create_program`
takes `watchSteps` on a day: a run's steps for the watch (below).

The programme shape is the one in [IMPORT.md](IMPORT.md): the server publishes the
import schema, field by field, as the tool's input, so a draft that passes here is exactly
a draft the upload form would accept. The server's instructions to Claude say to read the
library first, preview before creating, and be exact with sets, reps, load and rest.

## Sessions to the watch

A coach who plans in Claude can have the plan arrive on her athletes' watches, through
intervals.icu: Vela is where the plan lives, intervals.icu hands it to the watch.

1. **Link the athlete** on the Companion card of her page in the portal, once she has
   accepted the coach on intervals.icu (her side is the "Connect your watch" guide).
2. **Send her sessions**: the card's "Send … sessions" button, or ask Claude
   (`send_to_intervals`). Vela puts the next nine weeks of her planned sessions on her
   intervals.icu calendar, one event per session, and from then on keeps them in step:
   every assign, move, programme edit or removal — in the portal or through Claude —
   updates her calendar once it is saved. "Stop sending" takes the upcoming ones off.
3. **Her watch**: intervals.icu passes the coming week to a Garmin, Coros or Suunto once
   she has switched on uploading planned workouts in its connection (step 3 of her guide).
   Polar and Apple Watch don't take planned workouts.

What arrives: a run whose day has **watch steps** becomes a structured workout (warm-up,
intervals, targets). Write them in intervals.icu workout text — one step per line,
`- 10m Z1 HR`; `m` is minutes and `mtr` metres; a `6x` line, with a blank line before and
after, repeats the steps under it. Heart-rate targets are the safe default; pace targets
need her threshold pace set in intervals.icu. Claude writes them from the day's
prescription, and the builder shows and edits them under the day's notes. Everything else
goes as a workout with the day's notes and movements as text; intervals.icu cannot send
sets and reps to a watch, so strength stays ticked off in Vela.

The writes use the coach's intervals.icu key (`INTERVALS_API_KEY` on Vercel), server-side.
`intervals_events` records which event holds which session, so changes update in place;
a per-athlete lock (`intervals_sync_claim`) keeps two syncs from running at once. The
logic is `planIntervalsSync` in `packages/shared/src/intervalsPush.ts` (tested), the
sending `apps/web/src/lib/intervalsPush.ts`.

## How it works

The server is a thin client of the portal's HTTP API. Every rule about what a programme
may contain lives on the server side — the same code the spreadsheet upload runs — so the
MCP server validates nothing itself and cannot drift from the portal.

A personal API key is the credential. On the way in the portal hashes it, finds the row,
and mints a session for the coach who owns it (an admin-generated magic-link token,
verified server-side, no email sent). From there the request is her session: every query
runs through row level security as her, and the API needs no permission logic of its own.
Only the hash is stored, so a leaked database row is not a leaked key. The row is checked
on every request, which is why revoking takes effect immediately.

A key is only useful against the portal's `/api` routes. It is not a Supabase token and
cannot query the database directly.

## Building the bundle

```bash
npm run mcp:pack
```

produces `packages/mcp/dist/vela.mcpb` — the manifest, the server bundled into one file,
and an icon. The server is bundled with esbuild so the extension has no `node_modules`;
Claude Desktop supplies the Node runtime.

`npm test -w @vela/mcp` runs the server in-process against a scripted portal and checks
every tool's wording, including the refusals.

## What is deliberately not here

- **No acting without the coach.** Every write tool says so in its description, and the
  instructions tell Claude to change, assign or create nothing she has not agreed to.
- **No guessed exercises.** An unmatched name is refused; a new movement is created only
  under the name she agreed, and a duplicate of an existing one is refused.
- **No remote server.** This runs on the coach's own machine, which is where the key
  stays. A hosted version for claude.ai in the browser would need OAuth in front of it,
  and is a separate piece of work.
