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
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: cargar, Date, Intl, Map, Set }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { clientesUsuariosDemo } = cargar("@/lib/usuarios/demo");
const { aplicarGestion, gestionVacia, registrarGestionUsuario } = cargar("@/lib/usuarios/gestion");
const { validarCambioUsuario } = cargar("@/lib/usuarios/validacion");
const { simularFichaUsuario } = cargar("@/lib/usuarios/simulacion");
const { estadoFactura, resumenUsuario, rankingProductos, rankingLineas, serieMensual, hoyArgentina, historialUsuario } = cargar("@/lib/usuarios/analisis");
const HOY = "2026-11-11";
const base = clientesUsuariosDemo(HOY)[0];
const registrar = (gestion, cambio, id) => registrarGestionUsuario(base, gestion, validarCambioUsuario(cambio), "Vendedora de prueba", `2026-11-11T15:00:${id.padStart(2, "0")}Z`, id);

test("la relación y las próximas acciones se guardan con historia sin modificar operaciones comerciales", () => {
  const antes = JSON.stringify(base);
  let gestion = registrar(gestionVacia(), { accion: "observacion", texto: "Compras pide mejorar el plazo de entrega", relacion: "EN_RIESGO", proximoContacto: "2026-11-12", proximaAccion: "Llamar con una alternativa de entrega" }, "1");
  gestion = registrar(gestion, { accion: "observacion", texto: "Confirmamos una nueva fecha y el cliente quedó conforme", relacion: "BUENA", proximoContacto: "", proximaAccion: "" }, "2");
  const ficha = aplicarGestion(base, JSON.parse(JSON.stringify(gestion)));
  const resumen = resumenUsuario(ficha, HOY);
  assert.equal(resumen.relacion, "BUENA");
  assert.equal(resumen.observacion.proximoContacto, "");
  assert.ok(ficha.observaciones.some((o) => o.relacion === "EN_RIESGO" && o.texto.includes("plazo de entrega")));
  assert.equal(ficha.observaciones[0].autor, "Vendedora de prueba");
  assert.equal(JSON.stringify(base), antes);
  assert.ok(historialUsuario(ficha).some((e) => e.titulo === "Relación: En riesgo"));
});

test("las cotizaciones no ganadas exigen el motivo del cliente y conservan los cambios anteriores", () => {
  assert.throws(() => validarCambioUsuario({ accion: "cotizacion", cotizacionId: "cot-negociacion", estado: "NO_GANADA", motivoNoGanada: "   " }), /motivo/);
  let gestion = registrar(gestionVacia(), { accion: "cotizacion", cotizacionId: "cot-negociacion", estado: "NO_GANADA", motivoNoGanada: "El cliente eligió otro proveedor por plazo" }, "3");
  assert.equal(aplicarGestion(base, gestion).cotizaciones.find((c) => c.id === "cot-negociacion").motivoNoGanada, "El cliente eligió otro proveedor por plazo");
  gestion = registrar(gestion, { accion: "cotizacion", cotizacionId: "cot-negociacion", estado: "GANADA", motivoNoGanada: "" }, "4");
  const cotizacion = aplicarGestion(base, gestion).cotizaciones.find((c) => c.id === "cot-negociacion");
  assert.equal(cotizacion.estado, "GANADA");
  assert.equal(cotizacion.motivoNoGanada, "");
  assert.ok(gestion.eventos.some((e) => e.detalle.includes("El cliente eligió otro proveedor por plazo")));
  assert.throws(() => registrar(gestion, { accion: "cotizacion", cotizacionId: "de-otro-cliente", estado: "GANADA", motivoNoGanada: "" }, "5"), /no pertenece/);
});

