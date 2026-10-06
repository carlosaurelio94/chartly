/* Extracción de comprobantes compartidos (MP, bancos, Uber, tickets).
   Entra una imagen/PDF/texto y sale un movimiento estructurado.

   El proveedor se elige por env var. Si no hay ninguna key configurada,
   devolvemos null y la captura queda pendiente para completar a mano:
   la app sigue siendo usable sin costo ni configuración. */

export type ExtractedMovement = {
  tipo: "gasto" | "ingreso";
  monto: number | null;
  moneda: string | null;
  comercio: string | null;
  fecha: string | null; // YYYY-MM-DD
  medio: string | null; // "Mercado Pago", "BBVA", "Efectivo"…
  nota: string | null;
  confianza: number; // 0..1
};

export type GigItemKind = "earnings" | "tip_app" | "tip_cash" | "cash_trip" | "expense" | "fuel";

export type ExtractedGigDay = {
  plataforma: string | null;
  fecha: string | null;
  moneda: string | null;
  total: number | null;
  horas: number | null;
  km: number | null;
  items: {
    kind: GigItemKind;
    monto: number;
    hora: string | null;
    fecha: string | null;
    nota: string | null;
  }[];
  confianza: number;
};

export type ExtractedCapture =
  | { clase: "comprobante"; movimiento: ExtractedMovement }
  | { clase: "jornada"; jornada: ExtractedGigDay };

/** Prompt dedicado al resumen diario de apps de reparto/viajes. */
const PROMPT_JORNADA = `MODO B — RESUMEN DE JORNADA (Uber, Rappi, PedidosYa, Didi, Cabify, inDrive…)

Usalo cuando la imagen sea el listado de lo hecho en el día dentro de una app de
reparto o viajes: una lista de viajes/pedidos con sus importes, un total del día,
o un panel de ganancias.

Devolvé SOLO este JSON:
{
  "clase": "jornada",
  "plataforma": "Uber" | "Rappi" | "PedidosYa" | "Didi" | "Cabify" | "inDrive" | string | null,
  "fecha": "YYYY-MM-DD" | null,
  "moneda": código ISO 4217 ("ARS", "CLP", "MXN"…) | null,
  "total": number | null,
  "horas": number | null,
  "km": number | null,
  "items": [
    { "kind": "earnings" | "tip_app" | "tip_cash" | "cash_trip" | "expense" | "fuel",
      "monto": number, "hora": "HH:MM" | null, "fecha": "YYYY-MM-DD" | null,
      "nota": string | null }
  ],
  "confianza": number
}

Reglas del modo B:
- Un item por cada viaje/pedido que puedas leer. NO agrupes.
- "fecha" DEL ITEM: si la pantalla separa por días o cada fila muestra su fecha,
  poné la fecha de ese item. Si toda la captura es de un único día, dejá la
  "fecha" de cada item en null y completá solo la "fecha" de arriba. Rigen las
  mismas reglas de año que el modo A: nunca inventes el año.
- "hora": es clave para no duplicar cuando el usuario manda varias capturas del
  mismo día. Extraela siempre que se vea.
- "kind": el pago normal de la app es "earnings". Propina dentro de la app es
  "tip_app"; propina en efectivo "tip_cash"; viaje cobrado en efectivo "cash_trip";
  carga de nafta "fuel"; cualquier otro gasto "expense".
- "monto": positivo siempre, incluso para gastos. Punto decimal.
- "moneda": misma regla que el modo A.
- "total": el total del día que muestre la pantalla. Si no lo muestra, null
  (NO lo calcules vos).
- "horas" y "km": solo si la pantalla los muestra explícitamente.
- Si la lista está cortada, extraé lo que se ve y bajá la confianza.`;

