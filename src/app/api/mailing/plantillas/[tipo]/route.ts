import { NextResponse } from "next/server";
import { guardarPlantilla, restaurarPlantilla } from "@/lib/db/mailing";
import { esTipoMail } from "@/types/mailing";
import type { PlantillaMailing } from "@/types/mailing";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ tipo: string }> };

const LIMITES: Record<keyof PlantillaMailing, number> = {
  asunto: 200,
  // Una imagen subida viaja embebida: hasta ~2 MB.
  imagen: 2_800_000,
  imagenAlt: 200,
  titulo: 200,
  cuerpo: 50_000,
  botonTexto: 60,
  botonUrl: 500,
  pie: 1_000,
};

function validar(valor: unknown): PlantillaMailing {
  if (!valor || typeof valor !== "object") throw new Error("Plantilla inválida.");
  const datos = valor as Record<string, unknown>;
  const plantilla = {} as PlantillaMailing;
  for (const [campo, maximo] of Object.entries(LIMITES) as [keyof PlantillaMailing, number][]) {
    const texto = datos[campo];
    if (typeof texto !== "string") throw new Error(`Falta el campo ${campo}.`);
    if (texto.length > maximo) throw new Error(`El campo ${campo} es demasiado largo.`);
    plantilla[campo] = texto;
  }
  if (!plantilla.asunto.trim()) throw new Error("El asunto no puede quedar vacío.");
  if (!plantilla.cuerpo.trim()) throw new Error("El cuerpo no puede quedar vacío.");
  return plantilla;
}

/** PUT /api/mailing/plantillas/:tipo — guarda la plantilla editada. */
export const PUT = async (request: Request, { params }: Contexto) => {
  const { tipo } = await params;
  if (!esTipoMail(tipo)) return NextResponse.json({ error: "Tipo de mail desconocido" }, { status: 404 });
  let plantilla: PlantillaMailing;
  try {
    plantilla = validar(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  await guardarPlantilla(tipo, plantilla);
  return NextResponse.json({ plantilla });
};

/** DELETE /api/mailing/plantillas/:tipo — vuelve a la plantilla original. */
export const DELETE = async (_request: Request, { params }: Contexto) => {
  const { tipo } = await params;
  if (!esTipoMail(tipo)) return NextResponse.json({ error: "Tipo de mail desconocido" }, { status: 404 });
  return NextResponse.json({ plantilla: await restaurarPlantilla(tipo) });
};
