import Link from "next/link";
import { getUserSettings } from "@/lib/supabase/user";
import { Icons } from "@/components/ui/Icons";

type Entry = { href: string; title: string; hint: string; icon: (p: { size?: number }) => React.JSX.Element };

export default async function MasPage() {
  const settings = await getUserSettings();
  const driver = !!settings?.gig_worker_enabled;

  const entries: Entry[] = [
    ...(driver ? [{ href: "/metricas", title: "Métricas", hint: "En qué se va la plata y qué te deja cada mes", icon: Icons.chart }] : []),
    { href: "/capturar", title: "Comprobantes", hint: "Capturas leídas que esperan tu confirmación", icon: Icons.scan },
    { href: "/agenda", title: "Agenda", hint: "Tu día, recordatorios y temporizador", icon: Icons.agenda },
    { href: "/proyectos", title: "Proyectos", hint: "Tableros para organizarte con otras personas", icon: Icons.projects },
    { href: "/ajustes", title: "Ajustes", hint: "Moneda, modo conductor, apariencia y notificaciones", icon: Icons.settings },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Más</h1>

      <ul className="card divide-y divide-line/60" style={{ padding: 6 }}>
        {entries.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-line/60">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--color-accent-tint)", color: "var(--color-accent-on-tint)" }}
              >
                <e.icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{e.title}</span>
                <span className="block text-xs text-muted">{e.hint}</span>
              </span>
              <Icons.chevronRight size={18} />
            </Link>
          </li>
        ))}
      </ul>

      {!driver && (
        <Link href="/ajustes#jornada" className="card-sm flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🛵</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">¿Manejás o repartís con apps?</span>
            <span className="block text-xs text-muted">
              Activá el modo conductor: km con GPS, cuánto te deja cada hora y mapa de tus zonas.
            </span>
          </span>
        </Link>
      )}

      <Link href="/instalar" className="block text-center text-sm text-muted underline">
        Instalar Chartly en el teléfono
      </Link>
    </div>
  );
}
