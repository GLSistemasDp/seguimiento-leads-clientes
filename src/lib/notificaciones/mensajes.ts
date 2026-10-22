import { CATEGORIAS } from "@/lib/solicitudes/evaluacion";
import type { Evaluacion } from "@/lib/solicitudes/evaluacion";
import { leerCampo } from "@/lib/solicitudes/presentacion";
import {
  diasAbierta,
  esReclamo,
  estadoCliente,
  linkGrupoValido,
  separarCliente,
} from "@/lib/seguimiento/presentacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { ESTADOS_RECLAMO, type Reclamo, type ReclamoPanel } from "@/types/reclamo";
import type { Consulta } from "@/types/seguimiento";
import type { Solicitud } from "@/types/solicitud";

/**
 * Textos de las notificaciones de Telegram. Se escriben con *negrita* y
 * [texto](url); `enviarTelegram` los pasa a HTML. Son funciones puras: no
 * leen datos ni envian nada, asi se pueden previsualizar y probar.
 *
 * `base` es la URL de la intranet (para los links); vacia = sin links.
 */

/** Cuantos items se listan por mensaje antes de mandar "y N mas". */
const MAX_ITEMS = 25;

const FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function cuando(ahora: Date): string {
  const fecha = FECHA.format(ahora);
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${HORA.format(ahora)} hs`;
}

function link(texto: string, base: string, ruta: string): string {
  return base ? `[${texto}](${base}${ruta})` : "";
}

function plural(cantidad: number, singular: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`;
}

/** Nombre del grupo, con link si la planilla tiene el de invitacion. */
function grupo(nombre: string, enlace: string): string {
  if (!nombre) return "sin grupo";
  const directo = linkGrupoValido(enlace);
  return directo ? `[${nombre}](${directo})` : nombre;
}

function cliente(nombre: string, codigo: string, clasificacion = ""): string {
  return `• *${nombre}*${codigo ? ` (N° ${codigo})` : ""}${clasificacion ? ` · ${clasificacion}` : ""}`;
}

// --- Solicitudes de alta -------------------------------------------------------

/** 92% -> "9/10". */
export function sobreDiez(evaluacion: Evaluacion): string {
  return `${Math.round(evaluacion.puntaje / 10)}/10`;
}

function bloqueAlta(solicitud: Solicitud, evaluacion: Evaluacion, base: string): string[] {
  return [
    `• *${solicitud.nombre}*`,
    `   CUIT: ${leerCampo(solicitud.datos, "cuit") || "sin informar"}`,
    `   Rubro: ${leerCampo(solicitud.datos, "rubro") || "sin informar"}`,
    `   Puntuación: *${sobreDiez(evaluacion)}* · ${CATEGORIAS[evaluacion.categoria].etiqueta} (${evaluacion.puntaje}%)`,
  ].concat(base ? [`   ${link("Ver solicitud", base, `/solicitudes/${solicitud.id}`)}`] : []);
}

export function mensajeAltaNueva(solicitud: Solicitud, evaluacion: Evaluacion, base: string): string {
  return ["*🆕 Nueva solicitud de alta*", "", ...bloqueAlta(solicitud, evaluacion, base)].join("\n");
}

export function mensajeAltasPendientes(
  pendientes: readonly { solicitud: Solicitud; evaluacion: Evaluacion }[],
  base: string,
  ahora: Date,
): string {
  if (pendientes.length === 0) return `✅ *Solicitudes de alta:* no hay pendientes (${cuando(ahora)}).`;
  const lineas = [`*📝 Solicitudes de alta pendientes · ${cuando(ahora)}*`, `${plural(pendientes.length, "solicitud", "solicitudes")}, de mejor a peor puntuación.`];
  for (const { solicitud, evaluacion } of pendientes.slice(0, MAX_ITEMS)) lineas.push("", ...bloqueAlta(solicitud, evaluacion, base));
  if (pendientes.length > MAX_ITEMS) lineas.push("", `…y ${pendientes.length - MAX_ITEMS} más. ${link("Ver todas", base, "/solicitudes?estado=PENDIENTE")}`);
  return lineas.join("\n");
}

// --- Reclamos ---------------------------------------------------------------------

/** Datos del cliente que no estan en el formulario (salen de la planilla). */
export type ClienteDelReclamo = { estado: string[]; grupoWhatsapp: string; linkWhatsapp: string };

