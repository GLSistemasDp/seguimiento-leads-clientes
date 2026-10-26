/**
 * Filas de la base Postgres del CRM (db/schema.sql), tal como las devuelve
 * `pg`: numeric y bigint llegan como texto, timestamptz como Date, jsonb ya
 * parseado. Las pantallas no usan estos tipos: los repositorios los pasan a
 * los de dominio (Consulta, Reclamo...).
 */

import type { AccionReclamo, CanalIngreso, MotivoLogistico, Severidad } from "@/types/reclamo";
import type { Relacion, Resultado } from "@/types/seguimiento";

/** numeric de Postgres: `pg` lo entrega como string para no perder precision. */
export type Numerico = string;

export type GrupoReclamo = "CALIDAD" | "LOGISTICA" | "FACTURACION" | "OTROS";
export type TipoInteraccion = "finalizada" | "reabierta" | "nota";
export type OrigenReclamo = "cliente" | "intranet";

// --- Catalogos -------------------------------------------------------------------

export interface GrupoVendedorRow {
  id: number;
  nombre: string;
}

export interface HitoRow {
  id: number;
  nombre: string;
  orden: number;
}

export interface EppRow {
  id: number;
  nombre: string;
}

export interface TipoReclamoRow {
  id: number;
  nombre: string;
  grupo: GrupoReclamo;
}

export interface TransportistaRow {
  id: number;
  nombre: string;
}

export interface DepositoRow {
  id: number;
  nombre: string;
}

export interface EmpleadoRow {
  id: number;
  nombre: string;
  area: string;
  activo: boolean;
}

// --- Clientes y productos ----------------------------------------------------------

export interface ClienteRow {
  id: number;
  codigo: string | null;
  nombre: string;
  lista_precio: string;
  clasificacion: "" | "A" | "B" | "C";
  grupo_vendedor_id: number | null;
  grupo_whatsapp: string;
  grupo_whatsapp2: string;
  link_whatsapp: string;
  situacion: string;
  observacion: string;
  actividad: string;
  categoria: string;
  condicion_pago: string;
  limite_credito: string;
  deuda: string;
  cuit: string;
  creado_en: Date;
  actualizado_en: Date;
}

export interface ProductoRow {
  id: number;
  codigo: string;
  descripcion: string;
  epp_id: number | null;
}

export interface LoteRow {
  id: number;
  producto_id: number;
  codigo: string;
}

// --- Seguimiento ------------------------------------------------------------------------

/** Cola operativa: lo que carga el bot de WhatsApp y todavia no se archivo. */
export interface ConsultaSeguimientoRow {
  id: string;
  cliente_id: number | null;
  cliente_texto: string;
  fecha: Date;
  encargado: string;
  grupo_whatsapp: string;
  consulta: string;
  hito_id: number | null;
  hito: string;
  respondida: boolean;
  dias_demora: number | null;
  observaciones: string;
  tentativo_respuesta: string;
  resultado: Resultado | null;
  relacion: Relacion | null;
  respondida_en: Date | null;
  archivada_en: Date | null;
  origen: string;
  mensaje_id: string | null;
  ingresada_en: Date;
  /** Clasificacion del mensaje al entrar (migracion 2). */
  relacion_ia: Relacion | null;
  hito_ia: string;
  resumen_ia: string;
  /** "ia" o "reglas"; null si no se clasifico. */
  clasificado_por: "ia" | "reglas" | null;
}

/** Historial permanente por cliente (finalizadas, reaperturas y notas). */
export interface ChatInteraccionRow {
  id: string;
  consulta_id: string;
  cliente_id: number | null;
  cliente_texto: string;
  tipo: TipoInteraccion;
  fecha_consulta: Date | null;
  consulta: string;
  hito: string;
  encargado: string;
  grupo_whatsapp: string;
  resultado: Resultado | null;
  relacion: Relacion | null;
  observacion: string;
  registrado_en: Date;
  /** Enriquecimiento con IA (iteracion posterior). Hoy {}. */
  payload_ai: Record<string, unknown>;
}

// --- Reclamos ------------------------------------------------------------------------------

export interface ReclamoRow {
  id: string;
  numero: string;
  /** AAAA-MM-DD (date, ver `types.setTypeParser` en el repositorio). */
  fecha: string;
  cliente_id: number | null;
  razon_social: string;
  numero_cliente: string;
  sucursal: string;
  transporte_informado: string;
  transportista_id: number | null;
  contacto: string;
  cargo: string;
  telefono: string;
  email: string;
  orden_compra: string;
  pedido: string;
  factura: string;
  remito: string;
  tipo_reclamo_id: number;
  tipo_calidad_id: number | null;
  detalle: string;
  origen: OrigenReclamo;
  consulta_id: string | null;
  calidad_causa: string | null;
  procedente: boolean | null;
  acciones_correctivas: unknown[];
  cierre: Record<string, string | null>;
  responsable_id: number | null;
  severidad: Severidad | null;
  epp_id: number | null;
  canal_ingreso: CanalIngreso | null;
  deposito_id: number | null;
  motivo_logistico: MotivoLogistico | null;
  dias_demora: Numerico | null;
  monto_nc: Numerico | null;
  numero_nc: string;
  costo_adicional: Numerico | null;
  cerrado: boolean;
  resuelto_en: Date | null;
  cerrado_en: Date | null;
  adjuntos: unknown[];
  /** Enriquecimiento con IA (iteracion posterior). Hoy {}. */
  detalle_ia: Record<string, unknown>;
  creado_en: Date;
  actualizado_en: Date;
}

