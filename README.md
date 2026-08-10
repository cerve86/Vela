# CoachApp

Physiotherapy coaching platform — an iOS app for clients and a web portal for the coach.

Plan and checkpoints: [docs/PLAN.md](docs/PLAN.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Layout

```
apps/web        Next.js 16 coach portal
apps/mobile     Expo SDK 57 iOS client app
packages/shared Types, domain calculations, design tokens, seed data — one source of truth
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

## Phase 0 status

| | Item | State |
|---|---|---|
| ✅ | Monorepo, TypeScript, shared domain package | Done |
| ✅ | Coach portal — roster, client deep-dive, charts | Done, running on mock data |
| ✅ | iOS app — Today, session logging, progress, nutrition, profile | Done, running on mock data |
| ✅ | Supabase schema, RLS policies, pgTAP isolation tests | Written, not yet applied |
| ✅ | CI: typecheck, lint, build, RLS tests | Written |
| ⛔ | TestFlight pipeline | Blocked on Apple Developer Program enrolment |

Everything currently renders from `packages/shared/src/mock.ts` — deterministic seed data,
no backend. Phase 1 swaps that for Supabase queries; the shapes are already the contract,
so it is a one-file change per surface.

## Machine prerequisites

Present: Node 24, Xcode 26.6, CocoaPods (installed during first iOS build).

Missing, needed later:

```bash
brew install supabase/tap/supabase
```

Docker Desktop is also required for the local Supabase stack (`supabase start`).

## Rules

- Migrations are forward-only SQL in `supabase/migrations`. Never edit schema in the dashboard.
- RLS on every table, default deny. `supabase/tests/rls_isolation_test.sql` is the CP1 gate.
- No real client health data outside production.
- Chart colours come from the validated palette in `packages/shared/src/tokens.ts`. If the
  brand changes, re-run the palette validator rather than hand-picking hexes.
