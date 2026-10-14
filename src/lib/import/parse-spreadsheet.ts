import * as XLSX from "xlsx";

export { extensionSoportada } from "@/lib/import/formatos";

/** Una fila cruda del archivo: encabezado original -> valor. */
export type FilaCruda = Record<string, string | number | boolean | null>;

export type PlanillaParseada = {
  /** Encabezados tal cual vienen en el archivo, en orden. */
  encabezados: string[];
  filas: FilaCruda[];
  /** Nombre de la hoja de la que se leyeron los datos. */
  hoja: string;
};

function normalizarCelda(valor: unknown): string | number | boolean | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).trim() || null;
}

/**
 * Convierte un .xlsx/.csv en filas genericas. No sabe nada del modelo
 * Solicitud: eso es responsabilidad de normalize-solicitud.
 */
export function parseSpreadsheet(buffer: ArrayBuffer | Uint8Array): PlanillaParseada {
  const libro = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const hoja = libro.SheetNames[0];
  if (!hoja) {
    throw new Error("El archivo no tiene ninguna hoja de calculo");
  }

  const planilla = libro.Sheets[hoja];
  if (!planilla) {
    throw new Error(`No se pudo leer la hoja "${hoja}"`);
  }

  // defval: null para que las celdas vacias aparezcan en el objeto y el
  // mapeo posterior pueda distinguir "vacia" de "columna inexistente".
  const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilla, {
    defval: null,
    raw: false,
    blankrows: false,
  });

  const encabezados: string[] = [];
  const filas: FilaCruda[] = [];

  for (const cruda of crudas) {
    const fila: FilaCruda = {};
    for (const [encabezado, valor] of Object.entries(cruda)) {
      const clave = encabezado.trim();
      if (!clave || clave.startsWith("__EMPTY")) continue;
      if (!encabezados.includes(clave)) encabezados.push(clave);
      fila[clave] = normalizarCelda(valor);
    }
    // Descarta filas completamente vacias (Acrobat suele exportar varias).
    if (Object.values(fila).some((valor) => valor !== null)) {
      filas.push(fila);
    }
  }

  return { encabezados, filas, hoja };
}
