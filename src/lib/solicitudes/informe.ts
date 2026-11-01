import { evaluarPorReglas } from "@/lib/solicitudes/evaluacion";
import type { Categoria } from "@/lib/solicitudes/evaluacion";
import { cuitValido, leerCampo, leerDato, mesAnterior, mesLocal, nombreMes } from "@/lib/solicitudes/presentacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { DecisionAlta, Solicitud } from "@/types/solicitud";

/**
 * Informe de las solicitudes de alta (desplegable "Ver informe completo"):
 * de donde llegan, a que se dedican, por que se rechazan y como se mueve el
 * flujo. Funciones puras sobre las solicitudes y sus decisiones.
 */

const DIA = 86_400_000;

export const PERIODOS_INFORME_ALTAS = {
  "90": { dias: 90, etiqueta: "90 días" },
  "365": { dias: 365, etiqueta: "12 meses" },
  todo: { dias: null, etiqueta: "Todo" },
} as const;
export type PeriodoInformeAltas = keyof typeof PERIODOS_INFORME_ALTAS;

export function esPeriodoInformeAltas(valor: unknown): valor is PeriodoInformeAltas {
  return typeof valor === "string" && Object.hasOwn(PERIODOS_INFORME_ALTAS, valor);
}

export const SIN_MOTIVO = "Sin motivo registrado";
const SIN_DATO = "Sin informar";

/** Nombre a mostrar de cada provincia, sin importar como la escribieron. */
const PROVINCIAS: Record<string, string> = {
  caba: "CABA",
  "capital federal": "CABA",
  "ciudad autonoma de buenos aires": "CABA",
  "ciudad de buenos aires": "CABA",
  "buenos aires": "Buenos Aires",
  "provincia de buenos aires": "Buenos Aires",
  "pcia de buenos aires": "Buenos Aires",
  cordoba: "Córdoba",
  "santa fe": "Santa Fe",
  mendoza: "Mendoza",
  tucuman: "Tucumán",
  "entre rios": "Entre Ríos",
  salta: "Salta",
  misiones: "Misiones",
  chaco: "Chaco",
  corrientes: "Corrientes",
  "santiago del estero": "Santiago del Estero",
  "san juan": "San Juan",
  jujuy: "Jujuy",
  "rio negro": "Río Negro",
  neuquen: "Neuquén",
  formosa: "Formosa",
  chubut: "Chubut",
  "san luis": "San Luis",
  catamarca: "Catamarca",
  "la rioja": "La Rioja",
  "la pampa": "La Pampa",
  "santa cruz": "Santa Cruz",
  "tierra del fuego": "Tierra del Fuego",
};

export function nombreProvincia(valor: string): string {
  const clave = normalizarEncabezado(valor).replace(/^(provincia|pcia|prov) de /, "");
  if (!clave) return SIN_DATO;
  return PROVINCIAS[clave] ?? PROVINCIAS[normalizarEncabezado(valor)] ?? valor.trim();
}

function campo(solicitud: Solicitud, nombre: string): string {
  return leerDato(solicitud.datos, nombre);
}

function tamano(empleados: string): string {
  const cantidad = Number.parseInt(empleados.replace(/\D/g, ""), 10);
  if (!Number.isFinite(cantidad)) return SIN_DATO;
  if (cantidad <= 10) return "1 a 10";
  if (cantidad <= 50) return "11 a 50";
  if (cantidad <= 200) return "51 a 200";
  return "Más de 200";
}

const ORDEN_TAMANO = ["1 a 10", "11 a 50", "51 a 200", "Más de 200", SIN_DATO];

export type FilaConteo = { etiqueta: string; total: number; aprobadas: number; rechazadas: number; pendientes: number };

/** Agrupa por una clave y ordena de mayor a menor (lo "sin informar" al final). */
function agrupar(solicitudes: readonly Solicitud[], clave: (solicitud: Solicitud) => string): FilaConteo[] {
  const filas = new Map<string, FilaConteo>();
  for (const solicitud of solicitudes) {
    const etiqueta = clave(solicitud) || SIN_DATO;
    const fila = filas.get(etiqueta) ?? { etiqueta, total: 0, aprobadas: 0, rechazadas: 0, pendientes: 0 };
    fila.total += 1;
    if (solicitud.estado === "APROBADO") fila.aprobadas += 1;
    else if (solicitud.estado === "RECHAZADO") fila.rechazadas += 1;
    else fila.pendientes += 1;
    filas.set(etiqueta, fila);
  }
  return [...filas.values()].sort(
    (a, b) => Number(a.etiqueta === SIN_DATO) - Number(b.etiqueta === SIN_DATO) || b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"),
  );
}

export type InformeAltas = ReturnType<typeof calcularInformeAltas>;

