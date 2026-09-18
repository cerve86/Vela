/** Calendar arithmetic on ISO dates, in UTC so a date is a date and never a time zone. */

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + n, 1)).toISOString().slice(0, 10);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function monthName(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1]!;
}

export function shortMonth(iso: string): string {
  return monthName(iso).slice(0, 3);
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[isoWeekday(iso) - 1]!;
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS_LONG[isoWeekday(iso) - 1]!;
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** "14–20 Sep", or "28 Sep – 4 Oct" across a month boundary. */
export function weekRange(from: string): string {
  const to = addDays(from, 6);
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${dayOfMonth(from)}–${dayOfMonth(to)} ${shortMonth(to)}`
    : `${dayOfMonth(from)} ${shortMonth(from)} – ${dayOfMonth(to)} ${shortMonth(to)}`;
}

/** "Friday 18 September". */
export function longDate(iso: string): string {
  return `${weekdayLong(iso)} ${dayOfMonth(iso)} ${monthName(iso)}`;
}
