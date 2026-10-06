import { describe, it, expect } from "vitest";
import { computeRunway, type RunwayBill, type RunwayInput } from "@/lib/runway";

// Sábado 10/10/2026 a media mañana. Fin de mes = 31/10 00:00 → 21 días de horizonte.
const TODAY = new Date(2026, 9, 10, 10, 0, 0);
const DAY = 86_400_000;

let seq = 0;
function bill(over: Partial<RunwayBill> = {}): RunwayBill {
  seq += 1;
  return {
    id: `b${seq}`,
    name: `Bill ${seq}`,
    kind: "expense",
    tipo: "puntual",
    currency: "ARS",
    balance: 0,
    monthly_amount: null,
    due_date: null,
    archived: false,
    ...over,
  };
}

function run(over: Partial<RunwayInput> = {}) {
  return computeRunway({
    walletTotal: 10_000,
    bills: [],
    cycles: [],
    defaultCurrency: "ARS",
    rates: { USD: 1, ARS: 1000, EUR: 0.9 },
    today: TODAY,
    ...over,
  });
}

describe("computeRunway · horizonte", () => {
  it("proyecta hasta fin de mes", () => {
    const r = run();
    expect(r.daysLeftInMonth).toBe(21);
    expect(r.projection.horizon).toBe(21);
    expect(r.projection.base).toHaveLength(22);
  });

  it("nunca baja de 1 día (último día del mes)", () => {
    const r = run({ today: new Date(2026, 9, 31, 18, 0) });
    expect(r.daysLeftInMonth).toBe(1);
    expect(r.projection.base).toHaveLength(2);
  });

  it("funciona en febrero de año no bisiesto", () => {
    const r = run({ today: new Date(2027, 1, 1, 0, 0) });
    expect(r.daysLeftInMonth).toBe(27);
  });

  it("usa la fecha actual si no se pasa today", () => {
    const r = computeRunway({ walletTotal: 0, bills: [], cycles: [], defaultCurrency: "ARS", rates: {} });
    expect(r.daysLeftInMonth).toBeGreaterThanOrEqual(1);
    expect(r.daysLeftInMonth).toBeLessThanOrEqual(31);
  });
});

describe("computeRunway · sin datos", () => {
  it("no inventa gasto ni fecha de quiebre", () => {
    const r = run();
    expect(r.pocket).toBe(10_000);
    expect(r.monthlyBurn).toBe(0);
    expect(r.dailyBurn).toBe(0);
    expect(r.days).toBeNull();
    expect(r.outOfMoneyAt).toBeNull();
    expect(r.pendingThisMonth).toBe(0);
    expect(r.expectedIncome).toBe(0);
    expect(r.gap).toBe(0);
  });

  it("la proyección queda plana y sin eventos", () => {
    const p = run().projection;
    expect(new Set(p.base)).toEqual(new Set([10_000]));
    expect(p.withIncome).toBeNull();
    expect(p.events).toEqual([]);
    expect(p.zeroDay).toBeNull();
    expect(p.zeroDayWithIncome).toBeNull();
    expect(p.incomeLabel).toBeNull();
    expect(p.culprit).toBeNull();
  });

  it("con bolsillo negativo el cero es hoy", () => {
    expect(run({ walletTotal: -1 }).projection.zeroDay).toBe(0);
  });
});

