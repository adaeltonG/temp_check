# Water Control and Management

Next.js inspection portal with an Express API and PostgreSQL/Prisma persistence. The dashboard provides shared weekly bottle-refill reports, the temperature-check form, and an admin-only Add User form.

## Weekly reports

- One shared report covers Monday–Sunday in Europe/London. The current week's draft is created automatically when accessed.
- Everyone sees the saved station readings and can continue an open report over several days. Each saved station records its inspector, account, and date.
- **Save inspection** keeps partial progress in the same report. Blank stations remain unfinished; zero is a valid reading.
- **Submit** appears after every station has a reading. It saves any remaining changes and closes the report atomically. Filling all stations does not close a report by itself.
- Regular users can edit any open report, including unfinished older weeks. A new week starts separately; it does not close older drafts.
- Admins can correct closed reports. Closed reports retain all station readings and remain closed after corrections.
- Previous readings come from earlier weeks, never another save in the same week. Corrections must remain between the preceding and following recorded counters. Historical corrections update later comparisons.
- Concurrent changes to different stations merge. Changes to the same station require a reload and review; unsaved input remains visible until the user chooses to reload. Submission requires the latest report version.
- History groups reports by week and supports loading older pages. Printable reports include status, contributors, and per-station saved names/dates.

Original Inspection and Reading database rows are retained as an archive. The weekly migration imports the latest reading per station per week into open reports, preserving legacy saves as activity records.

## Accounts

Admins can use **Add User** at the dashboard's top right. Enter a first name, email and password, and optionally select **Admin**. Regular accounts cannot create users, even through the API. Passwords are hashed; duplicate emails cannot overwrite an existing account.

The seed command creates a new bootstrap account as an admin. It does not reset existing passwords or roles.

## Local setup

Requires Node.js 20.19+ and PostgreSQL.

1. Run `npm install` (`npm.cmd` on Windows if PowerShell blocks npm scripts).
2. Copy `Api/.env.example` to `Api/.env` and configure a dedicated `DATABASE_URL`, random `JWT_SECRET`, and initial `SEED_EMAIL`, `SEED_FIRST_NAME`, and `SEED_PASSWORD`.
3. Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`.
4. Run `npm run dev`, then open http://localhost:3000.

The optional `npm run db:local` helper starts the project's local Windows PostgreSQL cluster when previously configured. Docker users can use `docker compose up -d` with an appropriate database URL.

## Formatting and checks

- `npm run format` formats hand-authored source with Prettier.
- `npm run format:check` checks formatting.
- `npx prisma format --schema Api/prisma/schema.prisma` formats the database schema.
- `npm test` runs API authorization and pure validation/date tests. Database integration is skipped unless `TEST_DATABASE_URL` is set.
- `npm run build` checks the production build.

The real weekly integration test requires a fresh, dedicated database named `cbre_weekly_test_<suffix>`. Set `TEST_DATABASE_URL`, run `node scripts/prepare-weekly-test.mjs`, then `npm test`. Preparation applies the actual migrations around legacy fixture data. Never use an operational database.

`RUN_BROWSER_TESTS=1 TEST_BASE_URL=http://127.0.0.1:13300/cbre node scripts/browser-check.mjs` exercises the complete collaborative workflow against the isolated test fixture app. It writes fixture readings and requires the test app's clock to be 21 September 2026. `node scripts/partial-browser-check.mjs` checks zero/partial saves using mocked API responses. Both scripts use installed Microsoft Edge and accept only loopback targets.

## Production

See [deployment notes](deploy/README.md). CBRE is installed at `/var/www/cbre` and served below `/cbre`. Dedicated services run the frontend on loopback port 3200 and the API on 4300. Preserve the private environment files when deploying. Build in staging, back up the database and current build, apply migrations, and restart only the CBRE services.

The temperature form retains its browser-local database behavior. Source formatting does not migrate or erase browser-stored temperature records.
