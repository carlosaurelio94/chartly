"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureSubscribedSilently() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!VAPID_PUBLIC_KEY) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
  } catch {
    // Silencioso
  }
}

export default function NotificationsBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js")
      .then(() => ensureSubscribedSilently())
      .catch(() => {});
  }, []);

  // Don't auto-prompt; user enables from /ajustes.
  return null;
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return { ok: false, reason: "Tu navegador no soporta notificaciones push." };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "Falta VAPID_PUBLIC_KEY." };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permiso denegado." };

  // Asegurar que el SW esté registrado (algunas veces el bootstrap aún no terminó)
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!existing) await navigator.serviceWorker.register("/sw.js");
  } catch {
    // continuar; serviceWorker.ready abajo va a esperar
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Sesión expirada. Iniciá sesión de nuevo." };
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Forzar re-suscripción: borra la suscripción actual del navegador y crea una nueva
// en el push service. Sirve cuando la app figura "activada" pero el endpoint no
// llegó al servidor (caso del usuario).
export async function resyncPushSubscription(): Promise<{ ok: boolean; reason?: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return { ok: false, reason: "Tu navegador no soporta notificaciones push." };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "Falta VAPID_PUBLIC_KEY." };
  if (!("Notification" in window) || Notification.permission !== "granted")
    return { ok: false, reason: "No hay permiso del navegador. Activá las notificaciones primero." };

  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!existing) await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;

    const old = await reg.pushManager.getSubscription();
    if (old) {
      try { await old.unsubscribe(); } catch { /* ignore */ }
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = sub.toJSON();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "Sesión expirada. Iniciá sesión de nuevo." };
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return { ok: false, reason: msg };
  }
}
