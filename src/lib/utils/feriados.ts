import "server-only";
import { FERIADOS_RESPALDO, registrarFeriados, type Feriado } from "@/lib/utils/dias-habiles";

/**
 * Dias habiles en Argentina: lunes a viernes que no sean feriado nacional.
 *
 * Los feriados salen de https://api.argentinadatos.com/v1/feriados/{anio}.
 * Si la API no responde se usa la lista de respaldo del anio. Los "puentes
 * turisticos" (tipo "puente") no son feriados: por defecto cuentan como
 * habiles, porque para la actividad privada son optativos.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const API = "https://api.argentinadatos.com/v1/feriados";
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

export type { Feriado };

const RESPALDO = FERIADOS_RESPALDO;

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const FORMATO_SEMANA = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short" });
const SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-20" y el dia de la semana (0 = domingo) en hora de Argentina. */
export function fechaArgentina(fecha: Date): { dia: string; diaSemana: number; anio: number } {
  const dia = FORMATO_DIA.format(fecha);
  return { dia, diaSemana: SEMANA.indexOf(FORMATO_SEMANA.format(fecha)), anio: Number(dia.slice(0, 4)) };
}

type Cache = { feriados: Feriado[]; leido: number };
const almacen = globalThis as typeof globalThis & { __feriadosAR?: Map<number, Cache> };

function esFeriado(valor: unknown): valor is Feriado {
  const item = valor as Record<string, unknown>;
  return typeof item?.fecha === "string" && typeof item.tipo === "string" && typeof item.nombre === "string";
}

export type FuenteFeriados = "api" | "respaldo" | "sin-datos";

/** Feriados del anio: de la API (con cache de 12 h) o, si falla, del respaldo. */
export async function feriadosDe(anio: number): Promise<{ feriados: Feriado[]; fuente: FuenteFeriados }> {
  const cache = (almacen.__feriadosAR ??= new Map());
  const previo = cache.get(anio);
  if (previo && Date.now() - previo.leido < VIGENCIA_MS) return { feriados: previo.feriados, fuente: "api" };

  try {
    const respuesta = await fetch(`${API}/${anio}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos: unknown = await respuesta.json();
    if (!Array.isArray(datos) || !datos.every(esFeriado)) throw new Error("respuesta con formato inesperado");
    cache.set(anio, { feriados: datos, leido: Date.now() });
    return { feriados: datos, fuente: "api" };
  } catch (error) {
    console.warn(
      `[feriados] No se pudo consultar ${API}/${anio} (${error instanceof Error ? error.message : String(error)}); se usa el respaldo.`,
    );
    const respaldo = RESPALDO[anio];
    return respaldo ? { feriados: respaldo, fuente: "respaldo" } : { feriados: [], fuente: "sin-datos" };
  }
}

export type DiaHabil =
  | { habil: true; dia: string; fuente: FuenteFeriados }
  | { habil: false; dia: string; motivo: string; fuente: FuenteFeriados | null };

/** Si la fecha es dia habil en Argentina y, si no lo es, por que. */
export async function diaHabil(fecha = new Date(), { puentesNoLaborables = false } = {}): Promise<DiaHabil> {
  const { dia, diaSemana, anio } = fechaArgentina(fecha);
  if (diaSemana === 0 || diaSemana === 6) return { habil: false, dia, motivo: "fin de semana", fuente: null };

  const { feriados, fuente } = await feriadosDe(anio);
  const feriado = feriados.find(
    (item) => item.fecha === dia && (puentesNoLaborables || item.tipo !== "puente"),
  );
  return feriado ? { habil: false, dia, motivo: `feriado: ${feriado.nombre}`, fuente } : { habil: true, dia, fuente };
}

/**
 * Trae los feriados de este anio y el anterior (API, con respaldo) y los suma
 * a la cuenta de dias habiles (businessDaysSince). Llamarla al empezar las
 * paginas que muestran demoras; si la API no responde queda el respaldo.
 */
export async function prepararFeriados(ahora = new Date()): Promise<void> {
  const anio = fechaArgentina(ahora).anio;
  const listas = await Promise.all([anio - 1, anio].map((cada) => feriadosDe(cada).catch(() => null)));
  for (const lista of listas) if (lista) registrarFeriados(lista.feriados);
}
