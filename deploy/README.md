# CBRE server deployment

Project directory: `/var/www/cbre`, SSH alias: `linux`.

## Deployment status — 7 September 2026

Live and verified: https://zetahub.co.uk/cbre. The exact requested www hostname is configured and tested at the origin, but public https://www.zetahub.co.uk/cbre returns Cloudflare's 404 fallback. The remotely managed tunnel currently has only the apex hostname route. Add a published route for `www.zetahub.co.uk`, path `^/cbre(/.*)?$`, service `http://localhost:80` to complete that address.

Production build and four API tests passed; the database integration test was skipped because it requires a separate test database. Browser verification covered login, dashboard, the weekly form with 42 outlets, and temperature form initialization. HTTP checks covered both accepted origins, cookie scoping, authentication, asset hashes, origin enforcement, and logout. No production inspections were created. All 11 existing route response/status fingerprints matched after deployment; the only existing Nginx configuration edit was the CBRE include.

Initial account: `admin@zetahub.co.uk`. The generated password is in the private server file `/var/www/cbre/deploy/initial-access.txt` and the ignored, access-restricted local file `.test-artifacts/cbre-access.txt`.

- Frontend: `cbre-web.service`, loopback port 3200, base path `/cbre`.
- API: `cbre-api.service`, loopback port 4300.
- PostgreSQL: dedicated `cbre` role and database on the existing server.
- Runtime user: `cbre`.
- Frontend environment: `/var/www/cbre/.env.production`.
- Private API environment: `/var/www/cbre/Api/.env`, mode 640, root:cbre.
- Session cookie: `cbre_session`, Secure, HttpOnly, SameSite=Strict, Path=/cbre.
- `APP_ORIGIN` accepts a comma-separated list of exact public origins for the apex and www hostnames.

Nginx includes `/etc/nginx/snippets/cbre.conf` inside the existing zetahub server. Only `/cbre` and `/cbre/` are handled by the new snippet. Cloudflare must forward the requested hostname to the existing origin at `http://localhost:80`. A path-specific www ingress rule can use `^/cbre(/.*)?$`.

For an update, upload source only into this project, preserve both environment files, run `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm test`, and `npm run build` with the production environment loaded. Restart only `cbre-api` and `cbre-web` after a successful build. Do not run the database integration test against the production database.

Check services with `systemctl status cbre-api cbre-web` and logs with `journalctl -u cbre-api -u cbre-web`. Test Nginx using `nginx -t` before any graceful reload.

## Rollback

Remove only `include /etc/nginx/snippets/cbre.conf;` from the zetahub server block. Run `nginx -t`, then `systemctl reload nginx`. Stop and disable only `cbre-web` and `cbre-api`. Keep the project directory and database for recovery. Configuration backups and route verification results are under `/var/www/cbre/deploy/backups/`; restore an entire old configuration only after confirming no intervening changes.

## Data

The weekly checks use the dedicated PostgreSQL database. Existing temperature records remain in each browser's local storage; uploading application files does not migrate those browser records. No local database or local environment secrets are uploaded.
