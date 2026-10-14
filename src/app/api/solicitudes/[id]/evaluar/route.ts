import { NextResponse } from "next/server";
import { getById } from "@/lib/db/solicitudes";
import { ErrorEvaluacion, evaluarConIA } from "@/lib/solicitudes/evaluacion-ia";

export const runtime = "nodejs";

/** POST /api/solicitudes/:id/evaluar — puntua la solicitud con Claude. */
export const POST = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const solicitud = await getById(id);
  if (!solicitud) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  try {
    return NextResponse.json({ evaluacion: await evaluarConIA(solicitud) });
  } catch (error) {
    const estado = error instanceof ErrorEvaluacion ? 503 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo evaluar" },
      { status: estado },
    );
  }
};
