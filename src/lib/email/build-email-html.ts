import { layoutEmail, templateAprobado, templateRechazado } from "@/lib/email/templates";
import type { BotonEmail, DatosTemplate } from "@/lib/email/templates";
import { escapeHtml, sanitizeHtml } from "@/lib/utils/html";
import type { DatosPlantilla, PlantillaEmail, TipoPlantilla } from "@/types/plantilla";

/** Placeholders que el equipo puede usar en el cuerpo de una plantilla. */
export const PLACEHOLDERS = [
  "nombre",
  "email",
  "usuario",
  "password",
  "texto_generico",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * Estilos inline que se le inyectan a las etiquetas que el equipo escribe a
 * mano en la plantilla. Los clientes de correo no heredan estilos de forma
 * confiable, asi que cada etiqueta tiene que traer el suyo.
 */
const ESTILOS_INLINE: Record<string, string> = {
  p: "margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1f2933;",
  h1: "margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#1f2933;",
  h2: "margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#1f2933;",
  h3: "margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:#1f2933;",
  ul: "margin:0 0 14px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1f2933;",
  ol: "margin:0 0 14px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1f2933;",
  li: "margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1f2933;",
  a: "color:#1d4ed8;text-decoration:underline;",
};

/** Agrega el estilo inline correspondiente a las etiquetas que no lo traen. */
export function inlinearEstilos(html: string): string {
  let resultado = html;
  for (const [etiqueta, estilo] of Object.entries(ESTILOS_INLINE)) {
    const sinStyle = new RegExp(`<${etiqueta}(?![a-z0-9])((?:(?!style=)[^>])*)>`, "gi");
    resultado = resultado.replace(sinStyle, `<${etiqueta}$1 style="${estilo}">`);
  }
  return resultado;
}

function valorPlaceholder(clave: Placeholder, datos: DatosPlantilla): string {
  switch (clave) {
    case "nombre":
      return datos.nombre;
    case "email":
      return datos.email;
    case "usuario":
      return datos.usuario ?? "";
    case "password":
      return datos.password ?? "";
    case "texto_generico":
      return datos.texto_generico ?? "";
  }
}

/**
 * Reemplaza los `{{placeholder}}` de una plantilla por los datos de la
 * solicitud. El valor se escapa siempre: son datos del cliente, no HTML.
 * Los saltos de linea del texto generico se convierten en `<br>`.
 */
export function reemplazarPlaceholders(plantilla: string, datos: DatosPlantilla): string {
  return plantilla.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, clave: string) => {
    const normalizada = clave.toLowerCase() as Placeholder;
    if (!(PLACEHOLDERS as readonly string[]).includes(normalizada)) {
      return original;
    }
    return escapeHtml(valorPlaceholder(normalizada, datos)).replace(/\n/g, "<br>");
  });
}

/** Reemplaza los placeholders del asunto, que es texto plano. */
export function reemplazarEnAsunto(asunto: string, datos: DatosPlantilla): string {
  return asunto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, clave: string) => {
    const normalizada = clave.toLowerCase() as Placeholder;
    if (!(PLACEHOLDERS as readonly string[]).includes(normalizada)) {
      return original;
    }
    return valorPlaceholder(normalizada, datos);
  });
}

export type OpcionesEmail = {
  /** Sobreescribe las imagenes guardadas en la plantilla (campos del generador). */
  headerImg?: string | null;
  headerAlt?: string | null;
  footerImg?: string | null;
  footerAlt?: string | null;
  boton?: BotonEmail | null;
};

export type EmailArmado = {
  asunto: string;
  html: string;
};

/**
 * Arma el mail final a partir de la plantilla guardada en la base.
 * Es una funcion pura y sin dependencias de servidor: la usa tanto el
 * generador en el cliente (vista previa en vivo) como el lado servidor.
 */
export function buildEmailHtml(
  plantilla: PlantillaEmail,
  datos: DatosPlantilla,
  opciones: OpcionesEmail = {},
): EmailArmado {
  const cuerpo = inlinearEstilos(
    sanitizeHtml(reemplazarPlaceholders(plantilla.cuerpoHtml, datos)),
  );
  const asunto = reemplazarEnAsunto(plantilla.asunto, datos);

  const html = layoutEmail({
    asunto,
    preheader: asunto,
    cuerpoHtml: cuerpo,
    headerImg: opciones.headerImg ?? plantilla.headerImg,
    headerAlt: opciones.headerAlt ?? plantilla.headerAlt,
    footerImg: opciones.footerImg ?? plantilla.footerImg,
    footerAlt: opciones.footerAlt ?? plantilla.footerAlt,
    headerTexto: plantilla.tipo === "aprobado" ? "Solicitud aprobada" : "Sobre tu solicitud",
    footerTexto: "Este mail fue enviado por el equipo comercial.",
    boton: opciones.boton ?? null,
  });

  return { asunto, html };
}

/**
 * Fallback sin base de datos: arma el mail con los templates base.
 * Se usa si la plantilla todavia no fue creada.
 */
export function buildEmailHtmlBase(tipo: TipoPlantilla, datos: DatosTemplate): string {
  return tipo === "aprobado" ? templateAprobado(datos) : templateRechazado(datos);
}
