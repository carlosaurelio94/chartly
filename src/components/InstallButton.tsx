"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua));
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

  if (isIos) {
    return (
      <p className="text-sm text-muted">
        En iPhone: tocá <span className="text-accent">⬆️ Compartir</span> y luego{" "}
        <span className="text-accent">Añadir a pantalla de inicio</span>.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted">
      En Android Chrome: menú ⋮ → <span className="text-accent">Añadir a pantalla principal</span>.
      Si tu navegador es compatible, aparecerá el botón aquí.
    </p>
  );
}
