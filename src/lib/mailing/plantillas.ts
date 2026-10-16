import { inlinearEstilos } from "@/lib/email/build-email-html";
import { bloqueCredenciales, layoutEmail } from "@/lib/email/templates";
import { DATOS_PAGO, distribuidoresPara, grupoPorProvincia, vendedorDe } from "@/lib/mailing/contactos";
import { escapeHtml, sanitizeHtml } from "@/lib/utils/html";
import type { Destinatario, PlantillaMailing, TipoMail } from "@/types/mailing";

/**
 * Plantillas prearmadas de cada tipo de mail, las variables que admite cada
 * una y el armado final del HTML. Corre igual en el navegador (vista previa
 * en vivo) y en el servidor (cuando se haga el envio).
 */

export type Variable = { clave: string; etiqueta: string };

const V = {
  nombre: { clave: "nombre", etiqueta: "Razón social" },
  contacto: { clave: "contacto", etiqueta: "Persona de contacto" },
  codigo_cliente: { clave: "codigo_cliente", etiqueta: "N° de cliente" },
  rubro: { clave: "rubro", etiqueta: "Rubro" },
  vendedor: { clave: "vendedor", etiqueta: "Vendedor" },
  vendedor_email: { clave: "vendedor_email", etiqueta: "Mail del vendedor" },
  vendedor_whatsapp: { clave: "vendedor_whatsapp", etiqueta: "WhatsApp del vendedor" },
  ultima_compra: { clave: "ultima_compra", etiqueta: "Fecha última compra" },
  usuario: { clave: "usuario", etiqueta: "Usuario (CUIT)" },
  password: { clave: "password", etiqueta: "Contraseña" },
  credenciales: { clave: "credenciales", etiqueta: "Recuadro usuario + contraseña" },
  link_plataforma: { clave: "link_plataforma", etiqueta: "Link a la plataforma" },
  provincia: { clave: "provincia", etiqueta: "Provincia" },
  distribuidores: { clave: "distribuidores", etiqueta: "Distribuidores de su zona" },
  deuda: { clave: "deuda", etiqueta: "Saldo vencido" },
  saldo: { clave: "saldo", etiqueta: "Saldo total" },
  datos_pago: { clave: "datos_pago", etiqueta: "Datos para el pago" },
  numero_factura: { clave: "numero_factura", etiqueta: "N° de factura" },
  importe_factura: { clave: "importe_factura", etiqueta: "Importe factura" },
  vencimiento_factura: { clave: "vencimiento_factura", etiqueta: "Vencimiento factura" },
  numero_pedido: { clave: "numero_pedido", etiqueta: "N° de pedido" },
  transporte: { clave: "transporte", etiqueta: "Transporte" },
  guia: { clave: "guia", etiqueta: "N° de guía" },
  fecha_hoy: { clave: "fecha_hoy", etiqueta: "Fecha de hoy" },
} satisfies Record<string, Variable>;

const VENDEDOR = [V.vendedor, V.vendedor_email, V.vendedor_whatsapp];

export const VARIABLES: Record<TipoMail, Variable[]> = {
  promocional: [V.nombre, V.contacto, V.rubro, V.ultima_compra, ...VENDEDOR],
  alta_aprobada: [V.nombre, V.contacto, V.usuario, V.password, V.credenciales, V.link_plataforma, ...VENDEDOR],
  alta_rechazada: [V.nombre, V.contacto, V.provincia, V.distribuidores],
  estado_deuda: [V.nombre, V.contacto, V.codigo_cliente, V.deuda, V.saldo, V.datos_pago, V.fecha_hoy, ...VENDEDOR],
  estado_al_dia: [V.nombre, V.contacto, V.codigo_cliente, V.saldo, V.fecha_hoy, ...VENDEDOR],
  factura: [V.nombre, V.contacto, V.numero_factura, V.importe_factura, V.vencimiento_factura, ...VENDEDOR],
  pedido_despachado: [V.nombre, V.contacto, V.numero_pedido, V.transporte, V.guia, ...VENDEDOR],
  institucional: [V.nombre, V.contacto, V.fecha_hoy, ...VENDEDOR],
};

/** Variables que se reemplazan por un bloque HTML armado por la app (no se escapan). */
const VARIABLES_HTML = new Set(["credenciales", "distribuidores"]);

const PIE = "Industrias De Pascale · Protección Industrial\nRecibís este mail porque sos cliente de De Pascale.";

