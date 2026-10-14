import { NextResponse } from "next/server";
import { getAll } from "@/lib/db/solicitudes";
import { huellaSolicitud } from "@/lib/solicitudes/evaluacion";
import { ErrorEvaluacion, evaluarConIA, getEvaluaciones } from "@/lib/solicitudes/evaluacion-ia";

export const runtime = "nodejs";

/** Tope por pedido, para que el boton no quede minutos esperando. */
const MAXIMO = 15;

/**
 * POST /api/solicitudes/evaluar — evalua con Claude las pendientes que todavia
 * no tienen evaluacion de IA sobre sus datos actuales, de a una.
 */
export const POST = async () => {
  const [pendientes, guardadas] = await Promise.all([getAll({ estado: "PENDIENTE" }), getEvaluaciones()]);
  const aEvaluar = pendientes.filter((solicitud) => {
    const guardada = guardadas[solicitud.id];
    return !guardada || guardada.fuente !== "ia" || guardada.huella !== huellaSolicitud(solicitud);
  });

  let evaluadas = 0;
  for (const solicitud of aEvaluar.slice(0, MAXIMO)) {
    try {
      await evaluarConIA(solicitud);
      evaluadas += 1;
    } catch (error) {
      // Sin credenciales o con la API caida no tiene sentido seguir con el resto.
      if (evaluadas === 0) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "No se pudo evaluar" },
          { status: error instanceof ErrorEvaluacion ? 503 : 500 },
        );
      }
      break;
    }
  }

  return NextResponse.json({ evaluadas, restantes: aEvaluar.length - evaluadas });
};
