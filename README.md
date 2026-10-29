# Test-y4

Booking platform: React frontend, Express backend, PostgreSQL database. Paid accounts get time-limited access (expiry date set on payment confirmation).

## Structure

- `frontend/` - React app (Vite). Pages: Home, Booking, Activities, Contact, Login.
- `backend/` - Express API. Routes: `/api/auth`, `/api/payment`, `/api/bookings`, `/api/activities`, `/api/contact`.
- `db/schema.sql` - PostgreSQL schema (users, activities, bookings, contact_messages).

## Setup

1. Create a PostgreSQL database and run `db/schema.sql` against it.
2. Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` and `JWT_SECRET`.
3. Install dependencies from the repo root: `npm install`.
4. Run both apps: `npm run dev` (or `npm run dev:frontend` / `npm run dev:backend` separately).

Frontend runs on http://localhost:5173, backend on http://localhost:4000.

## Docker

The same `docker-compose.yml` runs on your computer and on the server.
Start order: `db` (healthy) -> `migrate` (applies `db/migrations`, exits 0) -> `backend` -> `frontend`.

On your computer (also reads `docker-compose.override.yml`, which builds the images,
adds sample data and opens the database on localhost:5433):

1. `cp .env.example .env` and set `DB_PASSWORD`; make sure `backend/.env` exists (copy from `backend/.env.example`).
2. `docker compose up --build -d`

| Service | URL | Notes |
|---|---|---|
| Website | http://localhost:8344 | nginx (non-root) serving the build; `/api` is passed to the backend |
| Backend | http://localhost:8345 | `/health`: 200 when the database answers, 503 when it does not |
| Postgres | localhost:5433 | local only (not opened on the server) |

Stop with `docker compose down` (keep the data; `down -v` deletes the database).
Without Docker, apply database changes with `npm run migrate -w backend`.

## Deploy (CI/CD)

- `.github/workflows/ci.yml` (**CI**): lint, backend + frontend tests, and a full `docker compose` run
  (health 200 / 503 with the database stopped / 200, non-root containers, no `.env` in images).
- `.github/workflows/deploy.yml` (**Deploy**): after CI passes on `main`, pushes the images to GHCR
  (`latest` and `sha-xxxxxxx`) and, when the VPS secrets are set, runs `docker compose pull && up -d`
  on the server and checks `/health`.
- Server setup: `sh deploy/make-env.sh` writes `.env` with a random password; host nginx config is
  `deploy/nginx-baanrai.conf`.

## Payment

The payment routes (`backend/src/routes/payment.js`) are stubbed against a placeholder "okslip" provider - `createOkslipCharge` returns a fake pending charge, and `/api/payment/confirm` extends the user's `account_expires_at`. Swap `createOkslipCharge` for a real API call once okslip credentials/docs are available.

## Google sign-in

"Login with Google" is disabled by default (no button shows) until a Google OAuth Client ID is configured:

1. In [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials, create an **OAuth client ID** of type **Web application**.
2. Add `http://localhost:5173` under **Authorized JavaScript origins** (add your production domain too, once you have one).
3. Copy the generated Client ID into **both**:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID=...` (copy `frontend/.env.example` to `frontend/.env` first if you haven't)
4. Restart both dev servers.

Google sign-in only works for emails that already have an account here (created via the regular email/password signup) - it does not auto-create new accounts.
