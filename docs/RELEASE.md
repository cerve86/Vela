# Releasing

## iOS — TestFlight

The build runs on EAS. `eas.json` carries the Supabase URL and anon key for the
`preview` and `production` profiles; both are public values and belong in version
control. The service role key never appears in a build.

`scripts/check-release-env.mjs` runs as EAS's `eas-build-pre-install` hook and refuses a
`preview` or `production` build whose Supabase URL is a loopback address, or whose anon
key is the well-known local development one. A release built against a laptop compiles
and installs perfectly and then fails every request, which surfaces days later as "the
app is broken" — this turns that into a thirty-second build failure instead.

### One-time setup

The three values in `submit.production.ios` come from Apple and have to be filled in
before `eas submit` will run:

| Field | Where to find it |
| --- | --- |
| `appleId` | The Apple ID email on the developer account |
| `appleTeamId` | developer.apple.com → Membership → Team ID (10 characters) |
| `ascAppId` | App Store Connect → the app → App Information → Apple ID (numeric) |

The bundle identifier is `io.velas.app` and needs the **HealthKit** capability enabled on
it at developer.apple.com → Identifiers.

Authenticate EAS to Apple with an **App Store Connect API key** (Users and Access →
Integrations → App Store Connect API, App Manager role) rather than an Apple ID and
password. It avoids interactive 2FA on every build and keeps the credential out of
anyone's shell history.

### Build and submit

```
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Internal TestFlight testers need no review. External testers require Beta App Review,
which takes roughly 24–48 hours and needs the privacy policy URL — served at `/privacy`
on the portal — plus the HealthKit usage description already in `app.json`.

## Web — the coach portal

Vercel, root directory `apps/web`. Three environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security. It is set in Vercel's dashboard
directly and never committed. `NEXT_PUBLIC_SITE_URL` is the deployed origin and is what
auth redirects are built from.

After the first deploy, add the deployed origin to `auth.additional_redirect_urls` in
`supabase/config.toml` and run `npx supabase config push`, or magic links will keep
redirecting to localhost.

## Database

```
npx supabase db push        # migrations
npx supabase config push    # auth settings and email templates
```

Email template customisation requires custom SMTP — Supabase refuses it on the free tier
with the default email provider, and the app's invite flow depends on a `{{ .Token }}`
six-digit code that the stock template does not contain. This is configured: Resend, via
`auth.email.smtp` in `supabase/config.toml`, with the key read from `RESEND_API_KEY` rather
than committed. Rotating that key means updating it in the Supabase dashboard as well.

Both `db push` and `config push` act on the **hosted** project. Check
`npx supabase migration list --linked` before shipping a build: a binary that writes a
metric type the hosted enum does not have installs perfectly and then fails every import.
