import { upsertMany } from "@/lib/db/solicitudes";
import { extensionSoportada, parseSpreadsheet } from "@/lib/import/parse-spreadsheet";
import { normalizarFilas } from "@/lib/import/normalize-solicitud";
import type { ErrorFila } from "@/lib/import/normalize-solicitud";

export type ResumenImportacion = {
  archivo: string;
  hoja: string;
  /** Filas con datos que trajo el archivo (sin contar el encabezado). */
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  duplicadas: number;
  errores: ErrorFila[];
  /** Encabezados detectados, para poder revisar el mapeo desde la UI. */
  encabezados: string[];
};

export class ErrorImportacion extends Error {}

/**
 * Orquesta la importacion completa: parsea el archivo, normaliza las filas,
 * hace upsert por email y devuelve el resumen para mostrar en pantalla.
 */
export async function importarSolicitudes(
  archivo: File,
): Promise<ResumenImportacion> {
  if (!extensionSoportada(archivo.name)) {
    throw new ErrorImportacion(
      "Formato no soportado. Subi un archivo .xlsx, .xls, .xlsm o .csv.",
    );
  }

  const buffer = new Uint8Array(await archivo.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new ErrorImportacion("El archivo esta vacio.");
  }

  let parseada;
  try {
    parseada = parseSpreadsheet(buffer);
  } catch (error) {
    throw new ErrorImportacion(
      `No se pudo leer el archivo: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { solicitudes, errores, duplicadas } = normalizarFilas(parseada.filas);
  const { creadas, actualizadas } = await upsertMany(solicitudes);

  return {
    archivo: archivo.name,
    hoja: parseada.hoja,
    filasLeidas: parseada.filas.length,
    creadas,
    actualizadas,
    duplicadas,
    errores,
    encabezados: parseada.encabezados,
  };
}
