import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tablas con datos propios del usuario. RLS deja leer solo las filas suyas. */
const EXPORT_TABLES = [
  "user_settings",
  "payment_methods",
  "bill_categories",
  "bills",
  "payments",
  "bill_cycles",
  "gig_shifts",
  "gig_entries",
  "gig_tracks",
  "agenda_items",
  "captures",
  "merchant_aliases",
  "boards",
  "board_columns",
  "board_cards",
] as const;

/** Descarga de todos los datos de la cuenta en un JSON. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const results = await Promise.all(
    EXPORT_TABLES.map(async (t) => {
      const { data, error } = await supabase.from(t).select("*");
      return [t, error ? { error: error.message } : data ?? []] as const;
    }),
  );

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    data: Object.fromEntries(results),
  };
  const day = payload.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="chartly-mis-datos-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
