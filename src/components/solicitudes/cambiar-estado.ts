"use client";

import type { Estado } from "@/types/solicitud";

export type ResultadoCambio = { ok: true } | { ok: false; error: string };

/**
 * Llama al endpoint que cambia el estado de una solicitud.
 * Vive del lado del cliente: los componentes de /solicitudes lo usan tanto
 * desde la tabla como desde el detalle.
 */
export async function cambiarEstado(id: string, estado: Estado): Promise<ResultadoCambio> {
  try {
    const respuesta = await fetch(`/api/solicitudes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });

    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: cuerpo?.error ?? `Error ${respuesta.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
