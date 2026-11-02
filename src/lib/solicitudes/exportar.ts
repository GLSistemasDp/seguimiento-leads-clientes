import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { etiquetaEstado } from "@/components/solicitudes/EstadoBadge";
import { getAdjunto } from "@/lib/db/adjuntos";
import { CATEGORIAS, evaluarPorReglas } from "@/lib/solicitudes/evaluacion";
import { separarDocumentos } from "@/lib/solicitudes/documentos";
import { cuitValido, leerCampo, leerDato } from "@/lib/solicitudes/presentacion";
import { formatearFechaHora } from "@/lib/utils/dates";
import { normalizarEncabezado } from "@/lib/utils/strings";
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
const ROJO = rgb(0.73, 0.11, 0.11);
const FONDO_ROJO = rgb(0.996, 0.949, 0.949);
const BORDE_ROJO = rgb(0.996, 0.792, 0.792);

/** Los campos del formulario de alta en el orden de sus pasos; lo que no este aca va a "Otros datos". */
const SECCIONES_FORMULARIO: readonly { titulo: string; campos: readonly string[] }[] = [
  {
    titulo: "Datos del cliente",
    campos: ["Razón social", "Nombre de fantasía", "CUIT", "CUIT a verificar", "Responsable", "Teléfono", "Cómo nos conoció"],
  },
  {
    titulo: "Direcciones",
    campos: ["Dirección legal", "Provincia", "Ubicación legal (lat, lng)", "Dirección comercial", "Dirección de sucursal"],
  },
  {
    titulo: "Empresa",
    campos: ["Tipo de industria", "Puntos de venta", "Antigüedad (años)", "Cantidad de empleados", "Tipo de compra", "Referencias comerciales"],
  },
  { titulo: "Envío", campos: ["Envío", "Transportista"] },
];

/** El logo de los formularios publicos; sin el, el PDF sale igual. */
async function leerLogo(): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "formularios", "logo-depascale.png"));
  } catch {
    return null;
  }
}

