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
  category_id: string | null;
};

type Category = { id: string; name: string; color: string };

function totalsByCurrency(rows: Row[]): { code: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.currency, (map.get(r.currency) ?? 0) + Number(r.balance ?? 0));
  }
  return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

export default async function CuentasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [billsRes, catsRes, settingsRes] = await Promise.all([
    supabase
      .from("bills_with_balance")
      .select("id,name,amount,due_date,archived,paid_total,balance,kind,currency,category_id")
      .eq("archived", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("bill_categories")
      .select("id, name, color")
      .order("name", { ascending: true }),
    user
      ? supabase.from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const rows = (billsRes.data as Row[] | null) ?? [];
  const categories = (catsRes.data as Category[] | null) ?? [];
  const defaultCurrency = (settingsRes.data as { default_currency: string } | null)?.default_currency ?? "ARS";
  const expenses = rows.filter((r) => r.kind !== "income");
  const incomes = rows.filter((r) => r.kind === "income");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Cuentas</h1>
        <div className="flex gap-2">
          <NewBillButton kind="expense" defaultCurrency={defaultCurrency} categories={categories} />
          <NewBillButton kind="income" defaultCurrency={defaultCurrency} categories={categories} />
        </div>
      </div>

      {billsRes.error && <p className="text-danger text-sm">{billsRes.error.message}</p>}

      <Section
        title="Gastos"
        emptyText="Sin gastos. Agrega uno con + Gastos."
        rows={expenses}
        kind="expense"
        categories={categories}
      />

      <Section
        title="Ingresos"
        emptyText="Sin ingresos. Agrega uno con + Ingresos."
        rows={incomes}
        kind="income"
        categories={categories}
      />
    </div>
  );
}

function Section({
  title, emptyText, rows, kind, categories,
}: {
  title: string;
  emptyText: string;
  rows: Row[];
  kind: "expense" | "income";
  categories: Category[];
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
                    {cat && (
                      <span
                        className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full border"
                        style={{ borderColor: cat.color, color: cat.color }}
                      >
                        {cat.name}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${amountColor}`}>{fmtMoney(r.balance, r.currency)}</p>
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
