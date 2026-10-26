import { NextResponse } from "next/server";
import { sincronizacionConfigurada, sincronizarPlanilla } from "@/lib/sync/planilla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/seguimiento/sincronizar — boton "Sincronizar ahora" del seguimiento (dentro de la intranet). */
export const POST = async () => {
  if (!sincronizacionConfigurada()) {
    return NextResponse.json({ error: "Falta DATABASE_URL o SEGUIMIENTO_SHEETS_ID." }, { status: 409 });
  }
  try {
    return NextResponse.json(await sincronizarPlanilla());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
