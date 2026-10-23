import "server-only";
import { guardarAdjuntos } from "@/lib/db/adjuntos";
import type { ArchivoAdjunto } from "@/lib/db/adjuntos";
import { reclamosDemo } from "@/lib/db/demo/reclamos";
import { leer, modificar } from "@/lib/db/local/almacen";
import { postgresConfigurado } from "@/lib/db/postgres/pg";
import { backendActivo } from "@/lib/db/repositorio";
import { getAll as getConsultas } from "@/lib/db/seguimiento";
import { esReclamo, estadoCliente, separarCliente } from "@/lib/seguimiento/presentacion";
import {
  CAMPOS_CIERRE,
  type Calidad,
  type EstadoReclamo,
  type Gestion,
  type Indicacion,
  type NuevoReclamo,
  type Reclamo,
  type ReclamoPanel,
} from "@/types/reclamo";
import type { Consulta } from "@/types/seguimiento";

/**
 * Reclamos de clientes: los formularios FOR-03 que llegan por el link publico
 * (o que carga el equipo). Los reclamos que el bot detecta en los grupos de
 * WhatsApp siguen en Seguimiento de clientes, no en este panel.
 *
 * Con RECLAMOS_BACKEND="postgres" viven en las tablas relacionales de
 * db/schema.sql (reclamos, reclamo_productos, lotes, indicaciones...). Si no,
 * en el almacen generico, y con DB_BACKEND="demo" se suman formularios de
 * ejemplo generados en memoria.
 */

/** Tablas relacionales de Postgres o almacen generico. */
export function reclamosEnPostgres(): boolean {
  return process.env.RECLAMOS_BACKEND === "postgres" && postgresConfigurado();
}

const pg = () => import("@/lib/db/postgres/reclamos");

const INDICACIONES = "reclamos-indicaciones";
const FORMULARIOS = "reclamos-formularios";
const PREFIJO_WHATSAPP = "wa-";

// --- Formularios FOR-03 --------------------------------------------------------

function cierreVacio(): Record<string, string | null> {
  return Object.fromEntries(CAMPOS_CIERRE.map((campo) => [campo, null]));
}

function calidadVacia(): Calidad {
  return { clasificacion: null, causa: null, procedente: null, acciones: [] };
}

export function gestionVacia(): Gestion {
  return {
    responsable: "",
    severidad: null,
    tipoEpp: null,
    canalIngreso: null,
    deposito: "",
    transportista: "",
    motivoLogistico: null,
    diasDemora: null,
    montoNotaCredito: null,
    numeroNotaCredito: "",
    costoAdicional: null,
    cerrado: false,
  };
}

const memoria = globalThis as typeof globalThis & { reclamosDemoV2?: Reclamo[] };

/** Los de ejemplo solo existen en la demo; los guardados (nuevos o editados) pisan a los de ejemplo. */
async function formularios(): Promise<Reclamo[]> {
  if (reclamosEnPostgres()) return (await pg()).listar();
  const guardados = await leer<Reclamo>(FORMULARIOS);
  const demo = backendActivo() === "demo" ? (memoria.reclamosDemoV2 ??= reclamosDemo()) : [];
  const porId = new Map<string, Reclamo>();
  for (const reclamo of [...demo, ...Object.values(guardados)]) {
    // Los guardados antes de sumar campos nuevos no los traen.
    porId.set(reclamo.id, {
      ...reclamo,
      canal: reclamo.canal ?? "intranet",
      adjuntos: reclamo.adjuntos ?? [],
      consultaId: reclamo.consultaId ?? null,
      productos: reclamo.productos.map((producto) => ({ ...producto, lote: producto.lote ?? "" })),
      gestion: { ...gestionVacia(), ...reclamo.gestion },
      resueltoEn: reclamo.resueltoEn ?? null,
      cerradoEn: reclamo.cerradoEn ?? null,
    });
  }
  return [...porId.values()];
}

