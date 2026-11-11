import type { CambioUsuario, FichaUsuario, GestionUsuario } from "@/types/usuarios";
import { ESTADOS_COTIZACION } from "@/types/usuarios";

export const gestionVacia = (): GestionUsuario => ({ observaciones: [], cotizaciones: {}, cobranzas: {}, eventos: [] });

export function aplicarGestion(ficha: FichaUsuario, gestion: GestionUsuario): FichaUsuario {
  return {
    ...ficha, ...gestion.perfil,
    cotizaciones: ficha.cotizaciones.map((cotizacion) => ({ ...cotizacion, ...gestion.cotizaciones[cotizacion.id] })),
    observaciones: [...gestion.observaciones, ...ficha.observaciones].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    cobranzas: Object.fromEntries(ficha.facturas.map((factura) => [factura.id, [...(gestion.cobranzas[factura.id] ?? []), ...(ficha.cobranzas[factura.id] ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha))])),
    eventos: [...gestion.eventos, ...ficha.eventos],
  };
}

/** Se ejecuta dentro de la transacción del almacén: cada gestión agrega historia sin pisar otra. */
export function registrarGestionUsuario(base: FichaUsuario, actual: GestionUsuario, cambio: CambioUsuario, autor: string, fecha: string, id: string): GestionUsuario {
  const siguiente: GestionUsuario = { ...actual, observaciones: [...actual.observaciones], cotizaciones: { ...actual.cotizaciones }, cobranzas: { ...actual.cobranzas }, eventos: [...actual.eventos] };
  if (cambio.accion === "observacion") {
    siguiente.observaciones.unshift({ id, fecha, autor, texto: cambio.texto, relacion: cambio.relacion, proximoContacto: cambio.proximoContacto, proximaAccion: cambio.proximaAccion });
  } else if (cambio.accion === "cotizacion") {
    const cotizacion = base.cotizaciones.find((c) => c.id === cambio.cotizacionId);
    if (!cotizacion) throw new Error("La cotización no pertenece a este cliente.");
    if (cambio.estado === "NO_GANADA" && !cambio.motivoNoGanada.trim()) throw new Error("Falta el motivo informado por el cliente.");
    const previo = actual.cotizaciones[cotizacion.id] ?? cotizacion;
    siguiente.cotizaciones[cotizacion.id] = { estado: cambio.estado, motivoNoGanada: cambio.estado === "NO_GANADA" ? cambio.motivoNoGanada : "" };
    siguiente.eventos.unshift({ id, fecha, autor, tipo: "cotizacion", titulo: `${cotizacion.numero} · ${ESTADOS_COTIZACION[cambio.estado]}`, detalle: `${ESTADOS_COTIZACION[previo.estado]} → ${ESTADOS_COTIZACION[cambio.estado]}${cambio.estado === "NO_GANADA" ? ` · Motivo del cliente: ${cambio.motivoNoGanada}` : ""}` });
  } else if (cambio.accion === "cobranza") {
    const factura = base.facturas.find((f) => f.id === cambio.facturaId);
    if (!factura) throw new Error("La factura no pertenece a este cliente.");
    if (factura.saldo <= 0) throw new Error("Solo se agregan gestiones a facturas con saldo pendiente.");
    siguiente.cobranzas[factura.id] = [{ id, fecha, autor, comentario: cambio.comentario, fechaPrometida: cambio.fechaPrometida }, ...(actual.cobranzas[factura.id] ?? [])];
  } else {
    siguiente.perfil = cambio.perfil;
    siguiente.eventos.unshift({ id, fecha, autor, tipo: "perfil", titulo: "Ficha comercial actualizada", detalle: `Actividad: ${cambio.perfil.actividad} · Vendedor asignado: ${cambio.perfil.vendedor}` });
  }
  return siguiente;
}
