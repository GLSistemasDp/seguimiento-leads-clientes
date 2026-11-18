import { z } from "zod";
import { ESTADOS_COTIZACION, MEDIOS_PAGO, MOTIVOS_RECHAZO, TIPOS_PARTE } from "@/types/usuarios";
import type { CambioUsuario } from "@/types/usuarios";

/**
 * Forma de los datos que acepta PATCH /api/usuarios/[codigo]. Las reglas que
 * dependen de la cuenta (saldos, pertenencia de documentos) estan en gestion.ts.
 */

const claves = <T extends Record<string, string>>(objeto: T) => Object.keys(objeto) as [keyof T & string, ...(keyof T & string)[]];
const texto = (maximo: number) => z.string().trim().max(maximo, `El texto admite hasta ${maximo} caracteres.`);
const requerido = (maximo: number) => texto(maximo).min(1, "Completá los campos obligatorios.");
const esDia = (valor: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) && new Date(valor).toISOString().slice(0, 10) === valor;
const dia = z.string().refine(esDia, "La fecha no es válida.");
const diaOpcional = z.string().refine((valor) => valor === "" || esDia(valor), "La fecha no es válida.");
/** Importes positivos con hasta dos decimales. */
const importe = z
  .number("El importe no es válido.")
  .positive("El importe tiene que ser mayor a cero.")
  .max(1_000_000_000, "El importe es demasiado grande.")
  .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6, "El importe admite hasta dos decimales.");

const items = z
  .array(
    z.object({
      sku: requerido(40),
      cantidad: z.number("La cantidad no es válida.").int("La cantidad tiene que ser un número entero.").positive("La cantidad tiene que ser mayor a cero.").max(1_000_000),
      precioUnitario: importe,
    }).strict(),
  )
  .min(1, "Agregá al menos un producto.")
  .max(40, "Un documento admite hasta 40 productos.");

const esquema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("perfil"),
    perfil: z.object({
      actividad: requerido(120),
      vendedor: requerido(160),
      contacto: texto(160),
      email: z.union([z.literal(""), z.email("El email no es válido.")]),
      telefono: texto(80),
      umbralSeguimientoDias: z.number().int().min(1, "El umbral de seguimiento va de 1 a 365 días.").max(365, "El umbral de seguimiento va de 1 a 365 días."),
    }).strict(),
  }).strict(),
  z.object({ accion: z.literal("parte"), tipo: z.enum(claves(TIPOS_PARTE)), resumen: requerido(3000), proximoContacto: diaOpcional }).strict(),
  z.object({
    accion: z.literal("pago"),
    fecha: dia,
    importe,
    medio: z.enum(claves(MEDIOS_PAGO)),
    referencia: texto(120),
    imputaciones: z.array(z.object({ facturaId: requerido(100), importe }).strict()).max(60),
  }).strict(),
  z.object({ accion: z.literal("pedido"), ordenCompra: texto(80), items }).strict(),
  z.object({ accion: z.literal("cotizacion"), validez: dia, estado: z.enum(["BORRADOR", "ENVIADA"]), items }).strict(),
  z.object({
    accion: z.literal("estado-cotizacion"),
    cotizacionId: requerido(100),
    estado: z.enum(claves(ESTADOS_COTIZACION)),
    motivoRechazo: z.enum(claves(MOTIVOS_RECHAZO)).nullable(),
    observacionRechazo: texto(2000),
  }).strict(),
]);

export function validarCambioUsuario(valor: unknown): CambioUsuario {
  const resultado = esquema.safeParse(valor);
  if (!resultado.success) throw new Error(resultado.error.issues[0]?.message || "Los datos no son válidos.");
  const cambio = resultado.data;
  if (cambio.accion === "estado-cotizacion" && cambio.estado === "RECHAZADA") {
    if (!cambio.motivoRechazo) throw new Error("Para rechazar una cotización elegí el motivo.");
    if (!cambio.observacionRechazo) throw new Error("Para rechazar una cotización completá las observaciones.");
  }
  return cambio;
}
