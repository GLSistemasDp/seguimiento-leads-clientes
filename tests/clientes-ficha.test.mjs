import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function entorno() {
  const ficha = { codigo: "100", nombre: "Cliente", situacion: "OK", deuda: "OK", observacion: "Nota de la planilla" };
  const consultas = ["grupo-1", "grupo-2"].map((id) => ({
    id, cliente: "100 - Cliente", grupoWhatsapp: id, hito: "Pedido nuevo", consulta: "Consulta", respondida: false, ficha,
  }));
  const colecciones = new Map();
  const repo = {
    getAll: async () => consultas,
    getById: async (id) => consultas.find((item) => item.id === id) ?? null,
    update: async (id, cambios) => Object.assign(consultas.find((item) => item.id === id), cambios),
    fichaDeCliente: async () => ficha,
  };
  let momento = Date.UTC(2026, 10, 6, 12);
  class Reloj extends Date {
    constructor(...args) { super(...(args.length ? args : [momento++])); }
  }
  const mocks = {
    "server-only": {},
    // React.cache memoriza por pedido; fuera de React se usa la funcion tal cual.
    react: { cache: (funcion) => funcion },
    "next/server": { NextResponse: { json: (cuerpo, init) => ({ cuerpo, status: init?.status ?? 200 }) } },
    "@/lib/db/sheets/seguimiento": { ...repo, default: repo },
    "@/lib/db/postgres/pg": { postgresConfigurado: () => false },
    "@/lib/db/local/almacen": {
      leer: async (nombre) => structuredClone(colecciones.get(nombre) ?? {}),
      modificar: async (nombre, cambiar) => {
        const datos = structuredClone(colecciones.get(nombre) ?? {});
        const resultado = cambiar(datos);
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
      process: { env: { SEGUIMIENTO_BACKEND: "sheets", SEGUIMIENTO_SHEETS_ID: "prueba" } },
      crypto: globalThis.crypto, Date: Reloj, Map, Set, console,
    }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  return { cargar, consultas, ficha };
}

test("estado de cuenta combina alertas, elimina duplicados y evita un OK contradictorio", () => {
  const { cargar } = entorno();
  const { estadoCuentaUnificado } = cargar("@/lib/clientes/ficha");
  assert.equal(estadoCuentaUnificado("OK", "REVISAR DEUDORA"), "REVISAR DEUDORA");
  assert.equal(estadoCuentaUnificado("Tiene deuda", "TIENE DEUDA"), "Tiene deuda");
  assert.equal(estadoCuentaUnificado("JUDICIALIZADO", "REVISAR DEUDORA"), "JUDICIALIZADO · REVISAR DEUDORA");
  assert.equal(estadoCuentaUnificado("", ""), "");
  assert.equal(estadoCuentaUnificado("OK", "#N/A"), "OK");
  const { alertasCliente } = cargar("@/lib/seguimiento/presentacion");
  assert.equal(alertasCliente({ ficha: { situacion: "OK", deuda: "OK" }, estadoCuenta: "OK" }).length, 0);
  assert.equal(alertasCliente({ ficha: { situacion: "OK", deuda: "REVISAR DEUDORA" }, estadoCuenta: "OK" })[0], "REVISAR DEUDORA");
});

test("finalizar actualiza ficha y todos los grupos; reabrir o anotar conserva el último cierre", async () => {
  const { cargar, ficha } = entorno();
  const { PATCH } = cargar("@/app/api/seguimiento/[id]/route");
  const db = cargar("@/lib/db/seguimiento");
  const historial = cargar("@/lib/db/historial");
  const patch = (id, cuerpo) => PATCH({ json: async () => cuerpo }, { params: Promise.resolve({ id }) });
  const cierre = await patch("grupo-1", { respondida: true, resultado: "Resuelto", relacion: "BUENA", observaciones: "Se envió la factura" });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.cuerpo.consulta.ficha.observacion, "Resuelto · Se envió la factura");
  assert.ok(cierre.cuerpo.consulta.ficha.observacionActualizadaEn);
  for (const consulta of await db.getAll()) assert.equal(consulta.ficha.observacion, "Resuelto · Se envió la factura");
  assert.equal((await db.fichaDeCliente("100")).observacion, "Resuelto · Se envió la factura");
  assert.equal(ficha.observacion, "Nota de la planilla", "no modifica la fuente ni la ficha cacheada");

  await patch("grupo-2", { respondida: true, resultado: "Derivado a otra area", relacion: "REGULAR", observaciones: "Lo tomó cobranzas" });
  const esperado = "Derivado a otra area · Lo tomó cobranzas";
  assert.equal((await db.fichaDeCliente("100")).observacion, esperado);
  await patch("grupo-1", { respondida: false });
  await patch("grupo-1", { observaciones: "Nota de seguimiento" });
  assert.equal((await db.fichaDeCliente("100")).observacion, esperado);
  assert.equal((await historial.porCliente("100 - Cliente")).length, 4);

  await patch("grupo-1", { respondida: true, resultado: "Resuelto", relacion: "BUENA" });
  assert.equal((await db.fichaDeCliente("100")).observacion, "Resuelto", "un cierre sin nota reemplaza la observación anterior");
});

test("un cierre sin resultado o relación se rechaza sin cambiar la ficha", async () => {
  const { cargar } = entorno();
  const { PATCH } = cargar("@/app/api/seguimiento/[id]/route");
  for (const cuerpo of [{ respondida: true }, { respondida: true, resultado: "Resuelto" }]) {
    const respuesta = await PATCH({ json: async () => cuerpo }, { params: Promise.resolve({ id: "grupo-1" }) });
    assert.equal(respuesta.status, 400);
  }
  assert.equal((await cargar("@/lib/db/seguimiento").fichaDeCliente("100")).observacion, "Nota de la planilla");
});

test("las realizadas salen de la cola y conservan resultado, relación y observación en el historial", async () => {
  const { cargar } = entorno();
  const { PATCH } = cargar("@/app/api/seguimiento/[id]/route");
  const db = cargar("@/lib/db/seguimiento");
  const { filtrarPorVista } = cargar("@/lib/seguimiento/presentacion");
  const historial = cargar("@/lib/db/historial");
  const finalizar = (id) => PATCH({ json: async () => ({ respondida: true, resultado: "Resuelto", relacion: "BUENA", observaciones: "Se confirmó la entrega" }) }, { params: Promise.resolve({ id }) });
  assert.equal((await finalizar("grupo-1")).status, 200);
  const pendientes = filtrarPorVista(await db.getAll(), "pendientes");
  assert.deepEqual([...pendientes].map((consulta) => consulta.id), ["grupo-2"], "otro chat pendiente del mismo cliente continúa visible");
  assert.equal((await finalizar("grupo-2")).status, 200);
  assert.equal(filtrarPorVista(await db.getAll(), "pendientes").length, 0);
  const eventos = await historial.porCliente("100 - Cliente");
  assert.equal(eventos.length, 2);
  for (const evento of eventos) {
    assert.equal(evento.tipo, "finalizada");
    assert.equal(evento.resultado, "Resuelto");
    assert.equal(evento.relacion, "BUENA");
    assert.equal(evento.observacion, "Se confirmó la entrega");
  }
});
