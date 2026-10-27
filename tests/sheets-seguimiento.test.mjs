import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Ejecuta el adaptador real con Sheets y las escrituras sustituidos por fuentes controladas.
function adaptador(filas, errorLectura) {
  const escrituras = [];
  const cache = new Map();
  class ErrorSheets extends Error {}
  const mocks = {
    "server-only": {},
    "@/lib/db/sheets/cliente": {
      ErrorSheets,
      leerRango: async () => {
        if (errorLectura) throw errorLectura;
        return filas;
      },
      escribirRangos: async (rangos) => escrituras.push(...rangos),
      letraColumna: (indice) => String.fromCharCode(65 + indice),
    },
    "@/lib/db/sheets/cambios-locales": { leerCambios: async () => ({}), guardarCambio: async () => {} },
    "@/lib/db/sheets/maestros": { armarFichas: () => new Map(), armarCatalogo: () => [], claveCliente: (cliente) => cliente },
  };
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
      process: { env: { SEGUIMIENTO_SHEETS_ID: "prueba", SEGUIMIENTO_HOJA: "Seguimiento" } },
      console, globalThis: {}, Date, Map, Set,
    }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  // La descarga publica no participa en estas pruebas de mapeo.
  mocks["@/lib/db/sheets/publica"] = {};
  return { repo: cargar("@/lib/db/sheets/seguimiento"), escrituras };
}

test("integra el encabezado grillo, fechas mixtas y casillas de la planilla modificada", async () => {
  const { repo } = adaptador([
    ["Fecha de consulta", "Columna 2", "Encargado", "grillo", "Clasificacion Venta", "Consulta", "RESPUESTA", "OBSERVACIÓN"],
    ["9/25/2026", "", "bot", "100 - Cliente de prueba", "C", "Consulta de stock", "TRUE", "Nota"],
    ["46255", "", "", "101 - Otro cliente", "B", "Pedido", "FALSE"],
  ]);
  const consultas = await repo.getAll();
  assert.equal(consultas.length, 2);
  assert.equal(consultas[0].cliente, "100 - Cliente de prueba");
  assert.equal(consultas[0].clasificacion, "C");
  assert.equal(consultas[0].respondida, true);
  assert.equal(consultas[0].observaciones, "Nota");
  assert.equal(consultas[0].fecha.toISOString(), "2026-09-25T03:00:00.000Z");
  assert.equal(consultas[1].respondida, false);
  assert.ok(Number.isFinite(consultas[1].fecha.getTime()));
});

test("conserva los encabezados anteriores y localiza columnas reordenadas al escribir", async () => {
  for (const encabezado of ["Cliente", "Grupo / Cliente", "grillo"]) {
    const { repo, escrituras } = adaptador([
      ["Consulta", "RESPUESTA", encabezado, "OBSERVACIÓN"],
      ["Pedido", "FALSE", "100 - Cliente de prueba", ""],
    ]);
    const [consulta] = await repo.getAll();
    await repo.update(consulta.id, { respondida: true });
    assert.equal(escrituras[0].rango, "'Seguimiento'!B2");
    assert.equal(escrituras[0].valores[0][0], "TRUE");
  }
});

test("un formato incompatible o un fallo de Sheets no se convierten en una lista vacia", async () => {
  await assert.rejects(adaptador([["Columna desconocida"], ["Dato"]]).repo.getAll(), /encabezados/);
  await assert.rejects(adaptador([], new Error("Sheets no disponible")).repo.getAll(), /Sheets no disponible/);
});

test("una tabla valida sin registros si devuelve una lista vacia", async () => {
  assert.equal((await adaptador([["grillo", "Consulta"]]).repo.getAll()).length, 0);
});
