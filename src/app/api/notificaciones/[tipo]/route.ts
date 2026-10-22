import { NextResponse } from "next/server";
import { ENVIOS, urlBase } from "@/lib/notificaciones/envios";
import type { TipoNotificacion } from "@/lib/notificaciones/envios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esTipo(valor: string): valor is TipoNotificacion {
  return Object.hasOwn(ENVIOS, valor);
}

/**
 * POST /api/notificaciones/:tipo — boton "Enviar a Telegram" de cada pantalla
 * (seguimiento, reclamos, altas). Manda al instante, sin mirar horarios ni
 * feriados. Usa las mismas funciones que los crons.
 */
export const POST = async (request: Request, { params }: { params: Promise<{ tipo: string }> }) => {
  const { tipo } = await params;
  if (!esTipo(tipo)) return NextResponse.json({ error: "Tipo de notificación desconocido" }, { status: 404 });
  const resultado = await ENVIOS[tipo]("manual", urlBase(request));
  if (resultado.ok) return NextResponse.json(resultado);
  return NextResponse.json({ error: resultado.error }, { status: resultado.sinConfigurar ? 503 : 500 });
};
