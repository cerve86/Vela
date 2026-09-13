/**
 * A programme's weeks, as planned and as they went.
 *
 * Pure. The phone's Progress screen asks two things of an assigned programme: what is
 * coming, week by week, and how each week that has already happened compared with the
 * plan. Both are answered from the sessions the assignment put on her calendar — the
 * prescribed ones, not activities recorded from Strava, which are hers but not the plan's.
 */

export interface ProgrammeSessionLike {
  scheduledDate: string;
  status: string;
  /** Null for a session that was never prescribed — one filed for a recorded activity. */
  programDayId: string | null;
  title: string;
  discipline: string;
}

export interface ProgrammeWeek {
  weekNo: number;
  /** First and last day of the week, inclusive. */
  from: string;
  to: string;
  /** Prescribed sessions that week, in date order. */
  sessions: ProgrammeSessionLike[];
  planned: number;
  done: number;
  /** Planned sessions whose day has passed without being done. */
  missed: number;
  isCurrent: boolean;
  isPast: boolean;
}

const DAY_MS = 86_400_000;

function shift(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The programme's weeks from its start date, seven days each, as the assignment laid
 * them out. `today` decides which week is current; a week entirely before today is past.
 */
export function programmeWeeks(input: {
  startDate: string;
  durationWeeks: number;
  sessions: ProgrammeSessionLike[];
  today: string;
}): ProgrammeWeek[] {
  const prescribed = input.sessions
    .filter((s) => s.programDayId !== null)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const weeks: ProgrammeWeek[] = [];
  for (let w = 0; w < input.durationWeeks; w++) {
    const from = shift(input.startDate, w * 7);
    const to = shift(from, 6);
    const sessions = prescribed.filter((s) => s.scheduledDate >= from && s.scheduledDate <= to);
    const done = sessions.filter((s) => s.status === 'completed').length;
    const missed = sessions.filter(
      (s) =>
        s.status !== 'completed' && s.status !== 'in_progress' && s.scheduledDate < input.today,
    ).length;
    weeks.push({
      weekNo: w + 1,
      from,
      to,
      sessions,
      planned: sessions.length,
      done,
      missed,
      isCurrent: input.today >= from && input.today <= to,
      isPast: to < input.today,
    });
  }
  return weeks;
}

/**
 * Planned and done per calendar column of an attendance grid.
 *
 * The grid's columns are calendar weeks with their own first day, which need not be the
 * programme's; so the count is taken over the column's seven days, and only columns
 * that hold at least one prescribed session get a figure. `columnStarts` are the first
 * days of the columns, oldest first.
 */
export function weekColumnCounts(
  columnStarts: string[],
  sessions: ProgrammeSessionLike[],
): ({ planned: number; done: number } | null)[] {
  const prescribed = sessions.filter((s) => s.programDayId !== null);
  return columnStarts.map((start) => {
    const end = shift(start, 6);
    const inWeek = prescribed.filter((s) => s.scheduledDate >= start && s.scheduledDate <= end);
    if (inWeek.length === 0) return null;
    return {
      planned: inWeek.length,
      done: inWeek.filter((s) => s.status === 'completed').length,
    };
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14–20 Sep", or "28 Sep – 4 Oct" across a month boundary. Fixed names: no locale surprises. */
export function weekRangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const month = (d: Date) => MONTHS[d.getUTCMonth()]!;
  return f.getUTCMonth() === t.getUTCMonth()
    ? `${f.getUTCDate()}–${t.getUTCDate()} ${month(t)}`
    : `${f.getUTCDate()} ${month(f)} – ${t.getUTCDate()} ${month(t)}`;
}
