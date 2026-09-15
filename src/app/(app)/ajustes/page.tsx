import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import AjustesClient, { type RoutineBlock } from "./AjustesClient";
import GigSettings from "./GigSettings";
import ShareAppButton from "@/components/ShareAppButton";
import { isAccentKey, type AccentKey } from "@/lib/palettes";

export const dynamic = "force-dynamic";

// El email admin (ve la página /como-funciona) viene de la variable de entorno
// ADMIN_EMAIL. Si no está seteada, no hay admin y la sección queda oculta para todos.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

export default async function AjustesPage() {
  const supabase = await createClient();
  const user = await getUser();

  const [settingsRes, catsRes, pmRes] = await Promise.all([
    user
      ? supabase
          .from("user_settings")
          .select(
            "default_currency, display_name, theme, theme_accent, routine_blocks, timezone, gig_worker_enabled, gig_default_goal, gig_default_hours, gig_default_currency, gig_platforms, gig_tank_liters"
          )
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("bill_categories").select("id, name, color, parent_id").order("name", { ascending: true }),
    supabase.from("payment_methods").select("id, name, is_preset").order("name", { ascending: true }),
  ]);

  const settings = (settingsRes.data as {
    default_currency: string;
    display_name: string | null;
    theme: string | null;
    theme_accent: string | null;
    routine_blocks: unknown;
    timezone: string | null;
    gig_worker_enabled?: boolean;
    gig_default_goal?: number;
    gig_default_hours?: number;
    gig_default_currency?: string;
    gig_platforms?: unknown;
    gig_tank_liters?: number | null;
  } | null) ?? null;
  const defaultCurrency = settings?.default_currency ?? "ARS";
  const displayName = settings?.display_name ?? "";
  const theme: "dark" | "light" = settings?.theme === "light" ? "light" : "dark";
  const themeAccent: AccentKey = isAccentKey(settings?.theme_accent) ? settings!.theme_accent as AccentKey : "lime";
  const timezone = settings?.timezone ?? "America/Argentina/Buenos_Aires";
  const routineBlocks = Array.isArray(settings?.routine_blocks) ? (settings!.routine_blocks as RoutineBlock[]) : [];
  const categories = (catsRes.data ?? []) as { id: string; name: string; color: string; parent_id: string | null }[];
  const paymentMethods = (pmRes.data ?? []) as { id: string; name: string; is_preset: boolean }[];

  const gigEnabled = !!settings?.gig_worker_enabled;
  const gigGoal = Number(settings?.gig_default_goal ?? 0);
  const gigHours = Number(settings?.gig_default_hours ?? 8);
  const gigCurrency = settings?.gig_default_currency ?? defaultCurrency;
  const gigPlatforms = Array.isArray(settings?.gig_platforms) ? (settings!.gig_platforms as string[]) : [];
  const gigTankLiters = settings?.gig_tank_liters != null ? Number(settings.gig_tank_liters) : null;

  // Admin solo si: hay ADMIN_EMAIL configurado AND coincide con el del usuario
  const isAdmin = !!ADMIN_EMAIL && user?.email?.toLowerCase() === ADMIN_EMAIL;

  return (
    <div className="space-y-4">
      <AjustesClient
        email={user?.email ?? ""}
        defaultCurrency={defaultCurrency}
        displayName={displayName}
        theme={theme}
        themeAccent={themeAccent}
        categories={categories}
        paymentMethods={paymentMethods}
        routineBlocks={routineBlocks}
        timezone={timezone}
      />
      <GigSettings
        enabled={gigEnabled}
        defaultGoal={gigGoal}
        defaultHours={gigHours}
        currency={gigCurrency}
        platforms={gigPlatforms}
        tankLiters={gigTankLiters}
      />
      <ShareAppButton />
      {isAdmin && (
        <section className="card">
          <Link href="/como-funciona" className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">📘 Cómo funciona la app</p>
              <p className="text-xs text-muted">Documentación técnica (solo vos la ves)</p>
            </div>
            <span className="text-muted">→</span>
          </Link>
        </section>
      )}
    </div>
  );
}
