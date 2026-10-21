import "server-only";
import { contarLista, filtrarEnMemoria } from "@/lib/db/repositorio";
import type {
  ConteosEstado,
  FiltrosSolicitud,
  RepositorioSolicitudes,
  ResultadoUpsert,
  SolicitudImportada,
} from "@/lib/db/repositorio";
import type { Estado, Solicitud } from "@/types/solicitud";

/**
 * Motor en memoria para mostrar la demo sin Google Sheets ni Postgres.
 *
 * Arranca con solicitudes de ejemplo y todo lo que se haga (aprobar, rechazar,
 * importar) vive mientras el servidor este levantado: al reiniciarlo vuelve
 * al estado inicial. Se guarda en `globalThis` para que el hot reload de
 * `npm run dev` no borre los cambios en medio de la presentacion.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

function haceDias(dias: number): Date {
  return new Date(Date.now() - dias * DIA_MS);
}

type Ejemplo = {
  nombre: string;
  email: string;
  cuit: string;
  rubro: string;
  provincia: string;
  telefono: string;
  estado: Estado;
  /** Hace cuantos dias llego. */
  llego: number;
  /** Hace cuantos dias se decidio (solo para aprobadas y rechazadas). */
  decidida?: number;
};

const EJEMPLOS: Ejemplo[] = [
  { nombre: "Seguridad Industrial Pampeana S.R.L.", email: "compras@sipampeana.com.ar", cuit: "30-71124567-3", rubro: "Seguridad industrial & EPP", provincia: "La Pampa", telefono: "2954 45-8900", estado: "PENDIENTE", llego: 0.2 },
  { nombre: "Bulonera del Centro S.A.", email: "administracion@buloneradelcentro.com.ar", cuit: "30-71589234-7", rubro: "Ferreteria y buloneria industrial", provincia: "Cordoba", telefono: "351 422-1100", estado: "PENDIENTE", llego: 1.3 },
  { nombre: "Gomez Juan Carlos", email: "juancarlosgomez1975@gmail.com", cuit: "20-28456789-8", rubro: "Corralon de materiales", provincia: "Buenos Aires", telefono: "", estado: "PENDIENTE", llego: 2.1 },
  { nombre: "Andes Montajes Electromecanicos S.A.", email: "compras@andesmontajes.com", cuit: "30-68932401-7", rubro: "Montajes industriales y energia", provincia: "Neuquen", telefono: "299 448-1200", estado: "PENDIENTE", llego: 3.1 },
  { nombre: "Estudio Creativo Luna", email: "hola@estudioluna.com", cuit: "27-35123456-9", rubro: "Diseno grafico", provincia: "CABA", telefono: "", estado: "PENDIENTE", llego: 4.6 },
  { nombre: "Litoral Agro Insumos S.R.L.", email: "ventas@litoralagro.com.ar", cuit: "30-70455128-9", rubro: "Agroindustria", provincia: "Santa Fe", telefono: "341 422-7788", estado: "PENDIENTE", llego: 6.4 },
  { nombre: "Distribuidora Fake Global", email: "spambox@freemail.com", cuit: "", rubro: "", provincia: "", telefono: "", estado: "PENDIENTE", llego: 8.0 },
  { nombre: "Cuyo Construcciones S.A.", email: "obras@cuyoconstrucciones.com.ar", cuit: "30-65412890-8", rubro: "Construccion", provincia: "Mendoza", telefono: "", estado: "PENDIENTE", llego: 9.2 },
  { nombre: "MegaOfertas Online", email: "ganadinero@correo-rapido.net", cuit: "20-11111111-1", rubro: "", provincia: "", telefono: "", estado: "RECHAZADO", llego: 12.7, decidida: 12.5 },
  { nombre: "Norte Textil S.A.", email: "comercial@nortetextil.com.ar", cuit: "30-69987231-4", rubro: "Indumentaria de trabajo", provincia: "Tucuman", telefono: "381 400-1122", estado: "APROBADO", llego: 13.4, decidida: 13.1 },
  { nombre: "Petrosur Servicios S.A.", email: "abastecimiento@petrosur.com.ar", cuit: "30-71345678-7", rubro: "Servicios petroleros", provincia: "Chubut", telefono: "297 455-6600", estado: "APROBADO", llego: 15, decidida: 14.8 },
  { nombre: "Grupo Delta Construcciones S.A.", email: "obras@grupodelta.com.ar", cuit: "30-71456123-1", rubro: "Construccion", provincia: "Entre Rios", telefono: "343 420-3311", estado: "APROBADO", llego: 17.6, decidida: 17.4 },
  { nombre: "Ferreteria Industrial Salta S.R.L.", email: "info@ferresalta.com", cuit: "30-70987654-2", rubro: "Ferreteria industrial", provincia: "Salta", telefono: "", estado: "APROBADO", llego: 19.2, decidida: 18.9 },
  { nombre: "Metalurgica Rio Plata S.A.", email: "compras@metalrioplata.com.ar", cuit: "30-69554210-7", rubro: "Metalurgica", provincia: "Buenos Aires", telefono: "11 4300-9090", estado: "APROBADO", llego: 38, decidida: 37.6 },
  { nombre: "Atlantica Software S.A.", email: "partners@atlanticasoft.com", cuit: "30-71203344-0", rubro: "Tecnologia & SaaS", provincia: "CABA", telefono: "11 5263-4400", estado: "RECHAZADO", llego: 24.3, decidida: 24.1 },
];

