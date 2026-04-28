"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";

type Payment = {
  amount: number;
  paid_at: string;
  bills: { kind: "expense" | "income"; currency: string } | null;
};
type Category = "work" | "rest" | "idle" | "other";
type AgendaRow = {
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  category: Category;
};
type Period = "week" | "month" | "all";

const CAT_META: { value: Category; label: string; emoji: string; color: string }[] = [
  { value: "work", label: "Laboral", emoji: "💼", color: "bg-sky-500" },
  { value: "rest", label: "Descanso", emoji: "🛌", color: "bg-emerald-500" },
  { value: "idle", label: "Ocioso", emoji: "🎮", color: "bg-amber-500" },
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

export default function MetricasView({
  payments, agenda,
}: {
  payments: Payment[];
  agenda: AgendaRow[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const start = startOfPeriod(period);

  const expenseTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (!p.bills || p.bills.kind !== "expense") continue;
      if (start && new Date(p.paid_at) < start) continue;
      const cur = p.bills.currency;
      map.set(cur, (map.get(cur) ?? 0) + Number(p.amount));
    }
    return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
  }, [payments, start]);

  const incomeTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (!p.bills || p.bills.kind !== "income") continue;
      if (start && new Date(p.paid_at) < start) continue;
      const cur = p.bills.currency;
      map.set(cur, (map.get(cur) ?? 0) + Number(p.amount));
    }
    return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
  }, [payments, start]);

  const timeByCategory = useMemo(() => {
    const map: Record<Category, number> = { work: 0, rest: 0, idle: 0, other: 0 };
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

      <section className="space-y-2">
        <h2 className="font-semibold">Dinero</h2>
        <div className="grid grid-cols-1 gap-2">
          <div className="card">
            <p className="label">Gastado</p>
            {expenseTotals.length === 0 ? (
              <p className="text-2xl font-semibold mt-1">—</p>
            ) : (
              <div className="space-y-0.5 mt-1">
                {expenseTotals.map((t) => (
                  <p key={t.code} className="text-2xl font-semibold leading-tight">
                    {fmtMoney(t.total, t.code)}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <p className="label">Cobrado</p>
            {incomeTotals.length === 0 ? (
              <p className="text-2xl font-semibold mt-1">—</p>
            ) : (
              <div className="space-y-0.5 mt-1">
                {incomeTotals.map((t) => (
                  <p key={t.code} className="text-2xl font-semibold leading-tight text-ok">
                    {fmtMoney(t.total, t.code)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tiempo</h2>
        {totalTime === 0 ? (
          <div className="card text-sm text-muted">
            Sin datos. Crea tareas con hora de inicio y fin para medir tu tiempo.
          </div>
        ) : (
          <div className="card space-y-3">
            <div className="h-2 rounded-full overflow-hidden flex bg-line">
              {CAT_META.map((c) => {
                const pct = (timeByCategory[c.value] / totalTime) * 100;
                if (pct === 0) return null;
                return <div key={c.value} className={c.color} style={{ width: `${pct}%` }} />;
              })}
            </div>
            <ul className="space-y-2">
              {CAT_META.map((c) => {
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
          </div>
        )}
      </section>
    </div>
  );
}
