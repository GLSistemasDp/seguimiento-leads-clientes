import { z } from "zod";
import { RELACIONES } from "@/types/seguimiento";
import { ESTADOS_COTIZACION } from "@/types/usuarios";
import type { CambioUsuario } from "@/types/usuarios";

const texto = (maximo: number) => z.string().trim().max(maximo, `El texto admite hasta ${maximo} caracteres.`);
const requerido = (maximo: number) => texto(maximo).min(1, "Completá los campos obligatorios.");
const dia = z.string().refine((valor) => valor === "" || (/^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) && new Date(valor).toISOString().slice(0, 10) === valor), "La fecha no es válida.");
const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("perfil"), perfil: z.object({ actividad: requerido(120), vendedor: requerido(160), contacto: texto(160), email: z.union([z.literal(""), z.email()]), telefono: texto(80) }).strict() }).strict(),
  z.object({ accion: z.literal("observacion"), texto: requerido(3000), relacion: z.enum(Object.keys(RELACIONES) as [keyof typeof RELACIONES, ...(keyof typeof RELACIONES)[]]), proximoContacto: dia, proximaAccion: texto(500) }).strict(),
  z.object({ accion: z.literal("cotizacion"), cotizacionId: requerido(100), estado: z.enum(Object.keys(ESTADOS_COTIZACION) as [keyof typeof ESTADOS_COTIZACION, ...(keyof typeof ESTADOS_COTIZACION)[]]), motivoNoGanada: texto(2000) }).strict(),
  z.object({ accion: z.literal("cobranza"), facturaId: requerido(100), comentario: requerido(2000), fechaPrometida: dia }).strict(),
]);

export function validarCambioUsuario(valor: unknown): CambioUsuario {
  const resultado = esquema.safeParse(valor);
  if (!resultado.success) throw new Error(resultado.error.issues[0]?.message || "Los datos no son válidos.");
  const cambio = resultado.data;
  if (cambio.accion === "cotizacion" && cambio.estado === "NO_GANADA" && !cambio.motivoNoGanada) throw new Error("Indicá el motivo que informó el cliente para la cotización no ganada.");
  if (cambio.accion === "observacion" && Boolean(cambio.proximoContacto) !== Boolean(cambio.proximaAccion)) throw new Error("Completá la fecha y la acción del próximo contacto, o dejá ambos vacíos.");
  return cambio;
}
