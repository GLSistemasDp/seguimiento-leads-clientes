import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function cargar(nombre) {
  if (!nombre.startsWith("@/")) return require(nombre);
  if (cache.has(nombre)) return cache.get(nombre);
  const archivo = nombre.replace("@/", "src/") + ".ts";
  const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  cache.set(nombre, modulo.exports);
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: cargar, Date, Intl, Map, Set, Error }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { clientesUsuariosDemo } = cargar("@/lib/usuarios/demo");
const { aplicarGestion, gestionVacia, registrarGestionUsuario } = cargar("@/lib/usuarios/gestion");
const { validarCambioUsuario } = cargar("@/lib/usuarios/validacion");
const {
  resumenUsuario, facturasConEstado, cuentaCorriente, productosHabituales, facturacionMensual, ultimoContacto,
  hoyArgentina, totalItems, sumarDias, diasEntre,
} = cargar("@/lib/usuarios/analisis");
const { estadoCuenta, cumpleFiltro, coincideBusqueda, ordenarCartera, totalesCartera } = cargar("@/lib/usuarios/cartera");

const HOY = "2026-11-17";
const cuentas = clientesUsuariosDemo(HOY);
const cuenta = (codigo) => cuentas.find((item) => item.codigo === codigo);
// Un escenario por cliente.
const [deuda, brecha, sinContacto, rechazo, alDia] = ["TOYOTA", "ARCOR", "ROWING", "TERNIUM", "EMOVA"].map(cuenta);
const resumenes = new Map(cuentas.map((item) => [item.codigo, resumenUsuario(item, HOY)]));
let contador = 0;
/** Registra un cambio (validado como en la API) sobre una cuenta y devuelve la gestion. */
function registrar(base, gestion, cambio) {
  contador += 1;
  return registrarGestionUsuario(base, gestion, validarCambioUsuario(cambio), "Ejecutiva de prueba", `${HOY}T15:00:${String(contador).padStart(2, "0")}Z`, `id-${contador}`, HOY);
}
const mensaje = (accion) => {
  try {
    accion();
  } catch (error) {
    return error.message;
  }
  return null;
};

// --- Datos de ejemplo: un escenario por cuenta ---------------------------------------

test("las cuentas son los clientes reales, sin datos inventados de contacto ni fiscales", () => {
  assert.deepEqual(Array.from(cuentas, (item) => item.nombre), ["Toyota", "Honda", "Arcor", "Rowing", "Ternium", "Techint", "Emova"]);
  for (const item of cuentas) {
    // No se inventan CUIT, emails ni telefonos de empresas reales (y sin email el mailing no les escribe).
    assert.equal(item.cuit, "");
    assert.equal(item.email, "");
    assert.ok(item.contactos.every((contacto) => !contacto.email && !contacto.telefono && !contacto.nombre));
    assert.deepEqual(Array.from(item.contactos, (contacto) => contacto.rol), ["COMPRAS", "PAGOS", "GERENCIA"]);
    assert.equal(item.plazoPagoDias, 30);
    assert.equal(item.origen, "demo");
    assert.equal(new Set(item.facturas.map((factura) => factura.numero)).size, item.facturas.length);
    assert.equal(new Set(item.pedidos.map((pedido) => pedido.numero)).size, item.pedidos.length);
  }
  assert.equal(new Set(cuentas.flatMap((item) => item.facturas.map((factura) => factura.numero))).size, cuentas.reduce((total, item) => total + item.facturas.length, 0));
});

test("escenario: cuenta con deuda vencida (una factura impaga y otra con pago parcial)", () => {
  const resumen = resumenUsuario(deuda, HOY);
  const vencidas = facturasConEstado(deuda, HOY).filter((factura) => factura.vencida);
  assert.equal(resumen.facturasVencidas, 2);
  assert.deepEqual(Array.from(vencidas, (factura) => factura.estado), ["PARCIAL", "PENDIENTE"]);
  assert.deepEqual(Array.from(vencidas, (factura) => factura.diasMora), [34, 4]);
  assert.equal(resumen.deudaVencida, vencidas[0].saldo + vencidas[1].saldo);
  assert.ok(resumen.saldo > resumen.deudaVencida, "el saldo suma tambien la factura que todavia no vence");
  // Las demas cuentas no tienen nada vencido.
  for (const cuenta of [brecha, sinContacto, rechazo, alDia]) assert.equal(resumenUsuario(cuenta, HOY).facturasVencidas, 0, cuenta.nombre);
});

