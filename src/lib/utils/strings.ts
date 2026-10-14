const ALFABETO_PASSWORD = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SIMBOLOS_PASSWORD = "!@#$%*?";

/**
 * Genera una password aleatoria legible (sin caracteres ambiguos como l/1/O/0).
 * Usa crypto, disponible tanto en el navegador como en Node moderno.
 */
export function generarPassword(largo = 12): string {
  const alfabeto = ALFABETO_PASSWORD + SIMBOLOS_PASSWORD;
  const bytes = new Uint32Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join("");
}

/** Normaliza un texto a slug: minusculas, sin acentos, separado por guiones. */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normaliza un encabezado de planilla para poder compararlo con el mapeo. */
export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Deja un email en minusculas y sin espacios; null si no parece un email. */
export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return null;
  return limpio;
}

/** Sugiere un nombre de usuario a partir del email. */
export function usuarioDesdeEmail(email: string): string {
  return slugify(email.split("@")[0] ?? "");
}
