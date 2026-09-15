import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import JornadaView from "./JornadaView";

export const dynamic = "force-dynamic";

// Fallback de último recurso para usuarios sin plataformas configuradas.
// El listado real se elige en el onboarding según la región del usuario.
const PLATFORMS_DEFAULT: string[] = ["Otro"];

export default async function JornadaPage() {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return (
      <div className="card text-center space-y-2">
        <p className="font-medium">Iniciá sesión para ver tu jornada.</p>
      </div>
    );
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select(
      "gig_worker_enabled, gig_default_goal, gig_default_hours, gig_default_currency, gig_platforms, gig_dead_days, gig_rest_days, gig_day_levels, gig_weekly_goal, gig_per_dow_goals, gig_per_dow_hours, gig_tank_liters"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const enabled = !!(settings as { gig_worker_enabled?: boolean } | null)?.gig_worker_enabled;

  if (!enabled) {
    return (
      <div className="card space-y-3">
        <h1 className="text-lg font-semibold">Jornada</h1>
        <p className="text-sm text-muted">
          Esta sección es para quienes trabajan en delivery o transporte (Uber, Rappi, Didi, PedidosYa, Cabify…).
          Activala desde <span className="text-accent">Ajustes → Jornada laboral</span> y completá tus valores
          predeterminados (meta diaria, horas, plataformas).
        </p>
        <Link href="/ajustes" className="btn-primary inline-block">Ir a Ajustes</Link>
      </div>
    );
  }

  // Ventana: últimos 90 días
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const from = new Date(today);
  from.setDate(from.getDate() - 90);
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;

  const [shiftsRes, entriesRes, pmRes] = await Promise.all([
    supabase
      .from("gig_shifts_with_totals")
      .select(
        "id, shift_date, goal_amount, goal_hours, hours_worked, km_driven, notes, closed_at, income_bill_id, total_earnings, total_tip_app, total_tip_cash, total_cash_trip, total_expense, total_fuel, total_liters, net_total, entry_count"
      )
      .gte("shift_date", fromStr)
      .lte("shift_date", todayStr)
      .order("shift_date", { ascending: false }),
    supabase
      .from("gig_entries")
      .select("id, shift_id, shift_date, platform, kind, amount, currency, note, liters, odometer_km, payment_method_id, created_at")
      .gte("shift_date", fromStr)
      .lte("shift_date", todayStr)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("hidden", false)
      .order("name", { ascending: true }),
  ]);

  const s = (settings ?? {}) as {
    gig_default_goal?: number;
    gig_default_hours?: number;
    gig_default_currency?: string;
    gig_platforms?: unknown;
    gig_dead_days?: unknown;
    gig_rest_days?: unknown;
    gig_day_levels?: unknown;
    gig_weekly_goal?: number;
    gig_per_dow_goals?: unknown;
    gig_per_dow_hours?: unknown;
    gig_tank_liters?: number | null;
  };

  const platforms =
    Array.isArray(s.gig_platforms) && s.gig_platforms.length > 0
      ? (s.gig_platforms as string[])
      : PLATFORMS_DEFAULT;
  const deadDays = Array.isArray(s.gig_dead_days) ? (s.gig_dead_days as number[]) : [];
  const restDays = Array.isArray(s.gig_rest_days) ? (s.gig_rest_days as number[]) : [];

  // Niveles por día: ["strong","medium","weak","rest"] indexado Lun..Dom.
  // Si no está seteado, derivamos de rest/dead para no romper a usuarios viejos:
  //   rest_days -> "rest", dead_days -> "weak" (legado: flojo era 0.5), resto "strong".
  type DayLevel = "strong" | "medium" | "weak" | "rest";
  const rawLevels = s.gig_day_levels;
  const fallbackLevels: DayLevel[] = Array.from({ length: 7 }, (_, i) =>
    restDays.includes(i) ? "rest" : deadDays.includes(i) ? "weak" : "strong"
  );
  const dayLevels: DayLevel[] =
    Array.isArray(rawLevels) && (rawLevels as unknown[]).length === 7
      ? (rawLevels as DayLevel[]).map((x): DayLevel =>
          x === "strong" || x === "medium" || x === "weak" || x === "rest" ? x : "strong"
        )
      : fallbackLevels;

  const perDowGoals =
    Array.isArray(s.gig_per_dow_goals) && (s.gig_per_dow_goals as unknown[]).length === 7
      ? (s.gig_per_dow_goals as number[]).map((n) => Number(n) || 0)
      : null;
  const perDowHours =
    Array.isArray(s.gig_per_dow_hours) && (s.gig_per_dow_hours as unknown[]).length === 7
      ? (s.gig_per_dow_hours as number[]).map((n) => Number(n) || 0)
      : null;

  return (
    <JornadaView
      todayStr={todayStr}
      defaultGoal={Number(s.gig_default_goal ?? 0)}
      defaultHours={Number(s.gig_default_hours ?? 8)}
      currency={s.gig_default_currency ?? "ARS"}
      platforms={platforms}
      dayLevels={dayLevels}
      weeklyGoal={Number(s.gig_weekly_goal ?? 0)}
      perDowGoals={perDowGoals}
      perDowHours={perDowHours}
      shifts={shiftsRes.data ?? []}
      entries={entriesRes.data ?? []}
      paymentMethods={(pmRes.data ?? []) as { id: string; name: string }[]}
      tankLiters={s.gig_tank_liters != null ? Number(s.gig_tank_liters) : null}
    />
  );
}