test("escenario: cuenta sin contacto hace 20 dias, por encima de su umbral de 15", () => {
  const resumen = resumenUsuario(sinContacto, HOY);
  assert.equal(resumen.contacto.dias, 20);
  assert.equal(resumen.contacto.origen, "parte");
  assert.equal(sinContacto.umbralSeguimientoDias, 15);
  assert.equal(resumen.requiereSeguimiento, true);
  assert.ok(resumen.proximoContacto < HOY, "la proxima fecha de contacto ya paso");
  for (const cuenta of [brecha, rechazo, deuda, alDia]) assert.equal(resumenUsuario(cuenta, HOY).requiereSeguimiento, false, cuenta.nombre);
});

test("escenario: cotizacion rechazada por precio, con motivo y observaciones", () => {
  const rechazada = rechazo.cotizaciones.find((cotizacion) => cotizacion.estado === "RECHAZADA");
  assert.equal(rechazada.motivoRechazo, "PRECIO");
  assert.ok(rechazada.observacionRechazo.length > 20);
  // Abiertas: solo enviadas y en negociacion (ni borradores, ni aprobadas, ni rechazadas).
  const resumen = resumenUsuario(rechazo, HOY);
  const negociacion = rechazo.cotizaciones.find((cotizacion) => cotizacion.estado === "EN_NEGOCIACION");
  assert.equal(resumen.cotizacionesAbiertas, 1);
  assert.equal(resumen.importeCotizaciones, totalItems(negociacion.items));
  assert.equal(resumenUsuario(deuda, HOY).cotizacionesAbiertas, 0, "un borrador no es una cotizacion abierta");
});

test("escenario: dejo de pedir dos productos habituales en su ultimo pedido", () => {
  const analisis = productosHabituales(brecha, HOY);
  assert.equal(analisis.pedidosAnalizados, 5, "seis meses de pedidos, sin contar el ultimo");
  assert.equal(analisis.habituales.length, 4);
  assert.deepEqual(Array.from(analisis.ausentes, (producto) => producto.sku).sort(), ["DPT200060605", "DPT300075605"]);
  assert.ok(analisis.ausentes.every((producto) => producto.veces === 5 && !producto.enUltimoPedido));
  assert.equal(analisis.ultimoPedido.fecha, sumarDias(HOY, -6));
  // El producto ocasional (dos pedidos en el periodo) no llega a ser habitual.
  assert.ok(!analisis.habituales.some((producto) => producto.veces < 3));
  for (const cuenta of [sinContacto, rechazo, deuda, alDia]) assert.equal(productosHabituales(cuenta, HOY).ausentes.length, 0, cuenta.nombre);
});

// --- Cuenta corriente y facturas -----------------------------------------------------

test("la cuenta corriente acumula debe y haber, y cierra con las facturas pendientes", () => {
  for (const cuenta of cuentas) {
    const movimientos = cuentaCorriente(cuenta, HOY);
    const debe = movimientos.reduce((total, movimiento) => total + movimiento.debe, 0);
    const haber = movimientos.reduce((total, movimiento) => total + movimiento.haber, 0);
    const saldo = movimientos.at(-1).saldo;
    assert.ok(Math.abs(saldo - (debe - haber)) < 0.01, cuenta.nombre);
    const pendiente = facturasConEstado(cuenta, HOY).reduce((total, factura) => total + factura.saldo, 0);
    assert.ok(Math.abs(saldo - pendiente) < 0.01, `${cuenta.nombre}: sin pagos a cuenta, el saldo es lo que falta cobrar`);
    assert.ok(movimientos.every((movimiento, indice) => indice === 0 || movimiento.fecha >= movimientos[indice - 1].fecha));
  }
  const nota = cuentaCorriente(alDia, HOY).find((movimiento) => movimiento.tipo === "NOTA_CREDITO");
  assert.ok(nota.haber > 0 && nota.debe === 0, "la nota de credito va al haber");
});

