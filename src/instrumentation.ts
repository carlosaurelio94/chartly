/* Errores del servidor (páginas, rutas, server actions) a los logs de Vercel
   en una línea JSON, con la ruta, para poder buscarlos. */

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "server",
      message: e.message?.slice(0, 500),
      digest: e.digest,
      path: request.path,
      method: request.method,
      route: context.routePath,
      kind: context.routeType,
      stack: e.stack?.slice(0, 1_500),
    }),
  );
};
