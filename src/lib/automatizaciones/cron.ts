import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import type { ResultadoEnvio } from "@/lib/notificaciones/envios";
import { diaHabil } from "@/lib/utils/feriados";

/** Compara el header con `Bearer ${CRON_SECRET}` sin filtrar nada por el tiempo de respuesta. */
function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * Esqueleto comun de los crons de Vercel: exige CRON_SECRET, saltea fines de
 * semana y feriados (y lo registra) y si no, hace el envio.
 */
export async function ejecutarCron(
  request: Request,
  automatizacion: string,
  enviar: (ahora: Date) => Promise<ResultadoEnvio>,
): Promise<NextResponse> {
  if (!autorizado(request)) return NextResponse.json({ status: "unauthorized" }, { status: 401 });

  const ahora = new Date();
  const hoy = await diaHabil(ahora);
  if (!hoy.habil) {
    await registrarAutomatizacion({
      automatizacion,
      origen: "cron",
      estado: "omitido",
      mensajes: 0,
      pendientes: null,
      detalle: `${hoy.dia}: ${hoy.motivo}`,
    });
    return NextResponse.json({ status: "skipped", dia: hoy.dia, motivo: hoy.motivo });
  }

  const resultado = await enviar(ahora);
  return resultado.ok
    ? NextResponse.json({ status: "sent", dia: hoy.dia, mensajes: resultado.mensajes, pendientes: resultado.pendientes, feriados: hoy.fuente })
    : NextResponse.json({ status: "error", dia: hoy.dia, error: resultado.error }, { status: 500 });
}
