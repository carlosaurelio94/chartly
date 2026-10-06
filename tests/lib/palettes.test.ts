import { describe, it, expect } from "vitest";
import { PALETTES, accentVars, isAccentKey, type AccentKey } from "@/lib/palettes";

const KEYS = Object.keys(PALETTES) as AccentKey[];

describe("PALETTES", () => {
  it("expone las cuatro paletas", () => {
    expect(KEYS.sort()).toEqual(["coral", "cyan", "lime", "violet"]);
  });

  it.each(KEYS)("%s tiene colores válidos", (k) => {
    const p = PALETTES[k];
    expect(p.label).not.toBe("");
    expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.accentOn).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.accentOnTint).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.accentTint).toMatch(/^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/);
  });

  // El texto sobre el acento tiene que leerse (WCAG AA para texto grande: 3:1).
  it.each(KEYS)("%s: accentOn contrasta con accent", (k) => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(PALETTES[k].accent), lum(PALETTES[k].accentOn)];
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
  });

  it.each(KEYS)("%s: el tint usa el mismo RGB que el acento", (k) => {
    const { accent, accentTint } = PALETTES[k];
    const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)).join(", ");
    expect(accentTint.startsWith(`rgba(${rgb},`)).toBe(true);
  });
});

describe("isAccentKey", () => {
  it.each(KEYS)("%s es válida", (k) => expect(isAccentKey(k)).toBe(true));
  it.each(["LIME", "red", "", null, undefined, 1, {}])("%j no es válida", (v) => {
    expect(isAccentKey(v)).toBe(false);
  });
});

describe("accentVars", () => {
  it("genera las cuatro custom properties", () => {
    expect(accentVars("violet")).toEqual({
      "--color-accent": "#8b5cf6",
      "--color-accent-on": "#ffffff",
      "--color-accent-tint": "rgba(139, 92, 246, 0.16)",
      "--color-accent-on-tint": "#a78bfa",
    });
  });

  it("cae a lima con una key inválida (dato viejo en la DB)", () => {
    expect(accentVars("naranja" as AccentKey)).toEqual(accentVars("lime"));
  });
});
