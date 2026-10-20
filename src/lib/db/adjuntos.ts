import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import type { Adjunto } from "@/types/reclamo";

/**
 * Archivos que mandan los clientes (adjuntos de reclamos y de altas, firmas).
 * En la demo viven en `.data/adjuntos.json` en base64; en produccion van a un
 * almacenamiento de archivos (Vercel Blob, S3, Drive) con la misma interfaz.
 * Se sirven solo por /api/adjuntos/:id, que queda dentro de la intranet.
 */

const ARCHIVO = "adjuntos";

export type ArchivoAdjunto = { nombre: string; tipo: string; datos: Buffer };

type Guardado = { nombre: string; tipo: string; base64: string; referencia: string; creado: string };

/** Guarda los archivos y devuelve su descripcion (sin el contenido). */
export async function guardarAdjuntos(archivos: readonly ArchivoAdjunto[], referencia: string): Promise<Adjunto[]> {
  if (archivos.length === 0) return [];
  const adjuntos: Adjunto[] = archivos.map((archivo) => ({
    id: crypto.randomUUID(),
    nombre: archivo.nombre,
    tipo: archivo.tipo,
    tamano: archivo.datos.length,
  }));
  const creado = new Date().toISOString();
  await modificar<Guardado, void>(ARCHIVO, (guardados) => {
    archivos.forEach((archivo, indice) => {
      guardados[adjuntos[indice].id] = {
        nombre: archivo.nombre,
        tipo: archivo.tipo,
        base64: archivo.datos.toString("base64"),
        referencia,
        creado,
      };
    });
  });
  return adjuntos;
}

export async function getAdjunto(id: string): Promise<{ nombre: string; tipo: string; datos: Buffer } | null> {
  const adjunto = (await leer<Guardado>(ARCHIVO))[id];
  return adjunto ? { nombre: adjunto.nombre, tipo: adjunto.tipo, datos: Buffer.from(adjunto.base64, "base64") } : null;
}

/** "/api/adjuntos/<id>/<nombre.pdf>": el nombre al final deja ver el tipo de archivo. */
export function urlAdjunto(adjunto: Pick<Adjunto, "id" | "nombre">): string {
  return `/api/adjuntos/${adjunto.id}/${encodeURIComponent(adjunto.nombre)}`;
}
