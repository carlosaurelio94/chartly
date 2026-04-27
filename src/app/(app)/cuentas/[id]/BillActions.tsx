"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";

type Bill = {
  id: string;
  name: string;
  amount: number;
  due_date: string | null;
  notes: string | null;
  balance: number;
};

export default function BillActions({ bill }: { bill: Bill }) {
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <button onClick={() => setPayOpen(true)} className="btn-primary flex-1">Registrar pago</button>
      <button onClick={() => setEditOpen(true)} className="btn-ghost">Editar</button>

      <PayModal bill={bill} open={payOpen} onClose={() => setPayOpen(false)} onDone={() => router.refresh()} />
      <EditModal bill={bill} open={editOpen} onClose={() => setEditOpen(false)} onDone={() => router.refresh()} />
    </div>
  );
}

function PayModal({ bill, open, onClose, onDone }: { bill: Bill; open: boolean; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(bill.balance ?? ""));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onClose();
    setAmount(""); setNote("");
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Registrar pago — ${bill.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Monto</label>
          <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="label">Nota</label>
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transferencia, efectivo…" />
        </div>
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar pago"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ bill, open, onClose, onDone }: { bill: Bill; open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(bill.name);
  const [amount, setAmount] = useState(String(bill.amount));
  const [due, setDue] = useState(bill.due_date ?? "");
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("bills").update({
      name,
      amount: Number(amount),
      due_date: due || null,
      notes: notes || null,
    }).eq("id", bill.id);
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onClose();
    onDone();
  }

  async function archive() {
    if (!confirm("¿Archivar esta cuenta? Se ocultará de la lista.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("bills").update({ archived: true }).eq("id", bill.id);
    if (error) { setErr(error.message); return; }
    onClose();
    onDone();
    window.location.href = "/cuentas";
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar cuenta">
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
