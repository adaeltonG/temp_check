import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { outlets } from '../Api/prisma/outlets.js';

const url = new URL(process.env.TEST_DATABASE_URL);
assert.match(
  url.pathname,
  /^\/cbre_weekly_test_[a-z0-9_]+$/,
  'Use a dedicated CBRE weekly test database.',
);
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const existing = await client.query(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  );
  assert.equal(existing.rows[0].count, '0', 'Test database must start empty.');
  const migrations = fileURLToPath(new URL('../Api/prisma/migrations/', import.meta.url));
  const folders = (await readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
  for (const folder of folders.filter((name) => name < '202609080001')) {
    await client.query(
      await readFile(path.join(migrations, folder, 'migration.sql'), 'utf8'),
    );
  }
  const hash = await bcrypt.hash('weekly-test-password-123', 4);
  for (const [id, firstName, isAdmin] of [
    ['weekly-alice', 'Alice', false],
    ['weekly-bob', 'Bob', false],
    ['weekly-admin', 'Admin', true],
  ]) {
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "passwordHash", "isAdmin") VALUES ($1, $2, $3, $4, $5)',
      [id, `${id}@example.com`, firstName, hash, isAdmin],
    );
  }
  for (const outlet of outlets) {
    await client.query(
      'INSERT INTO "Outlet" ("id", "level", "location", "label", "note", "sortOrder") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        outlet.id,
        outlet.level,
        outlet.location,
        outlet.label,
        outlet.note || null,
        outlet.sortOrder,
      ],
    );
  }
  const events = [
    ['legacy-one', '2026-08-24', 'weekly-alice', [[outlets[0].id, 100]]],
    ['legacy-two', '2026-08-30', 'weekly-bob', [[outlets[0].id, 102]]],
    ['legacy-three', '2026-08-31', 'weekly-alice', [[outlets[0].id, 105]]],
    [
      'legacy-four',
      '2026-09-02',
      'weekly-bob',
      [
        [outlets[0].id, 108],
        [outlets[1].id, 200],
      ],
    ],
  ];
  for (const [id, date, userId, readings] of events) {
    await client.query(
      'INSERT INTO "Inspection" ("id", "inspectorName", "performedOn", "createdAt", "userId") VALUES ($1,$2,$3,$4,$5)',
      [
        id,
        userId === 'weekly-alice' ? 'Alice' : 'Bob',
        date,
        `${date}T12:00:00Z`,
        userId,
      ],
    );
    for (const [outletId, current] of readings) {
      await client.query(
        'INSERT INTO "Reading" ("id", "inspectionId", "outletId", "current") VALUES ($1,$2,$3,$4)',
        [`${id}-${outletId}`, id, outletId, current],
      );
    }
  }
  await client.query('BEGIN');
  try {
    for (const folder of folders.filter((name) => name >= '202609080001')) {
      await client.query(
        await readFile(path.join(migrations, folder, 'migration.sql'), 'utf8'),
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  console.log(
    'Applied the weekly migration to an isolated database containing legacy multi-user, multi-save fixtures.',
  );
} finally {
  await client.end();
}
