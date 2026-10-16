/* Cola de registros hechos sin señal.

   Un repartidor anota un cobro en la calle, sin datos móviles: antes el
   registro se perdía con un error. Ahora queda guardado en el teléfono y se
   manda solo cuando vuelve la conexión.

   Cada fila lleva un id generado en el teléfono: si el envío se corta a mitad
   y se reintenta, el upsert por id no la duplica. */

export type QueueTable = "gig_entries" | "payments";

export type Pending = {
  id: string;
  table: QueueTable;
  row: Record<string, unknown> & { id: string };
  createdAt: number;
};

/** Lo mínimo de Storage que usamos (localStorage en el navegador, un Map en tests). */
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "chartly_offline_queue_v1";
const MAX_ITEMS = 500;

function defaultStore(): KV | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readQueue(store: KV | null = defaultStore()): Pending[] {
  if (!store) return [];
  try {
    const v = JSON.parse(store.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as Pending[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: Pending[], store: KV | null) {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    // Almacenamiento lleno o bloqueado: no hay dónde guardarlo.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("chartly:queue"));
}

export function enqueue(table: QueueTable, row: Pending["row"], store: KV | null = defaultStore()): Pending {
  const item: Pending = { id: row.id, table, row, createdAt: Date.now() };
  const items = readQueue(store).filter((p) => p.id !== item.id);
  items.push(item);
  writeQueue(items, store);
  return item;
}

/**
 * ¿El error es por falta de red (y vale la pena reintentar) y no un rechazo de
 * la base (dato inválido, permisos), que reintentar no arregla?
 */
export function isNetworkError(err: unknown, online: boolean = typeof navigator === "undefined" ? true : navigator.onLine): boolean {
  if (!online) return true;
  if (!err) return false;
  const msg = (err as { message?: string }).message ?? String(err);
  return /failed to fetch|fetch failed|network ?error|load failed|networkerror|timeout|ECONN|ENOTFOUND/i.test(msg);
}

/** Lo mínimo del cliente de Supabase que necesita el envío. */
export type FlushClient = {
  from: (table: string) => {
    upsert: (row: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * Manda lo pendiente. Lo que la base rechaza (no por red) se descarta para no
 * trabar la cola para siempre; lo que falla por red queda para el próximo intento.
 * `prepare` permite completar la fila justo antes de mandarla (p. ej. el id
 * de la jornada, que sin señal no se conocía).
 */
export async function flushQueue(
  client: FlushClient,
  opts: {
    store?: KV | null;
    prepare?: (p: Pending) => Promise<Record<string, unknown>>;
    online?: boolean;
  } = {},
): Promise<{ sent: number; dropped: number; kept: number }> {
  const store = opts.store === undefined ? defaultStore() : opts.store;
  const items = readQueue(store);
  const keep: Pending[] = [];
  let sent = 0;
  let dropped = 0;
  for (const p of items) {
    try {
      const row = opts.prepare ? await opts.prepare(p) : p.row;
      const { error } = await client.from(p.table).upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (!error) sent++;
      else if (isNetworkError(error, opts.online ?? true)) keep.push(p);
      else dropped++;
    } catch (e) {
      if (isNetworkError(e, opts.online ?? true)) keep.push(p);
      else dropped++;
    }
  }
  // Lo que se anotó mientras se enviaba no estaba en `items`: se conserva.
  const processed = new Set(items.map((p) => p.id));
  const added = readQueue(store).filter((p) => !processed.has(p.id));
  writeQueue([...keep, ...added], store);
  return { sent, dropped, kept: keep.length + added.length };
}
