import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
// The subpath rather than the barrel: Node's own test runner loads this file unbundled,
// and it resolves a .ts subpath but not the barrel's extensionless internal imports.
import { importProgramShape } from '@vela/shared/programImport';
import { VelaApi, VelaApiError } from './api.ts';
import { formatExercises, formatOutcome, formatProgram, formatProgramList } from './format.ts';

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

  return server;
}
