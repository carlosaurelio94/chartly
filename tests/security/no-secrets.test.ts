/* Ningún dato sensible escrito en el código: claves, tokens y mails personales
   van en variables de entorno (.env.local en local, Vercel en producción).
   Este test recorre los archivos versionados y falla si aparece alguno. */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS: [string, RegExp][] = [
  ["JWT (anon/service_role de Supabase)", /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["clave nueva de Supabase", /sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/],
  ["clave de Anthropic", /sk-ant-[A-Za-z0-9_-]{10,}/],
  ["clave de Google/Gemini", /AIza[0-9A-Za-z_-]{30,}/],
  ["clave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["URL de un proyecto de Supabase", /https:\/\/[a-z0-9]{20}\.supabase\.co/],
  ["mail personal", /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud)\.com/i],
];

// Archivos donde un ejemplo ficticio es legítimo.
const ALLOW = new Set(["tests/security/no-secrets.test.ts"]);

function trackedFiles(): string[] {
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !ALLOW.has(f))
    .filter((f) => !/\.(png|jpg|jpeg|gif|ico|pdf|woff2?)$/i.test(f))
    .filter((f) => f !== "package-lock.json");
}

describe("sin datos sensibles en el código", () => {
  it("ningún archivo versionado tiene claves, tokens ni mails personales", () => {
    const hits: string[] = [];
    for (const file of trackedFiles()) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const [what, re] of PATTERNS) {
        const m = text.match(re);
        if (m) hits.push(`${file}: ${what} (${m[0].slice(0, 12)}…)`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("no se versiona ningún .env con valores reales", () => {
    const envs = trackedFiles().filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
    expect(envs).toEqual([]);
  });

  it(".env.example no trae valores de claves", () => {
    const lines = readFileSync(".env.example", "utf8").split("\n");
    const secretKeys = ["SUPABASE_SERVICE_ROLE_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    for (const key of secretKeys) {
      const line = lines.find((l) => l.startsWith(`${key}=`));
      expect(line, key).toBe(`${key}=`);
    }
  });
});
