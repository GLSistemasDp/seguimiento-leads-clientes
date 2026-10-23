import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pool, postgresConfigurado } from "@/lib/db/postgres/pg";

/**
 * Registros que la app genera por su cuenta y no tienen columna en la
 * planilla: formularios de reclamo, adjuntos, indicaciones de gerencia,
 * historial de seguimiento, bases de mailing...
 *
 * - Con Postgres (DATABASE_URL o POSTGRES_URL) se guardan en la tabla
 *   `almacen_registros` (coleccion, clave -> datos jsonb) de db/schema.sql.
 *   Es lo que hay que usar en Vercel: cada funcion tiene su propio disco
 *   temporal, asi que lo que guarda el formulario publico no lo veria la
 *   pantalla de la intranet.
 * - Sin base, en archivos JSON de `.data/` (desarrollo local).
 */

// --- Postgres -------------------------------------------------------------------

export function almacenPersistente(): boolean {
  return postgresConfigurado();
}

async function leerPg<T>(nombre: string): Promise<Record<string, T>> {
  const { rows } = await (await pool()).query<{ clave: string; datos: T }>(
    "SELECT clave, datos FROM almacen_registros WHERE coleccion = $1",
    [nombre],
  );
  return Object.fromEntries(rows.map((fila) => [fila.clave, fila.datos]));
}

async function upsertPg(
  consulta: (sql: string, valores: unknown[]) => Promise<unknown>,
  nombre: string,
  registros: Record<string, unknown>,
): Promise<void> {
  for (const [clave, datos] of Object.entries(registros)) {
    await consulta(
      `INSERT INTO almacen_registros (coleccion, clave, datos) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (coleccion, clave) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now()`,
      [nombre, clave, JSON.stringify(datos)],
    );
  }
}

/**
 * Lee la coleccion, aplica el cambio y escribe solo las claves que cambiaron.
 * El lock de la transaccion serializa las escrituras de una misma coleccion
 * entre todas las instancias (dos formularios a la vez no se pisan el numero).
 */
async function modificarPg<T, R>(nombre: string, cambio: (datos: Record<string, T>) => R): Promise<R> {
  const cliente = await (await pool()).connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [nombre]);
    const { rows } = await cliente.query<{ clave: string; datos: T }>(
      "SELECT clave, datos FROM almacen_registros WHERE coleccion = $1",
      [nombre],
    );
    const datos: Record<string, T> = Object.fromEntries(rows.map((fila) => [fila.clave, fila.datos]));
    const antes = new Map(Object.entries(datos).map(([clave, valor]) => [clave, JSON.stringify(valor)]));
    const resultado = cambio(datos);

    const cambiados = Object.fromEntries(
      Object.entries(datos).filter(([clave, valor]) => antes.get(clave) !== JSON.stringify(valor)),
    );
    await upsertPg((sql, valores) => cliente.query(sql, valores), nombre, cambiados);
    const borrados = [...antes.keys()].filter((clave) => !Object.hasOwn(datos, clave));
    if (borrados.length > 0) {
      await cliente.query("DELETE FROM almacen_registros WHERE coleccion = $1 AND clave = ANY($2)", [nombre, borrados]);
    }
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

// --- Archivos locales -------------------------------------------------------------

function ruta(nombre: string): string {
  const directorio = process.env.DATOS_LOCALES_DIR ||
    (process.env.VERCEL ? path.join(tmpdir(), "crm-data") : ".data");
  return path.resolve(directorio, `${nombre}.json`);
}

async function leerArchivo<T>(nombre: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await readFile(ruta(nombre), "utf8")) as Record<string, T>;
  } catch {
    return {};
  }
}

/** Una cola por archivo: dos clics seguidos no se pisan. */
const colas = new Map<string, Promise<unknown>>();

function modificarArchivo<T, R>(nombre: string, cambio: (datos: Record<string, T>) => R): Promise<R> {
  const previa = colas.get(nombre) ?? Promise.resolve();
  const tarea = previa.then(async () => {
    const datos = await leerArchivo<T>(nombre);
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

// --- API ----------------------------------------------------------------------------

/** Toda la coleccion (clave -> registro). Vacia si todavia no hay nada. */
export function leer<T>(nombre: string): Promise<Record<string, T>> {
  return almacenPersistente() ? leerPg<T>(nombre) : leerArchivo<T>(nombre);
}

/** Un solo registro, sin traer el resto de la coleccion (ej. un adjunto). */
export async function leerUno<T>(nombre: string, clave: string): Promise<T | null> {
  if (!almacenPersistente()) return (await leerArchivo<T>(nombre))[clave] ?? null;
  const { rows } = await (await pool()).query<{ datos: T }>(
    "SELECT datos FROM almacen_registros WHERE coleccion = $1 AND clave = $2",
    [nombre, clave],
  );
  return rows[0]?.datos ?? null;
}

/**
 * Lee la coleccion, aplica `cambio` sobre la copia en memoria y la vuelve a
 * guardar. Devuelve lo que devuelva `cambio`.
 */
export function modificar<T, R>(nombre: string, cambio: (datos: Record<string, T>) => R): Promise<R> {
  return almacenPersistente() ? modificarPg(nombre, cambio) : modificarArchivo(nombre, cambio);
}

/** Agrega o reemplaza registros sin leer la coleccion (para colecciones pesadas). */
export async function guardar<T>(nombre: string, registros: Record<string, T>): Promise<void> {
  if (!almacenPersistente()) {
    await modificarArchivo<T, void>(nombre, (datos) => {
      Object.assign(datos, registros);
    });
    return;
  }
  const conexion = await pool();
  await upsertPg((sql, valores) => conexion.query(sql, valores), nombre, registros);
}
