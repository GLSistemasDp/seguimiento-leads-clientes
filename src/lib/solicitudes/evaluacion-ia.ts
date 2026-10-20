import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { leer, modificar } from "@/lib/db/local/almacen";
import { categoriaDe, evaluarPorReglas, huellaSolicitud } from "@/lib/solicitudes/evaluacion";
import type { Evaluacion } from "@/lib/solicitudes/evaluacion";
import type { Solicitud } from "@/types/solicitud";

/**
 * Evaluacion de solicitudes de alta con Claude. Lee el formulario completo
 * (incluidos los nombres de los adjuntos) y devuelve un puntaje 0-100 con
 * fortalezas, riesgos y el proximo paso, en JSON validado con Zod.
 *
 * El resultado se guarda en `.data/altas-evaluaciones.json` por id de
 * solicitud junto con la huella de los datos: no se vuelve a pagar una
 * evaluacion mientras la empresa no cambie su formulario.
 */

const ARCHIVO = "altas-evaluaciones";
const MODELO = "claude-opus-5-5";

const EsquemaEvaluacion = z.object({
  puntaje: z.number().int(),
  resumen: z.string(),
  fortalezas: z.array(z.string()),
  riesgos: z.array(z.string()),
  proximo_paso: z.string(),
});

const SISTEMA = `Sos analista comercial de Industrias De Pascale, fabricante y distribuidor argentino de elementos de protección personal (EPP) y protección industrial: guantes, anteojos, cascos, calzado, indumentaria, señalización vial y trabajo en altura.

La empresa vende a revendedores y empresas con una cartera exclusiva: solo da de alta a quienes cumplen varios requisitos. Tu tarea es puntuar de 0 a 100 qué tan apto es un solicitante para ser cliente, para que el equipo comercial resuelva primero los más prometedores. No aprobás ni rechazás: el equipo decide.

Qué pesa a favor:
- CUIT válido y persona jurídica (S.A., S.R.L., S.A.S.); una persona física puede ser apta pero pide más respaldo.
- Rubro afín a reventa o consumo de EPP: seguridad industrial, ferreterías y bulonerías industriales, distribuidoras, construcción, metalurgia, minería, petróleo, energía, agro, logística, sanidad.
- Documentación completa: constancia de AFIP, IIBB / CM05, estatuto o contrato social, DNI del firmante y referencias comerciales.
- Mail con dominio propio de la empresa, teléfono y provincia informados.

Qué pesa en contra:
- CUIT faltante o inválido, datos de contacto incompletos, casillas gratuitas o con aspecto de spam.
- Rubros sin relación con EPP o que no justifican volumen de compra.
- Señales de empresa ficticia: nombres genéricos, datos inconsistentes entre sí.

Escalas: 75-100 muy apto, 55-74 apto con revisión, 35-54 dudoso, 0-34 no apto.

Respondé en español rioplatense, breve y concreto. "resumen" es una sola oración para el listado. "fortalezas" y "riesgos" tienen hasta 4 ítems cortos cada uno. "proximo_paso" dice qué tiene que hacer el equipo (qué pedir, qué verificar o si conviene priorizarla). Basate solo en los datos recibidos y no inventes información.`;

export async function getEvaluaciones(): Promise<Record<string, Evaluacion>> {
  return leer<Evaluacion>(ARCHIVO);
}

/**
 * La evaluacion vigente de cada solicitud: la de IA si se hizo sobre los
 * datos actuales, si no la de reglas (instantanea).
 */
export function evaluacionVigente(solicitud: Solicitud, guardadas: Record<string, Evaluacion>): Evaluacion {
  const guardada = guardadas[solicitud.id];
  if (guardada && guardada.huella === huellaSolicitud(solicitud)) return guardada;
  return evaluarPorReglas(solicitud);
}

function describirSolicitud(solicitud: Solicitud): string {
  const campos = Object.entries(solicitud.datos)
    .filter(([, valor]) => valor !== null && String(valor).trim() !== "")
    .map(([campo, valor]) => {
      const texto = String(valor);
      // De los adjuntos alcanza con saber que estan: el link no aporta.
      return /^(https?:\/\/|\/api\/(documentos-demo|adjuntos)\/)/.test(texto) ? `- ${campo}: [archivo adjunto]` : `- ${campo}: ${texto}`;
    });
  return [
    `Razón social: ${solicitud.nombre}`,
    `Mail: ${solicitud.email}`,
    "Datos del formulario:",
    ...(campos.length > 0 ? campos : ["- (sin otros datos)"]),
  ].join("\n");
}

export class ErrorEvaluacion extends Error {}

/** Evalua con Claude, guarda el resultado y lo devuelve. */
export async function evaluarConIA(solicitud: Solicitud): Promise<Evaluacion> {
  const client = new Anthropic();
  let respuesta;
  try {
    respuesta = await client.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      // Si un clasificador de seguridad declina, la API reintenta sola con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(EsquemaEvaluacion) },
      system: SISTEMA,
      messages: [{ role: "user", content: describirSolicitud(solicitud) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ErrorEvaluacion("La clave de la API de Claude es inválida. Revisá ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ErrorEvaluacion("Claude está con mucha demanda. Probá de nuevo en un minuto.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new ErrorEvaluacion(`La API de Claude respondió con error ${error.status ?? ""}: ${error.message}`);
    }
    // Sin credenciales el SDK falla antes de llamar a la API.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new ErrorEvaluacion(
        "La IA todavía no está configurada: definí ANTHROPIC_API_KEY en el .env y reiniciá el servidor. Mientras tanto se usa el puntaje por reglas.",
      );
    }
    throw new ErrorEvaluacion(`No se pudo llamar a Claude: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (respuesta.stop_reason === "refusal" || !respuesta.parsed_output) {
    throw new ErrorEvaluacion("Claude no devolvió una evaluación para esta solicitud.");
  }

  const salida = respuesta.parsed_output;
  const puntaje = Math.max(0, Math.min(100, Math.round(salida.puntaje)));
  const evaluacion: Evaluacion = {
    puntaje,
    categoria: categoriaDe(puntaje),
    resumen: salida.resumen,
    fortalezas: salida.fortalezas.slice(0, 4),
    riesgos: salida.riesgos.slice(0, 4),
    proximoPaso: salida.proximo_paso,
    fuente: "ia",
    fecha: new Date().toISOString(),
    huella: huellaSolicitud(solicitud),
  };
  await modificar<Evaluacion, void>(ARCHIVO, (datos) => {
    datos[solicitud.id] = evaluacion;
  });
  return evaluacion;
}
