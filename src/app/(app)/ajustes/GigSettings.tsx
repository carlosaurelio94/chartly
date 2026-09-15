"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CurrencySelect from "@/components/CurrencySelect";

// Sin preset hardcodeado: las plataformas iniciales se eligen en el onboarding según
// la región del usuario. Acá solo mostramos las que ya tiene + campo libre para sumar.

export default function GigSettings({
  enabled: enabledProp,
  defaultGoal: goalProp,
  defaultHours: hoursProp,
  currency: curProp,
  platforms: platformsProp,
  tankLiters: tankLitersProp,
}: {
  enabled: boolean;
  defaultGoal: number;
  defaultHours: number;
  currency: string;
  platforms: string[];
  tankLiters: number | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(enabledProp);
  const [goal, setGoal] = useState<string>(String(goalProp || ""));
  const [hours, setHours] = useState<string>(String(hoursProp || 8));
  const [currency, setCurrency] = useState(curProp);
  const [platforms, setPlatforms] = useState<string[]>(platformsProp);
  const [customPlatform, setCustomPlatform] = useState("");
  const [tankLiters, setTankLiters] = useState<string>(
    tankLitersProp != null && tankLitersProp > 0 ? String(tankLitersProp) : ""
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function persist(patch: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setMsg("Sesión expirada"); return; }
    const { error } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg("Guardado ✓");
    router.refresh();
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await persist({ gig_worker_enabled: next });
  }

  async function saveDefaults() {
    const tankN = Number(tankLiters);
    await persist({
      gig_default_goal: Number(goal) || 0,
      gig_default_hours: Number(hours) || 0,
      gig_default_currency: currency,
      gig_platforms: platforms,
      gig_tank_liters: isFinite(tankN) && tankN > 0 ? tankN : null,
    });
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function addCustomPlatform() {
    const v = customPlatform.trim();
    if (!v) return;
    if (!platforms.includes(v)) setPlatforms((prev) => [...prev, v]);
    setCustomPlatform("");
  }

  // Renombrar una plataforma propaga el cambio a TODOS los gig_entries históricos
  // del usuario, no sólo a la lista de Ajustes. Antes esto requería una query
  // manual; ahora es self-service.
  async function renamePlatform(oldName: string) {
    if (typeof window === "undefined") return;
    const proposed = window.prompt(
      `Renombrar "${oldName}" en toda tu jornada. ¿Nuevo nombre?`,
      oldName
    );
    if (proposed === null) return;
    const newName = proposed.trim();
    if (!newName || newName === oldName) return;
    const ok = window.confirm(
      `Esto va a renombrar "${oldName}" a "${newName}" en TODOS tus registros de Jornada (presente y pasado). ¿Confirmás?`
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setMsg("Sesión expirada"); return; }
    // 1) Renombrar en histórico
    const { error: e1 } = await supabase
      .from("gig_entries")
      .update({ platform: newName })
      .eq("user_id", user.id)
      .eq("platform", oldName);
    if (e1) { setBusy(false); setMsg(e1.message); return; }
    // 2) Actualizar la lista en user_settings (de-duplicando si el nuevo ya existía)
    const nextPlatforms = Array.from(new Set(
      platforms.map((p) => (p === oldName ? newName : p))
    ));
    setPlatforms(nextPlatforms);
    const { error: e2 } = await supabase.from("user_settings").upsert(
      { user_id: user.id, gig_platforms: nextPlatforms, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setBusy(false);
    if (e2) { setMsg(e2.message); return; }
    setMsg(`Renombrado en histórico ✓`);
    router.refresh();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="label">Jornada laboral</p>
          <p className="text-sm text-muted">
            Activá esto si trabajás en delivery o transporte (Uber, Rappi, Didi, PedidosYa, Cabify…).
            Aparece una sección nueva con metas diarias, registros y métricas.
          </p>
        </div>
        <button
          onClick={toggle}
          className={`shrink-0 w-12 h-7 rounded-full border transition relative ${enabled ? "bg-accent border-accent" : "bg-card border-line"}`}
          aria-pressed={enabled}
          aria-label="Activar/desactivar jornada"
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${enabled ? "right-0.5" : "left-0.5"}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t border-line">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Meta diaria</label>
              <input
                type="text"
                inputMode="decimal"
                className="input mt-1"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Horas / día</label>
              <input
                type="text"
                inputMode="decimal"
                className="input mt-1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="8"
              />
            </div>
          </div>

          <div>
            <label className="label">Moneda de Jornada</label>
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>

          <div>
            <label className="label">Tanque del vehículo (litros)</label>
            <input
              type="text"
              inputMode="decimal"
              className="input mt-1"
              value={tankLiters}
              onChange={(e) => setTankLiters(e.target.value)}
              placeholder="ej. 12 (moto) o 50 (auto)"
            />
            <p className="text-xs text-muted mt-1">
              Si lo completás, en Jornada vas a ver cuántos tanques gastaste según los litros que
              cargás.
            </p>
          </div>

          <div>
            <label className="label">Plataformas</label>
            <p className="text-xs text-muted">Las que aparecen al registrar un viaje/pedido.</p>
            <div className="flex gap-1 mt-2 flex-wrap">
              {platforms.length === 0 && (
                <p className="text-xs text-muted">
                  Aún no agregaste ninguna. Usá el campo de abajo para sumar las que correspondan.
                </p>
              )}
              {platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full border bg-accent text-black border-accent text-xs pl-2 pr-1 py-0.5"
                >
                  <span>{p}</span>
                  <button
                    type="button"
                    onClick={() => renamePlatform(p)}
                    title="Renombrar (afecta a todos los registros de Jornada)"
                    className="px-1 hover:opacity-80"
                    aria-label={`Renombrar ${p}`}
                    disabled={busy}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlatform(p)}
                    title="Quitar de la lista"
                    className="px-1 hover:opacity-80"
                    aria-label={`Quitar ${p}`}
                    disabled={busy}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className="input flex-1"
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
                placeholder="Agregar otra…"
              />
              <button onClick={addCustomPlatform} className="btn-ghost" type="button">+</button>
            </div>
          </div>

          <button onClick={saveDefaults} className="btn-primary w-full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar valores predeterminados"}
          </button>
          {msg && <p className="text-xs text-muted">{msg}</p>}
        </div>
      )}
    </div>
  );
}
