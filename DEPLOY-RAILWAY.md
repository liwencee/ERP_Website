# Deploying EPR Access to Railway

This app is a single Node/Express + EJS service (frontend and backend are one
app) plus a PostgreSQL database. On Railway you run **two services**: the web
app and a Postgres plugin.

> Steps marked **[you]** must be done in your Railway dashboard / account — they
> involve your credentials, billing, and secrets, which only you can set.

---

## 1. Create the project & database  **[you]**

1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo** →
   pick `liwencee/ERP_Website`.
2. In the same project: **New** → **Database** → **Add PostgreSQL**.
   Railway automatically exposes its connection string as `DATABASE_URL` to the
   other services in the project (reference it as `${{Postgres.DATABASE_URL}}`).

## 2. Set environment variables  **[you]**

On the **web service** → **Variables**, add (see `.env.example` for the full list):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SESSION_SECRET` | a long random string — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `APP_URL` | your public URL, e.g. `https://epr-access.up.railway.app` |
| `ADMIN_EMAIL` | the real admin login email |
| `ADMIN_PASSWORD` | a strong admin password (you choose it) |
| `USD_NGN_RATE` | `1600` (or your current rate) |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | your real email sending credentials |
| `PAYSTACK_SECRET_KEY` | **live** `sk_live_...` key |
| `FLUTTERWAVE_SECRET_KEY` / `FLW_SECRET_HASH` | **live** keys |
| `SQUADCO_SECRET_KEY` | **live** key |
| `SQUADCO_ENV` | `production` |

> The app **will refuse to start** in production without a real `SESSION_SECRET`.
> Leave `SEED_DEMO` unset (or `false`) — demo/test accounts must never exist in production.

## 3. Build & start (already configured)

`railway.json` in the repo tells Railway how to run the app:

- **Build:** `npm run build` (compiles TypeScript + Tailwind CSS)
- **Pre-deploy:** `npx prisma db push` (creates/updates tables, incl. the
  `session` table — safe to run on every deploy)
- **Start:** `npm run start` (`node dist/server.js`)

Railway uses Nixpacks and runs `npm install` first, which triggers
`prisma generate` via the `postinstall` script.

## 4. Persistent storage for uploads  **[you] — important**

KYC documents, payment proofs, and avatars are written to `public/uploads`.
Railway's container filesystem is **ephemeral**, so without a volume these files
are deleted on every redeploy.

- Web service → **Settings → Volumes → New Volume**
- Mount path: `/app/public/uploads`

(The app creates the `avatars` sub-folder automatically on boot.)

> For higher durability you may later move uploads to S3/Cloudflare R2, but a
> Railway volume is enough to go live.

## 5. First-time data seed  **[you], run once**

After the first successful deploy, seed the investment plans, real-estate
catalogue, and the admin account. With the Railway CLI (`npm i -g @railway/cli`,
then `railway link`):

```bash
railway run npm run db:seed
```

The seed is **non-destructive**: it only inserts plans/properties when the
tables are empty and creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. It
never deletes user data and never creates demo accounts (unless `SEED_DEMO=true`).

## 6. Verify

- Visit `APP_URL` — the marketing site loads.
- `‎/auth/register` → create a real investor; `‎/auth/login` works.
- Log in with the admin credentials → `/admin` loads.
- Upload a KYC doc, redeploy, confirm it still loads (volume working).

---

## Migrating existing data from Neon (optional)

If you want to keep the current production data (users, wallets, investments):

```bash
# dump from Neon (get the URL from your current Vercel env)
pg_dump "$NEON_DATABASE_URL" --no-owner --no-privileges -Fc -f epr.dump
# restore into Railway Postgres
pg_restore --no-owner --no-privileges -d "$RAILWAY_DATABASE_URL" epr.dump
```

Then **skip the seed** (data already present) — or run it; it will detect
existing plans and skip them. Run `npx prisma db push` once afterwards to ensure
the schema (incl. new bank columns and the `session` table) is in sync.

## Notes

- `vercel.json` is left in the repo only for the old Vercel deploy; Railway
  ignores it. Delete it if you no longer use Vercel.
- Point a custom domain at the web service under **Settings → Networking →
  Custom Domain**, then update `APP_URL` to match.
