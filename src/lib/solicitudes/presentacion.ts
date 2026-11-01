import { normalizarEncabezado } from "@/lib/utils/strings";
import type { DatosSolicitud, Estado, Solicitud } from "@/types/solicitud";

/**
 * Logica de presentacion del listado de solicitudes: lectura de los campos
 * sueltos de `datos`, completitud, vistas y metricas del mes.
 * Todo corre en memoria sobre la lista ya cargada, igual que `filtrarEnMemoria`.
 */

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

/** Un campo del formulario por su nombre exacto (sin tildes ni mayusculas); vacio si no esta. */
export function leerDato(datos: DatosSolicitud, nombre: string): string {
  const buscado = normalizarEncabezado(nombre);
  for (const [encabezado, valor] of Object.entries(datos)) {
    if (normalizarEncabezado(encabezado) !== buscado || valor === null || valor === undefined) continue;
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

// --- Vistas ----------------------------------------------------------------

/** Pendientes es la cola de trabajo; historial, lo ya decidido (para revisarlo o cambiarlo). */
export const VISTAS = { pendientes: "Pendientes", historial: "Historial" } as const;
export type Vista = keyof typeof VISTAS;

export function esVista(valor: unknown): valor is Vista {
  return typeof valor === "string" && Object.hasOwn(VISTAS, valor);
}

/** Cuando se decidio. Las importadas ya decididas pueden no tener fecha: cuenta la de ingreso. */
export function fechaDecidida(solicitud: Solicitud): Date {
  return solicitud.fechaDecision ?? solicitud.fechaImportacion;
}

// --- Metricas del mes --------------------------------------------------------

const ZONA = "America/Argentina/Buenos_Aires";
const FORMATO_MES = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" });
const NOMBRE_MES = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, month: "long" });

/** "2026-10" en hora de Argentina. */
export function mesLocal(fecha: Date): string {
  return FORMATO_MES.format(fecha).slice(0, 7);
}

/** Mes anterior a "AAAA-MM". */
export function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return numero === 1 ? `${anio - 1}-12` : `${anio}-${String(numero - 1).padStart(2, "0")}`;
}

/** "octubre" para "2026-10". */
export function nombreMes(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  return NOMBRE_MES.format(new Date(Date.UTC(anio, numero - 1, 15)));
}

export type Comparacion = { actual: number; anterior: number };

export type Metricas = {
  mes: string;
  mesAnterior: string;
  /** Aprobadas en el mes contra las del mes anterior (por fecha de decision). */
  aprobadas: Comparacion;
  /** Pendientes hoy contra las que habia al cerrar el mes anterior. */
  pendientes: Comparacion;
  rechazadas: Comparacion;
  /** Promedio entre el ingreso y la decision, en horas. null si no hay decididas. */
  horasResolucion: number | null;
};

export function calcularMetricas(todas: readonly Solicitud[], ahora = new Date()): Metricas {
  const mes = mesLocal(ahora);
  const anterior = mesAnterior(mes);
  const contar = (estado: Estado, enMes: string) =>
    todas.filter((solicitud) => solicitud.estado === estado && mesLocal(fechaDecidida(solicitud)) === enMes).length;

  // Pendientes al cierre del mes anterior: ya habian entrado y o siguen
  // pendientes o se decidieron recien este mes.
  const pendientesAlCierre = todas.filter(
    (solicitud) =>
      mesLocal(solicitud.fechaImportacion) < mes &&
      (solicitud.estado === "PENDIENTE" || mesLocal(fechaDecidida(solicitud)) >= mes),
  ).length;

  const decididas = todas.filter((solicitud) => solicitud.estado !== "PENDIENTE" && solicitud.fechaDecision);
  const horas = decididas.reduce(
    (total, solicitud) => total + ((solicitud.fechaDecision as Date).getTime() - solicitud.fechaImportacion.getTime()) / 3_600_000,
    0,
  );

  return {
    mes,
    mesAnterior: anterior,
    aprobadas: { actual: contar("APROBADO", mes), anterior: contar("APROBADO", anterior) },
    pendientes: { actual: todas.filter((solicitud) => solicitud.estado === "PENDIENTE").length, anterior: pendientesAlCierre },
    rechazadas: { actual: contar("RECHAZADO", mes), anterior: contar("RECHAZADO", anterior) },
    horasResolucion: decididas.length > 0 ? horas / decididas.length : null,
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
