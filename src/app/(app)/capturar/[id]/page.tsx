import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import ConfirmCapture from "../ConfirmCapture";
import ConfirmGigDay from "../ConfirmGigDay";
import CaptureProcessing from "../CaptureProcessing";

export const dynamic = "force-dynamic";

function currentMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function CapturaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) {
    return <div className="card">Iniciá sesión.</div>;
  }

  const monthIso = currentMonthIso();

  const [capRes, catsRes, pmRes, settingsRes, accRes, aliasRes] = await Promise.all([
    supabase
      .from("captures")
      .select("id, source, mime_type, raw_text, parsed, confidence, error, status, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("bill_categories")
      .select("id, name, color, parent_id")
      .order("name", { ascending: true }),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("hidden", false)
      .order("name", { ascending: true }),
    supabase
      .from("user_settings")
      .select("default_currency")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Destinos posibles: acumuladores abiertos + el de nafta del mes corriente.
    supabase
      .from("bills")
      .select("id, name, currency, category_id, tipo, is_fuel_accumulator, accumulator_month")
      .eq("kind", "expense")
      .eq("archived", false)
      .eq("tipo", "acumulador")
      .or(`is_fuel_accumulator.eq.false,accumulator_month.eq.${monthIso}`)
      .order("name", { ascending: true }),
    supabase
      .from("merchant_aliases")
      .select("id, match_text, display_name, target_bill_id, category_id"),
  ]);

  if (!capRes.data) {
    return (
      <div className="card space-y-3">
        <p className="font-medium">No encontramos esa captura.</p>
        <Link href="/capturar" className="btn-ghost inline-block">Ver bandeja</Link>
      </div>
    );
  }

  // Mientras el modelo trabaja mostramos otra pantalla, para que el formulario
  // se monte una sola vez y ya con los datos cargados.
  if ((capRes.data as { status: string }).status === "processing") {
    return <CaptureProcessing captureId={id} />;
  }

  // Resumen de jornada: va a otra pantalla y termina en gig_entries.
  const gigParsed = (capRes.data as {
    parsed: { clase?: string; fecha?: string | null; items?: { fecha?: string | null }[] } | null;
  }).parsed;

  if (gigParsed?.clase === "jornada") {
    const { data: s } = await supabase
      .from("user_settings")
      .select("gig_platforms, gig_default_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const gp = (s as { gig_platforms?: unknown } | null)?.gig_platforms;

    // Días involucrados en la captura: los de cada item, o el del encabezado.
    const dates = Array.from(
      new Set(
        (gigParsed.items ?? [])
          .map((it) => it.fecha ?? gigParsed.fecha ?? null)
          .filter((d): d is string => !!d),
      ),
    );

    // Lo ya cargado en esos días sirve para marcar duplicados cuando manda
    // varias capturas del mismo día con filas superpuestas.
    const existing = dates.length
      ? (await supabase
          .from("gig_entries")
          .select("id, shift_date, platform, kind, amount, note")
          .in("shift_date", dates)).data ?? []
      : [];

    return (
      <ConfirmGigDay
        capture={capRes.data as never}
        platforms={Array.isArray(gp) && gp.length > 0 ? (gp as string[]) : ["Uber", "Rappi", "PedidosYa", "Didi", "Cabify"]}
        existing={existing as never}
        defaultCurrency={
          (s as { gig_default_currency?: string } | null)?.gig_default_currency ??
          (settingsRes.data as { default_currency?: string } | null)?.default_currency ??
          "ARS"
        }
      />
    );
  }

  // Alias: buscamos el match_text más específico contenido en el nombre detectado.
  const parsed = (capRes.data as { parsed: { comercio?: string | null } | null }).parsed;
  const detected = (parsed?.comercio ?? "").toLowerCase();
  const aliases = (aliasRes.data ?? []) as {
    id: string; match_text: string; display_name: string;
    target_bill_id: string | null; category_id: string | null;
  }[];
  const alias =
    detected.length > 0
      ? aliases
          .filter((a) => detected.includes(a.match_text))
          .sort((a, b) => b.match_text.length - a.match_text.length)[0] ?? null
      : null;

  return (
    <ConfirmCapture
      capture={capRes.data as never}
      categories={catsRes.data ?? []}
      paymentMethods={(pmRes.data ?? []) as { id: string; name: string }[]}
      accumulators={(accRes.data ?? []) as never}
      alias={alias}
      defaultCurrency={
        (settingsRes.data as { default_currency?: string } | null)?.default_currency ?? "ARS"
      }
    />
  );
}
