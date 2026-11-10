import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Ejecuta el adaptador real con Sheets y las escrituras sustituidos por fuentes controladas.
function adaptador(filas, errorLectura, { hojas = {}, entorno = {} } = {}) {
  const escrituras = [];
  const lecturas = [];
  const datos = { Seguimiento: filas, MaestroCliente: [["CLIENTE"]], Desplegable: [["CLIENTE"]], ...hojas };
  const env = { SEGUIMIENTO_SHEETS_ID: "prueba", SEGUIMIENTO_HOJA: "Seguimiento", ...entorno };
  const cache = new Map();
  class ErrorSheets extends Error {}
  const mocks = {
    "server-only": {},
    // React.cache memoriza por pedido; fuera de React se usa la funcion tal cual.
    react: { cache: (funcion) => funcion },
    "next/server": { after: () => {} },
    "@/lib/db/sheets/cliente": {
      ErrorSheets,
      leerRango: async (rango, planilla) => {
        if (errorLectura) throw errorLectura;
        lecturas.push({ rango, planilla });
        return datos[rango.slice(1, -1).replace(/''/g, "'")] ?? [];
      },
      escribirRangos: async (rangos) => escrituras.push(...rangos),
      letraColumna: (indice) => String.fromCharCode(65 + indice),
    },
    "@/lib/db/sheets/cambios-locales": { leerCambios: async () => ({}), guardarCambio: async () => {} },
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
      process: { env },
      console, globalThis: {}, Date, Map, Set,
    }, { filename: archivo });
    cache.set(nombre, modulo.exports);
    return modulo.exports;
  }
  mocks["@/lib/db/sheets/publica"] = { leerHojasPublicas: async () => datos };
  return { repo: cargar("@/lib/db/sheets/seguimiento"), escrituras, lecturas, env };
}

