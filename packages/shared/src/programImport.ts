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

export const IMPORT_DISCIPLINES = ['strength', 'run', 'mobility', 'rehab', 'cross'] as const;
export type ImportDiscipline = (typeof IMPORT_DISCIPLINES)[number];

/* ─────────────────────────────────────────────────────────────
 * The validated shape — also the JSON API's request body
 * ───────────────────────────────────────────────────────────── */

// The `.describe()` strings are not decoration: the MCP server publishes this shape as
// its tool schema, so they are the field documentation an assistant reads before it
// drafts a programme. Write them for that reader.
export const importItemSchema = z.object({
  /** Library name, matched case-insensitively. Not an id: the caller does not know ids. */
  exercise: z
    .string()
    .trim()
    .min(1, 'Exercise is required')
    .max(120)
    .describe('Exact library name. Matching ignores case, spacing and hyphens; nothing else.'),
  block: z
    .string()
    .trim()
    .min(1)
    .max(4)
    .default('A')
    .describe('Block letter. Items in a day sharing a letter are performed as a superset.'),
  sets: z.number().int().min(1).max(20).describe('Working sets, 1–20.'),
  reps: z
    .string()
    .trim()
    .min(1, 'Reps is required')
    .max(40)
    .describe('Free text: "8-10", "AMRAP", "30s", "8 each side".'),
  loadKg: z
    .number()
    .min(0)
    .max(1000)
    .nullable()
    .default(null)
    .describe('Target load in kg, or null.'),
  rpe: z.number().min(1).max(10).nullable().default(null).describe('Target RPE 1–10, or null.'),
  tempo: z.string().trim().max(20).nullable().default(null).describe('e.g. "3-1-1", or null.'),
  restSec: z
    .number()
    .int()
    .min(0)
    .max(900)
    .default(60)
    .describe('Rest after the set, seconds. Default 60.'),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .default(null)
    .describe('Coaching cue for this item, or null.'),
});

export const importDayShape = {
  weekNo: z.number().int().min(1).max(52).describe('Week of the programme, from 1.'),
  dayNo: z
    .number()
    .int()
    .min(1)
    .max(7)
    .describe('Order within the week, 1–7 — not a weekday. The start date decides the calendar.'),
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('e.g. "Lower body strength", "Easy run + mobility".'),
  discipline: z
    .enum(IMPORT_DISCIPLINES)
    .default('strength')
    .describe('strength | run | mobility | rehab | cross. Default strength.'),
  notes: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .default(null)
    .describe(
      'What to do that day, in words — the prescription for a run or a session with no listed movements. Shown to the client above the movements.',
    ),
  items: z
    .array(importItemSchema)
    .describe('The movements. May be empty when notes say what the day is.'),
};

export const importDaySchema = z.object(importDayShape).superRefine((d, ctx) => {
  if (d.items.length === 0 && !d.notes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'A day needs at least one movement, or a note saying what to do',
    });
  }
});

/**
 * The programme, before the cross-field check. Exported as a raw shape because the MCP
 * server needs the fields themselves to publish a tool schema; the refined
 * `importProgramSchema` is what actually validates a body.
 */
export const importProgramShape = {
  name: z
    .string()
    .trim()
    .min(2, 'Give the programme a name')
    .max(120)
    .describe('Programme name, 2–120 characters.'),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe('One or two sentences on the aim of the block.'),
  isTemplate: z
    .boolean()
    .default(false)
    .describe('true saves a reusable template rather than a programme for one client.'),
  days: z
    .array(importDaySchema)
    .min(1, 'A programme needs at least one day')
    .describe('Every training day. Each week/day pair must appear once.'),
};

