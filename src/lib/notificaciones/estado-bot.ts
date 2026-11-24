import "server-only";
import { almacenPersistente, guardar, leerUno } from "@/lib/db/local/almacen";
import type { CanalTelegram } from "@/lib/notificaciones/telegram";

const COLECCION = "telegram-bots";

type EstadoBot = { pausado: boolean; actualizado: string };

/** Compartido por todas las pantallas y ejecuciones que usan el mismo canal. */
export async function botPausado(canal: CanalTelegram): Promise<boolean> {
  return (await leerUno<EstadoBot>(COLECCION, canal))?.pausado === true;
}

export async function establecerPausaBot(canal: CanalTelegram, pausado: boolean): Promise<void> {
  if (process.env.VERCEL && !almacenPersistente()) {
    throw new Error("Para guardar la pausa del bot en Vercel hace falta configurar Postgres.");
  }
  await guardar<EstadoBot>(COLECCION, {
    [canal]: { pausado, actualizado: new Date().toISOString() },
  });
}
