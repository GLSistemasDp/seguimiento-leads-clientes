import { redondear } from "@/lib/usuarios/analisis";
import type { ResumenUsuario } from "@/lib/usuarios/analisis";
import { normalizarEncabezado } from "@/lib/utils/strings";
import type { FichaUsuario } from "@/types/usuarios";

/**
 * Vista de toda la cartera de cuentas clave: estado de cuenta de cada una,
 * filtros por alerta, busqueda y totales. Funciones puras.
 */

export type EstadoCuenta = "VENCIDA" | "EXCEDIDA" | "SALDO" | "AL_DIA";
export const ESTADOS_CUENTA: Record<EstadoCuenta, string> = {
  VENCIDA: "Deuda vencida",
  EXCEDIDA: "Crédito excedido",
  SALDO: "Con saldo en plazo",
  AL_DIA: "Al día",
};

/** Estado de cuenta en una palabra: lo mas grave primero. */
export function estadoCuenta(resumen: ResumenUsuario): EstadoCuenta {
  if (resumen.facturasVencidas > 0) return "VENCIDA";
  if (resumen.creditoDisponible < 0) return "EXCEDIDA";
  if (resumen.saldo > 0) return "SALDO";
  return "AL_DIA";
}

export const FILTROS_CARTERA = {
  todos: "Todos",
  deuda: "Con deuda vencida",
  pedidos: "Pedidos pendientes",
  seguimiento: "Seguimiento pendiente",
  cotizaciones: "Cotizaciones abiertas",
} as const;
export type FiltroCartera = keyof typeof FILTROS_CARTERA;

export function cumpleFiltro(filtro: FiltroCartera, resumen: ResumenUsuario): boolean {
  if (filtro === "deuda") return resumen.facturasVencidas > 0;
  if (filtro === "pedidos") return resumen.pedidosPendientes > 0;
  if (filtro === "seguimiento") return resumen.requiereSeguimiento;
  if (filtro === "cotizaciones") return resumen.cotizacionesAbiertas > 0;
  return true;
}

/** Busca por razon social, nombre de fantasia, codigo, CUIT (con o sin guiones) o contacto. */
export function coincideBusqueda(ficha: FichaUsuario, busqueda: string): boolean {
  const texto = normalizarEncabezado(busqueda);
  if (!texto) return true;
  const digitos = busqueda.replace(/\D/g, "");
  if (digitos.length >= 3 && ficha.cuit.replace(/\D/g, "").includes(digitos)) return true;
  return [ficha.nombre, ficha.fantasia, ficha.codigo, ...ficha.contactos.map((contacto) => contacto.nombre)].some((campo) =>
    normalizarEncabezado(campo).includes(texto),
  );
}

/** Orden de la cartera: primero lo que hay que atender (deuda vencida, seguimiento), despues por nombre. */
export function ordenarCartera(fichas: readonly FichaUsuario[], resumenes: ReadonlyMap<string, ResumenUsuario>): FichaUsuario[] {
  const peso = (ficha: FichaUsuario) => {
    const resumen = resumenes.get(ficha.codigo)!;
    return (resumen.facturasVencidas > 0 ? 4 : 0) + (resumen.creditoDisponible < 0 ? 2 : 0) + (resumen.requiereSeguimiento ? 1 : 0);
  };
  return [...fichas].sort((a, b) => peso(b) - peso(a) || a.nombre.localeCompare(b.nombre, "es"));
}

export type TotalesCartera = {
  cuentas: number;
  saldo: number;
  deudaVencida: number;
  conDeudaVencida: number;
  limiteCredito: number;
  creditoDisponible: number;
  pedidosPendientes: number;
  importePedidosPendientes: number;
  cotizacionesAbiertas: number;
  importeCotizaciones: number;
  requierenSeguimiento: number;
  facturacionAnio: number;
};

/** Totales de la cartera. Suma importes de una sola moneda (todas las cuentas de ejemplo estan en USD). */
export function totalesCartera(fichas: readonly FichaUsuario[], resumenes: ReadonlyMap<string, ResumenUsuario>): TotalesCartera {
  const total = (valor: (resumen: ResumenUsuario) => number) => redondear(fichas.reduce((suma, ficha) => suma + valor(resumenes.get(ficha.codigo)!), 0));
  const cuantas = (condicion: (resumen: ResumenUsuario) => boolean) => fichas.filter((ficha) => condicion(resumenes.get(ficha.codigo)!)).length;
  return {
    cuentas: fichas.length,
    saldo: total((resumen) => resumen.saldo),
    deudaVencida: total((resumen) => resumen.deudaVencida),
    conDeudaVencida: cuantas((resumen) => resumen.facturasVencidas > 0),
    limiteCredito: redondear(fichas.reduce((suma, ficha) => suma + ficha.limiteCredito, 0)),
    creditoDisponible: total((resumen) => resumen.creditoDisponible),
    pedidosPendientes: total((resumen) => resumen.pedidosPendientes),
    importePedidosPendientes: total((resumen) => resumen.importePedidosPendientes),
    cotizacionesAbiertas: total((resumen) => resumen.cotizacionesAbiertas),
    importeCotizaciones: total((resumen) => resumen.importeCotizaciones),
    requierenSeguimiento: cuantas((resumen) => resumen.requiereSeguimiento),
    facturacionAnio: total((resumen) => resumen.facturacionAnio),
  };
}
