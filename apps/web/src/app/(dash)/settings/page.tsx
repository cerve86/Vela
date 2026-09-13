import { Card } from '@/components/ui';
import { adminClient } from '@/lib/impersonate';
import { atCapacity, connectedAthletes, stravaConfig } from '@/lib/strava';
import { loadApiKeys } from './actions';
import { ApiKeys } from './ApiKeys';

export const metadata = { title: 'Settings — Vela' };

export default async function SettingsPage() {
  const keys = await loadApiKeys();
  const strava = await loadStravaCapacity();

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Settings</h1>
        <p className="mt-0.5 text-sm ink-2">Tools that act as you, and the keys that let them.</p>
      </header>

      <Card title="API keys">
        <p className="mb-4 text-sm ink-2">
          A key lets a tool — Claude with the Vela extension, a script, a spreadsheet pipeline —
          read your library and create programmes in your account. It can do what you can do in
          Programmes and nothing else: a programme it creates is not assigned to anyone until you
          assign it. Keys expire after six months; revoke one the moment you stop using it.
        </p>
        <ApiKeys keys={keys} />
      </Card>

      {strava && (
        <Card title="Strava" className="mt-6">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              {strava.connected} of {strava.capacity}
            </span>{' '}
            {strava.capacity === 1 ? 'athlete slot' : 'athlete slots'} used.
            {strava.full &&
              ' Full: the next client to tap Connect with Strava is told to wait, rather than sent to Strava\u2019s error page.'}
          </p>
          <p className="mt-2 text-sm ink-2">
            The limit is set by Strava on the Vela application, not here. A new application may
            connect one athlete; the owner raises it to ten in the application’s{' '}
            <a
              className="underline underline-offset-2"
              href="https://www.strava.com/settings/api"
              target="_blank"
              rel="noreferrer"
            >
              API settings
            </a>{' '}
            and beyond ten by submitting the application for review. After a change, set{' '}
            <code className="text-[13px]">STRAVA_ATHLETE_CAPACITY</code> on the portal to the new
            number so this count stays honest.
          </p>
        </Card>
      )}
    </div>
  );
}

/** The slot count, or null when Strava is not configured and there is nothing to show. */
async function loadStravaCapacity() {
  const cfg = stravaConfig();
  const admin = cfg && adminClient();
  if (!cfg || !admin) return null;
  const connected = await connectedAthletes(admin).catch(() => null);
  if (connected === null) return null;
  return {
    connected,
    capacity: cfg.athleteCapacity,
    full: atCapacity(connected, cfg.athleteCapacity),
  };
}
