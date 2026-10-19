import { NextResponse } from "next/server";
import { crearFormulario } from "@/lib/db/reclamos";
import type { ArchivoAdjunto } from "@/lib/db/reclamos";
import { ADJUNTOS, validarNuevoReclamo } from "@/lib/reclamos/formulario";

export const runtime = "nodejs";

/**
 * POST /api/reclamos — alta de un formulario FOR-03 (multipart): el campo
 * "datos" trae el JSON del formulario y "adjuntos" los archivos.
 */
export const POST = async (request: Request) => {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario (¿adjuntos demasiado pesados?)." }, { status: 400 });
  }

  let datos;
  try {
    datos = validarNuevoReclamo(JSON.parse(String(formulario.get("datos") ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }

  const archivos = formulario.getAll("adjuntos").filter((valor): valor is File => valor instanceof File && valor.size > 0);
  if (archivos.length > ADJUNTOS.maximo) {
    return NextResponse.json({ error: `Se admiten hasta ${ADJUNTOS.maximo} adjuntos.` }, { status: 400 });
  }
  if (archivos.reduce((total, archivo) => total + archivo.size, 0) > ADJUNTOS.bytes) {
    return NextResponse.json({ error: "Los adjuntos superan los 4 MB en total." }, { status: 400 });
  }
  const invalido = archivos.find((archivo) => !(ADJUNTOS.tipos as readonly string[]).includes(archivo.type));
  if (invalido) {
    return NextResponse.json({ error: `${invalido.name}: solo se aceptan PDF o imágenes.` }, { status: 400 });
  }

  const adjuntos: ArchivoAdjunto[] = await Promise.all(
    archivos.map(async (archivo) => ({
      nombre: archivo.name.slice(0, 200),
      tipo: archivo.type,
      datos: Buffer.from(await archivo.arrayBuffer()),
    })),
  );

  try {
    const reclamo = await crearFormulario(datos, adjuntos);
    return NextResponse.json({ reclamo: { id: reclamo.id } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el reclamo" },
      { status: 500 },
    );
  }
};
