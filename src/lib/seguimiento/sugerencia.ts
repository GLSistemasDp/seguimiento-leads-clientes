import { avisoEstado, recomendar, RESPUESTAS, type RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { UMBRALES_DEMORA_HORAS } from "@/lib/utils/dias-habiles";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Consulta, Relacion } from "@/types/seguimiento";

/**
 * Que respuesta rapida de WhatsApp Business sugerir para una consulta.
 *
 * Los atajos ("/PedidoRecibido", "/AgregarPedido"...) son los comandos de
 * respuestas rapidas que el equipo escribe en WhatsApp: no se traducen. Los
 * textos completos estan en el catalogo (RESPUESTAS en respuestas.ts, o las
 * hojas de la planilla si se pudieron leer).
 *
 * 1. Respuesta base segun el hito.
 * 2. Reglas de contexto que la reemplazan por "Revisar antes" (gana la primera).
 * 3. Avisos (flags) que no cambian la respuesta.
 *
 * Funcion pura: todo lo que necesita viene por parametro.
 */

/** Reglas y umbrales de la sugerencia. Ajustarlos solo aca. */
export const REGLAS_SUGERENCIA = {
  atajos: {
    pedidoNuevo: "/PedidoRecibido",
    agregarPedido: "/AgregarPedido",
    reclamo: "/ReclamoAdmin",
  },
  /** Pedido que se suma a uno existente (texto sin tildes ni mayusculas). */
  agregarAPedido:
    /\b(agreg\w*|sumar(le|les)?|pedido adicional|adicional al pedido|al camion|salga todo junto|sale todo junto|llega a tiempo|todavia (estoy|estamos) a tiempo)\b/,
  /** Cobranza que impide confirmar pedidos (situacion de la cuenta, normalizada). */
  estadoDeudor: "revisar deudora",
  /** Por debajo de esto la clasificacion del bot se revisa a mano (0 a 1). */
  confianzaMinima: 0.6,
  /** Mas de estas horas habiles sin respuesta: pedir disculpas por la demora (el umbral rojo). */
  horasParaDisculpa: UMBRALES_DEMORA_HORAS.rojo,
} as const;

export type ContextoSugerencia = {
  relacion: Relacion;
  /** Horas habiles que lleva sin respuesta. */
  horasHabiles: number | null;
  /** Situacion / estado de cuenta del cliente ("OK", "REVISAR DEUDORA"...). */
  estadoCuenta: string;
  /** Confianza del bot en su clasificacion (0 a 1), si la informa. */
  confianza?: number | null;
  /** Catalogo de respuestas rapidas; sin el, el de la app. */
  catalogo?: readonly RespuestaTipo[];
};

export type Sugerencia = {
  /** Atajo a escribir en WhatsApp ("/PedidoRecibido"), o null si hay que revisar o responder a mano. */
  atajo: string | null;
  /** Texto completo de la respuesta rapida, para el hover. */
  texto: string | null;
  /** "Revisar antes": una regla de contexto pide mirar el caso antes de responder. */
  revisar: boolean;
  /** Lo que se sugeriria sin las reglas de contexto (para despues de revisar). */
  base: string | null;
  /** Por que se sugiere esto, en una linea. */
  motivo: string;
  /** Avisos que no cambian la respuesta ("Agregar disculpa por la demora"). */
  flags: string[];
};

const HITOS_PEDIDO = new Set(["pedido nuevo", "agregar pedido", "pedido adicional"]);

function buscar(catalogo: readonly RespuestaTipo[], atajo: string): RespuestaTipo | null {
  const clave = atajo.toLowerCase();
  return (
    catalogo.find((respuesta) => respuesta.comando.toLowerCase() === clave) ??
    RESPUESTAS.find((respuesta) => respuesta.comando.toLowerCase() === clave) ??
    null
  );
}

