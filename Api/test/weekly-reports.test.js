import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { addDays, databaseDate } from '../src/weekly-domain.js';

test(
  'shared weekly reports: migration, progress, collaboration, submission and historical corrections',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
    assert.match(
      databaseUrl.pathname,
      /^\/cbre_weekly_test_[a-z0-9_]+$/,
      'Never run this test against an operational database.',
    );
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl.toString() }),
    });
    const secret = 'weekly-report-test-secret-longer-than-32-characters';
    const origin = 'http://localhost:3000';
    let now = new Date('2026-09-07T10:00:00Z');
    const app = createApp(db, {
      secret,
      origin,
      timeZone: 'Europe/London',
      now: () => now,
    });
    const cookie = (id) =>
      'session=' +
      jwt.sign({}, secret, {
        subject: id,
        issuer: 'water-control',
        audience: 'water-control-app',
        expiresIn: '1h',
      });
    const get = (path, user = 'weekly-alice') =>
      request(app)
        .get('/api/water/reports' + path)
        .set('Cookie', cookie(user));
    const patch = (report, readings, options = {}) =>
      request(app)
        .patch('/api/water/reports/' + report.id)
        .set('Origin', origin)
        .set('Cookie', cookie(options.user || 'weekly-alice'))
        .send({
          inspectorName: options.name || 'Alice',
          version: report.version,
          action: options.action || 'save',
          readings,
        });
    const change = (report, index, current) => ({
      outletId: report.outlets[index].id,
      current,
      version: report.outlets[index].reading?.version || 0,
    });

    try {
      // The setup applies the real migration to multiple legacy saves in two weeks.
      assert.equal(
        await db.inspection.count(),
        4,
        'Legacy inspections must be preserved.',
      );
      assert.equal(await db.reading.count(), 5, 'Legacy reading rows must be preserved.');
      assert.equal(await db.weeklyReport.count(), 2);
      const imported = (await get('/week-2026-08-31').expect(200)).body;
      assert.equal(imported.completedOutlets, 2);
      assert.equal(imported.outlets[0].reading.current, 108);
      assert.equal(imported.outlets[1].reading.current, 200);
      assert.equal(imported.outlets[0].lastReading.current, 102);
      assert.equal(imported.outlets[0].lastReading.recordedOn, '2026-08-30');
      assert.equal(imported.isClosed, false);
      assert.deepEqual(imported.contributors.map((person) => person.firstName).sort(), [
        'Alice',
        'Bob',
      ]);
      assert.equal(await db.reportActivity.count({ where: { action: 'import' } }), 4);

      await request(app).get('/api/water/reports/current').expect(401);
      let current = (await get('/current').expect(200)).body;
      const initial = current;
      assert.equal(current.weekStart, '2026-09-07');
      assert.equal(current.weekEnd, '2026-09-13');
      assert.equal(current.totalOutlets, 42);
      assert.equal(current.completedOutlets, 0);
      assert.equal(current.outlets[0].lastReading.current, 108);
      assert.equal((await get('/current').expect(200)).body.id, current.id);

      current = (await patch(current, [change(current, 0, 110)]).expect(200)).body;
      assert.equal(current.id, initial.id);
      assert.equal(current.isClosed, false);
      assert.equal(current.completedOutlets, 1);
      assert.equal(current.outlets[0].reading.recordedOn, '2026-09-07');
      assert.equal(current.outlets[0].reading.recordedBy.id, 'weekly-alice');

      // A different person on another day can merge another station from a stale form.
      now = new Date('2026-09-08T15:00:00Z');
      current = (
        await patch(initial, [change(initial, 1, 202)], {
          user: 'weekly-bob',
          name: 'Bob',
        }).expect(200)
      ).body;
      assert.equal(current.completedOutlets, 2);
      assert.equal(current.outlets[0].reading.current, 110);
      assert.equal(current.outlets[1].reading.recordedOn, '2026-09-08');
      assert.equal(current.outlets[1].reading.recordedBy.id, 'weekly-bob');
      assert.deepEqual(current.contributors.map((person) => person.firstName).sort(), [
        'Alice',
        'Bob',
      ]);
      await patch(initial, [change(initial, 0, 111)]).expect(409);
      await patch(initial, [], { action: 'submit' }).expect(409);

      // In-week corrections compare against the earlier WEEK, not the previous save.
      current = (await patch(current, [change(current, 0, 109)]).expect(200)).body;
      assert.equal(current.outlets[0].lastReading.current, 108);
      await patch(current, [change(current, 0, 107)]).expect(400);
      await patch(current, [change(current, 0, -1)]).expect(400);
      await patch(current, [change(current, 0, 109), change(current, 0, 109)]).expect(
        400,
      );
      await patch(current, [{ outletId: 'unknown', current: 1, version: 0 }]).expect(400);
      await patch(current, []).expect(400);

      // Zero is complete; explicit clearing retains a version to reject stale writes.
      current = (await patch(current, [change(current, 2, 0)]).expect(200)).body;
      assert.equal(current.outlets[2].reading.current, 0);
      const beforeClear = current;
      current = (await patch(current, [change(current, 2, null)]).expect(200)).body;
      assert.equal(current.completedOutlets, 2);
      await patch(beforeClear, [change(beforeClear, 2, 1)]).expect(409);
      current = (await patch(current, [change(current, 2, 0)]).expect(200)).body;

      const separate = await Promise.all([
        patch(current, [change(current, 3, 300)]),
        patch(current, [change(current, 4, 300)], { user: 'weekly-bob', name: 'Bob' }),
      ]);
      assert.deepEqual(
        separate.map((result) => result.status),
        [200, 200],
      );
      current = (await get('/current').expect(200)).body;
      const same = await Promise.all([
        patch(current, [change(current, 5, 300)]),
        patch(current, [change(current, 5, 301)], { user: 'weekly-bob', name: 'Bob' }),
      ]);
      assert.deepEqual(same.map((result) => result.status).sort(), [200, 409]);
      current = (await get('/current').expect(200)).body;
      const activityCount = await db.reportActivity.count({
        where: { reportId: current.id },
      });
      await patch(current, [], { action: 'submit' }).expect(400);
      assert.equal(
        await db.reportActivity.count({ where: { reportId: current.id } }),
        activityCount,
      );

      const missing = current.outlets.flatMap((outlet, index) =>
        outlet.reading?.current == null ? [change(current, index, 300)] : [],
      );
      current = (await patch(current, missing).expect(200)).body;
      assert.equal(current.completedOutlets, 42);
      assert.equal(
        current.isClosed,
        false,
        'Completeness must not close a report automatically.',
      );
      const completeDraft = current;
      current = (await patch(current, [], { action: 'submit' }).expect(200)).body;
      assert.equal(current.isClosed, true);
      assert.equal(current.canEdit, false);
      assert.equal(current.closedBy.id, 'weekly-alice');
      await patch(completeDraft, [change(completeDraft, 0, 111)]).expect(403);
      await patch(current, [], { action: 'submit', user: 'weekly-admin' }).expect(409);

      current = (
        await patch(current, [change(current, 0, 111)], {
          user: 'weekly-admin',
          name: 'Administrator',
        }).expect(200)
      ).body;
      assert.equal(current.isClosed, true);
      assert.equal(current.canEdit, true);
      assert.equal(current.closedBy.id, 'weekly-alice');
      await patch(current, [change(current, 0, null)], { user: 'weekly-admin' }).expect(
        400,
      );
      assert.equal((await get('/current').expect(200)).body.id, initial.id);
      assert.equal(
        (await get('').expect(200)).body.filter(
          (report) => report.weekStart === '2026-09-07',
        ).length,
        1,
      );

      // A separate report opens on the next Monday; older unfinished weeks stay open.
      now = new Date('2026-09-14T08:00:00Z');
      let next = (await get('/current').expect(200)).body;
      assert.equal(next.weekStart, '2026-09-14');
      assert.notEqual(next.id, current.id);
      assert.equal(next.completedOutlets, 0);
      assert.equal(next.outlets[0].lastReading.current, 111);
      const olderOpen = (await get('/week-2026-08-31').expect(200)).body;
      assert.equal(olderOpen.canEdit, true);
      await patch(olderOpen, [change(olderOpen, 1, 203)], {
        user: 'weekly-bob',
        name: 'Bob',
      }).expect(400);
      await patch(olderOpen, [change(olderOpen, 1, 201)], {
        user: 'weekly-bob',
        name: 'Bob',
      }).expect(200);
      next = (await patch(next, [change(next, 0, 120)]).expect(200)).body;
      current = (await get('/' + current.id, 'weekly-admin').expect(200)).body;
      await patch(current, [change(current, 0, 121)], { user: 'weekly-admin' }).expect(
        400,
      );
      await patch(current, [change(current, 0, 119)], { user: 'weekly-admin' }).expect(
        200,
      );
      next = (await get('/current').expect(200)).body;
      assert.equal(
        next.outlets[0].lastReading.current,
        119,
        'Historical corrections update later comparisons.',
      );
      await patch(next, [change(next, 0, 118)]).expect(400);

      // Submit can atomically save all remaining unsaved stations and close the week.
      const remaining = next.outlets.flatMap((outlet, index) =>
        outlet.reading?.current == null ? [change(next, index, 400)] : [],
      );
      next = (
        await patch(next, remaining, {
          action: 'submit',
          user: 'weekly-bob',
          name: 'Bob',
        }).expect(200)
      ).body;
      assert.equal(next.isClosed, true);
      assert.equal(next.completedOutlets, 42);
      assert.equal(next.closedBy.id, 'weekly-bob');
      assert.equal((await get('/week-2026-08-31').expect(200)).body.isClosed, false);
      await get('/missing').expect(404);
      await request(app)
        .post('/api/water/inspections')
        .set('Origin', origin)
        .set('Cookie', cookie('weekly-alice'))
        .send({})
        .expect(409);
      assert.equal(await db.inspection.count(), 4);
      assert.equal(await db.reading.count(), 5);
      // History remains navigable after more than 100 weeks, including open drafts.
      await db.weeklyReport.createMany({
        data: Array.from({ length: 105 }, (_, index) => ({
          weekStart: databaseDate(addDays('2020-01-06', index * 7)),
        })),
      });
      const firstPage = (await get('').expect(200)).body;
      assert.equal(firstPage.length, 100);
      const secondPage = (await get(`?before=${firstPage.at(-1).weekStart}`).expect(200))
        .body;
      assert.equal(secondPage.length, 9);
      assert.equal(
        new Set([...firstPage, ...secondPage].map((report) => report.id)).size,
        109,
      );
      await get('?before=not-a-date').expect(400);
      await get('?before=2026-02-30').expect(400);
    } finally {
      await db.$disconnect();
    }
  },
);
