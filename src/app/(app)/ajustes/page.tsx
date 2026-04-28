import { createClient } from "@/lib/supabase/server";
import AjustesClient from "./AjustesClient";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [settingsRes, catsRes] = await Promise.all([
    user
      ? supabase.from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("bill_categories").select("id, name, color").order("name", { ascending: true }),
  ]);

  const defaultCurrency = (settingsRes.data as { default_currency: string } | null)?.default_currency ?? "ARS";
  const categories = (catsRes.data ?? []) as { id: string; name: string; color: string }[];

  return (
    <AjustesClient
      email={user?.email ?? ""}
      defaultCurrency={defaultCurrency}
      categories={categories}
    />
  );
}
