import { ACCIONES, type Indicacion, type Sustituto } from "@/types/reclamo";

/** Valida lo que manda el formulario del gerente. La fecha la pone el servidor. */
export function validarIndicacion(valor: unknown): Omit<Indicacion, "fecha"> {
  if (!valor || typeof valor !== "object") throw new Error("Indicación inválida.");
  const { accion, sustitutos, comentario } = valor as Record<string, unknown>;
  if (typeof accion !== "string" || !Object.hasOwn(ACCIONES, accion)) {
    throw new Error("Seleccioná una acción para el vendedor.");
  }
  const texto = typeof comentario === "string" ? comentario.trim() : "";
  if (texto.length > 2000) throw new Error("El comentario admite hasta 2000 caracteres.");
  if (accion === "OTRA" && !texto) throw new Error("Escribí la indicación en el comentario.");

  const productos: Sustituto[] = [];
  if (accion === "SUSTITUTO") {
    if (!Array.isArray(sustitutos) || sustitutos.length === 0 || sustitutos.length > 20) {
      throw new Error("Indicá entre 1 y 20 productos sustitutos.");
    }
    for (const fila of sustitutos as unknown[]) {
      const { producto, observacion } = (fila ?? {}) as Record<string, unknown>;
      if (typeof producto !== "string" || !producto.trim() || producto.length > 200) {
        throw new Error("Completá el producto sustituto en cada fila.");
      }
      if (observacion !== undefined && (typeof observacion !== "string" || observacion.length > 500)) {
        throw new Error("La observación del producto admite hasta 500 caracteres.");
      }
      productos.push({ producto: producto.trim(), observacion: typeof observacion === "string" ? observacion.trim() : "" });
    }
  }
  return { accion: accion as Indicacion["accion"], sustitutos: productos, comentario: texto };
}
