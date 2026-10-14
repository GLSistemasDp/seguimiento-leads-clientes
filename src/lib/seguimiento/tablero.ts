import {
  alertasCliente,
  claveChat,
  diasAbierta,
  esReclamo,
  separarCliente,
  vencida,
} from "@/lib/seguimiento/presentacion";
import type { Consulta } from "@/types/seguimiento";

/**
 * Numeros del tablero de conversaciones para gerentes y encargados. Es solo
 * lectura y corre en memoria sobre lo que ya devolvio la planilla.
 *
 * Hay dos cortes distintos y el tablero los rotula asi:
 * - la cola actual (chats y consultas sin responder) no depende del periodo:
 *   lo pendiente sigue pendiente aunque haya entrado hace un mes;
 * - la actividad (entradas por dia, hito, encargado, grupo vendedor) cuenta
 *   las consultas que entraron dentro del periodo elegido.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const DIA_MS = 24 * 60 * 60 * 1000;

export const PERIODOS = { "7": "7 dias", "14": "14 dias", "30": "30 dias", todo: "Todo" } as const;
export type Periodo = keyof typeof PERIODOS;

export function esPeriodo(valor: unknown): valor is Periodo {
  return typeof valor === "string" && valor in PERIODOS;
}

/** "2026-10-09" en hora de Argentina. */
const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function diaLocal(fecha: Date): string {
  return FORMATO_DIA.format(fecha);
}

export type Barra = {
  clave: string;
  etiqueta: string;
  pendientes: number;
  respondidas: number;
};

export type FilaReclamo = {
  id: string;
  fecha: string | null;
  cliente: string;
  codigo: string;
  encargado: string;
  consulta: string;
  respondida: boolean;
  dias: number | null;
  observaciones: string;
};

export type FilaChat = {
  clave: string;
  cliente: string;
  codigo: string;
  grupoWhatsapp: string;
  pendientes: number;
  total: number;
  /** Dias que lleva esperando la consulta pendiente mas vieja. */
  esperaMaxima: number | null;
  hitos: string[];
  reclamo: boolean;
};

export type FilaDelicado = {
  cliente: string;
  codigo: string;
  alertas: string[];
  pendientes: number;
  esperaMaxima: number | null;
  condicionPago: string;
};

export type Tablero = {
  /** Cola actual. */
  chatsPendientes: number;
  sinResponder: number;
  reclamosAbiertos: number;
  vencidas: number;
  esperaPromedio: number | null;
  /** Actividad del periodo. */
  entradas: number;
  respondidasPeriodo: number;
  reclamosPeriodo: number;
  porDia: Barra[];
  porHito: Barra[];
  porEncargado: Barra[];
  porVendedor: Barra[];
  reclamos: FilaReclamo[];
  chats: FilaChat[];
  delicados: FilaDelicado[];
  /** Fecha de la consulta mas reciente de la planilla. */
  ultimaCarga: string | null;
};

function sumar(mapa: Map<string, Barra>, clave: string, etiqueta: string, respondida: boolean) {
  let barra = mapa.get(clave);
  if (!barra) {
    barra = { clave, etiqueta, pendientes: 0, respondidas: 0 };
    mapa.set(clave, barra);
  }
  if (respondida) barra.respondidas += 1;
  else barra.pendientes += 1;
}

/** Mayor total primero; a igual total, mas pendientes primero. */
function ordenarBarras(mapa: Map<string, Barra>): Barra[] {
  return [...mapa.values()].sort(
    (a, b) =>
      b.pendientes + b.respondidas - (a.pendientes + a.respondidas) ||
      b.pendientes - a.pendientes ||
      a.etiqueta.localeCompare(b.etiqueta, "es"),
  );
}

/** Mas de `maximo` categorias: el resto se junta en "Otros". */
function recortar(barras: Barra[], maximo: number): Barra[] {
  if (barras.length <= maximo) return barras;
  const resto = barras.slice(maximo - 1);
  return [
    ...barras.slice(0, maximo - 1),
    {
      clave: "__otros",
      etiqueta: `Otros (${resto.length})`,
      pendientes: resto.reduce((total, barra) => total + barra.pendientes, 0),
      respondidas: resto.reduce((total, barra) => total + barra.respondidas, 0),
    },
  ];
}

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

