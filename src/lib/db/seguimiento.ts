import "server-only";
import { cache } from "react";
import { conUltimaGestion, estadoCuentaUnificado } from "@/lib/clientes/ficha";
import { claveCliente } from "@/lib/db/sheets/maestros";
import { postgresConfigurado } from "@/lib/db/postgres/pg";
import { backendActivo } from "@/lib/db/repositorio";
import type { Backend, RepositorioSeguimiento } from "@/lib/db/repositorio";
import { RESPUESTAS } from "@/lib/seguimiento/respuestas";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import type { CambiosConsulta, Consulta, FichaCliente, Relacion, Resultado } from "@/types/seguimiento";

export type CierreVarias = { consulta: Consulta; relacion: Relacion };

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

/**
 * Todas las consultas. Memorizada por pedido (React.cache): el menu, la pagina
 * y el panel de reclamos la piden en la misma carga y se lee una sola vez.
 */
export const getAll = cache(async (): Promise<Consulta[]> => {
  const [consultas, gestiones] = await Promise.all([
    (await repo()).getAll(),
    backendSeguimiento() === "postgres"
      ? Promise.resolve(null)
      : import("@/lib/db/historial").then(({ ultimasGestiones }) => ultimasGestiones()),
  ]);
  if (!gestiones) return consultas;
  return consultas.map((consulta) => ({
    ...consulta,
    ficha: consulta.ficha ? conUltimaGestion(consulta.ficha, gestiones[claveCliente(consulta.cliente)]) : consulta.ficha,
  }));
});

export async function getById(id: string): Promise<Consulta | null> {
  const consulta = await (await repo()).getById(id);
  if (!consulta?.ficha || backendSeguimiento() === "postgres") return consulta;
  const { ultimasGestiones } = await import("@/lib/db/historial");
  const gestiones = await ultimasGestiones();
  return { ...consulta, ficha: conUltimaGestion(consulta.ficha, gestiones[claveCliente(consulta.cliente)]) };
}

export async function update(
  id: string,
  cambios: CambiosConsulta,
  cierre?: { resultado: Resultado | null; relacion: Relacion | null },
): Promise<Consulta> {
  return (await repo()).update(id, cambios, cierre);
}

/**
 * Finaliza varias consultas de una vez (cierre masivo) con el mismo resultado
 * y observacion, y deja cada cierre en el historial. Escribe en bloque: una
 * sentencia en Postgres, una escritura en el almacen o un pedido a la planilla.
 * Devuelve cuantas se cerraron.
 */
export async function finalizarVarias(
  cierres: readonly CierreVarias[],
  resultado: Resultado,
  observacion: string,
): Promise<number> {
  if (cierres.length === 0) return 0;
  // Como en el cierre de a una: el resultado al frente de la observacion.
  const observaciones = `${resultado} · ${observacion}`;
  const backend = backendSeguimiento();

  if (backend === "postgres") {
    const pg = await import("@/lib/db/postgres/seguimiento");
    return pg.finalizarVarias(
      cierres.map(({ consulta, relacion }) => ({ id: consulta.id, relacion })),
      resultado,
      observaciones,
    );
  }

  let cerradas = cierres.length;
  if (backend === "sheets") {
    const sheets = await import("@/lib/db/sheets/seguimiento");
    cerradas = await sheets.updateVarias(
      Object.fromEntries(cierres.map(({ consulta }) => [consulta.id, { respondida: true, observaciones }])),
    );
  } else {
    const repositorio = await repo();
    for (const { consulta, relacion } of cierres) {
      await repositorio.update(consulta.id, { respondida: true, observaciones }, { resultado, relacion });
    }
  }

  const { registrarVarios } = await import("@/lib/db/historial");
  await registrarVarios(
    cierres.map(({ consulta, relacion }) => ({
      consultaId: consulta.id,
      // Con la fecha de la consulta: en la ficha queda cuando fue la charla y
      // el resumen del dia no lo cuenta como un cierre de hoy.
      fecha: consulta.fecha?.toISOString(),
      cliente: consulta.cliente,
      hito: consulta.hito,
      tipo: "finalizada" as const,
      resultado,
      relacion,
      observacion,
      consulta: consulta.consulta,
      encargado: consulta.encargado,
      resumen: consulta.ia?.resumen,
    })),
  );
  return cerradas;
}

/**
 * Para el tablero del Resumen. Con Postgres la cola solo guarda lo reciente:
 * se le suma lo ya archivado en el historial.
 */
export const getParaTablero = cache(async (): Promise<Consulta[]> => {
  if (backendSeguimiento() === "postgres") return (await import("@/lib/db/postgres/seguimiento")).getParaTablero();
  return getAll();
});

/**
 * Ficha de un cliente por su codigo (o nombre): con Postgres sale de la
 * tabla clientes; si no, de la planilla (la ficha que trae cualquier consulta).
 */
export async function fichaDeCliente(clave: string): Promise<FichaCliente | null> {
  if (backendSeguimiento() === "postgres") return (await import("@/lib/db/postgres/seguimiento")).fichaDeCliente(clave);
  let ficha: FichaCliente | null;
  if (backendSeguimiento() === "sheets") {
    ficha = await (await import("@/lib/db/sheets/seguimiento")).fichaDeCliente(clave);
  } else {
    const buscada = claveCliente(clave);
    const consulta = (await getAll()).find((item) => claveCliente(item.cliente) === buscada || claveCliente(item.ficha?.nombre ?? "") === buscada);
    ficha = consulta?.ficha ?? null;
  }
  if (!ficha) return null;
  const { ultimasGestiones } = await import("@/lib/db/historial");
  const gestiones = await ultimasGestiones();
  const estado = estadoCuentaUnificado(ficha.situacion, ficha.deuda);
  return conUltimaGestion({ ...ficha, situacion: estado, deuda: estado }, gestiones[ficha.codigo || claveCliente(ficha.nombre)]);
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
        "Planilla leida por su link publico (se actualiza cada minuto). Lo que se finaliza desde aca queda guardado en la app, no en la planilla, hasta configurar la service account.",
    };
  }
  return { destino: "la planilla", aviso: null };
}
