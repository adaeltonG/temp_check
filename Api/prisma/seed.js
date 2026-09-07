import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/db.js';
import { outlets } from './outlets.js';
try {
  const { SEED_EMAIL: email, SEED_PASSWORD: password, SEED_FIRST_NAME: firstName } = process.env;
  if (!email || !firstName || !password || password.length < 8 || password.startsWith('replace-')) throw new Error('Set SEED_EMAIL, SEED_FIRST_NAME and a real SEED_PASSWORD (8+ characters) in Api/.env.');
  await db.$transaction(async tx => {
    for (const outlet of outlets) await tx.outlet.upsert({ where: { id: outlet.id }, create: outlet, update: outlet });
    await tx.user.upsert({ where: { email: email.toLowerCase().trim() }, update: {}, create: { email: email.toLowerCase().trim(), firstName, passwordHash: await bcrypt.hash(password, 12) } });
  });
  console.log(`Seeded ${outlets.length} outlets and login account. Existing passwords are unchanged.`);
} finally { await db.$disconnect(); }
