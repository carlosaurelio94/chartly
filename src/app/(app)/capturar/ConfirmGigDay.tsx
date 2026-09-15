"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtMoney } from "@/lib/format";

type GigKind = "earnings" | "tip_app" | "tip_cash" | "cash_trip" | "expense" | "fuel";

const KIND_META: Record<GigKind, { label: string; emoji: string; out: boolean }> = {
  earnings:  { label: "App",         emoji: "📱", out: false },
  tip_app:   { label: "Propina app", emoji: "💳", out: false },
  tip_cash:  { label: "Propina ef.", emoji: "💵", out: false },
  cash_trip: { label: "Viaje ef.",   emoji: "💰", out: false },
  fuel:      { label: "Nafta",       emoji: "⛽", out: true },
  expense:   { label: "Otro gasto",  emoji: "🧾", out: true },
};

const KIND_ORDER: GigKind[] = ["earnings", "tip_app", "tip_cash", "cash_trip", "fuel", "expense"];

type RawItem = {
  kind: GigKind;
  monto: number;
  hora: string | null;
  fecha: string | null;
  nota: string | null;
};

type Parsed = {
  clase?: string;
  plataforma?: string | null;
  fecha?: string | null;
  moneda?: string | null;
  total?: number | null;
  horas?: number | null;
  km?: number | null;
  items?: RawItem[];
  confianza?: number;
};

type Capture = {
  id: string;
  parsed: Parsed | null;
  confidence: number | null;
  error: string | null;
  status: string;
};

type Existing = {
  id: string;
  shift_date: string;
  platform: string | null;
  kind: string;
  amount: number;
  note: string | null;
};

