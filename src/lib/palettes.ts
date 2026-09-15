/* Chartly · paletas de acento seleccionables por el usuario en Ajustes.
   Se leen desde user_settings.theme_accent (default "lime"). Cada paleta
   inyecta las CSS custom properties --color-accent* en el <body> del app. */

export type AccentKey = "lime" | "violet" | "coral" | "cyan";

export const PALETTES: Record<
  AccentKey,
  { label: string; accent: string; accentOn: string; accentTint: string; accentOnTint: string }
> = {
  lime: {
    label: "Lima",
    accent: "#c3fc4a",
    accentOn: "#0a1100",
    accentTint: "rgba(195, 252, 74, 0.14)",
    accentOnTint: "#c3fc4a",
  },
  violet: {
    label: "Violeta",
    accent: "#8b5cf6",
    accentOn: "#ffffff",
    accentTint: "rgba(139, 92, 246, 0.16)",
    accentOnTint: "#a78bfa",
  },
  coral: {
    label: "Coral",
    accent: "#ff5b6e",
    accentOn: "#ffffff",
    accentTint: "rgba(255, 91, 110, 0.14)",
    accentOnTint: "#ff8a96",
  },
  cyan: {
    label: "Cian",
    accent: "#22d3ee",
    accentOn: "#062632",
    accentTint: "rgba(34, 211, 238, 0.14)",
    accentOnTint: "#67e8f9",
  },
};

export function isAccentKey(x: unknown): x is AccentKey {
  return x === "lime" || x === "violet" || x === "coral" || x === "cyan";
}

export function accentVars(key: AccentKey): React.CSSProperties {
  const p = PALETTES[key] ?? PALETTES.lime;
  return {
    ["--color-accent" as string]: p.accent,
    ["--color-accent-on" as string]: p.accentOn,
    ["--color-accent-tint" as string]: p.accentTint,
    ["--color-accent-on-tint" as string]: p.accentOnTint,
  };
}
