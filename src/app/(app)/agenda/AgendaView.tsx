"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";

export type Item = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  done: boolean;
  notify_minutes_before: number | null;
};

type View = "day" | "week" | "month";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function fmtDayHeader(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(d);
}
function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function AgendaView({ initial }: { initial: Item[] }) {
  const [view, setView] = useState<View>("day");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [openItem, setOpenItem] = useState<Item | "new" | null>(null);
  const [presetTime, setPresetTime] = useState<Date | null>(null);
  const router = useRouter();

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
        <div className="flex gap-1">
          {(["day","week","month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`chip border ${view === v ? "bg-accent text-black border-accent" : "border-line text-muted"}`}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <button onClick={() => { setPresetTime(null); setOpenItem("new"); }} className="btn-primary shrink-0">+ Tarea</button>
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
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  function go(dir: -1 | 1) {
    if (view === "month") {
      const d = new Date(cursor);
      d.setMonth(d.getMonth() + dir);
      setCursor(startOfDay(d));
    } else {
      setCursor(addDays(cursor, dir * step));
    }
  }
  const label =
    view === "day" ? fmtDayHeader(cursor)
    : view === "week" ? `Sem ${fmtDayHeader(weekStart(cursor))} – ${fmtDayHeader(addDays(weekStart(cursor), 6))}`
    : new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(cursor);
  return (
    <div className="flex items-center justify-between">
      <button onClick={() => go(-1)} className="btn-ghost">‹</button>
      <button onClick={() => setCursor(startOfDay(new Date()))} className="text-sm text-muted capitalize">
        {label}
      </button>
      <button onClick={() => go(1)} className="btn-ghost">›</button>
    </div>
  );
}

function weekStart(d: Date) {
  // Monday as start of week
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Mon
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
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm
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
                  {hourItems.length === 0 && <span className="text-xs text-muted/40">+ agregar</span>}
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
  return (
    <div className="space-y-2">
      {days.map((d) => {
        const items = itemsByDay.get(d.toDateString()) ?? [];
        const isToday = sameDay(d, new Date());
        return (
          <div key={d.toDateString()} className={`card ${isToday ? "border-accent" : ""}`}>
            <button onClick={() => onTapDay(d)} className="w-full text-left">
              <p className={`text-sm font-medium capitalize ${isToday ? "text-accent" : ""}`}>{fmtDayHeader(d)}</p>
            </button>
            {items.length === 0 ? (
              <p className="text-xs text-muted mt-1">Sin tareas</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {items.map((it) => (
                  <li key={it.id}>
                    <button onClick={() => onTapItem(it)} className="w-full text-left flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted shrink-0">{it.all_day ? "—" : fmtTime(new Date(it.starts_at))}</span>
                      <span className={`truncate ${it.done ? "line-through text-muted" : ""}`}>{it.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
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

    const payload = {
      title,
      notes: notes || null,
      starts_at: startsAt.toISOString(),
      all_day: allDay,
      notify_minutes_before: notify === "" ? null : Number(notify),
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
        <div className="flex items-center gap-2">
          <input type="checkbox" id="allday" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <label htmlFor="allday" className="text-sm">Todo el día</label>
        </div>
        <div className={`grid gap-3 ${allDay ? "grid-cols-1" : "grid-cols-2"}`}>
          <div>
            <label className="label">Fecha</label>
            <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {!allDay && (
            <div>
              <label className="label">Hora</label>
              <input className="input mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
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