export function calcularInformeAltas(
  todas: readonly Solicitud[],
  decisiones: Readonly<Record<string, DecisionAlta>>,
  ahoraFecha: Date,
  periodo: PeriodoInformeAltas,
) {
  const ahora = ahoraFecha.getTime();
  const { dias, etiqueta } = PERIODOS_INFORME_ALTAS[periodo];
  const solicitudes = todas.filter(
    (solicitud) => dias === null || solicitud.fechaImportacion.getTime() > ahora - dias * DIA,
  );
  const total = solicitudes.length;
  const aprobadas = solicitudes.filter((solicitud) => solicitud.estado === "APROBADO");
  const rechazadas = solicitudes.filter((solicitud) => solicitud.estado === "RECHAZADO");
  const pendientes = total - aprobadas.length - rechazadas.length;
  const decididas = aprobadas.length + rechazadas.length;

  const conFecha = [...aprobadas, ...rechazadas].filter((solicitud) => solicitud.fechaDecision);
  const horasResolucion = conFecha.length
    ? conFecha.reduce((suma, solicitud) => suma + ((solicitud.fechaDecision as Date).getTime() - solicitud.fechaImportacion.getTime()) / 3_600_000, 0) /
      conFecha.length
    : null;

  const evaluaciones = solicitudes.map((solicitud) => evaluarPorReglas(solicitud));
  const puntajePromedio = total ? evaluaciones.reduce((suma, evaluacion) => suma + evaluacion.puntaje, 0) / total : null;
  const categorias: Record<Categoria, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const evaluacion of evaluaciones) categorias[evaluacion.categoria] += 1;

  // Motivos de rechazo: el de la ultima decision; las rechazadas antes de que existiera el selector no tienen.
  const motivos = new Map<string, number>();
  for (const solicitud of rechazadas) {
    const motivo = decisiones[solicitud.id]?.estado === "RECHAZADO" ? (decisiones[solicitud.id].motivo ?? SIN_MOTIVO) : SIN_MOTIVO;
    motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
  }
  const conMotivo = rechazadas.length - (motivos.get(SIN_MOTIVO) ?? 0);

  // Ultimos 12 meses (o menos si el periodo es mas corto): recibidas y aprobadas por mes.
  const cantidadMeses = dias === null ? 12 : Math.min(12, Math.ceil(dias / 30));
  const meses: string[] = [mesLocal(ahoraFecha)];
  while (meses.length < cantidadMeses) meses.unshift(mesAnterior(meses[0]));
  const porMes = meses.map((mes) => ({
    mes,
    etiqueta: `${nombreMes(mes).slice(0, 3)} ${mes.slice(2, 4)}`,
    recibidas: todas.filter((solicitud) => mesLocal(solicitud.fechaImportacion) === mes).length,
    aprobadas: todas.filter((solicitud) => solicitud.estado === "APROBADO" && mesLocal(solicitud.fechaDecision ?? solicitud.fechaImportacion) === mes).length,
  }));

  const porTamano = agrupar(solicitudes, (solicitud) => tamano(campo(solicitud, "Cantidad de empleados"))).sort(
    (a, b) => ORDEN_TAMANO.indexOf(a.etiqueta) - ORDEN_TAMANO.indexOf(b.etiqueta),
  );

  return {
    periodo: { clave: periodo, etiqueta },
    total,
    aprobadas: aprobadas.length,
    rechazadas: rechazadas.length,
    pendientes,
    tasaAprobacion: decididas ? (aprobadas.length / decididas) * 100 : null,
    horasResolucion,
    puntajePromedio,
    cuitInvalidos: solicitudes.filter((solicitud) => !cuitValido(leerCampo(solicitud.datos, "cuit"))).length,
    categorias,
    provincias: agrupar(solicitudes, (solicitud) => nombreProvincia(leerCampo(solicitud.datos, "provincia"))),
    actividades: agrupar(solicitudes, (solicitud) => campo(solicitud, "Tipo de industria") || leerCampo(solicitud.datos, "rubro")),
    canales: agrupar(solicitudes, (solicitud) => campo(solicitud, "Cómo nos conoció")),
    tiposCompra: agrupar(solicitudes, (solicitud) => campo(solicitud, "Tipo de compra")),
    envios: agrupar(solicitudes, (solicitud) => campo(solicitud, "Envío")),
    porTamano,
    motivosRechazo: [...motivos.entries()]
      .map(([motivo, cantidad]) => ({ motivo, cantidad }))
      .sort((a, b) => Number(a.motivo === SIN_MOTIVO) - Number(b.motivo === SIN_MOTIVO) || b.cantidad - a.cantidad),
    rechazosConMotivo: conMotivo,
    porMes,
  };
}
