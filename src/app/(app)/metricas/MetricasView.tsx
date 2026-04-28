"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { convert, type Rates } from "@/lib/fx";

type Payment = {
  amount: number;
  paid_at: string;
  payment_method_id: string | null;
  bills: { kind: "expense" | "income"; currency: string; category_id: string | null } | null;
};
type Category = "work" | "rest" | "fun" | "idle" | "other";
type AgendaRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  category: Category;
  done: boolean;
};
type PendingBill = {
  balance: number;
  currency: string;
  kind: "expense" | "income";
  archived: boolean;
  due_date: string | null;
};
type Cat = { id: string; name: string; color: string; parent_id: string | null };
type Pm = { id: string; name: string };
type Period = "week" | "month" | "all";

const TIME_CAT_META: { value: Category; label: string; emoji: string; color: string }[] = [
  { value: "work", label: "Trabajo", emoji: "💼", color: "bg-sky-500" },
  { value: "rest", label: "Descanso", emoji: "🛌", color: "bg-emerald-500" },
  { value: "fun", label: "Diversión", emoji: "🎉", color: "bg-pink-500" },
  { value: "idle", label: "Ocio", emoji: "🎮", color: "bg-amber-500" },
  { value: "other", label: "Otro", emoji: "•", color: "bg-line" },
];

function startOfPeriod(p: Period): Date | null {
  if (p === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  } else {
    d.setDate(1);
  }
  return d;
}

function fmtHours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

function buildSuggestion(timeByCat: Record<Category, number>): string | null {
  const total = (Object.values(timeByCat) as number[]).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const pct = (cat: Category) => (timeByCat[cat] / total) * 100;
  if (pct("idle") + pct("fun") > 60) return "Estás dedicando bastante tiempo al ocio/diversión. Considera bloquear horas para trabajo o aprendizaje.";
  if (pct("work") > 70) return "Mucho trabajo registrado. Asegúrate de reservar descanso y ocio para evitar el agotamiento.";
  if (pct("rest") > 50) return "Mucho descanso. Si tu objetivo es producir, agenda bloques de trabajo.";
  if (timeByCat.rest === 0) return "No registraste descanso. Agendar pausas conscientes mejora la energía.";
  return "Buen balance entre tus categorías de tiempo. Mantén el ritmo.";
}

