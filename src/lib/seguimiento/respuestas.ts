import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Consulta } from "@/types/seguimiento";

/**
 * Respuestas tipo del equipo de atencion (hoja de comandos "/" de la planilla
 * de respuestas). Cada una sabe a que hito responde y que palabras de la
 * consulta la disparan; con eso se sugiere la mas adecuada para cada fila.
 * Los [CORCHETES] son datos que el que responde tiene que completar.
 */
export type RespuestaTipo = {
  comando: string;
  hito: string;
  mensaje: string;
  /** Palabras o frases que, si aparecen en la consulta, suman a favor. */
  disparadores: readonly string[];
  /** Las de la hoja "Rtas RECLAMO" traen el tipo de queja y que hacer puertas adentro. */
  tipoQueja?: string;
  cuando?: string;
  accionInterna?: string;
};

export const RESPUESTAS: readonly RespuestaTipo[] = [
  // --- Alta de cliente ------------------------------------------------------
  {
    comando: "/AltaCli",
    hito: "Alta Cliente",
    disparadores: ["no soy cliente", "primera compra", "ser cliente"],
    mensaje:
      "¡Hola! ¡Gracias por contactarte con nosotros!\n\nPor política de la empresa, solo brindamos información sobre precios y realizamos cotizaciones a nuestros clientes registrados.\n\nTe invitamos a completar el formulario de alta de cliente en el siguiente enlace:\nhttps://depascale.com.ar/comercial/\n\n*Es importante que envíes toda la información solicitada para mayor rapidez en el análisis.\n\nAdemás, para agilizar consultas o pedidos urgentes, te compartimos nuestros proveedores autorizados:\nhttps://depascale.com.ar/nuestros-distribuidores/\n\n¡Muchas gracias! Saludos",
  },
  {
    comando: "/formulario",
    hito: "Alta Cliente",
    disparadores: ["formulario", "alta", "registrarme"],
    mensaje:
      "Completá el formulario de alta y nosotros te confirmamos cuando sea aprobada.\nLink al formulario: https://depascale.com.ar/comercial/",
  },
  {
    comando: "/AltaRecibida",
    hito: "Alta Cliente",
    disparadores: ["envie el formulario", "ya lo complete"],
    mensaje:
      "¡Gracias! Recibimos tu formulario de alta.\n\nNuestro equipo lo está analizando. Te avisamos por este medio apenas esté aprobado (dentro de [PLAZO]).",
  },

  // --- Pedidos --------------------------------------------------------------
  {
    comando: "/PedidoRecibido",
    hito: "Pedido nuevo",
    disparadores: ["pedido", "orden de compra", "oc", "envia oc", "quiero comprar", "pdf"],
    mensaje:
      "¡Gracias por tu pedido!\n\nYa lo recibimos y lo estamos revisando. Antes de [DÍA / HORA] te confirmamos disponibilidad y fecha estimada de entrega.\n\nSi necesitás agregar o modificar algo, avisanos por este medio.",
  },
  {
    comando: "/PedidoUrgente",
    hito: "Pedido nuevo",
    disparadores: ["urgente", "lo antes posible", "hoy", "despacho urgente"],
    mensaje:
      "¡Hola [NOMBRE]!\nRecibimos tu pedido y lo marcamos como URGENTE.\nEstamos verificando stock ítem por ítem y hoy antes de las [HORA] te confirmamos qué sale y cuándo.\nSi algún producto no está disponible, te ofrecemos la alternativa más cercana.",
  },
  {
    comando: "/AgregarPedido",
    hito: "Pedido nuevo",
    disparadores: ["agregar", "sumar", "llega a tiempo", "salga todo junto"],
    mensaje:
      "¡Sí, todavía estás a tiempo!\nEl pedido N° [NRO] aún no fue despachado.\nPasanos lo que querés sumar antes de las [HORA] y sale todo junto.",
  },
  {
    comando: "/Reemplazo",
    hito: "Pedido nuevo",
    disparadores: ["discontinuado", "sustituto", "reemplazo", "sin modificar la oc"],
    mensaje:
      "El código [CÓDIGO] está discontinuado.\nComo reemplazo te ofrecemos [CÓDIGO / DESCRIPCIÓN NUEVO], con las mismas prestaciones.\n¿Lo cargamos así sin modificar tu OC?",
  },
  {
    comando: "/Programado",
    hito: "Pedido nuevo",
    disparadores: ["programado", "lo que queda", "saldo", "parcial", "facturan mensualmente"],
    mensaje:
      "¡Hola [NOMBRE]!\nDel programado te quedan pendientes:\n[DETALLE]\nPodés pedir parciales cuando lo necesites y facturamos [POR ENTREGA / MENSUALMENTE].\n¿Te armamos el próximo despacho para el [FECHA]?",
  },
  {
    comando: "/PedidoWeb",
    hito: "Pedido nuevo",
    disparadores: ["pedido web", "cargar", "plataforma"],
    mensaje:
      "Para agilizar tus próximos pedidos, podés cargarlos directamente en nuestra plataforma de autogestión:\nhttps://idpfiles.depascale.com.ar/Files/login.php\n\nAhí podés cotizar y cargar pedidos de forma autónoma. Si todavía no tenés usuario, avisanos y te lo gestionamos.",
  },

  // --- Estado de pedido -----------------------------------------------------
  {
    comando: "/EstadoPedido",
    hito: "Estado de pedido",
    disparadores: ["estado de su pedido", "donde esta", "cuando llega", "envio", "despacho", "demora", "despachar"],
    mensaje:
      "¡Hola! Te compartimos el estado de tu pedido N° [NRO]:\n\nEstado: [EN PREPARACIÓN / DESPACHADO / LISTO PARA RETIRAR]\nFecha estimada: [FECHA]\nTransporte / N° de guía: [DATO]\n\nCualquier novedad te avisamos por este medio.",
  },
  {
    comando: "/Adelantar",
    hito: "Estado de pedido",
    disparadores: ["adelantar", "antes", "urgencia"],
    mensaje:
      "Entendemos la urgencia.\nEstamos viendo con depósito si podemos adelantar [CANTIDAD] de [PRODUCTO] del programado.\nAntes de las [HORA] te confirmamos una fecha concreta.",
  },
  {
    comando: "/Camion",
    hito: "Estado de pedido",
    disparadores: ["camion", "viaje", "no lo dejen afuera"],
    mensaje:
      "¡Hola!\nSí, el camión pasa por [LOCALIDAD] el [DÍA / FECHA].\nPara que tu pedido entre en ese viaje necesitamos tenerlo confirmado antes del [FECHA LÍMITE].",
  },
  {
    comando: "/PedidoDemorado",
    hito: "Estado de pedido",
    disparadores: ["atrasado", "no llego", "demorado"],
    mensaje:
      "Te escribimos para avisarte que tu pedido N° [NRO] va a tener una demora respecto de la fecha informada. Lamentamos el inconveniente.\n\nMotivo: [MOTIVO BREVE]\nNueva fecha estimada: [FECHA]\n\nSi necesitás una parte con urgencia, podemos evaluar una entrega parcial.",
  },

  // --- Stock ----------------------------------------------------------------
  {
    comando: "/ConsultaStock",
    hito: "Consulta de stock",
    disparadores: ["stock", "hay", "tienen", "disponible", "disponibilidad", "parcial"],
    mensaje:
      "¡Gracias por tu consulta!\n\nEstamos verificando la disponibilidad de [PRODUCTO / CÓDIGO] ([TALLE / CANTIDAD]). Te respondemos antes de [HORA].",
  },
  {
    comando: "/SinStock",
    hito: "Consulta de stock",
    disparadores: ["sin stock", "faltante", "cuando entra", "demora de talle"],
    mensaje:
      "Por el momento no tenemos stock de [PRODUCTO / CÓDIGO].\n\nFecha estimada de ingreso: [FECHA]\nAlternativa disponible: [PRODUCTO ALTERNATIVO]\n\n¿Querés que te reservemos unidades del próximo ingreso o preferís avanzar con la alternativa?",
  },

  // --- Precios --------------------------------------------------------------
  {
    comando: "/PrecioCliente",
    hito: "Consulta precio",
    disparadores: ["precio", "cuanto sale", "valor", "cotizacion", "presupuesto", "cotizar"],
    mensaje:
      "Te compartimos la cotización solicitada:\n\n• Producto: [PRODUCTO / CÓDIGO]\n• Precio unitario: [PRECIO] + IVA\n• Cantidad: [CANTIDAD]\n• Validez: [FECHA]\n• Condición de pago: [CONDICIÓN]\n\n¿Avanzamos con el pedido?",
  },
  {
    comando: "/AutoCoti",
    hito: "Consulta precio",
    disparadores: ["cotizar", "presupuesto"],
    mensaje:
      "Para realizar una cotización, accedé a la plataforma de autogestión con tu usuario y contraseña.\nSi es la primera vez que ingresás, vas a tener que validar tu mail (revisá la carpeta de spam).\n\nLink a la plataforma: https://idpfiles.depascale.com.ar/Files/login.php",
  },
  {
    comando: "/Descuento",
    hito: "Consulta precio",
    disparadores: ["descuento", "bonificacion", "agregando", "por volumen", "cantidad"],
    mensaje:
      "¡Buena consulta!\nCon [CANTIDAD TOTAL] aplica [BONIFICACIÓN / PRECIO POR VOLUMEN].\nTe pasamos el valor actualizado y, si te sirve, lo sumamos al pedido N° [NRO].",
  },
  {
    comando: "/ListaCliente",
    hito: "Lista de precios",
    disparadores: ["lista de precios", "lista actualizada", "modificaciones", "lista"],
    mensaje:
      "Te adjuntamos la lista de precios vigente.\n\nAnte cualquier duda, confirmamos el valor al momento de cargar el pedido.",
  },

  // --- Pagos y cuenta -------------------------------------------------------
  {
    comando: "/PagoRecibido",
    hito: "Informa pago",
    disparadores: ["comprobante", "transferi", "pague", "pago", "cheque"],
    mensaje:
      "¡Gracias! Recibimos tu comprobante de pago.\n\nLo derivamos a Cobranzas para su imputación. Te confirmamos cuando se vea reflejado en tu cuenta (dentro de [PLAZO]).",
  },
  {
    comando: "/Imputacion",
    hito: "Informa pago",
    disparadores: ["cancela", "a cuenta", "imputar", "factura", "saldo pendiente"],
    mensaje:
      "¡Perfecto, tomamos nota!\n[E-CHEQ / CHEQUE N°] cancela la factura de [MES / N° FC] y [CHEQUE N°] queda a cuenta de futuras compras.\nTe confirmamos cuando esté imputado.",
  },
  {
    comando: "/RetiroCheque",
    hito: "Informa pago",
    disparadores: ["fecha de cheque", "retiro", "coordinar retiro", "correo"],
    mensaje:
      "¡Gracias! Tomamos nota del cheque con fecha [DD/MM].\n¿Cómo preferís que lo retiremos?\n• Lo busca el camión el [DÍA]\n• Pasa alguien de [CIUDAD]\n• Lo enviás por correo",
  },
  {
    comando: "/DatosPago",
    hito: "Informa pago",
    disparadores: ["como pago", "datos bancarios", "cbu", "transferencia"],
    mensaje:
      "Te compartimos los datos para realizar el pago:\n\n[DATOS BANCARIOS]\n\nUna vez realizado, envianos el comprobante indicando razón social y facturas que cancela. ¡Gracias!",
  },
  {
    comando: "/EstadoCuenta",
    hito: "Estado de Cuenta",
    disparadores: ["resumen", "saldo", "deuda", "cuenta corriente", "movimientos"],
    mensaje:
      "Te adjuntamos tu resumen de cuenta actualizado al [FECHA].\n\nSi ves alguna diferencia, indicanos el comprobante y lo revisamos.",
  },
  {
    comando: "/EnviarFactura",
    hito: "Enviar Factura",
    disparadores: ["factura", "recibo", "copia de factura", "comprobante"],
    mensaje:
      "Te adjuntamos la factura N° [NRO] correspondiente a tu pedido N° [PEDIDO].\n\nCualquier consulta, estamos a disposición.",
  },
  {
    comando: "/Refacturar",
    hito: "Pedido refacturar",
    disparadores: ["refacturar", "error en factura", "nota de credito", "anular factura"],
    mensaje:
      "Recibimos tu solicitud de refacturación.\n\nPara avanzar necesitamos:\n• N° de factura original\n• Dato a corregir (razón social, CUIT, condición de IVA, precio o cantidad)\n• Motivo del cambio\n\nLo derivamos a Administración y te confirmamos antes de [DÍA].",
  },

  // --- Reclamos -------------------------------------------------------------
  {
    comando: "/Faltante",
    hito: "Reclamo",
    disparadores: ["faltante", "falto", "incompleto", "facturaron solo", "facturaron menos"],
    mensaje:
      "[NOMBRE], tenés razón y te pedimos disculpas.\nEn la OC [NRO] se entregaron [CANTIDAD] de [PRODUCTO] sobre [TOTAL] pedidos.\nYa estamos revisando el saldo pendiente con depósito y hoy antes de las [HORA] te confirmamos la fecha de entrega del faltante.",
  },
  {
    comando: "/NoEnviado",
    hito: "Reclamo",
    disparadores: ["no enviaron", "no llego", "sin respuesta", "??"],
    mensaje:
      "[NOMBRE], disculpá la demora en responderte, no corresponde.\nYa lo verificamos: [PRODUCTO] [QUEDÓ FUERA DEL ENVÍO / ESTÁ EN CAMINO].\nSale el [FECHA] y te pasamos el seguimiento apenas despachemos.",
  },
  {
    comando: "/FallaProducto",
    hito: "Reclamo",
    disparadores: ["falla", "llegaron mal", "llego mal", "defectuoso", "fotos"],
    mensaje:
      "Lamentamos el inconveniente. Para resolverlo lo antes posible, ¿nos podrías enviar:\n• Fotos del producto y de la etiqueta\n• N° de remito o factura\n\nApenas los tengamos lo derivamos a Calidad.",
  },
  {
    comando: "/ReclamoAdmin",
    hito: "Reclamo",
    disparadores: ["cheques rechazados", "rechazo", "nota de credito", "nc", "precio mal"],
    mensaje:
      "[NOMBRE], entendemos tu molestia.\nYa derivamos el caso a Administración para revisar [LOS CHEQUES RECHAZADOS / LA NOTA DE CRÉDITO / EL PRECIO APLICADO].\nMañana antes de las [HORA] te enviamos la cuenta corregida o la NC.",
  },
  {
    comando: "/RECLAMO",
    hito: "Reclamo",
    disparadores: ["reclamo", "problema"],
    mensaje:
      "Lamentamos que hayas tenido un problema.\n\nPor favor, completá el formulario de reclamo para que nuestro equipo lo pueda analizar y darte una solución:\nhttps://depascale.com.ar/wp-content/uploads/2025/07/Formulario-de-reclamo-de-clientes-x-DP.pdf",
  },

  // --- Consultas tecnicas ---------------------------------------------------
  {
    comando: "/FichaTecnica",
    hito: "Consulta Tecnica",
    disparadores: ["ficha tecnica", "especificacion", "certificado", "certificacion"],
    mensaje:
      "Te adjuntamos la ficha técnica de [PRODUCTO / CÓDIGO] con sus características y certificaciones.\n\nSi necesitás asesoramiento sobre el uso, te ayudamos.",
  },
  {
    comando: "/ConsultaTec",
    hito: "Consulta Tecnica",
    disparadores: ["norma", "sirve para", "resistencia", "ignifugo", "dielectrico", "recomiendan"],
    mensaje:
      "¡Buena consulta! Para recomendarte el producto correcto, contanos:\n\n• Actividad o tarea donde se va a usar\n• Riesgo a cubrir (corte, químico, altura, eléctrico, etc.)\n• Norma o certificación requerida (si aplica)\n• Talles y cantidades\n\nLo revisa nuestro equipo técnico y te respondemos antes de [DÍA / HORA].",
  },
  {
    comando: "/Alternativo",
    hito: "Consulta Tecnica",
    disparadores: ["alternativo", "similar", "reemplazo"],
    mensaje:
      "Para [PRODUCTO SOLICITADO] te proponemos como alternativa [PRODUCTO ALTERNATIVO].\n\nCumple con: [CARACTERÍSTICA / NORMA]\nDiferencia principal: [DIFERENCIA]\n\n¿Te sirve? Si querés, te enviamos la ficha técnica.",
  },

  // --- Acceso web -----------------------------------------------------------
  {
    comando: "/UsuarioWeb",
    hito: "Acceso WEB",
    disparadores: ["usuario", "contrasena", "ingresar", "plataforma"],
    mensaje:
      "PRIMER ACCESO A LA PLATAFORMA\n\nIngresá desde acá: https://idpfiles.depascale.com.ar/Files/login.php\nUsuario y contraseña: los tenés en tu grupo de WhatsApp asignado.\n\nEn el primer ingreso el sistema te va a pedir que registres un mail y vas a recibir un correo para validarlo. Después te va a pedir cambiar la clave (¡guardala bien!).",
  },
  {
    comando: "/ClaveWeb",
    hito: "Acceso WEB",
    disparadores: ["olvide la clave", "no puedo entrar", "bloqueado"],
    mensaje:
      "Si olvidaste tu contraseña, ingresá a la plataforma y usá la opción “Olvidé mi clave”:\nhttps://idpfiles.depascale.com.ar/Files/login.php\n\nRevisá también la carpeta de spam. Si no te llega el correo, avisanos y lo resolvemos.",
  },
  {
    comando: "/ErrorWeb",
    hito: "Acceso WEB",
    disparadores: ["error", "no funciona", "no carga"],
    mensaje:
      "Lamentamos el inconveniente con la plataforma. Para revisarlo, envianos:\n• Usuario con el que ingresás\n• Captura de pantalla del error\n• Qué estabas intentando hacer\n\nLo derivamos a Sistemas y te respondemos antes de [DÍA / HORA].",
  },

  // --- Consulta general -----------------------------------------------------
  {
    comando: "/Audio",
    hito: "Consulta General",
    disparadores: ["audio", "nota de voz"],
    mensaje:
      "¡Hola [NOMBRE]!\nRecibimos tu audio, pero en este momento no lo podemos escuchar.\n¿Nos lo podrías escribir así te respondemos más rápido?",
  },
  {
    comando: "/Anotado",
    hito: "Consulta General",
    disparadores: ["no cambiar", "aclaracion", "tener en cuenta"],
    mensaje: "Anotado, [NOMBRE].\nLo dejamos registrado en tu pedido tal cual nos indicaste.",
  },
  {
    comando: "/Camion",
    hito: "Consulta General",
    disparadores: ["camion", "llega el camion"],
    mensaje:
      "¡Hola!\nSí, el camión pasa por [LOCALIDAD] el [DÍA / FECHA].\nPara que tu pedido entre en ese viaje necesitamos tenerlo confirmado antes del [FECHA LÍMITE].",
  },
  {
    comando: "/Descuento",
    hito: "Consulta General",
    disparadores: ["descuento", "agregando cantidad"],
    mensaje:
      "¡Buena consulta!\nCon [CANTIDAD TOTAL] aplica [BONIFICACIÓN / PRECIO POR VOLUMEN].\nTe pasamos el valor actualizado y, si te sirve, lo sumamos al pedido N° [NRO].",
  },
  {
    comando: "/Distribuidores",
    hito: "Consulta General",
    disparadores: ["distribuidor", "donde compro", "cerca"],
    mensaje:
      "Distribuidores autorizados por DE PASCALE:\n\n1. TOPASOL S.A. — Tel: 4460-3181 — pedidos@topasol.com.ar — WhatsApp: +54 9 11 5852-5101\n2. FERROLANDIA — Tel: 11 3789-2413 — info@ferrolandia.com.ar\n3. MIX MASTER MAQ — Tel: 2124-6954 — compras@fernoluz.com\n\nTambién podés verlo en nuestra web: https://depascale.com.ar/nuestros-distribuidores/",
  },
  {
    comando: "/PideDatos",
    hito: "Consulta General",
    disparadores: ["quiero", "necesito", "info", "consulta", "privado", "posible venta"],
    mensaje:
      "Para poder avanzar con tu consulta necesitamos estos datos:\n\n• Razón social o CUIT\n• Código o descripción del producto\n• Talle / color (si aplica)\n• Cantidad\n\nCon eso te respondemos a la brevedad. ¡Gracias!",
  },
  {
    comando: "/SinRtaCliente",
    hito: "Consulta General",
    disparadores: [],
    mensaje:
      "¡Hola! Retomamos tu consulta sobre [TEMA].\n¿Pudiste ver la información que te enviamos? Quedamos atentos para ayudarte a avanzar.",
  },
];

