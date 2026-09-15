"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Platform = "ios-safari" | "ios-other" | "android" | "desktop" | "unknown";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS) {
    // Safari iOS: no incluye "CriOS" (Chrome), "FxiOS" (Firefox), "EdgiOS" (Edge), "OPiOS" (Opera)
    const isOtherBrowserOnIOS = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|Coast/.test(ua);
    return isOtherBrowserOnIOS ? "ios-other" : "ios-safari";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export default function InstalarClient() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    setInstalled(!!standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (installed) {
    return (
      <div className="card text-center space-y-3">
        <p className="text-3xl">✅</p>
        <h1 className="text-xl font-semibold">¡Ya tenés Chartly instalada!</h1>
        <p className="text-sm text-muted">
          Estás usando la versión instalada. Cerrá esta pestaña y abrila desde tu pantalla de inicio.
        </p>
        <Link href="/login" className="btn-primary inline-block">Ir al login</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-3xl">📲</p>
        <h1 className="text-2xl font-semibold">Instalar Chartly</h1>
        <p className="text-sm text-muted">
          Funciona como una app nativa. Sin pasar por la App Store.
        </p>
      </div>

      {platform === "ios-safari" && <IosSafariSteps />}
      {platform === "ios-other" && <IosOtherBrowserNotice onCopy={copyLink} copied={copied} />}
      {platform === "android" && <AndroidSteps bip={bip} onInstall={async () => {
        if (!bip) return;
        await bip.prompt();
        await bip.userChoice;
        setBip(null);
      }} />}
      {platform === "desktop" && <DesktopSteps onCopy={copyLink} copied={copied} />}
      {platform === "unknown" && (
        <div className="card text-sm text-muted">Detectando tu dispositivo…</div>
      )}

      <div className="card space-y-2">
        <p className="text-sm font-medium">¿Por qué instalar?</p>
        <ul className="text-sm text-muted space-y-1">
          <li>• Se abre como una app, sin barra de navegador.</li>
          <li>• Ícono propio en tu pantalla de inicio.</li>
          <li>• Notificaciones push (recordatorios de cuentas, agenda).</li>
          <li>• Acceso rápido sin tener que escribir la URL.</li>
        </ul>
      </div>

      <div className="text-center">
        <Link href="/login" className="text-sm text-muted underline">
          Ya está, llevame al login
        </Link>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-accent text-black font-semibold flex items-center justify-center text-sm">
        {n}
      </span>
      <div className="flex-1 pt-0.5 text-sm">{children}</div>
    </li>
  );
}

function IosSafariSteps() {
  return (
    <div className="card space-y-3">
      <p className="text-sm font-medium">📱 En tu iPhone (Safari)</p>
      <ol className="space-y-3">
        <Step n={1}>
          Tocá el botón <span className="text-accent font-medium">Compartir</span>{" "}
          <span className="inline-block px-2 py-0.5 rounded border border-line text-xs">⬆️</span>{" "}
          en la barra inferior de Safari.
        </Step>
        <Step n={2}>
          Bajá en el menú y tocá{" "}
          <span className="text-accent font-medium">Añadir a pantalla de inicio</span>{" "}
          (o <em>Add to Home Screen</em>).
        </Step>
        <Step n={3}>
          Confirmá tocando <span className="text-accent font-medium">Añadir</span>{" "}
          arriba a la derecha.
        </Step>
        <Step n={4}>
          Buscá el ícono de Chartly en tu pantalla de inicio y tocalo. ¡Listo!
        </Step>
      </ol>
      <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/5 p-3 text-xs text-yellow-300">
        ⚠️ Tiene que ser <strong>Safari</strong>. Chrome / Firefox en iPhone no permiten
        instalar PWAs (es restricción de Apple, no nuestra).
      </div>
    </div>
  );
}

function IosOtherBrowserNotice({
  onCopy,
  copied,
}: {
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="card space-y-3">
      <p className="text-sm font-medium">📱 Estás en iPhone con otro navegador</p>
      <p className="text-sm text-muted">
        Apple solo permite instalar webapps desde <strong className="text-accent">Safari</strong>.
        Hacé esto:
      </p>
      <ol className="space-y-3">
        <Step n={1}>
          Copiá el link de Chartly:
          <div className="mt-2 flex gap-2">
            <code className="flex-1 truncate text-xs px-2 py-1 rounded bg-bg/40 border border-line">
              {typeof window !== "undefined" ? window.location.origin : "https://desempleo-inky.vercel.app"}
            </code>
            <button onClick={onCopy} className="chip border border-line text-xs whitespace-nowrap">
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
        </Step>
        <Step n={2}>
          Abrí <span className="text-accent">Safari</span> en tu iPhone y pegá el link.
        </Step>
        <Step n={3}>
          Tocá <span className="text-accent">Compartir ⬆️ → Añadir a pantalla de inicio</span>.
        </Step>
      </ol>
    </div>
  );
}

function AndroidSteps({
  bip,
  onInstall,
}: {
  bip: BIPEvent | null;
  onInstall: () => void;
}) {
  return (
    <div className="card space-y-3">
      <p className="text-sm font-medium">🤖 En tu Android (Chrome)</p>
      {bip ? (
        <>
          <p className="text-sm text-muted">
            Tu navegador soporta instalación nativa. Tocá el botón:
          </p>
          <button onClick={onInstall} className="btn-primary w-full">
            📲 Instalar Chartly
          </button>
        </>
      ) : (
        <ol className="space-y-3">
          <Step n={1}>
            Tocá el menú <span className="text-accent">⋮</span> arriba a la derecha de Chrome.
          </Step>
          <Step n={2}>
            Elegí <span className="text-accent">Instalar app</span> o{" "}
            <span className="text-accent">Añadir a pantalla principal</span>.
          </Step>
          <Step n={3}>
            Confirmá. Aparece el ícono en tu pantalla de inicio.
          </Step>
        </ol>
      )}
    </div>
  );
}

function DesktopSteps({
  onCopy,
  copied,
}: {
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-sm font-medium">💻 Estás en computadora</p>
        <p className="text-sm text-muted">
          Chartly está pensada para usar en el celular. Para instalarla en tu teléfono,
          abrí este link desde ahí:
        </p>
        <div className="flex gap-2">
          <code className="flex-1 truncate text-xs px-2 py-1 rounded bg-bg/40 border border-line">
            {typeof window !== "undefined" ? window.location.origin : "https://desempleo-inky.vercel.app"}
          </code>
          <button onClick={onCopy} className="chip border border-line text-xs whitespace-nowrap">
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
        </div>
      </div>
      <div className="card space-y-2">
        <p className="text-sm font-medium">¿Querés instalarla igual en escritorio?</p>
        <p className="text-sm text-muted">
          En Chrome / Edge: ícono de instalación{" "}
          <span className="text-accent">⊕</span> en la barra de URL, o menú{" "}
          <span className="text-accent">⋮ → Instalar Chartly…</span>
        </p>
      </div>
    </div>
  );
}
