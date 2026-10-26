import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { clasificarPorReglas } from "@/lib/seguimiento/relacion";
import { normalizarEncabezado } from "@/lib/utils/strings";
import { HITOS, type ClasificacionMensaje, type Relacion } from "@/types/seguimiento";

/**
 * Clasifica cada mensaje que entra por el bot de WhatsApp: estado de la
 * relacion, hito y un resumen. Corre al ingresar la consulta (fuera de las
 * pantallas) y queda guardado en la cola; al cerrar se copia al historial
 * (payload_ai).
 *
 * Sin ANTHROPIC_API_KEY, o si la llamada falla, se usan las mismas reglas en
 * codigo (`clasificarPorReglas`): la carga nunca se corta por la IA.
 */

const MODELO = "claude-opus-5-5";

export const PROMPT_CLASIFICACION = `Analiza el último mensaje del cliente corporativo. Devuelve estrictamente un JSON con la estructura: { "estado_relacion": "Bien" | "Regular" | "En riesgo", "hito_detectado": "string", "resumen": "string" }.
Reglas de relación: "Bien" (operativo, pedidos nuevos, cordial), "Regular" (demoras leves, quejas administrativas menores), "En riesgo" (frustración explícita, quejas severas, rechazos).

Contexto: los mensajes llegan de grupos de WhatsApp de clientes de Industrias De Pascale, fabricante y distribuidor de elementos de protección personal (EPP) en Argentina.
- "hito_detectado": elegí el que mejor describa el pedido entre: ${HITOS.join(", ")}. Si ninguno encaja, usá "Consulta General".
- "resumen": una oración en español, de hasta 160 caracteres, con lo que pide o informa el cliente (sin saludos).`;

const Esquema = z.object({
  estado_relacion: z.enum(["Bien", "Regular", "En riesgo"]),
  hito_detectado: z.string(),
  resumen: z.string(),
});

const RELACION: Record<z.infer<typeof Esquema>["estado_relacion"], Relacion> = {
  Bien: "BUENA",
  Regular: "REGULAR",
  "En riesgo": "EN_RIESGO",
};

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.CLASIFICADOR_IA !== "reglas";
}

const global = globalThis as typeof globalThis & { clienteAnthropic?: Anthropic };

/** El hito que devolvio el modelo, llevado al nombre exacto del catalogo si coincide. */
function hitoDelCatalogo(hito: string): string {
  const buscado = normalizarEncabezado(hito);
  return HITOS.find((opcion) => normalizarEncabezado(opcion) === buscado) ?? (hito.trim() || "Consulta General");
}

/**
 * Clasifica un mensaje. `hito` es el que ya trae el bot (si lo trae): se
 * respeta y el del modelo queda solo como sugerencia en la clasificacion.
 */
export async function clasificarMensaje(texto: string, hito = ""): Promise<ClasificacionMensaje> {
  if (!iaConfigurada()) return clasificarPorReglas(texto, hito);
  try {
    global.clienteAnthropic ??= new Anthropic();
    const respuesta = await global.clienteAnthropic.beta.messages.parse({
      model: MODELO,
      max_tokens: 1024,
      // Si el modelo declina por politica, el servidor reintenta con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Esquema) },
      system: PROMPT_CLASIFICACION,
      messages: [{ role: "user", content: texto }],
    });
    if (respuesta.stop_reason === "refusal" || !respuesta.parsed_output) return clasificarPorReglas(texto, hito);
    const { estado_relacion, hito_detectado, resumen } = respuesta.parsed_output;
    return {
      relacion: RELACION[estado_relacion],
      hito: hitoDelCatalogo(hito_detectado),
      resumen: resumen.trim().slice(0, 300),
      origen: "ia",
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.warn("[clasificador] limite de uso de la API, se usan las reglas");
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[clasificador] error ${error.status} de la API: ${error.message}`);
    } else {
      console.error(`[clasificador] ${error instanceof Error ? error.message : String(error)}`);
    }
    return clasificarPorReglas(texto, hito);
  }
}

/** Clasifica varios mensajes con pocas llamadas en paralelo. */
export async function clasificarVarios(
  mensajes: readonly { texto: string; hito?: string }[],
  paralelo = 4,
): Promise<ClasificacionMensaje[]> {
  const resultados: ClasificacionMensaje[] = new Array(mensajes.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < mensajes.length) {
      const indice = siguiente++;
      resultados[indice] = await clasificarMensaje(mensajes[indice].texto, mensajes[indice].hito ?? "");
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, mensajes.length) }, trabajador));
  return resultados;
}
