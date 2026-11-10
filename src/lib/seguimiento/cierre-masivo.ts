import type { Consulta, Resultado } from "@/types/seguimiento";

/**
 * Cierre masivo de lo viejo: las consultas pendientes de meses anteriores se
 * dan por finalizadas de una vez, para que la cola muestre solo lo del mes.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
/** Argentina no tiene horario de verano: siempre UTC-3. */
const DESFASE_ARGENTINA_MS = 3 * 60 * 60 * 1000;

export const RESULTADO_CIERRE_MASIVO: Resultado = "Resuelto";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** 00:00 del dia 1 del mes en curso, en hora de Argentina. */
export function inicioDelMes(ahora = new Date()): Date {
  const local = new Date(ahora.getTime() - DESFASE_ARGENTINA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DESFASE_ARGENTINA_MS);
}

/** "noviembre de 2026", para los textos del boton y del historial. */
export function nombreMes(inicio: Date): string {
  const local = new Date(inicio.getTime() - DESFASE_ARGENTINA_MS);
  return `${MESES[local.getUTCMonth()]} de ${local.getUTCFullYear()}`;
}

/**
 * Cuando entro la consulta. Sin fecha en la planilla se estima con los dias de
 * demora; si no hay ninguno de los dos, null (no se sabe de que mes es).
 */
function fechaEfectiva(consulta: Consulta, ahora: Date): Date | null {
  if (consulta.fecha) return consulta.fecha;
  if (consulta.dias !== null) return new Date(ahora.getTime() - consulta.dias * DIA_MS);
  return null;
}

/** Las pendientes que entraron antes del corte. */
export function pendientesAnteriores(consultas: readonly Consulta[], corte: Date, ahora = new Date()): Consulta[] {
  return consultas.filter((consulta) => {
    if (consulta.respondida) return false;
    const fecha = fechaEfectiva(consulta, ahora);
    return fecha !== null && fecha.getTime() < corte.getTime();
  });
}

/** Lo que queda escrito en la observacion de cada consulta cerrada asi. */
export function observacionCierreMasivo(corte: Date): string {
  return `Cierre masivo: consulta anterior a ${nombreMes(corte)}.`;
}
