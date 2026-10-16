import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/log/route";

const post = (body: string) =>
  POST(new NextRequest("https://chartly.app/api/log", { method: "POST", body, headers: { "user-agent": "Pixel" } }));

describe("POST /api/log", () => {
  it("escribe una línea JSON en los logs y responde 204", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify({ message: "boom", path: "/hoy", digest: "abc" }));
    expect(res.status).toBe(204);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", source: "client", message: "boom", path: "/hoy", digest: "abc", ua: "Pixel" });
  });

  it("recorta mensajes enormes", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await post(JSON.stringify({ message: "x".repeat(400), stack: "y".repeat(3000) }));
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.message.length).toBeLessThanOrEqual(500);
    expect(line.stack.length).toBe(1500);
  });

  it("ignora basura sin loguear", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("no es json")).status).toBe(204);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignora campos que no son texto", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await post(JSON.stringify({ message: { evil: true }, path: 5 }));
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.message).toBeUndefined();
    expect(line.path).toBeUndefined();
  });
});
