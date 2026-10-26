import "server-only";
import { guardarCambio, leerCambios } from "@/lib/db/sheets/cambios-locales";
import type { CambioLocal } from "@/lib/db/sheets/cambios-locales";
import { ErrorSheets, escribirRangos, leerRango, letraColumna } from "@/lib/db/sheets/cliente";
import type { FilaSheet } from "@/lib/db/sheets/cliente";
import { armarCatalogo, armarFichas, claveCliente } from "@/lib/db/sheets/maestros";
import { leerHojasPublicas } from "@/lib/db/sheets/publica";
import type { RepositorioSeguimiento } from "@/lib/db/repositorio";
import { huella } from "@/lib/seguimiento/huella";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { CambiosConsulta, Consulta, FichaCliente } from "@/types/seguimiento";

/**
 * Lee la planilla de seguimiento que ya usa el equipo de atencion al cliente.
 *
 * No es una hoja creada por la app: las columnas se ubican por el nombre del
 * encabezado (con alias tolerantes), asi el equipo puede moverlas o agregar
 * otras sin romper nada. La app solo escribe la casilla de respuesta y las
 * observaciones; el resto lo siguen cargando ellos.
 *
 * Cada consulta se completa con la ficha del cliente de las hojas
 * "Desplegable" y "MaestroCliente", y las respuestas sugeridas salen de
 * "Rtas RÁPIDAS" y "Rtas RECLAMO".
 *
 * Con SEGUIMIENTO_ACCESO="publico" la planilla se lee por su link (sin service
 * account) y lo que se marca desde la app queda en un archivo local.
 */

function planilla(): string {
  const valor = process.env.SEGUIMIENTO_SHEETS_ID;
  if (!valor) {
    throw new ErrorSheets(
      "Falta la variable de entorno SEGUIMIENTO_SHEETS_ID. Revisa el .env contra .env.example.",
    );
  }
  return valor;
}

/** Pestana donde esta la tabla. Se lee entera: la fila de encabezados se detecta sola. */
function hoja(): string {
  return process.env.SEGUIMIENTO_HOJA || "Seguimiento";
}

function accesoPublico(): boolean {
  return process.env.SEGUIMIENTO_ACCESO === "publico";
}

/**
 * Primera fila de la planilla que se toma en cuenta. Las anteriores son de
 * cuando la carga no estaba normalizada.
 */
function filaInicio(): number {
  const valor = Number.parseInt(process.env.SEGUIMIENTO_FILA_INICIO ?? "", 10);
  return Number.isFinite(valor) && valor > 1 ? valor : 1;
}

/** "Rtas RÁPIDAS" y "rtas rapidas" son la misma pestana. */
function mismaHoja(a: string, b: string): boolean {
  return normalizarEncabezado(a) === normalizarEncabezado(b);
}

async function leerHoja(nombre: string): Promise<FilaSheet[]> {
  if (accesoPublico()) {
    const hojas = await leerHojasPublicas(planilla());
    const encontrada = Object.keys(hojas).find((titulo) => mismaHoja(titulo, nombre));
    return encontrada ? hojas[encontrada] : [];
  }
  return leerRango(`'${nombre.replace(/'/g, "''")}'`, planilla());
}

/** Las hojas de consulta son opcionales: si falta alguna, se sigue sin ella. */
async function leerHojaOpcional(nombre: string): Promise<FilaSheet[]> {
  try {
    return await leerHoja(nombre);
  } catch {
    return [];
  }
}

// --- Hojas de consulta (fichas y respuestas), con cache corta ---------------

const VIGENCIA_MAESTROS_MS = 5 * 60_000;

type Maestros = {
  fichas: Map<string, FichaCliente>;
  catalogo: RespuestaTipo[];
  leido: number;
};

const almacen = globalThis as typeof globalThis & { __maestrosSeguimiento?: Promise<Maestros> };

async function cargarMaestros(): Promise<Maestros> {
  const [desplegable, maestro, rapidas, reclamos] = await Promise.all([
    leerHojaOpcional("Desplegable"),
    leerHojaOpcional("MaestroCliente"),
    leerHojaOpcional("Rtas RÁPIDAS"),
    leerHojaOpcional("Rtas RECLAMO"),
  ]);
  return {
    fichas: armarFichas(desplegable, maestro),
    catalogo: armarCatalogo(rapidas, reclamos),
    leido: Date.now(),
  };
}