describe("computeRunway · gasto mensual", () => {
  it("suma recurrentes por su monto mensual", () => {
    const r = run({
      walletTotal: 1000,
      bills: [
        bill({ tipo: "recurrente", monthly_amount: 2000 }),
        bill({ tipo: "recurrente", monthly_amount: 1000 }),
      ],
    });
    expect(r.monthlyBurn).toBe(3000);
    expect(r.dailyBurn).toBe(100);
    expect(r.days).toBe(10);
    expect(r.outOfMoneyAt!.getTime()).toBe(TODAY.getTime() + 10 * DAY);
  });

  it("redondea los días hacia abajo", () => {
    const r = run({ walletTotal: 1099, bills: [bill({ tipo: "recurrente", monthly_amount: 3000 })] });
    expect(r.days).toBe(10);
  });

  it("ignora recurrentes sin monto mensual y puntuales", () => {
    const r = run({
      bills: [bill({ tipo: "recurrente", monthly_amount: null }), bill({ tipo: "puntual", monthly_amount: 999 })],
    });
    expect(r.monthlyBurn).toBe(0);
  });

  it("promedia acumuladores con sus ciclos cerrados, sin mezclar bills", () => {
    const tarjeta = bill({ tipo: "acumulador" });
    const otra = bill({ tipo: "acumulador" });
    const r = run({
      bills: [tarjeta, otra],
      cycles: [
        { bill_id: tarjeta.id, amount: 300, period_start: "2026-08-01" },
        { bill_id: tarjeta.id, amount: 500, period_start: "2026-09-01" },
        { bill_id: otra.id, amount: 60, period_start: "2026-09-01" },
      ],
    });
    expect(r.monthlyBurn).toBe(460);
  });

  it("acepta montos como string (numeric de Postgres)", () => {
    const a = bill({ tipo: "acumulador" });
    const r = run({
      bills: [a, bill({ tipo: "recurrente", monthly_amount: "1500" as unknown as number })],
      cycles: [{ bill_id: a.id, amount: "500" as unknown as number, period_start: "2026-09-01" }],
    });
    expect(r.monthlyBurn).toBe(2000);
  });

  it("un acumulador sin ciclos no aporta gasto", () => {
    expect(run({ bills: [bill({ tipo: "acumulador" })] }).monthlyBurn).toBe(0);
  });

  it("ignora bills archivados", () => {
    const r = run({
      bills: [bill({ tipo: "recurrente", monthly_amount: 5000, archived: true, balance: 5000, due_date: "2026-10-15" })],
    });
    expect(r.monthlyBurn).toBe(0);
    expect(r.pendingThisMonth).toBe(0);
    expect(r.projection.events).toEqual([]);
  });

  it("los ingresos no cuentan como gasto", () => {
    expect(run({ bills: [bill({ kind: "income", tipo: "recurrente", monthly_amount: 9000 })] }).monthlyBurn).toBe(0);
  });

  it("convierte a la moneda default", () => {
    const r = run({ bills: [bill({ tipo: "recurrente", currency: "USD", monthly_amount: 3 })] });
    expect(r.monthlyBurn).toBe(3000);
  });

  it("descarta lo que no se puede convertir en vez de sumarlo mal", () => {
    const r = run({
      bills: [
        bill({ tipo: "recurrente", currency: "BRL", monthly_amount: 100, balance: 100, due_date: "2026-10-12" }),
        bill({ tipo: "recurrente", monthly_amount: 30 }),
      ],
    });
    expect(r.monthlyBurn).toBe(30);
    expect(r.pendingThisMonth).toBe(0);
    expect(r.projection.events).toEqual([]);
  });
});

