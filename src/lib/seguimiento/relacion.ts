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
 * Relacion vigente de una consulta: la que se eligio al cerrarla si ya se
 * respondio; si sigue abierta, la que sugiere el ultimo mensaje.
 */
export function relacionActual(
  consulta: Pick<Consulta, "consulta" | "hito" | "ia" | "respondida">,
  cierre: Pick<EventoHistorial, "relacion"> | null,
): { relacion: Relacion; origen: "cierre" | "ia" | "reglas" } {
  if (consulta.respondida && cierre?.relacion) return { relacion: cierre.relacion, origen: "cierre" };
  const clasificacion = clasificacionDe(consulta);
  return { relacion: clasificacion.relacion, origen: clasificacion.origen };
}
