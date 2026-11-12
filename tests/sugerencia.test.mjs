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

const { sugerirRespuesta, REGLAS_SUGERENCIA } = cargar("@/lib/seguimiento/sugerencia");

const contexto = (extra = {}) => ({ relacion: "BUENA", horasHabiles: 0, estadoCuenta: "OK", ...extra });
const sugerir = (hito, consulta = "Hola", extra = {}) => sugerirRespuesta({ hito, consulta }, contexto(extra));

// --- Paso 1: respuesta base segun el hito ------------------------------------------

test("pedido nuevo -> /PedidoRecibido, con el texto completo para el hover", () => {
  const sugerencia = sugerir("Pedido nuevo", "Les paso la OC 4512 adjunta");
  assert.equal(sugerencia.atajo, "/PedidoRecibido");
  assert.equal(sugerencia.revisar, false);
  assert.match(sugerencia.texto, /Gracias por tu pedido/);
  assert.equal(sugerencia.motivo, "Pedido nuevo · cuenta al día");
  assert.equal(sugerencia.flags.length, 0);
});

test("pedido que se suma a uno existente -> /AgregarPedido", () => {
  for (const texto of ["Quiero agregar 10 pares al pedido de ayer", "Pedido adicional para que vaya en el camión del jueves", "¿Llega a tiempo para sumarle guantes?"]) {
    assert.equal(sugerir("Pedido nuevo", texto).atajo, "/AgregarPedido", texto);
  }
  assert.equal(sugerir("Agregar pedido", "10 cascos").atajo, "/AgregarPedido", "hito propio de agregar");
  assert.equal(sugerir("Pedido nuevo", "10 cascos").motivo, "Pedido nuevo · cuenta al día");
});

test("reclamo -> /ReclamoAdmin", () => {
  assert.equal(sugerir("Reclamo", "Llegaron 3 cajas menos").atajo, "/ReclamoAdmin");
});

test("otros hitos usan la respuesta del catalogo de ese hito; sin respuesta, a mano", () => {
  assert.equal(sugerir("Estado de pedido", "Que no lo dejen afuera del camión").atajo, "/Camion");
  assert.equal(sugerir("Estado de pedido", "¿Dónde está mi pedido?").atajo, "/EstadoPedido");
  assert.equal(sugerir("Informa pago", "Les mando el comprobante").revisar, false);
  assert.ok(sugerir("Informa pago", "Les mando el comprobante").atajo, "informa pago tiene respuestas");
  const generica = sugerir("Consulta General", "SFS pregunta si se puede entregar en dos partes");
  assert.equal(generica.atajo, null, "varias respuestas y ninguna coincide: no se adivina");
  assert.match(generica.motivo, /varias respuestas posibles/);
  assert.equal(sugerir("Consulta General", "Te mando un audio").atajo, "/Audio", "si el texto coincide, se sugiere");
  const aMano = sugerir("Hito inventado", "Hola");
  assert.equal(aMano.atajo, null);
  assert.equal(aMano.revisar, false);
  assert.match(aMano.motivo, /responder a mano/);
});

test("usa el catalogo que recibe (las hojas de la planilla)", () => {
  const catalogo = [{ comando: "/MiEstado", hito: "Estado de pedido", mensaje: "Texto propio", disparadores: [] }];
  const sugerencia = sugerirRespuesta({ hito: "Estado de pedido", consulta: "?" }, contexto({ catalogo }));
  assert.equal(sugerencia.atajo, "/MiEstado");
  assert.equal(sugerencia.texto, "Texto propio");
});

// --- Paso 2: reglas de contexto -----------------------------------------------------

test("regla 1: cliente REVISAR DEUDORA con pedido -> Revisar antes", () => {
  for (const [hito, texto] of [["Pedido nuevo", "OC 123"], ["Pedido nuevo", "agregar al pedido"], ["Agregar pedido", "10 mas"]]) {
    const sugerencia = sugerir(hito, texto, { estadoCuenta: "REVISAR DEUDORA" });
    assert.equal(sugerencia.revisar, true, hito);
    assert.equal(sugerencia.atajo, null);
    assert.equal(sugerencia.motivo, "Cliente deudor: revisar antes de confirmar el pedido");
    assert.ok(sugerencia.base, "se conserva la respuesta para despues de revisar");
  }
  // Fuera de los pedidos la deuda no bloquea: queda como aviso.
  const precio = sugerir("Consulta precio", "precio de guantes", { estadoCuenta: "REVISAR DEUDORA" });
  assert.equal(precio.revisar, false);
  assert.ok(precio.flags.some((flag) => /deuda/i.test(flag)));
});

test("regla 2: relacion en riesgo -> Revisar antes", () => {
  const sugerencia = sugerir("Estado de pedido", "Es la tercera vez que pregunto", { relacion: "EN_RIESGO" });
  assert.equal(sugerencia.revisar, true);
  assert.equal(sugerencia.motivo, "Relación en riesgo: revisar antes de responder");
  assert.equal(sugerir("Estado de pedido", "x", { relacion: "REGULAR" }).revisar, false, "regular no alcanza");
});

test("regla 3: confianza baja del bot -> Revisar antes (solo si el dato existe)", () => {
  assert.equal(sugerir("Pedido nuevo", "OC", { confianza: 0.4 }).revisar, true);
  assert.match(sugerir("Pedido nuevo", "OC", { confianza: 0.4 }).motivo, /40%/);
  assert.equal(sugerir("Pedido nuevo", "OC", { confianza: REGLAS_SUGERENCIA.confianzaMinima }).revisar, false);
  assert.equal(sugerir("Pedido nuevo", "OC", { confianza: null }).revisar, false, "sin dato no se aplica");
});

test("orden de las reglas: gana la primera que se cumple", () => {
  const todas = { estadoCuenta: "REVISAR DEUDORA", relacion: "EN_RIESGO", confianza: 0.1 };
  assert.match(sugerir("Pedido nuevo", "OC", todas).motivo, /deudor/, "1 antes que 2 y 3");
  assert.match(sugerir("Consulta precio", "precio", todas).motivo, /riesgo/, "sin pedido, 2 antes que 3");
  assert.match(sugerir("Consulta precio", "precio", { relacion: "BUENA", confianza: 0.1 }).motivo, /no está seguro/);
});

// --- Paso 3: avisos -----------------------------------------------------------------

test("mas de 24 h habiles: disculpa por la demora, sin cambiar la respuesta", () => {
  assert.equal(REGLAS_SUGERENCIA.horasParaDisculpa, 24);
  const demorada = sugerir("Pedido nuevo", "OC", { horasHabiles: 25 });
  assert.equal(demorada.atajo, "/PedidoRecibido");
  assert.deepEqual(Array.from(demorada.flags), ["Agregar disculpa por la demora"]);
  assert.equal(sugerir("Pedido nuevo", "OC", { horasHabiles: 24 }).flags.length, 0, "24 h todavia no");
  assert.ok(sugerir("Pedido nuevo", "OC", { horasHabiles: 60, relacion: "EN_RIESGO" }).flags.includes("Agregar disculpa por la demora"), "tambien al revisar");
});
