import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Consulta } from "@/types/seguimiento";

/**
 * Prioridad, filtros y metricas del seguimiento de clientes. Corre en memoria
 * sobre la planilla ya leida, igual que el listado de solicitudes.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias desde que entro la consulta. Si la planilla trae la columna D, manda esa. */
export function diasAbierta(consulta: Consulta, ahora = new Date()): number | null {
  if (consulta.dias !== null) return consulta.dias;
  if (!consulta.fecha) return null;
  return Math.max(0, Math.floor((ahora.getTime() - consulta.fecha.getTime()) / DIA_MS));
}

/** Que tan urgente es cada hito. Lo que no esta en la lista cuenta como consulta general. */
const PESO_HITO: Record<string, number> = {
  reclamo: 50,
  "pedido nuevo": 35,
  "estado de pedido": 25,
  "pedido refacturar": 25,
  "enviar factura": 25,
  "estado de cuenta": 20,
  "informa pago": 20,
  "consulta de stock": 15,
  "consulta precio": 15,
  "consulta tecnica": 15,
  "lista de precios": 10,
  "alta cliente": 10,
  "acceso web": 10,
  "consulta general": 10,
};

const PESO_CLASIFICACION: Record<string, number> = { A: 15, B: 8, C: 3 };

export function esReclamo(consulta: Consulta): boolean {
  return normalizarEncabezado(consulta.hito) === "reclamo";
}

/**
 * Puntaje para ordenar la cola: tipo de hito + clasificacion del cliente +
 * 5 puntos por dia sin respuesta (hasta 10 dias). Las respondidas van al fondo.
 */
export function puntajePrioridad(consulta: Consulta, ahora = new Date()): number {
  if (consulta.respondida) return -1;
  const hito = PESO_HITO[normalizarEncabezado(consulta.hito)] ?? 10;
  const clasificacion = PESO_CLASIFICACION[consulta.clasificacion.trim().toUpperCase()] ?? 0;
  const dias = Math.min(diasAbierta(consulta, ahora) ?? 0, 10);
  return hito + clasificacion + dias * 5;
}

export type Prioridad = "ALTA" | "MEDIA" | "BAJA" | "RESUELTA";

export function prioridad(consulta: Consulta, ahora = new Date()): Prioridad {
  if (consulta.respondida) return "RESUELTA";
  // Un reclamo siempre es urgente, sin importar cuando entro.
  if (esReclamo(consulta)) return "ALTA";
  const puntaje = puntajePrioridad(consulta, ahora);
  if (puntaje >= 50) return "ALTA";
  if (puntaje >= 30) return "MEDIA";
  return "BAJA";
}

/** Sin respuesta hace 2 dias o mas. */
export function vencida(consulta: Consulta, ahora = new Date()): boolean {
  return !consulta.respondida && (diasAbierta(consulta, ahora) ?? 0) >= 2;
}

// --- Filtros ---------------------------------------------------------------

export const VISTAS = {
  pendientes: "Sin responder",
  respondidas: "Respondidas",
  todas: "Todas",
} as const;

export type Vista = keyof typeof VISTAS;

export function esVista(valor: unknown): valor is Vista {
  return typeof valor === "string" && valor in VISTAS;
}

export function filtrarPorVista(consultas: readonly Consulta[], vista: Vista): Consulta[] {
  if (vista === "todas") return [...consultas];
  const respondidas = vista === "respondidas";
  return consultas.filter((consulta) => consulta.respondida === respondidas);
}

export type FiltrosConsulta = {
  busqueda?: string;
  hito?: string;
  encargado?: string;
  grupoVendedor?: string;
};

export function filtrar(consultas: readonly Consulta[], filtros: FiltrosConsulta): Consulta[] {
  const busqueda = filtros.busqueda?.trim().toLowerCase();
  return consultas.filter((consulta) => {
    if (filtros.hito && consulta.hito !== filtros.hito) return false;
    if (filtros.encargado && consulta.encargado !== filtros.encargado) return false;
    if (filtros.grupoVendedor && consulta.grupoVendedor !== filtros.grupoVendedor) return false;
    if (!busqueda) return true;
    return [
      consulta.cliente,
      consulta.consulta,
      consulta.grupoWhatsapp,
      consulta.grupoVendedor,
      consulta.observaciones,
    ].some((texto) => texto.toLowerCase().includes(busqueda));
  });
}

/** Valores distintos de una columna, para armar los desplegables de filtro. */
export function opciones(consultas: readonly Consulta[], campo: keyof FiltrosConsulta & keyof Consulta): string[] {
  const valores = new Set<string>();
  for (const consulta of consultas) {
    const valor = consulta[campo];
    if (typeof valor === "string" && valor) valores.add(valor);
  }
  return [...valores].sort((a, b) => a.localeCompare(b, "es"));
}

