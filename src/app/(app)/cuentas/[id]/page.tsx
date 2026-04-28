import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { getRates } from "@/lib/fx-server";
import { convert } from "@/lib/fx";
import BillActions from "./BillActions";

export const dynamic = "force-dynamic";

export default async function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [billRes, paymentsRes, catsRes, pmRes, settingsRes, rates] = await Promise.all([
    supabase.from("bills_with_balance").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, paid_at, note, payment_method_id")
      .eq("bill_id", id)
      .order("paid_at", { ascending: false }),
    supabase.from("bill_categories").select("id, name, color").order("name", { ascending: true }),
    supabase.from("payment_methods").select("id, name").order("name", { ascending: true }),
    user
      ? supabase.from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getRates(),
  ]);

  if (!billRes.data) notFound();
  const bill = billRes.data as {
    id: string; name: string; amount: number; due_date: string | null;
    notes: string | null; balance: number; paid_total: number; archived: boolean;
    kind: "expense" | "income"; currency: string; category_id: string | null;
    recurrence: "none" | "weekly" | "monthly" | "yearly"; is_open: boolean;
  };
  const payments = (paymentsRes.data ?? []) as { id: string; amount: number; paid_at: string; note: string | null; payment_method_id: string | null }[];
  const categories = (catsRes.data ?? []) as { id: string; name: string; color: string }[];
  const paymentMethods = (pmRes.data ?? []) as { id: string; name: string }[];
  const defaultCurrency = (settingsRes.data as { default_currency: string } | null)?.default_currency ?? "ARS";
  const isIncome = bill.kind === "income";
  const amountColor = isIncome ? "text-ok" : "text-danger";
  const cat = bill.category_id ? categories.find((c) => c.id === bill.category_id) : null;
  const pmById = new Map(paymentMethods.map((p) => [p.id, p.name]));

  const showConversion = bill.currency !== defaultCurrency;
  const balanceConverted = showConversion ? convert(bill.balance, bill.currency, defaultCurrency, rates) : null;
  const totalConverted = showConversion ? convert(bill.paid_total, bill.currency, defaultCurrency, rates) : null;

  return (
    <div className="space-y-4">
      <Link href="/cuentas" className="text-sm text-muted">← Cuentas</Link>

      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`chip ${isIncome ? "border border-ok text-ok" : "border border-danger text-danger"}`}>
            {isIncome ? "Ingreso" : bill.is_open ? "🧺 Acumulador" : "Gasto"}
          </span>
          <span className="text-xs text-muted">{bill.currency}</span>
          {cat && (
            <span
              className="text-xs px-2 py-0.5 rounded-full border"
              style={{ borderColor: cat.color, color: cat.color }}
            >
              {cat.name}
            </span>
          )}
        </div>
        <h1 className="text-xl font-semibold mt-2">{bill.name}</h1>
        {bill.is_open ? (
          <div className="mt-3">
            <p className="label">Total acumulado</p>
            <p className={`text-2xl font-semibold ${amountColor}`}>{fmtMoney(bill.paid_total, bill.currency)}</p>
            {totalConverted !== null && (
              <p className="text-xs text-muted mt-0.5">≈ {fmtMoney(totalConverted, defaultCurrency)}</p>
            )}
            <p className="text-xs text-muted mt-2">{payments.length} {payments.length === 1 ? "entrada" : "entradas"}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="label">{isIncome ? "Saldo por cobrar" : "Saldo"}</p>
                <p className={`text-2xl font-semibold ${amountColor}`}>{fmtMoney(bill.balance, bill.currency)}</p>
                {balanceConverted !== null && (
                  <p className="text-xs text-muted mt-0.5">≈ {fmtMoney(balanceConverted, defaultCurrency)}</p>
                )}
              </div>
              <div>
                <p className="label">Vence</p>
                <p className="text-base">{fmtDate(bill.due_date)}</p>
              </div>
            </div>
            <div className="mt-3 text-sm text-muted">
              {isIncome ? "Cobrado" : "Pagado"}: {fmtMoney(bill.paid_total, bill.currency)} · Original: {fmtMoney(bill.amount, bill.currency)}
            </div>
          </>
        )}
        {bill.notes && <p className="mt-3 text-sm">{bill.notes}</p>}
        <div className="mt-4">
          <BillActions bill={bill} categories={categories} paymentMethods={paymentMethods} />
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">{isIncome ? "Historial de cobros" : bill.is_open ? "Entradas" : "Historial de pagos"}</h2>
        {payments.length === 0 ? (
          <div className="card text-muted text-sm">{isIncome ? "Aún no hay cobros." : bill.is_open ? "Aún no hay entradas. Tocá '+ Agregar gasto' para empezar." : "Aún no hay pagos."}</div>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="card flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm">{fmtDateTime(p.paid_at)}</p>
                  {p.payment_method_id && pmById.get(p.payment_method_id) && (
                    <p className="text-xs text-accent">{pmById.get(p.payment_method_id)}</p>
                  )}
                  {p.note && <p className="text-xs text-muted">{p.note}</p>}
                </div>
                <p className={`font-semibold ${amountColor}`}>{fmtMoney(p.amount, bill.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
