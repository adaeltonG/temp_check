import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { today, inspectionInput, validateReadings } from './domain.js';

export function createApp(db, config) {
  if (!config.secret || config.secret.length < 32 || config.secret.startsWith('replace-')) throw new Error('Set a random JWT_SECRET of at least 32 characters.');
  const app = express();
  const cookie = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };
  const root = fileURLToPath(new URL('../../', import.meta.url));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '64kb' }), cookieParser());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.get('origin') !== config.origin) return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  async function authenticate(req, res, next) {
    try {
      const payload = jwt.verify(req.cookies.session, config.secret, { algorithms: ['HS256'], issuer: 'water-control', audience: 'water-control-app' });
      req.user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, firstName: true, email: true } });
      if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in.' });
      next(error);
    }
  }
  const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
  const dummyHash = bcrypt.hashSync('timing-only-placeholder', 12);
  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } }), async (req, res) => {
    const input = loginInput.parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    const valid = await bcrypt.compare(input.password, user?.passwordHash || dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = jwt.sign({}, config.secret, { subject: user.id, algorithm: 'HS256', expiresIn: '8h', issuer: 'water-control', audience: 'water-control-app' });
    res.cookie('session', token, { ...cookie, maxAge: 8 * 60 * 60 * 1000 }).json({ id: user.id, firstName: user.firstName, email: user.email });
  });
  app.post('/api/auth/logout', (_req, res) => res.clearCookie('session', cookie).json({ ok: true }));
  app.get('/api/auth/me', authenticate, (req, res) => res.json(req.user));
  app.use('/api/water', authenticate);
  const latest = tx => tx.inspection.findFirst({ orderBy: [{ performedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], include: { readings: true } });
  const outletBaselines = async tx => (await tx.outlet.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { readings: { take: 1, orderBy: [{ inspection: { performedOn: 'desc' } }, { inspection: { createdAt: 'desc' } }, { inspection: { id: 'desc' } }], include: { inspection: { select: { performedOn: true } } } } }
  })).map(({ readings, ...outlet }) => ({ ...outlet, lastReading: readings.length ? { current: readings[0].current, performedOn: readings[0].inspection.performedOn } : null }));
  app.get('/api/water/baseline', async (_req, res) => {
    const [outlets, previous] = await db.$transaction(async tx => [await outletBaselines(tx), await latest(tx)], { isolationLevel: 'RepeatableRead' });
    res.json({ outlets, previous, today: today(config.timeZone) });
  });
  app.get('/api/water/inspections', async (_req, res) => res.json(await db.inspection.findMany({ orderBy: [{ performedOn: 'desc' }, { createdAt: 'desc' }], take: 100, include: { _count: { select: { readings: true } } } })));
  app.get('/api/water/inspections/:id', async (req, res) => {
    const report = await db.inspection.findUnique({ where: { id: req.params.id }, include: { readings: { include: { outlet: true } } } });
    if (!report) return res.status(404).json({ error: 'Inspection not found.' });
    report.readings.sort((a, b) => a.outlet.sortOrder - b.outlet.sortOrder);
    res.json(report);
  });
  app.post('/api/water/inspections', async (req, res) => {
    const input = inspectionInput.parse(req.body);
    if (input.performedOn !== today(config.timeZone)) return res.status(400).json({ error: 'The check date must be today. Refresh the form if the date has changed.' });
    const report = await db.$transaction(async tx => {
      // Serialize baseline selection and insertion, including the first inspection.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(740921)`;
      const previous = await latest(tx);
      if ((previous?.id ?? null) !== input.baselineId) throw Object.assign(new Error('Another inspection was saved. Refresh the baseline and review your readings before saving.'), { status: 409 });
      const outlets = await outletBaselines(tx);
      const values = Object.fromEntries(outlets.filter(o => o.lastReading).map(o => [o.id, o.lastReading.current]));
      const dates = Object.fromEntries(outlets.map(o => [o.id, o.lastReading?.performedOn ?? null]));
      const error = validateReadings(input.readings, outlets, values);
      if (error) throw Object.assign(new Error(error), { status: 400 });
      return tx.inspection.create({ data: {
        inspectorName: input.inspectorName, performedOn: new Date(`${input.performedOn}T00:00:00Z`), userId: req.user.id,
        readings: { create: input.readings.map(r => ({ ...r, previous: values[r.outletId] ?? null, previousDate: dates[r.outletId] })) }
      } });
    });
    res.status(201).json(report);
  });
  // Serve the original files directly, without copying or changing their contents.
  app.use('/temperature', (req, res, next) => {
    if (!req.cookies.session) return res.redirect('/login');
    authenticate(req, res, next);
  });
  app.get('/temperature/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  for (const file of ['index.html', 'styles.css', 'app.js', 'vendor/sql-wasm.js', 'vendor/sql-wasm-data.js']) {
    app.get(`/temperature/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Please check the form fields.', details: error.issues });
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Unable to complete the request. Please try again.' });
  });
  return app;
}
