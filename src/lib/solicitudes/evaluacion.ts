import { contarDocumentos } from "@/lib/solicitudes/documentos";
import { cuitValido, leerCampo } from "@/lib/solicitudes/presentacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { DatosSolicitud, Solicitud } from "@/types/solicitud";

/**
 * Clasificacion de una solicitud de alta segun lo que cargo el solicitante:
 * cuanto mas completo el formulario (datos fiscales, contacto, direcciones,
 * empresa, referencias, documentacion y firma), mejor la clasificacion. No
 * juzga el rubro ni a la empresa: eso lo decide el equipo comercial.
 */

export const CATEGORIAS = {
  A: { etiqueta: "Completa", desde: 85, estilo: "bg-emerald-600 text-white" },
  B: { etiqueta: "Casi completa", desde: 65, estilo: "bg-sky-100 text-sky-800" },
  C: { etiqueta: "Incompleta", desde: 40, estilo: "bg-amber-100 text-amber-800" },
  D: { etiqueta: "Muy incompleta", desde: 0, estilo: "bg-red-100 text-red-700" },
} as const;

export type Categoria = keyof typeof CATEGORIAS;

export type Evaluacion = {
  /** 0 a 100: porcentaje ponderado de lo que completo. */
  puntaje: number;
  categoria: Categoria;
  /** Una linea para el listado. */
  resumen: string;
  /** Grupos completos. */
  fortalezas: string[];
  /** Lo que falta o hay que revisar. */
  riesgos: string[];
  /** Que deberia pedir o verificar el equipo comercial. */
  proximoPaso: string;
};

export function categoriaDe(puntaje: number): Categoria {
  if (puntaje >= CATEGORIAS.A.desde) return "A";
  if (puntaje >= CATEGORIAS.B.desde) return "B";
  if (puntaje >= CATEGORIAS.C.desde) return "C";
  return "D";
}

/** Documentos que pide el formulario de alta (mismos nombres que la planilla del cliente). */
export const DOCUMENTOS_REQUERIDOS = [
  "Legajo impositivo",
  "Formulario CM05",
  "Constancia de CUIT",
  "Declaración jurada de IVA",
  "Última DDJJ de cargas sociales",
  "Última DDJJ de Ganancias",
  "Contrato social / Estatuto",
  "Último balance",
] as const;

const DOMINIOS_GRATUITOS = ["gmail.", "hotmail.", "outlook.", "yahoo.", "live.", "icloud.", "freemail.", "correo-rapido."];

/** Valor de un campo buscando por varios nombres posibles (tolera acentos y mayusculas). */
function campo(datos: DatosSolicitud, alias: readonly string[]): string {
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === null || valor === undefined) continue;
    if (!alias.includes(normalizarEncabezado(clave))) continue;
    const texto = String(valor).trim();
    if (texto) return texto;
  }
  return "";
}

type Item = { etiqueta: string; peso: number; obtenido: number };

