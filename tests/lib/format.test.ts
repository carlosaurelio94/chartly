import { describe, it, expect, vi, afterEach } from "vitest";
import { capitalizeFirst, daysUntil, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";

// Intl mete espacios duros (U+00A0 / U+202F) entre sigla y número.
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("fmtMoney", () => {
  it("muestra la sigla ISO en vez del símbolo", () => {
    expect(norm(fmtMoney(1500, "USD"))).toBe("USD 1,500");
  });

  it("usa el locale de la moneda (ARS: punto de miles, coma decimal)", () => {
    expect(norm(fmtMoney(1234567.5, "ARS"))).toBe("ARS 1.234.567,50");
  });

  it("omite los centavos cuando el monto es entero", () => {
    expect(norm(fmtMoney(1000, "ARS"))).toBe("ARS 1.000");
  });

  it("muestra dos decimales cuando hay centavos", () => {
    expect(norm(fmtMoney(10.5, "USD"))).toBe("USD 10.50");
  });

  it("redondea a 2 decimales", () => {
    expect(norm(fmtMoney(10.129, "USD"))).toBe("USD 10.13");
  });

  it("ignora residuos de punto flotante menores a medio centavo", () => {
    expect(norm(fmtMoney(0.1 + 0.2 - 0.3 + 5, "USD"))).toBe("USD 5");
  });

  it("acepta strings numéricos (como vienen de Postgres numeric)", () => {
    expect(norm(fmtMoney("2500.75", "USD"))).toBe("USD 2,500.75");
  });

  it("trata null y undefined como 0", () => {
    expect(norm(fmtMoney(null, "USD"))).toBe("USD 0");
    expect(norm(fmtMoney(undefined, "USD"))).toBe("USD 0");
  });

  it("formatea negativos", () => {
    expect(norm(fmtMoney(-42, "USD"))).toMatch(/^-USD 42$|^USD -42$/);
  });

  it("usa USD por defecto", () => {
    expect(norm(fmtMoney(1))).toBe("USD 1");
  });

  it("formatea monedas fuera del preset con locale en-US", () => {
    expect(norm(fmtMoney(1000, "MXN"))).toBe("MXN 1,000");
  });

  it("cae al fallback manual si Intl rechaza el código de moneda", () => {
    expect(norm(fmtMoney(1234.5, "USDT"))).toBe("1,234.5 USDT");
  });
});

describe("fmtDate / fmtDateTime", () => {
  it("devuelve un guion largo para valores vacíos", () => {
    for (const v of [null, undefined, ""]) {
      expect(fmtDate(v)).toBe("—");
      expect(fmtDateTime(v)).toBe("—");
    }
  });

  it("formatea fecha en español", () => {
    const out = fmtDate(new Date(2026, 0, 5));
    expect(out).toMatch(/05/);
    expect(out.toLowerCase()).toMatch(/ene/);
    expect(out).toMatch(/2026/);
  });

  it("acepta strings ISO", () => {
    expect(fmtDate("2026-03-15T12:00:00")).toMatch(/15/);
  });

  it("fmtDateTime incluye la hora", () => {
    const out = fmtDateTime(new Date(2026, 5, 1, 9, 7));
    expect(out).toMatch(/09:07/);
    expect(out).not.toMatch(/2026/);
  });
});

describe("daysUntil", () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("devuelve null sin fecha", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("")).toBeNull();
  });

  it("0 para hoy, aunque sea de noche", () => {
    at("2026-10-06T23:59:00");
    expect(daysUntil("2026-10-06")).toBe(0);
  });

  it("cuenta días hacia adelante y hacia atrás", () => {
    at("2026-10-06T08:00:00");
    expect(daysUntil("2026-10-07")).toBe(1);
    expect(daysUntil("2026-10-31")).toBe(25);
    expect(daysUntil("2026-10-01")).toBe(-5);
  });

  it("cruza fin de año", () => {
    at("2026-12-30T10:00:00");
    expect(daysUntil("2027-01-02")).toBe(3);
  });
});

describe("capitalizeFirst", () => {
  it.each([
    ["hola mundo", "Hola mundo"],
    ["ñandú", "Ñandú"],
    ["élite", "Élite"],
    ["Ya", "Ya"],
    ["1abc", "1abc"],
    ["", ""],
  ])("%j → %j", (input, out) => {
    expect(capitalizeFirst(input)).toBe(out);
  });
});
