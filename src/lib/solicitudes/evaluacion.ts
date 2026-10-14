import { contarDocumentos } from "@/lib/solicitudes/documentos";
import { cuitValido, leerCampo } from "@/lib/solicitudes/presentacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Solicitud } from "@/types/solicitud";

/**
 * Que tan apto es un solicitante para ser cliente de De Pascale (proteccion
 * industrial / EPP, cartera exclusiva). Hay dos fuentes de puntaje:
 * - "reglas": se calcula al instante con los datos del formulario;
 * - "ia": Claude lee el formulario completo y lo justifica (ver evaluacion-ia.ts).
 * La de IA, cuando existe, reemplaza a la de reglas.
 */

export const CATEGORIAS = {
  A: { etiqueta: "Muy apto", desde: 75, estilo: "bg-emerald-600 text-white" },
  B: { etiqueta: "Apto con revisión", desde: 55, estilo: "bg-sky-100 text-sky-800" },
  C: { etiqueta: "Dudoso", desde: 35, estilo: "bg-amber-100 text-amber-800" },
  D: { etiqueta: "No apto", desde: 0, estilo: "bg-red-100 text-red-700" },
} as const;

export type Categoria = keyof typeof CATEGORIAS;

export type Evaluacion = {
  /** 0 a 100. */
  puntaje: number;
  categoria: Categoria;
  /** Una linea para el listado. */
  resumen: string;
  fortalezas: string[];
  riesgos: string[];
  /** Que deberia pedir o verificar el equipo comercial. */
  proximoPaso: string;
  fuente: "reglas" | "ia";
  /** ISO. */
  fecha: string;
  /** Huella de los datos evaluados: si la empresa reenvia el formulario se vuelve a evaluar. */
  huella: string;
};

export function categoriaDe(puntaje: number): Categoria {
  if (puntaje >= CATEGORIAS.A.desde) return "A";
  if (puntaje >= CATEGORIAS.B.desde) return "B";
  if (puntaje >= CATEGORIAS.C.desde) return "C";
  return "D";
}

/** Huella corta de nombre + email + datos, sin dependencias (FNV-1a). */
export function huellaSolicitud(solicitud: Pick<Solicitud, "nombre" | "email" | "datos">): string {
  const texto = JSON.stringify([solicitud.nombre, solicitud.email, solicitud.datos]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

/** Rubros que suelen comprar EPP y proteccion industrial en volumen. */
const RUBROS_AFINES = [
  "seguridad",
  "epp",
  "proteccion",
  "ferret",
  "bulon",
  "industrial",
  "construccion",
  "corralon",
  "materiales",
  "obra",
  "metalurg",
  "mineria",
  "petrol",
  "energia",
  "logistica",
  "distribu",
  "mayorista",
  "agro",
  "sanidad",
  "limpieza",
  "taller",
];

const DOMINIOS_GRATUITOS = [
  "gmail.",
  "hotmail.",
  "outlook.",
  "yahoo.",
  "live.",
  "icloud.",
  "freemail.",
  "correo-rapido.",
  "mail.com",
];

/**
 * Puntaje por reglas: CUIT (25), tipo de persona (10), rubro (20),
 * documentacion (25), mail corporativo (10), contacto y ubicacion (10).
 * Un rubro sin relacion con EPP no pasa de "Dudoso", por mas completo que este.
 */
export function evaluarPorReglas(solicitud: Solicitud): Evaluacion {
  const fortalezas: string[] = [];
  const riesgos: string[] = [];
  let puntaje = 0;

  const cuit = leerCampo(solicitud.datos, "cuit");
  const digitos = cuit.replace(/\D/g, "");
  if (cuitValido(cuit)) {
    puntaje += 25;
    fortalezas.push("CUIT válido");
    if (/^3[034]/.test(digitos)) {
      puntaje += 10;
      fortalezas.push("Persona jurídica");
    } else {
      puntaje += 4;
      riesgos.push("Persona física: pedir referencias comerciales");
    }
  } else {
    riesgos.push(cuit ? "CUIT inválido" : "Sin CUIT");
  }

  const rubro = normalizarEncabezado(leerCampo(solicitud.datos, "rubro"));
  const rubroAfin = RUBROS_AFINES.some((afin) => rubro.includes(afin));
  if (!rubro) {
    riesgos.push("No informó rubro");
  } else if (rubroAfin) {
    puntaje += 20;
    fortalezas.push("Rubro afín a protección industrial");
  } else {
    riesgos.unshift("Rubro sin relación con EPP");
  }

  const documentos = contarDocumentos(solicitud.datos);
  puntaje += Math.min(documentos, 5) * 5;
  if (documentos >= 4) fortalezas.push(`Documentación completa (${documentos} adjuntos)`);
  else if (documentos === 0) riesgos.push("Sin documentación adjunta");
  else riesgos.push(`Documentación incompleta (${documentos} de 5)`);

  const dominio = solicitud.email.split("@")[1]?.toLowerCase() ?? "";
  if (dominio && !DOMINIOS_GRATUITOS.some((gratuito) => dominio.includes(gratuito))) {
    puntaje += 10;
    fortalezas.push("Mail con dominio propio");
  } else {
    riesgos.push("Mail de casilla gratuita");
  }

  if (leerCampo(solicitud.datos, "telefono")) puntaje += 5;
  else riesgos.push("Sin teléfono de contacto");
  if (leerCampo(solicitud.datos, "provincia")) puntaje += 5;
  else riesgos.push("Sin provincia");

  const tope = rubro && !rubroAfin ? CATEGORIAS.B.desde - 1 : 100;
  puntaje = Math.max(0, Math.min(tope, puntaje));
  const categoria = categoriaDe(puntaje);
  const proximoPaso =
    categoria === "A"
      ? "Priorizar: revisar documentación y pasar a aprobación."
      : categoria === "B"
        ? `Pedir lo que falta: ${riesgos[0]?.toLowerCase() ?? "verificar datos"}.`
        : categoria === "C"
          ? "Validar con el equipo comercial antes de avanzar."
          : "Candidato a rechazo: no cumple los requisitos mínimos.";

  return {
    puntaje,
    categoria,
    resumen: [fortalezas[0], riesgos[0]].filter(Boolean).join(" · ") || "Sin datos para evaluar",
    fortalezas,
    riesgos,
    proximoPaso,
    fuente: "reglas",
    fecha: new Date().toISOString(),
    huella: huellaSolicitud(solicitud),
  };
}
