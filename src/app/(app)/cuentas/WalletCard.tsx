"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtMoney, daysUntil } from "@/lib/format";
import { convert, type Rates } from "@/lib/fx";
import Modal from "@/components/Modal";
import CurrencySelect from "@/components/CurrencySelect";
import Money from "@/components/ui/Money";
import { Icons } from "@/components/ui/Icons";

export type Wallet = {
  id: string;
  name: string;
  is_preset: boolean;
  balance: number;
  balance_currency: string;
  display_order: number;
  hidden: boolean;
  balance_updated_at: string | null;
};

type Bill = {
  id: string;
  due_date: string | null;
  balance: number;
  tipo: "puntual" | "recurrente" | "acumulador";
  priority_next_week: boolean;
  kind: "expense" | "income";
  currency: string;
};

const PRESET_COLORS: Record<string, { bg: string; fg: string }> = {
  "Lemon":         { bg: "#fde047", fg: "#1a1a1a" },
  "Astro":         { bg: "#fb923c", fg: "#1a1a1a" },
  "BBVA":          { bg: "#1d4ed8", fg: "#fff" },
  "Santander":     { bg: "#ef4444", fg: "#fff" },
  "Galicia":       { bg: "#f97316", fg: "#fff" },
  "Mercado Pago":  { bg: "#22d3ee", fg: "#0c2230" },
  "Buenbit":       { bg: "#a78bfa", fg: "#1a1a1a" },
  "Efectivo":      { bg: "#34d399", fg: "#0c2230" },
  "Naranja":       { bg: "#ff5b16", fg: "#fff" },
  "Brubank":       { bg: "#7c3aed", fg: "#fff" },
};

function colorFor(name: string): { bg: string; fg: string } {
  if (PRESET_COLORS[name]) return PRESET_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { bg: `hsl(${hue}, 65%, 60%)`, fg: "#fff" };
}

