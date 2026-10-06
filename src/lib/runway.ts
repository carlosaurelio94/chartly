/* Runway: cuánto tiempo aguanta la plata y cuánto falta generar.
   Es cómputo puro sobre datos que la app ya tiene — no agrega tablas. */

import { convert, type Rates } from "@/lib/fx";

export type RunwayBill = {
  id: string;
  name: string;
  kind: "expense" | "income";
  tipo: "puntual" | "recurrente" | "acumulador";
  currency: string;
  balance: number;
  monthly_amount: number | null;
  due_date: string | null;
  archived: boolean;
};

export type RunwayCycle = { bill_id: string; amount: number; period_start: string };

export type RunwayInput = {
  walletTotal: number;          // ya convertido a la moneda default
  bills: RunwayBill[];
  cycles: RunwayCycle[];        // ciclos cerrados, para promediar acumuladores
  defaultCurrency: string;
  rates: Rates;
  today?: Date;
};

/* Un vencimiento dibujable: cae un día concreto del horizonte. */
export type ProjEvent = {
  id: string;
  name: string;
  kind: "expense" | "income";
  day: number;                  // días desde hoy (0 = hoy)
  date: string;                 // ISO yyyy-mm-dd
  amount: number;               // en la moneda default
};

/* La proyección de saldo día a día. Es lo que el gráfico dibuja: el número
   "te quedan N días" promedia el gasto, y por eso esconde que un vencimiento
   grande te deja en cero mucho antes. */
export type Projection = {
  horizon: number;              // días proyectados (hasta fin de mes)
  base: number[];               // saldo por día sin cobrar nada (len = horizon+1)
  withIncome: number[] | null;  // saldo por día cobrando lo esperado
  events: ProjEvent[];
  zeroDay: number | null;       // primer día con saldo negativo, sin cobrar
  zeroDayWithIncome: number | null;
  incomeLabel: string | null;   // "Acme" — el cobro más grande del horizonte
  culprit: ProjEvent | null;    // el vencimiento que te tira a cero
};

export type Runway = {
  pocket: number;
  monthlyBurn: number;          // gasto mensual estimado
  dailyBurn: number;
  days: number | null;          // null si no hay gasto estimable
  outOfMoneyAt: Date | null;
  pendingThisMonth: number;     // vencimientos de acá a fin de mes
  expectedIncome: number;       // ingresos por cobrar hasta fin de mes
  gap: number;                  // lo que falta para cubrir el mes
  daysLeftInMonth: number;
  projection: Projection;
};


function conv(n: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return n;
  return convert(n, from, to, rates);
}

