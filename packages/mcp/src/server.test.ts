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
  it('publishes the six tools with the programme schema described field by field', async () => {
    const client = await connect(fakePortal({}).fetchImpl);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'create_program',
      'get_program',
      'list_exercises',
      'list_programs',
      'preview_program',
      'whoami',
    ]);
    const create = tools.find((t) => t.name === 'create_program')!;
    const schema = JSON.stringify(create.inputSchema);
    assert.match(schema, /Matching ignores case, spacing and hyphens/);
    assert.match(schema, /not a weekday/);
    assert.equal(create.annotations?.destructiveHint, false);
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
