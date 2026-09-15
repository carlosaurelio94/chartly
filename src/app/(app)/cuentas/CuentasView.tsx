"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtDate, daysUntil } from "@/lib/format";
import { convert, type Rates } from "@/lib/fx";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import NewBillButton from "./NewBillButton";
import WalletCard, { type Wallet } from "./WalletCard";

/**
 * Una cuenta es una sola de estas tres cosas:
 *   puntual     · se paga una vez, tiene saldo pendiente
 *   recurrente  · vuelve cada mes (monthly_amount)
 *   acumulador  · se le suman gastos, cierra por mes
 */
export type BillTipo = "puntual" | "recurrente" | "acumulador";

type Row = {
  id: string;
  name: string;
  amount: number;
  due_date: string | null;
  archived: boolean;
  paid_total: number;
  balance: number;
  kind: "expense" | "income";
  currency: string;
  category_id: string | null;
  tipo: BillTipo;
  priority_next_week: boolean;
  monthly_amount?: number | null;
  is_fuel_accumulator?: boolean;
  accumulator_month?: string | null;
};

type Category = { id: string; name: string; color: string; parent_id: string | null };
type ViewMode = "list" | "grouped";

type UrgencyBucket =
  | "overdue" | "this-week" | "this-month" | "later" | "no-date" | "open" | "closed";

const BUCKET_META: Record<UrgencyBucket, { label: string; emoji: string; tone: string }> = {
  "overdue":    { label: "Vencidas",        emoji: "🔴", tone: "text-danger" },
  "this-week":  { label: "Esta semana",     emoji: "🟠", tone: "text-yellow-300" },
  "this-month": { label: "Este mes",        emoji: "🟡", tone: "text-muted" },
  "later":      { label: "Más adelante",    emoji: "⚪", tone: "text-muted" },
  "no-date":    { label: "Sin fecha",       emoji: "·",  tone: "text-muted" },
  "open":       { label: "🧺 Acumuladores", emoji: "🧺", tone: "text-muted" },
  "closed":     { label: "Cerradas",        emoji: "✓",  tone: "text-muted" },
};

const BUCKET_ORDER: UrgencyBucket[] = [
  "overdue", "this-week", "this-month", "later", "no-date", "open", "closed",
];

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function bucketFor(r: Row): UrgencyBucket {
  if (r.tipo === "acumulador") {
    // Un acumulador cuyo ciclo ya cerró es historial, no algo activo.
    // Aplica sobre todo a los de nafta, que crean una cuenta por mes.
    if (r.accumulator_month && r.accumulator_month < currentMonthIso()) return "closed";
    return "open";
  }
  const d = daysUntil(r.due_date);
  if (d === null) return "no-date";
  // Vencida y con saldo => urgente. Vencida y saldada => cerrada, no debe
  // ensuciar «Esta semana» (ahí caían los meses viejos del acumulador de nafta).
  if (d < 0) return Number(r.balance) > 0 ? "overdue" : "closed";
  if (d <= 7) return "this-week";
  if (d <= 30) return "this-month";
  return "later";
}

function totalsByCurrency(rows: Row[]): { code: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r.tipo === "acumulador" ? Number(r.paid_total ?? 0) : Number(r.balance ?? 0);
    map.set(r.currency, (map.get(r.currency) ?? 0) + v);
  }
  return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

// Para el resumen "cuánto se gasta por mes" en cada superbloque sumamos
// pagados + no pagados, agrupando por moneda. Para gastos recurrentes usamos
// el monto mensual; para gastos puntuales usamos el monto total (paid+balance);
// para acumuladores (nafta, etc.) usamos lo acumulado este ciclo.
function monthlyTotalByCurrency(rows: Row[]): { code: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    let v = 0;
    if (r.tipo === "acumulador") {
      v = Number(r.paid_total ?? 0);
    } else if (r.tipo === "recurrente" && r.monthly_amount != null) {
      v = Number(r.monthly_amount);
    } else {
      v = Number(r.paid_total ?? 0) + Number(r.balance ?? 0);
    }
    if (!isFinite(v) || v <= 0) continue;
    map.set(r.currency, (map.get(r.currency) ?? 0) + v);
  }
  return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

