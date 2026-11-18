"use client";

import type { ReactNode } from "react";
import { Icono } from "@/components/ui/Icono";
import { useToast } from "@/components/ui/Toast";

/** Piezas comunes del CRM de cuentas clave: campos, tablas, paneles y badges. */

export const campoUsuario =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Tabla densa: encabezado chico, filas con borde fino y numeros alineados a la derecha con `.num`. */
export const tablaUsuario =
  "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-slate-500 [&_th]:uppercase [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100 [&_.num]:text-right [&_.num]:tabular-nums [&_.num]:whitespace-nowrap";

export function PanelUsuario({ titulo, detalle, acciones, children }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
          {detalle ? <p className="mt-0.5 text-xs text-slate-500">{detalle}</p> : null}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export type TonoBadge = "verde" | "rojo" | "azul" | "ambar" | "neutro";
const TONOS: Record<TonoBadge, string> = {
  verde: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rojo: "bg-red-50 text-red-700 ring-red-200",
  azul: "bg-blue-50 text-blue-800 ring-blue-200",
  ambar: "bg-amber-50 text-amber-800 ring-amber-200",
  neutro: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function BadgeUsuario({ children, tono = "neutro" }: { children: ReactNode; tono?: TonoBadge }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONOS[tono]}`}>
      {children}
    </span>
  );
}

export function VacioUsuario({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

/** Copia un dato (mail, telefono, CUIT) al portapapeles con un click. */
export function CopiarDato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const { mostrar } = useToast();
  if (!valor) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          mostrar(`${etiqueta} copiado.`, "exito");
        } catch {
          mostrar("No se pudo copiar al portapapeles.", "error");
        }
      }}
      aria-label={`Copiar ${etiqueta.toLowerCase()}: ${valor}`}
      title={`Copiar ${etiqueta.toLowerCase()}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
    >
      <Icono nombre="copiar" className="size-3.5" />
    </button>
  );
}
