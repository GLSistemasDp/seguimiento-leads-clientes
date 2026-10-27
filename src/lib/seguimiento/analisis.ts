import { esReclamo } from "@/lib/seguimiento/presentacion";
import { diaLocal } from "@/lib/seguimiento/tablero";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Consulta } from "@/types/seguimiento";

/**
 * Analisis del seguimiento (desplegable "Ver analisis completo"): volumen
 * por semana, motivos de consulta y reclamos. Los reclamos son las consultas
 * con hito "Reclamo" y se clasifican por el texto de cada mensaje.
 * Funciones puras sobre las consultas.
 */

const DIA = 86_400_000;

export const PERIODOS_ANALISIS = {
  "30": { dias: 30, etiqueta: "30 días" },
  "90": { dias: 90, etiqueta: "90 días" },
  todo: { dias: null, etiqueta: "Todo" },
} as const;
export type PeriodoAnalisis = keyof typeof PERIODOS_ANALISIS;

export function esPeriodoAnalisis(valor: unknown): valor is PeriodoAnalisis {
  return typeof valor === "string" && Object.hasOwn(PERIODOS_ANALISIS, valor);
}

/**
 * Tipos de reclamo, en el orden en que se prueban sobre el texto del mensaje
 * (normalizado: sin tildes ni signos). Afinado con los reclamos reales de la
 * planilla: primero lo inequivoco de facturacion, despues faltantes, calidad...
 */
const TIPOS_RECLAMO: readonly (readonly [string, RegExp])[] = [
  ["Facturación, precios y NC", /(refactur|error en (una |la )?factur|mal factur|nota de credito|percepcion|precio)/],
  ["Faltante / entrega incompleta", /(faltante|faltaron|falto |faltan |faltaba|incomplet|menos unidades|llego sin|vino sin|no vino todo|solo llegaron)/],
  ["Calidad de producto", /(falla|fallad|defect|roto|rota|rompe|descos|calidad|mal estado|vencid|danad|llegaron mal|llego mal|inconvenientes? con|en buen estado)/],
  ["Producto equivocado", /(equivocad|incorrect|en lugar de|otro (producto|modelo|talle|color)|no es el que|no corresponde|cambio pendiente)/],
  ["Cheques y cobranzas", /(cheque|echeq|cobranza|recibo|retencion|deuda|transferencia|cuenta corriente|saldo)/],
  ["Facturación, precios y NC", /(factur|\bnc\b|credito|descuento|diferencia|cobraron)/],
  ["Entrega demorada / no llega", /(demora|no lleg|todavia no|aun no|cuando (llega|despach|sale|entreg)|sigue sin|atras|no recib|no vino|no entregad|no enviaron|plazo de entrega|despach|envio del remito|urgente)/],
];
export const SIN_DETALLE = "Sin detalle / seguimiento";

/** El cliente dice que no le contestan. */
const FALTA_DE_RESPUESTA =
  /(no (me |nos )?(contesta|responde|atiende)|no (me |nos )?(dio|dieron|dan) respuesta|nadie (me |nos )?(contesta|responde|atiende)|sin respuesta|no (tuve|tuvimos|tengo|tenemos) respuesta|sigo esperando respuesta|esperando respuesta|no nos dan respuesta|no me dan respuesta|nadie responde)/;

export function tipoDeReclamo(texto: string): string {
  const contenido = normalizarEncabezado(texto);
  return TIPOS_RECLAMO.find(([, patron]) => patron.test(contenido))?.[0] ?? SIN_DETALLE;
}

export function reclamaFaltaDeRespuesta(texto: string): boolean {
  return FALTA_DE_RESPUESTA.test(normalizarEncabezado(texto));
}

/** Lunes de la semana de una fecha (hora de Argentina), como "AAAA-MM-DD". */
function lunesDe(fecha: Date): string {
  const [anio, mes, dia] = diaLocal(fecha).split("-").map(Number);
  const base = new Date(Date.UTC(anio, mes - 1, dia));
  const desdeLunes = (base.getUTCDay() + 6) % 7;
  return new Date(base.getTime() - desdeLunes * DIA).toISOString().slice(0, 10);
}

