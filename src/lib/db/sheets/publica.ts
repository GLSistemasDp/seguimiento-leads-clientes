import "server-only";
import * as XLSX from "xlsx";
import { ErrorSheets } from "@/lib/db/sheets/cliente";
import type { FilaSheet } from "@/lib/db/sheets/cliente";

/**
 * Lee una planilla compartida como "Cualquier persona con el enlace" sin
 * credenciales: Google la exporta entera como .xlsx. Sirve para trabajar
 * contra la planilla de test mientras no hay service account. Es solo lectura.
 *
 * Las celdas quedan como texto, igual que con la API (UNFORMATTED_VALUE): las
 * fechas llegan como numero de serie y las casillas como "TRUE" / "FALSE".
 */

/** La exportacion tarda unos segundos: se reutiliza durante un minuto. */
const VIGENCIA_MS = 60_000;

type Libro = { hojas: Record<string, FilaSheet[]>; leido: number };

const almacen = globalThis as typeof globalThis & {
  __librosPublicos?: Map<string, Promise<Libro>>;
};

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "boolean") return valor ? "TRUE" : "FALSE";
  return String(valor);
}

async function descargar(planilla: string): Promise<Libro> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(planilla)}/export?format=xlsx`;
  const respuesta = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20_000) });
  // Si la planilla es privada Google redirige a la pantalla de login (HTML).
  if (!respuesta.ok || (respuesta.headers.get("content-type") ?? "").includes("text/html")) {
    throw new ErrorSheets(
      `No se pudo descargar la planilla ${planilla} (${respuesta.status}). Tiene que estar compartida como "Cualquier persona con el enlace" o configurarse una service account.`,
    );
  }

  const libro = XLSX.read(new Uint8Array(await respuesta.arrayBuffer()), { type: "array" });
  const hojas: Record<string, FilaSheet[]> = {};
  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
    // Si el rango usado no arranca en la fila 1, se rellena para que el
    // numero de fila coincida con el de la planilla.
    const inicio = hoja["!ref"] ? XLSX.utils.decode_range(hoja["!ref"]).s.r : 0;
    hojas[nombre] = [
      ...Array.from({ length: inicio }, () => [] as FilaSheet),
      ...filas.map((fila) => fila.map(texto)),
    ];
  }
  return { hojas, leido: Date.now() };
}

/** Todas las pestanas de la planilla, por nombre. */
export async function leerHojasPublicas(planilla: string): Promise<Record<string, FilaSheet[]>> {
  const libros = (almacen.__librosPublicos ??= new Map());
  const previo = libros.get(planilla);
  if (previo) {
    const libro = await previo.catch(() => null);
    if (libro && Date.now() - libro.leido < VIGENCIA_MS) return libro.hojas;
  }

  const pedido = descargar(planilla);
  libros.set(planilla, pedido);
  try {
    return (await pedido).hojas;
  } catch (error) {
    libros.delete(planilla);
    throw error;
  }
}
