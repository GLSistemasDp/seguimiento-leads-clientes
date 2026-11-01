import { NextResponse } from "next/server";
import { registrarDecision } from "@/lib/db/decisiones-alta";
import { getById, updateEstado } from "@/lib/db/solicitudes";
import { esEstado, esMotivoRechazo } from "@/types/solicitud";

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

/**
 * PATCH /api/solicitudes/:id — cambia el estado.
 * Cuerpo: { estado, motivo?, comentario? }. Para rechazar el motivo es
 * obligatorio (y el comentario, si el motivo es "Otro").
 */
export const PATCH = async (request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const { estado, motivo, comentario } = (cuerpo ?? {}) as { estado?: unknown; motivo?: unknown; comentario?: unknown };
  const nota = typeof comentario === "string" ? comentario.trim() : "";
  if (!esEstado(estado)) {
    return NextResponse.json(
      { error: "Estado invalido: esperaba PENDIENTE, APROBADO o RECHAZADO" },
      { status: 400 },
    );
  }

  if (estado === "RECHAZADO" && !esMotivoRechazo(motivo)) {
    return NextResponse.json({ error: "Elegí el motivo del rechazo." }, { status: 400 });
  }
  if (estado === "RECHAZADO" && motivo === "Otro" && !nota) {
    return NextResponse.json({ error: "Contá el motivo del rechazo en el comentario." }, { status: 400 });
  }

  const existente = await getById(id);
  if (!existente) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const solicitud = await updateEstado(id, estado);
  const decision = await registrarDecision(id, estado, esMotivoRechazo(motivo) ? motivo : null, nota);
  return NextResponse.json({ solicitud, decision });
};
