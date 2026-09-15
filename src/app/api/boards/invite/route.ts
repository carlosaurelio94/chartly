import { NextRequest, NextResponse } from "next/server";
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

type InvitePayload = {
  board_id?: string;
  email?: string;
  role?: "editor" | "viewer";
  message?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: InvitePayload;
  try {
    body = (await req.json()) as InvitePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const board_id = (body.board_id ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role === "viewer" ? "viewer" : "editor";
  const message = (body.message ?? "")?.toString().trim() || null;

  if (!board_id || !email) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Verify caller is the board owner
  const { data: board } = await supabase
    .from("boards")
    .select("id, name, owner_id")
    .eq("id", board_id)
    .maybeSingle();

  if (!board || board.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "not_owner" }, { status: 403 });
  }

  // If already a member by email, short-circuit
  const sb = admin();
  const { data: targetUserList } = await sb.auth.admin.listUsers({ perPage: 200 });
  const targetUser = targetUserList?.users?.find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );

  if (targetUser) {
    const { data: alreadyMember } = await sb
      .from("board_members")
      .select("user_id")
      .eq("board_id", board_id)
      .eq("user_id", targetUser.id)
      .maybeSingle();
    if (alreadyMember) {
      return NextResponse.json({
        ok: true,
        already_member: true,
      });
    }
  }

  // Avoid duplicate pending invitation
  const { data: existing } = await sb
    .from("board_invitations")
    .select("id")
    .eq("board_id", board_id)
    .ilike("invited_email", email)
    .eq("status", "pending")
    .maybeSingle();

  let invitationId = existing?.id ?? null;

  if (!invitationId) {
    const { data: created, error: insertErr } = await supabase
      .from("board_invitations")
      .insert({
        board_id,
        invited_email: email,
        invited_by: user.id,
        role,
        message,
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      return NextResponse.json(
        { ok: false, error: insertErr?.message ?? "insert_failed" },
        { status: 500 },
      );
    }
    invitationId = created.id;
  }

  // In-app push to the invited user (if registered + has subscriptions)
  let pushed = 0;
  if (targetUser) {
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", targetUser.id);

    const payload = JSON.stringify({
      title: "Te invitaron a un tablero",
      body: `${board.name} — ${role === "editor" ? "como editor" : "como lector"}`,
      url: "/trabajos",
      tag: `board-invite-${invitationId}`,
    });

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        pushed++;
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
  }

  // Best-effort email — Supabase Auth admin inviteUserByEmail (only if the user is not yet registered).
  // This sends a sign-up link; our app uses Google OAuth + magic links so it's compatible.
  let emailSent = false;
  try {
    if (!targetUser) {
      const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { invited_to_board: board_id, board_name: board.name },
      });
      if (!inviteErr) emailSent = true;
    }
  } catch {
    // ignored — email is best-effort
  }

  return NextResponse.json({
    ok: true,
    invitation_id: invitationId,
    target_registered: !!targetUser,
    pushed,
    email_sent: emailSent,
  });
}
