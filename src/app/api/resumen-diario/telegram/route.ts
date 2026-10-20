import { NextResponse } from "next/server";
import { enviarCierreDelDia } from "@/lib/seguimiento/cierre-del-dia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/resumen-diario/telegram — boton "Enviar a Telegram" del Resumen.
 * Manda al instante, sin mirar si es feriado. Usa la misma funcion que el cron.
 */
export const POST = async () => {
  const resultado = await enviarCierreDelDia("manual");
  if (resultado.ok) return NextResponse.json(resultado);
  return NextResponse.json({ error: resultado.error }, { status: resultado.sinConfigurar ? 503 : 500 });
};
