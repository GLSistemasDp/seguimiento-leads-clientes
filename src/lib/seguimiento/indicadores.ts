import { claveChat, diasAbierta } from "@/lib/seguimiento/presentacion";
import { diaLocal } from "@/lib/seguimiento/tablero";
import type { Consulta, Relacion } from "@/types/seguimiento";

/**
 * Tarjetas de triaje del seguimiento: chats pendientes, chats con mas de un
 * dia de demora y relaciones en riesgo. Cada una es tambien un filtro de la
 * tabla. Funciones puras sobre las consultas.
 */

const DIA_MS = 86_400_000;
/** Dias de la linea de ingresos. */
const DIAS_SERIE = 30;
/** Escala de la distribucion de espera (0 a 7 dias). */
export const ESCALA_ESPERA = 7;

export const TRIAJES = {
  pendientes: "Chats pendientes",
  demora: "+ 1 día de demora",
  riesgo: "Relaciones en riesgo",
} as const;
export type Triaje = keyof typeof TRIAJES;

export function esTriaje(valor: unknown): valor is Triaje {
  return typeof valor === "string" && Object.hasOwn(TRIAJES, valor);
}

/** Si la consulta entra en la tarjeta (todas son sobre lo pendiente). */
export function enTriaje(triaje: Triaje, consulta: Consulta, relacion: Relacion, ahora = new Date()): boolean {
  if (consulta.respondida) return false;
  if (triaje === "demora") return (diasAbierta(consulta, ahora) ?? 0) >= 1;
  if (triaje === "riesgo") return relacion === "EN_RIESGO";
  return true;
}

export type DatosTriaje = {
  /** Chats y consultas de cada tarjeta. */
  conteos: Record<Triaje, { chats: number; consultas: number }>;
  /** Consultas que entraron cada dia (ultimos 30 dias, la ultima es hoy). */
  ingresos: { dia: string; cantidad: number }[];
  /** Pendientes por dias de espera: 0, 1, 2... y la ultima columna junta 7 o mas. */
  demoras: { dias: number; cantidad: number }[];
  /** Chats pendientes segun la peor relacion de sus consultas abiertas. */
  relaciones: Record<Relacion, number>;
};

const PESO: Record<Relacion, number> = { BUENA: 0, REGULAR: 1, EN_RIESGO: 2 };

export function calcularTriaje(
  consultas: readonly Consulta[],
  relacionDe: (consulta: Consulta) => Relacion,
  ahora = new Date(),
): DatosTriaje {
  const dias = Array.from({ length: DIAS_SERIE }, (_, indice) =>
    diaLocal(new Date(ahora.getTime() - (DIAS_SERIE - 1 - indice) * DIA_MS)),
  );
  const ingresos = new Map(dias.map((dia) => [dia, 0]));
  const demoras = Array.from({ length: ESCALA_ESPERA + 1 }, (_, indice) => ({ dias: indice, cantidad: 0 }));
  const chats: Record<Triaje, Set<string>> = { pendientes: new Set(), demora: new Set(), riesgo: new Set() };
  const consultasPorTarjeta: Record<Triaje, number> = { pendientes: 0, demora: 0, riesgo: 0 };
  const peorRelacion = new Map<string, Relacion>();

  for (const consulta of consultas) {
    if (consulta.fecha) {
      const dia = diaLocal(consulta.fecha);
      if (ingresos.has(dia)) ingresos.set(dia, (ingresos.get(dia) ?? 0) + 1);
    }
    if (consulta.respondida) continue;
    const chat = claveChat(consulta);
    const relacion = relacionDe(consulta);
    for (const triaje of Object.keys(TRIAJES) as Triaje[]) {
      if (!enTriaje(triaje, consulta, relacion, ahora)) continue;
      chats[triaje].add(chat);
      consultasPorTarjeta[triaje] += 1;
    }
    const anterior = peorRelacion.get(chat);
    if (!anterior || PESO[relacion] > PESO[anterior]) peorRelacion.set(chat, relacion);
    const espera = diasAbierta(consulta, ahora);
    if (espera !== null) demoras[Math.min(espera, ESCALA_ESPERA)].cantidad += 1;
  }

  const relaciones: Record<Relacion, number> = { BUENA: 0, REGULAR: 0, EN_RIESGO: 0 };
  for (const relacion of peorRelacion.values()) relaciones[relacion] += 1;

  return {
    conteos: {
      pendientes: { chats: chats.pendientes.size, consultas: consultasPorTarjeta.pendientes },
      demora: { chats: chats.demora.size, consultas: consultasPorTarjeta.demora },
      riesgo: { chats: chats.riesgo.size, consultas: consultasPorTarjeta.riesgo },
    },
    ingresos: dias.map((dia) => ({ dia, cantidad: ingresos.get(dia) ?? 0 })),
    demoras,
    relaciones,
  };
}
