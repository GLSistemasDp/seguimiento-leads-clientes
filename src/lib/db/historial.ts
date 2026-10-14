import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import { claveCliente } from "@/lib/db/sheets/maestros";
import type { EventoHistorial } from "@/types/seguimiento";

/**
 * Historial del seguimiento: cada vez que alguien finaliza una conversacion,
 * la reabre o le agrega una nota queda un evento con fecha. La planilla solo
 * guarda la ultima observacion; aca queda toda la historia con el cliente.
 */

const ARCHIVO = "seguimiento-historial";

export async function registrar(evento: Omit<EventoHistorial, "id" | "fecha">): Promise<EventoHistorial> {
  const completo: EventoHistorial = { ...evento, id: crypto.randomUUID(), fecha: new Date().toISOString() };
  await modificar<EventoHistorial[], void>(ARCHIVO, (datos) => {
    datos[evento.consultaId] = [...(datos[evento.consultaId] ?? []), completo];
  });
  return completo;
}

/** Eventos por consulta, del mas viejo al mas nuevo. */
export async function porConsulta(): Promise<Record<string, EventoHistorial[]>> {
  return leer<EventoHistorial[]>(ARCHIVO);
}

/** Toda la historia de un cliente (todas sus consultas), lo mas nuevo primero. */
export async function porCliente(cliente: string): Promise<EventoHistorial[]> {
  const clave = claveCliente(cliente);
  const todos = Object.values(await porConsulta()).flat();
  return todos
    .filter((evento) => claveCliente(evento.cliente) === clave)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Lo que se registro en el dia (hora de Argentina), para el resumen diario. */
export async function delDia(dia: string, diaLocal: (fecha: Date) => string): Promise<EventoHistorial[]> {
  return Object.values(await porConsulta())
    .flat()
    .filter((evento) => diaLocal(new Date(evento.fecha)) === dia);
}
