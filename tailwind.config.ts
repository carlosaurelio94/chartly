import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        card: "var(--color-card)",
        "card-2": "var(--color-card-2)",
        line: "var(--color-line)",
        accent: "var(--color-accent)",
        "accent-on": "var(--color-accent-on)",
        "accent-tint": "var(--color-accent-tint)",
        "accent-on-tint": "var(--color-accent-on-tint)",
        muted: "var(--color-muted)",
        danger: "var(--color-danger)",
        ok: "var(--color-ok)",
        warning: "var(--color-warning)",
        fg: "var(--color-fg)",
      },
      borderRadius: {
        card: "28px",
        "card-sm": "22px",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "-apple-system", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
