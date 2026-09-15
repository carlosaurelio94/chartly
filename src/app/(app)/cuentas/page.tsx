import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { getRates } from "@/lib/fx-server";
import CuentasView from "./CuentasView";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const supabase = await createClient();
  const user = await getUser();

  // Procesa rollover mensual antes de leer (si cambió de mes y hay gastos recurrentes,
  // suma el monto del mes anterior). Idempotente: si ya se procesó este mes, no hace nada.
  // close_accumulator_cycles congela el mes cerrado de cada acumulador y lo reinicia en 0.
  if (user) {
    await Promise.all([
      supabase.rpc("run_monthly_rollover"),
      supabase.rpc("close_accumulator_cycles"),
    ]);
  }

  const [billsRes, archivedRes, catsRes, walletsRes, settingsRes, rates] = await Promise.all([
    supabase
      .from("bills_with_balance")
      .select("id,name,amount,due_date,archived,paid_total,balance,kind,currency,category_id,tipo,priority_next_week,monthly_amount,is_fuel_accumulator,accumulator_month")
      .eq("archived", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("bills_with_balance")
      .select("id,name,amount,due_date,archived,paid_total,balance,kind,currency,category_id,tipo,priority_next_week,monthly_amount,is_fuel_accumulator,accumulator_month")
      .eq("archived", true)
      .order("name", { ascending: true }),
    supabase
      .from("bill_categories")
      .select("id, name, color, parent_id")
      .order("name", { ascending: true }),
    supabase
      .from("payment_methods")
      .select("id, name, is_preset, balance, balance_currency, display_order, hidden, balance_updated_at")
      .order("display_order", { ascending: true })
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
      archivedBills={archivedRes.data ?? []}
      categories={catsRes.data ?? []}
      wallets={walletsRes.data ?? []}
      defaultCurrency={settings?.default_currency ?? "ARS"}
      displayName={settings?.display_name ?? ""}
      rates={rates}
    />
  );
}
