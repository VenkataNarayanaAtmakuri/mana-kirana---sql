# Mana Kirana — standalone PostgreSQL edition

This copy replaces the Supabase browser client and Supabase Auth with a React/Vite frontend, an Express API, and a managed PostgreSQL database. It starts with a **new, empty database**. It does not connect to, modify, or delete anything in your old Supabase project.

## Architecture

- `src/`: existing React customer/shopkeeper UI
- `server/src/`: Express REST API, PostgreSQL queries, phone/password authentication, server-side sessions
- `server/sql/schema.sql`: schema for a fresh PostgreSQL database
- `VITE_API_URL`: public frontend API URL only
- `server/.env`: private backend configuration; never commit it

## Prerequisites

- Node.js 20+ (Node 22 LTS recommended)
- A managed PostgreSQL database with SSL support
- Your provider's PostgreSQL connection string

## 1. Create a fresh database

Create a new, empty database in your managed PostgreSQL provider. Do not reuse or point this setup at your Supabase database. In the provider's SQL editor, run the contents of `server/sql/schema.sql` once.

The schema is for a new database. Do not run it against production data without reviewing the SQL and taking a backup.

## 2. Configure the backend

```powershell
cd server
Copy-Item .env.example .env
npm install
```

Edit `server/.env` and set:

- `DATABASE_URL`: managed PostgreSQL connection string
- `FRONTEND_URL=http://localhost:5173`
- `SESSION_SECRET`: a random secret of at least 32 characters
- `NODE_ENV=development`
- `TRUST_PROXY=false` for local development

Generate a session secret in PowerShell, for example:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Use the TLS settings required by your database provider. The API enables certificate validation by default for remote database URLs.

Start the API:

```powershell
npm run dev
```

Check `http://localhost:4000/api/health`. A healthy response is `{"ok":true,"service":"mana-kirana-api"}`.

## 3. Configure and start the frontend

In the project root, copy `.env.example` to `.env.local` and confirm it contains:

```env
VITE_API_URL=http://localhost:4000
```

Then run:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Keep the backend and frontend terminals running.

## 4. Create the shopkeeper account safely

1. Use the app's Create Account screen to create your account. New accounts receive the `customer` role by default.
2. In the managed PostgreSQL provider's SQL editor, promote only your own account after verifying the phone number you registered:

```sql
UPDATE profiles
SET role = 'shopkeeper'
WHERE phone = '+91YOUR10DIGITNUMBER';
```

Replace the placeholder with your own normalized number. Do not expose shopkeeper role selection in public signup. Do not promote a number you do not control. After promotion, sign out and sign back in so the API session reloads the role.

## Phone + password authentication notes

- Phone numbers are normalized to Indian `+91` E.164 form.
- Passwords are hashed with Argon2id; plaintext passwords are never stored.
- Login uses a server-managed, HTTP-only session cookie stored in PostgreSQL.
- This initial password-only signup does **not** prove phone ownership. The `phone_verified` field defaults to `false`. Add a trusted verification/recovery flow before treating the phone number as proof of identity.
- Existing Supabase Auth accounts are not copied to this new database. This project starts with a fresh user table as requested.
- For production, use HTTPS, set `NODE_ENV=production`, set `FRONTEND_URL` to the exact HTTPS origin, configure `TRUST_PROXY=true` only behind a trusted proxy, and review CSRF protections and cookie settings.

## Current API endpoints

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/change-password` (signed-in customer or shopkeeper; current password required), `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/catalog`
- `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:id/status`
- `PATCH /api/order-items/:id/price`
- `GET /api/messages`
- `POST /api/categories`, `DELETE /api/categories/:id`
- `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id`
- `GET /api/profile/:id`

The old Supabase realtime channels are replaced with 5-second polling. This is a simple first implementation; WebSockets can be added later if needed.

## Important limitations to test before production

- New database is empty: add categories/products through the shopkeeper dashboard after promoting your account.
- Payments remain demo/pickup-only; no real UPI or payment gateway is integrated.
- No SMS verification or password-reset flow is included in this first version.
- A full production security review, CSRF defense for cookie-authenticated mutations, audit logging, backup/restore drill, and deployment-specific TLS/CORS review are still required.
- Run `npm run build` in the root and `npm run check` / `npm start` in `server` before deployment.

## Supabase rollback / preservation

The original Supabase project and its data are untouched. Keep the old ZIP and Supabase project until this new copy has been tested and you explicitly approve a production cutover. Do not delete the old project as part of this setup.
