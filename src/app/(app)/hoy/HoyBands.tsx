"use client";

/* Bandas horizontales.
   Vencimientos y billeteras eran listas verticales: quince días ocupaban quince
   filas. Acá ocupan una franja que se desplaza al costado y sangra hasta el
   borde, así la pantalla deja de leerse como una sola caída. */

import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { Icons } from "@/components/ui/Icons";
import type { ProjEvent } from "@/lib/runway";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Una tira de colores para distinguir vencimientos de un vistazo; el acento se
// reserva para la única decisión de la pantalla.
const DOT = ["#22d3ee", "#f472b6", "#fb923c", "#4ade80", "#a78bfa", "#38bdf8", "#facc15", "#f43f5e"];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOT[h % DOT.length];
}

export function SectionHead({
  title, context, href, cta,
}: {
  title: string; context?: string; href: string; cta: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 group" aria-label={cta}>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold truncate">{title}</span>
        {context && <span className="block text-xs text-muted truncate">{context}</span>}
      </span>
      <span className="text-muted shrink-0 group-hover:text-fg transition">
        <Icons.chevronRight size={18} />
      </span>
    </Link>
  );
}

/* Los próximos vencimientos como calendario: un día por columna, una barra por
   lo que cae ese día, alta en proporción a lo que se lleva. */
export function DueBand({
  events, todayIso, horizon, currency, total,
}: {
  events: ProjEvent[];
  todayIso: string;
  horizon: number;
  currency: string;
  total: number;
}) {
  const expenses = events.filter((e) => e.kind === "expense" && e.day <= horizon);
  const byDay = new Map<number, ProjEvent[]>();
  for (const e of expenses) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  const dayTotal = (d: number) => (byDay.get(d) ?? []).reduce((a, e) => a + e.amount, 0);
  const peak = Math.max(1, ...Array.from(byDay.keys()).map(dayTotal));

  const start = new Date(`${todayIso}T12:00:00`);
  const days = Array.from({ length: horizon + 1 }, (_, d) => {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    return { d, date };
  });

  return (
    <section className="space-y-3">
      <SectionHead
        title="Qué te pega y cuándo"
        context={`próximos ${horizon} días · ${fmtMoney(total, currency)}`}
        href="/cuentas"
        cta="Ver todas las cuentas"
      />
      {expenses.length === 0 ? (
        <p className="text-sm text-muted">Nada vence de acá a fin de mes.</p>
      ) : (
        <div className="bleed no-scrollbar">
          <div className="flex items-end gap-1.5 pb-1" style={{ width: "max-content" }}>
            {days.map(({ d, date }) => {
              const hits = byDay.get(d) ?? [];
              const isToday = d === 0;
              return (
                <div key={d} className="flex flex-col items-center gap-2" style={{ width: 30 }}>
                  <div className="flex flex-col-reverse justify-start gap-0.5 w-full" style={{ height: 46 }}>
                    {hits.length === 0 ? (
                      <span
                        className="w-full rounded-full"
                        style={{ height: 3, background: "var(--color-line)" }}
                      />
                    ) : (
                      hits.map((e) => (
                        <Link
                          key={e.id}
                          href={`/cuentas/${e.id}`}
                          title={`${e.name} · ${fmtMoney(e.amount, currency)}`}
                          className="w-full rounded-full block"
                          style={{
                            // Escala de raíz: con proporción lineal el alquiler
                            // aplasta a todo lo demás contra el mínimo y la
                            // franja deja de decir nada.
                            height: Math.max(5, Math.round(Math.sqrt(e.amount / peak) * 40)),
                            background: colorFor(e.id),
                          }}
                        />
                      ))
                    )}
                  </div>
                  <span
                    className={isToday ? "pill pill-accent tabular" : "text-[11px] text-muted tabular"}
                    style={isToday ? { padding: "2px 7px", fontSize: 11 } : undefined}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}
            <div className="flex flex-col items-center justify-end" style={{ height: 46 + 26 }}>
              <span className="text-[11px] text-muted whitespace-nowrap pb-1 pl-1">
                {MES[days[days.length - 1].date.getMonth()]}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* Las billeteras, en una franja en vez de una lista. */
export function WalletBand({
  wallets, currency, total,
}: {
  wallets: { id: string; name: string; balance: number; currency: string }[];
  currency: string;
  total: number;
}) {
  if (wallets.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionHead
        title="En el bolsillo"
        context={`${wallets.length} ${wallets.length === 1 ? "billetera" : "billeteras"} · ${fmtMoney(total, currency)}`}
        href="/cuentas"
        cta="Ver billeteras"
      />
      <div className="bleed no-scrollbar">
        <div className="flex gap-2 pb-1" style={{ width: "max-content" }}>
          {wallets.map((w) => (
            <div
              key={w.id}
              className="shrink-0"
              style={{
                minWidth: 132,
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
                borderRadius: 18,
                padding: "12px 14px",
              }}
            >
              <p className="text-[11px] text-muted truncate">{w.name}</p>
              <p className="text-[15px] font-bold tabular mt-1 truncate">
                {fmtMoney(w.balance, w.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
