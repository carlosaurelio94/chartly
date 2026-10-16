import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Errores del navegador → logs de Vercel (Runtime Logs). Sin servicio externo:
 * alcanza para enterarse de que algo se rompe en el teléfono de alguien.
 * Se recorta todo para que nadie use esto para inflar los logs.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const text = (await req.text()).slice(0, 4_000);
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  console.error(
    JSON.stringify({
      level: "error",
      source: "client",
      message: str(body.message, 500),
      digest: str(body.digest, 100),
      path: str(body.path, 200),
      stack: str(body.stack, 1_500),
      ua: req.headers.get("user-agent")?.slice(0, 200),
    }),
  );
  return new NextResponse(null, { status: 204 });
}
