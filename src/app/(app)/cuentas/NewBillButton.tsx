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
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  kind: "expense" | "income";
  defaultCurrency: string;
  categories: Category[];
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : openInner;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setOpenInner(v);
  };
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [categoryId, setCategoryId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [monthlyRollover, setMonthlyRollover] = useState(false);
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
    const amountNum = isOpen ? 0 : Number(amount);
    const useRollover = !isIncome && !isOpen && monthlyRollover;

    // Si activamos rollover mensual: guardamos el monto recurrente y marcamos inicio en el mes actual
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    const lastRolloverMonth = useRollover
      ? firstOfMonth.toISOString().slice(0, 10)
      : null;

    const { error } = await supabase.from("bills").insert({
      user_id: user.id,
      name,
      amount: amountNum,
      due_date: isOpen ? null : (due || null),
      notes: notes || null,
      kind,
      currency,
      category_id: categoryId || null,
      tipo: isOpen ? "acumulador" : useRollover ? "recurrente" : "puntual",
      monthly_amount: useRollover ? amountNum : null,
      last_rollover_month: lastRolloverMonth,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    setName(""); setAmount(""); setDue(""); setNotes(""); setCategoryId(""); setIsOpen(false); setMonthlyRollover(false);
    router.refresh();
  }

  return (
    <>
      {!hideTrigger && (
        <button onClick={() => setOpen(true)} className="btn-primary shrink-0">{label}</button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required placeholder={namePlaceholder} />
          </div>
          {!isIncome && (
            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button type="button" onClick={() => setIsOpen(false)} className={`chip border justify-center ${!isOpen ? "bg-accent text-black border-accent" : "border-line text-muted"}`}>
                  Monto fijo
                </button>
                <button type="button" onClick={() => setIsOpen(true)} className={`chip border justify-center ${isOpen ? "bg-accent text-black border-accent" : "border-line text-muted"}`}>
                  🧺 Acumulador
                </button>
              </div>
              {isOpen && (
                <p className="text-xs text-muted mt-1">Ej: Comida, Combustible. Vas sumando cada compra dentro del gasto.</p>
              )}
            </div>
          )}
          {!isOpen && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Monto</label>
                <input className="input mt-1" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required={!isOpen} />
              </div>
              <div>
                <label className="label">{isIncome ? "Cobro" : "Vence"}</label>
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
          {!isIncome && !isOpen && (
            <div className="border border-line rounded-xl p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={monthlyRollover}
                  onChange={(e) => setMonthlyRollover(e.target.checked)}
                  className="mt-1 shrink-0"
                />
                <span className="flex-1">
                  <span className="font-medium text-sm">🔁 Es el mismo gasto cada mes</span>
                  <span className="block text-xs text-muted mt-0.5">
                    Cada mes se suma automáticamente {amount ? `${amount} ${currency}` : "el monto"} a esta cuenta.
                    Si la pagaste, vuelve a empezar; si quedó deuda, se acumula con la del mes nuevo.
                  </span>
                </span>
              </label>
            </div>
          )}
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
