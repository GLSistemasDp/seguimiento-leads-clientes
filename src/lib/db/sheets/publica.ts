import "server-only";
import { after } from "next/server";
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

/**
 * La exportacion tarda varios segundos (unos 3 s de descarga y 1 s de lectura):
 * durante un minuto se reutiliza tal cual. Despues, hasta 15 minutos, se sigue
 * mostrando la copia que hay mientras se baja la nueva en segundo plano, asi
 * nadie espera la descarga salvo la primera vez.
 */
const VIGENCIA_MS = 60_000;
const VIGENCIA_MAXIMA_MS = 15 * 60_000;

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

  // Solo valores: sin formatos, estilos ni formulas, que la app no usa y hacen la lectura mas lenta.
  const libro = XLSX.read(new Uint8Array(await respuesta.arrayBuffer()), {
    type: "array",
    cellText: false,
    cellHTML: false,
    cellFormula: false,
    cellStyles: false,
  });
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

const actualizando = new Set<string>();

/** Baja la planilla de nuevo sin que nadie la espere; si falla, queda la copia anterior. */
function refrescarEnSegundoPlano(planilla: string, libros: Map<string, Promise<Libro>>, anterior: Promise<Libro>): void {
  if (actualizando.has(planilla)) return;
  actualizando.add(planilla);
  const tarea = descargar(planilla)
    .then((libro) => {
      libros.set(planilla, Promise.resolve(libro));
    })
    .catch(() => {
      libros.set(planilla, anterior);
    })
    .finally(() => actualizando.delete(planilla));
  // En Vercel, after() mantiene viva la funcion hasta que termine la descarga.
  try {
    after(() => tarea);
  } catch {
    // Fuera de un pedido (scripts, pruebas) la tarea sigue sola.
  }
}

/** Todas las pestanas de la planilla, por nombre. */
export async function leerHojasPublicas(planilla: string): Promise<Record<string, FilaSheet[]>> {
  const libros = (almacen.__librosPublicos ??= new Map());
  const previo = libros.get(planilla);
  if (previo) {
    const libro = await previo.catch(() => null);
    if (libro) {
      const edad = Date.now() - libro.leido;
      if (edad < VIGENCIA_MS) return libro.hojas;
      if (edad < VIGENCIA_MAXIMA_MS) {
        refrescarEnSegundoPlano(planilla, libros, previo);
        return libro.hojas;
      }
    }
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
