"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, daysUntil } from "@/lib/format";

type Status = "idea" | "active" | "paused" | "done";

type BoardRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  owner_id: string;
  status: Status;
  priority: number;
  due_date: string | null;
  updated_at: string;
};

type InvitationRow = {
  id: string;
  board_id: string;
  invited_email: string;
  role: "editor" | "viewer";
  status: string;
  message: string | null;
  created_at: string;
  boards?: { name: string; color: string | null } | null;
};

const TABS: { value: Status; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "idea", label: "Ideas" },
  { value: "paused", label: "Pausados" },
  { value: "done", label: "Hechos" },
];

export default function ProjectsList({
  userId,
  boards,
  members,
  cards,
  invitations,
}: {
  userId: string;
  boards: BoardRow[];
  members: { board_id: string; user_id: string; role: string }[];
  cards: { board_id: string; done: boolean }[];
  invitations: InvitationRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Status>("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const memberCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of members) m.set(r.board_id, (m.get(r.board_id) ?? 0) + 1);
    return m;
  }, [members]);

  const progress = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const c of cards) {
      const cur = m.get(c.board_id) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (c.done) cur.done += 1;
      m.set(c.board_id, cur);
    }
    return m;
  }, [cards]);

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc(
      accept ? "accept_board_invitation" : "reject_board_invitation",
      { p_invitation: id },
    );
    setBusyId(null);
    if (error) { alert(error.message); return; }
    router.refresh();
  }

  async function setStatus(id: string, status: Status) {
    const supabase = createClient();
    await supabase.from("boards").update({ status }).eq("id", id);
    router.refresh();
  }

  const list = boards.filter((b) => b.status === tab);

  return (
    <div className="space-y-4">
      {invitations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">
            Invitaciones pendientes ({invitations.length})
          </h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{inv.boards?.name ?? "Proyecto"}</p>
                    <p className="text-xs text-muted">
                      Te invitaron como{" "}
                      <span className="text-accent">
                        {inv.role === "editor" ? "editor" : "lector"}
                      </span>
                    </p>
                  </div>
                  <span className="pill pill-accent shrink-0">📬 nueva</span>
                </div>
                {inv.message && (
                  <p className="text-sm text-muted whitespace-pre-wrap">
                    &ldquo;{inv.message}&rdquo;
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === inv.id}
                    onClick={() => respond(inv.id, false)}
                    className="btn-ghost flex-1"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={busyId === inv.id}
                    onClick={() => respond(inv.id, true)}
                    className="btn-primary flex-1"
                  >
                    {busyId === inv.id ? "…" : "Aceptar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        {TABS.map((t) => {
          const n = boards.filter((b) => b.status === t.value).length;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`chip shrink-0 ${tab === t.value ? "chip-active" : ""}`}
            >
              {t.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-muted space-y-2">
          <p>Nada en {TABS.find((t) => t.value === tab)?.label.toLowerCase()}.</p>
          <Link href="/proyectos/nuevo" className="btn-primary inline-block">
            + Nuevo proyecto
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => {
            const isOwner = b.owner_id === userId;
            const count = memberCount.get(b.id) ?? 1;
            const prog = progress.get(b.id) ?? { total: 0, done: 0 };
            const pct = prog.total === 0 ? 0 : (prog.done / prog.total) * 100;
            const dDate = daysUntil(b.due_date);
            return (
              <li key={b.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/proyectos/${b.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.color && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: b.color }}
                          aria-hidden
                        />
                      )}
                      <p className="font-medium truncate">{b.name}</p>
                      {b.priority >= 4 && (
                        <span className="pill pill-warning">P{b.priority}</span>
                      )}
                      {count > 1 && (
                        <span className="pill pill-accent">👥 {count}</span>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-muted line-clamp-2 mt-0.5">{b.description}</p>
                    )}
                    <p className="text-[11px] text-muted mt-1">
                      {prog.total > 0
                        ? `${prog.done}/${prog.total} tarjetas`
                        : "Sin tarjetas"}
                      {!isOwner && " · compartido conmigo"}
                      {b.due_date && (
                        <span
                          className={
                            dDate !== null && dDate < 0
                              ? " text-danger"
                              : dDate !== null && dDate <= 3
                                ? " text-yellow-300"
                                : ""
                          }
                        >
                          {" · "}
                          {fmtDate(b.due_date)}
                        </span>
                      )}
                    </p>
                  </Link>
                  <div className="flex flex-col gap-1 shrink-0">
                    {b.status !== "active" && (
                      <button onClick={() => setStatus(b.id, "active")} className="chip text-xs" title="Activar">▶</button>
                    )}
                    {b.status !== "done" && (
                      <button onClick={() => setStatus(b.id, "done")} className="chip text-xs" title="Marcar hecho">✓</button>
                    )}
                    {b.status !== "paused" && b.status !== "done" && (
                      <button onClick={() => setStatus(b.id, "paused")} className="chip text-xs" title="Pausar">⏸</button>
                    )}
                  </div>
                </div>
                {prog.total > 0 && (
                  <div className="h-1 rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, background: b.color || "var(--color-accent)" }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
