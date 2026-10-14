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

/** Formulario FOR-03 Rev04 de reclamo de cliente. */
export type Reclamo = {
  id: string;
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
  productos: { codigo: string; descripcion: string; cantidadFacturada: number; cantidadReclamo: number }[];
  calidad: {
    clasificacion: string | null;
    causa: string | null;
    procedente: boolean | null;
    acciones: { fecha: string; accion: string; responsable: string; tiempo: string; resultado: string }[];
  };
  cierre: Record<string, string | null>;
  indicacion: Indicacion | null;
};

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
  /** Lo que reclama el cliente. */
  detalle: string;
  /** Clasificacion del formulario o "WhatsApp". */
  tipo: string;
  encargado: string;
  grupoWhatsapp: string;
  grupoVendedor: string;
  /** Deuda, "NO RESPONDER", etc. del maestro de clientes. */
  alertas: string[];
  respondido: boolean;
  /** Dias desde que entro el reclamo. */
  dias: number | null;
  observaciones: string;
  indicacion: Indicacion | null;
  estado: EstadoReclamo;
  /** Ficha completa (solo formularios). */
  enlace: string | null;
};
