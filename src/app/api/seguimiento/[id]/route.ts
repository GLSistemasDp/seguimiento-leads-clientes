import { NextResponse } from "next/server";
import { registrar } from "@/lib/db/historial";
import { getById, update } from "@/lib/db/seguimiento";
import { RELACIONES, RESULTADOS } from "@/types/seguimiento";
import type { CambiosConsulta, Relacion, Resultado } from "@/types/seguimiento";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/**
 * PATCH /api/seguimiento/:id — finaliza (con resultado obligatorio), reabre o
 * anota una consulta. Cada cambio queda ademas como evento en el historial.
 *
 * Cuerpo: { respondida?: boolean, observaciones?: string,
 *           resultado?: Resultado, relacion?: Relacion }
 * Para finalizar (respondida: true) son obligatorios resultado y relacion.
 */
export const PATCH = async (request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const { respondida, observaciones, resultado, relacion } = (cuerpo ?? {}) as Record<string, unknown>;
  const cambios: CambiosConsulta = {};
  if (typeof respondida === "boolean") cambios.respondida = respondida;
  const observacion = typeof observaciones === "string" ? observaciones.trim().slice(0, 2000) : undefined;

  const resultadoValido =
    typeof resultado === "string" && (RESULTADOS as readonly string[]).includes(resultado)
      ? (resultado as Resultado)
      : null;
  const relacionValida =
    typeof relacion === "string" && Object.hasOwn(RELACIONES, relacion) ? (relacion as Relacion) : null;

  if (respondida === true && !resultadoValido) {
    return NextResponse.json(
      { error: "Para finalizar la conversacion indica como quedo (resultado)." },
      { status: 400 },
    );
  }
  if (respondida === true && !relacionValida) {
    return NextResponse.json(
      { error: "Para finalizar la conversacion indica como quedo la relacion con el cliente." },
      { status: 400 },
    );
  }

  // En la planilla queda el resultado al frente de la observacion, para que
  // quien la mire alla tambien sepa como termino.
  if (resultadoValido) {
    cambios.observaciones = observacion ? `${resultadoValido} · ${observacion}` : resultadoValido;
  } else if (observacion !== undefined) {
    cambios.observaciones = observacion;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json(
      { error: "Nada para actualizar: esperaba respondida (boolean) u observaciones (texto)" },
      { status: 400 },
    );
  }

  const actual = await getById(id);
  if (!actual) {
    return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
  }

  try {
    const consulta = await update(id, cambios, { resultado: resultadoValido, relacion: relacionValida });
    await registrar({
      consultaId: id,
      cliente: actual.cliente,
      hito: actual.hito,
      tipo: respondida === true ? "finalizada" : respondida === false ? "reabierta" : "nota",
      resultado: resultadoValido,
      relacion: relacionValida,
      observacion: observacion ?? "",
      consulta: actual.consulta,
      encargado: actual.encargado,
      resumen: actual.ia?.resumen,
    });
    return NextResponse.json({ consulta });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar" },
      { status: 500 },
    );
  }
};
