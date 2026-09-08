import type { ClientReport, Exercise, ImportOutcome, Program, ProgramSummary } from './api.ts';

/**
 * Text for the assistant to read — and, through it, for the coach.
 *
 * Compact tables rather than JSON: a library of a hundred movements is something a model
 * scans for a name, and the fewer tokens that costs the more of the conversation is left
 * for the programme. Where a value is absent the column is simply blank.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatExercises(rows: Exercise[]): string {
  if (rows.length === 0) return 'No exercises matched.';
  const byCategory = new Map<string, Exercise[]>();
  for (const e of rows) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);

  const sections: string[] = [];
  for (const [category, list] of byCategory) {
    const lines = list.map((e) => {
      const extras = [
        e.equipment && e.equipment !== 'Bodyweight' ? e.equipment : '',
        e.isMine ? 'mine' : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `- ${e.name}${extras ? ` (${extras})` : ''}`;
    });
    sections.push(`${category}:\n${lines.join('\n')}`);
  }
  return `${rows.length} exercises. Use these names exactly.\n\n${sections.join('\n\n')}`;
}

export function formatProgramList(rows: ProgramSummary[], portalUrl: string): string {
  if (rows.length === 0) return 'No programmes yet.';
  const lines = rows.map(
    (p) =>
      `- ${p.name}${p.isTemplate ? ' [template]' : ''} — ${p.durationWeeks} wk, ${
        p.kind === 'descriptive' ? 'written programme' : `${p.dayCount} days, ${p.itemCount} items`
      } · id ${p.id} · ${portalUrl}/programs/${p.id}` +
      (p.description ? `\n  ${p.description}` : ''),
  );
  return lines.join('\n');
}

export function formatProgram(p: Program, portalUrl: string): string {
  const head = [
    `${p.name}${p.isTemplate ? ' [template]' : ''} — ${plural(p.durationWeeks, 'week')}`,
    p.description ?? '',
    `${portalUrl}/programs/${p.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (p.kind === 'descriptive') {
    return `${head}\n\nA written programme — the client reads this text as it is:\n\n${p.body ?? ''}`;
  }

  const days = p.days.map((d) => {
    const items = d.items.map((i) => {
      const parts = [
        `${i.block}. ${i.exerciseName}`,
        `${i.sets}×${i.reps}`,
        i.targetLoadKg !== null ? `${i.targetLoadKg} kg` : '',
        i.targetRpe !== null ? `RPE ${i.targetRpe}` : '',
        i.tempo ? `tempo ${i.tempo}` : '',
        `rest ${i.restSec}s`,
        i.notes ? `— ${i.notes}` : '',
        `item id ${i.id}`,
      ].filter(Boolean);
      return `  ${parts.join(' · ')}`;
    });
    return `Week ${d.weekNo}, day ${d.dayNo}: ${d.title} (${d.discipline}) · day id ${d.id}${d.notes ? `\n  ${d.notes}` : ''}\n${items.join('\n')}`;
  });

  return `${head}\n\n${days.join('\n\n')}`;
}

export function formatOutcome(
  outcome: ImportOutcome,
  portalUrl: string,
): { text: string; isError: boolean } {
  switch (outcome.kind) {
    case 'created': {
      const s = outcome.summary;
      return {
        isError: false,
        text:
          `Created: ${plural(s.weeks, 'week')}, ${plural(s.days, 'day')}, ${plural(s.items, 'item')}, ${plural(s.exercises, 'distinct exercise')}.\n` +
          `Open it: ${portalUrl}/programs/${outcome.id}\n` +
          `It is not assigned to anyone — the coach assigns it, with a start date, in the portal.`,
      };
    }
    case 'valid': {
      const s = outcome.summary;
      return {
        isError: false,
        text: `Valid. ${plural(s.weeks, 'week')}, ${plural(s.days, 'day')}, ${plural(s.items, 'item')}, ${plural(s.exercises, 'distinct exercise')} — every name matched the library. Nothing was created.`,
      };
    }
    case 'invalid':
      return {
        isError: true,
        text: `The programme did not validate:\n${outcome.errors.map((e) => `- ${e.message}`).join('\n')}`,
      };
    case 'unmatched':
      return {
        isError: true,
        text:
          `These exercises are not in the coach's library, so nothing was created:\n` +
          outcome.unmatched.map((n) => `- ${n}`).join('\n') +
          `\n\nCall list_exercises and use a name from it, or ask the coach to add the movement in Vela → Exercise library. Do not substitute a different exercise on her behalf.`,
      };
    case 'failed':
      return {
        isError: true,
        text: `The portal could not create the programme: ${outcome.message}`,
      };
  }
}

const READINESS = ['depleted', 'low', 'steady', 'good', 'strong'];

/** The report as a page the assistant can reason from: sections, one line per thing. */
export function formatReport(r: ClientReport): string {
  const c = r.client;
  const out: string[] = [];
  out.push(
    `${c.name} — ${c.status}, ${c.weeksPostpartum ?? '?'} weeks postpartum${c.deliveryType ? `, ${c.deliveryType} delivery` : ''}${c.breastfeeding ? ', breastfeeding' : ''}.` +
      (c.goal ? ` Goal: ${c.goal}.` : '') +
      (c.condition ? ` Condition: ${c.condition}.` : '') +
      ` Window ${r.window.from} → ${r.window.to}.`,
  );

  out.push(
    `\nPROGRAMME: ` +
      (r.programme
        ? `${r.programme.name} (${r.programme.kind === 'descriptive' ? 'written' : 'days of exercises'}, ${r.programme.durationWeeks} wk from ${r.programme.startDate}, id ${r.programme.id})`
        : 'none assigned'),
  );
  if (r.programme?.kind === 'descriptive' && r.programme.body) out.push(indent(r.programme.body));

  out.push('\nWEEKLY PLANS:');
  out.push(
    r.weeklyPlans.length
      ? r.weeklyPlans.map((p) => `- week of ${p.weekStart}:\n${indent(p.body)}`).join('\n')
      : '  none yet',
  );

  out.push(
    `\nADHERENCE: last 7 days ${r.adherence.last7.completed}/${r.adherence.last7.due} prescribed sessions done · last ${r.window.days} days ${r.adherence.last28.completed}/${r.adherence.last28.due}`,
  );

  out.push('\nSESSIONS (prescribed and recorded; pain 0–10 before → after; RPE 1–10):');
  out.push(
    r.sessions.length
      ? r.sessions
          .map(
            (s) =>
              `- ${s.scheduledDate} ${s.title} (${s.discipline}) — ${s.status}` +
              (s.setsDone !== null || s.setsPlanned !== null
                ? `, sets ${s.setsDone ?? '?'}/${s.setsPlanned ?? '?'}`
                : '') +
              (s.painBefore !== null || s.painAfter !== null
                ? `, pain ${s.painBefore ?? '?'} → ${s.painAfter ?? '?'}`
                : '') +
              (s.sessionRpe !== null ? `, RPE ${s.sessionRpe}` : '') +
              (s.durationSec ? `, ${Math.round(s.durationSec / 60)} min` : '') +
              (s.loggedVia !== 'app' ? `, via ${s.loggedVia}` : '') +
              ` · id ${s.id}`,
          )
          .join('\n')
      : '  none in the window',
  );

  out.push('\nDAILY READS (readiness 0 depleted … 4 strong; symptom flags):');
  out.push(
    r.reads.length
      ? r.reads
          .map(
            (d) =>
              `- ${d.readOn} ${d.window}: ${READINESS[d.readiness] ?? d.readiness}${d.symptom && d.symptom !== 'Nothing' ? ` · ${d.symptom}` : ''}`,
          )
          .join('\n')
      : '  none in the window',
  );

  out.push('\nHRV THROUGH THE DECISION TREE:');
  out.push(
    r.hrv
      ? `  ${r.hrv.advice}\n  ${r.hrv.summary} · stance: ${r.hrv.stance}\n  Client sees: "${r.hrv.note}"`
      : '  not enough HRV mornings to read the week against her range yet',
  );

  out.push('\nVITALS BY DAY (day: value):');
  const labels: Record<string, string> = {
    hrv_ms: 'HRV ms',
    resting_hr: 'resting HR bpm',
    respiratory_rate: 'breathing /min',
    sleep_min: 'sleep min',
    sleep_deep_min: 'deep min',
    sleep_rem_min: 'REM min',
    sleep_awake_min: 'awake min',
    weight_kg: 'weight kg',
    steps: 'steps',
    cardio_load: 'cardio load',
    active_energy_kcal: 'active kcal',
  };
  for (const [key, label] of Object.entries(labels)) {
    const series = r.vitals[key] ?? [];
    if (series.length === 0) continue;
    out.push(`  ${label}: ` + series.map((v) => `${v.day.slice(5)}: ${round(v.value)}`).join(', '));
  }

  out.push('\nRECORDED ACTIVITIES:');
  out.push(
    r.activities.length
      ? r.activities
          .map(
            (a) =>
              `- ${a.localDate} ${a.name} (${a.sportType}) — ${Math.round(a.movingSec / 60)} min` +
              (a.distanceM ? `, ${(a.distanceM / 1000).toFixed(1)} km` : '') +
              (a.avgHr ? `, avg HR ${Math.round(a.avgHr)}` : '') +
              (a.avgCadence ? `, cadence ${Math.round(a.avgCadence)}` : '') +
              (a.avgWatts ? `, ${Math.round(a.avgWatts)} W` : ''),
          )
          .join('\n')
      : '  none in the window',
  );

  out.push('\nMEALS BY DAY (kcal / protein g, entries, target):');
  out.push(
    r.nutrition.length
      ? r.nutrition
          .map(
            (n) =>
              `- ${n.day}: ${Math.round(n.kcal)} kcal / ${Math.round(n.proteinG)} g, ${n.entries} logged${n.targetKcal ? `, target ${Math.round(n.targetKcal)}` : ''}`,
          )
          .join('\n')
      : '  nothing logged',
  );

  out.push('\nLAST MESSAGES:');
  out.push(
    r.messages.length
      ? r.messages.map((m) => `- ${m.createdAt.slice(0, 10)} ${m.sender}: ${m.body}`).join('\n')
      : '  none',
  );
  return out.join('\n');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n');
}

function round(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
