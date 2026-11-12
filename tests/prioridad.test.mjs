import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Carga los modulos de src/ transpilados, sin Next ni React. */
function cargar(nombre, cache = new Map()) {
  const mocks = { "server-only": {}, react: { cache: (funcion) => funcion } };
  if (mocks[nombre]) return mocks[nombre];
  if (cache.has(nombre)) return cache.get(nombre);
  const archivo = nombre.replace("@/", "src/") + ".ts";
  const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  cache.set(nombre, modulo.exports);
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: (otro) => cargar(otro, cache), Date, Map, Set, console }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { ordenar } = cargar("@/lib/seguimiento/presentacion");
const AHORA = new Date("2026-11-12T15:00:00Z");

function consulta(id, hito, clasificacion, diasAtras = 1, extra = {}) {
  return {
    id, cliente: `${id} - Cliente`, grupoWhatsapp: id, consulta: "Hola", hito, clasificacion,
    respondida: false, fecha: new Date(AHORA.getTime() - diasAtras * 86_400_000), dias: null, ...extra,
  };
}

test("orden por prioridad: reclamos, clientes A/B, hito y al final consulta general y stock", () => {
  const consultas = [
    consulta("stock-C", "Consulta de stock", "C"),
    consulta("general-C", "Consulta General", "C"),
    consulta("tecnica-C", "Consulta Tecnica", "C"),
    consulta("pago-C", "Informa pago", "C"),
    consulta("web-C", "Acceso web", "C"),
    consulta("precio-C", "Consulta precio", "C"),
    consulta("factura-C", "Enviar Factura", "C"),
    consulta("nuevo-C", "Pedido nuevo", "C"),
    consulta("estado-C", "Estado de pedido", "C"),
    consulta("general-B", "Consulta General", "B"),
    consulta("nuevo-B", "Pedido nuevo", "B"),
    consulta("nuevo-A", "Pedido nuevo", "A"),
    consulta("reclamo-C", "Reclamo", "C"),
    consulta("reclamo-A", "Reclamo", "A"),
    consulta("respondida-A", "Reclamo", "A", 9, { respondida: true }),
  ];
  const orden = Array.from(ordenar(consultas, "prioridad", AHORA), (item) => item.id);
  assert.deepEqual(orden, [
    "reclamo-A",
    "reclamo-C",
    "nuevo-A",
    "nuevo-B",
    "general-B",
    "estado-C",
    "nuevo-C",
    "factura-C",
    "precio-C",
    "web-C",
    "pago-C",
    "tecnica-C",
    "general-C",
    "stock-C",
    "respondida-A",
  ]);
});

test("a igual prioridad, primero la que espera hace mas tiempo", () => {
  const orden = ordenar(
    [consulta("nueva", "Pedido nuevo", "C", 1), consulta("vieja", "Pedido nuevo", "C", 6)],
    "prioridad",
    AHORA,
  );
  assert.deepEqual(Array.from(orden, (item) => item.id), ["vieja", "nueva"]);
});