/** "2026-10-09" -> "Vie 09/10". */
function etiquetaDia(dia: string): string {
  const [anio, mes, numero] = dia.split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, numero)).getUTCDay();
  return `${DIAS_SEMANA[semana]} ${String(numero).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** Dias corridos entre dos "AAAA-MM-DD", incluidos ambos. */
function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const [a, m, d] = desde.split("-").map(Number);
  for (let tiempo = Date.UTC(a, m - 1, d); ; tiempo += DIA_MS) {
    const dia = new Date(tiempo).toISOString().slice(0, 10);
    dias.push(dia);
    if (dia >= hasta || dias.length > 120) break;
  }
  return dias;
}

export function vendedorCorto(grupo: string): string {
  return grupo.replace(/^FILTRO GRUPO\s*/i, "").trim();
}

export function calcularTablero(
  consultas: readonly Consulta[],
  periodo: Periodo,
  ahora = new Date(),
): Tablero {
  const hoy = diaLocal(ahora);
  const conFecha = consultas.filter((consulta) => consulta.fecha);
  const fechas = conFecha.map((consulta) => diaLocal(consulta.fecha as Date)).sort();
  const ultimaCarga = fechas.at(-1) ?? null;

  const desde =
    periodo === "todo"
      ? (fechas[0] ?? hoy)
      : diaLocal(new Date(ahora.getTime() - (Number(periodo) - 1) * DIA_MS));
  const enPeriodo = (consulta: Consulta) =>
    consulta.fecha !== null && diaLocal(consulta.fecha) >= desde && diaLocal(consulta.fecha) <= hoy;

  // --- Cola actual ---
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  let diasTotales = 0;
  let conDias = 0;
  for (const consulta of pendientes) {
    const dias = diasAbierta(consulta, ahora);
    if (dias !== null) {
      diasTotales += dias;
      conDias += 1;
    }
  }

  const chats = new Map<string, FilaChat>();
  for (const consulta of consultas) {
    const clave = claveChat(consulta);
    const { codigo, nombre } = separarCliente(consulta.cliente);
    let chat = chats.get(clave);
    if (!chat) {
      chat = {
        clave,
        cliente: nombre,
        codigo,
        grupoWhatsapp: consulta.grupoWhatsapp,
        pendientes: 0,
        total: 0,
        esperaMaxima: null,
        hitos: [],
        reclamo: false,
      };
      chats.set(clave, chat);
    }
    chat.total += 1;
    if (consulta.respondida) continue;
    chat.pendientes += 1;
    const dias = diasAbierta(consulta, ahora);
    if (dias !== null) chat.esperaMaxima = Math.max(chat.esperaMaxima ?? 0, dias);
    if (consulta.hito && !chat.hitos.includes(consulta.hito)) chat.hitos.push(consulta.hito);
    if (esReclamo(consulta)) chat.reclamo = true;
  }
  const chatsPendientes = [...chats.values()]
    .filter((chat) => chat.pendientes > 0)
    .sort(
      (a, b) =>
        Number(b.reclamo) - Number(a.reclamo) ||
        b.pendientes - a.pendientes ||
        (b.esperaMaxima ?? 0) - (a.esperaMaxima ?? 0),
    );

  const delicados = new Map<string, FilaDelicado>();
  for (const consulta of pendientes) {
    const alertas = alertasCliente(consulta);
    if (alertas.length === 0) continue;
    const { codigo, nombre } = separarCliente(consulta.cliente);
    const clave = codigo || nombre;
    let fila = delicados.get(clave);
    if (!fila) {
      fila = {
        cliente: nombre,
        codigo,
        alertas,
        pendientes: 0,
        esperaMaxima: null,
        condicionPago: consulta.ficha?.condicionPago ?? "",
      };
      delicados.set(clave, fila);
    }
    fila.pendientes += 1;
    const dias = diasAbierta(consulta, ahora);
    if (dias !== null) fila.esperaMaxima = Math.max(fila.esperaMaxima ?? 0, dias);
  }

  // --- Actividad del periodo ---
  const delPeriodo = consultas.filter(enPeriodo);
  const dias = new Map<string, Barra>(
    diasEntre(desde, hoy).map((dia) => [dia, { clave: dia, etiqueta: etiquetaDia(dia), pendientes: 0, respondidas: 0 }]),
  );
  const hitos = new Map<string, Barra>();
  const encargados = new Map<string, Barra>();
  const vendedores = new Map<string, Barra>();
  for (const consulta of delPeriodo) {
    const dia = diaLocal(consulta.fecha as Date);
    sumar(dias, dia, etiquetaDia(dia), consulta.respondida);
    sumar(hitos, consulta.hito || "Sin hito", consulta.hito || "Sin hito", consulta.respondida);
    sumar(encargados, consulta.encargado || "Sin asignar", consulta.encargado || "Sin asignar", consulta.respondida);
    const vendedor = vendedorCorto(consulta.grupoVendedor) || "Sin grupo";
    sumar(vendedores, vendedor, vendedor, consulta.respondida);
  }

  const reclamos = consultas
    .filter((consulta) => esReclamo(consulta) && (!consulta.respondida || enPeriodo(consulta)))
    .sort(
      (a, b) =>
        Number(a.respondida) - Number(b.respondida) ||
        (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0),
    )
    .map((consulta): FilaReclamo => {
      const { codigo, nombre } = separarCliente(consulta.cliente);
      return {
        id: consulta.id,
        fecha: consulta.fecha ? consulta.fecha.toISOString() : null,
        cliente: nombre,
        codigo,
        encargado: consulta.encargado,
        consulta: consulta.consulta,
        respondida: consulta.respondida,
        dias: consulta.respondida ? null : diasAbierta(consulta, ahora),
        observaciones: consulta.observaciones,
      };
    });

  return {
    chatsPendientes: chatsPendientes.length,
    sinResponder: pendientes.length,
    reclamosAbiertos: pendientes.filter(esReclamo).length,
    vencidas: pendientes.filter((consulta) => vencida(consulta, ahora)).length,
    esperaPromedio: conDias > 0 ? diasTotales / conDias : null,
    entradas: delPeriodo.length,
    respondidasPeriodo: delPeriodo.filter((consulta) => consulta.respondida).length,
    reclamosPeriodo: delPeriodo.filter(esReclamo).length,
    porDia: [...dias.values()].sort((a, b) => a.clave.localeCompare(b.clave)),
    porHito: recortar(ordenarBarras(hitos), 10),
    porEncargado: recortar(ordenarBarras(encargados), 8),
    porVendedor: recortar(ordenarBarras(vendedores), 8),
    reclamos,
    chats: chatsPendientes.slice(0, 12),
    delicados: [...delicados.values()].sort((a, b) => b.pendientes - a.pendientes).slice(0, 12),
    ultimaCarga,
  };
}
