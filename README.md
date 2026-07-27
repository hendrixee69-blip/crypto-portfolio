# Ledger — crypto portfolio tracker

A small full-stack app: live public prices, a per-user login to view a personal
portfolio, and an admin panel to record deposits/withdrawals against each user's
balance.

**This is a manual ledger, not a custodial wallet.** No real crypto or money ever
moves through this app — an admin types in numbers, and the site displays and
totals them against live market prices. Treat every balance shown here as a
bookkeeping record, not a claim of actual holdings, and make that clear to your
users too.

## Stack

- Next.js (pages router) — frontend + API routes in one app
- Postgres — users, admins, and a ledger table (holdings are computed from the
  ledger, not stored directly, so the numbers can't drift out of sync)
- JWT in an HttpOnly cookie for sessions (separate cookies for admin vs. user)
- CoinGecko public API for live prices (no key required)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and JWT_SECRET
npm run migrate              # creates tables + a default admin account
npm run dev
```

Visit `http://localhost:3000`. Sign in to `/admin/login` with the
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` you set in `.env.local`
(defaults to `admin` / `changeme123` if unset — **change this immediately**,
there's no "change password" UI yet, so update it directly in the `admins`
table via `psql` or a Postgres GUI, using the same bcrypt hashing scheme as
`lib/migrate.js`).

## Deploying to Railway

1. Push this project to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Add a **Postgres** plugin to the project — Railway sets `DATABASE_URL`
   automatically.
4. In your app service's **Variables**, add:
   - `JWT_SECRET` — a long random string (see `.env.example` for how to generate one)
   - `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` — first-boot admin credentials
5. Set the **Deploy** → **Custom Start Command**, or add a Railway
   "Pre-Deploy Command", running `npm run migrate` once before `npm start` so
   the tables exist. (Simplest: run `npm run migrate` manually once from the
   Railway shell after the first deploy.)
6. Once live, sign in at `/admin/login` and change the admin password.

## What's deliberately left out (and why it matters if you extend this)

- **No password reset / "change password" UI.** Added easily, just scoped out
  for a first pass — add it before real users rely on this.
- **No rate limiting on login endpoints.** Fine for a small user base you
  personally manage; add rate limiting (e.g. via Railway's edge or a package
  like `express-rate-limit`) before wider use.
- **No audit trail beyond the ledger itself.** Every deposit/withdrawal
  records which admin made it and when — that record is permanent and never
  edited or deleted by the API on purpose, so it can serve as your audit log.
- **Single admin role.** Every admin account can manage every user. Add
  per-admin scoping if more than one person will use this.

## Project structure

```
lib/
  db.js        Postgres connection pool
  migrate.js   creates tables, seeds first admin (run once)
  auth.js      JWT signing/verification, cookie helpers
  coins.js     symbol → CoinGecko id mapping, edit to add/remove coins
pages/
  index.js           public price ticker + table
  login.js           user sign-in
  dashboard.js       user's own portfolio (protected)
  admin/login.js     admin sign-in
  admin/index.js     admin panel: add users, record deposits/withdrawals
  api/
    prices.js               public, proxies + caches CoinGecko
    portfolio.js             user's own holdings (protected)
    auth/*.js                login/logout for both roles
    admin/users.js           list/create users (admin only)
    admin/ledger.js          record + view ledger entries (admin only)
```
