import { normaliseExerciseName, type Discipline, type ImportedProgramInput } from '@vela/api';
import type { ImportProgram } from '@vela/shared';

/**
 * The validated import with exercise names swapped for library ids — what the writer wants.
 *
 * Lives here rather than beside the server actions because a `'use server'` module may
 * export only async actions, and both the upload form's action and the JSON route need
 * this same mapping. The `!` is honest: callers resolve names first and refuse to reach
 * this with an unmatched one, so a miss here is a bug, not a user error.
 */
export function toWrite(program: ImportProgram, byName: Map<string, string>): ImportedProgramInput {
  return {
    name: program.name,
    description: program.description,
    isTemplate: program.isTemplate,
    days: program.days.map((d) => ({
      weekNo: d.weekNo,
      dayNo: d.dayNo,
      title: d.title,
      discipline: d.discipline as Discipline,
      items: d.items.map((i) => ({
        exerciseId: byName.get(normaliseExerciseName(i.exercise))!,
        block: i.block,
        sets: i.sets,
        reps: i.reps,
        targetLoadKg: i.loadKg,
        targetRpe: i.rpe,
        tempo: i.tempo,
        restSec: i.restSec,
        notes: i.notes,
      })),
    })),
  };
}
