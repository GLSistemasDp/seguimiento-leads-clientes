import "server-only";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import { ErrorTelegram, enviarTelegram } from "@/lib/notificaciones/telegram";
import { horaCorte } from "@/lib/seguimiento/resumen-diario";
import type { ResumenDiario } from "@/lib/seguimiento/resumen-diario";
import { resumenDeHoy } from "@/lib/seguimiento/resumen-servidor";
import { diaHabil, fechaArgentina } from "@/lib/utils/feriados";

/**
 * Envio del "Cierre del dia" al grupo de Telegram. Es la UNICA implementacion:
 * la usan el boton "Enviar a Telegram" del Resumen (manual) y el cron de
 * Vercel (/api/cron/cierre-del-dia). El cron solo agrega la autenticacion y
 * el chequeo de dia habil; el armado y el envio son estos.
 */

export const AUTOMATIZACION = "cierre-del-dia";

/** Texto que se manda: el resumen completo o, sin pendientes, una confirmacion corta. */
export function textoCierre(resumen: ResumenDiario, ahora: Date): string {
  return resumen.sinResponder === 0 ? `✅ Sin pendientes en este corte (${horaCorte(ahora)} hs).` : resumen.texto;
}

export type ResultadoCierre =
  | { ok: true; mensajes: number; pendientes: number }
  | { ok: false; error: string; sinConfigurar: boolean };

/** Arma el cierre con los pendientes de ahora, lo manda y deja registro. Nunca lanza. */
export async function enviarCierreDelDia(origen: "manual" | "cron", ahora = new Date()): Promise<ResultadoCierre> {
  let pendientes: number | null = null;
  try {
    const resumen = await resumenDeHoy(ahora);
    pendientes = resumen.sinResponder;
    const mensajes = await enviarTelegram(textoCierre(resumen, ahora));
    await registrarAutomatizacion({
      automatizacion: AUTOMATIZACION,
      origen,
      estado: "ok",
      mensajes,
      pendientes,
      detalle: null,
    });
    return { ok: true, mensajes, pendientes };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await registrarAutomatizacion({
      automatizacion: AUTOMATIZACION,
      origen,
      estado: "error",
      mensajes: 0,
      pendientes,
      detalle: mensaje,
    });
    return { ok: false, error: mensaje, sinConfigurar: error instanceof ErrorTelegram && error.sinConfigurar };
  }
}

/**
 * Horarios del envio automatico, en hora de Argentina. Tienen que coincidir
 * con los crons de vercel.json (16:00 y 20:00 UTC).
 */
export const HORARIOS_CIERRE = [
  { hora: 13, minuto: 0 },
  { hora: 17, minuto: 0 },
] as const;

const DIA_MS = 86_400_000;

/**
 * Proximo envio automatico: el siguiente horario de un dia habil (saltea
 * fines de semana y feriados). Argentina no tiene horario de verano: UTC-3.
 */
export async function proximoEnvioCierre(ahora = new Date()): Promise<Date | null> {
  for (let dias = 0; dias < 15; dias += 1) {
    const { dia } = fechaArgentina(new Date(ahora.getTime() + dias * DIA_MS));
    const [anio, mes, numero] = dia.split("-").map(Number);
    if (!(await diaHabil(new Date(Date.UTC(anio, mes - 1, numero, 15)))).habil) continue;
    for (const { hora, minuto } of HORARIOS_CIERRE) {
      const momento = new Date(Date.UTC(anio, mes - 1, numero, hora + 3, minuto));
      if (momento > ahora) return momento;
    }
  }
  return null;
}
