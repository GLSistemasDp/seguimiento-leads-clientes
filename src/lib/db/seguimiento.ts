import "server-only";
import { backendActivo } from "@/lib/db/repositorio";
import type { Backend, RepositorioSeguimiento } from "@/lib/db/repositorio";
import { RESPUESTAS } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import type { CambiosConsulta, Consulta } from "@/types/seguimiento";

/**
 * Punto unico de acceso al seguimiento de clientes. Con DB_BACKEND="demo"
 * usa datos de ejemplo; con "sheets" lee la planilla del equipo de atencion
 * (SEGUIMIENTO_SHEETS_ID). Postgres todavia no tiene tabla de seguimiento.
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
      throw new Error(
        'El seguimiento de clientes todavia no esta disponible con DB_BACKEND="postgres".',
      );
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

export async function update(id: string, cambios: CambiosConsulta): Promise<Consulta> {
  return (await repo()).update(id, cambios);
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
  if (process.env.SEGUIMIENTO_ACCESO === "publico") {
    return {
      destino: "la app",
      aviso:
        "Planilla de test leida por su link publico (se actualiza cada minuto). Lo que se finaliza desde aca queda guardado en la app, no en la planilla, hasta configurar la service account.",
    };
  }
  return { destino: "la planilla", aviso: null };
}
