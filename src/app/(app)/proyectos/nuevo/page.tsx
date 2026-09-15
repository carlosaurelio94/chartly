"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PRESET_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

const TEMPLATES: { id: string; label: string; columns: string[] }[] = [
  { id: "kanban", label: "Kanban (Backlog · Haciendo · Hecho)", columns: ["Backlog", "Haciendo", "Hecho"] },
  { id: "weekly", label: "Plan semanal", columns: ["Backlog", "Esta semana", "Haciendo", "Hecho", "Bloqueado"] },
  { id: "objectives", label: "Objetivos por estado", columns: ["Ideas", "Activo", "Pausado", "Hecho"] },
  { id: "blank", label: "En blanco", columns: [] },
];

export default function NuevoTableroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [templateId, setTemplateId] = useState("weekly");
  const [status, setStatus] = useState<"idea" | "active" | "paused" | "done">("active");
  const [priority, setPriority] = useState(3);
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }

    const { data: board, error } = await supabase
      .from("boards")
      .insert({
        owner_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        color,
        status,
        priority,
        due_date: dueDate || null,
      })
      .select("id")
      .single();

    if (error || !board) {
      setErr(error?.message ?? "No se pudo crear");
      setLoading(false);
      return;
    }

    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (tpl && tpl.columns.length > 0) {
      const rows = tpl.columns.map((title, i) => ({
        board_id: board.id,
        title,
        position: i,
      }));
      await supabase.from("board_columns").insert(rows);
    }

    router.push(`/proyectos/${board.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/proyectos" className="text-sm text-muted">← Volver</Link>
      </div>
      <div className="card space-y-3">
        <h1 className="text-lg font-semibold">Nuevo proyecto</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: BuenoTechAR — Hoja de Ruta"
              required
            />
          </div>
          <div>
            <label className="label">Descripción (opcional)</label>
            <textarea
              className="input mt-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿De qué trata este proyecto?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select
                className="input mt-1"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="active">En progreso</option>
                <option value="idea">Idea</option>
                <option value="paused">Pausado</option>
                <option value="done">Hecho</option>
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input
                type="date"
                className="input mt-1"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Prioridad (1 baja · 5 crítica)</label>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`chip justify-center ${priority === p ? "chip-active" : ""}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 mt-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-accent" : "border-line"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Plantilla de columnas</label>
            <div className="grid gap-2 mt-1">
              {TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                    templateId === t.id ? "border-accent bg-accent/5" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    {t.columns.length > 0 && (
                      <p className="text-xs text-muted">{t.columns.join(" · ")}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
          <div className="flex gap-2 pt-2">
            <Link href="/proyectos" className="btn-ghost flex-1 text-center">Cancelar</Link>
            <button className="btn-primary flex-1" disabled={loading || !name.trim()}>
              {loading ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
