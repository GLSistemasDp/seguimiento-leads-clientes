import {
  CAMPOS_CIERRE,
  CLASIFICACIONES,
  CLASIFICACIONES_CALIDAD,
  MAX_PRODUCTOS,
  type AccionCorrectiva,
  type Calidad,
  type NuevoReclamo,
  type ProductoReclamo,
} from "@/types/reclamo";

/**
 * Validacion del formulario FOR-03 Rev04. La usa el navegador (para avisar
 * antes de enviar) y el servidor (para no confiar en lo que llega).
 */

/** Error de datos del formulario: su mensaje se le puede mostrar a quien lo completo. */
export class ErrorValidacion extends Error {}

export const ADJUNTOS = {
  maximo: 4,
  /** Total de todos los archivos: el limite de un request en Vercel ronda los 4,5 MB. */
  bytes: 4 * 1024 * 1024,
  tipos: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
} as const;

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function cantidad(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) / 100 : 0;
}

export function validarNuevoReclamo(valor: unknown): NuevoReclamo {
  if (!valor || typeof valor !== "object") throw new ErrorValidacion("Formulario inválido.");
  const datos = valor as Record<string, unknown>;

  const razonSocial = texto(datos.razonSocial, 200);
  const contacto = texto(datos.contacto, 120);
  const detalle = texto(datos.detalle, 4000);
  const clasificacion = texto(datos.clasificacion, 60);
  const fecha = texto(datos.fecha, 10);
  const email = texto(datos.email, 200);

  if (!razonSocial) throw new ErrorValidacion("Completá la razón social.");
  if (!contacto) throw new ErrorValidacion("Completá nombre y apellido de quien reclama.");
  if (!(CLASIFICACIONES as readonly string[]).includes(clasificacion)) throw new ErrorValidacion("Elegí la clasificación del problema.");
  if (!detalle) throw new ErrorValidacion("Describí el problema en el detalle.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorValidacion("La fecha no es válida.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorValidacion("El e-mail no es válido.");

  const filas = Array.isArray(datos.productos) ? datos.productos : [];
  const productos: ProductoReclamo[] = [];
  for (const fila of filas.slice(0, MAX_PRODUCTOS)) {
    const item = (fila ?? {}) as Record<string, unknown>;
    const codigo = texto(item.codigo, 60);
    const descripcion = texto(item.descripcion, 200);
    if (!codigo && !descripcion) continue;
    const producto = {
      codigo,
      descripcion,
      cantidadFacturada: cantidad(item.cantidadFacturada),
      cantidadReclamo: cantidad(item.cantidadReclamo),
    };
    if (producto.cantidadReclamo > producto.cantidadFacturada && producto.cantidadFacturada > 0) {
      throw new ErrorValidacion(`En ${codigo || descripcion} la cantidad reclamada supera la facturada.`);
    }
    productos.push(producto);
  }

  return {
    fecha,
    razonSocial,
    numeroCliente: texto(datos.numeroCliente, 40),
    sucursal: texto(datos.sucursal, 120),
    transporte: texto(datos.transporte, 120),
    contacto,
    cargo: texto(datos.cargo, 120),
    telefono: texto(datos.telefono, 60),
    email,
    ordenCompra: texto(datos.ordenCompra, 60),
    pedido: texto(datos.pedido, 60),
    factura: texto(datos.factura, 60),
    remito: texto(datos.remito, 60),
    clasificacion: clasificacion as NuevoReclamo["clasificacion"],
    detalle,
    productos,
    consultaId: texto(datos.consultaId, 80) || null,
  };
}

export function validarCalidad(valor: unknown): { calidad: Calidad; cierre: Record<string, string | null> } {
  if (!valor || typeof valor !== "object") throw new ErrorValidacion("Datos inválidos.");
  const datos = valor as Record<string, unknown>;
  const calidad = (datos.calidad ?? {}) as Record<string, unknown>;
  const clasificacion = texto(calidad.clasificacion, 60);
  if (clasificacion && !(CLASIFICACIONES_CALIDAD as readonly string[]).includes(clasificacion)) {
    throw new ErrorValidacion("Clasificación de calidad inválida.");
  }
  const acciones: AccionCorrectiva[] = (Array.isArray(calidad.acciones) ? calidad.acciones : [])
    .slice(0, 20)
    .map((fila) => {
      const item = (fila ?? {}) as Record<string, unknown>;
      return {
        fecha: texto(item.fecha, 10),
        accion: texto(item.accion, 500),
        responsable: texto(item.responsable, 120),
        tiempo: texto(item.tiempo, 60),
        resultado: texto(item.resultado, 300),
      };
    })
    .filter((accion) => accion.accion || accion.responsable || accion.resultado);

  const crudo = (datos.cierre ?? {}) as Record<string, unknown>;
  const cierre = Object.fromEntries(
    CAMPOS_CIERRE.map((campo) => {
      const valorCampo = texto(crudo[campo], 1000);
      return [campo, valorCampo || null];
    }),
  );

  return {
    calidad: {
      clasificacion: clasificacion || null,
      causa: texto(calidad.causa, 4000) || null,
      procedente: typeof calidad.procedente === "boolean" ? calidad.procedente : null,
      acciones,
    },
    cierre,
  };
}
