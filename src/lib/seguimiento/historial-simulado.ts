import type { EventoHistorial, Relacion, Resultado } from "@/types/seguimiento";

/**
 * Historial simulado de un cliente para el prototipo: un año de chats
 * resueltos con algunos episodios en riesgo (faltantes, calidad,
 * facturacion) que escalan y despues se recuperan. Se genera con una semilla
 * que sale del cliente: siempre da lo mismo para el mismo cliente. No se
 * guarda en ningun lado.
 */

const DIA = 86_400_000;

function semillaDe(texto: string): number {
  let hash = 2166136261;
  for (const letra of texto) hash = Math.imul(hash ^ letra.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function azar(semilla: number) {
  let estado = semilla;
  const numero = () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero,
    entre: (minimo: number, maximo: number) => minimo + Math.floor(numero() * (maximo - minimo + 1)),
    uno: <T,>(lista: readonly T[]): T => lista[Math.floor(numero() * lista.length)],
    si: (probabilidad: number) => numero() < probabilidad,
  };
}

type Paso = { hito: string; mensaje: string; relacion: Relacion; resultado: Resultado; observacion: string };

/** Chats del dia a dia: la relacion esta bien. */
const RUTINA: readonly ((n: number) => Paso)[] = [
  (n) => ({ hito: "Pedido nuevo", mensaje: `Envía la OC ${n} para cargar el pedido mensual de guantes y anteojos.`, relacion: "BUENA", resultado: "Resuelto", observacion: "Pedido cargado y confirmado." }),
  (n) => ({ hito: "Pedido nuevo", mensaje: `Pide sumar 240 pares de guante anticorte al pedido ${n}.`, relacion: "BUENA", resultado: "Resuelto", observacion: "Se agregó al pedido." }),
  () => ({ hito: "Consulta de stock", mensaje: "Consulta stock de botín de seguridad talle 42 y 43.", relacion: "BUENA", resultado: "Resuelto", observacion: "Hay stock, se le pasó la disponibilidad." }),
  () => ({ hito: "Consulta precio", mensaje: "Pide cotización de semimáscara doble filtro por 100 unidades.", relacion: "BUENA", resultado: "Resuelto", observacion: "Cotización enviada." }),
  (n) => ({ hito: "Informa pago", mensaje: `Envía comprobante de transferencia por la factura ${n}.`, relacion: "BUENA", resultado: "Resuelto", observacion: "Pago imputado." }),
  (n) => ({ hito: "Estado de pedido", mensaje: `Pregunta si el pedido ${n} sale esta semana.`, relacion: "BUENA", resultado: "Resuelto", observacion: "Sale el jueves con el transporte habitual." }),
  () => ({ hito: "Lista de precios", mensaje: "Pide la lista de precios actualizada del mes.", relacion: "BUENA", resultado: "Resuelto", observacion: "Lista enviada por mail." }),
  (n) => ({ hito: "Estado de pedido", mensaje: `Consulta demora del pedido ${n}, lo esperaban ayer.`, relacion: "REGULAR", resultado: "Resuelto", observacion: "Se reprogramó la entrega para el día siguiente." }),
  (n) => ({ hito: "Pedido refacturar", mensaje: `Pide refacturar la factura ${n} a la razón social correcta.`, relacion: "REGULAR", resultado: "Derivado a otra area", observacion: "Derivado a administración." }),
];

/** Episodios en riesgo: escalan y despues se recuperan. */
const EPISODIOS: readonly { causa: string; pasos: readonly ((n: number) => Paso)[] }[] = [
  {
    causa: "Faltantes reiterados",
    pasos: [
      (n) => ({ hito: "Reclamo", mensaje: `Faltaron 2 cajas del pedido ${n}.`, relacion: "REGULAR", resultado: "Resuelto parcialmente", observacion: "Se envían las cajas con el próximo despacho." }),
      () => ({ hito: "Reclamo", mensaje: "Otra vez llegó incompleto. Es el tercer faltante del mes y tienen la obra parada.", relacion: "EN_RIESGO", resultado: "Escalado a gerencia", observacion: "Se escaló a gerencia por reiteración." }),
      () => ({ hito: "Reclamo", mensaje: "Si esta semana no se resuelve, empiezan a comprarle a otro proveedor.", relacion: "EN_RIESGO", resultado: "Escalado a gerencia", observacion: "Gerencia llamó al cliente y ofreció envío urgente sin cargo." }),
      () => ({ hito: "Estado de pedido", mensaje: "Confirma que llegó todo completo. Agradece el envío urgente.", relacion: "REGULAR", resultado: "Resuelto", observacion: "Faltantes repuestos; seguimiento semanal por un mes." }),
      (n) => ({ hito: "Pedido nuevo", mensaje: `Vuelve a mandar su pedido habitual (OC ${n}).`, relacion: "BUENA", resultado: "Resuelto", observacion: "Relación normalizada." }),
    ],
  },
  {
    causa: "Problema de calidad en un lote",
    pasos: [
      () => ({ hito: "Reclamo", mensaje: "Varios guantes del lote L2406-118 se descosen en la primera semana.", relacion: "REGULAR", resultado: "Derivado a otra area", observacion: "Derivado a Calidad para análisis del lote." }),
      () => ({ hito: "Reclamo", mensaje: "Rechazan el resto del lote: los operarios se quejan y el jefe de seguridad está molesto.", relacion: "EN_RIESGO", resultado: "Escalado a gerencia", observacion: "Calidad confirmó la falla del lote." }),
      () => ({ hito: "Reclamo", mensaje: "Piden retiro inmediato y reposición; amenazan con dar de baja la cuenta.", relacion: "EN_RIESGO", resultado: "Escalado a gerencia", observacion: "Se coordinó retiro y cambio por lote nuevo + nota de crédito." }),
      () => ({ hito: "Consulta General", mensaje: "Recibieron la reposición. Los guantes nuevos están bien.", relacion: "BUENA", resultado: "Resuelto", observacion: "Cliente conforme con la reposición." }),
    ],
  },
  {
    causa: "Errores de facturación",
    pasos: [
      (n) => ({ hito: "Enviar Factura", mensaje: `La factura ${n} vino con precio distinto al de la OC.`, relacion: "REGULAR", resultado: "Derivado a otra area", observacion: "Administración revisa la diferencia." }),
      () => ({ hito: "Reclamo", mensaje: "Hace 30 días que esperan la nota de crédito. Están cansados de reclamar lo mismo.", relacion: "EN_RIESGO", resultado: "Escalado a gerencia", observacion: "Se priorizó la nota de crédito." }),
      () => ({ hito: "Estado de Cuenta", mensaje: "Recibieron la nota de crédito y el estado de cuenta corregido.", relacion: "REGULAR", resultado: "Resuelto", observacion: "Cuenta conciliada." }),
      (n) => ({ hito: "Pedido nuevo", mensaje: `Envía la OC ${n}; pide que esta vez revisen los precios antes de facturar.`, relacion: "BUENA", resultado: "Resuelto", observacion: "Pedido cargado con control de precios." }),
    ],
  },
];

const AGENTES = ["Eli", "Jony", "Exe", "Marce"] as const;
const NOTAS = ["Llamar el lunes para confirmar.", "Pidió que le escriban por la mañana.", "Prefiere que lo contacten por mail."] as const;

export function historialSimulado(cliente: string, ahora = new Date(), meses = 12): EventoHistorial[] {
  const r = azar(semillaDe(cliente));
  const inicio = ahora.getTime() - meses * 30 * DIA;
  const eventos: EventoHistorial[] = [];
  let numero = 4000 + r.entre(0, 900);

  // Momentos (en dias desde el inicio) en que arranca cada episodio de riesgo.
  const episodios = [...EPISODIOS]
    .sort(() => r.numero() - 0.5)
    .slice(0, 3)
    .map((episodio, indice) => ({ episodio, dia: Math.round(((indice + 0.6) * meses * 30) / 3.4) + r.entre(-10, 10) }));

  const agregar = (dia: number, paso: Paso, tipo: EventoHistorial["tipo"] = "finalizada") => {
    const fecha = new Date(inicio + dia * DIA + r.entre(9, 17) * 3_600_000 + r.entre(0, 59) * 60_000);
    if (fecha > ahora) return;
    numero += r.entre(3, 40);
    eventos.push({
      id: `sim-${eventos.length}`,
      consultaId: `sim-${eventos.length}`,
      cliente,
      hito: paso.hito,
      fecha: fecha.toISOString(),
      tipo,
      resultado: tipo === "finalizada" ? paso.resultado : null,
      relacion: tipo === "finalizada" ? paso.relacion : null,
      observacion: paso.observacion,
      consulta: paso.mensaje,
      encargado: paso.relacion === "EN_RIESGO" && r.si(0.5) ? "Gerencia" : r.uno(AGENTES),
    });
  };

  // Rutina: una o dos conversaciones por semana, salvo durante los episodios.
  for (let dia = 2; dia < meses * 30; dia += r.entre(4, 9)) {
    const enEpisodio = episodios.some(({ episodio, dia: comienzo }) => dia >= comienzo && dia <= comienzo + episodio.pasos.length * 4);
    if (enEpisodio) continue;
    agregar(dia, r.uno(RUTINA)(numero));
    if (r.si(0.12)) agregar(dia + 1, { ...r.uno(RUTINA)(numero), observacion: r.uno(NOTAS) }, "nota");
  }

  // Episodios: un paso cada 2 a 5 dias; a veces se reabre el chat en lo peor.
  for (const { episodio, dia } of episodios) {
    let momento = dia;
    for (const paso of episodio.pasos) {
      agregar(momento, paso(numero));
      if (paso(numero).relacion === "EN_RIESGO" && r.si(0.3)) agregar(momento + 1, paso(numero), "reabierta");
      momento += r.entre(2, 5);
    }
  }

  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
