import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Carga los modulos de src/ transpilados, sin Next ni React. */
function cargador() {
  const mocks = { "server-only": {}, react: { cache: (funcion) => funcion } };
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
    vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: cargar, Date, Map, Set, console }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  return cargar;
}

const { diasHabilesEntre, calcularTriaje, enTriaje, DEMORA } = cargador()("@/lib/seguimiento/indicadores");

// Martes 10/11/2026, 15 h en Argentina. El lunes 9/11 fue feriado.
const AHORA = new Date("2026-11-10T18:00:00Z");
const FERIADOS = new Set(["2026-11-09"]);
const fechaAR = (dia, hora = 10) => new Date(`${dia}T${String(hora + 3).padStart(2, "0")}:00:00Z`);

function consulta(id, dia, extra = {}) {
  return {
    id, cliente: `${id} - Cliente`, grupoWhatsapp: id, consulta: "Hola", hito: "Consulta general",
    respondida: false, fecha: dia ? fechaAR(dia) : null, dias: null, ...extra,
  };
}

test("los dias habiles saltean fines de semana y feriados", () => {
  assert.equal(diasHabilesEntre(fechaAR("2026-11-10", 8), AHORA, FERIADOS), 0, "el mismo dia es 0");
  // Viernes 6 -> martes 10: sabado, domingo y el feriado del lunes no cuentan.
  assert.equal(diasHabilesEntre(fechaAR("2026-11-06"), AHORA, FERIADOS), 1);
  assert.equal(diasHabilesEntre(fechaAR("2026-11-06"), AHORA, new Set()), 2);
  // Jueves 29/10 -> martes 10/11: 30, 2, 3, 4, 5, 6 y 10 (el 9 es feriado).
  assert.equal(diasHabilesEntre(fechaAR("2026-10-29"), AHORA, FERIADOS), 7);
});

test("sin pendientes las tres tarjetas quedan al dia y en verde", () => {
  const datos = calcularTriaje([consulta("a", "2026-11-02", { respondida: true })], () => "EN_RIESGO", () => 5, AHORA);
  assert.equal(datos.pendientes.cantidad, 0);
  assert.equal(datos.pendientes.tono, "verde");
  assert.equal(datos.demora.promedio, null);
  assert.equal(datos.demora.tono, "verde");
  assert.equal(datos.riesgo.cantidad, 0, "las respondidas no cuentan aunque su relacion sea roja");
  assert.equal(datos.riesgo.tono, "verde");
});

test("cada tarjeta cuenta lo mismo que muestra su filtro", () => {
  const relacion = { a: "EN_RIESGO", b: "REGULAR", c: "BUENA", d: "REGULAR" };
  const espera = { a: 0, b: 2, c: 4, d: 6 };
  const consultas = [
    consulta("a", "2026-11-10"),
    consulta("b", "2026-11-05"),
    consulta("c", "2026-11-03"),
    consulta("d", "2026-10-30"),
    consulta("e", "2026-10-01", { respondida: true }),
  ];
  const relacionDe = (item) => relacion[item.id] ?? "BUENA";
  const esperaDe = (item) => espera[item.id] ?? null;
  const datos = calcularTriaje(consultas, relacionDe, esperaDe, AHORA);
  const filtro = (triaje) => consultas.filter((item) => enTriaje(triaje, item, relacionDe(item), esperaDe(item))).length;

  assert.equal(datos.pendientes.cantidad, 4);
  assert.equal(filtro("pendientes"), 4);
  assert.equal(datos.pendientes.masAntigua, 11, "dias corridos de la mas vieja");
  assert.equal(datos.pendientes.tono, "rojo", "alguna supera los 3 dias");

  assert.equal(datos.demora.promedio, 3);
  assert.deepEqual(Array.from(datos.demora.tramos, (tramo) => tramo.cantidad), [1, 1, 1]);
  assert.equal(datos.demora.demoradas, 2, `mas de ${DEMORA.rojo} dias habiles`);
  assert.equal(filtro("demora"), 2);
  assert.equal(datos.demora.tono, "ambar", "promedio entre 1 y 3");

  assert.equal(datos.riesgo.cantidad, 3);
  assert.equal(filtro("riesgo"), 3);
  assert.equal(datos.riesgo.enRiesgo, 1);
  assert.equal(datos.riesgo.regular, 2);
  assert.equal(datos.riesgo.tono, "rojo");
});

test("los colores siguen los umbrales", () => {
  const una = (dias, relacion) =>
    calcularTriaje([consulta("x", null, { dias })], () => relacion, () => dias, AHORA);
  assert.equal(una(0, "REGULAR").demora.tono, "verde");
  assert.equal(una(0, "REGULAR").pendientes.tono, "ambar", "hay pendientes pero ninguna vieja");
  assert.equal(una(0, "REGULAR").riesgo.tono, "ambar", "solo regulares");
  assert.equal(una(3, "BUENA").demora.tono, "ambar", "3 dias todavia no supera el umbral");
  assert.equal(una(4, "BUENA").demora.tono, "rojo");
  assert.equal(una(4, "BUENA").riesgo.tono, "verde");
});
