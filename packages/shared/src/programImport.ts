import { z } from 'zod';

/**
 * Importing a programme from a spreadsheet, or from JSON.
 *
 * Everything here is pure: rows in, a validated programme or a list of errors out. The
 * portal's upload form and the JSON endpoint both come through this file, so a coach who
 * fixes a spreadsheet and a script that posts JSON are held to exactly the same rules —
 * the ones the database enforces, stated before the database has to.
 *
 * The spreadsheet shape is one row per prescribed movement:
 *
 *   Week | Day | Day title | Discipline | Block | Exercise | Sets | Reps | Load (kg) | RPE | Tempo | Rest (s) | Notes
 *
 * Week and Day may be left blank on a row to mean "same as the row above", which is how
 * people actually fill these in. Exercises are matched to the library by name on the way
 * in; this file never sees an id.
 */

export const IMPORT_DISCIPLINES = ['strength', 'run', 'mobility', 'rehab'] as const;
export type ImportDiscipline = (typeof IMPORT_DISCIPLINES)[number];

/* ─────────────────────────────────────────────────────────────
 * The validated shape — also the JSON API's request body
 * ───────────────────────────────────────────────────────────── */

export const importItemSchema = z.object({
  /** Library name, matched case-insensitively. Not an id: the caller does not know ids. */
  exercise: z.string().trim().min(1, 'Exercise is required').max(120),
  block: z.string().trim().min(1).max(4).default('A'),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1, 'Reps is required').max(40),
  loadKg: z.number().min(0).max(1000).nullable().default(null),
  rpe: z.number().min(1).max(10).nullable().default(null),
  tempo: z.string().trim().max(20).nullable().default(null),
  restSec: z.number().int().min(0).max(900).default(60),
  notes: z.string().trim().max(500).nullable().default(null),
});

export const importDaySchema = z.object({
  weekNo: z.number().int().min(1).max(52),
  dayNo: z.number().int().min(1).max(7),
  title: z.string().trim().min(1).max(80),
  discipline: z.enum(IMPORT_DISCIPLINES).default('strength'),
  items: z.array(importItemSchema).min(1, 'A day needs at least one movement'),
});