async function guardarFormulario(reclamo: Reclamo): Promise<void> {
  await modificar<Reclamo, void>(FORMULARIOS, (guardados) => {
    guardados[reclamo.id] = reclamo;
  });
}

/** REC-0007: sigue la numeracion mas alta existente. */
function siguienteNumero(existentes: readonly Reclamo[]): string {
  const maximo = Math.max(0, ...existentes.map((reclamo) => Number(reclamo.id.replace(/\D/g, "")) || 0));
  return `REC-${String(maximo + 1).padStart(4, "0")}`;
}

export type { ArchivoAdjunto } from "@/lib/db/adjuntos";

/**
 * Da de alta un formulario con sus adjuntos y devuelve el numero asignado.
 * `canal` dice quien lo cargo: el equipo desde la intranet o el cliente desde
 * el link publico.
 */
export async function crearFormulario(
  datos: NuevoReclamo,
  archivos: ArchivoAdjunto[],
  canal: Reclamo["canal"] = "intranet",
): Promise<Reclamo> {
  if (reclamosEnPostgres()) {
    const base = await pg();
    const reclamo = await base.crear(datos, canal);
    if (archivos.length === 0) return reclamo;
    const adjuntos = await guardarAdjuntos(archivos, `reclamo:${reclamo.id}`);
    await base.guardarAdjuntos(reclamo.id, adjuntos);
    return { ...reclamo, adjuntos };
  }
  const base: Omit<Reclamo, "id" | "adjuntos"> = {
    ...datos,
    canal,
    calidad: calidadVacia(),
    cierre: cierreVacio(),
    indicacion: null,
    gestion: { ...gestionVacia(), canalIngreso: canal === "cliente" ? "PORTAL" : null },
    resueltoEn: null,
    cerradoEn: null,
  };
  // El numero se asigna dentro de la escritura: dos formularios a la vez no se pisan.
  const demo = backendActivo() === "demo" ? (memoria.reclamosDemoV2 ??= reclamosDemo()) : [];
  const reclamo = await modificar<Reclamo, Reclamo>(FORMULARIOS, (guardados) => {
    const id = siguienteNumero([...demo, ...Object.values(guardados)]);
    const nuevo: Reclamo = { ...base, id, adjuntos: [] };
    guardados[id] = nuevo;
    return nuevo;
  });
  if (archivos.length === 0) return reclamo;
  const conAdjuntos = { ...reclamo, adjuntos: await guardarAdjuntos(archivos, `reclamo:${reclamo.id}`) };
  await guardarFormulario(conAdjuntos);
  return conAdjuntos;
}

/**
 * Guarda la parte del Asegurador de Calidad y el cierre. La primera vez que
 * se carga la respuesta al cliente queda registrado cuando se resolvio.
 */
export async function actualizarCalidad(
  id: string,
  calidad: Calidad,
  cierre: Record<string, string | null>,
): Promise<Reclamo | null> {
  if (reclamosEnPostgres()) return (await pg()).actualizarCalidad(id, calidad, cierre);
  const actual = (await formularios()).find((reclamo) => reclamo.id === id);
  if (!actual) return null;
  const respondido = Boolean(cierre["Respuesta al cliente"]?.trim());
  const actualizado: Reclamo = {
    ...actual,
    calidad,
    cierre: { ...cierreVacio(), ...cierre },
    resueltoEn: respondido ? (actual.resueltoEn ?? new Date().toISOString()) : null,
  };
  await guardarFormulario(actualizado);
  return actualizado;
}

/** Datos de gestion para el informe (responsable, severidad, montos, cierre). */
export async function actualizarGestion(id: string, gestion: Gestion): Promise<Reclamo | null> {
  if (reclamosEnPostgres()) return (await pg()).actualizarGestion(id, gestion);
  const actual = (await formularios()).find((reclamo) => reclamo.id === id);
  if (!actual) return null;
  const actualizado: Reclamo = {
    ...actual,
    gestion,
    cerradoEn: gestion.cerrado ? (actual.cerradoEn ?? new Date().toISOString()) : null,
  };
  await guardarFormulario(actualizado);
  return actualizado;
}

