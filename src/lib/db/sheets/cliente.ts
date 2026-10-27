import "server-only";
import { JWT } from "google-auth-library";

/**
 * Acceso de bajo nivel a la planilla que hace de base de datos.
 *
 * Solo sabe de filas y rangos: el mapeo a Solicitud / PlantillaEmail vive en
 * los archivos hermanos. Todo pasa por la API de Sheets con una service
 * account, asi la planilla puede quedar privada y compartida solo con ella.
 */

const ALCANCES = ["https://www.googleapis.com/auth/spreadsheets"];
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class ErrorSheets extends Error {}

/** Una fila de la planilla, ya como celdas de texto. */
export type FilaSheet = string[];

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new ErrorSheets(
      `Falta la variable de entorno ${nombre}. Revisa el .env contra .env.example.`,
    );
  }
  return valor;
}

export function idPlanilla(): string {
  return variable("GOOGLE_SHEETS_ID");
}

let clienteCache: JWT | null = null;

/**
 * La clave privada viaja en el .env con los saltos de linea escapados como
 * `\n`; hay que devolverlos antes de que google-auth-library la parsee.
 */
function clavePrivada(): string {
  return variable("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function cliente(): JWT {
  if (clienteCache) return clienteCache;
  clienteCache = new JWT({
    email: variable("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: clavePrivada(),
    scopes: ALCANCES,
  });
  return clienteCache;
}

async function pedir<T>(
  ruta: string,
  init: { method?: string; body?: unknown } = {},
  planilla: string = idPlanilla(),
): Promise<T> {
  const token = await cliente().getAccessToken();
  if (!token.token) {
    throw new ErrorSheets("No se pudo obtener un token de Google. Revisa las credenciales.");
  }

  const respuesta = await fetch(`${BASE}/${planilla}${ruta}`, {
    signal: AbortSignal.timeout(20_000),
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new ErrorSheets(
      `La API de Sheets respondio ${respuesta.status}. ${detalle.slice(0, 300)}`,
    );
  }

  return (await respuesta.json()) as T;
}

/**
 * Lee un rango en notacion A1 (por ejemplo "Solicitudes!A1:H"). Por defecto
 * de la planilla de la app; `planilla` permite leer otra (la de seguimiento).
 */
export async function leerRango(rango: string, planilla?: string): Promise<FilaSheet[]> {
  const datos = await pedir<{ values?: string[][] }>(
    `/values/${encodeURIComponent(rango)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
    {},
    planilla,
  );
  return (datos.values ?? []).map((fila) => fila.map((celda) => String(celda ?? "")));
}

/** Pisa un rango con los valores dados. */
export async function escribirRango(rango: string, valores: FilaSheet[]): Promise<void> {
  await pedir(
    `/values/${encodeURIComponent(rango)}?valueInputOption=RAW&includeValuesInResponse=false`,
    { method: "PUT", body: { range: rango, majorDimension: "ROWS", values: valores } },
  );
}

/** Agrega filas al final de la hoja. */
export async function agregarFilas(hoja: string, valores: FilaSheet[]): Promise<void> {
  if (valores.length === 0) return;
  await pedir(
    `/values/${encodeURIComponent(`${hoja}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: { majorDimension: "ROWS", values: valores } },
  );
}

/**
 * Escribe varios rangos en una sola llamada. Con `entrada: "USER_ENTERED"`
 * Sheets interpreta los valores como si se tipearan ("TRUE" tilda una casilla).
 */
export async function escribirRangos(
  cambios: readonly { rango: string; valores: FilaSheet[] }[],
  opciones: { planilla?: string; entrada?: "RAW" | "USER_ENTERED" } = {},
): Promise<void> {
  if (cambios.length === 0) return;
  await pedir(
    "/values:batchUpdate",
    {
      method: "POST",
      body: {
        valueInputOption: opciones.entrada ?? "RAW",
        data: cambios.map(({ rango, valores }) => ({
          range: rango,
          majorDimension: "ROWS",
          values: valores,
        })),
      },
    },
    opciones.planilla,
  );
}

type Metadata = {
  sheets?: { properties?: { title?: string } }[];
};

async function hojasExistentes(): Promise<string[]> {
  const metadata = await pedir<Metadata>("?fields=sheets.properties.title");
  return (metadata.sheets ?? [])
    .map((hoja) => hoja.properties?.title)
    .filter((titulo): titulo is string => Boolean(titulo));
}

async function crearHoja(titulo: string): Promise<void> {
  await pedir(":batchUpdate", {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title: titulo } } }] },
  });
}

/**
 * Se asegura de que la hoja exista y de que la primera fila tenga los
 * encabezados esperados. Es idempotente: se puede llamar en cada operacion.
 *
 * El resultado se cachea por proceso para no gastar una llamada extra a la
 * API en cada request.
 */
const hojasVerificadas = new Set<string>();

export async function asegurarHoja(
  hoja: string,
  encabezados: readonly string[],
): Promise<void> {
  if (hojasVerificadas.has(hoja)) return;

  if (!(await hojasExistentes()).includes(hoja)) {
    await crearHoja(hoja);
  }

  const primeraFila = await leerRango(`${hoja}!1:1`);
  const actuales = primeraFila[0] ?? [];
  const faltan = encabezados.some((encabezado, indice) => actuales[indice] !== encabezado);

  if (faltan) {
    const ultima = String.fromCharCode("A".charCodeAt(0) + encabezados.length - 1);
    await escribirRango(`${hoja}!A1:${ultima}1`, [[...encabezados]]);
  }

  hojasVerificadas.add(hoja);
}

/** Letra de la ultima columna de una hoja con N columnas (soporta hasta Z). */
export function ultimaColumna(cantidad: number): string {
  if (cantidad < 1 || cantidad > 26) {
    throw new ErrorSheets(`Cantidad de columnas fuera de rango: ${cantidad}`);
  }
  return String.fromCharCode("A".charCodeAt(0) + cantidad - 1);
}

/** Letra de una columna a partir de su indice (0 = A, 26 = AA). */
export function letraColumna(indice: number): string {
  let letras = "";
  let resto = indice + 1;
  while (resto > 0) {
    const modulo = (resto - 1) % 26;
    letras = String.fromCharCode(65 + modulo) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}
