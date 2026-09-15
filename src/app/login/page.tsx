"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

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

  async function onGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Volver al callback que ya intercambia el code por sesión.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setGoogleLoading(false);
      setError(error.message);
    }
    // En caso de éxito, el navegador navega a Google y vuelve por /auth/callback.
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm card">
        <h1 className="text-2xl font-semibold mb-1">Chartly</h1>
        <p className="text-muted text-sm mb-6">
          Gastos, ingresos, agenda y métricas. Iniciá con tu cuenta de Google
          o con un enlace por email.
        </p>

        {sent ? (
          <div className="text-sm">
            <p className="mb-2">Te envié un enlace a <span className="text-accent">{email}</span>.</p>
            <p className="text-muted">Abrilo en este mismo dispositivo para entrar.</p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="btn-ghost w-full mt-4"
            >
              Volver
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-2 bg-white text-[#1f1f1f] font-medium border border-line rounded-xl py-2.5 hover:bg-zinc-100 transition disabled:opacity-60"
              aria-label="Continuar con Google"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.13 4.13 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.36 0-4.36-1.59-5.07-3.74H.96v2.34A8.997 8.997 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.93 10.68a5.41 5.41 0 0 1 0-3.46V4.88H.96a9.003 9.003 0 0 0 0 8.14l2.97-2.34z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.51.46 3.44 1.34l2.58-2.58C13.46.99 11.43 0 9 0A8.997 8.997 0 0 0 .96 4.88l2.97 2.34C4.64 5.07 6.64 3.58 9 3.58z"
                />
              </svg>
              {googleLoading ? "Abriendo Google…" : "Continuar con Google"}
            </button>

            {!showEmail ? (
              <button
                type="button"
                onClick={() => setShowEmail(true)}
                className="btn-ghost w-full text-sm"
              >
                O usar enlace por email
              </button>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3 pt-2 border-t border-line">
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
                <button className="btn-primary w-full" disabled={loading}>
                  {loading ? "Enviando…" : "Enviarme enlace"}
                </button>
              </form>
            )}

            {error && <p className="text-danger text-sm">{error}</p>}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-line/50 text-center">
          <Link href="/instalar" className="text-sm text-muted underline">
            📲 Instalar Chartly como app
          </Link>
        </div>
      </div>
    </main>
  );
}
