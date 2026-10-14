import "server-only";
import {
  agregarFilas,
  asegurarHoja,
  escribirRangos,
  leerRango,
  ultimaColumna,
} from "@/lib/db/sheets/cliente";
import type { FilaSheet } from "@/lib/db/sheets/cliente";
import { PLANTILLAS_POR_DEFECTO } from "@/lib/db/repositorio";
import type { CambiosPlantilla, RepositorioPlantillas } from "@/lib/db/repositorio";
import { esTipoPlantilla, TIPOS_PLANTILLA } from "@/types/plantilla";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

export const HOJA = "Plantillas";

/** Mismas columnas que el modelo PlantillaEmail de Prisma. */
export const ENCABEZADOS = [
  "id",
  "tipo",
  "asunto",
  "cuerpoHtml",
  "headerImg",
  "headerAlt",
  "footerImg",
  "footerAlt",
] as const;

const COLUMNAS = ultimaColumna(ENCABEZADOS.length);
const PRIMERA_FILA_DATOS = 2;

function aPlantilla(fila: FilaSheet): PlantillaEmail | null {
  const [id, tipo, asunto, cuerpoHtml, headerImg, headerAlt, footerImg, footerAlt] = fila;
  if (!id || !esTipoPlantilla(tipo)) return null;

  return {
    id,
    tipo,
    asunto: asunto ?? "",
    cuerpoHtml: cuerpoHtml ?? "",
    headerImg: headerImg || null,
    headerAlt: headerAlt || null,
    footerImg: footerImg || null,
    footerAlt: footerAlt || null,
  };
}

function aFila(plantilla: PlantillaEmail): FilaSheet {
  return [
    plantilla.id,
    plantilla.tipo,
    plantilla.asunto,
    plantilla.cuerpoHtml,
    plantilla.headerImg ?? "",
    plantilla.headerAlt ?? "",
    plantilla.footerImg ?? "",
    plantilla.footerAlt ?? "",
  ];
}

type PlantillaUbicada = {
  plantilla: PlantillaEmail;
  fila: number;
};

async function leerTodas(): Promise<PlantillaUbicada[]> {
  await asegurarHoja(HOJA, ENCABEZADOS);
  const filas = await leerRango(`${HOJA}!A${PRIMERA_FILA_DATOS}:${COLUMNAS}`);

  const ubicadas: PlantillaUbicada[] = [];
  filas.forEach((fila, indice) => {
    const plantilla = aPlantilla(fila);
    if (plantilla) {
      ubicadas.push({ plantilla, fila: indice + PRIMERA_FILA_DATOS });
    }
  });
  return ubicadas;
}

/**
 * Crea en la planilla las plantillas que falten, con el contenido por
 * defecto. Se llama antes de cualquier lectura, asi la hoja nunca queda vacia
 * y el equipo siempre tiene algo que editar.
 */
async function asegurarPlantillas(): Promise<PlantillaUbicada[]> {
  const existentes = await leerTodas();
  const presentes = new Set(existentes.map((ubicada) => ubicada.plantilla.tipo));
  const faltantes = TIPOS_PLANTILLA.filter((tipo) => !presentes.has(tipo));

  if (faltantes.length === 0) return existentes;

  await agregarFilas(
    HOJA,
    faltantes.map((tipo) =>
      aFila({ id: crypto.randomUUID(), ...PLANTILLAS_POR_DEFECTO[tipo] }),
    ),
  );

  return leerTodas();
}

export async function get(tipo: TipoPlantilla): Promise<PlantillaEmail> {
  const ubicada = (await asegurarPlantillas()).find(
    (item) => item.plantilla.tipo === tipo,
  );
  if (!ubicada) {
    throw new Error(`No se pudo crear ni encontrar la plantilla "${tipo}"`);
  }
  return ubicada.plantilla;
}

export async function getAll(): Promise<PlantillaEmail[]> {
  const ubicadas = await asegurarPlantillas();
  // Orden fijo (aprobado, rechazado) para que las tabs no bailen.
  return TIPOS_PLANTILLA.map((tipo) => {
    const ubicada = ubicadas.find((item) => item.plantilla.tipo === tipo);
    if (!ubicada) {
      throw new Error(`No se pudo crear ni encontrar la plantilla "${tipo}"`);
    }
    return ubicada.plantilla;
  });
}

export async function update(
  tipo: TipoPlantilla,
  cambios: CambiosPlantilla,
): Promise<PlantillaEmail> {
  const ubicada = (await asegurarPlantillas()).find((item) => item.plantilla.tipo === tipo);
  if (!ubicada) {
    throw new Error(`No existe la plantilla "${tipo}"`);
  }

  const actualizada: PlantillaEmail = { ...ubicada.plantilla, ...cambios };
  await escribirRangos([
    {
      rango: `${HOJA}!A${ubicada.fila}:${COLUMNAS}${ubicada.fila}`,
      valores: [aFila(actualizada)],
    },
  ]);

  return actualizada;
}

const repositorio: RepositorioPlantillas = { get, getAll, update };

export default repositorio;
