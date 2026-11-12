import type { Relacion, Resultado } from "@/types/seguimiento";

/** Lo que manda la app al finalizar, reabrir o anotar una consulta. */
export type CambiosConsulta = {
  respondida?: boolean;
  observaciones?: string;
  resultado?: Resultado;
  relacion?: Relacion;
};

/**
 * Guarda los cambios de una consulta (PATCH /api/seguimiento/[id]) desde el
 * navegador. Devuelve null si salio bien o el mensaje de error. Lo usan la
 * tabla del seguimiento y la ficha del cliente.
 */
export async function guardarConsulta(id: string, cambios: CambiosConsulta): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/seguimiento/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (respuesta.ok) return null;
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    return cuerpo?.error ?? `Error ${respuesta.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
