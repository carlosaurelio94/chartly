import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, arg, eqValue, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({
  user: null as unknown,
  admin: null as unknown,
  afterCbs: [] as (() => Promise<void>)[],
  extractMovement: vi.fn(),
  extractorAvailable: vi.fn(() => false),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => Promise<void>) => h.afterCbs.push(cb),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.user) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => h.admin) }));
vi.mock("@/lib/extract", () => ({
  extractMovement: h.extractMovement,
  extractorAvailable: h.extractorAvailable,
}));

import { GET, POST } from "@/app/api/share/route";

let sb: SupabaseMock;
let admin: SupabaseMock;

beforeEach(() => {
  sb = createSupabaseMock({ captures: { data: { id: "cap-1" } } }).asUser({ id: "u1" });
  admin = createSupabaseMock();
  h.user = sb;
  h.admin = admin;
  h.afterCbs = [];
  h.extractMovement.mockReset();
  h.extractorAvailable.mockReturnValue(false);
});

function post(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return POST(new NextRequest("https://chartly.app/api/share", { method: "POST", body: fd }));
}
const location = (res: Response) => res.headers.get("location");
const insertPayload = () => arg(sb.find("captures", "insert")[0], "insert") as Record<string, unknown>;
const runAfter = () => Promise.all(h.afterCbs.map((cb) => cb()));
const adminUpdate = () => {
  const [q] = admin.find("captures", "update");
  return { payload: arg(q, "update") as Record<string, unknown>, id: eqValue(q, "id") };
};

