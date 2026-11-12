import { horasAbierta } from "@/lib/seguimiento/presentacion";
import { UMBRALES_DEMORA_HORAS } from "@/lib/utils/dias-habiles";
import type { Consulta, Relacion } from "@/types/seguimiento";

/**
 * Tarjetas de triaje del seguimiento: pendientes de respuesta, demora
 * promedio y clientes a cuidar. Cada una muestra un solo dato y es tambien un
 * filtro de la tabla. Funciones puras sobre las consultas.
 *
 * Toda demora es en HORAS HABILES (horasAbierta -> businessHoursSince): la
 * tarjeta de pendientes, la de demora, el filtro y la columna de la tabla
 * cuentan lo mismo.
 */

/**
 * Umbrales de demora, en horas habiles (se definen en lib/utils/dias-habiles):
 * verde por debajo de `ambar`, ambar hasta `rojo`, rojo por encima. El filtro
 * de la tarjeta de demora muestra las de mas de `rojo`.
 */
export const DEMORA = UMBRALES_DEMORA_HORAS;

/** Tramos del desglose de la tarjeta de demora (horas habiles; `hasta` inclusive). */
export const TRAMOS_DEMORA = [
  { etiqueta: `hasta ${DEMORA.ambar} h`, hasta: DEMORA.ambar },
  { etiqueta: `${DEMORA.ambar}–${DEMORA.rojo} h`, hasta: DEMORA.rojo },
  { etiqueta: `+${DEMORA.rojo} h`, hasta: Number.POSITIVE_INFINITY },
] as const;

/** Contra cuantos dias atras se compara la cola de pendientes. */
const DIAS_COMPARACION = 7;
const DIA_MS = 86_400_000;

export const TRIAJES = {
  pendientes: "Pendientes de respuesta",
  demora: "Demora promedio",
  riesgo: "Clientes a cuidar",
} as const;
export type Triaje = keyof typeof TRIAJES;

/** Que muestra la tabla al filtrar por cada tarjeta. */
export const FILTRO_TRIAJE: Record<Triaje, string> = {
  pendientes: "pendientes, de la más antigua a la más reciente",
  demora: `pendientes con más de ${DEMORA.rojo} h hábiles`,
  riesgo: "pendientes en riesgo o regular, las rojas primero",
};

export function esTriaje(valor: unknown): valor is Triaje {
  return typeof valor === "string" && Object.hasOwn(TRIAJES, valor);
}

export type Tono = "verde" | "ambar" | "rojo";

/** Si la consulta entra en la tarjeta (todas son sobre lo pendiente). */
export function enTriaje(triaje: Triaje, consulta: Consulta, relacion: Relacion, ahora = new Date()): boolean {
  if (consulta.respondida) return false;
  if (triaje === "demora") return (horasAbierta(consulta, ahora) ?? 0) > DEMORA.rojo;
  if (triaje === "riesgo") return relacion !== "BUENA";
  return true;
}

export type DatosTriaje = {
  pendientes: {
    cantidad: number;
    /** Horas habiles de la pendiente mas vieja. */
    masAntigua: number | null;
    /** Cuantas estaban pendientes hace una semana (null si no se puede saber). */
    semanaPasada: number | null;
    tono: Tono;
  };
  demora: {
    /** Promedio de horas habiles sin respuesta de las pendientes. */
    promedio: number | null;
    tramos: { etiqueta: string; cantidad: number }[];
    /** Pendientes con mas de DEMORA.rojo horas habiles (lo que muestra el filtro). */
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

/**
 * @param cerradaEn cuando se cerro cada consulta respondida (ultimo cierre del
 *   historial). Sin dato se toma como cerrada el dia que entro: no suma a la
 *   cola de la semana pasada.
 */
export function calcularTriaje(
  consultas: readonly Consulta[],
  relacionDe: (consulta: Consulta) => Relacion,
  ahora = new Date(),
  cerradaEn?: (consulta: Consulta) => Date | null,
): DatosTriaje {
  let pendientes = 0;
  let masAntigua: number | null = null;
  let sumaEspera = 0;
  let conEspera = 0;
  let demoradas = 0;
  const tramos = TRAMOS_DEMORA.map((tramo) => ({ etiqueta: tramo.etiqueta, cantidad: 0 }));
  let enRiesgo = 0;
  let regular = 0;
  // Cola de hace una semana: lo que ya habia entrado y seguia sin cerrar.
  const corte = ahora.getTime() - DIAS_COMPARACION * DIA_MS;
  let semanaPasada = 0;

  for (const consulta of consultas) {
    if (consulta.fecha && consulta.fecha.getTime() <= corte) {
      const cierre = consulta.respondida ? cerradaEn?.(consulta) ?? null : null;
      if (!consulta.respondida || (cierre && cierre.getTime() > corte)) semanaPasada += 1;
    }
    if (consulta.respondida) continue;
    pendientes += 1;

    const espera = horasAbierta(consulta, ahora);
    if (espera !== null) {
      masAntigua = Math.max(masAntigua ?? 0, espera);
      sumaEspera += espera;
      conEspera += 1;
      const tramo = TRAMOS_DEMORA.findIndex((item) => espera <= item.hasta);
      if (tramo >= 0) tramos[tramo].cantidad += 1;
      if (espera > DEMORA.rojo) demoradas += 1;
    }

    const relacion = relacionDe(consulta);
    if (relacion === "EN_RIESGO") enRiesgo += 1;
    else if (relacion === "REGULAR") regular += 1;
  }

  const promedio = conEspera > 0 ? sumaEspera / conEspera : null;
  return {
    pendientes: {
      cantidad: pendientes,
      masAntigua,
      semanaPasada: cerradaEn ? semanaPasada : null,
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
