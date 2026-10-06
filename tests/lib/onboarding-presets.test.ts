import { describe, it, expect } from "vitest";
import { ALL_REGIONS, detectRegionFromLocale, presetsFor, type Region } from "@/lib/onboarding-presets";

const REGIONS: Region[] = ["ar", "mx", "es", "us", "br", "ve", "cl", "co", "pe", "default"];

describe("detectRegionFromLocale", () => {
  it.each([
    ["es-AR", "ar"],
    ["es-ar", "ar"],
    ["es-MX", "mx"],
    ["es-ES", "es"],
    ["ca-ES", "es"],
    ["ca", "es"],
    ["es-VE", "ve"],
    ["es-CL", "cl"],
    ["es-CO", "co"],
    ["es-PE", "pe"],
    ["pt-BR", "br"],
    ["pt-PT", "br"],
    ["en-US", "us"],
    ["en-GB", "us"],
    ["es", "default"],
    ["es-419", "default"],
    ["fr-FR", "default"],
    ["", "default"],
  ] as const)("%j → %s", (locale, region) => {
    expect(detectRegionFromLocale(locale)).toBe(region);
  });

  it("null y undefined → default", () => {
    expect(detectRegionFromLocale(null)).toBe("default");
    expect(detectRegionFromLocale(undefined)).toBe("default");
  });
});

describe("presetsFor", () => {
  it.each(REGIONS)("%s tiene un preset coherente", (region) => {
    const p = presetsFor(region);
    expect(p.currency).toMatch(/^[A-Z]{3}$/);
    expect(["es", "en", "pt"]).toContain(p.language);
    expect(p.bills.length).toBeGreaterThan(0);
    expect(p.platforms.length).toBeGreaterThan(0);
  });

  it.each(REGIONS)("%s: bills con nombre único, color hex y día de vencimiento válido", (region) => {
    const { bills } = presetsFor(region);
    const names = bills.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const b of bills) {
      expect(b.name.trim()).not.toBe("");
      expect(b.category.trim()).not.toBe("");
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
      if (b.due_day != null) {
        expect(Number.isInteger(b.due_day)).toBe(true);
        expect(b.due_day).toBeGreaterThanOrEqual(1);
        expect(b.due_day).toBeLessThanOrEqual(28);
      }
    }
  });

  it.each(REGIONS)("%s: misma categoría → mismo color", (region) => {
    const byCat = new Map<string, Set<string>>();
    for (const b of presetsFor(region).bills) {
      byCat.set(b.category, (byCat.get(b.category) ?? new Set()).add(b.color));
    }
    for (const colors of byCat.values()) expect(colors.size).toBe(1);
  });

  it("monedas esperadas por país", () => {
    expect(presetsFor("ar").currency).toBe("ARS");
    expect(presetsFor("mx").currency).toBe("MXN");
    expect(presetsFor("es").currency).toBe("EUR");
    expect(presetsFor("us").currency).toBe("USD");
  });

  it("una región desconocida cae al default", () => {
    expect(presetsFor("xx" as Region)).toBe(presetsFor("default"));
  });

  it("no comparte referencias mutables de bills entre regiones", () => {
    const a = presetsFor("ar").bills.find((b) => b.name === "Netflix")!;
    const us = presetsFor("default").bills.find((b) => b.name === "Netflix")!;
    expect(a).not.toBe(us);
  });
});

describe("ALL_REGIONS", () => {
  it("lista cada región exactamente una vez", () => {
    expect(ALL_REGIONS.map((r) => r.region).sort()).toEqual([...REGIONS].sort());
  });

  it("deja 'Otro / Internacional' al final", () => {
    expect(ALL_REGIONS.at(-1)?.region).toBe("default");
  });

  it("todas tienen label y bandera", () => {
    for (const r of ALL_REGIONS) {
      expect(r.label).not.toBe("");
      expect(r.flag).not.toBe("");
    }
  });
});
