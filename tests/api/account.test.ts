import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({ user: null as unknown, deleteUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.user) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { admin: { deleteUser: h.deleteUser } } })),
}));

import { DELETE } from "@/app/api/account/route";
import { GET } from "@/app/api/account/export/route";

let sb: SupabaseMock;
beforeEach(() => {
  sb = createSupabaseMock({
    bills: { data: [{ id: "b1", name: "Luz" }] },
    gig_tracks: { error: { message: "boom" } },
  }).asUser({ id: "u1", email: "yo@x.com" });
  (sb.auth as unknown as { signOut: () => Promise<unknown> }).signOut = vi.fn(async () => ({}));
  h.user = sb;
  h.deleteUser.mockReset().mockResolvedValue({ error: null });
});

const del = (body: unknown) =>
  DELETE(new NextRequest("https://chartly.app/api/account", { method: "DELETE", body: JSON.stringify(body) }));

describe("DELETE /api/account", () => {
  it("401 sin sesión", async () => {
    sb.asUser(null);
    expect((await del({ confirm: "BORRAR" })).status).toBe(401);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it.each([{}, { confirm: "si" }, { confirm: "" }])("pide escribir BORRAR: %j", async (body) => {
    const res = await del(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "confirm_required" });
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("borra el usuario autenticado (no otro) y cierra la sesión", async () => {
    const res = await del({ confirm: " borrar " });
    expect(await res.json()).toEqual({ ok: true });
    expect(h.deleteUser).toHaveBeenCalledWith("u1");
  });

  it("500 si Supabase falla", async () => {
    h.deleteUser.mockResolvedValueOnce({ error: { message: "nope" } });
    expect((await del({ confirm: "BORRAR" })).status).toBe(500);
  });
});

describe("GET /api/account/export", () => {
  it("401 sin sesión", async () => {
    sb.asUser(null);
    expect((await GET()).status).toBe(401);
  });

  it("descarga un JSON con todas las tablas propias", async () => {
    const res = await GET();
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="chartly-mis-datos-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.account).toEqual({ id: "u1", email: "yo@x.com" });
    expect(body.data.bills).toEqual([{ id: "b1", name: "Luz" }]);
    expect(body.data.payments).toEqual([]);
    expect(body.data.gig_tracks).toEqual({ error: "boom" });
    expect(Object.keys(body.data)).toEqual(expect.arrayContaining(["gig_entries", "agenda_items", "user_settings"]));
  });
});
