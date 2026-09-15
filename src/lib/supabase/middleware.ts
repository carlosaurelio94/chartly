import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() valida el token contra el servidor de Supabase: es un viaje de red
  // en CADA request, incluidas las navegaciones internas (~130 ms fijos).
  // getSession() lo lee de la cookie y solo sale a la red si hay que refrescarlo.
  //
  // Acá solo decidimos si redirigir al login. Quien protege los datos es RLS,
  // que valida la firma del JWT en cada consulta, y los server components siguen
  // usando getUser() verificado. Una cookie falsa pasaría este chequeo pero no
  // leería una sola fila.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  // Rutas públicas: la landing, la guía de instalación y la doc pública.
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/instalar" ||
    pathname.startsWith("/como-funciona");

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/hoy";
    return NextResponse.redirect(url);
  }

  return response;
}
