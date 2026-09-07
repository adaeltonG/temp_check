import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { today, inspectionInput, validateReadings } from '../src/domain.js';
import { outlets } from '../prisma/outlets.js';

test('photo data has 42 distinct outlets and marks uncertain cells', () => {
  assert.equal(outlets.length, 42); assert.equal(new Set(outlets.map(o => o.id)).size, 42);
  assert.equal(outlets.filter(o => o.note).length, 0);
});
test('partial readings are accepted; empty, unknown, duplicate, decreasing and fractional counters are rejected', () => {
  const locations = [{ id: 'a' }, { id: 'b' }];
  assert.equal(validateReadings([{ outletId: 'a', current: 0 }], locations, {}), null);
  assert.ok(validateReadings([], locations, {}));
  assert.ok(validateReadings([{ outletId: 'unknown', current: 4 }], locations, {}));
  assert.ok(validateReadings([{ outletId: 'a', current: 4 }, { outletId: 'a', current: 4 }], locations, {}));
  assert.ok(validateReadings([{ outletId: 'a', current: 4 }, { outletId: 'b', current: 1 }], locations, { a: 5 }));
  assert.equal(validateReadings([{ outletId: 'a', current: 5 }, { outletId: 'b', current: 0 }], locations, { a: 5 }), null);
  assert.equal(inspectionInput.safeParse({ inspectorName: 'A', performedOn: today(), baselineId: null, readings: [{ outletId: 'a', current: 1.5 }] }).success, false);
});
const secret = 'test-only-secret-with-more-than-32-characters';
const origin = 'http://localhost:3000';
const user = { id: 'test-user', firstName: 'Alex', email: 'test@example.com', passwordHash: bcrypt.hashSync('test-password-123', 4) };
const authApp = createApp({ user: { findUnique: async () => user } }, { secret, origin });
test('JWT login, invalid password, missing/tampered token and CSRF origin', async () => {
  await request(authApp).get('/api/auth/me').expect(401);
  await request(authApp).get('/api/auth/me').set('Cookie', 'session=tampered').expect(401);
  await request(authApp).post('/api/auth/login').send({ email: user.email, password: 'wrong' }).expect(403);
  await request(authApp).post('/api/auth/login').set('Origin', origin).send({ email: user.email, password: 'wrong' }).expect(401);
  const result = await request(authApp).post('/api/auth/login').set('Origin', origin).send({ email: user.email, password: 'test-password-123' }).expect(200);
  const cookie = result.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  await request(authApp).get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
  const expired = jwt.sign({}, secret, { subject: user.id, expiresIn: -1, issuer: 'water-control', audience: 'water-control-app' });
  await request(authApp).get('/api/auth/me').set('Cookie', `session=${expired}`).expect(401);
  const logout = await request(authApp).post('/api/auth/logout').set('Origin', origin).expect(200);
  assert.match(logout.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});

// Integration tests require an isolated database with migrations applied.
test('PostgreSQL inspection lifecycle, saved comparisons and concurrent submission protection', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const app = createApp(db, { secret, origin, timeZone: 'Europe/London' });
  try {
    // Never clear tables: the dedicated test database must start empty.
    assert.equal(await db.inspection.count(), 0, 'Use a fresh test database.');
    await db.user.create({ data: user });
    await db.outlet.createMany({ data: outlets });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').set('Origin', origin).send({ email: user.email, password: 'test-password-123' }).expect(200);
    const initial = (await agent.get('/api/water/baseline').expect(200)).body;
    assert.equal(initial.previous, null);
    const payload = { inspectorName: 'Different inspector', performedOn: initial.today, baselineId: null, readings: outlets.map(o => ({ outletId: o.id, current: 100 })) };
    const first = (await agent.post('/api/water/inspections').set('Origin', origin).send(payload).expect(201)).body;
    const report = (await agent.get(`/api/water/inspections/${first.id}`).expect(200)).body;
    assert.equal(report.inspectorName, 'Different inspector'); assert.equal(report.userId, user.id); assert.equal(report.readings[0].previous, null);
    await agent.post('/api/water/inspections').set('Origin', origin).send(payload).expect(409);
    payload.baselineId = first.id;
    payload.readings[0].current = 99;
    await agent.post('/api/water/inspections').set('Origin', origin).send(payload).expect(400);
    payload.readings[0].current = 105;
    const simultaneous = await Promise.all([1, 2].map(() => agent.post('/api/water/inspections').set('Origin', origin).send(payload)));
    assert.deepEqual(simultaneous.map(r => r.status).sort(), [201, 409]);
    const second = simultaneous.find(r => r.status === 201).body;
    const secondReport = (await agent.get(`/api/water/inspections/${second.id}`).expect(200)).body;
    assert.equal(secondReport.readings[0].previous, 100); assert.equal(secondReport.readings[0].current, 105);
    assert.equal(secondReport.readings[1].previous, secondReport.readings[1].current);
    assert.equal((await agent.get('/api/water/inspections').expect(200)).body.length, 2);
    // Give the older baseline a distinct date to verify skipped outlets retain it.
    const olderDate = new Date(`${initial.today}T00:00:00Z`);
    olderDate.setUTCDate(olderDate.getUTCDate() - 7);
    await db.inspection.updateMany({ data: { performedOn: olderDate } });
    const currentBaseline = (await agent.get('/api/water/baseline').expect(200)).body;
    const partial = { ...payload, baselineId: currentBaseline.previous.id, readings: [{ outletId: outlets[0].id, current: 110 }] };
    await agent.post('/api/water/inspections').set('Origin', origin).send({ ...partial, readings: [] }).expect(400);
    const partialSaved = (await agent.post('/api/water/inspections').set('Origin', origin).send(partial).expect(201)).body;
    const partialReport = (await agent.get(`/api/water/inspections/${partialSaved.id}`).expect(200)).body;
    assert.equal(partialReport.readings.length, 1);
    assert.equal(partialReport.readings[0].previous, 105);
    assert.equal(partialReport.readings[0].previousDate, olderDate.toISOString());
    const carried = (await agent.get('/api/water/baseline').expect(200)).body;
    assert.equal(carried.outlets[0].lastReading.current, 110);
    assert.equal(carried.outlets[1].lastReading.current, 100);
    assert.equal(carried.outlets[1].lastReading.performedOn, olderDate.toISOString());
    const resumed = { ...partial, baselineId: partialSaved.id, readings: [{ outletId: outlets[1].id, current: 99 }] };
    await agent.post('/api/water/inspections').set('Origin', origin).send(resumed).expect(400);
    resumed.readings[0].current = 101;
    const resumedSaved = (await agent.post('/api/water/inspections').set('Origin', origin).send(resumed).expect(201)).body;
    const resumedReport = (await agent.get(`/api/water/inspections/${resumedSaved.id}`).expect(200)).body;
    assert.equal(resumedReport.readings[0].previous, 100);
    assert.equal(resumedReport.readings[0].previousDate, olderDate.toISOString());
    await agent.get('/temperature/index.html').expect(200).expect(/Hot and Cold Water Temperature Checks/);
    await request(app).get('/temperature/index.html').expect(302);
  } finally { await db.$disconnect(); }
});
