import { NextResponse } from "next/server";
import { actualizarGestion } from "@/lib/db/reclamos";
import { validarGestion } from "@/lib/reclamos/formulario";

export const runtime = "nodejs";

/** PATCH /api/reclamos/:id/gestion — responsable, severidad, montos y cierre (alimentan el informe). */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  let gestion;
  try {
    gestion = validarGestion(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const reclamo = await actualizarGestion(id, gestion);
    return reclamo
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Formulario no encontrado" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar" },
      { status: 500 },
    );
  }
};
