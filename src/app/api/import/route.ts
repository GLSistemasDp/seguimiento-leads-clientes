import { NextResponse } from "next/server";
import { ErrorImportacion, importarSolicitudes } from "@/lib/import/import-solicitudes";

export const runtime = "nodejs";
/** Parsear una planilla grande puede pasarse del limite por defecto. */
export const maxDuration = 60;

/** POST /api/import — recibe el archivo y dispara la importacion. */
export const POST = async (request: Request) => {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba un formulario multipart" }, { status: 400 });
  }

  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo a importar" }, { status: 400 });
  }

  try {
    const resumen = await importarSolicitudes(archivo);
    return NextResponse.json(resumen);
  } catch (error) {
    if (error instanceof ErrorImportacion) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error importando solicitudes", error);
    return NextResponse.json(
      { error: "No se pudo completar la importacion. Revisa el archivo e intenta de nuevo." },
      { status: 500 },
    );
  }
};
