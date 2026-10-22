import "server-only";
import { diaHabil, fechaArgentina } from "@/lib/utils/feriados";

/**
 * Horarios de los envios automaticos a Telegram, en hora de Argentina.
 * Tienen que coincidir con los crons de vercel.json (UTC = hora + 3).
 * El armado y el envio de cada mensaje estan en lib/notificaciones/envios.ts.
 */
export type Horario = { hora: number; minuto: number };

/** Seguimiento de chats: 13:00 y 17:00 (16:00 y 20:00 UTC). */
export const HORARIOS_SEGUIMIENTO: readonly Horario[] = [
  { hora: 13, minuto: 0 },
  { hora: 17, minuto: 0 },
];

/** Resumen de reclamos pendientes: solo al final del dia, 17:00 (20:00 UTC). */
export const HORARIOS_RECLAMOS: readonly Horario[] = [{ hora: 17, minuto: 0 }];

const DIA_MS = 86_400_000;

/**
 * Proximo envio automatico: el siguiente horario de un dia habil (saltea
 * fines de semana y feriados). Argentina no tiene horario de verano: UTC-3.
 */
export async function proximoEnvio(horarios: readonly Horario[], ahora = new Date()): Promise<Date | null> {
  for (let dias = 0; dias < 15; dias += 1) {
    const { dia } = fechaArgentina(new Date(ahora.getTime() + dias * DIA_MS));
    const [anio, mes, numero] = dia.split("-").map(Number);
    if (!(await diaHabil(new Date(Date.UTC(anio, mes - 1, numero, 15)))).habil) continue;
    for (const { hora, minuto } of horarios) {
      const momento = new Date(Date.UTC(anio, mes - 1, numero, hora + 3, minuto));
      if (momento > ahora) return momento;
    }
  }
  return null;
}

export function proximoEnvioCierre(ahora = new Date()): Promise<Date | null> {
  return proximoEnvio(HORARIOS_SEGUIMIENTO, ahora);
}
