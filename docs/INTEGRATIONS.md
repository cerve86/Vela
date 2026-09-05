# Strava and calendars

Two ways training reaches Vela from outside the app, and one way out.

## Strava

A client connects Strava from **Profile → Connections** in the app. From then on every
run, ride or workout she records becomes a session: if the plan had a session of the same
discipline that day it is marked complete by the activity; otherwise a completed session
is created for it. The activity itself — distance, time, pace, average and max heart
rate, cadence, running power, climb — is stored beside the session and shown on the
client's Today screen and on the coach's **Training** tab under _Recorded activities_.
Cadence is shown in steps per minute (both feet); Strava stores one foot's count.

### Setting it up (once, by the owner)

1. Create an API application at <https://www.strava.com/settings/api>. Set
   **Authorization Callback Domain** to `www.vela-coaching.com`.
2. In Vercel, set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and
   `STRAVA_WEBHOOK_VERIFY_TOKEN` (any random string). Redeploy.
3. Subscribe to Strava's webhook so new activities arrive without the client tapping
   _Sync now_:

   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
     -F callback_url=https://www.vela-coaching.com/api/strava/webhook \
     -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
   ```

   Strava calls `GET /api/strava/webhook` to verify, then `POST`s events. Without the
   subscription everything still works; imports just wait for _Sync now_ or the next
   connect.

Strava's brand guidelines ask that the connect button reads "Connect with Strava" in
Strava orange and that displayed data is attributed; the app says "via Strava" on every
activity card. Before a public release, replace the text button with Strava's official
button asset from the same guidelines page.

### How it works

- `POST /api/strava/connect` (as the client) returns the authorisation URL. The OAuth
  state is the client id and user id, signed with the client secret and valid ten minutes.
- `GET /api/strava/callback` exchanges the code, stores tokens in `strava_tokens` (a
  table nothing signed-in can read) and the link in `strava_links` (which the client and
  her coach can), runs the first import, and sends the phone back to `vela://strava`.
- Imports run **as the client through RLS**. The service role only reads her tokens and
  mints her a session (`apps/web/src/lib/impersonate.ts`, the same mechanism as personal
  API keys). `sessions_client_insert` is the policy that lets her own sync create a
  session; nothing writes a domain row with the service role.
- `POST /api/strava/sync` and `POST /api/strava/disconnect` are the two buttons. Disconnect
  deauthorises at Strava and deletes the tokens; imported activities stay.
- The first import reaches back 60 days; later ones overlap the last sync by a week so a
  late upload is still caught. Re-running is safe: an activity's Strava id is unique.

Locally, point `STRAVA_API_BASE` at a stand-in and the whole flow runs without Strava.

## Calendar feeds

From **Profile → Connections → Your calendar** a client subscribes her own calendar to
her planned sessions. One feed, two doors: Apple Calendar subscribes on the spot from a
`webcal://` link; Google Calendar opens its add-by-URL page with the feed filled in.

- The feed is `GET /api/calendar/{token}/vela.ics`. The token is minted by
  `ensure_calendar_token()`, one per client, and is the whole credential: it resolves to
  her and the sessions are read as her. Revoking it in the table ends the feed.
- Each entry is an all-day event on the session's date with the full exercise list —
  block, sets, reps, load, RPE, tempo, rest, notes — in the description, and a link that
  marks the session done.
- `/done/{session}?t={token}` is that link: a page with the exercises and one button, _I
  did the whole session_, which marks every set complete (`logged_via = 'calendar'`).
  A button rather than completing on open, because link previewers fetch URLs. Two weeks
  back the feed shows completed sessions as confirmed with a tick.
- Google refreshes subscribed feeds every few hours to a day; Apple every hour by
  default. A session added to the plan appears on the next refresh.

## What is deliberately not here

- **No Apple Health writes and no device-calendar writes.** The feed is one source of
  truth that every calendar reads; writing events into the phone's calendar would be a
  second copy to keep in step.
- **No pain scores from outside.** A session marked done from a calendar has no before
  and after; the app is where those are asked.
- **No cardiovascular load from Strava yet.** The strain figure is built from Apple Health
  heart-rate streams; an activity's average heart rate is not the same input.
