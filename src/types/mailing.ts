/**
 * Mailing masivo: a quien se le manda (destinatarios, filtrados y depurados a
 * mano) y que se le manda (una plantilla prearmada por tipo de mail).
 */

export const TIPOS_MAIL = {
  promocional: { etiqueta: "Promoción", categoria: "promocional" },
  alta_aprobada: { etiqueta: "Alta aprobada", categoria: "altas" },
  alta_rechazada: { etiqueta: "Alta rechazada", categoria: "altas" },
  estado_deuda: { etiqueta: "Estado de cuenta · con deuda", categoria: "informativo" },
  estado_al_dia: { etiqueta: "Estado de cuenta · al día", categoria: "informativo" },
  factura: { etiqueta: "Factura emitida", categoria: "informativo" },
  pedido_despachado: { etiqueta: "Pedido despachado", categoria: "informativo" },
  institucional: { etiqueta: "Institucional", categoria: "informativo" },
} as const;

export type TipoMail = keyof typeof TIPOS_MAIL;

export const CATEGORIAS_MAILING = {
  promocional: {
    etiqueta: "Promocionales",
    descripcion: "Ofertas, lanzamientos y reactivación de clientes que hace tiempo no compran.",
  },
  altas: {
    etiqueta: "Alta de clientes",
    descripcion: "Respuesta a los formularios de alta: accesos a la plataforma o derivación a distribuidores.",
  },
  informativo: {
    etiqueta: "Informativos e institucionales",
    descripcion: "Estados de cuenta, facturas, despachos y comunicados de la empresa.",
  },
} as const;

export type CategoriaMailing = keyof typeof CATEGORIAS_MAILING;

export function tiposDe(categoria: CategoriaMailing): TipoMail[] {
  return (Object.keys(TIPOS_MAIL) as TipoMail[]).filter((tipo) => TIPOS_MAIL[tipo].categoria === categoria);
}

export function esTipoMail(valor: unknown): valor is TipoMail {
  return typeof valor === "string" && Object.hasOwn(TIPOS_MAIL, valor);
}

/** Plantilla editable de un tipo de mail. */
export type PlantillaMailing = {
  asunto: string;
  /** URL http(s) o imagen subida (data:image/...) para el encabezado. */
  imagen: string;
  imagenAlt: string;
  /** Titulo de texto que se muestra si no hay imagen. */
  titulo: string;
  /** HTML con {{variables}}. */
  cuerpo: string;
  botonTexto: string;
  botonUrl: string;
  pie: string;
};

export type Factura = { numero: string; fecha: string; importe: number; vencimiento: string };
export type Pedido = { numero: string; fecha: string; transporte: string; guia: string };

/** Una persona o empresa a la que se le puede mandar un mail. */
export type Destinatario = {
  id: string;
  origen: "cliente" | "alta";
  nombre: string;
  /** Codigo de cliente ("1877"); vacio en las altas. */
  codigo: string;
  /** Vacio si no tiene: no se le puede mandar. */
  email: string;
  /** Persona de contacto. */
  contacto: string;
  rubro: string;
  /** A, B, C o vacio. */
  clasificacion: string;
  provincia: string;
  grupoVendedor: string;
  /** "OK", "TIENE DEUDA", "NO RESPONDER", "JUDICIALIZADO". */
  situacion: string;
  /** Saldo vencido en pesos (0 = al dia). */
  deuda: number;
  /** Saldo total de la cuenta corriente en pesos. */
  saldo: number;
  /** ISO; null si nunca compro. */
  ultimaCompra: string | null;
  ultimaFactura: Factura | null;
  ultimoPedido: Pedido | null;
  /** Solo altas. */
  cuit: string;
  estadoAlta: "APROBADO" | "RECHAZADO" | null;
};

export const FILTRO_DEUDA = { todos: "Con y sin deuda", con: "Con deuda", sin: "Al día" } as const;
export const FILTRO_COMPRA = {
  todas: "Cualquier última compra",
  inactivos: "Sin comprar hace +3 meses",
  activos: "Compraron en los últimos 3 meses",
} as const;

export type FiltrosMailing = {
  busqueda: string;
  rubro: string;
  provincia: string;
  grupoVendedor: string;
  deuda: keyof typeof FILTRO_DEUDA;
  compra: keyof typeof FILTRO_COMPRA;
  /** Vacio = todas. */
  clasificaciones: string[];
  /** Saca a los marcados "NO RESPONDER" o judicializados. */
  excluirBloqueados: boolean;
};

/** Una base guardada: los filtros y los que se sacaron a mano. */
export type BaseMailing = {
  id: string;
  nombre: string;
  tipo: TipoMail;
  filtros: FiltrosMailing;
  excluidos: string[];
  /** Cuantos destinatarios tenia al guardarla. */
  cantidad: number;
  /** ISO. */
  creada: string;
};
