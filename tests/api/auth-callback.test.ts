import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.sb) }));

import { GET } from "@/app/auth/callback/route";

let sb: SupabaseMock;
beforeEach(() => {
  sb = createSupabaseMock();
  h.sb = sb;
});

const call = (qs: string) => GET(new NextRequest(`https://chartly.app/auth/callback${qs}`));

describe("GET /auth/callback", () => {
  it("canjea el código y va a /hoy por defecto", async () => {
    const res = await call("?code=abc");
    expect(sb.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://chartly.app/hoy");
  });

  it("respeta ?next con una ruta interna", async () => {
    const res = await call("?code=abc&next=%2Fproyectos%2F42");
    expect(res.headers.get("location")).toBe("https://chartly.app/proyectos/42");
  });

  it("sin código no intenta canjear", async () => {
    const res = await call("");
    expect(sb.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://chartly.app/hoy");
  });

  it("conserva query y hash de una ruta interna", async () => {
    const res = await call(`?next=${encodeURIComponent("/cuentas?tab=2#top")}`);
    expect(res.headers.get("location")).toBe("https://chartly.app/cuentas?tab=2#top");
  });

  // Regresión (open redirect): `new URL(next, origin)` aceptaba URLs absolutas
  // y protocol-relative.
  it.each([
    "https://evil.com/x",
    "//evil.com/x",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/%2F%2Fevil.com",
  ])("no redirige fuera del sitio con next=%s", async (next) => {
    const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://chartly.app");
  });

  it("un next externo cae en /hoy", async () => {
    const res = await call(`?next=${encodeURIComponent("//evil.com")}`);
    expect(res.headers.get("location")).toBe("https://chartly.app/hoy");
  });
});
