"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm card">
        <h1 className="text-2xl font-semibold mb-1">Chartly</h1>
        <p className="text-muted text-sm mb-6">
          Gastos, ingresos, agenda y métricas. Inicia con tu correo.
        </p>

        {sent ? (
          <div className="text-sm">
            <p className="mb-2">Te envié un enlace a <span className="text-accent">{email}</span>.</p>
            <p className="text-muted">Ábrelo en este mismo dispositivo para entrar.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="input"
              autoComplete="email"
              inputMode="email"
            />
            {error && <p className="text-danger text-sm">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviarme enlace"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
