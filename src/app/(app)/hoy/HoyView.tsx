"use client";

/* "Hoy" reordenada según la comparación de Claude Design.
   El estilo ya estaba bien; lo que cansaba era el ritmo: siete secciones con la
   misma forma (rótulo + card + filas título-izquierda / número-derecha) se leen
   como una sola caída. Los seis movimientos:

   1. El runway como gráfico, no como número  → RunwayHero
   2. Una sola decisión con acento            → el bloque de abajo del héroe
   3. Bandas horizontales                     → DueBand / WalletBand
   4. Anchos y densidades distintas           → héroe con padding propio, bandas
                                                sangradas, tiles compactos
   5. Cortar lo que no es de hoy              → 3 vencimientos, el bloque actual,
                                                2 entregas; el resto, "ver todo"
   6. Menos rótulos, más títulos              → títulos en oración con una línea
                                                de contexto debajo                */

import Link from "next/link";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Icons } from "@/components/ui/Icons";
import type { Runway } from "@/lib/runway";
import RunwayHero from "./RunwayHero";
import { DueBand, WalletBand, SectionHead } from "./HoyBands";

// Ya viene resuelto y con la hora formateada desde el servidor.
type AgendaSlot = { id: string; title: string; category: string; time: string };
type CardRow = {
  id: string; board_id: string; title: string; due_date: string | null;
  board: { name: string; color: string | null } | null;
};
type Wallet = { id: string; name: string; balance: number; currency: string };
type Gig = {
  enabled: boolean; perHour: number; avgPerDay: number;
  todayGoal: number; todayEarned: number; todayHours: number;
};

