import { NextResponse } from "next/server";
import { getById, updateEstado } from "@/lib/db/solicitudes";
import { esEstado } from "@/types/solicitud";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** GET /api/solicitudes/:id */
export const GET = async (_request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;
  const solicitud = await getById(id);

  if (!solicitud) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ solicitud });
};

/** PATCH /api/solicitudes/:id — cambia el estado. */
export const PATCH = async (request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const estado = (cuerpo as { estado?: unknown } | null)?.estado;
  if (!esEstado(estado)) {
    return NextResponse.json(
      { error: "Estado invalido: esperaba PENDIENTE, APROBADO o RECHAZADO" },
      { status: 400 },
    );
  }

  const existente = await getById(id);
  if (!existente) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const solicitud = await updateEstado(id, estado);
  return NextResponse.json({ solicitud });
};
