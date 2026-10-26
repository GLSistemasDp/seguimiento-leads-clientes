import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import { backendSeguimiento } from "@/lib/db/seguimiento";
import { claveCliente } from "@/lib/db/sheets/maestros";
import type { EventoHistorial } from "@/types/seguimiento";

/**
 * Historial del seguimiento: cada vez que alguien finaliza una conversacion,
 * la reabre o le agrega una nota queda un evento con fecha. La planilla solo
 * guarda la ultima observacion; aca queda toda la historia con el cliente.
 *
 * Con SEGUIMIENTO_BACKEND="postgres" la historia es `chat_interacciones`:
 * finalizar y reabrir los registra el trigger de la base; aca solo se
 * insertan las notas.
 */

const conPostgres = () => backendSeguimiento() === "postgres";
const pg = () => import("@/lib/db/postgres/seguimiento");

const ARCHIVO = "seguimiento-historial";

export async function registrar(evento: Omit<EventoHistorial, "id" | "fecha">): Promise<EventoHistorial> {
  if (conPostgres()) {
    const base = await pg();
    if (evento.tipo === "nota") return base.registrarNota(evento);
    const registrado = await base.ultimoEvento(evento.consultaId, evento.tipo);
    if (registrado) return registrado;
  }
  const completo: EventoHistorial = { ...evento, id: crypto.randomUUID(), fecha: new Date().toISOString() };
  await modificar<EventoHistorial[], void>(ARCHIVO, (datos) => {
    datos[evento.consultaId] = [...(datos[evento.consultaId] ?? []), completo];
  });
  return completo;
}

/** Eventos por consulta, del mas viejo al mas nuevo. */
export async function porConsulta(): Promise<Record<string, EventoHistorial[]>> {
  if (conPostgres()) return (await pg()).porConsulta();
  return leer<EventoHistorial[]>(ARCHIVO);
}

/** Toda la historia de un cliente (todas sus consultas), lo mas nuevo primero. */
export async function porCliente(cliente: string): Promise<EventoHistorial[]> {
  if (conPostgres()) return (await pg()).porCliente(cliente);
  const clave = claveCliente(cliente);
  const todos = Object.values(await porConsulta()).flat();
  return todos
    .filter((evento) => claveCliente(evento.cliente) === clave)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * El ultimo cierre de cada cliente, por su clave (codigo, o nombre si no
 * tiene): es el "ultimo estado de gestion" que muestra la bandeja.
 */
export async function ultimasGestiones(): Promise<Record<string, EventoHistorial>> {
  const eventos = conPostgres()
    ? await (await pg()).ultimasGestiones()
    : Object.values(await porConsulta())
        .flat()
        .filter((evento) => evento.tipo === "finalizada");
  const porCliente: Record<string, EventoHistorial> = {};
  for (const evento of eventos) {
    const clave = claveCliente(evento.cliente);
    if (!porCliente[clave] || porCliente[clave].fecha < evento.fecha) porCliente[clave] = evento;
  }
  return porCliente;
}

/** Lo que se registro en el dia (hora de Argentina), para el resumen diario. */
export async function delDia(dia: string, diaLocal: (fecha: Date) => string): Promise<EventoHistorial[]> {
  if (conPostgres()) return (await pg()).delDia(dia);
  return Object.values(await porConsulta())
    .flat()
    .filter((evento) => diaLocal(new Date(evento.fecha)) === dia);
}
