"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Pantalla de espera mientras el modelo lee el comprobante.
 * Vive separada de ConfirmCapture a propósito: así el formulario recién se
 * monta cuando los datos ya están, y sus useState arrancan con los valores
 * extraídos en vez de quedar vacíos.
 */
export default function CaptureProcessing({ captureId }: { captureId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let stop = false;
    const tick = async () => {
      const { data } = await supabase
        .from("captures")
        .select("status")
        .eq("id", captureId)
        .maybeSingle();
      if (!stop && data && (data as { status: string }).status !== "processing") {
        router.refresh();
      }
    };
    const t = setInterval(tick, 1200);
    return () => { stop = true; clearInterval(t); };
  }, [captureId, router]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/capturar" className="text-sm text-muted">←</Link>
        <h1 className="text-lg font-semibold">Leyendo comprobante…</h1>
      </div>
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-block w-5 h-5 rounded-full border-2 animate-spin shrink-0"
            style={{ borderColor: "var(--color-line)", borderTopColor: "var(--color-accent)" }}
            aria-hidden
          />
          <p className="text-sm text-muted">
            Extrayendo monto, comercio y fecha. Tarda unos segundos.
          </p>
        </div>
        <div className="space-y-2">
          {[70, 45, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded animate-pulse"
              style={{ width: `${w}%`, background: "var(--color-line)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
