import { normalizarEncabezado } from "@/lib/utils/strings";
import { formatearFecha } from "@/lib/utils/dates";
import type { DatosSolicitud, Solicitud } from "@/types/solicitud";

/**
 * Logica de presentacion del listado de solicitudes: lectura de los campos
 * sueltos de `datos`, completitud, filtros por fecha, orden y metricas.
 * Todo corre en memoria sobre la lista ya cargada, igual que `filtrarEnMemoria`.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Los campos extra llegan con el encabezado tal cual vino en la planilla, asi
 * que se buscan por alias con la misma comparacion tolerante del importador.
 */
const ALIAS_CAMPOS = {
  cuit: ["cuit", "cuil", "cuit cuil", "nro cuit", "numero de cuit"],
  rubro: ["rubro", "tipo de industria", "actividad", "industria", "sector", "categoria"],
  provincia: ["provincia", "prov", "region", "jurisdiccion"],
  telefono: ["telefono", "tel", "celular", "whatsapp", "telefono de contacto"],
} as const;

export type CampoConocido = keyof typeof ALIAS_CAMPOS;

export function leerCampo(datos: DatosSolicitud, campo: CampoConocido): string {
  const alias: readonly string[] = ALIAS_CAMPOS[campo];
  for (const [encabezado, valor] of Object.entries(datos)) {
    if (valor === null || valor === undefined) continue;
    if (!alias.includes(normalizarEncabezado(encabezado))) continue;
    const texto = String(valor).trim();
    if (texto) return texto;
  }
  return "";
}

