import { escapeAttr, escapeHtml, urlSegura } from "@/lib/utils/html";

export const ANCHO_EMAIL = 600;

const FUENTE = "Arial, Helvetica, sans-serif";
const COLOR_TEXTO = "#1f2933";
const COLOR_SUAVE = "#6b7280";
const COLOR_BORDE = "#e5e7eb";
const COLOR_FONDO = "#f4f5f7";
const COLOR_MARCA = "#1d4ed8";

export type BotonEmail = {
  texto: string;
  url: string;
};

export type DatosLayout = {
  asunto: string;
  /** Texto oculto que los clientes muestran junto al asunto en la bandeja. */
  preheader: string;
  /** Cuerpo ya armado en HTML (parrafos, tablas, etc.). */
  cuerpoHtml: string;
  headerImg?: string | null;
  headerAlt?: string | null;
  footerImg?: string | null;
  footerAlt?: string | null;
  /** Texto de reemplazo cuando no hay imagen de encabezado. */
  headerTexto?: string;
  /** Texto de reemplazo cuando no hay imagen de pie. */
  footerTexto?: string;
  boton?: BotonEmail | null;
};

/**
 * Boton "bulletproof": VML para Outlook (que ignora el padding en <a>) y un
 * <a> comun para el resto de los clientes.
 */
export function botonBulletproof(boton: BotonEmail): string {
  const url = urlSegura(boton.url);
  if (!url) return "";
  const href = escapeAttr(url);
  const texto = escapeHtml(boton.texto);

  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" stroke="f" fillcolor="${COLOR_MARCA}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FUENTE};font-size:16px;font-weight:bold;">${texto}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="background-color:${COLOR_MARCA};border-radius:6px;color:#ffffff;display:inline-block;font-family:${FUENTE};font-size:16px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:240px;-webkit-text-size-adjust:none;">${texto}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function bloqueHeader(datos: DatosLayout): string {
  const img = urlSegura(datos.headerImg);
  if (img) {
    return `<img src="${escapeAttr(img)}" alt="${escapeAttr(datos.headerAlt ?? "")}" width="${ANCHO_EMAIL}" style="display:block;width:100%;max-width:${ANCHO_EMAIL}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
  }
  const texto = datos.headerTexto?.trim();
  if (!texto) return "";
  return `<div style="font-family:${FUENTE};font-size:20px;font-weight:bold;color:${COLOR_TEXTO};padding:24px 32px;">${escapeHtml(texto)}</div>`;
}

function bloqueFooter(datos: DatosLayout): string {
  const img = urlSegura(datos.footerImg);
  if (img) {
    return `<img src="${escapeAttr(img)}" alt="${escapeAttr(datos.footerAlt ?? "")}" width="${ANCHO_EMAIL}" style="display:block;width:100%;max-width:${ANCHO_EMAIL}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
  }
  const texto = datos.footerTexto?.trim();
  if (!texto) return "";
  return `<div style="font-family:${FUENTE};font-size:12px;line-height:18px;color:${COLOR_SUAVE};padding:20px 32px;">${escapeHtml(texto).replace(/\n/g, "<br>")}</div>`;
}

/**
 * Envoltorio comun de los mails. Layout basado en tablas, estilos inline,
 * ancho fijo de 600px y sin background-image: lo que soportan Gmail, Outlook
 * (motor Word), Yahoo y Apple Mail por igual.
 */
export function layoutEmail(datos: DatosLayout): string {
  const boton = datos.boton ? botonBulletproof(datos.boton) : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(datos.asunto)}</title>
<!--[if mso]>
<style type="text/css">body,table,td,div,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLOR_FONDO};">
<div style="display:none;font-size:1px;color:${COLOR_FONDO};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(datos.preheader)}</div>
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">&#8203;&#8204;&#8205;&#8203;&#8204;&#8205;&#8203;&#8204;&#8205;&#8203;&#8204;&#8205;</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${COLOR_FONDO};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${ANCHO_EMAIL}"><tr><td><![endif]-->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${ANCHO_EMAIL}" style="width:${ANCHO_EMAIL}px;max-width:${ANCHO_EMAIL}px;background-color:#ffffff;border:1px solid ${COLOR_BORDE};border-radius:8px;">
        <tr>
          <td align="left" style="padding:0;">${bloqueHeader(datos)}</td>
        </tr>
        <tr>
          <td align="left" style="padding:8px 32px 32px 32px;font-family:${FUENTE};font-size:15px;line-height:23px;color:${COLOR_TEXTO};">