export default function MetricasView({
  payments, agenda, pendingBills, categories, paymentMethods, defaultCurrency, rates,
}: {
  payments: Payment[];
  agenda: AgendaRow[];
  pendingBills: PendingBill[];
  categories: Cat[];
  paymentMethods: Pm[];
  defaultCurrency: string;
  rates: Rates;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const start = startOfPeriod(period);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pmById = useMemo(() => new Map(paymentMethods.map((p) => [p.id, p.name])), [paymentMethods]);

  // Resolve top-level (superbloque) of a category
  function topLevel(catId: string | null): Cat | null {
    if (!catId) return null;
    let c = catById.get(catId) ?? null;
    while (c?.parent_id) c = catById.get(c.parent_id) ?? null;
    return c;
  }

  const moneyTotals = useMemo(() => {
    let expense = 0;
    let income = 0;
    let anyMissing = false;
    const byCurrency = { expense: new Map<string, number>(), income: new Map<string, number>() };

    for (const p of payments) {
      if (!p.bills) continue;
      if (start && new Date(p.paid_at) < start) continue;
      const cur = p.bills.currency;
      const conv = convert(Number(p.amount), cur, defaultCurrency, rates);
      if (conv === null) { anyMissing = true; continue; }
      const target = p.bills.kind === "income" ? "income" : "expense";
      if (target === "income") income += conv;
      else expense += conv;
      const map = byCurrency[target];
      map.set(cur, (map.get(cur) ?? 0) + Number(p.amount));
    }
    return { expense, income, anyMissing, byCurrency };
  }, [payments, start, defaultCurrency, rates]);

  // Spend by superbloque (top-level category) in default currency
  const spendBySuperblock = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number }>();
    let uncategorized = 0;
    for (const p of payments) {
      if (!p.bills || p.bills.kind !== "expense") continue;
      if (start && new Date(p.paid_at) < start) continue;
      const conv = convert(Number(p.amount), p.bills.currency, defaultCurrency, rates);
      if (conv === null) continue;
      const top = topLevel(p.bills.category_id);
      if (!top) { uncategorized += conv; continue; }
      const cur = map.get(top.id);
      if (cur) cur.total += conv;
      else map.set(top.id, { name: top.name, color: top.color, total: conv });
    }
    const arr = Array.from(map.values()).sort((a, b) => b.total - a.total);
    if (uncategorized > 0) arr.push({ name: "Sin categoría", color: "#94a3b8", total: uncategorized });
    return arr;
  }, [payments, start, defaultCurrency, rates, catById]);

  // Spend by payment method (default currency)
  const spendByPm = useMemo(() => {
    const map = new Map<string, number>();
    let unknown = 0;
    for (const p of payments) {
      if (!p.bills || p.bills.kind !== "expense") continue;
      if (start && new Date(p.paid_at) < start) continue;
      const conv = convert(Number(p.amount), p.bills.currency, defaultCurrency, rates);
      if (conv === null) continue;
      if (p.payment_method_id && pmById.has(p.payment_method_id)) {
        const name = pmById.get(p.payment_method_id)!;
        map.set(name, (map.get(name) ?? 0) + conv);
      } else {
        unknown += conv;
      }
    }
    const arr = Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    if (unknown > 0) arr.push({ name: "No especificado", total: unknown });
    return arr;
  }, [payments, start, defaultCurrency, rates, pmById]);

  // Future expenses (saldo pendiente de bills no archivados, kind=expense)
  const futureExpenses = useMemo(() => {
    let total = 0;
    let missing = false;
    for (const b of pendingBills) {
      if (b.kind !== "expense") continue;
      if (Number(b.balance) <= 0) continue;
      const conv = convert(Number(b.balance), b.currency, defaultCurrency, rates);
      if (conv === null) { missing = true; continue; }
      total += conv;
    }
    return { total, missing };
  }, [pendingBills, defaultCurrency, rates]);

  // Time
  const timeByCategory = useMemo(() => {
    const map: Record<Category, number> = { work: 0, rest: 0, fun: 0, idle: 0, other: 0 };
    for (const a of agenda) {
      if (a.all_day) continue;
      if (!a.ends_at) continue;
      const s = new Date(a.starts_at);
      const e = new Date(a.ends_at);
      if (start && s < start) continue;
      const dur = e.getTime() - s.getTime();
      if (dur <= 0) continue;
      map[a.category] = (map[a.category] ?? 0) + dur;
    }
    return map;
  }, [agenda, start]);

  const totalTime = (Object.values(timeByCategory) as number[]).reduce((a, b) => a + b, 0);
  const totalSpend = spendBySuperblock.reduce((s, x) => s + x.total, 0);
  const totalSpendPm = spendByPm.reduce((s, x) => s + x.total, 0);
  const suggestion = buildSuggestion(timeByCategory);

  // Importantes: próximos 14 días, no done, ordenados, agrupados por día (sin huecos)
  const importantes = useMemo(() => {
    const now = Date.now();
    const horizon = now + 14 * 24 * 3_600_000;
    const items = agenda.filter((a) => {
      const t = new Date(a.starts_at).getTime();
      return !a.done && t >= now - 60 * 60_000 && t <= horizon;
    });
    const groups = new Map<string, AgendaRow[]>();
    for (const it of items) {
      const d = new Date(it.starts_at);
      const key = d.toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [agenda]);

  function formatDayLabel(isoDay: string): string {
    const d = new Date(isoDay + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    if (diff === -1) return "Ayer";
    return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  }

  function formatTime(iso: string, allDay: boolean): string {
    if (allDay) return "Todo el día";
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 flex-wrap">
        {(["week", "month", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`chip border ${period === p ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
          >
            {p === "week" ? "Semana" : p === "month" ? "Mes" : "Todo"}
          </button>
        ))}
      </div>

      {importantes.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Importantes</h2>
          <div className="card space-y-3">
            {importantes.map(([day, items]) => (
              <div key={day} className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-muted">{formatDayLabel(day)}</p>
                <ul className="space-y-1.5">
                  {items.map((it) => {
                    const meta = TIME_CAT_META.find((c) => c.value === it.category);
                    return (
                      <li key={it.id} className="flex items-center gap-2 text-sm">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta?.color ?? "bg-line"}`} />
                        <span className="text-muted shrink-0 w-14 tabular-nums text-xs">
                          {formatTime(it.starts_at, it.all_day)}
                        </span>
                        <span className="truncate">{it.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Dinero (en {defaultCurrency})</h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="card">
            <p className="label">Gastado</p>
            <p className="text-2xl font-semibold text-danger mt-1">
              {fmtMoney(moneyTotals.expense, defaultCurrency)}
            </p>
          </div>
          <div className="card">
            <p className="label">Cobrado</p>
            <p className="text-2xl font-semibold text-ok mt-1">
              {fmtMoney(moneyTotals.income, defaultCurrency)}
            </p>
          </div>
        </div>
        {moneyTotals.anyMissing && (
          <p className="text-xs text-yellow-300">⚠ Algunas monedas no tienen tipo de cambio disponible.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Gastos futuros</h2>
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="label">Deuda pendiente</p>
            <p className="text-xl font-semibold text-danger">
              {fmtMoney(futureExpenses.total, defaultCurrency)}
            </p>
          </div>
          <div className="border-t border-line pt-2">
            <p className="text-sm">
              Para cubrir todo, tu ingreso mínimo debe ser de{" "}
              <span className="font-semibold text-ok">{fmtMoney(futureExpenses.total, defaultCurrency)}</span>.
            </p>
          </div>
          {futureExpenses.missing && (
            <p className="text-xs text-yellow-300">⚠ Algunas cuentas tienen monedas sin tasa.</p>
          )}
        </div>
      </section>

      {spendBySuperblock.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Gastos por superbloque</h2>
          <div className="card space-y-2">
            {spendBySuperblock.map((s) => {
              const pct = totalSpend > 0 ? (s.total / totalSpend) * 100 : 0;
              return (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm truncate">{s.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmtMoney(s.total, defaultCurrency)}</p>
                      <p className="text-xs text-muted">{pct.toFixed(0)}%</p>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {spendByPm.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Gastos por medio de pago</h2>
          <div className="card space-y-2">
            {spendByPm.map((s) => {
              const pct = totalSpendPm > 0 ? (s.total / totalSpendPm) * 100 : 0;
              return (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{s.name}</span>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmtMoney(s.total, defaultCurrency)}</p>
                      <p className="text-xs text-muted">{pct.toFixed(0)}%</p>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-line overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Tiempo</h2>
        {totalTime === 0 ? (
          <div className="card text-sm text-muted">
            Sin datos. Crea tareas con hora de inicio y fin para medir tu tiempo.
          </div>
        ) : (
          <div className="card space-y-3">
            <div className="h-2 rounded-full overflow-hidden flex bg-line">
              {TIME_CAT_META.map((c) => {
                const pct = (timeByCategory[c.value] / totalTime) * 100;
                if (pct === 0) return null;
                return <div key={c.value} className={c.color} style={{ width: `${pct}%` }} />;
              })}
            </div>
            <ul className="space-y-2">
              {TIME_CAT_META.map((c) => {
                const ms = timeByCategory[c.value];
                const pct = totalTime > 0 ? (ms / totalTime) * 100 : 0;
                return (
                  <li key={c.value} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.color}`} />
                      <span className="text-sm">{c.emoji} {c.label}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmtHours(ms)}</p>
                      <p className="text-xs text-muted">{pct.toFixed(0)}%</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {suggestion && (
              <div className="border-t border-line pt-2">
                <p className="text-sm text-accent">💡 {suggestion}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
