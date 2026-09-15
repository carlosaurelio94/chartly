import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import BoardView from "./BoardView";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function BoardPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) {
    return (
      <div className="card text-center space-y-2">
        <p className="font-medium">Iniciá sesión.</p>
      </div>
    );
  }

  const [boardRes, colsRes, cardsRes, membersRes, invsRes] = await Promise.all([
    supabase
      .from("boards")
      .select("id, name, description, color, owner_id, archived, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("board_columns")
      .select("id, title, position, color")
      .eq("board_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("board_cards")
      .select("id, column_id, title, description, position, due_date, assignee_user_id, done, created_by")
      .eq("board_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("board_members")
      .select("user_id, role, joined_at")
      .eq("board_id", id),
    supabase
      .from("board_invitations")
      .select("id, invited_email, role, status, created_at")
      .eq("board_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!boardRes.data) {
    return (
      <div className="card space-y-2">
        <p className="font-medium">No tenés acceso a este tablero o no existe.</p>
        <Link href="/proyectos" className="btn-ghost inline-block">Volver</Link>
      </div>
    );
  }

  return (
    <BoardView
      currentUserId={user.id}
      currentUserEmail={(user.email ?? "").toLowerCase()}
      board={boardRes.data}
      columns={colsRes.data ?? []}
      cards={cardsRes.data ?? []}
      members={membersRes.data ?? []}
      invitations={invsRes.data ?? []}
    />
  );
}
