"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: "idea" | "active" | "paused" | "done";
  priority: number;
  created_at: string;
};

const TABS: { value: Project["status"]; label: string }[] = [
  { value: "active", label: "En progreso" },
  { value: "idea", label: "Ideas" },
  { value: "paused", label: "Pausados" },
  { value: "done", label: "Hechos" },
];

export default function ProjectsBoard({ initial }: { initial: Project[] }) {
  const [tab, setTab] = useState<Project["status"]>("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const router = useRouter();

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
            <li key={p.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <button onClick={() => { setEditing(p); setOpen(true); }} className="text-left w-full">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="text-sm text-muted whitespace-pre-wrap mt-1">{p.description}</p>}
                  </button>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {p.status !== "active" && <button onClick={() => setStatus(p, "active")} className="chip border border-line text-xs">▶</button>}
                  {p.status !== "done" && <button onClick={() => setStatus(p, "done")} className="chip border border-line text-xs">✓</button>}
                  {p.status !== "paused" && p.status !== "done" && <button onClick={() => setStatus(p, "paused")} className="chip border border-line text-xs">⏸</button>}
                </div>
              </div>
            </li>
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
  const [priority, setPriority] = useState(editing?.priority ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }
    if (editing) {
      const { error } = await supabase.from("projects").update({
        name, description: description || null, status, priority,
      }).eq("id", editing.id);
      if (error) { setErr(error.message); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("projects").insert({
        user_id: user.id, name, description: description || null, status, priority,
      });
      if (error) { setErr(error.message); setLoading(false); return; }
    }
    setLoading(false);
    setName(""); setDescription(""); setPriority(0);
    onClose(); onDone();
  }

  async function remove() {
    if (!editing) return;
    if (!confirm("¿Eliminar este proyecto?")) return;
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
          <textarea className="input mt-1" rows={4} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
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
            <label className="label">Prioridad</label>
            <input type="number" className="input mt-1" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </div>
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
