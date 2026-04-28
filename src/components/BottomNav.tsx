"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/cuentas", label: "Cuentas", icon: "💸" },
  { href: "/proyectos", label: "Proyectos", icon: "🛠️" },
  { href: "/agenda", label: "Agenda", icon: "📅" },
  { href: "/metricas", label: "Métricas", icon: "📊" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-bg/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
      <ul className="max-w-xl mx-auto grid grid-cols-4 h-[72px]">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`h-full flex flex-col items-center justify-center text-xs gap-1 ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="text-xl leading-none">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
