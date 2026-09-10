import { test } from 'node:test';
import assert from 'node:assert/strict';
import { today } from '../src/domain.js';
import { addDays, mondayOfWeek, reportUpdateInput } from '../src/weekly-domain.js';

test('UK report weeks start on Monday across Sundays, year boundaries and daylight saving', () => {
  assert.equal(mondayOfWeek('2026-09-07'), '2026-09-07');
  assert.equal(mondayOfWeek('2026-09-13'), '2026-09-07');
  assert.equal(mondayOfWeek('2026-09-14'), '2026-09-14');
  assert.equal(mondayOfWeek('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2026-12-28', 6), '2027-01-03');
  assert.equal(today('Europe/London', new Date('2026-09-06T23:30:00Z')), '2026-09-07');
  assert.equal(
    mondayOfWeek(today('Europe/London', new Date('2026-03-29T23:30:00Z'))),
    '2026-03-30',
  );
  assert.equal(
    mondayOfWeek(today('Europe/London', new Date('2026-10-25T23:30:00Z'))),
    '2026-10-19',
  );
});

test('weekly update accepts zero and explicit clearing, but rejects invalid counters and versions', () => {
  const update = {
    inspectorName: 'Alice',
    version: 0,
    action: 'save',
    readings: [{ outletId: 'a', current: 0, version: 0 }],
  };
  assert(reportUpdateInput.safeParse(update).success);
  assert(
    reportUpdateInput.safeParse({ ...update, action: 'submit', readings: [] }).success,
  );
  assert(
    reportUpdateInput.safeParse({
      ...update,
      readings: [{ outletId: 'a', current: null, version: 1 }],
    }).success,
  );
  for (const current of [-1, 1.2, 2147483648, '3']) {
    assert.equal(
      reportUpdateInput.safeParse({
        ...update,
        readings: [{ outletId: 'a', current, version: 0 }],
      }).success,
      false,
    );
  }
  assert.equal(
    reportUpdateInput.safeParse({ ...update, inspectorName: ' ' }).success,
    false,
  );
  assert.equal(reportUpdateInput.safeParse({ ...update, version: -1 }).success, false);
  assert.equal(reportUpdateInput.safeParse({ ...update, isClosed: true }).success, false);
});