const CAT_COLOR: Record<string, string> = {
  work: "#60a5fa", rest: "#34d399", fun: "#f472b6", idle: "#fbbf24", other: "#94a3b8",
};
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function HoyView({
  currency, runway, wallets, agendaNow, agendaNext, agendaCount, cards, gig, todayIso,
}: {
  currency: string;
  runway: Runway;
  wallets: Wallet[];
  agendaNow: AgendaSlot | null;
  agendaNext: AgendaSlot | null;
  agendaCount: number;
  cards: CardRow[];
  gig: Gig;
  todayIso: string;
}) {
  const { pocket, gap, pendingThisMonth, expectedIncome, projection } = runway;
  const { events, horizon, zeroDay, culprit } = projection;
  // Que el total del mes cierre no quiere decir que aguantes: el saldo puede
  // tocar cero antes y recuperarse recién cuando entra un cobro. La suma no ve
  // el orden; la proyección sí.
  const shortOnTiming = gap === 0 && zeroDay !== null;

  const fmtDayOf = (offset: number) => {
    const d = new Date(`${todayIso}T12:00:00`);
    d.setDate(d.getDate() + offset);
    return `${d.getDate()} ${MES[d.getMonth()]}`;
  };

  // Cuánto trabajo hace falta para cubrir la brecha del mes.
  const sessionsNeeded =
    gap > 0 && gig.enabled && gig.avgPerDay > 0 ? Math.ceil(gap / gig.avgPerDay) : null;

  const nextIncome = events
    .filter((e) => e.kind === "income")
    .sort((a, b) => b.amount - a.amount)[0] ?? null;

  const goalPct =
    gig.todayGoal > 0 ? Math.min(100, (gig.todayEarned / gig.todayGoal) * 100) : 0;

  return (
    <div className="space-y-5 pb-24">
      {/* ── 1 · El runway, dibujado ── */}
      <RunwayHero
        currency={currency}
        projection={projection}
        pocket={pocket}
        todayIso={todayIso}
      />

      {/* ── 2 · La única decisión de la pantalla, y lo único con acento ── */}
      {gap > 0 ? (
        <div className="card-accent space-y-3">
          <div className="flex items-start gap-3">
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 34, height: 34, borderRadius: 12,
                background: "var(--color-accent)", color: "var(--color-accent-on)",
              }}
              aria-hidden
            >
              <Icons.bolt size={18} />
            </span>
            <p className="text-[15px] font-bold leading-snug min-w-0">
              Te faltan {fmtMoney(gap, currency)} para cubrir el mes
            </p>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {sessionsNeeded !== null ? (
              <>
                Son <b className="text-fg">{sessionsNeeded} jornada{sessionsNeeded === 1 ? "" : "s"}</b>{" "}
                a tu ritmo ({fmtMoney(gig.avgPerDay, currency)}/día)
              </>
            ) : (
              <>Vencen {fmtMoney(pendingThisMonth, currency)} y tenés {fmtMoney(pocket, currency)}</>
            )}
            {nextIncome && (
              <>
                , o adelantar el cobro de {nextIncome.name} antes del{" "}
                {fmtDayOf(nextIncome.day)}
              </>
            )}
            .
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {gig.enabled ? (
              <Link href="/jornada" className="btn-primary">Salir a trabajar</Link>
            ) : (
              <Link href="/cuentas" className="btn-primary">Ver qué vence</Link>
            )}
            <Link href="/cuentas" className="btn-plain">Reprogramar pagos</Link>
          </div>
        </div>
      ) : shortOnTiming ? (
        <div className="card-accent space-y-3">
          <p className="text-[15px] font-bold leading-snug">
            El mes cierra, pero quedás en rojo el {fmtDayOf(zeroDay!)}
          </p>
          <p className="text-xs text-muted leading-relaxed">
            {culprit ? <>{culprit.name} vence </> : <>El gasto se te adelanta </>}
            {nextIncome ? (
              <>antes de que entre el cobro de {nextIncome.name} ({fmtDayOf(nextIncome.day)}).</>
            ) : (
              <>cuando todavía no llegaste a juntar lo que sale.</>
            )}{" "}
            Adelantá el cobro o corré el pago unos días.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/cuentas" className="btn-primary">Reprogramar pagos</Link>
            {gig.enabled && <Link href="/jornada" className="btn-plain">Salir a trabajar</Link>}
          </div>
        </div>
      ) : (
        <div className="card-accent space-y-2">
          <p className="text-[15px] font-bold">El mes está cubierto</p>
          <p className="text-xs text-muted leading-relaxed">
            Con {fmtMoney(pocket, currency)} en el bolsillo
            {expectedIncome > 0 && <> y {fmtMoney(expectedIncome, currency)} por cobrar</>} alcanza
            para los {fmtMoney(pendingThisMonth, currency)} que vencen antes de fin de mes.
          </p>
        </div>
      )}

      {/* ── 3 · Los vencimientos, como franja ── */}
      <DueBand
        events={events}
        todayIso={todayIso}
        horizon={horizon}
        currency={currency}
        total={pendingThisMonth}
      />

      {/* ── 3 · Las billeteras, como franja ── */}
      <WalletBand wallets={wallets} currency={currency} total={pocket} />

      {/* ── 4 · Tiles compactos: distinta densidad que las bandas ── */}
      <div className={gig.enabled ? "grid grid-cols-2 gap-2" : ""}>
        {gig.enabled && (
          <Link href="/jornada" className="card-sm block space-y-2 hover:border-accent transition">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">Meta de hoy</span>
              <span className="text-[11px] text-muted tabular">{gig.todayHours.toFixed(1)}h</span>
            </div>
            <p className="text-[19px] font-extrabold tabular leading-none truncate">
              {fmtMoney(gig.todayEarned, currency)}
            </p>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-line)" }}>
              <div className="h-full" style={{ width: `${goalPct}%`, background: "var(--color-accent)" }} />
            </div>
            <p className="text-[11px] text-muted truncate">
              de {fmtMoney(gig.todayGoal, currency)}
            </p>
          </Link>
        )}

        <Link href="/agenda" className="card-sm block space-y-2 hover:border-accent transition">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold">Tu día</span>
            {agendaNow && <span className="pill pill-accent">AHORA</span>}
          </div>
          {agendaNow || agendaNext ? (
            <div className="space-y-2">
              {agendaNow && (
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1 h-7 rounded shrink-0"
                    style={{ background: CAT_COLOR[agendaNow.category] ?? "#94a3b8" }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">{agendaNow.title}</span>
                    <span className="block text-[11px] text-muted">{agendaNow.time}</span>
                  </span>
                </div>
              )}
              {agendaNext && (
                <div className="flex items-center gap-2 min-w-0" style={{ opacity: agendaNow ? 0.55 : 1 }}>
                  <span
                    className="w-1 h-7 rounded shrink-0"
                    style={{ background: CAT_COLOR[agendaNext.category] ?? "#94a3b8" }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">{agendaNext.title}</span>
                    <span className="block text-[11px] text-muted">Después · {agendaNext.time}</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              {agendaCount > 0 ? "Ya pasó todo lo de hoy." : "Nada agendado."}
            </p>
          )}
        </Link>
      </div>

      {/* ── 5 · Dos entregas, el resto detrás de "ver todo" ── */}
      {cards.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Entregas cerca"
            context={`${cards.length} con fecha en los próximos 7 días`}
            href="/proyectos"
            cta="Ver proyectos"
          />
          <ul className="space-y-1.5">
            {cards.slice(0, 2).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/proyectos/${c.board_id}`}
                  className="card-sm flex items-center justify-between gap-2 hover:border-accent transition"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{c.title}</span>
                    <span className="block text-[11px] text-muted truncate">{c.board?.name}</span>
                  </span>
                  <span className="text-[11px] text-muted shrink-0">{fmtDate(c.due_date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
