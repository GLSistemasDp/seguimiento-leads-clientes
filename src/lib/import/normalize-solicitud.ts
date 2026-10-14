import type { FilaCruda } from "@/lib/import/parse-spreadsheet";
import { normalizarEmail, normalizarEncabezado } from "@/lib/utils/strings";
import type { SolicitudImportada } from "@/lib/db/solicitudes";

/**
 * Alias de encabezados del export de Adobe Acrobat -> campo propio.
 *
 * PENDIENTE DE CONFIRMAR: los nombres exactos de las columnas del export
 * todavia no estan validados contra un archivo real. Esta lista acepta las
 * variantes mas probables; cuando tengamos el archivo, se ajusta aca y nada
 * mas. La comparacion es tolerante (sin acentos, sin mayusculas, sin guiones
 * bajos), asi que "Razon Social" y "razon_social" caen en el mismo alias.
 */
export const ALIAS_NOMBRE = [
  "nombre",
  "nombre y apellido",
  "nombre completo",
  "apellido y nombre",
  "razon social",
  "empresa",
  "cliente",
  "name",
  "full name",
] as const;

export const ALIAS_EMAIL = [
  "email",
  "e mail",
  "mail",
  "correo",
  "correo electronico",
  "email de contacto",
  "mail de contacto",
] as const;

export type ErrorFila = {
  /** Numero de fila tal como se ve en la planilla (1 = encabezados). */
  fila: number;
  motivo: string;
};

export type ResultadoNormalizacion = {
  solicitudes: SolicitudImportada[];
  errores: ErrorFila[];
  /** Filas descartadas por tener el mismo email que otra fila anterior. */
  duplicadas: number;
};

/** Busca en la fila el primer encabezado que coincida con alguno de los alias. */
function buscarValor(fila: FilaCruda, alias: readonly string[]): string | null {
  for (const [encabezado, valor] of Object.entries(fila)) {
    if (!alias.includes(normalizarEncabezado(encabezado))) continue;
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (texto) return texto;
  }
  return null;
}

/** Los encabezados ya mapeados a columna propia no se repiten dentro de `datos`. */
function esColumnaPropia(encabezado: string): boolean {
  const normalizado = normalizarEncabezado(encabezado);
  return (
    (ALIAS_NOMBRE as readonly string[]).includes(normalizado) ||
    (ALIAS_EMAIL as readonly string[]).includes(normalizado)
  );
}

/**
 * Mapea una fila cruda al modelo Solicitud. Devuelve null y el motivo si le
 * falta algo minimo (hoy: un email valido).
 */
export function normalizarFila(
  fila: FilaCruda,
): { ok: true; solicitud: SolicitudImportada } | { ok: false; motivo: string } {
  const email = normalizarEmail(buscarValor(fila, ALIAS_EMAIL));
  if (!email) {
    return { ok: false, motivo: "Sin email valido" };
  }

  const nombre = buscarValor(fila, ALIAS_NOMBRE) ?? email;

  const datos: Record<string, string | number | boolean | null> = {};
  for (const [encabezado, valor] of Object.entries(fila)) {
    if (esColumnaPropia(encabezado)) continue;
    datos[encabezado] = valor;
  }

  return { ok: true, solicitud: { nombre, email, datos } };
}

/**
 * Normaliza todas las filas de una planilla, descartando duplicados por email
 * (se queda con la ultima aparicion, que suele ser la mas reciente).
 */
export function normalizarFilas(filas: readonly FilaCruda[]): ResultadoNormalizacion {
  const porEmail = new Map<string, SolicitudImportada>();
  const errores: ErrorFila[] = [];
  let duplicadas = 0;

  filas.forEach((fila, indice) => {
    const resultado = normalizarFila(fila);
    if (!resultado.ok) {
      errores.push({ fila: indice + 2, motivo: resultado.motivo });
      return;
    }
    if (porEmail.has(resultado.solicitud.email)) {
      duplicadas += 1;
    }
    porEmail.set(resultado.solicitud.email, resultado.solicitud);
  });

  return { solicitudes: [...porEmail.values()], errores, duplicadas };
}
