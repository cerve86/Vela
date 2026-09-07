import type { ImportProgramInput } from '@vela/shared/programImport';

/**
 * The portal's HTTP API, as the MCP server sees it.
 *
 * Thin on purpose. Every rule about what a programme may contain lives on the server —
 * the same code the upload form runs — so this file has nothing to validate. It carries a
 * key, sends JSON, and turns each status the import endpoint documents into a value the
 * tools can explain to the coach.
 */

export interface VelaConfig {
  /** The portal, e.g. https://www.vela-coaching.com. No trailing slash. */
  url: string;
  /** A personal API key from Settings → API keys. */
  apiKey: string;
}

export const DEFAULT_URL = 'https://www.vela-coaching.com';
const REQUEST_TIMEOUT_MS = 45_000;

export function configFromEnv(env: Record<string, string | undefined>): VelaConfig {
  const apiKey = env.VELA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'VELA_API_KEY is not set. Make one in the Vela portal under Settings → API keys and put it in the extension settings.',
    );
  }
  const url = (env.VELA_URL?.trim() || DEFAULT_URL).replace(/\/+$/, '');
  return { url, apiKey };
}

export class VelaApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  practiceName: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  muscleGroups: string[];
  cues: string[];
  isMine: boolean;
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  /** Days of prescriptions, or a written programme the client reads through. */
  kind: 'structured' | 'descriptive';
  dayCount: number;
  itemCount: number;
}

export interface ProgramItem {
  exerciseName: string;
  block: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  targetRpe: number | null;
  tempo: string | null;
  restSec: number;
  notes: string | null;
}

export interface ProgramDay {
  weekNo: number;
  dayNo: number;
  title: string;
  discipline: string;
  notes: string | null;
  items: ProgramItem[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  kind: 'structured' | 'descriptive';
  /** The text of a written programme; null for days of prescriptions. */
  body: string | null;
  days: ProgramDay[];
}

export interface ImportSummary {
  weeks: number;
  days: number;
  items: number;
  exercises: number;
}

/** The import endpoint's documented outcomes, one value each. */
export type ImportOutcome =
  | { kind: 'created'; id: string; summary: ImportSummary }
  | { kind: 'valid'; summary: ImportSummary }
  | { kind: 'invalid'; errors: { row: number; message: string }[] }
  | { kind: 'unmatched'; unmatched: string[] }
  | { kind: 'failed'; message: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class VelaApi {
  private readonly cfg: VelaConfig;
  private readonly fetchImpl: FetchLike;

  constructor(cfg: VelaConfig, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  get portalUrl(): string {
    return this.cfg.url;
  }

  private async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // A portal that does not answer must become an error the assistant can relay,
        // not a tool call that hangs until the desktop app gives up minutes later.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      const reason =
        e instanceof Error && e.name === 'TimeoutError'
          ? `no answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`
          : e instanceof Error
            ? e.message
            : String(e);
      throw new VelaApiError(0, null, `Could not reach ${this.cfg.url}: ${reason}`);
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  /** GET, with the two refusals every route shares turned into sentences. */
  private async read<T>(path: string): Promise<T> {
    const { status, body } = await this.request('GET', path);
    if (status >= 200 && status < 300) return body as T;
    throw new VelaApiError(status, body, explain(status, body));
  }

  me(): Promise<Me> {
    return this.read<Me>('/api/me');
  }

  async exercises(opts: { search?: string; category?: string } = {}): Promise<Exercise[]> {
    const params = new URLSearchParams();
    if (opts.search) params.set('search', opts.search);
    if (opts.category) params.set('category', opts.category);
    const qs = params.toString();
    const { exercises } = await this.read<{ exercises: Exercise[] }>(
      `/api/exercises${qs ? `?${qs}` : ''}`,
    );
    return exercises;
  }

  async programs(): Promise<ProgramSummary[]> {
    const { programs } = await this.read<{ programs: ProgramSummary[] }>('/api/programs');
    return programs;
  }

  async program(id: string): Promise<Program> {
    const { program } = await this.read<{ program: Program }>(
      `/api/programs/${encodeURIComponent(id)}`,
    );
    return program;
  }

  /** The coach's active clients, id and name. */
  async clients(): Promise<{ id: string; name: string }[]> {
    const { clients } = await this.read<{ clients: { id: string; name: string }[] }>(
      '/api/clients',
    );
    return clients;
  }

  /** The week's plan for one client, saved to her phone with a message saying so. */
  async sendWeeklyPlan(input: {
    clientId: string;
    body: string;
    weekStart?: string;
  }): Promise<{ weekStart: string }> {
    const { status, body } = await this.request(
      'PUT',
      `/api/clients/${encodeURIComponent(input.clientId)}/plan`,
      { body: input.body, weekStart: input.weekStart },
    );
    if (status >= 200 && status < 300) {
      const plan = (body as { plan: { weekStart: string } }).plan;
      return { weekStart: plan.weekStart };
    }
    throw new VelaApiError(status, body, explain(status, body));
  }

  /** A written programme: name, weeks, and the text the client reads. Returns its id and link. */
  async createDescriptiveProgram(input: {
    name: string;
    weeks: number;
    description?: string;
    body: string;
  }): Promise<{ id: string; url: string }> {
    const { status, body } = await this.request('POST', '/api/programs', input);
    if (status === 201) {
      const b = body as { id: string; url: string };
      return { id: b.id, url: b.url };
    }
    throw new VelaApiError(status, body, explain(status, body));
  }

  /** Delete a programme, or archive it if a client was ever assigned it. Says which. */
  async deleteProgram(id: string): Promise<'deleted' | 'archived'> {
    const { status, body } = await this.request(
      'DELETE',
      `/api/programs/${encodeURIComponent(id)}`,
    );
    if (status >= 200 && status < 300) {
      const mode = (body as { mode?: string } | null)?.mode;
      return mode === 'archived' ? 'archived' : 'deleted';
    }
    throw new VelaApiError(status, body, explain(status, body));
  }

  async importProgram(
    program: ImportProgramInput,
    opts: { dryRun: boolean },
  ): Promise<ImportOutcome> {
    const { status, body } = await this.request(
      'POST',
      `/api/programs/import${opts.dryRun ? '?dryRun=1' : ''}`,
      program,
    );
    const b = (body ?? {}) as Record<string, unknown>;

    if (status === 201)
      return { kind: 'created', id: String(b.id), summary: b.summary as ImportSummary };
    if (status === 200) return { kind: 'valid', summary: b.summary as ImportSummary };
    if (status === 400)
      return { kind: 'invalid', errors: (b.errors as { row: number; message: string }[]) ?? [] };
    if (status === 422) return { kind: 'unmatched', unmatched: (b.unmatched as string[]) ?? [] };
    if (status === 401) throw new VelaApiError(status, body, explain(status, body));
    return {
      kind: 'failed',
      message: typeof b.error === 'string' ? b.error : `The portal answered ${status}.`,
    };
  }
}

function explain(status: number, body: unknown): string {
  const message =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  if (status === 401) {
    return 'The portal refused the API key. It may have been revoked — check Settings → API keys in Vela, and make a new one if so.';
  }
  if (status === 404) return message ?? 'No such programme.';
  return message ?? `The portal answered ${status}.`;
}
