import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import ProjectsList from "./ProjectsList";

export const dynamic = "force-dynamic";

type BoardRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  owner_id: string;
  status: "idea" | "active" | "paused" | "done";
  priority: number;
  due_date: string | null;
  updated_at: string;
};

type RawInvitationRow = {
  id: string;
  board_id: string;
  invited_email: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  message: string | null;
  created_at: string;
  boards?: { name: string; color: string | null }[] | { name: string; color: string | null } | null;
};

export default async function ProyectosPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) {
    return (
      <div className="card text-center space-y-2">
        <p className="font-medium">Iniciá sesión para ver tus proyectos.</p>
      </div>
    );
  }

  const email = (user.email ?? "").toLowerCase();

  const [boardsRes, membersRes, cardsRes, invitationsRes] = await Promise.all([
    supabase
      .from("boards")
      .select("id, name, description, color, archived, owner_id, status, priority, due_date, updated_at")
      .eq("archived", false)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase.from("board_members").select("board_id, user_id, role"),
    supabase.from("board_cards").select("board_id, done"),
    supabase
      .from("board_invitations")
      .select("id, board_id, invited_email, role, status, message, created_at, boards(name, color)")
      .eq("status", "pending")
      .ilike("invited_email", email)
      .order("created_at", { ascending: false }),
  ]);

  const invitationsRaw = (invitationsRes.data ?? []) as RawInvitationRow[];
  const invitations = invitationsRaw.map((r) => {
    const b = Array.isArray(r.boards) ? r.boards[0] ?? null : r.boards ?? null;
    return {
      id: r.id,
      board_id: r.board_id,
      invited_email: r.invited_email,
      role: r.role,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      boards: b,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Proyectos</h1>
        <Link href="/proyectos/nuevo" className="btn-primary">+ Nuevo</Link>
      </div>
      <ProjectsList
        userId={user.id}
        boards={(boardsRes.data ?? []) as BoardRow[]}
        members={(membersRes.data ?? []) as { board_id: string; user_id: string; role: string }[]}
        cards={(cardsRes.data ?? []) as { board_id: string; done: boolean }[]}
        invitations={invitations}
      />
    </div>
  );
}
