import { describe, it, expect } from "vitest";
import { pushMotionFix } from "@/lib/motion";
import type { Fix } from "@/lib/geo";

const O = { lat: -34.6037, lng: -58.3816 };
const T0 = Date.UTC(2026, 10, 4, 12);
const M_LAT = 1 / 111_320;

const fix = (northM: number, sec: number, accuracy = 8): Fix => ({
  lat: O.lat + northM * M_LAT,
  lng: O.lng,
  accuracy,
  t: T0 + sec * 1000,
});

/** Corre las lecturas y devuelve en qué índice se detectó movimiento (o -1). */
function firstMoving(fixes: Fix[]): number {
  let win: Fix[] = [];
  for (let i = 0; i < fixes.length; i++) {
    const r = pushMotionFix(win, fixes[i]);
    win = r.window;
    if (r.moving) return i;
  }
  return -1;
}

/** Una lectura cada `every` s durante `secs` s, avanzando a `kmh`. */
const drive = (kmh: number, secs: number, every = 5, from = 0, t0 = 0): Fix[] =>
  Array.from({ length: Math.floor(secs / every) + 1 }, (_, i) =>
    fix(from + (kmh / 3.6) * i * every, t0 + i * every));

describe("pushMotionFix", () => {
  it("detecta un auto en la ciudad (30 km/h) en menos de un minuto", () => {
    const i = firstMoving(drive(30, 120));
    expect(i).toBeGreaterThan(0);
    expect(i * 5).toBeLessThanOrEqual(60);
  });

  it("detecta una bici de reparto (15 km/h)", () => {
    expect(firstMoving(drive(15, 120))).toBeGreaterThan(0);
  });

  it("caminando (5 km/h) no arranca", () => {
    expect(firstMoving(drive(5, 600))).toBe(-1);
  });

  it("parado con el GPS bailando no arranca", () => {
    const jitter = Array.from({ length: 60 }, (_, i) => fix((i % 2 ? 1 : -1) * 25, i * 5, 20));
    expect(firstMoving(jitter)).toBe(-1);
  });

  it("un salto del GPS en la última lectura no alcanza", () => {
    const still = Array.from({ length: 10 }, (_, i) => fix(0, i * 5));
    expect(firstMoving([...still, fix(800, 55)])).toBe(-1);
  });

  it("un salto que vuelve al lugar no alcanza", () => {
    const still = Array.from({ length: 10 }, (_, i) => fix(0, i * 5));
    expect(firstMoving([...still, fix(800, 55), fix(0, 60), fix(0, 65)])).toBe(-1);
  });

  it("ignora lecturas imprecisas", () => {
    expect(firstMoving(drive(30, 120).map((f) => ({ ...f, accuracy: 200 })))).toBe(-1);
  });

  it("una velocidad imposible no cuenta como movimiento", () => {
    expect(firstMoving(drive(400, 60))).toBe(-1);
  });

  it("olvida lo viejo: dos minutos de caminata no se suman a un arranque", () => {
    const r = pushMotionFix([fix(0, 0), fix(10, 10)], fix(20, 400));
    expect(r.window).toHaveLength(1);
    expect(r.moving).toBe(false);
  });

  it("no muta la ventana recibida", () => {
    const win = [fix(0, 0)];
    pushMotionFix(win, fix(10, 5));
    expect(win).toHaveLength(1);
  });

  it("descarta lecturas fuera de orden", () => {
    const r = pushMotionFix([fix(0, 10)], fix(50, 5));
    expect(r.window.map((f) => f.t)).toEqual([T0 + 5000]);
  });
});
