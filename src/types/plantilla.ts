export const TIPOS_PLANTILLA = ["aprobado", "rechazado"] as const;

export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number];

export function esTipoPlantilla(valor: unknown): valor is TipoPlantilla {
  return typeof valor === "string" && (TIPOS_PLANTILLA as readonly string[]).includes(valor);
}

/** Plantilla de email, independiente del motor de datos. */
export type PlantillaEmail = {
  id: string;
  tipo: TipoPlantilla;
  asunto: string;
  cuerpoHtml: string;
  headerImg: string | null;
  headerAlt: string | null;
  footerImg: string | null;
  footerAlt: string | null;
};

/** Datos con los que se reemplazan los placeholders del cuerpo de la plantilla. */
export type DatosPlantilla = {
  nombre: string;
  email: string;
  usuario?: string;
  password?: string;
  texto_generico?: string;
};
