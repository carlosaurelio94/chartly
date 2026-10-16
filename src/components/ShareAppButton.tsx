"use client";

/* Compartir Chartly. Manda el link de la página de instalación con el menú de
   compartir del teléfono (WhatsApp, Telegram…); si el navegador no lo tiene,
   abre WhatsApp directo. Funciona igual en Android y iPhone. */

import { useState } from "react";

const MESSAGE = "Uso Chartly para ordenar mi plata y mis jornadas. Instalala gratis desde acá:";

export default function ShareAppButton() {
  const [info, setInfo] = useState<string | null>(null);

  async function share() {
    setInfo(null);
    const url = `${window.location.origin}/instalar`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Chartly", text: MESSAGE, url });
        return;
      } catch (e) {
        // Cancelar el menú no es un error.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${url}`)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    setInfo("Abrimos WhatsApp con el link.");
  }

  return (
    <div className="card space-y-2">
      <p className="font-medium">Recomendar Chartly</p>
      <p className="text-xs text-muted">Mandale el link a quien le pueda servir.</p>
      <button onClick={share} className="btn-ghost w-full">Compartir link</button>
      {info && <p className="text-xs text-muted">{info}</p>}
    </div>
  );
}
