"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CurrencySelect from "@/components/CurrencySelect";

type Parsed = {
  tipo?: "gasto" | "ingreso";
  monto?: number | null;
  moneda?: string | null;
  comercio?: string | null;
  fecha?: string | null;
  medio?: string | null;
  nota?: string | null;
  confianza?: number;
};

type Capture = {
  id: string;
  source: string;
  mime_type: string | null;
  raw_text: string | null;
  parsed: Parsed | null;
  confidence: number | null;
  error: string | null;
  status: string;
  created_at: string;
};

type Category = { id: string; name: string; color: string; parent_id: string | null };

type Accumulator = {
  id: string;
  name: string;
  currency: string;
  category_id: string | null;
  tipo: "puntual" | "recurrente" | "acumulador";
  is_fuel_accumulator: boolean;
  accumulator_month: string | null;
};

type Alias = {
  id: string;
  match_text: string;
  display_name: string;
  target_bill_id: string | null;
  category_id: string | null;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "SHELL DEHEZA S.A." -> "shell deheza s.a." para guardar como match. */
function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function ConfirmCapture({
  capture,
  categories,
  paymentMethods,
  accumulators,
  alias,
  defaultCurrency,
}: {
  capture: Capture;
  categories: Category[];
  paymentMethods: { id: string; name: string }[];
  accumulators: Accumulator[];
  alias: Alias | null;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const p = capture.parsed ?? {};
  const detectedName = p.comercio ?? "";

  const [kind, setKind] = useState<"expense" | "income">(
    p.tipo === "ingreso" ? "income" : "expense",
  );
  // Destino: acumulador existente o cuenta nueva.
  const [targetId, setTargetId] = useState<string>(() => {
    if (alias?.target_bill_id && accumulators.some((a) => a.id === alias.target_bill_id)) {
      return alias.target_bill_id;
    }
    return "";
  });
  const [name, setName] = useState(alias?.display_name ?? detectedName);
  const [amount, setAmount] = useState(p.monto != null ? String(p.monto) : "");
  const [currency, setCurrency] = useState(p.moneda || defaultCurrency);
  const [date, setDate] = useState(p.fecha || todayIso());
  const [categoryId, setCategoryId] = useState<string>(alias?.category_id ?? "");
  const [pmId, setPmId] = useState<string>(() => {
    if (!p.medio) return "";
    return paymentMethods.find((m) => m.name.toLowerCase() === p.medio!.toLowerCase())?.id ?? "";
  });
  const [note, setNote] = useState(p.nota ?? "");
  const [remember, setRemember] = useState(!alias && !!detectedName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const conf = capture.confidence ?? p.confianza ?? null;
  const nothingParsed = !p.monto && !p.comercio;

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  /** Acumuladores agrupados por superbloque (categoría padre). */
  const accByGroup = useMemo(() => {
    const groups = new Map<string, { label: string; color: string; items: Accumulator[] }>();
    for (const a of accumulators) {
      const cat = a.category_id ? catById.get(a.category_id) : null;
      const parent = cat?.parent_id ? catById.get(cat.parent_id) : cat;
      const key = parent?.id ?? "_sin";
      if (!groups.has(key)) {
        groups.set(key, {
          label: parent?.name ?? "Sin categoría",
          color: parent?.color ?? "#94a3b8",
          items: [],
        });
      }
      groups.get(key)!.items.push(a);
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [accumulators, catById]);

  const catOptions = useMemo(() => {
    const byParent = new Map<string | null, Category[]>();
    for (const c of categories) {
      const k = c.parent_id;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(c);
    }
    const out: { id: string; label: string }[] = [];
    for (const parent of byParent.get(null) ?? []) {
      out.push({ id: parent.id, label: parent.name });
      for (const child of byParent.get(parent.id) ?? []) {
        out.push({ id: child.id, label: `　${parent.name} · ${child.name}` });
      }
    }
    return out;
  }, [categories]);

  const target = accumulators.find((a) => a.id === targetId) ?? null;

  async function save() {
    setErr(null);
    const n = Number(String(amount).replace(",", "."));
    if (!isFinite(n) || n <= 0) { setErr("Monto inválido"); return; }
    if (!target && !name.trim()) { setErr("Poné un nombre"); return; }

    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setBusy(false); return; }

    const paidAt = date
      ? new Date(`${date}T12:00:00`).toISOString()
      : new Date().toISOString();

    let billId: string;

    if (target) {
      // Sumar al acumulador: solo se agrega el pago, la cuenta ya existe.
      billId = target.id;
      const { error } = await supabase.from("payments").insert({
        user_id: user.id,
        bill_id: billId,
        amount: n,
        paid_at: paidAt,
        payment_method_id: pmId || null,
        note: [name.trim(), note.trim()].filter(Boolean).join(" · ") || "auto:captura",
      });
      if (error) { setErr(error.message); setBusy(false); return; }
    } else {
      // Cuenta nueva ya saldada (el comprobante es de algo ya pagado).
      const { data: bill, error: bErr } = await supabase
        .from("bills")
        .insert({
          user_id: user.id,
          name: name.trim(),
          amount: n,
          currency,
          kind,
          due_date: date || null,
          category_id: categoryId || null,
          notes: note.trim() || null,
        })
        .select("id")
        .single();
      if (bErr || !bill) { setErr(bErr?.message ?? "No se pudo crear"); setBusy(false); return; }
      billId = (bill as { id: string }).id;

      const { error: pErr } = await supabase.from("payments").insert({
        user_id: user.id,
        bill_id: billId,
        amount: n,
        paid_at: paidAt,
        payment_method_id: pmId || null,
        note: "auto:captura",
      });
      if (pErr) { setErr(pErr.message); setBusy(false); return; }
    }

    // Aprender el alias para que la próxima venga resuelto solo.
    if (remember && detectedName && name.trim()) {
      await supabase.from("merchant_aliases").upsert(
        {
          user_id: user.id,
          match_text: normalize(name.trim()),
          display_name: name.trim(),
          target_bill_id: target ? target.id : null,
          category_id: categoryId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,match_text" },
      );
    }
    await supabase
      .from("captures")
      .update({ status: "confirmed", bill_id: billId, resolved_at: new Date().toISOString() })
      .eq("id", capture.id);

    router.push("/cuentas");
    router.refresh();
  }

  async function discard() {
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("captures")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", capture.id);
    router.push("/capturar");
    router.refresh();
  }

  if (capture.status === "confirmed") {
    return (
      <div className="card space-y-3 text-center">
        <p className="text-3xl">✅</p>
        <p className="font-medium">Esta captura ya fue guardada.</p>
        <Link href="/cuentas" className="btn-primary inline-block">Ir a Cuentas</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/capturar" className="text-sm text-muted">←</Link>
        <h1 className="text-lg font-semibold">Confirmar movimiento</h1>
      </div>

      {nothingParsed ? (
        <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/5 p-3 text-xs text-yellow-300 space-y-1">
          <p>
            {capture.error === "sin_extractor"
              ? "Falta configurar la lectura automática. Completá los campos a mano por ahora."
              : "No pudimos leer el comprobante. Completá los campos a mano."}
          </p>
          {capture.error && capture.error !== "sin_extractor" && (
            <details>
              <summary className="cursor-pointer opacity-70">Ver detalle técnico</summary>
              <pre className="whitespace-pre-wrap mt-1 opacity-70">{capture.error}</pre>
            </details>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {conf !== null && (
            <span className={`pill ${conf >= 0.8 ? "pill-success" : "pill-warning"}`}>
              {conf >= 0.8 ? "Leído con confianza" : "Revisá los datos"}
            </span>
          )}
          {alias && <span className="pill pill-accent">Alias reconocido</span>}
          {detectedName && (
            <span className="text-xs text-muted truncate">detectado: {detectedName}</span>
          )}
        </div>
      )}

      {/* ---- Destino ---- */}
      <div className="card space-y-3">
        <div>
          <p className="label">Guardar en</p>
          <p className="text-xs text-muted mt-1">
            Sumalo a un acumulador que ya tenés, o creá una cuenta nueva.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setTargetId("")}
          className="w-full text-left rounded-xl border px-3 py-2.5 transition"
          style={{
            borderColor: targetId === "" ? "var(--color-accent)" : "var(--color-line)",
            background: targetId === "" ? "var(--color-accent-tint)" : "transparent",
          }}
        >
          <p className="text-sm font-medium">Cuenta nueva</p>
          <p className="text-[11px] text-muted">Crea un gasto aparte con su categoría.</p>
        </button>

        {accByGroup.map((g) => (
          <div key={g.label} className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide flex items-center gap-1.5" style={{ color: g.color }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: g.color }} />
              {g.label}
            </p>
            <div className="space-y-1.5">
              {g.items.map((a) => {
                const active = targetId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setTargetId(a.id);
                      setCurrency(a.currency || currency);
                    }}
                    className="w-full text-left rounded-xl border px-3 py-2.5 transition"
                    style={{
                      borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                      background: active ? "var(--color-accent-tint)" : "transparent",
                    }}
                  >
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <p className="text-[11px] text-muted">
                      {a.is_fuel_accumulator ? "Acumulador de nafta del mes" : "Acumulador"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {accumulators.length === 0 && (
          <p className="text-xs text-muted">
            Todavía no tenés acumuladores. Creá uno desde Cuentas marcándolo como acumulador.
          </p>
        )}
      </div>

      {/* ---- Datos ---- */}
      <div className="card space-y-3">
        {!target && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("expense")}
              className={`chip justify-center py-2 ${kind === "expense" ? "chip-active" : ""}`}
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => setKind("income")}
              className={`chip justify-center py-2 ${kind === "income" ? "chip-active" : ""}`}
            >
              Ingreso
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label">{target ? "Nombre corto" : "Nombre / comercio"}</label>
            {detectedName && normalize(detectedName) !== normalize(name) && (
              <button
                type="button"
                onClick={() => setName(detectedName)}
                className="text-[11px] text-accent underline shrink-0"
              >
                Usar el mismo nombre
              </button>
            )}
          </div>
          <input
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Shell"
          />
          {detectedName && normalize(detectedName) !== normalize(name) && (
            <p className="text-[11px] text-muted mt-1">
              El comprobante dice «{detectedName}».
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Monto</label>
            <input
              className="input mt-1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Moneda</label>
            <div className="mt-1">
              <CurrencySelect value={currency} onChange={setCurrency} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Fecha</label>
            <input
              type="date"
              className="input mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Medio de pago</label>
            <select className="input mt-1" value={pmId} onChange={(e) => setPmId(e.target.value)}>
              <option value="">—</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {!target && (
          <div>
            <label className="label">Categoría</label>
            <select
              className="input mt-1"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sin categoría</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Nota</label>
          <input
            className="input mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {name.trim() && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              Recordar <b>{name.trim()}</b>
              {target ? <> → <b>{target.name}</b></> : null}
              <span className="block text-[11px] text-muted">
                La próxima vez que comparta un comprobante de acá, va directo.
              </span>
            </span>
          </label>
        )}

        {err && <p className="text-danger text-sm">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={discard} className="btn-ghost" disabled={busy}>Descartar</button>
          <button onClick={save} className="btn-primary flex-1" disabled={busy}>
            {busy ? "Guardando…" : target ? `Sumar a ${target.name}` : "Guardar movimiento"}
          </button>
        </div>
      </div>

      {capture.raw_text && (
        <details className="card">
          <summary className="text-sm text-muted cursor-pointer">Texto compartido</summary>
          <pre className="text-xs text-muted whitespace-pre-wrap mt-2">{capture.raw_text}</pre>
        </details>
      )}
    </div>
  );
}
