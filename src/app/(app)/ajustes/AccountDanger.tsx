"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

/** Exportar mis datos y borrar la cuenta. */
export default function AccountDanger() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError("No se pudo borrar la cuenta. Revisá la conexión y probá de nuevo.");
      return;
    }
    navigator.serviceWorker?.controller?.postMessage("chartly:clear-cache");
    try { localStorage.clear(); } catch {}
    window.location.href = "/";
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <a href="/api/account/export" className="btn-ghost text-sm" download>Descargar mis datos</a>
      <button onClick={() => setOpen(true)} className="btn-ghost text-sm text-danger">Borrar mi cuenta</button>

      <Modal open={open} onClose={() => setOpen(false)} title="Borrar mi cuenta">
        <div className="space-y-3">
          <p className="text-sm">
            Se borran para siempre tus cuentas, pagos, jornadas, recorridos, agenda y los tableros que creaste.
            No se puede deshacer.
          </p>
          <p className="text-xs text-muted">Si querés guardar una copia, primero tocá «Descargar mis datos».</p>
          <label className="label" htmlFor="confirm-delete">Escribí BORRAR para confirmar</label>
          <input id="confirm-delete" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            onClick={remove}
            disabled={busy || confirm.trim().toUpperCase() !== "BORRAR"}
            className="btn-danger w-full"
          >
            {busy ? "Borrando…" : "Borrar todo"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
