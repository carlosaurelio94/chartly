"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    setInstalled(!!standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return <p className="text-sm text-ok">App instalada ✓</p>;

  // Si el navegador soporta prompt nativo (Android/Chrome desktop), usarlo directo.
  if (evt) {
    return (
      <button
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice;
          setEvt(null);
        }}
        className="btn-primary w-full"
      >
        📲 Descargar app
      </button>
    );
  }

  // Resto: derivar a la página /instalar con instrucciones por plataforma (incluye iOS).
  return (
    <Link href="/instalar" className="btn-primary w-full block text-center">
      📲 Instalar como app
    </Link>
  );
}
