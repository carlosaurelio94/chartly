import { currencyMeta } from "./currency";

export function fmtMoney(n: number | string | null | undefined, currency: string = "USD") {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  const meta = currencyMeta(currency);
  // Los centavos solo cuando los hay: un ",00" en cada monto alarga todos los
  // números de la app y es lo que los hace desbordar los recuadros chicos.
  const hasCents = Math.abs((v ?? 0) % 1) > 0.004;
  try {
    // currencyDisplay: "code" -> shows ISO siglas (USD, ARS, CLP…) instead of symbol ($, $, $).
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      currencyDisplay: "code",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(v ?? 0);
  } catch {
    return `${(v ?? 0).toLocaleString(meta.locale, { maximumFractionDigits: 2 })} ${meta.code}`;
  }
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00");
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86400000);
}

export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
}
