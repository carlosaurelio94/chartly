import { createClient } from "@/lib/supabase/server";
import { getRates } from "@/lib/fx-server";
import MetricasView from "./MetricasView";

export const dynamic = "force-dynamic";

export default async function MetricasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Window: last 130 days (covers current month + 3 previous for ritmo) through next 14 days.
  const from = new Date();
  from.setDate(from.getDate() - 130);
  const to = new Date();
  to.setDate(to.getDate() + 14);

  const [paymentsRes, agendaRes, billsRes, catsRes, pmRes, settingsRes, rates] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, paid_at, payment_method_id, bills:bill_id (kind, currency, category_id)")
      .gte("paid_at", from.toISOString())
      .lte("paid_at", to.toISOString()),
    supabase
      .from("agenda_items")
      .select("id, title, starts_at, ends_at, all_day, category, done")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("bills_with_balance")
      .select("balance, currency, kind, archived, due_date")
      .eq("archived", false),
    supabase.from("bill_categories").select("id, name, color, parent_id").order("name", { ascending: true }),
    supabase.from("payment_methods").select("id, name").order("name", { ascending: true }),
    user
      ? supabase.from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getRates(),
  ]);

  const defaultCurrency = (settingsRes.data as { default_currency: string } | null)?.default_currency ?? "ARS";

  return (
    <MetricasView
      payments={(paymentsRes.data ?? []) as never}
      agenda={(agendaRes.data ?? []) as never}
      pendingBills={(billsRes.data ?? []) as never}
      categories={(catsRes.data ?? []) as never}
      paymentMethods={(pmRes.data ?? []) as never}
      defaultCurrency={defaultCurrency}
      rates={rates}
    />
  );
}
