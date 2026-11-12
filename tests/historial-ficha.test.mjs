import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

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
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: (otro) => cargar(otro, cache), Date, Map, Set, console, Intl }, { filename: archivo });
  cache.set(nombre, modulo.exports);
  return modulo.exports;
}

const { esCierreMasivo, leerHistorial, tiempoMedioRespuesta, similitud, formatearMonto } = cargar("@/lib/clientes/historial-ficha");
const { motivoPorReglas, relacionActual } = cargar("@/lib/seguimiento/relacion");

let siguiente = 0;
function evento(extra) {
  siguiente += 1;
  return { id: `e${siguiente}`, consultaId: `c${siguiente}`, tipo: "finalizada", hito: "Pedido nuevo", observacion: "", mensaje: "", fechaConsulta: null, ...extra };
}

test("el cierre masivo se reconoce por su observacion", () => {
  assert.equal(esCierreMasivo({ tipo: "finalizada", observacion: "Cierre masivo: consulta anterior a noviembre." }), true);
  assert.equal(esCierreMasivo({ tipo: "finalizada", observacion: "Resuelto · Cierre masivo: consulta anterior a noviembre." }), true);
  assert.equal(esCierreMasivo({ tipo: "finalizada", observacion: "Se le respondió por WhatsApp" }), false);
  assert.equal(esCierreMasivo({ tipo: "nota", observacion: "Cierre masivo: x" }), false);
});

test("tiempo de respuesta en dias habiles, sin cierres masivos", () => {
  const real = evento({ fechaConsulta: "2026-11-05T13:00:00Z", fecha: "2026-11-10T15:00:00Z" }); // jue -> mar (lunes 9 feriado): 2
  const delDia = evento({ fechaConsulta: "2026-11-10T12:00:00Z", fecha: "2026-11-10T18:00:00Z" });
  const masivo = evento({ fechaConsulta: "2026-10-01T12:00:00Z", fecha: "2026-11-10T18:00:00Z", observacion: "Cierre masivo: consulta anterior a noviembre." });
  const sinFecha = evento({ fecha: "2026-11-10T18:00:00Z" });
  const lecturas = leerHistorial([real, delDia, masivo, sinFecha]);
  assert.equal(lecturas.get(real.id).tiempoRespuesta, 2);
  assert.equal(lecturas.get(delDia.id).tiempoRespuesta, 0);
  assert.equal(lecturas.get(masivo.id).masivo, true);
  assert.equal(lecturas.get(masivo.id).tiempoRespuesta, null, "el masivo no mide respuesta");
  assert.equal(lecturas.get(sinFecha.id).tiempoRespuesta, null);
  assert.equal(tiempoMedioRespuesta(lecturas.values()), 1, "promedio de 2 y 0; el masivo no cuenta");
  assert.equal(tiempoMedioRespuesta([]), null);
});

test("posible duplicado: mismo hito, texto parecido y pocos dias", () => {
  const primero = evento({ fechaConsulta: "2026-11-03T13:00:00Z", fecha: "2026-11-03T15:00:00Z", mensaje: "Necesito 20 pares de guantes nitrilo talle 9 para el lunes" });
  const repetido = evento({ fechaConsulta: "2026-11-04T13:00:00Z", fecha: "2026-11-04T15:00:00Z", mensaje: "Necesito 20 pares de guantes nitrilo talle 9 para el lunes por favor" });
  const otroHito = evento({ hito: "Consulta precio", fechaConsulta: "2026-11-04T14:00:00Z", fecha: "2026-11-04T16:00:00Z", mensaje: "Necesito 20 pares de guantes nitrilo talle 9 para el lunes" });
  const lejos = evento({ fechaConsulta: "2026-11-20T13:00:00Z", fecha: "2026-11-20T15:00:00Z", mensaje: "Necesito 20 pares de guantes nitrilo talle 9 para el lunes" });
  const distinto = evento({ fechaConsulta: "2026-11-04T15:00:00Z", fecha: "2026-11-04T17:00:00Z", mensaje: "Mandame cascos amarillos y botines" });
  const lecturas = leerHistorial([primero, repetido, otroHito, lejos, distinto]);
  assert.equal(lecturas.get(primero.id).duplicadoDe, null);
  assert.equal(lecturas.get(repetido.id).duplicadoDe, primero.fechaConsulta);
  assert.equal(lecturas.get(otroHito.id).duplicadoDe, null, "otro hito no es duplicado");
  assert.equal(lecturas.get(lejos.id).duplicadoDe, null, "muchos dias despues no");
  assert.equal(lecturas.get(distinto.id).duplicadoDe, null, "otro texto no");
  assert.ok(similitud("hola que tal", "chau") === 0);
});

test("una misma consulta con nota y cierre no se marca como duplicada", () => {
  const nota = evento({ tipo: "nota", consultaId: "x", fechaConsulta: "2026-11-03T13:00:00Z", fecha: "2026-11-03T14:00:00Z", mensaje: "Pedido de cascos" });
  const cierre = evento({ consultaId: "x", fechaConsulta: "2026-11-03T13:00:00Z", fecha: "2026-11-04T14:00:00Z", mensaje: "Pedido de cascos" });
  assert.equal(leerHistorial([nota, cierre]).get(cierre.id).duplicadoDe, null);
});

test("montos con separador de miles", () => {
  assert.equal(formatearMonto("USD 14000"), "USD 14.000");
  assert.equal(formatearMonto("USD14000"), "USD 14.000");
  assert.equal(formatearMonto("$ 1250000,50"), "$ 1.250.000,50");
  assert.equal(formatearMonto("14.000"), "14.000", "ya formateado queda igual");
  assert.equal(formatearMonto("500"), "500");
  assert.equal(formatearMonto("TIENE DEUDA"), "TIENE DEUDA");
});

test("la relacion explica su motivo", () => {
  assert.equal(motivoPorReglas("Estoy muy molesto con la entrega", "Estado de pedido", "EN_RIESGO"), "el mensaje dice «molesto»");
  assert.match(motivoPorReglas("Todavía no llegó el pedido", "Estado de pedido", "REGULAR"), /todavia no/);
  assert.equal(motivoPorReglas("Hola, les paso la OC", "Pedido nuevo", "BUENA"), "mensaje operativo, sin quejas");
  const cerrada = relacionActual({ consulta: "x", hito: "", ia: null, respondida: true }, { relacion: "BUENA" });
  assert.equal(cerrada.motivo, "así quedó al cerrar la conversación");
  const conIa = relacionActual({ consulta: "x", hito: "", respondida: false, ia: { relacion: "REGULAR", hito: "", resumen: "Pide fecha de entrega", origen: "ia" } }, null);
  assert.equal(conIa.motivo, "la IA lo leyó así: Pide fecha de entrega");
});
