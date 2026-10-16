import { test, expect } from "@playwright/test";

test("la landing carga y lleva al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Chartly/i);
  const noHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(noHorizontalScroll).toBe(true);
});

test("sin sesión, las pantallas de la app mandan al login", async ({ page }) => {
  for (const path of ["/hoy", "/cuentas", "/jornada", "/mas"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("el login ofrece Google y enlace por email", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  await page.getByText("O usar enlace por email").click();
  await expect(page.getByPlaceholder("tu@correo.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviarme enlace" })).toBeVisible();
});

test("la guía de instalación es pública", async ({ page }) => {
  const res = await page.goto("/instalar");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/instalar$/);
});

test("/auth/callback no redirige a otro sitio", async ({ page }) => {
  await page.goto("/auth/callback?next=//evil.example/x");
  expect(new URL(page.url()).hostname).toBe("localhost");
});

test("/api/log acepta reportes sin sesión", async ({ request }) => {
  const res = await request.post("/api/log", { data: { message: "e2e" } });
  expect(res.status()).toBe(204);
});
