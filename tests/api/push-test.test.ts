import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, eqValue, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({ user: null as unknown, admin: null as unknown, send: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.user) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => h.admin) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: h.send } }));

import { POST } from "@/app/api/push/test/route";

let sb: SupabaseMock;
let admin: SupabaseMock;
let subs: { data?: unknown; error?: { message: string } };

beforeEach(() => {
  subs = { data: [] };
  sb = createSupabaseMock().asUser({ id: "u1" });
  admin = createSupabaseMock({ push_subscriptions: (q) => (q.ops[0].method === "select" ? subs : {}) });
  h.user = sb;
  h.admin = admin;
  h.send.mockReset().mockResolvedValue({});
});

const call = async () => {
  const res = await POST();
  return { status: res.status, body: await res.json() };
};
const s = (id: string) => ({ id, endpoint: `https://push/${id}`, p256dh: "p", auth: "a" });

describe("POST /api/push/test", () => {
  it("401 sin sesión", async () => {
    sb.asUser(null);
    expect(await call()).toEqual({ status: 401, body: { ok: false, error: "unauthorized" } });
  });

  it("500 si falla la consulta", async () => {
    subs = { error: { message: "boom" } };
    expect(await call()).toEqual({ status: 500, body: { ok: false, error: "boom" } });
  });

  it("sin suscripciones lo informa", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true, hasSubscriptions: false, sent: 0, failed: 0 } });
  });

  it("solo busca las suscripciones del usuario actual", async () => {
    await call();
    expect(eqValue(admin.find("push_subscriptions")[0], "user_id")).toBe("u1");
  });

  it("envía a cada dispositivo la notificación de prueba", async () => {
    subs = { data: [s("a"), s("b")] };
    expect((await call()).body).toEqual({ ok: true, hasSubscriptions: true, sent: 2, failed: 0 });
    expect(JSON.parse(h.send.mock.calls[0][1])).toMatchObject({ url: "/ajustes", tag: "test-push" });
  });

  it("cuenta fallos y borra solo las suscripciones muertas", async () => {
    subs = { data: [s("a"), s("b"), s("c")] };
    h.send
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce({});
    expect((await call()).body).toEqual({ ok: true, hasSubscriptions: true, sent: 1, failed: 2 });
    expect(admin.find("push_subscriptions", "delete").map((q) => eqValue(q, "id"))).toEqual(["a"]);
  });
});
