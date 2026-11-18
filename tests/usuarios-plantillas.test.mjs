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
  const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: cargar, Date, Intl, Map, Set }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { PLANTILLAS_USUARIOS } = cargar("@/lib/mailing/usuarios");
const { prepararMailUsuario, htmlMailUsuario, contactoMailUsuario } = cargar("@/lib/usuarios/plantillas");
const { clientesUsuariosDemo } = cargar("@/lib/usuarios/demo");
const { dineroUsuario, facturasConEstado, totalItems, fechaUsuario } = cargar("@/lib/usuarios/analisis");
const HOY = "2026-11-18";
const ficha = {
  ...clientesUsuariosDemo(HOY)[0],
  nombre: "Empresa & Compañía",
  contacto: "Ángela Pérez",
  email: "angela@empresa.example",
  cuit: "30-12345678-9",
  vendedor: "Ejecutiva comercial",
  direccionesEntrega: ["Planta industrial 123"],
};
const preparar = (tipo, cuenta = ficha, contexto = {}, plantilla = PLANTILLAS_USUARIOS[tipo]) =>
  prepararMailUsuario(tipo, plantilla, HOY, cuenta, contexto);

test("las nueve plantillas se pueden consultar sin elegir un cliente", () => {
  assert.equal(Object.keys(PLANTILLAS_USUARIOS).length, 9);
  for (const [tipo, plantilla] of Object.entries(PLANTILLAS_USUARIOS)) {
    const borrador = prepararMailUsuario(tipo, plantilla, HOY);
    assert.ok(borrador.asunto);
    assert.ok(borrador.texto.includes("Estimado/a [NOMBRE CONTACTO]:"));
    assert.ok(borrador.texto.includes("Industrias De Pascale"));
    assert.ok(!borrador.texto.includes("{{contacto}}"));
    assert.ok(!borrador.texto.includes(ficha.nombre));
  }
});

test("completa los datos de la cuenta elegida y respeta los cambios de la plantilla guardada", () => {
  const tipo = "usuario_nueva_linea";
  const plantilla = { ...PLANTILLAS_USUARIOS[tipo], asunto: "Novedades para {{ nombre }}", cuerpo: "<p>{{contacto}} – {{codigo_cliente}} – {{vendedor}} – {{cuit}} – {{email}}</p>" };
  const borrador = preparar(tipo, ficha, {}, plantilla);
  assert.equal(borrador.asunto, `Novedades para ${ficha.nombre}`);
  for (const valor of [ficha.contacto, ficha.codigo, ficha.vendedor, ficha.cuit, ficha.email]) assert.ok(borrador.texto.includes(valor));
  const otra = preparar(tipo, { ...ficha, nombre: "Otra cuenta", contacto: "Otro contacto" }, {}, plantilla);
  assert.ok(otra.asunto.includes("Otra cuenta"));
  assert.ok(!otra.texto.includes(ficha.contacto));
  assert.equal(plantilla.asunto, "Novedades para {{ nombre }}");
});

test("usa el contacto de Compras o Pagos y permite cuentas sin email", () => {
  const cuenta = { ...ficha, contactos: [
    { id: "c", rol: "COMPRAS", nombre: "Compradora", email: "compras@empresa.example", telefono: "" },
    { id: "p", rol: "PAGOS", nombre: "Responsable de pagos", email: "pagos@empresa.example", telefono: "" },
  ] };
  assert.equal(contactoMailUsuario(cuenta, "usuario_respuesta_cotizacion").email, "compras@empresa.example");
  assert.equal(contactoMailUsuario(cuenta, "usuario_cobranza").email, "pagos@empresa.example");
  assert.ok(preparar("usuario_cobranza", cuenta).texto.includes("Estimado/a Responsable de pagos:"));
  const vacia = { ...ficha, contacto: "", email: "", contactos: [] };
  assert.ok(preparar("usuario_estado_pedido", vacia).texto.includes(`Estimado/a ${ficha.nombre}:`));
  assert.equal(contactoMailUsuario(vacia, "usuario_estado_pedido").email, "");
});

test("la cotización elegida lleva todos sus productos, cantidades, precios, moneda y total", () => {
  const cotizacion = { ...ficha.cotizaciones[0], numero: "COT-ELEGIDA", validez: "2026-12-18", items: [
    { sku: "SKU-UNO", descripcion: "Guante & protección", linea: "DPS", cantidad: 12, precioUnitario: 10.5 },
    { sku: "SKU-DOS", descripcion: "Eslinga reforzada", linea: "NUBUS", cantidad: 3, precioUnitario: 20 },
  ] };
  for (const moneda of ["USD", "ARS"]) {
    const cuenta = { ...ficha, moneda };
    const borrador = preparar("usuario_respuesta_cotizacion", cuenta, { cotizacion });
    assert.ok(borrador.asunto.includes(cotizacion.numero));
    assert.ok(borrador.texto.includes(fechaUsuario(cotizacion.validez)));
    for (const item of cotizacion.items) {
      assert.ok(borrador.texto.includes(item.sku));
      assert.ok(borrador.texto.includes(item.descripcion));
      assert.ok(borrador.texto.includes(`Cantidad: ${item.cantidad}`));
      assert.ok(borrador.texto.includes(dineroUsuario(item.precioUnitario, moneda)));
    }
    assert.ok(borrador.texto.includes(`Moneda: ${moneda}`));
    assert.ok(borrador.texto.includes(`Total: ${dineroUsuario(totalItems(cotizacion.items), moneda)} + IVA`));
    assert.ok(!borrador.texto.includes("[CANTIDAD]"));
    assert.ok(!borrador.texto.includes("[PRECIO]"));
    assert.ok(!borrador.texto.includes("[FECHA DE VALIDEZ]"));
  }
});

