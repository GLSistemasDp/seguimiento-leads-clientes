import "server-only";
import { backendActivo } from "@/lib/db/repositorio";
import type { Backend, RepositorioSeguimiento } from "@/lib/db/repositorio";
import { RESPUESTAS } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import type { CambiosConsulta, Consulta, Relacion, Resultado } from "@/types/seguimiento";

/**
 * Punto unico de acceso al seguimiento de clientes. Con DB_BACKEND="demo"
 * usa datos de ejemplo; con "sheets" lee la planilla del equipo de atencion
 * (SEGUIMIENTO_SHEETS_ID); con "postgres" la cola que carga el bot
 * (consultas_seguimiento, ver db/schema.sql).
 *
 * SEGUIMIENTO_BACKEND permite que el seguimiento use la planilla aunque el
 * resto de la app siga en demo (o al reves).
 */
export function backendSeguimiento(): Backend {
  const valor = process.env.SEGUIMIENTO_BACKEND;
  return valor === "demo" || valor === "sheets" || valor === "postgres" ? valor : backendActivo();
}

async function repo(): Promise<RepositorioSeguimiento> {
  switch (backendSeguimiento()) {
    case "demo":
      return (await import("@/lib/db/demo/seguimiento")).default;
    case "postgres":
      return (await import("@/lib/db/postgres/seguimiento")).default;
    default:
      return (await import("@/lib/db/sheets/seguimiento")).default;
  }
}

export async function getAll(): Promise<Consulta[]> {
  return (await repo()).getAll();
}

export async function getById(id: string): Promise<Consulta | null> {
  return (await repo()).getById(id);
}

export async function update(
  id: string,
  cambios: CambiosConsulta,
  cierre?: { resultado: Resultado | null; relacion: Relacion | null },
): Promise<Consulta> {
  return (await repo()).update(id, cambios, cierre);
}

/**
 * Para el tablero del Resumen. Con Postgres la cola solo guarda lo reciente:
 * se le suma lo ya archivado en el historial.
 */
export async function getParaTablero(): Promise<Consulta[]> {
  if (backendSeguimiento() === "postgres") return (await import("@/lib/db/postgres/seguimiento")).getParaTablero();
  return getAll();
}

/** Respuestas tipo de la planilla; si no hay, las que trae la app. */
export async function getRespuestas(): Promise<readonly RespuestaTipo[]> {
  const repositorio = await repo();
  const propias = await repositorio.getRespuestas?.().catch(() => []);
  return propias && propias.length > 0 ? propias : RESPUESTAS;
}

/** Donde terminan los tildes y observaciones que se hacen desde la app. */
export function origenSeguimiento(): { destino: string; aviso: string | null } {
  if (backendSeguimiento() === "demo") {
    return { destino: "la demo", aviso: null };
  }
  if (backendSeguimiento() === "postgres") {
    return { destino: "la base de datos", aviso: null };
  }
  if (process.env.SEGUIMIENTO_ACCESO === "publico") {
    return {
      destino: "la app",
      aviso:
        "Planilla de test leida por su link publico (se actualiza cada minuto). Lo que se finaliza desde aca queda guardado en la app, no en la planilla, hasta configurar la service account.",
    };
  }
  return { destino: "la planilla", aviso: null };
}
