import assert from 'node:assert/strict';
import test from 'node:test';
import { countdown } from '../../src/shared/domain/countdown.js';

void test('countdowns advance sessions, skip cancellations and retain unknown start times', () => {
  const now = Date.parse('2026-03-28T12:00:00Z');
  const items = [
    { name: 'Cancelled', date: '2026-03-28', start: now + 5000, cancelled: true },
    { name: 'Qualifying', date: '2026-03-28', start: now + 90061000 },
    { name: 'Race', date: '2026-03-30', time: '14:00:00Z' },
  ];
  assert.equal(countdown(items, now)!.text, '1d 1h 01m 01s');
  assert.equal(countdown(items, now + 90061000)!.text, 'Starting now');
  assert.equal(countdown(items, now + 90061001)!.session.name, 'Race');
  assert.equal(countdown([{ name: 'Practice', date: '2026-03-28' }], now)!.text, 'Time TBC');
  assert.equal(countdown(items, now + 9 * 86400000), null);
});