// --- Indicaciones del gerente ------------------------------------------------

export async function getIndicaciones(): Promise<Record<string, Indicacion>> {
  if (reclamosEnPostgres()) return (await pg()).indicaciones();
  return leer<Indicacion>(INDICACIONES);
}

export function idWhatsapp(consultaId: string): string {
  return `${PREFIJO_WHATSAPP}${consultaId}`;
}

/**
 * Donde vive la indicacion de un formulario: si se cargo desde un reclamo de
 * WhatsApp, comparte la del chat (es el mismo reclamo y se ve en el seguimiento).
 */
function claveIndicacion(reclamo: Reclamo): string {
  return reclamo.consultaId ? idWhatsapp(reclamo.consultaId) : reclamo.id;
}

/** Indicacion guardada, o la que trae el formulario (los de ejemplo). */
function indicacionDe(reclamo: Reclamo, indicaciones: Record<string, Indicacion>): Indicacion | null {
  return indicaciones[claveIndicacion(reclamo)] ?? reclamo.indicacion ?? null;
}

/** Guarda la indicacion si el reclamo existe; null si no se encontro. */
export async function guardarIndicacion(id: string, indicacion: Omit<Indicacion, "fecha">): Promise<Indicacion | null> {
  let clave: string | null = null;
  if (id.startsWith(PREFIJO_WHATSAPP)) {
    const existe = (await getConsultas()).some((consulta) => idWhatsapp(consulta.id) === id && esReclamo(consulta));
    if (existe) clave = id;
  } else {
    const formulario = (await formularios()).find((reclamo) => reclamo.id === id);
    if (formulario) clave = claveIndicacion(formulario);
  }
  if (!clave) return null;

  const completa: Indicacion = { ...indicacion, fecha: new Date().toISOString() };
  if (reclamosEnPostgres()) {
    await (await pg()).guardarIndicacion(clave, completa);
    return completa;
  }
  const destino = clave;
  await modificar<Indicacion, void>(INDICACIONES, (datos) => {
    datos[destino] = completa;
  });
  return completa;
}

// --- Lectura ----------------------------------------------------------------

export async function getFormulario(id: string): Promise<Reclamo | null> {
  const reclamo = (await formularios()).find((item) => item.id === id);
  if (!reclamo) return null;
  const indicaciones = await getIndicaciones();
  return { ...structuredClone(reclamo), indicacion: indicacionDe(reclamo, indicaciones) };
}

/** Todos los formularios con su indicacion (para el informe). */
export async function getReclamos(): Promise<Reclamo[]> {
  const [todos, indicaciones] = await Promise.all([formularios(), getIndicaciones()]);
  return todos.map((reclamo) => ({ ...reclamo, indicacion: indicacionDe(reclamo, indicaciones) }));
}

/** El formulario que se cargo a partir de un reclamo de WhatsApp, si ya existe. */
export async function formularioDeConsulta(consultaId: string): Promise<string | null> {
  return (await formularios()).find((reclamo) => reclamo.consultaId === consultaId)?.id ?? null;
}

function estado(indicacion: Indicacion | null, respondido: boolean): EstadoReclamo {
  if (respondido) return "RESUELTO";
  return indicacion ? "EN_GESTION" : "SIN_DEFINIR";
}

