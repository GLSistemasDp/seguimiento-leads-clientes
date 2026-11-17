import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("Respondido=TRUE finaliza filas nuevas, pendientes y reabiertas sin duplicar cierres", async () => {
  const fila = (id, respondida) => ({
    id, respondida, cliente: "100 - Cliente", fecha: new Date("2026-11-10T13:00:00Z"),
    encargado: "bot", grupoWhatsapp: "Ventas", consulta: "Pedido", hito: "Pedido nuevo",
    observaciones: "", tentativoRespuesta: "",
  });
  const consultas = [
    fila("nueva-realizada", true),
    fila("existente", true),
    fila("reabierta", true),
    fila("ya-realizada", true),
    fila("pendiente", false),
  ];
  const cola = new Map([
    ["pl-existente", false], ["pl-reabierta", false],
    ["pl-ya-realizada", true], ["pl-pendiente", false],
  ]);
  const historial = new Set(["pl-reabierta", "pl-ya-realizada"]);
  const cierres = [];
  const db = {
    async query(sql, parametros = []) {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: true }] };
      if (sql.startsWith("SELECT id, respondida")) {
        return { rows: Array.from(cola, ([id, respondida]) => ({ id, respondida })) };
      }
      if (sql.includes("FROM chat_interacciones")) {
        return { rows: Array.from(historial, (consulta_id) => ({ consulta_id, finalizada: true })) };
      }
      if (sql.includes("INSERT INTO consultas_seguimiento")) {
        for (const fila of JSON.parse(parametros[0])) cola.set(fila.id, false);
      } else if (sql.includes("SET respondida = true")) {
        for (const id of parametros[0]) {
          assert.equal(cola.get(id), false, "solo se finalizan filas pendientes");
          cola.set(id, true);
          historial.add(id);
          cierres.push(id);
        }
      } else if (!sql.includes("SET vigente_en_planilla") && !sql.includes("UPDATE chat_interacciones") && !sql.includes("SET respondida_en = fecha") &&
        !sql.includes("INSERT INTO almacen_registros") && !sql.includes("pg_advisory_unlock")) {
        throw new Error(`Consulta sin controlar: ${sql}`);
      }
      return { rows: [] };
    },
    release() {},
  };
  const mocks = {
    "server-only": {},
    "@/lib/db/postgres/pg": { postgresConfigurado: () => true, pool: async () => ({ connect: async () => db }) },
    "@/lib/db/sheets/seguimiento": { leerPlanilla: async () => ({ consultas, fichas: [] }) },
    "@/lib/ia/clasificador": { iaConfigurada: () => false, clasificarVarios: async () => [] },
    "@/lib/seguimiento/presentacion": { separarCliente: () => ({ codigo: "100", nombre: "Cliente" }) },
    "@/lib/seguimiento/relacion": {
      clasificarPorReglas: () => ({ relacion: "BUENA", hito: "Pedido nuevo", resumen: "Pedido", origen: "reglas" }),
    },
  };
  const modulo = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync("src/lib/sync/planilla.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports,
    require: (nombre) => {
      if (!(nombre in mocks)) throw new Error(`Dependencia sin controlar: ${nombre}`);
      return mocks[nombre];
    },
    process: { env: { SEGUIMIENTO_SHEETS_ID: "prueba" } }, Date, Map, Set, console,
  });

  const primera = await modulo.exports.sincronizarPlanilla();
  assert.equal(primera.nuevasYaRespondidas, 1);
  assert.equal(primera.finalizadas, 2);
  assert.deepEqual(cierres, ["pl-nueva-realizada", "pl-existente", "pl-reabierta"]);
  assert.equal(cola.get("pl-pendiente"), false, "FALSE sigue pendiente");
  for (const consulta of consultas.filter((consulta) => consulta.respondida)) {
    assert.equal(cola.get(`pl-${consulta.id}`), true);
  }

  const segunda = await modulo.exports.sincronizarPlanilla();
  assert.equal(segunda.nuevas, 0);
  assert.equal(segunda.finalizadas, 0);
  assert.equal(cierres.length, 3, "repetir la sincronizacion no vuelve a cerrar las realizadas");
});
