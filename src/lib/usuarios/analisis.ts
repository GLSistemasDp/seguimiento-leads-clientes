import type { CotizacionUsuario, FacturaUsuario, FichaUsuario, ProductoUsuario } from "@/types/usuarios";
import { ESTADOS_COTIZACION, ESTADOS_PEDIDO_USUARIO } from "@/types/usuarios";
import { RELACIONES } from "@/types/seguimiento";

export function hoyArgentina(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}
export const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
export const totalProductos = (productos: readonly ProductoUsuario[]) => redondear(productos.reduce((total, p) => total + p.cantidad * p.precioUnitario, 0));
export const dineroUsuario = (valor: number, moneda: FichaUsuario["moneda"]) => new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(valor);
export function fechaUsuario(fecha: string): string {
  return fecha ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(fecha.length === 10 ? `${fecha}T12:00:00Z` : fecha)) : "Sin fecha";
}
export function estadoFactura(factura: FacturaUsuario, hoy: string): "Pagada" | "Pendiente" | "Vencida" {
  return factura.saldo <= 0 ? "Pagada" : factura.vencimiento < hoy ? "Vencida" : "Pendiente";
}
export function estadoCotizacion(cotizacion: CotizacionUsuario, hoy: string): CotizacionUsuario["estado"] {
  return ["PENDIENTE", "EN_NEGOCIACION"].includes(cotizacion.estado) && cotizacion.validez < hoy ? "VENCIDA" : cotizacion.estado;
}
export function ultimaObservacion(ficha: FichaUsuario) {
  return [...ficha.observaciones].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}
