import { createClient } from "@/lib/supabase/server";
import AgendaView from "./AgendaView";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = await createClient();
  // Fetch a window: from 7 days ago to 60 days ahead.
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 60);

  const { data } = await supabase
    .from("agenda_items")
    .select("id, title, notes, starts_at, ends_at, all_day, done, notify_minutes_before, category")
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at", { ascending: true });

  return <AgendaView initial={data ?? []} />;
}
