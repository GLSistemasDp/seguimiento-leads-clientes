import "server-only";
import { prisma } from "@/lib/db/postgres/cliente";
import type {
  ConteosEstado,
  FiltrosSolicitud,
  RepositorioSolicitudes,
  ResultadoUpsert,
  SolicitudImportada,
} from "@/lib/db/repositorio";
import { esEstado } from "@/types/solicitud";
import type { DatosSolicitud, Estado, Solicitud } from "@/types/solicitud";

/**
 * Implementacion sobre Postgres. Todavia no es la activa (el MVP arranca con
 * Google Sheets), pero cumple el mismo contrato: para migrar alcanza con
 * poner DB_BACKEND="postgres" y correr las migraciones.
 */

type FilaPrisma = {
  id: string;
  nombre: string;
  email: string;
  datos: unknown;
  estado: string;
  fechaImportacion: Date;
  fechaDecision: Date | null;
  usuarioDecisor: string | null;
};

function aSolicitud(fila: FilaPrisma): Solicitud {
  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    datos: (fila.datos ?? {}) as DatosSolicitud,
    estado: esEstado(fila.estado) ? fila.estado : "PENDIENTE",
    fechaImportacion: fila.fechaImportacion,
    fechaDecision: fila.fechaDecision,
    usuarioDecisor: fila.usuarioDecisor,
  };
}

export async function getAll(filtros: FiltrosSolicitud = {}): Promise<Solicitud[]> {
  const busqueda = filtros.busqueda?.trim();
  const filas = await prisma().solicitud.findMany({
    where: {
      estado: filtros.estado,
      ...(busqueda
        ? {
            OR: [
              { nombre: { contains: busqueda, mode: "insensitive" as const } },
              { email: { contains: busqueda, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { fechaImportacion: "desc" },
  });
  return filas.map(aSolicitud);
}

export async function getById(id: string): Promise<Solicitud | null> {
  const fila = await prisma().solicitud.findUnique({ where: { id } });
  return fila ? aSolicitud(fila) : null;
}

export async function updateEstado(
  id: string,
  estado: Estado,
  usuarioDecisor?: string,
): Promise<Solicitud> {
  const decidida = estado !== "PENDIENTE";
  const fila = await prisma().solicitud.update({
    where: { id },
    data: {
      estado,
      fechaDecision: decidida ? new Date() : null,
      usuarioDecisor: decidida ? (usuarioDecisor ?? null) : null,
    },
  });
  return aSolicitud(fila);
}

export async function upsertMany(
  solicitudes: readonly SolicitudImportada[],
): Promise<ResultadoUpsert> {
  let creadas = 0;
  let actualizadas = 0;

  for (const solicitud of solicitudes) {
    const existente = await prisma().solicitud.findUnique({
      where: { email: solicitud.email },
      select: { id: true },
    });

    if (existente) {
      // Refresca nombre y datos, pero nunca el estado ya decidido.
      await prisma().solicitud.update({
        where: { email: solicitud.email },
        data: { nombre: solicitud.nombre, datos: solicitud.datos },
      });
      actualizadas += 1;
    } else {
      await prisma().solicitud.create({
        data: {
          nombre: solicitud.nombre,
          email: solicitud.email,
          datos: solicitud.datos,
        },
      });
      creadas += 1;
    }
  }

  return { creadas, actualizadas };
}

export async function contarPorEstado(): Promise<ConteosEstado> {
  const grupos = await prisma().solicitud.groupBy({
    by: ["estado"],
    _count: { _all: true },
  });

  const conteos: ConteosEstado = {
    TODAS: 0,
    PENDIENTE: 0,
    APROBADO: 0,
    RECHAZADO: 0,
  };

  for (const grupo of grupos) {
    if (!esEstado(grupo.estado)) continue;
    conteos[grupo.estado] = grupo._count._all;
    conteos.TODAS += grupo._count._all;
  }
  return conteos;
}

const repositorio: RepositorioSolicitudes = {
  getAll,
  getById,
  updateEstado,
  upsertMany,
  contarPorEstado,
};

export default repositorio;
