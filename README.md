# Chartly

Mobile-first PWA for personal finances, work shifts and scheduling, aimed at
gig delivery and rideshare workers: it tracks what you actually earn per hour
and how far you are from the day's target.

**Live:** https://desempleo-inky.vercel.app

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Supabase
(magic-link auth, PostgreSQL, RLS) · web-push · pg_cron + pg_net · Vercel

---

## What it does

Two kinds of people use it, and the app adapts to each:

- **Everyone — money in order.** Expenses, income, wallets and bills due.
  "Anotar un gasto" takes two taps (how much, on what). Monthly budgets per
  category warn at 80%. *Hoy* shows how far your money lasts this month.
- **Drivers and couriers (Uber, Rappi, Didi…).** A *Jornada* tab:
  - **GPS trip tracking** — one button measures real km and time on the
    road, filtering GPS noise and jumps; adds them to the day.
  - **Heatmap** of the zones you drive the most (7/30/90 days).
  - **Real earnings** — net minus vehicle wear per km (with a calculator), a
    tax reserve %, and the USD equivalent of your hourly rate.
  - Log app payouts, tips and fuel, even **without signal**: entries queue on
    the phone and sync when connectivity returns.
- Receipt capture (share a screenshot → read by an LLM, daily cap per user),
  agenda with push reminders, shared boards, data export and account deletion.

---

## The interesting technical decision

Vercel's Hobby plan can't run cron at minute resolution — the minimum is daily.
Scheduling reminders from the frontend doesn't work either, since that depends
on the app being open.

The fix was to **move the scheduler inside the database**:

```
pg_cron (every minute)
   └─ trigger_push_cron()
        └─ pg_net → POST /api/push/cron   (with an x-cron-secret header)
             └─ route handler with the service role → web-push → marks notified_at
```

`pg_cron` fires every minute inside Postgres, `pg_net` makes the outbound POST
to the route handler, and the handler uses the service role key to bypass RLS,
find the items coming due, send them through `web-push` and mark them notified.

**Trade-offs:** it adds two Postgres extensions and a shared secret that has to
be rotated, in exchange for minute resolution without paying for a higher plan
or running a separate worker.

---

## Data model

Every table is RLS-scoped by `user_id`: `bills`, `payments`, `projects`,
`agenda_items`, `push_subscriptions`. The `bills_with_balance` view computes
`balance = amount - sum(payments)` so it isn't recomputed on the client.

---

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in your own keys
npm run dev
```

Required variables: Supabase URL and anon key, `SUPABASE_SERVICE_ROLE_KEY`
(server only), the web-push VAPID keys and `CRON_SECRET`.

## Tests

```bash
npm test               # Vitest, ~520 tests, no network or database needed
npm run test:e2e       # Playwright smoke tests against the production build
npm run test:coverage  # coverage report in ./coverage
```

The suite covers the pure core (runway projection, currency conversion,
formatting, receipt extraction/normalization, onboarding presets), every API
route and the auth middleware, with Supabase, web-push and the LLM providers
replaced by in-memory doubles (`tests/helpers/supabase.ts`).

> The repository name comes from an earlier idea and stuck; the project is the
> one described above.
