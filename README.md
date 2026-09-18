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

Runs the whole stack - Postgres, the API, and the frontend behind nginx - in containers, no local Node or Postgres install needed.

1. Make sure `backend/.env` exists (copy from `backend/.env.example` if not; `DATABASE_URL` is overridden by compose, but `JWT_SECRET` etc. are read from this file).
2. `npm run docker:up` (or `docker compose up --build`).

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | nginx serving the production build |
| Backend | http://localhost:4000 | `/health` for a liveness check |
| Postgres | localhost:5433 | user/pass `postgres`/`postgres`, db `test_y4` (5433, not 5432, to avoid clashing with a native Postgres install) |

`db/schema.sql` and `db/seed.sql` are auto-run against the Postgres container the first time its data volume is created, so it comes up already seeded. To reset it, stop the stack and drop the volume: `docker compose down -v`.

The frontend build bakes `VITE_API_URL` in at build time (Vite env vars aren't read at container runtime) - it defaults to `http://localhost:4000` since that's what your browser resolves regardless of the containers' internal network. If you publish the backend on a different host/port, rebuild with `docker compose build --build-arg VITE_API_URL=https://your-api-host frontend`.

This is a production-style build (compiled frontend assets, no hot reload) - keep using `npm run dev` for day-to-day development.

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
