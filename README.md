# Vela

Physiotherapy coaching platform — an iOS app for clients and a web portal for the coach.

Plan and checkpoints: [docs/PLAN.md](docs/PLAN.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Importing programmes: [docs/IMPORT.md](docs/IMPORT.md) · Claude extension: [docs/MCP.md](docs/MCP.md)

## Layout

```
apps/web        Next.js 16 coach portal
apps/mobile     Expo SDK 57 iOS client app
packages/shared Types, domain calculations, design tokens, seed data — one source of truth
packages/mcp    MCP server: Claude drafting programmes into a coach's account
supabase/       Migrations, RLS policy tests, Edge Functions
docs/           Plan and architecture
```

## Running it

```bash
npm install
```

Coach portal on http://localhost:4310:

```bash
npm run dev:web
```

iOS app in the Simulator:

```bash
npm run ios
```

Typecheck everything:

```bash
npm run typecheck
```

## Status

|     | Item                                                                           | State                                           |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| ✅  | Monorepo, TypeScript, shared domain package                                    | Done                                            |
| ✅  | Coach portal — roster, client deep-dive, programme builder, library, messaging | Live on real data                               |
| ✅  | iOS app — Today, session logging, progress, nutrition, profile                 | Live on real data                               |
| ✅  | Supabase schema, RLS policies, pgTAP isolation tests                           | Applied locally and hosted; 88 assertions green |
| ✅  | CI: typecheck, lint, unit tests, portal build, RLS tests                       | Running on every PR                             |
| ✅  | TestFlight                                                                     | 0.2.0 (15) submitted 2026-09-04                 |

Both surfaces read Supabase. `packages/shared/src/mock.ts` still exists but is reached only
by the portal's `/preview` route, which is a design sandbox — no product screen renders from
it. Treat a new import of it outside `/preview` as a mistake.

Progress against the plan, and the findings worth keeping from each phase, live in
[docs/PLAN.md](docs/PLAN.md).

## Machine prerequisites

Node 24, Xcode 26.6, CocoaPods, the Supabase CLI, and a Docker runtime — all installed on
the development machine. The container runtime here is **OrbStack**, not Docker Desktop, so
`open -a Docker` finds nothing; start it with `open -a OrbStack`.

Local stack:

```bash
supabase start          # Postgres, auth, storage; Mailpit at :54324 catches every email
npm run seed            # rebuilds the demo world through the real APIs as the real users
```

`supabase stop` preserves the database by default, so seeded data survives a restart. Pass
`--no-backup` to discard it.

Build against an **iOS 26.5** simulator. Xcode 26.6 ships the iOS 26.5 SDK, and a 27.0
runtime is newer than the SDK — it is not a valid destination. CocoaPods needs a UTF-8
locale, so prefix build commands with `LANG=en_US.UTF-8` unless it is set in your shell.

## Rules

- Migrations are forward-only SQL in `supabase/migrations`. Never edit schema in the dashboard.
- RLS on every table, default deny. `supabase/tests/rls_isolation_test.sql` is the CP1 gate.
- No real client health data outside production.
- Chart colours come from the validated palette in `packages/shared/src/tokens.ts`. If the
  brand changes, re-run the palette validator rather than hand-picking hexes.
