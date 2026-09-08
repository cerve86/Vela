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
const INSTRUCTIONS = `Vela is a physiotherapy coaching platform. These tools let you draft training programmes into the coach's own Vela account.

How to work:
1. Call list_exercises before writing a programme. Every movement must use a name from the library exactly (matching ignores case, spacing and hyphens — nothing else). If the movement the coach wants is not there, say so and ask her to add it in Vela → Exercise library. Never substitute a similar exercise on her behalf.
2. A programme is weeks of days. weekNo is 1–52; dayNo is 1–7 and is the order within the week, not a weekday. Each day has a title, a discipline (strength, run, mobility, rehab) and one or more items: exercise, block letter (items sharing a letter are a superset), sets, reps as free text ("8-10", "AMRAP", "30s each side"), and optionally loadKg, rpe, tempo, restSec and notes.
3. Call preview_program first and show the coach the result. Only call create_program once she has agreed to the draft.
4. create_program makes a programme in her account and returns a link. It never assigns a programme to a client; she does that herself in the portal, with a start date.
5. The week's plan for one client — what to do this week, in the coach's words — is send_weekly_plan: call list_clients for the client's id, then send the text as she wrote or approved it. It lands on her phone at once with a message saying it is there; nothing to assign. Use this for the weekly note; use a programme for a block that runs for weeks.
6. To reason about a client, call get_client_report: her profile, programme and weekly plans, every session with pain and RPE, adherence, her daily reads, vitals by day, the week's HRV read through the training decision tree, recorded activities, meals and the last messages. Read it before recommending anything. Then act on the coach's decision in one of two ways: send_weekly_plan for the week's instructions in prose, or update_program_item / add_program_item / remove_program_item to change a specific prescription in her programme (ids come from get_program; sessions already on her calendar read the programme live, so the change reaches her next session). Never change a prescription the coach has not agreed to.
7. Not every plan is days of sets and reps. When the coach wants to send instructions as prose — what to do this week, in her own words — use create_descriptive_program with the text as she wrote or approved it. The client reads it on her phone exactly as written; blank lines make paragraphs, lines starting with a number or a dash become a list. Do not turn prose into a structured programme, or the other way round, unless she asks.

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
  const server = new McpServer({ name: 'vela', version: '0.1.0' }, { instructions: INSTRUCTIONS });
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
        "Creates the programme in the coach's Vela account and returns a link to it. Nothing is assigned to a client — she does that in the portal. Only call this after preview_program passed and the coach agreed.",
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
        'Everything the portal knows about one client, as a page: profile, programme and weekly plans, sessions with pain and RPE, adherence, daily reads, vitals by day, the HRV read through the decision tree, recorded activities, meals, last messages. Read this before recommending anything. Ids for list_clients.',
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
    notes: z.string().trim().max(240).nullable().optional(),
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
      title: 'Delete a programme',
      description:
        "Removes a programme from the coach's list. One a client was ever assigned is archived instead, so her sessions stay on her calendar; otherwise it is deleted with its days and exercises. Only call this after the coach has named the programme and agreed.",
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
        const mode = await api.deleteProgram(id);
        return text(
          mode === 'archived'
            ? 'Archived. A client was assigned this programme at some point, so it has left the list but her sessions stay on her calendar.'
            : 'Deleted, with its days and exercises.',
        );
      }),
  );

  return server;
}
