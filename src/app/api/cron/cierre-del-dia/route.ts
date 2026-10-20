import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import { AUTOMATIZACION, enviarCierreDelDia } from "@/lib/seguimiento/cierre-del-dia";
import { diaHabil } from "@/lib/utils/feriados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compara el header con `Bearer ${CRON_SECRET}` sin filtrar nada por el tiempo de respuesta. */
function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * GET /api/cron/cierre-del-dia — envio automatico del cierre a Telegram.
 * Lo disparan los crons de vercel.json (lunes a viernes 13:00 y 17:00 de
 * Argentina). Saltea fines de semana y feriados nacionales.
 */
export const GET = async (request: Request) => {
  if (!autorizado(request)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const ahora = new Date();
  const hoy = await diaHabil(ahora);
  if (!hoy.habil) {
    await registrarAutomatizacion({
      automatizacion: AUTOMATIZACION,
      origen: "cron",
      estado: "omitido",
      mensajes: 0,
      pendientes: null,
      detalle: `${hoy.dia}: ${hoy.motivo}`,
    });
    return NextResponse.json({ status: "skipped", dia: hoy.dia, motivo: hoy.motivo });
  }

  const resultado = await enviarCierreDelDia("cron", ahora);
  if (resultado.ok) {
    return NextResponse.json({
      status: "sent",
      dia: hoy.dia,
      mensajes: resultado.mensajes,
      pendientes: resultado.pendientes,
      feriados: hoy.fuente,
    });
  }
  return NextResponse.json({ status: "error", dia: hoy.dia, error: resultado.error }, { status: 500 });
};
