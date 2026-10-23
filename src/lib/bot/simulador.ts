import type { EntradaBot } from "@/lib/db/postgres/seguimiento";

/**
 * Simulador del bot de WhatsApp, mientras el bot real sigue escribiendo en la
 * planilla. Genera mensajes con la misma forma que mandaria el bot
 * (POST /api/bot/consultas), para clientes que ya estan en la base.
 */

export type ClienteBot = { codigo: string; nombre: string; grupoWhatsapp: string };

const PRODUCTOS = [
  "guante moteado talle 8",
  "guante anticorte nivel 5",
  "anteojo negro patilla recta",
  "protector auditivo de copa",
  "semimáscara doble filtro",
  "arnés 3 argollas",
  "casco amarillo con arnés",
  "botín puntera de acero",
  "chaleco vial amarillo",
];

type Plantilla = { hito: string; peso: number; textos: readonly ((v: Valores) => string)[] };
type Valores = { producto: string; cantidad: number; numero: number; monto: string; talle: number };

const PLANTILLAS: readonly Plantilla[] = [
  {
    hito: "Pedido nuevo",
    peso: 6,
    textos: [
      (v) => `Cliente envía orden de compra N°${v.numero} para procesar.`,
      (v) => `Pide cargar pedido de ${v.cantidad} pares de ${v.producto}.`,
      () => `Cliente envía pedido por foto ("Les paso un pedido!").`,
    ],
  },
  {
    hito: "Estado de pedido",
    peso: 5,
    textos: [
      (v) => `Pregunta cuándo despachan el pedido ${v.numero}.`,
      (v) => `Consulta si el pedido ${v.numero} ya salió y con qué transporte.`,
    ],
  },
  {
    hito: "Reclamo",
    peso: 3,
    textos: [
      (v) => `Faltante en la entrega: llegaron ${v.cantidad} unidades menos de ${v.producto}.`,
      (v) => `Informa falla en ${v.producto}: se rompen al poco uso.`,
    ],
  },
  { hito: "Consulta precio", peso: 4, textos: [(v) => `Pide precio de ${v.cantidad} unidades de ${v.producto}.`] },
  { hito: "Consulta de stock", peso: 3, textos: [(v) => `Consulta stock de ${v.producto} talle ${v.talle}.`] },
  { hito: "Informa pago", peso: 3, textos: [(v) => `Envía comprobante de transferencia por $${v.monto}.`] },
  { hito: "Estado de Cuenta", peso: 2, textos: [() => "Pide el estado de cuenta actualizado."] },
  { hito: "Pedido refacturar", peso: 2, textos: [(v) => `Pide refacturar la factura 0001-${v.numero} a otra razón social.`] },
  { hito: "Enviar Factura", peso: 1, textos: [(v) => `Pide reenviar la factura 0001-${v.numero}.`] },
  { hito: "Consulta Tecnica", peso: 1, textos: [(v) => `Consulta la certificación de ${v.producto}.`] },
];

function elegir<T>(lista: readonly T[], azar: () => number): T {
  return lista[Math.floor(azar() * lista.length)];
}

/**
 * `cantidad` mensajes de clientes al azar. Las fechas se reparten entre
 * `desde` y `hasta` (por defecto, ahora mismo).
 */
export function simularMensajes(
  clientes: readonly ClienteBot[],
  cantidad: number,
  { desde = Date.now(), hasta = Date.now(), azar = Math.random }: { desde?: number; hasta?: number; azar?: () => number } = {},
): EntradaBot[] {
  if (clientes.length === 0) return [];
  const pesoTotal = PLANTILLAS.reduce((suma, plantilla) => suma + plantilla.peso, 0);
  return Array.from({ length: cantidad }, () => {
    let resto = azar() * pesoTotal;
    const plantilla = PLANTILLAS.find((item) => (resto -= item.peso) <= 0) ?? PLANTILLAS[0];
    const cliente = elegir(clientes, azar);
    const valores: Valores = {
      producto: elegir(PRODUCTOS, azar),
      cantidad: 12 * (1 + Math.floor(azar() * 20)),
      numero: 10_000 + Math.floor(azar() * 90_000),
      monto: (50_000 + Math.floor(azar() * 900) * 1_000).toLocaleString("es-AR"),
      talle: 7 + Math.floor(azar() * 5),
    };
    const fecha = new Date(desde + azar() * Math.max(0, hasta - desde));
    return {
      cliente: `${cliente.codigo} - ${cliente.nombre}`,
      consulta: elegir(plantilla.textos, azar)(valores),
      hito: plantilla.hito,
      fecha: fecha.toISOString(),
      encargado: "bot",
      grupoWhatsapp: cliente.grupoWhatsapp,
      mensajeId: `sim-${crypto.randomUUID()}`,
    };
  });
}
