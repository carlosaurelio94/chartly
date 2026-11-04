import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Esquema con el que Android abre la app nativa (ver AndroidManifest). */
const APP_SCHEME = "app.chartly";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), url.origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // El enlace del mail se pidió en otro lado (típico: desde la app nativa,
    // y el mail lo abrió el navegador). El código sigue sin usar: se lo
    // pasamos a la app, que tiene la otra mitad del canje.
    if (error?.code === "pkce_code_verifier_not_found") return openInApp(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function openInApp(code: string) {
  const link = `${APP_SCHEME}://auth/callback?code=${encodeURIComponent(code)}`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar a Chartly</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d10; color: #e6e8eb; font: 16px system-ui, sans-serif; padding: 24px; box-sizing: border-box; text-align: center; }
  main { max-width: 340px; }
  a.btn { display: block; margin: 20px 0 12px; padding: 14px 20px; border-radius: 14px; background: #c6f24e; color: #0b0d10; font-weight: 700; text-decoration: none; }
  p { color: #9aa1a9; line-height: 1.45; }
</style></head>
<body><main>
  <h1>Entrar a Chartly</h1>
  <p>Pediste el enlace desde la app de Chartly. Tocá el botón para terminar de entrar ahí.</p>
  <a class="btn" href="${link}">Abrir en la app</a>
  <p style="font-size:13px">¿Lo pediste desde la web? Abrí el enlace en el mismo navegador donde lo pediste, o pedí uno nuevo desde ese navegador.</p>
</main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

/** Solo rutas internas: "//evil.com" o "https://evil.com" serían un open redirect. */
function safeNext(next: string | null, origin: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/hoy";
  try {
    const target = new URL(next, origin);
    return target.origin === origin ? target.pathname + target.search + target.hash : "/hoy";
  } catch {
    return "/hoy";
  }
}
