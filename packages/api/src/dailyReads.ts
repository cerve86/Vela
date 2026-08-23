import type { VelaClient } from './client';

/**
 * The daily readiness read.
 *
 * Three fixed windows a day, each locked once written. Nothing here can revise or delete a
 * read — the table refuses both — so this module has no update path by design rather than
 * by omission.
 */

export const READ_WINDOWS = ['morning', 'midday', 'evening'] as const;
export type ReadWindow = (typeof READ_WINDOWS)[number];

/** 0–4, matching the five readiness steps in the shared tokens. */
export type Readiness = 0 | 1 | 2 | 3 | 4;

export interface DailyRead {
  id: string;
  readOn: string;
  window: ReadWindow;
  readiness: Readiness;
  symptom: string;
  createdAt: string;
}

const COLUMNS = 'id, read_on, read_window, readiness, symptom, created_at';

function toRead(row: {
  id: string;
  read_on: string;
  read_window: string;
  readiness: number;
  symptom: string;
  created_at: string;
}): DailyRead {
  return {
    id: row.id,
    readOn: row.read_on,
    window: row.read_window as ReadWindow,
    readiness: row.readiness as Readiness,
    symptom: row.symptom,
    createdAt: row.created_at,
  };
}

/** Reads for a client between two local dates, oldest first. */
export async function listDailyReads(
  supabase: VelaClient,
  opts: { clientId: string; from?: string; to?: string },
): Promise<DailyRead[]> {
  let q = supabase
    .from('daily_reads')
    .select(COLUMNS)
    .eq('client_id', opts.clientId)
    .order('read_on', { ascending: true })
    .order('created_at', { ascending: true });

  if (opts.from) q = q.gte('read_on', opts.from);
  if (opts.to) q = q.lte('read_on', opts.to);

  const { data } = await q;
  return (data ?? []).map(toRead);
}

/**
 * Locks one window.
 *
 * `readOn` is the client's own local date, passed in rather than derived here: a read taken
 * at 21:00 in Singapore belongs to that evening, and letting the server decide from a
 * timestamp would file it under the previous day and free the window to be logged twice.
 *
 * A duplicate is not an error worth surfacing as one — it means the window was already
 * locked, which the caller should present as "already logged" rather than as a failure.
 */
export async function lockDailyRead(
  supabase: VelaClient,
  input: {
    clientId: string;
    readOn: string;
    window: ReadWindow;
    readiness: Readiness;
    symptom?: string;
  },
): Promise<{ error: string | null; alreadyLogged: boolean }> {
  const { error } = await supabase.from('daily_reads').insert({
    client_id: input.clientId,
    read_on: input.readOn,
    read_window: input.window,
    readiness: input.readiness,
    symptom: input.symptom ?? 'Nothing',
  });

  // 23505 is the unique index doing its job.
  if (error?.code === '23505') return { error: null, alreadyLogged: true };
  return { error: error?.message ?? null, alreadyLogged: false };
}

/** The most recent read on a given date, which is the one in force. */
export function currentRead(reads: DailyRead[], onDate: string): DailyRead | null {
  const sameDay = reads.filter((r) => r.readOn === onDate);
  return sameDay.length ? sameDay[sameDay.length - 1]! : null;
}

/** How many of the three windows were logged on a date. */
export function loggedWindows(reads: DailyRead[], onDate: string): ReadWindow[] {
  return READ_WINDOWS.filter((w) => reads.some((r) => r.readOn === onDate && r.window === w));
}
