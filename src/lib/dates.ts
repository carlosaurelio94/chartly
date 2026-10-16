/* Fechas en la zona horaria del usuario.

   En Vercel el servidor corre en UTC. Si una página calcula "hoy" con
   new Date().getDate(), después de las 21 h de Argentina ya es mañana: la
   jornada de un repartidor nocturno se guardaba en el día siguiente y el
   runway arrancaba un día corrido. */

export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

function parts(d: Date, tz: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
  } catch {
    // Zona inválida guardada en la base: caemos a la por defecto.
    return parts(d, DEFAULT_TZ);
  }
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), mi: Number(p.minute), s: Number(p.second),
  };
}

/** "YYYY-MM-DD" del día que es ahora para el usuario. */
export function isoDayInTz(d: Date, tz: string = DEFAULT_TZ): string {
  const { y, m, d: day } = parts(d, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Un Date cuyos campos locales (getFullYear, getDate, getHours…) son la hora
 * de reloj del usuario. Sirve para pasarle "hoy" a cálculos que usan esos
 * getters, como el runway, sin reescribirlos.
 */
export function wallClock(d: Date, tz: string = DEFAULT_TZ): Date {
  const p = parts(d, tz);
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
}

/** Suma días a una fecha "YYYY-MM-DD" sin pasar por zonas horarias. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Minutos que la zona `tz` está adelantada respecto de UTC en ese instante (−180 en Argentina). */
export function tzOffsetMinutes(d: Date, tz: string = DEFAULT_TZ): number {
  const p = parts(d, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - d.getTime()) / 60_000);
}

/** Instantes (ISO UTC) de inicio y fin del día `iso` para el usuario, para filtrar timestamps. */
export function dayBoundsUtc(iso: string, tz: string = DEFAULT_TZ): { start: string; end: string } {
  const [y, m, d] = iso.split("-").map(Number);
  // El offset del mediodía de ese día: evita errores en días con cambio de horario.
  const offset = tzOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12)), tz);
  const start = Date.UTC(y, m - 1, d) - offset * 60_000;
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000 - 1).toISOString() };
}
