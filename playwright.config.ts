import { defineConfig, devices } from "@playwright/test";

/* E2E de humo sobre el build de producción: lo que puede verse sin cuenta
   (landing, login, protección de rutas). Lo que necesita datos está cubierto
   por los tests de Vitest con dobles de Supabase. */

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    locale: "es-AR",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
