"use client";

/* El recorrido por GPS vive acá, en el layout, y no en la pantalla de
   Jornada: así sigue midiendo si te vas a Hoy o a Cuentas, y puede arrancar
   solo cuando el teléfono detecta que vas en movimiento (ver lib/motion).

   En la app nativa la espera y la medición siguen en segundo plano, con el
   teléfono bloqueado. En el navegador solo hay GPS con Chartly en pantalla. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fmtDuration, type Fix } from "@/lib/geo";
import { isNativeApp, watchLocation } from "./location";
import { pushMotionFix } from "@/lib/motion";
import { useGpsTracker } from "./useGpsTracker";

const AUTO_KEY = "chartly_gps_auto_v1";
/** Después de guardar o descartar, no volver a arrancar enseguida. */
const COOLDOWN_MS = 10 * 60_000;

type Tracker = ReturnType<typeof useGpsTracker>;

type Ctx = Tracker & {
  /** Arranque automático activado en este teléfono. */
  auto: boolean;
  /** Activa o desactiva el arranque automático. Al activarlo pide permiso de
   *  ubicación; devuelve false si no lo dan. */
  setAuto: (on: boolean) => Promise<boolean>;
  /** El recorrido en curso lo arrancó la detección de movimiento. */
  autoStarted: boolean;
};

const GpsContext = createContext<Ctx | null>(null);

export function useGps(): Ctx {
  const ctx = useContext(GpsContext);
  if (!ctx) throw new Error("useGps fuera de GpsProvider");
  return ctx;
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAuto(on: boolean) {
  try {
    if (on) localStorage.setItem(AUTO_KEY, "1");
    else localStorage.removeItem(AUTO_KEY);
  } catch {}
}

export default function GpsProvider({
  timezone,
  driver,
  children,
}: {
  timezone: string;
  driver: boolean;
  children: React.ReactNode;
}) {
  const gps = useGpsTracker(timezone);
  const [auto, setAutoState] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const [visible, setVisible] = useState(true);
  const cooldownUntil = useRef(0);
  const startRef = useRef(gps.start);
  useEffect(() => {
    startRef.current = gps.start;
  }, [gps.start]);

  useEffect(() => {
    setAutoState(readAuto());
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const setAuto = useCallback(async (on: boolean) => {
    if (!on) {
      writeAuto(false);
      setAutoState(false);
      return true;
    }
    // En la app nativa el permiso lo pide el plugin al empezar a escuchar.
    if (isNativeApp()) {
      writeAuto(true);
      setAutoState(true);
      return true;
    }
    if (!("geolocation" in navigator)) return false;
    // Pedimos el permiso ahora, con el usuario mirando, y no en medio de la calle.
    const ok = await new Promise<boolean>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (err) => resolve(err.code !== err.PERMISSION_DENIED),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      ),
    );
    writeAuto(ok);
    setAutoState(ok);
    return ok;
  }, []);

  // Esperar movimiento: solo con el modo conductor, el arranque automático
  // activado y nada en curso. En el navegador, además, con la app en
  // pantalla (en segundo plano no hay GPS); en la app nativa, siempre.
  const idle = gps.status === "idle";
  const listening = driver && auto && idle && (visible || isNativeApp());
  useEffect(() => {
    if (!listening) return;
    let win: Fix[] = [];
    let done = false;
    const stop = watchLocation(
      (fix) => {
        if (done || Date.now() < cooldownUntil.current) return;
        const r = pushMotionFix(win, fix);
        win = r.window;
        if (!r.moving) return;
        done = true;
        stop();
        if (startRef.current(win)) {
          setAutoStarted(true);
          navigator.vibrate?.(200);
        }
      },
      () => {
        writeAuto(false);
        setAutoState(false);
      },
      // 30 m entre lecturas: parado casi no despierta al teléfono.
      { title: "Chartly espera que arranques", message: "El recorrido empieza solo cuando te muevas", distanceFilter: 30 },
    );
    return stop;
  }, [listening]);

  const clear = gps.clear;
  const clearWithCooldown = useCallback(() => {
    cooldownUntil.current = Date.now() + COOLDOWN_MS;
    setAutoStarted(false);
    clear();
  }, [clear]);

  const value: Ctx = { ...gps, clear: clearWithCooldown, auto, setAuto, autoStarted };

  return (
    <GpsContext.Provider value={value}>
      {children}
      <GpsPill />
    </GpsContext.Provider>
  );
}

/* Fuera de Jornada, un recordatorio de que se está midiendo (o de que hay un
   recorrido terminado para guardar), que lleva de vuelta con un toque. */
function GpsPill() {
  const gps = useGps();
  const pathname = usePathname() ?? "";
  if (pathname === "/jornada" || pathname.startsWith("/jornada/")) return null;
  if (!gps.active && !gps.finished) return null;

  const text = gps.finished
    ? "Recorrido terminado · tocá para sumarlo"
    : `${gps.autoStarted ? "Arrancó solo · " : ""}${gps.distanceKm.toFixed(1)} km · ${fmtDuration(gps.elapsedMs)}`;

  return (
    <div
      className="fixed left-0 right-0 z-20 px-4 pointer-events-none"
      style={{ bottom: "calc(140px + env(safe-area-inset-bottom))" }}
    >
      <Link
        href="/jornada"
        className="mx-auto flex items-center justify-center pointer-events-auto rounded-full text-sm font-semibold"
        style={{
          width: "fit-content",
          padding: "8px 14px",
          background: "var(--color-accent)",
          color: "var(--color-accent-on)",
          boxShadow: "0 4px 16px rgb(0 0 0 / 0.25)",
        }}
      >
        📍 {text}
      </Link>
    </div>
  );
}
