import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { CATEGORIAS, evaluarPorReglas } from "@/lib/solicitudes/evaluacion";
import { separarDocumentos } from "@/lib/solicitudes/documentos";
import { cuitValido, leerCampo, leerDato } from "@/lib/solicitudes/presentacion";
import { formatearFechaHora } from "@/lib/utils/dates";
import type { DecisionAlta, Solicitud } from "@/types/solicitud";

/**
 * Ficha de una solicitud de alta para guardar fuera del CRM: un PDF para el
 * legajo y un JSON para analisis y para cargarla en el maestro de clientes.
 * El bloque `maestroCliente` del JSON trae los datos ya separados por columna.
 */

const VERSION_FICHA = 1;

/** Nombre de archivo sin acentos ni signos: "alta-andina-pharma-30711245673". */
export function nombreArchivo(solicitud: Solicitud): string {
  const base = solicitud.nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const cuit = leerCampo(solicitud.datos, "cuit").replace(/\D/g, "");
  return ["alta", base || solicitud.id, cuit].filter(Boolean).join("-");
}

function numeroODato(valor: string): number | null {
  const numero = Number.parseInt(valor.replace(/\D/g, ""), 10);
  return Number.isFinite(numero) ? numero : null;
}

function ubicacion(valor: string): { lat: number; lng: number } | null {
  const [lat, lng] = valor.split(",").map((parte) => Number(parte.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) && valor.includes(",") ? { lat, lng } : null;
}

/** Ficha completa: lo que se descarga como JSON. */
export function fichaAlta(solicitud: Solicitud, decisiones: readonly DecisionAlta[], base: string) {
  const dato = (nombre: string) => leerDato(solicitud.datos, nombre) || null;
  const cuit = leerCampo(solicitud.datos, "cuit");
  const evaluacion = evaluarPorReglas(solicitud);
  const { documentos } = separarDocumentos(solicitud.datos);
  const ultima = decisiones.at(-1) ?? null;
  const absoluta = (url: string) => (url.startsWith("/") ? `${base}${url}` : url);

  return {
    version: VERSION_FICHA,
    generado: new Date().toISOString(),
    solicitud: {
      id: solicitud.id,
      estado: solicitud.estado,
      fechaIngreso: solicitud.fechaImportacion.toISOString(),
      fechaDecision: solicitud.fechaDecision?.toISOString() ?? null,
      decididoPor: solicitud.usuarioDecisor,
      motivoRechazo: solicitud.estado === "RECHAZADO" && ultima?.estado === "RECHAZADO" ? ultima.motivo : null,
      comentarioDecision: ultima?.estado === solicitud.estado ? ultima.comentario || null : null,
      linkCrm: base ? `${base}/solicitudes/${solicitud.id}` : null,
    },
    // Un campo por columna del maestro de clientes; null = la empresa no lo cargo.
    maestroCliente: {
      razonSocial: dato("Razón social") ?? solicitud.nombre,
      nombreFantasia: dato("Nombre de fantasía"),
      cuit: cuit.replace(/\D/g, "") || null,
      cuitValido: cuitValido(cuit),
      email: solicitud.email,
      telefono: leerCampo(solicitud.datos, "telefono") || null,
      responsable: dato("Responsable"),
      direccionLegal: dato("Dirección legal"),
      provincia: leerCampo(solicitud.datos, "provincia") || null,
      ubicacionLegal: ubicacion(dato("Ubicación legal (lat, lng)") ?? ""),
      direccionComercial: dato("Dirección comercial"),
      direccionSucursal: dato("Dirección de sucursal"),
      actividad: dato("Tipo de industria") ?? (leerCampo(solicitud.datos, "rubro") || null),
      puntosDeVenta: dato("Puntos de venta"),
      antiguedadAnios: numeroODato(dato("Antigüedad (años)") ?? ""),
      cantidadEmpleados: numeroODato(dato("Cantidad de empleados") ?? ""),
      tipoCompra: dato("Tipo de compra"),
      envio: dato("Envío"),
      transportista: dato("Transportista"),
      canal: dato("Cómo nos conoció"),
      referenciasComerciales: (dato("Referencias comerciales") ?? "")
        .split("|")
        .map((referencia) => referencia.trim())
        .filter(Boolean),
    },
    evaluacion: {
      puntaje: evaluacion.puntaje,
      categoria: evaluacion.categoria,
      etiqueta: CATEGORIAS[evaluacion.categoria].etiqueta,
      fortalezas: evaluacion.fortalezas,
      riesgos: evaluacion.riesgos,
    },
    decisiones,
    documentos: documentos.map((documento) => ({ campo: documento.campo, nombre: documento.nombre, url: absoluta(documento.url) })),
    // Tal cual llego del formulario, por si hace falta algo que no esta arriba.
    formulario: solicitud.datos,
  };
}

// --- PDF ------------------------------------------------------------------------------

/**
 * Las fuentes estandar del PDF solo tienen Latin-1 (WinAnsi): los acentos y
 * la ñ andan, pero flechas, emojis o comillas raras se reemplazan.
 */
const REEMPLAZOS: Record<string, string> = { "→": "->", "≥": ">=", "≤": "<=", "✓": "v", "✔": "v", "×": "x" };
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function limpiar(texto: string): string {
  return [...texto.normalize("NFC").replace(/[\r\t]/g, " ")]
    .map((caracter) => {
      if (REEMPLAZOS[caracter]) return REEMPLAZOS[caracter];
      const codigo = caracter.codePointAt(0) ?? 0;
      if (caracter === "\n" || (codigo >= 32 && codigo <= 126) || (codigo >= 160 && codigo <= 255) || WIN_ANSI_EXTRA.has(caracter)) return caracter;
      return "?";
    })
    .join("");
}

/** Corta un texto en lineas que entren en `ancho` puntos. */
function partir(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of limpiar(texto).split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      // Palabras sin espacios mas largas que el ancho (links): se cortan a la fuerza.
      let resto = palabra;
      while (fuente.widthOfTextAtSize(resto, tamano) > ancho) {
        let corte = resto.length - 1;
        while (corte > 1 && fuente.widthOfTextAtSize(resto.slice(0, corte), tamano) > ancho) corte -= 1;
        if (actual) lineas.push(actual);
        lineas.push(resto.slice(0, corte));
        actual = "";
        resto = resto.slice(corte);
      }
      const prueba = actual ? `${actual} ${resto}` : resto;
      if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho) actual = prueba;
      else {
        lineas.push(actual);
        actual = resto;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;
const AZUL = rgb(0.106, 0.169, 0.369);
const GRIS = rgb(0.39, 0.45, 0.55);
const NEGRO = rgb(0.06, 0.09, 0.16);
const LINEA = rgb(0.89, 0.91, 0.94);

export async function pdfAlta(solicitud: Solicitud, decisiones: readonly DecisionAlta[], base: string): Promise<Uint8Array> {
  const ficha = fichaAlta(solicitud, decisiones, base);
  const documento = await PDFDocument.create();
  documento.setTitle(limpiar(`Solicitud de alta - ${solicitud.nombre}`));
  documento.setAuthor("Industrias De Pascale - CRM");
  documento.setCreationDate(new Date());
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
  const anchoUtil = A4.ancho - MARGEN * 2;

  let pagina: PDFPage = documento.addPage([A4.ancho, A4.alto]);
  let y = A4.alto - MARGEN;

  const espacio = (alto: number) => {
    if (y - alto >= MARGEN + 20) return;
    pagina = documento.addPage([A4.ancho, A4.alto]);
    y = A4.alto - MARGEN;
  };
  const escribir = (texto: string, opciones: { fuente?: PDFFont; tamano?: number; color?: ReturnType<typeof rgb>; x?: number; ancho?: number } = {}) => {
    const { fuente = normal, tamano = 10, color = NEGRO, x = MARGEN, ancho = anchoUtil } = opciones;
    for (const linea of partir(texto, fuente, tamano, ancho)) {
      espacio(tamano + 4);
      pagina.drawText(linea, { x, y: y - tamano, size: tamano, font: fuente, color });
      y -= tamano + 4;
    }
  };
  const titulo = (texto: string) => {
    // Lugar para el titulo y al menos un par de filas: que no quede solo al pie.
    espacio(80);
    y -= 14;
    escribir(texto.toUpperCase(), { fuente: negrita, tamano: 9, color: AZUL });
    pagina.drawLine({ start: { x: MARGEN, y: y - 2 }, end: { x: A4.ancho - MARGEN, y: y - 2 }, thickness: 0.8, color: LINEA });
    y -= 8;
  };
  // Etiqueta a la izquierda y valor a la derecha, con el valor partido en lineas.
  const fila = (etiqueta: string, valor: string) => {
    const lineas = partir(valor || "-", normal, 10, anchoUtil - 150);
    espacio(14 * Math.min(lineas.length, 3));
    const inicio = y;
    for (const linea of partir(etiqueta, negrita, 9, 140)) {
      pagina.drawText(linea, { x: MARGEN, y: y - 9, size: 9, font: negrita, color: GRIS });
      y -= 13;
    }
    let yValor = inicio;
    for (const linea of lineas) {
      if (yValor - 14 < MARGEN + 20) {
        pagina = documento.addPage([A4.ancho, A4.alto]);
        yValor = A4.alto - MARGEN;
      }
      pagina.drawText(linea, { x: MARGEN + 150, y: yValor - 10, size: 10, font: normal, color: NEGRO });
      yValor -= 14;
    }
    y = Math.min(y, yValor) - 3;
  };

  // Encabezado
  pagina.drawRectangle({ x: 0, y: A4.alto - 6, width: A4.ancho, height: 6, color: AZUL });
  escribir("Industrias De Pascale - Solicitud de alta de cliente", { fuente: negrita, tamano: 9, color: GRIS });
  y -= 4;
  escribir(solicitud.nombre, { fuente: negrita, tamano: 18, color: AZUL });
  escribir(
    `Estado: ${etiquetaEstado(solicitud.estado)}  |  Ingreso: ${formatearFechaHora(solicitud.fechaImportacion)}${
      solicitud.fechaDecision ? `  |  Decisión: ${formatearFechaHora(solicitud.fechaDecision)}` : ""
    }`,
    { tamano: 10, color: GRIS },
  );

  titulo("Datos para el maestro de clientes");
  const maestro = ficha.maestroCliente;
  fila("Razón social", maestro.razonSocial);
  fila("Nombre de fantasía", maestro.nombreFantasia ?? "");
  fila("CUIT", `${maestro.cuit ?? ""}${maestro.cuit && !maestro.cuitValido ? " (dígito verificador inválido)" : ""}`);
  fila("Email", maestro.email);
  fila("Teléfono", maestro.telefono ?? "");
  fila("Responsable", maestro.responsable ?? "");
  fila("Dirección legal", maestro.direccionLegal ?? "");
  fila("Provincia", maestro.provincia ?? "");
  fila("Dirección comercial", maestro.direccionComercial ?? "");
  fila("Dirección de sucursal", maestro.direccionSucursal ?? "");
  fila("Actividad", maestro.actividad ?? "");
  fila("Puntos de venta", maestro.puntosDeVenta ?? "");
  fila("Antigüedad (años)", maestro.antiguedadAnios?.toString() ?? "");
  fila("Empleados", maestro.cantidadEmpleados?.toString() ?? "");
  fila("Tipo de compra", maestro.tipoCompra ?? "");
  fila("Envío", maestro.envio ?? "");
  fila("Transportista", maestro.transportista ?? "");
  fila("Cómo nos conoció", maestro.canal ?? "");
  fila("Referencias comerciales", maestro.referenciasComerciales.join("\n"));

  titulo("Evaluación del formulario");
  fila("Completitud", `${ficha.evaluacion.puntaje}% - ${ficha.evaluacion.categoria} (${ficha.evaluacion.etiqueta})`);
  if (ficha.evaluacion.fortalezas.length) fila("Completo", ficha.evaluacion.fortalezas.join("\n"));
  if (ficha.evaluacion.riesgos.length) fila("Falta o revisar", ficha.evaluacion.riesgos.join("\n"));

  titulo("Decisión");
  fila("Estado actual", etiquetaEstado(solicitud.estado));
  if (ficha.solicitud.motivoRechazo) fila("Motivo de rechazo", ficha.solicitud.motivoRechazo);
  if (ficha.solicitud.comentarioDecision) fila("Comentario", ficha.solicitud.comentarioDecision);
  if (solicitud.usuarioDecisor) fila("Decidida por", solicitud.usuarioDecisor);
  if (decisiones.length > 1) {
    fila(
      "Historial",
      decisiones
        .map((decision) => `${formatearFechaHora(decision.fecha)}: ${etiquetaEstado(decision.estado)}${decision.motivo ? ` (${decision.motivo})` : ""}`)
        .join("\n"),
    );
  }

  titulo(`Documentación adjunta (${ficha.documentos.length})`);
  if (ficha.documentos.length === 0) escribir("La empresa no adjuntó documentación.", { color: GRIS });
  for (const adjunto of ficha.documentos) fila(adjunto.campo, adjunto.url);

  // Pie con numero de pagina en todas las hojas.
  const paginas = documento.getPages();
  const generado = `Generado el ${formatearFechaHora(new Date())} desde el CRM De Pascale`;
  paginas.forEach((hoja, indice) => {
    hoja.drawText(limpiar(generado), { x: MARGEN, y: MARGEN - 18, size: 8, font: normal, color: GRIS });
    const numero = `${indice + 1} / ${paginas.length}`;
    hoja.drawText(numero, { x: A4.ancho - MARGEN - normal.widthOfTextAtSize(numero, 8), y: MARGEN - 18, size: 8, font: normal, color: GRIS });
  });

  return documento.save();
}
