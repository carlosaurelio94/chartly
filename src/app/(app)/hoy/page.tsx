import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { getRates } from "@/lib/fx-server";
import { convert } from "@/lib/fx";
import { computeRunway, type RunwayBill, type RunwayCycle } from "@/lib/runway";
import HoyView from "./HoyView";

export const dynamic = "force-dynamic";

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function HoyPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return <div className="card">Iniciá sesión.</div>;

  const now = new Date();
  const today = isoDay(now);
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const from30 = new Date(now.getTime() - 30 * 86_400_000);

  const [billsRes, cyclesRes, walletsRes, settingsRes, agendaRes, cardsRes, shiftsRes, rates] =
    await Promise.all([
      supabase
        .from("bills_with_balance")
        .select("id, name, kind, tipo, currency, balance, monthly_amount, due_date, archived, priority_next_week")
        .eq("archived", false),
      supabase.from("bill_cycles").select("bill_id, amount, period_start"),
      supabase
        .from("payment_methods")
        .select("id, name, balance, balance_currency, hidden")
        .eq("hidden", false),
      supabase
        .from("user_settings")
        .select("default_currency, display_name, gig_worker_enabled, gig_per_dow_goals, gig_default_goal, timezone")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("agenda_items")
        .select("id, title, starts_at, ends_at, category, done, all_day")
        .gte("starts_at", `${today}T00:00:00`)
        .lte("starts_at", `${today}T23:59:59`)
        .order("starts_at", { ascending: true }),
      supabase
        .from("board_cards")
        .select("id, board_id, title, due_date, done, boards(name, color)")
        .eq("done", false)
        .not("due_date", "is", null)
        .lte("due_date", isoDay(in7))
        .order("due_date", { ascending: true })
        .limit(8),
      supabase
        .from("gig_shifts_with_totals")
        .select("shift_date, hours_worked, net_total, goal_amount")
        .gte("shift_date", isoDay(from30))
        .lte("shift_date", today),
      getRates(),
    ]);

  const s = (settingsRes.data ?? {}) as {
    default_currency?: string;
    display_name?: string | null;
    gig_worker_enabled?: boolean;
    gig_per_dow_goals?: unknown;
    gig_default_goal?: number;
    timezone?: string | null;
  };
  const currency = s.default_currency ?? "ARS";

  // Bolsillo convertido a la moneda default. La banda muestra cada billetera en
  // su propia moneda; el total va convertido.
  type RawWallet = { id: string; name: string; balance: number; balance_currency: string };
  let walletTotal = 0;
  const wallets: { id: string; name: string; balance: number; currency: string; sort: number }[] = [];
  for (const w of (walletsRes.data ?? []) as RawWallet[]) {
    const v =
      w.balance_currency === currency
        ? Number(w.balance)
        : convert(Number(w.balance), w.balance_currency, currency, rates);
    if (v !== null) walletTotal += v;
    if (Number(w.balance) !== 0) {
      wallets.push({
        id: w.id,
        name: w.name,
        balance: Number(w.balance),
        currency: w.balance_currency || currency,
        sort: v ?? 0,
      });
    }
  }
  wallets.sort((a, b) => b.sort - a.sort);

  const bills = (billsRes.data ?? []) as (RunwayBill & { priority_next_week: boolean })[];

  const runway = computeRunway({
    walletTotal,
    bills,
    cycles: (cyclesRes.data ?? []) as RunwayCycle[],
    defaultCurrency: currency,
    rates,
    today: now,
  });

  // Rendimiento real de Jornada, para traducir la brecha a jornadas.
  const shifts = (shiftsRes.data ?? []) as {
    shift_date: string; hours_worked: number; net_total: number; goal_amount: number | null;
  }[];
  const netTotal = shifts.reduce((a, x) => a + Number(x.net_total), 0);
  const hoursTotal = shifts.reduce((a, x) => a + Number(x.hours_worked), 0);
  const workedDays = shifts.filter((x) => Number(x.hours_worked) > 0).length;
  const perHour = hoursTotal > 0 ? netTotal / hoursTotal : 0;
  const avgPerDay = workedDays > 0 ? netTotal / workedDays : 0;

  const dow = (now.getDay() + 6) % 7; // Lun=0
  const perDow = Array.isArray(s.gig_per_dow_goals) ? (s.gig_per_dow_goals as number[]) : null;
  const todayGoal = perDow && perDow[dow] > 0 ? perDow[dow] : Number(s.gig_default_goal ?? 0);
  const todayShift = shifts.find((x) => x.shift_date === today) ?? null;

  // La agenda se resuelve acá y no en el cliente: el servidor corre en UTC y el
  // teléfono en tu huso, así que formatear la hora al hidratar daba dos textos
  // distintos para el mismo evento (y React tiraba el árbol abajo).
  type RawAgenda = {
    id: string; title: string; starts_at: string; ends_at: string | null;
    category: string; done: boolean; all_day: boolean;
  };
  const tz = s.timezone || "America/Argentina/Buenos_Aires";
  const hhmm = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
  });
  const agendaRows = (agendaRes.data ?? []) as RawAgenda[];
  const nowMs = now.getTime();
  const slim = (a: RawAgenda) => ({
    id: a.id, title: a.title, category: a.category, time: hhmm.format(new Date(a.starts_at)),
  });
  const currentRow = agendaRows.find((a) => {
    const st = new Date(a.starts_at).getTime();
    const en = a.ends_at ? new Date(a.ends_at).getTime() : st + 3600_000;
    return nowMs >= st && nowMs <= en;
  });
  const nextRow = agendaRows.find((a) => new Date(a.starts_at).getTime() > nowMs);

  type RawCard = {
    id: string; board_id: string; title: string; due_date: string | null;
    boards?: { name: string; color: string | null }[] | { name: string; color: string | null } | null;
  };
  const cards = ((cardsRes.data ?? []) as RawCard[]).map((c) => {
    const b = Array.isArray(c.boards) ? c.boards[0] ?? null : c.boards ?? null;
    return { id: c.id, board_id: c.board_id, title: c.title, due_date: c.due_date, board: b };
  });

  return (
    <HoyView
      currency={currency}
      runway={runway}
      wallets={wallets}
      todayIso={today}
      agendaNow={currentRow ? slim(currentRow) : null}
      agendaNext={nextRow ? slim(nextRow) : null}
      agendaCount={agendaRows.length}
      cards={cards}
      gig={{
        enabled: !!s.gig_worker_enabled,
        perHour,
        avgPerDay,
        todayGoal,
        todayEarned: todayShift ? Number(todayShift.net_total) : 0,
        todayHours: todayShift ? Number(todayShift.hours_worked) : 0,
      }}
    />
  );
}
