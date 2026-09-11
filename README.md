# Chartly

Mobile-first PWA for personal finances, work shifts and scheduling, aimed at
gig delivery and rideshare workers: it tracks what you actually earn per hour
and how far you are from the day's target.

**Live:** https://desempleo-inky.vercel.app

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Supabase
(magic-link auth, PostgreSQL, RLS) · web-push · pg_cron + pg_net · Vercel

---

## What it does

- **Accounts** — expenses, income, categories and wallets. What's due this week,
  what's left available, and where the money goes by category.
- **Shifts** — for delivery and rideshare drivers. Log app earnings, tips and
  fuel, and get a real hourly rate.
- **Metrics** — everything logged turns into charts: where spending went up,
  which hours pay best.
- **Scheduling** — blocks by category with repeatable routines and push
  notifications that respect your hours.
- **Shared boards** — Trello-style boards for projects with other people,
  invited by email.
- **Weekly calculator** — set a weekly target, mark which days are heavy, light
  or rest, and it spreads the daily numbers for you.

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

> The repository name comes from an earlier idea and stuck; the project is the
> one described above.
