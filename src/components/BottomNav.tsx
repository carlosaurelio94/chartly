"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import { Icons } from "@/components/ui/Icons";

type NavKey = "hoy" | "jornada" | "proyectos" | "agenda" | "metricas" | "fab";
type NavItem = {
  href?: string;
  key: NavKey;
  label: string;
  icon: (p: { size?: number }) => React.JSX.Element;
};

// El FAB va al medio, así que la lista se arma alrededor de él.
const WITH_JORNADA: NavItem[] = [
  { key: "hoy", href: "/hoy", label: "Hoy", icon: Icons.flame },
  { key: "jornada", href: "/jornada", label: "Jornada", icon: Icons.shift },
  { key: "proyectos", href: "/proyectos", label: "Proyectos", icon: Icons.projects },
  { key: "fab", label: "", icon: Icons.plus },
  { key: "metricas", href: "/metricas", label: "Métricas", icon: Icons.chart },
  { key: "agenda", href: "/agenda", label: "Agenda", icon: Icons.agenda },
];

const WITHOUT_JORNADA: NavItem[] = [
  { key: "hoy", href: "/hoy", label: "Hoy", icon: Icons.flame },
  { key: "proyectos", href: "/proyectos", label: "Proyectos", icon: Icons.projects },
  { key: "fab", label: "", icon: Icons.plus },
  { key: "metricas", href: "/metricas", label: "Métricas", icon: Icons.chart },
  { key: "agenda", href: "/agenda", label: "Agenda", icon: Icons.agenda },
];

const FAB_ACTIONS: { href: string; label: string; icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { href: "/capturar", label: "Leer comprobante", icon: Icons.scan },
  { href: "/cuentas?new=1", label: "Nueva cuenta", icon: Icons.wallet },
  { href: "/jornada", label: "Jornada hoy", icon: Icons.shift },
  { href: "/agenda?new=1", label: "Nuevo evento", icon: Icons.agenda },
  { href: "/proyectos/nuevo", label: "Nuevo proyecto", icon: Icons.projects },
];

export default function BottomNav({ showJornada = false }: { showJornada?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);
  const items = showJornada ? WITH_JORNADA : WITHOUT_JORNADA;

  const active = (() => {
    if (!pathname) return "";
    if (pathname.startsWith("/hoy")) return "hoy";
    if (pathname.startsWith("/jornada")) return "jornada";
    if (pathname.startsWith("/agenda")) return "agenda";
    if (pathname.startsWith("/metricas")) return "metricas";
    if (pathname.startsWith("/proyectos")) return "proyectos";
    return "";
  })();

  return (
    <>
      {fabOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setFabOpen(false)}>
          <div className="absolute inset-x-0 bottom-[120px] flex justify-center px-4">
            <div className="max-w-xl w-full card-sm space-y-1" onClick={(e) => e.stopPropagation()}>
              <p className="label mb-2">Acción rápida</p>
              <ul className="space-y-1">
                {FAB_ACTIONS.map((a) => (
                  <li key={a.href}>
                    <button
                      onClick={() => { setFabOpen(false); router.push(a.href); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-line/60 transition text-left"
                    >
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: "var(--color-accent-tint)", color: "var(--color-accent-on-tint)" }}
                      >
                        <a.icon size={18} />
                      </span>
                      <span className="text-sm font-semibold">{a.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed left-0 right-0 z-20 px-3 pointer-events-none"
        style={{ bottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <ul
          className="max-w-xl mx-auto pointer-events-auto"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
            borderRadius: 28,
            padding: "8px 6px",
            display: "grid",
            gridTemplateColumns: `repeat(${items.length}, 1fr)`,
            alignItems: "center",
            boxShadow: "0 16px 40px -16px rgba(0,0,0,.45)",
          }}
        >
          {items.map((it) => {
            if (it.key === "fab") {
              return (
                <li key="fab" className="flex justify-center">
                  <button
                    type="button"
                    aria-label="Acción rápida"
                    onClick={() => setFabOpen((v) => !v)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 18,
                      background: "var(--color-accent)",
                      color: "var(--color-accent-on)",
                      border: "3px solid var(--color-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: -6,
                      boxShadow: "0 8px 24px color-mix(in srgb, var(--color-accent) 35%, transparent)",
                      cursor: "pointer",
                      transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
                      transition: "transform 180ms ease",
                    }}
                  >
                    <Icons.plus size={22} />
                  </button>
                </li>
              );
            }
            const isActive = active === it.key;
            return (
              <li key={it.key}>
                <Link
                  href={it.href!}
                  className="flex flex-col items-center gap-1 py-2"
                  style={{ color: isActive ? "var(--color-accent-on-tint)" : "var(--color-muted)" }}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 30, height: 28, borderRadius: 12,
                      background: isActive ? "var(--color-accent-tint)" : "transparent",
                    }}
                  >
                    <it.icon size={20} />
                  </span>
                  <span className="text-[10px] font-semibold">{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
