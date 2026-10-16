"use client";

/* Si una pantalla se rompe, se ve esto en vez de una página en blanco, y el
   error queda en los logs de Vercel. */

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/report-error";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="card space-y-3 text-center mt-6">
      <p className="text-3xl" aria-hidden>😕</p>
      <h1 className="text-lg font-semibold">Algo falló al mostrar esta pantalla</h1>
      <p className="text-sm text-muted">
        Ya nos quedó registrado. Probá de nuevo; si sigue pasando, revisá tu conexión.
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={reset} className="btn-primary">Reintentar</button>
        <Link href="/hoy" className="btn-ghost">Ir a Hoy</Link>
      </div>
    </div>
  );
}
