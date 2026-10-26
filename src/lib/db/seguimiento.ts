import "server-only";
import { postgresConfigurado } from "@/lib/db/postgres/pg";
import { backendActivo } from "@/lib/db/repositorio";
import type { Backend, RepositorioSeguimiento } from "@/lib/db/repositorio";
import { RESPUESTAS } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import type { CambiosConsulta, Consulta, FichaCliente, Relacion, Resultado } from "@/types/seguimiento";

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
  const elegido = valor === "demo" || valor === "sheets" || valor === "postgres" ? valor : backendActivo();
  // Sin base configurada no se puede usar la cola: se sigue con la planilla
  // (o la demo) y la pantalla avisa, en vez de romper todas las paginas.
  if (elegido === "postgres" && !postgresConfigurado()) return process.env.SEGUIMIENTO_SHEETS_ID ? "sheets" : "demo";
  return elegido;
}

/** Se pidio Postgres pero falta DATABASE_URL (en Vercel, para ese entorno). */
function postgresSinBase(): boolean {
  return process.env.SEGUIMIENTO_BACKEND === "postgres" && !postgresConfigurado();
}

/** Problema de configuracion para mostrar arriba del seguimiento, o null. */
export function avisoConfiguracion(): string | null {
  return postgresSinBase() ? origenSeguimiento().aviso : null;
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

/**
 * Ficha de un cliente por su codigo (o nombre): con Postgres sale de la
 * tabla clientes; si no, de la planilla (la ficha que trae cualquier consulta).
 */
export async function fichaDeCliente(clave: string): Promise<FichaCliente | null> {
  if (backendSeguimiento() === "postgres") return (await import("@/lib/db/postgres/seguimiento")).fichaDeCliente(clave);
  const buscado = clave.trim().toUpperCase();
  const consulta = (await getAll()).find((item) => {
    const codigo = item.cliente.match(/^\s*(\d+)\s*-/)?.[1] ?? "";
    return item.ficha && (codigo === buscado || item.ficha.nombre.toUpperCase() === buscado || item.cliente.toUpperCase() === buscado);
  });
  return consulta?.ficha ?? null;
}

/** Respuestas tipo de la planilla; si no hay, las que trae la app. */
export async function getRespuestas(): Promise<readonly RespuestaTipo[]> {
  const repositorio = await repo();
  const propias = await repositorio.getRespuestas?.().catch(() => []);
  return propias && propias.length > 0 ? propias : RESPUESTAS;
}

/** Donde terminan los tildes y observaciones que se hacen desde la app. */
export function origenSeguimiento(): { destino: string; aviso: string | null } {
  if (postgresSinBase()) {
    return {
      destino: backendSeguimiento() === "demo" ? "la demo" : "la app",
      aviso:
        'SEGUIMIENTO_BACKEND="postgres" pero falta DATABASE_URL en este entorno: se muestra la planilla. En Vercel, habilitá DATABASE_URL también para Preview y volvé a desplegar.',
    };
  }
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
