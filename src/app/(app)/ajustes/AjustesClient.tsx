"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPush } from "@/components/NotificationsBootstrap";
import CurrencySelect from "@/components/CurrencySelect";

type Category = { id: string; name: string; color: string };

const SWATCHES = ["#7dd3fc", "#4ade80", "#f87171", "#fbbf24", "#c084fc", "#f472b6", "#94a3b8"];

export default function AjustesClient({
  email,
  defaultCurrency,
  categories,
}: {
  email: string;
  defaultCurrency: string;
  categories: Category[];
}) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [msg, setMsg] = useState<string | null>(null);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [savingCur, setSavingCur] = useState(false);
  const [curMsg, setCurMsg] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(SWATCHES[0]);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  async function enable() {
    setMsg(null);
    const r = await subscribeToPush();
    if (r.ok) {
      setPerm("granted");
      setMsg("Notificaciones activadas en este dispositivo.");
    } else {
      setMsg(r.reason ?? "No se pudo activar.");
    }
  }

  async function saveCurrency(code: string) {
    setCurrency(code);
    setSavingCur(true);
    setCurMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCurMsg("Sesión expirada"); setSavingCur(false); return; }
    const { error } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      default_currency: code,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSavingCur(false);
    if (error) { setCurMsg(error.message); return; }
    setCurMsg("Guardado ✓");
    router.refresh();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setCatErr(null);
    if (!newCatName.trim()) return;
    setCatLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCatErr("Sesión expirada"); setCatLoading(false); return; }
    const { error } = await supabase.from("bill_categories").insert({
      user_id: user.id,
      name: newCatName.trim(),
      color: newCatColor,
    });
    setCatLoading(false);
    if (error) { setCatErr(error.message); return; }
    setNewCatName(""); setNewCatColor(SWATCHES[0]);
    router.refresh();
  }

  async function deleteCategory(id: string) {
    if (!confirm("¿Eliminar categoría? Las cuentas que la tenían quedarán sin categoría.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("bill_categories").delete().eq("id", id);
    if (error) { setCatErr(error.message); return; }
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="label">Sesión</p>
        <p className="font-medium">{email}</p>
        <button onClick={signOut} className="btn-ghost mt-3">Cerrar sesión</button>
      </div>

      <div className="card space-y-2">
        <p className="label">Moneda por defecto</p>
        <p className="text-sm text-muted">Se usará al crear nuevos gastos e ingresos.</p>
        <CurrencySelect value={currency} onChange={saveCurrency} />
        {savingCur && <p className="text-xs text-muted">Guardando…</p>}
        {curMsg && <p className="text-xs text-muted">{curMsg}</p>}
      </div>

      <div className="card space-y-3">
        <div>
          <p className="label">Categorías</p>
          <p className="text-sm text-muted">Para clasificar gastos e ingresos. Se guardan en tu cuenta.</p>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-muted">Aún no tienes categorías.</p>
        ) : (
          <ul className="space-y-1">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="truncate">{c.name}</span>
                </div>
                <button onClick={() => deleteCategory(c.id)} className="text-xs text-danger">Eliminar</button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCategory} className="space-y-2 pt-2 border-t border-line">
          <div>
            <label className="label">Nueva categoría</label>
            <input
              className="input mt-1"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Comida, transporte, salario…"
            />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewCatColor(s)}
                  className={`w-7 h-7 rounded-full border-2 ${newCatColor === s ? "border-fg" : "border-transparent"}`}
                  style={{ backgroundColor: s }}
                  aria-label={s}
                />
              ))}
            </div>
          </div>
          {catErr && <p className="text-danger text-sm">{catErr}</p>}
          <button className="btn-primary w-full" disabled={catLoading || !newCatName.trim()}>
            {catLoading ? "Agregando…" : "Agregar categoría"}
          </button>
        </form>
      </div>

      <div className="card space-y-3">
        <div>
          <p className="label">Notificaciones</p>
          <p className="text-sm text-muted mt-1">
            Para recibir recordatorios, activa las notificaciones en este dispositivo.
            En iPhone, primero <span className="text-accent">Añade a pantalla de inicio</span> desde Safari.
          </p>
        </div>
        {perm === "unsupported" && (
          <p className="text-sm text-danger">Tu navegador no soporta notificaciones.</p>
        )}
        {perm === "granted" ? (
          <p className="text-sm text-ok">Activadas en este dispositivo ✓</p>
        ) : (
          <button onClick={enable} className="btn-primary">Activar notificaciones</button>
        )}
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>

      <div className="card">
        <p className="label">Instalar app</p>
        <p className="text-sm text-muted mt-1">
          Android Chrome: menú ⋮ → <span className="text-accent">Añadir a pantalla principal</span>.<br />
          iPhone Safari: ⬆️ → <span className="text-accent">Añadir a pantalla de inicio</span>.
        </p>
      </div>
    </div>
  );
}
