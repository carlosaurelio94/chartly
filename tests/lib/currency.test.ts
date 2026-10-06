import { describe, it, expect } from "vitest";
import { PRESET_CURRENCIES, currencyMeta, isPresetCurrency } from "@/lib/currency";

describe("PRESET_CURRENCIES", () => {
  it("no tiene códigos repetidos", () => {
    const codes = PRESET_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("usa códigos ISO 4217 que Intl reconoce", () => {
    for (const c of PRESET_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(() => new Intl.NumberFormat(c.locale, { style: "currency", currency: c.code })).not.toThrow();
    }
  });

  it("todos tienen label, símbolo y locale", () => {
    for (const c of PRESET_CURRENCIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.symbol.length).toBeGreaterThan(0);
      expect(Intl.NumberFormat.supportedLocalesOf([c.locale])).toHaveLength(1);
    }
  });
});

describe("isPresetCurrency", () => {
  it.each(["ARS", "VES", "USD", "EUR", "CLP"])("%s es preset", (code) => {
    expect(isPresetCurrency(code)).toBe(true);
  });

  it.each(["MXN", "usd", "", "BTC"])("%j no es preset", (code) => {
    expect(isPresetCurrency(code)).toBe(false);
  });
});

describe("currencyMeta", () => {
  it("devuelve la metadata del preset", () => {
    expect(currencyMeta("ARS")).toEqual({ code: "ARS", label: "Peso argentino", symbol: "$", locale: "es-AR" });
  });

  it("arma un fallback para monedas desconocidas", () => {
    expect(currencyMeta("MXN")).toEqual({ code: "MXN", label: "MXN", symbol: "MXN", locale: "en-US" });
  });
});
