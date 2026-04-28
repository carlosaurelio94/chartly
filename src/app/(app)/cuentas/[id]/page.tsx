import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import BillActions from "./BillActions";

export const dynamic = "force-dynamic";

export default async function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [billRes, paymentsRes] = await Promise.all([
    supabase.from("bills_with_balance").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, paid_at, note")
      .eq("bill_id", id)
      .order("paid_at", { ascending: false }),
  ]);

  if (!billRes.data) notFound();
  const bill = billRes.data as {
    id: string; name: string; amount: number; due_date: string | null;
    notes: string | null; balance: number; paid_total: number; archived: boolean;
    kind: "expense" | "income"; currency: string;
  };
  const payments = (paymentsRes.data ?? []) as { id: string; amount: number; paid_at: string; note: string | null }[];
  const isIncome = bill.kind === "income";

  return (
    <div className="space-y-4">
      <Link href="/cuentas" className="text-sm text-muted">← Cuentas</Link>

      <div className="card">
        <div className="flex items-center gap-2">
          <span className={`chip ${isIncome ? "border border-ok text-ok" : "border border-line text-muted"}`}>
            {isIncome ? "Ingreso" : "Gasto"}
          </span>
          <span className="text-xs text-muted">{bill.currency}</span>
        </div>
        <h1 className="text-xl font-semibold mt-2">{bill.name}</h1>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="label">{isIncome ? "Saldo por cobrar" : "Saldo"}</p>
            <p className="text-2xl font-semibold">{fmtMoney(bill.balance, bill.currency)}</p>
          </div>
          <div>
            <p className="label">Vence</p>
            <p className="text-base">{fmtDate(bill.due_date)}</p>
          </div>
        </div>
        <div className="mt-3 text-sm text-muted">
          {isIncome ? "Cobrado" : "Pagado"}: {fmtMoney(bill.paid_total, bill.currency)} · Original: {fmtMoney(bill.amount, bill.currency)}
        </div>
        {bill.notes && <p className="mt-3 text-sm">{bill.notes}</p>}
        <div className="mt-4">
          <BillActions bill={bill} />
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">{isIncome ? "Historial de cobros" : "Historial de pagos"}</h2>
        {payments.length === 0 ? (
          <div className="card text-muted text-sm">{isIncome ? "Aún no hay cobros." : "Aún no hay pagos."}</div>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="card flex items-center justify-between">
                <div>
                  <p className="text-sm">{fmtDateTime(p.paid_at)}</p>
                  {p.note && <p className="text-xs text-muted">{p.note}</p>}
                </div>
                <p className="font-semibold text-ok">{fmtMoney(p.amount, bill.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
