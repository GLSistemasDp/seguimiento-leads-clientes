import "server-only";
import { NextResponse } from "next/server";
import type { ArchivoAdjunto } from "@/lib/db/adjuntos";

/**
 * Utilidades de los formularios publicos (/formularios/*): los completa el
 * cliente desde un link, sin ver nada de la intranet. Las APIs publicas solo
 * reciben datos y contestan "recibido": nunca devuelven informacion interna.
 */

/** Limite de Vercel para el cuerpo de una funcion (~4,5 MB) con margen. */
export const MAX_BYTES_TOTAL = 4 * 1024 * 1024;
export const TIPOS_PERMITIDOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

/**
 * Si los formularios se publican en otro sitio (ej. depascale.com.ar), sus
 * origenes van en FORMULARIOS_ORIGENES separados por coma. Sin la variable
 * solo se aceptan envios desde el mismo dominio.
 */
function origenPermitido(request: Request): string | null {
  const origen = request.headers.get("origin");
  if (!origen) return null;
  const permitidos = (process.env.FORMULARIOS_ORIGENES ?? "")
    .split(",")
    .map((valor) => valor.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return permitidos.includes(origen) ? origen : null;
}

function cabecerasCors(request: Request): HeadersInit {
  const origen = origenPermitido(request);
  return origen
    ? { "Access-Control-Allow-Origin": origen, "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}

export function respuesta(request: Request, cuerpo: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: cabecerasCors(request) });
}

export function preflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: { ...cabecerasCors(request), "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" },
  });
}

/** Campo trampa: es invisible para una persona; si viene lleno, lo completo un bot. */
export function esSpam(formulario: FormData): boolean {
  return String(formulario.get("sitio_web") ?? "").trim() !== "";
}

export class ErrorFormulario extends Error {}

/** Lee un archivo del formulario validando tipo y tamano. */
export async function leerArchivo(valor: FormDataEntryValue | null, etiqueta: string): Promise<ArchivoAdjunto | null> {
  if (!(valor instanceof File) || valor.size === 0) return null;
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(valor.type)) {
    throw new ErrorFormulario(`${etiqueta}: solo se aceptan PDF o imágenes (JPG, PNG, WEBP).`);
  }
  return {
    nombre: valor.name.replace(/[\\/]/g, "_").slice(0, 150) || etiqueta,
    tipo: valor.type,
    datos: Buffer.from(await valor.arrayBuffer()),
  };
}

export function controlarTotal(archivos: readonly ArchivoAdjunto[]): void {
  if (archivos.reduce((total, archivo) => total + archivo.datos.length, 0) > MAX_BYTES_TOTAL) {
    throw new ErrorFormulario("Los archivos adjuntos superan los 4 MB en total. Reducí su tamaño e intentá de nuevo.");
  }
}

/** "2026-10-20" en hora de Argentina. */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