export default function CuentasView({
  bills, archivedBills = [], categories, wallets = [], defaultCurrency, displayName: _displayName, rates,
}: {
  bills: Row[];
  archivedBills?: Row[];
  categories: Category[];
  wallets?: Wallet[];
  defaultCurrency: string;
  displayName: string;
  rates: Rates;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>("list");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [newIncomeOpen, setNewIncomeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetSelected, setResetSelected] = useState<Set<string>>(new Set());

  // Cuentas "pagables" ahora mismo: gastos no archivados, no acumuladores,
  // con saldo pendiente > 0. Los acumuladores (nafta, etc.) NO se reinician
  // porque su ciclo se resuelve pagando el total acumulado a mano.
  const resettable = useMemo(
    () => bills.filter((r) => r.kind === "expense" && r.tipo !== "acumulador" && Number(r.balance) > 0),
    [bills],
  );

  // Al abrir el modal seleccionamos todas por defecto (comportamiento "reiniciador").
  useEffect(() => {
    if (resetOpen) {
      setResetSelected(new Set(resettable.map((r) => r.id)));
    }
  }, [resetOpen, resettable]);

  function toggleReset(id: string) {
    setResetSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllReset() { setResetSelected(new Set(resettable.map((r) => r.id))); }
  function clearReset() { setResetSelected(new Set()); }

  const selectedResettable = useMemo(
    () => resettable.filter((r) => resetSelected.has(r.id)),
    [resettable, resetSelected],
  );
  const resettableTotalByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of selectedResettable) {
      map.set(r.currency, (map.get(r.currency) ?? 0) + Number(r.balance));
    }
    return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
  }, [selectedResettable]);

  async function resetAll() {
    setResetBusy(true);
    setResetErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada");
      const now = new Date().toISOString();
      const rows = selectedResettable.map((r) => ({
        user_id: user.id,
        bill_id: r.id,
        amount: Number(r.balance),
        paid_at: now,
        note: "auto:reset-mes",
      }));
      if (rows.length === 0) {
        setResetOpen(false);
        setResetBusy(false);
        return;
      }
      const { error } = await supabase.from("payments").insert(rows);
      if (error) throw error;
      setResetOpen(false);
      setResetBusy(false);
      router.refresh();
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : "No se pudo reiniciar");
      setResetBusy(false);
    }
  }

  async function unarchive(id: string) {
    const supabase = createClient();
    await supabase.from("bills").update({ archived: false }).eq("id", id);
    router.refresh();
  }

  async function deleteBillForever(id: string) {
    if (!confirm("¿Eliminar permanentemente? Se borran también los pagos asociados.")) return;
    const supabase = createClient();
    await supabase.from("bills").delete().eq("id", id);
    router.refresh();
  }

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cuentas_view") : null;
    if (stored === "list" || stored === "grouped") setView(stored);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("cuentas_view", view);
  }, [view]);

  const expenses = bills.filter((r) => r.kind !== "income");
  const incomes = bills.filter((r) => r.kind === "income");

  const overdueCount = useMemo(
    () => bills.filter((b) => {
      const d = daysUntil(b.due_date);
      return d !== null && d < 0 && Number(b.balance) > 0;
    }).length,
    [bills],
  );

  const selectedTotal = useMemo(() => {
    let total = 0;
    let allConvertible = true;
    for (const r of bills) {
      if (!selected.has(r.id)) continue;
      const v = r.tipo === "acumulador" ? Number(r.paid_total) : Number(r.balance);
      const c = convert(v, r.currency, defaultCurrency, rates);
      if (c === null) { allConvertible = false; continue; }
      total += c;
    }
    return { total, allConvertible };
  }, [selected, bills, defaultCurrency, rates]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {overdueCount > 0 && (
        <div className="flex items-center justify-between gap-2">
          <Link href="#vencidas" className="pill pill-danger">
            {overdueCount} vencida{overdueCount === 1 ? "" : "s"}
          </Link>
        </div>
      )}

      <WalletCard
        wallets={wallets}
        bills={bills}
        defaultCurrency={defaultCurrency}
        rates={rates}
        onNewExpense={() => setNewExpenseOpen(true)}
        onNewIncome={() => setNewIncomeOpen(true)}
      />

      <div className="flex gap-1 items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setView("list")}
            className={`chip border ${view === "list" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
          >
            Por urgencia
          </button>
          <button
            onClick={() => setView("grouped")}
            className={`chip border ${view === "grouped" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
          >
            Por categoría
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => { setResetErr(null); setResetOpen(true); }}
            className="chip border border-line text-muted"
            title="Marcar todas las cuentas pendientes como pagadas"
            disabled={resettable.length === 0}
          >
            🔄 Reiniciar {resettable.length > 0 && `(${resettable.length})`}
          </button>
          <button
            onClick={() => setArchivedOpen(true)}
            className="chip border border-line text-muted"
          >
            📦 {archivedBills.length > 0 && `(${archivedBills.length})`}
          </button>
        </div>
      </div>

      <Section
        title="Gastos"
        emptyText="Sin gastos. Tocá «+ Gasto» arriba."
        rows={expenses}
        kind="expense"
        categories={categories}
        defaultCurrency={defaultCurrency}
        rates={rates}
        selected={selected}
        onToggle={toggle}
        view={view}
      />

      <Section
        title="Ingresos"
        emptyText="Sin ingresos. Tocá «+ Ingreso» arriba."
        rows={incomes}
        kind="income"
        categories={categories}
        defaultCurrency={defaultCurrency}
        rates={rates}
        selected={selected}
        onToggle={toggle}
        view={view}
      />

      {selected.size > 0 && (
        <div className="fixed left-0 right-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 px-4">
          <div className="max-w-xl mx-auto card border-accent flex items-center justify-between gap-3 shadow-lg">
            <div className="min-w-0">
              <p className="text-xs text-muted">Seleccionados ({selected.size})</p>
              <p className="text-lg font-semibold truncate">
                {fmtMoney(selectedTotal.total, defaultCurrency)}
                {!selectedTotal.allConvertible && <span className="text-xs text-yellow-300 ml-2">~ algunas sin tasa</span>}
              </p>
            </div>
            <button onClick={() => setSelected(new Set())} className="btn-ghost shrink-0">Limpiar</button>
          </div>
        </div>
      )}

      <Modal open={archivedOpen} onClose={() => setArchivedOpen(false)} title="Cuentas archivadas">
        {archivedBills.length === 0 ? (
          <p className="text-sm text-muted">No hay cuentas archivadas. Las cuentas archivadas no suman a las métricas.</p>
        ) : (
          <ul className="space-y-2">
            {archivedBills.map((b) => (
              <li key={b.id} className="border border-line rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{b.name}</p>
                  <p className="text-xs text-muted">
                    {b.kind === "income" ? "Ingreso" : b.tipo === "acumulador" ? "Acumulador" : "Gasto"} · {fmtMoney(b.tipo === "acumulador" ? b.paid_total : b.amount, b.currency)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => unarchive(b.id)} className="chip border border-line text-muted">
                    Desarchivar
                  </button>
                  <button onClick={() => deleteBillForever(b.id)} className="chip border border-danger text-danger">
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Modales para crear bill, controlados desde la cabecera o WalletCard */}
      <NewBillButton
        kind="expense"
        defaultCurrency={defaultCurrency}
        categories={categories}
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        hideTrigger
      />
      <NewBillButton
        kind="income"
        defaultCurrency={defaultCurrency}
        categories={categories}
        open={newIncomeOpen}
        onOpenChange={setNewIncomeOpen}
        hideTrigger
      />

      {/* Reiniciador: marcá cuáles cuentas pendientes querés pasar a pagadas */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="🔄 Reiniciar cuentas">
        <div className="space-y-3">
          {resettable.length === 0 ? (
            <p className="text-sm text-muted">
              No hay cuentas pendientes para marcar como pagadas.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Marcá las cuentas que ya pagaste. Se les crea un pago con el
                saldo pendiente y quedan en 0.
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {resetSelected.size} de {resettable.length} seleccionada
                  {resetSelected.size === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={selectAllReset}
                    className="chip border border-line text-muted text-xs"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={clearReset}
                    className="chip border border-line text-muted text-xs"
                  >
                    Ninguna
                  </button>
                </div>
              </div>

              <ul className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
                {resettable.map((r) => {
                  const checked = resetSelected.has(r.id);
                  const d = daysUntil(r.due_date);
                  const overdue = d !== null && d < 0;
                  return (
                    <li key={r.id}>
                      <label
                        className="flex items-center gap-3 border rounded-xl px-3 py-2 cursor-pointer transition"
                        style={{
                          borderColor: checked ? "var(--color-accent)" : "var(--color-line)",
                          background: checked ? "var(--color-accent-tint)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleReset(r.id)}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-[11px] text-muted">
                            {r.due_date
                              ? overdue
                                ? <span className="text-danger">Vencida hace {Math.abs(d!)}d</span>
                                : d === 0
                                ? "Vence hoy"
                                : `Vence en ${d}d`
                              : "Sin fecha"}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular shrink-0">
                          {fmtMoney(Number(r.balance), r.currency)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {resettableTotalByCurrency.length > 0 && (
                <div className="border-t border-line pt-2 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted">Total a pagar</p>
                  {resettableTotalByCurrency.map((t) => (
                    <div
                      key={t.code}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted">{t.code}</span>
                      <span className="font-bold tabular">{fmtMoney(t.total, t.code)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted">
                Los acumuladores (nafta, etc.) no aparecen porque tienen otro ciclo.
                Podés deshacer cuenta por cuenta desde el detalle si te equivocás.
              </p>
              {resetErr && <p className="text-danger text-sm">{resetErr}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="btn-ghost flex-1"
                  disabled={resetBusy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  className="btn-primary flex-1"
                  disabled={resetBusy || resetSelected.size === 0}
                >
                  {resetBusy
                    ? "Marcando…"
                    : resetSelected.size === 0
                    ? "Elegí al menos una"
                    : `Marcar ${resetSelected.size} como pagada${resetSelected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Section({
  title, emptyText, rows, kind, categories, defaultCurrency, rates, selected, onToggle, view,
}: {
  title: string;
  emptyText: string;
  rows: Row[];
  kind: "expense" | "income";
  categories: Category[];
  defaultCurrency: string;
  rates: Rates;
  selected: Set<string>;
  onToggle: (id: string) => void;
  view: ViewMode;
}) {
  const isIncome = kind === "income";
  const amountColor = isIncome ? "text-ok" : "text-danger";
  const catById = new Map(categories.map((c) => [c.id, c]));

  function topLevel(catId: string | null): Category | null {
    if (!catId) return null;
    let c = catById.get(catId) ?? null;
    while (c?.parent_id) c = catById.get(c.parent_id) ?? null;
    return c;
  }

  const grouped = useMemo(() => {
    if (view !== "grouped") return null;
    const map = new Map<string, { name: string; color: string; rows: Row[] }>();
    const uncatRows: Row[] = [];
    for (const r of rows) {
      const top = topLevel(r.category_id);
      if (!top) { uncatRows.push(r); continue; }
      const cur = map.get(top.id);
      if (cur) cur.rows.push(r);
      else map.set(top.id, { name: top.name, color: top.color, rows: [r] });
    }
    const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (uncatRows.length) groups.push({ name: "Sin categoría", color: "#94a3b8", rows: uncatRows });
    return groups;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows, categories]);

  // Vista lista: agrupada por urgencia
  const byBucket = useMemo(() => {
    if (view !== "list") return null;
    const map = new Map<UrgencyBucket, Row[]>();
    for (const r of rows) {
      const b = bucketFor(r);
      const cur = map.get(b);
      if (cur) cur.push(r);
      else map.set(b, [r]);
    }
    // Dentro de cada bucket: priority primero, luego por due_date
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.priority_next_week !== b.priority_next_week) return a.priority_next_week ? -1 : 1;
        const da = a.due_date ?? "9999-12-31";
        const db = b.due_date ?? "9999-12-31";
        return da.localeCompare(db);
      });
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, rows: map.get(b)! }));
  }, [view, rows]);

  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Total resumido (solo monto en moneda nativa por simplicidad)
  const totals = totalsByCurrency(rows);

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <p className="label">{title} · {isIncome ? "por cobrar" : "deuda"}</p>
        <div className="text-right">
          {totals.length === 0 ? (
            <p className={`text-base font-semibold ${amountColor}`}>—</p>
          ) : (
            totals.map((t) => (
              <p key={t.code} className={`text-base font-semibold leading-tight tabular-nums ${amountColor}`}>
                {fmtMoney(t.total, t.code)}
              </p>
            ))
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center text-muted text-sm">{emptyText}</div>
      ) : grouped ? (
        <ul className="space-y-2">
          {grouped.map((g) => {
            const groupTotal = totalsByCurrency(g.rows);
            const monthlyTotal = monthlyTotalByCurrency(g.rows);
            const isOpen = openGroup === g.name;
            return (
              <li key={g.name}>
                <button
                  onClick={() => setOpenGroup(isOpen ? null : g.name)}
                  className="card w-full flex items-start justify-between gap-3 text-left"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      <span className="font-medium truncate">{g.name}</span>
                      <span className="text-xs text-muted shrink-0">({g.rows.length})</span>
                    </div>
                    {!isIncome && monthlyTotal.length > 0 && (
                      <p className="text-[11px] text-muted ml-4">
                        🔁 Total mensual:{" "}
                        {monthlyTotal
                          .map((t) => fmtMoney(t.total, t.code))
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {groupTotal.map((t) => (
                      <p key={t.code} className={`text-sm font-semibold ${amountColor}`}>
                        {fmtMoney(t.total, t.code)}
                      </p>
                    ))}
                  </div>
                </button>
                {isOpen && (
                  <ul className="space-y-1.5 mt-2 pl-2">
                    {g.rows.map((r) => (
                      <BillRow
                        key={r.id}
                        r={r}
                        amountColor={amountColor}
                        catById={catById}
                        defaultCurrency={defaultCurrency}
                        rates={rates}
                        selected={selected}
                        onToggle={onToggle}
                        compact
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : byBucket && byBucket.length > 0 ? (
        <div className="space-y-3">
          {byBucket.map(({ bucket, rows: bucketRows }) => {
            const meta = BUCKET_META[bucket];
            const bucketTotals = totalsByCurrency(bucketRows);
            const id = bucket === "overdue" ? "vencidas" : undefined;
            const header = (
              <div className="flex items-center justify-between gap-2 px-1">
                <p className={`text-xs font-medium uppercase tracking-wide ${meta.tone}`}>
                  {meta.emoji} {meta.label} <span className="text-muted">({bucketRows.length})</span>
                </p>
                <div className="text-right">
                  {bucketTotals.map((t) => (
                    <p key={t.code} className={`text-xs tabular-nums ${amountColor}`}>
                      {fmtMoney(t.total, t.code)}
                    </p>
                  ))}
                </div>
              </div>
            );
            const list = (
              <ul className="space-y-1.5">
                {bucketRows.map((r) => (
                  <BillRow
                    key={r.id}
                    r={r}
                    amountColor={amountColor}
                    catById={catById}
                    defaultCurrency={defaultCurrency}
                    rates={rates}
                    selected={selected}
                    onToggle={onToggle}
                    compact
                  />
                ))}
              </ul>
            );
            // Las cerradas son historial: van plegadas para no tapar lo accionable.
            if (bucket === "closed") {
              return (
                <details key={bucket} className="space-y-1.5">
                  <summary className="cursor-pointer list-none">{header}</summary>
                  <div className="mt-1.5">{list}</div>
                </details>
              );
            }
            return (
              <div key={bucket} id={id} className="space-y-1.5">
                {header}
                {list}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center text-muted text-sm">{emptyText}</div>
      )}
    </section>
  );
}

function BillRow({
  r, amountColor, catById, defaultCurrency, rates, selected, onToggle, compact = false,
}: {
  r: Row;
  amountColor: string;
  catById: Map<string, Category>;
  defaultCurrency: string;
  rates: Rates;
  selected: Set<string>;
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const d = daysUntil(r.due_date);
  const overdue = r.tipo !== "acumulador" && d !== null && d < 0 && Number(r.balance) > 0;
  const soon = r.tipo !== "acumulador" && d !== null && d >= 0 && d <= 3 && Number(r.balance) > 0;
  const cat = r.category_id ? catById.get(r.category_id) : null;
  const isSel = selected.has(r.id);
  const displayValue = r.tipo === "acumulador"
    ? Number(r.paid_total)
    : Number(r.balance);
  const conv = r.currency !== defaultCurrency
    ? convert(displayValue, r.currency, defaultCurrency, rates)
    : null;
  const isIncome = r.kind === "income";
  const dotClass = isIncome ? "bg-ok" : "bg-danger";
  const [togglingPri, setTogglingPri] = useState(false);
  const [collecting, setCollecting] = useState(false);
  // Un ingreso puntual con saldo pendiente se puede saldar de un toque.
  const canCollect = isIncome && r.tipo !== "acumulador" && Number(r.balance) > 0;

  async function markCollected(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pend = Number(r.balance);
    if (!confirm(`¿Registrar el cobro de ${fmtMoney(pend, r.currency)} de «${r.name}»?`)) return;
    setCollecting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCollecting(false); return; }
    await supabase.from("payments").insert({
      user_id: user.id,
      bill_id: r.id,
      amount: pend,
      paid_at: new Date().toISOString(),
      note: "Cobrado",
    });
    setCollecting(false);
    router.refresh();
  }

  async function togglePriority(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTogglingPri(true);
    const supabase = createClient();
    await supabase
      .from("bills")
      .update({ priority_next_week: !r.priority_next_week })
      .eq("id", r.id);
    setTogglingPri(false);
    router.refresh();
  }

  if (compact) {
    return (
      <li>
        <div
          className={`bg-card border border-line rounded-xl px-3 py-2 flex items-center gap-2 transition active:scale-[0.99] ${isSel ? "border-accent" : ""} ${r.priority_next_week ? "ring-1 ring-accent/40" : ""} ${overdue ? "border-danger/40" : ""}`}
        >
          <input
            type="checkbox"
            checked={isSel}
            onChange={(e) => { e.stopPropagation(); onToggle(r.id); }}
            className="shrink-0"
            aria-label="Seleccionar"
          />
          <Link href={`/cuentas/${r.id}`} className="flex-1 min-w-0 flex items-center gap-2">
            <span className={`bill-dot inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`} aria-hidden />
            {r.tipo === "acumulador" && <span aria-hidden>🧺</span>}
            {r.tipo === "recurrente" && <span aria-hidden title="Gasto recurrente mensual">🔁</span>}
            {r.is_fuel_accumulator && <span aria-hidden title="Acumulador de nafta · se actualiza desde Jornada">⛽</span>}
            <span className="bill-name truncate flex-1 text-sm">{r.name}</span>
            {r.tipo !== "acumulador" && d !== null && (
              <span className={`shrink-0 text-[10px] ${overdue ? "text-danger" : soon ? "text-yellow-300" : "text-muted"}`}>
                {overdue ? `−${Math.abs(d)}d` : d === 0 ? "hoy" : `${d}d`}
              </span>
            )}
            <span className={`shrink-0 text-sm font-semibold ${amountColor} tabular-nums`}>
              {fmtMoney(displayValue, r.currency)}
            </span>
          </Link>
          {canCollect && (
            <button
              onClick={markCollected}
              disabled={collecting}
              className="shrink-0 chip text-[11px] whitespace-nowrap"
              style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}
              title="Registrar el cobro completo"
            >
              {collecting ? "…" : "¿Cobrado?"}
            </button>
          )}
          {!isIncome && (
            <button
              onClick={togglePriority}
              disabled={togglingPri}
              className={`shrink-0 text-lg leading-none px-0.5 ${r.priority_next_week ? "text-accent" : "text-muted opacity-60"}`}
              title={r.priority_next_week ? "Quitar de próxima semana" : "Marcar como prioritario"}
              aria-label={r.priority_next_week ? "Quitar prioridad" : "Marcar como prioritario"}
            >
              {r.priority_next_week ? "★" : "☆"}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <li>
      <div className={`card flex items-center gap-3 ${isSel ? "border-accent" : ""} ${r.priority_next_week ? "ring-1 ring-accent/40" : ""}`}>
        <input
          type="checkbox"
          checked={isSel}
          onChange={(e) => { e.stopPropagation(); onToggle(r.id); }}
          className="shrink-0"
        />
        <Link href={`/cuentas/${r.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate bill-name flex items-center gap-1.5">
              <span className={`bill-dot inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`} aria-hidden />
              {r.tipo === "acumulador" && <span>🧺</span>}
              {r.tipo === "recurrente" && <span title="Gasto recurrente mensual">🔁</span>}
              {r.is_fuel_accumulator && <span title="Acumulador de nafta · se actualiza desde Jornada">⛽</span>}
              <span className="truncate">{r.name}</span>
            </p>
            {r.tipo === "acumulador" ? (
              <p className="text-sm text-muted">
                Acumulador · {fmtMoney(r.paid_total, r.currency)} este mes
                {r.is_fuel_accumulator && " · desde Jornada"}
              </p>
            ) : (
              <p className="text-sm text-muted">
                Vence: {fmtDate(r.due_date)}
                {d !== null && (
                  <span className={`ml-2 ${overdue ? "text-danger" : soon ? "text-yellow-300" : "text-muted"}`}>
                    {overdue ? `vencido hace ${Math.abs(d)}d` : d === 0 ? "hoy" : `en ${d}d`}
                  </span>
                )}
              </p>
            )}
            {cat && (
              <span
                className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full border"
                style={{ borderColor: cat.color, color: cat.color }}
              >
                {cat.name}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`font-semibold ${amountColor} tabular-nums`}>{fmtMoney(displayValue, r.currency)}</p>
            {conv !== null && (
              <p className="text-xs text-muted">≈ {fmtMoney(conv, defaultCurrency)}</p>
            )}
            {r.tipo !== "acumulador" && Number(r.paid_total) > 0 && (
              <p className="text-xs text-muted">de {fmtMoney(r.amount, r.currency)}</p>
            )}
            {r.tipo === "recurrente" && r.monthly_amount != null && (
              <p className="text-[11px] text-muted">🔁 {fmtMoney(Number(r.monthly_amount), r.currency)}/mes</p>
            )}
          </div>
        </Link>
        {canCollect && (
          <button
            onClick={markCollected}
            disabled={collecting}
            className="shrink-0 chip text-[11px] whitespace-nowrap"
            style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}
            title="Registrar el cobro completo"
          >
            {collecting ? "…" : "¿Cobrado?"}
          </button>
        )}
        {!isIncome && (
          <button
            onClick={togglePriority}
            disabled={togglingPri}
            className={`shrink-0 text-xl leading-none px-1 ${r.priority_next_week ? "text-accent" : "text-muted opacity-60"}`}
            title={r.priority_next_week ? "Quitar de próxima semana" : "Marcar como prioritario para la próxima semana"}
            aria-label={r.priority_next_week ? "Quitar prioridad" : "Marcar como prioritario"}
          >
            {r.priority_next_week ? "★" : "☆"}
          </button>
        )}
      </div>
    </li>
  );
}
