"use client";

import { useEffect, useState } from "react";

const APK_PATH = "/chartly.apk";
const SHARE_TITLE = "Chartly";
const SHARE_TEXT =
  "Te paso Chartly, la app que uso para llevar gastos, agenda y proyectos. " +
  "Es para Android. Cuando descargues el archivo, el celular te va a avisar " +
  "que es de «fuentes desconocidas» — confirmá que confías y se instala.";

type Status = "checking" | "ready" | "missing";

export default function ShareAppButton() {
  const [status, setStatus] = useState<Status>("checking");
  const [size, setSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Check if the APK is published
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(APK_PATH, { method: "HEAD" });
        if (cancelled) return;
        if (res.ok) {
          const len = res.headers.get("content-length");
          setSize(len ? Number(len) : null);
          setStatus("ready");
        } else {
          setStatus("missing");
        }
      } catch {
        if (!cancelled) setStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function shareAsFile() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      // Descarga el APK en memoria y se lo entrega al share sheet del SO.
      // En Android Chrome, WhatsApp aparece como destino y el archivo viaja como adjunto real.
      const res = await fetch(APK_PATH);
      if (!res.ok) throw new Error("No se pudo descargar el APK");
      const blob = await res.blob();
      const file = new File([blob], "chartly.apk", {
        type: "application/vnd.android.package-archive",
      });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
      };

      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ title: SHARE_TITLE, text: SHARE_TEXT, files: [file] });
        setInfo("Compartido. Si no llegó, probá con «Mandar link por WhatsApp».");
      } else {
        // Fallback: descarga local + abrir WhatsApp con el link
        triggerDownload(blob, "chartly.apk");
        openWhatsApp();
        setInfo(
          "Tu navegador no permite adjuntar archivos al compartir. Descargué el APK y abrí WhatsApp con el link.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error compartiendo el APK.");
    } finally {
      setBusy(false);
    }
  }

  function openWhatsApp() {
    const url = `${window.location.origin}${APK_PATH}`;
    const text = `${SHARE_TEXT}\n\nDescargalo acá: ${url}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sizeMb =
    size != null && Number.isFinite(size) ? `${(size / 1_000_000).toFixed(1)} MB` : null;

  return (
    <section className="card space-y-3">
      <div>
        <p className="font-medium">📤 Compartir Chartly por WhatsApp</p>
        <p className="text-xs text-muted mt-1">
          Le manda el archivo de instalación (APK) a un contacto. Solo funciona en Android: iOS no
          puede instalar APKs.
        </p>
      </div>

      {status === "checking" && (
        <p className="text-xs text-muted">Verificando si hay APK publicado…</p>
      )}

      {status === "missing" && (
        <div className="border border-yellow-500/40 bg-yellow-500/5 rounded-xl p-3 space-y-2 text-xs">
          <p className="font-medium text-yellow-300">⚠ Todavía no hay APK</p>
          <p className="text-muted">
            Para que este botón mande la app real, primero hay que generar un APK envolviendo la
            PWA. Lo más rápido:
          </p>
          <ol className="list-decimal pl-4 space-y-1 text-muted">
            <li>
              Entrar a <code className="text-fg">pwabuilder.com</code> y pegar la URL de Chartly.
            </li>
            <li>Descargar el paquete Android (te genera un .apk firmado).</li>
            <li>
              Ponerlo en <code className="text-fg">public/chartly.apk</code> del repo y
              redeployar.
            </li>
          </ol>
          <p className="text-muted">
            Mientras tanto podés mandar el link de la PWA con el botón de abajo.
          </p>
          <button onClick={openWhatsApp} className="btn-ghost w-full text-sm mt-1">
            💬 Mandar link de la app por WhatsApp
          </button>
        </div>
      )}

      {status === "ready" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            APK publicado{sizeMb ? ` · ${sizeMb}` : ""}. Tocá «Adjuntar APK» para que viaje como
            archivo en WhatsApp; si no se puede, usá «Mandar link».
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={shareAsFile} disabled={busy} className="btn-primary text-sm">
              {busy ? "Preparando…" : "📎 Adjuntar APK"}
            </button>
            <button onClick={openWhatsApp} disabled={busy} className="btn-ghost text-sm">
              🔗 Mandar link
            </button>
          </div>
          <p className="text-[11px] text-muted">
            En Android, al recibir el .apk, el sistema pedirá permitir «instalar de fuentes
            desconocidas» para WhatsApp esa única vez.
          </p>
        </div>
      )}

      {info && <p className="text-xs text-muted">{info}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
