import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * Archivos JSON en `.data/` para lo que la app genera por su cuenta y no tiene
 * columna en la planilla: historial de seguimiento, indicaciones de gerencia
 * sobre reclamos y puntajes de las altas. Funciona igual con la demo y con la
 * planilla leida por su link publico. Al pasar a Postgres cada archivo se
 * vuelve una tabla con la misma forma (clave -> registro).
 */

function ruta(nombre: string): string {
  const directorio = process.env.DATOS_LOCALES_DIR ||
    (process.env.VERCEL ? path.join(tmpdir(), "crm-data") : ".data");
  return path.resolve(directorio, `${nombre}.json`);
}

export async function leer<T>(nombre: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await readFile(ruta(nombre), "utf8")) as Record<string, T>;
  } catch {
    return {};
  }
}

/** Una cola por archivo: dos clics seguidos no se pisan. */
const colas = new Map<string, Promise<unknown>>();

/**
 * Lee el archivo, aplica `cambio` sobre la copia en memoria y lo vuelve a
 * escribir. Devuelve lo que devuelva `cambio`.
 */
export function modificar<T, R>(nombre: string, cambio: (datos: Record<string, T>) => R): Promise<R> {
  const previa = colas.get(nombre) ?? Promise.resolve();
  const tarea = previa.then(async () => {
    const datos = await leer<T>(nombre);
    const resultado = cambio(datos);
    const destino = ruta(nombre);
    await mkdir(path.dirname(destino), { recursive: true });
    // Se escribe aparte y se renombra, asi un corte no deja el JSON a medias.
    await writeFile(`${destino}.tmp`, JSON.stringify(datos, null, 2), "utf8");
    await rename(`${destino}.tmp`, destino);
    return resultado;
  });
  colas.set(
    nombre,
    tarea.catch(() => undefined),
  );
  return tarea;
}
