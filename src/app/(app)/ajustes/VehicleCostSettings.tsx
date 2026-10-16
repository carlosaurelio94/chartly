"use client";

/* Lo que no se ve en el día pero se paga: desgaste del vehículo e impuestos.
   Se pide como lo piensa la gente (cuánto gasto por año, cuántos km hago) y
   la app saca el costo por km. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { costPerKmFrom } from "@/lib/gig";
import { parseAmount } from "@/lib/amount";
import { fmtMoney } from "@/lib/format";

export default function VehicleCostSettings({
  costPerKm: costProp,
  taxPct: taxProp,
  currency,
}: {
  costPerKm: number;
  taxPct: number;
  currency: string;
}) {
  const router = useRouter();
  const [cost, setCost] = useState(costProp > 0 ? String(costProp) : "");
  const [tax, setTax] = useState(taxProp > 0 ? String(taxProp) : "");
  const [calcOpen, setCalcOpen] = useState(false);
  const [yearlyCosts, setYearlyCosts] = useState("");
  const [yearlyKm, setYearlyKm] = useState("");
  const [vehicleValue, setVehicleValue] = useState("");
  const [usefulKm, setUsefulKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const suggestion = costPerKmFrom({
    yearlyCosts: parseAmount(yearlyCosts) ?? 0,
    yearlyKm: parseAmount(yearlyKm) ?? 0,
    vehicleValue: parseAmount(vehicleValue) ?? 0,
    usefulKm: parseAmount(usefulKm) ?? 0,
  });

  async function save() {
    const c = parseAmount(cost) ?? 0;
    const t = Math.min(60, Math.max(0, parseAmount(tax) ?? 0));
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setMsg("Tu sesión venció."); return; }
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        gig_cost_per_km: c > 0 ? Number(c.toFixed(2)) : null,
        tax_reserve_pct: t > 0 ? t : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setBusy(false);
    setMsg(error ? "No se pudo guardar." : "Guardado ✓");
    if (!error) router.refresh();
  }

  return (
    <div className="space-y-3 pt-3 border-t border-line">
      <div>
        <p className="label">Ganancia real</p>
        <p className="text-xs text-muted">
          Para que «te queda» descuente lo que el vehículo te cuesta aunque no lo pagues ese día
          (service, cubiertas, seguro, desgaste). La nafta no va acá: se carga en cada jornada.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="cpk">Costo del vehículo por km ({currency})</label>
        <input id="cpk" className="input mt-1" inputMode="decimal" placeholder="Ej: 45" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button type="button" onClick={() => setCalcOpen((v) => !v)} className="text-xs text-muted underline mt-1">
          {calcOpen ? "Cerrar calculadora" : "No sé cuánto es: calcularlo"}
        </button>
      </div>

      {calcOpen && (
        <div className="card-sm space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted" htmlFor="yc">Gasto por año (sin nafta)</label>
              <input id="yc" className="input mt-1" inputMode="decimal" placeholder="service, seguro, cubiertas…" value={yearlyCosts} onChange={(e) => setYearlyCosts(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="yk">Km por año</label>
              <input id="yk" className="input mt-1" inputMode="decimal" placeholder="Ej: 30.000" value={yearlyKm} onChange={(e) => setYearlyKm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="vv">Valor del vehículo (opcional)</label>
              <input id="vv" className="input mt-1" inputMode="decimal" value={vehicleValue} onChange={(e) => setVehicleValue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="uk">Km de vida útil (opcional)</label>
              <input id="uk" className="input mt-1" inputMode="decimal" placeholder="Moto ~100.000, auto ~250.000" value={usefulKm} onChange={(e) => setUsefulKm(e.target.value)} />
            </div>
          </div>
          {suggestion !== null && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">≈ <b>{fmtMoney(suggestion, currency)}</b> por km</p>
              <button type="button" className="chip pill-accent text-xs" onClick={() => { setCost(suggestion.toFixed(2)); setCalcOpen(false); }}>
                Usar este valor
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="tax">Apartar para impuestos (% de lo cobrado)</label>
        <input id="tax" className="input mt-1" inputMode="decimal" placeholder="Ej: 5 si sos monotributista" value={tax} onChange={(e) => setTax(e.target.value)} />
        <p className="text-xs text-muted mt-1">Opcional. Te mostramos cuánto separar cada día para no llegar corto al pago.</p>
      </div>

      <button onClick={save} disabled={busy} className="btn-primary w-full">{busy ? "Guardando…" : "Guardar"}</button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
