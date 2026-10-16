/* Presupuestos mensuales por categoría ("superbloque": la categoría de arriba
   de todo; una subcategoría suma a su padre). */

import { convert, type Rates } from "@/lib/fx";

export type BudgetCategory = {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  monthly_budget?: number | null;
};

export type SpendPayment = {
  amount: number;
  paid_at: string;
  converted_amount: number | null;
  converted_currency: string | null;
  bills: { kind: "expense" | "income"; currency: string; category_id: string | null; archived: boolean } | null;
};

/** Monto del pago en la moneda por defecto, respetando el monto convertido que cargó el usuario. */
export function convertPayment(p: SpendPayment, defaultCurrency: string, rates: Rates): number | null {
  if (p.converted_amount !== null && p.converted_currency) {
    if (p.converted_currency === defaultCurrency) return Number(p.converted_amount);
    return convert(Number(p.converted_amount), p.converted_currency, defaultCurrency, rates);
  }
  if (!p.bills) return null;
  return convert(Number(p.amount), p.bills.currency, defaultCurrency, rates);
}

/** Categoría de nivel superior. Corta ciclos por si la base tuviera uno. */
export function topCategory(id: string | null, byId: Map<string, BudgetCategory>): BudgetCategory | null {
  let c = id ? byId.get(id) ?? null : null;
  const seen = new Set<string>();
  while (c?.parent_id && !seen.has(c.id)) {
    seen.add(c.id);
    c = byId.get(c.parent_id) ?? c;
  }
  return c;
}

/** Gasto desde `fromIso` por categoría de nivel superior, en la moneda por defecto. */
export function spendByTopCategory(
  payments: SpendPayment[],
  categories: BudgetCategory[],
  defaultCurrency: string,
  rates: Rates,
  fromIso: string,
): Map<string, number> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const from = new Date(fromIso).getTime();
  const out = new Map<string, number>();
  for (const p of payments) {
    if (!p.bills || p.bills.archived || p.bills.kind !== "expense") continue;
    if (new Date(p.paid_at).getTime() < from) continue;
    const top = topCategory(p.bills.category_id, byId);
    if (!top) continue;
    const v = convertPayment(p, defaultCurrency, rates);
    if (v === null) continue;
    out.set(top.id, (out.get(top.id) ?? 0) + v);
  }
  return out;
}

export type BudgetLevel = "ok" | "warn" | "over";

/** Aviso a partir del 80% del tope; pasado, "over". */
export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (!(budget > 0)) return "ok";
  if (spent > budget) return "over";
  if (spent >= budget * 0.8) return "warn";
  return "ok";
}

export type BudgetRow = {
  id: string; name: string; color: string;
  budget: number; spent: number; pct: number; level: BudgetLevel;
};

/** Filas de las categorías de nivel superior que tienen tope, ordenadas de más a menos usado. */
export function budgetRows(categories: BudgetCategory[], spend: Map<string, number>): BudgetRow[] {
  return categories
    .filter((c) => !c.parent_id && Number(c.monthly_budget) > 0)
    .map((c) => {
      const budget = Number(c.monthly_budget);
      const spent = spend.get(c.id) ?? 0;
      return { id: c.id, name: c.name, color: c.color, budget, spent, pct: (spent / budget) * 100, level: budgetLevel(spent, budget) };
    })
    .sort((a, b) => b.pct - a.pct);
}