/** Son hojas grandes (miles de clientes) que cambian poco: se releen cada 5 minutos. */
async function maestros(): Promise<Maestros> {
  const previo = await almacen.__maestrosSeguimiento?.catch(() => null);
  if (previo && Date.now() - previo.leido < VIGENCIA_MAESTROS_MS) return previo;
  const pedido = cargarMaestros();
  almacen.__maestrosSeguimiento = pedido;
  return pedido;
}

// --- Hoja de seguimiento -----------------------------------------------------

const ALIAS = {
  fecha: ["fecha", "f", "fecha consulta", "fecha de consulta", "fecha ingreso"],
  encargado: ["encargado", "encargada", "responsable"],
  cliente: ["grupo cliente", "cliente", "razon social"],
  listaPrecio: ["lista de precio", "lista de precios", "lista precio", "lista"],
  clasificacion: ["clasificacion", "calificacion", "categoria", "clasif"],
  grupoVendedor: ["grupo vendedor", "vendedor"],
  estadoCuenta: ["estado", "estado cuenta", "estado de cuenta", "situacion del cliente"],
  grupoWhatsapp: ["grupo whatsapp", "whatsapp", "grupo wsp"],
  linkWhatsapp: ["link grupo whatsapp", "link grupo", "link whatsapp", "link wsp", "link del grupo", "invitacion whatsapp"],
  consulta: ["consulta", "detalle", "detalle consulta"],
  hito: ["hito a responder", "hito"],
  respondida: ["respuesta", "respondida", "respondido", "respuesta enviada"],
  dias: ["d", "demora", "demora de respuesta", "dias", "dias sin respuesta"],
  observaciones: ["observaciones", "observacion", "obs"],
  tentativoRespuesta: [
    "recomendacion de respuesta",
    "recomendacion",
    "respuesta sugerida",
    "tentativo respuesta",
    "tentativo de respuesta",
    "tentativo resp",
    "fecha tentativa",
    "tentativo",
  ],
} as const;

type Campo = keyof typeof ALIAS;
type Columnas = Partial<Record<Campo, number>>;

/** "Grupo / Cliente" -> "grupo cliente". */
function clave(encabezado: string): string {
  return normalizarEncabezado(encabezado).replace(/\s+/g, " ");
}

function ubicarColumnas(encabezados: FilaSheet): Columnas {
  const columnas: Columnas = {};
  const claves = encabezados.map(clave);
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    const alias: readonly string[] = ALIAS[campo];
    // Primero coincidencia exacta; despues "empieza con", para encabezados
    // largos como "Tentativo respuesta cliente".
    let indice = claves.findIndex((texto) => alias.includes(texto));
    if (indice === -1) {
      indice = claves.findIndex((texto) =>
        alias.some((opcion) => opcion.length >= 5 && texto.startsWith(`${opcion} `)),
      );
    }
    if (indice !== -1) columnas[campo] = indice;
  }
  return columnas;
}

