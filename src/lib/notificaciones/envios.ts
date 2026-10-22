import "server-only";
import { headers } from "next/headers";
import { registrarAutomatizacion } from "@/lib/automatizaciones/registro";
import { datosDeCliente, getPanel } from "@/lib/db/reclamos";
import { getAll as getConsultas } from "@/lib/db/seguimiento";
import { getAll as getSolicitudes } from "@/lib/db/solicitudes";
import {
  mensajeAltaNueva,
  mensajeAltasPendientes,
  mensajeReclamoNuevo,
  mensajeReclamosPendientes,
  mensajesSeguimiento,
} from "@/lib/notificaciones/mensajes";
import { ErrorTelegram, enviarTelegram } from "@/lib/notificaciones/telegram";
import type { CanalTelegram } from "@/lib/notificaciones/telegram";
import { evaluarPorReglas } from "@/lib/solicitudes/evaluacion";
import type { Reclamo } from "@/types/reclamo";

/**
 * Notificaciones de Telegram de cada pantalla. Cada envio (boton, cron o
 * aviso al instante) pasa por aca: arma el mensaje con los datos de ese
 * momento, lo manda y deja registro. Nunca lanza: devuelve el resultado.
 */

export type TipoNotificacion = "seguimiento" | "reclamos" | "altas";
export type Origen = "manual" | "cron" | "evento";

export type ResultadoEnvio =
  | { ok: true; mensajes: number; pendientes: number | null }
  | { ok: false; error: string; sinConfigurar: boolean };

/**
 * URL de la intranet para los links: APP_URL, o el dominio desde el que llego
 * el pedido, o el dominio de produccion de Vercel (en los crons).
 */
export function urlBase(request?: Request): string {
  const configurada = process.env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "";
}

/** urlBase() para server components: el dominio desde el que se abrio la pagina. */
export async function urlBaseActual(): Promise<string> {
  if (process.env.APP_URL?.trim()) return urlBase();
  const encabezados = await headers();
  const host = encabezados.get("x-forwarded-host") ?? encabezados.get("host");
  if (!host) return urlBase();
  return `${encabezados.get("x-forwarded-proto") ?? "https"}://${host}`;
}

async function enviarYRegistrar(
  automatizacion: string,
  origen: Origen,
  canal: CanalTelegram,
  armar: () => Promise<{ textos: string[]; pendientes: number | null }>,
): Promise<ResultadoEnvio> {
  let pendientes: number | null = null;
  try {
    const armado = await armar();
    pendientes = armado.pendientes;
    const mensajes = await enviarTelegram(armado.textos, canal);
    await registrarAutomatizacion({ automatizacion, origen, estado: "ok", mensajes, pendientes, detalle: null });
    return { ok: true, mensajes, pendientes };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    await registrarAutomatizacion({ automatizacion, origen, estado: "error", mensajes: 0, pendientes, detalle: mensaje });
    return { ok: false, error: mensaje, sinConfigurar: error instanceof ErrorTelegram && error.sinConfigurar };
  }
}

// --- Seguimiento de chats (13:00 y 17:00, y boton) --------------------------------

export async function textosSeguimiento(base: string, ahora = new Date()): Promise<{ textos: string[]; pendientes: number }> {
  const consultas = await getConsultas();
  return {
    textos: mensajesSeguimiento(consultas, base, ahora),
    pendientes: consultas.filter((consulta) => !consulta.respondida).length,
  };
}

export function enviarSeguimiento(origen: Origen, base: string, ahora = new Date()): Promise<ResultadoEnvio> {
  return enviarYRegistrar("seguimiento-chats", origen, "seguimiento", () => textosSeguimiento(base, ahora));
}

// --- Reclamos (resumen a las 17:00 y boton; aviso al instante por formulario) ------

export function enviarReclamosPendientes(origen: Origen, base: string, ahora = new Date()): Promise<ResultadoEnvio> {
  return enviarYRegistrar("reclamos-pendientes", origen, "reclamos", async () => {
    const { reclamos } = await getPanel(ahora);
    return {
      textos: [mensajeReclamosPendientes(reclamos, base, ahora)],
      pendientes: reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO").length,
    };
  });
}

export function notificarReclamoNuevo(reclamo: Reclamo, base: string): Promise<ResultadoEnvio> {
  return enviarYRegistrar("reclamo-nuevo", "evento", "reclamos", async () => ({
    textos: [mensajeReclamoNuevo(reclamo, await datosDeCliente(reclamo.numeroCliente), base)],
    pendientes: null,
  }));
}

// --- Solicitudes de alta (aviso al instante y boton) --------------------------------

export function enviarAltasPendientes(origen: Origen, base: string, ahora = new Date()): Promise<ResultadoEnvio> {
  return enviarYRegistrar("altas-pendientes", origen, "altas", async () => {
    const pendientes = (await getSolicitudes({ estado: "PENDIENTE" }))
      .map((solicitud) => ({ solicitud, evaluacion: evaluarPorReglas(solicitud) }))
      .sort((a, b) => b.evaluacion.puntaje - a.evaluacion.puntaje);
    return { textos: [mensajeAltasPendientes(pendientes, base, ahora)], pendientes: pendientes.length };
  });
}

/** Aviso de un formulario de alta recien completado (se busca por su email). */
export function notificarAltaNueva(email: string, base: string): Promise<ResultadoEnvio> {
  return enviarYRegistrar("alta-nueva", "evento", "altas", async () => {
    const solicitud = (await getSolicitudes()).find((item) => item.email === email);
    if (!solicitud) throw new Error(`No se encontró la solicitud de ${email}.`);
    return { textos: [mensajeAltaNueva(solicitud, evaluarPorReglas(solicitud), base)], pendientes: null };
  });
}

export const ENVIOS: Record<TipoNotificacion, (origen: Origen, base: string) => Promise<ResultadoEnvio>> = {
  seguimiento: enviarSeguimiento,
  reclamos: enviarReclamosPendientes,
  altas: enviarAltasPendientes,
};
