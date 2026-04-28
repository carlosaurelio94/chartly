import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/BottomNav";
import NotificationsBootstrap from "@/components/NotificationsBootstrap";
import Logo from "@/components/Logo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col pb-[calc(72px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-line">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/cuentas" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={22} />
            <span>Chartly</span>
          </Link>
          <Link href="/ajustes" className="text-sm text-muted">Ajustes</Link>
        </div>
      </header>
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-4">{children}</main>
      <BottomNav />
      <NotificationsBootstrap />
    </div>
  );
}
