import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Icons } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Con sesión abierta la landing no aporta: vamos directo a la app.
  // Por eso de acá para abajo el visitante siempre es anónimo.
  if (user) redirect("/hoy");

  return (
    <main className="min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(700px 500px at 15% -10%, color-mix(in srgb, var(--color-accent) 30%, transparent) 0%, transparent 60%), radial-gradient(600px 500px at 95% 20%, rgba(139, 92, 246, 0.18) 0%, transparent 55%)",
            pointerEvents: "none",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-5 md:px-8 pt-6 pb-16 md:pt-8 md:pb-24">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-14 md:mb-24">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 55%, #fff))",
                  color: "var(--color-accent-on)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: -0.5,
                }}
              >
                C
              </span>
              <span className="text-xl font-extrabold tracking-tight">Chartly</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/instalar" className="chip hidden md:inline-flex">
                📲 Instalar
              </Link>
              <Link href="/login" className="btn-primary text-sm">
                Iniciar sesión
              </Link>
            </div>
          </nav>

          {/* Headline */}
          <div className="max-w-3xl">
            <span
              className="pill pill-accent inline-flex mb-5"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              Gratis · sin App Store · funciona en el celu
            </span>
            <h1
              className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Tu <span style={{ color: "var(--color-accent-on-tint)" }}>plata</span>,{" "}
              tu <span style={{ color: "var(--color-accent-on-tint)" }}>tiempo</span>{" "}
              y tus <span style={{ color: "var(--color-accent-on-tint)" }}>metas</span>
              <br />
              en una sola app.
            </h1>
            <p className="text-lg md:text-xl text-muted mt-5 max-w-2xl leading-relaxed">
              Chartly te ordena los gastos, ingresos, agenda y trabajos en un solo lugar,
              y si manejás con Uber/Rappi/Didi te calcula cuánto tenés que hacer cada día
              para llegar a tu meta.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary" style={{ padding: "14px 22px", fontSize: 15 }}>
                Empezar gratis con Google
              </Link>
              <Link href="/instalar" className="btn-ghost" style={{ padding: "14px 22px", fontSize: 15 }}>
                📲 Instalar como app
              </Link>
            </div>
            <p className="text-xs text-muted mt-3">Sin tarjeta, sin instalar nada del store.</p>
          </div>

          {/* Preview */}
          <div className="mt-14 md:mt-20 grid md:grid-cols-2 gap-5 md:gap-8 items-stretch">
            {/* Mock hero card */}
            <div
              className="card"
              style={{
                background:
                  "linear-gradient(160deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 75%, #000) 100%)",
                color: "var(--color-accent-on)",
                border: "none",
                padding: 26,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  right: -40,
                  top: -60,
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)",
                  filter: "blur(40px)",
                }}
              />
              <p className="label" style={{ color: "inherit", opacity: 0.7 }}>
                En tu bolsillo
              </p>
              <p
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ fontSize: 24, opacity: 0.55, marginRight: 4 }}>$</span>
                569.700
              </p>
              <p className="text-sm mt-2" style={{ opacity: 0.75 }}>
                en 4 cuentas · ARS
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                {[
                  { name: "Mercado Pago", val: "$142.500" },
                  { name: "Lemon", val: "$89.200" },
                  { name: "BBVA", val: "$312.600" },
                  { name: "Efectivo", val: "$25.400" },
                ].map((w) => (
                  <div
                    key={w.name}
                    style={{
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 16,
                      padding: "10px 12px",
                    }}
                  >
                    <p style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{w.name}</p>
                    <p
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        marginTop: 4,
                      }}
                    >
                      {w.val}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI mocks */}
            <div className="space-y-3">
              <div className="card-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--color-danger) 18%, transparent)",
                      color: "var(--color-danger)",
                    }}
                  >
                    <Icons.arrowUp size={14} />
                  </span>
                  <p className="label">Esta semana</p>
                </div>
                <p
                  className="mt-2 tabular"
                  style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--color-danger)" }}
                >
                  $293.400
                </p>
                <p className="text-xs text-muted font-medium">por pagar · 5 cuentas</p>
              </div>

              <div className="card-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--color-ok) 18%, transparent)",
                      color: "var(--color-ok)",
                    }}
                  >
                    <Icons.arrowDown size={14} />
                  </span>
                  <p className="label">Meta de hoy · Jornada</p>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <p className="tabular" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>
                    71%
                  </p>
                  <p className="text-sm text-muted">$17.850 / $25.000</p>
                </div>
                <div className="h-1.5 bg-line rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-accent" style={{ width: "71%" }} />
                </div>
              </div>

              <div className="card-sm flex items-center gap-3">
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "var(--color-accent)",
                    color: "var(--color-accent-on)",
                  }}
                >
                  <Icons.flame size={22} />
                </span>
                <div>
                  <p className="text-sm font-bold">Racha 12 días</p>
                  <p className="text-xs text-muted">Trabajaste + de 9h todos los días.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-16">
        <p className="label mb-3">Qué podés hacer</p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-10" style={{ letterSpacing: "-0.02em" }}>
          Una app, todo lo que hacés en el día.
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          <Feature
            icon={<Icons.wallet size={20} />}
            title="Cuentas"
            desc="Cargá gastos, ingresos, categorías y billeteras. Ves qué te vence esta semana, cuánto te queda disponible y cuánto gastás por rubro."
          />
          <Feature
            icon={<Icons.shift size={20} />}
            title="Jornada"
            desc="Para delivery/conductores. Registrá lo que hacés por app + propinas + nafta y calculá $/h real. Si trabajás en Uber, Rappi, Didi, Cabify, PedidosYa, esto es para vos."
          />
          <Feature
            icon={<Icons.chart size={20} />}
            title="Métricas"
            desc="Todo lo que cargás se convierte en gráficos: dónde se te va la plata, qué subió, dónde ganás más por hora. Sin abrir Excel."
          />
          <Feature
            icon={<Icons.agenda size={20} />}
            title="Agenda"
            desc="Bloques por categoría (trabajo, descanso, diversión, ocio). Rutinas repetibles y notificaciones push que respetan tu horario."
          />
          <Feature
            icon={<Icons.trabajos size={20} />}
            title="Trabajos compartidos"
            desc="Tableros al estilo Trello para proyectos con otras personas. Invitás por email, la persona recibe la invitación y colabora."
          />
          <Feature
            icon={<Icons.bolt size={20} />}
            title="Calculadora semanal"
            desc="Le decís tu meta de la semana, marcás qué días son fuertes/medios/flojos/descanso y la calculadora reparte cuánto tenés que hacer cada día."
          />
        </div>
      </section>

      {/* WHY */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 pb-16">
        <div className="grid md:grid-cols-3 gap-4">
          <ValueCard title="Sin App Store" desc="Se instala como PWA en 5 segundos desde el navegador. Ocupa 0 MB." />
          <ValueCard title="Multi-moneda" desc="ARS, USD, USDT, EUR. Convierte solo con tasas actualizadas." />
          <ValueCard title="Notificaciones push" desc="Recordatorios de cuentas y agenda al horario que vos elijas." />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 pb-24">
        <div
          className="card-accent text-center"
          style={{ padding: "40px 24px" }}
        >
          <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3" style={{ letterSpacing: "-0.02em" }}>
            Ordená tu plata en 2 minutos.
          </h3>
          <p className="text-muted mb-6 max-w-lg mx-auto">
            Entrás con Google. Cargás tus billeteras y gastos recurrentes en un onboarding
            guiado. Empezás a ver todo en el mismo lugar.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/login" className="btn-primary" style={{ padding: "14px 22px", fontSize: 15 }}>
              Empezar gratis con Google
            </Link>
            <Link href="/instalar" className="btn-ghost" style={{ padding: "14px 22px", fontSize: 15 }}>
              Cómo instalarla
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-6xl mx-auto px-5 md:px-8 pb-10 text-sm text-muted flex flex-wrap items-center justify-between gap-3">
        <span>© Chartly · hecha con cariño desde Argentina.</span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hover:text-fg">Iniciar sesión</Link>
          <Link href="/instalar" className="hover:text-fg">Instalar</Link>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="card space-y-3" style={{ padding: 20 }}>
      <span
        className="flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "var(--color-accent-tint)",
          color: "var(--color-accent-on-tint)",
        }}
      >
        {icon}
      </span>
      <div>
        <p className="font-bold text-base">{title}</p>
        <p className="text-sm text-muted mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ValueCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card-sm">
      <p className="font-bold text-base">{title}</p>
      <p className="text-sm text-muted mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
