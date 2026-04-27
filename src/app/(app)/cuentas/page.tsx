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
};

export default async function CuentasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills_with_balance")
    .select("id,name,amount,due_date,archived,paid_total,balance")
    .eq("archived", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  const rows = (data as Row[] | null) ?? [];
  const totalDebt = rows.reduce((s, r) => s + Number(r.balance ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="label">Deuda total</p>
          <p className="text-3xl font-semibold">{fmtMoney(totalDebt)}</p>
        </div>
        <NewBillButton />
      </div>

      {error && <p className="text-danger text-sm">{error.message}</p>}

      {rows.length === 0 ? (
        <div className="card text-center text-muted">
          Sin cuentas. Agrega una con el botón <span className="text-accent">+</span>.
        </div>
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
                    <p className="font-semibold">{fmtMoney(r.balance)}</p>
                    {Number(r.paid_total) > 0 && (
                      <p className="text-xs text-muted">de {fmtMoney(r.amount)}</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
