"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPush } from "@/components/NotificationsBootstrap";
import CurrencySelect from "@/components/CurrencySelect";
import InstallButton from "@/components/InstallButton";

type Category = { id: string; name: string; color: string; parent_id: string | null };
type PaymentMethod = { id: string; name: string; is_preset: boolean };

const SWATCHES = ["#7dd3fc", "#4ade80", "#f87171", "#fbbf24", "#c084fc", "#f472b6", "#94a3b8"];
const PRESET_PAYMENT_METHODS = ["Lemon", "Astro", "BBVA", "Santander", "Galicia", "Mercado Pago", "Buenbit", "Efectivo"];

export default function AjustesClient({
  email,
  defaultCurrency,
  displayName,
  categories,
  paymentMethods,
}: {
  email: string;
  defaultCurrency: string;
  displayName: string;
  categories: Category[];
  paymentMethods: PaymentMethod[];
}) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const [name, setName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);

  const [currency, setCurrency] = useState(defaultCurrency);
  const [savingCur, setSavingCur] = useState(false);
  const [curMsg, setCurMsg] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(SWATCHES[0]);
  const [newCatParent, setNewCatParent] = useState<string>("");
  const [catErr, setCatErr] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(false);

  const [newPm, setNewPm] = useState("");
  const [pmErr, setPmErr] = useState<string | null>(null);
  const [pmLoading, setPmLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  // Auto-seed presets on first load
  useEffect(() => {
    (async () => {
      if (paymentMethods.length > 0) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("payment_methods").insert(
        PRESET_PAYMENT_METHODS.map((n) => ({ user_id: user.id, name: n, is_preset: true }))
      );
      router.refresh();
    })();
  }, [paymentMethods.length, router]);

  async function enablePush() {
    setPushMsg(null);
    const r = await subscribeToPush();
    if (r.ok) {
      setPerm("granted");
      setPushMsg("Notificaciones activadas en este dispositivo.");
    } else {
      setPushMsg(r.reason ?? "No se pudo activar.");
    }
  }

  async function saveName() {
    setSavingName(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingName(false); return; }
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      display_name: name.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSavingName(false);
    router.refresh();
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
      parent_id: newCatParent || null,
    });
    setCatLoading(false);
    if (error) { setCatErr(error.message); return; }
    setNewCatName(""); setNewCatColor(SWATCHES[0]); setNewCatParent("");
    router.refresh();
  }

  async function deleteCategory(id: string) {
    if (!confirm("¿Eliminar categoría? Las cuentas que la tenían quedarán sin categoría.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("bill_categories").delete().eq("id", id);
    if (error) { setCatErr(error.message); return; }
    router.refresh();
  }

  async function addPm(e: React.FormEvent) {
    e.preventDefault();
    setPmErr(null);
    if (!newPm.trim()) return;
    setPmLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPmErr("Sesión expirada"); setPmLoading(false); return; }
    const { error } = await supabase.from("payment_methods").insert({
      user_id: user.id, name: newPm.trim(), is_preset: false,
    });
    setPmLoading(false);
    if (error) { setPmErr(error.message); return; }
    setNewPm("");
    router.refresh();
  }

  async function deletePm(id: string) {
    if (!confirm("¿Eliminar medio de pago?")) return;
    const supabase = createClient();
    await supabase.from("payment_methods").delete().eq("id", id);
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const parentCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <p className="label">¿Cómo te llamamos?</p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={40}
          />
          <button onClick={saveName} className="btn-primary" disabled={savingName}>
            {savingName ? "…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="card">
        <p className="label">Sesión</p>
        <p className="font-medium">{email}</p>
        <button onClick={signOut} className="btn-ghost mt-3">Cerrar sesión</button>
      </div>

      <div className="card space-y-2">
        <p className="label">Descargar app</p>
        <InstallButton />
      </div>

      <div className="card space-y-2">
        <p className="label">Moneda por defecto</p>
        <p className="text-sm text-muted">Se usará al crear nuevos gastos e ingresos y para conversiones.</p>
        <CurrencySelect value={currency} onChange={saveCurrency} />
        {savingCur && <p className="text-xs text-muted">Guardando…</p>}
        {curMsg && <p className="text-xs text-muted">{curMsg}</p>}
      </div>

      <div className="card space-y-3">
        <div>
          <p className="label">Categorías y superbloques</p>
          <p className="text-sm text-muted">
            Crea una categoría padre (ej. <span className="text-accent">Moto</span>) y asigna sub-categorías
            (service, cochera, nafta…). Las métricas suman cada superbloque como un solo ítem.
          </p>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-muted">Aún no tienes categorías.</p>
        ) : (
          <ul className="space-y-1">
            {parentCategories.map((p) => {
              const children = categories.filter((c) => c.parent_id === p.id);
              return (
                <li key={p.id} className="border border-line rounded-lg p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="font-medium truncate">{p.name}</span>
                    </div>
                    <button onClick={() => deleteCategory(p.id)} className="text-xs text-danger">Eliminar</button>
                  </div>
                  {children.length > 0 && (
                    <ul className="ml-4 space-y-1">
                      {children.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted">↳</span>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            <span className="truncate">{c.name}</span>
                          </div>
                          <button onClick={() => deleteCategory(c.id)} className="text-xs text-danger">Eliminar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {/* Categories without parent already shown above. Orphans (parent deleted) shown below */}
          </ul>
        )}

        <form onSubmit={addCategory} className="space-y-2 pt-2 border-t border-line">
          <div>
            <label className="label">Nueva categoría</label>
            <input
              className="input mt-1"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Comida, transporte, service, nafta…"
            />
          </div>
          <div>
            <label className="label">Pertenece a (opcional)</label>
            <select
              className="input mt-1"
              value={newCatParent}
              onChange={(e) => setNewCatParent(e.target.value)}
            >
              <option value="">— Sin superbloque (categoría principal) —</option>
              {parentCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
          <p className="label">Medios de pago</p>
          <p className="text-sm text-muted">Disponibles al registrar pagos/cobros.</p>
        </div>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : (
          <ul className="space-y-1">
            {paymentMethods.map((pm) => (
              <li key={pm.id} className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2 text-sm">
                <span className="truncate">{pm.name}{pm.is_preset && <span className="text-xs text-muted ml-2">(preset)</span>}</span>
                <button onClick={() => deletePm(pm.id)} className="text-xs text-danger">Eliminar</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addPm} className="space-y-2 pt-2 border-t border-line">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={newPm}
              onChange={(e) => setNewPm(e.target.value)}
              placeholder="Nuevo medio de pago"
            />
            <button className="btn-primary" disabled={pmLoading || !newPm.trim()}>
              {pmLoading ? "…" : "Agregar"}
            </button>
          </div>
          {pmErr && <p className="text-danger text-sm">{pmErr}</p>}
        </form>
      </div>

      <div className="card space-y-3">
        <div>
          <p className="label">Notificaciones</p>
          <p className="text-sm text-muted mt-1">
            Para recibir recordatorios de la agenda. En iPhone, primero{" "}
            <span className="text-accent">Añade a pantalla de inicio</span> desde Safari.
          </p>
        </div>
        {perm === "unsupported" && (
          <p className="text-sm text-danger">Tu navegador no soporta notificaciones.</p>
        )}
        {perm === "granted" ? (
          <p className="text-sm text-ok">Activadas en este dispositivo ✓</p>
        ) : perm === "denied" ? (
          <p className="text-sm text-danger">
            Permiso denegado. Habilítalo desde la configuración del navegador (candado en la URL → Notificaciones → Permitir).
          </p>
        ) : (
          <button onClick={enablePush} className="btn-primary">Activar notificaciones</button>
        )}
        {pushMsg && <p className="text-sm text-muted">{pushMsg}</p>}
      </div>
    </div>
  );
}
