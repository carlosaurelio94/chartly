import { defineConfig } from "vitest/config";
import path from "node:path";

// Zona horaria fija: runway, fechas y notificaciones dependen del día local.
// Argentina no tiene horario de verano, así que los tests no se mueven con DST.
process.env.TZ = "America/Argentina/Buenos_Aires";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**", "src/app/auth/**", "src/middleware.ts", "src/components/ui/Money.tsx", "src/components/ui/CircleProgress.tsx"],
      reporter: ["text", "html"],
    },
  },
});
