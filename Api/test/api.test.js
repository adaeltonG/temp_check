import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { outlets } from '../prisma/outlets.js';

test('photo data has 42 distinct outlets and marks uncertain cells', () => {
  assert.equal(outlets.length, 42);
  assert.equal(new Set(outlets.map((o) => o.id)).size, 42);
  assert.equal(outlets.filter((o) => o.note).length, 0);
});
const secret = 'test-only-secret-with-more-than-32-characters';
const origin = 'http://localhost:3000';
const user = {
  id: 'test-user',
  firstName: 'Alex',
  email: 'test@example.com',
  passwordHash: bcrypt.hashSync('test-password-123', 4),
};
const authApp = createApp({ user: { findUnique: async () => user } }, { secret, origin });
test('JWT login, invalid password, missing/tampered token and CSRF origin', async () => {
  await request(authApp).get('/api/auth/me').expect(401);
  await request(authApp)
    .get('/api/auth/me')
    .set('Cookie', 'session=tampered')
    .expect(401);
  await request(authApp)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'wrong' })
    .expect(403);
  await request(authApp)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password: 'wrong' })
    .expect(401);
  const result = await request(authApp)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password: 'test-password-123' })
    .expect(200);
  const cookie = result.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  await request(authApp)
    .get('/api/auth/me')
    .set('Cookie', cookie.split(';')[0])
    .expect(200);
  const expired = jwt.sign({}, secret, {
    subject: user.id,
    expiresIn: -1,
    issuer: 'water-control',
    audience: 'water-control-app',
  });
  await request(authApp)
    .get('/api/auth/me')
    .set('Cookie', `session=${expired}`)
    .expect(401);
  const logout = await request(authApp)
    .post('/api/auth/logout')
    .set('Origin', origin)
    .expect(200);
  assert.match(logout.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});

test('subpath deployment isolates its secure cookie and keeps temperature redirects under /cbre', async () => {
  const app = createApp(
    { user: { findUnique: async () => user } },
    {
      secret,
      origin,
      production: true,
      basePath: '/cbre',
      cookieName: 'cbre_session',
      trustProxy: 'loopback',
    },
  );
  await request(app)
    .get('/temperature/index.html')
    .expect(302)
    .expect('Location', '/cbre/login');
  const result = await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-Forwarded-For', '203.0.113.10')
    .send({ email: user.email, password: 'test-password-123' })
    .expect(200);
  const cookie = result.headers['set-cookie'][0];
  assert.match(cookie, /^cbre_session=/);
  assert.match(cookie, /Path=\/cbre;/);
  assert.match(cookie, /Secure/);
  await request(app).get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
  await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookie.split(';')[0].replace('cbre_session=', 'session='))
    .expect(401);
  const logout = await request(app)
    .post('/api/auth/logout')
    .set('Origin', origin)
    .expect(200);
  assert.match(logout.headers['set-cookie'][0], /^cbre_session=; Path=\/cbre;/);
});