export function computeRunway(input: RunwayInput): Runway {
  const { walletTotal, bills, cycles, defaultCurrency: cur, rates } = input;
  const today = input.today ?? new Date();

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  // Los vencimientos se anclan a las 12:00: comparados contra el último día a
  // las 00:00, lo que vence ese día quedaba afuera del horizonte.
  const horizonEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysLeftInMonth = Math.max(
    1,
    Math.ceil((endOfMonth.getTime() - today.getTime()) / 86_400_000),
  );

  // Promedio mensual de cada acumulador según sus ciclos ya cerrados.
  const avgByBill = new Map<string, number>();
  const sums = new Map<string, { total: number; n: number }>();
  for (const c of cycles) {
    const s = sums.get(c.bill_id) ?? { total: 0, n: 0 };
    s.total += Number(c.amount);
    s.n += 1;
    sums.set(c.bill_id, s);
  }
  for (const [id, s] of sums) if (s.n > 0) avgByBill.set(id, s.total / s.n);

  let monthlyBurn = 0;
  let pendingThisMonth = 0;
  let expectedIncome = 0;

  // Vencimientos con fecha dentro del horizonte: van al gráfico como caídas
  // puntuales, no como parte del goteo diario.
  const events: ProjEvent[] = [];
  // Recurrentes que ya aparecen como caída puntual este mes: su monto mensual no
  // vuelve a contarse en el goteo, o el saldo bajaría dos veces por lo mismo.
  let datedRecurring = 0;

  // Anclado al mediodía, igual que las fechas de vencimiento: si uno va a las
  // 00:00 y el otro a las 12:00, la diferencia da x,5 días y redondea al día
  // siguiente. Los vencimientos se corrían una casilla.
  const noonToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);

  for (const b of bills) {
    if (b.archived) continue;
    const bal = Number(b.balance);
    const due = b.due_date ? new Date(`${b.due_date}T12:00:00`) : null;
    const inHorizon = !!due && due <= horizonEnd && bal > 0;
    const converted = inHorizon ? conv(bal, b.currency, cur, rates) : null;

    if (b.kind === "expense") {
      // Gasto mensual estimado: recurrentes por su monto, acumuladores por su promedio.
      if (b.tipo === "recurrente" && b.monthly_amount != null) {
        const v = conv(Number(b.monthly_amount), b.currency, cur, rates);
        if (v !== null) monthlyBurn += v;
      } else if (b.tipo === "acumulador") {
        const avg = avgByBill.get(b.id);
        if (avg != null) {
          const v = conv(avg, b.currency, cur, rates);
          if (v !== null) monthlyBurn += v;
        }
      }

      // Lo que hay que pagar de acá a fin de mes.
      if (converted !== null) {
        pendingThisMonth += converted;
        // Los acumuladores son plata ya gastada: están en el goteo, no en el gráfico.
        if (b.tipo !== "acumulador") {
          if (b.tipo === "recurrente" && b.monthly_amount != null) {
            const v = conv(Number(b.monthly_amount), b.currency, cur, rates);
            if (v !== null) datedRecurring += v;
          }
          events.push({
            id: b.id, name: b.name, kind: "expense",
            day: Math.max(0, Math.round((due!.getTime() - noonToday.getTime()) / 86_400_000)),
            date: b.due_date!, amount: converted,
          });
        }
      }
    } else if (converted !== null) {
      expectedIncome += converted;
      events.push({
        id: b.id, name: b.name, kind: "income",
        day: Math.max(0, Math.round((due!.getTime() - noonToday.getTime()) / 86_400_000)),
        date: b.due_date!, amount: converted,
      });
    }
  }
  events.sort((a, b) => a.day - b.day || b.amount - a.amount);

  const dailyBurn = monthlyBurn / 30;
  const days = dailyBurn > 0 ? Math.floor(walletTotal / dailyBurn) : null;
  const outOfMoneyAt =
    days !== null ? new Date(today.getTime() + days * 86_400_000) : null;

  // Lo que falta: lo que vence este mes menos lo que tengo y lo que voy a cobrar.
  const gap = Math.max(0, pendingThisMonth - walletTotal - expectedIncome);

  const projection = buildProjection({
    pocket: walletTotal,
    // El goteo son los gastos sin fecha (acumuladores y recurrentes que no vencen
    // este mes). Los que sí vencen ya están dibujados como caída.
    dailyDrip: Math.max(0, monthlyBurn - datedRecurring) / 30,
    horizon: daysLeftInMonth,
    events,
  });

  return {
    pocket: walletTotal,
    monthlyBurn,
    dailyBurn,
    days,
    outOfMoneyAt,
    pendingThisMonth,
    expectedIncome,
    gap,
    daysLeftInMonth,
    projection,
  };
}

function buildProjection({
  pocket, dailyDrip, horizon, events,
}: {
  pocket: number; dailyDrip: number; horizon: number; events: ProjEvent[];
}): Projection {
  const n = Math.max(1, Math.min(horizon, 60));

  const walk = (withIncome: boolean) => {
    const out: number[] = [];
    let bal = pocket;
    for (let d = 0; d <= n; d++) {
      if (d > 0) bal -= dailyDrip;
      for (const e of events) {
        if (e.day !== d) continue;
        if (e.kind === "expense") bal -= e.amount;
        else if (withIncome) bal += e.amount;
      }
      out.push(bal);
    }
    return out;
  };

  const incomes = events.filter((e) => e.kind === "income");
  const base = walk(false);
  const withIncome = incomes.length > 0 ? walk(true) : null;

  const firstNegative = (series: number[]) => {
    const i = series.findIndex((v) => v < 0);
    return i === -1 ? null : i;
  };
  const zeroDay = firstNegative(base);

  // Qué vencimiento te empuja abajo: el más grande del día del cruce, o el
  // anterior más cercano si el cruce lo produjo el goteo.
  const culprit =
    zeroDay === null
      ? null
      : events
          .filter((e) => e.kind === "expense" && e.day <= zeroDay)
          .sort((a, b) => b.day - a.day || b.amount - a.amount)[0] ?? null;

  const biggestIncome = incomes.slice().sort((a, b) => b.amount - a.amount)[0] ?? null;

  return {
    horizon: n,
    base,
    withIncome,
    events,
    zeroDay,
    zeroDayWithIncome: withIncome ? firstNegative(withIncome) : null,
    incomeLabel: biggestIncome?.name ?? null,
    culprit,
  };
}
