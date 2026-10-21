import { diasAbierta, esReclamo, estadoCliente, separarCliente } from "@/lib/seguimiento/presentacion";
import { diaLocal } from "@/lib/seguimiento/tablero";
import type { ReclamoPanel } from "@/types/reclamo";
import type { Consulta, EventoHistorial } from "@/types/seguimiento";

/**
 * Mensaje de cierre del dia para mandar por WhatsApp: como quedaron los
 * chats, que se finalizo y que lleva un dia o mas sin respuesta. Usa el
 * formato de WhatsApp (*negrita*) y nada de HTML.
 */

const MAX_DEMORADAS = 12;

export type DatosResumen = {
  consultas: readonly Consulta[];
  /** Eventos del historial registrados hoy. */
  eventosHoy: readonly EventoHistorial[];
  reclamos: readonly ReclamoPanel[];
  ahora?: Date;
  /** URL del panel, para cerrar el mensaje con un link. */
  enlace?: string;
};

export type ResumenDiario = {
  texto: string;
  finalizadasHoy: number;
  sinResponder: number;
  demoradas: number;
  reclamosSinIndicacion: number;
};

const FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "13:00": la hora del corte, en hora de Argentina. */
export function horaCorte(ahora: Date): string {
  return HORA.format(ahora);
}

function plural(cantidad: number, singular: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`;
}

export function armarResumenDiario({ consultas, eventosHoy, reclamos, ahora = new Date(), enlace }: DatosResumen): ResumenDiario {
  const hoy = diaLocal(ahora);
  const pendientes = consultas.filter((consulta) => !consulta.respondida);
  const chats = new Set(pendientes.map((consulta) => consulta.cliente.trim().toUpperCase()));
  const demoradas = pendientes
    .map((consulta) => ({ consulta, dias: diasAbierta(consulta, ahora) ?? 0 }))
    .filter(({ dias }) => dias >= 1)
    .sort((a, b) => Number(esReclamo(b.consulta)) - Number(esReclamo(a.consulta)) || b.dias - a.dias);
  const finalizadasHoy = new Set(
    eventosHoy.filter((evento) => evento.tipo === "finalizada").map((evento) => evento.consultaId),
  ).size;
  const entraronHoy = consultas.filter((consulta) => consulta.fecha && diaLocal(consulta.fecha) === hoy).length;
  const reclamosAbiertos = reclamos.filter((reclamo) => reclamo.estado !== "RESUELTO");
  const sinIndicacion = reclamosAbiertos.filter((reclamo) => reclamo.estado === "SIN_DEFINIR");
  const enRiesgo = eventosHoy.filter((evento) => evento.relacion === "EN_RIESGO");

  const porEncargado = new Map<string, number>();
  for (const consulta of pendientes) {
    const encargado = consulta.encargado || "Sin asignar";
    porEncargado.set(encargado, (porEncargado.get(encargado) ?? 0) + 1);
  }

  const fecha = FECHA.format(ahora);
  const lineas = [
    `*Cierre del día · ${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${horaCorte(ahora)} hs*`,
    "",
    `📥 Entraron hoy: ${entraronHoy}`,
    `✅ Finalizadas hoy: ${finalizadasHoy}`,
    `⏳ Sin responder: ${plural(pendientes.length, "consulta", "consultas")} en ${plural(chats.size, "chat", "chats")}`,
    `⚠️ Con 1 día o más de demora: ${demoradas.length}`,
    `🔴 Reclamos abiertos: ${reclamosAbiertos.length}${sinIndicacion.length > 0 ? ` (${sinIndicacion.length} esperando indicación de gerencia)` : ""}`,
  ];

  if (demoradas.length > 0) {
    lineas.push("", "*Demoradas:*");
    // Un cliente por bloque (nombre, grupo, estado de cuenta, hito) para leerlo de un vistazo.
    for (const { consulta, dias } of demoradas.slice(0, MAX_DEMORADAS)) {
      const { nombre } = separarCliente(consulta.cliente);
      const estado = estadoCliente(consulta).join(" · ");
      lineas.push(
        "",
        `• *${nombre}*`,
        `   Grupo: ${consulta.grupoWhatsapp || "sin grupo"}`,
        `   Estado de cuenta: ${estado || "sin datos"}`,
        `   Hito: ${consulta.hito || "Consulta"} · ${plural(dias, "día", "días")} sin respuesta`,
      );
    }
    if (demoradas.length > MAX_DEMORADAS) lineas.push("", `…y ${demoradas.length - MAX_DEMORADAS} más`);
  }

  if (enRiesgo.length > 0) {
    lineas.push("", "*Clientes con la relación en riesgo hoy:*");
    for (const evento of enRiesgo) {
      const { nombre } = separarCliente(evento.cliente);
      lineas.push(`• ${nombre}${evento.observacion ? `: ${evento.observacion}` : ""}`);
    }
  }

  if (porEncargado.size > 0) {
    lineas.push("", "*Pendientes por encargado:*");
    lineas.push(
      [...porEncargado.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([encargado, cantidad]) => `${encargado}: ${cantidad}`)
        .join(" · "),
    );
  }

  if (pendientes.length === 0) lineas.push("", "La cola quedó al día. 👏");
  if (enlace) lineas.push("", `Ver el detalle: ${enlace}`);

  return {
    texto: lineas.join("\n"),
    finalizadasHoy,
    sinResponder: pendientes.length,
    demoradas: demoradas.length,
    reclamosSinIndicacion: sinIndicacion.length,
  };
}
