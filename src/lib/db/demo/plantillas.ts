import "server-only";
import { PLANTILLAS_POR_DEFECTO } from "@/lib/db/repositorio";
import type { CambiosPlantilla, RepositorioPlantillas } from "@/lib/db/repositorio";
import { TIPOS_PLANTILLA } from "@/types/plantilla";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

/** Plantillas en memoria para la demo. Ver la nota de `./solicitudes`. */

const almacen = globalThis as typeof globalThis & {
  __demoPlantillas?: Record<TipoPlantilla, PlantillaEmail>;
};

function todas(): Record<TipoPlantilla, PlantillaEmail> {
  almacen.__demoPlantillas ??= {
    aprobado: { id: crypto.randomUUID(), ...PLANTILLAS_POR_DEFECTO.aprobado },
    rechazado: { id: crypto.randomUUID(), ...PLANTILLAS_POR_DEFECTO.rechazado },
  };
  return almacen.__demoPlantillas;
}

export async function get(tipo: TipoPlantilla): Promise<PlantillaEmail> {
  return { ...todas()[tipo] };
}

export async function getAll(): Promise<PlantillaEmail[]> {
  return TIPOS_PLANTILLA.map((tipo) => ({ ...todas()[tipo] }));
}

export async function update(
  tipo: TipoPlantilla,
  cambios: CambiosPlantilla,
): Promise<PlantillaEmail> {
  const plantillas = todas();
  plantillas[tipo] = { ...plantillas[tipo], ...cambios };
  return { ...plantillas[tipo] };
}

const repositorio: RepositorioPlantillas = { get, getAll, update };

export default repositorio;