/** Cuanto completo cada ejemplo del formulario de alta, en el orden de EJEMPLOS. */
const NIVELES: Nivel[] = [
  "completo", "completo", "parcial", "completo", "minimo", "parcial", "vacio", "parcial",
  "vacio", "completo", "completo", "parcial", "completo", "completo", "minimo",
];

type Nivel = "completo" | "parcial" | "minimo" | "vacio";

/** Mismos nombres que el formulario de alta (lib/altas/formulario-alta.ts). */
const DOCUMENTOS: [string, string][] = [
  ["Legajo impositivo", "legajo"],
  ["Formulario CM05", "cm05"],
  ["Constancia de CUIT", "constancia-cuit"],
  ["Declaración jurada de IVA", "ddjj-iva"],
  ["Última DDJJ de cargas sociales", "ddjj-cargas"],
  ["Última DDJJ de Ganancias", "ddjj-ganancias"],
  ["Contrato social / Estatuto", "estatuto"],
  ["Último balance", "balance"],
];

const CANALES = ["Web", "Instagram", "Referencia de otro cliente", "Cámara Argentina de Seguridad (CAS)", "Nuestras capacitaciones"];
const COMPRAS = ["Compras mensuales", "Compras semanales", "Por licitación", "Compras anuales"];

/**
 * Datos del formulario de alta segun el nivel de completitud. Los adjuntos
 * son links a /api/documentos-demo (en produccion, /api/adjuntos).
 */
function datosDe(ejemplo: Ejemplo, nivel: Nivel, indice: number): Solicitud["datos"] {
  const link = (archivo: string) => `/api/documentos-demo/${archivo}?empresa=${encodeURIComponent(ejemplo.nombre)}`;
  const fantasia = ejemplo.nombre.replace(/\s+(S\.?A\.?S?\.?|S\.?R\.?L\.?)$/i, "");
  const legal = ejemplo.provincia ? `Av. Industria ${1200 + indice * 37}, ${ejemplo.provincia}, Argentina` : "";
  const datos: Solicitud["datos"] = {
    Origen: nivel === "vacio" ? "Importado de Excel" : "Formulario web del cliente",
    CUIT: ejemplo.cuit,
    Teléfono: ejemplo.telefono,
    Provincia: ejemplo.provincia,
  };
  if (nivel === "vacio") return datos;

  Object.assign(datos, {
    "Cómo nos conoció": CANALES[indice % CANALES.length],
    "Nombre de fantasía": fantasia,
    Responsable: ["Laura Gómez", "Martín Ruiz", "Silvina Paz", "Diego Sosa"][indice % 4],
    "Dirección legal": legal,
    "Tipo de industria": ejemplo.rubro,
  });
  const cantidadDocs = nivel === "completo" ? 8 : nivel === "parcial" ? 5 : 2;
  for (const [etiqueta, archivo] of DOCUMENTOS.slice(0, cantidadDocs)) datos[etiqueta] = link(archivo);
  if (nivel === "minimo") return datos;

  Object.assign(datos, {
    "Tipo de compra": COMPRAS[indice % COMPRAS.length],
    Envío: indice % 2 === 0 ? "Envío por transporte" : "Retira cliente",
    "Referencias comerciales":
      nivel === "completo"
        ? "Proveedora Sur · compras@proveedorasur.com.ar · 11 4000-1000 | Bulonera Oeste · 11 4000-2000 | Distribuidora Norte · ventas@dnorte.com.ar"
        : "Proveedora Sur · compras@proveedorasur.com.ar",
  });
  if (indice % 2 === 0) datos.Transportista = "Expreso Cruz del Sur · Bs. As.: Av. Riestra 1500 (Tel. 11 4919-0000)";
  if (nivel === "parcial") return datos;

  Object.assign(datos, {
    "Dirección comercial": legal,
    "Dirección de sucursal": ejemplo.provincia ? `Ruta 8 km ${40 + indice}, ${ejemplo.provincia}` : "",
    "Antigüedad (años)": String(5 + indice),
    "Cantidad de empleados": String(10 + indice * 4),
    Firma: link("firma"),
  });
  return datos;
}

