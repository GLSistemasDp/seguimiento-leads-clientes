import type { CotizacionUsuario, FacturaUsuario, FichaUsuario, ItemUsuario, PedidoUsuario } from "@/types/usuarios";

/**
 * Calculos de una cuenta clave: cuenta corriente, deuda, inactividad,
 * cotizaciones abiertas y productos habituales. Funciones puras: reciben la
 * ficha y el dia de hoy ("AAAA-MM-DD", hora de Argentina).
 */

/** Meses de compras que se miran para saber que productos son habituales. */
export const MESES_HABITUALES = 6;
/** En cuantos pedidos de ese periodo tiene que aparecer un producto para ser habitual. */
export const MIN_PEDIDOS_HABITUAL = 3;
/**
 * Pedidos hechos hasta estos dias antes del ultimo cuentan como la misma
 * compra: un pedido complementario no deja "ausente" lo que vino en el anterior.
 */
export const DIAS_MISMA_COMPRA = 10;

const DIA_MS = 86_400_000;

export function hoyArgentina(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export const totalItems = (items: readonly ItemUsuario[]) =>
  redondear(items.reduce((total, item) => total + item.cantidad * item.precioUnitario, 0));

export const dineroUsuario = (valor: number, moneda: FichaUsuario["moneda"]) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(valor);

export function fechaUsuario(fecha: string): string {
  if (!fecha) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(fecha.length === 10 ? `${fecha}T12:00:00Z` : fecha),
  );
}

/** El dia ("AAAA-MM-DD", Argentina) de una fecha comercial o de un momento ISO. */
export function diaDe(fecha: string): string {
  return fecha.length === 10 ? fecha : hoyArgentina(new Date(fecha));
}

/** Dias corridos entre dos dias (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA_MS);
}

export function sumarDias(dia: string, cantidad: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + cantidad * DIA_MS).toISOString().slice(0, 10);
}

function restarMeses(dia: string, meses: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha.toISOString().slice(0, 10);
}

// --- Facturas y cuenta corriente ----------------------------------------------

export type EstadoFactura = "PENDIENTE" | "PARCIAL" | "PAGADA";
export const ESTADOS_FACTURA: Record<EstadoFactura, string> = { PENDIENTE: "Pendiente", PARCIAL: "Parcial", PAGADA: "Pagada" };

export type FacturaConEstado = FacturaUsuario & {
  /** Pagos imputados mas notas de credito. */
  pagado: number;
  saldo: number;
  estado: EstadoFactura;
  /** Con saldo y ya vencida. */
  vencida: boolean;
  diasMora: number;
};

