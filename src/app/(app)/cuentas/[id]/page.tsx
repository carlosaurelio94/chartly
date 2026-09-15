import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { getRates } from "@/lib/fx-server";
import { convert } from "@/lib/fx";
import BillActions from "./BillActions";

export const dynamic = "force-dynamic";

function monthLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export default async function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();

  const [billRes, paymentsRes, catsRes, pmRes, settingsRes, cyclesRes, rates] = await Promise.all([
    supabase.from("bills_with_balance").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, paid_at, note, payment_method_id")
      .eq("bill_id", id)
      .order("paid_at", { ascending: false })
      .limit(100),
    supabase.from("bill_categories").select("id, name, color").order("name", { ascending: true }),
    supabase.from("payment_methods").select("id, name").order("name", { ascending: true }),
    user
      ? supabase.from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("bill_cycles")
      .select("period_start, amount, closed_at")
      .eq("bill_id", id)
      .order("period_start", { ascending: false }),
    getRates(),
  ]);

  if (!billRes.data) notFound();
  const bill = billRes.data as {
    id: string; name: string; amount: number; due_date: string | null;
    notes: string | null; balance: number; paid_total: number; archived: boolean;
    kind: "expense" | "income"; currency: string; category_id: string | null;
    tipo: "puntual" | "recurrente" | "acumulador";
    monthly_amount?: number | null;
    last_rollover_month?: string | null;
    accumulator_month?: string | null; paid_total_all?: number;
  };
  const cycles = (cyclesRes.data ?? []) as { period_start: string; amount: number; closed_at: string | null }[];
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
            {isIncome ? "Ingreso" : bill.tipo === "acumulador" ? "🧺 Acumulador" : bill.tipo === "recurrente" ? "🔁 Recurrente" : "Gasto"}
          </span>
          <span className="text-xs text-muted">{bill.currency}</span>
          {bill.tipo === "recurrente" && (
            <span className="chip border border-accent text-accent text-xs" title="Se renueva cada mes">
              🔁 Mensual
            </span>
          )}
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
        {bill.tipo === "acumulador" ? (
          <div className="mt-3">
            <p className="label">Acumulado este mes</p>
            <p className={`text-2xl font-semibold ${amountColor}`}>{fmtMoney(bill.paid_total, bill.currency)}</p>
            {totalConverted !== null && (
              <p className="text-xs text-muted mt-0.5">≈ {fmtMoney(totalConverted, defaultCurrency)}</p>
            )}
            <p className="text-xs text-muted mt-2">
              Ciclo abierto: {monthLabel(bill.accumulator_month)}
              {typeof bill.paid_total_all === "number" && (
                <> · histórico total {fmtMoney(bill.paid_total_all, bill.currency)}</>
              )}
            </p>
            <p className="text-xs text-muted mt-1">
              Se reinicia en 0 al empezar el mes. Lo gastado queda guardado abajo.
            </p>
          </div>
        ) : (
          <>
            {/* El saldo lleva 2/3 del ancho: con montos grandes en ARS se
                desbordaba sobre la fecha de vencimiento. */}
            <div className="grid grid-cols-3 gap-3 mt-3 items-start">
              <div className="col-span-2 min-w-0">
                <p className="label">{isIncome ? "Saldo por cobrar" : "Saldo"}</p>
                <p className={`text-xl font-bold tabular-nums truncate ${amountColor}`}>
                  {fmtMoney(bill.balance, bill.currency)}
                </p>
                {balanceConverted !== null && (
                  <p className="text-xs text-muted mt-0.5 truncate">
                    ≈ {fmtMoney(balanceConverted, defaultCurrency)}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="label">Vence</p>
                <p className="text-sm font-medium">{fmtDate(bill.due_date)}</p>
              </div>
            </div>
            <div className="mt-3 text-sm text-muted flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="tabular-nums">
                {isIncome ? "Cobrado" : "Pagado"}: {fmtMoney(bill.paid_total, bill.currency)}
              </span>
              <span className="tabular-nums">
                Original: {fmtMoney(bill.amount, bill.currency)}
              </span>
            </div>
            {bill.tipo === "recurrente" && bill.monthly_amount != null && (
              <p className="mt-1 text-xs text-accent">
                🔁 Se suma {fmtMoney(Number(bill.monthly_amount), bill.currency)} cada mes automáticamente.
              </p>
            )}
          </>
        )}
        {bill.notes && <p className="mt-3 text-sm">{bill.notes}</p>}
        <div className="mt-4">
          <BillActions
            bill={bill}
            categories={categories}
            paymentMethods={paymentMethods}
            defaultCurrency={defaultCurrency}
            rates={rates}
          />
        </div>
      </div>

      {bill.tipo === "acumulador" && cycles.length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">Meses anteriores</h2>
          <ul className="space-y-2">
            {cycles.map((c) => (
              <li key={c.period_start} className="card flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{monthLabel(c.period_start)}</p>
                  <p className="text-xs text-muted">Cerrado</p>
                </div>
                <p className={`font-semibold ${amountColor}`}>
                  {fmtMoney(Number(c.amount), bill.currency)}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-2">
            Promedio mensual: {fmtMoney(
              cycles.reduce((s, c) => s + Number(c.amount), 0) / cycles.length,
              bill.currency,
            )}
          </p>
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-2">{isIncome ? "Historial de cobros" : bill.tipo === "acumulador" ? "Entradas" : "Historial de pagos"}</h2>
        {payments.length === 0 ? (
          <div className="card text-muted text-sm">{isIncome ? "Aún no hay cobros." : bill.tipo === "acumulador" ? "Aún no hay entradas. Tocá '+ Agregar gasto' para empezar." : "Aún no hay pagos."}</div>
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
