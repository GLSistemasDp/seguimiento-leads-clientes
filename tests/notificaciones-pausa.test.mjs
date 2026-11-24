import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

function cargar(archivo, dependencias, contexto = {}) {
  const modulo = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports, Date, Buffer, console,
    require(nombre) {
      if (Object.hasOwn(dependencias, nombre)) return dependencias[nombre];
      if (nombre.startsWith("node:")) return require(nombre);
      throw new Error(`Dependencia sin controlar: ${nombre}`);
    },
    ...contexto,
  }, { filename: archivo });
  return modulo.exports;
}

test("la pausa persiste por canal, conserva cambios simultáneos y permite reanudar", async (t) => {
  const raizTemporal = path.resolve(os.tmpdir());
  const directorio = fs.mkdtempSync(path.join(raizTemporal, "crm-telegram-test-"));
  t.after(() => {
    assert.equal(path.dirname(directorio), raizTemporal);
    assert.ok(path.basename(directorio).startsWith("crm-telegram-test-"));
    fs.rmSync(directorio, { recursive: true, force: true });
  });
  const almacen = cargar("src/lib/db/local/almacen.ts", {
    "server-only": {},
    "@/lib/db/postgres/pg": { postgresConfigurado: () => false },
  }, { process: { env: { DATOS_LOCALES_DIR: directorio } } });
  const dependencias = { "server-only": {}, "@/lib/db/local/almacen": almacen };
  const bot = cargar("src/lib/notificaciones/estado-bot.ts", dependencias, { process: { env: {} } });

  assert.equal(await bot.botPausado("seguimiento"), false);
  await Promise.all([bot.establecerPausaBot("seguimiento", true), bot.establecerPausaBot("reclamos", true)]);
  const recargado = cargar("src/lib/notificaciones/estado-bot.ts", dependencias, { process: { env: {} } });
  assert.equal(await recargado.botPausado("seguimiento"), true);
  assert.equal(await recargado.botPausado("reclamos"), true);
  assert.equal(await recargado.botPausado("altas"), false);
  await recargado.establecerPausaBot("seguimiento", false);
  assert.equal(await bot.botPausado("seguimiento"), false);
  assert.equal(await bot.botPausado("reclamos"), true);
});

test("Vercel exige almacenamiento persistente para confirmar una pausa", async () => {
  const bot = cargar("src/lib/notificaciones/estado-bot.ts", {
    "server-only": {},
    "@/lib/db/local/almacen": {
      almacenPersistente: () => false,
      guardar: () => assert.fail("no debe guardar una pausa en disco efímero"),
    },
  }, { process: { env: { VERCEL: "1" } } });
  await assert.rejects(bot.establecerPausaBot("altas", true), /Postgres/);
});

function entornoEnvios() {
  const pausados = new Set();
  const registros = [];
  const mensajes = [];
  let lecturas = 0;
  let alLeer = () => {};
  let falloEstado = false;
  const leer = (resultado) => async () => { lecturas++; alLeer(); return resultado; };
  const envios = cargar("src/lib/notificaciones/envios.ts", {
    "server-only": {},
    "next/headers": {},
    "@/lib/automatizaciones/registro": { registrarAutomatizacion: async (registro) => { registros.push(registro); } },
    "@/lib/notificaciones/estado-bot": {
      botPausado: async (canal) => {
        if (falloEstado) throw new Error("Almacenamiento no disponible");
        return pausados.has(canal);
      },
    },
    "@/lib/db/reclamos": { getPanel: leer({ reclamos: [] }), datosDeCliente: leer({}) },
    "@/lib/db/seguimiento": { getAll: leer([]) },
    "@/lib/db/solicitudes": { getAll: leer([{ email: "prueba@example.com" }]) },
    "@/lib/notificaciones/mensajes": {
      mensajesSeguimiento: () => ["Seguimiento"], mensajeReclamosPendientes: () => "Reclamos",
      mensajeAltasPendientes: () => "Altas", mensajeReclamoNuevo: () => "Reclamo nuevo", mensajeAltaNueva: () => "Alta nueva",
    },
    "@/lib/notificaciones/telegram": {
      ErrorTelegram: class extends Error {},
      enviarTelegram: async (textos, canal) => { mensajes.push({ textos, canal }); return textos.length; },
    },
    "@/lib/solicitudes/evaluacion": { evaluarPorReglas: () => ({ puntaje: 100 }) },
  });
  return {
    envios, pausados, registros, mensajes, get lecturas() { return lecturas; },
    alLeer(callback) { alLeer = callback; },
    fallarEstado() { falloEstado = true; },
  };
}

