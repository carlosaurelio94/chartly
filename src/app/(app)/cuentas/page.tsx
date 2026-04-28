import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, fmtDate, daysUntil } from "@/lib/format";
import NewBillButton from "./NewBillButton";

export const dynamic = "force-dynamic";

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
};

function totalsByCurrency(rows: Row[]): { code: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0) + Number(r.balance ?? 0));
  }
  return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

export default async function CuentasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills_with_balance")
    .select("id,name,amount,due_date,archived,paid_total,balance,kind,currency")
    .eq("archived", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  const rows = (data as Row[] | null) ?? [];
  const expenses = rows.filter((r) => r.kind !== "income");
  const incomes = rows.filter((r) => r.kind === "income");

  return (
    <div className="space-y-6">
      {error && <p className="text-danger text-sm">{error.message}</p>}

      <Section
        title="Gastos"
        emptyText="Sin gastos. Agrega uno con + Gasto."
        rows={expenses}
        kind="expense"
      />

      <Section
        title="Ingresos"
        emptyText="Sin ingresos. Agrega uno con + Ingreso."
        rows={incomes}
        kind="income"
      />
    </div>
  );
}

function Section({
  title, emptyText, rows, kind,
}: {
  title: string;
  emptyText: string;
  rows: Row[];
  kind: "expense" | "income";
}) {
  const totals = totalsByCurrency(rows);
  const isIncome = kind === "income";

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="label">{title} — {isIncome ? "por cobrar" : "deuda total"}</p>
          {totals.length === 0 ? (
            <p className="text-2xl font-semibold">—</p>
          ) : (
            <div className="space-y-0.5">
              {totals.map((t) => (
                <p key={t.code} className="text-2xl font-semibold leading-tight">
                  {fmtMoney(t.total, t.code)}
                </p>
              ))}
            </div>
          )}
        </div>
        <NewBillButton kind={kind} />
      </div>

      {rows.length === 0 ? (
        <div className="card text-center text-muted text-sm">{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const d = daysUntil(r.due_date);
            const overdue = d !== null && d < 0 && Number(r.balance) > 0;
            const soon = d !== null && d >= 0 && d <= 3 && Number(r.balance) > 0;
            return (
              <li key={r.id}>
                <Link href={`/cuentas/${r.id}`} className="card flex items-center justify-between active:bg-line">
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
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fmtMoney(r.balance, r.currency)}</p>
                    {Number(r.paid_total) > 0 && (
                      <p className="text-xs text-muted">de {fmtMoney(r.amount, r.currency)}</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
