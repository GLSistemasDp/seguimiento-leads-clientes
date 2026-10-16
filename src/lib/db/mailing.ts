import "server-only";
import { leer, modificar } from "@/lib/db/local/almacen";
import { getAll as getSolicitudes } from "@/lib/db/solicitudes";
import { clientesDemo } from "@/lib/mailing/clientes-demo";
import { PLANTILLAS_BASE } from "@/lib/mailing/plantillas";
import { leerCampo } from "@/lib/solicitudes/presentacion";
import type { BaseMailing, Destinatario, PlantillaMailing, TipoMail } from "@/types/mailing";
import type { Solicitud } from "@/types/solicitud";

/**
 * Datos del mailing: destinatarios (clientes y altas decididas), plantillas
 * editadas por el equipo y bases guardadas. Lo editado vive en `.data/`
 * igual que el resto de lo que genera la app.
 */

const PLANTILLAS = "mailing-plantillas";
const BASES = "mailing-bases";

// --- Destinatarios -------------------------------------------------------------

function desdeSolicitud(solicitud: Solicitud): Destinatario {
  return {
    id: `alta-${solicitud.id}`,
    origen: "alta",
    nombre: solicitud.nombre,
    codigo: "",
    email: solicitud.email,
    contacto: "",
    rubro: leerCampo(solicitud.datos, "rubro"),
    clasificacion: "",
    provincia: leerCampo(solicitud.datos, "provincia"),
    grupoVendedor: "",
    situacion: "",
    deuda: 0,
    saldo: 0,
    ultimaCompra: null,
    ultimaFactura: null,
    ultimoPedido: null,
    cuit: leerCampo(solicitud.datos, "cuit"),
    estadoAlta: solicitud.estado === "APROBADO" ? "APROBADO" : "RECHAZADO",
  };
}

export type Destinatarios = { clientes: Destinatario[]; altas: Destinatario[] };

export async function getDestinatarios(): Promise<Destinatarios> {
  const solicitudes = await getSolicitudes().catch(() => []);
  return {
    clientes: clientesDemo(),
    altas: solicitudes.filter((solicitud) => solicitud.estado !== "PENDIENTE").map(desdeSolicitud),
  };
}

// --- Plantillas ----------------------------------------------------------------

/** Las plantillas editadas pisan a las de fabrica, tipo por tipo. */
export async function getPlantillas(): Promise<Record<TipoMail, PlantillaMailing>> {
  const guardadas = await leer<PlantillaMailing>(PLANTILLAS);
  const resultado = { ...PLANTILLAS_BASE };
  for (const tipo of Object.keys(resultado) as TipoMail[]) {
    if (guardadas[tipo]) resultado[tipo] = { ...PLANTILLAS_BASE[tipo], ...guardadas[tipo] };
  }
  return resultado;
}

export async function guardarPlantilla(tipo: TipoMail, plantilla: PlantillaMailing): Promise<void> {
  await modificar<PlantillaMailing, void>(PLANTILLAS, (datos) => {
    datos[tipo] = plantilla;
  });
}

export async function restaurarPlantilla(tipo: TipoMail): Promise<PlantillaMailing> {
  await modificar<PlantillaMailing, void>(PLANTILLAS, (datos) => {
    delete datos[tipo];
  });
  return PLANTILLAS_BASE[tipo];
}

// --- Bases guardadas -------------------------------------------------------------

export async function getBases(): Promise<BaseMailing[]> {
  return Object.values(await leer<BaseMailing>(BASES)).sort((a, b) => b.creada.localeCompare(a.creada));
}

export async function guardarBase(base: Omit<BaseMailing, "id" | "creada">): Promise<BaseMailing> {
  const completa: BaseMailing = { ...base, id: crypto.randomUUID(), creada: new Date().toISOString() };
  await modificar<BaseMailing, void>(BASES, (datos) => {
    datos[completa.id] = completa;
  });
  return completa;
}

export async function borrarBase(id: string): Promise<boolean> {
  return modificar<BaseMailing, boolean>(BASES, (datos) => {
    if (!datos[id]) return false;
    delete datos[id];
    return true;
  });
}