test("cada canal pausado bloquea botón, cron y avisos de formularios antes de leer datos", async () => {
  const entorno = entornoEnvios();
  for (const canal of ["seguimiento", "reclamos", "altas"]) {
    entorno.pausados.add(canal);
    for (const origen of ["manual", "cron"]) {
      const resultado = await entorno.envios.ENVIOS[canal](origen, "https://intranet.example");
      assert.equal(resultado.ok, false);
      assert.equal(resultado.pausado, true);
      assert.equal(entorno.registros.at(-1).estado, "omitido");
      assert.equal(entorno.registros.at(-1).origen, origen);
    }
  }
  assert.equal((await entorno.envios.notificarAltaNueva("prueba@example.com", "")).pausado, true);
  assert.equal((await entorno.envios.notificarReclamoNuevo({}, "")).pausado, true);
  assert.equal(entorno.mensajes.length, 0);
  assert.equal(entorno.lecturas, 0);
  assert.equal(entorno.registros.length, 8);
});

test("pausar un canal permite enviar por los demás y reanudar recupera el envío", async () => {
  const entorno = entornoEnvios();
  entorno.pausados.add("reclamos");
  for (const canal of ["seguimiento", "altas"]) {
    assert.equal((await entorno.envios.ENVIOS[canal]("manual", "")).ok, true);
  }
  assert.equal((await entorno.envios.ENVIOS.reclamos("cron", "")).pausado, true);
  entorno.pausados.delete("reclamos");
  assert.equal((await entorno.envios.ENVIOS.reclamos("cron", "")).ok, true);
  assert.deepEqual(entorno.mensajes.map((mensaje) => mensaje.canal), ["seguimiento", "altas", "reclamos"]);
  assert.equal(entorno.registros.at(-1).estado, "ok");
});

test("la pausa aplicada mientras se arma un resumen también impide enviarlo", async () => {
  const entorno = entornoEnvios();
  entorno.alLeer(() => entorno.pausados.add("seguimiento"));
  const resultado = await entorno.envios.enviarSeguimiento("cron", "");
  assert.equal(resultado.pausado, true);
  assert.equal(entorno.lecturas, 1);
  assert.equal(entorno.mensajes.length, 0);
});

test("si falla consultar la pausa no se envía un mensaje por error", async () => {
  const entorno = entornoEnvios();
  entorno.fallarEstado();
  const resultado = await entorno.envios.enviarSeguimiento("manual", "");
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /Almacenamiento/);
  assert.equal(entorno.mensajes.length, 0);
  assert.equal(entorno.registros.at(-1).estado, "error");
});

function cargarRuta(bot, envios = {}) {
  return cargar("src/app/api/notificaciones/[tipo]/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/notificaciones/estado-bot": bot,
    "@/lib/notificaciones/envios": {
      urlBase: (request) => new URL(request.url).origin,
      ENVIOS: { seguimiento: () => {}, reclamos: () => {}, altas: () => {}, ...envios },
    },
  });
}

test("la API valida el canal y el booleano y devuelve el estado guardado", async () => {
  const pausados = new Set();
  const ruta = cargarRuta({
    botPausado: async (canal) => pausados.has(canal),
    establecerPausaBot: async (canal, pausa) => pausa ? pausados.add(canal) : pausados.delete(canal),
  });
  const contexto = (tipo) => ({ params: Promise.resolve({ tipo }) });
  const request = (body) => new Request("https://intranet.example/api/notificaciones/altas", { method: "PATCH", body });
  assert.equal((await ruta.GET(null, contexto("desconocido"))).status, 404);
  assert.equal((await ruta.PATCH(request("{}"), contexto("desconocido"))).status, 404);
  for (const body of ["{", "null", "{}", '{"pausado":"false"}']) {
    assert.equal((await ruta.PATCH(request(body), contexto("altas"))).status, 400);
  }
  for (const pausado of [true, false]) {
    const respuesta = await ruta.PATCH(request(JSON.stringify({ pausado })), contexto("altas"));
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { pausado });
    const lectura = await ruta.GET(null, contexto("altas"));
    assert.equal(lectura.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await lectura.json(), { pausado });
  }
});

test("un envío manual pausado devuelve 409 y un cron pausado queda omitido sin error", async () => {
  const resultado = { ok: false, error: "Bot pausado", sinConfigurar: false, pausado: true };
  const ruta = cargarRuta({}, { seguimiento: async () => resultado });
  const manual = await ruta.POST(new Request("https://intranet.example"), { params: Promise.resolve({ tipo: "seguimiento" }) });
  assert.equal(manual.status, 409);
  assert.equal((await manual.json()).pausado, true);

  const { ejecutarCron } = cargar("src/lib/automatizaciones/cron.ts", {
    "server-only": {}, "next/server": { NextResponse: Response },
    "@/lib/automatizaciones/registro": { registrarAutomatizacion: async () => {} },
    "@/lib/utils/feriados": { diaHabil: async () => ({ habil: true, dia: "2026-11-24" }) },
  }, { process: { env: { CRON_SECRET: "prueba" } } });
  const cron = await ejecutarCron(new Request("https://intranet.example", {
    headers: { authorization: "Bearer prueba" },
  }), "seguimiento-chats", async () => resultado);
  assert.equal(cron.status, 200);
  assert.equal((await cron.json()).status, "skipped");
});
