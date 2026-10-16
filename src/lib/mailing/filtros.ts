import { normalizarEncabezado } from "@/lib/utils/strings";
import type { Destinatario, FiltrosMailing, TipoMail } from "@/types/mailing";

const DIA_MS = 86_400_000;
/** "Mas de 3 meses sin comprar". */
export const DIAS_INACTIVO = 90;

export const FILTROS_VACIOS: FiltrosMailing = {
  busqueda: "",
  rubro: "",
  provincia: "",
  grupoVendedor: "",
  deuda: "todos",
  compra: "todas",
  clasificaciones: [],
  excluirBloqueados: true,
};

/** Cada tipo de mail arranca con los filtros que tienen sentido para el. */
export function filtrosIniciales(tipo: TipoMail): FiltrosMailing {
  switch (tipo) {
    case "estado_deuda":
      return { ...FILTROS_VACIOS, deuda: "con", excluirBloqueados: false };
    case "estado_al_dia":
      return { ...FILTROS_VACIOS, deuda: "sin" };
    case "factura":
    case "pedido_despachado":
      return { ...FILTROS_VACIOS, compra: "activos", excluirBloqueados: false };
    default:
      return { ...FILTROS_VACIOS };
  }
}

/** Los que no hay que contactar por mail comercial. */
export function bloqueado(destinatario: Destinatario): boolean {
  const situacion = normalizarEncabezado(destinatario.situacion);
  return situacion.includes("no responder") || situacion.includes("judicial");
}

export function diasSinComprar(destinatario: Destinatario, ahora: number): number | null {
  if (!destinatario.ultimaCompra) return null;
  return Math.floor((ahora - new Date(destinatario.ultimaCompra).getTime()) / DIA_MS);
}

export function filtrar(destinatarios: readonly Destinatario[], filtros: FiltrosMailing, ahora: number): Destinatario[] {
  const texto = normalizarEncabezado(filtros.busqueda.trim());
  return destinatarios.filter((destinatario) => {
    if (filtros.rubro && destinatario.rubro !== filtros.rubro) return false;
    if (filtros.provincia && destinatario.provincia !== filtros.provincia) return false;
    if (filtros.grupoVendedor && destinatario.grupoVendedor !== filtros.grupoVendedor) return false;
    if (filtros.deuda === "con" && destinatario.deuda <= 0) return false;
    if (filtros.deuda === "sin" && destinatario.deuda > 0) return false;
    if (filtros.compra !== "todas") {
      const dias = diasSinComprar(destinatario, ahora);
      // Nunca compro cuenta como inactivo.
      const inactivo = dias === null || dias > DIAS_INACTIVO;
      if (filtros.compra === "inactivos" ? !inactivo : inactivo) return false;
    }
    if (filtros.clasificaciones.length > 0 && !filtros.clasificaciones.includes(destinatario.clasificacion)) return false;
    if (filtros.excluirBloqueados && bloqueado(destinatario)) return false;
    if (!texto) return true;
    return [destinatario.nombre, destinatario.codigo, destinatario.email, destinatario.contacto, destinatario.cuit].some(
      (campo) => normalizarEncabezado(campo).includes(texto),
    );
  });
}

/** Valores distintos de un campo, ordenados, para los desplegables. */
export function opcionesDe(
  destinatarios: readonly Destinatario[],
  campo: "rubro" | "provincia" | "grupoVendedor",
): string[] {
  return [...new Set(destinatarios.map((destinatario) => destinatario[campo]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}
