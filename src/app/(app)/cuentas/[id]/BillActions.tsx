"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import CurrencySelect from "@/components/CurrencySelect";

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
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  is_open: boolean;
};

function nextDate(iso: string | null, rec: Bill["recurrence"]): string | null {
  if (!iso || rec === "none") return null;
  const d = new Date(iso);
  if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rec === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
type Category = { id: string; name: string; color: string };
type PaymentMethod = { id: string; name: string };

export default function BillActions({
  bill, categories, paymentMethods,
}: {
  bill: Bill;
  categories: Category[];
  paymentMethods: PaymentMethod[];
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const isIncome = bill.kind === "income";

  return (
    <div className="flex gap-2">
      <button onClick={() => setPayOpen(true)} className="btn-primary flex-1">
        {bill.is_open ? "+ Agregar gasto" : isIncome ? "Registrar cobro" : "Registrar pago"}
      </button>
      <button onClick={() => setEditOpen(true)} className="btn-ghost">Editar</button>

      <PayModal
        bill={bill}
        paymentMethods={paymentMethods}
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
  bill, paymentMethods, open, onClose, onDone,
}: {
  bill: Bill;
  paymentMethods: PaymentMethod[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(bill.is_open ? "" : String(bill.balance ?? ""));
  const [note, setNote] = useState("");
  const [pmId, setPmId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isIncome = bill.kind === "income";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }
    const payAmount = Number(amount);
    const { error } = await supabase.from("payments").insert({
      bill_id: bill.id,
      user_id: user.id,
      amount: payAmount,
      note: note || null,
      payment_method_id: pmId || null,
    });
    if (error) { setErr(error.message); setLoading(false); return; }

    // Si es recurrente y se está pagando completo, crear próxima instancia
    if (!bill.is_open && bill.recurrence !== "none" && payAmount >= Number(bill.balance)) {
      const next = nextDate(bill.due_date, bill.recurrence);
      const { data: full } = await supabase
        .from("bills")
        .select("name, amount, currency, kind, category_id, notes")
        .eq("id", bill.id)
        .maybeSingle();
      if (full) {
        await supabase.from("bills").insert({
          user_id: user.id,
          name: full.name,
          amount: full.amount,
          currency: full.currency,
          kind: full.kind,
          category_id: full.category_id,
          notes: full.notes,
          due_date: next,
          recurrence: bill.recurrence,
          recurrence_parent_id: bill.id,
        });
      }
    }

    setLoading(false);
    onClose();
    setAmount(""); setNote(""); setPmId("");
    onDone();
  }

  const titleAction = bill.is_open
    ? `Agregar gasto — ${bill.name}`
    : `${isIncome ? "Registrar cobro" : "Registrar pago"} — ${bill.name}`;

  return (
    <Modal open={open} onClose={onClose} title={titleAction}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Monto ({bill.currency})</label>
          <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">{bill.is_open ? "Detalle" : "Nota"}</label>
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={bill.is_open ? "Carne, verduras, leche…" : "Detalle opcional…"} />
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
  const [recurrence, setRecurrence] = useState<Bill["recurrence"]>(bill.recurrence);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isIncome = bill.kind === "income";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("bills").update({
      name,
      amount: bill.is_open ? 0 : Number(amount),
      due_date: bill.is_open ? null : (due || null),
      notes: notes || null,
      currency,
      category_id: categoryId || null,
      recurrence: bill.is_open ? "none" : recurrence,
    }).eq("id", bill.id);
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
    <Modal open={open} onClose={onClose} title={isIncome ? "Editar ingreso" : bill.is_open ? "Editar acumulador" : "Editar gasto"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {!bill.is_open && (
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
        {!bill.is_open && (
          <div>
            <label className="label">Recurrencia</label>
            <select
              className="input mt-1"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Bill["recurrence"])}
            >
              <option value="none">No se repite</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
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