test("el correo al finalizar un pedido usa sus productos y su OC, sin tomar otra cotización", () => {
  const pedido = { ...ficha.pedidos[0], numero: "PED-NUEVO", ordenCompra: "OC-987", items: [
    { sku: "SKU-NUEVO", descripcion: "Producto del pedido nuevo", linea: "DP", cantidad: 2, precioUnitario: 31 },
  ] };
  const borrador = preparar("usuario_respuesta_cotizacion", ficha, { pedido });
  for (const valor of [ficha.nombre, ficha.codigo, ficha.cuit, pedido.numero, pedido.ordenCompra, "SKU-NUEVO", "Cantidad: 2"]) assert.ok(borrador.texto.includes(valor), valor);
  assert.ok(!borrador.asunto.includes("[N° COTIZACIÓN]"));
  assert.ok(!borrador.texto.includes("[FECHA DE VALIDEZ]"));
  for (const cotizacion of ficha.cotizaciones) assert.ok(!borrador.texto.includes(cotizacion.numero));
});

test("las plantillas personalizadas conservan su mensaje y agregan los artículos del documento", () => {
  const pedido = ficha.pedidos[0];
  const plantilla = { ...PLANTILLAS_USUARIOS.usuario_respuesta_cotizacion, cuerpo: "<p>Hola {{contacto}}, esta es nuestra propuesta comercial.</p>" };
  const borrador = preparar("usuario_respuesta_cotizacion", ficha, { pedido }, plantilla);
  assert.ok(borrador.texto.includes("esta es nuestra propuesta comercial"));
  for (const item of pedido.items) assert.ok(borrador.texto.includes(item.sku));
});

test("el estado del pedido no confunde la fecha de ingreso con una fecha de entrega desconocida", () => {
  const pedido = { ...ficha.pedidos[0], fecha: "2026-11-01", estado: "DESPACHADO", ordenCompra: "OC-123" };
  const borrador = preparar("usuario_estado_pedido", ficha, { pedido });
  assert.ok(borrador.texto.includes(`ingresado el ${fechaUsuario(pedido.fecha)}`));
  assert.ok(borrador.texto.includes("Estado actual: Despachado"));
  assert.ok(borrador.texto.includes("Fecha estimada de entrega: [FECHA]"));
  assert.ok(borrador.texto.includes("[EMPRESA DE TRANSPORTE]"));
});

test("la cobranza incluye saldos después de los pagos parciales y no inventa datos bancarios", () => {
  const pendientes = facturasConEstado(ficha, HOY).filter((item) => item.saldo > 0);
  const borrador = preparar("usuario_cobranza");
  for (const item of pendientes) {
    assert.ok(borrador.texto.includes(item.numero));
    assert.ok(borrador.texto.includes(dineroUsuario(item.saldo, ficha.moneda)));
  }
  assert.ok(borrador.texto.includes("[BANCO]"));
  assert.ok(borrador.texto.includes("CUIT: [CUIT]"), "el CUIT del emisor no se reemplaza con el del cliente");
  const sinDeuda = preparar("usuario_cobranza", { ...ficha, facturas: [], pagos: [], notasCredito: [] });
  assert.ok(sinDeuda.texto.includes("No registra facturas pendientes"));
  assert.ok(!sinDeuda.texto.includes("[N° FACTURA]"));
});

test("la factura toma la OC de su pedido asociado", () => {
  const pedido = { ...ficha.pedidos[0], ordenCompra: "OC-DE-LA-FACTURA" };
  const factura = { ...ficha.facturas[0], pedidoId: pedido.id };
  const borrador = preparar("usuario_factura", { ...ficha, pedidos: [pedido] }, { factura });
  assert.ok(borrador.asunto.includes(factura.numero));
  assert.ok(borrador.asunto.includes(pedido.ordenCompra));
  assert.ok(borrador.texto.includes(fechaUsuario(factura.vencimiento)));
  assert.ok(borrador.texto.includes(dineroUsuario(factura.total, ficha.moneda)));
});

test("los datos se conservan como texto y se escapan al generar el HTML para copiar", () => {
  const contacto = '<img src=x onerror="alert(1)"> {{nombre}} & Ángela';
  const borrador = preparar("usuario_nueva_linea", { ...ficha, contacto });
  assert.ok(borrador.texto.includes(contacto));
  const html = htmlMailUsuario(borrador.texto);
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp; Ángela"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("{{nombre}}"), "no se reemplazan variables dentro de datos del cliente");
});
