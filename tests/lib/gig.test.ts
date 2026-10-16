import { describe, it, expect } from "vitest";
import { costPerKmFrom, dayEconomics } from "@/lib/gig";

const base = { gross: 50_000, expenses: 8_000, km: 120, hours: 8, costPerKm: 50, taxPct: 0 };

describe("dayEconomics", () => {
  it("descuenta el desgaste del vehículo del neto", () => {
    const d = dayEconomics(base);
    expect(d.net).toBe(42_000);
    expect(d.vehicleCost).toBe(6_000);
    expect(d.realNet).toBe(36_000);
    expect(d.perHour).toBe(4_500);
    expect(d.perKm).toBe(300);
  });

  it("sin costo por km configurado, el neto real es el de siempre", () => {
    const d = dayEconomics({ ...base, costPerKm: 0 });
    expect(d.realNet).toBe(d.net);
    expect(d.vehicleCost).toBe(0);
  });

  it("aparta el % de impuestos sobre lo cobrado, no sobre el neto", () => {
    const d = dayEconomics({ ...base, taxPct: 10 });
    expect(d.taxReserve).toBe(5_000);
    expect(d.spendable).toBe(31_000);
  });

  it("el % de impuestos tiene tope en 60", () => {
    expect(dayEconomics({ ...base, taxPct: 500 }).taxReserve).toBe(30_000);
  });

  it("sin horas ni km no inventa $/h ni $/km", () => {
    const d = dayEconomics({ ...base, hours: 0, km: 0 });
    expect(d.perHour).toBeNull();
    expect(d.perKm).toBeNull();
    expect(d.vehicleCost).toBe(0);
  });

  it("puede dar negativo si el día no cubrió los costos", () => {
    const d = dayEconomics({ gross: 5_000, expenses: 4_000, km: 100, hours: 2, costPerKm: 30, taxPct: 0 });
    expect(d.realNet).toBe(-2_000);
    expect(d.perHour).toBe(-1_000);
  });

  it.each([NaN, -5, Infinity])("valores inválidos (%s) cuentan como 0", (bad) => {
    const d = dayEconomics({ gross: bad, expenses: bad, km: bad, hours: bad, costPerKm: bad, taxPct: bad });
    expect(d).toMatchObject({ gross: 0, expenses: 0, vehicleCost: 0, net: 0, realNet: 0, taxReserve: 0 });
  });
});

describe("costPerKmFrom", () => {
  it("gastos del año / km del año", () => {
    expect(costPerKmFrom({ yearlyCosts: 1_200_000, yearlyKm: 30_000 })).toBe(40);
  });

  it("suma la amortización si se indica valor y vida útil", () => {
    expect(costPerKmFrom({ yearlyCosts: 1_200_000, yearlyKm: 30_000, vehicleValue: 15_000_000, usefulKm: 300_000 })).toBe(90);
  });

  it("sin km no hay cuenta posible", () => {
    expect(costPerKmFrom({ yearlyCosts: 100, yearlyKm: 0 })).toBeNull();
  });

  it("ignora la amortización si falta la vida útil", () => {
    expect(costPerKmFrom({ yearlyCosts: 300, yearlyKm: 100, vehicleValue: 9_999 })).toBe(3);
  });
});
