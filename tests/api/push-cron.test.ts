import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, arg, eqValue, type SupabaseMock, type Query } from "../helpers/supabase";

const h = vi.hoisted(() => ({
  admin: null as unknown,
  send: vi.fn(),
  setVapid: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => h.admin) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: h.setVapid, sendNotification: h.send } }));

const NOW = new Date("2026-10-06T15:00:00Z"); // 12:00 en Buenos Aires
const MIN = 60_000;

type Item = { id: string; user_id: string; title: string; starts_at: string; notify_minutes_before: number | null };
type Bill = { id: string; user_id: string; name: string; balance: number; currency: string; due_date: string };

let admin: SupabaseMock;
let state: {
  items: Item[];
  itemsError?: { message: string };
  subs: Record<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>;
  tz: Record<string, string>;
  bills: Bill[];
  lastWarned: Record<string, string>;
};

function setup() {
  admin = createSupabaseMock({
    agenda_items: (q) =>
      q.ops[0].method === "select" ? { data: state.items, error: state.itemsError ?? null } : {},
    push_subscriptions: (q) =>
      q.ops[0].method === "select" ? { data: state.subs[eqValue(q, "user_id") as string] ?? [] } : {},
    user_settings: (q) => {
      const tz = state.tz[eqValue(q, "user_id") as string];
      return { data: tz ? { timezone: tz } : null };
    },
    bills_with_balance: () => ({ data: state.bills }),
    bills: (q) => {
      if (q.ops[0].method !== "select") return {};
      const w = state.lastWarned[eqValue(q, "id") as string];
      return { data: w ? { last_warned_at: w } : { last_warned_at: null } };
    },
  });
  h.admin = admin;
}

const item = (over: Partial<Item> = {}): Item => ({
  id: "a1",
  user_id: "u1",
  title: "Dentista",
  starts_at: new Date(NOW.getTime() + 30 * MIN).toISOString(),
  notify_minutes_before: 30,
  ...over,
});
const sub = (id: string) => ({ id, endpoint: `https://push/${id}`, p256dh: "p", auth: "a" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", "s3cret");
  h.send.mockReset().mockResolvedValue({});
  state = { items: [], subs: {}, tz: {}, bills: [], lastWarned: {} };
  setup();
});
afterEach(() => vi.useRealTimers());

async function call(opts: { header?: string; query?: string; method?: "GET" | "POST" } = { header: "s3cret" }) {
  const { GET, POST } = await import("@/app/api/push/cron/route");
  const url = `https://chartly.app/api/push/cron${opts.query != null ? `?secret=${opts.query}` : ""}`;
  const req = new NextRequest(url, {
    method: opts.method ?? "POST",
    headers: opts.header != null ? { "x-cron-secret": opts.header } : {},
  });
  const res = await (opts.method === "GET" ? GET : POST)(req);
  return { status: res.status, body: await res.json() };
}
const payloads = () => h.send.mock.calls.map((c) => JSON.parse(c[1] as string));
const updates = (table: string) => admin.find(table, "update");

