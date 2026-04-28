import { createClient } from "@/lib/supabase/server";
import ProjectsBoard from "./ProjectsBoard";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const supabase = await createClient();
  const [projectsRes, tasksRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, status, priority, due_date, created_at")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("project_tasks")
      .select("id, project_id, text, done, due_date, position")
      .order("position", { ascending: true }),
  ]);

  return <ProjectsBoard initial={projectsRes.data ?? []} tasks={tasksRes.data ?? []} />;
}