/** Puntaje por completitud. Cada item suma su peso si esta (o parte, si esta a medias). */
export function evaluarPorReglas(solicitud: Pick<Solicitud, "nombre" | "email" | "datos">): Evaluacion {
  const { datos } = solicitud;
  const items: { grupo: string; items: Item[] }[] = [];
  const item = (etiqueta: string, peso: number, valor: number | boolean): Item => ({
    etiqueta,
    peso,
    obtenido: Math.max(0, Math.min(1, Number(valor))) * peso,
  });

  // Identificacion fiscal (20)
  const cuit = leerCampo(datos, "cuit");
  const idFiscal = campo(datos, ["id fiscal", "identificador fiscal"]);
  items.push({
    grupo: "Identificación fiscal",
    items: [
      item("CUIT válido", 15, cuitValido(cuit) ? 1 : idFiscal ? 0.7 : 0),
      item("Razón social", 2, Boolean(solicitud.nombre.trim())),
      item("Nombre de fantasía", 3, Boolean(campo(datos, ["nombre de fantasia", "fantasia"]))),
    ],
  });

  // Contacto (15)
  const dominio = solicitud.email.split("@")[1]?.toLowerCase() ?? "";
  items.push({
    grupo: "Contacto",
    items: [
      item("Responsable", 4, Boolean(campo(datos, ["responsable", "nombre del responsable", "contacto", "persona de contacto"]))),
      item("Teléfono", 4, Boolean(leerCampo(datos, "telefono"))),
      item("Mail de la empresa", 7, dominio ? (DOMINIOS_GRATUITOS.some((g) => dominio.includes(g)) ? 0.3 : 1) : 0),
    ],
  });

  // Direcciones (12)
  items.push({
    grupo: "Direcciones",
    items: [
      item("Dirección legal", 8, Boolean(campo(datos, ["direccion legal", "domicilio legal", "direccion"]) || leerCampo(datos, "provincia"))),
      item("Dirección comercial", 2, Boolean(campo(datos, ["direccion comercial"]))),
      item("Dirección de sucursal", 2, Boolean(campo(datos, ["direccion de sucursal", "sucursal"]))),
    ],
  });

  // Empresa (18)
  items.push({
    grupo: "Datos de la empresa",
    items: [
      item("Tipo de industria", 5, Boolean(leerCampo(datos, "rubro") || campo(datos, ["tipo de industria"]))),
      item("Antigüedad", 5, Boolean(campo(datos, ["antiguedad", "antiguedad anos"]))),
      item("Cantidad de empleados", 4, Boolean(campo(datos, ["cantidad de empleados", "empleados"]))),
      item("Tipo de compra", 4, Boolean(campo(datos, ["tipo de compra", "frecuencia de compra"]))),
    ],
  });

  // Envio (5)
  const envio = campo(datos, ["envio", "envios transporte", "envios"]);
  const usaTransporte = /transporte/i.test(envio);
  items.push({
    grupo: "Envío",
    items: [
      item("Forma de envío", 3, Boolean(envio)),
      item("Datos del transportista", 2, !usaTransporte || Boolean(campo(datos, ["transportista", "transporte usual"]))),
    ],
  });

  // Referencias (10): se esperan tres.
  const referencias = campo(datos, ["referencias comerciales", "referencias"])
    .split("|")
    .map((ref) => ref.trim())
    .filter(Boolean).length;
  items.push({ grupo: "Referencias comerciales", items: [item(`Referencias comerciales (${referencias} de 3)`, 10, referencias / 3)] });

  // Documentacion (20): los 8 documentos y la firma.
  const firma = Boolean(campo(datos, ["firma"]));
  const documentos = Math.max(0, contarDocumentos(datos) - (firma ? 1 : 0));
  const claves = new Set(Object.keys(datos).map(normalizarEncabezado));
  const faltantes = DOCUMENTOS_REQUERIDOS.filter((documento) => !claves.has(normalizarEncabezado(documento)));
  items.push({
    grupo: "Documentación",
    items: [
      item(`Documentación (${Math.min(documentos, 8)} de 8)`, 18, documentos / DOCUMENTOS_REQUERIDOS.length),
      item("Firma", 2, firma),
    ],
  });

  const puntaje = Math.round(items.flatMap((g) => g.items).reduce((total, i) => total + i.obtenido, 0));
  const categoria = categoriaDe(puntaje);
  const fortalezas = items
    .filter((grupo) => grupo.items.every((i) => i.obtenido >= i.peso))
    .map((grupo) => `${grupo.grupo} completa`);
  const riesgos = items
    .flatMap((grupo) => grupo.items)
    .filter((i) => i.obtenido < i.peso)
    .map((i) => (i.etiqueta === "CUIT válido" && cuit ? "CUIT inválido" : i.etiqueta === "Mail de la empresa" ? "Mail de casilla gratuita" : `Falta: ${i.etiqueta.toLowerCase()}`));
  if (documentos > 0 && documentos < 8 && faltantes.length > 0 && faltantes.length < 8) {
    riesgos.push(`Documentos faltantes: ${faltantes.join(", ")}`);
  }

  const proximoPaso =
    categoria === "A"
      ? "Formulario completo: revisar la documentación y decidir."
      : categoria === "B"
        ? `Pedirle lo que falta: ${riesgos.slice(0, 2).join("; ").toLowerCase() || "verificar datos"}.`
        : "Pedirle que complete el formulario antes de evaluarlo.";

  return {
    puntaje,
    categoria,
    resumen: `Completó el ${puntaje}% del formulario${riesgos.length > 0 ? ` · ${riesgos[0]}` : ""}`,
    fortalezas,
    riesgos,
    proximoPaso,
  };
}

/** Link a Nosis con el CUIT cargado (busqueda de informes comerciales). */
export function linkNosis(cuit: string): string | null {
  const digitos = cuit.replace(/\D/g, "");
  return digitos.length === 11 ? `https://informes.nosis.com/?q=${digitos}` : null;
}
