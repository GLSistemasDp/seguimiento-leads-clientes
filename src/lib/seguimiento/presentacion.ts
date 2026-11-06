import { normalizarEncabezado } from "@/lib/utils/strings";
import { estadoCuentaUnificado } from "@/lib/clientes/ficha";
import type { Consulta, EventoHistorial, Relacion, Resultado } from "@/types/seguimiento";

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

/**
 * Palabras del mensaje que muestran apuro o un problema que frena al cliente
 * (sobre el texto sin tildes ni mayusculas). "Reclamo" no esta: ya cuenta el hito.
 */
const URGENCIA =
  /\b(urgen\w*|ya mismo|cuanto antes|lo antes posible|asap|para hoy|necesito hoy|parad[oa]s?|sin stock|no (me |nos )?(llego|llegaron|llega)|sigo esperando|seguimos esperando|todavia no|cancel\w*|dar de baja|devolucion\w*|rot[oa]s?|fallad[oa]s?|defectuos[oa]s?)\b/;

/** Dias sin respuesta desde los que la demora cuenta como señal. */
const DIAS_DEMORA = 3;

export type SenalPrioridad = { etiqueta: string; puntos: number };

/**
 * Por que una consulta pendiente pesa: tipo de hito, cliente A, apuro en el
 * mensaje y demora. Cada señal suma; ninguna sola alcanza para "Alta".
 */
export function senalesPrioridad(consulta: Consulta, ahora = new Date()): SenalPrioridad[] {
  const senales: SenalPrioridad[] = [];
  const hito = normalizarEncabezado(consulta.hito);
  if (hito === "reclamo") senales.push({ etiqueta: "Reclamo", puntos: 2 });
  else if (hito === "pedido nuevo") senales.push({ etiqueta: "Pedido nuevo", puntos: 1 });
  if ((consulta.clasificacion || consulta.ficha?.clasificacion || "").trim().toUpperCase() === "A") {
    senales.push({ etiqueta: "Cliente A", puntos: 1 });
  }
  if (URGENCIA.test(normalizarEncabezado(consulta.consulta))) senales.push({ etiqueta: "Pide urgencia", puntos: 1 });
  const dias = diasAbierta(consulta, ahora) ?? 0;
  if (dias >= DIAS_DEMORA) senales.push({ etiqueta: `${dias} días sin respuesta`, puntos: 1 });
  return senales;
}

/**
 * Alta: 3 puntos o mas (un reclamo de un cliente A, o un reclamo demorado, o
 * un pedido nuevo de un cliente A que pide urgencia). Media: 2. Baja: el resto.
 */
export function prioridad(consulta: Consulta, ahora = new Date()): Prioridad {
  if (consulta.respondida) return "RESUELTA";
  const puntos = senalesPrioridad(consulta, ahora).reduce((suma, senal) => suma + senal.puntos, 0);
  if (puntos >= 3) return "ALTA";
  if (puntos >= 2) return "MEDIA";
  return "BAJA";
}

const RANGO_PRIORIDAD: Record<Prioridad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2, RESUELTA: 3 };

/** Para ordenar: primero por la etiqueta que se ve (Alta, Media, Baja), despues por puntaje. */
function compararPrioridad(a: Consulta, b: Consulta, ahora: Date): number {
  return (
    RANGO_PRIORIDAD[prioridad(a, ahora)] - RANGO_PRIORIDAD[prioridad(b, ahora)] ||
    puntajePrioridad(b, ahora) - puntajePrioridad(a, ahora)
  );
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
  clasificacion: "Clasificación del cliente (A, B, C)",
  prioridad: "Mayor prioridad primero",
  antiguas: "Mas antiguas primero",
  recientes: "Mas recientes primero",
  cliente: "Cliente (A a Z)",
} as const;

export type OrdenConsulta = keyof typeof ORDENES;

