import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  adherenceBand,
  adherenceStyle,
  painColor,
  painLabel,
  type RosterRollup,
} from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { MiniTrend } from '@/components/charts';
import { Avatar, StatusPill } from '@/components/ui';

export interface RosterClient {
  id: string;
  name: string;
  condition: string | null;
  goal: string | null;
  status: string;
  weeksPostpartum: number | null;
}

/**
 * One client, at a glance.
 *
 * The card answers the roster's question — who needs me this week — with the four numbers
 * a physiotherapist actually reads before opening a file: did she train, how did it feel,
 * is her weight moving, and what does her body say in the morning. The chart above them is
 * symptoms after each session across the month, which is the one series where the shape
 * matters more than the last value.
 *
 * Every reading carries its word beside its colour, and every absence says why — "not
 * recorded" and "nothing due" are different facts, and a dash would hide which one it is.
 */
export function ClientCard({ client, rollup }: { client: RosterClient; rollup: RosterRollup }) {
  const standing = standingPill(rollup);
  const trendColor =
    rollup.painTrend === 'improving'
      ? palette.status.good
      : rollup.painTrend === 'worsening'
        ? palette.status.critical
        : 'var(--series-1)';
  const hasPain = rollup.painSeries.some((p) => p.y !== null);

  return (
    <article
      className="surface flex flex-col rounded-[20px] p-5"
      style={{ background: 'var(--surface)' }}
    >
      <header className="flex items-start gap-3">
        <Avatar name={client.name} size={40} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/clients/${client.id}`}
            className="display-face text-[15px] font-semibold hover:underline"
          >
            {client.name}
          </Link>
          <div className="truncate text-xs ink-3">{subtitle(client)}</div>
        </div>
        <StatusPill tone={standing.tone}>{standing.label}</StatusPill>
      </header>

      {rollup.alerts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rollup.alerts.map((a) => (
            <StatusPill
              key={a.kind}
              tone={
                a.severity === 'critical'
                  ? 'critical'
                  : a.severity === 'warn'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {a.message}
            </StatusPill>
          ))}
        </div>
      )}

      <section className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs ink-2">Symptoms after sessions · 28 days</span>
          {hasPain && (
            <span className="text-xs font-medium" style={{ color: trendColor }}>
              {rollup.painTrend}
            </span>
          )}
        </div>
        <div className="mt-1">
          {hasPain ? (
            <MiniTrend points={rollup.painSeries} color={trendColor} domain={[0, 10]} height={64} />
          ) : (
            <div
              className="flex h-16 items-center justify-center rounded-[12px] text-xs ink-3"
              style={{ background: 'var(--ghost)' }}
            >
              No symptom scores yet
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdherenceDatum rollup={rollup} />
        <PainDatum rollup={rollup} />
        <WeightDatum rollup={rollup} />
        <BodyDatum rollup={rollup} />
      </section>

      <footer className="mt-4 flex items-center justify-between text-xs">
        <span className="ink-3">
          Last activity ·{' '}
          <span className="ink-2">
            {rollup.lastActivityAt ? sinceWords(rollup.daysSinceLastActivity ?? 0) : 'not yet'}
          </span>
        </span>
        <Link href={`/clients/${client.id}`} className="font-medium ink-2 hover:underline">
          Open →
        </Link>
      </footer>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
 * The four readings
 * ───────────────────────────────────────────────────────────── */

function Datum({
  label,
  value,
  unit,
  bar,
  caption,
  captionColor,
}: {
  label: string;
  value: string;
  unit?: string;
  bar?: ReactNode;
  caption: string;
  captionColor?: string;
}) {
  return (
    <div className="rounded-[14px] px-3 py-2.5" style={{ background: 'var(--ghost)' }}>
      <div className="text-[11px] ink-2">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="display-face tnum text-[20px] font-bold leading-tight">{value}</span>
        {unit && <span className="text-[11px] ink-3">{unit}</span>}
      </div>
      <div className="mt-2 h-1.5">{bar}</div>
      <div
        className="mt-1.5 truncate text-[11px]"
        style={{ color: captionColor ?? 'var(--ink-muted)' }}
      >
        {caption}
      </div>
    </div>
  );
}

/** A filled proportion of the track. */
function FillBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--border)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`,
          background: color,
        }}
      />
    </div>
  );
}

