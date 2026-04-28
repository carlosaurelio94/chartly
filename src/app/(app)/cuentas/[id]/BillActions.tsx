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
};
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
        {isIncome ? "Registrar cobro" : "Registrar pago"}
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
  const [amount, setAmount] = useState(String(bill.balance ?? ""));
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
    const { error } = await supabase.from("payments").insert({
      bill_id: bill.id,
      user_id: user.id,
      amount: Number(amount),
      note: note || null,
      payment_method_id: pmId || null,
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onClose();
    setAmount(""); setNote(""); setPmId("");
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${isIncome ? "Registrar cobro" : "Registrar pago"} — ${bill.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Monto ({bill.currency})</label>
          <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
        <div>
          <label className="label">Nota</label>
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle opcional…" />
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isIncome = bill.kind === "income";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("bills").update({
      name,
      amount: Number(amount),
      due_date: due || null,
      notes: notes || null,
      currency,
      category_id: categoryId || null,
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
    <Modal open={open} onClose={onClose} title={isIncome ? "Editar ingreso" : "Editar gasto"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
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
