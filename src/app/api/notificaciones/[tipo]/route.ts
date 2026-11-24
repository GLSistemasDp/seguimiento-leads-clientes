import { NextResponse } from "next/server";
import { ENVIOS, urlBase } from "@/lib/notificaciones/envios";
import type { TipoNotificacion } from "@/lib/notificaciones/envios";
import { botPausado, establecerPausaBot } from "@/lib/notificaciones/estado-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esTipo(valor: string): valor is TipoNotificacion {
  return Object.hasOwn(ENVIOS, valor);
}

/** Estado persistido del bot de esta pantalla. */
export const GET = async (_request: Request, { params }: { params: Promise<{ tipo: string }> }) => {
  const { tipo } = await params;
  if (!esTipo(tipo)) return NextResponse.json({ error: "Tipo de notificación desconocido" }, { status: 404 });
  try {
    return NextResponse.json({ pausado: await botPausado(tipo) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el estado del bot." }, { status: 500 });
  }
};

/** Pausa o reanuda solo el canal elegido; protegido por el acceso a la intranet. */
export const PATCH = async (request: Request, { params }: { params: Promise<{ tipo: string }> }) => {
  const { tipo } = await params;
  if (!esTipo(tipo)) return NextResponse.json({ error: "Tipo de notificación desconocido" }, { status: 404 });
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo.pausado !== "boolean") {
    return NextResponse.json({ error: "Indicá si el bot debe quedar pausado." }, { status: 400 });
  }
  try {
    await establecerPausaBot(tipo, cuerpo.pausado);
    return NextResponse.json({ pausado: cuerpo.pausado });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el estado del bot. Revisá el almacenamiento e intentá de nuevo." }, { status: 500 });
  }
};

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
  return NextResponse.json(
    { error: resultado.error, pausado: resultado.pausado === true },
    { status: resultado.pausado ? 409 : resultado.sinConfigurar ? 503 : 500 },
  );
};