export function resumenUsuario(ficha: FichaUsuario, hoy: string, anio = Number(hoy.slice(0, 4))) {
  const delAnio = (fecha: string) => fecha.startsWith(String(anio)) && fecha <= hoy;
  const pedidos = ficha.pedidos.filter((p) => p.estado !== "CANCELADO" && delAnio(p.fecha));
  const facturas = ficha.facturas.filter((f) => delAnio(f.fecha));
  const pendientes = ficha.facturas.filter((f) => f.saldo > 0 && f.fecha <= hoy);
  const vencidas = pendientes.filter((f) => estadoFactura(f, hoy) === "Vencida");
  const abiertas = ficha.cotizaciones.filter((c) => c.fecha <= hoy && !["GANADA", "NO_GANADA"].includes(c.estado));
  const cerradas = ficha.cotizaciones.filter((c) => delAnio(c.fecha) && ["GANADA", "NO_GANADA"].includes(c.estado));
  const totalFacturado = redondear(facturas.reduce((s, f) => s + f.importe, 0));
  const saldo = redondear(pendientes.reduce((s, f) => s + f.saldo, 0));
  const ultimoPedido = [...ficha.pedidos].filter((p) => p.estado !== "CANCELADO" && p.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const ultimo = ultimaObservacion(ficha);
  // Se compara el mismo tramo del año para no presentar el año en curso como una caída artificial.
  const corte = anio === Number(hoy.slice(0, 4)) ? hoy.slice(4) : "-12-31";
  const anterior = redondear(ficha.facturas.filter((f) => f.fecha.startsWith(String(anio - 1)) && f.fecha.slice(4) <= corte).reduce((s, f) => s + f.importe, 0));
  return {
    totalFacturado, totalPedidos: redondear(pedidos.reduce((s, p) => s + totalProductos(p.productos), 0)),
    cantidadPedidos: pedidos.length, ticketPromedio: pedidos.length ? redondear(pedidos.reduce((s, p) => s + totalProductos(p.productos), 0) / pedidos.length) : 0,
    saldo, vencido: redondear(vencidas.reduce((s, f) => s + f.saldo, 0)), pendientes, vencidas, abiertas,
    creditoDisponible: redondear(ficha.limiteCredito - saldo), ultimoPedido,
    diasSinCompra: ultimoPedido ? Math.floor((Date.parse(hoy) - Date.parse(ultimoPedido.fecha)) / 86_400_000) : null,
    relacion: ultimo?.relacion ?? null, observacion: ultimo,
    conversion: cerradas.length ? Math.round(cerradas.filter((c) => c.estado === "GANADA").length / cerradas.length * 100) : null,
    variacion: anterior ? Math.round((totalFacturado - anterior) / anterior * 100) : null,
    promesasIncumplidas: pendientes.filter((f) => {
      const nota = [...(ficha.cobranzas[f.id] ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      return nota?.fechaPrometida && nota.fechaPrometida < hoy;
    }),
  };
}

export function rankingProductos(ficha: FichaUsuario, anio: number, hoy: string) {
  const productos = new Map<string, { codigo: string; descripcion: string; linea: string; cantidad: number; importe: number }>();
  for (const pedido of ficha.pedidos) {
    if (pedido.estado !== "ENTREGADO" || !pedido.fecha.startsWith(String(anio)) || pedido.fecha > hoy) continue;
    for (const producto of pedido.productos) {
      const actual = productos.get(producto.codigo) ?? { ...producto, cantidad: 0, importe: 0 };
      actual.cantidad += producto.cantidad;
      actual.importe = redondear(actual.importe + producto.cantidad * producto.precioUnitario);
      productos.set(producto.codigo, actual);
    }
  }
  return [...productos.values()].sort((a, b) => b.cantidad - a.cantidad || b.importe - a.importe);
}

export function rankingLineas(ficha: FichaUsuario, anio: number, hoy: string) {
  const lineas = new Map<string, { linea: string; cantidad: number; importe: number }>();
  for (const producto of rankingProductos(ficha, anio, hoy)) {
    const actual = lineas.get(producto.linea) ?? { linea: producto.linea, cantidad: 0, importe: 0 };
    actual.cantidad += producto.cantidad;
    actual.importe = redondear(actual.importe + producto.importe);
    lineas.set(producto.linea, actual);
  }
  return [...lineas.values()].sort((a, b) => b.importe - a.importe);
}

export function serieMensual(ficha: FichaUsuario, anio: number, metrica: "facturacion" | "pedidos", hoy: string) {
  const meses = Array.from({ length: 12 }, () => 0);
  const documentos = metrica === "facturacion"
    ? ficha.facturas.map((f) => ({ fecha: f.fecha, importe: f.importe }))
    : ficha.pedidos.filter((p) => p.estado !== "CANCELADO").map((p) => ({ fecha: p.fecha, importe: totalProductos(p.productos) }));
  for (const documento of documentos) {
    if (!documento.fecha.startsWith(String(anio)) || documento.fecha > hoy) continue;
    const mes = Number(documento.fecha.slice(5, 7)) - 1;
    meses[mes] = redondear(meses[mes] + documento.importe);
  }
  return meses;
}

export function historialUsuario(ficha: FichaUsuario) {
  return [
    ...ficha.pedidos.map((p) => ({ id: `pedido-${p.id}`, fecha: `${p.fecha}T15:00:00Z`, tipo: "pedido" as const, titulo: `${p.numero} · ${ESTADOS_PEDIDO_USUARIO[p.estado]}`, detalle: `OC ${p.ordenCompra} · ${dineroUsuario(totalProductos(p.productos), ficha.moneda)}`, autor: "Registro comercial" })),
    ...ficha.cotizaciones.map((c) => ({ id: `cotizacion-${c.id}`, fecha: `${c.fecha}T15:00:00Z`, tipo: "cotizacion" as const, titulo: `Cotización ${c.numero}`, detalle: `${ESTADOS_COTIZACION[c.estado]}${c.motivoNoGanada ? ` · Motivo del cliente: ${c.motivoNoGanada}` : ""}`, autor: "Registro comercial" })),
    ...ficha.facturas.map((f) => ({ id: `factura-${f.id}`, fecha: `${f.fecha}T15:00:00Z`, tipo: "factura" as const, titulo: `Factura ${f.numero}`, detalle: `${dineroUsuario(f.importe, ficha.moneda)} · Vencimiento ${fechaUsuario(f.vencimiento)}`, autor: "Registro comercial" })),
    ...ficha.observaciones.map((o) => ({ id: o.id, fecha: o.fecha, tipo: "relacion" as const, titulo: `Relación: ${RELACIONES[o.relacion]}`, detalle: `${o.texto}${o.proximoContacto ? `\nPróximo contacto: ${fechaUsuario(o.proximoContacto)} · ${o.proximaAccion}` : ""}`, autor: o.autor })),
    ...Object.entries(ficha.cobranzas).flatMap(([id, notas]) => notas.map((nota) => ({ id: nota.id, fecha: nota.fecha, tipo: "cobranza" as const, titulo: `Gestión de factura ${ficha.facturas.find((f) => f.id === id)?.numero ?? id}`, detalle: `${nota.comentario}${nota.fechaPrometida ? ` · Pago prometido: ${fechaUsuario(nota.fechaPrometida)}` : ""}`, autor: nota.autor }))),
    ...ficha.eventos,
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
}
