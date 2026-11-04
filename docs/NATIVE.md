# App nativa (Android / iOS)

La app nativa es una cáscara de [Capacitor](https://capacitorjs.com) que abre
la web publicada. No hay un segundo frontend: cada deploy de la web se ve
también en la app. Lo que suma la app es el **GPS en segundo plano**
(`@capacitor-community/background-geolocation`):

- **El recorrido arranca solo** cuando el teléfono va a más de 10 km/h, aunque
  esté bloqueado o en el bolsillo (con «Empezar solo cuando me muevo» activado
  en Jornada).
- **Sigue midiendo en segundo plano** hasta que tocás *Terminar recorrido*.
- En Android, mientras espera o mide, se ve una notificación fija («Chartly
  espera que arranques» / «Chartly está midiendo tu recorrido»). Android la
  exige para usar el GPS en segundo plano.

Lo que no cambia: si cerrás Chartly deslizándola de las apps recientes,
Android mata el proceso y deja de medir.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `capacitor.config.ts` | `appId`, la URL que abre (`CAP_SERVER_URL`, nunca escrita en el código) y `android.useLegacyBridge` (sin eso Android corta las ubicaciones a los 5 min). |
| `src/components/gps/location.ts` | Única fuente de ubicaciones: el plugin nativo dentro de la app, `navigator.geolocation` en el navegador. |
| `src/components/gps/GpsProvider.tsx` | Espera movimiento y mide. En la app escucha también con la pantalla apagada. |
| `src/components/NativeShell.tsx` | Abre directo en Hoy y hace que el botón atrás de Android mande la app al fondo en vez de cerrarla. |
| `src/app/login/page.tsx`, `src/app/auth/callback/route.ts` | Dentro de la app se entra por mail: Google bloquea el login dentro de apps. El enlace abre el navegador, que ofrece «Abrir en la app». |
| `android/`, `ios/` | Proyectos nativos generados por Capacitor, con permisos, íconos y splash. |
| `.github/workflows/android.yml` | Compila el APK. En `main` lo publica como release de GitHub. |

## Configuración

No hace falta configurar nada para empezar:

- **URL que abre la app:** el workflow usa la variable `CAP_SERVER_URL` del
  repositorio o, si no está, el campo **Website** del repo (About → Website),
  que ya apunta a producción. Ninguna de las dos está en el código.
- **Login dentro de la app:** el enlace del mail abre el navegador; como la
  otra mitad del canje (PKCE) quedó en la app, `/auth/callback` muestra
  «Abrir en la app» y la app termina de entrar (`app.chartly://auth/callback`).
  Si además agregás `{{ .Token }}` a las plantillas de mail de Supabase
  (*Magic Link* y *Confirm signup*), también se puede escribir el código.

Opcional:

1. **Vercel → Environment Variables:** `NEXT_PUBLIC_ANDROID_APK_URL`
   = `https://github.com/<usuario>/<repo>/releases/latest/download/Chartly.apk`
   para que `/instalar` ofrezca la descarga.
2. **Llave de firma propia** (recomendado), para que las actualizaciones
   siempre se instalen encima:

   ```bash
   keytool -genkeypair -v -keystore chartly.jks -alias chartly \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 chartly.jks   # → secreto ANDROID_KEYSTORE_BASE64
   ```

   Secretos de Actions: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Guardá el `.jks` fuera del
   repo: si se pierde, la próxima versión no se instala encima de la anterior.
   Sin estos secretos el APK se firma con una llave de debug guardada en el
   caché de Actions (se pierde tras 7 días sin builds).

## Instalar en Android

En el teléfono: **GitHub → Releases → la última «Chartly para Android» →
Chartly.apk**. Android pide permitir «instalar apps de origen desconocido» para
el navegador. Al activar «Empezar solo cuando me muevo» pide la ubicación:
elegí **Permitir mientras se usa la app** y, si lo ofrece, permití las
notificaciones.

## iOS

`ios/` está listo (permisos de ubicación y modo de segundo plano en
`Info.plist`), pero compilar e instalar en un iPhone requiere una Mac con Xcode
y una cuenta de Apple Developer:

```bash
CAP_SERVER_URL=https://tu-app.vercel.app npx cap sync ios
npx cap open ios   # en Xcode: elegí tu equipo de firma y Run
```

## Desarrollo local

```bash
CAP_SERVER_URL=https://tu-app.vercel.app npx cap sync android
npx cap open android   # Android Studio
```

Para probar contra tu máquina, `CAP_SERVER_URL=http://<ip-local>:3000` y
poné `cleartext: true` en `capacitor.config.ts` (solo para desarrollo).
