# Water Control and Management

Next.js portal with JWT login → dashboard → weekly bottle refill checks. The **Temperature Logs** card serves the original `index.html`, `styles.css`, `app.js` and vendor files unchanged, through an authenticated Express route. Temperature records still use the existing browser-local database. New weekly checks use PostgreSQL through Prisma, with the Express API in `Api/`.

## Run locally

This workspace is configured for its own local PostgreSQL cluster on `127.0.0.1:5433`, database `cbredb`, with credentials in `Api/.env`. It uses the installed PostgreSQL 18 binaries and stores its data in the ignored `.local-postgres/` folder. Run `npm run db:local` to start it after a reboot, or `npm run db:local -- stop` to stop it. Then run `npm run dev` to start the application. This is a local process, not an installed Windows service. Set `POSTGRES_BIN` if the PostgreSQL binaries are installed elsewhere.

Requires Node.js 20.19+ (Node 22.12+ or 24 recommended), npm and PostgreSQL.

1. Run `npm install` (use `npm.cmd` on Windows if PowerShell blocks npm scripts).
2. Copy `Api/.env.example` to `Api/.env`. Set `DATABASE_URL` to a dedicated database, a random `JWT_SECRET` (at least 32 characters), and your initial account's `SEED_EMAIL`, `SEED_FIRST_NAME`, and `SEED_PASSWORD` (at least 8 characters). Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Start PostgreSQL. If Docker is available, `docker compose up -d` creates the local database matching the example URL. If port 5432 is occupied, use your existing server with a new database or change the Compose port and URL together.
4. Run `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed`.
5. Run `npm run dev` and open http://localhost:3000. Sign in with your seeded account.

For production, run `npm run build`, then `npm start` with `NODE_ENV=production`, HTTPS, and `APP_ORIGIN` set to the exact public origin. The API binds to loopback port 4000 and is reached through Next.js rewrites. Keep the original temperature files alongside the app. The seed command creates accounts without resetting existing passwords. There is no public registration flow.

## Weekly checks

- Name starts with the logged-in user's first name and remains editable. The account ID is also recorded for attribution.
- The date is today's date in Europe/London, supplied and checked by the API. The input is read-only to keep it aligned with the current-reading heading.
- Save one or more checked outlets; blank readings are omitted, and zero is a valid reading. Enter nonnegative whole-number counters.
- Each outlet?s last reading comes from its own latest saved check, with its actual date displayed (it may be older than one week). Skipping an outlet preserves its previous reading and date. The first inspection establishes a baseline; no historical counter values are invented from the blank photo.
- An increase shows **Used**, an equal counter shows **No change**, and a decrease is rejected for review. Counter replacement/reset handling is not yet implemented.
- Reports preserve the previous counter and date at save time, group by level, and support printing / saving PDF. History shows the latest 100 inspections.
- Concurrent submissions use a PostgreSQL transaction lock and baseline ID comparison. A stale form must refresh and review its readings before submitting.

## Photo transcription

Source data is in `Api/prisma/outlets.js`: Levels 02 and 06–18, three refill stations per level. Level 02 station 1's suffix is unreadable; Level 07 station 2 appears to say `6050` and is retained with a verification note; Level 18 station labels are cropped, so station numbers 1–3 are inferred and marked. Levels 14–18 have no visible room suffix. Verify these entries on site before operational use. The photo's procedural text has not been treated as application instructions.

## Validation

`npm run build` checks the Next.js production build. `npm test` covers authentication and reading validation. To run the database lifecycle/concurrency test, apply migrations to a fresh, separate test database and set `TEST_DATABASE_URL` before running `npm test`. The integration test inserts test records and requires an empty inspection table; never point it at operational data.

After the integration test, start the app against that same isolated database, set `RUN_BROWSER_TESTS=1`, and run `node scripts/browser-check.mjs` for a Microsoft Edge browser check (Edge must be installed). It checks login, cards, all 42 readings, saving, reports, mobile overflow, and the original temperature form. Screenshots go into the ignored `.test-artifacts/` folder. Browser credentials are test fixtures only.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma PostgreSQL setup](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).