// --- Orden -----------------------------------------------------------------

export const ORDENES = {
  prioridad: "Mayor prioridad primero",
  antiguas: "Mas antiguas primero",
  recientes: "Mas recientes primero",
  cliente: "Cliente (A a Z)",
} as const;

export type OrdenConsulta = keyof typeof ORDENES;

export function esOrdenConsulta(valor: unknown): valor is OrdenConsulta {
  return typeof valor === "string" && valor in ORDENES;
}

export function ordenar(
  consultas: readonly Consulta[],
  orden: OrdenConsulta,
  ahora = new Date(),
): Consulta[] {
  const tiempo = (consulta: Consulta) => consulta.fecha?.getTime() ?? 0;
  return [...consultas].sort((a, b) => {
    switch (orden) {
      case "antiguas":
        return tiempo(a) - tiempo(b);
      case "recientes":
        return tiempo(b) - tiempo(a);
      case "cliente":
        return a.cliente.localeCompare(b.cliente, "es");
      default:
        // A igual prioridad, primero la que espera hace mas tiempo.
        return puntajePrioridad(b, ahora) - puntajePrioridad(a, ahora) || tiempo(a) - tiempo(b);
    }
  });
}

// --- Metricas --------------------------------------------------------------

export type MetricasSeguimiento = {
  sinResponder: number;
  reclamosAbiertos: number;
  vencidas: number;
  respondidas: number;
  /** Dias promedio que llevan esperando las que siguen sin respuesta. */
  esperaPromedio: number | null;
};

export function calcularMetricas(
  consultas: readonly Consulta[],
  ahora = new Date(),
): MetricasSeguimiento {
  let sinResponder = 0;
  let reclamosAbiertos = 0;
  let vencidas = 0;
  let respondidas = 0;
  let diasTotales = 0;
  let conFecha = 0;

  for (const consulta of consultas) {
    if (consulta.respondida) {
      respondidas += 1;
      continue;
    }
    sinResponder += 1;
    if (esReclamo(consulta)) reclamosAbiertos += 1;
    if (vencida(consulta, ahora)) vencidas += 1;
    const dias = diasAbierta(consulta, ahora);
    if (dias !== null) {
      diasTotales += dias;
      conFecha += 1;
    }
  }

  return {
    sinResponder,
    reclamosAbiertos,
    vencidas,
    respondidas,
    esperaPromedio: conFecha > 0 ? diasTotales / conFecha : null,
  };
}

/** "1877 - BULONERIA BELGRANO" -> { codigo: "1877", nombre: "BULONERIA BELGRANO" }. */
export function separarCliente(cliente: string): { codigo: string; nombre: string } {
  const partes = cliente.match(/^\s*(\d+)\s*-\s*(.+)$/);
  return partes ? { codigo: partes[1], nombre: partes[2].trim() } : { codigo: "", nombre: cliente };
}

/**
 * Lo que conviene mirar antes de responder: la marca de deuda del maestro y
 * una situacion de cuenta distinta de OK.
 */
export function alertasCliente(consulta: Pick<Consulta, "ficha" | "estadoCuenta">): string[] {
  const alertas: string[] = [];
  if (consulta.ficha?.deuda) alertas.push(consulta.ficha.deuda);
  const situacion = (consulta.ficha?.situacion || consulta.estadoCuenta).trim();
  if (situacion && situacion.toUpperCase() !== "OK" && !alertas.includes(situacion)) {
    alertas.push(situacion);
  }
  return alertas;
}

// --- Agrupado por cliente --------------------------------------------------

/** Un chat es la combinacion cliente + grupo de WhatsApp. */
export function claveChat(consulta: Pick<Consulta, "cliente" | "grupoWhatsapp">): string {
  return `${consulta.cliente.trim().toUpperCase()}|${consulta.grupoWhatsapp.trim().toUpperCase()}`;
}

/**
 * Junta las consultas de cada chat respetando el orden ya elegido: el chat
 * aparece donde aparece su consulta mas urgente, y dentro va en ese orden.
 */
export function agruparPorChat(consultas: readonly Consulta[]): Consulta[] {
  const grupos = new Map<string, Consulta[]>();
  for (const consulta of consultas) {
    const clave = claveChat(consulta);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(consulta);
    else grupos.set(clave, [consulta]);
  }
  return [...grupos.values()].flat();
}

export type ResumenChat = { total: number; sinResponder: number };

export function resumirChats(consultas: readonly Consulta[]): Record<string, ResumenChat> {
  const resumen: Record<string, ResumenChat> = {};
  for (const consulta of consultas) {
    const item = (resumen[claveChat(consulta)] ??= { total: 0, sinResponder: 0 });
    item.total += 1;
    if (!consulta.respondida) item.sinResponder += 1;
  }
  return resumen;
}
