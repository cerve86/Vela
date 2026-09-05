/**
 * An iCalendar feed, written by hand.
 *
 * The format is small and the libraries for it are not; what matters is getting three
 * things right that a calendar client will otherwise refuse silently: CRLF line endings,
 * lines folded at 75 octets, and escaping of commas, semicolons and newlines in text.
 * All-day events, because a planned session has a date and not a time — the client
 * decides when in the day she trains, and an event pinned to 09:00 would be a lie she
 * has to move.
 */

export interface IcsEvent {
  uid: string;
  /** ISO date, all-day. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  /** ISO timestamp; when the entry last changed, so a client knows to refresh it. */
  lastModified?: string;
  /** Tentative for a planned session, confirmed once it is done. */
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
}

export interface IcsCalendar {
  /** e.g. "Vela — training". Shown as the subscribed calendar's name. */
  name: string;
  prodId: string;
  events: IcsEvent[];
  /** Suggested refresh interval in minutes; honoured by some clients. */
  refreshMinutes?: number;
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space. */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const limit = first ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    // Do not split a multi-byte character: back up to a byte that starts one.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push((first ? '' : ' ') + new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    first = false;
  }
  return out.join('\r\n');
}

function stamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcs(cal: IcsCalendar, now = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${cal.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(cal.name)}`,
    `NAME:${escapeIcsText(cal.name)}`,
  ];
  if (cal.refreshMinutes) {
    lines.push(
      `REFRESH-INTERVAL;VALUE=DURATION:PT${cal.refreshMinutes}M`,
      `X-PUBLISHED-TTL:PT${cal.refreshMinutes}M`,
    );
  }
  const dtstamp = stamp(now.toISOString());
  for (const e of cal.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay(e.date).replace(/-/g, '')}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.status) lines.push(`STATUS:${e.status}`);
    if (e.lastModified) lines.push(`LAST-MODIFIED:${stamp(e.lastModified)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
