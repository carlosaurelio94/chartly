import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "carlosarc10@gmail.com";

export default async function ComoFuncionaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) notFound();

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold">Cómo funciona la app</h1>
        <p className="text-sm text-muted mt-1">
          Documentación técnica privada. Solo vos podés ver esta página.
        </p>
      </header>

      <Section title="Stack y arquitectura general">
        <p>
          Es una <strong>PWA</strong> hecha con <strong>Next.js 16 (App Router)</strong> + <strong>TypeScript</strong> + <strong>Tailwind CSS</strong>.
          El backend es <strong>Supabase</strong> (Postgres con RLS + Auth con magic links + Storage si hiciera falta).
          El deploy es en <strong>Vercel</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Server Components</strong> hacen los <code>SELECT</code> con el cliente server de Supabase y pasan datos planos a Client Components.</li>
          <li><strong>Client Components</strong> (<code>&quot;use client&quot;</code>) manejan estado, formularios y mutaciones (<code>insert/update/delete</code>) directamente contra Supabase usando el cliente del browser.</li>
          <li>Las <strong>políticas RLS</strong> en Postgres son la verdadera capa de seguridad: cada tabla tiene policies <code>auth.uid() = user_id</code> para SELECT/INSERT/UPDATE/DELETE.</li>
          <li>La sesión viaja en cookies (paquete <code>@supabase/ssr</code>) y se renueva en el middleware (<code>src/middleware.ts</code>).</li>
        </ul>
      </Section>

      <Section title="Estructura de carpetas (frontend)">
        <pre className="card text-xs overflow-x-auto whitespace-pre">
{`src/
├ app/
│  ├ (app)/                  → grupo con sesión obligatoria
│  │  ├ layout.tsx           → header + BottomNav + saludo
│  │  ├ cuentas/             → bills (gastos/ingresos)
│  │  ├ proyectos/           → projects + project_tasks
│  │  ├ agenda/              → agenda_items
│  │  ├ metricas/            → dashboard (no escribe nada)
│  │  ├ ajustes/             → user_settings, categorías, medios de pago
│  │  └ como-funciona/       → ESTA página (admin gate)
│  ├ login/                  → magic link
│  ├ auth/callback/          → intercambia code por session
│  └ api/push/cron/          → endpoint llamado por pg_cron
├ lib/
│  ├ supabase/server.ts      → cliente con cookies (RSC/route handlers)
│  ├ supabase/client.ts      → cliente del browser
│  ├ fx.ts                   → convert() pure + tipo Rates (client-safe)
│  ├ fx-server.ts            → getRates() con cache fx_rates (server-only)
│  └ format.ts               → fmtMoney, fmtDate, daysUntil
├ components/                → Modal, BottomNav, InstallButton, etc.
├ middleware.ts              → refresca sesión y redirige sin sesión
└ public/sw.js               → service worker (push notifications)`}
        </pre>
      </Section>

      <Section title="Esquema de base de datos">
        <p>Todas las tablas tienen <code>user_id uuid</code> + RLS. Tablas principales:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>bills</code>: id, user_id, name, amount, due_date, currency, kind (expense/income), category_id, archived, notes, created_at.</li>
          <li><code>payments</code>: id, user_id, bill_id, amount, paid_at, payment_method_id, note. Disparan trigger que recalcula <code>paid_total</code>.</li>
          <li><code>bills_with_balance</code>: <strong>view</strong>. Une <code>bills</code> con la suma de pagos y devuelve <code>balance = amount - paid_total</code>.</li>
          <li><code>bill_categories</code>: id, user_id, name, color, <code>parent_id</code> (auto-FK para superbloques).</li>
          <li><code>payment_methods</code>: id, user_id, name, is_preset.</li>
          <li><code>projects</code>: id, user_id, name, description, status, priority (1-5), due_date.</li>
          <li><code>project_tasks</code>: id, user_id, project_id, text, done, due_date, position.</li>
          <li><code>agenda_items</code>: id, user_id, title, notes, starts_at, ends_at, all_day, category, done, notify_minutes_before, notified_at.</li>
          <li><code>user_settings</code>: user_id, default_currency, display_name.</li>
          <li><code>push_subscriptions</code>: user_id, endpoint, p256dh, auth, user_agent.</li>
          <li><code>fx_rates</code>: code, rate_per_usd, fetched_at (cache de tasas).</li>
        </ul>
      </Section>

      <Section title="Conversión de moneda (FX)">
        <p>
          <code>lib/fx.ts</code> exporta el tipo <code>Rates</code> y la función pura <code>convert(amount, from, to, rates)</code>.
          La regla es <code>(amount / rates[from]) * rates[to]</code> — todas las tasas están en base USD.
        </p>
        <p>
          <code>lib/fx-server.ts</code> exporta <code>getRates()</code>, que se llama en cada page server-side. Lee el cache <code>fx_rates</code>;
          si tiene más de 6 horas, busca rates frescas en <code>open.er-api.com/v6/latest/USD</code> y hace upsert. Si falla la API, usa lo último que tenga.
        </p>
        <p className="text-muted text-xs">
          Si la API cae, las cuentas en moneda distinta a la default muestran el monto original sin conversión y aparece un aviso.
        </p>
      </Section>

      <Section title="Notificaciones push (lo más complejo)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>El usuario activa notificaciones desde Ajustes → <code>subscribeToPush()</code> en <code>NotificationsBootstrap.tsx</code>.</li>
          <li>El browser pide permiso, el service worker (<code>public/sw.js</code>) se subscribe con la VAPID public key, y el cliente hace <code>upsert</code> en <code>push_subscriptions</code> (con <code>user_id</code>, endpoint, p256dh, auth).</li>
          <li>En Postgres corre un cron <code>push-notifications-every-minute</code> (extensión <code>pg_cron</code>) que cada minuto invoca <code>trigger_push_cron()</code>.</li>
          <li>Esa función usa <code>pg_net</code> + secrets del Vault (<code>cron_push_url</code>, <code>cron_secret</code>) para hacer un POST autenticado a <code>/api/push/cron</code> con el header <code>x-cron-secret</code>.</li>
          <li>El route handler usa <code>SUPABASE_SERVICE_ROLE_KEY</code> (bypass RLS) para buscar agenda items que vencen pronto, los manda con <code>web-push</code> a las subscripciones, y marca <code>notified_at</code>.</li>
        </ol>
        <p className="text-muted text-xs">
          Hobby de Vercel no permite cron a 1 minuto, por eso vive en pg_cron dentro de Supabase. Si algo no manda, revisar <code>cron.job_run_details</code> y <code>net._http_response</code> en SQL.
        </p>
      </Section>

      <Section title="PWA / install">
        <ul className="list-disc pl-5 space-y-1">
          <li><code>public/manifest.webmanifest</code> + íconos definen la app instalable.</li>
          <li><code>public/sw.js</code> registra el service worker (push + cache mínimo).</li>
          <li><code>InstallButton.tsx</code> escucha <code>beforeinstallprompt</code> en Android/Chrome; en iOS muestra instrucciones (Compartir → Añadir a inicio).</li>
          <li>iOS solo permite push si la app está instalada como PWA. Web: directamente desde el browser.</li>
        </ul>
      </Section>

      <Section title="Variables de entorno">
        <p>En <code>.env.local</code> (dev) y en Vercel (producción) deben existir:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> → cliente público.</li>
          <li><code>SUPABASE_SERVICE_ROLE_KEY</code> → server-only, bypass RLS para el cron.</li>
          <li><code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code>, <code>VAPID_SUBJECT</code> → web-push.</li>
          <li><code>CRON_SECRET</code> → header secreto que valida el endpoint <code>/api/push/cron</code>.</li>
        </ul>
        <p className="text-muted text-xs">
          Si el cron empieza a fallar con &quot;Invalid API key&quot;, casi seguro es que <code>SUPABASE_SERVICE_ROLE_KEY</code> en Vercel quedó mal copiado.
        </p>
      </Section>

      <Section title="Deploy y dev workflow">
        <ul className="list-disc pl-5 space-y-1">
          <li><code>npm run dev</code> levanta local en <code>:3000</code>.</li>
          <li><code>npm run build</code> ejecuta el build de Turbopack y type-check.</li>
          <li><code>vercel deploy --prod --yes</code> desde la carpeta <code>chartly/</code> hace deploy de producción.</li>
          <li>El repo es <code>github.com/carlosaurelio94/chartly</code>; Vercel está conectado y también builda automático en cada push a <code>main</code>.</li>
          <li>URL prod: <code>desempleo-inky.vercel.app</code>.</li>
          <li>Migraciones de Postgres: aplicarlas con el MCP de Supabase o directamente en el SQL editor.</li>
        </ul>
      </Section>

      <Section title="Cómo agregar una feature nueva (receta)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Si necesita columna o tabla nueva, escribir migración SQL: agregar columna o tabla + policies RLS por <code>user_id</code>.</li>
          <li>Crear/actualizar el server component (<code>page.tsx</code>) para hacer el SELECT y pasar datos al client component.</li>
          <li>Crear/actualizar el client component con el formulario o UI.</li>
          <li>En el client, los mutations son <code>supabase.from(&quot;tabla&quot;).insert/update/delete(...)</code> + <code>router.refresh()</code> al final.</li>
          <li>Probar local con <code>npm run dev</code>, después <code>npm run build</code> antes de deployar.</li>
        </ol>
      </Section>

      <Section title="Gotchas conocidos">
        <ul className="list-disc pl-5 space-y-1">
          <li>No mezclar imports server/client en el mismo archivo: si un client component importa de un módulo que importa <code>next/headers</code>, Turbopack rompe. Por eso <code>fx.ts</code> y <code>fx-server.ts</code> están separados.</li>
          <li>Los <code>insert</code> del cliente en tablas con RLS necesitan setear <code>user_id</code> a mano (la policy compara <code>user_id = auth.uid()</code>).</li>
          <li>El service worker se registra desde <code>NotificationsBootstrap</code>; si lo cambias, el browser puede cachear la versión vieja — bumpeá el filename o limpiá el SW.</li>
          <li>Algunas DB constraints (ej. <code>agenda_items_category_check</code>) restringen valores; al sumar opciones nuevas hay que <code>drop constraint</code> + <code>add constraint</code> con el nuevo set.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-lg">{title}</h2>
      <div className="text-sm space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}
