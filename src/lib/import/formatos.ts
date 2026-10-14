/**
 * Formatos aceptados por el importador. Vive aparte de parse-spreadsheet
 * para que el cliente pueda validar la extension sin cargar xlsx.
 */
export const EXTENSIONES_SOPORTADAS = [".xlsx", ".xls", ".xlsm", ".csv"] as const;

export const ACCEPT_INPUT = EXTENSIONES_SOPORTADAS.join(",");

export function extensionSoportada(nombreArchivo: string): boolean {
  const minuscula = nombreArchivo.toLowerCase();
  return EXTENSIONES_SOPORTADAS.some((extension) => minuscula.endsWith(extension));
}
