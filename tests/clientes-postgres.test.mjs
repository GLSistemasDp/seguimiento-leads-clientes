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
    await db.query(fs.readFileSync("db/migraciones/005_vigencia_planilla.sql", "utf8"));
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
    let consultasFuente = [];
    const mocks = {
      "server-only": {},
      // React.cache memoriza por pedido; fuera de React se usa la funcion tal cual.
      react: { cache: (funcion) => funcion },
      "next/server": { after: () => {} },
      "@/lib/db/postgres/pg": { postgresConfigurado: () => true, pool: async () => ({ connect: async () => ({
        query: (...args) => db.query(...args), release() {},
      }) }), consultar: async (...args) => (await db.query(...args)).rows },
      "@/lib/db/sheets/seguimiento": { leerPlanilla: async () => ({ consultas: consultasFuente, fichas: [
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

    // Una fila editada cambia de huella: la anterior sale de la bandeja sin
    // marcar una respuesta ni alterar las consultas cargadas por el bot.
    await db.query(`INSERT INTO consultas_seguimiento (id, cliente_id, cliente_texto, consulta, origen)
      SELECT x.id, c.id, '100 - Cliente actualizado', x.consulta, x.origen
        FROM clientes c CROSS JOIN (VALUES
          ('pl-anterior', 'Version anterior', 'planilla'),
          ('pl-vigente', 'Version actual', 'planilla'),
          ('bot-manual', 'Mensaje del bot', 'bot')
        ) AS x(id, consulta, origen) WHERE c.codigo = '100'`);
    consultasFuente = [{ id: "vigente", respondida: false }];
    const eventosAntes = (await db.query("SELECT count(*) AS cantidad FROM chat_interacciones")).rows[0].cantidad;
    const reconciliada = await modulo.exports.sincronizarPlanilla();
    assert.equal(reconciliada.retiradas, 1);
    assert.equal(reconciliada.restauradas, 0);
    const retirada = (await db.query("SELECT respondida, vigente_en_planilla FROM consultas_seguimiento WHERE id = 'pl-anterior'")).rows[0];
    assert.deepEqual(retirada, { respondida: false, vigente_en_planilla: false });
    assert.equal((await db.query("SELECT count(*) AS cantidad FROM chat_interacciones")).rows[0].cantidad, eventosAntes);
    assert.equal((await ficha()).observacion, "Resuelto · Factura enviada");

    const repo = { exports: {} };
    const codigoRepo = ts.transpileModule(fs.readFileSync("src/lib/db/postgres/seguimiento.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(codigoRepo, {
      module: repo, exports: repo.exports, require: (nombre) => {
        if (!(nombre in mocks)) throw new Error(`Dependencia sin controlar: ${nombre}`);
        return mocks[nombre];
      }, Date, Map, Set, console,
    });
    let idsVisibles = Array.from(await repo.exports.getAll(), (consulta) => consulta.id);
    assert.ok(idsVisibles.includes("pl-vigente"));
    assert.ok(idsVisibles.includes("bot-manual"));
    assert.ok(!idsVisibles.includes("pl-anterior"));
    assert.equal((await repo.exports.kpis()).pendientes, "3", "la vista SQL tampoco cuenta versiones retiradas");

    assert.equal((await modulo.exports.sincronizarPlanilla()).retiradas, 0, "repetir no modifica las vigencias");
    consultasFuente = [{ id: "anterior", respondida: false }];
    const restaurada = await modulo.exports.sincronizarPlanilla();
    assert.equal(restaurada.retiradas, 1);
    assert.equal(restaurada.restauradas, 1);
    idsVisibles = Array.from(await repo.exports.getAll(), (consulta) => consulta.id);
    assert.ok(idsVisibles.includes("pl-anterior"), "si la fila reaparece vuelve a la bandeja");
    assert.ok(!idsVisibles.includes("pl-vigente"));
    assert.ok(idsVisibles.includes("bot-manual"));

    await db.query(`UPDATE consultas_seguimiento SET respondida = true, resultado = 'Resuelto', observaciones = '' WHERE id = 'primera'`);
    assert.equal((await ficha()).observacion, "Resuelto");
  } finally {
    await db.query("ROLLBACK").catch(() => undefined);
    await db.end();
  }
});
