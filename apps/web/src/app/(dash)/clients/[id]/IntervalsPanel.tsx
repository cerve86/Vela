'use client';

import { useCallback, useEffect, useId, useState, useTransition, type ReactNode } from 'react';
import { palette } from '@vela/shared/tokens';
import { StatusPill } from '@/components/ui';
import {
  checkIntervalsAction,
  linkIntervalsAction,
  setIntervalsPushAction,
  unlinkIntervalsAction,
  type IntervalsCheck,
} from './actions';
import type { PushOutcome, PushStatus } from '@/lib/intervalsPush';

const GUIDE_PATH = '/companion/connect.html';

/**
 * Her intervals.icu link, on the Companion card: checked live each time the page opens,
 * because what matters is whether her watch is reaching Vela today, not what was set up
 * once. Linking is a pick from the coach's own intervals.icu athletes; the setup guide is
 * one copied link, for her side of it.
 */
export function IntervalsPanel({
  clientId,
  firstName,
  icuId,
}: {
  clientId: string;
  firstName: string;
  icuId: string | null;
}) {
  const [check, setCheck] = useState<IntervalsCheck | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    checkIntervalsAction(clientId)
      .then(setCheck)
      .catch(() => setCheck({ state: 'error', icuId }));
  }, [clientId, icuId]);
  useEffect(() => {
    load();
  }, [load]);
  const refresh = () => {
    setCheck(null);
    load();
  };

  const link = (value: string) =>
    startTransition(async () => {
      setNotice(null);
      const res = await linkIntervalsAction(clientId, value);
      if (!res.ok) setNotice({ ok: false, text: res.error ?? 'Could not link.' });
      else refresh();
    });
  const unlink = () =>
    startTransition(async () => {
      setNotice(null);
      const res = await unlinkIntervalsAction(clientId);
      if (!res.ok) setNotice({ ok: false, text: res.error ?? 'Could not unlink.' });
      else refresh();
    });

  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-xs font-medium ink-2">intervals.icu</h3>
      <div className="mt-2 text-sm" aria-live="polite" aria-busy={check === null}>
        {check === null ? (
          <p className="ink-3">{icuId ? `Linked to ${icuId}. ` : ''}Checking intervals.icu…</p>
        ) : (
          <State
            check={check}
            clientId={clientId}
            firstName={firstName}
            pending={pending}
            onLink={link}
            onUnlink={unlink}
            onRetry={refresh}
          />
        )}
      </div>
      {notice && (
        <p
          className="mt-2 text-xs"
          role="status"
          style={{ color: notice.ok ? undefined : palette.status.critical }}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

function State({
  check,
  clientId,
  firstName,
  pending,
  onLink,
  onUnlink,
  onRetry,
}: {
  check: IntervalsCheck;
  clientId: string;
  firstName: string;
  pending: boolean;
  onLink: (id: string) => void;
  onUnlink: () => void;
  onRetry: () => void;
}) {
  const linkedLine = (id: string, name?: string | null) => (
    <span className="ink-2">
      {name ? `${name} · ` : ''}
      <span className="tnum">{id}</span>
      <button
        type="button"
        disabled={pending}
        onClick={onUnlink}
        className="ml-2 text-xs underline ink-3"
      >
        Unlink
      </button>
    </span>
  );

  switch (check.state) {
    case 'no-key':
      return (
        <>
          <p className="ink-2">
            intervals.icu isn&apos;t switched on for Vela yet. Once it is, {firstName}&apos;s watch
            readings and runs reach her companion by themselves. It&apos;s a one-time step for all
            your athletes:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 ink-2">
            <li>
              In intervals.icu, open{' '}
              <ExternalLink href="https://intervals.icu/settings">Settings</ExternalLink>, scroll to
              Developer Settings and copy your API key.
            </li>
            <li>
              Have it added to Vela&apos;s hosting (Vercel) as{' '}
              <code className="text-xs">INTERVALS_API_KEY</code>. Keep the key private: it opens
              every athlete who has accepted you as coach.
            </li>
          </ol>
          {check.icuId && <p className="mt-2">Linked to {linkedLine(check.icuId)}</p>}
          <GuideLink firstName={firstName} lead="Meanwhile she can do her part:" />
        </>
      );

    case 'bad-key':
      return (
        <>
          <p className="ink-2">
            intervals.icu didn&apos;t accept the API key Vela has. Copy it again from{' '}
            <ExternalLink href="https://intervals.icu/settings">Settings</ExternalLink> → Developer
            Settings and replace <code className="text-xs">INTERVALS_API_KEY</code> on Vercel.
          </p>
          <RetryButton onRetry={onRetry} pending={pending} />
        </>
      );

    case 'error':
      return (
        <>
          <p className="ink-2">
            {check.icuId ? <>Linked to {linkedLine(check.icuId)}. </> : null}
            Couldn&apos;t reach intervals.icu just now.
          </p>
          <RetryButton onRetry={onRetry} pending={pending} />
        </>
      );

    case 'denied':
      return (
        <>
          <p>
            <StatusPill tone="warning">Waiting for her</StatusPill>{' '}
            <span className="ml-1">Linked to {linkedLine(check.icuId)}</span>
          </p>
          <p className="mt-2 ink-2">
            intervals.icu won&apos;t share {firstName}&apos;s data with you yet. She needs to send
            you a coaching request (step 4 of her guide), or accept yours. If she has, check the ID
            is hers.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RetryButton onRetry={onRetry} pending={pending} />
          </div>
          <GuideLink firstName={firstName} />
        </>
      );

    case 'unlinked':
      return <Unlinked check={check} firstName={firstName} pending={pending} onLink={onLink} />;

    case 'connected': {
      const { conn } = check;
      const issue = ISSUES[conn.issue ?? 'none'](firstName, conn.withheldCount);
      return (
        <>
          <p>
            <StatusPill
              tone={
                conn.issue === 'withheld-only' || conn.issue === 'no-wellness' ? 'warning' : 'good'
              }
            >
              Connected
            </StatusPill>{' '}
            <span className="ml-1">{linkedLine(check.icuId, check.name)}</span>
          </p>
          <ul className="mt-2 space-y-0.5 ink-2 tnum">
            <li>
              HRV on {conn.hrvDays} of the last {conn.days} days · resting HR on {conn.restingDays}
            </li>
            <li>
              {conn.sharedCount + conn.withheldCount === 0
                ? 'No activities in the last 4 weeks'
                : 'Last 4 weeks: ' +
                  [
                    ...conn.shared.map((s) => `${s.count} from ${s.name}`),
                    ...conn.withheld.map((s) => `${s.count} through ${s.name} (hidden from Vela)`),
                  ].join(', ')}
            </li>
          </ul>
          {issue && (
            <p
              className="mt-2 rounded-[10px] p-3"
              style={{
                background: 'var(--ghost)',
                borderLeft: issue.warn ? `4px solid ${palette.status.warning}` : undefined,
              }}
            >
              {issue.text}
            </p>
          )}
          {issue?.warn && <GuideLink firstName={firstName} />}
          <SessionsToWatch clientId={clientId} firstName={firstName} initial={check.push} />
        </>
      );
    }
  }
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** What a send or a stop did, in a line. */
function outcomeLine(o: PushOutcome, firstName: string): { ok: boolean; text: string } {
  switch (o.state) {
    case 'sent': {
      const changes = [
        o.created ? `${o.created} new` : '',
        o.updated ? `${o.updated} changed` : '',
        o.removed ? `${o.removed} taken off` : '',
      ].filter(Boolean);
      return {
        ok: true,
        text: `${o.onCalendar} ${o.onCalendar === 1 ? 'session is' : 'sessions are'} on ${firstName}'s intervals.icu calendar${changes.length ? ` (${changes.join(', ')})` : ', as they were'}.`,
      };
    }
    case 'stopped':
      return {
        ok: true,
        text: o.removed
          ? `Stopped. ${o.removed} upcoming ${o.removed === 1 ? 'session' : 'sessions'} came off her calendar.`
          : 'Stopped.',
      };
    case 'busy':
      return { ok: true, text: 'Vela is already updating her calendar. Check again in a moment.' };
    default:
      return { ok: false, text: o.message };
  }
}

/**
 * Her sessions on her watch: Vela mirrors the next nine weeks of her plan onto her
 * intervals.icu calendar, which hands the coming week to her Garmin, Coros or Suunto.
 * Changes follow by themselves; the buttons are for starting, stopping and nudging.
 */
function SessionsToWatch({
  clientId,
  firstName,
  initial,
}: {
  clientId: string;
  firstName: string;
  initial: PushStatus;
}) {
  const [push, setPush] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const button =
    'display-face min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40';

  const send = (on: boolean) =>
    startTransition(async () => {
      setNotice(null);
      try {
        const res = await setIntervalsPushAction(clientId, on);
        setPush(res.push);
        setNotice(outcomeLine(res.outcome, firstName));
      } catch {
        setNotice({ ok: false, text: 'Couldn’t reach Vela just now.' });
      }
    });
  const stop = () => {
    if (
      window.confirm(
        `Stop sending, and take the upcoming Vela sessions off ${firstName}'s intervals.icu calendar? Sessions she has done stay.`,
      )
    )
      send(false);
  };

  return (
    <div className="mt-4 rounded-[10px] p-3" style={{ background: 'var(--ghost)' }}>
      <h4 className="text-xs font-medium ink-2">Sessions on her watch</h4>
      {push.sending ? (
        <>
          <p className="mt-1">
            <StatusPill tone={push.error ? 'warning' : 'good'}>Sending</StatusPill>{' '}
            <span className="ml-1 ink-2">
              {push.onCalendar} {push.onCalendar === 1 ? 'session' : 'sessions'} on her
              intervals.icu calendar, the next 9 weeks
              {push.syncedAt ? ` · updated ${when(push.syncedAt)}` : ''}
            </span>
          </p>
          {push.error && (
            <p className="mt-1" style={{ color: palette.status.critical }}>
              {push.error}
            </p>
          )}
          <p className="mt-1 text-xs ink-3">
            Changes you make in Vela follow by themselves: a moved, edited or removed session
            changes on her calendar too.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => send(true)}
              className={`${button} text-white`}
              style={{ background: palette.brand[600] }}
            >
              {pending ? 'Updating…' : 'Update now'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={stop}
              className="text-xs font-medium underline ink-2"
            >
              Stop sending
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 ink-2">
            Put {firstName}&apos;s Vela sessions on her intervals.icu calendar. Runs with watch
            steps arrive on her watch as workouts; the rest show with their notes and movements.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => send(true)}
            className={`${button} mt-2 text-white`}
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Sending…' : `Send ${firstName}'s sessions`}
          </button>
          {push.onCalendar > 0 && (
            // Stopping failed part-way: what Vela put there is still there.
            <p className="mt-2" style={{ color: palette.status.critical }}>
              {push.onCalendar} upcoming {push.onCalendar === 1 ? 'session' : 'sessions'} Vela put
              on her calendar {push.onCalendar === 1 ? 'is' : 'are'} still there.
              {push.error ? ` ${push.error}` : ''}{' '}
              <button
                type="button"
                disabled={pending}
                onClick={() => send(false)}
                className="font-medium underline"
              >
                Take them off
              </button>
            </p>
          )}
        </>
      )}
      <p className="mt-2 text-xs ink-3">
        intervals.icu passes the coming week to a Garmin, Coros or Suunto once she has switched on
        planned workouts (step 3 of her guide). Polar and Apple Watch don&apos;t take them.
      </p>
      {notice && (
        <p
          className="mt-2 text-xs"
          role="status"
          style={{ color: notice.ok ? undefined : palette.status.critical }}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}

/** What to tell the coach about each issue; warn = she should act on it. */
const ISSUES: Record<
  string,
  (firstName: string, n: number) => { text: string; warn: boolean } | null
> = {
  none: () => null,
  'withheld-only': (f) => ({
    warn: true,
    text: `${f}'s runs reach intervals.icu only through Strava, and Strava doesn't let intervals.icu pass them on, so her companion can't see them. You still see them on intervals.icu. Ask her to connect her watch to intervals.icu directly (step 3 of her guide).`,
  }),
  'no-wellness': (f) => ({
    warn: true,
    text: `No HRV or resting HR in two weeks. ${f}'s watch is connected, but its wellness sync may be off: step 3 of her guide shows where to tick it. A new connection can take a day.`,
  }),
  'some-withheld': (_f, n) => ({
    warn: false,
    text: `${n === 1 ? 'One activity' : `${n} activities`} came in only through Strava; the companion doesn't see ${n === 1 ? 'it' : 'those'}. Everything from her watch comes through.`,
  }),
  'no-activities': () => null,
};

function Unlinked({
  check,
  firstName,
  pending,
  onLink,
}: {
  check: Extract<IntervalsCheck, { state: 'unlinked' }>;
  firstName: string;
  pending: boolean;
  onLink: (id: string) => void;
}) {
  const id = useId();
  const free = check.athletes.filter((a) => !a.linkedTo);
  const suggested = free.find((a) => a.id === check.suggested) ?? null;
  const [pick, setPick] = useState('');
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(check.listFailed || check.athletes.length === 0);
  const field = 'rounded-[10px] px-2.5 py-2 text-sm outline-none';
  const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };
  const button =
    'display-face min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';

  return (
    <>
      <p className="ink-2">
        Not linked yet.{' '}
        {check.listFailed
          ? 'Your intervals.icu athletes couldn’t be loaded just now.'
          : check.athletes.length === 0
            ? `Nobody has joined you on intervals.icu yet. Send ${firstName} the setup guide below; once she accepts you as coach, she appears here.`
            : `Which of your intervals.icu athletes is ${firstName}?`}
      </p>

      {suggested && (
        <div
          className="mt-2 flex flex-wrap items-center gap-3 rounded-[10px] p-3"
          style={{ background: 'var(--ghost)' }}
        >
          <span className="min-w-0 flex-1">
            Looks like <strong>{suggested.name}</strong>
            {suggested.email ? <span className="ink-3"> · {suggested.email}</span> : null}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => onLink(suggested.id)}
            className={button}
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Linking…' : `Link ${firstName}`}
          </button>
        </div>
      )}

      {check.athletes.length > 0 && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) onLink(pick);
          }}
        >
          <div className="min-w-[220px] flex-1">
            <label htmlFor={`${id}-pick`} className="text-xs ink-3">
              {suggested ? 'Or choose someone else' : 'Your intervals.icu athletes'}
            </label>
            <select
              id={`${id}-pick`}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className={`${field} mt-1 w-full`}
              style={fieldStyle}
            >
              <option value="">Choose…</option>
              {check.athletes.map((a) => (
                <option key={a.id} value={a.id} disabled={!!a.linkedTo}>
                  {a.name}
                  {a.email ? ` · ${a.email}` : ''}
                  {a.linkedTo ? ` · linked to ${a.linkedTo}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending || !pick || pick === suggested?.id}
            className={button}
            style={{ background: palette.brand[600] }}
          >
            Link
          </button>
        </form>
      )}

      {typing ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onLink(typed);
          }}
        >
          <div className="min-w-[220px] flex-1">
            <label htmlFor={`${id}-typed`} className="text-xs ink-3">
              Her athlete ID, or a link to one of her intervals.icu pages
            </label>
            <input
              id={`${id}-typed`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="i123456"
              autoComplete="off"
              spellCheck={false}
              className={`${field} mt-1 w-full tnum`}
              style={fieldStyle}
            />
          </div>
          <button
            type="submit"
            disabled={pending || !typed.trim()}
            className={button}
            style={{ background: palette.brand[600] }}
          >
            Link
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setTyping(true)}
          className="mt-2 text-xs underline ink-3"
        >
          Type an ID instead
        </button>
      )}

      <GuideLink firstName={firstName} lead="Not in the list yet? Send her the setup guide:" />
    </>
  );
}

/** The athlete's setup guide (apps/companion connect.html): one link to copy into a message. */
function GuideLink({ firstName, lead }: { firstName: string; lead?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="ink-3">
        {lead ?? `${firstName}'s setup guide, about 5 minutes on her phone:`}
      </span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(window.location.origin + GUIDE_PATH)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            })
            .catch(() => {});
        }}
        className="font-medium underline"
        style={{ color: palette.brand[700] }}
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <ExternalLink href={GUIDE_PATH}>Open the guide</ExternalLink>
    </div>
  );
}

function RetryButton({ onRetry, pending }: { onRetry: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onRetry}
      className="mt-2 text-xs font-medium underline"
      style={{ color: palette.brand[700] }}
    >
      Check again
    </button>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline"
      style={{ color: palette.brand[700] }}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