/** Item de trabajo en la UI: lleva su fecha resuelta y si parece repetido. */
type Row = RawItem & { date: string; dup: boolean };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export default function ConfirmGigDay({
  capture,
  platforms,
  existing,
  defaultCurrency,
}: {
  capture: Capture;
  platforms: string[];
  existing: Existing[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const p = capture.parsed ?? {};
  const currency = p.moneda || defaultCurrency;

  const [platform, setPlatform] = useState(p.plataforma ?? platforms[0] ?? "Otro");
  const [fallbackDate, setFallbackDate] = useState(p.fecha || todayIso());
  const [hours, setHours] = useState(p.horas != null ? String(p.horas) : "");
  const [km, setKm] = useState(p.km != null ? String(p.km) : "");
  const [items, setItems] = useState<RawItem[]>(() => (p.items ?? []).map((it) => ({ ...it })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Índice de lo ya cargado: fecha|kind|monto -> cuántos hay.
  const existingIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of existing) {
      const k = `${e.shift_date}|${e.kind}|${Number(e.amount)}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [existing]);

  const rows: Row[] = useMemo(() => {
    const used = new Map<string, number>();
    return items.map((it) => {
      const date = it.fecha ?? fallbackDate;
      const key = `${date}|${it.kind}|${it.monto}`;
      const already = existingIndex.get(key) ?? 0;
      const consumed = used.get(key) ?? 0;
      const dup = consumed < already;
      used.set(key, consumed + 1);
      return { ...it, date, dup };
    });
  }, [items, fallbackDate, existingIndex]);

  // Los que parecen repetidos arrancan destildados.
  const [skipped, setSkipped] = useState<Set<number>>(
    () => new Set(rows.map((r, i) => (r.dup ? i : -1)).filter((i) => i >= 0)),
  );
  // Corrección manual de la fecha de un grupo.
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});

  function effDate(d: string) {
    return dateOverrides[d] ?? d;
  }

  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(i);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const activeIdx = useMemo(
    () => rows.map((_, i) => i).filter((i) => !skipped.has(i)),
    [rows, skipped],
  );

  const totals = useMemo(() => {
    let inc = 0, out = 0;
    for (const i of activeIdx) {
      const r = rows[i];
      if (KIND_META[r.kind].out) out += r.monto;
      else inc += r.monto;
    }
    return { inc, out, net: inc - out };
  }, [activeIdx, rows]);

  const dupCount = rows.filter((r) => r.dup).length;
  const multiDay = groups.length > 1;
  const conf = capture.confidence ?? p.confianza ?? null;

  function toggle(i: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function toggleGroup(idxs: number[], on: boolean) {
    setSkipped((prev) => {
      const next = new Set(prev);
      for (const i of idxs) { if (on) next.delete(i); else next.add(i); }
      return next;
    });
  }

  function patchItem(i: number, patch: Partial<RawItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function save() {
    setErr(null);
    if (activeIdx.length === 0) { setErr("No hay registros para guardar"); return; }
    setBusy(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setBusy(false); return; }

    // Un turno por día involucrado.
    const byDate = new Map<string, number[]>();
    for (const i of activeIdx) {
      const d = effDate(rows[i].date);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(i);
    }

    const today = todayIso();

    for (const [date, idxs] of byDate) {
      // Un día que no es hoy ya terminó: lo damos por cerrado.
      // Siempre se puede reabrir desde Jornada si hace falta seguir cargando.
      const isPast = date < today;
      let shiftId: string;
      const { data: ex } = await supabase
        .from("gig_shifts")
        .select("id, closed_at")
        .eq("user_id", user.id)
        .eq("shift_date", date)
        .maybeSingle();

      if (ex) {
        const row = ex as { id: string; closed_at: string | null };
        shiftId = row.id;
        if (isPast && !row.closed_at) {
          await supabase
            .from("gig_shifts")
            .update({ closed_at: new Date().toISOString() })
            .eq("id", shiftId);
        }
      } else {
        const { data: created, error: sErr } = await supabase
          .from("gig_shifts")
          .insert({
            user_id: user.id,
            shift_date: date,
            closed_at: isPast ? new Date().toISOString() : null,
          })
          .select("id")
          .single();
        if (sErr || !created) { setErr(sErr?.message ?? "No se pudo crear el turno"); setBusy(false); return; }
        shiftId = (created as { id: string }).id;
      }

      const payload = idxs.map((i) => {
        const r = rows[i];
        return {
          user_id: user.id,
          shift_id: shiftId,
          shift_date: date,
          platform,
          kind: r.kind,
          amount: r.monto,
          currency,
          note: [r.hora, r.nota].filter(Boolean).join(" · ") || "auto:captura",
        };
      });

      const { error: eErr } = await supabase.from("gig_entries").insert(payload);
      if (eErr) { setErr(eErr.message); setBusy(false); return; }

      // Horas y km solo tienen sentido si la captura era de un único día.
      if (!multiDay) {
        const patch: Record<string, number> = {};
        const h = Number(String(hours).replace(",", "."));
        const k = Number(String(km).replace(",", "."));
        if (isFinite(h) && h > 0) patch.hours_worked = h;
        if (isFinite(k) && k > 0) patch.km_driven = k;
        if (Object.keys(patch).length > 0) {
          await supabase.from("gig_shifts").update(patch).eq("id", shiftId);
        }
      }
    }

    await supabase
      .from("captures")
      .update({ status: "confirmed", resolved_at: new Date().toISOString() })
      .eq("id", capture.id);

    router.push("/jornada");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/capturar" className="text-sm text-muted">←</Link>
        <h1 className="text-lg font-semibold">Jornada detectada</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill pill-accent">🛵 Resumen</span>
        {conf !== null && (
          <span className={`pill ${conf >= 0.8 ? "pill-success" : "pill-warning"}`}>
            {conf >= 0.8 ? "Leído con confianza" : "Revisá los datos"}
          </span>
        )}
        {multiDay && <span className="pill pill-warning">{groups.length} días</span>}
        <span className="text-xs text-muted">{activeIdx.length} de {rows.length}</span>
      </div>

      {dupCount > 0 && (
        <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/5 p-3 text-xs text-yellow-300">
          {dupCount} {dupCount === 1 ? "registro ya estaba" : "registros ya estaban"} cargado
          {dupCount === 1 ? "" : "s"} en ese día con el mismo importe. Los dejé
          <b> destildados</b> para que no se dupliquen. Si de verdad fueron dos viajes
          iguales, tildalos a mano.
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <label className="label">Plataforma</label>
          <select
            className="input mt-1"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {Array.from(new Set([platform, ...platforms, "Otro"])).map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
        </div>

        {!multiDay && (
          <>
            <div>
              <label className="label">Día</label>
              <input
                type="date"
                className="input mt-1"
                value={effDate(groups[0]?.[0] ?? fallbackDate)}
                max={todayIso()}
                onChange={(e) => {
                  const orig = groups[0]?.[0] ?? fallbackDate;
                  setDateOverrides((o) => ({ ...o, [orig]: e.target.value }));
                  setFallbackDate(e.target.value);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Horas (opcional)</label>
                <input
                  className="input mt-1"
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Km (opcional)</label>
                <input
                  className="input mt-1"
                  inputMode="decimal"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </>
        )}

        {multiDay && (
          <p className="text-xs text-muted">
            La captura tiene registros de varios días: se crea (o completa) un turno
            por cada uno. Los días anteriores a hoy quedan <b>cerrados</b> — podés
            reabrirlos desde Jornada. Las horas y km cargalos después en cada día.
          </p>
        )}
      </div>

      {groups.map(([date, idxs]) => {
        const shown = effDate(date);
        const on = idxs.filter((i) => !skipped.has(i)).length;
        const sum = idxs
          .filter((i) => !skipped.has(i))
          .reduce((s, i) => s + (KIND_META[rows[i].kind].out ? -rows[i].monto : rows[i].monto), 0);
        return (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize truncate">{dayLabel(shown)}</p>
                <p className="text-[11px] text-muted">{on} de {idxs.length} · {fmtMoney(sum, currency)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => toggleGroup(idxs, true)} className="chip text-[11px]">Todos</button>
                <button type="button" onClick={() => toggleGroup(idxs, false)} className="chip text-[11px]">Ninguno</button>
              </div>
            </div>

            {multiDay && (
              <input
                type="date"
                className="input"
                value={shown}
                max={todayIso()}
                onChange={(e) => setDateOverrides((o) => ({ ...o, [date]: e.target.value }))}
              />
            )}

            <ul className="space-y-2">
              {idxs.map((i) => {
                const r = rows[i];
                const off = skipped.has(i);
                return (
                  <li key={i} className="card-sm space-y-2" style={{ opacity: off ? 0.45 : 1 }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!off}
                        onChange={() => toggle(i)}
                        className="shrink-0"
                      />
                      <select
                        className="input"
                        style={{ padding: "6px 10px", fontSize: 13 }}
                        value={r.kind}
                        onChange={(e) => patchItem(i, { kind: e.target.value as GigKind })}
                      >
                        {KIND_ORDER.map((k) => (
                          <option key={k} value={k}>
                            {KIND_META[k].emoji} {KIND_META[k].label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input tabular"
                        style={{ padding: "6px 10px", fontSize: 13, textAlign: "right" }}
                        inputMode="decimal"
                        value={String(r.monto)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(",", "."));
                          patchItem(i, { monto: isFinite(n) ? n : 0 });
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 pl-6 flex-wrap">
                      {(r.hora || r.nota) && (
                        <span className="text-[11px] text-muted">
                          {[r.hora, r.nota].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {r.dup && <span className="pill pill-warning">ya cargado</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="card space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Ingresos</span>
          <span className="font-bold tabular text-ok">{fmtMoney(totals.inc, currency)}</span>
        </div>
        {totals.out > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Gastos</span>
            <span className="font-bold tabular text-danger">−{fmtMoney(totals.out, currency)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm pt-1 border-t border-line">
          <span className="font-medium">Neto</span>
          <span className="font-bold tabular">{fmtMoney(totals.net, currency)}</span>
        </div>
      </div>

      {err && <p className="text-danger text-sm">{err}</p>}

      <div className="flex gap-2">
        <button onClick={discard} className="btn-ghost" disabled={busy}>Descartar</button>
        <button onClick={save} className="btn-primary flex-1" disabled={busy || activeIdx.length === 0}>
          {busy ? "Guardando…" : `Guardar ${activeIdx.length} en Jornada`}
        </button>
      </div>

      <p className="text-[11px] text-muted text-center">
        ¿La lista no entraba en una pantalla? Mandá otra captura del mismo día:
        los registros repetidos se detectan solos.
      </p>
    </div>
  );
}
