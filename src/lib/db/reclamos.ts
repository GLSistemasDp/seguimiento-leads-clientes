import "server-only";
import { guardarAdjuntos } from "@/lib/db/adjuntos";
import type { ArchivoAdjunto } from "@/lib/db/adjuntos";
import { leer, modificar } from "@/lib/db/local/almacen";
import { backendActivo } from "@/lib/db/repositorio";
import { getAll as getConsultas } from "@/lib/db/seguimiento";
import { PRODUCTOS_DEMO } from "@/lib/reclamos/catalogo";
import { diasAbierta, esReclamo, separarCliente } from "@/lib/seguimiento/presentacion";
import {
  CAMPOS_CIERRE,
  CLASIFICACIONES,
  type Calidad,
  type EstadoReclamo,
  type Indicacion,
  type NuevoReclamo,
  type Reclamo,
  type ReclamoPanel,
} from "@/types/reclamo";
import type { Consulta } from "@/types/seguimiento";

/**
 * Panel de reclamos para gerencia. Junta dos fuentes:
 * - los reclamos que el bot detecta en los grupos de WhatsApp (hito "Reclamo"
 *   de la planilla de seguimiento), que hoy se reenvian por Telegram;
 * - los formularios FOR-03 cargados desde la app (y, con DB_BACKEND="demo",
 *   seis formularios de ejemplo).
 *
 * Formularios, adjuntos e indicaciones del gerente se guardan en `.data/`.
 */

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

function ejemplos(): Reclamo[] {
  return CLASIFICACIONES.map((clasificacion, i) => ({
    id: `REC-${String(i + 1).padStart(4, "0")}`,
    fecha: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    razonSocial: ["Distribuidora del Sur", "Seguridad Industrial Norte", "Ferretería Central", "Suministros del Oeste", "Protección Integral", "Insumos del Litoral"][i],
    numeroCliente: `CLI-${1200 + i}`, sucursal: "Casa central", transporte: "Transporte de ejemplo",
    contacto: ["Lucía Pérez", "Martín López", "Ana García", "Diego Ruiz", "Carolina Díaz", "Pablo Torres"][i],
    cargo: "Compras", telefono: "011 0000-0000", email: `compras${i + 1}@example.com`,
    ordenCompra: `OC-${800 + i}`, pedido: `PED-${2400 + i}`, factura: `0001-${String(4200 + i).padStart(8, "0")}`, remito: `R-${3100 + i}`,
    clasificacion,
    detalle: [
      "La factura incluye unidades que no corresponden al pedido. Solicitamos revisar el comprobante.",
      "El pedido no llegó en la fecha acordada. Necesitamos confirmar una nueva fecha de entrega.",
      "El precio facturado difiere del acordado en la orden de compra.",
      "Seleccionamos un modelo incorrecto al realizar el pedido. Consultamos por una alternativa.",
      "Detectamos fallas en la terminación de parte de los productos recibidos.",
      "Recibimos menos unidades que las indicadas en el remito. Solicitamos el envío de las faltantes.",
    ][i],
    productos: [{ codigo: PRODUCTOS_DEMO[i].id, descripcion: PRODUCTOS_DEMO[i].nombre, cantidadFacturada: 50, cantidadReclamo: 10 }],
    canal: "intranet",
    adjuntos: [],
    calidad: calidadVacia(),
    cierre: cierreVacio(),
    indicacion: null,
    consultaId: null,
  }));
}

const memoria = globalThis as typeof globalThis & { reclamosDemo?: Reclamo[] };

