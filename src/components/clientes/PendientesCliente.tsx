"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalFinalizar, type CierreConsulta, type ConsultaACerrar } from "@/components/seguimiento/ModalFinalizar";
import { RecomendacionRespuesta } from "@/components/seguimiento/RecomendacionRespuesta";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";
import { DEMORA } from "@/lib/seguimiento/indicadores";
import { guardarConsulta } from "@/lib/seguimiento/guardar-consulta";
import type { CierreFrecuente } from "@/lib/seguimiento/presentacion";
import type { RespuestaTipo } from "@/lib/seguimiento/respuestas";
import { textoHorasHabiles } from "@/lib/utils/dias-habiles";
import { formatearDiaCorto, formatearHora } from "@/lib/utils/dates";

/** Una consulta sin resolver del cliente, lista para mostrarse y cerrarse desde la ficha. */
export type PendienteFicha = ConsultaACerrar & {
  tentativoRespuesta: string;
  /** Horas habiles sin respuesta. */
  horasHabiles: number | null;
  /** Situacion / estado de cuenta, para la respuesta sugerida. */
  estadoCuenta: string;
  confianza?: number | null;
};

/**
 * Banner de la ficha del cliente: lo que el cliente espera que le
 * respondan, antes que cualquier otro dato. Cada consulta trae la demora en
 * horas habiles, la respuesta sugerida (la misma de la tabla) y la casilla
 * "Resuelto", que abre el mismo cierre que el seguimiento.
 */
export function PendientesCliente({
  pendientes,
  atajo,
  catalogo,
}: {
  pendientes: readonly PendienteFicha[];
  atajo: CierreFrecuente;
  catalogo?: readonly RespuestaTipo[];
}) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [, startTransition] = useTransition();
  const [finalizando, setFinalizando] = useState<PendienteFicha | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [cerradas, setCerradas] = useState<ReadonlySet<string>>(new Set());

  const visibles = pendientes.filter((pendiente) => !cerradas.has(pendiente.id));
  if (visibles.length === 0) return null;
  const demorada = visibles.some((pendiente) => (pendiente.horasHabiles ?? 0) > DEMORA.rojo);

  async function finalizar(pendiente: PendienteFicha, cierre: CierreConsulta) {
    setFinalizando(null);
    setGuardando(pendiente.id);
    const error = await guardarConsulta(pendiente.id, { respondida: true, ...cierre });
    setGuardando(null);
    if (error) {
      mostrar(`No se pudo cerrar la consulta: ${error}`, "error");
      return;
    }
    mostrar("Consulta resuelta: pasó al historial del cliente.", "exito");
    setCerradas((previas) => new Set(previas).add(pendiente.id));
    startTransition(() => router.refresh());
  }

  return (
    <section
      aria-label="Consultas sin resolver"
      className={`rounded-2xl border-2 bg-white p-5 ${demorada ? "border-red-300" : "border-amber-300"}`}
    >
      <h2 className={`flex items-center gap-2 text-sm font-semibold ${demorada ? "text-red-700" : "text-amber-800"}`}>
        <Icono nombre="alerta" className="size-4" />
        {visibles.length === 1 ? "1 consulta sin resolver" : `${visibles.length} consultas sin resolver`}
        <span className="font-normal text-slate-500">· el cliente está esperando respuesta</span>
      </h2>

      <ul className="mt-3 flex flex-col divide-y divide-slate-100">
        {visibles.map((pendiente) => {
          const vencida = (pendiente.horasHabiles ?? 0) > DEMORA.rojo;
          const hora = formatearHora(pendiente.fecha);
          return (
            <li key={pendiente.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-slate-600 tabular-nums">
                    {formatearDiaCorto(pendiente.fecha)}
                    {hora !== "00:00 hs" ? <span className="font-normal text-slate-400"> · {hora}</span> : null}
                  </span>
                  {pendiente.hito ? (
                    <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 ring-inset">
                      {pendiente.hito}
                    </span>
                  ) : null}
                  {pendiente.horasHabiles !== null ? (
                    <span
                      title="Horas hábiles sin respuesta (lunes a viernes de 8 a 17 h, sin feriados)"
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset tabular-nums ${
                        vencida ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200"
                      }`}
                    >
                      Demora: {textoHorasHabiles(pendiente.horasHabiles)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-800">{pendiente.consulta}</p>
                <RecomendacionRespuesta
                  consulta={pendiente}
                  relacion={pendiente.relacion.relacion}
                  horasHabiles={pendiente.horasHabiles}
                  estadoCuenta={pendiente.estadoCuenta}
                  confianza={pendiente.confianza}
                  catalogo={catalogo}
                />
              </div>
              <label className="flex items-center gap-2 self-start text-sm text-slate-700 sm:flex-col sm:gap-1 sm:text-xs">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={guardando === pendiente.id}
                  onChange={() => setFinalizando(pendiente)}
                  aria-label={`Marcar como resuelta la consulta del ${formatearDiaCorto(pendiente.fecha)}`}
                  className="size-4 cursor-pointer rounded accent-slate-900 disabled:cursor-wait"
                />
                Resuelto
              </label>
            </li>
          );
        })}
      </ul>

      <ModalFinalizar consulta={finalizando} atajo={atajo} onCancelar={() => setFinalizando(null)} onFinalizar={finalizar} />
    </section>
  );
}
