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
    vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: cargar, Date, Map, Set, console, Intl }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  return cargar;
}

const cargar = cargador();
const { calcularTriaje, enTriaje, DEMORA } = cargar("@/lib/seguimiento/indicadores");
const { businessDaysSince, businessHoursSince, textoHorasHabiles, formatearHoras } = cargar("@/lib/utils/dias-habiles");
const { horasAbierta, diasCorridos } = cargar("@/lib/seguimiento/presentacion");

// Martes 10/11/2026, 15 h en Argentina. El lunes 9/11 fue feriado (esta en el respaldo).
const AHORA = new Date("2026-11-10T18:00:00Z");
const fechaAR = (dia, hora = 10) => new Date(`${dia}T${String(hora + 3).padStart(2, "0")}:00:00Z`);

function consulta(id, dia, extra = {}) {
  return {
    id, cliente: `${id} - Cliente`, grupoWhatsapp: id, consulta: "Hola", hito: "Consulta general",
    respondida: false, fecha: dia ? fechaAR(dia) : null, dias: null, ...extra,
  };
}

test("los dias habiles saltean fines de semana y feriados", () => {
  assert.equal(businessDaysSince(fechaAR("2026-11-10", 8), AHORA), 0, "el mismo dia es 0");
  // Viernes 6 -> martes 10: sabado, domingo y el feriado del lunes no cuentan.
  assert.equal(businessDaysSince(fechaAR("2026-11-06"), AHORA), 1);
  assert.equal(businessDaysSince(fechaAR("2026-11-06"), AHORA, new Set()), 2);
  // Jueves 29/10 -> martes 10/11: 30, 2, 3, 4, 5, 6 y 10 (el 9 es feriado).
  assert.equal(businessDaysSince(fechaAR("2026-10-29"), AHORA), 7);
});

test("las horas habiles cuentan solo de 8 a 17, de lunes a viernes, sin feriados", () => {
  // AHORA es martes 10/11 a las 15 h.
  assert.equal(businessHoursSince(fechaAR("2026-11-10", 10), AHORA), 5, "mismo dia, 10 a 15");
  assert.equal(businessHoursSince(fechaAR("2026-11-10", 7), AHORA), 7, "antes de abrir cuenta desde las 8");
  assert.equal(businessHoursSince(fechaAR("2026-11-10", 16), AHORA), 0, "despues todavia no paso");
  // Viernes 6 a las 16: 1 h del viernes, lunes 9 feriado, martes de 8 a 15.
  assert.equal(businessHoursSince(fechaAR("2026-11-06", 16), AHORA), 8);
  assert.equal(businessHoursSince(fechaAR("2026-11-06", 16), AHORA, new Set()), 17, "sin el feriado suma el lunes entero");
  assert.equal(businessHoursSince(fechaAR("2026-11-07", 10), AHORA), 7, "un mensaje del sabado empieza a contar el dia habil siguiente");
  assert.equal(businessHoursSince(fechaAR("2026-11-06", 20), fechaAR("2026-11-10", 9)), 1, "viernes a la noche -> martes 9 h");
  assert.equal(textoHorasHabiles(0.5), "menos de 1 h hábil");
  assert.equal(textoHorasHabiles(1), "1 h hábil");
  assert.equal(textoHorasHabiles(26.4), "26 h hábiles");
  assert.equal(textoHorasHabiles(1650), "1.650 h hábiles");
  assert.equal(formatearHoras(4.2), "4,2");
  assert.equal(formatearHoras(12.6), "13");
});

test("la demora de la tabla es en horas habiles; Telegram sigue en dias corridos", () => {
  const vieja = consulta("x", "2026-10-29");
  // jue 29 (10 a 17) 7 + seis dias completos de 9 h + mar 10 (8 a 15) 7; el lunes 9 es feriado.
  assert.equal(horasAbierta(vieja, AHORA), 68);
  assert.equal(diasCorridos(vieja, AHORA), 12);
  assert.equal(horasAbierta(consulta("y", null, { dias: 5 }), AHORA), 45, "sin fecha, la columna de la planilla en jornadas de 9 h");
});

test("sin pendientes las tres tarjetas quedan al dia y en verde", () => {
  const datos = calcularTriaje([consulta("a", "2026-11-02", { respondida: true })], () => "EN_RIESGO", AHORA);
  assert.equal(datos.pendientes.cantidad, 0);
  assert.equal(datos.pendientes.tono, "verde");
  assert.equal(datos.demora.promedio, null);
  assert.equal(datos.demora.tono, "verde");
  assert.equal(datos.riesgo.cantidad, 0, "las respondidas no cuentan aunque su relacion sea roja");
  assert.equal(datos.riesgo.tono, "verde");
});