test("una factura que vence hoy todavia no esta vencida", () => {
  const ficha = { facturas: [{ id: "f", numero: "A-1", fecha: "2026-10-18", vencimiento: HOY, pedidoId: "", total: 100 }], pagos: [], notasCredito: [] };
  assert.equal(facturasConEstado(ficha, HOY)[0].vencida, false);
  const manana = sumarDias(HOY, 1);
  assert.equal(facturasConEstado(ficha, manana)[0].vencida, true);
  assert.equal(facturasConEstado(ficha, manana)[0].diasMora, 1);
});

// --- Carga de pagos ---------------------------------------------------------------------

test("un pago imputado a varias facturas actualiza sus estados y la cuenta corriente", () => {
  const [parcial, impaga] = facturasConEstado(deuda, HOY).filter((factura) => factura.vencida);
  const saldoAntes = resumenUsuario(deuda, HOY).saldo;
  const gestion = registrar(deuda, gestionVacia(), {
    accion: "pago", fecha: HOY, importe: parcial.saldo + 100, medio: "CHEQUE", referencia: "E-cheq 4411",
    imputaciones: [{ facturaId: parcial.id, importe: parcial.saldo }, { facturaId: impaga.id, importe: 100 }],
  });
  const ficha = aplicarGestion(deuda, gestion);
  const estados = new Map(facturasConEstado(ficha, HOY).map((factura) => [factura.id, factura]));
  assert.equal(estados.get(parcial.id).estado, "PAGADA");
  assert.equal(estados.get(impaga.id).estado, "PARCIAL");
  assert.ok(Math.abs(estados.get(impaga.id).saldo - (impaga.saldo - 100)) < 0.01);
  assert.ok(Math.abs(resumenUsuario(ficha, HOY).saldo - (saldoAntes - parcial.saldo - 100)) < 0.01);
  assert.equal(resumenUsuario(ficha, HOY).facturasVencidas, 1);
  const recibo = ficha.pagos.at(-1);
  assert.match(recibo.numero, /^REC-TOYOTA-\d{3}$/);
  assert.equal(recibo.autor, "Ejecutiva de prueba");
  assert.equal(deuda.pagos.length + 1, ficha.pagos.length, "la fuente comercial no se modifica");
});

test("lo que sobra de un pago queda a cuenta y baja el saldo", () => {
  const [parcial] = facturasConEstado(deuda, HOY).filter((factura) => factura.vencida);
  const saldoAntes = resumenUsuario(deuda, HOY).saldo;
  const ficha = aplicarGestion(deuda, registrar(deuda, gestionVacia(), { accion: "pago", fecha: HOY, importe: 500, medio: "TRANSFERENCIA", referencia: "", imputaciones: [] }));
  assert.ok(Math.abs(resumenUsuario(ficha, HOY).saldo - (saldoAntes - 500)) < 0.01);
  assert.equal(facturasConEstado(ficha, HOY).find((factura) => factura.id === parcial.id).saldo, parcial.saldo, "sin imputar, la factura no cambia");
  assert.equal(cuentaCorriente(ficha, HOY).at(-1).detalle, "Pago a cuenta");
});

test("el pago rechaza importes que superan el saldo, facturas ajenas, fechas futuras y sobreimputacion", () => {
  const [parcial, impaga] = facturasConEstado(deuda, HOY).filter((factura) => factura.vencida);
  const pago = (extra) => ({ accion: "pago", fecha: HOY, importe: 1000, medio: "TRANSFERENCIA", referencia: "", imputaciones: [], ...extra });
  assert.match(mensaje(() => registrar(deuda, gestionVacia(), pago({ importe: parcial.saldo + 50, imputaciones: [{ facturaId: parcial.id, importe: parcial.saldo + 50 }] }))), /supera su saldo/);
  assert.match(mensaje(() => registrar(deuda, gestionVacia(), pago({ imputaciones: [{ facturaId: "fac-inexistente", importe: 10 }] }))), /no pertenece/);
  assert.match(mensaje(() => registrar(deuda, gestionVacia(), pago({ fecha: sumarDias(HOY, 1) }))), /futura/);
  assert.match(mensaje(() => registrar(deuda, gestionVacia(), pago({ importe: 100, imputaciones: [{ facturaId: impaga.id, importe: 150 }] }))), /supera el importe del pago/);
  assert.match(mensaje(() => registrar(deuda, gestionVacia(), pago({ imputaciones: [{ facturaId: impaga.id, importe: 10 }, { facturaId: impaga.id, importe: 10 }] }))), /dos veces/);
  // La forma de los datos la corta la validacion, como en la API.
  assert.match(mensaje(() => validarCambioUsuario(pago({ importe: 0 }))), /mayor a cero/);
  assert.match(mensaje(() => validarCambioUsuario(pago({ importe: 10.123 }))), /dos decimales/);
  assert.match(mensaje(() => validarCambioUsuario(pago({ medio: "BITCOIN" }))), /./);
  assert.match(mensaje(() => validarCambioUsuario(pago({ fecha: "2026-02-31" }))), /fecha/);
  assert.match(mensaje(() => validarCambioUsuario(pago({ autor: "otro" }))), /./, "el autor no se acepta desde el navegador");
});

