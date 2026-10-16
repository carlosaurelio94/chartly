"use client";

/* Barra inferior. Chartly sirve para dos cosas: ordenar la plata de todos los
   días y, para quien maneja o reparte, llevar la jornada. La barra muestra
   solo eso; agenda, proyectos y ajustes viven en "Más".

   Personal:  Hoy · Cuentas · [+] · Métricas · Más
   Conductor: Hoy · Cuentas · [+] · Jornada  · Más */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import { Icons } from "@/components/ui/Icons";
import QuickExpense from "@/components/QuickExpense";

type IconFn = (p: { size?: number }) => React.JSX.Element;
type NavItem = { key: string; href: string; label: string; icon: IconFn; match: (p: string) => boolean };
type Action = { label: string; hint: string; icon: IconFn; href?: string; quickExpense?: true };

const startsWith = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(x + "/"));

const HOY: NavItem = { key: "hoy", href: "/hoy", label: "Hoy", icon: Icons.flame, match: startsWith("/hoy") };
const CUENTAS: NavItem = { key: "cuentas", href: "/cuentas", label: "Cuentas", icon: Icons.wallet, match: startsWith("/cuentas") };
const JORNADA: NavItem = { key: "jornada", href: "/jornada", label: "Jornada", icon: Icons.shift, match: startsWith("/jornada") };
const METRICAS: NavItem = { key: "metricas", href: "/metricas", label: "Métricas", icon: Icons.chart, match: startsWith("/metricas") };

function masItem(driver: boolean): NavItem {
  const sections = ["/mas", "/agenda", "/proyectos", "/ajustes", "/capturar", "/como-funciona", "/trabajos"];
  if (driver) sections.push("/metricas");
  return { key: "mas", href: "/mas", label: "Más", icon: Icons.grid, match: startsWith(...sections) };
}

function actions(driver: boolean): Action[] {
  const money: Action[] = [
    { label: "Anotar un gasto", hint: "Cuánto y en qué, en dos toques", icon: Icons.send, quickExpense: true },
    { label: "Anotar un ingreso", hint: "Sueldo, cobro, préstamo", icon: Icons.receive, href: "/cuentas?nuevo=ingreso" },
    { label: "Leer un comprobante", hint: "Subí la captura y se completa sola", icon: Icons.scan, href: "/capturar" },
    { label: "Cuenta por pagar", hint: "Alquiler, tarjeta, servicios", icon: Icons.wallet, href: "/cuentas?nuevo=gasto" },
  ];
  if (!driver) return money;
  return [
    { label: "Empezar recorrido", hint: "Cuenta los km con el GPS", icon: Icons.pin, href: "/jornada?recorrido=1" },
    { label: "Registrar un cobro de app", hint: "Viaje, pedido o propina", icon: Icons.shift, href: "/jornada?share=1" },
    ...money,
  ];
}

export default function BottomNav({ showJornada = false }: { showJornada?: boolean }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const items: (NavItem | "fab")[] = [HOY, CUENTAS, "fab", showJornada ? JORNADA : METRICAS, masItem(showJornada)];

  function run(a: Action) {
    setFabOpen(false);
    if (a.quickExpense) setExpenseOpen(true);
    else if (a.href) router.push(a.href);
  }

  return (
    <>
      {fabOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setFabOpen(false)}>
          <div className="absolute inset-x-0 bottom-[110px] flex justify-center px-4">
            <div className="max-w-xl w-full card-sm" onClick={(e) => e.stopPropagation()}>
              <ul className="space-y-0.5">
                {actions(showJornada).map((a) => (
                  <li key={a.label}>
                    <button
                      onClick={() => run(a)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-line/60 active:bg-line/60 transition text-left"
                    >
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "var(--color-accent-tint)", color: "var(--color-accent-on-tint)" }}
                      >
                        <a.icon size={19} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{a.label}</span>
                        <span className="block text-xs text-muted">{a.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <QuickExpense open={expenseOpen} onClose={() => setExpenseOpen(false)} />

      <nav
        className="fixed left-0 right-0 z-20 px-3 pointer-events-none"
        style={{ bottom: "max(8px, env(safe-area-inset-bottom))" }}
        aria-label="Secciones"
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
            if (it === "fab") {
              return (
                <li key="fab" className="flex justify-center">
                  <button
                    type="button"
                    aria-label={fabOpen ? "Cerrar acciones" : "Anotar algo"}
                    aria-expanded={fabOpen}
                    onClick={() => setFabOpen((v) => !v)}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 18,
                      background: "var(--color-accent)",
                      color: "var(--color-accent-on)",
                      border: "3px solid var(--color-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: -8,
                      boxShadow: "0 8px 24px color-mix(in srgb, var(--color-accent) 35%, transparent)",
                      cursor: "pointer",
                      transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
                      transition: "transform 180ms ease",
                    }}
                  >
                    <Icons.plus size={24} />
                  </button>
                </li>
              );
            }
            const isActive = it.match(pathname);
            return (
              <li key={it.key}>
                <Link
                  href={it.href}
                  aria-current={isActive ? "page" : undefined}
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
                  <span className="text-[11px] font-semibold">{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