${datos.cuerpoHtml}
${boton}
          </td>
        </tr>
      </table>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${ANCHO_EMAIL}" style="width:${ANCHO_EMAIL}px;max-width:${ANCHO_EMAIL}px;">
        <tr>
          <td align="left" style="padding:0;">${bloqueFooter(datos)}</td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

export type DatosTemplate = {
  nombre: string;
  usuario?: string;
  password?: string;
  textoGenerico?: string;
  headerImg?: string | null;
  headerAlt?: string | null;
  footerImg?: string | null;
  footerAlt?: string | null;
  boton?: BotonEmail | null;
};

/** Bloque de usuario/contrasena, en tabla para que Outlook lo respete. */
export function bloqueCredenciales(usuario?: string, password?: string): string {
  if (!usuario && !password) return "";
  const filas: string[] = [];
  if (usuario) {
    filas.push(
      `<tr><td style="padding:4px 0;font-family:${FUENTE};font-size:15px;color:${COLOR_SUAVE};width:110px;">Usuario</td><td style="padding:4px 0;font-family:${FUENTE};font-size:15px;color:${COLOR_TEXTO};font-weight:bold;">${escapeHtml(usuario)}</td></tr>`,
    );
  }
  if (password) {
    filas.push(
      `<tr><td style="padding:4px 0;font-family:${FUENTE};font-size:15px;color:${COLOR_SUAVE};width:110px;">Contrase&ntilde;a</td><td style="padding:4px 0;font-family:${FUENTE};font-size:15px;color:${COLOR_TEXTO};font-weight:bold;">${escapeHtml(password)}</td></tr>`,
    );
  }
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background-color:#f8fafc;border:1px solid ${COLOR_BORDE};border-radius:6px;">
  <tr><td style="padding:16px 20px;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${filas.join("")}</table>
  </td></tr>
</table>`;
}

function parrafo(texto: string): string {
  return `<p style="margin:0 0 14px 0;font-family:${FUENTE};font-size:15px;line-height:23px;color:${COLOR_TEXTO};">${escapeHtml(texto).replace(/\n/g, "<br>")}</p>`;
}

/** Template base de aprobacion: fallback si la base no tiene plantilla guardada. */
export function templateAprobado(datos: DatosTemplate): string {
  const cuerpo = [
    parrafo(`Hola ${datos.nombre},`),
    parrafo("Tu solicitud de alta fue aprobada. Estos son tus datos de acceso a la plataforma:"),
    bloqueCredenciales(datos.usuario, datos.password),
    datos.textoGenerico ? parrafo(datos.textoGenerico) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return layoutEmail({
    asunto: "Tu solicitud de alta fue aprobada",
    preheader: "Ya podes ingresar a la plataforma con los datos que te enviamos.",
    cuerpoHtml: cuerpo,
    headerImg: datos.headerImg,
    headerAlt: datos.headerAlt,
    footerImg: datos.footerImg,
    footerAlt: datos.footerAlt,
    headerTexto: "Solicitud aprobada",
    footerTexto: "Este mail fue enviado por el equipo comercial.",
    boton: datos.boton,
  });
}

/** Template base de rechazo: fallback si la base no tiene plantilla guardada. */
export function templateRechazado(datos: DatosTemplate): string {
  const cuerpo = [
    parrafo(`Hola ${datos.nombre},`),
    parrafo(
      "Gracias por completar el formulario de alta. En esta oportunidad no podemos avanzar con tu solicitud.",
    ),
    datos.textoGenerico ? parrafo(datos.textoGenerico) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return layoutEmail({
    asunto: "Sobre tu solicitud de alta",
    preheader: "Novedades sobre la solicitud de alta que enviaste.",
    cuerpoHtml: cuerpo,
    headerImg: datos.headerImg,
    headerAlt: datos.headerAlt,
    footerImg: datos.footerImg,
    footerAlt: datos.footerAlt,
    headerTexto: "Sobre tu solicitud",
    footerTexto: "Este mail fue enviado por el equipo comercial.",
    boton: datos.boton,
  });
}
