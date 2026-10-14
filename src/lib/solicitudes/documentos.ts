import type { DatosSolicitud } from "@/types/solicitud";

/**
 * Separa los datos del formulario de alta en documentos adjuntos (los campos
 * cuyo valor son links, como los que deja Google Forms al subir archivos) y
 * datos de texto. Un mismo campo puede traer varios archivos separados por coma.
 */

export type TipoDocumento = "pdf" | "imagen" | "drive" | "otro";

export type Documento = {
  /** Nombre del campo del formulario ("Constancia de AFIP"). */
  campo: string;
  url: string;
  /** Nombre legible del archivo, si se puede deducir del link. */
  nombre: string;
  tipo: TipoDocumento;
  /** URL apta para mostrar dentro de un iframe; null si solo se puede abrir aparte. */
  vistaPrevia: string | null;
};

export type DatoTexto = { campo: string; valor: string };

/** Links absolutos, o los archivos de ejemplo que sirve la app en modo demo. */
const URL_REGEX = /(?:https?:\/\/|\/api\/documentos-demo\/)[^\s,;]+/g;

function idDrive(url: string): string | null {
  const porRuta = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (porRuta) return porRuta[1];
  const porQuery = url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/);
  return porQuery ? porQuery[1] : null;
}

function describir(campo: string, url: string, indice: number, total: number): Documento {
  const drive = idDrive(url);
  if (drive) {
    return {
      campo,
      url,
      nombre: total > 1 ? `${campo} (${indice + 1})` : campo,
      tipo: "drive",
      vistaPrevia: `https://drive.google.com/file/d/${drive}/preview`,
    };
  }

  let archivo = "";
  try {
    archivo = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    archivo = "";
  }
  const extension = archivo.split(".").pop()?.toLowerCase() ?? "";
  const tipo: TipoDocumento =
    extension === "pdf" ? "pdf" : ["png", "jpg", "jpeg", "gif", "webp"].includes(extension) ? "imagen" : "otro";

  return {
    campo,
    url,
    nombre: archivo || (total > 1 ? `${campo} (${indice + 1})` : campo),
    tipo,
    // Los links propios (demo) y los PDF/imagenes se pueden embeber directo.
    vistaPrevia: tipo === "otro" && !url.includes("/api/documentos-demo") ? null : url,
  };
}

export function separarDocumentos(datos: DatosSolicitud): {
  documentos: Documento[];
  textos: DatoTexto[];
} {
  const documentos: Documento[] = [];
  const textos: DatoTexto[] = [];

  for (const [campo, valor] of Object.entries(datos)) {
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (!texto) continue;

    const urls = texto.match(URL_REGEX);
    // Solo es documento si el campo es esencialmente una lista de links.
    if (urls && texto.replace(URL_REGEX, "").replace(/[\s,;]/g, "") === "") {
      urls.forEach((url, indice) => documentos.push(describir(campo, url, indice, urls.length)));
    } else {
      textos.push({ campo, valor: texto });
    }
  }

  return { documentos, textos };
}

export function contarDocumentos(datos: DatosSolicitud): number {
  return separarDocumentos(datos).documentos.length;
}
