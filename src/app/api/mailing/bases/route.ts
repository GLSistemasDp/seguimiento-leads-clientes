import { NextResponse } from "next/server";
import { guardarBase } from "@/lib/db/mailing";
import { FILTRO_COMPRA, FILTRO_DEUDA, esTipoMail } from "@/types/mailing";
import type { FiltrosMailing } from "@/types/mailing";

export const runtime = "nodejs";

function texto(valor: unknown, maximo = 200): string {
  return typeof valor === "string" ? valor.slice(0, maximo) : "";
}

function validarFiltros(valor: unknown): FiltrosMailing {
  const datos = (valor ?? {}) as Record<string, unknown>;
  return {
    busqueda: texto(datos.busqueda),
    rubro: texto(datos.rubro),
    provincia: texto(datos.provincia),
    grupoVendedor: texto(datos.grupoVendedor),
    deuda: typeof datos.deuda === "string" && Object.hasOwn(FILTRO_DEUDA, datos.deuda) ? (datos.deuda as FiltrosMailing["deuda"]) : "todos",
    compra: typeof datos.compra === "string" && Object.hasOwn(FILTRO_COMPRA, datos.compra) ? (datos.compra as FiltrosMailing["compra"]) : "todas",
    clasificaciones: Array.isArray(datos.clasificaciones)
      ? datos.clasificaciones.filter((c): c is string => typeof c === "string").slice(0, 10)
      : [],
    excluirBloqueados: datos.excluirBloqueados !== false,
  };
}

/** POST /api/mailing/bases — guarda los filtros y los excluidos con un nombre. */
export const POST = async (request: Request) => {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const nombre = texto(cuerpo.nombre, 80).trim();
  if (!nombre) return NextResponse.json({ error: "Poné un nombre para la base." }, { status: 400 });
  if (!esTipoMail(cuerpo.tipo)) return NextResponse.json({ error: "Tipo de mail desconocido" }, { status: 400 });
  const excluidos = Array.isArray(cuerpo.excluidos)
    ? cuerpo.excluidos.filter((id): id is string => typeof id === "string").slice(0, 20_000)
    : [];
  const base = await guardarBase({
    nombre,
    tipo: cuerpo.tipo,
    filtros: validarFiltros(cuerpo.filtros),
    excluidos,
    cantidad: typeof cuerpo.cantidad === "number" ? cuerpo.cantidad : 0,
  });
  return NextResponse.json({ base });
};
