import { createClient } from "@/lib/supabase/server";
import AgendaView, { type RoutineBlock } from "./AgendaView";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Fetch a window: from 7 days ago to 60 days ahead.
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 60);

  const [itemsRes, settingsRes] = await Promise.all([
    supabase
      .from("agenda_items")
      .select("id, title, notes, starts_at, ends_at, all_day, done, notify_minutes_before, category")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at", { ascending: true }),
    user
      ? supabase.from("user_settings").select("routine_blocks").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const settings = (settingsRes.data as { routine_blocks: unknown } | null) ?? null;
  const routineBlocks = Array.isArray(settings?.routine_blocks) ? (settings!.routine_blocks as RoutineBlock[]) : [];

  return <AgendaView initial={itemsRes.data ?? []} routineBlocks={routineBlocks} />;
}
