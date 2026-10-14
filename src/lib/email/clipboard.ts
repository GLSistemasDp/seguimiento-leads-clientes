/**
 * Copiado del mail al portapapeles como contenido *renderizado*, no como
 * codigo fuente. Solo corre en el cliente.
 *
 * Estrategia, en orden:
 *  1. `navigator.clipboard.write` con un ClipboardItem que lleva text/html
 *     y text/plain: es lo que entienden Gmail, Outlook web y Apple Mail al
 *     pegar. Necesita HTTPS (o localhost) y permiso del navegador.
 *  2. Seleccionar el contenido renderizado y `document.execCommand("copy")`:
 *     deprecado pero sigue funcionando y no requiere permisos.
 *  3. text/plain solo, para que al menos algo quede en el portapapeles.
 */

export type ResultadoCopia = {
  ok: boolean;
  /** Que camino termino funcionando, util para el mensaje al usuario. */
  metodo: "clipboard-api" | "execCommand" | "texto-plano" | "ninguno";
  error?: string;
};

/** Convierte el HTML del mail a una version en texto plano razonable. */
export function htmlATextoPlano(html: string): string {
  return html
    .replace(/<\s*(script|style|head)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|tr|h[1-6]|li|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8203;|&#8204;|&#8205;/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copiarConClipboardApi(html: string, texto: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("El navegador no soporta ClipboardItem");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([texto], { type: "text/plain" }),
    }),
  ]);
}

/**
 * Fallback: renderiza el HTML en un contenedor fuera de pantalla, lo
 * selecciona y copia. Al copiar una seleccion el navegador pone el HTML
 * renderizado en el portapapeles, que es justo lo que necesitamos.
 */
function copiarConSeleccion(html: string): boolean {
  const contenedor = document.createElement("div");
  contenedor.innerHTML = html;
  contenedor.setAttribute("contenteditable", "true");
  Object.assign(contenedor.style, {
    position: "fixed",
    left: "-99999px",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(contenedor);

  const seleccion = window.getSelection();
  const rango = document.createRange();
  rango.selectNodeContents(contenedor);
  seleccion?.removeAllRanges();
  seleccion?.addRange(rango);

  let copiado = false;
  try {
    copiado = document.execCommand("copy");
  } catch {
    copiado = false;
  } finally {
    seleccion?.removeAllRanges();
    contenedor.remove();
  }
  return copiado;
}

/** Copia el mail ya renderizado, probando los tres caminos en orden. */
export async function copiarEmail(html: string): Promise<ResultadoCopia> {
  const texto = htmlATextoPlano(html);

  try {
    await copiarConClipboardApi(html, texto);
    return { ok: true, metodo: "clipboard-api" };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);

    if (copiarConSeleccion(html)) {
      return { ok: true, metodo: "execCommand" };
    }

    try {
      await navigator.clipboard.writeText(texto);
      return { ok: true, metodo: "texto-plano" };
    } catch {
      return { ok: false, metodo: "ninguno", error: motivo };
    }
  }
}

/** Copia el codigo fuente del mail, para pegarlo en otra herramienta. */
export async function copiarCodigoFuente(html: string): Promise<ResultadoCopia> {
  try {
    await navigator.clipboard.writeText(html);
    return { ok: true, metodo: "texto-plano" };
  } catch (error) {
    return {
      ok: false,
      metodo: "ninguno",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
