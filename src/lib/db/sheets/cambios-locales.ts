import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { CambiosConsulta } from "@/types/seguimiento";

/**
 * Cuando la planilla se lee por su link publico la app no puede escribir en
 * ella: lo que se tilda o se anota desde la app se guarda en un archivo JSON
 * local y se aplica encima de lo que trae la planilla. Al pasar a la service
 * account estos cambios dejan de usarse y todo se escribe en la planilla.
 */

export type CambioLocal = CambiosConsulta & {
  /** Cuando se finalizo / edito desde la app (ISO). */
  actualizado: string;
};

function archivo(): string {
  return path.resolve(
    process.env.SEGUIMIENTO_CAMBIOS_ARCHIVO ||
      (process.env.VERCEL
        ? path.join(tmpdir(), "crm-data", "seguimiento-cambios.json")
        : ".data/seguimiento-cambios.json"),
  );
}

export async function leerCambios(): Promise<Record<string, CambioLocal>> {
  try {
    return JSON.parse(await readFile(archivo(), "utf8")) as Record<string, CambioLocal>;
  } catch {
    return {};
  }
}

/** Las escrituras se encadenan para que dos clics seguidos no se pisen. */
let cola: Promise<unknown> = Promise.resolve();

export function guardarCambio(id: string, cambios: CambiosConsulta): Promise<CambioLocal> {
  const tarea = cola.then(async () => {
    const todos = await leerCambios();
    const cambio: CambioLocal = { ...todos[id], ...cambios, actualizado: new Date().toISOString() };
    todos[id] = cambio;

    const destino = archivo();
    await mkdir(path.dirname(destino), { recursive: true });
    // Se escribe aparte y se renombra, asi un corte no deja el JSON a medias.
    await writeFile(`${destino}.tmp`, JSON.stringify(todos, null, 2), "utf8");
    await rename(`${destino}.tmp`, destino);
    return cambio;
  });
  cola = tarea.catch(() => undefined);
  return tarea;
}
