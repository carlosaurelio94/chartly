/**
 * Monto desde un texto: lo que devuelve el modelo al leer un comprobante o lo
 * que escribe el usuario. Cada país separa distinto: "$12.345,67" (AR/CL/CO/VE/BR/ES), "$1,234.50" (MX/US/PE),
 * "$ 15.990" (CLP, sin decimales), "1 234,56", "1'234.50", "Bs. 500".
 *
 * - Con los dos separadores, el último es el decimal.
 * - Con uno solo repetido ("1.234.567"), es de miles.
 * - Con uno solo una vez, es de miles si lo siguen exactamente 3 dígitos
 *   ("15.990", "1,500"); si no, es decimal ("12,50", "1500.5"). Ninguna de
 *   las monedas de la app usa 3 decimales, así que no hay ambigüedad real.
 *
 * En un string el signo se ignora: Mercado Pago muestra los débitos como
 * "- $ 1.234" y si es gasto o ingreso ya lo dice "tipo".
 */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // Solo dígitos y separadores; afuera los puntos de "Bs." o "S/." pegados al número.
  let t = v.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/\d/.test(t)) return null;

  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? /\./g : /,/g;
    t = t.replace(thousands, "").replace(dec, ".");
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? "," : ".";
    const parts = t.split(sep);
    const isThousands = parts.length > 2 || (parts[1].length === 3 && parts[0] !== "0");
    t = isThousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
  }
  const n = Number(t);
  return isFinite(n) ? n : null;
}
