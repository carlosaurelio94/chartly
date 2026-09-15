"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import CurrencySelect from "@/components/CurrencySelect";
import { convert, type Rates } from "@/lib/fx";

export type BillTipo = "puntual" | "recurrente" | "acumulador";

type Bill = {
  id: string;
  name: string;
  amount: number;
  due_date: string | null;
  notes: string | null;
  balance: number;
  kind: "expense" | "income";
  currency: string;
  category_id: string | null;
  tipo: BillTipo;
  monthly_amount?: number | null;
};

type Category = { id: string; name: string; color: string };
type PaymentMethod = { id: string; name: string };

export default function BillActions({
  bill, categories, paymentMethods, defaultCurrency, rates,
}: {
  bill: Bill;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  defaultCurrency: string;
  rates: Rates;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const isIncome = bill.kind === "income";

  return (
    <div className="flex gap-2">
      <button onClick={() => setPayOpen(true)} className="btn-primary flex-1">
        {bill.tipo === "acumulador" ? "+ Agregar gasto" : isIncome ? "Registrar cobro" : "Registrar pago"}
      </button>
      <button onClick={() => setEditOpen(true)} className="btn-ghost">Editar</button>

      <PayModal
        bill={bill}
        paymentMethods={paymentMethods}
        defaultCurrency={defaultCurrency}
        rates={rates}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={() => router.refresh()}
      />
      <EditModal
        bill={bill}
        categories={categories}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function PayModal({
  bill, paymentMethods, defaultCurrency, rates, open, onClose, onDone,
}: {
  bill: Bill;
  paymentMethods: PaymentMethod[];
  defaultCurrency: string;
  rates: Rates;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(bill.tipo === "acumulador" ? "" : String(bill.balance ?? ""));
  const [note, setNote] = useState("");
  const [pmId, setPmId] = useState<string>("");
  const [convertedAmount, setConvertedAmount] = useState<string>("");
  const [convertedTouched, setConvertedTouched] = useState(false);
  const [isDebt, setIsDebt] = useState<boolean>(false); // solo aplica a acumuladores
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isIncome = bill.kind === "income";
  const showConversion = bill.currency !== defaultCurrency;

  // Auto-actualizar el monto convertido cuando cambia el monto original (si el usuario
  // no lo editó manualmente)
  useEffect(() => {
    if (!showConversion) return;
    if (convertedTouched) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) { setConvertedAmount(""); return; }
    const c = convert(n, bill.currency, defaultCurrency, rates);
    if (c === null) { setConvertedAmount(""); return; }
    setConvertedAmount(c.toFixed(2));
  }, [amount, showConversion, convertedTouched, bill.currency, defaultCurrency, rates]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }
    const payAmount = Number(amount);
    const convAmt = showConversion && convertedAmount.trim() !== "" ? Number(convertedAmount) : null;
    const { error } = await supabase.from("payments").insert({
      bill_id: bill.id,
      user_id: user.id,
      amount: payAmount,
      note: note || null,
      payment_method_id: pmId || null,
      converted_amount: convAmt,
      converted_currency: convAmt !== null ? defaultCurrency : null,
      is_debt: bill.tipo === "acumulador" ? isDebt : false,
    });
    if (error) { setErr(error.message); setLoading(false); return; }

    setLoading(false);
    onClose();
    setAmount(""); setNote(""); setPmId(""); setConvertedAmount(""); setConvertedTouched(false); setIsDebt(false);
    onDone();
  }

  const titleAction = bill.tipo === "acumulador"
    ? `Agregar gasto — ${bill.name}`
    : `${isIncome ? "Registrar cobro" : "Registrar pago"} — ${bill.name}`;

  return (
    <Modal open={open} onClose={onClose} title={titleAction}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Monto ({bill.currency})</label>
          <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        {showConversion && (
          <div>
            <label className="label">Equivalente ({defaultCurrency})</label>
            <input
              className="input mt-1"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={convertedAmount}
              onChange={(e) => { setConvertedAmount(e.target.value); setConvertedTouched(true); }}
              placeholder="Auto-completado por la cotización"
            />
            <p className="text-xs text-muted mt-1">
              Se completa con la cotización actual. Editalo si pagaste a otro tipo de cambio.
              {convertedTouched && (
                <button
                  type="button"
                  onClick={() => setConvertedTouched(false)}
                  className="ml-2 text-accent underline"
                >
                  Restablecer
                </button>
              )}
            </p>
          </div>
        )}
        <div>
          <label className="label">{bill.tipo === "acumulador" ? "Detalle" : "Nota"}</label>
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={bill.tipo === "acumulador" ? "Carne, verduras, leche…" : "Detalle opcional…"} />
        </div>
        <div>
          <label className="label">Medio de pago</label>
          <select className="input mt-1" value={pmId} onChange={(e) => setPmId(e.target.value)}>
            <option value="">— Sin especificar —</option>
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>{pm.name}</option>
            ))}
          </select>
          {paymentMethods.length === 0 && (
            <p className="text-xs text-muted mt-1">Agrega medios de pago en Ajustes.</p>
          )}
        </div>
        {bill.tipo === "acumulador" && (
          <div className="border border-line rounded-xl p-3 space-y-2">
            <p className="label">¿Suma a la deuda?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsDebt(false)}
                className={`chip border flex-1 justify-center py-2 ${!isDebt ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
              >
                Ya pagado
              </button>
              <button
                type="button"
                onClick={() => setIsDebt(true)}
                className={`chip border flex-1 justify-center py-2 ${isDebt ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
              >
                Es deuda
              </button>
            </div>
            <p className="text-xs text-muted">
              Por defecto «Ya pagado»: queda registrado como gasto pero no suma a tu deuda. Marcalo como «Es deuda» si todavía no lo pagaste.
            </p>
          </div>
        )}
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({
  bill, categories, open, onClose, onDone,
}: {
  bill: Bill;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(bill.name);
  const [amount, setAmount] = useState(String(bill.amount));
  const [due, setDue] = useState(bill.due_date ?? "");
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [currency, setCurrency] = useState(bill.currency);
  const [categoryId, setCategoryId] = useState<string>(bill.category_id ?? "");
  const [tipo, setTipo] = useState<BillTipo>(bill.tipo);
  const [monthlyAmountStr, setMonthlyAmountStr] = useState<string>(
    bill.monthly_amount != null ? String(bill.monthly_amount) : "",
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isIncome = bill.kind === "income";
  // Los ingresos no se acumulan ni se repiten por ahora.
  const nextTipo: BillTipo = isIncome ? "puntual" : tipo;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();

    const esRecurrente = nextTipo === "recurrente";
    const esAcumulador = nextTipo === "acumulador";
    // Monto recurrente: el campo dedicado, o el monto actual si lo dejaron vacío
    const monthlyN = esRecurrente
      ? (monthlyAmountStr.trim() !== "" ? Number(monthlyAmountStr) : Number(amount))
      : null;

    // Si recién pasa a recurrente, arrancamos el conteo el primer día de este mes.
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const updates: Record<string, unknown> = {
      name,
      tipo: nextTipo,
      amount: esAcumulador ? 0 : Number(amount),
      due_date: esAcumulador ? null : (due || null),
      notes: notes || null,
      currency,
      category_id: categoryId || null,
      monthly_amount: monthlyN,
    };
    if (esRecurrente && bill.tipo !== "recurrente") {
      updates.last_rollover_month = firstOfMonth.toISOString().slice(0, 10);
    }
    if (!esRecurrente) {
      updates.last_rollover_month = null;
    }

    const { error } = await supabase.from("bills").update(updates).eq("id", bill.id);
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onClose();
    onDone();
  }

  async function archive() {
    if (!confirm("¿Archivar? Se ocultará de la lista.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("bills").update({ archived: true }).eq("id", bill.id);
    if (error) { setErr(error.message); return; }
    onClose();
    onDone();
    window.location.href = "/cuentas";
  }

  return (
    <Modal open={open} onClose={onClose} title={isIncome ? "Editar ingreso" : bill.tipo === "acumulador" ? "Editar acumulador" : "Editar gasto"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {tipo !== "acumulador" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Monto</label>
              <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">Vence</label>
              <input className="input mt-1" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <label className="label">Moneda</label>
          <CurrencySelect value={currency} onChange={setCurrency} />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select
            className="input mt-1"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="text-xs text-muted mt-1">Crea categorías en Ajustes.</p>
          )}
        </div>
        {!isIncome && (
          <div className="border border-line rounded-xl p-3 space-y-2">
            <label className="label">Tipo de cuenta</label>
            <div className="grid gap-1.5">
              {([
                ["puntual", "Puntual", "Se paga una vez y queda saldada."],
                ["recurrente", "🔁 Recurrente", "Vuelve cada mes con el mismo monto."],
                ["acumulador", "🧺 Acumulador", "Le vas sumando gastos. Cierra por mes."],
              ] as [BillTipo, string, string][]).map(([v, label, desc]) => (
                <label
                  key={v}
                  className="flex items-start gap-2 p-2 rounded-lg border cursor-pointer"
                  style={{
                    borderColor: tipo === v ? "var(--color-accent)" : "var(--color-line)",
                    background: tipo === v ? "var(--color-accent-tint)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="tipo"
                    checked={tipo === v}
                    onChange={() => setTipo(v)}
                    className="mt-1 shrink-0"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-sm">{label}</span>
                    <span className="block text-xs text-muted mt-0.5">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {tipo === "recurrente" && (
              <div>
                <label className="label">Monto mensual ({currency})</label>
                <input
                  className="input mt-1"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={monthlyAmountStr}
                  onChange={(e) => setMonthlyAmountStr(e.target.value)}
                  placeholder={amount}
                />
                <p className="text-xs text-muted mt-1">Si lo dejás vacío, usa el monto actual.</p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="label">Notas</label>
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={archive} className="btn-danger">Archivar</button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
