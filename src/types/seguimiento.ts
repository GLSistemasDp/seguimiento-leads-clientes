/**
 * Una consulta de cliente de la planilla de seguimiento de atencion al cliente.
 * Espeja las columnas de "TablaSeguimiento"; los textos se guardan tal cual
 * vienen para no perder nada que el equipo cargue a mano.
 */
export type Consulta = {
  /** Huella estable de la fila (no el numero de fila, que cambia si ordenan la hoja). */
  id: string;
  fecha: Date | null;
  encargado: string;
  /** "1877 - BULONERIA BELGRANO". */
  cliente: string;
  listaPrecio: string;
  /** A, B, C o vacio. */
  clasificacion: string;
  grupoVendedor: string;
  /** Estado de la cuenta del cliente ("OK", "BLOQUEADO", ...). */
  estadoCuenta: string;
  grupoWhatsapp: string;
  consulta: string;
  /** Hito a responder: "Reclamo", "Pedido nuevo", "Consulta precio", etc. */
  hito: string;
  respondida: boolean;
  /** Valor de la columna DEMORA (dias sin respuesta) de la planilla, si lo tiene. */
  dias: number | null;
  observaciones: string;
  tentativoRespuesta: string;
  /** Datos del cliente en las hojas maestras de la planilla, si se encontro. */
  ficha?: FichaCliente | null;
};

/**
 * Lo que la planilla sabe del cliente fuera del seguimiento: la hoja
 * "Desplegable" (datos comerciales y de WhatsApp) y "MaestroCliente"
 * (actividad, condicion de pago, credito y deuda). Vacio si no figura.
 */
export type FichaCliente = {
  /** "1877". */
  codigo: string;
  nombre: string;
  listaPrecio: string;
  clasificacion: string;
  grupoVendedor: string;
  grupoWhatsapp: string;
  grupoWhatsapp2: string;
  /** SITUACION DEL CLIENTE: "OK", "TIENE DEUDA", "NO RESPONDER", "JUDICIALIZADO". */
  situacion: string;
  observacion: string;
  actividad: string;
  categoria: string;
  condicionPago: string;
  limiteCredito: string;
  /** Marca de la columna DEUDA del maestro ("REVISAR DEUDORA"), vacio si no tiene. */
  deuda: string;
};

export type CambiosConsulta = Partial<Pick<Consulta, "respondida" | "observaciones">>;

/** Como quedo la conversacion al finalizarla. Es obligatorio al tildar. */
export const RESULTADOS = [
  "Resuelto",
  "Resuelto parcialmente",
  "Derivado a otra area",
  "Escalado a gerencia",
  "Espera respuesta del cliente",
] as const;

export type Resultado = (typeof RESULTADOS)[number];

/** Termometro opcional de la relacion con el cliente despues de la charla. */
export const RELACIONES = {
  BUENA: "Buena",
  REGULAR: "Regular",
  EN_RIESGO: "En riesgo",
} as const;

export type Relacion = keyof typeof RELACIONES;

/**
 * Un paso en la historia de una consulta: cuando se finalizo (con su
 * resultado), cuando volvio a la cola o cuando se le agrego una nota.
 */
export type EventoHistorial = {
  id: string;
  consultaId: string;
  /** "1877 - BULONERIA BELGRANO", para armar el historial por cliente. */
  cliente: string;
  hito: string;
  /** ISO. */
  fecha: string;
  tipo: "finalizada" | "reabierta" | "nota";
  resultado: Resultado | null;
  relacion: Relacion | null;
  observacion: string;
};

/** Hitos conocidos, en orden de urgencia. Cualquier otro texto tambien se acepta. */
export const HITOS = [
  "Reclamo",
  "Pedido nuevo",
  "Estado de pedido",
  "Pedido refacturar",
  "Enviar Factura",
  "Estado de Cuenta",
  "Informa pago",
  "Consulta de stock",
  "Consulta precio",
  "Consulta Tecnica",
  "Lista de precios",
  "Alta Cliente",
  "Acceso WEB",
  "Consulta General",
] as const;
