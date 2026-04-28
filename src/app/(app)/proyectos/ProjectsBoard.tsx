"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import { fmtDate, daysUntil } from "@/lib/format";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: "idea" | "active" | "paused" | "done";
  priority: number;
  due_date: string | null;
  created_at: string;
};

type Task = {
  id: string;
  project_id: string;
  text: string;
  done: boolean;
  due_date: string | null;
  position: number;
};

const TABS: { value: Project["status"]; label: string }[] = [
  { value: "active", label: "En progreso" },
  { value: "idea", label: "Ideas" },
  { value: "paused", label: "Pausados" },
  { value: "done", label: "Hechos" },
];

const PRIORITY_LABELS: Record<number, string> = {
  1: "Muy baja", 2: "Baja", 3: "Media", 4: "Alta", 5: "Crítica",
};

export default function ProjectsBoard({ initial, tasks }: { initial: Project[]; tasks: Task[] }) {
  const [tab, setTab] = useState<Project["status"]>("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const router = useRouter();

  const tasksByProject = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!m.has(t.project_id)) m.set(t.project_id, []);
      m.get(t.project_id)!.push(t);
    }
    return m;
  }, [tasks]);

  const list = initial.filter((p) => p.status === tab);

  async function setStatus(p: Project, status: Project["status"]) {
    const supabase = createClient();
    await supabase.from("projects").update({ status }).eq("id", p.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`chip border ${tab === t.value ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              {t.label} <span className="opacity-60">{initial.filter((p) => p.status === t.value).length}</span>
            </button>
          ))}
        </div>
        <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary shrink-0">+ Idea</button>
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-muted">Nada en {TABS.find((t) => t.value === tab)?.label.toLowerCase()}.</div>
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              tasks={tasksByProject.get(p.id) ?? []}
              onEdit={() => { setEditing(p); setOpen(true); }}
              onStatus={(s) => setStatus(p, s)}
              onChange={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      {open && (
        <ProjectModal
          key={editing?.id ?? "new"}
          open={open}
          onClose={() => setOpen(false)}
          editing={editing}
          defaultStatus={tab}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project, tasks, onEdit, onStatus, onChange,
}: {
  project: Project;
  tasks: Task[];
  onEdit: () => void;
  onStatus: (s: Project["status"]) => void;
  onChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDue, setNewDue] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");
  const [copied, setCopied] = useState(false);
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : (done / total) * 100;
  const dDate = daysUntil(project.due_date);
  const pendingCount = total - done;

  async function toggleTask(t: Task) {
    const supabase = createClient();
    await supabase.from("project_tasks").update({ done: !t.done }).eq("id", t.id);
    onChange();
  }

  async function deleteTask(t: Task) {
    const supabase = createClient();
    await supabase.from("project_tasks").delete().eq("id", t.id);
    onChange();
  }

  function startEdit(t: Task) {
    setEditingTaskId(t.id);
    setEditText(t.text);
    setEditDue(t.due_date ?? "");
  }

  async function saveEdit(t: Task) {
    if (!editText.trim()) { setEditingTaskId(null); return; }
    const supabase = createClient();
    await supabase.from("project_tasks").update({
      text: editText.trim(),
      due_date: editDue || null,
    }).eq("id", t.id);
    setEditingTaskId(null);
    onChange();
  }

  async function copyAll() {
    const lines = [project.name];
    if (project.description) lines.push(project.description);
    lines.push("");
    for (const t of tasks) {
      const mark = t.done ? "[x]" : "[ ]";
      const due = t.due_date ? ` (${fmtDate(t.due_date)})` : "";
      lines.push(`${mark} ${t.text}${due}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const maxPos = tasks.reduce((m, t) => Math.max(m, t.position), -1);
    await supabase.from("project_tasks").insert({
      project_id: project.id,
      user_id: user.id,
      text: newText.trim(),
      due_date: newDue || null,
      position: maxPos + 1,
    });
    setNewText(""); setNewDue("");
    setAdding(false);
    onChange();
  }

  return (
    <li className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={() => setExpanded((v) => !v)} className="text-left w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted text-xs w-3 inline-block">{expanded ? "▼" : "▶"}</span>
              <p className="font-medium">{project.name}</p>
              {project.priority >= 1 && (
                <span className="text-xs chip border border-line text-muted">
                  P{project.priority}
                </span>
              )}
              {total > 0 && (
                <span className="text-xs text-muted">{done}/{total}{pendingCount > 0 ? ` · ${pendingCount} pend.` : ""}</span>
              )}
            </div>
            {project.description && <p className="text-sm text-muted whitespace-pre-wrap mt-1">{project.description}</p>}
            {project.due_date && (
              <p className="text-xs mt-1">
                <span className="text-muted">Entrega: </span>
                <span className={dDate !== null && dDate < 0 ? "text-danger" : dDate !== null && dDate <= 3 ? "text-yellow-300" : "text-muted"}>
                  {fmtDate(project.due_date)}
                  {dDate !== null && (dDate < 0 ? ` (vencido ${Math.abs(dDate)}d)` : dDate === 0 ? " (hoy)" : ` (en ${dDate}d)`)}
                </span>
              </p>
            )}
          </button>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onEdit} className="chip border border-line text-xs" title="Editar">✏</button>
          {project.status !== "active" && <button onClick={() => onStatus("active")} className="chip border border-line text-xs">▶</button>}
          {project.status !== "done" && <button onClick={() => onStatus("done")} className="chip border border-line text-xs">✓</button>}
          {project.status !== "paused" && project.status !== "done" && <button onClick={() => onStatus("paused")} className="chip border border-line text-xs">⏸</button>}
        </div>
      </div>

      {total > 0 && (
        <div className="h-1 rounded-full bg-line overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}

      {expanded && tasks.length > 0 && (
        <ul className="space-y-1">
          {tasks.map((t) => {
            const td = daysUntil(t.due_date);
            const isEditing = editingTaskId === t.id;
            if (isEditing) {
              return (
                <li key={t.id} className="space-y-2">
                  <input
                    className="input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveEdit(t); }
                      if (e.key === "Escape") setEditingTaskId(null);
                    }}
                  />
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                    />
                    <button type="button" onClick={() => setEditingTaskId(null)} className="btn-ghost">Cancelar</button>
                    <button type="button" onClick={() => saveEdit(t)} className="btn-primary">Guardar</button>
                  </div>
                </li>
              );
            }
            return (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggleTask(t)}
                  className="shrink-0"
                />
                <button
                  onClick={() => startEdit(t)}
                  className={`flex-1 text-left ${t.done ? "line-through text-muted" : ""}`}
                >
                  {t.text}
                </button>
                {t.due_date && (
                  <span className={`text-xs shrink-0 ${td !== null && td < 0 && !t.done ? "text-danger" : "text-muted"}`}>
                    {fmtDate(t.due_date)}
                  </span>
                )}
                <button onClick={() => deleteTask(t)} className="text-xs text-muted hover:text-danger shrink-0">✕</button>
              </li>
            );
          })}
        </ul>
      )}

      {expanded && (
        adding ? (
          <form onSubmit={addTask} className="space-y-2">
            <input
              className="input"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Nueva tarea…"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
              <button type="button" onClick={() => { setAdding(false); setNewText(""); setNewDue(""); }} className="btn-ghost">Cancelar</button>
              <button className="btn-primary">Agregar</button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setAdding(true)} className="text-xs text-accent">+ Agregar tarea</button>
            {tasks.length > 0 && (
              <button onClick={copyAll} className="text-xs text-muted hover:text-accent">
                {copied ? "✓ Copiado" : "📋 Copiar"}
              </button>
            )}
          </div>
        )
      )}
    </li>
  );
}

