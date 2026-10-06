import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, arg, eqValue, type SupabaseMock } from "../helpers/supabase";

const h = vi.hoisted(() => ({ user: null as unknown, admin: null as unknown, send: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => h.user) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => h.admin) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: h.send } }));

import { POST } from "@/app/api/boards/invite/route";

const OWNER = { id: "owner-1", email: "dueno@x.com" };
const BOARD = { id: "board-1", name: "Mudanza", owner_id: OWNER.id };

let sb: SupabaseMock;
let admin: SupabaseMock;
let state: {
  board: typeof BOARD | null;
  users: { id: string; email?: string }[];
  member: boolean;
  pending: { id: string } | null;
  insertError: { message: string } | null;
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[];
};

beforeEach(() => {
  state = { board: BOARD, users: [], member: false, pending: null, insertError: null, subs: [] };
  sb = createSupabaseMock({
    boards: () => ({ data: state.board }),
    board_invitations: () => (state.insertError ? { error: state.insertError } : { data: { id: "inv-new" } }),
  }).asUser(OWNER);
  admin = createSupabaseMock({
    board_members: () => ({ data: state.member ? { user_id: "x" } : null }),
    board_invitations: () => ({ data: state.pending }),
    push_subscriptions: (q) => (q.ops[0].method === "select" ? { data: state.subs } : {}),
  });
  admin.auth.admin.listUsers.mockImplementation(async () => ({ data: { users: state.users }, error: null }));
  h.user = sb;
  h.admin = admin;
  h.send.mockReset().mockResolvedValue({});
});

async function invite(body: unknown) {
  const res = await POST(
    new NextRequest("https://chartly.app/api/boards/invite", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: res.status, body: await res.json() };
}
const valid = { board_id: "board-1", email: "  Ana@Mail.COM " };
const inserted = () => arg(sb.find("board_invitations", "insert")[0], "insert") as Record<string, unknown>;

describe("POST /api/boards/invite · validación", () => {
  it("401 sin sesión", async () => {
    sb.asUser(null);
    expect(await invite(valid)).toEqual({ status: 401, body: { ok: false, error: "unauthorized" } });
  });

  it("400 con JSON inválido", async () => {
    expect(await invite("{nope")).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
  });

  it.each([
    [{}],
    [{ board_id: "board-1" }],
    [{ email: "a@b.c" }],
    [{ board_id: "  ", email: "a@b.c" }],
    [{ board_id: "board-1", email: "   " }],
  ])("400 si faltan campos: %j", async (body) => {
    expect(await invite(body)).toEqual({ status: 400, body: { ok: false, error: "missing_fields" } });
  });

  it("403 si el tablero no existe", async () => {
    state.board = null;
    expect(await invite(valid)).toEqual({ status: 403, body: { ok: false, error: "not_owner" } });
  });

  it("403 si quien invita no es el dueño", async () => {
    state.board = { ...BOARD, owner_id: "otro" };
    expect((await invite(valid)).status).toBe(403);
    expect(sb.find("board_invitations")).toHaveLength(0);
  });
});

describe("POST /api/boards/invite · invitado no registrado", () => {
  it("crea la invitación con email normalizado y rol editor por defecto", async () => {
    const r = await invite({ ...valid, message: "  ¡Sumate!  " });
    expect(inserted()).toEqual({
      board_id: "board-1",
      invited_email: "ana@mail.com",
      invited_by: OWNER.id,
      role: "editor",
      message: "¡Sumate!",
    });
    expect(r).toEqual({
      status: 200,
      body: { ok: true, invitation_id: "inv-new", target_registered: false, pushed: 0, email_sent: true },
    });
  });

  it("manda el mail de invitación de Supabase con metadata del tablero", async () => {
    await invite(valid);
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("ana@mail.com", {
      data: { invited_to_board: "board-1", board_name: "Mudanza" },
    });
  });

  it.each([
    ["viewer", "viewer"],
    ["editor", "editor"],
    ["admin", "editor"],
    [undefined, "editor"],
  ])("rol %j → %s", async (role, expected) => {
    await invite({ ...valid, role });
    expect(inserted().role).toBe(expected);
  });

  it("mensaje vacío o ausente → null", async () => {
    await invite({ ...valid, message: "   " });
    expect(inserted().message).toBeNull();
  });

  it("no duplica una invitación pendiente", async () => {
    state.pending = { id: "inv-old" };
    const r = await invite(valid);
    expect(sb.find("board_invitations", "insert")).toHaveLength(0);
    expect(r.body.invitation_id).toBe("inv-old");
    const [q] = admin.find("board_invitations");
    expect(q.ops).toEqual(
      expect.arrayContaining([
        { method: "ilike", args: ["invited_email", "ana@mail.com"] },
        { method: "eq", args: ["status", "pending"] },
      ]),
    );
  });

  it("500 si falla el insert", async () => {
    state.insertError = { message: "violates rls" };
    expect(await invite(valid)).toEqual({ status: 500, body: { ok: false, error: "violates rls" } });
  });

  it("si el mail falla, la invitación igual se crea", async () => {
    admin.auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: {}, error: { message: "rate limit" } });
    expect((await invite(valid)).body).toMatchObject({ ok: true, email_sent: false });
  });

  it("si el envío de mail lanza, no rompe la respuesta", async () => {
    admin.auth.admin.inviteUserByEmail.mockRejectedValueOnce(new Error("smtp"));
    expect((await invite(valid)).body).toMatchObject({ ok: true, email_sent: false });
  });
});

describe("POST /api/boards/invite · invitado registrado", () => {
  beforeEach(() => {
    state.users = [{ id: "ana-id", email: "ANA@mail.com" }, { id: "otro", email: undefined }];
  });

  it("si ya es miembro no crea nada", async () => {
    state.member = true;
    const r = await invite(valid);
    expect(r).toEqual({ status: 200, body: { ok: true, already_member: true } });
    expect(sb.find("board_invitations")).toHaveLength(0);
    const [q] = admin.find("board_members");
    expect(eqValue(q, "user_id")).toBe("ana-id");
    expect(eqValue(q, "board_id")).toBe("board-1");
  });

  it("le manda push y no un mail", async () => {
    state.subs = [{ id: "s1", endpoint: "https://push/1", p256dh: "p", auth: "a" }];
    const r = await invite({ ...valid, role: "viewer" });
    expect(JSON.parse(h.send.mock.calls[0][1])).toEqual({
      title: "Te invitaron a un tablero",
      body: "Mudanza — como lector",
      url: "/trabajos",
      tag: "board-invite-inv-new",
    });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(r.body).toEqual({ ok: true, invitation_id: "inv-new", target_registered: true, pushed: 1, email_sent: false });
  });

  it("limpia suscripciones vencidas y cuenta solo las enviadas", async () => {
    state.subs = [
      { id: "s1", endpoint: "e1", p256dh: "p", auth: "a" },
      { id: "s2", endpoint: "e2", p256dh: "p", auth: "a" },
    ];
    h.send.mockRejectedValueOnce({ statusCode: 410 });
    const r = await invite(valid);
    expect(r.body.pushed).toBe(1);
    expect(admin.find("push_subscriptions", "delete").map((q) => eqValue(q, "id"))).toEqual(["s1"]);
  });
});
