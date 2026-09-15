import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, getUserSettings } from "@/lib/supabase/user";
import BottomNav from "@/components/BottomNav";
import NotificationsBootstrap from "@/components/NotificationsBootstrap";
import GlobalSearch from "@/components/GlobalSearch";
import WorkNowButton from "@/components/WorkNowButton";
import OnboardingWizard from "@/components/OnboardingWizard";
import IosInstallBanner from "@/components/IosInstallBanner";
import { Icons } from "@/components/ui/Icons";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  // Misma fila que ya leyó el layout raíz: viene del cache, no pega a la base.
  const settings = await getUserSettings();
  const displayName = settings?.display_name ?? "";
  const showJornada = !!settings?.gig_worker_enabled;
  const needsOnboarding = !settings?.onboarded_at;

  const initials = (() => {
    const name = displayName || user.email || "";
    const parts = name.split(/\s+|@/).filter(Boolean);
    const first = parts[0]?.[0] ?? "C";
    const second = parts[1]?.[0] ?? "";
    return (first + second).toUpperCase().slice(0, 2);
  })();
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6 || h >= 22) return "Buenas noches";
    if (h < 12) return "Buen día";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div className="min-h-screen flex flex-col pb-[calc(110px+env(safe-area-inset-bottom))]">
      <header
        className="sticky top-0 z-10"
        style={{ background: "color-mix(in srgb, var(--color-bg) 80%, transparent)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-xl mx-auto px-5 pt-3 pb-4 flex items-center justify-between">
          <Link href="/ajustes" className="flex items-center gap-3">
            <span
              className="flex items-center justify-center font-bold text-[15px]"
              style={{
                width: 40, height: 40, borderRadius: 14,
                background: "linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, #fff))",
                color: "var(--color-accent-on)",
              }}
              aria-hidden
            >
              {initials}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[12px] font-medium text-muted">{greeting},</span>
              <span className="text-[16px] font-bold">{displayName || "vos"}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <Link
              href="/ajustes"
              aria-label="Ajustes"
              className="flex items-center justify-center"
              style={{
                width: 38, height: 38, borderRadius: 14,
                background: "var(--color-card)", border: "1px solid var(--color-line)",
                color: "var(--color-fg)",
              }}
            >
              <Icons.settings size={18} />
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-xl w-full mx-auto px-5 pb-4">{children}</main>
      <WorkNowButton />
      <BottomNav showJornada={showJornada} />
      <NotificationsBootstrap />
      <IosInstallBanner />
      {needsOnboarding && <OnboardingWizard />}
    </div>
  );
}
