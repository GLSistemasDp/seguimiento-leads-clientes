import Link from "next/link";
import type { ReactNode } from "react";
import { FILTRO_TRIAJE, TRIAJES, type DatosTriaje, type Tono, type Triaje } from "@/lib/seguimiento/indicadores";
import { textoDiasHabiles } from "@/lib/utils/dias-habiles";

/**
 * Tarjetas de triaje: un dato por tarjeta, sin graficos. El numero toma el
 * color del semaforo para leerse de un vistazo. Cada tarjeta es un filtro de
 * la tabla (tocarla de nuevo lo saca).
 */

/** Color del numero segun el estado (mismos tonos del semaforo de la relacion). */
export const COLOR_TONO: Record<Tono, string> = {
  verde: "text-green-600",
  ambar: "text-amber-600",
  rojo: "text-red-600",
};

const PUNTO = { rojo: "bg-red-600", ambar: "bg-amber-500" } as const;

const decimal = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "4,2" con un decimal, como se escribe en Argentina. */
export function formatearDias(dias: number): string {
  return decimal.format(dias);
}

/** "+18 vs. semana pasada": rojo si la cola crecio, verde si bajo. */
function Variacion({ actual, anterior }: { actual: number; anterior: number | null }) {
  if (anterior === null) return null;
  const diferencia = actual - anterior;
  if (diferencia === 0) return <span className="block text-slate-500">Igual que la semana pasada</span>;
  return (
    <span className={`block font-medium tabular-nums ${diferencia > 0 ? "text-red-600" : "text-green-600"}`}>
      {diferencia > 0 ? "+" : "−"}
      {Math.abs(diferencia)} vs. semana pasada
      <span className="font-normal text-slate-400"> ({anterior})</span>
    </span>
  );
}

function Tarjeta({
  triaje,
  activa,
  href,
  tono,
  valor,
  unidad,
  contexto,
  ayuda,
}: {
  triaje: Triaje;
  activa: boolean;
  href: string;
  tono: Tono;
  /** null = no hay nada pendiente: se muestra "Al día". */
  valor: string | null;
  unidad?: string;
  contexto: ReactNode;
  ayuda: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={activa}
      title={activa ? "Quitar el filtro" : ayuda}
      className={`group flex h-full min-h-36 min-w-0 flex-col rounded-2xl border bg-white px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
        activa ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{TRIAJES[triaje]}</span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            activa ? "bg-slate-900 text-white" : "text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-900"
          }`}
        >
          {activa ? "Filtrando · quitar ✕" : "Filtrar →"}
        </span>
      </span>
      <span className={`mt-3 flex items-baseline gap-1.5 font-bold tracking-tight tabular-nums ${COLOR_TONO[valor === null ? "verde" : tono]}`}>
        <span className="text-[44px] leading-none">{valor ?? "Al día"}</span>
        {valor !== null && unidad ? <span className="text-lg leading-none font-semibold">{unidad}</span> : null}
      </span>
      <span className="mt-auto pt-3 text-xs text-slate-500">{contexto}</span>
    </Link>
  );
}

function Punto({ tono }: { tono: keyof typeof PUNTO }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${PUNTO[tono]}`} />;
}

export function TriajeSeguimiento({
  datos,
  activo,
  enlaces,
}: {
  datos: DatosTriaje;
  activo: Triaje | null;
  /** Link de cada tarjeta (activa = el que quita el filtro). */
  enlaces: Record<Triaje, string>;
}) {
  const { pendientes, demora, riesgo } = datos;
  return (
    <section aria-label="Triaje del seguimiento" className="grid gap-4 md:grid-cols-3">
      <Tarjeta
        triaje="pendientes"
        activa={activo === "pendientes"}
        href={enlaces.pendientes}
        tono={pendientes.tono}
        valor={pendientes.cantidad === 0 ? null : String(pendientes.cantidad)}
        contexto={
          <>
            <Variacion actual={pendientes.cantidad} anterior={pendientes.semanaPasada} />
            <span className="block">
              {pendientes.cantidad === 0
                ? "No hay consultas sin responder."
                : pendientes.masAntigua === null
                  ? "Sin fecha de la más antigua"
                  : pendientes.masAntigua === 0
                    ? "La más antigua: de hoy"
                    : `La más antigua: hace ${textoDiasHabiles(pendientes.masAntigua)}`}
            </span>
          </>
        }
        ayuda={`Ver solo ${FILTRO_TRIAJE.pendientes}`}
      />
      <Tarjeta
        triaje="demora"
        activa={activo === "demora"}
        href={enlaces.demora}
        tono={demora.tono}
        valor={pendientes.cantidad === 0 || demora.promedio === null ? null : formatearDias(demora.promedio)}
        unidad={demora.promedio !== null && formatearDias(demora.promedio) === "1,0" ? "día hábil" : "días hábiles"}
        contexto={
          pendientes.cantidad === 0 ? (
            "Ninguna consulta esperando respuesta."
          ) : (
            <>
              <span className="tabular-nums">{demora.tramos.map((tramo) => `${tramo.etiqueta}: ${tramo.cantidad}`).join(" · ")}</span>
              <span className="block text-slate-400">días hábiles sin respuesta, por tramo</span>
            </>
          )
        }
        ayuda={`Ver solo ${FILTRO_TRIAJE.demora} (${demora.demoradas})`}
      />
      <Tarjeta
        triaje="riesgo"
        activa={activo === "riesgo"}
        href={enlaces.riesgo}
        tono={riesgo.tono}
        valor={riesgo.cantidad === 0 ? null : String(riesgo.cantidad)}
        contexto={
          riesgo.cantidad === 0 ? (
            "Ninguna pendiente en riesgo ni regular."
          ) : (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums">
              <Punto tono="rojo" /> {riesgo.enRiesgo} en riesgo
              <span aria-hidden className="text-slate-300">·</span>
              <Punto tono="ambar" /> {riesgo.regular} regular
            </span>
          )
        }
        ayuda={`Ver solo ${FILTRO_TRIAJE.riesgo}`}
      />
    </section>
  );
}
