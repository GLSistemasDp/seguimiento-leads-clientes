import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import pg from "pg";
import ts from "typescript";

// Opt-in: node --env-file=.env.local --test tests/clientes-postgres.test.mjs
// Todo se ejecuta dentro de un esquema aislado y termina con ROLLBACK.
test("Postgres migra fichas, registra el último cierre y lo conserva al sincronizar", {
  skip: !(process.env.DATABASE_URL || process.env.POSTGRES_URL), timeout: 30_000,
}, async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    const esquema = `clientes_test_${randomUUID().replaceAll("-", "")}`;
    await db.query(`CREATE SCHEMA "${esquema}"`);
    await db.query(`SET LOCAL search_path TO "${esquema}", public`);
    for (const archivo of ["db/schema.sql", "db/migraciones/002_relacion_ia.sql"]) {
      await db.query(fs.readFileSync(archivo, "utf8"));
    }
    await db.query(`INSERT INTO clientes (codigo, nombre, situacion, deuda, observacion) VALUES
      ('100', 'Cliente anterior', 'OK', 'REVISAR DEUDORA', 'Nota inicial'),
      ('200', 'Cliente sin cierres', 'OK', '', 'Nota inicial')`);
    await db.query(`INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, consulta)
      SELECT 'primera', id, '100 - Cliente anterior', 'Enviar factura' FROM clientes WHERE codigo = '100'`);
    await db.query(`UPDATE consultas_seguimiento SET respondida = true, resultado = 'Resuelto',
      observaciones = 'Resuelto · Factura enviada' WHERE id = 'primera'`);
    await db.query("UPDATE chat_interacciones SET registrado_en = '2026-10-01T12:00:00Z'");
    await db.query(fs.readFileSync("db/migraciones/003_ficha_clientes.sql", "utf8"));
    await db.query(fs.readFileSync("db/migraciones/004_clasificacion_clientes.sql", "utf8"));
    const ficha = async () => (await db.query("SELECT * FROM clientes WHERE codigo = '100'")).rows[0];
    assert.equal((await ficha()).situacion, "REVISAR DEUDORA");
    assert.equal((await ficha()).deuda, "REVISAR DEUDORA");
    assert.equal((await ficha()).observacion, "Resuelto · Factura enviada");

    await db.query(`INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, consulta)
      SELECT 'segunda', id, '100 - Cliente anterior', 'Otro grupo' FROM clientes WHERE codigo = '100'`);
    await db.query(`UPDATE consultas_seguimiento SET respondida = true, resultado = 'Derivado a otra area',
      observaciones = 'Lo tomó cobranzas' WHERE id = 'segunda'`);
    assert.equal((await ficha()).observacion, "Derivado a otra area · Lo tomó cobranzas");
    await db.query("UPDATE consultas_seguimiento SET respondida = false WHERE id = 'primera'");
    assert.equal((await ficha()).observacion, "Derivado a otra area · Lo tomó cobranzas");
    // La fecha de un cierre importado puede corregirse después de insertarlo.
    await db.query("UPDATE chat_interacciones SET registrado_en = '2026-09-01T12:00:00Z' WHERE consulta_id = 'segunda'");
    assert.equal((await ficha()).observacion, "Resuelto · Factura enviada");

    // Ejecuta el sincronizador real contra este esquema con la fuente de Sheets controlada.
    const base = { listaPrecio: "D03W", clasificacion: "A", grupoVendedor: "Grupo nuevo", grupoWhatsapp: "Grupo WhatsApp",
      grupoWhatsapp2: "", linkWhatsapp: "", situacion: "OK", deuda: "OK", observacion: "Nota antigua de Sheets",
      actividad: "Industria", categoria: "Fabricante", condicionPago: "30 días", limiteCredito: "Hasta USD 1000" };
    const mocks = {
      "server-only": {},
      "@/lib/db/postgres/pg": { postgresConfigurado: () => true, pool: async () => ({ connect: async () => ({
        query: (...args) => db.query(...args), release() {},
      }) }) },
      "@/lib/db/sheets/seguimiento": { leerPlanilla: async () => ({ consultas: [], fichas: [
        { ...base, codigo: "100", nombre: "Cliente actualizado", clasificacion: "N" }, { ...base, codigo: "200", nombre: "Cliente sin cierres" },
      ] }) },
      "@/lib/ia/clasificador": { iaConfigurada: () => false, clasificarVarios: async () => [] },
      "@/lib/seguimiento/presentacion": {},
      "@/lib/seguimiento/relacion": {},
    };
    const modulo = { exports: {} };
    const codigo = ts.transpileModule(fs.readFileSync("src/lib/sync/planilla.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(codigo, {
      module: modulo, exports: modulo.exports, require: (nombre) => {
        if (!(nombre in mocks)) throw new Error(`Dependencia sin controlar: ${nombre}`);
        return mocks[nombre];
      }, process: { env: { SEGUIMIENTO_SHEETS_ID: "prueba" } }, Date, Map, Set, console,
    });
    assert.equal((await modulo.exports.sincronizarPlanilla()).clientes, 2);
    const actualizada = await ficha();
    assert.equal(actualizada.nombre, "Cliente actualizado");
    assert.equal(actualizada.actividad, "Industria");
    assert.equal(actualizada.clasificacion, "N");
    assert.equal(actualizada.situacion, "OK");
    assert.equal(actualizada.observacion, "Resuelto · Factura enviada");
    const sinCierres = (await db.query("SELECT observacion FROM clientes WHERE codigo = '200'")).rows[0];
    assert.equal(sinCierres.observacion, "Nota antigua de Sheets");

    await db.query(`UPDATE consultas_seguimiento SET respondida = true, resultado = 'Resuelto', observaciones = '' WHERE id = 'primera'`);
    assert.equal((await ficha()).observacion, "Resuelto");
  } finally {
    await db.query("ROLLBACK").catch(() => undefined);
    await db.end();
  }
});
