import { createClient } from "@/lib/supabase/server";
import { getRates } from "@/lib/fx-server";
import CuentasView from "./CuentasView";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [billsRes, catsRes, settingsRes, rates] = await Promise.all([
    supabase
      .from("bills_with_balance")
      .select("id,name,amount,due_date,archived,paid_total,balance,kind,currency,category_id,is_open")
      .eq("archived", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("bill_categories")
      .select("id, name, color, parent_id")
      .order("name", { ascending: true }),
    user
      ? supabase.from("user_settings").select("default_currency, display_name").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getRates(),
  ]);

  const settings = (settingsRes.data as { default_currency: string; display_name: string | null } | null) ?? null;

  return (
    <CuentasView
      bills={billsRes.data ?? []}
      categories={catsRes.data ?? []}
      defaultCurrency={settings?.default_currency ?? "ARS"}
      displayName={settings?.display_name ?? ""}
      rates={rates}
    />
  );
}
