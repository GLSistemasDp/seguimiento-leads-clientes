/**
 * Hash corto (FNV-1a en base 36) para identificar una fila de la planilla de
 * seguimiento por su contenido y no por su posicion, que cambia si alguien
 * ordena o inserta filas mientras la pantalla esta abierta.
 */
export function huella(texto: string): string {
  let hash = 2166136261;
  for (const caracter of texto) {
    hash ^= caracter.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
