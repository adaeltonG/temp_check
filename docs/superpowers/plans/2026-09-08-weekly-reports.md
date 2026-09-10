# Shared Weekly Reports Implementation Plan

**Goal:** One shared Monday–Sunday report per week, editable while open, explicitly submitted only after all stations are filled; admins can correct closed reports.

**Confirmed:** Incomplete older reports remain open when the next week starts. The current week is determined in Europe/London. Multiple saves and contributors belong to the same report.

**Architecture:** Add WeeklyReport, WeeklyReading and ReportActivity tables. Preserve original Inspection/Reading tables as a legacy archive; import their newest station reading per week into open weekly drafts. Per-station versions prevent lost updates while allowing different stations to be saved concurrently. Submit checks the full report version and station completeness atomically. Previous readings come from earlier weeks; corrections must also respect the next recorded week's counter.

## Tasks

- [ ] Add additive migration, readable schema and pure date/validation helpers.
- [ ] Replace the weekly API with current/history/detail/save/submit routes; enforce roles, completeness, version checks, and contributor attribution.
- [ ] Implement weekly editor/history/print components with persisted inputs, explicit Save/Submit, older open reports and admin corrections.
- [ ] Add format scripts/config and format hand-authored source while excluding vendor/generated assets and private files.
- [ ] Run real PostgreSQL integration tests on an isolated CBRE test database: migration import, week boundaries, partial progress, contributors, concurrent changes, submission and permissions, historical corrections.
- [ ] Finish cleanup of the preceding Add User test accounts, preserving all real users.
- [ ] Build and test in an isolated staging directory; back up production CBRE source/build/database; deploy and restart only CBRE services.
- [ ] Verify live login/report UI and admin role controls without creating test readings in production. Confirm other project routes/config remain unchanged.

## API contract

`GET /api/water/reports/current`, `GET /api/water/reports`, `GET /api/water/reports/:id`, and `PATCH /api/water/reports/:id`.

PATCH accepts `{ inspectorName, version, action: 'save' | 'submit', readings: [{ outletId, current: number | null, version }] }`. Only changed station values are sent; absent station version is zero. Submit can include unsaved complete readings, saving and closing in the same transaction. A closed report always retains full station coverage; an admin may correct numeric values without reopening it.

The API exposes a computed weekly range/status/progress, per-station saved author/date/version and earlier-week baseline. The current report is created on first access during its week; no scheduler or changes to shared infrastructure are required.
