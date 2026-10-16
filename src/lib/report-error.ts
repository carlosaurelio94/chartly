/** Manda un error del navegador a /api/log (termina en los logs de Vercel). Nunca tira. */
export function reportError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      path: typeof location !== "undefined" ? location.pathname : undefined,
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/log", body);
    } else {
      fetch("/api/log", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // reportar un error nunca debe romper otra cosa
  }
}
