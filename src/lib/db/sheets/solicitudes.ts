import "server-only";
import {
  agregarFilas,
  asegurarHoja,
  escribirRangos,
  leerRango,
  ultimaColumna,
} from "@/lib/db/sheets/cliente";
import type { FilaSheet } from "@/lib/db/sheets/cliente";
import {
  contarLista,
  filtrarEnMemoria,
} from "@/lib/db/repositorio";
import type {
  ConteosEstado,
  FiltrosSolicitud,
  RepositorioSolicitudes,
  ResultadoUpsert,
  SolicitudImportada,
} from "@/lib/db/repositorio";
import { esEstado } from "@/types/solicitud";
import type { DatosSolicitud, Estado, Solicitud } from "@/types/solicitud";

export const HOJA = "Solicitudes";

/**
 * Columnas de la hoja, en orden. Son las mismas del modelo Prisma para que
 * migrar a Postgres sea una copia directa, columna por columna.
 */
export const ENCABEZADOS = [
  "id",
  "nombre",
  "email",
  "datos",
  "estado",
  "fechaImportacion",
  "fechaDecision",
  "usuarioDecisor",
] as const;

const COLUMNAS = ultimaColumna(ENCABEZADOS.length);

/** La fila 1 son los encabezados, asi que los datos arrancan en la 2. */
const PRIMERA_FILA_DATOS = 2;

function parsearDatos(celda: string): DatosSolicitud {
  if (!celda) return {};
  try {
    const parseado: unknown = JSON.parse(celda);
    if (parseado && typeof parseado === "object" && !Array.isArray(parseado)) {
      return parseado as DatosSolicitud;
    }
  } catch {
    // Si alguien edito la celda a mano y rompio el JSON, preferimos mostrar
    // la solicitud sin datos extra antes que hacer fallar todo el listado.
  }
  return {};
}

function parsearFecha(celda: string): Date | null {
  if (!celda) return null;
  const fecha = new Date(celda);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function aSolicitud(fila: FilaSheet): Solicitud | null {
  const [id, nombre, email, datos, estado, importacion, decision, decisor] = fila;
  if (!id || !email) return null;

  return {
    id,
    nombre: nombre ?? "",
    email,
    datos: parsearDatos(datos ?? ""),
    estado: esEstado(estado) ? estado : "PENDIENTE",
    fechaImportacion: parsearFecha(importacion ?? "") ?? new Date(0),
    fechaDecision: parsearFecha(decision ?? ""),
    usuarioDecisor: decisor || null,
  };
}

function aFila(solicitud: Solicitud): FilaSheet {
  return [
    solicitud.id,
    solicitud.nombre,
    solicitud.email,
    JSON.stringify(solicitud.datos),
    solicitud.estado,
    solicitud.fechaImportacion.toISOString(),
    solicitud.fechaDecision?.toISOString() ?? "",
    solicitud.usuarioDecisor ?? "",
  ];
}

type SolicitudUbicada = {
  solicitud: Solicitud;
  /** Numero de fila en la planilla, para poder escribir sobre ella. */
  fila: number;
};

/**
 * Sheets no sabe filtrar ni ordenar por nosotros, asi que cada operacion lee
 * la hoja completa. Con el volumen de altas del equipo comercial (cientos de
 * filas) es de sobra; si algun dia son decenas de miles, ese es justamente el
 * momento de pasar a Postgres cambiando DB_BACKEND.
 */
async function leerTodas(): Promise<SolicitudUbicada[]> {
  await asegurarHoja(HOJA, ENCABEZADOS);
  const filas = await leerRango(`${HOJA}!A${PRIMERA_FILA_DATOS}:${COLUMNAS}`);

  const ubicadas: SolicitudUbicada[] = [];
  filas.forEach((fila, indice) => {
    const solicitud = aSolicitud(fila);
    if (solicitud) {
      ubicadas.push({ solicitud, fila: indice + PRIMERA_FILA_DATOS });
    }
  });
  return ubicadas;
}

function ordenarPorImportacion(solicitudes: Solicitud[]): Solicitud[] {
  return [...solicitudes].sort(
    (a, b) => b.fechaImportacion.getTime() - a.fechaImportacion.getTime(),
  );
}

export async function getAll(filtros: FiltrosSolicitud = {}): Promise<Solicitud[]> {
  const todas = (await leerTodas()).map((ubicada) => ubicada.solicitud);
  return ordenarPorImportacion(filtrarEnMemoria(todas, filtros));
}

export async function getById(id: string): Promise<Solicitud | null> {
  const encontrada = (await leerTodas()).find((ubicada) => ubicada.solicitud.id === id);
  return encontrada?.solicitud ?? null;
}

export async function updateEstado(
  id: string,
  estado: Estado,
  usuarioDecisor?: string,
): Promise<Solicitud> {
  const ubicada = (await leerTodas()).find((item) => item.solicitud.id === id);
  if (!ubicada) {
    throw new Error(`No existe la solicitud ${id}`);
  }

  const decidida = estado !== "PENDIENTE";
  const actualizada: Solicitud = {
    ...ubicada.solicitud,
    estado,
    fechaDecision: decidida ? new Date() : null,
    usuarioDecisor: decidida ? (usuarioDecisor ?? null) : null,
  };

  await escribirRangos([
    {
      rango: `${HOJA}!A${ubicada.fila}:${COLUMNAS}${ubicada.fila}`,
      valores: [aFila(actualizada)],
    },
  ]);

  return actualizada;
}

export async function upsertMany(
  solicitudes: readonly SolicitudImportada[],
): Promise<ResultadoUpsert> {
  const existentes = await leerTodas();
  const porEmail = new Map(
    existentes.map((ubicada) => [ubicada.solicitud.email, ubicada] as const),
  );

  const cambios: { rango: string; valores: FilaSheet[] }[] = [];
  const nuevas: FilaSheet[] = [];

  for (const importada of solicitudes) {
    const ubicada = porEmail.get(importada.email);

    if (ubicada) {
      // Refresca nombre y datos, pero nunca la decision ya tomada.
      const actualizada: Solicitud = {
        ...ubicada.solicitud,
        nombre: importada.nombre,
        datos: importada.datos,
      };
      cambios.push({
        rango: `${HOJA}!A${ubicada.fila}:${COLUMNAS}${ubicada.fila}`,
        valores: [aFila(actualizada)],
      });
      continue;
    }

    nuevas.push(
      aFila({
        id: crypto.randomUUID(),
        nombre: importada.nombre,
        email: importada.email,
        datos: importada.datos,
        estado: "PENDIENTE",
        fechaImportacion: new Date(),
        fechaDecision: null,
        usuarioDecisor: null,
      }),
    );
  }

  await escribirRangos(cambios);
  await agregarFilas(HOJA, nuevas);

  return { creadas: nuevas.length, actualizadas: cambios.length };
}

export async function contarPorEstado(): Promise<ConteosEstado> {
  return contarLista((await leerTodas()).map((ubicada) => ubicada.solicitud));
}

const repositorio: RepositorioSolicitudes = {
  getAll,
  getById,
  updateEstado,
  upsertMany,
  contarPorEstado,
};

export default repositorio;
