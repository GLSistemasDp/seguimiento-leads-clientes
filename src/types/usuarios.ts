/**
 * CRM de cuentas clave (clientes USUARIOS): la ficha de una gran cuenta con
 * sus contactos, partes de seguimiento, cuenta corriente, cotizaciones y
 * pedidos. Espeja el esquema de db/propuestas/cuentas-clave.sql.
 *
 * Fechas comerciales como "AAAA-MM-DD"; momentos de carga en ISO completo.
 */

export type MonedaUsuario = "USD" | "ARS";

export const ROLES_CONTACTO = { COMPRAS: "Compras", PAGOS: "Pagos", GERENCIA: "Gerencia", OTRO: "Otro" } as const;
export type RolContacto = keyof typeof ROLES_CONTACTO;
export type ContactoUsuario = { id: string; nombre: string; rol: RolContacto; email: string; telefono: string };

/** Renglon de un pedido o de una cotizacion, con el precio de ese momento. */
export type ItemUsuario = { sku: string; descripcion: string; linea: string; cantidad: number; precioUnitario: number };

export const ESTADOS_PEDIDO_USUARIO = {
  RECIBIDO: "Recibido",
  EN_PREPARACION: "En preparación",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
} as const;
export type EstadoPedido = keyof typeof ESTADOS_PEDIDO_USUARIO;
export type PedidoUsuario = {
  id: string;
  numero: string;
  fecha: string;
  ordenCompra: string;
  estado: EstadoPedido;
  items: ItemUsuario[];
};

/** Lo pagado no se guarda: sale de los pagos imputados y las notas de credito. */
export type FacturaUsuario = { id: string; numero: string; fecha: string; vencimiento: string; pedidoId: string; total: number };
export type NotaCreditoUsuario = { id: string; numero: string; fecha: string; facturaId: string; importe: number; motivo: string };

export const MEDIOS_PAGO = {
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque / E-cheq",
  EFECTIVO: "Efectivo",
  RETENCIONES: "Retenciones",
} as const;
export type MedioPago = keyof typeof MEDIOS_PAGO;
export type ImputacionPago = { facturaId: string; importe: number };
export type PagoUsuario = {
  id: string;
  /** N° de recibo. */
  numero: string;
  fecha: string;
  importe: number;
  medio: MedioPago;
  referencia: string;
  /** A que facturas se aplico; lo que sobra queda a cuenta. */
  imputaciones: ImputacionPago[];
  autor: string;
};

export const ESTADOS_COTIZACION = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  EN_NEGOCIACION: "En negociación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
} as const;
export type EstadoCotizacion = keyof typeof ESTADOS_COTIZACION;

/** Catalogo de motivos: obligatorio al rechazar una cotizacion. */
export const MOTIVOS_RECHAZO = {
  PRECIO: "Precio alto",
  PLAZO_ENTREGA: "Plazo de entrega",
  COMPETENCIA: "Compró a la competencia",
  PROYECTO_CANCELADO: "Proyecto cancelado",
  ESPECIFICACION: "Especificación técnica",
  OTRO: "Otro motivo",
} as const;
export type MotivoRechazo = keyof typeof MOTIVOS_RECHAZO;
export type CotizacionUsuario = {
  id: string;
  numero: string;
  fecha: string;
  validez: string;
  estado: EstadoCotizacion;
  items: ItemUsuario[];
  motivoRechazo: MotivoRechazo | null;
  observacionRechazo: string;
};

export const TIPOS_PARTE = {
  LLAMADA: "Llamada",
  REUNION: "Reunión",
  VISITA: "Visita",
  CORREO: "Correo",
  WHATSAPP: "WhatsApp",
} as const;
export type TipoParte = keyof typeof TIPOS_PARTE;
/** Parte de seguimiento: un contacto con el cliente y cuando conviene volver a hablar. */
export type ParteUsuario = {
  id: string;
  /** ISO: cuando se cargo. */
  fecha: string;
  tipo: TipoParte;
  resumen: string;
  proximoContacto: string;
  autor: string;
};

/** Lo que se edita desde la ficha (el contacto principal lo usa tambien el mailing). */
export type PerfilUsuarioEditable = {
  actividad: string;
  vendedor: string;
  contacto: string;
  email: string;
  telefono: string;
  /** Dias sin contacto ni pedido que disparan "Requiere seguimiento". */
  umbralSeguimientoDias: number;
};

export type FichaUsuario = PerfilUsuarioEditable & {
  codigo: string;
  /** Razon social. */
  nombre: string;
  fantasia: string;
  cuit: string;
  condicionIva: string;
  provincia: string;
  moneda: MonedaUsuario;
  limiteCredito: number;
  plazoPagoDias: number;
  listaPrecios: string;
  direccionesEntrega: string[];
  contactos: ContactoUsuario[];
  partes: ParteUsuario[];
  pedidos: PedidoUsuario[];
  facturas: FacturaUsuario[];
  notasCredito: NotaCreditoUsuario[];
  pagos: PagoUsuario[];
  cotizaciones: CotizacionUsuario[];
  /** El conector productivo de ERP/BD reemplazara unicamente la fuente comercial. */
  origen: "demo";
};

/** Lo que se cargo desde el CRM para una cuenta, separado de la fuente comercial. */
export type GestionUsuario = {
  perfil?: PerfilUsuarioEditable;
  partes: ParteUsuario[];
  pagos: PagoUsuario[];
  pedidos: PedidoUsuario[];
  cotizaciones: CotizacionUsuario[];
  /** Cambios de estado de cotizaciones (propias o de la fuente comercial). */
  estadosCotizacion: Record<string, Pick<CotizacionUsuario, "estado" | "motivoRechazo" | "observacionRechazo">>;
};

/** Renglon que manda el formulario: el resto sale del catalogo de productos. */
export type ItemNuevo = { sku: string; cantidad: number; precioUnitario: number };

export type CambioUsuario =
  | { accion: "perfil"; perfil: PerfilUsuarioEditable }
  | { accion: "parte"; tipo: TipoParte; resumen: string; proximoContacto: string }
  | { accion: "pago"; fecha: string; importe: number; medio: MedioPago; referencia: string; imputaciones: ImputacionPago[] }
  | { accion: "pedido"; ordenCompra: string; items: ItemNuevo[] }
  | { accion: "cotizacion"; validez: string; estado: "BORRADOR" | "ENVIADA"; items: ItemNuevo[] }
  | {
      accion: "estado-cotizacion";
      cotizacionId: string;
      estado: EstadoCotizacion;
      motivoRechazo: MotivoRechazo | null;
      observacionRechazo: string;
    };