function ddmm(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${numero}/${mes}`;
}

function grupoDe(consulta: Consulta): string {
  return (consulta.grupoVendedor || consulta.ficha?.grupoVendedor || "").replace(/^FILTRO GRUPO\s*/i, "").trim().toUpperCase() || "SIN GRUPO";
}

export type Analisis = ReturnType<typeof calcularAnalisis>;

export function calcularAnalisis(todas: readonly Consulta[], ahoraFecha: Date, periodo: PeriodoAnalisis, minimoPorGrupo = 20) {
  const ahora = ahoraFecha.getTime();
  const { dias, etiqueta } = PERIODOS_ANALISIS[periodo];
  const consultas = todas.filter((consulta) => {
    if (!consulta.fecha) return dias === null;
    const momento = consulta.fecha.getTime();
    return momento <= ahora && (dias === null || momento > ahora - dias * DIA);
  });
  const total = consultas.length;
  const porcentaje = (parte: number, base = total) => (base === 0 ? 0 : (parte / base) * 100);

  const fechas = consultas.flatMap((consulta) => (consulta.fecha ? [consulta.fecha.getTime()] : []));
  const desde = fechas.length ? new Date(Math.min(...fechas)) : null;
  const hasta = fechas.length ? new Date(Math.max(...fechas)) : null;

  const respondidas = consultas.filter((consulta) => consulta.respondida).length;
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  const viejas = pendientes.filter((consulta) => consulta.fecha && consulta.fecha.getTime() < ahora - 30 * DIA).length;
  const reclamos = consultas.filter(esReclamo);
  const faltaDeRespuesta = reclamos.filter((consulta) => reclamaFaltaDeRespuesta(consulta.consulta)).length;
  const esBot = (consulta: Consulta) => normalizarEncabezado(consulta.encargado) === "bot";
  const delBot = consultas.filter(esBot).length;

  // --- Por semana ---
  const semanas = new Map<string, { respondidas: number; pendientes: number; bot: number; total: number }>();
  for (const consulta of consultas) {
    if (!consulta.fecha) continue;
    const lunes = lunesDe(consulta.fecha);
    const semana = semanas.get(lunes) ?? { respondidas: 0, pendientes: 0, bot: 0, total: 0 };
    if (consulta.respondida) semana.respondidas += 1;
    else semana.pendientes += 1;
    if (esBot(consulta)) semana.bot += 1;
    semana.total += 1;
    semanas.set(lunes, semana);
  }
  // Semanas continuas: las que no tuvieron consultas aparecen en cero.
  const claves = [...semanas.keys()].sort();
  if (claves.length > 1) {
    for (let momento = Date.parse(`${claves[0]}T00:00:00Z`); momento < Date.parse(`${claves[claves.length - 1]}T00:00:00Z`); momento += 7 * DIA) {
      const lunes = new Date(momento).toISOString().slice(0, 10);
      if (!semanas.has(lunes)) semanas.set(lunes, { respondidas: 0, pendientes: 0, bot: 0, total: 0 });
    }
  }
  const serieSemanas = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lunes, valores]) => ({ lunes, etiqueta: ddmm(lunes), ...valores }));
  // Las semanas que mas atraso sin cerrar acumulan (para el subtitulo del grafico).
  const semanasAtrasadas = [...serieSemanas]
    .filter((semana) => semana.pendientes > 0)
    .sort((a, b) => b.pendientes - a.pendientes)
    .slice(0, 2)
    .sort((a, b) => a.lunes.localeCompare(b.lunes))
    .map((semana) => semana.etiqueta);
  // Desde que semana el bot registra casi todo (95% o mas en todas las siguientes).
  let botDesde: string | null = null;
  for (let indice = serieSemanas.length - 1; indice >= 0; indice -= 1) {
    if (serieSemanas[indice].total === 0) continue;
    if (serieSemanas[indice].bot / serieSemanas[indice].total < 0.95) break;
    botDesde = serieSemanas[indice].etiqueta;
  }

  // --- Motivos (hito a responder) ---
  const motivos = new Map<string, number>();
  for (const consulta of consultas) {
    const hito = consulta.hito.trim() || "Sin clasificar";
    motivos.set(hito, (motivos.get(hito) ?? 0) + 1);
  }

  // --- Tipos de reclamo ---
  const tipos = new Map<string, number>();
  for (const reclamo of reclamos) {
    const tipo = tipoDeReclamo(reclamo.consulta);
    tipos.set(tipo, (tipos.get(tipo) ?? 0) + 1);
  }

  // --- Reclamos cada 100 consultas, por grupo ---
  const grupos = new Map<string, { consultas: number; reclamos: number }>();
  for (const consulta of consultas) {
    const grupo = grupoDe(consulta);
    const actual = grupos.get(grupo) ?? { consultas: 0, reclamos: 0 };
    actual.consultas += 1;
    if (esReclamo(consulta)) actual.reclamos += 1;
    grupos.set(grupo, actual);
  }
  const promedioPorGrupo = porcentaje(reclamos.length);
  const porGrupo = [...grupos.entries()]
    .filter(([grupo, valores]) => grupo !== "SIN GRUPO" && valores.consultas >= minimoPorGrupo && valores.reclamos > 0)
    .map(([grupo, valores]) => ({ grupo, ...valores, tasa: (valores.reclamos / valores.consultas) * 100 }))
    .sort((a, b) => b.tasa - a.tasa);

  return {
    periodo: { clave: periodo, etiqueta },
    rango: { desde, hasta },
    total,
    respondidas: { cantidad: respondidas, porcentaje: porcentaje(respondidas) },
    pendientes: { cantidad: pendientes.length, conMasDe30Dias: viejas },
    reclamos: { cantidad: reclamos.length, porcentaje: porcentaje(reclamos.length), faltaDeRespuesta },
    bot: { cantidad: delBot, porcentaje: porcentaje(delBot), desde: botDesde && botDesde !== serieSemanas[0]?.etiqueta ? botDesde : null },
    semanas: serieSemanas,
    semanasAtrasadas,
    motivos: [...motivos.entries()]
      .map(([hito, cantidad]) => ({ hito, cantidad, porcentaje: porcentaje(cantidad) }))
      .sort((a, b) => b.cantidad - a.cantidad),
    tiposReclamo: [...tipos.entries()]
      .map(([tipo, cantidad]) => ({ tipo, cantidad, porcentaje: porcentaje(cantidad, reclamos.length) }))
      .sort((a, b) => b.cantidad - a.cantidad),
    porGrupo,
    promedioPorGrupo,
    minimoPorGrupo,
  };
}
