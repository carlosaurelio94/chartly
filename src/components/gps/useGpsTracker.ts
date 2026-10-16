"use client";

/* Mide un recorrido con el GPS del teléfono mientras la app está abierta.

   Límite honesto de una web app: el navegador deja de dar posiciones cuando
   la pantalla se apaga o se cambia de app (sobre todo en iPhone). Para que eso
   pase lo menos posible pedimos que la pantalla no se apague (Wake Lock) y,
   cuando la app vuelve, la distancia perdida se suma en línea recta (ver
   addFix). El recorrido en curso se guarda en el teléfono, así que recargar o
   cerrar la app no lo pierde. */

import { useCallback, useEffect, useRef, useState } from "react";
import { addFix, emptyTrack, type TrackState } from "@/lib/geo";

const STORAGE_KEY = "chartly_gps_track_v1";
const PERSIST_EVERY_MS = 15_000;

export type GpsStatus = "idle" | "starting" | "tracking" | "finished" | "denied" | "unsupported" | "error";

type Saved = { id: string; startedAt: number; endedAt?: number; date: string; track: TrackState };

export type FinishedTrack = {
  id: string;
  startedAt: number;
  endedAt: number;
  date: string;
  track: TrackState;
};

type WakeLockSentinelLike = { release: () => Promise<void> };

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (typeof s?.startedAt !== "number" || !s.track || typeof s.id !== "string") return null;
    return s;
  } catch {
    return null;
  }
}

function writeSaved(s: Saved | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado): el recorrido sigue en memoria.
  }
}

export function useGpsTracker(todayStr: string) {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [track, setTrack] = useState<TrackState>(emptyTrack);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);
  const saved = useRef<Saved | null>(null);
  const lastPersist = useRef(0);

  const persist = useCallback((force = false) => {
    if (!saved.current) return;
    if (!force && Date.now() - lastPersist.current < PERSIST_EVERY_MS) return;
    lastPersist.current = Date.now();
    writeSaved(saved.current);
  }, []);

  const requestWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock || wakeLock.current) return;
    try {
      wakeLock.current = await nav.wakeLock.request("screen");
    } catch {
      // Batería baja o el navegador no lo permite: seguimos sin él.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  const watch = useCallback(() => {
    if (watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: pos.timestamp || Date.now(),
        };
        setStatus("tracking");
        setLastFixAt(fix.t);
        setAccuracy(fix.accuracy);
        setTrack((prev) => {
          const next = addFix(prev, fix);
          if (saved.current) saved.current = { ...saved.current, track: next };
          return next;
        });
        persist();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          stopWatching();
        } else {
          // Sin señal o timeout: el seguimiento sigue, solo avisamos.
          setStatus((s) => (s === "starting" ? "tracking" : s));
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  function stopWatching() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }

  // Retomar un recorrido que quedó en curso (recarga, app cerrada).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    const s = readSaved();
    if (!s) return;
    saved.current = s;
    setStartedAt(s.startedAt);
    setTrack(s.track);
    if (s.endedAt) {
      // Terminado pero sin guardar (falló la red): queda listo para reintentar.
      setStatus("finished");
      return;
    }
    setStatus("starting");
    watch();
    requestWakeLock();
    return () => stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reloj, y volver a pedir la pantalla encendida al volver a la app.
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
      else persist(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [startedAt, persist, requestWakeLock]);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    // Nunca pisar un recorrido en curso o uno terminado sin guardar.
    if (saved.current || readSaved()) return;
    const s: Saved = { id: crypto.randomUUID(), startedAt: Date.now(), date: todayStr, track: emptyTrack() };
    saved.current = s;
    writeSaved(s);
    setStartedAt(s.startedAt);
    setTrack(s.track);
    setLastFixAt(null);
    setAccuracy(null);
    setStatus("starting");
    watch();
    requestWakeLock();
  }, [todayStr, watch, requestWakeLock]);

  /** Termina el recorrido y lo devuelve para guardarlo. No lo borra del
   *  teléfono hasta que se confirme con `clear()`: si falla la red al guardar,
   *  no se pierde. */
  const stop = useCallback((): FinishedTrack | null => {
    stopWatching();
    releaseWakeLock();
    const s = saved.current;
    if (!s) return null;
    const done = { ...s, endedAt: s.endedAt ?? Date.now() };
    saved.current = done;
    writeSaved(done);
    setStatus("finished");
    return { id: done.id, startedAt: done.startedAt, endedAt: done.endedAt, date: done.date, track: done.track };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseWakeLock]);

  const clear = useCallback(() => {
    stopWatching();
    releaseWakeLock();
    saved.current = null;
    writeSaved(null);
    setStartedAt(null);
    setTrack(emptyTrack());
    setLastFixAt(null);
    setAccuracy(null);
    setStatus((s) => (s === "unsupported" ? s : "idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseWakeLock]);

  const endedAt = saved.current?.endedAt ?? null;
  return {
    status,
    active: startedAt !== null && status !== "idle" && status !== "finished",
    finished: status === "finished" && saved.current
      ? { id: saved.current.id, startedAt: saved.current.startedAt, endedAt: endedAt ?? now, date: saved.current.date, track: saved.current.track }
      : null,
    startedAt,
    elapsedMs: startedAt ? (endedAt ?? now) - startedAt : 0,
    distanceKm: track.distanceKm,
    points: track.points,
    accuracy,
    signalStale: lastFixAt !== null && now - lastFixAt > 60_000,
    start,
    stop,
    clear,
  };
}
