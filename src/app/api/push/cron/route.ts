import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:owner@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function handle(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const now = new Date();

  // Bills warning: 3 días antes del vencimiento si saldo > 0 y no avisamos hoy
  await notifyBillsApproaching(sb, now);

  const { data: items, error } = await sb
    .from("agenda_items")
    .select("id, user_id, title, notes, starts_at, notify_minutes_before")
    .is("notified_at", null)
    .not("notify_minutes_before", "is", null)
    .eq("done", false)
    .lte("starts_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const due = (items ?? []).filter((it) => {
    const start = new Date(it.starts_at).getTime();
    const notifyAt = start - (it.notify_minutes_before ?? 0) * 60_000;
    return notifyAt <= now.getTime() && start + 5 * 60_000 >= now.getTime();
  });

  let sent = 0;
  let failed = 0;

  for (const it of due) {
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", it.user_id);

    const minutes = it.notify_minutes_before ?? 0;
    const when = new Date(it.starts_at);
    const minsLeft = Math.round((when.getTime() - Date.now()) / 60000);
    const body = minutes === 0
      ? "Es ahora"
      : minsLeft <= 0
      ? "Empezó ahora"
      : `En ${minsLeft} min · ${when.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;

    const payload = JSON.stringify({
      title: it.title,
      body,
      url: "/agenda",
      tag: `agenda-${it.id}`,
    });

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        failed++;
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }

    await sb.from("agenda_items").update({ notified_at: new Date().toISOString() }).eq("id", it.id);
  }

  return NextResponse.json({ ok: true, due: due.length, sent, failed });
}

type SbClient = ReturnType<typeof admin>;

async function notifyBillsApproaching(sb: SbClient, now: Date) {
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);
  const horizonDay = horizon.toISOString().slice(0, 10);

  const { data: bills } = await sb
    .from("bills_with_balance")
    .select("id, user_id, name, balance, currency, due_date, kind, archived")
    .eq("archived", false)
    .eq("kind", "expense")
    .gt("balance", 0)
    .gte("due_date", today)
    .lte("due_date", horizonDay);

  if (!bills?.length) return;

  for (const b of bills) {
    const { data: bRow } = await sb
      .from("bills")
      .select("last_warned_at")
      .eq("id", b.id)
      .maybeSingle();
    if (bRow?.last_warned_at && new Date(bRow.last_warned_at) > oneDayAgo) continue;

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", b.user_id);

    const dueDate = new Date(b.due_date);
    const days = Math.max(0, Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000));
    const body = days === 0
      ? `Vence hoy · ${b.balance} ${b.currency}`
      : days === 1
      ? `Vence mañana · ${b.balance} ${b.currency}`
      : `Vence en ${days} días · ${b.balance} ${b.currency}`;
    const payload = JSON.stringify({
      title: `Cuenta por pagar: ${b.name}`,
      body,
      url: `/cuentas/${b.id}`,
      tag: `bill-${b.id}`,
    });

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }

    await sb.from("bills").update({ last_warned_at: now.toISOString() }).eq("id", b.id);
  }
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
