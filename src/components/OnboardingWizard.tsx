"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_REGIONS,
  detectRegionFromLocale,
  presetsFor,
  type BillPreset,
  type Region,
} from "@/lib/onboarding-presets";

type Step = "country" | "welcome" | "bills" | "gig" | "saving" | "done";
type BillPeriod = "current" | "next";
type BillData = { amount: string; period: BillPeriod };

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("country");
  const [region, setRegion] = useState<Region>("default");
  const [displayName, setDisplayName] = useState("");
  const [currency, setCurrency] = useState("USD");
  // selectedBills: nombre → datos (monto + periodo). Ausencia ⇒ no seleccionado.
  const [selectedBills, setSelectedBills] = useState<Map<string, BillData>>(new Map());
  const [gigEnabled, setGigEnabled] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Detectar región del navegador al montar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const detected = detectRegionFromLocale(navigator.language);
    setRegion(detected);
    setCurrency(presetsFor(detected).currency);
  }, []);

  const presets = useMemo(() => presetsFor(region), [region]);

  function changeRegion(r: Region) {
    setRegion(r);
    setCurrency(presetsFor(r).currency);
    setSelectedBills(new Map()); // reset porque cambian los bills
    setSelectedPlatforms(new Set());
  }

  function toggleBill(name: string) {
    setSelectedBills((prev) => {
      const next = new Map(prev);
      if (next.has(name)) next.delete(name);
      else next.set(name, { amount: "", period: "current" });
      return next;
    });
  }

  function patchBill(name: string, patch: Partial<BillData>) {
    setSelectedBills((prev) => {
      const next = new Map(prev);
      const cur = next.get(name);
      if (!cur) return prev;
      next.set(name, { ...cur, ...patch });
      return next;
    });
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  // Bills incompletos = seleccionados con monto vacío o 0
  const incomplete = useMemo(() => {
    let n = 0;
    for (const [, d] of selectedBills) {
      if (!d.amount || Number(d.amount) <= 0) n++;
    }
    return n;
  }, [selectedBills]);

  // Helper: ¿qué fecha de vencimiento generar?
  function computeDueDate(preset: BillPreset, period: BillPeriod): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = today.getMonth();
    const targetMonth = period === "next" ? mm + 1 : mm;
    const day = preset.due_day ?? today.getDate();
    // Date() corrige overflow (ej: mes 12 → enero del año siguiente)
    const d = new Date(yyyy, targetMonth, day);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    return `${Y}-${M}-${D}`;
  }

  async function finish() {
    setError(null);
    if (incomplete > 0) {
      setError("Completá el monto de los gastos seleccionados (o destildalos).");
      return;
    }
    setStep("saving");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada");

      // 1) Guardar settings principales
      const settingsPatch: Record<string, unknown> = {
        user_id: user.id,
        default_currency: currency,
        display_name: displayName.trim() || null,
        onboarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (gigEnabled) {
        settingsPatch.gig_worker_enabled = true;
        settingsPatch.gig_default_currency = currency;
        settingsPatch.gig_platforms = Array.from(selectedPlatforms);
        settingsPatch.gig_default_hours = 8;
      }
      const { error: sErr } = await supabase
        .from("user_settings")
        .upsert(settingsPatch, { onConflict: "user_id" });
      if (sErr) throw sErr;

      // 2) Crear categorías necesarias (deduplicadas por nombre)
      const billsToCreate: { preset: BillPreset; data: BillData }[] = [];
      for (const b of presets.bills) {
        const data = selectedBills.get(b.name);
        if (data) billsToCreate.push({ preset: b, data });
      }
      const uniqueCategories = Array.from(
        new Map(billsToCreate.map(({ preset }) => [preset.category, preset.color])).entries()
      ).map(([name, color]) => ({ user_id: user.id, name, color }));

      const catNameToId = new Map<string, string>();
      if (uniqueCategories.length > 0) {
        const { data: existingCats } = await supabase
          .from("bill_categories")
          .select("id, name")
          .eq("user_id", user.id);
        const existingMap = new Map<string, string>(
          (existingCats ?? []).map((c) => [(c as { name: string }).name, (c as { id: string }).id])
        );
        const toInsert = uniqueCategories.filter((c) => !existingMap.has(c.name));
        if (toInsert.length > 0) {
          const { data: newCats, error: cErr } = await supabase
            .from("bill_categories")
            .insert(toInsert)
            .select("id, name");
          if (cErr) throw cErr;
          for (const c of newCats ?? []) {
            catNameToId.set((c as { name: string }).name, (c as { id: string }).id);
          }
        }
        for (const [n, id] of existingMap) catNameToId.set(n, id);
      }

      // 3) Crear bills + payments para los marcados como "ya pagado este mes"
      if (billsToCreate.length > 0) {
        const today = new Date();
        const billRows = billsToCreate.map(({ preset, data }) => {
          const amountN = Number(data.amount) || 0;
          const due = computeDueDate(preset, data.period);
          const lastRolloverMonth = preset.monthly === true
            ? new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
            : null;
          return {
            user_id: user.id,
            name: preset.name,
            amount: amountN,
            currency,
            kind: "expense" as const,
            category_id: catNameToId.get(preset.category) ?? null,
            due_date: due,
            tipo: preset.monthly === true ? "recurrente" : "puntual",
            monthly_amount: preset.monthly === true ? amountN : null,
            last_rollover_month: lastRolloverMonth,
            archived: false,
          };
        });
        const { data: createdBills, error: bErr } = await supabase
          .from("bills")
          .insert(billRows)
          .select("id, name, amount");
        if (bErr) throw bErr;

        // 4) Para los que el usuario marcó "Mes próximo" (= este mes ya está pagado),
        //    insertar un payment matcheando el monto.
        const idByName = new Map<string, { id: string; amount: number }>();
        for (const cb of (createdBills ?? [])) {
          const c = cb as { id: string; name: string; amount: number };
          idByName.set(c.name, { id: c.id, amount: Number(c.amount) || 0 });
        }
        const paymentsToInsert: Array<{
          user_id: string;
          bill_id: string;
          amount: number;
          paid_at: string;
          note: string;
        }> = [];
        for (const { preset, data } of billsToCreate) {
          if (data.period !== "next") continue;
          const meta = idByName.get(preset.name);
          if (!meta) continue;
          paymentsToInsert.push({
            user_id: user.id,
            bill_id: meta.id,
            amount: meta.amount,
            paid_at: new Date().toISOString(),
            note: "auto:onboarding-prepaid",
          });
        }
        if (paymentsToInsert.length > 0) {
          const { error: pErr } = await supabase.from("payments").insert(paymentsToInsert);
          if (pErr) throw pErr;
        }
      }

      setStep("done");
      setTimeout(() => router.refresh(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando onboarding");
      setStep("bills");
    }
  }

  // Dismiss = guardar onboarded_at sin cargar nada
  async function skipAll() {
    setStep("saving");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        default_currency: currency,
        onboarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setStep("done");
    setTimeout(() => router.refresh(), 400);
  }

  // Agrupar bills por categoría para la UI
  const billsByCat = useMemo(() => {
    const map = new Map<string, BillPreset[]>();
    for (const b of presets.bills) {
      const arr = map.get(b.category) ?? [];
      arr.push(b);
      map.set(b.category, arr);
    }
    return Array.from(map.entries());
  }, [presets]);

  return (
    <div className="fixed inset-0 z-[100] bg-bg flex items-end sm:items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full sm:max-w-lg bg-card border border-line sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[95dvh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-muted">
              {step === "country" && "Paso 1 de 4"}
              {step === "welcome" && "Paso 2 de 4"}
              {step === "bills" && "Paso 3 de 4"}
              {step === "gig" && "Paso 4 de 4"}
              {(step === "saving" || step === "done") && "Configurando…"}
            </p>
            <h2 className="text-lg font-semibold">
              {step === "country" && "¿Desde qué país nos visitás?"}
              {step === "welcome" && "Bienvenido a Chartly"}
              {step === "bills" && "Tus gastos habituales"}
              {step === "gig" && "¿Trabajás en jornada?"}
              {step === "saving" && "Guardando…"}
              {step === "done" && "Todo listo ✓"}
            </h2>
          </div>
          {(step === "country" || step === "welcome" || step === "bills") && (
            <button onClick={skipAll} className="text-xs text-muted hover:text-fg">
              Saltar
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-4 flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step === "country" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Lo usamos para sugerirte gastos y plataformas comunes en tu país, y elegir la
                moneda por defecto. Podés cambiar todo después.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {ALL_REGIONS.map((r) => (
                  <button
                    key={r.region}
                    type="button"
                    onClick={() => changeRegion(r.region)}
                    className={`chip border text-sm py-3 ${
                      region === r.region
                        ? "bg-accent text-black border-accent"
                        : "border-line text-muted"
                    }`}
                  >
                    <span className="text-base">{r.flag}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                Moneda sugerida: <code>{presets.currency}</code>
              </p>
            </div>
          )}

          {step === "welcome" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Ya casi. Solo queda confirmar cómo te llamamos y la moneda por defecto.
              </p>

              <div>
                <label className="label">¿Cómo te llamamos?</label>
                <input
                  className="input mt-1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre (opcional)"
                  maxLength={40}
                />
              </div>

              <div>
                <label className="label">Moneda principal</label>
                <input
                  className="input mt-1 uppercase"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  maxLength={3}
                />
                <p className="text-xs text-muted mt-1">
                  Sugerido para tu región: <code>{presets.currency}</code>. Si trabajás en otra
                  moneda (por ejemplo USD en Venezuela), cambialo acá.
                </p>
              </div>
            </div>
          )}

          {step === "bills" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Tildá los gastos que tenés y completá el monto. Indicá si <b>el próximo
                vencimiento es este mes</b> (todavía no pagaste) o <b>el mes que viene</b> (este
                mes ya está pagado). 🔁 = se repite cada mes.
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  {selectedBills.size} seleccionado{selectedBills.size === 1 ? "" : "s"}
                  {incomplete > 0 && (
                    <span className="text-danger">
                      {" · "}
                      {incomplete} sin monto
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setSelectedBills(new Map())}
                  className="text-xs text-muted"
                >
                  Limpiar todo
                </button>
              </div>

              {billsByCat.map(([catName, bills]) => (
                <div key={catName} className="space-y-1">
                  <p className="label">{catName}</p>
                  <div className="grid grid-cols-1 gap-1">
                    {bills.map((b) => {
                      const data = selectedBills.get(b.name);
                      const checked = !!data;
                      return (
                        <div
                          key={b.name}
                          className={`border rounded-lg ${
                            checked ? "border-accent bg-accent/5" : "border-line bg-card"
                          }`}
                        >
                          {/* Header: clickear cualquier parte (excepto la X) selecciona,
                              re-clickear NO deselecciona si ya hay monto cargado, para
                              evitar perder lo que el usuario ya tipeó. Para quitar hay
                              una X al costado. */}
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!checked) toggleBill(b.name);
                              }}
                              className={`flex-1 flex items-center gap-2 text-sm text-left ${
                                checked ? "" : "text-muted"
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                                  checked
                                    ? "bg-accent border-accent text-black"
                                    : "border-line"
                                }`}
                              >
                                {checked ? "✓" : ""}
                              </span>
                              <span className="flex-1">{b.name}</span>
                              {b.monthly && <span className="text-xs">🔁</span>}
                            </button>
                            {checked && (
                              <button
                                type="button"
                                onClick={() => toggleBill(b.name)}
                                className="text-xs text-muted hover:text-danger px-2 py-1 -mr-2"
                                aria-label={`Quitar ${b.name}`}
                                title="Quitar de la lista"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {checked && data && (
                            <div className="border-t border-line/50 px-3 py-2 space-y-2">
                              <div>
                                <label className="label text-xs">Monto ({currency})</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="input mt-1"
                                  value={data.amount}
                                  onChange={(e) =>
                                    patchBill(b.name, { amount: e.target.value })
                                  }
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="label text-xs">Próximo vencimiento</label>
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => patchBill(b.name, { period: "current" })}
                                    className={`chip border text-xs py-2 ${
                                      data.period === "current"
                                        ? "bg-accent text-black border-accent"
                                        : "border-line text-muted"
                                    }`}
                                  >
                                    Este mes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => patchBill(b.name, { period: "next" })}
                                    className={`chip border text-xs py-2 ${
                                      data.period === "next"
                                        ? "bg-accent text-black border-accent"
                                        : "border-line text-muted"
                                    }`}
                                  >
                                    Mes próximo
                                  </button>
                                </div>
                                {data.period === "next" && (
                                  <p className="text-[11px] text-muted mt-1">
                                    Lo marcamos como <b>ya pagado</b> para este mes.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === "gig" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Si trabajás haciendo viajes o repartos (Uber, Rappi, etc.), activá «Jornada» y se
                desbloquea una sección con metas diarias, registros y métricas. Si no, seguí sin
                activar.
              </p>

              <div className="card flex items-center justify-between">
                <div>
                  <p className="font-medium">Activar Jornada</p>
                  <p className="text-xs text-muted">Para gig workers / repartidores</p>
                </div>
                <button
                  onClick={() => setGigEnabled((v) => !v)}
                  className={`shrink-0 w-12 h-7 rounded-full border transition relative ${
                    gigEnabled ? "bg-accent border-accent" : "bg-card border-line"
                  }`}
                  aria-pressed={gigEnabled}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${
                      gigEnabled ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {gigEnabled && (
                <div>
                  <label className="label">Plataformas que usás</label>
                  <p className="text-xs text-muted mt-1">
                    Tocá las que correspondan. Después podés agregar más en Ajustes.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {presets.platforms.map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={`chip border text-sm ${
                          selectedPlatforms.has(p)
                            ? "bg-accent text-black border-accent"
                            : "border-line text-muted"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "saving" && (
            <div className="py-8 text-center text-muted">
              <p>Creando tu configuración…</p>
            </div>
          )}

          {step === "done" && (
            <div className="py-8 text-center space-y-2">
              <p className="text-3xl">🎉</p>
              <p className="font-medium">Listo. Llevándote a tu Chartly…</p>
            </div>
          )}

          {error && (
            <p className="text-danger text-sm mt-3">⚠ {error}</p>
          )}
        </div>

        {/* Footer */}
        {(step === "country" || step === "welcome" || step === "bills" || step === "gig") && (
          <div className="px-4 py-3 border-t border-line flex gap-2 shrink-0">
            {step !== "country" && (
              <button
                onClick={() => {
                  if (step === "welcome") setStep("country");
                  if (step === "bills") setStep("welcome");
                  if (step === "gig") setStep("bills");
                }}
                className="btn-ghost flex-1"
              >
                Atrás
              </button>
            )}
            {step === "country" && (
              <button onClick={() => setStep("welcome")} className="btn-primary flex-1">
                Siguiente
              </button>
            )}
            {step === "welcome" && (
              <button onClick={() => setStep("bills")} className="btn-primary flex-1">
                Siguiente
              </button>
            )}
            {step === "bills" && (
              <button onClick={() => setStep("gig")} className="btn-primary flex-1">
                Siguiente
              </button>
            )}
            {step === "gig" && (
              <button onClick={finish} className="btn-primary flex-1">
                Terminar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
