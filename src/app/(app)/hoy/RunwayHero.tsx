"use client";

/* El runway como gráfico, no como número.
   "Te quedan 39 días" promedia el gasto y esconde que un vencimiento grande te
   deja en cero mucho antes. Dibujado, el bajón se ve — y el chip deja comparar
   los dos escenarios: cobrando lo que esperás, o sin cobrarlo. */

import { useId, useState } from "react";
import { fmtMoney } from "@/lib/format";
import Money from "@/components/ui/Money";
import type { Projection } from "@/lib/runway";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayAfter(startIso: string, n: number) {
  const d = new Date(`${startIso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d;
}
function fmtDM(d: Date) {
  return `${d.getDate()} ${MES[d.getMonth()]}`;
}

// Lienzo del gráfico. Las etiquetas van en HTML, no en el SVG, para que no se
// escalen con el viewBox.
const W = 320;
const H = 118;
const PAD = { t: 10, r: 8, b: 8, l: 8 };

export default function RunwayHero({
  currency, projection, pocket, todayIso,
}: {
  currency: string;
  projection: Projection;
  pocket: number;
  todayIso: string;
}) {
  const { horizon, base, withIncome, events, zeroDay, zeroDayWithIncome, incomeLabel, culprit } =
    projection;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const [showIncome, setShowIncome] = useState(false);
  const canToggle = withIncome !== null;
  const active = showIncome && withIncome ? withIncome : base;
  const other = showIncome ? base : withIncome;
  const activeZero = showIncome ? zeroDayWithIncome : zeroDay;

  // Escala: el cero siempre entra en el rango, si no el cruce no se vería.
  const all = [...base, ...(withIncome ?? []), 0];
  const rawMax = Math.max(...all);
  const rawMin = Math.min(...all);
  const span = Math.max(1, rawMax - rawMin);
  const max = rawMax + span * 0.12;
  const min = rawMin - span * 0.12;

  const x = (d: number) => PAD.l + (d / Math.max(1, horizon)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((max - v) / (max - min)) * (H - PAD.t - PAD.b);
  const y0 = y(0);

  const line = (s: number[]) => s.map((v, d) => `${d === 0 ? "M" : "L"}${x(d)},${y(v)}`).join(" ");
  const areaPath = `${line(active)} L${x(horizon)},${y0} L${x(0)},${y0} Z`;

  const outOfMoney = activeZero !== null;
  const toneColor = outOfMoney ? "var(--color-danger)" : "var(--color-ok)";
  const endDate = outOfMoney ? dayAfter(todayIso, activeZero!) : dayAfter(todayIso, horizon);

  // Etiquetas del eje: hoy y tres cortes parejos hasta el fin del horizonte.
  const ticks = [0, Math.round(horizon / 3), Math.round((horizon * 2) / 3), horizon]
    .filter((d, i, a) => a.indexOf(d) === i);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="label">Tu plata llega hasta</p>
        <div className="text-right shrink-0">
          <p className="label">Hoy</p>
          <div className="mt-0.5">
            <Money amount={pocket} currency={currency} size={17} weight={700} />
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <p
          className="text-[40px] leading-none font-extrabold tabular"
          style={{ color: toneColor, letterSpacing: "-1px" }}
        >
          {outOfMoney ? fmtDM(endDate) : "fin de mes"}
        </p>
        <p className="text-xs text-muted mt-2">
          {outOfMoney ? (
            <>
              en <b className="text-fg">{activeZero} {activeZero === 1 ? "día" : "días"}</b>
              {culprit && !showIncome && <> · te pega {culprit.name}</>}
            </>
          ) : (
            <>Con lo que tenés llegás a fin de mes</>
          )}
        </p>
      </div>

      {canToggle && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIncome(false)}
            className={showIncome ? "chip" : "chip chip-active"}
          >
            Sin cobrar
          </button>
          <button
            type="button"
            onClick={() => setShowIncome(true)}
            className={showIncome ? "chip chip-active" : "chip"}
          >
            Cobrando {incomeLabel}
          </button>
        </div>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={
            outOfMoney
              ? `Tu saldo llega a cero el ${fmtDM(endDate)}`
              : "Tu saldo se mantiene positivo hasta fin de mes"
          }
        >
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.38" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
            </linearGradient>
            <clipPath id={`up${uid}`}>
              <rect x="0" y="0" width={W} height={Math.max(0, y0)} />
            </clipPath>
            <clipPath id={`down${uid}`}>
              <rect x="0" y={y0} width={W} height={Math.max(0, H - y0)} />
            </clipPath>
          </defs>

          {/* Relleno: verde arriba del cero, rojo abajo. */}
          <path d={areaPath} fill={`url(#g${uid})`} clipPath={`url(#up${uid})`} />
          <path
            d={areaPath}
            fill="var(--color-danger)"
            fillOpacity="0.18"
            clipPath={`url(#down${uid})`}
          />

          {/* Línea del cero. */}
          <line
            x1={PAD.l} y1={y0} x2={W - PAD.r} y2={y0}
            stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />

          {/* El otro escenario, punteado. */}
          {other && (
            <path
              d={line(other)}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* El escenario activo: lima arriba del cero, rojo abajo. */}
          <path
            d={line(active)} fill="none" stroke="var(--color-accent)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            clipPath={`url(#up${uid})`} vectorEffect="non-scaling-stroke"
          />
          <path
            d={line(active)} fill="none" stroke="var(--color-danger)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            clipPath={`url(#down${uid})`} vectorEffect="non-scaling-stroke"
          />

          {/* El día del cruce. */}
          {outOfMoney && (
            <line
              x1={x(activeZero!)} y1={PAD.t} x2={x(activeZero!)} y2={H - PAD.b}
              stroke="var(--color-danger)" strokeWidth="1" strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Cada vencimiento y cada cobro, en su día. */}
          {events.map((e) => {
            if (e.day > horizon) return null;
            if (e.kind === "income" && !showIncome) return null;
            return (
              <circle
                key={`${e.kind}-${e.id}`}
                cx={x(e.day)}
                cy={y(active[e.day] ?? 0)}
                r="2.6"
                fill={e.kind === "income" ? "#a78bfa" : "var(--color-danger)"}
                stroke="var(--color-card)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${e.name} · ${fmtMoney(e.amount, currency)}`}</title>
              </circle>
            );
          })}
        </svg>

        <span
          className="absolute text-[10px] text-muted tabular pointer-events-none"
          style={{ left: 2, top: `${(y0 / H) * 100}%`, transform: "translateY(-120%)" }}
        >
          $0
        </span>
      </div>

      <div className="relative h-4">
        {ticks.map((d, i) => (
          <span
            key={d}
            className="absolute text-[10px] text-muted whitespace-nowrap"
            style={{
              left: `${(x(d) / W) * 100}%`,
              transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {d === 0 ? "hoy" : fmtDM(dayAfter(todayIso, d))}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 14, height: 2, borderRadius: 2, background: "var(--color-accent)" }} />
          este escenario
        </span>
        {other && (
          <span className="inline-flex items-center gap-1.5">
            <span
              style={{
                width: 14, height: 2, borderRadius: 2,
                backgroundImage: "repeating-linear-gradient(90deg, var(--color-muted) 0 3px, transparent 3px 6px)",
              }}
            />
            el otro
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-danger)" }} />
          vencimiento
        </span>
        {showIncome && (
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#a78bfa" }} />
            cobro
          </span>
        )}
      </div>
    </div>
  );
}
