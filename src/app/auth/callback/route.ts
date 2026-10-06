import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), url.origin);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
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
