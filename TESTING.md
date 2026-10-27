# Implementation test report

## Completed checks

- `node --check server/src/app.js` — passed.
- `node --check server/src/routes.js` — passed.
- `node --check server/src/db.js` — passed.
- `node --check src/lib/liveData.js` — passed.
- `node --check src/lib/supabaseClient.js` — passed.

## Not completed in this environment

- `npm run build` — could not run because frontend dependencies were not available (`vite: not found`). An npm install attempt timed out, and offline lockfile regeneration failed because package tarballs were not cached.
- PostgreSQL schema execution and API integration tests — not run because no managed database credentials or database instance were provided. No database was contacted.
- Browser end-to-end tests — not run.

## Before using this in production

1. Install dependencies with `npm install` in the project root and `npm install` in `server/`.
2. Run `npm run build` in the project root.
3. Run `npm run check` in `server/`.
4. Apply `server/sql/schema.sql` only to the new empty database.
5. Follow the README setup and test auth, orders, stock, role permissions, and session behavior.
6. Complete a security review, including CSRF protection, cookie/CORS configuration, backup/restore, password recovery, and phone verification decisions.
