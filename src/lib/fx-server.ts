import "server-only";
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

export async function getRates(): Promise<Rates> {
  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("fx_rates")
    .select("code, rate_per_usd, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);

  const isStale =
    !cached?.length ||
    Date.now() - new Date(cached[0].fetched_at as string).getTime() > SIX_HOURS_MS;

  if (!isStale) {
    const { data: all } = await supabase.from("fx_rates").select("code, rate_per_usd");
    const out: Rates = {};
    for (const r of all ?? []) out[r.code as string] = Number(r.rate_per_usd);
    if (Object.keys(out).length) return out;
  }

  const fresh = await fetchFreshRates();
  if (fresh) {
    const rows = Object.entries(fresh).map(([code, rate]) => ({
      code,
      rate_per_usd: rate,
      fetched_at: new Date().toISOString(),
    }));
    await supabase.from("fx_rates").upsert(rows, { onConflict: "code" });
    return fresh;
  }

  const { data: all } = await supabase.from("fx_rates").select("code, rate_per_usd");
  const out: Rates = {};
  for (const r of all ?? []) out[r.code as string] = Number(r.rate_per_usd);
  return out;
}
