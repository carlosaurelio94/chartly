import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Borra la cuenta y todos sus datos. Todas las tablas cuelgan de auth.users
 * con ON DELETE CASCADE, así que borrar el usuario borra todo lo suyo (los
 * tableros que creó incluidos). Pide escribir BORRAR para que no pase por un
 * toque accidental.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  // getUser valida el token contra Supabase: acá no alcanza con la cookie.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if ((body.confirm ?? "").trim().toUpperCase() !== "BORRAR") {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
