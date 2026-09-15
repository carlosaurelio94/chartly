"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import { fmtDate, daysUntil } from "@/lib/format";

type Board = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  archived: boolean;
  updated_at: string;
};

type Column = {
  id: string;
  title: string;
  position: number;
  color: string | null;
};

type Card = {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  assignee_user_id: string | null;
  done: boolean;
  created_by: string | null;
};

type Member = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  joined_at: string;
};

type Invitation = {
  id: string;
  invited_email: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
};

export default function BoardView({
  currentUserId,
  board,
  columns,
  cards,
  members,
  invitations,
}: {
  currentUserId: string;
  currentUserEmail: string;
  board: Board;
  columns: Column[];
  cards: Card[];
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const isOwner = board.owner_id === currentUserId;
  const myRole = members.find((m) => m.user_id === currentUserId)?.role ?? null;
  const canEdit = isOwner || myRole === "editor";

  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const cardsByCol = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of cards) {
      if (!m.has(c.column_id)) m.set(c.column_id, []);
      m.get(c.column_id)!.push(c);
    }
    for (const [, v] of m) v.sort((a, b) => a.position - b.position);
    return m;
  }, [cards]);

  async function addCard(columnId: string) {
    const title = newCardTitle.trim();
    if (!title) return;
    const supabase = createClient();
    const colCards = cardsByCol.get(columnId) ?? [];
    const maxPos = colCards.reduce((m, c) => Math.max(m, c.position), -1);
    const { error } = await supabase.from("board_cards").insert({
      board_id: board.id,
      column_id: columnId,
      title,
      position: maxPos + 1,
      created_by: currentUserId,
    });
    if (error) { alert(error.message); return; }
    setNewCardTitle("");
    setAddingTo(null);
    router.refresh();
  }

  async function toggleDone(card: Card) {
    const supabase = createClient();
    await supabase.from("board_cards").update({ done: !card.done }).eq("id", card.id);
    router.refresh();
  }

  async function moveCard(card: Card, targetColId: string) {
    if (card.column_id === targetColId) return;
    const supabase = createClient();
    const targetCards = cardsByCol.get(targetColId) ?? [];
    const maxPos = targetCards.reduce((m, c) => Math.max(m, c.position), -1);
    await supabase
      .from("board_cards")
      .update({ column_id: targetColId, position: maxPos + 1 })
      .eq("id", card.id);
    router.refresh();
  }

  async function addColumn(e: React.FormEvent) {
    e.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    const supabase = createClient();
    const maxPos = columns.reduce((m, c) => Math.max(m, c.position), -1);
    await supabase.from("board_columns").insert({
      board_id: board.id,
      title,
      position: maxPos + 1,
    });
    setNewColumnTitle("");
    setAddingColumn(false);
    router.refresh();
  }

  async function deleteColumn(col: Column) {
    if (!confirm(`¿Eliminar la columna "${col.title}" y sus tarjetas?`)) return;
    const supabase = createClient();
    await supabase.from("board_columns").delete().eq("id", col.id);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href="/proyectos" className="text-sm text-muted shrink-0">←</Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate" style={board.color ? { color: board.color } : undefined}>
            {board.name}
          </h1>
          {board.description && (
            <p className="text-xs text-muted line-clamp-2">{board.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="chip border border-line text-xs"
              title="Invitar"
            >
              ＋👥
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="chip border border-line text-xs"
            title="Ajustes"
          >
            ⚙
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        👥 {members.length} {members.length === 1 ? "miembro" : "miembros"}
        {invitations.filter((i) => i.status === "pending").length > 0 && (
          <span className="ml-2">
            · 📬 {invitations.filter((i) => i.status === "pending").length} pendientes
          </span>
        )}
        {!canEdit && <span className="ml-2 text-yellow-300">· solo lectura</span>}
      </p>

      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-3 min-w-max">
          {columns.map((col) => {
            const colCards = cardsByCol.get(col.id) ?? [];
            const doneCount = colCards.filter((c) => c.done).length;
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 rounded-2xl bg-card border border-line p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{col.title}</p>
                  <span className="text-xs text-muted">
                    {colCards.length}{doneCount > 0 ? ` · ${doneCount}✓` : ""}
                  </span>
                </div>
                <ul className="space-y-2">
                  {colCards.map((c) => {
                    const dDays = daysUntil(c.due_date);
                    return (
                      <li
                        key={c.id}
                        className={`rounded-xl border p-2 bg-bg/40 ${c.done ? "opacity-60" : ""}`}
                        style={{ borderColor: "rgb(var(--line) / 1)" }}
                      >
                        <div className="flex items-start gap-2">
                          {canEdit && (
                            <input
                              type="checkbox"
                              checked={c.done}
                              onChange={() => toggleDone(c)}
                              className="mt-0.5 shrink-0"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => canEdit && setEditingCard(c)}
                            className="text-left flex-1 min-w-0"
                          >
                            <p className={`text-sm ${c.done ? "line-through" : ""}`}>{c.title}</p>
                            {c.description && (
                              <p className="text-xs text-muted line-clamp-2 mt-0.5">{c.description}</p>
                            )}
                            {c.due_date && (
                              <p
                                className={`text-[11px] mt-1 ${
                                  dDays !== null && dDays < 0 && !c.done
                                    ? "text-danger"
                                    : dDays !== null && dDays <= 3 && !c.done
                                    ? "text-yellow-300"
                                    : "text-muted"
                                }`}
                              >
                                📅 {fmtDate(c.due_date)}
                                {dDays !== null && (dDays < 0 ? ` (vencido ${Math.abs(dDays)}d)` : dDays === 0 ? " (hoy)" : ` (en ${dDays}d)`)}
                              </p>
                            )}
                          </button>
                        </div>
                        {canEdit && columns.length > 1 && (
                          <div className="flex gap-1 mt-2 overflow-x-auto no-scrollbar">
                            {columns
                              .filter((other) => other.id !== c.column_id)
                              .map((other) => (
                                <button
                                  key={other.id}
                                  type="button"
                                  onClick={() => moveCard(c, other.id)}
                                  className="text-[10px] chip border border-line text-muted shrink-0"
                                  title={`Mover a ${other.title}`}
                                >
                                  → {other.title}
                                </button>
                              ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {canEdit && (
                  addingTo === col.id ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); addCard(col.id); }}
                      className="space-y-2"
                    >
                      <input
                        className="input"
                        placeholder="Título de la tarjeta"
                        value={newCardTitle}
                        onChange={(e) => setNewCardTitle(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setAddingTo(null); setNewCardTitle(""); }}
                          className="btn-ghost flex-1"
                        >
                          Cancelar
                        </button>
                        <button className="btn-primary flex-1" type="submit">Agregar</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => { setAddingTo(col.id); setNewCardTitle(""); }}
                        className="text-xs text-accent"
                      >
                        + Tarjeta
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteColumn(col)}
                        className="text-xs text-muted hover:text-danger"
                        title="Eliminar columna"
                      >
                        ✕ columna
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}

          {canEdit && (
            <div className="w-72 shrink-0 rounded-2xl border border-dashed border-line p-3">
              {addingColumn ? (
                <form onSubmit={addColumn} className="space-y-2">
                  <input
                    className="input"
                    placeholder="Título de columna"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAddingColumn(false); setNewColumnTitle(""); }}
                      className="btn-ghost flex-1"
                    >
                      Cancelar
                    </button>
                    <button className="btn-primary flex-1" type="submit">Crear</button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  className="w-full text-sm text-muted py-3"
                >
                  + Nueva columna
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          open={showInvite}
          onClose={() => setShowInvite(false)}
          boardId={board.id}
          boardName={board.name}
          existingInvitations={invitations}
          onDone={() => router.refresh()}
        />
      )}

      {showSettings && (
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          board={board}
          isOwner={isOwner}
          members={members}
          invitations={invitations}
          currentUserId={currentUserId}
          onDone={() => router.refresh()}
        />
      )}

      {editingCard && (
        <CardModal
          card={editingCard}
          columns={columns}
          onClose={() => setEditingCard(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  boardId,
  boardName,
  existingInvitations,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  existingInvitations: Invitation[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = existingInvitations.filter((i) => i.status === "pending");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/boards/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          board_id: boardId,
          email: email.trim().toLowerCase(),
          role,
          message: message.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo invitar");
      }
      setInfo("Invitación enviada ✓");
      setEmail("");
      setMessage("");
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "No se pudo invitar");
    }
    setLoading(false);
  }

  async function cancelInvite(id: string) {
    const supabase = createClient();
    await supabase.from("board_invitations").update({ status: "cancelled" }).eq("id", id);
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Invitar a ${boardName}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@correo.com"
            required
          />
        </div>
        <div>
          <label className="label">Rol</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setRole("editor")}
              className={`chip border ${role === "editor" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setRole("viewer")}
              className={`chip border ${role === "viewer" ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              Lector
            </button>
          </div>
          <p className="text-xs text-muted mt-1">
            {role === "editor"
              ? "Puede agregar y mover tarjetas, crear columnas."
              : "Solo puede ver el tablero."}
          </p>
        </div>
        <div>
          <label className="label">Mensaje (opcional)</label>
          <textarea
            className="input mt-1"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="¡Sumate al tablero!"
          />
        </div>
        {info && <p className="text-accent text-sm">{info}</p>}
        {err && <p className="text-danger text-sm">{err}</p>}
        <button className="btn-primary w-full" disabled={loading || !email.trim()}>
          {loading ? "Enviando…" : "Enviar invitación"}
        </button>
      </form>

      {pending.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line/50 space-y-2">
          <p className="text-xs text-muted">Pendientes ({pending.length})</p>
          <ul className="space-y-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {i.invited_email} <span className="text-xs text-muted">· {i.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => cancelInvite(i.id)}
                  className="text-xs text-muted hover:text-danger shrink-0"
                >
                  ✕ cancelar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function SettingsModal({
  open,
  onClose,
  board,
  isOwner,
  members,
  invitations,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  board: Board;
  isOwner: boolean;
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [color, setColor] = useState(board.color ?? "#22c55e");
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("boards")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        color,
      })
      .eq("id", board.id);
    setLoading(false);
    onClose();
    onDone();
  }

  async function archiveBoard() {
    if (!confirm("¿Archivar este tablero? Podés desarchivarlo desde la base luego.")) return;
    const supabase = createClient();
    await supabase.from("boards").update({ archived: true }).eq("id", board.id);
    onClose();
    router.push("/proyectos");
  }

  async function deleteBoard() {
    if (!confirm("¿Eliminar el tablero y todas sus tarjetas? No se puede deshacer.")) return;
    const supabase = createClient();
    await supabase.from("boards").delete().eq("id", board.id);
    router.push("/proyectos");
  }

  async function leave() {
    if (!confirm("¿Dejar este tablero?")) return;
    const supabase = createClient();
    await supabase
      .from("board_members")
      .delete()
      .eq("board_id", board.id)
      .eq("user_id", currentUserId);
    router.push("/proyectos");
  }

  async function removeMember(userId: string) {
    if (!confirm("¿Quitar a este miembro?")) return;
    const supabase = createClient();
    await supabase
      .from("board_members")
      .delete()
      .eq("board_id", board.id)
      .eq("user_id", userId);
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajustes del tablero">
      <div className="space-y-4">
        {isOwner ? (
          <div className="space-y-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea
                className="input mt-1"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Color</label>
              <input
                type="color"
                className="mt-1 w-16 h-9 rounded border border-line bg-transparent"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={save} className="btn-primary flex-1" disabled={loading}>
                {loading ? "…" : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium">{board.name}</p>
            {board.description && <p className="text-sm text-muted">{board.description}</p>}
          </div>
        )}

        <div className="border-t border-line/50 pt-3 space-y-2">
          <p className="text-sm font-medium">Miembros ({members.length})</p>
          <ul className="space-y-1 text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {m.user_id === currentUserId ? "Tú" : m.user_id.slice(0, 8) + "…"}
                  <span className="text-xs text-muted ml-1">· {m.role}</span>
                </span>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    className="text-xs text-muted hover:text-danger shrink-0"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {invitations.filter((i) => i.status === "pending").length > 0 && (
          <div className="border-t border-line/50 pt-3 space-y-1">
            <p className="text-sm font-medium">Invitaciones pendientes</p>
            <ul className="text-xs text-muted">
              {invitations
                .filter((i) => i.status === "pending")
                .map((i) => (
                  <li key={i.id}>📬 {i.invited_email} · {i.role}</li>
                ))}
            </ul>
          </div>
        )}

        <div className="border-t border-line/50 pt-3 flex flex-col gap-2">
          {isOwner ? (
            <>
              <button onClick={archiveBoard} className="btn-ghost">Archivar tablero</button>
              <button onClick={deleteBoard} className="btn-danger">Eliminar tablero</button>
            </>
          ) : (
            <button onClick={leave} className="btn-danger">Salir del tablero</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CardModal({
  card,
  columns,
  onClose,
  onDone,
}: {
  card: Card;
  columns: Column[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [columnId, setColumnId] = useState(card.column_id);
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [done, setDone] = useState(card.done);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("board_cards")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        column_id: columnId,
        due_date: dueDate || null,
        done,
      })
      .eq("id", card.id);
    setLoading(false);
    onClose();
    onDone();
  }

  async function remove() {
    if (!confirm("¿Eliminar esta tarjeta?")) return;
    const supabase = createClient();
    await supabase.from("board_cards").delete().eq("id", card.id);
    onClose();
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="Tarjeta">
      <div className="space-y-3">
        <div>
          <label className="label">Título</label>
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea
            className="input mt-1"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Columna</label>
            <select
              className="input mt-1"
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha</label>
            <input
              type="date"
              className="input mt-1"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          Marcar como hecha
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={remove} className="btn-danger">Eliminar</button>
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} className="btn-primary flex-1" disabled={loading}>
            {loading ? "…" : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