test("integra el encabezado grillo, fechas mixtas y casillas de la planilla modificada", async () => {
  const { repo } = adaptador([
    ["Fecha de consulta", "Columna 2", "Encargado", "grillo", "Clasificacion Venta", "Consulta", "RESPUESTA", "OBSERVACIÓN"],
    ["9/25/2026", "", "bot", "100 - Cliente de prueba", "C", "Consulta de stock", "TRUE", "Nota"],
    ["46255", "", "", "101 - Otro cliente", "B", "Pedido", "FALSE"],
  ], undefined, { hojas: { Desplegable: [["CLIENTE"], ["100 - Cliente de prueba"], ["101 - Otro cliente"]] } });
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

test("una fila cargada sin fecha toma la de la fila anterior y conserva su id", async () => {
  const filas = [
    ["Fecha de consulta", "grillo", "Consulta", "RESPUESTA"],
    ["9/3/2026", "100 - Cliente", "Primera", "TRUE"],
    ["", "101 - Otro", "Sin fecha", "TRUE"],
    ["9/7/2026", "102 - Tercero", "Con fecha", "FALSE"],
  ];
  const consultas = await adaptador(filas).repo.getAll();
  assert.equal(consultas[1].fecha.toISOString(), "2026-09-03T03:00:00.000Z");
  assert.equal(consultas[2].fecha.toISOString(), "2026-09-07T03:00:00.000Z");
  // El id sale de la celda original (vacia): no cambia por heredar la fecha.
  const otra = await adaptador([filas[0], filas[2]]).repo.getAll();
  assert.equal(otra[0].fecha, null);
  assert.equal(otra[0].id, consultas[1].id);
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

const desplegable = [
  ["CLIENTE", "LISTAPRECIO", "CLA_VTA", "Limite de credito disponible ", "Grupo Vendedor", "Grupo Whatsapp", "Grp Wsp 2", "SITUACION DEL CLIENTE", "OBSERVACIÓN"],
  ["100 - FERRETERÍA DEL SUR", "D05W", "A", "FILTRO GRUPO SUR", "", "DP - VT SUR 🔧", "DP - VT SUR ADMIN", "TIENE DEUDA", "Revisar pagos"],
  ["200 - CLIENTE SIN CONSULTAS", "D03W", "B", "", "FILTRO GRUPO NORTE", "DP - VT NORTE", "", "OK"],
];

test("la ficha sin consultas unifica todos los campos por código con columnas reordenadas", async () => {
  const { repo } = adaptador([["grillo", "Consulta"]], undefined, { hojas: {
    Desplegable: [
      ["Grupo Whatsapp", "Clientes", "Clasificación de ventas", "Lista de precios", "Situación", "Observación"],
      ["Grupo comercial", "200 - CLIENTE SIN CONSULTAS", "B", "D03W", "OK", "Observación inicial"],
    ],
    MaestroCliente: [
      ["LÍMITE DE CRÉDITO", "CLIENTE", "ACTIVIDAD", "CATERGORIA ACT", "COND. DE PAGO", "DEUDA"],
      ["Hasta USD 1000", "200 - Razón social anterior", "Industria", "Fabricante", "CHQ 30 DIAS", "REVISAR DEUDORA"],
    ],
  } });
  const ficha = await repo.fichaDeCliente("200");
  assert.equal(ficha.nombre, "CLIENTE SIN CONSULTAS");
  for (const [campo, esperado] of Object.entries({
    actividad: "Industria", categoria: "Fabricante", condicionPago: "CHQ 30 DIAS", limiteCredito: "Hasta USD 1000",
    listaPrecio: "D03W", clasificacion: "B", grupoWhatsapp: "Grupo comercial",
    situacion: "REVISAR DEUDORA", deuda: "REVISAR DEUDORA", observacion: "Observación inicial",
  })) assert.equal(ficha[campo], esperado, campo);
  assert.equal((await repo.fichaDeCliente("cliente sin consultas")).codigo, "200");
  assert.equal((await repo.leerPlanilla()).fichas.length, 1);
  assert.equal((await repo.getAll()).length, 0);
});

test("sincronizar exige las dos hojas maestras válidas antes de reemplazar clientes", async () => {
  for (const MaestroCliente of [[], [["Formato desconocido"]]]) {
    const { repo } = adaptador([["grillo", "Consulta"]], undefined, { hojas: { Desplegable: desplegable, MaestroCliente } });
    await assert.rejects(repo.leerPlanilla(), /Se conservan los clientes existentes/);
  }
});

test("un nombre vacío en Desplegable se completa desde MaestroCliente sin perder código ni clasificación N", async () => {
  const { repo } = adaptador([["grillo", "Consulta"]], undefined, { hojas: {
    Desplegable: [["CLIENTE", "CLA_VTA"], ["1780 -", "N"]],
    MaestroCliente: [["CLIENTE", "ACTIVIDAD"], ["1780 - NOMBRE COMPLETO", "Industria"]],
  } });
  const ficha = await repo.fichaDeCliente("1780");
  assert.equal(ficha.codigo, "1780");
  assert.equal(ficha.nombre, "NOMBRE COMPLETO");
  assert.equal(ficha.clasificacion, "N");
  assert.equal((await repo.leerPlanilla()).fichas.length, 1);
});

test("Desplegable aporta los datos comerciales actuales y MaestroCliente los complementa", async () => {
  const { repo } = adaptador([
    ["grillo", "Consulta", "Lista de precio", "Clasificacion Venta", "Grupo Vendedor", "ESTADO"],
    ["100 - Nombre anterior", "Necesito stock", "D01W", "C", "Vendedor anterior", "OK"],
  ], undefined, { hojas: {
    Desplegable: desplegable,
    MaestroCliente: [["CLIENTE", "ACTIVIDAD", "COND DE PAGO", "DEUDA"], ["100 - Otro nombre", "Ferreteria", "Cuenta corriente", "REVISAR DEUDORA"]],
  } });
  const [consulta] = await repo.getAll();
  assert.equal(consulta.cliente, "100 - FERRETERÍA DEL SUR");
  assert.equal(consulta.listaPrecio, "D05W");
  assert.equal(consulta.clasificacion, "A");
  assert.equal(consulta.grupoVendedor, "FILTRO GRUPO SUR");
  assert.equal(consulta.estadoCuenta, "TIENE DEUDA · REVISAR DEUDORA");
  assert.equal(consulta.grupoWhatsapp, "DP - VT SUR 🔧");
  assert.equal(consulta.ficha.observacion, "Revisar pagos");
  assert.equal(consulta.ficha.actividad, "Ferreteria");
  assert.equal(consulta.ficha.deuda, consulta.ficha.situacion);
  const planilla = await repo.leerPlanilla();
  assert.equal(planilla.fichas.length, 2);
  assert.equal(planilla.fichas.find((ficha) => ficha.codigo === "200").nombre, "CLIENTE SIN CONSULTAS");
});

test("vincula por codigo, nombre o los dos grupos de WhatsApp sin perder el grupo de origen", async () => {
  const { repo } = adaptador([
    ["grillo", "Consulta", "Grupo Whatsapp"],
    ["100", "Por codigo"],
    ["ferreteria del sur", "Por nombre"],
    ["", "Por grupo principal", "dp - vt sur 🔧"],
    ["#N/A", "Por segundo grupo", "DP - VT SUR ADMIN"],
    ["DP - VT SUR ADMIN", "Grupo en la columna cliente"],
    ["", "[SIN MATCH] Grupo DP - VT SUR ADMIN: Solicita factura"],
  ], undefined, { hojas: { Desplegable: desplegable } });
  const consultas = await repo.getAll();
  assert.equal(consultas.length, 6);
  for (const consulta of consultas) {
    assert.equal(consulta.cliente, "100 - FERRETERÍA DEL SUR");
    assert.equal(consulta.ficha.codigo, "100");
    assert.equal(consulta.clasificacion, "A");
  }
  assert.equal(consultas[2].grupoWhatsapp, "dp - vt sur 🔧");
  assert.equal(consultas[3].grupoWhatsapp, "DP - VT SUR ADMIN");
  assert.equal(consultas[4].grupoWhatsapp, "DP - VT SUR ADMIN");
  assert.equal(consultas[5].grupoWhatsapp, "DP - VT SUR ADMIN");
});

test("los casos sin match muestran Otros y el grupo, conservan el mensaje y se pueden actualizar", async () => {
  const filas = [
    ["grillo", "Consulta", "Grupo Whatsapp", "RESPUESTA"],
    ["#N/A", "[SIN MATCH] Grupo DP - VT - NUEVO: Solicita cotizacion", "", "FALSE"],
    ["", "DP - VT IMCOFUE (TF) - ELI : solicita factura", "", "FALSE"],
    ["No es cliente", "Necesito ayuda", "Grupo de otro cliente", "FALSE"],
    ["999 - No registrado", "Consulta sin grupo", "", "FALSE"],
    ["", "Consulta sin datos", "", "FALSE"],
  ];
  const { repo, escrituras } = adaptador(filas, undefined, { hojas: { Desplegable: [
    ...desplegable, ["No es cliente", "-", "-"], ["#N/A"], ["NULL"],
  ] } });
  const consultas = await repo.getAll();
  assert.equal(consultas.length, 5);
  assert.equal(consultas[0].cliente, "Otros · DP - VT - NUEVO");
  assert.equal(consultas[0].grupoWhatsapp, "DP - VT - NUEVO");
  assert.equal(consultas[1].cliente, "Otros · DP - VT IMCOFUE (TF) - ELI");
  assert.equal(consultas[1].grupoWhatsapp, "DP - VT IMCOFUE (TF) - ELI");
  assert.equal(consultas[2].cliente, "Otros · Grupo de otro cliente");
  assert.equal(consultas[3].cliente, "Otros · 999 - No registrado");
  assert.equal(consultas[4].cliente, "Otros");
  for (const consulta of consultas) {
    assert.equal(consulta.clasificacion, "Otros");
    assert.equal(consulta.ficha, null);
  }
  assert.equal(consultas[0].consulta, filas[1][1]);
  assert.equal((await repo.getById(consultas[0].id)).grupoWhatsapp, "DP - VT - NUEVO");
  const actualizada = await repo.update(consultas[1].id, { respondida: true });
  assert.equal(actualizada.cliente, consultas[1].cliente);
  assert.equal(actualizada.id, consultas[1].id);
  assert.equal(escrituras[0].rango, "'Seguimiento'!D3");
  assert.equal((await repo.leerPlanilla()).consultas[0].cliente, consultas[0].cliente);
});

test("no asigna grupos ambiguos y distingue los emojis de cada grupo", async () => {
  const { repo } = adaptador([
    ["grillo", "Consulta", "Grupo Whatsapp"],
    ["", "Grupo compartido", "Grupo comun"],
    ["", "Grupo con herramienta", "DP - VT SUR 🔧"],
    ["", "Grupo con edificio", "DP - VT SUR 🏭"],
    ["100 - FERRETERÍA DEL SUR", "El codigo resuelve el grupo compartido", "Grupo comun"],
  ], undefined, { hojas: { Desplegable: [
    ["CLIENTE", "Grupo Whatsapp", "Grp Wsp 2"],
    ["100 - FERRETERÍA DEL SUR", "DP - VT SUR 🔧", "Grupo comun"],
    ["200 - OTRO CLIENTE", "DP - VT SUR 🏭", "Grupo comun"],
  ] } });
  const consultas = await repo.getAll();
  assert.equal(consultas[0].cliente, "Otros · Grupo comun");
  assert.equal(consultas[0].ficha, null);
  assert.equal(consultas[1].ficha.codigo, "100");
  assert.equal(consultas[2].ficha.codigo, "200");
  assert.equal(consultas[3].ficha.codigo, "100");
});

test("la lectura publica y la API usan la planilla configurada y renuevan su cache al cambiarla", async () => {
  const filas = [["grillo", "Consulta"], ["100", "Consulta"]];
  const { repo, lecturas, env } = adaptador(filas, undefined, { hojas: { Desplegable: desplegable } });
  const [anterior] = await repo.getAll();
  assert.equal(anterior.ficha.codigo, "100");
  assert.ok(lecturas.some((lectura) => lectura.rango === "'Desplegable'" && lectura.planilla === "prueba"));
  env.SEGUIMIENTO_SHEETS_ID = "otra-planilla";
  await repo.getAll();
  assert.ok(lecturas.some((lectura) => lectura.rango === "'Desplegable'" && lectura.planilla === "otra-planilla"));
  env.SEGUIMIENTO_ACCESO = "publico";
  const [publica] = await repo.getAll();
  assert.equal(publica.cliente, anterior.cliente);
  assert.equal(publica.id, anterior.id);
});
