import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:owner@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const hasSubscriptions = (subs ?? []).length > 0;

  const payload = JSON.stringify({
    title: "Notificación de prueba",
    body: "Si ves esto, las notificaciones funcionan ✓",
    url: "/ajustes",
    tag: "test-push",
  });

  let sent = 0;
  let failed = 0;

  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
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

  return NextResponse.json({ ok: true, hasSubscriptions, sent, failed });
}