describe("POST /api/share · validación", () => {
  it("sin sesión redirige al login", async () => {
    sb.asUser(null);
    const res = await post({ text: "hola" });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://chartly.app/login");
    expect(sb.find("captures")).toHaveLength(0);
  });

  it("body que no es form → error=formato", async () => {
    const res = await POST(
      new NextRequest("https://chartly.app/api/share", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(location(res)).toBe("https://chartly.app/capturar?error=formato");
  });

  it("sin archivo ni texto → error=vacio", async () => {
    const res = await post({ title: "  ", text: "" });
    expect(location(res)).toBe("https://chartly.app/capturar?error=vacio");
  });

  it("archivo vacío y sin texto → error=vacio", async () => {
    const res = await post({ file: new File([], "x.png", { type: "image/png" }) });
    expect(location(res)).toBe("https://chartly.app/capturar?error=vacio");
  });

  it("archivo de más de 8 MB → error=grande", async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const res = await post({ file: big });
    expect(location(res)).toBe("https://chartly.app/capturar?error=grande");
    expect(sb.find("captures")).toHaveLength(0);
  });

  it("acepta exactamente 8 MB", async () => {
    const ok = new File([new Uint8Array(8 * 1024 * 1024)], "ok.png", { type: "image/png" });
    expect(location(await post({ file: ok }))).toBe("https://chartly.app/capturar/cap-1");
  });

  it("si falla el insert → error=db", async () => {
    sb = createSupabaseMock({ captures: { error: { message: "rls" } } }).asUser({ id: "u1" });
    h.user = sb;
    expect(location(await post({ text: "x" }))).toBe("https://chartly.app/capturar?error=db");
  });
});

describe("POST /api/share · guardado", () => {
  it("une título, texto y url recortados y salteando vacíos", async () => {
    await post({ title: " Pago ", text: "", url: " https://mp.com/r/1 " });
    expect(insertPayload().raw_text).toBe("Pago\nhttps://mp.com/r/1");
  });

  it("sin extractor queda pendiente para completar a mano", async () => {
    const res = await post({ text: "Pagaste $500" });
    expect(insertPayload()).toEqual({
      user_id: "u1",
      source: "share",
      mime_type: "text/plain",
      raw_text: "Pagaste $500",
      status: "pending",
      error: "sin_extractor",
    });
    expect(h.afterCbs).toHaveLength(0);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://chartly.app/capturar/cap-1");
  });

  it("con extractor queda en processing y no persiste la imagen", async () => {
    h.extractorAvailable.mockReturnValue(true);
    await post({ file: new File(["abc"], "r.jpg", { type: "image/jpeg" }) });
    const p = insertPayload();
    expect(p).toMatchObject({ status: "processing", error: null, mime_type: "image/jpeg", raw_text: null });
    expect(JSON.stringify(p)).not.toContain("YWJj"); // base64 de "abc"
  });

  it.each(["file", "image", "files"])("acepta el archivo en el campo %s", async (field) => {
    await post({ [field]: new File(["x"], "r.png", { type: "image/png" }) });
    expect(insertPayload().mime_type).toBe("image/png");
  });

  it("archivo sin tipo → application/octet-stream", async () => {
    await post({ file: new File(["x"], "r") });
    expect(insertPayload().mime_type).toBe("application/octet-stream");
  });
});

describe("POST /api/share · extracción en segundo plano", () => {
  beforeEach(() => h.extractorAvailable.mockReturnValue(true));

  it("lee el archivo en base64 y guarda el comprobante", async () => {
    h.extractMovement.mockResolvedValue({
      clase: "comprobante",
      movimiento: { tipo: "gasto", monto: 100, confianza: 0.9 },
    });
    await post({ file: new File(["abc"], "r.png", { type: "image/png" }) });
    expect(h.extractMovement).not.toHaveBeenCalled(); // recién después de responder
    await runAfter();
    expect(h.extractMovement).toHaveBeenCalledWith({ kind: "file", base64: "YWJj", mimeType: "image/png" });
    expect(adminUpdate()).toEqual({
      id: "cap-1",
      payload: {
        parsed: { clase: "comprobante", tipo: "gasto", monto: 100, confianza: 0.9 },
        confidence: 0.9,
        status: "pending",
      },
    });
  });

  it("si solo hay texto, extrae del texto", async () => {
    h.extractMovement.mockResolvedValue(null);
    await post({ text: "Recibiste $5" });
    await runAfter();
    expect(h.extractMovement).toHaveBeenCalledWith({ kind: "text", text: "Recibiste $5" });
  });

  it("guarda jornadas aplanadas con su clase", async () => {
    h.extractMovement.mockResolvedValue({
      clase: "jornada",
      jornada: { plataforma: "Rappi", items: [{ monto: 1 }], confianza: 0.4 },
    });
    await post({ text: "x" });
    await runAfter();
    expect(adminUpdate().payload).toEqual({
      parsed: { clase: "jornada", plataforma: "Rappi", items: [{ monto: 1 }], confianza: 0.4 },
      confidence: 0.4,
      status: "pending",
    });
  });

  it("si no se pudo leer nada, queda pendiente sin parsed", async () => {
    h.extractMovement.mockResolvedValue(null);
    await post({ text: "x" });
    await runAfter();
    expect(adminUpdate().payload).toEqual({ parsed: null, confidence: null, status: "pending" });
  });

  it("si el proveedor falla, guarda el error recortado y no deja la captura colgada", async () => {
    h.extractMovement.mockRejectedValue(new Error("Gemini 500: " + "x".repeat(1000)));
    await post({ text: "x" });
    await runAfter();
    const { payload } = adminUpdate();
    expect(payload.status).toBe("pending");
    expect((payload.error as string).length).toBe(300);
    expect(payload.error).toMatch(/^Gemini 500/);
  });

  it("errores no-Error se guardan como error_extraccion", async () => {
    h.extractMovement.mockRejectedValue("boom");
    await post({ text: "x" });
    await runAfter();
    expect(adminUpdate().payload).toEqual({ status: "pending", error: "error_extraccion" });
  });
});

describe("GET /api/share", () => {
  it("reenvía título, texto y url a /capturar", async () => {
    const res = await GET(new NextRequest("https://chartly.app/api/share?title=Pago&text=%24100&url=https%3A%2F%2Fx.y"));
    expect(res.status).toBe(303);
    const loc = new URL(location(res)!);
    expect(loc.pathname).toBe("/capturar");
    expect(loc.searchParams.get("text")).toBe("Pago\n$100\nhttps://x.y");
  });

  it("sin parámetros va a /capturar limpio", async () => {
    const res = await GET(new NextRequest("https://chartly.app/api/share"));
    expect(location(res)).toBe("https://chartly.app/capturar");
  });
});
