# Database

Supabase Postgres 17. Every table lives in `public`, has **row-level security
enabled**, and references `auth.users` with `ON DELETE CASCADE` — deleting a
user (Ajustes → *Borrar mi cuenta*) removes all of their data. Policies scope
rows to `auth.uid()`; shared boards use the `is_board_*` helper functions.

The original schema was created from the Supabase dashboard. Changes made since
October 2026 are versioned in [`supabase/migrations/`](../supabase/migrations).

## Money

| Table | Purpose | Key columns |
| --- | --- | --- |
| `bills` | Expenses and income: one-off, monthly recurring, or *acumulador* (an open bucket you add purchases to). | `kind` (`expense`/`income`), `tipo` (`puntual`/`recurrente`/`acumulador`), `amount`, `currency`, `due_date`, `monthly_amount`, `last_rollover_month`, `category_id`, `priority_next_week`, `is_fuel_accumulator`, `archived` |
| `payments` | Payments against a bill. A quick expense is a payment into an acumulador. | `bill_id`, `amount`, `paid_at`, `payment_method_id`, `converted_amount` + `converted_currency` (what was really paid in another currency), `is_debt` |
| `bill_cycles` | Closed monthly cycles of acumuladores, used to average monthly spend. | `bill_id`, `period_start`, `amount`, `closed_at` |
| `bill_categories` | Two-level categories (`parent_id`). Top-level ones can carry a monthly budget. | `name`, `color`, `parent_id`, `monthly_budget` |
| `payment_methods` | Wallets (cash, bank, Mercado Pago…) with a manually updated balance. | `balance`, `balance_currency`, `hidden`, `display_order`, `balance_updated_at` |
| `merchant_aliases` | Learned names for merchants seen in captured receipts. | `match_text`, `display_name`, `target_bill_id`, `category_id`, `hits` |
| `captures` | Shared receipts waiting for confirmation. The image is never stored. | `source`, `status`, `parsed` (jsonb), `confidence`, `error` (`sin_extractor`, `limite_diario`, …) |
| `fx_rates` | Exchange-rate cache (per USD), refreshed every 6 h. | `code`, `rate_per_usd`, `fetched_at` |

**View `bills_with_balance`** (`security_invoker`): bills plus `paid_total`,
`balance`, `debt_amount`, `paid_total_all`, `cycle_start`.

## Driver mode (Jornada)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `gig_shifts` | One row per user and day (`UNIQUE (user_id, shift_date)`). | `hours_worked`, `km_driven`, `goal_amount`, `goal_hours`, `closed_at`, `income_bill_id` |
| `gig_entries` | Payouts, tips, cash trips, fuel and other expenses of a day. | `kind` (`earnings`/`tip_app`/`tip_cash`/`cash_trip`/`fuel`/`expense`), `amount`, `currency`, `platform`, `liters`, `odometer_km` |
| `gig_tracks` | GPS trips. Points are already noise-filtered and rounded to ~1 m. | `shift_date`, `started_at`, `ended_at`, `distance_km`, `points` (`[[lat, lng, epoch_s], …]`) |

**View `gig_shifts_with_totals`** (`security_invoker`): shift totals per entry
kind, `total_liters`, `net_total`, `entry_count`.

A trigger on `gig_entries` (`fuel_accumulator_sync`) mirrors fuel entries into a
monthly fuel acumulador so fuel also shows up in Cuentas.

## Settings

`user_settings` — one row per user: `default_currency`, `timezone`, `theme`,
`theme_accent`, `display_name`, `onboarded_at`, `routine_blocks`, and the driver
settings `gig_worker_enabled`, `gig_default_goal`, `gig_default_hours`,
`gig_default_currency`, `gig_platforms`, `gig_day_levels`, `gig_weekly_goal`,
`gig_per_dow_goals`, `gig_per_dow_hours`, `gig_tank_liters`,
`gig_cost_per_km` (vehicle wear per km, excluding fuel) and `tax_reserve_pct`.

## Agenda, notifications and boards

| Table | Purpose |
| --- | --- |
| `agenda_items` | Events with `category`, `notify_minutes_before`, `notified_at`. |
| `push_subscriptions` | Web Push endpoints per device. |
| `boards`, `board_columns`, `board_cards`, `board_members`, `board_invitations` | Trello-style shared boards ("Proyectos"). |

## Functions

| Function | Security | What it does |
| --- | --- | --- |
| `save_gig_track(p_client_id, p_shift_date, p_started_at, p_ended_at, p_distance_km, p_points, p_add_hours)` | invoker | Saves a GPS trip and adds its km (and optionally hours) to the day's shift in one transaction. Idempotent on the client-generated id. |
| `gig_heat_cells(p_from, p_cell_m)` | invoker | Groups the user's GPS points into ~`p_cell_m` m cells for the heatmap. |
| `trigger_push_cron()` | definer | Called every minute by `pg_cron`; POSTs to `/api/push/cron` with `pg_net`. |
| `run_monthly_rollover()`, `close_accumulator_cycles()` | invoker | Monthly renewal of recurring bills and closing of acumulador cycles. Called by `/cuentas` on load (idempotent per month). |
| `fuel_accumulator_sync()`, `ensure_fuel_accumulator_bill()`, `upsert_fuel_payment_for_entry()`, `remove_fuel_payment_for_entry()` | invoker | Keep the fuel acumulador in sync with fuel entries. |
| `accept_board_invitation()`, `reject_board_invitation()`, `is_board_owner/editor/member()` | definer | Board sharing. |
| `set_updated_at()`, `touch_updated_at()`, `_touch_updated_at()`, `_boards_add_owner_membership()` | — | Triggers. |

## Scheduled jobs (`pg_cron`)

| Job | Schedule | Command |
| --- | --- | --- |
| `push-notifications-every-minute` | `* * * * *` | `select public.trigger_push_cron();` |

## Applying changes

1. Write the SQL in a new file under `supabase/migrations/` (`YYYYMMDD_name.sql`),
   additive where possible, with RLS for any new table.
2. Run it in the Supabase SQL editor.
3. If you created or changed a function, run `notify pgrst, 'reload schema';`
   so the REST API sees it.
