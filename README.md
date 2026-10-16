# Chartly

Mobile-first PWA that answers two questions: **how long will my money last
this month?** and, for rideshare and delivery drivers, **how much do I really
make per hour?** — counting real kilometres with the phone's GPS.

**Live:** https://desempleo-inky.vercel.app

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind ·
Supabase (Postgres + RLS, magic-link and Google auth) · web-push ·
pg_cron + pg_net · Leaflet · Vitest + Playwright · Vercel

---

## What it does

Two kinds of people use it, and the navigation adapts to each
(*Hoy · Cuentas · **+** · Jornada or Métricas · Más*).

**Everyone — money in order**
- **Quick expense in two taps** from the **+** button: how much, on what.
- **Runway**: a day-by-day projection of the balance until the end of the
  month, showing which bill takes you to zero first.
- Bills due, recurring monthly expenses, wallets, multi-currency with live
  exchange rates (ARS, USD, EUR, VES, CLP, MXN, COP, BRL…).
- **Monthly budgets per category**, warning at 80%.
- **Receipt capture**: share a payment screenshot to the app and an LLM fills
  in amount, merchant and date (daily cap per user; the image is never stored).

**Drivers and couriers (Uber, Rappi, Didi, PedidosYa…) — the *Jornada* tab**
- **GPS trip tracking**: one button to start, one to stop. Real km and time,
  with GPS noise and jumps filtered out, added to the day's shift.
- **Heatmap** of the zones you drive the most (7 / 30 / 90 days).
- **Real earnings**: payouts minus fuel, minus vehicle wear per km (with a
  calculator), minus a tax reserve — per hour and in USD.
- Daily and weekly goals that spread the week's target across strong and weak days.

**Works without signal**: entries logged offline queue on the phone and sync
when connectivity returns; the app shell opens offline.

Also: agenda with push reminders, shared Trello-style boards, CSV export,
**download all my data** and **delete my account**.

---

## Architecture

```
Browser (PWA)                      Vercel (Next.js)                    Supabase
─────────────                      ────────────────                    ────────
Server Components ───────────────► SELECTs with the user's session ──► Postgres + RLS
Client Components ─── inserts/updates directly with the anon key ───► (RLS is the
                                                                        security layer)
Service worker: push, offline cache
OfflineSync: queue → upsert by id
GPS: watchPosition → lib/geo ──────────────── rpc save_gig_track ───► gig_tracks
                                   /api/share  → Gemini / Claude
                                   /api/push/* → web-push         ◄─── pg_cron + pg_net
                                   /api/account (delete / export)
                                   /api/log    → Vercel logs
```

- **RLS is the security boundary.** Every table is scoped to `auth.uid()`;
  routes that need more (cron, invitations, account deletion) use the service
  role on the server only.
- **Business logic lives in `src/lib` as pure functions** (runway, GPS
  distance, real earnings, budgets, dates, amount parsing, offline queue) and
  is unit-tested in isolation.

### Technical decisions worth reading

**A scheduler inside the database.** Vercel's Hobby plan can't run cron at
minute resolution, and scheduling reminders from the frontend depends on the
app being open. `pg_cron` fires every minute inside Postgres, `pg_net` POSTs to
`/api/push/cron` with a shared secret, and the handler sends due reminders
through `web-push`. Trade-off: two extensions and a secret to rotate, in
exchange for minute resolution without a paid plan or a separate worker.

**GPS distance you can trust.** Summing raw readings turns an 80 km day into
110 km: a parked phone jitters 5–30 m and occasionally jumps hundreds of metres.
`lib/geo.ts` drops readings with poor accuracy, ignores moves smaller than the
noise (without moving the anchor, so slow progress still adds up), rejects
impossible speeds, and adds a straight line when the signal comes back.
Saving is a single idempotent RPC, so a retry on a flaky connection never
double-counts kilometres. The heatmap is aggregated in Postgres
(`gig_heat_cells`) instead of shipping thousands of points to the phone.

**Offline first where it matters.** Drivers log trips in places with no data.
Failed inserts go to a local queue with a client-generated id; `OfflineSync`
flushes it with `upsert … ignoreDuplicates` when the connection returns, and
resolves the shift id at send time.

**The user's day, not the server's.** Vercel runs in UTC: after 9 p.m. in
Argentina it is already "tomorrow". Everything that depends on today
(shifts, runway, today's agenda, greeting) goes through `lib/dates.ts` with
the user's time zone.

**Amounts from any country.** `"$12.345,67"`, `"$1,234.50"`, `"$ 15.990"`
(CLP) and `"Bs. 1.234,56"` all parse correctly (`lib/amount.ts`) — both for
LLM output and for what users type.

---

## Project structure

```
src/
  app/(app)/        screens behind login: hoy, cuentas, jornada, metricas, mas,
                    agenda, proyectos, capturar, ajustes, como-funciona
  app/api/          share, push/cron, push/test, boards/invite, account, log
  lib/              pure logic (+ supabase clients, fx, push)
  components/       BottomNav, QuickExpense, OfflineSync, gps/, ui/
  instrumentation.ts, middleware.ts
public/sw.js        service worker (push + offline)
supabase/migrations SQL for schema changes
docs/DATABASE.md    tables, views, functions and jobs
tests/              Vitest (lib, api routes, components)
e2e/                Playwright smoke tests
```

---

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in your keys (see comments in the file)
npm run dev                  # http://localhost:3000
```

Required: Supabase URL, anon key and service role key; the VAPID keys
(`npx web-push generate-vapid-keys`) and `CRON_SECRET`. Optional:
`GEMINI_API_KEY` or `ANTHROPIC_API_KEY` for receipt reading
(`CAPTURE_DAILY_LIMIT`, default 40) and `ADMIN_EMAIL`.

**No secrets in the code.** Keys, tokens, the admin e-mail and the Supabase
project live only in environment variables (`.env.local`, which is git-ignored,
and Vercel → Settings → Environment Variables). `tests/security/no-secrets.test.ts`
scans every tracked file on each PR and fails if a key, token or personal e-mail
shows up.

### Database

The schema, RLS policies and functions are documented in
[`docs/DATABASE.md`](docs/DATABASE.md). New changes go in
`supabase/migrations/` and are applied in the Supabase SQL editor; after
creating a function run `notify pgrst, 'reload schema';`.

---

## Tests

```bash
npm test               # Vitest: ~520 tests, no network or database needed
npm run test:e2e       # Playwright smoke tests against the production build
npm run test:coverage  # coverage report in ./coverage
```

Unit tests cover the pure core (runway, GPS filtering, real earnings, budgets,
time zones, amount parsing, offline queue, receipt extraction), every API route
and the auth middleware, with Supabase, web-push and the LLM providers replaced
by in-memory doubles (`tests/helpers/supabase.ts`). The E2E suite runs the
production build and checks public pages, route protection and the login flow.

## Deploy

Pull requests run type-checking, unit tests and E2E in GitHub Actions and get a
Vercel preview. Merging to `main` deploys to production automatically.
Runtime errors from the server and the browser are logged as one-line JSON in
Vercel → Logs (`"source":"server"` / `"source":"client"`).

> The production URL (`desempleo-…`) comes from an earlier name of the project.
