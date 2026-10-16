import "server-only";

/**
 * ¿Es el administrador? Sale de la variable de entorno ADMIN_EMAIL, nunca de
 * un mail escrito en el código. Sin la variable no hay admin: las páginas
 * internas (/como-funciona) quedan ocultas para todos.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  return !!admin && !!email && email.trim().toLowerCase() === admin;
}
