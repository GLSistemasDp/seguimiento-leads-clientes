import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";

/**
 * Que formularios de reclamo ya abrio la gerencia. Un formulario es "nuevo"
 * hasta que alguien lo abre, le indica una accion o se responde.
 */

const COLECCION = "reclamos-vistos";

type Registro = { fecha: string };

export async function marcarVisto(id: string): Promise<void> {
  await modificar<Registro, void>(COLECCION, (datos) => {
    if (!datos[id]) datos[id] = { fecha: new Date().toISOString() };
  });
}

export async function getVistos(): Promise<ReadonlySet<string>> {
  return new Set(Object.keys(await leer<Registro>(COLECCION)));
}
