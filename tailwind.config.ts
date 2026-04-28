import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        card: "var(--color-card)",
        line: "var(--color-line)",
        accent: "var(--color-accent)",
        muted: "var(--color-muted)",
        danger: "var(--color-danger)",
        ok: "var(--color-ok)",
        fg: "var(--color-fg)",
      },
    },
  },
  plugins: [],
} satisfies Config;
