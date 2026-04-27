"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPush } from "@/components/NotificationsBootstrap";

export default function AjustesClient({ email }: { email: string }) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  async function enable() {
    setMsg(null);
    const r = await subscribeToPush();
    if (r.ok) {
      setPerm("granted");
      setMsg("Notificaciones activadas en este dispositivo.");
    } else {
      setMsg(r.reason ?? "No se pudo activar.");
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="label">Sesión</p>
        <p className="font-medium">{email}</p>
        <button onClick={signOut} className="btn-ghost mt-3">Cerrar sesión</button>
      </div>

      <div className="card space-y-3">
        <div>
          <p className="label">Notificaciones</p>
          <p className="text-sm text-muted mt-1">
            Para recibir recordatorios, activa las notificaciones en este dispositivo.
            En iPhone, primero <span className="text-accent">Añade a pantalla de inicio</span> desde Safari.
          </p>
        </div>
        {perm === "unsupported" && (
          <p className="text-sm text-danger">Tu navegador no soporta notificaciones.</p>
        )}
        {perm === "granted" ? (
          <p className="text-sm text-ok">Activadas en este dispositivo ✓</p>
        ) : (
          <button onClick={enable} className="btn-primary">Activar notificaciones</button>
        )}
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>

      <div className="card">
        <p className="label">Instalar app</p>
        <p className="text-sm text-muted mt-1">
          Android Chrome: menú ⋮ → <span className="text-accent">Añadir a pantalla principal</span>.<br />
          iPhone Safari: ⬆️ → <span className="text-accent">Añadir a pantalla de inicio</span>.
        </p>
      </div>
    </div>
  );
}