function ProjectModal({
  open, onClose, editing, defaultStatus, onDone,
}: {
  open: boolean;
  onClose: () => void;
  editing: Project | null;
  defaultStatus: Project["status"];
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<Project["status"]>(editing?.status ?? defaultStatus);
  const [priority, setPriority] = useState<number>(editing?.priority ?? 3);
  const [dueDate, setDueDate] = useState(editing?.due_date ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }
    const payload = {
      name,
      description: description || null,
      status,
      priority,
      due_date: dueDate || null,
    };
    if (editing) {
      const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
      if (error) { setErr(error.message); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("projects").insert({ ...payload, user_id: user.id });
      if (error) { setErr(error.message); setLoading(false); return; }
    }
    setLoading(false);
    onClose(); onDone();
  }

  async function remove() {
    if (!editing) return;
    if (!confirm("¿Eliminar este proyecto y todas sus tareas?")) return;
    const supabase = createClient();
    await supabase.from("projects").delete().eq("id", editing.id);
    onClose(); onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar proyecto" : "Nuevo proyecto / idea"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea className="input mt-1" rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Estado</label>
            <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>
              <option value="idea">Idea</option>
              <option value="active">En progreso</option>
              <option value="paused">Pausado</option>
              <option value="done">Hecho</option>
            </select>
          </div>
          <div>
            <label className="label">Fecha límite</label>
            <input type="date" className="input mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Prioridad (1 = más baja, 5 = crítica)</label>
          <div className="grid grid-cols-5 gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`chip border text-center ${priority === p ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-1">{PRIORITY_LABELS[priority] ?? "—"}</p>
        </div>
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          {editing && <button type="button" onClick={remove} className="btn-danger">Eliminar</button>}
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
