import { describe, it, expect } from "vitest";
import { budgetLevel, budgetRows, convertPayment, spendByTopCategory, topCategory, type BudgetCategory, type SpendPayment } from "@/lib/budgets";

const rates = { USD: 1, ARS: 1000 };
const cats: BudgetCategory[] = [
  { id: "casa", name: "Casa", color: "#111111", parent_id: null, monthly_budget: 500_000 },
  { id: "luz", name: "Luz", color: "#222222", parent_id: "casa" },
  { id: "comida", name: "Comida", color: "#333333", parent_id: null, monthly_budget: 100_000 },
  { id: "ocio", name: "Ocio", color: "#444444", parent_id: null, monthly_budget: null },
];

const pay = (amount: number, category_id: string | null, over: Partial<SpendPayment> = {}): SpendPayment => ({
  amount, paid_at: "2026-10-10T15:00:00Z", converted_amount: null, converted_currency: null,
  bills: { kind: "expense", currency: "ARS", category_id, archived: false },
  ...over,
});

describe("topCategory", () => {
  const byId = new Map(cats.map((c) => [c.id, c]));
  it("sube hasta la categoría madre", () => expect(topCategory("luz", byId)?.id).toBe("casa"));
  it("una categoría de arriba es su propia madre", () => expect(topCategory("comida", byId)?.id).toBe("comida"));
  it("sin categoría o inexistente → null", () => {
    expect(topCategory(null, byId)).toBeNull();
    expect(topCategory("nope", byId)).toBeNull();
  });
  it("no se cuelga con un ciclo en los datos", () => {
    const loop = new Map<string, BudgetCategory>([
      ["a", { id: "a", name: "A", color: "", parent_id: "b" }],
      ["b", { id: "b", name: "B", color: "", parent_id: "a" }],
    ]);
    expect(["a", "b"]).toContain(topCategory("a", loop)?.id);
  });
});

describe("convertPayment", () => {
  it("usa el monto convertido que cargó el usuario", () => {
    expect(convertPayment(pay(10, null, { converted_amount: 12_000, converted_currency: "ARS" }), "ARS", rates)).toBe(12_000);
  });
  it("si no, convierte desde la moneda de la cuenta", () => {
    expect(convertPayment(pay(10, null, { bills: { kind: "expense", currency: "USD", category_id: null, archived: false } }), "ARS", rates)).toBe(10_000);
  });
  it("sin tasa no inventa", () => {
    expect(convertPayment(pay(10, null, { bills: { kind: "expense", currency: "BRL", category_id: null, archived: false } }), "ARS", rates)).toBeNull();
  });
});

describe("spendByTopCategory", () => {
  it("suma subcategorías a la madre y solo desde el inicio del mes", () => {
    const m = spendByTopCategory(
      [pay(100_000, "casa"), pay(50_000, "luz"), pay(30_000, "comida"), pay(999, "casa", { paid_at: "2026-09-30T23:00:00Z" })],
      cats, "ARS", rates, "2026-10-01T03:00:00Z",
    );
    expect(m.get("casa")).toBe(150_000);
    expect(m.get("comida")).toBe(30_000);
  });

  it("ignora ingresos, archivados y pagos sin categoría", () => {
    const m = spendByTopCategory(
      [
        pay(1, "casa", { bills: { kind: "income", currency: "ARS", category_id: "casa", archived: false } }),
        pay(1, "casa", { bills: { kind: "expense", currency: "ARS", category_id: "casa", archived: true } }),
        pay(1, null),
      ],
      cats, "ARS", rates, "2026-10-01T00:00:00Z",
    );
    expect(m.size).toBe(0);
  });
});

describe("budgetLevel", () => {
  it.each([
    [0, 100, "ok"],
    [79, 100, "ok"],
    [80, 100, "warn"],
    [100, 100, "warn"],
    [100.01, 100, "over"],
    [50, 0, "ok"],
  ] as const)("%d de %d → %s", (spent, budget, level) => {
    expect(budgetLevel(spent, budget)).toBe(level);
  });
});

describe("budgetRows", () => {
  it("solo categorías madre con tope, ordenadas por % usado", () => {
    const rows = budgetRows(cats, new Map([["casa", 100_000], ["comida", 90_000], ["ocio", 1]]));
    expect(rows.map((r) => [r.id, Math.round(r.pct), r.level])).toEqual([
      ["comida", 90, "warn"],
      ["casa", 20, "ok"],
    ]);
  });
});