function buildPrompt(): string {
  const now = new Date();
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `Recibís una captura de pantalla. Primero decidí cuál de los dos modos aplica y después extraé con ESE modo.

- Si es un resumen/listado de trabajo del día en una app de reparto o viajes → MODO B.
- Si es un comprobante de un pago o cobro puntual (Mercado Pago, banco, ticket) → MODO A.

Devolvé SIEMPRE un único objeto JSON, sin markdown, que incluya el campo "clase"
con valor "comprobante" (modo A) o "jornada" (modo B).

═══════════════════════════════
${PROMPT_BASE}

Para el MODO A agregá al JSON: "clase": "comprobante".
═══════════════════════════════
${PROMPT_JORNADA}
═══════════════════════════════

CONTEXTO: hoy es ${hoy}.

SOBRE LA FECHA — leé esto con atención:
- Muchos comprobantes y filas de resumen bancario muestran solo día y mes ("14/09", "14 SEP"), sin año.
- En ese caso NO inventes el año. Asumí la aparición más reciente de ese día/mes que NO sea futura respecto de hoy (${hoy}).
- Solo devolvé un año distinto al actual si está impreso explícitamente en el comprobante.
- Nunca devuelvas una fecha futura.
- Si no podés determinar la fecha con seguridad, devolvé null. Es preferible null a una fecha inventada.`;
}

const PROMPT_BASE = `MODO A — COMPROBANTE SUELTO

Sos un extractor de comprobantes de pago latinoamericanos y de otros países (Mercado Pago, bancos, billeteras, tickets de comercio).

Devolvé SOLO un objeto JSON válido, sin markdown ni explicaciones, con esta forma exacta:
{
  "tipo": "gasto" | "ingreso",
  "monto": number | null,
  "moneda": código ISO 4217 o "USDT" | null,
  "comercio": string | null,
  "fecha": "YYYY-MM-DD" | null,
  "medio": string | null,
  "nota": string | null,
  "confianza": number
}

Reglas:
- "tipo": si el usuario PAGÓ o le debitaron => "gasto". Si COBRÓ o le acreditaron => "ingreso".
- "monto": solo el número, sin símbolo ni separador de miles. Usá punto decimal. Ojo con el formato de cada país: en Argentina, Chile, Colombia, Venezuela, Brasil o España el punto separa miles y la coma decimales ("$12.345,67" => 12345.67, "$ 15.990" CLP => 15990); en México, EE.UU. o Perú es al revés ("$1,234.50" => 1234.5).
- "moneda": el código ISO 4217 (ARS, USD, EUR, VES, CLP, MXN, COP, PEN, BRL, UYU…) o "USDT". Solo si el comprobante lo deja claro: una sigla ("USD", "CLP"), un símbolo inequívoco ("€", "US$", "R$", "Bs.", "S/") o el banco/app de un país concreto. Si solo dice "$" y no podés saber de qué país es, devolvé null.
- "comercio": el nombre del negocio o de la contraparte. Si es un cobro de app de delivery/viajes, poné la plataforma (Uber, Rappi, PedidosYa, Didi, Cabify).
- "medio": el medio de pago (Mercado Pago, BBVA, Santander, Galicia, Naranja, Efectivo…). null si no se distingue.
- "confianza": 0 a 1. Usá >=0.8 solo si monto y tipo son inequívocos.
- Si la imagen no es un comprobante, devolvé todo null con confianza 0.`;

