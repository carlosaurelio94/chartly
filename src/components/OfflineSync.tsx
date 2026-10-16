"use client";

/* Manda lo que se anotó sin señal apenas vuelve la conexión, y mientras tanto
   avisa cuántos registros esperan. Vive en el layout: cualquier pantalla
   abierta sirve para vaciar la cola. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { flushQueue, readQueue, type FlushClient, type Pending } from "@/lib/offline-queue";

export default function OfflineSync() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const running = useRef(false);

  useEffect(() => {
    const refresh = () => {
      setCount(readQueue().length);
      setOnline(navigator.onLine);
    };

    const sync = async () => {
      refresh();
      if (running.current || !navigator.onLine || readQueue().length === 0) return;
      running.current = true;
      try {
        const supabase = createClient();
        // getSession lee la cookie: no necesita red para saber quién es.
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return;

        // Un registro de jornada hecho sin señal no conoce el id de la jornada
        // del día: se resuelve (o se crea) recién al enviarlo.
        const shiftIds = new Map<string, string>();
        const prepare = async (p: Pending) => {
          if (p.table !== "gig_entries" || p.row.shift_id) return p.row;
          const date = String(p.row.shift_date);
          let id = shiftIds.get(date);
          if (!id) {
            await supabase.from("gig_shifts").upsert(
              { user_id: uid, shift_date: date },
              { onConflict: "user_id,shift_date", ignoreDuplicates: true },
            );
            const { data, error } = await supabase.from("gig_shifts").select("id").eq("shift_date", date).maybeSingle();
            if (error) throw error;
            id = (data as { id: string } | null)?.id;
            if (id) shiftIds.set(date, id);
          }
          return { ...p.row, shift_id: id ?? null };
        };

        const res = await flushQueue(supabase as unknown as FlushClient, { prepare });
        if (res.sent > 0) router.refresh();
      } finally {
        running.current = false;
        refresh();
      }
    };

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", refresh);
    window.addEventListener("chartly:queue", refresh);
    const t = setInterval(sync, 60_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("chartly:queue", refresh);
      clearInterval(t);
    };
  }, [router]);

  if (count === 0) return null;
  return (
    <div
      className="fixed left-0 right-0 z-20 px-4 pointer-events-none"
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
      role="status"
    >
      <p className="max-w-xl mx-auto card-sm text-xs text-center pointer-events-auto" style={{ padding: "8px 12px" }}>
        ☁︎ {count} {count === 1 ? "registro guardado" : "registros guardados"} en el teléfono ·{" "}
        {online ? "enviando…" : "se mandan solos cuando vuelva la señal"}
      </p>
    </div>
  );
}
