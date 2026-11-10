import { NextResponse } from "next/server";
import { sincronizacionConfigurada, sincronizarPlanilla, ultimaSincronizacion } from "@/lib/sync/planilla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Con `siHaceFalta`, no se vuelve a leer la planilla si se sincronizo hace menos de esto. */
const MINIMO_ENTRE_CORRIDAS_MS = 2 * 60_000;

/**
 * POST /api/seguimiento/sincronizar — boton "Sincronizar ahora" del
 * seguimiento y la sincronizacion automatica de la pantalla (dentro de la
 * intranet). Cuerpo opcional: { siHaceFalta: true } para la automatica.
 */
export const POST = async (request: Request) => {
  if (!sincronizacionConfigurada()) {
    return NextResponse.json({ error: "Falta DATABASE_URL o SEGUIMIENTO_SHEETS_ID." }, { status: 409 });
  }
  const cuerpo = (await request.json().catch(() => ({}))) as { siHaceFalta?: unknown };
  if (cuerpo.siHaceFalta === true) {
    const ultima = await ultimaSincronizacion().catch(() => null);
    if (ultima?.estado === "ok" && Date.now() - new Date(ultima.fecha).getTime() < MINIMO_ENTRE_CORRIDAS_MS) {
      return NextResponse.json({ estado: "omitida", motivo: "Sincronizada hace menos de 2 minutos." });
    }
  }
  try {
    return NextResponse.json(await sincronizarPlanilla());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
