import { NextResponse } from "next/server";
import { actualizarCalidad } from "@/lib/db/reclamos";
import { validarCalidad } from "@/lib/reclamos/formulario";

export const runtime = "nodejs";

/** PATCH /api/reclamos/:id/calidad — evaluacion del Asegurador de Calidad y cierre del reclamo. */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  let datos;
  try {
    datos = validarCalidad(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  const { id } = await params;
  const reclamo = await actualizarCalidad(id, datos.calidad, datos.cierre);
  return reclamo
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Formulario no encontrado" }, { status: 404 });
};