// --- Cotizaciones ------------------------------------------------------------------------

test("rechazar una cotizacion exige motivo del catalogo y observaciones", () => {
  const enviada = brecha.cotizaciones.find((cotizacion) => cotizacion.estado === "ENVIADA");
  const cambio = (extra) => ({ accion: "estado-cotizacion", cotizacionId: enviada.id, estado: "RECHAZADA", motivoRechazo: null, observacionRechazo: "", ...extra });
  assert.match(mensaje(() => validarCambioUsuario(cambio({}))), /motivo/);
  assert.match(mensaje(() => validarCambioUsuario(cambio({ motivoRechazo: "PRECIO" }))), /observaciones/);
  assert.match(mensaje(() => validarCambioUsuario(cambio({ motivoRechazo: "PRECIO", observacionRechazo: "   " }))), /observaciones/);
  assert.match(mensaje(() => validarCambioUsuario(cambio({ motivoRechazo: "PORQUE_SI", observacionRechazo: "x" }))), /./, "el motivo sale del catalogo");

  let gestion = registrar(brecha, gestionVacia(), cambio({ motivoRechazo: "COMPETENCIA", observacionRechazo: "Compraron a otro proveedor con entrega inmediata." }));
  let cotizacion = aplicarGestion(brecha, gestion).cotizaciones.find((item) => item.id === enviada.id);
  assert.equal(cotizacion.estado, "RECHAZADA");
  assert.equal(cotizacion.motivoRechazo, "COMPETENCIA");
  assert.equal(resumenUsuario(aplicarGestion(brecha, gestion), HOY).cotizacionesAbiertas, 0);

  // Al volver a otro estado se limpian el motivo y las observaciones.
  gestion = registrar(brecha, gestion, { accion: "estado-cotizacion", cotizacionId: enviada.id, estado: "EN_NEGOCIACION", motivoRechazo: "PRECIO", observacionRechazo: "no deberia guardarse" });
  cotizacion = aplicarGestion(brecha, gestion).cotizaciones.find((item) => item.id === enviada.id);
  assert.deepEqual([cotizacion.estado, cotizacion.motivoRechazo, cotizacion.observacionRechazo], ["EN_NEGOCIACION", null, ""]);
  assert.match(mensaje(() => registrar(brecha, gestionVacia(), { accion: "estado-cotizacion", cotizacionId: "cot-de-otro", estado: "APROBADA", motivoRechazo: null, observacionRechazo: "" })), /no pertenece/);
});

