import { NextResponse } from "next/server";
import { porConsulta } from "@/lib/db/historial";
import { finalizarVarias, getAll } from "@/lib/db/seguimiento";
import {
  RESULTADO_CIERRE_MASIVO,
  inicioDelMes,
  observacionCierreMasivo,
  pendientesAnteriores,
} from "@/lib/seguimiento/cierre-masivo";
import { relacionActual } from "@/lib/seguimiento/relacion";

export const runtime = "nodejs";
// Con muchas consultas viejas la escritura en bloque puede tardar unos segundos.
export const maxDuration = 300;

/**
 * POST /api/seguimiento/cierre-masivo — da por finalizadas todas las consultas
 * pendientes de meses anteriores al actual (hora de Argentina).
 *
 * Cuerpo: { corte: "<ISO del inicio del mes>" }. Tiene que ser el inicio del
 * mes en curso: si el mes cambio entre que se abrio la pantalla y se confirmo,
 * se rechaza para no cerrar algo distinto de lo que se mostro.
 *
 * Cada una queda "Resuelto" con la relacion que ya tenia asignada (IA o
 * reglas) y la observacion "Cierre masivo: consulta anterior a <mes>".
 */
export const POST = async (request: Request) => {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const ahora = new Date();
  const corte = inicioDelMes(ahora);
  const pedido = (cuerpo as { corte?: unknown } | null)?.corte;
  if (typeof pedido !== "string" || new Date(pedido).getTime() !== corte.getTime()) {
    return NextResponse.json(
      { error: "Cambió el mes desde que abriste la pantalla. Recargá y volvé a intentar." },
      { status: 409 },
    );
  }

  try {
    const [consultas, historial] = await Promise.all([getAll(), porConsulta()]);
    const viejas = pendientesAnteriores(consultas, corte, ahora);
    const cerradas = await finalizarVarias(
      viejas.map((consulta) => ({
        consulta,
        relacion: relacionActual(
          consulta,
          (historial[consulta.id] ?? []).findLast((evento) => evento.tipo === "finalizada") ?? null,
        ).relacion,
      })),
      RESULTADO_CIERRE_MASIVO,
      observacionCierreMasivo(corte),
    );
    return NextResponse.json({ cerradas });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo hacer el cierre masivo" },
      { status: 500 },
    );
  }
};
