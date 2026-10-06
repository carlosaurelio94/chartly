import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ setVapid: vi.fn(), send: vi.fn() }));
vi.mock("web-push", () => ({ default: { setVapidDetails: h.setVapid, sendNotification: h.send } }));

const sub = { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  vi.resetModules();
  h.setVapid.mockReset();
  h.send.mockReset().mockResolvedValue({ statusCode: 201 });
});

describe("sendPush", () => {
  it("no toca VAPID al importar (el build no necesita las keys)", async () => {
    await import("@/lib/push");
    expect(h.setVapid).not.toHaveBeenCalled();
  });

  it("configura VAPID una sola vez, en el primer envío", async () => {
    vi.stubEnv("VAPID_SUBJECT", "mailto:yo@chartly.app");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    const { sendPush } = await import("@/lib/push");
    await sendPush(sub, "a");
    await sendPush(sub, "b");
    expect(h.setVapid).toHaveBeenCalledTimes(1);
    expect(h.setVapid).toHaveBeenCalledWith("mailto:yo@chartly.app", "pub", "priv");
    expect(h.send).toHaveBeenNthCalledWith(2, sub, "b");
  });

  it("usa un subject por defecto", async () => {
    vi.stubEnv("VAPID_SUBJECT", "");
    const { sendPush } = await import("@/lib/push");
    await sendPush(sub, "x");
    expect(h.setVapid.mock.calls[0][0]).toBe("mailto:owner@example.com");
  });

  it("si faltan las keys, falla el envío (no el módulo) y reintenta configurar después", async () => {
    h.setVapid.mockImplementationOnce(() => {
      throw new Error("No key set vapidDetails.publicKey");
    });
    const { sendPush } = await import("@/lib/push");
    expect(() => sendPush(sub, "x")).toThrow("No key set");
    await sendPush(sub, "y");
    expect(h.setVapid).toHaveBeenCalledTimes(2);
    expect(h.send).toHaveBeenCalledWith(sub, "y");
  });
});
