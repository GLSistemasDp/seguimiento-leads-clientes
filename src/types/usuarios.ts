import type { Relacion } from "@/types/seguimiento";

export const ESTADOS_PEDIDO_USUARIO = {
  RECIBIDO: "Recibido", EN_PREPARACION: "En preparación", DESPACHADO: "Despachado", ENTREGADO: "Entregado", CANCELADO: "Cancelado",
} as const;
export const ESTADOS_COTIZACION = {
  PENDIENTE: "Pendiente", EN_NEGOCIACION: "En negociación", GANADA: "Ganada", NO_GANADA: "No ganada", VENCIDA: "Vencida",
} as const;
export type EstadoCotizacion = keyof typeof ESTADOS_COTIZACION;
export type MonedaUsuario = "USD" | "ARS";
export type ProductoUsuario = { codigo: string; descripcion: string; linea: string; cantidad: number; precioUnitario: number };
export type PedidoUsuario = {
  id: string; numero: string; fecha: string; ordenCompra: string;
  estado: keyof typeof ESTADOS_PEDIDO_USUARIO; entregaEstimada: string; productos: ProductoUsuario[];
};
export type CotizacionUsuario = {
  id: string; numero: string; fecha: string; validez: string; estado: EstadoCotizacion;
  motivoNoGanada: string; productos: ProductoUsuario[];
};
export type FacturaUsuario = {
  id: string; numero: string; fecha: string; vencimiento: string; pedidoId: string;
  importe: number; saldo: number;
};
export type ObservacionUsuario = {
  id: string; fecha: string; autor: string; texto: string; relacion: Relacion;
  proximoContacto: string; proximaAccion: string;
};
export type ComentarioFactura = {
  id: string; fecha: string; autor: string; comentario: string; fechaPrometida: string;
};
export type EventoUsuario = {
  id: string; fecha: string; tipo: "pedido" | "cotizacion" | "factura" | "cobranza" | "relacion" | "perfil";
  titulo: string; detalle: string; autor: string;
};
export type PerfilUsuarioEditable = { actividad: string; vendedor: string; contacto: string; email: string; telefono: string };
export type GestionUsuario = {
  perfil?: PerfilUsuarioEditable;
  observaciones: ObservacionUsuario[];
  cotizaciones: Record<string, { estado: EstadoCotizacion; motivoNoGanada: string }>;
  cobranzas: Record<string, ComentarioFactura[]>;
  eventos: EventoUsuario[];
};
export type FichaUsuario = PerfilUsuarioEditable & {
  codigo: string; nombre: string; provincia: string; cuit: string;
  moneda: MonedaUsuario; limiteCredito: number; condicionPago: string;
  pedidos: PedidoUsuario[]; cotizaciones: CotizacionUsuario[]; facturas: FacturaUsuario[];
  observaciones: ObservacionUsuario[]; cobranzas: Record<string, ComentarioFactura[]>; eventos: EventoUsuario[];
  /** El conector productivo de ERP/BD reemplazará únicamente la fuente comercial. */
  origen: "demo";
};
export type CambioUsuario =
  | { accion: "perfil"; perfil: PerfilUsuarioEditable }
  | { accion: "observacion"; texto: string; relacion: Relacion; proximoContacto: string; proximaAccion: string }
  | { accion: "cotizacion"; cotizacionId: string; estado: EstadoCotizacion; motivoNoGanada: string }
  | { accion: "cobranza"; facturaId: string; comentario: string; fechaPrometida: string };