describe("autenticación", () => {
  it("rechaza sin secreto", async () => {
    const r = await call({});
    expect(r).toEqual({ status: 401, body: { ok: false, error: "unauthorized" } });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("rechaza un secreto incorrecto", async () => {
    expect((await call({ header: "nope" })).status).toBe(401);
  });

  it("rechaza todo si CRON_SECRET no está configurado", async () => {
    vi.stubEnv("CRON_SECRET", undefined as unknown as string);
    expect((await call({ header: "" })).status).toBe(401);
    expect((await call({})).status).toBe(401);
  });

  it("acepta el secreto por header o por query string, con GET o POST", async () => {
    expect((await call({ header: "s3cret" })).status).toBe(200);
    expect((await call({ query: "s3cret", method: "GET" })).status).toBe(200);
  });
});

describe("recordatorios de agenda", () => {
  it("devuelve 500 si falla la consulta", async () => {
    state.itemsError = { message: "db down" };
    expect(await call()).toEqual({ status: 500, body: { ok: false, error: "db down" } });
  });

  it("filtra en la consulta: sin avisar, con aviso, no hechos, próximas 24 h", async () => {
    await call();
    const [q] = admin.find("agenda_items", "select");
    expect(q.ops).toEqual(
      expect.arrayContaining([
        { method: "is", args: ["notified_at", null] },
        { method: "not", args: ["notify_minutes_before", "is", null] },
        { method: "eq", args: ["done", false] },
        { method: "lte", args: ["starts_at", new Date(NOW.getTime() + 24 * 60 * MIN).toISOString()] },
      ]),
    );
  });

  it("avisa cuando llegó la hora del aviso y marca notified_at", async () => {
    state.items = [item()];
    state.subs.u1 = [sub("s1"), sub("s2")];
    const r = await call();
    expect(r.body).toEqual({ ok: true, due: 1, sent: 2, failed: 0 });
    expect(h.send).toHaveBeenCalledWith({ endpoint: "https://push/s1", keys: { p256dh: "p", auth: "a" } }, expect.any(String));
    expect(payloads()[0]).toEqual({ title: "Dentista", body: "En 30 min · 12:30", url: "/agenda", tag: "agenda-a1" });
    const [u] = updates("agenda_items");
    expect(eqValue(u, "id")).toBe("a1");
    expect(arg(u, "update")).toEqual({ notified_at: NOW.toISOString() });
  });

  it("todavía no avisa si falta para la hora del aviso", async () => {
    state.items = [item({ starts_at: new Date(NOW.getTime() + 31 * MIN).toISOString() })];
    expect((await call()).body.due).toBe(0);
    expect(updates("agenda_items")).toHaveLength(0);
  });

  it("avisa hasta 5 minutos después de empezado, no más", async () => {
    state.items = [
      item({ id: "ok", starts_at: new Date(NOW.getTime() - 5 * MIN).toISOString() }),
      item({ id: "tarde", starts_at: new Date(NOW.getTime() - 5 * MIN - 1000).toISOString() }),
    ];
    const r = await call();
    expect(r.body.due).toBe(1);
    expect(updates("agenda_items").map((u) => eqValue(u, "id"))).toEqual(["ok"]);
  });

  it("aviso con 0 minutos → 'Es ahora'", async () => {
    state.items = [item({ notify_minutes_before: 0, starts_at: NOW.toISOString() })];
    state.subs.u1 = [sub("s1")];
    await call();
    expect(payloads()[0].body).toBe("Es ahora");
  });

  it("si ya empezó → 'Empezó ahora'", async () => {
    state.items = [item({ notify_minutes_before: 10, starts_at: new Date(NOW.getTime() - 2 * MIN).toISOString() })];
    state.subs.u1 = [sub("s1")];
    await call();
    expect(payloads()[0].body).toBe("Empezó ahora");
  });

  it("muestra la hora en la zona horaria del usuario y la cachea por usuario", async () => {
    state.tz.u1 = "Europe/Madrid";
    state.items = [item({ id: "a" }), item({ id: "b" })];
    state.subs.u1 = [sub("s1")];
    await call();
    expect(payloads().map((p) => p.body)).toEqual(["En 30 min · 17:30", "En 30 min · 17:30"]);
    expect(admin.find("user_settings")).toHaveLength(1);
  });

  it("sin suscripciones igual marca el aviso como enviado", async () => {
    state.items = [item()];
    const r = await call();
    expect(r.body).toEqual({ ok: true, due: 1, sent: 0, failed: 0 });
    expect(updates("agenda_items")).toHaveLength(1);
  });

  it.each([404, 410])("borra la suscripción si el push service responde %i", async (code) => {
    state.items = [item()];
    state.subs.u1 = [sub("muerta"), sub("viva")];
    h.send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: code }));
    const r = await call();
    expect(r.body).toMatchObject({ sent: 1, failed: 1 });
    const del = admin.find("push_subscriptions", "delete");
    expect(del.map((d) => eqValue(d, "id"))).toEqual(["muerta"]);
  });

  it("no borra la suscripción ante errores transitorios", async () => {
    state.items = [item()];
    state.subs.u1 = [sub("s1")];
    h.send.mockRejectedValueOnce(Object.assign(new Error("5xx"), { statusCode: 503 }));
    const r = await call();
    expect(r.body).toMatchObject({ sent: 0, failed: 1 });
    expect(admin.find("push_subscriptions", "delete")).toHaveLength(0);
  });
});

describe("avisos de vencimientos", () => {
  const bill = (over: Partial<Bill> = {}): Bill => ({
    id: "b1", user_id: "u1", name: "Luz", balance: 5000, currency: "ARS", due_date: "2026-10-08", ...over,
  });

  it("consulta gastos activos con saldo que vencen en los próximos 3 días", async () => {
    await call();
    const [q] = admin.find("bills_with_balance");
    expect(q.ops).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["archived", false] },
        { method: "eq", args: ["kind", "expense"] },
        { method: "gt", args: ["balance", 0] },
        { method: "gte", args: ["due_date", "2026-10-06"] },
        { method: "lte", args: ["due_date", "2026-10-09"] },
      ]),
    );
  });

  it.each([
    ["2026-10-06", "Vence hoy · 5000 ARS"],
    ["2026-10-07", "Vence mañana · 5000 ARS"],
    ["2026-10-08", "Vence en 2 días · 5000 ARS"],
  ])("vencimiento %s → %j", async (due_date, body) => {
    state.bills = [bill({ due_date })];
    state.subs.u1 = [sub("s1")];
    await call();
    expect(payloads()[0]).toEqual({ title: "Cuenta por pagar: Luz", body, url: "/cuentas/b1", tag: "bill-b1" });
  });

  it("marca last_warned_at después de avisar", async () => {
    state.bills = [bill()];
    state.subs.u1 = [sub("s1")];
    await call();
    const [u] = updates("bills");
    expect(eqValue(u, "id")).toBe("b1");
    expect(arg(u, "update")).toEqual({ last_warned_at: NOW.toISOString() });
  });

  it("no avisa dos veces el mismo día", async () => {
    state.bills = [bill()];
    state.subs.u1 = [sub("s1")];
    state.lastWarned.b1 = new Date(NOW.getTime() - 23 * 60 * MIN).toISOString();
    await call();
    expect(h.send).not.toHaveBeenCalled();
    expect(updates("bills")).toHaveLength(0);
  });

  it("vuelve a avisar pasadas 24 h", async () => {
    state.bills = [bill()];
    state.subs.u1 = [sub("s1")];
    state.lastWarned.b1 = new Date(NOW.getTime() - 25 * 60 * MIN).toISOString();
    await call();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("los avisos de vencimientos no cuentan en sent/failed de la agenda", async () => {
    state.bills = [bill()];
    state.subs.u1 = [sub("s1")];
    expect((await call()).body).toEqual({ ok: true, due: 0, sent: 0, failed: 0 });
  });

  it("un fallo de push en un vencimiento no corta el cron", async () => {
    state.bills = [bill({ id: "b1" }), bill({ id: "b2" })];
    state.subs.u1 = [sub("s1")];
    h.send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    const r = await call();
    expect(r.status).toBe(200);
    expect(updates("bills").map((u: Query) => eqValue(u, "id"))).toEqual(["b1", "b2"]);
    expect(admin.find("push_subscriptions", "delete")).toHaveLength(1);
  });
});
