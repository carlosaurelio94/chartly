"use client";

/* Ajustes que solo corren dentro de la app nativa (Capacitor):
   - la app abre directo en Hoy, no en la landing;
   - el botón atrás de Android vuelve una pantalla y, en la primera, manda la
     app al fondo en vez de cerrarla (cerrarla cortaría el GPS);
   - app.chartly://auth/callback?code=… (el enlace del mail de login, que abre
     el navegador) termina de entrar acá, donde quedó la otra mitad del canje. */

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { isNativeApp } from "@/components/gps/location";

export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.dataset.native = "1";
    if (window.location.pathname === "/") window.location.replace("/hoy");

    const sub = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.minimizeApp().catch(() => {});
    });
    const open = App.addListener("appUrlOpen", ({ url }) => {
      try {
        const u = new URL(url);
        const code = u.searchParams.get("code");
        if (u.host === "auth" && u.pathname === "/callback" && code) {
          window.location.href = `/auth/callback?code=${encodeURIComponent(code)}`;
        }
      } catch {}
    });
    return () => {
      sub.then((s) => s.remove()).catch(() => {});
      open.then((s) => s.remove()).catch(() => {});
    };
  }, []);
  return null;
}
