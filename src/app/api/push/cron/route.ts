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

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
