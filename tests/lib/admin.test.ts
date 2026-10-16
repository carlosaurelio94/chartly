import { describe, it, expect, vi } from "vitest";
import { isAdminEmail } from "@/lib/admin";

describe("isAdminEmail", () => {
  it("sin ADMIN_EMAIL no hay admin", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    expect(isAdminEmail("cualquiera@mail.com")).toBe(false);
  });

  it("compara sin importar mayúsculas ni espacios", () => {
    vi.stubEnv("ADMIN_EMAIL", " Admin@Example.com ");
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("ADMIN@EXAMPLE.COM ")).toBe(true);
  });

  it("otro mail o sin mail no es admin", () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    expect(isAdminEmail("otro@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