/** La tabla puede no arrancar en la fila 1: se busca la primera con "cliente" y "consulta". */
function buscarEncabezados(filas: FilaSheet[]): { indice: number; columnas: Columnas } | null {
  for (let indice = 0; indice < Math.min(filas.length, 15); indice += 1) {
    const columnas = ubicarColumnas(filas[indice]);
    if (columnas.cliente !== undefined && columnas.consulta !== undefined) {
      return { indice, columnas };
    }
  }
  return null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** El serial 0 de Sheets es el 30/12/1899; la planilla esta en hora de Argentina (UTC-3). */
const EPOCA_SHEETS = Date.UTC(1899, 11, 30) + 3 * 60 * 60 * 1000;

function parsearFecha(celda: string): Date | null {
  const texto = celda.trim();
  if (!texto) return null;

  // Con UNFORMATTED_VALUE las fechas llegan como numero de serie.
  if (/^\d+(\.\d+)?$/.test(texto) && Number(texto) > 20000) {
    return new Date(EPOCA_SHEETS + Number(texto) * DIA_MS);
  }
  // Las que quedaron como texto estan escritas como en la configuracion de la
  // planilla (mes/dia/anio, "9/25/2026"). Si un numero pasa de 12 no hay duda.
  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (partes) {
    const [primero, segundo] = [Number(partes[1]), Number(partes[2])];
    const diaPrimero = primero > 12 && segundo <= 12;
    const [dia, mes] = diaPrimero ? [primero, segundo] : [segundo, primero];
    const anio = Number(partes[3]) < 100 ? 2000 + Number(partes[3]) : Number(partes[3]);
    return new Date(Date.UTC(anio, mes - 1, dia, 3));
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function parsearBooleano(celda: string): boolean {
  return ["true", "verdadero", "si", "sí", "x", "1"].includes(celda.trim().toLowerCase());
}

/** "NULL" o "#N/A" que dejan los BUSCARV de la planilla cuentan como vacio. */
function valor(texto: string): string {
  return ["null", "#n/a", "#ref!"].includes(texto.toLowerCase()) ? "" : texto;
}

type ConsultaUbicada = { consulta: Consulta; fila: number };

async function leerTodas(): Promise<{ consultas: ConsultaUbicada[]; columnas: Columnas }> {
  const filas = await leerHoja(hoja());
  const encabezados = buscarEncabezados(filas);
  if (!encabezados) {
    throw new ErrorSheets(
      `No encontre los encabezados de seguimiento (Cliente, Consulta...) en la hoja "${hoja()}".`,
    );
  }

  const { indice: filaEncabezados, columnas } = encabezados;
  const celda = (fila: FilaSheet, campo: Campo): string => {
    const indice = columnas[campo];
    return indice === undefined ? "" : valor((fila[indice] ?? "").trim());
  };

  const consultas: ConsultaUbicada[] = [];
  const vistas = new Map<string, number>();
  const inicio = filaInicio();

  filas.slice(filaEncabezados + 1).forEach((fila, desplazamiento) => {
    const numeroFila = filaEncabezados + desplazamiento + 2;
    const cliente = celda(fila, "cliente");
    const consulta = celda(fila, "consulta");
    // Las filas que solo tienen la casilla sin tildar no son consultas.
    if (!cliente && !consulta) return;

    // Dos filas identicas tendrian la misma huella: se les agrega un contador.
    // Se cuenta tambien antes de la fila de inicio para que el id no dependa de ella.
    const base = huella(`${cliente}|${consulta}|${celda(fila, "fecha")}`);
    const repeticiones = vistas.get(base) ?? 0;
    vistas.set(base, repeticiones + 1);
    if (numeroFila < inicio) return;

    const fecha = parsearFecha(celda(fila, "fecha"));
    // La DEMORA de la planilla es una formula que se recalcula al abrirla; con
    // la fecha la app calcula la demora al dia de hoy.
    const dias = Number.parseFloat(celda(fila, "dias"));
    consultas.push({
      fila: numeroFila,
      consulta: {
        id: repeticiones === 0 ? base : `${base}-${repeticiones}`,
        fecha,
        encargado: celda(fila, "encargado"),
        cliente,
        listaPrecio: celda(fila, "listaPrecio"),
        clasificacion: celda(fila, "clasificacion"),
        grupoVendedor: celda(fila, "grupoVendedor"),
        estadoCuenta: celda(fila, "estadoCuenta"),
        grupoWhatsapp: celda(fila, "grupoWhatsapp"),
        linkWhatsapp: celda(fila, "linkWhatsapp"),
        consulta,
        hito: celda(fila, "hito"),
        respondida: parsearBooleano(celda(fila, "respondida")),
        dias: !fecha && Number.isFinite(dias) ? dias : null,
        observaciones: celda(fila, "observaciones"),
        tentativoRespuesta: celda(fila, "tentativoRespuesta"),
      },
    });
  });

  return { consultas, columnas };
}

/**
 * Suma la ficha del cliente y completa lo que la fila dejo vacio con los
 * datos de "Desplegable" (que es de donde la planilla los trae).
 */
function completarConFicha(consulta: Consulta, fichas: Map<string, FichaCliente>): Consulta {
  const ficha = consulta.cliente ? (fichas.get(claveCliente(consulta.cliente)) ?? null) : null;
  if (!ficha) return { ...consulta, ficha: null };
  return {
    ...consulta,
    listaPrecio: consulta.listaPrecio || ficha.listaPrecio,
    clasificacion: consulta.clasificacion || ficha.clasificacion,
    grupoVendedor: consulta.grupoVendedor || ficha.grupoVendedor,
    estadoCuenta: consulta.estadoCuenta || ficha.situacion,
    grupoWhatsapp: consulta.grupoWhatsapp || ficha.grupoWhatsapp,
    linkWhatsapp: consulta.linkWhatsapp || ficha.linkWhatsapp,
    ficha,
  };
}

async function consultasCompletas(): Promise<Consulta[]> {
  const [{ consultas }, { fichas }, cambios] = await Promise.all([
    leerTodas(),
    maestros(),
    accesoPublico() ? leerCambios() : Promise.resolve<Record<string, CambioLocal>>({}),
  ]);
  return consultas.map(({ consulta }) => {
    const cambio = cambios[consulta.id];
    const conCambios = cambio
      ? {
          ...consulta,
          respondida: cambio.respondida ?? consulta.respondida,
          observaciones: cambio.observaciones ?? consulta.observaciones,
        }
      : consulta;
    return completarConFicha(conCambios, fichas);
  });
}

export async function getAll(): Promise<Consulta[]> {
  return consultasCompletas();
}

/**
 * La planilla tal cual (sin los cambios guardados en la app), para la
 * sincronizacion con Postgres: las consultas con su ficha y todas las fichas
 * de "Desplegable" + "MaestroCliente", tengan o no consultas.
 */
export async function leerPlanilla(): Promise<{ consultas: Consulta[]; fichas: FichaCliente[] }> {
  const [{ consultas }, { fichas }] = await Promise.all([leerTodas(), cargarMaestros()]);
  return {
    consultas: consultas.map(({ consulta }) => completarConFicha(consulta, fichas)),
    fichas: [...fichas.values()],
  };
}

export async function getById(id: string): Promise<Consulta | null> {
  return (await consultasCompletas()).find((consulta) => consulta.id === id) ?? null;
}

export async function getRespuestas(): Promise<RespuestaTipo[]> {
  return (await maestros()).catalogo;
}

export async function update(id: string, cambios: CambiosConsulta): Promise<Consulta> {
  if (accesoPublico()) {
    const consulta = await getById(id);
    if (!consulta) throw new Error("La consulta ya no esta en la planilla (puede que la hayan editado).");
    await guardarCambio(id, cambios);
    return { ...consulta, ...cambios };
  }

  // Se relee justo antes de escribir y se ubica la fila por su huella, asi un
  // reordenamiento de la hoja no hace que se tilde la consulta equivocada.
  const { consultas, columnas } = await leerTodas();
  const ubicada = consultas.find((item) => item.consulta.id === id);
  if (!ubicada) {
    throw new Error("La consulta ya no esta en la planilla (puede que la hayan editado).");
  }

  const escrituras: { rango: string; valores: FilaSheet[] }[] = [];
  const celda = (campo: Campo, valor: string) => {
    const indice = columnas[campo];
    if (indice === undefined) {
      throw new ErrorSheets(`La planilla de seguimiento no tiene la columna "${campo}".`);
    }
    escrituras.push({
      rango: `'${hoja().replace(/'/g, "''")}'!${letraColumna(indice)}${ubicada.fila}`,
      valores: [[valor]],
    });
  };

  if (cambios.respondida !== undefined) celda("respondida", cambios.respondida ? "TRUE" : "FALSE");
  if (cambios.observaciones !== undefined) {
    // Con USER_ENTERED un texto que arranca con "=" se volveria formula; el
    // apostrofe lo fuerza a texto y Sheets no lo muestra.
    const texto = cambios.observaciones;
    celda("observaciones", /^[=+\-@]/.test(texto) ? `'${texto}` : texto);
  }

  await escribirRangos(escrituras, { planilla: planilla(), entrada: "USER_ENTERED" });
  const { fichas } = await maestros();
  return completarConFicha({ ...ubicada.consulta, ...cambios }, fichas);
}

const repositorio: RepositorioSeguimiento = { getAll, getById, update, getRespuestas };

export default repositorio;