export function mensajeReclamoNuevo(reclamo: Reclamo, datos: ClienteDelReclamo | null, base: string): string {
  const detalle = reclamo.detalle.length > 220 ? `${reclamo.detalle.slice(0, 217)}…` : reclamo.detalle;
  return [
    `*🔴 Nuevo reclamo ${reclamo.id}*`,
    "",
    cliente(reclamo.razonSocial, reclamo.numeroCliente),
    `   Grupo: ${grupo(datos?.grupoWhatsapp ?? "", datos?.linkWhatsapp ?? "")}`,
    `   Estado de cuenta: ${datos?.estado.join(" · ") || "sin datos"}`,
    `   Hito: ${reclamo.clasificacion}`,
    `   Detalle: ${detalle}`,
    ...(base ? [`   ${link("Ver reclamo", base, `/reclamos/${reclamo.id}`)}`] : []),
  ].join("\n");
}

export function mensajeReclamosPendientes(reclamos: readonly ReclamoPanel[], base: string, ahora: Date): string {
  const pendientes = reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");
  if (pendientes.length === 0) return `✅ *Reclamos:* no hay pendientes (${cuando(ahora)}).`;
  const sinIndicar = pendientes.filter((reclamo) => reclamo.estado === "SIN_DEFINIR").length;
  const lineas = [
    `*🔴 Reclamos pendientes · ${cuando(ahora)}*`,
    `${plural(sinIndicar, "esperando a la gerencia", "esperando a la gerencia")} · ${pendientes.length - sinIndicar} indicados, en gestión`,
  ];
  for (const reclamo of pendientes.slice(0, MAX_ITEMS)) {
    const hito =
      reclamo.origen === "formulario"
        ? reclamo.tipo.replace(" · cargado por el cliente", "")
        : `WhatsApp: ${reclamo.detalle.length > 90 ? `${reclamo.detalle.slice(0, 87)}…` : reclamo.detalle}`;
    lineas.push(
      "",
      cliente(reclamo.cliente, reclamo.codigo, reclamo.clasificacionCliente),
      `   Grupo: ${grupo(reclamo.grupoWhatsapp, reclamo.linkWhatsapp)}`,
      `   Estado de cuenta: ${reclamo.estadoCliente.join(" · ") || "sin datos"}`,
      `   Hito: ${hito}`,
      `   ${reclamo.dias === null ? "" : `${plural(reclamo.dias, "día", "días")} · `}${ESTADOS_RECLAMO[reclamo.estado]}`,
    );
    const enlace = reclamo.formulario
      ? link(`Ver reclamo ${reclamo.formulario}`, base, `/reclamos/${reclamo.formulario}`)
      : link("Ver en el seguimiento", base, `/seguimiento?vista=todas&hito=Reclamo&q=${encodeURIComponent(reclamo.cliente)}`);
    if (enlace) lineas.push(`   ${enlace}`);
  }
  if (pendientes.length > MAX_ITEMS) lineas.push("", `…y ${pendientes.length - MAX_ITEMS} más. ${link("Ver todos", base, "/reclamos")}`);
  return lineas.join("\n");
}

// --- Seguimiento de chats ---------------------------------------------------------

const RANGO_CLASIFICACION: Record<string, number> = { A: 0, B: 1, C: 2 };

function clasificacionDe(consulta: Consulta): string {
  return (consulta.clasificacion || consulta.ficha?.clasificacion || "").trim().toUpperCase();
}

type Categoria = { titulo: string; icono: string; hito: string; incluye: (consulta: Consulta) => boolean };

function hitoNormalizado(consulta: Consulta): string {
  return normalizarEncabezado(consulta.hito);
}

/** Orden de prioridad de los mensajes; "el resto" se arma con lo que no entro antes. */
const CATEGORIAS_CHAT: Categoria[] = [
  { titulo: "Reclamos", icono: "🔴", hito: "Reclamo", incluye: esReclamo },
  { titulo: "Pedidos nuevos", icono: "🛒", hito: "Pedido nuevo", incluye: (c) => hitoNormalizado(c) === "pedido nuevo" },
  { titulo: "Refacturar", icono: "🧾", hito: "Pedido refacturar", incluye: (c) => hitoNormalizado(c).includes("refactur") },
];

function hitoConDias(consulta: Consulta, ahora: Date): string {
  const dias = diasAbierta(consulta, ahora);
  return `${consulta.hito || "Consulta"}${dias === null ? "" : ` · ${plural(dias, "día", "días")}`}`;
}

/** Un chat con todas sus consultas pendientes de la categoria (la mas demorada primero). */
function bloqueChat(consultas: readonly Consulta[], base: string, ahora: Date): string[] {
  const [primera] = consultas;
  const { codigo, nombre } = separarCliente(primera.cliente);
  const verChat = link("Ver chat en el CRM", base, `/seguimiento?agrupar=chat&q=${encodeURIComponent(nombre)}`);
  const hitos =
    consultas.length === 1
      ? [`   Hito: ${hitoConDias(primera, ahora)}`]
      : [`   Hitos (${consultas.length}):`, ...consultas.map((consulta) => `     – ${hitoConDias(consulta, ahora)}`)];
  return [
    cliente(nombre, codigo, clasificacionDe(primera)),
    `   Estado de cuenta: ${estadoCliente(primera).join(" · ") || "sin datos"}`,
    ...hitos,
    `   Grupo: ${grupo(primera.grupoWhatsapp, primera.linkWhatsapp)}`,
    ...(verChat ? [`   ${verChat}`] : []),
  ];
}

