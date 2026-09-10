import 'dotenv/config';
import { db } from './db.js';
import { createApp } from './app.js';
const app = createApp(db, {
  secret: process.env.JWT_SECRET,
  origin: process.env.APP_ORIGIN || 'http://localhost:3000',
  production: process.env.NODE_ENV === 'production',
  timeZone: process.env.SITE_TIMEZONE || 'Europe/London',
  basePath: process.env.APP_BASE_PATH || '',
  cookieName: process.env.SESSION_COOKIE_NAME || 'session',
  trustProxy: process.env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
});
const server = app.listen(Number(process.env.PORT || 4000), '127.0.0.1', () =>
  console.log('Water Control API listening on port ' + (process.env.PORT || 4000)),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