export interface ReclamoProductoRow {
  id: string;
  reclamo_id: string;
  orden: number;
  producto_id: number | null;
  codigo: string;
  descripcion: string;
  lote_id: number | null;
  lote: string;
  cantidad_facturada: Numerico;
  cantidad_reclamo: Numerico;
}

export interface IndicacionReclamoRow {
  id: string;
  clave: string;
  reclamo_id: string | null;
  consulta_id: string | null;
  accion: AccionReclamo;
  comentario: string;
  fecha: Date;
}

export interface SustitutoOfrecidoRow {
  id: string;
  indicacion_id: string;
  orden: number;
  producto: string;
  observacion: string;
}

// --- Vistas -------------------------------------------------------------------------------

export type PeriodoDias = 30 | 90 | 365;

/** count() llega como bigint (string); avg() como numeric (string) o null. */
export interface VwReclamosKpisRow {
  periodo_dias: PeriodoDias;
  total: string;
  activos: string;
  activos_mes_pasado: string;
  resueltos: string;
  resolucion_promedio: Numerico | null;
  resolucion_calidad: Numerico | null;
  resolucion_logistica: Numerico | null;
  resolucion_facturacion: Numerico | null;
  en_analisis: string;
  resueltos_del_periodo: string;
  cerrados_del_periodo: string;
  calidad: string;
  calidad_sin_lote: string;
  calidad_sin_severidad: string;
  logistica: string;
  demora_promedio: Numerico | null;
}

export interface VwReclamosActivosDiariosRow {
  dia: string;
  activos: string;
}

export interface VwReclamosPorGrupoRow {
  periodo_dias: PeriodoDias;
  grupo: GrupoReclamo;
  cantidad: string;
}

export interface VwReclamosPorClasificacionRow {
  periodo_dias: PeriodoDias;
  clasificacion: string;
  grupo: GrupoReclamo;
  cantidad: string;
}

export interface VwReclamosPorEppRow {
  periodo_dias: PeriodoDias;
  tipo_epp: string;
  cantidad: string;
}

export interface VwTopLotesReclamosRow {
  periodo_dias: PeriodoDias;
  lote: string;
  producto: string;
  cantidad: string;
}

export interface VwReclamosSeveridadRow {
  periodo_dias: PeriodoDias;
  severidad: Severidad;
  cantidad: string;
}

export interface VwReincidenciaProductoRow {
  periodo_dias: PeriodoDias;
  tipo: "Cliente" | "Producto";
  etiqueta: string;
  cantidad: string;
}

export interface VwLogisticaPorTransportistaRow {
  periodo_dias: PeriodoDias;
  transportista: string;
  cantidad: string;
  demora_promedio: Numerico | null;
  faltante: string;
  sobrante: string;
  dano_transito: string;
  demora: string;
}

export interface VwLogisticaPorDepositoRow {
  periodo_dias: PeriodoDias;
  deposito: string;
  cantidad: string;
}

export interface VwFacturacionResumenRow {
  periodo_dias: PeriodoDias;
  monto_nc: Numerico;
  cantidad_nc: string;
  total: string;
  error_monto: string;
  otros_motivos: string;
}

export interface VwRankingClientesReclamosRow {
  periodo_dias: PeriodoDias;
  cliente: string;
  cliente_codigo: string;
  cantidad: string;
  costo: Numerico;
}

export interface VwReclamosPorResponsableRow {
  responsable: string;
  cantidad: string;
}

export interface VwReclamosPorCanalRow {
  periodo_dias: PeriodoDias;
  canal: CanalIngreso;
  cantidad: string;
}

export interface MvReclamosEvolucionMensualRow {
  /** Primer dia del mes, AAAA-MM-DD. */
  mes: string;
  grupo: GrupoReclamo;
  cantidad: string;
  monto_nc: Numerico;
}

export interface VwHistoricoTrimestralRow {
  trimestre: string;
  cantidad: Numerico;
}

export interface VwSeguimientoKpisRow {
  pendientes: string;
  chats_pendientes: string;
  demoradas: string;
  reclamos_pendientes: string;
  finalizadas_hoy: string;
  archivadas_en_cola: string;
  chats_en_riesgo: string;
}
