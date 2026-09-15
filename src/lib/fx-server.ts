import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Rates } from "@/lib/fx";

const ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function fetchFreshRates(): Promise<Rates | null> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; rates?: Rates };
    if (json.result !== "success" || !json.rates) return null;
    return json.rates;
  } catch {
    return null;
  }
}

type Sb = Awaited<ReturnType<typeof createClient>>;

async function readCache(supabase: Sb): Promise<{ rates: Rates; fetchedAt: number | null }> {
  const { data } = await supabase.from("fx_rates").select("code, rate_per_usd, fetched_at");
  const rates: Rates = {};
  let fetchedAt: number | null = null;
  for (const r of data ?? []) {
    rates[r.code as string] = Number(r.rate_per_usd);
    const t = new Date(r.fetched_at as string).getTime();
    if (fetchedAt === null || t > fetchedAt) fetchedAt = t;
  }
  return { rates, fetchedAt };
}

async function refreshCache(supabase: Sb): Promise<Rates | null> {
  const fresh = await fetchFreshRates();
  if (!fresh) return null;
  const rows = Object.entries(fresh).map(([code, rate]) => ({
    code,
    rate_per_usd: rate,
    fetched_at: new Date().toISOString(),
  }));
  await supabase.from("fx_rates").upsert(rows, { onConflict: "code" });
  return fresh;
}

/**
 * Cotizaciones para convertir entre monedas.
 *
 * Nunca bloquea el render esperando a la API externa: si el cache está vencido
 * devuelve lo que haya y lo refresca después de responder. Solo espera la red
 * cuando no hay absolutamente nada cacheado (primera vez).
 */
export async function getRates(): Promise<Rates> {
  const supabase = await createClient();
  const { rates, fetchedAt } = await readCache(supabase);

  const hasCache = Object.keys(rates).length > 0;
  const isStale = fetchedAt === null || Date.now() - fetchedAt > SIX_HOURS_MS;

  if (hasCache) {
    if (isStale) {
      // Refresco en segundo plano: el usuario no lo espera.
      after(async () => {
        try { await refreshCache(await createClient()); } catch {}
      });
    }
    return rates;
  }

  // Sin cache no queda otra que ir a buscarlas.
  return (await refreshCache(supabase)) ?? {};
}
