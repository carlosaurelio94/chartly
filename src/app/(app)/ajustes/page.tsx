import { createClient } from "@/lib/supabase/server";
import AjustesClient from "./AjustesClient";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <AjustesClient email={user?.email ?? ""} />;
}
