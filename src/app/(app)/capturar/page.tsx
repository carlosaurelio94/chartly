import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";
import CaptureInbox from "./CaptureInbox";

export const dynamic = "force-dynamic";

export default async function CapturarPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return <div className="card">Iniciá sesión.</div>;

  const { data } = await supabase
    .from("captures")
    .select("id, source, mime_type, raw_text, parsed, confidence, error, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Capturas</h1>
        <Link href="/cuentas" className="chip">Ir a Cuentas</Link>
      </div>
      <CaptureInbox pending={(data ?? []) as never} />
    </div>
  );
}
