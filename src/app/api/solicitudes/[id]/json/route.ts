import { NextResponse } from "next/server";
import { getDecisiones } from "@/lib/db/decisiones-alta";
import { getById } from "@/lib/db/solicitudes";
import { urlBase } from "@/lib/notificaciones/envios";
import { fichaAlta, nombreArchivo } from "@/lib/solicitudes/exportar";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** GET /api/solicitudes/:id/json — ficha del alta para analisis y para el maestro de clientes. */
export const GET = async (request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;
  const solicitud = await getById(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const decisiones = (await getDecisiones())[id] ?? [];
  return new Response(JSON.stringify(fichaAlta(solicitud, decisiones, urlBase(request)), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo(solicitud)}.json"`,
      "Cache-Control": "no-store",
    },
  });
};
