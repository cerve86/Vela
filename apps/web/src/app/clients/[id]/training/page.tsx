import { notFound } from 'next/navigation';
import {
  clientById,
  estimateOneRepMax,
  exerciseById,
  sessionsByClient,
  setLogsByClient,
  volumeLoad,
} from '@coachapp/shared';
import { Card, PainDot, StatusPill } from '@/components/ui';
import { TimeSeriesPanels } from '@/components/charts';
import { dateWindow } from '@/lib/series';
import type { Panel, Point } from '@/components/charts';

export default async function TrainingTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!clientById.get(id)) notFound();

  const sessions = sessionsByClient.get(id) ?? [];
  const logs = setLogsByClient.get(id) ?? [];
  const xLabels = dateWindow(56);

  // Estimated 1RM progression for the three most-trained exercises. Colour follows the
  // exercise, never its rank, so filtering the list never repaints the survivors.
  const byExercise = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = byExercise.get(l.exerciseId);
    if (arr) arr.push(l);
    else byExercise.set(l.exerciseId, [l]);
  }
  const top = [...byExercise.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);

  const sessionDate = new Map(sessions.map((s) => [s.id, s.scheduledDate]));

  const e1rmPanel: Panel = {
    id: 'e1rm',
    label: 'Estimated 1RM (kg)',
    height: 220,
    format: { style: 'fixed', decimals: 0 },
    series: top.map(([exId, entries], i) => {
      const best = new Map<string, number>();
      for (const l of entries) {
        const d = sessionDate.get(l.sessionId);
        if (!d) continue;
        const e = estimateOneRepMax(l.weightKg, l.reps);
        if (e === null) continue;
        best.set(d, Math.max(best.get(d) ?? 0, e));
      }
      const points: Point[] = xLabels.map((d) => ({ x: d, y: best.get(d) ?? null }));
      return {
        id: exId,
        label: exerciseById.get(exId)?.name ?? exId,
        color: `var(--series-${i + 1})`,
        kind: 'line' as const,
        points,
        // An exercise is trained a few days a week, not daily — join consecutive
        // sessions rather than drawing orphaned two-point stubs.
        connectGaps: true,
      };
    }),
  };

  const completed = sessions.filter((s) => s.status === 'completed').slice(-10).reverse();
  const logsBySession = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = logsBySession.get(l.sessionId);
    if (arr) arr.push(l);
    else logsBySession.set(l.sessionId, [l]);
  }

  return (
    <div className="space-y-4">
      <Card
        title="Strength progression"
        action={<span className="text-xs ink-3">Last 8 weeks · Epley estimate</span>}
      >
        <TimeSeriesPanels xLabels={xLabels} panels={[e1rmPanel]} />
        <p className="mt-2 text-xs ink-3">
          Sets above 12 reps are excluded — the Epley estimate stops being trustworthy there,
          and a gap in the line is more honest than a fabricated point.
        </p>
      </Card>

      <Card title="Session history">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Session</th>
                <th className="pb-2 font-medium">Sets</th>
                <th className="pb-2 font-medium">Volume</th>
                <th className="pb-2 font-medium">Session RPE</th>
                <th className="pb-2 font-medium">Pain before</th>
                <th className="pb-2 font-medium">Pain after</th>
                <th className="pb-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((s) => {
                const sl = logsBySession.get(s.id) ?? [];
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="tnum py-2.5">
                      {new Date(`${s.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td className="py-2.5 font-medium">{s.title}</td>
                    <td className="tnum py-2.5">{sl.length}</td>
                    <td className="tnum py-2.5">{Math.round(volumeLoad(sl)).toLocaleString('en-GB')} kg</td>
                    <td className="tnum py-2.5">{s.sessionRpe ?? '—'}</td>
                    <td className="py-2.5">
                      <PainDot score={s.painBefore} />
                    </td>
                    <td className="py-2.5">
                      <PainDot score={s.painAfter} />
                    </td>
                    <td className="tnum py-2.5">
                      {s.durationSec ? `${Math.round(s.durationSec / 60)} min` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Assigned program" action={<StatusPill tone="neutral">Phase 2</StatusPill>}>
        <p className="text-sm ink-2">
          The program builder lands in Phase 2. This tab will show the assigned block, the
          prescription for each day, and how the logged work compared against it.
        </p>
      </Card>
    </div>
  );
}