export const importProgramSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the programme a name').max(120),
    description: z.string().trim().max(500).optional(),
    isTemplate: z.boolean().default(false),
    days: z.array(importDaySchema).min(1, 'A programme needs at least one day'),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.days.forEach((d, i) => {
      const key = `${d.weekNo}:${d.dayNo}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['days', i],
          message: `Week ${d.weekNo} day ${d.dayNo} appears twice`,
        });
      }
      seen.add(key);
    });
  });

export type ImportItem = z.infer<typeof importItemSchema>;
export type ImportDay = z.infer<typeof importDaySchema>;
export type ImportProgram = z.infer<typeof importProgramSchema>;
/** What a caller may send: defaults not yet applied. */
export type ImportProgramInput = z.input<typeof importProgramSchema>;

/* ─────────────────────────────────────────────────────────────
 * Spreadsheet cells → rows
 * ───────────────────────────────────────────────────────────── */

/** What a spreadsheet reader hands over. Dates arrive as Dates, which matters — see reps. */
export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export type ImportColumn =
  | 'week'
  | 'day'
  | 'title'
  | 'discipline'
  | 'block'
  | 'exercise'
  | 'sets'
  | 'reps'
  | 'loadKg'
  | 'rpe'
  | 'tempo'
  | 'restSec'
  | 'notes';

/**
 * Header spellings accepted for each column, after normalisation.
 *
 * Generous on purpose. A coach's spreadsheet was written for her, not for this parser,
 * and "Load (kg)", "kg" and "Weight" all mean the same thing. What is not accepted is
 * ambiguity: "name" is an exercise name here, never a day title, because a template
 * with both would need one of them to lose.
 */
const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  week: ['week', 'wk', 'week no', 'week number'],
  day: ['day', 'day no', 'day number', 'session', 'session no'],
  title: ['day title', 'title', 'session title', 'session name', 'day name'],
  discipline: ['discipline', 'type', 'kind', 'session type'],
  block: ['block', 'superset', 'group'],
  exercise: ['exercise', 'movement', 'exercise name', 'name'],
  sets: ['sets', 'set'],
  reps: ['reps', 'rep', 'repetitions', 'reps or time', 'reps time', 'dose'],
  loadKg: ['load', 'load kg', 'load (kg)', 'kg', 'weight', 'weight kg', 'weight (kg)'],
  rpe: ['rpe', 'target rpe', 'effort', 'intensity'],
  tempo: ['tempo'],
  restSec: ['rest', 'rest s', 'rest (s)', 'rest sec', 'rest secs', 'rest seconds', 'rest (sec)'],
  notes: ['notes', 'note', 'cues', 'cue', 'comment', 'comments', 'coaching notes'],
};

const REQUIRED_COLUMNS: ImportColumn[] = ['week', 'day', 'exercise', 'sets', 'reps'];

/** Lower-case, one space between words, nothing but letters, digits and brackets. */
function normaliseHeader(h: SpreadsheetCell): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, ' ')
    .trim();
}

export type HeaderMap = Partial<Record<ImportColumn, number>>;

/**
 * Which column holds what.
 *
 * Every alias is tried against every header; the first header to match a column wins
 * it. A missing required column is reported by name with the aliases that would have
 * satisfied it, because "column not found" sends someone back to guess.
 */
export function mapHeaders(headers: SpreadsheetCell[]): { ok: true; map: HeaderMap } | { ok: false; errors: string[] } {
  const norm = headers.map(normaliseHeader);
  const map: HeaderMap = {};

  for (const column of Object.keys(HEADER_ALIASES) as ImportColumn[]) {
    const idx = norm.findIndex((h) => HEADER_ALIASES[column].includes(h));
    if (idx >= 0) map[column] = idx;
  }

  const missing = REQUIRED_COLUMNS.filter((c) => map[c] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      errors: missing.map(
        (c) => `Missing a "${HEADER_ALIASES[c][0]}" column (also accepted: ${HEADER_ALIASES[c].slice(1).join(', ')})`,
      ),
    };
  }
  return { ok: true, map };
}

/* ─────────────────────────────────────────────────────────────
 * Cell parsing
 * ───────────────────────────────────────────────────────────── */

const isBlank = (v: SpreadsheetCell) => v === null || v === undefined || String(v).trim() === '';

function text(v: SpreadsheetCell): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
}

/**
 * A number out of whatever was typed: 32.5, "32,5", "32.5 kg", " 7 ". Null for the
 * things that mean "none" — blank, a dash, "bw", "bodyweight".
 */
function parseNumber(v: SpreadsheetCell): number | null | 'invalid' {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 'invalid';
  if (v instanceof Date) return 'invalid';
  const s = text(v).toLowerCase();
  if (s === '' || s === '-' || s === '—' || s === 'bw' || s === 'bodyweight' || s === 'n/a') return null;
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return 'invalid';
  return Number(m[0].replace(',', '.'));
}

/**
 * Seconds out of the ways people write rest: 90, "90", "90s", "90 sec", "1:30", "2 min",
 * "1.5min". Blank means the default.
 */
function parseSeconds(v: SpreadsheetCell): number | null | 'invalid' {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 'invalid';
  if (v instanceof Date) return 'invalid';
  const s = text(v).toLowerCase().replace(/\s+/g, '');
  if (s === '' || s === '-') return null;
  const clock = s.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const mins = s.match(/^(\d+(?:[.,]\d+)?)(?:m|min|mins|minute|minutes)$/);
  if (mins) return Math.round(Number(mins[1]!.replace(',', '.')) * 60);
  const secs = s.match(/^(\d+(?:[.,]\d+)?)(?:s|sec|secs|second|seconds)?$/);
  if (secs) return Math.round(Number(secs[1]!.replace(',', '.')));
  return 'invalid';
}

const DISCIPLINE_ALIASES: Record<string, ImportDiscipline> = {
  strength: 'strength',
  lifting: 'strength',
  weights: 'strength',
  gym: 'strength',
  resistance: 'strength',
  run: 'run',
  running: 'run',
  cardio: 'run',
  conditioning: 'run',
  intervals: 'run',
  mobility: 'mobility',
  stretch: 'mobility',
  stretching: 'mobility',
  flexibility: 'mobility',
  yoga: 'mobility',
  rehab: 'rehab',
  physio: 'rehab',
  rehabilitation: 'rehab',
  'pelvic floor': 'rehab',
  pelvic: 'rehab',
  core: 'rehab',
  breath: 'rehab',
  breathing: 'rehab',
};

function parseDiscipline(v: SpreadsheetCell): ImportDiscipline | null | 'invalid' {
  const s = normaliseHeader(v);
  if (s === '') return null;
  return DISCIPLINE_ALIASES[s] ?? 'invalid';
}

/* ─────────────────────────────────────────────────────────────
 * Rows → days
 * ───────────────────────────────────────────────────────────── */

export interface ImportRowError {
  /** 1-based spreadsheet row, header counted as row 1 — the number she sees in Excel. */
  row: number;
  message: string;
}

export type ParsedRows =
  | { ok: true; days: ImportDay[]; rowsRead: number }
  | { ok: false; errors: ImportRowError[] };

/**
 * Data rows into days, every error collected rather than the first one thrown.
 *
 * A spreadsheet with six mistakes should come back with six messages and six row numbers,
 * not one message six times. Rows are grouped by (week, day) in the order they first
 * appear; a blank week or day repeats the row above; a day's title and discipline come
 * from the first row that states them.
 *
 * The one cell that gets special treatment is reps. Excel turns "8-10" into the tenth of
 * August the moment it is typed, and the parser receives a Date. Rather than importing a
 * date as a rep range, that row is refused with the fix spelled out.
 */
export function parseProgramRows(headers: SpreadsheetCell[], rows: SpreadsheetCell[][]): ParsedRows {
  const mapped = mapHeaders(headers);
  if (!mapped.ok) return { ok: false, errors: mapped.errors.map((message) => ({ row: 1, message })) };
  const col = mapped.map;

  const cell = (r: SpreadsheetCell[], c: ImportColumn): SpreadsheetCell =>
    col[c] === undefined ? undefined : r[col[c]!];

  const errors: ImportRowError[] = [];
  const days = new Map<string, ImportDay>();
  // Which days have had their title or discipline stated, as opposed to defaulted. The
  // first row to state one wins; a later row cannot rename a day, but can fill a blank.
  const titleStated = new Set<string>();
  const disciplineStated = new Set<string>();
  let lastWeek: number | null = null;
  let lastDay: number | null = null;
  let rowsRead = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    if (!r || r.every(isBlank)) return;
    rowsRead++;

    const fail = (message: string) => errors.push({ row: rowNo, message });

    // Week and day, carried forward when blank.
    let weekNo = lastWeek;
    let dayNo = lastDay;
    const weekCell = cell(r, 'week');
    const dayCell = cell(r, 'day');
    if (!isBlank(weekCell)) {
      const n = parseNumber(weekCell);
      if (n === 'invalid' || n === null || !Number.isInteger(n) || n < 1 || n > 52) fail(`Week must be a whole number from 1 to 52, not "${text(weekCell)}"`);
      else weekNo = n;
    }
    if (!isBlank(dayCell)) {
      const n = parseNumber(dayCell);
      if (n === 'invalid' || n === null || !Number.isInteger(n) || n < 1 || n > 7) fail(`Day must be a whole number from 1 to 7, not "${text(dayCell)}"`);
      else dayNo = n;
    }
    if (weekNo === null) fail('Week is blank and there is no row above to take it from');
    if (dayNo === null) fail('Day is blank and there is no row above to take it from');
    // A new week without a day is a common slip; do not silently reuse the old day.
    if (!isBlank(weekCell) && isBlank(dayCell) && lastWeek !== null && weekNo !== lastWeek) {
      fail('A new week needs its day stated');
    }

    const exercise = text(cell(r, 'exercise'));
    if (!exercise) fail('Exercise is blank');

    const setsN = parseNumber(cell(r, 'sets'));
    if (setsN === 'invalid' || setsN === null || !Number.isInteger(setsN) || setsN < 1 || setsN > 20) {
      fail(`Sets must be a whole number from 1 to 20, not "${text(cell(r, 'sets'))}"`);
    }

    const repsCell = cell(r, 'reps');
    let reps = '';
    if (repsCell instanceof Date) {
      fail('Reps became a date — Excel read "8-10" as the 10th of August. Format the Reps column as Text, or write "8 to 10"');
    } else if (typeof repsCell === 'number') {
      reps = String(repsCell);
    } else {
      reps = text(repsCell);
      if (!reps) fail('Reps is blank');
    }

    const load = parseNumber(cell(r, 'loadKg'));
    if (load === 'invalid') fail(`Load must be a number in kg, not "${text(cell(r, 'loadKg'))}"`);
    else if (load !== null && (load < 0 || load > 1000)) fail(`Load ${load} kg is outside 0–1000`);

    const rpe = parseNumber(cell(r, 'rpe'));
    if (rpe === 'invalid') fail(`RPE must be a number from 1 to 10, not "${text(cell(r, 'rpe'))}"`);
    else if (rpe !== null && (rpe < 1 || rpe > 10)) fail(`RPE ${rpe} is outside 1–10`);

    const rest = parseSeconds(cell(r, 'restSec'));
    if (rest === 'invalid') fail(`Rest must be seconds, like 60, 90s or 1:30, not "${text(cell(r, 'restSec'))}"`);
    else if (rest !== null && (rest < 0 || rest > 900)) fail(`Rest ${rest}s is outside 0–900`);

    const discipline = parseDiscipline(cell(r, 'discipline'));
    if (discipline === 'invalid') {
      fail(`Discipline "${text(cell(r, 'discipline'))}" is not one of ${IMPORT_DISCIPLINES.join(', ')}`);
    }

    if (weekNo === null || dayNo === null) return;
    lastWeek = weekNo;
    lastDay = dayNo;
    if (errors.some((e) => e.row === rowNo)) return;

    // Past this point every cell has been checked, so an 'invalid' cannot reach the day.
    // The narrowing is spelled out because the checks above record errors rather than
    // narrowing, and the type system has no way of knowing they cover every case.
    if (load === 'invalid' || rpe === 'invalid' || rest === 'invalid' || discipline === 'invalid') return;

    const key = `${weekNo}:${dayNo}`;
    let day = days.get(key);
    if (!day) {
      day = { weekNo, dayNo, title: `Day ${dayNo}`, discipline: 'strength', items: [] };
      days.set(key, day);
    }
    const title = text(cell(r, 'title'));
    if (title && !titleStated.has(key)) {
      day.title = title;
      titleStated.add(key);
    }
    if (discipline && !disciplineStated.has(key)) {
      day.discipline = discipline;
      disciplineStated.add(key);
    }

    day.items.push({
      exercise,
      block: text(cell(r, 'block')).toUpperCase() || 'A',
      sets: setsN as number,
      reps,
      loadKg: load,
      rpe,
      tempo: text(cell(r, 'tempo')) || null,
      restSec: rest ?? 60,
      notes: text(cell(r, 'notes')) || null,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  if (days.size === 0) return { ok: false, errors: [{ row: 2, message: 'No rows with data were found under the header' }] };

  // The schema is the same one the JSON route uses; running it here means the two doors
  // cannot drift. Anything it rejects at this point is a bug in the parser, not the file.
  const parsed = z.array(importDaySchema).safeParse([...days.values()]);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((iss) => ({ row: 0, message: `${iss.path.join('.')}: ${iss.message}` })),
    };
  }

  return { ok: true, days: parsed.data, rowsRead };
}

/* ─────────────────────────────────────────────────────────────
 * CSV
 * ───────────────────────────────────────────────────────────── */

/**
 * A CSV into cells. Handles quoted fields, doubled quotes, CR LF, a byte-order mark, and
 * the semicolon delimiter that Excel writes in most of Europe — which is the case that
 * makes a naive `split(',')` return one column and a baffled coach.
 */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^﻿/, '');
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i]!;
    if (quoted) {
      if (ch === '"') {
        if (textIn[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textIn[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** The weeks a set of days spans — what `duration_weeks` is set to. */
export function importedWeeks(days: ImportDay[]): number {
  return Math.max(1, ...days.map((d) => d.weekNo));
}

/** One-line summary for a preview or an API response. */
export function summariseImport(days: ImportDay[]): { weeks: number; days: number; items: number; exercises: number } {
  const names = new Set(days.flatMap((d) => d.items.map((i) => i.exercise.toLowerCase())));
  return {
    weeks: importedWeeks(days),
    days: days.length,
    items: days.reduce((n, d) => n + d.items.length, 0),
    exercises: names.size,
  };
}
