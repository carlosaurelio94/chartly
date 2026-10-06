import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  session: null as unknown,
  cookieOpts: null as null | {
    getAll: () => { name: string; value: string }[];
    setAll: (c: { name: string; value: string; options?: object }[]) => void;
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookies: typeof h.cookieOpts }) => {
    h.cookieOpts = opts.cookies;
    return { auth: { getSession: async () => ({ data: { session: h.session } }) } };
  }),
}));

import { middleware, config } from "@/middleware";

beforeEach(() => {
  h.session = null;
  h.cookieOpts = null;
});

const req = (path: string) => new NextRequest(`https://chartly.app${path}`);
const loggedIn = () => (h.session = { user: { id: "u1" } });
const redirectedTo = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};

describe("middleware · sin sesión", () => {
  it.each(["/hoy", "/cuentas", "/cuentas/123", "/ajustes", "/capturar/abc", "/api/share"])(
    "%s redirige al login",
    async (path) => {
      const res = await middleware(req(path));
      expect(res.status).toBe(307);
      expect(redirectedTo(res)).toBe("/login");
    },
  );

  it("conserva la query string al redirigir", async () => {
    expect(redirectedTo(await middleware(req("/hoy?tab=1")))).toBe("/login?tab=1");
  });

  it.each(["/", "/instalar", "/como-funciona", "/como-funciona/x", "/login", "/auth/callback"])(
    "%s es pública",
    async (path) => {
      const res = await middleware(req(path));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("no confunde rutas que empiezan parecido a una pública", async () => {
    expect(redirectedTo(await middleware(req("/instalar-algo")))).toBe("/login");
  });
});

describe("middleware · con sesión", () => {
  beforeEach(loggedIn);

  it("/login manda a /hoy", async () => {
    expect(redirectedTo(await middleware(req("/login")))).toBe("/hoy");
  });

  it.each(["/hoy", "/", "/cuentas/1", "/auth/callback"])("%s pasa", async (path) => {
    expect((await middleware(req(path))).headers.get("location")).toBeNull();
  });
});

describe("middleware · cookies", () => {
  it("le da a Supabase las cookies del request", async () => {
    const r = new NextRequest("https://chartly.app/hoy", { headers: { cookie: "sb-a=1; otra=2" } });
    await middleware(r);
    expect(h.cookieOpts!.getAll().map((c) => c.name).sort()).toEqual(["otra", "sb-a"]);
  });

  it("propaga a la respuesta las cookies refrescadas", async () => {
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockImplementationOnce(((_u: string, _k: string, opts: { cookies: NonNullable<typeof h.cookieOpts> }) => ({
      auth: {
        getSession: async () => {
          opts.cookies.setAll([{ name: "sb-token", value: "nuevo", options: { httpOnly: true } }]);
          return { data: { session: { user: { id: "u1" } } } };
        },
      },
    })) as never);
    const res = await middleware(req("/hoy"));
    expect(res.cookies.get("sb-token")?.value).toBe("nuevo");
  });
});

describe("middleware · matcher", () => {
  const re = new RegExp(`^${config.matcher[0]}$`);

  it.each(["/hoy", "/", "/api/share", "/api/push/test", "/login"])("corre en %s", (p) => {
    expect(re.test(p)).toBe(true);
  });

  it.each([
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/sw.js",
    "/icons/icon-192.png",
    "/api/push/cron",
  ])("no corre en %s", (p) => {
    expect(re.test(p)).toBe(false);
  });
});
