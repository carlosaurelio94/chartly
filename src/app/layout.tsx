import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getUserSettings } from "@/lib/supabase/user";
import { accentVars, isAccentKey, type AccentKey } from "@/lib/palettes";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

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
  themeColor: "#0a0c10",
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
  let accent: AccentKey = "lime";
  try {
    const s = await getUserSettings();
    if (s?.theme === "light") theme = "light";
    if (isAccentKey(s?.theme_accent)) accent = s.theme_accent;
  } catch {}

  return (
    <html lang="es" data-theme={theme} className={jakarta.variable}>
      <body
        className={`${jakarta.className} min-h-screen antialiased`}
        style={accentVars(accent)}
      >
        {children}
      </body>
    </html>
  );
}
