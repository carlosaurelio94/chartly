import type { Metadata, Viewport } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Chartly",
  description: "Gastos, ingresos, proyectos, agenda y métricas",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chartly",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let theme: "dark" | "light" = "dark";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("theme")
        .eq("user_id", user.id)
        .maybeSingle();
      const t = (data as { theme?: string } | null)?.theme;
      if (t === "light") theme = "light";
    }
  } catch {}

  return (
    <html lang="es" data-theme={theme}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
