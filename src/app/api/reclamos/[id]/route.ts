import { NextResponse } from "next/server";
import { guardarIndicacion } from "@/lib/db/reclamos";
import { validarIndicacion } from "@/lib/reclamos/validacion";

export const runtime = "nodejs";

/** PATCH /api/reclamos/:id — guarda la indicacion del gerente para el vendedor. */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  let datos;
  try {
    datos = validarIndicacion(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const indicacion = await guardarIndicacion(id, datos);
    return indicacion
      ? NextResponse.json({ indicacion })
      : NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la indicación" },
      { status: 500 },
    );
  }
};
