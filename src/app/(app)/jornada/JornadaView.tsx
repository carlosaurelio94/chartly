"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import CircleProgress from "@/components/ui/CircleProgress";
import Money from "@/components/ui/Money";
import { fmtMoney } from "@/lib/format";

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

type Tab = "today" | "history" | "calc";

const KIND_META: Record<Entry["kind"], { label: string; emoji: string; color: string }> = {
  earnings:  { label: "App",        emoji: "📱", color: "#38bdf8" },
  tip_app:   { label: "Propina app",emoji: "💳", color: "#a78bfa" },
  tip_cash:  { label: "Propina ef.",emoji: "💵", color: "#34d399" },
  cash_trip: { label: "Viaje ef.",  emoji: "💰", color: "#fbbf24" },
  fuel:      { label: "Nafta",      emoji: "⛽", color: "#fb923c" },
  expense:   { label: "Otro gasto", emoji: "🧾", color: "#f87171" },
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type DayLevel = "strong" | "medium" | "weak" | "rest";
const LEVEL_WEIGHT: Record<DayLevel, number> = {
  strong: 0.7,
  medium: 0.5,
  weak: 0.3,
  rest: 0,
};
const LEVEL_LABEL: Record<DayLevel, string> = {
  strong: "Fuerte",
  medium: "Medio",
  weak: "Flojo",
  rest: "Descanso",
};
const LEVEL_EMOJI: Record<DayLevel, string> = {
  strong: "💪",
  medium: "🟢",
  weak: "🟡",
  rest: "😴",
};

function todayShiftFromList(shifts: Shift[], today: string): Shift | null {
  return shifts.find((s) => s.shift_date === today) ?? null;
}

// Asegura que existe un gig_shifts para la fecha dada y devuelve su id.
// Sirve tanto para «Hoy» como para sumar registros a días pasados desde Histórico.
async function ensureShiftForDate(date: string): Promise<string | null> {
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

function fmtHrs(n: number) {
  if (!n || n <= 0) return "0:00";
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function dowFromIso(iso: string): number {
  // Lun=0 ... Dom=6
  const d = new Date(iso + "T00:00:00").getDay();
  return d === 0 ? 6 : d - 1;
}

export default function JornadaView({
  todayStr,
  defaultGoal,
  defaultHours,
  currency,
  platforms,
  dayLevels,
  weeklyGoal,
  perDowGoals,
  perDowHours,
  shifts,
  entries,
  paymentMethods,
  tankLiters,
}: {
  todayStr: string;
  defaultGoal: number;
  defaultHours: number;
  currency: string;
  platforms: string[];
  dayLevels: DayLevel[];
  weeklyGoal: number;
  perDowGoals: number[] | null;
  perDowHours: number[] | null;
  shifts: Shift[];
  entries: Entry[];
  paymentMethods: { id: string; name: string }[];
  tankLiters: number | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("today");
  const [autoOpen, setAutoOpen] = useState<{ kind: Entry["kind"]; platform: string | null; note: string } | null>(null);

  // Web Share Target / shortcut: si la URL trae ?share=1 (shortcut/manual)
  // o title/text/url (manifest share_target con method GET), abrimos el modal pre-poblado.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const title = params.get("title") ?? "";
    const text = params.get("text") ?? "";
    const url = params.get("url") ?? "";
    const isShare = params.get("share") === "1" || !!(title || text || url);
    if (!isShare) return;
    const platformParam = params.get("platform");
    const note = [title, text, url].filter(Boolean).join(" · ").slice(0, 200);
    const haystack = (title + " " + text + " " + url).toLowerCase();
    const PRETTY: Record<string, string> = {
      uber: "Uber",
      rappi: "Rappi",
      pedidosya: "PedidosYa",
      didi: "Didi",
      cabify: "Cabify",
      "mercado pago": "Mercado Pago",
      mercadopago: "Mercado Pago",
    };
    const detectedKey = Object.keys(PRETTY).find((p) => haystack.includes(p));
    const platform = platformParam ?? (detectedKey ? PRETTY[detectedKey] : null);
    setAutoOpen({ kind: "earnings", platform, note });
    setTab("today");
    if (window.history?.replaceState) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const todayShift = todayShiftFromList(shifts, todayStr);
  const todayEntries = useMemo(() => entries.filter((e) => e.shift_date === todayStr), [entries, todayStr]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Jornada</h1>
        <div className="text-xs text-muted">{currency}</div>
      </div>

      <div className="flex gap-1 bg-card border border-line rounded-full p-1 text-sm">
        <TabBtn active={tab === "today"}   onClick={() => setTab("today")}   label="Hoy" />
        <TabBtn active={tab === "history"} onClick={() => setTab("history")} label="Histórico" />
        <TabBtn active={tab === "calc"}    onClick={() => setTab("calc")}    label="Calculadora" />
      </div>

      {tab === "today" && (
        <TodayPane
          todayStr={todayStr}
          shift={todayShift}
          entries={todayEntries}
          defaultGoal={defaultGoal}
          defaultHours={defaultHours}
          currency={currency}
          platforms={platforms}
          paymentMethods={paymentMethods}
          perDowGoals={perDowGoals}
          perDowHours={perDowHours}
          dayLevels={dayLevels}
          autoOpen={autoOpen}
          onAutoOpenConsumed={() => setAutoOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {tab === "history" && (
        <HistoryPane
          shifts={shifts}
          entries={entries}
          currency={currency}
          platforms={platforms}
          paymentMethods={paymentMethods}
          tankLiters={tankLiters}
          todayStr={todayStr}
          onChanged={() => router.refresh()}
        />
      )}
      {tab === "calc" && (
        <CalcPane
          shifts={shifts}
          weeklyGoal={weeklyGoal}
          dayLevels={dayLevels}
          currency={currency}
          perDowGoals={perDowGoals}
          onSave={() => router.refresh()}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 rounded-full text-center transition ${
        active ? "bg-accent text-black font-medium" : "text-muted"
      }`}
    >
      {label}
    </button>
  );
}

/* ---------------- TODAY ---------------- */

function TodayPane({
  todayStr,
  shift,
  entries,
  defaultGoal,
  defaultHours,
  currency,
  platforms,
  paymentMethods,
  perDowGoals,
  perDowHours,
  dayLevels,
  autoOpen,
  onAutoOpenConsumed,
  onChanged,
}: {
  todayStr: string;
  shift: Shift | null;
  entries: Entry[];
  defaultGoal: number;
  defaultHours: number;
  currency: string;
  platforms: string[];
  paymentMethods: { id: string; name: string }[];
  perDowGoals: number[] | null;
  perDowHours: number[] | null;
  dayLevels: DayLevel[];
  autoOpen: { kind: Entry["kind"]; platform: string | null; note: string } | null;
  onAutoOpenConsumed: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ kind?: Entry["kind"]; platform?: string | null; note?: string }>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [kmEditing, setKmEditing] = useState(false);
  const [kmInput, setKmInput] = useState<string>(String(shift?.km_driven ?? 0));

  // Cuando llega un share desde otra app, abrir el modal pre-poblado
  useEffect(() => {
    if (!autoOpen) return;
    setAddPrefill({ kind: autoOpen.kind, platform: autoOpen.platform, note: autoOpen.note });
    setAddOpen(true);
    onAutoOpenConsumed();
  }, [autoOpen, onAutoOpenConsumed]);

  // Prelación: override manual de hoy → meta calculada por día de semana → default global
  // Día de descanso: si hoy es un día marcado como descanso y no hay override manual,
  // la meta es 0 (no se trabaja).
  const todayDow = dowFromIso(todayStr);
  const isRestToday = dayLevels[todayDow] === "rest";
  const dowGoal = isRestToday
    ? 0
    : (perDowGoals && perDowGoals[todayDow] > 0 ? perDowGoals[todayDow] : null);
  const dowHrs = isRestToday
    ? 0
    : (perDowHours && perDowHours[todayDow] > 0 ? perDowHours[todayDow] : null);
  const goal = Number(shift?.goal_amount ?? dowGoal ?? defaultGoal);
  const goalHours = Number(shift?.goal_hours ?? dowHrs ?? defaultHours);
  const goalSource: "manual" | "calc" | "rest" | "default" =
    shift?.goal_amount != null ? "manual" : isRestToday ? "rest" : dowGoal != null ? "calc" : "default";
  const hoursWorked = Number(shift?.hours_worked ?? 0);
  const kmDriven = Number(shift?.km_driven ?? 0);

  const grossIncome = entries
    .filter((e) => e.kind !== "expense" && e.kind !== "fuel")
    .reduce((s, e) => s + Number(e.amount), 0);
  const expense = entries
    .filter((e) => e.kind === "expense" || e.kind === "fuel")
    .reduce((s, e) => s + Number(e.amount), 0);
  const fuelCost = entries.filter((e) => e.kind === "fuel").reduce((s, e) => s + Number(e.amount), 0);
  const liters = entries.filter((e) => e.kind === "fuel").reduce((s, e) => s + Number(e.liters ?? 0), 0);
  const net = grossIncome - expense;

  const goalPct = goal > 0 ? Math.min(100, (grossIncome / goal) * 100) : 0;
  const hoursPct = goalHours > 0 ? Math.min(100, (hoursWorked / goalHours) * 100) : 0;
  const perHour = hoursWorked > 0 ? net / hoursWorked : 0;

  async function ensureShift(): Promise<string | null> {
    if (shift) return shift.id;
    return ensureShiftForDate(todayStr);
  }

  async function bumpHours(deltaMin: number) {
    setBusy(true);
    const id = await ensureShift();
    if (!id) { setBusy(false); return; }
    const next = Math.max(0, hoursWorked + deltaMin / 60);
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ hours_worked: next }).eq("id", id);
    setBusy(false);
    onChanged();
  }

  async function bumpKm(delta: number) {
    setBusy(true);
    const id = await ensureShift();
    if (!id) { setBusy(false); return; }
    const next = Math.max(0, kmDriven + delta);
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ km_driven: next }).eq("id", id);
    setBusy(false);
    onChanged();
  }

  async function saveKm() {
    const next = Math.max(0, Number(kmInput.replace(",", ".")) || 0);
    setBusy(true);
    const id = await ensureShift();
    if (!id) { setBusy(false); return; }
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ km_driven: next }).eq("id", id);
    setBusy(false);
    setKmEditing(false);
    onChanged();
  }

  async function deleteEntry(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    const supabase = createClient();
    await supabase.from("gig_entries").delete().eq("id", id);
    onChanged();
  }

  async function closeDay() {
    if (!shift) return;
    if (!confirm("¿Cerrar la jornada de hoy? Quedará en el histórico.")) return;
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ closed_at: new Date().toISOString() }).eq("id", shift.id);
    onChanged();
  }

  async function reopenDay() {
    if (!shift) return;
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ closed_at: null }).eq("id", shift.id);
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-4" style={{ padding: 22 }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="label">Hoy</p>
            <p className="text-xs text-muted">{todayStr}{shift?.closed_at ? " · cerrado" : ""}</p>
          </div>
          <button onClick={() => setOverrideOpen(true)} className="chip">Ajustar meta</button>
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <CircleProgress value={goalPct} size={108} stroke={10}>
            <div className="label" style={{ fontSize: 10 }}>Meta</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
              {goalPct.toFixed(0)}%
            </div>
          </CircleProgress>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="label" style={{ fontSize: 10 }}>Llevás hoy</p>
            <div style={{ marginTop: 4 }}>
              <Money amount={grossIncome} currency={currency} size={28} weight={800} />
            </div>
            <p className="text-xs text-muted mt-1.5">
              Meta {fmtMoney(goal, currency)} · faltan {fmtMoney(Math.max(0, goal - grossIncome), currency)}
            </p>
            {goalSource === "calc" && <span className="pill pill-accent mt-2 inline-flex">🧮 calculadora</span>}
            {goalSource === "manual" && <span className="pill pill-warning mt-2 inline-flex">✎ manual</span>}
            {goalSource === "rest" && <span className="pill pill-neutral mt-2 inline-flex">😴 descanso</span>}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-semibold uppercase tracking-wide">Horas</span>
            <span className="font-bold tabular">{fmtHrs(hoursWorked)} / {fmtHrs(goalHours)}</span>
          </div>
          <div className="h-1.5 bg-line rounded-full overflow-hidden">
            <div className="h-full" style={{ width: `${hoursPct}%`, background: "var(--color-ok)" }} />
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {[15, 30, 60].map((m) => (
              <button key={m} onClick={() => bumpHours(m)} disabled={busy} className="chip border border-line text-xs">
                +{m}m
              </button>
            ))}
            <button onClick={() => bumpHours(-15)} disabled={busy || hoursWorked <= 0} className="chip border border-line text-xs text-danger">
              −15m
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span>🏁 Kilómetros del día</span>
            {!kmEditing ? (
              <span className="font-medium">{kmDriven.toFixed(1)} km</span>
            ) : null}
          </div>
          {kmEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="input flex-1"
                value={kmInput}
                onChange={(e) => setKmInput(e.target.value)}
                placeholder="0"
                autoFocus
              />
              <button onClick={saveKm} className="btn-primary" disabled={busy}>OK</button>
              <button onClick={() => { setKmInput(String(kmDriven)); setKmEditing(false); }} className="btn-ghost">×</button>
            </div>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {[5, 10, 25, 50].map((k) => (
                <button key={k} onClick={() => bumpKm(k)} disabled={busy} className="chip border border-line text-xs">
                  +{k}
                </button>
              ))}
              <button onClick={() => bumpKm(-5)} disabled={busy || kmDriven <= 0} className="chip border border-line text-xs text-danger">
                −5
              </button>
              <button onClick={() => { setKmInput(String(kmDriven)); setKmEditing(true); }} className="chip border border-line text-xs">
                ✎
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line">
          <KPI label="Bruto" value={fmtMoney(grossIncome, currency)} />
          <KPI label="Gastos" value={fmtMoney(expense, currency)} sub />
          <KPI label="Neto" value={fmtMoney(net, currency)} hi />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <KPI label="$/h" value={fmtMoney(perHour, currency)} />
          <KPI label="$/km" value={kmDriven > 0 ? fmtMoney(net / kmDriven, currency) : "—"} />
          <KPI label="km/L" value={liters > 0 ? `${(kmDriven / liters).toFixed(1)}` : "—"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <KPI label="Nafta hoy" value={fmtMoney(fuelCost, currency)} sub />
          <KPI label="Litros" value={liters > 0 ? `${liters.toFixed(2)} L` : "—"} />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => setAddOpen(true)} className="btn-primary flex-1">+ Agregar registro</button>
          {shift && !shift.closed_at && (
            <button onClick={closeDay} className="btn-ghost">Cerrar día</button>
          )}
          {shift?.closed_at && (
            <button onClick={reopenDay} className="btn-ghost">Reabrir</button>
          )}
        </div>
      </div>

      {/* Por categoría */}
      <div className="card space-y-2">
        <p className="label">Desglose</p>
        {(["earnings", "tip_app", "tip_cash", "cash_trip", "fuel", "expense"] as const).map((k) => {
          const total = entries.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.amount), 0);
          if (total === 0) return null;
          const meta = KIND_META[k];
          const isOut = k === "expense" || k === "fuel";
          const litersForK = k === "fuel" ? entries.filter((e) => e.kind === "fuel").reduce((s, e) => s + Number(e.liters ?? 0), 0) : 0;
          return (
            <div key={k} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span style={{ color: meta.color }}>{meta.emoji}</span>
                {meta.label}
                {k === "fuel" && litersForK > 0 && (
                  <span className="text-xs text-muted">· {litersForK.toFixed(2)} L</span>
                )}
              </span>
              <span className={`font-medium ${isOut ? "text-danger" : ""}`}>
                {isOut ? "−" : ""}{fmtMoney(total, currency)}
              </span>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-sm text-muted">Sin registros aún. Tocá «Agregar registro» para empezar.</p>}
      </div>

      {/* Lista entradas */}
      {entries.length > 0 && (
        <div className="card space-y-2">
          <p className="label">Registros del día</p>
          <ul className="space-y-1">
            {entries.map((e) => {
              const meta = KIND_META[e.kind];
              return (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span style={{ color: meta.color }}>{meta.emoji}</span>{" "}
                      <span className="font-medium">{e.platform ?? meta.label}</span>
                      {e.note && <span className="text-muted"> · {e.note}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(e.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {meta.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${e.kind === "expense" || e.kind === "fuel" ? "text-danger" : ""}`}>
                      {e.kind === "expense" || e.kind === "fuel" ? "−" : ""}{fmtMoney(Number(e.amount), e.currency || currency)}
                    </p>
                    {e.kind === "fuel" && e.liters && (
                      <p className="text-[10px] text-muted">{Number(e.liters).toFixed(2)} L</p>
                    )}
                    <button onClick={() => deleteEntry(e.id)} className="text-xs text-danger">Eliminar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AddEntryModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setAddPrefill({}); }}
        targetDate={todayStr}
        platforms={platforms}
        paymentMethods={paymentMethods}
        currency={currency}
        prefill={addPrefill}
        ensureShift={ensureShift}
        onSaved={onChanged}
      />

      <OverrideModal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        shift={shift}
        defaultGoal={dowGoal ?? defaultGoal}
        defaultHours={dowHrs ?? defaultHours}
        todayStr={todayStr}
        ensureShift={ensureShift}
        onSaved={onChanged}
      />
    </div>
  );
}

function KPI({ label, value, sub, hi }: { label: string; value: string; sub?: boolean; hi?: boolean }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--color-fg) 4%, transparent)",
        border: "1px solid var(--color-line)",
        borderRadius: 14,
        padding: "10px 12px",
        minWidth: 0,
      }}
    >
      <p className="label" style={{ fontSize: 10 }}>{label}</p>
      <p
        className="font-bold tabular truncate mt-1"
        style={{
          fontSize: 15,
          color: hi ? "var(--color-accent-on-tint)" : sub ? "var(--color-danger)" : "var(--color-fg)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function AddEntryModal({
  open, onClose, targetDate, platforms, paymentMethods, currency, prefill, ensureShift, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  targetDate: string;
  platforms: string[];
  paymentMethods: { id: string; name: string }[];
  currency: string;
  prefill: { kind?: Entry["kind"]; platform?: string | null; note?: string };
  ensureShift: () => Promise<string | null>;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<Entry["kind"]>(prefill.kind ?? "earnings");
  const [platform, setPlatform] = useState<string>(prefill.platform ?? platforms[0] ?? "");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>(prefill.note ?? "");
  const [liters, setLiters] = useState<string>("");
  const [odometer, setOdometer] = useState<string>("");
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-aplicar prefill cuando cambia (ej. share target)
  useEffect(() => {
    if (!open) return;
    if (prefill.kind) setKind(prefill.kind);
    if (prefill.platform !== undefined) setPlatform(prefill.platform ?? "");
    if (prefill.note !== undefined) setNote(prefill.note);
  }, [open, prefill.kind, prefill.platform, prefill.note]);

  const isFuel = kind === "fuel";
  const isPlatformless = kind === "expense" || kind === "fuel";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = Number(amount.replace(",", "."));
    if (!isFinite(amt) || amt <= 0) { setErr("Ingresá un monto válido"); return; }
    const litersNum = isFuel && liters ? Number(liters.replace(",", ".")) : null;
    const odometerNum = odometer ? Number(odometer.replace(",", ".")) : null;
    setBusy(true);
    const shiftId = await ensureShift();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setBusy(false); return; }
    const { error } = await supabase.from("gig_entries").insert({
      user_id: user.id,
      shift_id: shiftId,
      shift_date: targetDate,
      platform: isPlatformless ? null : (platform || null),
      kind,
      amount: amt,
      currency,
      note: note.trim() || null,
      liters: litersNum,
      odometer_km: odometerNum,
      // Solo guardamos el medio de pago para entradas tipo nafta (acumulador).
      payment_method_id: isFuel ? paymentMethodId : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setAmount(""); setNote(""); setLiters(""); setOdometer(""); setKind("earnings"); setPaymentMethodId(null);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Agregar registro">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {(["earnings", "tip_app", "tip_cash", "cash_trip", "fuel", "expense"] as const).map((k) => {
              const m = KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`chip border justify-center text-xs py-2 ${kind === k ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
                >
                  <span>{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!isPlatformless && (
          <div>
            <label className="label">Plataforma</label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {Array.from(new Set([...(platform ? [platform] : []), ...platforms])).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`chip border text-xs ${platform === p ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">Monto ({currency})</label>
          <input
            type="text"
            inputMode="decimal"
            className="input mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </div>

        {isFuel && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Litros</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mt-1"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="20"
                />
                {amount && liters && Number(liters) > 0 && (
                  <p className="text-xs text-muted mt-1">
                    {fmtMoney(Number(amount.replace(",", ".")) / Number(liters.replace(",", ".")), currency)}/L
                  </p>
                )}
              </div>
              <div>
                <label className="label">Odómetro (opcional)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mt-1"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  placeholder="km totales"
                />
              </div>
            </div>
            <div>
              <label className="label">¿Con qué pagaste?</label>
              <p className="text-xs text-muted">
                La nafta queda registrada como ya pagada en el acumulador del mes.
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethodId(null)}
                  className={`chip border text-xs ${paymentMethodId === null ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
                >
                  Desconocido
                </button>
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethodId(pm.id)}
                    className={`chip border text-xs ${paymentMethodId === pm.id ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
                  >
                    {pm.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="label">Nota (opcional)</label>
          <input
            className="input mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isFuel ? "Estación, octanaje…" : kind === "expense" ? "Peaje, comisión, lavado…" : "Pedido, viaje, zona…"}
          />
        </div>

        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OverrideModal({
  open, onClose, shift, defaultGoal, defaultHours, todayStr, ensureShift, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  shift: Shift | null;
  defaultGoal: number;
  defaultHours: number;
  todayStr: string;
  ensureShift: () => Promise<string | null>;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState<string>(String(shift?.goal_amount ?? defaultGoal));
  const [hours, setHours] = useState<string>(String(shift?.goal_hours ?? defaultHours));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const id = await ensureShift();
    if (!id) { setBusy(false); return; }
    const supabase = createClient();
    await supabase.from("gig_shifts").update({
      goal_amount: goal === "" ? null : Number(goal.replace(",", ".")),
      goal_hours: hours === "" ? null : Number(hours.replace(",", ".")),
    }).eq("id", id);
    setBusy(false);
    onSaved();
    onClose();
  }

  async function clearOverride() {
    if (!shift) { onClose(); return; }
    setBusy(true);
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ goal_amount: null, goal_hours: null }).eq("id", shift.id);
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Meta de hoy">
      <form onSubmit={save} className="space-y-3">
        <p className="text-xs text-muted">
          Solo afecta a {todayStr}. Mañana vuelven los valores por defecto.
        </p>
        <div>
          <label className="label">Meta de ingresos</label>
          <input
            type="text"
            inputMode="decimal"
            className="input mt-1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="label">Horas a trabajar</label>
          <input
            type="text"
            inputMode="decimal"
            className="input mt-1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={clearOverride} className="btn-ghost flex-1" disabled={busy}>
            Restablecer
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- HISTORY ---------------- */

function HistoryPane({
  shifts, entries, currency, platforms, paymentMethods, tankLiters, todayStr, onChanged,
}: {
  shifts: Shift[];
  entries: Entry[];
  currency: string;
  platforms: string[];
  paymentMethods: { id: string; name: string }[];
  tankLiters: number | null;
  todayStr: string;
  onChanged: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newDayPickerOpen, setNewDayPickerOpen] = useState(false);
  const [newDayInput, setNewDayInput] = useState<string>("");
  const [newDayErr, setNewDayErr] = useState<string | null>(null);
  const [newDayBusy, setNewDayBusy] = useState(false);

  async function openPastDay() {
    setNewDayErr(null);
    const date = newDayInput.trim();
    if (!date) { setNewDayErr("Elegí una fecha"); return; }
    if (date > todayStr) { setNewDayErr("No podés registrar días futuros"); return; }
    setNewDayBusy(true);
    // Si no existe el shift para esa fecha, lo creamos para que aparezca en la lista.
    const existing = shifts.find((s) => s.shift_date === date);
    if (!existing) {
      const id = await ensureShiftForDate(date);
      if (!id) {
        setNewDayBusy(false);
        setNewDayErr("No se pudo crear el día. Intentá de nuevo.");
        return;
      }
      // Refrescamos los datos del server para incluir el nuevo shift en la lista.
      onChanged();
    }
    setNewDayBusy(false);
    setNewDayPickerOpen(false);
    setNewDayInput("");
    setSelectedDate(date);
  }
  // Agregados últimos 30 días, comparativa con previos 30
  const last30 = shifts.filter((s) => daysBetween(s.shift_date, todayStr) <= 30);
  const prev30 = shifts.filter((s) => {
    const d = daysBetween(s.shift_date, todayStr);
    return d > 30 && d <= 60;
  });

  const sumNet = (arr: Shift[]) => arr.reduce((s, x) => s + Number(x.net_total), 0);
  const sumGross = (arr: Shift[]) =>
    arr.reduce((s, x) => s + Number(x.total_earnings) + Number(x.total_tip_app) + Number(x.total_tip_cash) + Number(x.total_cash_trip), 0);
  const sumHrs = (arr: Shift[]) => arr.reduce((s, x) => s + Number(x.hours_worked), 0);
  const sumKm = (arr: Shift[]) => arr.reduce((s, x) => s + Number(x.km_driven ?? 0), 0);
  const sumFuel = (arr: Shift[]) => arr.reduce((s, x) => s + Number(x.total_fuel ?? 0), 0);
  const sumLiters = (arr: Shift[]) => arr.reduce((s, x) => s + Number(x.total_liters ?? 0), 0);

  const net30 = sumNet(last30);
  const netPrev = sumNet(prev30);
  const hours30 = sumHrs(last30);
  const km30 = sumKm(last30);
  const fuel30 = sumFuel(last30);
  const liters30 = sumLiters(last30);
  const perHour30 = hours30 > 0 ? net30 / hours30 : 0;
  const perKm30 = km30 > 0 ? net30 / km30 : 0;
  const kmPerLiter30 = liters30 > 0 ? km30 / liters30 : 0;
  const days30 = last30.length;
  const avgDay30 = days30 > 0 ? net30 / days30 : 0;
  const trend = netPrev > 0 ? ((net30 - netPrev) / netPrev) * 100 : null;

  // Por plataforma (últimos 30)
  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.kind === "expense" || e.kind === "fuel") continue;
      if (daysBetween(e.shift_date, todayStr) > 30) continue;
      const k = e.platform ?? "Otro";
      map.set(k, (map.get(k) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries, todayStr]);

  // Por día de semana (últimos 60 días) — para identificar muertos
  const byDow = useMemo(() => {
    const sums = Array(7).fill(0) as number[];
    const counts = Array(7).fill(0) as number[];
    for (const s of shifts) {
      if (daysBetween(s.shift_date, todayStr) > 60) continue;
      const d = dowFromIso(s.shift_date);
      sums[d] += Number(s.net_total);
      counts[d] += 1;
    }
    return sums.map((sum, i) => ({ dow: i, total: sum, avg: counts[i] > 0 ? sum / counts[i] : 0, count: counts[i] }));
  }, [shifts, todayStr]);

  // Mejor / peor día (últimos 30)
  const best = [...last30].sort((a, b) => Number(b.net_total) - Number(a.net_total))[0];
  const worst = [...last30].filter((s) => Number(s.net_total) > 0).sort((a, b) => Number(a.net_total) - Number(b.net_total))[0];

  // Sparkline últimos 14 días
  const last14 = useMemo(() => {
    const out: { date: string; net: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayStr + "T00:00:00");
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const s = shifts.find((x) => x.shift_date === iso);
      out.push({ date: iso, net: Number(s?.net_total ?? 0) });
    }
    return out;
  }, [shifts, todayStr]);
  const max14 = Math.max(1, ...last14.map((d) => d.net));

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <p className="label">Últimos 30 días</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Neto</p>
            <p className="text-lg font-semibold">{fmtMoney(net30, currency)}</p>
            {trend !== null && (
              <p className={`text-xs ${trend >= 0 ? "text-ok" : "text-danger"}`}>
                {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}% vs 30 prev.
              </p>
            )}
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Horas</p>
            <p className="text-lg font-semibold">{fmtHrs(hours30)}</p>
            <p className="text-xs text-muted">{days30} día{days30 === 1 ? "" : "s"}</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">$/h promedio</p>
            <p className="text-lg font-semibold">{fmtMoney(perHour30, currency)}</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Promedio diario</p>
            <p className="text-lg font-semibold">{fmtMoney(avgDay30, currency)}</p>
          </div>
        </div>
        <p className="text-xs text-muted">
          Bruto: <span className="text-fg font-medium">{fmtMoney(sumGross(last30), currency)}</span>
        </p>
      </div>

      <div className="card space-y-2">
        <p className="label">Vehículo · 30 días</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Kilómetros</p>
            <p className="text-lg font-semibold">{km30.toFixed(0)} km</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Nafta</p>
            <p className="text-lg font-semibold">{fmtMoney(fuel30, currency)}</p>
            <p className="text-xs text-muted">{liters30.toFixed(2)} L</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">$/km neto</p>
            <p className="text-lg font-semibold">{km30 > 0 ? fmtMoney(perKm30, currency) : "—"}</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Rendimiento</p>
            <p className="text-lg font-semibold">{kmPerLiter30 > 0 ? `${kmPerLiter30.toFixed(1)} km/L` : "—"}</p>
            <p className="text-xs text-muted">
              {liters30 > 0 ? fmtMoney(fuel30 / liters30, currency) + "/L prom." : ""}
            </p>
          </div>
          {tankLiters && tankLiters > 0 && (
            <div className="col-span-2 border border-line rounded-xl p-3">
              <p className="text-xs text-muted">Tanques gastados (tanque de {tankLiters} L)</p>
              <p className="text-lg font-semibold">
                {(liters30 / tankLiters).toFixed(2)} tanques
              </p>
              <p className="text-xs text-muted">
                ≈ {(liters30 / tankLiters / 30 * 7).toFixed(2)} por semana
              </p>
            </div>
          )}
        </div>
      </div>

      <GoogleMapsImportCard tankLiters={tankLiters} onImported={onChanged} />

      <div className="card space-y-2">
        <p className="label">Tendencia · 14 días</p>
        <div className="flex items-end gap-1 h-20">
          {last14.map((d) => (
            <div key={d.date} className="flex-1 bg-accent/70 rounded-sm" style={{ height: `${(d.net / max14) * 100}%`, minHeight: 2 }} title={`${d.date}: ${fmtMoney(d.net, currency)}`} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted">
          <span>{last14[0]?.date.slice(5)}</span>
          <span>{last14[last14.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      <div className="card space-y-2">
        <p className="label">Por plataforma · 30 días</p>
        {byPlatform.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay datos.</p>
        ) : (
          <ul className="space-y-1">
            {byPlatform.map(([p, total]) => {
              const tot = byPlatform.reduce((s, x) => s + x[1], 0);
              const pct = tot > 0 ? (total / tot) * 100 : 0;
              return (
                <li key={p} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{platforms.includes(p) ? p : `${p}`}</span>
                    <span className="font-medium">{fmtMoney(total, currency)} <span className="text-muted text-xs">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card space-y-2">
        <p className="label">Por día de semana · 60 días</p>
        <div className="grid grid-cols-7 gap-1">
          {byDow.map((d) => {
            const max = Math.max(1, ...byDow.map((x) => x.avg));
            return (
              <div key={d.dow} className="flex flex-col items-center gap-1">
                <div className="w-full h-16 bg-line rounded-sm relative overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-accent/70"
                    style={{ height: `${(d.avg / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted">{DAYS[d.dow]}</span>
                <span className="text-[10px] font-medium">{d.avg > 0 ? fmtMoney(d.avg, currency).replace(/[A-Z]{3}/, "").trim() : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {(best || worst) && (
        <div className="card space-y-2">
          <p className="label">Récords · 30 días</p>
          {best && (
            <div className="flex items-center justify-between text-sm">
              <span>🏆 Mejor día</span>
              <span className="font-medium text-ok">{best.shift_date} · {fmtMoney(Number(best.net_total), currency)}</span>
            </div>
          )}
          {worst && (
            <div className="flex items-center justify-between text-sm">
              <span>💤 Más flojo</span>
              <span className="font-medium">{worst.shift_date} · {fmtMoney(Number(worst.net_total), currency)}</span>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="label">Días registrados</p>
          {!newDayPickerOpen && (
            <button
              type="button"
              onClick={() => {
                // Default: ayer (más probable que hoy ya está en otra tab)
                const d = new Date(todayStr + "T00:00:00");
                d.setDate(d.getDate() - 1);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setNewDayInput(iso);
                setNewDayPickerOpen(true);
                setNewDayErr(null);
              }}
              className="chip border border-line text-xs text-accent"
            >
              + Día pasado
            </button>
          )}
        </div>
        {newDayPickerOpen && (
          <div className="border border-accent/40 rounded-xl p-3 space-y-2 bg-accent/5">
            <p className="text-sm font-medium">Registrar día pasado</p>
            <p className="text-xs text-muted">Elegí la fecha. Vas a poder cargarle horas, km y registros.</p>
            <div className="flex gap-2">
              <input
                type="date"
                className="input flex-1"
                value={newDayInput}
                onChange={(e) => setNewDayInput(e.target.value)}
                max={todayStr}
              />
              <button
                type="button"
                onClick={openPastDay}
                disabled={newDayBusy}
                className="btn-primary"
              >
                {newDayBusy ? "…" : "OK"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewDayPickerOpen(false);
                  setNewDayInput("");
                  setNewDayErr(null);
                }}
                className="btn-ghost"
              >
                ×
              </button>
            </div>
            {newDayErr && <p className="text-danger text-xs">{newDayErr}</p>}
          </div>
        )}
        <p className="text-xs text-muted">Tocá un día para ver el detalle o sumar registros.</p>
        {shifts.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay turnos registrados.</p>
        ) : (
          <ul className="space-y-1">
            {shifts.slice(0, 30).map((s) => {
              const goal = Number(s.goal_amount ?? 0);
              const gross = Number(s.total_earnings) + Number(s.total_tip_app) + Number(s.total_tip_cash) + Number(s.total_cash_trip);
              const pct = goal > 0 ? Math.min(100, (gross / goal) * 100) : 0;
              const isToday = s.shift_date === todayStr;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedDate(s.shift_date)}
                    className="w-full text-left border border-line rounded-lg px-3 py-2 text-sm hover:border-accent transition active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {s.shift_date}
                          {isToday && <span className="ml-1 text-[10px] text-accent">(hoy)</span>}
                          {s.closed_at ? "" : " · abierto"}
                        </p>
                        <p className="text-xs text-muted">
                          {fmtHrs(Number(s.hours_worked))} · {s.entry_count} reg.
                          {Number(s.km_driven) > 0 && <> · {Number(s.km_driven).toFixed(0)} km</>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{fmtMoney(Number(s.net_total), currency)}</p>
                        {goal > 0 && <p className="text-xs text-muted">{pct.toFixed(0)}% meta</p>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <WeekToIncomeCard
        shifts={shifts}
        todayStr={todayStr}
        currency={currency}
        onChanged={onChanged}
      />

      <PastDayModal
        date={selectedDate}
        onClose={() => setSelectedDate(null)}
        shifts={shifts}
        entries={entries}
        platforms={platforms}
        paymentMethods={paymentMethods}
        currency={currency}
        onChanged={onChanged}
      />
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

// Devuelve el lunes (00:00) de la semana ISO de la fecha indicada (YYYY-MM-DD).
function mondayOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0=Domingo, 1=Lunes…
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ---------------- WEEK → INCOME ---------------- */

function WeekToIncomeCard({
  shifts, todayStr, currency, onChanged,
}: {
  shifts: Shift[];
  todayStr: string;
  currency: string;
  onChanged: () => void;
}) {
  // Semana actual + 3 previas
  const weeks = useMemo(() => {
    const out: { start: string; end: string; label: string }[] = [];
    let cursor = mondayOfWeek(todayStr);
    for (let i = 0; i < 4; i++) {
      const end = addDaysISO(cursor, 6);
      const label = i === 0
        ? `Esta semana · ${fmtDayShort(cursor)}–${fmtDayShort(end)}`
        : i === 1
        ? `Semana pasada · ${fmtDayShort(cursor)}–${fmtDayShort(end)}`
        : `${fmtDayShort(cursor)}–${fmtDayShort(end)}`;
      out.push({ start: cursor, end, label });
      cursor = addDaysISO(cursor, -7);
    }
    return out;
  }, [todayStr]);

  const [weekStart, setWeekStart] = useState<string>(weeks[1]?.start ?? weeks[0].start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [markPaid, setMarkPaid] = useState(true);

  const weekEnd = addDaysISO(weekStart, 6);
  const weekShifts = useMemo(
    () => shifts.filter((s) => s.shift_date >= weekStart && s.shift_date <= weekEnd),
    [shifts, weekStart, weekEnd]
  );

  const gross = weekShifts.reduce(
    (s, x) => s + Number(x.total_earnings) + Number(x.total_tip_app) + Number(x.total_tip_cash) + Number(x.total_cash_trip),
    0
  );
  const expense = weekShifts.reduce((s, x) => s + Number(x.total_expense) + Number(x.total_fuel), 0);
  const net = gross - expense;
  const dayCount = weekShifts.length;
  const alreadyConverted = weekShifts.some((s) => s.income_bill_id);
  const conflictBillId = weekShifts.find((s) => s.income_bill_id)?.income_bill_id ?? null;

  async function convert() {
    if (net <= 0) { setErr("La semana tiene un neto de 0 o negativo. Nada para convertir."); return; }
    if (alreadyConverted) {
      if (!confirm("Esta semana ya fue convertida en un ingreso. ¿Querés crear otro ingreso adicional igualmente?")) return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setBusy(false); return; }

    const label = `Jornada · ${fmtDayShort(weekStart)}–${fmtDayShort(weekEnd)}`;
    const notes = `Generado desde Jornada · ${dayCount} día${dayCount === 1 ? "" : "s"} trabajado${dayCount === 1 ? "" : "s"}.\nBruto: ${gross.toFixed(2)} ${currency} · Gastos: ${expense.toFixed(2)} ${currency} · Neto: ${net.toFixed(2)} ${currency}`;

    // 1) Ingreso puntual por el neto de la semana. Si ya se cobró, el payment
    //    de abajo lo deja en saldo 0 y pasa a «Cerradas»; si no, queda por cobrar.
    const { data: bill, error: insErr } = await supabase
      .from("bills")
      .insert({
        user_id: user.id,
        name: label,
        amount: net,
        tipo: "puntual",
        kind: "income",
        currency,
        notes,
        due_date: weekEnd,
      })
      .select("id")
      .single();

    if (insErr || !bill) {
      setErr(insErr?.message ?? "No se pudo crear el ingreso");
      setBusy(false);
      return;
    }

    // 2) Si está marcado como cobrado, crear payment por el neto.
    if (markPaid) {
      const { error: payErr } = await supabase.from("payments").insert({
        bill_id: bill.id,
        user_id: user.id,
        amount: net,
        note: `Cobrado · ${dayCount} día${dayCount === 1 ? "" : "s"} de Jornada`,
      });
      if (payErr) {
        // No es fatal: el bill quedó creado igual.
        console.error(payErr);
      }
    }

    // 3) Marcar los shifts de la semana con el bill_id
    const ids = weekShifts.map((s) => s.id);
    if (ids.length > 0) {
      await supabase.from("gig_shifts").update({ income_bill_id: bill.id }).in("id", ids);
    }

    setBusy(false);
    setMsg(`✓ Ingreso creado en Cuentas (${fmtMoney(net, currency)}).`);
    onChanged();
  }

  return (
    <div className="card space-y-3">
      <p className="label">Convertir semana en ingreso</p>
      <p className="text-xs text-muted">
        Sumá lo trabajado en la semana y se carga como un <b>ingreso</b> en Cuentas. Útil para tener
        la plata semanal reflejada como entrada de dinero.
      </p>

      <div>
        <label className="label">Semana</label>
        <select
          className="input mt-1"
          value={weekStart}
          onChange={(e) => { setWeekStart(e.target.value); setMsg(null); setErr(null); }}
        >
          {weeks.map((w) => (
            <option key={w.start} value={w.start}>{w.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <KPI label="Bruto" value={fmtMoney(gross, currency)} />
        <KPI label="Gastos" value={fmtMoney(expense, currency)} sub />
        <KPI label="Neto" value={fmtMoney(net, currency)} hi />
      </div>
      <p className="text-xs text-muted">
        {dayCount} día{dayCount === 1 ? "" : "s"} cargados en esta semana.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={markPaid}
          onChange={(e) => setMarkPaid(e.target.checked)}
        />
        <span>Marcar como ya cobrado</span>
      </label>

      {alreadyConverted && (
        <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/5 p-2 text-xs text-yellow-300">
          ⚠️ Esta semana ya fue convertida{conflictBillId ? "" : ""}. Si volvés a crear, sumarás un ingreso extra a Cuentas.
        </div>
      )}

      <button
        type="button"
        onClick={convert}
        disabled={busy || net <= 0}
        className="btn-primary w-full"
      >
        {busy ? "Creando…" : "Crear ingreso en Cuentas"}
      </button>

      {msg && <p className="text-xs text-ok">{msg}</p>}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

/* ---------------- PAST DAY MODAL ---------------- */

function PastDayModal({
  date, onClose, shifts, entries, platforms, paymentMethods, currency, onChanged,
}: {
  date: string | null;
  onClose: () => void;
  shifts: Shift[];
  entries: Entry[];
  platforms: string[];
  paymentMethods: { id: string; name: string }[];
  currency: string;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hoursEditing, setHoursEditing] = useState(false);
  const [hoursInput, setHoursInput] = useState("");
  const [kmEditing, setKmEditing] = useState(false);
  const [kmInput, setKmInput] = useState("");

  const open = date !== null;
  const shift = useMemo(
    () => (date ? shifts.find((s) => s.shift_date === date) ?? null : null),
    [shifts, date]
  );
  const dayEntries = useMemo(
    () => (date ? entries.filter((e) => e.shift_date === date) : []),
    [entries, date]
  );

  // Sincronizar inputs cuando cambian los datos del día
  useEffect(() => {
    if (!shift) return;
    setHoursInput(String(shift.hours_worked ?? 0));
    setKmInput(String(shift.km_driven ?? 0));
  }, [shift]);

  if (!open || !date) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <div />
      </Modal>
    );
  }

  const hoursWorked = Number(shift?.hours_worked ?? 0);
  const kmDriven = Number(shift?.km_driven ?? 0);

  const grossIncome = dayEntries
    .filter((e) => e.kind !== "expense" && e.kind !== "fuel")
    .reduce((s, e) => s + Number(e.amount), 0);
  const expenseTotal = dayEntries
    .filter((e) => e.kind === "expense" || e.kind === "fuel")
    .reduce((s, e) => s + Number(e.amount), 0);
  const fuelTotal = dayEntries.filter((e) => e.kind === "fuel").reduce((s, e) => s + Number(e.amount), 0);
  const litersTotal = dayEntries.filter((e) => e.kind === "fuel").reduce((s, e) => s + Number(e.liters ?? 0), 0);
  const net = grossIncome - expenseTotal;
  const perHour = hoursWorked > 0 ? net / hoursWorked : 0;

  async function ensureShiftHere(): Promise<string | null> {
    if (shift) return shift.id;
    return ensureShiftForDate(date!);
  }

  async function deleteEntry(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("gig_entries").delete().eq("id", id);
    setBusy(false);
    onChanged();
  }

  async function saveHours() {
    const next = Math.max(0, Number(hoursInput.replace(",", ".")) || 0);
    setBusy(true);
    const id = await ensureShiftHere();
    if (!id) { setBusy(false); return; }
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ hours_worked: next }).eq("id", id);
    setBusy(false);
    setHoursEditing(false);
    onChanged();
  }

  async function saveKm() {
    const next = Math.max(0, Number(kmInput.replace(",", ".")) || 0);
    setBusy(true);
    const id = await ensureShiftHere();
    if (!id) { setBusy(false); return; }
    const supabase = createClient();
    await supabase.from("gig_shifts").update({ km_driven: next }).eq("id", id);
    setBusy(false);
    setKmEditing(false);
    onChanged();
  }

  async function toggleClosed() {
    if (!shift) return;
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("gig_shifts")
      .update({ closed_at: shift.closed_at ? null : new Date().toISOString() })
      .eq("id", shift.id);
    setBusy(false);
    onChanged();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Día ${date}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <KPI label="Bruto" value={fmtMoney(grossIncome, currency)} />
            <KPI label="Gastos" value={fmtMoney(expenseTotal, currency)} sub />
            <KPI label="Neto" value={fmtMoney(net, currency)} hi />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KPI label="Horas" value={fmtHrs(hoursWorked)} />
            <KPI label="$/h" value={hoursWorked > 0 ? fmtMoney(perHour, currency) : "—"} />
            <KPI label="km" value={kmDriven > 0 ? `${kmDriven.toFixed(0)}` : "—"} />
          </div>
          {(fuelTotal > 0 || litersTotal > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <KPI label="Nafta" value={fmtMoney(fuelTotal, currency)} sub />
              <KPI label="Litros" value={litersTotal > 0 ? `${litersTotal.toFixed(2)} L` : "—"} />
            </div>
          )}

          {/* Editor horas */}
          <div className="border border-line rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>⏱️ Horas trabajadas</span>
              {!hoursEditing && (
                <button onClick={() => setHoursEditing(true)} className="text-xs text-accent">
                  Editar
                </button>
              )}
            </div>
            {hoursEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input flex-1"
                  value={hoursInput}
                  onChange={(e) => setHoursInput(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
                <button onClick={saveHours} className="btn-primary" disabled={busy}>OK</button>
                <button
                  onClick={() => { setHoursInput(String(hoursWorked)); setHoursEditing(false); }}
                  className="btn-ghost"
                >×</button>
              </div>
            ) : (
              <p className="text-sm font-medium">{fmtHrs(hoursWorked)}</p>
            )}
          </div>

          {/* Editor km */}
          <div className="border border-line rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>🏁 Kilómetros</span>
              {!kmEditing && (
                <button onClick={() => setKmEditing(true)} className="text-xs text-accent">
                  Editar
                </button>
              )}
            </div>
            {kmEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input flex-1"
                  value={kmInput}
                  onChange={(e) => setKmInput(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
                <button onClick={saveKm} className="btn-primary" disabled={busy}>OK</button>
                <button
                  onClick={() => { setKmInput(String(kmDriven)); setKmEditing(false); }}
                  className="btn-ghost"
                >×</button>
              </div>
            ) : (
              <p className="text-sm font-medium">{kmDriven.toFixed(1)} km</p>
            )}
          </div>

          {/* Lista de registros */}
          <div className="space-y-2">
            <p className="label">Registros del día</p>
            {dayEntries.length === 0 ? (
              <p className="text-sm text-muted">No hay registros para este día. Sumá uno con el botón de abajo.</p>
            ) : (
              <ul className="space-y-1">
                {dayEntries.map((e) => {
                  const meta = KIND_META[e.kind];
                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 text-sm border border-line rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span style={{ color: meta.color }}>{meta.emoji}</span>{" "}
                          <span className="font-medium">{e.platform ?? meta.label}</span>
                          {e.note && <span className="text-muted"> · {e.note}</span>}
                        </p>
                        <p className="text-xs text-muted">{meta.label}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${e.kind === "expense" || e.kind === "fuel" ? "text-danger" : ""}`}>
                          {e.kind === "expense" || e.kind === "fuel" ? "−" : ""}
                          {fmtMoney(Number(e.amount), e.currency || currency)}
                        </p>
                        {e.kind === "fuel" && e.liters && (
                          <p className="text-[10px] text-muted">{Number(e.liters).toFixed(2)} L</p>
                        )}
                        <button onClick={() => deleteEntry(e.id)} className="text-xs text-danger" disabled={busy}>
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 pt-2 border-t border-line">
            <button onClick={() => setAddOpen(true)} className="btn-primary flex-1">
              + Agregar registro
            </button>
            {shift && (
              <button onClick={toggleClosed} className="btn-ghost" disabled={busy}>
                {shift.closed_at ? "Reabrir" : "Cerrar"}
              </button>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost w-full">Cerrar</button>
        </div>
      </Modal>

      <AddEntryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        targetDate={date}
        platforms={platforms}
        paymentMethods={paymentMethods}
        currency={currency}
        prefill={{}}
        ensureShift={ensureShiftHere}
        onSaved={onChanged}
      />
    </>
  );
}

/* ---------------- CALCULATOR ---------------- */

function CalcPane({
  shifts, weeklyGoal, dayLevels, currency, perDowGoals, onSave,
}: {
  shifts: Shift[];
  weeklyGoal: number;
  dayLevels: DayLevel[];
  currency: string;
  perDowGoals: number[] | null;
  onSave: () => void;
}) {
  const [goal, setGoal] = useState<string>(String(weeklyGoal || ""));
  const [levels, setLevels] = useState<DayLevel[]>(() => dayLevels.slice() as DayLevel[]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [analysisDays, setAnalysisDays] = useState<60 | 90>(60);

  // $/h actual = neto últimos 30 días / horas últimos 30
  const last30 = shifts.filter((s) => daysBetween(s.shift_date, todayIso()) <= 30);
  const net30 = last30.reduce((s, x) => s + Number(x.net_total), 0);
  const hrs30 = last30.reduce((s, x) => s + Number(x.hours_worked), 0);
  const perHour = hrs30 > 0 ? net30 / hrs30 : 0;

  function setDayLevel(d: number, lvl: DayLevel) {
    setLevels((prev) => {
      const next = prev.slice();
      next[d] = lvl;
      return next;
    });
  }

  function setAll(lvl: DayLevel) {
    setLevels(Array.from({ length: 7 }, () => lvl));
  }

  // ============== ANÁLISIS DE RENDIMIENTO POR DÍA DE SEMANA ==============
  // Por cada día (Lun..Dom): cuántas veces trabajaste, neto total, horas total,
  // y la métrica clave: $/hora (rentabilidad real, contemplando esfuerzo).
  const dayPerf = useMemo(() => {
    const stats = Array.from({ length: 7 }, () => ({
      workedCount: 0,
      totalNet: 0,
      totalHours: 0,
    }));
    for (const s of shifts) {
      if (daysBetween(s.shift_date, todayIso()) > analysisDays) continue;
      const i = dowFromIso(s.shift_date);
      const hrs = Number(s.hours_worked);
      const net = Number(s.net_total);
      // Sólo contar días con datos reales (horas > 0)
      if (hrs <= 0) continue;
      stats[i].workedCount += 1;
      stats[i].totalNet += net;
      stats[i].totalHours += hrs;
    }
    return stats.map((st, i) => ({
      dow: i,
      workedCount: st.workedCount,
      totalNet: st.totalNet,
      totalHours: st.totalHours,
      perHour: st.totalHours > 0 ? st.totalNet / st.totalHours : 0,
      avgPerDay: st.workedCount > 0 ? st.totalNet / st.workedCount : 0,
    }));
  }, [shifts, analysisDays]);

  // Ranking por $/h (descendente). Los días sin datos van al final.
  const dayPerfRanked = useMemo(() => {
    return [...dayPerf]
      .filter((d) => d.workedCount >= 1)
      .sort((a, b) => b.perHour - a.perHour);
  }, [dayPerf]);

  const maxPerHour = dayPerfRanked[0]?.perHour ?? 0;
  const validDays = dayPerf.filter((d) => d.workedCount >= 1);
  const hasEnoughData = validDays.length >= 3;

  // Sugerencia automática de niveles basada en $/h relativo al mejor día.
  // Devuelve { levels, reasoning } para previsualizar antes de aplicar.
  function buildSuggestion(): { levels: DayLevel[]; reasons: string[] } {
    const reasons: string[] = [];
    if (!hasEnoughData) {
      return {
        levels: Array.from({ length: 7 }, () => "strong"),
        reasons: ["Pocos datos todavía. Trabajá más días distintos para que la sugerencia sea confiable."],
      };
    }
    const next: DayLevel[] = Array.from({ length: 7 }, () => "medium");
    for (const d of dayPerf) {
      if (d.workedCount === 0) {
        next[d.dow] = "medium";
        reasons.push(`${DAYS[d.dow]}: sin datos → medio por defecto.`);
        continue;
      }
      const ratio = maxPerHour > 0 ? d.perHour / maxPerHour : 0;
      // Penalizar días con muy pocas muestras: si trabajaste < 2 veces, no clasificar duro.
      const lowSample = d.workedCount < 2;
      let lvl: DayLevel;
      let label: string;
      if (ratio >= 0.85) { lvl = "strong"; label = "fuerte"; }
      else if (ratio >= 0.65) { lvl = "medium"; label = "medio"; }
      else if (ratio >= 0.40) { lvl = "weak"; label = "flojo"; }
      else { lvl = "rest"; label = "descanso"; }
      if (lowSample && lvl === "rest") { lvl = "weak"; label = "flojo (poca muestra)"; }
      next[d.dow] = lvl;
      reasons.push(
        `${DAYS[d.dow]}: ${fmtMoney(d.perHour, currency)}/h (${(ratio * 100).toFixed(0)}% del mejor, ${d.workedCount} jornada${d.workedCount === 1 ? "" : "s"}) → ${label}.`
      );
    }
    return { levels: next, reasons };
  }

  function applySuggestion() {
    const { levels: nextLevels } = buildSuggestion();
    setLevels(nextLevels);
    setMsg("Niveles sugeridos aplicados. Tocá «Guardar y calcular» para fijarlos como metas.");
  }

  // Reparto por pesos: weekly_goal = Σ (w_i * K)  →  K = weekly_goal / Σ w_i
  // w: fuerte=0.7, medio=0.5, flojo=0.3, descanso=0.
  const goalNum = Number(goal) || 0;
  const weights = levels.map((l) => LEVEL_WEIGHT[l]);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const targets = weights.map((w) => (sumW > 0 ? (goalNum * w) / sumW : 0));
  // Para "horas necesarias por día fuerte" usamos el peso máximo (0.7) como referencia.
  const maxTarget = Math.max(...targets);
  const recommendedHours = perHour > 0 && maxTarget > 0 ? maxTarget / perHour : 0;

  async function saveCalc() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    const dowGoals = targets.map((t) => Math.round(t));
    const dowHrs = targets.map((t) => {
      if (perHour <= 0 || t <= 0) return 0;
      return Math.round((t / perHour) * 10) / 10;
    });

    // Mantenemos en sync gig_dead_days/gig_rest_days para retro-compatibilidad.
    const restDaysArr = levels.map((l, i) => (l === "rest" ? i : -1)).filter((x) => x >= 0);
    const weakDaysArr = levels.map((l, i) => (l === "weak" || l === "medium" ? i : -1)).filter((x) => x >= 0);

    await supabase.from("user_settings").upsert({
      user_id: user.id,
      gig_weekly_goal: goalNum,
      gig_day_levels: levels,
      gig_rest_days: restDaysArr,
      gig_dead_days: weakDaysArr,
      gig_per_dow_goals: dowGoals,
      gig_per_dow_hours: dowHrs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setBusy(false);
    setMsg("Guardado ✓ Estas metas pasan a ser la meta de cada día automáticamente.");
    onSave();
  }

  async function clearDowGoals() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const defaults: DayLevel[] = Array.from({ length: 7 }, () => "strong");
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      gig_per_dow_goals: null,
      gig_per_dow_hours: null,
      gig_rest_days: [],
      gig_dead_days: [],
      gig_day_levels: defaults,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setLevels(defaults);
    setBusy(false);
    setMsg("Limpio. La meta diaria vuelve al valor por defecto.");
    onSave();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <p className="label">Calculadora semanal</p>
        <p className="text-xs text-muted">
          Decí cuánto querés hacer en la semana y clasificá cada día. La calculadora reparte la meta por pesos:
          {" "}<b>fuerte 0.7</b>, <b>medio 0.5</b>, <b>flojo 0.3</b>, <b>descanso 0</b>.
          Al guardar, esos valores pasan a ser <b>la meta de cada día automáticamente</b>;
          podés pisar el de hoy desde «Ajustar meta de hoy».
        </p>
        {perDowGoals && perDowGoals.some((n) => n > 0) && (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-2 text-xs text-muted">
            ✓ Meta diaria activa desde la calculadora. Cada día arranca con su valor sugerido.
          </div>
        )}

        <div>
          <label className="label">Meta semanal ({currency})</label>
          <input
            type="text"
            inputMode="decimal"
            className="input mt-1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className="label">Nivel de cada día</label>
          <p className="text-[11px] text-muted">
            💪 Fuerte (0.7) · 🟢 Medio (0.5) · 🟡 Flojo (0.3) · 😴 Descanso (0)
          </p>
          <div className="flex gap-1 mt-2 flex-wrap text-[10px]">
            <span className="text-muted">Aplicar a todos:</span>
            {(["strong", "medium", "weak", "rest"] as DayLevel[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setAll(l)}
                className="chip border border-line text-[10px] text-muted"
              >
                {LEVEL_EMOJI[l]} {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>

          <ul className="space-y-1 mt-2">
            {DAYS.map((d, i) => (
              <li key={d} className="flex items-center gap-2">
                <span className="w-9 text-sm text-muted shrink-0">{d}</span>
                <div className="grid grid-cols-4 gap-1 flex-1">
                  {(["strong", "medium", "weak", "rest"] as DayLevel[]).map((lvl) => {
                    const active = levels[i] === lvl;
                    const colors: Record<DayLevel, string> = {
                      strong: "#22c55e",
                      medium: "#facc15",
                      weak: "#fb923c",
                      rest: "#94a3b8",
                    };
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDayLevel(i, lvl)}
                        className={`text-[11px] rounded-lg py-1.5 border transition ${
                          active ? "text-black font-medium" : "text-muted border-line"
                        }`}
                        style={
                          active
                            ? { backgroundColor: colors[lvl], borderColor: colors[lvl] }
                            : undefined
                        }
                      >
                        {LEVEL_EMOJI[lvl]} {LEVEL_LABEL[lvl]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <button onClick={saveCalc} className="btn-primary w-full" disabled={busy}>
          {busy ? "Guardando…" : "Guardar y calcular"}
        </button>
        {perDowGoals && perDowGoals.some((n) => n > 0) && (
          <button onClick={clearDowGoals} className="btn-ghost w-full text-xs" disabled={busy}>
            Limpiar metas por día (volver al valor por defecto)
          </button>
        )}
        {msg && <p className="text-xs text-muted">{msg}</p>}
      </div>

      <div className="card space-y-2">
        <p className="label">Tu rendimiento actual</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">$/h promedio · 30d</p>
            <p className="text-lg font-semibold">{fmtMoney(perHour, currency)}</p>
          </div>
          <div className="border border-line rounded-xl p-3">
            <p className="text-xs text-muted">Horas necesarias / día fuerte</p>
            <p className="text-lg font-semibold">
              {recommendedHours > 0 ? fmtHrs(recommendedHours) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ============ MÉTRICAS POR DÍA DE SEMANA ============ */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="label">Rendimiento por día de semana</p>
          <div className="flex gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setAnalysisDays(60)}
              className={`chip border ${analysisDays === 60 ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              60d
            </button>
            <button
              type="button"
              onClick={() => setAnalysisDays(90)}
              className={`chip border ${analysisDays === 90 ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              90d
            </button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Quién rinde mejor por hora trabajada. Útil para decidir cuáles días empujar y cuáles descansar.
        </p>

        {!hasEnoughData ? (
          <p className="text-sm text-muted">
            Necesitás datos en al menos 3 días distintos. Seguí cargando jornadas y volvé acá.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {dayPerf.map((d) => {
                const rank = dayPerfRanked.findIndex((r) => r.dow === d.dow);
                const pct = maxPerHour > 0 ? (d.perHour / maxPerHour) * 100 : 0;
                const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : "";
                return (
                  <li key={d.dow} className="border border-line rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {DAYS[d.dow]} {medal}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {d.workedCount > 0 ? `${fmtMoney(d.perHour, currency)}/h` : "—"}
                      </span>
                    </div>
                    {d.workedCount > 0 && (
                      <>
                        <div className="h-1.5 bg-line rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 85 ? "#22c55e" : pct >= 65 ? "#facc15" : pct >= 40 ? "#fb923c" : "#94a3b8",
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-muted mt-1">
                          {d.workedCount} jornada{d.workedCount === 1 ? "" : "s"} · prom. {fmtMoney(d.avgPerDay, currency)}/día · {pct.toFixed(0)}% del mejor
                        </p>
                      </>
                    )}
                    {d.workedCount === 0 && (
                      <p className="text-[11px] text-muted mt-1">Sin datos en este período.</p>
                    )}
                  </li>
                );
              })}
            </ul>

            {dayPerfRanked[0] && (
              <p className="text-xs">
                <span className="text-ok">🏆 Mejor:</span> {DAYS[dayPerfRanked[0].dow]} ({fmtMoney(dayPerfRanked[0].perHour, currency)}/h)
                {dayPerfRanked[dayPerfRanked.length - 1] && dayPerfRanked.length > 1 && (
                  <>
                    {" · "}
                    <span className="text-danger">💤 Peor:</span> {DAYS[dayPerfRanked[dayPerfRanked.length - 1].dow]} ({fmtMoney(dayPerfRanked[dayPerfRanked.length - 1].perHour, currency)}/h)
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {/* ============ SUGERENCIA AUTOMÁTICA ============ */}
      <div className="card space-y-3">
        <p className="label">Sugerencia automática</p>
        <p className="text-xs text-muted">
          La calculadora analiza tu historial y propone niveles. Días que rinden ≥85% del mejor → <b>fuerte</b>;
          {" "}65–85% → <b>medio</b>; 40–65% → <b>flojo</b>; &lt;40% → <b>descanso</b>. Podés ajustarla a mano antes de guardar.
        </p>

        {!hasEnoughData ? (
          <p className="text-sm text-muted">
            Pocos datos todavía. Cargá unas semanas más para que la sugerencia sea confiable.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={applySuggestion}
              className="btn-primary w-full"
            >
              🤖 Aplicar niveles sugeridos
            </button>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">¿En qué se basa la sugerencia?</summary>
              <ul className="mt-2 space-y-1">
                {buildSuggestion().reasons.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      {goalNum > 0 && (
        <div className="card space-y-2">
          <p className="label">Meta de cada día (esto es lo que vas a ver en «Hoy»)</p>
          <p className="text-[11px] text-muted">
            Al guardar, cada día arranca con su valor de acá como meta. Lo podés pisar en «Hoy → Ajustar meta de hoy».
          </p>
          <ul className="space-y-1">
            {targets.map((t, i) => {
              const lvl = levels[i];
              const isRest = lvl === "rest";
              return (
                <li key={i} className="flex items-center justify-between border border-line rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {DAYS[i]}
                    <span className="text-[10px] text-muted">
                      {LEVEL_EMOJI[lvl]} {LEVEL_LABEL[lvl]} ({LEVEL_WEIGHT[lvl]})
                    </span>
                  </span>
                  <span className={`font-medium ${isRest ? "text-muted" : ""}`}>
                    {isRest ? "—" : fmtMoney(t, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            Total: {fmtMoney(targets.reduce((s, t) => s + t, 0), currency)}
          </p>
        </div>
      )}
    </div>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------------- GOOGLE MAPS IMPORT ---------------- */

// Tipos vehiculares relevantes (cubre formato viejo timelineObjects.activitySegment
// y formato nuevo semanticSegments.activity.topCandidate.type, que viene en minúscula
// y con espacios en lugar de guiones bajos).
const VEHICLE_TYPES = new Set([
  "IN_PASSENGER_VEHICLE",
  "IN_VEHICLE",
  "IN_TWO_WHEELER_VEHICLE",
  "MOTORCYCLING",
  "DRIVING",
  "IN_BUS",
  "IN_TAXI",
]);

function normActivityType(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/\s+/g, "_");
}

function isoDateFromTimestamp(ts: unknown): string | null {
  if (typeof ts !== "string" || !ts) return null;
  // Tanto "2026-04-12T13:24:55.123Z" como "2026-04-12T10:24:55-03:00" son válidos.
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  // Usamos la fecha LOCAL del usuario para que cuadre con la jornada local.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ParsedImport = {
  perDay: Map<string, number>;          // YYYY-MM-DD -> metros
  zoneCounts: Map<string, number>;       // nombre o dirección -> cantidad de visitas
  totalSegments: number;
  vehicleSegments: number;
};

function parseGoogleTakeout(json: unknown): ParsedImport {
  const perDay = new Map<string, number>();
  const zoneCounts = new Map<string, number>();
  let totalSegments = 0;
  let vehicleSegments = 0;

  const addKm = (date: string, meters: number) => {
    if (!isFinite(meters) || meters <= 0) return;
    perDay.set(date, (perDay.get(date) ?? 0) + meters);
  };

  const addZone = (name: string) => {
    const k = name.trim();
    if (!k) return;
    zoneCounts.set(k, (zoneCounts.get(k) ?? 0) + 1);
  };

  // --- Formato viejo: { timelineObjects: [{activitySegment|placeVisit}, ...] }
  const oldArr =
    Array.isArray((json as { timelineObjects?: unknown[] })?.timelineObjects)
      ? ((json as { timelineObjects: unknown[] }).timelineObjects)
      : [];
  for (const obj of oldArr) {
    const o = obj as Record<string, unknown>;
    const seg = o.activitySegment as Record<string, unknown> | undefined;
    if (seg) {
      totalSegments++;
      const activityType = normActivityType(seg.activityType);
      const distance = Number(seg.distance ?? 0); // metros
      const dur = seg.duration as Record<string, unknown> | undefined;
      const startTs = dur?.startTimestamp ?? seg.startTimestamp;
      const date = isoDateFromTimestamp(startTs);
      if (date && VEHICLE_TYPES.has(activityType) && distance > 0) {
        vehicleSegments++;
        addKm(date, distance);
      }
    }
    const visit = o.placeVisit as Record<string, unknown> | undefined;
    if (visit) {
      const loc = visit.location as Record<string, unknown> | undefined;
      const nm = (loc?.name as string) || (loc?.address as string) || "";
      if (nm) addZone(nm);
    }
  }

  // --- Formato nuevo: { semanticSegments: [{activity}|{visit}, ...] }
  // o un array crudo de objetos en la raíz (Timeline.json reciente).
  const newArr: unknown[] = Array.isArray((json as { semanticSegments?: unknown[] })?.semanticSegments)
    ? (json as { semanticSegments: unknown[] }).semanticSegments
    : Array.isArray(json)
      ? (json as unknown[])
      : [];
  for (const obj of newArr) {
    const o = obj as Record<string, unknown>;
    const activity = o.activity as Record<string, unknown> | undefined;
    if (activity) {
      totalSegments++;
      const top = activity.topCandidate as Record<string, unknown> | undefined;
      const activityType = normActivityType(top?.type ?? activity.activityType);
      const meters = Number(activity.distanceMeters ?? activity.distance ?? 0);
      const startTs = (o.startTime as string) ?? (activity.startTime as string);
      const date = isoDateFromTimestamp(startTs);
      if (date && VEHICLE_TYPES.has(activityType) && meters > 0) {
        vehicleSegments++;
        addKm(date, meters);
      }
    }
    const visit = o.visit as Record<string, unknown> | undefined;
    if (visit) {
      const top = visit.topCandidate as Record<string, unknown> | undefined;
      const nm =
        (top?.placeLocation as string) ||
        (top?.semanticType as string) ||
        ((top?.placeId as string) ?? "");
      if (nm) addZone(String(nm));
    }
  }

  return { perDay, zoneCounts, totalSegments, vehicleSegments };
}

function GoogleMapsImportCard({
  tankLiters,
  onImported,
}: {
  tankLiters: number | null;
  onImported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setErr(null);
    setMsg(null);
    setParsing(true);
    const merged: ParsedImport = {
      perDay: new Map(),
      zoneCounts: new Map(),
      totalSegments: 0,
      vehicleSegments: 0,
    };
    try {
      for (const file of Array.from(fileList)) {
        const text = await file.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          setErr(`No se pudo leer "${file.name}" (no es JSON válido).`);
          continue;
        }
        const r = parseGoogleTakeout(json);
        for (const [d, m] of r.perDay) {
          merged.perDay.set(d, (merged.perDay.get(d) ?? 0) + m);
        }
        for (const [z, c] of r.zoneCounts) {
          merged.zoneCounts.set(z, (merged.zoneCounts.get(z) ?? 0) + c);
        }
        merged.totalSegments += r.totalSegments;
        merged.vehicleSegments += r.vehicleSegments;
      }
      setParsed(merged);
      if (merged.perDay.size === 0) {
        setErr(
          "El archivo se leyó, pero no encontramos viajes en vehículo. Asegurate de subir el JSON de «Historial de ubicaciones» (Semantic Location History) de Google Takeout."
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error procesando el archivo.");
    } finally {
      setParsing(false);
    }
  }

  async function applyImport() {
    if (!parsed || parsed.perDay.size === 0) return;
    if (
      !confirm(
        mode === "replace"
          ? `Se van a REEMPLAZAR los kilómetros de ${parsed.perDay.size} día${parsed.perDay.size === 1 ? "" : "s"} con los datos de Google Maps. ¿Confirmás?`
          : `Se van a SUMAR los kilómetros importados a los kilómetros existentes en ${parsed.perDay.size} día${parsed.perDay.size === 1 ? "" : "s"}. ¿Confirmás?`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErr("Sesión expirada");
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const [date, meters] of parsed.perDay) {
      const km = meters / 1000;
      const id = await ensureShiftForDate(date);
      if (!id) { fail++; continue; }
      let nextKm = km;
      if (mode === "add") {
        const { data: cur } = await supabase
          .from("gig_shifts")
          .select("km_driven")
          .eq("id", id)
          .maybeSingle();
        const existing = Number((cur as { km_driven?: number } | null)?.km_driven ?? 0);
        nextKm = existing + km;
      }
      const { error } = await supabase
        .from("gig_shifts")
        .update({ km_driven: Number(nextKm.toFixed(2)) })
        .eq("id", id);
      if (error) fail++;
      else ok++;
    }
    setBusy(false);
    if (fail > 0) {
      setErr(`Se actualizaron ${ok} días, fallaron ${fail}.`);
    } else {
      setMsg(`Listo: ${ok} día${ok === 1 ? "" : "s"} actualizado${ok === 1 ? "" : "s"} ✓`);
    }
    setParsed(null);
    onImported();
  }

  function reset() {
    setParsed(null);
    setErr(null);
    setMsg(null);
  }

  // Resumen
  const totalMeters = parsed ? Array.from(parsed.perDay.values()).reduce((s, m) => s + m, 0) : 0;
  const totalKm = totalMeters / 1000;
  const days = parsed?.perDay.size ?? 0;
  const topZones = parsed
    ? Array.from(parsed.zoneCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];
  const sortedDays = parsed
    ? Array.from(parsed.perDay.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    : [];
  const tanksUsed =
    tankLiters && tankLiters > 0
      ? // suposición conservadora: 12 km/L promedio para auto, 25 km/L para moto.
        // Acá usamos 12 km/L como referencia genérica; el usuario ya ve km/L real arriba.
        totalKm / 12 / tankLiters
      : null;

  return (
    <div className="card space-y-3">
      <div>
        <p className="label">📍 Importar desde Google Maps</p>
        <p className="text-xs text-muted">
          Subí el JSON de tu historial de ubicaciones (Google Takeout → «Historial de ubicaciones»
          o el archivo Timeline.json del teléfono). Calculamos los kilómetros recorridos en
          vehículo por día y las zonas más visitadas.
        </p>
      </div>

      {!parsed && (
        <div className="space-y-2">
          <label className="btn-ghost w-full text-center cursor-pointer block">
            {parsing ? "Leyendo…" : "Elegir archivo(s) JSON"}
            <input
              type="file"
              accept="application/json,.json"
              multiple
              className="hidden"
              disabled={parsing}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">¿Cómo conseguir el archivo?</summary>
            <ol className="list-decimal pl-4 mt-1 space-y-1">
              <li>
                Entrá a <span className="text-fg">takeout.google.com</span> con tu cuenta.
              </li>
              <li>
                Deseleccioná todo y dejá solo <b>«Historial de ubicaciones (Timeline)»</b>.
              </li>
              <li>Elegí formato JSON y descargá. Te llega un .zip por mail.</li>
              <li>
                Adentro vas a ver una carpeta <code>Semantic Location History/AÑO/</code> con un
                JSON por mes. Subí los que te interesen.
              </li>
            </ol>
            <p className="mt-1">
              Alternativa: en el celular, abrí Google Maps → tu cuenta → Tu cronología → ⋮ →
              «Exportar datos de la cronología» → te genera un Timeline.json local.
            </p>
          </details>
        </div>
      )}

      {parsed && days > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-line rounded-xl p-3">
              <p className="text-xs text-muted">Kilómetros</p>
              <p className="text-lg font-semibold">{totalKm.toFixed(0)} km</p>
              <p className="text-xs text-muted">en {days} día{days === 1 ? "" : "s"}</p>
            </div>
            <div className="border border-line rounded-xl p-3">
              <p className="text-xs text-muted">Segmentos en vehículo</p>
              <p className="text-lg font-semibold">{parsed.vehicleSegments}</p>
              <p className="text-xs text-muted">de {parsed.totalSegments} totales</p>
            </div>
            {tanksUsed != null && (
              <div className="col-span-2 border border-line rounded-xl p-3">
                <p className="text-xs text-muted">
                  Equivale a (estimado a 12 km/L, tanque de {tankLiters} L)
                </p>
                <p className="text-lg font-semibold">{tanksUsed.toFixed(2)} tanques</p>
                <p className="text-xs text-muted">
                  Si en Jornada cargaste litros reales, esa cifra de arriba es la verdadera.
                </p>
              </div>
            )}
          </div>

          {topZones.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted">Zonas más visitadas</p>
              <ul className="space-y-1">
                {topZones.map(([z, c]) => (
                  <li
                    key={z}
                    className="flex items-center justify-between text-sm border border-line rounded-lg px-3 py-1.5"
                  >
                    <span className="truncate">{z}</span>
                    <span className="text-xs text-muted">{c} visita{c === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted">Detalle por día (top 10)</p>
            <ul className="space-y-1">
              {sortedDays.slice(0, 10).map(([d, m]) => (
                <li
                  key={d}
                  className="flex items-center justify-between text-sm border border-line rounded-lg px-3 py-1.5"
                >
                  <span>{d}</span>
                  <span className="font-medium">{(m / 1000).toFixed(1)} km</span>
                </li>
              ))}
              {sortedDays.length > 10 && (
                <li className="text-xs text-muted">
                  + {sortedDays.length - 10} día{sortedDays.length - 10 === 1 ? "" : "s"} más
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="label">Cómo aplicar</p>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`chip border justify-center text-xs ${mode === "replace" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
              >
                Reemplazar km del día
              </button>
              <button
                type="button"
                onClick={() => setMode("add")}
                className={`chip border justify-center text-xs ${mode === "add" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
              >
                Sumar a lo existente
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              {mode === "replace"
                ? "Pisamos los km que ya tenga ese día con lo importado de Google."
                : "Agregamos los km importados a lo que ya tenías cargado en cada día."}
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex-1" disabled={busy}>
              Cancelar
            </button>
            <button onClick={applyImport} className="btn-primary flex-1" disabled={busy}>
              {busy ? "Aplicando…" : `Aplicar a ${days} día${days === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-danger text-xs">{err}</p>}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
