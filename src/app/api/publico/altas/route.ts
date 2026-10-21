import { guardarAdjuntos, urlAdjunto } from "@/lib/db/adjuntos";
import type { ArchivoAdjunto } from "@/lib/db/adjuntos";
import { upsertMany } from "@/lib/db/solicitudes";
import { DOCUMENTOS_ALTA, ErrorAlta, validarAlta } from "@/lib/altas/formulario-alta";
import {
  ErrorFormulario,
  controlarTotal,
  esSpam,
  hoyArgentina,
  leerArchivo,
  preflight,
  respuesta,
} from "@/lib/publico/formularios";

export const runtime = "nodejs";

export const OPTIONS = (request: Request) => preflight(request);

/** La firma llega como imagen PNG dibujada en el navegador (data URL). */
function leerFirma(valor: FormDataEntryValue | null): ArchivoAdjunto {
  const texto = typeof valor === "string" ? valor : "";
  const partes = texto.match(/^data:image\/png;base64,([a-z0-9+/=]+)$/i);
  if (!partes) throw new ErrorFormulario("Falta la firma.");
  const datos = Buffer.from(partes[1], "base64");
  if (datos.length < 500 || datos.length > 500_000) throw new ErrorFormulario("La firma no es válida. Volvé a firmar.");
  return { nombre: "firma.png", tipo: "image/png", datos };
}

/**
 * POST /api/publico/altas — Formulario de Alta de Clientes que completa el
 * cliente desde /formularios/alta. Entra a Solicitudes de alta de la
 * intranet como pendiente. Solo contesta "recibido".
 */
export const POST = async (request: Request) => {
  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return respuesta(request, { error: "No se pudo leer el formulario. Si los archivos son muy pesados, reducilos." }, 400);
  }
  if (esSpam(formulario)) return respuesta(request, { ok: true }, 201);

  try {
    let crudo: unknown;
    try {
      crudo = JSON.parse(String(formulario.get("datos") ?? ""));
    } catch {
      throw new ErrorFormulario("Formulario inválido.");
    }
    const alta = validarAlta(crudo, hoyArgentina());

    const documentos: { etiqueta: string; archivo: ArchivoAdjunto }[] = [];
    for (const { campo, etiqueta, soloCuit } of DOCUMENTOS_ALTA) {
      const archivo = await leerArchivo(formulario.get(campo), etiqueta);
      // Los impositivos de Argentina son obligatorios solo con CUIT.
      if (!archivo && (alta.esCuit || !soloCuit)) throw new ErrorFormulario(`Falta adjuntar: ${etiqueta}.`);
      if (archivo) documentos.push({ etiqueta, archivo });
    }
    const firma = leerFirma(formulario.get("firma"));
    controlarTotal([...documentos.map((documento) => documento.archivo), firma]);

    const guardados = await guardarAdjuntos(
      [...documentos.map((documento) => documento.archivo), firma],
      `alta:${alta.email}`,
    );
    documentos.forEach(({ etiqueta }, indice) => {
      alta.datos[etiqueta] = urlAdjunto(guardados[indice]);
    });
    alta.datos.Firma = urlAdjunto(guardados[guardados.length - 1]);

    await upsertMany([{ nombre: alta.nombre, email: alta.email, datos: alta.datos }]);
    return respuesta(request, { ok: true }, 201);
  } catch (error) {
    if (error instanceof ErrorFormulario || error instanceof ErrorAlta) {
      return respuesta(request, { error: error.message }, 400);
    }
    console.error(`[formulario-alta] ${error instanceof Error ? error.message : String(error)}`);
    return respuesta(request, { error: "No pudimos registrar la solicitud. Intentá de nuevo en unos minutos." }, 500);
  }
};
