import { vi } from "vitest";

/* Doble de prueba del cliente de Supabase.

   Cada .from(tabla) arma un query builder encadenable que registra los métodos
   llamados. Al resolverse (await, .single() o .maybeSingle()) le pide el
   resultado a un handler por tabla, que recibe la consulta completa para poder
   distinguir un select de un update o filtrar por .eq(). */

export type Op = { method: string; args: unknown[] };
export type Query = { table: string; ops: Op[]; terminal: "await" | "single" | "maybeSingle" };
export type Result = { data?: unknown; error?: { message: string } | null };
export type Handler = (q: Query) => Result | undefined;

const CHAIN = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "ilike", "like", "in", "order", "limit", "range",
];

export function createSupabaseMock(handlers: Record<string, Handler | Result> = {}) {
  const queries: Query[] = [];

  function resolve(q: Query) {
    queries.push(q);
    const h = handlers[q.table];
    const r = typeof h === "function" ? h(q) : h;
    return Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
  }

  function from(table: string) {
    const ops: Op[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of CHAIN) {
      builder[m] = (...args: unknown[]) => {
        ops.push({ method: m, args });
        return builder;
      };
    }
    builder.single = () => resolve({ table, ops, terminal: "single" });
    builder.maybeSingle = () => resolve({ table, ops, terminal: "maybeSingle" });
    builder.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      resolve({ table, ops, terminal: "await" }).then(ok, ko);
    return builder;
  }

  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null as unknown }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: null as unknown }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
    admin: {
      listUsers: vi.fn(async () => ({ data: { users: [] as { id: string; email?: string }[] }, error: null })),
      inviteUserByEmail: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
    },
  };

  return {
    from: vi.fn(from),
    auth,
    queries,
    /** Consultas a una tabla que usaron un método dado (p. ej. "update"). */
    find(table: string, method?: string) {
      return queries.filter((q) => q.table === table && (!method || q.ops.some((o) => o.method === method)));
    },
    asUser(user: { id: string; email?: string } | null) {
      auth.getUser.mockResolvedValue({ data: { user }, error: null });
      auth.getSession.mockResolvedValue({ data: { session: user ? { user } : null }, error: null });
      return this;
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

/** Valor del primer argumento de una op (p. ej. el payload de un update). */
export function arg(q: Query, method: string, i = 0): unknown {
  return q.ops.find((o) => o.method === method)?.args[i];
}

/** Valor filtrado con .eq(col, valor). */
export function eqValue(q: Query, col: string): unknown {
  return q.ops.find((o) => o.method === "eq" && o.args[0] === col)?.args[1];
}

