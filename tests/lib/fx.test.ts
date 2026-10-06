import { describe, it, expect } from "vitest";
import { convert } from "@/lib/fx";

// Cotizaciones por USD, como las guarda fx_rates.
const rates = { USD: 1, ARS: 1000, EUR: 0.9, CLP: 950 };

describe("convert", () => {
  it("devuelve el mismo monto si las monedas coinciden, aunque no haya tasas", () => {
    expect(convert(123.45, "XYZ", "XYZ", {})).toBe(123.45);
  });

  it("convierte desde USD", () => {
    expect(convert(10, "USD", "ARS", rates)).toBe(10_000);
  });

  it("convierte hacia USD", () => {
    expect(convert(5_000, "ARS", "USD", rates)).toBe(5);
  });

  it("convierte entre dos monedas no-USD pasando por USD", () => {
    expect(convert(9, "EUR", "ARS", rates)).toBeCloseTo(10_000, 6);
  });

  it("es reversible (ida y vuelta)", () => {
    const ida = convert(777, "CLP", "EUR", rates)!;
    expect(convert(ida, "EUR", "CLP", rates)).toBeCloseTo(777, 9);
  });

  it("devuelve null si falta la tasa de origen", () => {
    expect(convert(1, "BRL", "USD", rates)).toBeNull();
  });

  it("devuelve null si falta la tasa de destino", () => {
    expect(convert(1, "USD", "BRL", rates)).toBeNull();
  });

  it("trata una tasa 0 como faltante (evita dividir por cero)", () => {
    expect(convert(1, "ZZZ", "USD", { ...rates, ZZZ: 0 })).toBeNull();
  });

  it("respeta montos negativos y cero", () => {
    expect(convert(-2, "USD", "ARS", rates)).toBe(-2000);
    expect(convert(0, "USD", "ARS", rates)).toBe(0);
  });
});
