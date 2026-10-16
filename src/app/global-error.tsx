"use client";

/* Último recurso: si falla el layout raíz. Tiene que traer su propio <html>. */

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui", background: "#0b0d12", color: "#e5e7eb", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 18 }}>Chartly tuvo un problema</h1>
          <p style={{ color: "#9ca3af" }}>Ya quedó registrado. Probá recargar.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#c3fc4a", fontWeight: 700 }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
