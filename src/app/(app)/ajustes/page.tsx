import { createClient } from "@/lib/supabase/server";
import AjustesClient from "./AjustesClient";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [settingsRes, catsRes, pmRes] = await Promise.all([
    user
      ? supabase
          .from("user_settings")
          .select("default_currency, display_name")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("bill_categories").select("id, name, color, parent_id").order("name", { ascending: true }),
    supabase.from("payment_methods").select("id, name, is_preset").order("name", { ascending: true }),
  ]);

  const settings = (settingsRes.data as { default_currency: string; display_name: string | null } | null) ?? null;
  const defaultCurrency = settings?.default_currency ?? "ARS";
  const displayName = settings?.display_name ?? "";
  const categories = (catsRes.data ?? []) as { id: string; name: string; color: string; parent_id: string | null }[];
  const paymentMethods = (pmRes.data ?? []) as { id: string; name: string; is_preset: boolean }[];

  return (
    <AjustesClient
      email={user?.email ?? ""}
      defaultCurrency={defaultCurrency}
      displayName={displayName}
      categories={categories}
      paymentMethods={paymentMethods}
    />
  );
}
