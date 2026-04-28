"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Result =
  | { kind: "bill"; id: string; title: string; subtitle: string }
  | { kind: "project"; id: string; title: string; subtitle: string }
  | { kind: "task"; id: string; project_id: string; title: string; subtitle: string }
  | { kind: "agenda"; id: string; title: string; subtitle: string };

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setResults([]); }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const like = `%${term}%`;
      const [bills, projects, tasks, agenda] = await Promise.all([
        supabase.from("bills").select("id, name, currency, kind, archived").eq("archived", false).ilike("name", like).limit(8),
        supabase.from("projects").select("id, name, status").ilike("name", like).limit(8),
        supabase.from("project_tasks").select("id, project_id, text, done").ilike("text", like).limit(8),
        supabase.from("agenda_items").select("id, title, starts_at, done").ilike("title", like).limit(8),
      ]);
      if (cancelled) return;
      const out: Result[] = [];
      for (const b of bills.data ?? []) {
        out.push({ kind: "bill", id: b.id, title: b.name, subtitle: `${b.kind === "income" ? "Ingreso" : "Gasto"} · ${b.currency}` });
      }
      for (const p of projects.data ?? []) {
        out.push({ kind: "project", id: p.id, title: p.name, subtitle: `Proyecto · ${p.status}` });
      }
      for (const t of tasks.data ?? []) {
        out.push({ kind: "task", id: t.id, project_id: t.project_id, title: t.text, subtitle: `Tarea ${t.done ? "✓" : ""}` });
      }
      for (const a of agenda.data ?? []) {
        const d = new Date(a.starts_at);
        out.push({ kind: "agenda", id: a.id, title: a.title, subtitle: `Agenda · ${d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}` });
      }
      setResults(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [q]);

  const grouped = useMemo(() => {
    const order: Result["kind"][] = ["bill", "project", "task", "agenda"];
    const labels: Record<Result["kind"], string> = {
      bill: "Cuentas", project: "Proyectos", task: "Tareas", agenda: "Agenda",
    };
    return order
      .map((k) => ({ kind: k, label: labels[k], items: results.filter((r) => r.kind === k) }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  function go(r: Result) {
    setOpen(false);
    if (r.kind === "bill") router.push(`/cuentas/${r.id}`);
    else if (r.kind === "project" || r.kind === "task") router.push(`/proyectos`);
    else if (r.kind === "agenda") router.push(`/agenda`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-muted hover:text-fg p-2"
        aria-label="Buscar"
        title="Buscar (Ctrl+K)"
      >
        🔍
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-line rounded-2xl w-full max-w-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line p-3">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cuentas, proyectos, tareas, agenda…"
                className="input"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="text-sm text-muted p-4 text-center">Escribí al menos 2 letras…</p>
              ) : loading ? (
                <p className="text-sm text-muted p-4 text-center">Buscando…</p>
              ) : grouped.length === 0 ? (
                <p className="text-sm text-muted p-4 text-center">Sin resultados.</p>
              ) : (
                grouped.map((g) => (
                  <div key={g.kind} className="border-b border-line last:border-b-0">
                    <p className="label px-3 pt-3 pb-1">{g.label}</p>
                    <ul>
                      {g.items.map((r) => (
                        <li key={`${r.kind}-${r.id}`}>
                          <button
                            onClick={() => go(r)}
                            className="w-full text-left px-3 py-2 hover:bg-line/40 flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{r.title}</span>
                            <span className="text-xs text-muted shrink-0">{r.subtitle}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
