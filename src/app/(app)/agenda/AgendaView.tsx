"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import { capitalizeFirst } from "@/lib/format";

export type Category = "work" | "rest" | "fun" | "idle" | "other";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  done: boolean;
  notify_minutes_before: number | null;
  category: Category;
};

export type RoutineBlock = {
  day: number;
  start: string;
  end: string;
  title: string;
  category: Category;
};

type View = "day" | "week" | "month" | "year";

const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: "work", label: "Trabajo", emoji: "💼" },
  { value: "rest", label: "Descanso", emoji: "🛌" },
  { value: "fun", label: "Diversión", emoji: "🎉" },
  { value: "idle", label: "Ocio", emoji: "🎮" },
  { value: "other", label: "Otro", emoji: "•" },
];
const CATEGORY_LABEL: Record<Category, string> = {
  work: "Trabajo", rest: "Descanso", fun: "Diversión", idle: "Ocio", other: "Otro",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function fmtDayHeader(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(d);
}
function fmtMonthYear(d: Date) {
  // "abril de 2026" → "Abril de 2026"
  return capitalizeFirst(new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(d));
}
function fmtMonthShort(d: Date) {
  return capitalizeFirst(new Intl.DateTimeFormat("es-MX", { month: "short" }).format(d));
}
function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(d);
}

const CATEGORY_COLOR: Record<Category, string> = {
  work: "bg-sky-500/30 border-sky-400",
  rest: "bg-emerald-500/30 border-emerald-400",
  fun: "bg-pink-500/30 border-pink-400",
  idle: "bg-amber-500/30 border-amber-400",
  other: "bg-line border-line",
};