/** Paso 1: la respuesta segun el hito (y, en pedidos, si suma a uno existente). */
function respuestaBase(
  consulta: Pick<Consulta, "hito" | "consulta">,
  catalogo: readonly RespuestaTipo[],
): { respuesta: RespuestaTipo | null; atajo: string | null; etiqueta: string } {
  const hito = normalizarEncabezado(consulta.hito);
  const texto = normalizarEncabezado(consulta.consulta);
  const { atajos } = REGLAS_SUGERENCIA;

  if (HITOS_PEDIDO.has(hito)) {
    const agrega = hito !== "pedido nuevo" || REGLAS_SUGERENCIA.agregarAPedido.test(texto);
    const atajo = agrega ? atajos.agregarPedido : atajos.pedidoNuevo;
    return { respuesta: buscar(catalogo, atajo), atajo, etiqueta: agrega ? "Suma a un pedido existente" : "Pedido nuevo" };
  }
  if (hito === "reclamo") {
    return { respuesta: buscar(catalogo, atajos.reclamo), atajo: atajos.reclamo, etiqueta: "Reclamo" };
  }
  // Otros hitos: la respuesta del catalogo de ese hito. Si hay varias, la que coincide
  // con el texto; si ninguna coincide, no se adivina (se elige en el detalle).
  const delHito = catalogo.filter((respuesta) => hito !== "" && normalizarEncabezado(respuesta.hito) === hito);
  const porTexto = delHito.length > 0 ? recomendar({ hito: "", consulta: consulta.consulta, estadoCuenta: "" }, delHito).principal : null;
  const elegida = porTexto ?? (delHito.length === 1 ? delHito[0] : null);
  const etiqueta = consulta.hito.trim() || "Sin hito";
  return { respuesta: elegida, atajo: elegida?.comando ?? null, etiqueta: !elegida && delHito.length > 1 ? `${etiqueta} · varias respuestas posibles` : etiqueta };
}

function textoCuenta(estado: string): string {
  const limpio = estado.trim();
  return !limpio || normalizarEncabezado(limpio) === "ok" ? "cuenta al día" : `cuenta: ${limpio}`;
}

export function sugerirRespuesta(consulta: Pick<Consulta, "hito" | "consulta">, contexto: ContextoSugerencia): Sugerencia {
  const catalogo = contexto.catalogo && contexto.catalogo.length > 0 ? contexto.catalogo : RESPUESTAS;
  const base = respuestaBase(consulta, catalogo);
  const estado = normalizarEncabezado(contexto.estadoCuenta);
  const deudor = estado.includes(REGLAS_SUGERENCIA.estadoDeudor);

  // Paso 3: avisos que acompanan a cualquier respuesta.
  const flags: string[] = [];
  if ((contexto.horasHabiles ?? 0) > REGLAS_SUGERENCIA.horasParaDisculpa) flags.push("Agregar disculpa por la demora");
  const aviso = avisoEstado(contexto.estadoCuenta);

  // Paso 2: reglas de contexto, en orden; gana la primera.
  const revisar = (motivo: string): Sugerencia => ({
    atajo: null,
    texto: null,
    revisar: true,
    base: base.atajo,
    motivo,
    flags,
  });
  if (deudor && HITOS_PEDIDO.has(normalizarEncabezado(consulta.hito))) {
    return revisar("Cliente deudor: revisar antes de confirmar el pedido");
  }
  // Fuera de esa regla, una cuenta con problemas queda avisada (sin cambiar la respuesta).
  if (aviso) flags.push(aviso);
  if (contexto.relacion === "EN_RIESGO") {
    return revisar("Relación en riesgo: revisar antes de responder");
  }
  if (typeof contexto.confianza === "number" && contexto.confianza < REGLAS_SUGERENCIA.confianzaMinima) {
    return revisar(`El bot no está seguro de la clasificación (${Math.round(contexto.confianza * 100)}%): revisar antes`);
  }

  if (!base.atajo) {
    const motivo = base.etiqueta.endsWith("varias respuestas posibles")
      ? `${base.etiqueta}: elegir en el detalle o responder a mano`
      : `${base.etiqueta} · sin respuesta rápida: responder a mano`;
    return { atajo: null, texto: null, revisar: false, base: null, motivo, flags };
  }
  return {
    atajo: base.atajo,
    texto: base.respuesta?.mensaje ?? null,
    revisar: false,
    base: base.atajo,
    motivo: `${base.etiqueta} · ${textoCuenta(contexto.estadoCuenta)}`,
    flags,
  };
}