test("las cobranzas conservan todos los comentarios por factura y no cambian importes o saldos", () => {
  const factura = base.facturas.find((f) => f.saldo > 0 && f.vencimiento < HOY);
  const pagada = base.facturas.find((f) => f.saldo === 0);
  let gestion = registrar(gestionVacia(), { accion: "cobranza", facturaId: factura.id, comentario: "Falta el remito conformado", fechaPrometida: "" }, "6");
  gestion = registrar(gestion, { accion: "cobranza", facturaId: factura.id, comentario: "Recibieron el remito; prometieron pagar ayer", fechaPrometida: "2026-11-10" }, "7");
  const ficha = aplicarGestion(base, JSON.parse(JSON.stringify(gestion)));
  assert.equal(ficha.cobranzas[factura.id][0].comentario, "Recibieron el remito; prometieron pagar ayer");
  assert.equal(ficha.cobranzas[factura.id][1].comentario, "Falta el remito conformado");
  assert.equal(JSON.stringify(ficha.facturas), JSON.stringify(base.facturas));
  assert.ok(resumenUsuario(ficha, HOY).promesasIncumplidas.some((f) => f.id === factura.id));
  assert.throws(() => registrar(gestion, { accion: "cobranza", facturaId: pagada.id, comentario: "Prueba", fechaPrometida: "" }, "8"), /saldo pendiente/);
  assert.throws(() => registrar(gestion, { accion: "cobranza", facturaId: "otra-factura", comentario: "Prueba", fechaPrometida: "" }, "9"), /no pertenece/);
  assert.equal(aplicarGestion(clientesUsuariosDemo(HOY)[1], gestionVacia()).cobranzas[factura.id]?.some((n) => n.comentario === "Falta el remito conformado") ?? false, false);
});

test("se distinguen vencimiento de hoy, pagos parciales y saldos ya pagados", () => {
  assert.equal(estadoFactura({ saldo: 10, vencimiento: HOY }, HOY), "Pendiente");
  assert.equal(estadoFactura({ saldo: 10, vencimiento: "2026-11-10" }, HOY), "Vencida");
  assert.equal(estadoFactura({ saldo: 0, vencimiento: "2025-01-01" }, HOY), "Pagada");
  const ficha = { ...base, limiteCredito: 100, facturas: [{ id: "1", fecha: "2026-01-01", importe: 1000, saldo: 20, vencimiento: "2026-01-30" }, { id: "2", fecha: HOY, importe: 500, saldo: 15, vencimiento: HOY }] };
  const r = resumenUsuario(ficha, HOY);
  assert.equal(r.saldo, 35);
  assert.equal(r.vencido, 20);
  assert.equal(r.creditoDisponible, 65);
  assert.equal(r.totalFacturado, 1500);
});

test("consumos y series excluyen cancelados, futuros y entregas pendientes del ranking", () => {
  const productos = [{ codigo: "G1", descripcion: "Guante", linea: "DPS", cantidad: 10, precioUnitario: 1.15 }];
  const ficha = { ...base, pedidos: [
    { id: "1", fecha: "2026-01-01", estado: "ENTREGADO", productos },
    { id: "2", fecha: "2026-01-02", estado: "CANCELADO", productos },
    { id: "3", fecha: "2026-02-01", estado: "EN_PREPARACION", productos },
    { id: "4", fecha: "2026-12-01", estado: "ENTREGADO", productos },
  ] };
  assert.equal(rankingProductos(ficha, 2026, HOY)[0].cantidad, 10);
  assert.equal(rankingLineas(ficha, 2026, HOY)[0].importe, 11.5);
  const serie = serieMensual(ficha, 2026, "pedidos", HOY);
  assert.equal(serie[0], 11.5);
  assert.equal(serie[1], 11.5);
  assert.equal(serie[11], 0);
  assert.equal(resumenUsuario(ficha, HOY).totalPedidos, 23);
});

test("la variación interanual compara el mismo período y el día se calcula en Argentina", () => {
  const ficha = { ...base, facturas: [
    { id: "1", fecha: "2026-01-01", importe: 200, saldo: 0, vencimiento: HOY },
    { id: "2", fecha: "2025-01-01", importe: 100, saldo: 0, vencimiento: HOY },
    { id: "3", fecha: "2025-12-01", importe: 900, saldo: 0, vencimiento: HOY },
  ] };
  assert.equal(resumenUsuario(ficha, HOY).variacion, 100);
  assert.equal(hoyArgentina(new Date("2026-11-12T01:00:00Z")), "2026-11-11");
});