export const PLANTILLAS_BASE: Record<TipoMail, PlantillaMailing> = {
  promocional: {
    asunto: "{{contacto}}, tenemos novedades en protección para {{nombre}}",
    imagen: "",
    imagenAlt: "Promoción De Pascale",
    titulo: "Novedades del mes",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Este mes sumamos nuevas líneas de guantes, anteojos y señalización vial con precios especiales para clientes de <strong>{{rubro}}</strong>.</p>\n<ul>\n<li>Guantes anticorte y moteados: bonificación adicional por bulto cerrado.</li>\n<li>Anteojos y protección auditiva: nuevos modelos en stock.</li>\n<li>Señalización vial: conos, balizas y cadenas con entrega inmediata.</li>\n</ul>\n<p>Tu última compra fue el {{ultima_compra}}. Si querés que te armemos una cotización, respondé este mail o escribile a {{vendedor}} por WhatsApp al {{vendedor_whatsapp}}.</p>",
    botonTexto: "Ver catálogo",
    botonUrl: "https://www.depascale.com.ar",
    pie: PIE,
  },
  alta_aprobada: {
    asunto: "¡Bienvenido a De Pascale! Tu cuenta ya está activa",
    imagen: "",
    imagenAlt: "Bienvenido a De Pascale",
    titulo: "Tu alta fue aprobada",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Nos alegra informarte que la solicitud de alta de <strong>{{nombre}}</strong> fue aprobada. Ya podés ingresar a nuestra plataforma web para ver precios, stock y hacer tus pedidos.</p>\n{{credenciales}}\n<p>Te recomendamos cambiar la contraseña la primera vez que ingreses.</p>\n<p>Tu vendedor asignado es <strong>{{vendedor}}</strong>. Podés escribirle a {{vendedor_email}} o por WhatsApp al {{vendedor_whatsapp}}.</p>",
    botonTexto: "Ingresar a la plataforma",
    botonUrl: "{{link_plataforma}}",
    pie: PIE,
  },
  alta_rechazada: {
    asunto: "Sobre tu solicitud de alta en De Pascale",
    imagen: "",
    imagenAlt: "De Pascale",
    titulo: "Gracias por tu interés",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Gracias por completar la solicitud de alta de <strong>{{nombre}}</strong>. En esta oportunidad no podemos darte de alta como cliente directo.</p>\n<p>Igualmente podés acceder a toda nuestra línea de productos a través de los distribuidores autorizados de tu zona ({{provincia}}):</p>\n{{distribuidores}}\n<p>Muchas gracias por elegirnos.</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
  estado_deuda: {
    asunto: "Estado de cuenta {{nombre}} · saldo vencido",
    imagen: "",
    imagenAlt: "Estado de cuenta",
    titulo: "Estado de cuenta",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Te escribimos para informarte que, al {{fecha_hoy}}, la cuenta N° {{codigo_cliente}} de <strong>{{nombre}}</strong> registra un <strong>saldo vencido de {{deuda}}</strong> (saldo total {{saldo}}).</p>\n<p>Para regularizarlo: {{datos_pago}}.</p>\n<p>Si ya realizaste el pago, enviános el comprobante respondiendo este mail para imputarlo. Ante cualquier duda, comunicate con {{vendedor}} ({{vendedor_whatsapp}}).</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
  estado_al_dia: {
    asunto: "Tu cuenta en De Pascale está al día",
    imagen: "",
    imagenAlt: "Estado de cuenta",
    titulo: "Estado de cuenta",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Te confirmamos que al {{fecha_hoy}} la cuenta N° {{codigo_cliente}} de <strong>{{nombre}}</strong> no registra saldos vencidos. Saldo actual: {{saldo}}.</p>\n<p>¡Gracias por tu cumplimiento! Seguimos a disposición a través de {{vendedor}} ({{vendedor_email}}).</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
  factura: {
    asunto: "Factura {{numero_factura}} · De Pascale",
    imagen: "",
    imagenAlt: "Factura",
    titulo: "Nueva factura",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Te enviamos la factura <strong>{{numero_factura}}</strong> por <strong>{{importe_factura}}</strong>, con vencimiento el {{vencimiento_factura}}. La encontrás adjunta y también en la plataforma web.</p>\n<p>Cualquier consulta, escribile a {{vendedor}} ({{vendedor_email}}).</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
  pedido_despachado: {
    asunto: "Tu pedido {{numero_pedido}} ya salió",
    imagen: "",
    imagenAlt: "Pedido despachado",
    titulo: "¡Tu pedido está en camino!",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>El pedido <strong>{{numero_pedido}}</strong> de {{nombre}} fue despachado por <strong>{{transporte}}</strong>. N° de guía: <strong>{{guia}}</strong>.</p>\n<p>Al recibirlo, controlá la mercadería contra el remito. Si algo no coincide, avisanos dentro de las 48 horas respondiendo este mail o por WhatsApp a {{vendedor_whatsapp}}.</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
  institucional: {
    asunto: "Comunicado de Industrias De Pascale",
    imagen: "",
    imagenAlt: "Comunicado",
    titulo: "Comunicado",
    cuerpo:
      "<p>Hola {{contacto}},</p>\n<p>Queremos contarte una novedad de Industrias De Pascale: [escribí acá el comunicado: horarios de atención, cambios de lista de precios, feriados, mudanza de depósito…].</p>\n<p>Gracias por seguir eligiéndonos.</p>",
    botonTexto: "",
    botonUrl: "",
    pie: PIE,
  },
};

// --- Valores de las variables ------------------------------------------------

const PESOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function fecha(valor: string | null | undefined): string {
  return valor ? FECHA.format(new Date(valor)) : "—";
}

export type Extras = {
  /** Contraseña generada para el alta (una por destinatario). */
  password?: string;
  linkPlataforma: string;
};

function bloqueDistribuidores(provincia: string): string {
  const filas = distribuidoresPara(provincia)
    .map(
      (distribuidor) =>
        `<tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1f2933;"><strong>${escapeHtml(distribuidor.nombre)}</strong><br>${escapeHtml(distribuidor.ciudad)} · Tel. ${escapeHtml(distribuidor.telefono)}<br><a href="mailto:${escapeHtml(distribuidor.email)}" style="color:#1d4ed8;">${escapeHtml(distribuidor.email)}</a></td></tr>`,
    )
    .join("");
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 16px 0;border:1px solid #e5e7eb;border-radius:6px;">${filas}</table>`;
}

export function valoresDe(destinatario: Destinatario, extras: Extras): Record<string, string> {
  // Las altas todavia no tienen grupo vendedor: se asigna por provincia.
  const contacto = vendedorDe(destinatario.grupoVendedor || grupoPorProvincia(destinatario.provincia));
  const usuario = destinatario.cuit.replace(/\D/g, "");
  return {
    nombre: destinatario.nombre,
    contacto: destinatario.contacto || destinatario.nombre,
    codigo_cliente: destinatario.codigo || "—",
    rubro: destinatario.rubro || "su rubro",
    vendedor: contacto.nombre,
    vendedor_email: contacto.email,
    vendedor_whatsapp: contacto.whatsapp,
    ultima_compra: fecha(destinatario.ultimaCompra),
    usuario,
    password: extras.password ?? "",
    credenciales: bloqueCredenciales(usuario, extras.password),
    link_plataforma: extras.linkPlataforma,
    provincia: destinatario.provincia || "tu provincia",
    distribuidores: bloqueDistribuidores(destinatario.provincia),
    deuda: PESOS.format(destinatario.deuda),
    saldo: PESOS.format(destinatario.saldo),
    datos_pago: DATOS_PAGO,
    numero_factura: destinatario.ultimaFactura?.numero ?? "—",
    importe_factura: destinatario.ultimaFactura ? PESOS.format(destinatario.ultimaFactura.importe) : "—",
    vencimiento_factura: fecha(destinatario.ultimaFactura?.vencimiento),
    numero_pedido: destinatario.ultimoPedido?.numero ?? "—",
    transporte: destinatario.ultimoPedido?.transporte ?? "—",
    guia: destinatario.ultimoPedido?.guia ?? "—",
    fecha_hoy: FECHA.format(new Date()),
  };
}

function reemplazar(texto: string, valores: Record<string, string>, html: boolean): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, clave: string) => {
    const valor = valores[clave.toLowerCase()];
    if (valor === undefined) return original;
    if (!html) return VARIABLES_HTML.has(clave) ? "" : valor;
    return VARIABLES_HTML.has(clave) ? valor : escapeHtml(valor);
  });
}

/** Variables escritas en la plantilla que este tipo de mail no conoce (posibles errores de tipeo). */
export function variablesDesconocidas(plantilla: PlantillaMailing, tipo: TipoMail): string[] {
  const conocidas = new Set(VARIABLES[tipo].map((variable) => variable.clave));
  const texto = [plantilla.asunto, plantilla.cuerpo, plantilla.botonUrl, plantilla.botonTexto].join(" ");
  return [...new Set([...texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))].filter(
    (clave) => !conocidas.has(clave),
  );
}

export function armarMail(
  plantilla: PlantillaMailing,
  destinatario: Destinatario,
  extras: Extras,
): { asunto: string; html: string } {
  const valores = valoresDe(destinatario, extras);
  const asunto = reemplazar(plantilla.asunto, valores, false);
  const botonUrl = reemplazar(plantilla.botonUrl, valores, false).trim();
  const html = layoutEmail({
    asunto,
    preheader: asunto,
    cuerpoHtml: inlinearEstilos(sanitizeHtml(reemplazar(plantilla.cuerpo, valores, true))),
    headerImg: plantilla.imagen || null,
    headerAlt: plantilla.imagenAlt,
    headerTexto: plantilla.titulo,
    footerTexto: plantilla.pie,
    boton: plantilla.botonTexto.trim() && botonUrl ? { texto: plantilla.botonTexto.trim(), url: botonUrl } : null,
  });
  return { asunto, html };
}
