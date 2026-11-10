import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function entorno() {
  const env = { SEGUIMIENTO_BACKEND: "sheets", SEGUIMIENTO_SHEETS_ID: "planilla-nueva" };
  const colecciones = new Map([
    ["seguimiento-cambios", { consulta: { respondida: true, observaciones: "Prueba anterior" } }],
    ["seguimiento-historial", { consulta: [{ id: "viejo", cliente: "100 - Cliente", tipo: "finalizada" }] }],
  ]);
  const mocks = {
    "server-only": {},
    // React.cache memoriza por pedido; fuera de React se usa la funcion tal cual.
    react: { cache: (funcion) => funcion },
    "next/server": { after: () => {} },
    "@/lib/db/seguimiento": { backendSeguimiento: () => env.SEGUIMIENTO_BACKEND },
    "@/lib/db/repositorio": { backendActivo: () => env.SEGUIMIENTO_BACKEND },
    "@/lib/db/postgres/pg": { postgresConfigurado: () => false },
    "@/lib/db/adjuntos": {},
    "@/lib/db/demo/reclamos": {},
    "@/lib/db/local/almacen": {
      leer: async (nombre) => structuredClone(colecciones.get(nombre) ?? {}),
      modificar: async (nombre, cambio) => {
        const datos = structuredClone(colecciones.get(nombre) ?? {});
        const resultado = cambio(datos);
        colecciones.set(nombre, datos);
        return resultado;
      },
    },
  };
  const cache = new Map();
  function cargar(nombre) {
    if (mocks[nombre]) return mocks[nombre];
    if (cache.has(nombre)) return cache.get(nombre);
    const archivo = nombre.replace("@/", "src/") + ".ts";
    const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const modulo = { exports: {} };
    cache.set(nombre, modulo.exports);
    vm.runInNewContext(codigo, {
      module: modulo, exports: modulo.exports, require: cargar,
      process: { env }, Date, Map, Set, crypto: globalThis.crypto,
    }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  return { env, colecciones, cargar };
}

test("la nueva planilla comienza sin cierres ni notas heredados de la prueba", async () => {
  const { cargar, colecciones } = entorno();
  const cambios = cargar("@/lib/db/sheets/cambios-locales");
  const historial = cargar("@/lib/db/historial");
  assert.equal(Object.keys(await cambios.leerCambios()).length, 0);
  assert.equal(Object.keys(await historial.porConsulta()).length, 0);
  assert.equal(Object.keys(await historial.ultimasGestiones()).length, 0);
  await cambios.guardarCambio("consulta", { respondida: false, observaciones: "Gestion nueva" });
  assert.equal((await cambios.leerCambios()).consulta.observaciones, "Gestion nueva");
  assert.equal(colecciones.get("seguimiento-cambios").consulta.observaciones, "Prueba anterior");
});

test("un mismo mensaje mantiene cambios, historial e indicaciones independientes por planilla", async () => {
  const { env, cargar } = entorno();
  const cambios = cargar("@/lib/db/sheets/cambios-locales");
  const historial = cargar("@/lib/db/historial");
  const { idWhatsapp } = cargar("@/lib/db/reclamos");
  const idNuevo = idWhatsapp("consulta");
  await cambios.guardarCambio("consulta", { respondida: true });
  await historial.registrar({
    consultaId: "consulta", cliente: "100 - Cliente", tipo: "finalizada", hito: "Pedido nuevo",
    resultado: "Resuelto", relacion: "BUENA", observacion: "Gestion nueva",
  });
  assert.equal((await historial.porCliente("100 - Cliente")).length, 1);
  assert.ok((await historial.ultimasGestiones())["100"]);
  env.SEGUIMIENTO_SHEETS_ID = "planilla-de-prueba";
  assert.notEqual(idWhatsapp("consulta"), idNuevo);
  assert.equal(Object.keys(await cambios.leerCambios()).length, 0);
  assert.equal((await historial.porCliente("100 - Cliente")).length, 0);
  env.SEGUIMIENTO_SHEETS_ID = "planilla-nueva";
  assert.equal((await cambios.leerCambios()).consulta.respondida, true);
  assert.equal((await historial.porCliente("100 - Cliente")).length, 1);
  assert.equal(idWhatsapp("consulta"), idNuevo);
});

test("los datos de demo quedan separados y Postgres conserva sus claves actuales", () => {
  const { env, cargar } = entorno();
  const { clavePorOrigen } = cargar("@/lib/seguimiento/origen");
  const { idWhatsapp } = cargar("@/lib/db/reclamos");
  const planilla = clavePorOrigen("seguimiento-historial");
  env.SEGUIMIENTO_BACKEND = "demo";
  assert.notEqual(clavePorOrigen("seguimiento-historial"), planilla);
  assert.equal(idWhatsapp("consulta"), "wa-consulta-demo");
  env.SEGUIMIENTO_BACKEND = "postgres";
  assert.equal(clavePorOrigen("seguimiento-historial"), "seguimiento-historial");
  assert.equal(idWhatsapp("consulta"), "wa-consulta");
});
