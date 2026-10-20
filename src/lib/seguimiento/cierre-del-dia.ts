import "server-only";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import { ErrorTelegram, enviarTelegram } from "@/lib/notificaciones/telegram";
import { horaCorte } from "@/lib/seguimiento/resumen-diario";
import type { ResumenDiario } from "@/lib/seguimiento/resumen-diario";
import { resumenDeHoy } from "@/lib/seguimiento/resumen-servidor";

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
