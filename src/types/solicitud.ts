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
