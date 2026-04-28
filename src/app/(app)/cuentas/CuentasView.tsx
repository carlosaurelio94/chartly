"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtDate, daysUntil } from "@/lib/format";
import { convert, type Rates } from "@/lib/fx";
import NewBillButton from "./NewBillButton";

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
  is_open: boolean;
};

type Category = { id: string; name: string; color: string; parent_id: string | null };
type ViewMode = "list" | "grouped";

function totalsByCurrency(rows: Row[]): { code: string; total: number }[] {
  // Para bills "fijas": balance pendiente. Para "acumulador": total acumulado.
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r.is_open ? Number(r.paid_total ?? 0) : Number(r.balance ?? 0);
    map.set(r.currency, (map.get(r.currency) ?? 0) + v);
  }
  return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

export default function CuentasView({
  bills, categories, defaultCurrency, displayName, rates,
}: {
  bills: Row[];
  categories: Category[];
  defaultCurrency: string;
  displayName: string;
  rates: Rates;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("cuentas_view") : null;
    if (stored === "list" || stored === "grouped") setView(stored);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("cuentas_view", view);
  }, [view]);

  const expenses = bills.filter((r) => r.kind !== "income");
  const incomes = bills.filter((r) => r.kind === "income");

  // Alertas: vencidos y saldo 0 archivables
  const overdueBills = useMemo(
    () => bills.filter((b) => {
      const d = daysUntil(b.due_date);
      return d !== null && d < 0 && Number(b.balance) > 0;
    }),
    [bills],
  );
  const zeroBalance = useMemo(
    () => bills.filter((b) => !b.is_open && Number(b.balance) <= 0 && !b.archived),
    [bills],
  );

  const selectedTotal = useMemo(() => {
    let total = 0;
    let allConvertible = true;
    for (const r of bills) {
      if (!selected.has(r.id)) continue;
      const v = r.is_open ? Number(r.paid_total) : Number(r.balance);
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
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">
            {displayName ? `Hola, ${displayName}` : "Cuentas"}
          </h1>
          {displayName && <p className="text-sm text-muted">Cuentas</p>}
        </div>
        <div className="flex gap-2">
          <NewBillButton kind="expense" defaultCurrency={defaultCurrency} categories={categories} />
          <NewBillButton kind="income" defaultCurrency={defaultCurrency} categories={categories} />
        </div>
      </div>

      {(overdueBills.length > 0 || zeroBalance.length > 0) && (
        <div className="space-y-2">
          {overdueBills.length > 0 && (
            <div className="card border-danger">
              <p className="text-sm font-medium text-danger">⚠ {overdueBills.length} cuenta{overdueBills.length === 1 ? "" : "s"} vencida{overdueBills.length === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted mt-0.5 truncate">
                {overdueBills.slice(0, 3).map((b) => b.name).join(", ")}
                {overdueBills.length > 3 && ` y ${overdueBills.length - 3} más`}
              </p>
            </div>
          )}
          {zeroBalance.length > 0 && (
            <div className="card border-yellow-500/40">
              <p className="text-sm font-medium text-yellow-300">💡 {zeroBalance.length} cuenta{zeroBalance.length === 1 ? "" : "s"} con saldo 0</p>
              <p className="text-xs text-muted mt-0.5">
                Si ya no se pagan más, archivalas desde su detalle para limpiar la lista.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1">
        <button
          onClick={() => setView("list")}
          className={`chip border ${view === "list" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
        >
          Lista
        </button>
        <button
          onClick={() => setView("grouped")}
          className={`chip border ${view === "grouped" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
        >
          Por categoría
        </button>
      </div>

      <Section
        title="Gastos"
        emptyText="Sin gastos. Agrega uno con + Gastos."
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
        emptyText="Sin ingresos. Agrega uno con + Ingresos."
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
  const totals = totalsByCurrency(rows);
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
    let uncatRows: Row[] = [];
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

  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div>
        <p className="label">{title} — {isIncome ? "por cobrar" : "deuda + acumulado"}</p>
        {totals.length === 0 ? (
          <p className={`text-2xl font-semibold ${amountColor}`}>—</p>
        ) : (
          <div className="space-y-0.5">
            {totals.map((t) => (
              <p key={t.code} className={`text-2xl font-semibold leading-tight ${amountColor}`}>
                {fmtMoney(t.total, t.code)}
              </p>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card text-center text-muted text-sm">{emptyText}</div>
      ) : grouped ? (
        <ul className="space-y-2">
          {grouped.map((g) => {
            const groupTotal = totalsByCurrency(g.rows);
            const isOpen = openGroup === g.name;
            return (
              <li key={g.name}>
                <button
                  onClick={() => setOpenGroup(isOpen ? null : g.name)}
                  className="card w-full flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="font-medium truncate">{g.name}</span>
                    <span className="text-xs text-muted shrink-0">({g.rows.length})</span>
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
                  <ul className="space-y-2 mt-2 pl-2">
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
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <BillRow
              key={r.id}
              r={r}
              amountColor={amountColor}
              catById={catById}
              defaultCurrency={defaultCurrency}
              rates={rates}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BillRow({
  r, amountColor, catById, defaultCurrency, rates, selected, onToggle,
}: {
  r: Row;
  amountColor: string;
  catById: Map<string, Category>;
  defaultCurrency: string;
  rates: Rates;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const d = daysUntil(r.due_date);
  const overdue = !r.is_open && d !== null && d < 0 && Number(r.balance) > 0;
  const soon = !r.is_open && d !== null && d >= 0 && d <= 3 && Number(r.balance) > 0;
  const cat = r.category_id ? catById.get(r.category_id) : null;
  const isSel = selected.has(r.id);
  const displayValue = r.is_open ? Number(r.paid_total) : Number(r.balance);
  const conv = r.currency !== defaultCurrency
    ? convert(displayValue, r.currency, defaultCurrency, rates)
    : null;

  return (
    <li>
      <div className={`card flex items-center gap-3 ${isSel ? "border-accent" : ""}`}>
        <input
          type="checkbox"
          checked={isSel}
          onChange={(e) => { e.stopPropagation(); onToggle(r.id); }}
          className="shrink-0"
        />
        <Link href={`/cuentas/${r.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">
              {r.is_open && <span className="mr-1">🧺</span>}{r.name}
            </p>
            {r.is_open ? (
              <p className="text-sm text-muted">Acumulador · {fmtMoney(r.paid_total, r.currency)} acumulado</p>
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
            <p className={`font-semibold ${amountColor}`}>{fmtMoney(displayValue, r.currency)}</p>
            {conv !== null && (
              <p className="text-xs text-muted">≈ {fmtMoney(conv, defaultCurrency)}</p>
            )}
            {!r.is_open && Number(r.paid_total) > 0 && (
              <p className="text-xs text-muted">de {fmtMoney(r.amount, r.currency)}</p>
            )}
          </div>
        </Link>
      </div>
    </li>
  );
}