function parseJsonLoose(s: string): unknown {
  const cleaned = s.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Número simple (confianza, horas, km): acepta coma decimal. */
function num(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  if (!t.includes(".")) t = t.replace(",", ".");
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/**
 * Monto desde lo que devuelva el modelo. Aunque el prompt pide un número con
 * punto decimal, a veces copia el texto del comprobante, y cada país separa
 * distinto: "$12.345,67" (AR/CL/CO/VE/BR/ES), "$1,234.50" (MX/US/PE),
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

/** Código de moneda válido o null ("$" solo no dice de qué país es). */
function currencyCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return /^[A-Z]{3,4}$/.test(c) ? c : null;
}

const GIG_KINDS: GigItemKind[] = ["earnings", "tip_app", "tip_cash", "cash_trip", "expense", "fuel"];

function normalizeGig(raw: unknown): ExtractedGigDay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = rawItems
    .map((it) => {
      const r = (it ?? {}) as Record<string, unknown>;
      const monto = parseAmount(r.monto);
      if (monto == null || monto <= 0) return null;
      const k = str(r.kind) as GigItemKind | null;
      return {
        kind: k && GIG_KINDS.includes(k) ? k : ("earnings" as GigItemKind),
        monto,
        hora: str(r.hora),
        fecha: sanitizeDate(str(r.fecha)),
        nota: str(r.nota),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const conf = num(o.confianza);
  return {
    plataforma: str(o.plataforma),
    fecha: sanitizeDate(str(o.fecha)),
    moneda: currencyCode(o.moneda),
    total: parseAmount(o.total),
    horas: num(o.horas),
    km: num(o.km),
    items,
    confianza: conf != null ? Math.min(1, Math.max(0, conf)) : 0,
  };
}

/** Enruta la respuesta cruda del modelo al modo que corresponda. */
function normalizeCapture(raw: unknown): ExtractedCapture | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.clase === "jornada" || Array.isArray(o.items)) {
    const j = normalizeGig(raw);
    // Sin items no hay jornada que guardar; probamos como comprobante.
    if (j && j.items.length > 0) return { clase: "jornada", jornada: j };
  }
  const m = normalize(raw);
  return m ? { clase: "comprobante", movimiento: m } : null;
}

function normalize(raw: unknown): ExtractedMovement | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const monto = parseAmount(o.monto);
  const conf = num(o.confianza);
  return {
    tipo: o.tipo === "ingreso" ? "ingreso" : "gasto",
    monto: monto != null && monto > 0 ? monto : null,
    moneda: currencyCode(o.moneda),
    comercio: str(o.comercio),
    fecha: sanitizeDate(str(o.fecha)),
    medio: str(o.medio),
    nota: str(o.nota),
    confianza: conf != null ? Math.min(1, Math.max(0, conf)) : 0,
  };
}

/**
 * Los comprobantes que muestran solo día/mes hacen que el modelo invente el año
 * (vimos "14/09" leído como 2024). Descartamos fechas futuras o muy viejas:
 * devolver null hace que el formulario proponga hoy, que el usuario ve y corrige.
 */
function sanitizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, da, 12, 0, 0);
  // Date "rueda" las fechas imposibles (30/02 → 02/03): si no coincide, no existe.
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;

  const now = new Date();
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days > 1) return null;      // futura
  if (days < -400) return null;   // más de ~13 meses atrás
  return raw;
}

/** true si hay algún proveedor configurado. */
export function extractorAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

type Input =
  | { kind: "text"; text: string }
  | { kind: "file"; base64: string; mimeType: string };

export async function extractMovement(input: Input): Promise<ExtractedCapture | null> {
  if (process.env.GEMINI_API_KEY) return viaGemini(input);
  if (process.env.ANTHROPIC_API_KEY) return viaAnthropic(input);
  return null;
}

async function viaGemini(input: Input): Promise<ExtractedCapture | null> {
  // Los nombres de modelo se retiran cada tanto. Si la API devuelve 404
  // diciendo que hay uno nuevo, cambiá GEMINI_MODEL en Vercel sin tocar código.
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const parts: unknown[] = [{ text: buildPrompt() }];
  if (input.kind === "text") {
    parts.push({ text: `\n\nComprobante:\n${input.text}` });
  } else {
    parts.push({ inline_data: { mime_type: input.mimeType, data: input.base64 } });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return normalizeCapture(parseJsonLoose(text));
}

async function viaAnthropic(input: Input): Promise<ExtractedCapture | null> {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const content: unknown[] = [{ type: "text", text: buildPrompt() }];
  if (input.kind === "text") {
    content.push({ type: "text", text: `\n\nComprobante:\n${input.text}` });
  } else if (input.mimeType === "application/pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.base64 },
    });
  } else {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.mimeType, data: input.base64 },
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content?: { text?: string }[] };
  return normalizeCapture(parseJsonLoose(json.content?.[0]?.text ?? ""));
}