/** La firma dibujada en el formulario (un PNG guardado como adjunto). */
async function leerFirma(solicitud: Solicitud): Promise<{ datos: Uint8Array; tipo: string } | null> {
  const id = leerDato(solicitud.datos, "Firma").match(/\/api\/adjuntos\/([^/?#]+)/)?.[1];
  if (!id) return null;
  try {
    const adjunto = await getAdjunto(decodeURIComponent(id));
    return adjunto && /^image\/(png|jpe?g)$/.test(adjunto.tipo) ? { datos: adjunto.datos, tipo: adjunto.tipo } : null;
  } catch {
    return null;
  }
}

export async function pdfAlta(solicitud: Solicitud, decisiones: readonly DecisionAlta[], base: string): Promise<Uint8Array> {
  const ficha = fichaAlta(solicitud, decisiones, base);
  const [logo, firma] = await Promise.all([leerLogo(), leerFirma(solicitud)]);
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
  const alDerecha = (texto: string, alto: number, fuente: PDFFont, tamano: number, color: ReturnType<typeof rgb>) => {
    const limpio = limpiar(texto);
    pagina.drawText(limpio, { x: A4.ancho - MARGEN - fuente.widthOfTextAtSize(limpio, tamano), y: alto, size: tamano, font: fuente, color });
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

  // Encabezado: logo a la izquierda, tipo de documento y fechas a la derecha.
  pagina.drawRectangle({ x: 0, y: A4.alto - 6, width: A4.ancho, height: 6, color: AZUL });
  const altoLogo = 52;
  if (logo) {
    const imagen = await documento.embedPng(logo);
    pagina.drawImage(imagen, { x: MARGEN, y: y - altoLogo, width: (imagen.width * altoLogo) / imagen.height, height: altoLogo });
  }
  alDerecha("SOLICITUD DE ALTA DE CLIENTE", y - 14, negrita, 12, AZUL);
  alDerecha("Industrias De Pascale", y - 29, normal, 9, GRIS);
  alDerecha(`Ingreso: ${formatearFechaHora(solicitud.fechaImportacion)}`, y - 42, normal, 9, GRIS);
  y -= altoLogo + 12;
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: A4.ancho - MARGEN, y }, thickness: 0.8, color: LINEA });
  y -= 10;
  escribir(solicitud.nombre, { fuente: negrita, tamano: 18, color: AZUL });
  escribir(
    `Estado: ${etiquetaEstado(solicitud.estado)}${solicitud.fechaDecision ? `  |  Decisión: ${formatearFechaHora(solicitud.fechaDecision)}` : ""}${
      solicitud.usuarioDecisor ? `  |  Por: ${solicitud.usuarioDecisor}` : ""
    }`,
    { tamano: 10, color: GRIS },
  );

  // Observacion del rechazo, recuadrada para que se vea antes que el resto.
  if (solicitud.estado === "RECHAZADO") {
    const relleno = 12;
    const anchoTexto = anchoUtil - relleno * 2 - 4;
    const motivo = partir(`Motivo de rechazo: ${ficha.solicitud.motivoRechazo ?? "sin motivo registrado (rechazada antes de que se pidiera)"}`, negrita, 10, anchoTexto);
    const comentario = ficha.solicitud.comentarioDecision ? partir(ficha.solicitud.comentarioDecision, normal, 10, anchoTexto) : [];
    const alto = relleno * 2 + 14 + motivo.length * 14 + comentario.length * 14;
    y -= 12;
    espacio(alto);
    pagina.drawRectangle({ x: MARGEN, y: y - alto, width: anchoUtil, height: alto, color: FONDO_ROJO, borderColor: BORDE_ROJO, borderWidth: 0.8 });
    pagina.drawRectangle({ x: MARGEN, y: y - alto, width: 4, height: alto, color: ROJO });
    let linea = y - relleno - 9;
    pagina.drawText("OBSERVACIÓN", { x: MARGEN + relleno + 4, y: linea, size: 9, font: negrita, color: ROJO });
    linea -= 15;
    for (const texto of motivo) {
      pagina.drawText(texto, { x: MARGEN + relleno + 4, y: linea, size: 10, font: negrita, color: NEGRO });
      linea -= 14;
    }
    for (const texto of comentario) {
      pagina.drawText(texto, { x: MARGEN + relleno + 4, y: linea, size: 10, font: normal, color: NEGRO });
      linea -= 14;
    }
    y -= alto;
  }

  // Todo lo que cargo la empresa en el formulario, paso por paso.
  const usados = new Set(["origen", "firma"].map(normalizarEncabezado));
  const { documentos, textos } = separarDocumentos(solicitud.datos);
  for (const { titulo: nombreSeccion, campos } of SECCIONES_FORMULARIO) {
    titulo(nombreSeccion);
    for (const campo of campos) {
      usados.add(normalizarEncabezado(campo));
      const valor = leerDato(solicitud.datos, campo);
      if (campo === "CUIT a verificar" && !valor) continue;
      if (campo === "Referencias comerciales") fila(campo, valor.split("|").map((referencia) => referencia.trim()).join("\n"));
      else fila(campo, campo === "Razón social" ? valor || solicitud.nombre : valor);
      if (campo === "CUIT") fila("Email", solicitud.email);
    }
  }
  const otros = textos.filter((dato) => !usados.has(normalizarEncabezado(dato.campo)));
  if (otros.length) {
    titulo("Otros datos del formulario");
    for (const dato of otros) fila(dato.campo, dato.valor);
  }

  const adjuntos = documentos.filter((adjunto) => normalizarEncabezado(adjunto.campo) !== normalizarEncabezado("Firma"));
  titulo(`Documentación adjunta (${adjuntos.length})`);
  if (adjuntos.length === 0) escribir("La empresa no adjuntó documentación.", { color: GRIS });
  for (const adjunto of adjuntos) fila(adjunto.campo, adjunto.url.startsWith("/") ? `${base}${adjunto.url}` : adjunto.url);

  titulo("Firma");
  if (firma) {
    const imagen = firma.tipo === "image/png" ? await documento.embedPng(firma.datos) : await documento.embedJpg(firma.datos);
    const escala = Math.min(220 / imagen.width, 90 / imagen.height, 1);
    const alto = imagen.height * escala;
    espacio(alto + 24);
    pagina.drawImage(imagen, { x: MARGEN, y: y - alto, width: imagen.width * escala, height: alto });
    y -= alto + 4;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + 220, y }, thickness: 0.6, color: GRIS });
    y -= 4;
    escribir(leerDato(solicitud.datos, "Responsable") || solicitud.nombre, { tamano: 9, color: GRIS });
  } else {
    escribir(leerDato(solicitud.datos, "Firma") ? "La firma no se puede mostrar acá: abrila desde el CRM." : "Sin firma.", { color: GRIS });
  }

  titulo("Evaluación del formulario");
  fila("Completitud", `${ficha.evaluacion.puntaje}% - ${ficha.evaluacion.categoria} (${ficha.evaluacion.etiqueta})`);
  if (ficha.evaluacion.fortalezas.length) fila("Completo", ficha.evaluacion.fortalezas.join("\n"));
  if (ficha.evaluacion.riesgos.length) fila("Falta o revisar", ficha.evaluacion.riesgos.join("\n"));

  titulo("Decisión");
  fila("Estado actual", etiquetaEstado(solicitud.estado));
  if (solicitud.fechaDecision) fila("Fecha", formatearFechaHora(solicitud.fechaDecision));
  if (solicitud.usuarioDecisor) fila("Decidida por", solicitud.usuarioDecisor);
  // En un rechazo el motivo y el comentario ya estan en la observacion de arriba.
  if (solicitud.estado !== "RECHAZADO" && ficha.solicitud.comentarioDecision) fila("Comentario", ficha.solicitud.comentarioDecision);
  if (decisiones.length > 1) {
    fila(
      "Historial",
      decisiones
        .map((decision) => `${formatearFechaHora(decision.fecha)}: ${etiquetaEstado(decision.estado)}${decision.motivo ? ` (${decision.motivo})` : ""}`)
        .join("\n"),
    );
  }

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
