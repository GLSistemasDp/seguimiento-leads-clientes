import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import { postgresConfigurado } from "@/lib/db/postgres/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dias que una consulta finalizada sigue visible en la cola antes de la purga. */
const RETENCION_POR_DEFECTO = 7;

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * GET /api/cron/mantenimiento — todos los dias (vercel.json):
 * 1. purga de la cola de seguimiento (fn_purgar_cola): lo archivado hace mas
 *    de SEGUIMIENTO_DIAS_RETENCION dias ya esta en chat_interacciones;
 * 2. refresh de mv_reclamos_evolucion_mensual.
 */
export const GET = async (request: Request) => {
  if (!autorizado(request)) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  if (!postgresConfigurado()) return NextResponse.json({ status: "skipped", motivo: "Sin DATABASE_URL" });

  const dias = Number(process.env.SEGUIMIENTO_DIAS_RETENCION) || RETENCION_POR_DEFECTO;
  try {
    const { purgarCola } = await import("@/lib/db/postgres/seguimiento");
    const { refrescarEvolucion } = await import("@/lib/db/postgres/pg");
    const purgadas = await purgarCola(dias);
    await refrescarEvolucion();
    await registrarAutomatizacion({
      automatizacion: "mantenimiento-base",
      origen: "cron",
      estado: "ok",
      mensajes: 0,
      pendientes: null,
      detalle: `${purgadas} consultas purgadas (retención ${dias} días); evolución mensual refrescada`,
    });
    return NextResponse.json({ status: "ok", purgadas, retencionDias: dias });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await registrarAutomatizacion({
      automatizacion: "mantenimiento-base",
      origen: "cron",
      estado: "error",
      mensajes: 0,
      pendientes: null,
      detalle: mensaje,
    });
    return NextResponse.json({ status: "error", error: mensaje }, { status: 500 });
  }
};
