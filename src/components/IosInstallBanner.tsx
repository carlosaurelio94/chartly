"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "chartly_ios_banner_dismissed";

export default function IosInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    if (!isIos) return;

    const isOtherBrowserOnIOS = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|Coast/.test(ua);
    // Solo mostramos en Safari (los otros nav iOS no permiten Add to Home Screen)
    if (isOtherBrowserOnIOS) return;

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    if (standalone) return;

    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  }

  return (
    <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom)+8px)] left-0 right-0 z-30 px-4">
      <div className="max-w-xl mx-auto rounded-2xl border border-accent/30 bg-card/95 backdrop-blur p-3 shadow-lg flex items-start gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Instalá Chartly como app</p>
          <p className="text-xs text-muted">
            Compartir <span className="text-accent">⬆️</span> → Añadir a pantalla de inicio
          </p>
          <Link
            href="/instalar"
            className="inline-block mt-1 text-xs text-accent underline"
          >
            Cómo se hace →
          </Link>
        </div>
        <button
          onClick={dismiss}
          className="text-muted hover:text-text shrink-0 -mt-1 -mr-1 p-1"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
