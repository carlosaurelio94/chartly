"use client";

/* Mapa de calor de las zonas por donde más se anduvo en la jornada.
   Leaflet se carga recién en el cliente: toca `window` al importarse. */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { createClient } from "@/lib/supabase/client";

type Cell = { lat: number; lng: number; n: number };

const RANGES = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HeatMap() {
  const [days, setDays] = useState<number>(30);
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setCells(null);
    setError(false);
    createClient()
      .rpc("gig_heat_cells", { p_from: isoDaysAgo(days), p_cell_m: 250 })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(true);
        else setCells((data ?? []) as Cell[]);
      });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    if (!box.current || !cells || cells.length === 0) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      // leaflet.heat se cuelga del L global.
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.heat");
      if (cancelled || !box.current) return;

      const dark = document.documentElement.dataset.theme !== "light";
      map = L.map(box.current, { zoomControl: false, attributionControl: true });
      L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`,
        {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        },
      ).addTo(map);

      const max = cells[0]?.n ?? 1;
      const heat = (L as unknown as {
        heatLayer: (pts: [number, number, number][], o: object) => import("leaflet").Layer;
      }).heatLayer(
        cells.map((c) => [c.lat, c.lng, Math.max(0.15, c.n / max)]),
        { radius: 22, blur: 18, maxZoom: 15, minOpacity: 0.35 },
      );
      heat.addTo(map);
      map.fitBounds(L.latLngBounds(cells.map((c) => [c.lat, c.lng] as [number, number])).pad(0.15), { maxZoom: 14 });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [cells]);

  return (
    <div className="card space-y-3">
      <div className="space-y-2">
        <div>
          <p className="label">Zonas donde más te movés</p>
          <p className="text-xs text-muted">De tus recorridos con GPS</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`chip text-xs whitespace-nowrap ${days === r.days ? "pill-accent" : "border border-line"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">No se pudo cargar el mapa. Probá de nuevo más tarde.</p>}
      {!error && cells === null && <div className="h-64 rounded-2xl bg-line/40 animate-pulse" />}
      {!error && cells?.length === 0 && (
        <p className="text-sm text-muted">
          Todavía no hay recorridos en este período. Tocá «Empezar recorrido» cuando salgas a trabajar y acá vas a ver tus zonas.
        </p>
      )}
      {!error && cells && cells.length > 0 && (
        <div ref={box} className="h-72 rounded-2xl overflow-hidden" style={{ isolation: "isolate", background: "var(--color-bg)" }} />
      )}
    </div>
  );
}
