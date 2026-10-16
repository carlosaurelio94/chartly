import { describe, it, expect } from "vitest";
import { addDaysIso, dayBoundsUtc, isoDayInTz, tzOffsetMinutes, wallClock } from "@/lib/dates";

// 16/10/2026 23:30 en Buenos Aires = 17/10/2026 02:30 UTC
const LATE_NIGHT_AR = new Date("2026-10-17T02:30:00Z");

describe("isoDayInTz", () => {
  it("de noche en Argentina sigue siendo el mismo día aunque en UTC ya sea mañana", () => {
    expect(isoDayInTz(LATE_NIGHT_AR, "America/Argentina/Buenos_Aires")).toBe("2026-10-16");
    expect(isoDayInTz(LATE_NIGHT_AR, "UTC")).toBe("2026-10-17");
  });

  it("respeta otras zonas (Caracas, Madrid)", () => {
    expect(isoDayInTz(LATE_NIGHT_AR, "America/Caracas")).toBe("2026-10-16");
    expect(isoDayInTz(LATE_NIGHT_AR, "Europe/Madrid")).toBe("2026-10-17");
  });

  it("una zona inválida cae a Buenos Aires en vez de romper la página", () => {
    expect(isoDayInTz(LATE_NIGHT_AR, "Mars/Olympus")).toBe("2026-10-16");
  });
});

describe("wallClock", () => {
  it("devuelve un Date con la hora de reloj del usuario en sus campos locales", () => {
    const w = wallClock(LATE_NIGHT_AR, "America/Argentina/Buenos_Aires");
    expect([w.getFullYear(), w.getMonth() + 1, w.getDate(), w.getHours(), w.getMinutes()]).toEqual([2026, 10, 16, 23, 30]);
  });
});

describe("addDaysIso", () => {
  it.each([
    ["2026-10-16", 1, "2026-10-17"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2026-10-16", -90, "2026-07-18"],
  ])("%s %+d → %s", (iso, n, out) => {
    expect(addDaysIso(iso, n)).toBe(out);
  });
});

describe("tzOffsetMinutes / dayBoundsUtc", () => {
  it("Argentina está 3 h atrás de UTC", () => {
    expect(tzOffsetMinutes(LATE_NIGHT_AR, "America/Argentina/Buenos_Aires")).toBe(-180);
  });

  it("el día en Argentina va de 03:00 UTC a 02:59:59.999 UTC del día siguiente", () => {
    expect(dayBoundsUtc("2026-10-16", "America/Argentina/Buenos_Aires")).toEqual({
      start: "2026-10-16T03:00:00.000Z",
      end: "2026-10-17T02:59:59.999Z",
    });
  });

  it("Madrid en horario de verano (UTC+2)", () => {
    expect(dayBoundsUtc("2026-07-01", "Europe/Madrid").start).toBe("2026-06-30T22:00:00.000Z");
  });
});