test("una cotizacion nueva toma los productos del catalogo y despues se puede cambiar de estado", () => {
  const validez = sumarDias(HOY, 30);
  let gestion = registrar(alDia, gestionVacia(), { accion: "cotizacion", validez, estado: "ENVIADA", items: [{ sku: "172226X", cantidad: 240, precioUnitario: 11.2 }, { sku: "DPT100030605", cantidad: 12, precioUnitario: 13.2 }] });
  const nueva = aplicarGestion(alDia, gestion).cotizaciones.at(-1);
  assert.match(nueva.numero, /^COT-EMOVA-\d{3}$/);
  assert.equal(nueva.fecha, HOY);
  assert.equal(nueva.items[0].descripcion, "Guante americano de vaqueta con refuerzo antiimpacto");
  assert.equal(totalItems(nueva.items), 240 * 11.2 + 12 * 13.2);
  assert.ok(!alDia.cotizaciones.some((cotizacion) => cotizacion.numero === nueva.numero), "el numero no repite uno existente");
  gestion = registrar(alDia, gestion, { accion: "estado-cotizacion", cotizacionId: nueva.id, estado: "APROBADA", motivoRechazo: null, observacionRechazo: "" });
  assert.equal(aplicarGestion(alDia, gestion).cotizaciones.at(-1).estado, "APROBADA");

  const cotizar = (extra) => ({ accion: "cotizacion", validez, estado: "BORRADOR", items: [{ sku: "172226X", cantidad: 1, precioUnitario: 1 }], ...extra });
  assert.match(mensaje(() => registrar(alDia, gestionVacia(), cotizar({ validez: sumarDias(HOY, -1) }))), /validez/);
  assert.match(mensaje(() => registrar(alDia, gestionVacia(), cotizar({ items: [{ sku: "NO-EXISTE", cantidad: 1, precioUnitario: 1 }] }))), /catálogo/);
  assert.match(mensaje(() => validarCambioUsuario(cotizar({ items: [] }))), /al menos un producto/);
  assert.match(mensaje(() => validarCambioUsuario(cotizar({ estado: "APROBADA" }))), /./, "una cotizacion nace como borrador o enviada");
  assert.match(mensaje(() => validarCambioUsuario(cotizar({ items: [{ sku: "172226X", cantidad: 1.5, precioUnitario: 1 }] }))), /entero/);
});

// --- Partes, pedidos e inactividad --------------------------------------------------------

test("un parte nuevo reinicia los dias sin contacto y apaga la alerta de seguimiento", () => {
  const proximo = sumarDias(HOY, 7);
  const gestion = registrar(sinContacto, gestionVacia(), { accion: "parte", tipo: "LLAMADA", resumen: "Compras confirmó que aprueban la cotización esta semana.", proximoContacto: proximo });
  const ficha = aplicarGestion(sinContacto, gestion);
  const resumen = resumenUsuario(ficha, HOY);
  assert.equal(resumen.contacto.dias, 0);
  assert.equal(resumen.requiereSeguimiento, false);
  assert.equal(resumen.proximoContacto, proximo);
  assert.equal(ficha.partes[0].autor, "Ejecutiva de prueba");
  assert.equal(ficha.partes.length, sinContacto.partes.length + 1);
  assert.match(mensaje(() => registrar(sinContacto, gestionVacia(), { accion: "parte", tipo: "LLAMADA", resumen: "x", proximoContacto: sumarDias(HOY, -1) })), /anterior a hoy/);
  assert.match(mensaje(() => validarCambioUsuario({ accion: "parte", tipo: "LLAMADA", resumen: "  ", proximoContacto: "" })), /obligatorios/);
  assert.match(mensaje(() => validarCambioUsuario({ accion: "parte", tipo: "PALOMA", resumen: "x", proximoContacto: "" })), /./);
});

test("un pedido cargado cuenta como contacto y entra al analisis de habituales", () => {
  const gestion = registrar(sinContacto, gestionVacia(), { accion: "pedido", ordenCompra: "OC-9001", items: [{ sku: "DPS11255X", cantidad: 480, precioUnitario: 9.1 }] });
  const ficha = aplicarGestion(sinContacto, gestion);
  const pedido = ficha.pedidos.at(-1);
  assert.deepEqual([pedido.estado, pedido.fecha, pedido.ordenCompra], ["RECIBIDO", HOY, "OC-9001"]);
  assert.equal(pedido.numero, "PED-ROWING-010", "sigue la numeracion de los nueve pedidos anteriores");
  assert.deepEqual([ultimoContacto(ficha, HOY).dias, ultimoContacto(ficha, HOY).origen], [0, "pedido"]);
  // El pedido nuevo pasa a ser "el ultimo": los otros tres habituales quedan ausentes.
  const analisis = productosHabituales(ficha, HOY);
  assert.equal(analisis.ultimoPedido.id, pedido.id);
  assert.equal(analisis.ausentes.length, 3);
  assert.match(mensaje(() => registrar(sinContacto, gestionVacia(), { accion: "pedido", ordenCompra: "", items: [{ sku: "DPS11255X", cantidad: 1, precioUnitario: 1 }, { sku: "DPS11255X", cantidad: 2, precioUnitario: 1 }] })), /repetido/);
});

