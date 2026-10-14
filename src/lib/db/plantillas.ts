import "server-only";
import { backendActivo } from "@/lib/db/repositorio";
import type { CambiosPlantilla, RepositorioPlantillas } from "@/lib/db/repositorio";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

/** Ver la nota de `@/lib/db/solicitudes`: misma estrategia de seleccion de motor. */
async function repo(): Promise<RepositorioPlantillas> {
  switch (backendActivo()) {
    case "postgres":
      return (await import("@/lib/db/postgres/plantillas")).default;
    case "demo":
      return (await import("@/lib/db/demo/plantillas")).default;
    default:
      return (await import("@/lib/db/sheets/plantillas")).default;
  }
}

export type { CambiosPlantilla } from "@/lib/db/repositorio";

export async function get(tipo: TipoPlantilla): Promise<PlantillaEmail> {
  return (await repo()).get(tipo);
}

export async function getAll(): Promise<PlantillaEmail[]> {
  return (await repo()).getAll();
}

export async function update(
  tipo: TipoPlantilla,
  cambios: CambiosPlantilla,
): Promise<PlantillaEmail> {
  return (await repo()).update(tipo, cambios);
}