/** Cada factura con lo que se le imputo, su saldo y su estado. */
export function facturasConEstado(ficha: Pick<FichaUsuario, "facturas" | "pagos" | "notasCredito">, hoy: string): FacturaConEstado[] {
  const pagado = new Map<string, number>();
  const sumar = (facturaId: string, importe: number) => pagado.set(facturaId, (pagado.get(facturaId) ?? 0) + importe);
  for (const pago of ficha.pagos) for (const imputacion of pago.imputaciones) sumar(imputacion.facturaId, imputacion.importe);
  for (const nota of ficha.notasCredito) sumar(nota.facturaId, nota.importe);

  return ficha.facturas
    .filter((factura) => factura.fecha <= hoy)
    .map((factura) => {
      const cubierto = redondear(Math.min(factura.total, pagado.get(factura.id) ?? 0));
      const saldo = redondear(factura.total - cubierto);
      const vencida = saldo > 0 && factura.vencimiento < hoy;
      return {
        ...factura,
        pagado: cubierto,
        saldo,
        estado: saldo <= 0 ? "PAGADA" : cubierto > 0 ? "PARCIAL" : "PENDIENTE",
        vencida,
        diasMora: vencida ? diasEntre(factura.vencimiento, hoy) : 0,
      } satisfies FacturaConEstado;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type MovimientoCuenta = {
  id: string;
  fecha: string;
  tipo: "FACTURA" | "NOTA_CREDITO" | "PAGO";
  comprobante: string;
  detalle: string;
  debe: number;
  haber: number;
  /** Saldo acumulado despues del movimiento (positivo = el cliente debe). */
  saldo: number;
};

/** Cuenta corriente: facturas al debe, notas de credito y recibos al haber, con saldo acumulado. */
export function cuentaCorriente(ficha: Pick<FichaUsuario, "facturas" | "pagos" | "notasCredito">, hoy: string): MovimientoCuenta[] {
  const numeroFactura = new Map(ficha.facturas.map((factura) => [factura.id, factura.numero]));
  const movimientos: Omit<MovimientoCuenta, "saldo">[] = [
    ...ficha.facturas.map((factura) => ({
      id: `factura-${factura.id}`, fecha: factura.fecha, tipo: "FACTURA" as const, comprobante: factura.numero,
      detalle: `Vence ${fechaUsuario(factura.vencimiento)}`, debe: factura.total, haber: 0,
    })),
    ...ficha.notasCredito.map((nota) => ({
      id: `nc-${nota.id}`, fecha: nota.fecha, tipo: "NOTA_CREDITO" as const, comprobante: nota.numero,
      detalle: `${nota.motivo || "Nota de crédito"} · sobre ${numeroFactura.get(nota.facturaId) ?? "factura"}`, debe: 0, haber: nota.importe,
    })),
    ...ficha.pagos.map((pago) => ({
      id: `pago-${pago.id}`, fecha: pago.fecha, tipo: "PAGO" as const, comprobante: pago.numero,
      detalle: pago.imputaciones.length
        ? `Aplicado a ${pago.imputaciones.map((imputacion) => numeroFactura.get(imputacion.facturaId) ?? "factura").join(", ")}`
        : "Pago a cuenta",
      debe: 0, haber: pago.importe,
    })),
  ];
  const ORDEN = { FACTURA: 0, NOTA_CREDITO: 1, PAGO: 2 } as const;
  let saldo = 0;
  return movimientos
    .filter((movimiento) => movimiento.fecha <= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN[a.tipo] - ORDEN[b.tipo] || a.comprobante.localeCompare(b.comprobante))
    .map((movimiento) => {
      saldo = redondear(saldo + movimiento.debe - movimiento.haber);
      return { ...movimiento, saldo };
    });
}

// --- Seguimiento ----------------------------------------------------------------

export type UltimoContacto = { fecha: string | null; origen: "parte" | "pedido" | null; dias: number | null };

/** El ultimo parte o pedido (lo mas reciente), y cuantos dias pasaron. */
export function ultimoContacto(ficha: Pick<FichaUsuario, "partes" | "pedidos">, hoy: string): UltimoContacto {
  const parte = ficha.partes.map((item) => diaDe(item.fecha)).filter((dia) => dia <= hoy).sort().at(-1) ?? null;
  const pedido = ficha.pedidos.filter((item) => item.estado !== "CANCELADO" && item.fecha <= hoy).map((item) => item.fecha).sort().at(-1) ?? null;
  if (!parte && !pedido) return { fecha: null, origen: null, dias: null };
  const origen = !pedido || (parte && parte >= pedido) ? "parte" : "pedido";
  const fecha = origen === "parte" ? parte! : pedido!;
  return { fecha, origen, dias: Math.max(0, diasEntre(fecha, hoy)) };
}

/** Proxima fecha de contacto: la del parte mas reciente que la tenga. */
export function proximoContacto(ficha: Pick<FichaUsuario, "partes">): string {
  return [...ficha.partes].sort((a, b) => b.fecha.localeCompare(a.fecha)).find((parte) => parte.proximoContacto)?.proximoContacto ?? "";
}

export const ABIERTAS: readonly CotizacionUsuario["estado"][] = ["ENVIADA", "EN_NEGOCIACION"];

/** Pedidos todavia sin entregar (los cancelados no cuentan). */
export const EN_CURSO: readonly PedidoUsuario["estado"][] = ["RECIBIDO", "EN_PREPARACION", "DESPACHADO"];

export function pedidosPendientes(ficha: Pick<FichaUsuario, "pedidos">, hoy: string): PedidoUsuario[] {
  return ficha.pedidos.filter((pedido) => EN_CURSO.includes(pedido.estado) && pedido.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function cotizacionesAbiertas(ficha: Pick<FichaUsuario, "cotizaciones">): CotizacionUsuario[] {
  return ficha.cotizaciones.filter((cotizacion) => ABIERTAS.includes(cotizacion.estado));
}

export type ResumenUsuario = ReturnType<typeof resumenUsuario>;

/** Los numeros de la cuenta para la lista, el encabezado y las alertas. */
export function resumenUsuario(ficha: FichaUsuario, hoy: string) {
  const facturas = facturasConEstado(ficha, hoy);
  const movimientos = cuentaCorriente(ficha, hoy);
  const saldo = movimientos.at(-1)?.saldo ?? 0;
  const vencidas = facturas.filter((factura) => factura.vencida);
  const anio = hoy.slice(0, 4);
  const facturacionAnio = redondear(facturas.filter((factura) => factura.fecha.startsWith(anio)).reduce((total, factura) => total + factura.total, 0));
  // Mismo tramo del año anterior, para no leer el año en curso como una caida.
  const anioAnterior = String(Number(anio) - 1);
  const facturacionAnterior = redondear(
    ficha.facturas.filter((factura) => factura.fecha.startsWith(anioAnterior) && factura.fecha.slice(4) <= hoy.slice(4)).reduce((total, factura) => total + factura.total, 0),
  );
  const abiertas = cotizacionesAbiertas(ficha);
  const enCurso = pedidosPendientes(ficha, hoy);
  const contacto = ultimoContacto(ficha, hoy);
  const requiereSeguimiento = contacto.dias === null || contacto.dias > ficha.umbralSeguimientoDias;
  return {
    saldo,
    deudaVencida: redondear(vencidas.reduce((total, factura) => total + factura.saldo, 0)),
    facturasVencidas: vencidas.length,
    mayorMora: vencidas.reduce((maximo, factura) => Math.max(maximo, factura.diasMora), 0),
    creditoDisponible: redondear(ficha.limiteCredito - Math.max(0, saldo)),
    facturacionAnio,
    variacionAnual: facturacionAnterior ? Math.round(((facturacionAnio - facturacionAnterior) / facturacionAnterior) * 100) : null,
    cotizacionesAbiertas: abiertas.length,
    importeCotizaciones: redondear(abiertas.reduce((total, cotizacion) => total + totalItems(cotizacion.items), 0)),
    pedidosPendientes: enCurso.length,
    importePedidosPendientes: redondear(enCurso.reduce((total, pedido) => total + totalItems(pedido.items), 0)),
    contacto,
    requiereSeguimiento,
    proximoContacto: proximoContacto(ficha),
  };
}

// --- Productos habituales ---------------------------------------------------------

export type ProductoHabitual = {
  sku: string;
  descripcion: string;
  linea: string;
  /** En cuantos de los pedidos analizados aparece. */
  veces: number;
  cantidadPromedio: number;
  /** Ultimo pedido (anterior al ultimo) en que lo llevo. */
  ultimaVez: string;
  ultimoPrecio: number;
  enUltimoPedido: boolean;
};

export type AnalisisHabituales = {
  ultimoPedido: PedidoUsuario | null;
  /** Pedidos de los dias previos al ultimo que se toman como la misma compra. */
  complementos: PedidoUsuario[];
  /** Pedidos de los ultimos meses, sin contar la ultima compra. */
  pedidosAnalizados: number;
  habituales: ProductoHabitual[];
  /** Habituales que no vinieron en el ultimo pedido: para ofrecer en el proximo llamado. */
  ausentes: ProductoHabitual[];
};

/**
 * Productos habituales contra el ultimo pedido: mira los pedidos de los
 * ultimos MESES_HABITUALES meses (sin los cancelados), toma como habitual lo
 * que aparece en MIN_PEDIDOS_HABITUAL o mas, y marca lo que falta en la ultima
 * compra (el ultimo pedido y los de los DIAS_MISMA_COMPRA dias anteriores).
 */
export function productosHabituales(ficha: Pick<FichaUsuario, "pedidos">, hoy: string): AnalisisHabituales {
  const desde = restarMeses(hoy, MESES_HABITUALES);
  const pedidos = ficha.pedidos
    .filter((pedido) => pedido.estado !== "CANCELADO" && pedido.fecha <= hoy && pedido.fecha > desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero));
  const ultimoPedido = pedidos.at(-1) ?? null;
  const desdeUltimaCompra = ultimoPedido ? sumarDias(ultimoPedido.fecha, -DIAS_MISMA_COMPRA) : "";
  const ultimaCompra = pedidos.filter((pedido) => pedido.fecha >= desdeUltimaCompra);
  const previos = pedidos.filter((pedido) => pedido.fecha < desdeUltimaCompra);
  const enUltimo = new Set(ultimaCompra.flatMap((pedido) => pedido.items.map((item) => item.sku)));

  const productos = new Map<string, ProductoHabitual & { cantidad: number }>();
  for (const pedido of previos) {
    for (const sku of new Set(pedido.items.map((item) => item.sku))) {
      const renglones = pedido.items.filter((item) => item.sku === sku);
      const item = renglones[0];
      const actual = productos.get(sku) ?? {
        sku, descripcion: item.descripcion, linea: item.linea, veces: 0, cantidad: 0, cantidadPromedio: 0,
        ultimaVez: pedido.fecha, ultimoPrecio: item.precioUnitario, enUltimoPedido: enUltimo.has(sku),
      };
      actual.veces += 1;
      actual.cantidad += renglones.reduce((total, renglon) => total + renglon.cantidad, 0);
      actual.ultimaVez = pedido.fecha;
      actual.ultimoPrecio = item.precioUnitario;
      productos.set(sku, actual);
    }
  }
  const habituales = [...productos.values()]
    .filter((producto) => producto.veces >= MIN_PEDIDOS_HABITUAL)
    .map(({ cantidad, ...producto }) => ({ ...producto, cantidadPromedio: Math.round(cantidad / producto.veces) }))
    .sort((a, b) => b.veces - a.veces || b.cantidadPromedio * b.ultimoPrecio - a.cantidadPromedio * a.ultimoPrecio);
  return {
    ultimoPedido,
    complementos: ultimaCompra.filter((pedido) => pedido !== ultimoPedido),
    pedidosAnalizados: previos.length,
    habituales,
    ausentes: habituales.filter((producto) => !producto.enUltimoPedido),
  };
}

// --- Facturacion mensual ----------------------------------------------------------

const MES_CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "short" });

/** Facturacion de los ultimos meses (el ultimo es el mes en curso), para ver estacionalidad o caidas. */
export function facturacionMensual(ficha: Pick<FichaUsuario, "facturas">, hoy: string, meses = 12): { mes: string; etiqueta: string; total: number }[] {
  const serie = Array.from({ length: meses }, (_, indice) => {
    const fecha = new Date(`${hoy.slice(0, 7)}-15T12:00:00Z`);
    fecha.setUTCMonth(fecha.getUTCMonth() - (meses - 1 - indice));
    const mes = fecha.toISOString().slice(0, 7);
    return { mes, etiqueta: `${MES_CORTO.format(fecha).replace(".", "")} ${mes.slice(2, 4)}`, total: 0 };
  });
  const porMes = new Map(serie.map((punto) => [punto.mes, punto]));
  for (const factura of ficha.facturas) {
    const punto = factura.fecha <= hoy ? porMes.get(factura.fecha.slice(0, 7)) : undefined;
    if (punto) punto.total = redondear(punto.total + factura.total);
  }
  return serie;
}