test("un pedido complementario cuenta como la misma compra: lo que faltaba deja de estar ausente", () => {
  // El ultimo pedido (hace 6 dias) vino sin las dos eslingas; hoy las piden aparte.
  const faltantes = productosHabituales(brecha, HOY).ausentes;
  const gestion = registrar(brecha, gestionVacia(), { accion: "pedido", ordenCompra: "", items: faltantes.map((producto) => ({ sku: producto.sku, cantidad: producto.cantidadPromedio, precioUnitario: producto.ultimoPrecio })) });
  const analisis = productosHabituales(aplicarGestion(brecha, gestion), HOY);
  assert.equal(analisis.ausentes.length, 0);
  assert.equal(analisis.complementos.length, 1, "el pedido de hace 6 dias se suma a la ultima compra");
  assert.equal(analisis.pedidosAnalizados, 5, "los pedidos anteriores siguen siendo los mismos");
  assert.equal(analisis.habituales.length, 4);
});

test("los pedidos cancelados no cuentan como contacto ni como compra habitual", () => {
  const ficha = { ...sinContacto, pedidos: [...sinContacto.pedidos, { id: "x", numero: "PED-X", fecha: HOY, ordenCompra: "", estado: "CANCELADO", items: [] }] };
  assert.equal(ultimoContacto(ficha, HOY).dias, 20);
  assert.equal(productosHabituales(ficha, HOY).ultimoPedido.id, sinContacto.pedidos.at(-1).id);
  assert.deepEqual({ ...ultimoContacto({ partes: [], pedidos: [] }, HOY) }, { fecha: null, origen: null, dias: null });
  assert.equal(resumenUsuario({ ...sinContacto, partes: [], pedidos: [] }, HOY).requiereSeguimiento, true, "sin ningun contacto registrado tambien requiere seguimiento");
});

test("el perfil actualiza el contacto principal y el umbral de seguimiento", () => {
  const perfil = { actividad: "Minería de litio", vendedor: "Ana Ruiz", contacto: "Jorge Tolaba", email: "jorge@puna.example", telefono: "+54 388 400-1000", umbralSeguimientoDias: 30 };
  const ficha = aplicarGestion(sinContacto, registrar(sinContacto, gestionVacia(), { accion: "perfil", perfil }));
  assert.deepEqual([ficha.contacto, ficha.email, ficha.actividad], ["Jorge Tolaba", "jorge@puna.example", "Minería de litio"]);
  assert.deepEqual([ficha.contactos[0].nombre, ficha.contactos[0].rol, ficha.contactos[1].nombre], ["Jorge Tolaba", "COMPRAS", sinContacto.contactos[1].nombre]);
  assert.equal(resumenUsuario(ficha, HOY).requiereSeguimiento, false, "20 dias no supera el nuevo umbral de 30");
  assert.match(mensaje(() => validarCambioUsuario({ accion: "perfil", perfil: { ...perfil, umbralSeguimientoDias: 0 } })), /umbral/);
  assert.match(mensaje(() => validarCambioUsuario({ accion: "perfil", perfil: { ...perfil, email: "no-es-mail" } })), /email/);
});

// --- Pedidos pendientes y cartera -----------------------------------------------------------

test("pedidos pendientes: los que todavia no se entregaron, con su importe", () => {
  const honda = resumenes.get("HONDA");
  assert.equal(honda.pedidosPendientes, 2);
  const enCurso = cuenta("HONDA").pedidos.filter((pedido) => pedido.estado !== "ENTREGADO");
  assert.equal(honda.importePedidosPendientes, enCurso.reduce((total, pedido) => total + totalItems(pedido.items), 0));
  assert.equal(resumenes.get("TOYOTA").pedidosPendientes, 1);
  assert.equal(resumenes.get("ARCOR").pedidosPendientes, 0);
  // Un cancelado no queda pendiente.
  const cancelado = { ...cuenta("HONDA"), pedidos: cuenta("HONDA").pedidos.map((pedido) => (pedido.estado === "RECIBIDO" ? { ...pedido, estado: "CANCELADO" } : pedido)) };
  assert.equal(resumenUsuario(cancelado, HOY).pedidosPendientes, 1);
  // Uno cargado desde el CRM queda pendiente hasta que se entregue.
  const conNuevo = aplicarGestion(alDia, registrar(alDia, gestionVacia(), { accion: "pedido", ordenCompra: "", items: [{ sku: "172226X", cantidad: 24, precioUnitario: 11.6 }] }));
  assert.equal(resumenUsuario(conNuevo, HOY).pedidosPendientes, 1);
});