export default function AgendaView({ initial, routineBlocks }: { initial: Item[]; routineBlocks: RoutineBlock[] }) {
  const [view, setView] = useState<View>("day");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [openItem, setOpenItem] = useState<Item | "new" | null>(null);
  const [presetTime, setPresetTime] = useState<Date | null>(null);
  const [applying, setApplying] = useState(false);
  const router = useRouter();

  async function applyRoutine() {
    if (routineBlocks.length === 0) {
      alert("Aún no hay bloques de rutina. Agregalos en Ajustes.");
      return;
    }
    const dayIdx = (cursor.getDay() + 6) % 7;
    const matches = routineBlocks.filter((b) => b.day === dayIdx);
    if (matches.length === 0) {
      alert(`No tenés bloques de rutina para ${["lunes","martes","miércoles","jueves","viernes","sábado","domingo"][dayIdx]}.`);
      return;
    }
    if (!confirm(`¿Aplicar ${matches.length} bloque${matches.length === 1 ? "" : "s"} de rutina a este día?`)) return;
    setApplying(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setApplying(false); return; }
    const rows = matches.map((b) => {
      const [sh, sm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      const s = new Date(cursor); s.setHours(sh, sm, 0, 0);
      const e = new Date(cursor); e.setHours(eh, em, 0, 0);
      return {
        user_id: user.id,
        title: b.title,
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        all_day: false,
        category: b.category,
        done: false,
      };
    });
    await supabase.from("agenda_items").insert(rows);
    setApplying(false);
    router.refresh();
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of initial) {
      const key = startOfDay(new Date(it.starts_at)).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [initial]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {(["day","week","month","year"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`chip border ${view === v ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : v === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 shrink-0">
          {view === "day" && routineBlocks.length > 0 && (
            <button onClick={applyRoutine} className="btn-ghost text-sm" disabled={applying} title="Aplicar rutina al día">
              {applying ? "…" : "🔁 Rutina"}
            </button>
          )}
          <button onClick={() => { setPresetTime(null); setOpenItem("new"); }} className="btn-primary">+ Tarea</button>
        </div>
      </div>

      <Navigator view={view} cursor={cursor} setCursor={setCursor} />

      {view === "day" && (
        <DayView
          day={cursor}
          items={itemsByDay.get(cursor.toDateString()) ?? []}
          onTapHour={(hour) => {
            const t = new Date(cursor);
            t.setHours(hour, 0, 0, 0);
            setPresetTime(t);
            setOpenItem("new");
          }}
          onTapItem={(it) => { setPresetTime(null); setOpenItem(it); }}
          onToggleDone={async (it) => {
            const supabase = createClient();
            await supabase.from("agenda_items").update({ done: !it.done }).eq("id", it.id);
            router.refresh();
          }}
        />
      )}

      {view === "week" && (
        <WeekView
          startDay={cursor}
          itemsByDay={itemsByDay}
          onTapDay={(d) => { setCursor(d); setView("day"); }}
          onTapItem={(it) => { setPresetTime(null); setOpenItem(it); }}
        />
      )}

      {view === "month" && (
        <MonthView
          monthDay={cursor}
          itemsByDay={itemsByDay}
          onTapDay={(d) => { setCursor(d); setView("day"); }}
        />
      )}

      {view === "year" && (
        <YearView
          yearDay={cursor}
          itemsByDay={itemsByDay}
          onTapMonth={(d) => { setCursor(d); setView("month"); }}
        />
      )}

      {openItem && (
        <ItemModal
          key={openItem === "new" ? "new" : openItem.id}
          editing={openItem === "new" ? null : openItem}
          presetTime={presetTime}
          presetDay={cursor}
          onClose={() => setOpenItem(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Navigator({ view, cursor, setCursor }: { view: View; cursor: Date; setCursor: (d: Date) => void }) {
  function go(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else if (view === "month") d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setCursor(startOfDay(d));
  }
  const label =
    view === "day" ? capitalizeFirst(fmtDayHeader(cursor))
    : view === "week" ? `Sem ${capitalizeFirst(fmtDayHeader(weekStart(cursor)))} – ${capitalizeFirst(fmtDayHeader(addDays(weekStart(cursor), 6)))}`
    : view === "month" ? fmtMonthYear(cursor)
    : String(cursor.getFullYear());
  return (
    <div className="flex items-center justify-between">
      <button onClick={() => go(-1)} className="btn-ghost">‹</button>
      <button onClick={() => setCursor(startOfDay(new Date()))} className="text-sm text-muted">
        {label}
      </button>
      <button onClick={() => go(1)} className="btn-ghost">›</button>
    </div>
  );
}

function weekStart(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  return addDays(x, -day);
}

function DayView({
  day, items, onTapHour, onTapItem, onToggleDone,
}: {
  day: Date;
  items: Item[];
  onTapHour: (hour: number) => void;
  onTapItem: (it: Item) => void;
  onToggleDone: (it: Item) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allDay = items.filter((i) => i.all_day);
  const timed = items.filter((i) => !i.all_day);
  const itemsByHour = new Map<number, Item[]>();
  for (const it of timed) {
    const h = new Date(it.starts_at).getHours();
    if (!itemsByHour.has(h)) itemsByHour.set(h, []);
    itemsByHour.get(h)!.push(it);
  }

  return (
    <div className="space-y-3">
      {allDay.length > 0 && (
        <div>
          <p className="label mb-1">Todo el día</p>
          <ul className="space-y-1">
            {allDay.map((it) => (
              <li key={it.id}>
                <button onClick={() => onTapItem(it)} className="card w-full text-left flex items-center justify-between">
                  <span className={it.done ? "line-through text-muted" : ""}>{it.title}</span>
                  <input type="checkbox" checked={it.done} onChange={(e) => { e.stopPropagation(); onToggleDone(it); }} onClick={(e) => e.stopPropagation()} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="border border-line rounded-2xl overflow-hidden bg-card">
        {hours.map((h) => {
          const hourItems = itemsByHour.get(h) ?? [];
          return (
            <li key={h} className="border-b border-line last:border-b-0">
              <button onClick={() => onTapHour(h)} className="w-full text-left flex">
                <div className="w-14 shrink-0 px-3 py-2 text-xs text-muted border-r border-line">
                  {String(h).padStart(2, "0")}:00
                </div>
                <div className="flex-1 p-2 min-h-[48px] space-y-1">
                  {hourItems.length === 0 && <span className="text-xs text-muted/40">+ Agregar</span>}
                  {hourItems.map((it) => (
                    <div
                      key={it.id}
                      onClick={(e) => { e.stopPropagation(); onTapItem(it); }}
                      className={`rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm flex items-center gap-2 ${it.done ? "opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={(e) => { e.stopPropagation(); onToggleDone(it); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs text-muted">{fmtTime(new Date(it.starts_at))}</span>
                      <span className={`flex-1 truncate ${it.done ? "line-through" : ""}`}>{it.title}</span>
                      {it.notify_minutes_before !== null && <span title="Notif" className="text-xs">🔔</span>}
                    </div>
                  ))}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeekView({
  startDay, itemsByDay, onTapDay, onTapItem,
}: {
  startDay: Date;
  itemsByDay: Map<string, Item[]>;
  onTapDay: (d: Date) => void;
  onTapItem: (it: Item) => void;
}) {
  const start = weekStart(startDay);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const HOUR_PX = 36;
  const FROM_H = 6;
  const TO_H = 24;
  const hours = Array.from({ length: TO_H - FROM_H }, (_, i) => i + FROM_H);
  const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];
  const today = new Date();

  return (
    <div className="border border-line rounded-2xl bg-card overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] sticky top-0 bg-card border-b border-line z-10">
          <div />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <button
                key={d.toDateString()}
                onClick={() => onTapDay(d)}
                className={`text-center py-1.5 text-xs ${isToday ? "text-accent" : "text-muted"}`}
              >
                <p>{dayLabels[i]}</p>
                <p className={`text-base font-semibold ${isToday ? "text-accent" : ""}`}>{d.getDate()}</p>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))]">
          <div className="border-r border-line">
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-muted text-right pr-1" style={{ height: HOUR_PX }}>
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const items = (itemsByDay.get(d.toDateString()) ?? []).filter((i) => !i.all_day && i.ends_at);
            return (
              <div key={d.toDateString()} className="relative border-r border-line last:border-r-0" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h) => (
                  <div key={h} className="border-b border-line/40" style={{ height: HOUR_PX }} />
                ))}
                {items.map((it) => {
                  const s = new Date(it.starts_at);
                  const e = new Date(it.ends_at!);
                  const startMin = s.getHours() * 60 + s.getMinutes() - FROM_H * 60;
                  const endMin = e.getHours() * 60 + e.getMinutes() - FROM_H * 60;
                  const top = Math.max(0, (startMin / 60) * HOUR_PX);
                  const height = Math.max(14, ((endMin - startMin) / 60) * HOUR_PX);
                  return (
                    <button
                      key={it.id}
                      onClick={(ev) => { ev.stopPropagation(); onTapItem(it); }}
                      className={`absolute left-0.5 right-0.5 rounded border text-[10px] px-1 py-0.5 text-left overflow-hidden ${CATEGORY_COLOR[it.category]} ${it.done ? "opacity-50 line-through" : ""}`}
                      style={{ top, height }}
                    >
                      <span className="block truncate font-medium">{it.title}</span>
                      <span className="block text-muted">{fmtTime(s)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  monthDay, itemsByDay, onTapDay,
}: {
  monthDay: Date;
  itemsByDay: Map<string, Item[]>;
  onTapDay: (d: Date) => void;
}) {
  const first = new Date(monthDay.getFullYear(), monthDay.getMonth(), 1);
  const start = weekStart(first);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  const today = startOfDay(new Date());
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">
        {["L","M","X","J","V","S","D"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === monthDay.getMonth();
          const items = itemsByDay.get(d.toDateString()) ?? [];
          const isToday = sameDay(d, today);
          return (
            <button
              key={d.toDateString()}
              onClick={() => onTapDay(d)}
              className={`aspect-square rounded-lg border text-xs flex flex-col items-center justify-center
                ${inMonth ? "border-line" : "border-transparent text-muted/50"}
                ${isToday ? "border-accent text-accent" : ""}`}
            >
              <span>{d.getDate()}</span>
              {items.length > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {items.slice(0, 3).map((_, i) => (
                    <span key={i} className="w-1 h-1 rounded-full bg-accent" />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearView({
  yearDay, itemsByDay, onTapMonth,
}: {
  yearDay: Date;
  itemsByDay: Map<string, Item[]>;
  onTapMonth: (d: Date) => void;
}) {
  const year = yearDay.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const today = new Date();
  const countByMonth = new Map<number, number>();
  for (const [key, list] of itemsByDay) {
    const d = new Date(key);
    if (d.getFullYear() === year) {
      countByMonth.set(d.getMonth(), (countByMonth.get(d.getMonth()) ?? 0) + list.length);
    }
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {months.map((m) => {
        const isCurrent = m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear();
        const count = countByMonth.get(m.getMonth()) ?? 0;
        return (
          <button
            key={m.getMonth()}
            onClick={() => onTapMonth(m)}
            className={`card text-left ${isCurrent ? "border-accent" : ""}`}
          >
            <p className={`text-sm font-medium ${isCurrent ? "text-accent" : ""}`}>{fmtMonthShort(m)}</p>
            <p className="text-xs text-muted mt-1">{count === 0 ? "—" : `${count} tarea${count === 1 ? "" : "s"}`}</p>
          </button>
        );
      })}
    </div>
  );
}

function ItemModal({
  editing, presetTime, presetDay, onClose, onDone,
}: {
  editing: Item | null;
  presetTime: Date | null;
  presetDay: Date;
  onClose: () => void;
  onDone: () => void;
}) {
  const initial = editing
    ? new Date(editing.starts_at)
    : presetTime
    ? presetTime
    : (() => { const d = new Date(presetDay); d.setHours(9,0,0,0); return d; })();

  const [title, setTitle] = useState(editing?.title ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [date, setDate] = useState(toLocalDateInput(initial));
  const [time, setTime] = useState(toLocalTimeInput(initial));
  const [endTime, setEndTime] = useState(
    editing?.ends_at
      ? toLocalTimeInput(new Date(editing.ends_at))
      : toLocalTimeInput(new Date(initial.getTime() + 60 * 60 * 1000))
  );
  const [category, setCategory] = useState<Category>(editing?.category ?? "other");
  const [notify, setNotify] = useState<number | "">(editing?.notify_minutes_before ?? 10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Sesión expirada"); setLoading(false); return; }

    const startsAt = allDay
      ? new Date(`${date}T00:00:00`)
      : new Date(`${date}T${time}:00`);
    const endsAt = allDay
      ? null
      : new Date(`${date}T${endTime}:00`);

    const payload = {
      title,
      notes: notes || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      all_day: allDay,
      notify_minutes_before: notify === "" ? null : Number(notify),
      category,
    };

    if (editing) {
      const { error } = await supabase.from("agenda_items").update(payload).eq("id", editing.id);
      if (error) { setErr(error.message); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("agenda_items").insert({ ...payload, user_id: user.id });
      if (error) { setErr(error.message); setLoading(false); return; }
    }
    setLoading(false);
    onClose(); onDone();
  }

  async function remove() {
    if (!editing) return;
    if (!confirm("¿Eliminar esta tarea?")) return;
    const supabase = createClient();
    await supabase.from("agenda_items").delete().eq("id", editing.id);
    onClose(); onDone();
  }

  return (
    <Modal open onClose={onClose} title={editing ? "Editar tarea" : "Nueva tarea"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Título</label>
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Categoría</label>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`chip border text-center ${
                  category === c.value ? "bg-accent text-black border-accent" : "border-line text-muted"
                }`}
              >
                <span className="mr-1">{c.emoji}</span>{c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="allday" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <label htmlFor="allday" className="text-sm">Todo el día</label>
        </div>
        <div className={`grid gap-3 ${allDay ? "grid-cols-1" : "grid-cols-3"}`}>
          <div>
            <label className="label">Fecha</label>
            <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {!allDay && (
            <>
              <div>
                <label className="label">Inicio</label>
                <input className="input mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
              <div>
                <label className="label">Fin</label>
                <input className="input mt-1" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="label">Recordatorio</label>
          <select
            className="input mt-1"
            value={notify === "" ? "" : String(notify)}
            onChange={(e) => setNotify(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Sin recordatorio</option>
            <option value="0">Al momento</option>
            <option value="5">5 min antes</option>
            <option value="10">10 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">1 hora antes</option>
            <option value="1440">1 día antes</option>
          </select>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input mt-1" rows={2} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          {editing && <button type="button" onClick={remove} className="btn-danger">Eliminar</button>}
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function toLocalDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toLocalTimeInput(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export { CATEGORY_LABEL };
