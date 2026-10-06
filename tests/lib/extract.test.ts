import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractMovement, extractorAvailable, parseAmount, type ExtractedCapture } from "@/lib/extract";

const NOW = new Date(2026, 9, 6, 15, 0, 0); // 06/10/2026

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function geminiReply(text: string, status = 200) {
  const body = { candidates: [{ content: { parts: [{ text }] } }] };
  return new Response(status === 200 ? JSON.stringify(body) : text, { status });
}
function anthropicReply(text: string, status = 200) {
  return new Response(status === 200 ? JSON.stringify({ content: [{ type: "text", text }] }) : text, { status });
}

/** Extrae con Gemini devolviendo `payload` como texto del modelo. */
async function extractWith(payload: unknown): Promise<ExtractedCapture | null> {
  vi.stubEnv("GEMINI_API_KEY", "g-key");
  fetchMock.mockResolvedValueOnce(geminiReply(typeof payload === "string" ? payload : JSON.stringify(payload)));
  return extractMovement({ kind: "text", text: "x" });
}
async function movement(payload: unknown) {
  const r = await extractWith(payload);
  if (r?.clase !== "comprobante") throw new Error(`esperaba comprobante, vino ${JSON.stringify(r)}`);
  return r.movimiento;
}
async function jornada(payload: unknown) {
  const r = await extractWith(payload);
  if (r?.clase !== "jornada") throw new Error(`esperaba jornada, vino ${JSON.stringify(r)}`);
  return r.jornada;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.useRealTimers());

describe("extractorAvailable", () => {
  it("false sin keys", () => expect(extractorAvailable()).toBe(false));
  it("true con Gemini", () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    expect(extractorAvailable()).toBe(true);
  });
  it("true con Anthropic", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "x");
    expect(extractorAvailable()).toBe(true);
  });
});

describe("extractMovement · proveedor", () => {
  it("sin keys devuelve null y no sale a la red", async () => {
    expect(await extractMovement({ kind: "text", text: "hola" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefiere Gemini si están las dos keys", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    fetchMock.mockResolvedValueOnce(geminiReply("{}"));
    await extractMovement({ kind: "text", text: "x" });
    expect(fetchMock.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
  });

  describe("Gemini", () => {
    beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "g-secret"));

    it("usa el modelo por defecto, la key en header y temperatura 0", async () => {
      fetchMock.mockResolvedValueOnce(geminiReply("{}"));
      await extractMovement({ kind: "text", text: "Pagaste $100" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
      expect(url).not.toContain("g-secret");
      expect(init.method).toBe("POST");
      expect(init.headers["x-goog-api-key"]).toBe("g-secret");
      const body = JSON.parse(init.body);
      expect(body.generationConfig).toEqual({ temperature: 0, responseMimeType: "application/json" });
      expect(body.contents[0].parts[1].text).toContain("Pagaste $100");
    });

    it("respeta GEMINI_MODEL", async () => {
      vi.stubEnv("GEMINI_MODEL", "gemini-9-pro");
      fetchMock.mockResolvedValueOnce(geminiReply("{}"));
      await extractMovement({ kind: "text", text: "x" });
      expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-9-pro:generateContent");
    });

    it("manda archivos como inline_data", async () => {
      fetchMock.mockResolvedValueOnce(geminiReply("{}"));
      await extractMovement({ kind: "file", base64: "QUJD", mimeType: "image/png" });
      const parts = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts;
      expect(parts[1]).toEqual({ inline_data: { mime_type: "image/png", data: "QUJD" } });
    });

    it("el prompt incluye la fecha de hoy y ambos modos", async () => {
      fetchMock.mockResolvedValueOnce(geminiReply("{}"));
      await extractMovement({ kind: "text", text: "x" });
      const prompt: string = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
      expect(prompt).toContain("hoy es 2026-10-06");
      expect(prompt).toContain("MODO A");
      expect(prompt).toContain("MODO B");
    });

    it("lanza con el status si la API falla", async () => {
      fetchMock.mockResolvedValueOnce(geminiReply("model not found", 404));
      await expect(extractMovement({ kind: "text", text: "x" })).rejects.toThrow("Gemini 404: model not found");
    });

    it("devuelve null si no hay candidatos", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
      expect(await extractMovement({ kind: "text", text: "x" })).toBeNull();
    });
  });

  describe("Anthropic", () => {
    beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "a-secret"));

    it("usa la API de mensajes con versión y modelo por defecto", async () => {
      fetchMock.mockResolvedValueOnce(anthropicReply("{}"));
      await extractMovement({ kind: "text", text: "Cobraste" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.headers["x-api-key"]).toBe("a-secret");
      expect(init.headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(init.body);
      expect(body.model).toBe("claude-haiku-4-5-20251001");
      expect(body.temperature).toBe(0);
      expect(body.messages[0].content[1]).toEqual({ type: "text", text: "\n\nComprobante:\nCobraste" });
    });

    it("respeta ANTHROPIC_MODEL", async () => {
      vi.stubEnv("ANTHROPIC_MODEL", "claude-otro");
      fetchMock.mockResolvedValueOnce(anthropicReply("{}"));
      await extractMovement({ kind: "text", text: "x" });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("claude-otro");
    });

    it("manda PDFs como document", async () => {
      fetchMock.mockResolvedValueOnce(anthropicReply("{}"));
      await extractMovement({ kind: "file", base64: "UERG", mimeType: "application/pdf" });
      const block = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[1];
      expect(block).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } });
    });

    it("manda imágenes como image", async () => {
      fetchMock.mockResolvedValueOnce(anthropicReply("{}"));
      await extractMovement({ kind: "file", base64: "SU1H", mimeType: "image/jpeg" });
      const block = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[1];
      expect(block).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "SU1H" } });
    });

    it("lanza con el status si la API falla", async () => {
      fetchMock.mockResolvedValueOnce(anthropicReply("overloaded", 529));
      await expect(extractMovement({ kind: "text", text: "x" })).rejects.toThrow("Anthropic 529: overloaded");
    });

    it("parsea la respuesta igual que Gemini", async () => {
      fetchMock.mockResolvedValueOnce(anthropicReply('{"tipo":"ingreso","monto":50,"confianza":0.9}'));
      const r = await extractMovement({ kind: "text", text: "x" });
      expect(r).toMatchObject({ clase: "comprobante", movimiento: { tipo: "ingreso", monto: 50 } });
    });
  });
});