test("estado de cuenta en una palabra y filtros de la cartera", () => {
  assert.equal(estadoCuenta(resumenes.get("TOYOTA")), "VENCIDA");
  assert.equal(estadoCuenta(resumenes.get("EMOVA")), "SALDO", "factura todavia no vencida");
  assert.equal(estadoCuenta({ facturasVencidas: 0, creditoDisponible: -1, saldo: 10 }), "EXCEDIDA");
  assert.equal(estadoCuenta({ facturasVencidas: 0, creditoDisponible: 5, saldo: 0 }), "AL_DIA");
  const filtrar = (filtro) => cuentas.filter((item) => cumpleFiltro(filtro, resumenes.get(item.codigo))).map((item) => item.codigo).sort().join(",");
  assert.equal(filtrar("deuda"), "TOYOTA");
  assert.equal(filtrar("seguimiento"), "ROWING");
  assert.equal(filtrar("pedidos"), "HONDA,TECHINT,TERNIUM,TOYOTA");
  assert.equal(filtrar("cotizaciones"), "ARCOR,EMOVA,HONDA,ROWING,TECHINT,TERNIUM");
  assert.equal(filtrar("todos").split(",").length, 7);
});

test("la cartera ordena primero lo que hay que atender y suma los totales", () => {
  const orden = Array.from(ordenarCartera(cuentas, resumenes), (item) => item.codigo);
  assert.deepEqual(orden.slice(0, 2), ["TOYOTA", "ROWING"], "deuda vencida, despues seguimiento pendiente");
  assert.deepEqual(orden.slice(2), ["ARCOR", "EMOVA", "HONDA", "TECHINT", "TERNIUM"], "el resto por nombre");
  const totales = totalesCartera(cuentas, resumenes);
  const suma = (campo) => cuentas.reduce((total, item) => total + resumenes.get(item.codigo)[campo], 0);
  assert.equal(totales.cuentas, 7);
  assert.ok(Math.abs(totales.saldo - suma("saldo")) < 0.01);
  assert.ok(Math.abs(totales.deudaVencida - resumenes.get("TOYOTA").deudaVencida) < 0.01);
  assert.equal(totales.conDeudaVencida, 1);
  assert.equal(totales.pedidosPendientes, 5);
  assert.equal(totales.requierenSeguimiento, 1);
  assert.equal(totales.limiteCredito, cuentas.reduce((total, item) => total + item.limiteCredito, 0));
});

test("el buscador encuentra por nombre (sin tildes ni mayusculas), codigo o CUIT", () => {
  assert.ok(coincideBusqueda(cuenta("TOYOTA"), "toyo"));
  assert.ok(coincideBusqueda(cuenta("TERNIUM"), "TERN"));
  assert.ok(!coincideBusqueda(cuenta("HONDA"), "arcor"));
  assert.ok(coincideBusqueda({ ...cuenta("HONDA"), cuit: "30-12345678-9" }, "3012345"), "el CUIT con o sin guiones");
  assert.ok(coincideBusqueda(cuenta("EMOVA"), ""));
});

// --- Facturacion y fechas ------------------------------------------------------------------

test("la facturacion mensual cubre doce meses, termina en el mes en curso y suma las facturas", () => {
  const serie = facturacionMensual(alDia, HOY);
  assert.equal(serie.length, 12);
  assert.equal(serie.at(-1).mes, "2026-11");
  assert.equal(serie[0].mes, "2025-12");
  const enRango = alDia.facturas.filter((factura) => factura.fecha >= "2025-12-01" && factura.fecha <= HOY).reduce((total, factura) => total + factura.total, 0);
  assert.ok(Math.abs(serie.reduce((total, punto) => total + punto.total, 0) - enRango) < 0.01);
});

test("el dia se calcula en hora de Argentina y los dias corridos no dependen del horario", () => {
  assert.equal(hoyArgentina(new Date("2026-11-17T02:30:00Z")), "2026-11-16");
  assert.equal(hoyArgentina(new Date("2026-11-17T03:00:00Z")), "2026-11-17");
  assert.equal(diasEntre("2026-10-28", "2026-11-17"), 20);
});
