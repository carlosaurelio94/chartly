"use client";

/* El botón grande de la jornada: "Empezar recorrido" → mide km y tiempo con el
   GPS → "Terminar" → se suma a la jornada del día. Reemplaza tener que tocar
   +5 km / +15 min a mano. */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/geo";
import { useGpsTracker, type FinishedTrack } from "./useGpsTracker";

export default function GpsTrackerCard({
  todayStr,
  onSaved,
}: {
  todayStr: string;
  onSaved: () => void;
}) {
  const gps = useGpsTracker(todayStr);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addHours, setAddHours] = useState(true);

  async function save(t: FinishedTrack) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("save_gig_track", {
      p_client_id: t.id,
      p_shift_date: t.date,
      p_started_at: new Date(t.startedAt).toISOString(),
      p_ended_at: new Date(t.endedAt).toISOString(),
      p_distance_km: Number(t.track.distanceKm.toFixed(3)),
      p_points: t.track.points,
      p_add_hours: addHours,
    });
    setSaving(false);
    if (err) {
      setError("No se pudo guardar. Revisá la conexión y probá de nuevo: el recorrido quedó guardado en el teléfono.");
      return;
    }
    gps.clear();
    onSaved();
  }

  function discard() {
    if (!confirm("¿Descartar este recorrido? No se suma a la jornada.")) return;
    gps.clear();
  }

  if (gps.status === "unsupported") {
    return (
      <div className="card text-sm text-muted">
        Este navegador no permite usar el GPS. Podés cargar los km a mano abajo.
      </div>
    );
  }

  // Terminado: resumen y guardar.
  if (gps.finished) {
    const t = gps.finished;
    return (
      <div className="card space-y-3" style={{ borderColor: "var(--color-accent)" }}>
        <p className="label">Recorrido terminado</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={`${t.track.distanceKm.toFixed(1)} km`} label="recorridos" />
          <Stat value={fmtDuration(t.endedAt - t.startedAt)} label="en la calle" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={addHours} onChange={(e) => setAddHours(e.target.checked)} />
          Sumar también el tiempo a las horas trabajadas
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => save(t)} disabled={saving} className="btn-primary flex-1">
            {saving ? "Guardando…" : "Sumar a la jornada"}
          </button>
          <button onClick={discard} disabled={saving} className="btn-ghost">Descartar</button>
        </div>
      </div>
    );
  }

  // En curso.
  if (gps.active) {
    const waiting = gps.status === "starting";
    return (
      <div className="card space-y-3" style={{ borderColor: "var(--color-accent)" }}>
        <div className="flex items-center justify-between">
          <p className="label flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: waiting || gps.signalStale ? "var(--color-warning, #fbbf24)" : "var(--color-ok)" }}
            />
            {waiting ? "Buscando señal GPS…" : gps.signalStale ? "Sin señal, seguimos midiendo" : "Midiendo recorrido"}
          </p>
          {gps.accuracy !== null && <span className="text-[11px] text-muted">±{Math.round(gps.accuracy)} m</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={`${gps.distanceKm.toFixed(1)} km`} label="recorridos" big />
          <Stat value={fmtDuration(gps.elapsedMs)} label="en la calle" big />
        </div>
        <p className="text-[11px] text-muted leading-snug">
          Dejá Chartly abierto: mantenemos la pantalla encendida. Si cambiás de app, al volver sumamos el tramo en línea recta.
        </p>
        <button onClick={() => gps.stop()} className="btn-primary w-full">Terminar recorrido</button>
      </div>
    );
  }

  return (
    <div className="card space-y-2">
      <button onClick={() => gps.start()} className="btn-primary w-full text-base" style={{ padding: "14px 16px" }}>
        📍 Empezar recorrido
      </button>
      {gps.status === "denied" ? (
        <p className="text-xs text-danger">
          Chartly no tiene permiso para usar tu ubicación. Activalo en los ajustes del navegador para este sitio y volvé a intentar.
        </p>
      ) : (
        <p className="text-xs text-muted text-center">
          Cuenta los km y el tiempo con el GPS del teléfono. Tu ubicación solo la ves vos.
        </p>
      )}
    </div>
  );
}

function Stat({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <div>
      <p className="font-bold tabular" style={{ fontSize: big ? 28 : 20, lineHeight: 1.1 }}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
