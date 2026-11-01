import { NextResponse } from "next/server";
import { getDecisiones } from "@/lib/db/decisiones-alta";
import { getById } from "@/lib/db/solicitudes";
import { urlBase } from "@/lib/notificaciones/envios";
import { nombreArchivo, pdfAlta } from "@/lib/solicitudes/exportar";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** GET /api/solicitudes/:id/pdf — ficha del alta para el legajo. */
export const GET = async (request: Request, contexto: Contexto) => {
  const { id } = await contexto.params;
  const solicitud = await getById(id);
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const decisiones = (await getDecisiones())[id] ?? [];
  const pdf = await pdfAlta(solicitud, decisiones, urlBase(request));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo(solicitud)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
};
