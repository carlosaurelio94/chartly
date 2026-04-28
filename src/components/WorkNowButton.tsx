"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "work_now_active";

type Active = { id: string; startedAt: number; durationMin: number; title: string };

export default function WorkNowButton() {
  const [active, setActive] = useState<Active | null>(null);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(25);
  const [title, setTitle] = useState("Trabajo");
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        const a = JSON.parse(raw) as Active;
        if (a.startedAt + a.durationMin * 60_000 > Date.now()) setActive(a);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  async function start() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const startedAt = Date.now();
    const ends = new Date(startedAt + duration * 60_000);
    const { data, error } = await supabase.from("agenda_items").insert({
      user_id: user.id,
      title: title.trim() || "Trabajo",
      starts_at: new Date(startedAt).toISOString(),
      ends_at: ends.toISOString(),
      all_day: false,
      category: "work",
      done: false,
    }).select("id").maybeSingle();
    if (error || !data) return;
    const a: Active = { id: data.id, startedAt, durationMin: duration, title: title.trim() || "Trabajo" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    setActive(a);
    setOpen(false);
  }

  async function finish(markDone: boolean) {
    if (!active) return;
    const supabase = createClient();
    const realEnd = new Date();
    await supabase.from("agenda_items").update({
      ends_at: realEnd.toISOString(),
      done: markDone,
    }).eq("id", active.id);
    localStorage.removeItem(STORAGE_KEY);
    setActive(null);
  }

  if (active) {
    const elapsed = now - active.startedAt;
    const total = active.durationMin * 60_000;
    const remaining = Math.max(0, total - elapsed);
    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);
    const pct = Math.min(100, (elapsed / total) * 100);
    const overdue = remaining === 0;
    return (
      <div className="fixed left-0 right-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 px-4 pb-2 pointer-events-none">
        <div className="max-w-xl mx-auto card border-accent shadow-lg pointer-events-auto space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">{overdue ? "Bloque cumplido" : "Trabajando"}</p>
              <p className="font-semibold truncate">{active.title}</p>
            </div>
            <p className={`text-2xl font-mono tabular-nums shrink-0 ${overdue ? "text-ok" : ""}`}>
              {mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
            </p>
          </div>
          <div className="h-1 rounded-full bg-line overflow-hidden">
            <div className={`h-full ${overdue ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => finish(false)} className="btn-ghost flex-1 text-sm">Cancelar</button>
            <button onClick={() => finish(true)} className="btn-primary flex-1 text-sm">✓ Terminar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 w-14 h-14 rounded-full bg-accent text-black shadow-lg flex items-center justify-center text-2xl"
        aria-label="Trabajar ahora"
        title="Trabajar ahora"
      >
        ▶
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-line rounded-2xl w-full max-w-md p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-semibold">Trabajar ahora</p>
              <p className="text-xs text-muted">Crea un bloque de agenda y arranca el cronómetro.</p>
            </div>
            <div>
              <label className="label">Título</label>
              <input
                className="input mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Trabajo, Estudio, etc."
              />
            </div>
            <div>
              <label className="label">Duración</label>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {[15, 25, 45, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    className={`chip border justify-center ${duration === m ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={start} className="btn-primary flex-1">Empezar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