/** Los de ejemplo solo existen en la demo; los guardados (nuevos o editados) pisan a los de ejemplo. */
async function formularios(): Promise<Reclamo[]> {
  const guardados = await leer<Reclamo>(FORMULARIOS);
  const demo = backendActivo() === "demo" ? (memoria.reclamosDemo ??= ejemplos()) : [];
  const porId = new Map<string, Reclamo>();
  for (const reclamo of [...demo, ...Object.values(guardados)]) {
    // Los creados antes de sumar adjuntos/consulta no traen esos campos.
    porId.set(reclamo.id, {
      ...reclamo,
      canal: reclamo.canal ?? "intranet",
      adjuntos: reclamo.adjuntos ?? [],
      consultaId: reclamo.consultaId ?? null,
    });
  }
  return [...porId.values()];
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
  const existentes = await formularios();
  const id = siguienteNumero(existentes);
  const adjuntos = await guardarAdjuntos(archivos, `reclamo:${id}`);
  const reclamo: Reclamo = {
    ...datos,
    id,
    canal,
    adjuntos,
    calidad: calidadVacia(),
    cierre: cierreVacio(),
    indicacion: null,
  };
  await modificar<Reclamo, void>(FORMULARIOS, (guardados) => {
    guardados[id] = reclamo;
  });
  return reclamo;
}

/** Guarda la parte del Asegurador de Calidad y el cierre. */
export async function actualizarCalidad(
  id: string,
  calidad: Calidad,
  cierre: Record<string, string | null>,
): Promise<Reclamo | null> {
  const actual = (await formularios()).find((reclamo) => reclamo.id === id);
  if (!actual) return null;
  const actualizado: Reclamo = { ...actual, calidad, cierre: { ...cierreVacio(), ...cierre } };
  await modificar<Reclamo, void>(FORMULARIOS, (guardados) => {
    guardados[id] = actualizado;
  });
  return actualizado;
}

// --- Indicaciones del gerente ------------------------------------------------

export async function getIndicaciones(): Promise<Record<string, Indicacion>> {
  return leer<Indicacion>(INDICACIONES);
}

export function idWhatsapp(consultaId: string): string {
  return `${PREFIJO_WHATSAPP}${consultaId}`;
}

/**
 * Donde vive la indicacion de un formulario: si se cargo desde un reclamo de
 * WhatsApp, comparte la del chat (es el mismo reclamo).
 */
function claveIndicacion(reclamo: Reclamo): string {
  return reclamo.consultaId ? idWhatsapp(reclamo.consultaId) : reclamo.id;
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
  return { ...structuredClone(reclamo), indicacion: indicaciones[claveIndicacion(reclamo)] ?? null };
}

/** El formulario que se cargo a partir de un reclamo de WhatsApp, si ya existe. */
export async function formularioDeConsulta(consultaId: string): Promise<string | null> {
  return (await formularios()).find((reclamo) => reclamo.consultaId === consultaId)?.id ?? null;
}

/** Situacion de la cuenta + marca de deuda, como figuran en el maestro. */
function estadoClienteDe(consulta: Consulta): string[] {
  const estados: string[] = [];
  const situacion = (consulta.ficha?.situacion || consulta.estadoCuenta).trim().toUpperCase();
  if (situacion) estados.push(situacion);
  const deuda = consulta.ficha?.deuda?.trim().toUpperCase();
  if (deuda && !estados.includes(deuda)) estados.push(deuda);
  return estados;
}

function estado(indicacion: Indicacion | null, respondido: boolean): EstadoReclamo {
  if (respondido) return "RESUELTO";
  return indicacion ? "EN_GESTION" : "SIN_DEFINIR";
}

function desdeConsulta(
  consulta: Consulta,
  indicacion: Indicacion | null,
  formulario: string | null,
  ahora: Date,
): ReclamoPanel {
  const { codigo, nombre } = separarCliente(consulta.cliente);
  return {
    id: idWhatsapp(consulta.id),
    origen: "whatsapp",
    fecha: consulta.fecha ? consulta.fecha.toISOString() : null,
    cliente: nombre,
    codigo,
    clasificacionCliente: (consulta.clasificacion || consulta.ficha?.clasificacion || "").toUpperCase(),
    detalle: consulta.consulta,
    tipo: "WhatsApp",
    encargado: consulta.encargado,
    grupoWhatsapp: consulta.grupoWhatsapp,
    grupoVendedor: consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, ""),
    estadoCliente: estadoClienteDe(consulta),
    respondido: consulta.respondida,
    dias: consulta.respondida ? null : diasAbierta(consulta, ahora),
    observaciones: consulta.observaciones,
    indicacion,
    estado: estado(indicacion, consulta.respondida),
    formulario,
    consultaId: consulta.id,
  };
}

