import "server-only";
import { cache } from "react";
import { createClient } from "./server";

/**
 * auth.getUser() hace una llamada de red a Supabase para validar el token.
 * El layout y la página se renderizan en el mismo pase, así que sin esto
 * cada navegación pagaba ese viaje dos veces. cache() lo deja en uno.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  // getSession() lee la cookie sin salir a la red (solo la usa si hay que
  // refrescar el token). getUser() en cambio valida contra Supabase Auth en
  // cada render: ~100 ms fijos por navegación.
  //
  // Lo usamos para saber de quién es la sesión, no como control de acceso: el
  // que protege los datos es RLS, que verifica la firma del JWT en cada
  // consulta. Con una cookie adulterada las queries no devuelven nada.
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
});

export type UserSettings = {
  theme: string | null;
  theme_accent: string | null;
  display_name: string | null;
  gig_worker_enabled: boolean | null;
  onboarded_at: string | null;
  default_currency: string | null;
  timezone: string | null;
};

/**
 * El layout raíz (tema y acento) y el layout de la app (nombre, jornada,
 * onboarding) leían user_settings por separado: dos consultas por navegación
 * a la misma fila. Una sola, compartida por todo el render.
 */
export const getUserSettings = cache(async (): Promise<UserSettings | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select("theme, theme_accent, display_name, gig_worker_enabled, onboarded_at, default_currency, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as UserSettings | null) ?? null;
});
