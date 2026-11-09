import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { VelaApi, configFromEnv, type FetchLike } from './api.ts';
import { buildServer } from './server.ts';

/** A portal that answers from a script, recording what it was asked. */
function fakePortal(
  routes: Record<string, (init?: RequestInit) => { status: number; body: unknown }>,
) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = url.replace('https://portal.test', '');
    calls.push({
      url: path,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route =
      routes[path.split('?')[0] ?? path] ??
      (() => ({ status: 404, body: { error: 'No such programme.' } }));
    const { status, body } = route(init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

async function connect(fetchImpl: FetchLike) {
  const api = new VelaApi({ url: 'https://portal.test', apiKey: 'vela_test' }, fetchImpl);
  const server = buildServer(api);
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function firstText(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content[0]?.text ?? '';
}

const draft = {
  name: 'Return to running — block 1',
  days: [
    {
      weekNo: 1,
      dayNo: 1,
      title: 'Posterior chain',
      items: [{ exercise: 'Romanian Deadlift', sets: 3, reps: '8-10' }],
    },
  ],
};

describe('configFromEnv', () => {
  it('refuses to start without a key, and says where to get one', () => {
    assert.throws(() => configFromEnv({}), /Settings → API keys/);
  });
  it('defaults the portal and trims a trailing slash', () => {
    assert.equal(configFromEnv({ VELA_API_KEY: 'vela_x' }).url, 'https://www.vela-coaching.com');
    assert.equal(
      configFromEnv({ VELA_API_KEY: 'vela_x', VELA_URL: 'http://localhost:4310/' }).url,
      'http://localhost:4310',
    );
  });
});

describe('tools', () => {
  it('publishes the twenty-two tools with the programme schema described field by field', async () => {
    const client = await connect(fakePortal({}).fetchImpl);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'add_program_day',
      'add_program_item',
      'assign_program',
      'create_descriptive_program',
      'create_exercise',
      'create_program',
      'delete_program',
      'get_client_report',
      'get_program',
      'list_clients',
      'list_exercises',
      'list_programs',
      'move_session',
      'preview_program',
      'remove_program_day',
      'remove_program_item',
      'send_to_intervals',
      'send_weekly_plan',
      'unassign_program',
      'update_program_day',
      'update_program_item',
      'whoami',
    ]);
    const create = tools.find((t) => t.name === 'create_program')!;
    const schema = JSON.stringify(create.inputSchema);
    assert.match(schema, /Matching ignores case, spacing and hyphens/);
    assert.match(schema, /1 = Monday/);
    assert.equal(create.annotations?.destructiveHint, false);
  });

  it('assigns from the Monday and says when her first session is', async () => {
    let sent: unknown = null;
    const portal = fakePortal({
      '/api/clients/00000000-0000-4000-8000-000000000001/assignment': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            assignment: {
              id: 'a1',
              programId: 'p1',
              programName: 'Base 1',
              weekOneMonday: '2026-10-26',
              firstDay: '2026-10-28',
            },
          },
        };
      },
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'assign_program',
      arguments: {
        client_id: '00000000-0000-4000-8000-000000000001',
        program_id: '00000000-0000-4000-8000-000000000002',
        start_date: '2026-10-28',
      },
    });
    assert.deepEqual(sent, {
      programId: '00000000-0000-4000-8000-000000000002',
      startDate: '2026-10-28',
    });
    assert.match(
      firstText(res),
      /Week 1 starts Monday 2026-10-26; her first session is from 2026-10-28/,
    );
  });

  it('teaches the watch-steps syntax where days are written', async () => {
    const client = await connect(fakePortal({}).fetchImpl);
    const { tools } = await client.listTools();
    for (const name of ['create_program', 'add_program_day', 'update_program_day']) {
      const schema = JSON.stringify(tools.find((t) => t.name === name)!.inputSchema);
      assert.match(schema, /intervals\.icu workout text/, name);
      assert.match(schema, /400mtr/, name);
    }
  });

  it("sends a day's watch steps to the portal", async () => {
    let sent: unknown = null;
    const portal = fakePortal({
      '/api/programs/00000000-0000-4000-8000-000000000002/days/00000000-0000-4000-8000-000000000004':
        (init) => {
          sent = JSON.parse(String(init?.body));
          return {
            status: 200,
            body: { day: { title: 'Intervals', weekNo: 1, dayNo: 2, discipline: 'run' } },
          };
        },
    });
    const client = await connect(portal.fetchImpl);
    await client.callTool({
      name: 'update_program_day',
      arguments: {
        program_id: '00000000-0000-4000-8000-000000000002',
        day_id: '00000000-0000-4000-8000-000000000004',
        watch_steps: '- 10m Z1 HR\n\n6x\n- 1m Z4 HR\n- 2m Z1 HR',
      },
    });
    assert.deepEqual(sent, { watchSteps: '- 10m Z1 HR\n\n6x\n- 1m Z4 HR\n- 2m Z1 HR' });
  });

  it('starts sending to intervals.icu and says what reached her calendar', async () => {
    let sent: unknown = null;
    const portal = fakePortal({
      '/api/clients/00000000-0000-4000-8000-000000000001/intervals': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 200,
          body: {
            sending: true,
            onCalendar: 14,
            syncedAt: '2026-11-09T10:00:00Z',
            error: null,
            outcome: {
              state: 'sent',
              onCalendar: 14,
              withSteps: 5,
              created: 14,
              updated: 0,
              removed: 0,
            },
          },
        };
      },
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'send_to_intervals',
      arguments: { client_id: '00000000-0000-4000-8000-000000000001', send: true },
    });
    assert.deepEqual(sent, { send: true });
    assert.match(
      firstText(res),
      /14 sessions are on her intervals\.icu calendar.*\(14 new\); 5 of them/,
    );
  });

  it('relays why intervals.icu refused, as an error', async () => {
    const portal = fakePortal({
      '/api/clients/00000000-0000-4000-8000-000000000001/intervals': () => ({
        status: 409,
        body: { error: "Marta isn't linked to intervals.icu yet." },
      }),
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'send_to_intervals',
      arguments: { client_id: '00000000-0000-4000-8000-000000000001', send: true },
    });
    assert.equal(res.isError, true);
    assert.match(firstText(res), /isn't linked/);
  });

  it('moves a session with the rest of its block and says how many followed', async () => {
    let sent: unknown = null;
    const portal = fakePortal({
      '/api/sessions/00000000-0000-4000-8000-000000000003/move': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 200,
          body: {
            moved: 3,
            session: { id: 's1', title: 'Long run', from: '2026-10-29', to: '2026-10-31' },
          },
        };
      },
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'move_session',
      arguments: {
        session_id: '00000000-0000-4000-8000-000000000003',
        to: '2026-10-31',
        ripple: true,
      },
    });
    assert.deepEqual(sent, { to: '2026-10-31', ripple: true });
    assert.match(firstText(res), /from 2026-10-29 to 2026-10-31, and 2 later sessions/);
  });

  it('sends the key as a Bearer header and reports who it is', async () => {
    let auth = '';
    const portal = fakePortal({
      '/api/me': (init) => {
        auth = String((init?.headers as Record<string, string>).Authorization);
        return {
          status: 200,
          body: {
            id: 'u1',
            firstName: 'Francesca',
            lastName: 'B',
            role: 'coach',
            practiceName: 'Studio',
          },
        };
      },
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({ name: 'whoami', arguments: {} });
    assert.equal(auth, 'Bearer vela_test');
    assert.match(firstText(res), /Acting as Francesca B \(Studio\)/);
  });

  it('turns a refused key into a sentence about Settings, not a stack trace', async () => {
    const portal = fakePortal({
      '/api/me': () => ({ status: 401, body: { error: 'Not signed in.' } }),
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({ name: 'whoami', arguments: {} });
    assert.equal(res.isError, true);
    assert.match(firstText(res), /revoked/);
  });

  it('previews with dryRun=1 and creates without it', async () => {
    const portal = fakePortal({
      '/api/programs/import': (init) => {
        const dry = calls().at(-1)?.url.includes('dryRun=1');
        return dry
          ? {
              status: 200,
              body: { ok: true, summary: { weeks: 1, days: 1, items: 1, exercises: 1 } },
            }
          : {
              status: 201,
              body: { id: 'p1', summary: { weeks: 1, days: 1, items: 1, exercises: 1 } },
            };
      },
    });
    const calls = () => portal.calls;
    const client = await connect(portal.fetchImpl);

    const preview = await client.callTool({ name: 'preview_program', arguments: draft });
    assert.equal(preview.isError, false);
    assert.match(firstText(preview), /Valid\. 1 week, 1 day, 1 item, 1 distinct exercise/);
    assert.equal(portal.calls[0]?.url, '/api/programs/import?dryRun=1');
    // The schema's defaults were applied before the body left: block A, rest 60.
    const sent = portal.calls[0]?.body as {
      days: { items: { block: string; restSec: number }[] }[];
    };
    assert.equal(sent.days[0]?.items[0]?.block, 'A');
    assert.equal(sent.days[0]?.items[0]?.restSec, 60);

    const created = await client.callTool({ name: 'create_program', arguments: draft });
    assert.equal(created.isError, false);
    assert.match(firstText(created), /https:\/\/portal\.test\/programs\/p1/);
    assert.match(firstText(created), /not assigned to anyone/);
    assert.equal(portal.calls[1]?.url, '/api/programs/import');
  });

  it('relays unmatched exercises and tells the assistant not to substitute', async () => {
    const portal = fakePortal({
      '/api/programs/import': () => ({
        status: 422,
        body: { error: 'x', unmatched: ['SL bridge'] },
      }),
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({ name: 'create_program', arguments: draft });
    assert.equal(res.isError, true);
    assert.match(firstText(res), /- SL bridge/);
    assert.match(firstText(res), /Do not substitute/);
  });

  it('rejects a draft that breaks the schema before it reaches the portal', async () => {
    const portal = fakePortal({});
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'preview_program',
      arguments: { ...draft, days: [{ ...draft.days[0], dayNo: 9 }] },
    });
    assert.equal(res.isError, true);
    assert.equal(portal.calls.length, 0);
  });

  it('renders a programme as days of prescriptions', async () => {
    const portal = fakePortal({
      '/api/programs/11111111-1111-4111-8111-111111111111': () => ({
        status: 200,
        body: {
          program: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Block 1',
            description: null,
            durationWeeks: 1,
            isTemplate: false,
            days: [
              {
                weekNo: 1,
                dayNo: 1,
                title: 'Posterior chain',
                discipline: 'strength',
                notes: null,
                items: [
                  {
                    exerciseName: 'Romanian Deadlift',
                    block: 'A',
                    sets: 3,
                    reps: '8-10',
                    targetLoadKg: 40,
                    targetRpe: 7,
                    tempo: null,
                    restSec: 90,
                    notes: 'Hinge, not squat',
                  },
                ],
              },
            ],
          },
        },
      }),
    });
    const client = await connect(portal.fetchImpl);
    const res = await client.callTool({
      name: 'get_program',
      arguments: { id: '11111111-1111-4111-8111-111111111111' },
    });
    const out = firstText(res);
    assert.match(out, /Week 1, day 1: Posterior chain \(strength\)/);
    assert.match(
      out,
      /A\. Romanian Deadlift · 3×8-10 · 40 kg · RPE 7 · rest 90s · — Hinge, not squat/,
    );
  });
});
