"use client";

/* Anotar un gasto en dos toques: cuánto y en qué.

   Por debajo es lo mismo que entrar a un acumulador en Cuentas y sumar una
   compra (un pago dentro de ese acumulador): los totales, métricas y el
   runway no cambian. Lo que cambia es que no hace falta saber qué es un
   "acumulador" para anotar que gastaste 2.000 en comida. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { parseAmount } from "@/lib/amount";

type Bucket = { id: string; name: string; currency: string };

const FALLBACK_NAME = "Gastos varios";

export default function QuickExpense({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setError(null);
    setDone(null);
    const supabase = createClient();
    supabase
      .from("bills")
      .select("id, name, currency")
      .eq("kind", "expense")
      .eq("tipo", "acumulador")
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        const list = (data ?? []) as Bucket[];
        setBuckets(list);
        setBucketId((cur) => (cur && list.some((b) => b.id === cur) ? cur : list[0]?.id ?? null));
      });
    setTimeout(() => amountRef.current?.focus(), 50);
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      setError("Poné cuánto gastaste.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("Tu sesión venció. Volvé a entrar.");
      return;
    }

    let target = buckets?.find((b) => b.id === bucketId) ?? null;
    if (!target) {
      // Primera vez: creamos un acumulador genérico para que el gasto tenga dónde ir.
      const { data: settings } = await supabase
        .from("user_settings").select("default_currency").eq("user_id", user.id).maybeSingle();
      const currency = (settings as { default_currency?: string } | null)?.default_currency ?? "ARS";
      const { data: created, error: err } = await supabase
        .from("bills")
        .insert({ user_id: user.id, name: FALLBACK_NAME, amount: 0, kind: "expense", tipo: "acumulador", currency })
        .select("id, name, currency")
        .single();
      if (err || !created) {
        setSaving(false);
        setError("No se pudo guardar. Probá de nuevo.");
        return;
      }
      target = created as Bucket;
    }

    const { error: err } = await supabase.from("payments").insert({
      user_id: user.id,
      bill_id: target.id,
      amount: value,
      note: note.trim() || null,
      paid_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) {
      setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      return;
    }
    setDone(`Anotado en ${target.name}`);
    router.refresh();
    setTimeout(onClose, 900);
  }

  const current = buckets?.find((b) => b.id === bucketId);

  return (
    <Modal open={open} onClose={onClose} title="Anotar un gasto">
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label" htmlFor="qe-amount">¿Cuánto?</label>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-muted font-semibold">{current?.currency ?? ""}</span>
            <input
              id="qe-amount"
              ref={amountRef}
              className="input text-2xl font-bold tabular"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="label">¿En qué?</p>
          {buckets === null ? (
            <div className="h-10 mt-1 rounded-xl bg-line/40 animate-pulse" />
          ) : buckets.length === 0 ? (
            <p className="text-xs text-muted mt-1">Lo anotamos en «{FALLBACK_NAME}». Después podés crear categorías propias en Cuentas.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {buckets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBucketId(b.id)}
                  className={`chip text-sm ${b.id === bucketId ? "pill-accent" : "border border-line"}`}
                  aria-pressed={b.id === bucketId}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="qe-note">Nota (opcional)</label>
          <input id="qe-note" className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: almuerzo, súper…" />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {done && <p className="text-sm text-ok font-semibold">✓ {done}</p>}

        <button className="btn-primary w-full" disabled={saving || !!done}>
          {saving ? "Guardando…" : "Guardar gasto"}
        </button>
      </form>
    </Modal>
  );
}