describe("computeRunway · vencimientos del mes", () => {
  it("cuenta lo pendiente con fecha dentro del mes", () => {
    const r = run({
      bills: [
        bill({ balance: 1200, due_date: "2026-10-15" }),
        bill({ balance: 800, due_date: "2026-10-20" }),
      ],
    });
    expect(r.pendingThisMonth).toBe(2000);
  });

  it("excluye saldo cero, sin fecha o del mes siguiente", () => {
    const r = run({
      bills: [
        bill({ balance: 0, due_date: "2026-10-15" }),
        bill({ balance: -50, due_date: "2026-10-15" }),
        bill({ balance: 500, due_date: null }),
        bill({ balance: 500, due_date: "2026-11-02" }),
      ],
    });
    expect(r.pendingThisMonth).toBe(0);
    expect(r.projection.events).toEqual([]);
  });

  it("incluye los vencidos y los dibuja hoy", () => {
    const r = run({ bills: [bill({ balance: 700, due_date: "2026-10-01" })] });
    expect(r.pendingThisMonth).toBe(700);
    expect(r.projection.events[0].day).toBe(0);
    expect(r.projection.base[0]).toBe(9_300);
  });

  it("ubica el evento en el día correcto (sin correrse una casilla)", () => {
    const r = run({ bills: [bill({ name: "Luz", balance: 3000, due_date: "2026-10-15" })] });
    const [e] = r.projection.events;
    expect(e).toMatchObject({ name: "Luz", kind: "expense", day: 5, date: "2026-10-15", amount: 3000 });
    expect(r.projection.base[4]).toBe(10_000);
    expect(r.projection.base[5]).toBe(7_000);
    expect(r.projection.base.at(-1)).toBe(7_000);
  });

  it("también ubica bien el día si hoy es de noche", () => {
    const r = run({
      today: new Date(2026, 9, 10, 23, 30),
      bills: [bill({ balance: 1, due_date: "2026-10-11" })],
    });
    expect(r.projection.events[0].day).toBe(1);
  });

  it("los acumuladores suman a pendiente pero no se dibujan como caída", () => {
    const r = run({ bills: [bill({ tipo: "acumulador", balance: 4000, due_date: "2026-10-20" })] });
    expect(r.pendingThisMonth).toBe(4000);
    expect(r.projection.events).toEqual([]);
  });

  it("un recurrente con fecha no se descuenta dos veces (goteo + caída)", () => {
    const r = run({
      bills: [bill({ tipo: "recurrente", monthly_amount: 3000, balance: 3000, due_date: "2026-10-15" })],
    });
    expect(r.monthlyBurn).toBe(3000);
    // Sin goteo: el saldo solo cae el día del vencimiento.
    expect(r.projection.base[1]).toBe(10_000);
    expect(r.projection.base.at(-1)).toBe(7_000);
  });

  it("el goteo diario descuenta solo lo que no tiene fecha este mes", () => {
    const r = run({
      bills: [
        bill({ tipo: "recurrente", monthly_amount: 3000, balance: 3000, due_date: "2026-10-15" }),
        bill({ tipo: "recurrente", monthly_amount: 600 }), // 20/día
      ],
    });
    expect(r.projection.base[1]).toBe(9_980);
    expect(r.projection.base[5]).toBeCloseTo(10_000 - 5 * 20 - 3000, 9);
  });

  it("ordena eventos por día y, a igual día, por monto descendente", () => {
    const r = run({
      bills: [
        bill({ name: "C", balance: 10, due_date: "2026-10-20" }),
        bill({ name: "B", balance: 50, due_date: "2026-10-12" }),
        bill({ name: "A", balance: 900, due_date: "2026-10-12" }),
      ],
    });
    expect(r.projection.events.map((e) => e.name)).toEqual(["A", "B", "C"]);
  });

  it("convierte el monto del evento a la moneda default", () => {
    const r = run({ bills: [bill({ currency: "USD", balance: 2, due_date: "2026-10-12" })] });
    expect(r.pendingThisMonth).toBe(2000);
    expect(r.projection.events[0].amount).toBe(2000);
  });

  // Regresión: el fin de mes se tomaba a las 00:00 y los vencimientos van a
  // las 12:00, así que lo que vencía el último día quedaba afuera.
  it("incluye lo que vence el último día del mes y lo dibuja en el último punto", () => {
    const r = run({ bills: [bill({ balance: 1000, due_date: "2026-10-31" })] });
    expect(r.pendingThisMonth).toBe(1000);
    expect(r.projection.events[0].day).toBe(r.projection.horizon);
    expect(r.projection.base.at(-1)).toBe(9_000);
  });

  it("si hoy es el último día, lo que vence hoy cae en el día 0", () => {
    const r = run({ today: new Date(2026, 9, 31, 18, 0), bills: [bill({ balance: 1000, due_date: "2026-10-31" })] });
    expect(r.pendingThisMonth).toBe(1000);
    expect(r.projection.events[0].day).toBe(0);
  });

  it("el primer día del mes siguiente sigue afuera", () => {
    const r = run({ bills: [bill({ balance: 1000, due_date: "2026-11-01" })] });
    expect(r.pendingThisMonth).toBe(0);
  });
});

