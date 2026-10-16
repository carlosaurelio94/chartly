/* Cuánto deja de verdad un día de trabajo en apps.

   El "neto" que muestran las plataformas, y el que mostraba Chartly, es
   cobrado − nafta − gastos cargados. Falta lo que no se ve en el día pero se
   paga igual: service, cubiertas, frenos, seguro, el auto o la moto que
   pierde valor con cada km. Y si sos monotributista, una parte de lo cobrado
   tampoco es tuya. */

export type DayEconomicsInput = {
  gross: number;        // todo lo cobrado (app, propinas, viajes en efectivo)
  expenses: number;     // nafta + otros gastos cargados
  km: number;
  hours: number;
  costPerKm: number;    // desgaste del vehículo por km, sin nafta
  taxPct: number;       // % de lo cobrado que se aparta para impuestos
};

export type DayEconomics = {
  gross: number;
  expenses: number;
  vehicleCost: number;  // km × costo por km
  net: number;          // cobrado − gastos (lo de siempre)
  realNet: number;      // net − desgaste del vehículo
  taxReserve: number;   // lo que conviene apartar para impuestos
  spendable: number;    // realNet − taxReserve: lo que podés gastar
  perHour: number | null;      // realNet / horas
  perKm: number | null;        // realNet / km
};

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function dayEconomics(i: DayEconomicsInput): DayEconomics {
  const gross = nonNeg(i.gross);
  const expenses = nonNeg(i.expenses);
  const km = nonNeg(i.km);
  const hours = nonNeg(i.hours);
  const vehicleCost = km * nonNeg(i.costPerKm);
  const net = gross - expenses;
  const realNet = net - vehicleCost;
  const taxReserve = (gross * Math.min(60, nonNeg(i.taxPct))) / 100;
  return {
    gross,
    expenses,
    vehicleCost,
    net,
    realNet,
    taxReserve,
    spendable: realNet - taxReserve,
    perHour: hours > 0 ? realNet / hours : null,
    perKm: km > 0 ? realNet / km : null,
  };
}

/**
 * Costo por km a partir de lo que se gasta en un año en el vehículo (sin
 * nafta) y los km que se hacen en ese año. Es la cuenta que nadie hace de
 * cabeza; en Ajustes se pide así en vez de pedir "el costo por km".
 *
 * `vehicleValue` y `usefulKm` suman la amortización: cuánto vale el vehículo
 * y cuántos km le quedan de vida útil. Opcionales.
 */
export function costPerKmFrom({
  yearlyCosts,
  yearlyKm,
  vehicleValue = 0,
  usefulKm = 0,
}: {
  yearlyCosts: number;
  yearlyKm: number;
  vehicleValue?: number;
  usefulKm?: number;
}): number | null {
  const km = nonNeg(yearlyKm);
  if (km === 0) return null;
  const running = nonNeg(yearlyCosts) / km;
  const depreciation = nonNeg(usefulKm) > 0 ? nonNeg(vehicleValue) / nonNeg(usefulKm) : 0;
  return running + depreciation;
}
