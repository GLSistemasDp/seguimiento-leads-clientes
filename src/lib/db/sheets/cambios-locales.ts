import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import type { CambiosConsulta } from "@/types/seguimiento";

/**
 * Cuando la planilla se lee por su link publico la app no puede escribir en
 * ella: lo que se tilda o se anota desde la app se guarda en el almacen
 * (Postgres, o `.data/seguimiento-cambios.json` en local) y se aplica encima
 * de lo que trae la planilla. Al pasar a la service account estos cambios
 * dejan de usarse y todo se escribe en la planilla.
 */

export type CambioLocal = CambiosConsulta & {
  /** Cuando se finalizo / edito desde la app (ISO). */
  actualizado: string;
};

const COLECCION = "seguimiento-cambios";

export function leerCambios(): Promise<Record<string, CambioLocal>> {
  return leer<CambioLocal>(COLECCION);
}

export function guardarCambio(id: string, cambios: CambiosConsulta): Promise<CambioLocal> {
  return modificar<CambioLocal, CambioLocal>(COLECCION, (todos) => {
    const cambio: CambioLocal = { ...todos[id], ...cambios, actualizado: new Date().toISOString() };
    todos[id] = cambio;
    return cambio;
  });
}
