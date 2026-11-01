import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import type { DecisionAlta, Estado, MotivoRechazo } from "@/types/solicitud";

/**
 * Historial de decisiones de cada solicitud de alta (aprobar, rechazar con
 * su motivo, volver a pendiente). Vive en el almacen (Postgres o .data/), asi
 * funciona igual con la planilla, la demo o Postgres como origen de las altas.
 */

const COLECCION = "solicitudes-decisiones";

type Registro = { historial: DecisionAlta[] };

export async function registrarDecision(
  id: string,
  estado: Estado,
  motivo: MotivoRechazo | null,
  comentario: string,
): Promise<DecisionAlta> {
  const decision: DecisionAlta = {
    estado,
    motivo: estado === "RECHAZADO" ? motivo : null,
    comentario: comentario.trim().slice(0, 1000),
    fecha: new Date().toISOString(),
  };
  await modificar<Registro, void>(COLECCION, (datos) => {
    datos[id] = { historial: [...(datos[id]?.historial ?? []), decision] };
  });
  return decision;
}

/** Todas las decisiones por solicitud, de la mas vieja a la mas nueva. */
export async function getDecisiones(): Promise<Record<string, DecisionAlta[]>> {
  const datos = await leer<Registro>(COLECCION);
  return Object.fromEntries(Object.entries(datos).map(([id, registro]) => [id, registro.historial ?? []]));
}

/** La ultima decision de cada solicitud (la vigente). */
export async function ultimasDecisiones(): Promise<Record<string, DecisionAlta>> {
  const todas = await getDecisiones();
  return Object.fromEntries(
    Object.entries(todas).flatMap(([id, historial]) => (historial.length ? [[id, historial[historial.length - 1]]] : [])),
  );
}
