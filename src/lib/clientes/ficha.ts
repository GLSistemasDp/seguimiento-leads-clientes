import { normalizarEncabezado } from "@/lib/utils/strings";
import type { EventoHistorial, FichaCliente } from "@/types/seguimiento";

/** Situación, deuda y estado de cuenta son un único dato. Conserva las alertas de ambas fuentes. */
export function estadoCuentaUnificado(situacion: string, deuda: string): string {
  const estados = new Map<string, string>();
  for (const valor of [situacion, deuda].flatMap((texto) => texto.split(" · "))) {
    const texto = valor.trim();
    const clave = normalizarEncabezado(texto);
    if (!clave || ["null", "na", "nd", "ref"].includes(clave)) continue;
    if (!estados.has(clave)) estados.set(clave, texto);
  }
  // Una marca de deuda nunca debe mostrarse junto a un "OK" contradictorio.
  const sinAlertas = ["ok", "sin deuda", "sin marca", "al dia"];
  if ([...estados.keys()].some((clave) => !sinAlertas.includes(clave))) {
    for (const clave of sinAlertas) estados.delete(clave);
  }
  return [...estados.values()].join(" · ");
}

export function observacionDeCierre(evento: Pick<EventoHistorial, "resultado" | "observacion">): string {
  const nota = evento.observacion.trim();
  const resultado = evento.resultado ?? "";
  if (!resultado || nota === resultado || nota.startsWith(`${resultado} · `)) return nota || resultado;
  return [resultado, nota].filter(Boolean).join(" · ");
}

/** La última conversación finalizada manda sobre la observación inicial de la planilla. */
export function conUltimaGestion(ficha: FichaCliente, evento?: EventoHistorial | null): FichaCliente {
  if (!evento || evento.tipo !== "finalizada") return ficha;
  if (ficha.observacionActualizadaEn && ficha.observacionActualizadaEn > evento.fecha) return ficha;
  return { ...ficha, observacion: observacionDeCierre(evento), observacionActualizadaEn: evento.fecha };
}
