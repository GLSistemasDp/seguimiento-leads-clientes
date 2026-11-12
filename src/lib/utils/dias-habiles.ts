/**
 * Dias habiles en Argentina (lunes a viernes, sin feriados nacionales). Es la
 * UNICA cuenta de demora del CRM: tarjetas, columna "demora" de la tabla,
 * prioridad y ficha del cliente usan `businessDaysSince`.
 *
 * Es sincronica y sirve en el servidor y en el navegador: arranca con la
 * lista de respaldo y el servidor le suma los feriados que trae de la API
 * (`registrarFeriados`, en lib/utils/feriados).
 */

const ZONA = "America/Argentina/Buenos_Aires";

export type Feriado = { fecha: string; tipo: string; nombre: string };

/** Respaldo 2026, copiado de la API (inamovibles, trasladables y puentes). */
export const FERIADOS_RESPALDO: Record<number, Feriado[]> = {
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

/** Los puentes turisticos son optativos para la actividad privada: cuentan como habiles. */
function noLaborables(feriados: readonly Feriado[]): string[] {
  return feriados.filter((feriado) => feriado.tipo !== "puente").map((feriado) => feriado.fecha);
}

const conocidos = new Set<string>(Object.values(FERIADOS_RESPALDO).flatMap(noLaborables));

/** Suma feriados (los de la API) a los que ya se conocen. */
export function registrarFeriados(feriados: readonly Feriado[]): void {
  for (const fecha of noLaborables(feriados)) conocidos.add(fecha);
}

/** Feriados no laborables conocidos, como "2026-11-23". */
export function feriadosConocidos(): ReadonlySet<string> {
  return conocidos;
}

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11-12" en hora de Argentina. */
export function diaArgentina(fecha: Date): string {
  return FORMATO_DIA.format(fecha);
}

function diaSiguiente(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Dias habiles que pasaron desde el dia de `desde` hasta el dia de `hasta`
 * (hora de Argentina). El mismo dia es 0; de viernes a lunes, 1. Nunca es
 * negativo.
 */
export function businessDaysSince(
  desde: Date,
  hasta: Date = new Date(),
  feriados: ReadonlySet<string> = conocidos,
): number {
  const fin = diaArgentina(hasta);
  let dia = diaArgentina(desde);
  let habiles = 0;
  while (dia < fin) {
    dia = diaSiguiente(dia);
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 6 && !feriados.has(dia)) habiles += 1;
  }
  return habiles;
}

/** "hoy", "1 día hábil", "4 días hábiles". */
export function textoDiasHabiles(dias: number): string {
  if (dias === 0) return "hoy";
  return `${dias} ${dias === 1 ? "día hábil" : "días hábiles"}`;
}
