"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/format";

type Parsed = {
  clase?: string;
  tipo?: "gasto" | "ingreso";
  monto?: number | null;
  moneda?: string | null;
  comercio?: string | null;
  // Resumen de jornada
  plataforma?: string | null;
  total?: number | null;
  items?: { monto: number }[];
};

type Capture = {
  id: string;
  source: string;
  mime_type: string | null;
  raw_text: string | null;
  parsed: Parsed | null;
  confidence: number | null;
  status: string;
  created_at: string;
};

export default function CaptureInbox({ pending }: { pending: Capture[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/share", { method: "POST", body: fd, redirect: "follow" });
      // El endpoint redirige a /capturar/<id>; seguimos esa URL.
      if (res.redirected) {
        router.push(new URL(res.url).pathname);
        return;
      }
      if (!res.ok) throw new Error("No se pudo procesar");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo procesar");
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    setErr(null);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          await upload(new File([blob], "captura.png", { type }));
          return;
        }
      }
      // Sin imagen: probamos con texto.
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setBusy(true);
        const fd = new FormData();
        fd.append("text", text);
        const res = await fetch("/api/share", { method: "POST", body: fd, redirect: "follow" });
        if (res.redirected) { router.push(new URL(res.url).pathname); return; }
        router.refresh();
        return;
      }
      setErr("No hay nada copiado.");
    } catch {
      setErr("Tu navegador no dejó leer el portapapeles. Usá «Subir captura».");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <p className="label">Cargar un comprobante</p>
          <p className="text-xs text-muted mt-1">
            En Android compartí directo desde Mercado Pago o tu banco y elegí Chartly.
            Acá podés pegar o subir la captura a mano.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={pasteFromClipboard} className="btn-ghost" disabled={busy}>
            Pegar captura
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-primary" disabled={busy}>
            {busy ? "Leyendo…" : "Subir captura"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {err && <p className="text-danger text-sm">{err}</p>}
        <p className="text-[11px] text-muted">
          La imagen se lee al momento y se descarta. No queda guardada.
        </p>
      </div>

      <div className="space-y-2">
        <p className="label">Pendientes de confirmar</p>
        {pending.length === 0 ? (
          <div className="card text-center text-muted text-sm">
            No hay capturas pendientes.
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((c) => {
              const p = c.parsed ?? {};
              const conf = c.confidence ?? 0;
              const isGig = p.clase === "jornada";
              const items = p.items ?? [];
              const gigTotal =
                p.total ?? items.reduce((s, x) => s + Number(x.monto ?? 0), 0);
              return (
                <li key={c.id}>
                  <Link
                    href={`/capturar/${c.id}`}
                    className="card block hover:border-accent transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {isGig
                            ? `🛵 ${p.plataforma ?? "Jornada"}`
                            : p.comercio || "Sin identificar"}
                        </p>
                        <p className="text-xs text-muted">
                          {isGig && `${items.length} registros · `}
                          {new Date(c.created_at).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold tabular">
                          {isGig
                            ? fmtMoney(gigTotal, p.moneda || "ARS")
                            : p.monto != null
                              ? fmtMoney(p.monto, p.moneda || "ARS")
                              : "—"}
                        </p>
                        <span
                          className={`pill ${conf >= 0.8 ? "pill-success" : "pill-warning"} mt-1`}
                        >
                          {conf >= 0.8 ? "listo" : "revisar"}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
