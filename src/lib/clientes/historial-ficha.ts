import { businessDaysSince } from "@/lib/utils/dias-habiles";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { EventoHistorial } from "@/types/seguimiento";

/**
 * Lecturas del historial para la ficha del cliente: que cierres fueron
 * masivos (no son respuestas reales), cuanto se tardo en responder cada
 * consulta y que consultas parecen repetidas. Funciones puras.
 */

/** Hasta cuantos dias habiles entre una consulta y otra se considera posible duplicado. */
export const DIAS_DUPLICADO = 3;
/** Parecido minimo entre los textos (0 a 1, palabras en comun) para marcar un duplicado. */
export const SIMILITUD_DUPLICADO = 0.6;

/** El cierre masivo deja "Cierre masivo: consulta anterior a <mes>." en la observacion. */
export function esCierreMasivo(evento: Pick<EventoHistorial, "tipo" | "observacion">): boolean {
  return evento.tipo === "finalizada" && /cierre masivo:/i.test(evento.observacion);
}

function palabras(texto: string): Set<string> {
  return new Set(normalizarEncabezado(texto).split(" ").filter((palabra) => palabra.length >= 3));
}

/** Palabras en comun sobre el total de palabras distintas (indice de Jaccard). */
export function similitud(a: string, b: string): number {
  const uno = palabras(a);
  const otro = palabras(b);
  if (uno.size === 0 || otro.size === 0) return 0;
  let comunes = 0;
  for (const palabra of uno) if (otro.has(palabra)) comunes += 1;
  return comunes / (uno.size + otro.size - comunes);
}

export type EventoAnalizable = Pick<EventoHistorial, "id" | "consultaId" | "tipo" | "hito" | "fecha" | "observacion" | "fechaConsulta"> & {
  /** Texto del cliente (o su resumen). */
  mensaje: string;
};

export type LecturaEvento = {
  /** Cierre masivo: se muestra en gris y no cuenta en los indicadores. */
  masivo: boolean;
  /** Dias habiles entre la consulta y el cierre (solo cierres reales con ambas fechas). */
  tiempoRespuesta: number | null;
  /** Fecha (ISO) de la consulta anterior que parece la misma, si la hay. */
  duplicadoDe: string | null;
};

/** Lectura de cada evento del historial, por id. */
export function leerHistorial(eventos: readonly EventoAnalizable[]): Map<string, LecturaEvento> {
  const lecturas = new Map<string, LecturaEvento>();
  const cuando = (evento: EventoAnalizable) => evento.fechaConsulta ?? evento.fecha;
  const ordenados = [...eventos].filter((evento) => evento.tipo !== "reabierta").sort((a, b) => cuando(a).localeCompare(cuando(b)));

  for (const evento of eventos) {
    const masivo = esCierreMasivo(evento);
    const tiempoRespuesta =
      evento.tipo === "finalizada" && !masivo && evento.fechaConsulta
        ? businessDaysSince(new Date(evento.fechaConsulta), new Date(evento.fecha))
        : null;
    lecturas.set(evento.id, { masivo, tiempoRespuesta, duplicadoDe: null });
  }

  // Posibles duplicados: mismo hito, texto parecido y pocos dias habiles de diferencia
  // (de otra consulta: los eventos de una misma consulta no cuentan).
  for (let indice = 1; indice < ordenados.length; indice += 1) {
    const evento = ordenados[indice];
    const hito = normalizarEncabezado(evento.hito);
    for (let previo = indice - 1; previo >= 0; previo -= 1) {
      const anterior = ordenados[previo];
      const distancia = businessDaysSince(new Date(cuando(anterior)), new Date(cuando(evento)));
      if (distancia > DIAS_DUPLICADO) break;
      if (anterior.consultaId === evento.consultaId || normalizarEncabezado(anterior.hito) !== hito) continue;
      if (similitud(anterior.mensaje, evento.mensaje) >= SIMILITUD_DUPLICADO) {
        const lectura = lecturas.get(evento.id);
        if (lectura) lectura.duplicadoDe = cuando(anterior);
        break;
      }
    }
  }
  return lecturas;
}

/** Tiempo medio de respuesta en dias habiles, sin los cierres masivos (null si no hay datos). */
export function tiempoMedioRespuesta(lecturas: Iterable<LecturaEvento>): number | null {
  const tiempos = [...lecturas].flatMap((lectura) => (lectura.masivo || lectura.tiempoRespuesta === null ? [] : [lectura.tiempoRespuesta]));
  return tiempos.length ? tiempos.reduce((suma, valor) => suma + valor, 0) / tiempos.length : null;
}

const MILES = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/**
 * Montos de la planilla con separador de miles: "USD14000" -> "USD 14.000",
 * "14000,5" -> "14.000,5". Lo que ya viene con separadores o no es un numero
 * queda como esta.
 */
export function formatearMonto(texto: string): string {
  return texto
    .replace(/([A-Za-z$])(?=\d)/g, "$1 ")
    .replace(/\b(\d{4,})(?:([.,])(\d{1,2}))?\b/g, (_, entero: string, separador?: string, decimales?: string) => {
      const conMiles = MILES.format(Number(entero));
      return separador && decimales ? `${conMiles},${decimales}` : conMiles;
    });
}