describe("parseo de la respuesta del modelo", () => {
  it("tolera bloques ```json", async () => {
    const m = await movement('```json\n{"tipo":"gasto","monto":10,"confianza":1}\n```');
    expect(m.monto).toBe(10);
  });

  it("tolera texto antes y después del JSON", async () => {
    const m = await movement('Claro, acá va: {"monto": 99} ¡Saludos!');
    expect(m.monto).toBe(99);
  });

  it.each(["", "no es json", "{roto", "{\"a\":}", "[1,2]"])("devuelve null con %j", async (raw) => {
    expect(await extractWith(raw)).toBeNull();
  });
});

describe("normalización de comprobantes", () => {
  it("normaliza un comprobante completo", async () => {
    const m = await movement({
      clase: "comprobante",
      tipo: "gasto",
      monto: 12345.67,
      moneda: "ars",
      comercio: "  Café Martínez ",
      fecha: "2026-10-05",
      medio: "Mercado Pago",
      nota: "",
      confianza: 0.92,
    });
    expect(m).toEqual({
      tipo: "gasto",
      monto: 12345.67,
      moneda: "ARS",
      comercio: "Café Martínez",
      fecha: "2026-10-05",
      medio: "Mercado Pago",
      nota: null,
      confianza: 0.92,
    });
  });

  it("tipo desconocido cae en gasto", async () => {
    expect((await movement({ tipo: "transferencia" })).tipo).toBe("gasto");
    expect((await movement({ tipo: "ingreso" })).tipo).toBe("ingreso");
  });

  it("monto como string con símbolo", async () => {
    expect((await movement({ monto: "$ 1500.50" })).monto).toBe(1500.5);
  });

  it.each([0, -10, "abc", "", null])("monto inválido %j → null", async (monto) => {
    expect((await movement({ monto })).monto).toBeNull();
  });

  // Regresión: "$12.345,67" se leía como 12.34567. El modelo a veces copia el
  // monto tal cual del comprobante, en el formato de cada país.
  it("monto string con formato local se interpreta bien", async () => {
    expect((await movement({ monto: "$12.345,67" })).monto).toBe(12345.67);
  });

  it("monto string negativo (débito de MP) se toma en valor absoluto", async () => {
    expect((await movement({ monto: "- $ 1.234,50", tipo: "gasto" })).monto).toBe(1234.5);
  });

  it("moneda: solo códigos válidos, en mayúsculas", async () => {
    expect((await movement({ moneda: "clp" })).moneda).toBe("CLP");
    expect((await movement({ moneda: " usdt " })).moneda).toBe("USDT");
    for (const moneda of ["$", "Bs.", "pesos", "US$", 42]) {
      expect((await movement({ moneda })).moneda).toBeNull();
    }
  });

  it("el prompt no fuerza ARS y explica formatos de varios países", async () => {
    await movement({});
    const prompt: string = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).not.toMatch(/usá "ARS"/);
    expect(prompt).toContain("devolvé null");
    for (const code of ["VES", "CLP", "MXN", "COP", "BRL", "EUR"]) expect(prompt).toContain(code);
  });

  it("total de jornada como string con separadores", async () => {
    const j = await jornada({ clase: "jornada", total: "$25.300,50", items: [{ monto: "1.200,00" }] });
    expect(j.total).toBe(25300.5);
    expect(j.items[0].monto).toBe(1200);
  });

  it("total sin dígitos → null, no 0", async () => {
    expect((await jornada({ clase: "jornada", total: "—", items: [{ monto: 1 }] })).total).toBeNull();
  });

  it("confianza se acota a [0, 1] y falta = 0", async () => {
    expect((await movement({ confianza: 3 })).confianza).toBe(1);
    expect((await movement({ confianza: -1 })).confianza).toBe(0);
    expect((await movement({ confianza: "0.5" })).confianza).toBe(0.5);
    expect((await movement({})).confianza).toBe(0);
  });

  it("strings vacíos o no-string → null", async () => {
    const m = await movement({ comercio: "   ", medio: 123, nota: {}, moneda: "" });
    expect(m).toMatchObject({ comercio: null, medio: null, nota: null, moneda: null });
  });
});

