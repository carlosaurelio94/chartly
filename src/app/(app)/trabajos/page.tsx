import { redirect } from "next/navigation";

// Proyectos y Trabajos se unificaron en /proyectos.
export default function TrabajosRedirect() {
  redirect("/proyectos");
}
