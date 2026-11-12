import { normalizarEncabezado } from "@/lib/utils/strings";
import type { ClasificacionMensaje, Consulta, EventoHistorial, Relacion } from "@/types/seguimiento";

/**
 * Relacion con el cliente. Las mismas reglas que el prompt de la IA, para
 * cuando no hay clasificacion del modelo (planilla, demo, o sin API key):
 * - En riesgo: frustracion explicita, quejas severas, rechazos.
 * - Regular: demoras leves, quejas administrativas menores, reclamos comunes.
 * - Bien: operativo, pedidos nuevos, cordial.
 */

const EN_RIESGO =
  /(inaceptable|indignad|molest|enojad|harto|cansad|p[eé]sim|desastre|verg[uü]enza|nunca m[aá]s|[uú]ltima vez|cancel|dar de baja|damos de baja|no compramos m[aá]s|cambiar de proveedor|otro proveedor|rechaz|devolv(emos|er) todo|abogad|carta documento|denuncia|reclamo formal|urgente.*(reclam|falla)|sigue sin|otra vez (el|la|lo)|por tercera vez|no responden)/;

const REGULAR =
  /(demora|demorad|atras|todav[ií]a no|a[uú]n no|no (me )?lleg|no recib|faltant|falt[oóa]|falla|defect|roto|rota|error|equivocad|mal facturad|diferencia|reclam|recordatorio|nuevamente|de nuevo|cu[aá]ndo (llega|despachan|sale)|pendiente|sin respuesta|no contestan|refactur)/;

/** Hito por palabras clave, solo si el bot no lo mando (en orden: lo primero que coincide). */
const HITOS_POR_TEXTO: readonly (readonly [string, RegExp])[] = [
  ["Reclamo", /(reclam|incomplet|faltant|falt[oóa]|falla|defect|roto|rota|inaceptable|equivocad|mal facturad|vino mal|llego mal)/],
  ["Pedido refacturar", /refactur/],
  ["Estado de pedido", /(cuando (llega|despach|sale)|no (me )?lleg|todavia no lleg|estado del pedido|ya salio|despacharon)/],
  ["Pedido nuevo", /(orden de compra|\boc\b|pedido nuevo|les paso (un|el) pedido|cargar (el )?pedido)/],
  ["Informa pago", /(transferencia|comprobante|pago|cheque|echeq)/],
  ["Estado de Cuenta", /estado de cuenta/],
  ["Enviar Factura", /factura/],
  ["Consulta de stock", /stock/],
  ["Consulta precio", /(precio|cotiz)/],
  ["Lista de precios", /lista de precios/],
];

function hitoPorTexto(contenido: string): string {
  return HITOS_POR_TEXTO.find(([, patron]) => patron.test(contenido))?.[0] ?? "Consulta General";
}

const RESUMEN_MAXIMO = 160;

function resumir(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > RESUMEN_MAXIMO ? `${limpio.slice(0, RESUMEN_MAXIMO - 1)}…` : limpio;
}

export function clasificarPorReglas(texto: string, hito = ""): ClasificacionMensaje {
  const contenido = normalizarEncabezado(texto);
  const esReclamo = normalizarEncabezado(hito || hitoPorTexto(contenido)) === "reclamo";
  const relacion: Relacion = EN_RIESGO.test(contenido) ? "EN_RIESGO" : REGULAR.test(contenido) || esReclamo ? "REGULAR" : "BUENA";
  return { relacion, hito: hito || hitoPorTexto(contenido), resumen: resumir(texto), origen: "reglas" };
}

/** La clasificacion guardada o, si no hay, la de las reglas. */
export function clasificacionDe(consulta: Pick<Consulta, "consulta" | "hito" | "ia">): ClasificacionMensaje {
  return consulta.ia ?? clasificarPorReglas(consulta.consulta, consulta.hito);
}

/**
 * Por que las reglas dieron esa relacion, en palabras: la frase del mensaje
 * que la disparo ("el mensaje dice «molesto»") o que es un reclamo.
 */
/** Lo que coincidio con el patron, extendido a palabras enteras ("molest" -> "molesto"). */
function fraseCompleta(contenido: string, patron: RegExp): string | null {
  const coincidencia = patron.exec(contenido);
  if (!coincidencia) return null;
  const inicio = contenido.lastIndexOf(" ", coincidencia.index) + 1;
  const despues = contenido.indexOf(" ", coincidencia.index + coincidencia[0].length);
  return contenido.slice(inicio, despues === -1 ? contenido.length : despues);
}

export function motivoPorReglas(texto: string, hito: string, relacion: Relacion): string {
  const contenido = normalizarEncabezado(texto);
  if (relacion === "EN_RIESGO") {
    const frase = fraseCompleta(contenido, EN_RIESGO);
    return frase ? `el mensaje dice «${frase}»` : "el mensaje muestra frustración";
  }
  if (relacion === "REGULAR") {
    const frase = fraseCompleta(contenido, REGULAR);
    if (frase) return `el mensaje menciona «${frase}»`;
    return normalizarEncabezado(hito) === "reclamo" ? "es un reclamo" : "queja menor en el mensaje";
  }
  return "mensaje operativo, sin quejas";
}

export type RelacionVigente = {
  relacion: Relacion;
  origen: "cierre" | "ia" | "reglas";
  /** Por que esta en ese estado, para explicar el semaforo. */
  motivo: string;
};

/**
 * Relacion vigente de una consulta: la que se eligio al cerrarla si ya se
 * respondio; si sigue abierta, la que sugiere el ultimo mensaje. Con el motivo.
 */
export function relacionActual(
  consulta: Pick<Consulta, "consulta" | "hito" | "ia" | "respondida">,
  cierre: Pick<EventoHistorial, "relacion"> | null,
): RelacionVigente {
  if (consulta.respondida && cierre?.relacion) {
    return { relacion: cierre.relacion, origen: "cierre", motivo: "así quedó al cerrar la conversación" };
  }
  const clasificacion = clasificacionDe(consulta);
  const motivo =
    clasificacion.origen === "ia"
      ? `la IA lo leyó así${clasificacion.resumen ? `: ${clasificacion.resumen}` : ""}`
      : motivoPorReglas(consulta.consulta, consulta.hito, clasificacion.relacion);
  return { relacion: clasificacion.relacion, origen: clasificacion.origen, motivo };
}
