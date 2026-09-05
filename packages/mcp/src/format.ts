import type { Exercise, ImportOutcome, Program, ProgramSummary } from './api.ts';

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
      `- ${p.name}${p.isTemplate ? ' [template]' : ''} — ${p.durationWeeks} wk, ${p.dayCount} days, ${p.itemCount} items · id ${p.id} · ${portalUrl}/programs/${p.id}` +
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
      ].filter(Boolean);
      return `  ${parts.join(' · ')}`;
    });
    return `Week ${d.weekNo}, day ${d.dayNo}: ${d.title} (${d.discipline})${d.notes ? `\n  ${d.notes}` : ''}\n${items.join('\n')}`;
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
