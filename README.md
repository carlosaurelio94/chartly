# Chartly

PWA mobile-first de finanzas personales y agenda: cuentas por pagar con saldo
calculado, proyectos, métricas y **notificaciones push programadas al minuto**.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Supabase
(auth con magic link, PostgreSQL, RLS) · web-push · pg_cron + pg_net · Vercel

---

## Qué resuelve

Llevar cuentas por pagar y turnos en el teléfono, y que el recordatorio llegue
**a la hora exacta** aunque la app esté cerrada.

## La decisión técnica interesante

El plan Hobby de Vercel no permite cron con resolución de minutos: el mínimo es
diario. Programar los recordatorios desde el frontend tampoco sirve, porque
dependen de que la app esté abierta.

La solución fue **mover el scheduler adentro de la base de datos**:

```
pg_cron (cada minuto)
   └─ trigger_push_cron()
        └─ pg_net → POST /api/push/cron   (con header x-cron-secret)
             └─ route handler con service role → web-push → marca notified_at
```

`pg_cron` dispara cada minuto dentro de Postgres, `pg_net` hace el POST saliente
al route handler, y el handler usa la service role key para saltear RLS, buscar
los items que vencen, mandarlos por `web-push` y marcarlos como notificados.

**Trade-offs:** suma dos extensiones de Postgres y un secreto compartido que hay
que rotar, a cambio de resolución de un minuto sin pagar un plan superior ni
sostener un worker aparte.

## Modelo de datos

Todas las tablas con RLS por `user_id`: `bills`, `payments`, `projects`,
`agenda_items`, `push_subscriptions`. La vista `bills_with_balance` calcula
`balance = amount - sum(payments)` para no recomputarlo en el cliente.

## Correr en local

```bash
npm install
cp .env.example .env.local   # completar con las claves propias
npm run dev
```

Variables necesarias: URL y anon key de Supabase, `SUPABASE_SERVICE_ROLE_KEY`
(solo servidor), las claves VAPID de web-push y `CRON_SECRET`.

> El nombre del repo es de una idea anterior que quedó; el proyecto es el
> descrito arriba.
