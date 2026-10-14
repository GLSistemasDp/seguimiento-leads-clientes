import "server-only";
import { backendActivo } from "@/lib/db/repositorio";
import type {
  ConteosEstado,
  FiltrosSolicitud,
  RepositorioSolicitudes,
  ResultadoUpsert,
  SolicitudImportada,
} from "@/lib/db/repositorio";
import type { Estado, Solicitud } from "@/types/solicitud";

/**
 * Punto unico de acceso a las solicitudes. Las pantallas y los route handlers
 * importan siempre de aca y no saben con que motor estan hablando.
 *
 * La implementacion se carga por import dinamico para que el motor inactivo
 * ni siquiera se evalue: con DB_BACKEND="sheets" nunca se toca Prisma, y al
 * reves tampoco se pide el token de Google.
 */
async function repo(): Promise<RepositorioSolicitudes> {
  switch (backendActivo()) {
    case "postgres":
      return (await import("@/lib/db/postgres/solicitudes")).default;
    case "demo":
      return (await import("@/lib/db/demo/solicitudes")).default;
    default:
      return (await import("@/lib/db/sheets/solicitudes")).default;
  }
}

export type {
  ConteosEstado,
  FiltrosSolicitud,
  ResultadoUpsert,
  SolicitudImportada,
} from "@/lib/db/repositorio";

export async function getAll(filtros: FiltrosSolicitud = {}): Promise<Solicitud[]> {
  return (await repo()).getAll(filtros);
}

export async function getById(id: string): Promise<Solicitud | null> {
  return (await repo()).getById(id);
}

export async function updateEstado(
  id: string,
  estado: Estado,
  usuarioDecisor?: string,
): Promise<Solicitud> {
  return (await repo()).updateEstado(id, estado, usuarioDecisor);
}

export async function upsertMany(
  solicitudes: readonly SolicitudImportada[],
): Promise<ResultadoUpsert> {
  return (await repo()).upsertMany(solicitudes);
}

export async function contarPorEstado(): Promise<ConteosEstado> {
  return (await repo()).contarPorEstado();
}