/**
 * Agrupa por chat y prioriza: A, B, C primero y, dentro de cada
 * clasificacion, los chats que mas esperan.
 */
function priorizar(consultas: readonly Consulta[], ahora: Date): Consulta[][] {
  const porChat = new Map<string, Consulta[]>();
  for (const consulta of consultas) {
    const clave = consulta.cliente.trim().toUpperCase();
    porChat.set(clave, [...(porChat.get(clave) ?? []), consulta]);
  }
  const demora = (consulta: Consulta) => diasAbierta(consulta, ahora) ?? 0;
  return [...porChat.values()]
    .map((lista) => [...lista].sort((a, b) => demora(b) - demora(a)))
    .sort(
      (a, b) =>
        (RANGO_CLASIFICACION[clasificacionDe(a[0])] ?? 3) - (RANGO_CLASIFICACION[clasificacionDe(b[0])] ?? 3) ||
        demora(b[0]) - demora(a[0]),
    );
}

/**
 * Seguimiento de chats en varios mensajes, por prioridad: el resumen de
 * pendientes, los reclamos, los pedidos nuevos, refacturar y el resto.
 * Las categorias vacias no se mandan.
 */
export function mensajesSeguimiento(consultas: readonly Consulta[], base: string, ahora: Date): string[] {
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  if (pendientes.length === 0) {
    return [`✅ *Seguimiento de chats:* sin pendientes en este corte (${cuando(ahora)}). ${link("Ver la cola", base, "/seguimiento")}`.trim()];
  }

  const usadas = new Set<string>();
  const grupos = CATEGORIAS_CHAT.map((categoria) => {
    const lista = pendientes.filter((consulta) => !usadas.has(consulta.id) && categoria.incluye(consulta));
    lista.forEach((consulta) => usadas.add(consulta.id));
    return { ...categoria, lista };
  });
  const resto = pendientes.filter((consulta) => !usadas.has(consulta.id));
  const todos = [...grupos, { titulo: "Resto de las consultas", icono: "💬", hito: "", incluye: () => true, lista: resto }];

  const chats = new Set(pendientes.map((consulta) => consulta.cliente.trim().toUpperCase())).size;
  const demoradas = pendientes.filter((consulta) => (diasAbierta(consulta, ahora) ?? 0) >= 1).length;
  const conLista = todos.filter((categoria) => categoria.lista.length > 0);
  const total = conLista.length + 1;

  const resumen = [
    `*1/${total} · Seguimiento de chats · ${cuando(ahora)}*`,
    "",
    `⏳ Sin responder: ${plural(pendientes.length, "consulta", "consultas")} en ${plural(chats, "chat", "chats")}`,
    `⚠️ Con 1 día o más de demora: ${demoradas}`,
    "",
    ...todos.map((categoria) => `${categoria.icono} ${categoria.titulo}: ${categoria.lista.length}`),
    "",
    "Ordenados por clasificación del cliente (A, B, C) y, dentro de cada una, por demora.",
    link("Ver la cola completa", base, "/seguimiento"),
  ]
    .filter((linea, indice, lineas) => linea || lineas[indice - 1] !== "")
    .join("\n")
    .trim();

  const mensajes = conLista.map((categoria, indice) => {
    const ordenadas = priorizar(categoria.lista, ahora);
    const cantidad = categoria.lista.length;
    const titulo = `${categoria.titulo} (${plural(cantidad, "consulta", "consultas")}${ordenadas.length < cantidad ? ` en ${plural(ordenadas.length, "chat", "chats")}` : ""})`;
    const lineas = [`*${indice + 2}/${total} · ${categoria.icono} ${titulo}*`];
    for (const chat of ordenadas.slice(0, MAX_ITEMS)) lineas.push("", ...bloqueChat(chat, base, ahora));
    if (ordenadas.length > MAX_ITEMS) {
      const ruta = categoria.hito ? `/seguimiento?hito=${encodeURIComponent(categoria.hito)}` : "/seguimiento";
      lineas.push("", `…y ${ordenadas.length - MAX_ITEMS} más. ${link("Ver en el CRM", base, ruta)}`);
    }
    return lineas.join("\n");
  });

  return [resumen, ...mensajes];
}
