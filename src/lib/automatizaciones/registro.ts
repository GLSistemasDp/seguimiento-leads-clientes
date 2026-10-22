import "server-only";

/**
 * Registro de cada ejecucion de una automatizacion (envio manual o por cron).
 *
 * Siempre queda una linea en los logs del servidor (en Vercel: Logs del
 * proyecto). Si hay Postgres configurado (DATABASE_URL) ademas se guarda en
 * la tabla automation_logs. Nunca se registran tokens ni credenciales.
 */

export type RegistroAutomatizacion = {
  /** "seguimiento-chats", "reclamos-pendientes", "alta-nueva"... */
  automatizacion: string;
  /** Boton de la intranet, cron programado o aviso al instante (formulario nuevo). */
  origen: "manual" | "cron" | "evento";
  estado: "ok" | "error" | "omitido";
  /** Mensajes de Telegram enviados. */
  mensajes: number;
  /** Consultas sin responder al momento del envio. */
  pendientes: number | null;
  /** Motivo del salteo o del error. */
  detalle: string | null;
};

export async function registrarAutomatizacion(registro: RegistroAutomatizacion): Promise<void> {
  const linea = JSON.stringify({ ...registro, fecha: new Date().toISOString() });
  if (registro.estado === "error") console.error(`[automatizacion] ${linea}`);
  else console.info(`[automatizacion] ${linea}`);

  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("@/lib/db/postgres/cliente");
    await prisma().automationLog.create({ data: registro });
  } catch (error) {
    // Que falle el registro no puede tapar el resultado del envio.
    console.error(
      `[automatizacion] No se pudo guardar en automation_logs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