/** Valida el digito verificador de un CUIT/CUIL (modulo 11). */
export function cuitValido(cuit: string): boolean {
  const digitos = cuit.replace(/\D/g, "");
  if (digitos.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + peso * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  return verificador !== 10 && verificador === Number(digitos[10]);
}

export type Completitud = "COMPLETO" | "INCOMPLETO" | "SIN_DATOS";

/** Cuantos de los datos clave estan cargados (0 a 4). Sirve tambien para ordenar. */
export function puntajeDatos(datos: DatosSolicitud): number {
  return [
    cuitValido(leerCampo(datos, "cuit")),
    leerCampo(datos, "rubro") !== "",
    leerCampo(datos, "provincia") !== "",
    leerCampo(datos, "telefono") !== "",
  ].filter(Boolean).length;
}

export function completitud(datos: DatosSolicitud): Completitud {
  const puntaje = puntajeDatos(datos);
  if (puntaje === 4) return "COMPLETO";
  if (puntaje <= 1) return "SIN_DATOS";
  return "INCOMPLETO";
}

/** Busca en nombre, email y en cualquier campo extra (CUIT, rubro, etc.). */
export function buscar(solicitudes: readonly Solicitud[], texto: string): Solicitud[] {
  const busqueda = texto.trim().toLowerCase();
  if (!busqueda) return [...solicitudes];
  const soloDigitos = busqueda.replace(/\D/g, "");

  return solicitudes.filter((solicitud) => {
    if (solicitud.nombre.toLowerCase().includes(busqueda)) return true;
    if (solicitud.email.toLowerCase().includes(busqueda)) return true;
    return Object.values(solicitud.datos).some((valor) => {
      if (valor === null || valor === undefined) return false;
      const texto = String(valor).toLowerCase();
      // "30711245673" tiene que encontrar "30-71124567-3".
      if (soloDigitos.length >= 4 && texto.replace(/\D/g, "").includes(soloDigitos)) return true;
      return texto.includes(busqueda);
    });
  });
}

// --- Rango de fechas -------------------------------------------------------

export const RANGOS = {
  "7": { dias: 7, etiqueta: "Ultimos 7 dias" },
  "30": { dias: 30, etiqueta: "Ultimos 30 dias" },
  "90": { dias: 90, etiqueta: "Ultimos 90 dias" },
  todo: { dias: null, etiqueta: "Todo el historial" },
} as const;

export type Rango = keyof typeof RANGOS;

/**
 * Por defecto se ve todo: un filtro de 30 dias esconderia pendientes viejas
 * que todavia hay que resolver.
 */
export const RANGO_POR_DEFECTO: Rango = "todo";

export function esRango(valor: unknown): valor is Rango {
  return typeof valor === "string" && valor in RANGOS;
}

export function etiquetaRango(rango: Rango, ahora = new Date()): string {
  const { dias, etiqueta } = RANGOS[rango];
  if (dias === null) return etiqueta;
  const desde = new Date(ahora.getTime() - dias * DIA_MS);
  return `${etiqueta} (${formatearFecha(desde)} - ${formatearFecha(ahora)})`;
}

export function filtrarPorRango(
  solicitudes: readonly Solicitud[],
  rango: Rango,
  ahora = new Date(),
): Solicitud[] {
  const { dias } = RANGOS[rango];
  if (dias === null) return [...solicitudes];
  const desde = ahora.getTime() - dias * DIA_MS;
  return solicitudes.filter((solicitud) => solicitud.fechaImportacion.getTime() >= desde);
}

// --- Orden -----------------------------------------------------------------

export const ORDENES = {
  aptitud: "Más completas primero",
  recientes: "Mas recientes primero",
  antiguas: "Mas antiguas primero",
  datos: "Datos mas completos primero",
  nombre: "Razon social (A a Z)",
} as const;

export type Orden = keyof typeof ORDENES;

/** Por defecto, las mas prometedoras arriba: son las que hay que resolver antes. */
export const ORDEN_POR_DEFECTO: Orden = "aptitud";

export function esOrden(valor: unknown): valor is Orden {
  return typeof valor === "string" && valor in ORDENES;
}

export function ordenar(solicitudes: readonly Solicitud[], orden: Orden): Solicitud[] {
  const porFecha = (a: Solicitud, b: Solicitud) =>
    b.fechaImportacion.getTime() - a.fechaImportacion.getTime();

  return [...solicitudes].sort((a, b) => {
    switch (orden) {
      case "antiguas":
        return -porFecha(a, b);
      case "nombre":
        return a.nombre.localeCompare(b.nombre, "es");
      case "datos":
        return puntajeDatos(b.datos) - puntajeDatos(a.datos) || porFecha(a, b);
      // "aptitud" necesita el puntaje: lo ordena la pagina, que lo tiene.
      default:
        return porFecha(a, b);
    }
  });
}

// --- Metricas --------------------------------------------------------------

export type Metricas = {
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  /** Promedio entre la importacion y la decision, en horas. null si no hay decididas. */
  horasResolucion: number | null;
  /** Aprobaciones de los ultimos 30 dias contra los 30 anteriores, en %. */
  variacionAprobadas: number | null;
  aprobadasUltimos30: number;
  rechazadasSinCuit: number;
};

/**
 * `periodo` es la lista ya filtrada por rango (lo que muestran las tarjetas);
 * `historial` es todo, para comparar las aprobaciones contra el mes anterior.
 */
export function calcularMetricas(
  periodo: readonly Solicitud[],
  historial: readonly Solicitud[],
  ahora = new Date(),
): Metricas {
  let pendientes = 0;
  let aprobadas = 0;
  let rechazadas = 0;
  let rechazadasSinCuit = 0;
  let horasTotales = 0;
  let decididas = 0;

  for (const solicitud of periodo) {
    if (solicitud.estado === "PENDIENTE") pendientes += 1;
    if (solicitud.estado === "APROBADO") aprobadas += 1;
    if (solicitud.estado === "RECHAZADO") {
      rechazadas += 1;
      if (!cuitValido(leerCampo(solicitud.datos, "cuit"))) rechazadasSinCuit += 1;
    }
    if (solicitud.fechaDecision) {
      horasTotales +=
        (solicitud.fechaDecision.getTime() - solicitud.fechaImportacion.getTime()) / 3_600_000;
      decididas += 1;
    }
  }

  const corte = ahora.getTime() - 30 * DIA_MS;
  const corteAnterior = ahora.getTime() - 60 * DIA_MS;
  let aprobadasUltimos30 = 0;
  let aprobadasAnteriores = 0;
  for (const solicitud of historial) {
    if (solicitud.estado !== "APROBADO" || !solicitud.fechaDecision) continue;
    const momento = solicitud.fechaDecision.getTime();
    if (momento >= corte) aprobadasUltimos30 += 1;
    else if (momento >= corteAnterior) aprobadasAnteriores += 1;
  }

  return {
    pendientes,
    aprobadas,
    rechazadas,
    horasResolucion: decididas > 0 ? horasTotales / decididas : null,
    variacionAprobadas:
      aprobadasAnteriores > 0
        ? ((aprobadasUltimos30 - aprobadasAnteriores) / aprobadasAnteriores) * 100
        : null,
    aprobadasUltimos30,
    rechazadasSinCuit,
  };
}

/** "4.2 hrs" o "3.1 dias", segun cuanto sea. */
export function formatearDuracion(horas: number): string {
  if (horas < 48) return `${horas.toFixed(1)} hrs`;
  return `${(horas / 24).toFixed(1)} dias`;
}

// --- Avatar ----------------------------------------------------------------

const SUFIJOS_SOCIETARIOS = new Set(["sa", "srl", "sas", "sac", "sh", "sca", "scs"]);

/** "Andina Pharma Group S.A." -> "AP". */
export function iniciales(nombre: string): string {
  const palabras = nombre
    // "TechLogistics" cuenta como dos palabras.
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/\s+/)
    .map((palabra) => palabra.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((palabra) => palabra && !SUFIJOS_SOCIETARIOS.has(palabra.toLowerCase()));
  const letras = palabras.slice(0, 2).map((palabra) => palabra[0]);
  return (letras.join("") || "?").toUpperCase();
}

const COLORES_AVATAR = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-indigo-100 text-indigo-800",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
] as const;

/** Color estable por nombre, para que cada empresa conserve el suyo. */
export function colorAvatar(nombre: string): string {
  let hash = 0;
  for (const caracter of nombre) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[hash % COLORES_AVATAR.length];
}
