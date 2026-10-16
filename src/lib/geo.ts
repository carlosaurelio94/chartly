/* Recorrido por GPS: cuánto se anduvo de verdad y por dónde.

   El GPS del teléfono miente un poco todo el tiempo: parado en un semáforo
   reporta posiciones que bailan 5–30 m, y de vez en cuando tira un salto de
   cientos de metros. Si se suman todas las lecturas tal cual, un día de 80 km
   aparece como 110. Acá se filtra eso antes de sumar. */

export type Fix = {
  lat: number;
  lng: number;
  accuracy: number; // metros, radio de confianza que da el navegador
  t: number;        // epoch ms
};

/** Punto guardado: [lat, lng, epoch segundos], redondeado a ~1 m. */
export type TrackPoint = [number, number, number];

export type TrackState = {
  distanceKm: number;
  points: TrackPoint[];
  anchor: Fix | null;   // última lectura aceptada; contra ella se mide la próxima
  accepted: number;
  rejected: number;
};

export const TRACK_LIMITS = {
  maxAccuracyM: 50,     // lecturas más imprecisas que esto no sirven para medir
  minStepM: 20,         // por debajo, es ruido de estar parado
  maxSpeedKmh: 180,     // más rápido que esto en una moto o un auto de app es un salto del GPS
  maxPoints: 20_000,    // ~ un día entero con lecturas cada 20 m
};

const R = 6_371; // radio medio de la Tierra, km

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function emptyTrack(): TrackState {
  return { distanceKm: 0, points: [], anchor: null, accepted: 0, rejected: 0 };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function toPoint(f: Fix): TrackPoint {
  return [round5(f.lat), round5(f.lng), Math.round(f.t / 1000)];
}

/**
 * Suma una lectura al recorrido. Devuelve un estado nuevo (no muta).
 *
 * - Lectura imprecisa (> 50 m) → se descarta.
 * - Movimiento menor que el ruido (20 m, o 1,5× la precisión si es peor) → se ignora
 *   sin mover el ancla: así cinco pasitos de 10 m que en realidad son 50 m de
 *   avance lento terminan sumando cuando el desplazamiento acumulado supera el
 *   umbral.
 * - Velocidad imposible → salto del GPS, se descarta.
 * - Si se perdió la señal (o el teléfono suspendió la app) y vuelve más lejos,
 *   se suma la línea recta: subestima un poco, nunca inventa.
 */
export function addFix(state: TrackState, fix: Fix, limits = TRACK_LIMITS): TrackState {
  const valid =
    Number.isFinite(fix.lat) && Number.isFinite(fix.lng) &&
    Math.abs(fix.lat) <= 90 && Math.abs(fix.lng) <= 180 &&
    Number.isFinite(fix.accuracy) && fix.accuracy >= 0;
  if (!valid || fix.accuracy > limits.maxAccuracyM) {
    return { ...state, rejected: state.rejected + 1 };
  }

  if (!state.anchor) {
    return {
      ...state,
      anchor: fix,
      points: [toPoint(fix)],
      accepted: state.accepted + 1,
    };
  }

  const km = haversineKm(state.anchor, fix);
  const threshold = Math.max(limits.minStepM, 1.5 * Math.max(fix.accuracy, state.anchor.accuracy)) / 1000;
  if (km < threshold) return state;

  const hours = (fix.t - state.anchor.t) / 3_600_000;
  if (hours <= 0 || km / hours > limits.maxSpeedKmh) {
    return { ...state, rejected: state.rejected + 1 };
  }

  const points =
    state.points.length < limits.maxPoints ? [...state.points, toPoint(fix)] : state.points;
  return {
    distanceKm: state.distanceKm + km,
    points,
    anchor: fix,
    accepted: state.accepted + 1,
    rejected: state.rejected,
  };
}

/** Distancia de un recorrido ya guardado (para recalcular o validar). */
export function pathKm(points: TrackPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(
      { lat: points[i - 1][0], lng: points[i - 1][1] },
      { lat: points[i][0], lng: points[i][1] },
    );
  }
  return km;
}

/** "6 h 12 min", "45 min", "0 min". */
export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
