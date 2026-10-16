/* Tipos, constantes y helpers compartidos por las pantallas de Jornada
   (hoy, histórico, calculadora, recorrido GPS). */

import { createClient } from "@/lib/supabase/client";

export type Shift = {
  id: string;
  shift_date: string;
  goal_amount: number | null;
  goal_hours: number | null;
  hours_worked: number;
  km_driven: number;
  notes: string | null;
  closed_at: string | null;
  income_bill_id?: string | null;
  total_earnings: number;
  total_tip_app: number;
  total_tip_cash: number;
  total_cash_trip: number;
  total_expense: number;
  total_fuel: number;
  total_liters: number;
  net_total: number;
  entry_count: number;
};

export type Entry = {
  id: string;
  shift_id: string | null;
  shift_date: string;
  platform: string | null;
  kind: "earnings" | "tip_app" | "tip_cash" | "cash_trip" | "expense" | "fuel";
  amount: number;
  currency: string;
  note: string | null;
  liters: number | null;
  odometer_km: number | null;
  payment_method_id: string | null;
  created_at: string;
};

export type Tab = "today" | "history" | "calc";

export const KIND_META: Record<Entry["kind"], { label: string; emoji: string; color: string }> = {
  earnings:  { label: "App",        emoji: "📱", color: "#38bdf8" },
  tip_app:   { label: "Propina app",emoji: "💳", color: "#a78bfa" },
  tip_cash:  { label: "Propina ef.",emoji: "💵", color: "#34d399" },
  cash_trip: { label: "Viaje ef.",  emoji: "💰", color: "#fbbf24" },
  fuel:      { label: "Nafta",      emoji: "⛽", color: "#fb923c" },
  expense:   { label: "Otro gasto", emoji: "🧾", color: "#f87171" },
};

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type DayLevel = "strong" | "medium" | "weak" | "rest";
export const LEVEL_WEIGHT: Record<DayLevel, number> = {
  strong: 0.7,
  medium: 0.5,
  weak: 0.3,
  rest: 0,
};
export const LEVEL_LABEL: Record<DayLevel, string> = {
  strong: "Fuerte",
  medium: "Medio",
  weak: "Flojo",
  rest: "Descanso",
};
export const LEVEL_EMOJI: Record<DayLevel, string> = {
  strong: "💪",
  medium: "🟢",
  weak: "🟡",
  rest: "😴",
};

export function todayShiftFromList(shifts: Shift[], today: string): Shift | null {
  return shifts.find((s) => s.shift_date === today) ?? null;
}

// Asegura que existe un gig_shifts para la fecha dada y devuelve su id.
// Sirve tanto para «Hoy» como para sumar registros a días pasados desde Histórico.
export async function ensureShiftForDate(date: string): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: existing } = await supabase
    .from("gig_shifts")
    .select("id")
    .eq("user_id", user.id)
    .eq("shift_date", date)
    .maybeSingle();
  if (existing && (existing as { id: string }).id) return (existing as { id: string }).id;
  const { data, error } = await supabase
    .from("gig_shifts")
    .insert({ user_id: user.id, shift_date: date })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    return null;
  }
  return (data as { id: string }).id;
}

export function fmtHrs(n: number) {
  if (!n || n <= 0) return "0:00";
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function dowFromIso(iso: string): number {
  // Lun=0 ... Dom=6
  const d = new Date(iso + "T00:00:00").getDay();
  return d === 0 ? 6 : d - 1;
}

/** "jueves 16 de octubre" a partir de "2026-10-16". */
export function fmtLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}