describe("saneo de fechas", () => {
  it.each([
    ["2026-10-06", "2026-10-06"], // hoy
    ["2026-10-07", "2026-10-07"], // mañana: tolerancia por zona horaria
    ["2025-09-10", "2025-09-10"], // ~13 meses
  ])("acepta %s", async (fecha, out) => {
    expect((await movement({ fecha })).fecha).toBe(out);
  });

  it.each([
    ["2026-10-09", "futura"],
    ["2027-01-01", "año inventado hacia adelante"],
    ["2024-09-14", "año inventado hacia atrás (+400 días)"],
    ["14/09/2026", "formato no ISO"],
    ["2026-10-06T10:00:00", "con hora"],
    ["2026-13-01", "mes imposible"],
  ])("rechaza %s (%s)", async (fecha) => {
    expect((await movement({ fecha })).fecha).toBeNull();
  });

  // Regresión: V8 rodaba "2026-02-30" al 2 de marzo y pasaba el saneo.
  it.each(["2026-02-30", "2026-09-31", "2025-02-29", "2026-10-00", "2026-00-10"])(
    "rechaza la fecha imposible %s",
    async (fecha) => {
      expect((await movement({ fecha })).fecha).toBeNull();
    },
  );

  it("acepta el 29/02 de un año bisiesto dentro del rango", async () => {
    vi.setSystemTime(new Date(2028, 2, 10, 12));
    expect((await movement({ fecha: "2028-02-29" })).fecha).toBe("2028-02-29");
  });
});

