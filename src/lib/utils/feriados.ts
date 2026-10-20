import "server-only";

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

export type Feriado = { fecha: string; tipo: string; nombre: string };

/** Respaldo 2026, copiado de la API (inamovibles, trasladables y puentes). */
const RESPALDO: Record<number, Feriado[]> = {
  2026: [
    { fecha: "2026-01-01", tipo: "inamovible", nombre: "Año nuevo" },
    { fecha: "2026-02-16", tipo: "inamovible", nombre: "Carnaval" },
    { fecha: "2026-02-17", tipo: "inamovible", nombre: "Carnaval" },
    { fecha: "2026-03-23", tipo: "puente", nombre: "Puente turístico no laborable" },
    { fecha: "2026-03-24", tipo: "inamovible", nombre: "Día Nacional de la Memoria por la Verdad y la Justicia" },
    { fecha: "2026-04-02", tipo: "inamovible", nombre: "Día del Veterano y de los Caídos en la Guerra de Malvinas" },
    { fecha: "2026-04-03", tipo: "inamovible", nombre: "Viernes Santo" },
    { fecha: "2026-05-01", tipo: "inamovible", nombre: "Día del Trabajador" },
    { fecha: "2026-05-25", tipo: "inamovible", nombre: "Día de la Revolución de Mayo" },
    { fecha: "2026-06-15", tipo: "trasladable", nombre: "Paso a la Inmortalidad del General Martín Güemes (17/6)" },
    { fecha: "2026-06-20", tipo: "inamovible", nombre: "Paso a la Inmortalidad del General Manuel Belgrano" },
    { fecha: "2026-07-09", tipo: "inamovible", nombre: "Día de la Independencia" },
    { fecha: "2026-07-10", tipo: "puente", nombre: "Puente turístico no laborable" },
    { fecha: "2026-08-17", tipo: "trasladable", nombre: "Paso a la Inmortalidad del Gral. José de San Martín" },
    { fecha: "2026-10-12", tipo: "trasladable", nombre: "Día del Respeto a la Diversidad Cultural" },
    { fecha: "2026-11-09", tipo: "inamovible", nombre: "Visita del papa León XIV" },
    { fecha: "2026-11-23", tipo: "trasladable", nombre: "Día de la Soberanía Nacional (20/11)" },
    { fecha: "2026-12-07", tipo: "puente", nombre: "Puente turístico no laborable" },
    { fecha: "2026-12-08", tipo: "inamovible", nombre: "Día de la Inmaculada Concepción de María" },
    { fecha: "2026-12-25", tipo: "inamovible", nombre: "Navidad" },
  ],
};

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
