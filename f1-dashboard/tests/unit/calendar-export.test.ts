import assert from 'node:assert/strict';
import test from 'node:test';
import { weekendCalendar } from '../../src/shared/domain/calendar-export.js';

void test('calendar export uses UTC around DST, all-day TBC events and stable session IDs', () => {
  const weekend = {
    season: '2026',
    round: '1',
    name: 'Test, Grand Prix; 🏁',
    circuit: 'Circuit\nNew line',
    sessions: [
      {
        slug: 'qualifying',
        name: 'Qualifying',
        date: '2026-03-28',
        time: '13:00:00Z',
        end: Date.parse('2026-03-28T14:00:00Z'),
      },
      { slug: 'race', name: 'Race', date: '2026-03-29', time: '13:00:00Z' },
      { slug: 'practice-1', name: 'Practice 1', date: '2026-03-27', cancelled: true },
    ],
  };
  const calendar = weekendCalendar(weekend, { now: Date.parse('2026-03-20T00:00:00Z') });
  assert.match(calendar, /DTSTART:20260328T130000Z/);
  assert.match(calendar, /DTSTART:20260329T130000Z/);
  assert.match(calendar, /DTEND:20260328T140000Z/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20260327/);
  assert.match(calendar, /DTEND;VALUE=DATE:20260328/);
  assert.match(calendar, /STATUS:CANCELLED/);
  assert.match(calendar, /UID:gridline-2026-1-race@gridline.local/);
  assert.match(calendar, /Test\\, Grand Prix\\; 🏁/);
  assert.match(calendar, /LOCATION:Circuit\\nNew line/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
});

void test('calendar line folding preserves Unicode and the iCalendar 75-byte limit', () => {
  const title = 'é'.repeat(75) + '🏁'.repeat(15);
  const calendar = weekendCalendar(
    {
      season: '2026',
      round: '2',
      name: title,
      sessions: [{ name: 'Race', slug: 'race', date: '2026-01-01', time: '00:00:00Z' }],
    },
    { now: 0 },
  );
  assert.ok(calendar.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75));
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(title));
});
