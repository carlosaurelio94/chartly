"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
};

type Category = { id: string; name: string; color: string; parent_id: string | null };

function totalsByCurrency(rows: Row[]): { code: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0) + Number(r.balance ?? 0));
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

  const expenses = bills.filter((r) => r.kind !== "income");
  const incomes = bills.filter((r) => r.kind === "income");

  const selectedTotal = useMemo(() => {
    let total = 0;
    let allConvertible = true;
    for (const r of bills) {
      if (!selected.has(r.id)) continue;
      const c = convert(Number(r.balance), r.currency, defaultCurrency, rates);
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
  title, emptyText, rows, kind, categories, defaultCurrency, rates, selected, onToggle,
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
}) {
  const totals = totalsByCurrency(rows);
  const isIncome = kind === "income";
  const amountColor = isIncome ? "text-ok" : "text-danger";
  const catById = new Map(categories.map((c) => [c.id, c]));

  return (
    <section className="space-y-3">
      <div>
        <p className="label">{title} — {isIncome ? "por cobrar" : "deuda total"}</p>
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
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const d = daysUntil(r.due_date);
            const overdue = d !== null && d < 0 && Number(r.balance) > 0;
            const soon = d !== null && d >= 0 && d <= 3 && Number(r.balance) > 0;
            const cat = r.category_id ? catById.get(r.category_id) : null;
            const isSel = selected.has(r.id);
            const conv = r.currency !== defaultCurrency
              ? convert(Number(r.balance), r.currency, defaultCurrency, rates)
              : null;
            return (
              <li key={r.id}>
                <div className={`card flex items-center gap-3 ${isSel ? "border-accent" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={(e) => { e.stopPropagation(); onToggle(r.id); }}
                    className="shrink-0"
                  />
                  <Link href={`/cuentas/${r.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.name}</p>
                      <p className="text-sm text-muted">
                        Vence: {fmtDate(r.due_date)}
                        {d !== null && (
                          <span className={`ml-2 ${overdue ? "text-danger" : soon ? "text-yellow-300" : "text-muted"}`}>
                            {overdue ? `vencido hace ${Math.abs(d)}d` : d === 0 ? "hoy" : `en ${d}d`}
                          </span>
                        )}
                      </p>
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
                      <p className={`font-semibold ${amountColor}`}>{fmtMoney(r.balance, r.currency)}</p>
                      {conv !== null && (
                        <p className="text-xs text-muted">≈ {fmtMoney(conv, defaultCurrency)}</p>
                      )}
                      {Number(r.paid_total) > 0 && (
                        <p className="text-xs text-muted">de {fmtMoney(r.amount, r.currency)}</p>
                      )}
                    </div>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
