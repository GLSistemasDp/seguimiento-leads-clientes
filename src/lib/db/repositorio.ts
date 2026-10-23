import type { DatosSolicitud, Estado, Solicitud } from "@/types/solicitud";
import type { PlantillaEmail, TipoPlantilla } from "@/types/plantilla";
import type { CambiosConsulta, Consulta, Relacion, Resultado } from "@/types/seguimiento";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";

/**
 * Contrato que tiene que cumplir cualquier motor de datos.
 *
 * Hoy la implementacion viva es Google Sheets (`./sheets`) y la de Postgres
 * (`./postgres`, via Prisma) queda lista para cuando el volumen lo pida. Las
 * pantallas y los route handlers importan siempre desde `@/lib/db/solicitudes`
 * y `@/lib/db/plantillas`, que eligen la implementacion segun `DB_BACKEND`.
 */

export type FiltrosSolicitud = {
  estado?: Estado;
  /** Busca por coincidencia parcial en nombre o email. */
  busqueda?: string;
};

export type SolicitudImportada = {
  nombre: string;
  email: string;
  datos: DatosSolicitud;
};

export type ResultadoUpsert = {
  creadas: number;
  actualizadas: number;
};

export type ConteosEstado = Record<Estado | "TODAS", number>;

export type RepositorioSolicitudes = {
  getAll(filtros?: FiltrosSolicitud): Promise<Solicitud[]>;
  getById(id: string): Promise<Solicitud | null>;
  updateEstado(id: string, estado: Estado, usuarioDecisor?: string): Promise<Solicitud>;
  /** Inserta o actualiza por email, sin pisar el estado ya decidido. */
  upsertMany(solicitudes: readonly SolicitudImportada[]): Promise<ResultadoUpsert>;
  contarPorEstado(): Promise<ConteosEstado>;
};

export type CambiosPlantilla = Partial<Omit<PlantillaEmail, "id" | "tipo">>;

export type RepositorioPlantillas = {
  get(tipo: TipoPlantilla): Promise<PlantillaEmail>;
  getAll(): Promise<PlantillaEmail[]>;
  update(tipo: TipoPlantilla, cambios: CambiosPlantilla): Promise<PlantillaEmail>;
};

/**
 * Seguimiento de consultas de clientes. A diferencia de las solicitudes, la
 * planilla es la del equipo de atencion: la app la lee y solo escribe la
 * casilla de respuesta y las observaciones.
 */
export type RepositorioSeguimiento = {
  getAll(): Promise<Consulta[]>;
  getById(id: string): Promise<Consulta | null>;
  /** `cierre` (resultado y relacion) solo lo guarda Postgres: lo copia al historial del cliente. */
  update(id: string, cambios: CambiosConsulta, cierre?: { resultado: Resultado | null; relacion: Relacion | null }): Promise<Consulta>;
  /** Respuestas tipo propias de la fuente (hojas "Rtas" de la planilla). */
  getRespuestas?(): Promise<RespuestaTipo[]>;
};

export type Backend = "sheets" | "postgres" | "demo";

/**
 * Motor de datos activo. Por defecto Sheets, que es con lo que arranca el MVP.
 * "demo" guarda todo en memoria con datos de ejemplo, para presentar la app
 * sin credenciales de Google.
 */
export function backendActivo(): Backend {
  const valor = process.env.DB_BACKEND;
  return valor === "postgres" || valor === "demo" ? valor : "sheets";
}

/** Aplica los filtros en memoria: Sheets no sabe filtrar y Postgres ya filtro antes. */
export function filtrarEnMemoria(
  solicitudes: readonly Solicitud[],
  filtros: FiltrosSolicitud = {},
): Solicitud[] {
  const busqueda = filtros.busqueda?.trim().toLowerCase();

  return solicitudes.filter((solicitud) => {
    if (filtros.estado && solicitud.estado !== filtros.estado) return false;
    if (!busqueda) return true;
    return (
      solicitud.nombre.toLowerCase().includes(busqueda) ||
      solicitud.email.toLowerCase().includes(busqueda)
    );
  });
}

/** Cuenta por estado a partir de una lista ya cargada. */
export function contarLista(solicitudes: readonly Solicitud[]): ConteosEstado {
  const conteos: ConteosEstado = {
    TODAS: solicitudes.length,
    PENDIENTE: 0,
    APROBADO: 0,
    RECHAZADO: 0,
  };
  for (const solicitud of solicitudes) {
    conteos[solicitud.estado] += 1;
  }
  return conteos;
}

/** Plantillas iniciales, compartidas por todas las implementaciones. */
export const PLANTILLAS_POR_DEFECTO: Record<TipoPlantilla, Omit<PlantillaEmail, "id">> = {
  aprobado: {
    tipo: "aprobado",
    asunto: "Tu solicitud de alta fue aprobada",
    cuerpoHtml:
      "<p>Hola {{nombre}},</p>" +
      "<p>Tu solicitud de alta fue aprobada. Estos son tus datos de acceso a la plataforma:</p>" +
      "<p><strong>Usuario:</strong> {{usuario}}<br><strong>Contrase&ntilde;a:</strong> {{password}}</p>" +
      "<p>{{texto_generico}}</p>",
    headerImg: null,
    headerAlt: null,
    footerImg: null,
    footerAlt: null,
  },
  rechazado: {
    tipo: "rechazado",
    asunto: "Sobre tu solicitud de alta",
    cuerpoHtml:
      "<p>Hola {{nombre}},</p>" +
      "<p>Gracias por completar el formulario de alta. En esta oportunidad no podemos avanzar con tu solicitud.</p>" +
      "<p>{{texto_generico}}</p>",
    headerImg: null,
    headerAlt: null,
    footerImg: null,
    footerAlt: null,
  },
};
