"use client";

/* Ajustes que solo corren dentro de la app nativa (Capacitor):
   - la app abre directo en Hoy, no en la landing;
   - el botón atrás de Android vuelve una pantalla y, en la primera, manda la
     app al fondo en vez de cerrarla (cerrarla cortaría el GPS). */

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
    return () => {
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, []);
  return null;
}