test("las tres tarjetas usan la misma cuenta y coinciden con su filtro", () => {
  const relacion = { a: "EN_RIESGO", b: "REGULAR", c: "BUENA", d: "REGULAR" };
  const consultas = [
    consulta("a", "2026-11-10"), // 5 h habiles
    consulta("b", "2026-11-06"), // 7 + 7 = 14
    consulta("c", "2026-11-04"), // 7 + 9 + 9 + 7 = 32
    consulta("d", "2026-10-29"), // 68
    consulta("e", "2026-10-01", { respondida: true }),
  ];
  const relacionDe = (item) => relacion[item.id] ?? "BUENA";
  const datos = calcularTriaje(consultas, relacionDe, AHORA);
  const filtro = (triaje) => consultas.filter((item) => enTriaje(triaje, item, relacionDe(item), AHORA)).length;

  assert.equal(datos.pendientes.cantidad, 4);
  assert.equal(filtro("pendientes"), 4);
  assert.equal(datos.pendientes.masAntigua, 68, "la mas vieja, en horas habiles");
  assert.equal(datos.pendientes.tono, "rojo", "alguna supera las 24 h habiles");

  // Hasta 8 h, de 8 a 24 h y mas de 24 h: la mas vieja cae en el ultimo tramo.
  assert.deepEqual(Array.from(datos.demora.tramos, (tramo) => tramo.etiqueta), ["hasta 8 h", "8–24 h", "+24 h"]);
  assert.deepEqual(Array.from(datos.demora.tramos, (tramo) => tramo.cantidad), [1, 1, 2]);
  assert.equal(datos.demora.promedio, (5 + 14 + 32 + 68) / 4);
  assert.equal(datos.demora.demoradas, 2, `mas de ${DEMORA.rojo} h habiles`);
  assert.equal(filtro("demora"), 2);
  assert.equal(datos.demora.tono, "rojo", "promedio mayor a 24 h");

  assert.equal(datos.riesgo.cantidad, 3);
  assert.equal(filtro("riesgo"), 3);
  assert.equal(datos.riesgo.enRiesgo, 1);
  assert.equal(datos.riesgo.regular, 2);
  assert.equal(datos.riesgo.tono, "rojo");
});

test("la cola de la semana pasada cuenta lo que ya habia entrado y seguia abierto", () => {
  const cierres = { cerradaAyer: "2026-11-09T15:00:00Z", cerradaHaceMucho: "2026-10-20T15:00:00Z" };
  const consultas = [
    consulta("vieja", "2026-10-20"), // sigue pendiente y ya estaba
    consulta("cerradaAyer", "2026-10-25", { respondida: true }), // estaba pendiente hace una semana
    consulta("cerradaHaceMucho", "2026-10-15", { respondida: true }),
    consulta("sinDato", "2026-10-15", { respondida: true }), // sin cierre registrado: no suma
    consulta("nueva", "2026-11-09"), // entro esta semana
  ];
  const datos = calcularTriaje(consultas, () => "BUENA", AHORA, (item) => (cierres[item.id] ? new Date(cierres[item.id]) : null));
  assert.equal(datos.pendientes.cantidad, 2);
  assert.equal(datos.pendientes.semanaPasada, 2);
  assert.equal(calcularTriaje(consultas, () => "BUENA", AHORA).pendientes.semanaPasada, null, "sin historial no se compara");
});

test("los colores siguen los umbrales de 8 y 24 h", () => {
  // Sin fecha, la columna de dias de la planilla vale 9 h habiles por dia.
  const una = (dias, relacion) => calcularTriaje([consulta("x", null, { dias })], () => relacion, AHORA);
  assert.equal(DEMORA.ambar, 8);
  assert.equal(DEMORA.rojo, 24);
  assert.equal(una(0, "REGULAR").demora.tono, "verde", "0 h");
  assert.equal(una(0, "REGULAR").pendientes.tono, "ambar", "hay pendientes pero ninguna vieja");
  assert.equal(una(0, "REGULAR").riesgo.tono, "ambar", "solo regulares");
  assert.equal(una(1, "BUENA").demora.tono, "ambar", "9 h");
  assert.equal(una(2, "BUENA").demora.tono, "ambar", "18 h todavia no supera 24");
  assert.equal(una(3, "BUENA").demora.tono, "rojo", "27 h");
  assert.equal(una(3, "BUENA").pendientes.tono, "rojo");
  assert.equal(una(3, "BUENA").riesgo.tono, "verde");
});
