export const CLASIFICACIONES = ["Error de Facturación", "Plazo de Entrega", "Diferencia de Precio", "Error de Cliente", "Falla de Calidad", "Faltante de Mercadería"] as const;

/** Como le indica la gerencia al vendedor que siga con el reclamo. */
export const ACCIONES = {
  SUSTITUTO: "Ofrecer producto sustituto",
  NOTA_CREDITO: "Generar nota de crédito",
  FALTANTES: "Enviar productos faltantes",
  CAMBIO: "Retirar y cambiar mercadería",
  REPOSICION: "Esperar reposición de stock",
  CONTACTAR: "Llamar al cliente antes de responder",
  NO_PROCEDE: "Reclamo no procedente",
  OTRA: "Otra indicación",
} as const;

/** Lo que tiene que hacer el vendedor con cada accion, para mostrarlo debajo del selector. */
export const DETALLE_ACCIONES: Record<AccionReclamo, string> = {
  SUSTITUTO: "Indicá el producto (o los productos) que el vendedor debe ofrecer en reemplazo.",
  NOTA_CREDITO: "El vendedor gestiona la nota de crédito por lo reclamado y se la confirma al cliente.",
  FALTANTES: "El vendedor coordina con depósito el envío de lo que faltó.",
  CAMBIO: "El vendedor coordina el retiro de la mercadería y el envío del reemplazo.",
  REPOSICION: "El vendedor avisa al cliente la fecha estimada de reposición y le da seguimiento.",
  CONTACTAR: "Antes de responder por el grupo, el vendedor llama al cliente para entender el caso.",
  NO_PROCEDE: "El vendedor le explica al cliente por qué el reclamo no corresponde.",
  OTRA: "Escribí la indicación en el comentario.",
};

export type AccionReclamo = keyof typeof ACCIONES;

export type Sustituto = {
  /** Codigo y/o descripcion del producto que se ofrece en reemplazo. */
  producto: string;
  observacion: string;
};

export type Indicacion = {
  accion: AccionReclamo;
  sustitutos: Sustituto[];
  /** Comentario libre del gerente para el vendedor. */
  comentario: string;
  /** ISO, cuando se guardo. */
  fecha: string;
};

/** Clasificacion que hace el Asegurador de Calidad (pagina 2 del FOR-03). */
export const CLASIFICACIONES_CALIDAD = [
  "Error de Facturación",
  "Error de Cliente",
  "Error de Expedición",
  "Diferencia contra Factura",
  "Diferencia de Precio",
  "Falla de Calidad",
  "Plazo de Entrega",
] as const;

/** Campos del "Cierre del reclamo", en el orden del formulario. */
export const CAMPOS_CIERRE = [
  "Fecha de devolución",
  "Devolución recepcionada por",
  "Conforme a la devolución por",
  "Nota de crédito N°",
  "Responsable de nota de crédito",
  "Nota de débito N°",
  "Responsable de nota de débito",
  "Nueva factura N°",
  "Responsable de nueva factura",
  "N° de ajuste",
  "Responsable de ajuste",
  "N° de transferencia",
  "Acciones correctivas preventivas iniciadas",
  "Número de pedido de acción",
  "Respuesta al cliente",
  "Contacto con",
] as const;

export const MAX_PRODUCTOS = 10;

export type ProductoReclamo = { codigo: string; descripcion: string; cantidadFacturada: number; cantidadReclamo: number };
export type AccionCorrectiva = { fecha: string; accion: string; responsable: string; tiempo: string; resultado: string };
export type Adjunto = { id: string; nombre: string; tipo: string; tamano: number };

export type Calidad = {
  clasificacion: string | null;
  causa: string | null;
  procedente: boolean | null;
  acciones: AccionCorrectiva[];
};

/** Formulario FOR-03 Rev04 de reclamo de cliente. */
export type Reclamo = {
  /** Numero de reclamo que asigna De Pascale. */
  id: string;
  /** AAAA-MM-DD. */
  fecha: string;
  razonSocial: string;
  numeroCliente: string;
  sucursal: string;
  transporte: string;
  contacto: string;
  cargo: string;
  telefono: string;
  email: string;
  ordenCompra: string;
  pedido: string;
  factura: string;
  remito: string;
  clasificacion: typeof CLASIFICACIONES[number];
  detalle: string;
  productos: ProductoReclamo[];
  /** Remito, factura, orden de compra, pedido del cliente. */
  adjuntos: Adjunto[];
  calidad: Calidad;
  cierre: Record<string, string | null>;
  indicacion: Indicacion | null;
  /** Si se cargo a partir de un reclamo de WhatsApp: el id de esa consulta. */
  consultaId: string | null;
};

/** Lo que se carga al dar de alta un formulario (la parte "A completar por el Cliente"). */
export type NuevoReclamo = Pick<
  Reclamo,
  | "fecha"
  | "razonSocial"
  | "numeroCliente"
  | "sucursal"
  | "transporte"
  | "contacto"
  | "cargo"
  | "telefono"
  | "email"
  | "ordenCompra"
  | "pedido"
  | "factura"
  | "remito"
  | "clasificacion"
  | "detalle"
  | "productos"
  | "consultaId"
>;

export const ESTADOS_RECLAMO = {
  SIN_DEFINIR: "Esperando gerencia",
  EN_GESTION: "Indicado · en gestión",
  RESUELTO: "Respondido al cliente",
} as const;

export type EstadoReclamo = keyof typeof ESTADOS_RECLAMO;

/**
 * Un reclamo en el panel de gerencia, venga del grupo de WhatsApp (hito
 * "Reclamo" de la planilla de seguimiento) o de un formulario FOR-03.
 */
export type ReclamoPanel = {
  id: string;
  origen: "whatsapp" | "formulario";
  /** ISO o null si la planilla no trae fecha. */
  fecha: string | null;
  cliente: string;
  codigo: string;
  /** Clasificacion de venta del cliente (A, B, C) si se conoce. */
  clasificacionCliente: string;
  /** Lo que reclama el cliente. */
  detalle: string;
  /** Clasificacion del formulario o "WhatsApp". */
  tipo: string;
  encargado: string;
  grupoWhatsapp: string;
  grupoVendedor: string;
  /**
   * Situacion de la cuenta del cliente segun el maestro: "OK", "TIENE DEUDA",
   * "NO RESPONDER", "JUDICIALIZADO" y la marca "REVISAR DEUDORA". Vacio si no
   * se encontro el cliente. Sirve para decidir que reclamo priorizar.
   */
  estadoCliente: string[];
  respondido: boolean;
  /** Dias desde que entro el reclamo. */
  dias: number | null;
  observaciones: string;
  indicacion: Indicacion | null;
  estado: EstadoReclamo;
  /** Formulario FOR-03 (propio o cargado a partir de este reclamo de WhatsApp). */
  formulario: string | null;
  /** Para cargar el formulario a partir de un reclamo de WhatsApp. */
  consultaId: string | null;
};
