import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const cache = new Map();
function cargar(nombre) {
  if (cache.has(nombre)) return cache.get(nombre);
  const archivo = nombre.replace("@/", "src/") + ".ts";
  const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports, require: cargar, Date, Intl, TextEncoder, btoa,
  }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { TIPOS_MAIL_USUARIOS, tiposDe, esTipoMail } = cargar("@/types/mailing");
const { PLANTILLAS_BASE, armarMail, cuerpoMailTexto, variablesDesconocidas } = cargar("@/lib/mailing/plantillas");
const { destinatariosPara, filtrar, filtrosIniciales } = cargar("@/lib/mailing/filtros");
const { clientesDemo } = cargar("@/lib/mailing/clientes-demo");
const { crearBorradorEml, pendientesDelMail } = cargar("@/lib/mailing/borrador-usuario");
const AHORA = Date.parse("2026-11-11T15:00:00Z");
const clientes = clientesDemo(AHORA);
const usuario = clientes.find((cliente) => cliente.tipoCliente === "USUARIO");
const extras = { linkPlataforma: "https://portal.example" };

test("las nueve plantillas están disponibles, con saludo formal y variables reconocidas", () => {
  assert.equal(tiposDe("usuarios").length, 9);
  for (const tipo of Object.keys(TIPOS_MAIL_USUARIOS)) {
    assert.ok(esTipoMail(tipo));
    const plantilla = PLANTILLAS_BASE[tipo];
    assert.ok(plantilla.cuerpo.includes("Estimado/a {{contacto}}:"), tipo);
    assert.equal(variablesDesconocidas(plantilla, tipo).length, 0, tipo);
    assert.ok(!plantilla.cuerpo.includes("[NOMBRE CONTACTO]"), tipo);
    assert.ok(!plantilla.cuerpo.includes("Asunto:"), tipo);
    assert.ok(!/-{3,}/.test(plantilla.cuerpo), tipo);
    assert.equal(plantilla.pie, "Industrias De Pascale · Protección Industrial");
    assert.ok(pendientesDelMail(plantilla.asunto, plantilla.cuerpo).length > 0, tipo);
  }
  assert.ok(PLANTILLAS_BASE.usuario_reclamo_calidad.cuerpo.includes("discontinuar el uso"));
  assert.ok(PLANTILLAS_BASE.usuario_cobranza.cuerpo.includes("Si el pago ya fue realizado"));
  assert.ok(PLANTILLAS_BASE.usuario_factura.cuerpo.includes("certificados de retención"));
  assert.ok(!PLANTILLAS_BASE.usuario_nueva_linea.cuerpo.includes("pedir a Marketing"));
});

test("USUARIOS usa la marca explícita, sin incluir otros clientes A ni solicitudes de alta", () => {
  const generalA = clientes.find((cliente) => cliente.tipoCliente === "GENERAL" && cliente.clasificacion === "A");
  const alta = { ...usuario, id: "alta", origen: "alta", estadoAlta: "APROBADO" };
  const universo = [...clientes, alta];
  for (const tipo of tiposDe("usuarios")) {
    const elegibles = destinatariosPara(tipo, universo, [alta]);
    assert.ok(elegibles.length > 0);
    assert.ok(elegibles.every((cliente) => cliente.tipoCliente === "USUARIO" && cliente.origen === "cliente"));
    assert.ok(!elegibles.includes(generalA));
    assert.ok(!elegibles.includes(alta));
    const filtrados = filtrar(elegibles, filtrosIniciales(tipo), AHORA);
    assert.ok(filtrados.every((cliente) => cliente.tipoCliente === "USUARIO"));
  }
  assert.equal(destinatariosPara("alta_aprobada", clientes, [alta])[0].id, "alta");
  assert.equal(destinatariosPara("promocional", clientes, [alta]).length, clientes.length);
});

test("personaliza el contacto y la empresa sin inventar datos de documentos ni interpretar HTML", () => {
  const cliente = { ...usuario, nombre: "Empresa & Compañía", contacto: '<img src=x onerror="alert(1)"> Ángela' };
  const plantilla = PLANTILLAS_BASE.usuario_nueva_linea;
  const mail = armarMail(plantilla, cliente, extras);
  assert.ok(mail.html.includes("Empresa &amp; Compañía"));
  assert.ok(mail.html.includes("&lt;img"));
  assert.ok(!mail.html.includes('<img src=x'));
  assert.ok(mail.asunto.includes("[NOMBRE LÍNEA / PRODUCTO]"));
  const texto = cuerpoMailTexto(plantilla, cliente, extras);
  assert.ok(texto.includes(cliente.nombre));
  assert.ok(texto.includes(cliente.contacto));
  assert.ok(!texto.includes("{{contacto}}"));
  assert.ok(!texto.includes("{{nombre}}"));
  const cobranza = armarMail(PLANTILLAS_BASE.usuario_cobranza, cliente, extras);
  assert.ok(cobranza.asunto.includes(cliente.nombre));
  assert.ok(!cobranza.asunto.includes("RAZÓN SOCIAL DEL CLIENTE"));
});

test("detecta datos sin completar y bloques opcionales para impedir borradores incompletos", () => {
  assert.deepEqual([...pendientesDelMail("OC [N° OC]", "[N° OC] [OPCIONAL] {{desconocida}}")], ["[N° OC]", "[OPCIONAL]", "{{desconocida}}"]);
  assert.equal(pendientesDelMail("Cotización N° 123", "Estimado/a Ángela:\nAdjuntamos la cotización.").length, 0);
});

test("el .eml conserva destinatario, asunto UTF-8, texto y HTML, y no permite inyectar encabezados", () => {
  const asunto = "Cotización y protección – Compañía Álvarez ".repeat(4);
  const texto = "Estimado/a Ángela:\n\nImporte: $ 1.234 + IVA.\nMuchas gracias.";
  const html = `<p>${texto}</p>`;
  const eml = crearBorradorEml("compras@empresa.example", asunto, texto, html);
  assert.ok(eml.startsWith("X-Unsent: 1\r\nTo: compras@empresa.example\r\n"));
  const asuntoEncabezado = eml.match(/Subject: ([\s\S]*?)\r\nMIME-Version/)[1];
  const palabras = [...asuntoEncabezado.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  assert.ok(palabras.every((palabra) => palabra[0].length <= 75));
  assert.equal(palabras.map((palabra) => Buffer.from(palabra[1], "base64").toString("utf8")).join(""), asunto);
  // Cada alternativa lleva el mismo contenido en su formato correspondiente.
  const partes = eml.split("--depascale-mail-usuario").slice(1, 3);
  assert.equal(Buffer.from(partes[0].split("\r\n\r\n")[1].trim(), "base64").toString("utf8"), texto);
  assert.equal(Buffer.from(partes[1].split("\r\n\r\n")[1].trim(), "base64").toString("utf8"), html);
  assert.throws(() => crearBorradorEml("compras@empresa.example\r\nBcc:otro@example.com", asunto, texto, html));
  const inyectado = crearBorradorEml("compras@empresa.example", "Hola\r\nBcc:otro@example.com", texto, html);
  assert.ok(!inyectado.includes("\r\nBcc:"));
});
