import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import { backendActivo } from "@/lib/db/repositorio";
import { getAll as getConsultas } from "@/lib/db/seguimiento";
import { PRODUCTOS_DEMO } from "@/lib/reclamos/catalogo";
import { alertasCliente, diasAbierta, esReclamo, separarCliente } from "@/lib/seguimiento/presentacion";
import { CLASIFICACIONES, type EstadoReclamo, type Indicacion, type Reclamo, type ReclamoPanel } from "@/types/reclamo";
import type { Consulta } from "@/types/seguimiento";

/**
 * Panel de reclamos para gerencia. Junta dos fuentes:
 * - los reclamos que el bot detecta en los grupos de WhatsApp (hito "Reclamo"
 *   de la planilla de seguimiento), que hoy se reenvian por Telegram;
 * - los formularios FOR-03 (por ahora de ejemplo, solo con DB_BACKEND="demo").
 *
 * La indicacion del gerente se guarda aparte (`.data/reclamos-indicaciones.json`)
 * con el id del reclamo, asi no depende de poder escribir en la planilla.
 */

const ARCHIVO = "reclamos-indicaciones";
const PREFIJO_WHATSAPP = "wa-";

// --- Formularios FOR-03 de ejemplo -------------------------------------------

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
    calidad: { clasificacion: null, causa: null, procedente: null, acciones: [] },
    cierre: {
      "Fecha de devolución": null, "Devolución recepcionada por": null, "Conforme a la devolución por": null,
      "Nota de crédito N°": null, "Responsable de nota de crédito": null,
      "Nota de débito N°": null, "Responsable de nota de débito": null,
      "Nueva factura N°": null, "Responsable de nueva factura": null,
      "N° de ajuste": null, "Responsable de ajuste": null, "N° de transferencia": null,
      "Acciones correctivas preventivas iniciadas": null, "Número de pedido de acción": null,
      "Respuesta al cliente": null, "Contacto con": null,
    },
    indicacion: null,
  }));
}

const memoria = globalThis as typeof globalThis & { reclamosDemo?: Reclamo[] };

/** Los formularios todavia no tienen fuente real: fuera de la demo no hay. */
export function formulariosDisponibles(): boolean {
  return backendActivo() === "demo";
}

function formularios(): Reclamo[] {
  if (!formulariosDisponibles()) return [];
  return (memoria.reclamosDemo ??= ejemplos());
}

// --- Indicaciones del gerente ------------------------------------------------

export async function getIndicaciones(): Promise<Record<string, Indicacion>> {
  return leer<Indicacion>(ARCHIVO);
}

export function idWhatsapp(consultaId: string): string {
  return `${PREFIJO_WHATSAPP}${consultaId}`;
}

/** Guarda la indicacion si el reclamo existe; null si no se encontro. */
export async function guardarIndicacion(id: string, indicacion: Omit<Indicacion, "fecha">): Promise<Indicacion | null> {
  const existe = id.startsWith(PREFIJO_WHATSAPP)
    ? (await getConsultas()).some((consulta) => idWhatsapp(consulta.id) === id && esReclamo(consulta))
    : formularios().some((reclamo) => reclamo.id === id);
  if (!existe) return null;

  const completa: Indicacion = { ...indicacion, fecha: new Date().toISOString() };
  await modificar<Indicacion, void>(ARCHIVO, (datos) => {
    datos[id] = completa;
  });
  return completa;
}

// --- Lectura ----------------------------------------------------------------

export async function getFormulario(id: string): Promise<Reclamo | null> {
  const reclamo = formularios().find((item) => item.id === id);
  if (!reclamo) return null;
  const indicaciones = await getIndicaciones();
  return { ...structuredClone(reclamo), indicacion: indicaciones[id] ?? null };
}

function estado(indicacion: Indicacion | null, respondido: boolean): EstadoReclamo {
  if (respondido) return "RESUELTO";
  return indicacion ? "EN_GESTION" : "SIN_DEFINIR";
}

function desdeConsulta(consulta: Consulta, indicacion: Indicacion | null, ahora: Date): ReclamoPanel {
  const { codigo, nombre } = separarCliente(consulta.cliente);
  return {
    id: idWhatsapp(consulta.id),
    origen: "whatsapp",
    fecha: consulta.fecha ? consulta.fecha.toISOString() : null,
    cliente: nombre,
    codigo,
    detalle: consulta.consulta,
    tipo: "WhatsApp",
    encargado: consulta.encargado,
    grupoWhatsapp: consulta.grupoWhatsapp,
    grupoVendedor: consulta.grupoVendedor.replace(/^FILTRO GRUPO\s*/i, ""),
    alertas: alertasCliente(consulta),
    respondido: consulta.respondida,
    dias: consulta.respondida ? null : diasAbierta(consulta, ahora),
    observaciones: consulta.observaciones,
    indicacion,
    estado: estado(indicacion, consulta.respondida),
    enlace: null,
  };
}

function desdeFormulario(reclamo: Reclamo, indicacion: Indicacion | null, ahora: Date): ReclamoPanel {
  const fecha = new Date(`${reclamo.fecha}T12:00:00-03:00`);
  return {
    id: reclamo.id,
    origen: "formulario",
    fecha: fecha.toISOString(),
    cliente: reclamo.razonSocial,
    codigo: reclamo.numeroCliente,
    detalle: reclamo.detalle,
    tipo: reclamo.clasificacion,
    encargado: reclamo.contacto,
    grupoWhatsapp: "",
    grupoVendedor: "",
    alertas: [],
    respondido: false,
    dias: Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000)),
    observaciones: "",
    indicacion,
    estado: estado(indicacion, false),
    enlace: `/reclamos/${reclamo.id}`,
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
 * estado los que llevan mas dias.
 */
export async function getPanel(ahora = new Date()): Promise<PanelReclamos> {
  const indicaciones = await getIndicaciones();
  let consultas: Consulta[] = [];
  let error: string | null = null;
  try {
    consultas = (await getConsultas()).filter(esReclamo);
  } catch (causa) {
    error = causa instanceof Error ? causa.message : String(causa);
  }

  const reclamos = [
    ...consultas.map((consulta) => desdeConsulta(consulta, indicaciones[idWhatsapp(consulta.id)] ?? null, ahora)),
    ...formularios().map((reclamo) => desdeFormulario(reclamo, indicaciones[reclamo.id] ?? null, ahora)),
  ].sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      (b.dias ?? -1) - (a.dias ?? -1) ||
      (b.fecha ?? "").localeCompare(a.fecha ?? ""),
  );
  return { reclamos, error };
}
