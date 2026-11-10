import "server-only";
import { cache } from "react";
import { leer, modificar } from "@/lib/db/local/almacen";
import { clavePorOrigen } from "@/lib/seguimiento/origen";
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

export const leerCambios = cache((): Promise<Record<string, CambioLocal>> => leer<CambioLocal>(clavePorOrigen(COLECCION)));

/** Varios cambios en una sola escritura (cierre masivo). */
export function guardarCambios(cambios: Record<string, CambiosConsulta>): Promise<void> {
  return modificar<CambioLocal, void>(clavePorOrigen(COLECCION), (todos) => {
    const actualizado = new Date().toISOString();
    for (const [id, cambio] of Object.entries(cambios)) todos[id] = { ...todos[id], ...cambio, actualizado };
  });
}

export function guardarCambio(id: string, cambios: CambiosConsulta): Promise<CambioLocal> {
  return modificar<CambioLocal, CambioLocal>(clavePorOrigen(COLECCION), (todos) => {
    const cambio: CambioLocal = { ...todos[id], ...cambios, actualizado: new Date().toISOString() };
    todos[id] = cambio;
    return cambio;
  });
}
