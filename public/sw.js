/* Chartly service worker

   Sin señal (un repartidor en la calle), la app tiene que abrir igual:
   - Páginas de la app: red primero; cada respuesta buena se guarda, y sin red
     se muestra la última versión guardada de esa misma página.
   - JS/CSS de Next (/_next/static, con hash en el nombre): caché primero.
   Lo que se anota sin señal lo maneja la cola de la app (offline-queue). */
const VERSION = "v3";
const PAGES = `chartly-pages-${VERSION}`;
const STATIC = `chartly-static-${VERSION}`;
const PRECACHE = ["/manifest.webmanifest"];
// Nunca se guardan: login, callbacks y la API.
const NO_CACHE = [/^\/login/, /^\/auth\//, /^\/api\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  // Al cerrar sesión: que no queden páginas con datos de la cuenta en el teléfono.
  if (event.data === "chartly:clear-cache") {
    event.waitUntil(caches.delete(PAGES));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // Una redirección (p. ej. al login) no se guarda como si fuera la página pedida.
    if (res.ok && res.type === "basic" && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const hit =
      (await cache.match(request, { ignoreVary: true })) ||
      (request.mode === "navigate" ? (await cache.match("/jornada")) || (await cache.match("/hoy")) : undefined);
    if (hit) return hit;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font-family:system-ui;background:#0b0d12;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px">' +
        "<div><p style=\"font-size:40px;margin:0\">📶</p><h1 style=\"font-size:18px\">Sin conexión</h1>" +
        '<p style="color:#9ca3af">Abrí Chartly una vez con señal y después vas a poder usarla sin conexión.</p></div>',
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NO_CACHE.some((r) => r.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Navegaciones y pedidos RSC de la navegación del lado del cliente.
  if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Recordatorio", body: event.data?.text() ?? "" }; }
  const title = data.title || "Recordatorio";
  const options = {
    body: data.body || "",
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    data: { url: data.url || "/agenda" },
    tag: data.tag || "agenda",
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/agenda";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && "focus" in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