export const importProgramSchema = z.object(importProgramShape).superRefine((p, ctx) => {
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
export function normaliseHeader(h: SpreadsheetCell): string {
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
export function mapHeaders(
  headers: SpreadsheetCell[],
): { ok: true; map: HeaderMap } | { ok: false; errors: string[] } {
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
        (c) =>
          `Missing a "${HEADER_ALIASES[c][0]}" column (also accepted: ${HEADER_ALIASES[c].slice(1).join(', ')})`,
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
  if (s === '' || s === '-' || s === '—' || s === 'bw' || s === 'bodyweight' || s === 'n/a')
    return null;
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
  cross: 'cross',
  'cross training': 'cross',
  bike: 'cross',
  cycling: 'cross',
  spin: 'cross',
  swim: 'cross',
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
  { ok: true; days: ImportDay[]; rowsRead: number } | { ok: false; errors: ImportRowError[] };

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
export function parseProgramRows(
  headers: SpreadsheetCell[],
  rows: SpreadsheetCell[][],
): ParsedRows {
  const mapped = mapHeaders(headers);
  if (!mapped.ok)
    return { ok: false, errors: mapped.errors.map((message) => ({ row: 1, message })) };
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
      if (n === 'invalid' || n === null || !Number.isInteger(n) || n < 1 || n > 52)
        fail(`Week must be a whole number from 1 to 52, not "${text(weekCell)}"`);
      else weekNo = n;
    }
    if (!isBlank(dayCell)) {
      const n = parseNumber(dayCell);
      if (n === 'invalid' || n === null || !Number.isInteger(n) || n < 1 || n > 7)
        fail(`Day must be a whole number from 1 to 7, not "${text(dayCell)}"`);
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
    if (
      setsN === 'invalid' ||
      setsN === null ||
      !Number.isInteger(setsN) ||
      setsN < 1 ||
      setsN > 20
    ) {
      fail(`Sets must be a whole number from 1 to 20, not "${text(cell(r, 'sets'))}"`);
    }

    const repsCell = cell(r, 'reps');
    let reps = '';
    if (repsCell instanceof Date) {
      fail(
        'Reps became a date — Excel read "8-10" as the 10th of August. Format the Reps column as Text, or write "8 to 10"',
      );
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
    if (rest === 'invalid')
      fail(`Rest must be seconds, like 60, 90s or 1:30, not "${text(cell(r, 'restSec'))}"`);
    else if (rest !== null && (rest < 0 || rest > 900)) fail(`Rest ${rest}s is outside 0–900`);

    const discipline = parseDiscipline(cell(r, 'discipline'));
    if (discipline === 'invalid') {
      fail(
        `Discipline "${text(cell(r, 'discipline'))}" is not one of ${IMPORT_DISCIPLINES.join(', ')}`,
      );
    }

    if (weekNo === null || dayNo === null) return;
    lastWeek = weekNo;
    lastDay = dayNo;
    if (errors.some((e) => e.row === rowNo)) return;

    // Past this point every cell has been checked, so an 'invalid' cannot reach the day.
    // The narrowing is spelled out because the checks above record errors rather than
    // narrowing, and the type system has no way of knowing they cover every case.
    if (load === 'invalid' || rpe === 'invalid' || rest === 'invalid' || discipline === 'invalid')
      return;

    const key = `${weekNo}:${dayNo}`;
    let day = days.get(key);
    if (!day) {
      day = {
        weekNo,
        dayNo,
        title: `Day ${dayNo}`,
        discipline: 'strength',
        notes: null,
        items: [],
      };
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
  if (days.size === 0)
    return {
      ok: false,
      errors: [{ row: 2, message: 'No rows with data were found under the header' }],
    };

  // The schema is the same one the JSON route uses; running it here means the two doors
  // cannot drift. Anything it rejects at this point is a bug in the parser, not the file.
  const parsed = z.array(importDaySchema).safeParse([...days.values()]);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((iss) => ({
        row: 0,
        message: `${iss.path.join('.')}: ${iss.message}`,
      })),
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
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

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
export function summariseImport(days: ImportDay[]): {
  weeks: number;
  days: number;
  items: number;
  exercises: number;
} {
  const names = new Set(days.flatMap((d) => d.items.map((i) => i.exercise.toLowerCase())));
  return {
    weeks: importedWeeks(days),
    days: days.length,
    items: days.reduce((n, d) => n + d.items.length, 0),
    exercises: names.size,
  };
}

/* ═════════════════════════════════════════════════════════════
 * Plan sheets — one row per dated session
 * ═════════════════════════════════════════════════════════════ */

/**
 * Importing a plan sheet: one row per session, dated, for one athlete.
 *
 * The other spreadsheet shape (`programImport.ts`) is one row per movement, which is how
 * a strength block is written. A physiotherapist's weekly plan is not written that way.
 * It is a calendar: this date, this session, this long, and a sentence on what to do —
 *
 *   athlete_email | date | phase | week_number | title | type | planned_min | planned_km |
 *   vert_m | fuel_carbs_g_per_h | notes
 *
 * — the export a planning assistant produces. Every row becomes a day of a programme:
 * the date fixes the week and weekday, the title and type name the session, and the
 * notes are kept whole as the day's prescription. Where the notes name a movement with a
 * dose ("Dead bug hip thrust 3 x 12 per side") it is also lifted out as an item, so a
 * rehab set is tickable in the app; the sentence stays as written either way.
 *
 * Several rows may share a date. The longest session is the day; the rest are folded
 * into its notes under their own titles. A rest row on its own makes no day at all.
 */

export type PlanColumn =
  | 'athleteEmail'
  | 'date'
  | 'phase'
  | 'week'
  | 'title'
  | 'type'
  | 'plannedMin'
  | 'plannedKm'
  | 'vertM'
  | 'fuelCarbs'
  | 'notes';

const PLAN_ALIASES: Record<PlanColumn, string[]> = {
  athleteEmail: ['athlete email', 'athlete', 'email', 'client email', 'client'],
  date: ['date', 'day date', 'session date', 'scheduled', 'when'],
  phase: ['phase', 'block', 'mesocycle'],
  week: ['week number', 'week', 'wk', 'week no'],
  title: ['title', 'session', 'session title', 'session name', 'name', 'workout'],
  type: ['type', 'session type', 'discipline', 'kind', 'category'],
  plannedMin: [
    'planned min',
    'planned minutes',
    'minutes',
    'min',
    'duration',
    'duration min',
    'time',
  ],
  plannedKm: ['planned km', 'km', 'distance', 'distance km'],
  vertM: ['vert m', 'vert', 'climb', 'elevation', 'elevation m', 'ascent'],
  fuelCarbs: ['fuel carbs g per h', 'carbs g per h', 'fuel', 'fuelling', 'carbs per hour'],
  notes: ['notes', 'note', 'description', 'details', 'comments', 'comment'],
};

const REQUIRED: PlanColumn[] = ['date', 'title'];

export type PlanHeaderMap = Partial<Record<PlanColumn, number>>;

/**
 * Which of the two spreadsheet shapes this is.
 *
 * A plan sheet has a date column and no sets column; a movement sheet has sets. A file
 * with neither is handed to the movement parser, whose "missing column" messages name
 * what a movement sheet needs — the shape the template describes.
 */
export function detectImportFormat(headers: SpreadsheetCell[]): 'movements' | 'plan' {
  const norm = headers.map(normaliseHeader);
  const has = (aliases: string[]) => norm.some((h) => aliases.includes(h));
  if (has(PLAN_ALIASES.date) && !has(['sets', 'set'])) return 'plan';
  return 'movements';
}

export function mapPlanHeaders(
  headers: SpreadsheetCell[],
): { ok: true; map: PlanHeaderMap } | { ok: false; errors: string[] } {
  const norm = headers.map(normaliseHeader);
  const map: PlanHeaderMap = {};
  for (const column of Object.keys(PLAN_ALIASES) as PlanColumn[]) {
    const idx = norm.findIndex((h) => PLAN_ALIASES[column].includes(h));
    if (idx >= 0) map[column] = idx;
  }
  const missing = REQUIRED.filter((c) => map[c] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      errors: missing.map(
        (c) =>
          `Missing a "${PLAN_ALIASES[c][0]}" column (also accepted: ${PLAN_ALIASES[c].slice(1).join(', ')})`,
      ),
    };
  }
  return { ok: true, map };
}

/* ─────────────────────────────────────────────────────────────
 * Cells
 * ───────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** An ISO date out of a typed cell, a serial number, or the ways people write dates. */
export function parseDateCell(v: SpreadsheetCell): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // A reader that builds dates in UTC lands on midnight UTC; one that builds them in
    // local time does not, and its calendar date is the local one.
    const utcMidnight = v.getUTCHours() === 0 && v.getUTCMinutes() === 0;
    return utcMidnight
      ? v.toISOString().slice(0, 10)
      : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number') {
    // An Excel serial: days since 30 December 1899.
    if (!Number.isFinite(v) || v < 20_000 || v > 80_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY_MS).toISOString().slice(0, 10);
  }
  const s = text(v);
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const euro = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (euro) return valid(Number(euro[3]), Number(euro[2]), Number(euro[1]));
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function valid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

/** Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

type SessionType = ImportDiscipline | 'rest';

/**
 * The words a planner uses for a session, to the disciplines the programme knows.
 *
 * "Recovery" is rehab here: in a physiotherapist's plan it names the pre-swim set, the
 * daily ankle work, the fuelling note — prescribed, never recorded. "Cross" is its own
 * discipline, because a spin or a swim is neither a run nor mobility work.
 */
const TYPE_ALIASES: Record<string, SessionType> = {
  strength: 'strength',
  gym: 'strength',
  lifting: 'strength',
  weights: 'strength',
  resistance: 'strength',
  run: 'run',
  running: 'run',
  intervals: 'run',
  interval: 'run',
  long: 'run',
  'long run': 'run',
  easy: 'run',
  tempo: 'run',
  hills: 'run',
  fartlek: 'run',
  track: 'run',
  race: 'run',
  jog: 'run',
  speed: 'run',
  cross: 'cross',
  'cross training': 'cross',
  xt: 'cross',
  bike: 'cross',
  spin: 'cross',
  cycling: 'cross',
  cycle: 'cross',
  ride: 'cross',
  swim: 'cross',
  pool: 'cross',
  row: 'cross',
  rowing: 'cross',
  elliptical: 'cross',
  walk: 'cross',
  hike: 'cross',
  yoga: 'mobility',
  pilates: 'mobility',
  mobility: 'mobility',
  stretch: 'mobility',
  stretching: 'mobility',
  flexibility: 'mobility',
  recovery: 'rehab',
  rehab: 'rehab',
  physio: 'rehab',
  prehab: 'rehab',
  activation: 'rehab',
  daily: 'rehab',
  rest: 'rest',
  off: 'rest',
  'day off': 'rest',
};

function parseType(v: SpreadsheetCell): SessionType | null | 'invalid' {
  const s = normaliseHeader(v);
  if (s === '') return null;
  return TYPE_ALIASES[s] ?? 'invalid';
}

/* ─────────────────────────────────────────────────────────────
 * Movements named in a sentence
 * ───────────────────────────────────────────────────────────── */

/**
 * Where one prescription ends and the next begins: a middle dot, a new line, or a full
 * stop followed by a space and a capital letter — "12.5-15 kg" has no space after its dot.
 */
const SEGMENTS = /\s+[·•]\s+|\n+|\.\s+(?=[A-Z+])/;

/**
 * "Name N x M …", with the optional things around it: a leading "+" or dash, a label
 * ("Pre-swim:", "Gait:"), a range ("6–8"), a unit ("45 s", "12 steps"), and a tail.
 */
const MOVEMENT =
  /^(?:[+\-–•]\s*)?(?:[A-Za-z][A-Za-z\- ]{0,24}:\s*)?([A-Za-z][A-Za-z0-9 ,'’()/\-–]*?)\s+(\d{1,3})\s*[x×]\s*(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?(?:\s*(s|sec|secs|min|mins|steps?|m|reps?))?\b(.*)$/;

const PER_SIDE = /\s*(?:[/,]?\s*(?:per|each)\s+(?:side|leg|arm|way)|\/side|\/leg|\/arm|\/way)\b/i;
const LOAD = /,?\s*(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?\s*kg\b/i;

/**
 * The movements a sentence names, each with its dose, in the order written.
 *
 * Only a movement with a dose is lifted: "Suitcase carry 3 × 45 s" is an item, "hinges
 * lead over squats and lunges" is coaching and stays in the notes. Reps-first counts are
 * turned round ("15 x 2, twice daily" is two sets of fifteen); a range, a unit, and a
 * per-side marker travel with the reps; a load in kilograms becomes the target load, the
 * lower end of a range being the one to start at; anything else in the tail is the
 * item's note.
 */
export function extractMovements(sentence: string | null | undefined): ImportItem[] {
  if (!sentence) return [];
  const items: ImportItem[] = [];
  for (const raw of sentence.split(SEGMENTS)) {
    const seg = raw.trim().replace(/[.;]+$/, '');
    const m = MOVEMENT.exec(seg);
    if (!m) continue;
    // 1 name · 2 sets · 3 reps · 4 top of a range · 5 unit · 6 the rest of the sentence
    const [, name, a, b, b2, unit, tail] = m as unknown as (string | undefined)[];
    let sets = Number(a);
    let reps = b!;
    if (!b2 && !unit && sets > 6 && Number(reps) <= 6) [sets, reps] = [Number(reps), String(sets)];
    if (sets < 1 || sets > 20) continue;

    let repsText = b2 ? `${reps}–${b2}` : reps;
    if (unit) repsText += ` ${unit}`;

    let rest = tail ?? '';
    if (PER_SIDE.test(rest)) {
      repsText += ' per side';
      rest = rest.replace(PER_SIDE, '');
    }
    let loadKg: number | null = null;
    const load = LOAD.exec(rest);
    if (load) {
      loadKg = Number(load[1]!.replace(',', '.'));
      rest = rest.replace(LOAD, '');
    }
    const notes = rest.replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '').trim() || null;

    const cleanName = name!.trim().replace(/[,\s]+$/, '');
    items.push({
      exercise: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      block: 'A',
      sets,
      reps: repsText,
      loadKg,
      rpe: null,
      tempo: null,
      restSec: 60,
      notes,
    });
  }
  return items;
}

/* ─────────────────────────────────────────────────────────────
 * Rows → days
 * ───────────────────────────────────────────────────────────── */

interface PlanRow {
  rowNo: number;
  date: string;
  title: string;
  type: SessionType;
  plannedMin: number | null;
  plannedKm: number | null;
  vertM: number | null;
  fuelCarbs: number | null;
  notes: string;
}

export type ParsedPlan =
  | {
      ok: true;
      days: ImportDay[];
      rowsRead: number;
      /** Who the sheet is for, as written in it; null when it does not say. */
      athleteEmail: string | null;
      /** The Monday of the first week — the start date that puts every day on its date. */
      startDate: string;
      phase: string | null;
      /** Dates that held only a rest row and made no day. */
      restDays: number;
    }
  | { ok: false; errors: ImportRowError[] };

/** "60 min · 8.1 km · 300 m climb · 60 g carbs/h", or an empty string. */
export function planLine(r: {
  plannedMin: number | null;
  plannedKm: number | null;
  vertM: number | null;
  fuelCarbs: number | null;
}): string {
  const parts: string[] = [];
  if (r.plannedMin) parts.push(`${r.plannedMin} min`);
  if (r.plannedKm) parts.push(`${r.plannedKm} km`);
  if (r.vertM) parts.push(`${r.vertM} m climb`);
  if (r.fuelCarbs) parts.push(`${r.fuelCarbs} g carbs/h`);
  return parts.join(' · ');
}

export function parsePlanRows(headers: SpreadsheetCell[], rows: SpreadsheetCell[][]): ParsedPlan {
  const mapped = mapPlanHeaders(headers);
  if (!mapped.ok)
    return { ok: false, errors: mapped.errors.map((message) => ({ row: 1, message })) };
  const col = mapped.map;
  const cell = (r: SpreadsheetCell[], c: PlanColumn): SpreadsheetCell =>
    col[c] === undefined ? undefined : r[col[c]!];

  const errors: ImportRowError[] = [];
  const parsed: PlanRow[] = [];
  const emails = new Set<string>();
  let phase: string | null = null;
  let rowsRead = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    if (!r || r.every(isBlank)) return;
    rowsRead++;
    const fail = (message: string) => errors.push({ row: rowNo, message });

    const date = parseDateCell(cell(r, 'date'));
    if (!date) fail(`Date must be a date, like 2026-09-14, not "${text(cell(r, 'date'))}"`);

    const type = parseType(cell(r, 'type'));
    if (type === 'invalid')
      fail(
        `Type "${text(cell(r, 'type'))}" is not one of ${[...IMPORT_DISCIPLINES, 'rest'].join(', ')} (or a word for one: intervals, long, spin, swim, recovery…)`,
      );

    let title = text(cell(r, 'title'));
    if (!title) {
      if (type === 'rest') title = 'Rest';
      else fail('Title is blank');
    }
    if (title.length > 80) title = `${title.slice(0, 77)}…`;

    const numbers = {
      plannedMin: parseNumber(cell(r, 'plannedMin')),
      plannedKm: parseNumber(cell(r, 'plannedKm')),
      vertM: parseNumber(cell(r, 'vertM')),
      fuelCarbs: parseNumber(cell(r, 'fuelCarbs')),
      week: parseNumber(cell(r, 'week')),
    };
    for (const [k, v] of Object.entries(numbers)) {
      if (v === 'invalid') fail(`${k.replace(/([A-Z])/g, ' $1').toLowerCase()} must be a number`);
    }

    const email = text(cell(r, 'athleteEmail')).toLowerCase();
    if (email) emails.add(email);
    if (!phase) phase = text(cell(r, 'phase')) || null;

    if (errors.some((e) => e.row === rowNo) || !date) return;
    parsed.push({
      rowNo,
      date,
      title,
      type: type === 'invalid' || type === null ? 'strength' : type,
      plannedMin: numbers.plannedMin === 'invalid' ? null : numbers.plannedMin,
      plannedKm: numbers.plannedKm === 'invalid' ? null : numbers.plannedKm,
      vertM: numbers.vertM === 'invalid' ? null : numbers.vertM,
      fuelCarbs: numbers.fuelCarbs === 'invalid' ? null : numbers.fuelCarbs,
      notes: text(cell(r, 'notes')),
    });
  });

  if (emails.size > 1) {
    errors.push({
      row: 0,
      message: `The sheet names more than one athlete (${[...emails].join(', ')}); one file per athlete.`,
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  if (parsed.length === 0)
    return {
      ok: false,
      errors: [{ row: 2, message: 'No rows with data were found under the header' }],
    };

  // The calendar decides the week: the Monday of the earliest date is day one of week
  // one, whatever the sheet's own numbering starts at or which weekday its weeks begin
  // on. The week column is not held against it — a coach whose weeks run Wednesday to
  // Tuesday is not wrong, and the preview shows every day's weekday for her to read.
  const startDate = mondayOf(parsed.map((p) => p.date).sort()[0]!);
  const weekOf = (iso: string) => Math.floor(daysBetween(startDate, iso) / 7) + 1;
  if (
    weekOf(
      parsed
        .map((p) => p.date)
        .sort()
        .at(-1)!,
    ) > 52
  )
    return { ok: false, errors: [{ row: 0, message: 'The plan spans more than 52 weeks' }] };

  // One day per date. The longest non-rest session is the day; the others are folded
  // into its notes under their own titles; a date with nothing but rest makes no day.
  const byDate = new Map<string, PlanRow[]>();
  for (const p of parsed) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);

  const days: ImportDay[] = [];
  let restDays = 0;
  for (const [date, group] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const active = group.filter((g) => g.type !== 'rest');
    if (active.length === 0) {
      restDays++;
      continue;
    }
    const primary = active.reduce((best, g) =>
      (g.plannedMin ?? 0) > (best.plannedMin ?? 0) ? g : best,
    );
    const others = group.filter((g) => g !== primary);

    const sections: string[] = [];
    const head = [planLine(primary), primary.notes].filter(Boolean).join('\n');
    if (head) sections.push(head);
    for (const o of others) {
      const line = planLine(o);
      const body = [o.notes, line ? `(${line})` : ''].filter(Boolean).join(' ');
      if (o.type === 'rest' && !o.notes) continue;
      sections.push(body ? `${o.title}: ${body}` : o.title);
    }
    const notes = sections.join('\n\n').trim() || null;

    const items = [primary, ...others].flatMap((g) => extractMovements(g.notes));

    days.push({
      weekNo: weekOf(date),
      dayNo: isoWeekday(date),
      title: primary.title,
      discipline: primary.type as ImportDiscipline,
      notes: notes && notes.length > 4000 ? `${notes.slice(0, 3997)}…` : notes,
      items,
    });
  }

  if (days.length === 0)
    return {
      ok: false,
      errors: [
        { row: 0, message: 'Every row is a rest day; there is nothing to put on the calendar' },
      ],
    };

  const checked = z.array(importDaySchema).safeParse(days);
  if (!checked.success) {
    return {
      ok: false,
      errors: checked.error.issues.map((iss) => ({
        row: 0,
        message: `${iss.path.join('.')}: ${iss.message}`,
      })),
    };
  }

  return {
    ok: true,
    days: checked.data,
    rowsRead,
    athleteEmail: [...emails][0] ?? null,
    startDate,
    phase,
    restDays,
  };
}

/** "base1" → "Base 1", "build_2" → "Build 2"; anything else is only capitalised. */
export function prettyPhase(phase: string | null): string | null {
  if (!phase) return null;
  const m = phase.trim().match(/^([A-Za-z]+)[\s_-]*(\d+)$/);
  const s = m ? `${m[1]} ${m[2]}` : phase.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
