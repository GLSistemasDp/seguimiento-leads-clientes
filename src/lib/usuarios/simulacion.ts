import { redondear, totalProductos } from "@/lib/usuarios/analisis";
import { aplicarGestion, gestionVacia, registrarGestionUsuario } from "@/lib/usuarios/gestion";
import { clientesUsuariosDemo } from "@/lib/usuarios/demo";
import type { CambioUsuario, FichaUsuario, ProductoUsuario } from "@/types/usuarios";
import type { Relacion } from "@/types/seguimiento";

const sumarDias = (hoy: string, cantidad: number) => new Date(Date.parse(`${hoy}T12:00:00Z`) + cantidad * 86_400_000).toISOString().slice(0, 10);

/**
 * Amplía la ficha existente con casos de demostración. Usa sus productos,
 * precios, moneda, actividad y vendedor. No escribe en el almacén ni modifica la ficha original.
 */
export function simularFichaUsuario(original: FichaUsuario, hoy: string): FichaUsuario {
  const referencia = original.pedidos.find((p) => p.productos.length)?.productos
    ?? original.cotizaciones.find((c) => c.productos.length)?.productos
    ?? clientesUsuariosDemo(hoy)[0]?.pedidos[0]?.productos ?? [];
  const productos = (factor: number): ProductoUsuario[] => referencia.map((p) => ({ ...p, cantidad: Math.max(1, Math.round(p.cantidad * factor)) }));
  const codigo = original.codigo;
  const id = (clave: string) => `sim-${codigo}-${clave}`;
  const dia = (cantidad: number) => sumarDias(hoy, cantidad);
  const articulosEntregados = productos(1.4);
  const articulosPendientes = productos(0.8);
  const importeVencido = totalProductos(articulosEntregados);
  const importePendiente = totalProductos(articulosPendientes);
  const articulosPagados = productos(0.6);
  // La fuente actual ya es de ejemplo; se evita acumular escenarios al simular otra vez.
  const esSimulado = (registro: { id: string }) => registro.id.startsWith(`sim-${codigo}-`);
  const base: FichaUsuario = {
    ...original,
    pedidos: [
      ...original.pedidos.filter((p) => !esSimulado(p)),
      { id: id("pedido-entregado"), numero: `SIM-PED-${codigo}-01`, fecha: dia(-40), ordenCompra: `SIM-OC-${codigo}-01`, estado: "ENTREGADO", entregaEstimada: dia(-37), productos: articulosEntregados },
      { id: id("pedido-despachado"), numero: `SIM-PED-${codigo}-02`, fecha: dia(-2), ordenCompra: `SIM-OC-${codigo}-02`, estado: "DESPACHADO", entregaEstimada: dia(2), productos: articulosPendientes },
      { id: id("pedido-recibido"), numero: `SIM-PED-${codigo}-03`, fecha: hoy, ordenCompra: `SIM-OC-${codigo}-03`, estado: "RECIBIDO", entregaEstimada: dia(7), productos: productos(1.1) },
      { id: id("pedido-cancelado"), numero: `SIM-PED-${codigo}-04`, fecha: dia(-16), ordenCompra: `SIM-OC-${codigo}-04`, estado: "CANCELADO", entregaEstimada: dia(-10), productos: productos(0.5) },
      { id: id("pedido-preparacion"), numero: `SIM-PED-${codigo}-05`, fecha: dia(-1), ordenCompra: `SIM-OC-${codigo}-05`, estado: "EN_PREPARACION", entregaEstimada: dia(5), productos: productos(0.9) },
      { id: id("pedido-pagado"), numero: `SIM-PED-${codigo}-06`, fecha: dia(-70), ordenCompra: `SIM-OC-${codigo}-06`, estado: "ENTREGADO", entregaEstimada: dia(-67), productos: articulosPagados },
    ],
    cotizaciones: [
      ...original.cotizaciones.filter((c) => !esSimulado(c)),
      { id: id("cotizacion-no-ganada"), numero: `SIM-COT-${codigo}-01`, fecha: dia(-30), validez: dia(-15), estado: "EN_NEGOCIACION", motivoNoGanada: "", productos: productos(1.2) },
      { id: id("cotizacion-ganada"), numero: `SIM-COT-${codigo}-02`, fecha: dia(-20), validez: dia(10), estado: "PENDIENTE", motivoNoGanada: "", productos: productos(1.4) },
      { id: id("cotizacion-abierta"), numero: `SIM-COT-${codigo}-03`, fecha: dia(-2), validez: dia(28), estado: "EN_NEGOCIACION", motivoNoGanada: "", productos: productos(1.6) },
      { id: id("cotizacion-pendiente"), numero: `SIM-COT-${codigo}-04`, fecha: dia(-1), validez: dia(29), estado: "PENDIENTE", motivoNoGanada: "", productos: productos(0.7) },
      { id: id("cotizacion-vencida"), numero: `SIM-COT-${codigo}-05`, fecha: dia(-45), validez: dia(-15), estado: "VENCIDA", motivoNoGanada: "", productos: productos(0.6) },
    ],
    facturas: [
      ...original.facturas.filter((f) => !esSimulado(f)),
      { id: id("factura-vencida"), numero: `SIM-FAC-${codigo}-01`, fecha: dia(-37), vencimiento: dia(-7), pedidoId: id("pedido-entregado"), importe: importeVencido, saldo: redondear(importeVencido / 2) },
      { id: id("factura-pendiente"), numero: `SIM-FAC-${codigo}-02`, fecha: dia(-1), vencimiento: dia(29), pedidoId: id("pedido-despachado"), importe: importePendiente, saldo: importePendiente },
      { id: id("factura-pagada"), numero: `SIM-FAC-${codigo}-03`, fecha: dia(-67), vencimiento: dia(-37), pedidoId: id("pedido-pagado"), importe: totalProductos(articulosPagados), saldo: 0 },
    ],
    observaciones: [], cobranzas: {}, eventos: [],
  };
  let gestion = gestionVacia();
  const registrar = (clave: string, dias: number, cambio: CambioUsuario) => {
    gestion = registrarGestionUsuario(base, gestion, cambio, `Simulación · ${original.vendedor}`, `${dia(dias)}T15:00:00Z`, id(clave));
  };
  registrar("gestion-cotizacion-no-ganada", -22, { accion: "cotizacion", cotizacionId: id("cotizacion-no-ganada"), estado: "NO_GANADA", motivoNoGanada: "Compras informó que eligió otro proveedor porque necesitaba una entrega inmediata y nuestra propuesta tenía un plazo mayor." });
  registrar("gestion-cotizacion-ganada", -17, { accion: "cotizacion", cotizacionId: id("cotizacion-ganada"), estado: "GANADA", motivoNoGanada: "" });
  registrar("cobranza-problema", -6, { accion: "cobranza", facturaId: id("factura-vencida"), comentario: "El cliente informó que falta el remito conformado para completar la aprobación del pago. Se coordinó su envío con Administración.", fechaPrometida: "" });
  registrar("cobranza-promesa", -2, { accion: "cobranza", facturaId: id("factura-vencida"), comentario: "Administración confirmó la recepción del remito y el pago parcial. El saldo restante tenía compromiso para ayer; corresponde retomar el contacto.", fechaPrometida: dia(-1) });
  registrar("cobranza-pendiente", -1, { accion: "cobranza", facturaId: id("factura-pendiente"), comentario: "Factura recibida y aprobada por el cliente. Informaron que la incluirán en la próxima orden de pago.", fechaPrometida: dia(7) });
  registrar("relacion-inicial", -35, { accion: "observacion", texto: "Contacto habitual con Compras. Se relevaron necesidades de reposición de los productos que más utiliza la cuenta.", relacion: "BUENA", proximoContacto: dia(-28), proximaAccion: "Presentar propuesta de reposición" });
  registrar("relacion-reclamo", -21, { accion: "observacion", texto: "Compras manifestó disconformidad por la demora de una entrega. Solicitó un plan de regularización y está evaluando propuestas alternativas.", relacion: "EN_RIESGO", proximoContacto: dia(-18), proximaAccion: "Confirmar alternativas de entrega con Logística" });
  registrar("relacion-seguimiento", -10, { accion: "observacion", texto: "Se revisaron las condiciones con Compras y se confirmó la entrega pendiente. El cliente pidió seguimiento antes de la próxima compra.", relacion: "REGULAR", proximoContacto: dia(-3), proximaAccion: "Confirmar recepción y revisar la cotización abierta" });
  const indice = Math.abs(Math.trunc(Number(codigo) || codigo.length)) % 5;
  const relacion: Relacion = indice === 0 || indice === 3 ? "BUENA" : indice === 1 || indice === 2 ? "REGULAR" : "EN_RIESGO";
  registrar("relacion-actual", -1, {
    accion: "observacion", relacion,
    texto: relacion === "BUENA" ? "El cliente confirmó la recepción y quedó conforme con la solución. Mantiene buena disposición para ampliar la próxima compra." : relacion === "REGULAR" ? "El cliente mantiene el vínculo y la cotización en evaluación. Pidió revisar el plazo y confirmar las condiciones antes de emitir otra orden de compra." : "La cuenta sigue sensible por los plazos de entrega y una propuesta no ganada. El vendedor debe retomar contacto con Compras y acordar un plan concreto.",
    proximoContacto: relacion === "EN_RIESGO" ? dia(-1) : hoy,
    proximaAccion: relacion === "EN_RIESGO" ? "Llamar a Compras, confirmar entregas y recuperar la cuenta" : "Seguir la cotización abierta y proponer reposición de los productos habituales",
  });
  return aplicarGestion(base, gestion);
}
