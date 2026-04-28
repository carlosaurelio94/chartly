import { createClient } from "@/lib/supabase/server";
import MetricasView from "./MetricasView";

export const dynamic = "force-dynamic";

type Payment = { amount: number; paid_at: string; bills: { kind: "expense" | "income"; currency: string } | null };
type AgendaRow = {
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  category: "work" | "rest" | "idle" | "other";
};

export default async function MetricasPage() {
  const supabase = await createClient();

  // Window: last 90 days through next 7 days.
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 7);

  const [paymentsRes, agendaRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, paid_at, bills:bill_id (kind, currency)")
      .gte("paid_at", from.toISOString())
      .lte("paid_at", to.toISOString()),
    supabase
      .from("agenda_items")
      .select("starts_at, ends_at, all_day, category")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString()),
  ]);

  const payments = (paymentsRes.data ?? []) as unknown as Payment[];
  const agenda = (agendaRes.data ?? []) as AgendaRow[];

  return <MetricasView payments={payments} agenda={agenda} />;
}