/** Minusculas, sin acentos ni signos (salvo "?"), para comparar frases. */
function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9?]+/g, " ")
    .trim()} `;
}

function contiene(texto: string, frase: string): boolean {
  // Con espacios alrededor, "oc" no coincide dentro de "conos".
  return texto.includes(normalizar(frase));
}

export type Recomendacion = {
  principal: RespuestaTipo | null;
  alternativas: RespuestaTipo[];
  /** Advertencias segun el estado de la cuenta ("NO RESPONDER", "TIENE DEUDA"...). */
  aviso: string | null;
};

/** Avisos que manda la situacion del cliente antes que cualquier respuesta. */
export function avisoEstado(estadoCuenta: string): string | null {
  const estado = normalizarEncabezado(estadoCuenta);
  if (!estado || estado === "ok") return null;
  if (estado.includes("no responder")) return "Cliente marcado NO RESPONDER: preguntar antes de responder.";
  if (estado.includes("deuda")) return "Cliente con deuda: revisar la cuenta antes de comprometer entregas o precios.";
  if (estado.includes("judicial")) return "Cliente en gestión judicial: derivar a Administración.";
  return `Estado de cuenta "${estadoCuenta}": revisarlo antes de responder.`;
}

/**
 * Elige la respuesta tipo para una consulta: pesa el hito (si coincide) y las
 * frases disparadoras que aparecen en el texto. Devuelve la mejor y hasta dos
 * alternativas para que el que responde pueda cambiarla.
 *
 * `catalogo` son las respuestas de las hojas "Rtas RÁPIDAS" y "Rtas RECLAMO"
 * de la planilla; si no se pudieron leer se usan las de este archivo.
 */
export function recomendar(
  consulta: Pick<Consulta, "hito" | "consulta" | "estadoCuenta">,
  catalogo: readonly RespuestaTipo[] = RESPUESTAS,
): Recomendacion {
  const texto = normalizar(consulta.consulta);
  const hito = normalizarEncabezado(consulta.hito);

  const puntuadas = (catalogo.length > 0 ? catalogo : RESPUESTAS).map((respuesta, orden) => {
    const mismoHito = hito !== "" && normalizarEncabezado(respuesta.hito) === hito;
    const coincidencias = respuesta.disparadores.filter((frase) => contiene(texto, frase)).length;
    return { respuesta, orden, puntaje: (mismoHito ? 4 : 0) + coincidencias * 3 };
  })
    .filter((item) => item.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden);

  // Una misma respuesta puede figurar en dos hitos (ej. /Camion): se muestra una vez.
  const elegidas = puntuadas.map((item) => item.respuesta);
  const unicas = elegidas.filter(
    (respuesta, indice) => elegidas.findIndex((otra) => otra.comando === respuesta.comando) === indice,
  );

  return {
    principal: unicas[0] ?? null,
    alternativas: unicas.slice(1, 3),
    aviso: avisoEstado(consulta.estadoCuenta),
  };
}
