import "server-only";

/**
 * Envio de mensajes a un grupo de Telegram con la API de bots.
 *
 * Configuracion (una sola vez):
 * 1. En Telegram, hablarle a @BotFather -> /newbot -> copiar el token en
 *    TELEGRAM_BOT_TOKEN.
 * 2. Agregar el bot al grupo de gerencia y mandar cualquier mensaje en el grupo.
 * 3. Abrir https://api.telegram.org/bot<TOKEN>/getUpdates y copiar el
 *    "chat":{"id":...} del grupo (empieza con -100) en TELEGRAM_CHAT_ID.
 */

const LIMITE = 4000; // Telegram corta en 4096 caracteres por mensaje.

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** El resumen usa el formato de WhatsApp (*negrita*); Telegram recibe HTML. */
export function aHtmlTelegram(texto: string): string {
  return escaparHtml(texto).replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
}

/** Parte el texto por lineas para no pasar el limite de Telegram. */
function partir(texto: string): string[] {
  const partes: string[] = [];
  let actual = "";
  for (const linea of texto.split("\n")) {
    if ((actual + "\n" + linea).length > LIMITE && actual) {
      partes.push(actual);
      actual = linea;
    } else {
      actual = actual ? `${actual}\n${linea}` : linea;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

export class ErrorTelegram extends Error {}

/** Envia el texto (formato WhatsApp) al grupo configurado. */
export async function enviarTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new ErrorTelegram("Telegram no está configurado: faltan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.");
  }

  for (const parte of partir(aHtmlTelegram(texto))) {
    const respuesta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: parte, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      cache: "no-store",
    });
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => null)) as { description?: string } | null;
      throw new ErrorTelegram(`Telegram rechazó el mensaje (${respuesta.status}): ${cuerpo?.description ?? "sin detalle"}`);
    }
  }
}
