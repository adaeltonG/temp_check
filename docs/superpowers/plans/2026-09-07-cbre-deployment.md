# CBRE Deployment Implementation Plan

> Execute inline in this session. The user authorized deployment through `ssh linux`.

**Goal:** Publish this project at www.zetahub.co.uk/cbre from /var/www/cbre.

**Architecture:** Run Next.js and Express as dedicated systemd services on loopback ports 3200 and 4300. Use a dedicated PostgreSQL database and role named cbre. Add only CBRE locations to the existing zetahub Nginx server, backing up and testing its configuration before a graceful reload.

**Tech Stack:** Next.js, Express, Prisma, PostgreSQL, Nginx, systemd.

## Global Constraints

- Do not alter other project directories, databases, services, or URL handlers.
- Keep secrets outside version control and credentials out of command output.
- Verify the requested www hostname separately from the apex domain.

## Task 1: Support deployment below /cbre

Files: next.config.mjs, app/lib.js, app/page.js, app/dashboard/page.js, Api/src/app.js, Api/src/server.js, environment examples, Api/test/api.test.js.

- [x] Configure NEXT_PUBLIC_BASE_PATH and API_INTERNAL_ORIGIN, with existing local defaults.
- [x] Prefix native links, fetch calls, and server redirects; use Next's automatic base path for Link and client router navigation.
- [x] Configure APP_BASE_PATH=/cbre, SESSION_COOKIE_NAME=cbre_session and loopback proxy trust in production.
- [x] Verify cookie path, cookie-name isolation, origin enforcement, and temperature login redirects with focused API tests.
- [x] Run npm ci, npm run db:generate, npm test, and npm run build with production path settings.

## Task 2: Install isolated services

Files: deploy/cbre-api.service, deploy/cbre-web.service, deploy/cbre.nginx.conf, deploy/README.md.

- [x] Confirm the target directory, database, role, user, ports, and unit names are unused.
- [x] Create /var/www/cbre and upload only project source, lockfile, and deployment files.
- [x] Create a dedicated cbre service user, database role, and database; generate fresh database and JWT secrets.
- [x] Migrate and seed only the new database, using the user's account details or a documented initial account if no reply arrives.
- [x] Build in the new directory and enable only the two cbre services.

## Task 3: Route and verify

- [x] Save the existing zetahub Nginx configuration and response hashes for existing routes under /var/www/cbre/deploy/backups.
- [x] Insert one include for CBRE locations, confirm the diff only adds that include, run nginx -t, and reload gracefully. Restore the backup if validation fails.
- [x] Verify login, authenticated API reads, temperature assets, redirects, and browser navigation under /cbre. Do not create fake production inspections.
- [x] Compare existing route response hashes and service state after deployment.
- [ ] Confirm public HTTPS on the requested www hostname. If the remotely managed Cloudflare tunnel lacks this hostname, report the precise external blocker while completing all available server work.

## Rollback

Remove only the CBRE include from the zetahub server, test Nginx, then reload. Stop and disable cbre-web and cbre-api. Retain /var/www/cbre and the cbre database for recovery; do not delete data automatically. Restore a full saved Nginx file only when no intervening changes occurred.
