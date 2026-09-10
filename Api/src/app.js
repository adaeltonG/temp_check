import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerWeeklyReportRoutes } from './weekly-reports.js';

const publicUserFields = { id: true, firstName: true, email: true, isAdmin: true };
const newUserInput = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z
      .string()
      .min(8)
      .max(72)
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') <= 72,
        'Password must be at most 72 UTF-8 bytes.',
      ),
    isAdmin: z.boolean().default(false),
  })
  .strict();

export function createApp(db, config) {
  if (!config.secret || config.secret.length < 32 || config.secret.startsWith('replace-'))
    throw new Error('Set a random JWT_SECRET of at least 32 characters.');
  const app = express();
  const cookieName = config.cookieName || 'session';
  const allowedOrigins = config.origin.split(',').map((origin) => origin.trim());
  const cookie = {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: config.basePath || '/',
  };
  const root = fileURLToPath(new URL('../../', import.meta.url));
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '64kb' }), cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use((req, res, next) => {
    if (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) &&
      !allowedOrigins.includes(req.get('origin'))
    )
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  async function authenticate(req, res, next) {
    try {
      const payload = jwt.verify(req.cookies[cookieName], config.secret, {
        algorithms: ['HS256'],
        issuer: 'water-control',
        audience: 'water-control-app',
      });
      req.user = await db.user.findUnique({
        where: { id: payload.sub },
        select: publicUserFields,
      });
      if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
      next();
    } catch (error) {
      if (
        error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError
      )
        return res
          .status(401)
          .json({ error: 'Your session has expired. Please sign in.' });
      next(error);
    }
  }
  const loginInput = z.object({
    email: z.email().max(254),
    password: z.string().min(1).max(200),
  });
  const dummyHash = bcrypt.hashSync('timing-only-placeholder', 12);
  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 15,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    }),
    async (req, res) => {
      const input = loginInput.parse(req.body);
      const user = await db.user.findUnique({
        where: { email: input.email.trim().toLowerCase() },
      });
      const valid = await bcrypt.compare(input.password, user?.passwordHash || dummyHash);
      if (!user || !valid)
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      const token = jwt.sign({}, config.secret, {
        subject: user.id,
        algorithm: 'HS256',
        expiresIn: '8h',
        issuer: 'water-control',
        audience: 'water-control-app',
      });
      res.cookie(cookieName, token, { ...cookie, maxAge: 8 * 60 * 60 * 1000 }).json({
        id: user.id,
        firstName: user.firstName,
        email: user.email,
        isAdmin: user.isAdmin,
      });
    },
  );
  app.post('/api/auth/logout', (_req, res) =>
    res.clearCookie(cookieName, cookie).json({ ok: true }),
  );
  app.get('/api/auth/me', authenticate, (req, res) => res.json(req.user));
  app.post('/api/users', authenticate, async (req, res) => {
    if (req.user.isAdmin !== true)
      return res.status(403).json({ error: 'Only admins can add users.' });
    const input = newUserInput.safeParse(req.body);
    if (!input.success)
      return res.status(400).json({
        error:
          'Enter a first name, a valid email, a password of 8–72 characters (at most 72 UTF-8 bytes), and a valid admin selection.',
      });
    const { password, ...profile } = input.data;
    try {
      const user = await db.user.create({
        data: { ...profile, passwordHash: await bcrypt.hash(password, 12) },
        select: publicUserFields,
      });
      res.status(201).json(user);
    } catch (error) {
      if (error.code === 'P2002')
        return res.status(409).json({ error: 'A user with this email already exists.' });
      throw error;
    }
  });
  app.use('/api/water', authenticate);
  registerWeeklyReportRoutes(app, db, config);
  // Serve the original files directly, without copying or changing their contents.
  app.use('/temperature', (req, res, next) => {
    if (!req.cookies[cookieName]) return res.redirect(`${config.basePath || ''}/login`);
    authenticate(req, res, next);
  });
  app.get('/temperature/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  for (const file of [
    'index.html',
    'styles.css',
    'app.js',
    'vendor/sql-wasm.js',
    'vendor/sql-wasm-data.js',
  ]) {
    app.get(`/temperature/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: 'Please check the form fields.', details: error.issues });
    if (error.status && error.status < 500)
      return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Unable to complete the request. Please try again.' });
  });
  return app;
}
