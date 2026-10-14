import "server-only";
import { prisma } from "@/lib/db/postgres/cliente";
import { PLANTILLAS_POR_DEFECTO } from "@/lib/db/repositorio";
import type { CambiosPlantilla, RepositorioPlantillas } from "@/lib/db/repositorio";
import { esTipoPlantilla, TIPOS_PLANTILLA } from "@/types/plantilla";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

type FilaPrisma = {
  id: string;
  tipo: string;
  asunto: string;
  cuerpoHtml: string;
  headerImg: string | null;
  headerAlt: string | null;
  footerImg: string | null;
  footerAlt: string | null;
};

function aPlantilla(fila: FilaPrisma): PlantillaEmail {
  if (!esTipoPlantilla(fila.tipo)) {
    throw new Error(`Tipo de plantilla desconocido en la base: "${fila.tipo}"`);
  }
  return { ...fila, tipo: fila.tipo };
}

/** Devuelve la plantilla del tipo pedido, creandola con el default si falta. */
export async function get(tipo: TipoPlantilla): Promise<PlantillaEmail> {
  const existente = await prisma().plantillaEmail.findUnique({ where: { tipo } });
  if (existente) return aPlantilla(existente);

  return aPlantilla(
    await prisma().plantillaEmail.create({ data: PLANTILLAS_POR_DEFECTO[tipo] }),
  );
}

export async function getAll(): Promise<PlantillaEmail[]> {
  // Orden fijo (aprobado, rechazado) para que las tabs no bailen.
  return Promise.all(TIPOS_PLANTILLA.map((tipo) => get(tipo)));
}

export async function update(
  tipo: TipoPlantilla,
  cambios: CambiosPlantilla,
): Promise<PlantillaEmail> {
  await get(tipo);
  return aPlantilla(
    await prisma().plantillaEmail.update({ where: { tipo }, data: cambios }),
  );
}

const repositorio: RepositorioPlantillas = { get, getAll, update };

export default repositorio;
