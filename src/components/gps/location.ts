/* De dónde salen las ubicaciones.

   En el navegador: navigator.geolocation, que solo funciona con Chartly en
   pantalla. En la app nativa (Capacitor): el plugin de GPS en segundo plano,
   que sigue mandando ubicaciones con el teléfono bloqueado o en el bolsillo
   (en Android, con una notificación fija mientras mide). */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import type { Fix } from "@/lib/geo";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let plugin: BackgroundGeolocationPlugin | null = null;
function native(): BackgroundGeolocationPlugin {
  plugin ??= registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
  return plugin;
}

export type WatchOptions = {
  /** Texto de la notificación de Android mientras se usa el GPS en segundo plano. */
  title: string;
  message: string;
  /** Metros mínimos entre lecturas (solo nativo). */
  distanceFilter?: number;
};

/** Empieza a escuchar el GPS. Devuelve la función para dejar de escuchar. */
export function watchLocation(
  onFix: (fix: Fix) => void,
  onDenied: () => void,
  opts: WatchOptions,
): () => void {
  if (isNativeApp()) {
    let id: string | null = null;
    let stopped = false;
    native()
      .addWatcher(
        {
          backgroundTitle: opts.title,
          backgroundMessage: opts.message,
          requestPermissions: true,
          stale: false,
          distanceFilter: opts.distanceFilter ?? 0,
        },
        (loc, err) => {
          if (err) {
            if (err.code === "NOT_AUTHORIZED") onDenied();
            return;
          }
          if (!loc) return;
          onFix({ lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, t: loc.time ?? Date.now() });
        },
      )
      .then((watcherId) => {
        id = watcherId;
        if (stopped) native().removeWatcher({ id }).catch(() => {});
      })
      .catch(() => onDenied());
    return () => {
      stopped = true;
      if (id) native().removeWatcher({ id }).catch(() => {});
    };
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => onFix({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      t: pos.timestamp || Date.now(),
    }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) onDenied();
    },
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Abre los ajustes del sistema para dar el permiso de ubicación (solo nativo). */
export function openLocationSettings() {
  if (isNativeApp()) native().openSettings().catch(() => {});
}
