import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, arg, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({
  sb: null as unknown,
  afterCbs: [] as (() => Promise<void>)[],
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.sb) }));
vi.mock("next/server", () => ({ after: (cb: () => Promise<void>) => h.afterCbs.push(cb) }));

import { getRates } from "@/lib/fx-server";

const NOW = new Date("2026-10-06T12:00:00Z");
const HOUR = 3_600_000;

let sb: SupabaseMock;
let fetchMock: ReturnType<typeof vi.fn>;

function cached(rows: { code: string; rate: number; ageH: number }[]) {
  sb = createSupabaseMock({
    fx_rates: (q) =>
      q.ops[0].method === "select"
        ? {
            data: rows.map((r) => ({
              code: r.code,
              rate_per_usd: String(r.rate),
              fetched_at: new Date(NOW.getTime() - r.ageH * HOUR).toISOString(),
            })),
          }
        : {},
  });
  h.sb = sb;
}

function apiReturns(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.afterCbs = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.useRealTimers());

describe("getRates", () => {
  it("con cache fresco lo devuelve sin salir a la red", async () => {
    cached([{ code: "USD", rate: 1, ageH: 1 }, { code: "ARS", rate: 1000, ageH: 2 }]);
    expect(await getRates()).toEqual({ USD: 1, ARS: 1000 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.afterCbs).toHaveLength(0);
  });

  it("con cache vencido responde lo cacheado y refresca después de responder", async () => {
    cached([{ code: "USD", rate: 1, ageH: 7 }, { code: "ARS", rate: 900, ageH: 7 }]);
    apiReturns({ result: "success", rates: { USD: 1, ARS: 1100 } });

    expect(await getRates()).toEqual({ USD: 1, ARS: 900 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.afterCbs).toHaveLength(1);

    await h.afterCbs[0]();
    expect(fetchMock).toHaveBeenCalledWith("https://open.er-api.com/v6/latest/USD", expect.anything());
    const [upsert] = sb.find("fx_rates", "upsert");
    expect(arg(upsert, "upsert")).toEqual([
      { code: "USD", rate_per_usd: 1, fetched_at: NOW.toISOString() },
      { code: "ARS", rate_per_usd: 1100, fetched_at: NOW.toISOString() },
    ]);
    expect(arg(upsert, "upsert", 1)).toEqual({ onConflict: "code" });
  });

  it("decide frescura por la fila más reciente", async () => {
    cached([{ code: "USD", rate: 1, ageH: 30 }, { code: "ARS", rate: 1000, ageH: 1 }]);
    await getRates();
    expect(h.afterCbs).toHaveLength(0);
  });

  it("el refresco en segundo plano no explota si la API cae", async () => {
    cached([{ code: "USD", rate: 1, ageH: 10 }]);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await getRates();
    await expect(h.afterCbs[0]()).resolves.toBeUndefined();
    expect(sb.find("fx_rates", "upsert")).toHaveLength(0);
  });

  it("sin cache espera a la API y guarda el resultado", async () => {
    cached([]);
    apiReturns({ result: "success", rates: { USD: 1, EUR: 0.9 } });
    expect(await getRates()).toEqual({ USD: 1, EUR: 0.9 });
    expect(sb.find("fx_rates", "upsert")).toHaveLength(1);
  });

  it.each([
    ["HTTP 500", () => apiReturns({}, 500)],
    ["result != success", () => apiReturns({ result: "error", rates: { USD: 1 } })],
    ["sin rates", () => apiReturns({ result: "success" })],
    ["error de red", () => fetchMock.mockRejectedValue(new Error("offline"))],
  ])("sin cache y con la API caída (%s) devuelve {}", async (_name, setup) => {
    cached([]);
    setup();
    expect(await getRates()).toEqual({});
    expect(sb.find("fx_rates", "upsert")).toHaveLength(0);
  });
});
