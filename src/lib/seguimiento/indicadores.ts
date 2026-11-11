import { diasAbierta } from "@/lib/seguimiento/presentacion";
import { diaLocal } from "@/lib/seguimiento/tablero";
import type { Consulta, Relacion } from "@/types/seguimiento";

/**
 * Tarjetas de triaje del seguimiento: pendientes de respuesta, demora
 * promedio y clientes a cuidar. Cada una muestra un solo dato y es tambien un
 * filtro de la tabla. Funciones puras sobre las consultas.
 */

/**
 * Umbrales de demora, en dias habiles. Se usan en la tarjeta de demora
 * (color y filtro) y en el rojo de la de pendientes. Ajustarlos solo aca.
 */
export const DEMORA = {
  /** Desde aca la demora deja de estar "al dia" (ambar). */
  ambar: 1,
  /** Mas de esto ya es demora para atender (rojo y filtro de la tarjeta). */
  rojo: 3,
} as const;

/** Tramos del desglose de la tarjeta de demora (dias habiles, inclusive). */
export const TRAMOS_DEMORA = [
  { etiqueta: "1–2 d", desde: 1, hasta: 2 },
  { etiqueta: "3–5 d", desde: 3, hasta: 5 },
  { etiqueta: "+5 d", desde: 6, hasta: Number.POSITIVE_INFINITY },
] as const;

export const TRIAJES = {
  pendientes: "Pendientes de respuesta",
  demora: "Demora promedio",
  riesgo: "Clientes a cuidar",
} as const;
export type Triaje = keyof typeof TRIAJES;

/** Que muestra la tabla al filtrar por cada tarjeta. */
export const FILTRO_TRIAJE: Record<Triaje, string> = {
  pendientes: "pendientes, de la más antigua a la más reciente",
  demora: `pendientes con más de ${DEMORA.rojo} días hábiles`,
  riesgo: "pendientes en riesgo o regular, las rojas primero",
};

export function esTriaje(valor: unknown): valor is Triaje {
  return typeof valor === "string" && Object.hasOwn(TRIAJES, valor);
}

export type Tono = "verde" | "ambar" | "rojo";

// --- Dias habiles ------------------------------------------------------------

function diaSiguiente(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Dias habiles (lunes a viernes, sin feriados) que pasaron desde el dia de
 * `desde` hasta hoy, en hora de Argentina. El mismo dia es 0; de viernes a
 * lunes, 1.
 */
export function diasHabilesEntre(desde: Date, hasta: Date, feriados: ReadonlySet<string>): number {
  const fin = diaLocal(hasta);
  let dia = diaLocal(desde);
  let habiles = 0;
  while (dia < fin) {
    dia = diaSiguiente(dia);
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 6 && !feriados.has(dia)) habiles += 1;
  }
  return habiles;
}

/** Dias habiles sin respuesta. Sin fecha, se usa la columna de dias de la planilla. */
export function esperaHabil(consulta: Consulta, ahora: Date, feriados: ReadonlySet<string>): number | null {
  if (consulta.fecha) return diasHabilesEntre(consulta.fecha, ahora, feriados);
  return consulta.dias;
}

// --- Tarjetas ----------------------------------------------------------------

/** Si la consulta entra en la tarjeta (todas son sobre lo pendiente). */
export function enTriaje(triaje: Triaje, consulta: Consulta, relacion: Relacion, espera: number | null): boolean {
  if (consulta.respondida) return false;
  if (triaje === "demora") return (espera ?? 0) > DEMORA.rojo;
  if (triaje === "riesgo") return relacion !== "BUENA";
  return true;
}

export type DatosTriaje = {
  pendientes: {
    cantidad: number;
    /** Dias corridos de la pendiente mas vieja. */
    masAntigua: number | null;
    tono: Tono;
  };
  demora: {
    /** Promedio de dias habiles sin respuesta de las pendientes. */
    promedio: number | null;
    tramos: { etiqueta: string; cantidad: number }[];
    /** Pendientes con mas de DEMORA.rojo dias habiles (lo que muestra el filtro). */
    demoradas: number;
    tono: Tono;
  };
  riesgo: {
    cantidad: number;
    enRiesgo: number;
    regular: number;
    tono: Tono;
  };
};

export function calcularTriaje(
  consultas: readonly Consulta[],
  relacionDe: (consulta: Consulta) => Relacion,
  esperaDe: (consulta: Consulta) => number | null,
  ahora = new Date(),
): DatosTriaje {
  let pendientes = 0;
  let masAntigua: number | null = null;
  let sumaEspera = 0;
  let conEspera = 0;
  let demoradas = 0;
  const tramos = TRAMOS_DEMORA.map((tramo) => ({ etiqueta: tramo.etiqueta, cantidad: 0 }));
  let enRiesgo = 0;
  let regular = 0;

  for (const consulta of consultas) {
    if (consulta.respondida) continue;
    pendientes += 1;
    const corridos = diasAbierta(consulta, ahora);
    if (corridos !== null) masAntigua = Math.max(masAntigua ?? 0, corridos);

    const espera = esperaDe(consulta);
    if (espera !== null) {
      sumaEspera += espera;
      conEspera += 1;
      const tramo = TRAMOS_DEMORA.findIndex((item) => espera >= item.desde && espera <= item.hasta);
      if (tramo >= 0) tramos[tramo].cantidad += 1;
    }
    if (enTriaje("demora", consulta, "BUENA", espera)) demoradas += 1;

    const relacion = relacionDe(consulta);
    if (relacion === "EN_RIESGO") enRiesgo += 1;
    else if (relacion === "REGULAR") regular += 1;
  }

  const promedio = conEspera > 0 ? sumaEspera / conEspera : null;
  return {
    pendientes: {
      cantidad: pendientes,
      masAntigua,
      tono: pendientes === 0 ? "verde" : (masAntigua ?? 0) > DEMORA.rojo ? "rojo" : "ambar",
    },
    demora: {
      promedio,
      tramos,
      demoradas,
      tono: promedio === null || promedio < DEMORA.ambar ? "verde" : promedio > DEMORA.rojo ? "rojo" : "ambar",
    },
    riesgo: {
      cantidad: enRiesgo + regular,
      enRiesgo,
      regular,
      tono: enRiesgo > 0 ? "rojo" : regular > 0 ? "ambar" : "verde",
    },
  };
}
