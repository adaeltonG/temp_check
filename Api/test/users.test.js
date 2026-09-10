import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const secret = 'user-management-test-secret-over-32-characters';
const origin = 'https://zetahub.co.uk';
const password = 'test-password-123';

function fixture() {
  const users = new Map([
    [
      'admin',
      {
        id: 'admin',
        firstName: 'Admin',
        email: 'admin@example.com',
        isAdmin: true,
        passwordHash: bcrypt.hashSync(password, 4),
      },
    ],
    [
      'member',
      {
        id: 'member',
        firstName: 'Member',
        email: 'member@example.com',
        isAdmin: false,
        passwordHash: bcrypt.hashSync(password, 4),
      },
    ],
  ]);
  const selectUser = (user, select) =>
    user &&
    (select
      ? Object.fromEntries(Object.keys(select).map((key) => [key, user[key]]))
      : user);
  const db = {
    user: {
      findUnique: async ({ where, select }) =>
        selectUser(
          where.id
            ? users.get(where.id)
            : [...users.values()].find((user) => user.email === where.email),
          select,
        ),
      create: async ({ data, select }) => {
        if ([...users.values()].some((user) => user.email === data.email))
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        const user = { id: `created-${users.size}`, ...data };
        users.set(user.id, user);
        return selectUser(user, select);
      },
    },
  };
  const app = createApp(db, { secret, origin });
  const cookie = (id) =>
    'session=' +
    jwt.sign({ isAdmin: true }, secret, {
      subject: id,
      issuer: 'water-control',
      audience: 'water-control-app',
      expiresIn: '1h',
    });
  const create = (body, id = 'admin') =>
    request(app)
      .post('/api/users')
      .set('Origin', origin)
      .set('Cookie', cookie(id))
      .send(body);
  return { app, users, cookie, create };
}

test('creating users requires authentication and the current database admin role', async () => {
  const { app, users, cookie, create } = fixture();
  const body = { firstName: 'New', email: 'new@example.com', password, isAdmin: true };
  await request(app).post('/api/users').set('Origin', origin).send(body).expect(401);
  await create(body, 'member').expect(403);
  await create(body, 'missing').expect(401);
  await request(app)
    .post('/api/users')
    .set('Cookie', cookie('admin'))
    .send(body)
    .expect(403);
  users.get('admin').isAdmin = false;
  await create(body).expect(403);
  assert.equal(users.size, 2);
});

test('admins can create regular and admin accounts; passwords are hashed and never returned', async () => {
  const { app, users, cookie, create } = fixture();
  for (const isAdmin of [false, true]) {
    const email = isAdmin ? 'new-admin@example.com' : 'new-member@example.com';
    const result = await create({
      firstName: '  Jamie  ',
      email: `  ${email.toUpperCase()}  `,
      password,
      isAdmin,
    }).expect(201);
    assert.deepEqual(result.body, {
      id: result.body.id,
      firstName: 'Jamie',
      email,
      isAdmin,
    });
    const stored = users.get(result.body.id);
    assert.notEqual(stored.passwordHash, password);
    assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    assert.equal(login.body.isAdmin, isAdmin);
    assert.equal('passwordHash' in login.body, false);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie(stored.id))
      .expect(200);
    assert.deepEqual(me.body, result.body);
    if (!isAdmin)
      await create(
        { firstName: 'Denied', email: 'denied@example.com', password, isAdmin: true },
        stored.id,
      ).expect(403);
  }
  const defaultUser = await create({
    firstName: 'Default',
    email: 'default@example.com',
    password,
  }).expect(201);
  assert.equal(defaultUser.body.isAdmin, false);
});

test('duplicate email cannot overwrite an account or change its password or role', async () => {
  const { users, create } = fixture();
  const before = { ...users.get('member') };
  const result = await create({
    firstName: 'Overwrite',
    email: ' MEMBER@EXAMPLE.COM ',
    password: 'different-password',
    isAdmin: true,
  }).expect(409);
  assert.equal(result.body.error, 'A user with this email already exists.');
  assert.deepEqual(users.get('member'), before);
  assert.equal(users.size, 2);
});

test('invalid user data is rejected, including strings for role and overlong bcrypt input', async () => {
  const { users, create } = fixture();
  const body = { firstName: 'Jamie', email: 'new@example.com', password, isAdmin: false };
  for (const invalid of [
    { firstName: ' ' },
    { firstName: 'x'.repeat(81) },
    { email: 'invalid' },
    { password: 'short' },
    { password: 'x'.repeat(73) },
    { password: 'é'.repeat(37) },
    { isAdmin: 'true' },
    { isAdmin: 1 },
    { isAdmin: null },
    { id: 'admin' },
  ])
    await create({ ...body, ...invalid }).expect(400);
  assert.equal(users.size, 2);
});
