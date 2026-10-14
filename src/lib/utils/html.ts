const ENTIDADES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa texto plano para insertarlo dentro de HTML. */
export function escapeHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter] ?? caracter);
}

/** Escapa texto que va dentro de un atributo HTML entrecomillado. */
export function escapeAttr(texto: string): string {
  return escapeHtml(texto);
}

/**
 * Sanitizacion basica del HTML que el equipo escribe en las plantillas.
 * No es un sanitizador completo: solo saca lo que nunca deberia viajar
 * en un mail (scripts, iframes, handlers inline, urls javascript:).
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

/** Convierte texto plano en HTML conservando los saltos de linea como parrafos. */
export function textoAParrafos(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean)
    .map((parrafo) => `<p>${escapeHtml(parrafo).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Solo deja pasar URLs http(s); cualquier otra cosa devuelve null. */
export function urlSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpia = valor.trim();
  if (!/^https?:\/\//i.test(limpia)) return null;
  return limpia;
}
