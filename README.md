# Mana Kirana — standalone PostgreSQL edition

This app uses a React/Vite frontend, an Express REST API, and PostgreSQL. `src/lib/supabaseClient.js` is retained as a compatibility adapter name; it sends requests to the Express API and does not use Supabase Auth or the Supabase SDK. The app starts with a **new, empty database** and does not connect to or change data in an old Supabase project.

## Architecture

- `src/`: React/Vite customer and shopkeeper app
- `src/lib/supabaseClient.js`: compatibility adapter that calls the Express API over HTTP
- `server/src/`: Express REST API, PostgreSQL queries, phone/password authentication, and server-side sessions
- `server/sql/schema.sql`: schema for a fresh PostgreSQL database
- `VITE_API_URL`: public URL of the Express API; it is not a secret
- `server/.env`: private backend configuration; never commit it

## Features

**Customer**

- Browse the shared grocery catalogue, search by name, choose quantities, and request an unlisted item.
- Place grocery pickup orders online or from the entrance QR. Orders require at least ₹100 in confirmed items; payment is made at the shop when collecting. Customers can track order status and history.
- Save regular shopping lists, use active offers, and view a monthly spending summary.

**Shopkeeper**

- Manage the order queue and collect ready orders with the customer's four-digit pickup PIN.
- Manage catalogue categories, prices, stock, product photos, expiry dates, offers, opening hours, and public contact details.
- View low-stock and expiry alerts, restock suggestions, daily sales, and CSV exports.

**Voice input**

- Customer and shopkeeper voice search support English and Telugu selection. In the catalogue form, the item-name mic is set to English and the optional local-name mic to Telugu.
- Voice typing uses the browser's speech-recognition service. Language support and transcription accuracy vary by browser, device, microphone, and network; review dictated words before saving.

## Prerequisites

- Node.js 20.19+ or 22.12+ (Node 22 LTS recommended)
- A managed PostgreSQL database with SSL support
- Your provider's PostgreSQL connection string

## 1. Create a fresh database

Create a new, empty database in your managed PostgreSQL provider. Do not reuse or point this setup at your Supabase database. In the provider's SQL editor, run the contents of `server/sql/schema.sql` once.

The schema is for a new database. Do not run it against production data without reviewing the SQL and taking a backup.

For an existing database, apply each migration once, in filename order, before deploying the matching API/frontend changes. Current migrations are:

1. `server/sql/migrations/20261028_add_pickup_phone.sql` — adds the optional alternate pickup number.
2. `server/sql/migrations/20261106_six_shop_features.sql` — adds pickup PINs, offers/discounts, expiry dates, and store settings; existing orders receive four-digit PINs.
3. `server/sql/migrations/20261109_product_images.sql` — adds PostgreSQL-backed catalogue images.
4. `server/sql/migrations/20261109_recovery_codes.sql` — adds hashed, single-use password recovery codes; no SMS or email service is required.
5. `server/sql/migrations/20261109_store_contact_details.sql` — adds editable public shop contact details.
6. `server/sql/migrations/20261110_minimum_order_100.sql` — updates the order total constraint to allow the new ₹100 minimum.
7. `server/sql/migrations/20261110_security_hardening.sql` — creates the shared rate-limit and server-session tables used by the API.

For a new database, run the current `server/sql/schema.sql` once instead of applying these migrations. Do not run the fresh-database schema against an existing database.

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
- This initial password-only signup does **not** prove phone ownership. The `phone_verified` field defaults to `false`. Profile mobile-number changes require the current password but do not send an OTP, so only enter a number you control.
- Existing Supabase Auth accounts are not copied to this new database. This project starts with a fresh user table as requested.
- For production, use HTTPS, set `NODE_ENV=production`, set `FRONTEND_URL` to the exact HTTPS origin, configure `TRUST_PROXY=true` only behind a trusted proxy, and review CSRF protections and cookie settings.

## API endpoints

The routes below are relative to the configured backend URL.

- Health: `GET /health`
- Authentication: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/recovery-code`, `POST /auth/recovery-code/customer`, `POST /auth/reset-password`, `POST /auth/link-account`, `POST /auth/switch-account`
- Profiles: `GET /profile/:id`, `PATCH /profile/:id`
- Catalogue and categories: `GET /catalog`, `POST /categories`, `DELETE /categories/:id`
- Products: `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`
- Product photos: `GET /products/:id/image`, `PUT /products/:id/image`, `DELETE /products/:id/image`
- Orders: `GET /orders`, `POST /orders`, `PATCH /orders/:id/status`, `POST /orders/:id/collect`, `DELETE /orders/:id`
- Order pricing: `PATCH /order-items/:id/price`
- Customer spending: `GET /customer/spending-summary`
- Offers: `POST /offers/validate`, `POST /offers`, `PATCH /offers/:id`, `DELETE /offers/:id`
- Store settings and public contact: `PATCH /store-settings`, `PATCH /store-contact`
- Account updates: `GET /messages`
- Shopkeeper reports: `GET /reports/restock`, `GET /reports/daily-sales`, `GET /reports/export.csv`

## Important limitations to test before production

- New database is empty: add categories/products through the shopkeeper dashboard after promoting your account.
- Payments remain demo/pickup-only; no real UPI or payment gateway is integrated.
- Signup does not verify phone ownership. Password reset uses a private, single-use recovery code instead of paid SMS or email; customers who lose the code need the shopkeeper to verify them in person and issue a replacement.
- A full production security review, CSRF defense for cookie-authenticated mutations, audit logging, backup/restore drill, and deployment-specific TLS/CORS review are still required.
- Run `npm run build` in the project root and `npm run check` in `server/`. The check script validates JavaScript syntax; it is not an end-to-end test. With a configured PostgreSQL database, start the API using `npm start` and verify the app flows before production.

## Supabase rollback / preservation

The original Supabase project and its data are untouched. Keep the old ZIP and Supabase project until this new copy has been tested and you explicitly approve a production cutover. Do not delete the old project as part of this setup.