function desdeFormulario(
  reclamo: Reclamo,
  indicacion: Indicacion | null,
  cliente: DatosCliente | undefined,
  ahora: Date,
): ReclamoPanel {
  const fecha = new Date(`${reclamo.fecha}T12:00:00-03:00`);
  // Con la respuesta al cliente cargada (o cerrado) el reclamo se considera respondido.
  const respondido = Boolean(reclamo.cierre["Respuesta al cliente"]?.trim()) || reclamo.gestion.cerrado;
  return {
    id: reclamo.id,
    fecha: fecha.toISOString(),
    cliente: reclamo.razonSocial,
    codigo: reclamo.numeroCliente,
    clasificacionCliente: cliente?.clasificacion ?? "",
    detalle: reclamo.detalle,
    tipo: reclamo.calidad.clasificacion ?? reclamo.clasificacion,
    delCliente: reclamo.canal === "cliente",
    encargado: reclamo.contacto,
    grupoWhatsapp: cliente?.grupoWhatsapp ?? "",
    linkWhatsapp: cliente?.linkWhatsapp ?? "",
    grupoVendedor: cliente?.grupoVendedor ?? "",
    estadoCliente: cliente?.estado ?? [],
    respondido,
    dias: respondido ? null : Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000)),
    indicacion,
    estado: estado(indicacion, respondido),
    responsable: reclamo.gestion.responsable,
  };
}

const ORDEN_ESTADO: Record<EstadoReclamo, number> = { SIN_DEFINIR: 0, EN_GESTION: 1, RESUELTO: 2 };

/** Lo que se sabe de un cliente por la planilla de seguimiento (para los formularios). */
export type DatosCliente = {
  clasificacion: string;
  estado: string[];
  grupoWhatsapp: string;
  linkWhatsapp: string;
  grupoVendedor: string;
};

function clientesPorCodigo(consultas: readonly Consulta[]): Map<string, DatosCliente> {
  const clientes = new Map<string, DatosCliente>();
  for (const consulta of consultas) {
    const { codigo } = separarCliente(consulta.cliente);
    if (!codigo || clientes.has(codigo)) continue;
    clientes.set(codigo, {
      clasificacion: (consulta.clasificacion || consulta.ficha?.clasificacion || "").toUpperCase(),
      estado: estadoCliente(consulta),
      grupoWhatsapp: consulta.grupoWhatsapp || consulta.ficha?.grupoWhatsapp || "",
      linkWhatsapp: consulta.linkWhatsapp || consulta.ficha?.linkWhatsapp || "",
      grupoVendedor: consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, ""),
    });
  }
  return clientes;
}

/** Datos del cliente por su N° (para avisar de un formulario nuevo). Null si no figura. */
export async function datosDeCliente(numeroCliente: string): Promise<DatosCliente | null> {
  const codigo = numeroCliente.replace(/\D/g, "");
  if (!codigo) return null;
  const consultas = await getConsultas().catch(() => []);
  return clientesPorCodigo(consultas).get(codigo) ?? null;
}

export type PanelReclamos = {
  reclamos: ReclamoPanel[];
  /** Si la planilla de clientes no se pudo leer (clasificacion, estado de cuenta), por que. */
  error: string | null;
};

/**
 * Los formularios de reclamo, primero los que esperan a la gerencia y dentro
 * de cada estado los que llevan mas dias. La clasificacion, el estado de
 * cuenta y el grupo del cliente salen de la planilla de seguimiento.
 */
export async function getPanel(ahora = new Date()): Promise<PanelReclamos> {
  const [indicaciones, todosFormularios] = await Promise.all([getIndicaciones(), formularios()]);
  let consultas: Consulta[] = [];
  let error: string | null = null;
  try {
    consultas = await getConsultas();
  } catch (causa) {
    error = causa instanceof Error ? causa.message : String(causa);
  }
  const clientes = clientesPorCodigo(consultas);

  const reclamos = todosFormularios
    .map((reclamo) =>
      desdeFormulario(
        reclamo,
        indicacionDe(reclamo, indicaciones),
        clientes.get(reclamo.numeroCliente.replace(/\D/g, "")),
        ahora,
      ),
    )
    .sort(
      (a, b) =>
        ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
        (b.dias ?? -1) - (a.dias ?? -1) ||
        (b.fecha ?? "").localeCompare(a.fecha ?? ""),
    );
  return { reclamos, error };
}