/** Por defecto la cola se ordena por clasificacion del cliente y, dentro, por prioridad. */
export const ORDEN_CONSULTA_POR_DEFECTO: OrdenConsulta = "clasificacion";

const RANGO_CLASIFICACION: Record<string, number> = { A: 0, B: 1, C: 2 };

function rangoClasificacion(consulta: Consulta): number {
  return RANGO_CLASIFICACION[(consulta.clasificacion || consulta.ficha?.clasificacion || "").trim().toUpperCase()] ?? 3;
}

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
      case "clasificacion":
        return (
          rangoClasificacion(a) - rangoClasificacion(b) ||
          compararPrioridad(a, b, ahora) ||
          tiempo(a) - tiempo(b)
        );
      default:
        // A igual prioridad, primero la que espera hace mas tiempo.
        return compararPrioridad(a, b, ahora) || tiempo(a) - tiempo(b);
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
  return estadoCliente(consulta).filter((estado) => !["ok", "sin deuda", "sin marca", "al dia"].includes(normalizarEncabezado(estado)));
}

/**
 * Como esta la cuenta del cliente segun el maestro: la situacion ("OK",
 * "TIENE DEUDA", "NO RESPONDER"...) y la marca de deuda ("REVISAR DEUDORA").
 */
export function estadoCliente(consulta: Pick<Consulta, "ficha" | "estadoCuenta">): string[] {
  const estado = estadoCuentaUnificado(consulta.ficha?.situacion || consulta.estadoCuenta, consulta.ficha?.deuda ?? "");
  return estado ? [estado.toUpperCase()] : [];
}

/**
 * Que significa cada estado de cuenta de la planilla, en una linea para quien
 * no conoce la jerga de cobranzas. Null si no hay explicacion para ese texto.
 */
export function explicarEstado(estado: string): string | null {
  const texto = normalizarEncabezado(estado);
  if (texto === "ok") return "Cuenta al día: sin observaciones de cobranza.";
  if (texto.includes("judicial")) return "La deuda del cliente está en gestión judicial.";
  if (texto.includes("revisar") && texto.includes("deud")) return "El cliente tiene saldo vencido o en gestión de cobranza.";
  if (texto.includes("deud")) return "El cliente tiene deuda registrada en su cuenta corriente.";
  if (texto.includes("no responder")) return "Marcado en la planilla como “no responder”.";
  return null;
}

export type CierreFrecuente = { resultado: Resultado; relacion: Relacion; veces: number; total: number };

/**
 * El cierre (resultado + relacion) que mas se usa en el historial, para el
 * boton de un click del modal. Sin cierres registrados: "Resuelto" y "Bien".
 */
export function cierreMasFrecuente(eventos: Iterable<EventoHistorial>): CierreFrecuente {
  const conteo = new Map<string, number>();
  let total = 0;
  for (const evento of eventos) {
    if (evento.tipo !== "finalizada" || !evento.resultado || !evento.relacion) continue;
    const clave = `${evento.resultado}|${evento.relacion}`;
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    total += 1;
  }
  let elegido: CierreFrecuente = { resultado: "Resuelto", relacion: "BUENA", veces: 0, total };
  for (const [clave, veces] of conteo) {
    if (veces <= elegido.veces) continue;
    const [resultado, relacion] = clave.split("|") as [Resultado, Relacion];
    elegido = { resultado, relacion, veces, total };
  }
  return elegido;
}

/** Solo links de invitacion de WhatsApp: cualquier otra cosa se ignora. */
export function linkGrupoValido(link: string): string | null {
  const limpio = link.trim();
  return /^https:\/\/(chat\.whatsapp\.com|wa\.me)\/[\w/-]+$/i.test(limpio) ? limpio : null;
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

/** Perfil del cliente: por su codigo, o por el nombre si la planilla no trae codigo. */
export function rutaPerfil(cliente: string): string {
  const { codigo, nombre } = separarCliente(cliente);
  return `/clientes/${encodeURIComponent(codigo || nombre)}`;
}
