import { createClient } from "@/lib/supabase/server";
import ProjectsBoard from "./ProjectsBoard";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, status, priority, created_at")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  return <ProjectsBoard initial={data ?? []} />;
}
