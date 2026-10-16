import { describe, it, expect } from "vitest";
import { addFix, emptyTrack, fmtDuration, haversineKm, pathKm, type Fix, type TrackState } from "@/lib/geo";

// Obelisco, Buenos Aires.
const O = { lat: -34.6037, lng: -58.3816 };
const T0 = Date.UTC(2026, 9, 15, 12);
const M_LAT = 1 / 111_320; // grados de latitud por metro

/** Lectura a `northM` metros al norte del Obelisco, `sec` segundos después de T0. */
const fix = (northM: number, sec: number, accuracy = 8): Fix => ({
  lat: O.lat + northM * M_LAT,
  lng: O.lng,
  accuracy,
  t: T0 + sec * 1000,
});

const run = (fixes: Fix[], s: TrackState = emptyTrack()) => fixes.reduce((st, f) => addFix(st, f), s);

describe("haversineKm", () => {
  it("es 0 para el mismo punto", () => {
    expect(haversineKm(O, O)).toBe(0);
  });

  it("Obelisco → Plaza de Mayo ≈ 1,1 km", () => {
    expect(haversineKm(O, { lat: -34.6083, lng: -58.3712 })).toBeCloseTo(1.07, 1);
  });

  it("Buenos Aires → Santiago de Chile ≈ 1140 km", () => {
    expect(haversineKm(O, { lat: -33.4489, lng: -70.6693 })).toBeGreaterThan(1100);
    expect(haversineKm(O, { lat: -33.4489, lng: -70.6693 })).toBeLessThan(1180);
  });

  it("es simétrica", () => {
    const b = { lat: 10.5, lng: -66.9 };
    expect(haversineKm(O, b)).toBeCloseTo(haversineKm(b, O), 9);
  });
});

describe("addFix", () => {
  it("la primera lectura es el ancla y no suma distancia", () => {
    const s = run([fix(0, 0)]);
    expect(s.distanceKm).toBe(0);
    expect(s.points).toHaveLength(1);
    expect(s.accepted).toBe(1);
  });

  it("suma un recorrido recto a velocidad normal", () => {
    // 1 km en tramos de 100 m cada 10 s (36 km/h)
    const fixes = Array.from({ length: 11 }, (_, i) => fix(i * 100, i * 10));
    const s = run(fixes);
    expect(s.distanceKm).toBeCloseTo(1, 2);
    expect(s.points).toHaveLength(11);
  });

  it("no acumula el baile del GPS estando parado", () => {
    // 10 minutos en el semáforo, lecturas que bailan ±10 m
    const jitter = Array.from({ length: 120 }, (_, i) => fix((i % 2 ? 1 : -1) * ((i * 7) % 10), i * 5));
    const s = run(jitter);
    expect(s.distanceKm).toBe(0);
  });

  it("avance lento: los pasitos se suman cuando superan el umbral", () => {
    // 5 m cada 5 s durante 100 s = 100 m
    const s = run(Array.from({ length: 21 }, (_, i) => fix(i * 5, i * 5)));
    expect(s.distanceKm).toBeGreaterThan(0.08);
    expect(s.distanceKm).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("descarta lecturas imprecisas", () => {
    const s = run([fix(0, 0), fix(500, 30, 120), fix(100, 40)]);
    expect(s.distanceKm).toBeCloseTo(0.1, 3);
    expect(s.rejected).toBe(1);
  });

  it("descarta saltos imposibles del GPS y sigue midiendo desde el último punto bueno", () => {
    const s = run([fix(0, 0), fix(100, 10), fix(5_000, 15), fix(200, 20)]);
    expect(s.distanceKm).toBeCloseTo(0.2, 3);
    expect(s.rejected).toBe(1);
  });

  it("si se pierde la señal suma la línea recta al volver", () => {
    // 10 minutos sin señal y aparece 3 km más allá (18 km/h, plausible)
    const s = run([fix(0, 0), fix(3_000, 600)]);
    expect(s.distanceKm).toBeCloseTo(3, 2);
  });

  it("rechaza lecturas con tiempo que no avanza", () => {
    const s = run([fix(0, 10), fix(200, 10), fix(300, 5)]);
    expect(s.distanceKm).toBe(0);
    expect(s.rejected).toBe(2);
  });

  it.each([
    { lat: NaN, lng: 0, accuracy: 5, t: T0 },
    { lat: 95, lng: 0, accuracy: 5, t: T0 },
    { lat: 0, lng: 200, accuracy: 5, t: T0 },
    { lat: 0, lng: 0, accuracy: NaN, t: T0 },
  ])("ignora lecturas inválidas %j", (bad) => {
    const s = run([bad as Fix]);
    expect(s.anchor).toBeNull();
    expect(s.rejected).toBe(1);
  });

  it("guarda puntos redondeados y con tiempo en segundos", () => {
    const s = run([{ lat: -34.6037123456, lng: -58.3816987654, accuracy: 5, t: T0 + 1499 }]);
    expect(s.points[0]).toEqual([-34.60371, -58.3817, Math.round((T0 + 1499) / 1000)]);
  });

  it("no muta el estado anterior", () => {
    const a = run([fix(0, 0)]);
    const copy = structuredClone(a);
    addFix(a, fix(500, 60));
    expect(a).toEqual(copy);
  });

  it("deja de guardar puntos al llegar al tope pero sigue sumando distancia", () => {
    const limits = { maxAccuracyM: 50, minStepM: 20, maxSpeedKmh: 180, maxPoints: 3 };
    const s = Array.from({ length: 6 }, (_, i) => fix(i * 100, i * 10)).reduce((st, f) => addFix(st, f, limits), emptyTrack());
    expect(s.points).toHaveLength(3);
    expect(s.distanceKm).toBeCloseTo(0.5, 2);
  });

  it("pathKm recalcula la misma distancia que se acumuló", () => {
    const s = run(Array.from({ length: 30 }, (_, i) => fix(i * 150, i * 15)));
    expect(pathKm(s.points)).toBeCloseTo(s.distanceKm, 2);
  });
});

describe("fmtDuration", () => {
  it.each([
    [0, "0 min"],
    [59_000, "0 min"],
    [45 * 60_000, "45 min"],
    [(6 * 60 + 12) * 60_000, "6 h 12 min"],
    [-5, "0 min"],
  ])("%d ms → %s", (ms, out) => {
    expect(fmtDuration(ms)).toBe(out);
  });
});