describe("resúmenes de jornada", () => {
  const base = {
    clase: "jornada",
    plataforma: "Uber",
    fecha: "2026-10-05",
    moneda: "ars",
    total: "25000",
    horas: 6.5,
    km: 120,
    confianza: 0.8,
  };

  it("normaliza la jornada y sus items", async () => {
    const j = await jornada({
      ...base,
      items: [
        { kind: "earnings", monto: 5000, hora: "10:15", fecha: null, nota: "Palermo" },
        { kind: "tip_cash", monto: "500", hora: " ", nota: null },
      ],
    });
    expect(j).toEqual({
      plataforma: "Uber",
      fecha: "2026-10-05",
      moneda: "ARS",
      total: 25000,
      horas: 6.5,
      km: 120,
      confianza: 0.8,
      items: [
        { kind: "earnings", monto: 5000, hora: "10:15", fecha: null, nota: "Palermo" },
        { kind: "tip_cash", monto: 500, hora: null, fecha: null, nota: null },
      ],
    });
  });

  it("acepta todos los kinds válidos y manda los desconocidos a earnings", async () => {
    const kinds = ["earnings", "tip_app", "tip_cash", "cash_trip", "expense", "fuel", "bono", undefined];
    const j = await jornada({ ...base, items: kinds.map((kind) => ({ kind, monto: 1 })) });
    expect(j.items.map((i) => i.kind)).toEqual([
      "earnings", "tip_app", "tip_cash", "cash_trip", "expense", "fuel", "earnings", "earnings",
    ]);
  });

  it("descarta items sin monto positivo o malformados", async () => {
    const j = await jornada({
      ...base,
      items: [{ monto: 0 }, { monto: -5 }, { monto: "x" }, null, "texto", { monto: 10 }],
    });
    expect(j.items).toHaveLength(1);
    expect(j.items[0].monto).toBe(10);
  });

  it("sanea la fecha de cada item", async () => {
    const j = await jornada({
      ...base,
      items: [
        { monto: 1, fecha: "2026-10-04" },
        { monto: 1, fecha: "2030-01-01" },
      ],
    });
    expect(j.items.map((i) => i.fecha)).toEqual(["2026-10-04", null]);
  });

  it("detecta jornada por la presencia de items aunque falte clase", async () => {
    const r = await extractWith({ items: [{ monto: 100 }] });
    expect(r?.clase).toBe("jornada");
  });

  it("una jornada sin items válidos cae a comprobante", async () => {
    const r = await extractWith({ clase: "jornada", items: [{ monto: 0 }], monto: 300, tipo: "ingreso" });
    expect(r).toMatchObject({ clase: "comprobante", movimiento: { monto: 300, tipo: "ingreso" } });
  });

  it("campos opcionales faltantes quedan en null y confianza en 0", async () => {
    const j = await jornada({ clase: "jornada", items: [{ monto: 1 }] });
    expect(j).toMatchObject({ plataforma: null, fecha: null, moneda: null, total: null, horas: null, km: null, confianza: 0 });
  });
});

describe("parseAmount · formatos por país", () => {
  it.each([
    // Argentina (ARS)
    ["$12.345,67", 12345.67],
    ["$ 1.234.567", 1234567],
    ["ARS 999,9", 999.9],
    ["$500", 500],
    // Chile (CLP, sin decimales)
    ["$ 15.990", 15990],
    ["CLP 1.250.000", 1250000],
    // Colombia (COP)
    ["$ 85.000", 85000],
    ["COP 2.350.000,00", 2350000],
    // Venezuela (VES)
    ["Bs. 1.234,56", 1234.56],
    ["Bs. 500", 500],
    ["Bs.S 45,90", 45.9],
    // Brasil (BRL)
    ["R$ 1.234,56", 1234.56],
    ["R$ 89,90", 89.9],
    // España / Euro
    ["1.234,56 €", 1234.56],
    ["12,50 €", 12.5],
    ["1 234,56 €", 1234.56],
    // México (MXN), EE.UU. (USD), Perú (PEN)
    ["$1,234.50", 1234.5],
    ["MXN 12,345.67", 12345.67],
    ["US$ 1,234.56", 1234.56],
    ["$99.99", 99.99],
    ["S/. 150.00", 150],
    ["S/ 1,250.50", 1250.5],
    // Suiza, India
    ["CHF 1'234.50", 1234.5],
    ["₹1,23,456.00", 123456],
    // USDT / cripto
    ["25.5 USDT", 25.5],
    ["USDT 1,000", 1000],
    // ambigüedades resueltas
    ["1,500", 1500],
    ["1.500", 1500],
    ["1500.5", 1500.5],
    ["0,500", 0.5],
    ["0.125", 0.125],
    ["1,234,567", 1234567],
    // números como tales
    [1234.5, 1234.5],
    [0, 0],
  ])("%j → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([null, undefined, "", "$", "—", "Bs.", {}, [], NaN, Infinity])("%j → null", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
