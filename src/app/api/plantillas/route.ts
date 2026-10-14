import { NextResponse } from "next/server";
import { getAll, update } from "@/lib/db/plantillas";
import type { CambiosPlantilla } from "@/lib/db/plantillas";
import { esTipoPlantilla } from "@/types/plantilla";

export const runtime = "nodejs";

/** GET /api/plantillas — las dos plantillas (se crean con el default si faltan). */
export const GET = async () => {
  return NextResponse.json({ plantillas: await getAll() });
};

/** Campos de texto editables desde /plantillas. */
const CAMPOS_TEXTO = ["asunto", "cuerpoHtml", "headerAlt", "footerAlt"] as const;
const CAMPOS_URL = ["headerImg", "footerImg"] as const;

/** PATCH /api/plantillas — actualiza una plantilla por tipo. */
export const PATCH = async (request: Request) => {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const tipo = cuerpo?.tipo;
  if (!esTipoPlantilla(tipo)) {
    return NextResponse.json(
      { error: 'Tipo invalido: esperaba "aprobado" o "rechazado"' },
      { status: 400 },
    );
  }

  const cambios: CambiosPlantilla = {};
  for (const campo of CAMPOS_TEXTO) {
    const valor = cuerpo[campo];
    if (typeof valor === "string") {
      cambios[campo] = valor;
    }
  }
  for (const campo of CAMPOS_URL) {
    const valor = cuerpo[campo];
    if (typeof valor === "string") {
      // Vacio significa "sin imagen", no cadena vacia.
      cambios[campo] = valor.trim() || null;
    }
  }

  if (typeof cambios.asunto === "string" && !cambios.asunto.trim()) {
    return NextResponse.json({ error: "El asunto no puede quedar vacio" }, { status: 400 });
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No hay nada para actualizar" }, { status: 400 });
  }

  return NextResponse.json({ plantilla: await update(tipo, cambios) });
};
