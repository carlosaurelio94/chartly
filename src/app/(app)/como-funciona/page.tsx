import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "carlosarc10@gmail.com";

export default async function ComoFuncionaPage() {
  const supabase = await createClient();
  const user = await getUser();
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
          <li><code>bills</code>: id, user_id, name, amount, due_date, currency, kind (expense/income), category_id, archived, notes, <strong><code>tipo</code></strong> (puntual | recurrente | acumulador), <strong><code>priority_next_week</code></strong> (★ para «Próxima semana»), <strong><code>monthly_amount</code></strong> (monto que se suma cada mes), <strong><code>last_rollover_month</code></strong> (primer día del mes en que se procesó por última vez), last_warned_at, created_at.</li>
          <li><code>payments</code>: id, user_id, bill_id, amount, paid_at, payment_method_id, note, <strong><code>converted_amount</code></strong>, <strong><code>converted_currency</code></strong> (override editable de la conversión a la moneda default), <strong><code>is_debt</code></strong> (default <code>false</code>; aplica solo a entradas de acumuladores: si está en <code>true</code>, ese gasto suma a la deuda total).</li>
          <li><code>bills_with_balance</code>: <strong>view</strong> con <code>security_invoker = on</code>. Une <code>bills</code> con la suma de pagos y expone <code>paid_total</code>, <code>balance</code> (saldo a pagar de cuentas fijas) y <strong><code>debt_amount</code></strong>: para no-open es <code>balance</code>; para acumuladores es la suma de payments con <code>is_debt = true</code>. <code>priority_next_week</code> también se proyecta acá.</li>
          <li><code>bill_categories</code>: id, user_id, name, color, <code>parent_id</code> (auto-FK para superbloques).</li>
          <li><code>payment_methods</code>: id, user_id, name, is_preset, <strong><code>balance</code></strong>, <strong><code>balance_currency</code></strong>, <strong><code>display_order</code></strong>, <strong><code>hidden</code></strong>, <strong><code>balance_updated_at</code></strong>. Las primeras tres columnas nuevas le dan a cada billetera (Lemon, Astro, BBVA, Efectivo…) un saldo editable que alimenta el panel «En el bolsillo» de Cuentas.</li>
          <li><code>projects</code>: id, user_id, name, description, status (active/idea/paused/done), priority (1-5), due_date.</li>
          <li><code>project_tasks</code>: id, user_id, project_id, text, done, due_date, position.</li>
          <li><code>agenda_items</code>: id, user_id, title, notes, starts_at, ends_at, all_day, category, done, notify_minutes_before, notified_at.</li>
          <li><code>user_settings</code>: user_id, default_currency, display_name, theme, routine_blocks (jsonb).</li>
          <li><code>push_subscriptions</code>: user_id, endpoint, p256dh, auth, user_agent. UNIQUE en <code>endpoint</code>.</li>
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
          <li>El route handler usa <code>SUPABASE_SERVICE_ROLE_KEY</code> (bypass RLS) para buscar agenda items que vencen pronto + cuentas que vencen en ≤3 días con saldo &gt; 0 (con anti-spam vía <code>last_warned_at</code>), los manda con <code>web-push</code> a las subscripciones, y marca <code>notified_at</code>.</li>
        </ol>
        <p className="font-medium mt-3">Auto-resync silencioso (recuperación)</p>
        <p>
          <code>NotificationsBootstrap</code> exporta <code>ensureSubscribedSilently()</code> que corre en cada carga de la app:
          si el browser ya tiene permiso, vuelve a leer/crear la suscripción y la upsertea en <code>push_subscriptions</code>.
          Esto cubre el caso clásico donde el endpoint quedó solo en el browser pero nunca llegó al servidor (o se borró por respuesta 410).
        </p>
        <p className="font-medium mt-3">Endpoint de prueba <code>/api/push/test</code></p>
        <p>
          Recibe la cookie del usuario logueado, busca sus <code>push_subscriptions</code>, manda una notificación
          <code>{` "Notificación de prueba" `}</code> con <code>web-push</code> y devuelve <code>{`{ ok, hasSubscriptions, sent, failed }`}</code>.
          Limpia automáticamente subscripciones inválidas (404/410).
        </p>
        <p className="font-medium mt-3">UI en Ajustes</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Muestra estado del permiso del browser <strong>y</strong> si el endpoint actual está registrado en el servidor (consulta <code>push_subscriptions</code>).</li>
          <li>Botón <strong>Enviar prueba</strong>: POST a <code>/api/push/test</code>, muestra inline el resultado.</li>
          <li>Botón <strong>Re-sincronizar dispositivo</strong>: <code>resyncPushSubscription()</code> hace <code>unsubscribe()</code> de la actual y crea una nueva, después la upsertea. Útil si el endpoint del browser quedó desincronizado.</li>
          <li>Si el permiso está <em>denegado</em>, muestra instrucciones explícitas: <code>requestPermission()</code> es no-op una vez negado, hay que resetearlo desde el candado/ícono de la URL o desde Settings → Apps → Chrome → Notificaciones.</li>
        </ul>
        <p className="font-medium mt-3">Service worker</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cache <code>chartly-v2</code> (bumpear cuando cambies el SW).</li>
          <li>Push handler: <code>showNotification</code> con <code>vibrate: [200, 100, 200]</code>, <code>renotify: true</code>, tag por bill/agenda para colapsar duplicados.</li>
        </ul>
        <p className="text-muted text-xs">
          Hobby de Vercel no permite cron a 1 minuto, por eso vive en pg_cron dentro de Supabase. Si algo no manda, revisar <code>cron.job_run_details</code> y <code>net._http_response</code> en SQL, y la fila correspondiente en <code>push_subscriptions</code>.
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

      <Section title="Cuentas: prioridades, archivado, lista compacta">
        <p className="font-medium">Prioridad para la próxima semana</p>
        <p>
          Cada bill tiene <code>priority_next_week boolean</code>. En cada fila de <code>/cuentas</code> hay una ★ que togglea ese flag
          (<code>supabase.from(&quot;bills&quot;).update({`{ priority_next_week: !current }`})</code>).
          En <code>/metricas</code>, la sección <strong>«Próxima semana»</strong> suma la deuda de los bills marcados (<code>debt_amount</code> &gt; 0)
          y muestra el ítem por ítem con conversión a la moneda default.
        </p>
        <p className="font-medium mt-3">Archivado</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>El page de <code>/cuentas</code> hace dos queries en paralelo: una con <code>archived = false</code> (lista principal) y otra con <code>archived = true</code> (modal de archivadas).</li>
          <li>El modal permite <strong>desarchivar</strong> (<code>update archived = false</code>) o <strong>eliminar permanentemente</strong> (cascade borra payments).</li>
          <li>Las métricas filtran archivadas en dos lugares: la query de <code>bills_with_balance</code> (<code>.eq(&quot;archived&quot;, false)</code>) y, lo más importante, en <strong>cada loop de payments</strong> dentro de <code>MetricasView</code> (<code>if (!p.bills || p.bills.archived) continue;</code>) — porque los pagos de bills archivadas seguirían apareciendo si no se filtran explícitamente.</li>
        </ul>
        <p className="font-medium mt-3">Vista compacta (Lista)</p>
        <p>
          <code>BillRow</code> acepta <code>compact?: boolean</code>. En modo Lista se renderiza en una sola línea: dot + nombre + monto + ★, click navega a detalle.
          En modo «Por categoría» se mantiene la versión completa con due_date, categoría, conversión y monto original.
        </p>
      </Section>

      <Section title="Acumuladores y la flag is_debt">
        <p>
          Los acumuladores (<code>bills.tipo = &apos;acumulador&apos;</code>) registran muchas entradas pequeñas en <code>payments</code>. Hasta acá nada nuevo,
          pero ahora cada entrada tiene <code>is_debt boolean default false</code>:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Default «Ya pagado» (is_debt = false)</strong>: queda registrado como gasto histórico, suma a totales mensuales y a categorías, pero <strong>no</strong> suma a la deuda total.</li>
          <li><strong>«Es deuda» (is_debt = true)</strong>: además suma a <code>debt_amount</code> del acumulador, que es lo que aparece en «Próxima semana» si el bill está marcado con ★.</li>
        </ul>
        <p>
          La pregunta aparece como dos chips en <code>PayModal</code> solo cuando <code>bill.tipo === &apos;acumulador&apos;</code>. La view <code>bills_with_balance</code> calcula
          <code>debt_amount</code> con: para no-open <code>= balance</code>; para open <code>= sum(amount where is_debt = true)</code>.
        </p>
      </Section>

      <Section title="Conversión editable en pagos">
        <p>
          Cuando registrás un pago en una moneda distinta a la default (ej. USD 20 mientras tu default es ARS), <code>PayModal</code>
          muestra un <strong>segundo campo «Equivalente (ARS)»</strong> que se auto-completa con la cotización actual (<code>convert(amount, from, to, rates)</code>),
          pero es <strong>editable</strong>. Si lo tocás, se guarda como override.
        </p>
        <p>
          Se persiste en <code>payments.converted_amount</code> + <code>payments.converted_currency</code>. Las métricas usan
          <code>convertPayment(p, defaultCurrency, rates)</code>: si hay override, lo usa (re-convirtiendo si la default cambió);
          si no, hace la conversión normal con la cotización del día.
        </p>
        <p className="text-muted text-xs">
          Esto evita que el «valor histórico real» del gasto se distorsione por el dólar de hoy. Para ARS es crítico.
        </p>
      </Section>

      <Section title="Modo oscuro (estilos por tema)">
        <p>
          Tokens en <code>globals.css</code>: <code>:root</code> y <code>[data-theme=&quot;dark&quot;]</code> tienen los mismos valores (oscuro = default);
          <code>[data-theme=&quot;light&quot;]</code> sobreescribe. <code>saveTheme</code> en Ajustes setea <code>document.documentElement.dataset.theme</code> y persiste en <code>user_settings.theme</code>.
        </p>
        <p>Reglas específicas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>.bill-name</code> → blanco puro (<code>#ffffff</code>) en dark, default <code>--color-fg</code> en light.</li>
          <li><code>.bill-dot</code> → <code>display: inline-block</code> en dark, <code>display: none</code> en light. Color <code>bg-danger</code> para gastos, <code>bg-ok</code> para ingresos.</li>
        </ul>
      </Section>

      <Section title="Métricas — racha y agregaciones">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Racha de trabajo</strong>: <code>THRESHOLD = 540</code> minutos (9h). Se cuenta hacia atrás desde hoy mientras los días tengan ≥ 9h en la categoría <code>work</code> de la agenda.</li>
          <li><strong>Ritmo</strong>: gasto del mes actual vs promedio de los 3 anteriores; proyecta a fin de mes.</li>
          <li><strong>Top que más subió</strong>: top 3 superbloques (categoría top-level) que crecieron en gasto vs el mes anterior.</li>
          <li><strong>Próxima semana</strong>: lista bills con ★ (<code>priority_next_week = true</code>) y <code>debt_amount &gt; 0</code>; suma todo en moneda default.</li>
          <li><strong>Tiempo</strong>: agrupa <code>agenda_items</code> con hora de inicio/fin por categoría (work/rest/fun/idle/other) en el período seleccionado.</li>
        </ul>
      </Section>

      <Section title="Jornada (delivery / transporte)">
        <p>
          Sección opt-in para personas que trabajan en Uber/Rappi/Didi/PedidosYa/Cabify. Se activa con un toggle en
          <code> Ajustes → Jornada laboral</code> (columna <code>user_settings.gig_worker_enabled</code>). Cuando está
          en <code>true</code>, el <code>BottomNav</code> muestra el ítem <strong>🛵 Jornada</strong> y el layout pasa
          <code>showJornada=true</code> al componente.
        </p>
        <p><strong>Tablas:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>gig_shifts</code>: una fila por <code>(user_id, shift_date)</code> (UNIQUE). Campos: <code>goal_amount</code> y <code>goal_hours</code> (override del día; <code>null</code> = usar default), <code>hours_worked</code>, <code>km_driven</code>, <code>notes</code>, <code>closed_at</code> (null = en curso). Trigger <code>set_updated_at()</code>.</li>
          <li><code>gig_entries</code>: registros individuales. <code>kind ∈ {`{`}earnings, tip_app, tip_cash, cash_trip, fuel, expense{`}`}</code>. <code>fuel</code> incluye campos <code>liters</code> y <code>odometer_km</code> (opcional) para calcular rendimiento. <code>platform</code>, <code>amount</code>, <code>currency</code>, <code>shift_date</code> denormalizado, FK a <code>gig_shifts</code> con <code>ON DELETE CASCADE</code>.</li>
          <li><code>gig_shifts_with_totals</code>: <strong>view</strong> con <code>security_invoker = on</code> que agrega totales por kind, <code>km_driven</code>, <code>total_fuel</code>, <code>total_liters</code> y <code>net_total = ingresos - (gastos + fuel)</code>.</li>
          <li>Settings asociados (en <code>user_settings</code>): <code>gig_default_goal</code>, <code>gig_default_hours</code>, <code>gig_default_currency</code>, <code>gig_platforms</code> (jsonb array), <code>gig_dead_days</code> (jsonb 0–6), <code>gig_weekly_goal</code>, <code>gig_km_per_liter_estimate</code>.</li>
        </ul>
        <p><strong>UI:</strong> 3 tabs.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Hoy</strong>: barras de progreso meta vs hecho, horas vs objetivo, contador de km del día con +5/+10/+25/+50 y modo edición directa. KPIs: bruto, gastos, neto, $/h, $/km, km/L, nafta hoy, litros. Modal «Agregar registro» con tipos earnings/tip_app/tip_cash/cash_trip/fuel/expense; cuando es fuel pide litros + odómetro y muestra <em>$/L</em> calculado en vivo. <code>ensureShift()</code> crea la fila al primer registro.</li>
          <li><strong>Histórico</strong>: agregados últimos 30 días con tendencia vs 30 anteriores, sparkline 14 días, <strong>tarjeta vehículo</strong> (km, nafta total, $/km neto, km/L), split por plataforma, promedio por día de semana (60d), mejor/peor día.</li>
          <li><strong>Calculadora</strong>: input meta semanal + selector de días flojos. Cada día flojo pesa 0.5, el resto 1, así <code>per_strong = goal / (n_strong + 0.5*n_weak)</code>. Calcula horas necesarias usando <code>$/h</code> de los últimos 30 días reales.</li>
        </ul>

        <p><strong>Web Share Target / shortcut:</strong> el manifest declara <code>share_target</code> con method GET y action <code>/jornada</code>. Cuando el usuario comparte algo desde otra app (por ej. comprobante de Uber), Android lleva los params <code>title/text/url</code> a <code>/jornada</code>; <code>JornadaView</code> los detecta en un <code>useEffect</code>, intenta deducir la plataforma con un regex sobre el contenido, y abre <code>AddEntryModal</code> pre-poblado con <code>platform</code> y <code>note</code>. Después limpia la URL con <code>history.replaceState</code> para que un refresh no re-abra el modal. <strong>Limitación:</strong> ninguna app de delivery/transporte expone API pública para conductores individuales — el monto sigue requiriendo input manual; sólo se ahorran toques. Hay un <code>shortcut</code> también para acceso de un toque desde el ícono instalado.</p>
      </Section>

      <Section title="WalletCard: «En el bolsillo» y disponibilidad real">
        <p>
          Arriba de Cuentas hay un <code>WalletCard</code> que responde a la pregunta práctica «¿cuánta plata tengo ahora mismo?»
          sumando los <code>balance</code> de todos los <code>payment_methods</code> visibles, convertidos a la moneda default
          con <code>convert()</code>. Si alguna billetera no tiene tasa, lo avisa con un contador («N cuentas sin tasa de cambio»).
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cada billetera es un botón táctil; al tocarla abre un mini-modal con un solo input grande («¿Cuánto tenés en {`{name}`}?») que setea <code>balance</code> y <code>balance_updated_at = now()</code>.</li>
          <li>Hay un ⚙ que abre <code>ManageWalletsModal</code> para mostrar/ocultar billeteras (<code>hidden</code>) y cambiar la moneda (<code>balance_currency</code>) sin entrar a Ajustes.</li>
          <li>Debajo del total se renderizan dos KPIs: <strong>«Por pagar esta semana»</strong> (suma de bills no archivadas con <code>balance &gt; 0</code> y <code>due_date</code> en ≤7 días o <code>priority_next_week = true</code>) y <strong>«Disponible»</strong> = bolsillo − por pagar. Si da negativo se pinta en rojo: la app dice «no te alcanza con lo que tenés a mano».</li>
          <li>Los colores del puntito de cada billetera salen de un <code>PRESET_COLORS</code> map por nombre (Lemon, Astro, BBVA, Mercado Pago, Buenbit, Efectivo…) y caen en un hash determinístico (<code>hsl(hash%360, 65%, 65%)</code>) si el nombre no está mapeado.</li>
        </ul>
        <p className="font-medium mt-3">Vista «Por urgencia»</p>
        <p>
          La lista de Cuentas pasó de plana a agrupada por urgencia: <code>bucketFor()</code> mapea cada bill a uno de
          <code>overdue / this-week / this-month / later / no-date / open</code> usando <code>daysUntil(due_date)</code>.
          Cada bucket muestra emoji, label, total propio y los bills ordenados con <code>priority_next_week</code> primero, luego por fecha.
          El bucket «Vencidas» tiene <code>id=&quot;vencidas&quot;</code> y el header tiene un anchor <code>#vencidas</code> para saltar directo cuando hay overdue count.
        </p>
      </Section>

      <Section title="Tipo de cuenta: una sola dimensión">
        <p>
          Antes una cuenta podía ser 7 cosas a la vez según flags que se pisaban
          (<code>is_open</code>, <code>monthly_rollover</code>, <code>recurrence</code>…). De ahí salieron
          varios bugs: ingresos de Jornada atrapados como acumulador, meses viejos de nafta
          apilándose en «Esta semana», acumuladores que nunca reiniciaban.
        </p>
        <p>
          Hoy hay <strong>una sola columna</strong>: <code>bills.tipo</code>, con constraint
          <code>CHECK (tipo IN (&apos;puntual&apos;,&apos;recurrente&apos;,&apos;acumulador&apos;))</code>.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>puntual</strong>: se paga una vez. Tiene saldo (<code>amount − pagos</code>).</li>
          <li><strong>recurrente</strong>: la <strong>misma fila</strong> vive todos los meses; cada mes se le suma <code>monthly_amount</code> al <code>amount</code>. Para servicios fijos (renta, internet, gym).</li>
          <li><strong>acumulador</strong>: se le van sumando gastos chicos. Cierra por mes contra <code>accumulator_month</code>, y lo del mes cerrado queda congelado en <code>bill_cycles</code>.</li>
        </ol>
        <p className="text-muted text-xs mt-2">
          Dimensiones aparte, legítimamente independientes: <code>kind</code> (gasto/ingreso),
          <code>priority_next_week</code> (★) e <code>is_fuel_accumulator</code> (de dónde se alimenta:
          Jornada lo sincroniza solo). Las columnas <code>is_open</code>, <code>monthly_rollover</code>,
          <code>recurrence</code> y <code>recurrence_parent_id</code> fueron <strong>eliminadas</strong>.
          La recurrencia clásica (clonar la fila al pagar) nunca llegó a ejecutarse en producción.
        </p>

        <p className="font-medium mt-3">Cómo funciona el rollover de los recurrentes</p>
        <p>
          Función Postgres <code>run_monthly_rollover()</code> (<code>SECURITY INVOKER</code>, <code>GRANT EXECUTE TO authenticated</code>):
          recorre los bills del usuario actual con <code>tipo = &apos;recurrente&apos;</code>, <code>archived = false</code> y
          <code>last_rollover_month &lt; primer_día_mes_actual</code>, calcula cuántos meses faltan y por cada bill ejecuta:
        </p>
        <pre className="card text-xs overflow-x-auto whitespace-pre">{`UPDATE bills
SET amount = amount + (monthly_amount * applied_periods),
    due_date = due_date + applied_periods months,
    last_rollover_month = last_rollover_month + applied_periods months,
    updated_at = now()
WHERE id = b.id;`}</pre>
        <p>
          Como <code>bills_with_balance.balance = GREATEST(amount - paid_total, 0)</code>, el efecto neto sin tocar pagos es:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Si el mes anterior estaba en <strong>cero</strong> (paid_total ≥ amount): el balance pasa a <code>monthly_amount</code> → vuelve a deber el monto del mes nuevo.</li>
          <li>Si el mes anterior tenía <strong>deuda X</strong>: balance pasa a <code>X + monthly_amount</code> → la deuda vieja se acumula con la nueva.</li>
        </ul>
        <p className="font-medium mt-3">Cuándo se dispara</p>
        <p>
          <code>cuentas/page.tsx</code> hace <code>await supabase.rpc(&quot;run_monthly_rollover&quot;)</code> antes del <code>Promise.all</code> de SELECTs.
          Es <strong>idempotente</strong>: si ya corrió este mes (<code>last_rollover_month = primer_día_mes_actual</code>), no toca nada.
          Si el usuario abrió la app después de varios meses, suma todos los meses faltantes en una sola pasada.
          No hace falta pg_cron para esto: la próxima vez que el usuario abra Cuentas, todo se pone al día.
        </p>
        <p className="font-medium mt-3">UI</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>En <code>NewBillButton</code>: chips «Monto fijo / 🧺 Acumulador» + checkbox «🔁 Es el mismo gasto cada mes». De ahí sale el <code>tipo</code>. Ya no existe el select de recurrencia clásica que competía con esto.</li>
          <li>Al guardar como recurrente: <code>tipo = &apos;recurrente&apos;</code>, <code>monthly_amount = amount</code>, <code>last_rollover_month = primer_día_mes_actual</code>.</li>
          <li>En <code>BillRow</code> (compact y full) se muestra un emoji 🔁 al lado del nombre. En el full, debajo del monto se imprime «🔁 {`{monthly_amount}`}/mes» para que se vea el monto recurrente real (porque <code>amount</code> puede haber crecido por acumulación).</li>
          <li>En <code>BillActions → EditModal</code> hay un selector de <code>tipo</code> con las tres opciones + un input opcional «Monto mensual» (vacío = usar <code>amount</code> actual). Al salir de recurrente se limpian <code>monthly_amount</code> y <code>last_rollover_month</code>.</li>
          <li>En el header del detalle aparece un chip <code>🔁 Mensual</code> y una línea «Se suma X cada mes automáticamente».</li>
        </ul>
        <p className="text-muted text-xs">
          Trade-off conocido: <code>amount</code> sigue creciendo mes a mes (es la suma de todos los cargos hasta ahora).
          La UI lo absorbe mostrando <code>balance</code> como número grande y <code>monthly_amount</code> como referencia.
          La alternativa habría sido modelar «ciclos» (otra tabla), pero para personal-finance es overkill.
        </p>
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
