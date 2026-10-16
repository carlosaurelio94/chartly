"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { parseAmount } from "@/lib/amount";
import type { BudgetCategory } from "@/lib/budgets";

/** Topes mensuales por categoría de nivel superior. Vacío = sin tope. */
export default function BudgetsModal({
  open,
  onClose,
  categories,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  categories: BudgetCategory[];
  currency: string;
}) {
  const router = useRouter();
  const tops = categories.filter((c) => !c.parent_id);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tops.map((c) => [c.id, Number(c.monthly_budget) > 0 ? String(c.monthly_budget) : ""])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const changed = tops.filter((c) => {
      const next = parseAmount(values[c.id] ?? "") ?? 0;
      const prev = Number(c.monthly_budget) || 0;
      return next !== prev;
    });
    const results = await Promise.all(
      changed.map((c) => {
        const v = parseAmount(values[c.id] ?? "") ?? 0;
        return supabase.from("bill_categories").update({ monthly_budget: v > 0 ? v : null }).eq("id", c.id);
      }),
    );
    setBusy(false);
    if (results.some((r) => r.error)) {
      setError("No se pudieron guardar todos los topes. Probá de nuevo.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Topes por mes">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Cuánto querés gastar como máximo por mes en cada categoría ({currency}). Te avisamos al llegar al 80%.
          Dejalo vacío para no poner tope.
        </p>
        {tops.length === 0 && (
          <p className="text-sm text-muted">Todavía no tenés categorías. Creálas en Ajustes → Datos y categorías.</p>
        )}
        <ul className="space-y-2">
          {tops.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <label htmlFor={`b-${c.id}`} className="text-sm flex-1 truncate">{c.name}</label>
              <input
                id={`b-${c.id}`}
                className="input w-36 text-right tabular"
                inputMode="decimal"
                placeholder="Sin tope"
                value={values[c.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full">{busy ? "Guardando…" : "Guardar topes"}</button>
      </div>
    </Modal>
  );
}