describe("computeRunway · ingresos y brecha", () => {
  it("suma ingresos por cobrar y los dibuja solo en la serie con ingresos", () => {
    const r = run({
      walletTotal: 1000,
      bills: [
        bill({ kind: "income", name: "Acme", balance: 5000, due_date: "2026-10-20" }),
        bill({ balance: 2000, due_date: "2026-10-15" }),
      ],
    });
    expect(r.expectedIncome).toBe(5000);
    const p = r.projection;
    expect(p.base.at(-1)).toBe(-1000);
    expect(p.withIncome!.at(-1)).toBe(4000);
    expect(p.zeroDay).toBe(5);
    expect(p.zeroDayWithIncome).toBe(5); // el cobro llega después del vencimiento
    expect(p.incomeLabel).toBe("Acme");
  });

  it("si el cobro llega antes, la serie con ingresos no cruza cero", () => {
    const r = run({
      walletTotal: 1000,
      bills: [
        bill({ kind: "income", balance: 5000, due_date: "2026-10-12" }),
        bill({ balance: 2000, due_date: "2026-10-15" }),
      ],
    });
    expect(r.projection.zeroDay).toBe(5);
    expect(r.projection.zeroDayWithIncome).toBeNull();
  });

  it("incomeLabel es el cobro más grande", () => {
    const r = run({
      bills: [
        bill({ kind: "income", name: "Chico", balance: 100, due_date: "2026-10-11" }),
        bill({ kind: "income", name: "Grande", balance: 900, due_date: "2026-10-25" }),
      ],
    });
    expect(r.projection.incomeLabel).toBe("Grande");
  });

  it("ingresos fuera del mes no cuentan", () => {
    const r = run({ bills: [bill({ kind: "income", balance: 5000, due_date: "2026-11-05" })] });
    expect(r.expectedIncome).toBe(0);
    expect(r.projection.withIncome).toBeNull();
  });

  it("gap = pendiente − bolsillo − ingresos, nunca negativo", () => {
    const bills = [
      bill({ balance: 20_000, due_date: "2026-10-15" }),
      bill({ kind: "income", balance: 4_000, due_date: "2026-10-20" }),
    ];
    expect(run({ walletTotal: 10_000, bills }).gap).toBe(6_000);
    expect(run({ walletTotal: 50_000, bills }).gap).toBe(0);
  });
});

describe("computeRunway · culpable del cruce", () => {
  it("es el vencimiento más grande del día del cruce", () => {
    const r = run({
      walletTotal: 1000,
      bills: [
        bill({ name: "Chico", balance: 300, due_date: "2026-10-14" }),
        bill({ name: "Grande", balance: 900, due_date: "2026-10-14" }),
      ],
    });
    expect(r.projection.zeroDay).toBe(4);
    expect(r.projection.culprit?.name).toBe("Grande");
  });

  it("si el cruce lo produce el goteo, es el vencimiento anterior más cercano", () => {
    const r = run({
      walletTotal: 1000,
      bills: [
        bill({ name: "Viejo", balance: 100, due_date: "2026-10-11" }),
        bill({ name: "Reciente", balance: 100, due_date: "2026-10-13" }),
        bill({ name: "Futuro", balance: 100, due_date: "2026-10-28" }),
        bill({ tipo: "recurrente", monthly_amount: 3000 }), // 100/día
      ],
    });
    expect(r.projection.zeroDay).toBe(9);
    expect(r.projection.culprit?.name).toBe("Reciente");
  });

  it("es null si el cruce es solo por goteo, sin vencimientos", () => {
    const r = run({ walletTotal: 500, bills: [bill({ tipo: "recurrente", monthly_amount: 3000 })] });
    expect(r.projection.zeroDay).toBe(6);
    expect(r.projection.culprit).toBeNull();
  });

  it("cero exacto no cuenta como quiebre", () => {
    const r = run({ walletTotal: 1000, bills: [bill({ balance: 1000, due_date: "2026-10-12" })] });
    expect(r.projection.base.at(-1)).toBe(0);
    expect(r.projection.zeroDay).toBeNull();
  });
});

describe("computeRunway · invariantes", () => {
  it("la serie sin ingresos nunca sube", () => {
    const r = run({
      bills: [
        bill({ balance: 1000, due_date: "2026-10-12" }),
        bill({ kind: "income", balance: 9000, due_date: "2026-10-13" }),
        bill({ tipo: "recurrente", monthly_amount: 450 }),
      ],
    });
    const b = r.projection.base;
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeLessThanOrEqual(b[i - 1]);
  });

  it("la serie con ingresos es siempre ≥ la base", () => {
    const r = run({
      bills: [
        bill({ balance: 4000, due_date: "2026-10-12" }),
        bill({ kind: "income", balance: 2000, due_date: "2026-10-18" }),
      ],
    });
    r.projection.withIncome!.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(r.projection.base[i]));
  });

  it("no muta los arrays de entrada", () => {
    const bills = [bill({ balance: 1, due_date: "2026-10-12" }), bill({ balance: 2, due_date: "2026-10-11" })];
    const snapshot = structuredClone(bills);
    run({ bills });
    expect(bills).toEqual(snapshot);
  });
});
