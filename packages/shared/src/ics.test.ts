import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIcs, escapeIcsText, foldIcsLine } from './ics.ts';

describe('ics text', () => {
  it('escapes the four characters that break a property value', () => {
    assert.equal(escapeIcsText('A, B; C\\D\nE'), 'A\\, B\\; C\\\\D\\nE');
  });
  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const folded = foldIcsLine('DESCRIPTION:' + 'é'.repeat(60));
    const parts = folded.split('\r\n');
    assert.ok(parts.length >= 2);
    assert.ok(parts.every((p) => new TextEncoder().encode(p).length <= 75));
    assert.ok(parts.slice(1).every((p) => p.startsWith(' ')));
    assert.equal(
      parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(''),
      'DESCRIPTION:' + 'é'.repeat(60),
    );
  });
});

describe('buildIcs', () => {
  it('writes an all-day event per session with CRLF endings and the calendar name', () => {
    const ics = buildIcs(
      {
        name: 'Vela — training',
        prodId: '-//Vela//Training//EN',
        refreshMinutes: 60,
        events: [
          {
            uid: 'session-1@vela',
            date: '2026-09-07',
            summary: 'Lower body strength',
            description:
              'A. Romanian Deadlift — 3 × 8-10, 40 kg\nB. Single-Leg Bridge — 3 × 10 each side',
            url: 'https://www.vela-coaching.com/done/session-1?t=abc',
            status: 'TENTATIVE',
          },
        ],
      },
      new Date('2026-09-05T10:00:00Z'),
    );
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.match(ics, /X-WR-CALNAME:Vela — training\r\n/);
    assert.match(ics, /DTSTART;VALUE=DATE:20260907\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20260908\r\n/);
    assert.match(ics, /DTSTAMP:20260905T100000Z\r\n/);
    assert.match(ics, /DESCRIPTION:A\. Romanian Deadlift — 3 × 8-10\\, 40 kg\\nB\./);
    assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT60M/);
    assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  });
});
