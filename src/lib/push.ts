import "server-only";
import webpush, { type PushSubscription } from "web-push";

let configured = false;

/**
 * Envía un Web Push. Las claves VAPID se cargan en el primer envío y no al
 * importar el módulo: si setVapidDetails corre a nivel de módulo y falta una
 * key, `next build` explota al recolectar las rutas (pasaba en los previews de
 * Vercel, que no tienen las keys). Así, sin keys solo falla el envío, que cada
 * ruta ya maneja dentro de su try/catch.
 */
export function sendPush(subscription: PushSubscription, payload: string) {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:owner@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return webpush.sendNotification(subscription, payload);
}
