import { ejecutarCron } from "@/lib/automatizaciones/cron";
import { enviarSeguimiento, urlBase } from "@/lib/notificaciones/envios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cierre-del-dia — seguimiento de chats a Telegram, en varios
 * mensajes por prioridad. Lo disparan los crons de vercel.json (lunes a
 * viernes 13:00 y 17:00 de Argentina); saltea fines de semana y feriados.
 */
export const GET = (request: Request) =>
  ejecutarCron(request, "seguimiento-chats", (ahora) => enviarSeguimiento("cron", urlBase(), ahora));
