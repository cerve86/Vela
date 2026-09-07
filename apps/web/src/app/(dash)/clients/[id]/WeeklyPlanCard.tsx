'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientPlan } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { saveWeeklyPlanAction } from './actions';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * This week's plan for one client, in the physiotherapist's own words.
 *
 * One text box for the week, saved straight to her phone with a message to say so; the
 * previous weeks underneath, as written. Next week can be written ahead by moving the
 * date. Nothing to assign, nothing to take off.
 */
export function WeeklyPlanCard({
  clientId,
  firstName,
  thisWeek,
  plans,
}: {
  clientId: string;
  firstName: string;
  /** The Monday of the current week. */
  thisWeek: string;
  plans: ClientPlan[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekStart, setWeekStart] = useState(thisWeek);
  const existing = plans.find((p) => p.weekStart === weekStart) ?? null;
  const [body, setBody] = useState(existing?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  function pickWeek(iso: string) {
    setWeekStart(iso);
    setBody(plans.find((p) => p.weekStart === iso)?.body ?? '');
    setNotice(null);
    setError(null);
  }

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await saveWeeklyPlanAction(clientId, weekStart, body);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        setNotice(`Saved and sent to ${firstName}.`);
        router.refresh();
      }
    });
  }

  const past = plans.filter((p) => p.weekStart !== weekStart);

  return (
    <Card
      title="This week's plan"
      action={
        <label className="text-xs ink-3">
          Week of{' '}
          <input
            type="date"
            value={weekStart}
            onChange={(e) => pickWeek(e.target.value)}
            className={`${field} ml-1 py-1`}
            style={fieldStyle}
            aria-label="Week of"
          />
        </label>
      }
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={`What ${firstName} should do this week, in your words. Blank lines make paragraphs; a number or a dash starts a list.`}
        className={`${field} w-full font-[inherit] leading-relaxed`}
        style={fieldStyle}
        aria-label="This week's plan"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !body.trim() || body.trim() === (existing?.body ?? '').trim()}
          onClick={save}
          className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Sending…' : existing ? 'Update and send' : 'Send to her phone'}
        </button>
        {notice && <span className="text-sm ink-2">{notice}</span>}
        {error && (
          <span className="text-sm" style={{ color: palette.status.critical }}>
            {error}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs ink-3">
        She sees it on Today the moment it is saved, and gets a message saying it is there. To write
        next week ahead of time, move the date.
      </p>

      {past.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-xs font-medium ink-2 hover:underline"
          >
            {showPast ? 'Hide' : 'Show'} previous weeks ({past.length})
          </button>
          {showPast && (
            <ul className="mt-2 space-y-3">
              {past.map((p) => (
                <li key={p.id}>
                  <div className="text-xs font-medium ink-3">Week of {p.weekStart}</div>
                  <pre className="mt-1 whitespace-pre-wrap font-[inherit] text-sm ink-2">
                    {p.body}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
