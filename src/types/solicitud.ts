export const ESTADOS = ["PENDIENTE", "APROBADO", "RECHAZADO"] as const;

export type Estado = (typeof ESTADOS)[number];

export function esEstado(valor: unknown): valor is Estado {
  return typeof valor === "string" && (ESTADOS as readonly string[]).includes(valor);
}

/** Campos crudos del formulario que no tienen columna propia. */
export type DatosSolicitud = Record<string, string | number | boolean | null>;

/**
 * Una solicitud tal como la usa la app. Es deliberadamente independiente del
 * motor de datos: hoy las filas vienen de Google Sheets y manana pueden venir
 * de Postgres sin que las pantallas cambien.
 */
export type Solicitud = {
  id: string;
  nombre: string;
  email: string;
  datos: DatosSolicitud;
  estado: Estado;
  fechaImportacion: Date;
  fechaDecision: Date | null;
  usuarioDecisor: string | null;
};

/**
 * Alias historico: antes `Solicitud` venia de Prisma con `datos` sin tipar.
 * Se mantiene para no romper imports existentes.
 */
export type SolicitudConDatos = Solicitud;

/** Por que se rechaza un alta (lo elige quien rechaza; alimenta el informe). */
export const MOTIVOS_RECHAZO = [
  "Documentación incompleta o ilegible",
  "CUIT inválido o inactivo",
  "Informe comercial (Nosis) desfavorable",
  "No es del rubro / no califica como mayorista",
  "Zona sin cobertura o logística inviable",
  "Ya es cliente (solicitud duplicada)",
  "Referencias comerciales insuficientes",
  "Datos falsos o inconsistentes",
  "Otro",
] as const;

export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export function esMotivoRechazo(valor: unknown): valor is MotivoRechazo {
  return typeof valor === "string" && (MOTIVOS_RECHAZO as readonly string[]).includes(valor);
}

/** Un cambio de estado de una solicitud, con el motivo si fue un rechazo. */
export type DecisionAlta = {
  estado: Estado;
  motivo: MotivoRechazo | null;
  comentario: string;
  /** ISO. */
  fecha: string;
};