function ejemplos(): Solicitud[] {
  return EJEMPLOS.map((ejemplo, indice) => ({
    id: crypto.randomUUID(),
    nombre: ejemplo.nombre,
    email: ejemplo.email,
    datos: datosDe(ejemplo, NIVELES[indice] ?? "parcial", indice),
    estado: ejemplo.estado,
    fechaImportacion: haceDias(ejemplo.llego),
    fechaDecision: ejemplo.decidida === undefined ? null : haceDias(ejemplo.decidida),
    usuarioDecisor: null,
  }));
}

const almacen = globalThis as typeof globalThis & { __demoSolicitudesFormV4?: Solicitud[] };

function todas(): Solicitud[] {
  almacen.__demoSolicitudesFormV4 ??= ejemplos();
  return almacen.__demoSolicitudesFormV4;
}

export async function getAll(filtros: FiltrosSolicitud = {}): Promise<Solicitud[]> {
  return filtrarEnMemoria(todas(), filtros).sort(
    (a, b) => b.fechaImportacion.getTime() - a.fechaImportacion.getTime(),
  );
}

export async function getById(id: string): Promise<Solicitud | null> {
  return todas().find((solicitud) => solicitud.id === id) ?? null;
}

export async function updateEstado(
  id: string,
  estado: Estado,
  usuarioDecisor?: string,
): Promise<Solicitud> {
  const solicitud = todas().find((item) => item.id === id);
  if (!solicitud) {
    throw new Error(`No existe la solicitud ${id}`);
  }

  const decidida = estado !== "PENDIENTE";
  solicitud.estado = estado;
  solicitud.fechaDecision = decidida ? new Date() : null;
  solicitud.usuarioDecisor = decidida ? (usuarioDecisor ?? null) : null;
  return { ...solicitud };
}

export async function upsertMany(
  solicitudes: readonly SolicitudImportada[],
): Promise<ResultadoUpsert> {
  const lista = todas();
  let creadas = 0;
  let actualizadas = 0;

  for (const importada of solicitudes) {
    const existente = lista.find((item) => item.email === importada.email);
    if (existente) {
      // Igual que en Sheets: refresca los datos pero no pisa la decision.
      existente.nombre = importada.nombre;
      existente.datos = importada.datos;
      actualizadas += 1;
      continue;
    }

    lista.push({
      id: crypto.randomUUID(),
      nombre: importada.nombre,
      email: importada.email,
      datos: importada.datos,
      estado: "PENDIENTE",
      fechaImportacion: new Date(),
      fechaDecision: null,
      usuarioDecisor: null,
    });
    creadas += 1;
  }

  return { creadas, actualizadas };
}

export async function contarPorEstado(): Promise<ConteosEstado> {
  return contarLista(todas());
}

const repositorio: RepositorioSolicitudes = {
  getAll,
  getById,
  updateEstado,
  upsertMany,
  contarPorEstado,
};

export default repositorio;
