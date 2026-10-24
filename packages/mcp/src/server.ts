import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
// The subpath rather than the barrel: Node's own test runner loads this file unbundled,
// and it resolves a .ts subpath but not the barrel's extensionless internal imports.
import { importProgramShape } from '@vela/shared/programImport';
import { VelaApi, VelaApiError } from './api.ts';
import {
  formatExercises,
  formatOutcome,
  formatProgram,
  formatProgramList,
  formatReport,
} from './format.ts';

/**
 * What the assistant is told before it sees a single tool. This is the part of the
 * server a physiotherapist experiences: it is why her Claude looks the library up before
 * inventing a movement, previews before creating, and never assigns.
 */
const INSTRUCTIONS = `Vela is a physiotherapy coaching platform. These tools let you draft and maintain training programmes in the coach's own Vela account.

How to work:
1. Call list_exercises before writing a programme. Every movement must use a name from the library; matching ignores case, spacing, hyphens and a bracketed equipment note ("Split Squat (Dumbbell)" finds "Split Squat"). If a movement is not there, say so. Only add it with create_exercise once the coach has agreed to that name; never substitute a similar exercise on her behalf.
2. A programme is weeks of days. weekNo is 1–52; dayNo is the weekday, 1 = Monday … 7 = Sunday, because every block is assigned from the Monday of its first week. Each day has a title, a discipline (strength, run, mobility, rehab, cross — cross is bike, swim or walk) and either movements or notes, or both. A day that is a duration or an RPE target with no exercises (a bike ladder, a long run described in words) is a day with notes and no items. Items: exercise, block letter (items sharing a letter are a superset), sets, reps as free text ("8-10", "AMRAP", "30s each side"), and optionally loadKg, rpe, tempo, restSec and notes (up to 1,000 characters).
3. Call preview_program first and show the coach the result. Only call create_program once she has agreed to the draft.
4. To change a programme already made, use get_program for the day and item ids, then add_program_day, update_program_day (rename, change discipline, notes, or move it), remove_program_day, and add_program_item, update_program_item, remove_program_item. Every client on that programme sees the change: upcoming sessions are added, renamed, moved or removed to match; completed sessions never change.
5. move_session moves a planned session (or, with ripple, the rest of its block) when the coach asks; records never move. assign_program puts a programme on one client's calendar from the Monday of the week of the start date; it replaces what she was on, and she is told. Call it only when the coach has named the client, the programme and the start date and asked you to assign. unassign_program takes her current programme off.
6. The week's plan for one client — what to do this week, in the coach's words — is send_weekly_plan: call list_clients for the client's id, then send the text as she wrote or approved it. It lands on her phone at once with a message saying it is there. Use this for the weekly note; use a programme for a block that runs for weeks.
7. To reason about a client, call get_client_report: her profile, programme and weekly plans, every session with pain and RPE, adherence, her daily reads, vitals by day, the week's HRV read through the training decision tree, recorded activities, meals and the last messages. Read it before recommending anything, and change nothing the coach has not agreed to.
8. When the coach wants to send instructions as prose, use create_descriptive_program with the text as she wrote or approved it. Do not turn prose into a structured programme, or the other way round, unless she asks.

Be exact with prescriptions: sets, reps, load and rest are clinical instructions, not suggestions to round.`;

const programInput = importProgramShape;

const exercisesInput = {
  search: z.string().trim().min(1).optional().describe('Substring of the name, case-insensitive.'),
  category: z
    .enum(['pelvic_floor', 'strength', 'plyometric', 'running', 'mobility'])
    .optional()
    .describe('Limit to one library category.'),
};

function text(body: string, isError = false) {
  return { content: [{ type: 'text' as const, text: body }], isError };
}