test("la validación rechaza fechas imposibles, evaluaciones inválidas y autores enviados desde el cliente", () => {
  const cambio = { accion: "observacion", texto: "Seguimiento", relacion: "BUENA", proximoContacto: "2026-11-12", proximaAccion: "Llamar" };
  assert.throws(() => validarCambioUsuario({ ...cambio, proximoContacto: "2026-02-30" }), /fecha/);
  assert.throws(() => validarCambioUsuario({ ...cambio, relacion: "OTRA" }));
  assert.throws(() => validarCambioUsuario({ ...cambio, proximaAccion: "" }), /fecha y la acción/);
  assert.throws(() => validarCambioUsuario({ ...cambio, autor: "Suplantado" }));
});

test("la simulación conserva la identidad y los productos existentes, sin modificar la ficha ni duplicar escenarios", () => {
  const original = JSON.stringify(base);
  const simulada = simularFichaUsuario(base, HOY);
  assert.equal(JSON.stringify(base), original);
  for (const clave of ["codigo", "nombre", "actividad", "vendedor", "moneda", "contacto"]) assert.equal(simulada[clave], base[clave]);
  const codigos = new Set(base.pedidos[0].productos.map((p) => p.codigo));
  assert.ok(simulada.pedidos.filter((p) => p.id.startsWith("sim-")).every((p) => p.productos.every((articulo) => codigos.has(articulo.codigo))));
  assert.equal(new Set(simulada.pedidos.map((p) => p.estado)).size, 5);
  assert.equal(new Set(simulada.cotizaciones.map((c) => c.estado)).size, 5);
  assert.ok(simulada.cotizaciones.filter((c) => c.estado === "NO_GANADA").every((c) => c.motivoNoGanada.length > 0));
  assert.equal(JSON.stringify(simularFichaUsuario(simulada, HOY)), JSON.stringify(simulada));
});

test("las facturas simuladas concuerdan con sus pedidos y los cambios de prueba no afectan la gestión guardada", () => {
  const simulada = simularFichaUsuario(base, HOY);
  for (const factura of simulada.facturas.filter((f) => f.id.startsWith("sim-"))) {
    const pedido = simulada.pedidos.find((p) => p.id === factura.pedidoId);
    assert.ok(pedido);
    const importe = Math.round(pedido.productos.reduce((s, p) => s + p.cantidad * p.precioUnitario, 0) * 100) / 100;
    assert.equal(factura.importe, importe);
    assert.ok(factura.saldo >= 0 && factura.saldo <= factura.importe);
  }
  const resumen = resumenUsuario(simulada, HOY);
  assert.ok(resumen.promesasIncumplidas.some((f) => f.id.startsWith("sim-")));
  const factura = simulada.facturas.find((f) => f.id.includes("sim-") && f.saldo > 0);
  const gestion = registrarGestionUsuario(simulada, gestionVacia(), { accion: "cobranza", facturaId: factura.id, comentario: "Gestión de prueba local", fechaPrometida: "2026-11-15" }, "Simulación", "2026-11-11T18:00:00Z", "nota-local");
  assert.ok(aplicarGestion(simulada, gestion).cobranzas[factura.id].some((n) => n.comentario === "Gestión de prueba local"));
  assert.ok(!JSON.stringify(base).includes("Gestión de prueba local"));
  assert.ok(!JSON.stringify(simulada).includes("Gestión de prueba local"));
});

test("una cuenta sin operaciones también puede simular todos los casos con el catálogo ya existente", () => {
  const vacia = { ...base, pedidos: [], cotizaciones: [], facturas: [], observaciones: [], cobranzas: {}, eventos: [] };
  const simulada = simularFichaUsuario(vacia, HOY);
  assert.equal(new Set(simulada.pedidos.map((p) => p.estado)).size, 5);
  assert.equal(new Set(simulada.cotizaciones.map((c) => c.estado)).size, 5);
  assert.equal(new Set(simulada.facturas.map((f) => estadoFactura(f, HOY))).size, 3);
  assert.ok(simulada.facturas.every((f) => f.importe > 0));
  assert.equal(new Set(clientesUsuariosDemo(HOY).map((f) => resumenUsuario(simularFichaUsuario(f, HOY), HOY).relacion)).size, 3);
});