/** A marker on a scale — where the reading sits, not how much of something there is. */
function ScaleBar({ ratio, color }: { ratio: number; color: string }) {
  const left = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="relative h-1.5 w-full rounded-full" style={{ background: 'var(--border)' }}>
      <span
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${left}%`, background: color, boxShadow: '0 0 0 2px var(--surface)' }}
      />
    </div>
  );
}

function AdherenceDatum({ rollup }: { rollup: RosterRollup }) {
  if (rollup.adherence7d === null) {
    return <Datum label="Adherence · 7d" value="—" caption="Nothing due yet" />;
  }
  const band = adherenceBand(rollup.adherence7d);
  const style = adherenceStyle[band];
  return (
    <Datum
      label="Adherence · 7d"
      value={`${Math.round(rollup.adherence7d * 100)}%`}
      unit={`${rollup.done7d}/${rollup.due7d}`}
      bar={<FillBar ratio={rollup.adherence7d} color={style.color} />}
      caption={style.label}
      captionColor={style.color}
    />
  );
}

function PainDatum({ rollup }: { rollup: RosterRollup }) {
  if (rollup.avgPain7d === null) {
    return <Datum label="Pain after · 7d" value="—" caption="Not recorded" />;
  }
  const color = painColor(rollup.avgPain7d);
  return (
    <Datum
      label="Pain after · 7d"
      value={rollup.avgPain7d.toFixed(1)}
      unit="/10"
      bar={<ScaleBar ratio={rollup.avgPain7d / 10} color={color} />}
      caption={
        rollup.maxPain7d !== null && rollup.maxPain7d > rollup.avgPain7d
          ? `${painLabel(rollup.avgPain7d)} · peak ${rollup.maxPain7d}`
          : painLabel(rollup.avgPain7d)
      }
      captionColor={color}
    />
  );
}

function WeightDatum({ rollup }: { rollup: RosterRollup }) {
  if (rollup.weightKg === null) {
    return <Datum label="Weight · 28d" value="—" caption="No readings" />;
  }
  const delta = rollup.weightDelta28dKg;
  return (
    <Datum
      label="Weight · 28d"
      value={
        delta === null ? rollup.weightKg.toFixed(1) : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
      }
      unit="kg"
      caption={delta === null ? 'One reading so far' : `Now ${rollup.weightKg.toFixed(1)} kg`}
    />
  );
}

/**
 * Body: resting heart rate with HRV beside it when the watch is connected, otherwise the
 * morning read — the one signal every client has, watch or not.
 */
function BodyDatum({ rollup }: { rollup: RosterRollup }) {
  if (rollup.restingHr !== null) {
    return (
      <Datum
        label="Resting HR"
        value={String(Math.round(rollup.restingHr))}
        unit="bpm"
        caption={rollup.hrvMs !== null ? `HRV ${Math.round(rollup.hrvMs)} ms` : 'From Apple Health'}
      />
    );
  }
  if (rollup.readiness !== null) {
    const words = ['Depleted', 'Low', 'Okay', 'Good', 'Great'] as const;
    const color = [
      palette.status.critical,
      palette.status.serious,
      palette.status.warning,
      palette.status.good,
      palette.status.good,
    ][rollup.readiness]!;
    return (
      <Datum
        label="Latest read"
        value={words[rollup.readiness] ?? '—'}
        bar={<ScaleBar ratio={rollup.readiness / 4} color={color} />}
        caption="How she felt"
        captionColor={color}
      />
    );
  }
  return <Datum label="Body" value="—" caption="No reads or vitals yet" />;
}

/* ─────────────────────────────────────────────────────────────
 * Words
 * ───────────────────────────────────────────────────────────── */

function standingPill(rollup: RosterRollup): {
  tone: 'good' | 'warning' | 'critical';
  label: string;
} {
  if (rollup.standing === 'at_risk') return { tone: 'critical', label: 'At risk' };
  if (rollup.standing === 'watch') return { tone: 'warning', label: 'Watch' };
  return { tone: 'good', label: 'On track' };
}

function subtitle(client: RosterClient): string {
  const lead = client.condition ?? client.goal ?? 'No condition recorded';
  // The condition as the coach wrote it often already says "14 weeks postpartum".
  if (client.weeksPostpartum === null || /postpartum|post-partum|postnatal/i.test(lead))
    return lead;
  return `${lead} — ${client.weeksPostpartum} weeks postpartum`;
}

/** "Today", "Yesterday", "3 days ago" — the resolution a coach actually reads. */
export function sinceWords(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}
