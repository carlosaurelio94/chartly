/* App nativa (Android / iOS) con Capacitor.

   La app nativa es una cáscara que abre la web publicada: no hay un segundo
   frontend que mantener. Lo que suma es el GPS en segundo plano, para que el
   recorrido arranque y siga midiendo con el teléfono en el bolsillo.

   La URL no está escrita acá: sale de CAP_SERVER_URL (en CI, de la variable
   del repositorio con el mismo nombre). */

import type { CapacitorConfig } from "@capacitor/cli";

const url = process.env.CAP_SERVER_URL?.trim();
if (!url && process.argv.some((a) => ["sync", "copy", "run", "open"].includes(a))) {
  throw new Error("Falta CAP_SERVER_URL: la URL de producción de Chartly (ej. https://tu-app.vercel.app).");
}

const config: CapacitorConfig = {
  appId: "app.chartly",
  appName: "Chartly",
  // Capacitor lo exige; con server.url la app abre la web publicada.
  webDir: "capacitor/www",
  server: url ? { url, cleartext: false } : undefined,
  android: {
    // Sin esto, Android corta las ubicaciones a los 5 minutos en segundo plano
    // (ver @capacitor-community/background-geolocation).
    useLegacyBridge: true,
  },
  backgroundColor: "#0b0d10",
};

export default config;