export default function WalletCard({
  wallets,
  bills,
  defaultCurrency,
  rates,
  onNewExpense,
  onNewIncome,
}: {
  wallets: Wallet[];
  bills: Bill[];
  defaultCurrency: string;
  rates: Rates;
  onNewExpense: () => void;
  onNewIncome: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Wallet | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  // Total billetera convertido a moneda default
  const totals = useMemo(() => {
    let pocket = 0;
    let allConvertible = true;
    let unconvertibleCount = 0;
    for (const w of wallets) {
      if (w.hidden) continue;
      if (w.balance_currency === defaultCurrency) {
        pocket += Number(w.balance);
        continue;
      }
      const c = convert(Number(w.balance), w.balance_currency, defaultCurrency, rates);
      if (c === null) {
        allConvertible = false;
        unconvertibleCount += 1;
      } else {
        pocket += c;
      }
    }
    return { pocket, allConvertible, unconvertibleCount };
  }, [wallets, defaultCurrency, rates]);

  // "Por pagar esta semana" = bills no archivadas, balance > 0, expense, due_date <= +7 OR priority_next_week
  const dueWeek = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const b of bills) {
      if (b.kind !== "expense") continue;
      if (b.tipo === "acumulador") continue;
      if (Number(b.balance) <= 0) continue;
      const d = daysUntil(b.due_date);
      const inWindow = (d !== null && d <= 7) || b.priority_next_week;
      if (!inWindow) continue;
      const c = convert(Number(b.balance), b.currency, defaultCurrency, rates);
      if (c === null) continue;
      total += c;
      count += 1;
    }
    return { total, count };
  }, [bills, defaultCurrency, rates]);

  const available = totals.pocket - dueWeek.total;
  const hasNoWallets = wallets.filter((w) => !w.hidden).length === 0;

  const visibleWallets = wallets
    .filter((w) => !w.hidden)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      {/* Hero: neobank gradient balance */}
      <div
        style={{
          position: "relative", overflow: "hidden",
          background: "linear-gradient(160deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 75%, #000) 100%)",
          borderRadius: 32, padding: 24, color: "var(--color-accent-on)",
        }}
      >
        <div aria-hidden style={{ position: "absolute", right: -40, top: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.18)", filter: "blur(40px)", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", left: -30, bottom: -50, width: 120, height: 120, borderRadius: "50%", background: "rgba(0,0,0,0.12)", filter: "blur(30px)", pointerEvents: "none" }} />

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.6 }}>
              En tu bolsillo
            </div>
            <div style={{ marginTop: 6 }}>
              <Money amount={totals.pocket} currency={defaultCurrency} size={36} weight={800} color="var(--color-accent-on)" />
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7, fontWeight: 500 }}>
              {visibleWallets.length} cuenta{visibleWallets.length === 1 ? "" : "s"} · {defaultCurrency}
            </div>
            {!totals.allConvertible && (
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75, fontWeight: 500 }}>
                {totals.unconvertibleCount} sin tasa de cambio
              </div>
            )}
          </div>
          <button
            onClick={() => setManageOpen(true)}
            aria-label="Administrar cuentas"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px",
              background: "rgba(0,0,0,0.18)", color: "var(--color-accent-on)",
              borderRadius: 999, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Icons.bolt size={14} /> Editar
          </button>
        </div>

        {hasNoWallets ? (
          <div style={{ position: "relative", marginTop: 18, padding: 14, borderRadius: 20, background: "rgba(0,0,0,0.18)", border: "1px dashed rgba(255,255,255,0.25)", fontSize: 13, fontWeight: 500 }}>
            Aún no tenés cuentas. Agregá tus billeteras desde Ajustes (Lemon, BBVA, Efectivo…).
          </div>
        ) : (
          <div className="no-scrollbar" style={{ position: "relative", marginTop: 22, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {visibleWallets.map((w) => {
              const c = colorFor(w.name);
              return (
                <button
                  key={w.id}
                  onClick={() => setEditing(w)}
                  style={{
                    flexShrink: 0, background: "rgba(0,0,0,0.22)",
                    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18,
                    padding: "10px 12px", minWidth: 132,
                    display: "flex", flexDirection: "column", gap: 8,
                    cursor: "pointer", fontFamily: "inherit", color: "var(--color-accent-on)", textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 24, height: 24, borderRadius: 8,
                        background: c.bg, color: c.fg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                      }}
                    >
                      {w.name[0]}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{w.name}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(Number(w.balance), w.balance_currency)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        <QuickAction onClick={onNewExpense} label="Gasto" icon={<Icons.send size={20} />} />
        <QuickAction onClick={onNewIncome} label="Ingreso" icon={<Icons.receive size={20} />} highlight />
        <QuickAction onClick={() => setManageOpen(true)} label="Cuentas" icon={<Icons.wallet size={20} />} />
        <QuickAction onClick={() => router.push("/metricas")} label="Métricas" icon={<Icons.chart size={20} />} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card-sm overflow-hidden">
          <p className="label">Esta semana</p>
          <div className="mt-2 min-w-0 overflow-hidden">
            <Money amount={dueWeek.total} currency={defaultCurrency} size={20} weight={700} color="var(--color-danger)" />
          </div>
          <p className="text-[12px] text-muted font-medium mt-1">
            por pagar · {dueWeek.count} cuenta{dueWeek.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="card-sm overflow-hidden">
          <p className="label">Disponible</p>
          <div className="mt-2 min-w-0 overflow-hidden">
            <Money amount={available} currency={defaultCurrency} size={20} weight={700}
              color={available < 0 ? "var(--color-danger)" : "var(--color-ok)"} />
          </div>
          <p className="text-[12px] text-muted font-medium mt-1">bolsillo − semana</p>
        </div>
      </div>

      <EditWalletModal
        wallet={editing}
        onClose={() => setEditing(null)}
        defaultCurrency={defaultCurrency}
        onSaved={() => router.refresh()}
      />

      <ManageWalletsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        wallets={wallets}
        defaultCurrency={defaultCurrency}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

function QuickAction({
  icon, label, onClick, highlight,
}: {
  icon: React.ReactNode; label: string; onClick?: () => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        padding: "14px 4px", cursor: "pointer", fontFamily: "inherit",
        background: highlight ? "var(--color-accent-tint)" : "var(--color-card)",
        borderRadius: 22,
        border: highlight ? "1px solid transparent" : "1px solid var(--color-line)",
      }}
    >
      <span
        style={{
          width: 36, height: 36, borderRadius: 12,
          background: highlight ? "var(--color-accent)" : "color-mix(in srgb, var(--color-fg) 8%, transparent)",
          color: highlight ? "var(--color-accent-on)" : "var(--color-fg)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fg)" }}>{label}</span>
    </button>
  );
}

function EditWalletModal({
  wallet, onClose, defaultCurrency, onSaved,
}: {
  wallet: Wallet | null;
  onClose: () => void;
  defaultCurrency: string;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = !!wallet;

  useEffect(() => {
    if (wallet) setAmount(String(Number(wallet.balance) || 0));
  }, [wallet]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setErr(null);
    setBusy(true);
    const n = Number(amount.replace(",", "."));
    if (!isFinite(n)) { setErr("Monto inválido"); setBusy(false); return; }
    const supabase = createClient();
    const { error } = await supabase.from("payment_methods").update({
      balance: n,
      balance_currency: wallet.balance_currency || defaultCurrency,
      balance_updated_at: new Date().toISOString(),
    }).eq("id", wallet.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setAmount("");
    onSaved();
    onClose();
  }

  function close() {
    setAmount("");
    setErr(null);
    onClose();
  }

  if (!wallet) return null;
  return (
    <Modal open={open} onClose={close} title={`Saldo en ${wallet.name}`}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">¿Cuánto tenés en {wallet.name}?</label>
          <input
            type="text"
            inputMode="decimal"
            className="input mt-1 text-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>
        <p className="text-xs text-muted">
          Moneda: {wallet.balance_currency}. Cambiala desde el ⚙ si necesitás otra.
        </p>
        {wallet.balance_updated_at && (
          <p className="text-xs text-muted">
            Última actualización: {new Date(wallet.balance_updated_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
        {err && <p className="text-danger text-sm">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={close} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManageWalletsModal({
  open, onClose, wallets, defaultCurrency, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
  defaultCurrency: string;
  onChanged: () => void;
}) {
  async function setHidden(id: string, hidden: boolean) {
    const supabase = createClient();
    await supabase.from("payment_methods").update({ hidden }).eq("id", id);
    onChanged();
  }

  async function setCurrency(id: string, code: string) {
    const supabase = createClient();
    await supabase.from("payment_methods").update({ balance_currency: code }).eq("id", id);
    onChanged();
  }

  return (
    <Modal open={open} onClose={onClose} title="Cuentas y billeteras">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Mostrá u ocultá billeteras del «bolsillo» y elegí la moneda de cada una. Para crear/borrar cuentas, andá a Ajustes → Medios de pago.
        </p>
        {wallets.length === 0 ? (
          <p className="text-sm text-muted">No hay medios de pago todavía.</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {wallets
              .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
              .map((w) => (
                <li key={w.id} className="border border-line rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{w.name}</span>
                    <button
                      onClick={() => setHidden(w.id, !w.hidden)}
                      className={`chip border text-xs ${w.hidden ? "border-line text-muted" : "border-accent text-accent"}`}
                    >
                      {w.hidden ? "Oculta" : "Visible"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted">Moneda:</span>
                    <div className="flex-1">
                      <CurrencySelect
                        value={w.balance_currency || defaultCurrency}
                        onChange={(c) => setCurrency(w.id, c)}
                      />
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <button onClick={onClose} className="btn-primary w-full">Listo</button>
      </div>
    </Modal>
  );
}
