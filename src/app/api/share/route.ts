import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { extractMovement, extractorAvailable } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/** Lecturas con IA por usuario cada 24 h. Cada una es una llamada paga al
 *  proveedor: sin tope, un loop o un usuario malintencionado dispara la factura.
 *  Pasado el tope la captura igual se guarda, para completarla a mano. */
const DAILY_LIMIT = Number(process.env.CAPTURE_DAILY_LIMIT) || 40;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Receptor del Web Share Target (Android) y del Atajo de iOS.
 *
 * Redirige de inmediato con la captura en estado "processing" y hace la
 * lectura del comprobante después de responder (after()), para que el usuario
 * no espere mirando una pantalla en blanco. La pantalla de confirmación
 * muestra un spinner y se actualiza sola cuando termina.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(new URL("/capturar?error=formato", req.url), 303);
  }

  const file =
    (form.get("file") as File | null) ??
    (form.get("image") as File | null) ??
    (form.get("files") as File | null);

  const sharedText =
    [form.get("title"), form.get("text"), form.get("url")]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join("\n") || null;

  const hasFile = !!file && typeof file.size === "number" && file.size > 0;
  if (!hasFile && !sharedText) {
    return NextResponse.redirect(new URL("/capturar?error=vacio", req.url), 303);
  }
  if (hasFile && file!.size > MAX_BYTES) {
    return NextResponse.redirect(new URL("/capturar?error=grande", req.url), 303);
  }

  const mimeType = hasFile ? file!.type || "application/octet-stream" : "text/plain";

  // La imagen se pasa a memoria acá y nunca se persiste.
  const base64 = hasFile
    ? Buffer.from(await file!.arrayBuffer()).toString("base64")
    : null;

  let extract = extractorAvailable();
  let skipReason: string | null = extract ? null : "sin_extractor";
  if (extract) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      extract = false;
      skipReason = "limite_diario";
    }
  }

  const { data: created, error: insErr } = await supabase
    .from("captures")
    .insert({
      user_id: user.id,
      source: "share",
      mime_type: mimeType,
      raw_text: sharedText,
      status: extract ? "processing" : "pending",
      error: skipReason,
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return NextResponse.redirect(new URL("/capturar?error=db", req.url), 303);
  }
  const captureId = (created as { id: string }).id;

  if (extract) {
    // Corre después de enviar la respuesta: el usuario ya está navegando.
    after(async () => {
      const sb = admin();
      try {
        const res = base64
          ? await extractMovement({ kind: "file", base64, mimeType })
          : await extractMovement({ kind: "text", text: sharedText! });

        // Guardamos el payload plano del modo que corresponda, más "clase"
        // para que la UI sepa qué pantalla de confirmación mostrar.
        const parsed =
          res == null
            ? null
            : res.clase === "jornada"
              ? { clase: "jornada", ...res.jornada }
              : { clase: "comprobante", ...res.movimiento };
        const confidence =
          res == null
            ? null
            : res.clase === "jornada"
              ? res.jornada.confianza
              : res.movimiento.confianza;

        await sb
          .from("captures")
          .update({ parsed, confidence, status: "pending" })
          .eq("id", captureId);
      } catch (e) {
        await sb
          .from("captures")
          .update({
            status: "pending",
            error: e instanceof Error ? e.message.slice(0, 300) : "error_extraccion",
          })
          .eq("id", captureId);
      }
    });
  }

  return NextResponse.redirect(new URL(`/capturar/${captureId}`, req.url), 303);
}

/** Algunos clientes comparten por GET con parámetros en la URL. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const text = [
    url.searchParams.get("title"),
    url.searchParams.get("text"),
    url.searchParams.get("url"),
  ]
    .filter(Boolean)
    .join("\n");
  const target = new URL("/capturar", req.url);
  if (text) target.searchParams.set("text", text);
  return NextResponse.redirect(target, 303);
}
