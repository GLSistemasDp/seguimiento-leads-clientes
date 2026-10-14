import { NextResponse } from "next/server";
import { getAll } from "@/lib/db/solicitudes";
import { esEstado } from "@/types/solicitud";

export const runtime = "nodejs";

/** GET /api/solicitudes?estado=APROBADO&q=texto */
export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const estado = url.searchParams.get("estado");
  const busqueda = url.searchParams.get("q") ?? undefined;

  if (estado && !esEstado(estado)) {
    return NextResponse.json({ error: `Estado invalido: ${estado}` }, { status: 400 });
  }

  const solicitudes = await getAll({
    estado: estado && esEstado(estado) ? estado : undefined,
    busqueda,
  });

  return NextResponse.json({ solicitudes });
};
