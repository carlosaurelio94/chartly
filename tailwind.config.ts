import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        card: "#15181d",
        line: "#22262d",
        accent: "#7dd3fc",
        muted: "#8a93a0",
        danger: "#f87171",
        ok: "#4ade80",
      },
    },
  },
  plugins: [],
} satisfies Config;
