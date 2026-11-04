/* ¿El teléfono va en un vehículo? Sirve para empezar el recorrido solo, sin
   tener que entrar a Jornada y tocar "Empezar".

   Una sola lectura no alcanza: el GPS salta cientos de metros de vez en
   cuando y eso, en un minuto, parece un auto. Por eso se mira una ventana de
   los últimos dos minutos y se pide que el avance sea sostenido: tiene que
   cumplirse sin la primera lectura y sin la última, así un salto en
   cualquiera de las dos puntas no alcanza para arrancar. Caminar no cuenta:
   hace falta ir a más de 10 km/h. */

import { haversineKm, TRACK_LIMITS, type Fix } from "./geo";

export const MOTION_LIMITS = {
  windowMs: 120_000,   // cuánto hacia atrás se mira
  minDistanceM: 300,   // avance mínimo dentro de la ventana
  minSpeedKmh: 10,     // más rápido que caminando
  maxAccuracyM: 50,    // lecturas peores no sirven para decidir
  minFixes: 3,         // por tramo evaluado (la ventana necesita una más)
};

function advancing(fixes: Fix[], o: typeof MOTION_LIMITS): boolean {
  if (fixes.length < o.minFixes) return false;
  const a = fixes[0];
  const b = fixes[fixes.length - 1];
  const hours = (b.t - a.t) / 3_600_000;
  if (hours <= 0) return false;
  const km = haversineKm(a, b);
  const kmh = km / hours;
  return km * 1000 >= o.minDistanceM && kmh >= o.minSpeedKmh && kmh <= TRACK_LIMITS.maxSpeedKmh;
}

/**
 * Suma una lectura a la ventana y dice si ya hay movimiento sostenido.
 * No muta: devuelve la ventana nueva.
 */
export function pushMotionFix(
  window: Fix[],
  fix: Fix,
  o: typeof MOTION_LIMITS = MOTION_LIMITS,
): { window: Fix[]; moving: boolean } {
  const valid =
    Number.isFinite(fix.lat) && Number.isFinite(fix.lng) &&
    Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= o.maxAccuracyM;
  if (!valid) return { window, moving: false };

  const next = [...window.filter((f) => f.t < fix.t && fix.t - f.t <= o.windowMs), fix];
  const moving =
    advancing(next, o) &&
    advancing(next.slice(1), o) &&
    advancing(next.slice(0, -1), o);
  return { window: next, moving };
}
