import { after } from "next/server";
import { crearFormulario } from "@/lib/db/reclamos";
import { notificarReclamoNuevo, urlBase } from "@/lib/notificaciones/envios";
import {
  ErrorFormulario,
  controlarTotal,
  esSpam,
  hoyArgentina,
  leerArchivo,
  preflight,
  respuesta,
} from "@/lib/publico/formularios";
import { ErrorValidacion, validarNuevoReclamo } from "@/lib/reclamos/formulario";
import type { ArchivoAdjunto } from "@/lib/db/adjuntos";

export const runtime = "nodejs";

const MAX_ADJUNTOS = 4;

export const OPTIONS = (request: Request) => preflight(request);

/**
 * POST /api/publico/reclamos — formulario FOR-03 que completa el cliente
 * desde /formularios/reclamo. Entra al panel de Reclamos de la intranet.
 * Solo devuelve el numero de reclamo asignado.
 */
export const POST = async (request: Request) => {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return respuesta(request, { error: "No se pudo leer el formulario. Si adjuntaste archivos pesados, reducilos." }, 400);
  }
  // A un bot se le contesta como si hubiera salido bien, sin guardar nada.
  if (esSpam(formulario)) return respuesta(request, { numero: "REC-0000" }, 201);

  try {
    let crudo: unknown;
    try {
      crudo = JSON.parse(String(formulario.get("datos") ?? ""));
    } catch {
      throw new ErrorFormulario("Formulario inválido.");
    }
    // La fecha la pone el servidor: el cliente no la elige.
    const datos = validarNuevoReclamo({ ...(crudo as object), fecha: hoyArgentina() });

    const entradas = formulario.getAll("adjuntos");
    if (entradas.length > MAX_ADJUNTOS) throw new ErrorFormulario(`Se admiten hasta ${MAX_ADJUNTOS} archivos.`);
    const archivos: ArchivoAdjunto[] = [];
    for (const entrada of entradas) {
      const archivo = await leerArchivo(entrada, "Adjunto");
      if (archivo) archivos.push(archivo);
    }
    controlarTotal(archivos);

    const reclamo = await crearFormulario(datos, archivos, "cliente");
    // Aviso al grupo de Telegram de reclamos, sin demorar la respuesta al cliente.
    after(() => notificarReclamoNuevo(reclamo, urlBase(request)));
    return respuesta(request, { numero: reclamo.id }, 201);
  } catch (error) {
    if (error instanceof ErrorFormulario || error instanceof ErrorValidacion) {
      return respuesta(request, { error: error.message }, 400);
    }
    console.error(`[formulario-reclamo] ${error instanceof Error ? error.message : String(error)}`);
    return respuesta(request, { error: "No pudimos registrar el reclamo. Intentá de nuevo en unos minutos." }, 500);
  }
};
