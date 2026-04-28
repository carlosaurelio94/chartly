"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import CurrencySelect from "@/components/CurrencySelect";

type Category = { id: string; name: string; color: string };

export default function NewBillButton({
  kind,
  defaultCurrency,
  categories,
}: {
  kind: "expense" | "income";
  defaultCurrency: string;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [categoryId, setCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isIncome = kind === "income";
  const label = isIncome ? "+ Ingresos" : "+ Gastos";
  const title = isIncome ? "Nuevo ingreso / préstamo" : "Nuevo gasto";
  const namePlaceholder = isIncome
    ? "Salario, préstamo a Juan, freelance…"
    : "Tarjeta, renta, internet…";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setLoading(false);
      return;
    }
    const { error } = await supabase.from("bills").insert({
      user_id: user.id,
      name,
      amount: Number(amount),
      due_date: due || null,
      notes: notes || null,
      kind,
      currency,
      category_id: categoryId || null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    setName(""); setAmount(""); setDue(""); setNotes(""); setCategoryId("");
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary shrink-0">{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required placeholder={namePlaceholder} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Monto</label>
              <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">{isIncome ? "Cobro" : "Vence"}</label>
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
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
