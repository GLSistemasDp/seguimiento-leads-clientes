import "server-only";

/**
 * Envio de mensajes a grupos de Telegram con la API de bots.
 *
 * Variables de entorno (nunca se loguean ni se devuelven):
 * - TELEGRAM_BOT_TOKEN: el token que da @BotFather (/newbot).
 * - TELEGRAM_VENDEDORES_CHAT_ID: grupo por defecto (empieza con -100). Se
 *   obtiene agregando el bot al grupo y leyendo
 *   https://api.telegram.org/bot<TOKEN>/getUpdates. TELEGRAM_CHAT_ID se sigue
 *   aceptando como nombre anterior.
 * - Opcionales, para mandar cada tipo a otro grupo: TELEGRAM_ALTAS_CHAT_ID,
 *   TELEGRAM_RECLAMOS_CHAT_ID y TELEGRAM_SEGUIMIENTO_CHAT_ID.
 */

/** A que grupo va cada tipo de notificacion. */
export type CanalTelegram = "altas" | "reclamos" | "seguimiento";

/** Telegram corta en 4096 caracteres; se deja margen para las etiquetas HTML. */
const LIMITE = 3800;

function chatDe(canal: CanalTelegram): string | undefined {
  const propio = process.env[`TELEGRAM_${canal.toUpperCase()}_CHAT_ID`];
  return propio || process.env.TELEGRAM_VENDEDORES_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
}

function credenciales(canal: CanalTelegram): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatDe(canal);
  return token && chatId ? { token, chatId } : null;
}

export function telegramConfigurado(canal: CanalTelegram = "seguimiento"): boolean {
  return credenciales(canal) !== null;
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Los mensajes se escriben con *negrita* y [texto](url) (como en WhatsApp y
 * Markdown); Telegram recibe HTML.
 */
export function aHtmlTelegram(texto: string): string {
  return escaparHtml(texto)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
}

/**
 * Parte el texto por lineas para no pasar el limite. Una linea que sola ya
 * lo supera se corta a la fuerza (no pasa con estos mensajes, pero no rompe).
 */
export function partir(texto: string, limite = LIMITE): string[] {
  const partes: string[] = [];
  let actual = "";
  for (const linea of texto.split("\n").flatMap((l) => l.match(new RegExp(`[\\s\\S]{1,${limite}}`, "g")) ?? [""])) {
    if (actual && (actual + "\n" + linea).length > limite) {
      partes.push(actual);
      actual = linea;
    } else {
      actual = actual ? `${actual}\n${linea}` : linea;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

export class ErrorTelegram extends Error {
  constructor(
    mensaje: string,
    /** true si falta configurar el bot (no es una falla de Telegram). */
    readonly sinConfigurar = false,
  ) {
    super(mensaje);
  }
}

/**
 * Envia uno o varios mensajes (en orden) al grupo del canal, partiendo los
 * largos. Devuelve cuantos mensajes de Telegram se mandaron.
 */
export async function enviarTelegram(textos: string | readonly string[], canal: CanalTelegram = "seguimiento"): Promise<number> {
  const datos = credenciales(canal);
  if (!datos) {
    throw new ErrorTelegram("Telegram no está configurado: faltan TELEGRAM_BOT_TOKEN y TELEGRAM_VENDEDORES_CHAT_ID.", true);
  }

  const partes = (typeof textos === "string" ? [textos] : textos).flatMap((texto) => partir(aHtmlTelegram(texto)));
  for (const [indice, parte] of partes.entries()) {
    let respuesta: Response;
    try {
      respuesta = await fetch(`https://api.telegram.org/bot${datos.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: datos.chatId,
          text: parte,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // El error de red puede traer la URL (con el token): no se propaga.
      throw new ErrorTelegram(`No se pudo conectar con Telegram (mensaje ${indice + 1} de ${partes.length}).`);
    }
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => null)) as { description?: string } | null;
      throw new ErrorTelegram(
        `Telegram rechazó el mensaje ${indice + 1} de ${partes.length} (${respuesta.status}): ${cuerpo?.description ?? "sin detalle"}`,
      );
    }
  }
  return partes.length;
}