/** A tool body, with the API's refusals turned into a readable error result. */
async function guarded(
  run: () => Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }>,
) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof VelaApiError) return text(e.message, true);
    return text(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

export function buildServer(api: VelaApi): McpServer {
  const server = new McpServer({ name: 'vela', version: '0.2.3' }, { instructions: INSTRUCTIONS });
  const portal = api.portalUrl;

  server.registerTool(
    'whoami',
    {
      title: 'Who am I acting as',
      description: 'The coach this API key belongs to. Call it once to confirm the key works.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guarded(async () => {
        const me = await api.me();
        const name = `${me.firstName} ${me.lastName}`.trim() || me.id;
        if (me.role !== 'coach')
          return text(
            `This key belongs to ${name}, who is not a coach. Programmes cannot be created with it.`,
            true,
          );
        return text(
          `Acting as ${name}${me.practiceName ? ` (${me.practiceName})` : ''} at ${portal}.`,
        );
      }),
  );

  server.registerTool(
    'list_exercises',
    {
      title: 'List the exercise library',
      description:
        "Every exercise the coach can prescribe: the ones shipped with Vela plus her own. Read this before drafting — a programme is refused if any movement's name is not here.",
      inputSchema: exercisesInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => guarded(async () => text(formatExercises(await api.exercises(args)))),
  );

  server.registerTool(
    'list_programs',
    {
      title: 'List programmes',
      description: "The coach's programmes and templates, newest first, with ids for get_program.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => guarded(async () => text(formatProgramList(await api.programs(), portal))),
  );

  server.registerTool(
    'get_program',
    {
      title: 'Read a programme',
      description:
        'One programme in full — every day and every prescribed movement. Useful as a starting point for a progression or a variant.',
      inputSchema: { id: z.string().uuid().describe('Programme id from list_programs.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ id }) => guarded(async () => text(formatProgram(await api.program(id), portal))),
  );

  server.registerTool(
    'preview_program',
    {
      title: 'Check a programme draft',
      description:
        'Validates a draft and matches every exercise to the library without creating anything. Always call this before create_program and show the coach the outcome.',
      inputSchema: programInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (program) =>
      guarded(async () => {
        const out = formatOutcome(await api.importProgram(program, { dryRun: true }), portal);
        return text(out.text, out.isError);
      }),
  );

  server.registerTool(
    'create_program',
    {
      title: 'Create a programme',
      description:
        "Creates the programme in the coach's Vela account and returns a link to it. Nothing is assigned to a client — use assign_program for that, when she asks. Only call this after preview_program passed and the coach agreed.",
      inputSchema: programInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (program) =>
      guarded(async () => {
        const out = formatOutcome(await api.importProgram(program, { dryRun: false }), portal);
        return text(out.text, out.isError);
      }),
  );

  server.registerTool(
    'get_client_report',
    {
      title: 'Read everything about a client',
      description:
        'Everything the portal knows about one client, as a page: profile, programme and weekly plans, flags waiting for a decision, sessions with readiness, pain, RPE and how much was done, adherence, freshness from session load, weekly wellness, cycle context where she shares it, daily reads, vitals by day, the HRV read through the decision tree, recorded activities, meals, last messages. Read this before recommending anything. Ids for list_clients.',
      inputSchema: {
        client_id: z.string().uuid().describe('The client, from list_clients.'),
        days: z
          .number()
          .int()
          .min(7)
          .max(90)
          .default(28)
          .describe('How far back to look, in days.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ client_id, days }) =>
      guarded(async () => text(formatReport(await api.clientReport(client_id, days)))),
  );

  const itemFields = {
    block: z
      .string()
      .trim()
      .max(2)
      .optional()
      .describe('Block letter; items sharing a letter are a superset.'),
    sets: z.number().int().min(1).max(20).optional(),
    reps: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe('Free text: "8-10", "AMRAP", "30s each side".'),
    loadKg: z.number().min(0).max(500).nullable().optional(),
    rpe: z.number().min(1).max(10).nullable().optional(),
    tempo: z.string().trim().max(20).nullable().optional(),
    restSec: z.number().int().min(0).max(900).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  };

  server.registerTool(
    'add_program_item',
    {
      title: 'Add a prescription to a day',
      description:
        "Adds a movement to a day of a programme. day_id comes from get_program; the exercise is a library name (list_exercises). Sessions already on a client's calendar read the programme live, so this reaches her next session. Only after the coach agreed.",
      inputSchema: {
        program_id: z.string().uuid(),
        day_id: z.string().uuid().describe('The day, from get_program.'),
        exercise: z
          .string()
          .trim()
          .min(1)
          .describe('Library name, matched ignoring case, spacing and hyphens.'),
        ...itemFields,
        sets: z.number().int().min(1).max(20),
        reps: z.string().trim().min(1).max(40),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ program_id, day_id, exercise, ...fields }) =>
      guarded(async () => {
        const item = await api.addProgramItem(program_id, { dayId: day_id, exercise, ...fields });
        return text(`Added ${item.exerciseName}: ${item.sets}×${item.reps} · item id ${item.id}`);
      }),
  );

  server.registerTool(
    'update_program_item',
    {
      title: 'Change a prescription',
      description:
        "Changes sets, reps, load, RPE, tempo, rest or notes of one prescription. item_id comes from get_program. Sessions already on a client's calendar read the programme live, so this reaches her next session. Only after the coach agreed.",
      inputSchema: { program_id: z.string().uuid(), item_id: z.string().uuid(), ...itemFields },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ program_id, item_id, ...fields }) =>
      guarded(async () => {
        const item = await api.updateProgramItem(program_id, item_id, fields);
        return text(
          `Now ${item.exerciseName}: ${item.sets}×${item.reps}` +
            (item.targetLoadKg !== null ? ` · ${item.targetLoadKg} kg` : '') +
            (item.targetRpe !== null ? ` · RPE ${item.targetRpe}` : '') +
            ` · rest ${item.restSec}s` +
            (item.notes ? ` — ${item.notes}` : ''),
        );
      }),
  );

  server.registerTool(
    'remove_program_item',
    {
      title: 'Remove a prescription',
      description:
        'Removes one movement from a day of a programme. item_id comes from get_program. Only after the coach agreed.',
      inputSchema: { program_id: z.string().uuid(), item_id: z.string().uuid() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ program_id, item_id }) =>
      guarded(async () => text(`Removed ${await api.removeProgramItem(program_id, item_id)}.`)),
  );

  server.registerTool(
    'list_clients',
    {
      title: 'List clients',
      description: "The coach's active clients, by name, with the ids send_weekly_plan needs.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guarded(async () => {
        const rows = await api.clients();
        return text(
          rows.length === 0
            ? 'No active clients.'
            : rows.map((c) => `- ${c.name} · id ${c.id}`).join('\n'),
        );
      }),
  );

  server.registerTool(
    'send_weekly_plan',
    {
      title: "Send a client this week's plan",
      description:
        "Saves the week's plan for one client — what to do this week, in the coach's words — to her phone, and messages her that it is there. Rewrites the plan if one already exists for that week. Only send text the coach has written or agreed to.",
      inputSchema: {
        client_id: z.string().uuid().describe('The client, from list_clients.'),
        body: z
          .string()
          .trim()
          .min(1)
          .max(10000)
          .describe(
            'The plan as prose. Blank lines make paragraphs; lines starting with a number or a dash become a list.',
          ),
        week_start: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            'Any date in the week it is for (snapped to its Monday). Defaults to this week.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ client_id, body, week_start }) =>
      guarded(async () => {
        const { weekStart } = await api.sendWeeklyPlan({
          clientId: client_id,
          body,
          weekStart: week_start,
        });
        return text(
          `Sent. It is on her phone as the plan for the week of ${weekStart}, and she has a message saying so.`,
        );
      }),
  );

  server.registerTool(
    'create_descriptive_program',
    {
      title: 'Create a written programme',
      description:
        "Creates a programme that is a piece of text — what to do, in the coach's words — in her Vela account and returns a link. The client reads it on her phone as written. Nothing is assigned; she does that in the portal. Only call this with text the coach has written or agreed to.",
      inputSchema: {
        name: z.string().trim().min(2).max(120).describe('What the programme is called.'),
        weeks: z.number().int().min(1).max(52).default(4).describe('How long it runs, in weeks.'),
        description: z
          .string()
          .trim()
          .max(240)
          .optional()
          .describe('One line for the list, optional.'),
        body: z
          .string()
          .trim()
          .min(1)
          .max(20000)
          .describe(
            'The programme itself, as prose. Blank lines make paragraphs; lines starting with a number or a dash become a list.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) =>
      guarded(async () => {
        const { id, url } = await api.createDescriptiveProgram(input);
        return text(`Created. She can assign it in the portal: ${url}\n(id ${id})`);
      }),
  );

  server.registerTool(
    'delete_program',
    {
      title: 'Archive a programme',
      description:
        "Archives a programme: it leaves the coach's list and the API, keeps its days and exercises, and she can restore it from the portal. A client on it stays on it. Only call this after the coach has named the programme and agreed.",
      inputSchema: { id: z.string().uuid().describe('Programme id from list_programs.') },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ id }) =>
      guarded(async () => {
        await api.deleteProgram(id);
        return text(
          'Archived. It has left the list; the coach can restore it from the bottom of the programmes page, and any client on it stays on it.',
        );
      }),
  );

  const disciplineEnum = z
    .enum(['strength', 'run', 'mobility', 'rehab', 'cross'])
    .describe('strength | run | mobility | rehab | cross (bike, swim, walk).');
  const writeAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  } as const;

  server.registerTool(
    'add_program_day',
    {
      title: 'Add a day to a programme',
      description:
        'Adds a day to a programme: a title, a discipline, and notes, with movements added afterwards by add_program_item — or notes alone for a duration or RPE session. Every client on the programme gets the session if its date is still ahead. Only after the coach agreed.',
      inputSchema: {
        program_id: z.string().uuid(),
        week_no: z.number().int().min(1).max(52),
        day_no: z.number().int().min(1).max(7).describe('Weekday: 1 = Monday … 7 = Sunday.'),
        title: z.string().trim().min(1).max(80),
        discipline: disciplineEnum.optional(),
        notes: z.string().trim().max(4000).optional().describe('What to do, in words.'),
      },
      annotations: writeAnnotations,
    },
    ({ program_id, week_no, day_no, title, discipline, notes }) =>
      guarded(async () => {
        const day = await api.addProgramDay(program_id, {
          weekNo: week_no,
          dayNo: day_no,
          title,
          discipline,
          notes,
        });
        return text(`Added "${title}", week ${week_no} day ${day_no} · day id ${day.id}`);
      }),
  );

  server.registerTool(
    'update_program_day',
    {
      title: 'Change a day',
      description:
        "Renames a day, changes its discipline or notes, or moves it to another week or weekday. day_id comes from get_program. Clients' upcoming sessions follow; completed ones never change. Only after the coach agreed.",
      inputSchema: {
        program_id: z.string().uuid(),
        day_id: z.string().uuid(),
        title: z.string().trim().min(1).max(80).optional(),
        discipline: disciplineEnum.optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
        week_no: z.number().int().min(1).max(52).optional(),
        day_no: z.number().int().min(1).max(7).optional().describe('Weekday: 1 = Monday.'),
      },
      annotations: { ...writeAnnotations, idempotentHint: true },
    },
    ({ program_id, day_id, title, discipline, notes, week_no, day_no }) =>
      guarded(async () => {
        const day = await api.updateProgramDay(program_id, day_id, {
          title,
          discipline,
          notes,
          weekNo: week_no,
          dayNo: day_no,
        });
        return text(`Now "${day.title}", week ${day.weekNo} day ${day.dayNo} (${day.discipline}).`);
      }),
  );

  server.registerTool(
    'remove_program_day',
    {
      title: 'Remove a day',
      description:
        "Removes a day and its movements from a programme. Clients' upcoming sessions for it leave their calendars; sessions already done stay in their history. Only after the coach agreed.",
      inputSchema: { program_id: z.string().uuid(), day_id: z.string().uuid() },
      annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
    },
    ({ program_id, day_id }) =>
      guarded(async () => {
        const removed = await api.removeProgramDay(program_id, day_id);
        return text(`Removed "${removed.title}".`);
      }),
  );

  server.registerTool(
    'assign_program',
    {
      title: 'Assign a programme to a client',
      description:
        "Puts a programme on one client's calendar. Week 1 starts on the Monday of start_date's week (day 1 = Monday); days before start_date in that week are skipped. Replaces her current programme — its upcoming sessions go, completed ones stay — and she gets a message. Only when the coach has named the client, the programme and the date and asked you to assign.",
      inputSchema: {
        client_id: z.string().uuid().describe('From list_clients.'),
        program_id: z.string().uuid().describe('From list_programs.'),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('YYYY-MM-DD.'),
      },
      annotations: { ...writeAnnotations, destructiveHint: true },
    },
    ({ client_id, program_id, start_date }) =>
      guarded(async () => {
        const a = await api.assignProgram({
          clientId: client_id,
          programId: program_id,
          startDate: start_date,
        });
        return text(
          `Assigned "${a.programName}". Week 1 starts Monday ${a.weekOneMonday}` +
            (a.firstDay !== a.weekOneMonday ? `; her first session is from ${a.firstDay}.` : '.') +
            ' She has a message saying so.',
        );
      }),
  );

  server.registerTool(
    'move_session',
    {
      title: 'Move a planned session',
      description:
        'Moves one planned session to another day, or with ripple, that session and every planned session after it in the same block by the same number of days. Only sessions still planned, today or later, move, and never into the past; completed records never move. A moved session keeps its new day when the programme changes. Session ids are in get_client_report. Only when the coach asked.',
      inputSchema: {
        session_id: z.string().uuid().describe('From get_client_report.'),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('The new day, YYYY-MM-DD.'),
        ripple: z
          .boolean()
          .default(false)
          .describe('Move the rest of the block after it by the same number of days.'),
      },
      annotations: { ...writeAnnotations, destructiveHint: false, idempotentHint: false },
    },
    ({ session_id, to, ripple }) =>
      guarded(async () => {
        const r = await api.moveSession({ sessionId: session_id, to, ripple });
        return text(
          `Moved "${r.session.title}" from ${r.session.from} to ${r.session.to}` +
            (r.moved > 1 ? `, and ${r.moved - 1} later sessions of the block with it.` : '.') +
            ' She sees the new day in the app and her calendar feed.',
        );
      }),
  );

  server.registerTool(
    'unassign_program',
    {
      title: 'Take a client off her programme',
      description:
        'Takes her current programme off: upcoming sessions from it go, completed ones stay, and she gets a message. Only when the coach asked.',
      inputSchema: { client_id: z.string().uuid().describe('From list_clients.') },
      annotations: { ...writeAnnotations, destructiveHint: true, idempotentHint: true },
    },
    ({ client_id }) =>
      guarded(async () => {
        const removed = await api.unassignProgram(client_id);
        return text(`Took "${removed.programName}" off her calendar.`);
      }),
  );

  server.registerTool(
    'create_exercise',
    {
      title: 'Add a movement to the library',
      description:
        "Adds a movement to the coach's own library so programmes can prescribe it. Refused if the name already exists (the existing one is named). Only once the coach has agreed to the name.",
      inputSchema: {
        name: z.string().trim().min(2).max(120),
        category: z
          .enum(['pelvic_floor', 'strength', 'plyometric', 'running', 'mobility'])
          .describe('The library category.'),
        cue: z.string().trim().max(240).optional().describe('One coaching cue.'),
        equipment: z.string().trim().max(60).optional().describe('e.g. Dumbbell, Band, Box.'),
        notes: z.string().trim().max(1000).optional(),
      },
      annotations: writeAnnotations,
    },
    (input) =>
      guarded(async () => {
        const ex = await api.createExercise(input);
        return text(`Added "${ex.name}" to her library${ex.id ? ` · id ${ex.id}` : ''}.`);
      }),
  );

  return server;
}