function desdeFormulario(
  reclamo: Reclamo,
  indicacion: Indicacion | null,
  cliente: { clasificacion: string; estado: string[] } | undefined,
  ahora: Date,
): ReclamoPanel {
  const fecha = new Date(`${reclamo.fecha}T12:00:00-03:00`);
  // Con el cierre completo (respuesta al cliente) el reclamo se considera respondido.
  const respondido = Boolean(reclamo.cierre["Respuesta al cliente"]?.trim());
  return {
    id: reclamo.id,
    origen: "formulario",
    fecha: fecha.toISOString(),
    cliente: reclamo.razonSocial,
    codigo: reclamo.numeroCliente,
    clasificacionCliente: cliente?.clasificacion ?? "",
    detalle: reclamo.detalle,
    tipo: reclamo.canal === "cliente" ? `${reclamo.clasificacion} · cargado por el cliente` : reclamo.clasificacion,
    encargado: reclamo.contacto,
    grupoWhatsapp: "",
    grupoVendedor: "",
    estadoCliente: cliente?.estado ?? [],
    respondido,
    dias: respondido ? null : Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000)),
    observaciones: "",
    indicacion,
    estado: estado(indicacion, respondido),
    formulario: reclamo.id,
    consultaId: null,
  };
}

const ORDEN_ESTADO: Record<EstadoReclamo, number> = { SIN_DEFINIR: 0, EN_GESTION: 1, RESUELTO: 2 };

export type PanelReclamos = {
  reclamos: ReclamoPanel[];
  /** Si la planilla de seguimiento no se pudo leer, por que. */
  error: string | null;
};

/**
 * Todos los reclamos, primero los que esperan a la gerencia y dentro de cada
 * estado los que llevan mas dias. Un formulario cargado a partir de un
 * reclamo de WhatsApp no se lista aparte: queda enlazado a ese reclamo.
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

  // Clasificacion y estado de cuenta por codigo de cliente, para los formularios.
  const clientes = new Map<string, { clasificacion: string; estado: string[] }>();
  for (const consulta of consultas) {
    const { codigo } = separarCliente(consulta.cliente);
    if (!codigo || clientes.has(codigo)) continue;
    clientes.set(codigo, {
      clasificacion: (consulta.clasificacion || consulta.ficha?.clasificacion || "").toUpperCase(),
      estado: estadoClienteDe(consulta),
    });
  }

  const formularioPorConsulta = new Map(
    todosFormularios.filter((reclamo) => reclamo.consultaId).map((reclamo) => [reclamo.consultaId!, reclamo.id]),
  );
  const consultasReclamo = consultas.filter(esReclamo);
  const idsConsultas = new Set(consultasReclamo.map((consulta) => consulta.id));

  const reclamos = [
    ...consultasReclamo.map((consulta) =>
      desdeConsulta(
        consulta,
        indicaciones[idWhatsapp(consulta.id)] ?? null,
        formularioPorConsulta.get(consulta.id) ?? null,
        ahora,
      ),
    ),
    ...todosFormularios
      .filter((reclamo) => !reclamo.consultaId || !idsConsultas.has(reclamo.consultaId))
      .map((reclamo) =>
        desdeFormulario(
          reclamo,
          indicaciones[claveIndicacion(reclamo)] ?? null,
          clientes.get(reclamo.numeroCliente.replace(/\D/g, "")),
          ahora,
        ),
      ),
  ].sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      (b.dias ?? -1) - (a.dias ?? -1) ||
      (b.fecha ?? "").localeCompare(a.fecha ?? ""),
  );
  return { reclamos, error };
}
