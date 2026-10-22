import { ejecutarCron } from "@/lib/automatizaciones/cron";
import { enviarReclamosPendientes, urlBase } from "@/lib/notificaciones/envios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reclamos — resumen de reclamos pendientes a Telegram, solo al
 * final del dia (lunes a viernes 17:00 de Argentina, ver vercel.json).
 */
export const GET = (request: Request) =>
  ejecutarCron(request, "reclamos-pendientes", (ahora) => enviarReclamosPendientes("cron", urlBase(), ahora));
