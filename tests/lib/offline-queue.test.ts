import { describe, it, expect, vi } from "vitest";
import { enqueue, flushQueue, isNetworkError, readQueue, type FlushClient, type KV } from "@/lib/offline-queue";

function memStore(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function client(results: ({ error: { message: string } | null } | Error)[]) {
  const calls: { table: string; row: Record<string, unknown> }[] = [];
  const c: FlushClient = {
    from: (table) => ({
      upsert: (row) => {
        calls.push({ table, row });
        const r = results.shift() ?? { error: null };
        return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
      },
    }),
  };
  return { c, calls };
}

describe("enqueue / readQueue", () => {
  it("guarda y lee en orden", () => {
    const s = memStore();
    enqueue("payments", { id: "a", amount: 1 }, s);
    enqueue("gig_entries", { id: "b", amount: 2 }, s);
    expect(readQueue(s).map((p) => [p.table, p.id])).toEqual([["payments", "a"], ["gig_entries", "b"]]);
  });

  it("el mismo id no se duplica", () => {
    const s = memStore();
    enqueue("payments", { id: "a", amount: 1 }, s);
    enqueue("payments", { id: "a", amount: 5 }, s);
    expect(readQueue(s)).toHaveLength(1);
    expect(readQueue(s)[0].row.amount).toBe(5);
  });

  it("sin almacenamiento o con basura no rompe", () => {
    expect(readQueue(null)).toEqual([]);
    const s = memStore();
    s.setItem("chartly_offline_queue_v1", "{no es json");
    expect(readQueue(s)).toEqual([]);
  });
});

describe("isNetworkError", () => {
  it.each(["TypeError: Failed to fetch", "fetch failed", "NetworkError when attempting to fetch resource.", "Load failed"])("%s es de red", (m) => {
    expect(isNetworkError(new Error(m), true)).toBe(true);
  });
  it("un rechazo de la base no es de red", () => {
    expect(isNetworkError({ message: "new row violates row-level security policy" }, true)).toBe(false);
  });
  it("sin conexión todo cuenta como de red", () => {
    expect(isNetworkError({ message: "lo que sea" }, false)).toBe(true);
  });
});

describe("flushQueue", () => {
  it("manda todo con upsert idempotente por id y vacía la cola", async () => {
    const s = memStore();
    enqueue("payments", { id: "a", amount: 1 }, s);
    enqueue("gig_entries", { id: "b", amount: 2 }, s);
    const { c, calls } = client([]);
    expect(await flushQueue(c, { store: s })).toEqual({ sent: 2, dropped: 0, kept: 0 });
    expect(calls.map((x) => x.table)).toEqual(["payments", "gig_entries"]);
    expect(readQueue(s)).toEqual([]);
  });

  it("si falla la red, lo deja para el próximo intento", async () => {
    const s = memStore();
    enqueue("payments", { id: "a", amount: 1 }, s);
    const { c } = client([new Error("Failed to fetch")]);
    expect(await flushQueue(c, { store: s })).toEqual({ sent: 0, dropped: 0, kept: 1 });
    expect(readQueue(s)).toHaveLength(1);
  });

  it("si la base lo rechaza, lo descarta para no trabar la cola", async () => {
    const s = memStore();
    enqueue("payments", { id: "a", amount: 1 }, s);
    enqueue("payments", { id: "b", amount: 1 }, s);
    const { c } = client([{ error: { message: "violates check constraint" } }, { error: null }]);
    expect(await flushQueue(c, { store: s })).toEqual({ sent: 1, dropped: 1, kept: 0 });
  });

  it("prepare completa la fila antes de mandarla", async () => {
    const s = memStore();
    enqueue("gig_entries", { id: "a", shift_date: "2026-10-16" }, s);
    const { c, calls } = client([]);
    await flushQueue(c, { store: s, prepare: async (p) => ({ ...p.row, shift_id: "shift-1" }) });
    expect(calls[0].row).toEqual({ id: "a", shift_date: "2026-10-16", shift_id: "shift-1" });
  });

  it("no pierde lo que se anotó mientras se enviaba", async () => {
    const s = memStore();
    enqueue("payments", { id: "a" }, s);
    const c: FlushClient = {
      from: () => ({
        upsert: vi.fn(async () => {
          enqueue("payments", { id: "nuevo" }, s);
          return { error: null };
        }),
      }),
    };
    await flushQueue(c, { store: s });
    expect(readQueue(s).map((p) => p.id)).toEqual(["nuevo"]);
  });
});
